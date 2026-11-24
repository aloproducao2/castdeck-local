// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Playback quadro-a-quadro de um clipe WebM usando WebCodecs (VideoDecoder) desenhando em canvas.
// Suporta play, pause, seek, passo de quadro e velocidade negativa (reverse), com uma janela de
// quadros decodificados em memória (não guarda o clipe inteiro). O áudio (quando usado no motor)
// continua vindo do elemento <video> do playout; este módulo cuida só da imagem.
import { parseWebM } from './webm-demux.js';

export function createWcPlayout({ lookahead = 0.7, keepPast = 0.5 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d', { alpha: false });

  let samples = [];
  let duration = 0;
  let width = 0;
  let height = 0;
  let fps = 30;
  let decoder = null;
  const queue = []; // [{ ts (segundos), frame }] ordenado por ts
  let fed = 0;
  let playhead = 0;
  let speed = 1;
  let playing = false;
  let disposed = false;
  let raf = 0;
  let lastWall = 0;
  let draws = 0;
  let lastDrawn = null;
  let flushed = false;
  let loading = null;
  let onEndedCb = null;
  let onTimeCb = null;
  let onErrorCb = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const frameDur = () => 1 / Math.max(1, fps);

  function closeFrame(entry) {
    try {
      entry.frame.close();
    } catch {}
  }

  function dropBefore(minTs) {
    while (queue.length && queue[0].ts < minTs) closeFrame(queue.shift());
  }

  function pickFrame(t) {
    // último quadro com ts <= t
    let best = null;
    for (const e of queue) {
      if (e.ts <= t + 1e-6) best = e;
      else break;
    }
    return best || queue[0] || null;
  }

  function draw(entry) {
    if (!entry) return;
    const f = entry.frame;
    try {
      if (canvas.width !== f.displayWidth || canvas.height !== f.displayHeight) {
        canvas.width = width = f.displayWidth;
        canvas.height = height = f.displayHeight;
      }
      const sw = f.displayWidth;
      const sh = f.displayHeight;
      const scale = Math.min(canvas.width / sw, canvas.height / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(f, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
      draws++;
      lastDrawn = entry;
      if (onTimeCb) onTimeCb(playhead, duration);
    } catch {}
  }

  function feed() {
    if (!decoder || disposed) return;
    const horizon = (playhead + lookahead) * 1e6;
    while (fed < samples.length && samples[fed].timestamp <= horizon) {
      const s = samples[fed++];
      try {
        decoder.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.timestamp, data: s.data }));
      } catch (e) {
        onErrorCb?.(e);
        break;
      }
    }
    // final do clipe: flush único quando todos os samples foram enviados
    if (fed >= samples.length && decoder && !flushed) {
      flushed = true;
      decoder.flush().catch(() => {});
    }
  }

  function newDecoder() {
    const dec = new VideoDecoder({
      output: (frame) => {
        if (disposed) {
          try { frame.close(); } catch {}
          return;
        }
        const ts = frame.timestamp / 1e6;
        // insere ordenado (saída do decoder já é em ordem, mas garante)
        let i = queue.length;
        while (i > 0 && queue[i - 1].ts > ts) i--;
        queue.splice(i, 0, { ts, frame });
        dropBefore(playhead - keepPast);
      },
      error: (e) => onErrorCb?.(e),
    });
    dec.configure({ codec: samples.codec || 'vp8', codedWidth: width || 1280, codedHeight: height || 720, optimizeForLatency: true });
    return dec;
  }

  function resetDecoder(atTs) {
    try { decoder?.close(); } catch {}
    for (const e of queue.splice(0)) closeFrame(e);
    // acha o keyframe <= atTs
    let key = 0;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i].timestamp <= atTs * 1e6 + 1e-3) { if (samples[i].key) key = i; }
      else break;
    }
    fed = key;
    flushed = false;
    decoder = newDecoder();
    feed();
  }

  function loop(now) {
    if (disposed) return;
    const dt = lastWall ? Math.min(0.25, (now - lastWall) / 1000) : 0;
    lastWall = now;
    if (playing) {
      playhead = clamp(playhead + dt * speed, 0, duration);
      if (speed >= 0) {
        feed();
        if (playhead >= duration - 1e-3) {
          playing = false;
          const cb = onEndedCb;
          onEndedCb = null;
          if (cb) cb();
        }
      } else {
        // reverse: se a janela não tem mais quadros para trás, recua o keyframe e decodifica de novo
        if (!queue.length || queue[0].ts > playhead + 1e-3) {
          if (playhead > 0) {
            resetDecoder(Math.max(0, playhead - 2));
          }
        }
        if (playhead <= 1e-3) {
          playing = false;
          const cb = onEndedCb;
          onEndedCb = null;
          if (cb) cb();
        }
      }
    }
    const entry = pickFrame(playhead);
    if (entry && entry !== lastDrawn) draw(entry);
    raf = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (raf) return;
    lastWall = 0;
    raf = requestAnimationFrame(loop);
  }

  const api = {
    canvas,
    get currentTime() { return playhead; },
    set currentTime(v) { api.seek(Number(v) || 0); },
    get duration() { return duration; },
    get speed() { return speed; },
    get fps() { return fps; },
    get paused() { return !playing; },
    get ready() { return !!samples.length; },
    get drawnFrames() { return draws; },
    async load(url) {
      if (loading) return loading;
      loading = (async () => {
        const res = await fetch(url);
        if (!res.ok) throw new Error('clipe indisponível');
        const dem = parseWebM(new Uint8Array(await res.arrayBuffer()));
        samples = dem.video.samples || [];
        if (samples.length < 2) throw new Error('clipe sem quadros de vídeo');
        samples.codec = (dem.video.codec || 'V_VP8').toLowerCase().includes('vp9') ? 'vp9' : 'vp8';
        width = dem.video.width || 0;
        height = dem.video.height || 0;
        const last = samples[samples.length - 1].timestamp;
        const deltas = [];
        for (let i = 1; i < Math.min(samples.length, 61); i++) deltas.push(samples[i].timestamp - samples[i - 1].timestamp);
        deltas.sort((a, b) => a - b);
        const med = deltas.length ? deltas[Math.floor(deltas.length / 2)] : 33333;
        fps = clamp(Math.round(1e6 / Math.max(1000, med)), 1, 120);
        duration = Math.max(0.2, (last + med) / 1e6);
        resetDecoder(0);
        startLoop();
        return { duration, fps, width, height, frames: samples.length };
      })().catch((e) => {
        loading = null;
        throw e;
      });
      return loading;
    },
    play() {
      if (!samples.length) return;
      playing = true;
      startLoop();
    },
    pause() { playing = false; },
    setSpeed(s) {
      const v = Number(s) || 1;
      speed = Math.abs(v) < 1 ? (v < 0 ? -0.98 : 0.98) : clamp(v, -2, 2);
    },
    seek(t) {
      const v = clamp(Number(t) || 0, 0, duration);
      playhead = v;
      if (queue.length && queue[0].ts <= v && queue[queue.length - 1].ts >= v) {
        draw(pickFrame(v));
        return;
      }
      resetDecoder(v);
      // desenha o quadro disponível mais próximo assim que o decoder entregar
      const tryDraw = () => {
        if (disposed) return;
        const e = pickFrame(v);
        if (e) draw(e);
        else setTimeout(tryDraw, 20);
      };
      setTimeout(tryDraw, 30);
    },
    step(n) {
      const dir = Math.abs(n || 1);
      playing = false;
      const target = clamp(playhead + Math.sign(n || 1) * dir * frameDur(), 0, duration);
      api.seek(target);
      return target;
    },
    async waitFrame(timeout = 1200) {
      const t0 = performance.now();
      while (performance.now() - t0 < timeout) {
        if (queue.length) return true;
        await new Promise((r) => setTimeout(r, 20));
      }
      return false;
    },
    setCallbacks({ ended, time, error } = {}) {
      onEndedCb = ended || null;
      onTimeCb = time || null;
      onErrorCb = error || null;
    },
    dispose() {
      disposed = true;
      playing = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      try { decoder?.close(); } catch {}
      decoder = null;
      for (const e of queue.splice(0)) closeFrame(e);
      samples = [];
    },
  };
  // O compositor do estúdio espera um elemento de vídeo; o canvas se passa por um (como o
  // BLEND_OUTPUT do motor faz) para poder ser registrado como fonte 'replay:out'.
  try {
    Object.defineProperty(canvas, 'videoWidth', { get: () => canvas.width });
    Object.defineProperty(canvas, 'videoHeight', { get: () => canvas.height });
    Object.defineProperty(canvas, 'readyState', { get: () => (samples.length ? 2 : 0) });
    Object.defineProperty(canvas, 'paused', { get: () => !playing });
    Object.defineProperty(canvas, 'ended', { get: () => playhead >= duration - 1e-3 && !playing });
    Object.defineProperty(canvas, 'duration', { get: () => duration });
    Object.defineProperty(canvas, 'currentTime', {
      get: () => playhead,
      set: (v) => api.seek(v),
    });
    canvas.play = () => api.play();
    canvas.pause = () => api.pause();
    canvas.load = () => {};
    canvas.requestVideoFrameCallback = undefined;
  } catch {}
  api.wcPlayer = true;
  return api;
}
