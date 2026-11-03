// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Controlador Broadcast do Console Dedicado de Replay & VAR (estilo EVS LSM-VIA + vMix Replay).

import { initReplayControllers } from './replay-controllers.js';
import { createQuadIso } from './replay-quad.js';

const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

let studio = null;
let pgmVideo = null;
let pvwVideo = null;
let varCanvas = null;
let varCtx = null;

let currentSpeed = 0.5;
let isVarActive = false;
let isPlaying = false;
let currentClip = null;
let highlights = [];

let markInTime = null;
let markOutTime = null;
// IN marcado com o Preview no ao vivo (hora Date.now): vira marca de verdade quando o lance sai do buffer
let pendingLiveIn = null;
// Marcas a aplicar quando o clipe terminar de carregar (loadClipToPreview zera as marcas e volta para 0 s)
let pendingClipMarks = null;
let capturingLive = false;

// Áudio Independente do Replay
// Padrão de replay/VAR: silencioso. O operador escolhe CUE/PGM/Ambos na rack de áudio
// quando quiser monitorar ou colocar o som do lance no ar.
let audioRoute = 'mute'; // 'cue' | 'pgm' | 'both' | 'mute'
let audioDeviceId = 'default';
let audioVolume = 0.8;
let isMuted = false;
// Monitoramento LOCAL do console (fone/caixa deste PC). Começa SEMPRE mudo para não duplicar o áudio
// do replay que já está saindo pelo PGM/stream no mesmo computador. Não afeta o envio ao PGM.
let monitorMuted = true;
let autoTake = true; // gatilho de replay vai direto ao PGM (desligável no console e no remoto)
let audioCtx = null;

// Multi-Câmera / Modos 1 Câmera e 4 Câmeras
let viewMode = 'single'; // 'single' | 'quad'
let activeCamSlot = 1; // 1 | 2 | 3 | 4
let camSources = {
  1: 'pgm',
  2: 'host:cam',
  3: 'media',
  4: 'screen',
};

// O replay está NO AR no PGM? Se sim, os controles (play/pause/seek/jog) devem comandar o playout
// do estúdio, e não o Preview.
const pgmOnAir = () => !!studio?.replayEngine?.isPlayoutOnAir?.();
const engineOf = () => studio?.replayEngine;

// Ferramentas do VAR
let currentVarTool = 'offside'; // 'offside' | 'vert' | 'zoom' | 'stamp'
let offsideLines = []; // [{ x, y, color, label, angle }]
let verticalLines = []; // [{ x, y1, y2, color }]
let varStamp = null; // { text, color, x, y }
let zoomMagnifier = null; // { x, y, radius, zoom }

// Modo Live Mirror / Sincronização direta Preview ➜ PGM
let isLiveMirrorActive = false;
let quadIso = null; // buffer ISO dos 4 ângulos (replay-quad.js)

let uiReady = false;
let noStudioTries = 0;
let reconnectTimer = null;

// Liga/religa o console ao estúdio. Se o operador der F5 no estúdio, o objeto
// `__castdeck` é recriado; sem isso o console ficava preso no engine antigo (funções mortas).
function attachStudio() {
  const cur = window.opener?.__castdeck;
  if (!cur) return false;
  if (cur === studio) return true;
  if (studio) {
    try { studio.replayEngine?.unregisterConsole?.(window); } catch {}
  }
  // O ISO guarda streams do estúdio antigo: recomeça no novo (senão os 4 vídeos congelam).
  try { quadIso?.disable(); } catch {}
  studio = cur;
  if (studio.programStream) {
    pgmVideo.srcObject = studio.programStream;
    pgmVideo.play().catch(() => {});
  } else if (studio.comp?.canvas) {
    try {
      pgmVideo.srcObject = studio.comp.canvas.captureStream(30);
      pgmVideo.play().catch(() => {});
    } catch (e) {
      console.warn('Erro ao capturar stream do compositor:', e);
    }
  }
  studio.replayEngine?.registerConsole?.(window);
  $('#rp-pgm-speed-tag').textContent = 'CONECTADO AO ESTÚDIO';
  $('#rp-pgm-speed-tag').style.color = '#10b981';
  noStudioTries = 0;
  if (uiReady) {
    updateBufferStatus();
    loadSavedClips();
    loadStorageConfig();
    syncMatchRecordingStatus();
    previewLiveSource(camSources[activeCamSlot] || 'pgm');
    flashPvwStatus('ESTÚDIO RECONECTADO');
  }
  return true;
}

function init() {
  // Replay & VAR é exclusivo do desktop: no app Android (UA CastDeckAndroid) ou no celular não inicia nada
  if (/Android|iPhone|iPad|iPod|Mobile|CastDeckAndroid/i.test(navigator.userAgent) || window.opener?.__castdeck?.S?.system?.platform === 'android') {
    document.body.innerHTML = '<div style="display:flex;height:100vh;align-items:center;justify-content:center;padding:24px;text-align:center;font:600 16px system-ui;color:#cbd5e1;background:#0b0a14">O Console de Replay &amp; VAR está disponível só na versão para computador (Windows, macOS e Linux).</div>';
    return;
  }
  pgmVideo = $('#rp-video-pgm');
  if (pgmVideo) pgmVideo.muted = true; // monitor B é vídeo: áudio do PGM não toca neste PC
  pvwVideo = $('#rp-video-pvw');
  if (pvwVideo) pvwVideo.muted = true; // começa mudo; o botão de monitor libera
  varCanvas = $('#rp-var-canvas');
  varCtx = varCanvas?.getContext('2d');

  if (!attachStudio()) {
    noStudioTries++;
    $('#rp-pgm-speed-tag').textContent = noStudioTries < 10
      ? 'AGUARDANDO ESTÚDIO...'
      : 'ABRA PELO BOTÃO REPLAY & VAR DO ESTÚDIO';
    $('#rp-pgm-speed-tag').style.color = '#eab308';
    // Continua tentando (o estúdio pode demorar), mas para de piscar "aguardando" para sempre.
    setTimeout(init, noStudioTries < 10 ? 500 : 3000);
    return;
  }
  if (uiReady) return;
  uiReady = true;

  // Atalhos globais disparados pelo estúdio (que tem foco). Só aceita a mesma origem (o próprio estúdio).
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin) return;
    const d = ev.data;
    if (!d || d.type !== 'castdeck-replay-cmd') return;
    if (d.action === 'replay') triggerReplay(Math.max(1, Math.min(60, Number(d.seconds) || 10)));
    else if (d.action === 'save') saveCurrentToHighlights();
    else if (d.action === 'take') takePreviewToPgm();
    else if (d.action === 'live') cutToLive();
    else if (d.action === 'auto-take') { autoTake = !!d.on; updateAutoTakeBtn(); }
    else if (d.action === 'preview-clip' && d.url) {
      currentClip = { url: d.url, duration: Number(d.duration) || 10, timestamp: Date.now() };
      loadClipToPreview(d.url, true);
    }
  });

  autoTake = studio?.replayEngine?.getAutoTake?.() ?? true;
  bindEvents();
  updateAutoTakeBtn();
  $('#rp-btn-remote')?.addEventListener('click', openRemoteReplayControl);
  $('#rp-btn-autotake')?.addEventListener('click', () => {
    autoTake = !autoTake;
    studio?.replayEngine?.setAutoTake?.(autoTake);
    updateAutoTakeBtn();
  });
  // MIDI / gamepad USB / HID (Shuttle, X-Keys): mesmo mapa de ações do teclado.
  initReplayControllers({ actions: replayControllerActions() });
  initJogWheel();
  initTBar();
  initVarLayer();
  // O canvas do VAR é dimensionado pelo CSS; sem isto, redimensionar a janela desalinhava linhas/lupa.
  window.addEventListener('resize', () => { resizeVarCanvas(); drawVarOverlay(); });
  initAudioControls();
  initSourceRack();
  initMultiCam();
  initQuadIso();
  // O console começa com o monitoramento local mudo; aplica também aos 4 ângulos do ISO.
  quadIso?.setMonitorMuted?.(true);
  setInterval(updateIsoPerf, 1000);
  startMasterClock();
  updateBufferStatus();
  loadSavedClips();
  loadStorageConfig();
  syncMatchRecordingStatus();

  // Exibe imediatamente o sinal ao vivo no Monitor A (CUE/Preview) ao abrir o console
  previewLiveSource(camSources[activeCamSlot] || 'pgm');

  setInterval(updateBufferStatus, 500);
  // Reconexão após reload/crash do estúdio.
  reconnectTimer = setInterval(() => { attachStudio(); }, 1500);
}

// Relógio Mestre SMPTE Broadcast (HH:MM:SS:FF a 30fps)
function startMasterClock() {
  const masterEl = $('#bc-master-tc');
  let pgmTick = 0;
  function tick() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const f = String(Math.floor((now.getMilliseconds() / 1000) * 30)).padStart(2, '0');
    if (masterEl) masterEl.textContent = `${h}:${m}:${s}:${f}`;
    // ~10 Hz: acompanha o replay no ar (tempo/scrub/botão) sem escrever DOM a 60 fps.
    if (pgmOnAir() && pgmTick++ % 6 === 0) updatePgmTransportUI();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function toggleBufferMode() {
  const engine = studio?.replayEngine;
  if (!engine) return;

  const stat = engine.getStats?.() || {};
  if (stat.active) {
    engine.stopBuffer?.();
  } else {
    engine.startBuffer?.();
  }
  updateBufferStatus();
}

function updateBufferStatus() {
  const engine = studio?.replayEngine;
  if (!engine) return;

  const stat = engine.getStats?.() || { duration: 0, maxDuration: 45, count: 0, active: false, isRolling: false };
  const fill = $('#rp-buf-fill');
  const txt = $('#rp-buf-time');
  const btnToggle = $('#rp-btn-buffer-toggle');
  const btnLabel = $('#rp-buf-toggle-label');

  const isActive = !!stat.active;
  if (btnToggle) {
    btnToggle.classList.toggle('buffer-active', isActive);
    btnToggle.classList.toggle('buffer-idle', !isActive);
    btnToggle.classList.remove('is-recording');
    btnToggle.title = isActive
      ? 'Modo Buffer ATIVO: clique para pausar gravação circular em RAM (Atalho: B)'
      : 'Modo Buffer PAUSADO: clique para iniciar o modo buffer circular em RAM (Atalho: B)';
    if (btnLabel) {
      btnLabel.textContent = isActive ? 'Buffer Ativo' : 'Iniciar Buffer';
    }
  }

  if (!isActive) {
    if (fill) {
      fill.style.width = '0%';
      fill.style.background = '#64748b';
    }
    if (txt) {
      txt.style.color = '#94a3b8';
      txt.textContent = `0.0s / ${stat.maxDuration || 45}s (PAUSADO)`;
    }
    return;
  }
  if (btnToggle) {
    btnToggle.classList.toggle('buffer-active', isActive);
    btnToggle.classList.toggle('buffer-idle', !isActive);
    btnToggle.classList.remove('is-recording');
    btnToggle.title = isActive
      ? 'Modo Buffer ATIVO: clique para pausar gravação circular em RAM (Atalho: B)'
      : 'Modo Buffer PAUSADO: clique para iniciar o modo buffer circular em RAM (Atalho: B)';
    if (btnLabel) {
      btnLabel.textContent = isActive ? 'Buffer Ativo' : 'Iniciar Buffer';
    }
  }

  if (!isActive) {
    if (fill) {
      fill.style.width = '0%';
      fill.style.background = '#64748b';
    }
    if (txt) {
      txt.style.color = '#94a3b8';
      txt.textContent = `0.0s / ${stat.maxDuration}s (PAUSADO)`;
    }
    return;
  }

  const isRolling = stat.isRolling || stat.duration >= stat.maxDuration;
  const pct = Math.min(100, Math.round((stat.duration / stat.maxDuration) * 100));

  if (fill) {
    fill.style.width = `${pct}%`;
    fill.style.background = isRolling ? '#10b981' : 'var(--bc-accent)';
  }
  if (txt) {
    txt.style.color = isRolling ? '#10b981' : '';
    txt.textContent = isRolling
      ? `${stat.maxDuration}s (CIRCULAR / AO VIVO)`
      : `${stat.duration.toFixed(1)}s / ${stat.maxDuration}s`;
  }
}

// -------------------------------------------------------------
// ÁUDIO INDEPENDENTE DO REPLAY / VAR
// -------------------------------------------------------------
async function initAudioControls() {
  const routeSel = $('#rp-audio-route');
  const devSel = $('#rp-audio-device');
  const volSlider = $('#rp-audio-vol');
  const muteBtn = $('#rp-btn-mute');

  // Popula os dispositivos de áudio de saída físicos
  if (navigator.mediaDevices?.enumerateDevices) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOuts = devices.filter((d) => d.kind === 'audiooutput');
      if (audioOuts.length && devSel) {
        devSel.innerHTML = audioOuts.map((d, i) =>
          `<option value="${d.deviceId}">${d.label || `Saída de Áudio ${i + 1}`}</option>`
        ).join('');
      }
    } catch (err) {
      console.warn('Falha ao listar dispositivos de saída:', err);
    }
  }

  // Roteamento de áudio (Fone CUE / PGM Master / Ambos / Mudo)
  if (routeSel) {
    routeSel.onchange = () => {
      audioRoute = routeSel.value;
      applyAudioRouting();
    };
  }

  // Seletor de dispositivo físico independente
  if (devSel) {
    devSel.onchange = async () => {
      audioDeviceId = devSel.value;
      if (typeof pvwVideo.setSinkId === 'function') {
        try {
          await pvwVideo.setSinkId(audioDeviceId);
          console.log(`Áudio do replay roteado para dispositivo: ${audioDeviceId}`);
        } catch (err) {
          console.warn('Erro ao configurar setSinkId:', err);
        }
      }
    };
  }

  // Volume
  if (volSlider) {
    volSlider.oninput = () => {
      audioVolume = parseFloat(volSlider.value) / 100;
      $('#rp-vol-lbl').textContent = `${Math.round(audioVolume * 100)}%`;
      if (pvwVideo) pvwVideo.volume = audioVolume;
      studio?.replayEngine?.setAudioVolume?.(audioVolume);
    };
  }

  // Mute com ícones vetoriais de alto contraste
  if (muteBtn) {
    muteBtn.onclick = () => {
      isMuted = !isMuted;
      muteBtn.classList.toggle('muted', isMuted);
      muteBtn.style.color = isMuted ? '#ef4444' : '#e2e8f0';
      muteBtn.innerHTML = isMuted
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
      applyAudioRouting();
    };
  }

  // Mute do monitoramento LOCAL (separado do mute de envio/PGM)
  const monBtn = $('#rp-mon-mute');
  if (monBtn) {
    monBtn.onclick = () => {
      monitorMuted = !monitorMuted;
      // Se a rota está em "mudo" e o operador pediu para ouvir, entra em CUE automaticamente.
      if (!monitorMuted && audioRoute === 'mute') {
        audioRoute = 'cue';
        const routeSel = $('#rp-audio-route');
        if (routeSel) routeSel.value = 'cue';
      }
      applyAudioRouting();
    };
  }

  applyAudioRouting();
}

function applyAudioRouting() {
  if (!pvwVideo) return;

  // PGM: só a rota decide (o mute do monitor local NÃO pode calar o programa).
  const onPgm = !isMuted && (audioRoute === 'pgm' || audioRoute === 'both');
  studio?.replayEngine?.setAudioMuted?.(!onPgm);
  if (onPgm) studio?.replayEngine?.setAudioVolume?.(audioVolume);

  // Monitor local: precisa de rota de fone + monitor desmutado + mute geral desligado.
  const onMonitor = !isMuted && !monitorMuted && (audioRoute === 'cue' || audioRoute === 'both');
  pvwVideo.muted = !onMonitor;
  if (onMonitor) pvwVideo.volume = audioVolume;
  quadIso?.setMonitorMuted?.(!onMonitor);
  updateMonitorBtn();
}

