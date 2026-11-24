// UI: o novo destino abre com a CHAVE em primeiro plano (login/conta é opcional) e salva com chave.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4598, CDP = 9608;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-key-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-key-edge-' + crypto.randomBytes(3).toString('hex'));
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
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Key' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) { await esperar(500); try { alvo = (await listar()).find((t) => t.type === 'page' && !t.url.includes('/join/')); } catch {} }
  const studio = await conectar(alvo);
  await studio.cmd('Page.navigate', { url: `${BASE}/studio/${sid}?lang=pt` });
  await esperar(4000);
  await studio.ev(`document.querySelector('#lb-go')?.click()`);
  for (let i = 0; i < 40; i++) { if (await studio.ev(`!!document.querySelector('#program-canvas')`)) break; await esperar(500); }

  await studio.ev(`document.querySelector('#btn-live')?.click()`);
  let hasAdd = false;
  for (let i = 0; i < 20; i++) { hasAdd = await studio.ev(`!!document.querySelector('[data-gl-add="h"]')`); if (hasAdd) break; await esperar(400); }
  ok('diálogo Transmitir abriu', hasAdd);
  await studio.ev(`document.querySelector('[data-gl-add="h"]')?.click()`);
  let editor = false;
  for (let i = 0; i < 20; i++) { editor = await studio.ev(`!!document.querySelector('#d-key')`); if (editor) break; await esperar(300); }
  ok('editor de destino abriu', editor);

  const ui = await studio.ev(`(() => {
    const key = document.querySelector('#d-key');
    const login = document.querySelector('#d-login');
    const keyVisible = !!key && key.offsetParent !== null;
    return {
      keyVisible,
      keyFocus: document.activeElement === key,
      loginDetails: !!login,
      loginIsDetails: login?.tagName === 'DETAILS',
      loginText: login?.querySelector('summary')?.textContent?.trim() || '',
      manualDetails: !!document.querySelector('.d-manual:not(#d-login)'),
      sub: document.querySelector('.modal .sub')?.textContent || '',
    };
  })()`);
  ok('campo da chave aparece direto (sem abrir "manual")', ui.keyVisible === true && ui.manualDetails === false, JSON.stringify(ui));
  ok('login/conta é um detalhe opcional', ui.loginIsDetails === true && /conta|opcional/i.test(ui.loginText), JSON.stringify(ui));
  ok('texto explica que chave é o caminho rápido', /chave/i.test(ui.sub), ui.sub.slice(0, 160));

  // salva um destino só com a chave, como o cliente faria
  const saved = await studio.ev(`(async () => {
    document.querySelector('#d-key').value = 'chave-teste-123';
    document.querySelector('#d-name').value = 'YouTube teste';
    document.querySelector('#d-save').click();
    await new Promise((r) => setTimeout(r, 1800));
    const list = await (await fetch('/api/destinations')).json();
    return list.map((d) => ({ name: d.name, platform: d.platform, hasKey: !!d.hasKey, url: d.url }));
  })()`);
  ok('destino salvo só com a chave', Array.isArray(saved) && saved.some((d) => d.name === 'YouTube teste' && d.hasKey), JSON.stringify(saved));

  const shot = await studio.cmd('Page.captureScreenshot', { format: 'png' });
  if (shot.result?.data) fs.writeFileSync('D:/REA/docs/designs/destino-chave.png', Buffer.from(shot.result.data, 'base64'));
  console.log('print: docs/designs/destino-chave.png');
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
console.log(falhou ? '\nDEST_KEY_UI_FAIL' : '\nDEST_KEY_UI_OK');
process.exit(falhou ? 1 : 0);
