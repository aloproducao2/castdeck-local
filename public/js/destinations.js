// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Destinos RTMP (YouTube, Facebook, Twitch, Instagram, TikTok, RTMP próprio): janela de criar/editar,
// remover e ligar/desligar. Usado pelo painel inicial e de dentro do estúdio (sem sair da sala).
import { $, esc, toast, modal, confirmDialog, api, PLATFORMS, destFormat } from './ui.js';
import { KEY_HELP, guidePdf } from './dest-help.js';
import { connectProvider } from './connections.js';

const T = (s) => window.CDi18n?.t(s) ?? s;

// Plataformas em que a conta conectada cria a live e renova a chave sozinha.
export const CONNECTABLE = new Set(['youtube', 'twitch', 'kick', 'facebook']);

// Estado do destino, como o usuário vê: conectado / chave salva / falta chave / chave desta live.
export function destState(d) {
  if (!d) return { key: 'missing', label: '', cls: 'warn' };
  if (d.connectionId && CONNECTABLE.has(d.platform)) {
    return { key: 'connected', label: T('Conectado'), cls: 'ok' };
  }
  if (!d.hasKey && !d.key) return { key: 'missing', label: T('Falta a chave'), cls: 'warn' };
  if (d.ephemeral) {
    const old = Number(d.keyUpdatedAt) > 0 && Date.now() - Number(d.keyUpdatedAt) > 12 * 3600 * 1000;
    return old
      ? { key: 'expired', label: T('Chave desta live'), cls: 'warn' }
      : { key: 'ephemeral', label: T('Chave desta live'), cls: 'ok' };
  }
  return { key: 'key', label: T('Chave salva'), cls: 'ok' };
}

// Card de destino (dashboard e estúdio usam o mesmo desenho).
export function destCardHtml(d) {
  const st = destState(d);
  const p = PLATFORMS[d.platform] || { short: '⚡', label: d.platform };
  const chat = d.connectionId ? T('chat ligado') : d.platform === 'tiktok' || d.platform === 'instagram' || d.platform === 'kick' ? T('chat via SSN') : '';
  const platTxt = d.name && d.name.toLowerCase() === String(p.label).toLowerCase() ? '' : ` · ${esc(p.label)}`;
  return `<div class="dest-card" data-dest-card="${esc(d.id)}">
    <div class="dest-card-top">
      <span class="plat ${esc(d.platform)}">${esc(p.short)}</span>
      <div class="meta">
        <strong>${esc(d.name)}</strong>
        <span>${d.format === 'v' ? '9:16' : '16:9'}${platTxt}${chat ? ` · ${esc(chat)}` : ''}</span>
      </div>
      <span class="dest-chip ${st.cls}">${st.cls === 'ok' ? '●' : '!'} ${esc(st.label)}</span>
    </div>
    <div class="dest-card-acts">
      <button class="btn sm ghost" data-dest-edit title="${T('Nome, servidor, chave e conta')}">${T('Editar')}</button>
      ${st.key === 'missing' || st.key === 'expired' ? `<button class="btn sm" data-dest-key title="${T('Colar a chave de transmissão')}">${T('Colar chave')}</button>` : ''}
      ${d.connectionId ? `<button class="btn sm" data-dest-prepare title="${T('Criar/renovar a live agora')}">${T('Renovar agora')}</button>` : ''}
      <button class="btn sm ghost" data-dest-help>${T('Onde pego a chave?')}</button>
      <button class="btn sm ghost icon" data-dest-del title="${T('Remover destino')}">✕</button>
    </div>
  </div>`;
}

// Liga os botões de uma lista de cards. `handlers` recebe (ação, destino).
export function bindDestCards(root, handlers = {}) {
  root.querySelectorAll('[data-dest-card]').forEach((card) => {
    const id = card.dataset.destCard;
    const d = (handlers.list?.() || []).find((x) => x.id === id);
    card.querySelector('[data-dest-edit]')?.addEventListener('click', () => handlers.onEdit?.(d));
    card.querySelector('[data-dest-key]')?.addEventListener('click', () => handlers.onEdit?.(d));
    card.querySelector('[data-dest-prepare]')?.addEventListener('click', () => handlers.onPrepare?.(d));
    card.querySelector('[data-dest-help]')?.addEventListener('click', () => showKeyHelp(d?.platform || 'youtube'));
    card.querySelector('[data-dest-del]')?.addEventListener('click', () => handlers.onDelete?.(d));
  });
}

// Cria/renova a live do destino conectado (devolve o destino atualizado).
export async function prepareDestination(d, { title = '', studioId = '' } = {}) {
  const r = await api(`/destinations/${encodeURIComponent(d.id)}/prepare`, { method: 'POST', body: { title, studioId } });
  return r || {};
}

