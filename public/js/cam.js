// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Câmera remota: o celular (ou outro aparelho) vira uma câmera do estúdio pelo link/QR de "＋ Câmera".
//  - entra na sala como convidado com state.cam = true: o host não monta retorno (GuestView) nem mix-minus,
//    então não gasta CPU do PC do host nem bateria/dados do celular com o vídeo de volta
//  - só envia: vídeo (traseira por padrão) e, se o operador ligar, o microfone (desligado por padrão para não
//    duplicar o som da sala)
//  - tally: o host avisa (control 'tally') quando esta câmera está no ar (vermelho) ou na prévia (verde)
//  - tela cheia, interface que some com um toque, painel "Imagem" (zoom com pinça, foco, exposição, balanço de
//    branco... só o que o aparelho libera) e painel "Aparelhos" (câmera, microfone, qualidade, fps, nome).
//    Toda troca de câmera/microfone usa replaceTrack no mesmo sender: o host não percebe nada além da imagem nova.
import { $, $$, esc, toast, icons } from './ui.js';
import { Signaling, Peer, loadIce } from './rtc.js';
import { toggleFull, isFull, onFullChange } from './fullscreen.js';

const studioId = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const app = $('#app');
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
// Bitrate de envio generoso para a câmera remota: a imagem chega nítida e sem o encoder
// reduzir resolução a cada oscilação de rede. O celular ainda pode escolher 720p no Aparelhos.
const QUALITY = { 720: { w: 1280, h: 720, bps: 5_000_000 }, 1080: { w: 1920, h: 1080, bps: 9_000_000 } };
const FPS = [30, 60];
// ajustes de imagem genéricos (webcams no PC costumam ter; celulares quase nunca)
const PICTURE = [
  ['brightness', 'Brilho'],
  ['contrast', 'Contraste'],
  ['saturation', 'Saturação'],
  ['sharpness', 'Nitidez'],
];
// Tudo que o host pode ajustar remotamente. Só é aplicado o que a câmera informar em getCapabilities().
const REMOTE_CTL = [
  'zoom', 'focusMode', 'focusDistance', 'exposureMode', 'exposureCompensation', 'exposureTime', 'iso',
  'whiteBalanceMode', 'colorTemperature', 'brightness', 'contrast', 'saturation', 'sharpness', 'torch',
];

const C = {
  studio: null,
  myId: null,
  peer: null,
  stream: new MediaStream(), // um só MediaStream durante toda a sessão: o host identifica a câmera por camStreamId
  video: null,
  mic: null,
  micOn: false,
  facing: IS_MOBILE ? 'environment' : 'user',
  videoId: '', // câmera escolhida em "Aparelhos" ('' = automática pela frente/traseira)
  audioId: '', // microfone escolhido ('' = padrão do aparelho)
  quality: '720',
  fps: 30,
  torch: false,
  name: '',
  tally: { pgm: false, pvw: false },
  ctl: {}, // ajustes de imagem aplicados (zoom, foco...): reaplicados quando a faixa de vídeo é reaberta
  caps: {}, // capacidades atuais da faixa (enviadas ao host para montar os controles)
  devices: { v: [], a: [] },
  sheet: '', // '' fechado | 'ctl' imagem | 'dev' aparelhos
  rejoins: 0,
  log: [],
  ifb: { muted: false },
  pttLatch: false,
};
window.__cam = C; // diagnóstico e testes e2e
const clog = (m) => C.log.push(`${(performance.now() / 1000).toFixed(1)}s ${m}`);
const t = (s) => window.CDi18n?.t(s) ?? s;
let sig;

try {
  const p = JSON.parse(localStorage.getItem('castdeck.cam') || '{}');
  if (p.facing) C.facing = p.facing;
  if (QUALITY[p.quality]) C.quality = p.quality;
  if (p.name) C.name = p.name;
  if (typeof p.videoId === 'string') C.videoId = p.videoId;
  if (typeof p.audioId === 'string') C.audioId = p.audioId;
  if (FPS.includes(p.fps)) C.fps = p.fps;
  if (p.ifbMuted === '1') C.ifb.muted = true;
  if (p.ifbLatch === '1') C.pttLatch = true;
} catch {}
// O link gerado pelo estúdio pode definir a qualidade inicial: /cam/<id>?q=1080&fps=30
try {
  const params = new URLSearchParams(location.search);
  if (QUALITY[params.get('q')]) C.quality = params.get('q');
  const fps = Number(params.get('fps'));
  if (FPS.includes(fps)) C.fps = fps;
} catch {}
const savePrefs = () => {
  try {
    localStorage.setItem('castdeck.cam', JSON.stringify({ facing: C.facing, quality: C.quality, name: C.name, videoId: C.videoId, audioId: C.audioId, fps: C.fps, ifbMuted: C.ifb.muted ? '1' : '0', ifbLatch: C.pttLatch ? '1' : '0' }));
  } catch {}
};
// o nome padrão vai para o programa do estúdio: sai já no idioma do aparelho (o dicionário carrega antes do boot terminar)
const defaultName = () => {
  const n = IS_MOBILE ? (/iPhone|iPad/i.test(navigator.userAgent) ? 'Câmera iPhone' : 'Câmera celular') : 'Câmera remota';
  return window.CDi18n?.t(n) ?? n;
};

// a tela apagada derruba a câmera no celular: pede para mantê-la acesa enquanto a página está aberta
let wake = null;
async function keepAwake() {
  try {
    wake = (await navigator.wakeLock?.request('screen')) || null;
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  keepAwake();
  // o Android pode fechar a câmera com a tela bloqueada sem encerrar a página: reabre ao voltar
  if (!C.video || C.video.readyState === 'ended') openVideo().catch(() => {});
});
// câmera USB ou fone Bluetooth conectado/desconectado: atualiza as listas do painel
navigator.mediaDevices?.addEventListener?.('devicechange', async () => {
  await loadDevices();
  if (C.sheet === 'dev') renderSheet();
});

