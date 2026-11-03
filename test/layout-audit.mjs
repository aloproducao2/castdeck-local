// Valida co-host ponta a ponta: host + convidado reais no Edge (CDP :9333). BASE=http://localhost:3100 node test/cohost-e2e.mjs
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
const AUDIT = `(()=>{
const out=[];const vw=innerWidth,vh=innerHeight;
const sel=(e)=>{let s=e.tagName.toLowerCase();if(e.id)s+='#'+e.id;else if(e.className&&typeof e.className==='string')s+='.'+e.className.trim().split(/\\s+/).slice(0,2).join('.');return s+(' "'+(e.innerText||e.value||e.title||'').trim().replace(/\\s+/g,' ').slice(0,28)+'"')};
const lum=(c)=>{const f=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])};
const pc=(s)=>{const m=s.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const p=m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number);return [p[0],p[1],p[2],p.length>3?p[3]:1]};
const bgOf=(e)=>{let acc=[0,0,0,0];const chain=[];for(let n=e;n;n=n.parentElement){chain.push(n)}
 let r=15,g=15,b=20;for(const n of chain.reverse()){const cs=getComputedStyle(n);if(cs.backgroundImage&&cs.backgroundImage!=='none')return null;const c=pc(cs.backgroundColor);if(c&&c[3]>0){r=r*(1-c[3])+c[0]*c[3];g=g*(1-c[3])+c[1]*c[3];b=b*(1-c[3])+c[2]*c[3]}}return [r,g,b]};
const els=[...document.querySelectorAll('button,a.btn,.tab,select,input:not([type=hidden]):not([type=file]),summary,.btn')].filter(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&cs.display!=='none'&&e.offsetParent!==null&&!(e.closest('details:not([open])')&&e.tagName!=='SUMMARY'&&!e.closest('summary'))});
const seen=new Set();const add=(k,e,x='')=>{const key=k+sel(e);if(seen.has(key))return;seen.add(key);out.push(k+': '+sel(e)+' '+x)};
for(const e of els){const r=e.getBoundingClientRect();
 // cortado por ancestral overflow hidden/clip
 for(let a=e.parentElement;a&&a!==document.body;a=a.parentElement){const cs=getComputedStyle(a);const ox=cs.overflowX,oy=cs.overflowY;const ar=a.getBoundingClientRect();if(ar.width===0)continue;
  if(/(auto|scroll)/.test(ox)||/(auto|scroll)/.test(oy))break;
  const clipX=(ox==='hidden'||ox==='clip'),clipY=(oy==='hidden'||oy==='clip');
  if((clipX&&(r.left<ar.left-2||r.right>ar.right+2))||(clipY&&(r.top<ar.top-2||r.bottom>ar.bottom+2))){add('CORTADO',e,'por '+sel(a).slice(0,30));break}}
 const inScroll=(()=>{for(let a=e.parentElement;a;a=a.parentElement){const o=getComputedStyle(a);if(/(auto|scroll)/.test(o.overflowX)&&a.scrollWidth>a.clientWidth)return true}return false})();
 if(!inScroll&&(r.right>vw+1||r.left<-1))add('FORA-TELA',e,Math.round(r.left)+'..'+Math.round(r.right)+' vw'+vw);
 if(e.tagName!=='SELECT'&&e.tagName!=='INPUT'&&e.scrollWidth>e.clientWidth+2&&getComputedStyle(e).overflow!=='visible'&&!/ellipsis/.test(getComputedStyle(e).textOverflow))add('TEXTO-CORTADO',e);
 const sc=(()=>{for(let a=e.parentElement;a;a=a.parentElement){const o=getComputedStyle(a);if(/(auto|scroll)/.test(o.overflowY)&&a.scrollHeight>a.clientHeight)return a.getBoundingClientRect()}return null})();const vis=!sc||(r.top>=sc.top&&r.bottom<=sc.bottom);
 if(vis&&r.top>=0&&r.bottom<=vh&&r.left>=0&&r.right<=vw){const x=r.left+r.width/2,y=r.top+r.height/2;const t=document.elementFromPoint(x,y);if(t&&t!==e&&!e.contains(t)&&!t.contains(e))add('COBERTO',e,'por '+sel(t).slice(0,40))}
 if(r.height<30&&matchMedia('(pointer:coarse)').matches)add('ALVO-PEQUENO',e,Math.round(r.height)+'px');
 const cs=getComputedStyle(e);const fg=pc(cs.color);const bg=bgOf(e);if(fg&&bg&&(e.innerText||'').trim()){const fa=fg[3];const f2=[fg[0]*fa+bg[0]*(1-fa),fg[1]*fa+bg[1]*(1-fa),fg[2]*fa+bg[2]*(1-fa)];const L1=lum(f2),L2=lum(bg);const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);const dis=e.disabled;if(ratio<4.5&&!dis)add('CONTRASTE',e,ratio.toFixed(2)+' '+cs.color)}}
if(document.documentElement.scrollWidth>vw+1)out.push('SCROLL-HORIZONTAL: doc '+document.documentElement.scrollWidth+' > '+vw);
return out})()`;

const dev = (page, w, h, mobile) => page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile });
const sizes = [[1366, 768, false], [1024, 640, false], [768, 1024, true], [390, 844, true]];
const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Estudio com um nome muito mas muito longo para testar o corte de texto no cartao' }) })).json();
const report = {};
const dash = await open(base + '/');
await sleep(2500);
for (const [w, h, m] of sizes) { await dev(dash, w, h, m); await sleep(500); report[`HOME ${w}x${h}`] = await dash.ev(AUDIT); }
const host = await open(`${base}/studio/${studio.id}`);
await sleep(2500); await host.ev(`document.querySelector('#lb-go')?.click()`);
for (let i = 0; i < 30 && !(await host.ev(`!!document.querySelector('#program-canvas')`)); i++) await sleep(500);
await sleep(1500);
for (const [w, h, m] of sizes) {
  await dev(host, w, h, m); await sleep(600);
  await host.ev(`(()=>{const st=document.querySelector('.studio');if(innerWidth<=1000)st.classList.add('panel-open');else st.classList.remove('panel-open')})()`); await sleep(400);
  const tabs = await host.ev(`[...document.querySelectorAll('.tab')].map(t=>t.dataset.tab)`);
  for (const t of tabs) { await host.ev(`document.querySelector('.tab[data-tab="${t}"]').click()`); await sleep(350); if(process.env.SHOT&&t==='journal'){const r=await host.send('Page.captureScreenshot',{format:'png'});(await import('fs')).writeFileSync(process.env.SHOT+'-'+w+'.png',Buffer.from(r.result.data,'base64'))} report[`ESTUDIO ${w}x${h} aba ${t}`] = await host.ev(AUDIT); }
}
let total = 0;
for (const [k, v] of Object.entries(report)) { if (!v.length) continue; console.log('## ' + k); v.slice(0, 25).forEach((x) => console.log('  ' + x)); total += v.length; }
console.log('TOTAL problemas:', total, 'erros JS:', host.errors.length + dash.errors.length);
process.exit(0);