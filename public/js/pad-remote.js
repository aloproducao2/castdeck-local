// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Controle mobile/externo do Pad via QR Code (/pad-remote/:id?k=<chave>).
import { Signaling } from './rtc.js';
import { esc, icons } from './ui.js';
import { toggleFull, isFull, onFullChange } from './fullscreen.js';
import { fmtDur, fmtPadClock, DEFAULT_PAD_GROUPS } from './studio/music.js';

const $ = (s, p = document) => p.querySelector(s);
const room = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const key = new URLSearchParams(location.search).get('k') || '';

const sig = new Signaling();
let hostOnline = false;
let studioName = '';
let pad = null;
let syncedAt = performance.now();
let selectedCat = 'all';
let search = '';
let grouped = true;
let reorderOn = false;
let dragPadId = '';
const collapsed = new Set();
let lastGridKey = '';
let volLockUntil = 0;
let lastVolSentAt = 0;
let pendingVolTimer = 0;
let ambVolLockUntil = 0;
let lastAmbVolSentAt = 0;
let pendingAmbVolTimer = 0;

function buzz(ms = 14) {
  try { navigator.vibrate?.(ms); } catch {}
}

function sendCmd(cmd) {
  buzz();
  sig.send({ type: 'remote-cmd', cmd });
}

function showErr(msg) {
  $('#pr-err-msg').textContent = msg || 'Link inválido ou estúdio indisponível.';
  $('#pr-err').hidden = false;
}

function updateConnUi() {
  const dot = $('#pr-dot');
  const sub = $('#pr-sub');
  const ok = !!(hostOnline && pad);
  if (dot) dot.className = 'dot ' + (ok ? 'on' : 'wait');
  if (sub) {
    if (!hostOnline) sub.textContent = 'Estúdio offline — aguardando…';
    else if (!pad) sub.textContent = `${studioName || 'Conectado'} · carregando Pad…`;
    else sub.textContent = `${studioName || 'Estúdio'} · ${(pad.samples || []).length} efeitos`;
  }
}

function groupsList() {
  return pad?.groups?.length ? pad.groups : DEFAULT_PAD_GROUPS;
}

