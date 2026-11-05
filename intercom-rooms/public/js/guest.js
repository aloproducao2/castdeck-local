// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
import { $, meta, esc, hashParams, roomFromPath, fmtDate, statusEl } from './common.js';
import { Signaling, Peer, loadIce } from './peer.js';

const room = roomFromPath();
const token = hashParams().get('t') || '';
const G = {
  room: null,
  token,
  sig: null,
  mic: null,
  peer: null,
  hostId: null,
  latch: false,
  ptt: false,
  muted: false,
  joined: false,
  ctx: null,
  wake: null,
  name: localStorage.getItem('castdeck.intercom.name') || '',
};
window.__intercomGuest = G;

const fatal = (title, message) => {
  $('#join-card').hidden = true;
  $('#live').hidden = true;
  $('#fatal').hidden = false;
  $('#fatal-title').textContent = title;
  $('#fatal-msg').textContent = message;
  statusEl('sala indisponível', 'off');
};
const showError = (message) => {
  const el = $('#err');
  el.textContent = message;
  el.classList.remove('hidden');
};

function setMic(on) {
  if (!G.mic) return;
  G.ptt = !!on;
  G.mic.enabled = G.ptt;
  const ptt = $('#ptt');
  ptt.classList.toggle('on', G.ptt);
  ptt.innerHTML = G.ptt ? 'FALANDO<small>solte para fechar</small>' : (G.latch ? 'CLIQUE PARA ABRIR O MIC<small>PTT travado</small>' : 'SEGURE PARA FALAR<small>o diretor está ouvindo</small>');
  $('#mic-label').textContent = G.ptt ? 'aberto' : 'fechado';
  $('#mic-dot').className = `dot ${G.ptt ? '' : 'off'}`;
  $('#ptt-status').textContent = G.ptt ? 'Microfone aberto' : 'Microfone fechado';
  G.sig?.send({ type: 'state', state: { micOn: G.ptt, ptt: G.ptt } });
}

function renderRoom() {
  if (!G.room) return;
  $('#live-room').textContent = G.room.name || 'Intercom';
  $('#live-meta').textContent = `Sala ${G.room.roomId} · ${G.room.maxParticipants} pessoas`;
  $('#room-info').textContent = `Expira em ${fmtDate(G.room.expiresAt)}. O diretor controla a sala.`;
  statusEl('conectado', 'ok');
}

async function setupMeter(track) {
  try {
    G.ctx = new AudioContext();
    const source = G.ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = G.ctx.createAnalyser();
    analyser.fftSize = 512;
    const pull = G.ctx.createGain();
    pull.gain.value = 0;
    source.connect(analyser);
    analyser.connect(pull).connect(G.ctx.destination);
    const buf = new Uint8Array(analyser.fftSize);
    const draw = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
      $('#meter').style.width = `${Math.min(100, Math.round(peak * 180))}%`;
      requestAnimationFrame(draw);
    };
    draw();
  } catch {}
}

function ensurePeer(hostId) {
  if (!hostId || !G.mic) return;
  if (G.peer && G.peer.id === hostId && !G.peer.closed) return;
  G.peer?.close();
  G.hostId = hostId;
  const peer = new Peer({
    id: hostId,
    polite: true,
    signal: (data) => G.sig?.send({ type: 'signal', to: hostId, data }),
  });
  peer.pc.addTrack(G.mic, new MediaStream([G.mic]));
  peer.addEventListener('track', (e) => {
    const { track, streams } = e.detail;
    if (track?.kind !== 'audio') return;
    const remote = $('#remote');
    remote.srcObject = streams?.[0] || new MediaStream([track]);
    remote.muted = G.muted;
    remote.volume = Number($('#volume').value) || 0.9;
    remote.play().catch(() => {});
  });
  peer.addEventListener('state', (e) => {
    if (e.detail === 'connected') {
      $('#live-state').textContent = 'Conectado';
      $('#live-dot').className = 'dot';
      $('#director-state').textContent = 'Diretor conectado';
    } else if (e.detail === 'failed' || e.detail === 'disconnected') {
      $('#live-state').textContent = 'Reconectando…';
      $('#live-dot').className = 'dot busy';
    }
  });
  G.peer = peer;
}

async function keepAwake() {
  if (G.wake) return;
  try {
    G.wake = await navigator.wakeLock?.request('screen');
    G.wake?.addEventListener?.('release', () => { G.wake = null; });
  } catch {}
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'CastDeck Intercom',
      artist: 'Sala de produção',
      album: 'Áudio de intercom',
    });
    const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch {} };
    set('pause', () => { G.muted = true; $('#remote').muted = true; });
    set('play', () => { G.muted = false; $('#remote').muted = false; $('#remote').play().catch(() => {}); });
  } catch {}
}

