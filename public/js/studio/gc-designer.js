// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Template Studio do GC: biblioteca de templates, modo Operador e designer em modal.
// O render no PGM é feito por overlays.js (style:'custom'), o mesmo da prévia.
import { drawBanner } from './overlays.js';

const uid = () => 'gc-' + Math.random().toString(36).slice(2, 9);

const LAYER_DEFAULTS = {
  rect: { type: 'rect', x: 80, y: 820, w: 900, h: 120, fill: 'brand', radius: 10 },
  text: { type: 'text', key: 'name', x: 110, y: 835, w: 840, h: 54, size: 46, weight: 800, color: '#ffffff', align: 'left' },
  tag: { type: 'tag', key: 'tag', x: 80, y: 760, w: 190, h: 42, size: 20, bg: '#ef4444', color: '#ffffff' },
  image: { type: 'image', src: 'brand', x: 1600, y: 820, w: 240, h: 120 },
};

const BUILTINS = [
  {
    id: 'gc-lower-third',
    name: 'Lower third',
    builtin: true,
    category: 'Entrevista',
    fav: true,
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 80, y: 818, w: 980, h: 132 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 112, y: 836, w: 920, h: 58 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 112, y: 898, w: 920, h: 38, size: 26, weight: 600 },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 80, y: 762 },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1600, y: 818, w: 240, h: 132 },
    ],
  },
  {
    id: 'gc-hard',
    name: 'Hard news',
    builtin: true,
    category: 'Jornalismo',
    fav: true,
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 0, y: 842, w: 1920, h: 160, fill: '#111827', radius: 0 },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 64, y: 790, w: 220, h: 48, size: 24 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'headline', x: 80, y: 866, w: 1500, h: 64, size: 48, weight: 900 },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1660, y: 858, w: 200, h: 110 },
    ],
  },
  {
    id: 'gc-strap',
    name: 'Nome / strap',
    builtin: true,
    category: 'Crédito',
    fav: false,
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 80, y: 892, w: 120, h: 8, radius: 4 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 80, y: 800, w: 900, h: 66, size: 54, weight: 900 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 80, y: 910, w: 900, h: 38, size: 26, weight: 600, color: '#cbd5e1' },
    ],
  },
];

const clone = (v) => JSON.parse(JSON.stringify(v));
const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hexToRgb = (c) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [124, 92, 255];
};

// Regras simples do template: esconder/mostrar/reduzir fonte conforme o valor de um campo.
export function resolveGcLayers(tpl, data) {
  const layers = clone(tpl.layers || []);
  const val = (k) => String(data?.[k] ?? '');
  for (const r of tpl.rules || []) {
    const raw = val(r.field);
    const n = Number(r.value) || 0;
    const hit = r.op === 'empty' ? !raw.trim()
      : r.op === 'notempty' ? !!raw.trim()
      : r.op === 'length>' ? raw.length > n
      : r.op === 'equals' ? raw === String(r.value ?? '')
      : false;
    if (!hit) continue;
    const l = layers.find((x) => x.id === r.layer);
    if (!l) continue;
    if (r.action === 'hide') l.hidden = true;
    else if (r.action === 'show') l.hidden = false;
    else if (r.action === 'size') l.size = Math.max(12, Math.min(160, n || l.size));
    else if (r.action === 'color') l.color = r.value || l.color;
  }
  // atalho por camada: “ocultar se o campo estiver vazio”
  for (const l of layers) if (l.hideEmpty && l.key && !val(l.key).trim()) l.hidden = true;
  return layers;
}

export function ensureGcTemplates(S) {
  if (!Array.isArray(S.gcTemplates)) S.gcTemplates = [];
  if (!S.gcTemplates.length) S.gcTemplates = clone(BUILTINS);
  // garante que os modelos do sistema existam, sem apagar os do usuário
  for (const b of BUILTINS) if (!S.gcTemplates.some((t) => t.id === b.id)) S.gcTemplates.push(clone(b));
  for (const t of S.gcTemplates) if (!t.category) t.category = 'Personalizado';
}

