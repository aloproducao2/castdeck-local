// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Descobre o FFmpeg, a versão e quais encoders de hardware realmente funcionam NESTA máquina.
//
// Linux ARM tem SoCs com aceleração própria: Rockchip usa rkmpp (FFmpeg-Rockchip), Raspberry Pi usa
// V4L2 M2M. O FFmpeg genérico embutido NÃO tem rkmpp, então a escolha do binário passa a considerar o
// SoC: procura primeiro um FFmpeg específico em `data/bin` e só depois o embutido/genérico.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { readSoc, describeSoc } from './soc.js';

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
  h264_vaapi: { label: 'VA-API (Linux GPU)', hw: true },
  h264_v4l2m2m: { label: 'V4L2 M2M (Linux ARM)', hw: true },
  h264_rkmpp: { label: 'Rockchip MPP (RK3588/RK3568)', hw: true },
  hevc_rkmpp: { label: 'Rockchip MPP HEVC', hw: true },
};

// Formatos de entrada aceitos pelo encoder rkmpp (o teste precisa entrar em nv12)
const TESTE_ENC = {
  h264_vaapi: (name) => [
    '-hide_banner', '-loglevel', 'error',
    '-vaapi_device', '/dev/dri/renderD128',
    '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30',
    '-vf', 'format=nv12,hwupload', '-frames:v', '5', '-c:v', name, '-f', 'null', '-',
  ],
  h264_rkmpp: (name) => [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30',
    '-vf', 'format=nv12', '-frames:v', '5', '-c:v', name, '-f', 'null', '-',
  ],
  hevc_rkmpp: (name) => [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30',
    '-vf', 'format=nv12', '-frames:v', '5', '-c:v', name, '-f', 'null', '-',
  ],
};

const padrao = (name) => ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=640x360:r=30', '-frames:v', '5', '-c:v', name, '-f', 'null', '-'];

// Sondagem de UM binário: versão, encoders presentes, filtros RGA e teste real de 5 frames.
export async function probeFfmpeg(ffmpegPath = 'ffmpeg', { skipTest = false } = {}) {
  const info = {
    path: ffmpegPath,
    available: false,
    version: null,
    encoders: [],
    filters: [],
    rga: false,
    testados: [],
    error: null,
  };
  const v = await run(ffmpegPath, ['-hide_banner', '-version']);
  if (v.code !== 0) {
    info.error = 'FFmpeg não encontrado. Reinstale o CastDeck ou instale o FFmpeg (winget install Gyan.FFmpeg / brew install ffmpeg / apt install ffmpeg).';
    return info;
  }
  info.available = true;
  info.version = (v.out.split(/\r?\n/)[0] || '').replace(/^ffmpeg version\s*/, '').split(' ')[0];

  const list = await run(ffmpegPath, ['-hide_banner', '-encoders']);
  const filtros = await run(ffmpegPath, ['-hide_banner', '-filters']);
  info.filters = (filtros.out.match(/\b(scale_rkrga|vpp_rkrga|overlay_rkrga)\b/g) || []).filter((x, i, a) => a.indexOf(x) === i);
  info.rga = info.filters.length > 0;

  const candidatos = Object.keys(ENCODERS).filter((name) => list.out.includes(` ${name} `));
  info.candidatos = candidatos;
  if (skipTest) return info;

  const resultados = await Promise.all(
    candidatos.map(async (name) => {
      const args = (TESTE_ENC[name] || padrao)(name);
      const r = await run(ffmpegPath, args);
      info.testados.push({ id: name, ok: r.code === 0, erro: r.code === 0 ? null : (r.err || '').trim().split('\n').slice(-2).join(' ') });
      return r.code === 0 ? name : null;
    }),
  );
  info.encoders = resultados.filter(Boolean).map((id) => ({ id, ...ENCODERS[id] }));
  return info;
}

// Cache da sondagem: o boot em SBC é lento para testar 8 encoders toda vez.
function chaveCache(caminho, soc) {
  let stat = null;
  try {
    stat = fs.statSync(caminho);
  } catch {}
  const marca = stat ? `${stat.size}:${Math.floor(stat.mtimeMs)}` : 'x';
  return crypto.createHash('sha1').update(`${caminho}|${marca}|${soc.family}|${soc.model}|${soc.drivers.mpp ? 1 : 0}`).digest('hex').slice(0, 16);
}

function lerCache(arquivo) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    return {};
  }
}
function gravarCache(arquivo, dados) {
  try {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), 'utf8');
  } catch {}
}

