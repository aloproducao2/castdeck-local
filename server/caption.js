// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Legenda ao vivo: gerencia o worker Rust (castdeck-caption, embutido no executável como o FFmpeg),
// baixa o modelo do Whisper na primeira vez, recebe o áudio do estúdio (PCM 16 kHz mono) e distribui
// o texto para o estúdio (desenha no PGM) e para o link público /cc/<estúdio> (página só com a legenda).
//
// O worker roda em processo separado e com prioridade baixa: se travar, só a legenda cai (é reiniciado)
// e, quando a CPU aperta, o encoder e o WebRTC têm preferência.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { renameRetry } from './binaries.js';

// Modelos GGUF do whisper.cpp (Hugging Face, licença MIT). Tamanhos aproximados.
// Medido (Windows, CPU de 6 núcleos, frase de ~8 s com ruído): small q8_0 ~0,9 s por frase; com busca em feixe ~1,6 s;
// base ~0,35 s. Só a família "small" teve precisão boa em português no uso real; o "básico" fica para PC fraco.
// O large-v3-turbo acertou tudo mas levou ~9 s por frase de 8 s na CPU (atrasa a live): fica para quando houver
// aceleração por GPU no worker. O q8_0 saiu mais rápido que o q5_1 nesta CPU (menos trabalho para desempacotar).
//   beam: busca em feixe nas frases finais · ctxMin: janela mínima do codificador · partials: parciais ao falar
export const CAPTION_MODELS = {
  equilibrado: { file: 'ggml-small-q8_0.bin', mb: 252, label: 'Equilibrado (recomendado)', beam: 1, ctxMin: 512, partials: true },
  preciso: { file: 'ggml-medium-q8_0.bin', mb: 1420, label: 'Preciso (modelo médio, mais lento)', beam: 5, ctxMin: 1024, partials: true },
  leve: { file: 'ggml-base-q5_1.bin', mb: 57, label: 'Básico (PC fraco, menos preciso)', beam: 1, ctxMin: 512, partials: true },
  parakeet: { file: 'parakeet-ptbr', mb: 890, label: 'Parakeet pt-BR (alta precisão)', beam: 1, ctxMin: 512, partials: true },
};
// configurações antigas salvas no estúdio
const MODEL_ALIAS = { qualidade: 'preciso', maximo: 'preciso' };
const MODEL_URL = (file) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${file}`;
const HISTORY = 60; // linhas finais guardadas para quem abre o link atrasado
const MAX_VIEWERS = 300;

// Dicionário embutido: vai como initial_prompt do Whisper para acertar grafia de termos comuns de live
// (nomes, marcas, clubes, tech). Quanto mais curto e relevante, melhor o efeito; o operador ainda adiciona
// as "Palavras do programa" no painel, que são anexadas.
const DICTIONARIES = {
  // sem frases de chamada ("inscreva-se", "obrigado por assistir"): o Whisper as repetia em música/ruído.
  pt: 'CastDeck YouTube Instagram TikTok Twitch Facebook WhatsApp Flamengo Corinthians Palmeiras São Paulo Vasco Grêmio Internacional Cruzeiro Atlético Mineiro Botafogo Fluminense Santos Bahia Fortaleza Ceará brasileirão campeonato gol pênalti impedimento VAR replay',
  en: 'CastDeck YouTube Instagram TikTok Twitch Facebook WhatsApp replay goal penalty offside VAR highlight',
  es: 'CastDeck YouTube Instagram TikTok Twitch Facebook WhatsApp gol penalti fuera de juego VAR repetición',
};

export class CaptionService {
  constructor({ deps, dataDir }) {
    this.deps = deps;
    this.dir = path.join(dataDir, 'models');
    this.proc = null;
    this.cfg = null; // { studioId, model, lang, mode, prompt }
    this.wanted = false; // o estúdio pediu a legenda ligada (reinicia sozinho se o worker cair)
    this.state = { status: 'off', error: null, download: null, ready: false };
    this.history = []; // { id, text, lang, t }
    this.partial = null;
    this.lastFinalText = ''; // para remover palavras repetidas entre segmentos consecutivos
    this.speaker = null; // { id, name, at } — dica de quem fala, enviada pelo estúdio (opcional)
    this.studios = new Set(); // WebSockets dos estúdios (recebem o texto)
    this.viewers = new Set(); // SSE do link público: { res, studioId, lang }
    this.restarts = 0;
    this.dl = null;
    this.buf = '';
    this.stats = { bytesIn: 0, lastMs: 0 };
  }

  available() {
    return this.deps.hasBundled('castdeck-caption') || this.deps.exists('castdeck-caption');
  }

  modelPath(id) {
    const m = CAPTION_MODELS[id] || CAPTION_MODELS.equilibrado;
    return path.join(this.dir, m.file);
  }

  hasModel(id) {
    try {
      return fs.statSync(this.modelPath(id)).size > 1e6;
    } catch {
      return false;
    }
  }

  parakeetDir() {
    return path.join(this.dir, 'parakeet-ptbr');
  }

  // ---------- gerenciamento de modelos (liberar espaço) ----------
  modelDiskSize(id) {
    const dirSize = (p) => {
      let total = 0;
      try {
        for (const e of fs.readdirSync(p, { withFileTypes: true })) {
          const q = path.join(p, e.name);
          total += e.isDirectory() ? dirSize(q) : fs.statSync(q).size;
        }
      } catch {}
      return total;
    };
    if (id === 'parakeet') return dirSize(this.parakeetDir());
    try {
      return fs.statSync(this.modelPath(id)).size;
    } catch {
      return 0;
    }
  }

  modelsInfo() {
    return Object.entries(CAPTION_MODELS).map(([id, m]) => ({
      id,
      label: m.label,
      expectedMb: m.mb,
      size: this.modelDiskSize(id),
      ready: id === 'parakeet' ? this.hasParakeetModel() : this.hasModel(id),
    }));
  }

  deleteModel(id) {
    if (!CAPTION_MODELS[id]) throw new Error('Modelo desconhecido');
    if (this.wanted && this.cfg?.model === id) throw new Error('Desligue a legenda antes de apagar este modelo.');
    const target = id === 'parakeet' ? this.parakeetDir() : this.modelPath(id);
    const base = path.resolve(this.dir);
    if (!path.resolve(target).startsWith(base + path.sep)) throw new Error('Caminho inválido');
    fs.rmSync(target, { recursive: true, force: true });
    this.push({ type: 'status', ...this.info() });
    return this.modelsInfo();
  }

  hasParakeetModel() {
    try {
      return fs.statSync(path.join(this.parakeetDir(), 'encoder-model.int8.onnx')).size > 1e6;
    } catch {
      return false;
    }
  }

  info(studioId = null) {
    const models = Object.fromEntries(Object.entries(CAPTION_MODELS).map(([id, m]) => [id, { ...m, ready: id === 'parakeet' ? this.hasParakeetModel() : this.hasModel(id) }]));
    return {
      available: this.available(),
      ...this.state,
      cfg: this.cfg,
      models,
      viewers: [...this.viewers].filter((v) => !studioId || v.studioId === studioId).length,
      history: studioId && this.cfg?.studioId === studioId ? this.history.slice(-8) : [],
      lastMs: this.stats.lastMs,
    };
  }

  // ---------- modelo ----------
  async downloadModel(id) {
    if (!CAPTION_MODELS[id]) throw new Error('Modelo desconhecido');
    if (this.hasModel(id)) return this.modelPath(id);
    // dois níveis podem usar o mesmo arquivo (equilibrado/preciso): o download é por arquivo
    if (this.dl?.file === CAPTION_MODELS[id].file) return this.dl.promise;
    if (this.dl) throw new Error('Já existe um download de modelo em andamento');
    const dest = this.modelPath(id);
    const st = (this.state.download = { id, progress: 0, error: null });
    const promise = (async () => {
      await fsp.mkdir(this.dir, { recursive: true });
      const tmp = dest + '.part';
      try {
        const res = await fetch(MODEL_URL(CAPTION_MODELS[id].file), { redirect: 'follow' });
        if (!res.ok || !res.body) throw new Error(`download falhou (${res.status})`);
        const total = Number(res.headers.get('content-length')) || CAPTION_MODELS[id].mb * 1048576;
        let got = 0;
        const src = Readable.fromWeb(res.body);
        src.on('data', (c) => {
          got += c.length;
          st.progress = Math.min(99, Math.round((got / total) * 100));
        });
        await pipeline(src, fs.createWriteStream(tmp));
        await renameRetry(tmp, dest);
        st.progress = 100;
        this.state.download = null;
        this.push({ type: 'status', ...this.info() });
        return dest;
      } catch (e) {
        await fsp.rm(tmp, { force: true }).catch(() => {});
        st.error = e.message;
        throw e;
      } finally {
        this.dl = null;
      }
    })();
    this.dl = { id, file: CAPTION_MODELS[id].file, promise };
    promise.catch(() => {});
    return promise;
  }

  async downloadParakeetModel() {
    if (this.hasParakeetModel()) return this.parakeetDir();
    const dest = this.parakeetDir();
    const base = 'https://huggingface.co/calneymgp/parakeet-tdt-0.6b-v3-ptBR-TAGARELA-onnx-int8/resolve/main';
    const files = ['config.json', 'decoder_joint-model.int8.onnx', 'encoder-model.int8.onnx', 'nemo128.onnx', 'vocab.txt'];
    const st = (this.state.download = { id: 'parakeet', progress: 0, error: null });
    try {
      await fsp.mkdir(dest, { recursive: true });
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const res = await fetch(`${base}/${f}`, { redirect: 'follow' });
        if (!res.ok || !res.body) throw new Error(`download ${f} falhou (${res.status})`);
        const tmp = path.join(dest, f + '.part');
        await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
        await renameRetry(tmp, path.join(dest, f));
        st.progress = Math.round(((i + 1) / files.length) * 100);
      }
      this.state.download = null;
      this.push({ type: 'status', ...this.info() });
      return dest;
    } catch (e) {
      st.error = e.message;
      throw e;
    } finally {
      this.state.download = null;
    }
  }

  // ---------- worker ----------
  async start(cfg) {
    const next = {
      studioId: String(cfg.studioId || ''),
      model: CAPTION_MODELS[MODEL_ALIAS[cfg.model] || cfg.model] ? MODEL_ALIAS[cfg.model] || cfg.model : 'equilibrado',
      lang: /^(auto|[a-z]{2})$/.test(cfg.lang || '') ? cfg.lang : 'pt',
      mode: ['orig', 'en', 'both'].includes(cfg.mode) ? cfg.mode : 'orig',
      prompt: '',
    };
    const dict = DICTIONARIES[next.lang === 'auto' ? 'pt' : next.lang] || DICTIONARIES.pt;
    next.prompt = [dict, String(cfg.prompt || '').slice(0, 300)].filter(Boolean).join(' ').trim().slice(0, 420);
    if (!this.available()) throw new Error('A legenda ao vivo ainda não está disponível neste sistema (só Windows x64 nesta versão).');
    this.wanted = true;
    const same = this.proc && this.cfg && JSON.stringify(this.cfg) === JSON.stringify(next);
    if (same) return this.info(next.studioId);
    if (this.cfg?.studioId !== next.studioId) {
      this.history = [];
      this.partial = null;
      this.lastFinalText = '';
    }
    this.cfg = next;
    this.speaker = null;
    this.kill();
    if (next.model !== 'parakeet' && !this.hasModel(next.model)) {
      this.state.status = 'downloading';
      this.push({ type: 'status', ...this.info() });
      try {
        await this.downloadModel(next.model);
      } catch (e) {
        this.state.status = 'error';
        this.state.error = 'Não foi possível baixar o modelo: ' + e.message;
        this.push({ type: 'status', ...this.info() });
        throw new Error(this.state.error);
      }
      if (!this.wanted || this.cfg !== next) return this.info(next.studioId);
    }
    if (next.model === 'parakeet' && !this.hasParakeetModel()) {
      this.state.status = 'downloading';
      this.push({ type: 'status', ...this.info() });
      try {
        await this.downloadParakeetModel();
      } catch (e) {
        this.state.status = 'error';
        this.state.error = 'Não foi possível baixar o modelo Parakeet: ' + e.message;
        this.push({ type: 'status', ...this.info() });
        throw new Error(this.state.error);
      }
      if (!this.wanted || this.cfg !== next) return this.info(next.studioId);
    }
    await this.spawnWorker();
    return this.info(next.studioId);
  }

  async spawnParakeetWorker() {
    const c = this.cfg;
    const exe = await this.deps.ensure('castdeck-parakeet');
    const args = ['--model', this.parakeetDir(), '--lang', c.lang];
    this.state.status = 'starting';
    this.state.error = null;
    this.state.ready = false;
    this.push({ type: 'status', ...this.info() });
    let p;
    try {
      p = spawn(exe, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], cwd: path.dirname(exe) });
    } catch (e) {
      this.state.status = 'error';
      this.state.error = 'Falha ao iniciar o motor Parakeet: ' + e.message;
      this.push({ type: 'status', ...this.info() });
      return;
    }
    this.proc = p;
    this.buf = '';
    let errTail = '';
    p.stderr.on('data', (d) => (errTail = (errTail + d).slice(-2000)));
    p.stdin.on('error', () => {});
    p.stdout.on('data', (d) => this.onData(d));
    p.on('error', (e) => {
      this.state.status = 'error';
      this.state.error = e.message;
      this.push({ type: 'status', ...this.info() });
    });
    p.on('close', (code) => {
      if (this.proc !== p) return;
      this.proc = null;
      this.state.ready = false;
      if (!this.wanted) {
        this.state.status = 'off';
        this.push({ type: 'status', ...this.info() });
        return;
      }
      this.restarts++;
      this.state.status = this.restarts > 5 ? 'error' : 'starting';
      if (!this.state.error) this.state.error = `o reconhecedor Parakeet parou (código ${code})${errTail ? ': ' + errTail.trim().split('\n').pop() : ''}`;
      this.push({ type: 'status', ...this.info() });
      if (this.restarts <= 5) setTimeout(() => this.wanted && !this.proc && this.spawnWorker().catch(() => {}), Math.min(10000, 1000 * this.restarts));
    });
  }

  async spawnWorker() {
    const c = this.cfg;
    if (c.model === 'parakeet') return this.spawnParakeetWorker();
    const exe = await this.deps.ensure('castdeck-caption');
    const m = CAPTION_MODELS[c.model];
    const threads = Math.max(2, Math.min(m.file.includes('large') || m.file.includes('medium') ? 8 : 6, Math.floor(os.cpus().length / 2)));
    const args = ['--model', this.modelPath(c.model), '--lang', c.lang, '--translate', c.mode === 'en' ? '1' : '0', '--dual', c.mode === 'both' ? '1' : '0', '--threads', String(threads), '--partials', m.partials ? '1' : '0', '--beam', String(m.beam), '--ctx-min', String(m.ctxMin)];
    if (c.prompt) args.push('--prompt', c.prompt);
    this.state.status = 'starting';
    this.state.error = null;
    this.state.ready = false;
    this.push({ type: 'status', ...this.info() });
    const p = spawn(exe, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc = p;
    this.buf = '';
    try {
      os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
    } catch {}
    let errTail = '';
    p.stderr.on('data', (d) => {
      errTail = (errTail + d).slice(-2000);
    });
    p.stdin.on('error', () => {});
    p.stdout.on('data', (d) => this.onData(d));
    p.on('error', (e) => {
      this.state.status = 'error';
      this.state.error = e.message;
      this.push({ type: 'status', ...this.info() });
    });
    p.on('close', (code) => {
      if (this.proc !== p) return;
      this.proc = null;
      this.state.ready = false;
      if (!this.wanted) {
        this.state.status = 'off';
        this.push({ type: 'status', ...this.info() });
        return;
      }
      // caiu sozinho: reinicia com espera crescente (não fica num laço se o modelo estiver corrompido)
      this.restarts++;
      this.state.status = this.restarts > 5 ? 'error' : 'starting';
      if (!this.state.error) this.state.error = `o reconhecedor parou (código ${code})${errTail ? ': ' + errTail.trim().split('\n').pop() : ''}`;
      this.push({ type: 'status', ...this.info() });
      if (this.restarts <= 5) setTimeout(() => this.wanted && !this.proc && this.spawnWorker().catch(() => {}), Math.min(10000, 1000 * this.restarts));
    });
  }

  onData(d) {
    this.buf += d;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      this.onEvent(ev);
    }
  }

  // Whisper inventa frases de chamada quando o áudio é música/ruído (o dicionário antigo até induzia isso).
  // Descarta apenas quando o texto é composto por essas frases — fala real com outras palavras passa.
  isHallucination(text) {
    const norm = (s) =>
      String(s || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const t = norm(text);
    if (!t || t.length > 90) return false;
    const CTA = new Set([
      'inscreva se no canal', 'se inscreva no canal', 'inscrevase no canal', 'inscreva no canal',
      'obrigado por assistir', 'obrigada por assistir', 'curta e compartilhe', 'deixe seu like',
      'ative o sininho', 'legendas pela comunidade', 'subtitles by', 'amara org',
      'thank you for watching', 'like and subscribe', 'subscribe to my channel',
      'gracias por ver', 'suscribete al canal', 'dale like y comparte',
    ]);
    if (CTA.has(t)) return true;
    const words = t.split(' ');
    if (words.length > 8) return false;
    const FILLER = new Set(['o', 'a', 'os', 'as', 'no', 'na', 'do', 'da', 'de', 'e', 'se', 'por', 'para', 'em', 'the', 'to', 'my', 'and', 'y', 'el', 'al']);
    const CTAW = new Set([
      'inscreva', 'inscrevase', 'canal', 'obrigado', 'obrigada', 'assistir', 'compartilhe', 'curta',
      'like', 'sininho', 'legendas', 'comunidade', 'subtitles', 'amara', 'subscribe', 'watching',
      'gracias', 'suscribete', 'dale', 'comparte', 'deixe', 'ative',
    ]);
    return words.some((w) => CTAW.has(w)) && words.every((w) => CTAW.has(w) || FILLER.has(w));
  }

  onEvent(ev) {
    const c = this.cfg || {};
    const primary = c.mode === 'en' ? 'en' : c.lang === 'auto' ? 'auto' : c.lang;
    if (ev.type === 'ready') {
      this.state.status = 'running';
      this.state.ready = true;
      this.state.error = null;
      this.restarts = 0;
      this.push({ type: 'status', ...this.info() });
      return;
    }
    if (ev.type === 'error') {
      this.state.error = ev.error;
      this.push({ type: 'status', ...this.info() });
      return;
    }
    if (ev.type === 'vad') return this.push({ type: 'vad', speech: !!ev.speech });
    if (ev.type !== 'partial' && ev.type !== 'final') return;
    if (ev.text && this.isHallucination(ev.text)) {
      if (ev.type === 'final') this.partial = null;
      return;
    }
    if (ev.ms) this.stats.lastMs = ev.ms;
    const lang = ev.lang || primary;
    const msg = { type: ev.type, id: ev.id, text: String(ev.text || ''), lang, t: Date.now() };
    const spk = this.freshSpeaker();
    if (spk) msg.speaker = spk;
    if (ev.type === 'final') {
      if (lang === primary) this.partial = null;
      // remove palavras repetidas na emenda entre dois segmentos (o corte pode repetir a última sílaba/palavra)
      if (msg.text && lang === primary) {
        const prev = this.lastFinalText.split(/\s+/).filter(Boolean);
        const cur = msg.text.split(/\s+/).filter(Boolean);
        let k = 0;
        while (k < 3 && k < prev.length && k < cur.length && prev[prev.length - 1 - k].toLowerCase() === cur[k].toLowerCase()) k++;
        if (k > 0) msg.text = cur.slice(k).join(' ');
      }
      if (msg.text) {
        if (lang === primary) this.lastFinalText = msg.text;
        this.history.push(msg);
        if (this.history.length > HISTORY * 2) this.history.splice(0, this.history.length - HISTORY * 2);
      }
    } else this.partial = msg;
    this.push(msg);
  }

  // áudio do estúdio (PCM s16le 16 kHz mono). Se o worker estiver atrasado, descarta em vez de acumular.
  feed(buf) {
    const p = this.proc;
    if (!p || !this.state.ready || !p.stdin.writable) return;
    if (p.stdin.writableLength > 256 * 1024) return;
    this.stats.bytesIn += buf.length;
    p.stdin.write(buf);
  }

  stop() {
    this.wanted = false;
    this.speaker = null;
    this.kill();
    this.state.status = 'off';
    this.state.ready = false;
    this.partial = null;
    this.push({ type: 'status', ...this.info() });
    this.push({ type: 'clear' });
  }

  kill(now = false) {
    const p = this.proc;
    this.proc = null;
    if (!p) return;
    try {
      p.stdin.end();
    } catch {}
    if (now) {
      try {
        p.kill();
      } catch {}
      return;
    }
    setTimeout(() => {
      try {
        p.kill();
      } catch {}
    }, 1500);
  }

  // ---------- distribuição ----------
  push(msg) {
    const s = JSON.stringify(msg);
    for (const ws of this.studios) {
      if (ws.readyState === 1) ws.send(s);
    }
    if (msg.type === 'status' || msg.type === 'vad') return;
    const sid = this.cfg?.studioId;
    for (const v of this.viewers) {
      if (v.studioId !== sid) continue;
      try {
        v.res.write(`data: ${s}\n\n`);
      } catch {}
    }
  }

  // dica de quem fala: vale por 1,2 s (o estúdio só manda quando a opção está ligada)
  freshSpeaker() {
    const s = this.speaker;
    if (!s || !s.name) return null;
    if (Date.now() - s.at > 1200) return null;
    return { id: s.id || '', name: String(s.name).slice(0, 24) };
  }

  // WebSocket do estúdio: manda áudio (binário) e dicas de falante (texto JSON); recebe o texto
  handleStudio(ws) {
    this.studios.add(ws);
    ws.send(JSON.stringify({ type: 'status', ...this.info(this.cfg?.studioId) }));
    ws.on('message', (data, isBinary) => {
      if (isBinary) return this.feed(Buffer.isBuffer(data) ? data : Buffer.from(data));
      try {
        const m = JSON.parse(String(data));
        if (m?.type === 'speaker' && this.cfg && typeof m.name === 'string' && m.name.trim()) {
          this.speaker = { id: String(m.id || ''), name: m.name.trim().slice(0, 24), at: Date.now() };
        }
      } catch {}
    });
    ws.on('close', () => this.studios.delete(ws));
    ws.on('error', () => {});
  }

  // SSE do link público (/api/cc/:id/stream)
  addViewer(req, res, studioId) {
    if (this.viewers.size >= MAX_VIEWERS) return res.status(503).json({ error: 'Muitas pessoas vendo a legenda agora. Tente de novo em instantes.' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const v = { res, studioId };
    this.viewers.add(v);
    const live = this.cfg?.studioId === studioId && this.wanted;
    res.write(`data: ${JSON.stringify({ type: 'hello', live, history: live ? this.history.slice(-HISTORY) : [], partial: live ? this.partial : null })}\n\n`);
    // mantém a conexão viva atravessando proxies/túnel
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {}
    }, 20000);
    req.on('close', () => {
      clearInterval(ping);
      this.viewers.delete(v);
    });
  }

  // derruba quem estava vendo pelo link antigo (ao gerar um link novo)
  dropViewers(studioId) {
    for (const v of [...this.viewers]) {
      if (v.studioId !== studioId) continue;
      try {
        v.res.write(`data: ${JSON.stringify({ type: 'revoked' })}\n\n`);
        v.res.end();
      } catch {}
      this.viewers.delete(v);
    }
  }
}
