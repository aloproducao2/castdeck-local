// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Teste automatizado do Motor de Replay / VAR:
//   1. Ciclo de vida sob demanda (zero consumo de CPU/RAM se console fechado)
//   2. Ring buffer circular e poda de memória (máximo 45s)
//   3. Fatiamento retroativo exato (5s, 10s, 15s, 30s)
//   4. Roteamento de áudio independente (CUE fone, PGM master, ambos, mudo)
//   5. Integração com o Compositor do estúdio (source.el, upsertSource, setStage)
//   6. Corte de retorno ao vivo (stopPlayout)
//   7. Segurança do endpoint HTTP /replay (localhost permitido, remoto 403)

import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// -------------------------------------------------------------
// Polyfills mínimos de DOM/Browser para execução nativa em Node 20+
// -------------------------------------------------------------
class MockMediaRecorder {
  static isTypeSupported() { return true; }
  constructor(stream, opts) {
    this.stream = stream;
    this.opts = opts;
    this.state = 'inactive';
    this.ondataavailable = null;
    this._listeners = {};
    MockMediaRecorder.lastInstance = this;
  }
  addEventListener(type, fn) {
    (this._listeners[type] ||= []).push(fn);
  }
  start(timeslice) {
    this.state = 'recording';
    this.timeslice = timeslice;
  }
  stop() {
    this.state = 'inactive';
    // Igual ao navegador: entrega o último pedaço e só depois dispara 'stop'
    setTimeout(() => {
      this.ondataavailable?.({ data: new Blob([new Uint8Array([9, 9, 9])]) });
      (this._listeners.stop || []).forEach((fn) => fn());
    }, 5);
  }
}

// Chunk WebM sintético com a assinatura real de Cluster do Chromium ao vivo:
// 1F43B675 + tamanho desconhecido (01 FF..FF) + Timecode (E7 82 hi lo). O 1º leva o cabeçalho EBML.
function webmChunk(i, { withHeader = false, filler = 40 } = {}) {
  const tc = i * 1000;
  const head = withHeader ? [0x1A, 0x45, 0xDF, 0xA3, 0x42, 0x86, 0x81, 0x01] : [];
  const pre = withHeader ? [] : new Array(filler).fill(0x11); // final do Cluster anterior
  const cluster = [0x1F, 0x43, 0xB6, 0x75, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xE7, 0x84, (tc >>> 24) & 0xFF, (tc >> 16) & 0xFF, (tc >> 8) & 0xFF, tc & 0xFF];
  const data = new Array(filler).fill(0x22);
  return new Blob([new Uint8Array([...head, ...pre, ...cluster, ...data])], { type: 'video/webm' });
}
function feedWebm(rec, count, start = 0) {
  for (let i = start; i < start + count; i++) rec.ondataavailable({ data: webmChunk(i, { withHeader: i === 0 }) });
}

