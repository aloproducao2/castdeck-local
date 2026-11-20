// SPDX-License-Identifier: AGPL-3.0-only
// Captura a janela destacada da mesa de Ã¡udio (conferÃªncia visual). Uso: SCRIPT=test/shot-popout.mjs node test/run-audio-test.mjs
import fs from 'node:fs';
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
const studio = await post('/api/studios', { name: 'ShotPop' });
const conn = async (t) => {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return { send, ev: (e) => send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true, userGesture: true }) };
};
const t = await (await fetch(`${CDP}/json/new?${base}/studio/${studio.id}?lang=pt`, { method: 'PUT' })).json();
const host = await conn(t);
await sleep(2500);
await host.ev(`document.querySelector('#lb-go')?.click()`);
await sleep(2500);
await host.ev(`window.open('/audio-popout.html','CastDeckAudioPopout','width=${process.env.W || 520},height=${process.env.H || 860}')`);
await sleep(2500);
const list = await (await fetch(`${CDP}/json/list`)).json();
const pt = list.find((x) => x.url.includes('audio-popout'));
if (!pt) throw new Error('popout nÃ£o abriu');
const pop = await conn(pt);
const m = await pop.ev(`JSON.stringify({w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,wrap:[document.querySelector('.pop-audio-wrap').scrollHeight,document.querySelector('.pop-audio-wrap').clientHeight]})`);
console.log(m.result.result.value);
const shot = await pop.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(process.env.OUT || 'dist/popout.png', Buffer.from(shot.result.data, 'base64'));
process.exit(0);

