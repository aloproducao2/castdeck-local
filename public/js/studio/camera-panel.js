// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Painel "Câmeras" (broadcast): trilho de câmeras colapsável, preview grande, seções de ajuste
// colapsáveis e sem rolagem na janela. Celulares recebem os ajustes por signaling ('camera').
import { esc, icons, toast } from '../ui.js';

const LABELS = {
  zoom: ['Zoom', (v) => `${Number(v).toFixed(1)}×`],
  focusDistance: ['Distância', (v) => `${Math.round(Number(v) * 100)}%`],
  exposureCompensation: ['EV', (v) => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}`],
  exposureTime: ['Tempo', (v) => `${Number(v).toFixed(3)}s`],
  iso: ['ISO', (v) => String(Math.round(Number(v)))],
  colorTemperature: ['Temperatura', (v) => `${Math.round(Number(v))}K`],
  brightness: ['Brilho', (v) => String(Math.round(Number(v)))],
  contrast: ['Contraste', (v) => String(Math.round(Number(v)))],
  saturation: ['Saturação', (v) => String(Math.round(Number(v)))],
  sharpness: ['Nitidez', (v) => String(Math.round(Number(v)))],
};
const MODE_LABELS = {
  focusMode: ['Foco', { continuous: 'Auto', manual: 'Manual', 'single-shot': 'Single' }],
  exposureMode: ['Exposição', { continuous: 'Auto', manual: 'Manual' }],
  whiteBalanceMode: ['Balanço', { continuous: 'Auto', manual: 'Manual' }],
};
const RANGE_TITLES = { focusDistance: 'Distância', exposureCompensation: 'EV', exposureTime: 'Tempo', iso: 'ISO', colorTemperature: 'Temp.' };
const isRange = (c) => c && typeof c === 'object' && Number.isFinite(c.min) && Number.isFinite(c.max) && c.max > c.min;
const val = (v, c) => (Number.isFinite(+v) ? +v : isRange(c) ? c.min : 0);

export function createCameraPanel({ S, getSig, modal, getDevices, getInterface, onVideoDevice, onAudioDevice, onAddCamera }) {
  let open = false;
  let panel = null;
  let panelClose = null;
  let activeId = null;
  let signature = '';
  let devices = { cams: [], mics: [] };
  let devicesLoaded = false;
  let devicesLoading = false;
  const capsRequested = new Set();
  const localCtl = new Map();

  function trackOf(s) {
    return s?.stream?.getVideoTracks?.()[0] || null;
  }
  function capsOf(s) {
    if (s.remoteCam) return S.guests.get(s.ownerId)?.state?.camCaps || {};
    try { return trackOf(s)?.getCapabilities?.() || {}; } catch { return {}; }
  }
  function ctlOf(s) {
    if (s.remoteCam) return S.guests.get(s.ownerId)?.state?.camCtl || {};
    try { return { ...(trackOf(s)?.getSettings?.() || {}), ...(localCtl.get(s.id) || {}) }; } catch { return localCtl.get(s.id) || {}; }
  }
  function cameras() {
    return [...S.sources.values()]
      .filter((s) => s.kind === 'camera' && (s.stream || s.remoteCam))
      .sort((a, b) => (b.remoteCam ? 1 : 0) - (a.remoteCam ? 1 : 0));
  }
  function sigOf() {
    return getSig?.() || null;
  }
  function active(list) {
    if (!list.length) return null;
    if (!list.some((s) => s.id === activeId)) activeId = list[0].id;
    return list.find((s) => s.id === activeId) || list[0];
  }
  function labelOf(s) {
    return s.label || S.guests.get(s.ownerId)?.name || 'Câmera';
  }
  function modeValue(caps, ctl, k) {
    const modes = Array.isArray(caps[k]) ? caps[k] : [];
    return typeof ctl[k] === 'string' && modes.includes(ctl[k]) ? ctl[k] : modes[0];
  }
  function modeName(k, v) {
    return MODE_LABELS[k]?.[1]?.[v] || v;
  }

  function rangeHTML(s, caps, ctl, k, compact = false) {
    const c = caps[k];
    if (!isRange(c)) return '';
    const [label, fmt] = LABELS[k] || [k, String];
    const v = Math.max(c.min, Math.min(c.max, val(ctl[k], c)));
    const step = Number.isFinite(c.step) && c.step > 0 ? c.step : (c.max - c.min) / 100;
    return `<label class="hcam-ctl ${compact ? 'compact' : ''}" data-ctl="${k}">
      <span class="hcam-lbl">${RANGE_TITLES[k] || label}<b data-out="${esc(s.id)}|${k}">${fmt(v)}</b></span>
      <input type="range" data-sid="${esc(s.id)}" data-k="${k}" min="${c.min}" max="${c.max}" step="${step}" value="${v}" aria-label="${label}">
    </label>`;
  }
  function modeHTML(s, caps, ctl, k) {
    const modes = Array.isArray(caps[k]) ? caps[k] : [];
    if (modes.length < 2) return '';
    const cur = modeValue(caps, ctl, k);
    const [label] = MODE_LABELS[k] || [k];
    return `<div class="hcam-ctl" data-mode-ctl="${k}"><span class="hcam-lbl">${label}</span>
      <div class="hcam-seg" data-sid="${esc(s.id)}" data-k="${k}">
        ${modes.map((m) => `<button type="button" data-v="${esc(m)}" class="${m === cur ? 'active' : ''}">${esc(modeName(k, m))}</button>`).join('')}
      </div></div>`;
  }
  function section(id, title, summary, body, isOpen) {
    return `<details class="hcam-sec" data-sec="${id}" ${isOpen ? 'open' : ''}>
      <summary><span>${title}</span><small data-sum="${id}">${summary}</small><i></i></summary>
      <div class="hcam-sec-body">${body}</div>
    </details>`;
  }
  function controlsHTML(s) {
    const caps = capsOf(s);
    const ctl = ctlOf(s);
    if (!Object.keys(caps).length) {
      return s.remoteCam
        ? `<div class="hcam-empty">A câmera ainda não informou os controles disponíveis.
            <button type="button" class="btn sm" data-info="${esc(s.ownerId)}">Pedir controles</button></div>`
        : `<div class="hcam-empty">Esta câmera não expõe ajustes manuais pelo navegador.</div>`;
    }
    const lens = `<div class="hcam-grid2">${rangeHTML(s, caps, ctl, 'zoom')}${modeHTML(s, caps, ctl, 'focusMode')}${rangeHTML(s, caps, ctl, 'focusDistance')}</div>`;
    const exposure = `<div class="hcam-grid2">${modeHTML(s, caps, ctl, 'exposureMode')}${rangeHTML(s, caps, ctl, 'exposureCompensation')}${rangeHTML(s, caps, ctl, 'exposureTime')}${rangeHTML(s, caps, ctl, 'iso')}</div>`;
    const color = `<div class="hcam-grid2">${modeHTML(s, caps, ctl, 'whiteBalanceMode')}${rangeHTML(s, caps, ctl, 'colorTemperature')}${rangeHTML(s, caps, ctl, 'brightness')}${rangeHTML(s, caps, ctl, 'contrast')}${rangeHTML(s, caps, ctl, 'saturation')}${rangeHTML(s, caps, ctl, 'sharpness')}</div>`;
    const lensSum = [caps.zoom ? `zoom ${LABELS.zoom[1](val(ctl.zoom, caps.zoom))}` : '', caps.focusDistance ? `foco ${modeName('focusMode', modeValue(caps, ctl, 'focusMode'))}` : ''].filter(Boolean).join(' · ') || 'sem ajustes';
    const expSum = [caps.exposureCompensation ? `${LABELS.exposureCompensation[1](val(ctl.exposureCompensation, caps.exposureCompensation))} EV` : '', caps.iso ? `ISO ${Math.round(val(ctl.iso, caps.iso))}` : ''].filter(Boolean).join(' · ') || 'sem ajustes';
    const colSum = [caps.colorTemperature ? LABELS.colorTemperature[1](val(ctl.colorTemperature, caps.colorTemperature)) : '', caps.whiteBalanceMode ? modeName('whiteBalanceMode', modeValue(caps, ctl, 'whiteBalanceMode')) : ''].filter(Boolean).join(' · ') || 'sem ajustes';
    // As três seções nascem abertas para o painel já mostrar o console inteiro; continuam colapsáveis.
    return section('lens', 'Lente', lensSum, lens, true)
      + section('exposure', 'Exposição', expSum, exposure, true)
      + section('color', 'Cor e imagem', colSum, color, true);
  }
  function isLocalIO(s) {
    return !s.remoteCam && !s.ingest && (s.id === 'host:cam' || s.extraCam);
  }
  function optionsHTML(list, cur, autoLabel) {
    const seen = new Set();
    const rows = [`<option value="" ${!cur ? 'selected' : ''}>${esc(autoLabel)}</option>`];
    for (const [i, d] of list.entries()) {
      const id = d.deviceId || '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const label = d.label || `Dispositivo ${i + 1}`;
      rows.push(`<option value="${esc(id)}" ${id === cur ? 'selected' : ''}>${esc(label)}</option>`);
    }
    if (cur && !seen.has(cur)) rows.push(`<option value="${esc(cur)}" selected>Dispositivo atual</option>`);
    return rows.join('');
  }
  function remoteIO(s) {
    const g = S.guests.get(s.ownerId);
    const cams = (g?.state?.camVideoDevices || []).map((d) => ({ deviceId: d.id, label: d.label }));
    const mics = (g?.state?.camAudioDevices || []).map((d) => ({ deviceId: d.id, label: d.label }));
    return { cams, mics, videoId: g?.state?.camVideoId || '', audioId: g?.state?.camAudioId || '' };
  }
  // Se o primeiro state chegou antes da câmera abrir, pede os controles uma vez; no Android isso
  // evita abrir o painel com “sem ajustes” até o operador tocar em “Pedir controles”.
  function requestRemoteCaps(s) {
    if (!s?.remoteCam || !s.ownerId) return;
    const g = S.guests.get(s.ownerId);
    if (g?.state?.camCaps && Object.keys(g.state.camCaps).length) {
      capsRequested.delete(s.ownerId);
      return;
    }
    if (capsRequested.has(s.ownerId)) return;
    capsRequested.add(s.ownerId);
    const sig = sigOf();
    if (sig) sig.send({ type: 'control', to: s.ownerId, action: 'camera-info' });
    setTimeout(() => capsRequested.delete(s.ownerId), 4000);
  }

  function interfaceHTML(s) {
    if (s.remoteCam) {
      const r = remoteIO(s);
      if (!r.cams.length && !r.mics.length) return `<div class="hcam-io"><div class="hcam-io-loading">Aguardando o celular informar as interfaces de câmera e microfone…</div></div>`;
      return `<div class="hcam-io">
        <label class="hcam-io-field"><span>Interface de vídeo</span><select data-io-video="${esc(s.id)}">${optionsHTML(r.cams, r.videoId, 'Automática')}</select></label>
        <label class="hcam-io-field"><span>Interface de áudio</span><select data-io-audio="${esc(s.id)}">${optionsHTML(r.mics, r.audioId, 'Padrão do celular')}</select></label>
      </div>`;
    }
    if (!isLocalIO(s)) return '';
    if (!devicesLoaded) return `<div class="hcam-io"><div class="hcam-io-loading">Carregando interfaces de vídeo e áudio…</div></div>`;
    const cur = getInterface?.(s.id) || {};
    const host = s.id === 'host:cam';
    return `<div class="hcam-io">
      <label class="hcam-io-field"><span>Interface de vídeo</span><select data-io-video="${esc(s.id)}">${optionsHTML(devices.cams, cur.videoId || '', 'Automática')}</select></label>
      <label class="hcam-io-field"><span>Interface de áudio</span><select data-io-audio="${esc(s.id)}">${optionsHTML(devices.mics, cur.audioId || '', host ? 'Padrão do sistema' : 'Sem áudio')}</select></label>
    </div>`;
  }
  async function loadDevices() {
    if (!getDevices || devicesLoading) return;
    devicesLoading = true;
    try {
      const d = await getDevices();
      devices = { cams: Array.isArray(d?.cams) ? d.cams : [], mics: Array.isArray(d?.mics) ? d.mics : [] };
      devicesLoaded = true;
    } catch {
      devicesLoaded = true;
    } finally {
      devicesLoading = false;
    }
    if (open && panel) paint();
  }
  function ioSig(s) {
    if (!s.remoteCam) return '';
    const r = remoteIO(s);
    return JSON.stringify({ v: r.cams, a: r.mics, vi: r.videoId, ai: r.audioId });
  }
  function tallyOf(s) {
    if (S.take === s.id) return '<em class="hcam-tally pgm">PGM</em>';
    if (S.pvw === s.id) return '<em class="hcam-tally pvw">PVW</em>';
    return '';
  }
  function tabHTML(s, selected) {
    const ready = !!trackOf(s);
    return `<div class="hcam-tab ${selected ? 'active' : ''}" role="tab" tabindex="0" aria-selected="${selected}" data-tab="${esc(s.id)}">
      <span class="hcam-tab-pv"><video data-tab-pv="${esc(s.id)}" autoplay playsinline muted></video>${ready ? '' : '<i>sem sinal</i>'}</span>
      <span class="hcam-tab-tx"><b>${esc(labelOf(s))}</b><small>${s.remoteCam ? 'Celular/rede' : s.ownerId === 'host' ? 'Este PC' : 'Câmera extra'}</small></span>
      ${tallyOf(s)}
    </div>`;
  }
  function intercomHTML(s) {
    if (!s.remoteCam || !S.guests.get(s.ownerId)?.cam) return '';
    const ic = window.__castdeck?.intercom;
    const listening = ic?.isListening(s.ownerId) ?? true;
    const talking = ic?.isTalking(s.ownerId) ?? false;
    return `<div class="hcam-ic">
      <div class="hcam-ic-head"><span class="hcam-ic-dot"></span><b>INTERCOM</b><small>Diretor nesta câmera</small></div>
      <div class="hcam-ic-row">
        <button type="button" class="hcam-ic-btn ${listening ? 'on' : ''}" data-hcam-ic-listen="${esc(s.ownerId)}">${listening ? 'Ouvindo diretor' : 'Ouvir diretor'}</button>
        <button type="button" class="hcam-ic-btn hcam-ic-ptt ${talking ? 'on' : ''}" data-hcam-ic-ptt="${esc(s.ownerId)}">PTT diretor</button>
        <button type="button" class="hcam-ic-btn ghost" data-hcam-ic-link="1">Link/QR</button>
      </div>
    </div>`;
  }
  function mainHTML(s) {
    const ready = !!trackOf(s);
    const caps = capsOf(s);
    const ctl = ctlOf(s);
    return `<div class="hcam-stage">
        <video data-main-pv="${esc(s.id)}" autoplay playsinline muted></video>
        ${ready ? '' : '<span class="hcam-nosignal">Sem sinal</span>'}
        <div class="hcam-stage-hud"><b>${esc(labelOf(s))}</b><span>${s.remoteCam ? 'Câmera remota' : 'Câmera local'}</span>${tallyOf(s)}</div>
      </div>
      ${interfaceHTML(s)}
      ${intercomHTML(s)}
      <div class="hcam-controls" id="hcam-controls">${controlsHTML(s)}</div>
      <div class="hcam-actions">
        ${caps.torch === true ? `<button type="button" class="hcam-torch ${ctl.torch ? 'on' : ''}" data-sid="${esc(s.id)}" data-torch="1"><span class="hcam-torch-dot"></span><span>Lanterna</span><i>${ctl.torch ? 'Ligada' : 'Desligada'}</i></button>` : ''}
        <button type="button" class="btn sm hcam-reset" data-reset="${esc(s.id)}">Restaurar automático</button>
      </div>`;
  }
  function paint() {
    if (!panel) return;
    const list = cameras();
    const cur = active(list);
    if (cur) requestRemoteCaps(cur);
    panel.querySelector('#hcam-tabs').innerHTML = list.map((s) => tabHTML(s, s === cur)).join('');
    panel.querySelector('#hcam-main').innerHTML = cur
      ? mainHTML(cur)
      : `<div class="hcam-all-empty">
          <span class="hcam-empty-ico">${icons.cam}</span>
          <b>Nenhuma câmera no estúdio</b>
          <p>Adicione uma webcam, uma placa de captura ou um celular pelo QR Code.</p>
          <button type="button" class="btn primary" data-add-cam>＋ Adicionar câmera</button>
        </div>`;
    for (const v of panel.querySelectorAll('video[data-tab-pv], video[data-main-pv]')) {
      const s = S.sources.get(v.dataset.tabPv || v.dataset.mainPv);
      if (s?.stream) {
        v.srcObject = s.stream;
        v.play().catch(() => {});
      }
    }
    bind();
    signature = list
      .map((s) => `${s.id}:${JSON.stringify(capsOf(s))}:${trackOf(s) ? '1' : '0'}:${ioSig(s)}`)
      .join('|');
    const n = list.length;
    const c = panel.querySelector('#hcam-count');
    if (c) c.textContent = `${n} câmera${n === 1 ? '' : 's'}`;
  }
  function fmtOut(sid, k, v) {
    const s = S.sources.get(sid);
    const cap = s ? capsOf(s)?.[k] : null;
    const fmt = LABELS[k]?.[1] || String;
    const el = [...(panel?.querySelectorAll('[data-out]') || [])].find((n) => n.dataset.out === `${sid}|${k}`);
    if (el) el.textContent = fmt(val(v, cap));
  }
  function summaryOf(s, sec) {
    const caps = capsOf(s);
    const ctl = ctlOf(s);
    if (sec === 'lens') return [caps.zoom ? `zoom ${LABELS.zoom[1](val(ctl.zoom, caps.zoom))}` : '', caps.focusMode ? modeName('focusMode', modeValue(caps, ctl, 'focusMode')) : ''].filter(Boolean).join(' · ') || 'sem ajustes';
    if (sec === 'exposure') return [caps.exposureCompensation ? `${LABELS.exposureCompensation[1](val(ctl.exposureCompensation, caps.exposureCompensation))} EV` : '', caps.iso ? `ISO ${Math.round(val(ctl.iso, caps.iso))}` : ''].filter(Boolean).join(' · ') || 'sem ajustes';
    return [caps.colorTemperature ? LABELS.colorTemperature[1](val(ctl.colorTemperature, caps.colorTemperature)) : '', caps.whiteBalanceMode ? modeName('whiteBalanceMode', modeValue(caps, ctl, 'whiteBalanceMode')) : ''].filter(Boolean).join(' · ') || 'sem ajustes';
  }
  function updateSummary(s, sec) {
    const el = panel?.querySelector(`[data-sum="${sec}"]`);
    if (el && s) el.textContent = summaryOf(s, sec);
  }
  async function applyLocal(s, patch) {
    const t = trackOf(s);
    if (!t) return;
    if (patch.reset) {
      const caps = capsOf(s);
      patch = {};
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) patch.focusMode = 'continuous';
      if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) patch.exposureMode = 'continuous';
      if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) patch.whiteBalanceMode = 'continuous';
      if (isRange(caps.zoom)) patch.zoom = caps.zoom.min;
      if (isRange(caps.exposureCompensation)) patch.exposureCompensation = Math.max(caps.exposureCompensation.min, Math.min(caps.exposureCompensation.max, 0));
      if (caps.torch === true) patch.torch = false;
      localCtl.set(s.id, {});
    } else {
      localCtl.set(s.id, { ...(localCtl.get(s.id) || {}), ...patch });
    }
    try { await t.applyConstraints({ advanced: [patch] }); } catch (e) { toast('A câmera não aceitou esse ajuste: ' + (e.message || e.name), 'err'); }
    if (patch.reset) setTimeout(() => refresh(true), 120);
  }
  function applyRemote(s, patch) {
    const g = S.guests.get(s.ownerId);
    const sig = sigOf();
    if (!g || !sig) { toast('Câmera remota não está conectada.', 'err'); return; }
    sig.send({ type: 'control', to: g.id, action: 'camera', data: patch.reset ? { reset: true } : { patch } });
    if (patch.reset) g.state.camCtl = {};
    else g.state.camCtl = { ...(g.state.camCtl || {}), ...patch };
  }
  function apply(s, patch) {
    if (!s) return;
    if (s.remoteCam) applyRemote(s, patch);
    else applyLocal(s, patch);
  }
  function setModeUI(s, k, v) {
    const seg = [...(panel?.querySelectorAll('.hcam-seg') || [])].find((n) => n.dataset.sid === s.id && n.dataset.k === k);
    if (!seg) return;
    for (const b of seg.querySelectorAll('button')) b.classList.toggle('active', b.dataset.v === v);
    const sec = k === 'focusMode' ? 'lens' : k === 'exposureMode' ? 'exposure' : 'color';
    updateSummary(s, sec);
  }
  function bind() {
    for (const tab of panel.querySelectorAll('[data-tab]')) {
      const pick = () => { activeId = tab.dataset.tab; paint(); };
      tab.onclick = pick;
      tab.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
    }
    for (const el of panel.querySelectorAll('input[type=range][data-k]')) {
      const s = S.sources.get(el.dataset.sid);
      if (!s) continue;
      let raf = 0;
      let last = +el.value;
      el.oninput = () => {
        last = +el.value;
        fmtOut(s.id, el.dataset.k, last);
        const sec = el.dataset.k === 'zoom' ? 'lens' : ['iso', 'exposureTime', 'exposureCompensation', 'exposureMode'].includes(el.dataset.k) ? 'exposure' : 'color';
        updateSummary(s, sec);
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; apply(s, { [el.dataset.k]: last }); });
      };
    }
    for (const seg of panel.querySelectorAll('.hcam-seg[data-k]')) {
      for (const b of seg.querySelectorAll('button')) {
        b.onclick = () => {
          const s = S.sources.get(seg.dataset.sid);
          if (!s) return;
          apply(s, { [seg.dataset.k]: b.dataset.v });
          setModeUI(s, seg.dataset.k, b.dataset.v);
        };
      }
    }
    for (const el of panel.querySelectorAll('[data-torch]')) {
      el.onclick = () => {
        const s = S.sources.get(el.dataset.sid);
        if (!s) return;
        const on = !el.classList.contains('on');
        apply(s, { torch: on });
        el.classList.toggle('on', on);
        const i = el.querySelector('i');
        if (i) i.textContent = on ? 'Ligada' : 'Desligada';
      };
    }
    for (const el of panel.querySelectorAll('[data-reset]')) {
      el.onclick = () => {
        const s = S.sources.get(el.dataset.reset);
        if (s) { apply(s, { reset: true }); setTimeout(() => refresh(true), 180); }
      };
    }
    for (const el of panel.querySelectorAll('[data-info]')) {
      el.onclick = () => {
        const sig = sigOf();
        if (sig) sig.send({ type: 'control', to: el.dataset.info, action: 'camera-info' });
        toast('Pedindo os controles para a câmera…', 'ok');
      };
    }
    const addCam = panel.querySelector('[data-add-cam]');
    if (addCam) {
      addCam.onclick = () => {
        panelClose?.(null);
        setTimeout(() => onAddCamera?.(), 80);
      };
    }
    const ic = window.__castdeck?.intercom;
    for (const b of panel.querySelectorAll('[data-hcam-ic-listen]')) {
      b.onclick = () => {
        const on = !b.classList.contains('on');
        ic?.listen(b.dataset.hcamIcListen, on);
        b.classList.toggle('on', on);
        b.textContent = on ? 'Ouvindo diretor' : 'Ouvir diretor';
      };
    }
    for (const b of panel.querySelectorAll('[data-hcam-ic-ptt]')) {
      let held = false;
      const off = () => { if (!held) return; held = false; ic?.talk(b.dataset.hcamIcPtt, false); b.classList.remove('on'); };
      b.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault(); held = true; b.classList.add('on'); ic?.talk(b.dataset.hcamIcPtt, true);
        try { b.setPointerCapture(e.pointerId); } catch {}
      });
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('lostpointercapture', off);
    }
    for (const b of panel.querySelectorAll('[data-hcam-ic-link]')) b.onclick = () => ic?.link();
    for (const el of panel.querySelectorAll('select[data-io-video], select[data-io-audio]')) {
      const kind = el.dataset.ioVideo !== undefined ? 'video' : 'audio';
      el.onchange = async () => {
        const fn = kind === 'video' ? onVideoDevice : onAudioDevice;
        if (!fn) return;
        el.disabled = true;
        try {
          await fn(kind === 'video' ? el.dataset.ioVideo : el.dataset.ioAudio, el.value);
          toast(kind === 'video' ? 'Interface de vídeo alterada.' : 'Interface de áudio alterada.', 'ok');
        } catch (e) {
          toast('Não foi possível trocar a interface: ' + (e.message || e.name), 'err');
        } finally {
          el.disabled = false;
          refresh(true);
        }
      };
    }
  }

  function openPanel() {
    if (open) return;
    open = true;
    loadDevices();
    let railCollapsed = false;
    try { railCollapsed = localStorage.getItem('castdeck.camRail') === '0'; } catch {}
    modal(
      `<div class="hcam-modal ${railCollapsed ? 'rail-collapsed' : ''}">
        <div class="hcam-head">
          <div class="hcam-title"><span class="hcam-head-ico">${icons.cam}</span><div><h3>Câmeras</h3><p class="sub">Preview e ajustes de operação</p></div></div>
          <div class="hcam-head-r">
            <span class="hcam-count" id="hcam-count"></span>
            <button type="button" class="hcam-rail-btn" id="hcam-rail-toggle" title="Recolher/mostrar o trilho de câmeras">◀</button>
          </div>
        </div>
        <div class="hcam-layout">
          <aside class="hcam-tabs" id="hcam-tabs" role="tablist" aria-label="Câmeras do estúdio"></aside>
          <section class="hcam-main" id="hcam-main"></section>
        </div>
        <div class="modal-actions hcam-foot"><span class="hcam-foot-hint">Clique numa câmera para ajustar. Seções podem ser recolhidas.</span><button class="btn" data-close>Fechar</button></div>
      </div>`,
      {
        onMount: (m, close) => {
          panel = m;
          panelClose = close;
          paint();
          const b = m.querySelector('#hcam-rail-toggle');
          b.onclick = () => {
            const off = m.querySelector('.hcam-modal').classList.toggle('rail-collapsed');
            b.textContent = off ? '▶' : '◀';
            try { localStorage.setItem('castdeck.camRail', off ? '0' : '1'); } catch {}
          };
          b.textContent = m.querySelector('.hcam-modal').classList.contains('rail-collapsed') ? '▶' : '◀';
        },
      },
    )
      .catch(() => {})
      .finally(() => { open = false; panel = null; });
  }
  function refresh(force = false) {
    if (!open || !panel) return;
    if (force) { paint(); return; }
    const next = cameras().map((s) => `${s.id}:${JSON.stringify(capsOf(s))}:${trackOf(s) ? '1' : '0'}:${ioSig(s)}`).join('|');
    if (next !== signature) paint();
  }
  return { open: openPanel, refresh };
}
