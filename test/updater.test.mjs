// Testa o download/verificação do atualizador sem instalar nada.
// Cobre o nome novo do Windows (-build2.exe), o hash SHA-256 e o caminho /dl/ do site.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Updater } from '../server/updater.js';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'castdeck-updater-test-'));
const payload = Buffer.from('CastDeck update test payload\n'.repeat(100));
const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
const artifact = {
  platform: 'windows-x64',
  file: 'downloads/9.9.9/CastDeck-9.9.9-windows-x64-build2.exe',
  size: payload.length,
  sha256,
  available: true,
};
const urls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  urls.push(String(url));
  if (String(url).includes('/releases.json')) {
    return new Response(JSON.stringify({ releases: [{ version: '9.9.9', artifacts: [artifact] }] }), { status: 200 });
  }
  if (String(url).includes('/dl/')) return new Response(payload, { status: 200, headers: { 'Content-Length': String(payload.length) } });
  return new Response('not found', { status: 404 });
};

try {
  const up = new Updater({ dataDir: dir, target: 'windows-x64', version: '1.0.0', packaged: true });
  await up.run();
  assert.equal(up.st.state, 'ready', 'download deve terminar ready');
  assert.equal(up.st.version, '9.9.9');
  assert.equal(up.st.got, payload.length, 'deve baixar todos os bytes');
  assert.equal(await fs.readFile(up.file, 'utf8'), payload.toString(), 'conteúdo baixado deve ser preservado');
  assert.ok(urls.some((u) => u.includes('/releases.json?t=')), 'deve consultar releases.json sem cache');
  assert.ok(urls.some((u) => u.includes('/dl/9.9.9/CastDeck-9.9.9-windows-x64-build2.exe')), 'deve baixar pela rota /dl/');

  // Hash errado: não pode marcar ready.
  const bad = { ...artifact, sha256: '0'.repeat(64) };
  globalThis.fetch = async (url) => {
    if (String(url).includes('/releases.json')) return new Response(JSON.stringify({ releases: [{ version: '9.9.9', artifacts: [bad] }] }), { status: 200 });
    return new Response(payload, { status: 200 });
  };
  const up2 = new Updater({ dataDir: dir, target: 'windows-x64', version: '1.0.0', packaged: true });
  await assert.rejects(() => up2.run(), /SHA-256/);
  assert.equal(up2.st.state, 'idle');
  console.log('OK updater download/hash/build2');
} finally {
  globalThis.fetch = realFetch;
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}
