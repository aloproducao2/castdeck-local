// Verificação visual da página de plugins no navegador real (Edge/CDP): menu, cards, catálogo dinâmico e erros.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const CDP = 9381;
const perfil = path.join(os.tmpdir(), 'cd-site-' + crypto.randomBytes(3).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 400)));
};

const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore', windowsHide: true });

try {
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) {
    await esperar(500);
    try {
      alvo = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0;
  const pend = new Map();
  const erros = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') erros.push(String(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text).slice(0, 200));
  });
  const cmd = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => (await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  await cmd('Page.navigate', { url: 'https://cast.flue.live/plugins.html' });
  await esperar(5000);

  ok('página abriu', /Plugins/.test(String(await ev('document.title'))), await ev('document.title'));
  const menu = await ev(`[...document.querySelectorAll('#site-nav a')].map(a => a.textContent.trim())`);
  ok('menu tem Plugins', (menu || []).includes('Plugins'), JSON.stringify(menu));
  const h1 = await ev(`document.querySelector('h1')?.textContent.trim()`);
  ok('título da página', /estúdio/i.test(String(h1)), String(h1));
  const cards = await ev(`document.querySelectorAll('#plugins-cards .card').length`);
  ok('2 cards oficiais', cards === 2, String(cards));
  const catalogo = await ev(`document.querySelectorAll('#plugins-catalogo .card').length`);
  ok('catálogo dinâmico com 2 plugins', catalogo === 2, String(catalogo));
  const status = await ev(`document.querySelector('#plugins-status')?.textContent || ''`);
  ok('status do catálogo', /plugin\(s\) no catálogo/.test(status), status);
  const links = await ev(`[...document.querySelectorAll('a[href^="/plugins/"]')].map(a => a.getAttribute('href'))`);
  ok('tem links para docs/AGENTS/schema', ['/plugins/AGENTS.md', '/plugins/docs/PLUGINS-AGENTES.md', '/plugins/schema/plugin-v1.json'].every((h) => (links || []).includes(h)), JSON.stringify(links));
  ok('sem erros de console', erros.length === 0, JSON.stringify(erros.slice(0, 3)));

  // página do catálogo
  await cmd('Page.navigate', { url: 'https://cast.flue.live/plugins/' });
  await esperar(4000);
  const cat = await ev(`document.querySelectorAll('#cat-lista .card').length`);
  ok('catálogo humano renderiza', cat === 2, String(cat));
  const st2 = await ev(`document.querySelector('#cat-status')?.textContent || ''`);
  ok('status com data/assinatura', /atualizado|assinado/.test(st2), st2);
  ws.close();
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nSITE_UI_FAIL (${falhas})` : '\nSITE_UI_OK');
process.exit(falhas ? 1 : 0);