function updateAutoTakeBtn() {
  const b = $('#rp-btn-autotake');
  if (!b) return;
  b.classList.toggle('on', !!autoTake);
  b.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon></svg><span>AUTO ${autoTake ? 'ON' : 'OFF'}</span>`;
  b.title = autoTake
    ? 'Gatilho de replay vai DIRETO ao PGM. Clique para desligar (só prepara no Preview).'
    : 'Gatilho só prepara no Preview (não vai ao ar). Clique para ligar o TAKE automático.';
}

function updateMonitorBtn() {
  const b = $('#rp-mon-mute');
  if (!b) return;
  const muted = monitorMuted || isMuted;
  b.classList.toggle('muted', muted);
  b.style.color = muted ? '#ef4444' : '#10b981';
  b.title = muted
    ? 'Monitoramento local MUDO (o PGM/stream continua com áudio). Clique para ouvir neste PC.'
    : 'Monitoramento local ativo. Clique para mutar este PC (não afeta o PGM).';
  b.innerHTML = muted
    ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>'
    : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>';
}

// -------------------------------------------------------------
// SELEÇÃO DE SINAIS DE ENTRADA (PGM, CÂMERA, TELA, VÍDEO, ETC.)
// -------------------------------------------------------------
function initSourceRack() {
  const sourceSel = $('#rp-input-source');
  const audioInSel = $('#rp-input-audio');

  // Só reconstrói os <select> quando a lista realmente muda: recriar o innerHTML a cada
  // 2,5 s fechava o dropdown no meio da escolha do operador.
  let lastSourceSig = '';
  let lastAudioSig = '';

  function updateSourcesList() {
    const engine = studio?.replayEngine;
    if (sourceSel) {
      const available = engine?.getAvailableSources?.() || [
        { id: 'pgm', label: '🔴 PGM (Programa Master)', kind: 'program' }
      ];
      const sig = available.map((s) => `${s.id}:${s.label}`).join('|');
      if (sig !== lastSourceSig) {
        lastSourceSig = sig;
        const currentVal = sourceSel.value || 'pgm';
        sourceSel.innerHTML = available.map((s) =>
          `<option value="${s.id}" ${s.id === currentVal ? 'selected' : ''}>${s.label}</option>`
        ).join('');
      }
      updateActiveSourceBadge(sourceSel.value);
    }

    if (audioInSel) {
      const availableAudio = engine?.getAvailableAudioSources?.() || [
        { id: 'pgm', label: '🔴 Áudio PGM (Master)' },
        { id: 'mic', label: '🎤 Microfone do Host' },
        { id: 'mute', label: '🔇 Sem Áudio (Silencioso)' },
      ];
      const sig = availableAudio.map((a) => `${a.id}:${a.label}`).join('|');
      if (sig !== lastAudioSig) {
        lastAudioSig = sig;
        const curAudio = audioInSel.value || 'pgm';
        audioInSel.innerHTML = availableAudio.map((a) =>
          `<option value="${a.id}" ${a.id === curAudio ? 'selected' : ''}>${a.label}</option>`
        ).join('');
      }
    }
  }

  if (sourceSel) {
    sourceSel.onchange = () => {
      const selectedId = sourceSel.value;
      studio?.replayEngine?.setCaptureSource?.(selectedId);
      updateActiveSourceBadge(selectedId);

      // Se não há clipe gravado carregado em pausa, pré-visualiza a entrada ao vivo
      if (!currentClip) {
        previewLiveSource(selectedId);
      }
    };
  }

  if (audioInSel) {
    audioInSel.onchange = () => {
      studio?.replayEngine?.setAudioSource?.(audioInSel.value);
    };
  }

  updateSourcesList();
  // Atualiza dinamicamente caso entrem novas mídias/telas/convidados no estúdio
  setInterval(updateSourcesList, 2500);
}

function updateActiveSourceBadge() {
  const badge = $('#rp-active-source-badge');
  if (!badge) return;
  const engine = studio?.replayEngine;
  // Mostra sempre a fonte que o BUFFER está gravando — não a câmera só espiada no Preview.
  const sourceId = engine?.getCaptureSource?.() || 'pgm';
  const label = engine?.getSourceLabel?.(sourceId) || (sourceId === 'pgm' ? '🔴 PGM Master' : sourceId);
  badge.textContent = `REC: ${label.replace(/^[^\w\s]+/, '').trim()}`;
}

function previewLiveSource(sourceId) {
  if (!pvwVideo) return;
  const engine = studio?.replayEngine;
  const stream = engine?.resolveCaptureStream?.(sourceId);
  if (stream) {
    // Voltou ao vivo: descarta o clipe antigo do Preview (senão o TAKE/Tag usariam um clipe velho com o tempo do stream)
    currentClip = null;
    pvwLoadToken++; // cancela um clipe que ainda estava carregando
    pvwVideo.onended = null;
    pvwVideo.ontimeupdate = null;
    try { pvwVideo.removeAttribute('src'); } catch {}
    resetMarks();
    pvwVideo.srcObject = stream;
    pvwVideo.playbackRate = 1;
    pvwVideo.play().catch(() => {});
    updatePlayPauseUI(true);
    const scrub = $('#rp-scrub');
    if (scrub) scrub.value = 100;
    syncToPgm();
  }
}

function resetMarks() {
  markInTime = null;
  markOutTime = null;
  paintMarkButtons();
  renderScrubMarks();
}

function paintMarkButtons() {
  const bIn = $('#rp-btn-in');
  const bOut = $('#rp-btn-out');
  const inOn = markInTime !== null || pendingLiveIn !== null;
  const outOn = markOutTime !== null;
  if (bIn) { bIn.style.background = inOn ? '#00d2ff' : ''; bIn.style.color = inOn ? '#000' : ''; }
  if (bOut) { bOut.style.background = outOn ? '#ef4444' : ''; bOut.style.color = outOn ? '#fff' : ''; }
}

// Preview no sinal ao vivo (sem clipe carregado)
function isLivePreview() {
  return !pvwVideo || !!pvwVideo.srcObject || !pvwVideo.getAttribute('src');
}

// ---- Seekbar: faixa IN→OUT, bandeiras e régua com números ----
function fmtScrubTime(t, step = 1) {
  t = Math.max(0, t || 0);
  if (t >= 60) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return step < 1 ? `${t.toFixed(1)}s` : `${Math.round(t)}s`;
}

// Posição no trilho igual à do thumb do range (desconta meia bolinha de 9 px em cada ponta)
const scrubPos = (p) => `calc(9px + (100% - 18px) * ${Math.max(0, Math.min(1, p)).toFixed(5)})`;

let scrubTicksKey = '';
let liveMarkTimer = null;
function renderScrubMarks() {
  const ticks = $('#rp-scrub-ticks');
  const range = $('#rp-scrub-range');
  const mIn = $('#rp-scrub-in');
  const mOut = $('#rp-scrub-out');
  const time = $('#rp-scrub-time');
  if (!ticks || !range || !mIn || !mOut || !time) return;

  if (isLivePreview()) {
    range.hidden = true;
    mOut.hidden = true;
    if (scrubTicksKey !== 'live') { ticks.innerHTML = ''; scrubTicksKey = 'live'; }
    if (pendingLiveIn !== null) {
      // IN marcado ao vivo: bandeira na ponta (agora) contando há quanto tempo foi marcado, até o OUT
      const ago = (Date.now() - pendingLiveIn) / 1000;
      mIn.hidden = false;
      mIn.classList.add('live');
      mIn.style.left = scrubPos(1);
      mIn.querySelector('span').textContent = `IN -${ago.toFixed(1)}s`;
      time.className = 'bc-scrub-time pending';
      time.textContent = 'AGUARDANDO OUT';
      if (!liveMarkTimer) liveMarkTimer = setInterval(renderScrubMarks, 200);
    } else {
      mIn.hidden = true;
      time.className = 'bc-scrub-time live';
      time.textContent = 'AO VIVO';
      if (liveMarkTimer) { clearInterval(liveMarkTimer); liveMarkTimer = null; }
    }
    return;
  }
  if (liveMarkTimer) { clearInterval(liveMarkTimer); liveMarkTimer = null; }
  mIn.classList.remove('live');

  const dur = getClipDuration();
  // Régua: passo que dá no máximo ~10 números; só redesenha quando a duração muda
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => dur / s <= 10) || 600;
  const key = `${dur.toFixed(2)}|${step}`;
  if (key !== scrubTicksKey) {
    scrubTicksKey = key;
    let html = '';
    for (let t = 0; t <= dur + 1e-6; t += step) {
      // não encosta o último número no fim se ficar muito perto (os textos se sobrepõem)
      if (t > 0 && dur - t < step * 0.35 && t < dur) continue;
      html += `<span class="bc-scrub-tick" style="left:${((t / dur) * 100).toFixed(3)}%"><i></i><b>${fmtScrubTime(t, step)}</b></span>`;
    }
    html += `<span class="bc-scrub-tick" style="left:100%"><i></i><b>${fmtScrubTime(dur, 0.5)}</b></span>`;
    ticks.innerHTML = html;
  }

  const hasIn = markInTime !== null && Number.isFinite(markInTime);
  const hasOut = markOutTime !== null && Number.isFinite(markOutTime);
  mIn.hidden = !hasIn;
  mOut.hidden = !hasOut;
  if (hasIn) {
    mIn.style.left = scrubPos(markInTime / dur);
    mIn.querySelector('span').textContent = `IN ${fmtScrubTime(markInTime, 0.5)}`;
  }
  if (hasOut) {
    mOut.style.left = scrubPos(markOutTime / dur);
    mOut.querySelector('span').textContent = `OUT ${fmtScrubTime(markOutTime, 0.5)}`;
  }
  range.hidden = !(hasIn || hasOut);
  if (!range.hidden) {
    const a = hasIn ? markInTime / dur : 0;
    const b = hasOut ? markOutTime / dur : 1;
    range.style.left = scrubPos(a);
    range.style.width = `calc((100% - 18px) * ${Math.max(0, Math.min(1, b) - Math.max(0, a)).toFixed(5)})`;
  }

  time.className = 'bc-scrub-time';
  time.textContent = `${fmtScrubTime(pvwVideo?.currentTime || 0, 0.5)} / ${fmtScrubTime(dur, 0.5)}`;
}

// Aplica as marcas guardadas depois que o clipe carregou (duração real já conhecida)
function applyPendingClipMarks() {
  let pm = pendingClipMarks;
  pendingClipMarks = null;
  // IN marcado ao vivo e o operador entrou no replay pela T-Bar, -5s/-10s, jog ou scrub: o IN vale para esse clipe
  if (!pm && pendingLiveIn !== null && currentClip?.startWall) {
    pm = { in: (pendingLiveIn - currentClip.startWall) / 1000, seek: 'in' };
    pendingLiveIn = null;
  }
  if (pm) {
    const vd = pvwVideo?.duration;
    // Limite superior só com a duração real do vídeo; a estimativa pode ser menor que o arquivo
    const dur = Number.isFinite(vd) && vd > 0 ? vd : Infinity;
    const clamp = (v) => Math.max(0, Math.min(dur, v));
    if (pm.in !== null && pm.in !== undefined && Number.isFinite(pm.in)) markInTime = clamp(pm.in);
    if (pm.out !== null && pm.out !== undefined && Number.isFinite(pm.out)) markOutTime = clamp(pm.out);
    if (markInTime !== null && markOutTime !== null && markOutTime <= markInTime) markOutTime = null;
    if (pm.seek === 'in' && markInTime !== null) pvwVideo.currentTime = markInTime;
  }
  paintMarkButtons();
  renderScrubMarks();
}

// OUT apertado com o Preview ao vivo (fluxo de mesa de replay): recorta do buffer o trecho do IN (ou dos
// últimos 10 s) até agora e salva DIRETO na lista de lances, com IN/OUT. O Preview continua no ao vivo e o
// IN é liberado na hora, então o operador segue marcando os próximos lances sem parar.
async function captureLiveMoment(tag = 'LANCE') {
  const engine = studio?.replayEngine;
  if (!engine) return;
  if (!engine.getStats?.().active) {
    engine.startBuffer?.();
    updateBufferStatus();
    flashPvwStatus('BUFFER INICIADO — AGUARDE 2s');
    return;
  }
  const outWall = Date.now();
  const inWall = pendingLiveIn !== null && pendingLiveIn < outWall ? pendingLiveIn : outWall - 10000;
  pendingLiveIn = null;
  const bOut = $('#rp-btn-out');
  if (bOut) { bOut.style.background = '#ef4444'; bOut.style.color = '#fff'; setTimeout(paintMarkButtons, 350); }
  paintMarkButtons();
  renderScrubMarks();
  capturingLive = true;
  try {
    // O MediaRecorder entrega o vídeo em pedaços de 1 s: espera chegar o pedaço que já contém o OUT
    const t0 = Date.now();
    while ((engine.lastChunkWall?.() || 0) < outWall && Date.now() - t0 < 1800) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await engine.flushBuffer?.();
    // 1,5 s antes do IN: contexto para o operador e garantia de um keyframe antes do ponto marcado
    const clip = await engine.createClip((Date.now() - inWall) / 1000 + 1.5);
    if (!clip || !clip.url) {
      flashPvwStatus('BUFFER ENCHENDO — AGUARDE');
      return;
    }
    const dur = clip.duration || 10;
    const clamp = (v) => Math.max(0, Math.min(dur, v));
    const mIn = clip.startWall ? clamp((inWall - clip.startWall) / 1000) : 0;
    const mOut = clip.startWall ? clamp((outWall - clip.startWall) / 1000) : dur;
    const n = highlights.length + 1;
    const hora = new Date(inWall).toLocaleTimeString('pt-BR');
    const item = {
      id: `clip_${Date.now()}`,
      title: tag === 'LANCE' ? `#${n} · ${hora}` : `${tag} · ${hora}`,
      tag,
      url: clip.url,
      blob: clip.blob,
      duration: Math.max(0.1, mOut - mIn),
      // duração do ARQUIVO (tem 1,5 s antes do IN): sem isso, ao reabrir, o OUT era cortado na duração do lance
      clipDuration: dur,
      speed: currentSpeed,
      sourceId: camSources[activeCamSlot] || 'pgm',
      markIn: mIn,
      markOut: mOut,
    };
    highlights.push(item);
    savePlaylistOrder();
    renderPlaylist();
    flashPvwStatus(`LANCE ${n} SALVO NA LISTA (${item.duration.toFixed(1)}s)`);
    await persistHighlight(item, clip);
  } finally {
    capturingLive = false;
  }
}

