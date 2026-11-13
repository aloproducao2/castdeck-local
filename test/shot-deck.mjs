// SPDX-License-Identifier: AGPL-3.0-only
// Captura a barra #gcbar do estúdio (conferência visual). Uso: SCRIPT=test/shot-deck.mjs node test/run-audio-test.mjs
import fs from 'node:fs';
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const studio = await post('/api/studios', { name: 'Shot' });
const t = await (await fetch(`${CDP}/json/new?${base}/studio/${studio.id}?lang=pt`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });
await sleep(2500);
const ev = (e) => send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
await ev(`document.querySelector('#lb-go')?.click()`);
await sleep(2500);
if (process.env.CLICK) { await ev(`document.querySelector('${process.env.CLICK}')?.click()`); await sleep(800); }
const r = await ev(`(()=>{const b=document.querySelector('${process.env.SEL || '#gcbar'}').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}})()`);
const clip = { ...r.result.result.value, scale: 1 };
const shot = await send('Page.captureScreenshot', { format: 'png', clip });
fs.writeFileSync(process.env.OUT || 'dist/deck.png', Buffer.from(shot.result.data, 'base64'));
console.log('ok', JSON.stringify(clip));
process.exit(0);


