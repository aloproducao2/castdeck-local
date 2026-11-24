// E2E: duplicar uma fonte em 4 quadrantes (recorte), montar cena e remover sem parar a captura original.
// Usa uma fonte sintética com 4 cores para provar que cada recorte desenha a região certa.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4596, CDP = 9606;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-dup-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-dup-edge-' + crypto.randomBytes(3).toString('hex'));
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
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Dup' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) { await esperar(500); try { alvo = (await listar()).find((t) => t.type === 'page' && !t.url.includes('/join/')); } catch {} }
  const studio = await conectar(alvo);
  await studio.cmd('Page.navigate', { url: `${BASE}/studio/${sid}?lang=pt` });
  await esperar(4000);
  await studio.ev(`document.querySelector('#lb-go')?.click()`);
  for (let i = 0; i < 40; i++) { if (await studio.ev('!!document.querySelector(\'#program-canvas\')')) break; await esperar(500); }

  // fonte sintética: 4 quadrantes coloridos (TL vermelho, TR verde, BL azul, BR amarelo)
  const srcReady = await studio.ev(`(async () => {
    const a = window.__castdeck;
    const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
    const x = c.getContext('2d');
    const paint = () => {
      x.fillStyle = '#e02020'; x.fillRect(0, 0, 640, 360);
      x.fillStyle = '#20e020'; x.fillRect(640, 0, 640, 360);
      x.fillStyle = '#2020e0'; x.fillRect(0, 360, 640, 360);
      x.fillStyle = '#e0e020'; x.fillRect(640, 360, 640, 360);
      x.fillStyle = '#111'; x.fillRect(620, 340, 40, 40);
      window.__dupPaint = requestAnimationFrame(paint);
    };
    paint();
    const stream = c.captureStream(30);
    const s = a.addVideoSource('test:src', stream, { kind: 'camera', label: 'Fonte teste', ownerId: 'host', camOff: false });
    for (let i = 0; i < 50 && !(s.el.videoWidth > 0); i++) await new Promise((r) => setTimeout(r, 100));
    return { vw: s.el.videoWidth, tracks: stream.getVideoTracks().map((t) => t.readyState) };
  })()`);
  ok('fonte sintética pronta', srcReady.vw > 0 && srcReady.tracks[0] === 'live', JSON.stringify(srcReady));

  const action = await studio.ev(`[...document.querySelectorAll('.tile[data-src-id="test:src"] .acts button')].map((b) => b.title).join(' | ')`);
  ok('card da fonte tem ação de duplicar', /Duplicar fonte/i.test(action), action);

  // abre o diálogo pelo card: padrão é CÓPIA INTEIRA (sem recorte) e recorte é opcional
  await studio.ev(`(() => { const b = [...document.querySelectorAll('.tile[data-src-id="test:src"] .acts button')].find((x) => /Duplicar fonte/i.test(x.title)); if (b) b.click(); })()`);
  let dlg = null;
  for (let i = 0; i < 20; i++) { dlg = await studio.ev(`!!document.querySelector('#dup-mode')`); if (dlg) break; await esperar(300); }
  ok('diálogo de duplicar abriu', dlg === true);
  const dlgDefault = await studio.ev(`(() => ({ fullActive: document.querySelector('#dup-mode [data-mode="full"]')?.classList.contains('active'), cropHidden: document.querySelector('#dup-crop-controls')?.hidden, name: document.querySelector('#dup-name')?.value || '', tag: document.querySelector('#dup-prev-tag')?.textContent || '' }))()`);
  ok('padrão é cópia inteira (sem recorte)', dlgDefault.fullActive === true && dlgDefault.cropHidden === true && /cópia/i.test(dlgDefault.name), JSON.stringify(dlgDefault));
  await studio.ev(`document.querySelector('#dup-mode [data-mode="crop"]')?.click()`);
  await esperar(250);
  const dlgCrop = await studio.ev(`(() => ({ hidden: document.querySelector('#dup-crop-controls')?.hidden, tag: document.querySelector('#dup-prev-tag')?.textContent || '' }))()`);
  ok('aba recortar mostra os controles', dlgCrop.hidden === false, JSON.stringify(dlgCrop));
  await studio.ev(`document.querySelector('.modal [data-close]')?.click()`);
  await esperar(300);

  const made = await studio.ev(`(() => {
    const a = window.__castdeck;
    const crops = [{ l: 0, r: 0.5, t: 0, b: 0.5 }, { l: 0.5, r: 0, t: 0, b: 0.5 }, { l: 0, r: 0.5, t: 0.5, b: 0 }, { l: 0.5, r: 0, t: 0.5, b: 0 }];
    return crops.map((c, i) => {
      const s = a.duplicateSource('test:src', { crop: c, name: 'Q' + (i + 1) });
      return { id: s.id, crop: s.adjust.crop, stage: a.S.stage.includes(s.id), comp: !!a.comp.sources.get(s.id) };
    });
  })()`);
  ok('duplicou 4 quadrantes', Array.isArray(made) && made.length === 4, JSON.stringify(made));
  ok('crop dos quadrantes correto', made.every((m, i) => { const c = [[0, .5, 0, .5], [.5, 0, 0, .5], [0, .5, .5, 0], [.5, 0, .5, 0]][i]; return Math.abs(m.crop.l - c[0]) < 1e-6 && Math.abs(m.crop.r - c[1]) < 1e-6 && Math.abs(m.crop.t - c[2]) < 1e-6 && Math.abs(m.crop.b - c[3]) < 1e-6; }), JSON.stringify(made));
  ok('duplicatas no compositor', made.every((m) => m.comp));
  ok('duplicata nasce fora do palco', made.every((m) => m.stage === false), JSON.stringify(made));

  // operação segura: clique simples não mexe no palco; DUPLO CLIQUE na imagem coloca
  const clickTest = await studio.ev(`(() => {
    const a = window.__castdeck;
    const id = 'dup:test:src:1';
    const cv = document.querySelector('.tile[data-src-id="' + id + '"] .tv canvas');
    cv.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const afterClick = a.S.stage.includes(id);
    cv.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    return { afterClick, afterDbl: a.S.stage.includes(id) };
  })()`);
  ok('clique simples NÃO coloca no palco', clickTest.afterClick === false, JSON.stringify(clickTest));
  ok('duplo clique na imagem coloca no palco', clickTest.afterDbl === true, JSON.stringify(clickTest));
  ok('definições salvas para restaurar', (await studio.ev(`window.__castdeck.S.brand.derivedSources.length`)) === 4);

  // cor média do programa com um recorte só (layout solo de 1 item)
  const setScene = async (id) => studio.ev(`(() => { const a = window.__castdeck; a.S.layout = 'solo'; a.comp.layout = 'solo'; a.comp.stage = ['${id}']; a.comp.take = null; a.comp.solo = null; return true; })()`);
  const sample = async (id) => {
    await setScene(id);
    await esperar(800);
    return studio.ev(`(() => { try {
      const a = window.__castdeck;
      const c = a.comp.canvas;
      const t = document.createElement('canvas'); t.width = 32; t.height = 18;
      const x = t.getContext('2d'); x.drawImage(c, 0, 0, 32, 18);
      const d = x.getImageData(0, 0, 32, 18).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
    } catch (e) { return { error: String(e && e.message || e) }; } })()`);
  };
  const q1 = await sample('dup:test:src:1');
  const q4 = await sample('dup:test:src:4');
  ok('Q1 desenha o quadrante vermelho', q1 && q1.r > 120 && q1.r > q1.g + 40 && q1.r > q1.b + 40, JSON.stringify(q1));
  ok('Q4 desenha o quadrante amarelo', q4 && q4.r > 120 && q4.g > 120 && q4.b < 90, JSON.stringify(q4));

  // remover uma duplicata não pode parar a captura original
  const rm = await studio.ev(`(() => {
    const a = window.__castdeck;
    const id = 'dup:test:src:1';
    a.removeSource(id);
    const orig = a.S.sources.get('test:src');
    const tracks = orig?.el?.srcObject?.getVideoTracks?.() || [];
    return { gone: !a.S.sources.has(id), defs: a.S.brand.derivedSources.length, origLive: tracks.some((tr) => tr.readyState === 'live'), stage: a.S.stage.includes(id) };
  })()`);
  ok('removeu a duplicata sem parar a original', rm.gone && rm.origLive && rm.defs === 3 && !rm.stage, JSON.stringify(rm));

  // remover a origem remove as duplicatas restantes
  const cascade = await studio.ev(`(() => {
    const a = window.__castdeck;
    a.removeSource('test:src');
    return { derived: [...a.S.sources.values()].filter((s) => s.derivedFrom).length, defs: (a.S.brand.derivedSources || []).length };
  })()`);
  ok('remover a origem remove as duplicatas', cascade.derived === 0 && cascade.defs === 0, JSON.stringify(cascade));

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
console.log(falhou ? '\nDUPLICATE_SOURCE_FAIL' : '\nDUPLICATE_SOURCE_OK');
process.exit(falhou ? 1 : 0);
