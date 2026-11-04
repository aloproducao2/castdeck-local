// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Motor de transmissão local.
//
//  navegador (canvas + mixer) --MediaRecorder/webm--> WebSocket /ingest
//      --> [encoder FFmpeg]  webm -> H.264/AAC em MPEG-TS (stdout)
//            |--> [saída FFmpeg #1] -c copy -> FLV -> rtmp(s)://destino 1
//            |--> [saída FFmpeg #2] -c copy -> FLV -> rtmp(s)://destino 2
//            '--> [saída FFmpeg rec] -c copy -> recordings/*.mp4
//
// Cada saída é um processo separado: se um destino cair, só ele reconecta.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { videoEncoderArgs } from './ffmpeg.js';
import { finalizeRecording } from './recordings.js';

const MAX_OUTPUT_BUFFER = 24 * 1024 * 1024; // destino lento demais -> reinicia
const RESTART_DELAY_MS = 3000;
const MAX_RESTARTS = 20;

export const PRESETS = {
  '720p30': { width: 1280, height: 720, fps: 30, videoKbps: 4500, audioKbps: 160 },
  '720p60': { width: 1280, height: 720, fps: 60, videoKbps: 6000, audioKbps: 160 },
  '1080p30': { width: 1920, height: 1080, fps: 30, videoKbps: 6000, audioKbps: 160 },
  '1080p60': { width: 1920, height: 1080, fps: 60, videoKbps: 9000, audioKbps: 192 },
  '480p30': { width: 854, height: 480, fps: 30, videoKbps: 2000, audioKbps: 128 },
  // modo vertical 9:16 (Instagram, TikTok, Reels, Shorts)
  v720p30: { width: 720, height: 1280, fps: 30, videoKbps: 3500, audioKbps: 128, vertical: true },
  v1080p30: { width: 1080, height: 1920, fps: 30, videoKbps: 5500, audioKbps: 160, vertical: true },
};

export function buildRtmpUrl(dest) {
  const base = String(dest.url || '').trim();
  const key = String(dest.key || '').trim();
  if (!key) return base;
  return base.replace(/\/+$/, '') + '/' + key.replace(/^\/+/, '');
}

