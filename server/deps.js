// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Binários externos (FFmpeg e cloudflared). O executável já traz os dois EMBUTIDOS: na primeira
// execução (ou depois de uma atualização) eles são copiados para a pasta de dados do app.
// Só se o executável vier sem eles (ex.: rodando do código-fonte) é que baixa da internet.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { NAMES, exeSuffix, fetchBinary, renameRetry } from './binaries.js';
import { PLAT, ARCH } from './platform.js';

// compilados pelo próprio projeto (não há download na internet): só existem se vierem embutidos
// (build/vendor/<alvo>/, ver build/build-caption.mjs). Hoje: o worker de legenda ao vivo.
export const LOCAL_NAMES = ['castdeck-caption', 'castdeck-parakeet'];

export class Deps {
  constructor(binDir, bundledDir = null) {
    this.binDir = binDir;
    this.bundledDir = bundledDir;
    this.state = {
      ffmpeg: { status: 'idle', progress: 0, error: null },
      cloudflared: { status: 'idle', progress: 0, error: null },
      mediamtx: { status: 'idle', progress: 0, error: null },
      'yt-dlp': { status: 'idle', progress: 0, error: null },
      'castdeck-caption': { status: 'idle', progress: 0, error: null },
      'castdeck-parakeet': { status: 'idle', progress: 0, error: null },
    };
    this.jobs = {};
  }

  fileName(name) {
    return name + exeSuffix(PLAT);
  }

  localPath(name) {
    return path.join(this.binDir, this.fileName(name));
  }

  bundledPath(name) {
    return this.bundledDir ? path.join(this.bundledDir, this.fileName(name)) : null;
  }

  hasBundled(name) {
    const p = this.bundledPath(name);
    try {
      return !!p && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }

  exists(name) {
    return fs.existsSync(this.localPath(name));
  }

  // copia o binário embutido para a pasta de dados (se faltar ou se a versão embutida for diferente)
  async installBundled() {
    for (const name of [...NAMES, ...LOCAL_NAMES]) {
      if (!this.hasBundled(name)) continue;
      const src = this.bundledPath(name);
      const dst = this.localPath(name);
      let same = false;
      try {
        same = (await fsp.stat(dst)).size === fs.statSync(src).size;
      } catch {}
      if (same) continue;
      const st = this.state[name];
      try {
        st.status = 'extracting';
        await fsp.mkdir(this.binDir, { recursive: true });
        const tmp = dst + '.part';
        await pipeline(fs.createReadStream(src), fs.createWriteStream(tmp, { mode: 0o755 }));
        if (PLAT !== 'win32') await fsp.chmod(tmp, 0o755);
        await fsp.rm(dst, { force: true }).catch(() => {});
        await renameRetry(tmp, dst);
        st.status = 'ready';
        st.progress = 100;
      } catch (e) {
        // arquivo em uso (ex.: outra instância rodando): mantém a versão atual
        st.status = this.exists(name) ? 'ready' : 'error';
        st.error = this.exists(name) ? null : e.message;
        console.warn(`[deps] não foi possível instalar ${name} embutido: ${e.message}`);
      }
    }
    // o castdeck-parakeet carrega o ONNX Runtime dinamicamente; a DLL vem junto
    for (const dll of ['onnxruntime.dll', 'onnxruntime_providers_shared.dll']) {
      const src = this.bundledDir ? path.join(this.bundledDir, dll) : null;
      if (!src || !fs.existsSync(src)) continue;
      const dst = path.join(this.binDir, dll);
      let same = false;
      try { same = fs.statSync(dst).size === fs.statSync(src).size; } catch {}
      if (same) continue;
      try {
        const tmp = dst + '.part';
        await pipeline(fs.createReadStream(src), fs.createWriteStream(tmp));
        await fsp.rm(dst, { force: true }).catch(() => {});
        await renameRetry(tmp, dst);
      } catch (e) {
        console.warn(`[deps] não foi possível instalar ${dll} embutida: ${e.message}`);
      }
    }
  }

  ensure(name) {
    if (this.exists(name)) return Promise.resolve(this.localPath(name));
    if (this.jobs[name]) return this.jobs[name];
    const st = this.state[name];
    st.status = 'downloading';
    st.progress = 0;
    st.error = null;
    this.jobs[name] = (async () => {
      try {
        if (this.hasBundled(name)) await this.installBundled();
        else if (LOCAL_NAMES.includes(name)) throw new Error(`${name} não veio embutido nesta versão`);
        else await fetchBinary(name, PLAT, ARCH, this.localPath(name), (p) => (st.progress = p));
        st.status = 'ready';
        st.progress = 100;
        return this.localPath(name);
      } catch (e) {
        st.status = 'error';
        st.error = e.message;
        throw e;
      } finally {
        delete this.jobs[name];
      }
    })();
    return this.jobs[name];
  }
}
