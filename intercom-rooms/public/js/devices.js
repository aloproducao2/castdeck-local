// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Seleção de microfone e saída de áudio do CastDeck Intercom.

import { keepScreenAwake, screenLockOn } from './common.js?v=14';

const MIC_KEY = 'castdeck.intercom.mic';
const OUT_KEY = 'castdeck.intercom.out';

const $ = (sel, root = document) => root.querySelector(sel);

function remember(key, value) {
  try { localStorage.setItem(key, value || ''); } catch {}
}

export function savedMicId() {
  try { return localStorage.getItem(MIC_KEY) || ''; } catch { return ''; }
}

export function savedOutputId() {
  try { return localStorage.getItem(OUT_KEY) || ''; } catch { return ''; }
}

export async function getMicStream() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não libera o microfone.');
  const audio = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  };
  const id = savedMicId();
  if (id) audio.deviceId = { exact: id };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video: false });
  } catch (err) {
    // Dispositivo salvo pode ter sido desconectado; volta ao padrão sem travar a entrada.
    if (id && err?.name !== 'NotAllowedError') {
      delete audio.deviceId;
      return navigator.mediaDevices.getUserMedia({ audio, video: false });
    }
    throw err;
  }
}

export function canSelectOutput() {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

export async function applySink(audio, deviceId) {
  if (!audio || !canSelectOutput()) return false;
  try {
    await audio.setSinkId(deviceId || '');
    return true;
  } catch {
    return false;
  }
}

function fill(select, items, saved, fallbackLabel) {
  if (!select) return;
  const current = saved ?? select.value;
  select.innerHTML = '';
  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = fallbackLabel;
  select.append(auto);
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.deviceId;
    opt.textContent = item.label || `Dispositivo ${select.options.length}`;
    select.append(opt);
  }
  if ([...select.options].some((o) => o.value === current)) select.value = current;
}

/**
 * Liga o diálogo de áudio e devolve funções para o host/convidado aplicarem
 * a saída escolhida em cada elemento de áudio novo.
 */
export function initDevices({ getAudios = () => [], onMic = null, onOutput = null } = {}) {
  const dialog = $('#devices');
  const micSel = $('#mic-device');
  const outSel = $('#out-device');
  const note = $('#devices-note');
  const screen = $('#screen-lock');
  const screenNote = $('#screen-note');
  const refreshBtn = $('#devices-refresh');
  let applying = false;

  const setNote = (text) => { if (note) note.textContent = text; };
  const paintScreen = () => {
    if (!screen) return;
    screen.checked = screenLockOn();
    if (screenNote) screenNote.textContent = screen.checked
      ? 'A tela fica ligada enquanto a sala estiver aberta.'
      : 'A tela pode apagar. No Android, instalar o app ajuda o áudio a continuar.';
  };
  paintScreen();
  screen?.addEventListener('change', () => {
    keepScreenAwake(screen.checked).then(paintScreen);
  });

  async function applyOutput(deviceId = savedOutputId()) {
    const audios = getAudios().filter(Boolean);
    if (!audios.length) return true;
    if (!canSelectOutput()) {
      setNote('Neste aparelho, o áudio sai pelo fone/Bluetooth definido no sistema. Isso é normal no Android e no iPhone.');
      return false;
    }
    let ok = true;
    for (const audio of audios) {
      if (!(await applySink(audio, deviceId))) ok = false;
    }
    if (!ok) setNote('O navegador não liberou trocar a saída. O áudio continua no dispositivo padrão do sistema.');
    if (onOutput) onOutput(deviceId);
    return ok;
  }

  async function refresh() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setNote('Este navegador não permite escolher dispositivos por aqui.');
      return;
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const mics = all.filter((d) => d.kind === 'audioinput');
      const outs = all.filter((d) => d.kind === 'audiooutput');
      fill(micSel, mics, savedMicId(), 'Microfone padrão do aparelho');
      fill(outSel, outs, savedOutputId(), canSelectOutput() ? 'Saída padrão do sistema' : 'Saída definida pelo sistema');
      if (outSel) outSel.disabled = !canSelectOutput();
      const named = mics.some((d) => d.label) || outs.some((d) => d.label);
      if (!named) setNote('Ative o microfone para o navegador liberar os nomes dos dispositivos.');
      else if (!canSelectOutput()) setNote('Para ouvir em outro fone/Bluetooth, troque a saída no sistema. O Intercom segue o áudio do aparelho.');
    } catch (err) {
      setNote(err?.message || 'Não foi possível listar os dispositivos.');
    }
  }

  async function chooseMic(deviceId) {
    remember(MIC_KEY, deviceId);
    if (onMic) {
      try {
        await onMic(deviceId);
        setNote('Microfone trocado.');
      } catch (err) {
        setNote(err?.message || 'Não foi possível trocar o microfone.');
        if (micSel) micSel.value = savedMicId();
        remember(MIC_KEY, micSel?.value || '');
      }
    }
  }

  micSel?.addEventListener('change', () => chooseMic(micSel.value));
  outSel?.addEventListener('change', async () => {
    remember(OUT_KEY, outSel.value);
    await applyOutput(outSel.value);
    setNote(canSelectOutput() ? 'Saída de áudio trocada.' : 'No Android/iPhone a saída é controlada pelo sistema.');
  });
  refreshBtn?.addEventListener('click', refresh);

  for (const btn of document.querySelectorAll('[data-devices-open]')) {
    btn.addEventListener('click', async () => {
      await refresh();
      if (dialog?.showModal) dialog.showModal();
      else dialog?.setAttribute('open', '');
    });
  }
  document.querySelectorAll('[data-devices-close]').forEach((b) => {
    b.addEventListener('click', () => (dialog?.close ? dialog.close() : dialog?.removeAttribute('open')));
  });

  // Permite aplicar a saída salva quando o diálogo abrir ou um áudio novo chegar.
  if (canSelectOutput()) applyOutput(savedOutputId());
  refresh();

  return { applyOutput, refresh, open: async () => { await refresh(); if (dialog?.showModal) dialog.showModal(); } };
}
