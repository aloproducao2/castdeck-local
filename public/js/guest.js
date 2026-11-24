// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Página do convidado: entra pelo link, envia câmera/mic/tela ao host e assiste ao programa.
import { $, $$, h, esc, icons, toast, modal, initials } from './ui.js';
import { Signaling, Peer, loadIce } from './rtc.js';
import { lobby, getScreen, getTab, cursorOn, cursorSupported, setCursor, getCamera, getMic, listDevices, loadPrefs, savePrefs } from './media.js';
import { toggleFull, isFull, onFullChange } from './fullscreen.js';

const studioId = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
// Ao sair da chamada o convidado é levado ao site (o host não fica "preso" numa call morta).
const LEAVE_URL = 'https://cast.flue.live';
let leaveTimer = 0;
const app = $('#app');

const G = {
  studio: null,
  myId: null,
  hostId: null,
  peer: null,
  local: null, // MediaStream (cam + mic)
  cam: null,
  mic: null,
  screen: null,
  screenSenders: [],
  camOn: true,
  micOn: true,
  name: '',
  studioState: { live: false, onStage: [] },
  devices: { cams: [], mics: [] },
  ctl: {},
  chat: [],
  log: [], // diagnóstico: histórico de eventos da conexão
};
window.__guest = G;
const REMOTE_CTL = [
  'pan', 'tilt', 'zoom', 'focusMode', 'focusDistance', 'exposureMode', 'exposureCompensation', 'exposureTime', 'iso',
  'whiteBalanceMode', 'colorTemperature', 'brightness', 'contrast', 'saturation', 'sharpness', 'torch',
];
const devList = (list = [], base = 'Dispositivo') => list
  .filter((d, i, all) => d?.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications' && all.findIndex((x) => x.deviceId === d.deviceId) === i)
  .slice(0, 12)
  .map((d, i) => ({ id: d.deviceId, label: d.label || `${base} ${i + 1}` }));
const glog = (m) => G.log.push(`${(performance.now() / 1000).toFixed(1)}s ${m}`);
// Recursos por dispositivo: compartilhar tela/aba não existe em navegadores móveis; vídeo local exige captureStream.
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const CAN = {
  screen: !IS_MOBILE && !!navigator.mediaDevices?.getDisplayMedia,
  file: !IS_MOBILE && !!(HTMLVideoElement.prototype.captureStream || HTMLVideoElement.prototype.mozCaptureStream),
};
let sig;
// iOS: um AudioContext aberto junto com a captura pode trocar a saída de som para o fone de ouvido do aparelho; lá não medimos o mic
const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;
const ICO = {
  star: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  dev: svg('<path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  solo: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" fill="currentColor"/>'),
  image: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>'),
  check: svg('<path d="M5 12l5 5 9-10"/>'),
};

// Celular/tablet: impede que a tela apague durante a chamada (apagar derruba câmera e microfone)
let wake = null;
let awakeWanted = false;
async function keepAwake() {
  awakeWanted = true;
  try {
    wake = (await navigator.wakeLock?.request('screen')) || null;
  } catch {}
}
function releaseAwake() {
  awakeWanted = false;
  wake?.release().catch(() => {});
  wake = null;
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && awakeWanted && keepAwake());

boot();

async function boot() {
  // feedback imediato enquanto o estúdio é consultado (em conexão móvel isso pode levar alguns segundos)
  app.innerHTML = `<div class="lobby"><div class="card modal" style="text-align:center"><div class="spin" style="margin:0 auto 14px"></div><h3>Conectando ao estúdio…</h3><p class="sub" style="margin:6px 0 0">Só um instante.</p></div></div>`;
  try {
    const r = await fetch(`/api/public/studios/${encodeURIComponent(studioId)}`);
    if (!r.ok) throw new Error('Estúdio não encontrado. Confira o link.');
    G.studio = await r.json();
  } catch (e) {
    app.innerHTML = `<div class="lobby"><div class="card modal"><h3>Ops!</h3><p class="sub">${esc(e.message)}</p></div></div>`;
    return;
  }
  if (G.studio.color) document.documentElement.style.setProperty('--accent', G.studio.color);
  const iceReady = loadIce(); // carrega em paralelo com o lobby (não atrasa a câmera)
  document.title = `${G.studio.name} — Entrar como convidado`;
  if (!window.isSecureContext) {
    app.innerHTML = `<div class="lobby"><div class="card modal"><h3>Conexão não segura</h3><p class="sub">Abra o link com <b>https://</b> para liberar câmera e microfone.</p></div></div>`;
    return;
  }
  const res = await lobby({
    mount: app,
    title: `Entrar em “${G.studio.name}”`,
    subtitle: 'Você entrará no backstage. O host decide quando você aparece ao vivo.',
    cta: 'Entrar no estúdio',
  });
  await iceReady;
  // O convidado precisa da câmera/microfone: se ainda estiverem abrindo no lobby, espera a promessa
  // (é aqui que a permissão do navegador é concedida).
  let cam = res.camStream;
  let mic = res.micStream;
  if ((!cam || !mic) && res.media) {
    try {
      const m = await res.media;
      cam = cam || m?.camStream || null;
      mic = mic || m?.micStream || null;
    } catch {}
  }
  Object.assign(G, { cam, mic, camOn: res.camOn, micOn: res.micOn, name: res.name });
  G.local = new MediaStream([...(G.cam?.getVideoTracks() || []), ...(G.mic?.getAudioTracks() || [])]);
  G.cam?.getVideoTracks().forEach((t) => (t.enabled = G.camOn));
  G.mic?.getAudioTracks().forEach((t) => (t.enabled = G.micOn));
  G.devices = await listDevices().catch(() => ({ cams: [], mics: [] }));
  keepAwake();
  build();
  connect();
  navigator.mediaDevices?.addEventListener?.('devicechange', async () => {
    G.devices = await listDevices().catch(() => G.devices);
    G.updateSelfFlipVisibility?.();
    if (sig && !sig.closedByUser) pushState();
  });
}

function build() {
  app.innerHTML = `
  <div class="guest">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">${icons.logo}</span><span class="brand-txt">CastDeck <small>Local</small></span></div>
      <i class="topbar-sep" aria-hidden="true"></i>
      <div class="title">${esc(G.studio.name)}</div>
      <span class="g-role" id="g-role" hidden title="Você pode editar a live em tempo real">${ICO.star}<span>Co-host</span></span>
      <div class="spacer"></div>
      <span id="g-quality"></span>
      <span id="g-live"></span>
    </header>
    <section class="main">
      <div class="status-banner g-status" id="g-status"><i class="g-dot"></i><span class="g-st-txt"><b id="g-status-t">Conectando…</b><span id="g-status-s"></span></span></div>
      <div class="program">
        <span class="g-ar-badge">16:9</span>
        <span class="g-pgm-tally" id="g-pgm-tally" hidden>● VOCÊ (NO AR)</span>
        <video id="g-program" autoplay playsinline></video>
        <div class="waiting" id="g-wait"><div><div class="spin"></div><div id="g-wait-text">Aguardando o host abrir o estúdio…</div></div></div>
      </div>
      <div class="selfview" id="g-selfview">
        <video id="g-self" autoplay playsinline muted></video>
        <button class="self-toggle self-flip" id="g-self-flip" type="button" title="Virar / trocar câmera" hidden>${icons.flip}</button>
        <button class="self-toggle" id="g-self-toggle" title="Minimizar sua câmera">${icons.down}</button>
        <div class="self-off" id="g-self-off" hidden><span>${esc(initials(G.name))}</span></div>
        <div class="self-tag"><i id="g-self-mic" title="Microfone desligado"></i><span>${esc(G.name || 'Você')}</span></div>
      </div>
    </section>
    <footer class="bottombar">
      <button class="ctrl" id="g-full" title="Ver o programa em tela cheia"><span class="ctrl-ico">⛶</span><span>Tela cheia</span></button>
      <button class="ctrl" id="g-mic"><span class="ctrl-ico"></span><span>Microfone</span></button>
      <button class="ctrl" id="g-cam"><span class="ctrl-ico"></span><span>Câmera</span></button>
      <button class="ctrl" id="g-flip" title="Virar / trocar câmera" hidden><span class="ctrl-ico">${icons.flip}</span><span>Virar</span></button>
      <button class="ctrl" id="g-share" title="Compartilhar tela, aba ou vídeo com o host" aria-haspopup="menu"><span class="ctrl-ico">${icons.screen}</span><span>Compartilhar</span></button>
      <button class="ctrl" id="g-dev" title="Trocar câmera ou microfone"><span class="ctrl-ico">${ICO.dev}</span><span>Dispositivos</span></button>
      <button class="ctrl" id="g-chat"><span class="ctrl-ico">${icons.chat}</span><span>Chat</span></button>
      <button class="ctrl" id="g-prod" hidden title="Painel de co-host"><span class="ctrl-ico">${ICO.star}</span><span>Produção</span></button>
      <i class="ctrl-sep"></i>
      <button class="ctrl danger" id="g-leave"><span class="ctrl-ico">${icons.leave}</span><span>Sair</span></button>
    </footer>
    <div class="pop-menu" id="g-share-menu" role="menu" hidden>
      <button class="pop-item" id="g-screen" role="menuitem">${icons.screen}<span><b>Tela ou janela</b><small>Ideal para slides e apresentações</small></span></button>
      <button class="pop-item" id="g-tab" role="menuitem" title="Compartilhar uma aba do navegador com áudio">${icons.tab}<span><b>Aba do navegador</b><small>Leva junto o áudio da aba</small></span></button>
      <button class="pop-item" id="g-video" role="menuitem" title="Tocar um vídeo do seu computador para o host">${icons.film}<span><b>Vídeo do computador</b><small>Toca um arquivo para o host</small></span></button>
      <i class="pop-sep" id="g-cursor-sep"></i>
      <button class="pop-item toggle" id="g-cursor" role="menuitemcheckbox" title="Mostrar/ocultar o cursor do mouse ao compartilhar tela ou aba">${icons.cursor}<span><b>Mostrar o cursor</b><small>Ao compartilhar tela ou aba</small></span><i class="pop-check">${ICO.check}</i></button>
    </div>
    <input type="file" id="g-file" class="file-input-offscreen" accept="video/*,audio/*">
    <aside class="side">
      <nav class="tabs"><button class="tab active" id="tab-chat">${icons.chat}<span>Chat</span></button><button class="tab" id="tab-prod" hidden>${ICO.star}<span>Produção</span></button><button class="tab sheet-close" id="g-chat-close" style="flex:none;width:44px" title="Fechar">✕</button></nav>
      <div class="panel active" id="panel-chat">
        <div class="chat">
          <div class="chat-log" id="chat-log"><div class="empty">Converse com o host e outros convidados. O chat não vai ao ar.</div></div>
          <form class="chat-form" id="chat-form"><input class="input" id="chat-input" placeholder="Mensagem…" maxlength="500" autocomplete="off"><button class="btn primary icon" title="Enviar">${icons.up}</button></form>
        </div>
      </div>
      <div class="panel" id="panel-prod">
        <div id="prod-live">
          <div id="cp-head"></div>
          <section class="cp-sec" hidden>
            <div class="cp-title">Cena<small>Layout do programa</small></div>
            <div class="cp-layouts" id="cp-layouts"></div>
          </section>
          <section class="cp-sec" hidden>
            <div class="cp-title">Fontes<small id="cp-count"></small></div>
            <div class="cp-list" id="cp-sources"></div>
          </section>
          <section class="cp-sec" hidden>
            <div class="cp-title">Banners<small>Texto sobre o programa</small></div>
            <div class="cp-quick">
              <input class="input" id="qb-title" placeholder="Título do banner rápido" maxlength="90" autocomplete="off">
              <input class="input" id="qb-sub" placeholder="Subtítulo (opcional)" maxlength="120" autocomplete="off">
              <div class="cp-quick-acts"><button class="btn primary sm" id="qb-send">Enviar ao ar</button><button class="btn sm" id="qb-clear">Ocultar banner</button></div>
            </div>
            <div class="cp-list" id="cp-banners"></div>
          </section>
          <section class="cp-sec" hidden>
            <div class="cp-title">Mensagens<small>Mande para o ar ou retire</small></div>
            <div class="cp-list" id="cp-messages"></div>
          </section>
        </div>
      </div>
    </aside>
  </div>`;
  const svEl = $('#g-self');
  svEl.srcObject = G.cam || G.local;
  const sv = $('#g-selfview');
  const flipSelfBtn = $('#g-self-flip');
  const flipBarBtn = $('#g-flip');
  const updateSelfFlipVisibility = () => {
    const show = IS_MOBILE || (G.devices?.cams?.length || 0) >= 2;
    if (flipSelfBtn) flipSelfBtn.hidden = !show;
    if (flipBarBtn) flipBarBtn.hidden = !show;
  };
  G.updateSelfFlipVisibility = updateSelfFlipVisibility;
  updateSelfFlipVisibility();
  const handleFlipClick = async (e) => {
    e?.stopPropagation?.();
    if (flipSelfBtn?.disabled || flipBarBtn?.disabled) return;
    for (const b of [flipSelfBtn, flipBarBtn]) {
      if (!b) continue;
      b.disabled = true;
      b.classList.add('is-flipping');
    }
    try {
      await switchGuestCamera('', { flip: true });
      toast('Câmera trocada.', 'ok');
    } catch (ex) {
      toast('Não foi possível trocar de câmera: ' + (ex.message || ex.name), 'err');
    } finally {
      for (const b of [flipSelfBtn, flipBarBtn]) {
        if (!b) continue;
        b.disabled = false;
        b.classList.remove('is-flipping');
      }
    }
  };
  if (flipSelfBtn) flipSelfBtn.onclick = handleFlipClick;
  if (flipBarBtn) flipBarBtn.onclick = handleFlipClick;
  const toggleBtn = $('#g-self-toggle');
  if (toggleBtn && sv) {
    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      const min = !sv.classList.contains('minimized');
      sv.classList.toggle('minimized', min);
      toggleBtn.title = min ? 'Expandir sua câmera' : 'Minimizar sua câmera';
      toggleBtn.innerHTML = min ? icons.up : icons.down;
    };
    sv.onclick = () => {
      if (sv.classList.contains('minimized')) {
        sv.classList.remove('minimized');
        toggleBtn.title = 'Minimizar sua câmera';
        toggleBtn.innerHTML = icons.down;
      }
    };
  }
  $('#g-dev').onclick = openDevices;
  // celulares/tablets não compartilham tela nem aba (e muitos não transmitem vídeo local): esconde o que não funciona
  if (!CAN.screen) ['#g-screen', '#g-tab', '#g-cursor', '#g-cursor-sep'].forEach((s) => ($(s).hidden = true));
  if (!CAN.file) $('#g-video').hidden = true;
  if (!CAN.screen && !CAN.file) $('#g-share').hidden = true;
  const side = $('.side');
  $('#g-chat').onclick = () => {
    if (side.classList.contains('open') && G.panel === 'chat') return closeSide();
    openSide('chat');
  };
  $('#g-chat-close').onclick = closeSide;
  initProd();
  $('#g-mic').onclick = () => setMic(!G.micOn);
  $('#g-cam').onclick = () => setCam(!G.camOn);
  $('#g-full')?.addEventListener('click', async () => {
    const root = $('.guest');
    if (!root) return;
    try {
      await toggleFull(root);
    } catch {
      toast('Este navegador não liberou a tela cheia; gire o aparelho para ampliar.');
    }
  });
  const paintFs = () => {
    const btn = $('#g-full');
    if (!btn) return;
    const on = isFull($('.guest'));
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('span:last-child').textContent = on ? 'Sair' : 'Tela cheia';
  };
  onFullChange(paintFs);
  paintFs();
  // um botão só para compartilhar: abre o menu (tela/aba/vídeo) ou, se já estiver compartilhando, para
  $('#g-share').onclick = () => (G.screen ? stopScreen() : toggleShareMenu());
  $('#g-screen').onclick = () => (toggleShareMenu(false), startScreen('screen'));
  $('#g-tab').onclick = () => (toggleShareMenu(false), startScreen('tab'));
  $('#g-video').onclick = () => (toggleShareMenu(false), $('#g-file').click());
  $('#g-cursor').onclick = async () => {
    if (!cursorSupported()) {
      toast('Este navegador não permite esconder o cursor na captura de tela. Compartilhe uma aba/janela ou capture pelo OBS.', 'info');
      return;
    }
    const on = !cursorOn();
    const live = await setCursor(on, G.screenMode === 'file' ? null : G.screen);
    renderControls();
    toast(on ? 'Cursor do mouse visível' : 'Cursor do mouse oculto');
    if (!live) toast('Para aplicar nesta captura, pare e compartilhe novamente.');
  };
  $('#g-file').onchange = (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) startScreen('file', f);
  };
  document.addEventListener('pointerdown', (e) => {
    const m = $('#g-share-menu');
    if (m && !m.hidden && !e.target.closest('#g-share-menu, #g-share')) toggleShareMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleShareMenu(false);
  });
  addEventListener('resize', () => {
    toggleShareMenu(false);
    syncSideBtns();
  });
  $('#g-leave').onclick = async () => {
    if (!(await ask({ title: 'Sair do estúdio?', text: 'Sua câmera e seu microfone serão desligados.', ok: 'Sair', danger: true }))) return;
    leave('Você saiu do estúdio.');
  };
  $('#chat-form').onsubmit = (e) => {
    e.preventDefault();
    const inp = $('#chat-input');
    const text = inp.value.trim();
    if (!text) return;
    sig.send({ type: 'chat', text });
    inp.value = '';
  };
  G.panel = 'chat';
  renderControls();
  renderStatus();
  startMeter();
}

