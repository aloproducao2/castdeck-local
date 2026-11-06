// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
//
// Gera o instalador Windows (Inno Setup) sem tocar no executável portátil.
// Uso: npm run build:installer
// Requisito de build: Inno Setup 6 (https://jrsoftware.org/isinfo.php).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const ISS_DIR = path.join(ROOT, 'build', 'installer');
const ISS = path.join(ISS_DIR, 'CastDeck.iss');
const OUT = path.join(DIST, 'installer');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const exe = path.join(DIST, 'CastDeck.exe');
const bridge = path.join(DIST, 'castdeck-ndi.exe');
if (!fs.existsSync(exe)) {
  console.error('dist/CastDeck.exe não existe. Rode npm run build:exe primeiro.');
  process.exit(1);
}
if (!fs.existsSync(bridge)) {
  console.error('dist/castdeck-ndi.exe não existe. Rode npm run build:exe primeiro.');
  process.exit(1);
}

const candidates = [
  process.env.INNO_SETUP_ISCC,
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
  'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
].filter(Boolean);
const iscc = candidates.find((p) => {
  try { return fs.statSync(p).isFile(); } catch { return false; }
});
if (!iscc) {
  console.error('ISCC.exe (Inno Setup 6) não encontrado. Instale o Inno Setup ou defina INNO_SETUP_ISCC.');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, `CastDeck-Setup-${pkg.version}.exe`);
if (fs.existsSync(outFile)) fs.rmSync(outFile, { force: true });

console.log(`[installer] CastDeck ${pkg.version}`);
console.log(`[installer] ISCC: ${iscc}`);
const args = [
  `/DMyAppVersion=${pkg.version}`,
  `/O${OUT}`,
  ISS,
];
const r = spawnSync(iscc, args, { cwd: ISS_DIR, stdio: 'inherit' });
if (r.error) {
  console.error('[installer] falha ao executar ISCC:', r.error.message);
  process.exit(1);
}
if (r.status !== 0 || !fs.existsSync(outFile)) {
  console.error(`[installer] ISCC terminou com código ${r.status}; saída não encontrada.`);
  process.exit(1);
}
const st = fs.statSync(outFile);
const hash = crypto.createHash('sha256').update(fs.readFileSync(outFile)).digest('hex').toUpperCase();
console.log(`[installer] OK: ${outFile}`);
console.log(`[installer] ${(st.size / 1048576).toFixed(1)} MB · SHA-256 ${hash}`);
console.log('[installer] O portátil dist/CastDeck.exe foi mantido intacto.');
