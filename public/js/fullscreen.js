// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Tela cheia de um elemento (monitor de PROGRAMA/PRÉVIA, a mesa inteira, a página da câmera).
// Usa a Fullscreen API quando existe; senão cai num "falso tela cheia" (elemento fixo cobrindo a janela):
//  - app Android: a WebView só entra em tela cheia de verdade com onShowCustomView, e o app já roda imersivo,
//    então o falso tela cheia dá o mesmo resultado sem mexer no Java
//  - iPhone: o Safari só permite tela cheia de <video>
// Parado por 2,5 s em tela cheia, o elemento ganha .fs-idle (as sobreposições e o cursor somem: monitor limpo).

const IN_APP = /CastDeckAndroid/.test(navigator.userAgent);
const listeners = new Set();
let pseudo = null; // elemento em falso tela cheia
let idleT = 0;

const nativeEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
export const fullEl = () => nativeEl() || pseudo;
export const isFull = (el) => !!el && fullEl() === el;

function notify() {
  const el = fullEl();
  document.documentElement.classList.toggle('fs-any', !!el);
  for (const fn of listeners) {
    try {
      fn(el);
    } catch {}
  }
  armIdle(el);
}

// sobreposições somem quando o mouse/dedo fica parado (monitor de confiança limpo, como num multiviewer)
function armIdle(el) {
  clearTimeout(idleT);
  document.querySelectorAll('.fs-idle').forEach((e) => e !== el && e.classList.remove('fs-idle'));
  if (!el) return;
  el.classList.remove('fs-idle');
  idleT = setTimeout(() => fullEl() === el && el.classList.add('fs-idle'), 2500);
}
for (const ev of ['pointermove', 'pointerdown', 'keydown']) document.addEventListener(ev, () => fullEl() && armIdle(fullEl()), { passive: true });

document.addEventListener('fullscreenchange', notify);
document.addEventListener('webkitfullscreenchange', notify);
// Esc também sai do falso tela cheia (na Fullscreen API o navegador já cuida disso)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pseudo && !document.querySelector('.modal-back')) exitFull();
});
// botão "voltar" do Android sai do falso tela cheia em vez de sair da página
window.addEventListener('popstate', () => {
  if (pseudo) exitFull({ fromHistory: true });
});

// ancestrais com container-type/contain viram "bloco de contenção" de position:fixed e os sticky com z-index prendem
// o empilhamento: .fs-anc desliga isso enquanto o falso tela cheia está ativo (o layout de trás fica coberto mesmo)
const markAnc = (el, on) => {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) p.classList.toggle('fs-anc', on);
};

function enterPseudo(el) {
  const wasPseudo = !!pseudo;
  if (pseudo && pseudo !== el) {
    pseudo.classList.remove('fs-pseudo', 'fs-idle');
    markAnc(pseudo, false);
  }
  pseudo = el;
  el.classList.add('fs-pseudo');
  markAnc(el, true);
  document.body.classList.add('fs-lock');
  // um só registro no histórico por sessão de tela cheia (trocar de alvo não empilha "voltar")
  if (!wasPseudo) {
    try {
      history.pushState({ castdeckFs: true }, '');
    } catch {}
  }
  notify();
}

export async function enterFull(el) {
  if (!el) return;
  if (fullEl() === el) return;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  // já em tela cheia nativa: pede o novo elemento por cima (o navegador empilha; sair volta ao anterior)
  if (!IN_APP && req && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
    try {
      await req.call(el, { navigationUI: 'hide' });
      return;
    } catch {}
  }
  enterPseudo(el);
}

export async function exitFull({ fromHistory = false } = {}) {
  if (pseudo) {
    pseudo.classList.remove('fs-pseudo', 'fs-idle');
    markAnc(pseudo, false);
    pseudo = null;
    document.body.classList.remove('fs-lock');
    if (!fromHistory && history.state?.castdeckFs) history.back();
    notify();
  }
  if (nativeEl()) {
    try {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } catch {}
  }
}

export const toggleFull = (el) => (isFull(el) ? exitFull() : enterFull(el));
export function onFullChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