function filteredSamples() {
  const q = search.trim().toLowerCase();
  return (pad?.samples || []).filter((s) => {
    if (selectedCat === 'fav' && !s.fav) return false;
    if (selectedCat !== 'all' && selectedCat !== 'fav' && s.category !== selectedCat) return false;
    if (q && !s.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderCategories() {
  const box = $('#pr-cats');
  if (!box || !pad) return;
  const groups = groupsList();
  const samples = pad.samples || [];
  if (selectedCat !== 'all' && selectedCat !== 'fav' && !groups.some((g) => g.id === selectedCat)) {
    selectedCat = 'all';
  }
  const items = [
    ['all', 'Todos', samples.length],
    ['fav', '★ Favoritos', samples.filter((s) => s.fav).length],
    ...groups.map((g) => [g.id, `${g.icon ? g.icon + ' ' : ''}${g.name}`, samples.filter((s) => s.category === g.id).length]),
  ];
  box.innerHTML = items
    .map(([id, label, n]) => `<button type="button" class="pad-cat ${selectedCat === id ? 'on' : ''}" data-cat="${esc(id)}">${esc(label)} <small>${n}</small></button>`)
    .join('');
  box.querySelectorAll('[data-cat]').forEach((b) => {
    b.onclick = () => {
      selectedCat = b.dataset.cat;
      renderCategories();
      renderGrid();
    };
  });
}

function paintClocksAndBar() {
  if (!pad) return;
  const dt = Math.max(0, (performance.now() - syncedAt) / 1000);
  const nowBox = $('#pr-now-box');
  const nowName = $('#pr-now-name');
  const nowBadge = $('#pr-now-badge');
  const prog = $('#pr-clk-prog');
  const rem = $('#pr-clk-rem');
  const durEl = $('#pr-clk-dur');
  const bar = $('#pr-clk-bar');
  const stopBtn = $('#pr-stop-all');
  const inlineStop = $('#pr-player-stop');
  const inlinePlay = $('#pr-player-play');

  const np = pad.nowPlaying;
  if (np && pad.playingCount > 0) {
    const dur = Number(np.duration) || 0;
    const elapsed = dur > 0 ? Math.min(dur, (np.elapsed || 0) + dt) : (np.elapsed || 0) + dt;
    const remaining = dur > 0 ? Math.max(0, dur - elapsed) : 0;
    const pct = dur > 0 ? Math.max(0, Math.min(1, elapsed / dur)) : 0;
    if (nowName) nowName.textContent = np.name;
    if (nowBadge) nowBadge.textContent = pad.playingCount > 1 ? `${pad.playingCount} ativos` : 'TOCANDO';
    if (prog) prog.textContent = fmtPadClock(elapsed);
    if (rem) {
      rem.textContent = `-${fmtPadClock(remaining)}`;
      rem.classList.toggle('ending', dur > 0 && remaining < 1.5);
    }
    if (durEl) durEl.textContent = fmtPadClock(dur);
    if (bar) bar.style.width = `${Math.round(pct * 100)}%`;
    nowBox?.classList.add('active');
  } else {
    if (nowName) nowName.textContent = pad.playingCount ? 'Tocando…' : (pad.lastSampleName ? `Pronto · ${pad.lastSampleName}` : 'Pronto para disparar');
    if (nowBadge) nowBadge.textContent = pad.playingCount ? `${pad.playingCount} ativo` : 'Parado';
    if (prog) prog.textContent = '00:00.0';
    if (rem) {
      rem.textContent = '-00:00.0';
      rem.classList.remove('ending');
    }
    if (durEl) durEl.textContent = '00:00.0';
    if (bar) bar.style.width = '0%';
    nowBox?.classList.remove('active');
  }

  // Botões de Parar e controles do Player sempre visíveis e clicáveis
  const playingNow = pad.playingCount > 0;
  if (stopBtn) {
    stopBtn.disabled = false;
    stopBtn.classList.toggle('is-playing', playingNow);
  }
  if (inlineStop) {
    inlineStop.disabled = false;
    inlineStop.classList.toggle('is-playing', playingNow);
  }
  if (inlinePlay) {
    inlinePlay.title = pad.lastSampleName ? `Tocar / repetir: ${pad.lastSampleName}` : 'Tocar efeito';
  }

  const volInp = $('#pr-vol');
  const volVal = $('#pr-vol-val');
  const pct = Math.round((pad.volume ?? 0.85) * 100);
  if (volInp && document.activeElement !== volInp && performance.now() > volLockUntil) {
    volInp.value = String(pct);
    if (volVal) volVal.textContent = `${pct}%`;
  }
  const muteBtn = $('#pr-mute');
  if (muteBtn) {
    const muted = !!pad.muted;
    muteBtn.classList.toggle('on', muted);
    muteBtn.classList.toggle('danger', muted);
    muteBtn.innerHTML = muted ? icons.volumeOff : icons.volume;
    muteBtn.setAttribute('aria-pressed', String(muted));
  }

  // Controles do Player da Trilha Sonora sempre visíveis
  const amb = pad.ambient || {
    playing: !!pad.ambientPlaying,
    name: pad.ambientName || '',
    trackCount: 0,
    currentTime: 0,
    duration: 0,
    volume: 0.4,
    muted: false,
  };
  const ambName = $('#pr-amb-name');
  if (ambName) ambName.textContent = amb.name || (amb.trackCount ? 'Trilha parada' : 'Sem faixa na Trilha');
  const ambTime = $('#pr-amb-time');
  if (ambTime) {
    const ambCur = amb.playing ? Math.min(amb.duration || 99999, (amb.currentTime || 0) + dt) : (amb.currentTime || 0);
    ambTime.textContent = `${fmtDur(ambCur)} / ${fmtDur(amb.duration || 0)}`;
  }
  const ambPlay = $('#pr-amb-play');
  if (ambPlay) {
    ambPlay.textContent = amb.playing ? '⏸' : '▶';
    ambPlay.title = amb.playing ? 'Pausar trilha' : 'Tocar trilha';
  }
  const ambMute = $('#pr-amb-mute');
  if (ambMute) {
    ambMute.classList.toggle('on', !!amb.muted);
    ambMute.classList.toggle('danger', !!amb.muted);
    ambMute.innerHTML = amb.muted ? icons.volumeOff : icons.volume;
    ambMute.setAttribute('aria-pressed', String(!!amb.muted));
  }
  const ambVol = $('#pr-amb-vol');
  const ambVolVal = $('#pr-amb-vol-val');
  const ambPct = Math.round((amb.volume ?? 0.4) * 100);
  if (ambVol && document.activeElement !== ambVol && performance.now() > ambVolLockUntil) {
    ambVol.value = String(ambPct);
    if (ambVolVal) ambVolVal.textContent = `${ambPct}%`;
  }

  const ov = $('#pr-overlap');
  if (ov) ov.checked = !!pad.overlap;
  const dk = $('#pr-duck');
  if (dk) dk.checked = !!pad.ducking;
  const reBtn = $('#pr-reorder');
  if (reBtn) {
    reBtn.classList.toggle('active', reorderOn);
    reBtn.setAttribute('aria-pressed', String(reorderOn));
  }
  $('#pad-rem-app')?.classList.toggle('reordering', reorderOn);

  const grpBtn = $('#pr-grouped');
  if (grpBtn) {
    grpBtn.classList.toggle('active', grouped);
    grpBtn.setAttribute('aria-pressed', String(grouped));
    grpBtn.textContent = grouped ? '🗂️ Grupos' : '🎛️ Grade';
  }

  document.querySelectorAll('.pad-rem-btn[data-pad-id]').forEach((card) => {
    const base = pad.activeSamples?.[card.dataset.padId];
    const playing = !!base && pad.playingCount > 0;
    card.classList.toggle('playing', playing);
    let pctCard = 0;
    const durElCard = card.querySelector('.pad-card-dur');
    if (playing) {
      const dur = Number(base.duration) || 0;
      const el = dur > 0 ? Math.min(dur, (base.elapsed || 0) + dt) : (base.elapsed || 0) + dt;
      const rm = dur > 0 ? Math.max(0, dur - el) : 0;
      pctCard = dur > 0 ? Math.max(0, Math.min(1, el / dur)) : 0;
      if (durElCard) durElCard.textContent = dur > 0 ? `${fmtPadClock(el)} / -${fmtPadClock(rm)}` : fmtPadClock(el);
    } else if (durElCard) {
      const s = pad.samples?.find((x) => x.id === card.dataset.padId);
      durElCard.textContent = s?.duration ? fmtDur(s.duration) : 'MP3';
    }
    const fill = card.querySelector('.pad-card-fill');
    if (fill) fill.style.width = `${Math.round(pctCard * 100)}%`;
  });
}

function cardHtml(s, gmap, groups) {
  const st = pad.activeSamples?.[s.id];
  const grp = gmap.get(s.category);
  return `<div class="pad-card pad-rem-btn pad-c-${esc(s.color || 'blue')} ${st ? 'playing' : ''}" data-pad-id="${esc(s.id)}" data-pad-group="${esc(s.category)}" draggable="true">
    <div class="pad-card-top">
      <span class="pad-drag-handle" title="Arraste para reorganizar">⠿</span>
      <span class="pad-card-cat">${esc(grp ? grp.name : s.category)}</span>
      <div class="spacer"></div>
      <button type="button" class="pad-card-icon ${s.fav ? 'fav' : ''}" data-pad-fav="${esc(s.id)}" data-fav="${s.fav ? 1 : 0}" aria-label="Favorito">★</button>
    </div>
    <div class="pad-card-rebar" title="Mover botão ou trocar de grupo">
      <button type="button" class="pad-mv-btn" data-pad-mv="${esc(s.id)}" data-dir="-1" title="Mover antes (◀)">◀</button>
      <select class="pad-cat-sel" data-pad-cat-sel="${esc(s.id)}" aria-label="Grupo de ${esc(s.name)}">
        ${groups.map((g) => `<option value="${esc(g.id)}" ${g.id === s.category ? 'selected' : ''}>${esc(g.icon ? g.icon + ' ' : '')}${esc(g.name)}</option>`).join('')}
      </select>
      <button type="button" class="pad-mv-btn" data-pad-mv="${esc(s.id)}" data-dir="1" title="Mover depois (▶)">▶</button>
    </div>
    <button type="button" class="pad-card-hit" data-pad-hit="${esc(s.id)}">
      <span class="pad-card-ring" aria-hidden="true">${icons.volume}</span>
      <strong class="pad-card-name">${esc(s.name)}</strong>
      <small class="pad-card-dur">${s.duration ? fmtDur(s.duration) : 'MP3'}</small>
    </button>
    <i class="pad-card-fill" style="width:0%"></i>
  </div>`;
}

function optimisticMovePad(fromId, targetId, { after = false, category = '' } = {}) {
  if (!pad?.samples || !fromId || fromId === targetId) return;
  const fromIdx = pad.samples.findIndex((s) => s.id === fromId);
  if (fromIdx < 0) return;
  const [item] = pad.samples.splice(fromIdx, 1);
  if (category) item.category = category;
  let targetIdx = targetId ? pad.samples.findIndex((s) => s.id === targetId) : -1;
  if (targetIdx < 0) pad.samples.push(item);
  else {
    if (after) targetIdx++;
    pad.samples.splice(targetIdx, 0, item);
  }
  renderCategories();
  renderGrid();
}

function optimisticMovePadBy(id, dir, sameGroup) {
  if (!pad?.samples) return;
  const item = pad.samples.find((s) => s.id === id);
  if (!item) return;
  const pool = sameGroup ? pad.samples.filter((s) => s.category === item.category) : pad.samples;
  const pos = pool.findIndex((s) => s.id === id);
  const nextPos = pos + (dir < 0 ? -1 : 1);
  if (pos < 0 || nextPos < 0 || nextPos >= pool.length) return;
  optimisticMovePad(id, pool[nextPos].id, { after: dir > 0 });
}

function renderGrid() {
  const main = $('#pr-main');
  if (!main) return;
  if (!pad) {
    lastGridKey = '';
    main.innerHTML = `<div class="pad-empty"><b>Aguardando conexão com o Pad…</b><p>Deixe o CastDeck aberto no computador.</p></div>`;
    return;
  }
  const groups = groupsList();
  const gmap = new Map(groups.map((g) => [g.id, g]));
  const list = filteredSamples();
  const useGroups = grouped && selectedCat !== 'fav';

  const keyStr = [
    useGroups ? 1 : 0,
    [...collapsed].join(','),
    groups.map((g) => `${g.id}:${g.name}:${g.icon}:${g.color}`).join('|'),
    selectedCat,
    search,
    list.map((s) => `${s.id}:${s.name}:${s.color}:${s.category}:${s.fav ? 1 : 0}:${Math.round((s.duration || 0) * 10)}`).join('|'),
  ].join('::');

  if (keyStr === lastGridKey) {
    paintClocksAndBar();
    return;
  }
  lastGridKey = keyStr;

  if (!list.length) {
    main.innerHTML = `<div class="pad-empty"><b>Nenhum sample encontrado</b><p>Tente outro filtro ou adicione efeitos no computador.</p></div>`;
    paintClocksAndBar();
    return;
  }

  if (!useGroups) {
    main.innerHTML = `<div class="pad-rem-grid">${list.map((s) => cardHtml(s, gmap, groups)).join('')}</div>`;
  } else {
    const q = search.trim();
    const target = selectedCat !== 'all' ? groups.filter((g) => g.id === selectedCat) : groups;
    const canMoveGrp = selectedCat === 'all' && !q;
    const html = target
      .map((g, gi) => {
        const items = list.filter((s) => s.category === g.id);
        if (!items.length && (q || target.length > 1)) return '';
        const isCol = !q && collapsed.has(g.id);
        return `<section class="pad-group pad-c-${esc(g.color || 'blue')} ${isCol ? 'collapsed' : ''}">
          <header class="pad-group-head">
            <button type="button" class="pad-group-toggle" data-group-toggle="${esc(g.id)}">
              <span class="pad-group-chev">${isCol ? '▸' : '▾'}</span>
              <span class="pad-group-ico">${esc(g.icon || '🎵')}</span>
              <strong class="pad-group-title">${esc(g.name)}</strong>
              <span class="pad-group-count">${items.length}</span>
            </button>
            <div class="spacer"></div>
            ${canMoveGrp ? `<div class="pad-group-moves pad-rem-gmoves">
              <button type="button" class="btn sm ghost icon" data-group-mv="${esc(g.id)}" data-dir="-1" ${gi === 0 ? 'disabled' : ''} title="Subir grupo">↑</button>
              <button type="button" class="btn sm ghost icon" data-group-mv="${esc(g.id)}" data-dir="1" ${gi === target.length - 1 ? 'disabled' : ''} title="Descer grupo">↓</button>
            </div>` : ''}
          </header>
          <div class="pad-rem-grid pad-group-grid">${items.length ? items.map((s) => cardHtml(s, gmap, groups)).join('') : '<div class="pad-group-empty">Sem efeitos neste grupo.</div>'}</div>
        </section>`;
      })
      .join('');
    main.innerHTML = `<div class="pad-groups-wrap">${html || '<div class="pad-empty"><b>Nenhum sample encontrado</b></div>'}</div>`;
  }

  main.querySelectorAll('[data-pad-hit]').forEach((b) => {
    b.onclick = () => sendCmd({ op: 'pad-play', id: b.dataset.padHit });
  });
  main.querySelectorAll('[data-pad-fav]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const next = b.dataset.fav !== '1';
      sendCmd({ op: 'pad-fav', id: b.dataset.padFav, on: next });
    };
  });
  main.querySelectorAll('[data-pad-mv]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const id = b.dataset.padMv;
      const dir = Number(b.dataset.dir) < 0 ? -1 : 1;
      optimisticMovePadBy(id, dir, useGroups);
      sendCmd({ op: 'pad-move-by', id, dir, sameGroup: useGroups });
    };
  });
  main.querySelectorAll('[data-pad-cat-sel]').forEach((sel) => {
    sel.onchange = (e) => {
      e.stopPropagation();
      const id = sel.dataset.padCatSel;
      const category = sel.value;
      const targetItem = pad?.samples?.find((x) => x.id === id);
      if (targetItem) targetItem.category = category;
      renderCategories();
      renderGrid();
      sendCmd({ op: 'pad-set-cat', id, category });
    };
  });
  main.querySelectorAll('[data-group-mv]').forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const id = b.dataset.groupMv;
      const dir = Number(b.dataset.dir) < 0 ? -1 : 1;
      if (pad?.groups) {
        const i = pad.groups.findIndex((x) => x.id === id);
        const next = i + dir;
        if (i >= 0 && next >= 0 && next < pad.groups.length) {
          const [g] = pad.groups.splice(i, 1);
          pad.groups.splice(next, 0, g);
          renderCategories();
          renderGrid();
        }
      }
      sendCmd({ op: 'pad-group-move', id, dir });
    };
  });
  main.querySelectorAll('[data-group-toggle]').forEach((b) => {
    b.onclick = () => {
      const gid = b.dataset.groupToggle;
      if (collapsed.has(gid)) collapsed.delete(gid);
      else collapsed.add(gid);
      renderGrid();
    };
  });

  // Drag-and-drop nos cards do controle externo
  main.querySelectorAll('.pad-rem-btn[data-pad-id]').forEach((card) => {
    const id = card.dataset.padId;
    const grpId = card.dataset.padGroup || '';
    card.ondragstart = (e) => {
      if (e.target.closest('button, input, select')) return e.preventDefault();
      dragPadId = id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/x-castdeck-pad', id);
    };
    card.ondragend = () => {
      dragPadId = '';
      main.querySelectorAll('.pad-rem-btn').forEach((n) => n.classList.remove('drop-before', 'drop-after', 'dragging'));
    };
    card.ondragover = (e) => {
      if (!dragPadId || dragPadId === id) return;
      e.preventDefault();
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
      const r = card.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      card.classList.remove('drop-before', 'drop-after');
      const category = useGroups ? grpId : '';
      optimisticMovePad(from, id, { after, category });
      sendCmd({ op: 'pad-move', id: from, targetId: id, after, category });
    };
  });

  paintClocksAndBar();
}