boot();

async function boot() {
  app.innerHTML = `<div class="cam-center"><div class="spin"></div><p>Conectando ao estúdio…</p></div>`;
  try {
    const r = await fetch(`/api/public/studios/${encodeURIComponent(studioId)}`);
    if (!r.ok) throw new Error('Estúdio não encontrado. Confira o link ou leia o QR Code de novo.');
    C.studio = await r.json();
  } catch (e) {
    return fatal('Ops!', e.message);
  }
  if (C.studio.color) document.documentElement.style.setProperty('--accent', C.studio.color);
  document.title = `Câmera — ${C.studio.name}`;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return fatal('Conexão sem segurança', 'O navegador só libera a câmera em páginas https. Abra o link completo que começa com https:// (no link da rede local, toque em Avançado → Continuar).');
  }
  C.name ||= defaultName();
  const iceReady = loadIce();
  render();
  try {
    await openVideo();
  } catch (e) {
    return fatal('Não foi possível abrir a câmera', `${e.name === 'NotAllowedError' ? 'Permita o acesso à câmera nas configurações do navegador e recarregue a página.' : e.message || e.name}`);
  }
  loadDevices(); // os nomes das câmeras só aparecem depois da permissão
  await keepAwake();
  await iceReady;
  connect();
}

function fatal(title, msg) {
  app.innerHTML = `<div class="cam-center"><div class="cam-card"><h1>${esc(title)}</h1><p>${esc(msg)}</p><button class="btn primary" onclick="location.reload()">Tentar de novo</button></div></div>`;
}

// ---------- câmera e microfone ----------
function videoConstraints() {
  const q = QUALITY[C.quality];
  const base = { width: { ideal: q.w }, height: { ideal: q.h }, frameRate: { ideal: C.fps } };
  return C.videoId ? { ...base, deviceId: { exact: C.videoId } } : { ...base, facingMode: { ideal: C.facing } };
}

async function openVideo() {
  let s;
  try {
    s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(), audio: false });
  } catch (e) {
    // a câmera escolhida sumiu (USB desconectada, outro aparelho): volta para a automática em vez de travar
    if (!C.videoId || !/NotFound|Overconstrained/.test(e.name)) throw e;
    clog(`videoId falhou (${e.name}), voltando para automática`);
    C.videoId = '';
    savePrefs();
    s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(), audio: false });
  }
  const t = s.getVideoTracks()[0];
  t.contentHint = 'motion';
  const old = C.video;
  C.video = t;
  C.torch = false;
  if (old) {
    C.stream.removeTrack(old);
    old.stop();
  }
  C.stream.addTrack(t);
  t.onended = () => clog('video ended');
  // troca sem renegociar quando já há conexão (mesmo sender, mesma faixa no host)
  const snd = C.peer?.pc.getSenders().find((x) => x.track === old || x.track?.kind === 'video');
  if (snd) await snd.replaceTrack(t).catch(() => {});
  else if (C.peer) C.peer.pc.addTrack(t, C.stream);
  applyBitrate();
  reapplyCtl();
  capsSnapshot();
  pushCamStateSoon();
  const v = $('#cam-video');
  if (v) {
    v.srcObject = C.stream;
    v.classList.toggle('mirror', isMirror(t));
    v.play().catch(() => {});
  }
  renderControls();
  if (C.sheet) renderSheet();
}

// espelha só a câmera frontal (como qualquer app de câmera); webcams do PC não informam o lado e contam como frontal
function isMirror(track) {
  const fm = track?.getSettings?.().facingMode;
  if (fm) return fm === 'user';
  return C.videoId ? !IS_MOBILE : C.facing === 'user';
}

function micConstraints() {
  const a = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  return C.audioId ? { ...a, deviceId: { exact: C.audioId } } : a;
}

async function getMicTrack() {
  try {
    return (await navigator.mediaDevices.getUserMedia({ audio: micConstraints(), video: false })).getAudioTracks()[0];
  } catch (e) {
    if (!C.audioId || !/NotFound|Overconstrained/.test(e.name)) throw e;
    C.audioId = '';
    savePrefs();
    return (await navigator.mediaDevices.getUserMedia({ audio: micConstraints(), video: false })).getAudioTracks()[0];
  }
}

async function setMic(on) {
  if (on && !C.mic) {
    try {
      C.mic = await getMicTrack();
      C.stream.addTrack(C.mic);
      if (C.peer) C.peer.pc.addTrack(C.mic, C.stream);
    } catch (e) {
      toast('Microfone indisponível: ' + (e.message || e.name), 'err');
      return;
    }
  }
  C.micOn = on;
  if (C.mic) C.mic.enabled = on;
  pushState();
  renderControls();
}

// outro microfone escolhido: se já existe faixa de áudio, troca no mesmo sender (sem renegociar)
async function changeMic(id) {
  C.audioId = id;
  savePrefs();
  pushCamStateSoon();
  if (!C.mic) return toast(t('Microfone escolhido. Ligue o Mic na barra para enviar o som.'));
  try {
    const nt = await getMicTrack();
    const old = C.mic;
    nt.enabled = C.micOn;
    const snd = C.peer?.pc.getSenders().find((x) => x.track === old || x.track?.kind === 'audio');
    if (snd) await snd.replaceTrack(nt).catch(() => {});
    C.stream.removeTrack(old);
    C.stream.addTrack(nt);
    old.stop();
    C.mic = nt;
    toast(t('Microfone trocado'));
  } catch (e) {
    toast('Microfone indisponível: ' + (e.message || e.name), 'err');
  }
}

