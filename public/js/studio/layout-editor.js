// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Editor de layouts personalizados: o usuário desenha "espaços" (slots) num canvas 16:9.
// O espaço nº 1 recebe o 1º item do palco, o nº 2 o 2º, e assim por diante.
import { modal, esc, toast, confirmDialog } from '../ui.js';

export const MAX_SLOTS = 8;
const MIN = 0.04;
const GAP = 0.02; // espaço entre cópias / distribuição
const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const PRESETS = [
  { name: '2 colunas', slots: [{ x: 0.03, y: 0.12, w: 0.455, h: 0.76 }, { x: 0.515, y: 0.12, w: 0.455, h: 0.76 }] },
  { name: 'Destaque + 3', slots: [{ x: 0.03, y: 0.04, w: 0.94, h: 0.66 }, { x: 0.03, y: 0.74, w: 0.3, h: 0.22 }, { x: 0.35, y: 0.74, w: 0.3, h: 0.22 }, { x: 0.67, y: 0.74, w: 0.3, h: 0.22 }] },
  { name: 'Tela + câmera', slots: [{ x: 0, y: 0, w: 1, h: 1 }, { x: 0.72, y: 0.68, w: 0.25, h: 0.28 }] },
  { name: 'Notícias', slots: [{ x: 0.03, y: 0.05, w: 0.64, h: 0.7 }, { x: 0.7, y: 0.05, w: 0.27, h: 0.34 }, { x: 0.7, y: 0.41, w: 0.27, h: 0.34 }] },
  { name: 'Quadrantes', slots: [{ x: 0.03, y: 0.04, w: 0.46, h: 0.44 }, { x: 0.51, y: 0.04, w: 0.46, h: 0.44 }, { x: 0.03, y: 0.52, w: 0.46, h: 0.44 }, { x: 0.51, y: 0.52, w: 0.46, h: 0.44 }] },
];

// miniatura SVG (viewBox 48x28) usada nos botões de layout
export const slotsIcon = (slots = []) =>
  slots.map((s) => `<rect x="${(2 + s.x * 44).toFixed(1)}" y="${(2 + s.y * 24).toFixed(1)}" width="${Math.max(2, s.w * 44).toFixed(1)}" height="${Math.max(2, s.h * 24).toFixed(1)}" rx="1.5"/>`).join('');

export const newLayoutId = () => 'c-' + Math.random().toString(36).slice(2, 8);

// mantém o espaço dentro da tela
function fit(s) {
  s.w = r3(clamp(s.w, MIN, 1));
  s.h = r3(clamp(s.h, MIN, 1));
  s.x = r3(clamp(s.x, 0, 1 - s.w));
  s.y = r3(clamp(s.y, 0, 1 - s.h));
  return s;
}

// procura um lugar livre do mesmo tamanho: à direita, abaixo, à esquerda, acima; senão desloca um pouco
export function placeCopy(src, slots) {
  const overlaps = (a) => slots.some((b) => a.x < b.x + b.w - 0.001 && a.x + a.w > b.x + 0.001 && a.y < b.y + b.h - 0.001 && a.y + a.h > b.y + 0.001);
  const tries = [
    { x: src.x + src.w + GAP, y: src.y },
    { x: src.x, y: src.y + src.h + GAP },
    { x: src.x - src.w - GAP, y: src.y },
    { x: src.x, y: src.y - src.h - GAP },
  ];
  for (const t of tries) {
    const c = { x: t.x, y: t.y, w: src.w, h: src.h };
    if (c.x >= -0.0005 && c.y >= -0.0005 && c.x + c.w <= 1.0005 && c.y + c.h <= 1.0005 && !overlaps(c)) return fit(c);
  }
  // primeiro lugar que cabe na tela, mesmo sobrepondo
  for (const t of tries) {
    const c = { x: t.x, y: t.y, w: src.w, h: src.h };
    if (c.x >= -0.0005 && c.y >= -0.0005 && c.x + c.w <= 1.0005 && c.y + c.h <= 1.0005) return fit(c);
  }
  return fit({ x: src.x + 0.03, y: src.y + 0.03, w: src.w, h: src.h });
}

