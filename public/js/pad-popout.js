// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Controlador da janela dedicada "Pad" (/pad.html): funciona integrada ao mixer do estúdio
// (via window.opener.__castdeck.music) ou em modo local se aberta diretamente.
import { esc, icons, toast } from './ui.js';
import { Signaling } from './rtc.js';
import { mountPadQrView } from './pad-qr.js';
import { toggleFull, isFull, onFullChange } from './fullscreen.js';
import {
  createMusic,
  DEFAULT_PAD_GROUPS,
  PAD_COLORS,
  PAD_HOTKEYS,
  fmtDur,
  fmtPadClock,
} from './studio/music.js';

const $ = (s, p = document) => p.querySelector(s);
const params = new URLSearchParams(window.location.search);
const studioId = params.get('studio') || 'local';

const KEYS_PREF = `castdeck.pad.hotkeys.${studioId}`;
const rootEl = $('#pad-win-root');
const q = (s) => (rootEl || document).querySelector(s);
const qAll = (s) => (rootEl || document).querySelectorAll(s);
let hotkeysOn = localStorage.getItem(KEYS_PREF) !== '0';
let reorderOn = false;
let ctrl = null;
let unsubscribe = null;
let standaloneFallback = null;
let bridgeSnap = null;
let bridgeStudio = '';
let bridgeStudioName = '';
let bridgeCtrl = null;
const bridgeSubs = new Set();
const bridgeBc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('castdeck.pad.bridge') : null;
let standaloneSig = null;
let standaloneSigRoom = '';
let standaloneSigTimer = 0;
let dragPadId = '';
let dragGroupId = '';
let editingId = '';
let selectedColor = 'blue';
let editingGroupId = '';
let selectedGroupColor = 'blue';
let bulkFiles = [];
let currentSnap = null;
let lastGridKey = '';

function ensureBridgeController() {
  if (bridgeCtrl) return bridgeCtrl;
  const sendCmd = (op, ...args) => {
    try {
      bridgeBc?.postMessage({ type: 'cmd', targetStudioId: bridgeStudio || studioId, op, args });
    } catch {}
  };
  const notifyLocal = (meta = {}) => {
    if (!bridgeSnap) return;
    for (const fn of bridgeSubs) {
      try { fn(bridgeSnap, meta); } catch {}
    }
  };
  bridgeCtrl = {
    restorePad: async () => bridgeBc?.postMessage({ type: 'hello', targetStudioId: studioId }),
    playPad: (id) => sendCmd('playPad', id),
    seekPad: (id, seconds) => sendCmd('seekPad', id, seconds),
    seekPadPct: (id, pct) => sendCmd('seekPadPct', id, pct),
    replayLastPad: () => sendCmd('replayLastPad'),
    stopAllPads: () => sendCmd('stopAllPads'),
    stopPadSample: (id) => sendCmd('stopPadSample', id),
    play: () => sendCmd('play'),
    pause: () => sendCmd('pause'),
    stop: () => sendCmd('stop'),
    toggle: () => sendCmd('toggle'),
    step: (dir) => sendCmd('step', dir),
    setVolume: (v) => sendCmd('setVolume', v),
    setMuted: (on) => sendCmd('setMuted', on),
    setMode: (m) => sendCmd('setMode', m),
    addPadFiles: async (files, opts = {}) => {
      const list = [...(files || [])];
      if (!list.length) return 0;
      sendCmd('addPadFiles', list, { category: opts.category, color: opts.color });
      opts.onProgress?.({ done: list.length, total: list.length, added: list.length, name: list[list.length - 1]?.name || '' });
      return list.length;
    },
    updatePadMeta: (id, patch) => sendCmd('updatePadMeta', id, patch),
    removePadSample: (id) => sendCmd('removePadSample', id),
    clearAllPads: (opts) => sendCmd('clearAllPads', opts),
    restorePresetPads: () => sendCmd('restorePresetPads'),
    movePad: (fromId, targetId, opts) => sendCmd('movePad', fromId, targetId, opts),
    movePadBy: (id, delta, opts) => sendCmd('movePadBy', id, delta, opts),
    movePadToGroup: (sampleId, groupId) => sendCmd('movePadToGroup', sampleId, groupId),
    addPadGroup: (g) => { sendCmd('addPadGroup', g); return g; },
    updatePadGroup: (id, patch) => sendCmd('updatePadGroup', id, patch),
    removePadGroup: (id) => sendCmd('removePadGroup', id),
    movePadGroup: (fromId, targetId, opts) => sendCmd('movePadGroup', fromId, targetId, opts),
    movePadGroupBy: (id, delta) => sendCmd('movePadGroupBy', id, delta),
    togglePadGroupCollapse: (id) => sendCmd('togglePadGroupCollapse', id),
    setPadGrouped: (on) => {
      if (bridgeSnap) { bridgeSnap = { ...bridgeSnap, grouped: !!on }; notifyLocal(); }
      sendCmd('setPadGrouped', on);
    },
    setPadVolume: (v) => {
      const nv = Math.max(0, Math.min(1, Number(v) || 0));
      if (bridgeSnap) { bridgeSnap = { ...bridgeSnap, volume: nv }; notifyLocal(); }
      sendCmd('setPadVolume', nv);
    },
    setPadMuted: (on) => {
      if (bridgeSnap) { bridgeSnap = { ...bridgeSnap, muted: !!on }; notifyLocal(); }
      sendCmd('setPadMuted', !!on);
    },
    setPadMonitor: (on) => {
      if (bridgeSnap) { bridgeSnap = { ...bridgeSnap, monitor: !!on }; notifyLocal(); }
      sendCmd('setPadMonitor', !!on);
    },
    setPadOverlap: (on) => {
      if (bridgeSnap) { bridgeSnap = { ...bridgeSnap, overlap: !!on }; notifyLocal(); }
      sendCmd('setPadOverlap', !!on);
    },
    setPadDucking: (on) => {
      if (bridgeSnap) { bridgeSnap = { ...bridgeSnap, ducking: !!on }; notifyLocal(); }
      sendCmd('setPadDucking', !!on);
    },
    setPadCategory: (cat) => {
      if (bridgeSnap) { bridgeSnap = { ...bridgeSnap, category: cat }; notifyLocal(); }
      sendCmd('setPadCategory', cat);
    },
    setPadSearch: (s) => {
      if (bridgeSnap) { bridgeSnap = { ...bridgeSnap, search: String(s || '') }; notifyLocal(); }
      sendCmd('setPadSearch', s);
    },
    getPadSnapshot: () => bridgeSnap,
    subscribePad: (fn) => {
      if (typeof fn !== 'function') return () => {};
      bridgeSubs.add(fn);
      if (bridgeSnap) {
        try { fn(bridgeSnap, {}); } catch {}
      }
      return () => bridgeSubs.delete(fn);
    },
  };
  return bridgeCtrl;
}