// Menu "Compartilhar": fica fora da barra (position: fixed) porque a barra rola na horizontal e cortaria o menu
function toggleShareMenu(force) {
  const m = $('#g-share-menu');
  const btn = $('#g-share');
  if (!m || !btn) return;
  const open = force ?? m.hidden;
  m.hidden = !open;
  btn.classList.toggle('open', open);
  if (!open) return;
  const r = btn.getBoundingClientRect();
  const w = m.offsetWidth;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
  m.style.bottom = innerHeight - r.top + 8 + 'px';
}

// Confirmação no estilo do app (o confirm() nativo trava a página e some atrás do vídeo em tela cheia)
function ask({ title, text = '', ok, cancel = 'Cancelar', danger = false }) {
  return modal(
    `<h3>${esc(title)}</h3>${text ? `<p class="sub">${esc(text)}</p>` : ''}<div class="modal-actions"><button class="btn" data-close>${esc(cancel)}</button><button class="btn ${danger ? 'live' : 'primary'}" id="ask-ok">${esc(ok)}</button></div>`,
    {
      onMount: (el, close) => {
        const b = $('#ask-ok', el);
        b.onclick = () => close(true);
        b.focus();
      },
    },
  ).then((v) => v === true);
}

// Medidor do microfone: anel no botão ("estão me ouvindo") e aviso quando a pessoa fala com o mic desligado.
// Mede um clone da trilha, que continua ativo mesmo com o microfone mutado (a trilha enviada fica desligada).
let meter = null;
function startMeter() {
  stopMeter();
  const track = G.mic?.getAudioTracks()[0];
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!track || !AC || IS_IOS) return;
  try {
    const ctx = new AC();
    const probe = track.clone();
    probe.enabled = true;
    const node = ctx.createMediaStreamSource(new MediaStream([probe]));
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    node.connect(an);
    const buf = new Uint8Array(an.fftSize);
    let loud = 0;
    let lastWarn = 0;
    const iv = setInterval(() => {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const lvl = Math.min(1, Math.sqrt(sum / buf.length) * 6);
      $('#g-mic .ctrl-ico')?.style.setProperty('--lvl', G.micOn ? lvl.toFixed(2) : '0');
      $('#g-selfview')?.classList.toggle('talking', G.micOn && lvl > 0.22);
      // ~0,6 s de voz com o mic desligado: avisa, no máximo a cada 20 s
      if (!G.micOn && lvl > 0.28) loud++;
      else loud = Math.max(0, loud - 1);
      if (loud >= 6 && Date.now() - lastWarn > 20000) {
        lastWarn = Date.now();
        loud = 0;
        toast('Você está falando com o microfone desligado.');
        const b = $('#g-mic');
        b?.classList.add('attn');
        setTimeout(() => b?.classList.remove('attn'), 2800);
      }
    }, 100);
    meter = { ctx, probe, node, iv };
  } catch {
    meter = null;
  }
}
function stopMeter() {
  if (!meter) return;
  clearInterval(meter.iv);
  try {
    meter.node.disconnect();
  } catch {}
  meter.probe.stop();
  meter.ctx.close?.().catch(() => {});
  meter = null;
}

