// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Controladores externos do console de Replay/VAR:
//   - MIDI (Web MIDI): mesas, pads, nanokontrol, X-Touch, teclados MIDI
//   - USB gamepad/joystick (Gamepad API): volantes, pedaleiras, controles genéricos
//   - USB HID genérico (WebHID): Contour Shuttle, X-Keys, Stream Deck em modo HID
// Todas as ações passam pelo mesmo mapa, com "Aprender" e presets. Nada aqui é obrigatório:
// sem controlador o console funciona igual (teclado/mouse).

const STORAGE_KEY = 'castdeck.replay.controllers.v1';

export function initReplayControllers({ actions, onStatus } = {}) {
  const list = actions && typeof actions === 'object' ? actions : {};
  let mappings = loadMappings();
  let learning = null; // { action, label }
  let midiAccess = null;
  let midiInputs = new Map(); // id -> input
  let hidDevices = new Map(); // id -> { device, prev: Map<reportId, number[]> }
  let gamepadIndex = null;
  let gamepadPrev = [];
  let pollTimer = null;
  let modal = null;
  let chipStatusEl = null;
  let modalStatusEl = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function loadMappings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data.filter((m) => m && m.action && list[m.action]) : [];
    } catch {
      return [];
    }
  }

  function saveMappings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings)); } catch {}
    render();
    updateStatus();
  }

  function actionLabel(id) {
    return list[id]?.label || id;
  }

  function run(action, value) {
    const a = list[action];
    if (!a) return;
    try {
      a.run?.(value);
      flash(`${a.label || action}${typeof value === 'number' ? ` (${value})` : ''}`);
    } catch (err) {
      console.warn('[controllers] ação falhou:', action, err);
    }
  }

  // ---------------------------------------------------------------
  // MIDI
  // ---------------------------------------------------------------
  async function initMidi() {
    if (!navigator.requestMIDIAccess) return;
    try {
      midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      bindMidiInputs();
      midiAccess.onstatechange = () => bindMidiInputs();
    } catch (err) {
      console.warn('[controllers] Web MIDI indisponível:', err?.message || err);
    }
  }

  function bindMidiInputs() {
    if (!midiAccess) return;
    midiInputs.clear();
    for (const input of midiAccess.inputs.values()) {
      midiInputs.set(input.id, input);
      input.onmidimessage = onMidiMessage;
    }
    updateStatus();
    render();
  }

  function onMidiMessage(ev) {
    const data = ev.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const channel = data[0] & 0x0f;
    const d1 = data[1];
    const d2 = data.length > 2 ? data[2] : 0;
    const isNote = status === 0x90 || status === 0x80;
    const isCC = status === 0xb0;
    if (!isNote && !isCC) return;
    const type = isNote ? 'note' : 'cc';
    const pressed = status === 0x90 && d2 > 0;

    if (learning) {
      // Para nota usamos o "note on"; para CC, o primeiro movimento/valor.
      if (isNote && !pressed) return;
      learning.device = 'midi';
      addMapping({
        source: 'midi',
        type,
        channel,
        number: d1,
        action: learning.action,
        mode: learning.action === 'jog' ? 'relative' : (list[learning.action]?.analog ? 'absolute' : 'press'),
      });
      return; // não dispara a ação no mesmo evento de aprendizagem
    }

    for (const m of mappings) {
      if (m.source !== 'midi' || m.type !== type || m.channel !== channel || m.number !== d1) continue;
      const a = list[m.action];
      if (!a) continue;
      if (a.analog) {
        if (type === 'cc') run(m.action, m.mode === 'relative' ? relativeCC(d2) : d2 / 127);
        continue;
      }
      if (isNote && pressed) run(m.action, 1);
      else if (isCC && d2 > 0) run(m.action, d2 / 127);
    }
  }

  // CC relativo (jog/shuttle): 1..63 = direita, 65..127 = esquerda, 64 = parado.
  function relativeCC(v) {
    const d = v < 64 ? v : v - 128;
    return Math.max(-8, Math.min(8, d)) / 8;
  }

  // ---------------------------------------------------------------
  // Gamepad / joystick USB
  // ---------------------------------------------------------------
  function initGamepad() {
    if (!navigator.getGamepads) return;
    const scan = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let found = null;
      for (const p of pads) {
        if (p && p.connected) { found = p; break; }
      }
      gamepadIndex = found ? found.index : null;
      updateStatus();
    };
    window.addEventListener('gamepadconnected', (e) => {
      gamepadIndex = e.gamepad.index;
      flash(`Controle USB: ${e.gamepad.id}`);
      updateStatus();
      render();
    });
    window.addEventListener('gamepaddisconnected', () => {
      scan();
      render();
    });
    scan();
    pollTimer = setInterval(pollGamepad, 30);
  }

  function pollGamepad() {
    if (gamepadIndex === null || !navigator.getGamepads) return;
    const pad = navigator.getGamepads()[gamepadIndex];
    if (!pad) return;
    const buttons = pad.buttons || [];
    const axes = pad.axes || [];

    // Aprender um controle analógico (jog/fader) pode ser o movimento de um eixo.
    if (learning && !learning.device) {
      const axisIdx = axes.findIndex((v) => Math.abs(v) > 0.6);
      if (axisIdx >= 0) {
        learning.device = 'gamepad';
        addMapping({
          source: 'gamepad',
          type: 'axis',
          number: axisIdx,
          action: learning.action,
          mode: learning.action === 'jog' ? 'relative' : 'absolute',
        });
        return;
      }
    }

    for (let i = 0; i < buttons.length; i++) {
      const pressed = buttons[i]?.pressed || (buttons[i]?.value || 0) > 0.5;
      const was = !!gamepadPrev[i];
      gamepadPrev[i] = pressed;
      if (!pressed || was) continue;
      if (learning) {
        learning.device = 'gamepad';
        addMapping({ source: 'gamepad', type: 'button', number: i, action: learning.action });
        return;
      }
      const m = mappings.find((x) => x.source === 'gamepad' && x.type === 'button' && x.number === i);
      if (m) run(m.action, 1);
    }

    for (const m of mappings) {
      if (m.source !== 'gamepad' || m.type !== 'axis') continue;
      const v = axes[m.number] || 0;
      if (Math.abs(v) < 0.15) continue;
      const a = list[m.action];
      if (!a?.analog) continue;
      run(m.action, m.mode === 'relative' ? v : (v + 1) / 2);
    }

  }

  // ---------------------------------------------------------------
  // USB HID genérico (shuttle/jog/pedaleira que não aparece como gamepad)
  // ---------------------------------------------------------------
  async function initHid() {
    if (!navigator.hid) return;
    try {
      const devices = await navigator.hid.getDevices();
      for (const d of devices) await attachHid(d);
    } catch {}
    updateStatus();
  }

  async function attachHid(device) {
    try {
      if (!device.opened) await device.open();
    } catch (err) {
      console.warn('[controllers] HID open falhou:', err?.message || err);
      return;
    }
    hidDevices.set(device.productId + ':' + device.vendorId, { device, prev: new Map() });
    device.addEventListener('inputreport', onHidReport);
    updateStatus();
    render();
  }

  async function requestHid() {
    if (!navigator.hid) {
      flash('WebHID indisponível neste navegador');
      return;
    }
    try {
      const devices = await navigator.hid.requestDevice({ filters: [] });
      for (const d of devices) await attachHid(d);
      flash(devices.length ? `HID: ${devices.map((d) => d.productName).join(', ')}` : 'Nenhum HID escolhido');
      render();
    } catch (err) {
      console.warn('[controllers] HID request:', err);
    }
  }

  function onHidReport(ev) {
    const { device, reportId, data } = ev;
    const key = device.productId + ':' + device.vendorId;
    const entry = hidDevices.get(key);
    if (!entry) return;
    const bytes = Array.from(data);
    const prev = entry.prev.get(reportId);

    // Aprender: primeira leitura vira baseline; a próxima mudança vira o binding.
    if (learning) {
      if (!prev) {
        entry.prev.set(reportId, bytes);
        flash(`HID ${device.productName}: aperte/mova o controle...`);
        return;
      }
      let idx = -1;
      for (let i = 0; i < Math.max(prev.length, bytes.length); i++) {
        if ((prev[i] || 0) !== (bytes[i] || 0)) { idx = i; break; }
      }
      if (idx < 0) return;
      const before = prev[idx] || 0;
      const after = bytes[idx] || 0;
      const press = before === 0 && after !== 0;
      learning.device = 'hid';
      addMapping({
        source: 'hid',
        deviceKey: key,
        reportId,
        number: idx,
        mode: press ? 'press' : 'delta',
        action: learning.action,
      });
      entry.prev.set(reportId, bytes);
      return;
    }

    if (!prev) { entry.prev.set(reportId, bytes); return; }
    for (const m of mappings) {
      if (m.source !== 'hid' || m.deviceKey !== key || m.reportId !== reportId) continue;
      const before = prev[m.number] || 0;
      const after = bytes[m.number] || 0;
      if (before === after) continue;
      if (m.mode === 'press') {
        if (before === 0 && after !== 0) run(m.action, 1);
      } else {
        let d = (after - before + 256) % 256;
        if (d > 128) d -= 256;
        if (d !== 0) run(m.action, Math.max(-8, Math.min(8, d)) / 8);
      }
    }
    entry.prev.set(reportId, bytes);
  }

  // ---------------------------------------------------------------
  // Ações, presets e UI
  // ---------------------------------------------------------------
  function addMapping(m) {
    const action = learning?.action || m.action;
    if (!action) return;
    mappings = mappings.filter((x) => x.action !== action); // 1 controle por ação (mais previsível)
    mappings.push({ ...m, action });
    learning = null;
    saveMappings();
    flash(`Aprendido: ${actionLabel(action)}`);
  }

  function preset(name) {
    const p = PRESETS[name];
    if (!p) return;
    mappings = p();
    saveMappings();
    flash(`Preset aplicado: ${name}`);
  }

  function clearAll() {
    mappings = [];
    saveMappings();
  }

  // Presets usam os números mais comuns; o operador pode ajustar com "Aprender".
  const PRESETS = {
    // mesa/pad MIDI genérico: notas 36-43 e CC 1-8
    'midi-generic': () => [
      mapMidi('note', 36, 'playPause'), mapMidi('note', 37, 'stepBack'), mapMidi('note', 38, 'stepFwd'),
      mapMidi('note', 39, 'take'), mapMidi('note', 40, 'cutLive'), mapMidi('note', 41, 'markIn'),
      mapMidi('note', 42, 'markOut'), mapMidi('note', 43, 'saveClip'),
      mapMidi('cc', 7, 'speedAxis', 'absolute'), mapMidi('cc', 8, 'jog', 'relative'),
    ],
    // Korg nanoKONTROL2: primeiro banco de botões/knobs
    'nanokontrol2': () => [
      mapMidi('note', 41, 'playPause'), mapMidi('note', 42, 'stepBack'), mapMidi('note', 43, 'stepFwd'),
      mapMidi('note', 44, 'markIn'), mapMidi('note', 45, 'markOut'), mapMidi('note', 46, 'take'),
      mapMidi('note', 47, 'cutLive'), mapMidi('cc', 0, 'speedAxis', 'absolute'), mapMidi('cc', 1, 'jog', 'relative'),
    ],
    // gamepad USB genérico
    gamepad: () => [
      { source: 'gamepad', type: 'button', number: 0, action: 'playPause' },
      { source: 'gamepad', type: 'button', number: 1, action: 'stepBack' },
      { source: 'gamepad', type: 'button', number: 2, action: 'stepFwd' },
      { source: 'gamepad', type: 'button', number: 3, action: 'take' },
      { source: 'gamepad', type: 'button', number: 4, action: 'cutLive' },
      { source: 'gamepad', type: 'button', number: 5, action: 'markIn' },
      { source: 'gamepad', type: 'button', number: 6, action: 'markOut' },
      { source: 'gamepad', type: 'button', number: 7, action: 'saveClip' },
      { source: 'gamepad', type: 'axis', number: 0, action: 'jog', mode: 'relative' },
    ],
    // teclado/pedaleira que emula teclado (X-Keys, Stream Deck) já funciona pelo teclado;
    // este preset mapeia as teclas mais usadas para o operador lembrar.
    'keyboard-hint': () => [],
  };

  function mapMidi(type, number, action, mode = 'press') {
    return { source: 'midi', type, channel: 0, number, action, mode };
  }

  function statusText() {
    const midi = midiInputs.size;
    const pads = gamepadIndex !== null ? 1 : 0;
    const hid = hidDevices.size;
    if (!midi && !pads && !hid) return 'CTRL';
    return `CTRL ${midi}·${pads}·${hid}`;
  }

  function updateStatus() {
    const txt = statusText();
    if (chipStatusEl) chipStatusEl.textContent = txt;
    if (modalStatusEl) modalStatusEl.textContent = txt;
    onStatus?.(txt);
  }

  function flash(msg) {
    const el = $('#rp-ctrl-flash');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(flash._t);
    flash._t = setTimeout(() => { el.style.opacity = '0'; }, 2500);
  }

  function ensureModal() {
    if (modal) return modal;
    const wrap = document.createElement('div');
    wrap.className = 'bc-modal-overlay';
    wrap.id = 'rp-modal-controllers';
    wrap.style.display = 'none';
    wrap.innerHTML = `
      <div class="bc-modal-box" style="width:min(680px,94vw);max-height:86vh;overflow:auto">
        <div class="bc-modal-header">
          <div style="display:flex;align-items:center;gap:8px">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="7" width="20" height="10" rx="4"></rect><circle cx="7" cy="12" r="1.6" fill="currentColor"></circle><circle cx="17" cy="12" r="1.6" fill="currentColor"></circle><path d="M10 12h4"></path></svg>
            <span style="font-weight:800;font-size:14px;letter-spacing:.5px">Controladores USB / MIDI</span>
          </div>
          <button class="bc-btn icon sm" id="rp-ctrl-close" style="font-size:14px">✕</button>
        </div>
        <div class="bc-modal-body">
          <p class="bc-cfg-desc">Roda jog, fader de velocidade, TAKE, IN/OUT e atalhos. MIDI pelo navegador, gamepad USB e HID genérico (Shuttle/X-Keys). Clique em <b>Aprender</b> e mexa no controle.</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px">
            <button class="bc-btn" id="rp-ctrl-hid">Adicionar USB HID…</button>
            <button class="bc-btn" id="rp-ctrl-refresh">Atualizar</button>
            <select class="bc-select" id="rp-ctrl-preset" style="max-width:210px">
              <option value="">Aplicar preset…</option>
              <option value="midi-generic">MIDI genérico (notas 36-43)</option>
              <option value="nanokontrol2">Korg nanoKONTROL2</option>
              <option value="gamepad">Gamepad USB genérico</option>
            </select>
            <button class="bc-btn" id="rp-ctrl-clear" style="color:#ef4444">Limpar mapa</button>
          </div>
          <div id="rp-ctrl-list" style="display:grid;grid-template-columns:1fr auto auto;gap:4px 8px;font-size:11px"></div>
          <div id="rp-ctrl-flash" style="margin-top:10px;font-size:11px;color:#38bdf8;opacity:0;transition:opacity .2s"></div>
        </div>
        <div class="bc-modal-footer"><span id="rp-ctrl-status" style="font-size:10px;color:#94a3b8"></span><button class="bc-btn active" id="rp-ctrl-done" style="background:#7c5cff;color:#fff;border-color:#7c5cff">Fechar</button></div>
      </div>`;
    document.body.appendChild(wrap);
    modal = wrap;
    $('#rp-ctrl-close', wrap).onclick = closeModal;
    $('#rp-ctrl-done', wrap).onclick = closeModal;
    $('#rp-ctrl-hid', wrap).onclick = requestHid;
    $('#rp-ctrl-refresh', wrap).onclick = () => { bindMidiInputs(); initHid(); render(); };
    $('#rp-ctrl-clear', wrap).onclick = clearAll;
    $('#rp-ctrl-preset', wrap).onchange = (e) => { if (e.target.value) { preset(e.target.value); e.target.value = ''; } };
    modalStatusEl = $('#rp-ctrl-status', wrap);
    updateStatus();
    return wrap;
  }

  function openModal() {
    ensureModal();
    modal.style.display = 'flex';
    render();
    updateStatus();
  }

  function closeModal() {
    if (modal) modal.style.display = 'none';
    learning = null;
  }

  function render() {
    if (!modal) return;
    const listEl = $('#rp-ctrl-list', modal);
    if (!listEl) return;
    listEl.innerHTML = Object.entries(list).map(([id, a]) => {
      const m = mappings.find((x) => x.action === id);
      const bound = m ? describe(m) : '—';
      return `<div style="display:contents">
        <div><b>${esc(a.label || id)}</b>${a.analog ? ' <span style="color:#64748b">(analógico)</span>' : ''}</div>
        <div style="color:#38bdf8">${esc(bound)}</div>
        <div style="display:flex;gap:4px">
          <button class="bc-btn" style="height:22px;padding:0 7px;font-size:10px" data-learn="${esc(id)}">Aprender</button>
          ${m ? `<button class="bc-btn" style="height:22px;padding:0 6px;font-size:10px;color:#ef4444" data-unbind="${esc(id)}">×</button>` : ''}
        </div>
      </div>`;
    }).join('');
    listEl.querySelectorAll('[data-learn]').forEach((b) => {
      b.onclick = () => {
        learning = { action: b.dataset.learn, device: null };
        flash(`Aguardando controle para "${actionLabel(b.dataset.learn)}"...`);
      };
    });
    listEl.querySelectorAll('[data-unbind]').forEach((b) => {
      b.onclick = () => {
        mappings = mappings.filter((x) => x.action !== b.dataset.unbind);
        saveMappings();
      };
    });
  }

  function describe(m) {
    if (m.source === 'midi') return `MIDI ${m.type === 'cc' ? 'CC' : 'Nota'} ${m.number}${m.mode === 'relative' ? ' (rel)' : ''}`;
    if (m.source === 'gamepad') return `Pad ${m.type === 'button' ? 'botão' : 'eixo'} ${m.number}`;
    if (m.source === 'hid') return `HID byte ${m.number}${m.mode === 'delta' ? ' (jog)' : ''}`;
    return '—';
  }

  // Botão de status no cabeçalho do console
  function mountHeader() {
    const btn = $('#rp-btn-controllers');
    if (btn) btn.onclick = openModal;
    const host = $('#rp-ctrl-header');
    if (host && !$('#rp-ctrl-chip')) {
      const chip = document.createElement('button');
      chip.className = 'bc-hdr-btn';
      chip.id = 'rp-ctrl-chip';
      chip.title = 'Controladores USB/MIDI';
      chip.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="vertical-align:-2px;margin-right:4px"><rect x="2" y="7" width="20" height="10" rx="4"></rect><circle cx="7" cy="12" r="1.5" fill="currentColor"></circle><circle cx="17" cy="12" r="1.5" fill="currentColor"></circle></svg><span id="rp-ctrl-chip-text">Controladores</span>';
      chip.onclick = openModal;
      host.appendChild(chip);
      chipStatusEl = $('#rp-ctrl-chip-text');
    }
    updateStatus();
  }

  // ---------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------
  initMidi();
  initHid();
  initGamepad();
  mountHeader();
  // Nada é aplicado automaticamente sem o operador escolher um preset — evita botão
  // inesperado disparando em mesa MIDI já conectada.

  return {
    open: openModal,
    close: closeModal,
    getMappings: () => mappings.map((m) => ({ ...m })),
    setLearning: (action) => { learning = { action, device: null }; },
    destroy: () => {
      if (pollTimer) clearInterval(pollTimer);
      try { midiAccess?.inputs.forEach((i) => { i.onmidimessage = null; }); } catch {}
      for (const { device } of hidDevices.values()) {
        try { device.removeEventListener('inputreport', onHidReport); } catch {}
      }
    },
  };
}
