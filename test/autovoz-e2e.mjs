// AUTO-VOZ: corte automático pela voz na mesa de corte.
// Requer servidor de teste (:3100) e Edge com CDP (:9333). Uso: BASE=http://localhost:3100 node test/autovoz-e2e.mjs
// Duas câmeras falsas (canvas) com "voz" de oscilador ligada direto no mixer: o ganho do oscilador
// liga/desliga a fala, sem depender de microfone real.
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

const studio = await post('/api/studios', { name: 'AUTO-VOZ E2E' });
const host = await open(`${base}/studio/${studio.id}?lang=pt`);
await host.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });
await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(1500);
await host.ev(`document.querySelector('#lb-go').click()`);
check('estúdio abriu', await waitFor(host, `!!document.querySelector('#program-canvas')`));
await sleep(1000);

// mesa de corte ligada
await host.ev(`__castdeck.switcher.setMode(true)`);
check('mesa de corte ligada', await waitFor(host, `__castdeck.S.switcher && !!document.querySelector('#sw-voice')`));
check('AUTO-VOZ começa desligado', await host.ev(`!__castdeck.autoVoice.on`));

// duas câmeras falsas com voz de oscilador, ambas na Cena; a câmera do host sai da Cena
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
await sleep(600);
const stageClick = (id) => host.ev(`(()=>{const b=document.querySelector('#sw-bus [data-stage="${id}"]'); if(!b) return false; b.click(); return true})()`);
for (const id of ['fa:cam', 'fb:cam']) if (!(await host.ev(`__castdeck.S.stage.includes('${id}')`))) await stageClick(id);
if (await host.ev(`__castdeck.S.stage.includes('host:cam')`)) await stageClick('host:cam');
await sleep(300);
check('Cena = Ana e Beto', await host.ev(`(()=>{const s=__castdeck.S.stage;return s.includes('fa:cam')&&s.includes('fb:cam')&&!s.includes('host:cam')})()`), await host.ev(`JSON.stringify(__castdeck.S.stage)`));
const say = (id, on) => host.ev(`(__voz['${id}'].gain.value=${on ? 0.3 : 0}, true)`);
const take = () => host.ev(`__castdeck.S.take`);

// liga o AUTO-VOZ (programa começa na Cena)
await host.ev(`__castdeck.switcher.cutTo(null)`);
await host.ev(`document.querySelector('#sw-voice').click()`);
check('AUTO-VOZ ligado', await host.ev(`__castdeck.autoVoice.on && document.querySelector('#sw-voice').classList.contains('on') && !document.querySelector('#sw-sens').hidden`));

// 1) tosse curta não corta
await say('fa:cam', true); await sleep(500); await say('fa:cam', false);
await sleep(1200);
check('fala curta (0,5 s) não corta', (await take()) === null, String(await take()));

// 2) Ana fala sozinha -> corta para Ana
let t0 = Date.now();
await say('fa:cam', true);
check('Ana fala -> Ana no ar', await waitFor(host, `__castdeck.S.take==='fa:cam'`, 4000));
const dt1 = Date.now() - t0;
check('corte só depois de ~1,2 s de fala', dt1 >= 1000, `${dt1} ms`);
check('anel verde em quem fala', await host.ev(`!!document.querySelector('#sw-bus [data-src="fa:cam"].sw-talk')`));

// 3) Beto assume logo em seguida -> respeita os 4 s mínimos e corta para Beto
const cutA = Date.now();
await say('fa:cam', false); await say('fb:cam', true);
check('Beto fala -> Beto no ar', await waitFor(host, `__castdeck.S.take==='fb:cam'`, 7000));
check('corte da Ana ficou no ar pelo menos ~4 s', Date.now() - cutA >= 2600, `${Date.now() - cutA} ms após Beto começar`);

// 4) os dois falando juntos -> Cena
await say('fa:cam', true);
check('dois falando -> Cena', await waitFor(host, `__castdeck.S.take===null`, 7000));
await say('fa:cam', false); await say('fb:cam', false);

// 5) corte manual pausa por 10 s
await sleep(4200); // passa do mínimo no ar
await host.ev(`__castdeck.switcher.cutTo('fa:cam')`);
await sleep(300);
await say('fb:cam', true);
const tm = Date.now();
await sleep(3000);
check('após corte manual: AUTO-VOZ pausado (Ana segue no ar)', (await take()) === 'fa:cam', String(await take()));
check('botão mostra "pausado"', await host.ev(`document.querySelector('#sw-voice').classList.contains('paused') && /pausado/.test(document.querySelector('#sw-voice-st').textContent)`));
check('depois da pausa volta a cortar (Beto)', await waitFor(host, `__castdeck.S.take==='fb:cam'`, 10000));
const dtp = Date.now() - tm + 300;
check('pausa durou ~10 s', dtp >= 9000, `${dtp} ms`);

// 6) silêncio longo -> volta para a Cena
await say('fb:cam', false);
const ts = Date.now();
check('silêncio de 8 s -> Cena', await waitFor(host, `__castdeck.S.take===null`, 12000));
check('não voltou antes de ~8 s', Date.now() - ts >= 7000, `${Date.now() - ts} ms`);

