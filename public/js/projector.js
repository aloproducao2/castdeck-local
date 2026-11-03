// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Projetor (como o "projetor em tela cheia" do OBS): janela aberta pelo estúdio que mostra o programa, o vertical ou a
// prévia da mesa num monitor/TV/saída HDMI. Não usa WebRTC nem codifica nada: pega a MediaStream direto da janela do
// estúdio (mesma origem, mesmo processo), então não pesa e não tem atraso. Se o estúdio recarregar, retoma sozinho.
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const src = ['pgm', 'vpgm', 'pvw'].includes(params.get('src')) ? params.get('src') : 'pgm';
const LABEL = { pgm: 'PGM', vpgm: 'VERTICAL', pvw: 'PRÉVIA' };
const PREF = `castdeck.projector.${src}`;
const video = $('#pj-video');
let curV = null;
let curA = null;
const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem(PREF) || '{}');
  } catch {
    return {};
  }
})();
const savePrefs = () => {
  try {
    localStorage.setItem(PREF, JSON.stringify(prefs));
  } catch {}
};

document.title = `Projetor ${LABEL[src]} — CastDeck`;
$('#pj-tag').textContent = LABEL[src];
$('#pj-tag').classList.toggle('pvw', src === 'pvw');
$('#pj-tag').classList.toggle('v', src === 'vpgm');

function status(title, msg) {
  const st = $('#pj-status');
  if (!title) return (st.hidden = true);
  st.hidden = false;
  st.querySelector('b').textContent = title;
  $('#pj-msg').textContent = msg || '';
}

// pergunta ao estúdio qual é a trilha atual (ela muda quando o estúdio recarrega ou troca de qualidade)
function poll() {
  let op = null;
  try {
    op = window.opener && !window.opener.closed ? window.opener : null;
  } catch {}
  if (!op) {
    video.srcObject = null;
    curV = curA = null;
    return status('O estúdio foi fechado', 'Abra o estúdio de novo e use o botão Projetor.');
  }
  let t = null;
  try {
    const api = op.__castdeckProjector;
    api?.hello(src, window); // o estúdio sabe que este projetor está aberto (mantém o vertical renderizando, por exemplo)
    t = api?.get(src) || null;
  } catch {}
  const v = t?.v && t.v.readyState === 'live' ? t.v : null;
  const a = t?.a && t.a.readyState === 'live' ? t.a : null;
  if (!v) {
    if (curV) video.srcObject = null;
    curV = curA = null;
    return status('Sem sinal', src === 'pvw' ? 'Ligue a mesa de corte no estúdio para ver a prévia.' : 'Aguardando o estúdio…');
  }
  if (v !== curV || a !== curA) {
    curV = v;
    curA = a;
    // MediaStream criada nesta janela com as trilhas do estúdio: a mesma imagem, sem cópia nem codificação
    video.srcObject = new MediaStream([v, a].filter(Boolean));
    video.play().catch(() => {
      // política de autoplay: com som pode ser bloqueado até um clique nesta janela; a imagem não pode parar
      if (video.muted) return;
      video.muted = true;
      video.play().catch(() => {});
      $('#pj-audio').classList.remove('on');
      $('#pj-audio').textContent = 'Clique para ligar o som';
    });
  }
  status(video.readyState >= 2 ? '' : 'Carregando…', '');
}
video.addEventListener('playing', () => status(''));
setInterval(poll, 1000);
poll();

// ---------- tela cheia ----------
const isFs = () => !!document.fullscreenElement;
async function toggleFs() {
  try {
    if (isFs()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {}
}
function syncFs() {
  $('#pj-fs').textContent = isFs() ? 'Sair da tela cheia' : 'Tela cheia';
  $('#pj-hint').hidden = isFs();
}
document.addEventListener('fullscreenchange', syncFs);
document.addEventListener('dblclick', (e) => {
  if (!e.target.closest('.bar')) toggleFs();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') toggleFs();
});
$('#pj-fs').onclick = toggleFs;
$('#pj-close').onclick = () => window.close();
// sem a permissão de janelas, o navegador abre como janela comum: mostra a dica por alguns segundos
setTimeout(() => {
  syncFs();
  if (!isFs()) setTimeout(() => ($('#pj-hint').hidden = true), 6000);
}, 600);

// ---------- barra e cursor somem quando o mouse para ----------
let idleT = 0;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleT);
  idleT = setTimeout(() => document.body.classList.add('idle'), 2500);
}
for (const ev of ['mousemove', 'pointerdown', 'keydown']) document.addEventListener(ev, wake, { passive: true });
wake();

// ---------- áudio (desligado por padrão: microfone + caixa da TV na mesma sala dá microfonia) ----------
async function fillSinks() {
  const sel = $('#pj-sink');
  if (!video.setSinkId || !navigator.mediaDevices?.enumerateDevices) return;
  try {
    const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput');
    if (outs.length < 2) return;
    sel.innerHTML = outs.map((d, i) => `<option value="${d.deviceId}">${(d.label || `Saída ${i + 1}`).replace(/[<>&"]/g, '')}</option>`).join('');
    if (prefs.sink && outs.some((d) => d.deviceId === prefs.sink)) sel.value = prefs.sink;
    sel.hidden = false;
    await video.setSinkId(sel.value).catch(() => {});
  } catch {}
}
function setAudio(on) {
  video.muted = !on;
  prefs.audio = on;
  savePrefs();
  const b = $('#pj-audio');
  b.classList.toggle('on', on);
  b.textContent = on ? 'Som ligado' : 'Som desligado';
  if (on) {
    video.play().catch(() => {});
    fillSinks();
  } else $('#pj-sink').hidden = true;
}
$('#pj-audio').onclick = () => setAudio(video.muted);
$('#pj-sink').onchange = (e) => {
  prefs.sink = e.target.value;
  savePrefs();
  video.setSinkId?.(e.target.value).catch(() => {});
};
setAudio(!!prefs.audio);
