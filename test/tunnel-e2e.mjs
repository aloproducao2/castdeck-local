// Testa o link externo (classe Tunnel real + cloudflared embutido em build/vendor/<sistema>/), sem navegador.
//   node test/tunnel-e2e.mjs            (RUNS=3 por padrão; LHR=1 também testa o localhost.run)
// Confere: o link fica pronto (status "on") várias vezes seguidas, a verificação passa pela borda do provedor sem
// depender do DNS deste PC (a causa do "Cloudflare encerrou (código null)"), o link responde de fora e o restart
// abre um link novo. Antes da 1.2.18 o primeiro teste envenenava o cache de DNS e o túnel era derrubado aos 60 s.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Tunnel } from '../server/tunnel.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const key = `${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'macos' : 'linux'}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
const cf = path.join(root, 'build', 'vendor', key, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
if (!fs.existsSync(cf)) {
  console.error(`FALHA cloudflared não encontrado em ${cf} (rode um build antes)`);
  process.exit(1);
}
const RUNS = +(process.env.RUNS || 3);
let fails = 0;
const check = (n, ok, extra = '') => { console.log(ok ? 'OK   ' : 'FALHA', n, ok ? '' : extra); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// servidor local no lugar do CastDeck: só o endpoint que o túnel usa para se verificar
const srv = http.createServer((q, r) => {
  r.setHeader('content-type', 'application/json');
  r.end(q.url.startsWith('/api/public/ice') ? '{"iceServers":[]}' : '{}');
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const port = srv.address().port;

const deps = { state: { cloudflared: { status: 'ready' } }, exists: () => true, ensure: async () => cf };
function waitOn(t, ms) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const errs = [];
    const fn = () => {
      if (t.status === 'error' && t.error && !errs.includes(t.error)) errs.push(t.error);
      if (t.status === 'on') done(true);
    };
    const timer = setTimeout(() => done(false), ms);
    function done(ok) {
      clearTimeout(timer);
      t.off('change', fn);
      resolve({ ok, ms: Date.now() - t0, url: t.url, errs });
    }
    t.on('change', fn);
    fn();
  });
}
// acesso "de fora": DNS público via DoH (não usa o cache deste PC) e conexão no IP devolvido
async function fromOutside(url) {
  const host = new URL(url).host;
  for (let i = 0; i < 10; i++) {
    try {
      const j = await (await fetch(`https://1.1.1.1/dns-query?name=${host}&type=A`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) })).json();
      const ip = (j.Answer || []).find((a) => a.type === 1)?.data;
      if (ip) {
        const code = await new Promise((res) => {
          const rq = https.request({ host: ip, servername: host, headers: { host }, path: '/api/public/ice', timeout: 8000 }, (r) => (r.resume(), res(r.statusCode)));
          rq.on('timeout', () => rq.destroy());
          rq.on('error', () => res(0));
          rq.end();
        });
        if (code === 200) return true;
      }
    } catch {}
    await sleep(2000);
  }
  return false;
}

try {
  const t = new Tunnel(deps, () => 'cloudflare');
  let edgeOk = 0;
  let edgeTry = 0;
  let sysOk = 0;
  const pv = t.probeVia.bind(t);
  t.probeVia = async (...a) => { edgeTry++; const ok = await pv(...a); if (ok) edgeOk++; return ok; };
  const pr = t.probe.bind(t);
  t.probe = async (url, allow) => { const e0 = edgeOk; const ok = await pr(url, allow); if (ok && edgeOk === e0) sysOk++; return ok; };
  const urls = new Set();
  for (let run = 1; run <= RUNS; run++) {
    if (run === 1) t.start(port);
    else t.restart();
    const r = await waitOn(t, 100000);
    console.log(`     rodada ${run}: ${r.ok ? `pronto em ${(r.ms / 1000).toFixed(1)} s` : 'NÃO ficou pronto'} ${r.url || ''} | sondas na borda: ${edgeTry} (ok ${edgeOk}), ok pelo DNS do sistema: ${sysOk}${r.errs.length ? ' | erros: ' + r.errs.join(' / ') : ''}`);
    edgeTry = 0;
    check(`rodada ${run}: link do Cloudflare pronto em até 100 s`, r.ok, r.errs.join(' / '));
    if (!r.ok) continue;
    check(`rodada ${run}: sem erro antes de ficar pronto`, !r.errs.length, r.errs.join(' / '));
    check(`rodada ${run}: link responde de fora (DNS público)`, await fromOutside(r.url));
    urls.add(r.url);
    if (run < RUNS) await sleep(3000);
  }
  check('verificação passou pela borda, sem depender do DNS deste PC', edgeOk > 0, `edgeOk=${edgeOk}`);
  check('restart gera link novo a cada vez', urls.size === Math.min(RUNS, urls.size) && urls.size >= Math.min(RUNS, 2));
  t.stop();
  check('stop: status off e processo encerrado', t.status === 'off' && !t.proc);

  if (process.env.LHR === '1') {
    const l = new Tunnel(deps, () => 'localhostrun');
    l.start(port);
    const r = await waitOn(l, 90000);
    console.log(`     localhost.run: ${r.ok ? `pronto em ${(r.ms / 1000).toFixed(1)} s ${r.url}` : 'não ficou pronto'} ${r.errs.join(' / ')}`);
    check('localhost.run (reserva) abre o link', r.ok, r.errs.join(' / '));
    l.stop();
  }
} catch (e) {
  console.error('FALHA', e.stack || e.message);
  fails++;
}
srv.close();
console.log(fails ? `\n${fails} falha(s)` : '\nTudo OK');
process.exit(fails ? 1 : 0);
