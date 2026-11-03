// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Controlador da janela popout da mesa de áudio (ideal para segundo monitor).

const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

let panel = null;
let rafId = null;

function init() {
  const studio = window.opener?.__castdeck;
  const statusEl = $('#pop-status');

  if (!studio || !studio.mixer || !studio.createAudioPanel) {
    if (statusEl) {
      statusEl.className = 'pill sm warn';
      statusEl.textContent = 'Aguardando estúdio...';
    }
    setTimeout(init, 400);
    return;
  }

  if (statusEl) {
    statusEl.className = 'pill sm ok';
    statusEl.textContent = 'Conectado ao Estúdio';
  }

  const {
    mixer,
    S,
    esc,
    icons,
    toast,
    listDevices,
    loadPrefs,
    savePrefs,
    toggleHostMic,
    createAudioPanel,
  } = studio;

  panel = createAudioPanel({
    mixer,
    S,
    $,
    $$,
    esc,
    icons,
    toast: (msg, type) => {
      try {
        studio.toast?.(msg, type);
      } catch {}
    },
    listDevices,
    loadPrefs,
    savePrefs,
    toggleHostMic,
    captureScreenAudioLoopback: () => studio.captureScreenAudioLoopback?.(),
    attachDeviceAudioToScreen: (id) => studio.attachDeviceAudioToScreen?.(id),
    detachScreenAudio: () => studio.detachScreenAudio?.(),
    startScreen: (mode) => studio.startScreen?.(mode),
    container: '#pop-audio',
    isPopout: true,
  });

  panel.render();

  window.renderAudio = () => {
    panel?.render();
  };

  // Botão de fixar no topo (Always on Top via Picture-in-Picture nativo)
  const pinBtn = $('#pop-pin');
  let pipWin = null;
  if (pinBtn) {
    const updatePinUi = (on) => {
      pinBtn.classList.toggle('active', on);
      pinBtn.setAttribute('aria-pressed', String(on));
      const lbl = $('#pop-pin-lbl');
      if (lbl) lbl.textContent = on ? 'Fixado no topo 📌' : 'Fixar no topo';
    };

    pinBtn.onclick = async () => {
      if (pipWin) {
        pipWin.close();
        pipWin = null;
        updatePinUi(false);
        return;
      }
      if ('documentPictureInPicture' in window) {
        try {
          pipWin = await window.documentPictureInPicture.requestWindow({
            width: Math.min(window.outerWidth || 700, 850),
            height: Math.min(window.outerHeight || 600, 850),
          });
          [...document.styleSheets].forEach((sheet) => {
            try {
              if (sheet.href) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = sheet.href;
                pipWin.document.head.appendChild(link);
              } else if (sheet.cssRules) {
                const style = document.createElement('style');
                [...sheet.cssRules].forEach((r) => (style.textContent += r.cssText));
                pipWin.document.head.appendChild(style);
              }
            } catch {}
          });
          const main = $('.pop-audio-wrap');
          const ph = document.createElement('div');
          ph.id = 'pip-audio-ph';
          ph.style.cssText = 'padding:40px;text-align:center;color:var(--text-1);display:flex;flex-direction:column;align-items:center;gap:12px;margin:auto;';
          ph.innerHTML = '<div><b>Mesa de áudio fixada no topo</b><div style="font-size:12px;color:var(--text-2);margin-top:4px">A janela está suspensa sobre os outros aplicativos (Picture-in-Picture).</div></div><button class="btn sm ghost" id="btn-return-pip" style="gap:6px"><span>↩</span> Trazer de volta</button>';
          main.parentNode.insertBefore(ph, main);
          pipWin.document.body.appendChild(main);
          pipWin.document.body.style.cssText = 'margin:0;padding:0;background:var(--bg-0,#0a0a12);color:var(--text-0,#fff);font-family:Inter,system-ui,sans-serif;height:100vh;overflow:hidden;display:flex;flex-direction:column;';

          updatePinUi(true);

          const returnFromPip = () => {
            if (!pipWin) return;
            ph.parentNode.insertBefore(main, ph);
            ph.remove();
            pipWin = null;
            updatePinUi(false);
          };

          pipWin.addEventListener('pagehide', returnFromPip);
          $('#btn-return-pip')?.addEventListener('click', () => pipWin?.close());
        } catch (err) {
          console.warn('PiP não disponível ou cancelado:', err);
          updatePinUi(!pinBtn.classList.contains('active'));
        }
      } else {
        updatePinUi(!pinBtn.classList.contains('active'));
      }
    };
  }

  const loop = () => {
    try {
      if (!window.opener || window.opener.closed) {
        if (statusEl) {
          statusEl.className = 'pill sm err';
          statusEl.textContent = 'Estúdio desconectado';
        }
        return;
      }
      panel?.tick();
    } catch {}
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

window.addEventListener('load', init);

window.addEventListener('beforeunload', () => {
  if (rafId) cancelAnimationFrame(rafId);
  try {
    if (window.opener && window.opener._audioPopout === window) {
      window.opener._audioPopout = null;
    }
  } catch {}
});
