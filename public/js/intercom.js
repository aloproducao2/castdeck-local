// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Intercom independente: página audio-only para câmera/reportagem.
import { $, esc, toast } from './ui.js';
import { Signaling, Peer } from './rtc.js';

const studioId = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const params = new URLSearchParams(location.search);
const key = params.get('k') || '';
const role = params.get('role') === 'camera' ? 'camera' : 'reporter';
const app = $('#app');
const C = {
  studio: null,
  hostId: null,
  peer: null,
  mic: null,
  micOn: false,
  audio: null,
  muted: false,
  ptt: false,
  name: localStorage.getItem('castdeck.intercom.name') || (role === 'camera' ? 'Câmera' : 'Reportagem'),
  log: [],
  latch: false,
  wake: null,
  keepAlive: null,
};
window.__castdeckIntercom = C;
let sig;

function status(text, kind = 'wait') {
  const el = $('#icp-status');
  if (!el) return;
  el.textContent = text;
  el.className = `icp-status ${kind}`;
}

function fatal(title, message) {
  app.innerHTML = `<div class="icp-fatal"><span>◈</span><h1>${esc(title)}</h1><p>${esc(message)}</p><a class="btn" href="/">Voltar</a></div>`;
}

function micConstraints() {
  return { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
}

function ensureAudio() {
  if (C.audio) return C.audio;
  C.audio = new Audio();
  C.audio.autoplay = true;
  C.audio.playsInline = true;
  C.audio.volume = 0.9;
  C.audio.muted = C.muted;
  return C.audio;
}

function silentWavUrl() {
  const rate = 8000;
  const samples = rate; // 1 s
  const buf = new ArrayBuffer(44 + samples);
  const v = new DataView(buf);
  const text = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  text(36, 'data');
  v.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function startKeepAlive() {
  if (C.keepAlive) {
    C.keepAlive.play().catch(() => {});
    return;
  }
  const a = new Audio(silentWavUrl());
  a.loop = true;
  a.autoplay = true;
  a.playsInline = true;
  a.volume = 0.0001;
  C.keepAlive = a;
  document.body.append(a);
  a.play().catch(() => {});
}

async function keepAwake() {
  if (C.wake) return true;
  try {
    C.wake = (await navigator.wakeLock?.request('screen')) || null;
    C.wake?.addEventListener?.('release', () => { C.wake = null; });
    const el = $('#icp-keep');
    if (el) el.textContent = C.wake ? 'Tela ativa' : 'Tela pode apagar';
    return !!C.wake;
  } catch {
    return false;
  }
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Intercom — CastDeck',
      artist: C.studio?.name || 'CastDeck',
      album: 'Áudio de produção',
    });
    navigator.mediaSession.playbackState = 'playing';
    const set = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch {} };
    set('play', () => { C.muted = false; ensureAudio().muted = false; ensureAudio().play().catch(() => {}); startKeepAlive(); keepAwake(); paint(); });
    set('pause', () => { C.muted = true; ensureAudio().muted = true; paint(); });
    set('stop', () => { C.muted = true; ensureAudio().muted = true; paint(); });
  } catch {}
}

function unlockMobileAudio() {
  startKeepAlive();
  keepAwake();
  setupMediaSession();
}

document.addEventListener('pointerdown', unlockMobileAudio, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });

function paint() {
  const ptt = $('#icp-ptt');
  const listen = $('#icp-listen');
  const lock = $('#icp-lock');
  if (ptt) {
    ptt.classList.toggle('on', C.ptt);
    ptt.textContent = C.ptt ? (C.latch ? 'MIC ABERTO · CLIQUE PARA FECHAR' : 'FALANDO…') : (C.latch ? 'CLIQUE PARA ABRIR O MIC' : 'SEGURE PARA FALAR');
  }
  if (listen) {
    listen.classList.toggle('on', !C.muted);
    listen.textContent = C.muted ? 'Ouvir diretor' : 'Ouvindo diretor';
  }
  if (lock) {
    lock.classList.toggle('on', C.latch);
    lock.textContent = C.latch ? 'PTT travado' : 'Travar PTT';
    lock.setAttribute('aria-pressed', String(C.latch));
  }
  const nm = $('#icp-name');
  if (nm) nm.textContent = C.name;
}

