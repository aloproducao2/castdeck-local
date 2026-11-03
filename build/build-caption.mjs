// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Compila o worker de legenda (crates/castdeck-caption, Rust + whisper.cpp) e o coloca em
// build/vendor/<alvo>/castdeck-caption(.exe), de onde o build-exe o embute no executável (como o FFmpeg).
//   node build/build-caption.mjs            -> compila para este sistema (só recompila se o código mudou)
//   node build/build-caption.mjs --force    -> recompila sempre
// Precisa de: cargo (Rust) e compilador C/C++ (MSVC no Windows). O CMake é baixado em build/tmp/tools
// (portátil, nada é instalado no sistema).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CMAKE_VER = '3.31.6';
const host = `${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'macos' : 'linux'}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
const exe = process.platform === 'win32' ? '.exe' : '';
const CRATE = path.resolve('crates', 'castdeck-caption');
const OUT = path.resolve('build', 'vendor', host, 'castdeck-caption' + exe);
const STAMP = OUT + '.hash';
const force = process.argv.includes('--force');

const PARAKEET_CRATE = path.resolve('crates', 'castdeck-parakeet');
const PARAKEET_OUT = path.resolve('build', 'vendor', host, 'castdeck-parakeet' + exe);
const ORT_VER = '1.22.0';

function srcHash() {
  const h = crypto.createHash('sha1');
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(e.name).update(fs.readFileSync(p));
    }
  };
  h.update(fs.readFileSync(path.join(CRATE, 'Cargo.toml')));
  walk(path.join(CRATE, 'src'));
  return h.digest('hex');
}

async function ensureCmake() {
  const probe = spawnSync('cmake', ['--version'], { shell: true, encoding: 'utf8' });
  if (probe.status === 0) return null;
  if (process.platform !== 'win32') throw new Error('CMake não encontrado: instale com o gerenciador de pacotes (apt/brew install cmake).');
  const dir = path.resolve('build', 'tmp', 'tools');
  const bin = path.join(dir, `cmake-${CMAKE_VER}-windows-x86_64`, 'bin');
  if (fs.existsSync(path.join(bin, 'cmake.exe'))) return bin;
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'cmake.zip');
  console.log(`  baixando CMake ${CMAKE_VER} portátil…`);
  const res = await fetch(`https://github.com/Kitware/CMake/releases/download/v${CMAKE_VER}/cmake-${CMAKE_VER}-windows-x86_64.zip`);
  if (!res.ok) throw new Error(`download do CMake falhou (${res.status})`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const r = spawnSync('tar', ['-xf', zip, '-C', dir], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('não foi possível extrair o CMake');
  return bin;
}

// O bindgen do whisper-rs-sys precisa do libclang para gerar os bindings deste sistema (os que vêm prontos são
// do Linux e não compilam no Windows). Pega o libclang.dll do pacote "libclang" do PyPI (um .whl é um zip),
// sem instalar nada no Python nem no sistema.
async function ensureLibclang() {
  if (process.platform !== 'win32' || process.env.LIBCLANG_PATH) return process.env.LIBCLANG_PATH || null;
  const dir = path.resolve('build', 'tmp', 'tools', 'libclang');
  const dll = path.join(dir, 'libclang-18.1.1.data', 'platlib', 'clang', 'native', 'libclang.dll');
  if (fs.existsSync(dll)) return path.dirname(dll);
  fs.mkdirSync(dir, { recursive: true });
  console.log('  baixando libclang (bindgen)…');
  const meta = await (await fetch('https://pypi.org/pypi/libclang/18.1.1/json')).json();
  const whl = meta.urls.find((u) => u.filename.includes('win_amd64'));
  if (!whl) throw new Error('libclang para Windows não encontrado no PyPI');
  const zip = path.join(dir, 'libclang.zip');
  const res = await fetch(whl.url);
  if (!res.ok) throw new Error(`download do libclang falhou (${res.status})`);
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const r = spawnSync('tar', ['-xf', zip, '-C', dir], { stdio: 'inherit' });
  if (r.status !== 0 || !fs.existsSync(dll)) throw new Error('não foi possível extrair o libclang');
  return path.dirname(dll);
}

export async function buildCaption({ quiet = false } = {}) {
  const hash = srcHash();
  if (!force && fs.existsSync(OUT) && fs.existsSync(STAMP) && fs.readFileSync(STAMP, 'utf8') === hash) {
    if (!quiet) console.log(`  castdeck-caption: em cache (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);
    return OUT;
  }
  const cargoBin = path.join(process.env.USERPROFILE || process.env.HOME || '', '.cargo', 'bin');
  const env = { ...process.env };
  if (fs.existsSync(cargoBin)) env.PATH = `${cargoBin}${path.delimiter}${env.PATH}`;
  const cmakeBin = await ensureCmake();
  if (cmakeBin) env.PATH = `${cmakeBin}${path.delimiter}${env.PATH}`;
  const clang = await ensureLibclang();
  if (clang) env.LIBCLANG_PATH = clang;
  // binário distribuído: não usar as instruções da CPU de quem compila (GGML_NATIVE) e sim AVX2/FMA,
  // presentes em praticamente todo PC de 2013 para cá
  if (host.endsWith('x64')) Object.assign(env, { GGML_NATIVE: 'OFF', GGML_AVX: 'ON', GGML_AVX2: 'ON', GGML_FMA: 'ON', GGML_F16C: 'ON' });
  // o crate cmake troca as flags de Release pelas do cc e remove qualquer /O (sem otimização no MSVC): o
  // whisper.cpp saía ~30x mais lento. O whisper-rs-sys repassa variáveis CMAKE_* ao CMake: define as de Release.
  // Runtime do C/C++ embutido (/MT + crt-static): sem isso o worker exigiria o "Visual C++ Redistributable"
  // (vcruntime140/msvcp140.dll) instalado no PC de quem usa o CastDeck.
  if (process.platform === 'win32') Object.assign(env, { CMAKE_C_FLAGS_RELEASE: '/MT /O2 /Ob2 /Oi /DNDEBUG', CMAKE_CXX_FLAGS_RELEASE: '/MT /O2 /Ob2 /Oi /DNDEBUG /EHsc', CMAKE_MSVC_RUNTIME_LIBRARY: 'MultiThreaded', RUSTFLAGS: `${env.RUSTFLAGS || ''} -C target-feature=+crt-static`.trim() });
  else Object.assign(env, { CMAKE_C_FLAGS_RELEASE: '-O3 -DNDEBUG', CMAKE_CXX_FLAGS_RELEASE: '-O3 -DNDEBUG' });
  // TEMP no C: costuma faltar espaço para o link: compila dentro do projeto
  env.CARGO_TARGET_DIR = process.env.CASTDECK_CAPTION_TARGET || path.resolve('build', 'tmp', 'cargo-caption');
  console.log('🦀 Compilando worker de legenda (Rust + whisper.cpp)…');
  const r = spawnSync('cargo', ['build', '--release'], { cwd: CRATE, stdio: quiet ? 'pipe' : 'inherit', shell: true, env });
  const built = path.join(env.CARGO_TARGET_DIR, 'release', 'castdeck-caption' + exe);
  if (r.status !== 0 || !fs.existsSync(built)) {
    if (quiet && r.stderr) process.stderr.write(r.stderr);
    throw new Error('falha ao compilar o worker de legenda');
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.copyFileSync(built, OUT);
  fs.writeFileSync(STAMP, hash);
  console.log(`  -> ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB)`);
  return OUT;
}

export async function buildParakeet({ quiet = false } = {}) {
  if (process.platform !== 'win32') return null; // por enquanto só win-x64
  const cargoBin = path.join(process.env.USERPROFILE || process.env.HOME || '', '.cargo', 'bin');
  const env = { ...process.env, CARGO_TARGET_DIR: process.env.CASTDECK_PARAKEET_TARGET || path.resolve('build', 'tmp', 'cargo-parakeet') };
  if (fs.existsSync(cargoBin)) env.PATH = `${cargoBin}${path.delimiter}${env.PATH}`;
  if (!quiet) console.log('🦀 Compilando worker Parakeet (Rust + ONNX Runtime)…');
  const r = spawnSync('cargo', ['build', '--release'], { cwd: PARAKEET_CRATE, stdio: quiet ? 'pipe' : 'inherit', shell: true, env });
  const built = path.join(env.CARGO_TARGET_DIR, 'release', 'castdeck-parakeet' + exe);
  if (r.status !== 0 || !fs.existsSync(built)) {
    if (quiet && r.stderr) process.stderr.write(r.stderr);
    throw new Error('falha ao compilar o worker Parakeet');
  }
  fs.mkdirSync(path.dirname(PARAKEET_OUT), { recursive: true });
  fs.copyFileSync(built, PARAKEET_OUT);

  // ONNX Runtime carregado dinamicamente: baixa a DLL e coloca junto do exe (será embutida pelo build-exe)
  const dlls = ['onnxruntime.dll', 'onnxruntime_providers_shared.dll'];
  const zip = path.join(path.dirname(PARAKEET_OUT), `onnxruntime-win-x64-${ORT_VER}.zip`);
  if (!fs.existsSync(path.join(path.dirname(PARAKEET_OUT), 'onnxruntime.dll'))) {
    if (!fs.existsSync(zip)) {
      if (!quiet) console.log('  baixando ONNX Runtime win-x64…');
      const res = await fetch(`https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VER}/onnxruntime-win-x64-${ORT_VER}.zip`);
      if (!res.ok) throw new Error(`download do ONNX Runtime falhou (${res.status})`);
      fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
    }
    const r = spawnSync('tar', ['-xf', zip, '-C', path.dirname(PARAKEET_OUT)], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('não foi possível extrair o ONNX Runtime');
    for (const d of dlls) {
      const from = path.join(path.dirname(PARAKEET_OUT), `onnxruntime-win-x64-${ORT_VER}`, 'lib', d);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(path.dirname(PARAKEET_OUT), d));
    }
  }
  if (!quiet) console.log(`  -> ${path.relative(process.cwd(), PARAKEET_OUT)}`);
  return PARAKEET_OUT;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('build', 'build-caption.mjs')) {
  buildCaption().catch((e) => {
    console.error('✖', e.message);
    process.exit(1);
  });
}
