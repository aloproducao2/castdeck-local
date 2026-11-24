// Spike do playout WebCodecs: demuxa um clipe WebM real do replay e decodifica todos os quadros
// com VideoDecoder (VP8), medindo taxa de decodificação e desenho em canvas.
// Base do playout quadro-a-quadro da Fase 3.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4577, CDP = 9587;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-wc-' + crypto.randomBytes(4).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
const perfil = path.join(os.tmpdir(), 'cd-wc-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });

async function conectar(alvo) {
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0; const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cmd = (method, params = {}) => new Promise((res) => { const id = ++seq; const t = setTimeout(() => { pend.delete(id); res({ result: { exceptionDetails: { exception: { description: 'timeout' } } } }); }, 90000); pend.set(id, (m) => { clearTimeout(t); res(m); }); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => { const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true, userGesture: true }); if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description || '').slice(0, 500)); return r.result?.result?.value; };
  await cmd('Runtime.enable'); await cmd('Page.enable');
  return { ws, cmd, ev };
}
const listar = async () => (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json());
let falhou = false;
const ok = (nome, cond, info = '') => { if (!cond) falhou = true; console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + String(info).slice(0, 400))); };

try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) { await esperar(600); try { pronto = (await fetch(BASE + '/')).ok; } catch {} }
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'WC' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) { await esperar(500); try { alvo = (await listar()).find((t) => t.type === 'page' && !t.url.includes('replay.html')); } catch {} }
  const studio = await conectar(alvo);
  await studio.cmd('Page.navigate', { url: `${BASE}/studio/${sid}` });
  await esperar(4000);
  await studio.ev(`document.querySelector('#lb-go')?.click()`);
  for (let i = 0; i < 40; i++) { if (await studio.ev(`!!document.querySelector('#program-canvas')`)) break; await esperar(500); }
  await studio.ev(`window.open('/replay.html','CastDeckReplayConsole','width=1200,height=700')`);
  let cAlvo = null;
  for (let i = 0; i < 40 && !cAlvo; i++) { await esperar(500); try { cAlvo = (await listar()).find((t) => t.url.includes('replay.html')); } catch {} }
  const replay = await conectar(cAlvo);
  await replay.cmd('Page.navigate', { url: `${BASE}/replay.html` });
  await esperar(3000);
  ok('console conectado', await replay.ev(`!!window.opener?.__castdeck?.replayEngine`));

  let dur = 0;
  for (let i = 0; i < 40 && dur < 6; i++) { await esperar(500); dur = await replay.ev(`window.opener.__castdeck.replayEngine.getStats?.().duration || 0`).catch(() => 0); }
  const saved = await replay.ev(`(async () => {
    const eng = window.opener.__castdeck.replayEngine;
    const clip = await eng.createClip(5);
    if (!clip) return { erro: 'sem clipe' };
    const meta = await eng.saveClipToDisk(clip, { title: 'WC', tag: 'GOL', speed: 0.5, markIn: 0, markOut: 5 });
    return meta ? { id: meta.id, webmUrl: meta.webmUrl } : { erro: 'save falhou' };
  })()`);
  ok('clipe salvo', !!saved?.webmUrl, JSON.stringify(saved).slice(0, 200));

  const r = await replay.ev(`(async () => {
    try {
      const { parseWebM } = await import('/js/webm-demux.js');
      const res = await fetch(${JSON.stringify(saved.webmUrl)});
      const buf = new Uint8Array(await res.arrayBuffer());
      const dem = parseWebM(buf);
      const frames = [];
      let decodeError = null;
      const t0 = performance.now();
      const dec = new VideoDecoder({ output: (f) => frames.push(f), error: (e) => { decodeError = String(e); } });
      dec.configure({ codec: 'vp8', codedWidth: dem.video.width || 1280, codedHeight: dem.video.height || 720, optimizeForLatency: true });
      let started = false;
      for (const s of dem.video.samples) {
        if (!started) { if (!s.key) continue; started = true; }
        dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.timestamp, data: s.data }));
      }
      await dec.flush();
      const decodeMs = performance.now() - t0;
      const canvas = document.createElement('canvas');
      canvas.width = dem.video.width || 1280;
      canvas.height = dem.video.height || 720;
      const ctx = canvas.getContext('2d');
      const t1 = performance.now();
      const f0 = frames[0];
      const frameW = f0 ? (f0.displayWidth || f0.codedWidth || 0) : 0;
      const frameH = f0 ? (f0.displayHeight || f0.codedHeight || 0) : 0;
      for (const f of frames) { ctx.drawImage(f, 0, 0); f.close(); }
      const drawMs = performance.now() - t1;
      dec.close();
      return {
        ok: true, codec: dem.video.codec, samples: dem.video.samples.length, audioSamples: dem.audio.samples.length,
        decoded: frames.length, width: frameW, height: frameH, demuxWidth: dem.video.width, demuxHeight: dem.video.height,
        tracks: dem.tracks, durationMs: dem.durationMs, decodeMs: +decodeMs.toFixed(1), drawMs: +drawMs.toFixed(1), error: decodeError,
      };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  })()`);
  console.log('metrics:', JSON.stringify(r));
  ok('demux/decoder sem erro', r?.ok === true && !r?.error, r?.error);
  ok('quadros de vídeo encontrados (> 20)', Number(r?.samples) > 20, r?.samples);
  ok('todos os quadros decodificados', Number(r?.decoded) === Number(r?.samples), `${r?.decoded}/${r?.samples}`);
  ok('áudio Opus presente', Number(r?.audioSamples) > 0, r?.audioSamples);
  ok('decodifica mais rápido que tempo real', Number(r?.decodeMs) < Number(r?.durationMs), `${r?.decodeMs}ms para ${r?.durationMs}ms`);
  ok('quadros têm dimensão (VideoFrame)', Number(r?.width) > 0, `${r?.width}x${r?.height}`);
  ok('desenho em canvas rápido (per frame < 8 ms)', Number(r?.drawMs) / Math.max(1, Number(r?.decoded)) < 8, `${(Number(r?.drawMs) / Math.max(1, Number(r?.decoded))).toFixed(2)} ms/frame`);
  replay.ws.close(); studio.ws.close();
} catch (e) {
  falhou = true;
  console.log('ERRO:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhou ? '\nREPLAY_WEBCODECS_FAIL' : '\nREPLAY_WEBCODECS_OK');
process.exit(falhou ? 1 : 0);
