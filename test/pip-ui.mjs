// Teste de UI: PIP (picture-in-picture) para Libras — aba no grupo Visual, escolher fonte, canto,
// tamanho, proporção, áudio (mudo/volume) e botão do topo. Verifica o estado no compositor.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4465;
const CDP = 9499;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-pip-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 320)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const EXE = process.env.CASTDECK_TEST_EXE || '';
const srv = spawn(EXE || process.execPath, EXE ? [] : [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: 'ignore',
  windowsHide: true,
});
const perfil = path.join(os.tmpdir(), 'cd-pip-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });

try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) {
    await esperar(600);
    try { pronto = (await fetch(BASE + '/')).ok; } catch {}
  }
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'PIP' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;

  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) {
    await esperar(500);
    try { alvo = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
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
    const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
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

  // botão do topo existe
  ok('botão PIP no topo', await ev(`!!document.querySelector('#btn-pip')`));

  // aba no grupo Visual
  await ev(`document.querySelector('.grp[data-group=brand]')?.click()`);
  await esperar(300);
  const aba = await ev(`(() => { const t = document.querySelector('.subtabs .tab[data-tab=pip]'); return { existe: !!t, texto: t?.textContent.trim() || '' }; })()`);
  ok('aba PIP / Libras no grupo Visual', aba.existe === true && /PIP/.test(aba.texto), JSON.stringify(aba));

  await ev(`document.querySelector('.subtabs .tab[data-tab=pip]')?.click()`);
  await esperar(600);

  const ui = await ev(`(() => ({
    on: !!document.querySelector('#pip-on'),
    src: !!document.querySelector('#pip-src'),
    pos: document.querySelectorAll('[data-pip-pos]').length,
    size: !!document.querySelector('#pip-size'),
    aspect: !!document.querySelector('#pip-aspect'),
    border: !!document.querySelector('#pip-border'),
    mute: !!document.querySelector('#pip-mute'),
    vol: !!document.querySelector('#pip-vol'),
    fontes: [...(document.querySelector('#pip-src')?.options || [])].map((o) => o.value),
  }))()`);
  ok('painel do PIP completo (fonte/posição/tamanho/proporção/áudio)', ui.on && ui.src && ui.pos === 4 && ui.size && ui.aspect && ui.border && ui.mute && ui.vol, JSON.stringify(ui));
  ok('lista as fontes de vídeo do estúdio', ui.fontes.includes('host:cam'), JSON.stringify(ui.fontes));

  // escolhe a fonte + ativa
  await ev(`(() => { const s = document.querySelector('#pip-src'); s.value = 'host:cam'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await esperar(400);
  await ev(`document.querySelector('#pip-on').click()`);
  await esperar(500);
  const st1 = await ev(`(() => ({ pip: window.__castdeck.comp.pip, cfg: window.__castdeck.S.brand.pip, btn: document.querySelector('#btn-pip')?.classList.contains('active') }))()`);
  ok('ativar PIP liga no compositor com a fonte escolhida', st1.pip?.id === 'host:cam' && st1.cfg?.enabled === true, JSON.stringify(st1));
  ok('botão do topo marca ativo', st1.btn === true, JSON.stringify(st1));

  // muda canto para topo-esquerdo
  await ev(`document.querySelector('[data-pip-pos="tl"]').click()`);
  await esperar(400);
  ok('muda o canto do PIP', (await ev(`window.__castdeck.comp.pip?.pos`)) === 'tl');
  // tamanho
  await ev(`(() => { const i = document.querySelector('#pip-size'); i.value = '45'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await esperar(300);
  ok('muda o tamanho do PIP', (await ev(`window.__castdeck.comp.pip?.size`)) === 45);
  // proporção
  await ev(`(() => { const s = document.querySelector('#pip-aspect'); s.value = '1:1'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await esperar(300);
  ok('muda a proporção do PIP', (await ev(`window.__castdeck.comp.pip?.aspect`)) === '1:1');

  // áudio: mudo
  await ev(`document.querySelector('#pip-mute').click()`);
  await esperar(400);
  ok('mudo do áudio do PIP grava no config', (await ev(`window.__castdeck.S.brand.pip?.muted`)) === true);
  // áudio: volume
  await ev(`(() => { const i = document.querySelector('#pip-vol'); i.value = '30'; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await esperar(300);
  ok('volume do áudio do PIP grava no config', (await ev(`window.__castdeck.S.brand.pip?.volume`)) === 30);

  // desliga pelo topo
  await ev(`document.querySelector('#btn-pip').click()`);
  await esperar(500);
  ok('desligar pelo topo limpa o PIP do compositor', (await ev(`window.__castdeck.comp.pip`)) === null);
  ok('botão do topo desmarca', (await ev(`document.querySelector('#btn-pip')?.classList.contains('active')`)) === false);

  // ativar SEM escolher fonte: escolhe a primeira fonte de vídeo automaticamente
  await ev(`(() => { window.__castdeck.S.brand.pip = { enabled: false, id: '', pos: 'br', size: 30, aspect: '3:4', border: true, muted: false, volume: 100 }; return true; })()`);
  await ev(`document.querySelector('#pip-on').click()`);
  await esperar(600);
  const auto = await ev(`(() => ({ id: window.__castdeck.comp.pip?.id, enabled: window.__castdeck.S.brand.pip?.enabled }))()`);
  ok('ativar sem fonte escolhe a primeira fonte de vídeo', auto.id === 'host:cam' && auto.enabled === true, JSON.stringify(auto));

  // PIP desenhado mesmo com a fonte FORA do palco (pixels do canto inferior direito)
  // (injeta um stream sintético: a câmera fake do headless é instável e o PIP precisa de vídeo)
  await ev(`(async () => {
    const s = window.__castdeck.S.sources.get('host:cam');
    if (!s) return 'sem host:cam';
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 360;
    const cx = cv.getContext('2d'); let t = 0;
    window.__pipCamTimer = setInterval(() => { cx.fillStyle = 'hsl(' + ((t += 11) % 360) + ' 70% 50%)'; cx.fillRect(0, 0, 640, 360); }, 33);
    const st = cv.captureStream(30);
    s.el.srcObject = st; s.stream = st;
    await s.el.play().catch(() => {});
    return { tracks: st.getVideoTracks().length };
  })()`);
  await esperar(900);
  await ev(`window.__castdeck.setStage([])`);
  await esperar(700);
  const sig = `(() => { const c = document.querySelector('#program-canvas'); const ctx = c.getContext('2d'); const x = Math.round(c.width*0.78), y = Math.round(c.height*0.5); const d = ctx.getImageData(x, y, 120, 120).data; let s = 0, n = 0; for (let i = 0; i < d.length; i += 4) { s += d[i] + d[i+1] + d[i+2]; n++; } return Math.round(s/n); })()`;
  await ev(`window.__castdeck.comp.setPip(null)`);
  await esperar(500);
  const semPip = await ev(sig);
  await ev(`window.__castdeck.comp.setPip({ id: 'host:cam', pos: 'br', size: 50, aspect: '3:4', border: true })`);
  await esperar(800);
  const comPip = await ev(sig);
  ok('PIP aparece mesmo com a fonte fora do palco (desenhado no canvas)', Math.abs(comPip - semPip) > 30, JSON.stringify({ semPip, comPip }));

  // enquadramento da fonte (ajuste manual: zoom/pan/corte) também vale no PIP
  await ev(`(() => { const s = window.__castdeck.comp.sources.get('host:cam'); s.adjust = { fit: 'cover', zoom: 1.8, x: 0.5, y: 0.45 }; return true; })()`);
  await esperar(700);
  const comAdjust = await ev(sig);
  ok('enquadramento (ajuste/zoom) é aplicado no PIP sem quebrar', Number.isFinite(comAdjust) && Math.abs(comAdjust - semPip) > 20, JSON.stringify({ semPip, comAdjust }));
  await ev(`(() => { const s = window.__castdeck.comp.sources.get('host:cam'); delete s.adjust; return true; })()`);
  await esperar(300);

  // botão direito na miniatura → "Tirar do PIP (Libras)" (PIP está ativo) → desliga
  await ev(`(() => { const t = document.querySelector('.tile[data-src-id="host:cam"]'); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); return true; })()`);
  await esperar(600);
  const menu1 = await ev(`[...document.querySelectorAll('.tile-action')].map((b) => b.textContent.trim())`);
  ok('menu da miniatura tem ação de PIP', menu1.some((t) => /PIP \(Libras\)/.test(t)), JSON.stringify(menu1));
  await ev(`(() => { const b = [...document.querySelectorAll('.tile-action')].find((x) => /Tirar do PIP/i.test(x.textContent)); b?.click(); return true; })()`);
  await esperar(600);
  ok('ação da miniatura tira do PIP', (await ev(`window.__castdeck.comp.pip`)) === null);

  // botão direito de novo → "Usar como PIP (Libras)" → liga
  await ev(`(() => { const t = document.querySelector('.tile[data-src-id="host:cam"]'); t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); return true; })()`);
  await esperar(600);
  await ev(`(() => { const b = [...document.querySelectorAll('.tile-action')].find((x) => /Usar como PIP/i.test(x.textContent)); b?.click(); return true; })()`);
  await esperar(700);
  const usado = await ev(`(() => ({ id: window.__castdeck.comp.pip?.id, enabled: window.__castdeck.S.brand.pip?.enabled }))()`);
  ok('ação da miniatura "Usar como PIP (Libras)" liga o PIP', usado.id === 'host:cam' && usado.enabled === true, JSON.stringify(usado));

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
console.log(falhas ? `\nPIP_UI_FAIL (${falhas})` : '\nPIP_UI_OK');
process.exit(falhas ? 1 : 0);
