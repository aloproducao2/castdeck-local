// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Adaptadores das plataformas para o "Conectar conta" (OAuth) e para criar/renovar a live automaticamente.
//
// Cada provedor expõe: connect() (fluxo de autorização), prepare() (cria a live e devolve url+chave),
// end() (encerra a live) e chatInfo() (o que dá para ligar no chat do CastDeck).
// Internet só é usada aqui, falando direto com a plataforma — nada passa por servidor do CastDeck.
import { authUrl, exchangeCode, getJson, pkcePair, postForm, randomState, refreshToken, startDeviceFlow, startLoopback } from './oauth.js';

const GOOGLE = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  scopes: ['https://www.googleapis.com/auth/youtube.force-ssl'],
};
const TWITCH = {
  device: 'https://id.twitch.tv/oauth2/device',
  token: 'https://id.twitch.tv/oauth2/token',
  revoke: 'https://id.twitch.tv/oauth2/revoke',
  scopes: ['channel:read:stream_key', 'user:read:email'],
};
const KICK = {
  authorize: 'https://id.kick.com/oauth/authorize',
  token: 'https://id.kick.com/oauth/token',
  scopes: ['streamkey:read', 'user:read'],
};
const GRAPH = 'https://graph.facebook.com/v21.0';

export const PROVIDERS = {
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    flow: 'loopback',
    needsSecret: true,
    scopes: GOOGLE.scopes,
    async connect(ctx) {
      const { clientId, clientSecret } = ctx.client;
      if (!clientId) throw new Error('Configure o app do YouTube (client id) antes de conectar.');
      const loop = startLoopback();
      const { port, redirectUri } = await loop.ready;
      const { verifier, challenge } = pkcePair();
      const state = loop.state || randomState();
      const url = authUrl('youtube', {
        endpoint: GOOGLE.authorize,
        clientId,
        redirectUri,
        scope: GOOGLE.scopes.join(' '),
        state,
        challenge,
        extra: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
      });
      ctx.openBrowser?.(url);
      const res = await loop.wait(ctx.timeoutMs || 240000);
      loop.close();
      if (res.error) throw new Error(res.error === 'timeout' ? 'Tempo esgotado esperando a autorização.' : res.error);
      if (!res.code) throw new Error('Não recebemos a autorização do Google.');
      if (res.state !== state) throw new Error('Autorização inválida (state diferente). Tente de novo.');
      const tok = await exchangeCode({ tokenEndpoint: GOOGLE.token, clientId, clientSecret, code: res.code, redirectUri, verifier });
      const ch = await getJson('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { Authorization: `Bearer ${tok.access_token}` });
      const channel = ch.json?.items?.[0];
      return {
        ...tok,
        accountId: channel?.id || '',
        name: channel?.snippet?.title || 'Conta do YouTube',
        scope: GOOGLE.scopes.join(' '),
      };
    },
    async prepare(ctx) {
      const { token, clientId, clientSecret } = ctx;
      if (!clientId) throw new Error('App do YouTube não configurado.');
      const ln = await getJson('https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,contentDetails,status&mine=true', { Authorization: `Bearer ${token}` });
      let stream = ln.json?.items?.find((s) => s.status?.streamStatus === 'active' || s.status?.streamStatus === 'ready');
      if (!stream) {
        const body = {
          snippet: { title: `CastDeck · ${ctx.title || 'Live'}` },
          cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' },
          contentDetails: { isReusable: true },
        };
        const r = await fetch('https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,contentDetails,status', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error?.message || `Falha ao criar o stream (HTTP ${r.status}).`);
        stream = j;
      }
      const addr = stream?.cdn?.ingestionInfo?.ingestionAddress || '';
      const key = stream?.cdn?.ingestionInfo?.streamName || '';
      if (!addr || !key) throw new Error('O YouTube não devolveu a URL/chave de ingestão.');
      return {
        url: addr,
        key,
        ephemeral: false,
        liveRef: JSON.stringify({ streamId: stream.id }),
        chat: { kind: 'youtube', target: '' },
      };
    },
    async end(ctx) {
      // stream é reutilizável; nada a encerrar no YouTube além da própria live
      return true;
    },
  },

  twitch: {
    id: 'twitch',
    label: 'Twitch',
    flow: 'device',
    needsSecret: false,
    scopes: TWITCH.scopes,
    async connect(ctx) {
      const { clientId } = ctx.client;
      if (!clientId) throw new Error('Configure o app da Twitch (client id) antes de conectar.');
      const dev = await startDeviceFlow({
        provider: 'twitch',
        clientId,
        scope: TWITCH.scopes.join(' '),
        deviceEndpoint: TWITCH.device,
        tokenEndpoint: TWITCH.token,
        clientSecret: ctx.client.clientSecret || '',
      });
      ctx.onDevice?.({ userCode: dev.userCode, verificationUri: dev.verificationUri, expiresIn: dev.expiresIn });
      const tok = await dev.wait();
      const me = await getJson('https://api.twitch.tv/helix/users', { 'Client-Id': clientId, Authorization: `Bearer ${tok.access_token}` });
      const user = me.json?.data?.[0];
      return {
        ...tok,
        accountId: user?.id || '',
        name: user?.display_name || user?.login || 'Conta da Twitch',
        login: user?.login || '',
        scope: TWITCH.scopes.join(' '),
      };
    },
    async prepare(ctx) {
      const { token, accountId, clientId } = ctx;
      if (!accountId) throw new Error('Twitch sem conta conectada.');
      const r = await getJson(`https://api.twitch.tv/helix/streams/key?broadcaster_id=${encodeURIComponent(accountId)}`, {
        'Client-Id': clientId,
        Authorization: `Bearer ${token}`,
      });
      const key = r.json?.data?.[0]?.stream_key || '';
      if (!key) throw new Error(r.json?.message || `A Twitch não devolveu a chave (HTTP ${r.status}).`);
      return { url: 'rtmp://live.twitch.tv/app', key, ephemeral: false, chat: { kind: 'twitch', target: ctx.login || '' } };
    },
    async end() {
      return true;
    },
  },

  kick: {
    id: 'kick',
    label: 'Kick',
    flow: 'loopback',
    needsSecret: false,
    scopes: KICK.scopes,
    async connect(ctx) {
      const { clientId, clientSecret } = ctx.client;
      if (!clientId) throw new Error('Configure o app da Kick (client id) antes de conectar.');
      const loop = startLoopback();
      const { redirectUri } = await loop.ready;
      const { verifier, challenge } = pkcePair();
      const state = loop.state || randomState();
      const url = authUrl('kick', {
        endpoint: KICK.authorize,
        clientId,
        redirectUri,
        scope: KICK.scopes.join(' '),
        state,
        challenge,
      });
      ctx.openBrowser?.(url);
      const res = await loop.wait(ctx.timeoutMs || 240000);
      loop.close();
      if (res.error) throw new Error(res.error === 'timeout' ? 'Tempo esgotado esperando a autorização.' : res.error);
      if (res.state !== state) throw new Error('Autorização inválida (state diferente). Tente de novo.');
      const tok = await exchangeCode({ tokenEndpoint: KICK.token, clientId, clientSecret, code: res.code, redirectUri, verifier });
      let name = 'Conta da Kick';
      let accountId = '';
      let slug = '';
      const me = await getJson('https://api.kick.com/public/v1/users', { Authorization: `Bearer ${tok.access_token}` });
      const u = me.json?.data?.[0] || me.json?.data || null;
      if (u) {
        name = u.name || u.username || name;
        slug = u.slug || u.username || '';
        accountId = String(u.user_id || u.id || '');
      }
      return { ...tok, accountId, name, login: slug, scope: KICK.scopes.join(' '), pendingKeyApi: true };
    },
    async prepare(ctx) {
      // a API pública da Kick expõe a chave em /public/v1/stream/key (confirmar na doc do app aprovado)
      const r = await getJson('https://api.kick.com/public/v1/stream/key', { Authorization: `Bearer ${ctx.token}` });
      const j = r.json || {};
      const url = j.data?.url || j.data?.stream_url || j.data?.ingest_url || '';
      const key = j.data?.key || j.data?.stream_key || '';
      if (!url || !key) {
        throw new Error('A Kick não devolveu a chave automaticamente. Cole a chave manualmente em Destinos.');
      }
      return { url, key, ephemeral: false, chat: { kind: 'kick', target: ctx.login || '' } };
    },
    async end() {
      return true;
    },
  },

  facebook: {
    id: 'facebook',
    label: 'Facebook',
    flow: 'device',
    needsSecret: true,
    scopes: ['publish_video', 'pages_show_list', 'pages_read_engagement', 'pages_manage_posts'],
    async connect(ctx) {
      const { clientId, clientSecret } = ctx.client;
      if (!clientId || !clientSecret) throw new Error('Configure o app do Facebook (id e segredo) antes de conectar.');
      const appToken = `${clientId}|${clientSecret}`;
      const start = await postForm(`${GRAPH}/device/login`, {
        access_token: appToken,
        scope: this.scopes.join(','),
      });
      if (!start.ok || !start.json?.code) throw new Error(start.json?.error?.message || `Falha ao iniciar o login do Facebook (HTTP ${start.status}).`);
      const dev = start.json;
      ctx.onDevice?.({
        userCode: dev.user_code,
        verificationUri: dev.verification_uri || 'https://facebook.com/device',
        expiresIn: Number(dev.expires_in) || 1800,
      });
      const deadline = Date.now() + (Number(dev.expires_in) || 1800) * 1000;
      const interval = Math.max(3, Number(dev.interval) || 5);
      let tok = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, interval * 1000));
        const st = await postForm(`${GRAPH}/device/login_status`, { access_token: appToken, code: dev.code });
        const body = st.json || {};
        if (st.ok && body.access_token) {
          tok = body;
          break;
        }
        if (body.error && !/authorization_pending|pending/i.test(String(body.error?.message || ''))) {
          throw new Error(body.error?.message || 'Login do Facebook não concluído.');
        }
      }
      if (!tok) throw new Error('Tempo esgotado esperando a confirmação no Facebook.');
      const pages = await getJson(`${GRAPH}/me/accounts?fields=id,name,access_token&limit=50`, { Authorization: `Bearer ${tok.access_token}` });
      const page = pages.json?.data?.[0] || null;
      if (!page) throw new Error('Nenhuma página do Facebook encontrada nesta conta (a live é feita em uma página).');
      return {
        ...tok,
        accountId: page.id,
        pageId: page.id,
        pageToken: page.access_token || '',
        name: page.name || 'Página do Facebook',
        scope: this.scopes.join(','),
      };
    },
    async prepare(ctx) {
      const pageToken = ctx.pageToken || ctx.token;
      const r = await postForm(`${GRAPH}/${encodeURIComponent(ctx.pageId)}/live_videos`, {
        status: 'LIVE_NOW',
        title: ctx.title || 'CastDeck',
        access_token: pageToken,
      });
      const j = r.json || {};
      const url = j.stream_url || j.secure_stream_url || '';
      const key = j.stream_key || '';
      if (!url) throw new Error(j.error?.message || `O Facebook não criou a live (HTTP ${r.status}).`);
      // stream_url do Facebook costuma vir completo (rtmps://…/chave); separa para o motor RTMP
      let finalUrl = url;
      let finalKey = key;
      if (!finalKey && /\/[^/]+$/.test(url)) {
        const i = url.lastIndexOf('/');
        finalUrl = url.slice(0, i);
        finalKey = url.slice(i + 1);
      }
      return { url: finalUrl, key: finalKey, ephemeral: true, liveRef: String(j.id || ''), chat: { kind: 'facebook', target: String(j.id || '') } };
    },
    async end(ctx) {
      const pageToken = ctx.pageToken || ctx.token;
      if (!ctx.liveRef) return false;
      const r = await postForm(`${GRAPH}/${encodeURIComponent(ctx.liveRef)}`, { end_live_video: 'true', access_token: pageToken });
      return r.ok;
    },
  },

  instagram: {
    id: 'instagram',
    label: 'Instagram',
    flow: 'manual',
    needsSecret: false,
    scopes: [],
    note: 'A chave do Instagram é por transmissão e não existe API aberta para criá-la. Use o caminho manual.',
  },
};

// Renova o token se estiver perto de expirar.
export async function ensureFreshToken(provider, conn, client, secrets) {
  const p = PROVIDERS[provider];
  if (!p || !conn?.access_token) return conn;
  const exp = Number(conn.expiresAt) || 0;
  if (!exp || exp - Date.now() > 120000) return conn;
  if (!conn.refreshToken) return conn;
  const endpoints = {
    youtube: GOOGLE.token,
    twitch: TWITCH.token,
    kick: KICK.token,
    facebook: GRAPH.replace('/v21.0', '') + '/oauth/access_token',
  };
  const tok = await refreshToken({
    tokenEndpoint: endpoints[provider] || '',
    clientId: client?.clientId || '',
    clientSecret: client?.clientSecret || '',
    refresh: conn.refreshToken,
  });
  if (!tok) return conn;
  const next = {
    ...conn,
    access_token: tok.access_token,
    refreshToken: tok.refresh_token || conn.refreshToken,
    expiresAt: tok.expires_in ? Date.now() + Number(tok.expires_in) * 1000 : conn.expiresAt,
  };
  secrets.setConnection(provider, next);
  return next;
}