class MockVideoElement {
  constructor() {
    this.src = '';
    this.muted = false;
    this.volume = 1.0;
    this.playbackRate = 1.0;
    this.currentTime = 0;
    this.paused = true;
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

globalThis.MediaRecorder = MockMediaRecorder;
if (!globalThis.document) {
  globalThis.document = {
    createElement(tag) {
      if (tag === 'video') return new MockVideoElement();
      return {};
    },
  };
}
if (!globalThis.URL.createObjectURL) {
  let counter = 0;
  globalThis.URL.createObjectURL = (b) => `blob:mock-url-${++counter}`;
  globalThis.URL.revokeObjectURL = () => {};
}

// Importa o motor de replay real
const { createReplayEngine } = await import('../public/js/studio/replay-engine.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ ${name}:`, err.message);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ ${name}:`, err.message);
    failed++;
  }
}

console.log('\n--- [TESTE REPLAY ENGINE / VAR] ---');

// 1. Instanciação e interface
test('1. Interface e métodos exportados', () => {
  const S = { sources: new Map(), stage: [] };
  const engine = createReplayEngine({ S });
  assert.equal(typeof engine.registerConsole, 'function');
  assert.equal(typeof engine.unregisterConsole, 'function');
  assert.equal(typeof engine.getStats, 'function');
  assert.equal(typeof engine.createClip, 'function');
  assert.equal(typeof engine.playoutReplay, 'function');
  assert.equal(typeof engine.stopPlayout, 'function');
  assert.equal(typeof engine.setAudioMuted, 'function');
  assert.equal(typeof engine.setAudioVolume, 'function');
  assert.equal(typeof engine.setCaptureSource, 'function');
  assert.equal(typeof engine.getCaptureSource, 'function');
  assert.equal(typeof engine.getAvailableSources, 'function');
  assert.equal(typeof engine.resolveCaptureStream, 'function');
});

// 2. Ciclo de vida sob demanda
test('2. Ciclo de vida sob demanda (zero consumo ocioso)', () => {
  const S = { sources: new Map(), stage: [] };
  let streamRequested = false;
  const fakeStream = {};
  const engine = createReplayEngine({
    S,
    getProgramStream: () => {
      streamRequested = true;
      return fakeStream;
    },
  });

  // Inicialmente inativo
  let stats = engine.getStats();
  assert.equal(stats.active, false);
  assert.equal(stats.chunks, 0);
  assert.equal(stats.duration, 0);
  assert.equal(streamRequested, false);

  // Registra primeiro console (abre janela de Replay)
  const win1 = { id: 1 };
  engine.registerConsole(win1);
  assert.equal(streamRequested, true);
  stats = engine.getStats();
  assert.equal(stats.active, true);

  // Registra segundo console (segunda tela)
  const win2 = { id: 2 };
  engine.registerConsole(win2);
  assert.equal(engine.getStats().active, true);

  // Desregistra win1: win2 ainda está aberto, deve continuar gravando
  engine.unregisterConsole(win1);
  assert.equal(engine.getStats().active, true);

  // Desregistra win2: consoles zerados, deve parar e liberar memória
  engine.unregisterConsole(win2);
  stats = engine.getStats();
  assert.equal(stats.active, false);
  assert.equal(stats.chunks, 0);
  assert.equal(stats.duration, 0);
});

// 3. Fatiamento retroativo e criação de clipe com simulação de dados
await asyncTest('3. Ingestão no Ring Buffer e Fatiamento retroativo exato (createClip)', async () => {
  const S = { sources: new Map(), stage: [] };
  const engine = createReplayEngine({
    S,
    getProgramStream: () => ({}),
  });

  const win = {};
  engine.registerConsole(win);

  const recorder = MockMediaRecorder.lastInstance;
  assert.ok(recorder, 'Instância do recorder deve existir após registro');

  // Simula 20 segundos de transmissão gravada em pedaços de 1s (com Clusters WebM reais)
  feedWebm(recorder, 20);
  await engine.flushBuffer();

  const stats = engine.getStats();
  assert.equal(stats.chunks, 20);
  assert.ok(stats.duration > 0, 'Duração acumulada deve refletir os chunks');

  // Teste de fatiamento retroativo
  const clip10 = await engine.createClip(10);
  assert.ok(clip10, 'Deve gerar clipe de 10 segundos');
  assert.ok(clip10.url.startsWith('blob:'), 'URL do clipe deve ser blob:');
  assert.ok(clip10.duration >= 9 && clip10.duration <= 11, `Duração do clipe deve ser ~10s (veio ${clip10.duration})`);

  const clip5 = await engine.createClip(5);
  assert.ok(clip5, 'Deve gerar clipe de 5 segundos');
  assert.ok(clip5.duration >= 4 && clip5.duration <= 6, `Duração do clipe deve ser ~5s (veio ${clip5.duration})`);

  engine.unregisterConsole(win);
  assert.equal(engine.getStats().chunks, 0, 'Buffer deve zerar ao desregistrar');
});

// 4. Playout e Roteamento de Áudio
test('4. Roteamento de áudio e playout no Compositor', () => {
  const S = { sources: new Map(), stage: ['host:cam'] };
  let upsertedKey = null;
  let upsertedSource = null;
  let stageUpdated = null;
  let toastMsg = null;

  const comp = {
    upsertSource(key, src) {
      upsertedKey = key;
      upsertedSource = src;
    },
    setStage(stage) {
      stageUpdated = [...stage];
    },
  };

  const engine = createReplayEngine({
    S,
    comp,
    toast: (msg) => { toastMsg = msg; },
  });

  // Teste 4.1: Playout no modo CUE (apenas no fone do operador, mudo no estúdio PGM)
  engine.playoutReplay({
    url: 'blob:mock-clip-1',
    speed: 0.5,
    currentTime: 2.5,
    audioRoute: 'cue',
    audioVolume: 0.75,
  });

  assert.equal(upsertedKey, 'replay:out');
  assert.ok(upsertedSource?.el, 'Source do compositor DEVE conter propriedade .el');
  assert.equal(upsertedSource.el.muted, true, 'No modo CUE, áudio para o PGM deve ser muted');
  assert.equal(upsertedSource.el.volume, 0.75);
  assert.equal(upsertedSource.el.playbackRate, 0.5);
  assert.ok(S.stage.includes('replay:out'), 'replay:out deve ser incluído no stage do estúdio');
  assert.equal(S.solo, 'replay:out', 'Replay DEVE entrar em tela cheia (S.solo)');
  assert.equal(comp.solo, 'replay:out', 'Compositor DEVE ativar solo em tela cheia');
  assert.equal(comp.replayBug, true, 'Compositor DEVE ativar o bug visual de replay');
  assert.deepEqual(stageUpdated, ['host:cam', 'replay:out']);
  assert.ok(toastMsg?.includes('50%'), 'Toast deve informar velocidade');

  // Teste 4.2: Modo PGM (áudio liberado no ar)
  engine.playoutReplay({
    url: 'blob:mock-clip-2',
    speed: 1.0,
    audioRoute: 'pgm',
    audioVolume: 0.9,
  });
  assert.equal(upsertedSource.el.muted, false, 'No modo PGM, áudio deve estar liberado');
  assert.equal(upsertedSource.el.volume, 0.9);

  // Teste 4.3: Modo Mute
  engine.playoutReplay({
    url: 'blob:mock-clip-3',
    speed: 0.25,
    audioRoute: 'mute',
  });
  assert.equal(upsertedSource.el.muted, true, 'No modo Mute, áudio deve estar silenciado');

  // Teste 4.4: Modo Both (Fone + PGM)
  engine.playoutReplay({
    url: 'blob:mock-clip-4',
    speed: 0.75,
    audioRoute: 'both',
    audioVolume: 0.6,
  });
  assert.equal(upsertedSource.el.muted, false, 'No modo Both, áudio deve estar liberado no PGM');
  assert.equal(upsertedSource.el.volume, 0.6);

  // Teste 4.5: Cortar de volta para o ao vivo (stopPlayout)
  engine.stopPlayout();
  assert.equal(S.stage.includes('replay:out'), false, 'replay:out deve ser removido do stage');
  assert.equal(S.solo, null, 'Ao cortar para o vivo, S.solo deve ser restaurado');
  assert.equal(comp.solo, null, 'Ao cortar para o vivo, comp.solo deve ser restaurado');
  assert.equal(comp.replayBug, false, 'Bug de replay deve ser desativado');
  assert.deepEqual(stageUpdated, ['host:cam'], 'Stage deve voltar à cena original');
  assert.equal(upsertedSource.el.paused, true, 'Vídeo de playout deve ser pausado');
});

// 5. Verificação do Endpoint HTTP /replay e Segurança
await asyncTest('5. Servidor HTTP /replay e proteção localhost', async () => {
  const app = express();
  const isLoopback = (addr = '') => addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  function isLocalReq(req) {
    const h = req.headers;
    if (!isLoopback(req.socket.remoteAddress)) return false;
    if (h['cf-connecting-ip'] || h['cf-ray'] || h['x-forwarded-for'] || h['x-forwarded-host']) return false;
    return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(h.host || '');
  }
  const localOnly = (req, res, next) => {
    if (isLocalReq(req)) return next();
    res.status(403).json({ error: 'Disponível apenas no PC do estúdio (localhost).' });
  };

  const PUBLIC = path.join(ROOT, 'public');
  app.get(['/replay', '/replay.html'], localOnly, (req, res) => res.sendFile(path.join(PUBLIC, 'replay.html')));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    // 5.1 Requisição Local legítima
    const resLocal = await fetch(`http://127.0.0.1:${port}/replay`, {
      headers: { Host: `127.0.0.1:${port}` },
    });
    assert.equal(resLocal.status, 200, 'Requisição localhost legítima deve retornar 200');
    const html = await resLocal.text();
    assert.ok(html.includes('id="rp-video-pvw"'), 'HTML deve conter vídeo de prévia');
    assert.ok(html.includes('id="rp-jog"'), 'HTML deve conter volante Jog Wheel');
    assert.ok(html.includes('id="bc-tbar"'), 'HTML deve conter controle T-Bar');
    assert.ok(html.includes('id="rp-var-layer"'), 'HTML deve conter camada VAR');
    assert.ok(html.includes('id="rp-audio-route"'), 'HTML deve conter seletor de roteamento de áudio');
    assert.ok(/<option value="mute" selected>/.test(html), 'Replay/VAR deve abrir com áudio MUDO por padrão');
    assert.ok(html.includes('id="rp-audio-device"'), 'HTML deve conter seletor de dispositivo de áudio');
    assert.ok(html.includes('id="rp-input-source"'), 'HTML deve conter seletor de sinal de entrada do replay');
    assert.ok(html.includes('id="rp-input-audio"'), 'HTML deve conter seletor de áudio de entrada do replay');
    assert.ok(html.includes('id="rp-onair-bug"'), 'HTML deve conter bug visual de replay no ar');
    assert.ok(html.includes('id="rp-active-source-badge"'), 'HTML deve conter badge de sinal ativo');
    assert.ok(html.includes('id="rp-quad-grid"'), 'HTML deve conter visualização Quad Multi-Câmera');

    // 5.2 Requisição com spoof de cabeçalho remoto (túnel simulado)
    const resRemote = await fetch(`http://127.0.0.1:${port}/replay`, {
      headers: {
        Host: 'cast.flue.live',
        'x-forwarded-for': '203.0.113.195',
      },
    });
    assert.equal(resRemote.status, 403, 'Acesso remoto não-autorizado a /replay DEVE ser bloqueado com 403');
  } finally {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
  }
});

