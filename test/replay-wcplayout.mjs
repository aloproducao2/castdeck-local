// Teste do player WebCodecs (wc-playout): play, pause, seek, passo de quadro e reverse num clipe real
// do replay (WebM/VP8), desenhando em canvas a ~60 Hz.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4581, CDP = 9591;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-wcp-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-wcp-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });
async function conectar(alvo) {
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cmd = (method, params = {}) => new Promise((res) => { const id = ++seq; const t = setTimeout(() => { pend.delete(id); res({ result: { exceptionDetails: { exception: { description: 'timeout' } } } }); }, 120000); pend.set(id, (m) => { clearTimeout(t); res(m); }); ws.send(JSON.stringify({ id, method, params })); });
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
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'WCP' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) { await esperar(500); try { alvo = (await listar()).find((t) => t.type === 'page' && !t.url.includes('replay.html')); } catch {} }
  const studio = await conectar(alvo);
  await studio.cmd('Page.navigate', { url: `${BASE}/studio/${sid}` });
  await esperar(4000);
  await studio.ev(`document.querySelector('#lb-go')?.click()`);
  for (let i = 0; i < 40; i++) { if (await studio.ev(`!!document.querySelector('#program-canvas')`)) break; await esperar(500); }
  await studio.ev(`window.open('/replay.html','CastDeckReplayConsole','width=1200,height=700')`);
  let cAlvo = null;
  for (let i = 0; i < 40 && !cAlvo; i++) { await esperar(500); try { cAlvo = (await listar()).find((t) => t.url.includes('replay.html')); } catch {} }
  const replay = await conectar(cAlvo);
  await replay.cmd('Page.navigate', { url: `${BASE}/replay.html` });
  await esperar(2500);
  let dur = 0;
  for (let i = 0; i < 40 && dur < 6; i++) { await esperar(500); dur = await replay.ev(`window.opener.__castdeck.replayEngine.getStats?.().duration || 0`).catch(() => 0); }
  const saved = await replay.ev(`(async () => {
    const eng = window.opener.__castdeck.replayEngine;
    const clip = await eng.createClip(5);
    if (!clip) return { erro: 'sem clipe' };
    const meta = await eng.saveClipToDisk(clip, { title: 'WCP', tag: 'GOL', speed: 0.5, markIn: 0, markOut: 5 });
    return meta ? { webmUrl: meta.webmUrl, duration: meta.duration } : { erro: 'save falhou' };
  })()`);
  ok('clipe salvo', !!saved?.webmUrl, JSON.stringify(saved).slice(0, 200));

  const r = await replay.ev(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      const { createWcPlayout } = await import('/js/wc-playout.js');
      const p = createWcPlayout();
      const info = await p.load(${JSON.stringify(saved.webmUrl)});
      await p.waitFrame();
      p.play();
      await sleep(900);
      const tPlay = p.currentTime;
      const dPlay = p.drawnFrames;
      p.pause();
      p.step(1);
      await sleep(300);
      const tStep = p.currentTime;
      p.step(-1);
      await sleep(300);
      const tStepBack = p.currentTime;
      p.seek(2);
      await sleep(500);
      const tSeek = p.currentTime;
      p.setSpeed(-0.7);
      p.play();
      await sleep(700);
      const tRev = p.currentTime;
      p.pause();
      const dEnd = p.drawnFrames;
      const out = { info, tPlay, tStep, tStepBack, tSeek, tRev, dPlay, dEnd, w: p.canvas.width, h: p.canvas.height, fps: p.fps, dur: p.duration };
      p.dispose();
      return { ok: true, ...out };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  })()`);
  console.log('metrics:', JSON.stringify(r));
  ok('módulo carregou o clipe', r?.ok === true, r?.error);
  ok('clipe com quadros e duração', Number(r?.info?.frames) > 20 && Number(r?.info?.duration) > 4, JSON.stringify(r?.info));
  ok('tocou para frente (~0,9 s)', Number(r?.tPlay) > 0.45, r?.tPlay);
  ok('passo de 1 quadro (~1/fps)', Math.abs(Number(r?.tStep) - Number(r?.tPlay) - 1 / Math.max(1, Number(r?.fps))) < 0.1, `fps=${r?.fps} d=${(Number(r?.tStep) - Number(r?.tPlay)).toFixed(3)}`);
  ok('passo para trás reduz o tempo', Number(r?.tStepBack) < Number(r?.tStep), `${r?.tStepBack} < ${r?.tStep}`);
  ok('seek para 2 s', Math.abs(Number(r?.tSeek) - 2) < 0.25, r?.tSeek);
  ok('reverse reduz o tempo', Number(r?.tRev) < Number(r?.tSeek) - 0.15, `${r?.tRev} < ${r?.tSeek}`);
  ok('desenhou quadros no canvas', Number(r?.dEnd) > 20 && Number(r?.w) > 100, `${r?.dEnd} draws, ${r?.w}x${r?.h}`);
  replay.ws.close(); studio.ws.close();
} catch (e) {
  falhou = true;
  console.log('ERRO:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhou ? '\nREPLAY_WCPLAYOUT_FAIL' : '\nREPLAY_WCPLAYOUT_OK');
process.exit(falhou ? 1 : 0);