function stateMsg() {
  return {
    name: C.name,
    cam: true,
    intercom: true,
    intercomRole: role,
    micOn: C.micOn,
    camOn: false,
  };
}

function pushState() {
  if (sig?.joinMsg) sig.joinMsg = { ...sig.joinMsg, state: stateMsg() };
  sig?.send({ type: 'state', state: stateMsg() });
}

function pttDown() {
  if (C.latch && C.ptt) {
    micOff();
    return;
  }
  if (C.ptt) return;
  C.ptt = true;
  C.micOn = true;
  startKeepAlive();
  keepAwake();
  micOn().then(() => paint());
}

async function micOn() {
  if (!C.mic) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(), video: false });
      C.mic = stream.getAudioTracks()[0];
      if (C.peer) C.peer.pc.addTrack(C.mic, new MediaStream([C.mic]));
      else C.stream = new MediaStream([C.mic]);
      C.mic.onended = () => { C.mic = null; C.micOn = false; };
    } catch (e) {
      C.ptt = false;
      C.micOn = false;
      paint();
      toast('Microfone indisponível: ' + (e.message || e.name), 'err');
      return false;
    }
  }
  if (!C.ptt) {
    // Soltou o PTT enquanto a permissão do microfone ainda estava abrindo.
    C.mic.enabled = false;
    C.micOn = false;
    pushState();
    paint();
    return false;
  }
  C.mic.enabled = true;
  pushState();
  paint();
  return true;
}

function micOff() {
  C.ptt = false;
  C.micOn = false;
  if (C.mic) C.mic.enabled = false;
  pushState();
  paint();
}

function ensurePeer(hostId) {
  if (!hostId) return;
  if (C.peer && C.peer.id === hostId && !C.peer.closed) return;
  C.peer?.close();
  const peer = new Peer({ id: hostId, polite: true, signal: (data) => sig.send({ type: 'signal', to: hostId, data }) });
  C.peer = peer;
  peer.addEventListener('track', (e) => {
    const { track, streams } = e.detail;
    if (track?.kind !== 'audio') return;
    const audio = ensureAudio();
    audio.srcObject = streams?.[0] || new MediaStream([track]);
    audio.play().catch(() => status('Toque em Ouvir diretor para liberar o áudio.', 'wait'));
  });
  if (C.mic) peer.pc.addTrack(C.mic, new MediaStream([C.mic]));
  peer.addEventListener('state', (e) => {
    if (e.detail === 'connected') status('Conectado ao diretor', 'ok');
    else if (e.detail === 'failed' || e.detail === 'disconnected') status('Reconectando…', 'wait');
  });
}

function connect() {
  sig = new Signaling();
  sig.on('welcome', (m) => {
    C.hostId = m.hostId;
    if (m.hostId) ensurePeer(m.hostId);
    else status('Aguardando o diretor abrir o estúdio…', 'wait');
  });
  sig.on('host-online', (m) => ensurePeer(m.hostId));
  sig.on('host-offline', () => {
    C.peer?.close();
    C.peer = null;
    status('Diretor saiu. Aguardando…', 'wait');
  });
  sig.on('signal', (m) => {
    if (!C.peer || C.peer.id !== m.from) ensurePeer(m.from);
    C.peer?.handle(m.data);
  });
  sig.on('control', (m) => {
    if (m.action === 'mute') micOff();
    else if (m.action === 'reconnect') sig.ws?.close();
    else if (m.action === 'tally') {
      const t = $('#icp-tally');
      if (t) {
        t.textContent = m.data?.pgm ? 'NO AR' : m.data?.pvw ? 'PRÉVIA' : '';
        t.className = `icp-tally ${m.data?.pgm ? 'pgm' : m.data?.pvw ? 'pvw' : ''}`;
      }
    }
  });
  sig.on('error', (m) => {
    if (m.code === 'bad-key') fatal('Link inválido', m.message || 'Gere o QR novamente no painel Intercom.');
    else status(m.message || 'Erro de conexão', 'err');
  });
  sig.on('close', () => {
    C.peer?.close();
    C.peer = null;
    status('Reconectando…', 'wait');
  });
  sig.connect({
    type: 'join',
    room: studioId,
    role: 'guest',
    name: C.name,
    key,
    state: stateMsg(),
  });
}