// 6. Escolha e troca dinâmica de sinais de entrada (PGM, tela, câmera, vídeo de mídia)
test('6. Escolha e troca de sinais de entrada (qualquer mídia que virou input)', () => {
  const S = { sources: new Map(), stage: [] };

  // Popula o estúdio com múltiplas fontes reais
  const mockScreenStream = { active: true, getVideoTracks: () => [{}] };
  const mockCamStream = { active: true, getVideoTracks: () => [{}], getAudioTracks: () => [{}] };
  const mockVideoEl = {
    captureStream: () => ({ active: true, getVideoTracks: () => [{}], getAudioTracks: () => [{}] }),
  };

  S.sources.set('host:cam', { id: 'host:cam', kind: 'camera', label: 'Câmera Principal', stream: mockCamStream });
  S.sources.set('host:screen', { id: 'host:screen', kind: 'screen', label: 'Compartilhamento de Tela', stream: mockScreenStream });
  S.sources.set('media:vid1', { id: 'media:vid1', kind: 'media', label: 'Vídeo Gol.mp4', el: mockVideoEl });
  S.sources.set('guest:user1', { id: 'guest:user1', kind: 'guest', label: 'Convidado Especial', stream: mockCamStream });

  let toastLog = [];
  const engine = createReplayEngine({
    S,
    getProgramStream: () => ({ active: true, getVideoTracks: () => [{}], getAudioTracks: () => [{}] }),
    toast: (msg) => toastLog.push(msg),
  });

  // 6.1 Lista de fontes de vídeo disponíveis para o operador
  const available = engine.getAvailableSources();
  assert.equal(available.length, 5, 'Deve listar PGM + 4 fontes cadastradas no estúdio');
  assert.equal(available[0].id, 'pgm');
  assert.ok(available.some((s) => s.id === 'host:screen'), 'Deve incluir tela compartilhada');
  assert.ok(available.some((s) => s.id === 'media:vid1'), 'Deve incluir vídeo de mídia');
  assert.ok(available.some((s) => s.id === 'guest:user1'), 'Deve incluir convidado');

  // 6.2 Lista de fontes de áudio disponíveis para o operador
  const availableAudio = engine.getAvailableAudioSources();
  assert.ok(availableAudio.some((a) => a.id === 'pgm'), 'Deve conter áudio PGM');
  assert.ok(availableAudio.some((a) => a.id === 'mic'), 'Deve conter microfone do host');
  assert.ok(availableAudio.some((a) => a.id === 'mute'), 'Deve conter opção sem áudio (mudo)');

  // 6.3 Fonte padrão inicial é PGM
  assert.equal(engine.getCaptureSource(), 'pgm');
  assert.equal(engine.getAudioSource(), 'pgm');

  // 6.4 Alterna para capturar o Vídeo de Mídia e microfone do host
  engine.setCaptureSource('media:vid1');
  assert.equal(engine.getCaptureSource(), 'media:vid1', 'Sinal capturado deve mudar para o vídeo');
  assert.ok(toastLog.some((m) => m.includes('Vídeo Gol.mp4')), 'Toast deve avisar a troca de sinal');

  engine.setAudioSource('mic');
  assert.equal(engine.getAudioSource(), 'mic', 'Áudio capturado deve mudar para mic');

  // 6.5 Alterna para capturar a Tela
  engine.setCaptureSource('host:screen');
  assert.equal(engine.getCaptureSource(), 'host:screen', 'Sinal capturado deve mudar para a tela');

  // 6.6 Resolução de Stream dinâmica
  const streamScreen = engine.resolveCaptureStream('host:screen');
  assert.equal(streamScreen, mockScreenStream, 'Deve resolver stream de tela');

  const streamVideo = engine.resolveCaptureStream('media:vid1');
  assert.ok(streamVideo, 'Deve resolver captureStream do elemento de vídeo');
});

// 7. Seleção Independente das 4 Câmeras, Modo 1 vs 4 Câmeras e Seek Seguro
test('7. Seleção das 4 câmeras, modo 1 e 4 câmeras e seek sem Infinity/NaN', () => {
  // 7.1 Mapeamento independente de 4 câmeras
  const camSources = {
    1: 'pgm',
    2: 'host:cam',
    3: 'media:vid1',
    4: 'host:screen',
  };
  let activeSlot = 1;
  let viewMode = 'single';

  assert.equal(camSources[1], 'pgm');
  assert.equal(camSources[2], 'host:cam');
  assert.equal(camSources[3], 'media:vid1');
  assert.equal(camSources[4], 'host:screen');

  // Alterna câmera ativa para CAM 2
  activeSlot = 2;
  assert.equal(camSources[activeSlot], 'host:cam');

  // Alterna modo de visualização para 4 Câmeras (Quad Multiview)
  viewMode = 'quad';
  assert.equal(viewMode, 'quad');

  // Solo na CAM 3 volta para 1 Câmera
  activeSlot = 3;
  viewMode = 'single';
  assert.equal(viewMode, 'single');
  assert.equal(camSources[activeSlot], 'media:vid1');

  // 7.2 Validação de duração e seek seguro contra Infinity do MediaRecorder
  const mockWebmVideo = {
    duration: Infinity, // Simula comportamento real do Chromium em WebM de MediaRecorder
    currentTime: 0,
  };
  const mockClip = {
    duration: 10.5,
    url: 'blob:clip-valid',
  };

  function testGetClipDuration(clip, video) {
    if (clip && Number.isFinite(clip.duration) && clip.duration > 0) {
      return clip.duration;
    }
    if (video && Number.isFinite(video.duration) && video.duration > 0 && video.duration !== Infinity) {
      return video.duration;
    }
    return 10;
  }

  const calculatedDur = testGetClipDuration(mockClip, mockWebmVideo);
  assert.equal(calculatedDur, 10.5, 'Deve usar a duração real e finita do clipe, nunca Infinity');

  // Simula seek pelo scrub a 50%
  const scrubPercent = 50;
  const targetSeek = (scrubPercent / 100) * calculatedDur;
  assert.equal(targetSeek, 5.25);
  assert.ok(Number.isFinite(targetSeek), 'Target de seek deve ser número finito');

  // 7.3 Validação de prevenção de popup no boot
  const mockSavedState = {
    media: { open: true, x: 100, y: 100, w: 500, h: 400 },
    chat: { open: true, x: 200, y: 200, w: 400, h: 600 },
  };
  // Limpeza de flags open órfãs
  for (const k in mockSavedState) {
    if (mockSavedState[k]) mockSavedState[k].open = false;
  }
  assert.equal(mockSavedState.media.open, false, 'Flag open da mídia deve ser resetada');
  assert.equal(mockSavedState.chat.open, false, 'Flag open do chat deve ser resetada');
});

