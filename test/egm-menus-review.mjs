// Revisão EGM dos menus/submenus: abre o painel lateral, percorre grupos/abas, captura telas e
// mede contraste de texto (WCAG) no topo, painel e dock.
// Uso: BASE=http://localhost:3101 node test/egm-menus-review.mjs
import fs from 'node:fs';
import path from 'node:path';
const CDP = process.env.CDP || 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3101';
const outDir = path.resolve('scratch', 'egm-menus');
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const v = await (await fetch(`${CDP}/json/version`)).json();
const bws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let bid = 0; const bp = new Map();
bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bp.has(m.id)) { bp.get(m.id)(m); bp.delete(m.id); } };
const bsend = (method, params = {}) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });

const MOCK = `(()=>{
 const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 const ac=()=>{const c=new AudioContext();const o=c.createOscillator();const g=c.createGain();g.gain.value=0.02;const d=c.createMediaStreamDestination();o.connect(g).connect(d);o.start();return d.stream.getAudioTracks()[0]};
 const cam=()=>{const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');let k=0;setInterval(()=>{x.fillStyle='hsl('+(k*3%360)+',55%,38%)';x.fillRect(0,0,640,360);x.fillStyle='#fff';x.font='28px sans-serif';x.fillText('CAM '+k,20,50);k++},33);return c.captureStream(30).getVideoTracks()[0]};
 navigator.mediaDevices.getUserMedia=async(c)=>{const o=new MediaStream();if(c&&c.video)o.addTrack(cam());if(c&&c.audio){try{o.addTrack(ac())}catch{}}return o};
 const en=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
 navigator.mediaDevices.enumerateDevices=async()=>{const d=await en();const out=[...d];if(!out.some(x=>x.kind==='videoinput'))out.push({kind:'videoinput',deviceId:'fakecam',label:'Fake Camera',groupId:'g'});if(!out.some(x=>x.kind==='audioinput'))out.push({kind:'audioinput',deviceId:'fakemic',label:'Fake Mic',groupId:'g'});return out};
})()`;

async function open(url) {
  const { result } = await bsend('Target.createTarget', { url: 'about:blank' });
  const ws = new WebSocket(`ws://127.0.0.1:9333/devtools/page/${result.targetId}`);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval'); return r.result.result.value; };
  await send('Page.navigate', { url });
  return { ev, send };
}

const CONTRAST = `(()=>{
 const parse=c=>{const m=String(c).match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(',').map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}};
 const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)};
 const ratio=(a,b)=>{const l1=lum(a),l2=lum(b);const hi=Math.max(l1,l2),lo=Math.min(l1,l2);return (hi+0.05)/(lo+0.05)};
 const bgOf=el=>{let n=el;while(n&&n!==document.documentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c&&c.a>0.85)return c;n=n.parentElement}const b=parse(getComputedStyle(document.body).backgroundColor);return b&&b.a>0.5?b:{r:0,g:0,b:0,a:1}};
 const isVisible=el=>{const s=getComputedStyle(el);const r=el.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0.1&&r.width>2&&r.height>2};
 const out=[];
 const scope=[...document.querySelectorAll('.topbar *, .side *, .dock *, .ctrl *')].filter(isVisible);
 for(const el of scope){
  const txt=(el.childNodes&&[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.trim()).join(' ').trim())||'';
  if(!txt)continue;
  const s=getComputedStyle(el);const fs=parseFloat(s.fontSize);const bold=Number(s.fontWeight)>=600;
  const fg=parse(s.color);if(!fg)continue;const bg=bgOf(el);
  const ar=ratio({...fg,a:1},bg);
  const large=fs>=24||(fs>=18.66&&bold);
  const min=large?3:4.5;
  if(ar<min) out.push({txt:txt.slice(0,40),cls:String(el.className).slice(0,40),fs:Math.round(fs*10)/10,ar:Math.round(ar*100)/100,min,fg:s.color,bg:[bg.r,bg.g,bg.b].join(',')});
  if(out.length>=40)break;
 }
 return out;
})()`;

const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'EGM Menus' }) })).json();
const page = await open(base + '/studio/' + studio.id);
const waitFor = async (expr, ms = 25000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await page.ev(expr)) return true; } catch {} await sleep(250); } return false; };
await page.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
const realClick = async (sel) => {
  const r = await page.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}})()`);
  if (!r) return false;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  return true;
};
await waitFor(`!!document.querySelector('#lb-go')`);
await sleep(1200);
await realClick('#lb-go');
await waitFor(`!!document.querySelector('#program-canvas')`);
await sleep(3000);

const shot = async (n) => { const r = await page.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outDir, n + '.png'), Buffer.from(r.result.data, 'base64')); };

console.log('DEBUG', JSON.stringify(await page.ev(`(()=>{const b=document.querySelector('#btn-panel');return {studio:document.querySelector('.studio')?.className,onclick:typeof b?.onclick,groups:document.querySelectorAll('.grp[data-group]').length,panel:!!b}})()`)));
const report = { topbar: null, groups: [] };
// topo/dock
report.topbar = await page.ev(CONTRAST);
await shot('topbar');

// abre painel e fixa
await realClick('#btn-panel'); await sleep(800);
await page.ev(`document.querySelector('#side-pin')?.click()`); await sleep(400);

const groups = await page.ev(`[...document.querySelectorAll('.grp[data-group]')].map(g=>[g.dataset.group,g.textContent.trim()])`);
for (const [gid, label] of groups) {
  await page.ev(`document.querySelector('.grp[data-group="${gid}"]')?.click()`); await sleep(700);
  const tabs = await page.ev(`[...document.querySelectorAll('.tab')].filter(t=>t.offsetParent && t.dataset.tab).map(t=>[t.dataset.tab,t.textContent.trim()])`);
  const g = { id: gid, label, tabs: [] };
  for (const [tid, tlabel] of tabs) {
    await page.ev(`(()=>{const t=[...document.querySelectorAll('.tab')].find(x=>x.dataset.tab===${JSON.stringify(tid)}&&x.offsetParent);if(t)t.click()})()`);
    await sleep(700);
    await shot(`tab-${tid}`);
    const c = await page.ev(CONTRAST);
    g.tabs.push({ id: tid, label: tlabel, contrast: c });
  }
  report.groups.push(g);
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
const low = [
  ...(report.topbar || []).map((x) => ({ onde: 'topo/dock', ...x })),
  ...report.groups.flatMap((g) => g.tabs.flatMap((t) => (t.contrast || []).map((x) => ({ onde: `${g.label}/${t.label}`, ...x })))),
];
console.log('Telas capturadas:', fs.readdirSync(outDir).filter((f) => f.endsWith('.png')).length);
console.log('Contrastes abaixo do mínimo:', low.length);
for (const x of low.slice(0, 40)) console.log(`${x.onde} | "${x.txt}" | ${x.fs}px ratio=${x.ar} (min ${x.min}) fg=${x.fg} bg=rgb(${x.bg})`);
process.exit(0);
