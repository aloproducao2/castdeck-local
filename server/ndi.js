// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// NDI Output: WebM do estúdio -> FFmpeg (UYVY + f32le) -> bridge Rust -> NDI.
//
// O navegador envia o programStream por um WebSocket local. O FFmpeg deste
// processo decodifica uma vez e entrega dois fluxos crus; o bridge NDI não
// recodifica nada, só envia os quadros ao SDK.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { videoEncoderArgs } from './ffmpeg.js';

const MAX_W = 3840;
const MAX_H = 2160;

function clamp(v, min, max, fallback) {
  const n = Math.round(+v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

export function findNdiBridge(root, env = process.env, runtimeDir = '') {
  const candidates = [
    env.NDI_BRIDGE_PATH,
    // no app empacotado, este é o caminho executável de verdade; o snapshot do pkg não executa .exe.
    path.join(path.dirname(process.execPath), 'castdeck-ndi.exe'),
    path.join(root, 'native', 'ndi-bridge', 'target', 'release', 'castdeck-ndi.exe'),
    path.join(root, 'native', 'ndi-bridge', 'target', 'debug', 'castdeck-ndi.exe'),
    path.join(root, 'build', 'vendor', 'win-x64', 'castdeck-ndi.exe'),
    path.join(root, 'build', 'vendor', 'ndi-bridge', 'win-x64', 'castdeck-ndi.exe'),
    path.join(root, 'vendor', 'win-x64', 'castdeck-ndi.exe'),
    path.join(root, 'bin', 'castdeck-ndi.exe'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (!fs.statSync(p).isFile()) continue;
      // O pkg não executa um .exe de dentro do snapshot: extrai para uma pasta real e executa de lá.
      if (runtimeDir && (/[\\\/]snapshot[\\\/]/i.test(p) || /app\.asar/i.test(p))) {
        fs.mkdirSync(runtimeDir, { recursive: true });
        const dest = path.join(runtimeDir, 'castdeck-ndi.exe');
        if (!fs.existsSync(dest) || fs.statSync(dest).size !== fs.statSync(p).size) fs.copyFileSync(p, dest);
        return dest;
      }
      return p;
    } catch {}
  }
  return '';
}

export class NdiOutputServer {
  constructor({ root, ffmpegPath, logger = console, binDir = '' } = {}) {
    this.root = root;
    this.ffmpegPath = ffmpegPath || 'ffmpeg';
    this.bridgePath = findNdiBridge(root, process.env, binDir);
    this.logger = logger;
    this.sessions = new Set();
  }

  status() {
    return { available: !!this.bridgePath, bridge: this.bridgePath, outputs: this.sessions.size };
  }

  stopAll() {
    for (const s of [...this.sessions]) {
      try { s.ws?.close(); } catch {}
      try { s.bridge?.stdin?.end(); } catch {}
      try { s.ff?.stdin?.end(); } catch {}
      try { s.bridge?.kill(); } catch {}
      try { s.ff?.kill('SIGKILL'); } catch {}
    }
    this.sessions.clear();
  }

  attach(ws) {
    let session = null;
    let stopping = false;

    const send = (obj) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(obj));
    };
    const fail = (message) => {
      send({ type: 'error', message });
      try { ws.close(); } catch {}
    };

    const stop = (reason = '') => {
      if (stopping) return;
      stopping = true;
      if (session) {
        this.sessions.delete(session);
        try { session.bridge?.stdin?.end(); } catch {}
        try { session.ff?.stdin?.end(); } catch {}
        setTimeout(() => {
          try { session.bridge?.kill(); } catch {}
          try { session.ff?.kill('SIGKILL'); } catch {}
        }, 500);
      }
      if (reason) this.logger.warn?.(`[ndi-output] ${reason}`);
    };

    const start = (msg) => {
      if (session) return fail('Saída NDI já iniciada');
      if (!this.bridgePath) return fail('Bridge NDI não encontrado. Compile native/ndi-bridge.');
      const width = clamp(msg.width, 64, MAX_W, 1280);
      const height = clamp(msg.height, 64, MAX_H, 720);
      const fps = clamp(msg.fps, 1, 120, 30);
      const name = String(msg.name || 'CastDeck Local').slice(0, 100);
      // FFmpeg decodifica o WebM (pipe:0) e entrega vídeo cru em stdout e áudio em fd 3.
      const ffArgs = [
        '-hide_banner', '-loglevel', 'error', '-nostats',
        '-fflags', 'nobuffer', '-flags', 'low_delay',
        '-i', 'pipe:0',
        '-map', '0:v:0', '-f', 'rawvideo', '-pix_fmt', 'uyvy422', '-s', `${width}x${height}`, 'pipe:1',
        '-map', '0:a:0', '-f', 'f32le', '-ar', '48000', '-ac', '2', 'pipe:3',
      ];
      const ff = spawn(this.ffmpegPath, ffArgs, { stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
      const bridge = spawn(this.bridgePath, ['send-raw', name, String(width), String(height), String(fps)], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      for (const st of [ff.stdin, ff.stdout, ff.stdio[3], bridge.stdin, bridge.stdout, bridge.stderr]) st?.on('error', () => {});
      session = { ws, ff, bridge, width, height, fps, name, videoBuf: Buffer.alloc(0), frameBytes: width * height * 2, started: false };
      this.sessions.add(session);

      ff.on('error', (e) => { send({ type: 'error', message: 'FFmpeg: ' + e.message }); stop(); });
      bridge.on('error', (e) => { send({ type: 'error', message: 'Bridge NDI: ' + e.message }); stop(); });
      ff.stderr.on('data', (d) => { const s = String(d).trim(); if (s) this.logger.warn?.('[ndi-ffmpeg] ' + s.slice(-300)); });
      bridge.stderr.on('data', (d) => { const s = String(d).trim(); if (s) this.logger.warn?.('[ndi-bridge] ' + s.slice(-300)); });
      bridge.stdout.on('data', (d) => {
        const s = String(d);
        if (!session.started && s.includes('NDI_READY')) {
          session.started = true;
          send({ type: 'started', name, width, height, fps });
        }
      });
      ff.on('exit', (code) => {
        if (session && !stopping) send({ type: 'error', message: `FFmpeg encerrou (${code})` });
        stop('ffmpeg exit');
        try { ws.close(); } catch {}
      });
      bridge.on('exit', (code) => {
        if (session && !stopping) send({ type: 'error', message: `Bridge NDI encerrou (${code})` });
        stop('bridge exit');
        try { ws.close(); } catch {}
      });

      // stdin do bridge: [V][len u32][UYVY] / [A][len u32][f32le]
      const frame = (type, data) => {
        const head = Buffer.allocUnsafe(5);
        head[0] = type;
        head.writeUInt32LE(data.length, 1);
        try {
          bridge.stdin.write(head);
          bridge.stdin.write(data);
        } catch {}
      };

      ff.stdio[3].on('data', (d) => {
        if (!session || stopping) return;
        frame(0x41, d);
      });
      ff.stdout.on('data', (d) => {
        if (!session || stopping) return;
        const { frameBytes } = session;
        session.videoBuf = session.videoBuf.length ? Buffer.concat([session.videoBuf, d]) : d;
        while (session.videoBuf.length >= frameBytes) {
          frame(0x56, session.videoBuf.subarray(0, frameBytes));
          session.videoBuf = session.videoBuf.subarray(frameBytes);
        }
        if (session.videoBuf.length > frameBytes * 4) session.videoBuf = Buffer.alloc(0);
      });
    };

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (!session || !session.ff.stdin.writable) return;
        try { session.ff.stdin.write(data); } catch {}
        return;
      }
      let msg;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (msg?.type === 'start') start(msg);
      else if (msg?.type === 'stop') stop('client stop');
    });
    ws.on('close', () => stop('ws close'));
    ws.on('error', () => stop('ws error'));
  }
}