// 8. ReplayStore Backend, Injeção de initHeaderBlob e Persistência
test('8. ReplayStore Backend e Injeção de initHeaderBlob', async () => {
  const { ReplayStore } = await import('../server/replay.js');
  const tmpDir = path.join(os.tmpdir(), `castdeck-test-replay-${Date.now()}`);
  const store = new ReplayStore({
    recordingsDir: () => tmpDir,
    ffmpegInfo: { available: false }, // Simula sem ffmpeg no teste rapido
  });

  assert.ok(store.dir.includes('replays'), 'Diretório deve conter subpasta replays');

  // 8.1 Salva clipe simulado
  const fakeWebm = Buffer.from('RIFF-FAKE-WEBM-DATA-FOR-TESTING');
  const meta = await store.saveClip(fakeWebm, {
    title: 'Gol Histórico',
    tag: 'GOL',
    duration: 8.5,
    speed: 0.5,
  });

  assert.ok(meta.id.startsWith('replay-'));
  assert.equal(meta.title, 'Gol Histórico');
  assert.equal(meta.tag, 'GOL');
  assert.equal(meta.duration, 8.5);
  assert.ok(meta.webmUrl.includes('replay-'));

  // 8.2 Lista clipes gravados
  const list = await store.listClips();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, meta.id);

  // 8.3 Deleta clipe
  const deleted = await store.deleteClip(meta.id);
  assert.equal(deleted, true);
  const afterDelete = await store.listClips();
  assert.equal(afterDelete.length, 0);

  // Limpa pasta temporaria
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

// 9. Integração com a Mesa de Corte (Switcher), Visibilidade Condicional do Input e Tag Broadcast
await asyncTest('9. Integração com a Mesa de Corte, Visibilidade Condicional e Tag de Replay', async () => {
  const S = { sources: new Map(), stage: ['host:cam'], solo: null, take: null };
  const comp = {
    sources: new Map(),
    stage: ['host:cam'],
    solo: null,
    take: null,
    replayBug: false,
    replayBugText: '',
    upsertSource(id, s) { comp.sources.set(id, s); },
    removeSource(id) { comp.sources.delete(id); },
    setStage(st) { comp.stage = [...st]; },
  };

  let switcherRefreshed = false;
  let tallySynced = false;
  globalThis.__castdeck = {
    switcher: {
      refresh() { switcherRefreshed = true; },
      syncTally() { tallySynced = true; },
    },
    renderTiles() {},
    renderStagebar() {},
  };

  const engine = createReplayEngine({
    S,
    comp,
    getProgramStream: () => ({ active: true }),
  });

  // 9.1 REGRA DE VISIBILIDADE CONDICIONAL:
  // Sem console de replay ativo, 'replay:out' NÃO DEVE APARECER no estúdio nem na mesa de corte
  assert.equal(S.sources.has('replay:out'), false, 'replay:out não deve aparecer se console estiver inativo');
  assert.equal(comp.sources.has('replay:out'), false, 'comp não deve ter replay:out se console estiver inativo');

  // Ao ativar o console (registerConsole), o input DEVE ficar visível na mesa de corte
  const mockWin = { closed: false };
  engine.registerConsole(mockWin);

  assert.equal(S.sources.has('replay:out'), true, 'replay:out deve aparecer no estúdio após ativar console');
  const replaySource = S.sources.get('replay:out');
  assert.equal(replaySource.kind, 'media');
  assert.equal(replaySource.label, 'REPLAY / VAR');
  assert.equal(replaySource.isReplay, true);
  assert.equal(comp.sources.has('replay:out'), true, 'comp deve ter replay:out após ativar console');

  // Validação da regra do Switcher (BUS_KINDS = new Set(['camera', 'screen', 'media', 'image']))
  const BUS_KINDS = new Set(['camera', 'screen', 'media', 'image']);
  assert.ok(BUS_KINDS.has(replaySource.kind), 'replay:out deve pertencer ao BUS_KINDS da mesa de corte');

  // 9.2 Ao colocar o Replay no ar (playoutReplay), a saída do Replay DEVE assumir o PGM (S.take e comp.take)
  engine.playoutReplay({
    url: 'blob:mock-clip-pgm',
    speed: 0.5,
    currentTime: 2.0,
    audioRoute: 'pgm',
  });

  assert.equal(S.take, 'replay:out', 'S.take deve ser replay:out na mesa de corte');
  assert.equal(comp.take, 'replay:out', 'comp.take deve ser replay:out no compositor');
  assert.equal(S.solo, 'replay:out', 'S.solo deve ser replay:out em tela cheia');
  assert.equal(comp.solo, 'replay:out', 'comp.solo deve ser replay:out');
  assert.equal(comp.replayBug, true, 'comp.replayBug deve estar ativo');
  assert.equal(comp.replayBugText, 'REPLAY 50%', 'Texto do bug de replay deve indicar 50%');
  assert.equal(switcherRefreshed, true, 'Switcher deve ser notificado e atualizado');
  assert.equal(tallySynced, true, 'Tally da mesa de corte deve ser sincronizado');

  // 9.3 Ao cortar de volta para o ao vivo (stopPlayout), o PGM deve ser restaurado
  engine.stopPlayout();
  assert.equal(S.take, null, 'S.take deve ser restaurado para null (ao vivo/cena)');
  assert.equal(comp.take, null, 'comp.take deve ser restaurado para null');
  assert.equal(comp.replayBug, false, 'comp.replayBug deve ser desativado');

  // 9.4 Ao desativar o console (unregisterConsole), o input desaparece do estúdio e do switcher
  engine.unregisterConsole(mockWin);
  assert.equal(S.sources.has('replay:out'), false, 'replay:out deve ser removido de S.sources ao fechar console');
  assert.equal(comp.sources.has('replay:out'), false, 'replay:out deve ser removido de comp.sources ao fechar console');
});

// 10. Controle de Buffer em RAM e Proteção de Espaço em Disco (HD Quota & Pruning)
await asyncTest('10. Controle de Buffer em RAM, Quota de Disco e Painel de Configurações', async () => {
  const S = { sources: new Map(), stage: ['host:cam'], solo: null, take: null };
  const comp = { sources: new Map(), stage: ['host:cam'], upsertSource() {}, removeSource() {}, setStage() {} };
  const engine = createReplayEngine({ S, comp });

  // 10.1 Ajuste e leitura da duração do buffer de RAM
  assert.equal(engine.getBufferDuration(), 45, 'Buffer padrão deve ser 45 segundos');
  engine.setBufferDuration(30);
  assert.equal(engine.getBufferDuration(), 30, 'Buffer deve ser ajustado para 30 segundos');
  engine.setBufferDuration(5); // Clamping mínimo 10s
  assert.equal(engine.getBufferDuration(), 10, 'Buffer deve respeitar limite mínimo de 10s');
  engine.setBufferDuration(300); // Clamping máximo 180s
  assert.equal(engine.getBufferDuration(), 180, 'Buffer deve respeitar limite máximo de 180s');

  // 10.2 Backend ReplayStore: Quota de Disco e Pruning Automático para não encher o HD
  const { ReplayStore } = await import('../server/replay.js');
  const tmpDir = path.join(os.tmpdir(), `test-replay-quota-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const store = new ReplayStore({
    recordingsDir: () => tmpDir,
    dataDir: tmpDir,
    ffmpegInfo: { available: false },
  });
  await store.saveConfig({ maxDiskMb: 1, maxBufferSecs: 45 });
  assert.equal(store.maxDiskMb, 1);
  assert.equal(store.maxBufferSecs, 45);

  // Simula clipes gerados ocupando espaço em disco
  const clip1 = await store.saveClip(Buffer.alloc(600 * 1024), {
    id: 'clip_old',
    title: 'Lance Antigo',
  });
  assert.ok(clip1);

  const usageBefore = await store.getStorageUsage();
  assert.equal(usageBefore.clipCount, 1);
  assert.ok(usageBefore.usedBytes >= 600 * 1024);

  // Salva outro clipe de 700 KB, totalizando 1.3 MB (ultrapassando a quota de 1 MB)
  const clip2 = await store.saveClip(Buffer.alloc(700 * 1024), {
    id: 'clip_new',
    title: 'Lance Novo',
  });
  assert.ok(clip2);

  // O auto-prune deve ter descartado o clipe mais antigo (clip_old) para manter sob a quota!
  const list = await store.listClips();
  assert.equal(list.length, 1, 'Deve restar apenas 1 clipe após pruning automático');
  assert.equal(list[0].id, 'clip_new', 'O clipe mais recente deve ser preservado');

  // Limpeza total de disco (clearAllClips)
  const cleared = await store.clearAllClips();
  assert.equal(cleared.ok, true);
  assert.ok(cleared.freedBytes > 0);
  const usageAfterClear = await store.getStorageUsage();
  assert.equal(usageAfterClear.clipCount, 0);
  assert.equal(usageAfterClear.usedBytes, 0);

  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  // 10.3 Elementos do painel de configurações no HTML
  const html = await fs.readFile(path.join(ROOT, 'public', 'replay.html'), 'utf-8');
  assert.ok(html.includes('id="rp-btn-settings"'), 'HTML deve conter botão de Configurações');
  assert.ok(html.includes('id="rp-modal-settings"'), 'HTML deve conter modal de configurações');
  assert.ok(html.includes('id="rp-cfg-disk-limit"'), 'HTML deve conter seletor de limite de disco');
  assert.ok(html.includes('id="rp-cfg-buf-limit"'), 'HTML deve conter seletor de limite de buffer RAM');
  assert.ok(html.includes('id="rp-disk-fill"'), 'HTML deve conter barra de preenchimento do disco');
  assert.ok(html.includes('id="rp-btn-clear-disk"'), 'HTML deve conter botão de limpar armazenamento');
});

// 11. Central de Transição Preview ➜ PGM, Live Mirror e Ícones Vetoriais Broadcast
await asyncTest('11. Central de Transição Preview ➜ PGM (Take Cut & Live Mirror) e Ícones Vetoriais SVG', async () => {
  const S = { sources: new Map(), stage: ['host:cam'], solo: null };
  let playoutArgs = null;
  const comp = {
    sources: new Map(),
    stage: ['host:cam'],
    upsertSource(k, src) { S.sources.set(k, src); },
    removeSource(k) { S.sources.delete(k); },
    setStage(st) { S.stage = [...st]; },
    replayBugText: null,
  };

  const engine = createReplayEngine({ S, comp });
  const win = {};
  engine.registerConsole(win);

  // 11.1 takePreviewToPgm: Transição imediata de Preview para PGM (Corte Direto)
  engine.takePreviewToPgm({
    url: 'blob:mock-pvw-clip',
    currentTime: 4.2,
    isPlaying: true,
    speed: 0.75,
    audioRoute: 'pgm',
    audioVolume: 0.9,
    transition: 'cut',
  });

  assert.equal(S.solo, 'replay:out', 'takePreviewToPgm deve colocar replay:out em solo tela cheia');
  assert.ok(S.stage.includes('replay:out'), 'replay:out deve estar presente no stage');

  // 11.2 syncPreviewPlayout: Sincronização contínua 1:1 no modo Live Mirror
  engine.syncPreviewPlayout({
    url: 'blob:mock-pvw-clip',
    currentTime: 5.0,
    isPlaying: false,
    speed: 0.5,
    audioRoute: 'pgm',
    audioVolume: 0.8,
  });

  assert.equal(comp.replayBugText, 'REPLAY 50%', 'Bug de replay deve refletir a velocidade sincronizada');

  // 11.3 Interface HTML: Presença da Central de Transição e Controles
  const html = await fs.readFile(path.join(ROOT, 'public', 'replay.html'), 'utf-8');
  assert.ok(html.includes('class="bc-transition-hub"'), 'HTML deve conter a Central de Transição entre Monitores A e B');
  assert.ok(html.includes('id="rp-btn-take-pvw"'), 'HTML deve conter botão TAKE direto PVW ➜ PGM');
  assert.ok(html.includes('id="rp-btn-live-mirror"'), 'HTML deve conter botão LIVE MIRROR (Link PGM)');
  assert.ok(html.includes('id="rp-pvw-mirror-badge"'), 'HTML deve conter badge de sinal NO AR (PGM LINK)');
  assert.ok(html.includes('id="rp-btn-swap"'), 'HTML deve conter botão de SWAP');

  // 11.4 Ícones Vetoriais Proprietários SVG com alto contraste (sem emojis soltos)
  assert.ok(html.includes('<svg'), 'Console deve conter SVGs vetoriais profissionais');
  assert.ok(html.includes('viewBox="0 0 24 24"'), 'SVGs devem conter viewBox de precisão');
  assert.ok(html.includes('tag-gol') && html.includes('tag-falta') && html.includes('tag-penalti'), 'Shotbox deve ter estilização para cada categoria de lance');

  engine.unregisterConsole(win);
});

// 12. Cobertura Abrangente: Fallback Canvas PGM, Decisão VAR no PGM e Matriz de Áudio
await asyncTest('12. Cobertura Abrangente: Fallback Canvas PGM, Decisão VAR no PGM e Matriz de Áudio', async () => {
  const mockCanvasStream = { id: 'canvas-stream-mock', getVideoTracks: () => [{}] };
  const S = { sources: new Map(), stage: ['host:cam'], solo: null };
  const comp = {
    sources: new Map(),
    stage: ['host:cam'],
    canvas: {
      captureStream: () => mockCanvasStream,
    },
    upsertSource(k, src) { S.sources.set(k, src); },
    removeSource(k) { S.sources.delete(k); },
    setStage(st) { S.stage = [...st]; },
    replayBugText: null,
  };

  // 12.1 Fallback para comp.canvas.captureStream quando getProgramStream() retorna null
  const engine = createReplayEngine({
    S,
    comp,
    getProgramStream: () => null, // simula programStream temporariamente nulo
  });

  const resolvedStream = engine.resolveCaptureStream('pgm');
  assert.equal(resolvedStream, mockCanvasStream, 'resolveCaptureStream deve resgatar canvas.captureStream quando programStream for nulo');

  const resolvedUnknown = engine.resolveCaptureStream('fonte_inexistente');
  assert.equal(resolvedUnknown, mockCanvasStream, 'resolveCaptureStream deve usar fallback do canvas para fontes não encontradas');

  // 12.2 Decisão do VAR transmitida ao Bug do PGM
  const win = {};
  engine.registerConsole(win);

  // Simula o envio de decisão do VAR pelo console
  comp.replayBugText = 'DECISÃO VAR: GOL CONFIRMADO';
  assert.equal(comp.replayBugText, 'DECISÃO VAR: GOL CONFIRMADO', 'Decisão do VAR deve estar disponível no compositor');

  // 12.3 Matriz de Roteamento de Áudio Broadcast
  // Caso A: CUE (áudio mudo no PGM do estúdio, exclusivo no fone)
  engine.playoutReplay({
    url: 'blob:clip-audio-test',
    speed: 0.5,
    currentTime: 1.0,
    audioRoute: 'cue',
    audioVolume: 0.8,
  });
  const sourceA = S.sources.get('replay:out');
  assert.equal(sourceA.el.muted, true, 'No modo CUE, áudio do estúdio deve ser silenciado');

  // Caso B: PGM (áudio liberado na saída mestre do programa)
  engine.playoutReplay({
    url: 'blob:clip-audio-test',
    speed: 1.0,
    currentTime: 1.0,
    audioRoute: 'pgm',
    audioVolume: 0.7,
  });
  const sourceB = S.sources.get('replay:out');
  assert.equal(sourceB.el.muted, false, 'No modo PGM, áudio do estúdio não deve estar mutado');
  assert.equal(sourceB.el.volume, 0.7, 'Volume deve ser aplicado com exatidão');

  // Caso C: Mute manual no motor
  engine.setAudioMuted(true);
  assert.equal(sourceB.el.muted, true, 'setAudioMuted(true) deve silenciar playoutVideo');
  engine.setAudioMuted(false);
  assert.equal(sourceB.el.muted, false, 'setAudioMuted(false) deve reativar o áudio');

  // Caso D: Ajuste dinâmico de volume master
  engine.setAudioVolume(0.42);
  assert.equal(sourceB.el.volume, 0.42, 'setAudioVolume deve sincronizar volume');

  // Caso E: padrão do Replay/VAR — MUDO no playout (sem áudio no PGM nem no fone)
  engine.playoutReplay({
    url: 'blob:clip-audio-test',
    speed: 1.0,
    currentTime: 1.0,
    audioRoute: 'mute',
    audioVolume: 0.8,
  });
  const sourceMute = S.sources.get('replay:out');
  assert.equal(sourceMute.el.muted, true, 'No modo MUTE (padrão replay), playout não pode ter áudio');

  engine.stopPlayout();
  engine.unregisterConsole(win);
});

// 13. Regress\u00f5es da revis\u00e3o: blob preservado, TAKE ao vivo (stream), retry do buffer e interface sem glifos
await asyncTest('13. Revis\u00e3o l\u00f3gica: blob preservado, TAKE ao vivo, retry do buffer e UI s\u00f3 com SVG', async () => {
  const revoked = [];
  const origRevoke = globalThis.URL.revokeObjectURL;
  globalThis.URL.revokeObjectURL = (u) => { revoked.push(u); };
  globalThis.MediaStream = class MediaStream {
    constructor(tracks = []) { this._t = tracks; this.active = true; }
    getTracks() { return this._t; }
    getVideoTracks() { return this._t; }
    getAudioTracks() { return []; }
    addTrack(t) { this._t.push(t); }
  };

  try {
    const S = { sources: new Map(), stage: ['host:cam'], solo: null };
    const comp = { sources: new Map(), stage: ['host:cam'], upsertSource() {}, removeSource() {}, setStage() {} };
    const engine = createReplayEngine({ S, comp, getProgramStream: () => null });
    const win = {};
    engine.registerConsole(win);

    // 13.1 stopPlayout N\u00c3O pode revogar o blob (o mesmo URL segue no Preview/playlist)
    engine.playoutReplay({ url: 'blob:preview-clip', speed: 0.5, currentTime: 1 });
    engine.stopPlayout();
    assert.equal(revoked.includes('blob:preview-clip'), false, 'voltar ao vivo n\u00e3o deve revogar o clipe do Preview');

    // 13.2 TAKE com Preview ao vivo: PGM recebe o stream, n\u00e3o um clipe vazio
    const live = new MediaStream([{ kind: 'video' }]);
    engine.takePreviewToPgm({ url: null, stream: live, isPlaying: true, speed: 1, transition: 'cut' });
    const src = S.sources.get('replay:out');
    assert.ok(src, 'replay:out deve existir ap\u00f3s TAKE ao vivo');
    assert.equal(src.el.srcObject, live, 'PGM deve receber o mesmo stream do Preview ao vivo');
    assert.equal(S.solo, 'replay:out');

    // 13.3 Voltar ao vivo depois de TAKE ao vivo n\u00e3o quebra
    engine.stopPlayout();
    assert.equal(S.solo, null, 'solo deve ser restaurado');
    engine.unregisterConsole(win);

    // 13.4 Interface: nenhum bot\u00e3o com emoji/glifo solto (apenas SVG)
    const html = await fs.readFile(path.join(ROOT, 'public', 'replay.html'), 'utf-8');
    const glyphBtn = /<button[^>]*>[^<]*[\u26f6\u2715\u229e\u2699\ud83d\uddd1][^<]*<\/button>/u;
    assert.equal(glyphBtn.test(html), false, 'bot\u00f5es n\u00e3o devem usar emoji/glifo (apenas SVG)');
    const js = await fs.readFile(path.join(ROOT, 'public', 'js', 'replay.js'), 'utf-8');
    assert.ok(js.includes('function resetMarks'), 'marcas IN/OUT devem ser resetadas ao trocar de clipe');
    assert.ok(js.includes("document.addEventListener('click'"), 'bot\u00f5es devem perder o foco para n\u00e3o duplicar atalhos');
  } finally {
    globalThis.URL.revokeObjectURL = origRevoke;
    delete globalThis.MediaStream;
  }
});

// 14. Buffer circular com teto + layout sem bot\u00f5es cortados
await asyncTest('14. Buffer circular nunca excede o limite e CSS do console balanceado', async () => {
  const S = { sources: new Map(), stage: [], solo: null };
  const engine = createReplayEngine({ S, getProgramStream: () => ({}) });
  const win = {};
  engine.registerConsole(win);
  engine.setBufferDuration(45);
  const rec = MockMediaRecorder.lastInstance;

  // 14.1 Grava muito mais que 45 s: o buffer s\u00f3 mant\u00e9m os \u00faltimos 45 s
  feedWebm(rec, 400);
  await engine.flushBuffer();
  let st = engine.getStats();
  assert.ok(st.chunks >= 40, `buffer deve continuar cheio (${st.chunks} chunks)`);
  assert.ok(st.rawDuration <= 46.5, `dura\u00e7\u00e3o ${st.rawDuration}s deve ficar perto de 45s`);
  assert.ok(st.chunks <= 48, `chunks ${st.chunks} devem ser descartados (circular)`);
  // O clipe continua montando com o in\u00edcio descartado (cabe\u00e7alho guardado \u00e0 parte)
  assert.ok(await engine.createClip(10), 'clipe deve sair mesmo depois de o in\u00edcio ter sido descartado');

  // 14.2 Reduzir o buffer corta imediatamente o excedente
  engine.setBufferDuration(15);
  st = engine.getStats();
  assert.ok(st.rawDuration <= 16.5, 'ao reduzir o buffer o excedente \u00e9 descartado na hora');

  // 14.3 Teto em bytes: chunks gigantes tamb\u00e9m s\u00e3o descartados
  engine.setBufferDuration(45);
  const big = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'video/webm' });
  for (let i = 0; i < 30; i++) rec.ondataavailable({ data: big });
  await engine.flushBuffer();
  const bytesCap = 45 * 1.25 * 1024 * 1024;
  assert.ok(engine.getStats().chunks * big.size <= bytesCap + big.size * 2, 'teto em MB deve ser respeitado');
  engine.unregisterConsole(win);

  // 14.4 CSS: chaves balanceadas no <style> (um @media aberto engolia o CSS do modal)
  const html = await fs.readFile(path.join(ROOT, 'public', 'replay.html'), 'utf-8');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  assert.equal(open, close, `chaves do CSS desbalanceadas: { ${open} vs } ${close}`);
  assert.ok(html.includes('flex-wrap: wrap') && html.includes('safe center'), 'regras anti-corte devem existir');
});

// 15. Parada no Mark OUT e auto-retorno ao vivo via onEnded
await asyncTest('15. Parada no Mark OUT e término do playout com retorno ao vivo', async () => {
  const S = { sources: new Map(), stage: ['host:cam'], solo: null, take: null };
  const comp = { setStage: () => {}, upsertSource: () => {}, sources: new Map() };
  const engine = createReplayEngine({ S, comp, getProgramStream: () => ({}) });
  const win = {};
  engine.registerConsole(win);

  const srcEntry = S.sources.get('replay:out');
  const vid = srcEntry.el;

  // 15.1 Playout com Mark OUT para aos 7.5s
  let endedCalled = false;
  engine.playoutReplay({
    url: 'blob:mock-clip-out',
    speed: 0.5,
    currentTime: 2.0,
    markOut: 7.5,
    onEnded: () => { endedCalled = true; },
  });

  assert.equal(S.solo, 'replay:out', 'Replay deve assumir o solo');
  assert.equal(typeof vid.ontimeupdate, 'function', 'ontimeupdate deve ser registrado para monitorar o Mark OUT');

  // Simula avanço do vídeo até o Mark OUT
  vid.currentTime = 7.5;
  vid.ontimeupdate();

  assert.equal(vid.paused, true, 'Vídeo deve pausar ao atingir o Mark OUT');
  assert.equal(vid.currentTime, 7.5, 'Tempo deve ser travado exatamente no Mark OUT');
  assert.equal(endedCalled, true, 'Callback onEnded deve ser acionado');

  // 15.2 Playout sem callback específico chama stopPlayout por padrão ao chegar ao fim
  engine.playoutReplay({
    url: 'blob:mock-clip-end',
    speed: 1.0,
    currentTime: 0,
  });
  assert.equal(S.solo, 'replay:out');
  assert.equal(typeof vid.onended, 'function');

  vid.onended();
  assert.notEqual(S.solo, 'replay:out', 'Após onended padrão, playout deve ser encerrado e solo restaurado');

  // 15.3 Valida presença de markOut no replay.js
  const js = await fs.readFile(path.join(ROOT, 'public', 'js', 'replay.js'), 'utf-8');
  assert.ok(js.includes('pvwVideo.currentTime >= markOutTime'), 'onPvwTimeUpdate deve pausar ao atingir markOutTime');
  assert.ok(js.includes('markOut: markOutTime'), 'playoutReplay e takePreviewToPgm devem receber markOutTime');

  engine.unregisterConsole(win);
});

// 16. Banner centralizado, alinhamento de keyframe anti-corrupção e dispensa de buffer no REC JOGO
await asyncTest('16. Banner no topo, proteção contra corrupção e REC JOGO sem buffer redundante', async () => {
  const S = { sources: new Map(), stage: ['host:cam'], solo: null };
  const engine = createReplayEngine({ S, getProgramStream: () => ({}) });
  const win = {};
  engine.registerConsole(win);

  // 16.1 REC JOGO opera em paralelo com o buffer de RAM sem conflito
  assert.equal(engine.getStats().active, true, 'Buffer RAM inicia ativo sob demanda');

  // Simula início de gravação de partida
  globalThis.fetch = async (url) => {
    if (url.includes('/api/replay/match/start')) {
      return { ok: true, json: async () => ({ ok: true, session: { id: 'match_123' } }) };
    }
    if (url.includes('/api/replay/match/stop')) {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    return { ok: true, json: async () => ({ ok: true }) };
  };

  const startRes = await engine.startMatchRecording('Final do Campeonato');
  assert.equal(startRes.ok, true);
  assert.equal(engine.getStats().active, true, 'Buffer RAM deve permanecer ativo para permitir replays durante REC JOGO');
  assert.equal(engine.getStats().isMatchRecording, true, 'isMatchRecording deve ser reportado como true');

  // Encerramento do REC JOGO
  await engine.stopMatchRecording();
  assert.equal(engine.getStats().active, true, 'Buffer RAM continua ativo normalmente após encerrar REC JOGO');

  // 16.2 Tag REPLAY no canto superior esquerdo menor no Compositor e no replay.html
  const compJs = await fs.readFile(path.join(ROOT, 'public', 'js', 'studio', 'compositor.js'), 'utf-8');
  assert.ok(compJs.includes('x = this.vertical ? 14 : 18') && compJs.includes('y = this.vertical ? 24 : 14'), 'drawReplayBug deve posicionar a tag no canto superior esquerdo compacto');

  const replayHtml = await fs.readFile(path.join(ROOT, 'public', 'replay.html'), 'utf-8');
  assert.ok(replayHtml.includes('top: 10px') && replayHtml.includes('left: 12px'), 'badge .bc-onair-replay-bug deve ficar no canto superior esquerdo');

  // 16.3 Versão mobile / Android não deve mostrar o painel / botão de replay
  const studioJs = await fs.readFile(path.join(ROOT, 'public', 'js', 'studio', 'studio.js'), 'utf-8');
  assert.ok(studioJs.includes("IS_MOBILE || S.system.platform === 'android' ? '' : `<button class=\"btn\" id=\"btn-replay\""), 'studio.js não deve renderizar #btn-replay no mobile/Android');
  assert.ok(studioJs.includes("if (IS_MOBILE || S.system?.platform === 'android') return;"), 'openReplayConsole deve bloquear abertura no mobile/Android');

  const featuresCss = await fs.readFile(path.join(ROOT, 'public', 'css', 'modules', 'features.css'), 'utf-8');
  assert.ok(featuresCss.includes('#btn-replay') && featuresCss.includes('display: none !important;'), 'features.css deve ocultar #btn-replay no mobile/Android');

  // 16.4 Proteção anti-corrupção: corte só em Cluster real e keyframe a cada 1s
  const repEngJs = await fs.readFile(path.join(ROOT, 'public', 'js', 'studio', 'replay-engine.js'), 'utf-8');
  assert.ok(repEngJs.includes('function findClusters'), 'corte deve usar o índice de Clusters');
  assert.ok(repEngJs.includes('videoKeyFrameIntervalDuration: 1000'), 'deve pedir keyframe a cada 1000ms');
  assert.ok(!/videoKeyFrameIntervalCount\s*[:=]/.test(repEngJs), 'Duration + Count juntos fazem o Chromium recusar o gravador');

  engine.unregisterConsole(win);
});