export function createGcDesigner({ S, comp, modal, esc, icons, toast, saveStudio, brandColor, render, onAir, getGuest, getHeadline }) {
  ensureGcTemplates(S);
  let selId = S.gcTemplates.some((t) => t.id === S.brand.lastGcTemplate) ? S.brand.lastGcTemplate : S.gcTemplates[0].id;
  let search = '';
  let cat = 'todos';
  let favOnly = false;
  let active = false;
  let timer = null;
  const data = { name: 'Maria Silva', role: 'Repórter — Brasília', tag: 'AO VIVO', headline: '', dur: 0 };
  const imgs = new Map();

  const image = (u) => {
    if (!u) return null;
    let im = imgs.get(u);
    if (!im) {
      im = new Image();
      im.onload = () => renderPreview();
      im.src = u;
      imgs.set(u, im);
    }
    return im.complete && im.naturalWidth ? im : null;
  };
  const sel = () => S.gcTemplates.find((t) => t.id === selId) || S.gcTemplates[0];
  const payload = (tpl = sel()) => {
    const d = { ...data, headline: data.headline || data.name, logo: S.brand.logo || null };
    const isHeadline = (tpl.layers || []).some((l) => l.key === 'headline');
    const title = (isHeadline ? d.headline || d.name : d.name) || tpl.name;
    return { style: 'custom', title, layers: resolveGcLayers(tpl, d), data: d, dur: Number(d.dur) || 0 };
  };

  function draw(canvas, tpl, selectedIndex = -1) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2b3350');
    g.addColorStop(1, '#10131f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.38, H * 0.2, 0, 7);
    ctx.fill();
    ctx.fillRect(W * 0.34, H * 0.56, W * 0.32, H * 0.5);
    const p = payload(tpl);
    drawBanner({ ctx, W, H, image, banner: { ...p, t0: performance.now() - 2000 } }, hexToRgb(brandColor()), performance.now(), 0, 0);
    // área de segurança (5%)
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
    ctx.setLineDash([]);
    const l = tpl.layers[selectedIndex];
    if (l) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect((l.x / 1920) * W, (l.y / 1080) * H, (l.w / 1920) * W, (l.h / 1080) * H);
    }
  }

  function drawThumb(canvas, tpl) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#11101d';
    ctx.fillRect(0, 0, W, H);
    const p = payload(tpl);
    drawBanner({ ctx, W, H, image, banner: { ...p, t0: performance.now() - 2000 } }, hexToRgb(brandColor()), performance.now(), 0, 0);
  }

  function syncFields() {
    for (const [id, key] of [['gc-name', 'name'], ['gc-role', 'role'], ['gc-tag', 'tag'], ['gc-headline', 'headline']]) {
      const el = document.getElementById(id);
      if (el && document.activeElement !== el && el.value !== String(data[key] ?? '')) el.value = String(data[key] ?? '');
    }
    const dur = document.getElementById('gc-dur');
    if (dur && document.activeElement !== dur && Number(dur.value) !== Number(data.dur || 0)) dur.value = String(Number(data.dur) || 0);
  }

  function renderPreview() {
    syncFields();
    const cv = document.getElementById('gc-prev');
    if (cv) draw(cv, sel());
    const state = document.getElementById('gc-op-state');
    if (state) {
      state.textContent = active ? 'NO AR' : '';
      state.className = 'gc-op-state' + (active ? ' on' : '');
    }
    const air = document.getElementById('gc-air');
    if (air) air.textContent = active ? 'Atualizar no ar' : 'Colocar no ar';
    const off = document.getElementById('gc-off');
    if (off) off.disabled = !active;
    const tpl = sel();
    const hasHeadline = tpl.layers.some((l) => l.key === 'headline');
    const hasName = tpl.layers.some((l) => l.key === 'name');
    const nameEmpty = !String(data.name || '').trim();
    const headEmpty = !String(data.headline || '').trim();
    const missing = (hasName && nameEmpty) || (hasHeadline && headEmpty) || (!hasName && !hasHeadline && nameEmpty && headEmpty);
    const warn = document.getElementById('gc-warn');
    if (warn) {
      warn.hidden = !missing;
      warn.textContent = hasHeadline && headEmpty ? 'Preencha a manchete antes de ir ao ar.' : 'Preencha o nome antes de ir ao ar.';
    }
    if (air) air.disabled = missing && !active;
  }

  function apply(tpl = sel()) {
    const p = payload(tpl);
    if (active && comp.banner) {
      // atualiza sem reiniciar a animação de entrada
      comp.banner = { ...comp.banner, ...p, t0: comp.banner.t0, hiding: false };
    } else {
      comp.showBanner(p);
      active = true;
    }
    S.activeBanner = 'gc:air';
    S.activeBannerTitle = p.title;
    clearTimeout(timer);
    if (p.dur > 0) timer = setTimeout(stop, p.dur * 1000);
    renderPreview();
    onAir?.();
  }

  function stop() {
    clearTimeout(timer);
    comp.hideBanner();
    if (S.activeBanner === 'gc:air') {
      S.activeBanner = null;
      S.activeBannerTitle = null;
    }
    active = false;
    renderPreview();
    onAir?.();
  }

  function operatorHtml() {
    const tpl = sel();
    const hasHeadline = tpl.layers.some((l) => l.key === 'headline');
    const hasName = tpl.layers.some((l) => l.key === 'name');
    const hasRole = tpl.layers.some((l) => l.key === 'role');
    const hasTag = tpl.layers.some((l) => l.key === 'tag');
    return `
      <div class="gc-op">
        <div class="gc-op-head"><h4>GC / Template Studio <span class="hint" id="gc-op-state"></span></h4><button class="btn ghost sm" id="gc-new-tpl">${icons.plus} Novo template</button></div>
        <div class="gc-lib-tools">
          <input class="input" id="gc-search" placeholder="Buscar template…" value="${escAttr(search)}" autocomplete="off">
          <select class="input" id="gc-cat"><option value="todos">Todas as categorias</option>${[...new Set(S.gcTemplates.map((t) => t.category || 'Personalizado'))].map((c) => `<option value="${escAttr(c)}" ${cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <button class="btn ghost sm ${favOnly ? 'primary' : ''}" id="gc-fav" title="Só favoritos">★</button>
        </div>
        <div class="gc-tpl-row">${S.gcTemplates.map((t) => `<div class="gc-tpl ${t.id === selId ? 'sel' : ''}" data-gct="${escAttr(t.id)}" data-cat="${escAttr(t.category || 'Personalizado')}" data-name="${escAttr(String(t.name).toLowerCase())}" tabindex="0" role="button"><canvas class="gc-thumb" data-thumb="${escAttr(t.id)}" width="160" height="90"></canvas><span class="gc-tpl-meta"><b>${esc(t.name)}</b><small>${esc(t.category || 'Personalizado')}${t.autoGuest ? ' · auto convidado' : ''}${t.autoRss ? ' · auto RSS' : ''}</small></span><button class="gc-star ${t.fav ? 'on' : ''}" data-favbtn="${escAttr(t.id)}" title="Favorito">★</button></div>`).join('')}</div>
        <div class="gc-auto-row"><button class="btn ghost sm" id="gc-fill-guest">Do convidado</button><button class="btn ghost sm" id="gc-fill-rss">Do RSS</button>${tpl.autoGuest ? '<span class="hint">auto: convidado</span>' : ''}${tpl.autoRss ? '<span class="hint">auto: RSS</span>' : ''}</div>
        ${schedHtml()}
        <p class="hint" id="gc-empty" hidden>Nenhum template com esse filtro.</p>
        <div class="gc-op-grid">
          <canvas id="gc-prev" width="640" height="360"></canvas>
          <div class="gc-op-fields">
            <label class="field" id="gc-name-wrap" ${hasName ? '' : 'hidden'}><span>Nome</span><input class="input" id="gc-name" maxlength="60" value="${escAttr(data.name)}"></label>
            <label class="field" id="gc-role-wrap" ${hasRole ? '' : 'hidden'}><span>Cargo / função</span><input class="input" id="gc-role" maxlength="80" value="${escAttr(data.role)}"></label>
            <label class="field" id="gc-headline-wrap" ${hasHeadline ? '' : 'hidden'}><span>Manchete</span><input class="input" id="gc-headline" maxlength="120" value="${escAttr(data.headline)}"></label>
            <div class="row" style="gap:8px">
              <label class="field grow" id="gc-tag-wrap" ${hasTag ? '' : 'hidden'}><span>Etiqueta</span><input class="input" id="gc-tag" maxlength="20" value="${escAttr(data.tag)}"></label>
              <label class="field"><span>Duração</span><select class="input" id="gc-dur">${[0, 5, 8, 10, 15, 30].map((n) => `<option value="${n}" ${Number(data.dur) === n ? 'selected' : ''}>${n ? n + ' s' : 'Manual'}</option>`).join('')}</select></label>
            </div>
            <div class="gc-warn" id="gc-warn" hidden>Preencha o nome (ou a manchete) antes de ir ao ar.</div>
            <div class="row" style="gap:6px;margin-top:6px">
              <button class="btn primary grow" id="gc-air">Colocar no ar</button>
              <button class="btn danger" id="gc-off" disabled>Tirar</button>
            </div>
            <button class="btn ghost sm" id="gc-edit" style="margin-top:6px">✎ Editar design</button>
          </div>
        </div>
      </div>`;
  }

  function bind(p) {
    const q = (s) => p.querySelector(s);
    q('#gc-new-tpl')?.addEventListener('click', () => openDesigner(null));
    q('#gc-edit')?.addEventListener('click', () => openDesigner(selId));
    q('#gc-fill-guest')?.addEventListener('click', () => fillGuest());
    q('#gc-fill-rss')?.addEventListener('click', () => fillHeadline());
    q('#gc-air')?.addEventListener('click', () => apply());
    q('#gc-off')?.addEventListener('click', stop);
    const cards = [...p.querySelectorAll('[data-gct]')];
    const filter = () => {
      const term = search.trim().toLowerCase();
      let visible = 0;
      for (const c of cards) {
        const t = S.gcTemplates.find((x) => x.id === c.dataset.gct);
        const okSearch = !term || (c.dataset.name || '').includes(term);
        const okCat = cat === 'todos' || (t?.category || 'Personalizado') === cat;
        const okFav = !favOnly || !!t?.fav;
        c.hidden = !(okSearch && okCat && okFav);
        if (!c.hidden) visible++;
      }
      const empty = q('#gc-empty');
      if (empty) empty.hidden = visible > 0;
    };
    const selectCard = (b) => {
      selId = b.dataset.gct;
      S.brand.lastGcTemplate = selId;
      saveStudio();
      for (const x of cards) x.classList.toggle('sel', x === b);
      const has = (k) => sel().layers.some((l) => l.key === k);
      for (const [k, wrap] of [['name', '#gc-name-wrap'], ['role', '#gc-role-wrap'], ['headline', '#gc-headline-wrap'], ['tag', '#gc-tag-wrap']]) {
        const el = q(wrap);
        if (el) el.hidden = !has(k);
      }
      renderPreview();
    };
    for (const b of cards) {
      b.addEventListener('click', (e) => {
        if (e.target.closest('[data-favbtn]')) return;
        selectCard(b);
      });
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCard(b); } });
      const star = b.querySelector('[data-favbtn]');
      if (star) star.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = S.gcTemplates.find((x) => x.id === star.dataset.favbtn);
        if (!t) return;
        t.fav = !t.fav;
        saveStudio();
        render();
      });
      const cv = b.querySelector('[data-thumb]');
      const t = S.gcTemplates.find((x) => x.id === b.dataset.gct);
      if (cv && t) drawThumb(cv, t);
    }
    q('#gc-search')?.addEventListener('input', (e) => { search = e.target.value; filter(); });
    q('#gc-cat')?.addEventListener('change', (e) => { cat = e.target.value; filter(); });
    q('#gc-fav')?.addEventListener('click', () => { favOnly = !favOnly; render(); });
    for (const [id, key] of [['#gc-name', 'name'], ['#gc-role', 'role'], ['#gc-tag', 'tag'], ['#gc-headline', 'headline']]) {
      const el = q(id);
      if (el) el.addEventListener('input', () => { data[key] = el.value; renderPreview(); });
    }
    q('#gc-dur')?.addEventListener('change', (e) => { data.dur = Number(e.target.value) || 0; });
    bindSchedule(p);
    filter();
    renderPreview();
  }

  // ------------------------------------------------------------------ designer
  function openDesigner(tplId) {
    const base = tplId ? clone(sel()) : { id: uid(), name: 'Meu template', builtin: false, category: 'Personalizado', fav: false, layers: [] };
    // modelo do sistema nunca é sobrescrito: editar vira uma cópia “meu template”
    if (base.builtin) {
      base.id = uid();
      base.name = `${base.name} (meu)`;
      base.builtin = false;
    }
    if (!Array.isArray(base.rules)) base.rules = [];
    if (!base.layers.length) {
      base.layers = [
        { ...LAYER_DEFAULTS.rect, id: uid() },
        { ...LAYER_DEFAULTS.text, id: uid(), key: 'name' },
        { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', y: 898, h: 38, size: 26, weight: 600 },
      ];
    }
    let selected = 0;
    modal(
      `<div class="gc-dz">
        <h3>Template Studio <span class="hint">— arraste os elementos no canvas</span></h3>
        <div class="gc-dz-grid">
          <aside class="gc-dz-left">
            <details class="gc-dz-acc" open>
              <summary>Adicionar elemento</summary>
              <div class="gc-palette">
                <button class="btn sm" data-add="rect">▭ Barra</button>
                <button class="btn sm" data-add="text">T Nome</button>
                <button class="btn sm" data-add="text">T Texto</button>
                <button class="btn sm" data-add="tag">● Etiqueta</button>
                <button class="btn sm" data-add="image">▣ Logo</button>
              </div>
            </details>
            <details class="gc-dz-acc" open>
              <summary>Camadas</summary>
              <div id="gz-layers"></div>
            </details>
            <details class="gc-dz-acc" open>
              <summary>Regras</summary>
              <div id="gz-rules"></div>
              <button class="btn ghost sm" id="gz-add-rule" style="margin-top:4px">+ Regra</button>
            </details>
          </aside>
          <div class="gc-dz-canvas"><canvas id="gz-canvas" width="960" height="540"></canvas></div>
          <aside class="gc-dz-insp" id="gz-insp"></aside>
        </div>
        <div class="gc-dz-foot">
          <div class="gc-dz-row">
            <label class="field grow"><span>Nome do template</span><input class="input" id="gz-name" maxlength="40" value="${escAttr(base.name)}"></label>
            <label class="field"><span>Categoria</span><select class="input" id="gz-cat">${['Personalizado', 'Jornalismo', 'Entrevista', 'Esporte', 'Crédito', 'Rodapé'].map((c) => `<option value="${c}" ${(base.category || 'Personalizado') === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
            <label class="check" style="align-self:center"><input type="checkbox" id="gz-fav" ${base.fav ? 'checked' : ''}> Favorito</label>
          </div>
          <div class="gc-dz-row gc-dz-actions">
            <div class="gc-dz-opts">
              <label class="check" title="Preencher o nome quando um convidado entrar"><input type="checkbox" id="gz-autoguest" ${base.autoGuest ? 'checked' : ''}> Auto convidado</label>
              <label class="check" title="Preencher a manchete com o RSS mais recente"><input type="checkbox" id="gz-autorss" ${base.autoRss ? 'checked' : ''}> Auto RSS</label>
              <label class="check" title="Entrar no ar quando um convidado entrar"><input type="checkbox" id="gz-takeguest" ${base.takeGuest ? 'checked' : ''}> TAKE convidado</label>
              <label class="check" title="Entrar no ar quando o RSS atualizar"><input type="checkbox" id="gz-takerss" ${base.takeRss ? 'checked' : ''}> TAKE RSS</label>
            </div>
            <div class="gc-dz-btns">
              <button class="btn ghost" id="gz-undo" title="Desfazer (Ctrl+Z)" disabled>↶</button>
              <button class="btn ghost" id="gz-redo" title="Refazer (Ctrl+Y)" disabled>↷</button>
              <button class="btn ghost" id="gz-dup" title="Duplicar este template">Duplicar</button>
              <button class="btn ghost" id="gz-del-tpl" title="Excluir este template" ${base.builtin ? 'disabled' : ''}>Excluir</button>
              <button class="btn" id="gz-cancel">Cancelar</button>
              <button class="btn primary" id="gz-save">${icons.plus} Salvar</button>
            </div>
          </div>
        </div>
      </div>`,
      {
        onMount: (m, close) => {
          const cv = m.querySelector('#gz-canvas');
          // histórico do design (30 passos)
          let history = [];
          let hi = -1;
          const updateUndo = () => {
            const u = m.querySelector('#gz-undo');
            const r = m.querySelector('#gz-redo');
            if (u) u.disabled = hi <= 0;
            if (r) r.disabled = hi >= history.length - 1;
          };
          let histTimer = null;
          let dirty = false;
          const snapNow = () => {
            history = history.slice(0, hi + 1);
            history.push(clone(base.layers));
            if (history.length > 30) history.shift();
            hi = history.length - 1;
            updateUndo();
          };
          // Agrupa mudanças rápidas (arrastar/teclar) num único passo: só grava depois de 450 ms de pausa.
          const snap = () => {
            dirty = true;
            clearTimeout(histTimer);
            histTimer = setTimeout(() => { dirty = false; snapNow(); }, 450);
          };
          const flushSnap = () => {
            clearTimeout(histTimer);
            if (dirty) { dirty = false; snapNow(); }
          };
          const cancelSnap = () => { clearTimeout(histTimer); dirty = false; };
          const undo = () => {
            if (hi <= 0) return;
            cancelSnap();
            hi--;
            base.layers = clone(history[hi]);
            selected = Math.max(0, Math.min(selected, base.layers.length - 1));
            drawIt();
          };
          const redo = () => {
            if (hi >= history.length - 1) return;
            cancelSnap();
            hi++;
            base.layers = clone(history[hi]);
            selected = Math.max(0, Math.min(selected, base.layers.length - 1));
            drawIt();
          };
          const drawIt = () => {
            const ctx = cv.getContext('2d');
            const g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
            g.addColorStop(0, '#2b3350');
            g.addColorStop(1, '#10131f');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, cv.width, cv.height);
            const p = payload(base);
            drawBanner({ ctx, W: cv.width, H: cv.height, image, banner: { ...p, t0: performance.now() - 2000 } }, hexToRgb(brandColor()), performance.now(), 0, 0);
            ctx.strokeStyle = 'rgba(255,255,255,.22)';
            ctx.setLineDash([6, 6]);
            ctx.strokeRect(cv.width * 0.05, cv.height * 0.05, cv.width * 0.9, cv.height * 0.9);
            ctx.setLineDash([]);
            const l = base.layers[selected];
            if (l) {
              ctx.strokeStyle = '#f59e0b';
              ctx.lineWidth = 2;
              const rx = (l.x / 1920) * cv.width;
              const ry = (l.y / 1080) * cv.height;
              const rw = (l.w / 1920) * cv.width;
              const rh = (l.h / 1080) * cv.height;
              ctx.strokeRect(rx, ry, rw, rh);
              // alças de redimensionamento (cantos e meios)
              ctx.fillStyle = '#f59e0b';
              ctx.strokeStyle = '#11101d';
              ctx.lineWidth = 1;
              for (const [hx, hy] of [
                [rx, ry], [rx + rw / 2, ry], [rx + rw, ry],
                [rx + rw, ry + rh / 2], [rx + rw, ry + rh],
                [rx + rw / 2, ry + rh], [rx, ry + rh], [rx, ry + rh / 2],
              ]) {
                ctx.fillRect(hx - 4, hy - 4, 8, 8);
                ctx.strokeRect(hx - 4, hy - 4, 8, 8);
              }
            }
            m.querySelector('#gz-layers').innerHTML = base.layers
              .map((l, i) => `<div class="gz-layer-row ${i === selected ? 'sel' : ''}">
                <button class="gz-layer-name" data-layer="${i}">${l.type === 'text' ? 'T' : l.type === 'tag' ? '●' : l.type === 'image' ? '▣' : '▭'} ${esc(l.key || l.text || l.type)}</button>
                <button class="gz-mini" data-vis="${i}" title="${l.hidden ? 'Mostrar' : 'Ocultar'}">${l.hidden ? '◌' : '◉'}</button>
                <button class="gz-mini" data-lock="${i}" title="${l.lock ? 'Destravar' : 'Travar'}">${l.lock ? '🔒' : '🔓'}</button>
                <button class="gz-mini" data-up="${i}" title="Subir camada" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button class="gz-mini" data-down="${i}" title="Descer camada" ${i === base.layers.length - 1 ? 'disabled' : ''}>↓</button>
              </div>`)
              .join('');
            m.querySelectorAll('[data-layer]').forEach((b) => (b.onclick = () => { selected = +b.dataset.layer; drawIt(); inspector(); }));
            m.querySelectorAll('[data-vis]').forEach((b) => (b.onclick = () => {
              const l = base.layers[+b.dataset.vis];
              if (!l) return;
              l.hidden = !l.hidden;
              snapNow();
              drawIt();
            }));
            m.querySelectorAll('[data-lock]').forEach((b) => (b.onclick = () => {
              const l = base.layers[+b.dataset.lock];
              if (!l) return;
              l.lock = !l.lock;
              snapNow();
              drawIt();
            }));
            for (const dir of ['up', 'down']) m.querySelectorAll(`[data-${dir}]`).forEach((b) => (b.onclick = () => {
              const i = +b.dataset[dir];
              const j = i + (dir === 'up' ? -1 : 1);
              if (j < 0 || j >= base.layers.length) return;
              [base.layers[i], base.layers[j]] = [base.layers[j], base.layers[i]];
              selected = j;
              snapNow();
              drawIt();
            }));
            inspector();
            renderRules();
          };
          const inspector = () => {
            const l = base.layers[selected];
            const box = m.querySelector('#gz-insp');
            if (!l) { box.innerHTML = '<p class="hint">Adicione um elemento.</p>'; return; }
            const num = (k, label, min = -5000, max = 5000) => `<label class="field"><span>${label}</span><input class="input" type="number" id="gz-${k}" value="${Math.round(l[k] || 0)}" min="${min}" max="${max}"></label>`;
            box.innerHTML = `
              <h4>${l.type === 'text' ? 'Texto' : l.type === 'tag' ? 'Etiqueta' : l.type === 'image' ? 'Imagem' : 'Forma'}</h4>
              ${l.type === 'text' || l.type === 'tag' ? `<label class="field"><span>Campo</span><select class="input" id="gz-key">${['name', 'role', 'tag', 'headline'].map((k) => `<option value="${k}" ${l.key === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>` : ''}
              ${l.type === 'text' || l.type === 'tag' ? `<label class="field"><span>Tamanho</span><input class="input" type="number" id="gz-size" value="${l.size || 32}" min="10" max="160"></label>` : ''}
              <div class="row" style="gap:6px">${num('x', 'X')}${num('y', 'Y')}</div>
              <div class="row" style="gap:6px">${num('w', 'Largura', 10, 1920)}${num('h', 'Altura', 10, 1080)}</div>
              <div class="gz-align" title="Alinhar na área de segurança">
                <button data-align="left" title="Esquerda">⇤</button>
                <button data-align="center" title="Centro horizontal">↔</button>
                <button data-align="right" title="Direita">⇥</button>
                <button data-align="top" title="Topo">⇧</button>
                <button data-align="middle" title="Centro vertical">↕</button>
                <button data-align="bottom" title="Base">⇩</button>
              </div>
              ${l.type === 'rect' ? `<label class="field"><span>Cor</span><input type="color" id="gz-color" value="${l.fill === 'brand' ? brandColor() : l.fill || '#7c5cff'}"></label>` : ''}
              ${l.type === 'text' ? `<label class="field"><span>Cor</span><input type="color" id="gz-color" value="${l.color || '#ffffff'}"></label>` : ''}
              ${l.type === 'tag' ? `<label class="field"><span>Cor de fundo</span><input type="color" id="gz-color" value="${l.bg || '#ef4444'}"></label>` : ''}
              ${l.type === 'text' || l.type === 'tag' ? `<label class="check" style="margin:2px 0 6px"><input type="checkbox" id="gz-hideempty" ${l.hideEmpty ? 'checked' : ''}> Ocultar se o campo estiver vazio</label>` : ''}
              <div class="row" style="gap:6px;margin-top:8px"><button class="btn ghost sm grow" id="gz-dup-layer">Duplicar camada</button><button class="btn danger sm" id="gz-del">Excluir camada</button></div>`;
            box.querySelectorAll('input,select').forEach((el) => {
              el.oninput = () => {
                const k = el.id.slice(3);
                if (k === 'color') {
                  if (l.type === 'rect') l.fill = el.value;
                  else if (l.type === 'tag') l.bg = el.value;
                  else l.color = el.value;
                } else if (k === 'key') l.key = el.value;
                else if (k === 'hideempty') l.hideEmpty = el.checked;
                else l[k] = Number(el.value);
                drawIt();
                snap();
              };
            });
            box.querySelectorAll('[data-align]').forEach((b) => (b.onclick = () => {
              const k = b.dataset.align;
              const m = 96; // 5% de 1920
              if (k === 'left') l.x = m;
              else if (k === 'center') l.x = Math.round((1920 - l.w) / 2);
              else if (k === 'right') l.x = 1920 - m - l.w;
              else if (k === 'top') l.y = 54; // 5% de 1080
              else if (k === 'middle') l.y = Math.round((1080 - l.h) / 2);
              else if (k === 'bottom') l.y = 1080 - 54 - l.h;
              snapNow();
              drawIt();
            }));
            box.querySelector('#gz-dup-layer').onclick = () => {
              flushSnap();
              const copy = clone(l);
              copy.id = uid();
              copy.x += 20;
              copy.y += 20;
              base.layers.splice(selected + 1, 0, copy);
              selected++;
              snapNow();
              drawIt();
            };
            box.querySelector('#gz-del').onclick = () => {
              flushSnap();
              base.layers.splice(selected, 1);
              selected = Math.max(0, selected - 1);
              snapNow();
              drawIt();
            };
          };
          const renderRules = () => {
            const box = m.querySelector('#gz-rules');
            if (!box) return;
            if (!base.rules.length) { box.innerHTML = '<p class="hint">Nenhuma regra. Ex.: ocultar a etiqueta quando o campo estiver vazio.</p>'; return; }
            box.innerHTML = base.rules.map((r) => {
              const targets = base.layers.filter((l) => ['text', 'tag'].includes(l.type));
              return `<div class="gz-rule" data-rule="${r.id}">
                <div class="row" style="gap:4px"><select class="input" data-rk="field">${['name', 'role', 'tag', 'headline'].map((k) => `<option value="${k}" ${r.field === k ? 'selected' : ''}>${k}</option>`).join('')}</select>
                <select class="input" data-rk="op"><option value="empty" ${r.op === 'empty' ? 'selected' : ''}>vazio</option><option value="notempty" ${r.op === 'notempty' ? 'selected' : ''}>preenchido</option><option value="length>" ${r.op === 'length>' ? 'selected' : ''}>maior que</option></select></div>
                <div class="row" style="gap:4px">${r.op === 'length>' ? `<input class="input" type="number" data-rk="value" value="${r.value || 32}" min="1" max="200" style="width:70px">` : ''}<select class="input" data-rk="action"><option value="hide" ${r.action === 'hide' ? 'selected' : ''}>ocultar</option><option value="show" ${r.action === 'show' ? 'selected' : ''}>mostrar</option><option value="size" ${r.action === 'size' ? 'selected' : ''}>fonte</option></select></div>
                <div class="row" style="gap:4px"><select class="input" data-rk="layer">${targets.map((l) => `<option value="${l.id}" ${r.layer === l.id ? 'selected' : ''}>${l.key || l.type}</option>`).join('')}</select><button class="btn ghost sm" data-rdel title="Excluir regra">✕</button></div>
                ${r.action === 'size' ? `<input class="input" type="number" data-rk="value" value="${r.value || 32}" min="12" max="160" placeholder="tamanho">` : ''}
              </div>`;
            }).join('');
            for (const row of box.querySelectorAll('[data-rule]')) {
              const r = base.rules.find((x) => x.id === row.dataset.rule);
              if (!r) continue;
              for (const el of row.querySelectorAll('[data-rk]')) {
                el.onchange = () => {
                  const k = el.dataset.rk;
                  r[k] = k === 'value' ? Number(el.value) : el.value;
                  if (k === 'action' && el.value === 'size' && !r.value) r.value = 32;
                  snap();
                  drawIt();
                };
              }
              row.querySelector('[data-rdel]').onclick = () => {
                flushSnap();
                base.rules = base.rules.filter((x) => x.id !== r.id);
                snapNow();
                drawIt();
              };
            }
          };
          m.querySelector('#gz-add-rule').onclick = () => {
            const target = base.layers.find((l) => ['text', 'tag'].includes(l.type));
            if (!target) return;
            flushSnap();
            base.rules.push({ id: uid(), field: target.key || 'name', op: 'empty', action: 'hide', layer: target.id });
            snapNow();
            drawIt();
          };
          m.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
            const type = b.dataset.add;
            const l = clone(LAYER_DEFAULTS[type]);
            l.id = uid();
            if (type === 'text') l.key = base.layers.some((x) => x.key === 'name') ? 'role' : 'name';
            if (type === 'text' && base.layers.some((x) => x.key === 'role')) l.key = 'headline';
            flushSnap();
            l.y = Math.min(980, 760 + base.layers.length * 50);
            base.layers.push(l);
            selected = base.layers.length - 1;
            snapNow();
            drawIt();
          }));
          // arrastar no canvas
          let drag = null;
          cv.addEventListener('pointerdown', (e) => {
            flushSnap();
            const r = cv.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * 1920;
            const y = ((e.clientY - r.top) / r.height) * 1080;
            const tol = 18;
            const pts = (l) => ({
              nw: [l.x, l.y], n: [l.x + l.w / 2, l.y], ne: [l.x + l.w, l.y],
              e: [l.x + l.w, l.y + l.h / 2], se: [l.x + l.w, l.y + l.h],
              s: [l.x + l.w / 2, l.y + l.h], sw: [l.x, l.y + l.h], w: [l.x, l.y + l.h / 2],
            });
            const cur = base.layers[selected];
            if (cur && !cur.lock) {
              const hit = Object.entries(pts(cur)).find(([, [hx, hy]]) => Math.abs(x - hx) <= tol && Math.abs(y - hy) <= tol);
              if (hit) {
                drag = { mode: 'resize', i: selected, dir: hit[0], x0: x, y0: y, box: { x: cur.x, y: cur.y, w: cur.w, h: cur.h } };
                cv.setPointerCapture?.(e.pointerId);
                return;
              }
            }
            for (let i = base.layers.length - 1; i >= 0; i--) {
              const l = base.layers[i];
              if (!l.lock && x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) {
                selected = i;
                drag = { mode: 'move', i, dx: x - l.x, dy: y - l.y };
                cv.setPointerCapture?.(e.pointerId);
                drawIt();
                break;
              }
            }
          });
          cv.addEventListener('pointermove', (e) => {
            const r = cv.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * 1920;
            const y = ((e.clientY - r.top) / r.height) * 1080;
            if (!drag) {
              // cursor de redimensionamento nas alças
              const l = base.layers[selected];
              if (!l) { cv.style.cursor = 'default'; return; }
              const pts = { nw: [l.x, l.y], n: [l.x + l.w / 2, l.y], ne: [l.x + l.w, l.y], e: [l.x + l.w, l.y + l.h / 2], se: [l.x + l.w, l.y + l.h], s: [l.x + l.w / 2, l.y + l.h], sw: [l.x, l.y + l.h], w: [l.x, l.y + l.h / 2] };
              const hit = Object.entries(pts).find(([, [hx, hy]]) => Math.abs(x - hx) <= 18 && Math.abs(y - hy) <= 18);
              cv.style.cursor = hit ? (hit[0].includes('n') || hit[0].includes('s') ? 'ns-resize' : 'ew-resize') : 'move';
              if (hit && hit[0].length === 2) cv.style.cursor = 'nwse-resize';
              return;
            }
            const snap10 = (v) => (e.shiftKey ? Math.round(v) : Math.round(v / 10) * 10);
            if (drag.mode === 'move') {
              const l = base.layers[drag.i];
              l.x = snap10(x - drag.dx);
              l.y = snap10(y - drag.dy);
            } else {
              const l = base.layers[drag.i];
              const b = drag.box;
              const dx = x - drag.x0;
              const dy = y - drag.y0;
              let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
              if (drag.dir.includes('e')) nw = Math.max(20, b.w + dx);
              if (drag.dir.includes('s')) nh = Math.max(20, b.h + dy);
              if (drag.dir.includes('w')) {
                const cand = Math.max(20, b.w - dx);
                nx = b.x + (b.w - cand);
                nw = cand;
              }
              if (drag.dir.includes('n')) {
                const cand = Math.max(20, b.h - dy);
                ny = b.y + (b.h - cand);
                nh = cand;
              }
              l.x = snap10(nx); l.y = snap10(ny);
              l.w = Math.max(20, snap10(nw)); l.h = Math.max(20, snap10(nh));
            }
            drawIt();
          });
          cv.addEventListener('pointerup', () => { if (drag) snapNow(); drag = null; cv.style.cursor = 'default'; });
          m.querySelector('#gz-cancel').onclick = () => close(null);
          m.querySelector('#gz-dup').onclick = () => {
            const copy = clone(base);
            copy.id = uid();
            copy.name = `${m.querySelector('#gz-name').value.trim() || base.name} (cópia)`;
            copy.builtin = false;
            S.gcTemplates.push(copy);
            saveStudio();
            close(copy.id);
            selId = copy.id;
            render();
            toast(`Template “${copy.name}” criado`, 'ok');
          };
          m.querySelector('#gz-del-tpl').onclick = () => {
            S.gcTemplates = S.gcTemplates.filter((t) => t.id !== base.id || t.builtin);
            if (!S.gcTemplates.some((t) => t.id === selId)) selId = S.gcTemplates[0]?.id;
            saveStudio();
            close(null);
            render();
            toast('Template excluído', 'ok');
          };
          m.querySelector('#gz-save').onclick = () => {
            base.name = m.querySelector('#gz-name').value.trim() || 'Meu template';
            base.category = m.querySelector('#gz-cat').value || 'Personalizado';
            base.fav = !!m.querySelector('#gz-fav').checked;
            base.autoGuest = !!m.querySelector('#gz-autoguest').checked;
            base.autoRss = !!m.querySelector('#gz-autorss').checked;
            base.takeGuest = !!m.querySelector('#gz-takeguest').checked;
            base.takeRss = !!m.querySelector('#gz-takerss').checked;
            const existing = S.gcTemplates.find((t) => t.id === base.id);
            if (existing) Object.assign(existing, base);
            else S.gcTemplates.push(base);
            saveStudio();
            close(base.id);
            selId = base.id;
            render();
            toast(`Template “${base.name}” salvo`, 'ok');
          };
          drawIt();
          snapNow();
          m.querySelector('#gz-undo').onclick = undo;
          m.querySelector('#gz-redo').onclick = redo;
          m.addEventListener('keydown', (e) => {
            const tag = (e.target?.tagName || '').toUpperCase();
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
              const l = base.layers[selected];
              if (!l) return;
              e.preventDefault();
              flushSnap();
              const copy = clone(l);
              copy.id = uid();
              copy.x += 20;
              copy.y += 20;
              base.layers.splice(selected + 1, 0, copy);
              selected++;
              snapNow();
              drawIt();
            } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              const l = base.layers[selected];
              if (!l || l.lock) return;
              e.preventDefault();
              const step = e.shiftKey ? 10 : 1;
              if (e.key === 'ArrowLeft') l.x -= step;
              if (e.key === 'ArrowRight') l.x += step;
              if (e.key === 'ArrowUp') l.y -= step;
              if (e.key === 'ArrowDown') l.y += step;
              drawIt();
              snap();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
              if (base.layers[selected]) {
                e.preventDefault();
                base.layers.splice(selected, 1);
                selected = Math.max(0, selected - 1);
                snapNow();
                drawIt();
              }
            }
          });
        },
      },
    );
  }

  function fillGuest(silent = false) {
    const g = getGuest?.();
    if (!g?.name) { if (!silent) toast('Nenhum convidado no backstage.', 'err'); return false; }
    data.name = g.name;
    data.role = g.state?.role || g.state?.title || data.role || '';
    renderPreview();
    return true;
  }
  function fillHeadline(silent = false) {
    const t = getHeadline?.();
    if (!t) { if (!silent) toast('Nenhuma manchete de RSS disponível.', 'err'); return false; }
    data.headline = t;
    if (!data.name) data.name = t;
    renderPreview();
    return true;
  }
  function onGuestJoin(g) {
    if (sel()?.autoGuest) fillGuest(true);
    if (sel()?.takeGuest && !active && g?.name) apply();
  }
  function onHeadline(t) {
    if (sel()?.autoRss && t && t !== data.headline) { data.headline = t; renderPreview(); }
    if (sel()?.takeRss && !active && t) apply();
  }

  // ------------------------------------------------------------- agendamento
  const fired = new Map();
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const schedule = () => (S.brand.gcSchedule ||= []);
  function checkSchedule() {
    const now = new Date();
    const hh = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const s of schedule()) {
      if (s.at !== hh || fired.get(s.id) === todayKey()) continue;
      fired.set(s.id, todayKey());
      const tpl = S.gcTemplates.find((t) => t.id === s.templateId);
      if (!tpl) continue;
      selId = tpl.id;
      if (s.autoGuest) fillGuest(true);
      data.dur = Number(s.dur) || 0;
      apply(tpl);
      toast(`GC agendado: “${tpl.name}” entrou no ar`, 'ok');
    }
  }
  setInterval(checkSchedule, 15000);
  checkSchedule();

  function schedHtml() {
    const list = schedule();
    return `<details class="gc-sched"><summary>Agendar GC…</summary>
      <div class="row" style="gap:5px;align-items:end;margin-top:6px">
        <label class="field" style="margin:0"><span>Agendar</span><input class="input" type="time" id="gc-sched-time"></label>
        <label class="field grow" style="margin:0"><span>Template</span><select class="input" id="gc-sched-tpl">${S.gcTemplates.map((t) => `<option value="${escAttr(t.id)}" ${t.id === selId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="field" style="margin:0"><span>Duração</span><input class="input" type="number" id="gc-sched-dur" value="10" min="0" max="120" style="width:62px"></label>
        <button class="btn ghost sm" id="gc-sched-add">+</button>
      </div>
      <div id="gc-sched-list">${list.length ? list.map((s) => `<div class="gc-sched-item"><b>${s.at}</b> ${esc(S.gcTemplates.find((t) => t.id === s.templateId)?.name || '?')} · ${s.dur || 0}s <button class="btn ghost sm" data-schedel="${escAttr(s.id)}" title="Cancelar">✕</button></div>`).join('') : '<span class="hint">Nenhum GC agendado.</span>'}</div>
    </details>`;
  }
  function bindSchedule(p) {
    p.querySelector('#gc-sched-add')?.addEventListener('click', () => {
      const at = p.querySelector('#gc-sched-time').value;
      const templateId = p.querySelector('#gc-sched-tpl').value;
      const dur = Number(p.querySelector('#gc-sched-dur').value) || 0;
      if (!at || !templateId) return toast('Escolha hora e template.', 'err');
      schedule().push({ id: uid(), at, templateId, dur });
      saveStudio();
      render();
    });
    for (const b of p.querySelectorAll('[data-schedel]')) b.addEventListener('click', () => {
      S.brand.gcSchedule = schedule().filter((s) => s.id !== b.dataset.schedel);
      saveStudio();
      render();
    });
  }

  return { operatorHtml, bind, openDesigner, renderPreview, stop, onGuestJoin, onHeadline };
}
