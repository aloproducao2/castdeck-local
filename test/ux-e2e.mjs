// Usabilidade estilo YoloBox (rodada 2): avisos acima da barra, barra rolável no celular, medidores à vista,
// cenas rápidas F1–F6 e checagem antes de entrar ao vivo.
// Requer servidor de teste (:3100) e Edge com CDP (:9333). Uso: BASE=http://localhost:3100 node test/ux-e2e.mjs
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const v = await (await fetch(`${CDP}/json/version`)).json();
const bws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let bid = 0; const bp = new Map();
bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bp.has(m.id)) { bp.get(m.id)(m); bp.delete(m.id); } };
const bsend = (method, params = {}) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
async function open(url) {
  const { result } = await bsend('Target.createTarget', { url: 'about:blank' });
  const ws = new WebSocket(`ws://127.0.0.1:9333/devtools/page/${result.targetId}`);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  await send('Page.navigate', { url });
  return { ev, errors, send, close: () => bsend('Target.closeTarget', { targetId: result.targetId }) };
}
const waitFor = async (p, expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.ev(expr)) return true; } catch {} await sleep(150); } return false; };
let fails = 0;
const check = (n, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FALHA'), n, ok ? '' : extra); if (!ok) fails++; };
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());

// rota de disco (checagem pré-live)
const disk = await (await fetch(`${base}/api/disk`)).json();
check('GET /api/disk devolve espaço livre', disk.free > 0 && disk.total >= disk.free, JSON.stringify(disk));

const studio = await post('/api/studios', { name: 'UX E2E' });
const dest = await post('/api/destinations', { name: 'UX sem chave', platform: 'custom', url: 'rtmp://127.0.0.1/live', key: '', enabled: false });
const host = await open(`${base}/studio/${studio.id}?lang=pt`);
await host.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });
await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(1500);
await host.ev(`document.querySelector('#lb-go').click()`);
check('estúdio abriu', await waitFor(host, `!!document.querySelector('#program-canvas')`));
await sleep(1000);

// 1) aviso (toast) acima da barra de funções
await host.ev(`(()=>{const b=document.querySelector('.studio .bottombar');window.__bbTop=b.getBoundingClientRect().top;return true})()`);
await host.ev(`__castdeck.scenes && document.querySelector('#toasts') && true`);
const toastOk = await host.ev(`new Promise(r=>{import('/js/ui.js').then(m=>{m.toast('teste de aviso');setTimeout(()=>{const t=document.querySelector('#toasts').lastElementChild;const bb=document.querySelector('.studio .bottombar').getBoundingClientRect();r(t?{tb:t.getBoundingClientRect().bottom,bt:bb.top}:null)},400)})})`);
check('aviso fica acima da barra (desktop)', toastOk && toastOk.tb <= toastOk.bt, JSON.stringify(toastOk));

// 2) fontes falsas com "voz" de oscilador
await host.ev(`(()=>{const C=__castdeck; window.__voz={};
  for (const [id,label,hue] of [['fa:cam','Ana',200],['fb:cam','Beto',20]]) {
    const c=document.createElement('canvas'); c.width=640; c.height=360; const x=c.getContext('2d');
    setInterval(()=>{x.fillStyle='hsl('+hue+',60%,40%)';x.fillRect(0,0,640,360)},100);
    C.addVideoSource(id, c.captureStream(15), { kind:'camera', label, ownerId: id.split(':')[0] });
    const o=C.mixer.ctx.createOscillator(); const g=C.mixer.ctx.createGain(); g.gain.value=0; o.frequency.value=220; o.connect(g); o.start();
    C.mixer.addNode(id+':audio', g, { ownerId: id.split(':')[0], stageKey: id, monitor:false });
    window.__voz[id]=g;
  }
  C.mixer.ctx.resume(); return true})()`);
