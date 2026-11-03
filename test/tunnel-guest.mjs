// E2E via CDP (Edge com câmera fake). Uso: node ui-e2e.mjs
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3000';
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
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text; if (!/Receiving end does not exist/.test(d || '')) errors.push(d); } // ignora ruído de extensões do Edge
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
let tun = null;
for (let i = 0; i < 40 && !tun; i++) { const t = await (await fetch(base + '/api/tunnel')).json(); if (t.status === 'on') tun = t.url; else await sleep(2000); }
console.log('tunnel', tun);
const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'TUN' }) })).json();
const host = await openPage(`${base}/studio/${studio.id}`);
await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(1500);
await host.ev(`document.querySelector('#lb-go').click()`);
await waitFor(host, `!!document.querySelector('#program-canvas')`);
const guest = await openPage(`${tun}/join/${studio.id}`);
console.log('lobby', await waitFor(guest, `!!document.querySelector('#lb-go')`, 30000));
await guest.ev(`(()=>{const n=document.querySelector('#lb-name');n.value='Conv';n.dispatchEvent(new Event('input'))})()`);
await sleep(1500);
await guest.ev(`document.querySelector('#lb-go').click()`);
check('convidado entra', await waitFor(guest, `!!document.querySelector('#g-tab')`, 20000));
check('host vê convidado', await waitFor(host, `/1 convidado/.test(document.querySelector('#guest-count')?.textContent||'')`, 20000));
check('convidado recebe programa via túnel', await waitFor(guest, `(()=>{const v=document.querySelector('#g-program');return v&&v.srcObject&&v.videoWidth>0})()`, 30000));
const secs = Number(process.env.SECS || 60);
for (let i = 0; i < secs / 4; i++) {
  await sleep(4000);
  const g = await guest.ev("(()=>{const v=document.querySelector('#g-program');return 'hidden='+document.querySelector('#g-wait')?.hidden+' w='+v?.videoWidth+' t='+v?.currentTime.toFixed(1)+' pc='+__guest.peer?.pc.connectionState+'/'+__guest.peer?.pc.iceConnectionState})()");
  const h = await host.ev("[...__castdeck.S.guests.values()].map(g=>g.peer.pc.connectionState+'/'+g.peer.pc.iceConnectionState).join(',')||'none'");
  console.log(i * 4 + 's guest:', g, '| host:', h);
}
console.log('guest log', JSON.stringify(await guest.ev('__guest.log'), null, 1));
console.log('errors', host.errors, guest.errors);
await fetch(base + '/api/studios/' + studio.id, { method: 'DELETE' });
await host.close(); await guest.close();
process.exit(0);