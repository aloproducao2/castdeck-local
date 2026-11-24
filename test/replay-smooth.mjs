// Teste E2E: "Suavizar lance" (interpolação 2× por mescla) — gera clipe ~60 fps com áudio,
// grava no servidor e alterna RAW/SUAVIZADO na playlist.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4572;
const CDP = 9582;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-smooth-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const falhas = [];
const ok = (nome, cond, info = '') => {
  if (!cond) falhas.push(nome);
  console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + String(info).slice(0, 300)));
};

const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], {
  cwd: 'D:/REA',
  env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: 'ignore', windowsHide: true,
});
const perfil = path.join(os.tmpdir(), 'cd-smooth-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });

async function conectar(alvo) {
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cmd = (method, params = {}) => new Promise((res) => {
    const id = ++seq;
    const t = setTimeout(() => { pend.delete(id); res({ result: { exceptionDetails: { exception: { description: 'timeout ' + method } } } }); }, 90000);
    pend.set(id, (m) => { clearTimeout(t); res(m); });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async (e) => {
    const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description || '').slice(0, 400));
    return r.result?.result?.value;
  };
  await cmd('Runtime.enable'); await cmd('Page.enable');
  return { ws, cmd, ev };
}
const listar = async () => (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json());

let sid = null;
try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) { await esperar(600); try { pronto = (await fetch(BASE + '/')).ok; } catch {} }
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Suave' }) }).then((r) => r.json());
  sid = est.id || est.studio?.id;

  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) { await esperar(500); try { alvo = (await listar()).find((t) => t.type === 'page' && !t.url.includes('replay.html')); } catch {} }
  const studio = await conectar(alvo);
  await studio.cmd('Page.navigate', { url: `${BASE}/studio/${sid}` });
  await esperar(4000);
  await studio.ev(`document.querySelector('#lb-go')?.click()`);
  for (let i = 0; i < 40; i++) { if (await studio.ev(`!!document.querySelector('#program-canvas')`)) break; await esperar(500); }
  await esperar(1500);

  // console em popup (registra no motor e liga o buffer)
  await studio.ev(`window.open('/replay.html','CastDeckReplayConsole','width=1300,height=820')`);
  let cAlvo = null;
  for (let i = 0; i < 40 && !cAlvo; i++) { await esperar(500); try { cAlvo = (await listar()).find((t) => t.url.includes('replay.html')); } catch {} }
  const replay = await conectar(cAlvo);
  await replay.cmd('Emulation.setDeviceMetricsOverride', { width: 1300, height: 820, deviceScaleFactor: 1, mobile: false });
  await replay.cmd('Page.navigate', { url: `${BASE}/replay.html` });
  await esperar(3000);
  ok('console conectado ao estúdio', await replay.ev(`!!window.opener?.__castdeck?.replayEngine`));

  // espera o buffer encher (~7 s de programa)
  let dur = 0;
  for (let i = 0; i < 40 && dur < 6; i++) {
    await esperar(500);
    dur = await replay.ev(`window.opener.__castdeck.replayEngine.getStats?.().duration || 0`).catch(() => 0);
  }
  ok('buffer encheu (>= 6 s)', dur >= 6, dur);

  // grava o lance em disco
  const saved = await replay.ev(`(async () => {
    const eng = window.opener.__castdeck.replayEngine;
    const clip = await eng.createClip(5);
    if (!clip) return { erro: 'clipe vazio' };
    const meta = await eng.saveClipToDisk(clip, { title: 'Teste Suave', tag: 'GOL', speed: 0.5, markIn: 0, markOut: 5 });
    return meta || { erro: 'save falhou' };
  })()`);
  ok('lance salvo em disco', !!saved?.id, JSON.stringify(saved).slice(0, 200));
  const clipId = saved?.id;

  // recarrega o console para a playlist carregar o lance
  await replay.cmd('Page.navigate', { url: `${BASE}/replay.html` });
  await esperar(3500);
  let cards = 0;
  for (let i = 0; i < 30 && !cards; i++) { await esperar(400); cards = await replay.ev(`document.querySelectorAll('.bc-clip-card').length`).catch(() => 0); }
  ok('playlist carregou o lance', cards > 0, cards);

  // suaviza (leva ~duração do clipe + encode)
  const smooth = await replay.ev(`(async () => {
    await window.smoothHighlight(0);
    const r = await fetch('/api/replay/clips');
    const list = await r.json();
    return list.find((c) => c.id === ${JSON.stringify(clipId)}) || null;
  })()`);
  ok('clipe tem smoothUrl', !!smooth?.smoothUrl, JSON.stringify(smooth || {}).slice(0, 260));

  // Diagnóstico: demux do RAW x SUAVIZADO (quadros, duração, primeiro keyframe)
  try {
    const diag = await replay.ev(`(async () => {
      const { parseWebM } = await import('/js/webm-demux.js');
      const load = async (u) => { const r = await fetch(u); return parseWebM(new Uint8Array(await r.arrayBuffer())); };
      const raw = await load(${JSON.stringify(saved?.webmUrl)});
      const smo = await load(${JSON.stringify(smooth?.smoothUrl)});
      const info = (d) => ({ n: d.video.samples.length, dur: d.durationMs, firstTs: d.video.samples[0] && d.video.samples[0].timestamp, firstKey: d.video.samples[0] && d.video.samples[0].key, lastTs: d.video.samples.length && d.video.samples[d.video.samples.length - 1].timestamp, audio: d.audio.samples.length });
      return { raw: info(raw), smooth: info(smo) };
    })()`);
    console.log('diag:', JSON.stringify(diag));
  } catch (e) { console.log('diag falhou:', e.message); }
  ok('smoothFps ~60', Number(smooth?.smoothFps) >= 55, smooth?.smoothFps);
  ok('marcado como interpolado', smooth?.interpolated === true, smooth?.interpolated);
  ok('duração suavizada ~4,4–5,6 s', Number(smooth?.smoothDuration) >= 4.4 && Number(smooth?.smoothDuration) <= 5.6, smooth?.smoothDuration);

  // arquivo existe, tem áudio (Opus) e vídeo VP8
  if (smooth?.smoothUrl) {
    const r = await fetch(BASE + smooth.smoothUrl);
    const buf = Buffer.from(await r.arrayBuffer());
    ok('arquivo suavizado responde 200', r.status === 200, r.status);
    ok('arquivo suavizado tem tamanho > 30 KB', buf.length > 30000, buf.length);
    const head = buf.subarray(0, 4096).toString('latin1');
    ok('arquivo tem áudio Opus', head.includes('A_OPUS'), head.slice(0, 60));
    ok('arquivo tem vídeo VP8', head.includes('V_VP8'), head.slice(0, 60));
  }

  // selo SUAVIZADO na playlist e reprodução da versão suavizada
  const selo = await replay.ev(`document.querySelector('.bc-clip-meta')?.textContent || ''`);
  ok('selo SUAVIZADO na playlist', /SUAVIZADO/.test(selo), selo.slice(0, 120));
  await replay.ev(`window.playHighlight(0)`);
  await esperar(1500);
  const pv = await replay.ev(`(() => { const v = document.querySelector('#rp-video-pvw'); return { src: v?.currentSrc || '', w: v?.videoWidth || 0, dur: v?.duration || 0 }; })()`);
  ok('Preview abre a versão suavizada', /-smooth\.webm/.test(pv.src) && pv.w > 0, JSON.stringify(pv));
  ok('duração do preview suavizado ~5 s', Number(pv.dur) >= 4 && Number(pv.dur) <= 6, pv.dur);
  await replay.ev(`window.toggleSmoothHighlight(0)`);
  await esperar(400);
  const seloRaw = await replay.ev(`document.querySelector('.bc-clip-meta')?.textContent || ''`);
  ok('selo alterna para RAW', /RAW/.test(seloRaw), seloRaw.slice(0, 120));
  await replay.ev(`window.playHighlight(0)`);
  await esperar(1500);
  const autoInfo = await replay.ev(`(() => ({ src: document.querySelector('#rp-video-pvw')?.currentSrc || '', fps: document.querySelector('#rp-pvw-fps')?.textContent || '', card: document.querySelector('.bc-clip-meta')?.textContent || '' }))()`);
  ok('modo RAW fixado reproduz o RAW', !/-smooth\.webm/.test(autoInfo.src), autoInfo.src.slice(-70));
  await replay.ev(`window.toggleSmoothHighlight(0)`); // volta para AUTO/SUAVIZADO
  await esperar(300);
  await replay.ev(`window.playHighlight(0)`);
  await esperar(1500);
  const auto2 = await replay.ev(`(() => ({ src: document.querySelector('#rp-video-pvw')?.currentSrc || '', fps: document.querySelector('#rp-pvw-fps')?.textContent || '', card: document.querySelector('.bc-clip-meta')?.textContent || '' }))()`);
  ok('AUTO usa o suavizado em slow motion', /-smooth\.webm/.test(auto2.src), auto2.src.slice(-70));
  ok('medidor de fps do Preview ativo', /\d+\s*fps/i.test(auto2.fps), auto2.fps);

  // 4× (Shift+clique no ✨): dobro de quadros para 25% de velocidade
  await replay.ev(`window.smoothHighlight(0, 4)`);
  await esperar(600);
  const s4 = await replay.ev(`(async () => { const r = await fetch("/api/replay/clips"); const l = await r.json(); return l.find((c) => c.id === ${JSON.stringify(clipId)}) || null; })()`);
  ok('4× registrado (smoothFactor 4)', Number(s4?.smoothFactor) === 4, s4?.smoothFactor);
  const d4 = await replay.ev(`(async () => { const { parseWebM } = await import("/js/webm-demux.js"); const load = async (u) => { const r = await fetch(u); return parseWebM(new Uint8Array(await r.arrayBuffer())); }; const raw = await load(${JSON.stringify(saved?.webmUrl)}); const smo = await load(${JSON.stringify(s4?.smoothUrl)}); return { raw: raw.video.samples.length, smooth: smo.video.samples.length, dur: smo.durationMs }; })()`);
  ok('4× gera ~4× os quadros do RAW', Number(d4?.smooth) >= Number(d4?.raw) * 3.4, JSON.stringify(d4));
  ok('4× mantém a duração', Number(d4?.dur) > 3500 && Number(d4?.dur) < 6500, d4?.dur);

  replay.ws.close();
  studio.ws.close();
} catch (e) {
  falhas.push('exceção');
  console.log('FALHA exceção:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhas.length ? `\nREPLAY_SMOOTH_FAIL (${falhas.length}): ${falhas.join(', ')}` : '\nREPLAY_SMOOTH_OK');
process.exit(falhas.length ? 1 : 0);