// 7) microfone mudo no CastDeck não dispara corte
await host.ev(`__castdeck.mixer.setMuted('fa:cam:audio', true, { save: false })`);
await say('fa:cam', true);
await sleep(2500);
check('fonte muda não corta', (await take()) === null, String(await take()));
await say('fa:cam', false);
await host.ev(`__castdeck.mixer.setMuted('fa:cam:audio', false, { save: false })`);

// 8) sensibilidade salva
await host.ev(`document.querySelector('#sw-sens [data-sens=high]').click()`);
check('sensibilidade alta selecionada e salva', await host.ev(`__castdeck.autoVoice.sens==='high' && JSON.parse(localStorage.getItem('castdeck.autovoz')).sens==='high' && document.querySelector('#sw-sens [data-sens=high]').classList.contains('active')`));
await host.ev(`document.querySelector('#sw-sens [data-sens=mid]').click()`);

// 9) modo normal (sem mesa): o Diretor continua ligado e destaca em tela cheia quem fala
await host.ev(`__castdeck.switcher.setMode(false)`);
await sleep(500);
check('modo Estúdio mantém o DIRETOR ligado', await host.ev(`__castdeck.autoVoice.on`));
await say('fa:cam', true);
check('modo normal: quem fala vai para tela cheia (solo)', await waitFor(host, `__castdeck.S.solo==='fa:cam'`, 6000), await host.ev(`JSON.stringify([__castdeck.S.stage,__castdeck.S.solo,__castdeck.S.switcher,__castdeck.autoVoice.on,[...__castdeck.mixer.sources.keys()],__castdeck.mixer.levelDb('fa:cam:audio')])`));
await say('fa:cam', false);
check('modo normal: silêncio volta ao layout', await waitFor(host, `!__castdeck.S.solo`, 12000), await host.ev(`String(__castdeck.S.solo)`));

// 10) áudio inteligente: voz abaixa a música e devolve depois
await host.ev(`(()=>{const C=__castdeck; const g=C.mixer.ctx.createGain(); const o=C.mixer.ctx.createOscillator(); o.connect(g); o.start();
  C.S.sources.set('fm',{id:'fm',kind:'media',label:'musica',el:{paused:false}}); C.mixer.addNode('fm', g, {stageKey:'fm',monitor:false}); return true})()`);
await host.ev(`__castdeck.autoVoice.setDuck(true)`);
const pre = () => host.ev(`__castdeck.mixer.sources.get('fm').pre.gain.value`);
await sleep(700);
check('ducking: sem fala a música fica inteira', (await pre()) > 0.95, String(await pre()));
await say('fa:cam', true);
await sleep(900);
const dv = await pre();
check('ducking: com fala a música abaixa (~-14 dB)', dv < 0.3 && dv > 0.1, String(dv));
await say('fa:cam', false);
await sleep(3500);
check('ducking: depois da fala a música volta', (await pre()) > 0.9, String(await pre()));
await host.ev(`__castdeck.autoVoice.setDuck(false)`);


// 11) modo Ritmo: varia layouts, tira do palco quem não fala e restaura tudo ao desligar
const base0 = await host.ev(`JSON.stringify([__castdeck.S.stage, __castdeck.S.layout])`);
await host.ev(`document.querySelector('#sw-prof [data-prof=ritmo]').click()`);
await host.ev(`document.querySelector('#dp-ritmo-spd [data-rs=fast]').click()`);
check('perfil Ritmo selecionado', await host.ev(`document.querySelector('#sw-prof [data-prof=ritmo]').classList.contains('active') && !document.querySelector('#dp-ritmo-row').hidden`));
const seen = { layouts: new Set(), solo: false, both: false };
const tr0 = Date.now();
while (Date.now() - tr0 < 32000) {
  const el = Date.now() - tr0;
  await say('fa:cam', el < 10000);
  await say('fb:cam', el >= 10000 && el < 20000);
  const [st, ly] = JSON.parse(await host.ev(`JSON.stringify([__castdeck.S.stage, __castdeck.S.layout])`));
  seen.layouts.add(ly);
  if (st.length === 1) seen.solo = true;
  if (st.includes('fa:cam') && st.includes('fb:cam')) seen.both = true;
  await sleep(400);
}
await say('fb:cam', false);
check('Ritmo usou 2+ layouts diferentes', seen.layouts.size >= 2, [...seen.layouts].join(','));
check('Ritmo tirou do palco quem não fala (foco em 1)', seen.solo);
check('Ritmo também mostra os dois juntos', seen.both);
await host.ev(`__castdeck.autoVoice.setOn(false)`);
await sleep(600);
check('ao desligar, palco e layout voltam ao original', (await host.ev(`JSON.stringify([__castdeck.S.stage, __castdeck.S.layout])`)) === base0, await host.ev(`JSON.stringify([__castdeck.S.stage, __castdeck.S.layout])`) + ' vs ' + base0);
await host.ev(`document.querySelector('#sw-prof [data-prof=podcast]').click()`);

check('sem erros JS', host.errors.length === 0, JSON.stringify(host.errors));
await host.close();
await fetch(`${base}/api/studios/${studio.id}`, { method: 'DELETE' });
console.log(fails ? `${fails} falha(s)` : 'TUDO OK');
process.exit(fails ? 1 : 0);
