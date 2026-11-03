// Teste de integração: webm sintético -> /ingest -> FFmpeg -> MP4 gravado.
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const base = 'http://localhost:3000';
const j = (p, o) => fetch(base + p, o).then((r) => r.json());
const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Teste E2E' }) })).json();

const gen = spawn('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30', '-f', 'lavfi', '-i', 'sine=f=440:r=48000', '-t', '6', '-c:v', 'libvpx', '-b:v', '3M', '-c:a', 'libopus', '-f', 'webm', 'pipe:1']);
const chunks = [];
gen.stdout.on('data', (d) => chunks.push(d));
gen.stderr.on('data', (d) => console.error('gen:', d.toString()));
await new Promise((r) => gen.on('close', r));
const webm = Buffer.concat(chunks);
console.log('webm bytes', webm.length);

const ws = new WebSocket('ws://localhost:3000/ingest');
ws.on('message', (d) => { const m = JSON.parse(d); if (m.type !== 'status') console.log('<-', m.type, m.message || '', JSON.stringify(m.outputs || '')); });
await new Promise((r) => ws.on('open', r));
ws.send(JSON.stringify({ type: 'start', studioId: studio.id, destinationIds: [], record: true, preset: '720p30', encoder: 'libx264' }));
await new Promise((r) => setTimeout(r, 500));
for (let i = 0; i < webm.length; i += 32768) { ws.send(webm.subarray(i, i + 32768)); await new Promise((r) => setTimeout(r, 15)); }
ws.send(JSON.stringify({ type: 'stop' }));
await new Promise((r) => ws.on('close', r));
console.log('recordings', JSON.stringify(await j('/api/recordings')));
await fetch(base + '/api/studios/' + studio.id, { method: 'DELETE' });
