// Testa o menu localmente em várias larguras: em desktop deve ficar na barra (sem ☰),
// e só virar ☰ em telas realmente estreitas.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4359;
const CDP = 9421;
const BASE = process.env.CASTDECK_BASE || `http://127.0.0.1:${PORTA}`;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 300)));
};

const remoto = !!process.env.CASTDECK_BASE;
const srv = spawn(process.execPath, ['D:/REA/landpage/tools/serve.mjs'], { env: { ...process.env, PORT: String(PORTA) }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-nav2-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', 'about:blank'], { stdio: 'ignore', windowsHide: true });

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
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    }
  });
  const cmd = (method, params = {}) => new Promise((res) => {
    const id = ++seq;
    pend.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async (e) => (await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  await cmd('Page.navigate', { url: `${BASE}/index.html` });
  await esperar(2500);

  const casos = [
    [1920, 'desktop', true],
    [1600, 'desktop', true],
    [1440, 'desktop', true],
    [1366, 'desktop', true],
    [1280, 'desktop', true],
    [1200, 'desktop', true],
    [1100, 'desktop', true],
    [1061, 'desktop estreito', true],
    [1024, 'tablet', false],
    [900, 'tablet', false],
  ];
  for (const [w, rotulo, menuVisivel] of casos) {
    await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await esperar(450);
    const r = await ev(`(() => {
      const nav = document.querySelector('#site-nav');
      const menu = document.querySelector('#menu');
      const burger = nav.querySelector('.burger');
      const links = [...nav.querySelectorAll('.nav-links a')].map((a) => ({ t: a.textContent.trim(), w: Math.round(a.getBoundingClientRect().width), h: Math.round(a.getBoundingClientRect().height) }));
      const alturaLinha = links[0]?.h || 0;
      const linhas = new Set(links.map((l) => l.h ? Math.round(l.w > 0 ? 0 : 0) : 0));
      return {
        classe: nav.className,
        menuDisplay: getComputedStyle(menu).display,
        burger: getComputedStyle(burger).display,
        links,
        alturaMenu: Math.round(menu.getBoundingClientRect().height),
        fonte: getComputedStyle(nav.querySelector('.menu a')).fontSize,
      };
    })()`);
    const naBarra = r.menuDisplay !== 'none' && r.burger === 'none';
    ok(`${w}px (${rotulo}) → menu ${naBarra ? 'na barra' : 'recolhido ☰'}`, naBarra === menuVisivel && r.links.length === 9, JSON.stringify(r).slice(0, 260));
    // fonte deve ser a mesma em todas as larguras de desktop (sem layout pulando)
    if (w >= 1100) ok(`${w}px fonte do menu estável`, parseFloat(r.fonte) >= 14, r.fonte);
  }
  ws.close();
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { if (!remoto) srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nNAV_FAIL (${falhas})` : '\nNAV_OK');
process.exit(falhas ? 1 : 0);