if (bridgeBc) {
  bridgeBc.onmessage = (ev) => {
    const d = ev?.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'state' && d.snap) {
      bridgeStudio = d.studioId || 'local';
      bridgeStudioName = d.studioName || '';
      bridgeSnap = d.snap;
      const openerMusic = window.opener && !window.opener.closed ? window.opener.__castdeck?.music : null;
      if (!openerMusic) {
        if (ctrl !== ensureBridgeController()) attach();
        else {
          for (const fn of bridgeSubs) {
            try { fn(bridgeSnap, {}); } catch {}
          }
        }
      }
    } else if (d.type === 'tick' && d.studioId === bridgeStudio && bridgeSnap) {
      bridgeSnap = {
        ...bridgeSnap,
        nowPlaying: d.nowPlaying,
        activeSamples: d.activeSamples,
        playingCount: d.playingCount,
      };
      if (ctrl === bridgeCtrl) {
        for (const fn of bridgeSubs) {
          try { fn(bridgeSnap, { tick: true }); } catch {}
        }
      }
    }
  };
}

function stopStandaloneSignaling() {
  clearInterval(standaloneSigTimer);
  standaloneSigTimer = 0;
  standaloneSigRoom = '';
  if (standaloneSig) {
    try {
      standaloneSig.closedByUser = true;
      standaloneSig.ws?.close();
    } catch {}
    standaloneSig = null;
  }
}

function startStandaloneSignaling(info) {
  if (!info?.studioId || standaloneSigRoom === info.studioId) return;
  stopStandaloneSignaling();
  standaloneSigRoom = info.studioId;
  const sig = new Signaling();
  standaloneSig = sig;
  const pushState = () => {
    const pad = standaloneFallback?.getPadSnapshot?.() || null;
    sig.send({
      type: 'remote-state',
      state: { name: info.studioName || 'Pad Local', switcher: false, items: [], stage: [], banners: [], medias: [], pad },
    });
  };
  sig.on('welcome', pushState);
  sig.on('remote-count', pushState);
  sig.on('remote-cmd', ({ cmd: c }) => {
    if (!c || !standaloneFallback) return;
    switch (c.op) {
      case 'pad-play': standaloneFallback.playPad(c.id); break;
      case 'pad-replay': standaloneFallback.replayLastPad(); break;
      case 'pad-stop': if (c.id) standaloneFallback.stopPadSample(c.id); else standaloneFallback.stopAllPads(); break;
      case 'pad-vol': if (Number.isFinite(c.vol)) standaloneFallback.setPadVolume(c.vol); break;
      case 'pad-mute': standaloneFallback.setPadMuted(!!c.on); break;
      case 'pad-overlap': standaloneFallback.setPadOverlap(!!c.on); break;
      case 'pad-duck': standaloneFallback.setPadDucking(!!c.on); break;
      case 'pad-fav': if (c.id) standaloneFallback.updatePadMeta(c.id, { fav: !!c.on }); break;
      case 'pad-move-by': if (c.id) standaloneFallback.movePadBy(c.id, c.dir || 1, { sameGroup: c.sameGroup !== false }); break;
      case 'pad-move': if (c.id && c.targetId) standaloneFallback.movePad(c.id, c.targetId, { after: !!c.after, category: c.category || '' }); break;
      case 'pad-set-cat': if (c.id && c.category) standaloneFallback.movePadToGroup(c.id, c.category); break;
      case 'pad-group-move': if (c.id) standaloneFallback.movePadGroupBy(c.id, c.dir || 1); break;
      case 'music-toggle': standaloneFallback.toggle(); break;
      case 'music-stop': standaloneFallback.stop(); break;
      case 'music-step': standaloneFallback.step(c.dir || 1); break;
      case 'music-vol': if (Number.isFinite(c.vol)) standaloneFallback.setVolume(c.vol); break;
      case 'music-mute': standaloneFallback.setMuted(!!c.on); break;
    }
    setTimeout(pushState, 40);
  });
  sig.connect({ type: 'join', room: info.studioId, role: 'host', name: 'Pad Local' });
  standaloneSigTimer = setInterval(pushState, 250);
}

function resolveController() {
  const openerMusic = window.opener && !window.opener.closed ? window.opener.__castdeck?.music : null;
  const openerName = window.opener && !window.opener.closed ? window.opener.__castdeck?.S?.studio?.name : '';
  if (openerMusic) {
    stopStandaloneSignaling();
    return { music: openerMusic, linked: true, studioName: openerName || 'Estúdio Conectado' };
  }
  if (bridgeSnap) {
    stopStandaloneSignaling();
    return { music: ensureBridgeController(), linked: true, studioName: bridgeStudioName || 'Estúdio Conectado' };
  }
  if (!standaloneFallback) {
    standaloneFallback = createMusic({ studioId });
    standaloneFallback.restorePad();
  }
  return { music: standaloneFallback, linked: false, studioName: 'Modo Local (sem estúdio aberto)' };
}

function updateConnUi(linked, studioName) {
  const badge = q('#pad-conn-status');
  const titleSub = q('#pad-studio-name');
  if (titleSub) titleSub.textContent = studioName || 'CastDeck Local';
  if (badge) {
    badge.className = linked ? 'pill sm ok' : 'pill sm warn';
    badge.textContent = linked ? 'No Ar no Estúdio' : 'Modo Local';
    badge.title = linked
      ? 'Os efeitos passam pelo Mixer do Estúdio (PGM, gravação e retorno).'
      : 'Abra pela aba Trilha & Pad no Estúdio para enviar ao PGM da live.';
  }
}

function groupsOf(snap) {
  return snap.groups?.length ? snap.groups : DEFAULT_PAD_GROUPS;
}

function groupMap(snap) {
  return new Map(groupsOf(snap).map((g) => [g.id, g]));
}

