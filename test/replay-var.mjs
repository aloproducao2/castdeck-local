// Teste E2E do VAR v2: calibração de perspectiva (4 cliques), linhas paralelas, delta em metros,
// lupa 2x/4x e espelhamento das marcações + medição no overlay do PGM.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4578, CDP = 9588;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-var-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-var-edge-' + crypto.randomBytes(3).toString('hex'));
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
const ok = (nome, cond, info = '') => { if (!cond) falhou = true; console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + String(info).slice(0, 500))); };

try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) { await esperar(600); try { pronto = (await fetch(BASE + '/')).ok; } catch {} }
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'VAR' }) }).then((r) => r.json());
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
  await esperar(3000);
  ok('console conectado', await replay.ev(`!!window.opener?.__castdeck?.replayEngine`));

  let dur = 0;
  for (let i = 0; i < 40 && dur < 6; i++) { await esperar(500); dur = await replay.ev(`window.opener.__castdeck.replayEngine.getStats?.().duration || 0`).catch(() => 0); }
  await replay.ev(`(async () => {
    const eng = window.opener.__castdeck.replayEngine;
    const clip = await eng.createClip(5);
    if (clip) await eng.saveClipToDisk(clip, { title: 'VAR Teste', tag: 'GOL', speed: 0.5, markIn: 0, markOut: 5 });
    return true;
  })()`);
  await replay.cmd('Page.navigate', { url: `${BASE}/replay.html` });
  await esperar(3500);
  for (let i = 0; i < 30; i++) { if (await replay.ev(`document.querySelectorAll('.bc-clip-card').length`)) break; await esperar(400); }
  await replay.ev(`window.playHighlight(0)`);
  await esperar(1200);
  await replay.ev(`document.querySelector('#rp-btn-var')?.click()`);
  await esperar(800);
  // Liga o overlay do VAR no PGM (senão o compositor não recebe as marcações)
  await replay.ev(`document.querySelector('#rp-var-tool-sendpgm')?.click()`);
  await esperar(400);

  const info0 = await replay.ev(`(() => { const cv = document.querySelector('#rp-var-canvas'); return { w: cv.width, h: cv.height }; })()`);
  ok('canvas do VAR dimensionado', info0.w > 200 && info0.h > 100, JSON.stringify(info0));

  // Calibração: 4 cliques (2 na linha de fundo + 2 na linha da área)
  const calib = await replay.ev(`(async () => {
    const layer = document.querySelector('#rp-var-layer');
    const cv = document.querySelector('#rp-var-canvas');
    const r = cv.getBoundingClientRect();
    const W = cv.width, H = cv.height;
    const click = (x, y) => {
      const e = new PointerEvent('pointerdown', { clientX: r.left + x, clientY: r.top + y, pointerId: 1, bubbles: true, cancelable: true });
      layer.dispatchEvent(e);
      layer.dispatchEvent(new PointerEvent('pointerup', { clientX: r.left + x, clientY: r.top + y, pointerId: 1, bubbles: true }));
    };
    document.querySelector('#rp-var-tool-calib').click();
    click(0.2 * W, 0.2 * H);
    click(0.8 * W, 0.55 * H);
    click(0.25 * W, 0.45 * H);
    click(0.85 * W, 0.8 * H);
    return window.__varDebug();
  })()`);
  ok('calibração calculada (pxPerM > 0)', Number(calib?.calib?.pxPerM) > 0, JSON.stringify(calib?.calib || {}));
  ok('estado CALIBRADO na barra VAR', /CALIBRADO/.test(await replay.ev(`document.querySelector('#rp-var-calib-state')?.textContent || ''`)), '');

  // Linhas de impedimento (defesa e ataque) e medição em metros
  const linhasRaw = await replay.ev(`(async () => {
    const layer = document.querySelector('#rp-var-layer');
    const cv = document.querySelector('#rp-var-canvas');
    const r = cv.getBoundingClientRect();
    const W = cv.width, H = cv.height;
    document.querySelector('#rp-var-tool-offside').click();
    const click = (x, y) => {
      layer.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + x, clientY: r.top + y, pointerId: 1, bubbles: true, cancelable: true }));
      layer.dispatchEvent(new PointerEvent('pointerup', { clientX: r.left + x, clientY: r.top + y, pointerId: 1, bubbles: true }));
    };
    click(0.55 * W, 0.62 * H);  // DEFESA
    const afterFirst = window.__varDebug();
    click(0.45 * W, 0.45 * H);  // ATAQUE (mais perto da linha de fundo)
    return { afterFirst, debug: window.__varDebug() };
  })()`);
  const linhas = linhasRaw?.debug;
  ok('primeira linha criada', Array.isArray(linhasRaw?.afterFirst?.lines) && linhasRaw.afterFirst.lines.length === 1, JSON.stringify(linhasRaw?.afterFirst || {}));
  ok('duas linhas criadas', Array.isArray(linhas?.lines) && linhas.lines.length === 2, JSON.stringify(linhas?.lines || []));
  ok('medição em metros', Number(linhas?.measure?.meters) > 0 && /m/.test(linhas?.measure?.text || ''), JSON.stringify(linhas?.measure || {}));

  // Lupa: cicla para 2x e posiciona
  const lens = await replay.ev(`(async () => {
    const layer = document.querySelector('#rp-var-layer');
    const cv = document.querySelector('#rp-var-canvas');
    const r = cv.getBoundingClientRect();
    const W = cv.width, H = cv.height;
    document.querySelector('#rp-var-tool-lens').click();
    document.querySelector('#rp-var-tool-zoom').click();
    layer.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 0.5 * W, clientY: r.top + 0.4 * H, pointerId: 1, bubbles: true, cancelable: true }));
    layer.dispatchEvent(new PointerEvent('pointerup', { clientX: r.left + 0.5 * W, clientY: r.top + 0.4 * H, pointerId: 1, bubbles: true }));
    return window.__varDebug();
  })()`);
  ok('lupa ativa com zoom 2x', Number(lens?.lens?.zoom) === 2, JSON.stringify(lens?.lens || {}));

  // Overlay no PGM: linhas anguladas + medição
  const pgm = await replay.ev(`(async () => { await new Promise((r) => setTimeout(r, 400)); return window.opener.__castdeck.comp?.varOverlay || null; })()`);
  ok('PGM recebeu as linhas anguladas', Array.isArray(pgm?.lines) && pgm.lines.length === 2 && Number.isFinite(Number(pgm.lines[0].x1)) && Number.isFinite(Number(pgm.lines[0].y2)), JSON.stringify(pgm?.lines || []).slice(0, 300));
  ok('PGM recebeu a medição', /m/.test(String(pgm?.status?.text || '')), JSON.stringify(pgm?.status || {}));
  ok('PGM recebeu a lupa', !!pgm?.lens && Number(pgm?.lens?.zoom) === 2, JSON.stringify(pgm?.lens || {}));

  // Print do estado final
  const shot = await replay.cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (shot.result?.data) fs.writeFileSync('D:/REA/docs/designs/replay/var-v2.png', Buffer.from(shot.result.data, 'base64'));
  console.log('print: docs/designs/replay/var-v2.png');

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
console.log(falhou ? '\nREPLAY_VAR_FAIL' : '\nREPLAY_VAR_OK');
process.exit(falhou ? 1 : 0);
