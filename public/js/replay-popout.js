// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Janela separada de um monitor do Replay (PREVIEW ou PGM). Recebe o MediaStream do console
// pela função window.__castdeckReplayStream(view) — o PGM vem do canvas do programa (mesma
// qualidade da saída), o Preview vem do próprio vídeo do clipe/sinal.
const view = new URLSearchParams(location.search).get('view') === 'pgm' ? 'pgm' : 'pvw';
const video = document.getElementById('pop-video');
const label = document.getElementById('pop-label');
const statusEl = document.getElementById('pop-status');
const resEl = document.getElementById('pop-res');
const msg = document.getElementById('pop-msg');

label.textContent = view === 'pgm' ? 'PGM · PROGRAMA' : 'PVW · PREVIEW';

function setRes() {
  const w = video.videoWidth;
  const h = video.videoHeight;
  resEl.textContent = w && h ? w + '×' + h : '—';
}
video.addEventListener('loadedmetadata', setRes);
video.addEventListener('resize', setRes);

function fromOpener() {
  try {
    return window.opener?.__castdeckReplayStream?.(view) || null;
  } catch {
    return null;
  }
}

let tries = 0;
function attach() {
  if (!window.opener || window.opener.closed) {
    msg.hidden = false;
    statusEl.textContent = 'console fechado';
    return;
  }
  msg.hidden = true;
  const stream = fromOpener();
  if (stream && video.srcObject !== stream) {
    video.srcObject = stream;
    video.play().catch(() => {});
  }
  if (stream) {
    statusEl.textContent = 'ao vivo';
    setRes();
  } else {
    statusEl.textContent = 'sem sinal';
    if (++tries < 60) setTimeout(attach, 500);
  }
}

attach();
// Reanexa ao longo da vida: o console pode recriar o stream ao trocar de clipe/fonte.
setInterval(() => {
  if (!window.opener || window.opener.closed) {
    if (!msg.hidden) return;
    msg.hidden = false;
    statusEl.textContent = 'console fechado';
    try { video.srcObject = null; } catch {}
    return;
  }
  msg.hidden = true;
  attach();
}, 1500);
setInterval(setRes, 1000);

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
video.addEventListener('dblclick', toggleFullscreen);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.close();
  else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
});
document.getElementById('pop-close').addEventListener('click', () => window.close());
// Duplo clique também no fundo (quando o vídeo está em letterbox)
document.body.addEventListener('dblclick', (e) => { if (e.target === video) return; toggleFullscreen(); });
