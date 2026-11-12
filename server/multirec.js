// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
//
// Multigravação: cada fonte escolhida chega do estúdio como um WebM já codificado
// (MediaRecorder). Este módulo só grava os bytes em arquivos separados e mantém um
// manifesto. Não toca no broadcaster, no FFmpeg de transmissão nem na gravação atual.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { videoEncoderArgs } from './ffmpeg.js';

const MAX_SOURCES = 8;
const MIN_FREE_BYTES = 1024 * 1024 * 1024;
const MAX_SOURCE_BYTES = 30 * 1024 * 1024 * 1024;

const text = (v, max = 80) => String(v ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
const slug = (v) => text(v, 90).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'fonte';
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');

export class MultiRecorder {
  constructor({ recordingsDir, ffmpegPath = '', encoders = [], logger = console } = {}) {
    this.recordingsDir = recordingsDir;
    this.ffmpegPath = ffmpegPath;
    this.encoders = encoders;
    this.convertQueue = [];
    this.converting = false;
    this.logger = logger;
    this.sessions = new Map();
    this.root = '';
  }

  baseDir() {
    if (!this.root) {
      const base = typeof this.recordingsDir === 'function' ? this.recordingsDir() : this.recordingsDir;
      this.root = path.join(base, 'multirec');
    }
    return this.root;
  }

  publicSession(session) {
    return {
      id: session.id,
      dir: session.dir,
      createdAt: session.createdAt,
      endedAt: session.endedAt || null,
      convertMp4: !!session.convertMp4,
      videoKbps: session.videoKbps || 4000,
      sources: session.sources.map((s) => ({
        key: s.key,
        label: s.label,
        kind: s.kind,
        audio: s.audio || '',
        file: s.finalFile,
        status: s.status,
        bytes: s.bytes,
        mp4: s.mp4Status === 'complete' ? s.mp4Name : null,
        mp4Status: s.mp4Status || 'off',
        mp4Bytes: s.mp4Bytes || 0,
      })),
    };
  }

  async start({ studioId = '', sources = [], convertMp4 = false, videoKbps = 4000 } = {}) {
    if (!Array.isArray(sources) || !sources.length) throw new Error('Escolha pelo menos uma fonte.');
    const unique = [];
    const seen = new Set();
    for (const raw of sources) {
      const key = text(raw?.key, 120);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const ext = String(raw?.ext || '').toLowerCase() === 'mp4' ? 'mp4' : 'webm';
      unique.push({ key, label: text(raw?.name || raw?.label || key, 80), kind: text(raw?.kind || 'source', 24), ext, audio: text(raw?.audio || '', 80) });
    }
    if (!unique.length) throw new Error('Nenhuma fonte válida foi escolhida.');
    if (unique.length > MAX_SOURCES) throw new Error(`O limite é de ${MAX_SOURCES} fontes por sessão.`);

    const root = this.baseDir();
    await fsp.mkdir(root, { recursive: true });
    try {
      const st = await fsp.statfs(root);
      if (st.bavail * st.bsize < MIN_FREE_BYTES) throw new Error('Espaço insuficiente em disco para iniciar a multigravação.');
    } catch (e) {
      if (/Espaço insuficiente/.test(e.message)) throw e;
      // statfs não existe em alguns ambientes antigos; não bloqueia o teste local.
    }

    const id = `${stamp()}_${crypto.randomBytes(3).toString('hex')}`;
    const dir = path.join(root, id);
    await fsp.mkdir(dir, { recursive: false });
    const kbps = Math.max(500, Math.min(20000, Math.round(Number(videoKbps) || 4000)));
    const session = {
      id,
      dir,
      studioId: text(studioId, 100),
      createdAt: new Date().toISOString(),
      endedAt: null,
      convertMp4: !!convertMp4,
      videoKbps: kbps,
      writeChain: Promise.resolve(),
      sources: unique.map((s, i) => {
        const file = `${String(i + 1).padStart(2, '0')}-${slug(s.key)}.${s.ext}`;
        const mp4Name = file.replace(/\.[^.]+$/i, '.mp4');
        return {
          ...s,
          file,
          finalFile: path.join(dir, file),
          partFile: path.join(dir, file + '.part'),
          status: 'pending',
          bytes: 0,
          startedAt: null,
          endedAt: null,
          ws: null,
          out: null,
          finishing: false,
          mp4Name,
          mp4File: path.join(dir, mp4Name),
          mp4Status: convertMp4 && s.ext !== 'mp4' ? 'pending' : 'off',
          mp4Bytes: 0,
        };
      }),
    };
    this.sessions.set(id, session);
    await this.writeManifest(session);
    return this.publicSession(session);
  }

  sessionFor(id) {
    const session = this.sessions.get(String(id || ''));
    if (!session) throw new Error('Sessão de multigravação não encontrada.');
    return session;
  }

  sourceFor(session, key) {
    const source = session.sources.find((s) => s.key === String(key || ''));
    if (!source) throw new Error('Fonte não pertence a esta sessão.');
    return source;
  }

  attach(ws, { session: id, key } = {}) {
    let session;
    let source;
    try {
      session = this.sessionFor(id);
      source = this.sourceFor(session, key);
    } catch (e) {
      try { ws.send(JSON.stringify({ type: 'error', message: e.message })); } catch {}
      try { ws.close(1008, 'invalid session'); } catch {}
      return;
    }
    if (source.ws) {
      try { ws.send(JSON.stringify({ type: 'error', message: 'Esta fonte já está sendo gravada.' })); } catch {}
      try { ws.close(1008, 'already recording'); } catch {}
      return;
    }

    source.ws = ws;
    source.status = 'recording';
    source.startedAt = new Date().toISOString();
    source.out = fs.createWriteStream(source.partFile, { flags: 'wx' });
    source.out.on('error', (e) => {
      this.logger.warn?.(`[multirec] ${source.key}: ${e.message}`);
      source.status = 'error';
      try { ws.close(1011, 'write failed'); } catch {}
    });
    try { ws.send(JSON.stringify({ type: 'ready', key: source.key, file: source.finalFile })); } catch {}

    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        try {
          const msg = JSON.parse(String(data));
          if (msg?.type === 'stop') this.finishSource(session, source);
        } catch {}
        return;
      }
      if (source.finishing || !source.out || source.out.writableEnded) return;
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (!buf.length) return;
      source.bytes += buf.length;
      if (source.bytes > MAX_SOURCE_BYTES) {
        try { ws.send(JSON.stringify({ type: 'error', message: 'Limite de tamanho da gravação atingido.' })); } catch {}
        try { ws.close(1009, 'too large'); } catch {}
        return;
      }
      const ok = source.out.write(buf);
      if (!ok) {
        try { ws._socket?.pause(); } catch {}
        source.out.once('drain', () => {
          try { ws._socket?.resume(); } catch {}
        });
      }
    });
    ws.on('close', () => this.finishSource(session, source));
    ws.on('error', () => this.finishSource(session, source));
    this.queueManifest(session);
  }

  remux(source) {
    const bin = typeof this.ffmpegPath === 'function' ? this.ffmpegPath() : this.ffmpegPath;
    if (!bin) return Promise.resolve(false);
    const tmp = source.finalFile + '.remux.' + (source.ext === 'mp4' ? 'mp4' : 'webm');
    return new Promise((resolve) => {
      const p = spawn(bin, ['-hide_banner', '-loglevel', 'error', '-i', source.partFile, '-map', '0', '-c', 'copy', '-y', tmp], {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let err = '';
      p.stderr.on('data', (d) => (err = (err + d).slice(-500)));
      p.on('error', () => resolve(false));
      p.on('close', async (code) => {
        if (code !== 0) {
          if (err.trim()) this.logger.warn?.(`[multirec] remux ${source.key}: ${err.trim().split('\n').pop()}`);
          await fsp.unlink(tmp).catch(() => {});
          resolve(false);
          return;
        }
        resolve(true);
      });
    });
  }

  finishSource(session, source) {
    if (!source || source.finishing) return Promise.resolve();
    source.finishing = true;
    source.endedAt = new Date().toISOString();
    const finish = async () => {
      try {
        if (source.out && !source.out.writableEnded) {
          await new Promise((resolve) => source.out.end(resolve));
        }
        if (source.bytes > 1024) {
          // Remux sem recodificar: acrescenta a duração que o MediaRecorder não grava
          // no WebM, sem gastar CPU de encoder. Se falhar, o arquivo original continua válido.
          const remuxed = await this.remux(source).catch(() => false);
          if (remuxed) {
            await fsp.unlink(source.partFile).catch(() => {});
            await fsp.rename(source.finalFile + '.remux.' + (source.ext === 'mp4' ? 'mp4' : 'webm'), source.finalFile);
          } else {
            await fsp.rename(source.partFile, source.finalFile);
          }
          source.bytes = (await fsp.stat(source.finalFile)).size;
          source.status = 'complete';
          if (session.convertMp4 && source.ext !== 'mp4') this.enqueueConversion(session, source);
        } else {
          await fsp.unlink(source.partFile).catch(() => {});
          source.status = 'empty';
          source.mp4Status = 'off';
        }
      } catch (e) {
        source.status = 'error';
        source.mp4Status = 'off';
        this.logger.warn?.(`[multirec] falha ao finalizar ${source.key}: ${e.message}`);
        await fsp.unlink(source.partFile).catch(() => {});
      }
      try { source.ws?.send(JSON.stringify({ type: 'done', key: source.key, status: source.status })); } catch {}
      try { source.ws?.close(1000, 'finished'); } catch {}
      await this.queueManifest(session);
    };
    source.finishPromise = finish();
    return source.finishPromise;
  }

  enqueueConversion(session, source) {
    if (!source || source.ext === 'mp4' || source.status !== 'complete') return;
    if (['queued', 'converting', 'complete'].includes(source.mp4Status)) return;
    source.mp4Status = 'queued';
    this.convertQueue.push({ session, source });
    this.queueManifest(session);
    this.pumpConversions();
  }

  pumpConversions() {
    if (this.converting) return;
    const job = this.convertQueue.shift();
    if (!job) return;
    this.converting = true;
    this.convertSource(job.session, job.source).finally(() => {
      this.converting = false;
      this.pumpConversions();
    });
  }

  async convertSession(id) {
    const session = this.sessionFor(id);
    session.convertMp4 = true;
    for (const source of session.sources) this.enqueueConversion(session, source);
    await this.queueManifest(session);
    return this.publicSession(session);
  }

  async convertSource(session, source) {
    const bin = typeof this.ffmpegPath === 'function' ? this.ffmpegPath() : this.ffmpegPath;
    if (!bin) {
      source.mp4Status = 'error';
      await this.queueManifest(session);
      return;
    }
    source.mp4Status = 'converting';
    await this.queueManifest(session);
    const encoders = typeof this.encoders === 'function' ? this.encoders() : this.encoders || [];
    const hw = (Array.isArray(encoders) ? encoders : []).find((e) => e?.hw)?.id;
    const tryEncode = (encoder) => new Promise((resolve) => {
      const tmp = source.mp4File + '.part';
      const args = [
        '-hide_banner', '-loglevel', 'error',
        '-i', source.finalFile,
        '-map', '0:v:0', '-map', '0:a?',
        ...videoEncoderArgs(encoder, session.videoKbps || 4000, 30),
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
        '-movflags', '+faststart', '-f', 'mp4', '-y', tmp,
      ];
      const p = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', (d) => (err = (err + d).slice(-600)));
      p.on('error', () => resolve(false));
      p.on('close', async (code) => {
        if (code !== 0) {
          this.logger.warn?.(`[multirec] MP4 ${source.key}: ${err.trim().split('\n').pop() || 'falha na conversão'}`);
          await fsp.unlink(tmp).catch(() => {});
          resolve(false);
          return;
        }
        try { await fsp.rename(tmp, source.mp4File); resolve(true); } catch { resolve(false); }
      });
    });
    let ok = await tryEncode(hw || 'libx264');
    if (!ok && hw) ok = await tryEncode('libx264');
    if (ok) {
      source.mp4Status = 'complete';
      source.mp4Bytes = (await fsp.stat(source.mp4File).catch(() => ({ size: 0 }))).size;
    } else {
      source.mp4Status = 'error';
    }
    await this.queueManifest(session);
  }

  async stop(id) {
    const session = this.sessionFor(id);
    const pending = [];
    for (const source of session.sources) {
      if (source.ws && source.ws.readyState === 1) {
        try { source.ws.send(JSON.stringify({ type: 'stop' })); } catch {}
        try { source.ws.close(1000, 'stopped'); } catch {}
      }
      pending.push(source.finishPromise || this.finishSource(session, source));
    }
    await Promise.allSettled(pending);
    session.endedAt = new Date().toISOString();
    await this.queueManifest(session);
    return this.publicSession(session);
  }

  status(id) {
    return this.publicSession(this.sessionFor(id));
  }

  queueManifest(session) {
    session.writeChain = session.writeChain.then(() => this.writeManifest(session)).catch((e) => {
      this.logger.warn?.(`[multirec] manifesto: ${e.message}`);
    });
    return session.writeChain;
  }

  async writeManifest(session) {
    const data = {
      version: 1,
      session: session.id,
      studioId: session.studioId,
      createdAt: session.createdAt,
      endedAt: session.endedAt,
      convertMp4: !!session.convertMp4,
      videoKbps: session.videoKbps || 4000,
      sources: session.sources.map((s) => ({
        key: s.key,
        label: s.label,
        kind: s.kind,
        audio: s.audio || '',
        file: s.status === 'complete' ? s.file : null,
        status: s.status,
        bytes: s.bytes,
        mp4: s.mp4Status === 'complete' ? s.mp4Name : null,
        mp4Status: s.mp4Status || 'off',
        mp4Bytes: s.mp4Bytes || 0,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
      })),
    };
    const tmp = path.join(session.dir, 'manifest.json.tmp');
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2));
    await fsp.rename(tmp, path.join(session.dir, 'manifest.json'));
  }
}

export { MAX_SOURCES };
