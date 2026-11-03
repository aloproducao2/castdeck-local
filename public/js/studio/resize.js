// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// DivisÃ³rias arrastÃ¡veis do estÃºdio: largura do painel lateral, largura do painel vertical e
// altura do preview (vs. bastidores). Tamanhos ficam salvos no navegador; duplo clique restaura o padrÃ£o.
const KEY = 'castdeck.layout';
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function initResizers(studio) {
  const saved = load();
  const apply = () => {
    for (const [k, prop] of [['side', '--side-w'], ['vdock', '--vdock-w'], ['stage', '--stage-h']]) {
      const v = saved[k];
      studio.style.setProperty(prop, v ? `${v}px` : '');
    }
    studio.classList.toggle('has-stage-h', !!saved.stage);
    window.dispatchEvent(new Event('resize'));
  };
  const save = () => localStorage.setItem(KEY, JSON.stringify(saved));

  // cada divisÃ³ria: elemento, eixo e como calcular o tamanho a partir da posiÃ§Ã£o do ponteiro
  const defs = [
    {
      key: 'side',
      el: studio.querySelector('#rz-side'),
      calc: (e) => clamp(innerWidth - e.clientX, 280, Math.min(760, innerWidth * 0.55)),
    },
    {
      key: 'vdock',
      el: studio.querySelector('#rz-v'),
      calc: (e) => {
        const r = studio.querySelector('#vdock').getBoundingClientRect();
        return clamp(r.right - e.clientX, 200, Math.min(640, innerWidth * 0.45));
      },
    },
    {
      key: 'stage',
      el: studio.querySelector('#rz-stage'),
      calc: (e) => {
        const rowEl = studio.querySelector('#stage-row');
        const row = rowEl.getBoundingClientRect();
        const wrap = studio.querySelector('.stage-wrap').getBoundingClientRect();
        const min = rowEl.classList.contains('has-v') ? 230 : 120;
        return clamp(e.clientY - row.top, min, Math.max(min + 20, wrap.bottom - row.top - 120));
      },
    },
  ];

  for (const d of defs) {
    if (!d.el) continue;
    d.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      d.el.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing', d.key === 'stage' ? 'rz-row' : 'rz-col');
      d.el.classList.add('drag');
      const move = (ev) => {
        saved[d.key] = Math.round(d.calc(ev));
        apply();
      };
      const up = () => {
        d.el.removeEventListener('pointermove', move);
        d.el.removeEventListener('pointerup', up);
        d.el.removeEventListener('pointercancel', up);
        document.body.classList.remove('resizing', 'rz-row', 'rz-col');
        d.el.classList.remove('drag');
        save();
      };
      d.el.addEventListener('pointermove', move);
      d.el.addEventListener('pointerup', up);
      d.el.addEventListener('pointercancel', up);
    });
    d.el.addEventListener('dblclick', () => {
      delete saved[d.key];
      save();
      apply();
    });
    // teclado: setas ajustam de 20 em 20 px
    d.el.tabIndex = 0;
    d.el.addEventListener('keydown', (e) => {
      const dir = { ArrowLeft: 1, ArrowRight: -1, ArrowUp: -1, ArrowDown: 1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const cur =
        saved[d.key] ||
        (d.key === 'side'
          ? studio.querySelector('.side').offsetWidth
          : d.key === 'vdock'
            ? studio.querySelector('#vdock').offsetWidth
            : studio.querySelector('#stage-row').offsetHeight);
      saved[d.key] = Math.max(160, cur + dir * 20);
      save();
      apply();
    });
  }
  apply();
  // no desktop tudo cabe sem rolagem: se algo (foco, arrastar) rolar a área do palco, volta ao topo
  const wrap = studio.querySelector('.stage-wrap');
  wrap?.addEventListener('scroll', () => {
    if (innerWidth > 900 && wrap.scrollTop) wrap.scrollTop = 0;
  });
  return {
    reset() {
      for (const k of Object.keys(saved)) delete saved[k];
      save();
      apply();
    },
  };
}