function redact(url) {
  // nunca loga a chave de transmissão inteira
  return url.replace(/([^/]{4})[^/]*$/, '$1••••');
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

class Output extends EventEmitter {
  constructor({ id, name, kind, url, file, ffmpegPath }) {
    super();
    Object.assign(this, { id, name, kind, url, file, ffmpegPath });
    this.state = 'idle';
    this.error = null;
    this.restarts = 0;
    this.bytes = 0;
    this.stopped = false;
    this.proc = null;
    this.startedAt = 0;
    this.files = file ? [file] : []; // gravação: todos os arquivos gerados (um por reinício)
  }

  args() {
    const base = ['-hide_banner', '-loglevel', 'error', '-f', 'mpegts', '-i', 'pipe:0'];
    if (this.kind === 'record') {
      // Gravação sempre em H.264/AAC: Windows Media Player (e vários players de TV) não abrem Opus em MP4.
      // O vídeo continua em cópia; só o áudio é garantido em AAC.
      return [
        ...base,
        '-map', '0:v:0?', '-map', '0:a:0?',
        '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
        '-bsf:a', 'aac_adtstoasc',
        '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
        '-f', 'mp4', '-y', this.file,
      ];
    }
    return [...base, '-map', '0', '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-flvflags', 'no_duration_filesize', '-f', 'flv', this.url];
  }

  start() {
    if (this.stopped) return;
    // gravação que reiniciou: o ffmpeg abre o arquivo com -y e apagaria o que já foi gravado; continua em outro
    if (this.kind === 'record' && this.restarts > 0) {
      this.file = this.files[0].replace(/\.mp4$/i, `_parte${this.restarts + 1}.mp4`);
      this.files.push(this.file);
    }
    this.state = this.restarts ? 'reconnecting' : 'connecting';
    this.error = null;
    this.startedAt = Date.now();
    const proc = spawn(this.ffmpegPath, this.args(), { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    this.proc = proc;
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-2000);
    });
    proc.stdin.on('error', () => {});
    proc.on('error', (e) => {
      this.error = String(e.message || e);
    });
    proc.on('close', (code) => {
      if (this.proc !== proc) return;
      this.proc = null;
      if (this.stopped) {
        this.state = 'stopped';
        this.emit('change');
        if (this.kind === 'record') this.emit('recorded', this.files.slice());
        return;
      }
      const lastLine = stderr.trim().split(/\r?\n/).pop() || `código ${code}`;
      this.error = lastLine.replace(this.url || '', '[url]');
      if (this.restarts >= MAX_RESTARTS) {
        this.state = 'failed';
        this.emit('change');
        if (this.kind === 'record') this.emit('recorded', this.files.slice());
        return;
      }
      this.restarts++;
      this.state = 'error';
      this.emit('change');
      setTimeout(() => this.start(), RESTART_DELAY_MS);
    });
    this.emit('change');
  }

  write(chunk) {
    const p = this.proc;
    if (!p || !p.stdin.writable) return;
    if (p.stdin.writableLength > MAX_OUTPUT_BUFFER) {
      this.error = 'Destino não está acompanhando (rede lenta). Reiniciando…';
      p.kill('SIGKILL');
      return;
    }
    p.stdin.write(chunk);
    this.bytes += chunk.length;
    if ((this.state === 'connecting' || this.state === 'reconnecting') && Date.now() - this.startedAt > 2500) {
      this.state = 'live';
      this.emit('change');
    }
  }

  end() {
    this.stopped = true;
    const p = this.proc;
    if (!p) {
      this.state = 'stopped';
      return;
    }
    try {
      p.stdin.end();
    } catch {}
    // garante término mesmo se o servidor RTMP travar
    setTimeout(() => p.exitCode === null && p.kill('SIGKILL'), 8000).unref();
  }

  status() {
    return { id: this.id, name: this.name, kind: this.kind, state: this.state, error: this.error, restarts: this.restarts, bytes: this.bytes, file: this.file ? path.basename(this.file) : undefined };
  }
}

