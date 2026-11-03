#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Versão única do CastDeck: o "version" do package.json vale para TODOS os builds
// (Windows/Linux/macOS, AppImage, APK) e para a release publicada na landing page.
//
//   node build/version.mjs                 -> mostra a versão atual
//   node build/version.mjs next [patch|minor|major]
//                                          -> avança para a próxima versão ainda não publicada
//   node build/version.mjs set 1.3.0       -> define uma versão
//   node build/version.mjs stamp <arquivo...> -> registra em dist/build-info.json com qual versão
//                                             cada arquivo de dist/ foi gerado (usado pelo publicador)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgFile = path.join(root, 'package.json');
const relFile = path.join(root, 'landpage', 'releases.json');
const infoFile = path.join(root, 'dist', 'build-info.json');

const semver = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
export const cmp = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const bump = (v, kind) => { const [a, b, c] = semver(v); return kind === 'major' ? `${a + 1}.0.0` : kind === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`; };

export const readVersion = () => JSON.parse(fs.readFileSync(pkgFile, 'utf8')).version;
export function writeVersion(v) {
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw new Error(`Versão inválida: ${v} (use X.Y.Z)`);
  // edita só a linha do "version" para preservar o restante do arquivo
  const txt = fs.readFileSync(pkgFile, 'utf8').replace(/("version"\s*:\s*")[^"]*(")/, `$1${v}$2`);
  fs.writeFileSync(pkgFile, txt);
}
export function releasedVersions() {
  try { return JSON.parse(fs.readFileSync(relFile, 'utf8')).releases.map((r) => r.version); } catch { return []; }
}
export function readStamps() {
  try { return JSON.parse(fs.readFileSync(infoFile, 'utf8')); } catch { return {}; }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, arg, ...rest] = process.argv.slice(2);
  if (!cmd) console.log(readVersion());
  else if (cmd === 'set') { writeVersion(arg); console.log(arg); }
  else if (cmd === 'next') {
    const released = releasedVersions();
    const latest = [readVersion(), ...released].sort(cmp).pop();
    // se a versão do package.json ainda não foi publicada (e é a mais alta), ela mesma é a próxima
    const v = released.includes(latest) ? bump(latest, arg || 'patch') : latest;
    writeVersion(v);
    console.log(v);
  } else if (cmd === 'stamp') {
    const v = readVersion();
    const info = readStamps();
    for (const f of [arg, ...rest].filter(Boolean)) info[path.basename(f)] = { version: v, at: new Date().toISOString() };
    fs.mkdirSync(path.dirname(infoFile), { recursive: true });
    fs.writeFileSync(infoFile, JSON.stringify(info, null, 2) + '\n');
  } else {
    console.error('Uso: node build/version.mjs [next [patch|minor|major] | set X.Y.Z | stamp <arquivos>]');
    process.exit(1);
  }
}
