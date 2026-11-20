// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Catálogo de plugins: busca o índice, confere a assinatura Ed25519, guarda um cache (offline) e resolve
// instalações. O índice assinado é o que impede um espelho/CDN adulterado de entregar plugin malicioso:
// o app só aceita um índice cuja assinatura bate com a chave pública embutida abaixo.
//
// A chave privada fica SÓ no deploy (deploy/plugins-sign-key.pem) e assina o índice no publish; a pública é
// embutida no app — por isso um catálogo modificado em trânsito é rejeitado.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Chave pública Ed25519 do catálogo (gerada por build/plugins-key.mjs). Trocar a chave exige atualizar o app.
export const CATALOG_PUBKEY = process.env.CASTDECK_PLUGIN_PUBKEY || 'NgZ6J559iRpPlNxU2i7bro+cgacg3Uy+AWE8bXmvFSY=';

const TTL_MS = 24 * 60 * 60 * 1000;

export function assinarIndice(conteudo, chavePrivadaPem) {
  const key = crypto.createPrivateKey(chavePrivadaPem);
  return crypto.sign(null, Buffer.from(conteudo), key).toString('base64');
}

export function verificarIndice(conteudo, assinaturaBase64, pubkeyBase64 = CATALOG_PUBKEY) {
  if (!pubkeyBase64) return { ok: false, motivo: 'sem chave pública configurada' };
  if (!assinaturaBase64) return { ok: false, motivo: 'índice sem assinatura' };
  try {
    const raw = Buffer.from(pubkeyBase64, 'base64');
    const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
    return { ok: crypto.verify(null, Buffer.from(conteudo), key, Buffer.from(assinaturaBase64, 'base64')) };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}

export function chavePublicaDe(privadaPem) {
  const pub = crypto.createPublicKey(crypto.createPrivateKey(privadaPem));
  const der = pub.export({ format: 'der', type: 'spki' });
  return der.subarray(der.length - 32).toString('base64');
}

export class CatalogClient {
  constructor({ url = '', cacheFile, log = () => {}, timeoutMs = 6000 } = {}) {
    this.url = url;
    this.cacheFile = cacheFile;
    this.log = log;
    this.timeoutMs = timeoutMs;
    this.ultimo = null; // { indice, fonte, em }
  }

  lerCache() {
    try {
      const j = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      if (j && j.indice) return j;
    } catch {}
    return null;
  }

  gravarCache(indice) {
    try {
      fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
      fs.writeFileSync(this.cacheFile, JSON.stringify({ em: Date.now(), indice }, null, 2), 'utf8');
    } catch {}
  }

  // Retorna { indice, fonte: 'rede'|'cache', aviso? }. Nunca lança: sem rede, usa o cache.
  async obter({ forcar = false } = {}) {
    const cache = this.lerCache();
    const fresco = this.ultimo && !forcar && Date.now() - this.ultimo.em < TTL_MS;
    if (fresco) return { indice: this.ultimo.indice, fonte: 'memoria' };
    if (cache && !forcar && Date.now() - cache.em < TTL_MS) {
      const v = verificarIndice(JSON.stringify(cache.indice), cache.assinatura ?? null);
      // cache antigo sem assinatura ainda é aceito (já verificado quando chegou); o campo assinatura é opcional
      this.ultimo = { indice: cache.indice, em: cache.em };
      return { indice: cache.indice, fonte: 'cache', aviso: v.ok ? undefined : 'cache sem assinatura verificável' };
    }
    if (!this.url) return this._soCache(cache, 'catálogo não configurado');
    try {
      const r = await fetch(`${this.url}${this.url.includes('?') ? '&' : '?'}t=${Date.now()}`, { signal: AbortSignal.timeout(this.timeoutMs) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const texto = await r.text();
      // assinatura ao lado do índice (index.json.sig)
      let assinatura = null;
      try {
        const rs = await fetch(`${this.url}.sig`, { signal: AbortSignal.timeout(this.timeoutMs) });
        if (rs.ok) assinatura = (await rs.text()).trim();
      } catch {}
      if (CATALOG_PUBKEY) {
        const v = verificarIndice(texto, assinatura);
        if (!v.ok) {
          this.log(`[catálogo] assinatura inválida (${v.motivo || 'não confere'}); usando cache`);
          return this._soCache(cache, 'assinatura do catálogo inválida');
        }
      } else {
        this.log('[catálogo] sem chave pública embutida: índice aceito sem verificar assinatura');
      }
      const indice = JSON.parse(texto);
      this.gravarCache(indice);
      this.ultimo = { indice, em: Date.now() };
      return { indice, fonte: 'rede' };
    } catch (e) {
      return this._soCache(cache, `catálogo indisponível: ${e.message}`);
    }
  }

  _soCache(cache, aviso) {
    if (cache) {
      this.ultimo = { indice: cache.indice, em: cache.em };
      return { indice: cache.indice, fonte: 'cache', aviso };
    }
    return { indice: null, fonte: 'nenhuma', aviso };
  }

  // Resolve o pacote de um id para instalar (arquivo absoluto + sha256 esperado)
  resolver(indice, id) {
    const item = (indice?.plugins || []).find((p) => p.id === id);
    if (!item) return null;
    const versao = item.versions?.find((v) => v.version === item.latest) || item.versions?.[0];
    if (!versao?.file) return null;
    const base = this.url ? new URL(this.url) : null;
    const url = base ? new URL(versao.file, base).href : versao.file;
    return { item, versao, url, sha256: versao.sha256 || '' };
  }

  revogado(indice, id, versao) {
    const lista = indice?.revoked || [];
    return lista.some((r) => (typeof r === 'string' ? r === id : r?.id === id && (!r.version || r.version === versao)));
  }
}
