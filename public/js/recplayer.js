// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Player das gravações dentro do app (antes o botão "Ver" abria o arquivo cru numa aba nova, sem duração nem busca).
// - antes de tocar pede ao servidor para "preparar" o arquivo: gravações antigas em MP4 fragmentado ganham índice;
// - anterior/próxima, velocidade, tela cheia, "Mostrar na pasta" e "Abrir no player do PC";
// - se o navegador não conseguir tocar (formato/codec), oferece o player do sistema em vez de uma tela preta.
import { $, esc, icons, toast, modal, api, fmtBytes } from './ui.js';

const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) return '--:--';
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${m}:${p(x)}`;
};
const when = (t) => new Date(t).toLocaleString(window.CD_LOCALE || 'pt-BR', { dateStyle: 'short', timeStyle: 'short' });
// nome amigável: "Podcast-da-Semana_2026-10-21_20-15-03_vertical.mp4" -> "Podcast da Semana"
export const recTitle = (name) => name.replace(/\.(mp4|mkv|webm)$/i, '').replace(/_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/, '').replace(/_(vertical|parte\d+)/g, ' · $1').replace(/[-_]+/g, ' ').trim() || name;

export async function revealRecording(name) {
  try {
    const r = await api('/recordings/reveal', { method: 'POST', body: { name } });
    toast(r.hint || 'Abrindo a pasta…', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
export async function openRecordingExternal(name) {
  try {
    const r = await api('/recordings/open', { method: 'POST', body: { name } });
    toast(r.hint || 'Abrindo no player do computador…', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

// list: gravações (mesma ordem da tela); index: qual abrir. onDelete(rec) apaga e devolve true se apagou.
export function playRecording(list, index, { onDelete } = {}) {
  let i = index;
  return modal(
    `<div class="rp">
      <div class="rp-stage">
        <video class="rp-video" id="rp-video" controls playsinline preload="metadata"></video>
        <div class="rp-over" id="rp-over"></div>
      </div>
      <div class="rp-bar">
        <button class="btn sm db-ico" id="rp-prev" title="Gravação anterior (mais nova)" aria-label="Anterior">${icons.up.replace('<svg', '<svg style="transform:rotate(-90deg)"')}</button>
        <div class="rp-meta grow"><strong id="rp-title" translate="no"></strong><span class="hint" id="rp-info"></span></div>
        <button class="btn sm db-ico" id="rp-next" title="Próxima gravação (mais antiga)" aria-label="Próxima">${icons.up.replace('<svg', '<svg style="transform:rotate(90deg)"')}</button>
      </div>
      <div class="rp-acts">
        <select class="input rp-speed" id="rp-speed" title="Velocidade">${[0.5, 1, 1.25, 1.5, 2].map((v) => `<option value="${v}" ${v === 1 ? 'selected' : ''}>${v}×</option>`).join('')}</select>
        <button class="btn sm" id="rp-reveal">${icons.folder}<span>Mostrar na pasta</span></button>
        <button class="btn sm" id="rp-ext">${icons.play}<span>Abrir no player do PC</span></button>
        <button class="btn sm danger db-ico" id="rp-del" title="Excluir gravação" aria-label="Excluir">${icons.trash}</button>
        <span class="grow"></span>
        <button class="btn primary sm" data-close>Fechar</button>
      </div>
    </div>`,
    {
      onMount(m, close) {
        const v = $('#rp-video', m);
        const over = $('#rp-over', m);
        let token = 0;
        const overlay = (html) => { over.innerHTML = html; over.hidden = !html; };
        const extBtn = (name) => `<button class="btn sm primary" data-ext="${esc(name)}">${icons.play}<span>Abrir no player do PC</span></button>`;

        async function load() {
          const r = list[i];
          const my = ++token;
          v.pause();
          v.removeAttribute('src');
          v.load();
          $('#rp-title', m).textContent = recTitle(r.name);
          $('#rp-title', m).title = r.name;
          $('#rp-info', m).textContent = `${fmtBytes(r.size)} · ${when(r.mtime)}`;
          $('#rp-prev', m).disabled = i <= 0;
          $('#rp-next', m).disabled = i >= list.length - 1;
          overlay(`<span class="tun-spin"></span><span>Preparando o vídeo…</span>`);
          let prep = {};
          try {
            // gravação antiga sem índice: o servidor reorganiza o arquivo (cópia rápida, sem perder qualidade)
            const slow = setTimeout(() => my === token && overlay(`<span class="tun-spin"></span><span>Preparando o vídeo para reprodução…<br><small>Gravações antigas são ajustadas uma vez para a barra de tempo funcionar.</small></span>`), 1200);
            prep = await api('/recordings/prepare', { method: 'POST', body: { name: r.name } });
            clearTimeout(slow);
          } catch { /* sem a rota (versão antiga do servidor): tenta tocar assim mesmo */ }
          if (my !== token) return;
          if (prep.size) r.size = prep.size;
          if (prep.recording) toast('Esta gravação ainda está em andamento: o vídeo mostra o que já foi gravado.', 'info');
          // ?v= evita que o navegador reaproveite o arquivo antigo do cache depois de preparado
          v.src = `${r.url}?v=${Math.round(r.mtime)}-${r.size}`;
          v.playbackRate = Number($('#rp-speed', m).value) || 1;
          v.play().catch(() => {});
        }
        v.addEventListener('loadedmetadata', () => {
          const r = list[i];
          const dur = isFinite(v.duration) ? ` · ${fmtTime(v.duration)}` : '';
          const res = v.videoWidth ? ` · ${v.videoWidth}×${v.videoHeight}` : '';
          $('#rp-info', m).textContent = `${fmtBytes(r.size)} · ${when(r.mtime)}${dur}${res}`;
          overlay('');
        });
        v.addEventListener('error', () => {
          if (!v.getAttribute('src')) return;
          overlay(`<span>Não consegui tocar esta gravação aqui.<br><small>O formato pode não ser suportado pelo navegador ou o arquivo está incompleto.</small></span>${extBtn(list[i].name)}`);
          over.querySelector('[data-ext]').onclick = (e) => openRecordingExternal(e.currentTarget.dataset.ext);
        });
        v.addEventListener('ended', () => { if (i < list.length - 1) $('#rp-next', m).classList.add('pulse'); });

        $('#rp-prev', m).onclick = () => { if (i > 0) { i--; load(); } };
        $('#rp-next', m).onclick = () => { if (i < list.length - 1) { i++; $('#rp-next', m).classList.remove('pulse'); load(); } };
        $('#rp-speed', m).onchange = (e) => (v.playbackRate = Number(e.target.value) || 1);
        $('#rp-reveal', m).onclick = () => revealRecording(list[i].name);
        $('#rp-ext', m).onclick = () => { v.pause(); openRecordingExternal(list[i].name); };
        $('#rp-del', m).onclick = async () => {
          v.pause();
          v.removeAttribute('src');
          v.load(); // solta o arquivo antes de apagar (no Windows o arquivo aberto não pode ser apagado)
          if (!(await onDelete?.(list[i]))) return load();
          list.splice(i, 1);
          if (!list.length) return close(null);
          if (i >= list.length) i = list.length - 1;
          load();
        };
        // atalhos: espaço = pausa, ←/→ = 5 s, J/L = gravação anterior/próxima, F = tela cheia
        m.addEventListener('keydown', (e) => {
          if (e.target.closest('select, input')) return;
          if (e.key === ' ' && e.target !== v) { e.preventDefault(); v.paused ? v.play() : v.pause(); }
          else if (e.key === 'ArrowRight' && e.target !== v) { v.currentTime = Math.min((v.duration || 1e9) - 0.1, v.currentTime + 5); }
          else if (e.key === 'ArrowLeft' && e.target !== v) { v.currentTime = Math.max(0, v.currentTime - 5); }
          else if (e.key.toLowerCase() === 'f') { document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen?.(); }
          else if (e.key.toLowerCase() === 'j') $('#rp-prev', m).click();
          else if (e.key.toLowerCase() === 'l') $('#rp-next', m).click();
        });
        // ao fechar a janela o vídeo para e solta o arquivo
        new MutationObserver((_, obs) => { if (!m.isConnected) { v.pause(); v.removeAttribute('src'); v.load(); obs.disconnect(); } }).observe(document.body, { childList: true });
        m.tabIndex = -1;
        m.focus();
        load();
      },
    },
  );
}