// Troca de câmera/microfone durante a chamada: substitui a trilha no sender (sem renegociar) e mantém o mesmo MediaStream.
async function swapTrack(kind, newTrack) {
  const screenTracks = new Set(G.screen?.getTracks() || []);
  const stream = kind === 'video' ? G.cam : G.mic;
  const old =
    stream?.getTracks().find((t) => t.kind === kind) ||
    G.local?.getTracks().find((t) => t.kind === kind && !screenTracks.has(t));
  const tracked = kind === 'video' ? G.camSender : G.micSender;
  const sender = G.peer?.pc
    .getSenders()
    .find((s) => s === tracked || (old && s.track === old) || (s.track?.kind === kind && !screenTracks.has(s.track)));
  for (const lt of G.local?.getTracks().filter((t) => t.kind === kind && !screenTracks.has(t)) || []) {
    if (lt !== newTrack) G.local.removeTrack(lt);
  }
  if (!G.local.getTracks().includes(newTrack)) G.local.addTrack(newTrack);
  if (sender) {
    await sender.replaceTrack(newTrack);
    if (kind === 'video') G.camSender = sender;
    else G.micSender = sender;
  } else if (G.peer) {
    const ns = G.peer.pc.addTrack(newTrack, G.local);
    if (kind === 'video') G.camSender = ns;
    else G.micSender = ns;
  }
  if (old && old !== newTrack) old.stop();
  if (kind === 'video') {
    newTrack.contentHint = 'motion';
    newTrack.enabled = G.camOn;
    G.cam = new MediaStream([newTrack]);
    G.ctl = {};
    const sv = $('#g-self');
    if (sv) {
      sv.srcObject = G.cam;
      sv.play?.().catch(() => {});
    }
  } else {
    newTrack.enabled = G.micOn;
    G.mic = new MediaStream([newTrack]);
    startMeter(); // o medidor acompanha o microfone novo
  }
  pushState();
}