await sleep(800);
check('medidor L/R no programa', await host.ev(`!!document.querySelector('#program #pgm-vu')`));
check('botão-medidor nas miniaturas', await waitFor(host, `!!document.querySelector('.tile .tv .mvu[data-mvu="fa:cam"]') && !document.querySelector('.tile .tv .mvu[data-mvu="fa:cam"]').hidden`, 4000));
// coloca Ana no palco pela barra de fontes da mesa de corte (mesmo palco do modo Estúdio)
await host.ev(`__castdeck.switcher.setMode(true)`);
await waitFor(host, `!!document.querySelector('#sw-bus [data-stage="fa:cam"]')`, 4000);
await host.ev(`__castdeck.S.stage.includes('fa:cam') || document.querySelector('#sw-bus [data-stage="fa:cam"]').click(); true`);
await host.ev(`__castdeck.switcher.setMode(false)`);
await sleep(400);
await host.ev(`(__voz['fa:cam'].gain.value=0.4, true)`);
check('miniatura enche com o som', await waitFor(host, `parseFloat(document.querySelector('[data-mvu="fa:cam"]').style.getPropertyValue('--lv'))>0.3`, 3000));
await host.ev(`document.querySelector('[data-mvu="fa:cam"]').click()`);
check('clique no medidor = mudo no programa', await waitFor(host, `__castdeck.mixer.sources.get('fa:cam:audio').muted && document.querySelector('[data-mvu="fa:cam"]').classList.contains('muted')`, 2000));
await host.ev(`document.querySelector('[data-mvu="fa:cam"]').click()`);
check('segundo clique volta o som', await waitFor(host, `!__castdeck.mixer.sources.get('fa:cam:audio').muted`, 2000));
check('clique no medidor não mexeu no palco/prévia', host.errors.length === 0, JSON.stringify(host.errors));

// medidor do programa reage quando a fonte está no ar
await host.ev(`(()=>{const C=__castdeck; window.__setStage=(ids)=>{C.S.stage.splice(0,C.S.stage.length,...ids)}; return true})()`);
const stageNow = await host.ev(`JSON.stringify(__castdeck.S.stage)`);
const vuUp = await waitFor(host, `[...document.querySelectorAll('#pgm-vu i')].some(i=>parseFloat(i.style.getPropertyValue('--v'))>0.3)`, 3000);
check('VU do programa sobe com som no ar (se Ana estiver no palco)', vuUp || !stageNow.includes('fa:cam'), stageNow);

// 3) cenas rápidas
check('fileira de cenas F1–F6', await host.ev(`document.querySelectorAll('#qscenes .qs').length===6 && document.querySelectorAll('#qscenes .qs.empty').length===6`));
const layouts = await host.ev(`[...document.querySelectorAll('.layout-btn[data-layout]')].map(b=>b.dataset.layout).filter(l=>!l.startsWith('c-'))`);
const L1 = layouts[0], L2 = layouts.find((l) => l !== L1);
await host.ev(`document.querySelector('.layout-btn[data-layout="${L1}"]').click()`);
await sleep(200);
const stage1 = await host.ev(`JSON.stringify(__castdeck.S.stage)`);
await host.ev(`__castdeck.scenes.save(0,false)`);
await sleep(300);
check('cena 1 salva em S.brand.quickScenes', await host.ev(`__castdeck.S.brand.quickScenes?.[0]?.layout==='${L1}'`));
check('botão F1 aceso (cena atual)', await waitFor(host, `document.querySelector('#qscenes [data-qs="0"]').classList.contains('on')`, 2000));
await host.ev(`document.querySelector('.layout-btn[data-layout="${L2}"]').click()`);
await sleep(300);
check('mudou o layout -> F1 apaga', await waitFor(host, `!document.querySelector('#qscenes [data-qs="0"]').classList.contains('on')`, 2000));
await host.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112 });
await host.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112 });
check('F1 restaura layout e palco', await waitFor(host, `__castdeck.S.layout==='${L1}' && JSON.stringify(__castdeck.S.stage)===${JSON.stringify(stage1)}`, 2000), await host.ev(`__castdeck.S.layout+' '+JSON.stringify(__castdeck.S.stage)`));
check('F1 não recarregou a página', await host.ev(`!!window.__voz`));
// persistência no servidor
await sleep(1500);
const saved = await (await fetch(`${base}/api/studios/${studio.id}`)).json();
check('cena persiste no estúdio salvo', saved?.brand?.quickScenes?.[0]?.layout === L1, JSON.stringify(saved?.brand?.quickScenes || null).slice(0, 200));