// -------------------------------------------------------------
// MULTI-CÂMERA / SELEÇÃO INDEPENDENTE DAS 4 CÂMERAS & MODOS
// -------------------------------------------------------------
function initMultiCam() {
  // 1. Botões de Modo: 1 Câmera vs 4 Câmeras (Quad)
  const btnSingle = $('#rp-btn-mode-single');
  const btnQuad = $('#rp-btn-mode-quad');

  if (btnSingle) {
    btnSingle.onclick = () => setViewMode('single');
  }
  if (btnQuad) {
    btnQuad.onclick = () => setViewMode('quad');
  }

  // 2. Botões de Ângulo (CAM 1 a CAM 4)
  const angleBtns = $$('#rp-angle-buttons .bc-cam-btn');
  angleBtns.forEach((btn) => {
    btn.onclick = () => {
      const slotNum = parseInt(btn.dataset.camSlot, 10);
      setActiveCamSlot(slotNum);
      // No ISO o ângulo é só selecionado; sair para 1 câmera desligaria os 4 buffers.
      if (viewMode === 'quad' && !quadIso?.isActive()) {
        setViewMode('single');
      }
    };
  });

  // 3. Botões SOLO em cada quadrante do Quad Grid
  $$('.bc-slot-solo-btn').forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const slotNum = parseInt(btn.dataset.camSlot, 10);
      setActiveCamSlot(slotNum);
      if (!quadIso?.isActive()) setViewMode('single');
    };
  });

  // 4. Seletores de sinal nos 4 slots do Quad Grid
  for (let i = 1; i <= 4; i++) {
    const slotSel = $(`#rp-slot-sel-${i}`);
    if (slotSel) {
      // O change já é tratado em bindEvents (addEventListener); manter também o onchange
      // chamava setCamSource duas vezes e reiniciava o buffer em dobro.
      slotSel.onclick = (e) => e.stopPropagation();
    }
  }

  // 5. Clique em qualquer quadrante seleciona a câmera ativa
  $$('.bc-cam-slot').forEach((slot) => {
    slot.onclick = () => {
      const slotNum = parseInt(slot.dataset.camSlot, 10);
      if (slotNum) {
        setActiveCamSlot(slotNum);
      }
    };
  });

  populateSlotSelectors();
  // Atualiza a lista caso novos sinais entrem no estúdio
  setInterval(populateSlotSelectors, 3000);
}

// Buffer ISO dos 4 ângulos: cada CAM tem ring buffer próprio (30 s) e o quadrante passa a
// mostrar os 4 clipes alinhados no mesmo instante de parede (VAR de verdade, não 4 sinais ao vivo).
function initQuadIso() {
  quadIso = createQuadIso({
    getStudio: () => studio,
    camSources,
    getSpeed: () => currentSpeed,
    toast: (msg) => studio?.toast?.(msg),
    onTime: (t, dur) => {
      if (pgmOnAir()) return; // replay no ar: o tick do PGM atualiza o transporte
      const tc = $('#rp-pvw-timecode');
      if (tc) tc.textContent = formatTimecode(t);
      const scrub = $('#rp-scrub');
      if (scrub && dur > 0 && !scrub.matches(':active')) scrub.value = String((t / dur) * 100);
      const timeEl = $('#rp-scrub-time');
      if (timeEl && dur > 0) {
        timeEl.className = 'bc-scrub-time';
        timeEl.textContent = `${fmtScrubTime(t, 0.5)} / ${fmtScrubTime(dur, 0.5)}`;
      }
    },
    onState: (st) => {
      const btn = $('#rp-btn-iso');
      if (btn) {
        btn.classList.toggle('active', !!st.enabled);
        btn.textContent = st.enabled ? 'ISO ON' : 'ISO 4 CAM';
      }
      const load = $('#rp-btn-iso-load');
      if (load) load.style.display = st.enabled ? 'inline-flex' : 'none';
    },
  });
  quadIso.attachVideos({
    1: $('#rp-qcam-1'),
    2: $('#rp-qcam-2'),
    3: $('#rp-qcam-3'),
    4: $('#rp-qcam-4'),
  });
}

// Medidor do custo do ISO: FPS real do programa (medido no estúdio) vs alvo do preset.
function updateIsoPerf() {
  const el = $('#rp-iso-perf');
  if (!el) return;
  if (!quadIso?.isActive()) {
    el.textContent = '';
    el.classList.remove('warn');
    return;
  }
  const fps = Math.round(Number(studio?.renderFps) || 0);
  const target = Math.round(Number(studio?.renderTargetFps) || 30);
  const clips = quadIso.getState?.().clips || 0;
  el.textContent = `${fps}/${target} fps · ${clips}/4`;
  el.classList.toggle('warn', fps > 0 && fps < target * 0.85);
  el.title = `Programa: ${fps} fps de ${target} fps · ${clips} de 4 ângulos congelados. Clique para o diagnóstico.`;
  el.style.cursor = 'pointer';
  if (!el.onclick) el.onclick = showIsoReport;
}

// Diagnóstico do ISO (clique no medidor de FPS): mostra fonte, áudio, buffer, prontidão e deriva de
// cada ângulo. É o dado que faltava para separar "bug de lógica" de "custo/stream ausente".
function showIsoReport() {
  if (!quadIso?.isActive()) return;
  const st = quadIso.getState?.() || {};
  const fps = Math.round(Number(studio?.renderFps) || 0);
  const target = Math.round(Number(studio?.renderTargetFps) || 30);
  const rows = (quadIso.getDiagnostics?.() || []).map((d) => (
    `CAM${d.slot} · fonte=${d.source} · áudio=${d.audio} · buffer=${d.bufferSecs}s${d.recording ? '' : ' (PARADO)'}` +
    ` · clipe=${d.clip ? 'sim' : 'não'} · ready=${d.readyState} · t=${d.currentTime ?? '—'}s` +
    (d.drift === null ? '' : ` · deriva=${d.drift}s`)
  ));
  const lines = [
    'ISO 4 CAM — diagnóstico',
    `Programa: ${fps}/${target} fps ${fps > 0 && fps < target * 0.85 ? '(ABAIXO do alvo: custo alto)' : ''}`,
    `Quadrante: ${st.clips || 0}/4 ângulos · ${st.playing ? 'TOCANDO' : 'PAUSADO'} · ${(st.time || 0).toFixed(1)}s / ${(st.duration || 0).toFixed(1)}s`,
    '',
    ...rows,
    '',
    'Deriva > 0,2s = dessincronizado; buffer 0 = fonte sem stream; ready < 2 = vídeo ainda carregando.',
  ];
  try { console.info(lines.join('\n')); } catch {}
  alert(lines.join('\n'));
}

function toggleIsoBuffer() {
  if (!quadIso) return;
  if (quadIso.isActive()) {
    quadIso.disable();
    if (viewMode === 'quad') populateQuadCameras(); // volta ao multiview ao vivo
    studio?.toast?.('ISO 4 CAM desligado — buffers liberados');
    return;
  }
  if (viewMode !== 'quad') setViewMode('quad');
  quadIso.enable();
}

function setViewMode(mode) {
  viewMode = mode;
  const quadGrid = $('#rp-quad-grid');
  const mainVideo = $('#rp-video-pvw');
  const btnSingle = $('#rp-btn-mode-single');
  const btnQuad = $('#rp-btn-mode-quad');

  if (mode === 'quad') {
    if (quadGrid) quadGrid.style.display = 'grid';
    if (mainVideo) mainVideo.style.display = 'none';
    btnSingle?.classList.remove('active');
    btnQuad?.classList.add('active');
    populateQuadCameras();
  } else {
    // Sair do quadrante libera os 4 encoders ISO (senão continuariam gastando CPU escondidos).
    if (quadIso?.isActive()) quadIso.disable();
    if (quadGrid) quadGrid.style.display = 'none';
    if (mainVideo) mainVideo.style.display = 'block';
    btnSingle?.classList.add('active');
    btnQuad?.classList.remove('active');

    // Modo 1 Câmera: pré-visualiza a câmera ativa
    if (!currentClip) {
      previewLiveSource(camSources[activeCamSlot] || 'pgm');
    }
  }
}

function setActiveCamSlot(slotNum) {
  activeCamSlot = slotNum;

  // Atualiza botões de ângulo
  $$('#rp-angle-buttons .bc-cam-btn').forEach((b) => {
    b.classList.toggle('active', parseInt(b.dataset.camSlot, 10) === slotNum);
  });

  // Atualiza destaque no quad grid
  $$('.bc-cam-slot').forEach((s) => {
    s.classList.toggle('active-cam', parseInt(s.dataset.camSlot, 10) === slotNum);
  });

  // Sinal selecionado para essa câmera
  const targetSource = camSources[slotNum] || 'pgm';

  // IMPORTANTE: escolher um ângulo para OLHAR não troca a fonte gravada (antes cada clique
  // reiniciava o MediaRecorder e zerava os 45 s de buffer). A fonte de gravação é o seletor
  // "Sinal de entrada" no cabeçalho; aqui só muda o Preview/multiview.
  updateActiveSourceBadge();
  if (quadIso?.isActive()) quadIso.setActive(slotNum);

  // Se estiver no modo 1 Câmera e sem clipe congelado, atualiza o preview ao vivo
  if (viewMode === 'single' && !currentClip && !quadIso?.isActive()) {
    previewLiveSource(targetSource);
  }
}

function setCamSource(slotNum, sourceId) {
  // Com o ISO ativo, o seletor do slot precisa trocar a captura DAQUELE ângulo (senão o VAR
  // continuava gravando a câmera antiga). O quadrante é recongelado em ~3 s.
  if (quadIso?.isActive()) {
    if (!quadIso.setSlotSource?.(slotNum, sourceId)) return;
  }
  camSources[slotNum] = sourceId;

  // Trocar o sinal do slot não troca a gravação (ver setActiveCamSlot): só o Preview/multiview.
  if (slotNum === activeCamSlot && viewMode === 'single' && !currentClip) {
    previewLiveSource(sourceId);
  }
  updateActiveSourceBadge();

  // Atualiza o quadrante correspondente no modo Quad
  populateQuadCameras();
}

let slotSignature = '';

function populateSlotSelectors() {
  const engine = studio?.replayEngine;
  const available = engine?.getAvailableSources?.() || [
    { id: 'pgm', label: '🔴 PGM (Programa Master)', kind: 'program' }
  ];

  // Se não foram definidas, infere fontes padrão úteis para as 4 câmeras
  if (!camSources[2] || camSources[2] === 'host:cam') {
    const alt = available.find((s) => s.id !== 'pgm' && s.id.startsWith('host:cam'));
    if (alt) camSources[2] = alt.id;
  }
  if (!camSources[3] || camSources[3] === 'media') {
    const alt = available.find((s) => s.kind === 'media' || s.kind === 'screen');
    if (alt) camSources[3] = alt.id;
  }
  if (!camSources[4] || camSources[4] === 'screen') {
    const alt = available.find((s) => s.id.startsWith('guest:') || s.id.startsWith('remote:'));
    if (alt) camSources[4] = alt.id;
  }

  const sig = available.map((s) => `${s.id}:${s.label}`).join('|');
  const rebuild = sig !== slotSignature;
  if (rebuild) slotSignature = sig;
  for (let i = 1; i <= 4; i++) {
    const slotSel = $(`#rp-slot-sel-${i}`);
    if (slotSel) {
      const cur = camSources[i] || (i === 1 ? 'pgm' : available[i - 1]?.id || 'pgm');
      camSources[i] = cur;
      if (!rebuild) continue;
      slotSel.innerHTML = available.map((s) =>
        `<option value="${s.id}" ${s.id === cur ? 'selected' : ''}>${s.label}</option>`
      ).join('');
    }
  }

  if (viewMode === 'quad') {
    populateQuadCameras();
  }
}

function populateQuadCameras() {
  // Com ISO ativo quem manda nos 4 <video> é o replay-quad (clipes congelados/sincronizados).
  if (quadIso?.isActive()) return;
  for (let i = 1; i <= 4; i++) {
    const vid = $(`#rp-qcam-${i}`);
    const sourceId = camSources[i] || 'pgm';
    if (!vid) continue;

    if (sourceId === 'pgm' && studio?.programStream) {
      if (vid.srcObject !== studio.programStream) {
        vid.srcObject = studio.programStream;
        vid.play().catch(() => {});
      }
      continue;
    }

    const engine = studio?.replayEngine;
    const stream = engine?.resolveCaptureStream?.(sourceId);
    if (stream && vid.srcObject !== stream) {
      vid.srcObject = stream;
      vid.play().catch(() => {});
    }
  }
}



// FPS real do preset do estúdio (30/60). O passo de quadro e o timecode eram fixos em 30,
// então num preset 60 "1 quadro" andava 2 e o TC atrasava.
function clipFps() {
  const f = Number(studio?.S?.system?.presets?.[studio?.S?.preset]?.fps);
  return f >= 24 && f <= 120 ? f : 30;
}

function getClipDuration() {
  if (quadIso?.isActive()) return quadIso.getState().duration || 10;
  // Duração real do vídeo primeiro (resolvida em loadClipToPreview); a estimativa do motor só como reserva
  if (pvwVideo && !pvwVideo.srcObject && Number.isFinite(pvwVideo.duration) && pvwVideo.duration > 0) {
    return pvwVideo.duration;
  }
  if (currentClip && Number.isFinite(currentClip.duration) && currentClip.duration > 0) {
    return currentClip.duration;
  }
  return 10;
}

async function ensureClipReady() {
  if (currentClip && pvwVideo.src && !pvwVideo.srcObject) return currentClip;
  const engine = studio?.replayEngine;
  if (!engine) return null;
  const stat = engine.getStats?.();
  const dur = Math.max(3, stat?.duration || 10);
  const clip = await engine.createClip(dur);
  if (clip && clip.url) {
    currentClip = clip;
    await loadClipToPreview(clip.url, false);
    return clip;
  }
  return null;
}


async function seekToLiveHead() {
  await ensureClipReady();
  const dur = getClipDuration();
  pvwVideo.currentTime = dur;
  updateTimecode();
  drawVarOverlay();
}

async function stepSeconds(sec) {
  await ensureClipReady();
  const dur = getClipDuration();
  const cur = pvwVideo.currentTime || 0;
  pvwVideo.currentTime = Math.max(0, Math.min(dur, cur + sec));
  updateTimecode();
  drawVarOverlay();
}

// T-BAR Slow-Motion Fader & LED Ladder
function initTBar() {
  const tbar = $('#bc-tbar');
  if (!tbar) return;

  tbar.oninput = () => {
    const val = parseFloat(tbar.value);
    const speed = Math.max(0.05, val / 100);
    setSpeed(speed);
  };
}

async function setSpeed(speed, opts = {}) {
  currentSpeed = Math.max(0.05, Math.min(2.0, speed));
  if (quadIso?.isActive()) quadIso.setSpeed(currentSpeed);

  // Atualiza slider T-Bar se chamado por preset
  const tbar = $('#bc-tbar');
  if (tbar && !tbar.matches(':active')) {
    tbar.value = Math.round(currentSpeed * 100);
  }

  // Atualiza escada de LED (LED Ladder)
  const segments = $$('.bc-led-segment');
  segments.forEach((seg) => {
    const lvl = parseFloat(seg.dataset.level);
    if (currentSpeed >= lvl - 0.05) {
      seg.classList.add('lit');
      if (lvl >= 0.8) seg.classList.add('high');
      else if (lvl >= 0.4) seg.classList.add('mid');
    } else {
      seg.classList.remove('lit', 'high', 'mid');
    }
  });

  // Atualiza botões de preset
  $$('.bc-deck [data-speed]').forEach((b) => {
    b.classList.toggle('active', Math.abs(parseFloat(b.dataset.speed) - currentSpeed) < 0.08);
  });

  // COMPORTAMENTO EVS LSM NATIVO:
  // Se o monitor Preview está no sinal ao vivo (pvwVideo.srcObject) e o operador move a T-Bar
  // para câmera lenta (< 0.98), entra imediatamente no buffer recente na velocidade da T-Bar!
  // A trava evita que cada evento do arrasto da T-Bar dispare um corte novo enquanto o primeiro carrega.
  if (pvwVideo && pvwVideo.srcObject && currentSpeed < 0.98) {
    if (!enteringReplay) {
      enteringReplay = true;
      try {
        await triggerReplay(10);
      } finally {
        enteringReplay = false;
      }
    }
  } else if (pvwVideo) {
    pvwVideo.playbackRate = currentSpeed;
    pvwVideo.preservesPitch = true;
  }

  // Atualiza em tempo real a velocidade de playout no PGM (via TAKE direto ou espelho).
  // `applyPgm:false` é usado ao carregar um lance da lista: o operador está PREPARANDO o Preview e
  // não pode mudar a velocidade do replay que já está no ar.
  if (opts.applyPgm !== false) {
    const engine = studio?.replayEngine;
    engine?.setPlayoutSpeed?.(currentSpeed);
  }

  // Atualiza indicadores de velocidade no monitor PGM do console
  const boxPgm = $('#rp-box-pgm');
  const isPgmOnAir = boxPgm?.classList.contains('live-active');
  if (isPgmOnAir || isLiveMirrorActive) {
    const speedTag = $('#rp-pgm-speed-tag');
    if (speedTag) {
      const pct = Math.round(currentSpeed * 100);
      const prefix = isLiveMirrorActive ? 'MIRROR' : 'REPLAY';
      speedTag.textContent = pvwVideo?.paused ? `${prefix} (PAUSA)` : (pct < 100 ? `${prefix} (${pct}%)` : `${prefix} (100%)`);
    }
    const bugText = $('#rp-onair-bug-text');
    if (bugText) {
      const pct = Math.round(currentSpeed * 100);
      bugText.textContent = pct < 100 ? `REPLAY ${pct}%` : 'REPLAY';
    }
  }

  syncToPgm();
}

