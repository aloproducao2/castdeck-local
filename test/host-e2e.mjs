// Câmeras extras, sessão salva/restaurada e limpeza. BASE=http://localhost:3100 node test/host-e2e.mjs
import fs from 'node:fs';
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

const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Host E2E' }) })).json();
const getStudio = async () => (await fetch(base + '/api/studios/' + studio.id)).json();
const host = await open(`${base}/studio/${studio.id}`);
await host.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
const enter = async () => { await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(1500); await host.ev(`document.querySelector('#lb-go').click()`); return waitFor(host, `!!window.__castdeck?.extras`); };
check('estudio abriu', await enter());
await sleep(800);
// ---- camera extra
check('botao + Camera nos bastidores', await host.ev(`!!document.querySelector('#backstage #add-cam-tile')`));
await host.ev(`document.querySelector('#add-cam-tile').click()`);
await sleep(400);
await host.ev(`(document.querySelector('[data-pick="usb"]') || document.querySelector('#add-cam-tile'))?.click()`);
check('dialogo de camera com previa', await waitFor(host, `!!document.querySelector('#cd-cam') && document.querySelector('#cd-v').videoWidth>0`, 10000));
const nMics = await host.ev(`document.querySelector('#cd-mic').options.length`);
check('lista de audio (com "Sem audio")', nMics >= 1, 'opcoes ' + nMics);
await host.ev(`(()=>{const s=document.querySelector('#cd-mic');if(s.options.length>1)s.selectedIndex=1;document.querySelector('#cd-name').value='Cam B';document.querySelector('#cd-ok').click()})()`);
check('camera extra adicionada', await waitFor(host, `window.__castdeck.S.sources.get('host:cam2')?.extraCam===true && window.__castdeck.S.sources.get('host:cam2').label==='Cam B'`));
check('tile da camera extra com trocar/remover', await host.ev(`[...document.querySelectorAll('#backstage .tile')].some(t=>t.querySelector('.nm').textContent==='Cam B' && t.querySelector('button[title^="Trocar c"]') && t.querySelector('button[title="Remover câmera"]'))`));
if (nMics > 1) check('audio da camera no mixer', await host.ev(`window.__castdeck.mixer.sources.has('host:cam2:audio')`));
await host.ev(`[...document.querySelectorAll('#backstage .tile')].find(t=>t.querySelector('.nm').textContent==='Cam B').querySelector('.stage-btn button').click()`);
check('camera extra no palco', await waitFor(host, `window.__castdeck.S.stage.includes('host:cam2')`));
// ---- midia
await host.ev(`(async()=>{const c=document.createElement('canvas');c.width=160;c.height=90;const x=c.getContext('2d');let k=0;const t=setInterval(()=>{x.fillStyle='hsl('+(k*20%360)+',70%,50%)';x.fillRect(0,0,160,90);k++},40);const rec=new MediaRecorder(c.captureStream(25),{mimeType:'video/webm'});const ch=[];rec.ondataavailable=e=>ch.push(e.data);rec.start();await new Promise(r=>setTimeout(r,1500));rec.stop();await new Promise(r=>rec.onstop=r);clearInterval(t);const f=new File(ch,'salvo.webm',{type:'video/webm'});const dt=new DataTransfer();dt.items.add(f);document.querySelector('#panel-media').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));return true})()`);
check('midia adicionada', await waitFor(host, `window.__castdeck.S.sources.has('media:1')`));
await sleep(4500);
let st = await getStudio();
check('sessao salva no servidor', st.session?.cams?.length === 1 && st.session.cams[0].label === 'Cam B' && st.session.stage.includes('host:cam2') && st.session.media.some((m) => m.id === 'media:1'), JSON.stringify(st.session));
// ---- reabrir: restaura
await host.send('Page.reload');
check('reabriu', await enter());
check('restaurou camera extra', await waitFor(host, `window.__castdeck.S.sources.get('host:cam2')?.label==='Cam B'`, 15000));
check('restaurou midia', await waitFor(host, `window.__castdeck.S.sources.get('media:1')?.kind==='media'`, 10000));
check('restaurou palco', await waitFor(host, `window.__castdeck.S.stage.includes('host:cam2')`, 5000));
// ---- limpeza
const old = Date.now() / 1000 - 100 * 86400;
const stor = await (await fetch(base + '/api/storage')).json();
fs.mkdirSync(stor.recordings.dir, { recursive: true });
const fake = stor.recordings.dir + '/zz_teste_antigo.mp4';
fs.writeFileSync(fake, Buffer.alloc(2048));
fs.utimesSync(fake, old, old);
await host.ev(`(()=>{if(window.__autoOk)return true;window.__autoOk=new MutationObserver(()=>document.querySelector(".modal-back [data-ok]")?.click());window.__autoOk.observe(document,{childList:true,subtree:true});return true})(); window.__castdeck.extras.openCleanup(); true`);
check('modal de limpeza (4 secoes)', await waitFor(host, `document.querySelectorAll('#cl-body .cl-card').length===4`, 8000));
await host.ev(`document.querySelector('#cl-body [data-rec="90"]').click()`);
await sleep(1500);
check('apagou gravacao antiga', !fs.existsSync(fake));
await host.ev(`document.querySelector('#cl-scene').click()`);
check('reset da cena', await waitFor(host, `(()=>{const S=window.__castdeck.S;return !S.sources.has('host:cam2') && ![...S.sources.values()].some(s=>s.kind==='media') && S.stage.join()==='host:cam'})()`));
await sleep(3500);
st = await getStudio();
check('sessao limpa salva', st.session?.cams?.length === 0 && st.session.media.length === 0, JSON.stringify(st.session));
check('sem erros JS', host.errors.filter((e) => !/Receiving end does not exist/.test(e)).length === 0, host.errors.join(' | '));
console.log(fails ? fails + ' falha(s)' : 'TUDO OK');
process.exit(fails ? 1 : 0);
