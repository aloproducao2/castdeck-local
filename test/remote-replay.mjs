// E2E do controle remoto (celular): aba Replay com REV, passo de quadro, salvar lance e gatilho no PGM.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4593, CDP = 9603;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-rem-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-rem-edge-' + crypto.randomBytes(3).toString('hex'));
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
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Remote' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) { await esperar(500); try { alvo = (await listar()).find((t) => t.type === 'page' && !t.url.includes('/remote/')); } catch {} }
  const studio = await conectar(alvo);
  await studio.cmd('Page.navigate', { url: `${BASE}/studio/${sid}?lang=pt` });
  await esperar(4000);
  await studio.ev(`document.querySelector('#lb-go')?.click()`);
  let canvasOk = false;
  for (let i = 0; i < 40; i++) { canvasOk = await studio.ev('!!document.querySelector(\'#program-canvas\')'); if (canvasOk) break; await esperar(500); }
  ok('estúdio abriu', canvasOk);

  let key = '';
  for (let i = 0; i < 40; i++) {
    key = await studio.ev('window.__castdeck.S.outKey || ""');
    if (key) break;
    await esperar(500);
  }
  ok('chave do controle remoto disponível', !!key, key);
  const remoteUrl = `${BASE}/remote/${sid}?k=${encodeURIComponent(key)}&tab=replay`;
  const rt = await studio.cmd('Target.createTarget', { url: remoteUrl });
  const rTid = rt.result?.targetId;
  let rInfo = null;
  for (let i = 0; i < 80; i++) { rInfo = (await listar()).find((t) => t.id === rTid) || (await listar()).find((t) => t.url.includes('/remote/')); if (rInfo?.webSocketDebuggerUrl) break; await esperar(300); }
  const remote = await conectar(rInfo);
  let conectado = false;
  for (let i = 0; i < 40; i++) { conectado = await remote.ev(`document.querySelector('#dot')?.classList.contains('on')`); if (conectado) break; await esperar(500); }
  ok('controle remoto conectou', conectado === true);

  const ui = await remote.ev(`(() => ({ rev: !!document.querySelector('[data-act="replay-rev"]'), step: !!document.querySelector('[data-act="replay-step"]'), save: !!document.querySelector('[data-act="replay-save"]'), triggers: document.querySelectorAll('[data-act="replay-trigger"]').length }))()`);
  ok('aba Replay com REV, passo e salvar', ui.rev && ui.step && ui.save && ui.triggers === 4, JSON.stringify(ui));

  await studio.ev(`window.__castdeck.replayEngine.startBuffer()`);
  let ready = false;
  for (let i = 0; i < 40; i++) {
    const st = await studio.ev(`(() => { const s = window.__castdeck.replayEngine.getStats(); return { a: s.active, d: s.duration }; })()`);
    if (st.a && Number(st.d) >= 6) { ready = true; break; }
    await esperar(500);
  }
  ok('buffer encheu', ready);
  let enabled = false;
  for (let i = 0; i < 20; i++) { enabled = await remote.ev(`!document.querySelector('[data-act="replay-trigger"]')?.disabled`); if (enabled) break; await esperar(500); }
  ok('gatilho do remoto habilitado', enabled);

  await remote.ev(`document.querySelector('[data-act="replay-trigger"]')?.click()`);
  let onAir = false;
  for (let i = 0; i < 30; i++) { onAir = await studio.ev(`window.__castdeck.replayEngine.isPlayoutOnAir()`); if (onAir) break; await esperar(500); }
  ok('remoto mandou o replay ao PGM', onAir === true);

  let wcActive = false;
  for (let i = 0; i < 30; i++) { const d = await studio.ev('window.__castdeck.replayEngine.getPlayoutDebug?.()'); wcActive = !!d?.wcActive; if (wcActive) break; await esperar(500); }
  ok('playout WebCodecs ativo', wcActive);


  let revEnabled = false;
  for (let i = 0; i < 20; i++) { revEnabled = await remote.ev(`!document.querySelector('[data-act="replay-rev"]')?.disabled`); if (revEnabled) break; await esperar(400); }
  ok('botão REV habilitado no remoto', revEnabled);
  await remote.ev(`document.querySelector('[data-act="replay-rev"]')?.click()`);
  let rev = false;
  for (let i = 0; i < 20; i++) { rev = await studio.ev(`window.__castdeck.replayEngine.getPlayoutState().speed < 0`); if (rev) break; await esperar(400); }
  ok('REV do remoto ativou o reverse', rev === true);

  const t0 = await studio.ev(`window.__castdeck.replayEngine.getPlayoutState().time`);
  await remote.ev(`document.querySelector('[data-act="replay-step"][data-dir="1"]')?.click()`);
  let t1 = t0;
  for (let i = 0; i < 10; i++) { t1 = await studio.ev(`window.__castdeck.replayEngine.getPlayoutState().time`); if (Math.abs(t1 - t0) > 0.001) break; await esperar(300); }
  ok('passo de quadro do remoto mexe no playhead', Math.abs(t1 - t0) > 0.001, `${t0} -> ${t1}`);

  await remote.ev(`document.querySelector('[data-act="replay-stop"]')?.click()`);
  let off = true;
  for (let i = 0; i < 20; i++) { off = await studio.ev(`window.__castdeck.replayEngine.isPlayoutOnAir()`); if (!off) break; await esperar(500); }
  ok('remoto voltou ao vivo', off === false);

  remote.ws.close(); studio.ws.close();
} catch (e) {
  falhou = true;
  console.log('ERRO:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhou ? '\nREMOTE_REPLAY_FAIL' : '\nREMOTE_REPLAY_OK');
process.exit(falhou ? 1 : 0);