// Jog Wheel / Shuttle com precisão milimétrica
function initJogWheel() {
  const jog = $('#rp-jog');
  if (!jog) return;
  let isDragging = false;
  let startX = 0;
  let angle = 0;

  jog.addEventListener('pointerdown', (e) => {
    isDragging = true;
    startX = e.clientX;
    jog.setPointerCapture(e.pointerId);
  });

  jog.addEventListener('pointermove', async (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    startX = e.clientX;
    angle += dx * 4;
    jog.style.transform = `rotate(${angle}deg)`;
    if (Math.abs(dx) > 1) {
      await stepFrame(dx > 0 ? 1 : -1);
    }
  });

  const stop = () => { isDragging = false; };
  jog.addEventListener('pointerup', stop);
  jog.addEventListener('pointercancel', stop);

  // Roda do mouse sobre a roda jog
  jog.addEventListener('wheel', async (e) => {
    e.preventDefault();
    await stepFrame(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
}

// Disparo retroativo de replay
let enteringReplay = false;
async function triggerReplay(seconds) {
  const engine = studio?.replayEngine;
  if (!engine) {
    alert('Motor de Replay não inicializado no estúdio.');
    return;
  }

  const stats = engine.getStats?.() || {};
  if (!stats.active) {
    engine.startBuffer?.();
    updateBufferStatus();
    flashPvwStatus('BUFFER INICIADO — AGUARDE 2s');
    return;
  }

  // Com IN marcado ao vivo, o clipe precisa voltar até o IN (senão o ponto marcado fica fora do clipe)
  if (pendingLiveIn !== null) {
    seconds = Math.max(seconds, (Date.now() - pendingLiveIn) / 1000 + 1.5);
  }
  const clip = await engine.createClip(seconds);
  if (!clip || !clip.url) {
    // Buffer acabou de ligar e ainda não tem o 1º segundo gravado: avisa em vez de não fazer nada
    flashPvwStatus('BUFFER ENCHENDO — AGUARDE');
    return;
  }

  currentClip = clip;
  await loadClipToPreview(clip.url, true);
  if (autoTake) {
    // Padrão: o gatilho já entra no ar. O operador desliga no botão AUTO do console/remoto.
    try { await pvwVideo.play(); } catch {}
    await takePreviewToPgm();
  }
}

// Mensagem rápida no canto do monitor de Preview (usa o mesmo selo de PLAY/PAUSADO)
function flashPvwStatus(text) {
  const overlay = $('#rp-pvw-status');
  const overlayText = $('#rp-pvw-status-text');
  if (!overlay || !overlayText) return;
  overlay.style.display = 'inline-flex';
  overlay.className = 'bc-pvw-status-overlay paused';
  overlayText.textContent = text;
  clearTimeout(overlay._hideTimer);
  overlay._hideTimer = setTimeout(() => { overlay.style.display = 'none'; }, 2200);
}

// Abre/copia o controle remoto de Replay para outro dispositivo na mesma rede.
function openRemoteReplayControl() {
  const base = window.opener?.__castdeck?.remote?.link?.();
  if (!base) {
    flashPvwStatus('ABRA O CONSOLE PELO ESTÚDIO PARA GERAR O LINK');
    return;
  }
  const url = base + (base.includes('?') ? '&' : '?') + 'tab=replay';
  try { navigator.clipboard?.writeText(url); } catch {}
  flashPvwStatus('LINK COPIADO — ABRA NO TABLET/CELULAR');
  try { window.open(url, 'CastDeckReplayRemote', 'width=480,height=880'); } catch {}
}

function onPvwTimeUpdate() {
  if (pgmOnAir()) return; // quem manda no scrub/timecode é o replay NO AR
  updateTimecode();
  const dur = getClipDuration();
  if (dur > 0 && !$('#rp-scrub')?.matches(':active')) {
    const pct = Math.max(0, Math.min(100, (pvwVideo.currentTime / dur) * 100));
    const scrub = $('#rp-scrub');
    if (scrub) scrub.value = pct;
  }
  // Se houver Mark OUT definido e a reprodução atingir ou ultrapassar esse ponto, pausa no Mark OUT
  if (markOutTime !== null && Number.isFinite(markOutTime) && pvwVideo.currentTime >= markOutTime && !pvwVideo.paused) {
    pvwVideo.pause();
    pvwVideo.currentTime = markOutTime;
    updatePlayPauseUI(false);
  }
  renderScrubMarks();
  syncToPgm();
}

function updatePlayPauseUI(playing) {
  isPlaying = !!playing;
  const btnPlay = $('#rp-btn-play');
  const btnPause = $('#rp-btn-pause');
  const overlay = $('#rp-pvw-status');
  const overlayText = $('#rp-pvw-status-text');

  if (btnPlay) btnPlay.classList.toggle('active', isPlaying);
  if (btnPause) btnPause.classList.toggle('active', !isPlaying);

  if (overlay && overlayText) {
    overlay.style.display = 'inline-flex';
    if (!isPlaying) {
      overlay.className = 'bc-pvw-status-overlay paused';
      overlayText.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px;margin-right:4px"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>PAUSADO';
    } else {
      overlay.className = 'bc-pvw-status-overlay playing';
      const pct = Math.round(currentSpeed * 100);
      overlayText.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px;margin-right:4px"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>' + (pct < 100 ? `PLAY ${pct}%` : 'PLAY');
      clearTimeout(overlay._hideTimer);
      overlay._hideTimer = setTimeout(() => {
        if (isPlaying) overlay.style.display = 'none';
      }, 1600);
    }
  }
}

let pvwLoadToken = 0;
function loadClipToPreview(url, autoPlay = true) {
  const token = ++pvwLoadToken;
  // Clipe novo = marcas IN/OUT novas (não herdar tempos do clipe anterior)
  resetMarks();
  // Libera srcObject do preview ao vivo para permitir que o vídeo do clipe reproduza perfeitamente
  try {
    pvwVideo.srcObject = null;
  } catch {}
  pvwVideo.ontimeupdate = null;
  pvwVideo.src = url;
  pvwVideo.preservesPitch = true;
  applyAudioRouting();
  pvwVideo.load();
  // load() volta playbackRate para 1.0: por isso a velocidade é reaplicada depois do carregamento e no play
  pvwVideo.onplay = () => {
    pvwVideo.preservesPitch = true;
    pvwVideo.playbackRate = currentSpeed;
  };
  pvwVideo.onended = () => {
    updatePlayPauseUI(false);
  };

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (token !== pvwLoadToken) return resolve(); // outro clipe já foi carregado por cima
      pvwVideo.ondurationchange = null;
      $('#rp-box-pvw')?.classList.add('cue-active');
      pvwVideo.currentTime = 0;
      pvwVideo.playbackRate = currentSpeed;
      pvwVideo.ontimeupdate = onPvwTimeUpdate;
      // IN/OUT capturados ao vivo ou vindos da playlist: só agora a duração real é conhecida
      applyPendingClipMarks();
      if (autoPlay) {
        pvwVideo.play().catch(() => {});
        updatePlayPauseUI(true);
      } else {
        pvwVideo.pause();
        updatePlayPauseUI(false);
      }
      updateTimecode();
      resizeVarCanvas();
      syncToPgm();
      resolve();
    };
    pvwVideo.onloadedmetadata = () => {
      if (Number.isFinite(pvwVideo.duration)) return finish();
      // WebM do MediaRecorder vem sem duração (Infinity): pedir um tempo enorme faz o Chromium varrer o
      // arquivo e publicar a duração real (~90 ms medidos). Sem isso scrub, jog e IN/OUT usavam 10 s fixos.
      pvwVideo.ondurationchange = () => {
        if (Number.isFinite(pvwVideo.duration)) finish();
      };
      pvwVideo.currentTime = 1e101;
    };
    pvwVideo.onerror = () => finish();
    setTimeout(finish, 2500);
  });
}

async function playClip() {
  if (pgmOnAir()) {
    engineOf()?.playPlayout?.();
    updatePlayPauseUI(true);
    updatePgmTransportUI();
    return;
  }
  if (quadIso?.isActive()) {
    quadIso.play();
    updatePlayPauseUI(true);
    return;
  }
  await ensureClipReady();
  pvwVideo.playbackRate = currentSpeed;
  pvwVideo.play().catch(() => {});
  updatePlayPauseUI(true);
  syncToPgm();
}

async function pauseClip() {
  if (pgmOnAir()) {
    engineOf()?.pausePlayout?.();
    updatePlayPauseUI(false);
    updatePgmTransportUI();
    return;
  }
  if (quadIso?.isActive()) {
    quadIso.pause();
    updatePlayPauseUI(false);
    return;
  }
  await ensureClipReady();
  pvwVideo.pause();
  updatePlayPauseUI(false);
  syncToPgm();
}

async function togglePlayPause() {
  if (pgmOnAir()) {
    const st = engineOf()?.getPlayoutState?.() || {};
    const eng = engineOf();
    if (st.paused) eng?.playPlayout?.();
    else eng?.pausePlayout?.();
    updatePlayPauseUI(!!st.paused);
    updatePgmTransportUI();
    return;
  }
  if (quadIso?.isActive()) {
    if (quadIso.getState().playing) await pauseClip();
    else await playClip();
    return;
  }
  if (!pvwVideo.src && !currentClip) {
    await triggerReplay(10);
    pvwVideo.pause();
    updatePlayPauseUI(false);
    syncToPgm();
    return;
  }
  if (pvwVideo.paused) {
    await playClip();
  } else {
    await pauseClip();
  }
}

async function stepFrame(dir) {
  if (pgmOnAir()) {
    // Jog/quadro a quadro no replay que está NO AR (não no Preview).
    engineOf()?.stepPlayout?.(dir / clipFps());
    updatePlayPauseUI(false);
    updatePgmTransportUI();
    return;
  }
  if (quadIso?.isActive()) {
    quadIso.step(dir);
    updatePlayPauseUI(false);
    return;
  }
  await ensureClipReady();
  pvwVideo.pause();
  updatePlayPauseUI(false);
  const dur = getClipDuration();
  const cur = pvwVideo.currentTime || 0;
  pvwVideo.currentTime = Math.max(0, Math.min(dur, cur + dir * (1 / clipFps())));
  updateTimecode();
  drawVarOverlay();
  syncToPgm();
}

// IN/OUT a qualquer momento: no clipe marca o ponto do Preview; ao vivo o IN guarda a hora e o OUT
// recorta o lance do buffer já com as duas marcas (fluxo EVS: marca no lance e revisa depois).
function markIn() {
  if (!pvwVideo) return;
  if (isLivePreview()) {
    const engine = studio?.replayEngine;
    if (engine && !engine.getStats?.().active) {
      engine.startBuffer?.();
      updateBufferStatus();
    }
    pendingLiveIn = Date.now();
    paintMarkButtons();
    renderScrubMarks();
    flashPvwStatus('IN MARCADO — APERTE OUT NO FIM DO LANCE');
    return;
  }
  markInTime = pvwVideo.currentTime;
  if (markOutTime !== null && markOutTime <= markInTime) markOutTime = null;
  paintMarkButtons();
  renderScrubMarks();
}

function markOut() {
  if (!pvwVideo) return;
  if (isLivePreview()) {
    captureLiveMoment();
    return;
  }
  markOutTime = pvwVideo.currentTime;
  if (markInTime !== null && markInTime >= markOutTime) markInTime = null;
  paintMarkButtons();
  renderScrubMarks();
}

function formatTimecode(cur) {
  const m = Math.floor(cur / 60);
  const s = Math.floor(cur % 60);
  const f = Math.floor((cur % 1) * clipFps());
  return `00:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(f).padStart(2,'0')}`;
}

function updateTimecode() {
  if (pgmOnAir()) {
    const st = engineOf()?.getPlayoutState?.() || {};
    $('#rp-pvw-timecode').textContent = formatTimecode(st.onAir ? st.time || 0 : pvwVideo.currentTime || 0);
    return;
  }
  $('#rp-pvw-timecode').textContent = formatTimecode(pvwVideo.currentTime || 0);
}

// Atualiza o transporte/UI para refletir o replay que está NO AR (PGM), inclusive o botão jog/pausa
// e o selo de velocidade. Chamado pelo tick do console (a cada quadro).
function updatePgmTransportUI() {
  if (!pgmOnAir()) return;
  const st = engineOf()?.getPlayoutState?.() || {};
  const scrub = $('#rp-scrub');
  if (scrub && st.duration > 0 && !scrub.matches(':active')) scrub.value = String(Math.min(100, Math.max(0, (st.time / st.duration) * 100)));
  const tc = $('#rp-pvw-timecode');
  if (tc && st.duration > 0) tc.textContent = formatTimecode(st.time || 0);
  const timeEl = $('#rp-scrub-time');
  if (timeEl && st.duration > 0) timeEl.textContent = `${fmtScrubTime(st.time || 0, 0.5)} / ${fmtScrubTime(st.duration, 0.5)}`;
  const tag = $('#rp-pgm-speed-tag');
  if (tag) {
    const pct = Math.round((st.baseSpeed || st.speed || 1) * 100);
    tag.textContent = st.paused ? 'REPLAY (PAUSA)' : pct < 100 ? `REPLAY (${pct}%)` : 'REPLAY';
    tag.style.color = '#ef4444';
  }
  updatePlayPauseUI(!st.paused);
  // Marca na lista qual clipe está NO AR (mesmo depois de reordenar/recarregar a página).
  const onAirUrl = st.url || '';
  $$('#rp-playlist .bc-clip-card').forEach((card) => card.classList.toggle('active', !!onAirUrl && card.dataset.url === onAirUrl));
}

