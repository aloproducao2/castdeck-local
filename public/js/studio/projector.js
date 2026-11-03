// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Projetor (equivalente ao "Projetor em tela cheia" do OBS): abre o programa, o vertical ou a prévia da mesa numa
// janela própria, de preferência já em tela cheia no monitor/TV/saída HDMI escolhido. O estúdio continua igual.
//
// Como funciona (estudo em docs/ai/ESTADO.md, Diário 2026-10-21 20h):
// - A janela /projector.html é aberta com window.open e lê as trilhas por window.opener.__castdeckProjector:
//   mesma origem e mesmo processo, então a imagem não é codificada de novo (diferente do /out, que usa WebRTC).
// - A escolha da tela usa a Window Management API (getScreenDetails). Com a permissão "Gerenciar janelas",
//   o Chromium abre o pop-up direto em tela cheia na tela pedida (recurso "popup,fullscreen" + left/top).
//   Sem a permissão (ou em outro navegador) abre numa janela comum: arrastar para a TV e dar duplo clique.
export function createProjectors({ S, getStreams, getMixer, $, esc, toast, modal, icons }) {
  const open = new Map(); // janela do projetor -> { src, seen }
  const LABEL = { pgm: 'Programa (PGM)', vpgm: 'Vertical 9:16', pvw: 'Prévia da mesa (PVW)' };

  // prévia da mesa de corte: o canvas do monitor PVW vira trilha só quando alguém pede
  function previewTrack() {
    const c = $('#sw-pvw-canvas');
    if (!c || !S.switcher) return null;
    try {
      if (!c._cdCap || c._cdCap.getVideoTracks()[0]?.readyState !== 'live') c._cdCap = c.captureStream();
    } catch {
      return null;
    }
    return c._cdCap.getVideoTracks()[0] || null;
  }

  window.__castdeckProjector = {
    get(src) {
      const { programStream, vStream } = getStreams();
      const a = getMixer()?.programTrack || null;
      if (src === 'pgm') return { v: programStream?.getVideoTracks()[0] || null, a };
      if (src === 'vpgm') return { v: vStream?.getVideoTracks()[0] || null, a };
      if (src === 'pvw') return { v: previewTrack(), a: null };
      return null;
    },
    hello(src, win) {
      open.set(win, { src, seen: Date.now() });
    },
  };

  function list() {
    for (const [w, o] of open) {
      let closed = true;
      try {
        closed = w.closed;
      } catch {}
      if (closed || Date.now() - o.seen > 3500) open.delete(w);
    }
    return [...open.entries()];
  }
  const active = (src) => list().some(([, o]) => o.src === src);

  async function screenDetails() {
    if (!('getScreenDetails' in window)) return null;
    try {
      return await window.getScreenDetails(); // pede a permissão "Gerenciar janelas" na primeira vez
    } catch {
      return null;
    }
  }

  function launch(src, scr) {
    const url = `/projector.html?src=${src}`;
    // nome fixo por sinal + tela: clicar de novo reaproveita a mesma janela em vez de abrir outra
    const name = `castdeck-proj-${src}-${scr ? `${scr.left}x${scr.top}` : 'win'}`;
    const feat = scr
      ? `popup,left=${scr.availLeft ?? scr.left},top=${scr.availTop ?? scr.top},width=${scr.availWidth ?? scr.width},height=${scr.availHeight ?? scr.height},fullscreen`
      : `popup,width=${src === 'vpgm' ? 540 : 960},height=${src === 'vpgm' ? 960 : 540}`;
    const w = window.open(url, name, feat);
    if (!w) return toast('O navegador bloqueou a janela do projetor. Permita pop-ups para este endereço.', 'err');
    try {
      w.focus();
    } catch {}
    toast(scr ? `Projetor aberto: ${LABEL[src]}.` : 'Projetor aberto numa janela: arraste para a TV/monitor e dê duplo clique para tela cheia.', 'ok');
  }

  function screenName(s, i, d) {
    const parts = [s.label || `Tela ${i + 1}`, `${s.width}×${s.height}`];
    if (s.isPrimary) parts.push('principal');
    if (d.currentScreen === s) parts.push('onde está o estúdio');
    return parts.join(' · ');
  }

  async function openDialog(src = 'pgm') {
    let sel = src;
    let details = null;
    let perm = 'none';
    let loading = true; // enquanto o navegador pergunta a permissão "Gerenciar janelas"
    await modal(
      `<h3>Projetor · tela, TV ou HDMI</h3>
      <p class="sub">Mostra o sinal em tela cheia em outro monitor, sem tirar nada do estúdio (como o projetor do OBS). Não pesa: usa a mesma imagem, sem codificar de novo.</p>
      <div class="pj-label">Sinal</div>
      <div class="seg pj-seg" id="pj-src">
        <button data-src="pgm">Programa</button><button data-src="vpgm">Vertical 9:16</button><button data-src="pvw">Prévia (mesa)</button>
      </div>
      <div class="pj-label">Onde mostrar</div>
      <div class="pj-screens" id="pj-screens"><div class="hint">Procurando telas…</div></div>
      <div class="pj-open" id="pj-open"></div>
      <div class="modal-actions"><button class="btn" data-close>Fechar</button></div>`,
      {
        onMount: (el, close) => {
          const renderSrc = () => {
            el.querySelectorAll('#pj-src button').forEach((b) => {
              b.classList.toggle('active', b.dataset.src === sel);
              b.disabled = b.dataset.src === 'pvw' && !S.switcher;
              b.title = b.disabled ? 'Ligue a mesa de corte para projetar a prévia' : '';
            });
          };
          const renderOpen = () => {
            const l = list();
            $('#pj-open', el).innerHTML = l.length
              ? `<span class="hint">Abertos agora:</span> ${l.map(([, o], i) => `<button class="btn sm ghost" data-pj-close="${i}" title="Fechar este projetor">${esc(LABEL[o.src])} ✕</button>`).join('')}`
              : '';
            el.querySelectorAll('[data-pj-close]').forEach((b) => {
              b.onclick = () => {
                try {
                  l[Number(b.dataset.pjClose)][0].close();
                } catch {}
                setTimeout(renderOpen, 200);
              };
            });
          };
          const renderScreens = () => {
            const box = $('#pj-screens', el);
            const scr = details?.screens || [];
            const items = scr
              .map(
                (s, i) => `<button class="pj-screen ${details.currentScreen === s ? 'cur' : ''}" data-i="${i}">
                  <span class="pj-mon" style="aspect-ratio:${s.width}/${s.height}"><b>${i + 1}</b></span>
                  <span class="pj-meta"><strong>${esc(screenName(s, i, details).split(' · ')[0])}</strong><small>${esc(screenName(s, i, details).split(' · ').slice(1).join(' · '))}</small></span>
                  <span class="pj-go">Tela cheia</span>
                </button>`,
              )
              .join('');
            const warn = loading
              ? '<div class="hint">Procurando telas…</div>'
              : details && scr.length < 2
                ? '<p class="hint pj-warn">Só uma tela detectada. Ligue a TV/monitor pelo HDMI e use o modo <b>Estender</b> do Windows (tecla Windows + P), não Duplicar.</p>'
                : !details
                  ? `<p class="hint pj-warn">${perm === 'denied' ? 'A permissão “Gerenciar janelas” foi negada: libere no cadeado da barra de endereço para escolher a tela e abrir já em tela cheia.' : 'Este navegador não informa as telas. Abra numa janela, arraste para a TV e dê duplo clique.'}</p>`
                  : '';
            box.innerHTML = `${items}<button class="pj-screen win" data-i="win"><span class="pj-mon win"></span><span class="pj-meta"><strong>Em uma janela</strong><small>Para arrastar e redimensionar à vontade</small></span><span class="pj-go">Abrir</span></button>${warn}`;
            box.querySelectorAll('.pj-screen').forEach((b) => {
              b.onclick = () => {
                if (sel === 'pvw' && !S.switcher) return toast('Ligue a mesa de corte para projetar a prévia.');
                launch(sel, b.dataset.i === 'win' ? null : scr[Number(b.dataset.i)]);
                close();
              };
            });
          };
          el.querySelectorAll('#pj-src button').forEach((b) => {
            b.onclick = () => {
              sel = b.dataset.src;
              renderSrc();
            };
          });
          renderSrc();
          renderOpen();
          // a opção "Em uma janela" aparece já; as telas entram quando o navegador responder
          renderScreens();
          (async () => {
            try {
              perm = (await navigator.permissions.query({ name: 'window-management' })).state;
            } catch {}
            details = await screenDetails();
            if (!details) {
              try {
                perm = (await navigator.permissions.query({ name: 'window-management' })).state;
              } catch {}
            }
            loading = false;
            if (!el.isConnected) return;
            renderScreens();
            details?.addEventListener('screenschange', () => el.isConnected && renderScreens());
          })();
        },
      },
    );
  }

  return { openDialog, active, list };
}
