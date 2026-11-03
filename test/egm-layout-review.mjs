// Revisão EGM de layout: captura o estúdio em tamanhos comuns e reporta sobreposições/overflow.
// Uso: BASE=http://localhost:3100 node test/egm-layout-review.mjs
import fs from 'node:fs';
import path from 'node:path';
const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const outDir = path.resolve('scratch', 'egm-shots');
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const v = await (await fetch(`${CDP}/json/version`)).json();
const bws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let bid = 0; const bp = new Map();
bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bp.has(m.id)) { bp.get(m.id)(m); bp.delete(m.id); } };
const bsend = (method, params = {}) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });

const MOCKJS = `(()=>{const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 const cam=()=>{const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');let k=0;setInterval(()=>{x.fillStyle='hsl('+(k*3%360)+',60%,40%)';x.fillRect(0,0,640,360);k++},33);return c.captureStream(30).getVideoTracks()[0]};
 navigator.mediaDevices.getUserMedia=async(c)=>{if(c&&c.video){const o=new MediaStream();o.addTrack(cam());if(c.audio){try{(await gum({audio:c.audio})).getAudioTracks().forEach(a=>o.addTrack(a))}catch{}}return o}return gum(c)};})()`;

async function open(url) {
  const { result } = await bsend('Target.createTarget', { url: 'about:blank' });
  const ws = new WebSocket(`ws://127.0.0.1:9333/devtools/page/${result.targetId}`);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: MOCKJS });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  await send('Page.navigate', { url });
  return { ev, send };
}

const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'EGM Layout' }) })).json();
const page = await open(base + '/studio/' + studio.id);
const waitFor = async (expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await page.ev(expr)) return true; } catch {} await sleep(250); } return false; };
await waitFor(`!!document.querySelector('#lb-go')`);
await sleep(1500);
await page.ev(`document.querySelector('#lb-go').click()`);
await waitFor(`!!document.querySelector('#program-canvas')`);
await sleep(2500);

const DIAG = `(()=>{
 const vis=el=>{const s=getComputedStyle(el);const r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>4&&r.height>4};
 const name=el=>el.id?('#'+el.id):(el.className&&typeof el.className==='string'?('.'+el.className.split(/\\s+/).filter(Boolean).slice(0,2).join('.')):el.tagName.toLowerCase());
 const out={vw:innerWidth,vh:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,overflowX:document.documentElement.scrollWidth>innerWidth+1,overflowY:document.documentElement.scrollHeight>innerHeight+1,panels:[],overlaps:[]};
 const sels=['#topbar','#lobby','#studio','#program-canvas','#dock','#panel-audio','#panel-media','#panel-scenes','#side-left','#side-right','.cc-panel','#cc-panel','#scene-list','#media-grid','#aud-list'];
 for(const s of sels){const el=document.querySelector(s);if(el&&vis(el)){const r=el.getBoundingClientRect();out.panels.push({s,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)})}}
 const cand=[...document.querySelectorAll('body *')].filter(el=>vis(el)&&el.children.length<40&&!el.closest('#program-canvas'));
 const rects=cand.map(el=>({n:name(el),r:el.getBoundingClientRect()})).filter(o=>o.r.width>30&&o.r.height>20);
 for(let i=0;i<rects.length&&i<400;i++){for(let j=i+1;j<rects.length&&j<400;j++){const a=rects[i],b=rects[j];const inside=(x,y)=>x.left<=y.left+1&&x.top<=y.top+1&&x.right>=y.right-1&&x.bottom>=y.bottom-1;if(inside(a.r,b.r)||inside(b.r,a.r))continue;const ix=Math.max(0,Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left));const iy=Math.max(0,Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top));if(ix>8&&iy>8){out.overlaps.push({a:a.n,b:b.n,ix:Math.round(ix),iy:Math.round(iy)});if(out.overlaps.length>=25)return out}}}
 return out;
})()`;

const report = {};
for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 720]]) {
  await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  const d = await page.ev(DIAG);
  report[`${w}x${h}`] = d;
  const r = await page.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, `studio-${w}x${h}.png`), Buffer.from(r.result.data, 'base64'));
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
for (const [k, d] of Object.entries(report)) {
  console.log(`\n== ${k} == overflowX=${d.overflowX} overflowY=${d.overflowY}`);
  console.log('panels:', d.panels.map((p) => `${p.s} ${p.w}x${p.h}@${p.x},${p.y}`).join(' | '));
  console.log('overlaps:', d.overlaps.length ? d.overlaps.map((o) => `${o.a}×${o.b} (${o.ix}x${o.iy})`).join('; ') : 'nenhuma');
}
process.exit(0);
