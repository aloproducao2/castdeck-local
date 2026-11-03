// Entradas RTMP/SRT (drones e câmeras) com o MediaMTX embutido.
// Precisa do servidor (BASE) e do Edge com CDP em 9333. BASE=http://localhost:3100 node test/ingest-e2e.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const FF = process.env.FFMPEG || path.resolve('build/vendor/win-x64/ffmpeg.exe');
const SHOTS = process.env.SHOTS || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const v = await (await fetch(`${CDP}/json/version`)).json();
const bws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let bid = 0; const bp = new Map();
bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bp.has(m.id)) { bp.get(m.id)(m); bp.delete(m.id); } };
const bsend = (method, params = {}) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const MOCKJS = `(()=>{const gum=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
 const cam=()=>{const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');let k=0;setInterval(()=>{x.fillStyle='hsl('+(k*3%360)+',60%,40%)';x.fillRect(0,0,640,360);k++},33);return c.captureStream(30).getVideoTracks()[0]};
 navigator.mediaDevices.getUserMedia=async(c)=>{if(c&&c.video){const o=new MediaStream();o.addTrack(cam());if(c.audio){try{(await gum({audio:c.audio})).getAudioTracks().forEach(a=>o.addTrack(a))}catch{}}return o}return gum(c)};
 const en=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);navigator.mediaDevices.enumerateDevices=async()=>{const d=await en();return d.some(x=>x.kind==='videoinput')?d:[...d,{kind:'videoinput',deviceId:'fakecam',label:'Fake Camera',groupId:'g'}]};})()`;
