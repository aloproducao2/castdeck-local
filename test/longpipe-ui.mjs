// Teste de UI: efeitos avançados (Longpipe) na câmera do host — motor, fundo, suavização de pele,
// backend (WebGPU/WebGL2), troca de stream e volta pro modo rápido. Não publica nada.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4481;
const CDP = 9517;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-lpui-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 340)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// watchdog: o teste nunca pode travar (CDP/GPU/worker)
setTimeout(() => {
  console.log('\nLONGPIPE_UI_FAIL (timeout)');
  process.exit(1);
}, 240000);

const srv = spawn(process.execPath, [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: 'ignore',
  windowsHide: true,
});
const perfil = path.join(os.tmpdir(), 'cd-lpui-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });

try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) {
    await esperar(600);
    try { pronto = (await fetch(BASE + '/')).ok; } catch {}
  }
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Longpipe' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;

  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) {
    await esperar(500);
    try { alvo = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); } catch {}
  }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0;
  const pend = new Map();
  const erros = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') erros.push(String(m.params?.exceptionDetails?.exception?.description || '').slice(0, 200));
  });
  const cmd = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => {
    const r = await Promise.race([
      cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, userGesture: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate timeout: ' + String(e).slice(0, 90))), 12000)),
    ]);
    if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description || '').slice(0, 300));
    return r.result?.result?.value;
  };
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: `${BASE}/studio/${sid}` });
  await esperar(3500);
  await ev(`document.querySelector('#lb-go')?.click()`);
  for (let i = 0; i < 40; i++) { if (await ev(`!!document.querySelector('#program-canvas')`)) break; await esperar(500); }
  await esperar(1200);

  // espera a fonte host:cam existir e injeta um stream sintético de câmera
  // (a câmera fake do headless é instável; o pipeline precisa de um MediaStream com vídeo)
  for (let i = 0; i < 60; i++) {
    await esperar(400);
    if (await ev(`!!window.__castdeck?.S?.sources`)) break;
  }
  let fonte = false;
  for (let i = 0; i < 40 && !fonte; i++) {
    await esperar(500);
    fonte = await ev(`!!window.__castdeck?.S?.sources?.get('host:cam')`);
  }
  const cam = await ev(`(async () => {
    const s = window.__castdeck.S.sources.get('host:cam');
    if (!s) return { erro: 'sem host:cam' };
    const cv = document.createElement('canvas');
    cv.width = 640; cv.height = 360;
    const cx = cv.getContext('2d');
    let t = 0;
    window.__lpCamTimer = setInterval(() => { cx.fillStyle = 'hsl(' + ((t += 9) % 360) + ' 70% 50%)'; cx.fillRect(0, 0, 640, 360); }, 33);
    const stream = cv.captureStream(30);
    s.el.srcObject = stream;
    s.stream = stream;
    await s.el.play().catch(() => {});
    return { tracks: stream.getVideoTracks().length };
  })()`);
  ok('stream de câmera disponível para o teste', cam?.tracks === 1, JSON.stringify(cam));

  // abre o diálogo de efeitos da câmera do host
  await ev(`void window.__castdeck.openFx('host:cam')`);
  let temEngine = false;
  for (let i = 0; i < 30 && !temEngine; i++) { await esperar(300); temEngine = await ev(`!!document.querySelector('#fx-engine button[data-k="longpipe"]')`); }
  ok('diálogo de efeitos abre com o seletor de motor', temEngine === true);

  // liga o modo avançado
  await ev(`document.querySelector('#fx-engine button[data-k="longpipe"]')?.click()`);
  let ativo = false;
  for (let i = 0; i < 100 && !ativo; i++) { await esperar(300); ativo = await ev(`!!window.__castdeck.longpipe.active('host:cam')`); }
  ok('modo avançado liga o pipeline na câmera do host', ativo === true);

  console.log('… aguardando o backend do pipeline');
  let backend = null;
  for (let i = 0; i < 100 && !backend; i++) { await esperar(300); backend = await ev(`window.__castdeck.longpipe.backend('host:cam')`); }
  ok('backend do Longpipe é WebGPU ou WebGL2', backend === 'webgpu' || backend === 'webgl2', String(backend));

  console.log('… verificando o stream processado');

  const trocou = await ev(`(() => { const s = window.__castdeck.S.sources.get('host:cam'); return { processado: s.el.srcObject !== s.stream, tracks: s.el.srcObject?.getVideoTracks?.().length || 0 }; })()`);
  ok('o <video> passa a usar o stream processado', trocou.processado === true && trocou.tracks === 1, JSON.stringify(trocou));

  // fundo por cor
  await ev(`document.querySelector('#fx-bg button[data-k="color"]')?.click()`);
  await esperar(500);
  await ev(`(() => { const i = document.querySelector('#fx-color'); i.value = '#00ff00'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await esperar(900);
  const cfgCor = await ev(`window.__castdeck.longpipe.get('host:cam')`);
  ok('fundo por cor aplicado no modo avançado', cfgCor?.bg === 'color' && cfgCor?.color === '#00ff00', JSON.stringify(cfgCor));

  // suavização de pele
  await ev(`document.querySelector('#fx-touch')?.click()`);
  await esperar(600);
  const cfgPele = await ev(`window.__castdeck.longpipe.get('host:cam')`);
  ok('suavização de pele (touch-up) liga', cfgPele?.touchup === true, JSON.stringify(cfgPele));

  // enquadramento automático (auto-reframe do Longpipe)
  await ev(`document.querySelector('#fx-lp-reframe')?.click()`);
  await esperar(900);
  const cfgFrame = await ev(`window.__castdeck.longpipe.get('host:cam')`);
  ok('enquadramento automático (Longpipe) liga', cfgFrame?.reframe === true, JSON.stringify(cfgFrame));
  const errFrame = await ev(`window.__castdeck.longpipe.error('host:cam')`);
  ok('reframe não gera erro no pipeline', !errFrame, String(errFrame));

  // stats do pipeline
  const stats = await ev(`window.__castdeck.longpipe.stats('host:cam')`);
  ok('pipeline reporta stats (fps/preset)', stats && (stats.preset === 'small' || stats.preset === null), JSON.stringify(stats));

  // volta para o modo rápido
  await ev(`document.querySelector('#fx-engine button[data-k="mediapipe"]')?.click()`);
  await esperar(900);
  const voltou = await ev(`(() => { const s = window.__castdeck.S.sources.get('host:cam'); return { ativo: !!window.__castdeck.longpipe.active('host:cam'), cru: s.el.srcObject === s.stream }; })()`);
  ok('voltar ao modo rápido restaura o stream original', voltou.ativo === false && voltou.cru === true, JSON.stringify(voltou));

  // fecha o diálogo
  await ev(`document.querySelector('[data-close]')?.click()`);
  await esperar(400);
  ok('sem erros de console', erros.length === 0, JSON.stringify(erros.slice(0, 3)));
  ws.close();
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhas ? `\nLONGPIPE_UI_FAIL (${falhas})` : '\nLONGPIPE_UI_OK');
process.exit(falhas ? 1 : 0);
