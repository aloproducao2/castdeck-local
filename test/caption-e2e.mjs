// Teste ponta a ponta da legenda ao vivo no servidor (sem navegador):
//   servidor de teste:  $env:PORT=3100; $env:HTTPS_PORT=3543; node server/index.js
//   depois:             $env:BASE='http://localhost:3100'; node test/caption-e2e.mjs
// Faz o papel do estúdio: liga a legenda (modelo "leve"), manda um WAV de fala em tempo real pelo WS /caption
// e confere que o texto chega ao estúdio e ao link público (SSE /api/cc/<estúdio>/stream), que a chave do link
// é exigida fora deste PC, que "gerar novo link" derruba o antigo e que desligar encerra o worker.
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const BASE = process.env.BASE || 'http://localhost:3100';
const HTTPS_PORT = process.env.HTTPS_PORT || 3543;
const WAV = process.env.WAV || path.resolve('build', 'tmp', 'caption-test', 'fala.wav');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'OK   ' : 'FALHA'} ${name} ${extra}`);
  if (!ok) fails++;
};
const api = async (p, opts = {}) => {
  const r = await fetch(BASE + '/api' + p, { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.status), { status: r.status, body: j });
  return j;
};
// requisição pela rede local (IP da LAN, HTTPS autoassinado): o servidor trata como "fora deste PC"
const lanIp = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
const lanGet = (p) =>
  new Promise((resolve) => {
    if (!lanIp) return resolve({ status: 0 });
    https.get({ host: lanIp, port: HTTPS_PORT, path: p, rejectUnauthorized: false }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', () => resolve({ status: -1 }));
  });

if (!fs.existsSync(WAV)) {
  console.log('PULADO: falta o WAV de teste (rode test/caption-worker.test.mjs antes para ver como gerar)');
  process.exit(0);
}
const info0 = await api('/caption');
if (!info0.available) {
  console.log('PULADO: worker da legenda não disponível neste sistema/build');
  process.exit(0);
}
let studios = await api('/studios');
let studio = studios[0] || (await api('/studios', { method: 'POST', body: { name: 'Teste legenda' } }));
const sid = studio.id;

// link público
const link = await api(`/caption/link/${sid}`);
check('link da legenda gerado', !!link.key && link.path.includes(`/cc/${sid}`));
const bad = await lanGet(`/api/cc/${sid}/info?k=errada`);
check('fora deste PC: chave errada é recusada', bad.status === 403 || bad.status === 0, `(${bad.status})`);
const good = await lanGet(`/api/cc/${sid}/info?k=${link.key}`);
check('fora deste PC: chave certa é aceita', good.status === 200 || good.status === 0, `(${good.status})`);
const page = await fetch(`${BASE}/cc/${sid}?k=${link.key}`);
check('página /cc abre', page.ok && (await page.text()).includes('cc.js'));

// estúdio: WS do áudio/texto
const ws = new WebSocket(BASE.replace(/^http/, 'ws') + '/caption');
const studioEvents = [];
ws.on('message', (d) => studioEvents.push(JSON.parse(String(d))));
await new Promise((r, j) => (ws.once('open', r), ws.once('error', j)));

// link: SSE
const sse = [];
const ac = new AbortController();
fetch(`${BASE}/api/cc/${sid}/stream`, { signal: ac.signal })
  .then(async (r) => {
    const rd = r.body.getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await rd.read();
      if (done) break;
      buf += Buffer.from(value).toString();
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (line) sse.push(JSON.parse(line.slice(6)));
      }
    }
  })
  .catch(() => {});

const t0 = Date.now();
await api('/caption/start', { method: 'POST', body: { studioId: sid, model: 'leve', lang: 'pt', mode: 'both' } }).catch((e) => check('ligar a legenda', false, e.message));
let st;
for (let i = 0; i < 600; i++) {
  st = await api(`/caption?studio=${sid}`);
  if (st.status === 'running' || st.status === 'error') break;
  await sleep(500);
}
check('worker iniciou', st.status === 'running', `(${st.status}${st.error ? ': ' + st.error : ''}, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);

// manda a fala em tempo real (blocos de 100 ms), com 1 s de silêncio antes e 2 s depois
const pcm = fs.readFileSync(WAV).subarray(44);
const all = Buffer.concat([Buffer.alloc(32000), pcm, Buffer.alloc(64000)]);
for (let off = 0; off < all.length; off += 3200) {
  ws.send(all.subarray(off, off + 3200));
  await sleep(100);
}
await sleep(2500);
const finals = studioEvents.filter((e) => e.type === 'final' && e.text);
const pt = finals.filter((e) => e.lang === 'pt').map((e) => e.text).join(' ');
const en = finals.filter((e) => e.lang === 'en').map((e) => e.text).join(' ');
console.log('     PT:', pt);
console.log('     EN:', en);
check('estúdio recebeu a legenda em português', /programa/i.test(pt) && /legenda/i.test(pt));
check('estúdio recebeu parciais', studioEvents.some((e) => e.type === 'partial'));
check('modo duplo: também em inglês', en.length > 10);
check('link (SSE) recebeu o histórico/finais', sse.some((e) => e.type === 'hello') && sse.filter((e) => e.type === 'final' && e.text).length >= finals.length);

// gerar novo link derruba quem estava conectado
await api(`/caption/link/${sid}?regen=1`);
await sleep(300);
check('gerar novo link avisa o link antigo', sse.some((e) => e.type === 'revoked'));
ac.abort();

await api('/caption/stop', { method: 'POST' });
await sleep(1800);
st = await api(`/caption?studio=${sid}`);
check('desligar encerra o worker', st.status === 'off');
ws.close();
console.log(fails ? `\n${fails} falha(s)` : '\nTudo OK');
process.exit(fails ? 1 : 0);