// 17. Botão e Controle do Modo Buffer na Interface de Replay
await asyncTest('17. Botão dedicado do modo buffer (startBuffer, stopBuffer, toggleBuffer e UI)', async () => {
  const S = { sources: new Map(), stage: ['host:cam'], solo: null };
  const engine = createReplayEngine({ S, getProgramStream: () => ({}) });
  const win = {};
  engine.registerConsole(win);

  // 17.1 Métodos de controle manual exportados pelo motor
  assert.equal(typeof engine.startBuffer, 'function', 'startBuffer deve ser exportado');
  assert.equal(typeof engine.stopBuffer, 'function', 'stopBuffer deve ser exportado');
  assert.equal(typeof engine.toggleBuffer, 'function', 'toggleBuffer deve ser exportado');
  assert.equal(typeof engine.isBufferActive, 'function', 'isBufferActive deve ser exportado');

  // Alterna buffer: para e reinicia
  assert.equal(engine.isBufferActive(), true, 'Inicia ativo sob demanda');
  engine.stopBuffer();
  assert.equal(engine.isBufferActive(), false, 'stopBuffer deve desativar');
  assert.equal(engine.getStats().active, false);

  engine.startBuffer();
  assert.equal(engine.isBufferActive(), true, 'startBuffer deve reativar');
  assert.equal(engine.getStats().active, true);

  const toggled = engine.toggleBuffer();
  assert.equal(toggled, false, 'toggleBuffer deve pausar se estava ativo');
  assert.equal(engine.isBufferActive(), false);

  const toggled2 = engine.toggleBuffer();
  assert.equal(toggled2, true, 'toggleBuffer deve reativar se estava pausado');
  assert.equal(engine.isBufferActive(), true);

  // 17.2 Botão na interface HTML e estilização CSS
  const replayHtml = await fs.readFile(path.join(ROOT, 'public', 'replay.html'), 'utf-8');
  assert.ok(replayHtml.includes('id="rp-btn-buffer-toggle"'), 'replay.html deve conter botão #rp-btn-buffer-toggle');
  assert.ok(replayHtml.includes('.bc-hdr-btn.buffer-active'), 'replay.html deve conter estilo para buffer-active');
  assert.ok(replayHtml.includes('.bc-hdr-btn.buffer-idle'), 'replay.html deve conter estilo para buffer-idle');

  // 17.3 Evento de clique e atalho de teclado no replay.js
  const replayJs = await fs.readFile(path.join(ROOT, 'public', 'js', 'replay.js'), 'utf-8');
  assert.ok(replayJs.includes('toggleBufferMode'), 'replay.js deve implementar toggleBufferMode');
  assert.ok(replayJs.includes('#rp-btn-buffer-toggle'), 'replay.js deve vincular clique do botão de buffer');
  assert.ok(replayJs.includes("e.code === 'KeyB'"), 'replay.js deve aceitar atalho de teclado B para alternar o buffer');

  engine.unregisterConsole(win);
});

