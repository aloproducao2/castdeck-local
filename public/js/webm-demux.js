// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Demuxer WebM mínimo (sem dependências) para alimentar WebCodecs no playout de replay.
// Lê um arquivo WebM de clipe (MediaRecorder/ffmpeg), separa os blocos de vídeo (VP8/VP9) e áudio
// (Opus) com timestamps em microssegundos e sinaliza keyframes. Não depende de DOM.

const EBML = 0x1a45dfa3;
const SEGMENT = 0x18538067;
const INFO = 0x1549a966;
const TIMEcode_SCALE = 0x2ad7b1;
const TRACKS = 0x1654ae6b;
const TRACK_ENTRY = 0xae;
const TRACK_NUMBER = 0xd7;
const TRACK_TYPE = 0x83;
const CODEC_ID = 0x86;
const PIXEL_WIDTH = 0xb0;
const PIXEL_HEIGHT = 0xba;
const DEFAULT_DURATION = 0x23e383;
const CLUSTER = 0x1f43b675;
const CLUSTER_TIMECODE = 0xe7;
const SIMPLE_BLOCK = 0xa3;
const BLOCK_GROUP = 0xa0;
const BLOCK = 0xa1;
const REFERENCE_BLOCK = 0xfb;

const UNKNOWN = -1;

function readVint(u8, pos, keepMarker) {
  const first = u8[pos];
  if (first === undefined) throw new Error('fim inesperado no WebM');
  let len = 1;
  let mask = 0x80;
  while (!(first & mask)) {
    mask >>= 1;
    len++;
    if (len > 8) throw new Error('VINT inválido');
  }
  let value = keepMarker ? first : first & (mask - 1);
  for (let i = 1; i < len; i++) value = value * 256 + u8[pos + i];
  const unknown = !keepMarker && value === Math.pow(2, 7 * len) - 1;
  return { value, len, unknown };
}

function readElement(u8, pos, end) {
  const id = readVint(u8, pos, true);
  if (id.len === 0) throw new Error('ID inválido');
  const size = readVint(u8, pos + id.len, false);
  const dataStart = pos + id.len + size.len;
  let dataEnd = size.unknown ? -1 : dataStart + size.value;
  if (!size.unknown) dataEnd = Math.min(dataEnd, end);
  return { id: id.value, headerStart: pos, dataStart, dataEnd, unknownSize: size.unknown };
}

function startOfCluster(u8, pos) {
  return u8[pos] === 0x1f && u8[pos + 1] === 0x43 && u8[pos + 2] === 0xb6 && u8[pos + 3] === 0x75;
}

