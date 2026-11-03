// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Página pública de mensagens: o espectador escaneia o QR Code e manda um texto curto ou um áudio para a live.
// Mesmo esquema da votação (vote.js): consulta a caixa a cada poucos segundos e envia por POST.
const studioId = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const card = document.getElementById('card');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

const foot = document.querySelector('.foot');
if (foot && window.CDi18n) foot.insertAdjacentHTML('beforeend', ' · ' + window.CDi18n.selectHTML({ short: true, id: 'msg-lang' }));

const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k) || '';
    } catch {
      return '';
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};
// identificação anônima deste aparelho (limite de envios)
const sender = (() => {
  let v = store.get('castdeck-voter');
  if (!/^[\w-]{16,64}$/.test(v)) {
    v = (crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')).replace(/[^\w-]/g, '');
    store.set('castdeck-voter', v);
  }
  return v;
})();

let box = null;
let sig = '';
let lastOk = Date.now();
let waitUntil = 0; // fim do intervalo entre envios
let sentView = false;
const rec = { mr: null, stream: null, chunks: [], blob: null, url: '', dur: 0, t0: 0, timer: 0, ctx: null, an: null, raf: 0 };

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

function empty(icon, title, text) {
  sig = 'empty:' + title;
  card.innerHTML = `<div class="empty"><div class="ico">${icon}</div><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`;
}

const canRecord = () => !!(window.MediaRecorder && navigator.mediaDevices?.getUserMedia && window.isSecureContext);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function render() {
  if (!box) return empty('💬', 'Aguardando a transmissão', 'Assim que o apresentador abrir o recebimento de mensagens, o formulário aparece aqui.');
  if (!box.open) return empty('⏸️', 'Recebimento pausado', 'O apresentador pausou as mensagens por enquanto. Esta página volta sozinha quando reabrir.');
  if (sentView) return renderSent();
  const audioOk = box.audio && canRecord();
  const s = ['form', box.session, box.title, audioOk].join('§');
  if (s === sig) return;
  sig = s;
  card.innerHTML = `
    <div class="tagrow"><span class="tag">MENSAGEM</span><span class="timer">${audioOk ? 'texto ou áudio' : 'texto'}</span></div>
    <h1>${esc(box.title)}</h1>
    <form class="mform" id="mf" autocomplete="off">
      <label class="lbl" for="m-name">Seu nome (opcional)</label>
      <input id="m-name" maxlength="30" placeholder="Como quer aparecer na tela" value="${esc(store.get('castdeck-msg-name'))}" enterkeyhint="next">
      <label class="lbl" for="m-text">Mensagem</label>
      <textarea id="m-text" maxlength="${box.maxText || 200}" placeholder="Escreva aqui…" rows="3"></textarea>
      <span class="count" id="m-count">0/${box.maxText || 200}</span>
      ${audioOk ? `<div class="or">OU GRAVE UM ÁUDIO</div><div class="rec" id="m-rec"></div>` : box.audio && !window.isSecureContext ? '<p class="note">Para gravar áudio, abra este link pelo endereço seguro (https).</p>' : ''}
      <button class="send" id="m-send" type="submit" disabled>Enviar mensagem</button>
      <p class="note" id="note">Sua mensagem vai para o apresentador, que escolhe quais aparecem na live.</p>
    </form>`;
  const text = card.querySelector('#m-text');
  const name = card.querySelector('#m-name');
  text.oninput = check;
  name.oninput = () => store.set('castdeck-msg-name', name.value.trim());
  card.querySelector('#mf').onsubmit = (e) => {
    e.preventDefault();
    send();
  };
  if (audioOk) paintRec();
  check();
}

function check() {
  const text = card.querySelector('#m-text');
  const btn = card.querySelector('#m-send');
  if (!text || !btn) return;
  const max = box?.maxText || 200;
  const c = card.querySelector('#m-count');
  c.textContent = `${text.value.length}/${max}`;
  c.classList.toggle('low', text.value.length > max - 20);
  const left = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));
  btn.disabled = !!rec.mr || left > 0 || (!text.value.trim() && !rec.blob);
  btn.textContent = left > 0 ? `Aguarde ${left} s` : rec.blob && !text.value.trim() ? 'Enviar áudio' : 'Enviar mensagem';
}
setInterval(check, 500);

function paintRec() {
  const el = card.querySelector('#m-rec');
  if (!el) return;
  el.classList.toggle('on', !!rec.mr);
  if (rec.mr) {
    el.innerHTML = `<button type="button" class="rbtn" id="r-btn" aria-label="Parar gravação">${STOP}</button>
      <div class="rtx">Gravando… <small>toque para parar (máx. ${box.maxSec || 30} s)</small></div>
      <div class="bars" id="r-bars">${'<i></i>'.repeat(7)}</div><span class="rtime" id="r-time">0:00</span>`;
  } else if (rec.blob) {
    el.innerHTML = `<div class="rprev"><audio controls src="${rec.url}"></audio><small class="hint" style="color:var(--muted);font-size:12px">Áudio de ${fmt(rec.dur)} pronto para enviar</small></div>
      <button type="button" class="rdel" id="r-del">Apagar</button>`;
  } else {
    el.innerHTML = `<button type="button" class="rbtn" id="r-btn" aria-label="Gravar áudio">${MIC}</button>
      <div class="rtx">Gravar um áudio <small>até ${box.maxSec || 30} segundos</small></div>`;
  }
  const b = el.querySelector('#r-btn');
  if (b) b.onclick = () => (rec.mr ? stopRec() : startRec());
  const d = el.querySelector('#r-del');
  if (d) d.onclick = () => (clearRec(), paintRec(), check());
}

