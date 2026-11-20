// Verifica no BINÁRIO empacotado que o ciclo de autoria por IA funciona (scaffold → write → validate →
// simulate de plugin de CÓDIGO → install). O simulador de código precisa subir o próprio exe em modo host.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EXE = 'D:/REA/build/tmp/castdeck-server.exe';
const PORTA = 4295;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-binauth-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 500)));
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

  const docs = await api('/plugins/author/docs');
  ok('docs do author no binário', docs.status === 200 && !!docs.json?.acoes?.['overlay.show'], docs.texto.slice(0, 120));

  const sc = await api('/plugins/author/scaffold', { method: 'POST', body: { id: 'com.ia.binario', tier: 'code', name: 'Do binário' } });
  ok('scaffold no binário', sc.status === 200, sc.texto.slice(0, 200));

  await api('/plugins/author/files/com.ia.binario', {
    method: 'PUT',
    body: {
      arquivos: [
        {
          arquivo: 'plugin.json',
          conteudo: JSON.stringify(
            {
              id: 'com.ia.binario',
              name: 'Do binário',
              description: 'teste',
              version: '1.0.0',
              author: { name: 'agente' },
              license: 'MIT',
              engines: { castdeck: '>=1.0.0', api: 1 },
              tier: 'code',
              entry: 'src/index.js',
              permissions: ['events:stage', 'overlay:show'],
            },
            null,
            2,
          ),
        },
        { arquivo: 'src/index.js', conteudo: "export default function activate(cd) {\n  cd.events.on('stage', (e) => { cd.overlay.show({ titulo: 'Palco', texto: e.fonteNome }, 5); });\n}\n" },
      ],
    },
  });

  const val = await api('/plugins/author/validate', { method: 'POST', body: { id: 'com.ia.binario' } });
  ok('validate no binário', val.json?.ok === true, val.texto.slice(0, 300));

  const sim = await api('/plugins/author/simulate', {
    method: 'POST',
    body: { id: 'com.ia.binario', eventos: [{ tipo: 'stage', acao: 'entrou', fonteNome: 'Fulano' }] },
  });
  ok('simulate de código no binário', (sim.json?.acoes || []).some((a) => a.acao?.type === 'overlay.show' && a.acao?.spec?.texto === 'Fulano'), JSON.stringify(sim.json?.acoes) + ' | ' + String(sim.json?.log || '').slice(0, 160) + ' | ' + log.slice(-200));

  const inst = await api('/plugins/author/install', { method: 'POST', body: { id: 'com.ia.binario' } });
  ok('install no binário', inst.status === 200, inst.texto.slice(0, 200));
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { proc.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nPLUGINS_BINAUTH_FAIL (${falhas})` : '\nPLUGINS_BINAUTH_OK');
process.exit(falhas ? 1 : 0);
