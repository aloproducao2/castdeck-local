// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Motor de Replay sob demanda: Ring buffer circular em RAM, corte instantâneo e playout.
// Não consome recursos se o console de Replay não estiver aberto.

export function createReplayEngine({ S, comp, getProgramStream, toast, mixer = null, bitrate = 4000000 }) {
  const consoles = new Set();
  let recorder = null;
  let ringBuffer = []; // [{ bytes, seq, time, duration, sourceId }]
  let maxBufferSecs = 45; // Buffer padrão de 45 segundos em RAM
  let isRecording = false;
  let initHeaderBlob = null; // Guarda permanentemente os cabeçalhos EBML do stream WebM
  let initHeaderBytes = null; // Guarda os bytes puros de cabeçalho EBML/Tracks sem vídeo antigo
  let ownPlayoutOnAir = false; // este motor está com um replay OU clipe no ar (não olha o S global)
  let previousStateBeforeReplay = null; // Guarda o estado exato da cena (stage, solo, take, layout) antes do replay entrar

  // Vídeo de playout para devolver o sinal ao Compositor
  let playoutVideo = document.createElement('video');
  playoutVideo.muted = false;
  playoutVideo.playsInline = true;
  playoutVideo.crossOrigin = 'anonymous';
  playoutVideo.preservesPitch = true;

  // ---------------------------------------------------------------
  // SAÍDA COM BLEND (canvas A/B): o compositor desenha este canvas, não o <video>.
  // Ao buscar uma posição, o canvas segura o quadro antigo e faz um dissolve de ~140 ms até o
  // quadro novo — sem o "salto" seco do decoder. O áudio continua vindo do <video> no mixer.
  // ---------------------------------------------------------------
  // DESLIGADO: a saída por canvas (dissolve) piorou o replay na prática (1.2.101). O PGM voltou a
  // desenhar o <video> direto, como em 1.2.100. O código fica atrás da flag para retomarmos com teste.
  const BLEND_OUTPUT = false;
  let blendCanvas = null;
  let blendCtx = null;
  let snapCanvas = null;
  let snapCtx = null;
  let blendState = null; // { t0, ms }
  let drawRvfc = null;
  let drawTimer = null;
  let drawMode = 'rvfc';

  function ensureBlendCanvas() {
    if (blendCanvas) return blendCanvas;
    blendCanvas = document.createElement('canvas');
    blendCanvas.width = 1280;
    blendCanvas.height = 720;
    blendCtx = blendCanvas.getContext('2d', { alpha: false });
    snapCanvas = document.createElement('canvas');
    snapCanvas.width = blendCanvas.width;
    snapCanvas.height = blendCanvas.height;
    snapCtx = snapCanvas.getContext('2d', { alpha: false });
    // O compositor e os monitores esperam um elemento de vídeo (videoWidth/readyState/paused/play).
    // O canvas só precisa se passar por um — o desenho e o áudio continuam reais.
    try {
      Object.defineProperty(blendCanvas, 'videoWidth', { get: () => blendCanvas.width });
      Object.defineProperty(blendCanvas, 'videoHeight', { get: () => blendCanvas.height });
      Object.defineProperty(blendCanvas, 'readyState', { get: () => 2 });
      Object.defineProperty(blendCanvas, 'paused', { get: () => !!playoutVideo.paused });
      Object.defineProperty(blendCanvas, 'ended', { get: () => !!playoutVideo.ended });
      Object.defineProperty(blendCanvas, 'duration', { get: () => (Number.isFinite(playoutVideo.duration) ? playoutVideo.duration : 0) });
      Object.defineProperty(blendCanvas, 'currentTime', {
        get: () => playoutVideo.currentTime || 0,
        set: (v) => { try { playoutVideo.currentTime = v; } catch {} },
      });
      blendCanvas.play = () => playoutVideo.play();
      blendCanvas.pause = () => playoutVideo.pause();
      blendCanvas.load = () => {};
    } catch {}
    return blendCanvas;
  }

  function snapshotFrame() {
    ensureBlendCanvas();
    if (!snapCtx) return;
    try {
      snapCtx.fillStyle = '#000';
      snapCtx.fillRect(0, 0, snapCanvas.width, snapCanvas.height);
      if (playoutVideo.readyState >= 2 && playoutVideo.videoWidth) {
        snapCtx.drawImage(playoutVideo, 0, 0, snapCanvas.width, snapCanvas.height);
      }
    } catch {}
  }

  function drawBlendFrame() {
    ensureBlendCanvas();
    if (!blendCtx) return;
    const v = playoutVideo;
    if (v.videoWidth && (blendCanvas.width !== v.videoWidth || blendCanvas.height !== v.videoHeight)) {
      blendCanvas.width = v.videoWidth;
      blendCanvas.height = v.videoHeight;
      snapCanvas.width = v.videoWidth;
      snapCanvas.height = v.videoHeight;
    }
    const W = blendCanvas.width;
    const H = blendCanvas.height;
    try {
      blendCtx.globalAlpha = 1;
      if (blendState) {
        const t = Math.min(1, (performance.now() - blendState.t0) / blendState.ms);
        blendCtx.drawImage(snapCanvas, 0, 0, W, H);
        if (v.readyState >= 2 && v.videoWidth) {
          blendCtx.globalAlpha = t;
          blendCtx.drawImage(v, 0, 0, W, H);
        }
        blendCtx.globalAlpha = 1;
        if (t >= 1) blendState = null;
      } else if (v.readyState >= 2 && v.videoWidth) {
        blendCtx.drawImage(v, 0, 0, W, H);
      }
    } catch {}
  }

  function stopBlendDraw() {
    if (drawRvfc != null) {
      try {
        if (drawMode === 'rvfc' && typeof playoutVideo.cancelVideoFrameCallback === 'function') playoutVideo.cancelVideoFrameCallback(drawRvfc);
        else clearTimeout(drawRvfc);
      } catch {}
    }
    if (drawTimer != null) { clearTimeout(drawTimer); drawTimer = null; }
    drawRvfc = null;
  }

  function blendDrawLoop() {
    drawBlendFrame();
    if (!ownPlayoutOnAir) return;
    try {
      if (blendState) {
        drawMode = 'timeout';
        drawTimer = setTimeout(blendDrawLoop, 16);
      } else if (playoutVideo.paused) {
        // Pausado não apresenta quadros: redesenha devagar para o scrub aparecer no PGM.
        drawMode = 'timeout';
        drawTimer = setTimeout(blendDrawLoop, 80);
      } else if (typeof playoutVideo.requestVideoFrameCallback === 'function') {
        drawMode = 'rvfc';
        drawRvfc = playoutVideo.requestVideoFrameCallback(blendDrawLoop);
      } else {
        drawMode = 'timeout';
        drawTimer = setTimeout(blendDrawLoop, 33);
      }
    } catch {
      drawTimer = setTimeout(blendDrawLoop, 33);
    }
  }

  function startBlendDraw() {
    if (!BLEND_OUTPUT) return;
    stopBlendDraw();
    blendDrawLoop();
  }

  function beginBlend(ms = 140) {
    if (!BLEND_OUTPUT) return;
    snapshotFrame();
    blendState = { t0: performance.now(), ms };
  }

  // Fechar a janela no meio da partida encerra a sessão no servidor (best effort).
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (!isMatchRecording) return;
      try { navigator.sendBeacon?.('/api/replay/match/stop'); } catch {}
    });
  }

  let currentPlayoutUrl = null;
  let playoutAudioReady = false; // elemento do playout ligado ao mixer (áudio do replay no PGM/fone)

  // Gatilho de replay: por padrão vai DIRETO ao ar (TAKE automático). O operador pode desligar no console
  // ou no controle remoto; a escolha fica salva.
  let autoTake = (() => {
    try { return localStorage.getItem('castdeck.replay.autotake') !== '0'; } catch { return true; }
  })();

  let currentCaptureSourceId = 'pgm';

  function resolveCaptureStream(sourceId) {
    if (!sourceId || sourceId === 'pgm') {
      const p = getProgramStream?.();
      if (p) return p;
      if (comp?.canvas?.captureStream) {
        try { return comp.canvas.captureStream(30); } catch {}
      }
      return null;
    }
    const s = S?.sources?.get(sourceId);
    if (!s) {
      const p = getProgramStream?.();
      if (p) return p;
      if (comp?.canvas?.captureStream) {
        try { return comp.canvas.captureStream(30); } catch {}
      }
      return null;
    }

    // 1. Se a fonte tem stream MediaStream ativo (câmeras, telas, convidados, RTMP)
    if (s.stream && typeof s.stream.getVideoTracks === 'function' && s.stream.getVideoTracks().length > 0) {
      return s.stream;
    }
    if (typeof MediaStream !== 'undefined' && s.stream instanceof MediaStream && s.stream.active) {
      return s.stream;
    }

    // 2. Se a fonte tem elemento <video> ou <canvas> (vídeos de mídia, telas, etc.)
    const el = s.el || s.video;
    if (el) {
      if (el.srcObject && typeof el.srcObject.getVideoTracks === 'function') {
        return el.srcObject;
      }
      if (typeof MediaStream !== 'undefined' && el.srcObject instanceof MediaStream && el.srcObject.active) {
        return el.srcObject;
      }
      if (typeof el.captureStream === 'function') {
        try {
          const cs = el.captureStream(30);
          if (cs) return cs;
        } catch {}
      }
      if (typeof el.mozCaptureStream === 'function') {
        try {
          const cs = el.mozCaptureStream(30);
          if (cs) return cs;
        } catch {}
      }
    }

    // Fallback: sinal master de programa
    return getProgramStream?.();
  }

  function setCaptureSource(sourceId) {
    // À prova de idiotas: trocar a fonte reinicia o buffer. Não deixa fazer isso com replay no ar
    // (o PGM ficaria sem a fonte certa no meio do lance).
    // Usa o estado DESTE motor (não o S global): os motores ISO 4 CAM compartilham o mesmo S e
    // eram bloqueados quando o replay principal estava no ar.
    if (ownPlayoutOnAir || previousStateBeforeReplay) {
      toast?.('Pare o replay antes de trocar a fonte de captura.');
      return false;
    }
    currentCaptureSourceId = sourceId || 'pgm';
    restartBuffer();
    const label = getSourceLabel(currentCaptureSourceId);
    toast?.(`Replay capturando: ${label} — buffer reiniciado (os clipes salvos continuam)`);
    return true;
  }

  function getCaptureSource() {
    return currentCaptureSourceId;
  }

  function getSourceLabel(sourceId) {
    if (!sourceId || sourceId === 'pgm') return '🔴 PGM (Programa Master)';
    const s = S?.sources?.get(sourceId);
    return s?.label || sourceId;
  }

  function getAvailableSources() {
    const list = [
      { id: 'pgm', label: '🔴 PGM (Programa Master)', kind: 'program' }
    ];
    if (S?.sources) {
      for (const [id, s] of S.sources.entries()) {
        if (id === 'replay:out') continue;
        let icon = '📷';
        if (s.kind === 'screen') icon = '🖥️';
        else if (s.kind === 'media') icon = '🎬';
        else if (s.kind === 'image') icon = '🖼️';
        else if (id.startsWith('guest:')) icon = '👤';
        else if (id.startsWith('remote:')) icon = '📱';
        else if (id.startsWith('ingest:')) icon = '🛸';
        list.push({
          id,
          label: `${icon} ${s.label || id}`,
          kind: s.kind || 'source',
        });
      }
    }
    return list;
  }

  function registerConsole(win) {
    consoles.add(win);
    ensureReplaySourceRegistered();
    if (!isRecording) {
      startBuffer();
    }
  }

  function unregisterConsole(win) {
    consoles.delete(win);
    if (consoles.size === 0) {
      // Se um replay estava no ar, volta ao vivo ANTES de remover a fonte. Sem isso o PGM ficava
      // preto/preso em replay:out até um TAKE manual.
      try {
        if (previousStateBeforeReplay || S?.solo === 'replay:out' || S?.take === 'replay:out') stopPlayout();
      } catch {}
      removeReplaySource();
      stopBuffer();
    }
  }

  let bufferRetryTimer = null;

  // Índice dos Clusters WebM do buffer. No Chromium cada Cluster começa num keyframe, então é o
  // ÚNICO ponto onde um clipe pode começar sem imagem corrompida. Os chunks de 1s do MediaRecorder
  // NÃO começam em Cluster (medido no Edge: só 1 a cada ~3 chunks tinha Cluster sem o keyframe de 1s).
  let clusterIndex = []; // [{ seq, off, tc }] seq = nº do chunk, off = posição no chunk, tc = timecode (ms)
  let chunkSeq = 0;
  let parseChain = Promise.resolve(); // processa os chunks em ordem (arrayBuffer() é assíncrono)
  let recStartPerf = 0;
  let recorderGen = 0; // invalida chunks atrasados de um gravador antigo depois de trocar a fonte

  // Acha Clusters pela assinatura completa do modo ao vivo do Chromium: ID 1F43B675 + tamanho
  // "desconhecido" (01 FF FF FF FF FF FF FF) + elemento Timecode (E7). Só o ID daria falso positivo
  // dentro dos dados comprimidos do vídeo.
  function findClusters(u8) {
    const found = [];
    for (let i = 0; i < u8.length - 14; i++) {
      if (u8[i] !== 0x1F || u8[i + 1] !== 0x43 || u8[i + 2] !== 0xB6 || u8[i + 3] !== 0x75) continue;
      if (u8[i + 4] !== 0x01 || u8[i + 12] !== 0xE7) continue;
      const szByte = u8[i + 13];
      const vlen = szByte & 0x7F;
      if (!(szByte & 0x80) || vlen < 1 || vlen > 8 || i + 14 + vlen > u8.length) continue;
      let tc = 0;
      for (let k = 0; k < vlen; k++) tc = tc * 256 + u8[i + 14 + k];
      found.push({ off: i, tc, tcPos: i + 14, tcLen: vlen });
    }
    return found;
  }

  function resetBufferState() {
    ringBuffer = [];
    clusterIndex = [];
    chunkSeq = 0;
    initHeaderBlob = null;
    initHeaderBytes = null;
    parseChain = Promise.resolve();
    recorderGen++;
  }

  // Troca de fonte de vídeo/áudio: novo gravador = novo cabeçalho WebM (o antigo não serve para os chunks novos)
  function restartBuffer() {
    if (!isRecording) return;
    try { recorder?.stop(); } catch {}
    recorder = null;
    isRecording = false;
    resetBufferState();
    startBuffer();
  }

  function createRecorder(stream, mime, bitrate) {
    // keyframe a cada 1s = um Cluster por segundo = corte com precisão de 1s.
    // NÃO passar videoKeyFrameIntervalCount junto: o Chromium lança NotSupportedError com os dois.
    const base = { mimeType: mime, videoBitsPerSecond: bitrate };
    for (const opts of [{ ...base, videoKeyFrameIntervalDuration: 1000 }, base, {}]) {
      try { return new MediaRecorder(stream, opts); } catch {}
    }
    return null;
  }

  function startBuffer() {
    if (isRecording) return;
    const vStream = resolveCaptureStream(currentCaptureSourceId);
    const aStream = resolveAudioStream(currentAudioSourceId);
    if (!vStream) {
      console.warn('Replay: Stream de sinal não disponível:', currentCaptureSourceId);
      // O sinal pode ainda estar subindo (PGM/câmera): tenta de novo enquanto o console estiver aberto
      if (consoles.size > 0 && !bufferRetryTimer) {
        bufferRetryTimer = setTimeout(() => {
          bufferRetryTimer = null;
          if (consoles.size > 0 && !isRecording) startBuffer();
        }, 1500);
      }
      return;
    }

    let recordStream = vStream;
    if (typeof MediaStream !== 'undefined') {
      try {
        const combined = new MediaStream();
        if (typeof vStream.getVideoTracks === 'function') {
          vStream.getVideoTracks().forEach((t) => combined.addTrack(t));
        }
        if (currentAudioSourceId !== 'mute' && aStream && typeof aStream.getAudioTracks === 'function') {
          aStream.getAudioTracks().forEach((t) => combined.addTrack(t));
        }
        if (combined.getTracks().length > 0) {
          recordStream = combined;
        }
      } catch (err) {
        console.warn('Falha ao combinar tracks no Replay:', err);
      }
    }

    try {
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';
      recorder = createRecorder(recordStream, mime, bitrate);
      if (!recorder) throw new Error('MediaRecorder indisponível');

      recorder.onerror = (err) => {
        console.warn('[replay] Erro no recorder de buffer contínuo:', err);
        // Sem isto o motor continuava dizendo "gravando" com o MediaRecorder morto (isRecording
        // ficava true e o retry nunca reiniciava): o buffer parava e ninguém percebia.
        try { recorder?.stop(); } catch {}
        recorder = null;
        isRecording = false;
        if (consoles.size > 0 && !bufferRetryTimer) {
          bufferRetryTimer = setTimeout(() => {
            bufferRetryTimer = null;
            if (consoles.size > 0 && !isRecording) startBuffer();
          }, 1500);
        }
      };

      resetBufferState();
      const gen = recorderGen;
      let lastChunkTime = performance.now();

      recorder.ondataavailable = (e) => {
        if (!e.data || e.data.size === 0) return;
        const now = performance.now();
        const dur = (now - lastChunkTime) / 1000;
        lastChunkTime = now;
        const blob = e.data;

        parseChain = parseChain.then(async () => {
          if (gen !== recorderGen) return; // chunk atrasado de um gravador que já foi trocado
          let u8;
          try {
            u8 = new Uint8Array(await blob.arrayBuffer());
          } catch {
            return;
          }
          if (gen !== recorderGen) return;
          const seq = chunkSeq++;
          const clusters = findClusters(u8);
          if (seq === 0) {
            // Cabeçalho EBML + Segment + Tracks = tudo antes do 1º Cluster do 1º chunk
            if (!clusters.length) return; // sem Cluster no 1º chunk não dá para montar clipes válidos
            initHeaderBytes = u8.slice(0, clusters[0].off);
            initHeaderBlob = new Blob([initHeaderBytes], { type: 'video/webm' });
          }
          for (const c of clusters) clusterIndex.push({ seq, off: c.off, tc: c.tc });
          const prev = ringBuffer[ringBuffer.length - 1];
          ringBuffer.push({
            bytes: u8,
            seq,
            // tempo do vídeo (ms) no início do chunk: do Cluster quando houver, senão estimado pela chegada
            tc: clusters.length ? clusters[0].tc : (prev ? prev.tc + dur * 1000 : 0),
            time: Date.now(),
            duration: Math.max(0.05, dur),
            sourceId: currentCaptureSourceId,
          });
          // Pruning do buffer circular para manter a janela rolante sem estourar memória
          pruneBuffer();
        }).catch((err) => console.warn('[replay] Falha ao indexar chunk do buffer:', err));
      };

      // Fatias de 1000ms
      recorder.start(1000);
      recStartPerf = performance.now();
      isRecording = true;
      console.log(`Replay Engine ativado sob demanda no sinal [${currentCaptureSourceId}].`);
    } catch (err) {
      recorder = null;
      console.warn('Falha ao iniciar recorder de replay:', err);
    }
  }

  // Duração gravada no buffer pelo relógio do próprio vídeo (timecode), mais o último chunk
  function bufferSpanSecs() {
    if (!ringBuffer.length) return 0;
    const first = ringBuffer[0];
    const last = ringBuffer[ringBuffer.length - 1];
    return Math.max(0, (last.tc - first.tc) / 1000) + Math.min(1.5, last.duration);
  }

  // Buffer circular: mantém SOMENTE os últimos N segundos (e um teto em MB como trava de segurança).
  // À medida que novos chunks chegam, os mais antigos são descartados do início mantendo a janela rolante.
  function pruneBuffer() {
    const maxBytes = maxBufferSecs * 1.25 * 1024 * 1024; // ~10 Mbps de folga sobre os 4 Mbps de vídeo
    let totalBytes = ringBuffer.reduce((acc, c) => acc + (c.bytes?.length || 0), 0);
    while (ringBuffer.length > 2) {
      const lastTc = ringBuffer[ringBuffer.length - 1].tc;
      const tooLong = lastTc - ringBuffer[1].tc >= maxBufferSecs * 1000;
      if (!tooLong && totalBytes <= maxBytes) break;
      const removed = ringBuffer.shift();
      totalBytes -= removed.bytes?.length || 0;
    }
    const firstSeq = ringBuffer[0]?.seq ?? 0;
    if (clusterIndex.length && clusterIndex[0].seq < firstSeq) {
      clusterIndex = clusterIndex.filter((c) => c.seq >= firstSeq);
    }
  }

  function setBufferDuration(seconds) {
    const s = Math.max(10, Math.min(180, Number(seconds) || 45));
    maxBufferSecs = s;
    pruneBuffer();
    return maxBufferSecs;
  }

  function getBufferDuration() {
    return maxBufferSecs;
  }

  function stopBuffer() {
    if (bufferRetryTimer) {
      clearTimeout(bufferRetryTimer);
      bufferRetryTimer = null;
    }
    if (!isRecording) return;
    try {
      recorder?.stop();
    } catch {}
    recorder = null;
    isRecording = false;
    resetBufferState();
    console.log('Replay Engine desativado (recursos liberados).');
  }

  function getStats() {
    const totalDur = bufferSpanSecs();
    return {
      duration: Math.min(maxBufferSecs, totalDur),
      rawDuration: totalDur,
      maxDuration: maxBufferSecs,
      chunks: ringBuffer.length,
      active: isRecording,
      isRolling: totalDur >= maxBufferSecs,
      isMatchRecording,
    };
  }

  // Gera o clipe com os últimos N segundos: começa SEMPRE num Cluster real (keyframe) e reescreve os
  // timecodes dos Clusters para o clipe começar em 0 s. Sem isso o vídeo começava no tempo absoluto
  // da gravação (ex.: 37 s) e scrub, jog, IN/OUT e "ir ao fim" usavam a faixa errada.
  async function createClip(seconds = 10) {
    await parseChain;
    if (!ringBuffer.length || !initHeaderBytes) return null;
    const firstSeq = ringBuffer[0].seq;
    const usable = clusterIndex.filter((c) => c.seq >= firstSeq);
    if (!usable.length) return null;

    const last = usable[usable.length - 1];
    const nowTc = Math.max(performance.now() - recStartPerf, last.tc);
    const wantTc = nowTc - Math.max(1, Number(seconds) || 10) * 1000;
    let start = usable[0];
    for (const c of usable) {
      if (c.tc <= wantTc) start = c;
      else break;
    }

    const startPos = ringBuffer.findIndex((e) => e.seq === start.seq);
    if (startPos < 0) return null;

    // O MediaRecorder entrega em fatias de 1 s: o último pedaço pode ainda estar em trânsito e o clipe
    // terminaria com ~1 s de imagem congelada. Corta no primeiro Cluster POSTERIOR ao fim real (limite de
    // quadro) em vez de incluir bytes sem frame novo.
    const endTc = Math.min(nowTc, last.tc + 1000);
    const end = usable.find((c) => c.tc > endTc) || null;
    const endPos = end ? ringBuffer.findIndex((e) => e.seq === end.seq) : ringBuffer.length - 1;
    if (endPos < startPos) return null;

    const parts = [initHeaderBytes];
    for (let i = startPos; i <= endPos; i++) {
      const e = ringBuffer[i];
      const from = i === startPos ? start.off : 0;
      const to = end && e.seq === end.seq ? end.off : e.bytes.length;
      if (to <= from) break;
      parts.push(from === 0 && to === e.bytes.length ? e.bytes : e.bytes.subarray(from, to));
      if (end && e.seq === end.seq) break;
    }
    if (parts.length < 2) return null;
    const total = parts.reduce((acc, p) => acc + p.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    for (const p of parts) {
      out.set(p, pos);
      pos += p.length;
    }

    // Rebase dos timecodes: o valor novo é menor que o antigo, então cabe nos mesmos bytes (EBML aceita zeros à esquerda)
    const body = out.subarray(initHeaderBytes.length);
    for (const c of findClusters(body)) {
      let v = Math.max(0, c.tc - start.tc);
      for (let k = c.tcLen - 1; k >= 0; k--) {
        body[c.tcPos + k] = v % 256;
        v = Math.floor(v / 256);
      }
    }

    const fullBlob = new Blob([out], { type: 'video/webm' });
    const url = URL.createObjectURL(fullBlob);
    const endClipTc = end ? end.tc : Math.max(last.tc, endTc);

    return {
      url,
      blob: fullBlob,
      duration: Math.max(0.5, (endClipTc - start.tc) / 1000),
      timestamp: Date.now(),
      sourceId: currentCaptureSourceId,
      // Hora (Date.now) que corresponde ao 0 s do clipe. O console roda em outra janela (performance.now
      // diferente), então IN/OUT marcados ao vivo usam o relógio de parede para cair no ponto certo do clipe.
      startWall: Date.now() - (performance.now() - (recStartPerf + start.tc)),
    };
  }

  // Persiste o clipe gerado no disco local via backend /api/replay/save
  async function saveClipToDisk(clip, metadata = {}) {
    if (!clip?.blob) return null;
    // Limite do endpoint (/api/replay/save = 120 MB): falhar aqui com aviso é melhor do que
    // o fetch estourar e o lance ficar só na memória sem o operador saber.
    if (clip.blob.size > 110 * 1024 * 1024) {
      toast?.('Clipe grande demais para salvar (limite ~110 MB). Reduza a janela do buffer.');
      return null;
    }
    try {
      const meta = {
        title: metadata.title || 'Lance Gravado',
        tag: metadata.tag || 'LANCE',
        duration: clip.duration || 10,
        speed: metadata.speed || 0.5,
        sourceId: currentCaptureSourceId,
        // IN/OUT relativos ao arquivo: o lance salvo reabre no ponto marcado (o arquivo tem 1,5 s antes do IN)
        markIn: Number.isFinite(metadata.markIn) ? metadata.markIn : null,
        markOut: Number.isFinite(metadata.markOut) ? metadata.markOut : null,
      };
      const res = await fetch('/api/replay/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'video/webm',
          'x-replay-meta': encodeURIComponent(JSON.stringify(meta)),
        },
        body: clip.blob,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.clip;
    } catch (err) {
      console.warn('[replay] Falha ao persistir clipe no disco:', err);
      return null;
    }
  }

  // Liga o elemento de playout ao mixer UMA vez. Sem isso o áudio do clipe toca só no PC
  // e nunca entra no programTrack (PGM/gravação/stream) — o áudio ao vivo continuava no ar.
  function ensurePlayoutAudio() {
    if (!mixer || playoutAudioReady) return;
    try {
      mixer.addElement('replay:out', playoutVideo, { ownerId: 'host', stageKey: 'replay:out', monitor: false });
      playoutAudioReady = true;
      mixer.setRoute('replay:out', { program: false, monitor: false });
    } catch (err) {
      console.warn('[replay] Falha ao ligar áudio do playout no mixer:', err);
    }
  }

  // Rota de áudio do replay: CUE = só o fone do operador (via Preview do console),
  // PGM = só programa, BOTH = programa, MUTE = silêncio. O monitor do mixer fica sempre
  // desligado para não duplicar o áudio que o console já toca no Preview.
  function applyPlayoutAudio(route, volume) {
    ensurePlayoutAudio();
    const sp = Math.max(0, Math.min(1, Number(volume) || 0));
    if (mixer && playoutAudioReady) {
      const program = route === 'pgm' || route === 'both';
      mixer.setRoute('replay:out', { program, monitor: false });
      mixer.setVolume('replay:out', sp, { save: false });
      playoutVideo.muted = false;
      playoutVideo.volume = 1;
      return;
    }
    // Sem mixer (testes/uso isolado): mantém o comportamento antigo do elemento.
    playoutVideo.muted = route === 'mute' || route === 'cue';
    playoutVideo.volume = sp;
  }

  function isProgramStream(stream) {
    if (!stream) return false;
    const program = getProgramStream?.();
    return !!(program && stream === program);
  }

  // Registra a fonte 'replay:out' no estúdio quando o console de Replay estiver ATIVO
  // O input de replay no PGM/Mesa de corte só aparece quando o painel estiver ativo.
  function ensureReplaySourceRegistered() {
    if (S?.sources && !S.sources.has('replay:out')) {
      // Não pré-carrega o PGM no próprio elemento: o compositor desenha essa fonte e isso
      // viraria realimentação (câmera apontada para o próprio canvas). Fica preto até o TAKE.
      ensurePlayoutAudio();
      let el = playoutVideo;
      if (BLEND_OUTPUT) {
        ensureBlendCanvas();
        el = blendCanvas;
      }
      const source = {
        id: 'replay:out',
        kind: 'media',
        label: 'REPLAY / VAR',
        video: el,
        el,
        audio: playoutVideo,
        ownerId: 'host',
        isReplay: true,
      };
      S.sources.set('replay:out', source);
      comp?.upsertSource?.('replay:out', { kind: 'media', label: 'REPLAY / VAR', el });
      globalThis.__castdeck?.renderTiles?.();
      globalThis.__castdeck?.switcher?.refresh?.();
      globalThis.__castdeck?.switcher?.syncTally?.();
    }
  }

  // Remove a fonte 'replay:out' quando o console for fechado (desaparece do estúdio e switcher)
  function removeReplaySource() {
    if (S?.sources?.has('replay:out')) {
      if (S.take === 'replay:out') S.take = null;
      if (S.solo === 'replay:out') S.solo = null;
      if (comp) {
        if (comp.take === 'replay:out') comp.take = null;
        if (comp.solo === 'replay:out') comp.solo = null;
        comp.replayBug = false;
        comp.removeSource?.('replay:out');
      }
      const idx = S.stage?.indexOf('replay:out');
      if (idx !== -1) S.stage?.splice(idx, 1);
      S.sources.delete('replay:out');

      try {
        playoutVideo.pause();
        playoutVideo.playbackRate = 1;
        playoutVideo.srcObject = null;
        playoutVideo.src = '';
      } catch {}
      if (mixer && playoutAudioReady) {
        mixer.setRoute('replay:out', { program: false, monitor: false });
        mixer.remove('replay:out');
        playoutAudioReady = false;
      }

      globalThis.__castdeck?.renderTiles?.();
      globalThis.__castdeck?.renderStagebar?.();
      globalThis.__castdeck?.switcher?.refresh?.();
      globalThis.__castdeck?.switcher?.syncTally?.();
    }
  }

  let previousStageBeforeReplay = null;
  let previousSoloBeforeReplay = null;
  let currentAudioSourceId = 'pgm';
  // Fallback para o áudio do PGM quando a fonte não tem trilha. Nos motores ISO isso fica DESLIGADO:
  // senão cada ângulo sem microfone embutiria o áudio do programa (duplicado/quatro vezes).
  let audioFallbackToProgram = true;

  function resolveAudioStream(audioId) {
    const program = () => (audioFallbackToProgram ? getProgramStream?.() : null);
    if (!audioId || audioId === 'pgm') {
      return getProgramStream?.();
    }
    if (audioId === 'mute') {
      return null;
    }
    if (audioId === 'mic' || audioId === 'host:cam') {
      const s = S?.sources?.get('host:cam');
      if (s?.stream && typeof s.stream.getAudioTracks === 'function' && s.stream.getAudioTracks().length > 0) {
        return s.stream;
      }
      return program();
    }
    const s = S?.sources?.get(audioId);
    if (!s) return program();

    if (s.stream && typeof s.stream.getAudioTracks === 'function' && s.stream.getAudioTracks().length > 0) {
      return s.stream;
    }
    const el = s.el || s.video;
    if (el) {
      if (typeof el.captureStream === 'function') {
        try {
          const cs = el.captureStream(30);
          if (cs && typeof cs.getAudioTracks === 'function' && cs.getAudioTracks().length > 0) return cs;
        } catch {}
      }
    }
    return program();
  }

  function setAudioSource(audioId, opts = {}) {
    if (typeof opts.fallbackToProgram === 'boolean') audioFallbackToProgram = opts.fallbackToProgram;
    currentAudioSourceId = audioId || 'pgm';
    if (opts.restart === false) return;
    restartBuffer();
    const label = getAudioSourceLabel(currentAudioSourceId);
    toast?.(`Áudio do Replay: ${label}`);
  }

  function getAudioSource() {
    return currentAudioSourceId;
  }

  function getAudioSourceLabel(audioId) {
    if (!audioId || audioId === 'pgm') return '🔴 Áudio PGM (Master)';
    if (audioId === 'mic') return '🎤 Microfone do Host';
    if (audioId === 'mute') return '🔇 Mudo (Sem Áudio)';
    const s = S?.sources?.get(audioId);
    return s?.label ? `🔊 ${s.label}` : audioId;
  }

  function getAvailableAudioSources() {
    const list = [
      { id: 'pgm', label: '🔴 Áudio PGM (Master)' },
      { id: 'mic', label: '🎤 Microfone do Host' },
      { id: 'mute', label: '🔇 Sem Áudio (Silencioso)' },
    ];
    if (S?.sources) {
      for (const [id, s] of S.sources.entries()) {
        if (id === 'replay:out' || id === 'host:cam') continue;
        let icon = '🔊';
        if (s.kind === 'media') icon = '🎬';
        else if (id.startsWith('guest:')) icon = '👤';
        list.push({
          id,
          label: `${icon} Áudio de ${s.label || id}`,
        });
      }
    }
    return list;
  }

  let playoutMarkOut = null;
  let playoutOnEnded = null;
  let playoutRvfc = null;
  // Busca suave: em vez de cravar currentTime a cada evento do scrub (o que dá saltos), o playout
  // acelera/desacelera por alguns quadros até o alvo. Só salta de verdade em distâncias grandes.
  let playoutBaseRate = 1;
  let playoutSoftTarget = null;
  let playoutSoftUntil = 0;
  let playoutSoftRvfc = null;
  let playoutSoftMode = 'rvfc'; // rvfc | timeout (para cancelar com a API certa)
  function cancelRvfc() {
    if (playoutRvfc != null && typeof playoutVideo.cancelVideoFrameCallback === 'function') {
      try { playoutVideo.cancelVideoFrameCallback(playoutRvfc); } catch {}
    }
    playoutRvfc = null;
  }

  // Playout do replay no canal do estúdio em TELA CHEIA (FULL SCREEN)
  function playoutReplay({ url, speed = 0.5, currentTime = 0, audioRoute = 'cue', audioVolume = 0.8, stream = null, markOut = null, onEnded = null, wipe = false }) {
    // O programa não pode ser fonte de si mesmo: captureStream do canvas + desenho de volta
    // no canvas cria um túnel com atraso. TAKE/MIRROR com o PGM no Preview vira no-op avisado.
    if (isProgramStream(stream)) {
      toast?.('O sinal do PGM já está no ar — escolha uma câmera no Preview para levar outro ângulo.');
      return false;
    }

    playoutMarkOut = (markOut !== null && Number.isFinite(markOut)) ? markOut : null;
    playoutOnEnded = typeof onEnded === 'function' ? onEnded : null;

    const isLiveStream = !url && stream && typeof MediaStream !== 'undefined' && stream instanceof MediaStream;
    if (isLiveStream) {
      // Preview estava mostrando o sinal AO VIVO: o PGM recebe o mesmo stream (sem clipe)
      currentPlayoutUrl = null;
      try { playoutVideo.removeAttribute('src'); } catch {}
      playoutVideo.srcObject = stream;
      playoutVideo.playbackRate = 1;
    } else {
      currentPlayoutUrl = url;
      // CRUCIAL: Limpa srcObject para que o elemento HTML5 Video passe a ler o arquivo de vídeo do URL
      try {
        playoutVideo.srcObject = null;
      } catch {}
      playoutVideo.src = url;
      playoutVideo.playbackRate = speed;
      playoutVideo.currentTime = currentTime;
    }
    playoutBaseRate = isLiveStream ? 1 : Math.max(0.05, Math.min(2, Number(speed) || 1));
    playoutSoftTarget = null;

    // Fim do trecho (Mark OUT): pausa e devolve ao vivo. `endOut` pode ser chamado pelo frame callback
    // (precisão de quadro) ou pelo timeupdate (rede de segurança em navegadores sem rVFC).
    const endOut = () => {
      if (playoutMarkOut === null) return;
      cancelRvfc();
      try { playoutVideo.pause(); } catch {}
      try { playoutVideo.currentTime = playoutMarkOut; } catch {}
      playoutVideo.ontimeupdate = null;
      playoutMarkOut = null;
      if (playoutOnEnded) {
        const cb = playoutOnEnded;
        playoutOnEnded = null;
        cb();
      } else {
        stopPlayout();
      }
    };
    const frameCheck = () => {
      if (playoutMarkOut === null) return;
      if (playoutVideo.currentTime >= playoutMarkOut) return endOut();
      try {
        playoutRvfc = playoutVideo.requestVideoFrameCallback(frameCheck);
      } catch {
        playoutRvfc = null;
      }
    };
    cancelRvfc();
    playoutVideo.ontimeupdate = null;
    if (playoutMarkOut !== null) {
      // requestVideoFrameCallback entrega o instante exato de cada quadro apresentado (≈ precisão de frame);
      // timeupdate fica como fallback para navegadores antigos.
      if (typeof playoutVideo.requestVideoFrameCallback === 'function') {
        playoutRvfc = playoutVideo.requestVideoFrameCallback(frameCheck);
      }
      playoutVideo.ontimeupdate = () => {
        if (playoutMarkOut !== null && playoutVideo.currentTime >= playoutMarkOut) endOut();
      };
    }
    playoutVideo.onended = () => {
      cancelRvfc();
      playoutVideo.ontimeupdate = null;
      if (playoutOnEnded) {
        const cb = playoutOnEnded;
        playoutOnEnded = null;
        cb();
      } else {
        stopPlayout();
      }
    };

    // Roteamento de áudio independente (CUE/PGM/BOTH/MUTE) pelo mixer.
    applyPlayoutAudio(audioRoute, audioVolume);

    playoutVideo.play().catch(() => {});

    // Salva o estado exato da cena antes do replay entrar (palco, solo, take do switcher, layout)
    if (!previousStateBeforeReplay) {
      previousStateBeforeReplay = {
        stage: (S.stage || []).filter((id) => id !== 'replay:out'),
        solo: (S.solo && S.solo !== 'replay:out') ? S.solo : null,
        take: (S.take && S.take !== 'replay:out') ? S.take : null,
        layout: S.layout || 'auto',
      };
    }

    ensureReplaySourceRegistered();

    // TELA CHEIA (FULL SCREEN PGM) NO AR COM TAG BROADCAST REPLAY:
    // A saída de replay fica sempre no lugar do PGM
    if (!S.stage.includes('replay:out')) {
      S.stage.push('replay:out');
    }
    S.solo = 'replay:out';
    S.take = 'replay:out'; // Mesa de corte sincronizada no canal Replay!
    if (comp) {
      comp.solo = 'replay:out';
      comp.take = 'replay:out';
      comp.replayBug = true;
      comp.replayBugText = 'REPLAY';
      comp.setStage?.(S.stage);
    }
    globalThis.__castdeck?.renderTiles?.();
    globalThis.__castdeck?.renderStagebar?.();
    globalThis.__castdeck?.switcher?.refresh?.();
    globalThis.__castdeck?.switcher?.syncTally?.();
    if (wipe) comp?.triggerReplayWipe?.('in'); // stinger agora aparece no PGM, não só no console

    ownPlayoutOnAir = true;
    startSoftSync();
    startBlendDraw();
    toast?.(`🔴 Replay no ar em tela cheia (${Math.round(speed * 100)}%)`);
    return true;
  }

  // Ajuste dinâmico de velocidade de playout em tempo real (EVS Slow-Motion no ar)
  function setPlayoutSpeed(speed) {
    const sp = Math.max(0.05, Math.min(2.0, Number(speed) || 0.5));
    playoutBaseRate = sp;
    if (playoutVideo) {
      // Durante a convergência suave o rate é controlado pelo loop; não sobrescreve.
      if (playoutSoftTarget === null) playoutVideo.playbackRate = sp;
      playoutVideo.preservesPitch = true;
    }
    if (comp && comp.replayBug) {
      comp.replayBugText = 'REPLAY';
    }
  }

  function setAudioMuted(muted) {
    if (mixer && playoutAudioReady) {
      // `muted` aqui significa "fora do PGM" (CUE/mudo); o fone do operador continua no Preview.
      mixer.setRoute('replay:out', { program: !muted, monitor: false });
      playoutVideo.muted = false;
      return;
    }
    playoutVideo.muted = !!muted;
  }

  function setAudioVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol) || 0));
    if (mixer && playoutAudioReady) {
      mixer.setVolume('replay:out', v, { save: false });
      playoutVideo.volume = 1;
      return;
    }
    playoutVideo.volume = v;
  }

  // ---------- controles do replay QUE ESTÁ NO AR (PGM) ----------
  // Enquanto o replay está no ar, os botões/scrub/jog do console precisam comandar o playout do
  // estúdio (outra janela), não o Preview. Sem isso, pausar/voltar não tinham efeito no PGM.
  function isPlayoutOnAir() {
    return !!ownPlayoutOnAir;
  }
  function getPlayoutState() {
    const v = playoutVideo;
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    return {
      onAir: !!ownPlayoutOnAir,
      paused: !!v.paused,
      time: v.currentTime || 0,
      duration: dur,
      speed: v.playbackRate || 1,
      baseSpeed: playoutBaseRate,
      live: !!v.srcObject,
      url: currentPlayoutUrl || (typeof v.src === 'string' ? v.src : '') || '',
    };
  }
  function pausePlayout() {
    playoutSoftTarget = null;
    try { playoutVideo.pause(); } catch {}
    try { playoutVideo.playbackRate = playoutBaseRate; } catch {}
    return getPlayoutState();
  }
  function playPlayout() {
    try { playoutVideo.play().catch(() => {}); } catch {}
    return getPlayoutState();
  }
  function stopSoftSync() {
    if (playoutSoftRvfc != null) {
      try {
        if (playoutSoftMode === 'rvfc' && typeof playoutVideo.cancelVideoFrameCallback === 'function') {
          playoutVideo.cancelVideoFrameCallback(playoutSoftRvfc);
        } else {
          clearTimeout(playoutSoftRvfc);
        }
      } catch {}
    }
    playoutSoftRvfc = null;
  }
  // Loop de convergência suave: 1 rVFC por quadro apresentado; sem rVFC usa timeout de 33 ms.
  function startSoftSync() {
    stopSoftSync();
    const step = () => {
      playoutSoftRvfc = null;
      if (!ownPlayoutOnAir) return;
      if (playoutSoftTarget !== null && !playoutVideo.paused) {
        const d = playoutSoftTarget - (playoutVideo.currentTime || 0);
        // Trava de segurança: se não convergiu em ~1,2 s (decoder lento/pausa), crava o alvo e
        // restaura a velocidade base — nunca deixa o playout preso numa velocidade errada.
        if (performance.now() > playoutSoftUntil) {
          try { playoutVideo.currentTime = playoutSoftTarget; } catch {}
          playoutSoftTarget = null;
          try { playoutVideo.playbackRate = playoutBaseRate; } catch {}
        } else if (Math.abs(d) < 0.04) {
          playoutSoftTarget = null;
          try { playoutVideo.playbackRate = playoutBaseRate; } catch {}
        } else {
          const maxAdj = Math.max(0.02, playoutBaseRate * 0.6);
          const adj = Math.max(-maxAdj, Math.min(maxAdj, d * 2.2));
          try { playoutVideo.playbackRate = Math.max(0.05, Math.min(2, playoutBaseRate + adj)); } catch {}
        }
      }
      if (!ownPlayoutOnAir) return;
      if (typeof playoutVideo.requestVideoFrameCallback === 'function') {
        playoutSoftMode = 'rvfc';
        playoutSoftRvfc = playoutVideo.requestVideoFrameCallback(step);
      } else {
        playoutSoftMode = 'timeout';
        playoutSoftRvfc = setTimeout(step, 33);
      }
    };
    if (typeof playoutVideo.requestVideoFrameCallback === 'function') {
      playoutSoftMode = 'rvfc';
      playoutSoftRvfc = playoutVideo.requestVideoFrameCallback(step);
    } else {
      playoutSoftMode = 'timeout';
      playoutSoftRvfc = setTimeout(step, 33);
    }
  }

  function seekPlayout(t, opts = {}) {
    const st = getPlayoutState();
    const target = Math.max(0, Math.min(st.duration || Number(t) || 0, Number(t) || 0));
    // Distância pequena com o vídeo tocando: converge pela velocidade (sem salto de quadro).
    // Distância grande (ou pausado): seek real escondido por um dissolve do quadro antigo.
    if (!st.paused && !st.live && st.duration > 0 && Math.abs(target - st.time) <= 0.75) {
      playoutSoftTarget = target;
      playoutSoftUntil = performance.now() + 1200;
      return getPlayoutState();
    }
    playoutSoftTarget = null;
    if (opts.blend !== false) beginBlend();
    try { playoutVideo.currentTime = target; } catch {}
    return getPlayoutState();
  }
  function stepPlayout(sec) {
    const st = getPlayoutState();
    playoutSoftTarget = null;
    try { playoutVideo.pause(); } catch {}
    // Passo de quadro não leva dissolve (borraria a inspeção quadro-a-quadro do VAR).
    const out = seekPlayout((st.time || 0) + (Number(sec) || 0), { blend: false });
    blendState = null;
    if (BLEND_OUTPUT) drawBlendFrame();
    return out;
  }
  function setPlayoutPaused(paused) {
    return paused ? pausePlayout() : playPlayout();
  }

  function stopPlayout() {
    const wasOnAir = ownPlayoutOnAir || !!previousStateBeforeReplay || S.solo === 'replay:out' || S.take === 'replay:out';
    ownPlayoutOnAir = false;
    playoutSoftTarget = null;
    stopSoftSync();
    stopBlendDraw();
    cancelRvfc();
    // Limpa o canvas: sem isso a fonte replay:out guardaria o último quadro do lance anterior.
    try {
      if (blendCtx) {
        blendCtx.globalAlpha = 1;
        blendCtx.fillStyle = '#000';
        blendCtx.fillRect(0, 0, blendCanvas.width, blendCanvas.height);
      }
    } catch {}
    playoutMarkOut = null;
    playoutOnEnded = null;
    try {
      playoutVideo.ontimeupdate = null;
      playoutVideo.onended = null;
      playoutVideo.pause();
      // Depois de um replay em 50%/25% o rate ficava preso e o "ao vivo" da fonte
      // replay:out saía em slow motion. Volta sempre a 1×.
      playoutVideo.playbackRate = 1;
    } catch {}

    // Restaura fielmente a cena e os cortes que estavam no ar antes do replay entrar
    if (previousStateBeforeReplay) {
      S.stage = [...previousStateBeforeReplay.stage];
      S.solo = previousStateBeforeReplay.solo;
      S.take = previousStateBeforeReplay.take;
      if (previousStateBeforeReplay.layout) {
        S.layout = previousStateBeforeReplay.layout;
      }
      if (comp) {
        comp.solo = previousStateBeforeReplay.solo;
        comp.take = previousStateBeforeReplay.take;
        comp.replayBug = false;
        if (previousStateBeforeReplay.layout && comp.setLayout) {
          comp.setLayout(previousStateBeforeReplay.layout);
        }
      }
      previousStateBeforeReplay = null;
    } else {
      if (S.solo === 'replay:out') S.solo = null;
      if (S.take === 'replay:out') S.take = null;
      if (comp) {
        if (comp.solo === 'replay:out') comp.solo = null;
        if (comp.take === 'replay:out') comp.take = null;
        comp.replayBug = false;
      }
      S.stage = (S.stage || []).filter((id) => id !== 'replay:out');
    }

    comp?.setStage?.(S.stage);
    globalThis.__castdeck?.renderTiles?.();
    globalThis.__castdeck?.renderStagebar?.();
    globalThis.__castdeck?.switcher?.refresh?.();
    globalThis.__castdeck?.switcher?.syncTally?.();

    // NÃO revoga o blob: a mesma URL ainda está no Preview e na playlist do console (revogar quebrava o clipe ao voltar ao vivo)
    currentPlayoutUrl = null;

    // Não realimenta a fonte com o PGM ao voltar ao vivo: o compositor desenha replay:out
    // e o captureStream do próprio canvas viraria túnel. Fica preto até o próximo TAKE.
    try {
      playoutVideo.src = '';
      playoutVideo.srcObject = null;
    } catch {}
    if (mixer && playoutAudioReady) mixer.setRoute('replay:out', { program: false, monitor: false });

    if (wasOnAir) comp?.triggerReplayWipe?.('out'); // stinger de retorno no PGM
    toast?.('Voltou para o sinal ao vivo');
  }

  // Sincroniza em tempo real o Preview do Replay com a saída do PGM no estúdio (Modo Espelhamento / Live Link)
  function syncPreviewPlayout({ url, currentTime = 0, isPlaying = false, speed = 1.0, audioRoute = 'cue', audioVolume = 0.8, stream = null, markOut = null }) {
    if (!S?.sources?.has('replay:out')) return;
    if (isProgramStream(stream)) return; // mesma proteção contra realimentação

    if (markOut !== null && Number.isFinite(markOut)) {
      playoutMarkOut = markOut;
    }

    if (stream && typeof MediaStream !== 'undefined' && stream instanceof MediaStream) {
      if (playoutVideo.srcObject !== stream) {
        try { playoutVideo.src = ''; } catch {}
        playoutVideo.srcObject = stream;
        playoutVideo.play().catch(() => {});
      }
      // Sinal AO VIVO nunca sai em câmera lenta: o rate do último replay não pode vazar para o espelhamento.
      try { playoutVideo.playbackRate = 1; playoutVideo.preservesPitch = true; } catch {}
    } else if (url) {
      if (currentPlayoutUrl !== url) {
        currentPlayoutUrl = url;
        try { playoutVideo.srcObject = null; } catch {}
        playoutVideo.src = url;
      }
      playoutVideo.playbackRate = speed;
      if (Number.isFinite(currentTime) && Math.abs((playoutVideo.currentTime || 0) - currentTime) > 0.15) {
        playoutVideo.currentTime = currentTime;
      }
      if (isPlaying && playoutVideo.paused) {
        playoutVideo.play().catch(() => {});
      } else if (!isPlaying && !playoutVideo.paused) {
        playoutVideo.pause();
      }
    }

    applyPlayoutAudio(audioRoute, audioVolume);

    if (comp) {
      comp.replayBugText = 'REPLAY';
    }
  }

  // Faz o Preview virar imediatamente a saída do PGM (Corte Seco ou Stinger)
  function takePreviewToPgm({ url, currentTime = 0, isPlaying = false, speed = 0.5, audioRoute = 'cue', audioVolume = 0.8, stream = null, transition = 'cut', markOut = null, onEnded = null }) {
    const ok = playoutReplay({
      url: url || null,
      speed,
      currentTime,
      audioRoute,
      audioVolume,
      stream,
      markOut,
      onEnded,
      wipe: transition === 'stinger',
    });
    if (!ok) return false;
    if (!isPlaying && url) {
      try { playoutVideo.pause(); } catch {}
    }
    toast?.(transition === 'stinger' ? '⚡ Replay enviado para o PGM (Stinger)' : '▶ Preview virou saída PGM (Corte Direto)');
    return true;
  }

  // -------------------------------------------------------------
  // GRAVAÇÃO CONTÍNUA DE PARTIDA / FUTEBOL DIRETO NO DISCO
  // -------------------------------------------------------------
  let matchRecorder = null;
  let isMatchRecording = false;
  let matchStartTime = 0;
  let matchBytesTotal = 0;
  let matchHeartbeatTimer = null;
  // 1º pedaço carrega o header EBML. Se ele falhar, os seguintes seriam um arquivo sem
  // cabeçalho (nunca abre). Guardamos e reenviamos junto do próximo até o servidor confirmar.
  let matchPendingFirst = null;
  let matchFirstAccepted = false;
  // Os pedaços PRECISAM chegar ao disco na ordem: com fetch em paralelo um pedaço podia passar na frente
  // do outro e o arquivo do jogo saía corrompido. Esta fila envia um de cada vez.
  let matchUploadChain = Promise.resolve();
  let matchUploadErrors = 0;

  async function startMatchRecording(title = 'Partida de Futebol') {
    if (isMatchRecording) return { ok: true, active: true };

    const vStream = resolveCaptureStream(currentCaptureSourceId);
    const aStream = resolveAudioStream(currentAudioSourceId);
    if (!vStream) {
      toast?.('Falha ao iniciar gravação contínua: sinal indisponível');
      return { ok: false, error: 'Sinal indisponível' };
    }

    let recordStream = vStream;
    if (typeof MediaStream !== 'undefined') {
      try {
        const combined = new MediaStream();
        if (typeof vStream.getVideoTracks === 'function') {
          vStream.getVideoTracks().forEach((t) => combined.addTrack(t));
        }
        if (currentAudioSourceId !== 'mute' && aStream && typeof aStream.getAudioTracks === 'function') {
          aStream.getAudioTracks().forEach((t) => combined.addTrack(t));
        }
        if (combined.getTracks().length > 0) recordStream = combined;
      } catch (err) {
        console.warn('Falha ao combinar tracks para gravação de partida:', err);
      }
    }

    try {
      // Inicia sessão no backend
      const res = await fetch('/api/replay/match/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: currentCaptureSourceId, title }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Falha ao iniciar no servidor');

      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

      matchRecorder = createRecorder(recordStream, mime, 4500000);
      if (!matchRecorder) throw new Error('MediaRecorder indisponível');

      matchStartTime = Date.now();
      matchBytesTotal = 0;
      matchUploadErrors = 0;
      matchPendingFirst = null;
      matchFirstAccepted = false;
      matchUploadChain = Promise.resolve();
      isMatchRecording = true;

      matchRecorder.ondataavailable = (e) => {
        if (!e.data || e.data.size === 0) return;
        matchBytesTotal += e.data.size;
        const chunk = e.data;
        matchUploadChain = matchUploadChain.then(async () => {
          // Se o 1º pedaço (header EBML) ainda não foi aceito, envia ele + este juntos.
          // A junção é feita DENTRO da fila: um chunk seguinte não pode passar na frente.
          const data = matchPendingFirst ? new Blob([matchPendingFirst, chunk]) : chunk;
          // 3 tentativas: um soluço de rede local não pode abrir um buraco no meio do arquivo
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const r = await fetch('/api/replay/match/chunk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: data,
              });
              if (r.ok) {
                matchPendingFirst = null;
                matchFirstAccepted = true;
                return;
              }
            } catch {}
            await new Promise((res) => setTimeout(res, 300 * (attempt + 1)));
          }
          matchUploadErrors++;
          if (!matchFirstAccepted) {
            // Guarda para o próximo envio: sem o header o arquivo inteiro seria inútil.
            matchPendingFirst = data;
            toast?.('Falha no 1º pedaço da partida — tentando novamente no próximo envio');
          }
          console.warn('[replay] Falha ao enviar pedaço contínuo da partida (após 3 tentativas)');
        });
      };

      // Fatias de 3000ms enviadas diretamente ao disco
      matchRecorder.start(3000);
      // Heartbeat: se a janela fechar/cair, o servidor finaliza a sessão em ~15 s em vez de
      // deixar uma partida órfã que bloqueia um novo REC e nunca é podada.
      if (matchHeartbeatTimer) clearInterval(matchHeartbeatTimer);
      matchHeartbeatTimer = setInterval(() => {
        fetch('/api/replay/match/heartbeat', { method: 'POST' }).catch(() => {});
      }, 5000);
      toast?.(`Gravação contínua iniciada no disco (${title})`);
      return { ok: true, session: data.session };
    } catch (err) {
      console.warn('Erro ao iniciar gravação contínua:', err);
      toast?.(`Erro ao iniciar gravação contínua: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async function stopMatchRecording() {
    if (!isMatchRecording && !matchRecorder) return { ok: false };
    if (matchHeartbeatTimer) {
      clearInterval(matchHeartbeatTimer);
      matchHeartbeatTimer = null;
    }
    isMatchRecording = false;
    const rec = matchRecorder;
    matchRecorder = null;
    // O stop() ainda entrega um último pedaço (os segundos finais). Antes o servidor era encerrado na hora,
    // esse pedaço chegava depois, abria uma sessão nova só com ele e o jogo ficava truncado.
    if (rec && rec.state !== 'inactive') {
      await new Promise((resolve) => {
        rec.addEventListener('stop', () => setTimeout(resolve, 0), { once: true });
        try { rec.stop(); } catch { resolve(); }
        setTimeout(resolve, 4000);
      });
    }
    await matchUploadChain;

    try {
      const res = await fetch('/api/replay/match/stop', { method: 'POST' });
      const data = await res.json();
      toast?.(matchUploadErrors
        ? `Gravação salva, mas ${matchUploadErrors} pedaço(s) falharam no envio`
        : 'Gravação de partida concluída e salva no disco!');
      return data;
    } catch (err) {
      console.warn('[replay] Falha ao encerrar gravação de partida:', err);
      return { ok: false, error: err.message };
    }
  }

  // Envia um comando para as janelas do console de Replay abertas (atalhos globais do estúdio).
  // Retorna false quando nenhum console está aberto.
  function sendCommand(cmd = {}) {
    let sent = false;
    for (const win of consoles) {
      try {
        win.postMessage({ type: 'castdeck-replay-cmd', ...cmd }, location.origin);
        sent = true;
      } catch {}
    }
    return sent;
  }

  function getAutoTake() {
    return !!autoTake;
  }
  function setAutoTake(on) {
    autoTake = !!on;
    try { localStorage.setItem('castdeck.replay.autotake', autoTake ? '1' : '0'); } catch {}
    sendCommand({ action: 'auto-take', on: autoTake });
    return autoTake;
  }

  function getMatchRecordingStats() {
    return {
      active: isMatchRecording,
      duration: isMatchRecording ? Math.round((Date.now() - matchStartTime) / 1000) : 0,
      bytes: matchBytesTotal,
      bytesMb: +(matchBytesTotal / (1024 * 1024)).toFixed(1),
    };
  }

  return {
    registerConsole,
    unregisterConsole,
    getStats,
    setBufferDuration,
    getBufferDuration,
    ensureReplaySourceRegistered,
    startBuffer,
    stopBuffer,
    toggleBuffer: () => {
      if (isRecording) {
        stopBuffer();
      } else {
        startBuffer();
      }
      return isRecording;
    },
    isBufferActive: () => isRecording,
    flushBuffer: () => parseChain,
    // Hora (Date.now) em que chegou o último pedaço do buffer: até ali o vídeo já pode ser recortado
    lastChunkWall: () => ringBuffer[ringBuffer.length - 1]?.time || 0,
    createClip,
    saveClipToDisk,
    sendCommand,
    getAutoTake,
    setAutoTake,
    startMatchRecording,
    stopMatchRecording,
    getMatchRecordingStats,
    playoutReplay,
    stopPlayout,
    isPlayoutOnAir,
    getPlayoutState,
    pausePlayout,
    playPlayout,
    seekPlayout,
    stepPlayout,
    setPlayoutPaused,
    setPlayoutSpeed,
    syncPreviewPlayout,
    takePreviewToPgm,
    setAudioMuted,
    setAudioVolume,
    setCaptureSource,
    getCaptureSource,
    getAvailableSources,
    resolveCaptureStream,
    setAudioSource,
    getAudioSource,
    getAvailableAudioSources,
    getAudioSourceLabel,
  };
}
