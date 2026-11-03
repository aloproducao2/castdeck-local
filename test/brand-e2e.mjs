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
const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'BRAND' }) })).json();
const host = await openPage(`${base}/studio/${studio.id}`);
await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(1500);
await host.ev(`document.querySelector('#lb-go').click()`);
await waitFor(host, `!!document.querySelector('#program-canvas')`);
await host.ev(`document.querySelector('.tab[data-tab=brand]').click()`);
// intercepta o seletor de arquivos: entrega window.__next (File) quando o app chamar input.click()
await host.ev(`(()=>{const oc=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){ if(this.type==='file')window.__conn=this.isConnected; if(this.type==='file'&&window.__next){const dt=new DataTransfer();dt.items.add(window.__next);this.files=dt.files;window.__next=null;setTimeout(()=>this.dispatchEvent(new Event('change')),20);return} return oc.call(this)}; window.__mk=async(kind,w,h,color)=>{ if(kind==='svg'){return new File([\`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="\${color}"/></svg>\`],'logo.svg',{type:'image/svg+xml'})} const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d'); if(kind!=='png-alpha'){x.fillStyle=color;x.fillRect(0,0,w,h)} else {x.fillStyle=color;x.fillRect(w*0.1,h*0.1,w*0.3,h*0.3)} const type=kind==='jpg'?'image/jpeg':kind==='webp'?'image/webp':'image/png'; const b=await new Promise(r=>c.toBlob(r,type,0.9)); return new File([b],'f.'+kind,{type}) }})()`);
const px = (x, y) => host.ev(`(()=>{const c=document.querySelector('#program-canvas');const d=c.getContext('2d').getImageData(Math.round(c.width*${x}),Math.round(c.height*${y}),1,1).data;return [d[0],d[1],d[2]]})()`);
const close = (a, b, t = 40) => a.every((v, i) => Math.abs(v - b[i]) <= t);

// logo PNG
await host.ev(`(async()=>{window.__next=await __mk('png',800,400,'#ff0000');document.querySelector('#b-logo').click()})()`);
check('logo: enviado e salvo no estado', await waitFor(host, `!!__castdeck.S.brand.logo && __castdeck.S.brand.logo.startsWith('data:image')`, 5000));
await sleep(800);
check('logo: aparece no programa (canto sup. direito vermelho)', close(await px(0.93, 0.07), [255, 0, 0], 60), JSON.stringify(await px(0.93, 0.07)));
// logo SVG sem width/height
await host.ev(`(async()=>{window.__next=await __mk('svg',0,0,'#00ff00');document.querySelector('#b-logo').click()})()`);
await sleep(1500);
const svgLogo = await host.ev(`__castdeck.S.brand.logo`);
check('logo SVG: gera imagem valida (nao "data:,")', svgLogo && svgLogo.length > 100, String(svgLogo).slice(0, 40));
// fundo JPG grande
await host.ev(`(async()=>{window.__next=await __mk('jpg',4000,2500,'#0000ff');document.querySelector('#b-addbg').click()})()`);
check('fundo: enviado', await waitFor(host, `__castdeck.S.brand.customBackgrounds?.length===1`, 8000));
await sleep(1000);
check('fundo: aparece no programa (azul)', close(await px(0.02, 0.5), [0, 0, 255], 60), JSON.stringify(await px(0.02, 0.5)));
// fundo WEBP
await host.ev(`(async()=>{window.__next=await __mk('webp',1920,1080,'#ffff00');document.querySelector('#b-addbg').click()})()`);
check('fundo webp: enviado', await waitFor(host, `__castdeck.S.brand.customBackgrounds?.length===2`, 8000));
// overlay PNG com transparência
await host.ev(`(async()=>{window.__next=await __mk('png-alpha',1920,1080,'#ff00ff');document.querySelector('#b-ov').click()})()`);
check('overlay: enviado', await waitFor(host, `!!__castdeck.S.brand.overlay`, 8000));
await sleep(1000);
check('overlay: aparece no programa (magenta)', close(await px(0.2, 0.2), [255, 0, 255], 60), JSON.stringify(await px(0.2, 0.2)));
check('seletor de arquivo fica anexado ao DOM ao abrir', await host.ev(`window.__conn===true`));
// arrastar e soltar sobre a zona do logo (posicao inferior esquerda)
await host.ev(`document.querySelector('#b-logopos [data-v=bl]').click()`); await sleep(300);
await host.ev(`(async()=>{const f=await __mk('png',400,200,'#00ffff');const dt=new DataTransfer();dt.items.add(f);document.querySelector('[data-drop=logo]').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))})()`);
await sleep(1200);
check('logo: arrastar e soltar funciona', await host.ev(`__castdeck.S.brand.logo?.startsWith('data:image/png')`));
check('logo: posicao inferior esquerda aplicada', close(await px(0.06, 0.93), [0, 255, 255], 60), JSON.stringify(await px(0.06, 0.93)));
check('logo: nao aparece mais no canto superior direito', !close(await px(0.93, 0.07), [0, 255, 255], 60));
// tamanho
await host.ev(`(()=>{const r=document.querySelector('#b-logosize');r.value=30;r.dispatchEvent(new Event('input'))})()`); await sleep(600);
check('logo: slider de tamanho altera o estado', await host.ev(`__castdeck.S.brand.logoSize===30`));
// arquivo invalido
await host.ev(`(async()=>{const f=new File(['nao sou imagem'],'x.txt',{type:'text/plain'});const dt=new DataTransfer();dt.items.add(f);document.querySelector('[data-drop=overlay]').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))})()`); await sleep(500);
check('arquivo invalido mostra erro e nao altera', await host.ev(`/imagem/i.test(document.body.innerText)`) );
// imagem corrompida
await host.ev(`(async()=>{window.__next=new File(['corrompido'],'x.png',{type:'image/png'});document.querySelector('#b-logo').click()})()`); await sleep(1000);
check('imagem corrompida: erro amigavel e estado preservado', await host.ev(`__castdeck.S.brand.logo?.startsWith('data:image/png')`) && await host.ev(`/n.o suportado|erro/i.test(document.body.innerText)`));// persistência
await sleep(1500);
const saved = await (await fetch(base + '/api/studios/' + studio.id)).json();
check('persistencia: servidor guardou logo/fundos/overlay', !!saved.brand?.logo && saved.brand.customBackgrounds?.length === 2 && !!saved.brand.overlay, JSON.stringify({ l: !!saved.brand?.logo, b: saved.brand?.customBackgrounds?.length, o: !!saved.brand?.overlay }));
console.log('erros', host.errors);
check('sem erros JS', host.errors.length === 0, host.errors.join(' | '));
await fetch(base + '/api/studios/' + studio.id, { method: 'DELETE' });
await host.close();
console.log(results.filter((r) => !r[1]).length ? 'HA FALHAS' : 'TUDO OK');
process.exit(0);