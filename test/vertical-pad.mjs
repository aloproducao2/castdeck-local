// Teste real no estúdio: o vertical recebe o vídeo do Pad (encaixado, sem esticar) e os overlays da marca
// são centralizados no 9:16. Usa window.__castdeck (comp, vview) e intercepta drawImage do canvas.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4371;
const CDP = 9453;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-vpad-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 400)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const EXE = process.env.CASTDECK_TEST_EXE || '';
const srv = spawn(EXE || process.execPath, EXE ? [] : [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: 'ignore',
  windowsHide: true,
});
const perfil = path.join(os.tmpdir(), 'cd-vpad-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });

try {
  let pronto = false;
  for (let i = 0; i < 160 && !pronto; i++) {
    await esperar(600);
    try {
      pronto = (await fetch(BASE + '/api/studios')).ok;
    } catch {}
  }
  ok('servidor no ar', pronto);
  const est = await (await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Vertical Pad' }) })).json();
  const sid = est.id || est.studio?.id;
  ok('estúdio criado', !!sid, JSON.stringify(est).slice(0, 160));

  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) {
    await esperar(500);
    try {
      alvo = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0;
  const pend = new Map();
  const erros = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') erros.push(String(m.params?.exceptionDetails?.exception?.description || '').slice(0, 160));
  });
  const cmd = (method, params = {}) => new Promise((res) => {
    const id = ++seq;
    pend.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async (e) => {
    const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description || '').slice(0, 300));
    return r.result?.result?.value;
  };
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  // câmera/microfone falsos para o estúdio abrir sem pedir permissão
  await cmd("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const fakeCam = () => {
        const c = document.createElement('canvas'); c.width = 1280; c.height = 720;
        const x = c.getContext('2d');
        let n = 0;
        setInterval(() => { n += 4; x.fillStyle = 'hsl(' + (n % 360) + ' 60% 45%)'; x.fillRect(0, 0, 1280, 720); }, 120);
        return c.captureStream(30);
      };
      const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (cfg) => {
        if (cfg && cfg.video) {
          const cam = fakeCam();
          if (cfg.audio) {
            try { const a = await orig({ audio: true }); a.getAudioTracks().forEach((t) => cam.addTrack(t)); } catch {}
          }
          return cam;
        }
        return orig(cfg);
      };
    })()`
  });
  await cmd("Page.navigate", { url: `${BASE}/studio/${sid}` });
  await esperar(3500);
  const entrou = await ev(`document.querySelector('#lb-go') ? (document.querySelector('#lb-go').click(), true) : false`);
  ok('tela de ajustes aceitou entrar', entrou === true);
  for (let i = 0; i < 40; i++) {
    if (await ev(`!!document.querySelector('#program-canvas')`)) break;
    await esperar(500);
  }
  await esperar(5000);

  await esperar(3000);
  const diag = await ev(`(() => ({ titulo: document.title, href: location.href, temCast: !!window.__castdeck, body: document.body.innerText.slice(0, 300) }))()`);
  console.log('DIAG', JSON.stringify(diag));
  const temCastdeck = await ev(`!!(window.__castdeck && window.__castdeck.comp && window.__castdeck.vview)`);
  ok('estúdio carregou (comp + vview)', temCastdeck);
  if (!temCastdeck) throw new Error('sem __castdeck');

  // 1) VerticalView recebe os overlays do Pad e filtra os marcados para não ir
  const recebe = await ev(`(() => {
    const cd = window.__castdeck;
    cd.comp.getPadOverlays = () => [
      { el: { readyState: 2, videoWidth: 1920, videoHeight: 1080 }, vertical: true, name: 'a' },
      { el: { readyState: 2, videoWidth: 1080, videoHeight: 1920 }, vertical: false, name: 'b' },
    ];
    cd.vview.render();
    const fn = cd.vview.view.getPadOverlays;
    return { tem: typeof fn === 'function', qtd: typeof fn === 'function' ? fn().length : -1 };
  })()`);
  ok('vertical recebe os vídeos do Pad', recebe.tem === true, JSON.stringify(recebe));
  ok('vídeo marcado para não ir fica fora do vertical', recebe.qtd === 1, JSON.stringify(recebe));

  // 2) o vídeo do Pad é desenhado encaixado e centralizado no quadro vertical (720x1280)
  const desenhoPad = await ev(`(() => {
    const cd = window.__castdeck;
    cd.vview.setPreset({ width: 720, height: 1280 });
    cd.comp.getPadOverlays = () => [{ el: { readyState: 2, videoWidth: 1920, videoHeight: 1080 }, vertical: true }];
    const alvo = cd.vview.canvas;
    const ctx = alvo.getContext('2d');
    const chamadas = [];
    const orig = ctx.drawImage;
    ctx.drawImage = function (img, ...a) { chamadas.push({ w: img.videoWidth || img.naturalWidth || img.width, h: img.videoHeight || img.naturalHeight || img.height, a }); return orig.apply(this, [img, ...a]); };
    cd.vview.render();
    ctx.drawImage = orig;
    const doVid = chamadas.filter((c) => c.w === 1920 && c.h === 1080).pop();
    return { total: chamadas.length, rect: doVid ? doVid.a : null };
  })()`);
  const rect = desenhoPad.rect;
  ok('vídeo do Pad desenhado no vertical', desenhoPad.total > 0 && Array.isArray(rect) && rect.length === 4, JSON.stringify(desenhoPad).slice(0, 300));
  ok('sem distorção (16:9 dentro do 9:16)', rect && Math.abs(rect[2] - 720) < 1 && Math.abs(rect[3] - 405) < 1, JSON.stringify(rect));
  ok('centralizado na vertical', rect && Math.abs(rect[0]) < 1 && Math.abs(rect[1] - (1280 - 405) / 2) < 1, JSON.stringify(rect));

  // 3) overlay da marca 16:9 vai centralizado no vertical (não esticado para 720x1280)
  const desenhoOverlay = await ev(`(async () => {
    const cd = window.__castdeck;
    const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
    const g = c.getContext('2d'); g.fillStyle = '#7c5cff'; g.fillRect(0, 0, 1920, 1080);
    const url = c.toDataURL('image/png');
    cd.S.brand.overlays = [url];
    cd.comp.setBrand(cd.S.brand); // o compositor copia a marca (setBrand)
    // a imagem é carregada de forma assíncrona: espera ficar pronta
    for (let i = 0; i < 20; i++) {
      cd.vview.render();
      await new Promise((r) => setTimeout(r, 200));
      if (cd.vview.view.image(url)) break;
    }
    cd.vview.render();
    const alvo = cd.vview.canvas;
    const ctx = alvo.getContext('2d');
    const chamadas = [];
    const orig = ctx.drawImage;
    ctx.drawImage = function (img, ...a) { chamadas.push({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height, a }); return orig.apply(this, [img, ...a]); };
    cd.vview.render();
    ctx.drawImage = orig;
    const doOv = chamadas.filter((x) => x.w === 1920 && x.h === 1080).pop();
    return { total: chamadas.length, rect: doOv ? doOv.a : null };
  })()`);
  const ro = desenhoOverlay.rect;
  ok('overlay da marca desenhado no vertical', Array.isArray(ro) && ro.length === 4, JSON.stringify(desenhoOverlay).slice(0, 300));
  ok('overlay da marca sem distorção', ro && Math.abs(ro[2] - 720) < 1 && Math.abs(ro[3] - 405) < 1, JSON.stringify(ro));
  ok('overlay da marca centralizado', ro && Math.abs(ro[0]) < 1 && Math.abs(ro[1] - (1280 - 405) / 2) < 1, JSON.stringify(ro));

  // 4) Pad: amostra de vídeo começa enviando para o vertical
  const padDefault = await ev(`(() => {
    const m = window.__castdeck.music;
    const amostras = (m && m.getPadSnapshot) ? m.getPadSnapshot() : null;
    return { ok: !!m, temAmostras: !!amostras };
  })()`);
  ok('módulo do Pad disponível', padDefault.ok === true, JSON.stringify(padDefault));

  // 5) opção ligada por padrão no código da UI (rótulo 9:16 e vSend)
  const uiPad = await ev(`(async () => { const t = await (await fetch('/js/studio/music.js')).text(); return { vsend: t.includes('data-pad-vsend'), padraoLigado: t.includes('sample.vSend !== false'), botao: t.includes('9:16') }; })()`);
  ok('botão 9:16 no Pad', uiPad.vsend === true && uiPad.botao === true, JSON.stringify(uiPad));
  ok('vertical ligado por padrão na amostra', uiPad.padraoLigado === true, JSON.stringify(uiPad));

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

console.log(falhas ? `\nVERTICAL_PAD_FAIL (${falhas})` : '\nVERTICAL_PAD_OK');
process.exit(falhas ? 1 : 0);
