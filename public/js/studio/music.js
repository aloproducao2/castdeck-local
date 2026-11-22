// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Trilha sonora (playlist ambiente reordenável) + Pad de efeitos sonoros (samples ao vivo + janela separada /pad).
// Faixas da trilha ficam em IndexedDB (`castdeck-music`); uploads do Pad ficam em `castdeck-pad`.
import { $, esc, icons, toast } from '../ui.js';
import { openPadQrModal } from '../pad-qr.js';

const DB_NAME = 'castdeck-music';
const STORE = 'tracks';
const PAD_DB_NAME = 'castdeck-pad';
const PAD_STORE = 'samples';
const CHANNEL = 'music:ambient';
const PAD_CHANNEL = 'pad:sfx';
const MAX_FILE = 300 * 1024 * 1024;
const MAX_PAD_AUDIO = 50 * 1024 * 1024;
const MAX_PAD_VIDEO = 1024 * 1024 * 1024; // 1 GB (armazenado como Blob no IndexedDB, sem base64)
const MAX_TRACKS = 100;
const MAX_PAD_SAMPLES = 400;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|webm)$/i;
const MODES = [
  ['one', 'Repetir faixa', 'repeatOne'],
  ['list', 'Repetir lista', 'repeat'],
  ['once', 'Tocar uma vez', 'play'],
];
export const DEFAULT_PAD_GROUPS = [
  { id: 'plateia', name: 'Plateia & Auditório', icon: '👏', color: 'blue' },
  { id: 'cena', name: 'Cena & Transições', icon: '🎬', color: 'purple' },
  { id: 'videos', name: 'Vídeos / Overlay', icon: '🎞️', color: 'pink' },
  { id: 'brasil', name: 'Brasil & TV', icon: '🇧🇷', color: 'cyan' },
  { id: 'bolsonaro', name: 'Bolsonaro', icon: '🟢', color: 'green' },
  { id: 'lula', name: 'Lula', icon: '🔴', color: 'red' },
  { id: 'custom', name: 'Meus Samples', icon: '📁', color: 'orange' },
];
export const PAD_CATEGORIES = [
  ['all', 'Todos'],
  ['fav', '★ Favoritos'],
  ...DEFAULT_PAD_GROUPS.map((g) => [g.id, g.name]),
];
export const PAD_COLORS = [
  ['red', 'Vermelho'],
  ['green', 'Verde'],
  ['yellow', 'Amarelo'],
  ['blue', 'Azul'],
  ['purple', 'Roxo'],
  ['orange', 'Laranja'],
  ['cyan', 'Ciano'],
  ['pink', 'Rosa'],
];
export const PAD_HOTKEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];

const PAD_VIDEO_EXT = /\.(webm|mp4)$/i;
const PAD_OVERLAY_MODES = ['once', 'hold', 'loop'];
const PAD_OVERLAY_LABEL = { once: '1×', hold: 'Fim', loop: 'Loop' };
const PAD_OVERLAY_TITLE = {
  once: 'Roda e sai depois (padrão). Clique para mudar para Travar no último frame.',
  hold: 'Roda e trava no último frame até clicar de novo. Clique para mudar para Loop.',
  loop: 'Roda em loop até clicar de novo. Clique para mudar para Roda e sai.',
};

function isAudio(file) {
  return /^audio\//i.test(file?.type || '') || AUDIO_EXT.test(file?.name || '');
}

function isPadVideo(file) {
  return /^video\/(webm|mp4)/i.test(file?.type || '') || PAD_VIDEO_EXT.test(file?.name || '');
}

function isPadMedia(file) {
  return isAudio(file) || isPadVideo(file);
}

