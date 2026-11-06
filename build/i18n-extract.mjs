#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Extrai textos visíveis (pt-BR) do app e da landing page para os dicionários de tradução.
//   node build/i18n-extract.mjs app      → lista textos de public/ que ainda não têm tradução
//   node build/i18n-extract.mjs site     → idem para landpage/
// Saída: JSON { "texto": "" } com as chaves faltantes (en e es), para completar os dicionários.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const which = process.argv[2] || 'app';
const SRC = which === 'site'
  ? { dirs: ['landpage/js'], html: ['landpage'], skip: /qr\.js$|i18n/, dict: 'landpage/js/i18n/strings.json' }
  : which === 'server'
    ? { dirs: ['server', 'android/app/src/main/java'], html: [], skip: /^$/, dict: 'public/js/i18n/strings.json' }
    : { dirs: ['public/js'], html: ['public'], skip: /qr\.js$|denoise|i18n|vendor/, dict: 'public/js/i18n/strings.json' };

const files = [];
const walk = (d, deep = true) => {
  for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
    const rel = path.join(d, e.name);
    if (e.isDirectory()) { if (deep && !/vendor|downloads|assets|docs|tools/.test(e.name)) walk(rel); }
    else if (/\.(js|html|java)$/.test(e.name) && !SRC.skip.test(rel)) files.push(rel);
  }
};
SRC.dirs.forEach((d) => walk(d));
SRC.html.forEach((d) => walk(d, false));

const out = new Set();
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const ACC = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/;
const looksText = (s) => {
  if (!/[A-Za-zÀ-ú]{2}/.test(s)) return false;
  if (/^(https?:|\/|#|\.|data:|rgba?\(|var\(|calc\()/.test(s)) return false;
  if (/[{};=]|=>|\|\||&&|\bfunction\b|\bconst\b|\breturn\b/.test(s)) return false;
  if (/^[a-z0-9_.:-]+$/.test(s) && !ACC.test(s)) return false; // identificadores, classes, eventos
  if (/^[A-Z0-9_]+$/.test(s) && s.length > 4 && !ACC.test(s)) return false;
  return ACC.test(s) || /\s/.test(s) || /^[A-ZÀ-Ú][a-zà-ú]+$/.test(s);
};
const add = (raw) => {
  let s = norm(raw.replace(/\$\{[^}]*\}/g, '{0}'));
  let i = 0; s = s.replace(/\{0\}/g, () => `{${i++}}`);
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  s = s.replace(/^[\s·•|:,–—-]+|[\s·•|,–—-]+$/g, '').trim();
  if (s.length < 2 || s.length > 600 || !looksText(s.replace(/\{\d\}/g, ' ').trim())) return;
  if (/^[\s\d{}:.,%/()+×x-]*$/.test(s)) return;
  out.add(s);
};
const scanMarkup = (txt) => {
  // atributos visíveis
  txt.replace(/\b(?:placeholder|title|aria-label|alt|data-tip|label)\s*=\s*(["'])(.*?)\1/g, (m, q, v) => (add(v), ''));
  // texto entre tags
  const stripped = txt.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ');
  stripped.split(/<[^>]*>/).forEach(add);
};

for (const f of files) {
  const code = fs.readFileSync(path.join(root, f), 'utf8');
  if (f.endsWith('.html')) { scanMarkup(code.replace(/<head>[\s\S]*?<\/head>/, '')); continue; }
  for (const v0 of jsStrings(code)) {
    const v = v0.replace(/\\n/g, ' ').replace(/\\(['"`])/g, '$1');
    if (which === 'server' && !ACC.test(v)) continue; // no servidor, só mensagens em português (logs técnicos ficam de fora)
    if (/[<>]/.test(v)) scanMarkup(v); else add(v);
  }
}

// tokenizador simples: strings '', "", templates `` (com ${} aninhados), ignorando comentários e regex comuns
function jsStrings(src) {
  const res = [];
  let i = 0;
  const n = src.length;
  function readQuoted(q) {
    let s = '';
    i++;
    while (i < n && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') { s += src[i] + src[i + 1]; i += 2; } else s += src[i++]; }
    i++;
    return s;
  }
  function readTemplate() {
    let s = '';
    i++;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { s += src[i] + src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { i += 2; s += '${x}'; readCode(true); continue; }
      s += src[i++];
    }
    i++;
    res.push(s);
  }
  function readCode(inExpr) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === "'" || c === '"') { res.push(readQuoted(c)); continue; }
      if (c === '`') { readTemplate(); continue; }
      if (c === '/') {
        // regex literal: depois de operador/abertura
        let k = i - 1; while (k >= 0 && /\s/.test(src[k])) k--;
        if (k < 0 || /[(,=:[!&|?{};+\-*%<>~^]/.test(src[k]) || /\b(return|typeof|case)$/.test(src.slice(Math.max(0, k - 6), k + 1))) {
          i++; let cls = false;
          while (i < n && src[i] !== '\n') { if (src[i] === '\\') { i += 2; continue; } if (src[i] === '[') cls = true; else if (src[i] === ']') cls = false; else if (src[i] === '/' && !cls) break; i++; }
          i++; continue;
        }
      }
      if (inExpr) { if (c === '{') depth++; else if (c === '}') { if (depth === 0) { i++; return; } depth--; } }
      i++;
    }
  }
  readCode(false);
  return res;
}

const have = () => {
  const p = path.join(root, SRC.dict);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
};
const en = have();
const missing = [...out].filter((s) => !(s in en)).sort();
const dest = process.argv[3];
const json = JSON.stringify(Object.fromEntries(missing.map((s) => [s, ''])), null, 1);
if (dest) fs.writeFileSync(dest, json, 'utf8'); else console.log(json);
console.error(`${out.size} textos encontrados, ${missing.length} sem tradução (${which})`);
