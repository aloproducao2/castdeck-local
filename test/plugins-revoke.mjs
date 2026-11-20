// Revogação: catálogo LOCAL assinado com a versão revogada. Instalar pelo catálogo e instalar o .cdplug na mão
// precisam ser recusados; o catálogo também marca o plugin como revogado.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { assinarIndice } from '../server/plugin-catalog.js';

const PORTA = 4275;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-rev-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 400)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const chave = fs.readFileSync(path.join(process.cwd(), 'deploy', 'plugins-sign-key.pem'), 'utf8');
const pasta = path.join(process.cwd(), 'landpage', 'plugins');
const pkg = fs.readFileSync(path.join(pasta, 'packages', 'castdeck.chat-commands-1.0.0.cdplug'));
const indice = JSON.parse(fs.readFileSync(path.join(pasta, 'index.json'), 'utf8'));
indice.revoked = [{ id: 'castdeck.chat-commands', version: '1.0.0', motivo: 'teste de revogação' }];
const texto = JSON.stringify(indice, null, 2) + '\n';
const sig = assinarIndice(texto, chave);

const catalogo = http.createServer((req, res) => {
  if (req.url.startsWith('/index.json.sig')) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end(sig + '\n');
  }
  if (req.url.startsWith('/index.json')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(texto);
  }
  if (req.url.startsWith('/packages/castdeck.chat-commands-1.0.0.cdplug')) {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    return res.end(pkg);
  }
  res.writeHead(404).end();
});
await new Promise((r) => catalogo.listen(0, '127.0.0.1', r));
const urlCat = `http://127.0.0.1:${catalogo.address().port}/index.json`;

const proc = spawn(process.execPath, [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_TEST: '1', CASTDECK_PLUGIN_CATALOG: urlCat },
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
  for (let i = 0; i < 120 && !pronto; i++) {
    await esperar(500);
    try {
      pronto = (await api('/plugins')).status === 200;
    } catch {}
  }
  ok('servidor no ar', pronto, log.slice(-300));
  if (!pronto) throw new Error('não subiu');

  const cat = await api('/plugins/catalog');
  ok('catálogo local assinado responde', cat.status === 200 && (cat.json?.plugins || []).length >= 1, cat.texto);
  const item = (cat.json?.plugins || []).find((p) => p.id === 'castdeck.chat-commands');
  ok('catálogo marca revogado', item?.revogado === true, JSON.stringify(item));

  const instCat = await api('/plugins/catalog/install', { method: 'POST', body: { id: 'castdeck.chat-commands' } });
  ok('instalar do catálogo revogado é recusado', instCat.status === 400 && /revogad/i.test(instCat.texto), instCat.texto);

  const instZip = await api('/plugins/install', { method: 'POST', body: { zipBase64: pkg.toString('base64') } });
  ok('instalar o .cdplug na mão também é recusado', instZip.status === 400 && /revogad/i.test(instZip.texto), instZip.texto);

  // índice adulterado (sem assinatura válida) cai para erro/cache e não instala
  const catAdulterado = await api('/plugins/catalog');
  ok('nada instalado após tentativas', ((await api('/plugins')).json?.lista || []).length === 0, JSON.stringify((await api('/plugins')).json?.lista));
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { proc.kill('SIGKILL'); } catch {}
  try { catalogo.close(); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nPLUGINS_REVOKE_FAIL (${falhas})` : '\nPLUGINS_REVOKE_OK');
process.exit(falhas ? 1 : 0);