let camSwitchSeq = 0;
async function switchGuestCamera(targetDeviceId, { flip = false } = {}) {
  const seq = ++camSwitchSeq;
  const prevTrack = G.cam?.getVideoTracks()[0];
  const prevSettings = prevTrack?.getSettings?.() || {};
  const prevId = prevSettings.deviceId || loadPrefs().camId || '';
  const prevFacing = prevSettings.facingMode || (IS_MOBILE ? 'user' : '');
  const quality = loadPrefs().quality || '720';
  let desiredId = targetDeviceId ? String(targetDeviceId) : '';

  try {
    let s = null;
    if (flip) {
      const d = await listDevices().catch(() => G.devices);
      G.devices = d || G.devices;
      const cams = d?.cams || [];
      const idx = prevId ? cams.findIndex((c) => c.deviceId === prevId) : -1;
      const nextInList = cams.length >= 2 ? cams[(idx + 1) % cams.length]?.deviceId || '' : '';
      if (IS_MOBILE) {
        const nextFacing = prevFacing === 'environment' ? 'user' : 'environment';
        prevTrack?.stop();
        try {
          s = await getCamera(undefined, quality, { facingMode: nextFacing });
        } catch {}
        const gotId = s?.getVideoTracks?.()[0]?.getSettings?.().deviceId || '';
        if ((!s || (prevId && gotId === prevId)) && nextInList && nextInList !== prevId) {
          s?.getTracks?.().forEach((t) => t.stop());
          desiredId = nextInList;
          s = await getCamera(desiredId, quality, { strict: true });
        }
        if (!s) throw new Error('Nenhuma outra câmera disponível');
      } else if (nextInList) {
        desiredId = nextInList;
      }
    }

    if (!s) {
      // libera a câmera atual antes (celulares e muitos drivers USB recusam abrir duas ao mesmo tempo)
      prevTrack?.stop();
      s = await getCamera(desiredId || undefined, quality, { strict: !!desiredId });
    }

    if (seq !== camSwitchSeq) {
      s.getTracks().forEach((t) => t.stop());
      return '';
    }
    const track = s.getVideoTracks()[0];
    if (!track) throw new Error('Câmera sem trilha de vídeo');
    await swapTrack('video', track);
    const actualId = track.getSettings?.().deviceId || desiredId || '';
    savePrefs({ camId: actualId });
    G.devices = await listDevices().catch(() => G.devices);
    G.updateSelfFlipVisibility?.();
    pushState();
    glog('camera trocada');
    return actualId;
  } catch (err) {
    // garante que o convidado não fique sem imagem se a nova câmera falhar ao abrir
    if (seq === camSwitchSeq && prevTrack) {
      const rec = await getCamera(prevId || undefined, quality).catch(() => getCamera(undefined, '720').catch(() => null));
      const recTrack = rec?.getVideoTracks?.()[0];
      if (recTrack) await swapTrack('video', recTrack).catch(() => {});
    }
    throw err;
  }
}

async function switchGuestMic(targetDeviceId) {
  const prevTrack = G.mic?.getAudioTracks()[0];
  const prevId = prevTrack?.getSettings?.().deviceId || loadPrefs().micId || '';
  const id = String(targetDeviceId || '');
  try {
    prevTrack?.stop();
    const s = await getMic(id || undefined);
    const track = s.getAudioTracks()[0];
    if (!track) throw new Error('Microfone sem trilha de áudio');
    await swapTrack('audio', track);
    const actualId = track.getSettings?.().deviceId || id || '';
    savePrefs({ micId: actualId });
    G.devices = await listDevices().catch(() => G.devices);
    pushState();
    glog('microfone trocado');
    return actualId;
  } catch (err) {
    if (prevTrack) {
      const rec = await getMic(prevId || undefined).catch(() => null);
      const recTrack = rec?.getAudioTracks?.()[0];
      if (recTrack) await swapTrack('audio', recTrack).catch(() => {});
    }
    throw err;
  }
}

async function openDevices() {
  const { cams, mics } = await listDevices();
  G.devices = { cams, mics };
  const cur = {
    cam: G.cam?.getVideoTracks()[0]?.getSettings().deviceId || loadPrefs().camId || '',
    mic: G.mic?.getAudioTracks()[0]?.getSettings().deviceId || loadPrefs().micId || '',
  };
  const opts = (list, sel, fb) => list.map((d, i) => `<option value="${esc(d.deviceId)}" ${d.deviceId === sel ? 'selected' : ''}>${esc(d.label || fb + ' ' + (i + 1))}</option>`).join('') || '<option value="">Nenhum dispositivo</option>';
  const showFlip = IS_MOBILE || cams.length >= 2;
  const el = h(`
    <div class="modal-back" id="dev-modal">
      <div class="card modal">
        <h3>Dispositivos</h3>
        <div class="sub">Troque durante a chamada, sem sair do estúdio.</div>
        <label class="field"><span>Câmera</span><div class="row" style="gap:8px;align-items:center"><select class="input" id="dev-cam" style="flex:1;min-width:0">${opts(cams, cur.cam, 'Câmera')}</select><button class="btn sm" id="dev-flip" type="button" title="Alternar entre as câmeras disponíveis"${showFlip ? '' : ' hidden'}>${icons.flip} Virar</button></div></label>
        <label class="field"><span>Microfone</span><select class="input" id="dev-mic">${opts(mics, cur.mic, 'Microfone')}</select></label>
        <div class="hint" id="dev-err" style="color:hsl(354 90% 72%)"></div>
        <div class="modal-actions"><button class="btn primary" id="dev-close">Fechar</button></div>
      </div>
    </div>`);
  document.body.append(el);
  const close = () => el.remove();
  $('#dev-close', el).onclick = close;
  el.addEventListener('pointerdown', (e) => e.target === el && close());
  const err = $('#dev-err', el);
  const camSel = $('#dev-cam', el);
  const micSel = $('#dev-mic', el);
  const flipBtn = $('#dev-flip', el);
  camSel.onchange = async (e) => {
    err.textContent = '';
    camSel.disabled = true;
    try {
      const actualId = await switchGuestCamera(e.target.value);
      if (actualId && [...camSel.options].some((o) => o.value === actualId)) camSel.value = actualId;
      toast('Câmera trocada.', 'ok');
    } catch (ex) {
      err.textContent = 'Não foi possível usar essa câmera: ' + (ex.message || ex.name);
      const backId = G.cam?.getVideoTracks()[0]?.getSettings().deviceId;
      if (backId && [...camSel.options].some((o) => o.value === backId)) camSel.value = backId;
    } finally {
      camSel.disabled = false;
    }
  };
  if (flipBtn) {
    flipBtn.onclick = async () => {
      err.textContent = '';
      flipBtn.disabled = true;
      camSel.disabled = true;
      try {
        const actualId = await switchGuestCamera('', { flip: true });
        if (actualId && [...camSel.options].some((o) => o.value === actualId)) camSel.value = actualId;
        toast('Câmera trocada.', 'ok');
      } catch (ex) {
        err.textContent = 'Não foi possível alternar a câmera: ' + (ex.message || ex.name);
      } finally {
        flipBtn.disabled = false;
        camSel.disabled = false;
      }
    };
  }
  micSel.onchange = async (e) => {
    err.textContent = '';
    micSel.disabled = true;
    try {
      const actualId = await switchGuestMic(e.target.value);
      if (actualId && [...micSel.options].some((o) => o.value === actualId)) micSel.value = actualId;
      toast('Microfone trocado.', 'ok');
    } catch (ex) {
      err.textContent = 'Não foi possível usar esse microfone: ' + (ex.message || ex.name);
      const backId = G.mic?.getAudioTracks()[0]?.getSettings().deviceId;
      if (backId && [...micSel.options].some((o) => o.value === backId)) micSel.value = backId;
    } finally {
      micSel.disabled = false;
    }
  };
}

function capsSnapshot() {
  let c = {};
  try { c = G.cam?.getVideoTracks?.()[0]?.getCapabilities?.() || {}; } catch {}
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
  return out;
}

function ctlSnapshot() {
  const out = {};
  for (const k of REMOTE_CTL) {
    const v = G.ctl?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string') out[k] = v;
    else if (k === 'torch' && typeof v === 'boolean') out[k] = v;
  }
  return out;
}

