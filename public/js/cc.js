// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Página pública da legenda ao vivo (/cc/<estúdio>?k=<chave>): só texto, sem áudio/vídeo/controle.
//  - modo Leitura (padrão): histórico rolável, letra ajustável, tema claro/escuro, escolha de idioma
//  - modo Overlay (&view=overlay&bg=transparent): 1–2 linhas sobre fundo transparente, para OBS/vMix
// Recebe o texto por Server-Sent Events (/api/cc/<estúdio>/stream), que atravessa o túnel e reconecta sozinho.
const studioId = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
const q = new URLSearchParams(location.search);
const key = q.get('k') || '';
const overlay = q.get('view') === 'overlay';
if (overlay) {
  document.body.classList.add('overlay');
  // fonte de navegador do OBS/vMix: fundo realmente transparente (o html também tem cor de fundo)
  document.documentElement.style.background = 'transparent';
}
if (q.get('pos') === 'top') document.body.classList.add('top');
if (q.get('upper') === '1') document.body.classList.add('upper');
const $ = (s) => document.querySelector(s);
const feed = $('#feed');
const LANG_NAMES = { pt: 'Português', en: 'English', es: 'Español', auto: 'Original' };
const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem('cd.cc') || '{}');
  } catch {
    return {};
  }
})();
const save = () => {
  try {
    localStorage.setItem('cd.cc', JSON.stringify(prefs));
  } catch {}
};
let fs = prefs.fs || 26;
let lang = q.get('lang') || prefs.lang || null; // null = idioma principal do estúdio
let langs = [];
let lines = []; // { id, text, lang }
let partial = null;
let ovTimer = null;
let style = { posH: { y: 'b', x: 'c' }, size: 'm', color: '#ffffff', bgColor: '#000000', bg: 0.72, lines: 2, upper: false, appear: 'word', delay: 0.6, wordMs: 170 };
let ovReveal = null;
let ovText = '';
let ovPartial = '';
let ovWho = '';

document.documentElement.style.setProperty('--fs', fs + 'px');
if (prefs.light) document.body.classList.add('light');
$('#plus').onclick = () => setFs(fs + 3);
$('#minus').onclick = () => setFs(fs - 3);
$('#theme').onclick = () => {
  prefs.light = document.body.classList.toggle('light');
  save();
};
function setFs(v) {
  fs = Math.max(16, Math.min(64, v));
  prefs.fs = fs;
  save();
  document.documentElement.style.setProperty('--fs', fs + 'px');
}
$('#lang').onchange = (e) => {
  lang = e.target.value;
  prefs.lang = lang;
  save();
  paint();
};

const primary = () => langs[0] || 'pt';
const want = () => (lang && langs.includes(lang) ? lang : primary());

async function loadInfo() {
  try {
    const r = await fetch(`/api/cc/${encodeURIComponent(studioId)}/info?k=${encodeURIComponent(key)}`);
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || r.status);
    $('#title').textContent = j.name ? `${j.name} · legenda` : 'Legenda ao vivo';
    document.title = `${j.name || 'Legenda'} — legenda ao vivo`;
    langs = j.langs || [];
    if (j.style) style = { ...style, ...j.style, posH: j.style.posH || style.posH };
    applyStyle();
    const sel = $('#lang');
    sel.innerHTML = langs.map((l) => `<option value="${l}">${LANG_NAMES[l] || l.toUpperCase()}</option>`).join('');
    sel.hidden = langs.length < 2;
    sel.value = want();
  } catch (e) {
    empty(String(e.message || e));
  }
}

function applyStyle() {
  const s = style || {};
  const qUpper = q.get('upper') === '1';
  const qPos = q.get('pos');
  document.body.classList.toggle('upper', qUpper || !!s.upper);
  if (!overlay) return;
  const y = qPos === 'top' ? 't' : s.posH?.y || 'b';
  const x = s.posH?.x || 'c';
  document.body.classList.toggle('top', y === 't');
  document.body.classList.toggle('mid', y === 'm');
  document.body.classList.toggle('left', x === 'l');
  document.body.classList.toggle('right', x === 'r');
  const fsMap = { s: '4.6vh', m: '5.2vh', l: '6.6vh' };
  const root = document.documentElement.style;
  root.setProperty('--cc-fs', fsMap[s.size] || fsMap.m);
  root.setProperty('--cc-color', s.color || '#ffffff');
  const m = /^#?([0-9a-f]{6})$/i.exec(s.bgColor || '');
  const hex = m ? m[1] : '000000';
  const a = typeof s.bg === 'number' ? Math.max(0, Math.min(1, s.bg)) : 0.72;
  root.setProperty('--cc-bg', `rgba(${parseInt(hex.slice(0, 2), 16)},${parseInt(hex.slice(2, 4), 16)},${parseInt(hex.slice(4, 6), 16)},${a})`);
}

