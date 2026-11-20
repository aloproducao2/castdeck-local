// Catálogo real DENTRO do binário empacotado: lista (rede), instala do catálogo e ativa.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EXE = 'D:/REA/build/tmp/castdeck-server.exe';
const PORTA = 4283;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-bincat-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 400)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EXE, [], {
  env: { ...process.env, PORT: String(PORTA), CASTDECK_DATA: DADOS, NO_OPEN: '1' },
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
  ok('binário no ar', pronto, log.slice(-400));
  if (!pronto) throw new Error('não subiu');

  const cat = await api('/plugins/catalog');
  ok('catálogo público no binário', cat.status === 200 && (cat.json?.plugins || []).length === 2, cat.texto);
  ok('fonte = rede', cat.json?.fonte === 'rede', JSON.stringify({ fonte: cat.json?.fonte, aviso: cat.json?.aviso }));

  const inst = await api('/plugins/catalog/install', { method: 'POST', body: { id: 'castdeck.chat-commands' } });
  ok('instala do catálogo pelo binário', inst.status === 200, inst.texto);

  const atv = await api('/plugins/castdeck.chat-commands/enable', {
    method: 'POST',
    body: { permissoes: ['events:chat', 'chat:send', 'overlay:show'] },
  });
  ok('ativa no binário', atv.status === 200, atv.texto);

  const forcar = await api('/plugins/catalog?forcar=1');
  ok('forçar atualização do catálogo', forcar.status === 200 && forcar.json?.fonte === 'rede', JSON.stringify(forcar.json?.fonte));
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { proc.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nPLUGINS_BINCAT_FAIL (${falhas})` : '\nPLUGINS_BINCAT_OK');
process.exit(falhas ? 1 : 0);