async function applyGuestCameraControl(data = {}) {
  const track = G.cam?.getVideoTracks?.()[0];
  if (!track) return;
  if (data.reset) {
    G.ctl = {};
    const caps = track.getCapabilities?.() || {};
    const p = {};
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) p.focusMode = 'continuous';
    if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('continuous')) p.exposureMode = 'continuous';
    if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('continuous')) p.whiteBalanceMode = 'continuous';
    if (caps.zoom && Number.isFinite(caps.zoom.min)) p.zoom = caps.zoom.min;
    if (caps.exposureCompensation && Number.isFinite(caps.exposureCompensation.min)) {
      p.exposureCompensation = Math.max(caps.exposureCompensation.min, Math.min(caps.exposureCompensation.max, 0));
    }
    if (caps.torch === true) p.torch = false;
    if (Object.keys(p).length) await track.applyConstraints({ advanced: [p] }).catch(() => {});
    pushState();
    return;
  }
  const raw = data.patch || {};
  const caps = track.getCapabilities?.() || {};
  const patch = {};
  for (const k of REMOTE_CTL) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (k === 'torch') {
      if (caps.torch === true && typeof v === 'boolean') patch.torch = v;
    } else if (Array.isArray(caps[k])) {
      if (typeof v === 'string' && caps[k].includes(v)) patch[k] = v;
    } else if (caps[k] && typeof caps[k] === 'object' && Number.isFinite(+v) && +v >= caps[k].min && +v <= caps[k].max) {
      patch[k] = +v;
    }
  }
  if (!Object.keys(patch).length) return;
  Object.assign(G.ctl, patch);
  await track.applyConstraints({ advanced: [patch] }).catch(() => {});
  pushState();
}

function stateMsg() {
  return {
    name: G.name,
    camOn: G.camOn,
    micOn: G.micOn,
    camStreamId: G.local.id,
    screenStreamId: G.screen?.id || null,
    camVideoDevices: devList(G.devices?.cams || [], 'Câmera'),
    camAudioDevices: devList(G.devices?.mics || [], 'Microfone'),
    camVideoId: G.cam?.getVideoTracks?.()[0]?.getSettings?.().deviceId || loadPrefs().camId || '',
    camAudioId: G.mic?.getAudioTracks?.()[0]?.getSettings?.().deviceId || loadPrefs().micId || '',
    camCaps: capsSnapshot(),
    camCtl: ctlSnapshot(),
  };
}
const pushState = () => {
  // mantém o estado de reentrada atualizado (a sala usa o join original ao reconectar)
  if (sig?.joinMsg) sig.joinMsg = { ...sig.joinMsg, state: stateMsg() };
  sig?.send({ type: 'state', state: stateMsg() });
};

function connect() {
  sig = new Signaling();
  sig.on('welcome', (m) => {
    setCohost(!!m.cohost);
    G.myId = m.id;
    G.studioState.live = m.live;
    if (m.hostId) ensurePeer(m.hostId);
    else showWaiting('Aguardando o host abrir o estúdio…');
    renderStatus();
  });
  sig.on('host-online', (m) => ensurePeer(m.hostId));
  sig.on('host-offline', () => {
    G.peer?.close();
    G.peer = null;
    G.studioState = { live: false, onStage: [] };
    showWaiting('O host saiu. Aguardando retorno…');
    renderStatus();
  });
  sig.on('signal', (m) => {
    if (!G.peer || G.peer.id !== m.from) createPeer(m.from);
    G.peer.handle(m.data);
  });
  sig.on('studio-state', (m) => {
    const wasOn = G.studioState.onStage?.includes(G.myId);
    G.studioState = m.state || {};
    const isOn = G.studioState.onStage?.includes(G.myId);
    if (isOn && !wasOn) toast('Você foi colocado no palco!', 'ok');
    if (!isOn && wasOn) toast('Você voltou para o backstage.');
    renderStatus();
  });
  sig.on('control', (m) => {
    if (m.action === 'mute') {
      setMic(false);
      toast('O host silenciou seu microfone.');
    } else if (m.action === 'unmute-request') {
      // um pedido por vez; se o mic já estiver ligado não há o que perguntar
      if (G.micOn || G.askingMic) return;
      G.askingMic = true;
      ask({ title: 'O host pediu seu microfone', text: 'Quer ativar o microfone agora?', ok: 'Ativar microfone', cancel: 'Agora não' }).then((yes) => {
        G.askingMic = false;
        if (yes) setMic(true);
      });
    } else if (m.action === 'kick') {
      leave('Você foi removido do estúdio pelo host.');
    } else if (m.action === 'reconnect') {
      forceRejoin();
    } else if (m.action === 'camera-device') {
      const d = m.data || {};
      if (d.kind === 'video') {
        switchGuestCamera(String(d.deviceId || '')).catch((ex) => toast('Não foi possível trocar de câmera: ' + (ex.message || ex.name), 'err'));
      } else if (d.kind === 'audio') {
        switchGuestMic(String(d.deviceId || '')).catch((ex) => toast('Não foi possível trocar o microfone: ' + (ex.message || ex.name), 'err'));
      }
    } else if (m.action === 'camera') {
      applyGuestCameraControl(m.data || {});
    } else if (m.action === 'camera-info') {
      listDevices().then((d) => { if (d) G.devices = d; pushState(); }).catch(() => pushState());
    }
  });
  sig.on('chat', addChat);
  sig.on('error', (m) => toast(m.message, 'err'));
  sig.on('close', (e) => {
    G.peer?.close();
    G.peer = null;
    if (e.code === 4001) leave('Você foi removido do estúdio pelo host.');
  });
  sig.on('role', (m) => setCohost(!!m.cohost));
  sig.on('cohost-state', (m) => {
    G.cohostState = m.state || null;
    // estado novo do host = o comando foi aplicado: some o "carregando" dos botões
    clearTimeout(G.pendT);
    $$('#prod-live .pending').forEach((x) => x.classList.remove('pending'));
    renderProd();
  });
  sig.connect({ type: 'join', room: studioId, role: 'guest', name: G.name, state: stateMsg(), key: guestKey() });
}

// reentra na sala para o host montar um peer novo; tentativas seguidas esperam cada vez mais (evita loop)
function forceRejoin() {
  if (G.rejoining) return; // host e convidado podem pedir ao mesmo tempo
  if ((G.rejoins || 0) >= 4) {
    // sem rota até o host (NAT/túnel sem TURN): para de entrar e sair; o diagnóstico fica na tela
    showWaiting('Não foi possível conectar ao estúdio. O host precisa configurar um servidor TURN (Painel → Conexão). Recarregue a página para tentar de novo.');
    return;
  }
  G.rejoining = true;
  setTimeout(() => (G.rejoining = false), 3000);
  G.rejoins = (G.rejoins || 0) + 1;
  const delay = Math.min(30000, 1000 * 2 ** Math.min(G.rejoins, 5));
  glog(`rejoin #${G.rejoins} em ${delay}ms`);
  showWaiting(G.rejoins > 2 ? `Não foi possível conectar. Nova tentativa em ${Math.round(delay / 1000)}s…` : 'Refazendo a conexão…');
  sig.nextDelay = delay;
  sig.ws?.close();
}

// identidade persistente: mantém o status de co-host ao reconectar
function guestKey() {
  try {
    let k = localStorage.getItem('castdeck.guestKey');
    if (!k) {
      k = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem('castdeck.guestKey', k);
    }
    return k;
  } catch {
    return '';
  }
}

function setCohost(on) {
  const was = !!G.cohost;
  G.cohost = on;
  $('#g-prod').hidden = !on;
  $('#tab-prod').hidden = !on;
  $('#g-role').hidden = !on;
  if (on && !was) {
    toast('Você agora é co-host: pode editar a live em tempo real.', 'ok');
    // computador: o painel lateral já está visível, então abre direto em Produção;
    // celular: não cobre o vídeo sem a pessoa pedir, só chama atenção para o botão
    if (sideDocked()) showPanel('prod');
    else $('#g-prod').classList.add('attn');
  }
  if (!on && was) {
    toast('Você não é mais co-host.');
    $('#g-prod').classList.remove('attn');
    if (G.panel === 'prod') {
      showPanel('chat');
      if (!sideDocked()) closeSide();
    }
  }
  renderProd();
}

// acima de 1000 px o painel lateral fica fixo ao lado do vídeo; abaixo vira uma folha que abre por cima
const sideDocked = () => matchMedia('(min-width: 1001px)').matches;

