// SPDX-License-Identifier: AGPL-3.0-only
import { $, createRoom, copy, qrSvg, esc } from './common.js?v=12';

const form = $('#create-form');
const err = $('#err');
const result = $('#result');
const btn = $('#create-btn');

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
    try { const u = new URL(room.guestUrl); $('#guest-link').textContent = u.host + u.pathname; } catch { $('#guest-link').textContent = room.guestUrl; }
    try { const u = new URL(room.hostUrl); $('#host-link').textContent = u.host + u.pathname; } catch { $('#host-link').textContent = room.hostUrl; }
    $('#open-host').href = room.hostUrl;
    $('#open-guest').href = room.guestUrl;
    $('#qr').innerHTML = qrSvg(room.guestUrl);
    $('#copy-guest').onclick = () => copy(room.guestUrl, $('#copy-guest'));
    $('#copy-host').onclick = () => copy(room.hostUrl, $('#copy-host'));
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
