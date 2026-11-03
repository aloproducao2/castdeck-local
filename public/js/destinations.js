// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Destinos RTMP (YouTube, Facebook, Twitch, Instagram, TikTok, RTMP próprio): janela de criar/editar,
// remover e ligar/desligar. Usado pelo painel inicial e de dentro do estúdio (sem sair da sala).
import { $, esc, toast, modal, confirmDialog, api, PLATFORMS, destFormat } from './ui.js';
import { KEY_HELP, guidePdf } from './dest-help.js';

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
    <h3>${d ? 'Editar destino' : 'Novo destino RTMP'}</h3>
    <p class="sub">A chave de transmissão fica salva só neste aparelho.</p>
    <label class="field"><span>Plataforma</span><select class="input" id="d-plat">${Object.entries(PLATFORMS).map(([k, v]) => `<option value="${k}" ${plat0 === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
    <div class="field"><span>Formato da chave</span>
      <div class="fmt-seg" id="d-fmt" role="radiogroup">
        <label class="fmt-opt"><input type="radio" name="d-fmt" value="h" ${fmt0 === 'h' ? 'checked' : ''}><i class="fmt-ico h"></i><span><b>Horizontal 16:9</b><small>YouTube, Facebook, Twitch, Kick…</small></span></label>
        <label class="fmt-opt"><input type="radio" name="d-fmt" value="v" ${fmt0 === 'v' ? 'checked' : ''}><i class="fmt-ico v"></i><span><b>Vertical 9:16</b><small>Instagram, TikTok, Shorts</small></span></label>
      </div>
    </div>
    <label class="field"><span>Nome</span><input class="input" id="d-name" maxlength="80" value="${esc(d?.name || '')}" placeholder="Ex.: Canal principal"></label>
    <label class="field"><span>URL do servidor (rtmp:// ou rtmps://)</span><input class="input" id="d-url" value="${esc(d?.url ?? PLATFORMS[plat0]?.url ?? '')}"></label>
    <label class="field"><span>Chave de transmissão</span><input class="input" id="d-key" type="password" autocomplete="off" value="${esc(d?.key || '')}" placeholder="${d ? 'Deixe como está para manter' : 'Cole a chave aqui'}"></label>
    <button type="button" class="kh-btn" id="d-help">❓ <span>Onde pego a chave?</span></button>
    <p class="hint" id="d-hint"></p>
    <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="d-save" data-save>Salvar</button></div>`,
    {
      onMount(m, close) {
        const plat = $('#d-plat', m);
        let fmtTouched = !!d; // ao editar, respeita o formato salvo
        const setFmt = (f) => m.querySelectorAll('input[name="d-fmt"]').forEach((r) => (r.checked = r.value === f));
        m.querySelectorAll('input[name="d-fmt"]').forEach((r) => (r.onchange = () => (fmtTouched = true)));
        const hint = () => ($('#d-hint', m).textContent = PLATFORMS[plat.value].url ? '' : 'Esta plataforma fornece a URL no painel de transmissão dela — cole aqui.');
        plat.onchange = () => {
          const p = PLATFORMS[plat.value];
          $('#d-url', m).value = p.url;
          if (!$('#d-name', m).value) $('#d-name', m).value = p.label;
          if (!fmtTouched) setFmt(p.vertical ? 'v' : 'h');
          hint();
        };
        if (!d) hint();
        $('#d-help', m).onclick = () => showKeyHelp(plat.value);
        $('#d-save', m).onclick = () => {
          const url = $('#d-url', m).value.trim();
          if (!/^rtmps?:\/\/.+/i.test(url)) return toast('A URL deve começar com rtmp:// ou rtmps://', 'err');
          const format = m.querySelector('input[name="d-fmt"]:checked')?.value || 'h';
          close({ platform: plat.value, format, name: $('#d-name', m).value.trim() || PLATFORMS[plat.value].label, url, key: $('#d-key', m).value.trim() });
        };
        setTimeout(() => (d ? $('#d-name', m) : plat).focus(), 30);
      },
    },
  );
  if (!res) return null;
  try {
    const saved = d ? await api('/destinations/' + d.id, { method: 'PUT', body: { ...res, enabled: d.enabled } }) : await api('/destinations', { method: 'POST', body: { ...res, enabled: true } });
    toast(d ? 'Destino atualizado' : 'Destino adicionado', 'ok');
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