async function loadDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    C.devices = {
      v: all.filter((d) => d.kind === 'videoinput'),
      // 'default' e 'communications' (Windows) são apelidos de outro aparelho: o "Padrão" já cobre
      a: all.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications'),
    };
    pushCamStateSoon();
  } catch {}
}

async function toggleTorch() {
  const caps = C.video?.getCapabilities?.() || {};
  if (!caps.torch) return toast('Este aparelho não permite usar a lanterna pelo navegador.');
  C.torch = !C.torch;
  try {
    await C.video.applyConstraints({ advanced: [{ torch: C.torch }] });
  } catch {
    C.torch = false;
  }
  pushCamStateSoon();
  renderControls();
  if (C.sheet === 'ctl') renderSheet();
}

function applyBitrate() {
  // setParameters só vale depois da negociação: aplica agora e de novo um pouco depois
  // 60 fps precisa de mais bits para não borrar o movimento (mesma imagem, o dobro de quadros)
  const go = () => {
    const snd = C.peer?.pc.getSenders().find((x) => x.track?.kind === 'video');
    if (snd) {
      C.peer.setMaxBitrate(snd, Math.round(QUALITY[C.quality].bps * (C.fps === 60 ? 1.35 : 1)), {
        // A rede pode limitar o fps, mas não deve trocar a resolução no meio da transmissão.
        degradationPreference: 'maintain-resolution',
        maxFramerate: C.fps,
      });
    }
  };
  go();
  setTimeout(go, 1500);
}

// ---------- ajustes de imagem (zoom, foco, exposição...) ----------
// applyConstraints é assíncrono e lento em alguns aparelhos: enquanto um ajuste está sendo aplicado, os próximos
// movimentos do controle se acumulam e só o último vai (o controle não "atrasa" atrás do dedo)
let ctlPending = null;
let ctlBusy = false;
function applyCtl(patch) {
  Object.assign(C.ctl, patch);
  ctlPending = { ...(ctlPending || {}), ...patch };
  if (!ctlBusy) runCtl();
}
async function runCtl() {
  ctlBusy = true;
  while (ctlPending && C.video) {
    const p = ctlPending;
    ctlPending = null;
    try {
      await C.video.applyConstraints({ advanced: [p] });
    } catch (e) {
      clog(`ctl ${Object.keys(p).join(',')} ${e.name}`);
    }
  }
  ctlBusy = false;
  pushCamStateSoon();
}
// depois de reabrir a câmera (trocou qualidade/fps), mantém o que o operador ajustou, se a câmera nova suportar
function reapplyCtl() {
  const caps = C.video?.getCapabilities?.() || {};
  const p = {};
  for (const [k, v] of Object.entries(C.ctl)) {
    const c = caps[k];
    if (Array.isArray(c) ? c.includes(v) : c && typeof c.max === 'number' && v >= c.min && v <= c.max) p[k] = v;
  }
  C.ctl = p;
  if (!Object.keys(p).length) return;
  ctlPending = { ...p };
  if (!ctlBusy) runCtl();
}

// O host manda só valores que a própria câmera declarou em getCapabilities(); nada arbitrário.
function acceptedCtl(raw = {}) {
  const caps = videoCaps();
  const out = {};
  for (const k of REMOTE_CTL) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (k === 'torch') {
      if (caps.torch === true && typeof v === 'boolean') out.torch = v;
      continue;
    }
    const c = caps[k];
    if (Array.isArray(c)) {
      if (typeof v === 'string' && c.includes(v)) out[k] = v;
    } else if (c && typeof c === 'object' && Number.isFinite(+v) && +v >= c.min && +v <= c.max) {
      out[k] = +v;
    }
  }
  return out;
}
function resetCtlPatch() {
  const caps = videoCaps();
  const p = {};
  if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) p.focusMode = 'continuous';
  if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) p.exposureMode = 'continuous';
  if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) p.whiteBalanceMode = 'continuous';
  if (caps.exposureCompensation) p.exposureCompensation = Math.max(caps.exposureCompensation.min, Math.min(caps.exposureCompensation.max, 0));
  if (caps.zoom) p.zoom = caps.zoom.min;
  if (caps.torch === true) p.torch = false;
  return p;
}
async function applyRemoteDevice(data = {}) {
  if (data.kind === 'audio') {
    await changeMic(String(data.deviceId || ''));
    pushCamStateSoon();
    return;
  }
  if (data.kind !== 'video') return;
  C.videoId = String(data.deviceId || '');
  savePrefs();
  try {
    await openVideo();
  } catch (e) {
    toast('Não deu para trocar de câmera: ' + (e.message || e.name), 'err');
  }
  pushCamStateSoon();
  renderControls();
  if (C.sheet) renderSheet();
}

function applyRemoteCamera(data = {}) {
  if (!C.video) return;
  if (data.reset) {
    C.ctl = {};
    C.torch = false;
    const p = resetCtlPatch();
    if (Object.keys(p).length) applyCtl(p);
    pushCamStateSoon();
    renderControls();
    if (C.sheet) renderSheet();
    return;
  }
  const p = acceptedCtl(data.patch || {});
  if (!Object.keys(p).length) {
    pushState();
    return;
  }
  if ('torch' in p) C.torch = !!p.torch;
  applyCtl(p);
  pushCamStateSoon();
  renderControls();
  if (C.sheet) renderSheet();
}

const hasRange = (caps, k) => !!caps[k] && typeof caps[k].max === 'number' && caps[k].max > caps[k].min;
const modesOf = (caps, k) => (Array.isArray(caps[k]) ? caps[k] : []);
const autoMode = (list) => (list.includes('continuous') ? 'continuous' : list.includes('single-shot') ? 'single-shot' : '');