// Sintetizador Broadcast de Som de Transição Stinger (Whoosh + Sub-Bass + Ping)
function playStingerSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const t0 = audioCtx.currentTime;

    // 1. Whoosh de Ruído Branco com Bandpass ressonante varrendo frequência
    const bufferSize = Math.floor(audioCtx.sampleRate * 0.55);
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.Q.setValueAtTime(3.0, t0);
    noiseFilter.frequency.setValueAtTime(350, t0);
    noiseFilter.frequency.exponentialRampToValueAtTime(3200, t0 + 0.28);
    noiseFilter.frequency.exponentialRampToValueAtTime(400, t0 + 0.55);

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.01, t0);
    noiseGain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.28);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);

    whiteNoise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    whiteNoise.start(t0);
    whiteNoise.stop(t0 + 0.55);

    // 2. Impacto Sub-Bass Punch (160Hz -> 38Hz)
    const subOsc = audioCtx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(160, t0);
    subOsc.frequency.exponentialRampToValueAtTime(38, t0 + 0.45);

    const subGain = audioCtx.createGain();
    subGain.gain.setValueAtTime(0.4, t0);
    subGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);

    subOsc.connect(subGain);
    subGain.connect(audioCtx.destination);
    subOsc.start(t0);
    subOsc.stop(t0 + 0.5);

    // 3. Ping metálico de transição
    const pingOsc = audioCtx.createOscillator();
    pingOsc.type = 'triangle';
    pingOsc.frequency.setValueAtTime(2400, t0 + 0.15);
    pingOsc.frequency.exponentialRampToValueAtTime(800, t0 + 0.35);

    const pingGain = audioCtx.createGain();
    pingGain.gain.setValueAtTime(0.001, t0);
    pingGain.gain.setValueAtTime(0.15, t0 + 0.15);
    pingGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);

    pingOsc.connect(pingGain);
    pingGain.connect(audioCtx.destination);
    pingOsc.start(t0 + 0.15);
    pingOsc.stop(t0 + 0.35);
  } catch (err) {
    console.warn('Áudio de stinger falhou:', err);
  }
}

// Sincroniza em tempo real o Preview com a saída do PGM se o modo Live Mirror estiver ligado
function syncToPgm() {
  if (!isLiveMirrorActive) return;
  // No modo 4 câmeras o Preview é o quadrante, não o pvwVideo: espelhar mandaria o sinal errado ao PGM.
  if (quadIso?.isActive()) return;
  const engine = studio?.replayEngine;
  if (!engine) return;

  engine.syncPreviewPlayout({
    url: pvwVideo.src,
    currentTime: pvwVideo.currentTime || 0,
    isPlaying: !pvwVideo.paused,
    speed: currentSpeed,
    audioRoute,
    audioVolume,
    stream: pvwVideo.srcObject,
    markOut: markOutTime,
  });

  const speedTag = $('#rp-pgm-speed-tag');
  if (speedTag) {
    const pct = Math.round(currentSpeed * 100);
    speedTag.textContent = pvwVideo.paused ? 'MIRROR (PAUSADO)' : (pct < 100 ? `MIRROR (${pct}%)` : 'MIRROR (100%)');
  }
}

// Corte Direto (TAKE CUT): Envia instantaneamente o preview (frame atual, slowmo ou clipe) para o PGM
async function takePreviewToPgm() {
  // No ISO, o "Preview" é o ângulo ativo do quadrante: leva o clipe alinhado no instante atual.
  if (quadIso?.isActive()) {
    const item = quadIso.getActive();
    if (!item) return;
    const engine = studio?.replayEngine;
    if (!engine) return;
    const took = engine.takePreviewToPgm({
      url: item.clip.url,
      currentTime: item.currentTime,
      isPlaying: true,
      speed: currentSpeed,
      audioRoute,
      audioVolume,
      transition: 'cut',
      onEnded: () => cutToLive(),
    });
    if (!took) return;
    $('#rp-box-pgm')?.classList.add('live-active');
    $('#bc-tally-pgm')?.classList.add('on-air');
    const tallyLbl = $('#bc-tally-label');
    if (tallyLbl) tallyLbl.textContent = 'OUT B (REPLAY)';
    const speedTag = $('#rp-pgm-speed-tag');
    if (speedTag) {
      speedTag.textContent = `REPLAY (${Math.round(currentSpeed * 100)}%)`;
      speedTag.style.color = '#ef4444';
    }
    const onAirBug = $('#rp-onair-bug');
    if (onAirBug) onAirBug.style.display = 'inline-flex';
    return;
  }
  // Preview ao vivo (srcObject): leva o próprio sinal ao PGM; só fatia clipe se o Preview já é um clipe
  if (!pvwVideo.srcObject) await ensureClipReady();
  const engine = studio?.replayEngine;
  if (!engine) return;

  const curTime = pvwVideo.currentTime || 0;
  const isVidPlaying = !pvwVideo.paused;
  const isLive = !!pvwVideo.srcObject;

  const took = engine.takePreviewToPgm({
    url: isLive ? null : pvwVideo.src,
    currentTime: curTime,
    isPlaying: isVidPlaying,
    speed: currentSpeed,
    audioRoute,
    audioVolume,
    stream: isLive ? pvwVideo.srcObject : null,
    transition: 'cut',
    markOut: markOutTime,
    onEnded: () => {
      cutToLive();
    },
  });
  if (!took) return; // PGM no Preview: não há o que levar ao ar

  $('#rp-box-pgm')?.classList.add('live-active');
  $('#bc-tally-pgm')?.classList.add('on-air');
  const tallyLbl = $('#bc-tally-label');
  if (tallyLbl) tallyLbl.textContent = 'OUT B (REPLAY)';
  const speedTag = $('#rp-pgm-speed-tag');
  if (speedTag) {
    speedTag.textContent = isVidPlaying ? `REPLAY (${Math.round(currentSpeed * 100)}%)` : 'REPLAY (PAUSA)';
    speedTag.style.color = '#ef4444';
  }
  const onAirBug = $('#rp-onair-bug');
  if (onAirBug) {
    onAirBug.style.display = 'inline-flex';
    const bugText = $('#rp-onair-bug-text');
    if (bugText) bugText.textContent = Math.round(currentSpeed * 100) < 100 ? `REPLAY ${Math.round(currentSpeed * 100)}%` : 'REPLAY';
  }
}

// Alterna o Modo Espelhamento / Live Mirror: Tudo que o operador faz no Preview sai ao vivo no PGM
function toggleLiveMirror() {
  if (quadIso?.isActive()) {
    flashPvwStatus('MIRROR indisponível no modo 4 CÂMERAS — use TAKE do ângulo ativo');
    return;
  }
  // Espelhar o PGM no próprio compositor = realimentação. Só câmera/tela faz sentido.
  if (!isLiveMirrorActive && pvwVideo?.srcObject && studio?.programStream && pvwVideo.srcObject === studio.programStream) {
    flashPvwStatus('MIRROR: ESCOLHA UMA CÂMERA (PGM REALIMENTA)');
    return;
  }
  isLiveMirrorActive = !isLiveMirrorActive;
  const mirrorBtn = $('#rp-btn-live-mirror');
  const mirrorBadge = $('#rp-pvw-mirror-badge');
  const pvwBox = $('#rp-box-pvw');

  if (mirrorBtn) mirrorBtn.classList.toggle('active', isLiveMirrorActive);
  if (mirrorBadge) mirrorBadge.style.display = isLiveMirrorActive ? 'inline-flex' : 'none';
  if (pvwBox) pvwBox.classList.toggle('pvw-mirrored', isLiveMirrorActive);

  if (isLiveMirrorActive) {
    // Sincroniza imediatamente o sinal no ar
    takePreviewToPgm();
    syncToPgm();
    $('#rp-box-pgm')?.classList.add('live-active');
    $('#bc-tally-pgm')?.classList.add('on-air');
    const tallyLbl = $('#bc-tally-label');
    if (tallyLbl) tallyLbl.textContent = 'OUT B (MIRROR)';
    const speedTag = $('#rp-pgm-speed-tag');
    if (speedTag) {
      speedTag.textContent = 'PGM LINK (PVW)';
      speedTag.style.color = '#ef4444';
    }
  } else {
    // Desliga espelhamento e retorna para o ao vivo
    cutToLive();
  }
}

// Inverte ou alterna o que está no Preview e no PGM
function swapPvwPgm() {
  if (isLiveMirrorActive) {
    toggleLiveMirror();
    return;
  }
  if (!$('#rp-box-pgm')?.classList.contains('live-active')) {
    takePreviewToPgm();
  } else {
    cutToLive();
  }
}

// Enviar Replay No Ar com Transição Stinger Broadcast
function sendReplayToAirWithStinger({ onDone = null } = {}) {
  // ISO: manda o ângulo ativo do quadrante com stinger (mesmo caminho do TAKE seco).
  if (quadIso?.isActive()) {
    const item = quadIso.getActive();
    if (!item) return;
    const engine = studio?.replayEngine;
    if (!engine) return;
    const took = engine.takePreviewToPgm({
      url: item.clip.url,
      currentTime: item.currentTime,
      isPlaying: true,
      speed: currentSpeed,
      audioRoute,
      audioVolume,
      transition: 'stinger',
      onEnded: () => { if (typeof onDone === 'function') onDone(); else cutToLive(); },
    });
    if (!took) return;
    $('#rp-box-pgm')?.classList.add('live-active');
    $('#bc-tally-pgm')?.classList.add('on-air');
    const tallyLbl = $('#bc-tally-label');
    if (tallyLbl) tallyLbl.textContent = 'OUT B (REPLAY)';
    const speedTag = $('#rp-pgm-speed-tag');
    if (speedTag) {
      speedTag.textContent = `REPLAY (${Math.round(currentSpeed * 100)}%)`;
      speedTag.style.color = '#ef4444';
    }
    const onAirBug = $('#rp-onair-bug');
    if (onAirBug) onAirBug.style.display = 'inline-flex';
    return;
  }
  const isLive = !!pvwVideo.srcObject;
  if (!currentClip && !pvwVideo.src && !isLive) return;
  // PGM no Preview: mandar o programa para o próprio programa cria realimentação (túnel).
  if (isLive && studio?.programStream && pvwVideo.srcObject === studio.programStream) {
    flashPvwStatus('PGM JÁ ESTÁ NO AR — ESCOLHA OUTRA CÂMERA');
    return;
  }

  const wipe = $('#rp-stinger-wipe');
  if (wipe) {
    wipe.classList.remove('animating');
    void wipe.offsetWidth; // Force reflow
    wipe.classList.add('animating');
    playStingerSound();
  }

  // Ponto de corte central do wipe. Guardado para o Esc cancelar antes de entrar no ar.
  clearTimeout(airTimer);
  airTimer = setTimeout(() => {
    studio?.replayEngine?.playoutReplay?.({
      url: isLive ? null : pvwVideo.src,
      stream: isLive ? pvwVideo.srcObject : null,
      speed: currentSpeed,
      currentTime: markInTime !== null ? markInTime : pvwVideo.currentTime,
      markOut: markOutTime,
      audioRoute,
      audioVolume,
      onEnded: () => {
        if (typeof onDone === 'function') onDone();
        else cutToLive();
      },
      wipe: true, // stinger desenhado no PGM (comp.triggerReplayWipe)
    });

    $('#rp-box-pgm').classList.add('live-active');
    $('#bc-tally-pgm').classList.add('on-air');
    $('#bc-tally-label').textContent = 'OUT B (REPLAY)';
    $('#rp-pgm-speed-tag').textContent = `REPLAY (${Math.round(currentSpeed * 100)}%)`;
    $('#rp-pgm-speed-tag').style.color = '#ef4444';

    // Exibe o bug broadcast oficial no monitor PGM
    const onAirBug = $('#rp-onair-bug');
    if (onAirBug) {
      onAirBug.style.display = 'inline-flex';
      const bugText = $('#rp-onair-bug-text');
      if (bugText) bugText.textContent = Math.round(currentSpeed * 100) < 100 ? `REPLAY ${Math.round(currentSpeed * 100)}%` : 'REPLAY';
    }
  }, 350);
}

// Cortar de volta para o ao vivo
function cutToLive() {
  // Cancelar "Tocar todos" e um TAKE com stinger ainda no atraso do wipe.
  playQueue = null;
  clearTimeout(airTimer);
  airTimer = null;
  // Desativa qualquer espelhamento ativo
  isLiveMirrorActive = false;
  $('#rp-btn-live-mirror')?.classList.remove('active');
  const mirrorBadge = $('#rp-pvw-mirror-badge');
  if (mirrorBadge) mirrorBadge.style.display = 'none';
  $('#rp-box-pvw')?.classList.remove('pvw-mirrored');

  studio?.replayEngine?.stopPlayout?.();
  $('#rp-box-pgm').classList.remove('live-active');
  $('#bc-tally-pgm').classList.remove('on-air');
  $('#bc-tally-label').textContent = 'OUT B (LIVE)';
  $('#rp-pgm-speed-tag').textContent = 'ESTÚDIO LIVE';
  $('#rp-pgm-speed-tag').style.color = '#10b981';

  // Oculta o bug broadcast
  const onAirBug = $('#rp-onair-bug');
  if (onAirBug) onAirBug.style.display = 'none';
  // Nenhum lance está mais no ar: limpa o destaque da lista.
  $$('#rp-playlist .bc-clip-card').forEach((c) => c.classList.remove('active'));

  if (isVarActive) toggleVarMode();

  // Restaura feed ao vivo do programa no Monitor B (PGM)
  const pgmVid = $('#rp-video-pgm');
  if (pgmVid && studio?.programStream) {
    if (pgmVid.srcObject !== studio.programStream) {
      try { pgmVid.src = ''; } catch {}
      pgmVid.srcObject = studio.programStream;
      pgmVid.play().catch(() => {});
    }
  }

  // Restaura feed ao vivo na tela de preview do Monitor A
  previewLiveSource(camSources[activeCamSlot] || 'pgm');
}

// -------------------------------------------------------------
// CONFIGURAÇÕES DE BUFFER RAM E LIMITE DE DISCO
// -------------------------------------------------------------
// Estimativa coerente com o encoder do replay (4 Mbps vídeo + ~128 kbps áudio ≈ 0,52 MB/s).
// O rótulo fixo "~75 MB" para 45 s não batia com o buffer real (~23 MB).
function updateBufferRamEstimate() {
  const sel = $('#rp-cfg-buf-limit');
  const est = $('#rp-cfg-ram-est');
  if (!sel || !est) return;
  const secs = parseInt(sel.value || '45', 10) || 45;
  est.textContent = `~${Math.round(secs * 0.55)} MB`;
}

async function loadStorageConfig() {
  try {
    const res = await fetch('/api/replay/config');
    if (!res.ok) return;
    const cfg = await res.json();
    const data = cfg.storage || cfg;

    const diskSel = $('#rp-cfg-disk-limit');
    const bufSel = $('#rp-cfg-buf-limit');
    const dirInput = $('#rp-cfg-dir-input');

    if (diskSel && data.maxDiskMb !== undefined) diskSel.value = String(data.maxDiskMb);
    if (bufSel && data.maxBufferSecs) bufSel.value = String(data.maxBufferSecs);
    if (dirInput && data.replayDir) dirInput.value = data.replayDir;

    // Aplica o buffer salvo ao motor
    if (data.maxBufferSecs) studio?.replayEngine?.setBufferDuration?.(data.maxBufferSecs);

    updateBufferRamEstimate();
    updateDiskUsageUI(data);
  } catch (err) {
    console.warn('Falha ao carregar configurações de replay:', err);
  }
}

