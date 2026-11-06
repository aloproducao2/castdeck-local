// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// NDI Output: o navegador envia o programa por WebSocket local; o servidor
// decodifica uma vez e entrega os quadros crus ao bridge Rust.
import { pickMime } from './broadcaster.js';

export function createNdiOutput({ onStatus } = {}) {
  let ws = null;
  let recorder = null;
  let running = false;
  let wanted = false;
  let lastCfg = null;
  let retryTimer = null;

  const status = (state, detail = '') => onStatus?.({ state, detail });

  function cleanup() {
    running = false;
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
    recorder = null;
    const old = ws;
    ws = null;
    try { if (old && old.readyState === 1) old.close(); } catch {}
  }

  function scheduleRestart() {
    if (!wanted || !lastCfg || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (!wanted || !lastCfg) return;
      start(lastCfg).catch(() => { if (wanted) scheduleRestart(); });
    }, 1500);
  }

  function start(cfg) {
    const { stream, width, height, fps, name } = cfg;
    if (running) return Promise.reject(new Error('A saída NDI já está ligada.'));
    const mime = pickMime();
    if (!mime) return Promise.reject(new Error('Este navegador não suporta MediaRecorder WebM.'));
    wanted = true;
    lastCfg = cfg;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (e) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      };
      const socket = new WebSocket(`ws://${location.host}/ndi/output`);
      ws = socket;
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        if (ws !== socket) return;
        socket.send(JSON.stringify({ type: 'start', width, height, fps, name }));
      };
      socket.onerror = () => fail(new Error('Não foi possível conectar ao servidor NDI local.'));
      socket.onclose = () => {
        if (ws !== socket) return;
        const wasLive = running;
        cleanup();
        if (wanted) {
          status('reconnecting', wasLive ? 'NDI reconectando…' : 'NDI reconectando…');
          scheduleRestart();
        } else if (settled && wasLive) {
          status('error', 'Conexão NDI encerrada.');
        }
      };
      socket.onmessage = (e) => {
        if (ws !== socket) return;
        let msg;
        try { msg = JSON.parse(String(e.data)); } catch { return; }
        if (msg.type === 'started') {
          if (settled) return;
          settled = true;
          try {
            recorder = new MediaRecorder(stream, {
              mimeType: mime,
              videoBitsPerSecond: 20_000_000,
              audioBitsPerSecond: 192_000,
            });
            recorder.ondataavailable = (ev) => {
              if (!ev.data?.size || !ws || ws.readyState !== 1) return;
              ws.send(ev.data);
            };
            recorder.onerror = (ev) => {
              status('error', 'MediaRecorder: ' + (ev.error?.message || 'erro'));
              cleanup();
              if (wanted) scheduleRestart();
            };
            recorder.start(50);
            running = true;
            status('running', `${width}×${height} @ ${fps} fps`);
            resolve(msg);
          } catch (err) {
            fail(err);
          }
        } else if (msg.type === 'error') {
          if (!settled) fail(new Error(msg.message));
          else {
            status('error', msg.message);
            cleanup();
            if (wanted) scheduleRestart();
          }
        }
      };
    });
  }

  function stop() {
    wanted = false;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    if (!running) {
      cleanup();
      status('off', '');
      return;
    }
    running = false;
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch {}
    const old = ws;
    try { if (old?.readyState === 1) old.send(JSON.stringify({ type: 'stop' })); } catch {}
    setTimeout(cleanup, 150);
    status('off', '');
  }

  return {
    start,
    stop,
    get running() { return running; },
  };
}
