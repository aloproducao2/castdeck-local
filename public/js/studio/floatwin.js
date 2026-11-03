// SPDX-License-Identifier: AGPL-3.0-only
// Janelas flutuantes e multi-monitor: qualquer painel lateral pode ser destacado em uma janela real do sistema,
// que pode ser arrastada para qualquer tela/monitor do PC, ou fixada no topo (📌) via Picture-in-Picture nativo.
// Mantém os nós DOM vivos com o mesmo contexto JS (áudio, WebSockets e renderizadores continuam operando normalmente).
const KEY = 'castdeck.fw';

export function createFloatWins({ $, $$, tabs, renderTab, onDock, onOpen, toast }) {
  const wins = new Map(); // aba -> { win, panel, el }
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    // Nunca reabre popups automaticamente no startup do software: limpa flags open órfãs
    for (const k in saved) {
      if (saved[k]) saved[k].open = false;
    }
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {}

  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(saved));
    } catch {}
  };

  const label = (tab) => tabs.find(([id]) => id === tab)?.[1] || tab;

  function has(tab) {
    const rec = wins.get(tab);
    if (!rec) return false;
    if (rec.win) return !rec.win.closed;
    return !!rec.el;
  }

  function raise(tab) {
    const rec = wins.get(tab);
    if (!rec) return;
    if (rec.win && !rec.win.closed) {
      rec.win.focus();
    } else if (rec.el) {
      rec.el.style.zIndex = String(160 + (Date.now() % 30));
    }
  }

  function open(tab) {
    if (has(tab)) {
      raise(tab);
      return true;
    }

    const panel = $('#panel-' + tab);
    if (!panel) return false;

    // Dimensões e posicionamento da janela no monitor
    const W = window.screen.availWidth || 1920;
    const H = window.screen.availHeight || 1080;
    const w = Math.min(Math.max(saved[tab]?.w || 480, 340), W);
    const h = Math.min(Math.max(saved[tab]?.h || 680, 280), H);
    const x = Math.min(Math.max(saved[tab]?.x ?? (window.screenX + window.outerWidth - w - 24), 0), W - 60);
    const y = Math.min(Math.max(saved[tab]?.y ?? (window.screenY + 40), 0), H - 60);

    let win = null;
    try {
      win = window.open(
        `/popout.html?tab=${encodeURIComponent(tab)}`,
        `cd_popout_${tab}`,
        `width=${w},height=${h},left=${x},top=${y},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
      );
    } catch (err) {
      console.warn('Falha ao abrir janela nativa via window.open:', err);
    }

    // Janela nativa em tela separada (suporta qualquer tela/monitor do PC)
    if (win && !win.closed) {
      const rec = { win, panel };
      wins.set(tab, rec);
      window.__castdeck?.registerPopout?.(tab, win, panel);
      try { win.focus(); } catch {}

      saved[tab] = { x, y, w, h, open: true };
      persist();

      onOpen?.(tab);
      toast?.(`${label(tab)} destacado em janela separada. Arraste para qualquer monitor ou use 📌 para fixar no topo.`);
      return true;
    }

    // Fallback: janela flutuante in-page caso popups estejam bloqueados no navegador
    const el = document.createElement('div');
    el.className = 'fw';
    el.dataset.fw = tab;
    el.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    el.innerHTML = `<div class="fw-head"><b class="fw-title">${label(tab)}</b>
        <button class="fw-btn fw-top" title="Sempre no topo: fixa a janela sobre as outras (Picture-in-Picture)" aria-pressed="false">📌</button>
        <button class="fw-btn fw-x" title="Fechar (volta para o painel lateral)" aria-label="Fechar">✕</button></div>
      <div class="fw-body"></div>`;
    document.body.appendChild(el);
    $('.fw-body', el).appendChild(panel);
    panel.classList.add('active', 'fw-panel');

    const rec = { el, panel };
    wins.set(tab, rec);

    // Arrasto in-page
    const head = $('.fw-head', el);
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      try { head.setPointerCapture(e.pointerId); } catch {}
      const mv = (ev) => {
        el.style.left = `${Math.min(Math.max(ev.clientX - dx, -r.width + 90), window.innerWidth - 60)}px`;
        el.style.top = `${Math.min(Math.max(ev.clientY - dy, 0), window.innerHeight - 40)}px`;
      };
      const up = () => {
        head.removeEventListener('pointermove', mv);
        head.removeEventListener('pointerup', up);
      };
      head.addEventListener('pointermove', mv);
      head.addEventListener('pointerup', up);
    });

    // Botão de fixar no topo in-page: aciona Picture-in-Picture nativo do Windows!
    const btnTop = $('.fw-top', el);
    let inPagePip = null;
    btnTop.onclick = async () => {
      if (inPagePip) {
        inPagePip.close();
        inPagePip = null;
        btnTop.classList.remove('active');
        btnTop.setAttribute('aria-pressed', 'false');
        return;
      }
      if ('documentPictureInPicture' in window) {
        try {
          inPagePip = await window.documentPictureInPicture.requestWindow({
            width: Math.min(w, 800),
            height: Math.min(h, 900),
          });
          for (const s of document.querySelectorAll('link[rel="stylesheet"], style')) {
            inPagePip.document.head.appendChild(s.cloneNode(true));
          }
          inPagePip.document.body.className = document.body.className;
          inPagePip.document.body.appendChild(panel);
          btnTop.classList.add('active');
          btnTop.setAttribute('aria-pressed', 'true');
          toast?.(`${label(tab)} fixado sempre no topo do computador 📌`);

          inPagePip.addEventListener('pagehide', () => {
            inPagePip = null;
            btnTop.classList.remove('active');
            btnTop.setAttribute('aria-pressed', 'false');
            $('.fw-body', el).appendChild(panel);
          });
          return;
        } catch (err) {
          console.warn('PiP erro:', err);
        }
      }
      rec.top = !rec.top;
      el.classList.toggle('on-top', rec.top);
      btnTop.setAttribute('aria-pressed', String(rec.top));
      toast?.(rec.top ? `${label(tab)} fixado no topo` : `${label(tab)} liberado`);
    };

    $('.fw-x', el).onclick = () => close(tab);

    renderTab(tab);
    onOpen?.(tab);
    toast?.(`${label(tab)} destacado.`);
    return true;
  }

  function close(tab) {
    const rec = wins.get(tab);
    if (!rec) return;
    wins.delete(tab);
    window.__castdeck?.unregisterPopout?.(tab);

    if (rec.win && !rec.win.closed) {
      try {
        rec.win.close();
      } catch {}
    }

    if (rec.el) {
      rec.panel.classList.remove('fw-panel', 'active');
      $('#side-body')?.appendChild(rec.panel);
      rec.el.remove();
    }

    if (saved[tab]) saved[tab].open = false;
    persist();
    onDock?.(tab);
  }

  function restore() {
    for (const [tab, g] of Object.entries(saved)) {
      if (g.open && $('#panel-' + tab)) open(tab);
    }
  }

  // Encerra janelas popout filhas ao fechar a janela principal do estúdio
  window.addEventListener('beforeunload', () => {
    for (const rec of wins.values()) {
      try {
        if (rec.win && !rec.win.closed) rec.win.close();
      } catch {}
    }
  });

  return {
    open,
    close,
    raise,
    restore,
    has,
    toggle: (t) => (has(t) ? close(t) : open(t)),
    list: () => [...wins.keys()],
  };
}
