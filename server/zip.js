// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Leitor de ZIP mínimo (só o que o catálogo de plugins precisa): entradas "stored" (0) e "deflate" (8).
// Usado para instalar .cdplug em qualquer sistema sem depender de unzip/tar externos.
import zlib from 'node:zlib';

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;

function acharEocd(buf) {
  // o EOCD fica no fim; procura de trás para frente (comentário máximo de 64 KB)
  const min = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === EOCD) return i;
  }
  return -1;
}

export function readZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('arquivo compactado inválido');
  const eocd = acharEocd(buf);
  if (eocd < 0) throw new Error('arquivo compactado inválido (fim do diretório não encontrado)');
  const total = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(pos) !== CEN) throw new Error('arquivo compactado inválido (diretório)');
    const metodo = buf.readUInt16LE(pos + 10);
    const compSize = buf.readUInt32LE(pos + 20);
    const nomeLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const comentLen = buf.readUInt16LE(pos + 32);
    const localOff = buf.readUInt32LE(pos + 42);
    const nome = buf.toString('utf8', pos + 46, pos + 46 + nomeLen);
    pos += 46 + nomeLen + extraLen + comentLen;

    if (buf.readUInt32LE(localOff) !== LOC) throw new Error(`arquivo compactado inválido (${nome})`);
    const lNomeLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const inicio = localOff + 30 + lNomeLen + lExtraLen;
    const comp = buf.subarray(inicio, inicio + compSize);

    if (nome.endsWith('/')) continue; // pasta
    let data;
    if (metodo === 0) data = Buffer.from(comp);
    else if (metodo === 8) data = zlib.inflateRawSync(comp);
    else throw new Error(`compactação não suportada em ${nome} (método ${metodo})`);
    out.push({ name: nome, data });
  }
  return out;
}
