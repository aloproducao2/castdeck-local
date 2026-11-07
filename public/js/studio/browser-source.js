// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Browser source: renderiza uma URL num navegador headless do servidor e entrega
// os quadros como MediaStream local para o palco. É o modo de compatibilidade
// enquanto o BrowserHost CEF nativo (30/60 fps, 4K, áudio CEF) não está pronto.
import { toast } from '../ui.js';

export function createBrowserSources({ S, comp, mixer, api, addVideoSource, removeSource, modal, esc, studioId, saveStudio }) {
  const items = new Map(); // key -> item
  let ws = null;
  let cefWs = null;
  let cefOk = null;
  let timer = null;
  let seq = 0;

  const keyOf = (id) => `br-${String(id).replace(/[^\w.-]/g, '').slice(0, 32)}`;
  const findKey = (key) => items.get(key) || null;
  const preset = () => S.system?.presets?.[S.preset] || { width: 1280, height: 720, fps: 30 };
  const locale = () => window.CDi18n?.locale || ({ pt: 'pt-BR', en: 'en-US', es: 'es-ES' }[localStorage.getItem('castdeck.lang')] || 'pt-BR');


  function connect() {
    if (ws || !items.size) return;
    try {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/dsk`);
    } catch {
      timer = setTimeout(connect, 1500);
      return;
    }
    ws.binaryType = 'arraybuffer';
    ws.onmessage = onMessage;
    ws.onerror = () => {};
    ws.onclose = () => {
      ws = null;
      if (items.size) timer = setTimeout(connect, 1500);
    };
  }

  function connectCef() {
    if (cefWs || !items.size) return;
    try {
      cefWs = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/cef`);
    } catch {
      timer = setTimeout(connectCef, 1500);
      return;
    }
    cefWs.binaryType = 'arraybuffer';
    cefWs.onmessage = onMessage;
    cefWs.onerror = () => {};
    cefWs.onclose = () => {
      cefWs = null;
      if ([...items.values()].some((x) => x.backend === 'cef' && !x.stopped)) timer = setTimeout(connectCef, 1500);
    };
  }

  async function cefAvailable() {
    if (cefOk !== null) return cefOk;
    try {
      const r = await api('/cef/status');
      cefOk = !!r?.available;
    } catch { cefOk = false; }
    return cefOk;
  }

  function onMessage(ev) {
    if (typeof ev.data === 'string') {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'status') {
        const item = findKey(m.key);
        if (item && m.error) toast(`Browser: ${m.error}`, 'err');
        if (item) item.status = m;
      }
      return;
    }
    const u8 = new Uint8Array(ev.data);
    if (!u8.length) return;
    if (u8[0] === 0) {
      const kl = u8[1];
      const item = findKey(new TextDecoder().decode(u8.subarray(2, 2 + kl)));
      if (item) playPcm(item, u8.slice(2 + kl));
      return;
    }
    const kl = u8[0];
    const item = findKey(new TextDecoder().decode(u8.subarray(1, 1 + kl)));
    if (!item) return;
    item.pending = new Blob([u8.subarray(1 + kl)], { type: 'image/jpeg' });
    pump(item);
  }

  async function pump(item) {
    if (item.decoding) return;
    item.decoding = true;
    try {
      while (item.pending && !item.stopped) {
        const blob = item.pending;
        item.pending = null;
        const pic = await decodeFrame(blob);
        if (item.stopped) { pic.close?.(); break; }
        const { ctx, canvas, track } = item;
        if (canvas.width !== pic.width || canvas.height !== pic.height) {
          // o servidor pode ajustar o viewport; mantém o canvas no tamanho atual da mesa
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          const sc = Math.min(w / pic.width, h / pic.height);
          const dw = pic.width * sc;
          const dh = pic.height * sc;
          ctx.drawImage(pic.image, (w - dw) / 2, (h - dh) / 2, dw, dh);
        } else {
          ctx.drawImage(pic.image, 0, 0);
        }
        pic.close?.();
        try { track.requestFrame(); } catch {}
        item.frames++;
      }
    } catch {
    } finally {
      item.decoding = false;
      if (item.pending && !item.stopped) pump(item);
    }
  }

  async function decodeFrame(blob) {
    if (typeof ImageDecoder !== 'undefined') {
      try {
        const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: 'image/jpeg' });
        const { image } = await decoder.decode();
        return {
          image,
          width: image.displayWidth,
          height: image.displayHeight,
          close: () => { try { image.close(); } catch {} try { decoder.close(); } catch {} },
        };
      } catch {}
    }
    const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    return { image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() };
  }

  function playPcm(item, bytes) {
    const ctx = mixer.ctx;
    if (!ctx || bytes.byteLength < 4) return;
    if (!item.audio) {
      const gain = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();
      gain.connect(dest);
      item.audio = { gain, dest, next: 0 };
      mixer.addStream(`${item.id}:audio`, dest.stream, {
        ownerId: 'host',
        stageKey: item.id,
        monitor: true,
      });
    }
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
    const n = pcm.length >> 1;
    if (!n) return;
    const buf = ctx.createBuffer(2, n, 48000);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    for (let i = 0; i < n; i++) {
      L[i] = pcm[2 * i] / 32768;
      R[i] = pcm[2 * i + 1] / 32768;
    }
    const a = item.audio;
    const now = ctx.currentTime;
    if (!a.next || a.next < now + 0.02 || a.next > now + 0.6) a.next = now + 0.12;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(a.gain);
    src.start(a.next);
    a.next += buf.duration;
  }

  function persist() {
    S.brand.browserSources = [...items.values()]
      .filter((x) => !x.stopped)
      .map((x) => ({ id: x.id, label: x.label, url: x.url, adblock: x.adblock !== false }));
    saveStudio();
  }

  async function create({ label, url, id = '', adblock = true } = {}) {
    const p = preset();
    const max = p.width >= 3840 ? 1 : 2;
    if (items.size >= max) throw new Error(max === 1 ? 'No 4K, use apenas 1 Browser por vez.' : 'Máximo de 2 Browsers simultâneos.');
    url = String(url || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('Use um endereço começando com http:// ou https://');
    const bid = String(id || `${Date.now().toString(36)}${(seq++).toString(36)}`).replace(/[^\w.-]/g, '').slice(0, 32);
    const key = keyOf(bid);
    if (items.has(key)) return items.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = p.width;
    canvas.height = p.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const item = {
      id: `browser:${bid}`,
      key,
      bid,
      label: String(label || 'Browser').slice(0, 80),
      url,
      adblock: adblock !== false,
      canvas,
      ctx,
      stream,
      track,
      pending: null,
      decoding: false,
      frames: 0,
      stopped: false,
      audio: null,
    };
    items.set(key, item);
    addVideoSource(item.id, stream, { kind: 'browser', label: item.label, ownerId: 'host' });
    try { track.requestFrame(); } catch {}
    let backend = 'dsk';
    if (await cefAvailable()) {
      try {
        await api(`/cef/${encodeURIComponent(key)}`, {
          method: 'PUT',
          body: { url, width: p.width, height: p.height, fps: 60, lang: locale(), adblock: item.adblock },
        });
        backend = 'cef';
        connectCef();
      } catch {}
    }
    item.backend = backend;
    if (backend === 'dsk') {
      connect();
      try {
        await api(`/dsk/${encodeURIComponent(key)}`, {
          method: 'PUT',
          body: { url, width: p.width, height: p.height, jpeg: true, fps: p.fps, quality: 72, force: true },
        });
      } catch (e) {
        stop(item.id, { remove: true });
        throw e;
      }
    }
    persist();
    toast('Browser adicionado. A página aparece assim que o servidor renderizar.', 'ok');
    return item;
  }

  function stop(id, { remove = true } = {}) {
    const item = [...items.values()].find((x) => x.id === id || x.bid === id);
    if (!item || item.stopped) return;
    item.stopped = true;
    items.delete(item.key);
    try { item.track?.stop(); } catch {}
    try { item.stream?.getTracks().forEach((t) => t.stop()); } catch {}
    if (item.audio) {
      try { item.audio.gain.disconnect(); } catch {}
      try { item.audio.dest.disconnect(); } catch {}
    }
    api(`/${item.backend === 'cef' ? 'cef' : 'dsk'}/${encodeURIComponent(item.key)}`, { method: 'DELETE' }).catch(() => {});
    mixer.remove(`${item.id}:audio`);
    if (remove) removeSource(item.id);
    if (!items.size) {
      clearTimeout(timer);
      try { ws?.close(); } catch {}
      ws = null;
      try { cefWs?.close(); } catch {}
      cefWs = null;
    }
    persist();
  }

  async function openDialog() {
    const p = preset();
    const r = await modal(
      `<h3>Browser — página ao vivo</h3>
       <p class="sub">O servidor usa o BrowserHost CEF local quando disponível (vídeo via shared texture); sem ele, usa o Edge headless. No CEF, vídeo, clique/texto e áudio da página já são nativos.</p>
       <label class="field"><span>Nome</span><input class="input" id="br-label" maxlength="80" placeholder="Painel do jogo"></label>
       <label class="field"><span>URL</span><input class="input" id="br-url" inputmode="url" placeholder="https://exemplo.com/painel"></label>
       <label class="checkrow" style="margin:0 0 12px"><input type="checkbox" id="br-adblock" checked><span>Bloquear anúncios e rastreadores (recomendado)</span></label>

       <p class="hint">Renderização ${p.width}×${p.height} @ ${p.fps} fps, seguindo o preset da mesa. Áudio da página entra no Mixer quando disponível.</p>
       <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" data-add>Adicionar Browser</button></div>`,
      {
        sticky: true,
        onMount(m, close) {
          const url = m.querySelector('#br-url');
          const label = m.querySelector('#br-label');
          const adblock = m.querySelector('#br-adblock');
          const go = async () => {
            const u = url.value.trim();
            if (!/^https?:\/\//i.test(u)) return toast('Informe uma URL http(s).', 'err');
            const btn = m.querySelector('[data-add]');
            btn.disabled = true;
            btn.textContent = 'Abrindo…';
            try {
              await create({ label: label.value.trim() || 'Browser', url: u, adblock: adblock.checked });
              close(true);
            } catch (e) {
              toast('Browser: ' + e.message, 'err');
              btn.disabled = false;
              btn.textContent = 'Adicionar Browser';
            }
          };
          m.querySelector('[data-add]').onclick = go;
          url.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        },
      },
    );
    return r === true;
  }

  async function restore() {
    const list = Array.isArray(S.brand.browserSources) ? S.brand.browserSources : [];
    for (const b of list.slice(0, 2)) {
      try { await create({ label: b.label, url: b.url, id: b.id, adblock: b.adblock !== false }); } catch {}
    }
  }

  function applyPreset(p) {
    for (const item of items.values()) {
      if (item.stopped) continue;
      item.canvas.width = p.width;
      item.canvas.height = p.height;
      item.ctx.fillStyle = '#000';
      item.ctx.fillRect(0, 0, p.width, p.height);
      item.pending = null;
      item.frames = 0;
      api(`/${item.backend === 'cef' ? 'cef' : 'dsk'}/${encodeURIComponent(item.key)}`, {
        method: 'PUT',
        body: item.backend === 'cef'
          ? { url: item.url, width: p.width, height: p.height, fps: 60, lang: locale(), adblock: item.adblock }
          : { url: item.url, width: p.width, height: p.height, jpeg: true, fps: p.fps, quality: 72, force: true },
      }).catch(() => {});
    }
  }

  function sendInput(item, ev) {
    const socket = item.backend === 'cef' ? cefWs : ws;
    if (!socket || socket.readyState !== 1) return;
    try { socket.send(JSON.stringify({ type: 'input', key: item.key, slot: item.key, ev })); } catch {}
  }

  async function toggleAdblock(item, on) {
    if (item.backend !== 'cef') return toast('Adblock disponível no backend CEF.', 'err');
    const next = !!on;
    await api('/cef/' + encodeURIComponent(item.key), {
      method: 'PUT',
      body: { url: item.url, width: item.canvas.width, height: item.canvas.height, fps: 60, lang: locale(), adblock: next },
    });
    item.adblock = next;
    persist();
    toast(next ? 'Adblock ativado.' : 'Adblock desativado.', 'ok');
  }

  async function navigate(id, url) {
    const item = [...items.values()].find((x) => x.id === id);
    if (!item) return false;
    const u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) throw new Error('Use uma URL http(s).');
    const p = preset();
    await api(`/${item.backend === 'cef' ? 'cef' : 'dsk'}/${encodeURIComponent(item.key)}`, {
      method: 'PUT',
      body: item.backend === 'cef'
        ? { url: u, width: item.canvas.width, height: item.canvas.height, fps: 60, lang: locale(), adblock: item.adblock }
        : { url: u, width: item.canvas.width, height: item.canvas.height, jpeg: true, fps: p.fps, quality: 72, force: true },
    });
    item.url = u;
    item.pending = null;
    persist();
    return true;
  }

  function openInteract(id) {
    const item = [...items.values()].find((x) => x.id === id);
    if (!item || item.stopped) return;
    let raf = 0;
    let closed = false;
    const stop = () => {
      closed = true;
      cancelAnimationFrame(raf);
    };
    modal(
      `<div class="browser-interact">
        <h3>${esc(item.label)}</h3>
        <p class="sub">Clique e navegue na página como no OBS. O teclado funciona quando a prévia está focada; use o campo de texto para digitar em campos da página.</p>
        <div class="browser-interact-bar">
          <input class="input" id="bi-url" value="${esc(item.url)}" spellcheck="false" aria-label="URL da página">
          <button class="btn sm primary" id="bi-go">Ir</button>
          <button class="btn sm" id="bi-reload">Recarregar</button>
          <button class="btn sm" id="bi-adblock" title="Ativar/desativar adblock">Adblock: ON</button>

        </div>
        <canvas id="bi-canvas" width="1280" height="720" tabindex="0" aria-label="Prévia interativa da página"></canvas>
        <div class="row" style="margin-top:8px">
          <input class="input grow" id="bi-text" placeholder="Digite um texto para a página e pressione Enter">
          <button class="btn sm" id="bi-send">Enviar texto</button>
          <button class="btn sm danger" id="bi-del">Excluir Browser</button>
        </div>
      </div>`,
      {
        sticky: true,
        onMount(m, close) {
          const cv = m.querySelector('#bi-canvas');
          const ctx = cv.getContext('2d');
          const draw = () => {
            if (closed || !cv.isConnected) return;
            if (item.canvas.width && item.canvas.height) {
              const cw = cv.width;
              const ch = cv.height;
              const sc = Math.min(cw / item.canvas.width, ch / item.canvas.height);
              const dw = item.canvas.width * sc;
              const dh = item.canvas.height * sc;
              ctx.fillStyle = '#111';
              ctx.fillRect(0, 0, cw, ch);
              ctx.drawImage(item.canvas, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
            }
            raf = requestAnimationFrame(draw);
          };
          draw();
          const pos = (e) => {
            const r = cv.getBoundingClientRect();
            const sc = Math.min(cv.width / item.canvas.width, cv.height / item.canvas.height);
            const dw = item.canvas.width * sc;
            const dh = item.canvas.height * sc;
            const ox = (cv.width - dw) / 2;
            const oy = (cv.height - dh) / 2;
            return {
              x: Math.max(0, Math.min(item.canvas.width, ((e.clientX - r.left) * cv.width / r.width - ox) / sc)),
              y: Math.max(0, Math.min(item.canvas.height, ((e.clientY - r.top) * cv.height / r.height - oy) / sc)),
            };
          };
          let down = false;
          cv.addEventListener('pointerdown', (e) => {
            down = true;
            cv.focus();
            cv.setPointerCapture?.(e.pointerId);
            const p = pos(e);
            sendInput(item, { kind: 'mouse', type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
            e.preventDefault();
          });
          cv.addEventListener('pointerup', (e) => {
            if (!down) return;
            down = false;
            const p = pos(e);
            sendInput(item, { kind: 'mouse', type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
            e.preventDefault();
          });
          cv.addEventListener('pointermove', (e) => {
            if (!down) return;
            const p = pos(e);
            sendInput(item, { kind: 'mouse', type: 'mouseMoved', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 0 });
          });
          cv.addEventListener('wheel', (e) => {
            const p = pos(e);
            const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
            sendInput(item, { kind: 'mouse', type: 'mouseWheel', x: p.x, y: p.y, button: 'none', deltaX: e.deltaX * unit, deltaY: e.deltaY * unit });
            e.preventDefault();
          }, { passive: false });
          cv.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') return;
            const text = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey ? e.key : '';
            sendInput(item, {
              kind: 'key', type: text ? 'keyDown' : 'rawKeyDown', key: e.key, code: e.code,
              keyCode: e.keyCode, text, mods: (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0),
            });
            e.preventDefault();
          });
          cv.addEventListener('keyup', (e) => {
            sendInput(item, { kind: 'key', type: 'keyUp', key: e.key, code: e.code, keyCode: e.keyCode, mods: 0 });
            e.preventDefault();
          });
          const sendText = () => {
            const t = m.querySelector('#bi-text').value;
            if (!t) return;
            sendInput(item, { kind: 'text', text: t });
            m.querySelector('#bi-text').value = '';
          };
          m.querySelector('#bi-send').onclick = sendText;
          m.querySelector('#bi-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendText(); } });
          m.querySelector('#bi-go').onclick = async () => {
            try {
              await navigate(item.id, m.querySelector('#bi-url').value);
              toast('URL atualizada.', 'ok');
            } catch (e) { toast('Browser: ' + e.message, 'err'); }
          };
          const ab = m.querySelector('#bi-adblock');
          const syncAb = () => { ab.textContent = 'Adblock: ' + (item.adblock === false ? 'OFF' : 'ON'); ab.classList.toggle('primary', item.adblock !== false); if (item.backend !== 'cef') { ab.disabled = true; ab.title = 'Adblock disponível no backend CEF'; } };
          syncAb();
          ab.onclick = () => toggleAdblock(item, item.adblock === false).then(syncAb).catch((e) => toast('Browser: ' + e.message, 'err'));
          m.querySelector('#bi-reload').onclick = () => api(`/dsk/${encodeURIComponent(item.key)}/reload`, { method: 'POST' }).catch((e) => toast('Browser: ' + e.message, 'err'));
          m.querySelector('#bi-del').onclick = () => { stop(); close(true); removeSource(item.id); };
          const mo = new MutationObserver(() => {
            if (!cv.isConnected) { stop(); mo.disconnect(); }
          });
          mo.observe(document.body, { childList: true, subtree: true });
        },
      },
    );
  }

  return { openDialog, create, stop, restore, applyPreset, openInteract, items };
}
