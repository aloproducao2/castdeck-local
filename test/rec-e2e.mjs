// Gravar: pergunta horizontal/vertical + pasta das gravações. BASE=http://localhost:3100 node test/rec-e2e.mjs
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

// --- pasta das gravações (servidor)
const dir = path.join(os.tmpdir(), 'castdeck-rectest');
fs.rmSync(dir, { recursive: true, force: true });
check('caminho relativo recusado', (await put({ recordingsDir: 'relativo/pasta' })).status === 400);
const r1 = await put({ recordingsDir: dir });
check('pasta customizada aceita', r1.ok && fs.existsSync(dir), String(r1.status));
const sys1 = await (await fetch(base + '/api/system')).json();
check('/api/system mostra a pasta', sys1.recordingsDir === dir, sys1.recordingsDir);

// --- painel mostra a opção
const dash = await open(base + '/');
check('painel: botao Escolher pasta', await waitFor(dash, `!!document.querySelector('#pick-rec') && document.querySelector('#rec-dir').textContent.includes('castdeck-rectest')`));
check('painel: botao Padrao', await dash.ev(`!!document.querySelector('#reset-rec')`));

// --- estúdio: gravar H + V
const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Rec E2E' }) })).json();
const host = await open(`${base}/studio/${studio.id}`);
await host.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(1500);
await host.ev(`document.querySelector('#lb-go').click()`);
check('estudio abriu', await waitFor(host, `!!window.__castdeck?.extras`));
await sleep(800);
await host.ev(`(()=>{if(window.__autoOk)return true;window.__autoOk=new MutationObserver(()=>document.querySelector(".modal-back [data-ok]")?.click());window.__autoOk.observe(document,{childList:true,subtree:true});return true})()`);
await host.ev(`document.querySelector('#btn-record').click()`);
check('modal pergunta H ou H+V', await waitFor(host, `document.querySelectorAll('input[name=glv]').length===2`));
check('modal mostra a pasta', await host.ev(`document.querySelector('#gl-dir-path').textContent.includes('castdeck-rectest') && !!document.querySelector('#gl-dir')`));
const fit = await host.ev(`(()=>{const m=document.querySelector('.modal');const r=m.getBoundingClientRect();return r.bottom<=innerHeight+1 && m.scrollWidth<=m.clientWidth+1})()`);
check('modal cabe sem corte horizontal', fit);
await host.ev(`(()=>{const i=document.querySelector('input[name=glv][value=hv]');i.checked=true;})()`);
await host.ev(`document.querySelector('#gl-go').click()`);
check('horizontal gravando', await waitFor(host, `!!__castdeck.S.live`, 20000));
check('vertical gravando junto (linked)', await waitFor(host, `!!__castdeck.S.vlive && __castdeck.S.vlive.linked===true`, 20000));
check('escolha lembrada', await host.ev(`__castdeck.S.brand.recVert===true`));
await sleep(4500);
const sys2 = await (await fetch(base + '/api/system')).json();
const mine = sys2.broadcasts.filter((b) => b.studioId === studio.id);
check('servidor com 2 saidas', mine.length === 2, JSON.stringify(mine.map((b) => b.vertical)));
// gravar e transmitir são independentes: a gravação para pelo próprio botão REC
await host.ev(`document.querySelector('#btn-record').click()`);
check('parar para os dois', await waitFor(host, `!__castdeck.S.live && !__castdeck.S.vlive`, 15000));
await sleep(2000);
const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
check('arquivo vertical na pasta escolhida', files.some((f) => /Rec-E2E.*_vertical\.mp4$/i.test(f)), JSON.stringify(files));
check('arquivo horizontal na pasta escolhida', files.some((f) => /Rec-E2E/i.test(f) && !/_vertical/.test(f)), JSON.stringify(files));
const recs = await (await fetch(base + '/api/recordings')).json();
check('/api/recordings lista a pasta nova', recs.length >= 2);
// ao parar, o servidor reorganiza o MP4 fragmentado (duração e barra de tempo funcionam em qualquer player)
const frag = (f) => { const b = fs.readFileSync(path.join(dir, f)).subarray(0, 256 * 1024); return b.includes('moof') || b.includes('mvex'); };
let finalOk = false;
for (let k = 0; k < 40 && !finalOk; k++) {
  const fl = fs.readdirSync(dir);
  finalOk = fl.filter((f) => /Rec-E2E.*\.mp4$/i.test(f)).length >= 2 && !fl.some((f) => /finalizando/.test(f)) && fl.filter((f) => /\.mp4$/i.test(f)).every((f) => !frag(f));
  if (!finalOk) await sleep(500);
}
check('gravacoes finalizadas (MP4 normal, sem temporario)', finalOk, JSON.stringify(fs.readdirSync(dir)));
// ajustes do estúdio
await host.ev(`document.querySelector('#c-settings')?.click()`);
const hasSt = await waitFor(host, `!!document.querySelector('#st-dir')`, 6000);
check('ajustes: Pasta das gravacoes', hasSt);
const errs = [...host.errors, ...dash.errors].filter(noise);
check('sem erros JS', errs.length === 0, JSON.stringify(errs));

// limpeza
const r3 = await put({ recordingsDir: '' });
const sys3 = await (await fetch(base + '/api/system')).json();
check('voltou para a padrao', r3.ok && sys3.recordingsDir === sys3.recordingsDefault, sys3.recordingsDir);
await fetch(base + '/api/studios/' + studio.id, { method: 'DELETE' });
fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? `${fails} falha(s)` : 'TUDO OK');
process.exit(fails ? 1 : 0);