// ---------- conexão com o estúdio ----------
// Resumo pequeno e serializável das capacidades: o host monta os sliders/selects a partir disto.
function videoCaps() {
  try { return C.video?.getCapabilities?.() || {}; } catch { return {}; }
}
function capsSnapshot() {
  const c = videoCaps();
  const out = {};
  for (const k of REMOTE_CTL) {
    const v = c[k];
    if (k === 'torch') {
      if (typeof v === 'boolean') out.torch = v;
    } else if (Array.isArray(v)) {
      out[k] = v.filter((x) => typeof x === 'string').slice(0, 12);
    } else if (v && typeof v === 'object' && Number.isFinite(v.min) && Number.isFinite(v.max) && v.max > v.min) {
      out[k] = { min: v.min, max: v.max, step: Number.isFinite(v.step) && v.step > 0 ? v.step : 0 };
    }
  }
  C.caps = out;
  return out;
}
function ctlSnapshot() {
  const out = {};
  for (const k of REMOTE_CTL) {
    const v = C.ctl[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string') out[k] = v;
  }
  if (C.torch) out.torch = true;
  return out;
}
let camStateTimer = 0;
function pushCamStateSoon() {
  clearTimeout(camStateTimer);
  camStateTimer = setTimeout(() => pushState(), 80);
}
const devList = (list, base) => list
  .filter((d, i, all) => d.deviceId && all.findIndex((x) => x.deviceId === d.deviceId) === i)
  .slice(0, 12)
  .map((d, i) => ({ id: d.deviceId, label: d.label || `${base} ${i + 1}` }));
const stateMsg = () => ({
  name: C.name,
  camOn: true,
  micOn: C.micOn,
  camStreamId: C.stream.id,
  screenStreamId: null,
  cam: true,
  camCaps: capsSnapshot(),
  camCtl: ctlSnapshot(),
  camVideoDevices: devList(C.devices.v || [], 'Câmera'),
  camAudioDevices: devList(C.devices.a || [], 'Microfone'),
  camVideoId: C.videoId || '',
  camAudioId: C.audioId || '',
});
function pushState() {
  if (sig?.joinMsg) sig.joinMsg = { ...sig.joinMsg, state: stateMsg() };
  sig?.send({ type: 'state', state: stateMsg() });
}

function camKey() {
  try {
    let k = localStorage.getItem('castdeck.camKey');
    if (!k) {
      k = 'cam-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('castdeck.camKey', k);
    }
    return k;
  } catch {
    return '';
  }
}

function connect() {
  sig = new Signaling();
  sig.on('welcome', (m) => {
    C.myId = m.id;
    if (m.hostId) ensurePeer(m.hostId);
    else status('wait', 'Aguardando o host abrir o estúdio…');
  });
  sig.on('host-online', (m) => ensurePeer(m.hostId));
  sig.on('host-offline', () => {
    C.peer?.close();
    C.peer = null;
    setTally({});
    status('wait', 'O host saiu. Aguardando retorno…');
  });
  sig.on('signal', (m) => {
    if (!C.peer || C.peer.id !== m.from) createPeer(m.from);
    C.peer.handle(m.data);
  });
  sig.on('control', (m) => {
    if (m.action === 'tally') setTally(m.data || {});
    else if (m.action === 'mute') setMic(false);
    else if (m.action === 'camera') applyRemoteCamera(m.data || {});
    else if (m.action === 'camera-device') applyRemoteDevice(m.data || {});
    else if (m.action === 'camera-info') {
      capsSnapshot();
      pushState();
    } else if (m.action === 'kick') {
      sig.close();
      C.peer?.close();
      C.stream.getTracks().forEach((t) => t.stop());
      fatal('Câmera removida', 'O host removeu esta câmera do estúdio.');
    } else if (m.action === 'reconnect') forceRejoin();
  });
  sig.on('error', (m) => toast(m.message, 'err'));
  sig.on('close', () => {
    C.peer?.close();
    C.peer = null;
    status('wait', 'Reconectando…');
  });
  sig.connect({ type: 'join', room: studioId, role: 'guest', name: C.name, state: stateMsg(), key: camKey() });
}

function ensurePeer(hostId) {
  const p = C.peer;
  if (p && p.id === hostId && !p.closed && p.pc.connectionState !== 'closed') return;
  createPeer(hostId);
}

function createPeer(hostId) {
  C.peer?.close();
  clog(`peer host=${hostId}`);
  const peer = new Peer({ id: hostId, polite: true, signal: (data) => sig.send({ type: 'signal', to: hostId, data }) });
  C.peer = peer;
  peer.addEventListener('track', (e) => {
    const { track, streams } = e.detail;
    if (track?.kind !== 'audio') return;
    const stream = streams?.[0] || new MediaStream([track]);
    if (!C.ifbAudio) {
      C.ifbAudio = new Audio();
      C.ifbAudio.autoplay = true;
      C.ifbAudio.playsInline = true;
      C.ifbAudio.volume = 0.85;
    }
    C.ifbAudio.srcObject = stream;
    C.ifbAudio.muted = !!C.ifb.muted;
    C.ifbAudio.play().catch(() => {});
  });
  for (const t of C.stream.getTracks()) peer.pc.addTrack(t, C.stream);
  peer.addEventListener('state', (e) => {
    clog(`state ${e.detail}`);
    if (e.detail === 'connected') {
      C.rejoins = 0;
      applyBitrate();
      status('ok', 'Conectada ao estúdio');
    } else if (e.detail === 'failed' || e.detail === 'disconnected') status('wait', 'Conexão instável, reconectando…');
  });
  peer.addEventListener('stuck', () => C.peer === peer && forceRejoin());
  peer.monitor((q) => {
    C.q = q;
    const el = $('#cam-q');
    if (!el) return;
    const [cls, label] = [['err', 'Rede ruim'], ['warn', 'Rede fraca'], ['ok', 'Boa'], ['ok', 'Ótima']][q.quality];
    el.className = `cam-q ${cls}`;
    el.textContent = `${label} · ${Math.round(q.sendKbps / 100) / 10} Mbps`;
  });
  status('wait', 'Conectando ao estúdio…');
  pushState();
}

// reentra na sala para o host montar um peer novo; tentativas seguidas esperam cada vez mais (evita loop)
function forceRejoin() {
  if (C.rejoining) return;
  C.rejoining = true;
  setTimeout(() => (C.rejoining = false), 3000);
  C.rejoins++;
  const delay = Math.min(30000, 1000 * 2 ** Math.min(C.rejoins, 5));
  status('wait', C.rejoins > 2 ? `Sem conexão com o estúdio. Nova tentativa em ${Math.round(delay / 1000)} s…` : 'Refazendo a conexão…');
  sig.nextDelay = delay;
  sig.ws?.close();
}

// ---------- interface ----------
function setTally(t) {
  C.tally = { pgm: !!t.pgm, pvw: !!t.pvw };
  const root = $('.cam-stage');
  if (!root) return;
  root.classList.toggle('tally-pgm', C.tally.pgm);
  root.classList.toggle('tally-pvw', !C.tally.pgm && C.tally.pvw);
  $('#cam-tally').textContent = C.tally.pgm ? '● NO AR' : C.tally.pvw ? 'PRÉVIA' : '';
  if (C.tally.pgm) navigator.vibrate?.(60);
}

function status(kind, text) {
  const el = $('#cam-status');
  if (!el) return;
  el.className = `cam-status ${kind}`;
  el.innerHTML = `<span class="dot"></span>${esc(text)}`;
}

function render() {
  app.innerHTML = `
    <section class="cam-stage">
      <video id="cam-video" autoplay playsinline muted></video>
      <div class="cam-zoom" id="cam-zoom" hidden></div>
      <div class="cam-top cam-ui">
        <div class="cam-title" translate="no"><strong>${esc(C.studio.name)}</strong><span id="cam-name">${esc(C.name)}</span></div>
        <div class="cam-top-r">
          <div id="cam-tally" class="cam-tally"></div>
          <button class="cam-ico" id="cam-set" title="Ajustes da imagem (zoom, foco, exposição)" aria-label="Ajustes da imagem">${icons.sliders}</button>
          <button class="cam-ico" id="cam-fs" title="Tela cheia" aria-label="Tela cheia">${icons.expand}</button>
        </div>
      </div>
      <div class="cam-info cam-ui">
        <div id="cam-status" class="cam-status wait"><span class="dot"></span>Abrindo a câmera…</div>
        <div id="cam-q" class="cam-q"></div>
      </div>
      <nav class="cam-bar cam-ui" id="cam-bar"></nav>
      <div class="cam-ifb" id="cam-ifb">
        <div class="cam-ifb-top"><span class="cam-ifb-led"></span><b>INTERCOM</b><button type="button" id="ci-listen" class="on">Ouvindo</button><button type="button" id="ci-lock" title="Travar o microfone aberto">Travar</button></div>
        <button type="button" id="ci-ptt">SEGURE PARA FALAR</button>
      </div>
      <div class="cam-sheet" id="cam-sheet" hidden role="dialog" aria-label="Ajustes da câmera">
        <div class="cam-sheet-head">
          <div class="cam-tabs" role="tablist">
            <button role="tab" data-sheet="ctl">${icons.sliders}<span>Imagem</span></button>
            <button role="tab" data-sheet="dev">${icons.cam}<span>Aparelhos</span></button>
          </div>
          <button class="cam-x" id="cam-sheet-x" title="Fechar" aria-label="Fechar">${icons.x}</button>
        </div>
        <div class="cam-sheet-body" id="cam-sheet-body"></div>
      </div>
    </section>`;
  const v = $('#cam-video');
  v.srcObject = C.stream;
  const stage = $('.cam-stage');
  $('#cam-fs').onclick = () => toggleFull(document.documentElement);
  $('#cam-set').onclick = () => openSheet(C.sheet === 'ctl' ? '' : 'ctl');
  $('#cam-sheet-x').onclick = () => openSheet('');
  $$('#cam-sheet [data-sheet]').forEach((b) => (b.onclick = () => openSheet(b.dataset.sheet)));
  onFullChange(() => {
    const on = isFull(document.documentElement);
    const b = $('#cam-fs');
    if (!b) return;
    b.innerHTML = on ? icons.shrink : icons.expand;
    b.title = on ? 'Sair da tela cheia' : 'Tela cheia';
    b.classList.toggle('on', on);
  });
  // um toque na imagem esconde/mostra os controles (enquadrar sem nada na frente); o tally continua aceso
  stage.addEventListener('click', (e) => {
    if (e.target !== v && e.target !== stage) return;
    if (performance.now() - pinch.endAt < 400) return;
    if (C.sheet) return openSheet('');
    stage.classList.toggle('ui-hidden');
  });
  bindPinch(stage, v);
  bindIntercom();
  renderControls();
}

function openSheet(kind) {
  C.sheet = kind;
  const sh = $('#cam-sheet');
  if (!sh) return;
  sh.hidden = !kind;
  $('.cam-stage')?.classList.toggle('sheet-open', !!kind);
  $('#cam-set')?.classList.toggle('on', kind === 'ctl');
  if (kind) {
    $('.cam-stage').classList.remove('ui-hidden');
    if (kind === 'dev') loadDevices().then(() => C.sheet === 'dev' && renderSheet());
    renderSheet();
  }
  renderControls();
}

function setupCameraMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Câmera — CastDeck',
      artist: C.studio?.name || 'CastDeck',
      album: 'Intercom de produção',
    });
    navigator.mediaSession.playbackState = C.ifbAudio && !C.ifb.muted ? 'playing' : 'paused';
    const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch {} };
    set('play', () => { C.ifb.muted = false; if (C.ifbAudio) { C.ifbAudio.muted = false; C.ifbAudio.play().catch(() => {}); } renderControls(); });
    set('pause', () => { C.ifb.muted = true; if (C.ifbAudio) C.ifbAudio.muted = true; renderControls(); });
  } catch {}
}

