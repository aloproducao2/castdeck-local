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
const MEDIA = `__castdeck.S.sources.get('media:1').el`;

const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'UI E2E' }) })).json();

// ---------- HOST ----------
const host = await openPage(`${base}/studio/${studio.id}`);
check('lobby host carrega', await waitFor(host, `!!document.querySelector('#lb-go')`));
await sleep(1500);
await host.ev(`document.querySelector('#lb-go').click()`);
check('estúdio abre', await waitFor(host, `!!document.querySelector('#program-canvas') && !!document.querySelector('#c-tab')`));
check('botão Aba existe', await host.ev(`!!document.querySelector('#c-tab')`));
check('aba Mídia existe', await host.ev(`!!document.querySelector('.tab[data-tab=media]')`));

const injected = await host.ev(`(async()=>{
  const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');
  const st=c.captureStream(30);const ac=new AudioContext();const o=ac.createOscillator();const d=ac.createMediaStreamDestination();o.connect(d);o.start();
  st.addTrack(d.stream.getAudioTracks()[0]);
  const rec=new MediaRecorder(st,{mimeType:'video/webm;codecs=vp8,opus'});const ch=[];rec.ondataavailable=e=>ch.push(e.data);
  let n=0;const iv=setInterval(()=>{x.fillStyle='hsl('+(n*9%360)+',80%,50%)';x.fillRect(0,0,640,360);x.fillStyle='#fff';x.font='60px sans-serif';x.fillText('frame '+n++,40,200)},33);
  rec.start();await new Promise(r=>setTimeout(r,4000));rec.stop();await new Promise(r=>rec.onstop=r);clearInterval(iv);
  const f=new File(ch,'teste-local.webm',{type:'video/webm'});
  const dt=new DataTransfer();dt.items.add(f);const inp=document.querySelector('#media-file');inp.files=dt.files;inp.dispatchEvent(new Event('change'));
  return f.size;})()`);
