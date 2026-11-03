// diagnóstico: captura todas as abas do servidor do tutorial
import fs from 'node:fs';
const CDP = 'http://127.0.0.1:9335';
const list = (await (await fetch(`${CDP}/json/list`)).json()).filter((t) => t.type === 'page');
let n = 0;
for (const t of list) {
  console.log(n, t.url);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const r = await Promise.race([
    new Promise((res) => { ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) res(m); }; ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } })); }),
    new Promise((res) => setTimeout(() => res(null), 5000)),
  ]);
  if (r?.result) fs.writeFileSync(`D:/REA/build/tmp/tutorial/diag-${n}.png`, Buffer.from(r.result.data, 'base64'));
  else console.log('  sem resposta (diálogo aberto?)');
  ws.close();
  n++;
}
process.exit(0);