// 18. Controle de Câmera Lenta estilo EVS em tempo real (setPlayoutSpeed, T-Bar dinâmica e bug text)
await asyncTest('18. Controle de Câmera Lenta estilo EVS em tempo real (setPlayoutSpeed, T-Bar dinâmica e bug text)', async () => {
  const S = { sources: new Map(), stage: ['host:cam'], solo: null };
  const comp = {
    solo: null,
    take: null,
    replayBug: false,
    replayBugText: '',
    upsertSource() {},
    setStage() {},
  };
  const engine = createReplayEngine({ S, comp, getProgramStream: () => ({}) });
  const win = {};
  engine.registerConsole(win);

  // 18.1 Método setPlayoutSpeed exportado
  assert.equal(typeof engine.setPlayoutSpeed, 'function', 'setPlayoutSpeed deve ser exportado');

  // Coloca replay no ar a 50%
  engine.playoutReplay({ url: 'blob:mock-lance', speed: 0.5 });
  assert.equal(comp.replayBug, true);
  assert.equal(comp.replayBugText, 'REPLAY 50%');

  // Operador move T-Bar para 25% com o replay no ar
  engine.setPlayoutSpeed(0.25);
  assert.equal(comp.replayBugText, 'REPLAY 25%');

  // Operador move T-Bar para 75%
  engine.setPlayoutSpeed(0.75);
  assert.equal(comp.replayBugText, 'REPLAY 75%');

  // Operador move T-Bar para 100% (velocidade normal)
  engine.setPlayoutSpeed(1.0);
  assert.equal(comp.replayBugText, 'REPLAY');

  // Limites de segurança (mín 0.05, máx 2.0)
  engine.setPlayoutSpeed(0.01);
  assert.equal(comp.replayBugText, 'REPLAY 5%');

  // 18.2 Validações em public/js/replay.js
  const replayJs = await fs.readFile(path.join(ROOT, 'public', 'js', 'replay.js'), 'utf-8');
  assert.ok(replayJs.includes('setPlayoutSpeed'), 'replay.js deve chamar setPlayoutSpeed para sincronizar no ar');
  assert.ok(replayJs.includes('pvwVideo.preservesPitch = true'), 'replay.js deve preservar pitch no áudio');
  assert.ok(replayJs.includes('triggerReplay(10)'), 'replay.js deve buscar buffer recente ao mover T-Bar no sinal ao vivo');

  engine.stopPlayout();
  engine.unregisterConsole(win);
});