check('arquivo de vídeo gerado', injected > 1000, injected + ' bytes');
check('painel Mídia mostra o vídeo', await waitFor(host, `!!document.querySelector('#panel-media .media-row')`));
await sleep(1200);
check('vídeo NAO toca sozinho ao adicionar', await host.ev(`${MEDIA}.paused && ${MEDIA}.currentTime===0`));
check('vídeo carregado NAO entra no palco sozinho', await host.ev(`!__castdeck.S.stage.includes('media:1')`));
await host.ev(`document.querySelector('#panel-media .m-stage').click()`); await sleep(300);
await host.ev(`document.querySelector('#panel-media .m-play').click()`);
await host.ev(MEDIA + ".loop=true");
await sleep(1500);
const t1 = await host.ev(`${MEDIA}.currentTime`);
await sleep(1000);
const t2 = await host.ev(`${MEDIA}.currentTime`);
check('vídeo local está tocando', t2 > t1, `${t1} -> ${t2}`);
check('vídeo está no palco', await host.ev(`__castdeck.S.stage.includes('media:1')`));
check('áudio do vídeo entra no mixer', await host.ev(`__castdeck.mixer.sources.has('media:1')`));
check('AudioContext rodando', await host.ev(`__castdeck.mixer.ctx.state==='running'`), await host.ev(`__castdeck.mixer.ctx.state`));
let lv=0, plv=0; for (let i=0;i<10;i++){ lv=Math.max(lv, await host.ev(`__castdeck.mixer.level('media:1')`)); plv=Math.max(plv, await host.ev(`__castdeck.mixer.programLevel()`)); await sleep(150); }
check('áudio do vídeo tem sinal no mixer', lv>0.01, lv.toFixed(3));
check('áudio do vídeo chega ao programa (saída)', plv>0.01, plv.toFixed(3));
check('monitor do host ligado p/ o vídeo', await host.ev(`(()=>{const s=__castdeck.mixer.sources.get('media:1');return s.toMonitor.gain.value>0.5 && __castdeck.mixer.monitorBus.gain.value>0})()`));const px = async () => host.ev(`(()=>{const c=document.querySelector('#program-canvas');const d=c.getContext('2d').getImageData(c.width*0.2,c.height*0.5,40,40).data;let s=0;for(const v of d)s+=v;return s})()`);
const a = await px(); await sleep(600); const b = await px();
check('programa renderiza vídeo (pixels mudam)', a !== b, `${a} vs ${b}`);
await host.ev(`document.querySelector('#panel-media .m-play').click()`); await sleep(400);
check('pausa funciona', await host.ev(`${MEDIA}.paused`));
await host.ev(`document.querySelector('#panel-media .m-restart').click()`); await sleep(500);
check('reiniciar volta a tocar', !(await host.ev(`${MEDIA}.paused`)));
await host.ev(`document.querySelector('#panel-media .m-loop').click()`);
check('repetir alterna', !(await host.ev(`${MEDIA}.loop`)));
await host.ev(`${MEDIA}.loop=true`);
await host.ev(`document.querySelector('.tab[data-tab=audio]').click()`); await sleep(300);
await host.ev(`document.querySelector('#mon-prog').click()`); await sleep(400);
check('ouvir saída do programa liga o monitor', await host.ev(`__castdeck.mixer.listenProgram===true && __castdeck.mixer.programMonitor.gain.value>0.5 && __castdeck.mixer.monitorBus.gain.value<0.1`));
check('botão Testar som não dá erro', await host.ev(`(async()=>{await __castdeck.mixer.beep();return true})()`));
await host.ev(`document.querySelector('#mon-prog').click()`); await sleep(400);
check('desligar volta ao retorno normal', await host.ev(`__castdeck.mixer.listenProgram===false && __castdeck.mixer.monitorBus.gain.value>0.5`));
await host.ev(`document.querySelector('.tab[data-tab=media]').click()`); await sleep(300);
await host.ev(`(()=>{const v=document.querySelector('#panel-media .m-vol');v.value=0.3;v.dispatchEvent(new Event('input'))})()`);
check('volume ajusta o mixer', await host.ev(`Math.abs(__castdeck.mixer.sources.get('media:1').volume-0.3)<0.01`));
const mt0 = await host.ev(`__castdeck.S.sources.get("media:1").el.currentTime`);
await host.ev(`document.querySelector('#panel-media .m-stage').click()`); await sleep(300);
check('tirar do palco funciona', !(await host.ev(`__castdeck.S.stage.includes('media:1')`)));
const mt1 = await host.ev(`__castdeck.S.sources.get("media:1").el.currentTime`); await sleep(700);
check("tirar do palco pausa o video", await host.ev(`__castdeck.S.sources.get("media:1").el.paused`) && Math.abs((await host.ev(`__castdeck.S.sources.get("media:1").el.currentTime`)) - mt1) < 0.05);
await host.ev(`document.querySelector('#panel-media .m-stage').click()`); await sleep(300);
await sleep(700);
check("pôr no palco continua do mesmo ponto", await host.ev(`!__castdeck.S.sources.get("media:1").el.paused`) && (await host.ev(`__castdeck.S.sources.get("media:1").el.currentTime`)) >= mt1 - 0.05 && mt1 >= mt0 - 0.05);
check('pôr no palco funciona', await host.ev(`__castdeck.S.stage.includes('media:1')`));
// ---------- REDES (chat social) + BANNERS ----------
await host.ev(`document.querySelector('.tab[data-tab=social]').click()`); await sleep(300);
check('aba Redes existe e abre', await host.ev(`!!document.querySelector('#soc-btn-connect') && !!document.querySelector('#soc-list')`));
await host.ev(`document.querySelector('#soc-btn-connect').click()`); await sleep(200);
check('gaveta de conexão de redes abre', await host.ev(`!document.querySelector('#soc-box-connect').hidden && !!document.querySelector('#soc-new-target')`));
await host.ev(`document.querySelector('#soc-close-connect').click()`); await sleep(150);
await host.ev(`document.querySelector('#soc-btn-options').click()`); await sleep(200);
check('gaveta de opções abre', await host.ev(`!document.querySelector('#soc-box-options').hidden`));
await host.ev(`document.querySelector('#soc-test').click()`); await sleep(500);
check('simular mensagem cria card', await waitFor(host, `!!document.querySelector('.soc-msg')`, 3000));
await host.ev(`(async()=>{const m=await import('/js/studio/social.js');__castdeck.social.addMessage(m.normalizeMessage({chatname:'Maria',chatmessage:'olá <b>galera</b> &amp; bem-vindos',type:'youtube',id:'m1'}))})()`);
check('mensagem do chat chega na lista', await waitFor(host, `!!document.querySelector('.soc-msg[data-id=m1]')`, 3000));
check('HTML do chat vira texto seguro', await host.ev(`__castdeck.social.msgs.find(m=>m.id==='m1')?.text.includes('galera')`));
await host.ev(`document.querySelector('.soc-msg[data-id=m1] [data-act=toggle]').click()`); await sleep(800);
check('Destacar: cartão vai para o programa', await host.ev(`__castdeck.comp.social.featured?.msg?.id==='m1'`));
check('Destacar: botão vira Tirar do ar', await host.ev(`document.querySelector('.soc-msg[data-id=m1] .btn-air')?.textContent.includes('Tirar do ar')`));
await host.ev(`document.querySelector('.soc-msg.on [data-act=toggle]').click()`); await sleep(400);
check('Ocultar: cartão sai do ar', await waitFor(host, `!__castdeck.comp.social.featured`, 3000), JSON.stringify(await host.ev(`__castdeck.comp.social.featured`)));
await host.ev(`document.querySelector('#soc-clear-all').click()`); await sleep(300);
const clearOk = await host.ev(`(()=>{const b=[...document.querySelectorAll('.modal button')].find(x=>/Limpar tudo/i.test(x.textContent));if(b){b.click();return true}return false})()`);
check('limpar chat pede confirmação', clearOk);
await sleep(400);
check('limpar chat esvazia a lista', await host.ev(`__castdeck.social.msgs.length===0`));
const bad = await (await fetch(base + '/api/img-proxy?u=' + encodeURIComponent('http://127.0.0.1:3000/'))).status;
check('proxy de imagem bloqueia endereco local (SSRF)', bad === 400, 'status ' + bad);
check('proxy de imagem rejeita protocolo invalido', (await fetch(base + '/api/img-proxy?u=' + encodeURIComponent('file:///etc/passwd'))).status === 400);

