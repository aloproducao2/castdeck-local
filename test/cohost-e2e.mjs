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
  return { ev, errors };
}
const waitFor = async (p, expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.ev(expr)) return true; } catch {} await sleep(250); } return false; };
let fails = 0;
const check = (n, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FALHA'), n, ok ? '' : extra); if (!ok) fails++; };

const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Cohost E2E' }) })).json();
// ?lang=pt: o teste procura textos em português e o idioma escolhido antes fica salvo no perfil do Edge (castdeck.lang)
const host = await open(`${base}/studio/${studio.id}?lang=pt`);
check('lobby host', await waitFor(host, `!!document.querySelector('#lb-go')`));
await sleep(2000); await host.ev(`document.querySelector('#lb-go').click()`);
check('estudio abriu', await waitFor(host, `!!document.querySelector('#program-canvas')`));
const guest = await open(`${base}/join/${studio.id}?lang=pt`);
check('lobby convidado', await waitFor(guest, `!!document.querySelector('#lb-go')`));
await sleep(2000); await guest.ev(`document.querySelector('#lb-go').click()`);
check('convidado na sala', await waitFor(guest, `!!document.querySelector('#g-prod')`));
check('botao Producao oculto p/ convidado comum', await guest.ev(`document.querySelector('#g-prod').hidden`));
check('host viu convidado', await waitFor(host, `__castdeck.S.guests.size===1`));
await sleep(2000);
const gid = await host.ev(`[...__castdeck.S.guests.keys()][0]`);
check('camera do convidado virou fonte', await waitFor(host, `__castdeck.S.sources.has('${gid}:cam')`, 20000));
await host.ev(`document.querySelector('.tile .acts button[title*="co-host"]').click()`);
check('host marcou co-host', await host.ev(`__castdeck.S.guests.get('${gid}').cohost`));
check('botao Producao aparece', await waitFor(guest, `!document.querySelector('#g-prod').hidden`));
await guest.ev(`document.querySelector('#g-prod').click()`);
check('estado chegou ao painel', await waitFor(guest, `document.querySelectorAll('#prod-live .ch-src').length>=1`));
check('painel abre direto em Produção (desktop)', await guest.ev(`innerWidth<=1000 || document.querySelector('#panel-prod').classList.contains('active')`));
check('selo co-host no topo', await guest.ev(`!document.querySelector('#g-role').hidden`));
check('layouts com miniatura', await guest.ev(`document.querySelectorAll('#cp-layouts .cp-lay svg rect').length>=6 && document.querySelectorAll('#cp-layouts .cp-lay').length>=6`));
const clickBtn = (txt) => guest.ev(`[...document.querySelectorAll('#prod-live button')].find(b=>b.textContent.trim()==='${txt}').click()`);
await clickBtn('PiP');
check('layout mudou no host', await waitFor(host, `__castdeck.S.layout==='pip'`));
await clickBtn('Lado a lado');
check('layout 2', await waitFor(host, `__castdeck.S.layout==='split'`));
await waitFor(guest, `[...document.querySelectorAll('#prod-live button')].some(b=>b.textContent.trim()==='Palco')`);
const stageBefore = await host.ev(`__castdeck.S.stage.length`);
await clickBtn('Palco');
check('item foi ao palco', await waitFor(host, `__castdeck.S.stage.length===${stageBefore + 1}`));
check('painel reflete palco', await waitFor(guest, `[...document.querySelectorAll('#prod-live button')].some(b=>b.textContent.trim()==='No palco')`));
await guest.ev(`document.querySelector('#qb-title').value='Ola mundo';document.querySelector('#qb-send').click()`);
check('banner rapido no ar', await waitFor(host, `__castdeck.S.activeBanner==='cohost:quick'`));
await guest.ev(`document.querySelector('#qb-clear').click()`);
check('banner limpo', await waitFor(host, `!__castdeck.S.activeBanner`));
// mensagem: o co-host vê e controla a fila
await host.ev(`__castdeck.messages.external({ id:'cohost-test', sender:'teste', name:'Teste', text:'Mensagem do co-host' })`);
check('cohost vê mensagem', await waitFor(guest, `!!document.querySelector('#cp-messages .cp-msg')`));
await guest.ev(`document.querySelector('#cp-messages .cp-msg').click()`);
check('cohost colocou mensagem no ar', await waitFor(host, `__castdeck.messages.airId === 'cohost-test'`));
await guest.ev(`document.querySelector('#cp-messages .cp-msg').click()`);
check('cohost retirou mensagem do ar', await waitFor(host, `__castdeck.messages.airId !== 'cohost-test'`));
// recarrega o convidado: continua co-host
await guest.ev(`location.reload()`);
await sleep(1500);
await waitFor(guest, `!!document.querySelector('#lb-go')`);
await sleep(2000); await guest.ev(`document.querySelector('#lb-go').click()`);
check('reconexao mantem co-host', await waitFor(guest, `!!document.querySelector('#g-prod') && !document.querySelector('#g-prod').hidden`));
// remove co-host
await host.ev(`document.querySelector('.tile .acts button[title*="co-host"]').click()`);
check('removido: botao some', await waitFor(guest, `document.querySelector('#g-prod').hidden`));
check('sem erros JS', [...host.errors, ...guest.errors].filter((e) => !/Receiving end does not exist/.test(e)).length === 0, JSON.stringify([...host.errors, ...guest.errors]));
console.log(fails ? `${fails} falha(s)` : 'TUDO OK');
process.exit(fails ? 1 : 0);