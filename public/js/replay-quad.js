// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Buffer ISO de 4 câmeras para o console de Replay/VAR.
// Cada ângulo tem seu próprio ring buffer (MediaRecorder independente, ~30 s e 1,5 Mbps).
// O VAR carrega os 4 clipes no mesmo instante de parede, alinha os offsets de keyframe e
// mantém play/pause/seek/quadro sincronizados entre os quatro <video> do quadrante.

import { createReplayEngine } from './studio/replay-engine.js';

export function createQuadIso({ getStudio, camSources, getSpeed, toast, onTime, onState } = {}) {
  const SLOTS = [1, 2, 3, 4];
  const engines = new Map();
  const videos = new Map();
  const items = new Map(); // slot -> { clip, offset }
  let enabled = false;
  let activeSlot = 1;
  let duration = 0;
  let time = 0;
  let playing = false;
  let masterStart = 0;
  let rateNow = 1; // velocidade atual: o relógio mestre avança em segundos de MÍDIA (rate × tempo de parede)
  let monitorMuted = false; // o console começa mudo e libera pelo botão de monitoramento local
  let raf = null;
  let loadTimer = null;
  let retryTimer = null;
  let slotReloadTimer = null;

  const studio = () => getStudio?.() || null;
  // Enquanto o replay está no ar o clipe do quadrante pode ser o mesmo blob do PGM:
  // revogar aqui congelaria o programa. Só libera quando não há replay no ar.
  const canRevoke = () => !studio()?.comp?.replayBug;
  const fps = () => {
    const s = studio();
    const f = Number(s?.S?.system?.presets?.[s?.S?.preset]?.fps);
    return f >= 24 && f <= 120 ? f : 30;
  };

  function emitState() {
    onState?.({ enabled, activeSlot, duration, time, playing, clips: items.size });
  }

  function sourceFor(slot) {
    const src = camSources?.[slot];
    if (!src || src === 'replay:out') return 'pgm';
    // Slot apontando para uma fonte que não existe (ex.: 'media' sem mídia): cai para PGM em vez de
    // gravar um captureStream implícito do canvas (o quadrante mostraria 4x o mesmo sinal).
    if (src !== 'pgm' && studio()?.S?.sources && !studio().S.sources.has(src)) return 'pgm';
    return src;
  }

  function ensureEngine(slot) {
    let engine = engines.get(slot);
    if (engine) return engine;
    engine = createReplayEngine({
      S: studio()?.S,
      comp: null,
      getProgramStream: () => studio()?.programStream,
      toast: null,
      mixer: null,
      bitrate: 1500000,
    });
    // Áudio do ângulo: usa a trilha da PRÓPRIA fonte quando ela tem (câmera com microfone embutido),
    // sem cair no áudio do PGM — senão os 4 ISOs embutiriam o programa 4 vezes. Fonte 'pgm' fica muda.
    const src = sourceFor(slot);
    engine.setAudioSource(src === 'pgm' ? 'mute' : src, { fallbackToProgram: false });
    engine.setCaptureSource(src);
    engine.setBufferDuration(30);
    engines.set(slot, engine);
    return engine;
  }

  function attachVideos(map) {
    for (const slot of SLOTS) {
      const el = map?.[slot];
      if (!el) continue;
      videos.set(slot, el);
      el.playsInline = true;
      el.muted = true;
    }
  }

  async function enable() {
    if (enabled) return getState();
    const s = studio();
    if (!s?.S?.sources) {
      toast?.('Estúdio não conectado — ISO indisponível');
      return null;
    }
    enabled = true;
    // Avisa quando algum slot não tem fonte válida (antes ele caía em PGM silenciosamente).
    const invalid = SLOTS.filter((slot) => {
      const raw = camSources?.[slot];
      return raw && raw !== 'pgm' && raw !== 'replay:out' && studio()?.S?.sources && !studio().S.sources.has(raw);
    });
    if (invalid.length) toast?.(`ISO: slot(s) ${invalid.join(', ')} sem fonte válida — usando PGM`);
    for (const slot of SLOTS) ensureEngine(slot).startBuffer();
    // Engines ISO não têm "console" registrado, então o retry interno do motor não roda:
    // insiste por ~18 s até câmeras/telas que ainda estavam subindo entregarem o stream.
    clearInterval(retryTimer);
    let tries = 0;
    retryTimer = setInterval(() => {
      if (!enabled) { clearInterval(retryTimer); retryTimer = null; return; }
      tries++;
      for (const engine of engines.values()) {
        if (!engine.getStats?.().active) engine.startBuffer();
      }
      if (tries >= 12) { clearInterval(retryTimer); retryTimer = null; }
    }, 1500);
    toast?.('ISO 4 CAM: gravando 4 ângulos em RAM (30 s cada, ~1,5 Mbps)');
    clearTimeout(loadTimer);
    // 1º chunk de 1 s por ângulo: espera os quatro terem Cluster antes de congelar. Se algum sinal
    // ainda estava subindo, tenta recongelar mais 2 vezes (sem atropelar quem já está tocando).
    let loadTries = 0;
    const tryLoad = async () => {
      if (!enabled || playing) return;
      const st = await loadAtNow(2);
      loadTries++;
      if (enabled && st && st.clips < SLOTS.length && loadTries < 3 && !studio()?.comp?.replayBug) {
        loadTimer = setTimeout(tryLoad, 3000);
      }
    };
    loadTimer = setTimeout(tryLoad, 2800);
    emitState();
    return getState();
  }

  function disable() {
    enabled = false;
    clearTimeout(loadTimer);
    clearTimeout(slotReloadTimer);
    slotReloadTimer = null;
    clearInterval(retryTimer);
    retryTimer = null;
    stopClock();
    for (const engine of engines.values()) {
      try { engine.stopBuffer(); } catch {}
    }
    for (const [slot, el] of videos) {
      try {
        el.pause();
        el.removeAttribute('src');
        el.srcObject = null;
        el.muted = true;
      } catch {}
      const it = items.get(slot);
      if (canRevoke() && it?.clip?.url?.startsWith('blob:')) {
        try { URL.revokeObjectURL(it.clip.url); } catch {}
      }
    }
    engines.clear();
    items.clear();
    duration = 0;
    time = 0;
    playing = false;
    emitState();
  }

  // Carrega os 4 ângulos no instante desejado (padrão: 2 s atrás). Cada clipe começa no
  // keyframe anterior; `offset` é quanto cada ângulo precisa avançar para alinhar no alvo.
  async function loadAtNow(preroll = 2) {
    if (!enabled) return null;
    const now = Date.now();
    const target = now - Math.max(0.5, preroll) * 1000;
    const loaded = [];
    let clamped = 0; // ângulos que não tinham histórico suficiente e caíram no começo do buffer

    for (const slot of SLOTS) {
      const engine = engines.get(slot);
      if (!engine) continue;
      const stat = engine.getStats?.() || {};
      if (!stat.active || (stat.duration || 0) < 0.8) continue;
      try {
        const seconds = Math.max(2.5, (Date.now() - target) / 1000 + 1.5);
        const clip = await engine.createClip(seconds);
        if (!clip?.url) continue;
        const offset = Math.max(0, (target - clip.startWall) / 1000);
        if (offset >= (clip.duration || 0) - 0.15) {
          // Sem histórico suficiente para o instante pedido: MELHOR não mostrar o ângulo do que
          // mostrá-lo em outro instante e fingir que está sincronizado (VAR com 3 ângulos corretos).
          clamped++;
          continue;
        }
        loaded.push({ slot, clip, offset });
      } catch (err) {
        console.warn('[quad-iso] falha ao criar clipe do ângulo', slot, err?.message || err);
      }
    }

    if (!loaded.length) {
      toast?.('ISO 4 CAM: buffer ainda enchendo — aguarde 2 s e congele de novo');
      return null;
    }

    // Troca os clipes antigos (revoga blobs fora de uso)
    for (const [slot, it] of items) {
      if (canRevoke() && it.clip?.url?.startsWith('blob:')) {
        try { URL.revokeObjectURL(it.clip.url); } catch {}
      }
      items.delete(slot);
    }

    const common = Math.min(...loaded.map((it) => Math.max(0, (it.clip.duration || 0) - it.offset)));
    duration = Math.max(0.2, common);
    time = 0;
    playing = false;
    stopClock();

    // Troca os vídeos e espera o metadata de CADA um antes de buscar o offset. Antes o `load()` era
    // chamado depois de setar currentTime e o seek podia ser descartado (quadrante preto/1º quadro).
    const waits = [];
    for (const it of loaded) {
      items.set(it.slot, { clip: it.clip, offset: it.offset });
      const el = videos.get(it.slot);
      if (!el) continue;
      try {
        el.pause();
        el.srcObject = null;
        el.src = it.clip.url;
        syncVideoAudio(it.slot, el);
        el.load?.();
      } catch (err) {
        console.warn('[quad-iso] vídeo do ângulo falhou:', err?.message || err);
      }
      waits.push(new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          try { el.removeEventListener('loadedmetadata', finish); } catch {}
          try { el.currentTime = it.offset; } catch {}
          resolve();
        };
        el.addEventListener('loadedmetadata', finish, { once: true });
        setTimeout(finish, 1200);
      }));
    }
    await Promise.all(waits);
    seek(0);
    const partial = loaded.length < SLOTS.length;
    toast?.(`ISO 4 CAM: ${loaded.length}/${SLOTS.length} ângulo(s) congelados` + (clamped ? ` — ${clamped} sem histórico no instante pedido` : partial ? ' — algum sinal ainda está subindo' : ' no mesmo instante'));
    emitState();
    return getState();
  }

  function el(slot) { return videos.get(slot); }

  // Áudio do quadrante: só o ângulo ativo toca, e só se o monitor local estiver liberado.
  function syncVideoAudio(slot, v) {
    if (!v) return;
    const on = !monitorMuted && slot === activeSlot;
    try { v.muted = !on; v.volume = on ? 1 : 0; } catch {}
  }

  function setMonitorMuted(on) {
    monitorMuted = !!on;
    for (const [slot, v] of videos) syncVideoAudio(slot, v);
  }

  function seek(t) {
    if (!items.size) return;
    time = Math.max(0, Math.min(duration, Number(t) || 0));
    // Rebasa o relógio mestre: sem isso, um scrub durante o play era desfeito no tick seguinte.
    if (playing) {
      masterStart = performance.now() - (time / rateNow) * 1000;
      // Tocando: NÃO crava currentTime nos 4 vídeos (isso dava o salto). O tick converge pela
      // velocidade; saltos grandes (>0,6 s) continuam sendo seek real.
      onTime?.(time, duration);
      return;
    }
    for (const [slot, it] of items) {
      const v = el(slot);
      if (!v) continue;
      const target = it.offset + time;
      if (Number.isFinite(target) && Math.abs((v.currentTime || 0) - target) > 0.02) {
        try { v.currentTime = Math.min(target, Math.max(0, (it.clip.duration || duration + it.offset))); } catch {}
      }
    }
    onTime?.(time, duration);
  }

  function seekPercent(pct) {
    seek((Math.max(0, Math.min(100, Number(pct) || 0)) / 100) * duration);
  }

  function pause() {
    playing = false;
    stopClock();
    for (const [slot] of items) {
      const v = el(slot);
      try { v?.pause(); } catch {}
    }
    emitState();
    onTime?.(time, duration);
  }

  function play() {
    if (!items.size || playing) return;
    if (time >= duration - 0.02) seek(0);
    playing = true;
    rateNow = Math.max(0.05, Math.min(2, getSpeed?.() || 1));
    // O relógio mestre é em MÍDIA: 0,5× anda 0,5 s de mídia por segundo de parede. Antes ele andava em
    // tempo real e o "corrige deriva" empurrava o vídeo para frente, anulando a câmera lenta.
    masterStart = performance.now() - (time / rateNow) * 1000;
    for (const [slot, it] of items) {
      const v = el(slot);
      if (!v) continue;
      try {
        v.playbackRate = rateNow;
        syncVideoAudio(slot, v);
        v.currentTime = it.offset + time;
        v.play().catch(() => {});
      } catch {}
    }
    tick();
    emitState();
  }

  function tick() {
    if (!playing) return;
    const t = ((performance.now() - masterStart) / 1000) * rateNow;
    if (t >= duration) {
      time = duration;
      pause();
      return;
    }
    time = t;
    for (const [slot, it] of items) {
      const v = el(slot);
      if (!v) continue;
      const desired = it.offset + t;
      const drift = desired - (v.currentTime || 0);
      // Convergência SUAVE: acelera/desacelera ±12% para alcançar o relógio mestre em vez de
      // cravar currentTime a cada quadro (era isso que dava a sensação de saltos no quadrante).
      if (Math.abs(drift) > 0.6) {
        try { v.currentTime = desired; v.playbackRate = rateNow; } catch {}
      } else if (Math.abs(drift) > 0.04) {
        const maxAdj = Math.max(0.01, rateNow * 0.12);
        const adj = Math.max(-maxAdj, Math.min(maxAdj, drift * 0.8));
        try { v.playbackRate = Math.max(0.05, Math.min(2, rateNow + adj)); } catch {}
      } else {
        try { v.playbackRate = rateNow; } catch {}
      }
    }
    onTime?.(time, duration);
    raf = requestAnimationFrame(tick);
  }

  function stopClock() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function step(dir) {
    pause();
    seek(time + (dir / fps()));
  }

  function setSpeed(sp) {
    const rate = Math.max(0.05, Math.min(2, Number(sp) || 1));
    // Rebasa o relógio mestre na velocidade nova: senão a mudança de 0,5×/0,25× durante o play
    // fazia o vídeo pular para "alcançar" o relógio antigo.
    if (playing) masterStart = performance.now() - (time / rate) * 1000;
    rateNow = rate;
    for (const slot of items.keys()) {
      const v = el(slot);
      if (v) { try { v.playbackRate = rate; } catch {} }
    }
  }

  // Troca o sinal de UM ângulo com o ISO ativo: reinicia só o buffer daquele slot e recongela o
  // quadrante quando ele tiver ~2 s. Antes o seletor mudava só o preview ao vivo e o VAR continuava
  // gravando a câmera antiga daquele ângulo.
  function setSlotSource(slot, sourceId) {
    if (!enabled) return false;
    const engine = engines.get(slot);
    if (!engine) return false;
    if (studio()?.comp?.replayBug) {
      toast?.('Pare o replay antes de trocar o sinal de um ângulo.');
      return false;
    }
    if (engine.getCaptureSource?.() === sourceId) return true;
    // Troca o áudio do ângulo junto (mesma fonte), sem reiniciar duas vezes o buffer.
    engine.setAudioSource(sourceId === 'pgm' ? 'mute' : sourceId, { fallbackToProgram: false, restart: false });
    engine.setCaptureSource(sourceId);
    clearTimeout(slotReloadTimer);
    slotReloadTimer = setTimeout(() => {
      if (!enabled) return;
      loadAtNow(2);
      // O buffer novo pode ainda estar no 1º segundo: tenta mais uma vez sem atropelar quem está tocando.
      slotReloadTimer = setTimeout(() => {
        if (enabled && !playing && items.size < SLOTS.length) loadAtNow(2);
      }, 3200);
    }, 2600);
    toast?.(`ISO: ângulo ${slot} agora grava ${sourceId === 'pgm' ? 'PGM' : sourceId} — recongelando…`);
    emitState();
    return true;
  }

  function setActive(slot) {
    activeSlot = slot;
    for (const [s, it] of items) {
      const v = el(s);
      if (!v) continue;
      syncVideoAudio(s, v);
    }
    // Reforça o quadro alinhado no ângulo que acabou de entrar
    const it = items.get(slot);
    const v = el(slot);
    if (it && v) {
      try { v.currentTime = it.offset + time; } catch {}
    }
    emitState();
  }

  function getActive() {
    // Se o ângulo ativo não tem clipe, usa outro — mas devolve o slot REAL usado (o TAKE rotulava
    // "CAM 1" mesmo quando ia ao ar o ângulo 2).
    const slot = items.has(activeSlot) ? activeSlot : SLOTS.find((s) => items.has(s));
    const it = slot ? items.get(slot) : null;
    if (!it) return null;
    return {
      slot,
      clip: it.clip,
      currentTime: Math.max(0, it.offset + time),
      time,
      duration,
    };
  }

  function getSlot(slot) {
    const it = items.get(slot);
    if (!it) return null;
    return { slot, clip: it.clip, currentTime: Math.max(0, it.offset + time), offset: it.offset, time };
  }

  function getState() {
    return { enabled, activeSlot, duration, time, playing, clips: items.size };
  }

  // Diagnóstico por ângulo: usado pelo botão de FPS do console para saber se o problema é sinal
  // ausente, buffer curto, áudio errado ou deriva de sincronização — em vez de adivinhar.
  function getDiagnostics() {
    return SLOTS.map((slot) => {
      const eng = engines.get(slot);
      const it = items.get(slot);
      const v = el(slot);
      const st = eng?.getStats?.() || {};
      const desired = it ? it.offset + time : null;
      return {
        slot,
        source: eng?.getCaptureSource?.() || '—',
        audio: eng?.getAudioSource?.() || '—',
        bufferSecs: +(st.duration || 0).toFixed(1),
        recording: !!st.active,
        clip: !!it,
        readyState: v?.readyState ?? -1,
        currentTime: v && Number.isFinite(v.currentTime) ? +v.currentTime.toFixed(2) : null,
        drift: it && v && Number.isFinite(desired) ? +Math.abs((v.currentTime || 0) - desired).toFixed(2) : null,
      };
    });
  }

  function isActive() { return enabled; }

  return {
    attachVideos,
    enable,
    disable,
    loadAtNow,
    play,
    pause,
    seek,
    seekPercent,
    step,
    setSpeed,
    setMonitorMuted,
    setSlotSource,
    setActive,
    getActive,
    getSlot,
    getState,
    getDiagnostics,
    isActive,
    fps,
    destroy: disable,
  };
}

