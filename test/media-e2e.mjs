// E2E do playout: mídia que o navegador NÃO toca direto (MKV/AVI/TS/WebM) é convertida pelo servidor
// para MP4 H.264+AAC e entra na lista; MP4 passa direto (sem conversão).
// Também protege a regressão do Safari: o seletor de arquivos precisa ter área clicável (nada de `hidden`).
// Uso: node scratch/ux-audit/run-e2e.mjs test/media-e2e.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CDP = `http://127.0.0.1:${process.env.CDP_PORT || 9333}`;
const base = process.env.BASE || 'http://127.0.0.1:4195';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') => {
  results.push([name, !!ok]);
  console.log(ok ? 'PASS' : 'FAIL', name, info);
};

const FF = process.env.FFMPEG || path.resolve('build/vendor/win-x64/ffmpeg.exe');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-media-'));

function fixture(nome, args) {
  const out = path.join(tmp, nome);
  const r = spawnSync(FF, ['-hide_banner', '-v', 'error', '-y', ...args, out], { encoding: 'utf8' });
  if (r.status !== 0) console.log('  (fixture falhou)', nome, (r.stderr || '').trim().split('\n')[0]);
  return fs.existsSync(out) ? out : null;
}

const fonte = ['-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3'];
const arquivos = {
  mp4: fixture('clipe.mp4', [...fonte, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest']),
  mkv: fixture('clipe.mkv', [...fonte, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest']),
  avi: fixture('clipe.avi', [...fonte, '-c:v', 'mpeg4', '-c:a', 'libmp3lame', '-shortest']),
  webm: fixture('clipe.webm', [...fonte, '-c:v', 'libvpx', '-c:a', 'libvorbis', '-shortest']),
  ts: fixture('clipe.ts', [...fonte, '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'aac', '-f', 'mpegts', '-shortest']),
};

// ---------- API: conversão ----------
async function converter(caminho, mode = 'media') {
  const buf = fs.readFileSync(caminho);
  const r = await fetch(`${base}/api/media/convert?mode=${mode}`, { method: 'POST', body: buf });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}

function probe(caminho) {
  const r = spawnSync(FF, ['-hide_banner', '-i', caminho], { encoding: 'utf8' });
  const txt = r.stderr || '';
  return {
    v: (txt.match(/: Video: (\w+)/) || [])[1] || '',
    a: (txt.match(/: Audio: (\w+)/) || [])[1] || '',
  };
}

for (const [nome, caminho] of Object.entries(arquivos)) {
  if (!caminho) continue;
  const { status, j } = await converter(caminho);
  const okConvert = status === 200 && !!j.url;
  check(`converte ${nome.toUpperCase()} para MP4`, okConvert, JSON.stringify({ status, url: j.url, err: j.error }).slice(0, 200));
  if (!okConvert) continue;
  const file = await fetch(base + j.url).then((r) => (r.ok ? r.arrayBuffer() : null));
  check(`${nome.toUpperCase()} convertido é servido`, !!file && file.byteLength > 1000, file ? `${file.byteLength} bytes` : 'sem corpo');
  if (!file) continue;
  const tmpMp4 = path.join(tmp, `out-${nome}.mp4`);
  fs.writeFileSync(tmpMp4, Buffer.from(file));
  const p = probe(tmpMp4);
  check(`${nome.toUpperCase()} -> H.264 + AAC`, p.v === 'h264' && (!p.a || p.a === 'aac'), JSON.stringify(p));
}

// modo audio (retrocompatível): MP4 com H.264 copia o vídeo
{
  const { status, j } = await converter(arquivos.mp4, 'audio');
  check('modo audio continua funcionando', status === 200 && !!j.url, JSON.stringify({ status, url: j.url, err: j.error }).slice(0, 160));
}

// arquivo inválido: erro claro
{
  const ruim = path.join(tmp, 'texto.bin');
  fs.writeFileSync(ruim, 'isto não é mídia');
  const { status, j } = await converter(ruim);
  check('arquivo inválido devolve erro claro', status === 415 && /não tem vídeo nem áudio/i.test(j.error || ''), JSON.stringify({ status, err: j.error }).slice(0, 160));
}

// ---------- UI ----------
let bw = null;
let bid = 0;
const bpend = new Map();
async function bsend(method, params = {}) {
  if (!bw) {
    const v = await (await fetch(`${CDP}/json/version`)).json();
    bw = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((r) => (bw.onopen = r));
    bw.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && bpend.has(m.id)) {
        bpend.get(m.id)(m);
        bpend.delete(m.id);
      }
    };
  }
  return new Promise((r) => {
    const i = ++bid;
    bpend.set(i, r);
    bw.send(JSON.stringify({ id: i, method, params }));
  });
}

async function openPage(url) {
  const c = await bsend('Target.createTarget', { url: 'about:blank', newWindow: true });
  const targetId = c.result.targetId;
  const ws = new WebSocket(`ws://127.0.0.1:${process.env.CDP_PORT || 9333}/devtools/page/${targetId}`);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text;
      if (!/Receiving end does not exist/.test(d || '')) errors.push(String(d).split('\n')[0].slice(0, 300));
    }
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pend.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__noiseOff = () => {}; navigator.mediaDevices.getUserMedia = navigator.mediaDevices.getUserMedia || (async () => { throw new Error('sem câmera no teste'); });`,
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result.result.value;
  };
  // página em segundo plano tem mídia despriorizada: foco + frente mantém o <video> carregando
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await send('Page.bringToFront').catch(() => {});
  await send('Page.navigate', { url });
  return { ev, send, errors, targetId, close: () => fetch(`${CDP}/json/close/${targetId}`).catch(() => {}) };
}

const waitFor = async (p, expr, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await p.ev(expr)) return true;
    } catch {}
    await sleep(300);
  }
  return false;
};

const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Mídia E2E' }) })).json();
const page = await openPage(`${base}/studio/${studio.id}`);
check('estúdio carrega', await waitFor(page, `!!document.querySelector('#lb-go')`));
await page.ev(`document.querySelector('#lb-go').click()`);
check('estúdio aberto', await waitFor(page, `!!document.querySelector('#program-canvas')`));

// seletores de arquivo precisam ser clicáveis (WebKit/Safari)
const pickers = await page.ev(`(() => {
  const ids = ['media-file'];
  return ids.map((id) => {
    const el = document.getElementById(id);
    if (!el) return { id, existe: false };
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return { id, existe: true, hidden: el.hasAttribute('hidden'), display: st.display, w: Math.round(r.width), h: Math.round(r.height) };
  });
})()`);
const mediaInput = pickers.find((p) => p.id === 'media-file');
check('seletor de mídia não usa hidden (Safari abre o diálogo)', !!mediaInput && !mediaInput.hidden && mediaInput.display !== 'none', JSON.stringify(mediaInput));
check('seletor de mídia tem área clicável', !!mediaInput && mediaInput.w > 0 && mediaInput.h > 0, JSON.stringify(mediaInput));

// solta o MKV no input, como o cliente faria pelo "＋ Adicionar"
async function setFile(caminho) {
  const doc = await page.send('DOM.getDocument', { depth: -1 });
  const q = await page.send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#media-file' });
  await page.send('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [caminho] });
  await page.ev(`document.querySelector('#media-file').dispatchEvent(new Event('change', { bubbles: true }))`);
}

await setFile(arquivos.mkv);
check('MKV entra na lista de mídia', await waitFor(page, `!!document.querySelector('#panel-media .m-card')`, 40000), '');
const convertido = await waitFor(
  page,
  `(() => { const S = window.__castdeck?.S; if (!S) return false; const arr = [...S.sources.values()].filter((s) => s.kind === 'media'); return arr.some((s) => s.converted && /convertido/i.test(s.label)); })()`,
  60000,
);
check('MKV foi convertido e marcado como “convertido”', convertido);
const pronto = await waitFor(
  page,
  `(() => { const S = window.__castdeck?.S; const s = [...S.sources.values()].find((x) => x.kind === 'media' && x.converted); return !!s && s.el.readyState >= 1 && s.el.duration > 0; })()`,
  60000,
);
check('vídeo convertido carrega metadados (toca de verdade)', pronto);
const dur = await page.ev(`(() => { const S = window.__castdeck.S; const s = [...S.sources.values()].find((x) => x.kind === 'media' && x.converted); return { dur: s.el.duration, w: s.el.videoWidth, h: s.el.videoHeight, erro: s.el.error && s.el.error.code }; })()`);
check('duração e dimensões coerentes', dur.dur > 2 && dur.dur < 6 && dur.w === 320 && dur.h === 180 && !dur.erro, JSON.stringify(dur));

// MP4 passa direto (sem conversão) e continua tocando
await setFile(arquivos.mp4);
const direto = await waitFor(
  page,
  `(() => { const S = window.__castdeck?.S; const arr = [...S.sources.values()].filter((s) => s.kind === 'media'); return arr.length >= 2 && arr.some((s) => !s.converted && s.el.readyState >= 1); })()`,
  30000,
);
check('MP4 entra sem conversão e carrega', direto);
check('adicionar mídia não gera erro de JS', page.errors.length === 0, JSON.stringify(page.errors.slice(0, 2)));

await page.close();
try {
  bw?.close();
} catch {}
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {}

const falhas = results.filter(([, ok]) => !ok);
console.log(`\n${falhas.length ? `MEDIA_E2E_FAIL (${falhas.length})` : `MEDIA_E2E_OK (${results.length}/${results.length})`}`);
process.exit(falhas.length ? 1 : 0);
