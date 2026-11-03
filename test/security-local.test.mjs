// Testa as proteções do servidor local que não podem regredir:
//  - POST cross-origin em /api é recusado (CSRF)
//  - POST do próprio painel continua funcionando
//  - corpo JSON absurdo é recusado antes de chegar às rotas
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = await fs.mkdtemp(path.join(os.tmpdir(), 'castdeck-security-'));
const probe = net.createServer();
await new Promise((ok) => probe.listen(0, '127.0.0.1', ok));
const port = probe.address().port;
await new Promise((ok) => probe.close(ok));
const base = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), NO_OPEN: '1', CASTDECK_DATA: data },
  stdio: 'ignore',
  windowsHide: true,
});
const wait = async (ms) => new Promise((r) => setTimeout(r, ms));
const up = async () => {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) return;
    } catch {}
    await wait(200);
  }
  throw new Error('servidor não subiu');
};
const post = (url, body, origin) =>
  fetch(base + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });

try {
  await up();
  const evil = await post('/api/studios', { name: 'CSRF' }, 'https://evil.example');
  assert.equal(evil.status, 403, 'POST cross-origin deve ser 403');
  const own = await post('/api/studios', { name: 'Legítimo' }, base);
  assert.equal(own.status, 201, 'POST do próprio painel deve funcionar');
  const legit = await own.json();
  assert.ok(legit.id, 'estúdio criado');

  const big = await fetch(base + '/api/studios', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ name: 'x'.repeat(3 * 1024 * 1024) }),
  });
  assert.equal(big.status, 413, 'corpo acima de 2 MB deve ser 413');

  const diag = await fetch(base + '/api/diagnostics');
  assert.equal(diag.status, 200, 'diagnóstico local deve responder');
  const d = await diag.json();
  assert.ok(d.app?.version, 'diagnóstico deve ter versão');
  assert.equal(d.settings?.turn, undefined, 'diagnóstico não deve expor TURN');
  console.log('OK segurança local: Origin/CSRF, painel legítimo, body e diagnóstico sem segredos');
} finally {
  child.kill();
  await fs.rm(data, { recursive: true, force: true }).catch(() => {});
}
