// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Página de saída (/out/<estúdio>?src=pgm|vpgm|guest:1|<fonte>&k=<chave>): mostra só o sinal pedido,
// em tela cheia e sem interface, para usar como fonte de navegador no OBS ou no vMix.
// Opções: &muted=1 (sem áudio), &fill=1 (preenche cortando), &bg=transparent.
import { Signaling, Peer, loadIce } from './rtc.js';

const studioId = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
const q = new URLSearchParams(location.search);
const src = q.get('src') || 'pgm';
const video = document.getElementById('out-video');
const status = document.getElementById('out-status');
const msg = document.getElementById('out-msg');
const unmuteBtn = document.getElementById('out-unmute');
if (q.get('fill') === '1') document.body.classList.add('fill');
if (q.get('bg') === 'transparent') document.body.classList.add('transparent');
const wantAudio = q.get('muted') !== '1';

let peer = null;
let hostId = null;
let hasSignal = true;
const stream = new MediaStream();
video.srcObject = stream;

function show(text) {
  msg.textContent = text;
  status.hidden = !text;
}

// Opus em estéreo e alta taxa (o padrão do WebRTC é pensado para voz)
function stereo(sdp) {
  const m = /a=rtpmap:(\d+) opus\/48000\/2/i.exec(sdp);
  if (!m) return sdp;
  return sdp.replace(new RegExp(`a=fmtp:${m[1]} ([^\\r\\n]*)`), (line, p) => `a=fmtp:${m[1]} ${p.replace(/;?(stereo|sprop-stereo|maxaveragebitrate)=[^;]*/g, '')};stereo=1;sprop-stereo=1;maxaveragebitrate=256000`);
}

async function play() {
  video.muted = !wantAudio;
  try {
    await video.play();
    unmuteBtn.hidden = true;
  } catch {
    // navegador comum bloqueia som automático (no OBS/vMix toca direto): toca mudo e oferece o botão
    video.muted = true;
    video.play().catch(() => {});
    unmuteBtn.hidden = !wantAudio;
  }
}
unmuteBtn.onclick = () => {
  video.muted = false;
  video.play().catch(() => {});
  unmuteBtn.hidden = true;
};

function closePeer() {
  peer?.close();
  peer = null;
  for (const t of stream.getTracks()) stream.removeTrack(t);
}

function newPeer(from) {
  closePeer();
  hostId = from;
  peer = new Peer({ id: from, polite: true, sdpTransform: stereo, signal: (data) => sig.send({ type: 'signal', to: from, data }) });
  peer.pc.ontrack = (e) => {
    for (const t of stream.getTracks().filter((x) => x.kind === e.track.kind)) stream.removeTrack(t);
    stream.addTrack(e.track);
    play();
  };
  peer.addEventListener('state', (e) => {
    if (e.detail === 'connected') show(hasSignal ? '' : 'Sem sinal');
    else if (e.detail === 'failed') show('Conexão perdida — reconectando…');
  });
}

const sig = new Signaling();
sig.on('welcome', (m) => {
  hostId = m.hostId;
  show(m.hostId ? 'Conectando ao estúdio…' : 'Aguardando o estúdio abrir…');
});
sig.on('host-online', () => show('Conectando ao estúdio…'));
sig.on('host-offline', () => {
  closePeer();
  show('Aguardando o estúdio abrir…');
});
sig.on('signal', (m) => {
  if (!peer || m.from !== hostId) newPeer(m.from);
  peer.handle(m.data);
});
sig.on('control', (m) => {
  if (m.action === 'out-status') {
    hasSignal = !!m.data?.signal;
    if (peer?.pc.connectionState === 'connected') show(hasSignal ? '' : 'Sem sinal');
  } else if (m.action === 'reconnect') {
    closePeer();
    show('Reconectando…');
    sig.ws?.close(); // a sinalização reconecta sozinha e o estúdio refaz a conexão
  }
});
sig.on('error', (m) => {
  show(m.message || 'Erro');
  if (m.code === 'bad-key' || m.code === 'no-studio') sig.close();
});
sig.on('close', () => peer || show('Reconectando…'));

(async () => {
  if (!studioId) return show('Link incompleto.');
  await loadIce();
  sig.connect({ type: 'join', room: studioId, role: 'output', src, key: q.get('k') || '', name: 'Saída ' + src });
})();
