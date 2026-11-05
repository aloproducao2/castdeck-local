// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
import { $, $$, esc, meta, copy, qrSvg, statusEl, hashParams, roomFromPath, fmtDate } from './common.js';
import { Signaling, Peer, loadIce } from './peer.js';

const room = roomFromPath('host');
const token = hashParams().get('k') || '';
const H = {
  room: null,
  token,
  sig: null,
  mic: null,
  peers: new Map(),
  participants: new Map(),
  audios: new Map(),
  hostOuts: new Map(),
  talk: new Set(),
  micSource: null,
  latch: false,
  ptt: false,
  started: false,
  guestUrl: '',
  ctx: null,
  meterRaf: 0,
};
window.__intercomHost = H;

const shortUrl = (url) => {
  try { const u = new URL(url); return `${u.host}${u.pathname}`; } catch { return url; }
};

const fatal = (message) => {
  $('#start-card').hidden = true;
  $('#live').hidden = true;
  $('#roomhead').hidden = true;
  $('#fatal').hidden = false;
  $('#fatal-msg').textContent = message;
  statusEl('sala indisponível', 'off');
};
const showError = (message) => {
  const el = $('#err');
  el.textContent = message;
  el.classList.remove('hidden');
};

function renderRoom() {
  if (!H.room) return;
  $('#roomhead').hidden = false;
  $('#room-name').textContent = H.room.name || 'Intercom';
  $('#room-meta').textContent = `Até ${H.room.maxParticipants} pessoas · use fone`;
  const gl = $('#guest-link');
  if (gl) {
    gl.textContent = H.guestUrl ? shortUrl(H.guestUrl) : '-';
    if (H.guestUrl) { gl.href = H.guestUrl; gl.title = H.guestUrl; }
    else gl.removeAttribute('href');
  }
  $('#qr').innerHTML = H.guestUrl ? qrSvg(H.guestUrl) : '';
  $('#room-info').textContent = `Sala ${H.room.roomId} · criada em ${fmtDate(H.room.createdAt)} · expira em ${fmtDate(H.room.expiresAt)}.`;
  $('#expiry').textContent = `Expira em ${fmtDate(H.room.expiresAt)}`;
  $('#copy-guest').onclick = () => H.guestUrl && copy(H.guestUrl, $('#copy-guest'));
  paintParticipants();
}

function participantName(id) {
  return H.participants.get(id)?.name || 'Convidado';
}
function paintParticipants() {
  const list = [...H.participants.values()];
  const box = $('#people');
  $('#room-count').textContent = list.length ? `${list.length} pessoa${list.length === 1 ? '' : 's'} na sala` : 'Só você na sala';
  if (!list.length) {
    box.innerHTML = '<div class="empty">Aguardando a equipe entrar pelo link.</div>';
    return;
  }
  box.innerHTML = list.map((p) => {
    const talking = H.talk.has(p.id);
    return `<div class="person ${talking ? 'talking' : ''}" data-person="${esc(p.id)}">
      <span class="dot ${p.state?.micOn ? '' : 'off'}"></span>
      <div class="who"><b>${esc(p.name)}</b><small>${p.state?.micOn ? 'microfone aberto' : 'microfone fechado'}${talking ? ' · você está falando' : ''}</small></div>
      <div class="actions"><button class="btn sm" data-talk="${esc(p.id)}" type="button" title="Segure para falar com esta pessoa">Falar</button><button class="btn sm" data-mute="${esc(p.id)}" type="button">Mudo</button><button class="btn sm danger" data-remove="${esc(p.id)}" type="button">Remover</button></div>
    </div>`;
  }).join('');
  $$('[data-talk]', box).forEach((b) => {
    let held = false;
    const off = () => { if (!held) return; held = false; applyTalk([b.dataset.talk], false); };
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault(); held = true; applyTalk([b.dataset.talk], true);
      try { b.setPointerCapture(e.pointerId); } catch {}
    });
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('lostpointercapture', off);
  });
  $$('[data-mute]', box).forEach((b) => (b.onclick = () => {
    H.sig?.send({ type: 'control', action: 'mute', to: b.dataset.mute });
    const p = H.participants.get(b.dataset.mute);
    if (p) { p.state = { ...p.state, micOn: false, ptt: false }; paintParticipants(); }
  }));
  $$('[data-remove]', box).forEach((b) => (b.onclick = () => {
    if (!confirm(`Remover ${participantName(b.dataset.remove)} da sala?`)) return;
    H.sig?.send({ type: 'control', action: 'remove', to: b.dataset.remove });
  }));
}

