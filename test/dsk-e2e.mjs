// Valida o DSK 1 e 2 (camadas por cima do programa) no Edge real via CDP :9333.
//   node server/index.js   +   msedge --remote-debugging-port=9333 --use-fake-ui-for-media-stream
//   BASE=http://localhost:3000 node test/dsk-e2e.mjs
// Confere: página web com fundo transparente vira quadros PNG com alfa (servidor abre um Edge/Chrome sem janela),
// o DSK aparece no programa só onde a página tem pixels, fade de entrada/saída, fonte do CastDeck com mesclagem
// screen/luma, e que tudo continua igual na mesa de corte (corte de câmera não tira o DSK) e no retorno do convidado.
import http from 'node:http';

const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// página de teste: fundo transparente, quadrado vermelho no quarto superior esquerdo e um contador animado
// (o screencast só manda quadro quando a página muda); campo de texto no quarto inferior esquerdo (modo interativo:
// o que for digitado volta por /typed) e um tom de 440 Hz (som da página no programa)
const PAGE = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}
#b{position:fixed;left:0;top:0;width:50vw;height:50vh;background:rgb(255,0,0)}#t{position:fixed;right:10px;bottom:10px;width:8px;height:8px;background:rgba(0,0,0,.01)}
#in{position:fixed;left:5vw;top:62vh;width:30vw;height:10vh;font-size:4vh;border:0;background:#fff}</style></head>
<body><div id="b"></div><div id="t"></div><input id="in"><script>let k=0;setInterval(()=>{document.getElementById('t').style.opacity=(k++%2?1:.5)},100);
const i=document.getElementById('in');i.addEventListener('input',()=>fetch('/typed?v='+encodeURIComponent(i.value)));i.addEventListener('mousedown',()=>fetch('/clicked'));
try{const c=new AudioContext();const o=c.createOscillator();const g=c.createGain();g.gain.value=.3;o.frequency.value=440;o.connect(g).connect(c.destination);o.start();}catch(e){}</script></body></html>`;
let typed = '';
let clicked = 0;
const pageSrv = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/typed') typed = u.searchParams.get('v') || '';
  if (u.pathname === '/clicked') clicked++;
  res.writeHead(200, { 'Content-Type': 'text/html' }).end(u.pathname === '/' ? PAGE : '');
});
await new Promise((r) => pageSrv.listen(3199, '127.0.0.1', r));
const PAGE_URL = 'http://127.0.0.1:3199/';

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
// câmera falsa: azul uniforme com uma faixa branca (bom para testar screen e luma)
const MOCKJS = `(()=>{const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 const cam=()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;const x=c.getContext('2d');let k=0;setInterval(()=>{x.fillStyle='rgb(0,0,40)';x.fillRect(0,0,1280,720);x.fillStyle='#fff';x.fillRect(0,300,1280,120);x.fillStyle='rgb(0,0,'+(40+(k++%2))+')';x.fillRect(0,0,4,4)},33);return c.captureStream(30).getVideoTracks()[0]};
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
// pixel do programa em coordenadas relativas (0..1)
const px = (fx, fy, sel = '#program-canvas') => `(()=>{const c=document.querySelector('${sel}');const d=c.getContext('2d').getImageData(Math.floor(c.width*${fx}),Math.floor(c.height*${fy}),1,1).data;return [d[0],d[1],d[2]]})()`;
const isRed = (p) => p[0] > 200 && p[1] < 60 && p[2] < 60;

let studio;
const assetUrls = [];
try {
  studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'DSK E2E' }) })).json();
  const info = await (await fetch(base + '/api/dsk')).json();
  check('servidor achou um navegador para o DSK', info.available, JSON.stringify(info));

  const host = await open(`${base}/studio/${studio.id}?lang=pt`);
  await waitFor(host, `!!document.querySelector('#lb-go')`);
  await host.ev(`localStorage.removeItem('castdeck.switcher')`);
  await host.send('Page.reload');
  check('lobby host', await waitFor(host, `!!document.querySelector('#lb-go')`));
  await sleep(1200);
  const enter = `(()=>{if(window.__castdeck)return true;const n=document.querySelector('#lb-name');if(n&&!n.value){n.value='Host DSK';n.dispatchEvent(new Event('input',{bubbles:true}))}const b=document.querySelector('#lb-go');if(b&&!b.disabled)b.click();return false})()`;
  await waitFor(host, enter, 30000);
  check('estudio abriu', await waitFor(host, `!!window.__castdeck?.dsk && !!document.querySelector('#program-canvas')`), await host.ev(`document.body.innerText.slice(0,200)`));
  check('botões DSK 1 e 2 na barra', await waitFor(host, `!!document.querySelector('#dsk-btn-1') && !!document.querySelector('#dsk-btn-2')`));
  check('sem erros JS ao abrir', host.errors.length === 0, host.errors.join(' | '));

  // ---------- DSK 1: endereço web ----------
  await host.ev(`__castdeck.dsk.setConfig(0, { src: 'url', url: '${PAGE_URL}', blend: 'normal', opacity: 100, fadeMs: 400, pos: 'full' })`);
  check('página carregou no navegador sem janela', await waitFor(host, `__castdeck.dsk.status(0)?.ready === true`, 30000), JSON.stringify(await host.ev(`__castdeck.dsk.status(0)`)));
  const before = await host.ev(px(0.25, 0.25));
  check('antes de ligar: programa sem o vermelho', !isRed(before), JSON.stringify(before));
  await host.ev(`__castdeck.dsk.toggle(0)`);
  await sleep(150);
  const mid = await host.ev(`__castdeck.dsk.level(0)`);
  check('fade de entrada em andamento', mid > 0 && mid < 1, String(mid));
  check('DSK 1 no ar: vermelho onde a página tem pixels', await waitFor(host, `(()=>{const p=${px(0.25, 0.25)};return p[0]>200&&p[1]<60&&p[2]<60})()`, 8000), JSON.stringify(await host.ev(px(0.25, 0.25))));
  const clear = await host.ev(px(0.75, 0.75));
  check('fundo transparente da página não cobre o programa', !isRed(clear) && clear.join() !== '0,0,0', JSON.stringify(clear));
  check('botão DSK 1 aceso', await host.ev(`document.querySelector('#dsk-btn-1').classList.contains('onair')`));
  // som da página: captura da aba no navegador sem janela → PCM pelo /dsk → canal dsk:1 do mixer
  check('som da página chega ao mixer (canal dsk:1)', await waitFor(host, `__castdeck.mixer.sources.has('dsk:1') && __castdeck.mixer.level('dsk:1') > 0.02`, 15000), JSON.stringify(await host.ev(`({has:__castdeck.mixer.sources.has('dsk:1'),lv:__castdeck.mixer.level('dsk:1'),st:__castdeck.dsk.status(0),ctx:__castdeck.mixer.ctx.state})`)));
  check('status informa "com som"', await waitFor(host, `__castdeck.dsk.status(0)?.audio === true`, 6000));
  // canto inferior direito: a página é redimensionada para a área e vermelho continua no quarto superior esquerdo dela
  await host.ev(`__castdeck.dsk.setConfig(0, { pos: 'br' })`);
  check('posição canto inferior direito', await waitFor(host, `(()=>{const p=${px(0.675 + 0.3 * 0.25, 0.66 + 0.3 * 0.25)};const q=${px(0.25, 0.25)};return p[0]>200&&p[1]<60&&!(q[0]>200&&q[1]<60)})()`, 12000));
  await host.ev(`__castdeck.dsk.setConfig(0, { pos: 'full' })`);
  // voltar para tela cheia recarrega a página no tamanho novo: espera o vermelho voltar antes de medir a opacidade
  check('volta para tela cheia', await waitFor(host, `(()=>{const p=${px(0.25, 0.25)};return p[0]>200&&p[1]<60})()`, 20000));
  // opacidade 50%: vermelho mistura com o fundo
  await host.ev(`__castdeck.dsk.setConfig(0, { opacity: 50 })`);
  await sleep(200);
  const half = await host.ev(px(0.25, 0.25));
  check('opacidade 50%', half[0] > 90 && half[0] < 200, JSON.stringify(half));
  await host.ev(`__castdeck.dsk.setConfig(0, { opacity: 100 })`);
  // corte: metade esquerda cortada → o vermelho (quarto superior esquerdo da página) some, nada se mexe de lugar
  await host.ev(`__castdeck.dsk.setConfig(0, { crop: { l: 0.5, t: 0, r: 0, b: 0, fill: false } })`);
  await sleep(200);
  check('corte à esquerda tira o vermelho', !isRed(await host.ev(px(0.25, 0.25))), JSON.stringify(await host.ev(px(0.25, 0.25))));
  // só o quarto superior esquerdo, ampliado: o vermelho ocupa a área inteira
  await host.ev(`__castdeck.dsk.setConfig(0, { crop: { l: 0, t: 0, r: 0.5, b: 0.5, fill: true } })`);
  await sleep(200);
  check('recorte ampliado preenche a área', isRed(await host.ev(px(0.75, 0.75))) && isRed(await host.ev(px(0.1, 0.9))), JSON.stringify(await host.ev(px(0.75, 0.75))));
  await host.ev(`__castdeck.dsk.setConfig(0, { crop: { l: 0, t: 0, r: 0, b: 0, fill: false } })`);
  await sleep(200);
  check('sem corte: vermelho de volta', isRed(await host.ev(px(0.25, 0.25))) && !isRed(await host.ev(px(0.75, 0.75))));

  // retorno do convidado e prévia usam o mesmo bus
  check('GuestView/PreviewView recebem o DSK', await host.ev(`(()=>{const c=__castdeck.comp;return !!c.dsk && typeof c.dsk.draw==='function'})()`));

  // ---------- mesa de corte: DSK continua no ar depois de cortes ----------
  await host.ev(`localStorage.removeItem('castdeck.sideMini'); document.querySelector('#btn-switcher').click()`);
  check('mesa de corte ligada', await waitFor(host, `__castdeck.S.switcher === true`));
  check('barra DSK visível na mesa de corte', await host.ev(`(()=>{const b=document.querySelector('#dsk-btn-1');if(!b)return false;const r=b.getBoundingClientRect();return r.width>0&&r.height>0})()`));
  await host.ev(`__castdeck.switcher.cutTo('host:cam')`);
  await sleep(500);
  check('DSK continua no ar após corte (mesa)', isRed(await host.ev(px(0.25, 0.25))));
  check('prévia da mesa mostra o DSK', await waitFor(host, `(()=>{const c=document.querySelector('#sw-pvw-canvas, .sw-pvw canvas, #pvw-canvas');if(!c)return 'sem-canvas';const d=c.getContext('2d').getImageData(Math.floor(c.width*.25),Math.floor(c.height*.25),1,1).data;return d[0]>200&&d[1]<60})()`, 5000));

  // ---------- DSK 2: fonte do CastDeck (câmera) com luma key no canto ----------
  await host.ev(`__castdeck.dsk.setConfig(1, { src: 'source', sourceId: 'host:cam', blend: 'luma', luma: { lo: 0.5, soft: 0.05, invert: false }, pos: 'custom', rect: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, fadeMs: 0 })`);
  const pre2 = await host.ev(px(0.75, 0.5 + 0.5 * (360 / 720)));
  await host.ev(`__castdeck.dsk.toggle(1)`);
  await sleep(400);
  // faixa branca da câmera (y 300..420 de 720) aparece; o azul escuro some pelo luma key
  const band = await host.ev(px(0.75, 0.5 + 0.5 * (360 / 720)));
  const dark = await host.ev(px(0.75, 0.5 + 0.5 * (100 / 720)));
  check('DSK 2 luma: faixa branca entrou', band[0] > 220 && band[1] > 220 && band[2] > 220, JSON.stringify({ pre2, band }));
  check('DSK 2 luma: escuro recortado (programa aparece)', !(dark[0] < 5 && dark[1] < 5 && dark[2] > 30 && dark[2] < 50), JSON.stringify(dark));
  check('botão DSK 2 aceso', await host.ev(`document.querySelector('#dsk-btn-2').classList.contains('onair')`));
  // modo screen: azul escuro clareia pouco o fundo, branco fica branco
  await host.ev(`__castdeck.dsk.setConfig(1, { blend: 'screen' })`);
  await sleep(300);
  const scr = await host.ev(px(0.75, 0.5 + 0.5 * (360 / 720)));
  check('DSK 2 screen: branco continua branco', scr[0] > 220 && scr[1] > 220, JSON.stringify(scr));
  // corte seco para sair (Shift+clique no botão)
  await host.ev(`document.querySelector('#dsk-btn-2').dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}))`);
  check('Shift+clique: corte seco', (await host.ev(`__castdeck.dsk.level(1)`)) === 0);

  // ---------- DSK 2: galeria de imagens (sem navegador/screencast) ----------
  const makePng = async (color) => Buffer.from(await host.ev(`(()=>{const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.fillStyle='${color}';x.fillRect(0,0,320,180);return c.toDataURL('image/png').split(',')[1]})()`), 'base64');
  const uploadPng = async (buf, name) => {
    const r = await fetch(`${base}/api/dsk/assets?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: buf });
    if (!r.ok) throw new Error(`upload ${name}: ${r.status} ${await r.text()}`);
    return r.json();
  };
  const redImg = await uploadPng(await makePng('#ff0000'), 'vermelho.png');
  const greenImg = await uploadPng(await makePng('#00ff00'), 'verde.png');
  assetUrls.push(redImg.url, greenImg.url);
  check('upload de imagem do overlay criou URL', /^\/api\/dsk\/assets\//.test(redImg.url), JSON.stringify(redImg));
  const badUpload = await fetch(`${base}/api/dsk/assets?name=fake.png`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: Buffer.from('not really a png') });
  check('upload rejeita arquivo que não é imagem', badUpload.status === 415, String(badUpload.status));
  await host.ev(`__castdeck.dsk.setConfig(1, { src: 'images', images: ${JSON.stringify([
    { id: redImg.id, name: 'Vermelho', url: redImg.url },
    { id: greenImg.id, name: 'Verde', url: greenImg.url },
  ])}, imgIndex: 0, blend: 'normal', opacity: 100, fadeMs: 0, pos: 'full', imgAuto: false })`);
  await host.ev(`__castdeck.dsk.toggle(1, { cut: true })`);
  check('DSK 2 imagem: vermelho no programa', await waitFor(host, `(()=>{const p=${px(0.5, 0.5)};return p[0]>200&&p[1]<60&&p[2]<60})()`, 5000), JSON.stringify(await host.ev(px(0.5, 0.5))));
  check('botão 🖼 aparece no deck', await host.ev(`!!document.querySelector('.deck .dsk-img')`));
  await host.ev(`document.querySelector('.deck .dsk-img').click()`);
  check('troca de imagem ao vivo (verde)', await waitFor(host, `(()=>{const p=${px(0.5, 0.5)};return p[1]>200&&p[0]<60&&p[2]<60})()`, 5000), JSON.stringify(await host.ev(px(0.5, 0.5))));
  await sleep(900);
  const savedImg = await (await fetch(`${base}/api/studios/${studio.id}`)).json();
  check('galeria de imagens salva no estúdio', savedImg.brand?.dsk?.[1]?.images?.length === 2 && savedImg.brand.dsk[1].imgIndex === 1);
  // imagem não abre navegador sem janela: nenhum slot para o DSK 2
  const dskInfo = await (await fetch(base + '/api/dsk')).json();
  check('modo imagem não cria processo/slot de navegador', !(dskInfo.slots || []).some((s) => s.key === `${studio.id}-2`), JSON.stringify(dskInfo.slots));
  // carrossel automático
  await host.ev(`__castdeck.dsk.setConfig(1, { imgAuto: true, imgAutoMs: 2000 })`);
  check('carrossel automático troca a imagem', await waitFor(host, `__castdeck.S.brand.dsk[1].imgIndex === 0`, 6000), String(await host.ev(`__castdeck.S.brand.dsk[1].imgIndex`)));
  await host.ev(`__castdeck.dsk.setConfig(1, { imgAuto: false })`);
  await host.ev(`__castdeck.dsk.toggle(1, { cut: true })`);

  // ---------- saída com fade ----------
  await host.ev(`__castdeck.dsk.setConfig(0, { fadeMs: 1000 })`);
  await host.ev(`__castdeck.dsk.toggle(0)`);
  await sleep(300);
  const out = await host.ev(`__castdeck.dsk.level(0)`);
  check('fade de saída em andamento', out > 0 && out < 1, String(out));
  check('DSK 1 saiu do programa', await waitFor(host, `(()=>{const p=${px(0.25, 0.25)};return !(p[0]>200&&p[1]<60&&p[2]<60)})()`, 4000));
  check('fora do ar: som da página fechado', await waitFor(host, `__castdeck.mixer.level('dsk:1') < 0.005`, 4000), String(await host.ev(`__castdeck.mixer.level('dsk:1')`)));

  // configuração salva no estúdio, mas estar no ar não
  await sleep(1200);
  const saved = await (await fetch(`${base}/api/studios/${studio.id}`)).json();
  check('config do DSK salva no estúdio', saved.brand?.dsk?.[0]?.url === PAGE_URL && saved.brand?.dsk?.[1]?.sourceId === 'host:cam', JSON.stringify(saved.brand?.dsk));
  check('estado "no ar" não é salvo', !('on' in (saved.brand?.dsk?.[0] || {})));

  // janela de configuração abre e fecha sem erro
  await host.ev(`__castdeck.switcher.setMode(false)`);
  await sleep(300);
  await host.ev(`document.querySelector('#dsk-cfg').click()`);
  check('janela de configuração abriu', await waitFor(host, `!!document.querySelector('.dsk-modal .dsk-pv')`, 3000));
  await sleep(500);
  // teclas de verdade (CDP), como o usuário digitando
  const key = async (k, extra = {}) => {
    const text = k.length === 1 ? k : k === 'Enter' ? '\r' : undefined;
    const code = k.length === 1 ? 'Key' + k.toUpperCase() : k;
    const kc = k.length === 1 ? k.toUpperCase().charCodeAt(0) : { Enter: 13, Backspace: 8 }[k] || 0;
    await host.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k, code, text, windowsVirtualKeyCode: kc, ...extra });
    await host.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: kc, ...extra });
  };
  const click = async (x, y) => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await host.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  };
  const center = (sel) => host.ev(`(()=>{const e=document.querySelector('${sel}');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
  // campo de endereço aceita digitação (antes a tecla era cancelada pelo onkeydown)
  await host.ev(`(()=>{const i=document.querySelector('#dsk-url');i.focus();i.setSelectionRange(i.value.length,i.value.length)})()`);
  for (const ch of 'xyz') await key(ch);
  check('campo de URL aceita digitação', await host.ev(`document.querySelector('#dsk-url').value.endsWith('xyz')`), await host.ev(`document.querySelector('#dsk-url').value`));
  for (let n = 0; n < 3; n++) await key('Backspace');
  check('Backspace no campo de URL', (await host.ev(`document.querySelector('#dsk-url').value`)) === PAGE_URL);

  // modo interativo: clique no campo da página (pela prévia) e digitação chegam ao navegador sem janela
  await click(...(await center('#dsk-interact')));
  check('modo interativo ligado', await host.ev(`document.querySelector('.dsk-pvwrap').classList.contains('interact')`));
  // campo da página: left 5vw..35vw, top 62vh..72vh da página (DSK em tela cheia)
  const pvPt = await host.ev(`(()=>{const r=document.querySelector('.dsk-pv').getBoundingClientRect();return [r.left+r.width*0.2,r.top+r.height*0.67]})()`);
  await click(...pvPt);
  check('clique chegou à página', await (async () => { for (let n = 0; n < 20 && !clicked; n++) await sleep(150); return clicked > 0; })(), String(clicked));
  for (const ch of 'ola') await key(ch);
  await key('A', { modifiers: 8, text: 'A' });
  check('digitação chegou à página', await (async () => { for (let n = 0; n < 20 && typed !== 'olaA'; n++) await sleep(150); return typed === 'olaA'; })(), JSON.stringify(typed));
  check('modal continua aberto (teclas não vazam para o estúdio)', await host.ev(`!!document.querySelector('.dsk-modal')`));

  // corte com Alt + arrastar a borda esquerda da prévia até 30% (sai do modo interativo antes)
  await click(...(await center('#dsk-interact')));
  const pvb = await host.ev(`(()=>{const r=document.querySelector('.dsk-pv').getBoundingClientRect();return [r.left,r.top,r.width,r.height]})()`);
  const [bx, by, bw, bh] = pvb;
  await host.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bx + 3, y: by + bh / 2, modifiers: 1 });
  await host.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bx + 3, y: by + bh / 2, button: 'left', buttons: 1, clickCount: 1, modifiers: 1 });
  for (let n = 1; n <= 6; n++) await host.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bx + 3 + ((bw * 0.3 - 3) * n) / 6, y: by + bh / 2, button: 'left', buttons: 1, modifiers: 1 });
  await host.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx + bw * 0.3, y: by + bh / 2, button: 'left', buttons: 0, clickCount: 1, modifiers: 1 });
  const cl = await host.ev(`__castdeck.S.brand.dsk[0].crop.l`);
  check('Alt+arrastar corta a esquerda (~30%)', Math.abs(cl - 0.3) < 0.03, String(cl));
  check('seção Cortar mostra o valor', await host.ev(`document.querySelector('#dsk-crop').open && document.querySelector('[data-v="dsk-cl"]').textContent.startsWith('3')`), await host.ev(`document.querySelector('#dsk-crop-sum').textContent`));
  await click(...(await center('#dsk-creset')));
  check('Zerar tira o corte', (await host.ev(`__castdeck.S.brand.dsk[0].crop.l`)) === 0);

  // tela cheia da prévia (gesto real) e volta sem fechar a janela.
  // O CDP exige a página ativa para conceder fullscreen; a janela pode ter perdido o foco nos cliques anteriores.
  await host.send('Page.bringToFront');
  await sleep(300);
  await click(...(await center('#dsk-fs')));
  // o gesto pode cair durante um redesenho da janela: tenta mais uma vez antes de reprovar
  if (!(await waitFor(host, `document.fullscreenElement?.classList.contains('dsk-pvwrap')`, 1500))) await click(...(await center('#dsk-fs')));
  check('prévia em tela cheia', await waitFor(host, `document.fullscreenElement?.classList.contains('dsk-pvwrap')`, 3000));
  check('canvas cresce na tela cheia', await waitFor(host, `document.querySelector('.dsk-pv').width > 480`, 3000), String(await host.ev(`document.querySelector('.dsk-pv').width`)));
  if (await host.ev(`!!document.fullscreenElement`)) await host.ev(`document.exitFullscreen().catch(()=>{})`);
  check('saiu da tela cheia com a janela aberta', await waitFor(host, `!document.fullscreenElement && !!document.querySelector('.dsk-modal .dsk-pvwrap')`, 3000));
  // saída vertical: aba própria, posição e corte independentes do horizontal
  await click(...(await center('[data-fmt="v"]')));
  check('aba Vertical: prévia 9:16', await waitFor(host, `document.querySelector('.dsk-pvbox.vert') && document.querySelector('.dsk-pv').width === 270`, 2000));
  await click(...(await center('#dsk-von')));
  check('marcar "mostrar no vertical"', (await host.ev(`__castdeck.S.brand.dsk[0].vert.on`)) === true);
  await host.ev(`(()=>{const s=document.querySelector('#dsk-pos');s.value='br';s.dispatchEvent(new Event('change'))})()`);
  await host.ev(`(()=>{const s=document.querySelector('#dsk-cl');s.value=20;s.dispatchEvent(new Event('input'));s.dispatchEvent(new Event('change'))})()`);
  const geo = await host.ev(`JSON.stringify((d=>({vp:d.vert.pos,vl:d.vert.crop.l,hp:d.pos,hl:d.crop.l}))(__castdeck.S.brand.dsk[0]))`);
  check('vertical com posição/corte próprios (horizontal intacto)', geo === JSON.stringify({ vp: 'br', vl: 0.2, hp: 'full', hl: 0 }), geo);
  // a saída vertical desenha o DSK só quando marcado
  const vdiff = await host.ev(`(async()=>{
    const m = await import('/js/studio/compositor.js');
    const dsk = __castdeck.dsk;
    dsk.toggle(0, { on: true, cut: true });
    await new Promise(r=>setTimeout(r,300));
    const v = new m.VerticalView(__castdeck.comp, { width: 180, height: 320 });
    const shot = () => { v.render(); const c=v.canvas.getContext('2d').getImageData(90,180,90,140).data; let s=0; for(let i=0;i<c.length;i+=16) s+=c[i]+c[i+1]+c[i+2]; return s; };
    const a = shot();
    __castdeck.S.brand.dsk[0].vert.on = false;
    const b = shot();
    __castdeck.S.brand.dsk[0].vert.on = true;
    dsk.toggle(0, { on: false, cut: true });
    v.close?.();
    return a !== b;
  })()`);
  check('saída vertical mostra o DSK marcado', vdiff === true);
  await click(...(await center('[data-fmt="h"]')));
  check('volta para o horizontal (16:9)', await waitFor(host, `!document.querySelector('.dsk-pvbox.vert') && document.querySelector('.dsk-pv').width === 480`, 2000));

  // desligar: página fechada no servidor (não gasta recursos); ligar reabre
  await click(...(await center('.dsk-power')));
  check('desligar marca power=false', (await host.ev(`__castdeck.S.brand.dsk[0].power`)) === false);
  check('desligado: servidor sem página do DSK', await waitFor(host, `fetch('/api/dsk').then(r=>r.json()).then(j=>!j.slots.length && !j.running)`, 8000));
  check('botão da barra mostra desligado', await host.ev(`document.querySelector('#dsk-btn-1').classList.contains('off')`));
  await click(...(await center('.dsk-power')));
  check('ligar reabre a página', await waitFor(host, `fetch('/api/dsk').then(r=>r.json()).then(j=>j.slots.length===1 && j.slots[0].ready)`, 15000));

  check('janela tem ✕ no topo', await host.ev(`!!document.querySelector('.dsk-modal')?.parentElement.querySelector(':scope > .modal-x')`));
  await host.ev(`document.querySelector('.modal-x').click()`);
  check('✕ fecha a janela do DSK', await waitFor(host, `!document.querySelector('.dsk-modal')`, 2000));
  // ✕ salva: na caixa de texto, fechar pelo ✕ devolve o valor digitado (igual a Salvar); no confirmar, só fecha
  const xs = await host.ev(`(async()=>{const u=await import('/js/ui.js');const p=u.promptDialog('Nome','abc');document.querySelector('[data-prompt-input]').value='novo';document.querySelector('.modal-x').click();const c=u.confirmDialog('Apagar?');document.querySelector('.modal-x').click();return JSON.stringify([await p, await c])})()`);
  check('✕ salva no formulário e não confirma no "confirmar"', xs === JSON.stringify(['novo', false]), xs);
  // ruído conhecido de extensão do Edge ("Could not establish connection...") não é erro do CastDeck
  const jsErrors = host.errors.filter((e) => !/Could not establish connection|Receiving end does not exist/i.test(e));
  check('sem erros JS', jsErrors.length === 0, jsErrors.join(' | '));

  await host.ev(`__castdeck.switcher.setMode(false)`);
} catch (e) {
  console.error(e);
  fails++;
} finally {
  for (const t of targets) await bsend('Target.closeTarget', { targetId: t }).catch(() => {});
  if (studio) await fetch(`${base}/api/studios/${studio.id}`, { method: 'DELETE' }).catch(() => {});
  await fetch(`${base}/api/dsk/${studio?.id}-1`, { method: 'DELETE' }).catch(() => {});
  for (const u of assetUrls) await fetch(base + u, { method: 'DELETE' }).catch(() => {});
  pageSrv.close();
  bws.close();
  console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo');
  process.exit(fails ? 1 : 0);
}