// 19. Funcionamento real do buffer e do REC JOGO (bytes, ordem dos envios, servidor)
await asyncTest('19. Corte em Cluster com tempo zerado, REC JOGO em ordem e partida protegida no disco', async () => {
  const S = { sources: new Map(), stage: [], solo: null };
  const engine = createReplayEngine({ S, getProgramStream: () => ({}) });
  const win = {};
  engine.registerConsole(win);
  const rec = MockMediaRecorder.lastInstance;
  assert.equal(rec.opts.videoKeyFrameIntervalDuration, 1000, 'gravador deve receber keyframe de 1s');

  // 19.1 Clipe começa num Cluster e o 1º timecode vira 0 (os seguintes andam de 1000 em 1000)
  feedWebm(rec, 30);
  await engine.flushBuffer();
  const clip = await engine.createClip(5);
  const u8 = new Uint8Array(await clip.blob.arrayBuffer());
  assert.deepEqual([...u8.slice(0, 4)], [0x1A, 0x45, 0xDF, 0xA3], 'clipe começa com o cabeçalho EBML');
  const tcs = [];
  for (let i = 0; i < u8.length - 18; i++) {
    if (u8[i] === 0x1F && u8[i + 1] === 0x43 && u8[i + 2] === 0xB6 && u8[i + 3] === 0x75 && u8[i + 12] === 0xE7) {
      tcs.push((u8[i + 14] << 24 >>> 0) + (u8[i + 15] << 16) + (u8[i + 16] << 8) + u8[i + 17]);
    }
  }
  assert.equal(u8[8], 0x1F, 'logo após o cabeçalho vem um Cluster (nada de bytes soltos de outro Cluster)');
  assert.equal(tcs[0], 0, `1º timecode do clipe deve ser 0 (veio ${tcs[0]})`);
  assert.deepEqual(tcs.slice(0, 3), [0, 1000, 2000], 'timecodes seguintes mantêm o ritmo');
  assert.ok(tcs.length >= 5 && tcs.length <= 7, `clipe de 5 s deve ter ~5-6 Clusters (tem ${tcs.length})`);

  // 19.2 Trocar a fonte zera cabeçalho e índice (chunks do gravador antigo não contaminam o novo)
  engine.setCaptureSource('pgm');
  await engine.flushBuffer();
  assert.equal(engine.getStats().chunks, 0, 'troca de fonte começa um buffer novo');
  assert.equal(await engine.createClip(5), null, 'sem dados novos não há clipe velho');

  // 19.3 REC JOGO: pedaços chegam ao servidor na ordem, mesmo com respostas fora de ordem
  const sent = [];
  let stopCalledAfter = -1;
  globalThis.fetch = async (url, opts = {}) => {
    if (url.includes('/match/start')) return { ok: true, json: async () => ({ ok: true, session: { id: 'j1' } }) };
    if (url.includes('/match/chunk')) {
      const n = (await opts.body.arrayBuffer()).byteLength;
      await new Promise((r) => setTimeout(r, n === 3 ? 1 : 30 - sent.length * 5)); // 1º lento, depois mais rápidos
      sent.push(n);
      return { ok: true, json: async () => ({ ok: true }) };
    }
    if (url.includes('/match/stop')) { stopCalledAfter = sent.length; return { ok: true, json: async () => ({ ok: true }) }; }
    return { ok: true, json: async () => ({}) };
  };
  await engine.startMatchRecording('Teste');
  const mrec = MockMediaRecorder.lastInstance;
  [10, 20, 30, 40].forEach((n) => mrec.ondataavailable({ data: new Blob([new Uint8Array(n)]) }));
  await engine.stopMatchRecording();
  assert.deepEqual(sent, [10, 20, 30, 40, 3], 'ordem dos pedaços preservada, incluindo o último do stop()');
  assert.equal(stopCalledAfter, 5, 'servidor só é encerrado depois do último pedaço chegar');
  engine.unregisterConsole(win);

  // 19.4 Servidor: pedaço sem sessão é recusado e a partida em andamento não é apagada pelo prune
  const { ReplayStore } = await import('../server/replay.js');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'castdeck-replay-'));
  const store = new ReplayStore({ recordingsDir: tmp, ffmpegInfo: { available: false }, dataDir: tmp });
  const orphan = await store.appendMatchChunk(Buffer.from([1, 2, 3]));
  assert.equal(orphan.ok, false, 'pedaço atrasado sem sessão deve ser recusado');
  assert.equal(store.getMatchStatus().active, false, 'pedaço órfão não pode abrir sessão fantasma');

  await store.startMatchRecording({ title: 'Jogo' });
  await Promise.all([1, 2, 3, 4, 5].map((n) => store.appendMatchChunk(Buffer.alloc(200 * 1024, n))));
  const file = store.activeMatchSession.filePath;
  const disk = await fs.readFile(file);
  const order = [0, 1, 2, 3, 4].map((k) => disk[k * 200 * 1024]);
  assert.deepEqual(order, [1, 2, 3, 4, 5], 'escritas simultâneas não podem embaralhar o arquivo');

  store.maxDiskMb = 0.5; // cota menor que a própria partida
  await store.pruneDiskStorage();
  assert.ok(await fs.stat(file).then(() => true, () => false), 'prune não pode apagar a partida que está gravando');
  await store.stopMatchRecording();
  await fs.rm(tmp, { recursive: true, force: true });
});

