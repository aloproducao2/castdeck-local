// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Entradas RTMP/SRT: drones e câmeras da mesma rede mandam vídeo para o estúdio.
//
//  drone/câmera --RTMP :1935 / SRT :8890--> MediaMTX (processo filho) --WHEP (WebRTC, só 127.0.0.1)--> estúdio
//
// - O MediaMTX só reempacota (não recodifica): leve (~60 MB de RAM com várias fontes).
// - O navegador não toca H.265 nem AAC por WebRTC (ver docs/ai/ESTUDO-INGEST-MEDIAMTX.md). Quando a fonte chega
//   assim, um FFmpeg gera "<chave>_web" (H.264 + Opus) e o estúdio lê essa versão. H.264 + Opus passa direto.
// - Só as chaves cadastradas podem publicar (caminhos desconhecidos são recusados pelo MediaMTX). Ler/assistir e a
//   API ficam restritos a este PC; nada disso passa pelo túnel da internet.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

// portas públicas (padrão do mercado: é o que drones/encoders já sugerem) e internas (só loopback, pouco usadas)
export const RTMP_PORT = Number(process.env.CD_RTMP_PORT) || 1935;
export const SRT_PORT = Number(process.env.CD_SRT_PORT) || 8890;
const API_PORT = Number(process.env.CD_MTX_API_PORT) || 19997;
const RTSP_PORT = API_PORT + 1; // 19998: conversão (FFmpeg lê e devolve por aqui)
const WEBRTC_PORT = API_PORT + 2; // 19999: WHEP para o estúdio
const WEBRTC_UDP = API_PORT + 3; // 20000: mídia WebRTC
const MAX_SOURCES = 12;
// codecs que o WebRTC do navegador aceita sem conversão
const WEB_VIDEO = ['H264'];
const WEB_AUDIO = ['Opus', 'G711', 'G722'];
const VIDEO_CODECS = /^(H264|H265|AV1|VP8|VP9|MPEG-4 Video|MPEG-1\/2 Video|M-JPEG)$/;

const newKey = () => 'cam-' + crypto.randomBytes(4).toString('hex').slice(0, 6);
const cleanName = (s, i) => String(s || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 40) || `Entrada ${i}`;

export class Ingest {
  constructor({ deps, store, ffmpegInfo, dataDir, lanIps }) {
    this.deps = deps;
    this.store = store;
    this.ffmpegInfo = ffmpegInfo;
    this.dir = path.join(dataDir, 'mediamtx');
    this.lanIps = lanIps;
    this.proc = null;
    this.status = 'off'; // off | starting | on | error
    this.error = null;
    this.logTail = [];
    this.paths = new Map(); // nome do caminho -> item da API do MediaMTX
    this.conv = new Map(); // chave -> { proc, video, audio, since, error }
    this.rates = new Map(); // chave -> { bytes, t, kbps }
    this.poller = null;
    this.stopping = false;
    this.restartTimer = null;
    this.fails = 0;
  }

  // ---------- configuração salva ----------
  cfg() {
    const s = this.store.getSettings();
    const c = s.ingest && typeof s.ingest === 'object' ? s.ingest : {};
    return { enabled: !!c.enabled, sources: Array.isArray(c.sources) ? c.sources.filter((x) => x && /^[a-z0-9-]{4,40}$/.test(x.key)) : [] };
  }
  save(patch) {
    const s = this.store.getSettings();
    s.ingest = { ...this.cfg(), ...patch };
    this.store.save();
  }

  available() {
    return this.deps.exists('mediamtx') || this.deps.hasBundled('mediamtx');
  }