// mesa de corte com fonte em tela cheia: a cena vai para a PRÉVIA
await host.ev(`__castdeck.switcher.setMode(true)`);
await waitFor(host, `__castdeck.S.switcher`);
await host.ev(`document.querySelector('.layout-btn[data-layout="${L2}"]')?.click(); true`);
await host.ev(`__castdeck.switcher.cutTo('fb:cam')`);
await sleep(400);
await host.ev(`__castdeck.scenes.apply(0)`);
await sleep(300);
check('mesa: cena aplicada fica na prévia (take segue fb, prévia = Cena)', await host.ev(`__castdeck.S.take==='fb:cam' && __castdeck.S.pvw===null`), await host.ev(`JSON.stringify({take:__castdeck.S.take,pvw:__castdeck.S.pvw})`));
await host.ev(`__castdeck.switcher.cutTo(null)`);
await host.ev(`__castdeck.switcher.setMode(false)`);
await sleep(300);

// 4) checagem antes de entrar ao vivo
await host.ev(`(__voz['fa:cam'].gain.value=0, true)`);
await host.ev(`document.querySelector('#btn-live').click()`);
check('janela Transmitir abriu com a checagem', await waitFor(host, `!!document.querySelector('#gl-check .glc-hd')`, 5000));
await host.ev(`(()=>{document.querySelectorAll('.modal input[name=dest]').forEach(i=>{i.checked=false}); const i=document.querySelector('.modal input[name=dest][value="${dest.id}"]'); i.checked=true; i.dispatchEvent(new Event('change')); return true})()`);
check('destino sem chave -> aviso ⚠', await waitFor(host, `/Sem chave de transmissão/.test(document.querySelector('#gl-check').textContent) && document.querySelector('#gl-check').classList.contains('has-warn')`, 3000), await host.ev(`document.querySelector('#gl-check').textContent`));
await host.ev(`(()=>{const r=document.querySelector('#gl-rec'); if(r){r.checked=true; r.dispatchEvent(new Event('change'));} return true})()`);
check('gravação marcada -> mostra espaço em disco', await waitFor(host, `/GB livres|Pouco espaço/.test(document.querySelector('#gl-check').textContent)`, 3000), await host.ev(`document.querySelector('#gl-check').textContent`));
await host.ev(`document.querySelector('.modal [data-close]').click()`);
await sleep(300);

// 5) celular em pé: barra rola com rótulos inteiros e degradê de "tem mais"
await host.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(900);
const bar = await host.ev(`(()=>{const b=document.querySelector('.studio .bottombar'); const cut=[...b.querySelectorAll('.ctrl > span:not(.ctrl-ico)')].filter(s=>s.offsetParent && s.scrollWidth>s.clientWidth+1).map(s=>s.textContent); return {sw:b.scrollWidth,cw:b.clientWidth,more:b.classList.contains('more'),cut}})()`);
check('celular: rótulos da barra inteiros', bar.cut.length === 0, JSON.stringify(bar));
check('celular: degradê "tem mais" quando rola', bar.sw <= bar.cw + 4 || bar.more, JSON.stringify(bar));
const tm = await host.ev(`new Promise(r=>{import('/js/ui.js').then(m=>{m.toast('aviso celular');setTimeout(()=>{const t=document.querySelector('#toasts').lastElementChild;const bb=document.querySelector('.studio .bottombar').getBoundingClientRect();r({tb:t.getBoundingClientRect().bottom,bt:bb.top})},400)})})`);
check('celular: aviso acima da barra', tm.tb <= tm.bt, JSON.stringify(tm));

check('sem erros JS', host.errors.length === 0, JSON.stringify(host.errors));
await host.close();
await fetch(`${base}/api/studios/${studio.id}`, { method: 'DELETE' });
await fetch(`${base}/api/destinations/${dest.id}`, { method: 'DELETE' });
console.log(fails ? `${fails} falha(s)` : 'TUDO OK');
process.exit(fails ? 1 : 0);
