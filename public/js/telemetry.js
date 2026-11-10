// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Telemetria de uso do estúdio: pulso visibility-aware, sem PII.
// Carregado apenas em /index.html e /studio.html, antes do módulo da aplicação.
(function () {
  'use strict';

  const HEARTBEAT_MS = 5 * 60 * 1000;
  const FIRST_PULSE_MS = 30 * 1000;
  const IDLE_MS = 15 * 60 * 1000;
  const TICK_MS = 15 * 1000;
  const LEASE_MS = 45 * 1000;
  const LEASE_KEY = 'castdeck.telemetry.leader.v1';
  const OFF_KEY = 'castdeck.telemetry.off';

  const path = String(location.pathname || '/').replace(/\/+$/, '') || '/';
  let role = 'other';
  if (path === '/' || path.endsWith('/index.html')) role = 'dashboard';
  else if (path === '/studio' || path.startsWith('/studio/') || path.endsWith('/studio.html')) role = 'studio';
  if (role === 'other') return;

  try {
    if (localStorage.getItem(OFF_KEY) === '1') return;
  } catch {}

  const instanceId = (() => {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch {}
    return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  })();

  const startedAt = Date.now();
  let lastTickAt = startedAt;
  let lastInteractionAt = startedAt;
  let lastPulseAt = startedAt - HEARTBEAT_MS + FIRST_PULSE_MS;
  let activeMs = 0;
  let heartbeatSeq = 0;
  let wasActive = true;
  let wasVisible = document.visibilityState !== 'hidden';
  let closed = false;
  let leader = false;
  const rolePriority = role === 'studio' ? 2 : 1;
  let storageOk = true;
  let production = 'off_air';
  let lastProduction = '';
  let stateGetter = null;
  let appVersion = '';
  let surface = /Android/i.test(navigator.userAgent) ? 'android' : 'desktop';

  try {
    if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname)) surface = 'web';
  } catch {}

  const visible = () => document.visibilityState !== 'hidden';

  function readState() {
    if (typeof stateGetter !== 'function') return {};
    try {
      const s = stateGetter();
      return s && typeof s === 'object' ? s : {};
    } catch {
      return {};
    }
  }

  function productionState(s = readState()) {
    const onAir = !!s.onAir;
    const recording = !!s.recording;
    if (onAir && recording) return 'on_air_recording';
    if (onAir) return 'on_air';
    if (recording) return 'recording';
    return 'off_air';
  }

  function isActive() {
    if (!visible()) return false;
    const s = readState();
    return Date.now() - lastInteractionAt < IDLE_MS || !!s.onAir || !!s.recording;
  }

  function readLease() {
    if (!storageOk) return null;
    try {
      const raw = localStorage.getItem(LEASE_KEY);
      if (!raw) return null;
      const v = JSON.parse(raw);
      return v && typeof v === 'object' ? v : null;
    } catch {
      return null;
    }
  }

  function writeLease() {
    if (!storageOk) return true;
    try {
      localStorage.setItem(LEASE_KEY, JSON.stringify({ id: instanceId, at: Date.now(), priority: rolePriority }));
      return true;
    } catch {
      storageOk = false;
      return true;
    }
  }

  function releaseLease() {
    if (!storageOk) return;
    try {
      const cur = readLease();
      if (cur?.id === instanceId) localStorage.removeItem(LEASE_KEY);
    } catch {}
  }

  function tryAcquire() {
    if (closed) return false;
    if (!storageOk) {
      leader = true;
      return true;
    }
    const now = Date.now();
    const cur = readLease();
    if (!cur || cur.id === instanceId || now - Number(cur.at || 0) > LEASE_MS || rolePriority > Number(cur.priority || 1)) {
      leader = writeLease();
      return leader;
    }
    leader = false;
    return false;
  }

  function isLeader() {
    if (!leader) tryAcquire();
    return leader;
  }

  function markInteraction() {
    lastInteractionAt = Date.now();
    if (!wasActive) wasActive = isActive();
  }

  function clean(params) {
    const out = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      out[k] = v;
    }
    return out;
  }

  function baseParams() {
    const s = readState();
    return clean({
      app_surface: surface,
      app_version: appVersion || s.appVersion || undefined,
      window_role: role,
      route: role,
      production_state: productionState(s),
      visible: visible() ? 1 : 0,
      focused: document.hasFocus() ? 1 : 0,
      guest_count: Number.isFinite(+s.guestCount) ? +s.guestCount : undefined,
      source_count: Number.isFinite(+s.sourceCount) ? +s.sourceCount : undefined,
      output_count: Number.isFinite(+s.outputCount) ? +s.outputCount : undefined,
    });
  }

  function emit(name, extra = {}, { leaderOnly = false, reset = false } = {}) {
    if (closed) return false;
    if (leaderOnly && !isLeader()) return false;
    if (typeof window.gtag !== 'function') return false;
    try {
      window.gtag('event', name, clean({ ...baseParams(), ...extra }));
    } catch {
      return false;
    }
    if (reset) activeMs = 0;
    return true;
  }

  function activeSeconds() {
    return Math.max(0, Math.round(activeMs / 1000));
  }

  function engagementMs() {
    return Math.max(0, Math.min(300000, Math.round(activeMs)));
  }

  function pulse(reason = 'heartbeat') {
    if (!visible() || !isActive()) return false;
    if (!isLeader()) return false;
    const ok = emit(
      'studio_active',
      {
        active_seconds: activeSeconds(),
        engagement_time_msec: engagementMs(),
        heartbeat_seq: ++heartbeatSeq,
        idle_seconds: Math.max(0, Math.round((Date.now() - lastInteractionAt) / 1000)),
        pulse_reason: reason,
      },
      { leaderOnly: true, reset: true },
    );
    if (ok) lastPulseAt = Date.now();
    return ok;
  }

  function sendState(name, extra = {}) {
    return emit(name, { active_seconds: activeSeconds(), engagement_time_msec: engagementMs(), ...extra }, { leaderOnly: true, reset: true });
  }

  function checkProduction() {
    const p = productionState();
    if (p === lastProduction) return;
    const prev = lastProduction;
    lastProduction = p;
    if (!prev) return;
    if (p === 'off_air') {
      emit('production_ended', { previous_production_state: prev }, { leaderOnly: true, reset: true });
    } else {
      emit('production_started', { previous_production_state: prev }, { leaderOnly: true, reset: true });
    }
  }

  function tick() {
    if (closed) return;
    const now = Date.now();
    const dt = Math.min(30000, Math.max(0, now - lastTickAt));
    lastTickAt = now;
    const vis = visible();
    const act = isActive();
    if (vis && act) activeMs += dt;

    if (vis && act && !wasActive) {
      emit(
        'studio_resume',
        { active_seconds: activeSeconds(), engagement_time_msec: engagementMs() },
        { leaderOnly: true, reset: false },
      );
      wasActive = true;
      lastPulseAt = now - HEARTBEAT_MS;
    }
    if (vis && !act && wasActive) {
      sendState('studio_idle', { production_state: productionState() });
      wasActive = false;
    }
    if (vis && act && now - lastPulseAt >= HEARTBEAT_MS) pulse('heartbeat');
    checkProduction();
    production = productionState();
    wasActive = act;

    if (vis) {
      if (leader) writeLease();
      else tryAcquire();
    } else {
      releaseLease();
    }
  }

  function onVisibility() {
    if (closed) return;
    const vis = visible();
    if (!vis) {
      if (wasVisible && wasActive) sendState('studio_hidden', { production_state: productionState() });
      wasVisible = false;
      wasActive = false;
      releaseLease();
      return;
    }
    wasVisible = true;
    lastTickAt = Date.now();
    tryAcquire();
    if (isActive()) {
      emit(
        'studio_resume',
        { active_seconds: activeSeconds(), engagement_time_msec: engagementMs() },
        { leaderOnly: true, reset: false },
      );
      wasActive = true;
      lastPulseAt = Date.now() - HEARTBEAT_MS;
    }
  }

  function onPageHide() {
    if (closed) return;
    if (wasVisible && wasActive) sendState('studio_close', { production_state: productionState(), transport_type: 'beacon' });
    closed = true;
    releaseLease();
  }

  function bindState(fn) {
    if (typeof fn !== 'function') return;
    stateGetter = fn;
    const s = readState();
    production = productionState(s);
    lastProduction = production;
    if (s.onAir || s.recording) {
      emit('production_started', { previous_production_state: 'off_air' }, { leaderOnly: true, reset: false });
    }
  }

  function snapshot() {
    return {
      surface,
      version: appVersion,
      role,
      leader,
      visible: visible(),
      active: isActive(),
      production: productionState(),
      activeSeconds: activeSeconds(),
      heartbeatSeq,
      lastPulseAt,
    };
  }

  window.CastDeckTelemetry = { bindState, flush: () => pulse('manual'), snapshot, version: '1.0' };

  // Um único líder entre estúdio/dashboard. Em navegador sem localStorage, cada janela segue sozinha.
  tryAcquire();
  if (visible()) writeLease();

  window.addEventListener('pointerdown', markInteraction, { passive: true });
  window.addEventListener('keydown', markInteraction, { passive: true });
  window.addEventListener('touchstart', markInteraction, { passive: true });
  window.addEventListener('wheel', markInteraction, { passive: true });
  window.addEventListener('focus', markInteraction);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('storage', (e) => {
    if (e.key !== LEASE_KEY) return;
    const cur = readLease();
    if (cur && cur.id !== instanceId) leader = false;
  });

  fetch('/api/health', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((h) => {
      if (!h) return;
      if (h.version) appVersion = String(h.version);
      if (h.platform === 'android' || /Android/i.test(navigator.userAgent)) surface = 'android';
      else if (h.platform === 'win32' || h.platform === 'darwin' || h.platform === 'linux') surface = 'desktop';
    })
    .catch(() => {});

  // Um evento de abertura por carregamento; não é pageview e não depende do líder.
  emit('app_open', { page_title: document.title || undefined });

  setInterval(tick, TICK_MS);
  if (visible()) pulse('startup');
})();
