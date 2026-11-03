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
import { parseFeed } from '../server/feeds.js';
// ---------- parser (unitário) ----------
const rss = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Meu &amp; Site</title><item><title><![CDATA[Governo anuncia <b>medida</b> &amp; reforma]]></title><link>https://x/1</link><pubDate>Wed, 14 Oct 2026 10:00:00 GMT</pubDate></item><item><title>Segunda &#233;poca &#x2014; teste &quot;aspas&quot;</title><link>https://x/2</link></item></channel></rss>`;
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom News</title><entry><title type="html">Manchete &lt;i&gt;Atom&lt;/i&gt;</title><link href="https://a/1"/><updated>2026-10-14T10:00:00Z</updated></entry></feed>`;
const rdf = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"><channel><title>RDF</title></channel><item><title>Item RDF</title><link>https://r/1</link></item></rdf:RDF>`;
const p1 = parseFeed(rss), p2 = parseFeed(atom), p3 = parseFeed(rdf);
check('parser RSS: titulo do canal e entidades', p1.title === 'Meu & Site' && p1.items.length === 2, JSON.stringify(p1));
check('parser RSS: CDATA/HTML removido e &amp; decodificado', p1.items[0].title === 'Governo anuncia medida & reforma', p1.items[0].title);
check('parser RSS: entidades numericas e aspas', p1.items[1].title === 'Segunda época — teste "aspas"', p1.items[1].title);
check('parser Atom: link por href e titulo', p2.items[0].link === 'https://a/1' && p2.items[0].title === 'Manchete Atom', JSON.stringify(p2));
check('parser RDF funciona', p3.items[0]?.title === 'Item RDF', JSON.stringify(p3));
let bad = null; try { parseFeed('<html><body>oi</body></html>'); } catch (e) { bad = e.message; }
check('parser rejeita HTML que nao e feed', !!bad, bad);

// ---------- API ----------
const rssLocal = await fetch(base + '/api/rss?u=' + encodeURIComponent('http://127.0.0.1:3000/'));
check('/api/rss bloqueia endereço privado (SSRF)', rssLocal.status === 400, String(rssLocal.status));
check('/api/rss rejeita protocolo file:', (await fetch(base + '/api/rss?u=' + encodeURIComponent('file:///etc/passwd'))).status === 400);
const live = await fetch(base + '/api/rss?u=' + encodeURIComponent('https://feeds.bbci.co.uk/portuguese/rss.xml'));
const liveJ = await live.json().catch(() => ({}));
check('/api/rss le feed real (BBC Brasil)', live.ok && liveJ.items?.length > 3, live.status + ' ' + (liveJ.items?.length ?? liveJ.error));
const disc = await (await fetch(base + '/api/rss?u=' + encodeURIComponent('https://techcrunch.com/'))).json(); check('autodescoberta do feed a partir da pagina do site (TechCrunch)', disc.items?.length > 3 && /feed/.test(disc.url), disc.url + ' ' + (disc.items?.length ?? disc.error));

// ---------- UI ----------
const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'NEWS' }) })).json();
const host = await openPage(`${base}/studio/${studio.id}`);
await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(1500);
await host.ev(`document.querySelector('#lb-go').click()`);
await waitFor(host, `!!document.querySelector('#program-canvas')`);

// video carregado nao vai para o palco
await host.ev(`(async()=>{
  const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');
  const st=c.captureStream(30);const rec=new MediaRecorder(st,{mimeType:'video/webm;codecs=vp8'});const ch=[];rec.ondataavailable=e=>ch.push(e.data);
  let n=0;const iv=setInterval(()=>{x.fillStyle='hsl('+(n*9%360)+',80%,50%)';x.fillRect(0,0,320,180);n++},33);
  rec.start();await new Promise(r=>setTimeout(r,2500));rec.stop();await new Promise(r=>rec.onstop=r);clearInterval(iv);
  const f=new File(ch,'clip.webm',{type:'video/webm'});const dt=new DataTransfer();dt.items.add(f);const inp=document.querySelector('#media-file');inp.files=dt.files;inp.dispatchEvent(new Event('change'));})()`);
check('video carregado aparece na lista de midia', await waitFor(host, `!!document.querySelector('#panel-media .media-row')`));
await sleep(800);
check('video carregado NAO entra no palco', await host.ev(`!__castdeck.S.stage.includes('media:1') && __castdeck.S.sources.has('media:1')`));
check('video carregado nao toca sozinho', await host.ev(`__castdeck.S.sources.get('media:1').el.paused`));
await host.ev(`document.querySelector('#panel-media .m-stage').click()`); await sleep(400);
check('botao Palco coloca o video no palco', await host.ev(`__castdeck.S.stage.includes('media:1')`));

