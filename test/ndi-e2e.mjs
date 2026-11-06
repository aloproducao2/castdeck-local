// Teste local da UI NDI (Edge CDP :9333 + servidor :3000).
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://127.0.0.1:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') => { results.push([name, !!ok]); console.log(ok ? 'PASS' : 'FAIL', name, info); };

let browserWs, bid = 0; const bpend = new Map();
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
  const t = { id: targetId, webSocketDebuggerUrl: `ws://127.0.0.1:9333/devtools/page/${targetId}` };
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval');
    return r.result.result.value;
  };
  await send('Page.navigate', { url });
  return { ev, errors, close: () => fetch(`${CDP}/json/close/${targetId}`) };
}
const waitFor = async (p, expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.ev(expr)) return true; } catch {} await sleep(300); } return false; };

// Estado inicial determinístico: o teste valida o gate desligado.
await fetch(base + '/api/ndi/enabled', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: false }) });

const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'NDI E2E' }) })).json();
const page = await openPage(`${base}/studio/${studio.id}`);
check('lobby carrega', await waitFor(page, `!!document.querySelector('#lb-go')`));
await sleep(1000);
await page.ev(`document.querySelector('#lb-go').click()`);
check('estúdio abre', await waitFor(page, `!!__castdeck && !!document.querySelector('#program-canvas')`));

check('botão NDI começa inativo', await page.ev(`document.querySelector('#btn-ndi')?.getAttribute('aria-pressed') === 'false'`));
await page.ev(`document.querySelector('#btn-ndi').click()`);
check('botão NDI liga e abre o painel', await waitFor(page, `!!document.querySelector('#ndi-start')`));
const bridge = await (await fetch(base + '/api/ndi/status')).json();
check('bridge NDI disponível no servidor', bridge.available === true, JSON.stringify(bridge));
check('botão NDI ativa o subsistema', bridge.enabled === true, JSON.stringify({ enabled: bridge.enabled }));
check('indicador do botão fica ativo', await page.ev(`document.querySelector('#btn-ndi')?.getAttribute('aria-pressed') === 'true'`));

await page.ev(`document.querySelector('#ndi-start').click()`);
await sleep(2500);
const running = await page.ev(`!!__castdeck.ndi?.running`);
check('saída NDI liga', running === true);
const st = await (await fetch(base + '/api/ndi/status')).json();
check('servidor registra 1 saída NDI', st.outputs === 1, JSON.stringify(st));

// lista e adiciona a primeira fonte NDI visível (se houver)
await page.ev(`document.querySelector('#ndi-refresh').click()`);
await sleep(2500);
const hasAdd = await page.ev(`!!document.querySelector('#ndi-source-list [data-add]')`);
check('painel lista fonte NDI', hasAdd);
if (hasAdd) {
  const sourceName = await page.ev(`([...document.querySelectorAll('#ndi-source-list [data-add]')].find((b) => b.dataset.add.includes(${JSON.stringify(process.env.NDI_TEST_MATCH || 'Test Pattern')})) || document.querySelector('#ndi-source-list [data-add]')).dataset.add`);
  await page.ev(`([...document.querySelectorAll('#ndi-source-list [data-add]')].find((b) => b.dataset.add === ${JSON.stringify(sourceName)})).click()`);
  await sleep(6000);
  const active = await (await fetch(base + '/api/ndi/sources')).json();
  const hit = (active.active || []).find((a) => a.ndiName === sourceName);
  check('fonte NDI vira entrada ativa', !!hit, JSON.stringify(active.active));
  if (hit) {
    check('fonte NDI entra nos bastidores do estúdio', await page.ev(`__castdeck.S.sources.has('ingest:${hit.key}')`), hit.key);
    check('fonte NDI conecta no navegador', await waitFor(page, `!!__castdeck.S.sources.get('ingest:${hit.key}')?.ingestLive`, 15000));
    check('áudio NDI entra no Mixer', await waitFor(page, `__castdeck.mixer.sources.has('ingest:${hit.key}:audio')`, 8000));
    check('áudio NDI entra no retorno de monitor', await page.ev(`(__castdeck.mixer.sources.get('ingest:${hit.key}:audio')?.toMonitor.gain.value || 0) > 0.5`));
    let lv = 0;
    for (let i = 0; i < 24; i++) { lv = Math.max(lv, await page.ev(`__castdeck.mixer.level('ingest:${hit.key}:audio') || 0`)); await sleep(250); }
    check('áudio NDI tem nível no Mixer', lv > 0.001, String(lv));
  }
}

const errors = page.errors.filter((e) => !/Receiving end does not exist/.test(e || ''));
check('sem exceções JS', errors.length === 0, errors.join(' | '));

await page.ev(`__castdeck.ndi?.stop()`);
await sleep(800);
const st2 = await (await fetch(base + '/api/ndi/status')).json();
check('saída NDI desliga', st2.outputs === 0, JSON.stringify(st2));
await page.ev(`document.querySelector('#ndi-disable')?.click()`);
check('seletor desativa o NDI', await waitFor(page, `!!document.querySelector('#ndi-enable')`));
const st3 = await (await fetch(base + '/api/ndi/status')).json();
check('NDI desligado no servidor', st3.enabled === false, JSON.stringify({ enabled: st3.enabled }));
check('botão NDI volta a inativo', await page.ev(`document.querySelector('#btn-ndi')?.getAttribute('aria-pressed') === 'false'`));
await page.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} passaram`);
process.exit(failed.length ? 1 : 0);
