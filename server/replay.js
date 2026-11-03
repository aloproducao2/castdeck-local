// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Core de Gerenciamento e Armazenamento dos Clipes de Replay no Servidor Local.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

// Mesmo limite do cliente (setBufferDuration): 10 a 180 s. Antes o servidor aceitava qualquer
// valor > 0, então um config antigo podia pedir 5 s ou 1000 s e o console mostrava outra coisa.
const clampBufferSecs = (v) => Math.max(10, Math.min(180, Math.round(Number(v) || 45)));

export class ReplayStore {
  constructor({ recordingsDir, ffmpegInfo, dataDir }) {
    this._getRecordingsDir = typeof recordingsDir === 'function' ? recordingsDir : () => recordingsDir;
    this._dataDir = dataDir || path.join(process.cwd(), 'data');
    this._ffmpegInfo = ffmpegInfo;
    this.maxDiskMb = 2048; // Limite padrão de 2 GB (0 = sem limite, até encher o disco)
    this.maxBufferSecs = 45; // Buffer padrão de 45 segundos
    this.customReplayDir = null; // Diretório escolhido pelo usuário
    this.activeMatchSession = null; // Sessão de gravação contínua de jogo de futebol
    this.loadConfig();
  }

  get configPath() {
    try {
      if (!fs.existsSync(this._dataDir)) fs.mkdirSync(this._dataDir, { recursive: true });
    } catch {}
    return path.join(this._dataDir, 'replay-config.json');
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const cfg = JSON.parse(raw);
        if (typeof cfg.maxDiskMb === 'number' && cfg.maxDiskMb >= 0) this.maxDiskMb = cfg.maxDiskMb;
        if (typeof cfg.maxBufferSecs === 'number' && cfg.maxBufferSecs > 0) this.maxBufferSecs = clampBufferSecs(cfg.maxBufferSecs);
        if (typeof cfg.customReplayDir === 'string') this.customReplayDir = cfg.customReplayDir.trim() || null;
      }
    } catch {}
  }

  async saveConfig(cfg = {}) {
    if (typeof cfg.maxDiskMb === 'number' && cfg.maxDiskMb >= 0) this.maxDiskMb = cfg.maxDiskMb;
    if (typeof cfg.maxBufferSecs === 'number' && cfg.maxBufferSecs > 0) this.maxBufferSecs = clampBufferSecs(cfg.maxBufferSecs);
    if (typeof cfg.customReplayDir === 'string') {
      const trimmed = cfg.customReplayDir.trim();
      this.customReplayDir = trimmed ? path.resolve(trimmed) : null;
    } else if (cfg.customReplayDir === null) {
      this.customReplayDir = null;
    }
    try {
      await fsp.writeFile(this.configPath, JSON.stringify({
        maxDiskMb: this.maxDiskMb,
        maxBufferSecs: this.maxBufferSecs,
        customReplayDir: this.customReplayDir,
        updatedAt: Date.now(),
      }, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[replay] Falha ao persistir configuração:', err.message);
    }
    // Garante que o diretório configurado existe
    try {
      if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    } catch {}

    await this.pruneDiskStorage();
    return this.getStorageUsage();
  }

  get defaultDir() {
    return path.join(this._getRecordingsDir(), 'replays');
  }

  get dir() {
    const d = this.customReplayDir ? path.resolve(this.customReplayDir) : this.defaultDir;
    try {
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    } catch {}
    return d;
  }

  get ffmpegPath() {
    return this._ffmpegInfo?.path || 'ffmpeg';
  }

  // Duração real do arquivo (o MediaRecorder grava sem duração e o relógio de parede mente
  // quando algum pedaço se perde). `ffmpeg -i` só lê o cabeçalho e imprime "Duration:" no stderr.
  probeDuration(file) {
    if (!this._ffmpegInfo?.available) return Promise.resolve(null);
    return new Promise((resolve) => {
      let err = '';
      let p;
      try {
        p = spawn(this.ffmpegPath, ['-hide_banner', '-i', file], { windowsHide: true });
      } catch {
        return resolve(null);
      }
      p.on('error', () => resolve(null));
      p.stderr.on('data', (d) => { err += d.toString(); if (err.length > 65536) err = err.slice(-65536); });
      p.on('close', () => {
        const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
        resolve(m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : null);
      });
    });
  }

  async getStorageUsage() {
    const files = await fsp.readdir(this.dir).catch(() => []);
    let usedBytes = 0;
    let clipCount = 0;

    // Só arquivos de clipe entram na conta: configuração e temporários de remux não são mídia.
    const isClipJson = (f) => f.endsWith('.json') && f !== 'replay-config.json';
    const isClipMedia = (f) => /\.(webm|mp4)$/i.test(f) && !f.endsWith('.remux.webm');
    for (const f of files) {
      if (isClipJson(f)) clipCount++;
      if (!isClipJson(f) && !isClipMedia(f)) continue;
      try {
        const stat = await fsp.stat(path.join(this.dir, f));
        usedBytes += stat.size;
      } catch {}
    }

    const usedMb = +(usedBytes / (1024 * 1024)).toFixed(1);

    // Consulta espaço livre real na partição / disco selecionado via statfs nativo
    let freeDiskBytes = 0;
    try {
      if (typeof fsp.statfs === 'function') {
        const st = await fsp.statfs(this.dir);
        freeDiskBytes = Number(st.bavail || st.bfree || 0) * Number(st.bsize || 4096);
      }
    } catch {}
    const freeDiskMb = +(freeDiskBytes / (1024 * 1024)).toFixed(1);

    const maxDiskBytes = this.maxDiskMb * 1024 * 1024;
    let usagePercent = 0;
    if (this.maxDiskMb > 0) {
      usagePercent = Math.min(100, Math.round((usedBytes / maxDiskBytes) * 100));
    } else if (freeDiskBytes > 0) {
      // Modo sem limite (até encher o disco): calcula uso em relação ao espaço total do drive
      const totalDriveBytes = usedBytes + freeDiskBytes;
      usagePercent = totalDriveBytes > 0 ? Math.min(100, Math.round((usedBytes / totalDriveBytes) * 100)) : 0;
    }

    return {
      usedBytes,
      usedMb,
      freeDiskBytes,
      freeDiskMb,
      maxDiskMb: this.maxDiskMb,
      maxDiskBytes,
      usagePercent,
      clipCount,
      maxBufferSecs: this.maxBufferSecs,
      replayDir: this.dir,
      defaultDir: this.defaultDir,
      isCustomDir: Boolean(this.customReplayDir && path.resolve(this.customReplayDir) !== path.resolve(this.defaultDir)),
    };
  }

  // Auto-prune inteligente: se o limite de cota for excedido (ou disco estiver com < 500 MB livre)
  async pruneDiskStorage() {
    // A partida que está sendo gravada NUNCA entra no descarte: o JSON dela tem startedAt e não createdAt,
    // então ordenava como a "mais antiga" e era apagada no meio do jogo quando a cota enchia.
    const activeId = this.activeMatchSession?.id;
    // Protege só a partida realmente ativa. JSON `inProgress` órfão (crash) precisa poder ser podado,
    // senão a cota enche e o prune nunca consegue liberar espaço.
    const clips = (await this.listClips()).filter((c) => c.id !== activeId);
    clips.sort((a, b) => (a.createdAt || a.startedAt || 0) - (b.createdAt || b.startedAt || 0));

    let stats = await this.getStorageUsage();
    let prunedCount = 0;

    // Se houver limite configurado em MB
    if (this.maxDiskMb > 0) {
      const maxBytes = this.maxDiskMb * 1024 * 1024;
      while (stats.usedBytes > maxBytes && clips.length > 0) {
        const oldest = clips.shift();
        if (!oldest?.id) break;
        await this.deleteClip(oldest.id);
        prunedCount++;
        stats = await this.getStorageUsage();
      }
    } else if (stats.freeDiskBytes > 0 && stats.freeDiskBytes < 500 * 1024 * 1024) {
      // Proteção de disco cheio: se restar menos de 500 MB no HD, descarta o clipe mais antigo
      while (stats.freeDiskBytes < 500 * 1024 * 1024 && clips.length > 0) {
        const oldest = clips.shift();
        if (!oldest?.id) break;
        await this.deleteClip(oldest.id);
        prunedCount++;
        stats = await this.getStorageUsage();
      }
    }

    if (prunedCount > 0) {
      console.log(`[replay] Auto-prune de disco executado: ${prunedCount} clipe(s) removido(s) para proteger armazenamento.`);
    }
  }

  // Limpa SOMENTE clipes de replay/partida. Nunca apaga a partida em andamento, a configuração
  // nem arquivos que o operador tenha na pasta (antes o botão dava unlink em tudo).
  async clearAllClips() {
    const activeId = this.activeMatchSession?.id;
    const clips = await this.listClips();
    const known = new Set();
    let freedBytes = 0;
    let removed = 0;
    let skipped = 0;

    const sizeOf = async (fp) => {
      try { return (await fsp.stat(fp)).size; } catch { return 0; }
    };

    for (const c of clips) {
      if (!c?.id) continue;
      known.add(c.id);
      if (c.id === activeId || c.inProgress) { skipped++; continue; }
      const files = [`${c.id}.webm`, `${c.id}.mp4`, `${c.id}.json`].map((f) => path.join(this.dir, f));
      for (const fp of files) freedBytes += await sizeOf(fp);
      try {
        await this.deleteClip(c.id);
        removed++;
      } catch {}
    }

    // Mídia órfã (sem JSON) só se tiver o prefixo dos clipes desta ferramenta; nunca a partida ativa.
    const files = await fsp.readdir(this.dir).catch(() => []);
    for (const f of files) {
      if (!/^(replay-|jogo-|clip_).+\.(webm|mp4|jpg)$/i.test(f)) continue;
      if (f.endsWith('.remux.webm')) continue;
      const id = f.replace(/\.(webm|mp4|jpg)$/i, '');
      if (id === activeId || known.has(id)) continue;
      const fp = path.join(this.dir, f);
      freedBytes += await sizeOf(fp);
      try { await fsp.unlink(fp); removed++; } catch {}
    }

    console.log(`[replay] Limpeza de armazenamento: ${removed} clipe(s), ${skipped} preservado(s) (ativo/config).`);
    return { ok: true, freedBytes, freedMb: +(freedBytes / (1024 * 1024)).toFixed(1), removed, skipped };
  }

  async saveClip(buffer, metadata = {}) {
    const id = metadata.id || `replay-${Date.now()}`;
    const webmFile = path.join(this.dir, `${id}.webm`);
    const mp4File = path.join(this.dir, `${id}.mp4`);
    const jsonFile = path.join(this.dir, `${id}.json`);

    await fsp.writeFile(webmFile, buffer);

    // Salva metadados do clipe (duração, velocidade, tag, ângulo)
    const meta = {
      id,
      title: metadata.title || 'Lance Gravado',
      tag: metadata.tag || 'LANCE',
      duration: metadata.duration || 10,
      speed: metadata.speed || 0.5,
      sourceId: metadata.sourceId || 'pgm',
      markIn: Number.isFinite(metadata.markIn) ? metadata.markIn : null,
      markOut: Number.isFinite(metadata.markOut) ? metadata.markOut : null,
      createdAt: Date.now(),
      webmUrl: `/api/replay/file/${encodeURIComponent(path.basename(webmFile))}`,
      mp4Url: null,
    };

    // Remux rápido (sem recodificar) para gravar duração e índice de busca (Cues) no WebM do MediaRecorder
    if (await this.remuxSeekable(webmFile)) meta.seekable = true;
    // Duração real do arquivo (o cliente manda uma estimativa; o cabeçalho é a fonte da verdade)
    const realDuration = await this.probeDuration(webmFile);
    if (realDuration && realDuration > 0) meta.duration = +realDuration.toFixed(2);

    await fsp.writeFile(jsonFile, JSON.stringify(meta, null, 2), 'utf-8');

    // Executa auto-prune para nunca exceder a cota configurada pelo operador
    await this.pruneDiskStorage();

    return meta;
  }

  // Miniatura JPEG do lance (gerada no console). Fica ao lado do vídeo para a lista abrir instantânea
  // depois de reiniciar — sem precisar recarregar 1 quadro de cada vídeo.
  async saveThumb(id, buffer) {
    const safeId = String(id || '').replace(/[^\w.-]/g, '');
    if (!safeId || !Buffer.isBuffer(buffer) || buffer.length < 4) return null;
    if (buffer.length > 400 * 1024) return null;
    // Assinatura JPEG (FF D8): recusa qualquer outra coisa em vez de gravar lixo no diretório.
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
    const file = path.join(this.dir, `${safeId}.jpg`);
    try {
      await fsp.writeFile(file, buffer);
      return `/api/replay/thumb/${encodeURIComponent(safeId)}`;
    } catch (err) {
      console.warn('[replay] Falha ao salvar miniatura:', err.message);
      return null;
    }
  }

  // -------------------------------------------------------------
  // GRAVAÇÃO CONTÍNUA DE JOGO DE FUTEBOL / PARTIDA DIRETO NO DISCO
  // -------------------------------------------------------------
  async startMatchRecording({ sourceId = 'pgm', title = 'Partida Contínua' } = {}) {
    if (this.activeMatchSession) {
      // Sessão sem heartbeat/pedaço há 15 s = cliente morreu (janela fechada/crash). Finaliza
      // a partida antiga e deixa começar outra, em vez de bloquear o REC para sempre.
      if (this.isMatchStale()) {
        console.warn('[replay] Sessão de partida sem heartbeat — finalizando antes de iniciar outra.');
        await this.stopMatchRecording().catch(() => {});
      } else {
        return { ok: true, session: this.getMatchStatus().session, alreadyActive: true };
      }
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const id = `jogo-${dateStr}`;

    const webmFile = path.join(this.dir, `${id}.webm`);
    const jsonFile = path.join(this.dir, `${id}.json`);

    this.activeMatchSession = {
      id,
      title: title || `Partida ${dateStr}`,
      filePath: webmFile,
      jsonPath: jsonFile,
      sourceId,
      startedAt: Date.now(),
      lastChunkAt: Date.now(),
      bytesWritten: 0,
      chunkCount: 0,
    };

    // Cria arquivo vazio
    await fsp.writeFile(webmFile, Buffer.alloc(0));

    // Salva metadados iniciais
    await fsp.writeFile(jsonFile, JSON.stringify({
      id,
      title: this.activeMatchSession.title,
      tag: 'PARTIDA',
      isContinuousMatch: true,
      inProgress: true,
      sourceId,
      startedAt: this.activeMatchSession.startedAt,
      duration: 0,
      bytes: 0,
      webmUrl: `/api/replay/file/${encodeURIComponent(path.basename(webmFile))}`,
      mp4Url: null,
    }, null, 2), 'utf-8');

    console.log(`[replay] Gravação contínua de partida iniciada: ${webmFile}`);
    return { ok: true, session: this.getMatchStatus().session };
  }

  // O WebM do MediaRecorder não tem duração nem Cues (player mostra "Infinity" e a busca fica lenta/errada).
  // `-c copy` para outro WebM reescreve o contêiner com os dois, sem recodificar (segundos mesmo para 90 min).
  // MP4 com `-c:v copy` não funciona: VP8 não é aceito em MP4 e a conversão antiga sempre falhava.
  async remuxSeekable(webmFile) {
    if (!this._ffmpegInfo?.available) return false;
    const tmp = `${webmFile}.remux.webm`;
    const ok = await new Promise((resolve) => {
      const p = spawn(this.ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', '-i', webmFile, '-c', 'copy', '-y', tmp], { windowsHide: true });
      p.on('error', () => resolve(false));
      p.on('close', (code) => resolve(code === 0));
    });
    try {
      if (ok && fs.existsSync(tmp) && fs.statSync(tmp).size > 0) {
        await fsp.rename(tmp, webmFile);
        return true;
      }
    } catch (err) {
      console.warn('[replay] Falha ao substituir arquivo remuxado:', err.message);
    }
    await fsp.unlink(tmp).catch(() => {});
    return false;
  }

  async appendMatchChunk(buffer) {
    // Sem sessão = pedaço atrasado de uma partida já encerrada. Antes isso criava uma sessão nova só com esse
    // pedaço (arquivo sem cabeçalho, impossível de tocar, que nunca era fechado).
    const session = this.activeMatchSession;
    if (!session?.filePath) return { ok: false, error: 'Sem sessão ativa' };

    // Escrita serializada: dois POSTs simultâneos não podem intercalar bytes no arquivo.
    // O catch antes do then é essencial: sem ele, UMA falha de disco deixava a cadeia rejeitada
    // e todos os pedaços seguintes falhavam em cascata (arquivo truncado sem aviso).
    session.lastChunkAt = Date.now();
    session.writeChain = (session.writeChain || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        await fsp.appendFile(session.filePath, buffer);
        session.bytesWritten += buffer.length;
        session.chunkCount++;
      });
    await session.writeChain;

    // Verifica espaço em disco a cada ~10 chunks
    if (session.chunkCount % 10 === 0) {
      await this.pruneDiskStorage();
    }

    return {
      ok: true,
      bytesWritten: session.bytesWritten,
      duration: Math.round((Date.now() - session.startedAt) / 1000),
    };
  }

  async stopMatchRecording() {
    if (!this.activeMatchSession) {
      return { ok: false, error: 'Nenhuma gravação de partida em andamento' };
    }

    const session = this.activeMatchSession;
    this.activeMatchSession = null;
    await session.writeChain?.catch(() => {});

    const duration = Math.max(1, Math.round((Date.now() - session.startedAt) / 1000));

    const meta = {
      id: session.id,
      title: session.title,
      tag: 'PARTIDA',
      isContinuousMatch: true,
      inProgress: false,
      sourceId: session.sourceId,
      createdAt: session.startedAt,
      duration,
      bytes: session.bytesWritten,
      webmUrl: `/api/replay/file/${encodeURIComponent(path.basename(session.filePath))}`,
      mp4Url: null,
    };

    await fsp.writeFile(session.jsonPath, JSON.stringify(meta, null, 2), 'utf-8');
    console.log(`[replay] Gravação contínua de partida encerrada: ${session.id} (${duration}s, ${(session.bytesWritten / (1024 * 1024)).toFixed(1)} MB)`);

    // Remux em segundo plano (pode levar alguns segundos num jogo inteiro): o arquivo já toca antes disso
    if (session.bytesWritten > 0) {
      this.remuxSeekable(session.filePath).then(async (ok) => {
        if (!ok) return;
        const real = await this.probeDuration(session.filePath);
        if (real && real > 0) meta.duration = +real.toFixed(2);
        meta.seekable = true;
        await fsp.writeFile(session.jsonPath, JSON.stringify(meta, null, 2), 'utf-8').catch(() => {});
        console.log(`[replay] Partida finalizada com duração e índice de busca: ${session.filePath}`);
      });
    }

    return { ok: true, clip: meta };
  }

  // Sessão sem pedaço/heartbeat há 15 s: cliente morreu (janela fechada/crash).
  isMatchStale(ms = 15000) {
    const s = this.activeMatchSession;
    if (!s) return false;
    return Date.now() - (s.lastChunkAt || s.startedAt || 0) > ms;
  }

  // Heartbeat do cliente: mantém a sessão viva sem gravar pedaço (janela aberta e gravando).
  touchMatchSession() {
    if (!this.activeMatchSession) return { ok: false, error: 'Sem sessão ativa' };
    this.activeMatchSession.lastChunkAt = Date.now();
    return { ok: true, duration: Math.round((Date.now() - this.activeMatchSession.startedAt) / 1000) };
  }

  // No boot: partidas que ficaram `inProgress` (app fechado/crash) são finalizadas para não
  // bloquearem a cota do prune nem mentirem duração para sempre. A duração vem do mtime do
  // arquivo (quando o último byte foi escrito), não do relógio de parede até agora.
  async recoverInterruptedSessions() {
    const clips = await this.listClips();
    let recovered = 0;
    for (const meta of clips) {
      if (!meta?.inProgress || !meta.id) continue;
      if (meta.id === this.activeMatchSession?.id) continue;
      const webmFile = path.join(this.dir, `${meta.id}.webm`);
      let stat = null;
      try { stat = await fsp.stat(webmFile); } catch {}
      const startedAt = Number(meta.startedAt) || (stat ? stat.birthtimeMs : Date.now());
      const endedAt = stat ? stat.mtimeMs : Date.now();
      const duration = Math.max(1, Math.round((endedAt - startedAt) / 1000));
      const jsonFile = path.join(this.dir, `${meta.id}.json`);
      const fixed = {
        ...meta,
        inProgress: false,
        interrupted: true,
        endedAt,
        duration,
        bytes: stat ? stat.size : (meta.bytes || 0),
        webmUrl: `/api/replay/file/${encodeURIComponent(path.basename(webmFile))}`,
        mp4Url: null,
      };
      try {
        await fsp.writeFile(jsonFile, JSON.stringify(fixed, null, 2), 'utf-8');
        recovered++;
      } catch (err) {
        console.warn('[replay] Falha ao recuperar partida interrompida:', meta.id, err.message);
        continue;
      }
      // Remux em background (arquivo grande): o JSON já está consistente antes.
      if (stat && stat.size > 0) {
        this.remuxSeekable(webmFile).then(async (ok) => {
          if (!ok) return;
          fixed.seekable = true;
          await fsp.writeFile(jsonFile, JSON.stringify(fixed, null, 2), 'utf-8').catch(() => {});
        });
      }
    }
    if (recovered > 0) console.log(`[replay] ${recovered} partida(s) interrompida(s) recuperada(s) no boot.`);
    return recovered;
  }

  getMatchStatus() {
    if (!this.activeMatchSession) {
      return { active: false, session: null };
    }
    return {
      active: true,
      session: {
        id: this.activeMatchSession.id,
        title: this.activeMatchSession.title,
        startedAt: this.activeMatchSession.startedAt,
        duration: Math.round((Date.now() - this.activeMatchSession.startedAt) / 1000),
        bytesWritten: this.activeMatchSession.bytesWritten,
        bytesMb: +(this.activeMatchSession.bytesWritten / (1024 * 1024)).toFixed(1),
      },
    };
  }

  async listClips() {
    const files = await fsp.readdir(this.dir).catch(() => []);
    const jsonFiles = files.filter((f) => f.endsWith('.json') && f !== 'replay-config.json');
    const list = [];

    for (const jf of jsonFiles) {
      try {
        const content = await fsp.readFile(path.join(this.dir, jf), 'utf-8');
        const meta = JSON.parse(content);
        if (!meta?.id) continue; // configuração/arquivo estranho não é clipe
        try {
          if (files.includes(`${meta.id}.jpg`)) meta.thumbUrl = `/api/replay/thumb/${encodeURIComponent(meta.id)}`;
        } catch {}
        list.push(meta);
      } catch {}
    }

    // Ordena do mais recente para o mais antigo
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list;
  }

  // Atualiza metadados editáveis do clipe (título). Não mexe no arquivo de vídeo.
  async updateClip(id, patch = {}) {
    const safeId = String(id || '').replace(/[^\w.-]/g, '');
    if (!safeId) return null;
    const jsonFile = path.join(this.dir, `${safeId}.json`);
    try {
      const meta = JSON.parse(await fsp.readFile(jsonFile, 'utf-8'));
      if (typeof patch.title === 'string' && patch.title.trim()) meta.title = patch.title.trim().slice(0, 120);
      await fsp.writeFile(jsonFile, JSON.stringify(meta, null, 2), 'utf-8');
      return meta;
    } catch {
      return null;
    }
  }

  async deleteClip(id) {
    const safeId = String(id || '').replace(/[^\w.-]/g, '');
    if (!safeId) return false;

    const webm = path.join(this.dir, `${safeId}.webm`);
    const mp4 = path.join(this.dir, `${safeId}.mp4`);
    const json = path.join(this.dir, `${safeId}.json`);
    const jpg = path.join(this.dir, `${safeId}.jpg`);

    await fsp.unlink(webm).catch(() => {});
    await fsp.unlink(mp4).catch(() => {});
    await fsp.unlink(json).catch(() => {});
    await fsp.unlink(jpg).catch(() => {});
    return true;
  }
}
