// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// "Conectar conta" das redes: autoriza uma vez (tudo local: loopback em 127.0.0.1 ou código do device flow)
// e o CastDeck passa a criar/renovar a live e a preencher a chave sozinho.
import { $, esc, icons, modal, toast, api, copyText } from './ui.js';

// onde o usuário cria o app de cada plataforma (feito uma única vez por dono do estúdio)
export const APP_HELP = {
  youtube: {
    label: 'Google / YouTube',
    url: 'https://console.cloud.google.com/apis/credentials',
    steps: [
      'Crie um projeto (ou use um existente) no Google Cloud Console.',
      'Ative a “YouTube Data API v3” em APIs e Serviços → Biblioteca.',
      'Em Credenciais, crie um “ID do cliente OAuth” do tipo “App para computador”.',
      'Cole abaixo o Client ID e o Client Secret. O CastDeck guarda cifrado só neste PC.',
    ],
  },
  twitch: {
    label: 'Twitch',
    url: 'https://dev.twitch.tv/console/apps',
    steps: [
      'Em dev.twitch.tv/console/apps, clique em “Registrar aplicativo”.',
      'Coloque qualquer nome (ex.: CastDeck) e escolha a categoria “Broadcasting Suite”.',
      'Em “Tipo de cliente” escolha “Public” e salve.',
      'Copie o Client ID e cole abaixo (a Twitch não precisa de segredo para este fluxo).',
    ],
  },
  kick: {
    label: 'Kick',
    url: 'https://dev.kick.com',
    steps: [
      'Crie um app no Kick Developer (OAuth 2.1).',
      'No app, cadastre o redirect “http://127.0.0.1” (o CastDeck abre uma porta local).',
      'Copie o Client ID (e o segredo, se o app for confidencial) e cole abaixo.',
    ],
  },
  facebook: {
    label: 'Facebook / Instagram',
    url: 'https://developers.facebook.com/apps/',
    steps: [
      'Crie um app do tipo “Empresa” no Meta for Developers.',
      'Ative o “Login do Facebook para Dispositivos” e a permissão “publish_video”.',
      'Cole abaixo o App ID e o App Secret.',
      'A Meta exige revisão do app para uso público; com sua conta de teste já funciona.',
    ],
  },
};

const T = (s) => window.CDi18n?.t(s) ?? s;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function providerList() {
  try {
    const r = await api('/connections');
    return r?.providers || [];
  } catch {
    return [];
  }
}

// Aguarda a conexão terminar (o servidor responde `connected` ou um erro em /authorize).
async function waitConnection(provider, onTick, timeoutMs = 240000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    await sleep(1500);
    const list = await providerList();
    const p = list.find((x) => x.id === provider);
    if (p?.connected) return { ok: true, account: p.account };
    let err = '';
    try {
      err = (await api(`/connections/${provider}/authorize`))?.error || '';
    } catch {}
    if (err) return { ok: false, error: err };
    onTick?.(Math.round((Date.now() - t0) / 1000));
  }
  return { ok: false, error: 'Tempo esgotado esperando a autorização.' };
}

