// E2E do co-host: promoção, abas do painel e replay instantâneo mandando ao PGM
// (host + convidado reais no Edge headless).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4589, CDP = 9599;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-ch-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-ch-edge-' + crypto.randomBytes(3).toString('hex'));
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
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'CoHost' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) { await esperar(500); try { alvo = (await listar()).find((t) => t.type === 'page' && !t.url.includes('/join/')); } catch {} }
  const studio = await conectar(alvo);
  await studio.cmd('Page.navigate', { url: `${BASE}/studio/${sid}` });
  await esperar(4000);
  await studio.ev(`document.querySelector('#lb-go')?.click()`);
  let canvasOk = false;
  for (let i = 0; i < 40; i++) { canvasOk = await studio.ev('!!document.querySelector(\'#program-canvas\')'); if (canvasOk) break; await esperar(500); }
  ok('estúdio abriu', canvasOk);

  const guestAlvo = await studio.cmd('Target.createTarget', { url: `${BASE}/join/${sid}` });
  const tid = guestAlvo.result?.targetId;
  let guestInfo = null;
  for (let i = 0; i < 80; i++) {
    guestInfo = (await listar()).find((t) => t.id === tid) || (await listar()).find((t) => t.url.includes('/join/'));
    if (guestInfo?.webSocketDebuggerUrl) break;
    await esperar(300);
  }
  const guest = await conectar(guestInfo);
  for (let i = 0; i < 40; i++) { if (await guest.ev(`!!document.querySelector('#lb-go')`)) break; await esperar(500); }
  await guest.ev(`document.querySelector('#lb-go')?.click()`);
  let entrou = false;
  for (let i = 0; i < 60; i++) { entrou = await guest.ev(`!!document.querySelector('#g-leave')`); if (entrou) break; await esperar(500); }
  ok('convidado entrou', entrou);

  // espera o convidado conectar na sala do host
  let gid = null;
  for (let i = 0; i < 60; i++) {
    gid = await studio.ev(`(() => { const S = window.__castdeck.S; return S.guests.size ? [...S.guests.keys()][0] : null; })()`);
    if (gid) break;
    await esperar(500);
  }
  ok('host vê o convidado', !!gid, 'sem guests');
  // câmera do convidado precisa virar fonte para o tile (com o botão de co-host) aparecer
  let camSrc = false;
  for (let i = 0; i < 40; i++) {
    camSrc = await studio.ev(`window.__castdeck.S.sources.has(${JSON.stringify(gid)} + ':cam')`);
    if (camSrc) break;
    await esperar(500);
  }
  ok('câmera do convidado virou fonte', camSrc);
  await esperar(1500);
  let promoted = false;
  for (let i = 0; i < 10; i++) {
    promoted = await studio.ev(`(() => { const b = document.querySelector('.tile .acts button[title*="co-host"]'); if (!b) return false; b.click(); return true; })()`);
    if (promoted) break;
    await esperar(500);
  }
  ok('botão de tornar co-host clicado', promoted === true);
  let cohostOn = false;
  for (let i = 0; i < 30; i++) { cohostOn = await guest.ev(`!document.querySelector('#g-prod')?.hidden`); if (cohostOn) break; await esperar(500); }
  ok('convidado virou co-host (botão Produção aparece)', cohostOn);

  // painel novo com abas
  await guest.ev(`document.querySelector('#g-prod')?.click()`);
  await esperar(1200);
  const panel = await guest.ev(`(() => ({ tabs: [...document.querySelectorAll('#cp-tabs .cp-tab')].map((b) => b.textContent.trim()), groups: document.querySelectorAll('#prod-live .cp-group').length, replay: !!document.querySelector('#cp-replay') }))()`);
  ok('painel de co-host com 3 abas', Array.isArray(panel.tabs) && panel.tabs.length === 3, JSON.stringify(panel));
  ok('seção de replay presente', panel.replay === true, JSON.stringify(panel));
  await guest.ev(`document.querySelector('[data-cptab="stage"]')?.click()`);
  await esperar(400);
  const stageVisible = await guest.ev(`(() => { const g = document.querySelector('.cp-group[data-cpgroup="stage"]'); return !!g && !g.hidden; })()`);
  ok('aba Palco mostra o grupo', stageVisible);
  await guest.ev(`document.querySelector('[data-cptab="gfx"]')?.click()`);
  await esperar(400);
  const gfxVisible = await guest.ev(`(() => { const g = document.querySelector('.cp-group[data-cpgroup="gfx"]'); return !!g && !g.hidden; })()`);
  ok('aba Gráficos mostra o grupo', gfxVisible);
  await guest.ev(`document.querySelector('[data-cptab="live"]')?.click()`);
  await esperar(300);

  // host liga o buffer; o painel do co-host deve mostrar o replay pronto
  await studio.ev(`window.__castdeck.replayEngine.startBuffer()`);
  let ready = false;
  for (let i = 0; i < 40; i++) {
    const st = await studio.ev(`(() => { const s = window.__castdeck.replayEngine.getStats(); return { a: s.active, d: s.duration }; })()`);
    if (st.a && Number(st.d) >= 6) { ready = true; break; }
    await esperar(500);
  }
  ok('buffer encheu no estúdio', ready);
  let enabled = false;
  for (let i = 0; i < 20; i++) { enabled = await guest.ev(`!document.querySelector('[data-op="replay"][data-sec="5"]')?.disabled`); if (enabled) break; await esperar(500); }
  ok('co-host vê o replay habilitado', enabled);

  // sanidade: um comando de co-host conhecido (layout) precisa chegar ao host
  const layoutBefore = await studio.ev('window.__castdeck.S.layout');
  await guest.ev(`(() => { const b = document.querySelector('[data-op="layout"]'); if (b) b.click(); })()`);
  await esperar(1500);
  const layoutAfter = await studio.ev('window.__castdeck.S.layout');
  ok('comando de layout do co-host chega ao host', layoutBefore !== layoutAfter, layoutBefore + ' -> ' + layoutAfter);
  await guest.ev(`document.querySelector('[data-op="replay"][data-sec="5"]')?.click()`);
  let onAir = false;
  for (let i = 0; i < 30; i++) { onAir = await studio.ev(`window.__castdeck.replayEngine.isPlayoutOnAir()`); if (onAir) break; await esperar(500); }
  ok('co-host mandou o replay para o PGM', onAir === true);

  await guest.ev(`document.querySelector('[data-op="replay-live"]')?.click()`);
  let off = true;
  for (let i = 0; i < 20; i++) { off = await studio.ev(`window.__castdeck.replayEngine.isPlayoutOnAir()`); if (!off) break; await esperar(500); }
  ok('co-host voltou ao vivo', off === false);

  guest.ws.close(); studio.ws.close();
} catch (e) {
  falhou = true;
  console.log('ERRO:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhou ? '\nCOHOST_REPLAY_FAIL' : '\nCOHOST_REPLAY_OK');
process.exit(falhou ? 1 : 0);