function sendVolumeThrottled(pct, immediate = false) {
  const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0))) / 100;
  const volVal = $('#pr-vol-val');
  if (volVal) volVal.textContent = `${Math.round(v * 100)}%`;
  volLockUntil = performance.now() + 260;

  const flush = () => {
    lastVolSentAt = performance.now();
    sig.send({ type: 'remote-cmd', cmd: { op: 'pad-vol', vol: v } });
  };

  clearTimeout(pendingVolTimer);
  const elapsed = performance.now() - lastVolSentAt;
  if (immediate || elapsed >= 45) flush();
  else pendingVolTimer = setTimeout(flush, 45 - elapsed);
}

function sendAmbientVolumeThrottled(pct, immediate = false) {
  const v = Math.max(0, Math.min(100, Math.round(Number(pct) || 0))) / 100;
  const volVal = $('#pr-amb-vol-val');
  if (volVal) volVal.textContent = `${Math.round(v * 100)}%`;
  ambVolLockUntil = performance.now() + 260;

  const flush = () => {
    lastAmbVolSentAt = performance.now();
    sig.send({ type: 'remote-cmd', cmd: { op: 'music-vol', vol: v } });
  };

  clearTimeout(pendingAmbVolTimer);
  const elapsed = performance.now() - lastAmbVolSentAt;
  if (immediate || elapsed >= 45) flush();
  else pendingAmbVolTimer = setTimeout(flush, 45 - elapsed);
}