export class Broadcast extends EventEmitter {
  constructor({ ffmpegPath, recordingsDir, studio, destinations, record, presetId, encoder, inputMime, vertical, videoKbps, audioKbps }) {
    super();
    this.ffmpegPath = ffmpegPath;
    this.recordingsDir = recordingsDir;
    this.studio = studio;
    this.vertical = !!vertical;
    const okPreset = PRESETS[presetId] && !!PRESETS[presetId].vertical === this.vertical;
    this.presetId = okPreset ? presetId : this.vertical ? 'v720p30' : '720p30';
    const basePreset = PRESETS[this.presetId];
    let customKbps = typeof videoKbps === 'number' ? Math.round(videoKbps) : parseInt(videoKbps, 10);
    if (!Number.isFinite(customKbps) || customKbps < 500 || customKbps > 50000) {
      customKbps = basePreset.videoKbps;
    }
    let customAudioKbps = typeof audioKbps === 'number' ? Math.round(audioKbps) : parseInt(audioKbps, 10);
    if (!Number.isFinite(customAudioKbps) || customAudioKbps < 128) {
      customAudioKbps = Math.max(128, basePreset.audioKbps || 128);
    }
    this.preset = { ...basePreset, videoKbps: customKbps, audioKbps: customAudioKbps };
    this.encoder = encoder || 'libx264';
    this.inputMime = inputMime || 'video/webm';
    this.outputs = [];
    this.startedAt = Date.now();
    this.stats = {};
    this.inBytes = 0;
    this.ended = false;

    for (const d of destinations) {
      const url = buildRtmpUrl(d);
      if (!/^rtmps?:\/\//i.test(url) && !/^srt:\/\//i.test(url)) continue;
      this.outputs.push(new Output({ id: d.id, name: d.name, kind: 'rtmp', url, ffmpegPath }));
    }
    if (record) {
      const recDir = typeof recordingsDir === 'function' ? recordingsDir() : recordingsDir;
      fs.mkdirSync(recDir, { recursive: true });
      const safe = String(studio.name).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'estudio';
      const file = path.join(recDir, `${safe}_${timestamp()}${this.vertical ? '_vertical' : ''}.mp4`);
      this.outputs.push(new Output({ id: 'rec', name: this.vertical ? 'Gravação local (vertical)' : 'Gravação local', kind: 'record', file, ffmpegPath }));
      this.outputs.at(-1).on('recorded', (files) => files.forEach((f) => finalizeRecording(ffmpegPath, f)));
    }
    if (!this.outputs.length) throw new Error('Nenhum destino válido nem gravação selecionados.');
  }

  addRecordOutput() {
    if (this.ended) return null;
    const existing = this.outputs.find((o) => o.kind === 'record' && !o.stopped);
    if (existing) return existing;
    const recDir = typeof this.recordingsDir === 'function' ? this.recordingsDir() : this.recordingsDir;
    fs.mkdirSync(recDir, { recursive: true });
    const safe = String(this.studio.name).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'estudio';
    const file = path.join(recDir, `${safe}_${timestamp()}${this.vertical ? '_vertical' : ''}.mp4`);
    const out = new Output({
      id: 'rec',
      name: this.vertical ? 'Gravação local (vertical)' : 'Gravação local',
      kind: 'record',
      file,
      ffmpegPath: this.ffmpegPath,
    });
    out.on('change', () => this.emit('status'));
    out.on('recorded', (files) => files.forEach((f) => finalizeRecording(this.ffmpegPath, f)));
    out.start();
    this.outputs.push(out);
    console.log(`[broadcast] ${this.studio.name}: gravação iniciada dinamicamente -> ${file}`);
    this.emit('status');
    return out;
  }

  stopRecordOutput() {
    const recs = this.outputs.filter((o) => o.kind === 'record' && !o.stopped);
    for (const r of recs) r.end();
    this.outputs = this.outputs.filter((o) => o.kind !== 'record' || !o.stopped);
    this.emit('status');
    if (!this.outputs.some((o) => !o.stopped)) {
      this.stop();
    }
  }

  addDestinations(destinations) {
    if (this.ended) return;
    const added = [];
    for (const d of destinations) {
      const url = buildRtmpUrl(d);
      if (!/^rtmps?:\/\//i.test(url) && !/^srt:\/\//i.test(url)) continue;
      if (this.outputs.some((o) => o.id === d.id && !o.stopped)) continue;
      const out = new Output({ id: d.id, name: d.name, kind: 'rtmp', url, ffmpegPath: this.ffmpegPath });
      out.on('change', () => this.emit('status'));
      out.start();
      this.outputs.push(out);
      added.push(out);
    }
    if (added.length) {
      console.log(`[broadcast] ${this.studio.name}: ${added.length} destino(s) iniciado(s) dinamicamente`);
      this.emit('status');
    }
  }

  stopDestinations() {
    const rtmps = this.outputs.filter((o) => o.kind === 'rtmp' && !o.stopped);
    for (const r of rtmps) r.end();
    this.outputs = this.outputs.filter((o) => o.kind !== 'rtmp' || !o.stopped);
    this.emit('status');
    if (!this.outputs.some((o) => !o.stopped)) {
      this.stop();
    }
  }

  start() {
    const { width, height, fps, videoKbps, audioKbps } = this.preset;
    const finalAudioKbps = Math.max(128, Number(audioKbps) || 128);
    const vf = [
      `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
      `fps=${fps}`,
      'format=yuv420p',
    ].join(',');
    const args = [
      '-hide_banner', '-loglevel', 'error', '-nostats', '-progress', 'pipe:2',
      '-fflags', '+genpts+discardcorrupt', '-thread_queue_size', '1024',
      '-i', 'pipe:0',
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', vf,
      ...videoEncoderArgs(this.encoder, videoKbps, fps),
      '-c:a', 'aac', '-b:a', `${finalAudioKbps}k`, '-ar', '48000', '-ac', '2',
      '-af', 'aresample=async=0',
      '-muxdelay', '0', '-f', 'mpegts', 'pipe:1',
    ];
    console.log(`[broadcast] ${this.studio.name}: ${this.presetId} via ${this.encoder} -> ${this.outputs.map((o) => o.kind === 'record' ? 'gravação' : redact(o.url)).join(', ')}`);

    const enc = spawn(this.ffmpegPath, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.enc = enc;
    enc.stdin.on('error', () => {});
    let errTail = '';
    let progressBuf = '';
    enc.stderr.on('data', (d) => {
      progressBuf += d.toString();
      const lines = progressBuf.split(/\r?\n/);
      progressBuf = lines.pop();
      for (const line of lines) {
        const m = line.match(/^(\w+)=(.*)$/);
        if (m) {
          this.stats[m[1]] = m[2].trim();
          if (m[1] === 'progress') this.emit('status');
        } else if (line.trim()) {
          errTail = (errTail + '\n' + line).slice(-1500);
        }
      }
    });
    enc.stdout.on('data', (chunk) => {
      for (const o of this.outputs) {
        if (!o.stopped) o.write(chunk);
      }
    });
    enc.stdout.on('end', () => {
      for (const o of this.outputs) o.end();
    });
    enc.on('error', (e) => this.fail(`Falha ao iniciar FFmpeg: ${e.message}`));
    enc.on('close', (code) => {
      if (!this.ended && code !== 0) this.fail(`Encoder encerrou (código ${code}). ${errTail.trim().split('\n').pop() || ''}`);
      this.ended = true;
      this.emit('ended');
    });

    for (const o of this.outputs) {
      o.on('change', () => this.emit('status'));
      o.start();
    }
  }

  write(chunk) {
    if (this.ended || !this.enc?.stdin.writable) return false;
    // O socket já foi pausado no primeiro false; não aceita mais até o drain.
    if (this._drainPending) return false;
    this.inBytes += chunk.length;
    const ok = this.enc.stdin.write(chunk);
    if (!ok && !this._drainPending) {
      this._drainPending = true;
      this.enc.stdin.once('drain', () => {
        this._drainPending = false;
        this.emit('drain');
      });
    }
    return ok;
  }

  get backlog() {
    return this.enc?.stdin.writableLength ?? 0;
  }

  stop() {
    if (this.ended) return;
    try {
      this.enc?.stdin.end();
    } catch {}
    const enc = this.enc;
    setTimeout(() => enc && enc.exitCode === null && enc.kill('SIGKILL'), 10000).unref();
  }

  fail(message) {
    this.error = message;
    console.error('[broadcast]', message);
    this.emit('error-message', message);
    for (const o of this.outputs) o.end();
  }

  status() {
    const s = this.stats;
    const activeOutputs = this.outputs.filter((o) => !o.stopped);
    const isRecording = activeOutputs.some((o) => o.kind === 'record');
    const isStreaming = activeOutputs.some((o) => o.kind === 'rtmp');
    return {
      type: 'status',
      vertical: this.vertical,
      uptime: Date.now() - this.startedAt,
      preset: this.presetId,
      encoder: this.encoder,
      fps: Number(s.fps) || 0,
      bitrate: s.bitrate && s.bitrate !== 'N/A' ? s.bitrate : null,
      speed: s.speed && s.speed !== 'N/A' ? s.speed : null,
      dropFrames: Number(s.drop_frames) || 0,
      backlog: this.backlog,
      isRecording,
      isStreaming,
      outputs: this.outputs.map((o) => o.status()),
    };
  }
}

export class BroadcastManager {
  constructor({ ffmpegInfo, recordingsDir, store }) {
    this.ffmpegInfo = ffmpegInfo;
    this.recordingsDir = recordingsDir;
    this.store = store;
    this.active = new Map(); // studioId -> Broadcast
  }

  // Cada conexão em /ingest é uma transmissão. 1ª mensagem (texto) = config; depois, binário = webm.
  handleIngest(ws) {
    let bc = null;
    let statusTimer = null;
    let wsPaused = false;
    const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));
    const resumeIngest = () => {
      if (!wsPaused) return;
      wsPaused = false;
      try {
        ws._socket?.resume();
      } catch {}
    };

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        if (!bc) return;
        const ok = bc.write(data);
        if (!ok && !wsPaused) {
          // FFmpeg não acompanhou: para de ler o WebSocket até o stdin drenar.
          // Sem isso, o Node acumulava todo o vídeo em memória e podia travar/OOM.
          wsPaused = true;
          try {
            ws._socket?.pause();
          } catch {}
          bc.once('drain', resumeIngest);
        }
        return;
      }
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type === 'start') {
        if (bc) {
          if (msg.record) bc.addRecordOutput();
          if (msg.destinationIds?.length) {
            const destinations = msg.destinationIds.map((id) => this.store.getDestination(id)).filter(Boolean);
            bc.addDestinations(destinations);
          }
          return send(bc.status());
        }
        if (!this.ffmpegInfo.available) return send({ type: 'error', message: this.ffmpegInfo.error || 'FFmpeg indisponível' });
        const studio = this.store.getStudio(msg.studioId);
        if (!studio) return send({ type: 'error', message: 'Estúdio não encontrado' });
        const vertical = !!msg.vertical;
        const key = studio.id + (vertical ? ':v' : '');
        if (this.active.has(key)) return send({ type: 'error', message: vertical ? 'A saída vertical deste estúdio já está ativa.' : 'Este estúdio já está transmitindo.' });
        const destinations = (msg.destinationIds || []).map((id) => this.store.getDestination(id)).filter(Boolean);
        const encoderOk = msg.encoder === 'libx264' || this.ffmpegInfo.encoders.some((e) => e.id === msg.encoder);
        try {
          bc = new Broadcast({
            ffmpegPath: this.ffmpegInfo.path,
            recordingsDir: typeof this.recordingsDir === 'function' ? this.recordingsDir() : this.recordingsDir,
            studio,
            destinations,
            record: !!msg.record,
            presetId: msg.preset,
            encoder: encoderOk ? msg.encoder : 'libx264',
            inputMime: msg.mime,
            vertical,
            videoKbps: msg.videoKbps,
          });
        } catch (e) {
          return send({ type: 'error', message: e.message });
        }
        this.active.set(key, bc);
        bc.on('error-message', (m) => send({ type: 'error', message: m }));
        bc.on('ended', () => {
          clearInterval(statusTimer);
          if (this.active.get(key) === bc) this.active.delete(key);
          send({ ...bc.status(), type: 'ended' });
          setTimeout(() => ws.readyState === 1 && ws.close(1000, 'ended'), 200);
        });
        bc.start();
        statusTimer = setInterval(() => send(bc.status()), 1000);
        send({ ...bc.status(), type: 'started' });
      } else if (msg.type === 'start-record') {
        bc?.addRecordOutput();
      } else if (msg.type === 'stop-record') {
        bc?.stopRecordOutput();
      } else if (msg.type === 'start-destinations') {
        const destinations = (msg.destinationIds || []).map((id) => this.store.getDestination(id)).filter(Boolean);
        bc?.addDestinations(destinations);
      } else if (msg.type === 'stop-destinations') {
        bc?.stopDestinations();
      } else if (msg.type === 'stop') {
        bc?.stop();
      }
    });

    ws.on('close', () => {
      bc?.stop();
    });
    ws.on('error', () => {});
  }

  list() {
    return [...this.active.values()].map((bc) => ({ studioId: bc.studio.id, ...bc.status() }));
  }

  stopAll() {
    for (const bc of this.active.values()) bc.stop();
  }
}
