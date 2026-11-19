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
export function createProjectors({ S, getStreams, getMixer, getVfx, $, esc, toast, modal, icons }) {
  const open = new Map(); // janela do projetor -> { src, seen }
  const sourceCanvases = new Map(); // id da fonte -> { canvas, ctx, stream, track, timer, lastSeen }
  const LABEL = { pgm: 'Programa (PGM)', vpgm: 'Vertical 9:16', pvw: 'Prévia da mesa (PVW)' };
  const KIND_LABEL = {
    camera: 'Câmera',
    screen: 'Tela',
    browser: 'Página web',
    media: 'Mídia',
    image: 'Imagem',
    uvc: 'Câmera USB',
  };

  function labelOf(src) {
    if (LABEL[src]) return LABEL[src];
    if (String(src).startsWith('src:')) {
      const id = src.slice(4);
      const s = S.sources.get(id);
      return s ? `Fonte · ${s.label || id}` : 'Fonte isolada';
    }
    return String(src || 'PGM');
  }

  function sourceKindLabel(s) {
    if (s.ingest) return 'RTMP/SRT';
    if (s.kind === 'camera' && s.ownerId && s.ownerId !== 'host') return s.remoteCam ? 'Câmera remota' : 'Convidado';
    if (s.kind === 'media' && String(s.label || '').startsWith('♪ ')) return 'Áudio';
    return KIND_LABEL[s.kind] || 'Fonte';
  }

  // Algumas fontes (imagem, UVC MJPEG, browser captureStream(0), câmera com VFX ou vídeo pausado) não têm trilha de vídeo contínua:
  // projeta via canvas auxiliar 16:9 sob demanda, encerrando o loop assim que nenhum projetor usar essa fonte.
  function sourceCanvasTrack(s) {
    let entry = sourceCanvases.get(s.id);
    const p = S.system?.presets?.[S.preset] || { width: 1280, height: 720 };
    const w = Math.min(1920, Math.max(640, Number(p.width) || 1280));
    const h = Math.min(1080, Math.max(360, Number(p.height) || 720));
    if (!entry || entry.track?.readyState !== 'live') {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      const stream = canvas.captureStream(30);
      const track = stream.getVideoTracks()[0] || null;
      entry = { canvas, ctx, stream, track, timer: 0, lastSeen: Date.now() };
      const paint = () => {
        const cur = S.sources.get(s.id);
        const key = 'src:' + s.id;
        if (!cur || (!active(key) && Date.now() - entry.lastSeen > 3500)) {
          clearInterval(entry.timer);
          try { entry.track?.stop(); } catch {}
          if (sourceCanvases.get(s.id) === entry) sourceCanvases.delete(s.id);
          return;
        }
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (cur.camOff) return;
        const vfx = getVfx?.();
        const fx = cur.kind === 'camera' && vfx?.active?.(cur.id) ? vfx.frame(cur.id, cur.el) : null;
        const img = fx?.img || cur.el;
        if (!img) return;
        const isImg = img instanceof HTMLImageElement;
        const iw = fx ? fx.w : isImg ? img.naturalWidth : img instanceof HTMLCanvasElement ? img.width : img.videoWidth;
        const ih = fx ? fx.h : isImg ? img.naturalHeight : img instanceof HTMLCanvasElement ? img.height : img.videoHeight;
        if (!(iw > 0 && ih > 0)) return;
        const sc = Math.min(canvas.width / iw, canvas.height / ih);
        const dw = iw * sc;
        const dh = ih * sc;
        try {
          ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
        } catch {}
      };
      entry.timer = setInterval(paint, Math.round(1000 / 30));
      sourceCanvases.set(s.id, entry);
      paint();
    } else {
      if (entry.canvas.width !== w || entry.canvas.height !== h) {
        entry.canvas.width = w;
        entry.canvas.height = h;
      }
      entry.lastSeen = Date.now();
    }
    return entry.track;
  }

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

  function sourceTracks(id) {
    const s = S.sources.get(id);
    if (!s) return null;
    const mixer = getMixer?.();
    const a = mixer?.isoTrack?.(id) || s.stream?.getAudioTracks?.().find((t) => t.readyState === 'live') || null;
    if (s.camOff) return { v: null, a, label: s.label || id };
    const vfx = getVfx?.();
    const hasFx = s.kind === 'camera' && !!vfx?.active?.(id);
    let v = null;
    if (hasFx || s.kind === 'image' || s.kind === 'uvc' || s.kind === 'browser') {
      v = sourceCanvasTrack(s);
    } else if (s.kind === 'media') {
      try {
        if (!s._cap || !s._cap.getVideoTracks().some((t) => t.readyState === 'live')) {
          s._cap = s.el?.captureStream?.() || s.el?.mozCaptureStream?.() || null;
        }
      } catch {}
      v = s._cap?.getVideoTracks().find((t) => t.readyState === 'live') || null;
      if (!v && s.el?.readyState >= 2) v = sourceCanvasTrack(s);
    } else {
      v = s.stream?.getVideoTracks?.().find((t) => t.readyState === 'live') || null;
      if (!v && s.el && (s.el.videoWidth > 0 || s.el.naturalWidth > 0)) v = sourceCanvasTrack(s);
    }
    return { v, a, label: s.label || id };
  }

  window.__castdeckProjector = {
    get(src) {
      const { programStream, vStream } = getStreams();
      const a = getMixer()?.programTrack || null;
      if (src === 'pgm') return { v: programStream?.getVideoTracks()[0] || null, a };
      if (src === 'vpgm') return { v: vStream?.getVideoTracks()[0] || null, a };
      if (src === 'pvw') return { v: previewTrack(), a: null };
      if (String(src).startsWith('src:')) return sourceTracks(src.slice(4));
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

  let projSeq = 0;

  function launch(src, scr) {
    const url = `/projector.html?src=${encodeURIComponent(src)}`;
    // nome único por abertura para permitir múltiplas janelas da mesma fonte quando o usuário pedir
    const safeName = String(src).replace(/[^a-zA-Z0-9_-]/g, '_');
    const name = `castdeck-proj-${safeName}-${++projSeq}-${Date.now().toString(36)}`;
    const feat = scr
      ? `popup,left=${scr.availLeft ?? scr.left},top=${scr.availTop ?? scr.top},width=${scr.availWidth ?? scr.width},height=${scr.availHeight ?? scr.height},fullscreen`
      : `popup,width=${src === 'vpgm' ? 540 : 960},height=${src === 'vpgm' ? 960 : 540}`;
    const w = window.open(url, name, feat);
    if (!w) return toast('O navegador bloqueou a janela do projetor. Permita pop-ups para este endereço.', 'err');
    try {
      w.focus();
    } catch {}
    toast(scr ? `Projetor aberto: ${labelOf(src)}.` : `Projetor aberto (${labelOf(src)}): arraste para a TV/monitor e dê duplo clique para tela cheia.`, 'ok');
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
    const sourcesList = [...S.sources.values()];
    const srcBtns = sourcesList.length
      ? sourcesList
          .map(
            (s) =>
              `<button type="button" class="pj-src-btn" data-src="src:${esc(s.id)}" title="Projetar ${esc(s.label || s.id)}"><small>${esc(sourceKindLabel(s))}</small><span>${esc(s.label || s.id)}</span></button>`,
          )
          .join('')
      : '<span class="hint">Nenhuma fonte conectada no momento.</span>';
    await modal(
      `<h3>Projetor · tela, TV ou HDMI</h3>
      <p class="sub">Mostra o programa ou qualquer fonte isolada em tela cheia em outro monitor, sem tirar nada do estúdio (como o projetor do OBS).</p>
      <div class="pj-label">Saída do estúdio</div>
      <div class="seg pj-seg" id="pj-src">
        <button data-src="pgm">Programa</button><button data-src="vpgm">Vertical 9:16</button><button data-src="pvw">Prévia (mesa)</button>
      </div>
      <div class="pj-label">Ou projetar uma fonte isolada</div>
      <div class="pj-sources" id="pj-sources">${srcBtns}</div>
      <div class="pj-label">Onde mostrar</div>
      <div class="pj-screens" id="pj-screens"><div class="hint">Procurando telas…</div></div>
      <div class="pj-open" id="pj-open"></div>
      <div class="modal-actions"><button class="btn" data-close>Fechar</button></div>`,
      {
        onMount: (el, close) => {
          const renderSrc = () => {
            el.querySelectorAll('[data-src]').forEach((b) => {
              b.classList.toggle('active', b.dataset.src === sel);
              if (b.dataset.src === 'pvw') {
                b.disabled = !S.switcher;
                b.title = b.disabled ? 'Ligue a mesa de corte para projetar a prévia' : '';
              }
            });
          };
          const renderOpen = () => {
            const l = list();
            $('#pj-open', el).innerHTML = l.length
              ? `<span class="hint">Abertos agora:</span> ${l.map(([, o], i) => `<button class="btn sm ghost" data-pj-close="${i}" title="Fechar este projetor">${esc(labelOf(o.src))} ✕</button>`).join('')}`
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
          el.querySelectorAll('[data-src]').forEach((b) => {
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
