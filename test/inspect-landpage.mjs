// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn } from 'node:child_process';

import http from 'node:http';

const CDP_PORT = 9336;
const LOCAL_PORT = 8089;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.apk': 'application/vnd.android.package-archive' };
const site = path.resolve('landpage');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(site, path.normalize(p));
  if (!f.startsWith(site) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  const size = fs.statSync(f).size;
  const headers = { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
  res.writeHead(200, { ...headers, 'Content-Length': size });
  fs.createReadStream(f).pipe(res);
});

await new Promise((r) => server.listen(LOCAL_PORT, r));

const targetUrl = process.argv.includes('--remote') ? 'https://cast.flue.live/index.html' : `http://127.0.0.1:${LOCAL_PORT}/index.html`;

const edgePath = process.env['ProgramFiles(x86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe';
const edge = spawn(edgePath, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${path.resolve('build/tmp/edge-landpage-tour')}`,
  '--no-first-run',
  '--autoplay-policy=no-user-gesture-required',
  'about:blank',
], { stdio: 'ignore' });

await sleep(2500);

try {
  const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${targetUrl}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));

  let id = 0;
  const send = (method, params = {}) => new Promise((resolve) => {
    const cur = ++id;
    const h = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === cur) { ws.removeEventListener('message', h); resolve(m); }
    };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id: cur, method, params }));
  });

  const ev = (e) => send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(3000);

  const outDir = path.join('dist', 'landpage-frames');
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  let frameNum = 0;
  const captureFrame = async (name) => {
    frameNum++;
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const fn = path.join(outDir, `frame-${String(frameNum).padStart(3, '0')}.png`);
    fs.writeFileSync(fn, Buffer.from(shot.result.data, 'base64'));
    return fn;
  };

  // Altura total da página
  const docHRes = await ev(`document.documentElement.scrollHeight`);
  const totalH = docHRes.result?.result?.value || 6000;
  console.log(`ScrollHeight da página: ${totalH}px`);

  // Desce a página em passos de 600px
  for (let y = 0; y <= totalH; y += 550) {
    await ev(`window.scrollTo({ top: ${y}, behavior: 'instant' })`);
    await sleep(400);
    await captureFrame(`scroll-${y}`);
  }

  // Volta ao topo
  await ev(`window.scrollTo({ top: 0, behavior: 'instant' })`);
  await sleep(300);

  // Compila o vídeo MP4
  const mp4Path = path.join('dist', 'landpage-tour.mp4');
  execSync(`ffmpeg -y -framerate 2 -i "${outDir}/frame-%03d.png" -c:v libx264 -r 30 -pix_fmt yuv420p "${mp4Path}"`, { stdio: 'ignore' });
  console.log(`Vídeo gravado em: ${mp4Path} (${frameNum} quadros)`);
} finally {
  edge.kill();
  server.close();
}