async function join() {
  if (G.joined) return;
  $('#err').classList.add('hidden');
  const btn = $('#join');
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    if (!room) throw new Error('O link não contém uma sala.');
    if (!token) throw new Error('Link incompleto. Abra pelo link gerado pelo diretor.');
    const name = $('#name').value.trim() || G.name || 'Convidado';
    G.name = name;
    try { localStorage.setItem('castdeck.intercom.name', name); } catch {}
    const password = $('#password').value;
    await loadIce();
    G.mic = (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false })).getAudioTracks()[0];
    G.mic.enabled = false;
    setupMeter(G.mic);
    keepAwake();
    setupMediaSession();
    G.sig = new Signaling();
    G.sig.on('welcome', (m) => {
      G.joined = true;
      G.room = m.room;
      $('#join-card').hidden = true;
      $('#live').hidden = false;
      renderRoom();
      if (m.hostId) ensurePeer(m.hostId);
      else {
        $('#live-state').textContent = 'Aguardando diretor';
        $('#live-dot').className = 'dot busy';
        $('#director-state').textContent = 'Aguardando o diretor…';
      }
    });
    G.sig.on('host-joined', (m) => {
      ensurePeer(m.id);
      $('#live-state').textContent = 'Conectando…';
      $('#director-state').textContent = 'Diretor entrou';
    });
    G.sig.on('host-offline', () => {
      $('#live-state').textContent = 'Diretor saiu';
      $('#live-dot').className = 'dot busy';
      $('#director-state').textContent = 'Aguardando o diretor…';
    });
    G.sig.on('state', (m) => {
      if (m.participant?.role === 'host') {
        $('#director-state').textContent = m.participant.state?.ptt ? 'Diretor falando' : 'Diretor conectado';
        $('#director-state').style.color = m.participant.state?.ptt ? 'var(--cyan)' : '';
      }
    });
    G.sig.on('signal', (m) => {
      if (!G.peer || G.peer.id !== m.from) ensurePeer(m.from);
      G.peer?.handle(m.data);
    });
    G.sig.on('control', (m) => {
      if (m.action === 'mute') { setMic(false); statusEl('diretor silenciou você', 'busy'); }
      else if (m.action === 'remove') { fatal('Você saiu da sala', m.message || 'O diretor removeu você.'); G.sig?.close(); }
    });
    G.sig.on('room-ended', (m) => fatal('Sala encerrada', m.reason === 'expired' ? 'A sala expirou.' : 'O diretor encerrou a sala.'));
    G.sig.on('error', (m) => {
      const btn = $('#join');
      if (m.code === 'password') {
        showError(m.message || 'Senha incorreta.');
        btn.disabled = false; btn.textContent = 'Entrar no intercom';
      } else if (m.code === 'room-full' || m.code === 'bad-token' || m.code === 'not-found') {
        fatal('Sala indisponível', m.message || 'Link inválido.');
      } else {
        showError(m.message || 'Erro de conexão.');
        btn.disabled = false; btn.textContent = 'Entrar no intercom';
      }
    });
    G.sig.on('close', () => { if (G.joined) statusEl('reconectando…', 'busy'); });
    G.sig.connect({ type: 'join', room, role: 'guest', token, password, name });
  } catch (e) {
    showError(e.message || 'Não foi possível entrar.');
    btn.disabled = false;
    btn.textContent = 'Entrar no intercom';
  }
}

function bind() {
  $('#join').onclick = join;
  const ptt = $('#ptt');
  const release = () => { if (!G.latch && G.ptt) setMic(false); };
  ptt.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    try { ptt.setPointerCapture(e.pointerId); } catch {}
    if (G.latch) setMic(!G.ptt);
    else setMic(true);
  });
  ptt.addEventListener('pointerup', release);
  ptt.addEventListener('pointercancel', release);
  ptt.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', release);
  $('#latch').onclick = () => {
    G.latch = !G.latch;
    $('#latch').classList.toggle('on', G.latch);
    $('#latch').textContent = G.latch ? 'MIC TRAVADO' : 'Travar PTT';
    if (!G.latch && G.ptt) setMic(false);
    else setMic(G.ptt);
  };
  $('#listen').onclick = () => {
    G.muted = !G.muted;
    $('#remote').muted = G.muted;
    $('#listen').classList.toggle('on', !G.muted);
    $('#listen').textContent = G.muted ? 'Ouvir diretor' : 'Ouvindo diretor';
    if (!G.muted) $('#remote').play().catch(() => {});
  };
  $('#volume').oninput = (e) => { $('#remote').volume = Number(e.target.value); };
  $('#leave').onclick = () => {
    G.sig?.send({ type: 'leave' });
    G.sig?.close();
    G.mic?.stop();
    fatal('Você saiu', 'Pode fechar esta página.');
  };
  window.addEventListener('beforeunload', () => { G.mic?.stop(); G.sig?.close(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });
}

async function boot() {
  bind();
  const q = hashParams();
  if (q.get('name')) { $('#name').value = q.get('name'); }
  else if (G.name) $('#name').value = G.name;
  if (!room) return fatal('Link inválido', 'O link não contém uma sala.');
  if (!token) return fatal('Link incompleto', 'Abra pelo link gerado pelo diretor.');
  try {
    const info = await meta(room);
    G.room = info;
    $('#room-name').textContent = info.name || 'Intercom';
    $('#room-meta').textContent = `Sala ${info.roomId} · ${info.maxParticipants} pessoas · expira em ${fmtDate(info.expiresAt)}`;
    if (info.hasPassword) {
      $('#pass-field').hidden = false;
      $('#password').required = true;
    }
    statusEl(info.hostOnline ? 'sala aguardando você' : 'sala aguardando o diretor', info.hostOnline ? 'ok' : 'wait');
  } catch (e) {
    return fatal('Sala indisponível', e.message || 'Link inválido ou sala expirada.');
  }
  $('#join').focus();
}
boot();
