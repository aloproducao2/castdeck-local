// Regressão: a prévia da câmera na tela de entrada (estúdio e convidado) não pode estar espelhada.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
const PORTA = 4595, CDP = 9605;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-lb-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-lb-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });
async function conectar(alvo) {
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cmd = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, (m) => res(m)); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => res({ result: { exceptionDetails: { exception: { description: 'timeout' } } } }), 60000); });
  const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description || '').slice(0, 300)); return r.result?.result?.value; };
  await cmd('Runtime.enable'); await cmd('Page.enable');
  return { ws, cmd, ev };
}
const listar = async () => (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json());
let falhou = false;
const ok = (nome, cond, info = '') => { if (!cond) falhou = true; console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + String(info).slice(0, 300))); };
const semEspelho = (t) => !t || t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) { await esperar(600); try { pronto = (await fetch(BASE + '/')).ok; } catch {} }
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Lobby' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) { await esperar(500); try { alvo = (await listar()).find((t) => t.type === 'page' && !t.url.includes('/join/')); } catch {} }

  const studio = await conectar(alvo);
  await studio.cmd('Page.navigate', { url: `${BASE}/studio/${sid}?lang=pt` });
  let tr = '';
  for (let i = 0; i < 40; i++) {
    tr = await studio.ev(`(() => { const v = document.querySelector('.lobby-preview video'); return v ? getComputedStyle(v).transform : 'sem-video'; })()`);
    if (tr && tr !== 'sem-video') break;
    await esperar(500);
  }
  ok('prévia do estúdio sem espelho', semEspelho(tr), tr);

  const gt = await studio.cmd('Target.createTarget', { url: `${BASE}/join/${sid}?lang=pt` });
  const tid = gt.result?.targetId;
  let gi = null;
  for (let i = 0; i < 60; i++) { gi = (await listar()).find((t) => t.id === tid) || (await listar()).find((t) => t.url.includes('/join/')); if (gi?.webSocketDebuggerUrl) break; await esperar(300); }
  const guest = await conectar(gi);
  let tr2 = '';
  for (let i = 0; i < 40; i++) {
    tr2 = await guest.ev(`(() => { const v = document.querySelector('.lobby-preview video'); return v ? getComputedStyle(v).transform : 'sem-video'; })()`);
    if (tr2 && tr2 !== 'sem-video') break;
    await esperar(500);
  }
  ok('prévia do convidado sem espelho', semEspelho(tr2), tr2);
  guest.ws.close(); studio.ws.close();
} catch (e) { falhou = true; console.log('ERRO:', e.message); }
finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhou ? '\nLOBBY_MIRROR_FAIL' : '\nLOBBY_MIRROR_OK');
process.exit(falhou ? 1 : 0);