function updateDiskUsageUI(storage) {
  if (!storage) return;
  const { usedMb = 0, maxDiskMb = 0, clipCount = 0, freeDiskMb = 0, isCustomDir = false } = storage;
  const pct = storage.pct ?? storage.usagePercent ?? 0;
  const usageTxt = $('#rp-disk-usage-txt');
  const freeTxt = $('#rp-disk-free-txt');
  const clipsTxt = $('#rp-disk-clips-txt');
  const fill = $('#rp-disk-fill');
  const dirBadge = $('#rp-cfg-dir-badge');

  if (usageTxt) {
    if (maxDiskMb === 0) {
      usageTxt.textContent = `Uso Replays: ${usedMb.toFixed(1)} MB (Sem Limite Fixo)`;
    } else {
      usageTxt.textContent = `Uso do Disco: ${usedMb.toFixed(1)} MB / ${maxDiskMb} MB (${pct}%)`;
    }
  }
  if (freeTxt) {
    const freeGb = (freeDiskMb / 1024).toFixed(1);
    freeTxt.textContent = `Livre no Disco: ${freeGb} GB`;
  }
  if (clipsTxt) {
    clipsTxt.textContent = `${clipCount} clipe${clipCount === 1 ? '' : 's'} gravado${clipCount === 1 ? '' : 's'}`;
  }
  if (fill) {
    fill.style.width = `${Math.min(100, pct)}%`;
    fill.classList.toggle('warn', pct >= 85);
  }
  if (dirBadge) {
    dirBadge.textContent = isCustomDir ? 'Pasta Personalizada' : 'Pasta Padrão';
    dirBadge.style.background = isCustomDir ? '#8b5cf6' : '#6366f1';
  }
}

async function pickReplayFolder() {
  try {
    const res = await fetch('/api/replay/pick-folder', { method: 'POST' });
    const data = await res.json();
    if (data.ok && data.dir) {
      const dirInput = $('#rp-cfg-dir-input');
      if (dirInput) dirInput.value = data.dir;
      if (data.config) updateDiskUsageUI(data.config);
    }
  } catch (err) {
    console.warn('Erro ao escolher pasta de replay:', err);
  }
}

async function openReplayFolder() {
  try {
    await fetch('/api/replay/open-folder', { method: 'POST' });
  } catch (err) {
    console.warn('Erro ao abrir pasta de replay:', err);
  }
}

function resetDefaultFolder() {
  const dirInput = $('#rp-cfg-dir-input');
  if (dirInput) dirInput.value = '';
}

function openSettingsModal() {
  const modal = $('#rp-modal-settings');
  if (modal) {
    modal.style.display = 'flex';
    updateBufferRamEstimate();
    loadStorageConfig();
  }
}

function closeSettingsModal() {
  const modal = $('#rp-modal-settings');
  if (modal) modal.style.display = 'none';
}

async function saveSettingsModal() {
  const maxDiskMb = parseInt($('#rp-cfg-disk-limit')?.value || '2048', 10);
  const maxBufferSecs = parseInt($('#rp-cfg-buf-limit')?.value || '45', 10);
  const customReplayDir = $('#rp-cfg-dir-input')?.value?.trim() || null;

  try {
    const res = await fetch('/api/replay/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxDiskMb, maxBufferSecs, customReplayDir }),
    });
    if (res.ok) {
      const data = await res.json();
      studio?.replayEngine?.setBufferDuration?.(maxBufferSecs);
      updateDiskUsageUI(data.storage || data.config);
      closeSettingsModal();
    }
  } catch (err) {
    console.warn('Falha ao salvar configurações:', err);
  }
}

async function clearDiskStorage() {
  if (!confirm('ATENÇÃO: os clipes salvos serão excluídos permanentemente para liberar espaço no HD. A partida que estiver gravando agora é preservada. Deseja continuar?')) {
    return;
  }
  try {
    const res = await fetch('/api/replay/clear', { method: 'POST' });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      highlights = [];
      await loadSavedClips(); // a partida ativa pode continuar no disco
      loadStorageConfig();
      alert(data.skipped
        ? `Armazenamento limpo. ${data.skipped} arquivo(s) em gravação foram preservados.`
        : 'Armazenamento de replays limpo com sucesso.');
    }
  } catch (err) {
    console.warn('Falha ao limpar armazenamento:', err);
  }
}

// -------------------------------------------------------------
// GRAVAÇÃO CONTÍNUA DE JOGO DE FUTEBOL / PARTIDA DIRETO NO DISCO
// -------------------------------------------------------------
let matchTimerInterval = null;
let isContinuousMatchActive = false;

async function toggleMatchRecording() {
  const engine = studio?.replayEngine;
  if (!engine) return;

  if (!isContinuousMatchActive) {
    const title = prompt('Título da Partida / Jogo:', `Partida de Futebol - ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    if (title === null) return; // cancelou

    const res = await engine.startMatchRecording(title || 'Partida de Futebol');
    if (res?.ok) {
      isContinuousMatchActive = true;
      updateMatchRecUI(true, 0);
    }
  } else {
    if (!confirm('Deseja encerrar a gravação contínua desta partida e salvar o arquivo completo no disco?')) {
      return;
    }
    const res = await engine.stopMatchRecording();
    isContinuousMatchActive = false;
    updateMatchRecUI(false, 0);
    loadSavedClips();
  }
}

function updateMatchRecUI(active, durationSecs = 0) {
  const btn = $('#rp-btn-rec-match');
  const label = $('#rp-rec-match-label');
  const timer = $('#rp-rec-match-timer');

  if (matchTimerInterval) {
    clearInterval(matchTimerInterval);
    matchTimerInterval = null;
  }

  if (btn) btn.classList.toggle('is-recording', active);
  if (label) label.textContent = active ? 'GRAVANDO JOGO' : 'REC Jogo';
  if (timer) {
    timer.style.display = active ? 'inline' : 'none';
  }

  if (active) {
    let sec = durationSecs;
    const formatTimer = (s) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sc = s % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sc).padStart(2, '0')}`;
    };
    if (timer) timer.textContent = formatTimer(sec);
    matchTimerInterval = setInterval(() => {
      sec++;
      if (timer) timer.textContent = formatTimer(sec);
    }, 1000);
  }
}

async function syncMatchRecordingStatus() {
  try {
    const res = await fetch('/api/replay/match/status');
    if (!res.ok) return;
    const data = await res.json();
    if (data.active && data.session) {
      isContinuousMatchActive = true;
      updateMatchRecUI(true, data.session.duration || 0);
    } else {
      isContinuousMatchActive = false;
      updateMatchRecUI(false, 0);
    }
  } catch (err) {
    console.warn('Falha ao sincronizar status de gravação de partida:', err);
  }
}

function bindEvents() {
  // 1. Controles de Transporte (Play / Pausa dedicados e atalhos)
  $('#rp-btn-play')?.addEventListener('click', playClip);
  $('#rp-btn-pause')?.addEventListener('click', pauseClip);
  $('#rp-btn-step-back')?.addEventListener('click', () => stepFrame(-1));
  $('#rp-btn-step-fwd')?.addEventListener('click', () => stepFrame(1));
  $('#rp-btn-in')?.addEventListener('click', markIn);
  $('#rp-btn-out')?.addEventListener('click', markOut);
  // Clique na bandeira IN/OUT da seekbar leva o Preview até aquele ponto
  const seekToMark = (t) => {
    if (isLivePreview() || t === null || !Number.isFinite(t)) return;
    pvwVideo.pause();
    updatePlayPauseUI(false);
    pvwVideo.currentTime = t;
    updateTimecode();
    renderScrubMarks();
    syncToPgm();
  };
  $('#rp-scrub-in')?.addEventListener('click', () => seekToMark(markInTime));
  $('#rp-scrub-out')?.addEventListener('click', () => seekToMark(markOutTime));
  renderScrubMarks();

  // Clique na viewport do preview pausa ou toca o replay
  pvwVideo?.addEventListener('click', togglePlayPause);
  $('#rp-var-layer')?.addEventListener('click', (e) => {
    if (!isVarActive) togglePlayPause();
  });

  // Scrub slider de busca rápida
  const scrub = $('#rp-scrub');
  if (scrub) {
    const handleScrub = async () => {
      if (pgmOnAir()) {
        const st = engineOf()?.getPlayoutState?.() || {};
        const pct = parseFloat(scrub.value) || 0;
        if (st.duration > 0 && !st.live) engineOf()?.seekPlayout?.((pct / 100) * st.duration);
        updatePgmTransportUI();
        return;
      }
      if (quadIso?.isActive()) {
        quadIso.seekPercent(parseFloat(scrub.value));
        return;
      }
      await ensureClipReady();
      const dur = getClipDuration();
      const targetTime = (parseFloat(scrub.value) / 100) * dur;
      if (Number.isFinite(targetTime)) {
        pvwVideo.currentTime = targetTime;
        updateTimecode();
        syncToPgm();
      }
    };
    scrub.addEventListener('input', handleScrub);
    scrub.addEventListener('change', handleScrub);
  }

  // 2. Disparos Rápidos de Replay (5s, 10s, 15s, 30s)
  $('#rp-btn-5s')?.addEventListener('click', () => triggerReplay(5));
  $('#rp-btn-10s')?.addEventListener('click', () => triggerReplay(10));
  $('#rp-btn-15s')?.addEventListener('click', () => triggerReplay(15));
  $('#rp-btn-30s')?.addEventListener('click', () => triggerReplay(30));

  // 3. Central de Transição PVW ➜ PGM e Ações Mestres
  $('#rp-btn-take-pvw')?.addEventListener('click', takePreviewToPgm);
  $('#rp-btn-take-air')?.addEventListener('click', sendReplayToAirWithStinger);
  $('#rp-btn-live-mirror')?.addEventListener('click', toggleLiveMirror);
  $('#rp-btn-cut-live')?.addEventListener('click', cutToLive);
  $('#rp-btn-cut-live-alt')?.addEventListener('click', cutToLive);
  $('#rp-btn-swap')?.addEventListener('click', swapPvwPgm);
  $('#rp-btn-var')?.addEventListener('click', toggleVarMode);
  $('#rp-btn-save-clip')?.addEventListener('click', saveCurrentToHighlights);

  // 4. Presets de Velocidade
  $$('.bc-deck [data-speed]').forEach((b) => {
    b.addEventListener('click', () => setSpeed(parseFloat(b.dataset.speed)));
  });

  // 5. Shotbox (Classificação de Lances 1 a 8)
  $$('.bc-shotbox .bc-tag-btn').forEach((b) => {
    b.addEventListener('click', () => tagCurrentClip(b.dataset.tag));
  });

  // 6. Playlist de Highlights
  $('#rp-btn-playall')?.addEventListener('click', playAllHighlights);
  $('#rp-btn-clear-pl')?.addEventListener('click', () => {
    if (confirm('Deseja limpar todos os lances da playlist?')) {
      highlights = [];
      renderPlaylist();
    }
  });
  $('#rp-btn-export-pl')?.addEventListener('click', exportHighlights);

  // 7. Modos 1 Câmera vs 4 Câmeras + buffer ISO
  $('#rp-btn-mode-single')?.addEventListener('click', () => setViewMode('single'));
  $('#rp-btn-mode-quad')?.addEventListener('click', () => setViewMode('quad'));
  $('#rp-btn-iso')?.addEventListener('click', toggleIsoBuffer);
  $('#rp-btn-iso-load')?.addEventListener('click', () => quadIso?.loadAtNow(2));

  for (let i = 1; i <= 4; i++) {
    const sel = $(`#rp-slot-sel-${i}`);
    if (sel) {
      sel.addEventListener('change', () => setCamSource(i, sel.value));
    }
  }

  // (o SOLO dos quadrantes é tratado em initMultiCam; havia um segundo handler aqui
  // chamando `soloCameraSlot`, que não existe — dava ReferenceError a cada clique.)

  // 8. Ferramentas do VAR
  $('#rp-var-tool-offside')?.addEventListener('click', () => setVarTool('offside'));
  $('#rp-var-tool-vert')?.addEventListener('click', () => setVarTool('vert'));
  $('#rp-var-tool-zoom')?.addEventListener('click', () => setVarTool('zoom'));
  $('#rp-var-tool-stamp')?.addEventListener('click', () => setVarTool('stamp'));
  $('#rp-var-tool-sendpgm')?.addEventListener('click', sendVarDecisionToPgm);
  $('#rp-var-tool-clear')?.addEventListener('click', clearVarDrawings);

  // 9. Atalhos no Topo (Modo Buffer, Gravação de Partida, Config, Pin, Fullscreen, Fechar)
  $('#rp-btn-buffer-toggle')?.addEventListener('click', toggleBufferMode);
  $('#rp-buf-stat-box')?.addEventListener('click', toggleBufferMode);
  $('#rp-btn-rec-match')?.addEventListener('click', toggleMatchRecording);
  $('#rp-btn-settings')?.addEventListener('click', openSettingsModal);
  $('#rp-btn-pin')?.addEventListener('click', handlePin);
  $('#rp-btn-fullscreen')?.addEventListener('click', toggleFullscreen);
  $('#rp-btn-close')?.addEventListener('click', () => window.close());

  // 10. Modal de Configurações de Buffer, Pasta e Disco
  $('#rp-settings-close')?.addEventListener('click', closeSettingsModal);
  $('#rp-settings-cancel')?.addEventListener('click', closeSettingsModal);
  $('#rp-settings-save')?.addEventListener('click', saveSettingsModal);
  $('#rp-btn-clear-disk')?.addEventListener('click', clearDiskStorage);
  $('#rp-cfg-buf-limit')?.addEventListener('change', updateBufferRamEstimate);
  $('#rp-cfg-btn-pick-dir')?.addEventListener('click', pickReplayFolder);
  $('#rp-cfg-btn-open-dir')?.addEventListener('click', openReplayFolder);
  $('#rp-cfg-btn-default-dir')?.addEventListener('click', resetDefaultFolder);

  // 11. Atalhos de Teclado Broadcast Globais
  window.addEventListener('keydown', onGlobalKeyDown);
  // Tira o foco do botão clicado: sem isso, Espaço/Enter depois de um clique disparavam a ação duas vezes (clique + atalho)
  document.addEventListener('click', (e) => {
    const b = e.target?.closest?.('button');
    if (b) b.blur();
  });
}

function onGlobalKeyDown(e) {
  if (e.target?.matches('input:not([type="range"]), textarea, select')) return;

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlayPause();
  } else if (e.code === 'KeyK') {
    e.preventDefault();
    pauseClip();
  } else if (e.code === 'KeyL') {
    e.preventDefault();
    playClip();
  } else if (e.code === 'KeyJ') {
    e.preventDefault();
    stepFrame(-1);
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    stepFrame(-1);
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    stepFrame(1);
  } else if (e.code === 'KeyI') {
    e.preventDefault();
    markIn();
  } else if (e.code === 'KeyO') {
    e.preventDefault();
    markOut();
  } else if (e.code === 'KeyM') {
    e.preventDefault();
    toggleLiveMirror();
  } else if (e.code === 'KeyB' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    toggleBufferMode();
  } else if (e.code === 'KeyT') {
    e.preventDefault();
    takePreviewToPgm();
  } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    if (e.shiftKey) {
      takePreviewToPgm();
    } else {
      sendReplayToAirWithStinger();
    }
  } else if (e.code === 'Escape') {
    e.preventDefault();
    cutToLive();
  } else if (e.code === 'F8') {
    e.preventDefault();
    triggerReplay(5);
  } else if (e.code === 'F9') {
    e.preventDefault();
    triggerReplay(10);
  } else if (e.code === 'F10') {
    // F11/F12 são reservados pelo navegador (tela cheia/DevTools): 30 s vai em Shift+F10.
    e.preventDefault();
    triggerReplay(e.shiftKey ? 30 : 15);
  } else if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey) && e.altKey) {
    e.preventDefault();
    saveCurrentToHighlights();
  } else if (/^Digit[1-8]$/.test(e.code) && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const num = parseInt(e.code.replace('Digit', ''), 10);
    const tags = ['GOL', 'FALTA', 'CARTÃO', 'VERMELHO', 'PÊNALTI', 'VAR', 'DEFESA', 'TRAVE'];
    if (tags[num - 1]) {
      e.preventDefault();
      tagCurrentClip(tags[num - 1]);
    }
  }
}

