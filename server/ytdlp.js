// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Baixa um vídeo do YouTube com yt-dlp + FFmpeg, juntando vídeo e áudio em MP4.
// O arquivo fica no cache local; o estúdio busca e adiciona à playlist (IndexedDB).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const MAX_JOBS = 3;
const MAX_AGE_MS = 60 * 60 * 1000;
const MAX_BYTES = 600 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

function safeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!ALLOWED_HOSTS.has(u.hostname.toLowerCase())) return null;
  if (u.href.length > 2048) return null;
  return u.href;
}

const fileKind = (file) => {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.mp3') return { mime: 'audio/mpeg', audio: true };
  if (ext === '.m4a') return { mime: 'audio/mp4', audio: true };
  if (ext === '.ogg' || ext === '.opus') return { mime: 'audio/ogg', audio: true };
  if (ext === '.webm') return { mime: 'video/webm', audio: false };
  if (ext === '.mkv') return { mime: 'video/x-matroska', audio: false };
  return { mime: 'video/mp4', audio: false };
};

export class Ytdlp {
  constructor({ deps, ffmpegInfo, dataDir, recordingsDir }) {
    this.deps = deps;
    this.ffmpegInfo = ffmpegInfo;
    this._recordingsDir = typeof recordingsDir === 'function' ? recordingsDir : () => recordingsDir;
    this.root = path.join(dataDir, 'ytdl');
    this.jobs = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    this.cleanupTimer.unref?.();
  }