  // ---------- estado para a interface ----------
  info() {
    const { enabled, sources } = this.cfg();
    const ips = this.lanIps().map((i) => i.address);
    const host = ips[0] || 'IP-DESTE-PC';
    return {
      available: this.available(),
      enabled,
      status: this.status,
      error: this.error,
      ports: { rtmp: RTMP_PORT, srt: SRT_PORT },
      lan: ips,
      encoder: this.encoder().id,
      sources: sources.map((src) => {
        const p = this.paths.get(src.key);
        const tracks = p?.tracks || [];
        const video = tracks.find((t) => VIDEO_CODECS.test(t)) || null;
        const audio = tracks.find((t) => t !== video) || null;
        const need = this.needs(tracks);
        const c = this.conv.get(src.key);
        const web = this.paths.get(src.key + '_web');
        const live = !!p?.ready;
        return {
          key: src.key,
          name: src.name,
          live,
          protocol: p?.source?.type ? (/rtmp/i.test(p.source.type) ? 'RTMP' : /srt/i.test(p.source.type) ? 'SRT' : p.source.type) : null,
          video,
          audio,
          kbps: live ? this.rates.get(src.key)?.kbps || 0 : 0,
          converting: live && (need.video || need.audio),
          convertError: c?.error || null,
          // caminho que o estúdio deve tocar (null = ainda não dá: sem sinal ou conversão iniciando)
          play: !live ? null : need.video || need.audio ? (web?.ready ? src.key + '_web' : null) : src.key,
          urls: {
            rtmp: `rtmp://${host}:${RTMP_PORT}/${src.key}`,
            srt: `srt://${host}:${SRT_PORT}?streamid=publish:${src.key}`,
            // drones/apps que pedem "servidor" e "chave" separados (DJI, Larix, OBS)
            rtmpServer: `rtmp://${host}:${RTMP_PORT}/`,
            rtmpKey: src.key,
          },
        };
      }),
    };
  }

  needs(tracks = []) {
    const video = tracks.find((t) => VIDEO_CODECS.test(t));
    const audio = tracks.find((t) => t !== video);
    return { video: !!video && !WEB_VIDEO.includes(video), audio: !!audio && !WEB_AUDIO.includes(audio) };
  }

