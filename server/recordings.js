// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Pós-processamento das gravações.
//
// Durante a live o arquivo é MP4 fragmentado (frag_keyframe+empty_moov): se o PC travar ou a luz cair, o que já foi
// gravado continua tocável. Só que esse formato não tem índice: no player do app a duração aparece errada e a barra de
// busca não funciona direito. Ao terminar, reorganizamos o arquivo com "-c copy -movflags +faststart" (sem recodificar,
// leva segundos) e trocamos pelo original. Se algo falhar, o arquivo original fica intacto.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const TMP_EXT = '.finalizando';
const finalizing = new Set(); // caminhos completos em processamento

export const isFinalizing = (file) => finalizing.has(path.resolve(file));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Lê os codecs reais do arquivo. Se o áudio não for AAC (ex.: Opus de uma gravação antiga/experimental),
// a finalização recodifica para AAC, que o Windows Media Player e players de TV abrem.
export async function needsCompatibility(ffmpegPath, file) {
  const c = await probeCodecs(ffmpegPath, file);
  return (!!c.audio && c.audio !== 'aac') || (!!c.video && !['h264', 'avc1'].includes(c.video));
}

function probeCodecs(ffmpegPath, file) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-i', file], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err = (err + d).slice(-8000)));
    p.on('error', () => resolve({ video: '', audio: '' }));
    p.on('close', () => {
      const v = /Stream #\d+:\d+.*?: Video:\s*([a-zA-Z0-9_]+)/.exec(err);
      const a = /Stream #\d+:\d+.*?: Audio:\s*([a-zA-Z0-9_]+)/.exec(err);
      resolve({ video: (v?.[1] || '').toLowerCase(), audio: (a?.[1] || '').toLowerCase() });
    });
  });
}

export async function finalizeRecording(ffmpegPath, file) {
  const abs = path.resolve(file);
  if (!ffmpegPath || finalizing.has(abs)) return false;
  let st;
  try { st = await fsp.stat(abs); } catch { return false; }
  if (st.size < 1024) return false; // gravação vazia: nada a fazer
  finalizing.add(abs);
  const tmp = abs + TMP_EXT;
  try {
    const codecs = await probeCodecs(ffmpegPath, abs);
    const fixAudio = !!codecs.audio && codecs.audio !== 'aac';
    const fixVideo = !!codecs.video && !['h264', 'avc1'].includes(codecs.video);
    const args = ['-hide_banner', '-loglevel', 'error', '-i', abs, '-map', '0'];
    if (fixVideo) args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p');
    else args.push('-c:v', 'copy');
    if (fixAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2');
    else args.push('-c:a', 'copy');
    args.push('-movflags', '+faststart', '-f', 'mp4', '-y', tmp);
    if (fixAudio || fixVideo) console.log(`[gravação] convertendo para player compatível: vídeo=${codecs.video || '—'} áudio=${codecs.audio || '—'}`);
    const ok = await new Promise((resolve) => {
      const p = spawn(ffmpegPath, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      p.stderr.on('data', (d) => (err = (err + d).slice(-800)));
      p.on('error', () => resolve(false));
      p.on('close', (code) => {
        if (code !== 0) console.warn('[gravação] não consegui finalizar', path.basename(abs), err.trim().split('\n').pop());
        resolve(code === 0);
      });
    });
    const out = ok ? await fsp.stat(tmp).catch(() => null) : null;
    // confere se o arquivo novo é plausível (cópia sem recodificar fica quase do mesmo tamanho)
    if (!out || out.size < st.size * 0.5) { await fsp.unlink(tmp).catch(() => {}); return false; }
    // no Windows a troca falha se alguém estiver lendo o arquivo (ex.: o player aberto): tenta de novo por ~1 min
    for (let i = 0; i < 30; i++) {
      try { await fsp.rename(tmp, abs); return true; } catch { await sleep(2000); }
    }
    await fsp.unlink(tmp).catch(() => {});
    return false;
  } finally {
    finalizing.delete(abs);
  }
}

// restos de uma finalização interrompida (app fechado no meio): o original continua lá, o temporário sai
export function cleanupTemp(dir) {
  try {
    for (const f of fs.readdirSync(dir)) if (f.endsWith(TMP_EXT)) fs.unlink(path.join(dir, f), () => {});
  } catch { /* pasta ainda não existe */ }
}

// MP4 fragmentado tem a caixa "mvex" dentro do "moov" logo no começo do arquivo; o finalizado (faststart) não tem.
// Serve para preparar, na hora de assistir, gravações feitas antes desta versão.
export async function isFragmented(file) {
  if (!/\.mp4$/i.test(file)) return false;
  let fh;
  try {
    fh = await fsp.open(file, 'r');
    const buf = Buffer.alloc(256 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const head = buf.subarray(0, bytesRead);
    return head.includes('mvex') || head.includes('moof');
  } catch {
    return false;
  } finally {
    await fh?.close();
  }
}
