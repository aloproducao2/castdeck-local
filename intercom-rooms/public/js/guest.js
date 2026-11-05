// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
import { $, meta, esc, hashParams, roomFromPath, fmtDate, statusEl, keepScreenAwake, screenLockOn, requestAudioSession } from './common.js?v=15';
import { initDevices, getMicStream } from './devices.js?v=15';
import { t, errorText, onLangChange } from './i18n.js?v=15';
import { Signaling, Peer, loadIce } from './peer.js?v=15';

const room = roomFromPath();
const token = hashParams().get('t') || '';
const G = {
  room: null,
  token,
  sig: null,
  mic: null,
  micStream: null,
  analyser: null,
  micSource: null,
  keepAlive: null,
  devices: null,
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
  statusEl(t('host.statusUnavailable'), 'off');
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
  ptt.innerHTML = G.ptt ? `${t('guest.pttTalking')}<small>${t('guest.pttRelease')}</small>` : (G.latch ? `${t('guest.pttLatched')}<small>${t('guest.pttLatchedSub')}</small>` : `${t('guest.pttIdle')}<small>${t('guest.pttSub')}</small>`);
  $('#mic-label').textContent = t(G.ptt ? 'guest.micOpen' : 'guest.micClosed');
  $('#mic-dot').className = `dot ${G.ptt ? '' : 'off'}`;
  $('#ptt-status').textContent = t(G.ptt ? 'host.statusOpen' : 'host.statusClosed');
  G.sig?.send({ type: 'state', state: { micOn: G.ptt, ptt: G.ptt } });
}

function renderRoom() {
  if (!G.room) return;
  $('#live-room').textContent = G.room.name || 'Intercom';
  $('#live-meta').textContent = t('guest.roomMeta', { n: G.room.maxParticipants });
  $('#room-info').textContent = t('guest.permanentInfo');
  statusEl(t('guest.statusConnected'), 'ok');
}

function setupMeter(stream) {
  try {
    G.ctx = G.ctx || new AudioContext();
    try { G.micSource?.disconnect(); } catch {}
    G.analyser = G.ctx.createAnalyser();
    G.analyser.fftSize = 512;
    G.micSource = G.ctx.createMediaStreamSource(stream);
    G.micSource.connect(G.analyser);
    const pull = G.ctx.createGain();
    pull.gain.value = 0;
    G.analyser.connect(pull).connect(G.ctx.destination);
    try {
      G.keepAlive?.osc?.stop();
      const osc = G.ctx.createOscillator();
      const gain = G.ctx.createGain();
      gain.gain.value = 0.00001;
      osc.connect(gain).connect(G.ctx.destination);
      osc.start();
      G.keepAlive = { osc, gain };
    } catch {}
    const buf = new Uint8Array(G.analyser.fftSize);
    const draw = () => {
      G.analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
      $('#meter').style.width = `${Math.min(100, Math.round(peak * 180))}%`;
      requestAnimationFrame(draw);
    };
    draw();
    if (G.ctx.state === 'suspended') G.ctx.resume().catch(() => {});
  } catch {}
}

async function switchGuestMic() {
  if (!G.joined || !G.mic) return;
  const stream = await getMicStream();
  const track = stream.getAudioTracks()[0];
  if (!track) throw new Error(t('host.noMic'));
  track.enabled = G.ptt;
  try {
    if (G.peer) {
      const sender = G.peer.pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender) await sender.replaceTrack(track);
    }
  } catch (err) {
    track.stop();
    throw err;
  }
  const old = G.mic;
  G.mic = track;
  G.micStream = stream;
  old?.stop();
  setupMeter(stream);
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
    G.devices?.applyOutput(remote);
  });
  peer.addEventListener('state', (e) => {
    if (e.detail === 'connected') {
      $('#live-state').textContent = t('guest.connected');
      $('#live-dot').className = 'dot';
      $('#director-state').textContent = t('guest.directorConnected');
    } else if (e.detail === 'failed' || e.detail === 'disconnected') {
      $('#live-state').textContent = t('guest.reconnecting');
      $('#live-dot').className = 'dot busy';
    }
  });
  G.peer = peer;
}

async function keepAwake() {
  await keepScreenAwake(screenLockOn());
}

function setupMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'CastDeck Intercom',
      artist: t('common.mediaProduction'),
      album: t('common.mediaAudio'),
      artwork: [{ src: '/intercom/icon-192.png', sizes: '192x192', type: 'image/png' }],
    });
    navigator.mediaSession.playbackState = 'playing';
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
  btn.textContent = t('guest.joining');
  try {
    if (!room) throw new Error(t('host.leaveError'));
    if (!token) throw new Error(t('guest.incompleteLink'));
    const name = $('#name').value.trim() || G.name || t('common.guest');
    G.name = name;
    try { localStorage.setItem('castdeck.intercom.name', name); } catch {}
    const password = $('#password').value;
    await loadIce();
    const stream = await getMicStream();
    G.micStream = stream;
    G.mic = stream.getAudioTracks()[0];
    if (!G.mic) throw new Error(t('host.noMic'));
    G.mic.enabled = false;
    setupMeter(stream);
    keepAwake();
    requestAudioSession();
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
        $('#live-state').textContent = t('guest.waitingHost');
        $('#live-dot').className = 'dot busy';
        $('#director-state').textContent = t('guest.waitingHostState');
      }
    });
    G.sig.on('host-joined', (m) => {
      ensurePeer(m.id);
      $('#live-state').textContent = t('guest.connecting');
      $('#director-state').textContent = t('guest.directorEntered');
    });
    G.sig.on('host-offline', () => {
      $('#live-state').textContent = t('guest.directorLeft');
      $('#live-dot').className = 'dot busy';
      $('#director-state').textContent = t('guest.waitingHostState');
    });
    G.sig.on('state', (m) => {
      if (m.participant?.role === 'host') {
        $('#director-state').textContent = t(m.participant.state?.ptt ? 'guest.directorTalking' : 'guest.directorConnected');
        $('#director-state').style.color = m.participant.state?.ptt ? 'var(--cyan)' : '';
      }
    });
    G.sig.on('signal', (m) => {
      if (!G.peer || G.peer.id !== m.from) ensurePeer(m.from);
      G.peer?.handle(m.data);
    });
    G.sig.on('control', (m) => {
      if (m.action === 'mute') { setMic(false); statusEl(t('guest.mutedByDirector'), 'busy'); }
      else if (m.action === 'remove') { fatal(t('guest.leftTitle'), t('guest.removed')); G.sig?.close(); }
    });
    G.sig.on('room-ended', () => fatal(t('guest.endedTitle'), t('guest.endedMessage')));
    G.sig.on('error', (m) => {
      const btn = $('#join');
      if (m.code === 'password') {
        showError(errorText(m));
        btn.disabled = false; btn.textContent = t('guest.joinButton');
      } else if (m.code === 'room-full' || m.code === 'bad-token' || m.code === 'not-found') {
        fatal(t('guest.fatalTitle'), errorText(m));
      } else {
        showError(errorText(m));
        btn.disabled = false; btn.textContent = t('guest.joinButton');
      }
    });
    G.sig.on('close', () => { if (G.joined) statusEl(t('guest.reconnecting'), 'busy'); });
    G.sig.connect({ type: 'join', room, role: 'guest', token, password, name });
  } catch (e) {
    const message = e?.name === 'NotAllowedError' ? t('guest.permissionError') : (e?.message || t('guest.joiningError'));
    showError(message);
    btn.disabled = false;
    btn.textContent = t('guest.joinButton');
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
    $('#latch').textContent = t(G.latch ? 'guest.latchOn' : 'guest.latchOff');
    if (!G.latch && G.ptt) setMic(false);
    else setMic(G.ptt);
  };
  $('#listen').onclick = () => {
    G.muted = !G.muted;
    $('#remote').muted = G.muted;
    $('#listen').classList.toggle('on', !G.muted);
    $('#listen').textContent = t(G.muted ? 'guest.listen' : 'guest.listening');
    if (!G.muted) $('#remote').play().catch(() => {});
  };
  $('#volume').oninput = (e) => { $('#remote').volume = Number(e.target.value); };
  $('#leave').onclick = () => {
    G.sig?.send({ type: 'leave' });
    G.sig?.close();
    G.mic?.stop();
    fatal(t('guest.leftTitle'), t('guest.leftMessage'));
  };
  G.devices = initDevices({
    getAudios: () => [$('#remote')],
    onMic: () => switchGuestMic(),
  });
  document.addEventListener('visibilitychange', () => {
    if (G.ctx?.state === 'suspended') G.ctx.resume().catch(() => {});
    if (!document.hidden) keepAwake();
  });
  window.addEventListener('beforeunload', () => { G.mic?.stop(); G.sig?.close(); });
}

async function boot() {
  bind();
  const q = hashParams();
  if (q.get('name')) { $('#name').value = q.get('name'); }
  else if (G.name) $('#name').value = G.name;
  if (!room) return fatal(t('guest.fatalTitle'), t('host.leaveError'));
  if (!token) return fatal(t('guest.fatalTitle'), t('guest.incompleteLink'));
  try {
    const info = await meta(room);
    G.room = info;
    $('#room-name').textContent = info.name || 'Intercom';
    $('#room-meta').textContent = t('guest.roomMetaLink', { n: info.maxParticipants });
    if (info.hasPassword) {
      $('#pass-field').hidden = false;
      $('#password').required = true;
    }
    statusEl(t(info.hostOnline ? 'guest.statusWaitingYou' : 'guest.statusWaitingDirector'), info.hostOnline ? 'ok' : 'wait');
  } catch (e) {
    return fatal(t('guest.fatalTitle'), errorText(e));
  }
  $('#join').focus();
}
onLangChange(() => {
  $('#latch').textContent = t(G.latch ? 'guest.latchOn' : 'guest.latchOff');
  $('#listen').textContent = t(G.muted ? 'guest.listen' : 'guest.listening');
  if (G.room) {
    $('#live-meta').textContent = t('guest.roomMeta', { n: G.room.maxParticipants });
    $('#room-info').textContent = t('guest.permanentInfo');
    $('#ptt').innerHTML = G.ptt ? `${t('guest.pttTalking')}<small>${t('guest.pttRelease')}</small>` : (G.latch ? `${t('guest.pttLatched')}<small>${t('guest.pttLatchedSub')}</small>` : `${t('guest.pttIdle')}<small>${t('guest.pttSub')}</small>`);
    $('#mic-label').textContent = t(G.ptt ? 'guest.micOpen' : 'guest.micClosed');
    $('#ptt-status').textContent = t(G.ptt ? 'host.statusOpen' : 'host.statusClosed');
  }
  if (!G.joined) {
    $('#join').textContent = t('guest.joinButton');
    if (G.room) $('#room-meta').textContent = t('guest.roomMetaLink', { n: G.room.maxParticipants });
  }
});
boot();