function filteredSamples(snap) {
  const q = (snap.search || '').trim().toLowerCase();
  const cat = snap.category || 'all';
  return (snap.samples || []).filter((s) => {
    if (cat === 'fav' && !s.fav) return false;
    if (cat !== 'all' && cat !== 'fav' && s.category !== cat) return false;
    if (q && !s.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderCategories(snap) {
  const box = q('#pad-win-cats');
  if (!box) return;
  const groups = groupsOf(snap);
  const items = [
    ['all', 'Todos', snap.samples.length],
    ['fav', '★ Favoritos', snap.samples.filter((s) => s.fav).length],
    ...groups.map((g) => [g.id, `${g.icon ? g.icon + ' ' : ''}${g.name}`, snap.samples.filter((s) => s.category === g.id).length]),
  ];
  box.innerHTML = items
    .map(([id, label, count]) => `<button type="button" class="pad-cat ${snap.category === id ? 'on' : ''}" data-cat="${esc(id)}">${esc(label)} <small>${count}</small></button>`)
    .join('');
  box.querySelectorAll('[data-cat]').forEach((b) => {
    b.onclick = () => ctrl?.setPadCategory(b.dataset.cat);
  });
}

function paintClocksAndToolbar(snap) {
  const nowBox = q('#pad-now-box');
  const nowName = q('#pad-now-name');
  const nowCount = q('#pad-now-count');
  const prog = q('#pad-clock-prog');
  const rem = q('#pad-clock-rem');
  const dur = q('#pad-clock-dur');
  const bar = q('#pad-clock-bar');
  const stopBtn = q('#pad-stop-all');
  const clearBtn = q('#pad-win-clear');
  const grpBtn = q('#pad-win-grouped');

  if (snap.nowPlaying) {
    if (nowName) nowName.textContent = snap.nowPlaying.name;
    if (nowCount) nowCount.textContent = snap.playingCount > 1 ? `${snap.playingCount} ativos` : 'TOCANDO';
    if (prog) prog.textContent = fmtPadClock(snap.nowPlaying.elapsed);
    if (rem) {
      rem.textContent = `-${fmtPadClock(snap.nowPlaying.remaining)}`;
      rem.classList.toggle('ending', snap.nowPlaying.duration > 0 && snap.nowPlaying.remaining < 1.5);
    }
    if (dur) dur.textContent = fmtPadClock(snap.nowPlaying.duration);
    if (bar) bar.style.width = `${Math.round((snap.nowPlaying.pct || 0) * 100)}%`;
    nowBox?.classList.add('active');
  } else {
    if (nowName) nowName.textContent = snap.playingCount ? 'Tocando…' : 'Pronto para disparar';
    if (nowCount) nowCount.textContent = snap.playingCount ? `${snap.playingCount} ativo` : 'Parado';
    if (prog) prog.textContent = '00:00.0';
    if (rem) {
      rem.textContent = '-00:00.0';
      rem.classList.remove('ending');
    }
    if (dur) dur.textContent = '00:00.0';
    if (bar) bar.style.width = '0%';
    nowBox?.classList.remove('active');
  }

  if (stopBtn) {
    stopBtn.disabled = false;
    stopBtn.classList.toggle('is-playing', snap.playingCount > 0);
  }
  const inlineStop = q('#pad-player-stop');
  if (inlineStop) {
    inlineStop.disabled = false;
    inlineStop.classList.toggle('is-playing', snap.playingCount > 0);
  }
  const inlinePlay = q('#pad-player-play');
  if (inlinePlay) {
    inlinePlay.title = snap.lastSampleName ? `Tocar: ${snap.lastSampleName}` : 'Tocar efeito selecionado';
  }
  if (clearBtn) clearBtn.disabled = !snap.samples?.length;
  if (grpBtn) {
    const grouped = snap.grouped !== false;
    grpBtn.classList.toggle('active', grouped);
    grpBtn.setAttribute('aria-pressed', String(grouped));
    grpBtn.textContent = grouped ? '🗂️ Em Grupos' : '🎛️ Grade Única';
  }
  const reBtn = q('#pad-win-reorder');
  if (reBtn) {
    reBtn.classList.toggle('active', reorderOn);
    reBtn.setAttribute('aria-pressed', String(reorderOn));
  }
  rootEl?.classList.toggle('reordering', reorderOn);

  const activeEl = rootEl?.ownerDocument?.activeElement || document.activeElement;
  const searchInp = q('#pad-win-search');
  if (searchInp && activeEl !== searchInp && searchInp.value !== snap.search) {
    searchInp.value = snap.search || '';
  }
  const clrBtn = q('#pad-search-clear');
  if (clrBtn) clrBtn.hidden = !snap.search;

  const ov = q('#pad-win-overlap');
  if (ov) ov.checked = !!snap.overlap;
  const dk = q('#pad-win-duck');
  if (dk) dk.checked = !!snap.ducking;
  const mon = q('#pad-win-mon');
  if (mon) mon.checked = snap.monitor !== false;
  const hk = q('#pad-win-keys');
  if (hk) hk.checked = hotkeysOn;

  const vol = q('#pad-win-vol');
  if (vol && activeEl !== vol) vol.value = String(Math.round((snap.volume ?? 0.85) * 100));
  const volVal = q('#pad-win-vol-val');
  if (volVal) volVal.textContent = `${Math.round((snap.volume ?? 0.85) * 100)}%`;
  const muteBtn = q('#pad-win-mute');
  if (muteBtn) {
    const muted = !!snap.muted;
    muteBtn.classList.toggle('on', muted);
    muteBtn.classList.toggle('danger', muted);
    muteBtn.innerHTML = muted ? icons.volumeOff : icons.volume;
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.title = muted ? 'Reativar som do Pad' : 'Silenciar Pad';
  }

  // Barra de controles do Player da Trilha Sonora
  const amb = snap.ambient || {
    playing: !!snap.ambientPlaying,
    name: snap.ambientName || '',
    trackCount: 0,
    currentTime: 0,
    duration: 0,
    volume: 0.4,
    muted: false,
  };
  const ambName = q('#pad-amb-name');
  if (ambName) ambName.textContent = amb.name || (amb.trackCount ? 'Trilha parada' : 'Sem faixas na Trilha');
  const ambTime = q('#pad-amb-time');
  if (ambTime) ambTime.textContent = `${fmtDur(amb.currentTime)} / ${fmtDur(amb.duration)}`;
  const ambPlay = q('#pad-amb-play');
  if (ambPlay) {
    ambPlay.textContent = amb.playing ? '⏸' : '▶';
    ambPlay.title = amb.playing ? 'Pausar trilha' : 'Tocar trilha';
  }
  const ambMute = q('#pad-amb-mute');
  if (ambMute) {
    ambMute.classList.toggle('on', !!amb.muted);
    ambMute.classList.toggle('danger', !!amb.muted);
    ambMute.innerHTML = amb.muted ? icons.volumeOff : icons.volume;
    ambMute.setAttribute('aria-pressed', String(!!amb.muted));
  }
  const ambVol = q('#pad-amb-vol');
  if (ambVol && activeEl !== ambVol) ambVol.value = String(Math.round((amb.volume ?? 0.4) * 100));
  const ambVolVal = q('#pad-amb-vol-val');
  if (ambVolVal) ambVolVal.textContent = `${Math.round((amb.volume ?? 0.4) * 100)}%`;

  qAll('.pad-card[data-pad-id]').forEach((card) => {
    const st = snap.activeSamples?.[card.dataset.padId];
    card.classList.toggle('playing', !!st);
    const fill = card.querySelector('.pad-card-fill');
    if (fill) fill.style.width = st ? `${Math.round(st.pct * 100)}%` : '0%';
    const durEl = card.querySelector('.pad-card-dur');
    if (durEl) {
      if (st && st.duration > 0) {
        durEl.textContent = `${fmtPadClock(st.elapsed)} / -${fmtPadClock(st.remaining)}`;
      } else {
        const s = snap.samples?.find((x) => x.id === card.dataset.padId);
        durEl.textContent = s?.duration ? fmtDur(s.duration) : 'MP3';
      }
    }
  });
}

function renderCardHtml(s, hotkey, snap, gmap) {
  const st = snap.activeSamples?.[s.id];
  const grp = gmap.get(s.category);
  const catLbl = grp ? grp.name : s.category;
  const groups = groupsOf(snap);
  return `<article class="pad-card pad-c-${esc(s.color || 'blue')} ${st ? 'playing' : ''}" data-pad-id="${esc(s.id)}" data-pad-group="${esc(s.category)}" draggable="true">
    <div class="pad-card-top">
      <span class="pad-drag-handle" title="Arraste para reordenar ou mover de grupo">⠿</span>
      ${hotkey ? `<kbd class="pad-hotkey" title="Tecla de atalho: ${esc(hotkey)}">${esc(hotkey)}</kbd>` : ''}
      <span class="pad-card-cat">${esc(catLbl)}</span>
      <div class="spacer"></div>
      <button type="button" class="pad-card-icon ${s.fav ? 'fav' : ''}" data-pad-fav="${esc(s.id)}" title="${s.fav ? 'Remover dos favoritos' : 'Favoritar'}">★</button>
      <button type="button" class="pad-card-icon" data-pad-edit="${esc(s.id)}" title="Editar nome, cor, grupo ou excluir">⋯</button>
    </div>
    <div class="pad-card-rebar" title="Reorganizar ordem ou mover para outro grupo">
      <button type="button" class="pad-mv-btn" data-pad-mv="${esc(s.id)}" data-dir="-1" title="Mover antes (◀)">◀</button>
      <select class="pad-cat-sel" data-pad-cat-sel="${esc(s.id)}" aria-label="Grupo de ${esc(s.name)}">
        ${groups.map((g) => `<option value="${esc(g.id)}" ${g.id === s.category ? 'selected' : ''}>${esc(g.icon ? g.icon + ' ' : '')}${esc(g.name)}</option>`).join('')}
      </select>
      <button type="button" class="pad-mv-btn" data-pad-mv="${esc(s.id)}" data-dir="1" title="Mover depois (▶)">▶</button>
    </div>
    <button type="button" class="pad-card-hit" data-pad-hit="${esc(s.id)}" title="${esc(s.name)} — Clique para ${s.kind === 'video' ? 'disparar overlay' : 'disparar'}">
      ${s.kind === 'video'
        ? `<span class="pad-card-ring pad-card-thumb" aria-hidden="true">${s.thumb ? `<img src="${esc(s.thumb)}" alt="">` : '🎞️'}</span>`
        : `<span class="pad-card-ring" aria-hidden="true">${icons.volume}</span>`}
      <strong class="pad-card-name">${s.kind === 'video' ? '🎞️ ' : ''}${esc(s.name)}</strong>
      <small class="pad-card-dur">${st && st.duration > 0 ? `${fmtPadClock(st.elapsed)} / -${fmtPadClock(st.remaining)}` : s.duration ? fmtDur(s.duration) : s.kind === 'video' ? 'VID' : 'MP3'}</small>
    </button>
    <i class="pad-card-fill" style="width:${st ? Math.round(st.pct * 100) : 0}%"></i>
    <span class="pad-card-seek" data-pad-seek="${esc(s.id)}" draggable="false" title="Clique ou arraste para ir a um ponto do material (${s.kind === 'video' ? 'o vídeo acompanha no PGM' : 'áudio'})"></span>
  </article>`;
}

function renderGrid(snap) {
  const container = q('#pad-grid');
  if (!container) return;
  const groups = groupsOf(snap);
  const gmap = groupMap(snap);
  const list = filteredSamples(snap);
  const grouped = snap.grouped !== false && snap.category !== 'fav';

  const gridKey = [
    hotkeysOn ? 1 : 0,
    grouped ? 1 : 0,
    (snap.collapsed || []).join(','),
    groups.map((g) => `${g.id}:${g.name}:${g.icon}:${g.color}`).join('|'),
    snap.category,
    snap.search,
    list.map((s) => `${s.id}:${s.name}:${s.color}:${s.category}:${s.fav ? 1 : 0}:${Math.round((s.duration || 0) * 10)}`).join('|'),
  ].join('::');

  if (gridKey === lastGridKey) {
    paintClocksAndToolbar(snap);
    return;
  }
  lastGridKey = gridKey;

  if (!snap.samples.length && !grouped) {
    container.className = 'pad-grid';
    container.innerHTML = `<div class="pad-empty">
      <b>Nenhum sample no Pad</b>
      <p>Use <b>+ Cadastrar em Massa</b>, clique em <b>📁 Pasta</b>, arraste arquivos de áudio ou clique em <b>↺ Padrões</b>.</p>
    </div>`;
    paintClocksAndToolbar(snap);
    return;
  }

  let hotkeyIdx = 0;
  const nextHotkey = () => (hotkeysOn && hotkeyIdx < PAD_HOTKEYS.length ? PAD_HOTKEYS[hotkeyIdx++] : '');

  if (!grouped) {
    container.className = 'pad-grid';
    if (!list.length) {
      container.innerHTML = `<div class="pad-empty">
        <b>Nenhum sample nesta busca</b>
        <p>Tente outro filtro/busca ou cadastre novos áudios em massa.</p>
      </div>`;
    } else {
      container.innerHTML = list.map((s) => renderCardHtml(s, nextHotkey(), snap, gmap)).join('');
    }
  } else {
    container.className = 'pad-groups-wrap';
    const collapsed = new Set(snap.collapsed || []);
    const q = (snap.search || '').trim();
    const targetGroups = snap.category !== 'all'
      ? groups.filter((g) => g.id === snap.category)
      : groups;

    const sections = [];
    for (let gi = 0; gi < targetGroups.length; gi++) {
      const g = targetGroups[gi];
      const items = list.filter((s) => s.category === g.id);
      if (q && !items.length) continue;
      const isCol = !q && collapsed.has(g.id);
      const cardsHtml = items.length
        ? items.map((s) => renderCardHtml(s, nextHotkey(), snap, gmap)).join('')
        : '<div class="pad-group-empty">Sem samples neste grupo. Arraste um botão ou clique em <b>+ Samples</b>.</div>';
      const canMove = snap.category === 'all' && !q;
      sections.push(`<section class="pad-group pad-c-${esc(g.color || 'blue')} ${isCol ? 'collapsed' : ''}" data-group-sec="${esc(g.id)}">
        <header class="pad-group-head" draggable="${canMove ? 'true' : 'false'}" data-group-drag="${esc(g.id)}">
          ${canMove ? '<span class="pad-group-handle" title="Arraste para reordenar o grupo">⠿</span>' : ''}
          <button type="button" class="pad-group-toggle" data-group-toggle="${esc(g.id)}" title="${isCol ? 'Expandir grupo' : 'Recolher grupo'}">
            <span class="pad-group-chev">${isCol ? '▸' : '▾'}</span>
            <span class="pad-group-ico">${esc(g.icon || '🎵')}</span>
            <strong class="pad-group-title">${esc(g.name)}</strong>
            <span class="pad-group-count">${items.length}</span>
          </button>
          <div class="spacer"></div>
          <button type="button" class="btn sm ghost pad-group-add" data-group-add="${esc(g.id)}" title="Cadastrar samples em massa neste grupo">+ Samples</button>
          <button type="button" class="btn sm ghost icon pad-group-edit" data-group-edit="${esc(g.id)}" title="Editar nome, ícone ou cor do grupo">✎</button>
          ${canMove ? `<div class="pad-group-moves">
            <button type="button" class="btn sm ghost icon" data-group-mv="${esc(g.id)}" data-dir="-1" ${gi === 0 ? 'disabled' : ''} title="Subir grupo">↑</button>
            <button type="button" class="btn sm ghost icon" data-group-mv="${esc(g.id)}" data-dir="1" ${gi === targetGroups.length - 1 ? 'disabled' : ''} title="Descer grupo">↓</button>
          </div>` : ''}
        </header>
        <div class="pad-grid pad-group-grid" data-group-drop="${esc(g.id)}">${cardsHtml}</div>
      </section>`);
    }
    container.innerHTML = sections.length
      ? sections.join('')
      : `<div class="pad-empty"><b>Nenhum sample encontrado</b><p>Limpe a busca ou clique em <b>+ Cadastrar em Massa</b> / <b>↺ Padrões</b>.</p></div>`;
  }

  bindGridHandlers(container, grouped);
  paintClocksAndToolbar(snap);
}

function bindCardSeek(el, id) {
  if (!el || !id) return;
  const seekTo = (ev) => {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0)) return;
    const pct = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    if (ctrl?.seekPadPct) ctrl.seekPadPct(id, pct);
    // feedback imediato da linha enquanto arrasta (o estado real volta pelo snapshot)
    const fill = el.parentElement?.querySelector('.pad-card-fill');
    if (fill) fill.style.width = `${Math.round(pct * 100)}%`;
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
}

function bindGridHandlers(container, grouped) {
  container.querySelectorAll('[data-pad-hit]').forEach((btn) => {
    btn.onclick = () => ctrl?.playPad(btn.dataset.padHit);
  });
  // barra de seek do card: clique/arraste vai para o ponto (padrão parado começa dali)
  container.querySelectorAll('[data-pad-seek]').forEach((el) => bindCardSeek(el, el.dataset.padSeek));
  container.querySelectorAll('[data-pad-fav]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const s = currentSnap?.samples?.find((x) => x.id === btn.dataset.padFav);
      if (s) ctrl?.updatePadMeta(s.id, { fav: !s.fav });
    };
  });
  container.querySelectorAll('[data-pad-edit]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openEditModal(btn.dataset.padEdit);
    };
  });
  container.querySelectorAll('[data-pad-mv]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      ctrl?.movePadBy?.(btn.dataset.padMv, Number(btn.dataset.dir) || 1, { sameGroup: grouped });
    };
  });
  container.querySelectorAll('[data-pad-cat-sel]').forEach((sel) => {
    sel.onchange = (e) => {
      e.stopPropagation();
      ctrl?.movePadToGroup?.(sel.dataset.padCatSel, sel.value);
    };
  });

  // Eventos dos botões nos cards
  container.querySelectorAll('.pad-card[data-pad-id]').forEach((card) => {
    const id = card.dataset.padId;
    const grpId = card.dataset.padGroup || '';
    card.oncontextmenu = (e) => {
      e.preventDefault();
      openEditModal(id);
    };
    card.ondragstart = (e) => {
      if (e.target.closest('button, input, select')) return e.preventDefault();
      e.stopPropagation();
      dragPadId = id;
      dragGroupId = '';
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/x-castdeck-pad', id);
    };
    card.ondragend = () => {
      dragPadId = '';
      container.querySelectorAll('.pad-card, .pad-group').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-over', 'dragging'));
    };
    card.ondragover = (e) => {
      if (!dragPadId || dragPadId === id) return;
      e.preventDefault();
      e.stopPropagation();
      const r = card.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      card.classList.toggle('drop-before', !after);
      card.classList.toggle('drop-after', after);
    };
    card.ondragleave = () => card.classList.remove('drop-before', 'drop-after');
    card.ondrop = (e) => {
      const from = dragPadId || e.dataTransfer.getData('text/x-castdeck-pad');
      if (!from || from === id) return;
      e.preventDefault();
      e.stopPropagation();
      const r = card.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      card.classList.remove('drop-before', 'drop-after');
      ctrl?.movePad(from, id, { after, category: grouped ? grpId : '' });
    };
  });

  if (!grouped) return;

  container.querySelectorAll('[data-group-toggle]').forEach((btn) => {
    btn.onclick = () => ctrl?.togglePadGroupCollapse(btn.dataset.groupToggle);
  });
  container.querySelectorAll('[data-group-add]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openBulkModal(btn.dataset.groupAdd);
    };
  });
  container.querySelectorAll('[data-group-edit]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openGroupModal(btn.dataset.groupEdit);
    };
  });
  container.querySelectorAll('[data-group-mv]').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      ctrl?.movePadGroupBy(btn.dataset.groupMv, Number(btn.dataset.dir) || 0);
    };
  });

  // Drag & drop para reordenar grupos OU mover card/arquivos para dentro de um grupo
  container.querySelectorAll('.pad-group[data-group-sec]').forEach((sec) => {
    const gid = sec.dataset.groupSec;
    const head = sec.querySelector('.pad-group-head');
    if (head && head.draggable) {
      head.ondragstart = (e) => {
        if (e.target.closest('button, input')) return e.preventDefault();
        dragGroupId = gid;
        dragPadId = '';
        sec.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-castdeck-pad-group', gid);
      };
      head.ondragend = () => {
        dragGroupId = '';
        container.querySelectorAll('.pad-group').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'drop-over', 'dragging'));
      };
    }

    sec.ondragover = (e) => {
      if (dragGroupId && dragGroupId !== gid) {
        e.preventDefault();
        const r = sec.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        sec.classList.toggle('drop-before', !after);
        sec.classList.toggle('drop-after', after);
      } else if (dragPadId || [...(e.dataTransfer?.types || [])].includes('Files')) {
        e.preventDefault();
        sec.classList.add('drop-over');
      }
    };
    sec.ondragleave = (e) => {
      if (!sec.contains(e.relatedTarget)) {
        sec.classList.remove('drop-before', 'drop-after', 'drop-over');
      }
    };
    sec.ondrop = (e) => {
      sec.classList.remove('drop-before', 'drop-after', 'drop-over');
      if (dragGroupId && dragGroupId !== gid) {
        e.preventDefault();
        e.stopPropagation();
        const r = sec.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        ctrl?.movePadGroup(dragGroupId, gid, { after });
        return;
      }
      if (dragPadId) {
        e.preventDefault();
        e.stopPropagation();
        ctrl?.movePadToGroup(dragPadId, gid);
        return;
      }
      if (e.dataTransfer?.files?.length) {
        e.preventDefault();
        e.stopPropagation();
        ctrl?.addPadFiles(e.dataTransfer.files, { category: gid });
      }
    };
  });
}