function empty(msg) {
  feed.innerHTML = `<div class="empty">${esc(msg)}</div>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function paint() {
  const L = want();
  const mine = lines.filter((l) => (l.lang || primary()) === L);
  if (overlay) {
    const raw = partial && style.appear === 'live' && L === primary() ? partial.text : '';
    const txt = ovPartial || raw || ovText;
    const who = (partial && L === primary() ? partial.speaker?.name : '') || ovWho || '';
    $('#ov-text').textContent = txt && who ? `${who}: ${txt}` : txt;
    $('#ov').classList.toggle('hide', !txt);
    clearTimeout(ovTimer);
    ovTimer = setTimeout(() => $('#ov').classList.add('hide'), 6000);
    return;
  }
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  if (!mine.length && !partial) {
    empty('Aguardando a fala… A legenda aparece aqui assim que alguém falar.');
    return;
  }
  const show = mine.slice(-80);
  const whoHtml = (w) => (w ? `<span class="cc-who">${esc(w)}:</span> ` : '');
  feed.innerHTML =
    show.map((l, i) => `<p class="line ${i < show.length - 3 ? 'old' : ''}">${whoHtml(l.who)}${esc(l.text)}</p>`).join('') +
    (partial && L === primary() ? `<p class="line partial">${whoHtml(partial.speaker?.name)}${esc(partial.text)}</p>` : '');
  if (atBottom) feed.scrollTop = feed.scrollHeight;
}

function startOvReveal(text, who = '') {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return;
  ovText = '';
  ovPartial = '';
  ovWho = who || '';
  ovReveal = {
    words,
    shown: 0,
    t: performance.now(),
    delay: Math.max(0, Number(style.delay) || 0) * 1000,
    wordMs: style.appear === 'word' ? Math.max(60, Number(style.wordMs) || 170) : 10,
    text,
    who,
  };
  paint();
}

function ovTick() {
  if (!overlay || !ovReveal) return;
  const now = performance.now();
  const dt = now - ovReveal.t;
  if (dt < ovReveal.delay) return;
  const n = Math.min(ovReveal.words.length, 1 + Math.floor((dt - ovReveal.delay) / ovReveal.wordMs));
  if (n !== ovReveal.shown) {
    ovReveal.shown = n;
    ovPartial = ovReveal.words.slice(0, n).join(' ');
    paint();
  }
  if (n >= ovReveal.words.length) {
    ovText = ovReveal.text;
    ovPartial = '';
    ovReveal = null;
    paint();
  }
}

setInterval(ovTick, 120);

function connect() {
  const es = new EventSource(`/api/cc/${encodeURIComponent(studioId)}/stream?k=${encodeURIComponent(key)}`);
  es.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.type === 'hello') {
      $('#dot').classList.toggle('live', !!m.live);
      lines = (m.history || []).map((h) => ({ id: h.id, text: h.text, lang: h.lang, who: h.speaker?.name }));
      partial = m.partial || null;
      if (!m.live) empty('A legenda deste estúdio está desligada no momento.');
      else paint();
      loadInfo();
    } else if (m.type === 'partial') {
      if (overlay) {
        if (style.appear === 'live') partial = m;
        paint();
      } else {
        partial = m;
        $('#dot').classList.add('live');
        paint();
      }
    } else if (m.type === 'final') {
      if ((m.lang || primary()) === primary()) partial = null;
      if (overlay) {
        if (m.lang && !langs.includes(m.lang)) loadInfo();
        if (style.appear === 'word' || style.appear === 'line') startOvReveal(m.text, m.speaker?.name);
        else {
          ovText = m.text || '';
          ovPartial = '';
          ovWho = m.speaker?.name || '';
          paint();
        }
        return;
      }
      if (m.text) lines.push({ id: m.id, text: m.text, lang: m.lang, who: m.speaker?.name });
      if (lines.length > 400) lines.splice(0, lines.length - 400);
      $('#dot').classList.add('live');
      if (m.lang && !langs.includes(m.lang)) loadInfo();
      paint();
    } else if (m.type === 'clear') {
      partial = null;
      ovText = '';
      ovPartial = '';
      ovWho = '';
      ovReveal = null;
      $('#dot').classList.remove('live');
      if (overlay) paint();
      else empty('A legenda deste estúdio foi desligada.');
    } else if (m.type === 'revoked') {
      es.close();
      empty('Este link foi trocado pelo estúdio. Peça o link novo.');
    }
  };
  es.onerror = () => {
    $('#dot').classList.remove('live');
    // o EventSource reconecta sozinho; se o link foi recusado (403), a reconexão falha e mostramos o motivo
    if (es.readyState === EventSource.CLOSED) {
      fetch(`/api/cc/${encodeURIComponent(studioId)}/info?k=${encodeURIComponent(key)}`)
        .then((r) => r.json().then((j) => (!r.ok ? empty(j.error || 'Link inválido.') : setTimeout(connect, 3000))))
        .catch(() => setTimeout(connect, 5000));
    }
  };
}

loadInfo().then(connect);
