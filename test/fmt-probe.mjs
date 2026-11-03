// E2E via CDP (Edge com câmera fake). Uso: node ui-e2e.mjs
const CDP = 'http://127.0.0.1:9333';
const base = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') => { results.push([name, !!ok]); console.log(ok ? 'PASS' : 'FAIL', name, info); };

let browserWs, bid = 0; const bpend = new Map(); let winN = 0;
async function bsend(method, params = {}) {
  if (!browserWs) {
    const v = await (await fetch(`${CDP}/json/version`)).json();
    browserWs = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((r) => (browserWs.onopen = r));
    browserWs.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bpend.has(m.id)) { bpend.get(m.id)(m); bpend.delete(m.id); } };
  }
  return new Promise((r) => { const i = ++bid; bpend.set(i, r); browserWs.send(JSON.stringify({ id: i, method, params })); });
}
async function openPage(url) {
  const c = await bsend('Target.createTarget', { url: 'about:blank', newWindow: true });
  const targetId = c.result.targetId;
  const w = await bsend('Browser.getWindowForTarget', { targetId });
  await bsend('Browser.setWindowBounds', { windowId: w.result.windowId, bounds: { windowState: 'normal', left: (winN++) * 700, top: 20, width: 680, height: 800 } });
  const t = { id: targetId, webSocketDebuggerUrl: `ws://127.0.0.1:9333/devtools/page/${targetId}` };
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const orig=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const fakeCam=()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;const x=c.getContext('2d');let n=0;setInterval(()=>{x.fillStyle='hsl('+(n*3%360)+',60%,40%)';x.fillRect(0,0,1280,720);x.fillStyle='#fff';x.font='120px sans-serif';x.fillText('CAM '+n++,100,400)},33);return c.captureStream(30)};
    navigator.mediaDevices.getUserMedia=async(c)=>{ if(c&&c.video){ const out=new MediaStream(fakeCam().getVideoTracks()); if(c.audio){ try{(await orig({audio:c.audio})).getAudioTracks().forEach(t=>out.addTrack(t))}catch{} } return out; } return orig(c) };
    const oe=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices=async()=>{const d=await oe();return d.some(x=>x.kind==='videoinput')?d:[...d,{kind:'videoinput',deviceId:'fakecam',label:'Fake Camera',groupId:'g'}]};
  })()` });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result.result.value;
  };
  await send('Page.navigate', { url });
  return { ev, send, errors, id: t.id, close: () => fetch(`${CDP}/json/close/${t.id}`) };
}
const waitFor = async (p, expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.ev(expr)) return true; } catch {} await sleep(300); } return false; };
const MEDIA = `__castdeck.S.sources.get('media:1').el`;

const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'fmt' }) })).json();
const host = await openPage(`${base}/studio/${studio.id}`);
await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(1500);
await host.ev(`document.querySelector('#lb-go').click()`);
await waitFor(host, `!!document.querySelector('#c-media')`);
// input de arquivo real via CDP
const dir = process.env.TEMP + '\\cdmedia\\';
let n = 0;
for (const f of ['aac.mp4', 'ac3.mkv', 'mp3.mp4']) {
  n++;
  const doc = await host.send('DOM.getDocument');
  const q = await host.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#media-file' });
  await host.send('DOM.setFileInputFiles', { files: [dir + f], nodeId: q.result.nodeId });
  await host.ev(`document.querySelector('#media-file').dispatchEvent(new Event('change'))`);
  await sleep(f.endsWith('.mkv') ? 14000 : 3500);
  const info = await host.ev(`(()=>{const s=__castdeck.S.sources.get('media:${n}');const el=s.el;const m=__castdeck.mixer;return JSON.stringify({err:el.error&&el.error.message,paused:el.paused,t:el.currentTime,vw:el.videoWidth,muted:el.muted,vol:el.volume,dec:el.webkitAudioDecodedByteCount,lvl:m.level('media:${n}'),prog:m.programLevel(),ctx:m.ctx.state,sr:m.ctx.sampleRate,mon:m.sources.get('media:${n}').toMonitor.gain.value,monbus:m.monitorBus.gain.value,spk:m.ctx.sinkId})})()`);
  console.log(f, info);
  // pega vários níveis
  let mx = 0; for (let i = 0; i < 10; i++) { mx = Math.max(mx, await host.ev(`__castdeck.mixer.level('media:${n}')`)); await sleep(100); }
  console.log('  nível máx', mx);
}
await fetch(base + '/api/studios/' + studio.id, { method: 'DELETE' }); process.exit(0);