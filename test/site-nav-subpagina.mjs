// Navbar: testa também uma subpágina (/plugins.html) e o funcionamento do menu ☰ no celular.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const CDP = 9433;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const perfil = path.join(os.tmpdir(), 'cd-nav6-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', 'about:blank'], { stdio: 'ignore', windowsHide: true });
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 240)));
};
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

  // subpágina em desktop
  await cmd('Page.navigate', { url: 'https://cast.flue.live/plugins.html' });
  await esperar(3500);
  for (const w of [1440, 1100]) {
    await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await esperar(450);
    const r = await ev(`(() => { const nav=document.querySelector('#site-nav'); return { classe:nav.className, burger:getComputedStyle(nav.querySelector('.burger')).display, menu:getComputedStyle(document.querySelector('#menu')).display, links:[...nav.querySelectorAll('.nav-links a')].length, fonte:getComputedStyle(nav.querySelector('.menu a')).fontSize }; })()`);
    ok(`/plugins.html ${w}px menu na barra`, r.menu !== 'none' && r.burger === 'none' && r.links === 9, JSON.stringify(r));
  }

  // celular: burger abre e fecha o menu
  await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await esperar(600);
  const antes = await ev(`getComputedStyle(document.querySelector('#menu')).display`);
  await ev(`document.querySelector('#site-nav .burger').click()`);
  await esperar(400);
  const aberto = await ev(`(() => { const m=document.querySelector('#menu'); return { display:getComputedStyle(m).display, altura:Math.round(m.getBoundingClientRect().height), links:[...m.querySelectorAll('a')].length }; })()`);
  await ev(`document.querySelector('#site-nav .burger').click()`);
  await esperar(400);
  const fechado = await ev(`getComputedStyle(document.querySelector('#menu')).display`);
  ok('celular: menu começa fechado', antes === 'none', antes);
  ok('celular: ☰ abre o menu com os links', aberto.display !== 'none' && aberto.altura > 200 && aberto.links >= 9, JSON.stringify(aberto));
  ok('celular: ☰ fecha de novo', fechado === 'none', fechado);
  ws.close();
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhas ? `\nNAV2_FAIL (${falhas})` : '\nNAV2_OK');
process.exit(falhas ? 1 : 0);