export function parseWebM(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const len = u8.length;
  const out = {
    durationMs: null,
    timecodeScale: 1000000,
    video: { trackNumber: null, codec: null, width: 0, height: 0, samples: [] },
    audio: { trackNumber: null, codec: null, samples: [] },
    tracks: [],
  };

  // 1) varre elementos de topo até achar o Segment
  let pos = 0;
  let segment = null;
  while (pos < len) {
    const el = readElement(u8, pos, len);
    if (el.id === EBML) { pos = el.dataStart + (el.unknownSize ? 0 : el.dataEnd - el.dataStart); continue; }
    if (el.id === SEGMENT) { segment = el; break; }
    pos = el.unknownSize ? len : el.dataEnd;
    if (pos <= el.dataStart && !el.unknownSize) break;
  }
  if (!segment) throw new Error('Segment WebM não encontrado');
  const segEnd = segment.unknownSize ? len : segment.dataEnd;

  // 2) percorre os filhos do Segment
  let p = segment.dataStart;
  let clusterTc = 0;
  let clusterDataEnd = segEnd;
  const parseBlock = (blockEl, isSimple, keyOverride) => {
    const q = blockEl.dataStart;
    const track = readVint(u8, q, false);
    const rel = (u8[q + track.len] << 8) | u8[q + track.len + 1];
    const relSigned = rel > 0x7fff ? rel - 0x10000 : rel;
    let dataOff = q + track.len + 2;
    let key = keyOverride !== undefined ? keyOverride : true;
    if (isSimple) {
      const flags = u8[dataOff];
      key = (flags & 0x80) !== 0;
      dataOff += 1;
    }
    const endBlock = blockEl.dataEnd >= 0 ? blockEl.dataEnd : clusterDataEnd;
    const tsUs = Math.round(((clusterTc + relSigned) * out.timecodeScale) / 1000);
    const data = u8.subarray(dataOff, Math.min(endBlock, len));
    const isVideo = track.value === out.video.trackNumber;
    const isAudio = track.value === out.audio.trackNumber;
    if (isVideo) out.video.samples.push({ timestamp: tsUs, key, data });
    else if (isAudio) out.audio.samples.push({ timestamp: tsUs, key: true, data });
  };
  const walkBlockGroup = (el, clusterEnd) => {
    let r = el.dataStart;
    let hasRef = false;
    let blockEl = null;
    while (r < clusterEnd) {
      const child = readElement(u8, r, clusterEnd);
      if (child.id === BLOCK) blockEl = child;
      else if (child.id === REFERENCE_BLOCK) hasRef = true;
      r = child.unknownSize ? clusterEnd : child.dataEnd;
      if (r <= child.dataStart) break;
    }
    if (blockEl) {
      blockEl.dataEnd = blockEl.dataEnd >= 0 ? blockEl.dataEnd : clusterEnd;
      parseBlock(blockEl, false, !hasRef);
    }
  };

  while (p < segEnd) {
    let el;
    try { el = readElement(u8, p, segEnd); } catch { break; }
    if (el.id === INFO) {
      let r = el.dataStart;
      const infoEnd = el.unknownSize ? segEnd : el.dataEnd;
      while (r < infoEnd) {
        const c = readElement(u8, r, infoEnd);
        if (c.id === TIMEcode_SCALE) {
          let v = 0;
          for (let i = c.dataStart; i < c.dataEnd; i++) v = v * 256 + u8[i];
          if (v > 0) out.timecodeScale = v;
        }
        r = c.unknownSize ? infoEnd : c.dataEnd;
        if (r <= c.dataStart) break;
      }
    } else if (el.id === TRACKS) {
      let r = el.dataStart;
      const tracksEnd = el.unknownSize ? segEnd : el.dataEnd;
      while (r < tracksEnd) {
        const te = readElement(u8, r, tracksEnd);
        if (te.id === TRACK_ENTRY) {
          const t = { number: null, type: 0, codec: null, width: 0, height: 0, defaultDuration: 0 };
          let q = te.dataStart;
          const teEnd = te.unknownSize ? tracksEnd : te.dataEnd;
          while (q < teEnd) {
            const c = readElement(u8, q, teEnd);
            const readUInt = () => { let v = 0; for (let i = c.dataStart; i < c.dataEnd; i++) v = v * 256 + u8[i]; return v; };
            const readStr = () => { let s = ''; for (let i = c.dataStart; i < c.dataEnd; i++) s += String.fromCharCode(u8[i]); return s; };
            if (c.id === TRACK_NUMBER) t.number = readUInt();
            else if (c.id === TRACK_TYPE) t.type = readUInt();
            else if (c.id === CODEC_ID) t.codec = readStr();
            else if (c.id === PIXEL_WIDTH) t.width = readUInt();
            else if (c.id === PIXEL_HEIGHT) t.height = readUInt();
            else if (c.id === DEFAULT_DURATION) t.defaultDuration = readUInt();
            q = c.unknownSize ? teEnd : c.dataEnd;
            if (q <= c.dataStart) break;
          }
          out.tracks.push(t);
          if (t.type === 1 && !out.video.trackNumber) {
            out.video.trackNumber = t.number;
            out.video.codec = t.codec;
            out.video.width = t.width;
            out.video.height = t.height;
          } else if (t.type === 2 && !out.audio.trackNumber) {
            out.audio.trackNumber = t.number;
            out.audio.codec = t.codec;
          }
        }
        r = te.unknownSize ? tracksEnd : te.dataEnd;
        if (r <= te.dataStart) break;
      }
    } else if (el.id === CLUSTER) {
      // cluster pode ter tamanho desconhecido: acha o início do próximo ou o fim do segmento
      let clusterEnd = segEnd;
      if (!el.unknownSize) {
        clusterEnd = Math.min(el.dataEnd, segEnd);
      } else {
        let s = el.dataStart;
        while (s < segEnd - 3) {
          if (startOfCluster(u8, s)) { clusterEnd = s; break; }
          s++;
        }
      }
      let r = el.dataStart;
      clusterTc = 0;
      while (r < clusterEnd) {
        const c = readElement(u8, r, clusterEnd);
        if (c.id === CLUSTER_TIMECODE) {
          let v = 0;
          for (let i = c.dataStart; i < c.dataEnd; i++) v = v * 256 + u8[i];
          clusterTc = v;
        } else if (c.id === SIMPLE_BLOCK) {
          c.dataEnd = c.dataEnd >= 0 ? c.dataEnd : clusterEnd;
          parseBlock(c, true);
        } else if (c.id === BLOCK_GROUP) {
          clusterDataEnd = clusterEnd;
          walkBlockGroup(c, clusterEnd);
        }
        r = c.unknownSize ? clusterEnd : c.dataEnd;
        if (r <= c.dataStart) break;
      }
      p = el.unknownSize ? clusterEnd : el.dataEnd;
      if (p <= el.dataStart) p = segEnd;
      continue;
    }
    p = el.unknownSize ? segEnd : el.dataEnd;
    if (p <= el.dataStart) break;
  }

  out.video.samples.sort((a, b) => a.timestamp - b.timestamp);
  out.audio.samples.sort((a, b) => a.timestamp - b.timestamp);
  if (out.video.samples.length) {
    const last = out.video.samples[out.video.samples.length - 1];
    out.durationMs = last.timestamp / 1000;
  }
  return out;
}
