// Teste visual da legenda no estúdio (Edge real via CDP):
//   servidor: $env:PORT=3100; $env:HTTPS_PORT=3543; node server/index.js
//   Edge:     msedge --remote-debugging-port=9333 --use-fake-device-for-media-stream ...
//   depois:   node test/caption-ui-e2e.mjs
// Abre o estúdio, liga a legenda na aba Legendas, toca uma fala (WAV) no barramento da legenda e confere
// o texto na camada do PGM, o botão CC no painel de Áudio e a página do link (/cc). Salva capturas em build/tmp.
import fs from 'node:fs';
import path from 'node:path';

const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const BASE = process.env.BASE || 'http://127.0.0.1:3100';
const WAV = process.env.WAV || path.resolve('build', 'tmp', 'caption-test', 'fala.wav');
const OUT = path.resolve('build', 'tmp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (n, ok, x = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${n} ${x}`);
  if (!ok) fails++;
};
if (!fs.existsSync(WAV)) {
  console.log('PULADO: falta o WAV de teste');
  process.exit(0);
}

async function page(url, w = 1440, h = 900) {
  const t = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    }
    // extensões do perfil do Edge (ex.: carteiras) lançam erros próprios: não são do CastDeck
    if (m.method === 'Runtime.exceptionThrown' && !/Receiving end does not exist|chrome-extension:/.test(JSON.stringify(m.params))) errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  };
  const send = (method, params = {}) => new Promise((r) => {
    const i = ++id;
    pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval');
    return r.result?.result?.value;
  };
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  return { ev, shot, errors, close: () => fetch(`${CDP}/json/close/${t.id}`) };
}
const waitFor = async (p, expr, ms = 15000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try {
      if (await p.ev(expr)) return true;
    } catch {}
    await sleep(250);
  }
  return false;
};

const studios = await (await fetch(`${BASE}/api/studios`)).json();
const sid = studios[0].id;
const host = await page(`${BASE}/studio/${sid}?lang=pt`);
await waitFor(host, `!!document.querySelector('#lb-go')`, 20000);
await sleep(2500); // o lobby liga câmera/microfone antes de liberar a entrada
await host.ev(`document.querySelector('#lb-go').click()`);
check('estúdio abriu', await waitFor(host, `!!window.__castdeck?.S && !!document.querySelector('[data-group="captions"]')`, 20000));
check('aba Legendas existe no painel lateral', await host.ev(`!!document.querySelector('.grp[data-group="captions"]')`));
await host.ev(`document.querySelector('.grp[data-group="captions"]').click()`);
check('painel Legendas renderizou', await waitFor(host, `!!document.querySelector('#cc-engine')`));
await host.ev(`(() => { const e = document.querySelector('#cc-model'); if (e) { e.value = 'equilibrado'; e.dispatchEvent(new Event('change')); } })()`);
await sleep(300);
await host.ev(`(() => { const e = document.querySelector('#cc-engine'); e.checked = true; e.dispatchEvent(new Event('change')); })()`);
check('reconhecedor rodando', await waitFor(host, `document.querySelector('#cc-status')?.classList.contains('ok')`, 60000), await host.ev(`document.querySelector('#cc-status')?.textContent`));
await host.shot('cc-panel');

// CC no painel de Áudio: microfone do host ligado por padrão
await host.ev(`document.querySelector('.grp[data-group="audio"]').click()`);
await sleep(600);
const cc = await host.ev(`(() => { const b = document.querySelector('[data-ch="host:mic"] [data-cc]'); return b ? { on: b.classList.contains('on'), idle: b.classList.contains('idle') } : null; })()`);
check('botão CC no canal do microfone (ligado por padrão)', cc?.on === true && cc?.idle === false, JSON.stringify(cc));
await host.shot('cc-audio');

