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
const waitFor = async (p, expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.ev(expr)) return true; } catch {} await sleep(250); } return false; };
let fails = 0;
const check = (n, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FALHA'), n, ok ? '' : extra); if (!ok) fails++; };


const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Vertical E2E' }) })).json();
const host = await open(`${base}/studio/${studio.id}`);
await host.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(2000);
await host.ev(`document.querySelector('#lb-go').click()`);
check('estudio abriu', await waitFor(host, `!!document.querySelector('#program-canvas')`));
check('painel vertical oculto por padrao', await host.ev(`document.querySelector('#vdock').hidden===true`));
await host.ev(`document.querySelector('#btn-vertical').click()`);
check('painel vertical abre', await waitFor(host, `!document.querySelector('#vdock').hidden && !!document.querySelector('#vdock #v-frame canvas')`));
await sleep(500);
check('painel ao lado do preview horizontal', await host.ev(`(()=>{const a=document.querySelector('#program').getBoundingClientRect(),b=document.querySelector('#vdock').getBoundingClientRect();if(innerWidth<=900)return b.top>=a.bottom-2;return b.left>=a.right-2 && Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2)<a.height`+`})()`));
await host.ev(`window.__mut=0;new MutationObserver((l)=>{window.__mut+=l.length}).observe(document.querySelector('#v-frame'),{childList:true})`);
check('canvas 720x1280', await host.ev(`(()=>{const c=document.querySelector('#v-frame canvas');return c.width===720&&c.height===1280})()`));
await sleep(800);
for (const l of ['auto', 'vfill', 'vstack', 'vlead', 'vfit']) {
  await host.ev(`document.querySelector('#v-layouts [data-l=${l}]').click()`);
  check('layout ' + l, await waitFor(host, `__castdeck.vview.layout==='${l}' && __castdeck.S.brand.vlayout==='${l}'`));
}
const lum = await host.ev(`(()=>{const c=document.querySelector('#v-frame canvas');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let s=0;for(let i=0;i<d.length;i+=4000)s+=d[i]+d[i+1]+d[i+2];return s})()`);
check('vertical desenhando', lum > 0, String(lum));
await host.ev(`__castdeck.comp.showBanner({title:'Teste GC',subtitle:'vertical',style:'bar',pos:'bl'})`);
await sleep(700);
check('banner compartilhado', await host.ev(`!!__castdeck.vview.view.banner`));
await host.ev(`__castdeck.comp.hideBanner()`);
// simultaneo: grava horizontal e vertical juntos
await host.ev(`(()=>{if(window.__autoOk)return true;window.__autoOk=new MutationObserver(()=>document.querySelector(".modal-back [data-ok]")?.click());window.__autoOk.observe(document,{childList:true,subtree:true});return true})()`);
await host.ev(`document.querySelector('#btn-record').click()`);
await waitFor(host, `!!document.querySelector('#gl-go')`);
await host.ev(`document.querySelector('input[name=glv][value=h]').checked=true`);
await host.ev(`document.querySelector('#gl-go').click()`);
check('horizontal gravando', await waitFor(host, `!!__castdeck.S.live`, 20000));
await host.ev(`document.querySelector('#v-rec').checked=true; document.querySelector('#v-rec').dispatchEvent(new Event('change',{bubbles:true}))`);
await host.ev(`document.querySelectorAll('input[name=vdest]').forEach(i=>{i.checked=false})`);
await host.ev(`document.querySelector('#v-go').click()`);
check('vertical gravando junto', await waitFor(host, `!!__castdeck.S.vlive`, 20000));
await sleep(4500);
const sys = await (await fetch(base + '/api/system')).json();
const mine = sys.broadcasts.filter((b) => b.studioId === studio.id);
check('servidor com 2 saidas', mine.length === 2 && mine.some((b) => b.vertical) && mine.some((b) => !b.vertical), JSON.stringify(mine.map((b) => [b.preset, b.vertical])));
check('preset vertical 720x1280', mine.some((b) => b.preset === 'v720p30'));
check('pill VERTICAL no topo', await host.ev(`!!document.querySelector('#live-stats')?.textContent.includes('VERTICAL')`));
await host.ev(`document.querySelector('#v-go').click()`);
check('vertical parou', await waitFor(host, `!__castdeck.S.vlive`, 15000));
check('horizontal segue no ar', await host.ev(`!!__castdeck.S.live`));
// gravar e transmitir são independentes: a gravação para pelo próprio botão REC
await host.ev(`document.querySelector('#btn-record').click()`);
check('horizontal parou', await waitFor(host, `!__castdeck.S.live`, 15000));
await sleep(1500);
const recs = await (await fetch(base + '/api/recordings')).json();
const names = recs.map((r) => r.name || r.file || '');
check('gravacao vertical existe', names.some((n) => /Vertical-E2E.*_vertical\.mp4$/i.test(n)), JSON.stringify(names.slice(0, 6)));
check('gravacao horizontal existe', names.some((n) => /Vertical-E2E_\d/i.test(n) && !/_vertical/.test(n)));
check('prévia nao pisca (canvas nao e recriado)', await host.ev(`window.__mut===0`), 'mutacoes');
check('sem erros JS', host.errors.length === 0, JSON.stringify(host.errors));
console.log(fails ? `${fails} falha(s)` : 'TUDO OK');
process.exit(fails ? 1 : 0);
