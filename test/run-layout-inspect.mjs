// SPDX-License-Identifier: AGPL-3.0-only
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('Iniciando servidor de teste na porta 3100...');
const server = spawn('node', ['server/index.js'], {
  env: { ...process.env, PORT: '3100', HTTPS_PORT: '3543' },
  stdio: 'inherit',
});

for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch('http://127.0.0.1:3100/');
    if (r.ok || r.status < 500) break;
  } catch {}
  await sleep(250);
}

const edgeProfile = path.join(os.tmpdir(), 'edge-cdp-layout');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
console.log('Iniciando Edge headless com CDP na porta 9333...');
const edge = spawn(edgePath, [
  '--remote-debugging-port=9333',
  '--headless=new',
  `--user-data-dir=${edgeProfile}`,
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--no-first-run',
  '--no-default-browser-check',
], { stdio: 'ignore' });

await sleep(2000);

let exitCode = 0;
try {
  const runner = spawn('node', ['test/inspect-layout.mjs'], {
    env: { ...process.env, BASE: 'http://localhost:3100' },
    stdio: 'inherit',
  });
  exitCode = await new Promise((resolve) => runner.on('close', resolve));
} catch (e) {
  console.error('Erro na execução:', e);
  exitCode = 1;
} finally {
  console.log('Encerrando processos de teste...');
  edge.kill('SIGKILL');
  server.kill('SIGKILL');
}

process.exit(exitCode || 0);