  // encoder da conversão: o de hardware que o boot já detectou, senão x264 (≈1 núcleo por fonte 1080p)
  encoder() {
    const ids = (this.ffmpegInfo.encoders || []).map((e) => e.id);
    for (const id of ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox']) if (ids.includes(id)) return { id, hw: true };
    return { id: 'libx264', hw: false };
  }

  // ---------- fontes ----------
  addSource(name) {
    const { sources } = this.cfg();
    if (sources.length >= MAX_SOURCES) throw new Error(`Máximo de ${MAX_SOURCES} entradas.`);
    let key = newKey();
    while (sources.some((s) => s.key === key)) key = newKey();
    const src = { key, name: cleanName(name, sources.length + 1) };
    this.save({ sources: [...sources, src] });
    this.writeConfig();
    this.apiPath('add', key);
    return src;
  }
  renameSource(key, name) {
    const { sources } = this.cfg();
    const i = sources.findIndex((s) => s.key === key);
    if (i < 0) return null;
    sources[i] = { ...sources[i], name: cleanName(name, i + 1) };
    this.save({ sources });
    return sources[i];
  }
  removeSource(key) {
    const { sources } = this.cfg();
    if (!sources.some((s) => s.key === key)) return false;
    this.save({ sources: sources.filter((s) => s.key !== key) });
    this.stopConv(key);
    this.writeConfig();
    this.apiPath('delete', key);
    return true;
  }

  // ---------- ligar/desligar ----------
  async setEnabled(on) {
    this.save({ enabled: !!on });
    if (on) await this.start();
    else this.stop();
    return this.info();
  }

  configText() {
    const { sources } = this.cfg();
    const q = (s) => JSON.stringify(s);
    const lines = [
      '# Gerado pelo CastDeck (server/ingest.js). Alterações manuais são sobrescritas.',
      'logLevel: info',
      'logDestinations: [stdout]',
      // publicar: qualquer aparelho da rede, mas só nas chaves cadastradas (os caminhos abaixo)
      // ler/assistir e API: só este PC
      'authMethod: internal',
      'authInternalUsers:',
      '- user: any',
      '  ips: []',
      '  permissions:',
      '  - action: publish',
      '- user: any',
      "  ips: ['127.0.0.1', '::1']",
      '  permissions:',
      '  - action: read',
      '  - action: api',
      'api: yes',
      `apiAddress: 127.0.0.1:${API_PORT}`,
      'metrics: no',
      'pprof: no',
      'playback: no',
      'hls: no',
      'moq: no',
      'rtsp: yes',
      `rtspAddress: 127.0.0.1:${RTSP_PORT}`,
      'rtspTransports: [tcp]',
      'rtmp: yes',
      `rtmpAddress: :${RTMP_PORT}`,
      'srt: yes',
      `srtAddress: :${SRT_PORT}`,
      'webrtc: yes',
      `webrtcAddress: 127.0.0.1:${WEBRTC_PORT}`,
      // O Chromium não gera candidato ICE de loopback (só os IPs das placas de rede): com o UDP preso em 127.0.0.1
      // a conexão fica eternamente em "checking". Escuta em todas as placas e anuncia os IPs delas; o tráfego fica
      // dentro deste PC, e sem uma sessão WHEP (só aceita pedidos de 127.0.0.1) ninguém de fora consegue usar a porta.
      `webrtcLocalUDPAddress: :${WEBRTC_UDP}`,
      "webrtcLocalTCPAddress: ''",
      'webrtcIPsFromInterfaces: yes',
      "webrtcAdditionalHosts: ['127.0.0.1']",
      'paths:',
      // versão convertida (H.264/Opus) publicada pelo FFmpeg deste PC
      `  ${q('~^cam-[a-z0-9]+_web$')}:`,
      ...sources.map((s) => `  ${q(s.key)}:`),
    ];
    return lines.join('\n') + '\n';
  }

  writeConfig() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(path.join(this.dir, 'castdeck.yml'), this.configText());
    } catch (e) {
      console.warn('[ingest] não foi possível gravar a configuração:', e.message);
    }
  }

  // O MediaMTX recarrega o arquivo sozinho, mas pela API a mudança vale na hora (e não derruba as outras fontes)
  async apiPath(op, key) {
    if (this.status !== 'on') return;
    try {
      const url = `http://127.0.0.1:${API_PORT}/v3/config/paths/${op}/${encodeURIComponent(key)}`;
      await fetch(url, { method: op === 'add' ? 'POST' : 'DELETE', headers: { 'Content-Type': 'application/json' }, body: op === 'add' ? '{}' : undefined, signal: AbortSignal.timeout(3000) });
    } catch {}
  }

  // processo antigo que ficou para trás (servidor encerrado à força): segura as portas e impede de ligar de novo
  killOrphan() {
    const pidFile = path.join(this.dir, 'mediamtx.pid');
    let pid = 0;
    try {
      pid = Number(fs.readFileSync(pidFile, 'utf8')) || 0;
    } catch {}
    if (!pid) return;
    try {
      const r = process.platform === 'win32'
        ? spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV'], { encoding: 'utf8', windowsHide: true })
        : spawnSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' });
      if (/mediamtx/i.test(r.stdout || '')) {
        process.kill(pid);
        console.log(`[ingest] MediaMTX antigo (pid ${pid}) encerrado`);
      }
    } catch {}
    try {
      fs.unlinkSync(pidFile);
    } catch {}
  }

  async start() {
    if (this.proc || this.status === 'starting') return;
    clearTimeout(this.restartTimer);
    this.stopping = false;
    this.status = 'starting';
    this.error = null;
    this.logTail = [];
    let bin;
    try {
      bin = await this.deps.ensure('mediamtx');
    } catch (e) {
      this.status = 'error';
      this.error = 'MediaMTX indisponível: ' + e.message;
      return;
    }
    this.killOrphan();
    this.writeConfig();
    const p = spawn(bin, ['castdeck.yml'], { cwd: this.dir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = p;
    try {
      fs.writeFileSync(path.join(this.dir, 'mediamtx.pid'), String(p.pid || ''));
    } catch {}
    const onLine = (buf) => {
      for (const line of String(buf).split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.logTail.push(line);
        if (this.logTail.length > 40) this.logTail.shift();
        if (/ERR|address already in use|Only one usage of each socket|bind:/i.test(line)) {
          // a linha começa com data/hora ("2026/10/21 13:44:52"): a porta vem do "listen tcp :1935"
          const port = /listen \w+ [^\s]*:(\d{2,5})/.exec(line)?.[1];
          this.error = /already in use|Only one usage|bind/i.test(line)
            ? `A porta ${port || ''} já está em uso por outro programa (OBS, outro servidor RTMP?). Feche-o e ligue de novo.`
            : line.replace(/^\S+ \S+ /, '');
        }
        if (/\[API\] started/.test(line) && this.status === 'starting') {
          this.status = 'on';
          this.fails = 0;
          console.log(`[ingest] entradas ligadas: RTMP :${RTMP_PORT} · SRT :${SRT_PORT}`);
        }
      }
    };
    p.stdout.on('data', onLine);
    p.stderr.on('data', onLine);
    p.on('error', (e) => {
      this.error = 'Não foi possível iniciar o MediaMTX: ' + e.message;
    });
    p.on('close', (code) => {
      if (this.proc === p) this.proc = null;
      this.paths.clear();
      for (const k of [...this.conv.keys()]) this.stopConv(k);
      clearInterval(this.poller);
      this.poller = null;
      if (this.stopping) {
        this.status = 'off';
        return;
      }
      this.status = 'error';
      this.error = this.error || `O MediaMTX encerrou (código ${code}). ${this.logTail.slice(-1)[0] || ''}`.trim();
      console.warn('[ingest] ' + this.error);
      // caiu sozinho: tenta de novo (com espera crescente), a não ser que a porta esteja ocupada
      if (this.cfg().enabled && !/porta/.test(this.error) && this.fails++ < 5) {
        this.restartTimer = setTimeout(() => this.start(), 2000 * this.fails);
      }
    });
    this.poller = setInterval(() => this.poll(), 750);
  }

  stop() {
    this.stopping = true;
    clearTimeout(this.restartTimer);
    clearInterval(this.poller);
    this.poller = null;
    for (const k of [...this.conv.keys()]) this.stopConv(k);
    if (this.proc) this.proc.kill();
    this.proc = null;
    this.paths.clear();
    this.status = 'off';
    this.error = null;
    try {
      fs.unlinkSync(path.join(this.dir, 'mediamtx.pid'));
    } catch {}
  }

  // ---------- acompanhamento das fontes ----------
  async poll() {
    if (!this.proc) return;
    try {
      const r = await fetch(`http://127.0.0.1:${API_PORT}/v3/paths/list?itemsPerPage=200`, { signal: AbortSignal.timeout(2500) });
      if (!r.ok) return;
      const items = (await r.json()).items || [];
      this.paths = new Map(items.map((i) => [i.name, i]));
      if (this.status === 'starting') this.status = 'on';
    } catch {
      return;
    }
    const now = Date.now();
    const keys = new Set(this.cfg().sources.map((s) => s.key));
    for (const key of keys) {
      const p = this.paths.get(key);
      // taxa de entrada (kbps) para mostrar no painel
      const prev = this.rates.get(key);
      const bytes = p?.bytesReceived || 0;
      if (prev && bytes >= prev.bytes && now > prev.t) prev.kbps = Math.round(((bytes - prev.bytes) * 8) / (now - prev.t));
      this.rates.set(key, { bytes, t: now, kbps: prev?.kbps || 0 });
      const need = this.needs(p?.tracks);
      const c = this.conv.get(key);
      if (p?.ready && (need.video || need.audio)) {
        // codecs mudaram (ex.: drone trocou de H.264 para H.265): refaz a conversão
        if (c && (c.video !== need.video || c.audio !== need.audio)) this.stopConv(key);
        if (!this.conv.get(key)?.proc) this.startConv(key, need);
      } else if (c) this.stopConv(key);
    }
    for (const key of [...this.conv.keys()]) if (!keys.has(key)) this.stopConv(key);
  }

  startConv(key, need) {
    const old = this.conv.get(key);
    // conversão que caiu: espera um pouco antes de tentar de novo (fonte instável não vira um laço de processos)
    if (old?.retryAt && Date.now() < old.retryAt) return;
    const ff = this.ffmpegInfo.available ? this.ffmpegInfo.path : null;
    if (!ff) {
      this.conv.set(key, { video: need.video, audio: need.audio, error: 'FFmpeg indisponível para converter esta fonte.', retryAt: Date.now() + 10000 });
      return;
    }
    const enc = this.encoder();
    const args = ['-hide_banner', '-loglevel', 'error', '-fflags', 'nobuffer', '-flags', 'low_delay'];
    if (need.video) {
      // NVIDIA: decodifica e codifica na GPU sem passar os quadros pela memória do sistema
      if (enc.id === 'h264_nvenc') args.push('-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda');
      else args.push('-hwaccel', 'auto');
    }
    args.push('-rtsp_transport', 'tcp', '-i', `rtsp://127.0.0.1:${RTSP_PORT}/${key}`, '-map', '0:v:0?', '-map', '0:a:0?');
    if (!need.video) args.push('-c:v', 'copy');
    else if (enc.id === 'h264_nvenc') args.push('-c:v', 'h264_nvenc', '-preset', 'p2', '-tune', 'ull', '-rc', 'cbr', '-b:v', '8M', '-g', '60', '-bf', '0', '-profile:v', 'high');
    else if (enc.id === 'h264_qsv') args.push('-c:v', 'h264_qsv', '-preset', 'veryfast', '-b:v', '8M', '-g', '60', '-bf', '0', '-look_ahead', '0');
    else if (enc.id === 'h264_amf') args.push('-c:v', 'h264_amf', '-usage', 'ultralowlatency', '-quality', 'speed', '-b:v', '8M', '-g', '60', '-bf', '0');
    else if (enc.id === 'h264_videotoolbox') args.push('-c:v', 'h264_videotoolbox', '-realtime', '1', '-b:v', '8M', '-g', '60', '-bf', '0');
    // sem GPU: limita a 1080p para não pesar (4K de drone em x264 ocuparia vários núcleos)
    else args.push('-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-b:v', '6M', '-g', '60', '-bf', '0', '-pix_fmt', 'yuv420p');
    if (need.audio) args.push('-c:a', 'libopus', '-b:a', '128k', '-ar', '48000', '-ac', '2');
    else args.push('-c:a', 'copy');
    args.push('-f', 'rtsp', '-rtsp_transport', 'tcp', `rtsp://127.0.0.1:${RTSP_PORT}/${key}_web`);
    const proc = spawn(ff, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const c = { proc, video: need.video, audio: need.audio, since: Date.now(), error: null, err: '' };
    this.conv.set(key, c);
    console.log(`[ingest] ${key}: convertendo ${need.video ? 'vídeo→H.264 (' + enc.id + ')' : ''}${need.video && need.audio ? ' + ' : ''}${need.audio ? 'áudio→Opus' : ''}`);
    proc.stderr.on('data', (d) => (c.err = (c.err + d).slice(-600)));
    proc.on('error', (e) => (c.error = e.message));
    proc.on('close', (code) => {
      if (this.conv.get(key) !== c || c.stopped) return;
      c.proc = null;
      c.error = code ? `A conversão parou: ${c.err.trim().split('\n').pop() || 'código ' + code}` : null;
      c.retryAt = Date.now() + 3000;
      if (code) console.warn(`[ingest] ${key}: ${c.error}`);
    });
  }

  stopConv(key) {
    const c = this.conv.get(key);
    if (c?.proc) {
      c.stopped = true;
      c.proc.kill();
    }
    this.conv.delete(key);
  }

  // ---------- WHEP (estúdio -> MediaMTX), via este servidor para não depender de CORS nem expor a porta ----------
  async whep(key, sdp) {
    const src = this.info().sources.find((s) => s.key === key);
    if (!src) return { status: 404, body: 'Entrada não encontrada.' };
    if (!src.play) return { status: 409, body: src.live ? 'Preparando a conversão da imagem…' : 'Sem sinal desta entrada.' };
    const r = await fetch(`http://127.0.0.1:${WEBRTC_PORT}/${src.play}/whep`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: sdp,
      signal: AbortSignal.timeout(8000),
    });
    const body = await r.text();
    return { status: r.status, body, play: src.play };
  }
}