// banners: estilos, posicao, duracao, editar, duplicar e reordenar
await host.ev(`document.querySelector('.tab[data-tab=banners]').click()`); await sleep(300);
await host.ev(`localStorage.removeItem('castdeck.acc'); document.querySelector('.tab[data-tab=media]').click(); document.querySelector('.tab[data-tab=banners]').click()`); await sleep(400);
check('menus em acordeao nas abas (Banners)', await host.ev(`document.querySelectorAll('#panel-banners details.acc').length>=3`));
check('"Novo banner" vem recolhido por padrao', await host.ev(`!document.querySelector('#bn-new').closest('details').open`));
await host.ev(`document.querySelector('#bn-new').closest('details').querySelector('summary').click()`); await sleep(400);
check('clicar abre a secao', await host.ev(`document.querySelector('#bn-new').closest('details').open`));
await host.ev(`document.querySelector('.tab[data-tab=media]').click()`); await sleep(300);
await host.ev(`document.querySelector('.tab[data-tab=banners]').click()`); await sleep(300);
check('acordeao lembra o estado ao reabrir a aba', await host.ev(`document.querySelector('#bn-new').closest('details').open`));
await host.ev(`document.querySelector('.tab[data-tab=social]').click()`); await sleep(300);
const accSocial = await host.ev(`document.querySelectorAll('#panel-social .soc-slide-box').length`);
await host.ev(`document.querySelector('.tab[data-tab=media]').click()`); await sleep(300);
const accMedia = await host.ev(`document.querySelectorAll('#panel-media details.acc').length`);
check('grupos/gavetas nas abas Redes e Midia', accSocial >= 2 && accMedia >= 2, `redes=${accSocial} midia=${accMedia}`);
await host.ev(`document.querySelector('.tab[data-tab=banners]').click()`); await sleep(300);await host.ev(`(()=>{const q=(s)=>document.querySelector(s);q('#bf-title').value='Banner Um';q('#bf-sub').value='sub';q('#bf-style').value='card';q('#bf-pos').value='tr';q('#bf-dur').value='5';q('#bn-add').click()})()`); await sleep(300);
check('banner criado com estilo/posicao/duracao', await host.ev(`(()=>{const b=__castdeck.S.banners.at(-1);return b&&b.title==='Banner Um'&&b.style==='card'&&b.pos==='tr'&&b.dur===5})()`));
await host.ev(`document.querySelector('.banner-item:last-child [data-dup]').click()`); await sleep(300);
check('duplicar banner', await host.ev(`__castdeck.S.banners.length>=2 && __castdeck.S.banners.at(-1).title==='Banner Um (cópia)'`));
await host.ev(`document.querySelector('.banner-item:last-child [data-up]').click()`); await sleep(300);
check('reordenar banner (subir)', await host.ev(`__castdeck.S.banners.at(-2).title==='Banner Um (cópia)'`));
await host.ev(`document.querySelector('.banner-item [data-id], .banner-item').click()`); await sleep(900);
check('banner aparece no ar com o estilo escolhido', await host.ev(`!!__castdeck.comp.banner && __castdeck.comp.banner.style==='card' && __castdeck.comp.banner.pos==='tr'`));
await sleep(6200);
check('banner some sozinho apos o tempo definido', await host.ev(`!__castdeck.S.activeBanner`));
await host.ev(`document.querySelector('.banner-item [data-edit]').click()`); await sleep(400);
await host.ev(`(()=>{const q=(s)=>document.querySelector('.modal '+s);q('#bf-title').value='Editado';q('#bf-style').value='center';q('#bn-save').click()})()`); await sleep(400);
check('editar banner salva', await host.ev(`__castdeck.S.banners.some(b=>b.title==='Editado'&&b.style==='center')`));
// ---------- RENOMEAR / PLAYLIST / PROPORCAO ----------
check('programa mantem 16:9 (sem distorcer)', await host.ev(`(()=>{const c=document.querySelector('#program-canvas'),r=c.getBoundingClientRect();return Math.abs(r.width/r.height-c.width/c.height)<0.03})()`));
await host.ev(`document.querySelector('#backstage .tile .acts button[title=Renomear]').click()`); await sleep(300);
await host.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8,commands:['deleteBackward']}); await host.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8}); await sleep(200);
check('renomear: Backspace apaga o nome atual (teclado real)', await host.ev(`document.querySelector('#rn-in').value===''`));
await host.ev(`(()=>{const i=document.querySelector('#rn-in');i.value='Apresentador Teste';document.querySelector('#rn-ok').click()})()`); await sleep(300);
check('renomear: nome muda no estudio e no compositor', await host.ev(`[...__castdeck.S.sources.values()].some(s=>s.label==='Apresentador Teste') && [...__castdeck.comp.sources.values()].some(s=>s.label==='Apresentador Teste')`));
check('renomear: aparece na barra do palco', await host.ev(`[...document.querySelectorAll('#stagebar .nm')].some(e=>e.textContent==='Apresentador Teste')`));
await host.ev(`(async()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');const st=c.captureStream(30);const rec=new MediaRecorder(st,{mimeType:'video/webm;codecs=vp8'});const ch=[];rec.ondataavailable=e=>ch.push(e.data);const iv=setInterval(()=>{x.fillStyle='#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0');x.fillRect(0,0,320,180)},33);rec.start();await new Promise(r=>setTimeout(r,1500));rec.stop();await new Promise(r=>rec.onstop=r);clearInterval(iv);const dt=new DataTransfer();dt.items.add(new File(ch,'segundo.webm',{type:'video/webm'}));const inp=document.querySelector('#media-file');inp.files=dt.files;inp.dispatchEvent(new Event('change'))})()`);
check('2o video adicionado sem tocar', await waitFor(host, `!!__castdeck.S.sources.get('media:2') && __castdeck.S.sources.get('media:2').el.paused`));
await host.ev(`document.querySelector('.tab[data-tab=media]').click()`); await sleep(300);
await host.ev(`document.querySelector('#pl-open').click()`); await sleep(300);
await host.ev(`(()=>{const m=__castdeck.S.sources.get('media:1').el;m.loop=false;m.pause();document.querySelector('#pl-on').click();document.querySelector('#pl-start').click()})()`); await sleep(600);
check('playlist: comeca pelo primeiro', await host.ev(`!__castdeck.S.sources.get('media:1').el.paused`));
await host.ev(`__castdeck.S.sources.get('media:1').el.dispatchEvent(new Event('ended'))`); await sleep(600);
check('playlist: avanca para o proximo ao terminar', await host.ev(`!__castdeck.S.sources.get('media:2').el.paused && __castdeck.S.sources.get('media:1').el.paused`));
check('playlist: proximo ocupa o lugar no palco', await host.ev(`__castdeck.S.stage.includes('media:2') && !__castdeck.S.stage.includes('media:1')`));
await host.ev(`document.querySelector('#pl-loop').click(); __castdeck.S.sources.get('media:2').el.dispatchEvent(new Event('ended'))`); await sleep(600);
check('playlist: repetir lista volta ao primeiro', await host.ev(`!__castdeck.S.sources.get('media:1').el.paused`));
await host.ev(`document.querySelector('#pl-loop').click(); document.querySelector('#pl-on').click(); const m1=__castdeck.S.sources.get('media:1').el; m1.pause();`); await sleep(200);
await host.ev(`(()=>{const m=__castdeck.S.sources.get('media:2');document.querySelector('.media-row[data-mid="media:2"] .m-del').click()})()`); await sleep(300);
check('remover o 2o video', await host.ev(`!__castdeck.S.sources.has('media:2')`));
// A janela do teste tem 680 px (layout de celular, onde o palco rola de propósito).
// Para medir o layout de desktop, emula um viewport de notebook antes das checagens de encaixe.
await host.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await sleep(700);
await host.ev(`document.querySelector('.media-row[data-mid="media:1"] .m-stage').click(); document.querySelector('.media-row[data-mid="media:1"] .m-stage').click();`); await sleep(600);
const backFit = await host.ev(`(()=>{const f=document.querySelector('.bottombar').getBoundingClientRect();const t=[...document.querySelectorAll('#backstage .tile')];const tiles=t.map(e=>{const r=e.getBoundingClientRect();return {top:Math.round(r.top),bottom:Math.round(r.bottom)}});return {ok:t.length>0&&tiles.every(r=>r.bottom<=f.top+1&&r.top>=0),barTop:Math.round(f.top),tiles,vh:innerHeight}})()`);
check('miniaturas do backstage totalmente visiveis', backFit.ok, JSON.stringify(backFit));
const stageFit = await host.ev(`(()=>{const w=document.querySelector('.stage-wrap');const c=document.querySelector('#program-canvas').getBoundingClientRect();return {ok:w.scrollHeight<=w.clientHeight+1&&Math.abs(c.width/c.height-16/9)<0.03,sh:w.scrollHeight,ch:w.clientHeight,cw:Math.round(c.width),chh:Math.round(c.height),ratio:+(c.width/c.height).toFixed(3)}})()`);
check('programa cabe sem rolagem e mantem 16:9', stageFit.ok, JSON.stringify(stageFit));
// ---------- ARRASTAR / SOLO ----------
await sleep(800);
check('barra "No palco" tem um chip por item', await host.ev(`document.querySelectorAll('#stagebar .chip').length===__castdeck.S.stage.length && __castdeck.S.stage.length>=2`));
const ord0 = await host.ev(`JSON.stringify(__castdeck.S.stage)`);
await host.ev(`(()=>{const cv=document.querySelector('#program-canvas'),c=__castdeck.comp,[a,b]=__castdeck.S.stage;
 const pt=(id)=>{const t=c.anim.get(id),r=cv.getBoundingClientRect();return {clientX:r.left+((t.x+t.w/2)/c.W)*r.width,clientY:r.top+((t.y+t.h/2)/c.H)*r.height}};
 const ev=(type,p)=>cv.dispatchEvent(new PointerEvent(type,{...p,button:0,pointerId:77,bubbles:true}));
 const pa=pt(a),pb=pt(b);ev('pointerdown',pa);ev('pointermove',{clientX:pa.clientX+20,clientY:pa.clientY+20});ev('pointermove',pb);ev('pointerup',pb)})()`);