function bindIntercom() {
  const ptt = $('#ci-ptt');
  const listen = $('#ci-listen');
  const lock = $('#ci-lock');
  if (!ptt || !listen) return;
  const paintLock = () => {
    if (!lock) return;
    lock.classList.toggle('on', C.pttLatch);
    lock.textContent = C.pttLatch ? 'Travado' : 'Travar';
    lock.setAttribute('aria-pressed', String(C.pttLatch));
    if (C.ptt) ptt.textContent = C.pttLatch ? 'MIC ABERTO · CLIQUE PARA FECHAR' : 'FALANDO...';
    else ptt.textContent = C.pttLatch ? 'CLIQUE PARA ABRIR O MIC' : 'SEGURE PARA FALAR';
  };
  const off = () => {
    if (!C.ptt) return;
    C.ptt = false;
    ptt.classList.remove('on');
    paintLock();
    if (!C.pttPrevMic) setMic(false);
  };
  const on = async () => {
    if (C.ptt) return;
    C.ptt = true;
    C.pttPrevMic = C.micOn;
    ptt.classList.add('on');
    paintLock();
    await setMic(true);
    if (!C.ptt && !C.pttPrevMic) setMic(false);
  };
  const release = () => { if (C.pttLatch) return; off(); };
  listen.classList.toggle('on', !C.ifb.muted);
  listen.textContent = C.ifb.muted ? 'Ouvir' : 'Ouvindo';
  listen.onclick = () => {
    C.ifb.muted = !C.ifb.muted;
    if (C.ifbAudio) {
      C.ifbAudio.muted = C.ifb.muted;
      if (!C.ifb.muted) C.ifbAudio.play().catch(() => {});
    }
    listen.classList.toggle('on', !C.ifb.muted);
    listen.textContent = C.ifb.muted ? 'Ouvir' : 'Ouvindo';
    savePrefs();
  };
  if (lock) lock.onclick = () => {
    C.pttLatch = !C.pttLatch;
    if (!C.pttLatch) off();
    paintLock();
    savePrefs();
    if (navigator.wakeLock) keepAwake();
    if (C.pttLatch) toast(C.ptt ? 'Microfone travado aberto.' : 'PTT travado: toque no botão para abrir/fechar.');
  };
  ptt.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    try { ptt.setPointerCapture(e.pointerId); } catch {}
    if (C.pttLatch) {
      if (C.ptt) off();
      else on();
      return;
    }
    on();
  });
  setupCameraMediaSession();
  ptt.addEventListener('pointerup', release);
  ptt.addEventListener('pointercancel', release);
  ptt.addEventListener('lostpointercapture', release);
  paintLock();
}
window.addEventListener('blur', () => { const b = $('#ci-ptt'); if (b?.classList.contains('on') && !C.pttLatch) b.dispatchEvent(new Event('pointerup')); });