async function open(url) {
  const { result } = await bsend('Target.createTarget', { url: 'about:blank' });
  const ws = new WebSocket(`ws://127.0.0.1:9333/devtools/page/${result.targetId}`);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: MOCKJS });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  const shot = async (name) => { if (!SHOTS) return; const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64')); };
  await send('Page.navigate', { url });
  return { ev, errors, send, shot, close: () => bsend('Target.closeTarget', { targetId: result.targetId }) };
}
const waitFor = async (p, expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.ev(expr)) return true; } catch {} await sleep(250); } return false; };
const waitApi = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const i = await ingest(); if (fn(i)) return i; } catch {} await sleep(500); } return null; };
let fails = 0;
const check = (n, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FALHA'), n, ok ? '' : extra); if (!ok) fails++; };
const J = { 'Content-Type': 'application/json' };
const ingest = async () => (await fetch(base + '/api/ingest')).json();
const post = async (p, body, method = 'POST') => (await fetch(base + '/api' + p, { method, headers: J, body: body ? JSON.stringify(body) : undefined })).json();
const procs = [];
const ff = (args) => { const p = spawn(FF, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true }); procs.push(p); return p; };
const encs = await new Promise((r) => { let o = ''; const p = spawn(FF, ['-hide_banner', '-encoders']); p.stdout.on('data', (d) => (o += d)); p.on('close', () => r(o)); });
const hevc = /hevc_nvenc/.test(encs) ? ['-c:v', 'hevc_nvenc', '-b:v', '6M'] : ['-c:v', 'libx265', '-preset', 'ultrafast', '-b:v', '4M'];
let PORTS = { rtmp: 1935, srt: 8890 };
const pubSrt = (key) => ff(['-re', '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', ...hevc, '-g', '60', '-c:a', 'aac', '-f', 'mpegts', `srt://127.0.0.1:${PORTS.srt}?streamid=publish:${key}&pkt_size=1316`]);
const pubRtmp = (key) => ff(['-re', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=880', '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-b:v', '3M', '-g', '60', '-c:a', 'aac', '-f', 'flv', `rtmp://127.0.0.1:${PORTS.rtmp}/${key}`]);

try {
  // --- servidor
  let i = await ingest();
  check('MediaMTX embutido disponível', i.available === true, JSON.stringify(i));
  PORTS = i.ports;
  i = await post('/ingest/enable', { on: true });
  check('entradas ligadas', i.enabled === true);
  check('MediaMTX respondendo', !!(await waitApi((x) => x.status === 'on', 15000)));
  const a = await post('/ingest/sources', { name: 'E2E Drone HEVC' });
  const b = await post('/ingest/sources', { name: 'E2E Câmera RTMP' });
  check('entradas criadas com chave', /^cam-[a-z0-9]{6}$/.test(a.key) && /^cam-[a-z0-9]{6}$/.test(b.key), JSON.stringify([a, b]));
  await sleep(1200);
  pubSrt(a.key);
  let pr = pubRtmp(b.key);
  i = await waitApi((x) => x.sources.filter((s) => s.key === a.key || s.key === b.key).every((s) => s.play), 25000);
  const sa = i?.sources.find((s) => s.key === a.key);
  const sb = i?.sources.find((s) => s.key === b.key);
  check('SRT H.265 ao vivo e convertido', sa?.live && sa.protocol === 'SRT' && sa.video === 'H265' && sa.play === a.key + '_web', JSON.stringify(sa));
  check('RTMP H.264 ao vivo (só o áudio convertido)', sb?.live && sb.protocol === 'RTMP' && sb.video === 'H264' && sb.play === b.key + '_web', JSON.stringify(sb));
  check('URLs com IP da rede', new RegExp(`^rtmp://[\\d.]+:${PORTS.rtmp}/cam-`).test(sa?.urls?.rtmp || '') && /streamid=publish:cam-/.test(sa?.urls?.srt || ''), JSON.stringify(sa?.urls));
  // chave desconhecida: o MediaMTX recusa
  const bad = ff(['-re', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15', '-c:v', 'libx264', '-preset', 'ultrafast', '-t', '8', '-f', 'flv', `rtmp://127.0.0.1:${PORTS.rtmp}/cam-naoexiste`]);
  const badCode = await new Promise((r) => { const t = setTimeout(() => r('timeout'), 9000); bad.on('close', (c) => { clearTimeout(t); r(c); }); });
  check('chave desconhecida recusada', badCode !== 0 && badCode !== 'timeout', String(badCode));
  const whep404 = await fetch(base + '/api/ingest/whep/cam-naoexiste', { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: 'v=0' });
  check('WHEP de chave desconhecida = 404', whep404.status === 404, String(whep404.status));

  // --- estúdio
  const studio = await post('/studios', { name: 'Ingest E2E' });
  const host = await open(`${base}/studio/${studio.id}`);
  await host.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(1200);
  await host.ev(`document.querySelector('#lb-go').click()`);
  check('estúdio abriu', await waitFor(host, `!!window.__castdeck?.ingest`));
  await sleep(800);
  await host.ev(`document.querySelector('#add-cam-tile').click()`);
  check('＋ Câmera tem a opção drone', await waitFor(host, `!!document.querySelector('[data-pick=ingest]')`));
  await host.shot('ingest_menu');
  await host.ev(`document.querySelector('[data-pick=ingest]').click()`);
  check('janela lista as 2 entradas ao vivo', await waitFor(host, `document.querySelectorAll('.ing-src.live').length>=2`, 10000));
  check('selo "convertendo"', await host.ev(`!!document.querySelector('.ing-src[data-key="${a.key}"] .ing-conv')`));
  await host.ev(`document.querySelector('.ing-src[data-key="${a.key}"] [data-act=urls]').click()`);
  check('endereços + QR', await waitFor(host, `!!document.querySelector('.ing-src[data-key="${a.key}"] .ing-qr-code svg') && document.querySelectorAll('.ing-src[data-key="${a.key}"] .ing-url').length===4`));
  const fit = await host.ev(`(()=>{const m=document.querySelector('.ing-modal');return m.scrollWidth<=m.clientWidth+1})()`);
  check('janela sem rolagem horizontal', fit);
  await host.shot('ingest_modal');
  await host.ev(`document.querySelector('.ing-src[data-key="${a.key}"] [data-act=studio]').click()`);
  await sleep(300);
  await host.ev(`document.querySelector('.ing-src[data-key="${b.key}"] [data-act=studio]').click()`);
  const vid = (k) => `(__castdeck.S.sources.get('ingest:${k}')?.el.videoWidth||0)`;
  check('drone HEVC com imagem no estúdio', await waitFor(host, `${vid(a.key)}>0`, 15000), String(await host.ev(vid(a.key))));
  check('câmera RTMP com imagem no estúdio', await waitFor(host, `${vid(b.key)}>0`, 15000), String(await host.ev(vid(b.key))));
  check('resolução do drone preservada (1080p)', (await host.ev(`__castdeck.S.sources.get('ingest:${a.key}').el.videoHeight`)) === 1080);
  check('trilha de áudio recebida', await host.ev(`(__castdeck.S.sources.get('ingest:${b.key}')?.stream?.getAudioTracks().length||0)>0`));
  await host.ev(`document.querySelector('.modal-back .modal-actions [data-close]')?.click()`);
  await sleep(600);
  check('miniatura com selo Drone/RTMP', await host.ev(`[...document.querySelectorAll('.tile .badge')].filter(b=>b.textContent==='Drone/RTMP').length>=2`));
  await host.shot('ingest_tiles');
  // queda e volta do sinal
  pr.kill();
  check('sinal caiu → "Sem sinal"', await waitFor(host, `__castdeck.S.sources.get('ingest:${b.key}')?.camOff===true`, 20000));
  pr = pubRtmp(b.key);
  check('sinal voltou → imagem de novo', await waitFor(host, `__castdeck.S.sources.get('ingest:${b.key}')?.camOff===false && ${vid(b.key)}>0`, 25000));
  // persistência entre recargas
  await host.send('Page.reload');
  await waitFor(host, `!!document.querySelector('#lb-go')`); await sleep(1200);
  await host.ev(`document.querySelector('#lb-go').click()`);
  check('fontes voltam ao reabrir o estúdio', await waitFor(host, `${vid(a.key)}>0 && ${vid(b.key)}>0`, 20000));
  // botão Bastidores = liga/desliga
  await host.ev(`(__castdeck.ingest.openPanel(), true)`);
  await waitFor(host, `!!document.querySelector('.ing-src[data-key="${b.key}"] [data-act=studio][aria-pressed=true]')`);
  await host.ev(`document.querySelector('.ing-src[data-key="${b.key}"] [data-act=studio]').click()`);
  check('desligar Bastidores tira a miniatura', await waitFor(host, `!__castdeck.S.sources.has('ingest:${b.key}') && !!document.querySelector('.ing-src[data-key="${b.key}"] [data-act=studio][aria-pressed=false]')`, 5000));
  await host.ev(`document.querySelector('.ing-src[data-key="${b.key}"] [data-act=studio]').click()`);
  check('ligar Bastidores devolve a imagem', await waitFor(host, `${vid(b.key)}>0`, 15000));
  // entrada nova criada pela janela já entra nos bastidores
  const before = await host.ev(`[...__castdeck.S.sources.keys()].filter(k=>k.startsWith('ingest:')).length`);
  await host.ev(`document.querySelector('#ing-add').click()`);
  await waitFor(host, `!!document.querySelector('#ing-name')`);
  await host.ev(`(()=>{document.querySelector('#ing-name').value='E2E Nova';document.querySelector('#ing-name-ok').click()})()`);
  check('entrada nova vai direto para os bastidores', await waitFor(host, `[...__castdeck.S.sources.keys()].filter(k=>k.startsWith('ingest:')).length===${before + 1}`, 8000));
  check('entrada nova aparece como "Sem sinal"', await waitFor(host, `[...document.querySelectorAll('.tile .badge')].some(b=>b.textContent==='Sem sinal')`, 5000));
  await host.shot('ingest_new');
  await host.ev(`document.querySelector('.modal-back .modal-actions [data-close]')?.click()`);
  const errs = host.errors.filter((e) => !/Receiving end does not exist/.test(e));
  check('sem erros de JavaScript', !errs.length, errs.join('\n'));
  await host.close();
  await post('/studios/' + studio.id, null, 'DELETE').catch(() => {});
  // limpeza
  for (const s of (await ingest()).sources) if (/^E2E /.test(s.name)) await post('/ingest/sources/' + s.key, null, 'DELETE');
  i = await post('/ingest/enable', { on: false });
  check('desligado no fim', i.enabled === false && i.status === 'off');
} finally {
  for (const p of procs) try { p.kill(); } catch {}
  bws.close();
}
console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo');
process.exit(fails ? 1 : 0);