// Modal de conexão de UMA plataforma. Resolve com `true` quando conectou.
export async function connectProvider(provider, { providers } = {}) {
  const list = providers || (await providerList());
  const info = list.find((p) => p.id === provider) || { id: provider, configured: false, connected: false };
  const help = APP_HELP[provider] || { label: provider, url: '', steps: [] };
  let device = null;
  let error = '';
  let stage = info.connected ? 'connected' : info.configured ? 'ready' : 'app';

  const body = () => {
    const acc = info.account || '';
    if (stage === 'waiting') {
      if (device) {
        return `<div class="conn-wait">
          <p>${T('Abra o site e digite este código:')}</p>
          <button class="conn-code" id="conn-code" title="${T('Copiar código')}">${esc(device.userCode)}</button>
          <a class="btn primary" href="${esc(device.verificationUri)}" target="_blank" rel="noopener">${T('Abrir a página da plataforma')} ↗</a>
          <p class="hint">${T('Estamos esperando você confirmar… esta janela fecha sozinha.')}</p>
        </div>`;
      }
      return `<div class="conn-wait">
        <p>${T('O navegador abriu a página de autorização. Entre com a conta que vai transmitir.')}</p>
        <p class="hint">${T('Se a janela não abriu, use “Abrir de novo”. Depois é só voltar: o CastDeck continua aqui.')}</p>
        <button class="btn" id="conn-reopen">${T('Abrir de novo')}</button>
      </div>`;
    }
    if (stage === 'connected') {
      return `<div class="conn-done"><div class="conn-ok">✓</div>
        <p><b>${esc(acc || T('Conta conectada'))}</b></p>
        <p class="hint">${T('O CastDeck cria a live e renova a chave sozinho antes de cada transmissão.')}</p>
        <div class="row" style="justify-content:center;gap:8px">
          <button class="btn primary" data-conn-done>${T('Usar esta conta')}</button>
          <button class="btn ghost" id="conn-off">${T('Desconectar')}</button>
        </div></div>`;
    }
    if (stage === 'app') {
      return `<p class="sub">${T('Primeira vez: crie o app do CastDeck (só uma vez) e cole os dados abaixo.')}</p>
        <ol class="kh-steps">${help.steps.map((s) => `<li>${esc(T(s))}</li>`).join('')}</ol>
        ${help.url ? `<p class="hint"><a href="${esc(help.url)}" target="_blank" rel="noopener">${esc(help.url)} ↗</a></p>` : ''}
        <label class="field"><span>Client ID</span><input class="input" id="conn-id" autocomplete="off" spellcheck="false"></label>
        ${info.needsSecret ? `<label class="field"><span>Client Secret</span><input class="input" id="conn-secret" type="password" autocomplete="off"></label>` : ''}
        <div class="modal-actions">
          <button class="btn" data-close>${T('Cancelar')}</button>
          <button class="btn primary" id="conn-save">${T('Salvar e conectar')}</button>
        </div>`;
    }
    // ready
    return `<div class="conn-ready"><p><b>${esc(help.label)}</b></p>
      <p class="hint">${T('Você autoriza no site da plataforma e volta: o CastDeck não vê sua senha.')}</p>
      <button class="btn primary" id="conn-go">${T('Conectar')} ${esc(help.label)}</button>
      <button class="btn ghost sm" id="conn-app" style="margin-top:10px">${T('Trocar os dados do app')}</button></div>`;
  };

  const res = await modal(
    `<h3>${T('Conectar')} ${esc(help.label)}</h3><div id="conn-body">${body()}</div>${error ? `<p class="hint" style="color:hsl(354 90% 72%)">${esc(error)}</p>` : ''}`,
    {
      onMount(m, close) {
        const draw = () => {
          $('#conn-body', m).innerHTML = body();
          bind();
        };
        const bind = () => {
          $('#conn-code', m)?.addEventListener('click', async () => {
            await copyText(device.userCode);
            toast(T('Código copiado'), 'ok');
          });
          $('#conn-reopen', m)?.addEventListener('click', () => window.open(device?.verificationUri || help.url, '_blank', 'noopener'));
          $('#conn-off', m)?.addEventListener('click', async () => {
            try {
              await api(`/connections/${provider}`, { method: 'DELETE' });
              toast(T('Conta desconectada'), 'ok');
              close(false);
            } catch (e) {
              toast(e.message, 'err');
            }
          });
          m.querySelector('[data-conn-done]')?.addEventListener('click', () => close(true));
          $('#conn-app', m)?.addEventListener('click', () => {
            stage = 'app';
            draw();
          });
          $('#conn-save', m)?.addEventListener('click', async () => {
            const clientId = $('#conn-id', m).value.trim();
            const clientSecret = $('#conn-secret', m)?.value.trim() || '';
            if (!clientId) return toast(T('Cole o Client ID'), 'err');
            try {
              await api(`/connections/${provider}/client`, { method: 'POST', body: { clientId, clientSecret } });
              stage = 'ready';
              draw();
            } catch (e) {
              toast(e.message, 'err');
            }
          });
          $('#conn-go', m)?.addEventListener('click', start);
        };
        const start = async () => {
          stage = 'waiting';
          device = null;
          error = '';
          draw();
          try {
            const r = await api(`/connections/${provider}/authorize`, { method: 'POST', body: {} });
            device = r?.device || null;
            if (device) draw();
            const out = await waitConnection(provider);
            if (!out.ok) {
              error = out.error || T('Não foi possível conectar.');
              stage = info.configured ? 'ready' : 'app';
              draw();
              return;
            }
            info.connected = true;
            info.account = out.account;
            stage = 'connected';
            draw();
          } catch (e) {
            error = e.message || T('Não foi possível conectar.');
            stage = 'ready';
            draw();
          }
        };
        bind();
        // se a conta já estava conectada, deixa concluir direto
        if (stage === 'connected') m.querySelector('[data-conn-done]')?.focus();
      },
    },
  );
  return res === true;
}

// Uma linha compacta "conectado como X" para usar no card do destino.
export async function connectionBadge(provider) {
  const list = await providerList();
  const p = list.find((x) => x.id === provider);
  if (!p) return { connected: false, text: '' };
  return { connected: !!p.connected, text: p.connected ? p.account || T('Conectado') : '', configured: !!p.configured };
}

export { icons };
