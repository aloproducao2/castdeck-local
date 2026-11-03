// Valida a câmera remota (/cam/:id, celular pelo QR) e a mesa de corte (modo OBS/vMix) no Edge real via CDP :9333.
//   PORT=3100 node server/index.js   +   msedge --remote-debugging-port=9333 --use-fake-ui-for-media-stream
//   BASE=http://localhost:3100 node test/switcher-e2e.mjs        (npm run test:switcher)
// Confere: a câmera remota conecta só enviando (host não monta retorno nem mix-minus), vira fonte do estúdio,
// a prévia/corte/dissolve trocam o programa, o tally chega ao "celular" e sair do modo volta o programa para a Cena.
import fs from 'node:fs';
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const v = await (await fetch(`${CDP}/json/version`)).json();
const bws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let bid = 0;
const bp = new Map();
bws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && bp.has(m.id)) (bp.get(m.id)(m), bp.delete(m.id));
};
const bsend = (method, params = {}) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
// câmera falsa 1280x720 (canvas animado) para o teste não depender de hardware
const MOCKJS = `(()=>{const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 const cam=()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;const x=c.getContext('2d');let k=0;setInterval(()=>{x.fillStyle='hsl('+(k*3%360)+',60%,40%)';x.fillRect(0,0,1280,720);x.fillStyle='#fff';x.font='80px sans-serif';x.fillText(String(k),100,200);k++},33);const t=c.captureStream(30).getVideoTracks()[0];
  // capacidades simuladas de celular para o painel Câmeras do host (canvas não expõe nada nativo)
  t.getCapabilities=()=>({zoom:{min:1,max:4,step:0.1},focusMode:['continuous','manual'],focusDistance:{min:0,max:1,step:0.01},exposureMode:['continuous','manual'],exposureCompensation:{min:-2,max:2,step:0.1},iso:{min:100,max:3200,step:1},whiteBalanceMode:['continuous','manual'],colorTemperature:{min:2500,max:8000,step:50},brightness:{min:0,max:100,step:1},torch:true});
  t.getSettings=()=>({zoom:1,focusMode:'continuous',exposureMode:'continuous',whiteBalanceMode:'continuous',brightness:50});
  t.applyConstraints=async(cs)=>{window.__appliedCtl=[...(window.__appliedCtl||[]),cs];return;};
  return t};
 navigator.mediaDevices.getUserMedia=async(c)=>{if(c&&c.video){const o=new MediaStream();o.addTrack(cam());if(c.audio){try{(await gum({audio:c.audio})).getAudioTracks().forEach(a=>o.addTrack(a))}catch{}}return o}return gum(c)};
 const en=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);navigator.mediaDevices.enumerateDevices=async()=>{const d=await en();return d.some(x=>x.kind==='videoinput')?d:[...d,{kind:'videoinput',deviceId:'fakecam',label:'Fake Camera',groupId:'g'}]};})()`;
const targets = [];
async function open(url) {
  const { result } = await bsend('Target.createTarget', { url: 'about:blank' });
  targets.push(result.targetId);
  const ws = new WebSocket(`ws://127.0.0.1:9333/devtools/page/${result.targetId}`);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) (pend.get(m.id)(m), pend.delete(m.id));
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: MOCKJS });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result.result.value;
  };
  await send('Page.navigate', { url });
  return { ev, errors, send };
}
const waitFor = async (p, expr, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.ev(expr)) return true; } catch {} await sleep(300); } return false; };
let fails = 0;
const check = (n, ok, extra = '') => { console.log(ok ? 'OK   ' : 'FALHA', n, ok ? '' : extra); if (!ok) fails++; };

