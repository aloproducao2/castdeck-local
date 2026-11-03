// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
/* CastDeck – tradução da interface (Português do Brasil, English, Español).
 *
 * O texto-fonte é o português escrito no próprio código; este módulo troca o que aparece na tela
 * usando o dicionário i18n/strings.json ({ "texto pt": ["english", "español"] }).
 * Funciona por observação do DOM, então qualquer tela, modal ou aviso criado depois também é traduzido,
 * e a troca de idioma acontece na hora, sem recarregar (importante: o estúdio pode estar ao vivo).
 *
 * Chaves com {0}, {1}… são modelos: "{0} convidado{1} no estúdio" casa com "3 convidados no estúdio".
 * Chaves terminadas em ":" também valem como prefixo ("Falha ao abrir a câmera: NotAllowedError").
 * Elementos com translate="no", .notranslate ou data-i18n-skip ficam como estão.
 *
 * Mesmo arquivo usado no app (public/js) e na landing page (landpage/js). Carregar como <script> clássico no <head>.
 */
(function () {
  'use strict';
  if (window.CDi18n) return;

  const LANGS = { pt: 'Português (BR)', en: 'English', es: 'Español' };
  const LOCALES = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };
  const IDX = { en: 0, es: 1 };
  const KEY = 'castdeck.lang';
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'data-tip', 'data-label'];
  const META = 'meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[name="twitter:title"],meta[name="twitter:description"]';
  const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, NOSCRIPT: 1, KBD: 1 };

  const me = document.currentScript;
  const dictUrl = window.CD_I18N_URL || (me && me.src ? new URL('i18n/strings.json', me.src).href : '/js/i18n/strings.json');
  const ver = me && me.src ? (new URL(me.src).searchParams.get('v') || '') : '';

  const valid = (l) => (l && LANGS[l] ? l : null);
  function detect() {
    // robôs de busca/IA sem ?lang= ficam com o original em português (as versões en/es têm URL própria via hreflang)
    if (/bot|crawl|spider|slurp|google|bing|yandex|duckduck|gpt|claude|anthropic|perplexity|facebookexternalhit/i.test(navigator.userAgent || '')) return 'pt';
    const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'pt-BR'];
    for (const raw of list) {
      const l = String(raw).toLowerCase();
      if (l.startsWith('pt')) return 'pt';
      if (l.startsWith('es')) return 'es';
      if (l.startsWith('en')) return 'en';
    }
    return 'en'; // outros idiomas: inglês é o mais útil
  }
  let fromUrl = null;
  try { fromUrl = valid(new URLSearchParams(location.search).get('lang')); } catch (e) { /* sem URL */ }
  let stored = null;
  try { stored = valid(localStorage.getItem(KEY)); } catch (e) { /* storage bloqueado */ }
  let lang = fromUrl || stored || detect();
  if (fromUrl) try { localStorage.setItem(KEY, fromUrl); } catch (e) { /* ok */ }

  // ---------- dicionário ----------
  let exact = null; // Map pt -> tradução
  let patterns = []; // [{re, out}]
  let cache = new Map();
  let raw = null;
  let loading = null;

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const norm = (s) => s.replace(/\s+/g, ' ').trim();

  function build() {
    exact = new Map();
    patterns = [];
    cache = new Map();
    if (lang === 'pt' || !raw) return;
    const i = IDX[lang];
    for (const k in raw) {
      const v = raw[k] && raw[k][i];
      if (!v) continue;
      const key = norm(k);
      if (/\{\d\}/.test(key)) {
        const lit = key.replace(/\{\d\}/g, '');
        if ((lit.match(/[A-Za-zÀ-ú]/g) || []).length < 3) continue;
        const re = new RegExp('^' + esc(key).replace(/\\\{(\d)\\\}/g, '(?<g$1>[\\s\\S]*?)') + '$');
        patterns.push({ re, out: v, w: lit.length });
      } else {
        exact.set(key, v);
        if (/[:：]$/.test(key) && key.length > 4) patterns.push({ re: new RegExp('^' + esc(key) + '(?<rest>\\s[\\s\\S]*)$'), out: v + '{rest}', w: key.length - 1 });
      }
    }
    patterns.sort((a, b) => b.w - a.w);
  }

  function lookup(s, depth) {
    let r = exact.get(s);
    if (r !== undefined) return r;
    if (depth > 2) return null;
    // símbolos/ícones no começo (▶, ✕, 🎬…) e pontuação no fim
    let m = s.match(/^([^\p{L}\p{N}"“'(¿¡{]+)([\s\S]+)$/u);
    if (m) { r = lookup(m[2], depth + 1); if (r != null) return m[1] + r; }
    m = s.match(/^([\s\S]+?)([\s.:;,…!?)\]]+)$/);
    if (m) { r = exact.get(m[1]); if (r !== undefined) return r + m[2]; }
    for (const p of patterns) {
      const g = p.re.exec(s);
      if (!g) continue;
      const gr = g.groups || {};
      return p.out.replace(/\{(\d|rest)\}/g, (x, n) => {
        const val = n === 'rest' ? gr.rest : gr['g' + n];
        if (val == null) return '';
        const t = n === 'rest' ? null : translateCore(val, depth + 1);
        return t != null ? t : val;
      });
    }
    return null;
  }

  function translateCore(s, depth) {
    const n = norm(s);
    if (!n || !/[A-Za-zÀ-ú]/.test(n)) return null;
    return lookup(n, depth || 0);
  }

  function tr(s) {
    if (lang === 'pt' || !exact || s == null) return s;
    const str = String(s);
    if (cache.has(str)) return cache.get(str);
    const m = str.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const t = translateCore(m[2], 0);
    const out = t == null ? str : m[1] + t + m[3];
    if (cache.size > 6000) cache.clear();
    cache.set(str, out);
    return out;
  }

  // ---------- DOM ----------
  const textRec = new WeakMap(); // Text -> {src, out}
  const attrRec = new WeakMap(); // Element -> {attr: {src, out}}

  function skipEl(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentNode) {
      if (SKIP_TAGS[e.tagName] || e.isContentEditable) return true;
      if (e.getAttribute('translate') === 'no' || e.hasAttribute('data-i18n-skip') || (e.classList && e.classList.contains('notranslate'))) return true;
    }
    return false;
  }

  function doText(node) {
    const rec = textRec.get(node);
    const cur = node.data;
    const src = rec && cur === rec.out ? rec.src : cur;
    if (!/[A-Za-zÀ-ú]/.test(src)) return;
    const out = tr(src);
    if (out !== cur) node.data = out;
    if (out !== src || rec) textRec.set(node, { src, out });
  }

  function doAttrs(el) {
    let recs = attrRec.get(el);
    for (const a of ATTRS) {
      const cur = el.getAttribute(a);
      if (cur == null) continue;
      const rec = recs && recs[a];
      const src = rec && cur === rec.out ? rec.src : cur;
      const out = tr(src);
      if (out !== cur) el.setAttribute(a, out);
      if (out !== src || rec) { recs = recs || {}; recs[a] = { src, out }; attrRec.set(el, recs); }
    }
    if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type)) {
      const cur = el.value;
      const rec = recs && recs.value;
      const src = rec && cur === rec.out ? rec.src : cur;
      const out = tr(src);
      if (out !== cur) el.value = out;
      if (out !== src || rec) { recs = recs || {}; recs.value = { src, out }; attrRec.set(el, recs); }
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skipEl(root.parentNode)) doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (skipEl(root)) return; doAttrs(root); }
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1) {
          if (SKIP_TAGS[n.tagName] || n.isContentEditable || n.getAttribute('translate') === 'no' || n.hasAttribute('data-i18n-skip') || n.classList.contains('notranslate')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) doText(n);
      else doAttrs(n);
    }
  }

  function doMeta() {
    document.querySelectorAll(META).forEach((m) => {
      const rec = attrRec.get(m) || {};
      const cur = m.getAttribute('content') || '';
      const src = rec.content && cur === rec.content.out ? rec.content.src : cur;
      const out = tr(src);
      if (out !== cur) m.setAttribute('content', out);
      rec.content = { src, out };
      attrRec.set(m, rec);
    });
    const t = document.querySelector('title');
    if (t) walk(t);
  }

  let busy = false;
  const mo = new MutationObserver((list) => {
    if (busy || lang === 'pt' || !exact) return;
    busy = true;
    try {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') { if (!skipEl(m.target.parentNode)) doText(m.target); }
        else if (m.type === 'attributes' && !skipEl(m.target)) doAttrs(m.target);
      }
    } finally { mo.takeRecords(); busy = false; }
  });

  function applyAll() {
    busy = true;
    try { walk(document.documentElement); doMeta(); } finally { mo.takeRecords(); busy = false; }
  }

  // ---------- carregamento ----------
  const root = document.documentElement;
  function setHtmlLang() { root.lang = LOCALES[lang]; window.CD_LANG = lang; window.CD_LOCALE = LOCALES[lang]; }
  setHtmlLang();
  // site: a versão ?lang=en/es é canônica de si mesma (combina com os <link hreflang>)
  if (fromUrl && fromUrl !== 'pt') {
    const c = document.querySelector('link[rel="canonical"]');
    if (c) try { const u = new URL(c.href); u.searchParams.set('lang', fromUrl); c.href = u.href; } catch (e) { /* ok */ }
  }

  let waitStyle = null;
  function hideUntilReady() {
    if (waitStyle) return;
    waitStyle = document.createElement('style');
    waitStyle.textContent = 'body{visibility:hidden!important}';
    (document.head || root).appendChild(waitStyle);
    setTimeout(showPage, 2500); // nunca deixa a tela em branco
  }
  function showPage() { if (waitStyle) { waitStyle.remove(); waitStyle = null; } }

  function load() {
    if (raw) return Promise.resolve(raw);
    if (!loading) {
      loading = fetch(dictUrl + (ver ? '?v=' + ver : ''), { cache: ver ? 'force-cache' : 'no-cache' })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}))
        .then((j) => (raw = j));
    }
    return loading;
  }

  const listeners = [];
  function start() {
    if (lang === 'pt') return;
    hideUntilReady();
    load().then(() => {
      build();
      const go = () => { applyAll(); showPage(); };
      if (document.body) go(); else document.addEventListener('DOMContentLoaded', go, { once: true });
    });
  }

  function set(l, opts) {
    l = valid(l);
    if (!l) return Promise.resolve();
    try { localStorage.setItem(KEY, l); } catch (e) { /* ok */ }
    const prev = lang;
    lang = l;
    setHtmlLang();
    syncSelectors();
    const done = () => {
      build();
      if (l === 'pt') { restoreAll(); } else applyAll();
      if (prev !== l) listeners.forEach((f) => { try { f(l); } catch (e) { /* ok */ } });
      if (!(opts && opts.silent) && typeof window.CD_I18N_ONSET === 'function') window.CD_I18N_ONSET(l);
    };
    return l === 'pt' ? Promise.resolve(done()) : load().then(done);
  }

  // volta tudo para o texto original (português)
  function restoreAll() {
    busy = true;
    try {
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let n = root;
      do {
        if (n.nodeType === 3) {
          const r = textRec.get(n);
          if (r && n.data === r.out) n.data = r.src;
          textRec.delete(n);
        } else {
          const recs = attrRec.get(n);
          if (recs) {
            for (const a in recs) {
              if (a === 'value') { if (n.value === recs[a].out) n.value = recs[a].src; }
              else if (n.getAttribute(a) === recs[a].out) n.setAttribute(a, recs[a].src);
            }
            attrRec.delete(n);
          }
        }
      } while ((n = tw.nextNode()));
    } finally { mo.takeRecords(); busy = false; }
  }

  // ---------- diálogos nativos ----------
  const _alert = window.alert.bind(window);
  const _confirm = window.confirm.bind(window);
  const _prompt = window.prompt.bind(window);
  window.alert = (m) => _alert(tr(m));
  window.confirm = (m) => _confirm(tr(m));
  window.prompt = (m, d) => _prompt(tr(m), d);

  // ---------- seletor de idioma ----------
  function selectHTML(opts) {
    const o = opts || {};
    const cls = o.className || '';
    const id = o.id ? ` id="${o.id}"` : '';
    return `<select class="cd-lang ${cls}"${id} data-cd-lang translate="no" aria-label="Idioma / Language / Idioma" title="Idioma · Language · Idioma">${Object.keys(LANGS)
      .map((k) => `<option value="${k}"${k === lang ? ' selected' : ''}>${o.short ? (k === 'pt' ? '🇧🇷 PT' : k === 'en' ? '🇺🇸 EN' : '🇪🇸 ES') : LANGS[k]}</option>`)
      .join('')}</select>`;
  }
  function syncSelectors() { document.querySelectorAll('select[data-cd-lang]').forEach((s) => { if (s.value !== lang) s.value = lang; }); }
  document.addEventListener('change', (e) => {
    const s = e.target;
    if (s && s.matches && s.matches('select[data-cd-lang]')) set(s.value);
  });

  window.CDi18n = {
    get lang() { return lang; },
    get locale() { return LOCALES[lang]; },
    langs: LANGS,
    t: tr,
    set,
    selectHTML,
    onChange(f) { listeners.push(f); },
    explicit: !!(fromUrl || stored),
    apply: applyAll,
  };

  mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS.concat(['value']) });
  start();
})();