await sleep(400);
const ord1 = await host.ev(`JSON.stringify(__castdeck.S.stage)`);
check('arrastar troca a posição', ord1 !== ord0 && JSON.stringify(JSON.parse(ord1).slice().sort()) === JSON.stringify(JSON.parse(ord0).slice().sort()), ord0 + ' -> ' + ord1);
await host.ev(`document.querySelector('#stagebar [data-solo]').click()`); await sleep(1200);
check('solo ativa', await host.ev(`__castdeck.comp.solo===__castdeck.S.stage[0] && __castdeck.S.solo===__castdeck.S.stage[0]`));
check('solo: item ocupa a tela toda', await host.ev(`(()=>{const c=__castdeck.comp,a=c.anim.get(c.solo);return a&&a.w>c.W*0.95&&a.h>c.H*0.95})()`));
await host.ev(`document.querySelector('#stagebar [data-solo]').click()`); await sleep(1200);
check('solo desativa', await host.ev(`!__castdeck.comp.solo && !__castdeck.S.solo`));
await host.ev(`(()=>{const cv=document.querySelector('#program-canvas'),c=__castdeck.comp,t=c.anim.get(__castdeck.S.stage[1]),r=cv.getBoundingClientRect();
 cv.dispatchEvent(new MouseEvent('dblclick',{clientX:r.left+((t.x+t.w/2)/c.W)*r.width,clientY:r.top+((t.y+t.h/2)/c.H)*r.height,bubbles:true}))})()`);
