// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Página pública de votação: o espectador escaneia o QR Code da enquete e vota pelo celular.
const studioId = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const card = document.getElementById('card');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// seletor de idioma no rodapé (a pergunta e as opções são do host e ficam como ele escreveu)
const foot = document.querySelector('.foot');
if (foot && window.CDi18n) foot.insertAdjacentHTML('beforeend', ' · ' + window.CDi18n.selectHTML({ short: true, id: 'vote-lang' }));
card.setAttribute('data-i18n-q', '');

// identificação anônima deste aparelho (um voto por enquete)
const voter = (() => {
  const k = 'castdeck-voter';
  let v = '';
  try {
    v = localStorage.getItem(k) || '';
  } catch {}
  if (!/^[\w-]{16,64}$/.test(v)) {
    v = (crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')).replace(/[^\w-]/g, '');
    try {
      localStorage.setItem(k, v);
    } catch {}
  }
  return v;
})();

let poll = null; // último estado recebido
let sig = ''; // estrutura renderizada (pergunta/opções/estado)
let sending = -1;
let note = null; // { cls, text }
let lastOk = Date.now();
let deadline = 0;

function setBrand(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) return;
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const root = document.documentElement.style;
  root.setProperty('--accent', hex);
  root.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  root.setProperty('--on-accent', lum > 0.62 ? '#111' : '#fff');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', hex);
}

const total = (p) => p.options.reduce((a, o) => a + (o.votes || 0), 0);
const fmt = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function empty(icon, title, text) {
  sig = 'empty:' + title;
  card.innerHTML = `<div class="empty"><div class="ico">${icon}</div><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
}

function render() {
  if (!poll) return empty('📊', 'Aguardando a enquete', 'Assim que uma enquete entrar no ar, ela aparece aqui automaticamente.');
  const p = poll;
  const voted = p.voted ?? null;
  const closed = p.state !== 'open';
  const showResults = closed || voted !== null;
  const s = [p.id, p.round, p.question, p.options.map((o) => o.text).join('|'), p.state, voted, showResults].join('§');
  if (s !== sig) {
    sig = s;
    card.innerHTML = `
      <div class="tagrow"><span class="tag ${closed ? 'done' : ''}">${closed ? 'RESULTADO' : 'ENQUETE'}</span><span class="timer" id="timer"></span></div>
      <h1>${esc(p.question)}</h1>
      <div class="opts" role="${closed || voted !== null ? 'list' : 'group'}" aria-label="Opções">
        ${p.options
          .map(
            (o, i) => `<button class="opt ${voted === i ? 'mine' : ''}" data-i="${i}" ${closed || voted !== null ? 'disabled' : ''} aria-label="Opção ${i + 1}: ${esc(o.text)}">
              <span class="fill"></span><span class="n">${i + 1}</span><span class="tx">${esc(o.text)}</span><span class="pct" ${showResults ? '' : 'hidden'}></span></button>`,
          )
          .join('')}
      </div>
      <p class="note" id="note"></p>`;
    card.querySelectorAll('.opt').forEach((b) => (b.onclick = () => vote(+b.dataset.i, b)));
  }
  // atualiza números e barras no lugar (anima)
  const t = total(p);
  const max = Math.max(...p.options.map((o) => o.votes || 0), 0);
  card.querySelectorAll('.opt').forEach((b, i) => {
    const v = p.options[i]?.votes || 0;
    const pct = t ? Math.round((v / t) * 100) : 0;
    b.classList.toggle('sending', sending === i);
    b.classList.toggle('win', closed && max > 0 && v === max);
    const fill = b.querySelector('.fill');
    fill.style.width = showResults ? pct + '%' : '0%';
    const pe = b.querySelector('.pct');
    if (showResults) pe.textContent = pct + '%';
  });
  const n = document.getElementById('note');
  const msg =
    note ||
    (closed
      ? { cls: '', text: `Votação encerrada · ${t} ${t === 1 ? 'voto' : 'votos'}` }
      : voted !== null
        ? { cls: 'ok', text: `✓ Voto registrado! Acompanhe o resultado ao vivo · ${t} ${t === 1 ? 'voto' : 'votos'}` }
        : { cls: '', text: 'Toque em uma opção para votar. Você pode votar uma vez.' });
  n.className = 'note ' + (msg.cls || '');
  n.textContent = msg.text;
  deadline = !closed && p.endsIn ? Date.now() + p.endsIn : 0;
  tickTimer();
}

function tickTimer() {
  const el = document.getElementById('timer');
  if (!el) return;
  if (!deadline) return (el.textContent = poll && poll.state === 'open' ? 'votação aberta' : '');
  const left = Math.max(0, deadline - Date.now());
  el.textContent = `encerra em ${fmt(left)}`;
  el.classList.toggle('low', left < 10000);
}
setInterval(tickTimer, 250);

async function vote(i, btn) {
  if (!poll || poll.state !== 'open' || poll.voted != null || sending >= 0) return;
  sending = i;
  note = { cls: '', text: 'Enviando seu voto…' };
  render();
  try {
    const r = await fetch(`/api/public/vote/${encodeURIComponent(studioId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pollId: poll.id, round: poll.round, opt: i, voter }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Não foi possível votar.');
    poll.voted = d.voted ?? i;
    if (d.ok) poll.options[i].votes = (poll.options[i].votes || 0) + 1;
    note = d.already ? { cls: 'ok', text: '✓ Você já tinha votado nesta enquete.' } : null;
    navigator.vibrate?.(30);
    sending = -1;
    render();
    card.querySelector(`.opt[data-i="${poll.voted}"]`)?.classList.add('just');
    setTimeout(() => ((note = null), render()), 2500);
    load();
  } catch (e) {
    sending = -1;
    note = { cls: 'err', text: e.message };
    render();
    setTimeout(() => ((note = null), load()), 2500);
  }
}

let loading = false;
async function load() {
  if (loading) return;
  loading = true;
  try {
    const r = await fetch(`/api/public/vote/${encodeURIComponent(studioId)}?voter=${encodeURIComponent(voter)}`, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 404) {
      poll = null;
      empty('🔍', 'Estúdio não encontrado', 'Confira se o QR Code ou o link estão certos.');
      return;
    }
    if (!r.ok) throw new Error(d.error || 'erro');
    lastOk = Date.now();
    if (d.studio?.name) {
      document.getElementById('studio-name').textContent = d.studio.name;
      document.title = `Votação — ${d.studio.name}`;
    }
    setBrand(d.studio?.color);
    const prev = poll;
    poll = d.poll;
    // voto local ainda não refletido no servidor? mantém
    if (poll && prev && prev.id === poll.id && prev.round === poll.round && poll.voted == null && prev.voted != null) poll.voted = prev.voted;
    if (sending < 0) render();
  } catch {
    if (Date.now() - lastOk > 15000) empty('📡', 'Sem conexão com a transmissão', 'Tentando reconectar…');
  } finally {
    loading = false;
  }
}

load();
setInterval(() => !document.hidden && load(), 2000);
document.addEventListener('visibilitychange', () => !document.hidden && load());
