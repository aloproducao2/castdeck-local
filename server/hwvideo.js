// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Aceleração de vídeo por SoC: instala o FFmpeg certo (Rockchip MPP) na pasta de dados, com SHA-256,
// e expõe as informações para a interface. Nada é instalado sem o usuário pedir.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ROCKCHIP_FFMPEG } from './binaries.js';
import { probeFfmpeg, bestEncoder } from './ffmpeg.js';
import { readSoc, describeSoc } from './soc.js';

const sha256 = (file) => {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
};

export class HardwareVideo {
  constructor({ dataBin, env = process.env, logger = console } = {}) {
    this.dataBin = dataBin;
    this.env = env;
    this.log = logger;
    this.state = { instalando: false, progresso: 0, erro: null };
    this.soc = readSoc(env);
  }

  // Nome do binário por SoC (o FFmpeg genérico continua sendo `ffmpeg`)
  nomeBinario(soc = this.soc) {
    if (soc.family === 'rockchip') return 'ffmpeg-rockchip';
    if (soc.family === 'raspberrypi') return 'ffmpeg-pi';
    return 'ffmpeg';
  }

  caminho(soc = this.soc) {
    return path.join(this.dataBin, this.nomeBinario(soc) + (process.platform === 'win32' ? '.exe' : ''));
  }

  // Pacote a instalar: por padrão o espelho do nosso servidor; env permite apontar para outro
  // endereço (testes/suporte) sem mexer no código.
  pacote() {
    const url = this.env.CASTDECK_ROCKCHIP_FFMPEG_URL || ROCKCHIP_FFMPEG.url;
    const hash = this.env.CASTDECK_ROCKCHIP_FFMPEG_SHA256 || ROCKCHIP_FFMPEG.sha256;
    return { ...ROCKCHIP_FFMPEG, url, sha256: hash };
  }

  // Só oferece a instalação onde faz sentido (Linux ARM Rockchip) e se o SoC tem o driver MPP
  podeInstalarRockchip() {
    return this.soc.platform === 'linux' && ['arm64', 'arm'].includes(this.soc.arch) && this.soc.family === 'rockchip';
  }

  // Instalado = existe o binário ESPECÍFICO do Rockchip (o `ffmpeg` genérico não conta)
  instalado(soc = this.soc) {
    if (soc.family !== 'rockchip') return false;
    const minimo = Number(this.env.CASTDECK_HW_MIN_BYTES || 0) || 10 * 1024 * 1024;
    try {
      return fs.statSync(this.caminho(soc)).size > minimo;
    } catch {
      return false;
    }
  }

  // Baixa, confere o SHA-256 e grava de forma atômica em data/bin.
  async instalarRockchip(onProgress = () => {}) {
    if (!this.podeInstalarRockchip()) throw new Error('Esta máquina não é Linux ARM Rockchip.');
    if (this.state.instalando) throw new Error('A instalação já está em andamento.');
    this.state = { instalando: true, progresso: 0, erro: null };
    const destino = this.caminho();
    const temp = destino + '.part';
    try {
      await fsp.mkdir(this.dataBin, { recursive: true });
      const pacote = this.pacote();
      const res = await fetch(pacote.url, { redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`Download falhou (HTTP ${res.status}).`);
      const total = Number(res.headers.get('content-length')) || pacote.bytes || 0;
      let recebido = 0;
      const contador = new (await import('node:stream')).Transform({
        transform(chunk, _enc, cb) {
          recebido += chunk.length;
          if (total) onProgress(Math.min(99, Math.round((recebido / total) * 100)));
          cb(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(res.body), contador, fs.createWriteStream(temp));
      const hash = sha256(temp);
      if (hash !== pacote.sha256) {
        await fsp.rm(temp, { force: true });
        throw new Error(`O arquivo baixado está corrompido (SHA-256 ${hash.slice(0, 12)}…). Tente de novo.`);
      }
      await fsp.chmod(temp, 0o755).catch(() => {});
      await fsp.rename(temp, destino);
      this.state = { instalando: false, progresso: 100, erro: null };
      this.log.log(`[hwvideo] FFmpeg Rockchip instalado em ${destino}`);
      return { path: destino, bytes: fs.statSync(destino).size, sha256: hash };
    } catch (e) {
      await fsp.rm(temp, { force: true }).catch(() => {});
      this.state = { instalando: false, progresso: 0, erro: e.message };
      throw e;
    }
  }

  async removerRockchip() {
    const alvo = this.caminho();
    if (this.soc.family !== 'rockchip') throw new Error('Nada para remover nesta máquina.');
    await fsp.rm(alvo, { force: true });
    this.state = { instalando: false, progresso: 0, erro: null };
    return true;
  }

  // Estado para a interface: SoC, driver, encoder escolhido e o que dá para instalar.
  async info(ffmpegInfo = null) {
    const soc = this.soc;
    const destino = this.caminho();
    const instalado = this.instalado();
    let probe = null;
    if (instalado) {
      try {
        probe = await probeFfmpeg(destino, { skipTest: false });
      } catch {}
    }
    const encoderAtual = ffmpegInfo ? bestEncoder(soc, ffmpegInfo) : null;
    return {
      soc: {
        family: soc.family,
        model: soc.model,
        name: soc.name,
        label: describeSoc(soc),
        drivers: soc.drivers,
        note: soc.note,
        arch: soc.arch,
        platform: soc.platform,
      },
      ffmpeg: ffmpegInfo
        ? {
          path: ffmpegInfo.path,
          version: ffmpegInfo.version,
          rga: !!ffmpegInfo.rga,
          filters: ffmpegInfo.filters || [],
          encoders: (ffmpegInfo.encoders || []).map((e) => ({ id: e.id, label: e.label, hw: !!e.hw })),
          escolhido: encoderAtual?.id || 'libx264',
          cacheHit: !!ffmpegInfo.cacheHit,
        }
        : null,
      rockchip: {
        suportado: this.podeInstalarRockchip(),
        instalado,
        caminho: destino,
        pacote: {
          nome: ROCKCHIP_FFMPEG.version,
          bytes: ROCKCHIP_FFMPEG.bytes,
          url: ROCKCHIP_FFMPEG.url,
          sha256: ROCKCHIP_FFMPEG.sha256,
          licence: ROCKCHIP_FFMPEG.licence,
          source: ROCKCHIP_FFMPEG.source,
        },
        encoderDisponivel: !!probe?.encoders?.some((e) => e.id === 'h264_rkmpp'),
        estado: this.state,
      },
    };
  }
}
