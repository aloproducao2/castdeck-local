// Verificação REAL no navegador: logo carrega e menu aponta para links absolutos em todas as páginas,
// inclusive as de /plugins/ (a versão com ?v=<hash> evita o cache antigo).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const CDP = 9405;
const perfil = path.join(os.tmpdir(), 'cd-logo2-' + crypto.randomBytes(3).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 300)));
};

const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--window-size=1400,900', 'about:blank'], { stdio: 'ignore', windowsHide: true });
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
    if (m.method === 'Runtime.exceptionThrown') erros.push(String(m.params?.exceptionDetails?.exception?.description || '').slice(0, 140));
  });
  const cmd = (method, params = {}) => new Promise((res) => {
    const id = ++seq;
    pend.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async (e) => (await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await cmd('Runtime.enable');
  await cmd('Page.enable');

  const paginas = ['/', '/plugins.html', '/plugins/', '/plugins/guia-dev.html', '/plugins/guia-agentes.html', '/downloads.html', '/changelog.html', '/documentacao.html', '/recursos.html', '/sobre.html', '/intercom.html'];
  for (const rota of paginas) {
    await cmd('Page.navigate', { url: 'https://cast.flue.live' + rota });
    await esperar(rota === '/' ? 4000 : 3000);
    const r = await ev(`(async () => {
      const img = document.querySelector('#site-nav .brand img');
      const logoOk = img ? (img.complete ? img.naturalWidth > 0 : await new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); setTimeout(() => res(img.naturalWidth > 0), 2500); })) : false;
      const links = [...document.querySelectorAll('#site-nav .menu a')].map((a) => a.getAttribute('href'));
      const quebrados = [...document.querySelectorAll('#site-nav .menu a')].filter((a) => { const h = a.getAttribute('href') || ''; return !(h.startsWith('/') || h.startsWith('http')); }).length;
      const footerImg = document.querySelector('#site-footer .brand img');
      return { src: img && img.getAttribute('src'), logoOk, links: links.slice(0, 3), quebrados, footerOk: footerImg ? footerImg.naturalWidth > 0 : null, titulo: document.title };
    })()`);
    const bom = r.logoOk && r.quebrados === 0 && r.footerOk !== false;
    ok(`${rota} · logo ${r.logoOk ? 'ok' : 'QUEBRADO'} · menu ${r.quebrados === 0 ? 'absoluto' : 'relativo'}`, bom, JSON.stringify(r));
  }
  ok('sem erros de console', erros.length === 0, JSON.stringify(erros.slice(0, 2)));
  ws.close();
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nLOGO_FAIL (${falhas})` : '\nLOGO_OK');
process.exit(falhas ? 1 : 0);