function ensureHostOut(id) {
  let out = H.hostOuts.get(id);
  if (out) return out;
  if (!H.ctx || !H.micSource) return null;
  const talk = H.ctx.createGain();
  const dest = H.ctx.createMediaStreamDestination();
  talk.gain.value = H.allTalk ? 1 : 0;
  H.micSource.connect(talk).connect(dest);
  out = { talk, dest };
  H.hostOuts.set(id, out);
  if (H.allTalk) H.talk.add(id);
  return out;
}

function paintPtt() {
  const on = H.talk.size > 0;
  H.ptt = on;
  const ptt = $('#ptt');
  ptt.classList.toggle('on', on);
  ptt.innerHTML = on ? 'FALANDO<small>solte para fechar</small>' : (H.latch ? 'CLIQUE PARA FALAR<small>microfone aberto</small>' : 'SEGURE PARA FALAR<small>fale com todos na sala</small>');
  $('#mic-label').textContent = on ? 'aberto' : 'fechado';
  $('#mic-dot').className = `dot ${on ? '' : 'off'}`;
  $('#ptt-status').textContent = on ? 'Microfone aberto' : 'Microfone fechado';
  H.sig?.send({ type: 'state', state: { micOn: on, ptt: on } });
  for (const row of $$('#people .person')) {
    const id = row.dataset.person;
    const talking = H.talk.has(id);
    row.classList.toggle('talking', talking);
    const small = row.querySelector('.who small');
    const person = H.participants.get(id);
    if (small && person) small.textContent = `${person.state?.micOn ? 'microfone aberto' : 'microfone fechado'}${talking ? ' · você está falando' : ''}`;
  }
}

function applyTalk(ids, on) {
  for (const id of ids) {
    const out = ensureHostOut(id);
    if (!out) continue;
    out.talk.gain.setTargetAtTime(on ? 1 : 0, H.ctx.currentTime, 0.015);
    if (on) H.talk.add(id);
    else H.talk.delete(id);
  }
  if (!on && !ids.length) H.allTalk = false;
  paintPtt();
}

function setMic(on) {
  H.allTalk = !!on;
  applyTalk([...H.participants.keys()], !!on);
}

function ensurePeer(id) {
  if (H.peers.has(id) || !H.mic) return H.peers.get(id);
  const out = ensureHostOut(id);
  if (!out) return null;
  const peer = new Peer({
    id,
    polite: false,
    signal: (data) => H.sig?.send({ type: 'signal', to: id, data }),
  });
  peer.pc.addTrack(out.dest.stream.getAudioTracks()[0], out.dest.stream);
  peer.addEventListener('track', (e) => {
    const { track, streams } = e.detail;
    if (track?.kind !== 'audio') return;
    const stream = streams?.[0] || new MediaStream([track]);
    let audio = H.audios.get(id);
    if (!audio) {
      audio = new Audio();
      audio.autoplay = true;
      audio.playsInline = true;
      audio.volume = 1;
      H.audios.set(id, audio);
    }
    audio.srcObject = stream;
    audio.play().catch(() => {});
  });
  peer.addEventListener('state', (e) => {
    const el = document.querySelector(`[data-person="${CSS.escape(id)}"] .who small`);
    if (el && e.detail === 'connected') el.dataset.live = '1';
  });
  H.peers.set(id, peer);
  return peer;
}

function removePeer(id) {
  H.peers.get(id)?.close();
  H.peers.delete(id);
  H.talk.delete(id);
  H.allTalk = H.talk.size > 0 && H.allTalk;
  const out = H.hostOuts.get(id);
  if (out) {
    try { H.micSource?.disconnect(out.talk); } catch {}
    try { out.talk.disconnect(); } catch {}
    try { out.dest.disconnect(); } catch {}
    H.hostOuts.delete(id);
  }
  const audio = H.audios.get(id);
  if (audio) { audio.pause(); audio.srcObject = null; H.audios.delete(id); }
}

function setupMeter(track) {
  try {
    H.ctx = H.ctx || new AudioContext();
    H.micSource = H.ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = H.ctx.createAnalyser();
    analyser.fftSize = 512;
    const pull = H.ctx.createGain();
    pull.gain.value = 0;
    H.micSource.connect(analyser);
    analyser.connect(pull).connect(H.ctx.destination);
    const buf = new Uint8Array(analyser.fftSize);
    const draw = () => {
      analyser.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
      $('#meter').style.width = `${Math.min(100, Math.round(peak * 180))}%`;
      H.meterRaf = requestAnimationFrame(draw);
    };
    draw();
  } catch {}
}

