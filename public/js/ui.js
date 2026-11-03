// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Utilitários compartilhados: ícones, DOM, toasts, modais, API.

const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const icons = {
  logo: P('<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7"/>'),
  mic: P('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/>'),
  micOff: P('<path d="M2 2l20 20M9 9v1a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.8M17 16.9A7 7 0 0 1 5 10M19 10a7 7 0 0 1-.4 2.3M12 17v5"/>'),
  cam: P('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>'),
  camOff: P('<path d="M2 2l20 20M16 16v1a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h2M9.7 6H15a1 1 0 0 1 1 1v3.3l1 1L22 7v10"/>'),
  crop: P('<path d="M6 2v16h16M2 6h16v16"/>'),
  screen: P('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v6"/>'),
  tab: P('<rect x="2" y="5" width="20" height="16" rx="2"/><path d="M2 9h20M2 5h7l2 4"/><path d="M10 15l4-2.5v5z" fill="currentColor"/>'),
  cursor: P('<path d="M5 3l14 7-6 2-2 6z"/><path d="M13 13l5 5"/>'),
  invite: P('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'),
  settings: P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  leave: P('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  brand: P('<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.7 1.7-1.7h2c3 0 5.5-2.5 5.5-5.5C22 6 17.5 2 12 2z"/>'),
  banner: P('<rect x="2" y="14" width="20" height="6" rx="1"/><path d="M6 17h8M2 4h20M2 9h12"/>'),
  news: P('<path d="M4 4h13v16H6a2 2 0 0 1-2-2z"/><path d="M17 8h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3"/><path d="M7 8h7M7 12h7M7 16h4"/>'),
  auto: P('<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>'),
  signal: P('<path d="M4 20V10M10 20V4M16 20v-7M22 20V8"/>'),
  social: P('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
  chat: P('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  whatsapp: P('<path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 21l2-5.6A8.5 8.5 0 1 1 21 11.5z"/><path d="M8.1 7.8c.2-.5.4-.5.7-.5h.6c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.6l-.5.6c-.1.2-.2.3 0 .5.7 1.1 1.7 2.1 2.8 2.8.2.1.3.1.5 0l.6-.6c.2-.1.4-.2.6-.1l1.9.8c.5.2.5.4.5.6v.6c0 .3 0 .5-.5.7-.4.2-1.3.5-2.2.2-2.2-.7-4.5-3-5.2-5.2-.3-.9 0-1.8.2-2.2z"/>'),
  broadcast: P('<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2"/>'),
  record: P('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>'),
  ball: P('<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/><path d="M12 3v4M16 10l4-1M14.5 15l2.5 4M9.5 15L7 19M8 10L4 9"/>'),
  widgets: P('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1"/>'),
  plus: P('<path d="M12 5v14M5 12h14"/>'),
  trash: P('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  edit: P('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  copy: P('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  play: P('<path d="M6 4l14 8-14 8z" fill="currentColor"/>'),
  stop: P('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
  folder: P('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
  film: P('<rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>'),
  user: P('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>'),
  x: P('<path d="M18 6L6 18M6 6l12 12"/>'),
  up: P('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  down: P('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
  mixer: P('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  // legenda (closed caption): retângulo com "CC"
  cc: P('<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M10.5 10.2a2.4 2.4 0 1 0 0 3.6M17.5 10.2a2.4 2.4 0 1 0 0 3.6"/>'),
  eye: P('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>'),
  kick: P('<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M17 8l5 5M22 8l-5 5"/>'),
  expand: P('<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  shrink: P('<path d="M3 8h3a2 2 0 0 0 2-2V3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M21 16h-3a2 2 0 0 0-2 2v3"/>'),
  sliders: P('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  flip: P('<path d="M3 7h3l2-3h8l2 3h3v12H3z"/><path d="M9 13a3 3 0 0 1 5.2-2M15 13a3 3 0 0 1-5.2 2M14 9v2h-2M10 17v-2h2"/>'),
  multiview: P('<rect x="2" y="4" width="9" height="7" rx="1"/><rect x="13" y="4" width="9" height="7" rx="1"/><path d="M3 15h4v5H3zM10 15h4v5h-4zM17 15h4v5h-4z"/>'),
  spark: P('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/><circle cx="12" cy="12" r="2"/>'),
  inbox: P('<path d="M21 12h-5l-2 3h-4l-2-3H3"/><path d="M5.5 5h13L21 12v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6z"/>'),
  display: P('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M7 12h5"/>'),
};

export const $ = (sel, root = document) => {
  let el = root.querySelector(sel);
  if (!el && root === document && window.__castdeck?.findInPopout) {
    el = window.__castdeck.findInPopout(sel);
  }
  return el;
};
export const $$ = (sel, root = document) => {
  const list = [...root.querySelectorAll(sel)];
  if (root === document && window.__castdeck?.findAllInPopouts) {
    list.push(...window.__castdeck.findAllInPopouts(sel));
  }
  return list;
};
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function toast(text, kind = '') {
  let box = $('#toasts');
  if (!box) {
    box = h('<div id="toasts"></div>');
    document.body.append(box);
  }
  // aria-live: leitores de tela anunciam erros/avisos sem precisar de foco (o toast some sozinho).
  const el = h(`<div class="toast ${kind}" role="${kind === 'err' ? 'alert' : 'status'}" aria-live="${kind === 'err' ? 'assertive' : 'polite'}">${esc(text)}</div>`);
  el.onclick = () => { el.style.opacity = "0"; setTimeout(() => el.remove(), 120); };
  box.append(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, kind === 'err' ? 6000 : 3200);
}

export function modal(html, { onMount, sticky = false } = {}) {
  return new Promise((resolve) => {
    const back = h(`<div class="modal-back"><div class="modal card" role="dialog" aria-modal="true">${html}</div></div>`);
    const card = back.firstElementChild;
    const prevFocus = document.activeElement;
    const close = (v) => {
      back.remove();
      document.removeEventListener('keydown', onKey);
      card.removeEventListener('keydown', onTrap);
      // Restaura o foco de onde o operador abriu o modal (importante para teclado/leitor de tela).
      if (prevFocus && prevFocus.isConnected) {
        try { prevFocus.focus({ preventScroll: true }); } catch {}
      }
      if (!document.querySelector('.modal-back')) document.body.classList.remove('modal-open');
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (back !== [...document.querySelectorAll('.modal-back')].pop()) return; // só a janela do topo
      close(null);
    };
    // Prende o Tab dentro da janela: antes o foco "escapava" para o estúdio atrás do modal.
    const onTrap = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = [...card.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled && el.getClientRects().length > 0);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    card.addEventListener('keydown', onTrap);
    document.body.classList.add('modal-open');
    back.addEventListener('mousedown', (e) => e.target === back && !sticky && close(null)); // sticky: formulários longos não fecham com clique fora
    back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => close(null)));
    document.body.append(back);
    // ✕ no topo de toda janela. Fechar por ele SALVA: se a janela tem um botão de salvar (marcado com data-save),
    // é ele que roda (mesma validação; se algo estiver inválido a janela fica aberta mostrando o erro). Janelas que já
    // gravam ao vivo (DSK, configurações) ou que só perguntam algo (confirmar) simplesmente fecham.
    const x = h(`<button type="button" class="modal-x" data-x title="Fechar (salva as alterações)" aria-label="Fechar">✕</button>`);
    x.onclick = () => {
      const save = card.querySelector('[data-save]');
      if (save && !save.disabled) save.click();
      else close(null);
    };
    card.prepend(x);
    const heading = card.querySelector('h3')?.textContent?.trim();
    if (heading) card.setAttribute('aria-label', heading);
    onMount?.(card, close);
    // Foco inicial: quem montou pode focar (confirm/prompt já fazem); senão vai para o primeiro campo,
    // nunca para o "✕" (que é o primeiro botão do DOM).
    if (!card.contains(document.activeElement)) {
      const target = card.querySelector('input:not([type="hidden"]), select, textarea, [data-ok], button.primary, button');
      try { target?.focus({ preventScroll: true }); } catch {}
    }
  });
}

// Substitutos do confirm()/prompt() nativos: a caixa do navegador trava a página (vídeo e compositor param), some
// atrás da tela cheia, não segue o tema e mostra "localhost diz". Estes usam o modal do app.
// Texto: o 1º parágrafo vira o título e o resto (depois de uma linha em branco) vira a explicação.
export function confirmDialog(text, { ok = 'Confirmar', cancel = 'Cancelar', danger = false } = {}) {
  const [title, ...rest] = String(text ?? '').split('\n\n');
  const sub = rest.length ? `<p class="sub">${esc(rest.join('\n\n')).replace(/\n/g, '<br>')}</p>` : '';
  return modal(
    `<h3>${esc(title)}</h3>${sub}<div class="modal-actions"><button class="btn" data-close>${esc(cancel)}</button><button class="btn ${danger ? 'live' : 'primary'}" data-ok>${esc(ok)}</button></div>`,
    {
      onMount: (el, close) => {
        const b = el.querySelector('[data-ok]');
        b.onclick = () => close(true);
        b.focus(); // Enter confirma, Esc cancela
      },
    },
  ).then((v) => v === true);
}

// Devolve o texto digitado (sem espaços nas pontas) ou null se cancelar.
export function promptDialog(title, value = '', { ok = 'Salvar', cancel = 'Cancelar', placeholder = '', maxLength = 120 } = {}) {
  return modal(
    `<h3>${esc(title)}</h3><form data-prompt><input class="input" data-prompt-input maxlength="${maxLength}" placeholder="${esc(placeholder)}" value="${esc(value)}"><div class="modal-actions"><button type="button" class="btn" data-close>${esc(cancel)}</button><button class="btn primary" data-save>${esc(ok)}</button></div></form>`,
    {
      onMount: (el, close) => {
        const input = el.querySelector('[data-prompt-input]');
        el.querySelector('[data-prompt]').onsubmit = (e) => {
          e.preventDefault();
          close(input.value.trim());
        };
        input.focus();
        input.select();
      },
    },
  ).then((v) => (typeof v === 'string' ? v : null));
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status, data });
  return data;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = h('<textarea style="position:fixed;opacity:0"></textarea>');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Copiado!', 'ok');
}

export const fmtBytes = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB');
export const fmtTime = (ms) => {
  const s = Math.floor(ms / 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';

export const PLATFORMS = {
  youtube: { label: 'YouTube', short: 'YT', url: 'rtmp://a.rtmp.youtube.com/live2' },
  facebook: { label: 'Facebook', short: 'FB', url: 'rtmps://live-api-s.facebook.com:443/rtmp/' },
  twitch: { label: 'Twitch', short: 'TW', url: 'rtmp://live.twitch.tv/app' },
  kick: { label: 'Kick', short: 'K', url: 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app' },
  linkedin: { label: 'LinkedIn', short: 'in', url: '' },
  instagram: { label: 'Instagram', short: 'IG', url: 'rtmps://edgetee-upload-gru2-1.xx.fbcdn.net:443/rtmp/', vertical: true },
  tiktok: { label: 'TikTok', short: 'TT', url: '', vertical: true },
  x: { label: 'X', short: 'X', url: '' },
  custom: { label: 'RTMP personalizado', short: '⚡', url: 'rtmp://' },
};

// formato do destino: 'h' = horizontal 16:9, 'v' = vertical 9:16 (padrão vem da plataforma)
export const destFormat = (d) => (d?.format === 'v' || d?.format === 'h' ? d.format : PLATFORMS[d?.platform]?.vertical ? 'v' : 'h');
export const fmtBadge = (d) => (destFormat(d) === 'v' ? '<i class="fmt-badge v" title="Vertical 9:16">9:16</i>' : '<i class="fmt-badge h" title="Horizontal 16:9">16:9</i>');
