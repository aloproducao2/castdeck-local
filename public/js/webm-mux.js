// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Muxer WebM mínimo (sem dependências): monta um arquivo WebM só de vídeo (VP8/VP9) a partir dos
// EncodedVideoChunks do WebCodecs. Usado pelo "Suavizar lance" offline (60 fps exatos, sem depender
// da gravação em tempo real do MediaRecorder). O servidor junta o áudio original via FFmpeg.

const enc = new TextEncoder();

function concat(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function idBytes(id) {
  // IDs EBML são escritos com o bit de marca (ex.: 0x1A45DFA3 -> 4 bytes)
  const bytes = [];
  let v = id;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return new Uint8Array(bytes);
}

function sizeBytes(len) {
  let n = 1;
  while (n < 8 && len >= Math.pow(2, 7 * n) - 1) n++;
  const out = new Uint8Array(n);
  let rem = Math.max(0, Math.floor(len));
  for (let i = n - 1; i >= 1; i--) {
    out[i] = rem % 256;
    rem = Math.floor(rem / 256);
  }
  out[0] = (0x80 >> (n - 1)) | rem;
  return out;
}

function uintBytes(v) {
  const bytes = [];
  let x = Math.max(0, Math.floor(v));
  do {
    bytes.unshift(x & 0xff);
    x = Math.floor(x / 256);
  } while (x > 0);
  return new Uint8Array(bytes);
}

function floatBytes(v) {
  const b = new Uint8Array(9);
  b[0] = 0x01; // float de 8 bytes
  new DataView(b.buffer).setFloat64(1, Number(v) || 0);
  return b;
}

function elem(id, payload) {
  return concat([idBytes(id), sizeBytes(payload.length), payload]);
}
function elemUint(id, v) {
  return elem(id, uintBytes(v));
}
function elemStr(id, s) {
  return elem(id, enc.encode(s));
}
function elemFloat(id, v) {
  return elem(id, floatBytes(v));
}

const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TIMECODE_SCALE = 0x2ad7b1;
const MUXING_APP = 0x4d80;
const WRITING_APP = 0x5741;
const DURATION = 0x4489;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const TRACK_NUMBER = 0xd7;
const TRACK_UID = 0x73c5;
const TRACK_TYPE = 0x83;
const CODEC_ID = 0x86;
const FLAG_LACING = 0x9c;
const DEFAULT_DURATION = 0x23e383;
const VIDEO = 0xe0;
const PIXEL_WIDTH = 0xb0;
const PIXEL_HEIGHT = 0xba;
const CLUSTER = 0x1f43b675;
const CLUSTER_TIMECODE = 0xe7;
const SIMPLE_BLOCK = 0xa3;

// codecId: 'V_VP8' | 'V_VP9' (o encoder do console usa VP8)
export function createWebMMuxer({ width, height, fps = 60, codecId = 'V_VP8' }) {
  const frames = [];
  let finished = false;
  const fpsNs = Math.round(1e9 / Math.max(1, fps));

  const addVideoChunk = (chunk) => {
    if (finished) return;
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    frames.push({ tsUs: chunk.timestamp, key: chunk.type === 'key', data });
  };

  const finish = () => {
    if (finished) return null;
    finished = true;
    frames.sort((a, b) => a.tsUs - b.tsUs);
    const durationMs = frames.length
      ? Math.max(1, Math.round(frames[frames.length - 1].tsUs / 1000 + 1000 / fps))
      : 1000;
    const header = elem(EBML, concat([
      elemUint(0x4286, 1), // EBMLVersion
      elemUint(0x42f7, 1), // EBMLReadVersion
      elemUint(0x42f2, 4), // EBMLMaxIDLength
      elemUint(0x42f3, 8), // EBMLMaxSizeLength
      elemStr(0x4282, 'webm'), // DocType
      elemUint(0x4287, 4), // DocTypeVersion
      elemUint(0x4285, 2), // DocTypeReadVersion
    ]));
    const info = elem(INFO, concat([
      elemUint(TIMECODE_SCALE, 1000000),
      elemStr(MUXING_APP, 'CastDeck'),
      elemStr(WRITING_APP, 'CastDeck Replay'),
      elemFloat(DURATION, durationMs),
    ]));
    const track = elem(TRACKS, elem(TRACK_ENTRY, concat([
      elemUint(TRACK_NUMBER, 1),
      elemUint(TRACK_UID, 1),
      elemUint(TRACK_TYPE, 1),
      elemStr(CODEC_ID, codecId),
      elemUint(FLAG_LACING, 0),
      elemUint(DEFAULT_DURATION, fpsNs),
      elem(VIDEO, concat([elemUint(PIXEL_WIDTH, width), elemUint(PIXEL_HEIGHT, height)])),
    ])));

    // Clusters de ~1 s; SimpleBlock com timecode relativo em int16 (ms)
    const clusters = [];
    let cur = null;
    const pushBlock = (cluster, tsMs, key, data) => {
      const rel = tsMs - cluster.timecode;
      if (rel < -32768 || rel > 32767) return false;
      const head = new Uint8Array([0x81, (rel >> 8) & 0xff, rel & 0xff, key ? 0x80 : 0x00]);
      cluster.blocks.push(concat([head, data]));
      return true;
    };
    for (const f of frames) {
      const tsMs = Math.round(f.tsUs / 1000);
      if (!cur || tsMs - cur.timecode > 1000 || tsMs - cur.timecode < -32768 || tsMs - cur.timecode > 32767) {
        cur = { timecode: tsMs, blocks: [] };
        clusters.push(cur);
      }
      if (!pushBlock(cur, tsMs, f.key, f.data)) {
        cur = { timecode: tsMs, blocks: [] };
        clusters.push(cur);
        pushBlock(cur, tsMs, f.key, f.data);
      }
    }
    const clusterBytes = clusters.map((c) => elem(CLUSTER, concat([
      elemUint(CLUSTER_TIMECODE, c.timecode),
      ...c.blocks.map((b) => elem(SIMPLE_BLOCK, b)),
    ])));
    const body = concat([info, track, ...clusterBytes]);
    const segment = concat([idBytes(SEGMENT), sizeBytes(body.length), body]);
    return new Blob([header, segment], { type: 'video/webm' });
  };

  return { addVideoChunk, finish, get count() { return frames.length; } };
}