// fala no barramento da legenda (como se fosse um microfone no ar com CC ligado)
const b64 = fs.readFileSync(WAV).toString('base64');
await host.ev(`(async () => {
  const m = window.__castdeck.mixer || window.__castdeck.getMixer?.();
  const ctx = m.ctx;
  const bin = Uint8Array.from(atob('${b64}'), (c) => c.charCodeAt(0));
  const buf = await ctx.decodeAudioData(bin.buffer);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(m.captionBus);
  src.start(ctx.currentTime + 0.5);
  return true;
})()`);
check('texto chegou na camada do PGM', await waitFor(host, `/programa/i.test(window.__castdeck.comp?.cc?.text || '')`, 25000), await host.ev(`window.__castdeck.comp?.cc?.text || ''`));
await host.ev(`document.querySelector('.grp[data-group="captions"]').click()`);
await sleep(400);
await host.shot('cc-pgm');

// sanfona, posição (grade 3×3 no 16:9 e no 9:16) e cores
check('painel em sanfona (seções recolhíveis)', await host.ev(`document.querySelectorAll('#panel-captions details.cc-acc').length >= 4`));
await host.ev(`document.querySelectorAll('#panel-captions details.cc-acc').forEach((d) => (d.open = ['look', 'pos'].includes(d.dataset.sec)))`);
await host.ev(`document.querySelector('[data-pos="posH"] button[data-y="t"][data-x="r"]').click()`);
await host.ev(`document.querySelector('[data-pos="posV"] button[data-y="m"][data-x="c"]').click()`);
await host.ev(`document.querySelector('[data-swatch="color"] .cc-sw[data-v="#ffe14d"]').click()`);
const st = await host.ev(`JSON.stringify(window.__castdeck.comp.cc.style)`);
check('posição 16:9 e 9:16 e cor aplicadas na camada', /"posH":\{"y":"t","x":"r"\}/.test(st) && /"posV":\{"y":"m","x":"c"\}/.test(st) && /ffe14d/.test(st), st);
await host.ev(`window.__castdeck.comp.cc.t = performance.now()`);
await sleep(400);
await host.shot('cc-pos');

// maiúsculas + rolagem: as frases viram itens separados (as linhas antigas não mudam quando chega uma nova)
await host.ev(`(() => { const e = document.querySelector('#cc-upper'); e.checked = true; e.dispatchEvent(new Event('change')); })()`);
await waitFor(host, `(window.__castdeck.comp.cc.items || []).length >= 2`, 20000);
const roll = await host.ev(`(() => { const cc = window.__castdeck.comp.cc; return { upper: cc.style.upper, items: (cc.items || []).length }; })()`);
check('maiúsculas ligadas e frases em itens (rolagem)', roll.upper === true && roll.items >= 2, JSON.stringify(roll));
await host.ev(`window.__castdeck.comp.cc.t = performance.now()`);
await sleep(300);
await host.shot('cc-upper');

// link (/cc) em outra aba
const link = await (await fetch(`${BASE}/api/caption/link/${sid}`)).json();
const viewer = await page(`${BASE}${link.path}`, 390, 844);
check('página do link mostra o histórico', await waitFor(viewer, `document.querySelectorAll('#feed .line').length > 0`, 8000));
await viewer.shot('cc-link');
const ov = await page(`${BASE}${link.path}&view=overlay&bg=transparent`, 1280, 720);
await sleep(1500);
await ov.shot('cc-overlay');

// desliga
await host.ev(`(() => { const e = document.querySelector('#cc-engine'); e.checked = false; e.dispatchEvent(new Event('change')); })()`);
await sleep(1500);
check('sem erros JS no estúdio', host.errors.length === 0, host.errors.slice(0, 3).join(' | '));
check('sem erros JS no link', viewer.errors.length === 0, viewer.errors.slice(0, 3).join(' | '));
await host.close();
await viewer.close();
await ov.close();
console.log(fails ? `\n${fails} falha(s)` : '\nTudo OK');
process.exit(fails ? 1 : 0);
