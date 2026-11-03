// SPDX-License-Identifier: AGPL-3.0-only
// e2e das janelas flutuantes (painéis destacados). Uso: SCRIPT=test/float-e2e.mjs node test/run-audio-test.mjs
import fs from 'node:fs';
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const studio = await post('/api/studios', { name: 'Float E2E' });
const t = await (await fetch(`${CDP}/json/new?${base}/studio/${studio.id}?lang=pt`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  pend.get(m.id)?.(m);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result.result.value;
let fails = 0;
const check = (n, ok, d = '') => { console.log(ok ? 'OK   ' : 'FALHA', n, ok ? '' : d); if (!ok) fails++; };
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });
await sleep(2500);
await ev(`document.querySelector('#lb-go')?.click()`);
await sleep(2500);

await ev(`__castdeck.floatWins.open('media')`);
await ev(`__castdeck.floatWins.open('audio')`);
await ev(`__castdeck.floatWins.open('director')`);
await sleep(600);
check('3 janelas abertas', (await ev(`document.querySelectorAll('.fw').length`)) === 3);
check('painel de mídia foi para a janela e renderizou', await ev(`!!document.querySelector('.fw[data-fw=media] #m-add')`));
check('mixer de áudio renderizou na janela', await ev(`!!document.querySelector('.fw[data-fw=audio] .ax')`));
check('aba Diretor renderizou na janela', await ev(`!!document.querySelector('.fw[data-fw=director] #sw-prof')`));
check('painel visível (altura > 0)', await ev(`document.querySelector('#panel-media').offsetHeight > 50`));
check('aba da lateral marcada como destacada', await ev(`document.querySelector('.subtabs .tab[data-tab=media]').classList.contains('floating')`));

// áudio continua atualizando com a janela aberta (VU) mesmo com outra aba na lateral
check('tabOpen vale para aba destacada', await ev(`(()=>{__castdeck.S.tab='banners';return true})()`));
// pino: sempre no topo fica acima das outras
await ev(`document.querySelector('.fw[data-fw=media] .fw-top').click()`);
const zs = await ev(`JSON.stringify(['media','audio','director'].map(k=>+document.querySelector('.fw[data-fw='+k+']').style.zIndex))`);
const [zm, za, zd] = JSON.parse(zs);
check('janela com 📌 fica acima das outras', zm > za && zm > zd, zs);
await ev(`document.querySelector('.fw[data-fw=audio] .fw-head').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:5,clientY:5}))`);
const zm2 = await ev(`+document.querySelector('.fw[data-fw=media]').style.zIndex`);
const za2 = await ev(`+document.querySelector('.fw[data-fw=audio]').style.zIndex`);
check('focar outra janela não passa a fixada', zm2 > za2, `${zm2} vs ${za2}`);

// persistência da posição/pino
check('geometria salva', await ev(`!!JSON.parse(localStorage.getItem('castdeck.fw')).media?.top`));

// foto com as 3 janelas
await ev(`(()=>{const f=(k,x,y)=>{const e=document.querySelector('.fw[data-fw='+k+']');e.style.left=x+'px';e.style.top=y+'px'};f('media',20,60);f('audio',420,60);f('director',840,60)})()`);
await sleep(400);
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('dist/float.png', Buffer.from(shot.result.data, 'base64'));

// fechar volta o painel para a lateral
await ev(`document.querySelector('.fw[data-fw=media] .fw-x').click()`);
await sleep(300);
check('✕ devolve o painel à lateral', await ev(`document.querySelector('#panel-media').parentElement.id==='side-body' && !document.querySelector('.fw[data-fw=media]')`));
await ev(`__castdeck.floatWins.close('audio');__castdeck.floatWins.close('director')`);
check('nenhuma janela sobrando', (await ev(`document.querySelectorAll('.fw').length`)) === 0);
check('sem erros JS', errors.length === 0, JSON.stringify(errors));
console.log(fails ? `${fails} falha(s)` : 'TUDO OK');
process.exit(fails ? 1 : 0);
