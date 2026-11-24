// Teste de UI: traduções do app nas 4 línguas (PIP e efeitos avançados) no app real.
// Uso: node test/i18n-ui.mjs (sai com 0 = tudo traduzido, 1 = faltando).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4561;
const CDP = 9557;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-i18n-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(process.execPath, [path.join(process.cwd(), 'server', 'index.js')], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: 'ignore',
  windowsHide: true,
});
const perfil = path.join(os.tmpdir(), 'cd-i18n-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });

const falhas = [];
const ok = (nome, cond, info = '') => { if (!cond) falhas.push(nome); console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + String(info).slice(0, 300))); };

try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) { await esperar(600); try { pronto = (await fetch(BASE + '/')).ok; } catch {} }
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'i18n' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;

  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) { await esperar(500); try { alvo = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cmd = (method, params = {}) => new Promise((res) => {
    const id = ++seq;
    const t = setTimeout(() => {
      pend.delete(id);
      res({ result: { exceptionDetails: { exception: { description: 'timeout CDP ' + method } } } });
    }, 15000);
    pend.set(id, (m) => { clearTimeout(t); res(m); });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description || '').slice(0, 300)); return r.result?.result?.value; };
  await cmd('Runtime.enable'); await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: `${BASE}/studio/${sid}?lang=en` });
  await esperar(3500);
  await ev(`document.querySelector('#lb-go')?.click()`);
  for (let i = 0; i < 40; i++) { if (await ev(`!!document.querySelector('#program-canvas')`)) break; await esperar(500); }
  await esperar(1500);

  // abre a aba PIP
  await ev(`document.querySelector('.grp[data-group=brand]')?.click()`);
  await esperar(300);
  await ev(`document.querySelector('.subtabs .tab[data-tab=pip]')?.click()`);
  await esperar(700);

  const painel = async () => ev(`(() => { const p = document.querySelector('#panel-pip'); return p ? p.textContent.replace(/\\s+/g, ' ').trim() : ''; })()`);
  const secao = async () => ev(`(() => { const t = document.querySelector('.subtabs .tab[data-tab=pip]'); return t ? t.textContent.trim() : ''; })()`);

  let t = await painel();
  ok('en: "Enable PIP" no painel', /Enable PIP/.test(t), t.slice(0, 120));
  ok('en: "Source (video)"', /Source \(video\)/.test(t), t.slice(0, 200));
  ok('en: aba PIP / Sign language', /PIP \/ Sign language/.test(await secao()), await secao());

  await ev(`window.CDi18n.set('es')`); await esperar(900);
  t = await painel();
  ok('es: "Activar PIP"', /Activar PIP/.test(t), t.slice(0, 120));
  ok('es: aba PIP / Lengua de signos', /PIP \/ Lengua de signos/.test(await secao()), await secao());

  await ev(`window.CDi18n.set('fr')`); await esperar(900);
  t = await painel();
  ok('fr: "Activer le PIP"', /Activer le PIP/.test(t), t.slice(0, 120));
  ok('fr: aba PIP / Langue des signes', /PIP \/ Langue des signes/.test(await secao()), await secao());

  await ev(`window.CDi18n.set('de')`); await esperar(900);
  t = await painel();
  ok('de: "PIP aktivieren"', /PIP aktivieren/.test(t), t.slice(0, 120));
  ok('de: aba PIP / Gebärdensprache', /PIP \/ Gebärdensprache/.test(await secao()), await secao());

  // diálogo de efeitos (Longpipe) em EN
  await ev(`window.CDi18n.set('en')`); await esperar(700);
  await ev(`(async () => { const cv = document.createElement('canvas'); cv.width = 320; cv.height = 240; const cx = cv.getContext('2d'); cx.fillStyle = '#0f0'; cx.fillRect(0, 0, 320, 240); window.__castdeck.addVideoSource('host:cam', cv.captureStream(30), { kind: 'camera', label: 'Teste' }); return true; })()`);
  await esperar(500);
  await ev(`(() => { window.__castdeck.openFx('host:cam')?.catch?.(() => {}); return true; })()`);
  await esperar(900);
  const fx = await ev(`(() => { const m = document.querySelector('.modal-back'); return m ? m.textContent.replace(/\\s+/g, ' ').trim() : ''; })()`);
  ok('en: "Advanced (Longpipe)" no diálogo de efeitos', /Advanced \(Longpipe\)/.test(fx), fx.slice(0, 200));
  ok('en: "Fast (default)"', /Fast \(default\)/.test(fx), fx.slice(0, 200));
  ok('en: "Effects engine"', /Effects engine/.test(fx), fx.slice(0, 200));

  ws.close();
} catch (e) {
  falhas.push('exceção');
  console.log('FALHA exceção:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhas.length ? `\nI18N_UI_FAIL (${falhas.length}): ${falhas.join(', ')}` : '\nI18N_UI_OK');
process.exit(falhas.length ? 1 : 0);
