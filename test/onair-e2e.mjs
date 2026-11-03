// Central No Ar: gravar e transmitir independentes, inclusive na vertical vinculada (4 cenários do plano A1).
// Requer servidor de teste (:3100) e Edge com CDP (:9333). Uso: BASE=http://localhost:3100 node test/onair-e2e.mjs
// Os destinos RTMP apontam para uma porta fechada: ficam "reconectando", o que basta para conferir
// quais saídas o servidor mantém ativas (o envio real para RTMP já é coberto por test/rtmp-e2e.mjs).
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
  return { ev, errors, send, close: () => bsend('Target.closeTarget', { targetId: result.targetId }) };
}
const waitFor = async (p, expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.ev(expr)) return true; } catch {} await sleep(250); } return false; };
let fails = 0;
const check = (n, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FALHA'), n, ok ? '' : extra); if (!ok) fails++; };
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());

// estado das saídas no servidor: { h: {rec, live}, v: {rec, live} }
async function server(studioId) {
  const sys = await (await fetch(base + '/api/system')).json();
  const mine = (sys.broadcasts || []).filter((b) => b.studioId === studioId);
  const pick = (vert) => {
    const b = mine.find((x) => !!x.vertical === vert);
    if (!b) return { rec: false, live: false, on: false };
    const act = (b.outputs || []).filter((o) => o.state !== 'stopped');
    return { on: true, rec: act.some((o) => o.kind === 'record'), live: act.some((o) => o.kind === 'rtmp') };
  };
  return { h: pick(false), v: pick(true) };
}
const fmt = (s) => JSON.stringify(s);
async function expectServer(studioId, want, label, ms = 12000) {
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < ms) {
    s = await server(studioId);
    const ok = ['h', 'v'].every((k) => s[k].rec === want[k].rec && s[k].live === want[k].live);
    if (ok) return check(label, true);
    await sleep(500);
  }
  check(label, false, `esperado ${fmt(want)} obtido ${fmt(s)}`);
}

const studio = await post('/api/studios', { name: 'OnAir E2E' });
const dH = await post('/api/destinations', { name: 'H falso', platform: 'custom', url: 'rtmp://127.0.0.1:1939/live', key: 'h', format: 'h' });
const dV = await post('/api/destinations', { name: 'V falso', platform: 'custom', url: 'rtmp://127.0.0.1:1939/live', key: 'v', format: 'v' });

const host = await open(`${base}/studio/${studio.id}?lang=pt`);
await host.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(1500);
await host.ev(`document.querySelector('#lb-go').click()`);
check('estúdio abriu', await waitFor(host, `!!document.querySelector('#program-canvas')`));
// confirma sozinho os modais "Parar/Encerrar"
await host.ev(`(()=>{window.__autoOk=new MutationObserver(()=>document.querySelector(".modal-back [data-ok]")?.click());window.__autoOk.observe(document,{childList:true,subtree:true});return true})()`);
check('botão REC com visual novo', await host.ev(`document.querySelector('#btn-record').classList.contains('oa-rec')`));

const openRec = async (hv) => {
  await host.ev(`document.querySelector('#btn-record').click()`);
  await waitFor(host, `!!document.querySelector('#gl-go')`);
  const disabled = await host.ev(`document.querySelector('input[name=glv][value=hv]').disabled`);
  await host.ev(`document.querySelector('input[name=glv][value=${hv ? 'hv' : 'h'}]').checked=true`);
  await host.ev(`document.querySelector('#gl-go').click()`);
  return disabled;
};
const openLive = async (hv, rec) => {
  await host.ev(`document.querySelector('#btn-live').click()`);
  await waitFor(host, `!!document.querySelector('#gl-go') && !!document.querySelector('#gl-count')`);
  const disabled = await host.ev(`document.querySelector('input[name=glv][value=hv]').disabled`);
  await host.ev(`(()=>{const r=document.querySelector('input[name=glv][value=${hv ? 'hv' : 'h'}]');r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));
    document.querySelectorAll('input[name=dest]').forEach(i=>i.checked=i.value===${JSON.stringify(dH.id)});
    document.querySelectorAll('input[name=vdest-gl]').forEach(i=>i.checked=i.value===${JSON.stringify(dV.id)});
    const c=document.querySelector('#gl-rec'); if(c) c.checked=${rec ? 'true' : 'false'};
    document.querySelector('#gl-count').checked=false; return true})()`);
  await host.ev(`document.querySelector('#gl-go').click()`);
  return disabled;
};
const OFF = { rec: false, live: false };