function openIdb(name, store) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(store)) d.createObjectStore(store);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbAll(name, store) {
  const d = await openIdb(name, store);
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readonly');
    const st = tx.objectStore(store);
    const values = st.getAll();
    const keys = st.getAllKeys();
    tx.oncomplete = () => resolve(keys.result.map((key, i) => ({ key, rec: values.result[i] })));
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(name, store, key) {
  const d = await openIdb(name, store);
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(name, store, key, rec) {
  const d = await openIdb(name, store);
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).put(rec, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDel(name, store, key) {
  const d = await openIdb(name, store);
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function fmtDur(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtPadClock(sec, { tenths = true } = {}) {
  if (!Number.isFinite(sec) || sec < 0) return tenths ? '00:00.0' : '00:00';
  const safe = Math.max(0, sec);
  const totalTenths = Math.floor(safe * 10);
  const d = totalTenths % 10;
  const totalSecs = Math.floor(totalTenths / 10);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return tenths ? `${base}.${d}` : base;
}

function cleanName(name) {
  return String(name || 'Áudio').replace(/\.[^.]+$/, '').slice(0, 90);
}

function clamp01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

export function createMusic({ studioId = 'local', mixer = null, onChange, getStudioName } = {}) {
  const prefix = `${studioId}|`;
  const ls = (name) => `castdeck.music.${name}.${studioId}`;
  const tracks = [];
  let panel = null;
  let currentId = '';
  let viewMode = localStorage.getItem(ls('view')) === 'pad' ? 'pad' : 'tracks';
  let mode = ['one', 'list', 'once'].includes(localStorage.getItem(ls('mode'))) ? localStorage.getItem(ls('mode')) : 'list';
  let volume = (() => {
    const raw = localStorage.getItem(ls('volume'));
    const v = raw == null || raw === '' ? NaN : Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.4;
  })();
  let muted = false;
  let hostMon = (() => {
    const raw = localStorage.getItem(ls('monitor'));
    return raw == null || raw === '' ? true : raw === '1';
  })();
  let restored = false;
  let seeking = false;
  let dragTrackId = '';

  // ---------- Áudio da Trilha Ambiente ----------
  const audio = document.createElement('audio');
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
  audio.playsInline = true;
  audio.style.display = 'none';
  document.body.append(audio);

  try {
    mixer?.addElement?.(CHANNEL, audio, { ownerId: 'host', stageKey: 'music', monitor: true });
    mixer?.setRoute?.(CHANNEL, { program: true, monitor: hostMon });
    mixer?.setVolume?.(CHANNEL, volume, { save: false });
    mixer?.setMuted?.(CHANNEL, false, { save: false });
  } catch (e) {
    console.warn('[trilha] mixer:', e);
  }

  // ---------- Estado do Pad de Efeitos Sonoros ----------
  let padSamples = [];
  const activeVideoOverlays = new Map(); // playId -> { playId, sampleId, name, el, mode, held, startedAt, duration }
  let padRestored = false;
  let padRestorePromise = null;
  let padWin = null;
  let padSearch = '';
  let padCategory = localStorage.getItem(ls('pad.cat')) || 'all';
  let padVolume = (() => {
    const raw = localStorage.getItem(ls('pad.volume'));
    if (raw != null && raw !== '') {
      const v = Number(raw);
      if (Number.isFinite(v) && v >= 0 && v <= 1) return v;
    }
    const pref = mixer?.prefs?.get?.(PAD_CHANNEL)?.volume;
    return Number.isFinite(pref) && pref >= 0 && pref <= 1 ? pref : 0.85;
  })();
  let padMuted = (() => {
    const raw = localStorage.getItem(ls('pad.muted'));
    if (raw === '1' || raw === '0') return raw === '1';
    return !!mixer?.prefs?.get?.(PAD_CHANNEL)?.muted;
  })();
  let padMonitor = (() => {
    const raw = localStorage.getItem(ls('pad.monitor'));
    return raw == null || raw === '' ? true : raw === '1';
  })();
  let padOverlap = localStorage.getItem(ls('pad.overlap')) === '1';
  let padDucking = (() => {
    const raw = localStorage.getItem(ls('pad.ducking'));
    return raw == null || raw === '' ? true : raw === '1';
  })();
  let padGrouped = localStorage.getItem(ls('pad.grouped')) !== '0';
  let padCollapsed = (() => {
    try {
      const a = JSON.parse(localStorage.getItem(ls('pad.collapsed')) || '[]');
      return new Set(Array.isArray(a) ? a : []);
    } catch {
      return new Set();
    }
  })();
  let removedDefaultGroups = (() => {
    try {
      const a = JSON.parse(localStorage.getItem(ls('pad.groups.removed')) || '[]');
      return new Set(Array.isArray(a) ? a : []);
    } catch {
      return new Set();
    }
  })();
  let padGroups = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ls('pad.groups')) || 'null');
      if (Array.isArray(saved) && saved.length) {
        const have = new Set(saved.map((g) => g.id));
        const list = saved.map((g) => ({
          id: String(g.id),
          name: String(g.name || g.id),
          icon: String(g.icon || '🎵'),
          color: String(g.color || 'blue'),
        }));
        for (const def of DEFAULT_PAD_GROUPS) {
          if (!have.has(def.id) && !removedDefaultGroups.has(def.id)) {
            list.push({ ...def });
          }
        }
        return list;
      }
    } catch {}
    return DEFAULT_PAD_GROUPS.map((g) => ({ ...g }));
  })();
  let padDucked = false;
  let padPresets = [];
  let padMeta = (() => {
    try {
      const m = JSON.parse(localStorage.getItem(ls('pad.meta')) || '{}');
      return m && typeof m === 'object' ? m : {};
    } catch {
      return {};
    }
  })();
  let padOrder = (() => {
    try {
      const o = JSON.parse(localStorage.getItem(ls('pad.order')) || '[]');
      return Array.isArray(o) ? o : [];
    } catch {
      return [];
    }
  })();
  let dragPadId = '';
  let lastPadSampleId = '';
  let probeTimer = null;

  const padBufferCache = new Map(); // sampleId -> AudioBuffer
  const activePadPlays = new Map(); // playId -> { playId, sampleId, name, startedAt, duration, stop }
  const padSubscribers = new Set();
  let padTickTimer = null;
  let padBus = null;
  let fallbackCtx = null;
  let fallbackBus = null;
  let padSyncGuard = false;
  let bc = null;
  let bridgeBc = null;
  try {
    bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`castdeck.pad.${studioId}`) : null;
  } catch {}
  try {
    // Ponte global: só o Estúdio (com mixer ativo) atende comandos da janela /pad.html mesmo sem window.opener.
    bridgeBc = mixer?.ctx && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('castdeck.pad.bridge') : null;
  } catch {}

  function ensurePadBus() {
    if (mixer?.ctx) {
      if (!padBus) {
        padBus = mixer.ctx.createGain();
        padBus.gain.value = 1;
        padSyncGuard = true;
        try {
          mixer.addNode(PAD_CHANNEL, padBus, { ownerId: 'host', stageKey: 'pad', monitor: true });
          mixer.setRoute(PAD_CHANNEL, { program: true, monitor: padMonitor });
          mixer.setVolume(PAD_CHANNEL, padVolume, { save: false });
          mixer.setMuted(PAD_CHANNEL, padMuted, { save: false });
        } catch (e) {
          console.warn('[pad] mixer:', e);
        } finally {
          padSyncGuard = false;
        }
      }
      return { ctx: mixer.ctx, dest: padBus };
    }
    if (!fallbackCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        fallbackCtx = new Ctx();
        fallbackBus = fallbackCtx.createGain();
        fallbackBus.gain.value = padMuted ? 0 : padVolume;
        fallbackBus.connect(fallbackCtx.destination);
      }
    }
    return fallbackCtx ? { ctx: fallbackCtx, dest: fallbackBus } : null;
  }

  if (mixer?.ctx) ensurePadBus();

  const track = (id = currentId) => tracks.find((t) => t.id === id) || null;
  const idx = (id = currentId) => tracks.findIndex((t) => t.id === id);
  const playing = () => !audio.paused && !audio.ended;
  const notify = () => {
    try { onChange?.(); } catch {}
  };

  function persistTrackOrder() {
    try {
      localStorage.setItem(ls('order'), JSON.stringify(tracks.map((t) => t.id)));
    } catch {}
  }

  function persist() {
    try {
      localStorage.setItem(ls('view'), viewMode);
      localStorage.setItem(ls('mode'), mode);
      localStorage.setItem(ls('volume'), String(volume));
      localStorage.setItem(ls('monitor'), hostMon ? '1' : '0');
      if (currentId) localStorage.setItem(ls('current'), currentId);
      else localStorage.removeItem(ls('current'));
      persistTrackOrder();
    } catch {}
  }

  function persistPad() {
    try {
      localStorage.setItem(ls('pad.cat'), padCategory);
      localStorage.setItem(ls('pad.volume'), String(padVolume));
      localStorage.setItem(ls('pad.muted'), padMuted ? '1' : '0');
      localStorage.setItem(ls('pad.monitor'), padMonitor ? '1' : '0');
      localStorage.setItem(ls('pad.overlap'), padOverlap ? '1' : '0');
      localStorage.setItem(ls('pad.ducking'), padDucking ? '1' : '0');
      localStorage.setItem(ls('pad.grouped'), padGrouped ? '1' : '0');
      localStorage.setItem(ls('pad.collapsed'), JSON.stringify([...padCollapsed]));
      localStorage.setItem(ls('pad.groups'), JSON.stringify(padGroups));
      localStorage.setItem(ls('pad.groups.removed'), JSON.stringify([...removedDefaultGroups]));
      localStorage.setItem(ls('pad.meta'), JSON.stringify(padMeta));
      padOrder = padSamples.map((s) => s.id);
      localStorage.setItem(ls('pad.order'), JSON.stringify(padOrder));
    } catch {}
  }

  function syncAmbientDucking() {
    const tocando = [...activePadPlays.values()].filter((p) => !p.paused).length;
    const shouldDuck = padDucking && tocando > 0;
    if (shouldDuck === padDucked) return;
    padDucked = shouldDuck;
    const target = shouldDuck ? volume * 0.22 : volume;
    if (mixer?.sources?.has?.(CHANNEL)) {
      mixer.setVolume(CHANNEL, target, { save: false });
    }
  }

  function emitPadState(meta = {}) {
    const snap = getPadSnapshot();
    for (const fn of padSubscribers) {
      try { fn(snap, meta); } catch {}
    }
    try { bc?.postMessage({ type: 'state', studioId, snap }); } catch {}
    if (bridgeBc) {
      try {
        if (meta?.tick) {
          bridgeBc.postMessage({
            type: 'tick',
            studioId,
            studioName: getStudioName?.() || '',
            nowPlaying: snap.nowPlaying,
            activeSamples: snap.activeSamples,
            playingCount: snap.playingCount,
          });
        } else {
          bridgeBc.postMessage({ type: 'state', studioId, studioName: getStudioName?.() || '', snap });
        }
      } catch {}
    }
    if (panel && viewMode === 'pad') paintPadProgress();
  }

  function startPadTick() {
    if (padTickTimer) return;
    padTickTimer = setInterval(() => {
      if (!activePadPlays.size) {
        clearInterval(padTickTimer);
        padTickTimer = null;
        return;
      }
      emitPadState({ tick: true });
    }, 45);
  }

  function stopPadTickIfIdle() {
    if (!activePadPlays.size && padTickTimer) {
      clearInterval(padTickTimer);
      padTickTimer = null;
    }
  }

  // ---------- Controles da Trilha Sonora ----------
  function seekTo(raw) {
    const t = track();
    const dur = Number(audio.duration) || t?.duration || 0;
    if (!t || !(dur > 0)) return;
    const next = Math.max(0, Math.min(1, Number(raw) / 1000)) * dur;
    try {
      audio.currentTime = next;
    } catch {}
    paintTime();
  }

  function paintTime() {
    if (!panel || viewMode !== 'tracks') return;
    const t = track();
    const dur = Number(audio.duration) || t?.duration || 0;
    const pos = Number(audio.currentTime) || 0;
    const pct = dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : 0;
    const bar = panel.querySelector('#music-bar');
    if (bar) bar.style.width = `${pct * 100}%`;
    const seek = panel.querySelector('#music-seek');
    if (seek) {
      seek.disabled = !t || !(dur > 0);
      if (!seeking) seek.value = String(Math.round(pct * 1000));
      seek.setAttribute('aria-valuetext', `${fmtDur(pos)} de ${fmtDur(dur)}`);
    }
    const time = panel.querySelector('#music-time');
    if (time) time.textContent = `${fmtDur(pos)} / ${fmtDur(dur)}`;
    panel.querySelectorAll('[data-track]').forEach((row) => {
      const on = row.dataset.track === currentId;
      row.classList.toggle('active', on);
      const item = track(row.dataset.track);
      const meta = row.querySelector('small');
      if (item && meta) meta.textContent = `${tracks.indexOf(item) + 1} · ${fmtDur(item.duration)}`;
      const b = row.querySelector('[data-play-track]');
      if (b) b.innerHTML = on && playing() ? icons.pause : icons.play;
    });
  }

  function paint() {
    if (!panel) return;
    const statusText = activePadPlays.size && viewMode === 'pad'
      ? `Pad tocando (${activePadPlays.size})`
      : viewMode === 'pad'
        ? `${padSamples.length} sons`
        : playing()
          ? `Tocando · ${MODES.find(([id]) => id === mode)?.[1] || ''}`
          : track()
            ? 'Pausado'
            : 'Sem faixas';
    const sub = panel.querySelector('#music-status');
    if (sub) {
      sub.textContent = statusText;
      sub.classList.toggle('on', playing() || activePadPlays.size > 0);
    }
    if (viewMode !== 'tracks') {
      paintPadProgress();
      return;
    }
    const t = track();
    const playingNow = playing();
    const name = panel.querySelector('#music-now-name');
    if (name) name.textContent = t ? t.name : 'Nenhuma faixa selecionada';
    const play = panel.querySelector('#music-play');
    if (play) {
      play.innerHTML = `${playingNow ? icons.pause : icons.play}<span>${playingNow ? 'Pausar' : 'Tocar'}</span>`;
      play.setAttribute('aria-label', playingNow ? 'Pausar trilha sonora' : 'Tocar trilha sonora');
    }
    const vol = panel.querySelector('#music-vol');
    if (vol && document.activeElement !== vol) vol.value = String(Math.round(volume * 100));
    const volVal = panel.querySelector('#music-vol-val');
    if (volVal) volVal.textContent = `${Math.round(volume * 100)}%`;
    const mute = panel.querySelector('#music-mute');
    if (mute) {
      mute.classList.toggle('on', muted);
      mute.innerHTML = muted ? icons.volumeOff : icons.volume;
      mute.setAttribute('aria-pressed', String(muted));
      mute.title = muted ? 'Reativar o som da trilha' : 'Silenciar a trilha';
    }
    const mon = panel.querySelector('#music-monitor');
    if (mon) {
      mon.checked = hostMon;
      mon.setAttribute('aria-checked', String(hostMon));
    }
    panel.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    panel.querySelectorAll('[data-track]').forEach((row) => row.classList.toggle('active', row.dataset.track === currentId));
    paintTime();
  }

  function select(id, { autoplay = false } = {}) {
    const t = track(id);
    if (!t) return;
    const changed = currentId !== id;
    currentId = id;
    if (changed || audio.dataset.trackId !== id) {
      audio.pause();
      audio.src = t.url;
      audio.dataset.trackId = id;
      audio.load();
    }
    persist();
    paint();
    emitPadState();
    if (autoplay) play();
  }

  async function play(id = '') {
    if (id && id !== currentId) select(id);
    const t = track();
    if (!t) {
      toast('Adicione uma faixa de áudio para tocar a trilha.', 'info');
      return;
    }
    if (audio.dataset.trackId !== t.id || !audio.getAttribute('src')) {
      audio.src = t.url;
      audio.dataset.trackId = t.id;
    }
    try {
      await mixer?.resume?.();
      await audio.play();
      paint();
      emitPadState();
      notify();
    } catch (e) {
      toast(`Não foi possível tocar a trilha: ${e.message}`, 'err');
    }
  }

  function pause() {
    audio.pause();
    paint();
    emitPadState();
    notify();
  }

  function stop() {
    audio.pause();
    try { audio.currentTime = 0; } catch {}
    paint();
    emitPadState();
    notify();
  }

  function toggle() {
    if (playing()) pause();
    else play();
  }

  function step(delta, { autoplay = true } = {}) {
    if (!tracks.length) return;
    let i = idx();
    if (i < 0) i = 0;
    i = (i + delta + tracks.length) % tracks.length;
    select(tracks[i].id, { autoplay });
  }

  function setMode(next) {
    if (!MODES.some(([id]) => id === next)) return;
    mode = next;
    persist();
    paint();
    emitPadState();
    notify();
  }

  function setVolume(v) {
    volume = clamp01(v);
    const eff = padDucked ? volume * 0.22 : volume;
    mixer?.setVolume?.(CHANNEL, eff, { save: false });
    persist();
    paint();
    emitPadState();
    notify();
  }

  function setMuted(next = !muted) {
    muted = !!next;
    mixer?.setMuted?.(CHANNEL, muted, { save: false });
    paint();
    emitPadState();
    notify();
  }

  function setMonitor(next = !hostMon) {
    hostMon = !!next;
    mixer?.setRoute?.(CHANNEL, { program: true, monitor: hostMon });
    persist();
    paint();
    emitPadState();
    notify();
  }

  function syncFromMixer() {
    const s = mixer?.sources?.get(CHANNEL);
    if (!s) return;
    if (!padDucked) volume = clamp01(s.volume);
    muted = !!s.muted;
    if (s.route) hostMon = s.route.monitor !== false;
    persist();
    paint();
    emitPadState();
  }

  function moveTrack(fromId, targetId, { after = false } = {}) {
    if (!fromId || !targetId || fromId === targetId) return false;
    const fromIdx = idx(fromId);
    if (fromIdx < 0) return false;
    const [item] = tracks.splice(fromIdx, 1);
    let targetIdx = idx(targetId);
    if (targetIdx < 0) tracks.push(item);
    else {
      if (after) targetIdx++;
      tracks.splice(targetIdx, 0, item);
    }
    persistTrackOrder();
    if (panel && viewMode === 'tracks') render(panel);
    notify();
    return true;
  }

  function moveTrackBy(id, delta) {
    const i = idx(id);
    if (i < 0) return false;
    const next = i + Number(delta || 0);
    if (next < 0 || next >= tracks.length) return false;
    const [item] = tracks.splice(i, 1);
    tracks.splice(next, 0, item);
    persistTrackOrder();
    if (panel && viewMode === 'tracks') render(panel);
    notify();
    return true;
  }

  async function renameTrack(id, nextName) {
    const t = track(id);
    const cleaned = String(nextName || '').trim().slice(0, 90);
    if (!t || !cleaned || cleaned === t.name) return false;
    t.name = cleaned;
    try {
      const rec = await idbGet(DB_NAME, STORE, prefix + id);
      if (rec) await idbPut(DB_NAME, STORE, prefix + id, { ...rec, displayName: cleaned });
    } catch {}
    if (panel && viewMode === 'tracks') render(panel);
    notify();
    return true;
  }

  async function addFiles(files) {
    const list = [...(files || [])];
    let added = 0;
    for (const file of list) {
      if (!isAudio(file)) {
        toast(`${file?.name || 'Arquivo'}: use um arquivo de áudio.`, 'err');
        continue;
      }
      if (tracks.length >= MAX_TRACKS) {
        toast(`Limite de ${MAX_TRACKS} faixas na trilha.`, 'err');
        break;
      }
      if (file.size > MAX_FILE) {
        toast(`${file.name}: maior que 300 MB.`, 'err');
        continue;
      }
      const id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        await idbPut(DB_NAME, STORE, prefix + id, { name: file.name, file, size: file.size, addedAt: Date.now() });
      } catch (e) {
        toast(`Não foi possível guardar ${file.name}: ${e.message}`, 'err');
        continue;
      }
      const t = { id, name: cleanName(file.name), file, url: URL.createObjectURL(file), duration: 0, addedAt: Date.now() };
      tracks.push(t);
      probe(t);
      if (!currentId) select(id);
      added++;
    }
    if (added) {
      persist();
      if (panel) render(panel);
      toast(`${added} faixa${added === 1 ? '' : 's'} na trilha sonora.`, 'ok');
      emitPadState();
      notify();
    }
  }

  function probe(t) {
    const a = new Audio();
    a.preload = 'metadata';
    a.src = t.url;
    a.onloadedmetadata = () => {
      t.duration = Number.isFinite(a.duration) ? a.duration : 0;
      try { a.removeAttribute('src'); } catch {}
      paint();
    };
    a.onerror = () => {
      try { a.removeAttribute('src'); } catch {}
    };
  }

  async function remove(id) {
    const i = idx(id);
    if (i < 0) return;
    const [t] = tracks.splice(i, 1);
    const wasPlaying = currentId === id && playing();
    if (currentId === id) {
      audio.pause();
      audio.removeAttribute('src');
      audio.dataset.trackId = '';
      audio.load();
      currentId = '';
    }
    try { URL.revokeObjectURL(t.url); } catch {}
    await idbDel(DB_NAME, STORE, prefix + id).catch(() => {});
    if (!currentId && tracks.length) {
      const next = tracks[Math.min(i, tracks.length - 1)];
      select(next.id, { autoplay: wasPlaying });
    } else {
      persist();
      paint();
    }
    if (panel) render(panel);
    emitPadState();
    notify();
  }

  // ---------- Pad: Sondeo de Duração + Grupos + Gerenciamento ----------
  function flushProbeUi() {
    if (probeTimer) return;
    probeTimer = setTimeout(() => {
      probeTimer = null;
      persistPad();
      if (panel && viewMode === 'pad') renderPadGrid(panel);
      emitPadState();
    }, 180);
  }

  function probePadSamples(list) {
    const pending = list.filter((s) => s.url && (!(s.duration > 0) || (s.kind === 'video' && !s.thumb)));
    if (!pending.length) return;
    let cursor = 0;
    const next = () => {
      if (cursor >= pending.length) return;
      const sample = pending[cursor++];
      const isVid = sample.kind === 'video';
      const a = isVid ? document.createElement('video') : new Audio();
      a.preload = 'metadata';
      if (isVid) {
        a.muted = true;
        a.playsInline = true;
      }
      a.src = sample.url;
      let finished = false;
      let timer = null;
      let capTimer = null;
      const captureThumb = () => {
        try {
          if (a.videoWidth > 0 && a.videoHeight > 0) {
            const cv = document.createElement('canvas');
            cv.width = 128;
            cv.height = 72;
            const ctx = cv.getContext('2d');
            const sc = Math.min(128 / a.videoWidth, 72 / a.videoHeight);
            const dw = a.videoWidth * sc;
            const dh = a.videoHeight * sc;
            ctx.drawImage(a, (128 - dw) / 2, (72 - dh) / 2, dw, dh);
            sample.thumb = cv.toDataURL('image/webp', 0.72);
            flushProbeUi();
          }
        } catch {}
      };
      const done = () => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        if (capTimer) clearTimeout(capTimer);
        try {
          a.pause?.();
          a.onloadedmetadata = null;
          a.onloadeddata = null;
          a.onseeked = null;
          a.onerror = null;
          a.removeAttribute('src');
          a.load?.();
        } catch {}
        next();
      };
      timer = setTimeout(done, isVid ? 5000 : 4000);
      a.onloadedmetadata = () => {
        if (Number.isFinite(a.duration) && a.duration > 0) {
          sample.duration = a.duration;
          padMeta[sample.id] = { ...(padMeta[sample.id] || {}), duration: a.duration };
          flushProbeUi();
        }
        if (!isVid || sample.thumb) {
          done();
          return;
        }
        try {
          const p = a.play?.();
          if (p?.catch) {
            p.catch(() => {
              if (a.readyState >= 2) {
                captureThumb();
                done();
              }
            });
          }
        } catch {}
      };
      if (isVid) {
        a.onloadeddata = () => {
          if (finished || sample.thumb || capTimer) return;
          capTimer = setTimeout(() => {
            captureThumb();
            done();
          }, 320);
        };
      }
      a.onerror = done;
    };
    for (let k = 0; k < Math.min(3, pending.length); k++) next();
  }

  const validGroupId = (cat) => {
    if (padGroups.some((g) => g.id === cat)) return cat;
    return padGroups[padGroups.length - 1]?.id || 'custom';
  };

  function rebuildPadList(customRows = []) {
    const merged = [];
    for (const p of padPresets) {
      const m = padMeta[p.id] || {};
      if (m.hidden) continue;
      merged.push({
        id: p.id,
        name: m.name || p.name,
        category: validGroupId(m.category || p.category || 'brasil'),
        color: m.color || p.color || 'blue',
        fav: !!m.fav,
        url: p.url,
        kind: p.kind === 'video' || PAD_VIDEO_EXT.test(p.url || p.file || '') ? 'video' : 'audio',
        overlayMode: PAD_OVERLAY_MODES.includes(m.overlayMode || p.overlayMode) ? (m.overlayMode || p.overlayMode) : 'once',
        vSend: m.vSend !== false && p.vSend !== false,
        builtin: true,
        duration: Number(m.duration || p.duration || 0),
        addedAt: 0,
      });
    }
    for (const c of customRows) {
      const m = padMeta[c.id] || {};
      merged.push({
        id: c.id,
        name: m.name || c.name,
        category: validGroupId(m.category || c.category || 'custom'),
        color: m.color || c.color || 'purple',
        fav: !!m.fav,
        file: c.file,
        url: c.url,
        kind: c.kind === 'video' ? 'video' : 'audio',
        overlayMode: PAD_OVERLAY_MODES.includes(m.overlayMode || c.overlayMode) ? (m.overlayMode || c.overlayMode) : 'once',
        vSend: m.vSend !== false && c.vSend !== false,
        builtin: false,
        duration: Number(m.duration || c.duration || 0),
        addedAt: c.addedAt || 0,
      });
    }
    const rank = new Map(padOrder.map((id, i) => [id, i]));
    merged.sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : 99999;
      const rb = rank.has(b.id) ? rank.get(b.id) : 99999;
      if (ra !== rb) return ra - rb;
      return (a.addedAt || 0) - (b.addedAt || 0);
    });
    padSamples = merged;
    probePadSamples(padSamples);
  }

  function restorePad() {
    if (padRestored) return Promise.resolve();
    if (padRestorePromise) return padRestorePromise;
    padRestorePromise = (async () => {
      try {
        let presetData = null;
        for (const ep of ['/api/pad-sounds', '/sounds/pad/manifest.json']) {
          try {
            const r = await fetch(ep, { cache: 'no-store' });
            if (r.ok) {
              presetData = await r.json();
              if (Array.isArray(presetData?.sounds)) break;
            }
          } catch {}
        }
        padPresets = Array.isArray(presetData?.sounds) ? presetData.sounds : [];
        const rows = (await idbAll(PAD_DB_NAME, PAD_STORE).catch(() => [])).filter(({ key }) => String(key).startsWith(prefix));
        const custom = [];
        for (const { key, rec } of rows) {
          if (!rec?.file) continue;
          const id = String(key).slice(prefix.length);
          custom.push({
            id,
            name: cleanName(rec.name),
            category: rec.category || 'custom',
            color: rec.color || 'purple',
            file: rec.file,
            url: URL.createObjectURL(rec.file),
            kind: rec.kind === 'video' || isPadVideo(rec.file) ? 'video' : 'audio',
            overlayMode: PAD_OVERLAY_MODES.includes(rec.overlayMode) ? rec.overlayMode : 'once',
            vSend: rec.vSend !== false,
            duration: Number(rec.duration) || 0,
            addedAt: rec.addedAt || 0,
          });
        }
        rebuildPadList(custom);
        persistPad();
        padRestored = true;
        if (panel && viewMode === 'pad') render(panel);
        emitPadState();
      } catch (e) {
        console.warn('[pad] restore:', e);
        padRestorePromise = null;
      }
    })();
    return padRestorePromise;
  }

  // ---------- Gestão de Grupos do Pad ----------
  function addPadGroup({ name, icon = '🎵', color = 'blue' } = {}) {
    const label = String(name || '').trim().slice(0, 40);
    if (!label) return null;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'grp';
    const id = `${slug}-${Date.now().toString(36).slice(-4)}`;
    const group = { id, name: label, icon: String(icon || '🎵').slice(0, 4), color: String(color || 'blue') };
    padGroups.push(group);
    removedDefaultGroups.delete(id);
    persistPad();
    if (panel && viewMode === 'pad') render(panel);
    emitPadState();
    return group;
  }

  function updatePadGroup(id, patch = {}) {
    const g = padGroups.find((x) => x.id === id);
    if (!g) return false;
    if (typeof patch.name === 'string' && patch.name.trim()) g.name = patch.name.trim().slice(0, 40);
    if (typeof patch.icon === 'string' && patch.icon.trim()) g.icon = patch.icon.trim().slice(0, 4);
    if (typeof patch.color === 'string') g.color = patch.color;
    persistPad();
    if (panel && viewMode === 'pad') render(panel);
    emitPadState();
    return true;
  }

  function removePadGroup(id) {
    if (padGroups.length <= 1) {
      toast('Mantenha pelo menos 1 grupo no Pad.', 'info');
      return false;
    }
    const i = padGroups.findIndex((x) => x.id === id);
    if (i < 0) return false;
    padGroups.splice(i, 1);
    if (DEFAULT_PAD_GROUPS.some((d) => d.id === id)) removedDefaultGroups.add(id);
    padCollapsed.delete(id);
    const fallbackId = padGroups.find((g) => g.id === 'custom')?.id || padGroups[0].id;
    for (const s of padSamples) {
      if (s.category === id) {
        s.category = fallbackId;
        padMeta[s.id] = { ...(padMeta[s.id] || {}), category: fallbackId };
      }
    }
    if (padCategory === id) padCategory = 'all';
    persistPad();
    if (panel && viewMode === 'pad') render(panel);
    emitPadState();
    return true;
  }

  function movePadGroup(fromId, targetId, { after = false } = {}) {
    if (!fromId || !targetId || fromId === targetId) return false;
    const fromIdx = padGroups.findIndex((g) => g.id === fromId);
    if (fromIdx < 0) return false;
    const [item] = padGroups.splice(fromIdx, 1);
    let targetIdx = padGroups.findIndex((g) => g.id === targetId);
    if (targetIdx < 0) padGroups.push(item);
    else {
      if (after) targetIdx++;
      padGroups.splice(targetIdx, 0, item);
    }
    persistPad();
    emitPadState();
    return true;
  }

  function movePadGroupBy(id, delta) {
    const i = padGroups.findIndex((g) => g.id === id);
    if (i < 0) return false;
    const next = i + Number(delta || 0);
    if (next < 0 || next >= padGroups.length) return false;
    const [item] = padGroups.splice(i, 1);
    padGroups.splice(next, 0, item);
    persistPad();
    emitPadState();
    return true;
  }

  function togglePadGroupCollapse(id) {
    if (padCollapsed.has(id)) padCollapsed.delete(id);
    else padCollapsed.add(id);
    persistPad();
    emitPadState();
  }

  function setPadGrouped(on) {
    padGrouped = !!on;
    persistPad();
    emitPadState();
  }

  // ---------- Disparo, Progresso & Limpeza ----------
  async function loadPadBuffer(sample, ctx) {
    const cached = padBufferCache.get(sample.id);
    if (cached) return cached;
    let ab;
    if (sample.file) ab = await sample.file.arrayBuffer();
    else {
      const r = await fetch(sample.url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      ab = await r.arrayBuffer();
    }
    const decoded = await ctx.decodeAudioData(ab);
    padBufferCache.set(sample.id, decoded);
    if (decoded.duration > 0) {
      sample.duration = decoded.duration;
      padMeta[sample.id] = { ...(padMeta[sample.id] || {}), duration: decoded.duration };
      persistPad();
    }
    return decoded;
  }

  function getActiveVideoOverlays() {
    return [...activeVideoOverlays.values()].filter((o) => o.el && o.el.readyState >= 2 && o.el.videoWidth > 0);
  }

  function stopAllPads() {
    if (!activePadPlays.size && !activeVideoOverlays.size) return;
    for (const p of [...activePadPlays.values()]) {
      try { p.stop(); } catch {}
    }
    activePadPlays.clear();
    activeVideoOverlays.clear();
    syncAmbientDucking();
    stopPadTickIfIdle();
    if (panel && viewMode === 'pad') paint();
    emitPadState();
  }

  function stopPadSample(sampleId) {    let stopped = false;
    for (const p of [...activePadPlays.values()]) {
      if (p.sampleId === sampleId) {
        try { p.stop(); } catch {}
        activePadPlays.delete(p.playId);
        stopped = true;
      }
    }
    if (stopped) {
      syncAmbientDucking();
      stopPadTickIfIdle();
      if (panel && viewMode === 'pad') paint();
      emitPadState();
    }
    return stopped;
  }

  // ---- seek (usar o Pad como playout alternativo: clicar/arrastar na barra vai para o ponto) ----
  // Se o material estiver tocando, reposiciona; se estiver parado, começa dali (play a partir do clique).
  function seekPad(id, seconds) {
    const sample = padSamples.find((s) => s.id === id);
    if (!sample) return false;
    const t = Math.max(0, Number(seconds) || 0);
    const plays = [...activePadPlays.values()].filter((p) => p.sampleId === id);
    if (!plays.length) {
      playPad(id, { offset: t });
      return true;
    }
    for (const p of plays) {
      try { p.seek?.(t); } catch {}
    }
    if (panel && viewMode === 'pad') paintPadProgress();
    emitPadState();
    return true;
  }

  function seekPadPct(id, pct) {
    const sample = padSamples.find((s) => s.id === id);
    const dur = Number(sample?.duration) || 0;
    const p = Math.max(0, Math.min(1, Number(pct) || 0));
    if (dur > 0) return seekPad(id, p * dur);
    // duração ainda desconhecida: guarda para aplicar no loadedmetadata
    const plays = [...activePadPlays.values()].filter((x) => x.sampleId === id);
    if (plays.length) {
      for (const pl of plays) {
        const d = Number(pl.duration) || 0;
        if (d > 0) try { pl.seek?.(p * d); } catch {}
      }
      emitPadState();
      return true;
    }
    return false;
  }

  // ---- pause/retomar o efeito que está tocando (mantém o ponto atual) ----
  function togglePadPause(sampleId) {
    const id = sampleId || lastPadSampleId;
    if (!id) return false;
    const plays = [...activePadPlays.values()].filter((p) => p.sampleId === id);
    if (!plays.length) return false;
    const anyPlaying = plays.some((p) => !p.paused);
    for (const p of plays) {
      try { anyPlaying ? p.pause?.() : p.resume?.(); } catch {}
    }
    syncAmbientDucking();
    if (panel && viewMode === 'pad') paintPadProgress();
    emitPadState();
    return true;
  }

  async function playPad(id, opts = {}) {
    const sample = padSamples.find((s) => s.id === id);
    if (!sample) return;
    const startAt = Math.max(0, Number(opts?.offset) || 0);
    // Se um overlay de vídeo deste pad já está ativo ou travado no PGM, clicar de novo tira do ar (toggle).
    if (sample.kind === 'video' && [...activeVideoOverlays.values()].some((o) => o.sampleId === sample.id)) {
      stopPadSample(sample.id);
      return;
    }
    lastPadSampleId = sample.id;
    if (!padOverlap) {
      for (const p of [...activePadPlays.values()]) {
        try { p.stop(); } catch {}
      }
      activePadPlays.clear();
      activeVideoOverlays.clear();
    }

    const playId = `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    if (sample.kind === 'video') {
      const mode = PAD_OVERLAY_MODES.includes(sample.overlayMode) ? sample.overlayMode : 'once';
      const vid = document.createElement('video');
      vid.playsInline = true;
      vid.preload = 'auto';
      vid.crossOrigin = 'anonymous';
      vid.loop = mode === 'loop';
      vid.src = sample.url;
      let mediaNode = null;
      const ovEntry = {
        playId,
        sampleId: sample.id,
        name: sample.name,
        el: vid,
        mode,
        vertical: sample.vSend !== false,
        held: false,
        startedAt: performance.now(),
        duration: sample.duration || 0,
      };
      const cleanup = () => {
        activeVideoOverlays.delete(playId);
        activePadPlays.delete(playId);
        try { vid.onended = null; vid.pause(); vid.removeAttribute('src'); vid.load(); } catch {}
        try { mediaNode?.disconnect(); } catch {}
      };
      const vstate = { paused: false };
      const entry = {
        playId,
        sampleId: sample.id,
        name: sample.name,
        startedAt: ovEntry.startedAt,
        duration: ovEntry.duration,
        // posição/seek pelo próprio <video>: o overlay no PGM acompanha na hora (usado como playout)
        position: () => Math.max(0, vid.currentTime || 0),
        seek: (t) => {
          try {
            const lim = Number.isFinite(vid.duration) && vid.duration > 0 ? Math.max(0, vid.duration - 0.02) : t;
            vid.currentTime = Math.max(0, Math.min(lim, t));
          } catch {}
        },
        get paused() { return vstate.paused; },
        pause: () => { try { vid.pause(); vstate.paused = true; } catch {} },
        resume: () => { try { vid.play(); vstate.paused = false; } catch {} },
        setGain: (v) => { try { if (!mediaNode) vid.volume = clamp01(v); } catch {} },
        stop: cleanup,
      };
      activePadPlays.set(playId, entry);
      activeVideoOverlays.set(playId, ovEntry);
      try {
        await mixer?.resume?.();
        const busInfo = ensurePadBus();
        if (busInfo?.ctx?.state === 'suspended') await busInfo.ctx.resume().catch(() => {});
        if (busInfo?.ctx && busInfo?.dest) {
          mediaNode = busInfo.ctx.createMediaElementSource(vid);
          mediaNode.connect(busInfo.dest);
        } else {
          vid.volume = padMuted ? 0 : padVolume;
        }
        vid.onloadedmetadata = () => {
          if (Number.isFinite(vid.duration) && vid.duration > 0) {
            entry.duration = vid.duration;
            ovEntry.duration = vid.duration;
            sample.duration = vid.duration;
          }
        };
        vid.onended = () => {
          if (!activeVideoOverlays.has(playId)) return;
          if (mode === 'hold') {
            ovEntry.held = true;
            try {
              vid.pause();
              if (Number.isFinite(vid.duration) && vid.duration > 0.03) vid.currentTime = vid.duration - 0.015;
            } catch {}
            syncAmbientDucking();
            stopPadTickIfIdle();
            if (panel && viewMode === 'pad') paint();
            emitPadState();
            return;
          }
          cleanup();
          syncAmbientDucking();
          stopPadTickIfIdle();
          if (panel && viewMode === 'pad') paint();
          emitPadState();
        };
        await vid.play();
        // seek inicial (clicar na barra de um padrão parado começa naquele ponto)
        if (startAt > 0) {
          await new Promise((res) => {
            if (vid.readyState >= 1) return res();
            vid.addEventListener('loadedmetadata', res, { once: true });
            setTimeout(res, 2500);
          });
          try {
            const lim = Number.isFinite(vid.duration) && vid.duration > 0 ? Math.max(0, vid.duration - 0.05) : startAt;
            vid.currentTime = Math.min(startAt, lim);
          } catch {}
        }
        syncAmbientDucking();
        startPadTick();
        if (panel && viewMode === 'pad') paint();
        emitPadState();
      } catch (e) {
        cleanup();
        syncAmbientDucking();
        toast(`Erro ao reproduzir overlay "${sample.name}": ${e.message}`, 'err');
        emitPadState();
      }
      return;
    }
    try {
      await mixer?.resume?.();
      const busInfo = ensurePadBus();
      if (busInfo?.ctx?.state === 'suspended') {
        await busInfo.ctx.resume().catch(() => {});
      }
      if (busInfo?.ctx && busInfo?.dest) {
        const buffer = await loadPadBuffer(sample, busInfo.ctx);
        const ctx = busInfo.ctx;
        const dur = buffer.duration || 0;
        // Fonte reiniciável: o seek para este caminho (WebAudio) recria o nó no ponto pedido.
        let node = null;
        let base = 0; // offset (s) do trecho atual
        let ctxStart = ctx.currentTime;
        const startNodeAt = (t) => {
          const lim = dur > 0 ? Math.max(0, dur - 0.01) : t;
          base = Math.max(0, Math.min(lim, t));
          try { if (node) { node.onended = null; node.stop(0); node.disconnect(); } } catch {}
          node = ctx.createBufferSource();
          node.buffer = buffer;
          node.connect(busInfo.dest);
          node.onended = () => {
            if (!activePadPlays.has(playId)) return;
            activePadPlays.delete(playId);
            try { node?.disconnect(); } catch {}
            syncAmbientDucking();
            stopPadTickIfIdle();
            if (panel && viewMode === 'pad') paint();
            emitPadState();
          };
          ctxStart = ctx.currentTime;
          node.start(0, base);
        };
        let pausedAt = 0;
        const wstate = { paused: false };
        const entry = {
          playId,
          sampleId: sample.id,
          name: sample.name,
          startedAt: performance.now(),
          duration: dur,
          position: () => (wstate.paused ? pausedAt : Math.max(0, Math.min(dur, base + Math.max(0, ctx.currentTime - ctxStart)))),
          seek: (t) => {
            if (wstate.paused) { pausedAt = Math.max(0, Math.min(dur, t)); return; }
            startNodeAt(t);
          },
          get paused() { return wstate.paused; },
          pause: () => {
            if (wstate.paused) return;
            pausedAt = Math.max(0, Math.min(dur, base + Math.max(0, ctx.currentTime - ctxStart)));
            try { if (node) { node.onended = null; node.stop(0); node.disconnect(); } } catch {}
            wstate.paused = true;
          },
          resume: () => {
            if (!wstate.paused) return;
            wstate.paused = false;
            startNodeAt(pausedAt);
          },
          stop: () => {
            try { if (node) { node.onended = null; node.stop(0); node.disconnect(); } } catch {}
          },
        };
        activePadPlays.set(playId, entry);
        startNodeAt(startAt);
      } else {
        const el = new Audio(sample.url);
        el.volume = padMuted ? 0 : padVolume;
        const astate = { paused: false };
        const entry = {
          playId,
          sampleId: sample.id,
          name: sample.name,
          startedAt: performance.now(),
          duration: sample.duration || 0,
          position: () => Math.max(0, el.currentTime || 0),
          seek: (t) => {
            try {
              const lim = Number.isFinite(el.duration) && el.duration > 0 ? Math.max(0, el.duration - 0.02) : t;
              el.currentTime = Math.max(0, Math.min(lim, t));
            } catch {}
          },
          get paused() { return astate.paused; },
          pause: () => { try { el.pause(); astate.paused = true; } catch {} },
          resume: () => { try { el.play(); astate.paused = false; } catch {} },
          setGain: (v) => { try { el.volume = clamp01(v); } catch {} },
          stop: () => {
            try { el.onended = null; el.pause(); el.currentTime = 0; } catch {}
          },
        };
        activePadPlays.set(playId, entry);
        el.onloadedmetadata = () => {
          if (Number.isFinite(el.duration) && el.duration > 0) {
            entry.duration = el.duration;
            sample.duration = el.duration;
          }
          if (startAt > 0) {
            try { el.currentTime = Math.min(startAt, Math.max(0, (el.duration || startAt) - 0.05)); } catch {}
          }
        };
        el.onended = () => {
          if (!activePadPlays.has(playId)) return;
          activePadPlays.delete(playId);
          syncAmbientDucking();
          stopPadTickIfIdle();
          if (panel && viewMode === 'pad') paint();
          emitPadState();
        };
        await el.play();
      }
      syncAmbientDucking();
      startPadTick();
      if (panel && viewMode === 'pad') paint();
      emitPadState();
    } catch (e) {
      activePadPlays.delete(playId);
      syncAmbientDucking();
      toast(`Erro ao tocar sample "${sample.name}": ${e.message}`, 'err');
      emitPadState();
    }
  }

  async function addPadFiles(files, { category = 'custom', color = '', overlayMode = 'once', onProgress = null } = {}) {
    const rawList = [...(files || [])];
    const mediaFiles = rawList.filter((f) => isPadMedia(f));
    const skipped = rawList.length - mediaFiles.length;
    if (!mediaFiles.length) {
      if (rawList.length) toast('Nenhum arquivo válido (.mp3, .wav, .ogg, .webm, .mp4...) encontrado.', 'err');
      return 0;
    }
    const targetGroup = validGroupId(category || 'custom');
    const palette = PAD_COLORS.map(([c]) => c);
    const addedSamples = [];
    for (let i = 0; i < mediaFiles.length; i++) {
      const file = mediaFiles[i];
      if (padSamples.length >= MAX_PAD_SAMPLES) {
        toast(`Limite de ${MAX_PAD_SAMPLES} samples no Pad.`, 'err');
        break;
      }
      const isVid = isPadVideo(file);
      const maxBytes = isVid ? MAX_PAD_VIDEO : MAX_PAD_AUDIO;
      if (file.size > maxBytes) {
        toast(`${file.name}: maior que ${isVid ? '1 GB' : '50 MB'}.`, 'err');
        continue;
      }
      const id = `pad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const padColor = color && color !== 'auto' ? color : palette[(padSamples.length + i) % palette.length];
      const ovMode = PAD_OVERLAY_MODES.includes(overlayMode) ? overlayMode : 'once';
      try {
        await idbPut(PAD_DB_NAME, PAD_STORE, prefix + id, {
          name: file.name,
          category: targetGroup,
          color: padColor,
          kind: isVid ? 'video' : 'audio',
          overlayMode: ovMode,
          file,
          size: file.size,
          addedAt: Date.now(),
        });
      } catch (e) {
        toast(`Não foi possível salvar ${file.name}: ${e.message}`, 'err');
        continue;
      }
      const sample = {
        id,
        name: cleanName(file.name),
        category: targetGroup,
        color: padColor,
        fav: false,
        file,
        url: URL.createObjectURL(file),
        kind: isVid ? 'video' : 'audio',
        overlayMode: ovMode,
        builtin: false,
        duration: 0,
        addedAt: Date.now(),
      };
      padSamples.push(sample);
      addedSamples.push(sample);
      onProgress?.({ done: i + 1, total: mediaFiles.length, added: addedSamples.length, name: sample.name });
    }
    if (addedSamples.length) {
      persistPad();
      probePadSamples(addedSamples);
      if (panel && viewMode === 'pad') render(panel);
      emitPadState();
      const extra = skipped ? ` (${skipped} arquivo${skipped === 1 ? '' : 's'} ignorado${skipped === 1 ? '' : 's'})` : '';
      toast(`${addedSamples.length} item${addedSamples.length === 1 ? '' : 's'} cadastrado${addedSamples.length === 1 ? '' : 's'} no grupo.${extra}`, 'ok');
    }
    return addedSamples.length;
  }

  function updatePadMeta(id, patch) {
    const sample = padSamples.find((s) => s.id === id);
    if (!sample) return false;
    padMeta[id] = { ...(padMeta[id] || {}), ...patch };
    if (typeof patch.name === 'string' && patch.name.trim()) sample.name = patch.name.trim().slice(0, 90);
    if (typeof patch.color === 'string') sample.color = patch.color;
    if (typeof patch.category === 'string') sample.category = validGroupId(patch.category);
    if (typeof patch.fav === 'boolean') sample.fav = patch.fav;
    if (PAD_OVERLAY_MODES.includes(patch.overlayMode)) sample.overlayMode = patch.overlayMode;
    if (typeof patch.vSend === 'boolean') sample.vSend = patch.vSend;
    persistPad();
    if (panel && viewMode === 'pad') render(panel);
    emitPadState();
    return true;
  }

  async function removePadSample(id) {
    const i = padSamples.findIndex((s) => s.id === id);
    if (i < 0) return false;
    stopPadSample(id);
    const [s] = padSamples.splice(i, 1);
    padBufferCache.delete(id);
    if (s.builtin) {
      padMeta[id] = { ...(padMeta[id] || {}), hidden: true };
    } else {
      delete padMeta[id];
      try { URL.revokeObjectURL(s.url); } catch {}
      await idbDel(PAD_DB_NAME, PAD_STORE, prefix + id).catch(() => {});
    }
    persistPad();
    if (panel && viewMode === 'pad') render(panel);
    emitPadState();
    return true;
  }

  async function clearAllPads({ force = false } = {}) {
    if (!force && !padSamples.length) return false;
    stopAllPads();
    for (const s of padSamples) {
      if (s.builtin) {
        padMeta[s.id] = { ...(padMeta[s.id] || {}), hidden: true };
      } else {
        delete padMeta[s.id];
        try { URL.revokeObjectURL(s.url); } catch {}
      }
    }
    for (const p of padPresets) {
      padMeta[p.id] = { ...(padMeta[p.id] || {}), hidden: true };
    }
    try {
      const rows = await idbAll(PAD_DB_NAME, PAD_STORE);
      for (const { key } of rows) {
        if (String(key).startsWith(prefix)) await idbDel(PAD_DB_NAME, PAD_STORE, key).catch(() => {});
      }
    } catch {}
    padBufferCache.clear();
    padSamples = [];
    padOrder = [];
    persistPad();
    if (panel && viewMode === 'pad') render(panel);
    emitPadState();
    toast('Todos os samples do Pad foram removidos.', 'info');
    return true;
  }

  function restorePresetPads() {
    for (const key of Object.keys(padMeta)) {
      if (padMeta[key]?.hidden) delete padMeta[key].hidden;
    }
    for (const def of DEFAULT_PAD_GROUPS) {
      removedDefaultGroups.delete(def.id);
      if (!padGroups.some((g) => g.id === def.id)) padGroups.push({ ...def });
    }
    const custom = padSamples.filter((s) => !s.builtin);
    rebuildPadList(custom);
    persistPad();
    if (panel && viewMode === 'pad') render(panel);
    emitPadState();
    toast('Sons e grupos padrão restaurados no Pad.', 'ok');
  }

  function movePad(fromId, targetId, { after = false, category = '' } = {}) {
    if (!fromId || fromId === targetId) return false;
    const fromIdx = padSamples.findIndex((s) => s.id === fromId);
    if (fromIdx < 0) return false;
    const [item] = padSamples.splice(fromIdx, 1);
    if (category) {
      const g = validGroupId(category);
      item.category = g;
      padMeta[item.id] = { ...(padMeta[item.id] || {}), category: g };
    }
    let targetIdx = targetId ? padSamples.findIndex((s) => s.id === targetId) : -1;
    if (targetIdx < 0) padSamples.push(item);
    else {
      if (after) targetIdx++;
      padSamples.splice(targetIdx, 0, item);
    }
    persistPad();
    if (panel && viewMode === 'pad') render(panel);
    emitPadState();
    return true;
  }

  function replayLastPad() {
    const target = padSamples.find((s) => s.id === lastPadSampleId) || padSamples[0] || null;
    if (!target) {
      toast('Nenhum efeito disponível no Pad para tocar.', 'info');
      return false;
    }
    playPad(target.id);
    return true;
  }

  function movePadBy(id, delta, { sameGroup = true } = {}) {
    const dir = Number(delta) < 0 ? -1 : 1;
    const fromIdx = padSamples.findIndex((s) => s.id === id);
    if (fromIdx < 0) return false;
    const sample = padSamples[fromIdx];
    const pool = sameGroup ? padSamples.filter((s) => s.category === sample.category) : padSamples;
    const pos = pool.findIndex((s) => s.id === id);
    const nextPos = pos + dir;
    if (pos < 0 || nextPos < 0 || nextPos >= pool.length) return false;
    return movePad(id, pool[nextPos].id, { after: dir > 0 });
  }

  function movePadToGroup(sampleId, groupId) {
    const sample = padSamples.find((s) => s.id === sampleId);
    if (!sample) return false;
    const g = validGroupId(groupId);
    if (sample.category === g) return false;
    sample.category = g;
    padMeta[sample.id] = { ...(padMeta[sample.id] || {}), category: g };
    persistPad();
    if (panel && viewMode === 'pad') render(panel);
    emitPadState();
    return true;
  }

  function setPadVolume(v) {
    padVolume = clamp01(v);
    ensurePadBus();
    padSyncGuard = true;
    try {
      if (mixer?.sources?.has?.(PAD_CHANNEL)) mixer.setVolume(PAD_CHANNEL, padVolume, { save: true });
    } finally {
      padSyncGuard = false;
    }
    if (fallbackBus) fallbackBus.gain.value = padMuted ? 0 : padVolume;
    for (const p of activePadPlays.values()) p.setGain?.(padMuted ? 0 : padVolume);
    persistPad();
    if (panel && viewMode === 'pad') paintPadProgress();
    emitPadState();
  }

  function setPadMuted(next = !padMuted) {
    padMuted = !!next;
    ensurePadBus();
    padSyncGuard = true;
    try {
      if (mixer?.sources?.has?.(PAD_CHANNEL)) mixer.setMuted(PAD_CHANNEL, padMuted, { save: true });
    } finally {
      padSyncGuard = false;
    }
    if (fallbackBus) fallbackBus.gain.value = padMuted ? 0 : padVolume;
    for (const p of activePadPlays.values()) p.setGain?.(padMuted ? 0 : padVolume);
    persistPad();
    if (panel && viewMode === 'pad') paintPadProgress();
    emitPadState();
  }

  function setPadMonitor(next = !padMonitor) {
    padMonitor = !!next;
    ensurePadBus();
    padSyncGuard = true;
    try {
      mixer?.setRoute?.(PAD_CHANNEL, { program: true, monitor: padMonitor });
    } finally {
      padSyncGuard = false;
    }
    persistPad();
    emitPadState();
  }

  function setPadOverlap(next = !padOverlap) {
    padOverlap = !!next;
    persistPad();
    if (panel && viewMode === 'pad') render(panel);
    emitPadState();
  }

  function setPadDucking(next = !padDucking) {
    padDucking = !!next;
    if (!padDucking) syncAmbientDucking();
    persistPad();
    if (panel && viewMode === 'pad') render(panel);
    emitPadState();
  }

  function setPadCategory(cat) {
    const ok = cat === 'all' || cat === 'fav' || padGroups.some((g) => g.id === cat);
    padCategory = ok ? cat : 'all';
    persistPad();
    if (panel && viewMode === 'pad') render(panel);
    emitPadState();
  }

  function setPadSearch(q) {
    padSearch = String(q || '');
    if (panel && viewMode === 'pad') renderPadGrid(panel);
    emitPadState();
  }

  function syncPadFromMixer() {
    if (padSyncGuard) return;
    const s = mixer?.sources?.get(PAD_CHANNEL);
    if (!s) return;
    const nextVol = clamp01(s.volume);
    const nextMuted = !!s.muted;
    const nextMonitor = s.route ? s.route.monitor !== false : padMonitor;
    const changed = Math.abs(nextVol - padVolume) > 0.0005 || nextMuted !== padMuted || nextMonitor !== padMonitor;
    padVolume = nextVol;
    padMuted = nextMuted;
    padMonitor = nextMonitor;
    if (fallbackBus) fallbackBus.gain.value = padMuted ? 0 : padVolume;
    for (const p of activePadPlays.values()) p.setGain?.(padMuted ? 0 : padVolume);
    persistPad();
    if (panel && viewMode === 'pad') paintPadProgress();
    if (changed) emitPadState();
  }

  function setViewMode(next) {
    viewMode = next === 'pad' ? 'pad' : 'tracks';
    if (viewMode === 'pad' && !padRestored) restorePad();
    persist();
    if (panel) render(panel);
    emitPadState();
    notify();
  }

  function filteredPadSamples() {
    const q = padSearch.trim().toLowerCase();
    return padSamples.filter((s) => {
      if (padCategory === 'fav' && !s.fav) return false;
      if (padCategory !== 'all' && padCategory !== 'fav' && s.category !== padCategory) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function getPadSnapshot() {
    const now = performance.now();
    const activeBySample = new Map();
    let lastPlay = null;
    for (const p of activePadPlays.values()) {
      const paused = !!p.paused;
      // posição real do elemento/nó quando disponível (um seek muda o currentTime; startedAt não acompanha)
      const elapsed = p.position ? Math.max(0, p.position()) : Math.max(0, (now - p.startedAt) / 1000);
      const dur = p.duration || 0;
      const pct = dur > 0 ? Math.max(0, Math.min(1, elapsed / dur)) : 0;
      const remaining = dur > 0 ? Math.max(0, dur - elapsed) : 0;
      const cur = activeBySample.get(p.sampleId);
      if (!cur || elapsed < cur.elapsed) {
        activeBySample.set(p.sampleId, { elapsed, remaining, duration: dur, pct, paused });
      }
      lastPlay = { sampleId: p.sampleId, name: p.name, elapsed, remaining, duration: dur, pct, paused };
    }
    return {
      studioId,
      connectedToMixer: !!mixer?.ctx,
      volume: padVolume,
      muted: padMuted,
      monitor: padMonitor,
      overlap: padOverlap,
      ducking: padDucking,
      grouped: padGrouped,
      collapsed: [...padCollapsed],
      groups: padGroups.map((g) => ({ ...g })),
      category: padCategory,
      search: padSearch,
      playingCount: activePadPlays.size,
      nowPlaying: lastPlay,
      activeSamples: Object.fromEntries(activeBySample.entries()),
      samples: padSamples.map(({ id, name, category, color, fav, builtin, duration, kind, overlayMode, thumb }) => ({ id, name, category, color, fav, builtin, duration, kind: kind || 'audio', overlayMode: overlayMode || 'once', thumb: thumb || '' })),
      lastSampleId: lastPadSampleId || padSamples[0]?.id || '',
      lastSampleName: (padSamples.find((s) => s.id === lastPadSampleId) || padSamples[0])?.name || '',
      ambientPlaying: playing(),
      ambientName: track()?.name || '',
      ambient: {
        playing: playing(),
        currentId: currentId || '',
        name: track()?.name || '',
        trackCount: tracks.length,
        currentTime: Number(audio.currentTime) || 0,
        duration: Number(audio.duration) || track()?.duration || 0,
        volume,
        muted,
        mode,
      },
    };
  }

  function subscribePad(fn) {
    if (typeof fn !== 'function') return () => {};
    padSubscribers.add(fn);
    if (!padRestored) restorePad();
    try { fn(getPadSnapshot()); } catch {}
    return () => padSubscribers.delete(fn);
  }

  function openPadWindow() {
    if (!padRestored) restorePad();
    if (padWin && !padWin.closed) {
      try { padWin.focus(); } catch {}
      return true;
    }
    const W = window.screen.availWidth || 1280;
    const H = window.screen.availHeight || 800;
    const w = Math.min(980, Math.max(600, W - 100));
    const h = Math.min(720, Math.max(520, H - 90));
    const x = Math.max(20, Math.round((window.screenX || 0) + (window.outerWidth || W) - w - 30));
    const y = Math.max(20, Math.round((window.screenY || 0) + 50));
    try {
      padWin = window.open(
        `/pad.html?studio=${encodeURIComponent(studioId)}`,
        `CastDeckPad_${studioId}`,
        `width=${w},height=${h},left=${x},top=${y},menubar=no,toolbar=no,location=no,status=no,resizable=yes`,
      );
      if (padWin && !padWin.closed) {
        padWin.focus();
        toast('Janela Pad aberta! Os efeitos entram direto no mixer do estúdio.');
        return true;
      }
    } catch (e) {
      console.warn('[pad] window.open:', e);
    }
    setViewMode('pad');
    toast('Pop-up bloqueado; abrindo o Pad aqui no painel lateral.', 'info');
    return false;
  }

  function closePadWindow() {
    try {
      if (padWin && !padWin.closed) padWin.close();
    } catch {}
    padWin = null;
  }

  // ---------- Renderização do Painel Lateral ----------
  function paintPadProgress() {
    if (!panel || viewMode !== 'pad') return;
    const snap = getPadSnapshot();
    const vol = panel.querySelector('#pad-vol');
    const activeEl = panel.ownerDocument?.activeElement || document.activeElement;
    if (vol && activeEl !== vol) vol.value = String(Math.round(padVolume * 100));
    const volVal = panel.querySelector('#pad-vol-val');
    if (volVal) volVal.textContent = `${Math.round(padVolume * 100)}%`;
    const muteBtn = panel.querySelector('#pad-mute');
    if (muteBtn) {
      muteBtn.classList.toggle('on', padMuted);
      muteBtn.classList.toggle('danger', padMuted);
      muteBtn.innerHTML = padMuted ? icons.volumeOff : icons.volume;
      muteBtn.setAttribute('aria-pressed', String(padMuted));
      muteBtn.title = padMuted ? 'Reativar som do Pad' : 'Silenciar Pad';
    }

    const nowName = panel.querySelector('#pad-now-name');
    const nowCount = panel.querySelector('#pad-now-count');
    const prog = panel.querySelector('#pad-timer-prog');
    const rem = panel.querySelector('#pad-timer-rem');
    const dur = panel.querySelector('#pad-timer-dur');
    const bar = panel.querySelector('#pad-timer-bar');
    const card = panel.querySelector('#pad-timer-card');

    if (snap.nowPlaying) {
      if (nowName) nowName.textContent = snap.nowPlaying.name;
      if (nowCount) nowCount.textContent = snap.playingCount > 1 ? `${snap.playingCount} ativos` : 'TOCANDO';
      if (prog) prog.textContent = fmtPadClock(snap.nowPlaying.elapsed);
      if (rem) {
        rem.textContent = `-${fmtPadClock(snap.nowPlaying.remaining)}`;
        rem.classList.toggle('ending', snap.nowPlaying.duration > 0 && snap.nowPlaying.remaining < 1.5);
      }
      if (dur) dur.textContent = fmtPadClock(snap.nowPlaying.duration);
      if (bar) bar.style.width = `${Math.round(snap.nowPlaying.pct * 100)}%`;
      card?.classList.add('active');
    } else {
      if (nowName) nowName.textContent = 'Pronto para disparar';
      if (nowCount) nowCount.textContent = 'Parado';
      if (prog) prog.textContent = '00:00.0';
      if (rem) {
        rem.textContent = '-00:00.0';
        rem.classList.remove('ending');
      }
      if (dur) dur.textContent = '00:00.0';
      if (bar) bar.style.width = '0%';
      card?.classList.remove('active');
    }

    const pauseBtn = panel.querySelector('#pad-timer-pause');
    if (pauseBtn) {
      const np = snap.nowPlaying;
      pauseBtn.disabled = !np;
      pauseBtn.classList.toggle('on', !!np?.paused);
      pauseBtn.textContent = np?.paused ? '▶ Retomar' : '⏸ Pausar';
      pauseBtn.title = np?.paused ? 'Retomar o efeito pausado' : 'Pausar o efeito no ponto atual';
    }

    const stopBtn = panel.querySelector('#pad-stop');
    if (stopBtn) stopBtn.disabled = snap.playingCount === 0;
    panel.querySelectorAll('[data-pad-id]').forEach((btn) => {
      const st = snap.activeSamples[btn.dataset.padId];
      btn.classList.toggle('playing', !!st);
      const fill = btn.querySelector('.pad-mini-fill');
      if (fill) fill.style.width = st ? `${Math.round(st.pct * 100)}%` : '0%';
      const durLbl = btn.querySelector('.pad-mini-dur');
      if (durLbl) {
        if (st && st.duration > 0) durLbl.textContent = `${fmtPadClock(st.elapsed)} / -${fmtPadClock(st.remaining)}`;
        else {
          const item = padSamples.find((x) => x.id === btn.dataset.padId);
          durLbl.textContent = item?.duration ? fmtDur(item.duration) : 'MP3';
        }
      }
    });
  }

  // Arrastar/clicar na barra de progresso de um padrão = seek (padrão parado começa naquele ponto).
  function bindPadSeek(el, idOrGetter) {
    if (!el) return;
    const getId = typeof idOrGetter === 'function' ? idOrGetter : () => idOrGetter;
    const seekTo = (ev) => {
      const id = getId();
      if (!id) return;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0)) return;
      const pct = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      seekPadPct(id, pct);
    };
    el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      try { el.setPointerCapture(ev.pointerId); } catch {}
      seekTo(ev);
      const move = (e2) => { e2.preventDefault(); seekTo(e2); };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    el.addEventListener('click', (ev) => ev.stopPropagation());
    // teclado (a barra do "tocando agora" é focável): setas avançam/voltam 2 s
    if (el.tabIndex >= 0) {
      el.addEventListener('keydown', (ev) => {
        if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
        const id = getId();
        if (!id) return;
        ev.preventDefault();
        const sample = padSamples.find((s) => s.id === id);
        const dur = Number(sample?.duration) || 0;
        const plays = [...activePadPlays.values()].filter((p) => p.sampleId === id);
        const pos = plays[0]?.position ? plays[0].position() : 0;
        const delta = ev.key === 'ArrowRight' ? 2 : -2;
        const max = dur > 0 ? Math.max(0, dur - 0.05) : Math.max(0, pos + delta);
        seekPad(id, Math.max(0, Math.min(max, pos + delta)));
      });
    }
  }

  function renderPadGrid(root) {
    const grid = root.querySelector('#pad-mini-grid');
    if (!grid) return;
    const list = filteredPadSamples();
    if (!list.length) {
      grid.innerHTML = `<div class="music-empty">${padSamples.length ? 'Nenhum sample nesta busca/grupo.' : 'Pad vazio. Clique em “+ Massa” para cadastrar ou em “↺ Padrões”.'}</div>`;
      return;
    }
    const active = getPadSnapshot().activeSamples;
    grid.innerHTML = list
      .map((s) => {
        const st = active[s.id];
        const isVid = s.kind === 'video';
        const mode = PAD_OVERLAY_MODES.includes(s.overlayMode) ? s.overlayMode : 'once';
        return `<div class="pad-mini-tile pad-c-${esc(s.color || 'blue')} ${isVid ? 'is-video' : ''} ${st ? 'playing' : ''}" data-pad-id="${esc(s.id)}" draggable="true" title="${esc(s.name)} — clique para ${isVid ? 'disparar overlay' : 'tocar'} ou arraste para reordenar">
          <button type="button" class="pad-mini-trigger" data-pad-play="${esc(s.id)}">
            ${isVid ? `<span class="pad-mini-thumb">${s.thumb ? `<img src="${esc(s.thumb)}" alt="">` : '<span class="pad-mini-vid-ico">🎞️</span>'}</span>` : ''}
            <span class="pad-mini-name">${s.fav ? '★ ' : ''}${isVid ? '🎞️ ' : ''}${esc(s.name)}</span>
            <small class="pad-mini-dur">${st && st.duration ? `${fmtPadClock(st.elapsed)} / -${fmtPadClock(st.remaining)}` : s.duration ? `${fmtDur(s.duration)}${isVid ? ` · ${PAD_OVERLAY_LABEL[mode]}` : ''}` : isVid ? `VID · ${PAD_OVERLAY_LABEL[mode]}` : 'MP3'}</small>
          </button>
          <span class="pad-mini-actions">
            ${isVid ? `<button type="button" class="pad-mini-act pad-mode-act" data-pad-mode="${esc(s.id)}" title="${esc(PAD_OVERLAY_TITLE[mode])}">${PAD_OVERLAY_LABEL[mode]}</button>` : ''}
            ${isVid ? `<button type="button" class="pad-mini-act pad-v-act ${s.vSend !== false ? 'on' : ''}" data-pad-vsend="${esc(s.id)}" title="${s.vSend !== false ? 'Mandando para o vertical (clique para parar)' : 'Não vai para o vertical (clique para mandar)'}">9:16</button>` : ''}
            <button type="button" class="pad-mini-act ${s.fav ? 'on' : ''}" data-pad-fav="${esc(s.id)}" title="Favorito">★</button>
            <button type="button" class="pad-mini-act" data-pad-del="${esc(s.id)}" title="Remover">✕</button>
          </span>
          <span class="pad-mini-seek" data-pad-seek="${esc(s.id)}" draggable="false" title="Clique ou arraste para ir a um ponto do material"><i class="pad-mini-fill" style="width:${st ? Math.round(st.pct * 100) : 0}%"></i></span>
        </div>`;
      })
      .join('');

    grid.querySelectorAll('[data-pad-play]').forEach((b) => {
      b.onclick = () => playPad(b.dataset.padPlay);
    });
    grid.querySelectorAll('[data-pad-seek]').forEach((el) => bindPadSeek(el, el.dataset.padSeek));
    grid.querySelectorAll('[data-pad-mode]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const item = padSamples.find((x) => x.id === b.dataset.padMode);
        if (!item) return;
        const cur = PAD_OVERLAY_MODES.indexOf(item.overlayMode || 'once');
        const next = PAD_OVERLAY_MODES[(cur + 1) % PAD_OVERLAY_MODES.length];
        updatePadMeta(item.id, { overlayMode: next });
      };
    });
    grid.querySelectorAll('[data-pad-vsend]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const item = padSamples.find((x) => x.id === b.dataset.padVsSend);
        if (item) updatePadMeta(item.id, { vSend: item.vSend === false });
      };
    });
    grid.querySelectorAll('[data-pad-fav]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const item = padSamples.find((x) => x.id === b.dataset.padFav);
        if (item) updatePadMeta(item.id, { fav: !item.fav });
      };
    });
    grid.querySelectorAll('[data-pad-del]').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        removePadSample(b.dataset.padDel);
      };
    });
    grid.querySelectorAll('[data-pad-id]').forEach((tile) => {
      const id = tile.dataset.padId;
      tile.ondragstart = (e) => {
        dragPadId = id;
        tile.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-castdeck-pad', id);
      };
      tile.ondragend = () => {
        dragPadId = '';
        grid.querySelectorAll('.drop-before,.drop-after,.dragging').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'dragging'));
      };
      tile.ondragover = (e) => {
        if (!dragPadId || dragPadId === id) return;
        e.preventDefault();
        const r = tile.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        tile.classList.toggle('drop-before', !after);
        tile.classList.toggle('drop-after', after);
      };
      tile.ondragleave = () => tile.classList.remove('drop-before', 'drop-after');
      tile.ondrop = (e) => {
        const from = dragPadId || e.dataTransfer.getData('text/x-castdeck-pad');
        if (!from || from === id) return;
        e.preventDefault();
        const r = tile.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        tile.classList.remove('drop-before', 'drop-after');
        movePad(from, id, { after });
      };
    });
  }

  function render(el) {
    panel = el;
    if (!panel) return;
    if (viewMode === 'pad' && !padRestored) restorePad();
    const t = track();
    const playingNow = playing();
    const snap = getPadSnapshot();

    const modeTabs = `
      <div class="music-mode-tabs" role="tablist" aria-label="Modo de áudio">
        <button type="button" role="tab" aria-selected="${viewMode === 'tracks'}" class="music-mode-tab ${viewMode === 'tracks' ? 'on' : ''}" data-music-view="tracks">
          ${icons.music}<span>Trilha (${tracks.length})</span>
        </button>
        <button type="button" role="tab" aria-selected="${viewMode === 'pad'}" class="music-mode-tab ${viewMode === 'pad' ? 'on' : ''}" data-music-view="pad">
          <span>🎛️</span><span>Pad (${padSamples.length})</span>
        </button>
        <button type="button" class="btn sm ghost music-pop-pad" id="music-pad-qr" title="QR Code para controlar o Pad pelo celular">📱 QR</button>
        <button type="button" class="btn sm ghost music-pop-pad" id="music-open-pad" title="Abrir a janela separada Pad (com grupos, cadastro em massa e fixar no topo)">↗ Janela Pad</button>
      </div>`;

    if (viewMode === 'pad') {
      const catTabs = [
        ['all', `Todos (${padSamples.length})`],
        ['fav', `★ (${padSamples.filter((s) => s.fav).length})`],
        ...padGroups.map((g) => [g.id, `${g.name} (${padSamples.filter((s) => s.category === g.id).length})`]),
      ];
      panel.innerHTML = `
        <div class="music-head">
          <div><b>🎛️ Pad de Efeitos</b><small>Disparo instantâneo para a live</small></div>
          <span class="music-status ${snap.playingCount ? 'on' : ''}" id="music-status">${snap.playingCount ? `Pad tocando (${snap.playingCount})` : `${padSamples.length} sons`}</span>
        </div>
        ${modeTabs}

        <div class="pad-timer-card card ${snap.nowPlaying ? 'active' : ''}" id="pad-timer-card">
          <div class="pad-timer-top">
            <strong id="pad-now-name">${snap.nowPlaying ? esc(snap.nowPlaying.name) : 'Pronto para disparar'}</strong>
            <span class="pad-timer-badge" id="pad-now-count">${snap.playingCount > 1 ? `${snap.playingCount} ativos` : snap.nowPlaying ? 'TOCANDO' : 'Parado'}</span>
          </div>
          <div class="pad-timer-grid">
            <div><small>DECORRIDO</small><b class="pad-clock-prog" id="pad-timer-prog">${snap.nowPlaying ? fmtPadClock(snap.nowPlaying.elapsed) : '00:00.0'}</b></div>
            <div><small>RESTANTE</small><b class="pad-clock-rem ${snap.nowPlaying && snap.nowPlaying.duration > 0 && snap.nowPlaying.remaining < 1.5 ? 'ending' : ''}" id="pad-timer-rem">${snap.nowPlaying ? `-${fmtPadClock(snap.nowPlaying.remaining)}` : '-00:00.0'}</b></div>
            <div><small>DURAÇÃO</small><b class="pad-clock-dur" id="pad-timer-dur">${snap.nowPlaying ? fmtPadClock(snap.nowPlaying.duration) : '00:00.0'}</b></div>
          </div>
          <div class="pad-now-bar pad-now-bar-seek" id="pad-timer-seek" role="slider" tabindex="0" aria-label="Posição do efeito no ar" title="Clique ou arraste para avançar/voltar o efeito atual"><i id="pad-timer-bar" style="width:${snap.nowPlaying ? Math.round(snap.nowPlaying.pct * 100) : 0}%"></i></div>
          <div class="pad-timer-acts">
            <button type="button" class="btn sm ghost" id="pad-timer-pause" disabled title="Pausar o efeito no ponto atual">⏸ Pausar</button>
          </div>
        </div>

        <div class="pad-mini-bar">
          <input type="search" class="input pad-mini-search" id="pad-search" value="${esc(padSearch)}" placeholder="Buscar efeito (Plateia, Faz o L, Risada…)" aria-label="Buscar efeito no Pad">
          <button type="button" class="btn sm danger" id="pad-stop" ${snap.playingCount ? '' : 'disabled'} title="Parar todos os efeitos">${icons.stop} <span>Parar</span></button>
        </div>
        <div class="pad-mini-meta">
          <label class="pad-mini-chk" title="Sobrepor vários sons ao mesmo tempo (estilo MyInstants) em vez de cortar o anterior"><input type="checkbox" id="pad-overlap" ${padOverlap ? 'checked' : ''}><span>Sobrepor</span></label>
          <label class="pad-mini-chk" title="Abaixa a Trilha Sonora automaticamente enquanto o efeito toca"><input type="checkbox" id="pad-duck" ${padDucking ? 'checked' : ''}><span>Ducking</span></label>
        </div>
        <div class="music-volume">
          <span>Pad</span>
          <button type="button" class="btn sm ghost icon pad-mute-btn ${padMuted ? 'on danger' : ''}" id="pad-mute" aria-pressed="${padMuted}" title="${padMuted ? 'Reativar som do Pad' : 'Silenciar Pad'}">${padMuted ? icons.volumeOff : icons.volume}</button>
          <input id="pad-vol" type="range" min="0" max="100" step="1" value="${Math.round(padVolume * 100)}" aria-label="Volume do Pad">
          <b id="pad-vol-val">${Math.round(padVolume * 100)}%</b>
        </div>
        <div class="pad-cats" role="tablist" aria-label="Categorias do Pad">
          ${catTabs.map(([id, label]) => `<button type="button" class="pad-cat ${padCategory === id ? 'on' : ''}" data-pad-cat="${esc(id)}">${esc(label)}</button>`).join('')}
        </div>
        <div class="pad-mini-grid" id="pad-mini-grid"></div>
        <div class="music-add-row">
          <button type="button" class="btn primary sm" id="pad-add" title="Selecionar vários áudios de uma vez">${icons.plus} Em massa</button>
          <button type="button" class="btn sm ghost" id="pad-restore-presets" title="Restaurar os sons e grupos pré-instalados">↺ Padrões</button>
          <button type="button" class="btn sm ghost pad-clear-btn" id="pad-clear" ${padSamples.length ? '' : 'disabled'} title="Apagar todos os samples do Pad">${icons.trash} Tudo</button>
        </div>
        <div class="pad-confirm-inline" id="pad-clear-confirm" hidden>
          <span>Apagar todos os ${padSamples.length} samples do Pad?</span>
          <button type="button" class="btn sm danger" id="pad-clear-yes">Confirmar</button>
          <button type="button" class="btn sm ghost" id="pad-clear-no">Cancelar</button>
        </div>
        <input type="file" id="pad-file" class="file-input-offscreen" accept="audio/*,video/webm,video/mp4,.mp3,.wav,.ogg,.m4a,.flac,.opus,.webm,.mp4" multiple>
      `;

      panel.querySelectorAll('[data-music-view]').forEach((b) => {
        b.onclick = () => setViewMode(b.dataset.musicView);
      });
      $('#music-pad-qr', panel)?.addEventListener('click', () => openPadQrModal({ studioId, doc: panel.ownerDocument }));
      $('#music-open-pad', panel)?.addEventListener('click', openPadWindow);
      $('#pad-stop', panel)?.addEventListener('click', stopAllPads);
      $('#pad-timer-pause', panel)?.addEventListener('click', () => togglePadPause());
      bindPadSeek($('#pad-timer-seek', panel), () => getPadSnapshot().nowPlaying?.sampleId);
      $('#pad-overlap', panel)?.addEventListener('change', (e) => setPadOverlap(e.target.checked));
      $('#pad-duck', panel)?.addEventListener('change', (e) => setPadDucking(e.target.checked));
      $('#pad-mute', panel)?.addEventListener('click', () => setPadMuted(!padMuted));
      $('#pad-vol', panel)?.addEventListener('input', (e) => setPadVolume(Number(e.target.value) / 100));
      $('#pad-search', panel)?.addEventListener('input', (e) => setPadSearch(e.target.value));
      panel.querySelectorAll('[data-pad-cat]').forEach((b) => {
        b.onclick = () => setPadCategory(b.dataset.padCat);
      });
      $('#pad-add', panel)?.addEventListener('click', () => $('#pad-file', panel)?.click());
      $('#pad-file', panel)?.addEventListener('change', (e) => {
        const destCat = padCategory !== 'all' && padCategory !== 'fav' ? padCategory : 'custom';
        addPadFiles(e.target.files, { category: destCat });
        e.target.value = '';
      });
      $('#pad-restore-presets', panel)?.addEventListener('click', restorePresetPads);
      $('#pad-clear', panel)?.addEventListener('click', () => {
        const bar = $('#pad-clear-confirm', panel);
        if (bar) bar.hidden = !bar.hidden;
      });
      $('#pad-clear-no', panel)?.addEventListener('click', () => {
        const bar = $('#pad-clear-confirm', panel);
        if (bar) bar.hidden = true;
      });
      $('#pad-clear-yes', panel)?.addEventListener('click', () => clearAllPads({ force: true }));
      panel.ondragover = (e) => {
        if (!dragPadId && [...(e.dataTransfer?.types || [])].includes('Files')) {
          e.preventDefault();
          panel.classList.add('music-drop');
        }
      };
      panel.ondragleave = () => panel.classList.remove('music-drop');
      panel.ondrop = (e) => {
        if (dragPadId) return;
        e.preventDefault();
        panel.classList.remove('music-drop');
        if (e.dataTransfer?.files?.length) {
          const destCat = padCategory !== 'all' && padCategory !== 'fav' ? padCategory : 'custom';
          addPadFiles(e.dataTransfer.files, { category: destCat });
        }
      };
      renderPadGrid(panel);
      return;
    }

    const list = tracks.length
      ? tracks
          .map(
            (x, i) => `<div class="music-track ${x.id === currentId ? 'active' : ''}" data-track="${esc(x.id)}" draggable="true">
              <span class="music-track-handle" title="Arraste para reorganizar a fila">⠿</span>
              <button class="music-track-play" data-play-track="${esc(x.id)}" title="${x.id === currentId && playingNow ? 'Pausar' : 'Tocar'}">${x.id === currentId && playingNow ? icons.pause : icons.play}</button>
              <div class="music-track-info"><strong data-rename-track="${esc(x.id)}" title="Duplo clique para renomear">${esc(x.name)}</strong><small>${i + 1} · ${fmtDur(x.duration)}</small></div>
              <div class="music-track-order">
                <button class="btn sm ghost icon music-track-mv" data-move-track="${esc(x.id)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Subir na lista" aria-label="Subir ${esc(x.name)}">↑</button>
                <button class="btn sm ghost icon music-track-mv" data-move-track="${esc(x.id)}" data-dir="1" ${i === tracks.length - 1 ? 'disabled' : ''} title="Descer na lista" aria-label="Descer ${esc(x.name)}">↓</button>
              </div>
              <button class="btn sm ghost icon music-track-del" data-del-track="${esc(x.id)}" title="Remover ${esc(x.name)}">${icons.trash}</button>
            </div>`,
          )
          .join('')
      : '<div class="music-empty">Nenhuma faixa ainda. Adicione MP3, WAV, OGG, M4A ou FLAC.</div>';

    panel.innerHTML = `
      <div class="music-head">
        <div><b>${icons.music} Trilha sonora</b><small>Áudio ambiente da live</small></div>
        <span class="music-status ${playingNow ? 'on' : ''}" id="music-status">${playingNow ? `Tocando · ${MODES.find(([id]) => id === mode)?.[1] || ''}` : t ? 'Pausado' : 'Sem faixas'}</span>
      </div>
      ${modeTabs}
      <p class="hint music-hint">Toca em paralelo ao Playout e entra no programa, gravação e retorno. Arraste pela alça ⠿ ou use ↑/↓ para reorganizar a fila.</p>

      <div class="music-now card">
        <div class="music-now-row"><strong id="music-now-name">${t ? esc(t.name) : 'Nenhuma faixa selecionada'}</strong><span id="music-time">${fmtDur(audio.currentTime)} / ${fmtDur(audio.duration || t?.duration || 0)}</span></div>
        <div class="music-bar" title="Clique ou arraste para avançar/voltar">
          <i id="music-bar"></i>
          <input id="music-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Posição da faixa" title="Clique ou arraste para avançar/voltar">
        </div>
      </div>

      <div class="music-transport">
        <button class="btn sm icon" id="music-prev" title="Faixa anterior" aria-label="Faixa anterior">${icons.prev}</button>
        <button class="btn primary music-play" id="music-play" aria-label="${playingNow ? 'Pausar trilha sonora' : 'Tocar trilha sonora'}">${playingNow ? icons.pause : icons.play}<span>${playingNow ? 'Pausar' : 'Tocar'}</span></button>
        <button class="btn sm icon" id="music-next" title="Próxima faixa" aria-label="Próxima faixa">${icons.next}</button>
        <button class="btn sm icon music-mute" id="music-mute" aria-pressed="${muted}" title="${muted ? 'Reativar o som da trilha' : 'Silenciar a trilha'}">${muted ? icons.volumeOff : icons.volume}</button>
      </div>

      <div class="music-volume">
        <span>Volume</span>
        <input id="music-vol" type="range" min="0" max="100" step="1" value="${Math.round(volume * 100)}" aria-label="Volume da trilha sonora">
        <b id="music-vol-val">${Math.round(volume * 100)}%</b>
      </div>

      <label class="check music-monitor"><span>Ouvir no fone do host</span>
        <span class="switch"><input id="music-monitor" type="checkbox" ${hostMon ? 'checked' : ''} aria-label="Enviar a trilha para o fone do host"><span></span></span>
      </label>
      <p class="hint music-monitor-hint">O programa continua com a trilha; isto controla apenas o retorno do host.</p>

      <div class="music-modes" role="group" aria-label="Modo de repetição da trilha">
        ${MODES.map(([id, label, icon]) => `<button class="music-mode ${mode === id ? 'on' : ''}" data-mode="${id}" title="${label}">${icons[icon]}<span>${label}</span></button>`).join('')}
      </div>

      <div class="m-section-head"><h4>Faixas (${tracks.length})</h4><span class="hint">${tracks.length}/${MAX_TRACKS}</span></div>
      <div class="music-list" id="music-list">${list}</div>
      <div class="music-add-row">
        <button class="btn primary" id="music-add">${icons.plus} Adicionar áudios</button>
        <span class="hint">Salvo neste dispositivo com a ordem escolhida.</span>
      </div>
      <input type="file" id="music-file" class="file-input-offscreen" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.opus" multiple>
    `;

    panel.querySelectorAll('[data-music-view]').forEach((b) => {
      b.onclick = () => setViewMode(b.dataset.musicView);
    });
    $('#music-pad-qr', panel)?.addEventListener('click', () => openPadQrModal({ studioId, doc: panel.ownerDocument }));
    $('#music-open-pad', panel)?.addEventListener('click', openPadWindow);
    $("#music-add", panel)?.addEventListener("click", () => $("#music-file", panel)?.click());
    $("#music-file", panel)?.addEventListener("change", (e) => {
      addFiles(e.target.files);
      e.target.value = "";
    });
    $("#music-play", panel)?.addEventListener("click", toggle);
    $("#music-prev", panel)?.addEventListener("click", () => step(-1));
    $("#music-next", panel)?.addEventListener("click", () => step(1));
    $("#music-mute", panel)?.addEventListener("click", () => setMuted());
    $("#music-monitor", panel)?.addEventListener("change", (e) => setMonitor(e.target.checked));
    $("#music-vol", panel)?.addEventListener("input", (e) => setVolume(Number(e.target.value) / 100));
    panel.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
    panel.querySelectorAll("[data-play-track]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.playTrack;
          if (id === currentId) toggle();
          else select(id, { autoplay: true });
        }),
    );
    panel.querySelectorAll("[data-move-track]").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        moveTrackBy(b.dataset.moveTrack, Number(b.dataset.dir) || 0);
      };
    });
    panel.querySelectorAll("[data-del-track]").forEach((b) => (b.onclick = () => remove(b.dataset.delTrack)));
    panel.querySelectorAll("[data-rename-track]").forEach((strong) => {
      strong.ondblclick = (e) => {
        e.stopPropagation();
        const id = strong.dataset.renameTrack;
        const item = track(id);
        if (!item) return;
        const row = strong.closest('.music-track');
        if (row) row.draggable = false;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'input music-rename-inp';
        inp.value = item.name;
        inp.maxLength = 90;
        let done = false;
        const commit = async (save) => {
          if (done) return;
          done = true;
          const v = inp.value.trim();
          if (row) row.draggable = true;
          if (save && v && v !== item.name) {
            await renameTrack(id, v);
          } else {
            inp.replaceWith(strong);
          }
        };
        inp.onkeydown = (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
          else if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
        };
        inp.onblur = () => commit(true);
        strong.replaceWith(inp);
        inp.focus();
        inp.select();
      };
    });

    panel.querySelectorAll('.music-track[data-track]').forEach((row) => {
      const id = row.dataset.track;
      row.ondragstart = (e) => {
        if (e.target.closest('button, input')) return e.preventDefault();
        dragTrackId = id;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-castdeck-track', id);
      };
      row.ondragend = () => {
        dragTrackId = '';
        panel.querySelectorAll('.music-track').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'dragging'));
      };
      row.ondragover = (e) => {
        if (!dragTrackId || dragTrackId === id) return;
        e.preventDefault();
        const r = row.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        row.classList.toggle('drop-before', !after);
        row.classList.toggle('drop-after', after);
      };
      row.ondragleave = () => row.classList.remove('drop-before', 'drop-after');
      row.ondrop = (e) => {
        const from = dragTrackId || e.dataTransfer.getData('text/x-castdeck-track');
        if (!from || from === id) return;
        e.preventDefault();
        e.stopPropagation();
        const r = row.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        row.classList.remove('drop-before', 'drop-after');
        moveTrack(from, id, { after });
      };
    });

    const seek = $("#music-seek", panel);
    seek?.addEventListener("pointerdown", () => { seeking = true; });
    seek?.addEventListener("input", (e) => {
      seeking = true;
      seekTo(e.target.value);
    });
    const endSeek = () => {
      if (!seeking) return;
      seeking = false;
      paintTime();
    };
    seek?.addEventListener("pointerup", endSeek);
    seek?.addEventListener("pointercancel", endSeek);
    seek?.addEventListener("change", endSeek);
    seek?.addEventListener("blur", endSeek);
    panel.ondragover = (e) => {
      if (!dragTrackId && [...(e.dataTransfer?.types || [])].includes("Files")) {
        e.preventDefault();
        panel.classList.add("music-drop");
      }
    };
    panel.ondragleave = () => panel.classList.remove("music-drop");
    panel.ondrop = (e) => {
      if (dragTrackId) return;
      e.preventDefault();
      panel.classList.remove("music-drop");
      if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
    };
    paint();
  }

  async function restore() {
    if (restored) return;
    try {
      const rows = (await idbAll(DB_NAME, STORE)).filter(({ key }) => String(key).startsWith(prefix));
      let savedOrder = [];
      try {
        savedOrder = JSON.parse(localStorage.getItem(ls("order")) || "[]");
        if (!Array.isArray(savedOrder)) savedOrder = [];
      } catch {}
      const rank = new Map(savedOrder.map((id, i) => [id, i]));
      rows.sort((a, b) => {
        const ia = String(a.key).slice(prefix.length);
        const ib = String(b.key).slice(prefix.length);
        const ra = rank.has(ia) ? rank.get(ia) : 99999;
        const rb = rank.has(ib) ? rank.get(ib) : 99999;
        if (ra !== rb) return ra - rb;
        return (a.rec?.addedAt || 0) - (b.rec?.addedAt || 0);
      });
      for (const { key, rec } of rows) {
        if (!rec?.file) continue;
        const id = String(key).slice(prefix.length);
        const t = { id, name: rec.displayName || cleanName(rec.name), file: rec.file, url: URL.createObjectURL(rec.file), duration: 0, addedAt: rec.addedAt || 0 };
        tracks.push(t);
        probe(t);
      }
      if (tracks.length) {
        const saved = localStorage.getItem(ls("current"));
        currentId = tracks.some((t) => t.id === saved) ? saved : tracks[0].id;
        select(currentId, { autoplay: false });
      }
      restored = true;
      restorePad();
      if (panel) render(panel);
    } catch (e) {
      console.warn("[trilha] restore:", e);
    }
  }

  audio.addEventListener("timeupdate", () => {
    paintTime();
    if (playing()) emitPadState({ tick: true });
  });
  audio.addEventListener("durationchange", () => {
    paintTime();
    emitPadState();
  });
  audio.addEventListener("play", () => {
    paint();
    emitPadState();
    notify();
  });
  audio.addEventListener("pause", () => {
    paint();
    emitPadState();
    notify();
  });
  audio.addEventListener("ended", () => {
    if (mode === "one") {
      try {
        audio.currentTime = 0;
      } catch {}
      audio.play().catch(() => {});
    } else if (mode === "list") {
      step(1);
    } else {
      try {
        audio.currentTime = 0;
      } catch {}
      paint();
      notify();
    }
  });
  audio.addEventListener("error", () => {
    if (currentId) toast(`Não foi possível abrir ${track()?.name || "a faixa"}.`, "err");
  });

  const api = {
    render,
    restore,
    addFiles,
    remove,
    moveTrack,
    moveTrackBy,
    renameTrack,
    play,
    pause,
    stop,
    toggle,
    step,
    setMode,
    setVolume,
    setMuted,
    setMonitor,
    syncFromMixer,
    setViewMode,
    // API do Pad de Efeitos e Grupos
    restorePad,
    playPad,
    replayLastPad,
    stopAllPads,
    stopPadSample,
    seekPad,
    seekPadPct,
    togglePadPause,
    addPadFiles,
    updatePadMeta,
    removePadSample,
    clearAllPads,
    restorePresetPads,
    movePad,
    movePadBy,
    movePadToGroup,
    addPadGroup,
    updatePadGroup,
    removePadGroup,
    movePadGroup,
    movePadGroupBy,
    togglePadGroupCollapse,
    setPadGrouped,
    setPadVolume,
    setPadMuted,
    setPadMonitor,
    setPadOverlap,
    setPadDucking,
    setPadCategory,
    setPadSearch,
    syncPadFromMixer,
    subscribePad,
    getPadSnapshot,
    getActiveVideoOverlays,
    openPadWindow,
    closePadWindow,
    get tracks() { return tracks.map(({ id, name, duration }) => ({ id, name, duration })); },
    get currentId() { return currentId; },
    get viewMode() { return viewMode; },
    get mode() { return mode; },
    get volume() { return volume; },
    get muted() { return muted; },
    get hostMon() { return hostMon; },
    get restored() { return restored; },
    get audio() { return audio; },
    get padGroups() { return padGroups.map((g) => ({ ...g })); },
    get padSamples() { return padSamples.map(({ id, name, category, color, fav, builtin, duration }) => ({ id, name, category, color, fav, builtin, duration })); },
    pauseAll: () => { pause(); stopAllPads(); },
  };

  if (bridgeBc) {
    const BRIDGE_OPS = new Set([
      'playPad', 'replayLastPad', 'stopAllPads', 'stopPadSample', 'seekPad', 'seekPadPct', 'togglePadPause', 'setPadVolume', 'setPadMuted', 'setPadMonitor',
      'setPadOverlap', 'setPadDucking', 'setPadGrouped', 'setPadCategory', 'setPadSearch',
      'togglePadGroupCollapse', 'addPadGroup', 'updatePadGroup', 'removePadGroup',
      'movePadGroup', 'movePadGroupBy', 'movePad', 'movePadBy', 'movePadToGroup', 'updatePadMeta',
      'removePadSample', 'clearAllPads', 'restorePresetPads', 'addPadFiles',
      'play', 'pause', 'stop', 'toggle', 'step', 'setVolume', 'setMuted', 'setMode',
    ]);
    bridgeBc.onmessage = async (ev) => {
      const d = ev?.data;
      if (!d || typeof d !== 'object') return;
      if (d.targetStudioId && d.targetStudioId !== 'local' && d.targetStudioId !== studioId) return;
      if (d.type === 'hello') {
        if (!padRestored) await restorePad().catch(() => {});
        try {
          bridgeBc.postMessage({ type: 'state', studioId, studioName: getStudioName?.() || '', snap: getPadSnapshot() });
        } catch {}
        return;
      }
      if (d.type === 'cmd' && BRIDGE_OPS.has(d.op) && typeof api[d.op] === 'function') {
        try {
          await api[d.op](...(Array.isArray(d.args) ? d.args : []));
        } catch {}
      }
    };
  }

  return api;
}
