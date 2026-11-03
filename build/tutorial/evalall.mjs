// Avalia uma expressão em todas as abas do servidor do tutorial (diagnóstico)
const expr = process.argv[2];
const l = await (await fetch('http://127.0.0.1:9335/json/list')).json();
for (const t of l.filter((x) => x.type === 'page' && x.url.includes(':3200'))) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const r = await new Promise((res) => {
    ws.onmessage = (e) => res(JSON.parse(e.data));
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    setTimeout(() => res({ timeout: 1 }), 4000);
  });
  console.log(new URL(t.url).pathname, JSON.stringify(r.result?.result?.value ?? r));
  ws.close();
}
process.exit(0);
