// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Cofre local de segredos do CastDeck: client ids/segredos de OAuth e tokens das contas conectadas.
//
// Tudo fica no PC do usuário, em `data/secrets.enc`, cifrado com AES-256-GCM. A chave de cifra é aleatória
// por instalação (`data/.machine-key`, 0600) — não vai para lugar nenhum. Nenhum token passa pela VPS.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ALGO = 'aes-256-gcm';

export class Secrets {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = path.join(dataDir, 'secrets.enc');
    this.keyFile = path.join(dataDir, '.machine-key');
    this.cache = null;
  }

  key() {
    try {
      const raw = fs.readFileSync(this.keyFile);
      if (raw.length === 32) return raw;
    } catch {}
    const k = crypto.randomBytes(32);
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.keyFile, k, { mode: 0o600 });
    return k;
  }

  read() {
    if (this.cache) return this.cache;
    const empty = { version: 1, clients: {}, connections: {} };
    try {
      const buf = fs.readFileSync(this.file);
      const iv = buf.subarray(0, 12);
      const tag = buf.subarray(12, 28);
      const body = buf.subarray(28);
      const d = crypto.createDecipheriv(ALGO, this.key(), iv);
      d.setAuthTag(tag);
      const json = Buffer.concat([d.update(body), d.final()]).toString('utf8');
      const parsed = JSON.parse(json);
      this.cache = { ...empty, ...parsed, clients: parsed.clients || {}, connections: parsed.connections || {} };
    } catch {
      this.cache = empty;
    }
    return this.cache;
  }

  write(next) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv(ALGO, this.key(), iv);
    const body = Buffer.concat([c.update(Buffer.from(JSON.stringify(next), 'utf8')), c.final()]);
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, Buffer.concat([iv, c.getAuthTag(), body]), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.cache = next;
  }

  // ---- apps (client id/secret) que o usuário configura uma vez por plataforma ----
  getClient(provider) {
    const c = this.read().clients[provider] || null;
    if (!c) return null;
    // variáveis de ambiente têm prioridade (útil para desenvolvimento/teste)
    const envId = process.env[`CASTDECK_${provider.toUpperCase()}_CLIENT_ID`];
    const envSecret = process.env[`CASTDECK_${provider.toUpperCase()}_CLIENT_SECRET`];
    return { clientId: envId || c.clientId || '', clientSecret: envSecret || c.clientSecret || '' };
  }

  setClient(provider, { clientId, clientSecret }) {
    const db = this.read();
    db.clients[provider] = {
      clientId: String(clientId || '').trim().slice(0, 300),
      clientSecret: String(clientSecret || '').trim().slice(0, 300),
      updatedAt: Date.now(),
    };
    this.write(db);
    return this.getClient(provider);
  }

  removeClient(provider) {
    const db = this.read();
    delete db.clients[provider];
    this.write(db);
  }

  // ---- contas conectadas (tokens + perfil) ----
  getConnection(provider) {
    return this.read().connections[provider] || null;
  }

  setConnection(provider, data) {
    const db = this.read();
    db.connections[provider] = { ...(data || {}), provider, updatedAt: Date.now() };
    this.write(db);
    return db.connections[provider];
  }

  removeConnection(provider) {
    const db = this.read();
    const had = !!db.connections[provider];
    delete db.connections[provider];
    this.write(db);
    return had;
  }

  // lista sem expor tokens (para a UI)
  listSafe() {
    const db = this.read();
    const out = {};
    for (const [k, v] of Object.entries(db.connections)) {
      out[k] = {
        provider: k,
        name: v.name || '',
        accountId: v.accountId || '',
        scope: v.scope || '',
        connectedAt: v.connectedAt || v.updatedAt || 0,
        expiresAt: v.expiresAt || 0,
        hasRefresh: !!v.refreshToken,
      };
    }
    return out;
  }

  // apps configurados (sem o segredo)
  listClients() {
    const db = this.read();
    const out = {};
    for (const [k, v] of Object.entries(db.clients)) {
      const envId = process.env[`CASTDECK_${k.toUpperCase()}_CLIENT_ID`];
      out[k] = { configured: !!(envId || v.clientId), hasSecret: !!(process.env[`CASTDECK_${k.toUpperCase()}_CLIENT_SECRET`] || v.clientSecret) };
    }
    return out;
  }
}