// noticias
await host.ev(`document.querySelector('.tab[data-tab=banners]').click()`); await sleep(500);
check('secao Noticias (RSS/XML) existe', await host.ev(`!!document.querySelector('#rss-url') && !!document.querySelector('#rss-add')`));
await host.ev(`document.querySelector('[data-preset*="bbci"]').click()`);
check('preset preenche url', await host.ev(`document.querySelector('#rss-url').value.includes('bbci')`));
await host.ev(`document.querySelector('#rss-add').click()`);
check('feed adicionado e ligado', await waitFor(host, `__castdeck.S.brand.rssFeeds?.length===1 && __castdeck.S.brand.rssFeeds[0].on`, 20000));
check('letreiro ativo com manchetes', await waitFor(host, `(()=>{const t=__castdeck.comp.ticker;return !!t && t.text.length>40})()`, 5000));
check('selo mostra o nome da fonte', await host.ev(`__castdeck.comp.ticker.label==='BBC Brasil'`));
await sleep(1200);
const o1 = await host.ev(`__castdeck.comp.ticker.offset`); await sleep(800); const o2 = await host.ev(`__castdeck.comp.ticker.offset`);
check('letreiro rola (offset muda)', o1 !== o2, `${o1} -> ${o2}`);
// segundo feed (invalido) e erro amigavel
await host.ev(`(()=>{document.querySelector('#rss-url').value='https://example.com/nao-existe-feed.xml';document.querySelector('#rss-add').click()})()`);
check('feed invalido mostra erro e nao entra', await waitFor(host, `/N.o foi poss.vel ler/.test(document.querySelector('#rss-msg')?.textContent||'')`, 20000) && await host.ev(`__castdeck.S.brand.rssFeeds.length===1`));
// segundo feed valido: varios feeds => prefixo com fonte e selo generico
await host.ev(`(()=>{document.querySelector('#rss-url').value='https://g1.globo.com/rss/g1/';document.querySelector('#rss-name').value='G1';document.querySelector('#rss-add').click()})()`);
check('segundo feed cadastrado', await waitFor(host, `__castdeck.S.brand.rssFeeds?.length===2`, 20000));
check('com 2 feeds: selo Noticias e prefixo da fonte', await host.ev(`__castdeck.comp.ticker.label==='Notícias' && /BBC Brasil ▸/.test(__castdeck.comp.ticker.text) && /G1 ▸/.test(__castdeck.comp.ticker.text)`));
// desligar um
await host.ev(`document.querySelectorAll('.rss-on')[0].click()`); await sleep(600);
check('desligar um feed remove suas manchetes', await host.ev(`!/BBC Brasil ▸/.test(__castdeck.comp.ticker?.text||'') && __castdeck.S.brand.rssFeeds[0].on===false`));
// velocidade
await host.ev(`(()=>{const r=document.querySelector('#rss-speed');r.value=15;r.dispatchEvent(new Event('input'))})()`); await sleep(300);
check('velocidade aplicada', await host.ev(`Math.abs(__castdeck.comp.ticker.speed-0.15)<0.001`));
// texto manual soma com noticias
await host.ev(`(()=>{const t=document.querySelector('#tk-text');t.value='AVISO MANUAL';t.dispatchEvent(new Event('input'));const o=document.querySelector('#tk-on');o.checked=true;o.dispatchEvent(new Event('change'))})()`); await sleep(400);
check('texto manual + noticias no mesmo letreiro', await host.ev(`__castdeck.comp.ticker.text.startsWith('AVISO MANUAL') && __castdeck.comp.ticker.text.length > 80 && !__castdeck.comp.ticker.label`));
// persistencia
await sleep(1500);
const saved = await (await fetch(base + '/api/studios/' + studio.id)).json();
check('feeds salvos no servidor', saved.brand?.rssFeeds?.length === 2 && saved.brand.rssFeeds[1].name === 'G1', JSON.stringify(saved.brand?.rssFeeds?.map((f) => [f.name, f.on])));
// excluir
await host.ev(`document.querySelectorAll('.rss-del')[0].click()`); await sleep(500);
check('excluir feed', await host.ev(`__castdeck.S.brand.rssFeeds.length===1`));
check('sem erros JS', host.errors.length === 0, host.errors.join(' | '));
await fetch(base + '/api/studios/' + studio.id, { method: 'DELETE' });
await host.close();
console.log(results.filter((r) => !r[1]).length ? 'HA FALHAS' : 'TUDO OK');
process.exit(0);