function render(snap) {
  currentSnap = snap;
  renderCategories(snap);
  renderGrid(snap);
}

// ---------- Modal editar sample individual ----------
function openEditModal(id) {
  const s = currentSnap?.samples?.find((x) => x.id === id);
  if (!s) return;
  editingId = id;
  selectedColor = s.color || 'blue';
  $('#pad-edit-title').textContent = `Editar: ${s.name}`;
  $('#pad-edit-name').value = s.name;
  $('#pad-edit-fav').checked = !!s.fav;

  const catSel = $('#pad-edit-cat');
  catSel.innerHTML = groupsOf(currentSnap)
    .map((g) => `<option value="${esc(g.id)}" ${g.id === s.category ? 'selected' : ''}>${esc(g.icon ? g.icon + ' ' : '')}${esc(g.name)}</option>`)
    .join('');

  const swatchBox = $('#pad-edit-colors');
  swatchBox.innerHTML = PAD_COLORS.map(([cid, label]) =>
    `<button type="button" class="pad-swatch pad-c-${cid} ${selectedColor === cid ? 'on' : ''}" data-swatch="${cid}" title="${esc(label)}" aria-label="${esc(label)}"></button>`
  ).join('');
  swatchBox.querySelectorAll('[data-swatch]').forEach((b) => {
    b.onclick = () => {
      selectedColor = b.dataset.swatch;
      swatchBox.querySelectorAll('.pad-swatch').forEach((n) => n.classList.toggle('on', n === b));
    };
  });

  const delBtn = $('#pad-edit-delete');
  if (delBtn) delBtn.textContent = s.builtin ? 'Ocultar som padrão' : 'Excluir sample';

  $('#pad-edit-modal').hidden = false;
  setTimeout(() => $('#pad-edit-name')?.focus(), 20);
}