async function start() {
  if (H.started) return;
  $('#err').classList.add('hidden');
  const btn = $('#start');
  btn.disabled = true;
  btn.textContent = 'Abrindo microfone…';
  try {
    if (!room) throw new Error('Sala não encontrada no link.');
    if (!token) throw new Error('Link do host incompleto. Abra pelo link gerado na criação da sala.');
    await loadIce();
    H.mic = (await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false })).getAudioTracks()[0];
    H.mic.enabled = true;
    setupMeter(H.mic);
    H.sig = new Signaling();
    H.sig.on('welcome', (m) => {
      H.room = m.room;
      H.guestUrl = m.guestUrl || '';
      H.started = true;
      $('#start-card').hidden = true;
      $('#live').hidden = false;
      $('#end').hidden = false;
      renderRoom();
      statusEl('sala aberta', 'ok');
      for (const p of m.participants || []) {
        H.participants.set(p.id, p);
        ensurePeer(p.id);
      }
      paintParticipants();
    });
    H.sig.on('participant-joined', (m) => {
      if (m.participant?.role !== 'guest') return;
      H.participants.set(m.participant.id, m.participant);
      ensurePeer(m.participant.id);
      paintParticipants();
    });
    H.sig.on('participant-left', (m) => {
      H.participants.delete(m.id);
      removePeer(m.id);
      paintParticipants();
    });
    H.sig.on('state', (m) => {
      if (!m.participant || m.participant.role === 'host') return;
      H.participants.set(m.from, { ...(H.participants.get(m.from) || {}), ...m.participant });
      paintParticipants();
    });
    H.sig.on('signal', (m) => {
      const peer = H.peers.get(m.from) || ensurePeer(m.from);
      peer?.handle(m.data);
    });
    H.sig.on('room-ended', (m) => {
      fatal(m.reason === 'expired' ? 'A sala expirou.' : 'O host encerrou a sala.');
    });
    H.sig.on('host-offline', () => statusEl('host desconectado', 'off'));
    H.sig.on('error', (m) => {
      if (m.code === 'bad-token' || m.code === 'not-found' || m.code === 'host-busy') fatal(m.message || 'Link inválido.');
      else {
        showError(m.message || 'Erro na sala.');
        const btn = $('#start'); btn.disabled = false; btn.textContent = 'Tentar novamente';
      }
    });
    H.sig.on('close', () => { if (H.started) statusEl('reconectando…', 'busy'); });
    H.sig.connect({ type: 'join', room, role: 'host', token, name: 'Diretor' });
  } catch (e) {
    showError(e.message || 'Não foi possível abrir o microfone.');
    btn.disabled = false;
    btn.textContent = 'Tentar novamente';
  }
}

function bind() {
  $('#start').onclick = start;
  const ptt = $('#ptt');
  const release = () => { if (!H.latch && H.ptt) setMic(false); };
  ptt.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    try { ptt.setPointerCapture(e.pointerId); } catch {}
    if (H.latch) setMic(!H.ptt);
    else setMic(true);
  });
  ptt.addEventListener('pointerup', release);
  ptt.addEventListener('pointercancel', release);
  ptt.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', release);
  window.addEventListener('pointerup', release);
  $('#latch').onclick = () => {
    H.latch = !H.latch;
    $('#latch').classList.toggle('on', H.latch);
    $('#latch').textContent = H.latch ? 'MICROFONE ABERTO' : 'Manter microfone aberto';
    if (!H.latch && H.ptt) setMic(false);
    else setMic(H.ptt);
  };
  $('#test').onclick = () => {
    try {
      const ac = new AudioContext();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = 880; g.gain.value = .08;
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + .25);
    } catch {}
  };
  $('#end').onclick = () => {
    if (!confirm('Encerrar a sala para todos?')) return;
    H.sig?.send({ type: 'control', action: 'end' });
    H.started = false;
    setTimeout(() => fatal('Sala encerrada.'), 250);
  };
  window.addEventListener('beforeunload', () => { H.mic?.stop(); H.sig?.close(); });
}

async function boot() {
  bind();
  if (!room) return fatal('O link não contém uma sala.');
  try {
    const info = await meta(room);
    H.room = info;
    $('#room-name').textContent = info.name;
    $('#room-meta').textContent = `Sala ${info.roomId} · ${info.maxParticipants} pessoas`;
    $('#expiry').textContent = `Expira em ${fmtDate(info.expiresAt)}`;
    statusEl(info.hostOnline ? 'sala já aberta' : 'pronta para abrir', info.hostOnline ? 'ok' : 'wait');
    if (info.hostOnline) {
      // outro host está conectado; o servidor vai recusar com host-busy
      showError('Esta sala já está aberta em outro dispositivo. Feche a outra janela para assumir.');
    }
  } catch (e) {
    return fatal(e.message || 'Sala não encontrada ou expirada.');
  }
  $('#start').focus();
}
boot();
