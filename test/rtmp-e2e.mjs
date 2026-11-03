// Teste de restreaming: servidor RTMP local (FFmpeg em modo listen) <- CastDeck <- webm sintético.
// Requer o servidor rodando em localhost:3000. Uso: node test/rtmp-e2e.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const base = 'http://localhost:3000';
const post = (p, b, m = 'POST') => fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const out = path.join(os.tmpdir(), `castdeck-rtmp-${Date.now()}.flv`);
let ok = true;
const check = (n, c, i = '') => { if (!c) ok = false; console.log(c ? 'PASS' : 'FAIL', n, i); };

// 1) "plataforma" RTMP falsa: FFmpeg escuta em 1936 e grava o que chegar
const sink = spawn('ffmpeg', ['-v', 'error', '-y', '-listen', '1', '-timeout', '30', '-i', 'rtmp://127.0.0.1:1936/live/teste', '-c', 'copy', out]);
let sinkErr = '';
const sinkDone = new Promise((r) => sink.on('close', r));
sink.stderr.on('data', (d) => (sinkErr += d));
await new Promise((r) => setTimeout(r, 1500));

const studio = await post('/api/studios', { name: 'RTMP E2E' });
const dest = await post('/api/destinations', { name: 'RTMP local', platform: 'custom', url: 'rtmp://127.0.0.1:1936/live', key: 'teste' });

// 2) webm sintético (6 s) -> /ingest
const gen = spawn('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30', '-f', 'lavfi', '-i', 'sine=f=440:r=48000', '-t', '8', '-c:v', 'libvpx', '-b:v', '3M', '-c:a', 'libopus', '-f', 'webm', 'pipe:1']);
const chunks = [];
gen.stdout.on('data', (d) => chunks.push(d));
await new Promise((r) => gen.on('close', r));
const webm = Buffer.concat(chunks);

const ws = new WebSocket('ws://localhost:3000/ingest');
let lastStatus = null;
ws.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'status') lastStatus = m; if (m.type === 'error') console.log('server error:', m.message); });
await new Promise((r) => ws.on('open', r));
ws.send(JSON.stringify({ type: 'start', studioId: studio.id, destinationIds: [dest.id], record: false, preset: '720p30', encoder: 'libx264' }));
await new Promise((r) => setTimeout(r, 800));
for (let i = 0; i < webm.length; i += 32768) { ws.send(webm.subarray(i, i + 32768)); await new Promise((r) => setTimeout(r, 20)); }
const states = (lastStatus?.outputs || []).map((o) => `${o.name}:${o.state}`);
ws.send(JSON.stringify({ type: 'stop' }));
await new Promise((r) => ws.on('close', r));
await Promise.race([sinkDone, new Promise((r) => setTimeout(r, 15000))]);
sink.kill();

// 3) valida o que a "plataforma" recebeu
const probe = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', out]);
let pr = '';
probe.stdout.on('data', (d) => (pr += d));
await new Promise((r) => probe.on('close', r));
const size = fs.existsSync(out) ? fs.statSync(out).size : 0;
check('destino recebeu stream RTMP', size > 50_000, `${size} bytes`);
check('vídeo H.264 1280x720', /h264,1280,720/.test(pr), pr.replace(/\s+/g, ' '));
check('áudio AAC', /aac/.test(pr));
console.log('  estados durante a live:', states.join(', ') || '(n/d)');
if (sinkErr.trim()) console.log('  sink:', sinkErr.trim().split('\n').slice(-2).join(' | '));

await fetch(`${base}/api/studios/${studio.id}`, { method: 'DELETE' });
await fetch(`${base}/api/destinations/${dest.id}`, { method: 'DELETE' });
fs.rmSync(out, { force: true });
process.exit(ok ? 0 : 1);