function closeEditModal() {
  editingId = '';
  $('#pad-edit-modal').hidden = true;
}

// ---------- Modal cadastro em massa ----------
function refreshBulkGroupSelect(preferId = '') {
  const sel = $('#pad-bulk-group');
  if (!sel) return;
  const groups = groupsOf(currentSnap || { groups: DEFAULT_PAD_GROUPS });
  const target = preferId || sel.value || (currentSnap?.category !== 'all' && currentSnap?.category !== 'fav' ? currentSnap?.category : 'custom');
  sel.innerHTML = groups.map((g) => `<option value="${esc(g.id)}">${esc(g.icon ? g.icon + ' ' : '')}${esc(g.name)}</option>`).join('');
  if (groups.some((g) => g.id === target)) sel.value = target;
}

function updateBulkQueueUi() {
  const qEl = $('#pad-bulk-queue');
  const subBtn = $('#pad-bulk-submit');
  if (!qEl || !subBtn) return;
  if (!bulkFiles.length) {
    qEl.textContent = 'Nenhum arquivo selecionado ainda.';
    subBtn.disabled = true;
    subBtn.textContent = 'Cadastrar tudo';
    return;
  }
  const preview = bulkFiles.slice(0, 8).map((f) => f.name).join(', ');
  const rest = bulkFiles.length > 8 ? ` e mais ${bulkFiles.length - 8}` : '';
  qEl.innerHTML = `<b>${bulkFiles.length} arquivo${bulkFiles.length === 1 ? '' : 's'} pronto${bulkFiles.length === 1 ? '' : 's'}:</b> ${esc(preview)}${esc(rest)}`;
  subBtn.disabled = false;
  subBtn.textContent = `Cadastrar ${bulkFiles.length} sample${bulkFiles.length === 1 ? '' : 's'}`;
}

