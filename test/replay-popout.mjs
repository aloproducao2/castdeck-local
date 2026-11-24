// Teste das janelas separadas do Replay: PREVIEW e PGM recebem MediaStream ao vivo
// (PGM a partir do canvas do programa, mesma imagem da saída).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4586, CDP = 9596;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-pop-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-pop-edge-' + crypto.randomBytes(3).toString('hex'));
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

async function esperarPopup(frag, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const alvo = (await listar()).find((t) => t.type === 'page' && t.url.includes(frag));
    if (alvo) return alvo;
    await esperar(300);
  }
  return null;
}

try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) { await esperar(600); try { pronto = (await fetch(BASE + '/')).ok; } catch {} }
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'POP' }) }).then((r) => r.json());
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
  await replay.cmd('Page.navigate', { url: `${BASE}/replay.html` });
  await esperar(2500);
  let dur = 0;
  for (let i = 0; i < 40 && dur < 6; i++) { await esperar(500); dur = await replay.ev(`window.opener.__castdeck.replayEngine.getStats?.().duration || 0`).catch(() => 0); }
  await replay.ev(`(async () => {
    const eng = window.opener.__castdeck.replayEngine;
    const clip = await eng.createClip(5);
    if (clip) await eng.saveClipToDisk(clip, { title: 'Popout', tag: 'GOL', speed: 0.5, markIn: 0, markOut: 5 });
    return true;
  })()`);
  await replay.cmd('Page.navigate', { url: `${BASE}/replay.html` });
  await esperar(3500);
  for (let i = 0; i < 30; i++) { if (await replay.ev(`document.querySelectorAll('.bc-clip-card').length`)) break; await esperar(400); }
  await replay.ev(`window.playHighlight(0)`);
  await esperar(1500);

  // PREVIEW em janela separada
  await replay.ev(`document.querySelector('#rp-pop-pvw')?.click()`);
  const pvwAlvo = await esperarPopup('view=pvw');
  ok('janela do Preview abriu', !!pvwAlvo, 'nenhum target');
  if (pvwAlvo) {
    const pvwWin = await conectar(pvwAlvo);
    await esperar(1200);
    const pvwInfo = await pvwWin.ev(`(() => { const v = document.querySelector('#pop-video'); return { hasStream: !!v.srcObject, tracks: v.srcObject?.getVideoTracks?.().length || 0, w: v.videoWidth, h: v.videoHeight, res: document.querySelector('#pop-res')?.textContent, status: document.querySelector('#pop-status')?.textContent }; })()`);
    ok('Preview pop-out recebe stream', pvwInfo.hasStream && pvwInfo.tracks >= 1, JSON.stringify(pvwInfo));
    ok('Preview pop-out em resolução cheia', Number(pvwInfo.w) >= 640 && Number(pvwInfo.h) >= 360, JSON.stringify(pvwInfo));
    pvwWin.ws.close();
  }

  // PGM em janela separada (mesma imagem/qualidade do programa)
  const pgmInfo2 = await studio.ev(`(() => { const c = window.__castdeck.comp.canvas; return { w: c.width, h: c.height }; })()`);
  await replay.ev(`document.querySelector('#rp-pop-pgm')?.click()`);
  const pgmAlvo = await esperarPopup('view=pgm');
  ok('janela do PGM abriu', !!pgmAlvo, 'nenhum target');
  if (pgmAlvo) {
    const pgmWin = await conectar(pgmAlvo);
    await esperar(1200);
    const pgmInfo = await pgmWin.ev(`(() => { const v = document.querySelector('#pop-video'); return { hasStream: !!v.srcObject, tracks: v.srcObject?.getVideoTracks?.().length || 0, w: v.videoWidth, h: v.videoHeight, res: document.querySelector('#pop-res')?.textContent, status: document.querySelector('#pop-status')?.textContent }; })()`);
    ok('PGM pop-out recebe stream', pgmInfo.hasStream && pgmInfo.tracks >= 1, JSON.stringify(pgmInfo));
    ok('PGM pop-out na resolução do programa', Number(pgmInfo.w) === Number(pgmInfo2.w) && Number(pgmInfo.h) === Number(pgmInfo2.h), `${pgmInfo.w}x${pgmInfo.h} vs ${pgmInfo2.w}x${pgmInfo2.h}`);
    const shot = await pgmWin.cmd('Page.captureScreenshot', { format: 'png' });
    if (shot.result?.data) fs.writeFileSync('D:/REA/docs/designs/replay/ui-popout-pgm.png', Buffer.from(shot.result.data, 'base64'));
    console.log('print: docs/designs/replay/ui-popout-pgm.png');
    pgmWin.ws.close();
  }

  // os monitores do console continuam na tela (não perderam o PGM)
  const consoleOk = await replay.ev(`(() => ({ pvw: !!document.querySelector('#rp-video-pvw'), pgm: !!document.querySelector('#rp-video-pgm'), pgmSrc: !!document.querySelector('#rp-video-pgm')?.srcObject }))()`);
  ok('console continua com PVW e PGM na tela', consoleOk.pvw && consoleOk.pgm, JSON.stringify(consoleOk));
} catch (e) {
  falhou = true;
  console.log('ERRO:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhou ? '\nREPLAY_POPOUT_FAIL' : '\nREPLAY_POPOUT_OK');
process.exit(falhou ? 1 : 0);