function pickMime() {
  for (const t of ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']) if (MediaRecorder.isTypeSupported?.(t)) return t;
  return '';
}

async function startRec() {
  clearRec();
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    return note('err', 'Não foi possível usar o microfone. Libere a permissão no navegador.');
  }
  const mime = pickMime();
  try {
    rec.mr = new MediaRecorder(rec.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
  } catch {
    rec.mr = new MediaRecorder(rec.stream);
  }
  rec.chunks = [];
  rec.mr.ondataavailable = (e) => e.data?.size && rec.chunks.push(e.data);
  rec.mr.onstop = () => {
    rec.dur = Math.min(box?.maxSec || 30, (performance.now() - rec.t0) / 1000);
    rec.blob = rec.dur >= 0.6 && rec.chunks.length ? new Blob(rec.chunks, { type: rec.mr.mimeType || mime || 'audio/webm' }) : null;
    rec.url = rec.blob ? URL.createObjectURL(rec.blob) : '';
    rec.stream?.getTracks().forEach((t) => t.stop());
    rec.stream = null;
    rec.mr = null;
    clearInterval(rec.timer);
    cancelAnimationFrame(rec.raf);
    rec.ctx?.close().catch(() => {});
    rec.ctx = null;
    paintRec();
    check();
  };
  rec.t0 = performance.now();
  rec.mr.start(250);
  // medidor simples para a pessoa ver que o microfone está captando
  try {
    rec.ctx = new AudioContext();
    rec.an = rec.ctx.createAnalyser();
    rec.an.fftSize = 64;
    rec.ctx.createMediaStreamSource(rec.stream).connect(rec.an);
    const buf = new Uint8Array(rec.an.frequencyBinCount);
    const loop = () => {
      rec.an.getByteFrequencyData(buf);
      card.querySelectorAll('#r-bars i').forEach((b, i) => (b.style.height = `${20 + (buf[i + 2] / 255) * 80}%`));
      rec.raf = requestAnimationFrame(loop);
    };
    loop();
  } catch {}
  rec.timer = setInterval(() => {
    const s = (performance.now() - rec.t0) / 1000;
    const t = card.querySelector('#r-time');
    if (t) t.textContent = fmt(s);
    if (s >= (box?.maxSec || 30)) stopRec();
  }, 200);
  navigator.vibrate?.(20);
  paintRec();
  check();
}
function stopRec() {
  if (rec.mr?.state === 'recording') rec.mr.stop();
}
function clearRec() {
  if (rec.url) URL.revokeObjectURL(rec.url);
  rec.blob = null;
  rec.url = '';
  rec.dur = 0;
}

const toDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Falha ao ler o áudio.'));
    r.readAsDataURL(blob);
  });

function note(cls, text) {
  const n = card.querySelector('#note');
  if (!n) return;
  n.className = 'note ' + (cls || '');
  n.textContent = text;
}

async function send() {
  const text = card.querySelector('#m-text')?.value.trim() || '';
  const name = card.querySelector('#m-name')?.value.trim() || '';
  if (!text && !rec.blob) return;
  const btn = card.querySelector('#m-send');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    let audio = null;
    if (rec.blob) {
      audio = await toDataUrl(rec.blob);
      // alguns navegadores omitem o tipo no data URL: corrige para o servidor reconhecer
      if (/^data:;base64,|^data:application\/octet-stream/.test(audio)) audio = audio.replace(/^data:[^,]*,/, 'data:audio/webm;base64,');
    }
    const r = await fetch(`/api/public/msg/${encodeURIComponent(studioId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: box.session, sender, name, text, audio, dur: Math.round(rec.dur * 10) / 10 }),
    });
    const d = await r.json().catch(() => ({}));
    if (d.wait) waitUntil = Date.now() + d.wait;
    if (!r.ok) throw new Error(d.error || 'Não foi possível enviar.');
    clearRec();
    navigator.vibrate?.(30);
    sentView = true;
    sig = '';
    render();
  } catch (e) {
    check();
    note('err', e.message);
  }
}

function renderSent() {
  if (sig === 'sent') return;
  sig = 'sent';
  card.innerHTML = `<div class="sent"><div class="ico">✅</div><h2>Mensagem enviada!</h2><p>O apresentador recebeu e pode mostrar na live a qualquer momento.</p>
    <button class="send" id="m-again" type="button">Mandar outra</button></div>`;
  card.querySelector('#m-again').onclick = () => {
    sentView = false;
    sig = '';
    render();
  };
}

let loading = false;
async function load() {
  if (loading || rec.mr) return; // não redesenha no meio de uma gravação
  loading = true;
  try {
    const r = await fetch(`/api/public/msg/${encodeURIComponent(studioId)}`, { cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 404) {
      box = null;
      empty('🔍', 'Estúdio não encontrado', 'Confira se o QR Code ou o link estão certos.');
      return;
    }
    if (!r.ok) throw new Error(d.error || 'erro');
    lastOk = Date.now();
    if (d.studio?.name) {
      document.getElementById('studio-name').textContent = d.studio.name;
      document.title = `Mensagens — ${d.studio.name}`;
    }
    setBrand(d.studio?.color);
    box = d.box;
    render();
  } catch {
    if (Date.now() - lastOk > 15000) empty('📡', 'Sem conexão com a transmissão', 'Tentando reconectar…');
  } finally {
    loading = false;
  }
}

load();
setInterval(() => !document.hidden && load(), 2500);
document.addEventListener('visibilitychange', () => !document.hidden && load());
