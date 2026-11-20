// E2E da aceleração de vídeo por SoC: simula um RK3588, instala um "FFmpeg Rockchip" (binário de teste)
// com verificação de SHA-256, confere o estado em /api/hw e remove. Também garante que em PC comum a
// instalação não é oferecida.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const PORT = 4211;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const resultados = [];
const ok = (nome, cond, info = '') => {
  resultados.push([nome, !!cond]);
  console.log((cond ? 'PASS ' : 'FAIL ') + nome + (cond ? '' : ' :: ' + info));
};

// binário falso servido localmente (>= 1000 bytes para o teste)
const conteudo = Buffer.concat([Buffer.from('#!/bin/sh\necho fake ffmpeg\n'), crypto.randomBytes(4096)]);
const sha = crypto.createHash('sha256').update(conteudo).digest('hex');

const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/fake-ffmpeg')) {
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': conteudo.length });
    res.end(conteudo);
    return;
  }
  res.writeHead(404).end();
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const fakePort = srv.address().port;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-hwqa-'));
const dataDir = path.join(tmp, 'data');
fs.mkdirSync(dataDir, { recursive: true });

function subirApp(extraEnv = {}) {
  const p = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      HTTPS_PORT: String(PORT + 300),
      CASTDECK_DATA: dataDir,
      CASTDECK_RECORDINGS: path.join(tmp, 'rec'),
      NO_OPEN: '1',
      CASTDECK_FAKE_SOC: 'rockchip,rk3588-rock-5b',
      CASTDECK_FAKE_ARCH: 'arm64',
      CASTDECK_ROCKCHIP_FFMPEG_URL: `http://127.0.0.1:${fakePort}/fake-ffmpeg`,
      CASTDECK_ROCKCHIP_FFMPEG_SHA256: sha,
      CASTDECK_HW_MIN_BYTES: '1000',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  p.stdout.on('data', (d) => (log += d));
  p.stderr.on('data', (d) => (log += d));
  return { p, get log() { return log; } };
}

const matar = (app) => {
  try {
    if (process.platform === 'win32' && app.p.pid) spawnSync('taskkill', ['/PID', String(app.p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else app.p.kill('SIGKILL');
  } catch {}
};

const api = async (rota, opt) => {
  const r = await fetch(BASE + rota, opt);
  const t = await r.text();
  let json = null;
  try {
    json = JSON.parse(t);
  } catch {}
  return { status: r.status, json, text: t };
};
const esperarApp = async () => {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return true;
    } catch {}
    await sleep(400);
  }
  return false;
};

try {
  // ---------- 1) RK3588 simulado: estado inicial ----------
  let app = subirApp();
  ok('app sobe com SoC simulado', await esperarApp(), app.log.slice(-300));
  let hw = (await api('/api/hw')).json || {};
  ok('SoC detectado como Rockchip RK3588', hw.soc?.family === 'rockchip' && /3588/.test(hw.soc?.name || ''), JSON.stringify(hw.soc));
  ok('instalação oferecida em Linux ARM Rockchip', hw.rockchip?.suportado === true, JSON.stringify(hw.rockchip?.suportado));
  ok('ainda não instalado', hw.rockchip?.instalado === false, String(hw.rockchip?.instalado));
  ok('encoder escolhido é válido', ['h264_rkmpp', 'h264_v4l2m2m', 'libx264'].includes(hw.ffmpeg?.escolhido), JSON.stringify(hw.ffmpeg?.escolhido));

  // ---------- 2) instala (download + SHA) ----------
  const inst = await api('/api/hw/rockchip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  ok('POST de instalação aceito', inst.status === 202 || inst.status === 200, JSON.stringify({ s: inst.status, j: inst.json }));
  let instalou = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    hw = (await api('/api/hw')).json || {};
    if (hw.rockchip?.instalado) {
      instalou = true;
      break;
    }
  }
  ok('binário instalado em data/bin', instalou, JSON.stringify(hw.rockchip?.estado));
  const destino = path.join(dataDir, 'bin', process.platform === 'win32' ? 'ffmpeg-rockchip.exe' : 'ffmpeg-rockchip');
  ok('arquivo existe e é executável', fs.existsSync(destino) && fs.statSync(destino).size === conteudo.length, destino);
  ok('app continua respondendo depois da instalação', (await api('/api/health')).status === 200);

  // ---------- 3) remoção ----------
  const rem = await api('/api/hw/rockchip', { method: 'DELETE' });
  ok('DELETE remove a aceleração', rem.status === 200, JSON.stringify(rem.json));
  hw = (await api('/api/hw')).json || {};
  ok('estado volta para não instalado', hw.rockchip?.instalado === false, String(hw.rockchip?.instalado));
  ok('arquivo removido do disco', !fs.existsSync(destino));
  matar(app);
  await sleep(800);

  // ---------- 4) SHA errado: não instala e explica ----------
  app = subirApp({ CASTDECK_ROCKCHIP_FFMPEG_SHA256: 'deadbeef'.repeat(8) });
  await esperarApp();
  await api('/api/hw/rockchip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  let erro = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    hw = (await api('/api/hw')).json || {};
    if (hw.rockchip?.estado?.erro) {
      erro = hw.rockchip.estado.erro;
      break;
    }
  }
  ok('arquivo corrompido é recusado com mensagem', !!erro && /corrompido|SHA-256/i.test(erro), String(erro));
  ok('nada é instalado com hash errado', hw.rockchip?.instalado === false, String(hw.rockchip?.instalado));
  matar(app);
  await sleep(800);

  // ---------- 5) PC comum: nada de instalação de Rockchip ----------
  app = subirApp({ CASTDECK_FAKE_SOC: '', CASTDECK_FAKE_ARCH: '' });
  await esperarApp();
  hw = (await api('/api/hw')).json || {};
  ok('PC comum não é Rockchip', hw.soc?.family !== 'rockchip', JSON.stringify(hw.soc?.family));
  ok('PC comum não oferece a instalação', hw.rockchip?.suportado === false, String(hw.rockchip?.suportado));
  const rec = await api('/api/hw/rockchip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  ok('POST em PC comum é recusado', rec.status === 400, `${rec.status} ${JSON.stringify(rec.json)}`);
  matar(app);
} finally {
  srv.close();
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {}
  const falhas = resultados.filter(([, c]) => !c);
  console.log(`\n${falhas.length ? `HW_E2E_FAIL (${falhas.length})` : `HW_E2E_OK (${resultados.length}/${resultados.length})`}`);
  process.exit(falhas.length ? 1 : 0);
}