// Caminhos candidatos: usuário -> específico do SoC em data/bin -> embutido -> PATH.
export function ffmpegCandidates({ dataBin = '', embedded = '', soc = null, env = process.env } = {}) {
  const sufixos = soc?.family === 'rockchip' ? ['ffmpeg-rockchip', 'ffmpeg'] : soc?.family === 'raspberrypi' ? ['ffmpeg-pi', 'ffmpeg'] : ['ffmpeg'];
  const lista = [];
  if (env.CASTDECK_FFMPEG || env.FFMPEG_PATH) lista.push(env.CASTDECK_FFMPEG || env.FFMPEG_PATH);
  if (dataBin) for (const nome of sufixos) lista.push(path.join(dataBin, nome + (process.platform === 'win32' ? '.exe' : '')));
  if (embedded) lista.push(embedded);
  lista.push('ffmpeg');
  return [...new Set(lista.filter(Boolean))];
}

// Resolve o melhor FFmpeg para a máquina: devolve { path, version, encoders, filters, rga, soc, cacheHit, escolhidoPor }.
export async function resolveFfmpeg({ dataBin = '', embedded = '', probeFile = '', env = process.env } = {}) {
  const soc = readSoc(env);
  const candidatos = ffmpegCandidates({ dataBin, embedded, soc, env });
  const cache = probeFile ? lerCache(probeFile) : {};
  let atualizado = false;
  const base = { soc, socLabel: describeSoc(soc), candidatos };

  for (const caminho of candidatos) {
    const ehArquivo = !/^[a-z]+$/i.test(caminho) || caminho === 'ffmpeg';
    let info = null;
    if (probeFile && ehArquivo && fs.existsSync(caminho)) {
      const k = chaveCache(caminho, soc);
      if (cache[k] && cache[k].path === caminho) {
        info = { ...cache[k].info, cacheHit: true };
      }
    }
    if (!info) {
      info = await probeFfmpeg(caminho);
      if (info.available && probeFile && fs.existsSync(caminho)) {
        cache[chaveCache(caminho, soc)] = { path: caminho, info: { ...info, cacheHit: false }, quando: new Date().toISOString() };
        atualizado = true;
      }
    }
    if (!info.available) continue;
    if (atualizado && probeFile) gravarCache(probeFile, cache);
    const escolhido = bestEncoder(soc, info).id;
    if (!info.encoders.some((e) => e.id === 'libx264')) info.encoders.unshift({ id: 'libx264', label: 'CPU (x264)', hw: false });
    return { ...info, ...base, encoders: info.encoders, escolhido, escolhidoPor: caminho };
  }
  if (atualizado && probeFile) gravarCache(probeFile, cache);
  return { available: false, path: candidatos[0] || 'ffmpeg', error: 'FFmpeg não encontrado', encoders: [], soc, socLabel: describeSoc(soc), candidatos };
}

// Encoder preferido para o SoC, considerando só o que passou no teste real.
export function bestEncoder(soc, info) {
  const tem = new Set((info?.encoders || []).map((e) => e.id));
  const ordem = soc?.prefers?.length ? soc.prefers : ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_videotoolbox', 'h264_vaapi', 'h264_v4l2m2m', 'libx264'];
  for (const id of ordem) if (tem.has(id)) return { id, ...(ENCODERS[id] || { label: id, hw: false }) };
  return { id: 'libx264', ...ENCODERS.libx264 };
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
    case 'h264_vaapi':
      return ['-c:v', 'h264_vaapi', ...rate, '-g', gop, '-bf', '0', '-profile:v', 'high'];
    case 'h264_v4l2m2m':
      return ['-c:v', 'h264_v4l2m2m', ...rate, '-g', gop];
    // Rockchip MPP: CBR é o modo mais previsível para live; `-bf 0` reduz latência
    case 'h264_rkmpp':
      return ['-c:v', 'h264_rkmpp', '-rc_mode', '1', '-profile:v', 'high', '-level', '4.1', '-bf', '0', ...rate, '-g', gop];
    case 'hevc_rkmpp':
      return ['-c:v', 'hevc_rkmpp', '-rc_mode', '1', '-profile:v', 'main', '-level', '4.1', ...rate, '-g', gop];
    case 'libx264':
    default:
      return [
        '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'high',
        ...rate, '-g', gop, '-keyint_min', gop, '-sc_threshold', '0',
      ];
  }
}

// Filtro de escala: usa RGA quando o FFmpeg tem `scale_rkrga` e a placa tem /dev/rga.
export function scaleFilterFor(encoder, soc, { w = 0, h = 0, out = 'yuv420p' } = {}) {
  if (encoder === 'h264_rkmpp' && soc?.family === 'rockchip' && soc?.drivers?.rga) {
    const alvo = [w ? `w=${w}` : '', h ? `h=${h}` : '', 'format=nv12'].filter(Boolean).join(':');
    return `hwupload,scale_rkrga=${alvo}`;
  }
  if (encoder === 'h264_rkmpp') return 'format=nv12';
  return `format=${out}`;
}