function renderControls() {
  const bar = $('#cam-bar');
  if (!bar) return;
  const torchOk = !!C.video?.getCapabilities?.().torch;
  const btn = (id, ico, label, on = false, extra = '') => `<button class="cam-btn ${on ? 'on' : ''}" id="${id}" ${extra}><span class="ico">${ico}</span><span>${label}</span></button>`;
  bar.innerHTML = [
    btn('cb-flip', icons.flip, C.videoId ? 'Trocar' : C.facing === 'environment' ? 'Traseira' : 'Frontal'),
    btn('cb-q', 'HD', `${C.quality}p${C.fps === 60 ? '60' : ''}`),
    btn('cb-mic', C.micOn ? icons.mic : icons.micOff, C.micOn ? 'Mic ligado' : 'Mic desligado', C.micOn),
    torchOk ? btn('cb-torch', '🔦', 'Lanterna', C.torch) : '',
    btn('cb-set', icons.settings, 'Ajustes', C.sheet === 'dev'),
  ].join('');
  $('#cb-flip').onclick = async () => {
    // o botão de virar sempre volta para a escolha automática (frontal/traseira), mesmo se havia uma câmera fixa
    C.facing = C.videoId ? C.facing : C.facing === 'environment' ? 'user' : 'environment';
    C.videoId = '';
    savePrefs();
    await openVideo().catch((e) => toast('Não deu para trocar de câmera: ' + (e.message || e.name), 'err'));
  };
  $('#cb-q').onclick = () => setQuality(C.quality === '1080' ? '720' : '1080');
  $('#cb-mic').onclick = () => setMic(!C.micOn);
  if (torchOk) $('#cb-torch').onclick = toggleTorch;
  $('#cb-set').onclick = () => openSheet(C.sheet === 'dev' ? '' : 'dev');
}

async function setQuality(q, fps = C.fps) {
  C.quality = q;
  C.fps = fps;
  savePrefs();
  await openVideo().catch((e) => toast('Qualidade indisponível: ' + (e.message || e.name), 'err'));
  const s = C.video?.getSettings?.() || {};
  toast(`${t('Enviando em')} ${s.height || C.quality}p · ${Math.round(s.frameRate || C.fps)} fps`);
}