function showPanel(name) {
  G.panel = name;
  $('#panel-chat').classList.toggle('active', name === 'chat');
  $('#panel-prod').classList.toggle('active', name === 'prod');
  $('#tab-chat').classList.toggle('active', name === 'chat');
  $('#tab-prod').classList.toggle('active', name === 'prod');
  if (name === 'chat') {
    setUnread(0);
    const log = $('#chat-log');
    log.scrollTop = log.scrollHeight;
  } else $('#g-prod').classList.remove('attn');
  syncSideBtns();
}
function openSide(name) {
  $('.side').classList.add('open');
  showPanel(name);
}
function closeSide() {
  $('.side')?.classList.remove('open');
  syncSideBtns();
}
function syncSideBtns() {
  const side = $('.side');
  if (!side) return;
  const open = sideDocked() || side.classList.contains('open');
  side.classList.toggle('prod-mode', G.panel === 'prod');
  $('#g-chat').classList.toggle('active', open && G.panel === 'chat');
  $('#g-prod').classList.toggle('active', open && G.panel === 'prod');
}

const cmd = (c) => sig?.send({ type: 'cohost-cmd', cmd: c });
// fallback para hosts que ainda não mandam a lista completa de layouts com ícones
const LAYOUT_NAMES = { grid: 'Grade', solo: 'Solo', leader: 'Destaque', sidebar: 'Lateral', pip: 'PiP', split: 'Lado a lado' };
const LAYOUT_FALLBACK_ICON = '<rect x="2" y="2" width="44" height="24" rx="2"/>';
const KIND = {
  camera: ['Câmera', icons.cam],
  screen: ['Tela', icons.screen],
  media: ['Mídia', icons.film],
  image: ['Imagem', ICO.image],
};
// o ícone do layout vem do host como SVG; só aceita formas simples (sem scripts nem atributos de evento)
const safeIcon = (s) => (typeof s === 'string' && /^(\s*<(rect|circle|path)\b[^<>]*\/>)*\s*$/.test(s) && !/\son\w+\s*=/i.test(s) ? s : LAYOUT_FALLBACK_ICON);
// só troca o HTML de um bloco quando ele mudou: cliques e foco não se perdem a cada atualização do host
const setHTML = (el, html) => {
  if (el && el._html !== html) {
    el._html = html;
    el.innerHTML = html;
  }
};

function renderProd() {
  const box = $('#prod-live');
  if (!box || !G.cohost) return;
  const st = G.cohostState;
  $$('.cp-sec', box).forEach((s) => (s.hidden = !st));
  if (!st) {
    setHTML($('#cp-head'), `<div class="cp-head"><div class="spin"></div><div class="cp-head-txt"><b>Aguardando o host</b><span>O painel aparece quando o estúdio estiver aberto.</span></div></div>`);
    return;
  }
  const stage = st.stage || [];
  const items = st.items || [];
  const lays = st.allLayouts ? st.layouts || [] : [...Object.entries(LAYOUT_NAMES).map(([id, label]) => ({ id, label })), ...(st.layouts || [])];
  const cur = lays.find((l) => l.id === st.layout);
  setHTML(
    $('#cp-head'),
    `<div class="cp-head ${st.live ? 'live' : ''}">
      <span class="cp-onair"><i></i>${st.live ? 'NO AR' : 'Fora do ar'}</span>
      <div class="cp-head-txt"><b>${st.live ? 'A live está no ar' : 'A live ainda não começou'}</b>
        <span class="cp-chips"><span class="cp-chip">${esc(cur?.label || st.layout || '')}</span><span class="cp-chip">${stage.length} no palco</span>${st.activeBanner ? '<span class="cp-chip on">Banner no ar</span>' : ''}</span>
      </div>
    </div>`,
  );
  setHTML(
    $('#cp-layouts'),
    lays
      .map((l) => `<button class="cp-lay ${l.id === st.layout ? 'active' : ''}" data-op="layout" data-id="${esc(l.id)}" title="${esc(l.label)}"><svg viewBox="0 0 48 28">${safeIcon(l.icon)}</svg><span>${esc(l.label)}</span></button>`)
      .join(''),
  );
  // palco primeiro, na ordem em que aparece no programa; depois o resto
  const rank = (id) => (stage.includes(id) ? stage.indexOf(id) : 1e3);
  const order = [...items].sort((a, b) => rank(a.id) - rank(b.id));
  $('#cp-count').textContent = items.length ? `${stage.length} de ${items.length} no palco` : '';
  setHTML(
    $('#cp-sources'),
    order.length
      ? order
          .map((it) => {
            const on = stage.includes(it.id);
            const solo = st.solo === it.id;
            const mine = it.ownerId === G.myId;
            const [kindLbl, kindIco] = KIND[it.kind] || ['Fonte', icons.display];
            const micOff = it.kind === 'camera' && it.micOn === false;
            const canMic = it.kind === 'camera' && it.ownerId !== 'host' && !mine;
            const id = esc(it.id);
            return `<div class="ch-src ${on ? 'on' : ''} ${solo ? 'solo' : ''}">
              <span class="ch-ico">${kindIco}${on ? `<b>${stage.indexOf(it.id) + 1}</b>` : ''}</span>
              <span class="ch-meta"><b>${esc(it.label || kindLbl)}</b><small>${mine ? '<em>Você</em>' : ''}<span>${kindLbl}</span>${solo ? '<em>Solo</em>' : ''}</small></span>
              ${micOff ? `<i class="cp-flag" title="Microfone desligado">${icons.micOff}</i>` : ''}${it.camOff ? `<i class="cp-flag" title="Câmera desligada">${icons.camOff}</i>` : ''}
              <span class="ch-acts">
                ${canMic ? `<button class="btn sm icon" data-op="mic" data-to="${esc(it.ownerId)}" data-action="${micOff ? 'unmute-request' : 'mute'}" title="${micOff ? 'Pedir para ativar o microfone' : 'Silenciar o microfone'}">${micOff ? icons.micOff : icons.mic}</button>` : ''}
                <button class="btn sm icon ${solo ? 'primary' : ''}" data-op="solo" data-id="${id}" title="${solo ? 'Sair do solo' : 'Solo: mostrar só esta fonte'}">${ICO.solo}</button>
                <button class="btn sm ch-stage ${on ? 'primary' : ''}" data-op="stage" data-id="${id}" data-on="${on ? 0 : 1}" title="${on ? 'Tirar do palco' : 'Colocar no palco'}">${on ? 'No palco' : 'Palco'}</button>
              </span>
            </div>`;
          })
          .join('')
      : '<div class="cp-empty">Nenhuma fonte no estúdio ainda.</div>',
  );
  const bns = st.banners || [];
  setHTML(
    $('#cp-banners'),
    bns.length
      ? bns
          .map((bn) => {
            const act = st.activeBanner === bn.id;
            return `<button class="cp-bn ${act ? 'on' : ''}" data-op="banner" data-id="${esc(bn.id)}" title="${act ? 'Tirar do ar' : 'Mostrar no ar'}"><span class="cp-bn-txt"><b>${esc(bn.title || '(sem título)')}</b>${bn.subtitle ? `<small>${esc(bn.subtitle)}</small>` : ''}</span><span class="cp-bn-tag">${act ? 'NO AR' : 'Mostrar'}</span></button>`;
          })
          .join('')
      : '<div class="cp-empty">O host ainda não salvou banners. Use o banner rápido acima.</div>',
  );
  const msgs = st.messages || [];
  setHTML(
    $('#cp-messages'),
    msgs.length
      ? msgs
          .map((m) => {
            const src = m.source === 'whatsapp' ? 'WhatsApp' : 'Público';
            const body = m.text || (m.audio ? `Áudio${m.duration ? ` ${Math.round(m.duration)}s` : ''}` : 'Mensagem');
            return `<button class="cp-msg ${m.air ? 'on' : ''}" data-op="message" data-id="${esc(m.id)}" title="${m.air ? 'Tirar do ar' : 'Mostrar no ar'}"><span class="cp-msg-txt"><b>${m.air ? '<i>NO AR</i> ' : ''}${esc(src)} · ${esc(m.name || '')}</b><small>${esc(body)}</small></span><span class="cp-msg-tag">${m.air ? 'Tirar' : 'No ar'}</span></button>`;
          })
          .join('')
      : '<div class="cp-empty">Nenhuma mensagem recebida ainda.</div>',
  );
  $('#qb-clear').classList.toggle('live-on', !!st.activeBanner);
}