// ---- Cenário 1: gravando H+V -> Transmitir H+V: a vertical passa a transmitir também
await openRec(true);
check('C1 gravando H e V', await waitFor(host, `!!__castdeck.S.recording && !!__castdeck.S.vlive?.record`, 20000));
await expectServer(studio.id, { h: { rec: true, live: false }, v: { rec: true, live: false } }, 'C1 servidor: só gravações');
const dis1 = await openLive(true, false);
check('C1 opção H+V liberada no modal Transmitir', dis1 === false);
check('C1 ao vivo', await waitFor(host, `!!__castdeck.S.streaming`, 20000));
await expectServer(studio.id, { h: { rec: true, live: true }, v: { rec: true, live: true } }, 'C1 servidor: H e V gravando + no ar');

// ---- Cenário 2: encerrar a live -> as duas continuam gravando, nenhuma transmite
await host.ev(`document.querySelector('#btn-live').click()`);
check('C2 live encerrada', await waitFor(host, `!__castdeck.S.streaming`, 10000));
await expectServer(studio.id, { h: { rec: true, live: false }, v: { rec: true, live: false } }, 'C2 servidor: V parou de transmitir e segue gravando');
check('C2 REC segue no botão', await host.ev(`document.querySelector('#btn-record').classList.contains('on')`));

// ---- Cenário 3: transmitir de novo H+V e parar a gravação -> as duas seguem no ar sem gravar
await openLive(true, false);
check('C3 ao vivo de novo', await waitFor(host, `!!__castdeck.S.streaming`, 20000));
await expectServer(studio.id, { h: { rec: true, live: true }, v: { rec: true, live: true } }, 'C3 servidor: tudo ligado');
await sleep(3500); // passa da janela de 3 s
await host.ev(`document.querySelector('#btn-record').click()`);
check('C3 gravação parada', await waitFor(host, `!__castdeck.S.recording`, 10000));
await expectServer(studio.id, { h: { rec: false, live: true }, v: { rec: false, live: true } }, 'C3 servidor: V parou de gravar e segue no ar');
check('C3 pílula de saúde visível', await host.ev(`!!document.querySelector('#oa-health')`));
await host.ev(`document.querySelector('#oa-health').click()`);
check('C3 popover mostra destinos H e V', await waitFor(host, `(()=>{const p=document.querySelector('#oa-pop');return p&&!p.hidden&&p.textContent.includes('H falso')&&p.textContent.includes('V falso')})()`, 5000));
await host.ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);

// ---- Cenário 4: ao vivo H+V sem gravar -> Gravar H+V grava as duas
const dis4 = await openRec(true);
check('C4 opção H+V liberada no modal Gravar', dis4 === false);
check('C4 gravando', await waitFor(host, `!!__castdeck.S.recording && !!__castdeck.S.vlive?.record`, 15000));
await expectServer(studio.id, { h: { rec: true, live: true }, v: { rec: true, live: true } }, 'C4 servidor: V voltou a gravar');

// ---- Fim: estado continua estável depois da janela de 3 s (status do servidor não desfaz nada)
await sleep(4000);
check('estado estável após 4 s', await host.ev(`!!__castdeck.S.recording && !!__castdeck.S.streaming && !!__castdeck.S.vlive?.record && !!__castdeck.S.vlive?.destinationIds?.length`));
await host.ev(`document.querySelector('#btn-live').click()`);
await waitFor(host, `!__castdeck.S.streaming`, 10000);
await host.ev(`document.querySelector('#btn-record').click()`);
check('tudo parado', await waitFor(host, `!__castdeck.S.recording && !__castdeck.S.vlive`, 15000));
await expectServer(studio.id, { h: OFF, v: OFF }, 'servidor sem saídas');

// contagem 3-2-1: aparece e pode ser cancelada
await host.ev(`document.querySelector('#btn-live').click()`);
await waitFor(host, `!!document.querySelector('#gl-count')`);
await host.ev(`(()=>{const r=document.querySelector('input[name=glv][value=h]');r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}));document.querySelectorAll('input[name=dest]').forEach(i=>i.checked=i.value===${JSON.stringify(dH.id)});const c=document.querySelector('#gl-rec');if(c)c.checked=false;document.querySelector('#gl-count').checked=true;return true})()`);
await host.ev(`document.querySelector('#gl-go').click()`);
check('contagem aparece', await waitFor(host, `!!document.querySelector('.oa-count b')?.textContent`, 4000));
await host.ev(`document.querySelector('.oa-count').click()`);
await sleep(3500);
check('contagem cancelada não entra ao vivo', await host.ev(`!__castdeck.S.streaming && !document.querySelector('.oa-count')`));

check('sem erros JS', host.errors.length === 0, JSON.stringify(host.errors));
await host.close();
await fetch(`${base}/api/destinations/${dH.id}`, { method: 'DELETE' });
await fetch(`${base}/api/destinations/${dV.id}`, { method: 'DELETE' });
await fetch(`${base}/api/studios/${studio.id}`, { method: 'DELETE' });
console.log(fails ? `${fails} falha(s)` : 'TUDO OK');
process.exit(fails ? 1 : 0);
