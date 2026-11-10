#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Empacota o código-fonte correspondente aos binários (exigência da AGPL-3.0, seção 6).
// Por enquanto o pacote fica PRIVADO em dist/source/ e o site mostra "em breve".
// Para liberar publicamente: node build/pack-source.mjs --public (vai para landpage/downloads/source/).
// Nunca inclui dados do usuário (data/: chaves de transmissão, certificados), builds ou dependências baixadas.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const PUBLIC = process.argv.includes('--public');
const pageDir = path.join(root, 'landpage', 'downloads', 'source');
const outDir = PUBLIC ? pageDir : path.join(root, 'dist', 'source');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(pageDir, { recursive: true });

const INCLUDE = ['server', 'public', 'build', 'android', 'docs', 'test', 'deploy', 'landpage', 'package.json', 'package-lock.json', 'README.md', 'LICENSE', 'NOTICE', 'COMMERCIAL-LICENSE.md', 'CONTRIBUTING.md', 'iniciar.bat', '.gitignore'];
const EXCLUDE = [
  /^data(\/|$)/, /^dist(\/|$)/, /^recordings(\/|$)/, /node_modules/, /^build\/(vendor|tmp)(\/|$)/,
  /^android\/(\.gradle|build|app\/build|\.idea)(\/|$)/, /^android\/local\.properties$/, /^android\/app\/src\/main\/assets\/(web|bin)(\/|$)/,
  /^landpage\/downloads\/.+\//, /\.(jks|keystore|p12|pem|key)$/i, /(^|\/)\.env/, /\.log$/, /(^|\/)\.tmp/,
  // Documentos internos que nunca devem ir no pacote público de fonte
  /^docs\/artigo-imprensa\.md$/, /^docs\/PLANO-MELHORIAS\.md$/,
];

const files = [];
const walk = (rel) => {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  const st = fs.statSync(abs);
  const posix = rel.split(path.sep).join('/');
  if (EXCLUDE.some((r) => r.test(posix))) return;
  if (st.isDirectory()) for (const e of fs.readdirSync(abs)) walk(path.join(rel, e));
  else files.push(posix);
};
INCLUDE.forEach(walk);

const name = `castdeck-${version}-source.zip`;
const zip = path.join(outDir, name);
const list = path.join(root, 'build', 'tmp', 'source-files.txt');
fs.mkdirSync(path.dirname(list), { recursive: true });
fs.writeFileSync(list, files.join('\n'));
fs.rmSync(zip, { force: true });
// bsdtar (Windows 10+, macOS) e GNU tar com -a geram .zip pela extensão
const r = spawnSync('tar', ['-a', '-c', '-f', zip, '-C', root, '-T', list], { stdio: 'inherit' });
if (r.status !== 0) {
  console.error('✖ falha ao gerar o zip do código-fonte');
  process.exit(1);
}
const mb = (fs.statSync(zip).size / 1048576).toFixed(1);

const GITHUB = 'https://github.com/aloproducao2/castdeck-local';
const head = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Código-fonte – CastDeck</title><link rel="icon" href="/assets/img/icon.png">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@600;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/css/site.css"></head>
<body><main><section class="page-title"><div class="wrap" style="max-width:760px">`;
const foot = `<p style="margin-top:28px"><a class="btn" href="/">← Voltar ao site</a></p></div></section></main></body></html>`;
if (PUBLIC) {
  // mantém só os 5 pacotes mais recentes
  const zips = fs.readdirSync(outDir).filter((f) => /^castdeck-.+-source\.zip$/.test(f)).sort((a, b) => fs.statSync(path.join(outDir, b)).mtimeMs - fs.statSync(path.join(outDir, a)).mtimeMs);
  zips.slice(5).forEach((f) => fs.rmSync(path.join(outDir, f)));
  const rows = zips.slice(0, 5).map((f) => `<li><a href="${f}">${f}</a> · ${(fs.statSync(path.join(outDir, f)).size / 1048576).toFixed(1)} MB</li>`).join('\n');
  fs.writeFileSync(path.join(pageDir, 'index.html'), `${head}
<span class="eyebrow"><i></i> Código aberto</span><h1>Código-fonte no <span class="grad">GitHub</span></h1>
<p>Software livre sob a <a href="https://www.gnu.org/licenses/agpl-3.0.html">GNU AGPL-3.0</a>. Copyright © 2026 Miguel Kallemback / flue.live.</p>
<p style="margin:22px 0"><a class="btn primary" href="${GITHUB}" target="_blank" rel="noopener">🐙 Abrir repositório no GitHub</a></p>
<p>O código completo, issues, releases e avisos de terceiros estão no repositório. Para compilar: <code>npm ci</code>, <code>npm run vendor:web</code> e <code>npm run build:all</code> (veja README.md/BUILDING.md). Licença comercial: COMMERCIAL-LICENSE.md.</p>
<p style="margin-top:18px">Pacotes de fonte disponíveis:</p>
<ul style="text-align:left;margin:16px auto;max-width:520px">${rows}</ul>${foot}`);
} else {
  // O código já é público no GitHub; o modo privado só mantém os ZIPs fora do site.
  fs.readdirSync(pageDir).filter((f) => f.endsWith('.zip')).forEach((f) => fs.renameSync(path.join(pageDir, f), path.join(root, 'dist', 'source', f)));
  fs.writeFileSync(path.join(pageDir, 'index.html'), `${head}
<span class="eyebrow"><i></i> Código aberto</span><h1>Código-fonte no <span class="grad">GitHub</span></h1>
<p>Software livre sob a <a href="https://www.gnu.org/licenses/agpl-3.0.html">GNU AGPL-3.0</a>. Copyright © 2026 Miguel Kallemback / flue.live.</p>
<p style="margin:22px 0"><a class="btn primary" href="${GITHUB}" target="_blank" rel="noopener">🐙 Abrir repositório no GitHub</a></p>
<p>O código completo, issues, releases e avisos de terceiros estão no repositório. Para compilar: <code>npm ci</code>, <code>npm run vendor:web</code> e <code>npm run build:all</code> (veja README.md/BUILDING.md). Licença comercial: COMMERCIAL-LICENSE.md.</p>${foot}`);
}
console.log(`✔ código-fonte ${PUBLIC ? 'PÚBLICO' : 'privado'}: ${path.relative(root, zip)} (${mb} MB, ${files.length} arquivos)`);
