// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// PTZ HUD: controle UVC de pan/tilt/zoom, presets, teclado e MIDI.
// A HUD é independente do compositor: ela move a câmera física e reutiliza o stream existente.
import { toast } from '../ui.js';
import { normalizeAdjust, drawFramed } from './compositor.js';

const GEO_KEY = 'castdeck.ptz.hud';
const PRESET_KEY = 'castdeck.ptz.presets';
const MIDI_KEY = 'castdeck.ptz.midi';
const AXES = ['pan', 'tilt', 'zoom'];
const DIGITAL_CAPS = { pan: { min: -1, max: 1, step: 0.01 }, tilt: { min: -1, max: 1, step: 0.01 }, zoom: { min: 1, max: 3, step: 0.01 } };
const ONVIF_CAPS = { pan: { min: -1, max: 1, step: 0.01 }, tilt: { min: -1, max: 1, step: 0.01 }, zoom: { min: 0, max: 1, step: 0.01 } };
const ONVIF_KEY = 'castdeck.ptz.onvif.';
const AXIS_LABEL = { pan: 'Pan', tilt: 'Tilt', zoom: 'Zoom' };
const MIDI_ACTIONS = [
  ...AXES.map((id) => ({ id, label: AXIS_LABEL[id], kind: 'axis' })),
  ...Array.from({ length: 8 }, (_, i) => ({ id: `preset${i + 1}`, label: `Preset ${i + 1}`, kind: 'preset' })),
  { id: 'home', label: 'Home', kind: 'button' },
  { id: 'stop', label: 'Parar', kind: 'button' },
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createPtzHud({ S, getSig, applyAdjust }) {
  let root = null;
  let video = null;
  let sourceSelect = null;
  let stateEl = null;
  let zoomEl = null;
  let speedEl = null;
  let armBtn = null;
  let midiPanel = null;
  let midiList = null;
  let midiDevice = null;
  let midiStatus = null;
  let sourceId = null;
  let source = null;
  let mode = 'none'; // uvc | ndi | none
  let ndiKey = '';
  let ndiSupported = false;
  let ndiLoading = false;
  let ndiSeq = 0;
  let ndiCheckAt = 0;
  let ndiSendBusy = false;
  let ndiQueued = null;
  let ndiErrAt = 0;
  let remoteSig = '';
  let remoteKey = '';
  let remotePhysical = false;
  let digitalOn = false;
  let digitalAdjust = null;
  let digitalRaf = 0;
  let nativeHasPanTilt = false;
  let onvifConfig = null;
  let onvifOn = false;
  let onvifDraft = null;
  let onvifBusy = false;
  let onvifQueued = null;
  let onvifErrAt = 0;
  let onvifOnline = false;
  let onvifStatusBusy = false;
  let onvifStatusAt = 0;
  let onvifLastError = '';
  let onvifStatusUnsupported = false;
  let presetSaveMode = false;
  let altDown = false;
  let adv = { invertPan: false, invertTilt: false, baseStep: 0.006, repeatMs: 90, ...loadJson('castdeck.ptz.adv', {}) };
  let presetClearMode = false;
  let activePreset = null;
  let track = null;
  let caps = {};
  let ranges = {};
  let pos = { pan: 0, tilt: 0, zoom: 1, focus: 0.5 };
  let activeMove = null;
  let moveTimer = 0;
  let drag = null;
  let openState = false;
  let armed = false;
  let lastError = '';
  let presets = loadJson(PRESET_KEY, {});
  let midi = { access: null, mappings: loadJson(MIDI_KEY, {}), device: '', learn: null };
  let lastSignature = '';
  let observer = null;

  const cameras = () => [...S.sources.values()].filter((s) => s.kind === 'camera' && (s.stream || s.remoteCam));
  const isLive = (id) => S.take === id || S.stage?.includes(id);
  const rangeOf = (k) => (caps[k] && Number.isFinite(caps[k].min) && Number.isFinite(caps[k].max) && caps[k].max > caps[k].min ? caps[k] : null);
  const NDI_CAPS = { pan: { min: -1, max: 1, step: 0.01 }, tilt: { min: -1, max: 1, step: 0.01 }, zoom: { min: 0, max: 1, step: 0.01 } };
  const has = (k) => !!rangeOf(k);
  const canMove = () => has('pan') || has('tilt');
  const readSettings = () => {
    try {
      const v = track?.getSettings?.() || {};
      if (Number.isFinite(v.pan)) pos.pan = v.pan;
      if (Number.isFinite(v.tilt)) pos.tilt = v.tilt;
      if (Number.isFinite(v.zoom)) pos.zoom = v.zoom;
      if (Number.isFinite(v.focusDistance)) pos.focus = v.focusDistance;
    } catch {}
  };
  const pct = (k) => {
    const r = rangeOf(k);
    return r ? (clamp(pos[k], r.min, r.max) - r.min) / (r.max - r.min) : 0;
  };
  const saveGeo = () => {
    if (!root || root.hidden) return;
    try {
      localStorage.setItem(GEO_KEY, JSON.stringify({
        x: root.offsetLeft, y: root.offsetTop, w: root.offsetWidth, h: root.offsetHeight,
      }));
    } catch {}
  };
  const savePresets = () => {
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(presets)); } catch {}
  };
  const saveMidi = () => {
    try { localStorage.setItem(MIDI_KEY, JSON.stringify(midi.mappings)); } catch {}
  };

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') || fallback; } catch { return fallback; }
  }

  function style() {
    if (document.getElementById('ptz-hud-style')) return;
    const el = document.createElement('style');
    el.id = 'ptz-hud-style';
    el.textContent = `
      .ptz-hud{position:fixed;right:20px;bottom:20px;z-index:91;width:360px;height:auto;min-width:300px;min-height:330px;max-width:min(520px,calc(100vw - 20px));max-height:calc(100vh - 20px);background:#14121f;color:#f6f2ff;border:1px solid rgba(255,255,255,.15);border-radius:14px;box-shadow:0 22px 70px rgba(0,0,0,.5);resize:both;overflow:hidden;display:flex;flex-direction:column;font:12px/1.4 Inter,"Segoe UI",sans-serif}
      .ptz-hud[hidden]{display:none!important}.ptz-head{display:flex;align-items:center;gap:8px;padding:9px 10px;background:rgba(255,255,255,.045);border-bottom:1px solid rgba(255,255,255,.09);cursor:move;user-select:none;flex:none}
      .ptz-head b{font:800 13px Outfit,Inter,sans-serif;letter-spacing:.02em}.ptz-exp{margin-left:-3px;padding:1px 5px;border-radius:4px;background:rgba(241,198,107,.12);border:1px solid rgba(241,198,107,.28);color:#f1c66b;font:600 8px Inter,sans-serif;letter-spacing:.03em;text-transform:lowercase}.ptz-head .dot{width:7px;height:7px;border-radius:50%;background:#7d748f}.ptz-head .dot.on{background:#3ee29c;box-shadow:0 0 0 4px rgba(62,226,156,.1)}
      .ptz-head select{max-width:150px;min-width:0;background:#0d0b15;color:#ddd5ee;border:1px solid rgba(255,255,255,.13);border-radius:6px;padding:3px 5px;font-size:10.5px;outline:0}.ptz-head .grow{flex:1}.ptz-x{border:0;background:transparent;color:#aaa1bb;font-size:17px;line-height:1;cursor:pointer;padding:1px 4px}.ptz-x:hover{color:#fff}
      .ptz-body{padding:9px;overflow:auto;flex:1;min-height:0}.ptz-preview{position:relative;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#06060b;border:1px solid rgba(255,255,255,.09);cursor:grab;touch-action:none}.ptz-preview:active{cursor:grabbing}.ptz-preview video,.ptz-preview canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;pointer-events:none}.ptz-preview canvas[hidden]{display:none}.ptz-reticle{position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border:1px solid rgba(255,255,255,.55);border-radius:50%;pointer-events:none}.ptz-reticle:before,.ptz-reticle:after{content:"";position:absolute;background:rgba(255,255,255,.5)}.ptz-reticle:before{left:7px;top:-5px;width:1px;height:26px}.ptz-reticle:after{top:7px;left:-5px;height:1px;width:26px}.ptz-tag{position:absolute;left:6px;top:6px;padding:2px 5px;border-radius:4px;background:rgba(0,0,0,.55);color:#d8cff0;font-size:9px;letter-spacing:.04em}.ptz-tag.live{background:#bd1838;color:#fff}
      .ptz-state{display:flex;align-items:center;justify-content:space-between;gap:7px;margin:8px 0 6px;color:#8e869f;font-size:10px}.ptz-state b{color:#c5b9e3;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ptz-badge{margin-left:3px;padding:2px 5px;border-radius:4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);white-space:nowrap}.ptz-badge.ok{color:#66e4b0;border-color:rgba(102,228,176,.25)}.ptz-badge.warn{color:#f3c76c;border-color:rgba(243,199,108,.25)}
      .ptz-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;width:116px;margin:0 auto}.ptz-pad button,.ptz-mini{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.055);color:#e8e1f5;border-radius:6px;min-height:28px;font:700 13px Inter,sans-serif;cursor:pointer}.ptz-pad button:hover,.ptz-mini:hover{background:rgba(255,255,255,.12)}.ptz-pad button:active{background:#7b56e8}.ptz-pad .mid{font-size:10px;color:#8d839e}.ptz-row{display:flex;align-items:center;gap:5px;margin-top:6px}.ptz-row .ptz-mini{padding:0 8px;min-height:27px;font-size:11px}.ptz-row label{display:flex;align-items:center;gap:4px;color:#8b839b;font-size:10px;white-space:nowrap}.ptz-row input[type=range]{flex:1;min-width:30px;accent-color:#a78bfa}.ptz-row output{min-width:34px;text-align:right;color:#d4c8ed;font-size:10px}
      .ptz-presets{display:grid;grid-template-columns:repeat(8,1fr);gap:3px;margin-top:7px}.ptz-presets button{border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.04);color:#b4aac5;border-radius:5px;min-height:25px;font:700 10px Inter,sans-serif;cursor:pointer}.ptz-presets button.has{color:#d7c9ff;border-color:rgba(167,139,250,.4)}.ptz-presets button.active{background:rgba(167,139,250,.28);border-color:#a78bfa;color:#fff;box-shadow:0 0 0 1px rgba(167,139,250,.35)}.ptz-presets button.saving{border-color:#f1c66b}.ptz-presets button:hover{background:rgba(167,139,250,.17);color:#fff}
      .ptz-preset-actions{display:flex;align-items:center;gap:6px;margin-top:5px}.ptz-preset-actions button{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.04);color:#c9bde0;border-radius:5px;padding:3px 7px;font:700 9px Inter,sans-serif;cursor:pointer}.ptz-preset-actions button.on{border-color:#f1c66b;color:#f1c66b;background:rgba(241,198,107,.1)}.ptz-adv{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;padding:6px 0;border-top:1px solid rgba(255,255,255,.07);margin-top:4px}.ptz-adv[hidden]{display:none}.ptz-adv-check{display:flex;align-items:center;gap:4px;font-size:9px;color:#b6aacb}.ptz-adv-step{display:flex;align-items:center;gap:4px;font-size:9px;color:#91869f}.ptz-adv-step input{flex:1;min-width:30px;accent-color:#a78bfa}.ptz-adv-step b{font-weight:600;color:#cbbde1;min-width:32px}.ptz-adv-hint{grid-column:1/-1;font-size:8.5px;color:#786e88}.ptz-adv kbd{border:1px solid rgba(255,255,255,.15);border-radius:3px;padding:0 3px;font:8px Inter;color:#cbbde1}.ptz-preset-actions span{font-size:9px;color:#7f758f}.ptz-foot{display:flex;align-items:center;gap:5px;flex:none;padding:7px 9px;border-top:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.025)}.ptz-foot button{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05);color:#cfc4e3;border-radius:6px;min-height:26px;padding:0 8px;font:700 10px Inter,sans-serif;cursor:pointer}.ptz-foot button.on{border-color:rgba(167,139,250,.55);background:rgba(167,139,250,.2);color:#fff}.ptz-foot .grow{flex:1}
      .ptz-midi{display:none;border-top:1px solid rgba(255,255,255,.09);padding:8px 9px;flex:none;max-height:235px;overflow:auto;background:#100e1b}.ptz-midi.open{display:block}.ptz-midi-head{display:flex;gap:5px;align-items:center;margin-bottom:6px}.ptz-midi-head select{flex:1;min-width:0;background:#0c0a14;color:#d9d0ea;border:1px solid rgba(255,255,255,.13);border-radius:5px;padding:4px;font-size:10px}.ptz-midi-head button{border:1px solid rgba(167,139,250,.4);background:rgba(167,139,250,.14);color:#e0d4ff;border-radius:5px;padding:4px 7px;font:700 10px Inter,sans-serif;cursor:pointer}.ptz-midi-row{display:grid;grid-template-columns:1fr auto auto;gap:5px;align-items:center;padding:3px 0;border-top:1px solid rgba(255,255,255,.045)}.ptz-midi-row span{font-size:10px;color:#bdb2cf}.ptz-midi-row em select{margin-left:4px;background:#0d0b15;color:#d7c9ff;border:1px solid rgba(255,255,255,.16);border-radius:4px;font-size:9px;padding:1px 2px}.ptz-midi-row em{font-size:9px;color:#83788f;font-style:normal}.ptz-midi-row button{border:1px solid rgba(255,255,255,.1);background:transparent;color:#b7aacb;border-radius:4px;padding:2px 5px;font-size:9px;cursor:pointer}.ptz-midi-row button.learning{border-color:#f1c66b;color:#f1c66b}
      .ptz-onvif-backdrop{position:fixed;inset:0;z-index:94;background:rgba(0,0,0,.5);backdrop-filter:blur(2px);display:none}.ptz-onvif-backdrop.open{display:block}.ptz-onvif{display:none;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:95;width:min(390px,calc(100vw - 24px));max-height:calc(100vh - 40px);overflow:auto;border:1px solid rgba(255,255,255,.16);border-radius:12px;padding:12px;background:#171326;box-shadow:0 22px 70px rgba(0,0,0,.55)}.ptz-onvif.open{display:block}.ptz-onvif-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px}.ptz-onvif-head b{font-size:11px;color:#ded3f4}.ptz-onvif-head span{font-size:9px;color:#8b819b}.ptz-onvif-grid{display:grid;grid-template-columns:1.5fr .7fr;gap:4px 6px}.ptz-onvif-grid label,.ptz-onvif-profile{display:flex;flex-direction:column;gap:2px;font-size:9px;color:#a99fbb}.ptz-onvif-secure{grid-column:1/-1;flex-direction:row!important;align-items:center!important;gap:5px!important;margin-top:2px}.ptz-onvif-secure input{width:auto!important}.ptz-onvif-secure em{font-style:normal;color:#83788f}.ptz-onvif-found{display:flex;flex-direction:column;gap:3px;margin-top:5px}.ptz-onvif-found button{text-align:left;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);color:#cfc3e4;border-radius:5px;padding:4px 6px;font:10px Inter,sans-serif;cursor:pointer}.ptz-onvif-found button:hover{border-color:#a78bfa;background:rgba(167,139,250,.12)}.ptz-onvif-grid input,.ptz-onvif-profile select{width:100%;min-width:0;background:#0c0a14;color:#e2d8f3;border:1px solid rgba(255,255,255,.13);border-radius:5px;padding:4px;font-size:10px;outline:0}.ptz-onvif-actions{display:flex;gap:5px;align-items:center;margin-top:5px;flex-wrap:wrap}.ptz-onvif-actions button{border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05);color:#d4c8e9;border-radius:5px;padding:4px 7px;font:700 9px Inter,sans-serif;cursor:pointer}.ptz-onvif-actions button.primary{border-color:rgba(167,139,250,.5);background:rgba(167,139,250,.2);color:#fff}.ptz-onvif-actions button:disabled{opacity:.45;cursor:not-allowed}.ptz-onvif-actions span{font-size:9px;color:#9d93ad;overflow-wrap:anywhere}.ptz-onvif-profile{margin-top:4px}.ptz-midi-note{font-size:9px;line-height:1.4;color:#7d738e;margin:4px 0 0}.ptz-toast{position:fixed;left:50%;bottom:18px;z-index:2147482001;transform:translateX(-50%);background:#211b31;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:8px 12px;color:#fff;font:12px Inter,sans-serif;opacity:0;pointer-events:none;transition:opacity .2s}.ptz-toast.show{opacity:1}
      .ptz-top{font-weight:800}
      @media(max-width:620px){.ptz-hud{right:8px;bottom:8px;width:calc(100vw - 16px);max-width:none;height:auto;min-height:0;resize:none}.ptz-head select{max-width:115px}.ptz-foot{flex-wrap:wrap}}
    `;
    document.head.appendChild(el);
  }

  function el(tag, cls, text) {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (text != null) x.textContent = text;
    return x;
  }

  function badge(text, cls = '') {
    return `<span class="ptz-badge ${cls}">${text}</span>`;
  }

  function mount() {
    if (root) return;
    style();
    root = document.createElement('section');
    root.id = 'ptz-hud';
    root.className = 'ptz-hud';
    root.hidden = true;
    root.tabIndex = 0;
    root.setAttribute('aria-label', 'Controle PTZ da câmera');
    root.innerHTML = `
      <header class="ptz-head">
        <span class="dot" id="ptz-dot"></span><b>PTZ</b><span class="ptz-exp" title="Recurso experimental: compatibilidade depende do modelo, driver e protocolo">experimental</span>
        <select id="ptz-camera" aria-label="Câmera PTZ"></select>
        <span class="grow"></span>
        <button class="ptz-x" id="ptz-close" type="button" aria-label="Fechar PTZ" title="Fechar PTZ">×</button>
      </header>
      <div class="ptz-body">
        <div class="ptz-preview" id="ptz-preview">
          <video id="ptz-video" autoplay playsinline muted></video>
          <canvas id="ptz-digital-cv" width="480" height="270" hidden></canvas>
          <span class="ptz-tag" id="ptz-live-tag">PREVIEW</span>
          <div class="ptz-reticle" aria-hidden="true"></div>
        </div>
        <div class="ptz-state"><b id="ptz-state">Selecione uma câmera</b><span id="ptz-badges"></span></div>
        <div class="ptz-pad" aria-label="Direcional PTZ">
          <span></span><button type="button" data-pan="0" data-tilt="1" aria-label="Inclinar para cima">▲</button><span></span>
          <button type="button" data-pan="-1" data-tilt="0" aria-label="Mover para a esquerda">◀</button><span class="mid">PARAR</span><button type="button" data-pan="1" data-tilt="0" aria-label="Mover para a direita">▶</button>
          <span></span><button type="button" data-pan="0" data-tilt="-1" aria-label="Inclinar para baixo">▼</button><span></span>
        </div>
        <div class="ptz-row" id="ptz-focus-row" hidden><label>Foco</label><button class="ptz-mini" type="button" data-focus="-1" aria-label="Focar para perto">−</button><button class="ptz-mini" type="button" data-focus="1" aria-label="Focar para longe">+</button><button class="ptz-mini" type="button" id="ptz-autofocus">Auto</button><output id="ptz-focus-out">—</output></div>
        <div class="ptz-row"><span class="ptz-mini" style="border:0;background:transparent;color:#8b839b">Zoom</span><button class="ptz-mini" type="button" data-zoom="-1">−</button><input id="ptz-zoom" type="range" min="0" max="1000" step="1" aria-label="Zoom"><output id="ptz-zoom-out">—</output><button class="ptz-mini" type="button" data-zoom="1">+</button></div>
        <div class="ptz-row"><label>Velocidade</label><input id="ptz-speed" type="range" min="0.25" max="2.5" step="0.05" value="1" aria-label="Velocidade"><output id="ptz-speed-out">1.0×</output><button class="ptz-mini" type="button" id="ptz-home" title="Ir para a posição inicial">Home</button><button class="ptz-mini" type="button" id="ptz-stop" title="Parar movimento">Parar</button></div>
        <div class="ptz-presets" id="ptz-presets">
          ${Array.from({ length: 8 }, (_, i) => `<button type="button" data-preset="${i + 1}" title="Clique: ir ao preset · Shift+clique: salvar">${i + 1}</button>`).join('')}
        </div>
        <div class="ptz-preset-actions"><button type="button" id="ptz-preset-save">Salvar preset</button><button type="button" id="ptz-preset-clear">Limpar preset</button><span id="ptz-preset-hint">Escolha um slot 1–8</span></div>
        <div class="ptz-adv" id="ptz-adv" hidden><label class="ptz-adv-check"><input id="ptz-invert-pan" type="checkbox"> Inverter pan</label><label class="ptz-adv-check"><input id="ptz-invert-tilt" type="checkbox"> Inverter tilt</label><label class="ptz-adv-step">Passo <input id="ptz-base-step" type="range" min="1" max="30" step="1"><b id="ptz-step-out">0.6%</b></label><label class="ptz-adv-step">Repetição <input id="ptz-repeat" type="range" min="40" max="250" step="10"><b id="ptz-repeat-out">90 ms</b></label><span class="ptz-adv-hint">Segure <kbd>Alt</kbd> para passo fino</span></div>
      </div>
      <div class="ptz-midi" id="ptz-midi">
        <div class="ptz-midi-head"><select id="ptz-midi-device" aria-label="Controlador MIDI"><option value="">Todos os controladores</option></select><button type="button" id="ptz-midi-on">Ativar MIDI</button></div>
        <div id="ptz-midi-list"></div>
        <p class="ptz-midi-note">Aprenda um fader/knob para pan, tilt ou zoom e um botão/pad para presets, Home ou Parar.</p>
      </div>
      <div class="ptz-onvif" id="ptz-onvif-panel" hidden>
        <div class="ptz-onvif-head"><b>Controle ONVIF</b><span>IP da câmera</span></div>
        <div class="ptz-onvif-grid">
          <label><span>IP / host</span><input id="onvif-host" inputmode="decimal" placeholder="192.168.1.50"></label>
          <label><span>Porta</span><input id="onvif-port" inputmode="numeric" value="80"></label>
          <label><span>Usuário</span><input id="onvif-user" autocomplete="username" placeholder="admin"></label>
          <label><span>Senha</span><input id="onvif-pass" type="password" autocomplete="current-password"></label>
          <label class="ptz-onvif-secure"><span>HTTPS</span><input id="onvif-https" type="checkbox"> <em>aceitar self-signed</em></label>
        </div>
        <div class="ptz-onvif-actions"><button type="button" id="onvif-discover">Buscar câmeras</button><button type="button" id="onvif-test">Testar conexão</button><button type="button" id="onvif-close">Fechar</button><span id="onvif-status"></span></div>
        <div id="onvif-found" class="ptz-onvif-found"></div>
        <label class="ptz-onvif-profile" id="onvif-profile-wrap" hidden><span>Perfil</span><select id="onvif-profile"></select></label>
        <div class="ptz-onvif-actions"><button type="button" id="onvif-save" disabled>Salvar e usar</button></div>
        <p class="ptz-midi-note"><b>Experimental:</b> a câmera precisa estar na mesma rede do PC e aceitar ONVIF. O vídeo USB continua vindo pelo navegador; o controle vai por HTTP/XML. Valide antes de usar ao vivo.</p>
      </div>
      <footer class="ptz-foot">
        <button type="button" id="ptz-arm" aria-pressed="false">Armar teclado</button>
        <button type="button" id="ptz-midi-toggle">MIDI</button>
        <button type="button" id="ptz-digital" hidden>Digital (host)</button>
        <button type="button" id="ptz-onvif" hidden>ONVIF</button>
        <button type="button" id="ptz-recover" hidden>Reconectar</button>
        <button type="button" id="ptz-adv-toggle">Ajustes</button>
        <span class="grow"></span>
        <button type="button" id="ptz-help" title="Atalhos: setas, + −, 1–8, Shift+1–8 salva, Home, Esc para parar">Atalhos</button>
      </footer>`;
    document.body.appendChild(root);
    const back = document.createElement('div');
    back.id = 'ptz-onvif-backdrop';
    back.className = 'ptz-onvif-backdrop';
    back.hidden = true;
    back.addEventListener('click', () => closeOnvifPanel());
    root.appendChild(back);
    sourceSelect = root.querySelector('#ptz-camera');
    video = root.querySelector('#ptz-video');
    stateEl = root.querySelector('#ptz-state');
    zoomEl = root.querySelector('#ptz-zoom');
    speedEl = root.querySelector('#ptz-speed');
    armBtn = root.querySelector('#ptz-arm');
    midiPanel = root.querySelector('#ptz-midi');
    midiList = root.querySelector('#ptz-midi-list');
    midiDevice = root.querySelector('#ptz-midi-device');
    midiStatus = root.querySelector('#ptz-midi-on');
    midiDevice?.addEventListener('change', () => { midi.device = midiDevice.value; });
    bind();
    restoreGeo();
    sourceSelect.addEventListener('change', () => setSource(sourceSelect.value));
    window.addEventListener('keydown', onKey, true);
    observer = new ResizeObserver(saveGeo);
    observer.observe(root);
    renderMidi();
  }

  function restoreGeo() {
    const g = loadJson(GEO_KEY, null);
    if (!g) return;
    const w = Math.max(300, Math.min(g.w || 360, window.innerWidth - 20));
    const h = Math.max(320, Math.min(g.h || 0, window.innerHeight - 20));
    root.style.width = w + 'px';
    if (h) root.style.height = h + 'px';
    const x = clamp(g.x || (window.innerWidth - w - 20), 4, Math.max(4, window.innerWidth - w - 4));
    const y = clamp(g.y || (window.innerHeight - root.offsetHeight - 20), 4, Math.max(4, window.innerHeight - 40));
    root.style.left = x + 'px';
    root.style.top = y + 'px';
    root.style.right = 'auto';
    root.style.bottom = 'auto';
  }

  function cameraOptions(selected) {
    const list = cameras();
    sourceSelect.innerHTML = list.length
      ? list.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.label || s.id}</option>`).join('')
      : '<option value="">Nenhuma câmera local</option>';
    sourceSelect.disabled = !list.length;
    return list;
  }

  function setSource(id) {
    stopMove();
    closeOnvifPanel();
    source = S.sources.get(id) || null;
    sourceId = source?.id || null;
    mode = source?.remoteCam ? 'remote' : source?.ingestKey ? 'ndi' : 'uvc';
    ndiKey = source?.ingestKey || '';
    remoteKey = source?.remoteCam ? (source.ownerId || '') : '';
    remoteSig = '';
    remotePhysical = false;
    digitalOn = false;
    digitalAdjust = null;
    onvifConfig = null;
    onvifOn = false;
    onvifOnline = false;
    onvifLastError = '';
    onvifStatusUnsupported = false;
    nativeHasPanTilt = false;
    stopDigitalPreview();
    ndiSupported = false;
    ndiLoading = false;
    ndiQueued = null;
    ndiCheckAt = 0;
    ndiSeq++;
    track = null;
    caps = {};
    ranges = {};
    lastError = '';
    if (mode === 'remote') {
      const g = S.guests.get(remoteKey);
      caps = { ...(g?.state?.camCaps || {}) };
      for (const a of AXES) ranges[a] = rangeOf(a);
      ranges.focusDistance = rangeOf('focusDistance');
      remotePhysical = !!(ranges.pan || ranges.tilt);
      const ctl = g?.state?.camCtl || {};
      for (const a of AXES) {
        if (!ranges[a]) continue;
        pos[a] = Number.isFinite(+ctl[a]) ? +ctl[a] : a === 'zoom' ? ranges[a].min : (ranges[a].min + ranges[a].max) / 2;
      }
      pos.focus = Number.isFinite(+ctl.focusDistance) ? +ctl.focusDistance : ranges.focusDistance ? (ranges.focusDistance.min + ranges.focusDistance.max) / 2 : 0.5;
    } else if (mode === 'ndi') {
      ndiLoading = true;
      pos = { pan: 0, tilt: 0, zoom: 0.5, focus: 0.5 };
    } else {
      track = source?.stream?.getVideoTracks?.()[0] || null;
      try { caps = track?.getCapabilities?.() || {}; } catch {}
      for (const a of AXES) ranges[a] = rangeOf(a);
      ranges.focusDistance = rangeOf('focusDistance');
      nativeHasPanTilt = !!(ranges.pan || ranges.tilt);
      readSettings();
      pos.focus = Number.isFinite(pos.focus) ? pos.focus : 0.5;
      if (sourceId) {
        onvifConfig = loadOnvifConfig(sourceId);
        if (onvifConfig && !nativeHasPanTilt) {
          mode = 'onvif';
          onvifOn = true;
          caps = { ...ONVIF_CAPS };
          ranges = {};
          for (const a of AXES) ranges[a] = rangeOf(a);
          const pp = onvifConfig.pos || {};
          pos = { pan: Number.isFinite(+pp.pan) ? +pp.pan : 0, tilt: Number.isFinite(+pp.tilt) ? +pp.tilt : 0, zoom: Number.isFinite(+pp.zoom) ? +pp.zoom : 0.5 };
        }
      }
    }
    if (video) {
      video.srcObject = source?.stream || null;
      video.play().catch(() => {});
    }
    renderState();
    renderControls();
    renderPresets();
    renderMidi();
    if (mode === 'ndi' && ndiKey) loadNdiStatus(ndiSeq);
    if (mode === 'remote' && remoteKey) getSig?.()?.send?.({ type: 'control', to: remoteKey, action: 'camera-info' });
  }

  function refreshRemoteState() {
    if (mode !== 'remote' || digitalOn || !source?.remoteCam) return;
    const g = S.guests.get(remoteKey);
    const rawCaps = g?.state?.camCaps || {};
    const rawCtl = g?.state?.camCtl || {};
    const sig = remoteKey + ':' + JSON.stringify(rawCaps) + ':' + JSON.stringify(rawCtl) + ':' + String(g?.state?.camVisible);
    if (sig === remoteSig) return;
    remoteSig = sig;
    caps = { ...rawCaps };
    ranges = {};
    for (const a of AXES) ranges[a] = rangeOf(a);
    for (const a of AXES) {
      if (ranges[a] && Number.isFinite(+rawCtl[a])) pos[a] = +rawCtl[a];
    }
    renderState();
    renderControls();
    if (has('zoom')) updateZoomOut();
  }

  function remoteSend(patch) {
    const sig = getSig?.();
    const g = S.guests.get(remoteKey);
    if (!sig || !g) {
      toast('Câmera remota não está conectada.', 'err');
      return false;
    }
    sig.send({ type: 'control', to: g.id, action: 'camera', data: { patch } });
    g.state.camCtl = { ...(g.state.camCtl || {}), ...patch };
    return true;
  }

  function stopDigitalPreview() {
    if (digitalRaf) cancelAnimationFrame(digitalRaf);
    digitalRaf = 0;
    const cv = root?.querySelector('#ptz-digital-cv');
    if (cv) cv.hidden = true;
  }

  function startDigitalPreview() {
    if (!openState || mode !== 'digital') return;
    const cv = root?.querySelector('#ptz-digital-cv');
    if (!cv) return;
    cv.hidden = false;
    if (digitalRaf) return;
    const tick = () => {
      if (!openState || mode !== 'digital') {
        digitalRaf = 0;
        cv.hidden = true;
        return;
      }
      digitalRaf = requestAnimationFrame(tick);
      const src = source?.el || video;
      const vw = src?.videoWidth || 0;
      const vh = src?.videoHeight || 0;
      const cx = cv.getContext('2d');
      cx.fillStyle = '#000';
      cx.fillRect(0, 0, cv.width, cv.height);
      if (!vw || !vh) return;
      try { drawFramed(cx, src, 0, 0, cv.width, cv.height, vw, vh, digitalAdjust || baseDigitalAdjust()); } catch {}
    };
    digitalRaf = requestAnimationFrame(tick);
  }

  function baseDigitalAdjust() {
    const a = normalizeAdjust(source?.adjust || { fit: 'cover' });
    if (a.zoom < 1) a.zoom = 1;
    return a;
  }

  function readDigitalPos() {
    digitalAdjust = baseDigitalAdjust();
    pos.pan = -digitalAdjust.x;
    pos.tilt = digitalAdjust.y;
    pos.zoom = clamp(digitalAdjust.zoom, 1, 3);
  }

  function enableDigital() {
    if (!source?.remoteCam || !applyAdjust) return;
    digitalOn = true;
    mode = 'digital';
    caps = { ...DIGITAL_CAPS };
    ranges = {};
    for (const a of AXES) ranges[a] = rangeOf(a);
    readDigitalPos();
    renderState();
    renderControls();
    renderPresets();
    startDigitalPreview();
  }

  function disableDigital() {
    if (!digitalOn) return;
    digitalOn = false;
    stopDigitalPreview();
    mode = 'remote';
    caps = { ...(S.guests.get(remoteKey)?.state?.camCaps || {}) };
    ranges = {};
    for (const a of AXES) ranges[a] = rangeOf(a);
    remotePhysical = !!(ranges.pan || ranges.tilt);
    const ctl = S.guests.get(remoteKey)?.state?.camCtl || {};
    for (const a of AXES) {
      if (ranges[a]) pos[a] = Number.isFinite(+ctl[a]) ? +ctl[a] : a === 'zoom' ? ranges[a].min : (ranges[a].min + ranges[a].max) / 2;
    }
    renderState();
    renderControls();
    renderPresets();
  }

  function applyDigital(next) {
    digitalAdjust = normalizeAdjust(next);
    pos.pan = -digitalAdjust.x;
    pos.tilt = digitalAdjust.y;
    pos.zoom = clamp(digitalAdjust.zoom, 1, 3);
    applyAdjust?.(sourceId, digitalAdjust);
    renderState();
    renderControls();
    startDigitalPreview();
  }

  function setDigitalAxis(k, v) {
    const a = { ...(digitalAdjust || baseDigitalAdjust()), crop: { ...(digitalAdjust || baseDigitalAdjust()).crop } };
    if (k === 'pan') a.x = -v;
    else if (k === 'tilt') a.y = v;
    else if (k === 'zoom') a.zoom = v;
    applyDigital(a);
  }

  function loadOnvifConfig(id) {
    try {
      const v = JSON.parse(localStorage.getItem(ONVIF_KEY + id) || 'null');
      if (!v || !v.host || !v.profileToken) return null;
      return v;
    } catch { return null; }
  }

  async function onvifSend(payload) {
    if (!onvifConfig) return false;
    onvifQueued = { ...payload, endpoint: onvifConfig };
    if (onvifBusy) return true;
    onvifBusy = true;
    try {
      while (onvifQueued) {
        const body = onvifQueued;
        onvifQueued = null;
        try {
          const r = await fetch('/api/ptz/onvif/command', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          if (!r.ok) {
            const e = await r.json().catch(() => ({}));
            throw new Error(e.error || 'HTTP ' + r.status);
          }
          onvifOnline = true;
          onvifLastError = '';
        } catch (e) {
          onvifOnline = false;
          onvifLastError = e.message;
          if (Date.now() - onvifErrAt > 3000) {
            onvifErrAt = Date.now();
            toast('ONVIF: ' + e.message, 'err');
          }
        }
      }
    } finally { onvifBusy = false; }
    return true;
  }

  function applyOnvifConfig(cfg) {
    onvifConfig = cfg;
    onvifOn = true;
    mode = 'onvif';
    caps = { ...ONVIF_CAPS };
    ranges = {};
    for (const a of AXES) ranges[a] = rangeOf(a);
    const pp = cfg.pos || {};
    pos = { pan: Number.isFinite(+pp.pan) ? +pp.pan : 0, tilt: Number.isFinite(+pp.tilt) ? +pp.tilt : 0, zoom: Number.isFinite(+pp.zoom) ? +pp.zoom : 0.5 };
    renderState();
    renderControls();
    renderPresets();
  }

  function openOnvifPanel() {
    if (!source || source.remoteCam || source.ingestKey) return;
    const panel = root.querySelector('#ptz-onvif-panel');
    if (!panel) return;
    const cfg = onvifConfig || {};
    root.querySelector('#onvif-host').value = cfg.host || '';
    root.querySelector('#onvif-port').value = cfg.port || 80;
    root.querySelector('#onvif-user').value = cfg.username || '';
    root.querySelector('#onvif-pass').value = cfg.password || '';
    root.querySelector('#onvif-https').checked = !!cfg.https;
    root.querySelector('#onvif-found').innerHTML = '';
    root.querySelector('#onvif-profile-wrap').hidden = true;
    root.querySelector('#onvif-profile').innerHTML = '';
    root.querySelector('#onvif-status').textContent = cfg.profileToken ? `Configuração salva${cfg.authMode ? ' · auth ' + cfg.authMode : ''}. Teste para atualizar o perfil.` : '';
    root.querySelector('#onvif-save').disabled = true;
    onvifDraft = null;
    panel.removeAttribute('hidden');
    panel.classList.add('open');
    const back = document.getElementById('ptz-onvif-backdrop');
    if (back) { back.hidden = false; back.classList.add('open'); }
    root.querySelector('#onvif-host').focus();
  }

  function closeOnvifPanel() {
    const panel = root.querySelector('#ptz-onvif-panel');
    if (panel) { panel.classList.remove('open'); panel.hidden = true; }
    const back = document.getElementById('ptz-onvif-backdrop');
    if (back) { back.classList.remove('open'); back.hidden = true; }
    onvifDraft = null;
  }

  async function testOnvif() {
    const host = root.querySelector('#onvif-host').value.trim();
    const httpsOn = !!root.querySelector('#onvif-https').checked;
    const port = Number(root.querySelector('#onvif-port').value) || (httpsOn ? 443 : 80);
    const username = root.querySelector('#onvif-user').value;
    const password = root.querySelector('#onvif-pass').value;
    const status = root.querySelector('#onvif-status');
    if (!host) { status.textContent = 'Informe o IP da câmera.'; return; }
    status.textContent = 'Testando…';
    root.querySelector('#onvif-save').disabled = true;
    try {
      const r = await fetch('/api/ptz/onvif/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, username, password, https: httpsOn }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      onvifDraft = { ...data, username, password, https: httpsOn };
      const sel = root.querySelector('#onvif-profile');
      sel.innerHTML = (data.profiles || []).map(function (p) { return '<option value="' + p.token + '"' + (p.token === data.profileToken ? ' selected' : '') + '>' + p.name + (p.ptz ? ' · PTZ' : '') + '</option>'; }).join('');
      const wrap = root.querySelector('#onvif-profile-wrap');
      wrap.hidden = !data.profiles?.length;
      root.querySelector('#onvif-save').disabled = !data.profiles?.length;
      status.textContent = ((data.device?.manufacturer || 'ONVIF') + ' ' + (data.device?.model || '') + ' · ' + (data.profiles?.length || 0) + ' perfil(is) · auth ' + data.authMode).trim();
      onvifOnline = true;
      onvifLastError = '';
    } catch (e) {
      onvifDraft = null;
      status.textContent = 'Falhou: ' + e.message;
    }
  }

  async function discoverOnvif() {
    const status = root.querySelector('#onvif-status');
    const box = root.querySelector('#onvif-found');
    status.textContent = 'Buscando câmeras ONVIF na rede…';
    box.innerHTML = '';
    try {
      const r = await fetch('/api/ptz/onvif/discover', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      const list = data.cameras || [];
      if (!list.length) { status.textContent = 'Nenhuma câmera respondeu. Verifique se está na mesma rede.'; return; }
      status.textContent = list.length + ' câmera(s) encontrada(s). Clique para preencher.';
      for (const cam of list) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = (cam.name && cam.name !== cam.host ? cam.name + ' · ' : '') + cam.host + ':' + cam.port + (cam.https ? ' · HTTPS' : '');
        b.onclick = () => {
          root.querySelector('#onvif-host').value = cam.host;
          root.querySelector('#onvif-port').value = cam.port;
          root.querySelector('#onvif-https').checked = !!cam.https;
          status.textContent = 'Câmera selecionada. Preencha usuário/senha e teste.';
          box.innerHTML = '';
          testOnvif();
        };
        box.appendChild(b);
      }
    } catch (e) {
      status.textContent = 'Descoberta falhou: ' + e.message;
    }
  }

  async function onvifRefreshStatus() {
    if (mode !== 'onvif' || !onvifOn || !onvifConfig || onvifStatusBusy || onvifStatusUnsupported) return;
    onvifStatusBusy = true;
    onvifStatusAt = Date.now();
    try {
      const r = await fetch('/api/ptz/onvif/command', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: onvifConfig, action: 'status' }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      onvifOnline = true;
      onvifLastError = '';
      const p = data.position || {};
      if (Number.isFinite(+p.pan)) pos.pan = Math.max(-1, Math.min(1, +p.pan));
      if (Number.isFinite(+p.tilt)) pos.tilt = Math.max(-1, Math.min(1, +p.tilt));
      if (Number.isFinite(+p.zoom)) pos.zoom = Math.max(0, Math.min(1, +p.zoom));
      renderControls();
    } catch (e) {
      if (/not supported|not implemented|ActionNotSupported|Optional Action Not Implemented/i.test(e.message || '')) {
        onvifStatusUnsupported = true;
        onvifOnline = true;
        onvifLastError = '';
      } else {
        onvifOnline = false;
        onvifLastError = e.message;
      }
      renderState();
    } finally {
      onvifStatusBusy = false;
      renderState();
    }
  }

  function saveOnvif() {
    if (!onvifDraft) return;
    const profile = root.querySelector('#onvif-profile').value;
    if (!profile) return;
    const cfg = {
      host: onvifDraft.host, port: onvifDraft.port, username: onvifDraft.username, password: onvifDraft.password,
      https: !!onvifDraft.https, authMode: onvifDraft.authMode || 'digest',
      ptzUrl: onvifDraft.ptzUrl, mediaUrl: onvifDraft.mediaUrl, profileToken: profile,
      profiles: onvifDraft.profiles, device: onvifDraft.device, pos: { pan: 0, tilt: 0, zoom: 0.5 }, nativePresets: {},
    };
    try { localStorage.setItem(ONVIF_KEY + sourceId, JSON.stringify(cfg)); } catch {}
    onvifOnline = true;
    onvifLastError = '';
    applyOnvifConfig(cfg);
    closeOnvifPanel();
    setTimeout(() => onvifRefreshStatus(), 120);
    toast('Controle ONVIF ativado.', 'ok');
  }

  async function loadNdiStatus(seq, { quiet = false } = {}) {
    const key = ndiKey;
    if (!key || seq !== ndiSeq) return;
    ndiCheckAt = Date.now();
    try {
      const r = await fetch('/api/ndi/ptz/' + encodeURIComponent(key), { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(r.status === 404 ? 'sem sessão NDI' : 'HTTP ' + r.status);
      const st = await r.json();
      if (seq !== ndiSeq || source?.ingestKey !== key) return;
      ndiLoading = st.state === 'starting';
      ndiSupported = !!st.supported && st.state === 'ready';
      if (ndiSupported) {
        caps = { ...NDI_CAPS };
        for (const a of AXES) ranges[a] = rangeOf(a);
      } else {
        caps = {};
        ranges = {};
      }
    } catch (e) {
      if (seq !== ndiSeq) return;
      ndiLoading = false;
      ndiSupported = false;
      caps = {};
      ranges = {};
      if (!quiet && !/404|sem sessão/i.test(e.message || '')) lastError = e.message;
    }
    renderState();
    renderControls();
    if (ndiSupported) updateZoomOut();
  }

  function syncCamera() {
    const list = cameras();
    if (!list.some((s) => s.id === sourceId)) setSource(list[0]?.id || '');
    else if (!source?.ingestKey && !source?.remoteCam && source?.stream?.getVideoTracks?.()[0] !== track) setSource(sourceId);
  }

  function renderState() {
    if (!stateEl) return;
    if (!source) {
      stateEl.textContent = 'Nenhuma câmera local';
      root.querySelector('#ptz-badges').innerHTML = '';
      return;
    }
    stateEl.textContent = source.label || source.id;
    let driver;
    if (mode === 'digital') driver = 'Digital (host)';
    else if (mode === 'onvif') driver = onvifOnline ? 'PTZ ONVIF' : 'ONVIF reconectando…';
    else if (mode === 'remote') driver = canMove() ? 'PTZ remoto' : has('zoom') ? 'Zoom remoto' : 'Sem PTZ remoto';
    else if (mode === 'ndi') driver = ndiLoading ? 'NDI PTZ…' : ndiSupported ? 'PTZ NDI' : /^NDI\b/i.test(source.label || '') ? 'Sem PTZ NDI' : 'Entrada sem PTZ';
    else driver = canMove() || has('zoom') ? (canMove() ? 'PTZ USB/UVC' : 'Zoom UVC') : 'Sem PTZ UVC';
    const live = isLive(source.id);
    const tag = root.querySelector('#ptz-live-tag');
    tag.textContent = live ? 'NO AR' : 'PREVIEW';
    tag.classList.toggle('live', live);
    root.querySelector('#ptz-dot').classList.toggle('on', !!source.stream && !source.camOff);
    const guest = source.remoteCam ? S.guests.get(source.ownerId) : null;
    root.querySelector('#ptz-badges').innerHTML = badge(driver, canMove() && (mode !== 'onvif' || onvifOnline) ? 'ok' : 'warn') + (source.camOff ? badge('sem sinal', 'warn') : '') + (guest?.state?.camVisible === false ? badge('aba remota oculta', 'warn') : '') + (lastError || onvifLastError ? badge('erro', 'warn') : '');
    stateEl.title = lastError || driver;
    root.classList.toggle('no-ptz', !canMove() && !has('zoom'));
    const obtn = root.querySelector('#ptz-onvif');
    if (obtn) {
      obtn.hidden = !(!!source && !source.remoteCam && !source.ingestKey && (!nativeHasPanTilt || onvifOn));
      obtn.classList.toggle('on', onvifOn);
      obtn.setAttribute('aria-pressed', String(onvifOn));
      obtn.textContent = onvifOn ? 'ONVIF ligado' : 'ONVIF';
      obtn.title = onvifOn ? 'Reconfigurar o controle ONVIF desta câmera' : 'Configurar controle ONVIF por IP';
    }
    const rbtn = root.querySelector('#ptz-recover');
    if (rbtn) rbtn.hidden = !(mode === 'remote' || mode === 'onvif');
    const dbtn = root.querySelector('#ptz-digital');
    if (dbtn) {
      dbtn.hidden = !(!!source.remoteCam && !remotePhysical);
      dbtn.classList.toggle('on', digitalOn);
      dbtn.setAttribute('aria-pressed', String(digitalOn));
      dbtn.textContent = digitalOn ? 'Digital ligado' : 'Digital (host)';
      dbtn.title = digitalOn ? 'Desligar o recorte digital no host' : 'Ativar pan/tilt/zoom digital no host (sem usar a CPU do celular)';
    }
  }

  async function ndiSend(payload) {
    if (!ndiKey || !ndiSupported) return false;
    ndiQueued = payload;
    if (ndiSendBusy) return true;
    ndiSendBusy = true;
    try {
      while (ndiQueued) {
        const p = ndiQueued;
        ndiQueued = null;
        try {
          const r = await fetch('/api/ndi/ptz/' + encodeURIComponent(ndiKey), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(p),
          });
          if (!r.ok) {
            const b = await r.json().catch(() => ({}));
            throw new Error(b.error || 'HTTP ' + r.status);
          }
        } catch (e) {
          lastError = e.message;
          if (Date.now() - ndiErrAt > 3000) { ndiErrAt = Date.now(); toast('PTZ NDI: ' + e.message, 'err'); }
          renderState();
        }
      }
    } finally {
      ndiSendBusy = false;
    }
    return true;
  }

  function renderControls() {
    if (!root) return;
    if (mode === 'digital') {
      const frow = root.querySelector('#ptz-focus-row');
      if (frow) frow.hidden = true;
      root.querySelectorAll('.ptz-pad button[data-pan]').forEach((b) => (b.disabled = false));
      root.querySelectorAll('[data-zoom]').forEach((b) => (b.disabled = false));
      zoomEl.disabled = false;
      zoomEl.value = String(Math.round(pct('zoom') * 1000));
      root.querySelector('#ptz-zoom-out').textContent = `${Number(pos.zoom).toFixed(1)}×`;
      return;
    }
    root.querySelectorAll('.ptz-pad button[data-pan]').forEach((b) => (b.disabled = !canMove()));
    root.querySelectorAll('[data-zoom]').forEach((b) => (b.disabled = !has('zoom')));
    zoomEl.disabled = !has('zoom');
    renderFocus();
    if (has('zoom')) {
      zoomEl.value = String(Math.round(pct('zoom') * 1000));
      const r = ranges.zoom;
      root.querySelector('#ptz-zoom-out').textContent = r ? `${Number(pos.zoom).toFixed(1)}×` : '—';
    } else {
      root.querySelector('#ptz-zoom-out').textContent = '—';
    }
  }

  function applyFocus(value) {
    const r = rangeOf('focusDistance');
    if (!r) return;
    const v = Math.max(r.min, Math.min(r.max, Number(value)));
    if (!Number.isFinite(v)) return;
    pos.focus = v;
    if (mode === 'remote') {
      remoteSend({ focusDistance: v });
    } else if (mode === 'uvc' && track) {
      track.applyConstraints({ advanced: [{ focusDistance: v }] }).catch((e) => toast('A câmera não aceitou o foco: ' + (e.message || e.name), 'err'));
    }
    renderFocus();
  }

  function focusStep(dir) {
    const r = rangeOf('focusDistance');
    if (!r) return;
    const step = (r.max - r.min) * (altDown ? 0.01 : 0.035);
    applyFocus(pos.focus + dir * step);
  }

  function autoFocus() {
    const modes = Array.isArray(caps.focusMode) ? caps.focusMode : [];
    if (!modes.includes('continuous')) return toast('Esta câmera não informa modo de autofoco.', 'info');
    if (mode === 'remote') remoteSend({ focusMode: 'continuous' });
    else if (mode === 'uvc' && track) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch((e) => toast('Autofoco recusado: ' + (e.message || e.name), 'err'));
    toast('Autofoco solicitado.', 'ok');
  }

  function renderFocus() {
    if (!root) return;
    const row = root.querySelector('#ptz-focus-row');
    if (!row) return;
    const r = rangeOf('focusDistance');
    const modes = Array.isArray(caps.focusMode) ? caps.focusMode : [];
    row.hidden = !r && !modes.length;
    row.querySelectorAll('[data-focus]').forEach((b) => (b.disabled = !r));
    const af = row.querySelector('#ptz-autofocus');
    if (af) af.disabled = !modes.includes('continuous');
    const out = row.querySelector('#ptz-focus-out');
    if (out) out.textContent = r ? `${Math.round(((pos.focus - r.min) / (r.max - r.min)) * 100)}%` : '—';
  }

  function updatePresetSaveUI() {
    const b = root?.querySelector('#ptz-preset-save');
    const c = root?.querySelector('#ptz-preset-clear');
    const hint = root?.querySelector('#ptz-preset-hint');
    if (b) { b.classList.toggle('on', presetSaveMode); b.textContent = presetSaveMode ? 'Escolha o slot…' : 'Salvar preset'; }
    if (c) { c.classList.toggle('on', presetClearMode); c.textContent = presetClearMode ? 'Escolha o slot…' : 'Limpar preset'; }
    if (hint) hint.textContent = presetSaveMode ? 'Clique num número para salvar' : presetClearMode ? 'Clique num número para apagar' : 'Escolha um slot 1–8';
    root?.querySelectorAll('[data-preset]').forEach((x) => x.classList.toggle('saving', presetSaveMode || presetClearMode));
  }

  function renderPresets() {
    if (!root) return;
    const p = presets[sourceId] || {};
    root.querySelectorAll('[data-preset]').forEach((b) => {
      const n = +b.dataset.preset;
      b.classList.toggle('has', !!p[n]);
      b.classList.toggle('active', activePreset === n);
    });
  }

  function updateZoomOut() {
    const out = root?.querySelector('#ptz-zoom-out');
    if (mode === 'digital') {
      if (out) out.textContent = `${Number(pos.zoom).toFixed(1)}×`;
      if (zoomEl) zoomEl.value = String(Math.round(pct('zoom') * 1000));
      return;
    }
    if (out) out.textContent = has('zoom') ? `${Number(pos.zoom).toFixed(1)}×` : '—';
    if (has('zoom')) zoomEl.value = String(Math.round(pct('zoom') * 1000));
  }

  function setAxis(k, value, { quiet = false } = {}) {
    const r = rangeOf(k);
    if (!r) return;
    const v = clamp(Number(value), r.min, r.max);
    if (!Number.isFinite(v)) return;
    pos[k] = v;
    lastError = '';
    if (mode === 'onvif') {
      if (!onvifOn || !onvifConfig) return;
      onvifSend({ action: 'absolute', pan: pos.pan, tilt: pos.tilt, zoom: pos.zoom });
      if (k === 'zoom') updateZoomOut();
      return;
    }
    if (mode === 'digital') {
      setDigitalAxis(k, v);
      if (k === 'zoom') updateZoomOut();
      return;
    }
    if (mode === 'remote') {
      if (!remoteSend({ [k]: v })) return;
      if (k === 'zoom') updateZoomOut();
      return;
    }
    if (mode === 'ndi') {
      if (!ndiSupported) return;
      if (k === 'zoom') ndiSend({ action: 'zoom', value: v });
      else ndiSend({ action: 'pan_tilt', pan: pos.pan, tilt: pos.tilt });
      if (k === 'zoom') updateZoomOut();
      return;
    }
    if (!track) return;
    const patch = { [k]: v };
    track.applyConstraints({ advanced: [patch] }).catch((e) => {
      lastError = e?.message || e?.name || 'ajuste recusado';
      if (!quiet) toast(`A câmera não aceitou ${AXIS_LABEL[k]}: ${lastError}`, 'err');
      renderState();
    });
    if (k === 'zoom') updateZoomOut();
  }

  function step(k, dir) {
    const r = rangeOf(k);
    if (!r) return;
    let d = dir;
    if (k === 'pan' && adv.invertPan) d = -d;
    if (k === 'tilt' && adv.invertTilt) d = -d;
    const speed = Number(speedEl?.value) || 1;
    const base = Math.max(0.001, Math.min(0.03, Number(adv.baseStep) || 0.006));
    const step = (r.max - r.min) * base * speed * (altDown ? 0.25 : 1);
    setAxis(k, pos[k] + d * step);
  }

  function startMove(panDir, tiltDir) {
    stopMove();
    if (!canMove()) return;
    if (mode === 'onvif') {
      if (!onvifOn) return;
      const p = adv.invertPan ? -panDir : panDir;
      const t = adv.invertTilt ? -tiltDir : tiltDir;
      activeMove = { pan: p, tilt: t };
      onvifSend({ action: 'continuous', pan: p, tilt: t, speed: (Number(speedEl?.value) || 1) * (altDown ? 0.35 : 1) });
      return;
    }
    activeMove = { pan: panDir, tilt: tiltDir };
    const tick = () => {
      if (!activeMove) return;
      if (activeMove.pan) step('pan', activeMove.pan);
      if (activeMove.tilt) step('tilt', activeMove.tilt);
    };
    tick();
    moveTimer = setInterval(tick, Math.max(40, Math.min(250, Number(adv.repeatMs) || 90)));
  }

  function stopMove() {
    const wasMoving = !!activeMove;
    activeMove = null;
    if (moveTimer) clearInterval(moveTimer);
    moveTimer = 0;
    if (wasMoving && mode === 'ndi' && ndiSupported) ndiSend({ action: 'stop' });
    if (wasMoving && mode === 'onvif' && onvifOn) onvifSend({ action: 'stop' });
  }

  function moveTo(k, value) {
    const r = rangeOf(k);
    if (!r) return;
    setAxis(k, value);
  }

  function capture() {
    return { pan: pos.pan, tilt: pos.tilt, zoom: pos.zoom, focus: pos.focus, at: Date.now() };
  }

  function presetSave(n) {
    if (!sourceId || (!canMove() && !has('zoom'))) return toast('Esta câmera não expõe PTZ.', 'err');
    if (mode === 'ndi') ndiSend({ action: 'preset_store', preset: n });
    if (mode === 'onvif') saveOnvifPreset(n);
    presets[sourceId] ||= {};
    presets[sourceId][n] = capture();
    activePreset = n;
    savePresets();
    renderPresets();
    toast(`Preset ${n} salvo.`, 'ok');
  }

  async function deletePreset(n) {
    if (!sourceId) return;
    const had = !!presets[sourceId]?.[n];
    if (presets[sourceId]) delete presets[sourceId][n];
    if (activePreset === n) activePreset = null;
    savePresets();
    renderPresets();
    if (mode === 'onvif' && onvifConfig?.nativePresets?.[n]) {
      const token = onvifConfig.nativePresets[n];
      delete onvifConfig.nativePresets[n];
      try { localStorage.setItem(ONVIF_KEY + sourceId, JSON.stringify(onvifConfig)); } catch {}
      onvifSend({ action: 'preset_remove', presetToken: token });
    }
    toast(had ? `Preset ${n} removido.` : `Preset ${n} já estava vazio.`, had ? 'ok' : 'info');
  }

  async function saveOnvifPreset(n) {
    if (!onvifConfig) return;
    try {
      const r = await fetch('/api/ptz/onvif/command', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: onvifConfig, action: 'preset_set', preset: n }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      if (data.presetToken) {
        onvifConfig.nativePresets = { ...(onvifConfig.nativePresets || {}), [n]: data.presetToken };
        try { localStorage.setItem(ONVIF_KEY + sourceId, JSON.stringify(onvifConfig)); } catch {}
      }
    } catch (e) {
      toast('Preset local salvo; a câmera ONVIF recusou o preset: ' + e.message, 'err');
    }
  }

  function presetRecall(n) {
    if (mode === 'onvif' && onvifConfig?.nativePresets?.[n]) {
      onvifSend({ action: 'preset_goto', presetToken: onvifConfig.nativePresets[n] });
      activePreset = n;
      renderPresets();
      const p = presets[sourceId]?.[n];
      if (p) { pos.pan = p.pan; pos.tilt = p.tilt; pos.zoom = p.zoom; renderControls(); }
      toast(`Preset ${n} solicitado à câmera ONVIF.`, 'ok');
      return;
    }
    if (mode === 'ndi') {
      if (!ndiSupported) return;
      ndiSend({ action: 'preset_recall', preset: n, speed: 0.4 });
      toast(`Preset ${n} solicitado à câmera NDI.`, 'ok');
      return;
    }
    const p = presets[sourceId]?.[n];
    if (!p) return toast(`Preset ${n} ainda não foi salvo.`, 'info');
    activePreset = n;
    renderPresets();
    if (canMove()) {
      if (Number.isFinite(p.pan) && has('pan')) setAxis('pan', p.pan);
      if (Number.isFinite(p.tilt) && has('tilt')) setAxis('tilt', p.tilt);
    }
    if (Number.isFinite(p.zoom) && has('zoom')) setAxis('zoom', p.zoom);
    if (Number.isFinite(p.focus) && rangeOf('focusDistance')) applyFocus(p.focus);
    renderPresets();
    toast(`Preset ${n} aplicado.`, 'ok');
  }

  function home() {
    if (mode === 'onvif') {
      if (!onvifOn) return;
      pos = { pan: 0, tilt: 0, zoom: 0.5 };
      onvifSend({ action: 'home' });
      renderControls();
      return;
    }
    if (mode === 'digital') {
      const a = { ...(digitalAdjust || baseDigitalAdjust()), crop: { ...(digitalAdjust || baseDigitalAdjust()).crop } };
      a.x = 0; a.y = 0; a.zoom = 1;
      applyDigital(a);
      return;
    }
    if (mode === 'remote') {
      const patch = {};
      if (has('pan')) patch.pan = (ranges.pan.min + ranges.pan.max) / 2;
      if (has('tilt')) patch.tilt = (ranges.tilt.min + ranges.tilt.max) / 2;
      if (has('zoom')) patch.zoom = ranges.zoom.min;
      if (!Object.keys(patch).length) return;
      if (!remoteSend(patch)) return;
      Object.assign(pos, patch);
      renderControls();
      return;
    }
    if (mode === 'ndi') {
      if (!ndiSupported) return;
      pos = { pan: 0, tilt: 0, zoom: 0.5 };
      ndiSend({ action: 'home' });
      renderControls();
      return;
    }
    if (canMove()) {
      if (has('pan')) moveTo('pan', (ranges.pan.min + ranges.pan.max) / 2);
      if (has('tilt')) moveTo('tilt', (ranges.tilt.min + ranges.tilt.max) / 2);
    }
    if (has('zoom')) moveTo('zoom', ranges.zoom.min);
  }

  function directMove(dx, dy) {
    if (!drag) return;
    if (adv.invertPan) dx = -dx;
    if (adv.invertTilt) dy = -dy;
    const w = drag.w || 1;
    const h = drag.h || 1;
    if (has('pan')) {
      const r = ranges.pan;
      moveTo('pan', drag.pan + (dx / w) * (r.max - r.min) * 1.2);
    }
    if (has('tilt')) {
      const r = ranges.tilt;
      moveTo('tilt', drag.tilt - (dy / h) * (r.max - r.min) * 1.2);
    }
  }

  function toggleArm() {
    armed = !armed;
    armBtn.classList.toggle('on', armed);
    armBtn.setAttribute('aria-pressed', String(armed));
    armBtn.textContent = armed ? 'Teclado armado' : 'Armar teclado';
    if (armed) root?.focus();
  }

  function onKey(e) {
    if (!openState || root.hidden) return;
    if (root.querySelector('#ptz-onvif-panel')?.classList.contains('open')) {
      if (e.key === 'Escape') { closeOnvifPanel(); e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t?.closest?.('input,textarea,select,[contenteditable="true"],.modal-back')) return;
    if (!armed && !root.contains(document.activeElement) && document.activeElement !== root) return;
    const k = e.key;
    const number = /^[1-8]$/.test(k) ? +k : 0;
    let handled = true;
    if (e.shiftKey && number) presetSave(number);
    else if (number) presetRecall(number);
    else if (k === 'ArrowLeft') step('pan', -1);
    else if (k === 'ArrowRight') step('pan', 1);
    else if (k === 'ArrowUp') step('tilt', 1);
    else if (k === 'ArrowDown') step('tilt', -1);
    else if (k === '+' || k === '=') step('zoom', 1);
    else if (k === '-' || k === '_') step('zoom', -1);
    else if (k === 'Home') home();
    else if (k === 'Escape') { stopMove(); toggleArm(); }
    else handled = false;
    if (handled) { e.preventDefault(); e.stopPropagation(); }
  }

  function renderMidi() {
    if (!midiList) return;
    const inputs = midi.access ? [...midi.access.inputs.values()] : [];
    if (midiDevice) {
      const cur = midiDevice.value || '';
      midiDevice.innerHTML = `<option value="">Todos os controladores</option>${inputs.map((i) => `<option value="${i.id}" ${i.id === cur ? 'selected' : ''}>${i.name || i.id}</option>`).join('')}`;
    }
    midiStatus.textContent = midi.access ? (inputs.length ? 'MIDI ativo' : 'Nenhum controlador') : 'Ativar MIDI';
    midiStatus.classList.toggle('on', !!midi.access && inputs.length > 0);
    midiList.innerHTML = MIDI_ACTIONS.map((a) => {
      const m = midi.mappings[a.id];
      const desc = m ? `${m.type === 'note' ? 'Nota' : 'CC'} ${m.number} · ch ${m.channel}` : 'não mapeado';
      const modeSel = a.kind === 'axis' && m ? `<select data-midi-mode="${a.id}" aria-label="Modo do controle ${a.label}"><option value="abs" ${m.mode !== 'rel' ? 'selected' : ''}>Abs</option><option value="rel" ${m.mode === 'rel' ? 'selected' : ''}>Rel</option></select>` : '';
      return `<div class="ptz-midi-row" data-action="${a.id}"><span>${a.label}<br><em>${desc} ${modeSel}</em></span><button type="button" data-midi-learn="${a.id}" class="${midi.learn === a.id ? 'learning' : ''}">${midi.learn === a.id ? 'Aguardando…' : m ? 'Reaprender' : 'Aprender'}</button><button type="button" data-midi-clear="${a.id}" ${m ? '' : 'disabled'}>Limpar</button></div>`;
    }).join('');
    midiList.querySelectorAll('[data-midi-learn]').forEach((b) => (b.onclick = () => {
      if (!midi.access) return toast('Ative o MIDI primeiro.', 'info');
      midi.learn = b.dataset.midiLearn;
      renderMidi();
      toast('Mova o controle MIDI que deseja aprender.', 'info');
    }));
    midiList.querySelectorAll('[data-midi-mode]').forEach((sel) => (sel.onchange = () => {
      const m = midi.mappings[sel.dataset.midiMode];
      if (!m) return;
      m.mode = sel.value === 'rel' ? 'rel' : 'abs';
      saveMidi();
      renderMidi();
    }));
    midiList.querySelectorAll('[data-midi-clear]').forEach((b) => (b.onclick = () => {
      delete midi.mappings[b.dataset.midiClear];
      saveMidi();
      midi.learn = null;
      renderMidi();
      toast('Mapeamento MIDI removido.', 'ok');
    }));
  }

  async function startMidi() {
    if (!navigator.requestMIDIAccess) return toast('Este navegador não suporta Web MIDI.', 'err');
    try {
      midi.access = await navigator.requestMIDIAccess({ sysex: false });
      midi.access.onstatechange = () => { bindMidi(); renderMidi(); };
      bindMidi();
      renderMidi();
      toast('MIDI ativado.', 'ok');
    } catch (e) {
      toast(`MIDI não autorizado: ${e.message}`, 'err');
    }
  }

  function bindMidi() {
    if (!midi.access) return;
    for (const input of midi.access.inputs.values()) {
      if (input._cdPtzBound) continue;
      input._cdPtzBound = true;
      input.onmidimessage = onMidi;
    }
  }

  function onMidi(e) {
    if (!openState || root.hidden) return;
    if (midi.device && e.target.id !== midi.device) return;
    const d = e.data;
    if (!d || d.length < 2) return;
    const type = d[0] & 0xf0;
    const channel = (d[0] & 0x0f) + 1;
    const number = d[1];
    const value = d[2] ?? 0;
    const kind = type === 0x90 && value > 0 ? 'note' : type === 0xb0 ? 'cc' : '';
    if (!kind) return;
    if (midi.learn) {
      const prev = midi.mappings[midi.learn];
      midi.mappings[midi.learn] = { device: e.target.id, channel, type: kind, number, mode: prev?.mode === 'rel' ? 'rel' : 'abs' };
      midi.learn = null;
      saveMidi();
      renderMidi();
      toast('Controle MIDI aprendido.', 'ok');
      return;
    }
    const action = Object.entries(midi.mappings).find(([, m]) => m.device === e.target.id && m.channel === channel && m.type === kind && m.number === number)?.[0];
    if (!action) return;
    if (action === 'stop') return stopMove();
    if (action === 'home') return home();
    if (action.startsWith('preset')) return presetRecall(+action.slice(6));
    if (AXES.includes(action) && rangeOf(action)) {
      const r = rangeOf(action);
      const mode = midi.mappings[action]?.mode;
      if (mode === 'rel') {
        const delta = value < 64 ? value : value - 128;
        if (!delta) return;
        setAxis(action, pos[action] + (delta / 64) * (r.max - r.min) * 0.08);
      } else {
        setAxis(action, r.min + (value / 127) * (r.max - r.min));
      }
    }
  }

  function saveAdv() {
    try { localStorage.setItem('castdeck.ptz.adv', JSON.stringify(adv)); } catch {}
  }

  function updateAdvUI() {
    const ip = root?.querySelector('#ptz-invert-pan');
    const it = root?.querySelector('#ptz-invert-tilt');
    const bs = root?.querySelector('#ptz-base-step');
    const rp = root?.querySelector('#ptz-repeat');
    if (ip) ip.checked = !!adv.invertPan;
    if (it) it.checked = !!adv.invertTilt;
    if (bs) bs.value = String(Math.round((Number(adv.baseStep) || 0.006) * 1000));
    if (rp) rp.value = String(Number(adv.repeatMs) || 90);
    const bo = root?.querySelector('#ptz-step-out');
    const ro = root?.querySelector('#ptz-repeat-out');
    if (bo) bo.textContent = ((Number(adv.baseStep) || 0.006) * 100).toFixed(1) + '%';
    if (ro) ro.textContent = String(Number(adv.repeatMs) || 90) + ' ms';
  }

  function recoverCamera() {
    if (!source) return;
    if (mode === 'remote' && source.ownerId) {
      getSig?.()?.send?.({ type: 'control', to: source.ownerId, action: 'reconnect' });
      toast('Solicitando reconexão da câmera remota…', 'info');
    } else if (mode === 'onvif') {
      onvifStatusAt = 0;
      onvifRefreshStatus();
      toast('Verificando controle ONVIF…', 'info');
    }
  }

  function bind() {
    root.querySelector('#ptz-close').onclick = close;
    root.querySelector('#ptz-stop').onclick = stopMove;
    root.querySelector('#ptz-home').onclick = home;
    root.querySelector('#ptz-arm').onclick = toggleArm;
    root.querySelector('#ptz-help').onclick = () => toast('Setas: pan/tilt · + −: zoom · 1–8: preset · Shift+1–8: salvar · Home · Esc: parar', 'info');
    root.querySelector('#ptz-midi-toggle').onclick = () => midiPanel.classList.toggle('open');
    root.querySelector('#ptz-midi-on').onclick = () => startMidi();
    root.querySelector('#ptz-onvif').onclick = () => openOnvifPanel();
    root.querySelector('#ptz-recover').onclick = () => recoverCamera();
    root.querySelector('#ptz-adv-toggle').onclick = () => root.querySelector('#ptz-adv').toggleAttribute('hidden');
    root.querySelector('#ptz-invert-pan').onchange = (e) => { adv.invertPan = e.target.checked; saveAdv(); };
    root.querySelector('#ptz-invert-tilt').onchange = (e) => { adv.invertTilt = e.target.checked; saveAdv(); };
    root.querySelector('#ptz-base-step').oninput = (e) => { adv.baseStep = Math.max(0.001, Math.min(0.03, +e.target.value / 1000)); updateAdvUI(); saveAdv(); };
    root.querySelector('#ptz-repeat').oninput = (e) => { adv.repeatMs = Math.max(40, Math.min(250, +e.target.value)); updateAdvUI(); saveAdv(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Alt') altDown = true; }, true);
    document.addEventListener('keyup', (e) => { if (e.key === 'Alt') altDown = false; }, true);
    root.querySelector('#onvif-test').onclick = () => testOnvif();
    root.querySelector('#onvif-discover').onclick = () => discoverOnvif();
    root.querySelector('#onvif-https').onchange = () => {
      const p = root.querySelector('#onvif-port');
      if (root.querySelector('#onvif-https').checked && (p.value === '80' || !p.value)) p.value = 443;
      else if (!root.querySelector('#onvif-https').checked && p.value === '443') p.value = 80;
    };
    root.querySelector('#onvif-save').onclick = () => saveOnvif();
    root.querySelector('#onvif-close').onclick = () => closeOnvifPanel();
    root.querySelector('#ptz-digital').onclick = () => (digitalOn ? disableDigital() : enableDigital());
    midiDevice.onchange = () => { midi.device = midiDevice.value; };
    speedEl.oninput = () => { root.querySelector('#ptz-speed-out').textContent = `${Number(speedEl.value).toFixed(1)}×`; };
    zoomEl.oninput = () => { if (has('zoom')) setAxis('zoom', ranges.zoom.min + (Number(zoomEl.value) / 1000) * (ranges.zoom.max - ranges.zoom.min)); };
    root.querySelectorAll('[data-zoom]').forEach((b) => (b.onclick = () => step('zoom', +b.dataset.zoom)));
    root.querySelectorAll('[data-focus]').forEach((b) => (b.onclick = () => focusStep(+b.dataset.focus)));
    root.querySelector('#ptz-autofocus').onclick = () => autoFocus();
    root.querySelectorAll('.ptz-pad button[data-pan]').forEach((b) => {
      const start = (e) => { e.preventDefault(); startMove(+b.dataset.pan, +b.dataset.tilt); };
      const end = () => stopMove();
      b.addEventListener('pointerdown', start);
      b.addEventListener('pointerup', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('pointerleave', end);
      window.addEventListener('blur', end);
    });
    root.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = (e) => {
      const n = +b.dataset.preset;
      if (presetClearMode) {
        presetClearMode = false;
        updatePresetSaveUI();
        deletePreset(n);
      } else if (presetSaveMode) {
        presetSaveMode = false;
        updatePresetSaveUI();
        presetSave(n);
      } else if (e.shiftKey) presetSave(n);
      else presetRecall(n);
    }));
    root.querySelector('#ptz-preset-save').onclick = () => {
      presetSaveMode = !presetSaveMode;
      if (presetSaveMode) presetClearMode = false;
      updatePresetSaveUI();
    };
    root.querySelector('#ptz-preset-clear').onclick = () => {
      presetClearMode = !presetClearMode;
      if (presetClearMode) presetSaveMode = false;
      updatePresetSaveUI();
    };
    const pv = root.querySelector('#ptz-preview');
    pv.addEventListener('pointerdown', (e) => {
      if (!canMove() || e.button !== 0) return;
      try { pv.setPointerCapture?.(e.pointerId); } catch {}
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: pos.pan, tilt: pos.tilt, w: pv.clientWidth, h: pv.clientHeight };
      e.preventDefault();
    });
    pv.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      directMove(e.clientX - drag.x, e.clientY - drag.y);
    });
    const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    pv.addEventListener('pointerup', endDrag);
    pv.addEventListener('pointercancel', endDrag);
    pv.addEventListener('lostpointercapture', () => (drag = null));
    pv.addEventListener('dblclick', () => home());
    pv.addEventListener('wheel', (e) => {
      if (!has('zoom')) return;
      e.preventDefault();
      const r = ranges.zoom;
      moveTo('zoom', pos.zoom - Math.sign(e.deltaY) * (r.max - r.min) * 0.03);
    }, { passive: false });
    const head = root.querySelector('.ptz-head');
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button,select') || e.button !== 0) return;
      const r = root.getBoundingClientRect();
      const start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
      head.setPointerCapture?.(e.pointerId);
      const move = (ev) => {
        if (ev.pointerId !== e.pointerId) return;
        const x = clamp(start.left + ev.clientX - start.x, 0, window.innerWidth - root.offsetWidth);
        const y = clamp(start.top + ev.clientY - start.y, 0, window.innerHeight - 40);
        root.style.left = x + 'px';
        root.style.top = y + 'px';
        root.style.right = 'auto';
        root.style.bottom = 'auto';
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); saveGeo(); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    sourceSelect.onchange = () => setSource(sourceSelect.value);
    const tick = setInterval(() => {
      if (!openState) return;
      const list = cameras();
      const sig = list.map((s) => s.id + ':' + (s.stream ? 1 : 0) + ':' + (s.label || '')).join('|');
      if (sig !== lastSignature) {
        lastSignature = sig;
        const cur = sourceId;
        cameraOptions(cur);
        if (!list.some((s) => s.id === cur)) setSource(list[0]?.id || '');
      }
      if (mode === 'remote') refreshRemoteState();
      if (mode === 'onvif' && Date.now() - onvifStatusAt > 2500) onvifRefreshStatus();
      if (source?.ingestKey && Date.now() - ndiCheckAt > 2500) loadNdiStatus(ndiSeq, { quiet: true });
      if (source && !source.ingestKey && !source.remoteCam && source.stream?.getVideoTracks?.()[0] !== track) setSource(sourceId);
    }, 1200);
    root._ptzTimer = tick;
  }

  function open() {
    mount();
    openState = true;
    root.hidden = false;
    lastSignature = '';
    const list = cameraOptions(sourceId || '');
    setSource(list.some((s) => s.id === sourceId) ? sourceId : list[0]?.id || '');
    root.focus();
    renderMidi();
  }

  function close() {
    stopMove();
    stopDigitalPreview();
    closeOnvifPanel();
    closeMidiLearn?.();
    if (root) root.hidden = true;
    openState = false;
  }

  function closeMidiLearn() {
    if (midi.learn) { midi.learn = null; renderMidi(); }
  }

  return { mount, open, close, refresh: syncCamera };
}