function render() {
  app.innerHTML = `<div class="icp-wrap">
    <header class="icp-head"><div class="icp-brand"><span class="icp-dot"></span><b>INTERCOM</b><span>CastDeck</span></div><span id="icp-status" class="icp-status wait">Conectando…</span></header>
    <section class="icp-main">
      <div class="icp-kicker">DIRETOR</div>
      <h1 id="icp-name">${esc(C.name)}</h1>
      <p class="icp-sub">Você está na via de produção. Use fone.</p>
      <div id="icp-tally" class="icp-tally"></div>
      <button id="icp-ptt" class="icp-ptt" type="button">SEGURE PARA FALAR</button>
      <div class="icp-listen-row"><button id="icp-listen" class="icp-listen on" type="button">Ouvindo diretor</button><input id="icp-vol" type="range" min="0" max="1" step="0.01" value="0.9" aria-label="Volume do diretor"></div>
      <div class="icp-lock-row"><button id="icp-lock" type="button">Travar PTT</button><span id="icp-keep">Tela pode apagar</span></div>
      <p class="icp-hint">Segure para falar ou trave o PTT para manter o microfone aberto. Use fone. O Chrome pode mostrar o intercom na notificação de mídia; mantenha a aba ativa.</p>
    </section>
    <footer class="icp-foot"><span>Áudio de produção · não vai ao programa</span><span>${role === 'camera' ? 'Câmera' : 'Reportagem'}</span></footer>
  </div>`;
  paint();
  setupMediaSession();
  const ptt = $('#icp-ptt');
  const off = () => { if (C.ptt && !C.latch) micOff(); };
  ptt.addEventListener('pointerdown', (e) => { if (e.button !== undefined && e.button !== 0) return; e.preventDefault(); unlockMobileAudio(); try { ptt.setPointerCapture(e.pointerId); } catch {} pttDown(); });
  ptt.addEventListener('pointerup', off);
  ptt.addEventListener('pointercancel', off);
  ptt.addEventListener('lostpointercapture', off);
  $('#icp-lock').onclick = () => {
    C.latch = !C.latch;
    if (!C.latch && C.ptt) micOff();
    if (C.latch) {
      unlockMobileAudio();
      toast(C.ptt ? 'Microfone travado aberto.' : 'PTT travado: toque no botão para abrir/fechar.');
    }
    paint();
  };
  $('#icp-listen').onclick = () => {
    unlockMobileAudio();
    C.muted = !C.muted;
    ensureAudio().muted = C.muted;
    if (!C.muted) ensureAudio().play().catch(() => {});
    paint();
  };
  $('#icp-vol').oninput = (e) => { ensureAudio().volume = +e.target.value; };
  window.addEventListener('blur', off);
  document.addEventListener('visibilitychange', () => { if (document.hidden) off(); else keepAwake(); });
}

async function boot() {
  render();
  if (!studioId) return fatal('Link inválido', 'O link não tem um estúdio.');
  if (!key) return fatal('Link incompleto', 'Abra pelo QR/link gerado no painel Intercom do estúdio.');
  if (!location.protocol.startsWith('https') && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    return fatal('Conexão sem segurança', 'O microfone só é liberado em HTTPS. Use o link da rede local com o aviso de certificado ou o link de Internet.');
  }
  try {
    const meta = await (await fetch(`/api/public/studios/${encodeURIComponent(studioId)}`)).json();
    if (!meta?.name) return fatal('Estúdio não encontrado', 'O estúdio pode ter sido fechado.');
    C.studio = meta;
  } catch {
    return fatal('Estúdio indisponível', 'Não foi possível falar com o servidor do CastDeck.');
  }
  connect();
}

boot();