// Shotbox: Salva lance com tag imediata e persiste em disco
async function tagCurrentClip(tag) {
  // Preview no ao vivo: salvar lance não pode carregar o buffer inteiro no Preview (interrompia
  // o ao vivo). Recorta o IN pendente (ou os últimos 10 s) e continua ao vivo, igual ao OUT.
  if (isLivePreview()) {
    await captureLiveMoment(tag);
    return;
  }
  if (!currentClip || !pvwVideo.src) {
    await ensureClipReady();
  }
  if (!currentClip && !pvwVideo.src) return;
  const time = (pvwVideo.currentTime || 0).toFixed(1);
  const title = `${tag} (${time}s)`;
  const item = {
    id: `clip_${Date.now()}`,
    title,
    tag,
    url: pvwVideo.src,
    blob: currentClip?.blob,
    duration: (markOutTime !== null && markInTime !== null && markOutTime > markInTime) ? (markOutTime - markInTime) : getClipDuration(),
    speed: currentSpeed,
    sourceId: camSources[activeCamSlot] || 'pgm',
    markIn: markInTime,
    markOut: markOutTime,
  };
  highlights.push(item);
  savePlaylistOrder();
  renderPlaylist();
  await persistHighlight(item, currentClip);
}

// Gera a miniatura JPEG de um clipe (1 quadro no IN) para persistir ao lado do vídeo.
async function makeThumbBlob(url, atSec = 0.5) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    let done = false;
    const finish = (blob) => {
      if (done) return;
      done = true;
      try { v.removeAttribute('src'); v.load?.(); } catch {}
      resolve(blob || null);
    };
    v.addEventListener('loadeddata', () => {
      try { v.currentTime = Math.max(0, Math.min(atSec, (v.duration || atSec + 1) - 0.05)); } catch { finish(null); }
    });
    v.addEventListener('seeked', () => {
      try {
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 180;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => finish(b), 'image/jpeg', 0.7);
      } catch { finish(null); }
    });
    v.addEventListener('error', () => finish(null), { once: true });
    setTimeout(() => finish(null), 4000);
  });
}