await sleep(300);
check('duplo clique ativa solo', await host.ev(`__castdeck.comp.solo===__castdeck.S.stage[1]`));
await host.ev(`document.querySelector('#stagebar [data-unstage="'+__castdeck.S.solo+'"]')?.click()`); await sleep(300);
check('remover item em solo limpa o solo', await host.ev(`!__castdeck.comp.solo`));
await host.ev(`document.querySelector('.tab[data-tab=media]').click()`); await sleep(200);
if (!(await host.ev(`__castdeck.S.stage.includes('media:1')`))) await host.ev(`document.querySelector('#panel-media .m-stage').click()`);
await sleep(300);
check('estúdio sem erros JS (host)', host.errors.length === 0, host.errors.join(' | '));

// ---------- CURSOR ----------
check('botão Cursor existe (host)', await host.ev(`!!document.querySelector('#c-cursor')`));
await host.ev(`(()=>{window.__dm=[];navigator.mediaDevices.getDisplayMedia=async(c)=>{window.__dm.push(JSON.stringify(c.video));const cv=document.createElement('canvas');cv.width=640;cv.height=360;const x=cv.getContext('2d');setInterval(()=>{x.fillStyle='#08f';x.fillRect(0,0,640,360)},50);return cv.captureStream(15)}})()`);
await host.ev(`document.querySelector('#c-tab').click()`); await sleep(800);
check('aba: cursor oculto por padrao', await host.ev(`__dm[0].includes('"cursor":"never"')`), await host.ev(`__dm[0]`));
await host.ev(`document.querySelector('#c-tab').click()`); await sleep(300);
await host.ev(`document.querySelector('#c-cursor').click()`); await sleep(300);
check('botão Cursor liga e salva', await host.ev(`JSON.parse(localStorage.getItem('castdeck.devices')).cursor==='always' && !document.querySelector('#c-cursor').classList.contains('opt-off')`));
await host.ev(`document.querySelector('#c-tab').click()`); await sleep(800);
check('aba: cursor aparece quando ligado', await host.ev(`__dm[1].includes('"cursor":"always"')`), await host.ev(`__dm[1]`));
await host.ev(`document.querySelector('#c-tab').click()`); await sleep(300);
await host.ev(`document.querySelector('#c-cursor').click()`); await sleep(300);

