// Valida a qualidade da chamada com convidado (host + convidado reais no Edge via CDP :9333).
//   PORT=3100 node server/index.js   +   msedge --remote-debugging-port=9333 --use-fake-ui-for-media-stream
//   BASE=http://localhost:3100 node test/guest-quality-e2e.mjs
// Confere a chamada com convidado na base da 1.2.14 (revertida na 1.2.17 depois dos travamentos da 1.2.15/1.2.16):
// mídia fluindo nos dois sentidos, fps e congelamentos (freezeCount) medidos por 10 s, SDP sem x-google-* e retorno no
// tamanho original do GuestView. Teste local não mostra problema de rede: valide também com um convidado em 4G.
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
 const cam=()=>{const c=document.createElement('canvas');c.width=1280;c.height=720;const x=c.getContext('2d');let k=0;setInterval(()=>{x.fillStyle='hsl('+(k*3%360)+',60%,40%)';x.fillRect(0,0,1280,720);x.fillStyle='#fff';x.font='80px sans-serif';x.fillText(String(k),100,200);k++},33);return c.captureStream(30).getVideoTracks()[0]};
 navigator.mediaDevices.getUserMedia=async(c)=>{if(c&&c.video){const o=new MediaStream();o.addTrack(cam());if(c.audio){try{(await gum({audio:c.audio})).getAudioTracks().forEach(a=>o.addTrack(a))}catch{}}return o}return gum(c)};
 const en=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);navigator.mediaDevices.enumerateDevices=async()=>{const d=await en();return d.some(x=>x.kind==='videoinput')?d:[...d,{kind:'videoinput',deviceId:'fakecam',label:'Fake Camera',groupId:'g'}]};})()`;
// RELAY=1: o convidado só pode usar candidatos relay (TURN), como numa rede que bloqueia P2P. Prova que o TURN
// oficial (turn.flue.live, credenciais de /api/public/ice) realmente carrega a mídia.
const RELAY = process.env.RELAY === '1' || process.argv.includes('--relay'); // npm run test:turn
const RELAYJS = `(()=>{const O=window.RTCPeerConnection;window.RTCPeerConnection=new Proxy(O,{construct(t,[c,...a]){return Reflect.construct(t,[{...(c||{}),iceTransportPolicy:'relay'},...a])}});})()`;
const targets = [];
async function open(url, { relay = false } = {}) {
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
    if (m.method === 'Runtime.exceptionThrown') {
      const txt = m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '';
      // Extensões de navegador injetadas no perfil do Edge
      if (!txt.includes('Receiving end does not exist') && !txt.includes('extension')) errors.push(txt);
    }
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: MOCKJS });
  if (relay) await send('Page.addScriptToEvaluateOnNewDocument', { source: RELAYJS });
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
  const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Quality E2E' }) })).json();
  const host = await open(`${base}/studio/${studio.id}?lang=pt`);
  check('lobby host', await waitFor(host, `!!document.querySelector('#lb-go')`));
  await sleep(2000);
  await host.ev(`const n=document.querySelector('#lb-name');if(n&&!n.value)n.value='Host';document.querySelector('#lb-go').click()`);
  check('estudio abriu', await waitFor(host, `!!document.querySelector('#program-canvas')`));

  const guest = await open(`${base}/join/${studio.id}?lang=pt`, { relay: RELAY });
  check('lobby convidado', await waitFor(guest, `!!document.querySelector('#lb-go')`));
  await sleep(2000);
  await guest.ev(`document.querySelector('#lb-name').value='Convidado QA'`);
  await guest.ev(`document.querySelector('#lb-go').click()`);
  check('convidado conectou', await waitFor(guest, `__guest.peer?.pc.connectionState==='connected'`, 30000));
  check('host viu convidado', await waitFor(host, `__castdeck.S.guests.size===1`));
  const gid = await host.ev(`[...__castdeck.S.guests.keys()][0]`);
  check('camera do convidado virou fonte', await waitFor(host, `__castdeck.S.sources.has('${gid}:cam')`));

  // SDP: a 1.2.15 forçava x-google-start/min-bitrate (piso de 500 kbps) e isso entrou na lista de suspeitos dos travamentos
  const gSdp = await guest.ev(`__guest.peer.pc.localDescription.sdp`);
  const hSdp = await host.ev(`__castdeck.S.guests.get('${gid}').peer.pc.localDescription.sdp`);
  check('SDP sem x-google-min-bitrate (convidado e host)', !/x-google-min-bitrate/.test(gSdp + hSdp));

  // caminho real da mídia: par de candidatos escolhido pelo ICE
  const pair = await guest.ev(`(async()=>{const s=await __guest.peer.pc.getStats();let p=null;s.forEach(x=>{if(x.type==='transport'&&x.selectedCandidatePairId)p=s.get(x.selectedCandidatePairId)});if(!p)s.forEach(x=>{if(x.type==='candidate-pair'&&x.nominated&&x.state==='succeeded')p=x});const l=p&&s.get(p.localCandidateId);const r=p&&s.get(p.remoteCandidateId);return l&&{local:l.candidateType,proto:l.relayProtocol||l.protocol,url:l.url||'',addr:l.address,remote:r?.candidateType}})()`);
  console.log('     caminho da mídia (convidado):', JSON.stringify(pair));
  if (RELAY) check('mídia passando pelo TURN oficial (turn.flue.live)', pair?.local === 'relay' && /turn\.flue\.live/.test(pair.url || ''), JSON.stringify(pair));

  const hv = await host.ev(`(()=>{const g=__castdeck.S.guests.get('${gid}');return {w:g.view.view.canvas.width,h:g.view.view.canvas.height}})()`);
  console.log('     retorno (GuestView):', JSON.stringify(hv));

  // mídia fluindo: convidado recebe programa e host recebe câmera do convidado
  check('convidado recebe video do programa', await waitFor(guest, `document.querySelector('#g-program').videoWidth>0`));
  const STATS = `(async(pc)=>{const s=await pc.getStats();let r=null;s.forEach(x=>{if(x.type==='inbound-rtp'&&x.kind==='video')r={w:x.frameWidth,h:x.frameHeight,f:x.framesDecoded||0,fr:x.freezeCount||0,fd:x.totalFreezesDuration||0,drop:x.framesDropped||0,kb:x.bytesReceived||0,t:performance.now()}});return r})`;
  const hostIn = () => host.ev(`${STATS}(__castdeck.S.guests.get('${gid}').peer.pc)`);
  const guestIn = () => guest.ev(`${STATS}(__guest.peer.pc)`);
  // o compositor do host roda no requestAnimationFrame: aba encoberta é reduzida pelo navegador e falsearia o fps
  await host.send('Page.bringToFront');
  await sleep(3000); // deixa o BWE subir antes de medir
  const [h0, g0] = [await hostIn(), await guestIn()];
  await sleep(10000);
  const [h1, g1] = [await hostIn(), await guestIn()];
  const rate = (a, b) => ({ w: b.w, h: b.h, fps: +(((b.f - a.f) * 1000) / (b.t - a.t)).toFixed(1), freezes: b.fr - a.fr, freezeS: +(b.fd - a.fd).toFixed(2), dropped: b.drop - a.drop, kbps: Math.round(((b.kb - a.kb) * 8) / (b.t - a.t)) });
  const cam = rate(h0, h1);
  const ret = rate(g0, g1);
  console.log('     camera do convidado chegando no host (10 s):', JSON.stringify(cam));
  console.log('     retorno chegando no convidado (10 s):', JSON.stringify(ret));
  const gOut = await guest.ev(`(async()=>{const s=await __guest.peer.pc.getStats();let r={};s.forEach(x=>{if(x.type==='outbound-rtp'&&x.kind==='video')Object.assign(r,{w:x.frameWidth,h:x.frameHeight,fps:x.framesPerSecond,limit:x.qualityLimitationReason,dur:x.qualityLimitationDurations,enc:x.encoderImplementation});if(x.type==='candidate-pair'&&x.nominated&&x.availableOutgoingBitrate)r.bwe=Math.round(x.availableOutgoingBitrate/1000)});return r})()`);
  console.log('     envio da camera no convidado:', JSON.stringify(gOut));
  if (RELAY) {
    // host e convidado no mesmo PC: pelo relay a mídia sobe e desce DUAS vezes pela mesma internet até a VPS, então
    // fps/banda aqui medem a conexão deste PC, não o TURN. Exige só que a mídia flua nos dois sentidos.
    check('via TURN: câmera do convidado chega ao host', cam.fps > 0, JSON.stringify(cam));
    check('via TURN: programa chega ao convidado', ret.fps > 0, JSON.stringify(ret));
  } else {
    check('host recebe camera do convidado fluida (>= 20 fps, sem congelar)', cam.fps >= 20 && cam.freezeS < 0.5, JSON.stringify(cam));
    // retorno: GuestView a 30 fps em 960×540 (até a 1.2.14 pulava uma volta sim, outra não, e saía a ~15 fps)
    check('convidado recebe o programa fluido (>= 25 fps, sem congelar)', ret.fps >= 25 && ret.freezeS < 0.5, JSON.stringify(ret));
  }

  check('sem erros JS no host', !host.errors.length, host.errors.join(' | '));
  check('sem erros JS no convidado', !guest.errors.length, guest.errors.join(' | '));
} catch (e) {
  console.error('FALHA', e.message);
  fails++;
} finally {
  for (const t of targets) await bsend('Target.closeTarget', { targetId: t }).catch(() => {});
  bws.close();
}
console.log(fails ? `\n${fails} falha(s)` : '\nTudo OK');
process.exit(fails ? 1 : 0);
