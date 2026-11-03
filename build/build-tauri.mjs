// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Script de compilação do lançador desktop em Rust com Tauri 2.0.
// Substitui a dependência do csc.exe/.NET 4 por compilação nativa em Rust.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const isWin = process.platform === 'win32';
const cargo = isWin ? 'cargo.exe' : 'cargo';

function checkCargo() {
  const r = spawnSync(cargo, ['--version'], { encoding: 'utf8' });
  return r.status === 0;
}

export function buildTauriLauncher(serverExe, outPath) {
  if (!checkCargo()) {
    console.warn('⚠️  Rust/Cargo não encontrado no PATH do sistema.');
    console.warn('   Para compilar o lançador em Rust com Tauri 2.0, instale o Rust:');
    console.warn('   Windows: winget install Rustlang.Rustup');
    console.warn('   Linux/macOS: curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh');
    return false;
  }

  console.log('🦀 Compilando lançador nativo em Rust (Tauri 2.0)...');
  const tauriDir = path.resolve('src-tauri');
  
  // Compila o binário em release
  const res = spawnSync(cargo, ['build', '--release'], {
    cwd: tauriDir,
    stdio: 'inherit',
    shell: true,
  });

  if (res.status !== 0) {
    console.error('✖ Falha na compilação do lançador Tauri.');
    return false;
  }

  const binaryName = isWin ? 'castdeck-launcher.exe' : 'castdeck-launcher';
  const builtBinary = path.join(tauriDir, 'target', 'release', binaryName);

  if (fs.existsSync(builtBinary)) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.copyFileSync(builtBinary, outPath);
    console.log(`✔ Lançador Rust/Tauri 2.0 gerado com sucesso em: ${outPath}`);
    return true;
  }

  return false;
}

// Se executado diretamente: node build/build-tauri.mjs
if (process.argv[1].endsWith('build-tauri.mjs')) {
  const out = path.resolve(isWin ? 'dist/CastDeck.exe' : 'dist/CastDeck');
  buildTauriLauncher(null, out);
}