// ---------- PAINEL ----------
const dash = await openPage(`${base}/`);
check('painel: botão "No navegador"', await waitFor(dash, `!!document.querySelector('#open-browser')`));
await dash.ev(`(()=>{const s=document.querySelector('#open-mode');s.value='browser';s.dispatchEvent(new Event('change'))})()`); await sleep(600);
check('painel: preferência de abertura salva', (await (await fetch(base + '/api/settings')).json()).openMode === 'browser');
await dash.ev(`(()=>{const s=document.querySelector('#open-mode');s.value='app';s.dispatchEvent(new Event('change'))})()`); await sleep(400);
check('painel sem erros', dash.errors.length === 0, dash.errors.join(' | '));
await dash.close();
// ---------- CONVIDADO ----------
const guest = await openPage(`${base}/join/${studio.id}`);
check('lobby convidado carrega', await waitFor(guest, `!!document.querySelector('#lb-go')`));
check('lobby sem corte horizontal', await guest.ev(`(()=>{const f=document.querySelector('.lobby-form');const c=document.querySelector('.lobby-card');if(!f||!c)return false;const r=f.getBoundingClientRect(),cr=c.getBoundingClientRect();return r.right<=cr.right+1&&f.scrollWidth<=f.clientWidth+1})()`));
await guest.ev(`(()=>{const n=document.querySelector('#lb-name');n.value='Convidado Teste';n.dispatchEvent(new Event('input'))})()`);
await sleep(1500);
await guest.ev(`document.querySelector('#lb-go').click()`);
check('convidado entra', await waitFor(guest, `!!document.querySelector('#g-tab')`));
check('convidado: botões Aba/Vídeo', await guest.ev(`!!document.querySelector('#g-tab') && !!document.querySelector('#g-video')`));
check('host vê convidado', await waitFor(host, `/1 convidado/.test(document.querySelector('#guest-count')?.textContent||'')`));
check('host recebe vídeo do convidado (WebRTC)', await waitFor(host, `[...__castdeck.S.sources.values()].some(s=>s.id.endsWith(':cam')&&s.id!=='host:cam'&&s.el.videoWidth>0)`, 25000));
console.log('  DBG', await host.ev(`JSON.stringify([...__castdeck.S.sources.values()].map(s=>({id:s.id,vw:s.el?.videoWidth,rs:s.el?.readyState,paused:s.el?.paused,tr:s.stream?.getTracks().map(t=>t.kind+':'+t.readyState+':'+t.muted)})))`));
check('indicador de qualidade aparece', await waitFor(host, `!!document.querySelector('[data-qdot]')`));
await sleep(5000);
console.log('  qualidade:', await host.ev(`document.querySelector('[data-qdot]')?.title`));
check('convidado recebe programa (vídeo do host)', await waitFor(guest, `(()=>{const v=document.querySelector('#g-program');return v&&v.srcObject&&v.videoWidth>0})()`, 20000));
check('convidado: overlay de espera realmente some (display:none)', await guest.ev(`getComputedStyle(document.querySelector('#g-wait')).display==='none'`));
check('convidado tem pill de qualidade', await guest.ev(`!!document.querySelector('#g-quality')`));