try {
  const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Switcher E2E' }) })).json();
  const host = await open(`${base}/studio/${studio.id}`);
  // começa sempre no modo Estúdio (a preferência da mesa fica salva no localStorage do perfil de teste)
  await waitFor(host, `!!document.querySelector('#lb-go')`);
  await host.ev(`localStorage.removeItem('castdeck.switcher')`);
  await host.send('Page.reload');
  check('lobby host', await waitFor(host, `!!document.querySelector('#lb-go')`));
  await sleep(1500);
  await host.ev(`document.querySelector('#lb-go').click()`);
  check('estudio abriu', await waitFor(host, `!!document.querySelector('#program-canvas') && !!window.__castdeck?.switcher`));
  check('modo Estúdio por padrão (mesa escondida)', await host.ev(`!__castdeck.S.switcher && document.querySelector('#switcher').hidden`));

  // menu "＋ Câmera" -> celular: modal com os dois QR Codes
  const hasMenu = await host.ev(`typeof document.querySelector('#btn-switcher')?.click === 'function'`);
  check('botão da mesa de corte na barra', hasMenu);

  // a câmera remota (o "celular")
  const cam = await open(`${base}/cam/${studio.id}`);
  check('câmera remota conectou', await waitFor(cam, `__cam.peer?.pc.connectionState==='connected'`, 30000));
  check('host viu a câmera remota', await waitFor(host, `[...__castdeck.S.guests.values()].some(g=>g.cam)`));
  const gid = await host.ev(`[...__castdeck.S.guests.values()].find(g=>g.cam).id`);
  const camId = `${gid}:cam`;
  check('câmera remota virou fonte', await waitFor(host, `__castdeck.S.sources.get('${camId}')?.remoteCam===true`));
  const hostSide = await host.ev(`(()=>{const g=__castdeck.S.guests.get('${gid}');return {view:!!g.view,tracks:g.peer.pc.getSenders().filter(s=>s.track).length}})()`);
  check('sem retorno (GuestView) nem envio do host para a câmera', !hostSide.view && hostSide.tracks === 0, JSON.stringify(hostSide));
  check('vídeo da câmera remota chega ao host', await waitFor(host, `(async()=>{const s=await __castdeck.S.guests.get('${gid}').peer.pc.getStats();let f=0;s.forEach(x=>{if(x.type==='inbound-rtp'&&x.kind==='video')f=x.framesDecoded||0});return f>10})()`));

  // painel Câmeras do host: preview + ajustes remotos (zoom/foco/ISO/exposição/lanterna)
  await host.send('Page.bringToFront');
  await host.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await host.ev(`document.querySelector('#btn-cameras').click()`);
  check('painel Câmeras abre com preview da câmera remota', await waitFor(host, `!!document.querySelector('#hcam-tabs [data-tab="${camId}"]') && !!document.querySelector('#hcam-main video[data-main-pv="${camId}"]')`));
  const camLayout = await host.ev(`(()=>{const m=document.querySelector('.hcam-modal');const card=m.closest('.modal');const g=document.querySelector('.hcam-grid2');return {ok:card.scrollHeight<=card.clientHeight+1,sh:card.scrollHeight,ch:card.clientHeight,cols:g?getComputedStyle(g).gridTemplateColumns.split(' ').length:0}})()`);
  check('painel Câmeras sem rolagem e controles em 2 colunas', camLayout.ok && camLayout.cols === 2, JSON.stringify(camLayout));
  check('interface de vídeo e áudio do celular aparece', await waitFor(host, `!!document.querySelector('#hcam-main select[data-io-video]') && !!document.querySelector('#hcam-main select[data-io-audio]')`));
  if (process.env.SHOT) {
    await sleep(900);
    const png = await host.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(process.env.SHOT, Buffer.from(png.result.data, 'base64'));
  }
  const audioDev = await host.ev(`(()=>{const s=document.querySelector('#hcam-main select[data-io-audio]');return s&&s.options.length>1?s.options[1].value:''})()`);
  if (audioDev) {
    await host.ev(`(()=>{const s=document.querySelector('#hcam-main select[data-io-audio]');s.value=${JSON.stringify(audioDev)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    check('interface de áudio remota é aplicada no celular', await waitFor(cam, `__cam.audioId===${JSON.stringify(audioDev)}`, 5000), audioDev);
  }
  await host.ev(`document.querySelector('#hcam-tabs [data-tab="host:cam"]')?.click()`);
  check('interface local de vídeo e áudio aparece', await waitFor(host, `!!document.querySelector('#hcam-main select[data-io-video]') && !!document.querySelector('#hcam-main select[data-io-audio]')`));
  await host.ev(`document.querySelector('#hcam-tabs [data-tab="${camId}"]')?.click()`);
  check('controles do celular chegam ao painel', await waitFor(host, `!!document.querySelector('#hcam-main input[data-k="zoom"]')`));
  await host.ev(`(()=>{const i=document.querySelector('#hcam-main input[data-k="zoom"]');i.value='2';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  check('zoom remoto aplicado na câmera', await waitFor(cam, `__cam.ctl.zoom===2 && JSON.stringify(__appliedCtl||[]).includes('"zoom":2')`, 5000), JSON.stringify(await cam.ev(`__cam.ctl`)));
  await host.ev(`document.querySelector('#hcam-main [data-torch]').click()`);
  check('lanterna remota liga no celular', await waitFor(cam, `__cam.torch===true && JSON.stringify(__appliedCtl||[]).includes('"torch":true')`, 5000));
  await host.ev(`(()=>{const i=document.querySelector('#hcam-main input[data-k="iso"]');i.value='800';i.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  check('ISO remoto aplicado', await waitFor(cam, `__cam.ctl.iso===800`, 5000), JSON.stringify(await cam.ev(`__cam.ctl`)));
  await host.ev(`document.querySelector('#hcam-main [data-reset]').click()`);
  check('restaurar automático limpa os ajustes', await waitFor(cam, `!__cam.torch && __cam.ctl.zoom===1`, 5000), JSON.stringify(await cam.ev(`__cam.ctl`)));
  await host.ev(`document.querySelector('.hcam-modal [data-close]').click()`);
  check('painel Câmeras fecha', await waitFor(host, `!document.querySelector('.hcam-modal')`));

  await host.ev(`document.querySelector('.tab[data-tab="whatsapp"]')?.click()`);
  check('aba WhatsApp abre na lateral', await waitFor(host, `document.querySelector('#panel-whatsapp')?.classList.contains('active') && !!document.querySelector('#panel-whatsapp .wa-panel-head')`));
  await host.ev(`document.querySelector('#btn-whatsapp')?.click()`);
  check('modal WhatsApp abre', await waitFor(host, `!!document.querySelector('.wa-modal')`));
  await host.ev(`document.querySelector('.wa-modal [data-close]')?.click()`);
  check('modal WhatsApp fecha', await waitFor(host, `!document.querySelector('.wa-modal')`));
  await host.ev(`document.querySelector('.tab[data-tab="media"]')?.click()`);
  check('WhatsApp não fica dentro de Mídia', await waitFor(host, `document.querySelector('#panel-media')?.classList.contains('active') && !document.querySelector('#panel-whatsapp')?.classList.contains('active')`));

  // modal de enquadramento de fonte: posição, zoom e corte
  await host.ev(`document.querySelector('[data-src-id="${camId}"] button[title*="Ajustar posição"]').click()`);
  check('modal de ajuste de fonte abre', await waitFor(host, `!!document.querySelector('#sa-cv')`));
  await host.ev(`(()=>{const z=document.querySelector('#sa-zoom');z.value='120';z.dispatchEvent(new Event('input',{bubbles:true}));const c=document.querySelector('#sa-ct');c.value='10';c.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await host.ev(`document.querySelector('#sa-apply').click()`);
  check('ajuste de fonte aplicado', await waitFor(host, `__castdeck.S.sources.get('${camId}')?.adjust?.zoom===1.2 && __castdeck.comp.sources.get('${camId}')?.adjust?.zoom===1.2 && __castdeck.S.sources.get('${camId}')?.adjust?.crop.t===0.1 && __castdeck.S.brand.sourceAdjust?.['${camId}']?.zoom===1.2`));

  // mesa de corte
  await host.send('Page.bringToFront');
  // desktop largo: monitores lado a lado, T-bar visível e painel lateral em ícones
  await host.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });
  await host.ev(`localStorage.removeItem('castdeck.sideMini'); document.querySelector('#btn-switcher').click()`);
  await sleep(500); // transição de largura do painel lateral
  check('mesa ligada', await host.ev(`__castdeck.S.switcher && !document.querySelector('#switcher').hidden`));
  check('monitores PRÉVIA | transição | PROGRAMA', await host.ev(`(() => { const a = document.querySelector('.sw-pvw').getBoundingClientRect(), t = document.querySelector('#sw-tcol').getBoundingClientRect(), p = document.querySelector('#program').getBoundingClientRect(); return a.width > 200 && a.right <= t.left + 1 && t.right <= p.left + 1 && Math.abs(a.width - p.width) < 40; })()`));
  check('painel lateral recolhe em ícones na mesa', await host.ev(`document.querySelector('.studio').classList.contains('side-mini') && document.querySelector('.side').offsetWidth < 100`));
  await host.ev(`document.querySelector('.grp[data-group="audio"]').click()`);
  check('ícone abre o painel flutuante', await host.ev(`document.querySelector('.studio').classList.contains('side-fly') && document.querySelector('#panel-audio').classList.contains('active')`));
  await host.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
  await host.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
  check('Esc fecha o painel flutuante', await host.ev(`!document.querySelector('.studio').classList.contains('side-fly')`));
  check('barra de fontes mostra a câmera remota', await waitFor(host, `!!document.querySelector('#sw-bus [data-src="${camId}"]')`));
  await host.ev(`__castdeck.switcher.setPreview('${camId}')`);
  check('tally verde (prévia) no celular', await waitFor(cam, `__cam.tally.pvw && !__cam.tally.pgm`));
  await host.ev(`__castdeck.switcher.take('cut')`);
  check('CORTE: câmera remota no ar', await host.ev(`__castdeck.comp.take==='${camId}' && __castdeck.S.take==='${camId}' && __castdeck.S.pvw===null`));
  check('tally vermelho (no ar) no celular', await waitFor(cam, `__cam.tally.pgm`));
  check('borda vermelha na página da câmera', await cam.ev(`document.querySelector('.cam-stage').classList.contains('tally-pgm')`));
  // AUTO (dissolve) de volta para a Cena
  await host.ev(`__castdeck.switcher.take('mix')`);
  check('AUTO: dissolve em andamento', await host.ev(`!!__castdeck.comp.fade && __castdeck.comp.take===null`));
  await sleep(1200);
  check('AUTO terminou (programa = Cena)', await host.ev(`!__castdeck.comp.fade && __castdeck.S.take===null && __castdeck.S.pvw==='${camId}'`));
  // atalho de teclado: Espaço corta de novo para a câmera
  await host.send('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await host.send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  check('Espaço corta para a prévia', await waitFor(host, `__castdeck.S.take==='${camId}'`, 3000));
  // T-bar arrastada com o mouse: no meio = dissolve manual parado; na outra ponta = Cena no ar
  const tr = JSON.parse(
    await host.ev(`(() => { const b = document.querySelector('#sw-tbar .sw-tbar-track').getBoundingClientRect(), h = document.querySelector('#sw-tbar-handle').getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, top: b.top, bottom: b.bottom, y0: h.top + h.height / 2 }); })()`),
  );
  const fromTop = Math.abs(tr.y0 - tr.top) < Math.abs(tr.y0 - tr.bottom);
  const yAt = (f) => (fromTop ? tr.top + (tr.bottom - tr.top) * f : tr.bottom - (tr.bottom - tr.top) * f);
  const mouse = (type, y) => host.send('Input.dispatchMouseEvent', { type, x: tr.x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  await mouse('mousePressed', yAt(0));
  for (let i = 1; i <= 5; i++) await mouse('mouseMoved', yAt(i / 10));
  check('T-bar no meio: dissolve manual', await host.ev(`!!__castdeck.comp.fade?.manual && __castdeck.comp.fade.p > 0.3 && __castdeck.comp.fade.p < 0.7 && __castdeck.S.take===null`));
  for (let i = 6; i <= 10; i++) await mouse('mouseMoved', yAt(i / 10));
  await mouse('mouseMoved', yAt(1.05));
  await mouse('mouseReleased', yAt(1.05));
  check('T-bar na outra ponta: Cena no ar', await host.ev(`!__castdeck.comp.fade && __castdeck.S.take===null && __castdeck.S.pvw==='${camId}'`));
  // FTB: escurece tudo e o botão pisca; sair da mesa desfaz
  await host.ev(`document.querySelector('#sw-ftb').click()`);
  check('FTB ligado', await host.ev(`__castdeck.comp.ftb?.on===true && document.querySelector('#sw-ftb').classList.contains('on')`));
  await host.ev(`document.querySelector('#sw-ftb').click()`);
  // tela cheia: sem gesto do usuário o navegador recusa a nativa e entra o falso tela cheia (mesmo caminho do app Android)
  const fsEl = `(document.fullscreenElement || document.querySelector('.fs-pseudo'))`;
  for (const [kind, sel] of [['program', '#program'], ['pvw', '.sw-pvw'], ['wall', '.stage-wrap']]) {
    await host.ev(`document.querySelector('[data-fs="${kind}"]').click()`);
    const ok = await waitFor(host, `${fsEl} === document.querySelector('${sel}')`, 3000);
    const cover = await host.ev(`(() => { const b = document.querySelector('${sel}').getBoundingClientRect(); return b.width >= innerWidth - 1 && b.height >= innerHeight - 1; })()`);
    check(`tela cheia: ${kind} cobre a janela`, ok && cover);
    await host.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.exitFullscreen?.().catch(() => {})`);
    check(`tela cheia: ${kind} sai com Esc`, await waitFor(host, `!${fsEl} && !document.querySelector('.fs-anc') && !document.querySelector('.studio').classList.contains('fs-wall')`, 3000));
  }
  // câmera remota: tela cheia e painel de ajustes (imagem / aparelhos)
  await cam.ev(`document.querySelector('#cam-set').click()`);
  check('câmera: painel de imagem abre', await cam.ev(`!document.querySelector('#cam-sheet').hidden && !!document.querySelector('#cam-sheet-body').children.length`));
  await cam.ev(`document.querySelector('[data-sheet="dev"]').click()`);
  check('câmera: aparelhos lista câmera e microfone', await waitFor(cam, `document.querySelector('#cd-video')?.options.length >= 2 && !!document.querySelector('#cd-audio')`, 3000));
  await cam.ev(`document.querySelector('#cam-sheet-x').click()`);
  check('câmera: painel fecha', await cam.ev(`document.querySelector('#cam-sheet').hidden`));
  // sair do modo: o programa volta para o palco
  await host.ev(`__castdeck.switcher.setMode(false)`);
  check('modo Estúdio: programa volta para a Cena', await host.ev(`__castdeck.S.take===null && __castdeck.comp.take===null && document.querySelector('#switcher').hidden`));
  check('modo Estúdio: FTB desligado e painel lateral aberto', await host.ev(`!__castdeck.comp.ftb?.on && !document.querySelector('.studio').classList.contains('side-mini')`));
  // câmera removida pelo host
  await host.ev(`__castdeck.switcher.setMode(true); __castdeck.switcher.cutTo('${camId}')`);
  check('câmera no ar antes de sair', await host.ev(`__castdeck.S.take==='${camId}'`));
  // sai para uma página segura: em about:blank não existe mediaDevices e a câmera falsa do teste geraria erro falso
  await cam.send('Page.navigate', { url: `${base}/` });
  check('câmera saiu: programa volta para a Cena', await waitFor(host, `!__castdeck.S.sources.has('${camId}') && __castdeck.S.take===null`, 15000));
  await host.ev(`__castdeck.switcher.setMode(false)`);

  check('sem erros JS no host', !host.errors.length, host.errors.join(' | '));
  check('sem erros JS na câmera', !cam.errors.length, cam.errors.join(' | '));
} catch (e) {
  console.error('FALHA', e.message);
  fails++;
} finally {
  for (const t of targets) await bsend('Target.closeTarget', { targetId: t }).catch(() => {});
  bws.close();
}
console.log(fails ? `\n${fails} falha(s)` : '\nTudo OK');
process.exit(fails ? 1 : 0);