// ---------- painel de ajustes (imagem / aparelhos) ----------
function renderSheet() {
  const body = $('#cam-sheet-body');
  if (!body) return;
  $$('#cam-sheet [data-sheet]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.sheet === C.sheet)));
  body.innerHTML = C.sheet === 'dev' ? devHTML() : ctlHTML();
  if (C.sheet === 'dev') bindDev(body);
  else bindCtl(body);
}

const fmtNum = (v, step) => {
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return (+v).toFixed(d).replace('.', ',');
};
function rangeHTML(k, label, cap, val, fmt) {
  const step = cap.step || (cap.max - cap.min) / 100;
  const v = typeof val === 'number' ? val : cap.min;
  return `<label class="cam-ctl"><span class="cam-ctl-l"><span>${label}</span><b id="cv-${k}">${fmt(v, step)}</b></span>
    <input type="range" data-k="${k}" min="${cap.min}" max="${cap.max}" step="${step}" value="${v}" aria-label="${esc(label)}"></label>`;
}
function segHTML(k, opts, cur) {
  return `<div class="cam-seg" data-mode="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}

function ctlHTML() {
  const caps = C.video?.getCapabilities?.() || {};
  const st = C.video?.getSettings?.() || {};
  const out = [];
  if (hasRange(caps, 'zoom')) {
    out.push(`<div class="cam-grp">${rangeHTML('zoom', 'Zoom', caps.zoom, st.zoom, (v) => `${fmtNum(v, 0.1)}×`)}${IS_MOBILE ? '<p class="cam-note">Dica: faça pinça com dois dedos na imagem.</p>' : ''}</div>`);
  }
  const fm = modesOf(caps, 'focusMode');
  if (fm.includes('manual') || hasRange(caps, 'focusDistance')) {
    const auto = autoMode(fm);
    const opts = [auto && [auto, 'Automático'], fm.includes('manual') && ['manual', 'Manual']].filter(Boolean);
    out.push(`<div class="cam-grp"><h3>Foco</h3>${opts.length > 1 ? segHTML('focusMode', opts, st.focusMode === 'manual' ? 'manual' : auto) : ''}
      ${hasRange(caps, 'focusDistance') ? rangeHTML('focusDistance', 'Distância do foco', caps.focusDistance, st.focusDistance, fmtNum) : ''}</div>`);
  }
  const em = modesOf(caps, 'exposureMode');
  if (hasRange(caps, 'exposureCompensation') || hasRange(caps, 'exposureTime')) {
    out.push(`<div class="cam-grp"><h3>Exposição</h3>
      ${hasRange(caps, 'exposureCompensation') ? rangeHTML('exposureCompensation', 'Compensação', caps.exposureCompensation, st.exposureCompensation, (v, s) => `${v > 0 ? '+' : ''}${fmtNum(v, s)} EV`) : ''}
      ${hasRange(caps, 'exposureTime') && em.includes('manual') ? rangeHTML('exposureTime', 'Obturador (manual)', caps.exposureTime, st.exposureTime, (v) => `${Math.round(v)}`) : ''}</div>`);
  }
  const wb = modesOf(caps, 'whiteBalanceMode');
  if (hasRange(caps, 'colorTemperature') || wb.includes('manual')) {
    const auto = autoMode(wb);
    const opts = [auto && [auto, 'Automático'], wb.includes('manual') && ['manual', 'Manual']].filter(Boolean);
    out.push(`<div class="cam-grp"><h3>Balanço de branco</h3>${opts.length > 1 ? segHTML('whiteBalanceMode', opts, st.whiteBalanceMode === 'manual' ? 'manual' : auto) : ''}
      ${hasRange(caps, 'colorTemperature') ? rangeHTML('colorTemperature', 'Temperatura', caps.colorTemperature, st.colorTemperature, (v) => `${Math.round(v)} K`) : ''}</div>`);
  }
  const pic = PICTURE.filter(([k]) => hasRange(caps, k));
  if (pic.length) out.push(`<div class="cam-grp"><h3>Imagem</h3>${pic.map(([k, l]) => rangeHTML(k, l, caps[k], st[k], fmtNum)).join('')}</div>`);
  if (caps.torch) out.push(`<div class="cam-grp"><button class="cam-row-btn ${C.torch ? 'on' : ''}" id="cs-torch">🔦 <span>Lanterna</span><i>${C.torch ? 'Ligada' : 'Desligada'}</i></button></div>`);
  if (!out.length) {
    return `<div class="cam-empty">${icons.sliders}<p><strong>Sem ajustes manuais nesta câmera</strong></p>
      <p class="cam-note">O navegador deste aparelho não libera zoom, foco nem exposição. No Android use o Chrome atualizado; no iPhone o Safari ainda não permite esses controles.</p></div>`;
  }
  out.push(`<button class="btn cam-reset" id="cs-reset">Restaurar automático</button>`);
  return out.join('');
}

function bindCtl(body) {
  $$('input[type="range"][data-k]', body).forEach((inp) => {
    inp.oninput = () => {
      const k = inp.dataset.k;
      const v = +inp.value;
      const patch = { [k]: v };
      // mexer na distância/temperatura/obturador só tem efeito no modo manual: troca o modo junto
      if (k === 'focusDistance') patch.focusMode = 'manual';
      if (k === 'colorTemperature') patch.whiteBalanceMode = 'manual';
      if (k === 'exposureTime') patch.exposureMode = 'manual';
      applyCtl(patch);
      const step = +inp.step || 1;
      const b = $(`#cv-${k}`);
      if (b) b.textContent = k === 'zoom' ? `${fmtNum(v, 0.1)}×` : k === 'colorTemperature' ? `${Math.round(v)} K` : k === 'exposureCompensation' ? `${v > 0 ? '+' : ''}${fmtNum(v, step)} EV` : k === 'exposureTime' ? `${Math.round(v)}` : fmtNum(v, step);
      for (const m of ['focusMode', 'whiteBalanceMode']) if (patch[m]) $$(`[data-mode="${m}"] button`, body).forEach((x) => x.classList.toggle('on', x.dataset.v === 'manual'));
    };
  });
  $$('.cam-seg[data-mode] button', body).forEach((b) => {
    b.onclick = () => {
      const k = b.closest('[data-mode]').dataset.mode;
      applyCtl({ [k]: b.dataset.v });
      $$('button', b.parentElement).forEach((x) => x.classList.toggle('on', x === b));
    };
  });
  const torch = $('#cs-torch', body);
  if (torch) torch.onclick = toggleTorch;
  const reset = $('#cs-reset', body);
  // reabrir a câmera devolve tudo ao padrão do aparelho (inclusive ajustes que não dá para "desfazer" por valor)
  if (reset)
    reset.onclick = async () => {
      C.ctl = {};
      ctlPending = null;
      await openVideo().catch(() => {});
      toast(t('Câmera de volta ao automático'));
    };
}

