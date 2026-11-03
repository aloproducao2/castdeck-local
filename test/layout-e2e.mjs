// Editor de layout: duplicar, ajuste fino, igualar, distribuir. BASE=http://localhost:3100 node test/layout-e2e.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const v = await (await fetch(`${CDP}/json/version`)).json();
const bws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let bid = 0; const bp = new Map();
bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bp.has(m.id)) { bp.get(m.id)(m); bp.delete(m.id); } };
const bsend = (method, params = {}) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const MOCKJS = `(()=>{const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 const cam=()=>{const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');let k=0;setInterval(()=>{x.fillStyle='hsl('+(k*3%360)+',60%,40%)';x.fillRect(0,0,640,360);k++},33);return c.captureStream(30).getVideoTracks()[0]};
 navigator.mediaDevices.getUserMedia=async(c)=>{if(c&&c.video){const o=new MediaStream();o.addTrack(cam());if(c.audio){try{(await gum({audio:c.audio})).getAudioTracks().forEach(a=>o.addTrack(a))}catch{}}return o}return gum(c)};
 const en=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);navigator.mediaDevices.enumerateDevices=async()=>{const d=await en();return d.some(x=>x.kind==='videoinput')?d:[...d,{kind:'videoinput',deviceId:'fakecam',label:'Fake Camera',groupId:'g'}]};})()`;
