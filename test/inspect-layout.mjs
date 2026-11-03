// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());

const studio = await post('/api/studios', { name: 'LayoutCheck' });
const t = await (await fetch(`${CDP}/json/new?${base}/studio/${studio.id}?lang=pt`, { method: 'PUT' })).json();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pend = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

const ev = (e) => send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });

const waitFor = async (expr, timeout = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const r = await ev(expr);
    if (r.result?.result?.value) return true;
    await sleep(200);
  }
  return false;
};

// Aguarda carregar e passa do lobby
await waitFor(`!!document.querySelector('#lb-go')`);
await sleep(1500);
await ev(`(() => {
  const n = document.querySelector('#lb-name');
  if (n && !n.value) { n.value = 'Host'; n.dispatchEvent(new Event('input', { bubbles: true })); }
  document.querySelector('#lb-go')?.click();
})()`);
await waitFor(`!document.querySelector('.lobby') && !!window.__castdeck`, 20000);
await sleep(2000);

const outDir = path.join('dist', 'layout-frames');
if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

let frameNum = 0;
const issues = [];

const checkDomOverflow = async (label) => {
  const res = await ev(`(() => {
    const docW = document.documentElement.clientWidth;
    const docH = document.documentElement.clientHeight;
    const scrollW = document.documentElement.scrollWidth;
    const scrollH = document.documentElement.scrollHeight;
    
    // Vazamento horizontal
    const hasHScroll = scrollW > docW + 2;
    
    // Elementos que ultrapassam a viewport
    const leaking = [];
    const all = document.querySelectorAll('body, header, main, nav, section, div, table, ul, footer, form, .stage-box, .sw-box, #panel, #gcbar');
    for (const el of all) {
      if (!el.offsetParent && el !== document.body) continue;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      // Checa se algum ancestral tem visibility hidden
      if (el.closest('.side') && window.getComputedStyle(el.closest('.side')).visibility === 'hidden') continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.right > docW + 4) {
        leaking.push({
          tag: el.tagName,
          id: el.id,
          class: (el.className || '').toString().slice(0, 50),
          right: Math.round(b.right),
          docW,
          overflowPx: Math.round(b.right - docW)
        });
      }
    }
    return { docW, docH, scrollW, scrollH, hasHScroll, leaking: leaking.slice(0, 10) };
  })()`);
  return res.result?.result?.value || {};
};

const captureFrame = async (name) => {
  frameNum++;
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const fn = path.join(outDir, `frame-${String(frameNum).padStart(3, '0')}.png`);
  fs.writeFileSync(fn, Buffer.from(shot.result.data, 'base64'));
  return fn;
};

const resolutions = [
  { name: '1920x1080 (Full HD)', w: 1920, h: 1080 },
  { name: '1366x768 (Laptop)', w: 1366, h: 768 },
  { name: '1024x600 (Compacto)', w: 1024, h: 600 },
];

const tabs = ['media', 'banners', 'journal', 'sports', 'brand', 'social', 'audio', 'director', 'devices'];

for (const res of resolutions) {
  console.log(`\nVerificando resolução ${res.name}...`);
  await send('Emulation.setDeviceMetricsOverride', { width: res.w, height: res.h, deviceScaleFactor: 1, mobile: false });
  await sleep(1000);

  // 1. Modo Normal em todas as abas
  for (const tab of tabs) {
    await ev(`(() => {
      window.__castdeck?.switchTab?.('${tab}');
      if (getComputedStyle(document.querySelector('.side')).position === 'fixed') {
        document.querySelector('.studio')?.classList.add('panel-open');
      }
    })()`);
    await sleep(600);
    const chk = await checkDomOverflow(`Normal - ${res.name} - Tab ${tab}`);
    if (chk.hasHScroll || (chk.leaking && chk.leaking.length > 0)) {
      console.warn(`[AVISO] Vazamento detectado em ${res.name} [aba ${tab}]: scrollW=${chk.scrollW} > docW=${chk.docW}`);
      issues.push({ mode: 'Normal', resolution: res.name, tab, details: chk });
    }
    await captureFrame(`${res.w}x${res.h}-normal-${tab}`);
  }

  // 2. Modo Mesa de Corte (Switcher)
  await ev(`document.querySelector('#c-switcher')?.click()`);
  await sleep(1000);
  for (const tab of ['media', 'audio', 'director']) {
    await ev(`(() => {
      window.__castdeck?.switchTab?.('${tab}');
      if (getComputedStyle(document.querySelector('.side')).position === 'fixed') {
        document.querySelector('.studio')?.classList.add('panel-open');
      }
    })()`);
    await sleep(600);
    const chk = await checkDomOverflow(`Switcher - ${res.name} - Tab ${tab}`);
    if (chk.hasHScroll || (chk.leaking && chk.leaking.length > 0)) {
      console.warn(`[AVISO] Vazamento em Mesa ${res.name} [aba ${tab}]: scrollW=${chk.scrollW} > docW=${chk.docW}`);
      issues.push({ mode: 'Switcher', resolution: res.name, tab, details: chk });
    }
    await captureFrame(`${res.w}x${res.h}-switcher-${tab}`);
  }
  // Desliga mesa
  await ev(`document.querySelector('#c-switcher')?.click()`);
  await sleep(500);
}

console.log(`\nCapturados ${frameNum} frames em ${outDir}`);

// Compila vídeo MP4 dos frames
const mp4Path = path.join('dist', 'layout-tour.mp4');
try {
  execSync(`ffmpeg -y -framerate 1 -i "${outDir}/frame-%03d.png" -c:v libx264 -r 30 -pix_fmt yuv420p "${mp4Path}"`, { stdio: 'ignore' });
  console.log(`Vídeo de inspeção gerado: ${mp4Path}`);
} catch (e) {
  console.error('Falha ao compilar vídeo:', e.message);
}

// Salva relatório detalhado
fs.writeFileSync('dist/layout-report.json', JSON.stringify({ issues, totalFrames: frameNum }, null, 2));
console.log(`Relatório salvo em dist/layout-report.json (${issues.length} ocorrências encontradas).`);
process.exit(0);
