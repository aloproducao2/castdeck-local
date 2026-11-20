// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Gera os executáveis únicos do CastDeck (sem precisar de Node, FFmpeg ou cloudflared instalados).
//   npm run build:exe            -> só para o sistema em que você está (Windows: dist/CastDeck.exe)
//   npm run build:all            -> Windows, Linux e macOS (x64 e arm64)
//   node build/build-exe.mjs --targets win-x64,linux-x64   -> escolhe os alvos
//   adicione --refresh para baixar de novo FFmpeg/cloudflared embutidos
// O FFmpeg e o cloudflared de cada sistema são baixados UMA vez para build/vendor/<alvo>/ e embutidos no executável.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { NAMES, exeSuffix, fetchBinary } from '../server/binaries.js';
import { buildCaption, buildParakeet } from './build-caption.mjs';
import { assinarArquivos } from './sign.mjs';
import crypto from 'node:crypto';
import os from 'node:os';

// Windows: o CastDeck.exe final é um lançador nativo (sem console, com ícone, splash e bandeja)
// que embute o servidor empacotado pelo pkg. Compilado com o csc.exe que acompanha o Windows (.NET Framework 4).
const CSC = ['Framework64', 'Framework'].map((f) => path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', f, 'v4.0.30319', 'csc.exe')).find((p) => fs.existsSync(p));
function buildLauncher(serverExe, out, version) {
  // Garante que o PATH inclua o diretório ~/.cargo/bin se instalado
  const cargoBinDir = path.join(process.env.USERPROFILE || '', '.cargo', 'bin');
  if (fs.existsSync(cargoBinDir) && !process.env.PATH.includes(cargoBinDir)) {
    process.env.PATH = `${cargoBinDir};${process.env.PATH}`;
  }

  // Tenta compilar com Rust nativo se cargo estiver presente
  const cargoCheck = spawnSync('cargo', ['--version'], { encoding: 'utf8', shell: true });
  if (cargoCheck.status === 0 && fs.existsSync('src-tauri/Cargo.toml')) {
    console.log('🦀 Compilando lançador desktop nativo em Rust...');
    try {
      const cargoToml = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
      const updated = cargoToml.replace(/^version = "[^"]+"/m, `version = "${version}"`);
      if (updated !== cargoToml) fs.writeFileSync('src-tauri/Cargo.toml', updated);
    } catch { }
    // No Windows o TEMP costuma ficar no C: e o linker do Rust precisa de vários GB.
    // Usa a pasta do projeto (ou CASTDECK_CARGO_TARGET) para não falhar por espaço no disco do sistema.
    const targetDir = process.env.CASTDECK_CARGO_TARGET || path.resolve('build', 'tmp', 'cargo-target');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.copyFileSync(serverExe, 'src-tauri/server.bin');
    const env = { ...process.env, CARGO_TARGET_DIR: targetDir };
    const tauriBuild = spawnSync('cargo', ['build', '--release', '--features', 'embedded-server'], { cwd: 'src-tauri', stdio: 'inherit', shell: true, env });
    const tauriBin = path.join(targetDir, 'release', 'castdeck-launcher.exe');
    if (tauriBuild.status === 0 && fs.existsSync(tauriBin)) {
      fs.copyFileSync(tauriBin, out);
      try { fs.unlinkSync('src-tauri/server.bin'); } catch { }
      console.log(`✔ Lançador Rust nativo gerado com sucesso em: ${out}`);
      return true;
    }
    try { fs.unlinkSync('src-tauri/server.bin'); } catch { }
  }

  // Fallback: compilador C#/.NET 4 integrado do Windows
  console.log('ℹ Usando lançador Windows nativo (C#/.NET 4)...');
  const v4 = (version.split('.').concat(['0', '0', '0', '0']).slice(0, 4).map((n) => parseInt(n, 10) || 0)).join('.');
  fs.mkdirSync('build/tmp', { recursive: true });
  fs.writeFileSync('build/tmp/info.cs', `namespace CastDeck { static partial class Info { public const string Version = "${v4}"; } }\n`);
  const hash = crypto.createHash('sha1').update(fs.readFileSync(serverExe)).digest('hex').slice(0, 10);
  fs.writeFileSync('build/tmp/buildid.txt', `${version}-${hash}`);
  const args = [
    '/nologo', '/codepage:65001', '/target:winexe', '/optimize+', '/platform:anycpu',
    '/win32icon:build/assets/castdeck.ico', '/win32manifest:build/launcher/app.manifest',
    `/resource:${serverExe},server.bin`, '/resource:build/assets/splash.png,splash.png', '/resource:build/assets/icon-256.png,icon.png', '/resource:build/tmp/buildid.txt,buildid',
    '/r:System.dll', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll',
    `/out:${out}`, 'build/launcher/CastDeck.cs', 'build/tmp/info.cs',
  ];
  const r = spawnSync(CSC, args.map((a) => a.replace(/\//g, (m, i) => (i === 0 ? m : '\\'))), { stdio: 'inherit' });
  return r.status === 0 && fs.existsSync(out);
}

const TARGETS = {
  'win-x64': { pkg: 'node22-win-x64', plat: 'win32', arch: 'x64', out: 'CastDeck.exe' },
  'linux-x64': { pkg: 'node22-linux-x64', plat: 'linux', arch: 'x64', out: 'CastDeck-linux-x64' },
  'linux-arm64': { pkg: 'node22-linux-arm64', plat: 'linux', arch: 'arm64', out: 'CastDeck-linux-arm64' },
  'macos-x64': { pkg: 'node22-macos-x64', plat: 'darwin', arch: 'x64', out: 'CastDeck-macos-x64' },
  'macos-arm64': { pkg: 'node22-macos-arm64', plat: 'darwin', arch: 'arm64', out: 'CastDeck-macos-arm64' },
};

const args = process.argv.slice(2);
const refresh = args.includes('--refresh');
const ti = args.indexOf('--targets');
const host = `${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'macos' : 'linux'}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
let wanted = ti >= 0 ? args[ti + 1] : host;
if (wanted === 'all') wanted = Object.keys(TARGETS).join(',');
const list = wanted.split(',').map((s) => s.trim()).filter(Boolean);
for (const t of list) if (!TARGETS[t]) {
  console.error(`Alvo desconhecido: ${t}. Opções: ${Object.keys(TARGETS).join(', ')}, all`);
  process.exit(1);
}

fs.mkdirSync('dist', { recursive: true });

// Garante ldid no PATH (no Windows) para assinatura Mach-O ad-hoc de binários macOS gerados pelo @yao-pkg/pkg.
const TOOLS_DIR = path.resolve('build', 'vendor', 'tools');
const LDID_URL = 'https://github.com/ProcursusTeam/ldid/releases/download/v2.1.5-procursus8/ldid_w64_x86_64.exe';
const LDID_BIN = path.join(TOOLS_DIR, process.platform === 'win32' ? 'ldid.exe' : 'ldid');
{
  const sep = process.platform === 'win32' ? ';' : ':';
  if (!String(process.env.PATH || '').includes(TOOLS_DIR)) {
    process.env.PATH = `${TOOLS_DIR}${sep}${process.env.PATH || ''}`;
  }
}
if (list.some((k) => k.startsWith('macos-')) && process.platform === 'win32' && !fs.existsSync(LDID_BIN)) {
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  process.stdout.write('  ldid: baixando para assinar macOS… ');
  const res = await fetch(LDID_URL);
  if (!res.ok) throw new Error(`Falha ao baixar ldid (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(LDID_BIN, buf);
  console.log(`ok (${(buf.length / 1048576).toFixed(1)} MB)`);
}

const pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
console.log(`Versão: ${pkgJson.version}`);

await build({
  entryPoints: ['server/index.js'],
  outfile: 'dist/castdeck.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // import.meta.url não existe em CJS: recria a partir do __filename (dentro do executável = /snapshot/...)
  banner: { js: "const __importMetaUrl = require('url').pathToFileURL(__filename).href;" },
  // a versão do package.json vai embutida no executável (mesma da release na landing page)
  define: { 'import.meta.url': '__importMetaUrl', __APP_VERSION__: JSON.stringify(pkgJson.version) },
  logLevel: 'info',
});

let failed = 0;
for (const key of list) {
  const t = TARGETS[key];
  console.log(`\n=== ${key} ===`);
  // 1) binários externos deste sistema (cacheados em build/vendor/<alvo>/)
  const vdir = path.join('build', 'vendor', key);
  for (const name of NAMES) {
    const file = path.join(vdir, name + exeSuffix(t.plat));
    if (!refresh && fs.existsSync(file) && fs.statSync(file).size > 1e6) {
      console.log(`  ${name}: em cache (${(fs.statSync(file).size / 1048576).toFixed(0)} MB)`);
      continue;
    }
    process.stdout.write(`  ${name}: baixando… `);
    let last = -1;
    await fetchBinary(name, t.plat, t.arch, file, (p) => {
      if (p % 20 === 0 && p !== last) {
        last = p;
        process.stdout.write(`${p}% `);
      }
    });
    console.log(`ok (${(fs.statSync(file).size / 1048576).toFixed(0)} MB)`);
  }
  // a licença MIT do MediaMTX exige o aviso junto do binário redistribuído
  const mtxLic = path.join('build', 'assets', 'licenses', 'mediamtx-LICENSE.txt');
  if (fs.existsSync(mtxLic)) fs.copyFileSync(mtxLic, path.join(vdir, 'mediamtx-LICENSE.txt'));
  // bridge NDI (Rust): copia o compilado local no host correspondente e confere extras por alvo.
  if (key.startsWith('win-') && key === host) {
    const ndiSrc = path.resolve('native', 'ndi-bridge', 'target', 'release', 'castdeck-ndi.exe');
    if (fs.existsSync(ndiSrc)) {
      fs.copyFileSync(ndiSrc, path.join(vdir, 'castdeck-ndi.exe'));
      fs.copyFileSync(ndiSrc, path.join('dist', 'castdeck-ndi.exe'));
      console.log(`  castdeck-ndi: ${(fs.statSync(ndiSrc).size / 1024).toFixed(0)} KB`);
    } else {
      console.warn('  ⚠ castdeck-ndi não compilado: compile native/ndi-bridge antes do build.');
    }
  }
  // helper CEF (BrowserSource nativo no Windows): mantém dist/browser-host-cef atualizado junto do executável
  if (key === 'win-x64' && key === host) {
    const cefOut = path.resolve('native', 'browser-host-cef', 'bin', 'Release', 'net8.0-windows', 'win-x64');
    const cefDist = path.resolve('dist', 'browser-host-cef');
    const rcPath = path.join(cefOut, 'browser-host-cef.runtimeconfig.json');
    const isSelfContained = fs.existsSync(rcPath) && /"includedFrameworks"/.test(fs.readFileSync(rcPath, 'utf8'));
    if (fs.existsSync(path.join(cefOut, 'browser-host-cef.exe')) && isSelfContained) {
      fs.mkdirSync(cefDist, { recursive: true });
      for (const f of ['browser-host-cef.exe', 'browser-host-cef.dll', 'browser-host-cef.deps.json', 'browser-host-cef.runtimeconfig.json']) {
        const src = path.join(cefOut, f);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(cefDist, f));
      }
      console.log('  browser-host-cef: sincronizado em dist/browser-host-cef');
    }
  }
  // workers nativos (Whisper + Parakeet) compilam no próprio host quando é igual; para alvos cruzados
  // permanecem os binários já gerados em build/vendor/<alvo>/.
  if (key === host) {
    try {
      await buildCaption({ quiet: false });
    } catch (e) {
      console.warn(`  ⚠ legenda ao vivo fora deste build: ${e.message}`);
    }
    try {
      await buildParakeet({ quiet: false });
    } catch (e) {
      console.warn(`  ⚠ legenda Parakeet fora deste build: ${e.message}`);
    }
  }
  const sfx = key.startsWith('win-') ? '.exe' : '';
  const ortMain = key.startsWith('win-') ? 'onnxruntime.dll' : key.startsWith('macos-') ? 'libonnxruntime.dylib' : 'libonnxruntime.so';
  for (const b of ['castdeck-ndi' + sfx, 'castdeck-caption' + sfx, 'castdeck-parakeet' + sfx, ortMain]) {
    const vp = path.join(vdir, b);
    if (fs.existsSync(vp)) {
      if (key.startsWith('macos-') && process.platform !== 'darwin' && fs.existsSync(LDID_BIN)) {
        spawnSync(LDID_BIN, ['-Cadhoc', '-S', vp], { stdio: 'ignore' });
      }
      console.log(`  vendor/${b}: ${(fs.statSync(vp).size / 1048576).toFixed(1)} MB`);
    } else {
      console.warn(`  ⚠ vendor/${b} ausente para ${key}`);
    }
  }
  // 2) empacota: pasta public/ + binários deste alvo viram assets do executável
  const cfgFile = path.join('build', `pkg.${key}.json`);
  const cfg = {
    name: 'castdeck',
    version: pkgJson.version,
    // VERSIONINFO do servidor embutido: sem isso o arquivo que o lançador grava em disco aparece como
    // "Node.js JavaScript Runtime" (assinatura de dropper) para antivírus e para o usuário.
    description: 'CastDeck Local — servidor',
    author: 'flue.live — Miguel Kallemback',
    copyright: 'Copyright © 2026 Miguel Kallemback / flue.live. AGPL-3.0.',
    license: 'AGPL-3.0-only',
    homepage: 'https://cast.flue.live',
    bin: '../dist/castdeck.cjs',
    pkg: { assets: ['../public/**/*', `./vendor/${key}/*`], targets: [t.pkg] },
  };
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2));
  const out = path.join('dist', t.out);
  const launcher = key === 'win-x64' && host === 'win-x64' && CSC && fs.existsSync('build/assets/castdeck.ico');
  const pkgOut = launcher ? path.join('build', 'tmp', 'castdeck-server.exe') : out;
  if (launcher) fs.mkdirSync(path.dirname(pkgOut), { recursive: true });
  const pkgArgs = ['pkg', 'dist/castdeck.cjs', '--config', cfgFile, '--target', t.pkg, '--output', pkgOut, '--compress', 'GZip'];
  // alvos de outro sistema/arquitetura nao rodam neste PC (nao da para gerar bytecode): empacota o JS como texto
  const cross = key !== host;
  const r = spawnSync('npx', cross ? [...pkgArgs, '--no-bytecode', '--public'] : pkgArgs, { stdio: 'inherit', shell: true });
  let ok = r.status === 0 && fs.existsSync(pkgOut);
  // Nota: NÃO reescrever os recursos do servidor do pkg (rcedit/resedit). O binário do pkg tem o
  // payload anexado DEPOIS da imagem PE; qualquer editor de recursos regrava o arquivo e descarta o
  // payload (190 MB → 55 MB, app não sobe). A identidade do servidor fica a do Node e é a ASSINATURA
  // (feita abaixo, no arquivo final antes de embutir) que dá o editor confiável ao Windows.
  // Assinatura Authenticode (Windows): assina o SERVIDOR antes de embutir — assim o arquivo que o
  // lançador grava em %LOCALAPPDATA% e executa continua assinado. Sem isso o antivírus trata o exe
  // extraído como "dropper" e coloca em quarentena.
  const assinarWin = (arquivo) => {
    if (key !== 'win-x64' || host !== 'win-x64' || !fs.existsSync(arquivo)) return;
    try {
      assinarArquivos([arquivo]);
    } catch (e) {
      console.error(`  ✖ assinatura: ${e.message}`);
      failed++;
      ok = false;
    }
  };
  if (ok && launcher) assinarWin(pkgOut);
  if (ok && launcher) {
    console.log('  lançador nativo (sem console, ícone, splash, bandeja)…');
    if (!buildLauncher(pkgOut, out, pkgJson.version)) {
      console.warn('  lançador falhou; usando o executável com console');
      fs.copyFileSync(pkgOut, out);
    }
  } else if (key === 'win-x64' && host === 'win-x64' && !CSC) console.warn('  csc.exe não encontrado: CastDeck.exe terá janela de console');
  ok = ok && fs.existsSync(out);
  if (ok) assinarWin(out);
  if (ok && key.startsWith('macos-') && process.platform !== 'darwin' && fs.existsSync(LDID_BIN)) {
    const ls = spawnSync(LDID_BIN, ['-Cadhoc', '-S', out], { stdio: 'inherit' });
    if (ls.status === 0) console.log('  ✔ Assinatura Mach-O ad-hoc aplicada (ldid)');
    else {
      console.error(`  FALHOU assinatura ldid em ${out}`);
      failed++;
      continue;
    }
  }
  if (ok) {
    console.log(`  -> ${out} (${(fs.statSync(out).size / 1048576).toFixed(0)} MB) v${pkgJson.version}`);
    spawnSync(process.execPath, ['build/version.mjs', 'stamp', out], { stdio: 'inherit' });
  }
  else {
    console.error(`  FALHOU: ${key}`);
    failed++;
  }
}
console.log(failed ? `\n${failed} alvo(s) falharam.` : '\nConcluído.');
process.exit(failed ? 1 : 0);
