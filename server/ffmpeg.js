// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Descobre o FFmpeg, versão e quais encoders H.264 de hardware realmente funcionam.
import { spawn } from 'node:child_process';

function run(cmd, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let done = false;
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch (e) {
      resolve({ code: -1, out, err: String(e) });
      return;
    }
    const timer = setTimeout(() => {
      if (!done) child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      done = true;
      clearTimeout(timer);
      resolve({ code: -1, out, err: String(e) });
    });
    child.on('close', (code) => {
      done = true;
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

export const ENCODERS = {
  libx264: { label: 'CPU (x264)', hw: false },
  h264_nvenc: { label: 'NVIDIA NVENC', hw: true },
  h264_qsv: { label: 'Intel Quick Sync', hw: true },
  h264_amf: { label: 'AMD AMF', hw: true },
  h264_videotoolbox: { label: 'Apple VideoToolbox', hw: true },
};

export async function probeFfmpeg(ffmpegPath = 'ffmpeg') {
  const info = { path: ffmpegPath, available: false, version: null, encoders: [] };
  const v = await run(ffmpegPath, ['-hide_banner', '-version']);
  if (v.code !== 0) {
    info.error = 'FFmpeg não encontrado. Reinstale o CastDeck ou instale o FFmpeg (winget install Gyan.FFmpeg / brew install ffmpeg / apt install ffmpeg).';
    return info;
  }
  info.available = true;
  info.version = (v.out.split(/\r?\n/)[0] || '').replace(/^ffmpeg version\s*/, '').split(' ')[0];

  const list = await run(ffmpegPath, ['-hide_banner', '-encoders']);
  const candidates = Object.keys(ENCODERS).filter((name) => list.out.includes(` ${name} `));

  // Testa cada encoder com um frame real – estar listado não garante GPU presente.
  const results = await Promise.all(
    candidates.map(async (name) => {
      const r = await run(ffmpegPath, [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30',
        '-frames:v', '5', '-c:v', name, '-f', 'null', '-',
      ]);
      return r.code === 0 ? name : null;
    }),
  );
  info.encoders = results.filter(Boolean).map((id) => ({ id, ...ENCODERS[id] }));
  return info;
}

export function videoEncoderArgs(encoder, kbps, fps, gopSec = 2) {
  const gop = String(Math.max(1, Math.round(fps * gopSec))); // padrão: keyframe a cada 2s
  const rate = ['-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`];
  switch (encoder) {
    case 'h264_nvenc':
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'll', '-rc', 'cbr', ...rate, '-g', gop, '-bf', '0', '-profile:v', 'high'];
    case 'h264_qsv':
      return ['-c:v', 'h264_qsv', '-preset', 'veryfast', ...rate, '-g', gop, '-profile:v', 'high'];
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-usage', 'lowlatency', '-rc', 'cbr', ...rate, '-g', gop];
    case 'h264_videotoolbox':
      return ['-c:v', 'h264_videotoolbox', '-realtime', '1', '-prio_speed', '1', ...rate, '-g', gop, '-profile:v', 'high'];
    case 'libx264':
    default:
      return [
        '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'high',
        ...rate, '-g', gop, '-keyint_min', gop, '-sc_threshold', '0',
      ];
  }
}