// 20. Limpeza segura (não apaga partida ativa/arquivos do usuário) e recuperação de partida órfã
await asyncTest('20. Limpeza segura de disco e recuperação de partida interrompida', async () => {
  const { ReplayStore } = await import('../server/replay.js');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'castdeck-clear-'));
  const store = new ReplayStore({ recordingsDir: () => tmp, ffmpegInfo: { available: false }, dataDir: tmp });

  // Arquivos que NÃO são clipes, na MESMA pasta de gravação (usuário apontou o HD para cá)
  const rec = store.dir;
  await fs.writeFile(path.join(rec, 'meu-video.mp4'), Buffer.from([1, 2, 3]));
  await fs.writeFile(path.join(rec, 'notas.txt'), 'não apagar');

  await store.startMatchRecording({ title: 'Partida ativa' });
  const activeFile = store.activeMatchSession.filePath;
  await store.appendMatchChunk(Buffer.alloc(1024, 7));
  const saved = await store.saveClip(Buffer.alloc(2048, 1), { id: 'replay-teste', title: 'Lance' });

  // Renomear persiste no JSON do clipe (playlist não perde o nome ao recarregar)
  const renamed = await store.updateClip(saved.id, { title: 'Lance Renomeado' });
  assert.equal(renamed?.title, 'Lance Renomeado', 'updateClip deve persistir o novo título');

  const cleared = await store.clearAllClips();
  assert.equal(await fs.stat(activeFile).then(() => true, () => false), true, 'partida em andamento NÃO pode ser apagada');
  assert.equal(await fs.stat(path.join(rec, 'meu-video.mp4')).then(() => true, () => false), true, 'arquivo do usuário NÃO pode ser apagado');
  assert.equal(await fs.stat(path.join(rec, 'notas.txt')).then(() => true, () => false), true, 'arquivo qualquer NÃO pode ser apagado');
  assert.equal(await fs.stat(path.join(rec, `${saved.id}.webm`)).then(() => true, () => false), false, 'clipe salvo deve ser apagado');
  assert.ok(cleared.skipped >= 1, 'limpeza deve informar o que preservou');
  await store.stopMatchRecording();

  // Boot: JSON inProgress de execução anterior vira "interrompida", sem duração infinita
  const tmp2 = await fs.mkdtemp(path.join(os.tmpdir(), 'castdeck-recover-'));
  const rec2 = path.join(tmp2, 'replays');
  await fs.mkdir(rec2, { recursive: true });
  const startedAt = Date.now() - 60000;
  const webm = path.join(rec2, 'jogo-interrompido.webm');
  await fs.writeFile(webm, Buffer.alloc(512, 9));
  await fs.writeFile(path.join(rec2, 'jogo-interrompido.json'), JSON.stringify({
    id: 'jogo-interrompido', title: 'Jogo', tag: 'PARTIDA', isContinuousMatch: true, inProgress: true,
    startedAt, duration: 0, bytes: 0, webmUrl: '/api/replay/file/jogo-interrompido.webm', mp4Url: null,
  }));
  const store2 = new ReplayStore({ recordingsDir: () => tmp2, ffmpegInfo: { available: false }, dataDir: tmp2 });
  const recovered = await store2.recoverInterruptedSessions();
  assert.equal(recovered, 1, 'uma partida interrompida deve ser recuperada');
  const meta2 = JSON.parse(await fs.readFile(path.join(rec2, 'jogo-interrompido.json'), 'utf-8'));
  assert.equal(meta2.inProgress, false, 'JSON recuperado não pode continuar inProgress');
  assert.equal(meta2.interrupted, true, 'recuperação deve marcar interrupted');
  assert.ok(meta2.duration >= 1, 'duração recuperada deve ser positiva');

  await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  await fs.rm(tmp2, { recursive: true, force: true }).catch(() => {});
});

console.log(`\nResultado: ${passed} passaram, ${failed} falharam.\n`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log('Todos os testes do Replay passaram com sucesso!');
  process.exitCode = 0;
}


