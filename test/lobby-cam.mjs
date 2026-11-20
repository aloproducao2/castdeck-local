// Valida a prÃƒÂ©via da cÃƒÂ¢mera no lobby (Edge com dispositivo fake real, sem mock de getUserMedia).
// Uso: iniciar o Edge com --remote-debugging-port=9333 --use-fake-device-for-media-stream --use-fake-ui-for-media-stream
//      BASE=http://localhost:3100 node test/lobby-cam.mjs [guest|studio]
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const v = await (await fetch(`${CDP}/json/version`)).json();
const bws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let bid = 0;
const bp = new Map();
bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bp.has(m.id)) { bp.get(m.id)(m); bp.delete(m.id); } };
const bsend = (method, params = {}) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });

async function open(url) {
  const { result } = await bsend('Target.createTarget', { url: 'about:blank' });
  const ws = new WebSocket(`ws://127.0.0.1:9333/devtools/page/${result.targetId}`);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{window.__log=[];const t0=performance.now();const L=(m)=>window.__log.push(((performance.now()-t0)|0)+'ms '+m);
    const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async(c)=>{L('gUM '+JSON.stringify(c));try{const s=await gum(c);L('gUM ok '+s.getTracks().map(t=>t.kind+':'+t.readyState).join(','));return s}catch(e){L('gUM FAIL '+e.name+': '+e.message);throw e}};
    const stop=MediaStreamTrack.prototype.stop;MediaStreamTrack.prototype.stop=function(){L('stop '+this.kind+' '+(new Error().stack.split('\\n').slice(2,4).join(' <- ')));return stop.call(this)};})()` });
  const MOCK = process.env.MOCK; // ok: camera canvas estavel | bad: a 1a camera ja nasce encerrada (simula previa preta)
  if (MOCK) {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);let n=0;
      const cam=()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;const x=c.getContext('2d');let k=0;setInterval(()=>{x.fillStyle='hsl('+(k*3%360)+',60%,40%)';x.fillRect(0,0,1280,720);k++},33);return c.captureStream(30).getVideoTracks()[0]};
      navigator.mediaDevices.getUserMedia=async(c)=>{ if(c&&c.video){const out=new MediaStream();const t=cam();const bad='${MOCK}'==='bad'&&n++===0;if(bad)t.stop();window.__log.push('mock cam '+(bad?'MORTA':'ok'));out.addTrack(t);if(c.audio){try{(await gum({audio:c.audio})).getAudioTracks().forEach(a=>out.addTrack(a))}catch{}}return out} return gum(c)};
      const en=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);navigator.mediaDevices.enumerateDevices=async()=>{const d=await en();return d.some(x=>x.kind==='videoinput')?d:[...d,{kind:'videoinput',deviceId:'fakecam',label:'Fake Camera',groupId:'g'}]};})()` });
  }
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result.result.value;
  };
  await send('Page.navigate', { url });
  return { ev, errors, close: () => fetch(`${CDP}/json/close/${result.targetId}`) };
}

const kind = process.argv[2] || 'guest';
const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Lobby Cam' }) })).json();
const url = kind === 'studio' ? `${base}/studio/${studio.id}` : `${base}/join/${studio.id}`;

const runs = [];
for (let n = 0; n < 3; n++) {
  const page = await open(url);
  const t0 = Date.now();
  const probe = `(()=>{const v=document.querySelector('.lobby-preview video');if(!v)return null;const t=v.srcObject?.getVideoTracks()[0];return JSON.stringify({vw:v.videoWidth,paused:v.paused,rs:v.readyState,vis:v.style.visibility,src:!!v.srcObject,tr:t?[t.readyState,t.muted,t.enabled,t.label].join('|'):null,loading:!document.querySelector('#lb-loading')?.hidden,err:document.querySelector('#lb-err')?.textContent,log:window.__log})})()`;
  let first = null;
  let tFrame = null;
  let last = null;
  for (let i = 0; i < 150; i++) {
    await sleep(100);
    const s = await page.ev(probe).catch(() => null);
    if (!s) continue;
    last = JSON.parse(s);
    if (!first) first = { t: Date.now() - t0, ...last };
    if (last.vw > 16 && !last.paused && String(last.tr).startsWith('live')) { tFrame = Date.now() - t0; break; }
  }
  runs.push({ run: n + 1, tLobby: first?.t, tFirstFrameMs: tFrame, last, errors: page.errors });
  await page.close();
  await sleep(2000);
}
console.log(JSON.stringify(runs, null, 1));
await fetch(base + '/api/studios/' + studio.id, { method: 'DELETE' });
const bad = runs.filter((r) => !r.tFirstFrameMs);
console.log(bad.length ? `FALHA: ${bad.length}/3 sem vÃƒÂ­deo` : 'OK: vÃƒÂ­deo apareceu em todas as execuÃƒÂ§ÃƒÂµes');
process.exit(bad.length ? 1 : 0);