function openBulkModal(defaultGroupId = '') {
  bulkFiles = [];
  refreshBulkGroupSelect(defaultGroupId);
  const colSel = $('#pad-bulk-color');
  if (colSel) {
    colSel.innerHTML = [
      '<option value="auto">Cores variadas (auto)</option>',
      ...PAD_COLORS.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`),
    ].join('');
  }
  const prog = $('#pad-bulk-progress');
  if (prog) {
    prog.hidden = true;
    prog.textContent = '';
  }
  updateBulkQueueUi();
  $('#pad-bulk-modal').hidden = false;
}

function closeBulkModal() {
  bulkFiles = [];
  $('#pad-bulk-modal').hidden = true;
}

// ---------- Modal criar / editar grupo ----------
function openGroupModal(groupId = '') {
  editingGroupId = groupId || '';
  const existing = groupId ? groupsOf(currentSnap).find((g) => g.id === groupId) : null;
  selectedGroupColor = existing?.color || 'blue';
  $('#pad-group-title').textContent = existing ? `Editar grupo: ${existing.name}` : 'Criar Novo Grupo';
  $('#pad-group-icon').value = existing?.icon || '🎵';
  $('#pad-group-name').value = existing?.name || '';
  const delBtn = $('#pad-group-delete');
  if (delBtn) delBtn.hidden = !existing || groupsOf(currentSnap).length <= 1;

  const box = $('#pad-group-colors');
  box.innerHTML = PAD_COLORS.map(([cid, label]) =>
    `<button type="button" class="pad-swatch pad-c-${cid} ${selectedGroupColor === cid ? 'on' : ''}" data-gswatch="${cid}" title="${esc(label)}"></button>`
  ).join('');
  box.querySelectorAll('[data-gswatch]').forEach((b) => {
    b.onclick = () => {
      selectedGroupColor = b.dataset.gswatch;
      box.querySelectorAll('.pad-swatch').forEach((n) => n.classList.toggle('on', n === b));
    };
  });
  $('#pad-group-modal').hidden = false;
  setTimeout(() => $('#pad-group-name')?.focus(), 20);
}

function closeGroupModal() {
  editingGroupId = '';
  $('#pad-group-modal').hidden = true;
}

// ---------- Fixar no topo via Document Picture-in-Picture ----------
function bindPinButton() {
  const pinBtn = $('#pad-pin');
  if (!pinBtn) return;
  let pipWin = null;
  const updatePinUi = (on) => {
    pinBtn.classList.toggle('active', on);
    pinBtn.setAttribute('aria-pressed', String(on));
    const lbl = $('#pad-pin-lbl');
    if (lbl) lbl.textContent = on ? 'Fixado no topo 📌' : 'Fixar no topo';
  };

  pinBtn.onclick = async () => {
    if (pipWin) {
      pipWin.close();
      pipWin = null;
      updatePinUi(false);
      return;
    }
    if (!('documentPictureInPicture' in window)) {
      toast('Seu navegador não suporta Picture-in-Picture de janela.', 'info');
      return;
    }
    try {
      pipWin = await window.documentPictureInPicture.requestWindow({
        width: Math.min(window.outerWidth || 900, 1080),
        height: Math.min(window.outerHeight || 700, 920),
      });
      for (const node of document.querySelectorAll('link[rel="stylesheet"], style')) {
        pipWin.document.head.appendChild(node.cloneNode(true));
      }
      pipWin.document.title = 'Pad de Efeitos (No Topo) — CastDeck';
      pipWin.document.body.className = document.body.className;

      const root = $('#pad-win-root');
      const ph = document.createElement('div');
      ph.className = 'pad-pip-ph';
      ph.innerHTML = '<b>Pad fixado sempre no topo 📌</b><p>Os efeitos estão visíveis acima de todos os aplicativos.</p><button type="button" class="btn sm ghost" id="pad-return-pip">↩ Trazer de volta</button>';
      root.parentNode.insertBefore(ph, root);
      pipWin.document.body.appendChild(root);
      updatePinUi(true);

      const restore = () => {
        if (!pipWin) return;
        ph.parentNode.insertBefore(root, ph);
        ph.remove();
        pipWin = null;
        updatePinUi(false);
      };
      pipWin.addEventListener('pagehide', restore);
      ph.querySelector('#pad-return-pip')?.addEventListener('click', () => pipWin?.close());
    } catch (e) {
      console.warn('[pad] PiP:', e);
    }
  };
}

function bindEvents() {
  $('#pad-stop-all')?.addEventListener('click', () => ctrl?.stopAllPads());
  $('#pad-player-stop')?.addEventListener('click', () => ctrl?.stopAllPads());
  $('#pad-player-play')?.addEventListener('click', () => ctrl?.replayLastPad?.());
  $('#pad-amb-prev')?.addEventListener('click', () => ctrl?.step?.(-1));
  $('#pad-amb-play')?.addEventListener('click', () => ctrl?.toggle?.());
  $('#pad-amb-stop')?.addEventListener('click', () => ctrl?.stop?.());
  $('#pad-amb-next')?.addEventListener('click', () => ctrl?.step?.(1));
  $('#pad-amb-mute')?.addEventListener('click', () => ctrl?.setMuted?.(!currentSnap?.ambient?.muted));
  $('#pad-amb-vol')?.addEventListener('input', (e) => ctrl?.setVolume?.(Number(e.target.value) / 100));

  const fsBtn = $('#pad-fs-btn');
  const syncFsUi = () => {
    const on = isFull(document.documentElement);
    if (fsBtn) {
      fsBtn.classList.toggle('active', on);
      fsBtn.setAttribute('aria-pressed', String(on));
    }
    const lbl = $('#pad-fs-lbl');
    if (lbl) lbl.textContent = on ? 'Sair tela cheia' : 'Tela cheia';
  };
  fsBtn?.addEventListener('click', () => toggleFull(document.documentElement));
  onFullChange(syncFsUi);
  syncFsUi();

  $('#pad-win-search')?.addEventListener('input', (e) => ctrl?.setPadSearch(e.target.value));
  $('#pad-search-clear')?.addEventListener('click', () => {
    const inp = $('#pad-win-search');
    if (inp) inp.value = '';
    ctrl?.setPadSearch('');
  });
  $('#pad-win-grouped')?.addEventListener('click', () => ctrl?.setPadGrouped(!(currentSnap?.grouped !== false)));
  $('#pad-win-reorder')?.addEventListener('click', () => {
    reorderOn = !reorderOn;
    if (currentSnap) paintClocksAndToolbar(currentSnap);
  });
  $('#pad-win-new-group')?.addEventListener('click', () => openGroupModal(''));
  $('#pad-win-overlap')?.addEventListener('change', (e) => ctrl?.setPadOverlap(e.target.checked));
  $('#pad-win-duck')?.addEventListener('change', (e) => ctrl?.setPadDucking(e.target.checked));
  $('#pad-win-mon')?.addEventListener('change', (e) => ctrl?.setPadMonitor(e.target.checked));
  $('#pad-win-keys')?.addEventListener('change', (e) => {
    hotkeysOn = !!e.target.checked;
    try { localStorage.setItem(KEYS_PREF, hotkeysOn ? '1' : '0'); } catch {}
    if (currentSnap) renderGrid(currentSnap);
  });
  $('#pad-win-mute')?.addEventListener('click', () => ctrl?.setPadMuted?.(!currentSnap?.muted));
  $('#pad-win-vol')?.addEventListener('input', (e) => ctrl?.setPadVolume(Number(e.target.value) / 100));

  $('#pad-qr-btn')?.addEventListener('click', () => {
    const modalEl = $('#pad-qr-modal');
    const bodyEl = $('#pad-qr-body');
    if (!modalEl || !bodyEl) return;
    modalEl.hidden = false;
    mountPadQrView(bodyEl, {
      studioId,
      onInfo: (info) => {
        if (!info.hostOnline && ctrl === standaloneFallback) {
          startStandaloneSignaling(info);
        }
      },
    });
  });
  $('#pad-qr-close')?.addEventListener('click', () => { $('#pad-qr-modal').hidden = true; });
  $('#pad-qr-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) $('#pad-qr-modal').hidden = true;
  });

  $('#pad-win-bulk')?.addEventListener('click', () => openBulkModal(''));
  $('#pad-win-folder-btn')?.addEventListener('click', () => $('#pad-win-folder')?.click());
  $('#pad-win-folder')?.addEventListener('change', (e) => {
    const destCat = currentSnap?.category !== 'all' && currentSnap?.category !== 'fav' ? currentSnap?.category : 'custom';
    ctrl?.addPadFiles(e.target.files, { category: destCat });
    e.target.value = '';
  });
  $('#pad-win-restore')?.addEventListener('click', () => ctrl?.restorePresetPads());

  // Confirmar Apagar Tudo
  $('#pad-win-clear')?.addEventListener('click', () => {
    const n = currentSnap?.samples?.length || 0;
    $('#pad-confirm-msg').textContent = `Isso remove todos os ${n} samples atuais (uploads e padrões ocultados) para começar do zero. Você pode restaurar os padrões a qualquer momento em “↺ Padrões”.`;
    $('#pad-confirm-modal').hidden = false;
  });
  $('#pad-confirm-close')?.addEventListener('click', () => { $('#pad-confirm-modal').hidden = true; });
  $('#pad-confirm-no')?.addEventListener('click', () => { $('#pad-confirm-modal').hidden = true; });
  $('#pad-confirm-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) $('#pad-confirm-modal').hidden = true;
  });
  $('#pad-confirm-yes')?.addEventListener('click', async () => {
    $('#pad-confirm-modal').hidden = true;
    await ctrl?.clearAllPads({ force: true });
  });

  // Modal editar sample
  $('#pad-edit-close')?.addEventListener('click', closeEditModal);
  $('#pad-edit-cancel')?.addEventListener('click', closeEditModal);
  $('#pad-edit-modal')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeEditModal(); });
  $('#pad-edit-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!editingId) return;
    ctrl?.updatePadMeta(editingId, {
      name: $('#pad-edit-name').value,
      category: $('#pad-edit-cat').value,
      color: selectedColor,
      fav: $('#pad-edit-fav').checked,
    });
    closeEditModal();
  });
  $('#pad-edit-delete')?.addEventListener('click', async () => {
    if (!editingId) return;
    const id = editingId;
    closeEditModal();
    await ctrl?.removePadSample(id);
  });

  // Modal cadastro em massa
  $('#pad-bulk-close')?.addEventListener('click', closeBulkModal);
  $('#pad-bulk-cancel')?.addEventListener('click', closeBulkModal);
  $('#pad-bulk-modal')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeBulkModal(); });
  $('#pad-bulk-pick-files')?.addEventListener('click', () => $('#pad-bulk-files')?.click());
  $('#pad-bulk-pick-folder')?.addEventListener('click', () => $('#pad-bulk-folder')?.click());
  $('#pad-bulk-files')?.addEventListener('change', (e) => {
    bulkFiles = [...bulkFiles, ...(e.target.files || [])];
    e.target.value = '';
    updateBulkQueueUi();
  });
  $('#pad-bulk-folder')?.addEventListener('change', (e) => {
    bulkFiles = [...bulkFiles, ...(e.target.files || [])];
    e.target.value = '';
    updateBulkQueueUi();
  });
  $('#pad-bulk-newgrp-btn')?.addEventListener('click', () => {
    const inp = $('#pad-bulk-newgrp-name');
    const g = ctrl?.addPadGroup({ name: inp?.value || '', icon: '🎵', color: $('#pad-bulk-color')?.value === 'auto' ? 'blue' : $('#pad-bulk-color')?.value });
    if (g) {
      if (inp) inp.value = '';
      refreshBulkGroupSelect(g.id);
    }
  });
  const bulkDrop = $('#pad-bulk-drop');
  if (bulkDrop) {
    bulkDrop.addEventListener('dragover', (e) => {
      if ([...(e.dataTransfer?.types || [])].includes('Files')) {
        e.preventDefault();
        bulkDrop.classList.add('over');
      }
    });
    bulkDrop.addEventListener('dragleave', () => bulkDrop.classList.remove('over'));
    bulkDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      bulkDrop.classList.remove('over');
      if (e.dataTransfer?.files?.length) {
        bulkFiles = [...bulkFiles, ...e.dataTransfer.files];
        updateBulkQueueUi();
      }
    });
  }
  $('#pad-bulk-submit')?.addEventListener('click', async () => {
    if (!bulkFiles.length) return;
    const subBtn = $('#pad-bulk-submit');
    const prog = $('#pad-bulk-progress');
    if (subBtn) subBtn.disabled = true;
    if (prog) {
      prog.hidden = false;
      prog.textContent = `Cadastrando 0/${bulkFiles.length}…`;
    }
    const groupId = $('#pad-bulk-group')?.value || 'custom';
    const color = $('#pad-bulk-color')?.value || 'auto';
    await ctrl?.addPadFiles(bulkFiles, {
      category: groupId,
      color,
      onProgress: ({ done, total, name }) => {
        if (prog) prog.textContent = `Cadastrando ${done}/${total}: ${name}`;
      },
    });
    closeBulkModal();
  });

  // Modal grupo
  $('#pad-group-close')?.addEventListener('click', closeGroupModal);
  $('#pad-group-cancel')?.addEventListener('click', closeGroupModal);
  $('#pad-group-modal')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeGroupModal(); });
  $('#pad-group-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#pad-group-name').value.trim();
    const icon = $('#pad-group-icon').value.trim() || '🎵';
    if (!name) return;
    if (editingGroupId) ctrl?.updatePadGroup(editingGroupId, { name, icon, color: selectedGroupColor });
    else ctrl?.addPadGroup({ name, icon, color: selectedGroupColor });
    closeGroupModal();
  });
  $('#pad-group-delete')?.addEventListener('click', () => {
    if (!editingGroupId) return;
    const gid = editingGroupId;
    closeGroupModal();
    ctrl?.removePadGroup(gid);
  });

  // Drag & drop global de arquivos
  const main = $('#pad-win-main');
  if (main) {
    main.addEventListener('dragover', (e) => {
      if (!dragPadId && !dragGroupId && [...(e.dataTransfer?.types || [])].includes('Files')) {
        e.preventDefault();
        main.classList.add('music-drop');
      }
    });
    main.addEventListener('dragleave', () => main.classList.remove('music-drop'));
    main.addEventListener('drop', (e) => {
      if (dragPadId || dragGroupId) return;
      e.preventDefault();
      main.classList.remove('music-drop');
      if (e.dataTransfer?.files?.length) {
        const destCat = currentSnap?.category !== 'all' && currentSnap?.category !== 'fav' ? currentSnap?.category : 'custom';
        ctrl?.addPadFiles(e.dataTransfer.files, { category: destCat });
      }
    });
  }

  // Atalhos do teclado: Esc para tudo ou fecha modal, / ou ↓ busca, 1–0 / Q–P disparam pads visíveis
  window.addEventListener('keydown', (e) => {
    const anyModal = !$('#pad-edit-modal').hidden || !$('#pad-bulk-modal').hidden || !$('#pad-group-modal').hidden || !$('#pad-confirm-modal').hidden || !$('#pad-qr-modal').hidden;
    if (e.key === 'Escape') {
      if (!$('#pad-edit-modal').hidden) return closeEditModal();
      if (!$('#pad-bulk-modal').hidden) return closeBulkModal();
      if (!$('#pad-group-modal').hidden) return closeGroupModal();
      if (!$('#pad-confirm-modal').hidden) { $('#pad-confirm-modal').hidden = true; return; }
      if (!$('#pad-qr-modal').hidden) { $('#pad-qr-modal').hidden = true; return; }
      ctrl?.stopAllPads();
      return;
    }
    const inInput = e.target.closest?.('input, textarea, select, [contenteditable]');
    if ((e.key === 'ArrowDown' || e.key === '/') && !inInput && !anyModal) {
      e.preventDefault();
      $('#pad-win-search')?.focus();
      return;
    }
    if (!hotkeysOn || inInput || anyModal || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const k = e.key.toUpperCase();
    const pos = PAD_HOTKEYS.indexOf(k);
    if (pos < 0 || !currentSnap) return;
    const list = filteredSamples(currentSnap);
    if (list[pos]) {
      e.preventDefault();
      ctrl?.playPad(list[pos].id);
    }
  });

  bindPinButton();
}

// Barra "agora tocando": clique/arraste busca no material que está no ar (útil como playout).
function bindNowBarSeek() {
  const bar = q('.pad-now-bar');
  if (!bar || bar.dataset.seekBound) return;
  bar.dataset.seekBound = '1';
  bar.classList.add('pad-now-bar-seek');
  bar.title = 'Clique ou arraste para ir a um ponto do material que está tocando';
  const seekTo = (ev) => {
    const id = currentSnap?.nowPlaying?.sampleId;
    if (!id || !ctrl?.seekPadPct) return;
    const r = bar.getBoundingClientRect();
    if (!(r.width > 0)) return;
    ctrl.seekPadPct(id, Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)));
  };
  bar.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    try { bar.setPointerCapture(ev.pointerId); } catch {}
    seekTo(ev);
    const move = (e2) => { e2.preventDefault(); seekTo(e2); };
    const up = () => {
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  });
}

function attach() {
  const { music, linked, studioName } = resolveController();
  updateConnUi(linked, studioName);
  bindNowBarSeek();
  if (ctrl === music && unsubscribe) return;
  unsubscribe?.();
  ctrl = music;
  unsubscribe = ctrl.subscribePad(render);
}

bindEvents();
attach();
try { bridgeBc?.postMessage({ type: 'hello', targetStudioId: studioId }); } catch {}

const openerPoll = setInterval(() => {
  const openerMusic = window.opener && !window.opener.closed ? window.opener.__castdeck?.music : null;
  if (openerMusic && ctrl !== openerMusic) attach();
  else if (!openerMusic) {
    if (!bridgeSnap) {
      try { bridgeBc?.postMessage({ type: 'hello', targetStudioId: studioId }); } catch {}
    }
    if (!bridgeSnap && ctrl !== standaloneFallback) attach();
  }
}, 1500);

window.addEventListener('beforeunload', () => {
  clearInterval(openerPoll);
  stopStandaloneSignaling();
  unsubscribe?.();
});