await guest.ev(`(async()=>{
  const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');
  const st=c.captureStream(30);const rec=new MediaRecorder(st,{mimeType:'video/webm;codecs=vp8'});const ch=[];rec.ondataavailable=e=>ch.push(e.data);
  let n=0;const iv=setInterval(()=>{x.fillStyle='hsl('+(n*7%360)+',70%,45%)';x.fillRect(0,0,320,180);n++},33);
  rec.start();await new Promise(r=>setTimeout(r,9000));rec.stop();await new Promise(r=>rec.onstop=r);clearInterval(iv);
  const dt=new DataTransfer();dt.items.add(new File(ch,'gv.webm',{type:'video/webm'}));const inp=document.querySelector('#g-file');inp.files=dt.files;inp.dispatchEvent(new Event('change'));return true})()`);
check('host recebe o vídeo local do convidado', await waitFor(host, `[...__castdeck.S.sources.values()].some(s=>s.id.endsWith(':screen')&&s.id!=='host:screen'&&s.el.videoWidth>0)`, 25000));
check('guest.js sem erros', guest.errors.length === 0, guest.errors.join(' | '));

// reconexão: convidado perde a sinalização e volta sozinho
await guest.ev(`(()=>{for(const k of Object.keys(window)){}; return true})()`);
await host.ev(`__castdeck.S.guests.values().next().value.peer.dispatchEvent(new CustomEvent('stuck'))`);
check('stuck: host derruba e o convidado reentra', await waitFor(host, `/1 convidado/.test(document.querySelector('#guest-count')?.textContent||'') && [...__castdeck.S.sources.values()].some(s=>s.id.endsWith(':cam')&&s.id!=='host:cam'&&s.el.videoWidth>0)`, 30000));
check('sem tiles fantasma de convidado', await host.ev(`[...__castdeck.S.sources.values()].filter(s=>s.id.endsWith(':cam')&&s.id!=='host:cam').length===1`));
check('host sem erros no fim', host.errors.length === 0, host.errors.join(' | '));
check('guest sem erros no fim', guest.errors.length === 0, guest.errors.join(' | '));

await fetch(base + '/api/studios/' + studio.id, { method: 'DELETE' });
await host.close(); await guest.close();
const fails = results.filter((r) => !r[1]);
console.log(`\n${results.length - fails.length}/${results.length} passaram`);
process.exit(fails.length ? 1 : 0);
