// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Persistência simples em JSON (data/db.json) com escrita atômica e debounce.
// Segurança dos dados: uma escrita por vez (com fsync), cópia de segurança rotativa (db.json.bak) e,
// se o db.json estiver corrompido, ele é preservado (db.json.corrupt-*) e o backup é usado no lugar.
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_DB = { studios: [], destinations: [], settings: { autoTunnel: true, tunnelProvider: 'cloudflare', turn: { urls: '', username: '', credential: '' } } };
const BACKUP_EVERY = 5 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// rename no Windows falha às vezes (antivírus/indexador segurando o arquivo): tenta de novo
async function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      return await fs.rename(from, to);
    } catch (e) {
      if (i >= 12 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      await sleep(40 * (i + 1));
    }
  }
}

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    this.bak = this.file + '.bak';
    this.data = structuredClone(DEFAULT_DB);
    this._timer = null;
    this._writing = null;
    this._again = false;
    this._lastBak = 0;
    this._dirty = false;
  }

  async _read(file) {
    const raw = await fs.readFile(file, 'utf8');
    if (!raw.trim()) throw new Error('arquivo vazio');
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.studios ?? [])) throw new Error('estrutura inválida');
    return obj;
  }

  async load() {
    await fs.mkdir(this.dir, { recursive: true });
    let obj = null;
    try {
      obj = await this._read(this.file);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // nunca sobrescreve um banco ilegível: guarda uma cópia e tenta o backup
        const keep = `${this.file}.corrupt-${Date.now()}`;
        await fs.copyFile(this.file, keep).catch(() => {});
        console.warn(`[store] db.json inválido (${err.message}); cópia preservada em ${path.basename(keep)}`);
      }
      try {
        obj = await this._read(this.bak);
        console.warn('[store] dados restaurados do backup db.json.bak');
      } catch {
        obj = null;
      }
    }
    if (obj) {
      this.data = { ...structuredClone(DEFAULT_DB), ...obj };
      // migra o padrão antigo ("auto") para o Cloudflare
      this.data.settings = { ...DEFAULT_DB.settings, ...this.data.settings };
      if (this.data.settings.tunnelProvider === 'auto' || !this.data.settings.tunnelProvider) this.data.settings.tunnelProvider = 'cloudflare';
    }
    await this.flush();
  }

  save() {
    this._dirty = true;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush().catch((e) => console.error('[store]', e)), 150);
  }

  // uma escrita por vez; pedidos durante a escrita geram mais uma passada no fim (nunca duas ao mesmo tempo)
  flush() {
    clearTimeout(this._timer);
    if (this._writing) {
      this._again = true;
      return this._writing;
    }
    this._writing = (async () => {
      try {
        do {
          this._again = false;
          this._dirty = false;
          await this._writeOnce(JSON.stringify(this.data, null, 2));
        } while (this._again);
      } catch (e) {
        this._dirty = true;
        throw e;
      } finally {
        this._writing = null;
      }
    })();
    return this._writing;
  }

  async _writeOnce(json) {
    const tmp = `${this.file}.${process.pid}.tmp`;
    const fh = await fs.open(tmp, 'w');
    try {
      await fh.writeFile(json);
      await fh.sync();
    } finally {
      await fh.close();
    }
    if (Date.now() - this._lastBak > BACKUP_EVERY) {
      // só vira backup um arquivo que ainda é válido
      const ok = await this._read(this.file).then(() => true, () => false);
      if (ok) await fs.copyFile(this.file, this.bak).catch(() => {});
      this._lastBak = Date.now();
    }
    await renameRetry(tmp, this.file);
  }

  // usado ao encerrar o processo: grava o que estiver pendente de forma síncrona
  flushSync() {
    if (!this._dirty && !this._writing) return;
    try {
      const tmp = `${this.file}.${process.pid}.exit.tmp`;
      fss.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fss.renameSync(tmp, this.file);
      this._dirty = false;
    } catch (e) {
      console.error('[store] flushSync', e.message);
    }
  }

  // ---------- Settings ----------
  getSettings() {
    return this.data.settings;
  }
  updateSettings(patch) {
    const s = this.data.settings;
    if (typeof patch.autoTunnel === 'boolean') s.autoTunnel = patch.autoTunnel;
    if (['auto', 'localhostrun', 'cloudflare'].includes(patch.tunnelProvider)) s.tunnelProvider = patch.tunnelProvider;
    if (['app', 'browser', 'none'].includes(patch.openMode)) s.openMode = patch.openMode;
    if (['pt', 'en', 'es'].includes(patch.lang)) s.lang = patch.lang;
    if (typeof patch.recordingsDir === 'string') {
      if (patch.recordingsDir.trim()) s.recordingsDir = patch.recordingsDir.trim().slice(0, 500);
      else delete s.recordingsDir;
    }
    if (patch.turn) {
      s.turn = {
        urls: String(patch.turn.urls || '').trim().slice(0, 600),
        username: String(patch.turn.username || '').trim().slice(0, 200),
        credential: String(patch.turn.credential || '').trim().slice(0, 300),
      };
    }
    this.save();
    return s;
  }

  // ---------- Studios ----------
  listStudios() {
    return this.data.studios.map(({ brand, banners, gcTemplates, session, ...s }) => s);
  }
  getStudio(id) {
    return this.data.studios.find((s) => s.id === id) || null;
  }
  createStudio(name) {
    const studio = {
      id: randomUUID().replace(/-/g, '').slice(0, 10),
      name: String(name || 'Meu estúdio').slice(0, 80),
      createdAt: Date.now(),
      brand: null,
      banners: [],
      gcTemplates: [],
    };
    this.data.studios.unshift(studio);
    this.save();
    return studio;
  }
  updateStudio(id, patch) {
    const s = this.getStudio(id);
    if (!s) return null;
    if (typeof patch.name === 'string') s.name = patch.name.slice(0, 80);
    let content = false;
    if (patch.brand !== undefined && (patch.brand === null || (typeof patch.brand === 'object' && !Array.isArray(patch.brand)))) {
      s.brand = patch.brand;
      content = true;
    }
    if (Array.isArray(patch.banners)) {
      s.banners = patch.banners.slice(0, 100);
      content = true;
    }
    if (Array.isArray(patch.gcTemplates)) {
      s.gcTemplates = patch.gcTemplates.slice(0, 80);
      content = true;
    }
    // revisão do conteúdo (marca/GCs): o estúdio manda a revisão que conhece e o servidor recusa gravações
    // de uma janela desatualizada (ver conflictFor)
    if (content) s.rev = (s.rev || 0) + 1;
    // sessão do host (câmeras extras, palco, mídias): salva automaticamente e restaurada ao abrir
    if (patch.session === null) delete s.session;
    else if (patch.session && typeof patch.session === 'object' && JSON.stringify(patch.session).length < 200_000) s.session = patch.session;
    s.updatedAt = Date.now();
    this.save();
    return s;
  }
  // devolve a revisão atual se a gravação vier de uma versão antiga do estúdio (outra janela/aba salvou antes)
  conflictFor(id, patch) {
    const s = this.getStudio(id);
    if (!s || typeof patch?.baseRev !== 'number' || patch.force) return null;
    return (s.rev || 0) !== patch.baseRev ? s.rev || 0 : null;
  }
  deleteStudio(id) {
    const before = this.data.studios.length;
    this.data.studios = this.data.studios.filter((s) => s.id !== id);
    this.save();
    return this.data.studios.length !== before;
  }
  // chave dos links de saída (OBS/vMix em outro computador): criada uma vez e mantida
  studioOutKey(id) {
    const s = this.getStudio(id);
    if (!s) return '';
    if (!s.outKey) {
      s.outKey = randomUUID().replace(/-/g, '').slice(0, 16);
      this.save();
    }
    return s.outKey;
  }
  // chave do link público da legenda (/cc): só leitura e separada da chave de saída; "gerar novo link" troca
  studioCcKey(id, regen = false) {
    const s = this.getStudio(id);
    if (!s) return '';
    if (!s.ccKey || regen) {
      s.ccKey = randomUUID().replace(/-/g, '').slice(0, 12);
      this.save();
    }
    return s.ccKey;
  }

  // ---------- Destinations ----------
  listDestinations() {
    return this.data.destinations;
  }
  getDestination(id) {
    return this.data.destinations.find((d) => d.id === id) || null;
  }
  upsertDestination(input) {
    const platform = String(input.platform || 'custom').slice(0, 30);
    const clean = {
      name: String(input.name || 'Destino').slice(0, 80),
      platform,
      // formato da chave: 'h' = horizontal 16:9, 'v' = vertical 9:16 (Instagram/TikTok por padrão)
      format: input.format === 'v' || input.format === 'h' ? input.format : ['instagram', 'tiktok'].includes(platform) ? 'v' : 'h',
      url: String(input.url || '').trim().slice(0, 500),
      key: String(input.key || '').trim().slice(0, 500),
      enabled: input.enabled !== false,
    };
    if (input.id) {
      const d = this.getDestination(input.id);
      if (!d) return null;
      Object.assign(d, clean);
      this.save();
      return d;
    }
    const d = { id: randomUUID().slice(0, 8), createdAt: Date.now(), ...clean };
    this.data.destinations.push(d);
    this.save();
    return d;
  }
  deleteDestination(id) {
    const before = this.data.destinations.length;
    this.data.destinations = this.data.destinations.filter((d) => d.id !== id);
    this.save();
    return this.data.destinations.length !== before;
  }
}
