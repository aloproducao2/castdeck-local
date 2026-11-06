#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Gera os guias em PDF "Onde pegar a chave de transmissão" por plataforma (pt/en/es).
//   node build/make-key-guides.mjs
// Fonte dos textos: public/js/dest-help.js (pt) + public/js/i18n/strings.json (en/es).
// Saída: public/guias/<plataforma>-<idioma>.pdf (vai junto no app, funciona offline) e cópia em landpage/guias/.
// Usa o Edge/Chrome em modo headless para imprimir o HTML em PDF.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KEY_HELP } from '../public/js/dest-help.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dict = JSON.parse(fs.readFileSync(path.join(root, 'public/js/i18n/strings.json'), 'utf8'));
const LANGS = { pt: -1, en: 0, es: 1 };
const PLAT = {
  youtube: { label: 'YouTube', short: 'YT', color: '#ff0033', v: false },
  facebook: { label: 'Facebook', short: 'FB', color: '#1877f2', v: false },
  twitch: { label: 'Twitch', short: 'TW', color: '#9146ff', v: false },
  kick: { label: 'Kick', short: 'K', color: '#53fc18', fg: '#0b0b12', v: false },
  instagram: { label: 'Instagram', short: 'IG', color: 'linear-gradient(135deg,#f58529,#dd2a7b,#8134af)', v: true },
  tiktok: { label: 'TikTok', short: 'TT', color: '#111', v: true },
  linkedin: { label: 'LinkedIn', short: 'in', color: '#0a66c2', v: false },
  x: { label: 'X', short: 'X', color: '#000', v: false },
};

const missing = new Set();
const t = (s, lang) => {
  if (lang === 'pt') return s;
  const v = dict[s]?.[LANGS[lang]];
  if (!v) missing.add(s);
  return v || s;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ícone pequeno (72px) para o PDF ficar leve; cai para o ícone grande se não existir
const iconFile = ['build/guide-icon.png', 'public/icon.png'].map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
const icon = 'data:image/png;base64,' + fs.readFileSync(iconFile).toString('base64');

function html(plat, lang) {
  const p = PLAT[plat];
  const hlp = KEY_HELP[plat];
  const T = (s) => esc(t(s, lang));
  const fmt = p.v ? `<span class="fmt v">9:16</span> ${T('Vertical 9:16')}` : `<span class="fmt h">16:9</span> ${T('Horizontal 16:9')}`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(p.label)} — ${T('Onde pegar a chave de transmissão')}</title>
<style>
  @page { size: A4; margin: 16mm 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; color: #1b1b24; margin: 0; font-size: 11.5pt; line-height: 1.45; }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #ece9f7; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 14pt; }
  .brand img { width: 30px; height: 30px; border-radius: 8px; }
  .tag { font-size: 9.5pt; color: #6b6880; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
  .hero { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; }
  .plat { width: 60px; height: 60px; border-radius: 16px; display: grid; place-items: center; color: ${p.fg || '#fff'}; background: ${p.color}; font-weight: 900; font-size: 20pt; flex: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1 { font-size: 21pt; margin: 0; line-height: 1.15; }
  .sub { color: #5b5870; margin-top: 4px; font-size: 11pt; display: flex; align-items: center; gap: 6px; }
  .fmt { display: inline-block; padding: 1px 8px; border-radius: 99px; font-size: 9.5pt; font-weight: 800; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .fmt::before { content: ''; display: inline-block; vertical-align: -1px; margin-right: 5px; border: 1.5px solid currentColor; border-radius: 2px; }
  .fmt.h::before { width: 11px; height: 7px; } .fmt.v::before { width: 7px; height: 11px; }
  .fmt.h { background: #e3f3ff; color: #0b6bb0; } .fmt.v { background: #ffe6f2; color: #b0186a; }
  h2 { font-size: 12pt; text-transform: uppercase; letter-spacing: .06em; color: #7b5cf0; margin: 16px 0 7px; }
  ol { margin: 0; padding: 0; list-style: none; counter-reset: s; }
  ol li { counter-increment: s; position: relative; padding: 7px 12px 7px 46px; margin-bottom: 6px; background: #f7f6fc; border-radius: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ol li::before { content: counter(s); position: absolute; left: 12px; top: 7px; width: 24px; height: 24px; border-radius: 50%; background: #7b5cf0; color: #fff; font-weight: 800; font-size: 10.5pt; display: grid; place-items: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .link { display: block; padding: 12px 14px; border: 2px solid #7b5cf0; border-radius: 12px; font-weight: 700; color: #4b2fd0; text-decoration: none; word-break: break-all; }
  .link small { display: block; color: #6b6880; font-weight: 600; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
  ul.notes { margin: 0; padding: 12px 14px 12px 32px; background: #fff8e6; border: 1px solid #f3dc9b; border-radius: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ul.notes li { margin: 3px 0; }
  .cd { padding: 12px 14px; background: #f1edff; border-radius: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #ece9f7; font-size: 9pt; color: #8a879b; display: flex; justify-content: space-between; gap: 12px; }
</style></head><body>
<header><div class="brand"><img src="${icon}" alt="">CastDeck</div><div class="tag">${T('Guia rápido')}</div></header>
<div class="hero"><div class="plat">${esc(p.short)}</div><div><h1>${esc(p.label)}: ${T('Onde pegar a chave de transmissão')}</h1><div class="sub">${T('Formato')}: ${fmt}</div></div></div>
<a class="link" href="${esc(hlp.link)}"><small>${T('Página da chave')} · ${T(hlp.linkLabel)}</small>${esc(hlp.link)}</a>
<h2>${T('Passo a passo')}</h2>
<ol>${hlp.steps.map((s) => `<li>${T(s)}</li>`).join('')}</ol>
<h2>${T('No CastDeck')}</h2>
<div class="cd">${T('Destinos RTMP → Novo destino → escolha a plataforma, confira o formato e cole a URL e a chave.')}</div>
<h2>${T('Importante')}</h2>
<ul class="notes">${[...hlp.notes, 'A chave de transmissão é como uma senha: quem tiver a chave consegue transmitir no seu canal.', 'As telas das plataformas mudam com frequência; os nomes dos menus podem variar um pouco.'].map((s) => `<li>${T(s)}</li>`).join('')}</ul>
<footer><span>CastDeck · cast.flue.live</span><span>© Miguel Kallemback / flue.live</span></footer>
</body></html>`;
}

const browsers = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browser = browsers.find((b) => fs.existsSync(b));
if (!browser) throw new Error('Edge/Chrome não encontrado (defina CHROME_PATH)');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-guides-'));
const outDir = path.join(root, 'public/guias');
const siteDir = path.join(root, 'landpage/guias');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(siteDir, { recursive: true });
const profile = path.join(tmp, 'profile');

for (const plat of Object.keys(PLAT)) {
  for (const lang of Object.keys(LANGS)) {
    const src = path.join(tmp, `${plat}-${lang}.html`);
    const out = path.join(outDir, `${plat}-${lang}.pdf`);
    fs.writeFileSync(src, html(plat, lang), 'utf8');
    execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--user-data-dir=${profile}`, `--print-to-pdf=${out}`, pathToFileURL(src).href], { stdio: 'ignore', timeout: 60000 });
    fs.copyFileSync(out, path.join(siteDir, `${plat}-${lang}.pdf`));
    console.log('ok', path.relative(root, out), Math.round(fs.statSync(out).size / 1024) + ' KB');
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (missing.size) console.warn('\nSem tradução:\n' + [...missing].join('\n'));