// envia o comando e deixa o botão "carregando" até o host confirmar com um estado novo
function sendCmd(c, el) {
  cmd(c);
  el?.classList.add('pending');
  clearTimeout(G.pendT);
  G.pendT = setTimeout(() => {
    if (!$$('#prod-live .pending').length) return;
    $$('#prod-live .pending').forEach((x) => x.classList.remove('pending'));
    toast('O host não confirmou a ação. Confira a conexão.', 'err');
  }, 4000);
}

function initProd() {
  $('#g-prod').onclick = () => {
    if (sideDocked()) return showPanel('prod');
    if ($('.side').classList.contains('open') && G.panel === 'prod') return closeSide();
    openSide('prod');
  };
  $('#tab-chat').onclick = () => showPanel('chat');
  $('#tab-prod').onclick = () => showPanel('prod');
  // um único ouvinte para o painel inteiro: os botões são recriados quando o estado muda
  $('#prod-live').addEventListener('click', (e) => {
    const b = e.target.closest('[data-op]');
    const st = G.cohostState;
    if (!b || !st || b.classList.contains('pending')) return;
    const d = b.dataset;
    if (d.op === 'layout') {
      if (d.id !== st.layout) sendCmd({ op: 'layout', layout: d.id }, b);
    } else if (d.op === 'stage') sendCmd({ op: 'stage', id: d.id, on: d.on === '1' }, b);
    else if (d.op === 'solo') sendCmd({ op: 'solo', id: st.solo === d.id ? null : d.id }, b);
    else if (d.op === 'banner') sendCmd({ op: 'banner', id: d.id }, b);
    else if (d.op === 'message') sendCmd({ op: 'message', id: d.id }, b);
    else if (d.op === 'mic') {
      // pedir para ativar não muda o estado até o convidado aceitar, então não espera confirmação
      cmd({ op: 'mic', to: d.to, action: d.action });
      toast(d.action === 'mute' ? 'Microfone silenciado.' : 'Pedido enviado ao convidado.', 'ok');
    }
  });
  const sendQuick = () => {
    const t = $('#qb-title');
    const title = t.value.trim();
    if (!title) {
      t.focus();
      t.classList.add('shake');
      setTimeout(() => t.classList.remove('shake'), 500);
      return;
    }
    cmd({ op: 'quick-banner', title, subtitle: $('#qb-sub').value.trim() });
    t.value = '';
    $('#qb-sub').value = '';
    toast('Banner enviado ao ar.', 'ok');
  };
  $('#qb-send').onclick = sendQuick;
  for (const id of ['#qb-title', '#qb-sub'])
    $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendQuick();
      }
    });
  $('#qb-clear').onclick = () => cmd({ op: 'hide-banner' });
}

// reaproveita o peer atual (a oferta do host pode chegar antes do 'welcome'); só recria se mudou ou morreu
function ensurePeer(hostId) {
  const p = G.peer;
  if (p && p.id === hostId && !p.closed && p.pc.connectionState !== 'closed') return;
  createPeer(hostId);
}

function createPeer(hostId) {
  G.peer?.close();
  G.hostId = hostId;
  glog(`createPeer host=${hostId}`);
  const peer = new Peer({ id: hostId, polite: true, signal: (data) => sig.send({ type: 'signal', to: hostId, data }) });
  G.peer = peer;
  G.camSender = null;
  G.micSender = null;
  for (const t of G.local.getTracks()) {
    const snd = peer.pc.addTrack(t, G.local);
    if (t.kind === 'video') G.camSender = snd;
    else if (t.kind === 'audio') G.micSender = snd;
  }
  G.screenSenders = [];
  if (G.screen) for (const t of G.screen.getTracks()) G.screenSenders.push(peer.pc.addTrack(t, G.screen));
  peer.addEventListener('track', (e) => {
    const stream = e.detail.streams[0];
    const v = $('#g-program');
    if (stream && v.srcObject !== stream) {
      v.srcObject = stream;
      v.playsInline = true;
      v.play().catch(() => {});
      // Se a conexão oscilar e o vídeo pausar/travar, força a retomada imediata
      v.onpause = () => { if (!v.ended && v.srcObject) v.play().catch(() => {}); };
      v.onstalled = () => { if (!v.ended && v.srcObject) v.play().catch(() => {}); };
    }
    $('#g-wait').hidden = true;
  });
  peer.addEventListener('state', (e) => {
    glog(`state ${e.detail} ice=${peer.pc.iceConnectionState}`);
    if (e.detail === 'failed' || e.detail === 'disconnected') showWaiting('Conexão instável, reconectando…');
    if (e.detail === 'connected') {
      $('#g-wait').hidden = true;
      G.rejoins = 0;
    }
    renderStatus();
  });
  // não conectou ou não se recuperou: reentra na sala para o host montar um peer novo
  peer.addEventListener('stuck', () => {
    glog('stuck');
    if (G.peer !== peer) return;
    forceRejoin();
  });
  peer.monitor((q) => {
    const el = $('#g-quality');
    if (!el) return;
    const [cls, label] = [['err', 'Conexão ruim'], ['warn', 'Conexão fraca'], ['ok', 'Boa'], ['ok', 'Ótima']][q.quality];
    el.innerHTML = `<span class="pill ${cls}" title="${Math.round(q.rtt ?? 0)} ms · perda ${q.lossPct.toFixed(1)}% · ↑${Math.round(q.sendKbps)} kbps ↓${Math.round(q.recvKbps)} kbps"><span class="dot"></span>${label}</span>`;
    // rede ruim: reduz a qualidade da câmera enviada para manter o áudio fluido
    adaptSendQuality(peer, q);
  });
  showWaiting('Conectando ao estúdio…');
  // diagnóstico enquanto não conecta: mostra estado/ICE e, após 12s, a causa provável (NAT restrito → precisa de TURN)
  const seen = new Set();
  peer.pc.addEventListener('icecandidate', (e) => e.candidate && seen.add(e.candidate.type));
  const t0 = Date.now();
  const diag = setInterval(() => {
    if (G.peer !== peer || peer.closed || peer.pc.connectionState === 'connected') return clearInterval(diag);
    const secs = Math.round((Date.now() - t0) / 1000);
    const base = `Conectando ao estúdio… (${peer.pc.connectionState}/${peer.pc.iceConnectionState}, ${secs}s)`;
    const hint = secs >= 12 ? ` — sem rota direta até o host${seen.has('relay') ? '' : ' (sem servidor TURN)'}. Tente outra rede ou peça ao host para configurar TURN em Painel → Conexão.` : '';
    glog(`diag ${peer.pc.connectionState}/${peer.pc.iceConnectionState} cand=${[...seen].join(',')}`);
    showWaiting(base + hint);
  }, 3000);
  pushState();
}

function showWaiting(text) {
  const w = $('#g-wait');
  if (!w) return;
  w.hidden = false;
  $('#g-wait-text').textContent = text;
}

function setMic(on) {
  G.micOn = on;
  G.mic?.getAudioTracks().forEach((t) => (t.enabled = on));
  renderControls();
  pushState();
}
function setCam(on) {
  G.camOn = on;
  G.cam?.getVideoTracks().forEach((t) => (t.enabled = on));
  renderControls();
  pushState();
}

// Ajusta o bitrate da câmera conforme a rede (AIMD simples): cai rápido com perda, sobe devagar.
let sendBps = 2_000_000;
function adaptSendQuality(peer, q) {
  const target = q.quality <= 0 ? 400_000 : q.quality === 1 ? 900_000 : Math.min(2_500_000, sendBps * 1.15);
  const next = q.quality <= 1 ? target : Math.max(sendBps, target);
  if (Math.abs(next - sendBps) < 50_000) return;
  sendBps = Math.round(next);
  for (const s of peer.pc.getSenders()) {
    if (s.track?.kind !== 'video' || G.screen?.getTracks().includes(s.track)) continue;
    peer.setMaxBitrate(s, sendBps);
  }
}

