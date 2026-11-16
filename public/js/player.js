// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Player WebRTC (WHEP) para assistir o PGM ou entradas RTMP/SRT do CastDeck em navegador externo/LAN.

const parts = location.pathname.split('/').filter(Boolean);
const key = decodeURIComponent(parts[1] || 'out-pgm');
const qs = new URLSearchParams(location.search);
const k = qs.get('k') || '';
const qSuffix = k ? `?k=${encodeURIComponent(k)}` : '';

const v = document.getElementById('v');
const dot = document.getElementById('dot');
const titleEl = document.getElementById('title');
const statusEl = document.getElementById('status');
const waitBox = document.getElementById('wait-box');
const waitTitle = document.getElementById('wait-title');
const waitSub = document.getElementById('wait-sub');
const btnUnmute = document.getElementById('btn-unmute');
const toastEl = document.getElementById('toast');

let pc = null;
let retryT = null;
let urls = {};

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2000);
}

async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copiado!`);
  } catch {
    showToast('Não foi possível copiar.');
  }
}

document.getElementById('copy-rtmp').onclick = () => urls.rtmp && copy(urls.rtmp, 'Link RTMP');
document.getElementById('copy-srt').onclick = () => urls.srt && copy(urls.srt, 'Link SRT');
document.getElementById('copy-rtsp').onclick = () => urls.rtsp && copy(urls.rtsp, 'Link RTSP');
document.getElementById('btn-fs').onclick = () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.().catch(() => {});
};

btnUnmute.onclick = () => {
  v.muted = false;
  v.play().catch(() => {});
  btnUnmute.hidden = true;
};

v.addEventListener('volumechange', () => {
  if (!v.muted) btnUnmute.hidden = true;
});

function setState(kind, text, sub = '') {
  dot.className = 'dot ' + (kind === 'live' ? 'live' : 'wait');
  statusEl.textContent = text;
  if (kind === 'live') {
    waitBox.hidden = true;
  } else {
    waitTitle.textContent = text;
    if (sub) waitSub.textContent = sub;
    waitBox.hidden = false;
  }
}

async function loadInfo() {
  try {
    const r = await fetch(`/api/public/player-info/${encodeURIComponent(key)}${qSuffix}`);
    if (!r.ok) return;
    const d = await r.json();
    titleEl.textContent = d.label || key;
    document.title = `${d.label || key} · CastDeck Player`;
    urls = d.urls || {};
    document.getElementById('copy-rtmp').hidden = !urls.rtmp;
    document.getElementById('copy-srt').hidden = !urls.srt;
    document.getElementById('copy-rtsp').hidden = !urls.rtsp;
  } catch {}
}

function waitIce(conn, ms) {
  return new Promise((res) => {
    if (conn.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, ms);
    conn.addEventListener('icegatheringstatechange', () => {
      if (conn.iceGatheringState === 'complete') {
        clearTimeout(t);
        res();
      }
    });
  });
}

function cleanup() {
  clearTimeout(retryT);
  try { pc?.close(); } catch {}
  pc = null;
}

function scheduleRetry(ms = 2000) {
  clearTimeout(retryT);
  retryT = setTimeout(connect, ms);
}

async function connect() {
  cleanup();
  await loadInfo();
  const conn = new RTCPeerConnection({ iceServers: [] });
  pc = conn;
  const stream = new MediaStream();
  v.srcObject = stream;
  conn.addTransceiver('video', { direction: 'recvonly' });
  conn.addTransceiver('audio', { direction: 'recvonly' });
  conn.ontrack = (e) => {
    stream.addTrack(e.track);
    if (e.track.kind === 'audio' && v.muted) btnUnmute.hidden = false;
    v.play().catch(() => {});
  };
  conn.onconnectionstatechange = () => {
    if (pc !== conn) return;
    if (conn.connectionState === 'connected') {
      setState('live', 'AO VIVO · WebRTC');
    } else if (conn.connectionState === 'failed' || conn.connectionState === 'closed' || conn.connectionState === 'disconnected') {
      setState('wait', 'Reconectando…', 'Aguardando o sinal retornar no CastDeck.');
      scheduleRetry(2000);
    }
  };
  try {
    await conn.setLocalDescription(await conn.createOffer());
    await waitIce(conn, 700);
    const r = await fetch(`/api/public/whep/${encodeURIComponent(key)}${qSuffix}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: conn.localDescription.sdp,
    });
    const body = await r.text();
    if (!r.ok) {
      setState('wait', r.status === 409 ? 'Aguardando sinal…' : `Erro (${r.status})`, body);
      cleanup();
      return scheduleRetry(2000);
    }
    await conn.setRemoteDescription({ type: 'answer', sdp: body });
  } catch (e) {
    setState('wait', 'Sem conexão com o CastDeck', e.message || 'Tentando novamente…');
    cleanup();
    scheduleRetry(2500);
  }
}

connect();
