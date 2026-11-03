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

const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Features E2E' }) })).json();
// ---- tela inicial
const dash = await open(base + '/');
check('home carrega', await waitFor(dash, `!!document.querySelector('.steps')`));
check('home: primeiros passos + continuar', await dash.ev(`document.querySelectorAll('.step').length===4 && !!document.querySelector('.hero-main a.btn.primary')`));
check('home: botao convite', await dash.ev(`!!document.querySelector('[data-invite]')`));
check('home: abas', await dash.ev(`document.querySelectorAll('.dash-nav a.db-tab').length===4 && !!document.querySelector('#sistema') && !!document.querySelector('#gravacoes')`));
// ---- estudio
const host = await open(`${base}/studio/${studio.id}`);
await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(2000);
await host.ev(`document.querySelector('#lb-go').click()`);
check('estudio abriu', await waitFor(host, `!!document.querySelector('#program-canvas')`));
check('abas agrupadas (Conteúdo 1º, Mídia 1a)', await host.ev(`document.querySelector('.grp').dataset.group==='content' && document.querySelectorAll('.grp').length>=4 && document.querySelector('.tab').dataset.tab==='media'`));
check('aba Midia ativa por padrao', await host.ev(`document.querySelector('#panel-media').classList.contains('active')`));
// imagem: injeta PNG pelo input
await host.ev(`(async()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.fillStyle='#e33';x.fillRect(0,0,320,180);const b=await new Promise(r=>c.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([b],'foto.png',{type:'image/png'}));const i=document.querySelector('#media-file');i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
check('imagem listada na aba Midia', await waitFor(host, `document.querySelectorAll('#panel-media .img-row').length===1`));
await host.ev(`document.querySelector('#panel-media .i-stage').click()`);
check('imagem foi ao palco', await waitFor(host, `__castdeck.S.stage.includes('media:1')`));
await host.ev(`document.querySelector('#panel-media .i-full').click()`);
check('imagem em tela cheia (solo)', await waitFor(host, `__castdeck.S.solo==='media:1'`));
await host.ev(`document.querySelector('#panel-media .i-full').click()`);
await sleep(300);
// layout personalizado
await host.ev(`document.querySelector('[data-act=new]').click()`);
check('editor de layout abre', await waitFor(host, `!!document.querySelector('.le-canvas') && document.querySelectorAll('.le-slot').length===2`));
await host.ev(`document.querySelector('[data-preset="2"]').click()`);
check('modelo aplicado (2 espacos)', await host.ev(`document.querySelectorAll('.le-slot').length===2`));
await host.ev(`document.querySelector('#le-add').click()`);
check('adicionar espaco', await host.ev(`document.querySelectorAll('.le-slot').length===3`));
await host.ev(`document.querySelector('#le-name').value='Meu layout'; document.querySelector('#le-save').click()`);
check('layout custom salvo e ativo', await waitFor(host, `/^c-/.test(__castdeck.S.layout) && __castdeck.S.brand.customLayouts.length===1`));
check('botao do layout na barra', await host.ev(`!!document.querySelector('.layout-btn.active[data-layout^="c-"]')`));
// stage tem host:cam + imagem: slot1 = cam (cheia), slot2 = imagem pequena
await sleep(1200);
const rects = await host.ev(`(()=>{const c=__castdeck.comp;const W=c.canvas.width;return JSON.stringify([...c.anim.entries()].map(([id,a])=>[id,Math.round(a.x/W*100),Math.round(a.w/W*100)]))})()`);
console.log('   rects:', rects);
const rr = JSON.parse(rects);
check('slots aplicados ao palco', rr.length === 2 && rr.some(([, , w]) => w >= 99) && rr.some(([, x, w]) => x >= 70 && w <= 30), rects);
// persiste
await sleep(900);
const saved = await (await fetch(`${base}/api/studios/${studio.id}`)).json();
check('layout persistiu no servidor', saved.brand?.customLayouts?.length === 1 && /^c-/.test(saved.brand.layout));
// excluir
await host.ev(`document.querySelector('[data-act=edit]').click()`);
await waitFor(host, `!!document.querySelector('#le-del')`);
await host.ev(`(()=>{if(window.__autoOk)return true;window.__autoOk=new MutationObserver(()=>document.querySelector(".modal-back [data-ok]")?.click());window.__autoOk.observe(document,{childList:true,subtree:true});return true})(); document.querySelector('#le-del').click()`);
check('excluir volta para grade', await waitFor(host, `__castdeck.S.layout==='grid' && !(__castdeck.S.brand.customLayouts||[]).length`));
check('sem erros JS', host.errors.length + dash.errors.length === 0, JSON.stringify([...host.errors, ...dash.errors]));
console.log(fails ? `${fails} falha(s)` : 'TUDO OK');
process.exit(fails ? 1 : 0);