function pickScreenSenders(stream) {
  return G.peer ? stream.getTracks().map((t) => G.peer.pc.addTrack(t, stream)) : [];
}

// mode: 'screen' (tela/janela), 'tab' (aba do navegador com áudio) ou 'file' (vídeo local)
async function startScreen(mode = 'screen', file = null) {
  try {
    let s;
    let label = 'Tela';
    if (mode === 'file') {
      const v = document.createElement('video');
      v.src = URL.createObjectURL(file);
      v.loop = false;
      v.playsInline = true;
      v.controls = false;
      await v.play();
      s = v.captureStream ? v.captureStream() : v.mozCaptureStream();
      G.fileEl = v;
      v.onended = stopScreen;
      label = file.name;
    } else {
      s = mode === 'tab' ? await getTab() : await getScreen();
      label = mode === 'tab' ? 'Aba' : 'Tela';
      s.getVideoTracks()[0].contentHint = mode === 'tab' ? 'motion' : 'detail';
      s.getVideoTracks()[0].onended = stopScreen;
    }
    G.screen = s;
    G.screenMode = mode;
    pushState(); // envia o id do stream antes das trilhas chegarem
    G.screenSenders = pickScreenSenders(s);
    // captureStream pode ganhar a trilha de áudio depois do play
    s.onaddtrack = (e) => {
      if (!G.peer || G.peer.pc.getSenders().some((x) => x.track === e.track)) return;
      try {
        G.screenSenders.push(G.peer.pc.addTrack(e.track, s));
      } catch {}
    };
    toast(mode === 'file' ? `Enviando “${label}” ao host.` : mode === 'tab' ? 'Compartilhando a aba com o host (marque “Compartilhar áudio da aba”).' : 'Compartilhando sua tela com o host.', 'ok');
  } catch (e) {
    if (e.name !== 'NotAllowedError') toast('Falha ao compartilhar: ' + e.message, 'err');
  }
  renderControls();
}

function stopScreen() {
  if (!G.screen) return;
  for (const s of G.screenSenders) {
    try {
      G.peer?.pc.removeTrack(s);
    } catch {}
  }
  G.screenSenders = [];
  G.screen.getTracks().forEach((t) => t.stop());
  if (G.fileEl) {
    G.fileEl.pause();
    URL.revokeObjectURL(G.fileEl.src);
    G.fileEl = null;
  }
  G.screen = null;
  pushState();
  renderControls();
}

function renderControls() {
  const mic = $('#g-mic');
  mic.classList.toggle('off', !G.micOn);
  mic.querySelector('.ctrl-ico').innerHTML = G.micOn ? icons.mic : icons.micOff;
  const cam = $('#g-cam');
  cam.classList.toggle('off', !G.camOn);
  cam.querySelector('.ctrl-ico').innerHTML = G.camOn ? icons.cam : icons.camOff;
  const sharing = !!G.screen;
  const share = $('#g-share');
  share.classList.toggle('active', sharing);
  share.querySelector('.ctrl-ico').innerHTML = sharing ? icons.stop : icons.screen;
  share.querySelector('span:last-child').textContent = sharing ? 'Parar' : 'Compartilhar';
  share.title = sharing ? 'Parar de compartilhar' : 'Compartilhar tela, aba ou vídeo com o host';
  $('#g-screen').classList.toggle('active', G.screenMode === 'screen' && sharing);
  $('#g-tab').classList.toggle('active', G.screenMode === 'tab' && sharing);
  $('#g-video').classList.toggle('active', G.screenMode === 'file' && sharing);
  $('#g-cursor').classList.toggle('active', cursorSupported() && cursorOn());
  $('#g-cursor').setAttribute('aria-checked', String(cursorSupported() && cursorOn()));
  $('#g-cursor').title = cursorSupported()
    ? 'Mostrar/ocultar o cursor do mouse ao compartilhar tela ou aba'
    : 'Este navegador não permite ocultar o cursor da captura de tela';
  // selfview: iniciais quando a câmera está desligada e aviso de microfone mutado
  $('#g-self-off').hidden = G.camOn;
  const sm = $('#g-self-mic');
  sm.classList.toggle('on', !G.micOn);
  sm.innerHTML = G.micOn ? '' : icons.micOff;
}

function renderStatus() {
  const st = $('#g-status');
  if (!st) return;
  const onStage = G.studioState.onStage?.includes(G.myId);
  const live = G.studioState.live;
  const [cls, title, sub] = !G.peer
    ? ['wait', 'Aguardando o host', 'Você entra assim que o estúdio abrir.']
    : onStage
      ? live
        ? ['live onstage', 'Você está AO VIVO', 'O público está vendo e ouvindo você no programa.']
        : ['onstage', 'Você está no palco', 'O host colocou você no programa; a transmissão ainda não começou.']
      : ['backstage', 'Você está nos bastidores', 'O host pode te ouvir e você vê o programa; o público ainda não te vê nem te ouve.'];
  st.className = `status-banner g-status ${cls}`;
  $('#g-status-t').textContent = title;
  $('#g-status-s').textContent = sub;
  $('#g-selfview')?.classList.toggle('onair', !!(onStage && live));
  $('#g-selfview')?.classList.toggle('onstage', !!onStage);
  const tally = $('#g-pgm-tally');
  if (tally) tally.hidden = !onStage;
  $('#g-live').innerHTML = live ? '<span class="pill live"><span class="dot"></span>AO VIVO</span>' : '';
}

function chatEl(m) {
  return h(`<div class="msg ${m.role === 'host' ? 'host' : ''}"><b>${esc(m.name)}${m.role === 'host' ? ' · host' : ''}</b><p>${esc(m.text)}</p></div>`);
}
function setUnread(n) {
  G.unread = n;
  const label = n > 9 ? '9+' : String(n);
  const ico = $('#g-chat .ctrl-ico');
  ico?.querySelector('.ctrl-badge')?.remove();
  if (ico && n > 0) ico.append(h(`<i class="ctrl-badge">${label}</i>`));
  // computador com a aba Produção aberta: o contador aparece na aba Chat
  const tab = $('#tab-chat');
  tab?.querySelector('.count')?.remove();
  if (tab && n > 0) tab.append(h(`<span class="count">${label}</span>`));
}
function addChat(m) {
  // chat fora de vista (folha fechada no celular ou aba Produção aberta): avisa com contador
  const side = $('.side');
  const visible = (sideDocked() || side.classList.contains('open')) && G.panel === 'chat';
  if (m.from !== G.myId && !visible) {
    setUnread((G.unread || 0) + 1);
    if (!sideDocked()) toast(`${m.name}: ${m.text}`.slice(0, 80));
  }
  const log = $('#chat-log');
  if (!G.chat.length) log.innerHTML = '';
  G.chat.push(m);
  log.append(chatEl(m));
  log.scrollTop = log.scrollHeight;
}

function leave(message) {
  releaseAwake();
  stopMeter();
  sig?.close();
  G.peer?.close();
  G.local?.getTracks().forEach((t) => t.stop());
  G.screen?.getTracks().forEach((t) => t.stop());
  clearTimeout(leaveTimer);
  const goSite = () => {
    try { location.replace(LEAVE_URL); } catch { try { location.href = LEAVE_URL; } catch {} }
  };
  app.innerHTML = `<div class="lobby"><div class="card modal" style="text-align:center"><h3>${esc(message)}</h3><p class="sub">Obrigado por participar de “${esc(G.studio.name)}”.</p><p class="sub" style="opacity:.72">Levando você para <b>cast.flue.live</b>…</p><button class="btn primary" id="g-site">Ir para cast.flue.live</button></div></div>`;
  document.getElementById('g-site')?.addEventListener('click', goSite);
  leaveTimer = setTimeout(goSite, 3000);
}
