// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// "Conectar conta": une o cofre de segredos, o OAuth local e os adaptadores das plataformas.
//
// O que ele faz: autorizar a conta (uma vez), criar/renovar a live antes de transmitir e ligar o chat.
// Tudo no PC do usuário; a única conversa externa é com a própria plataforma.
import { PROVIDERS, ensureFreshToken } from './platforms.js';

const FAKE = () => process.env.CASTDECK_FAKE_PLATFORMS === '1';

export class Connections {
  constructor({ secrets, store, openBrowser, log = console }) {
    this.secrets = secrets;
    this.store = store;
    this.openBrowser = openBrowser;
    this.log = log;
    this.pending = new Map(); // provider -> { controller, promise } (para o "aguardando confirmação")
  }

  providerInfo() {
    const clients = this.secrets.listClients();
    const conns = this.secrets.listSafe();
    return Object.values(PROVIDERS).map((p) => ({
      id: p.id,
      label: p.label,
      flow: p.flow,
      needsSecret: !!p.needsSecret,
      note: p.note || '',
      configured: p.flow === 'manual' ? true : FAKE() ? true : !!(clients[p.id]?.configured),
      hasSecret: !!(clients[p.id]?.hasSecret),
      connected: !!conns[p.id],
      account: conns[p.id]?.name || '',
      connectedAt: conns[p.id]?.connectedAt || 0,
    }));
  }

  setClient(provider, data) {
    if (!PROVIDERS[provider] || provider === 'instagram') throw new Error('Plataforma sem app configurável.');
    return this.secrets.setClient(provider, data);
  }

  // Inicia a autorização. Devolve o "device" quando o fluxo é por código; senão abre o navegador e espera.
  async connect(provider, { openBrowser = true } = {}) {
    const p = PROVIDERS[provider];
    if (!p) throw new Error('Plataforma desconhecida.');
    if (p.flow === 'manual') throw new Error(p.note || 'Esta plataforma não tem conexão por conta.');
    // modo de teste (harness/CI): não chama a plataforma, devolve uma conta falsa na hora
    if (FAKE()) {
      const saved = this.secrets.setConnection(provider, {
        access_token: 'fake-token',
        accountId: `qa-${provider}`,
        name: `QA ${p.label}`,
        login: `qa_${provider}`,
        pageId: provider === 'facebook' ? 'qa-page' : undefined,
        pageToken: provider === 'facebook' ? 'fake-page-token' : undefined,
        connectedAt: Date.now(),
        expiresAt: Date.now() + 3600_000,
        scopes: p.scopes.join(' '),
      });
      const device = p.flow === 'device' ? { userCode: 'QA12-TEST', verificationUri: 'https://example.com/device', expiresIn: 300 } : null;
      return { provider, device, done: Promise.resolve(saved) };
    }
    const client = this.secrets.getClient(provider) || {};
    let device = null;
    let resolveDevice;
    const devicePromise = new Promise((r) => (resolveDevice = r));
    const ctx = {
      client,
      openBrowser: openBrowser ? (url) => this.openBrowser?.(url) : () => {},
      onDevice: (d) => {
        device = d;
        resolveDevice(d);
      },
    };
    const run = (async () => {
      const conn = await p.connect(ctx, this.store);
      const saved = this.secrets.setConnection(provider, {
        ...conn,
        connectedAt: Date.now(),
        expiresAt: conn.expires_in ? Date.now() + Number(conn.expires_in) * 1000 : 0,
        scopes: conn.scope || p.scopes.join(' '),
      });
      return saved;
    })();
    // se em 1,2 s não houver device code, é fluxo de navegador (loopback)
    await Promise.race([devicePromise, new Promise((r) => setTimeout(() => r(null), 1200))]);
    return { provider, device, done: run };
  }

  async disconnect(provider) {
    const p = PROVIDERS[provider];
    const had = this.secrets.removeConnection(provider);
    // algumas plataformas têm endpoint de revogação
    if (provider === 'twitch') {
      const conn = this.secrets.getConnection(provider);
      const client = this.secrets.getClient(provider) || {};
      if (conn?.access_token && client.clientId) {
        try {
          await fetch('https://id.twitch.tv/oauth2/revoke', {
            method: 'POST',
            body: new URLSearchParams({ client_id: client.clientId, token: conn.access_token }),
          });
        } catch {}
      }
    }
    return had || !!p;
  }

  async tokenFor(provider) {
    const p = PROVIDERS[provider];
    if (!p) return null;
    const conn = this.secrets.getConnection(provider);
    if (!conn?.access_token) return null;
    const client = this.secrets.getClient(provider) || {};
    const fresh = await ensureFreshToken(provider, conn, client, this.secrets);
    return { ...fresh, clientId: client.clientId, clientSecret: client.clientSecret };
  }

  // Cria/renova a live do destino conectado e devolve { url, key, ephemeral, chat }
  async prepareLive(dest, { title = '', studioName = '' } = {}) {
    const provider = dest?.platform;
    const p = PROVIDERS[provider];
    if (!p || p.flow === 'manual') return null;
    if (FAKE()) {
      // harness: chave falsa mas com o caminho real do destino (url/key/chat) para testar a UI
      const chat =
        provider === 'twitch'
          ? { kind: 'twitch', target: 'qa_canal' }
          : provider === 'youtube'
            ? { kind: 'youtube', target: 'qaVideoId' }
            : { kind: provider, target: 'qa' };
      return { url: `rtmp://127.0.0.1:1935/qa-${dest.id}`, key: 'qa-fake-key', ephemeral: provider === 'facebook', liveRef: 'qa-ref', chat };
    }
    const tok = await this.tokenFor(provider);
    if (!tok) {
      const err = new Error('Conta não conectada para este destino.');
      err.code = 'not-connected';
      throw err;
    }
    const ctx = {
      token: tok.access_token,
      access_token: tok.access_token,
      clientId: tok.clientId,
      clientSecret: tok.clientSecret,
      accountId: tok.accountId,
      login: tok.login || '',
      pageId: tok.pageId,
      pageToken: tok.pageToken,
      liveRef: dest.liveRef || '',
      title: title || `CastDeck · ${studioName || 'Live'}`,
    };
    const out = await p.prepare(ctx);
    return { ...out, ctx };
  }

  // Liga o chat daquela live no agregador (quando a plataforma permite)
  chatSourceFor(provider, chat) {
    if (!chat) return null;
    if (chat.kind === 'twitch' && chat.target) return { type: 'twitch', target: chat.target };
    if (chat.kind === 'youtube' && chat.target) return { type: 'youtube', target: chat.target };
    return null; // Kick/Facebook/Instagram/TikTok: Social Stream Ninja
  }
}
