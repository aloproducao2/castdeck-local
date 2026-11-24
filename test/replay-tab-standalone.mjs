// Teste: a aba Replay do estúdio opera o replay instantâneo SEM abrir a janela do console.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4587, CDP = 9597;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-tab-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-tab-edge-' + crypto.randomBytes(3).toString('hex'));
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
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'TAB' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) { await esperar(500); try { alvo = (await listar()).find((t) => t.type === 'page' && !t.url.includes('replay.html')); } catch {} }
  const studio = await conectar(alvo);
  await studio.cmd('Page.navigate', { url: `${BASE}/studio/${sid}` });
  await esperar(4500);
  await studio.ev(`document.querySelector('#lb-go')?.click()`);
  for (let i = 0; i < 40; i++) { if (await studio.ev(`!!document.querySelector('#program-canvas')`)) break; await esperar(500); }

  // abre a aba Replay SEM console
  const consoleAberto0 = (await listar()).some((t) => t.url.includes('replay.html'));
  ok('nenhum console aberto no início', !consoleAberto0, 'já havia replay.html');
  await studio.ev(`document.querySelector('[data-tab="replay"]')?.click()`);
  await esperar(1200);
  const panel = await studio.ev(`(() => ({ cards: document.querySelectorAll('#panel-replay .rp-tab-card').length, toggle: !!document.querySelector('#rp-tab-toggle'), air: document.querySelector('#rp-tab-air')?.textContent || '' }))()`);
  ok('aba Replay montada', panel.cards >= 3 && panel.toggle, JSON.stringify(panel));

  // liga o buffer e espera encher
  const ativo = await studio.ev(`window.__castdeck.replayEngine.isBufferActive()`);
  if (!ativo) await studio.ev(`document.querySelector('#rp-tab-toggle')?.click()`);
  let st = {};
  for (let i = 0; i < 40; i++) {
    st = await studio.ev(`(() => { const s = window.__castdeck.replayEngine.getStats(); return { active: s.active, dur: s.duration }; })()`);
    if (st.active === true && Number(st.dur) >= 5) break;
    await esperar(500);
  }
  ok('buffer enchendo sem console', st.active === true && Number(st.dur) >= 5, JSON.stringify(st));

  // gatilho: cria o lance e manda ao PGM
  await studio.ev(`document.querySelector('[data-rp-replay="5"]')?.click()`);
  let onAir = {};
  for (let i = 0; i < 30; i++) {
    onAir = await studio.ev(`window.__castdeck.replayEngine.isPlayoutOnAir()`);
    if (onAir === true) break;
    await esperar(500);
  }
  await esperar(1200);
  onAir = await studio.ev(`(() => {
    const eng = window.__castdeck.replayEngine;
    const comp = window.__castdeck.comp;
    const c = comp.canvas;
    const t = document.createElement('canvas'); t.width = 64; t.height = 36;
    const x = t.getContext('2d'); x.drawImage(c, 0, 0, 64, 36);
    const d = x.getImageData(0, 0, 64, 36).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) n++;
    return { onAir: eng.isPlayoutOnAir(), take: comp.take, solo: comp.solo, bug: comp.replayBug, lum: +(n / (64 * 36)).toFixed(3) };
  })()`);
  ok('gatilho colocou o lance no ar (sem console)', onAir.onAir === true, JSON.stringify(onAir));
  ok('PGM desenhando o lance', Number(onAir.lum) > 0.1, JSON.stringify(onAir));
  const consoleAberto1 = (await listar()).some((t) => t.url.includes('replay.html'));
  ok('gatilho NÃO abriu o console', !consoleAberto1, 'replay.html apareceu');

  // AO VIVO
  await studio.ev(`document.querySelector('#rp-tab-live')?.click()`);
  await esperar(1200);
  const fora = await studio.ev(`window.__castdeck.replayEngine.isPlayoutOnAir()`);
  ok('AO VIVO tirou o replay', fora === false, fora);

  // Salvar lance
  const antes = (await (await fetch(BASE + '/api/replay/clips')).json()).length;
  await studio.ev(`document.querySelector('#rp-tab-save')?.click()`);
  await esperar(3000);
  const depois = (await (await fetch(BASE + '/api/replay/clips')).json()).length;
  ok('Salvar lance grava no disco', depois > antes, `${antes} -> ${depois}`);

  // Abrir console continua funcionando
  await studio.ev(`document.querySelector('#rp-tab-open')?.click()`);
  await esperar(2500);
  const consoleAberto2 = (await listar()).some((t) => t.url.includes('replay.html'));
  ok('Abrir console funciona', consoleAberto2, 'sem replay.html');

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
console.log(falhou ? '\nREPLAY_TAB_STANDALONE_FAIL' : '\nREPLAY_TAB_STANDALONE_OK');
process.exit(falhou ? 1 : 0);