// janela "Onde pego a chave?": passo a passo, link direto da plataforma e guia em PDF
export function showKeyHelp(plat = 'youtube') {
  const opts = Object.entries(PLATFORMS).map(([k, v]) => `<option value="${k}" ${k === plat ? 'selected' : ''}>${v.label}</option>`).join('');
  return modal(
    `
    <h3>Onde pego a chave de transmissão?</h3>
    <p class="sub">Escolha a plataforma e siga os passos. A chave é secreta: não mostre na tela nem compartilhe.</p>
    <label class="field"><span>Plataforma</span><select class="input" id="kh-plat">${opts}</select></label>
    <div id="kh-body" class="kh-body"></div>
    <div class="modal-actions"><button class="btn primary" data-close>Entendi</button></div>`,
    {
      onMount(m) {
        const sel = $('#kh-plat', m);
        const render = () => {
          const k = sel.value;
          const hlp = KEY_HELP[k] || KEY_HELP.custom;
          const v = PLATFORMS[k]?.vertical;
          const pdf = guidePdf(k, window.CD_LANG);
          $('#kh-body', m).innerHTML = `
            <div class="kh-head"><span class="plat ${k}">${esc(PLATFORMS[k]?.short || '?')}</span>
              <div><b>${esc(PLATFORMS[k]?.label || k)}</b><div class="kh-fmt">${v ? '<i class="fmt-badge v">9:16</i> <span>Chave vertical</span>' : '<i class="fmt-badge h">16:9</i> <span>Chave horizontal</span>'}</div></div></div>
            <ol class="kh-steps">${hlp.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
            ${hlp.notes.length ? `<ul class="kh-notes">${hlp.notes.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
            <div class="kh-links">
              ${hlp.link ? `<a class="btn primary" id="kh-open" href="${esc(hlp.link)}" target="_blank" rel="noopener"><span>Abrir página da chave</span> ↗</a>` : ''}
              ${pdf ? `<a class="btn" id="kh-pdf" href="${esc(pdf)}" target="_blank" rel="noopener"><span>Baixar guia em PDF</span> ⤓</a>` : ''}
            </div>
            ${hlp.link ? `<p class="hint kh-url">${esc(hlp.link)}</p>` : ''}`;
        };
        sel.onchange = render;
        render();
      },
    },
  );
}

// abre a janela de criar/editar. Resolve com o destino salvo (ou null se cancelou).
// preset: valores iniciais para destino novo (ex.: { platform: 'instagram' } ou { format: 'v' })
export async function editDestination(d, preset = {}) {
  const plat0 = d?.platform || preset.platform || (preset.format === 'v' ? 'instagram' : 'youtube');
  const fmt0 = d ? destFormat(d) : preset.format || (PLATFORMS[plat0]?.vertical ? 'v' : 'h');
  const res = await modal(
    `
    <h3>${d ? T('Editar destino') : T('Novo destino')}</h3>
    <p class="sub">${T('A chave fica salva só neste aparelho. Se conectar a conta, o CastDeck cria a live e renova a chave sozinho.')}</p>
    <label class="field"><span>${T('Plataforma')}</span><select class="input" id="d-plat">${Object.entries(PLATFORMS).map(([k, v]) => `<option value="${k}" ${plat0 === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
    <div class="d-conn" id="d-conn" hidden>
      <div class="d-conn-row">
        <span class="d-conn-badge" id="d-conn-badge">○</span>
        <span class="d-conn-txt" id="d-conn-txt"></span>
        <button type="button" class="btn sm primary" id="d-connect">${T('Conectar conta')}</button>
      </div>
      <p class="hint" id="d-conn-hint"></p>
    </div>
    <details class="d-manual" id="d-manual" ${d && !CONNECTABLE.has(plat0) ? 'open' : ''}>
      <summary>${T('Usar chave manual')}</summary>
      <div class="field" style="margin-top:10px"><span>${T('Formato da chave')}</span>
        <div class="fmt-seg" id="d-fmt" role="radiogroup">
          <label class="fmt-opt"><input type="radio" name="d-fmt" value="h" ${fmt0 === 'h' ? 'checked' : ''}><i class="fmt-ico h"></i><span><b>Horizontal 16:9</b><small>YouTube, Facebook, Twitch, Kick…</small></span></label>
          <label class="fmt-opt"><input type="radio" name="d-fmt" value="v" ${fmt0 === 'v' ? 'checked' : ''}><i class="fmt-ico v"></i><span><b>Vertical 9:16</b><small>Instagram, TikTok, Shorts</small></span></label>
        </div>
      </div>
      <label class="field"><span>${T('URL do servidor (rtmp:// ou rtmps://)')}</span><input class="input" id="d-url" value="${esc(d?.url ?? PLATFORMS[plat0]?.url ?? '')}"></label>
      <label class="field"><span>${T('Chave de transmissão')}</span><input class="input" id="d-key" type="password" autocomplete="off" value="${esc(d?.key || '')}" placeholder="${d ? T('Deixe como está para manter') : T('Cole a chave aqui')}"></label>
      <button type="button" class="kh-btn" id="d-help">❓ <span>${T('Onde pego a chave?')}</span></button>
      <p class="hint" id="d-hint"></p>
    </details>
    <label class="field"><span>${T('Nome')}</span><input class="input" id="d-name" maxlength="80" value="${esc(d?.name || '')}" placeholder="Ex.: ${T('Canal principal')}"></label>
    <div class="modal-actions"><button class="btn" data-close>${T('Cancelar')}</button><button class="btn primary" id="d-save" data-save>${T('Salvar')}</button></div>`,
    {
      onMount(m, close) {
        const plat = $('#d-plat', m);
        let fmtTouched = !!d; // ao editar, respeita o formato salvo
        let conn = d?.connectionId || ''; // plataforma conectada que vai gerar a chave
        const setFmt = (f) => m.querySelectorAll('input[name="d-fmt"]').forEach((r) => (r.checked = r.value === f));
        m.querySelectorAll('input[name="d-fmt"]').forEach((r) => (r.onchange = () => (fmtTouched = true)));
        const hint = () => ($('#d-hint', m).textContent = PLATFORMS[plat.value].url ? '' : 'Esta plataforma fornece a URL no painel de transmissão dela — cole aqui.');
        const syncConn = () => {
          const p = plat.value;
          const can = CONNECTABLE.has(p);
          const box = $('#d-conn', m);
          box.hidden = !can;
          if (!can) {
            $('#d-manual', m).open = true;
            return;
          }
          const connected = conn === p;
          $('#d-conn-badge', m).textContent = connected ? '●' : '○';
          $('#d-conn-badge', m).className = `d-conn-badge ${connected ? 'ok' : ''}`;
          $('#d-conn-txt', m).textContent = connected
            ? T('Conta conectada: a live e a chave são criadas sozinhas.')
            : T('Conecte a conta (1 clique) e não precisa copiar chave.');
          $('#d-conn-hint', m).textContent = connected
            ? T('A chave manual abaixo é ignorada enquanto a conta estiver conectada.')
            : T('Você autoriza no site da plataforma; o CastDeck não vê sua senha.');
          $('#d-connect', m).textContent = connected ? T('Trocar conta') : T('Conectar conta');
        };
        plat.onchange = () => {
          const p = PLATFORMS[plat.value];
          $('#d-url', m).value = p.url;
          if (!$('#d-name', m).value) $('#d-name', m).value = p.label;
          if (!fmtTouched) setFmt(p.vertical ? 'v' : 'h');
          if (conn && conn !== plat.value) conn = '';
          hint();
          syncConn();
        };
        if (!d) hint();
        syncConn();
        $('#d-help', m).onclick = () => showKeyHelp(plat.value);
        $('#d-connect', m).onclick = async () => {
          const ok = await connectProvider(plat.value);
          if (ok) {
            conn = plat.value;
            syncConn();
            toast(T('Conta conectada'), 'ok');
          }
        };
        $('#d-save', m).onclick = () => {
          const platform = plat.value;
          const format = m.querySelector('input[name="d-fmt"]:checked')?.value || 'h';
          const name = $('#d-name', m).value.trim() || PLATFORMS[platform].label;
          const key = ($('#d-key', m)?.value || '').trim();
          const url = ($('#d-url', m)?.value || '').trim();
          const usingConn = !!conn && conn === platform;
          if (!usingConn) {
            if (!/^rtmps?:\/\/.+/i.test(url)) return toast(T('A URL deve começar com rtmp:// ou rtmps://'), 'err');
            if (!key && !d?.hasKey) return toast(T('Cole a chave de transmissão'), 'err');
          }
          close({
            platform,
            format,
            name,
            url: usingConn ? url || PLATFORMS[platform].url || '' : url,
            key: usingConn ? '' : key,
            connectionId: usingConn ? platform : '',
          });
        };
        setTimeout(() => (d ? $('#d-name', m) : plat).focus(), 30);
      },
    },
  );
  if (!res) return null;
  try {
    const saved = d
      ? await api('/destinations/' + d.id, { method: 'PUT', body: { ...res, enabled: d.enabled } })
      : await api('/destinations', { method: 'POST', body: { ...res, enabled: true } });
    toast(d ? T('Destino atualizado') : T('Destino adicionado'), 'ok');
    // conta conectada: já cria a live e a chave para o destino ficar pronto
    if (res.connectionId && saved?.id) {
      try {
        await prepareDestination(saved, {});
      } catch (e) {
        toast(e.message, 'err');
      }
    }
    return saved;
  } catch (e) {
    toast(e.message, 'err');
    return null;
  }
}

export async function deleteDestination(d) {
  if (!(await confirmDialog(`Remover o destino “${d.name}”?`, { ok: 'Remover', danger: true }))) return false;
  try {
    await api('/destinations/' + d.id, { method: 'DELETE' });
    toast('Destino removido', 'ok');
    return true;
  } catch (e) {
    toast(e.message, 'err');
    return false;
  }
}

// "ativado por padrão": já vem marcado na hora de transmitir
export async function toggleDestination(d, enabled) {
  try {
    await api('/destinations/' + d.id, { method: 'PUT', body: { ...d, key: undefined, enabled } });
    d.enabled = enabled;
    return true;
  } catch (e) {
    toast(e.message, 'err');
    return false;
  }
}