// Persiste o lance no disco (recordings/replays/) via backend, com IN/OUT para reabrir no ponto certo
async function persistHighlight(item, clip) {
  if (clip?.blob && studio?.replayEngine?.saveClipToDisk) {
    try {
      const saved = await studio.replayEngine.saveClipToDisk(clip, item);
      if (saved) {
        item.savedDisk = true;
        // O id do servidor é `replay-...`; sem copiar de volta o DELETE usava `clip_...`,
        // recebia 404 em silêncio e o arquivo ficava no disco para sempre.
        if (saved.id) item.id = saved.id;
        if (saved.mp4Url) item.mp4Url = saved.mp4Url;
        if (saved.webmUrl) item.webmUrl = saved.webmUrl;
        if (saved.thumbUrl) item.thumbUrl = saved.thumbUrl;
        renderPlaylist();
        // Miniatura persistida: evita recarregar 1 quadro de cada vídeo ao reabrir o console.
        if (saved.id && !item.thumbUrl && clip.url) {
          makeThumbBlob(clip.url, Number.isFinite(item.markIn) ? item.markIn : 0.5).then(async (blob) => {
            if (!blob) return;
            try {
              const r = await fetch(`/api/replay/thumb/${encodeURIComponent(saved.id)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'image/jpeg' },
                body: blob,
              });
              const data = await r.json().catch(() => null);
              if (data?.ok && data.thumbUrl) {
                item.thumbUrl = data.thumbUrl;
                renderPlaylist();
              }
            } catch (err) {
              console.warn('Falha ao persistir miniatura:', err);
            }
          });
        }
      }
    } catch (e) {
      console.warn('Erro ao salvar clipe em disco:', e);
    }
  }
}

function saveCurrentToHighlights() {
  tagCurrentClip('LANCE');
}

async function loadSavedClips() {
  try {
    const res = await fetch('/api/replay/clips');
    if (!res.ok) return;
    const list = await res.json();
    if (Array.isArray(list) && list.length > 0) {
      list.forEach((c) => {
        if (!highlights.some((h) => h.id === c.id)) {
          highlights.push({
            id: c.id,
            title: c.title,
            tag: c.tag,
            url: c.mp4Url || c.webmUrl,
            mp4Url: c.mp4Url,
            webmUrl: c.webmUrl,
            duration: Number.isFinite(c.markIn) && Number.isFinite(c.markOut) && c.markOut > c.markIn ? c.markOut - c.markIn : (c.duration || 10),
            clipDuration: c.duration || 10,
            speed: c.speed || 0.5,
            markIn: Number.isFinite(c.markIn) ? c.markIn : null,
            markOut: Number.isFinite(c.markOut) ? c.markOut : null,
            thumbUrl: c.thumbUrl || null,
            savedDisk: true,
          });
        }
      });
      applyPlaylistOrder();
      renderPlaylist();
    }
  } catch (err) {
    console.warn('Falha ao carregar clipes salvos:', err);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Ordem da playlist persistida: sem isso, reordenar os lances voltava à ordem do disco ao reabrir.
const PL_ORDER_KEY = 'castdeck.replay.order';
function savePlaylistOrder() {
  try {
    localStorage.setItem(PL_ORDER_KEY, JSON.stringify(highlights.map((h) => h.id).filter(Boolean)));
  } catch {}
}
function applyPlaylistOrder() {
  let order = [];
  try { order = JSON.parse(localStorage.getItem(PL_ORDER_KEY) || '[]'); } catch {}
  if (!Array.isArray(order) || !order.length) return;
  const pos = new Map(order.map((id, i) => [id, i]));
  highlights.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e9) - (pos.has(b.id) ? pos.get(b.id) : 1e9));
}

// Thumbnails LEVES: em vez de um <video preload="metadata"> por lance (50+ lances carregavam muito),
// o card nasce com um placeholder e só busca 1 quadro quando entra na tela, virando uma imagem JPEG.
let thumbObserver = null;
function loadThumb(ph) {
  if (!ph || ph.dataset.done) return;
  ph.dataset.done = '1';
  const src = ph.dataset.src;
  if (!src) return;
  const t = Number(ph.dataset.t) || 0.5;
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = src;
  let finished = false;
  const finish = (draw) => {
    if (finished) return;
    finished = true;
    try {
      if (draw && v.videoWidth) {
        const c = document.createElement('canvas');
        c.width = 160;
        c.height = 90;
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        ph.style.backgroundImage = `url(${c.toDataURL('image/jpeg', 0.62)})`;
        ph.style.backgroundSize = 'cover';
        ph.style.backgroundPosition = 'center';
      }
    } catch {}
    try { v.removeAttribute('src'); v.load?.(); v.remove(); } catch {}
  };
  v.addEventListener('loadeddata', () => {
    try { v.currentTime = Math.max(0, Math.min(t, (v.duration || t + 1) - 0.05)); } catch { finish(false); }
  });
  v.addEventListener('seeked', () => finish(true), { once: true });
  v.addEventListener('error', () => finish(false), { once: true });
  setTimeout(() => finish(v.readyState >= 2), 3500);
}
function observeThumbs() {
  const list = $$('#rp-playlist .bc-thumb-ph:not([data-done])');
  if (!list.length) return;
  if (!('IntersectionObserver' in window)) { list.forEach(loadThumb); return; }
  if (!thumbObserver) {
    thumbObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        try { thumbObserver.unobserve(e.target); } catch {}
        loadThumb(e.target);
      }
    }, { rootMargin: '140px' });
  } else {
    thumbObserver.disconnect(); // a lista foi re-renderizada: não segura elementos antigos
  }
  list.forEach((el) => thumbObserver.observe(el));
}

function renderPlaylist() {
  const pl = $('#rp-playlist');
  $('#rp-clip-count').textContent = `${highlights.length} clipe${highlights.length === 1 ? '' : 's'}`;
  if (!highlights.length) {
    pl.innerHTML = `<div style="padding:32px 14px;text-align:center;color:#64748b;font-size:12px">Nenhum lance no banco.<br>Pressione <b>Ctrl+Alt+S</b> ou clique em uma tag do Shotbox.</div>`;
    return;
  }
  pl.innerHTML = highlights.map((c, i) => `
    <div class="bc-clip-card" data-idx="${i}" data-url="${escapeHtml(c.url || '')}" title="${escapeHtml(c.title || '')}">
      <div class="bc-clip-thumb-wrap">
        ${c.thumbUrl
          ? `<div class="bc-thumb-ph" data-done="1" style="background-image:url('${escapeHtml(c.thumbUrl)}')"></div>`
          : `<div class="bc-thumb-ph" data-src="${escapeHtml(c.url)}" data-t="${Number.isFinite(c.markIn) ? c.markIn.toFixed(2) : 1}"></div>`}
        <span class="bc-clip-tag">${escapeHtml(c.tag || 'LANCE')}</span>
      </div>
      <div class="bc-clip-info">
        <div class="bc-clip-title" title="Duplo clique para renomear" ondblclick="window.renameHighlight(${i})">${escapeHtml(c.title)}</div>
        <div class="bc-clip-meta"><span>${(c.duration || 10).toFixed(1)}s</span> · <span>${Math.round((c.speed || 0.5) * 100)}%</span> ${c.mp4Url ? '· <b style="color:#10b981">MP4</b>' : ''}</div>
      </div>
      <div class="bc-clip-acts">
        <button class="bc-btn" title="Subir na lista" aria-label="Subir" style="height:24px;padding:0 4px" onclick="window.moveHighlight(${i}, -1)"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="18 15 12 9 6 15"></polyline></svg></button>
        <button class="bc-btn" title="Descer na lista" aria-label="Descer" style="height:24px;padding:0 4px" onclick="window.moveHighlight(${i}, 1)"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"></polyline></svg></button>
        <button class="bc-btn" title="Baixar este lance" aria-label="Baixar lance" style="height:24px;padding:0 4px" onclick="window.downloadHighlight(${i})"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg></button>
        <button class="bc-btn" title="Reproduzir lance no Preview" aria-label="Reproduzir lance" style="height:24px;padding:0 4px" onclick="window.playHighlight(${i})"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg></button>
        <button class="bc-btn" title="Excluir lance" aria-label="Excluir lance" style="height:24px;padding:0 4px;color:#ef4444" onclick="window.deleteHighlight(${i})"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      </div>
    </div>
  `).join('');
  observeThumbs();
}

window.playHighlight = (idx) => {
  const c = highlights[idx];
  if (c) {
    // O clipe da playlist passa a ser o clipe atual (duração/scrub/tag corretos)
    currentClip = { url: c.url, blob: c.blob, duration: c.clipDuration || c.duration || 10, timestamp: Date.now() };
    pendingClipMarks = { in: c.markIn, out: c.markOut, seek: 'in' };
    loadClipToPreview(c.url, true);
    setSpeed(c.speed || 0.5, { applyPgm: false });
  }
};

window.renameHighlight = async (idx) => {
  const c = highlights[idx];
  if (!c) return;
  const title = prompt('Título do lance:', c.title || 'Lance');
  if (title === null) return;
  const clean = title.trim().slice(0, 120);
  if (!clean) return;
  c.title = clean;
  renderPlaylist();
  // Persiste no JSON do clipe (senão o nome voltava ao recarregar o console).
  if (c.savedDisk && c.id) {
    try {
      await fetch(`/api/replay/clips/${encodeURIComponent(c.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: clean }),
      });
    } catch (err) {
      console.warn('Falha ao renomear clipe no disco:', err);
    }
  }
};

window.moveHighlight = (idx, delta) => {
  const to = idx + delta;
  if (to < 0 || to >= highlights.length) return;
  const [item] = highlights.splice(idx, 1);
  highlights.splice(to, 0, item);
  savePlaylistOrder();
  renderPlaylist();
};

window.downloadHighlight = (idx) => {
  const c = highlights[idx];
  if (!c) return;
  const href = c.mp4Url || c.url;
  if (!href) return;
  const a = document.createElement('a');
  a.href = href;
  a.download = `${(c.title || 'lance').replace(/[^\w.-]+/g, '-')}.${c.mp4Url ? 'mp4' : 'webm'}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

window.deleteHighlight = async (idx) => {
  const c = highlights[idx];
  if (c?.id) {
    try {
      await fetch(`/api/replay/clips/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
    } catch {}
  }
  // Blob do clipe em memória: revoga para não vazar (o mesmo URL pode estar no Preview).
  if (c?.url?.startsWith('blob:') && c.url !== pvwVideo?.src && c.url !== currentClip?.url) {
    try { URL.revokeObjectURL(c.url); } catch {}
  }
  highlights.splice(idx, 1);
  savePlaylistOrder();
  renderPlaylist();
};

// Fila única do "Tocar todos": antes o pvwVideo.onended e o onEnded do playout disputavam
// e o PGM voltava ao vivo no meio da sequência. Agora só o playout avança a fila.
let playQueue = null;
let airTimer = null;

function playAllHighlights() {
  if (!highlights.length) return;
  playQueue = { index: 0 };
  playNextHighlight();
}

async function playNextHighlight() {
  if (!playQueue) return;
  if (playQueue.index >= highlights.length) {
    playQueue = null;
    cutToLive();
    return;
  }
  const c = highlights[playQueue.index++];
  currentClip = { url: c.url, blob: c.blob, duration: c.clipDuration || c.duration || 10, timestamp: Date.now() };
  pendingClipMarks = { in: c.markIn, out: c.markOut, seek: 'in' };
  await loadClipToPreview(c.url, true);
  setSpeed(c.speed || 0.5, { applyPgm: false });
  sendReplayToAirWithStinger({ onDone: () => playNextHighlight() });
}

// Exportação real de Clipes / Melhores Momentos (baixa todos os lances da playlist em sequência)
function exportHighlights() {
  const list = highlights.length ? highlights : (currentClip ? [currentClip] : []);
  if (!list.length) {
    alert('Nenhum clipe disponível para exportação.');
    return;
  }

  list.forEach((targetClip, i) => {
    const href = targetClip.mp4Url || targetClip.url;
    if (!href) return;
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = href;
      a.download = `castdeck-replay-${Date.now()}-${i + 1}.${targetClip.mp4Url ? 'mp4' : 'webm'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, i * 400);
  });
}

// MODO VAR DE ALTA PRECISÃO
function toggleVarMode() {
  isVarActive = !isVarActive;
  $('#rp-box-pvw').classList.toggle('bc-var-active', isVarActive);
  $('#rp-btn-var').classList.toggle('primary', isVarActive);

  if (isVarActive) {
    pvwVideo.pause();
    updatePlayPauseUI(false);
    resizeVarCanvas();
    drawVarOverlay();
  } else {
    syncVarOverlayToPgm(false);
    varCtx?.clearRect(0, 0, varCanvas.width, varCanvas.height);
  }
}

function setVarTool(tool) {
  currentVarTool = tool;
  $$('.bc-var-tool-btn').forEach((b) => b.classList.remove('active'));
  $(`#rp-var-tool-${tool}`)?.classList.add('active');
}

function clearVarDrawings() {
  offsideLines = [];
  verticalLines = [];
  varStamp = null;
  zoomMagnifier = null;
  syncVarOverlayToPgm(false);
  varCtx?.clearRect(0, 0, varCanvas.width, varCanvas.height);
}

// Envia a decisão do VAR para o PGM ao vivo do estúdio (exibição de GC)
function sendVarDecisionToPgm() {
  if (!varStamp?.text) {
    const decision = $('#rp-var-decision')?.value || 'GOL CONFIRMADO';
    varStamp = { text: `DECISÃO VAR: ${decision}`, x: 30, y: 50 };
    drawVarOverlay();
  }
  syncVarOverlayToPgm(true);
  if (studio?.comp) {
    studio.comp.replayBugText = varStamp.text;
  }
  const onAirBugText = $('#rp-onair-bug-text');
  if (onAirBugText) onAirBugText.textContent = varStamp.text;
  studio?.toast?.(`[VAR] ${varStamp.text} exibido no PGM.`);
}

let draggingVarItem = null;
let dragOffset = { x: 0, y: 0 };

function initVarLayer() {
  const layer = $('#rp-var-layer');
  if (!layer) return;

  layer.addEventListener('pointerdown', (e) => {
    if (!isVarActive) return;
    const r = varCanvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    // 1. Verifica se clicou sobre a Lupa 4x
    if (zoomMagnifier && Math.hypot(x - zoomMagnifier.x, y - zoomMagnifier.y) <= zoomMagnifier.radius) {
      draggingVarItem = { type: 'zoom', item: zoomMagnifier };
      dragOffset = { x: x - zoomMagnifier.x, y: y - zoomMagnifier.y };
      layer.setPointerCapture(e.pointerId);
      layer.style.cursor = 'grabbing';
      return;
    }

    // 2. Verifica se clicou sobre o Carimbo de Decisão
    if (varStamp && x >= varStamp.x && x <= varStamp.x + 240 && y >= varStamp.y && y <= varStamp.y + 36) {
      draggingVarItem = { type: 'stamp', item: varStamp };
      dragOffset = { x: x - varStamp.x, y: y - varStamp.y };
      layer.setPointerCapture(e.pointerId);
      layer.style.cursor = 'move';
      return;
    }

    // 3. Verifica se clicou perto de uma linha de impedimento existente (< 18px)
    const hitLine = offsideLines.find((l) => Math.abs(l.x - x) < 18);
    if (hitLine) {
      draggingVarItem = { type: 'line', item: hitLine };
      dragOffset = { x: x - hitLine.x, y: 0 };
      layer.setPointerCapture(e.pointerId);
      layer.style.cursor = 'ew-resize';
      return;
    }

    // 4. Se não clicou em nada existente, usa a ferramenta ativa
    if (currentVarTool === 'offside') {
      const isRed = offsideLines.length % 2 === 0;
      const newLine = {
        x,
        y: Math.max(30, Math.min(varCanvas.height - 30, y)),
        color: isRed ? '#ef4444' : '#00d2ff',
        label: isRed ? 'DEFESA' : 'ATAQUE',
      };
      offsideLines.push(newLine);
      draggingVarItem = { type: 'line', item: newLine };
      layer.setPointerCapture(e.pointerId);
    } else if (currentVarTool === 'vert') {
      verticalLines.push({
        x,
        y1: y,
        y2: varCanvas.height,
        color: '#f59e0b',
      });
    } else if (currentVarTool === 'zoom') {
      zoomMagnifier = { x, y, radius: 85, zoom: 3 };
      draggingVarItem = { type: 'zoom', item: zoomMagnifier };
      layer.setPointerCapture(e.pointerId);
    } else if (currentVarTool === 'stamp') {
      // Antes era sorteado no Math.random(); agora usa a decisão escolhida no seletor do VAR.
      const next = $('#rp-var-decision')?.value || 'GOL CONFIRMADO';
      varStamp = { text: `DECISÃO VAR: ${next}`, x: Math.max(20, x - 120), y: Math.max(20, y - 18) };
      draggingVarItem = { type: 'stamp', item: varStamp };
      layer.setPointerCapture(e.pointerId);
    }

    drawVarOverlay();
  });

  layer.addEventListener('pointermove', (e) => {
    if (!isVarActive) return;
    const r = varCanvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    if (draggingVarItem) {
      if (draggingVarItem.type === 'line') {
        draggingVarItem.item.x = Math.max(10, Math.min(varCanvas.width - 10, x - dragOffset.x));
        draggingVarItem.item.y = Math.max(30, Math.min(varCanvas.height - 30, y));
      } else if (draggingVarItem.type === 'zoom') {
        draggingVarItem.item.x = Math.max(draggingVarItem.item.radius, Math.min(varCanvas.width - draggingVarItem.item.radius, x - dragOffset.x));
        draggingVarItem.item.y = Math.max(draggingVarItem.item.radius, Math.min(varCanvas.height - draggingVarItem.item.radius, y - dragOffset.y));
      } else if (draggingVarItem.type === 'stamp') {
        draggingVarItem.item.x = Math.max(10, Math.min(varCanvas.width - 250, x - dragOffset.x));
        draggingVarItem.item.y = Math.max(10, Math.min(varCanvas.height - 40, y - dragOffset.y));
      }
      drawVarOverlay();
      return;
    }

    // Cursor contextual ao passar o mouse
    if (zoomMagnifier && Math.hypot(x - zoomMagnifier.x, y - zoomMagnifier.y) <= zoomMagnifier.radius) {
      layer.style.cursor = 'grab';
    } else if (varStamp && x >= varStamp.x && x <= varStamp.x + 240 && y >= varStamp.y && y <= varStamp.y + 36) {
      layer.style.cursor = 'move';
    } else if (offsideLines.some((l) => Math.abs(l.x - x) < 18)) {
      layer.style.cursor = 'ew-resize';
    } else {
      layer.style.cursor = 'crosshair';
    }
  });

  const stopDrag = (e) => {
    if (draggingVarItem) {
      draggingVarItem = null;
      try { layer.releasePointerCapture(e.pointerId); } catch {}
    }
  };

  layer.addEventListener('pointerup', stopDrag);
  layer.addEventListener('pointercancel', stopDrag);

  // Botão direito limpa item sob o cursor
  layer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const r = varCanvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    const lineIdx = offsideLines.findIndex((l) => Math.abs(l.x - x) < 20);
    if (lineIdx !== -1) {
      offsideLines.splice(lineIdx, 1);
      drawVarOverlay();
      return;
    }
    if (zoomMagnifier && Math.hypot(x - zoomMagnifier.x, y - zoomMagnifier.y) <= zoomMagnifier.radius) {
      zoomMagnifier = null;
      drawVarOverlay();
      return;
    }
    if (varStamp && x >= varStamp.x && x <= varStamp.x + 240 && y >= varStamp.y && y <= varStamp.y + 36) {
      varStamp = null;
      drawVarOverlay();
      return;
    }
  });
}

function resizeVarCanvas() {
  if (!varCanvas) return;
  const wrap = varCanvas.parentElement;
  varCanvas.width = wrap.clientWidth;
  varCanvas.height = wrap.clientHeight;
}

// Espelha as marcações do VAR no compositor do PGM (setVarOverlay), em coordenadas 0..1.
// Antes as linhas/carimbo ficavam só no canvas do console e nunca iam ao ar.
function syncVarOverlayToPgm(on) {
  const comp = studio?.comp;
  if (!comp?.setVarOverlay) return;
  if (!on) {
    comp.setVarOverlay(null);
    return;
  }
  const w = varCanvas?.width || 1;
  const h = varCanvas?.height || 1;
  comp.setVarOverlay({
    on: true,
    lines: offsideLines.map((l) => ({ x: l.x / w, color: l.color, label: l.label })),
    stamp: varStamp ? { text: varStamp.text, x: varStamp.x / w, y: varStamp.y / h } : null,
  });
}

function drawVarOverlay() {
  if (!isVarActive || !varCtx) return;
  varCtx.clearRect(0, 0, varCanvas.width, varCanvas.height);
  if (studio?.comp?.varOverlay?.on) syncVarOverlayToPgm(true);

  // Faixa de impedimento e indicador de delta entre DEFESA e ATAQUE
  if (offsideLines.length >= 2) {
    const def = offsideLines.find((l) => l.label === 'DEFESA') || offsideLines[0];
    const atk = offsideLines.find((l) => l.label === 'ATAQUE') || offsideLines[1];
    if (def && atk) {
      const xMin = Math.min(def.x, atk.x);
      const xMax = Math.max(def.x, atk.x);
      const width = xMax - xMin;
      const isOffside = atk.x > def.x;

      varCtx.fillStyle = isOffside ? 'rgba(239, 68, 68, 0.18)' : 'rgba(0, 210, 255, 0.18)';
      varCtx.fillRect(xMin, 0, width, varCanvas.height);

      // Banner central com medição milimétrica
      const midX = (xMin + xMax) / 2;
      const deltaY = varCanvas.height - 35;
      varCtx.fillStyle = isOffside ? '#ef4444' : '#10b981';
      varCtx.fillRect(midX - 75, deltaY - 14, 150, 26);
      varCtx.fillStyle = '#fff';
      varCtx.font = 'bold 11px sans-serif';
      varCtx.textAlign = 'center';
      varCtx.fillText(`Δ ${Math.round(width)}px · ${isOffside ? 'IMPEDIMENTO' : 'POSIÇÃO LEGAL'}`, midX, deltaY + 3);
    }
  }

  // Linhas de Projeção Vertical
  for (const v of verticalLines) {
    varCtx.strokeStyle = v.color;
    varCtx.lineWidth = 2;
    varCtx.setLineDash([4, 4]);
    varCtx.beginPath();
    varCtx.moveTo(v.x, v.y1);
    varCtx.lineTo(v.x, v.y2);
    varCtx.stroke();
    varCtx.setLineDash([]);
  }

  // Linhas Virtuais de Impedimento
  for (const line of offsideLines) {
    varCtx.strokeStyle = line.color;
    varCtx.lineWidth = 2.5;
    varCtx.setLineDash([8, 4]);

    varCtx.beginPath();
    varCtx.moveTo(line.x, 0);
    varCtx.lineTo(line.x, varCanvas.height);
    varCtx.stroke();
    varCtx.setLineDash([]);

    // Badge arrastável
    varCtx.fillStyle = line.color;
    varCtx.fillRect(line.x - 34, line.y - 12, 68, 22);
    varCtx.fillStyle = '#000';
    varCtx.font = '900 10px sans-serif';
    varCtx.textAlign = 'center';
    varCtx.fillText(line.label, line.x, line.y + 3);
  }

  // Lupa 4x com Mira Reticular
  if (zoomMagnifier) {
    const { x, y, radius } = zoomMagnifier;
    varCtx.save();
    varCtx.beginPath();
    varCtx.arc(x, y, radius, 0, Math.PI * 2);
    varCtx.strokeStyle = '#00d2ff';
    varCtx.lineWidth = 3;
    varCtx.stroke();
    varCtx.clip();

    // Desenha frame ampliado
    varCtx.drawImage(
      pvwVideo,
      x - radius / 2, y - radius / 2, radius, radius,
      x - radius, y - radius, radius * 2, radius * 2
    );

    // Retículo / Mira
    varCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    varCtx.lineWidth = 1;
    varCtx.beginPath();
    varCtx.moveTo(x - radius, y);
    varCtx.lineTo(x + radius, y);
    varCtx.moveTo(x, y - radius);
    varCtx.lineTo(x, y + radius);
    varCtx.stroke();
    varCtx.restore();
  }

  // Carimbo Oficial de Decisão
  if (varStamp) {
    varCtx.fillStyle = 'rgba(168, 85, 247, 0.95)';
    varCtx.fillRect(varStamp.x, varStamp.y, 240, 36);
    varCtx.fillStyle = '#fff';
    varCtx.font = '900 13px sans-serif';
    varCtx.textAlign = 'left';
    varCtx.fillText(varStamp.text, varStamp.x + 12, varStamp.y + 23);
  }
}

// Tela cheia
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// Fixar no topo via Document Picture-in-Picture
async function handlePin() {
  if ('documentPictureInPicture' in window) {
    try {
      const pip = await window.documentPictureInPicture.requestWindow({
        width: Math.min(window.outerWidth || 1200, 1300),
        height: Math.min(window.outerHeight || 700, 800),
      });
      for (const s of document.querySelectorAll('link[rel="stylesheet"], style')) {
        pip.document.head.appendChild(s.cloneNode(true));
      }
      pip.document.body.className = document.body.className;
      const app = document.querySelector('.bc-app');
      pip.document.body.appendChild(app);
      // O keydown está no window original; na janela PiP os eventos vão para outra Window
      // e os atalhos morriam. Replica o handler (e o blur do botão) na janela flutuante.
      const pipKey = (e) => onGlobalKeyDown(e);
      const pipBlur = (e) => { e.target?.closest?.('button')?.blur(); };
      pip.addEventListener('keydown', pipKey);
      pip.document.addEventListener('click', pipBlur);
      pip.addEventListener('pagehide', () => {
        pip.removeEventListener('keydown', pipKey);
        pip.document.removeEventListener('click', pipBlur);
        document.body.appendChild(app);
      });
    } catch (err) {
      console.warn('PiP falhou:', err);
    }
  }
}

// Ações expostas aos controladores (MIDI/gamepad/HID). O "Aprender" do painel liga
// qualquer botão/eixo a uma delas; nada depende de hardware específico.
function replayControllerActions() {
  return {
    playPause: { label: 'Play / Pausa', run: () => togglePlayPause() },
    stepBack: { label: 'Quadro anterior', run: () => stepFrame(-1) },
    stepFwd: { label: 'Próximo quadro', run: () => stepFrame(1) },
    jog: {
      label: 'Jog / roda (analógico)',
      analog: true,
      run: (v) => { const d = Math.abs(v) < 0.05 ? 0 : Math.sign(v); if (d) stepFrame(d * Math.max(1, Math.round(Math.abs(v) * 3))); },
    },
    speedAxis: {
      label: 'Fader de velocidade (analógico)',
      analog: true,
      run: (v) => setSpeed(0.05 + Math.max(0, Math.min(1, v)) * 1.95),
    },
    speed10: { label: 'Velocidade 10%', run: () => setSpeed(0.10) },
    speed25: { label: 'Velocidade 25%', run: () => setSpeed(0.25) },
    speed50: { label: 'Velocidade 50%', run: () => setSpeed(0.50) },
    speed75: { label: 'Velocidade 75%', run: () => setSpeed(0.75) },
    speed100: { label: 'Velocidade 100%', run: () => setSpeed(1) },
    take: { label: 'TAKE (Preview → PGM)', run: () => takePreviewToPgm() },
    takeStinger: { label: 'TAKE com Stinger', run: () => sendReplayToAirWithStinger({}) },
    cutLive: { label: 'Voltar ao vivo', run: () => cutToLive() },
    markIn: { label: 'Marcar IN', run: () => markIn() },
    markOut: { label: 'Marcar OUT', run: () => markOut() },
    saveClip: { label: 'Salvar lance', run: () => saveCurrentToHighlights() },
    mirror: { label: 'Live Mirror', run: () => toggleLiveMirror() },
    varMode: { label: 'Modo VAR', run: () => toggleVarMode() },
    quad: { label: 'Modo 4 câmeras', run: () => setViewMode('quad') },
    single: { label: 'Modo 1 câmera', run: () => setViewMode('single') },
    replay5: { label: 'Replay -5 s', run: () => triggerReplay(5) },
    replay10: { label: 'Replay -10 s', run: () => triggerReplay(10) },
    replay15: { label: 'Replay -15 s', run: () => triggerReplay(15) },
    replay30: { label: 'Replay -30 s', run: () => triggerReplay(30) },
    angle1: { label: 'Ângulo CAM 1', run: () => setActiveCamSlot(1) },
    angle2: { label: 'Ângulo CAM 2', run: () => setActiveCamSlot(2) },
    angle3: { label: 'Ângulo CAM 3', run: () => setActiveCamSlot(3) },
    angle4: { label: 'Ângulo CAM 4', run: () => setActiveCamSlot(4) },
  };
}

window.addEventListener('load', init);
window.addEventListener('beforeunload', () => {
  studio?.replayEngine?.unregisterConsole?.(window);
});
