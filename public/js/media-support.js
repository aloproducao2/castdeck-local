// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Descobre o contêiner de um arquivo pelos primeiros bytes e diz se o navegador consegue tocar.
// Motivo: o CastDeck toca a mídia direto do arquivo (blob), sem passar pelo servidor. Cada navegador
// decodifica um conjunto diferente de contêineres — em especial o Safari, que NÃO abre MKV, AVI, TS,
// FLV, OGG/Opus nem WebM. Quando não dá, o servidor local converte para MP4 H.264 + AAC.

// Assinaturas (magic numbers). `need` = quantos bytes precisamos ler para decidir.
export const CONTAINERS = {
  mp4: { label: 'MP4/MOV', kind: 'video', need: 16 },
  webm: { label: 'WebM', kind: 'video', need: 64 },
  mkv: { label: 'MKV', kind: 'video', need: 64 },
  avi: { label: 'AVI', kind: 'video', need: 16 },
  ts: { label: 'MPEG-TS', kind: 'video', need: 400 },
  flv: { label: 'FLV', kind: 'video', need: 16 },
  ogg: { label: 'OGG', kind: 'audio', need: 16 },
  wav: { label: 'WAV', kind: 'audio', need: 16 },
  mp3: { label: 'MP3', kind: 'audio', need: 16 },
  flac: { label: 'FLAC', kind: 'audio', need: 16 },
  aac: { label: 'AAC', kind: 'audio', need: 16 },
  png: { label: 'PNG', kind: 'image', need: 16 },
  jpeg: { label: 'JPEG', kind: 'image', need: 16 },
  gif: { label: 'GIF', kind: 'image', need: 16 },
  webp: { label: 'WebP', kind: 'image', need: 16 },
  unknown: { label: 'desconhecido', kind: 'unknown', need: 16 },
};

const ascii = (b, from, to) => String.fromCharCode(...b.slice(from, to));

// `bytes` = Uint8Array com os primeiros bytes do arquivo (400 já bastam para pegar TS).
export function sniffContainer(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length < 4) return 'unknown';
  if (b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (ascii(b, 0, 4) === 'GIF8') return 'gif';
  if (ascii(b, 0, 4) === 'RIFF') {
    const tipo = ascii(b, 8, 12);
    if (tipo === 'WEBP') return 'webp';
    if (tipo === 'AVI ') return 'avi';
    if (tipo === 'WAVE') return 'wav';
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    // Matroska e WebM têm a mesma assinatura: o DocType aparece logo depois do cabeçalho EBML
    const cabeca = ascii(b, 0, Math.min(b.length, 64)).toLowerCase();
    return cabeca.includes('webm') ? 'webm' : 'mkv';
  }
  if (b.length >= 12 && ascii(b, 4, 8) === 'ftyp') return 'mp4'; // inclui MOV (brand "qt  ")
  if (ascii(b, 0, 3) === 'FLV') return 'flv';
  if (ascii(b, 0, 4) === 'OggS') return 'ogg';
  if (ascii(b, 0, 4) === 'fLaC') return 'flac';
  if (ascii(b, 0, 3) === 'ID3') return 'mp3';
  // MPEG-TS: pacotes de 188 bytes começando em 0x47
  if (b[0] === 0x47 && (b.length < 189 || b[188] === 0x47)) return 'ts';
  if (b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return 'aac'; // ADTS
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3';
  return 'unknown';
}

// MIME que costuma vir do navegador -> contêiner (quando o sniff não reconhece)
const MIME_CONTAINER = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mp4',
  'video/x-m4v': 'mp4',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
  'video/mp2t': 'ts',
  'video/x-flv': 'flv',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'mp4',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'image/png': 'png',
  'image/jpeg': 'jpeg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export function containerFromMime(mime) {
  return MIME_CONTAINER[String(mime || '').toLowerCase()] || 'unknown';
}

// 'yes' = toca com certeza · 'maybe' = deixa o <video> decidir · 'no' = converter antes
// `canPlay(type)` deve ser `video.canPlayType`/`audio.canPlayType` do navegador atual.
export function playsHere(container, kind, canPlay) {
  const can = (t) => {
    try {
      return !!(canPlay && canPlay(t));
    } catch {
      return false;
    }
  };
  if (kind === 'image') return ['png', 'jpeg', 'gif', 'webp'].includes(container) ? 'yes' : 'no';
  if (container === 'mp4') {
    // MP4/MOV: H.264 + AAC é o caso normal; o <video> avisa se o codec interno não serve
    if (kind === 'audio') return can('audio/mp4') ? 'yes' : 'maybe';
    return can('video/mp4') ? 'maybe' : 'no';
  }
  if (container === 'webm') {
    // Safari não abre WebM (nem VP8/VP9, nem Opus, na prática)
    return can('video/webm; codecs="vp9"') || can('video/webm; codecs="vp8"') ? 'maybe' : 'no';
  }
  if (container === 'ogg') return can('audio/ogg; codecs="opus"') || can('audio/ogg; codecs="vorbis"') ? 'maybe' : 'no';
  if (container === 'mp3') return can('audio/mpeg') ? 'yes' : 'no';
  if (container === 'aac') return can('audio/aac') ? 'yes' : 'no';
  if (container === 'wav') return can('audio/wav') ? 'yes' : 'no';
  if (container === 'flac') return can('audio/flac') ? 'maybe' : 'no';
  // MKV, AVI, TS, FLV: nenhum navegador toca direto
  if (['mkv', 'avi', 'ts', 'flv'].includes(container)) return 'no';
  return 'maybe';
}

// Lê só o começo do arquivo e devolve { container, label, kind, veredito, mime }
export async function inspectFile(file, canPlay) {
  let head = new Uint8Array(0);
  try {
    head = new Uint8Array(await file.slice(0, 400).arrayBuffer());
  } catch {
    // arquivo que não pode ser lido (permissão/rede): deixa o player reclamar
  }
  let container = sniffContainer(head);
  if (container === 'unknown') container = containerFromMime(file.type);
  const meta = CONTAINERS[container] || CONTAINERS.unknown;
  const kind = /^image\//.test(file.type || '') ? 'image' : /^audio\//.test(file.type || '') ? 'audio' : meta.kind === 'unknown' ? 'video' : meta.kind;
  return { container, label: meta.label, kind, veredito: playsHere(container, kind, canPlay), mime: file.type || '' };
}

export function describeFormat(info) {
  return info && info.container && info.container !== 'unknown' ? info.label : 'formato não reconhecido';
}