// Abre o editor. Retorna { action: 'save', layout } | { action: 'delete' } | null
export function openLayoutEditor(layout) {
  const edit = !!layout;
  const state = {
    id: layout?.id || newLayoutId(),
    label: layout?.label || '',
    slots: (layout?.slots || PRESETS[0].slots).map((s) => ({ ...s })),
    sel: 0,
    snap: true,
  };
  const hist = [];
  const pct = (v) => r3(v * 100);
  return modal(
    `
    <h3>${edit ? 'Editar layout' : 'Novo layout personalizado'}</h3>
    <p class="sub">Arraste os espaços e puxe o canto para redimensionar. O espaço <b>1</b> recebe o 1º item do palco, o <b>2</b> o 2º, e assim por diante.</p>
    <div class="le-tools" role="toolbar" aria-label="Ferramentas do layout">
      <div class="le-grp">
        <button class="btn sm" id="le-add" title="Novo espaço">＋ Espaço</button>
        <button class="btn sm primary" id="le-dup" title="Copiar o espaço selecionado com o mesmo tamanho (Ctrl+D)">⧉ Duplicar</button>
        <button class="btn sm danger" id="le-rem" title="Remover o espaço selecionado (Delete)">Remover espaço</button>
      </div>
      <div class="le-grp">
        <button class="btn sm" id="le-same" title="Deixa todos os espaços do mesmo tamanho do selecionado">⇔ Igualar tamanho</button>
        <button class="btn sm" id="le-169" title="Ajusta a altura para o espaço ficar 16:9 (sem bordas pretas)">16:9</button>
        <button class="btn sm icon" id="le-ch" title="Centralizar na horizontal">⇹</button>
        <button class="btn sm icon" id="le-cv" title="Centralizar na vertical">⇳</button>
        <button class="btn sm" id="le-dh" title="Distribuir todos lado a lado com espaçamento igual">⫴ Distribuir</button>
        <button class="btn sm" id="le-dv" title="Empilhar todos com espaçamento igual">☰ Empilhar</button>
      </div>
      <div class="le-grp">
        <button class="btn sm icon" id="le-down" title="Diminuir o número do espaço (ordem no palco)">◀</button>
        <button class="btn sm icon" id="le-up" title="Aumentar o número do espaço (ordem no palco)">▶</button>
        <button class="btn sm icon" id="le-undo" title="Desfazer (Ctrl+Z)">↶</button>
      </div>
    </div>
    <div class="le-canvas" id="le-canvas" tabindex="0" aria-label="Área do layout: setas movem, Alt+setas redimensionam, Shift = passo maior"></div>
    <div class="le-fine" id="le-fine">
      <strong class="le-fine-ttl" id="le-fine-ttl">Espaço 1</strong>
      <label><span>X</span><input type="number" class="input" id="le-x" step="0.5" min="0" max="100"></label>
      <label><span>Y</span><input type="number" class="input" id="le-y" step="0.5" min="0" max="100"></label>
      <label><span>Largura</span><input type="number" class="input" id="le-w" step="0.5" min="${MIN * 100}" max="100"></label>
      <label><span>Altura</span><input type="number" class="input" id="le-h" step="0.5" min="${MIN * 100}" max="100"></label>
      <span class="hint le-unit">% da tela</span>
      <label class="check le-snap"><input type="checkbox" id="le-snap" checked> Ímã 1%</label>
    </div>
    <p class="hint le-keys">Setas movem · Alt+setas redimensionam · Shift = passo de 5% · Ctrl+D duplica · Delete remove · Alt ao arrastar = sem ímã</p>
    <div class="le-presets"><span class="hint">Modelos:</span>
      ${PRESETS.map((p, i) => `<button class="btn sm ghost" data-preset="${i}">${esc(p.name)}</button>`).join('')}
    </div>
    <label class="field"><span>Nome do layout</span><input class="input" id="le-name" maxlength="24" placeholder="Ex.: Entrevista" value="${esc(state.label)}"></label>
    <div class="modal-actions">
      ${edit ? '<button class="btn danger" id="le-del" style="margin-right:auto">Excluir</button>' : ''}
      <button class="btn" data-close>Cancelar</button>
      <button class="btn primary" id="le-save" data-save>Salvar e usar</button>
    </div>`,
    {
      onMount(m, close) {
        const cv = m.querySelector('#le-canvas');
        const $ = (s) => m.querySelector(s);
        const cur = () => state.slots[state.sel];
        const push = () => {
          hist.push(JSON.stringify({ slots: state.slots, sel: state.sel }));
          if (hist.length > 60) hist.shift();
        };
        const styleOf = (s) => `left:${s.x * 100}%;top:${s.y * 100}%;width:${s.w * 100}%;height:${s.h * 100}%`;
        const dims = (s) => `${Math.round(s.w * 1000) / 10}×${Math.round(s.h * 1000) / 10}`;
        const syncFine = () => {
          const s = cur();
          if (!s) return;
          $('#le-fine-ttl').textContent = `Espaço ${state.sel + 1}`;
          for (const k of ['x', 'y', 'w', 'h']) {
            const i = $('#le-' + k);
            if (document.activeElement !== i) i.value = pct(s[k]);
          }
          $('#le-down').disabled = state.sel === 0;
          $('#le-up').disabled = state.sel >= state.slots.length - 1;
          $('#le-dup').disabled = state.slots.length >= MAX_SLOTS;
          $('#le-undo').disabled = !hist.length;
        };
        const updateEl = (i) => {
          const el = cv.children[i];
          if (!el) return;
          el.style.cssText = styleOf(state.slots[i]);
          el.querySelector('em').textContent = dims(state.slots[i]);
        };
        const draw = () => {
          cv.innerHTML = '';
          state.slots.forEach((s, i) => {
            const el = document.createElement('div');
            el.className = 'le-slot' + (i === state.sel ? ' sel' : '');
            el.style.cssText = styleOf(s);
            el.innerHTML = `<span>${i + 1}</span><em>${dims(s)}</em><i class="le-handle"></i>`;
            el.onpointerdown = (e) => {
              e.preventDefault();
              cv.focus({ preventScroll: true });
              state.sel = i;
              const resize = e.target.classList.contains('le-handle');
              const box = cv.getBoundingClientRect();
              const start = { px: e.clientX, py: e.clientY, ...s };
              let moved = false;
              try {
                el.setPointerCapture(e.pointerId);
              } catch {}
              cv.querySelectorAll('.le-slot').forEach((n, k) => n.classList.toggle('sel', k === i));
              syncFine();
              el.onpointermove = (ev) => {
                if (!moved) push();
                moved = true;
                const q = state.snap !== ev.altKey ? 100 : 1000; // ímã 1% ou 0,1%
                const rnd = (v) => Math.round(v * q) / q;
                const dx = (ev.clientX - start.px) / box.width;
                const dy = (ev.clientY - start.py) / box.height;
                if (resize) {
                  s.w = r3(Math.min(1 - s.x, Math.max(MIN, rnd(start.w + dx))));
                  s.h = r3(Math.min(1 - s.y, Math.max(MIN, ev.shiftKey ? s.w : rnd(start.h + dy))));
                } else {
                  s.x = r3(Math.min(1 - s.w, Math.max(0, rnd(start.x + dx))));
                  s.y = r3(Math.min(1 - s.h, Math.max(0, rnd(start.y + dy))));
                }
                updateEl(i);
                syncFine();
              };
              el.onpointerup = el.onpointercancel = () => {
                el.onpointermove = null;
              };
            };
            cv.append(el);
          });
          syncFine();
        };
        const act = (fn) => () => {
          push();
          fn();
          draw();
        };
        draw();

        // ---- ajuste fino numérico
        for (const k of ['x', 'y', 'w', 'h']) {
          const inp = $('#le-' + k);
          inp.onfocus = () => push();
          inp.oninput = () => {
            const v = parseFloat(inp.value);
            if (!Number.isFinite(v)) return;
            const s = cur();
            s[k] = v / 100;
            fit(s);
            updateEl(state.sel);
          };
          inp.onchange = () => syncFine();
        }
        $('#le-snap').onchange = (e) => (state.snap = e.target.checked);

        // ---- ações
        $('#le-add').onclick = () => {
          if (state.slots.length >= MAX_SLOTS) return toast(`No máximo ${MAX_SLOTS} espaços`, 'err');
          push();
          state.slots.push({ x: 0.3, y: 0.3, w: 0.3, h: 0.3 });
          state.sel = state.slots.length - 1;
          draw();
        };
        const dup = () => {
          if (state.slots.length >= MAX_SLOTS) return toast(`No máximo ${MAX_SLOTS} espaços`, 'err');
          push();
          state.slots.push(placeCopy(cur(), state.slots));
          state.sel = state.slots.length - 1;
          draw();
        };
        $('#le-dup').onclick = dup;
        const rem = () => {
          if (state.slots.length <= 1) return toast('O layout precisa de ao menos 1 espaço', 'err');
          push();
          state.slots.splice(state.sel, 1);
          state.sel = Math.max(0, state.sel - 1);
          draw();
        };
        $('#le-rem').onclick = rem;
        $('#le-same').onclick = act(() => {
          const { w, h } = cur();
          state.slots.forEach((s) => fit(Object.assign(s, { w, h })));
          toast(`Todos com ${dims(cur())}%`);
        });
        $('#le-169').onclick = act(() => {
          const s = cur(); // na tela 16:9, um espaço 16:9 tem w e h iguais em fração
          const side = Math.min(s.w, 1 - s.y);
          s.h = side;
          s.w = side;
          fit(s);
        });
        $('#le-ch').onclick = act(() => fit(Object.assign(cur(), { x: (1 - cur().w) / 2 })));
        $('#le-cv').onclick = act(() => fit(Object.assign(cur(), { y: (1 - cur().h) / 2 })));
        // distribuir: mantém a ordem visual, mesmo espaçamento entre eles e nas bordas
        const distribute = (axis) => {
          const [p, d] = axis === 'x' ? ['x', 'w'] : ['y', 'h'];
          const list = [...state.slots].sort((a, b) => a[p] - b[p]);
          const total = list.reduce((t, s) => t + s[d], 0);
          if (total > 1) {
            const k = (1 - GAP * (list.length + 1)) / total; // encolhe para caber
            list.forEach((s) => (s[d] = s[d] * k));
          }
          const used = list.reduce((t, s) => t + s[d], 0);
          const gap = (1 - used) / (list.length + 1);
          let pos = gap;
          for (const s of list) {
            s[p] = pos;
            pos += s[d] + gap;
            fit(s);
          }
        };
        $('#le-dh').onclick = act(() => distribute('x'));
        $('#le-dv').onclick = act(() => distribute('y'));
        const reorder = (dir) => {
          const j = state.sel + dir;
          if (j < 0 || j >= state.slots.length) return;
          push();
          [state.slots[state.sel], state.slots[j]] = [state.slots[j], state.slots[state.sel]];
          state.sel = j;
          draw();
        };
        $('#le-down').onclick = () => reorder(-1);
        $('#le-up').onclick = () => reorder(1);
        const undo = () => {
          const h = hist.pop();
          if (!h) return;
          const o = JSON.parse(h);
          state.slots = o.slots;
          state.sel = Math.min(o.sel, o.slots.length - 1);
          draw();
        };
        $('#le-undo').onclick = undo;

        // ---- teclado (fora dos campos de texto)
        m.addEventListener('keydown', (e) => {
          if (e.target.matches('input, textarea, select')) return;
          const k = e.key;
          if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'd') return e.preventDefault(), dup();
          if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') return e.preventDefault(), undo();
          if ((k === 'Delete' || k === 'Backspace') && e.target === cv) return e.preventDefault(), rem();
          const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          if (!dirs[k] || e.target.closest('button')) return;
          e.preventDefault();
          const st = e.shiftKey ? 0.05 : 0.005;
          const [dx, dy] = dirs[k];
          const s = cur();
          if (!e.repeat) push();
          if (e.altKey) {
            s.w += dx * st;
            s.h += dy * st;
          } else {
            s.x += dx * st;
            s.y += dy * st;
          }
          fit(s);
          updateEl(state.sel);
          syncFine();
        });

        m.querySelectorAll('[data-preset]').forEach((b) => {
          b.onclick = () => {
            push();
            state.slots = PRESETS[+b.dataset.preset].slots.map((s) => ({ ...s }));
            state.sel = 0;
            draw();
          };
        });
        m.querySelector('#le-del')?.addEventListener('click', async () => (await confirmDialog('Excluir este layout?', { ok: 'Excluir', danger: true })) && close({ action: 'delete' }));
        m.querySelector('#le-save').onclick = () => {
          const label = m.querySelector('#le-name').value.trim() || 'Personalizado';
          close({ action: 'save', layout: { id: state.id, label, slots: state.slots.map((s) => ({ x: r3(s.x), y: r3(s.y), w: r3(s.w), h: r3(s.h) })) } });
        };
      },
    },
  );
}
