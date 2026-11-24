// Verificação ponta a ponta da transmissão: CastDeck (WS /ingest) → FFmpeg → destino RTMP local.
// Cobre o bug do bitrate customizado (videoKbps) e confere H.264/AAC no que a "plataforma" recebe.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4597;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-rtmp-' + crypto.randomBytes(4).toString('hex'));
const FF = fs.existsSync('D:/REA/data/bin/ffmpeg.exe') ? 'D:/REA/data/bin/ffmpeg.exe' : 'ffmpeg';
const out = path.join(os.tmpdir(), 'castdeck-rtmp-local-' + Date.now() + '.flv');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join('D:/REA', 'server', 'index.js')], { cwd: 'D:/REA', env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' }, stdio: 'ignore', windowsHide: true });
let falhou = false;
const ok = (nome, cond, info = '') => { if (!cond) falhou = true; console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + String(info).slice(0, 300))); };

try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) { await esperar(600); try { pronto = (await fetch(BASE + '/')).ok; } catch {} }
  ok('servidor pronto', pronto);

  // plataforma RTMP falsa: FFmpeg escuta em 1936 e grava o que chegar
  const sink = spawn(FF, ['-v', 'error', '-y', '-listen', '1', '-timeout', '40', '-i', 'rtmp://127.0.0.1:1936/live/teste', '-c', 'copy', out], { windowsHide: true });
  const sinkDone = new Promise((r) => sink.on('close', r));
  await esperar(1800);

  const post = (p, b) => fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
  const studio = await post('/api/studios', { name: 'RTMP local' });
  const dest = await post('/api/destinations', { name: 'YouTube simulado', platform: 'custom', url: 'rtmp://127.0.0.1:1936/live', key: 'teste' });
  ok('estúdio e destino criados', !!studio?.id && !!dest?.id);

  // WebM sintético (8 s)
  const gen = spawn(FF, ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30', '-f', 'lavfi', '-i', 'sine=f=440:r=48000', '-t', '8', '-c:v', 'libvpx', '-b:v', '3M', '-c:a', 'libopus', '-f', 'webm', 'pipe:1'], { windowsHide: true });
  const chunks = [];
  gen.stdout.on('data', (d) => chunks.push(d));
  await new Promise((r) => gen.on('close', r));
  const webm = Buffer.concat(chunks);
  ok('amostra WebM gerada', webm.length > 50_000, webm.length);

  const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ingest`);
  let lastStatus = null;
  const erros = [];
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.type === 'status') lastStatus = m; if (m.type === 'error') erros.push(m.message); });
  await new Promise((r) => ws.on('open', r));
  // bitrate customizado = exatamente o caminho que estourava "videoKbps is not defined"
  ws.send(JSON.stringify({ type: 'start', studioId: studio.id, destinationIds: [dest.id], record: false, preset: '720p30', encoder: 'libx264', videoKbps: 5000 }));
  await esperar(900);
  ok('start sem erro de videoKbps', !erros.some((e) => /videoKbps|not defined/i.test(e)), erros[0] || '');
  for (let i = 0; i < webm.length; i += 32768) { ws.send(webm.subarray(i, i + 32768)); await esperar(20); }
  await esperar(1200);
  const states = (lastStatus?.outputs || []).map((o) => `${o.name}:${o.state}`);
  ws.send(JSON.stringify({ type: 'stop' }));
  await new Promise((r) => { if (ws.readyState === 3) r(); else ws.on('close', r); setTimeout(r, 8000); });
  await Promise.race([sinkDone, esperar(15000)]);
  try { sink.kill(); } catch {}

  const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
  ok('destino recebeu o stream RTMP', size > 50_000, `${size} bytes`);
  // sem ffprobe no pacote: o próprio FFmpeg lista os streams ao abrir o FLV
  const probe = spawn(FF, ['-hide_banner', '-i', out, '-f', 'null', '-'], { windowsHide: true });
  let pr = '';
  probe.stderr.on('data', (d) => (pr += d));
  await new Promise((r) => probe.on('close', r));
  const info = pr.split('\n').filter((l) => /Stream #|Video:|Audio:/.test(l)).join(' | ');
  ok('vídeo H.264 1280x720', /Video: h264.*1280x720/i.test(pr), info.slice(0, 240));
  ok('áudio AAC', /Audio: aac/i.test(pr), info.slice(0, 240));
  ok('sem erro no servidor', !erros.length, erros.join(' | '));
  console.log('  estados durante a live:', states.join(', ') || '(n/d)');

  await fetch(`${BASE}/api/studios/${studio.id}`, { method: 'DELETE' });
  await fetch(`${BASE}/api/destinations/${dest.id}`, { method: 'DELETE' });
} catch (e) {
  falhou = true;
  console.log('ERRO:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(out, { force: true }); } catch {}
}
console.log(falhou ? '\nRTMP_LOCAL_FAIL' : '\nRTMP_LOCAL_OK');
process.exit(falhou ? 1 : 0);