  cleanup() {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (now - job.createdAt < MAX_AGE_MS) continue;
      if (job.proc) continue;
      this.jobs.delete(id);
      fs.rm(job.dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  public(job) {
    if (!job) return null;
    return {
      id: job.id,
      status: job.status,
      progress: Math.round(job.progress || 0),
      title: job.title || '',
      filename: job.filename || '',
      duration: job.duration || 0,
      size: job.size || 0,
      mime: job.mime || 'video/mp4',
      speed: job.speed || '',
      eta: job.eta || '',
      totalText: job.totalText || '',
      stage: job.stage || '',
      recordingName: job.recordingName || '',
      error: job.error || null,
    };
  }

  async start(rawUrl) {
    const url = safeUrl(rawUrl);
    if (!url) throw Object.assign(new Error('Use um link do YouTube (youtube.com ou youtu.be).'), { status: 400 });
    if ([...this.jobs.values()].filter((j) => j.proc).length >= MAX_JOBS) {
      throw Object.assign(new Error('Já existem downloads em andamento. Aguarde um terminar.'), { status: 429 });
    }
    const id = crypto.randomUUID().slice(0, 12);
    const dir = path.join(this.root, id);
    const job = { id, url, dir, status: 'starting', progress: 0, createdAt: Date.now(), title: '', filename: '', recordingName: '', duration: 0, size: 0, mime: 'video/mp4', speed: '', eta: '', totalText: '', stage: '', error: null, proc: null };
    this.jobs.set(id, job);
    this.run(job).catch((e) => {
      job.status = 'error';
      job.error = e.message || String(e);
    });
    return this.public(job);
  }

  // Roda o yt-dlp uma vez. Devolve { code, err }. O yt-dlp empacotado com PyInstaller às vezes falha na
  // auto-extração ("Failed to extract ...") por antivírus/temp — por isso o run() refaz a chamada nesses casos.
  _spawnOnce(bin, args, job) {
    return new Promise((resolve) => {
      const proc = spawn(bin, args, { cwd: job.dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      job.proc = proc;
      let err = '';
      const consume = (chunk) => {
        const text = chunk.toString();
        for (const line of text.split(/\r?\n/)) {
          if (!line) continue;
          if (/\[Merger\]|Merging formats/i.test(line)) {
            job.stage = 'merging';
            job.progress = 100;
            continue;
          }
          if (/\[Video(?:Convertor|Remuxer)\]/i.test(line)) {
            job.stage = 'processing';
            job.progress = 100;
            continue;
          }
          const meta = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+~?\s*([^\s]+)(?:\s+at\s+([^\s]+))?(?:\s+ETA\s+([\d:]+))?/);
          if (meta) {
            job.progress = Math.max(job.progress, Number(meta[1]));
            job.totalText = meta[2] || job.totalText;
            job.speed = meta[3] || job.speed;
            job.eta = meta[4] || job.eta;
            job.stage = 'downloading';
            continue;
          }
          const pct = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
          if (pct) job.progress = Math.max(job.progress, Number(pct[1]));
          if (/^\[download\]\s+Destination:/.test(line)) job.stage = 'downloading';
        }
      };
      proc.stdout.on('data', consume);
      proc.stderr.on('data', (d) => {
        consume(d);
        err = (err + d.toString()).slice(-2500);
      });
      proc.on('error', (e) => resolve({ code: -1, err: e.message }));
      proc.on('close', (code) => {
        job.proc = null;
        resolve({ code, err });
      });
    });
  }

  async _finalize(job) {
    const entries = await fs.readdir(job.dir);
    const media = entries.filter((f) => !/\.(info\.json|part|ytdl)$/i.test(f) && /\.(mp4|mkv|webm|m4a|mp3|ogg|opus)$/i.test(f));
    if (!media.length) throw new Error('O download terminou sem um arquivo de vídeo.');
    const withSize = await Promise.all(media.map(async (f) => ({ f, size: (await fs.stat(path.join(job.dir, f))).size })));
    withSize.sort((a, b) => b.size - a.size);
    const chosen = withSize[0];
    if (chosen.size > MAX_BYTES) throw new Error('O vídeo ficou maior que o limite de 600 MB.');
    job.size = chosen.size;
    job.filename = chosen.f;
    const kind = fileKind(chosen.f);
    job.mime = kind.mime;
    try {
      const infoFile = entries.find((f) => f.endsWith('.info.json'));
      if (infoFile) {
        const info = JSON.parse(await fs.readFile(path.join(job.dir, infoFile), 'utf8'));
        job.title = String(info.title || '').slice(0, 160);
        job.duration = Math.max(0, Number(info.duration) || 0);
      }
    } catch {}
    // Todo vídeo baixado também entra na pasta de Gravações, com nome legível e único.
    const recDir = path.resolve(this._recordingsDir());
    await fs.mkdir(recDir, { recursive: true });
    const ext = path.extname(chosen.f) || '.mp4';
    const base = String(job.title || path.basename(chosen.f, ext)).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 90) || 'video';
    let recName = `${base} [YouTube]${ext}`;
    for (let n = 2; ; n++) {
      try {
        await fs.access(path.join(recDir, recName));
        recName = `${base} [YouTube] (${n})${ext}`;
      } catch {
        break;
      }
    }
    const srcFile = path.join(job.dir, chosen.f);
    const dstFile = path.join(recDir, recName);
    try {
      await fs.rename(srcFile, dstFile);
    } catch (e) {
      if (e.code !== 'EXDEV') throw e;
      await fs.copyFile(srcFile, dstFile);
      await fs.unlink(srcFile).catch(() => {});
    }
    job.recordingName = recName;
    job.filePath = dstFile;
    job.filename = recName;
    job.progress = 100;
    job.status = 'done';
  }

  async run(job) {
    await fs.mkdir(job.dir, { recursive: true });
    if (!this.ffmpegInfo.available) {
      job.status = 'error';
      job.error = 'FFmpeg indisponível; ele é necessário para juntar vídeo e áudio.';
      return;
    }
    job.status = 'preparing';
    job.stage = 'preparing';
    const bin = await this.deps.ensure('yt-dlp');
    job.status = 'downloading';
    job.stage = 'downloading';
    const args = [
      '--no-playlist',
      '--newline',
      '--no-colors',
      '--no-warnings',
      '--restrict-filenames',
      '--write-info-json',
      // MP4 quando os codecs permitem; WebM (VP9/Opus) como alternativa nativa, sem recodificar.
      '--merge-output-format', 'mp4/webm',
      '--max-filesize', '512M',
      '--match-filter', 'duration <= 7200',
      '--socket-timeout', '20',
      '--ffmpeg-location', this.ffmpegInfo.path,
      '-f', 'bv*[vcodec^=avc1]+ba[acodec^=mp4a]/bv*[vcodec^=vp9]+ba[acodec^=opus]/b[ext=mp4]/b[ext=webm]/bv*+ba/b',
      '-o', path.join(job.dir, 'media.%(ext)s'),
      '--', job.url,
    ];
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        job.stage = 'downloading';
        job.progress = Math.max(0, job.progress - 1);
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
      const { code, err } = await this._spawnOnce(bin, args, job);
      if (job.status === 'cancelled') return;
      if (code === 0) break;
      // Falha de extração do PyInstaller (antivírus/temp) ou crash: tenta de novo antes de desistir.
      const crashy = (typeof code === 'number' && code < 0) || /Failed to extract|decompression resulted|Cannot extract|PYI-/i.test(err || '');
      if (crashy && attempt < 2) continue;
      job.status = 'error';
      const last = (err || '').trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || `yt-dlp saiu com código ${code}`;
      job.error = last.slice(0, 500);
      return;
    }
    try {
      await this._finalize(job);
    } catch (e) {
      job.status = 'error';
      job.error = e.message || 'Falha ao preparar o arquivo.';
    }
  }

  get(id) {
    return this.public(this.jobs.get(String(id || '')));
  }

  file(id) {
    const job = this.jobs.get(String(id || ''));
    if (!job || job.status !== 'done' || !job.filePath) return null;
    const file = path.resolve(job.filePath);
    return { file, mime: job.mime, filename: job.filename };
  }

  cancel(id) {
    const job = this.jobs.get(String(id || ''));
    if (!job) return null;
    if (job.proc) {
      job.status = 'cancelled';
      try {
        job.proc.kill();
      } catch {}
    }
    return this.public(job);
  }

  async remove(id) {
    const job = this.jobs.get(String(id || ''));
    if (!job) return false;
    this.cancel(id);
    this.jobs.delete(job.id);
    await fs.rm(job.dir, { recursive: true, force: true }).catch(() => {});
    return true;
  }

  info() {
    return {
      available: !!this.ffmpegInfo.available,
      active: [...this.jobs.values()].filter((j) => !!j.proc).length,
      jobs: [...this.jobs.values()].slice(-10).map((j) => this.public(j)),
    };
  }
}
