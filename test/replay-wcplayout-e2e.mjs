// E2E do playout WebCodecs integrado ao motor: TAKE de um clipe, canvas no compositor,
// passo de quadro, REV (reverse pelo botão do console) e volta ao modo normal.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4582, CDP = 9592;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-wce-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-wce-edge-' + crypto.randomBytes(3).toString('hex'));
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
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'WCE' }) }).then((r) => r.json());
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
    const meta = await eng.saveClipToDisk(clip, { title: 'WCE', tag: 'GOL', speed: 0.5, markIn: 0, markOut: 5 });
    return meta ? { webmUrl: meta.webmUrl } : { erro: 'save falhou' };
  })()`);
  ok('clipe salvo', !!saved?.webmUrl, JSON.stringify(saved).slice(0, 200));

  // TAKE do clipe no PGM via motor (playout WebCodecs)
  const started = await replay.ev(`window.opener.__castdeck.replayEngine.playoutReplay({ url: ${JSON.stringify(saved.webmUrl)}, speed: 0.5, currentTime: 0, audioRoute: 'mute', audioVolume: 0 })`);
  ok('playout iniciado', started === true, started);
  await esperar(2600);
  const dbg1 = await replay.ev(`window.opener.__castdeck.replayEngine.getPlayoutDebug?.()`);
  console.log('debug1:', JSON.stringify(dbg1));
  ok('WebCodecs playout ativo', dbg1?.wcActive === true, JSON.stringify(dbg1));
  ok('canvas virou a fonte do compositor', dbg1?.sourceIsCanvas === true, JSON.stringify(dbg1));
  ok('playhead avançou', Number(dbg1?.time) > 0.2, dbg1?.time);

  // pixels do PGM (compositor) não podem estar pretos
  const lum = await studio.ev(`(() => {
    const c = window.__castdeck.comp.canvas;
    if (!c) return -1;
    const t = document.createElement('canvas'); t.width = 64; t.height = 36;
    const x = t.getContext('2d'); x.drawImage(c, 0, 0, 64, 36);
    const d = x.getImageData(0, 0, 64, 36).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) n++;
    return +(n / (64 * 36)).toFixed(3);
  })()`);
  ok('PGM desenhando o clipe (não preto)', Number(lum) > 0.1, lum);

  // passo de quadro
  const tStep = await replay.ev(`(async () => {
    const eng = window.opener.__castdeck.replayEngine;
    const t0 = eng.getPlayoutState().time;
    eng.pausePlayout();
    eng.stepPlayout(1 / 30);
    await new Promise((r) => setTimeout(r, 300));
    const t1 = eng.getPlayoutState().time;
    return { t0, t1, paused: eng.getPlayoutState().paused };
  })()`);
  console.log('step:', JSON.stringify(tStep));
  ok('passo de quadro muda o tempo', Number(tStep?.t1) > Number(tStep?.t0) && Number(tStep.t1) - Number(tStep.t0) < 0.3, JSON.stringify(tStep));

  // REV pelo botão do console (precisa estar no ar: playPlayout para retomar)
  await replay.ev(`window.opener.__castdeck.replayEngine.playPlayout()`);
  await esperar(400);
  const rev = await replay.ev(`(async () => {
    const eng = window.opener.__castdeck.replayEngine;
    const before = eng.getPlayoutState().time;
    document.querySelector('#rp-btn-rev')?.click();
    await new Promise((r) => setTimeout(r, 1200));
    const st = eng.getPlayoutState();
    const dbg = eng.getPlayoutDebug?.();
    return { before, after: st.time, speed: st.speed, dbg };
  })()`);
  console.log('rev:', JSON.stringify(rev));
  ok('REV ativou o reverse', rev?.dbg?.wcReverse === true && Number(rev?.speed) < 0, JSON.stringify(rev));
  ok('REV andou para trás', Number(rev?.after) < Number(rev?.before) - 0.1, `${rev?.after} < ${rev?.before}`);

  // volta ao normal e para o playout
  await replay.ev(`window.opener.__castdeck.replayEngine.setPlayoutSpeed(0.5)`);
  await esperar(400);
  await replay.ev(`window.opener.__castdeck.replayEngine.stopPlayout()`);
  await esperar(700);
  const dbg2 = await replay.ev(`window.opener.__castdeck.replayEngine.getPlayoutDebug?.()`);
  ok('playout encerrado (fonte volta ao <video>)', dbg2?.wcActive === false && dbg2?.sourceIsCanvas === false, JSON.stringify(dbg2));

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
console.log(falhou ? '\nREPLAY_WCPLAYOUT_E2E_FAIL' : '\nREPLAY_WCPLAYOUT_E2E_OK');
process.exit(falhou ? 1 : 0);
