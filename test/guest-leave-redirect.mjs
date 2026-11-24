// Teste: ao sair da chamada o convidado é levado para https://cast.flue.live
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4588, CDP = 9598;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-leave-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-leave-edge-' + crypto.randomBytes(3).toString('hex'));
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
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Leave' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) { await esperar(500); try { alvo = (await listar()).find((t) => t.type === 'page' && !t.url.includes('/join/')); } catch {} }
  const studio = await conectar(alvo);
  await studio.cmd('Page.navigate', { url: `${BASE}/studio/${sid}` });
  await esperar(4000);
  await studio.ev(`document.querySelector('#lb-go')?.click()`);
  await esperar(2500);

  // página do convidado
  const guestAlvo = await studio.cmd('Target.createTarget', { url: `${BASE}/join/${sid}` });
  const tid = guestAlvo.result?.targetId;
  let guestInfo = null;
  for (let i = 0; i < 60 && !tid; i++) { await esperar(300); }
  for (let i = 0; i < 80; i++) {
    guestInfo = (await listar()).find((t) => t.id === tid) || (await listar()).find((t) => t.url.includes('/join/'));
    if (guestInfo?.webSocketDebuggerUrl) break;
    await esperar(300);
  }
  ok('página do convidado abriu', !!guestInfo?.webSocketDebuggerUrl, 'sem target join');
  const guest = await conectar(guestInfo);
  for (let i = 0; i < 40; i++) { if (await guest.ev(`!!document.querySelector('#lb-go')`)) break; await esperar(500); }
  ok('lobby do convidado carregou', await guest.ev(`!!document.querySelector('#lb-go')`));
  await guest.ev(`document.querySelector('#lb-go')?.click()`);
  let entrou = false;
  for (let i = 0; i < 60; i++) {
    entrou = await guest.ev(`!!document.querySelector('#g-leave')`);
    if (entrou) break;
    await esperar(500);
  }
  ok('convidado entrou na chamada', entrou);

  // Sair da chamada → confirma → despedida com redirecionamento ao site
  await guest.ev(`document.querySelector('#g-leave')?.click()`);
  await esperar(700);
  const confirmou = await guest.ev(`(async () => { const b = document.querySelector('#ask-ok'); if (!b) return false; b.click(); return true; })()`);
  ok('confirmação de saída apareceu', confirmou === true);
  await esperar(900);
  const despedida = await guest.ev(`(() => ({ text: document.body.innerText || '', url: location.href }))()`);
  ok('tela de despedida cita cast.flue.live', /cast\.flue\.live/i.test(despedida.text), despedida.text.slice(0, 200));
  ok('ainda não redirecionou na hora (mostra a mensagem)', despedida.url.startsWith(BASE + '/join/'), despedida.url);

  let urlFinal = despedida.url;
  for (let i = 0; i < 20; i++) {
    await esperar(500);
    try { urlFinal = await guest.ev(`location.href`); } catch { break; }
    if (String(urlFinal).startsWith('https://cast.flue.live')) break;
  }
  ok('foi levado para cast.flue.live', String(urlFinal).startsWith('https://cast.flue.live'), urlFinal);

  guest.ws.close();
  studio.ws.close();
} catch (e) {
  falhou = true;
  console.log('ERRO:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhou ? '\nGUEST_LEAVE_FAIL' : '\nGUEST_LEAVE_OK');
process.exit(falhou ? 1 : 0);