function bindEvents() {
  const stopAll = () => sendCmd({ op: 'pad-stop' });
  $('#pr-stop-all')?.addEventListener('click', stopAll);
  $('#pr-player-stop')?.addEventListener('click', stopAll);
  $('#pr-player-play')?.addEventListener('click', () => sendCmd({ op: 'pad-replay' }));

  const fsBtn = $('#pr-fs-btn');
  const syncFsUi = () => {
    const on = isFull(document.documentElement);
    if (fsBtn) {
      fsBtn.classList.toggle('active', on);
      fsBtn.setAttribute('aria-pressed', String(on));
      fsBtn.title = on ? 'Sair da tela cheia' : 'Colocar em tela cheia';
      fsBtn.textContent = on ? '⛶ Sair' : '⛶';
    }
  };
  fsBtn?.addEventListener('click', () => toggleFull(document.documentElement));
  onFullChange(syncFsUi);
  syncFsUi();

  $('#pr-amb-prev')?.addEventListener('click', () => sendCmd({ op: 'music-step', dir: -1 }));
  $('#pr-amb-play')?.addEventListener('click', () => sendCmd({ op: 'music-toggle' }));
  $('#pr-amb-stop')?.addEventListener('click', () => sendCmd({ op: 'music-stop' }));
  $('#pr-amb-next')?.addEventListener('click', () => sendCmd({ op: 'music-step', dir: 1 }));
  $('#pr-amb-mute')?.addEventListener('click', () => sendCmd({ op: 'music-mute', on: !pad?.ambient?.muted }));
  const ambVol = $('#pr-amb-vol');
  ambVol?.addEventListener('pointerdown', () => { ambVolLockUntil = performance.now() + 600; });
  ambVol?.addEventListener('touchstart', () => { ambVolLockUntil = performance.now() + 600; }, { passive: true });
  ambVol?.addEventListener('input', (e) => sendAmbientVolumeThrottled(e.target.value, false));
  ambVol?.addEventListener('change', (e) => sendAmbientVolumeThrottled(e.target.value, true));

  $('#pr-mute')?.addEventListener('click', () => sendCmd({ op: 'pad-mute', on: !pad?.muted }));
  const volInp = $('#pr-vol');
  volInp?.addEventListener('pointerdown', () => { volLockUntil = performance.now() + 600; });
  volInp?.addEventListener('touchstart', () => { volLockUntil = performance.now() + 600; }, { passive: true });
  volInp?.addEventListener('input', (e) => sendVolumeThrottled(e.target.value, false));
  volInp?.addEventListener('change', (e) => sendVolumeThrottled(e.target.value, true));
  $('#pr-overlap')?.addEventListener('change', (e) => sendCmd({ op: 'pad-overlap', on: !!e.target.checked }));
  $('#pr-duck')?.addEventListener('change', (e) => sendCmd({ op: 'pad-duck', on: !!e.target.checked }));
  $('#pr-reorder')?.addEventListener('click', () => {
    reorderOn = !reorderOn;
    paintClocksAndBar();
  });
  $('#pr-grouped')?.addEventListener('click', () => {
    grouped = !grouped;
    renderGrid();
  });
  $('#pr-search')?.addEventListener('input', (e) => {
    search = e.target.value || '';
    $('#pr-search-clr').hidden = !search;
    renderGrid();
  });
  $('#pr-search-clr')?.addEventListener('click', () => {
    search = '';
    const inp = $('#pr-search');
    if (inp) inp.value = '';
    $('#pr-search-clr').hidden = true;
    renderGrid();
  });
}

bindEvents();
setInterval(() => {
  if ((pad?.playingCount > 0 || pad?.ambient?.playing) && hostOnline) paintClocksAndBar();
}, 50);

sig.on('welcome', (m) => {
  hostOnline = !!m.hostId;
  updateConnUi();
});
sig.on('host-online', () => {
  hostOnline = true;
  updateConnUi();
});
sig.on('host-offline', () => {
  hostOnline = false;
  pad = null;
  updateConnUi();
  renderGrid();
});
sig.on('error', (m) => showErr(m.message));
sig.on('remote-state', (m) => {
  const st = m?.state;
  if (!st) return;
  hostOnline = true;
  studioName = st.name || studioName;
  pad = st.pad || null;
  syncedAt = performance.now();
  updateConnUi();
  renderCategories();
  renderGrid();
});

if (!room) showErr('Link do estúdio não informado na URL.');
else sig.connect({ type: 'join', room, role: 'remote', name: 'Pad Celular', key });