function devHTML() {
  const { v, a } = C.devices;
  const s = C.video?.getSettings?.() || {};
  const opt = (d, i, cur, base) => `<option value="${esc(d.deviceId)}" ${d.deviceId === cur ? 'selected' : ''}>${esc(d.label || `${base} ${i + 1}`)}</option>`;
  const auto = C.facing === 'environment' ? 'Automática: traseira' : 'Automática: frontal';
  return `
    <div class="cam-grp"><h3>Câmera</h3>
      <select class="input" id="cd-video" aria-label="Câmera"><option value="">${auto}</option>${v.map((d, i) => opt(d, i, C.videoId, 'Câmera')).join('')}</select>
    </div>
    <div class="cam-grp"><h3>Microfone</h3>
      <select class="input" id="cd-audio" aria-label="Microfone"><option value="">Padrão do aparelho</option>${a.map((d, i) => opt(d, i, C.audioId, 'Microfone')).join('')}</select>
      <p class="cam-note">O som só vai para o estúdio com o Mic ligado na barra.</p>
    </div>
    <div class="cam-grp"><h3>Qualidade</h3>
      ${segHTML('q', [['720', '720p'], ['1080', '1080p']], C.quality)}
      <h3>Quadros por segundo</h3>
      ${segHTML('fps', FPS.map((f) => [String(f), `${f} fps`]), String(C.fps))}
      <p class="cam-note" id="cd-info">${s.width ? `${t('Enviando')} ${s.width}×${s.height} · ${Math.round(s.frameRate || C.fps)} fps` : ''}</p>
    </div>
    <div class="cam-grp"><h3>Nome no estúdio</h3>
      <div class="cam-name-row"><input class="input" id="cd-name" maxlength="40" value="${esc(C.name)}" aria-label="Nome no estúdio"><button class="btn" id="cd-name-ok">Salvar</button></div>
    </div>`;
}

function bindDev(body) {
  $('#cd-video', body).onchange = async (e) => {
    C.videoId = e.target.value;
    savePrefs();
    await openVideo().catch((err) => toast('Não deu para trocar de câmera: ' + (err.message || err.name), 'err'));
  };
  $('#cd-audio', body).onchange = (e) => changeMic(e.target.value);
  $$('[data-mode="q"] button', body).forEach((b) => (b.onclick = () => setQuality(b.dataset.v)));
  $$('[data-mode="fps"] button', body).forEach((b) => (b.onclick = () => setQuality(C.quality, +b.dataset.v)));
  const saveName = () => {
    const n = $('#cd-name', body).value.trim();
    if (!n) return;
    C.name = n.slice(0, 40);
    savePrefs();
    $('#cam-name').textContent = C.name;
    pushState();
    toast(t('Nome salvo'));
  };
  $('#cd-name', body).onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveName();
    }
  };
}

// ---------- pinça para zoom ----------
const pinch = { pts: new Map(), start: null, endAt: 0, hideT: 0 };
function bindPinch(stage, v) {
  const dist = () => {
    const [a, b] = [...pinch.pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };
  const badge = (z) => {
    const el = $('#cam-zoom');
    if (!el) return;
    el.textContent = `${fmtNum(z, 0.1)}×`;
    el.hidden = false;
    clearTimeout(pinch.hideT);
    pinch.hideT = setTimeout(() => (el.hidden = true), 900);
  };
  v.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    pinch.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const caps = C.video?.getCapabilities?.() || {};
    if (pinch.pts.size === 2 && hasRange(caps, 'zoom')) pinch.start = { d: dist(), z: C.video.getSettings().zoom ?? caps.zoom.min, caps: caps.zoom };
  });
  v.addEventListener('pointermove', (e) => {
    if (!pinch.pts.has(e.pointerId)) return;
    pinch.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!pinch.start || pinch.pts.size !== 2) return;
    const { d, z, caps } = pinch.start;
    const step = caps.step || 0.1;
    const nz = Math.min(caps.max, Math.max(caps.min, Math.round((z * dist()) / d / step) * step));
    if (nz !== C.ctl.zoom) applyCtl({ zoom: nz });
    badge(nz);
  });
  const up = (e) => {
    pinch.pts.delete(e.pointerId);
    if (pinch.start && pinch.pts.size < 2) {
      pinch.start = null;
      pinch.endAt = performance.now();
      if (C.sheet === 'ctl') renderSheet();
    }
  };
  v.addEventListener('pointerup', up);
  v.addEventListener('pointercancel', up);
}
