// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
import { makeQR } from './qr.js?v=8';

export const BASE = '/intercom';
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const hashParams = () => new URLSearchParams(location.hash.replace(/^#/, ''));
export const roomFromPath = (prefix) => {
  let s = decodeURIComponent(location.pathname || '');
  s = s.replace(/\/+$/, '');
  if (prefix) s = s.replace(new RegExp(`^.*/${prefix}/`), '');
  else s = s.replace(/^.*\/intercom\//, '');
  return s.split('/').filter(Boolean).pop() || '';
};
export const api = async (path, opts = {}) => {
  const r = await fetch(`${BASE}/api/${path.replace(/^\/+/, '')}`, {
    cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const err = new Error(data.message || `Erro ${r.status}`);
    err.code = data.error || String(r.status);
    throw err;
  }
  return data;
};
export const meta = (room) => api(`rooms/${encodeURIComponent(room)}`);
export const createRoom = (payload) => api('rooms', { method: 'POST', body: JSON.stringify(payload) });
export const copy = async (text, btn) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    ta.style.cssText = 'position:fixed;opacity:0;left:0;top:0';
    document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch {}
    ta.remove();
  }
  if (btn) {
    const old = btn.textContent;
    btn.textContent = 'Copiado';
    setTimeout(() => { btn.textContent = old; }, 1200);
  }
};
export function qrSvg(text) {
  const q = makeQR(text, 'M');
  const n = q.size + 8;
  let d = '';
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  const px = Math.max(2, Math.floor(172 / n));
  const dim = n * px;
  return `<svg width="${dim}" height="${dim}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR Code da sala"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
export const fmtDate = (t) => {
  try { return new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
};
export const statusEl = (mesg, kind = 'wait') => {
  const el = $('#status');
  if (!el) return;
  el.innerHTML = `${kind === 'ok' ? '<span class="dot"></span>' : kind === 'busy' ? '<span class="dot busy"></span>' : '<span class="dot off"></span>'}${esc(mesg)}`;
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── PWA / instalação / tela ligada ─────────────────────────────────────────
let installEvent = null;
let wakeLock = null;
let wakeWanted = true;
const SCREEN_KEY = 'castdeck.intercom.screenLock';

export function screenLockOn() {
  try { return localStorage.getItem(SCREEN_KEY) !== '0'; } catch { return true; }
}

export async function keepScreenAwake(on = true) {
  wakeWanted = !!on;
  try { localStorage.setItem(SCREEN_KEY, on ? '1' : '0'); } catch {}
  if (!on) {
    try { await wakeLock?.release(); } catch {}
    wakeLock = null;
    return;
  }
  if (wakeLock || !navigator.wakeLock?.request) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener?.('release', () => { wakeLock = null; });
  } catch {}
}

export function initPwa() {
  const sync = () => {
    const show = !!installEvent && !matchMedia('(display-mode: standalone)').matches;
    for (const b of document.querySelectorAll('[data-install-app]')) b.hidden = !show;
  };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    sync();
  });
  window.addEventListener('appinstalled', () => { installEvent = null; sync(); });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest?.('[data-install-app]');
    if (!b || !installEvent) return;
    e.preventDefault();
    try {
      installEvent.prompt();
      await installEvent.userChoice;
    } catch {}
    installEvent = null;
    sync();
  });
  if ('serviceWorker' in navigator && isSecureContext) {
    navigator.serviceWorker.register('/intercom/sw.js', { scope: '/intercom/' }).catch(() => {});
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && wakeWanted && !wakeLock) keepScreenAwake(true);
  });
  window.addEventListener('pagehide', () => { try { wakeLock?.release(); } catch {} });
  sync();
}

export function mediaSession(title = 'CastDeck Intercom') {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: 'Sala de produção',
      album: 'Áudio de intercom',
      artwork: [{ src: '/intercom/icon-192.png', sizes: '192x192', type: 'image/png' }],
    });
    navigator.mediaSession.playbackState = 'playing';
  } catch {}
}

initPwa();

export function requestAudioSession() {
  try { if ('audioSession' in navigator) navigator.audioSession.type = 'play-and-record'; } catch {}
}
