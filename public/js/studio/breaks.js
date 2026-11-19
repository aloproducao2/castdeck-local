// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Motor e UI de Break Comercial: playlist fechada de comerciais/vinhetas com retorno automático ao vivo.

export function createBreaks({
  S, $, $$, esc, toast, setBrand, mediaList, playMedia,
  setStage, setSolo, setLayout, renderTiles, renderLayouts, switcher, toggleMic, toggleSafe,
  fmtClock, onStateChange,
}) {
  let active = null; // { breakId, index, items, snapshot }
  let selectedId = null;

  function list() {
    return Array.isArray(S.brand?.breaks) ? S.brand.breaks : [];
  }

  function saveList(next) {
    setBrand({ breaks: next });
    onStateChange?.();
  }

  function validItems(brk) {
    return (brk?.items || []).filter((id) => S.sources.has(id));
  }

  function get(id) {
    return list().find((b) => b.id === id) || null;
  }

  function currentSelected() {
    const all = list();
    if (!all.length) return null;
    if (selectedId && all.some((b) => b.id === selectedId)) return get(selectedId);
    selectedId = all[0].id;
    return all[0];
  }

  function select(id) {
    selectedId = id || null;
    onStateChange?.();
  }

  function create(name = '') {
    const all = list();
    const n = all.length + 1;
    const id = 'brk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5);
    const brk = {
      id,
      name: (name || '').trim() || `Break ${n}`,
      items: [],
      muteMics: true,
      onEnd: 'restore',
    };
    saveList([...all, brk]);
    selectedId = id;
    return brk;
  }

  function update(id, patch) {
    const all = list().map((b) => (b.id === id ? { ...b, ...patch } : b));
    saveList(all);
  }

  function rename(id, name) {
    const clean = (name || '').trim();
    if (!clean) return;
    update(id, { name: clean });
  }

  function remove(id) {
    if (active?.breakId === id) stop({ restore: true });
    const all = list().filter((b) => b.id !== id);
    if (selectedId === id) selectedId = all[0]?.id || null;
    saveList(all);
  }

  function addItem(breakId, sourceId) {
    const brk = get(breakId);
    if (!brk || !S.sources.has(sourceId)) return;
    update(breakId, { items: [...(brk.items || []), sourceId] });
  }

  function removeItem(breakId, idx) {
    const brk = get(breakId);
    if (!brk) return;
    const items = [...(brk.items || [])];
    items.splice(idx, 1);
    update(breakId, { items });
  }

  function moveItem(breakId, idx, dir) {
    const brk = get(breakId);
    if (!brk) return;
    const items = [...(brk.items || [])];
    const to = idx + dir;
    if (to < 0 || to >= items.length) return;
    [items[idx], items[to]] = [items[to], items[idx]];
    update(breakId, { items });
  }

  function totalDuration(id) {
    const brk = get(id);
    if (!brk) return 0;
    return validItems(brk).reduce((acc, sid) => {
      const d = S.sources.get(sid)?.el?.duration;
      return acc + (Number.isFinite(d) && d > 0 ? d : 0);
    }, 0);
  }

  function remainingSeconds() {
    if (!active) return 0;
    let rem = 0;
    for (let i = active.index; i < active.items.length; i++) {
      const el = S.sources.get(active.items[i])?.el;
      if (!el) continue;
      const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      rem += i === active.index ? Math.max(0, d - (el.currentTime || 0)) : d;
    }
    return rem;
  }

  function showItemOnAir(sid) {
    const s = S.sources.get(sid);
    if (!s?.el) return false;
    try { s.el.currentTime = 0; } catch {}
    if (S.switcher) {
      switcher.cutTo(sid);
    } else {
      if (!S.stage.includes(sid)) setStage([...S.stage, sid]);
      setSolo(sid);
    }
    playMedia(sid);
    return true;
  }

  function prepNext(idx) {
    if (!active) return;
    const nextSid = active.items[idx + 1];
    const nextEl = nextSid ? S.sources.get(nextSid)?.el : null;
    if (nextEl) {
      try {
        if (nextEl.paused) nextEl.currentTime = 0;
      } catch {}
    }
  }

  function start(id) {
    const brk = id ? get(id) : currentSelected();
    if (!brk) {
      toast('Crie um Break Comercial primeiro.', 'warn');
      return false;
    }
    const items = validItems(brk);
    if (!items.length) {
      toast(`Adicione vídeos ao "${brk.name}" antes de soltar o break.`, 'warn');
      return false;
    }
    if (active) stop({ restore: false });
    selectedId = brk.id;

    const mutedHostMic = brk.muteMics !== false && !!S.local.micOn;
    const snapshot = {
      stage: [...S.stage],
      layout: S.layout,
      solo: S.solo,
      take: S.take,
      mutedHostMic,
    };

    if (mutedHostMic) toggleMic?.();

    active = { breakId: brk.id, index: 0, items, snapshot };
    showItemOnAir(items[0]);
    prepNext(0);
    toast(`Break "${brk.name}" no ar (${items.length} ${items.length === 1 ? 'item' : 'itens'})`, 'ok');
    onStateChange?.();
    return true;
  }

  function stop({ restore = true, safe = false } = {}) {
    if (!active) return;
    const prev = active;
    active = null;
    const curSid = prev.items[prev.index];
    const curEl = curSid ? S.sources.get(curSid)?.el : null;
    try { if (curEl && !curEl.paused) curEl.pause(); } catch {}

    const snap = prev.snapshot;
    if (snap?.mutedHostMic && !S.local.micOn) toggleMic?.();

    if (restore && snap) {
      setStage(snap.stage.filter((sid) => S.sources.has(sid)));
      setLayout?.(snap.layout);
      setSolo(snap.solo && S.sources.has(snap.solo) ? snap.solo : null);
      if (S.switcher) {
        if (snap.take && S.sources.has(snap.take)) switcher.cutTo(snap.take);
        else switcher.cutTo(null);
      } else {
        renderLayouts();
        renderTiles();
      }
      toast('Break encerrado — retorno ao programa ao vivo.', 'ok');
    } else if (safe) {
      toggleSafe?.(true);
      toast('Break encerrado — Cartela Segura no ar.', 'info');
    } else {
      toast('Break encerrado.', 'info');
    }
    onStateChange?.();
  }

  function onMediaEnded(sid) {
    if (!active) return false;
    if (active.items[active.index] !== sid) return false;
    const brk = get(active.breakId);
    const nextIdx = active.index + 1;
    if (nextIdx < active.items.length) {
      active.index = nextIdx;
      showItemOnAir(active.items[nextIdx]);
      prepNext(nextIdx);
      onStateChange?.();
      return true;
    }
    const onEnd = brk?.onEnd || 'restore';
    if (onEnd === 'loop') {
      active.index = 0;
      showItemOnAir(active.items[0]);
      prepNext(0);
      onStateChange?.();
      return true;
    }
    if (onEnd === 'safe') stop({ restore: false, safe: true });
    else if (onEnd === 'pause') stop({ restore: false });
    else stop({ restore: true });
    return true;
  }

  function getState() {
    if (!active) return { active: false, list: list(), selected: currentSelected() };
    const brk = get(active.breakId);
    const curSid = active.items[active.index];
    const curSrc = S.sources.get(curSid);
    return {
      active: true,
      breakId: active.breakId,
      name: brk?.name || 'Break',
      index: active.index,
      total: active.items.length,
      currentId: curSid,
      currentLabel: curSrc?.label || curSid,
      remaining: remainingSeconds(),
      list: list(),
      selected: brk || currentSelected(),
    };
  }

  function renderPlayoutSection(box) {
    if (!box) return;
    const all = list();
    const cur = currentSelected();
    const media = mediaList();
    const st = getState();
    const items = cur ? validItems(cur) : [];
    const dur = cur ? fmtClock(totalDuration(cur.id)) : '0:00';

    box.innerHTML = `
      <div class="pl-brk-head">
        <b>Blocos Comerciais</b>
        <div class="pl-brk-head-acts">
          ${cur ? `<button class="btn sm icon" id="brk-ren" title="Renomear bloco">✎</button>` : ''}
          ${cur ? `<button class="btn sm icon" id="brk-del" title="Apagar este bloco">🗑</button>` : ''}
          <button class="btn sm primary" id="brk-new" title="Criar novo bloco comercial">＋ Novo</button>
        </div>
      </div>
      ${!all.length ? `
        <div class="pl-brk-empty-box">
          <p class="hint">Monte blocos de comerciais (ex.: <b>Break 1</b>) para disparar com 1 clique e voltar automático para a câmera ao terminar.</p>
          <button class="btn sm primary" id="brk-new-empty">＋ Criar Break 1</button>
        </div>
      ` : `
        <div class="pl-brk-bar">
          <select class="input sm" id="brk-sel" aria-label="Selecionar bloco comercial">
            ${all.map((b) => `<option value="${esc(b.id)}" ${b.id === cur?.id ? 'selected' : ''}>${esc(b.name)} (${validItems(b).length} · ${fmtClock(totalDuration(b.id))})</option>`).join('')}
          </select>
          <span class="pl-brk-summary">${items.length} ${items.length === 1 ? 'item' : 'itens'} · <b>${dur}</b></span>
        </div>
        ${cur ? `
          <div class="pl-brk-opts">
            <label class="check"><input type="checkbox" id="brk-mute" ${cur.muteMics !== false ? 'checked' : ''}><span>Silenciar meu mic no break</span></label>
            <select class="input sm" id="brk-end" title="Quando acabar o último comercial">
              <option value="restore" ${cur.onEnd === 'restore' ? 'selected' : ''}>Ao fim: voltar para onde eu estava</option>
              <option value="safe" ${cur.onEnd === 'safe' ? 'selected' : ''}>Ao fim: ir para Cartela Segura</option>
              <option value="loop" ${cur.onEnd === 'loop' ? 'selected' : ''}>Ao fim: repetir comerciais</option>
              <option value="pause" ${cur.onEnd === 'pause' ? 'selected' : ''}>Ao fim: pausar</option>
            </select>
          </div>
          <div class="pl-brk-items">
            ${items.length ? items.map((sid, i) => {
              const s = S.sources.get(sid);
              const isPlaying = st.active && st.breakId === cur.id && st.index === i;
              return `<div class="pl-brk-item ${isPlaying ? 'on' : ''}">
                <span class="pl-brk-num">${i + 1}</span>
                <span class="pl-brk-name">${esc(s?.label || sid)}</span>
                <small>${fmtClock(s?.el?.duration)}</small>
                <button class="btn sm icon" data-brk-up="${i}" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
                <button class="btn sm icon" data-brk-dn="${i}" ${i === items.length - 1 ? 'disabled' : ''} title="Descer">↓</button>
                <button class="btn sm icon" data-brk-rm="${i}" title="Remover do bloco">✕</button>
              </div>`;
            }).join('') : `<p class="hint">Bloco vazio. Clique em <b>＋</b> abaixo para incluir vídeos:</p>`}
          </div>
          ${media.length ? `
            <div class="pl-brk-lib">
              <div class="pl-brk-lib-head"><span>Disponíveis na Biblioteca</span><small>1 clique para incluir</small></div>
              <div class="pl-brk-lib-list">
                ${media.map((m) => `<div class="pl-brk-lib-row">
                  <span class="pl-brk-name">${esc(m.label)}</span>
                  <small>${fmtClock(m.el?.duration)}</small>
                  <button class="btn sm" data-brk-add="${esc(m.id)}" title="Incluir em ${esc(cur.name)}">＋</button>
                </div>`).join('')}
              </div>
            </div>
          ` : '<p class="hint">Adicione vídeos na aba Mídia para montar o Break.</p>'}
        ` : ''}
      `}`;

    $('#brk-new', box)?.addEventListener('click', () => {
      create();
      renderPlayoutSection(box);
    });
    $('#brk-new-empty', box)?.addEventListener('click', () => {
      create('Break 1');
      renderPlayoutSection(box);
    });
    $('#brk-ren', box)?.addEventListener('click', () => {
      if (!cur) return;
      const next = window.prompt('Nome do bloco comercial:', cur.name);
      if (next && next.trim()) {
        rename(cur.id, next);
        renderPlayoutSection(box);
      }
    });
    $('#brk-sel', box)?.addEventListener('change', (e) => {
      select(e.target.value);
      renderPlayoutSection(box);
    });
    $('#brk-del', box)?.addEventListener('click', () => {
      if (!cur) return;
      remove(cur.id);
      renderPlayoutSection(box);
    });
    $('#brk-mute', box)?.addEventListener('change', (e) => cur && update(cur.id, { muteMics: e.target.checked }));
    $('#brk-end', box)?.addEventListener('change', (e) => cur && update(cur.id, { onEnd: e.target.value }));
    $$('[data-brk-add]', box).forEach((b) => {
      b.onclick = () => {
        if (!cur) return;
        addItem(cur.id, b.dataset.brkAdd);
        renderPlayoutSection(box);
      };
    });
    $$('[data-brk-up]', box).forEach((b) => { b.onclick = () => cur && (moveItem(cur.id, +b.dataset.brkUp, -1), renderPlayoutSection(box)); });
    $$('[data-brk-dn]', box).forEach((b) => { b.onclick = () => cur && (moveItem(cur.id, +b.dataset.brkDn, 1), renderPlayoutSection(box)); });
    $$('[data-brk-rm]', box).forEach((b) => { b.onclick = () => cur && (removeItem(cur.id, +b.dataset.brkRm), renderPlayoutSection(box)); });
  }

  return {
    list,
    get,
    select,
    currentSelected,
    create,
    rename,
    update,
    remove,
    addItem,
    removeItem,
    moveItem,
    totalDuration,
    remainingSeconds,
    start,
    stop,
    onMediaEnded,
    isActive: () => !!active,
    getState,
    renderPlayoutSection,
  };
}
