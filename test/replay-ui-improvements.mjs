// Testes de UI do replay: numeração/ordem da lista, monitores simétricos, tela cheia,
// redimensionamento do painel de eventos e a nova aba Replay no estúdio.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4585, CDP = 9595;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-ui2-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-ui2-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });
async function conectar(alvo) {
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cmd = (method, params = {}) => new Promise((res) => { const id = ++seq; const t = setTimeout(() => { pend.delete(id); res({ result: { exceptionDetails: { exception: { description: 'timeout' } } } }); }, 90000); pend.set(id, (m) => { clearTimeout(t); res(m); }); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description || '').slice(0, 500)); return r.result?.result?.value; };
  await cmd('Runtime.enable'); await cmd('Page.enable');
  return { ws, cmd, ev };
}
const listar = async () => (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json());
let falhou = false;
const ok = (nome, cond, info = '') => { if (!cond) falhou = true; console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + String(info).slice(0, 400))); };

try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) { await esperar(600); try { pronto = (await fetch(BASE + '/')).ok; } catch {} }
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'UI2' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) { await esperar(500); try { alvo = (await listar()).find((t) => t.type === 'page' && !t.url.includes('replay.html')); } catch {} }
  const studio = await conectar(alvo);
  await studio.cmd('Page.navigate', { url: `${BASE}/studio/${sid}` });
  await esperar(4000);
  await studio.ev(`document.querySelector('#lb-go')?.click()`);
  for (let i = 0; i < 40; i++) { if (await studio.ev(`!!document.querySelector('#program-canvas')`)) break; await esperar(500); }
  await studio.ev(`window.open('/replay.html','CastDeckReplayConsole','width=1300,height=820')`);
  let cAlvo = null;
  for (let i = 0; i < 40 && !cAlvo; i++) { await esperar(500); try { cAlvo = (await listar()).find((t) => t.url.includes('replay.html')); } catch {} }
  const replay = await conectar(cAlvo);
  await replay.cmd('Emulation.setDeviceMetricsOverride', { width: 1300, height: 820, deviceScaleFactor: 1, mobile: false });
  await replay.cmd('Page.navigate', { url: `${BASE}/replay.html` });
  await esperar(2500);
  let dur = 0;
  for (let i = 0; i < 40 && dur < 7; i++) { await esperar(500); dur = await replay.ev(`window.opener.__castdeck.replayEngine.getStats?.().duration || 0`).catch(() => 0); }
  await replay.ev(`(async () => {
    const eng = window.opener.__castdeck.replayEngine;
    for (const t of [{ title: 'Gol A', tag: 'GOL' }, { title: 'Falta B', tag: 'FALTA' }]) {
      const clip = await eng.createClip(4);
      if (clip) await eng.saveClipToDisk(clip, { title: t.title, tag: t.tag, speed: 0.5, markIn: 0, markOut: 4 });
      await new Promise((r) => setTimeout(r, 250));
    }
    return true;
  })()`);
  await replay.cmd('Page.navigate', { url: `${BASE}/replay.html` });
  await esperar(3500);
  for (let i = 0; i < 30; i++) { if (await replay.ev(`document.querySelectorAll('.bc-clip-card').length`)) break; await esperar(400); }

  // 1) numeração e hora
  const lista = await replay.ev(`(() => {
    const cards = [...document.querySelectorAll('.bc-clip-card')];
    return cards.map((c) => ({ pos: c.querySelector('.bc-clip-pos')?.textContent || '', meta: c.querySelector('.bc-clip-meta')?.textContent || '' }));
  })()`);
  ok('cards numerados (#1...)', Array.isArray(lista) && lista.length > 0 && lista[0].pos === '#1' && /#1/.test(lista[0].meta), JSON.stringify(lista).slice(0, 260));
  ok('meta com hora de criação', /\d{2}:\d{2}:\d{2}/.test(lista[0].meta), lista[0].meta);

  // 2) inverter ordem
  const antes = await replay.ev(`document.querySelector('.bc-clip-card .bc-clip-title')?.textContent || ''`);
  await replay.ev(`document.querySelector('#rp-order-toggle')?.click()`);
  await esperar(300);
  const depois = await replay.ev(`document.querySelector('.bc-clip-card .bc-clip-title')?.textContent || ''`);
  const orderLabel = await replay.ev(`document.querySelector('#rp-order-toggle')?.textContent || ''`);
  ok('ordem inverte (primeiro card muda)', antes !== depois, `${antes} -> ${depois}`);
  ok('rótulo da ordem muda', /ANTIGO/.test(orderLabel), orderLabel);

  // 3) monitores simétricos
  const sim = await replay.ev(`(() => {
    const a = document.querySelector('#rp-box-pvw .bc-video-viewport').getBoundingClientRect();
    const b = document.querySelector('#rp-box-pgm .bc-video-viewport').getBoundingClientRect();
    const ha = document.querySelector('#rp-box-pvw .bc-scr-head').getBoundingClientRect();
    const hb = document.querySelector('#rp-box-pgm .bc-scr-head').getBoundingClientRect();
    return { aw: Math.round(a.width), bw: Math.round(b.width), ah: Math.round(a.height), bh: Math.round(b.height), hha: Math.round(ha.height), hhb: Math.round(hb.height) };
  })()`);
  ok('vídeos do Preview e PGM do mesmo tamanho', Math.abs(sim.aw - sim.bw) <= 2 && Math.abs(sim.ah - sim.bh) <= 2, JSON.stringify(sim));
  ok('cabeçalhos dos monitores simétricos', sim.hha === sim.hhb, JSON.stringify(sim));

  // 4) tela cheia (Fullscreen API ou fallback)
  await replay.ev(`document.querySelector('#rp-fs-pvw')?.click()`);
  await esperar(700);
  const fsState = await replay.ev(`(() => { const el = document.querySelector('#rp-box-pvw'); return { fs: document.fullscreenElement === el, max: el.classList.contains('bc-monitor-max') }; })()`);
  ok('tela cheia do Preview ativou', fsState.fs || fsState.max, JSON.stringify(fsState));
  await replay.ev(`document.querySelector('#rp-fs-pvw')?.click()`);
  await esperar(700);
  const fsOff = await replay.ev(`(() => { const el = document.querySelector('#rp-box-pvw'); return { fs: document.fullscreenElement === el, max: el.classList.contains('bc-monitor-max') }; })()`);
  ok('tela cheia desligou', !fsOff.fs && !fsOff.max, JSON.stringify(fsOff));

  // 5) redimensionar o painel de eventos
  const resize = await replay.ev(`(async () => {
    const ev = document.querySelector('.bc-events');
    const h0 = Math.round(ev.getBoundingClientRect().height);
    const grip = document.querySelector('#bc-events-resize');
    const r = grip.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, pointerId: 7, clientX: r.left + 20, clientY: r.top + 3 };
    grip.dispatchEvent(new PointerEvent('pointerdown', opts));
    window.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientY: opts.clientY - 90 }));
    window.dispatchEvent(new PointerEvent('pointerup', { ...opts, clientY: opts.clientY - 90 }));
    await new Promise((res) => setTimeout(res, 250));
    const h1 = Math.round(ev.getBoundingClientRect().height);
    return { h0, h1, saved: localStorage.getItem('castdeck.replay.eventsH') };
  })()`);
  ok('painel de eventos redimensiona', Number(resize.h1) > Number(resize.h0) + 40, JSON.stringify(resize));

  // 6) aba Replay no estúdio
  await studio.ev(`document.querySelector('[data-tab="replay"]')?.click()`);
  await esperar(1200);
  const tab = await studio.ev(`(() => ({ cards: document.querySelectorAll('#panel-replay .rp-tab-card').length, open: !!document.querySelector('#rp-tab-open'), buffer: document.querySelector('#rp-tab-buffer')?.textContent || '', triggers: document.querySelectorAll('#panel-replay [data-rp-replay]').length }))()`);
  ok('aba Replay com painel completo', tab.cards >= 3 && tab.open && tab.triggers === 4 && String(tab.buffer).includes('/ 45 s'), JSON.stringify(tab));
  await replay.ws.close(); studio.ws.close();
} catch (e) {
  falhou = true;
  console.log('ERRO:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhou ? '\nREPLAY_UI_FAIL' : '\nREPLAY_UI_OK');
process.exit(falhou ? 1 : 0);
