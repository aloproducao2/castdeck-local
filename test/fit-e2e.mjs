import fs from 'node:fs';
// Barra de controle (GC + mídia) e divisórias redimensionáveis. BASE=http://localhost:3100 node test/deck-e2e.mjs
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

const shot = async (name, w, hh) => {
  await host.send('Emulation.setDeviceMetricsOverride', { width: w, height: hh, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  const r = await host.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync((process.env.TEMP || '.') + '/' + name + '.png', Buffer.from(r.result.data, 'base64'));
};
const fits = (tag) => host.ev(`(()=>{const w=document.querySelector('.stage-wrap'),wr=w.getBoundingClientRect();const out=[];for(const s of ['#program','#gcbar','#stagebar','#layouts','#backstage .tile','#vdock:not([hidden]) #v-go']){const e=document.querySelector(s);if(!e)continue;const r=e.getBoundingClientRect();if(r.top<wr.top-1||r.bottom>wr.bottom+1||r.height<10)out.push(s+' '+Math.round(r.top)+'..'+Math.round(r.bottom)+' wrap '+Math.round(wr.top)+'..'+Math.round(wr.bottom))}return {scroll:w.scrollTop,out}})()`).then((x) => check('cabe ' + tag, x.scroll === 0 && x.out.length === 0, JSON.stringify(x)));
const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Fit' }) })).json();
const host = await open(`${base}/studio/${studio.id}`);
await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(2000);
await host.ev(`localStorage.removeItem('castdeck.switcher');localStorage.removeItem('castdeck.sideMini');localStorage.setItem('castdeck.layout', JSON.stringify({stage: 900}));document.querySelector('#lb-go').click()`);
await waitFor(host, `!!document.querySelector('#program-canvas')`); await sleep(800);
await host.ev(`document.querySelector('.stage-wrap').scrollTop=9999`);
for (const [w, hh] of [[1024, 549], [1366, 768], [1920, 1080], [1280, 620]]) { await shot('fit-' + w + 'x' + hh, w, hh); await fits(w + 'x' + hh); }
await host.ev(`document.querySelector('#btn-vertical').click()`); await sleep(600);
for (const [w, hh] of [[1024, 549], [1366, 768]]) { await shot('fitv-' + w + 'x' + hh, w, hh); await fits('vertical ' + w + 'x' + hh); }
console.log(fails ? fails + ' falha(s)' : 'TUDO OK');
process.exit(fails ? 1 : 0);
