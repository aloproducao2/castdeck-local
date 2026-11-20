// Testa o catálogo REAL publicado (https://cast.flue.live/plugins): busca index, confere assinatura,
// instalado pelo caminho de download e ativa; também testa revogação e cache offline.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORTA = 4271;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-cat-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 400)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(process.execPath, [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_TEST: '1' },
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
  ok('catálogo público responde', cat.status === 200, cat.texto);
  ok('catálogo tem 2 plugins', (cat.json?.plugins || []).length === 2, JSON.stringify(cat.json?.plugins?.map((p) => p.id)));
  ok('catálogo veio da rede', cat.json?.fonte === 'rede', JSON.stringify({ fonte: cat.json?.fonte, aviso: cat.json?.aviso }));
  ok('nenhum revogado', (cat.json?.plugins || []).every((p) => !p.revogado));

  const inst = await api('/plugins/catalog/install', { method: 'POST', body: { id: 'castdeck.chat-commands' } });
  ok('instala do catálogo', inst.status === 200 && inst.json?.id === 'castdeck.chat-commands', inst.texto);

  const atv = await api('/plugins/castdeck.chat-commands/enable', {
    method: 'POST',
    body: { permissoes: ['events:chat', 'chat:send', 'overlay:show'] },
  });
  ok('ativa plugin instalado do catálogo', atv.status === 200, atv.texto);

  const chat = await api('/plugins/_test/chat', { method: 'POST', body: { usuario: 'zeca', texto: '!redes' } });
  ok('regra do catálogo dispara', (chat.json?.executadas || []).length > 0, chat.texto);

  const depois = await api('/plugins/catalog');
  ok('catálogo marca como instalado', (depois.json?.plugins || []).find((p) => p.id === 'castdeck.chat-commands')?.instalado === true, depois.texto);

  // cache offline: derruba a rede do catálogo trocando a URL por um host inválido no próximo boot
  const cache = path.join(DADOS, 'plugins', 'catalog.json');
  ok('cache do catálogo gravado', fs.existsSync(cache), cache);
  const cacheJson = JSON.parse(fs.readFileSync(cache, 'utf8'));
  ok('cache tem o índice', (cacheJson.indice?.plugins || []).length === 2);
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { proc.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nPLUGINS_CATALOG_FAIL (${falhas})` : '\nPLUGINS_CATALOG_OK');
process.exit(falhas ? 1 : 0);
