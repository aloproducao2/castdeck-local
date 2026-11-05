// SPDX-License-Identifier: AGPL-3.0-only
import { $, createRoom, copy, qrSvg, esc } from './common.js?v=14';

const form = $('#create-form');
const err = $('#err');
const result = $('#result');
const btn = $('#create-btn');
const RECENT_KEY = 'castdeck.intercom.recent';

const readRecent = () => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list.filter((r) => r && r.roomId && r.hostUrl && r.guestUrl).slice(0, 8) : [];
  } catch { return []; }
};

const safeUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? value : '#';
  } catch { return '#'; }
};

function saveRecent(room) {
  try {
    const item = {
      roomId: room.roomId,
      name: room.name || room.roomId,
      hostUrl: room.hostUrl,
      guestUrl: room.guestUrl,
      createdAt: Date.now(),
    };
    const list = [item, ...readRecent().filter((r) => r.roomId !== item.roomId)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {}
}

function renderRecent() {
  const box = $('#recent');
  const wrap = $('#recent-list');
  if (!box || !wrap) return;
  const list = readRecent();
  box.hidden = !list.length;
  if (!list.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = list.map((room, i) => `<div class="recent-item">
    <div class="who"><b>${esc(room.name || room.roomId)}</b><small>${esc(room.roomId)}</small></div>
    <div class="actions">
      <a class="btn sm" href="${esc(safeUrl(room.hostUrl))}">Abrir diretor</a>
      <button class="btn sm" type="button" data-copy-recent="${i}">Copiar equipe</button>
      <button class="btn sm danger" type="button" data-forget-recent="${i}" title="Remover desta lista">×</button>
    </div>
  </div>`).join('');
  wrap.querySelectorAll('[data-copy-recent]').forEach((b) => {
    b.addEventListener('click', () => {
      const room = readRecent()[Number(b.dataset.copyRecent)];
      if (room) copy(room.guestUrl, b);
    });
  });
  wrap.querySelectorAll('[data-forget-recent]').forEach((b) => {
    b.addEventListener('click', () => {
      const list = readRecent();
      list.splice(Number(b.dataset.forgetRecent), 1);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch {}
      renderRecent();
    });
  });
}

const showError = (message) => {
  err.textContent = message;
  err.classList.remove('hidden');
};
const hideError = () => err.classList.add('hidden');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();
  const name = $('#room-name').value.trim();
  const roomId = $('#room-id').value.trim().toLowerCase();
  const password = $('#room-pass').value;
  const maxParticipants = Number($('#room-max').value) || 15;
  if (roomId && !/^[a-z0-9-]{4,24}$/.test(roomId)) return showError('Nome da sala inválido. Use 4–24 caracteres: a-z, 0-9 ou hífen.');
  btn.disabled = true;
  btn.textContent = 'Criando…';
  try {
    const room = await createRoom({ name, roomId, password, maxParticipants });
    result.classList.add('on');
    form.hidden = true;
    $('#room-code').textContent = room.roomId;
    $('#result-name').textContent = room.name;
    try { const u = new URL(room.guestUrl); $('#guest-link').textContent = u.host + u.pathname; } catch { $('#guest-link').textContent = room.guestUrl; }
    try { const u = new URL(room.hostUrl); $('#host-link').textContent = u.host + u.pathname; } catch { $('#host-link').textContent = room.hostUrl; }
    $('#open-host').href = room.hostUrl;
    $('#open-guest').href = room.guestUrl;
    $('#qr').innerHTML = qrSvg(room.guestUrl);
    $('#copy-guest').onclick = () => copy(room.guestUrl, $('#copy-guest'));
    $('#copy-host').onclick = () => copy(room.hostUrl, $('#copy-host'));
    saveRecent(room);
    renderRecent();
    result.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (ex) {
    showError(ex.message || 'Não foi possível criar a sala.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Criar sala grátis';
  }
});

$('#new-room').addEventListener('click', () => {
  form.reset();
  $('#room-max').value = '15';
  form.hidden = false;
  result.classList.remove('on');
  hideError();
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

renderRecent();
