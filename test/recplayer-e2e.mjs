// Player das gravações (aba Gravações do painel). BASE=http://localhost:3100 node test/recplayer-e2e.mjs
// Usa uma pasta temporária com cópias de gravações antigas (MP4 fragmentado) e verifica:
// cards, abrir o player, "preparar" (vira MP4 normal com duração e busca), próxima, excluir pelo player.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const SHOT = process.env.SHOT || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const v = await (await fetch(`${CDP}/json/version`)).json();
const bws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let bid = 0; const bp = new Map();
bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bp.has(m.id)) { bp.get(m.id)(m); bp.delete(m.id); } };
const bsend = (method, params = {}) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
async function open(url) {
  const { result } = await bsend('Target.createTarget', { url: 'about:blank' });
  const ws = new WebSocket(`ws://127.0.0.1:9333/devtools/page/${result.targetId}`);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 860, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(()=>{if(window.__autoOk)return true;window.__autoOk=new MutationObserver(()=>document.querySelector(".modal-back [data-ok]")?.click());window.__autoOk.observe(document,{childList:true,subtree:true});return true})();' });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  await send('Page.navigate', { url });
  return { ev, errors, send, close: () => bsend('Target.closeTarget', { targetId: result.targetId }) };
}
const waitFor = async (p, expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.ev(expr)) return true; } catch {} await sleep(250); } return false; };
let fails = 0;
const check = (n, ok, extra = '') => { console.log((ok ? 'OK   ' : 'FALHA'), n, ok ? '' : extra); if (!ok) fails++; };
const put = (body) => fetch(base + '/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const fragmented = (f) => { const b = fs.readFileSync(f).subarray(0, 256 * 1024); return b.includes('moof') || b.includes('mvex'); };
const shot = async (p, name) => { if (!SHOT) return; const r = await p.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOT, name), Buffer.from(r.result.data, 'base64')); };

// --- pasta temporária com 2 gravações antigas copiadas da pasta atual
const sys0 = await (await fetch(base + '/api/system')).json();
const orig = sys0.recordingsDir === sys0.recordingsDefault ? '' : sys0.recordingsDir;
const src = fs.readdirSync(sys0.recordingsDir).filter((f) => /\.mp4$/i.test(f) && fragmented(path.join(sys0.recordingsDir, f))).slice(0, 2);
if (src.length < 2) { console.log('Sem 2 gravações fragmentadas em', sys0.recordingsDir, '- grave algo com uma versão antiga ou rode test/rec-e2e.mjs.'); process.exit(2); }
const dir = path.join(os.tmpdir(), 'castdeck-playertest');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const names = ['Teste-Player_2026-01-01_10-00-00.mp4', 'Teste-Player_2026-01-01_09-00-00.mp4'];
src.forEach((f, i) => { fs.copyFileSync(path.join(sys0.recordingsDir, f), path.join(dir, names[i])); fs.utimesSync(path.join(dir, names[i]), new Date(), new Date(Date.now() - i * 60000)); });
check('cópias são MP4 fragmentado (caso antigo)', names.every((n) => fragmented(path.join(dir, n))));
check('pasta temporária aceita', (await put({ recordingsDir: dir })).ok);

try {
  const p = await open(base + '/#gravacoes');
  check('aba Gravações mostra 2 cards', await waitFor(p, `document.querySelectorAll('.rec-card').length === 2`));
  check('miniaturas carregam', await waitFor(p, `[...document.querySelectorAll('.rec-thumb video')].some(v => v.readyState >= 2)`, 10000));
  await shot(p, 'rec_cards.png');

  // --- abre o player na 1ª gravação
  const size0 = fs.statSync(path.join(dir, names[0])).size;
  await p.ev(`document.querySelector('.rec-card .btn[data-play="0"]').click()`);
  check('player abriu', await waitFor(p, `!!document.querySelector('#rp-video')`, 5000));
  check('vídeo carregou com duração', await waitFor(p, `(() => { const v = document.querySelector('#rp-video'); return v && v.readyState >= 1 && isFinite(v.duration) && v.duration > 1; })()`, 20000));
  check('aviso "Preparando" sumiu', await p.ev(`document.querySelector('#rp-over').hidden`));
  const f0 = path.join(dir, names[0]);
  check('arquivo virou MP4 normal (faststart)', !fragmented(f0), 'ainda fragmentado');
  const size1 = fs.statSync(f0).size;
  check('tamanho preservado (remux sem perda)', size1 > size0 * 0.9 && size1 < size0 * 1.1, `${size0} -> ${size1}`);
  check('sem arquivo temporário sobrando', !fs.readdirSync(dir).some((f) => /finalizando/.test(f)));
  const info = await p.ev(`document.querySelector('#rp-info').textContent`);
  check('info mostra duração e resolução', /\d+:\d{2}/.test(info) && /\d+×\d+/.test(info), info);

  // --- busca (antes, no MP4 fragmentado, a barra não funcionava)
  const seek = await p.ev(`new Promise((ok) => { const v = document.querySelector('#rp-video'); const to = v.duration / 2; v.addEventListener('seeked', () => ok({ to, at: v.currentTime }), { once: true }); v.currentTime = to; setTimeout(() => ok({ to, at: -1 }), 5000); })`);
  check('busca no meio do vídeo', Math.abs(seek.at - seek.to) < 1.5, JSON.stringify(seek));
  await sleep(600);
  await shot(p, 'rec_player.png');

  // --- velocidade e próxima
  await p.ev(`(() => { const s = document.querySelector('#rp-speed'); s.value = '1.5'; s.dispatchEvent(new Event('change')); })()`);
  check('velocidade 1.5×', await p.ev(`document.querySelector('#rp-video').playbackRate === 1.5`));
  check('"anterior" desabilitado na 1ª', await p.ev(`document.querySelector('#rp-prev').disabled`));
  await p.ev(`document.querySelector('#rp-next').click()`);
  check('próxima gravação carregou', await waitFor(p, `(() => { const v = document.querySelector('#rp-video'); return /09-00-00/.test(v.currentSrc) && v.readyState >= 1 && isFinite(v.duration); })()`, 20000));
  check('2ª também foi preparada', !fragmented(path.join(dir, names[1])));

  // --- excluir pelo player (o vídeo é solto antes; no Windows arquivo aberto não pode ser apagado)
  await p.ev(`document.querySelector('#rp-del').click()`);
  check('excluída do disco', await waitFor(p, `true`, 100) && (await (async () => { for (let k = 0; k < 20; k++) { if (!fs.existsSync(path.join(dir, names[1]))) return true; await sleep(250); } return false; })()));
  check('player voltou para a que sobrou', await waitFor(p, `/10-00-00/.test(document.querySelector('#rp-video')?.currentSrc || '')`, 10000));
  // --- fechar solta o arquivo
  await p.ev(`document.querySelector('.rp [data-close]').click()`);
  check('player fechou', await waitFor(p, `!document.querySelector('#rp-video')`, 5000));
  check('lista atualizada (1 card)', await waitFor(p, `document.querySelectorAll('.rec-card').length === 1`, 5000));

  // --- rotas protegidas contra caminhos
  const bad = await fetch(base + '/api/recordings/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '..\\..\\Windows\\win.ini' }) });
  check('prepare recusa caminho/arquivo que não é vídeo', bad.status === 404);
  const errs = p.errors.filter((e) => !/Receiving end does not exist/.test(e));
  check('sem erros de JS', errs.length === 0, errs.join(' | '));
  await p.close();
} finally {
  await put({ recordingsDir: orig });
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} falha(s)` : '\nTudo certo');
process.exit(fails ? 1 : 0);
