// Verifica o binário empacotado (pkg): /api/plugins responde e o plugin de CÓDIGO roda, incluindo o
// processo-filho usando o próprio executável em modo host (CASTDECK_PLUGIN_HOST).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const EXE = 'D:/REA/build/tmp/castdeck-server.exe';
const PORTA = 4265;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-pkg-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 500)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(EXE)) {
  console.log('BINARIO_AUSENTE ' + EXE);
  process.exit(2);
}

// servidor falso da luz
const recebidos = [];
const luz = http.createServer((req, res) => {
  recebidos.push(req.url);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end('{"ok":true}');
});
await new Promise((r) => luz.listen(0, '127.0.0.1', r));
const luzPorta = luz.address().port;

const proc = spawn(EXE, [], {
  env: { ...process.env, PORT: String(PORTA), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_TEST: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let log = '';
proc.stdout.on('data', (d) => (log += d));
proc.stderr.on('data', (d) => (log += d));

const api = async (rota, opt = {}) => {
  const r = await fetch(BASE + '/api' + rota, {
    method: opt.method || 'GET',
    headers: { 'content-type': 'application/json' },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {}
  return { status: r.status, json: j, texto: t };
};

try {
  let pronto = false;
  for (let i = 0; i < 180 && !pronto; i++) {
    await esperar(700);
    try {
      pronto = (await api('/plugins')).status === 200;
    } catch {}
  }
  ok('binário empacotado serve /api/plugins', pronto, log.slice(-500));
  if (!pronto) throw new Error('não subiu');

  const inst = await api('/plugins/install', {
    method: 'POST',
    body: { zipBase64: fs.readFileSync('test/fixtures/castdeck.luz-1.0.0.cdplug').toString('base64') },
  });
  ok('instala .cdplug no binário empacotado', inst.status === 200, inst.texto);
  await api('/plugins/castdeck.luz/settings', { method: 'POST', body: { urlLigar: `http://127.0.0.1:${luzPorta}/on`, aviso: false } });
  const atv = await api('/plugins/castdeck.luz/enable', {
    method: 'POST',
    body: { permissoes: ['events:stage', 'events:chat', 'overlay:show', 'storage:own', 'network:http://127.0.0.1', 'network:http://localhost'] },
  });
  ok('ativa plugin de código no binário (processo separado)', atv.status === 200, atv.texto);

  await api('/plugins/event', { method: 'POST', body: { tipo: 'stage', acao: 'entrou', fonteNome: 'Fulano' } });
  for (let i = 0; i < 30 && !recebidos.length; i++) await esperar(400);
  ok('plugin de código chamou HTTP a partir do binário', recebidos.some((u) => u === '/on'), JSON.stringify(recebidos) + ' | ' + log.slice(-400));
  const lst = await api('/plugins');
  ok('plugin aparece rodando', lst.json?.lista?.find((p) => p.id === 'castdeck.luz')?.rodando === true, JSON.stringify(lst.json?.lista));
  // ---------- plugin oficial novo: cronômetro (pasta oficial + painel) ----------
  const instTimer = await api('/plugins/install', { method: 'POST', body: { pasta: 'plugins/castdeck.timer' } });
  ok('cronômetro instala da pasta oficial', instTimer.status === 200 && instTimer.json?.id === 'castdeck.timer', instTimer.texto);
  const atvTimer = await api('/plugins/castdeck.timer/enable', {
    method: "POST",
    body: { permissoes: ['events:chat', 'overlay:show', 'chat:send', 'storage:own'] },
  });
  ok('cronômetro ativa no app empacotado', atvTimer.status === 200, atvTimer.texto);
  await esperar(800);
  const drTimer = await api('/plugins/castdeck.timer/doctor');
  ok('diagnóstico do cronômetro no binário', drTimer.status === 200 && drTimer.json?.ok === true, drTimer.texto.slice(0, 240));
  const painelTimer = await api('/plugins/castdeck.timer/panel', { method: 'POST', body: { nome: 'iniciar', dados: { minutos: 1 } } });
  ok('painel do cronômetro responde no binário', painelTimer.status === 200 && painelTimer.json?.ok === true, painelTimer.texto);
  await esperar(700);
  const cfgTimer = await api('/plugins/castdeck.timer/settings');
  ok('cronômetro guarda o estado (rodando)', cfgTimer.json?.settings?.estado?.rodando === true, cfgTimer.texto.slice(0, 240));
  const pararTimer = await api('/plugins/castdeck.timer/panel', { method: 'POST', body: { nome: 'parar' } });
  ok('painel para o cronômetro', pararTimer.status === 200, pararTimer.texto);

} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { proc.kill('SIGKILL'); } catch {}
  try { luz.close(); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nPLUGINS_BIN_FAIL (${falhas})` : '\nPLUGINS_BIN_OK');
process.exit(falhas ? 1 : 0);