async function open(url) {
  const { result } = await bsend('Target.createTarget', { url: 'about:blank' });
  const ws = new WebSocket(`ws://127.0.0.1:9333/devtools/page/${result.targetId}`);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: MOCKJS });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  await send('Page.navigate', { url });
  return { ev, errors, send };
}
const waitFor = async (p, expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.ev(expr)) return true; } catch {} await sleep(250); } return false; };
let fails = 0;
const check = (n, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FALHA'), n, ok ? '' : extra); if (!ok) fails++; };
const put = (body) => fetch(base + '/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const noise = (e) => !/Receiving end does not exist/.test(e);


// Editor de layout: duplicar, ajuste fino, igualar, distribuir, teclado, desfazer.
const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Layout E2E' }) })).json();
const host = await open(`${base}/studio/${studio.id}`);
await host.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(1500);
await host.ev(`document.querySelector('#lb-go').click()`);
check('estudio abriu', await waitFor(host, `!!window.__castdeck?.extras`));
await sleep(800);
await host.ev(`document.querySelector('[data-act=new]').click()`);
check('editor abre com ferramentas', await waitFor(host, `!!document.querySelector('#le-dup') && !!document.querySelector('#le-fine') && document.querySelectorAll('.le-slot').length===2`));
const box = (i) => host.ev(`(()=>{const e=document.querySelectorAll('.le-slot')[${i}];return {x:parseFloat(e.style.left),y:parseFloat(e.style.top),w:parseFloat(e.style.width),h:parseFloat(e.style.height)}})()`);
// ajuste fino: largura 30%, altura 40%
await host.ev(`(()=>{for(const [k,v] of [['w',30],['h',40]]){const i=document.querySelector('#le-'+k);i.focus();i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}))}})()`);
let b0 = await box(0);
check('ajuste fino aplica largura/altura', Math.abs(b0.w - 30) < 0.01 && Math.abs(b0.h - 40) < 0.01, JSON.stringify(b0));
await host.ev(`(()=>{const i=document.querySelector('#le-x');i.focus();i.value=2.5;i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
b0 = await box(0);
check('ajuste fino 0,5%', Math.abs(b0.x - 2.5) < 0.01, JSON.stringify(b0));
// duplicar
await host.ev(`document.querySelector('#le-canvas').focus(); document.querySelector('#le-dup').click()`);
check('duplicar cria 3o espaco', await host.ev(`document.querySelectorAll('.le-slot').length===3`));
const b2 = await box(2);
check('copia tem o mesmo tamanho', Math.abs(b2.w - 30) < 0.01 && Math.abs(b2.h - 40) < 0.01, JSON.stringify(b2));
check('copia nao sobrepoe a original', b2.x >= b0.x + b0.w - 0.01 || b2.y >= b0.y + b0.h - 0.01, JSON.stringify([b0, b2]));
check('copia fica selecionada', await host.ev(`document.querySelectorAll('.le-slot')[2].classList.contains('sel') && document.querySelector('#le-fine-ttl').textContent.includes('3')`));
// Ctrl+D
await host.ev(`document.querySelector('#le-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'d',ctrlKey:true,bubbles:true}))`);
check('Ctrl+D duplica', await host.ev(`document.querySelectorAll('.le-slot').length===4`));
// teclado: seta move 0,5%
const before = await box(3);
await host.ev(`document.querySelector('#le-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`);
const after = await box(3);
check('seta move 0,5%', Math.abs(before.x - 0.5 - after.x) < 0.01 || before.x === 0, JSON.stringify([before, after]));
await host.ev(`document.querySelector('#le-canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,shiftKey:true,bubbles:true}))`);
const big = await box(3);
check('Alt+Shift+seta aumenta 5%', Math.abs(big.w - after.w - 5) < 0.01 || big.x + big.w >= 99.9, JSON.stringify([after, big]));
// desfazer
await host.ev(`document.querySelector('#le-undo').click()`);
const und = await box(3);
check('desfazer', Math.abs(und.w - after.w) < 0.01, JSON.stringify([after, und]));
// igualar tamanho: seleciona o espaco 1 e iguala
await host.ev(`(()=>{const e=document.querySelectorAll('.le-slot')[1];e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,clientX:0,clientY:0}));e.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}))})()`);
await host.ev(`document.querySelector('#le-same').click()`);
const all = await host.ev(`[...document.querySelectorAll('.le-slot')].map(e=>[parseFloat(e.style.width),parseFloat(e.style.height)])`);
check('igualar tamanho', all.every(([w, h]) => w === all[1][0] && h === all[1][1]), JSON.stringify(all));
// 16:9
await host.ev(`document.querySelector('#le-169').click()`);
const s169 = await box(1);
check('16:9 (w==h em fracao)', Math.abs(s169.w - s169.h) < 0.01, JSON.stringify(s169));
// distribuir
await host.ev(`document.querySelector('#le-same').click(); document.querySelector('#le-dh').click()`);
const xs = (await host.ev(`[...document.querySelectorAll('.le-slot')].map(e=>[parseFloat(e.style.left),parseFloat(e.style.width)])`)).sort((a, b) => a[0] - b[0]);
const gaps = xs.map((v, i) => (i ? v[0] - (xs[i - 1][0] + xs[i - 1][1]) : v[0]));
check('distribuir: espacamento igual', Math.max(...gaps) - Math.min(...gaps) < 0.3 && xs.every(([x, w]) => x >= 0 && x + w <= 100.01), JSON.stringify(xs));
// reordenar
await host.ev(`document.querySelector('#le-up').click()`);
check('reordenar numero', await host.ev(`document.querySelector('#le-fine-ttl').textContent.includes('3')`));
const fits = await host.ev(`(()=>{const m=document.querySelector('.modal');return m.scrollWidth<=m.clientWidth+1 && [...m.querySelectorAll('.le-tools button')].every(b=>{const r=b.getBoundingClientRect();const mr=m.getBoundingClientRect();return r.right<=mr.right+1&&r.left>=mr.left-1})})()`);
check('ferramentas cabem no editor', fits);
if (process.env.SHOT) { const r = await host.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(process.env.SHOT, Buffer.from(r.result.data, 'base64')); }
await host.ev(`document.querySelector('#le-name').value='Grade copiada'; document.querySelector('#le-save').click()`);
check('salvou com 4 espacos', await waitFor(host, `(__castdeck.S.brand.customLayouts||[]).some(l=>l.label==='Grade copiada' && l.slots.length===4)`));
const errs = host.errors.filter((e) => !/Receiving end does not exist/.test(e));
check('sem erros JS', errs.length === 0, JSON.stringify(errs));
await fetch(base + '/api/studios/' + studio.id, { method: 'DELETE' });
console.log(fails ? `${fails} falha(s)` : 'TUDO OK');
process.exit(fails ? 1 : 0);
