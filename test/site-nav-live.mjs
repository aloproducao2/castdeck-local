// Fonte do menu ao vivo: mesma em todas as larguras de desktop (nada de layout pulando).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const CDP = 9429;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const perfil = path.join(os.tmpdir(), 'cd-nav5-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', 'about:blank'], { stdio: 'ignore', windowsHide: true });
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 200)));
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
  await cmd('Page.navigate', { url: 'https://cast.flue.live/index.html' });
  await esperar(3500);

  let fonteRef = '';
  for (const w of [1920, 1600, 1440, 1366, 1280, 1200, 1100, 1061, 1024]) {
    await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    await esperar(450);
    const r = await ev(`(() => {
      const nav = document.querySelector('#site-nav');
      const a = nav.querySelector('.menu a');
      const menu = document.querySelector('#menu');
      return { fonte: getComputedStyle(a).fontSize, classe: nav.className, burger: getComputedStyle(nav.querySelector('.burger')).display, menuDisplay: getComputedStyle(menu).display, altura: Math.round(nav.querySelector('.wrap').getBoundingClientRect().height) };
    })()`);
    console.log(w + 'px →', JSON.stringify(r));
    if (w >= 1061) {
      if (!fonteRef) fonteRef = r.fonte;
      ok(`${w}px fonte igual (${r.fonte})`, r.fonte === fonteRef, r.fonte);
      ok(`${w}px menu na barra`, r.menuDisplay !== 'none' && r.burger === 'none', JSON.stringify(r));
      ok(`${w}px barra de uma linha (70px)`, r.altura <= 78, String(r.altura));
    } else {
      ok(`${w}px vira menu ☰`, r.menuDisplay === 'none' && r.burger === 'block', JSON.stringify(r));
    }
  }
  ws.close();
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhas ? `\nNAV_LIVE_FAIL (${falhas})` : '\nNAV_LIVE_OK');
process.exit(falhas ? 1 : 0);