// NDI Source: bridge Rust -> quadros UYVY/BGRA + f32le -> FFmpeg -> MediaMTX/WHEP.
export class NdiSourceServer {
  constructor({ root, ffmpegPath, ingest, logger = console, binDir = '' } = {}) {
    this.root = root;
    this.ffmpegPath = ffmpegPath || 'ffmpeg';
    this.ingest = ingest;
    this.logger = logger;
    this.bridgePath = findNdiBridge(root, process.env, binDir);
    this.sessions = new Map();
  }

  status() {
    return { available: !!this.bridgePath, active: this.sessions.size };
  }

  active() {
    return [...this.sessions.values()].map((s) => ({ key: s.key, ndiName: s.ndiName }));
  }

  // Entradas NDI órfãs (de uma sessão anterior que fechou sem limpar) apareciam como
  // "Sem sinal" e travavam novas adições. Remove as que não têm processo ativo.
  pruneStale() {
    if (!this.ingest) return;
    const activeKeys = new Set(this.sessions.keys());
    for (const s of this.ingest.info().sources || []) {
      if (/^NDI\b/i.test(s.name || '') && !activeKeys.has(s.key)) {
        try { this.ingest.removeSource(s.key); } catch {}
      }
    }
  }

  listSources() {
    return new Promise((resolve) => {
      if (!this.bridgePath) return resolve([]);
      const p = spawn(this.bridgePath, ['list'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const timer = setTimeout(() => { try { p.kill(); } catch {} resolve([]); }, 5000);
      p.stdout.on('data', (d) => { out += String(d); });
      p.stderr.on('data', (d) => { err += String(d); });
      p.on('close', () => {
        clearTimeout(timer);
        try {
          const line = out.trim().split('\n').filter(Boolean).pop() || '{}';
          const data = JSON.parse(line);
          resolve(Array.isArray(data.sources) ? data.sources : []);
        } catch {
          if (err) this.logger.warn?.('[ndi] list: ' + err.trim().slice(-200));
          resolve([]);
        }
      });
      p.on('error', () => { clearTimeout(timer); resolve([]); });
    });
  }

  async start(name, url = '') {
    if (!this.bridgePath) throw new Error('Bridge NDI não encontrado. Compile native/ndi-bridge.');
    if (!this.ingest) throw new Error('MediaMTX não está disponível.');
    if ([...this.sessions.values()].some((s) => s.ndiName === name)) throw new Error('Esta fonte NDI já está adicionada.');
    await this.ingest.setEnabled(true);
    this.pruneStale();
    const src = this.ingest.addSource('NDI · ' + String(name).slice(0, 60));
    const key = src.key;
    // Confirma o caminho via API, mas não espera segundos: o FFmpeg reconecta se o
    // publisher ainda não estiver ativo. A URL descoberta evita outro finder de ~1 s.
    try { await this.ingest.apiPath?.('add', key); } catch {}
    await new Promise((r) => setTimeout(r, 120));
    // Publica direto em SRT (H.264 + Opus): o MediaMTX não precisa criar o caminho
    // _web, então o vídeo entra no WHEP sem a conversão de áudio e sem outro FFmpeg.
    const srt = `srt://127.0.0.1:${this.ingest.info().ports.srt || 8890}?streamid=publish:${key}&latency=100000&pkt_size=1316`;
    const bridgeArgs = ['extract', name];
    if (url) bridgeArgs.push(url);
    const session = { key, ndiName: name, bridge: null, ff: null, stopped: false, frameBytes: 0, meta: null, retries: 0, pacer: null, latest: null, bridgeTimer: null };
    this.sessions.set(key, session);
    let buf = Buffer.alloc(0);
    let metaPromise;
    const waitMeta = new Promise((resolve, reject) => {
      metaPromise = { resolve, reject };
      setTimeout(() => reject(new Error('A fonte NDI não entregou vídeo em 10 s.')), 10000).unref?.();
    });

    const spawnFfmpeg = (meta) => {
      const [w, h, n, d, fourcc] = meta;
      // 1095911234 = BGRA; 1498831189 = UYVY. O extract respeita o FourCC entregue pelo NDI.
      const fmt = fourcc === 1095911234 ? 'bgra' : 'uyvy422';
      // Alguns NDI (ex.: Test Patterns em 1 fps) anunciam 30 fps mas entregam bem menos.
      // O FFmpeg recebe um fluxo CFR de 30 fps com repetição do último quadro; o MediaMTX
      // precisa desse ritmo para manter o publisher vivo.
      // Alguns NDI entregam larguras que não são múltiplas de 16 (ex.: 1774×886 do
      // Test Patterns redimensionado). O decoder H.264 do WebRTC pode mostrar
      // tearing/ruído nessas dimensões. Em vez de escalar todo mundo para 1080p
      // (caro), só completa até múltiplo de 4 — o suficiente para 4:2:0.
      const padW = w + ((4 - (w % 4)) % 4);
      const padH = h + ((4 - (h % 4)) % 4);
      const filter = (padW !== w || padH !== h)
        ? `pad=${padW}:${padH}:${Math.floor((padW - w) / 2)}:${Math.floor((padH - h) / 2)}:black`
        : '';
      const encoder = this.ingest.encoder?.().id || 'libx264';
      const fps = Math.min(30, Math.max(5, Math.round(fpsOf(n, d)) || 30));
      session.frameBytes = w * h * (fmt === 'bgra' ? 4 : 2);
      session.gen = (session.gen || 0) + 1;
      const gen = session.gen;
      if (session.ff) {
        const old = session.ff;
        session.ff = null;
        try { old.removeAllListeners('exit'); } catch {}
        try { old.stdin?.end(); } catch {}
        try { old.kill('SIGKILL'); } catch {}
      }
      if (session.pacer) clearInterval(session.pacer);
      const vargs = videoEncoderArgs(encoder, 6000, fps, 1);
      const args = [
        '-hide_banner', '-loglevel', 'error', '-nostats',
        '-fflags', 'nobuffer', '-flags', 'low_delay',
        '-f', 'rawvideo', '-pix_fmt', fmt, '-video_size', `${w}x${h}`, '-framerate', `${fps}/1`, '-i', 'pipe:0',
        '-f', 'f32le', '-ar', '48000', '-ac', '2', '-i', 'pipe:3',
      ];
      if (filter) args.push('-vf', filter);
      args.push(
        ...vargs, '-pix_fmt', 'yuv420p',
        '-c:a', 'libopus', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-f', 'mpegts', '-flush_packets', '1', srt,
      );
      const ff = spawn(this.ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe', 'pipe'] });
      session.ff = ff;
      session.latest = null;
      if (session.pacer) clearInterval(session.pacer);
      session.pacer = setInterval(() => {
        if (session.stopped || session.ff !== ff || !session.latest || ff.stdin.destroyed) return;
        try { ff.stdin.write(session.latest); } catch {}
      }, Math.max(10, Math.round(1000 / fps)));
      // Acelera a conversão _web do MediaMTX sem esperar o próximo poll de 1,5 s.
      const kickPoll = () => { if (!session.stopped) Promise.resolve(this.ingest.poll?.()).catch(() => {}); };
      const kickTimer = setInterval(kickPoll, 250);
      setTimeout(() => clearInterval(kickTimer), 5000);
      for (const s of [ff.stdin, ff.stderr, ff.stdio[3]]) s?.on('error', () => {});
      ff.stderr.on('data', (x) => { const s = String(x).trim(); if (s) this.logger.warn?.('[ndi-source-ffmpeg] ' + s.slice(-300)); });
      ff.on('error', (e) => {
        if (session.stopped || gen !== session.gen) return;
        this.logger.warn?.('[ndi-source] ffmpeg: ' + e.message);
        session.retries++;
        const delay = session.retries <= 3 ? 1200 : 5000;
        setTimeout(() => { if (!session.stopped && gen === session.gen) spawnFfmpeg(meta); }, delay);
      });
      ff.on('exit', (code) => {
        if (session.stopped || gen !== session.gen) return;
        session.retries++;
        const delay = session.retries <= 3 ? 1200 : 5000;
        this.logger.warn?.(`[ndi-source] ffmpeg saiu (${code}); reconectando em ${delay} ms`);
        session.ff = null;
        setTimeout(() => { if (!session.stopped && gen === session.gen) spawnFfmpeg(meta); }, delay);
      });
    };

    const feed = (type, data) => {
      if (!session.ff || session.stopped) return;
      try {
        if (type === 'V') session.latest = data;
        else if (!session.ff.stdio[3].destroyed) session.ff.stdio[3].write(data);
      } catch {}
    };

    const onBridgeData = (d) => {
      if (session.stopped) return;
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      if (!session.meta) {
        const nl = buf.indexOf(10);
        if (nl < 0) return;
        const line = buf.subarray(0, nl).toString();
        buf = buf.subarray(nl + 1);
        const parts = line.trim().split(/\s+/);
        if (parts[0] !== 'META' || parts.length < 6) { metaPromise.reject(new Error('metadados NDI inválidos')); return; }
        session.meta = parts.slice(1, 6).map(Number);
        this.logger.log?.('[ndi-source] meta', session.meta, 'key', key);
        spawnFfmpeg(session.meta);
        metaPromise.resolve(session.meta);
      }
      while (buf.length >= 5) {
        const code = buf[0];
        const type = code === 0x56 ? 'V' : code === 0x41 ? 'A' : code === 0x4d ? 'M' : '';
        if (!type) { buf = Buffer.alloc(0); return; }
        const len = buf.readUInt32LE(1);
        if (buf.length < 5 + len) return;
        const payload = buf.subarray(5, 5 + len);
        buf = buf.subarray(5 + len);
        if (type === 'M') {
          const parts = payload.toString().trim().split(/\s+/).map(Number);
          if (parts.length >= 5 && parts.every(Number.isFinite)) {
            session.meta = parts.slice(0, 5);
            session.retries = 0;
            this.logger.log?.('[ndi-source] resolução mudou', session.meta, 'key', key);
            spawnFfmpeg(session.meta);
          }
        } else {
          feed(type, payload);
        }
      }
    };

    const scheduleBridge = () => {
      if (session.stopped || session.bridgeTimer) return;
      session.bridgeTimer = setTimeout(() => {
        session.bridgeTimer = null;
        if (!session.stopped) spawnBridge();
      }, 1500);
    };

    const spawnBridge = () => {
      if (session.stopped) return;
      buf = Buffer.alloc(0);
      session.meta = null;
      session.latest = null;
      const b = spawn(this.bridgePath, bridgeArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      session.bridge = b;
      for (const s of [b.stdout, b.stderr]) s?.on('error', () => {});
      b.stdout.on('data', onBridgeData);
      b.stderr.on('data', (d) => { const s = String(d).trim(); if (s) this.logger.warn?.('[ndi-source-bridge] ' + s.slice(-300)); });
      b.on('error', (e) => {
        if (session.stopped || session.bridge !== b) return;
        this.logger.warn?.('[ndi-source] bridge: ' + e.message);
        scheduleBridge();
      });
      b.on('exit', (code) => {
        if (session.stopped || session.bridge !== b) return;
        this.logger.warn?.(`[ndi-source] bridge saiu (${code}); reconectando`);
        scheduleBridge();
      });
    };

    spawnBridge();

    try {
      await waitMeta;
    } catch (e) {
      this.stop(key);
      throw e;
    }
    return { key, name: src.name, ndiName: name, live: !!session.meta };
  }

  stop(key) {
    const s = this.sessions.get(key);
    if (!s || s.stopped) return false;
    s.stopped = true;
    this.sessions.delete(key);
    if (s.bridgeTimer) clearTimeout(s.bridgeTimer);
    if (s.pacer) clearInterval(s.pacer);
    try { s.bridge?.stdin?.end(); } catch {}
    setTimeout(() => { try { s.bridge?.kill(); } catch {} }, 200);
    try { s.ff?.stdin?.end(); } catch {}
    setTimeout(() => { try { s.ff?.kill('SIGKILL'); } catch {} }, 500);
    try { this.ingest?.removeSource(key); } catch {}
    return true;
  }

  stopAll() {
    for (const key of [...this.sessions.keys()]) this.stop(key);
    this.pruneStale();
  }
}

function fpsOf(n, d) {
  return d ? n / d : 30;
}
