// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Origem dos binários externos (FFmpeg e cloudflared) para cada sistema/arquitetura.
// Usado em dois momentos: no build (para EMBUTIR no executável) e em runtime (fallback de download
// quando o app roda a partir do código-fonte, sem binários embutidos).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

export const NAMES = ['ffmpeg', 'cloudflared', 'mediamtx', 'yt-dlp'];
const FF_STATIC = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0';
const CF = 'https://github.com/cloudflare/cloudflared/releases/latest/download';
// yt-dlp (Unlicense): downloader usado pelo painel Mídia; o FFmpeg junta áudio e vídeo.
const YTDLP = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
// MediaMTX (MIT): entrada RTMP/SRT de drones e câmeras. Versão fixada: o formato da configuração muda entre versões
// e o server/ingest.js gera a configuração para esta (testada em docs/ai/ESTUDO-INGEST-MEDIAMTX.md).
export const MTX_VERSION = 'v1.21.2';
const MTX = `https://github.com/bluenviron/mediamtx/releases/download/${MTX_VERSION}`;

// plat: 'win32' | 'darwin' | 'linux'; arch: 'x64' | 'arm64'
export const exeSuffix = (plat) => (plat === 'win32' ? '.exe' : '');

export function binarySpec(name, plat, arch) {
  const cfArch = arch === 'arm64' ? 'arm64' : 'amd64';
  if (name === 'yt-dlp') {
    if (plat === 'win32') return { url: `${YTDLP}/yt-dlp.exe`, kind: 'raw' };
    if (plat === 'darwin') return { url: `${YTDLP}/yt-dlp_macos`, kind: 'raw' };
    return { url: `${YTDLP}/${arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux'}`, kind: 'raw' };
  }
  if (name === 'mediamtx') {
    const os = plat === 'win32' ? 'windows' : plat === 'darwin' ? 'darwin' : 'linux';
    if (plat === 'win32') return { url: `${MTX}/mediamtx_${MTX_VERSION}_${os}_${cfArch}.zip`, kind: 'zip' };
    return { url: `${MTX}/mediamtx_${MTX_VERSION}_${os}_${cfArch}.tar.gz`, kind: 'tgz' };
  }
  if (name === 'cloudflared') {
    if (plat === 'win32') return { url: `${CF}/cloudflared-windows-${cfArch}.exe`, kind: 'raw' };
    if (plat === 'darwin') return { url: `${CF}/cloudflared-darwin-${cfArch}.tgz`, kind: 'tgz' };
    return { url: `${CF}/cloudflared-linux-${cfArch}`, kind: 'raw' };
  }
  // ffmpeg: no Windows usa o build "essentials" (traz NVENC/QSV/AMF); nos demais, builds estáticos
  if (plat === 'win32') return { url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip', kind: 'zip-ffmpeg' };
  return { url: `${FF_STATIC}/ffmpeg-${plat}-${arch}.gz`, kind: 'gz' };
}

async function download(url, dest, onProgress) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download falhou (${res.status}) ${url}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let got = 0;
  const src = Readable.fromWeb(res.body);
  src.on('data', (c) => {
    got += c.length;
    if (total) onProgress?.(Math.round((got / total) * 100));
  });
  await pipeline(src, fs.createWriteStream(dest));
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} saiu com código ${c}`))));
  });
}

// antivírus/indexador no Windows costumam segurar o arquivo recém-criado por alguns instantes (EBUSY/EPERM)
export async function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      return await fsp.rename(from, to);
    } catch (e) {
      if (i >= 40 || !['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function findFile(dir, base) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      const r = await findFile(full, base);
      if (r) return r;
    } else if (e.name === base) return full;
  }
  return null;
}

// Baixa e prepara o binário final em `dest` (arquivo executável pronto para uso).
export async function fetchBinary(name, plat, arch, dest, onProgress) {
  const { url, kind } = binarySpec(name, plat, arch);
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'castdeck-'));
  try {
    const dl = path.join(tmp, 'download');
    await download(url, dl, onProgress);
    const out = dest + '.part';
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    if (kind === 'raw') await fsp.copyFile(dl, out);
    else if (kind === 'gz') await pipeline(fs.createReadStream(dl), zlib.createGunzip(), fs.createWriteStream(out));
    else {
      // zip (Windows) e tgz (macOS): o `tar` do Windows 10+/macOS lê os dois formatos
      const dir = path.join(tmp, 'x');
      await fsp.mkdir(dir);
      const args = kind === 'tgz' ? ['-xzf', dl, '-C', dir] : ['-xf', dl, '-C', dir];
      try {
        await run('tar', args);
      } catch (e) {
        if (plat !== 'win32' || !kind.startsWith('zip')) throw e;
        await run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${dl}' -DestinationPath '${dir}' -Force`]);
      }
      const found = await findFile(dir, name + exeSuffix(plat));
      if (!found) throw new Error(`${name} não encontrado dentro do pacote baixado`);
      await fsp.copyFile(found, out);
    }
    if (plat !== 'win32') await fsp.chmod(out, 0o755);
    await renameRetry(out, dest);
    return dest;
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
