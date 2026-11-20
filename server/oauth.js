// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// OAuth 2.0 local: PKCE, loopback em 127.0.0.1 e device code flow.
//
// Nada sai do PC: o navegador do usuário fala direto com a plataforma e o retorno cai em
// `http://127.0.0.1:<porta efêmera>/cb`. O token é trocado aqui e guardado em `secrets.enc`.
import crypto from 'node:crypto';
import http from 'node:http';

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function pkcePair() {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function randomState() {
  return b64url(crypto.randomBytes(24));
}

export async function postForm(url, params, headers = {}) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...headers },
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

export async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { ok: res.ok, status: res.status, json, text };
}

// Servidor temporário de callback: espera uma única requisição em /cb e devolve code/state/error.
export function startLoopback() {
  let server = null;
  let done = null;
  const state = randomState();
  const ready = new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/cb') {
        res.writeHead(404).end();
        return;
      }
      const code = u.searchParams.get('code') || '';
      const err = u.searchParams.get('error_description') || u.searchParams.get('error') || '';
      const got = u.searchParams.get('state') || '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(`<!doctype html><meta charset="utf-8"><title>CastDeck</title>
        <body style="font:15px system-ui;background:#0b0a12;color:#eee;display:grid;place-items:center;height:100vh;margin:0">
        <div style="text-align:center">
          <div style="font-size:44px">${err ? '⚠️' : '✅'}</div>
          <p>${err ? 'Não foi possível conectar.' : 'Conectado! Pode voltar para o CastDeck.'}</p>
          <p style="opacity:.6">Este aviso pode ser fechado.</p>
        </div></body>`);
      if (done) done({ code, error: err, state: got, expected: state });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ port, redirectUri: `http://127.0.0.1:${port}/cb` });
    });
  });
  return {
    state,
    ready,
    wait(timeoutMs = 180000) {
      return new Promise((resolve) => {
        const t = setTimeout(() => resolve({ code: '', error: 'timeout' }), timeoutMs);
        done = (r) => {
          clearTimeout(t);
          resolve(r);
        };
      });
    },
    close() {
      try {
        server?.close();
      } catch {}
      server = null;
    },
  };
}

// Device code flow (Twitch, Facebook/Instagram): mostra um código curto e o usuário confirma no site.
export async function startDeviceFlow({ provider, clientId, scope, deviceEndpoint, tokenEndpoint, clientSecret = '' }) {
  const r = await postForm(deviceEndpoint, { client_id: clientId, scopes: scope, scope });
  if (!r.ok || !r.json) throw new Error(`Falha ao iniciar o código de conexão (${provider}: HTTP ${r.status}).`);
  const j = r.json;
  return {
    provider,
    userCode: j.user_code || j.code || '',
    verificationUri: j.verification_uri || j.verification_uri_complete || j.verification_url || '',
    verificationUriComplete: j.verification_uri_complete || '',
    deviceCode: j.device_code || '',
    interval: Math.max(2, Number(j.interval) || 5),
    expiresIn: Number(j.expires_in) || 1800,
    tokenEndpoint,
    clientId,
    clientSecret,
    scope,
    // consulta até o usuário aprovar (ou expirar)
    async wait(onTick) {
      const deadline = Date.now() + (this.expiresIn * 1000);
      let wait = this.interval;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, wait * 1000));
        const q = await postForm(this.tokenEndpoint, {
          client_id: this.clientId,
          ...(this.clientSecret ? { client_secret: this.clientSecret } : {}),
          device_code: this.deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        });
        if (q.ok && q.json?.access_token) return q.json;
        const err = String(q.json?.error || '');
        if (err === 'authorization_pending' || err === 'slow_down' || err === 'pending') {
          if (err === 'slow_down') wait += 2;
          onTick?.({ waiting: true });
          continue;
        }
        throw new Error(q.json?.error_description || q.json?.error || `Aguardando confirmação falhou (${q.status}).`);
      }
      throw new Error('Tempo esgotado esperando a confirmação no site da plataforma.');
    },
  };
}

export function authUrl(provider, { endpoint, clientId, redirectUri, scope, state, challenge, extra = {} }) {
  const u = new URL(endpoint);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', scope);
  u.searchParams.set('state', state);
  if (challenge) {
    u.searchParams.set('code_challenge', challenge);
    u.searchParams.set('code_challenge_method', 'S256');
  }
  for (const [k, v] of Object.entries(extra)) if (v != null) u.searchParams.set(k, String(v));
  return u.toString();
}

export async function exchangeCode({ tokenEndpoint, clientId, clientSecret = '', code, redirectUri, verifier }) {
  const params = {
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
  };
  if (clientSecret) params.client_secret = clientSecret;
  if (verifier) params.code_verifier = verifier;
  const r = await postForm(tokenEndpoint, params);
  if (!r.ok || !r.json?.access_token) {
    throw new Error(r.json?.error_description || r.json?.error || `Troca do código falhou (HTTP ${r.status}).`);
  }
  return r.json;
}

export async function refreshToken({ tokenEndpoint, clientId, clientSecret = '', refresh }) {
  const params = { grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId };
  if (clientSecret) params.client_secret = clientSecret;
  const r = await postForm(tokenEndpoint, params);
  if (!r.ok || !r.json?.access_token) return null;
  return r.json;
}
