// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Estúdio do host: palco, backstage, convidados WebRTC, marca, banners, chat, mixer e transmissão.
import { $, $$, h, esc, icons, toast, modal, confirmDialog, promptDialog, api, copyText, fmtTime, fmtBytes, initials, PLATFORMS, destFormat, fmtBadge } from '../ui.js';
import { Signaling, Peer, loadIce } from '../rtc.js';
import { lobby, getCamera, getMic, getScreen, getTab, cursorOn, cursorSupported, setCursor, listDevices, savePrefs, loadPrefs } from '../media.js';
import { Compositor, GuestView, VerticalView, VERTICAL_LAYOUTS, LAYOUTS, DEFAULT_BRAND, normalizeAdjust, drawFramed } from './compositor.js';
import { openLayoutEditor, slotsIcon } from './layout-editor.js';
import { createJournal, newsPayload } from './journal.js';
import { createGcDesigner } from './gc-designer.js';
import { AudioMixer } from './mixer.js';
import { createAudioPanel } from './audio-ui.js';
import { VideoFx, FX_BACKGROUNDS } from './vfx.js';
import { Broadcaster } from './broadcaster.js';
import { createOnAir } from './onair.js';
import { createSocial } from './social-ui.js';
import { createNews } from './news.js';
import { initResizers } from './resize.js';
import { createExtras } from './extras.js';
import { createIngest } from './ingest.js';
import { createWidgets } from './widgets.js';
import { createMessages } from './messages.js';
import { createSports } from './sports.js';
import { chooseRecordingsDir } from '../recdir.js';
import { editDestination, deleteDestination, toggleDestination, showKeyHelp } from '../destinations.js';
import { createOutputs } from './outputs.js';
import { createProjectors } from './projector.js';
import { createSwitcher } from './switcher.js';
import { createAutoVoice } from './autoswitch.js';
import { createRemote } from './remote.js';
import { createFloatWins } from './floatwin.js';
import { createMeters } from './meters.js';
import { createScenes } from './scenes.js';
import { createDsk } from './dsk.js';
import { createCameraPanel } from './camera-panel.js';
import { createWhatsApp } from './whatsapp.js';
import { makeQR } from './qr.js';
import { toggleFull, exitFull, isFull, onFullChange } from '../fullscreen.js';
import { createReplayEngine } from './replay-engine.js';
import { createCaptions } from './captions.js';

// celular/tablet e o app Android (WebView): não existe captura de tela/aba nem cursor de mouse
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile|Silk|CastDeckAndroid/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const CAN_SHARE_SCREEN = !IS_MOBILE && !!navigator.mediaDevices?.getDisplayMedia;
// mesmas faixas do CSS "Estúdio no celular" (em pé até 700px; deitado com altura até 640px)
const MOBILE_MQ = matchMedia('(max-width: 700px), (orientation: landscape) and (max-height: 640px) and (max-width: 1100px)');

const studioId = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const app = $('#app');
// idioma escolhido no estúdio também vale para o painel, o launcher e a notificação do Android
window.CD_I18N_ONSET = (l) => api('/settings', { method: 'PUT', body: { lang: l } }).catch(() => {});

const COLORS = ['#7c5cff', '#e2336b', '#ff6b3d', '#f5b400', '#18b47b', '#1fa2ff', '#3d5afe', '#111827', '#f1f1f1'];
const BUILTIN_BG = [
  { type: 'image', value: '/assets/backgrounds/aurora.jpg' },
  { type: 'image', value: '/assets/backgrounds/waves.jpg' },
  { type: 'gradient', value: 'theme' },
  { type: 'color', value: '#0b0b12' },
];

const REMOTE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="6" y="6" width="1" height="1" fill="currentColor"/><rect x="17" y="6" width="1" height="1" fill="currentColor"/><rect x="6" y="17" width="1" height="1" fill="currentColor"/><path d="M14 14h2v2h-2z" fill="currentColor"/><path d="M19 14h2M14 19h2M19 19v2"/></svg>';
const S = {
  studio: null,
  system: null,
  destinations: [],
  sources: new Map(), // id -> { id, kind, label, ownerId, el, stream, camOff, micOn }
  stage: [],
  guests: new Map(),
  layout: 'grid',
  brand: { ...DEFAULT_BRAND },
  bsMin: (() => { try { return localStorage.getItem('cd.bs.min') === '1'; } catch { return false; } })(),
  bsOrder: (() => { try { return JSON.parse(localStorage.getItem('cd.bs.order') || '[]'); } catch { return []; } })(),
  banners: [],
  gcTemplates: [],
  activeBanner: null,
  tickerOn: false,
  chat: [],
  unread: 0,
  tab: 'brand',
  preset: '720p30',
  live: null, // mantido em sincronia por compatibilidade
  streaming: null, // { startedAt, destinationIds, vertical }
  recording: null, // { startedAt, vertical }
  status: null,
  local: { cam: null, mic: null, camOn: true, micOn: true, screen: null, name: 'Host' },
  mediaCount: 0,
  playlist: { on: false, loop: false, follow: true, order: [] },
  outKey: '',
  intercom: { talk: {}, listen: {}, ifb: true, ifbLevel: 0.18, ptt: false, latch: false },
};

let comp, mixer, sig, programStream, broadcaster, ticker, social, news, gcDesigner, audioPanel, vfx;
// FPS real do render do programa (janela de 1 s). Serve de medidor do custo dos 4 ISOs no replay.
let renderFps = 0;
let renderFrames = 0;
let renderWindowStart = 0;
let vview, vStream, vBroadcaster; // saída vertical 9:16 (simultânea à horizontal)
const onAir = createOnAir({ S }); // botões REC/LIVE, saúde dos destinos e contagem 3-2-1
let extras; // câmeras extras, sessão automática e limpeza
let ingest; // drones e câmeras por RTMP/SRT (MediaMTX embutido no servidor)
let outputs; // sinais separados para OBS/vMix (páginas /out)
let projectors; // projetor em outra tela/HDMI (janela /projector.html, sem codificar de novo)
let switcher; // mesa de corte (modo OBS/vMix: prévia + programa)
let floatWins; // janelas flutuantes (painéis destacados)
let remote; // controle remoto por celular (QR, papel 'remote' na sinalização)
let autoVoice; // AUTO-VOZ: corte automático por quem está falando (só com a mesa de corte)
let meters; // medidores de áudio à vista (programa + miniaturas)
let scenes; // cenas rápidas F1–F6
let dsk; // DSK 1 e 2 (camadas por cima do programa)
let cameras; // painel "Câmeras": preview e ajustes das câmeras locais/remotas
let whatsapp; // ponte local WhatsApp (desktop)
let ytJob = null; // download yt-dlp em andamento
let ytTimer = null;
let ytLastUrl = '';
let ytCollapsed = false;
try {
  ytCollapsed = localStorage.getItem('castdeck.ytdl.collapsed') === '1';
} catch {}
let replayEngine; // motor sob demanda de Replay & VAR (buffer circular em RAM e playout)
let captions; // legenda ao vivo (aba Legendas): na tela (PGM) e por link /cc
const tileEls = new Map();

// Menu do painel lateral: grupos em ordem de uso durante a live (o que vai para a tela → visual → público → som → ajustes).
// Cada item: [id do painel, rótulo, ícone, dica]. Os ids são os mesmos dos painéis (#panel-<id>).
// Eram 7 grupos em 3 linhas; viraram 5 numa linha só (Interação entrou em Público, Exibição em Visual, Sinais em Ajustes).
// Os ids de grupo 'audience' e 'audio' foram mantidos (testes e preferências salvas usam esses nomes).
const TAB_GROUPS = [
  {
    id: 'content',
    label: 'Conteúdo',
    icon: 'film',
    hint: 'O que aparece na tela: mídias, Playout, GCs, jornal e esportes',
    tabs: [
      ['media', 'Mídia', 'film', 'Vídeos, áudios e imagens'],
      ['playout', 'Playout', 'play', 'Fila, mini player e o que está no ar'],
      ['banners', 'Grafismo', 'banner', 'Grafismo: GC ao vivo, templates, dados e saídas'],
      ['journal', 'Jornal', 'news', 'GC de jornalismo, logo e etiquetas'],
      ['sports', 'Esportes', 'ball', 'Placar, cronômetro e GCs de futebol'],
    ],
  },
  {
    id: 'brand',
    label: 'Visual',
    icon: 'brand',
    hint: 'Identidade visual (cores, fundo, logo, overlay) e como as pessoas aparecem no vídeo',
    tabs: [
      ['brand', 'Marca', 'brand', 'Cores, fundo, logo e overlay'],
      ['display', 'Exibição', 'display', 'Nomes na tela, espaçamento e cantos dos vídeos'],
    ],
  },
  {
    id: 'interaction',
    label: 'Interatividade',
    icon: 'spark',
    hint: 'Enquetes com votação, códigos QR e mensagens do público no ar',
    tabs: [
      ['widgets', 'Widgets & QR', 'widgets', 'Enquetes (votação pelo celular ou chat) e códigos QR no ar'],
      ['messages', 'Mensagens', 'inbox', 'O público manda texto curto ou áudio pelo QR Code; você escolhe o que vai ao ar'],
      ['whatsapp', 'WhatsApp', 'whatsapp', 'Bridge local: receba mensagens e áudios do WhatsApp e escolha o que vai ao ar'],
    ],
  },
  {
    id: 'audience',
    label: 'Pessoas',
    icon: 'chat',
    hint: 'Chat privado com convidados e comentários das redes sociais',
    tabs: [
      ['chat', 'Chat', 'chat', 'Chat do estúdio com os convidados'],
      ['social', 'Redes', 'social', 'Comentários do YouTube, Twitch e outras redes'],
    ],
  },
  { id: 'director', label: 'Diretor', icon: 'auto', hint: 'Diretor automático: corta ou destaca quem fala e abaixa a música quando alguém fala', tabs: [['director', 'Diretor', 'auto', 'Corte automático e áudio inteligente']] },
  { id: 'audio', label: 'Áudio', icon: 'mixer', hint: 'Mixer e intercom de produção', tabs: [['audio', 'Mixer', 'mixer', 'Volume de cada fonte'], ['intercom', 'Intercom', 'mic', 'Intercom do diretor com câmeras e repórteres']] },
  { id: 'captions', label: 'Legendas', icon: 'cc', hint: 'Legenda ao vivo da fala: na tela (PGM) e por link, com tradução opcional', tabs: [['captions', 'Legendas', 'cc', 'Legenda ao vivo: na tela e por link']] },
  { id: 'outputs', label: 'Sinais', icon: 'signal', hint: 'Sinais para OBS/vMix: programa horizontal, vertical e cada pessoa, com qualidade ajustável', tabs: [['outputs', 'Sinais', 'signal', 'Sinais separados para OBS e vMix: programa horizontal, vertical e cada pessoa']] },
  {
    id: 'setup',
    label: 'Ajustes',
    icon: 'settings',
    hint: 'Destinos e qualidade, câmera e microfone',
    tabs: [
      ['output', 'Destinos', 'broadcast', 'Destinos da transmissão, qualidade e gravação'],
      ['devices', 'Dispositivos', 'cam', 'Seu nome, câmera, microfone, câmeras extras e pasta das gravações'],
    ],
  },
];
const BITRATE_OPTS = [
  [0, 'Automático (padrão do perfil)'],
  [2500, '2.5 Mbps (Conexão modesta)'],
  [4500, '4.5 Mbps (HD padrão · YouTube/Twitch)'],
  [6000, '6.0 Mbps (Full HD recomendado)'],
  [8000, '8.0 Mbps (Alta qualidade · 60 fps)'],
  [10000, '10.0 Mbps (Muito alta · estúdio)'],
  [12000, '12.0 Mbps (Qualidade broadcast)'],
  [15000, '15.0 Mbps (Qualidade máxima)'],
  [20000, '20.0 Mbps (Gravação master)'],
];
const lastTabOf = {}; // última sub-aba aberta em cada grupo

installErrorToasts();
boot();

// Erros que antes só apareciam no console do navegador passam a virar toast (com deduplicação):
// numa live, uma promessa rejeitada em silêncio (câmera/arquivo/salvamento) é pior que um aviso.
function installErrorToasts() {
  let last = 0;
  let count = 0;
  const report = (msg) => {
    const text = String(msg || '').trim();
    if (!text) return;
    const now = Date.now();
    if (now - last > 20000) count = 0;
    last = now;
    if (count++ >= 3) return; // evita enxurrada de toasts iguais
    toast(`Falha inesperada: ${text}`, 'err');
  };
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    const msg = r?.message || (typeof r === 'string' ? r : '');
    // AbortError/play()/NotAllowedError são ruídos comuns de troca de câmera e autoplay.
    if (/AbortError|NotAllowedError|play\(\)|interrupted by a call to pause|cancelled/i.test(msg)) return;
    console.error('[unhandledrejection]', r);
    report(msg || 'promessa rejeitada');
  });
  window.addEventListener('error', (e) => {
    const msg = e.message || '';
    if (!msg || /ResizeObserver|Script error/i.test(msg)) return;
    console.error('[window.error]', e.error || msg);
    report(msg);
  });
}

// =====================================================================
// Boot
// =====================================================================
async function boot() {
  try {
    [S.studio, S.system, S.destinations] = await Promise.all([api(`/studios/${studioId}`), api('/system'), api('/destinations')]);
  } catch (e) {
    app.innerHTML = `<div class="lobby"><div class="card modal"><h3>Estúdio indisponível</h3><p class="sub">${esc(e.message)}</p><a class="btn" href="/">Voltar ao painel</a></div></div>`;
    return;
  }
  document.title = `${S.studio.name} — Estúdio · CastDeck Local`;
  saver.rev = typeof S.studio.rev === 'number' ? S.studio.rev : 0;
  await loadIce();
  S.brand = { ...DEFAULT_BRAND, ...(S.studio.brand || {}) };
  // Camada global dos overlays em relação ao DSK (estúdios antigos assumem "atrás").
  S.brand.overlayLayers = { ...DEFAULT_BRAND.overlayLayers, ...(S.brand.overlayLayers || {}) };
  S.brand.overlayLayers.aboveDsk = !!S.brand.overlayLayers.aboveDsk;
  // Ligado por padrão para preservar o comportamento anterior; pode ser desligado no topo.
  S.brand.autoPlayMedia = S.brand.autoPlayMedia !== false;
  S.banners = S.studio.banners || [];
  S.gcTemplates = S.studio.gcTemplates || [];
  S.layout = S.brand.layout || 'grid';
  if (S.layout.startsWith('c-') && !(S.brand.customLayouts || []).some((c) => c.id === S.layout)) S.layout = 'grid';
  S.preset = S.system.presets[S.brand.preset] ? S.brand.preset : '720p30';
  const encs = S.system.ffmpeg.encoders;
  S.encoder = encs.some((e) => e.id === S.brand.encoder) ? S.brand.encoder : encs.find((e) => e.hw)?.id || 'libx264';
  S.bitrate = Number(S.brand.bitrate) || 0;

  const res = await lobby({
    mount: app,
    title: S.studio.name,
    subtitle: 'Ajuste câmera e microfone. Você poderá trocar depois em Configurações.',
    defaultName: 'Host',
    cta: 'Entrar no estúdio',
    models: true,
  });
  Object.assign(S.local, { cam: res.camStream, mic: res.micStream, camOn: res.camOn, micOn: res.micOn, name: res.name, media: res.media || null });
  await Promise.allSettled([document.fonts.load('600 20px Inter'), document.fonts.load('800 20px Outfit'), document.fonts.load('500 20px Inter')]);
  await buildStudio();
}

// =====================================================================
// Layout da página
// =====================================================================
async function buildStudio() {
  if (IS_MOBILE || S.system.platform === 'android') {
    document.body.classList.add('is-mobile');
    if (S.system.platform === 'android') document.body.classList.add('platform-android');
  }
  app.innerHTML = `
  <div class="studio ${IS_MOBILE || S.system.platform === 'android' ? 'is-mobile' : ''} ${S.system.platform === 'android' ? 'platform-android' : ''}">
    <header class="topbar">
      <div class="brand"><span class="brand-mark">${icons.logo}</span><span class="brand-txt">CastDeck <small>Local</small></span></div>
      <div>
        <div class="title" translate="no">${esc(S.studio.name)}</div>
        <div class="hint"><span id="guest-count">Nenhum convidado</span> <span class="mode-hint" id="mode-hint" aria-live="polite"></span> <span class="save-state" id="save-state" data-state="saved" title="Todas as alterações foram salvas">Salvo</span></div>
      </div>
      <div class="live-stats" id="live-stats"></div>
      <div class="spacer"></div>
      <div class="topbar-modes" role="group" aria-label="Modos de operação">
        <button class="btn mode-pill active" id="btn-mode-studio" type="button" title="Modo Estúdio: palco principal, cenas e bastidores">Estúdio</button>
        <button class="btn mode-pill" id="btn-switcher" title="Mesa de corte (como OBS/vMix): prévia + programa, corte entre câmeras com CORTE/AUTO e atalhos de teclado" aria-pressed="false">${SW_ICON}<span>Mesa de corte</span></button>
        ${IS_MOBILE || S.system.platform === 'android' ? '' : `<button class="btn" id="btn-replay" title="Abrir Console de Replay & VAR em janela separada (Shift+R)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right:2px"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8" fill="currentColor"></polygon></svg><span>Replay & VAR</span></button>`}
        <button class="btn mode-pill" id="btn-vertical" title="Painel de vídeo vertical 9:16 (Instagram, TikTok, Reels, Shorts) ao lado do preview" aria-pressed="false">${VERT_ICON}<span>9:16 Vertical</span></button>
      </div>
      <button class="btn autoplay" id="btn-autoplay" type="button" aria-pressed="true" title="Auto play de vídeos ao entrar no PGM ou ao colocar no palco">${icons.play}<span class="auto-dot"></span><span class="lbl">Auto play</span><span class="auto-state">ON</span></button>
      <div class="spacer"></div>
      ${window.CDi18n ? window.CDi18n.selectHTML({ className: 'btn', short: true, id: 'studio-lang' }) : ''}
      ${S.system.platform === 'android' ? '' : `<button class="btn icon" id="btn-whatsapp" title="WhatsApp local: QR, caixa de entrada e fila do programa" aria-label="WhatsApp">${icons.whatsapp}</button>`}
      <button class="btn icon" id="btn-cameras" title="Painel de câmeras: preview e ajustes de zoom, foco, ISO, exposição e lanterna" aria-label="Câmeras">${icons.cam}</button>
      <button class="btn icon" id="btn-intercom-mini" title="Mini intercom: PTT e corte de câmeras juntos" aria-label="Mini intercom" aria-pressed="false">${icons.mic}</button>
      <button class="btn icon" id="btn-remote" title="Controle remoto no celular: leia o QR e comande a mesa de corte" aria-label="Controle remoto">${REMOTE_ICON}</button>
      <button class="btn icon" data-fs="studio" data-tip="Tela cheia do estúdio" title="Tela cheia do estúdio" aria-label="Tela cheia do estúdio">${icons.expand}</button>
      <button class="btn" id="btn-panel" title="Abrir painel de controle (mídia, banners, jornal...)" aria-expanded="false">Painel</button>
      <button class="btn oa-rec" id="btn-record" title="Gravar o programa localmente em MP4 (independente da transmissão)" aria-pressed="false"><span class="oa-dot"></span><span class="lbl">Gravar</span></button>
      <button class="btn primary oa-live" id="btn-live" title="Transmitir ao vivo (independente da gravação)" aria-pressed="false">${icons.broadcast}<span class="lbl">Transmitir</span></button>
    </header>

    <section class="stage-wrap">
      <div class="stage-row" id="stage-row">
        <div class="sw-pvw-box" id="sw-pvw-box" hidden></div>
        <div class="sw-tcol" id="sw-tcol" hidden aria-label="Transição"></div>
        <div class="program-box">
          <div class="program" id="program">
            <canvas id="program-canvas"></canvas>
            <div class="dropmark" id="dropmark" hidden></div>
            <div class="onair" id="onair"></div>
            <span class="sw-tag pgm sw-pgm-tag">● PGM - AO VIVO</span>
            <span class="sw-mon-name sw-pgm-name" id="sw-pgm-name"></span>
            <button class="mon-fs" data-fs="program" title="Tela cheia do programa (F)" aria-label="Tela cheia do programa">${icons.expand}</button>
            ${CAN_SHARE_SCREEN ? `<button class="mon-fs mon-proj" id="btn-projector" title="Projetor: programa em outra tela, TV ou HDMI (Shift+P)" aria-label="Projetor">${icons.display}</button>` : ''}
          </div>
        </div>
        <div class="rz rz-v" id="rz-v" role="separator" aria-orientation="vertical" title="Arraste para redimensionar o painel vertical (duplo clique restaura)"></div>
        <aside class="vdock" id="vdock" hidden aria-label="Saída vertical 9:16"></aside>
      </div>
      <div class="rz rz-h" id="rz-stage" role="separator" aria-orientation="horizontal" title="Arraste para mudar a altura do preview (duplo clique restaura)"></div>
      <div class="gcbar deck" id="gcbar"></div>
      <div class="qscenes" id="qscenes" role="toolbar" aria-label="Cenas rápidas"></div>
      <div class="stagebar" id="stagebar"></div>
      <div class="switcher" id="switcher" hidden></div>
      <div class="layouts" id="layouts"></div>
      <div class="backstage" id="backstage"></div>
    </section>

    <footer class="bottombar">
      <button class="ctrl" id="c-mic"><span class="ctrl-ico"></span><span>Microfone</span></button>
      <button class="ctrl" id="c-cam"><span class="ctrl-ico"></span><span>Câmera</span></button>
      <button class="ctrl cam-recover" id="c-cam-recover" hidden title="A câmera parou. Clique para tentar reabrir sem perder o áudio."><span class="ctrl-ico">${icons.camOff}</span><span>Reabrir câmera</span></button>
      <button class="ctrl" id="c-invite" title="Chamar convidados para o estúdio"><span class="ctrl-ico">${icons.invite}</span><span>Convidar</span></button>
      <i class="ctrl-sep"></i>
      <button class="ctrl" id="c-media" title="Vídeos, áudios e imagens"><span class="ctrl-ico">${icons.film}</span><span>Mídia</span></button>
      <button class="ctrl" id="c-screen" ${CAN_SHARE_SCREEN ? '' : 'hidden'}><span class="ctrl-ico">${icons.screen}</span><span>Tela</span></button>
      <button class="ctrl" id="c-tab" ${CAN_SHARE_SCREEN ? '' : 'hidden'}><span class="ctrl-ico">${icons.tab}</span><span>Aba</span></button>
      <i class="ctrl-sep"></i>
      <span class="ctrl-group"><button class="ctrl" id="c-names" title="Mostrar/ocultar TODOS os nomes na tela (pessoas e vídeos)" aria-pressed="true"><span class="ctrl-ico ctrl-aa">Aa</span><span>Nomes</span></button><button class="ctrl ctrl-opt" id="c-names-opt" title="Exibição: nomes das pessoas, nomes dos vídeos e cursor do mouse" aria-label="Opções de exibição">▾</button></span>
      <button class="ctrl ctrl-hidden" id="c-cursor" ${CAN_SHARE_SCREEN ? '' : 'hidden'} title="Mostrar/ocultar o cursor do mouse ao compartilhar tela ou aba"><span class="ctrl-ico">${icons.cursor}</span><span>Cursor</span></button>
      <i class="ctrl-sep"></i>
      <button class="ctrl" id="c-settings" title="Dispositivos: nome, câmera, microfone e gravações"><span class="ctrl-ico">${icons.settings}</span><span>Dispositivos</span></button>
      <button class="ctrl" id="c-leave"><span class="ctrl-ico">${icons.leave}</span><span>Sair</span></button>
      <input type="file" id="media-file" accept="video/*,image/*,audio/*" multiple hidden>
    </footer>

    <aside class="side" id="side">
      <div class="rz rz-side" id="rz-side" role="separator" aria-orientation="vertical" title="Arraste para redimensionar o painel (duplo clique restaura)"></div>
      <div class="side-head">
        <span class="side-title">Painel</span>
        <button class="side-mini-btn" id="btn-detach" aria-pressed="false" title="Destacar este painel em uma janela flutuante (também: duplo clique na aba)">⧉</button>
        <button class="side-mini-btn" id="btn-side-mini" aria-pressed="false" title="Recolher o painel em ícones (economiza espaço)">${SIDE_ICON}</button>
      </div>
      <nav class="grp-tabs" aria-label="Seções do painel">${TAB_GROUPS.map((g) => `<button class="grp" data-group="${g.id}" title="${esc(g.label)} — ${esc(g.hint)}">${icons[g.icon]}<span>${g.label}</span>${g.id === 'audience' ? '<i class="count chat-count" hidden></i>' : g.id === 'interaction' ? '<i class="count msg-count" hidden></i>' : g.id === 'content' ? '<i class="count gf-live-count" hidden></i>' : ''}</button>`).join('')}</nav>
      <div class="side-body" id="side-body">
      <div class="side-fly-head">
        <strong id="side-fly-title"></strong>
        <button class="btn sm ghost" id="side-pin" title="Deixar o painel aberto ao lado (sair do modo ícones)">Fixar</button>
        <button class="btn sm ghost icon" id="side-fly-close" title="Fechar (Esc)" aria-label="Fechar">✕</button>
      </div>
      <nav class="tabs subtabs" aria-label="Itens da seção">${TAB_GROUPS.map((g) => g.tabs.map(([id, label, icon, hint]) => `<button class="tab" data-tab="${id}" data-group="${g.id}" title="${hint}" hidden>${icons[icon]}<span>${label}</span>${id === 'chat' ? '<i class="count chat-count" hidden></i>' : id === 'messages' ? '<i class="count msg-count" hidden></i>' : id === 'banners' ? '<i class="count gf-live-count" hidden></i>' : ''}</button>`).join('')).join('')}</nav>
      <div class="panel" id="panel-media"></div>
      <div class="panel" id="panel-playout"></div>
      <div class="panel" id="panel-banners"></div>
        <div class="panel" id="panel-journal"></div>
      <div class="panel" id="panel-sports"></div>
      <div class="panel" id="panel-widgets"></div>
      <div class="panel" id="panel-messages"></div>
      <div class="panel" id="panel-whatsapp"></div>
      <div class="panel" id="panel-brand"></div>
      <div class="panel" id="panel-chat"></div>
      <div class="panel" id="panel-social"></div>
      <div class="panel" id="panel-audio"></div>
      <div class="panel" id="panel-intercom"></div>
      <div class="panel" id="panel-captions"></div>
      <div class="panel" id="panel-director"></div>
      <div class="panel" id="panel-output"></div>
      <div class="panel" id="panel-display"></div>
      <div class="panel" id="panel-devices"></div>
      <div class="panel" id="panel-outputs"></div>
      </div>
    </aside>
  </div>`;

  // Botões só de ícone (rótulos somem no celular/tablet) precisam de nome acessível:
  // o title já existe; copia para aria-label quando o HTML não trouxe um.
  document.querySelectorAll('.studio button[title]:not([aria-label])').forEach((b) => {
    b.setAttribute('aria-label', b.title);
  });

  comp = new Compositor($('#program-canvas'));
  // efeitos de câmera (fundo virtual, enquadramento automático): motores só carregam quando usados
  vfx = new VideoFx();
  comp.vfx = vfx;
  for (const [id, c] of Object.entries(loadPrefs().fx || {})) if (id.startsWith('host:')) vfx.set(id, c).catch(() => {});
  applyPreset();
  // celular: a barra de baixo rola de lado; o degradê na borda direita avisa que há mais botões
  {
    const bar = $('.studio .bottombar');
    if (bar) {
      const more = () => bar.classList.toggle('more', bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 4);
      bar.addEventListener('scroll', more, { passive: true });
      addEventListener('resize', more);
      setTimeout(more, 300);
    }
  }
  comp.setBrand(S.brand);
  comp.layout = S.layout;
  // letreiro: texto manual + manchetes dos feeds RSS ligados
  news = createNews({ S, comp, save: saveStudio, onHeadline: (t) => gcDesigner?.onHeadline?.(t) });
  journal = createJournal({ S, h, esc, $, $$, toast, icons, saveStudio, toggleBanner, renderGcBar, readImage, pickFile, news });
  gcDesigner = createGcDesigner({
    S,
    comp,
    modal,
    esc,
    icons,
    toast,
    saveStudio,
    brandColor: () => S.brand.color || '#7c5cff',
    render: () => renderBannersPanel(),
    onAir: () => renderGcBar(),
    getGuest: () => [...S.guests.values()][0] || null,
    getHeadline: () => news.latestHeadline?.() || '',
    allowPopout: !IS_MOBILE && S.system?.platform !== 'android',
  });
  widgets = createWidgets({ S, comp, $, $$, esc, h, toast, icons, modal, saveStudio, readImage, pickFile, api, studioId, copyText, onAir: () => renderGcBar() });
  // mensagens do público (texto/áudio pelo QR Code); o mixer é criado logo abaixo, por isso o getter
  messages = createMessages({
    S,
    comp,
    $,
    $$,
    esc,
    toast,
    icons,
    modal,
    saveStudio,
    api,
    studioId,
    copyText,
    getMixer: () => mixer,
    onAir: () => renderGcBar(),
    onUnread: (n) =>
      $$('.msg-count').forEach((c) => {
        c.hidden = !n;
        c.textContent = n;
      }),
  });
  whatsapp = S.system.platform === 'android' ? null : createWhatsApp({ S, api, modal, messages });
  sports = createSports({ S, comp, $, $$, esc, toast, icons, modal, saveStudio, toggleBanner, readImage, pickFile, onAir: () => renderGcBar() });
  news.apply();
  if ((S.brand.rssFeeds || []).some((f) => f.on)) news.refreshAll(true);
  news.schedule();

  mixer = new AudioMixer();
  // ajustes dos canais do host (volume, redução de ruído) e master ficam salvos entre sessões
  const mp = loadPrefs().mixer || {};
  for (const [k, v] of Object.entries(mp.ch || {})) mixer.prefs.set(k, v);
  if (mp.master != null) mixer.setMaster(mp.master);
  mixer.onPrefs = (id, p) => {
    if (!id.startsWith('host:')) return;
    const cur = loadPrefs().mixer || {};
    savePrefs({ mixer: { ...cur, ch: { ...(cur.ch || {}), [id]: { volume: p.volume, nrOn: p.nrOn, nrAmount: p.nrAmount, cc: p.cc, sends: p.sends } } } });
  };
  // Mute do host tem UMA fonte de verdade (o mixer): botão do estúdio, painel e celular seguem o mesmo estado.
  mixer.onMute = (id, muted) => {
    if (id !== 'host:mic') return;
    if (S.local.micOn === !muted) return;
    S.local.micOn = !muted;
    renderControls();
  };
  audioPanel = createAudioPanel({
    mixer,
    S,
    $,
    $$,
    esc,
    icons,
    toast,
    listDevices,
    loadPrefs,
    savePrefs,
    toggleHostMic: () => $('#c-mic').onclick(),
    onSpeakerMode: (safe) => applySpeakerMode(safe),
    captureScreenAudioLoopback: () => captureScreenAudioLoopback(),
    attachDeviceAudioToScreen: (id) => attachDeviceAudioToScreen(id),
    detachScreenAudio: () => detachScreenAudio(),
    startScreen: (mode) => startScreen(mode),
  });
  await mixer.resume();
  // legenda ao vivo: precisa do mixer (captionBus) e do compositor (camada no PGM); desktop apenas
  if (S.system.platform !== 'android') {
    captions = createCaptions({ S, comp, getMixer: () => mixer, $, esc, toast, icons, api, studioId, copyText, saveStudio, qrSvg, onAudioUi: () => tabOpen('audio') && renderAudioPanel() });
    captions.init().catch((e) => console.warn('[legenda]', e));
  }
  // navegadores suspendem o áudio até haver interação: retoma em qualquer clique/tecla
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => mixer.resume(), { passive: true });
  const spk = loadPrefs().speakerId;
  if (spk) mixer.setSpeaker(spk).catch(() => {});
  startRenderLoop();
  // Sem watchdog automático: a câmera nunca é parada sozinha. Se o track terminar/mutar,
  // o usuário recebe o botão "Reabrir câmera" e o áudio continua.
  programStream = new MediaStream([comp.canvas.captureStream().getVideoTracks()[0], mixer.programTrack]);
  vview = new VerticalView(comp, S.system.presets[vPresetId()]);
  vview.layout = S.brand.vlayout || 'auto';
  vStream = new MediaStream([vview.track, mixer.programTrack]);
  outputs = createOutputs({ S, studioId, getSig: () => sig, getMixer: () => mixer, getStreams: () => ({ programStream, vStream }), $, $$, esc, icons, copyText, api, vNeeded: () => !!projectors?.active('vpgm') });
  projectors = createProjectors({ S, getStreams: () => ({ programStream, vStream }), getMixer: () => mixer, $, esc, toast, modal, icons });
  $('#btn-projector')?.addEventListener('click', () => projectors.openDialog('pgm'));
  // Shift+P abre o projetor (fora de campos de texto), como atalho de operação ao vivo
  if (CAN_SHARE_SCREEN)
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'P' || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable]') || document.querySelector('.modal-back')) return;
      e.preventDefault();
      projectors.openDialog('pgm');
    });
  // Replay & VAR é exclusivo do desktop: no app Android e no celular o motor nem é criado
  const REPLAY_ALLOWED = !(IS_MOBILE || S.system?.platform === 'android');
  replayEngine = REPLAY_ALLOWED ? createReplayEngine({
    S,
    comp,
    mixer,
    getProgramStream: () => programStream || (comp?.canvas?.captureStream ? comp.canvas.captureStream(30) : null),
    toast,
  }) : null;

  function openReplayConsole() {
    if (IS_MOBILE || S.system?.platform === 'android') return;
    const w = Math.min(1140, Math.max(800, (window.screen.availWidth || 1280) - 80));
    const h = Math.min(720, Math.max(500, (window.screen.availHeight || 900) - 90));
    const left = Math.max(10, window.screenLeft + 40);
    const top = Math.max(10, window.screenTop + 40);
    const win = window.open(
      '/replay.html',
      'CastDeckReplayConsole',
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
    );
    if (win) {
      win.focus();
      toast('Console de Replay & VAR aberto em janela dedicada.');
    }
  }

  $('#btn-replay')?.addEventListener('click', openReplayConsole);

  document.addEventListener('keydown', (e) => {
    if (IS_MOBILE || S.system?.platform === 'android') return;
    if (e.key === 'R' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !e.target.closest?.('input, textarea, select, [contenteditable]') && !document.querySelector('.modal-back')) {
      e.preventDefault();
      openReplayConsole();
    }
  });

  window.__castdeck = {
    S,
    comp,
    mixer,
    applySpeakerMode: (safe) => applySpeakerMode(safe),
    social,
    vview,
    replayEngine,
    whatsapp,
    messages,
    get programStream() { return programStream; },
    // FPS real do render do programa (medido no ticker). O console usa para mostrar o custo do ISO 4 CAM.
    get renderFps() { return renderFps; },
    get renderTargetFps() { return S?.system?.presets?.[S.preset]?.fps || 30; },
    openReplayConsole,
    addVideoSource,
    removeSource,
    setStage,
    renderTiles,
    toast,
    createAudioPanel,
    renderAudioPanel,
    audioPanel,
    renderTab: (tab) => renderTabContent(tab),
    renderTabContent: (tab) => renderTabContent(tab),
    popouts: new Map(),
    registerPopout: (tab, win, panel) => { window.__castdeck.popouts.set(tab, { win, panel }); },
    unregisterPopout: (tab) => { window.__castdeck.popouts.delete(tab); },
    findInPopout: (sel) => {
      for (const { win, panel } of window.__castdeck.popouts.values()) {
        if (win && !win.closed && panel) {
          if (panel.matches?.(sel)) return panel;
          const el = panel.querySelector?.(sel);
          if (el) return el;
        }
      }
      return null;
    },
    findAllInPopouts: (sel) => {
      const res = [];
      for (const { win, panel } of window.__castdeck.popouts.values()) {
        if (win && !win.closed && panel) {
          if (panel.matches?.(sel)) res.push(panel);
          res.push(...(panel.querySelectorAll?.(sel) || []));
        }
      }
      return res;
    },
    toggleHostMic: () => $('#c-mic').onclick(),
    captureScreenAudioLoopback: () => captureScreenAudioLoopback(),
    attachDeviceAudioToScreen: (id) => attachDeviceAudioToScreen(id),
    detachScreenAudio: () => detachScreenAudio(),
    startScreen: (mode) => startScreen(mode),
    listDevices,
    loadPrefs,
    savePrefs,
    toast,
    icons,
    esc,
  };
  switcher = createSwitcher({
    S,
    comp,
    $,
    esc,
    toast,
    sendControl: (to, action, data) => sig?.send({ type: 'control', to, action, data }),
    onAir: applyAir,
    openFx: (id) => openFx(id),
    fxActive: (id) => !!vfx?.active(id),
    toggleCohost: (ownerId) => toggleCohost(ownerId),
    isCohost: (ownerId) => !!S.guests.get(ownerId)?.cohost,
    toggleStage,
    addCamera: () => openAddCamera(),
    onMode: (on) => {
      applySideForMode(on);
      updateModeHint(on);
      autoVoice?.onMode(on);
    },
  });
  switcher.mount();
  window.__castdeck.switcher = switcher;
  autoVoice = createAutoVoice({ S, comp, mixer, switcher, $, toast, setSolo, openTab: (t) => openSideTab(t), ritmoApi: { setStage: (ids) => setStage(ids), setLayout: softLayout } });
  autoVoice.mount();
  window.__castdeck.autoVoice = autoVoice;
  remote = createRemote({
    S,
    comp,
    mixer,
    getSig: () => sig,
    studioId,
    getSwitcher: () => switcher,
    getAuto: () => autoVoice,
    getReplay: () => replayEngine,
    getLayouts: () => [...LAYOUTS.map((l) => ({ id: l.id, label: l.label, icon: l.icon })), ...(S.brand.customLayouts || []).map((c) => ({ id: c.id, label: c.label, icon: slotsIcon(c.slots) }))],
    getScenes: () => scenes,
    applyEdit: (m) => runCohostCmd({ ...m, remote: true }),
    mediaApi: {
      getDeckSel: () => deckSel,
      setDeckSel: (id) => { deckSel = id; tickDeck(); },
      play: (id) => {
        const target = id || deckSel;
        if (target) {
          deckSel = target;
          playMedia(target);
          tickDeck();
        }
      },
      pause: (id) => {
        const target = id || deckSel;
        const s = S.sources.get(target);
        if (s?.el) s.el.pause();
        tickDeck();
      },
      step: (dir) => {
        const l = mediaList();
        if (!l.length) return;
        const s = S.sources.get(deckSel) || l[0];
        const wasPlaying = s && !s.el.paused;
        const n = (l.findIndex((x) => x.id === s.id) + dir + l.length) % l.length;
        if (wasPlaying && s) {
          s.el.pause();
          l[n].el.currentTime = 0;
          playMedia(l[n].id);
        }
        deckSel = l[n].id;
        tickDeck();
      },
      seek: (id, time) => {
        const s = S.sources.get(id || deckSel);
        if (s?.el && Number.isFinite(time)) {
          s.el.currentTime = time;
        }
      },
      list: () => mediaList(),
    },
    getChat: () => S.chat || [],
    getMessages: () => messages,
    api,
    $,
    esc,
    toast,
    qrSvg,
    copyText,
    modal,
  });
  window.__castdeck.remote = remote;
  // API curta usada pelo painel Câmeras e por integrações locais.
  window.__castdeck.intercom = {
    talk: (id, on) => intercomSetTalk([id], on),
    listen: (id, on) => {
      S.intercom.listen[id] = !!on;
      mixer.setIntercomListen(`${id}:cam:audio`, !!on);
    },
    isListening: (id) => S.intercom.listen[id] !== false,
    isTalking: (id) => !!S.intercom.talk[id],
    link: () => showIntercomLink(),
    open: () => switchTab('intercom'),
  };
  // O painel do Diretor é remontado ao trocar de idioma; o bloco de controle remoto
  // também usa t() e precisa ser recolocado depois da remontagem.
  window.CDi18n?.onChange?.(() => {
    if (S.tab === 'director') remote?.mountPanel();
  });
  $('#btn-whatsapp')?.addEventListener('click', () => whatsapp?.open());
  $('#btn-cameras').onclick = () => cameras.open();
  $('#btn-intercom-mini').onclick = () => toggleIntercomMini();
  $('#btn-remote').onclick = () => remote.openModal();
  floatWins = createFloatWins({
    $,
    $$,
    tabs: TAB_GROUPS.flatMap((g) => g.tabs),
    renderTab: (tab) => renderTabContent(tab),
    onDock: (tab) => switchTab(tab),
    onOpen: () => markFloating(),
    toast,
  });
  window.__castdeck.floatWins = floatWins;
  window.__castdeck.switchTab = switchTab;
  $('#btn-detach').onclick = () => (floatWins.has(S.tab) ? floatWins.close(S.tab) : detachCurrent());
  $$('.subtabs .tab').forEach((b) => b.addEventListener('dblclick', () => detachCurrent(b.dataset.tab)));
  $$('.grp').forEach((g) => {
    g.addEventListener('dblclick', () => {
      const gid = g.dataset.group;
      const tab = lastTabOf[gid] || TAB_GROUPS.find((x) => x.id === gid)?.tabs[0]?.[0];
      if (tab) detachCurrent(tab);
    });
  });
  // medidores à vista (VU do programa + nível/mudo em cada miniatura), estilo painel de hardware
  meters = createMeters({ S, mixer, $, icons, getTiles: () => tileEls });
  meters.mount();
  window.__castdeck.meters = meters;
  // cenas rápidas F1–F6: guardam layout + palco + banner num toque
  scenes = createScenes({ S, comp, $, esc, toast, modal, promptDialog, confirmDialog, saveStudio, setStage, setSolo, setLayout, toggleBanner, getSwitcher: () => switcher });
  scenes.mount();
  window.__castdeck.scenes = scenes;
  // DSK 1 e 2: camadas por cima do programa, iguais no modo Estúdio e na mesa de corte
  dsk = createDsk({ S, comp, mixer, $, $$, esc, toast, modal, api, studioId, saveStudio, onChange: applyDskAir });
  window.__castdeck.dsk = dsk;
  cameras = createCameraPanel({
    S,
    getSig: () => sig,
    modal,
    getDevices: () => listDevices(),
    getInterface: (id) => getCameraInterface(id),
    onVideoDevice: (id, deviceId) => setCameraVideoInterface(id, deviceId),
    onAudioDevice: (id, deviceId) => setCameraAudioInterface(id, deviceId),
    onAddCamera: () => openAddCamera(),
  });
  window.__castdeck.cameras = cameras;

  // fontes locais
  addVideoSource('host:cam', S.local.cam, { kind: 'camera', label: S.local.name, ownerId: 'host', camOff: !S.local.camOn || !S.local.cam });
  if (S.local.mic) {
    mixer.addStream('host:mic', S.local.mic, { ownerId: 'host', stageKey: 'host:cam', monitor: false });
    mixer.setMuted('host:mic', !S.local.micOn, { save: false });
  }
  setStage(['host:cam']);
  // Se o host entrou antes de a câmera abrir no lobby, aproveita a mesma promessa (não abre outra getUserMedia,
  // que conflitaria com a permissão pendente).
  if ((!S.local.cam || !S.local.mic) && S.local.media) {
    S.local.media
      .then(({ camStream, micStream }) => {
        if (camStream && !S.local.cam) {
          S.local.cam = camStream;
          camStream.getVideoTracks().forEach((t) => (t.enabled = S.local.camOn));
          addVideoSource('host:cam', camStream, { kind: 'camera', label: S.local.name, ownerId: 'host', camOff: !S.local.camOn });
          renderControls();
        }
        if (micStream && !S.local.mic) {
          S.local.mic = micStream;
          mixer.addStream('host:mic', micStream, { ownerId: 'host', stageKey: 'host:cam', monitor: false });
          mixer.setMuted('host:mic', !S.local.micOn, { save: false });
          renderControls();
        }
      })
      .catch(() => {});
  }

  initAccordions();
  social = createSocial({ getComp: () => comp, toast, h, esc, $, $$, onVote: (m) => widgets.onChatMessage(m) });
  window.__castdeck.social = social;
  social.boot();
  applyBannerRotation();
  bindUI();
  bindProgramDrag();
  renderStagebar();
  renderControls();
  renderLayouts();
  renderGcBar();
  initResizers($('.studio'));
  setInterval(tickDeck, 300);
  initVerticalDock();
  switchTab('media');
  extras = createExtras({
    S, studioId, api, $, $$, esc, toast, modal, fmtBytes, listDevices, getCamera, getMic,
    mixer: () => mixer, addVideoSource, removeSource, setStage, setSolo, addMediaFile, applyName,
    toggleBanner, stopScreen, renderMediaPanel, renderAudioPanel,
  });
  window.__castdeck.extras = extras;
  ingest = createIngest({
    S, studioId, api, $, esc, toast, modal, copyText, qrSvg,
    mixer: () => mixer, addVideoSource, removeSource, renderAudioPanel,
  });
  window.__castdeck.ingest = ingest;
  connectSignaling();
  setInterval(uiTick, 100);
  extras.restore().then(() => ytResume()).catch((e) => toast('Não foi possível restaurar a sessão: ' + e.message, 'err'));
  ingest.restore().catch(() => {});

  window.addEventListener('beforeunload', (e) => {
    if (S.live || S.vlive) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

const VERT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/></svg>';
// mesa de corte: dois monitores e um T-bar
const SW_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="9" height="7" rx="1.5"/><rect x="13" y="4" width="9" height="7" rx="1.5"/><path d="M5 15h14M12 15v6M9 21h6"/></svg>';
// painel lateral: moldura com a coluna da direita + seta (gira 180° no modo ícones via CSS)
const SIDE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/><path class="chev" d="M8 9l3 3-3 3"/></svg>';

// ---------- Painel lateral recolhível (trilho de ícones) ----------
// Como os docks do OBS/vMix: no modo ícones o painel vira um trilho estreito e cada ícone abre a seção
// por cima do palco, sem roubar largura dos monitores. A preferência é salva separada por modo: a mesa
// de corte começa recolhida (precisa de largura para PRÉVIA + PROGRAMA) e o modo Estúdio começa aberto.
const SIDE_KEY = 'castdeck.sideMini';
function sidePrefs() {
  try {
    return JSON.parse(localStorage.getItem(SIDE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function setSideMini(on, { save = true } = {}) {
  const st = $('.studio');
  if (!st) return;
  st.classList.toggle('side-mini', !!on);
  st.classList.remove('side-fly');
  const b = $('#btn-side-mini');
  if (b) {
    b.setAttribute('aria-pressed', String(!!on));
    b.title = on ? 'Expandir o painel ao lado' : 'Recolher o painel em ícones (economiza espaço)';
  }
  if (save) {
    const p = sidePrefs();
    p[S.switcher ? 'switcher' : 'studio'] = !!on;
    try {
      localStorage.setItem(SIDE_KEY, JSON.stringify(p));
    } catch {}
  }
  // o palco muda de largura: compositor/monitores recalculam
  window.dispatchEvent(new Event('resize'));
}
function applySideForMode(sw) {
  const v = sidePrefs()[sw ? 'switcher' : 'studio'];
  setSideMini(v ?? !!sw, { save: false });
}
function updateModeHint(on) {
  const hint = $('#mode-hint');
  if (hint) {
    hint.textContent = on ? 'Mesa PGM · take/Cena · prévia' : 'Estúdio · palco/Solo';
    hint.title = on
      ? 'Mesa de corte: o PGM é o take; sem take, é a Cena (palco/Solo); a prévia é independente.'
      : 'Modo Estúdio: o PGM é o palco/layout; tela cheia é o Solo; não existe take.';
    hint.classList.toggle('on', !!on);
  }
  const studioBtn = $('#btn-mode-studio');
  const swBtn = $('#btn-switcher');
  studioBtn?.classList.toggle('active', !on);
  swBtn?.classList.toggle('active', !!on);
  studioBtn?.setAttribute('aria-pressed', String(!on));
  swBtn?.setAttribute('aria-pressed', String(!!on));
  // Se o painel de mídia estiver aberto, o rótulo do follow acompanha o modo sem re-renderizar tudo.
  const follow = $('#pl-follow');
  const followLabel = follow?.closest('label')?.querySelector('span');
  if (followLabel) followLabel.textContent = on ? 'Seguir no PGM' : 'Seguir no palco';
  if (follow?.closest('label')) {
    follow.closest('label').title = on
      ? 'Mesa: o próximo vídeo assume o take do PGM quando o atual termina'
      : 'Estúdio: o próximo vídeo assume o Solo ou o slot do palco quando o atual termina';
  }
}
// abre uma seção no painel flutuante (modo ícones) ou só troca a aba (painel fixo)
function openSideTab(tab) {
  switchTab(tab);
  const st = $('.studio');
  if (st.classList.contains('side-mini')) {
    st.classList.add('side-fly');
    const grp = TAB_GROUPS.find((g) => g.tabs.some(([id]) => id === tab));
    $('#side-fly-title').textContent = grp?.label || '';
  }
}
function closeSideFly() {
  $('.studio')?.classList.remove('side-fly');
}
// foco no vertical: expandir / recolher
const FOCUS_ICONS = [
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>',
];

function applyPreset() {
  const p = S.system.presets[S.preset];
  comp.setSize(p.width, p.height);
  if (ticker) ticker.postMessage(1000 / p.fps);
  // A prévia da mesa acompanha o mesmo fps do PGM (30/60), não fica em 15.
  switcher?.setPreviewFps(p.fps);
  // O retorno acompanha o preset da mesa (mínimo 30) sem recriar track/peer.
  for (const g of S.guests.values()) {
    g.view?.setFps(p.fps);
    if (g.videoSender) {
      const target = guestReturnTarget(g.quality?.quality ?? 3);
      if (target !== g.returnBps) {
        g.returnBps = target;
        g.peer.setMaxBitrate(g.videoSender, target);
      }
    }
  }
}

let speakerModeBusy = false;
async function applySpeakerMode(safe) {
  if (speakerModeBusy) return;
  speakerModeBusy = true;
  try {
    if (safe) mixer.setListenProgram(false);
    if (S.local.mic) {
      const mic = await getMic(loadPrefs().micId, { echoSafe: !!safe });
      const old = S.local.mic;
      S.local.mic = mic;
      mixer.addStream('host:mic', mic, { ownerId: 'host', stageKey: 'host:cam', monitor: false });
      mixer.setMuted('host:mic', !S.local.micOn, { save: false });
      old?.getTracks?.().forEach((t) => t.stop());
    }
    toast(safe
      ? 'Modo caixa de som: AEC forçado e “Ouvir programa” desligado.'
      : 'Modo caixa desligado. O microfone volta à configuração normal.', 'ok');
  } catch (e) {
    toast('Não foi possível aplicar o modo caixa: ' + e.message, 'err');
  } finally {
    speakerModeBusy = false;
  }
}

function startRenderLoop() {
  // Timer em Worker: não é estrangulado quando a janela perde o foco (rAF seria).
  // O próximo quadro só é agendado depois do ACK do anterior: se o render atrasar,
  // a fila não cresce e o app não acumula frames para "explodir" depois.
  const src = `let t=null,ms=33,waiting=false;
    const arm=()=>{clearTimeout(t);t=setTimeout(()=>{waiting=true;postMessage(0)},ms)};
    onmessage=e=>{const d=e.data;if(d==='ack'){waiting=false;arm()}else{ms=Math.max(1,Number(d)||33);if(!waiting)arm()}};`;
  ticker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  ticker.onmessage = () => {
    try {
      // Isola cada subsistema: um erro no DSK/convidado/vertical não impede o PGM de desenhar.
      const safe = (label, fn) => {
        try {
          fn();
        } catch (e) {
          console.warn('[render]', label, e);
        }
      };
      safe('pgm', () => comp.render());
      if (vview && (S.brand.vOn || S.vlive || S.vstarting || S.vOut)) safe('vertical', () => vview.render());
      for (const g of S.guests.values()) safe(`guest:${g.id}`, () => g.view?.render());
      safe('switcher', () => switcher?.render());
      safe('auto', () => autoVoice?.tick());
      renderFrames++;
      const now = performance.now();
      if (!renderWindowStart) renderWindowStart = now;
      if (now - renderWindowStart >= 1000) {
        renderFps = Math.round((renderFrames * 1000) / (now - renderWindowStart));
        renderFrames = 0;
        renderWindowStart = now;
      }
    } finally {
      // Mesmo se o PGM falhar, libera o próximo quadro; o erro fica no log e a UI não congela.
      ticker.postMessage('ack');
    }
  };
  ticker.postMessage(1000 / S.system.presets[S.preset].fps);
}

// Recuperação não destrutiva da câmera do host: nada de parar o track sozinho.
// Se o track terminar ou mutar, mostra "Reabrir câmera"; o áudio continua no ar.
let camWatchCleanup = null;
let camWatchTimer = null;
function setCamRecovery(on) {
  const btn = $('#c-cam-recover');
  if (!btn) return;
  const wasHidden = btn.hidden;
  btn.hidden = !on;
  $('#c-cam')?.classList.toggle('cam-warning', !!on);
  if (on && wasHidden) toast('A câmera parou de enviar imagem. O áudio continua; use "Reabrir câmera" quando quiser.', 'err');
}
function watchHostCamera() {
  camWatchCleanup?.();
  const tracks = S.local.cam?.getVideoTracks?.() || [];
  const refresh = () => {
    const t = tracks[0];
    const bad = !!S.local.camOn && (!t || t.readyState === 'ended' || t.muted);
    setCamRecovery(bad);
  };
  const onChange = () => refresh();
  for (const t of tracks) {
    t.addEventListener('ended', onChange);
    t.addEventListener('mute', onChange);
    t.addEventListener('unmute', onChange);
  }
  camWatchCleanup = () => {
    clearInterval(camWatchTimer);
    camWatchTimer = null;
    for (const t of tracks) {
      t.removeEventListener('ended', onChange);
      t.removeEventListener('mute', onChange);
      t.removeEventListener('unmute', onChange);
    }
  };
  // track.stop() não dispara "ended" em todos os navegadores; polling leve só para
  // mostrar o aviso, sem tocar no stream. Nunca reinicia a câmera sozinho.
  clearInterval(camWatchTimer);
  camWatchTimer = setInterval(refresh, 1500);
  refresh();
}
async function reopenHostCamera() {
  const btn = $('#c-cam-recover');
  if (btn) btn.disabled = true;
  const old = S.local.cam;
  try {
    let cam;
    try {
      cam = await getCamera(loadPrefs().camId, loadPrefs().quality);
    } catch (first) {
      // Se o track antigo está morto/mudo, libera e tenta uma vez; se ainda está vivo, não o derruba.
      const oldLive = old?.getVideoTracks?.().some((t) => t.readyState === 'live' && !t.muted);
      if (oldLive) throw first;
      old?.getTracks?.().forEach((t) => t.stop());
      S.local.cam = null;
      cam = await getCamera(loadPrefs().camId, loadPrefs().quality);
    }
    S.local.camOn = true;
    S.local.cam = cam;
    cam.getVideoTracks().forEach((t) => (t.enabled = true));
    addVideoSource('host:cam', cam, { kind: 'camera', label: S.local.name, ownerId: 'host', camOff: false });
    old?.getTracks?.().forEach((t) => t.stop());
    savePrefs({ camOn: true });
    renderControls();
    toast('Câmera reaberta.', 'ok');
  } catch (e) {
    setCamRecovery(true);
    toast('Não foi possível reabrir a câmera: ' + e.message, 'err');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// =====================================================================
// Fontes e palco
// =====================================================================
function applySourceAdjust(s) {
  const a = S.brand?.sourceAdjust?.[s.id];
  if (a && !s.adjust) s.adjust = normalizeAdjust(a);
  return s;
}

// O compositor mantém um objeto de fonte próprio; o ajuste precisa ser copiado para ele,
// senão o preview do modal muda mas o programa continua no enquadramento antigo.
function setSourceAdjust(s, adjust) {
  s.adjust = adjust || null;
  if (!comp) return;
  comp.upsertSource(s.id, { adjust: s.adjust || null });
}

function addVideoSource(id, stream, meta) {
  let s = S.sources.get(id);
  if (!s) {
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.autoplay = true;
    s = { id, el, stream: null };
    S.sources.set(id, s);
  }
  applySourceAdjust(s);
  Object.assign(s, meta);
  if (s.custom) s.label = s.custom; // nome definido pelo host tem prioridade
  if (stream !== undefined && s.stream !== stream && s.kind !== 'media' && s.kind !== 'image') {
    s.stream = stream;
    s.el.srcObject = stream;
    if (stream) s.el.play().catch(() => {});
  }
  comp.upsertSource(id, { kind: s.kind, label: s.label, el: s.el, camOff: s.camOff, adjust: s.adjust || null });
  if (id === 'host:cam') watchHostCamera();
  renderTiles();
  renderControls();
  cameras?.refresh();
  return s;
}

function getCameraInterface(id) {
  if (id === 'host:cam') {
    const p = loadPrefs();
    return { videoId: p.camId || '', audioId: p.micId || '' };
  }
  const c = extras?.cams?.get(id);
  return c ? { videoId: c.videoId || '', audioId: c.audioId || '' } : null;
}

async function setCameraVideoInterface(id, deviceId) {
  const src = S.sources.get(id);
  if (src?.remoteCam) {
    const g = S.guests.get(src.ownerId);
    if (!g || !sig) throw new Error('Câmera remota desconectada');
    sig.send({ type: 'control', to: g.id, action: 'camera-device', data: { kind: 'video', deviceId: deviceId || '' } });
    g.state.camVideoId = deviceId || '';
    return;
  }
  if (id === 'host:cam') {
    const p = loadPrefs();
    const stream = await getCamera(deviceId || '', p.quality || '720');
    const old = S.local.cam;
    S.local.cam = stream;
    stream.getVideoTracks().forEach((t) => (t.enabled = S.local.camOn));
    addVideoSource('host:cam', stream, { kind: 'camera', label: S.local.name, ownerId: 'host', camOff: !S.local.camOn });
    old?.getTracks().forEach((t) => t.stop());
    savePrefs({ camId: deviceId || '' });
    if (S.sources.has('host:screen')) addVideoSource('host:screen', undefined, { label: `Tela de ${S.local.name}` });
    return;
  }
  if (extras?.cams?.has(id)) return extras.updateCam(id, { videoId: deviceId || '' });
  throw new Error('Câmera não encontrada');
}

async function setCameraAudioInterface(id, deviceId) {
  const src = S.sources.get(id);
  if (src?.remoteCam) {
    const g = S.guests.get(src.ownerId);
    if (!g || !sig) throw new Error('Câmera remota desconectada');
    sig.send({ type: 'control', to: g.id, action: 'camera-device', data: { kind: 'audio', deviceId: deviceId || '' } });
    g.state.camAudioId = deviceId || '';
    return;
  }
  if (id === 'host:cam') {
    const mic = await getMic(deviceId || '');
    const old = S.local.mic;
    S.local.mic = mic;
    mixer.addStream('host:mic', mic, { ownerId: 'host', stageKey: 'host:cam', monitor: false });
    mixer.setMuted('host:mic', !S.local.micOn, { save: false });
    old?.getTracks().forEach((t) => t.stop());
    savePrefs({ micId: deviceId || '' });
    return;
  }
  if (extras?.cams?.has(id)) return extras.updateCam(id, { audioId: deviceId || '' });
  throw new Error('Câmera não encontrada');
}

function removeSource(id) {
  const s = S.sources.get(id);
  if (!s) return;
  comp.removeSource(id);
  mixer.remove(id + ':audio');
  if (s.kind === 'media') {
    mixer.remove(id);
    s.el.pause();
    if (s.url) URL.revokeObjectURL(s.url);
  }
  S.sources.delete(id);
  if (s.kind === 'media') {
    normalizeQueue();
    if (deckSel === id) deckSel = null;
  }
  if (S.brand.background?.type === 'video' && S.brand.background.value === id) {
    S.brand.background = { type: 'gradient', value: '' };
    comp.setBrand(S.brand);
    saveStudio();
    if (tabOpen('brand')) renderBrandPanel();
  }
  extras?.sourceRemoved(id);
  ingest?.sourceRemoved(id);
  switcher?.sourceGone(id);
  if (S.stage.includes(id)) setStage(S.stage.filter((x) => x !== id));
  renderTiles();
  cameras?.refresh();
  if (tabOpen('playout')) renderPlayoutPanel();
}

// aplica um nome personalizado (usado ao restaurar a sessão)
function applyName(id, name) {
  const s = S.sources.get(id);
  if (!s || !name) return;
  s.custom = name;
  s.label = name;
  comp.upsertSource(id, { kind: s.kind, label: s.label, el: s.el, camOff: s.camOff });
  renderTiles();
  renderStagebar();
}

// o host pode renomear qualquer pessoa ou item (o nome vale no programa, backstage e listas)
async function renameSource(id) {
  const s = S.sources.get(id);
  if (!s) return;
  const name = await modal(
    `<h3>Renomear</h3><label class="field"><span>Nome exibido na tela</span><input class="input" id="rn-in" maxlength="40" value="${esc(s.label)}"></label>
     <div class="row" style="justify-content:flex-end;margin-top:14px;gap:8px"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="rn-ok" data-save>Salvar</button></div>`,
    {
      onMount: (m, close) => {
        const i = $('#rn-in', m);
        i.focus();
        i.select();
        const ok = () => close(i.value.trim());
        $('#rn-ok', m).onclick = ok;
        i.onkeydown = (e) => {
          if (e.key === 'Enter') ok();
        };
      },
    },
  );
  if (!name) return;
  s.custom = name;
  s.label = name;
  comp.upsertSource(id, { kind: s.kind, label: s.label, el: s.el, camOff: s.camOff });
  renderTiles();
  renderStagebar();
  if (tabOpen('media')) renderMediaPanel();
}

function setStage(ids) {
  const prev = S.stage;
  S.stage = ids.filter((id) => S.sources.has(id));
  // vídeo tirado do palco pausa; ao voltar, continua do mesmo ponto (o que a mesa de corte pôs no ar continua tocando)
  for (const id of prev) {
    const m = S.sources.get(id);
    if (m?.kind === 'media' && !m.camOff && !S.stage.includes(id) && id !== S.take && !dsk?.uses(id) && !m.el.paused) {
      m.resume = !m.el.ended;
      m.el.pause();
    }
  }
  for (const id of S.stage) {
    const m = S.sources.get(id);
    if (m?.kind === 'media' && !m.camOff && !prev.includes(id)) {
      // Colocar no palco é entrada no ar no modo Estúdio (ou na Cena sem take na Mesa).
      // Um vídeo por vez evita duas reproduções e mistura de áudio.
      const stageIsPgm = !S.switcher || S.take === null;
      const shouldPlay = autoPlayMediaEnabled() && stageIsPgm;
      m.resume = false;
      if (shouldPlay) {
        if (m.el.ended) m.el.currentTime = 0;
        pauseOtherVideos(id);
        m.el.play().catch(() => {});
      }
    }
  }
  if (S.solo && !S.stage.includes(S.solo)) S.solo = null;
  comp.solo = S.solo;
  comp.setStage(S.stage);
  mixer.setStage(airKeys());
  renderTiles();
  renderStagebar();
  pushStudioState();
  switcher?.syncTally();
}

// áudio no ar = palco + o que a mesa de corte pôs no ar (cortar para outra câmera não cala quem está falando)
// + fontes que estão no ar como DSK (vídeo em loop num DSK toca com som, como no vMix)
function airKeys() {
  const keys = S.take && !S.stage.includes(S.take) ? [...S.stage, S.take] : [...S.stage];
  for (const id of dsk?.airIds() || []) if (!keys.includes(id)) keys.push(id);
  return keys;
}

// chamado pela mesa de corte a cada corte: áudio, vídeo que entra/sai do ar e selos dos bastidores
function applyAir(prevTake) {
  mixer.setStage(airKeys());
  const now = S.take ? S.sources.get(S.take) : null;
  if (now?.kind === 'media' && !now.camOff && now.el.paused && autoPlayMediaEnabled()) {
    if (now.el.ended) now.el.currentTime = 0;
    pauseOtherVideos(S.take);
    now.el.play().catch(() => {});
  }
  const old = prevTake && prevTake !== S.take ? S.sources.get(prevTake) : null;
  if (old?.kind === 'media' && !S.stage.includes(prevTake) && !dsk?.uses(prevTake) && !old.el.paused) old.el.pause();
  renderTiles();
}

// DSK entrou/saiu do ar (ou trocou de fonte): áudio e play/pause do vídeo usado nele
function applyDskAir({ on, sourceId, prev, ms = 0 } = {}) {
  mixer.setStage(airKeys());
  const m = sourceId ? S.sources.get(sourceId) : null;
  if (on && m?.kind === 'media' && !m.camOff && m.el.paused && !m.el.ended) {
    pauseOtherVideos(sourceId);
    m.el.play().catch(() => {});
  }
  // ao sair, pausa depois do fade (se a fonte não estiver no palco/no ar por outro caminho)
  const idle = (id) => {
    const x = id ? S.sources.get(id) : null;
    if (x?.kind === 'media' && !x.el.paused && !S.stage.includes(id) && id !== S.take && !dsk?.uses(id)) x.el.pause();
  };
  if (prev && prev !== sourceId) idle(prev);
  if (!on && sourceId) setTimeout(() => idle(sourceId), ms + 60);
  renderTiles();
}

// Solo: o item ocupa a tela cheia sozinho; clicar de novo volta ao layout
function setSolo(id) {
  S.solo = id && S.stage.includes(id) && S.solo !== id ? id : null;
  comp.solo = S.solo;
  renderStagebar();
  renderTiles();
  switcher?.syncTally();
}

// troca a posição de dois itens do palco (a ordem define o item principal e as posições)
function swapStage(a, b) {
  const arr = [...S.stage];
  const i = arr.indexOf(a);
  const j = arr.indexOf(b);
  if (i < 0 || j < 0 || i === j) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  setStage(arr);
}

function renderStagebar() {
  const bar = $('#stagebar');
  if (!bar) return;
  if (!S.stage.length) {
    bar.innerHTML = '<span class="hint">Palco vazio — adicione pessoas ou itens do backstage.</span>';
    return;
  }
  bar.innerHTML =
    '<span class="hint" style="margin-right:4px">No palco · arraste para trocar:</span>' +
    S.stage
      .map((id, i) => {
        const s = S.sources.get(id);
        return `<div class="chip ${S.solo === id ? 'solo' : ''}" draggable="true" data-sid="${esc(id)}">
          <span class="pos">${i + 1}</span><span class="nm">${esc(s?.label || id)}</span>
          <button class="chip-btn" data-rename="${esc(id)}" title="Renomear">✎</button>
          <button class="chip-btn" data-solo="${esc(id)}" title="${S.solo === id ? 'Sair do modo solo' : 'Solo: tela cheia só com este item'}">⛶</button>
          <button class="chip-btn" data-unstage="${esc(id)}" title="Tirar do palco">✕</button>
        </div>`;
      })
      .join('');
  $$('.chip', bar).forEach((c) => {
    c.ondragstart = (e) => {
      startDragSrc(e, c.dataset.sid);
      c.classList.add('dragging');
    };
    c.ondragend = () => {
      dragSrc = null;
      c.classList.remove('dragging');
    };
    c.ondragover = (e) => {
      e.preventDefault();
      c.classList.add('over');
    };
    c.ondragleave = () => c.classList.remove('over');
    c.ondrop = (e) => {
      e.preventDefault();
      c.classList.remove('over');
      swapStage(e.dataTransfer.getData('text/plain'), c.dataset.sid);
    };
  });
  $$('[data-rename]', bar).forEach((b) => (b.onclick = () => renameSource(b.dataset.rename)));
  $$('[data-solo]', bar).forEach((b) => (b.onclick = () => setSolo(b.dataset.solo)));
  $$('[data-unstage]', bar).forEach((b) => (b.onclick = () => toggleStage(b.dataset.unstage)));
}

// arrastar direto no programa: solte um item sobre outro para trocar de lugar; duplo clique = solo
function bindProgramDrag() {
  const cv = $('#program-canvas');
  const mark = $('#dropmark');
  const toCanvas = (e) => {
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) * comp.W) / r.width, ((e.clientY - r.top) * comp.H) / r.height];
  };
  let drag = null;
  const hideMark = () => (mark.hidden = true);
  cv.style.touchAction = 'none';
  cv.onpointerdown = (e) => {
    if (e.button !== 0 || S.solo) return;
    const id = comp.hit(...toCanvas(e));
    if (!id) return;
    drag = { id, sx: e.clientX, sy: e.clientY, moved: false, target: null };
    try { cv.setPointerCapture(e.pointerId); } catch {}
  };
  cv.onpointermove = (e) => {
    if (!drag) {
      cv.style.cursor = !S.solo && comp.hit(...toCanvas(e)) ? 'grab' : '';
      return;
    }
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) return;
    drag.moved = true;
    cv.style.cursor = 'grabbing';
    const t = comp.hit(...toCanvas(e));
    drag.target = t && t !== drag.id ? t : null;
    const a = drag.target && comp.anim.get(drag.target);
    if (a) {
      Object.assign(mark.style, { left: `${(a.x / comp.W) * 100}%`, top: `${(a.y / comp.H) * 100}%`, width: `${(a.w / comp.W) * 100}%`, height: `${(a.h / comp.H) * 100}%` });
      mark.hidden = false;
    } else hideMark();
  };
  const end = () => {
    if (drag?.moved && drag.target) swapStage(drag.id, drag.target);
    drag = null;
    cv.style.cursor = '';
    hideMark();
  };
  cv.onpointerup = end;
  cv.onpointercancel = end;
  cv.ondblclick = (e) => {
    const id = comp.hit(...toCanvas(e));
    if (id) setSolo(id);
    else if (S.solo) setSolo(null);
  };

  // soltar uma miniatura (backstage, chip do palco ou imagem da aba Mídia) direto num slot
  const customDef = () => (S.layout.startsWith('c-') ? (S.brand.customLayouts || []).find((c) => c.id === S.layout) : null);
  // descobre o slot sob o cursor: { index, id (ocupante ou null), rect em fração do canvas }
  const slotAt = (e) => {
    const [x, y] = toCanvas(e);
    const def = customDef();
    if (def && !S.solo) {
      let best = null;
      def.slots.forEach((s, i) => {
        if (x >= s.x * comp.W && x <= (s.x + s.w) * comp.W && y >= s.y * comp.H && y <= (s.y + s.h) * comp.H && (!best || s.w * s.h < best.s.w * best.s.h)) best = { s, i };
      });
      if (!best) return null;
      const occ = S.stage[best.i] || null;
      const a = occ && comp.anim.get(occ);
      const r = a ? { x: a.x / comp.W, y: a.y / comp.H, w: a.w / comp.W, h: a.h / comp.H } : best.s;
      return { index: best.i, id: occ, rect: r };
    }
    const t = comp.hit(x, y);
    const a = t && comp.anim.get(t);
    if (!a) return { index: S.stage.length, id: null, rect: null }; // área vazia: entra no fim
    return { index: S.stage.indexOf(t), id: t, rect: { x: a.x / comp.W, y: a.y / comp.H, w: a.w / comp.W, h: a.h / comp.H } };
  };
  const showMark = (r) => {
    if (!r) return hideMark();
    Object.assign(mark.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
    mark.hidden = false;
  };
  const dropId = (e) => {
    const id = dragSrc || e.dataTransfer.getData('application/x-castdeck-src') || e.dataTransfer.getData('text/plain');
    return S.sources.has(id) ? id : null;
  };
  cv.ondragover = (e) => {
    if (!dragSrc) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const sl = slotAt(e);
    showMark(sl?.rect);
  };
  cv.ondragleave = hideMark;
  cv.ondrop = (e) => {
    e.preventDefault();
    hideMark();
    const id = dropId(e);
    dragSrc = null;
    if (!id) return;
    placeInSlot(id, slotAt(e));
  };
}

let dragSrc = null; // id da miniatura sendo arrastada
function startDragSrc(e, id) {
  dragSrc = id;
  e.dataTransfer.setData('application/x-castdeck-src', id);
  e.dataTransfer.setData('text/plain', id);
  e.dataTransfer.effectAllowed = 'move';
}

// coloca o item no slot: troca com o ocupante se já estiver no palco; senão substitui o ocupante (que volta ao backstage)
function placeInSlot(id, sl) {
  if (!sl) return;
  if (S.solo) setSolo(null);
  const arr = [...S.stage];
  const from = arr.indexOf(id);
  if (sl.index >= arr.length || !sl.id) {
    if (from < 0 && arr.length >= 10) return toast('Máximo de 10 itens no palco.', 'err');
    if (from >= 0) arr.splice(from, 1);
    arr.push(id);
  } else if (sl.id === id) {
    return;
  } else if (from >= 0) {
    [arr[from], arr[sl.index]] = [arr[sl.index], arr[from]];
  } else {
    arr[sl.index] = id;
  }
  setStage(arr);
  toast(`${S.sources.get(id)?.label || 'Item'} → espaço ${arr.indexOf(id) + 1}`, 'ok');
}

function toggleStage(id) {
  if (S.stage.includes(id)) setStage(S.stage.filter((x) => x !== id));
  else {
    if (S.stage.length >= 10) return toast('Máximo de 10 itens no palco.', 'err');
    const s = S.sources.get(id);
    // tela/mídia entram como item principal (primeiro); pessoas entram no fim
    setStage(s && (s.kind === 'screen' || s.kind === 'media') ? [id, ...S.stage] : [...S.stage, id]);
  }
}

function pushStudioState() {
  if (!sig) return;
  const onStage = [...new Set(S.stage.map((id) => S.sources.get(id)?.ownerId).filter((o) => o && o !== 'host'))];
  sig.send({ type: 'studio-state', state: { live: !!S.live, recording: !!S.live?.record, onStage } });
}

// =====================================================================
// Backstage (tiles)
// =====================================================================
function saveBsOrder() {
  try { localStorage.setItem('cd.bs.order', JSON.stringify(S.bsOrder || [])); } catch {}
}
function moveBsOrder(from, before) {
  if (!from || from === before) return;
  const arr = [...(S.bsOrder || [])].filter((id) => S.sources.has(id));
  const i = arr.indexOf(from);
  if (i >= 0) arr.splice(i, 1);
  const j = arr.indexOf(before);
  arr.splice(j < 0 ? arr.length : j, 0, from);
  S.bsOrder = arr;
  saveBsOrder();
  renderTiles();
}
function toggleBsMin() {
  S.bsMin = !S.bsMin;
  try { localStorage.setItem('cd.bs.min', S.bsMin ? '1' : '0'); } catch {}
  const box = $('#backstage');
  box?.classList.toggle('bs-min', S.bsMin);
  toast(S.bsMin ? 'Miniaturas minimizadas' : 'Miniaturas expandidas');
  renderTiles();
}

function openTileActions(actions) {
  const list = actions
    .map((a, i) => `<button class="btn tile-action ${a.cls}" data-tile-act="${i}"><span class="tm-ico">${a.icon}</span><span>${esc(a.title)}</span></button>`)
    .join('');
  modal(
    `<h3>Ações da miniatura</h3>
     <p class="sub">Escolha o que fazer com esta fonte.</p>
     <div class="tile-actions-list">${list}</div>
     <div class="modal-actions"><button class="btn" data-close>Fechar</button></div>`,
    {
      onMount(m) {
        m.querySelectorAll('[data-tile-act]').forEach((b) => {
          b.onclick = () => {
            const a = actions[Number(b.dataset.tileAct)];
            m.querySelector('[data-close]')?.click();
            a?.fn?.();
          };
        });
      },
    },
  );
}

function renderTiles() {
  const box = $('#backstage');
  if (!box) return;
  for (const [id, el] of tileEls) {
    if (!S.sources.has(id)) {
      el.remove();
      tileEls.delete(id);
    }
  }
  for (const s of S.sources.values()) {
    let el = tileEls.get(s.id);
    if (!el) {
      el = h(`
        <div class="tile">
          <div class="tv"><canvas width="320" height="180" style="width:100%;height:100%;display:block"></canvas>
            <span class="pill badge"></span><div class="icons"></div>
            <div class="stage-btn"><button class="btn sm primary"></button></div>
            <div class="speak"></div>
          </div>
          <div class="tbar"><span class="nm"></span><span class="acts row" style="gap:2px"></span></div>
        </div>`);
      el.dataset.srcId = s.id;
      el.querySelector('.stage-btn button').onclick = () => toggleStage(s.id);
      el.draggable = true;
      el.title = 'Arraste para um espaço do programa';
      el.ondragstart = (e) => {
        if (e.target.closest?.('button')) return e.preventDefault();
        startDragSrc(e, s.id);
        el.classList.add('dragging');
        const cvs = el.querySelector('canvas');
        if (cvs) e.dataTransfer.setDragImage(cvs, cvs.width / 4, cvs.height / 4);
      };
      el.ondragend = () => {
        dragSrc = null;
        el.classList.remove('dragging');
      };
      el.addEventListener('dragover', (e) => {
        if (dragSrc && dragSrc !== s.id) {
          e.preventDefault();
          el.classList.add('drop-before');
        }
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop-before'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drop-before');
        if (dragSrc && dragSrc !== s.id) moveBsOrder(dragSrc, s.id);
      });
      tileEls.set(s.id, el);
      box.append(el);
    }
    const on = S.stage.includes(s.id);
    const air = S.take === s.id; // mesa de corte: esta fonte está no ar em tela cheia
    el.classList.toggle('on-stage', on || air);
    el.querySelector('.stage-btn button').textContent = on ? 'Tirar do palco' : 'Pôr no palco';
    const nmEl = el.querySelector('.nm');
    nmEl.textContent = s.label || '';
    nmEl.title = s.label || '';
    el.title = s.label || '';
    const badge = { camera: s.ingest ? (s.ingestLive ? 'Drone/RTMP' : 'Sem sinal') : s.extraCam ? 'Câmera' : s.remoteCam ? 'Câmera remota' : s.ownerId === 'host' ? 'Você' : S.guests.get(s.ownerId)?.cohost ? 'Co-host' : 'Convidado', screen: 'Tela', media: 'Mídia', image: 'Imagem' }[s.kind];
    const b = el.querySelector('.badge');
    b.textContent = air ? 'NO AR' : on ? 'NO PALCO' : badge;
    b.className = 'pill badge' + (on || air ? ' live' : '');
    const q = s.kind === 'camera' && s.ownerId !== 'host' ? S.guests.get(s.ownerId)?.quality : null;
    el.querySelector('.icons').innerHTML =
      (s.kind === 'camera' && s.micOn === false ? `<i>${icons.micOff}</i>` : '') +
      (s.kind === 'camera' && s.ownerId !== 'host'
        ? `<i class="qdot q${q ? q.quality : 3}" data-qdot="${s.ownerId}" title="${q ? `${Math.round(q.rtt ?? 0)} ms · perda ${q.lossPct.toFixed(1)}%` : 'conectando…'}"></i>`
        : '');
    const acts = el.querySelector('.acts');
    acts.innerHTML = '';
    const actions = [];
    const add = (icon, title, fn, cls = '') => actions.push({ icon, title, fn, cls });
    if (s.kind === 'camera' && s.ownerId !== 'host' && s.remoteCam) {
      // câmera remota: só silenciar (o microfone é ligado no próprio aparelho) e remover
      if (s.micOn !== false) add(icons.mic, 'Silenciar o microfone desta câmera', () => sig.send({ type: 'control', to: s.ownerId, action: 'mute' }));
      add(icons.kick, 'Remover câmera', () => kickGuest(s.ownerId), 'danger');
    } else if (s.kind === 'camera' && s.ownerId !== 'host' && !s.ingest) {
      const ch = S.guests.get(s.ownerId)?.cohost;
      add(ch ? '★' : '☆', ch ? 'Remover co-host' : 'Tornar co-host (pode editar a live)', () => toggleCohost(s.ownerId), ch ? 'cohost-btn on' : 'cohost-btn');
      add(s.micOn === false ? icons.micOff : icons.mic, s.micOn === false ? 'Pedir para ativar microfone' : 'Silenciar convidado', () =>
        sig.send({ type: 'control', to: s.ownerId, action: s.micOn === false ? 'unmute-request' : 'mute' }),
      );
    }
    add('✎', 'Renomear', () => renameSource(s.id), 'act-sec');
    add(icons.crop, 'Ajustar posição, zoom e corte desta fonte', () => openSourceAdjust(s.id), s.adjust ? 'primary' : 'act-sec');
    if (s.kind === 'camera' && !s.ingest) add('✦', vfx?.active(s.id) ? 'Efeitos de vídeo (ligados)' : 'Efeitos de vídeo: fundo virtual e enquadramento automático', () => openFx(s.id), vfx?.active(s.id) ? 'primary' : 'act-sec');
    if (s.kind === 'camera' && s.ownerId !== 'host' && !s.ingest && !s.remoteCam) {
      add(icons.kick, 'Remover do estúdio', () => kickGuest(s.ownerId), 'danger');
    }
    if (s.id === 'host:screen') add(icons.stop, 'Parar compartilhamento', stopScreen, 'danger');
    if (s.kind === 'media') {
      add(s.el.paused ? icons.play : icons.stop, s.el.paused ? 'Reproduzir' : 'Pausar', () => {
        if (s.el.paused) {
          pauseOtherVideos(s.id);
          s.el.play().catch(() => {});
        } else s.el.pause();
        renderTiles();
      });
    }
    if (s.kind === 'media' || s.kind === 'image') add(icons.trash, s.recordingName ? 'Apagar do palco e o arquivo das Gravações' : 'Remover do palco e apagar o arquivo', () => deleteMediaFile(s), 'danger');
    if (s.extraCam) {
      add('⚙', 'Trocar câmera, qualidade ou áudio', () => extras.camDialog(s.id), 'act-sec');
      add(icons.trash, 'Remover câmera', () => extras.removeCam(s.id), 'danger');
    }
    if (s.ingest) {
      add('⚙', 'Endereços e status das entradas RTMP/SRT', () => ingest.openPanel(), 'act-sec');
      add(icons.trash, 'Tirar dos bastidores (a entrada continua cadastrada)', () => removeSource(s.id), 'danger');
    }
    // Ações da miniatura: mostra as 3 principais e recolhe o resto num menu "⋮" (não estoura com botões extras).
    const MAX_ACT = 3;
    acts.replaceChildren(...actions.slice(0, MAX_ACT).map((a) => {
      const b = h(`<button class="btn ghost sm icon ${a.cls}" title="${a.title}">${a.icon}</button>`);
      b.onclick = (e) => { e.stopPropagation(); a.fn(); };
      return b;
    }));
    if (actions.length > MAX_ACT) {
      const more = h(`<button class="btn ghost sm icon" title="Mais ações">⋯</button>`);
      more.onclick = (e) => {
        e.stopPropagation();
        openTileActions(actions);
      };
      acts.append(more);
    }
  }

  // Miniaturas: botão de minimizar fica na barra de layouts acima do backstage + ordem persistente (arrastar reordena, como no vMix).
  let minBtn = $('#bs-min');
  if (!minBtn) {
    minBtn = h(`<button class="bs-min-btn" id="bs-min" title="Minimizar/expandir as miniaturas do backstage">${S.bsMin ? '▤' : '▁'}</button>`);
    minBtn.onclick = toggleBsMin;
  }
  minBtn.textContent = S.bsMin ? '▤' : '▁';
  box.classList.toggle('bs-min', S.bsMin);
  const layBox = $('#layouts');
  if (layBox && minBtn.parentElement !== layBox) layBox.append(minBtn);

  const ids = [...S.sources.keys()];
  const known = (Array.isArray(S.bsOrder) ? S.bsOrder : []).filter((id) => S.sources.has(id));
  for (const id of ids) if (!known.includes(id)) known.push(id);
  S.bsOrder = known;
  saveBsOrder();
  for (const id of known) {
    const el = tileEls.get(id);
    if (el) box.append(el);
  }

  // "＋ Câmera" sempre no fim dos bastidores
  let addTile = $('#add-cam-tile');
  if (!addTile) {
    addTile = h(`<button class="add-tile" id="add-cam-tile" title="Adicionar câmera: USB/captura deste computador ou celular pelo QR Code"><span class="add-ico">＋</span><span>Câmera</span></button>`);
    addTile.onclick = () => openAddCamera();
  }
  box.append(addTile);
  const all = [...S.guests.values()];
  const n = all.filter((g) => !g.cam).length;
  const nc = all.length - n;
  const gc = $('#guest-count');
  if (gc) gc.textContent = (n ? `${n} convidado${n > 1 ? 's' : ''} no estúdio` : 'Nenhum convidado') + (nc ? ` · ${nc} câmera${nc > 1 ? 's' : ''} remota${nc > 1 ? 's' : ''}` : '');
  switcher?.refresh();
}

// Atualizações frequentes: miniaturas, indicador de fala, medidores
let lastBsThumbT = 0;
function uiTick() {
  if (document.hidden) return;
  const inSwitcher = !!S.switcher;
  const showBackstage = !inSwitcher || !!document.querySelector('.studio.sw-bs');
  const now = performance.now();
  // Miniaturas são monitoração, não programa: ~6-8 fps e só quando o bastidor está visível.
  const thumbGap = inSwitcher ? 135 : 160;
  const canDrawThumb = showBackstage && now - lastBsThumbT >= thumbGap;
  if (canDrawThumb) lastBsThumbT = now;

  for (const [id, el] of tileEls) {
    const s = S.sources.get(id);
    if (!s) continue;
    // Só renderiza o canvas se o bastidor estiver visível e no intervalo de tempo
    if (showBackstage && el.offsetParent !== null && canDrawThumb) {
      const cv = el.querySelector('canvas');
      if (cv) {
        const ctx = cv.getContext('2d');
        const v = s.el;
        const isImg = v instanceof HTMLImageElement;
        const vw = isImg ? v.naturalWidth : v.videoWidth;
        const vh = isImg ? v.naturalHeight : v.videoHeight;
        if (!s.camOff && vw && (isImg || v.readyState >= 2)) {
          const contain = s.kind !== 'camera';
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, 320, 180);
          const fx = !contain && !isImg ? vfx?.frame(id, v) : null;
          if (fx) drawFxThumb(ctx, fx);
          else {
            const sc = contain ? Math.min(320 / vw, 180 / vh) : Math.max(320 / vw, 180 / vh);
            const dw = vw * sc;
            const dh = vh * sc;
            ctx.drawImage(v, (320 - dw) / 2, (180 - dh) / 2, dw, dh);
          }
        } else {
          ctx.fillStyle = '#151520';
          ctx.fillRect(0, 0, 320, 180);
          ctx.beginPath();
          ctx.arc(160, 90, 34, 0, Math.PI * 2);
          ctx.fillStyle = S.brand.color || '#7c3aed';
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = '700 26px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(initials(s.label), 160, 92);
        }
      }
    }
    const audioId = id === 'host:cam' ? 'host:mic' : s.kind === 'media' ? id : id + ':audio';
    el.classList.toggle('speaking', mixer.level(audioId) > 0.12);
  }
  meters?.tick();
  scenes?.render();
  if (tabOpen('audio')) audioPanel?.tick();
}

// desenha o quadro processado pelos efeitos (cover + foco/zoom do enquadramento automático)
function drawFxThumb(ctx, { img, w, h, focus }, W = 320, H = 180) {
  const sc = Math.max(W / w, H / h) * (focus?.z || 1);
  const cw = Math.min(w, W / sc);
  const ch = Math.min(h, H / sc);
  const sx = Math.max(0, Math.min(w - cw, (focus ? focus.x * w : w / 2) - cw / 2));
  const sy = Math.max(0, Math.min(h - ch, (focus ? focus.y * h : h / 2) - ch / 2));
  ctx.drawImage(img, sx, sy, cw, ch, 0, 0, W, H);
}

// =====================================================================
// Efeitos de vídeo por câmera (fundo virtual + enquadramento automático)
// =====================================================================
async function openFx(id) {
  const s = S.sources.get(id);
  if (!s) return;
  const persist = () => {
    if (!id.startsWith('host:')) return;
    const all = { ...(loadPrefs().fx || {}) };
    if (vfx.active(id)) all[id] = vfx.get(id);
    else delete all[id];
    savePrefs({ fx: all });
  };
  const bgBtns = [
    ['off', 'Nenhum'],
    ['blur', 'Desfocar'],
    ['image', 'Imagem'],
    ['color', 'Cor'],
  ];
  const fr = [
    ['wide', 'Aberto'],
    ['medium', 'Médio'],
    ['close', 'Fechado'],
  ];
  await modal(
    `<h3>✦ Efeitos de vídeo — ${esc(s.label || 'Câmera')}</h3>
     <div class="fx-prev"><canvas id="fx-cv" width="480" height="270"></canvas><span class="fx-st" id="fx-st"></span></div>
     <div class="fx-sec"><div class="fx-lbl">Fundo</div>
       <div class="seg" id="fx-bg">${bgBtns.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
       <div class="fx-opt" data-for="blur"><label class="fx-range"><span>Intensidade do desfoque</span><input type="range" id="fx-blur" min="0" max="100"><b id="fx-blur-v"></b></label></div>
       <div class="fx-opt" data-for="image"><div class="fx-gal" id="fx-gal"></div></div>
       <div class="fx-opt" data-for="color"><label class="fx-range"><span>Cor do fundo</span><input type="color" id="fx-color"></label></div>
     </div>
     <div class="fx-sec">
       <label class="check" style="justify-content:space-between"><span>Enquadramento automático (segue o rosto)</span><span class="switch"><input type="checkbox" id="fx-track"><span></span></span></label>
       <div class="seg" id="fx-fr" style="margin-top:8px">${fr.map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
     </div>
     <p class="fx-hint">Tudo roda neste computador, sem internet. Para manter o estúdio leve, use efeitos em até 2–3 câmeras ao mesmo tempo.</p>
     <div class="row" style="justify-content:space-between;margin-top:12px;gap:8px"><button class="btn ghost" id="fx-reset">Desligar efeitos</button><button class="btn primary" data-close>Pronto</button></div>`,
    {
      onMount: (m) => {
        const cv = $('#fx-cv', m);
        const cx = cv.getContext('2d');
        const st = $('#fx-st', m);
        const apply = (patch) => {
          const p = vfx.set(id, patch);
          sync();
          p.then(() => {
            persist();
            renderTiles();
          }).catch((e) => toast('Efeitos: ' + (e?.message || 'falha ao carregar o motor'), 'err'));
          sync();
        };
        const sync = () => {
          const c = vfx.get(id);
          $$('#fx-bg button', m).forEach((b) => b.classList.toggle('active', b.dataset.k === c.bg));
          $$('.fx-opt', m).forEach((o) => (o.hidden = o.dataset.for !== c.bg));
          $('#fx-blur', m).value = c.blur;
          $('#fx-blur-v', m).textContent = c.blur + '%';
          $('#fx-color', m).value = c.color;
          $('#fx-track', m).checked = c.track;
          $$('#fx-fr button', m).forEach((b) => {
            b.classList.toggle('active', b.dataset.k === c.framing);
            b.disabled = !c.track;
          });
          $$('#fx-gal .fx-img', m).forEach((t) => t.classList.toggle('active', t.dataset.url === c.image));
        };
        const gallery = () => {
          const c = vfx.get(id);
          const list = [...FX_BACKGROUNDS];
          if (c.image && !list.some((b) => b.url === c.image)) list.push({ url: c.image, label: 'Sua imagem' });
          $('#fx-gal', m).innerHTML =
            list.map((b) => `<button class="fx-img" data-url="${esc(b.url)}" title="${esc(b.label)}" style="background-image:url('${esc(b.url)}')"></button>`).join('') +
            `<button class="fx-img add" id="fx-up" title="Enviar imagem do computador">${icons.plus}</button>`;
          $$('#fx-gal .fx-img[data-url]', m).forEach((t) => (t.onclick = () => apply({ image: t.dataset.url })));
          $('#fx-up', m).onclick = async () => {
            const f = await pickFile('image/*');
            if (!f) return;
            try {
              const url = await readImage(f, 1280, 'image/jpeg');
              apply({ image: url });
              gallery();
              sync();
            } catch {
              toast('Não foi possível abrir a imagem', 'err');
            }
          };
        };
        gallery();
        $$('#fx-bg button', m).forEach((b) => (b.onclick = () => apply({ bg: b.dataset.k })));
        $$('#fx-fr button', m).forEach((b) => (b.onclick = () => apply({ framing: b.dataset.k })));
        $('#fx-blur', m).oninput = (e) => apply({ blur: +e.target.value });
        $('#fx-color', m).oninput = (e) => apply({ color: e.target.value });
        $('#fx-track', m).onchange = (e) => apply({ track: e.target.checked });
        $('#fx-reset', m).onclick = () => apply({ bg: 'off', track: false });
        sync();
        // prévia ao vivo (para sozinha quando o modal fecha)
        const loop = () => {
          if (!cv.isConnected) return;
          const src = S.sources.get(id);
          const v = src?.el;
          cx.fillStyle = '#000';
          cx.fillRect(0, 0, 480, 270);
          if (!src?.camOff && v && v.videoWidth && v.readyState >= 2) {
            const fx = vfx.frame(id, v);
            drawFxThumb(cx, fx || { img: v, w: v.videoWidth, h: v.videoHeight, focus: null }, 480, 270);
          } else {
            cx.fillStyle = '#8a8aa0';
            cx.font = '600 15px Inter, sans-serif';
            cx.textAlign = 'center';
            cx.fillText('Câmera desligada — ligue para ver a prévia', 240, 140);
          }
          st.textContent = vfx.status === 'loading' ? 'Carregando motor de efeitos…' : vfx.status === 'error' ? 'Erro: ' + vfx.error : '';
          st.hidden = !st.textContent;
          requestAnimationFrame(loop);
        };
        loop();
      },
    },
  );
  renderTiles();
}

// Modal de enquadramento por fonte: vale para câmera, tela, mídia, imagem e entradas.
// O programa atualiza ao vivo; ao cancelar, o ajuste anterior volta.
async function openSourceAdjust(id) {
  const s = S.sources.get(id);
  if (!s) return;
  const fallbackFit = ['screen', 'media', 'image'].includes(s.kind) ? 'contain' : 'cover';
  const old = s.adjust ? normalizeAdjust(s.adjust) : null;
  const draft = old ? structuredClone(old) : normalizeAdjust({ fit: fallbackFit });
  const fmtPct = (v) => `${Math.round(Number(v) * 100)}%`;
  const fmtPan = (v) => `${Number(v) > 0 ? '+' : ''}${Math.round(Number(v) * 100)}%`;
  const applyDraft = () => setSourceAdjust(s, normalizeAdjust(draft));
  let saved = false;
  await modal(
    `<div class="srcadj">
      <header class="srcadj-head">
        <span class="srcadj-ico">${icons.crop}</span>
        <div class="srcadj-heading">
          <span class="srcadj-eyebrow">ENQUADRAMENTO DA FONTE</span>
          <h3>${esc(s.label || 'Fonte')}</h3>
          <p>Posição, zoom e corte dentro do espaço do layout.</p>
        </div>
        <span class="srcadj-live"><i></i>PRÉVIA AO VIVO</span>
      </header>
      <div class="srcadj-layout">
        <section class="srcadj-preview">
          <div class="srcadj-monitor">
            <canvas id="sa-cv" width="640" height="360"></canvas>
            <div class="srcadj-guides" aria-hidden="true"></div>
            <div class="srcadj-hud"><span>PREVIEW</span><b>${esc(s.label || 'Fonte')}</b><em>16:9</em></div>
            <span class="srcadj-nosignal" id="sa-st" hidden></span>
          </div>
          <p class="srcadj-tip"><b>Dica:</b> o corte é aplicado antes do enquadramento. O programa atualiza enquanto você ajusta.</p>
          <div class="srcadj-presets">
            <span>Atalhos</span>
            <button type="button" data-preset="fill">Preencher</button>
            <button type="button" data-preset="contain">Conter</button>
            <button type="button" data-preset="center">Centralizar</button>
          </div>
        </section>
        <section class="srcadj-panel">
          <div class="srcadj-group">
            <div class="srcadj-group-head"><span>01</span><div><b>Enquadramento</b><small>Como a fonte ocupa o espaço</small></div></div>
            <div class="srcadj-seg" id="sa-fit">
              <button type="button" data-v="cover" title="Preenche o espaço (pode cortar as bordas)">Preencher</button>
              <button type="button" data-v="contain" title="Mostra a fonte inteira (pode deixar tarjas)">Conter</button>
            </div>
          </div>
          <div class="srcadj-group">
            <div class="srcadj-group-head"><span>02</span><div><b>Movimento</b><small>Zoom e posição da imagem</small></div></div>
            <div class="srcadj-grid">
              <label class="srcadj-range"><span>Zoom <b id="sa-zoom-v"></b></span><input type="range" id="sa-zoom" min="100" max="300" step="1"></label>
              <label class="srcadj-range"><span>Posição X <b id="sa-x-v"></b></span><input type="range" id="sa-x" min="-100" max="100" step="1"></label>
              <label class="srcadj-range"><span>Posição Y <b id="sa-y-v"></b></span><input type="range" id="sa-y" min="-100" max="100" step="1"></label>
            </div>
          </div>
          <div class="srcadj-group">
            <div class="srcadj-group-head"><span>03</span><div><b>Corte da fonte</b><small>Recorte as quatro bordas</small></div></div>
            <div class="srcadj-grid srcadj-grid-2">
              <label class="srcadj-range"><span>Topo <b id="sa-ct-v"></b></span><input type="range" id="sa-ct" min="0" max="45" step="1"></label>
              <label class="srcadj-range"><span>Direita <b id="sa-cr-v"></b></span><input type="range" id="sa-cr" min="0" max="45" step="1"></label>
              <label class="srcadj-range"><span>Baixo <b id="sa-cb-v"></b></span><input type="range" id="sa-cb" min="0" max="45" step="1"></label>
              <label class="srcadj-range"><span>Esquerda <b id="sa-cl-v"></b></span><input type="range" id="sa-cl" min="0" max="45" step="1"></label>
            </div>
          </div>
        </section>
      </div>
      <footer class="srcadj-foot">
        <button class="btn ghost" id="sa-reset">Restaurar</button>
        <span class="srcadj-foot-hint">Salvo por fonte · alterações no programa em tempo real</span>
        <button class="btn" data-close>Cancelar</button>
        <button class="btn primary" id="sa-apply" data-save>Aplicar ajuste</button>
      </footer>
    </div>`,
    {
      onMount: (m, close) => {
        const q = (x) => m.querySelector(x);
        const cv = q('#sa-cv');
        const cx = cv.getContext('2d');
        const sync = () => {
          const a = draft;
          for (const b of m.querySelectorAll('#sa-fit button')) b.classList.toggle('active', b.dataset.v === a.fit);
          q('#sa-zoom').value = Math.round(a.zoom * 100);
          q('#sa-x').value = Math.round(a.x * 100);
          q('#sa-y').value = Math.round(a.y * 100);
          q('#sa-ct').value = Math.round(a.crop.t * 100);
          q('#sa-cr').value = Math.round(a.crop.r * 100);
          q('#sa-cb').value = Math.round(a.crop.b * 100);
          q('#sa-cl').value = Math.round(a.crop.l * 100);
          q('#sa-zoom-v').textContent = fmtPct(a.zoom);
          q('#sa-x-v').textContent = fmtPan(a.x);
          q('#sa-y-v').textContent = fmtPan(a.y);
          q('#sa-ct-v').textContent = fmtPct(a.crop.t);
          q('#sa-cr-v').textContent = fmtPct(a.crop.r);
          q('#sa-cb-v').textContent = fmtPct(a.crop.b);
          q('#sa-cl-v').textContent = fmtPct(a.crop.l);
        };
        const set = (k, v) => { draft[k] = v; applyDraft(); };
        const setCrop = (k, v) => { draft.crop[k] = v; applyDraft(); };
        for (const b of m.querySelectorAll('#sa-fit button')) {
          b.onclick = () => { draft.fit = b.dataset.v; applyDraft(); sync(); };
        }
        for (const b of m.querySelectorAll('[data-preset]')) {
          b.onclick = () => {
            if (b.dataset.preset === 'center') {
              draft.x = 0;
              draft.y = 0;
            } else {
              draft.fit = b.dataset.preset;
              draft.zoom = 1;
              draft.x = 0;
              draft.y = 0;
            }
            applyDraft();
            sync();
          };
        }
        q('#sa-zoom').oninput = (e) => { set('zoom', +e.target.value / 100); q('#sa-zoom-v').textContent = fmtPct(draft.zoom); };
        q('#sa-x').oninput = (e) => { set('x', +e.target.value / 100); q('#sa-x-v').textContent = fmtPan(draft.x); };
        q('#sa-y').oninput = (e) => { set('y', +e.target.value / 100); q('#sa-y-v').textContent = fmtPan(draft.y); };
        for (const [k, el, out] of [['t', '#sa-ct', '#sa-ct-v'], ['r', '#sa-cr', '#sa-cr-v'], ['b', '#sa-cb', '#sa-cb-v'], ['l', '#sa-cl', '#sa-cl-v']]) {
          q(el).oninput = (e) => { setCrop(k, +e.target.value / 100); q(out).textContent = fmtPct(draft.crop[k]); };
        }
        q('#sa-reset').onclick = () => {
          Object.assign(draft, normalizeAdjust({ fit: fallbackFit }));
          draft.crop = { l: 0, r: 0, t: 0, b: 0 };
          applyDraft();
          sync();
        };
        q('#sa-apply').onclick = () => {
          const map = { ...(S.brand.sourceAdjust || {}), [id]: normalizeAdjust(draft) };
          S.brand.sourceAdjust = map;
          saveStudio();
          saved = true;
          close(true);
        };
        sync();
        applyDraft();
        const loop = () => {
          if (!cv.isConnected) return;
          const src = S.sources.get(id);
          const el = src?.el;
          const vw = el instanceof HTMLImageElement ? el.naturalWidth : el?.videoWidth;
          const vh = el instanceof HTMLImageElement ? el.naturalHeight : el?.videoHeight;
          cx.fillStyle = '#05050a';
          cx.fillRect(0, 0, cv.width, cv.height);
          if (el && vw > 0 && (el instanceof HTMLImageElement || el.readyState >= 2)) {
            drawFramed(cx, el, 0, 0, cv.width, cv.height, vw, vh, src.adjust);
            q('#sa-st').textContent = '';
            q('#sa-st').hidden = true;
          } else {
            cx.fillStyle = '#8a8aa0';
            cx.font = '600 16px Inter, sans-serif';
            cx.textAlign = 'center';
            cx.textBaseline = 'middle';
            cx.fillText(src?.kind === 'media' && src.camOff ? 'Fonte somente de áudio' : 'Sem sinal — a prévia aparece quando a fonte carregar', cv.width / 2, cv.height / 2);
            q('#sa-st').textContent = '';
            q('#sa-st').hidden = true;
          }
          requestAnimationFrame(loop);
        };
        loop();
      },
    },
  );
  if (!saved) setSourceAdjust(s, old);
}

// =====================================================================
// Controles locais
// =====================================================================
function renderControls() {
  const mic = $('#c-mic');
  if (!mic) return; // controles ainda não montados (addVideoSource roda antes do DOM em alguns fluxos)
  mic.classList.toggle('off', !S.local.micOn);
  mic.querySelector('.ctrl-ico').innerHTML = S.local.micOn ? icons.mic : icons.micOff;
  const cam = $('#c-cam');
  cam.classList.toggle('off', !S.local.camOn);
  cam.querySelector('.ctrl-ico').innerHTML = S.local.camOn ? icons.cam : icons.camOff;
  $('#c-screen').classList.toggle('active', !!S.local.screen && S.local.screenMode !== 'tab');
  $('#c-tab').classList.toggle('active', !!S.local.screen && S.local.screenMode === 'tab');
  // cursor/nomes desligados são uma preferência, não um alerta: estilo neutro (vermelho é só para mic/câmera e REC/AO VIVO)
  const ccSup = cursorSupported();
  $('#c-cursor').classList.toggle('opt-off', ccSup && !cursorOn());
  $('#c-cursor').querySelector('span:last-child').textContent = ccSup ? (cursorOn() ? 'Cursor' : 'Sem cursor') : 'Cursor*';
  $('#c-cursor').title = ccSup
    ? 'Mostrar/ocultar o cursor do mouse ao compartilhar tela ou aba'
    : 'Este navegador não permite ocultar o cursor da captura de tela; compartilhe uma aba/janela ou use o OBS';
  const names = $('#c-names');
  if (names) {
    const p = !!S.brand.showNames;
    const v = S.brand.showMediaNames !== false;
    names.classList.toggle('opt-off', !p && !v);
    names.setAttribute('aria-pressed', String(p || v));
    names.querySelector('span:last-child').textContent = p && v ? 'Nomes' : p ? 'Só pessoas' : v ? 'Só vídeos' : 'Sem nomes';
  }
}

// Tela cheia: PROGRAMA, PRÉVIA ou a mesa inteira (PRÉVIA | transição | PROGRAMA + fontes, como o multiview do vMix).
// Os botões têm data-fs; F = programa, Shift+F = mesa inteira (no modo Estúdio vira o programa).
const FS_TARGETS = { program: () => $('#program'), pvw: () => $('.sw-pvw'), wall: () => $('.stage-wrap'), studio: () => $('.studio') };
async function fsToggle(kind) {
  const el = FS_TARGETS[kind]?.();
  if (!el) return;
  const entering = !isFull(el);
  await toggleFull(el);
  // na tela cheia nativa o próprio navegador avisa "Esc para sair" (e o toast ficaria atrás do elemento)
  if (entering && isFull(el) && !document.fullscreenElement) toast('Tela cheia: toque no botão do canto ou em Voltar para sair');
}
function bindFullscreen() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-fs]');
    if (!b || !b.closest('.studio')) return;
    e.stopPropagation();
    fsToggle(b.dataset.fs);
  });
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('.modal-back')) return;
    e.preventDefault();
    fsToggle(e.shiftKey && S.switcher ? 'wall' : 'program');
  });
  // o ícone de cada botão mostra se aquele alvo está em tela cheia; a mesa em tela cheia ganha .fs-wall no estúdio
  onFullChange((el) => {
    document.querySelectorAll('.studio [data-fs]').forEach((b) => {
      const on = !!el && FS_TARGETS[b.dataset.fs]?.() === el;
      b.classList.toggle('on', on);
      b.innerHTML = (on ? icons.shrink : icons.expand) + (b.dataset.label ? `<span>${esc(on ? 'Sair' : b.dataset.label)}</span>` : '');
      b.title = on ? 'Sair da tela cheia (Esc)' : b.dataset.tip || b.title;
    });
    $('.studio')?.classList.toggle('fs-wall', !!el && el === FS_TARGETS.wall());
  });
  document.querySelectorAll('.studio [data-fs]').forEach((b) => (b.dataset.tip = b.title));
}

function bindUI() {
  $('#c-mic').onclick = () => {
    S.local.micOn = !S.local.micOn;
    mixer.setMuted('host:mic', !S.local.micOn, { save: false });
    savePrefs({ micOn: S.local.micOn });
    renderControls();
  };
  $('#c-cam').onclick = async () => {
    S.local.camOn = !S.local.camOn;
    if (S.local.camOn && !S.local.cam) {
      try {
        // Se o lobby ainda está abrindo a câmera, aproveita a mesma promessa em vez de abrir outra
        // getUserMedia (a segunda chamada pode conflitar com a permissão pendente).
        if (S.local.media) {
          const m = await S.local.media.catch(() => null);
          if (m?.camStream) S.local.cam = m.camStream;
        }
        if (!S.local.cam) S.local.cam = await getCamera(loadPrefs().camId, loadPrefs().quality);
      } catch (e) {
        S.local.camOn = false;
        toast('Câmera indisponível: ' + e.message, 'err');
      }
    }
    S.local.cam?.getVideoTracks().forEach((t) => (t.enabled = S.local.camOn));
    addVideoSource('host:cam', S.local.cam, { camOff: !S.local.camOn });
    savePrefs({ camOn: S.local.camOn });
    renderControls();
  };
  $('#c-cam-recover').onclick = () => reopenHostCamera();
  // Atalhos globais de Replay & VAR: funcionam com o foco no estúdio e mandam o comando para o console.
  window.addEventListener('keydown', (e) => {
    if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('.modal-back')) return;
    const isF = e.code === 'F8' || e.code === 'F9' || e.code === 'F10';
    const isSave = e.code === 'KeyS' && (e.ctrlKey || e.metaKey) && e.altKey;
    if (!isF && !isSave) return;
    e.preventDefault();
    if (!replayEngine) return;
    if (isSave) {
      if (!replayEngine.sendCommand({ action: 'save' })) toast('Abra o console Replay & VAR para salvar o lance', 'info');
      return;
    }
    const secs = e.code === 'F8' ? 5 : e.code === 'F9' ? 10 : e.shiftKey ? 30 : 15;
    if (!replayEngine.sendCommand({ action: 'replay', seconds: secs })) toast('Abra o console Replay & VAR para usar F8/F9/F10', 'info');
  });
  $('#c-screen').onclick = () => (S.local.screen ? stopScreen() : startScreen('screen'));
  $('#c-tab').onclick = () => (S.local.screen ? stopScreen() : startScreen('tab'));
  $('#c-cursor').onclick = async () => {
    if (!cursorSupported()) {
      toast('Este navegador não permite esconder o cursor na captura de tela. Compartilhe uma aba/janela ou capture pelo OBS.', 'info');
      return;
    }
    const on = !cursorOn();
    const live = await setCursor(on, S.local.screen);
    renderControls();
    toast(on ? 'Cursor do mouse visível' : 'Cursor do mouse oculto', live || !S.local.screen ? 'ok' : undefined);
    if (!live) toast('Para aplicar nesta captura, pare e compartilhe novamente.');
  };
  // clique = liga/desliga TODOS os nomes (pessoas e vídeos juntos); a setinha escolhe só um dos grupos
  $('#c-names').onclick = () => {
    const any = !!S.brand.showNames || S.brand.showMediaNames !== false;
    setBrand({ showNames: !any, showMediaNames: !any });
    toast(any ? 'Nomes ocultos (pessoas e vídeos)' : 'Nomes na tela (pessoas e vídeos)');
  };
  $('#c-names-opt').onclick = (e) => {
    e.stopPropagation();
    $('#names-menu')?.remove();
    const r = e.currentTarget.getBoundingClientRect();
    const m = h(`<div id="names-menu" class="names-menu" style="left:${Math.max(8, r.left - 60)}px;bottom:${innerHeight - r.top + 8}px">
      <label class="check"><input type="checkbox" id="nm-p" ${S.brand.showNames ? 'checked' : ''}><span>Nomes das pessoas</span></label>
      <label class="check"><input type="checkbox" id="nm-v" ${S.brand.showMediaNames !== false ? 'checked' : ''}><span>Nomes dos vídeos</span></label>${CAN_SHARE_SCREEN ? `<label class="check"><input type="checkbox" id="nm-c" ${cursorOn() ? 'checked' : ''}><span>Cursor do mouse (ao compartilhar tela)</span></label>` : ''}</div>`);
    document.body.append(m);
    $('#nm-p', m).onchange = (ev) => setBrand({ showNames: ev.target.checked });
    $('#nm-v', m).onchange = (ev) => setBrand({ showMediaNames: ev.target.checked });
    const nc = $('#nm-c', m);
    if (nc) nc.onchange = () => $('#c-cursor').onclick();
    const close = (ev) => {
      if (m.contains(ev.target)) return;
      m.remove();
      document.removeEventListener('pointerdown', close, true);
    };
    setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
  };
  $('#c-media').onclick = () => {
    switchTab('media');
    $('#media-file').click();
  };
  $('#media-file').onchange = (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    files.forEach(addMediaFile);
  };
  $('#c-invite').onclick = showInvite;
  $('#c-settings').onclick = showSettings;
  $('#c-leave').onclick = async () => {
    // `S.live` também fica true quando só está gravando (compat); a mensagem precisa ser honesta.
    const onAir = !!(S.streaming || S.vlive);
    const recording = !!S.recording;
    if ((onAir || recording) && !(await confirmDialog(
      `Você está ${onAir ? 'ao vivo' : 'gravando'}.\n\nEncerrar e sair do estúdio?`,
      { ok: onAir ? 'Encerrar e sair' : 'Parar e sair', danger: true },
    ))) return;
    if (S.live) broadcaster?.stop();
    if (S.vlive) vBroadcaster?.stop();
    sig?.close();
    setTimeout(() => (location.href = '/'), S.live || S.vlive ? 1500 : 0);
  };
  const syncPanelState = () => {
    const open = $('.studio')?.classList.contains('panel-open');
    const b = $('#btn-panel');
    if (b) {
      b.setAttribute('aria-expanded', String(!!open));
      b.title = open ? 'Fechar o painel de controle' : 'Abrir painel de controle (mídia, banners, jornal...)';
    }
  };
  $('#btn-panel').onclick = () => { $('.studio').classList.toggle('panel-open'); syncPanelState(); };
  const btnModeStudio = $('#btn-mode-studio');
  if (btnModeStudio) btnModeStudio.onclick = () => { if (S.switcher) switcher.toggle(); };
  $('#btn-switcher').onclick = () => switcher.toggle();
  const btnAutoPlay = $('#btn-autoplay');
  if (btnAutoPlay) {
    btnAutoPlay.onclick = () => {
      const next = !autoPlayMediaEnabled();
      setBrand({ autoPlayMedia: next });
      toast(next
        ? 'Auto play ligado — vídeos começam ao entrar no PGM/palco (um por vez).'
        : 'Auto play desligado — use Tocar manualmente.', 'info');
    };
    renderAutoPlayBtn();
  }
  bindFullscreen();
  $('.studio').addEventListener('click', (ev) => {
    if (ev.target === ev.currentTarget) { ev.currentTarget.classList.remove('panel-open'); syncPanelState(); }
  });
  $('#btn-live').onclick = () => (S.streaming ? stopLive() : openGoLive());
  $('#btn-record').onclick = () => (S.recording ? stopRecord() : openRecordModal());
  $$('.tab[data-tab]').forEach((t) => (t.onclick = () => switchTab(t.dataset.tab)));
  $$('.grp[data-group]').forEach(
    (g) =>
      (g.onclick = () => {
        const st = $('.studio');
        // modo ícones: clicar no ícone da seção já aberta fecha o painel flutuante
        if (st.classList.contains('side-fly') && g.classList.contains('active')) return closeSideFly();
        openSideTab(lastTabOf[g.dataset.group] || TAB_GROUPS.find((x) => x.id === g.dataset.group).tabs[0][0]);
      }),
  );
  $('#btn-side-mini').onclick = () => setSideMini(!$('.studio').classList.contains('side-mini'));
  $('#side-pin').onclick = () => setSideMini(false);
  $('#side-fly-close').onclick = closeSideFly;
  // painel flutuante fecha com Esc ou clicando fora dele (como um menu)
  document.addEventListener('pointerdown', (e) => {
    if (!$('.studio')?.classList.contains('side-fly')) return;
    if (e.target.closest?.('.side, .modal-back, .toast, .menu, .pop')) return;
    closeSideFly();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('.studio')?.classList.contains('side-fly') && !document.querySelector('.modal-back')) closeSideFly();
  });
  $('#layouts').onclick = (e) => {
    const act = e.target.closest('[data-act]');
    if (act) return editLayout(act.dataset.act === 'edit' ? S.layout : null);
    const b = e.target.closest('[data-layout]');
    if (!b) return;
    setLayout(b.dataset.layout);
  };
  $('#layouts').ondblclick = (e) => {
    const b = e.target.closest('[data-layout^="c-"]');
    if (b) editLayout(b.dataset.layout);
  };
}

async function editLayout(id) {
  const list = [...(S.brand.customLayouts || [])];
  const cur = id ? list.find((c) => c.id === id) : null;
  const res = await openLayoutEditor(cur);
  if (!res) return;
  if (res.action === 'delete') {
    setBrand({ customLayouts: list.filter((c) => c.id !== id) });
    if (S.layout === id) setLayout('grid');
    else renderLayouts();
    return;
  }
  const i = list.findIndex((c) => c.id === res.layout.id);
  if (i >= 0) list[i] = res.layout;
  else list.push(res.layout);
  setBrand({ customLayouts: list.slice(-12) });
  setLayout(res.layout.id);
  toast(`Layout "${res.layout.label}" salvo`, 'ok');
}

// troca de layout do modo Ritmo: não grava no estúdio (o Diretor restaura o layout original ao desligar)
function softLayout(l) {
  if (S.layout === l) return;
  if (!LAYOUTS.some((x) => x.id === l) && !(S.brand.customLayouts || []).some((c) => c.id === l)) return;
  S.layout = l;
  comp.layout = l;
  renderLayouts();
}
function setLayout(l) {
  if (!LAYOUTS.some((x) => x.id === l) && !(S.brand.customLayouts || []).some((c) => c.id === l)) return;
  S.layout = l;
  comp.layout = S.layout;
  S.brand.layout = S.layout;
  if (S.solo) setSolo(null);
  renderLayouts();
  saveStudio();
}

// ---- Co-host: convidados promovidos que editam a live em tempo real ----
function toggleCohost(id) {
  const g = S.guests.get(id);
  if (!g) return;
  g.cohost = !g.cohost;
  sig.send({ type: 'set-cohost', id, on: g.cohost });
  toast(g.cohost ? `${g.name} agora é co-host` : `${g.name} não é mais co-host`, 'ok');
  renderTiles();
}

function runCohostCmd(m) {
  // controle remoto (QR) já foi autenticado pela chave do link no servidor
  const g = m.remote ? { name: m.name || 'Controle', cohost: true } : S.guests.get(m.from);
  if (!g?.cohost) return; // autorização também no host
  const c = m.cmd || {};
  const src = (id) => S.sources.get(id)?.label || 'uma fonte';
  let what = '';
  switch (c.op) {
    case 'layout':
      setLayout(c.layout);
      what = 'trocou o layout';
      break;
    case 'scene': {
      const i = Number(c.index);
      if (Number.isInteger(i) && i >= 0 && i < 6) scenes?.apply(i);
      what = 'aplicou uma cena';
      break;
    }
    case 'stage':
      if (S.sources.has(c.id) && S.stage.includes(c.id) !== !!c.on) toggleStage(c.id);
      what = c.on ? `colocou ${src(c.id)} no palco` : `tirou ${src(c.id)} do palco`;
      break;
    case 'solo':
      if (c.id ? S.sources.has(c.id) && S.solo !== c.id : S.solo) setSolo(c.id);
      what = c.id ? 'ativou o solo' : 'desativou o solo';
      break;
    case 'banner':
      if (S.activeBanner !== c.id && S.banners.some((b) => b.id === c.id)) toggleBanner(c.id);
      else if (S.activeBanner === c.id) toggleBanner(c.id);
      what = 'trocou o banner';
      break;
    case 'hide-banner':
      if (S.activeBanner) toggleBanner(S.activeBanner);
      what = 'ocultou o banner';
      break;
    case 'quick-banner':
      if (S.activeBanner) toggleBanner(S.activeBanner);
      toggleBanner('cohost:quick', { title: c.title, subtitle: c.subtitle, style: 'bar', pos: 'bl', dur: 8 });
      what = 'enviou um banner';
      break;
    case 'message': {
      const was = messages?.airId === c.id;
      if (messages?.toggleExternal?.(c.id)) what = was ? 'tirou uma mensagem do ar' : 'colocou uma mensagem no ar';
      break;
    }
    case 'mic':
      if (S.guests.has(c.to)) sig.send({ type: 'control', to: c.to, action: c.action });
      what = c.action === 'mute' ? 'silenciou um microfone' : 'pediu para ativar um microfone';
      break;
    default:
      return;
  }
  toast(`${g.name} (co-host) ${what}`);
}

let lastCohostSnap = '';
function cohostSync() {
  if (!sig || ![...S.guests.values()].some((g) => g.cohost)) return;
  const snap = {
    layout: S.layout,
    // lista completa com ícones: o painel do co-host mostra miniaturas iguais às do estúdio
    allLayouts: true,
    layouts: [...LAYOUTS.map((l) => ({ id: l.id, label: l.label, icon: l.icon })), ...(S.brand.customLayouts || []).map((c) => ({ id: c.id, label: c.label, icon: slotsIcon(c.slots) }))],
    solo: S.solo || null,
    stage: [...S.stage],
    live: !!S.live,
    activeBanner: S.activeBanner || null,
    banners: S.banners.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle })),
    messages: (messages?.items?.() || [])
      .filter((m) => m.text || m.audio)
      .slice(0, 6)
      .map((m) => ({ id: m.id, name: m.name || '', text: String(m.text || '').slice(0, 120), audio: !!m.audio, duration: m.dur || 0, source: m.source || 'public', air: messages.airId === m.id })),
    items: [...S.sources.values()].map((s) => ({ id: s.id, label: s.label || '', kind: s.kind, ownerId: s.ownerId, micOn: s.micOn, camOff: !!s.camOff })),
  };
  const j = JSON.stringify(snap);
  if (j === lastCohostSnap) return;
  lastCohostSnap = j;
  sig.send({ type: 'cohost-state', state: snap });
}

function renderLayouts() {
  const box = $('#layouts');
  if (!box) return;
  const custom = S.brand.customLayouts || [];
  const btn = (l) => `<button class="layout-btn" data-layout="${l.id}" title="${esc(l.label)}${l.id.startsWith('c-') ? ' (duplo clique para editar)' : ''}"><svg viewBox="0 0 48 28">${l.icon}</svg></button>`;
  box.innerHTML =
    LAYOUTS.map(btn).join('') +
    (custom.length ? '<i class="lay-sep"></i>' : '') +
    custom.map((c) => btn({ id: c.id, label: c.label, icon: slotsIcon(c.slots) })).join('') +
    '<button class="layout-btn add" data-act="new" title="Criar layout personalizado">＋</button>' +
    (S.layout.startsWith('c-') ? '<button class="layout-btn add" data-act="edit" title="Editar o layout atual">✎</button>' : '');
  $$('.layout-btn[data-layout]').forEach((b) => b.classList.toggle('active', b.dataset.layout === S.layout));
  const minBtn = $('#bs-min');
  if (minBtn) box.append(minBtn);
}

async function startScreen(mode = 'screen') {
  try {
    await mixer.resume();
    const stream = mode === 'tab' ? await getTab() : await getScreen();
    S.local.screen = stream;
    S.local.screenMode = mode;
    const v = stream.getVideoTracks()[0];
    v.contentHint = mode === 'tab' ? 'motion' : 'detail';
    v.onended = stopScreen;
    const surface = v?.getSettings?.()?.displaySurface || (mode === 'tab' ? 'browser' : 'monitor');
    const isWindow = surface === 'window';
    let winLabel = isWindow
      ? (v.label ? v.label.replace(/^window:/i, '').trim() : 'Janela')
      : `${mode === 'tab' ? 'Aba' : 'Tela'} de ${S.local.name}`;
    addVideoSource('host:screen', stream, {
      kind: 'screen',
      surface,
      isWindow,
      label: winLabel,
      ownerId: 'host',
    });

    const attachScreenAudio = () => {
      const aTracks = stream.getAudioTracks();
      if (aTracks.length) {
        mixer.addStream('host:screen:audio', stream, { ownerId: 'host', stageKey: 'host:screen', monitor: false });
        aTracks[0].onended = () => {
          if (!S.local.screenAudioAux) mixer.remove('host:screen:audio');
          renderAudioPanel();
        };
        aTracks[0].onunmute = () => {
          renderAudioPanel();
        };
      } else if (!S.local.screenAudioAux) {
        mixer.remove('host:screen:audio');
      }
      renderAudioPanel();
    };
    attachScreenAudio();
    stream.onaddtrack = attachScreenAudio;
    stream.onremovetrack = attachScreenAudio;

    setStage(['host:screen', ...S.stage]);
    if (S.layout === 'grid' || S.layout === 'split') {
      S.layout = 'sidebar';
      comp.layout = S.layout;
      renderLayouts();
    }
  } catch (e) {
    if (e.name !== 'NotAllowedError') toast('Falha ao compartilhar tela: ' + e.message, 'err');
  }
  renderControls();
}

async function captureScreenAudioLoopback() {
  try {
    toast('Selecione "Tela inteira" e marque "Compartilhar áudio do sistema" para vincular o áudio do computador.', 'info', 7000);
    const audioStream = await navigator.mediaDevices.getDisplayMedia({
      video: { width: 320, height: 180, frameRate: 5 },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        systemAudio: 'include',
      },
      systemAudio: 'include',
    });
    const aTracks = audioStream.getAudioTracks();
    if (!aTracks.length) {
      audioStream.getTracks().forEach((t) => t.stop());
      toast('Nenhum áudio detectado. Marque a caixinha "Compartilhar áudio do sistema".', 'warn', 5000);
      return false;
    }
    // Não para o vídeo auxiliar: no Chromium isso pode encerrar também a trilha de áudio do sistema.
    // Só o desativa (frames pretos a 5 fps custam quase nada).
    audioStream.getVideoTracks().forEach((t) => (t.enabled = false));

    if (S.local.screenAudioAux) {
      S.local.screenAudioAux.getTracks().forEach((t) => t.stop());
    }
    S.local.screenAudioAux = audioStream;

    await mixer.resume();
    // o mixer recebe um stream só com o áudio (evita o elemento de mídia segurar a trilha de vídeo)
    mixer.addStream('host:screen:audio', new MediaStream([aTracks[0]]), { ownerId: 'host', stageKey: 'host:screen', monitor: false });
    aTracks[0].onended = () => {
      detachScreenAudio();
    };
    setTimeout(() => {
      if (S.local.screenAudioAux === audioStream && aTracks[0].readyState === 'ended') toast('A captura do áudio do computador foi encerrada. Tente de novo.', 'warn');
    }, 1500);
    renderAudioPanel();
    toast('Áudio do computador vinculado à janela com sucesso!', 'ok');
    return true;
  } catch (e) {
    if (e.name !== 'NotAllowedError') toast('Não foi possível capturar o áudio: ' + e.message, 'err');
    return false;
  }
}

async function attachDeviceAudioToScreen(deviceId) {
  if (!deviceId) return detachScreenAudio();
  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    if (S.local.screenAudioAux) {
      S.local.screenAudioAux.getTracks().forEach((t) => t.stop());
    }
    S.local.screenAudioAux = audioStream;
    mixer.addStream('host:screen:audio', audioStream, { ownerId: 'host', stageKey: 'host:screen', monitor: false });
    audioStream.getAudioTracks()[0].onended = () => {
      detachScreenAudio();
    };
    renderAudioPanel();
    toast('Entrada de áudio vinculada à janela!', 'ok');
  } catch (e) {
    toast('Erro ao abrir entrada de áudio: ' + e.message, 'err');
  }
}

function detachScreenAudio() {
  if (S.local.screenAudioAux) {
    S.local.screenAudioAux.getTracks().forEach((t) => t.stop());
    S.local.screenAudioAux = null;
  }
  const s = S.local.screen;
  if (s && s.getAudioTracks().length) {
    mixer.addStream('host:screen:audio', s, { ownerId: 'host', stageKey: 'host:screen', monitor: false });
  } else {
    mixer.remove('host:screen:audio');
  }
  renderAudioPanel();
  toast('Áudio desvinculado.', 'info');
}

function stopScreen() {
  S.local.screen?.getTracks().forEach((t) => t.stop());
  S.local.screen = null;
  if (S.local.screenAudioAux) {
    S.local.screenAudioAux.getTracks().forEach((t) => t.stop());
    S.local.screenAudioAux = null;
  }
  removeSource('host:screen');
  renderAudioPanel();
  renderControls();
}

// opts.id/opts.silent: usados ao restaurar a sessão (mantém o mesmo id e não mostra avisos nem troca de aba)
function addMediaFile(file, opts = {}) {
  let id = opts.id;
  if (id) S.mediaCount = Math.max(S.mediaCount, Number(id.split(':')[1]) || 0);
  else id = `media:${++S.mediaCount}`;
  const url = URL.createObjectURL(file);
  const label = file.name.replace(/\.[^.]+$/, '').slice(0, 40);
  if (file.type.startsWith('image/')) {
    const img = new Image();
    img.src = url;
    const s = { id, el: img, url, kind: 'image', label, ownerId: 'host', camOff: false, file, recordingName: opts.recordingName || '' };
    applySourceAdjust(s);
    S.sources.set(id, s);
    comp.upsertSource(id, { kind: 'image', label, el: img, url, camOff: false, adjust: s.adjust || null });
    renderTiles();
    extras?.mediaAdded(s, file);
    if (opts.silent) return s;
    if (tabOpen('media')) renderMediaPanel();
    else switchTab('media');
    toast('Imagem adicionada — coloque no palco ou use Tela cheia', 'ok');
    return s;
  }
  const el = document.createElement('video');
  el.src = url;
  el.loop = false;
  el.playsInline = true;
  el.crossOrigin = 'anonymous';
  const isAudio = file.type.startsWith('audio/');
  const s = { id, el, url, kind: 'media', label: (isAudio ? '♪ ' : '') + label, ownerId: 'host', camOff: isAudio, recordingName: opts.recordingName || '' };
  applySourceAdjust(s);
  S.sources.set(id, s);
  normalizeQueue();
  comp.upsertSource(id, { kind: 'media', label: s.label, el, url, camOff: isAudio, adjust: s.adjust || null });
  mixer.addElement(id, el, { ownerId: 'host', stageKey: id, monitor: true });
  el.preload = 'auto';
  el.onplay = el.onpause = () => {
    renderTiles();
    if (tabOpen('media')) updateMediaRows();
  };
  el.onended = () => {
    renderTiles();
    if (tabOpen('media')) updateMediaRows();
    if (S.playlist.on && !el.loop) playlistStep(id, 1, { auto: true });
  };
  renderTiles();
  // só carrega: não entra no palco nem reproduz sozinho. O host usa "Palco" ou Tocar (ou a playlist)
  el.load();
  s.file = file;
  el.addEventListener('play', () => { if (!s.checked) { s.checked = true; ensureMediaAudio(s, file); } });
  extras?.mediaAdded(s, file);
  if (opts.silent) return s;
  if (tabOpen('media')) renderMediaPanel();
  else switchTab('media');
  if (tabOpen('playout')) renderPlayoutPanel();
  toast(isAudio ? 'Áudio carregado — aperte Tocar' : 'Vídeo carregado — coloque no palco e aperte Tocar', 'ok');
  return s;
}

// Remove da playlist e apaga o arquivo permanente (IndexedDB ou Gravações, no caso de vídeos do YouTube).
async function deleteMediaFile(s) {
  if (!s) return;
  const label = s.recordingName || s.label || 'este arquivo';
  if (!(await confirmDialog(`Apagar o arquivo “${label}” do disco?\n\nEle sai da playlist e não poderá ser restaurado.`, { ok: 'Apagar arquivo', danger: true }))) return;
  if (s.recordingName) {
    try {
      await api('/recordings/' + encodeURIComponent(s.recordingName), { method: 'DELETE' });
    } catch (e) {
      toast('Não foi possível apagar das Gravações: ' + e.message, 'err');
      return;
    }
  }
  removeSource(s.id);
  toast(`Arquivo “${label}” apagado`, 'ok');
}

// ---- Playlist: toca os vídeos em sequência (ordem da lista), com repetição opcional da lista ----
// Fila canônica do Playout: somente vídeos/áudios, independente da ordem do Map.
// Imagens, câmeras, telas e vídeo de fundo ficam fora dela.
function normalizeQueue() {
  const ids = [...S.sources.values()].filter((x) => x.kind === 'media').map((x) => x.id);
  const valid = new Set(ids);
  const seen = new Set();
  const out = [];
  for (const id of Array.isArray(S.playlist.order) ? S.playlist.order : []) {
    if (valid.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  S.playlist.order = out;
  return out;
}
const queueList = () => {
  normalizeQueue();
  return S.playlist.order.map((id) => S.sources.get(id)).filter(Boolean);
};
const mediaList = () => queueList();
// Auto play opcional: ligado por padrão. Desligado, entrar no PGM/palco não inicia vídeo.
function autoPlayMediaEnabled() {
  return S.brand?.autoPlayMedia !== false;
}
// Um vídeo por vez: ao iniciar/entrar no ar, pausa os outros vídeos (áudio-only fica livre).
function pauseOtherVideos(id = null) {
  for (const o of mediaList()) {
    if (o.id !== id && o.kind === 'media' && !o.camOff && !o.el.paused) o.el.pause();
  }
}
const queuePosition = (id) => normalizeQueue().indexOf(id) + 1;
function queueNext(id, dir = 1) {
  const ids = normalizeQueue();
  if (!ids.length) return null;
  let i = ids.indexOf(id);
  if (i < 0) i = 0;
  else i += dir;
  if (i < 0 || i >= ids.length) {
    if (!S.playlist.loop) return null;
    i = (i + ids.length) % ids.length;
  }
  return S.sources.get(ids[i]) || null;
}

// Contexto do vídeo que está no ar. Estúdio usa Solo/palco; Mesa usa take/Cena/prévia.
// A playlist só "segue" se este contexto ainda for o mesmo quando o vídeo termina.
let mediaAirSeq = 0;
let mediaAir = null;
function mediaAirContext(id, bump = false) {
  const mode = S.switcher ? 'mesa' : 'studio';
  let air = 'off';
  if (mode === 'studio') {
    if (S.solo === id && S.stage.includes(id)) air = 'solo';
    else if (S.stage.includes(id)) air = 'scene';
  } else {
    if (S.take === id) air = 'take';
    // Com take em câmera, o vídeo na prévia é só prévia, mesmo que também esteja no palco.
    else if (S.take !== null && S.pvw === id) air = 'preview';
    else if (S.take === null && S.solo === id && S.stage.includes(id)) air = 'soloScene';
    else if (S.take === null && S.stage.includes(id)) air = 'scene';
    else if (S.pvw === id) air = 'preview';
  }
  return { id, mode, air, take: S.take, solo: S.solo, stage: [...S.stage], seq: bump ? ++mediaAirSeq : mediaAirSeq };
}
function armMediaAir(id) {
  mediaAir = mediaAirContext(id, true);
}
function mediaContextMatches(ctx, id) {
  if (!ctx || ctx.id !== id) return false;
  const now = mediaAirContext(id);
  return (
    now.mode === ctx.mode &&
    now.air === ctx.air &&
    now.take === ctx.take &&
    now.solo === ctx.solo &&
    now.stage.join('|') === ctx.stage.join('|')
  );
}
function canFollowMedia(ctx, id) {
  return !!ctx && ctx.id === id && S.playlist.on && S.playlist.follow !== false && mediaContextMatches(ctx, id);
}
// Vídeo que está efetivamente no ar agora, para o "seguir" também valer quando
// o operador inicia o próximo vídeo manualmente (não só no fim automático).
function activeMediaOnAir(excludeId = null) {
  if (mediaAir && mediaAir.id !== excludeId && mediaContextMatches(mediaAir, mediaAir.id)) return mediaAir;
  const media = mediaList();
  const pick = (id) => id && id !== excludeId && S.sources.get(id)?.kind === 'media' && !S.sources.get(id)?.camOff ? mediaAirContext(id) : null;
  if (!S.switcher) {
    const solo = pick(S.solo);
    if (solo) return solo;
    const inStage = S.stage.filter((x) => media.some((m) => m.id === x));
    return inStage.length === 1 ? pick(inStage[0]) : null;
  }
  const take = pick(S.take);
  if (take) return take;
  if (S.take === null) {
    const solo = pick(S.solo);
    if (solo) return solo;
    const inStage = S.stage.filter((x) => media.some((m) => m.id === x));
    if (inStage.length === 1) return pick(inStage[0]);
  }
  if (S.pvw && S.pvw !== excludeId) return pick(S.pvw);
  return null;
}
function followMedia(ctx, nextId) {
  const next = S.sources.get(nextId);
  if (!next || next.kind !== 'media' || nextId === ctx.id) return;
  // Um vídeo por vez: o anterior e os demais pausam.
  for (const o of mediaList()) if (o.id !== nextId && !o.el.paused) o.el.pause();
  // O próximo ocupa o mesmo slot de mídia do anterior, em qualquer modo.
  if (ctx.air !== 'preview') {
    const at = S.stage.indexOf(ctx.id);
    const arr = S.stage.filter((x) => x !== ctx.id);
    if (!arr.includes(nextId)) arr.splice(at >= 0 ? Math.min(at, arr.length) : 0, 0, nextId);
    setStage(arr);
  }
  if (ctx.mode === 'studio') {
    if (ctx.air === 'solo' && !next.camOff) setSolo(nextId);
    // scene: o palco já foi trocado acima; não força Solo.
    return;
  }
  if (!S.switcher) return;
  if (ctx.air === 'take' && !next.camOff) {
    const prevPvw = S.pvw;
    switcher?.cutTo(nextId);
    // cutTo usa a prévia para entrar; devolve a prévia que o operador tinha escolhido.
    if (prevPvw && prevPvw !== ctx.id && prevPvw !== nextId) switcher?.setPreview(prevPvw);
    else switcher?.setPreview(null);
  } else if (ctx.air === 'soloScene' && !next.camOff) {
    setSolo(nextId);
  } else if (ctx.air === 'preview') {
    switcher?.setPreview(nextId);
  }
  // scene: o palco já foi atualizado; o PGM continua Cena.
}
function endPlaylist(ctx) {
  if (!ctx) return;
  const mode = S.switcher ? 'mesa' : 'studio';
  if (mode !== ctx.mode) return;
  if (ctx.mode === 'studio' && ctx.air === 'solo' && S.solo === ctx.id) setSolo(null);
  else if (ctx.mode === 'mesa') {
    if (ctx.air === 'take' && S.take === ctx.id) {
      switcher?.cutTo(null);
      switcher?.setPreview(null);
    } else if (ctx.air === 'soloScene' && S.take === null && S.solo === ctx.id) setSolo(null);
  }
  toast('Playlist terminou; o PGM voltou para a Cena.', 'info');
}

function playMedia(id, { followOnPlay = true } = {}) {
  const s = S.sources.get(id);
  if (!s) return;
  if (s.kind === 'media') {
    deckSel = id;
    deckPickT = Date.now();
  }
  const prev = followOnPlay && !s.camOff ? activeMediaOnAir(id) : null;
  pauseOtherVideos(id);
  if (!s.camOff) {
    if (S.playlist.on) {
      // o próximo ocupa o lugar do anterior no palco
      const k = S.stage.findIndex((x) => x !== id && S.sources.get(x)?.kind === 'media');
      const arr = S.stage.filter((x) => x === id || S.sources.get(x)?.kind !== 'media');
      if (!arr.includes(id)) arr.splice(k >= 0 ? Math.min(k, arr.length) : 0, 0, id);
      setStage(arr);
    } else if (!S.stage.includes(id)) setStage([id, ...S.stage]);
  }
  if (s.el.ended) s.el.currentTime = 0;
  s.el.play().catch(() => {});
  if (prev) followMedia(prev, id);
  armMediaAir(id);
}

function playlistStep(fromId, dir = 1, { auto = false } = {}) {
  const list = mediaList();
  if (!list.length) return;
  const ctx = mediaAir;
  const follow = auto && canFollowMedia(ctx, fromId);
  let n = list.findIndex((x) => x.id === fromId) + dir;
  if (n >= list.length || n < 0) {
    if (!S.playlist.loop) {
      if (auto) endPlaylist(ctx);
      else toast('Playlist terminou');
      return;
    }
    n = (n + list.length) % list.length;
  }
  const nextId = list[n].id;
  list[n].el.currentTime = 0;
  playMedia(nextId, { followOnPlay: false });
  if (follow) {
    followMedia(ctx, nextId);
    armMediaAir(nextId);
  }
}

function playlistStart() {
  const list = mediaList();
  if (!list.length) return toast('Adicione vídeos primeiro');
  S.playlist.on = true;
  const selected = deckSel && S.sources.get(deckSel)?.kind === 'media' ? S.sources.get(deckSel) : null;
  const first = selected || list[0];
  first.el.currentTime = 0;
  playMedia(first.id, { followOnPlay: false });
  renderMediaPanel();
  if (tabOpen('playout')) renderPlayoutPanel();
}

function moveMedia(id, dir) {
  const ids = normalizeQueue().slice();
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  S.playlist.order = ids;
  renderMediaPanel();
  if (tabOpen('playout')) renderPlayoutPanel();
}

// O Chromium/Edge não decodifica alguns áudios (AC3/E-AC3/DTS) nem HEVC: se o arquivo toca sem decodificar áudio,
// o servidor local converte para MP4 H.264+AAC e o player troca para a versão convertida.
async function ensureMediaAudio(s, file) {
  const el = s.el;
  await new Promise((r) => setTimeout(r, 1800));
  if (!S.sources.has(s.id) || el.paused || el.currentTime < 0.3) return;
  if (typeof el.webkitAudioDecodedByteCount !== 'number' || el.webkitAudioDecodedByteCount > 0) return;
  const label = s.label;
  toast(`Convertendo o áudio de “${label}” (formato não suportado pelo navegador)…`);
  try {
    const r = await fetch('/api/media/convert', { method: 'POST', body: file });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'falha na conversão');
    if (j.silent) return toast(`“${label}” não tem faixa de áudio.`);
    if (!S.sources.has(s.id)) return;
    const t = el.currentTime;
    const wasPaused = el.paused;
    el.src = j.url;
    el.addEventListener(
      'loadedmetadata',
      () => {
        el.currentTime = Math.min(t, el.duration || t);
        if (!wasPaused) el.play().catch(() => {});
      },
      { once: true },
    );
    toast(`Áudio de “${label}” convertido (${(j.acodec || '').toUpperCase()} → AAC).`, 'ok');
  } catch (e) {
    toast('Não foi possível converter o áudio: ' + e.message, 'err');
  }
}

function fmtClock(sec) {
  if (!isFinite(sec)) return '0:00';
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

// ---- YouTube: yt-dlp baixa, FFmpeg junta áudio+vídeo e o arquivo entra na playlist ----
let ytNotice = '';
let ytNoticeKind = '';
const YT_JOB_KEY = 'castdeck.ytdl.job';

function ytSaveJob(job) {
  try {
    if (job?.id) localStorage.setItem(YT_JOB_KEY, JSON.stringify({ id: job.id, url: ytLastUrl || '' }));
  } catch {}
}
function ytClearJob() {
  try {
    localStorage.removeItem(YT_JOB_KEY);
  } catch {}
}

function ytInfo(j = ytJob) {
  if (!j) {
    return {
      text: ytNotice || 'Cole um link do YouTube para baixar e adicionar à playlist.',
      summary: ytNoticeKind === 'err' ? 'Erro no download' : 'Baixar e adicionar',
      kind: ytNoticeKind,
      pct: null,
    };
  }
  if (j.status === 'error') return { text: j.error || 'Falha no download.', summary: 'Erro no download', kind: 'err', pct: null };
  if (j.status === 'cancelled') return { text: 'Download cancelado.', summary: 'Cancelado', kind: '', pct: null };
  if (j.status === 'preparing' || j.status === 'starting') return { text: 'Preparando yt-dlp e FFmpeg…', summary: 'Preparando…', kind: 'busy', pct: 0 };
  if (j.status === 'done') return { text: ytNoticeKind === 'err' && ytNotice ? ytNotice : 'Baixado. Preparando para a playlist…', summary: ytNoticeKind === 'err' ? 'Falha ao importar' : 'Preparado', kind: ytNoticeKind === 'err' ? 'err' : 'busy', pct: 100 };
  if (j.stage === 'merging') return { text: 'Juntando áudio e vídeo com FFmpeg…', summary: 'Juntando áudio+vídeo…', kind: 'busy', pct: 100 };
  if (j.stage === 'processing') return { text: 'Preparando o vídeo para a playlist…', summary: 'Preparando o vídeo…', kind: 'busy', pct: 100 };
  const bits = [`Baixando ${Math.round(j.progress || 0)}%`];
  if (j.speed) bits.push(j.speed);
  if (j.eta) bits.push(`faltam ${j.eta}`);
  if (j.totalText) bits.push(j.totalText);
  return { text: bits.join(' · '), summary: `${Math.round(j.progress || 0)}% · baixando`, kind: 'busy', pct: j.progress || 0 };
}

function ytPaint() {
  const info = ytInfo();
  const status = $('#yt-status');
  if (status) {
    status.textContent = info.text;
    status.className = `ytdl-status ${info.kind}`;
  }
  const summary = $('#yt-summary');
  if (summary) summary.textContent = info.summary;
  for (const id of ['yt-bar', 'yt-mini']) {
    const bar = $('#' + id);
    if (bar) bar.style.width = `${info.pct ?? 0}%`;
  }
  const retry = $('#yt-retry');
  if (retry) {
    retry.hidden = !(ytJob && (ytJob.status === 'error' || ytJob.status === 'done'));
    retry.textContent = ytJob?.status === 'done' ? 'Importar de novo' : 'Tentar de novo';
  }
  const toggle = $('#yt-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', String(!ytCollapsed));
  const box = $('#yt-box');
  if (box) box.classList.toggle('collapsed', ytCollapsed);
}

function ytRememberCollapsed() {
  try {
    localStorage.setItem('castdeck.ytdl.collapsed', ytCollapsed ? '1' : '0');
  } catch {}
}

function ytToggle() {
  ytCollapsed = !ytCollapsed;
  ytRememberCollapsed();
  ytPaint();
}

function ytStatus(text, kind = '') {
  const el = $('#yt-status');
  if (!el) return;
  el.className = `ytdl-status ${kind}`;
  el.textContent = text;
}

let ytImporting = false;

// Busca o arquivo do download. Se a conexão única cair ("Failed to fetch" em arquivos grandes),
// refaz em pedaços de 8 MB via Range (o servidor suporta Range no sendFile e no /recordings).
async function fetchMediaBlob(url, mimeHint = 'video/mp4') {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let firstErr = null;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const b = await r.blob();
    if (b.size) return b;
    throw new Error('arquivo vazio');
  } catch (e) {
    firstErr = e;
  }
  const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
  if (!head.ok) throw firstErr;
  const total = Number(head.headers.get('content-length') || 0);
  if (!total) throw firstErr;
  const CH = 8 << 20;
  const parts = [];
  for (let start = 0; start < total; start += CH) {
    const end = Math.min(total - 1, start + CH - 1);
    let ok = false;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const r = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, cache: 'no-store' });
        if (r.status !== 206) throw new Error(`HTTP ${r.status}`);
        parts.push(new Uint8Array(await r.arrayBuffer()));
        ok = true;
      } catch (e) {
        if (attempt === 2) throw e;
        await sleep(500 * (attempt + 1));
      }
    }
  }
  const b = new Blob(parts, { type: mimeHint });
  return b.size ? b : Promise.reject(firstErr);
}

async function ytImport(j) {
  if (!j?.id || ytImporting) return;
  ytImporting = true;
  ytJob = { ...j };
  ytSaveJob(j);
  ytStatus('Baixado. Importando para a playlist…', 'busy');
  try {
    // Se outro estúdio/janela já importou esta gravação, não duplica.
    if (j.recordingName && [...S.sources.values()].some((s) => s.recordingName === j.recordingName)) {
      ytJob = null;
      ytLastUrl = '';
      ytClearJob();
      ytNotice = 'Este vídeo já estava na playlist.';
      ytNoticeKind = 'ok';
      if (tabOpen('media')) renderMediaPanel();
      return;
    }
    // O arquivo do job ainda está em memória logo após concluir: usa a fonte autoritativa primeiro;
    // a gravação em disco é o fallback estável (outra janela pode ter apagado o job).
    const urls = [];
    urls.push('/api/media/ytdl/' + encodeURIComponent(j.id) + '/file');
    if (j.recordingName) urls.push('/recordings/' + encodeURIComponent(j.recordingName));
    let blob = null;
    let lastErr = null;
    for (const url of urls) {
      try {
        blob = await fetchMediaBlob(url, j.mime || 'video/mp4');
        if (blob) break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!blob) throw new Error(`falha ao buscar o arquivo (${lastErr?.message || 'rede'})`);
    const ext = (String(j.filename || '').match(/\.[a-z0-9]{2,5}$/i) || ['.mp4'])[0];
    const base = String(j.title || 'video').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 80) || 'video';
    const name = `${base}${ext}`;
    // MIME pela extensão (confiável), com fallback ao que o servidor informou.
    const MIME_BY_EXT = { '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg' };
    const file = new File([blob], name, { type: MIME_BY_EXT[ext.toLowerCase()] || j.mime || 'video/mp4' });
    addMediaFile(file, { recordingName: j.recordingName || '' });
    api('/media/ytdl/' + encodeURIComponent(j.id), { method: 'DELETE' }).catch(() => {});
    ytJob = null;
    ytLastUrl = '';
    ytClearJob();
    ytNotice = `“${j.title || name}” entrou na playlist.`;
    ytNoticeKind = 'ok';
    if (tabOpen('media')) renderMediaPanel();
    toast('Vídeo do YouTube adicionado à playlist', 'ok');
  } catch (e) {
    ytNotice = 'Baixado, mas não consegui importar: ' + e.message;
    ytNoticeKind = 'err';
    // Mantém o job concluído para o botão "Importar de novo" (o arquivo já está em Gravações).
    ytJob = { ...j, status: 'done' };
    ytSaveJob(j);
    if (tabOpen('media')) renderMediaPanel();
    toast(ytNotice, 'err');
  } finally {
    ytImporting = false;
  }
}

function ytWatch() {
  clearInterval(ytTimer);
  if (!ytJob) return;
  ytTimer = setInterval(async () => {
    if (!ytJob?.id) return;
    try {
      const j = await api('/media/ytdl/' + encodeURIComponent(ytJob.id));
      ytJob = { ...ytJob, ...j };
      ytPaint();
      if (j.status === 'error') {
        clearInterval(ytTimer);
        ytTimer = null;
        ytClearJob();
        toast('Falha no download do YouTube: ' + (j.error || 'erro desconhecido'), 'err');
        return;
      }
      if (j.status === 'cancelled') {
        clearInterval(ytTimer);
        ytTimer = null;
        ytJob = null;
        ytClearJob();
        ytNotice = 'Download cancelado.';
        ytNoticeKind = '';
        ytPaint();
        return;
      }
      if (j.status === 'done') {
        clearInterval(ytTimer);
        ytTimer = null;
        ytPaint();
        ytImport(j);
        return;
      }
    } catch (e) {
      ytStatus('Falha ao consultar o download: ' + e.message, 'err');
    }
  }, 850);
}

async function ytImportRecordings() {
  try {
    const recs = await api('/recordings');
    const list = (recs || []).filter((r) => /\[YouTube\]/i.test(r.name) && ![...S.sources.values()].some((s) => s.recordingName === r.name));
    if (!list.length) return toast('Nenhum vídeo do YouTube pendente em Gravações.', 'info');
    if (!(await confirmDialog(`Importar ${list.length} vídeo(s) do YouTube das Gravações para a playlist?`, { ok: 'Importar' }))) return;
    for (const r of list) {
      const res = await fetch('/recordings/' + encodeURIComponent(r.name));
      if (!res.ok) throw new Error(`não foi possível ler ${r.name}`);
      const blob = await res.blob();
      const file = new File([blob], r.name, { type: 'video/mp4' });
      addMediaFile(file, { recordingName: r.name, silent: true });
    }
    if (tabOpen('media')) renderMediaPanel();
    toast(`${list.length} vídeo(s) importado(s) da pasta Gravações`, 'ok');
  } catch (e) {
    toast('Falha ao importar das Gravações: ' + e.message, 'err');
  }
}

async function ytResume() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(YT_JOB_KEY) || 'null');
  } catch {}
  if (!saved?.id) return;
  try {
    const j = await api('/media/ytdl/' + encodeURIComponent(saved.id));
    ytLastUrl = saved.url || '';
    ytJob = { ...saved, ...j };
    if (j.status === 'done') {
      if (tabOpen('media')) renderMediaPanel();
      ytImport(j);
    } else if (!['error', 'cancelled'].includes(j.status)) {
      if (tabOpen('media')) renderMediaPanel();
      ytWatch();
    } else {
      ytClearJob();
    }
  } catch {
    // O servidor foi reiniciado: o arquivo pode estar em Gravações; o botão Importar resolve.
    ytClearJob();
  }
}

async function ytStart(retryUrl) {
  if (ytJob && !['error', 'done'].includes(ytJob.status)) return;
  const input = $('#yt-url');
  const url = String(retryUrl || input?.value || '').trim();
  if (!url) {
    toast('Cole um link do YouTube primeiro.', 'warn');
    input?.focus();
    return;
  }
  ytLastUrl = url;
  ytNotice = '';
  ytNoticeKind = '';
  ytCollapsed = false;
  ytRememberCollapsed();
  try {
    ytJob = await api('/media/ytdl', { method: 'POST', body: { url } });
    ytSaveJob(ytJob);
    if (input) input.value = '';
    if (tabOpen('media')) renderMediaPanel();
    else switchTab('media');
    ytPaint();
    ytWatch();
  } catch (e) {
    ytJob = null;
    ytClearJob();
    ytNotice = e.message || 'Falha ao iniciar o download';
    ytNoticeKind = 'err';
    if (tabOpen('media')) renderMediaPanel();
    toast(ytNotice, 'err');
  }
}

async function ytCancel() {
  const id = ytJob?.id;
  clearInterval(ytTimer);
  ytTimer = null;
  ytJob = null;
  if (id) await api('/media/ytdl/' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {});
  ytClearJob();
  ytLastUrl = '';
  ytNotice = 'Download cancelado.';
  ytNoticeKind = '';
  ytPaint();
  if (tabOpen('media')) renderMediaPanel();
}

let mediaView = (() => {
  try {
    return localStorage.getItem('cd.media.view') === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
})();
let mediaQuery = '';
let mediaFilter = 'all';
let mediaDragId = null;

function renderMediaPanel() {
  const p = $('#panel-media');
  const items = mediaList();
  const imgs = [...S.sources.values()].filter((s) => s.kind === 'image');
  const yt = ytInfo();
  p.innerHTML = `
    <button class="btn primary" id="m-add">${icons.film} Adicionar vídeos, áudios ou imagens…</button>
    <p class="hint" style="margin:8px 0 12px">Você também pode arrastar arquivos para cá. Nada vai ao ar sozinho: vídeos e áudios só tocam quando você apertar Tocar.</p>
    ${S.system.platform === 'android' ? '' : `<div class="ytdl-box ${ytCollapsed ? 'collapsed' : ''}" id="yt-box">
      <button class="ytdl-head" id="yt-toggle" type="button" aria-expanded="${!ytCollapsed}" title="${ytCollapsed ? 'Expandir o downloader do YouTube' : 'Recolher o downloader do YouTube'}">
        <span class="ytdl-title">▶ YouTube <small>baixa e junta áudio + vídeo</small></span>
        <span class="ytdl-headmeta"><b id="yt-summary">${esc(yt.summary)}</b><i class="ytdl-chev"></i></span>
      </button>
      <div class="ytdl-mini"><i id="yt-mini" style="width:${yt.pct ?? 0}%"></i></div>
      <div class="ytdl-body" id="yt-body">
        <div class="ytdl-row"><input class="input" id="yt-url" type="url" placeholder="Cole o link do vídeo do YouTube" autocomplete="off" spellcheck="false"><button class="btn primary" id="yt-go">Baixar</button></div>
        <div class="ytdl-status ${yt.kind}" id="yt-status" aria-live="polite">${esc(yt.text)}</div>
        <div class="ytdl-bar"><i id="yt-bar" style="width:${yt.pct ?? 0}%"></i></div>
        <div class="ytdl-foot"><span>Use apenas conteúdo que você tem direito de baixar.</span><span class="ytdl-foot-acts"><button class="btn sm ghost" id="yt-recordings" title="Importar vídeos do YouTube que já estão na pasta Gravações">Importar baixados</button><button class="btn sm ghost" id="yt-retry" ${ytJob && (ytJob.status === 'error' || ytJob.status === 'done') ? '' : 'hidden'}>${ytJob?.status === 'done' ? 'Importar de novo' : 'Tentar de novo'}</button>${ytJob ? '<button class="btn sm ghost" id="yt-cancel">Cancelar</button>' : ''}</span></div>
      </div>
    </div>`}
    <h4>Imagens <span class="hint" style="text-transform:none;letter-spacing:0">(${imgs.length})</span></h4>
    <div id="i-list">${
      imgs.length
        ? imgs
            .map(
              (s) => `<div class="card img-row" data-iid="${s.id}" style="padding:8px;box-shadow:none;margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <img src="${s.url}" alt="" style="width:72px;height:41px;object-fit:cover;border-radius:6px;background:#000;flex:none">
          <strong class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:80px">${esc(s.label)}</strong>
          <div class="row" style="gap:4px;flex-wrap:wrap">
            <button class="btn sm i-stage"></button>
            <button class="btn sm i-full" title="Mostrar em tela cheia (solo)">Tela cheia</button>
            <button class="btn sm icon i-ren" title="Renomear">✎</button>
            <button class="btn sm danger icon i-del" title="Remover">${icons.trash}</button>
          </div></div>`,
            )
            .join('')
        : '<div class="empty">Nenhuma imagem. Adicione logos, fotos ou slides para exibir ao vivo.</div>'
    }</div>
    <h4>Vídeos e áudios</h4>
    <label class="check" style="justify-content:space-between;margin-bottom:8px"><span>Mostrar nomes dos vídeos</span><span class="switch"><input type="checkbox" id="m-names" ${S.brand.showMediaNames !== false ? 'checked' : ''}><span></span></span></label>
    <div class="m-toolbar">
      <span class="m-count"><b id="m-count">${items.length}</b> item${items.length === 1 ? '' : 's'} · <b id="m-stage-count">${items.filter((x) => S.stage.includes(x.id)).length}</b> no palco</span>
      <div class="seg m-view" id="m-view" role="group" aria-label="Visualização da mídia">
        <button data-mview="grid" class="${mediaView === 'grid' ? 'active' : ''}" title="Grade com miniaturas">▦</button>
        <button data-mview="list" class="${mediaView === 'list' ? 'active' : ''}" title="Lista compacta">☰</button>
      </div>
    </div>
    <div class="m-filters">
      <input class="input" id="m-search" type="search" placeholder="Buscar vídeo por nome…" autocomplete="off" value="${esc(mediaQuery)}">
      <select class="input" id="m-filter" aria-label="Filtrar mídia">
        <option value="all" ${mediaFilter === 'all' ? 'selected' : ''}>Todos</option>
        <option value="video" ${mediaFilter === 'video' ? 'selected' : ''}>Vídeo</option>
        <option value="audio" ${mediaFilter === 'audio' ? 'selected' : ''}>Áudio</option>
      </select>
    </div>
    <div class="m-section-head"><h4>Biblioteca</h4><span class="hint">ordem = fila do Playout</span></div>
    <div class="row" style="gap:8px;align-items:center;margin:0 0 10px"><button class="btn sm primary" id="pl-open">▶ Abrir Playout</button><span class="hint">Fila, mini player e automação ficam no Playout.</span></div>
    <div id="m-list" class="m-list ${mediaView}">${
      items.length
        ? items
            .map((s, n) => {
              const el = s.el;
              const onAir = S.take === s.id;
              const onStage = S.stage.includes(s.id);
              const playing = !el?.paused && !el?.ended;
              const ended = !!el?.ended;
              const name = String(s.label || 'Mídia').replace(/^[^\p{L}\p{N}]+/u, '');
              const badges = [
                onAir ? '<span class="m-badge live">NO AR</span>' : onStage ? '<span class="m-badge stage">NO PALCO</span>' : '',
                ended ? '<span class="m-badge ended">FIM</span>' : playing ? '<span class="m-badge playing">TOCANDO</span>' : '',
              ].join('');
              return `<div class="m-card ${s.camOff ? 'is-audio' : 'is-video'} ${onAir ? 'on-air' : onStage ? 'on-stage' : ''} ${playing ? 'playing' : ''} ${s.id === deckSel ? 'selected' : ''}" data-mid="${s.id}" data-name="${esc(name.toLocaleLowerCase('pt-BR'))}" data-kind="${s.camOff ? 'audio' : 'video'}" draggable="true">
                <div class="m-thumb">
                  <canvas width="320" height="180" data-mthumb></canvas>
                  <span class="m-num">${n + 1}</span>
                  <span class="m-dur">${fmtClock(el?.duration)}</span>
                  <button class="m-play" title="Tocar/Pausar">${ended ? '↻' : playing ? '⏸' : '▶'}</button>
                  <span class="m-badges">${badges}</span>
                </div>
                <div class="m-info">
                  <strong class="m-name" title="${esc(name)}">${esc(name)}</strong>
                  <div class="m-meta"><span>${s.camOff ? 'Áudio' : 'Vídeo'}</span><span class="m-time">0:00</span></div>
                  <input type="range" class="m-seek" min="0" max="1000" value="0" aria-label="Progresso de ${esc(name)}">
                  <div class="m-actions"><button class="btn sm m-stage"></button><button class="btn sm icon m-more" title="Mais ações" aria-label="Mais ações">⋯</button></div>
                </div>
              </div>`;
            })
            .join('')
        : '<div class="m-empty"><b>Nenhum arquivo ainda</b><span>Adicione vídeos, áudios ou importe do YouTube.</span></div>'
    }</div>
    <p class="hint" style="margin:8px 0 0">A biblioteca acima é a fila. Para operar, abra o Playout.</p>`;
  // vídeos primeiro: é a seção que o operador mais usa ao vivo
  moveMediaSectionFirst(p);
  $('#m-add', p).onclick = () => $('#media-file').click();
  $('#yt-toggle', p)?.addEventListener('click', ytToggle);
  $('#yt-go', p)?.addEventListener('click', () => ytStart());
  $('#yt-url', p)?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ytStart();
    }
  });
  $('#yt-cancel', p)?.addEventListener('click', ytCancel);
  $('#yt-retry', p)?.addEventListener('click', () => (ytJob?.status === 'done' ? ytImport(ytJob) : ytStart(ytLastUrl)));
  $('#yt-recordings', p)?.addEventListener('click', ytImportRecordings);
  if (ytJob?.progress) {
    const bar = $('#yt-bar', p);
    if (bar) bar.style.width = `${ytJob.progress}%`;
  }
  $$('.img-row', p).forEach((row) => {
    const s = S.sources.get(row.dataset.iid);
    if (!s) return;
    const on = S.stage.includes(s.id);
    const sb = $('.i-stage', row);
    sb.textContent = on ? 'Tirar do palco' : 'Pôr no palco';
    sb.classList.toggle('primary', !on);
    sb.onclick = () => (toggleStage(s.id), renderMediaPanel());
    const fb = $('.i-full', row);
    fb.classList.toggle('primary', S.solo === s.id);
    fb.onclick = () => {
      if (!S.stage.includes(s.id)) toggleStage(s.id);
      setSolo(s.id);
      renderMediaPanel();
    };
    row.draggable = true;
    row.ondragstart = (e) => startDragSrc(e, s.id);
    row.ondragend = () => (dragSrc = null);
    $('.i-ren', row).onclick = () => renameSource(s.id);
    $('.i-del', row).onclick = () => (removeSource(s.id), renderMediaPanel());
  });
  // arrastar e soltar arquivos sobre o painel
  p.ondragover = (e) => e.preventDefault();
  p.ondrop = (e) => {
    e.preventDefault();
    [...(e.dataTransfer?.files || [])].filter((f) => /^(image|video|audio)\//.test(f.type)).forEach(addMediaFile);
  };
  $('#m-names', p).onchange = (e) => setBrand({ showMediaNames: e.target.checked });
  $('#pl-open', p).onclick = () => openSideTab('playout');
  // visualização grade/lista
  $$('#m-view button', p).forEach((b) => {
    b.onclick = () => {
      mediaView = b.dataset.mview === 'list' ? 'list' : 'grid';
      try {
        localStorage.setItem('cd.media.view', mediaView);
      } catch {}
      $('#m-list', p)?.classList.toggle('list', mediaView === 'list');
      $('#m-list', p)?.classList.toggle('grid', mediaView === 'grid');
      $$('#m-view button', p).forEach((x) => x.classList.toggle('active', x === b));
    };
  });
  const filterCards = () => {
    const q = String($('#m-search', p)?.value || '').trim().toLocaleLowerCase('pt-BR');
    mediaQuery = q;
    mediaFilter = $('#m-filter', p)?.value || 'all';
    let shown = 0;
    $$('.m-card', p).forEach((card) => {
      const okText = !q || (card.dataset.name || '').includes(q);
      const okKind = mediaFilter === 'all' || card.dataset.kind === mediaFilter;
      card.hidden = !(okText && okKind);
      if (!card.hidden) shown++;
    });
    const c = $('#m-count', p);
    if (c) c.textContent = String(shown);
  };
  $('#m-search', p).oninput = filterCards;
  $('#m-filter', p).onchange = filterCards;
  filterCards();
  $$('.m-card', p).forEach((card) => {
    const s = S.sources.get(card.dataset.mid);
    if (!s) return;
    const el = s.el;
    $('.m-play', card).onclick = (e) => {
      e.stopPropagation();
      if (el.ended) {
        el.currentTime = 0;
        playMedia(s.id);
      } else if (el.paused) playMedia(s.id);
      else el.pause();
    };
    $('.m-stage', card).onclick = (e) => {
      e.stopPropagation();
      toggleStage(s.id);
      updateMediaRows();
    };
    $('.m-more', card).onclick = (e) => {
      e.stopPropagation();
      openMediaMenu(s);
    };
    const seek = $('.m-seek', card);
    seek.oninput = () => {
      seek.dataset.drag = '1';
      if (el.duration) el.currentTime = (seek.value / 1000) * el.duration;
    };
    seek.onchange = () => delete seek.dataset.drag;
    card.onclick = (e) => {
      if (e.target.closest('button,input')) return;
      deckSel = s.id;
      deckPickT = Date.now();
      updateMediaRows();
      tickDeck();
    };
    card.ondragstart = (e) => {
      if (e.target.closest?.('button,input')) return e.preventDefault();
      mediaDragId = s.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    };
    card.ondragend = () => {
      mediaDragId = null;
      $$('.m-card', p).forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after'));
    };
    card.ondragover = (e) => {
      if (!mediaDragId || mediaDragId === s.id) return;
      e.preventDefault();
      const r = card.getBoundingClientRect();
      card.classList.toggle('drop-before', e.clientY < r.top + r.height / 2);
      card.classList.toggle('drop-after', e.clientY >= r.top + r.height / 2);
    };
    card.ondragleave = () => card.classList.remove('drop-before', 'drop-after');
    card.ondrop = (e) => {
      e.preventDefault();
      const before = card.classList.contains('drop-before');
      card.classList.remove('drop-before', 'drop-after');
      if (mediaDragId && mediaDragId !== s.id) reorderMedia(mediaDragId, s.id, before);
    };
  });
  updateMediaRows();
}

// ---- Playout: fila canônica + mini player estável (painel separado de Mídia) ----
var playoutSig = null;

function playoutCurrent() {
  const list = mediaList();
  if (deckSel && list.some((x) => x.id === deckSel)) return deckSel;
  const playing = list.find((x) => !x.el.paused && !x.el.ended);
  deckSel = playing?.id || list[0]?.id || null;
  return deckSel;
}

function paintPlayoutThumb(cv, s) {
  if (!cv || !s) return;
  const ctx = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const el = s.el;
  if (!s.camOff && el?.videoWidth) {
    const sc = Math.max(W / el.videoWidth, H / el.videoHeight);
    const dw = el.videoWidth * sc;
    const dh = el.videoHeight * sc;
    ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#191a2b');
  g.addColorStop(1, '#0c0d16');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(160,150,255,.8)';
  ctx.font = '700 34px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♪', W / 2, H / 2 + 2);
}

function playoutAdvance(dir = 1) {
  const list = mediaList();
  if (!list.length) return;
  const curId = playoutCurrent();
  const cur = S.sources.get(curId);
  if (!cur) return;
  const next = queueNext(curId, dir);
  if (!next) return toast(dir > 0 ? 'Fim da fila' : 'Início da fila');
  const wasPlaying = !cur.el.paused || cur.el.ended;
  next.el.currentTime = 0;
  deckSel = next.id;
  if (wasPlaying) playMedia(next.id);
  else {
    tickDeck();
    if (tabOpen('playout')) renderPlayoutPanel();
  }
}

function renderPlayoutPanel() {
  const p = $('#panel-playout');
  if (!p) return;
  const list = mediaList();
  if (!list.length) {
    playoutSig = '';
    p.innerHTML = `<div class="pl-empty"><b>Nenhum vídeo ou áudio na fila</b><span>Adicione arquivos na aba Mídia para começar.</span><button class="btn primary" id="pl-open-media">Abrir Mídia</button></div>`;
    $('#pl-open-media', p).onclick = () => openSideTab('media');
    return;
  }
  const curId = playoutCurrent();
  const cur = S.sources.get(curId);
  const next = queueNext(curId, 1);
  const sig = list.map((x) => x.id + '|' + x.label).join(',');
  playoutSig = sig;
  const duration = fmtClock(cur?.el?.duration);
  const pos = queuePosition(curId);
  p.innerHTML = `
    <div class="pl-title-row">
      <div><h3>${icons.play} Playout</h3><p class="hint">Fila, mini player e automação. A biblioteca fica em Mídia.</p></div>
      <button class="btn sm" id="pl-open-media">Mídia</button>
    </div>
    <section class="pl-now" id="pl-now">
      <div class="pl-now-thumb"><canvas id="pl-thumb" width="320" height="180"></canvas><span class="pl-now-badge" id="pl-now-badge"></span></div>
      <div class="pl-now-body">
        <div class="pl-eyebrow">Agora</div>
        <b id="pl-now-title">${esc(cur?.label || '')}</b>
        <small id="pl-now-sub">#${pos || 1}/${list.length} · ${duration}</small>
        <div class="pl-prog" id="pl-prog" title="Clique para buscar"><i></i></div>
        <div class="pl-now-row">
          <span id="pl-now-time">0:00 / ${duration}</span>
          <span class="grow"></span>
          <button class="btn sm icon" id="pl-prev" title="Anterior na fila">⏮</button>
          <button class="btn sm icon primary" id="pl-play" title="Tocar/Pausar">▶</button>
          <button class="btn sm icon" id="pl-next" title="Próximo na fila">⏭</button>
          <input type="range" class="pl-vol" id="pl-vol" min="0" max="1" step="0.01" title="Volume" aria-label="Volume">
          <button class="btn sm" id="pl-stage" title="Colocar/tirar do palco">Palco</button>
        </div>
      </div>
    </section>
    <div class="pl-nextup"><span>Próximo</span><b id="pl-nextup-title">${next ? esc(next.label) : 'Fim da fila'}</b></div>
    <section class="pl-queue">
      <div class="pl-queue-head"><b>Fila</b><span class="hint">${list.length} ${list.length === 1 ? 'item' : 'itens'} · arraste para ordenar</span></div>
      <div class="pl-list" id="pl-list">${list.map((s, i) => {
        const onAir = S.take === s.id;
        const onStage = S.stage.includes(s.id);
        const playing = !s.el.paused && !s.el.ended;
        return `<div class="pl-item ${s.id === curId ? 'current' : ''} ${onAir ? 'on-air' : onStage ? 'on-stage' : ''} ${playing ? 'playing' : ''}" data-plid="${esc(s.id)}" draggable="true">
          <span class="pl-idx">${i + 1}</span>
          <canvas class="pl-item-thumb" width="128" height="72" data-plthumb></canvas>
          <div class="pl-item-info"><b>${esc(String(s.label).replace(/^[^\p{L}\p{N}]+/u, ''))}</b><small>${onAir ? 'No ar' : onStage ? 'No palco' : playing ? 'Tocando' : fmtClock(s.el.duration)}</small></div>
          <button class="btn sm icon" data-plcue title="Selecionar sem tocar">•</button>
          <button class="btn sm icon" data-plmore title="Mais ações">⋯</button>
        </div>`;
      }).join('')}</div>
    </section>
    <section class="pl-auto">
      <label class="check pl-opt"><span>Tocar um após o outro</span><span class="switch"><input type="checkbox" id="pl-on" ${S.playlist.on ? 'checked' : ''}><span></span></span></label>
      <label class="check pl-opt" title="${S.switcher ? 'Mesa: o próximo vídeo assume o take do PGM quando o atual termina' : 'Estúdio: o próximo vídeo assume o Solo ou o slot do palco quando o atual termina'}"><span>${S.switcher ? 'Seguir no PGM' : 'Seguir no palco'}</span><span class="switch"><input type="checkbox" id="pl-follow" ${S.playlist.follow !== false ? 'checked' : ''}><span></span></span></label>
      <label class="check pl-opt"><span>Repetir a lista</span><span class="switch"><input type="checkbox" id="pl-loop" ${S.playlist.loop ? 'checked' : ''}><span></span></span></label>
      <button class="btn sm primary" id="pl-start">▶ Tocar playlist</button>
    </section>`;
  $('#pl-open-media', p).onclick = () => openSideTab('media');
  $('#pl-play', p).onclick = () => {
    const s = S.sources.get(playoutCurrent());
    if (!s) return;
    if (s.el.ended) {
      s.el.currentTime = 0;
      playMedia(s.id);
    } else if (s.el.paused) playMedia(s.id);
    else s.el.pause();
    renderPlayoutPanel();
  };
  $('#pl-prev', p).onclick = () => playoutAdvance(-1);
  $('#pl-next', p).onclick = () => playoutAdvance(1);
  $('#pl-stage', p).onclick = () => {
    const s = S.sources.get(playoutCurrent());
    if (s) toggleStage(s.id);
    renderPlayoutPanel();
  };
  $('#pl-vol', p).oninput = (e) => {
    const s = S.sources.get(playoutCurrent());
    if (s) mixer.setVolume(s.id, +e.target.value);
  };
  $('#pl-prog', p).onclick = (e) => {
    const s = S.sources.get(playoutCurrent());
    if (!s?.el?.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    s.el.currentTime = ((e.clientX - r.left) / r.width) * s.el.duration;
  };
  $('#pl-start', p).onclick = () => {
    playlistStart();
    renderPlayoutPanel();
  };
  for (const [id, key] of [['pl-on', 'on'], ['pl-follow', 'follow'], ['pl-loop', 'loop']]) {
    const el = $('#' + id, p);
    if (el) el.onchange = (e) => {
      S.playlist[key] = e.target.checked;
      tickDeck();
    };
  }
  p.querySelectorAll('[data-plid]').forEach((row) => {
    const s = S.sources.get(row.dataset.plid);
    if (!s) return;
    row.querySelector('canvas[data-plthumb]') && paintPlayoutThumb(row.querySelector('canvas[data-plthumb]'), s);
    row.onclick = (e) => {
      if (e.target.closest('button[data-plmore]')) return;
      if (e.target.closest('button[data-plcue]')) {
        deckSel = s.id;
        tickDeck();
        renderPlayoutPanel();
        return;
      }
      deckSel = s.id;
      tickDeck();
      renderPlayoutPanel();
    };
    row.ondblclick = () => {
      s.el.currentTime = 0;
      playMedia(s.id);
      renderPlayoutPanel();
    };
    $('[data-plmore]', row).onclick = (e) => {
      e.stopPropagation();
      openMediaMenu(s).then(() => {
        if (tabOpen('playout')) renderPlayoutPanel();
      });
    };
    row.ondragstart = (e) => {
      if (e.target.closest('button')) return e.preventDefault();
      mediaDragId = s.id;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    };
    row.ondragend = () => {
      mediaDragId = null;
      p.querySelectorAll('.pl-item').forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after'));
    };
    row.ondragover = (e) => {
      if (!mediaDragId || mediaDragId === s.id) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      row.classList.toggle('drop-before', e.clientY < r.top + r.height / 2);
      row.classList.toggle('drop-after', e.clientY >= r.top + r.height / 2);
    };
    row.ondragleave = () => row.classList.remove('drop-before', 'drop-after');
    row.ondrop = (e) => {
      e.preventDefault();
      const before = row.classList.contains('drop-before');
      row.classList.remove('drop-before', 'drop-after');
      if (mediaDragId && mediaDragId !== s.id) reorderMedia(mediaDragId, s.id, before);
    };
  });
  updatePlayout();
}

function updatePlayout() {
  if (!tabOpen('playout')) return;
  const p = $('#panel-playout');
  if (!p || !$('#pl-now', p)) return;
  const list = mediaList();
  const curId = playoutCurrent();
  const cur = S.sources.get(curId);
  if (!cur) return renderPlayoutPanel();
  const sig = list.map((x) => x.id + '|' + x.label).join(',');
  if (sig !== playoutSig) return renderPlayoutPanel();
  const el = cur.el;
  const pos = queuePosition(curId);
  const cv = $('#pl-thumb', p);
  if (cv) paintPlayoutThumb(cv, cur);
  $('#pl-now-title', p).textContent = cur.label || '';
  $('#pl-now-sub', p).textContent = `#${pos || 1}/${list.length} · ${fmtClock(el.duration)}`;
  $('#pl-now-time', p).textContent = `${fmtClock(el.currentTime)} / ${fmtClock(el.duration)}`;
  $('#pl-now-badge', p).textContent = S.take === cur.id ? 'NO AR' : S.stage.includes(cur.id) ? 'NO PALCO' : '';
  $('#pl-now-badge', p).className = 'pl-now-badge' + (S.take === cur.id ? ' live' : S.stage.includes(cur.id) ? ' stage' : '');
  const prog = $('#pl-prog i', p);
  if (prog) prog.style.width = el.duration ? `${Math.min(100, (el.currentTime / el.duration) * 100)}%` : '0%';
  const play = $('#pl-play', p);
  if (play) play.textContent = el.ended ? '↻' : el.paused ? '▶' : '⏸';
  const vol = $('#pl-vol', p);
  if (vol && document.activeElement !== vol) vol.value = mixer.sources.get(cur.id)?.volume ?? 1;
  const stage = $('#pl-stage', p);
  if (stage) stage.textContent = S.take === cur.id ? 'No ar' : S.stage.includes(cur.id) ? 'No palco' : 'Palco';
  const nxt = queueNext(curId, 1);
  $('#pl-nextup-title', p).textContent = nxt ? nxt.label : 'Fim da fila';
  const rows = p.querySelectorAll('[data-plid]');
  rows.forEach((row) => {
    const s = S.sources.get(row.dataset.plid);
    if (!s) return;
    row.classList.toggle('current', s.id === curId);
    row.classList.toggle('on-air', S.take === s.id);
    row.classList.toggle('on-stage', S.stage.includes(s.id));
    row.classList.toggle('playing', !s.el.paused && !s.el.ended);
    const st = $('small', row);
    if (st) st.textContent = S.take === s.id ? 'No ar' : S.stage.includes(s.id) ? 'No palco' : !s.el.paused && !s.el.ended ? 'Tocando' : fmtClock(s.el.duration);
  });
}

function moveMediaSectionFirst(p) {
  const hs = [...p.children].filter((n) => n.tagName === 'H4');
  const v = hs.find((n) => n.textContent.includes('Vídeos e áudios'));
  const img = hs.find((n) => n.textContent.includes('Imagens'));
  if (!v || !img) return;
  if (!(img.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
  const r = document.createRange();
  r.setStartBefore(v);
  r.setEndBefore(img);
  const frag = r.extractContents();
  p.insertBefore(frag, p.querySelector('.ytdl-box') || img);
}

function reorderMedia(fromId, toId, before = true) {
  const ids = normalizeQueue().slice();
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return;
  ids.splice(from, 1);
  let at = ids.indexOf(toId);
  if (!before) at++;
  ids.splice(Math.max(0, at), 0, fromId);
  S.playlist.order = ids;
  // A ordem da fila mudou: o cursor continua no mesmo ID; as duas telas são leves.
  renderMediaPanel();
  if (tabOpen('playout')) renderPlayoutPanel();
  updateMediaRows();
}

async function openMediaMenu(s) {
  const el = s.el;
  const name = String(s.label || 'Mídia').replace(/^[^\p{L}\p{N}]+/u, '');
  const on = S.stage.includes(s.id);
  await modal(
    `<h3>${esc(name)}</h3>
     <p class="sub">${s.camOff ? 'Áudio' : 'Vídeo'}${el?.duration ? ` · ${fmtClock(el.duration)}` : ''}${S.take === s.id ? ' · NO AR' : on ? ' · NO PALCO' : ''}</p>
     <div class="m-menu-list">
       <button class="btn mm-restart">↺ Reiniciar</button>
       <button class="btn mm-loop">${el?.loop ? '✓ ' : ''}Repetir este item</button>
       <button class="btn mm-rename">✎ Renomear</button>
       <button class="btn mm-move">▲▼ Mover na playlist</button>
     </div>
     <label class="field" style="margin-top:12px"><span>Volume</span><input type="range" id="mm-vol" min="0" max="1" step="0.01" value="${mixer.sources.get(s.id)?.volume ?? 1}"></label>
     <div class="m-menu-list danger">
       <button class="btn danger mm-remove">Remover da playlist</button>
       <button class="btn danger mm-delete">Apagar arquivo do disco</button>
     </div>`,
    {
      onMount(m, close) {
        $('#mm-vol', m).oninput = (e) => mixer.setVolume(s.id, +e.target.value);
        $('.mm-restart', m).onclick = () => {
          el.currentTime = 0;
          pauseOtherVideos(s.id);
          el.play().catch(() => {});
          close();
        };
        $('.mm-loop', m).onclick = () => {
          el.loop = !el.loop;
          close();
          updateMediaRows();
        };
        $('.mm-rename', m).onclick = () => {
          close();
          renameSource(s.id);
        };
        $('.mm-move', m).onclick = async () => {
          close();
          const dir = await modal(`<h3>Mover na playlist</h3><p class="sub">${esc(name)}</p><div class="m-menu-list"><button class="btn" data-dir="-1">▲ Subir</button><button class="btn" data-dir="1">▼ Descer</button></div>`, {
            onMount(mm, c) {
              $$('[data-dir]', mm).forEach((b) => (b.onclick = () => c(+b.dataset.dir)));
            },
          });
          if (dir) {
            moveMedia(s.id, dir);
            updateMediaRows();
          }
        };
        $('.mm-remove', m).onclick = async () => {
          close();
          removeSource(s.id);
          renderMediaPanel();
        };
        $('.mm-delete', m).onclick = async () => {
          close();
          await deleteMediaFile(s);
          renderMediaPanel();
        };
      },
    },
  );
}

function paintMediaThumb(card, s) {
  const cv = $('canvas[data-mthumb]', card);
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const el = s.el;
  if (!s.camOff && el?.videoWidth) {
    const sc = Math.max(W / el.videoWidth, H / el.videoHeight);
    const dw = el.videoWidth * sc;
    const dh = el.videoHeight * sc;
    ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return;
  }
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#191a2b');
  g.addColorStop(1, '#0c0d16');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(160,150,255,.75)';
  ctx.font = '700 54px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♪', W / 2, H / 2 + 2);
}

function updateMediaRows() {
  const cards = $$('#panel-media .m-card');
  if (!cards.length) return;
  const now = performance.now();
  const draw = now - (updateMediaRows._t || 0) > 250;
  if (draw) updateMediaRows._t = now;
  let staged = 0;
  for (const card of cards) {
    const s = S.sources.get(card.dataset.mid);
    if (!s) continue;
    const el = s.el;
    const onAir = S.take === s.id;
    const onStage = S.stage.includes(s.id);
    const playing = !el?.paused && !el?.ended;
    const ended = !!el?.ended;
    if (onStage) staged++;
    card.classList.toggle('on-air', onAir);
    card.classList.toggle('on-stage', onStage);
    card.classList.toggle('playing', playing);
    card.classList.toggle('selected', s.id === deckSel);
    const play = $('.m-play', card);
    const icon = ended ? '↻' : playing ? '⏸' : '▶';
    if (play.textContent !== icon) {
      play.textContent = icon;
      play.title = ended ? 'Repetir' : playing ? 'Pausar' : 'Tocar';
    }
    const seek = $('.m-seek', card);
    if (!seek.dataset.drag && el?.duration) seek.value = (el.currentTime / el.duration) * 1000;
    if (el?.duration) seek.style.setProperty('--p', `${Math.min(100, (el.currentTime / el.duration) * 100)}%`);
    const time = $('.m-time', card);
    const t = `${fmtClock(el?.currentTime)} / ${fmtClock(el?.duration)}`;
    if (time.textContent !== t) time.textContent = t;
    const dur = $('.m-dur', card);
    const d = fmtClock(el?.duration);
    if (dur.textContent !== d) dur.textContent = d;
    const stage = $('.m-stage', card);
    const label = onAir ? 'No ar' : onStage ? 'No palco' : 'Pôr no palco';
    if (stage.textContent !== label) stage.textContent = label;
    stage.classList.toggle('primary', !onStage);
    stage.classList.toggle('live', onAir);
    const badges = [
      onAir ? '<span class="m-badge live">NO AR</span>' : onStage ? '<span class="m-badge stage">NO PALCO</span>' : '',
      ended ? '<span class="m-badge ended">FIM</span>' : playing ? '<span class="m-badge playing">TOCANDO</span>' : '',
    ].join('');
    const bEl = $('.m-badges', card);
    if (bEl && bEl.dataset.b !== badges) {
      bEl.dataset.b = badges;
      bEl.innerHTML = badges;
    }
    if (draw && !card.hidden) paintMediaThumb(card, s);
  }
  const c = $('#m-stage-count');
  if (c) c.textContent = String(staged);
}
setInterval(() => tabOpen('media') && updateMediaRows(), 300);


// =====================================================================
// Convidados (WebRTC)
// =====================================================================
function connectSignaling() {
  sig = new Signaling();
  sig.on('welcome', (m) => {
    for (const id of [...S.guests.keys()]) removeGuest(id, true);
    for (const g of m.guests) addGuest(g);
    S.outKey = m.outKey || '';
    outputs.setKey(m.outKey);
    remote?.setKey(m.outKey);
    outputs.reset(m.outputs || []);
    pushStudioState();
  });
  sig.on('output-joined', (m) => outputs.add(m.id, m.src));
  sig.on('output-left', (m) => outputs.remove(m.id));
  sig.on('guest-joined', (m) => {
    removeGuest(m.guest.id, true);
    addGuest(m.guest);
    gcDesigner?.onGuestJoin?.(m.guest);
    cameras?.refresh();
    if (tabOpen('intercom')) renderIntercomPanel();
    if (!intercomMiniEl?.hidden) paintIntercomMini();
    toast(`${m.guest.name} entrou no backstage`, 'ok');
  });
  sig.on('guest-left', (m) => {
    const g = S.guests.get(m.id);
    if (g) toast(`${g.name} saiu`);
    removeGuest(m.id);
    cameras?.refresh();
    if (tabOpen('intercom')) renderIntercomPanel();
    if (!intercomMiniEl?.hidden) paintIntercomMini();
  });
  sig.on('guest-state', (m) => {
    const g = S.guests.get(m.id);
    if (!g) return;
    const hadScreen = g.state.screenStreamId;
    g.state = m.state || {};
    g.name = g.state.name || g.name;
    if (!hadScreen && g.state.screenStreamId) toast(`${g.name} está compartilhando a tela`);
    resolveGuest(g);
    cameras?.refresh();
    if (tabOpen('intercom')) renderIntercomPanel();
    if (!intercomMiniEl?.hidden) paintIntercomMini();
  });
  sig.on('signal', (m) => {
    if (outputs.handleSignal(m)) return; // página de saída (OBS/vMix)
    if (remote?.handleSignal(m)) return; // controle remoto (áudio do PGM)
    const g = S.guests.get(m.from) || addGuest({ id: m.from, name: 'Convidado', state: {} });
    g.peer.handle(m.data);
  });
  sig.on('chat', addChat);
  sig.on('cohost-cmd', runCohostCmd);
  sig.on('remote-cmd', (m) => remote?.run(m));
  sig.on('remote-count', (m) => remote?.onCount(m));
  sig.on('remote-audio', (m) => remote?.onRemoteAudio(m));
  setInterval(cohostSync, 250);
  sig.on('error', (m) => {
    toast(m.message, 'err');
    if (m.code === 'replaced') setTimeout(() => (location.href = '/'), 2500);
  });
  sig.connect({ type: 'join', room: studioId, role: 'host', name: S.local.name });
}

// Retorno: acompanha o fps da mesa (mínimo 30), em 540p e com bitrate moderado.
// O fps nunca cai para 15; se a rede piorar, o bitrate cede antes da fluidez.
function guestReturnFps() {
  return Math.max(30, Number(S.system?.presets?.[S.preset]?.fps) || 30);
}
function guestReturnBase() {
  return guestReturnFps() >= 50 ? 3_200_000 : 2_200_000;
}
function guestReturnTarget(quality = 3) {
  const n = Number(quality);
  const q = Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : 3;
  const factor = [0.55, 0.68, 0.82, 1][q]; // ruim → bom
  return Math.round((guestReturnBase() * factor) / 50_000) * 50_000;
}

function addGuest(info) {
  if (S.guests.has(info.id)) return S.guests.get(info.id);
  const g = { id: info.id, name: info.name || 'Convidado', state: info.state || {}, streams: new Map(), cohost: !!info.cohost };
  // câmera remota (celular pelo QR /cam): só recebe o vídeo dela. Sem retorno nem mix-minus = sem encoder extra
  // no PC do host e sem gastar bateria/dados do celular.
  g.cam = !!g.state.cam;
  g.peer = new Peer({ id: g.id, polite: false, signal: (data) => sig.send({ type: 'signal', to: g.id, data }) });
  // Câmera remota e página de intercom usam o mesmo peer: um retorno de áudio pessoal
  // para o PTT do diretor/IFB, sem criar uma segunda conexão.
  if (g.cam) {
    const track = mixer.addIntercomOutput(g.id);
    if (track) {
      g.intercomTrack = track;
      g.intercomSender = g.peer.pc.addTrack(track, new MediaStream([track]));
      mixer.setIntercomProgram(g.id, S.intercom.ifb !== false, S.intercom.ifbLevel ?? 0.18);
    }
  }
  if (!g.cam) {
    g.view = new GuestView(comp, g.id, { fps: guestReturnFps() });
    g.returnBps = guestReturnBase();
    const vt = g.view.track;
    const mm = mixer.addGuestOutput(g.id);
    const out = new MediaStream([vt, mm]);
    g.videoSender = g.peer.pc.addTrack(vt, out);
    g.audioSender = g.peer.pc.addTrack(mm, out);
  }
  g.peer.addEventListener('track', (e) => {
    const { track, streams } = e.detail;
    const stream = streams[0] || new MediaStream([track]);
    g.streams.set(stream.id, stream);
    stream.onremovetrack = () => resolveGuest(g);
    stream.onaddtrack = () => resolveGuest(g);
    track.onunmute = () => resolveGuest(g);
    track.onended = () => resolveGuest(g);
    resolveGuest(g);
  });
  g.peer.addEventListener('state', (e) => {
    if (e.detail === 'connected') {
      S.stuckTries = 0;
      if (!g.videoSender) return; // câmera remota: o host não envia nada para ela
      g.returnBps = guestReturnBase();
      g.peer.setMaxBitrate(g.videoSender, g.returnBps);
      g.peer.setMaxBitrate(g.audioSender, 128_000);
      try {
        const p = g.videoSender.getParameters();
        if (!p.encodings?.length) p.encodings = [{}];
        p.encodings[0].scaleResolutionDownBy = 1;
        g.videoSender.setParameters(p).catch(() => {});
      } catch {}
    }
  });
  g.peer.addEventListener('stuck', () => {
    if (!S.guests.has(g.id)) return;
    // o convidado só reentra poucas vezes; sem rota (TURN) insistir só faz ele entrar e sair em loop
    S.stuckTries = (S.stuckTries || 0) + 1;
    const n = S.stuckTries;
    if (n > 3) {
      if (n === 4) toast(`Sem rota até ${g.name}. Configure um servidor TURN em Painel → Conexão.`, 'err');
      return;
    }
    toast(`Conexão com ${g.name} instável — reconectando…`, 'err');
    sig.send({ type: 'control', to: g.id, action: 'reconnect' });
    removeGuest(g.id, true);
  });
  g.peer.monitor((q) => {
    g.quality = q;
    const el = document.querySelector(`[data-qdot="${g.id}"]`);
    if (el) {
      el.className = `qdot q${q.quality}`;
      el.title = `${Math.round(q.rtt ?? 0)} ms · perda ${q.lossPct.toFixed(1)}% · ↑${Math.round(q.sendKbps)} ↓${Math.round(q.recvKbps)} kbps`;
    }
    // A rede define o bitrate, não o fps: o retorno continua fluido no preset da mesa.
    // A escada é proporcional ao preset (2,2/3,2 Mbps no topo) e nunca cai para 350 kbps.
    if (g.videoSender) {
      const target = guestReturnTarget(q.quality);
      if (Math.abs(target - (g.returnBps || 0)) >= 50_000) {
        g.returnBps = target;
        g.peer.setMaxBitrate(g.videoSender, target);
      }
    }
  });
  S.guests.set(g.id, g);
  resolveGuest(g);
  switcher?.guestReset(g.id);
  switcher?.syncTally();
  return g;
}

function resolveGuest(g) {
  if (S.guests.get(g.id) !== g && S.guests.has(g.id)) return;
  if (g.removed) return;
  const st = g.state || {};
  const camId = `${g.id}:cam`;
  const scrId = `${g.id}:screen`;
  let camStream = null;
  let scrStream = null;
  for (const [sid, stream] of g.streams) {
    if (!stream.getTracks().some((t) => t.readyState === 'live')) {
      g.streams.delete(sid);
      continue;
    }
    if (st.screenStreamId && sid === st.screenStreamId) scrStream = stream;
    else if (!st.camStreamId || sid === st.camStreamId) camStream ||= stream;
  }
  // Alguns navegadores entregam a faixa de áudio do PTT antes do evento `track` virar
  // um MediaStream em g.streams. Usa o receiver vivo como fallback para o intercom.
  if (!camStream) {
    const audio = (g.peer?.pc?.getReceivers?.() || []).find((r) => r.track?.kind === 'audio' && r.track.readyState === 'live');
    if (audio) {
      camStream = new MediaStream([audio.track]);
      g.streams.set(camStream.id, camStream);
    }
  }
  addVideoSource(camId, camStream, {
    kind: 'camera',
    label: g.name,
    ownerId: g.id,
    camOff: st.camOn === false || !camStream?.getVideoTracks().length,
    micOn: st.micOn !== false,
    remoteCam: !!g.cam,
  });
  syncAudio(camId + ':audio', camStream, g.id, camId);
  if (scrStream) {
    addVideoSource(scrId, scrStream, { kind: 'screen', label: `Tela de ${g.name}`, ownerId: g.id });
    syncAudio(scrId + ':audio', scrStream, g.id, scrId);
  } else if (S.sources.has(scrId)) {
    removeSource(scrId);
  }
}

function syncAudio(id, stream, ownerId, stageKey) {
  const t = stream?.getAudioTracks()[0];
  const cur = mixer.sources.get(id);
  if (!t) {
    if (cur) mixer.remove(id);
    return;
  }
  if (cur?.trackId === t.id) return;
  const s = mixer.addStream(id, stream, { ownerId, stageKey, monitor: true, remote: true });
  if (s) s.trackId = t.id;
  if (tabOpen('audio')) renderAudioPanel();
}

function removeGuest(id, silent) {
  const g = S.guests.get(id);
  if (!g) return;
  g.removed = true;
  g.peer.close();
  g.view?.close();
  mixer.removeGuestOutput(id);
  mixer.removeIntercomOutput(id);
  removeSource(`${id}:cam`);
  removeSource(`${id}:screen`);
  S.guests.delete(id);
  renderTiles();
  renderControls();
  if (!silent) pushStudioState();
}

async function kickGuest(id) {
  const g = S.guests.get(id);
  if (!g || !(await confirmDialog(`Remover ${g.name} do estúdio?`, { ok: 'Remover', danger: true }))) return;
  if (!S.guests.has(id)) return; // saiu sozinho enquanto o modal estava aberto
  sig.send({ type: 'control', to: id, action: 'kick' });
  removeGuest(id);
}

// =====================================================================
// Painéis laterais
// =====================================================================
function switchTab(tab) {
  if (floatWins?.has(tab)) return floatWins.raise(tab); // painel destacado: só traz a janela para frente
  const grp = TAB_GROUPS.find((g) => g.tabs.some(([id]) => id === tab));
  if (!grp) return;
  S.tab = tab;
  lastTabOf[grp.id] = tab;
  $$('.grp').forEach((g) => g.classList.toggle('active', g.dataset.group === grp.id));
  // sub-abas só do grupo atual; grupo de um item só não mostra a segunda linha
  $$('.subtabs .tab').forEach((t) => {
    t.hidden = t.dataset.group !== grp.id;
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  $('.subtabs')?.toggleAttribute('hidden', grp.tabs.length < 2);
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
  // proteção extra: o painel WhatsApp nunca deve ficar ativo dentro de Mídia/Banners/etc.
  const wpPanel = $('#panel-whatsapp');
  if (wpPanel) wpPanel.classList.toggle('active', tab === 'whatsapp' || !!floatWins?.has?.('whatsapp'));
  if (tab === 'chat') {
    S.unread = 0;
    updateUnread();
  }
  renderTabContent(tab);
  markFloating();
}

// abas abertas (na lateral ou destacadas) precisam continuar atualizando
function tabOpen(t) {
  return S.tab === t || !!floatWins?.has(t);
}
function renderTabContent(tab) {
  ({ journal: () => journal.render(), sports: () => sports.render(), widgets: () => widgets.render(), messages: () => messages.render(), whatsapp: () => whatsapp?.renderPanel(), brand: renderBrandPanel, banners: renderBannersPanel, chat: renderChatPanel, social: () => social.render($('#panel-social')), media: renderMediaPanel, playout: renderPlayoutPanel, audio: renderAudioPanel, captions: () => captions?.render(), director: () => (autoVoice?.mountPanel(), autoVoice?.paint(), remote?.mountPanel()), output: renderOutputPanel, display: renderDisplayPanel, devices: renderDevicesPanel, outputs: () => outputs.open(), intercom: renderIntercomPanel })[tab]?.();
}

// marca nas abas da lateral quais estão destacadas e cuida do botão ⧉
function markFloating() {
  $$('.subtabs .tab').forEach((b) => b.classList.toggle('floating', !!floatWins?.has(b.dataset.tab)));
  const d = $('#btn-detach');
  if (d) d.setAttribute('aria-pressed', String(!!floatWins?.has(S.tab)));
}
function detachCurrent(tab = S.tab) {
  if (!floatWins) return;
  if (!floatWins.open(tab)) return;
  const grp = TAB_GROUPS.find((g) => g.tabs.some(([id]) => id === tab));
  const next = grp?.tabs.find(([id]) => !floatWins.has(id))?.[0] || TAB_GROUPS.flatMap((g) => g.tabs).find(([id]) => !floatWins.has(id))?.[0];
  if (next) switchTab(next);
  else markFloating();
}

// ---------- Salvamento do estúdio (marca, GCs, widgets, times...) ----------
// Uma gravação por vez (nunca chegam fora de ordem), nova tentativa automática se falhar, detecção de
// outra janela salvando o mesmo estúdio (revisão/409) e gravação imediata ao esconder/fechar a página.
const saver = { timer: 0, running: null, dirty: false, rev: null, fails: 0, conflict: false, state: 'saved' };
const studioBody = () => ({ brand: { ...S.brand, layout: S.layout, preset: S.preset, encoder: S.encoder, bitrate: S.bitrate }, banners: S.banners, gcTemplates: S.gcTemplates || [] });
function setSaveState(state, msg = '') {
  saver.state = state;
  const el = $('#save-state');
  if (!el) return;
  el.dataset.state = state;
  el.textContent = { saved: 'Salvo', pending: 'Salvando…', error: 'Não salvo — tentando de novo', conflict: 'Alterado em outra janela' }[state] || '';
  el.title = msg || (state === 'saved' ? 'Todas as alterações foram salvas' : state === 'conflict' ? 'Clique para resolver' : '');
}
function saveStudio() {
  renderGcBar();
  saver.dirty = true;
  if (saver.conflict) return;
  setSaveState('pending');
  clearTimeout(saver.timer);
  saver.timer = setTimeout(flushStudio, 400);
}
async function flushStudio(force = false) {
  clearTimeout(saver.timer);
  if (saver.running) return saver.running; // a gravação em andamento faz mais uma passada se houver mudanças
  if (!saver.dirty || (saver.conflict && !force)) return;
  saver.running = (async () => {
    while (saver.dirty && (!saver.conflict || force)) {
      saver.dirty = false;
      const body = studioBody();
      if (saver.rev !== null) body.baseRev = saver.rev;
      if (force) body.force = true;
      try {
        const r = await api(`/studios/${studioId}`, { method: 'PUT', body });
        if (typeof r?.rev === 'number') saver.rev = r.rev;
        saver.fails = 0;
        saver.conflict = false;
        force = false;
      } catch (e) {
        saver.dirty = true;
        if (e.status === 409) {
          saver.conflict = true;
          setSaveState('conflict', e.message);
          resolveConflict();
          break;
        }
        saver.fails++;
        setSaveState('error', e.message);
        if (saver.fails === 3) toast('Não foi possível salvar o estúdio (' + e.message + '). Vou continuar tentando.', 'err');
        await new Promise((r) => setTimeout(r, Math.min(15000, 800 * 2 ** saver.fails)));
      }
    }
  })();
  try {
    await saver.running;
  } finally {
    saver.running = null;
  }
  if (!saver.conflict) setSaveState(saver.dirty ? 'pending' : 'saved');
  if (saver.dirty && !saver.conflict) saver.timer = setTimeout(flushStudio, 400);
}
let conflictOpen = false;
async function resolveConflict() {
  if (conflictOpen) return;
  conflictOpen = true;
  const keep = await modal(
    `<h3>Estúdio alterado em outra janela</h3>
     <p class="sub">Outra janela ou aba salvou este estúdio depois que você o abriu. Para não perder nada, escolha qual versão fica valendo.</p>
     <div class="modal-actions"><button class="btn" id="cf-reload">Recarregar a versão salva</button><button class="btn primary" id="cf-keep">Manter as alterações desta janela</button></div>`,
    {
      onMount(m, close) {
        $('#cf-reload', m).onclick = () => close('reload');
        $('#cf-keep', m).onclick = () => close('keep');
      },
    },
  );
  conflictOpen = false;
  if (keep === 'reload') {
    saver.dirty = false;
    location.reload();
  } else if (keep === 'keep') {
    saver.dirty = true;
    await flushStudio(true);
    toast('Alterações desta janela salvas', 'ok');
  } else setSaveState('conflict');
}
// clique no indicador: resolve o conflito ou tenta salvar de novo agora
document.addEventListener('click', (e) => {
  if (!e.target.closest?.('#save-state')) return;
  if (saver.state === 'conflict') resolveConflict();
  else if (saver.state === 'error' && !saver.running) flushStudio();
});
// esconder a aba/minimizar: grava já; fechar: tenta gravar e avisa se ainda houver algo pendente
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saver.dirty && flushStudio());
window.addEventListener('pagehide', () => {
  if (!saver.dirty || saver.conflict) return;
  const body = studioBody();
  if (saver.rev !== null) body.baseRev = saver.rev;
  const json = JSON.stringify(body);
  // keepalive só aceita corpos pequenos (~64 KB); acima disso o beforeunload avisa o usuário
  if (json.length < 60000) fetch(`/api/studios/${studioId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true }).catch(() => {});
});
window.addEventListener('beforeunload', (e) => {
  if ((saver.dirty || saver.running) && !saver.conflict) {
    flushStudio();
    e.preventDefault();
    e.returnValue = '';
  }
});

function setBrand(patch) {
  Object.assign(S.brand, patch);
  comp.setBrand(S.brand);
  saveStudio();
  if ('showNames' in patch || 'showMediaNames' in patch) renderControls();
  if ('autoPlayMedia' in patch) renderAutoPlayBtn();
}

function renderAutoPlayBtn() {
  const btn = $('#btn-autoplay');
  if (!btn) return;
  const on = autoPlayMediaEnabled();
  btn.classList.toggle('on', on);
  btn.classList.toggle('off', !on);
  btn.setAttribute('aria-pressed', String(on));
  const msg = on
    ? 'Auto play ligado: ao entrar no PGM ou no palco, o vídeo começa a tocar (um vídeo por vez).'
    : 'Auto play desligado: entrar no PGM ou no palco não inicia o vídeo; use Tocar manualmente.';
  btn.title = msg;
  btn.setAttribute('aria-label', msg);
  const state = btn.querySelector('.auto-state');
  if (state) state.textContent = on ? 'ON' : 'OFF';
}

function readImage(file, maxSide, type = 'image/png') {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // SVG sem width/height retorna 0: usa um tamanho base
      const iw = img.naturalWidth || img.width || 512;
      const ih = img.naturalHeight || img.height || 512;
      const sc = Math.min(1, maxSide / Math.max(iw, ih));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(iw * sc));
      c.height = Math.max(1, Math.round(ih * sc));
      const x = c.getContext('2d');
      if (type === 'image/jpeg') {
        x.fillStyle = '#000';
        x.fillRect(0, 0, c.width, c.height);
      }
      x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL(type, 0.88));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('formato de imagem não suportado'));
    };
    img.src = url;
  });
}

// O input precisa estar no DOM: inputs soltos podem ser coletados pelo navegador antes do evento 'change'.
function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = h(`<input type="file" accept="${accept}" style="position:fixed;left:-9999px;opacity:0" tabindex="-1">`);
    const done = (f) => {
      inp.remove();
      resolve(f);
    };
    inp.onchange = () => done(inp.files[0] || null);
    inp.addEventListener('cancel', () => done(null));
    document.body.append(inp);
    inp.click();
  });
}

// Envia uma imagem (pelo seletor ou arrastada): valida, converte, mostra progresso e erros.
async function uploadImage(file, { maxSide, type, label }, apply) {
  if (!file) return;
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(file.name)) return toast(`${label}: escolha um arquivo de imagem`, 'err');
  if (file.size > 40 * 1024 * 1024) return toast(`${label}: arquivo muito grande (máx. 40 MB)`, 'err');
  toast(`Enviando ${label.toLowerCase()}…`);
  try {
    const data = await readImage(file, maxSide, type);
    apply(data);
    toast(`${label} atualizado`, 'ok');
  } catch (e) {
    toast(`${label}: ${e.message}`, 'err');
  }
  renderBrandPanel();
}

function renderBrandPanel() {
  const b = S.brand;
  const bgs = [...BUILTIN_BG, ...(b.customBackgrounds || []).map((v) => ({ type: 'image', value: v, custom: true }))];
  const isBg = (x) => b.background?.type === x.type && b.background?.value === x.value;
  const bgVideoId = b.background?.type === 'video' ? b.background.value : '';
  const bgVideos = [...S.sources.values()].filter((s) => s.kind === 'media' && !s.camOff);
  const ovs = [...(Array.isArray(b.overlays) ? b.overlays : [])];
  if (b.overlay && !ovs.includes(b.overlay)) ovs.unshift(b.overlay);
  const bgStyle = (x) =>
    x.type === 'image' ? `background-image:url('${x.value}')` : x.type === 'color' ? `background:${x.value}` : `background:linear-gradient(135deg, ${b.color}, #0b0b12)`;
  const p = $('#panel-brand');
  p.innerHTML = `
    <h4>Cor do tema</h4>
    <div class="swatches">
      ${COLORS.map((c) => `<button class="swatch ${b.color === c ? 'active' : ''}" data-color="${c}" style="background:${c}" title="Cor do tema ${c}" aria-label="Cor do tema ${c}" aria-pressed="${b.color === c}"></button>`).join('')}
      <input type="color" id="b-color" value="${b.color}" title="Cor personalizada do tema" aria-label="Cor personalizada do tema" style="width:30px;height:30px;border:none;background:none;padding:0;cursor:pointer">
    </div>
    <h4>Fundo</h4>
    <div class="thumbs">
      ${bgs.map((x, i) => `<div class="thumb ${isBg(x) ? 'active' : ''}" data-bg="${i}" style="${bgStyle(x)}">${x.custom ? `<button class="x" data-delbg="${esc(x.value.slice(-24))}">✕</button>` : ''}</div>`).join('')}
      <div class="thumb add" id="b-addbg">${icons.plus}</div>
    </div>
    <h4>Vídeo de fundo</h4>
    <div class="row bgvideo-row">
      <select class="input grow" id="b-bgvideo" title="Vídeo mudo em loop atrás da cena">
        <option value="">Nenhum — usar imagem/cor</option>
        ${bgVideos.map((s) => `<option value="${esc(s.id)}" ${bgVideoId === s.id ? 'selected' : ''}>${esc(s.label || s.id)}</option>`).join('')}
      </select>
      <button class="btn sm" id="b-bgvideo-add">${icons.film} Enviar vídeo</button>
      ${bgVideoId ? `<button class="btn sm danger icon" id="b-bgvideo-del" title="Remover vídeo de fundo">${icons.trash}</button>` : ''}
    </div>
    <p class="hint" style="margin:-4px 0 10px">O vídeo de fundo fica mudo e em loop atrás da cena; ele também entra na playlist.</p>
    <h4>Logo</h4>
    <div class="row dropzone" data-drop="logo">
      ${b.logo ? `<img src="${b.logo}" style="height:40px;max-width:120px;object-fit:contain;background:var(--bg-2);border-radius:8px;padding:4px">` : '<span class="hint grow">Arraste uma imagem aqui ou clique em Enviar</span>'}
      <div class="grow"></div>
      <button class="btn sm" id="b-logo">${b.logo ? 'Trocar' : 'Enviar logo'}</button>
      ${b.logo ? '<button class="btn sm danger icon" id="b-logo-del">' + icons.trash + '</button>' : ''}
    </div>
    ${b.logo ? `<div class="seg" id="b-logopos" style="margin-top:10px">${[['tl', '↖ Cima esq.'], ['tr', 'Cima dir. ↗'], ['bl', '↙ Baixo esq.'], ['br', 'Baixo dir. ↘']].map(([v, l]) => `<button data-v="${v}" class="${(b.logoPos || 'tr') === v ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div class="mixer-row"><span class="nm">Tamanho</span><input type="range" id="b-logosize" min="5" max="35" value="${b.logoSize || 11}"></div>` : ''}
    <h4>Overlays (PNG/WebP 16:9 transparente)</h4>
    <div class="overlay-list">
      ${ovs.map((src, i) => `<div class="overlay-item"><img src="${src}" alt="Overlay ${i + 1}" style="height:44px;aspect-ratio:16/9;object-fit:cover;background:var(--bg-2);border-radius:6px"><span>${i + 1}</span><button class="btn sm danger icon" data-ov-del="${i}" title="Remover este overlay">${icons.trash}</button></div>`).join('') || ''}
    </div>
    <div class="row dropzone" data-drop="overlay">
      <span class="hint grow">${ovs.length ? 'Arraste mais um PNG/WebP transparente ou use o botão' : 'Arraste um PNG/WebP transparente aqui'}</span>
      <button class="btn sm" id="b-ov">＋ Adicionar overlay</button>
    </div>
    <p class="hint" style="margin:8px 0 0">Dá para empilhar vários overlays; a ordem da lista é a ordem de desenho.</p>
    <p class="hint" style="margin:14px 0 0">Nomes na tela, espaçamento e cantos dos vídeos ficam na aba <b>Exibição</b>, ao lado.</p>
  `;
  $$('[data-color]', p).forEach((el) => (el.onclick = () => (setBrand({ color: el.dataset.color }), renderBrandPanel())));
  $('#b-color', p).onchange = (e) => (setBrand({ color: e.target.value }), renderBrandPanel());
  $$('[data-bg]', p).forEach(
    (el) =>
      (el.onclick = (e) => {
        if (e.target.closest('.x')) return;
        const x = bgs[+el.dataset.bg];
        setBrand({ background: { type: x.type, value: x.value } });
        renderBrandPanel();
      }),
  );
  $$('[data-delbg]', p).forEach(
    (el) =>
      (el.onclick = () => {
        const tail = el.dataset.delbg;
        setBrand({ customBackgrounds: (b.customBackgrounds || []).filter((v) => !v.endsWith(tail)) });
        renderBrandPanel();
      }),
  );
  $('#b-bgvideo', p)?.addEventListener('change', (e) => {
    const id = e.target.value;
    setBrand({ background: id ? { type: 'video', value: id } : { type: 'gradient', value: '' } });
    renderBrandPanel();
  });
  $('#b-bgvideo-add', p)?.addEventListener('click', async () => {
    const f = await pickFile('video/*');
    if (!f) return;
    const s = addMediaFile(f, { silent: true });
    if (!s) return;
    setBrand({ background: { type: 'video', value: s.id } });
    if (tabOpen('brand')) renderBrandPanel();
    toast('Vídeo de fundo em loop e mudo', 'ok');
  });
  $('#b-bgvideo-del', p)?.addEventListener('click', () => {
    setBrand({ background: { type: 'gradient', value: '' } });
    renderBrandPanel();
  });
  const UP = {
    bg: { maxSide: 1920, type: 'image/jpeg', label: 'Fundo', apply: (d) => setBrand({ customBackgrounds: [...(S.brand.customBackgrounds || []), d].slice(-6), background: { type: 'image', value: d } }) },
    logo: { maxSide: 600, type: 'image/png', label: 'Logo', apply: (d) => setBrand({ logo: d }) },
    overlay: {
      maxSide: 1600,
      type: 'image/webp',
      label: 'Overlay',
      apply: (d) => {
        const list = [...(Array.isArray(S.brand.overlays) ? S.brand.overlays : [])];
        if (S.brand.overlay && !list.includes(S.brand.overlay)) list.unshift(S.brand.overlay);
        if (list.includes(d)) return;
        if (list.length >= 6) return toast('Máximo de 6 overlays por estúdio.', 'err');
        const total = list.reduce((n, s) => n + String(s).length, 0) + d.length;
        if (total > 1_700_000) return toast('Overlays grandes demais juntos; use imagens mais leves.', 'err');
        list.push(d);
        setBrand({ overlays: list, overlay: null });
      },
    },
  };
  const pickAndUpload = async (k) => uploadImage(await pickFile('image/*'), UP[k], UP[k].apply);
  $('#b-addbg', p).onclick = () => pickAndUpload('bg');
  $('#b-logo', p).onclick = () => pickAndUpload('logo');
  $('#b-ov', p).onclick = () => pickAndUpload('overlay');
  // arrastar e soltar arquivos de imagem sobre cada área
  const dropOn = (el, k) => {
    if (!el) return;
    el.addEventListener('dragover', (e) => {
      if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
      e.preventDefault();
      el.classList.add('drop-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drop-over');
      const f = [...(e.dataTransfer?.files || [])].find((x) => /^image\//.test(x.type) || /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(x.name));
      if (f) uploadImage(f, UP[k], UP[k].apply);
      else toast('Solte um arquivo de imagem', 'err');
    });
  };
  dropOn($('.thumbs', p), 'bg');
  dropOn($('[data-drop=logo]', p), 'logo');
  dropOn($('[data-drop=overlay]', p), 'overlay');
  $('#b-logo-del', p)?.addEventListener('click', () => (setBrand({ logo: null }), renderBrandPanel()));
  $$('#b-logopos button', p).forEach((el) => (el.onclick = () => (setBrand({ logoPos: el.dataset.v }), renderBrandPanel())));
  $('#b-logosize', p)?.addEventListener('input', (e) => setBrand({ logoSize: +e.target.value }));
  $$('[data-ov-del]', p).forEach((btn) => {
    btn.onclick = () => {
      const list = [...(Array.isArray(S.brand.overlays) ? S.brand.overlays : [])];
      if (S.brand.overlay && !list.includes(S.brand.overlay)) list.unshift(S.brand.overlay);
      list.splice(Number(btn.dataset.ovDel), 1);
      setBrand({ overlays: list, overlay: null });
      renderBrandPanel();
    };
  });
}

// Configurar → Exibição: como as pessoas aparecem no vídeo (nomes, espaçamento e cantos).
// Antes ficava na aba Marca; os valores continuam em S.brand (nada muda no que já estava salvo).
function renderDisplayPanel() {
  const b = S.brand;
  const p = $('#panel-display');
  p.innerHTML = `
    <h4>Nomes na tela</h4>
    <label class="check" style="justify-content:space-between"><span>Mostrar nomes</span><span class="switch"><input type="checkbox" id="b-names" ${b.showNames ? 'checked' : ''}><span></span></span></label>
    <div class="seg" id="b-namestyle">
      ${[['bubble', 'Bolha'], ['block', 'Bloco'], ['minimal', 'Mínimo']].map(([v, l]) => `<button data-v="${v}" class="${b.nameStyle === v ? 'active' : ''}">${l}</button>`).join('')}
    </div>
    <h4>Espaçamento e cantos</h4>
    <div class="seg" id="b-padding" style="margin-bottom:12px">
      ${[['tight', 'Justo'], ['normal', 'Normal'], ['wide', 'Amplo']].map(([v, l]) => `<button data-v="${v}" class="${b.padding === v ? 'active' : ''}">${l}</button>`).join('')}
    </div>
    <div class="mixer-row"><span class="nm">Arredondamento</span><input type="range" id="b-corner" min="0" max="40" value="${b.corner}"></div>
  `;
  $('#b-names', p).onchange = (e) => setBrand({ showNames: e.target.checked });
  $$('#b-namestyle button', p).forEach((el) => (el.onclick = () => (setBrand({ nameStyle: el.dataset.v }), renderDisplayPanel())));
  $$('#b-padding button', p).forEach((el) => (el.onclick = () => (setBrand({ padding: el.dataset.v }), renderDisplayPanel())));
  $('#b-corner', p).oninput = (e) => setBrand({ corner: +e.target.value });
}

const BN_STYLES = [['news', 'Jornal'], ['bar', 'Barra'], ['card', 'Cartão'], ['clean', 'Limpo'], ['center', 'Centro']];
const BN_POS = [['bl', 'Embaixo à esquerda'], ['bc', 'Embaixo no centro'], ['br', 'Embaixo à direita'], ['tl', 'Em cima à esquerda'], ['tc', 'Em cima no centro'], ['tr', 'Em cima à direita']];
const BN_DUR = [[0, 'Manual'], [5, '5 s'], [8, '8 s'], [10, '10 s'], [15, '15 s'], [30, '30 s'], [60, '1 min']];
const bnLabel = (arr, v) => arr.find(([k]) => k == v)?.[1] || '';
const bnOpts = (arr, v) => arr.map(([k, l]) => `<option value="${k}" ${k == v ? 'selected' : ''}>${l}</option>`).join('');
let bannerTimer = null;
let journal = null;
let widgets = null;
let messages = null;
let sports = null;
let rotateTimer = null;

function bannerFields(b = {}) {
  return `
    <label class="field"><span>Título</span><input class="input" id="bf-title" maxlength="90" value="${esc(b.title || '')}" placeholder="Ex.: Bem-vindos à live!"></label>
    <label class="field"><span>Subtítulo (opcional)</span><input class="input" id="bf-sub" maxlength="120" value="${esc(b.subtitle || '')}"></label>
    <div class="row" style="gap:10px"><label class="field grow"><span>Estilo</span><select class="input" id="bf-style">${bnOpts(BN_STYLES, b.style || 'bar')}</select></label>
    <label class="field grow"><span>Posição</span><select class="input" id="bf-pos">${bnOpts(BN_POS, b.pos || 'bl')}</select></label></div>
    <div class="row" style="gap:10px"><label class="field grow"><span>Tempo no ar</span><select class="input" id="bf-dur">${bnOpts(BN_DUR, b.dur || 0)}</select></label>
    <label class="field"><span>Cor</span><span class="row" style="gap:6px"><input type="color" id="bf-color" value="${b.color || S.brand.color || '#7c5cff'}" style="width:40px;height:40px;border:none;background:none;padding:0;cursor:pointer"><label class="check" style="font-size:12px"><input type="checkbox" id="bf-usecolor" ${b.color ? 'checked' : ''}> própria</label></span></label></div>`;
}
function readBannerFields(root) {
  const title = $('#bf-title', root).value.trim();
  return {
    title,
    subtitle: $('#bf-sub', root).value.trim(),
    style: $('#bf-style', root).value,
    pos: $('#bf-pos', root).value,
    dur: +$('#bf-dur', root).value,
    color: $('#bf-usecolor', root).checked ? $('#bf-color', root).value : null,
  };
}

// ---------- Menus em acordeão: cada seção (h4) do painel vira um <details> que lembra se estava aberto ----------
const ACC_KEY = 'castdeck.acc';
const ACC_CLOSED = new Set(['Novo banner', 'Letreiro (ticker)', 'Exibição no ar', 'Playlist', 'Relógio e regras']);
function accordionize(panel) {
  if (!panel.querySelector(':scope > h4')) return;
  let state = {};
  try {
    state = JSON.parse(localStorage.getItem(ACC_KEY) || '{}');
  } catch {}
  const frag = document.createDocumentFragment();
  let body = null;
  for (const node of [...panel.childNodes]) {
    if (node.nodeType === 1 && node.tagName === 'H4') {
      const title = (node.childNodes[0]?.textContent || node.textContent).trim();
      const key = `${panel.id}|${title}`;
      const d = document.createElement('details');
      d.className = 'acc';
      d.open = state[key] ?? !ACC_CLOSED.has(title);
      d.ontoggle = () => {
        let s = {};
        try {
          s = JSON.parse(localStorage.getItem(ACC_KEY) || '{}');
        } catch {}
        s[key] = d.open;
        localStorage.setItem(ACC_KEY, JSON.stringify(s));
      };
      const sum = document.createElement('summary');
      sum.append(...node.childNodes);
      body = document.createElement('div');
      body.className = 'acc-body';
      d.append(sum, body);
      frag.append(d);
    } else (body || frag).append(node);
  }
  panel.replaceChildren(frag);
}
function initAccordions() {
  for (const p of $$('.side .panel')) {
    new MutationObserver(() => accordionize(p)).observe(p, { childList: true });
  }
}
// Lista "No ar" do Grafismo: mostra GC, banner/placar e letreiro ativos no menu.
function renderGcAirList() {
  const items = [];
  if (S.activeBanner) {
    const id = String(S.activeBanner);
    const kind = id === 'gc:air' ? 'GC' : id.startsWith('sp:') ? 'Placar' : 'Banner';
    items.push({ kind, title: S.activeBannerTitle || kind, id });
  }
  if (S.brand.tickerOn && S.brand.tickerText) items.push({ kind: 'Letreiro', title: S.brand.tickerText, id: 'ticker' });

  const badges = $$('.gf-live-count');
  for (const b of badges) {
    b.textContent = String(items.length);
    b.hidden = items.length === 0;
  }
  const box = $('#gf-air-list');
  if (!box) return;
  box.innerHTML = items.length
    ? items.map((it) => `<div class="gf-air-item">
        <span class="pill live">NO AR</span>
        <b>${esc(it.kind)}</b>
        <span class="gf-air-title" title="${esc(it.title)}">${esc(it.title)}</span>
        <button type="button" class="btn ghost sm" data-air-off="${esc(it.id)}" title="Tirar do ar">✕ Tirar</button>
      </div>`).join('')
    : '<div class="gf-air-empty">Nada no ar.</div>';
}

function renderBannersPanel() {
  const p = $('#panel-banners');
  const rot = S.brand.bannerRotate || { on: false, secs: 10 };
  const open = (k, def) => {
    const v = localStorage.getItem('castdeck.gcsec.' + k);
    return v === null ? def : v === '1';
  };
  const layers = S.brand.overlayLayers || { aboveDsk: false };
  const android = S.system?.platform === 'android';
  p.innerHTML = `
    <div class="gc-layerbar ${android ? 'is-disabled' : ''}" title="Comentários, enquetes e banners: atrás ou acima do DSK 1/2">
      <div class="gc-layerbar-t">
        <strong>Overlays sobre o DSK</strong>
        <small>${android ? 'Indisponível no Android — o DSK não é renderizado aqui.' : 'Comentários, enquetes e banners: atrás (padrão) ou acima do DSK.'}</small>
      </div>
      <label class="switch" aria-label="Colocar comentários, enquetes e banners acima do DSK">
        <input type="checkbox" id="gcl-front" ${layers.aboveDsk ? 'checked' : ''} ${android ? 'disabled' : ''}>
        <span></span>
      </label>
    </div>
    <div class="gc-acc-stack">
      <details class="gc-acc" data-sec="studio" ${open('studio', true) ? 'open' : ''}>
        <summary>GC / Template Studio</summary>
        <div class="gc-acc-body">${gcDesigner ? gcDesigner.operatorHtml() : ''}</div>
      </details>

      <details class="gc-acc" data-sec="banners" ${open('banners', false) ? 'open' : ''}>
        <summary>Banners</summary>
        <div class="gc-acc-body">
          <h4>Novo banner</h4>
          <div id="bn-new">${bannerFields({ style: 'bar', pos: 'bl' })}</div>
          <button class="btn primary" id="bn-add" style="width:100%">${icons.plus} Adicionar banner</button>
          <h4>Banners <span class="hint" style="text-transform:none;letter-spacing:0">— clique para mostrar/ocultar</span></h4>
          <div id="bn-list">${
            S.banners.length
              ? S.banners
                  .map(
                    (bn, i) => `<div class="banner-item ${S.activeBanner === bn.id ? 'showing' : ''}" data-id="${bn.id}">
                      <div class="row" style="gap:6px"><strong class="grow">${esc(bn.title)}</strong>${S.activeBanner === bn.id ? '<span class="pill live">NO AR</span>' : ''}</div>
                      ${bn.subtitle ? `<span>${esc(bn.subtitle)}</span>` : ''}
                      <div class="bn-meta"><i style="background:${bn.color || S.brand.color || '#7c5cff'}"></i>${bnLabel(BN_STYLES, bn.style || 'bar')} · ${bnLabel(BN_POS, bn.pos || 'bl')} · ${bn.dur ? bn.dur + ' s' : 'manual'}</div>
                      <div class="bn-acts">
                        <button class="btn ghost sm icon" data-up="${bn.id}" title="Subir" ${i ? '' : 'disabled'}>▲</button>
                        <button class="btn ghost sm icon" data-down="${bn.id}" title="Descer" ${i < S.banners.length - 1 ? '' : 'disabled'}>▼</button>
                        <button class="btn ghost sm icon" data-edit="${bn.id}" title="Editar">✎</button>
                        <button class="btn ghost sm icon" data-dup="${bn.id}" title="Duplicar">⧉</button>
                        <button class="btn ghost sm icon" data-del="${bn.id}" title="Excluir">${icons.trash}</button>
                      </div></div>`,
                  )
                  .join('')
              : '<div class="empty">Nenhum banner ainda.</div>'
          }</div>
          <label class="check" style="justify-content:space-between;margin-top:10px"><span>Alternar banners automaticamente</span><span class="switch"><input type="checkbox" id="bn-rot" ${rot.on ? 'checked' : ''}><span></span></span></label>
          <label class="mixer-row"><span class="nm">A cada</span><input type="range" id="bn-rot-s" min="5" max="60" step="5" value="${rot.secs}"><span class="hint" id="bn-rot-v">${rot.secs}s</span></label>
        </div>
      </details>

      <details class="gc-acc" data-sec="letreiro" ${open('letreiro', false) ? 'open' : ''}>
        <summary>Letreiro &amp; RSS</summary>
        <div class="gc-acc-body">
          <h4>Letreiro (ticker)</h4>
          <textarea class="input" id="tk-text" placeholder="Texto que rola na parte inferior da tela" maxlength="400">${esc(S.brand.tickerText || '')}</textarea>
          <label class="check" style="justify-content:space-between;margin-top:6px"><span>Mostrar letreiro</span><span class="switch"><input type="checkbox" id="tk-on" ${S.brand.tickerOn ? 'checked' : ''}><span></span></span></label>
          ${news ? news.html() : ''}
        </div>
      </details>
    </div>
  `;

  // Hub Grafismo: substitui o antigo painel "GCs & Letreiro" por uma única área
  // com operação, biblioteca, dados e saídas. Os IDs antigos continuam no DOM
  // para preservar compatibilidade com binds/testes e com o restante do estúdio.
  const gfHub = document.createElement('div');
  gfHub.className = 'gf-hub';
  const gfPane = (id) => {
    const sec = document.createElement('section');
    sec.className = 'gf-pane';
    sec.dataset.gfsec = id;
    return sec;
  };
  const gfTemplates = gfPane('templates');
  const gfData = gfPane('data');
  const gfOutputs = gfPane('outputs');
  const gfStack = $('.gc-acc-stack', p);
  const gfStudio = gfStack?.querySelector('details[data-sec="studio"]');
  const gfOperator = document.createDocumentFragment();
  if (gfStudio) {
    const gfStudioBody = gfStudio.querySelector('.gc-acc-body');
    if (gfStudioBody) gfOperator.append(...gfStudioBody.childNodes);
  }
  const gfAirBox = document.createElement('div');
  gfAirBox.className = 'gf-air-box';
  gfAirBox.innerHTML = `<div class="gf-pane-head"><b>No ar agora</b><button type="button" class="btn ghost sm" id="gf-air-clear">Limpar tudo</button></div><div id="gf-air-list"></div>`;
  const gfLayerbar = $('.gc-layerbar', p);
  if (gfLayerbar) gfOutputs.append(gfLayerbar);
  let gfBannersBody = null;
  let gfTickerBody = null;
  gfStack?.querySelectorAll('details.gc-acc').forEach((d) => {
    if (d.dataset.sec === 'studio') return;
    const body = d.querySelector('.gc-acc-body');
    if (d.dataset.sec === 'banners') gfBannersBody = body;
    else if (d.dataset.sec === 'letreiro') gfTickerBody = body;
    else { d.classList.add('acc'); gfOutputs.append(d); }
  });
  if (gcDesigner) {
    gfTemplates.innerHTML = gcDesigner.galleryHtml();
  } else {
    gfTemplates.innerHTML = '<div class="hint">Template Studio indisponível.</div>';
  }
  const gfSched = Array.isArray(S.brand.gcSchedule) ? S.brand.gcSchedule : [];
  const gfGuestCount = S.guests instanceof Map ? S.guests.size : 0;
  const gfSchedRows = gfSched.length
    ? gfSched.map((s) => {
      const t = S.gcTemplates.find((x) => x.id === s.templateId);
      return `<div class="gf-sched-item"><b>${esc(s.at)}</b><span>${esc(t?.name || 'Template removido')}</span><small>${s.dur || 0}s</small><button type="button" class="btn ghost sm" data-gf-unsched="${esc(s.id)}" title="Cancelar agendamento">×</button></div>`;
    }).join('')
    : '<div class="hint">Nenhum GC agendado.</div>';
  gfData.innerHTML = `
    <div class="gf-pane-head"><b>Dados</b><span class="hint">fontes que alimentam o GC</span></div>
    <div class="gf-data-grid">
      <div class="gf-data-card">
        <span class="gf-data-kicker">Convidado</span>
        <b>${gfGuestCount} no backstage</b>
        <p>Puxa nome e função de quem está no palco/backstage.</p>
        <button type="button" class="btn ghost sm" id="gf-fill-guest">Preencher do convidado</button>
      </div>
      <div class="gf-data-card">
        <span class="gf-data-kicker">RSS</span>
        <b>Manchete do Jornal</b>
        <p>Preenche o campo de manchete com a última notícia disponível.</p>
        <button type="button" class="btn ghost sm" id="gf-fill-rss">Preencher do RSS</button>
      </div>
    </div>
    <div class="gf-data-block">
      <div class="gf-pane-head"><b>Agendamentos</b><button type="button" class="btn ghost sm" id="gf-open-live">Abrir Ao vivo</button></div>
      <div class="gf-sched-list">${gfSchedRows}</div>
      <p class="hint">Para criar um agendamento, use o bloco “Agendar GC” em Ao vivo.</p>
    </div>`;
  gfOutputs.prepend(Object.assign(document.createElement('div'), {
    className: 'gf-pane-head',
    innerHTML: '<b>Saídas e legado</b><span class="hint">overlays, banners e letreiro</span>',
  }));
  gfOutputs.insertAdjacentHTML('beforeend', `<details class="gc-acc acc gf-help">
    <summary>Como o Grafismo funciona</summary>
    <div class="gc-acc-body">
      <p class="hint" style="margin:0">Use <b>Banners</b> para lower thirds salvos, <b>Grafismo ao vivo</b>
      para escolher o template e colocar no ar. <b>Templates</b> abre a biblioteca visual.
      Em <b>Saídas</b> ficam overlays/legado. Jornal e Esportes continuam em abas próprias nesta fase.</p>
    </div>
  </details>`);
  const gfAcc = (id, title, open, content) => {
    const d = document.createElement('details');
    d.className = 'gf-acc acc';
    d.id = `gf-acc-${id}`;
    try { d.open = localStorage.getItem(`castdeck.grafismo.acc.${id}`) === '1' || (localStorage.getItem(`castdeck.grafismo.acc.${id}`) === null && open); } catch { d.open = open; }
    d.innerHTML = `<summary>${esc(title)}</summary><div class="gf-acc-body"></div>`;
    if (content) d.querySelector('.gf-acc-body').append(content);
    d.addEventListener('toggle', () => {
      try { localStorage.setItem(`castdeck.grafismo.acc.${id}`, d.open ? '1' : '0'); } catch {}
    });
    return d;
  };
  gfHub.append(
    gfAirBox,
    gfAcc('banners', 'Banners', true, gfBannersBody),
    gfAcc('live', 'Grafismo ao vivo', true, gfOperator),
    gfAcc('letreiro', 'Letreiro & RSS', false, gfTickerBody),
    gfAcc('templates', 'Templates', false, gfTemplates),
    gfAcc('data', 'Dados e agendamentos', false, gfData),
    gfAcc('outputs', 'Saídas e legado', false, gfOutputs)
  );
  p.replaceChildren(gfHub);

  const gfSetView = (view = 'live') => {
    const id = ['templates', 'data', 'outputs', 'letreiro', 'banners', 'live'].includes(view) ? view : 'live';
    const d = gfHub.querySelector(`#gf-acc-${id}`);
    if (!d) return;
    d.open = true;
    try { d.scrollIntoView({ block: 'nearest' }); } catch {}
  };
  renderGcAirList();
  $('#gf-air-list', p)?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-air-off]');
    if (!b) return;
    const id = b.dataset.airOff;
    if (id === 'ticker') {
      S.brand.tickerOn = false;
      news?.apply?.();
      saveStudio();
      renderGcBar();
    } else if (id) toggleBanner(id);
  });
  $('#gf-air-clear', p)?.addEventListener('click', () => {
    if (S.activeBanner) toggleBanner(S.activeBanner);
    if (S.brand.tickerOn) {
      S.brand.tickerOn = false;
      news?.apply?.();
      saveStudio();
      renderGcBar();
    }
  });

  const gclFront = $('#gcl-front', p);
  if (gclFront) {
    gclFront.onchange = () => {
      setBrand({ overlayLayers: { aboveDsk: !!gclFront.checked } });
      toast(gclFront.checked
        ? 'Comentários, enquetes e banners agora ficam acima do DSK.'
        : 'Comentários, enquetes e banners voltaram para trás do DSK.');
    };
  }
  $$('details.gc-acc', p).forEach((d) => {
    d.addEventListener('toggle', () => {
      try { localStorage.setItem('castdeck.gcsec.' + d.dataset.sec, d.open ? '1' : '0'); } catch {}
    });
  });
  const add = () => {
    const f = readBannerFields($('#bn-new', p));
    if (!f.title) {
      const d = $('#bn-new', p).closest('details');
      if (d) d.open = true;
      return $('#bf-title', p).focus();
    }
    S.banners.push({ id: Math.random().toString(36).slice(2, 9), ...f });
    saveStudio();
    renderBannersPanel();
  };
  $('#bn-add', p).onclick = add;
  $('#bf-sub', p).onkeydown = (e) => {
    if (e.key === 'Enter') add();
  };
  const move = (id, d) => {
    const i = S.banners.findIndex((b) => b.id === id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= S.banners.length) return;
    [S.banners[i], S.banners[j]] = [S.banners[j], S.banners[i]];
    saveStudio();
    renderBannersPanel();
  };
  $$('.banner-item', p).forEach(
    (el) =>
      (el.onclick = async (e) => {
        const b = e.target.closest('button');
        const id = el.dataset.id;
        if (b?.dataset.up) return move(id, -1);
        if (b?.dataset.down) return move(id, 1);
        if (b?.dataset.dup) {
          const src = S.banners.find((x) => x.id === id);
          S.banners.splice(S.banners.indexOf(src) + 1, 0, { ...src, id: Math.random().toString(36).slice(2, 9), title: src.title + ' (cópia)' });
          saveStudio();
          return renderBannersPanel();
        }
        if (b?.dataset.del) {
          S.banners = S.banners.filter((x) => x.id !== id);
          if (S.activeBanner === id) {
            S.activeBanner = null;
            clearTimeout(bannerTimer);
            comp.hideBanner();
          }
          saveStudio();
          return renderBannersPanel();
        }
        if (b?.dataset.edit) return editBanner(id);
        toggleBanner(id);
      }),
  );
  const rotate = () => {
    S.brand.bannerRotate = { on: $('#bn-rot', p).checked, secs: +$('#bn-rot-s', p).value };
    $('#bn-rot-v', p).textContent = S.brand.bannerRotate.secs + 's';
    applyBannerRotation();
    saveStudio();
  };
  $('#bn-rot', p).onchange = rotate;
  $('#bn-rot-s', p).oninput = rotate;
  const tk = () => {
    S.brand.tickerText = $('#tk-text', p).value.trim();
    S.brand.tickerOn = $('#tk-on', p).checked && !!S.brand.tickerText;
    news.apply();
    saveStudio();
  };
  $('#tk-text', p).oninput = tk;
  $('#tk-on', p).onchange = tk;
  // RSS/notícias do letreiro agora vivem junto de GCs & Letreiro (antes ficavam escondidos em Jornal).
  news?.bind(p, renderBannersPanel);
  gcDesigner?.bind(p);
  gcDesigner?.bindGallery?.(p, {
    onUse: () => {
      gfSetView('live');
      renderBannersPanel();
    },
  });
  $('#gf-fill-guest', p)?.addEventListener('click', () => {
    if (gcDesigner?.fillGuest()) gfSetView('live');
  });
  $('#gf-fill-rss', p)?.addEventListener('click', () => {
    if (gcDesigner?.fillHeadline()) gfSetView('live');
  });
  $('#gf-open-live', p)?.addEventListener('click', () => gfSetView('live'));
  p.querySelectorAll('[data-gf-unsched]').forEach((b) => b.addEventListener('click', () => {
    S.brand.gcSchedule = (S.brand.gcSchedule || []).filter((s) => s.id !== b.dataset.gfUnsched);
    saveStudio();
    gfSetView('data');
    renderBannersPanel();
  }));
}

async function editBanner(id) {
  const bn = S.banners.find((b) => b.id === id);
  if (!bn) return;
  const res = await modal(
    `<h3>Editar banner</h3><div id="bn-edit">${bannerFields(bn)}</div>
     <div class="row" style="justify-content:flex-end;margin-top:6px;gap:8px"><button class="btn" data-close>Cancelar</button><button class="btn" id="bn-save" data-save>Salvar</button><button class="btn primary" id="bn-saveshow">Salvar e mostrar</button></div>`,
    {
      onMount: (m, close) => {
        const root = $('#bn-edit', m);
        const go = (show) => {
          const f = readBannerFields(root);
          if (!f.title) return $('#bf-title', root).focus();
          close({ f, show });
        };
        $('#bn-save', m).onclick = () => go(false);
        $('#bn-saveshow', m).onclick = () => go(true);
        $('#bf-title', root).focus();
      },
    },
  );
  if (!res) return;
  Object.assign(bn, res.f);
  saveStudio();
  if (S.activeBanner === id) {
    S.activeBanner = null;
    toggleBanner(id);
  } else if (res.show) toggleBanner(id);
  if (tabOpen('banners')) renderBannersPanel();
}

function toggleBanner(id, data) {
  // GC do Template Studio não vive em S.banners: quem manda nele é o gcDesigner.
  if (id === 'gc:air') return gcDesigner?.stop?.();
  clearTimeout(bannerTimer);
  if (S.activeBanner === id) {
    S.activeBanner = null;
    S.activeBannerTitle = null;
    comp.hideBanner();
  } else {
    const bn = data || S.banners.find((b) => b.id === id);
    if (!bn) return;
    // GC de jornal carrega logo e etiqueta; os demais só texto/estilo
    let payload = bn.style === 'news' ? (data ? data : newsPayload(bn, S.brand.logo)) : { title: bn.title, subtitle: bn.subtitle, style: bn.style, pos: bn.pos, color: bn.color };
    // variáveis dos times cadastrados na aba Sports: {mandante} {visitante} {placar} {competicao} {tempo}
    if (sports) payload = { ...payload, title: sports.fill(payload.title), subtitle: sports.fill(payload.subtitle) };
    S.activeBanner = id;
    S.activeBannerTitle = payload.title;
    comp.showBanner(payload);
    if (bn.dur > 0)
      bannerTimer = setTimeout(() => {
        if (S.activeBanner === id) toggleBanner(id);
      }, bn.dur * 1000);
  }
  if (tabOpen('banners')) renderBannersPanel();
  if (tabOpen('journal')) journal.render();
  sports?.paintAir();
  if (tabOpen('chat')) renderChatPanel();
  renderGcBar();
}

// Barra de controle (sempre visível sob o programa), compacta em uma linha:
// GC (tirar do ar, salvos, rápido, jornal) + Mídia (escolher, tocar/pausar, anterior/próximo, posição, palco, volume) + Limpar tela
function renderGcBar() {
  renderGcAirList();
  const bar = $('#gcbar');
  if (!bar) return;
  const on = !!S.activeBanner;
  bar.classList.toggle('on-air', on);
  if (!$('.deck-gc', bar)) {
    bar.innerHTML = `
      <div class="deck-sec deck-gc"><span class="deck-lbl">GC / Lower Thirds</span><div class="deck-gc-body"></div></div>
      <div class="deck-sec deck-media" id="deck-media"><span class="deck-lbl" role="button" tabindex="0" title="Abrir o painel Playout">Playout</span><div class="deck-media-body"></div></div>
      <div class="deck-sec deck-dsk" id="deck-dsk"></div>
      <div class="deck-sec deck-dir" id="deck-dir"></div>
      <button class="btn sm deck-clear" id="deck-clear" title="Limpar tela: tira o GC/placar/widgets do ar e pausa todas as mídias">⏹<span class="deck-txt"> Limpar Tela</span></button>`;
    autoVoice?.mount(); // DIRETOR AUTO mora na barra (estúdio e mesa de corte)
    $('#deck-clear', bar).onclick = () => {
      if (S.activeBanner) toggleBanner(S.activeBanner);
      widgets.clearAir();
      messages?.clearAir();
      sports.clearAir();
      for (const m of mediaList()) m.el.pause();
      toast('GC, placar e widgets fora do ar e mídias pausadas');
    };
    deckSig = null;
    const dmLabel = $('#deck-media .deck-lbl', bar);
    if (dmLabel) {
      const openPlayout = () => openSideTab('playout');
      dmLabel.onclick = openPlayout;
      dmLabel.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPlayout();
        }
      };
    }
  }
  const all = S.banners;
  const spItems = sports?.gcItems() || [];
  const pick = [...all, ...spItems];
  if (S.activeBanner && S.activeBanner !== gcLastOn && pick.some((b) => b.id === S.activeBanner)) gcSel = S.activeBanner; // segue o GC que entrou no ar
  gcLastOn = S.activeBanner || null;
  if (!pick.some((b) => b.id === gcSel)) gcSel = (pick.some((b) => b.id === S.activeBanner) && S.activeBanner) || pick[0]?.id || null;
  const opt = (b) => `<option value="${b.id}" ${b.id === gcSel ? 'selected' : ''}>${S.activeBanner === b.id ? '● ' : ''}${esc(b.title)}${b.subtitle ? ' — ' + esc(b.subtitle) : ''}</option>`;
  const news = all.filter((b) => b.style === 'news');
  const other = all.filter((b) => b.style !== 'news');
  const groups = [
    ['Jornal', news],
    ['Banners', other],
    ['Futebol', spItems],
  ].filter(([, l]) => l.length);
  const selOn = !!gcSel && S.activeBanner === gcSel;
  $('.deck-gc-body', bar).innerHTML = `
    <button class="btn danger sm" id="gc-off" title="Tira o GC/banner da tela agora" ${on ? '' : 'hidden'}>✕<span class="deck-txt"> Tirar</span></button>
    ${
      pick.length
        ? `<select class="input deck-sel gc-sel" id="gc-sel" title="Escolher GC (${pick.length})" aria-label="Escolher GC">
            ${groups.length > 1 ? groups.map(([lbl, l]) => `<optgroup label="${lbl}">${l.map(opt).join('')}</optgroup>`).join('') : pick.map(opt).join('')}
          </select>
          <button class="btn sm ${selOn ? 'onair' : 'primary'}" id="gc-go" title="${selOn ? 'Este GC já está no ar (clique para tirar)' : 'Mandar o GC escolhido para a tela'}">${selOn ? '● No ar' : '▶ Mandar'}</button>`
        : '<span class="hint deck-empty">Sem GCs salvos</span>'
    }
    <button class="btn sm icon" id="gc-quick" title="Banner rápido: escreva e mande na hora">＋</button>`;
  $('#gc-off', bar)?.addEventListener('click', () => S.activeBanner && toggleBanner(S.activeBanner));
  const sel = $('#gc-sel', bar);
  if (sel)
    sel.onchange = () => {
      gcSel = sel.value;
      renderGcBar();
    };
  const go = $('#gc-go', bar);
  if (go)
    go.onclick = () => {
      if (!gcSel) return;
      if (S.activeBanner === gcSel) return toggleBanner(gcSel);
      if (gcSel.startsWith('sp:')) return sports.quick(gcSel); // atalho de futebol: monta o GC com os times/placar atuais
      if (S.activeBanner) toggleBanner(S.activeBanner);
      toggleBanner(gcSel);
    };
  $('#gc-quick', bar).onclick = gcQuick;
  dsk?.renderDeck();
  tickDeck();
}

// ---- parte de mídia da barra: reconstrói só quando a lista muda; o resto é atualizado no lugar ----
var deckSig = null;
var gcSel = null; // GC escolhido no dropdown da barra
var gcLastOn = null;
var deckSel = null;
var deckPickT = 0;
function tickDeck() {
  const box = $('#gcbar .deck-media-body');
  if (!box) return;
  const list = mediaList();
  const playing = list.find((x) => !x.el.paused);
  // Operabilidade: o mini player segue o que está NA TELA MAIOR, como antes.
  // Take de mídia > palco (Cena) > prévia. A fila define a ordem; a tela define a seleção.
  const mediaId = (id) => (id && S.sources.get(id)?.kind === 'media' ? id : null);
  let focused = mediaId(S.take);
  if (!focused && S.take === null) {
    const staged = S.stage.map(mediaId).filter(Boolean);
    focused = staged.find((id) => S.sources.get(id)?.el && !S.sources.get(id).el.paused) || staged[0] || null;
  }
  focused ||= mediaId(S.pvw);
  if (focused) deckSel = focused;
  else if (Date.now() - deckPickT > 10000 && playing) deckSel = playing.id;
  if (!list.some((x) => x.id === deckSel)) deckSel = list[0]?.id || null;
  const sig = list.map((x) => x.id + '|' + x.label).join(',');
  if (sig !== deckSig) {
    deckSig = sig;
    box.innerHTML = list.length
      ? `<select class="input deck-sel" id="dm-sel" title="Fila do Playout — escolher vídeo/áudio">${list.map((x, i) => `<option value="${x.id}">${`${i + 1}/${list.length}`} · ${esc(String(x.label).replace(/^[^\p{L}\p{N}]+/u, ''))}</option>`).join('')}</select>
         <button class="btn sm icon" id="dm-prev" title="Anterior">⏮</button>
         <button class="btn sm icon primary" id="dm-play" title="Tocar/Pausar"></button>
         <button class="btn sm icon" id="dm-next" title="Próximo">⏭</button>
         <div class="dm-prog" id="dm-prog" title="Clique para ir a um ponto"><i></i></div>
         <span class="dm-time" id="dm-time">0:00</span>
         <input type="range" class="dm-vol" id="dm-vol" min="0" max="1" step="0.01" orient="vertical" title="Volume">
         <button class="btn sm" id="dm-stage" title="Colocar/tirar do palco"></button>`
      : `<span class="hint deck-empty">Nenhum vídeo ou áudio</span><button class="btn sm" id="dm-add" title="Adicionar vídeos, áudios ou imagens">＋ Adicionar</button>`;
    if (!list.length) {
      $('#dm-add', box).onclick = () => $('#media-file').click();
      return;
    }
    const cur = () => S.sources.get(deckSel);
    $('#dm-sel', box).onchange = (e) => {
      deckSel = e.target.value;
      deckPickT = Date.now();
      tickDeck();
    };
    $('#dm-play', box).onclick = () => {
      const s = cur();
      if (!s) return;
      if (s.el.ended) {
        s.el.currentTime = 0;
        playMedia(s.id);
      } else if (s.el.paused) playMedia(s.id);
      else s.el.pause();
    };
    const step = (dir) => {
      const s = cur();
      if (!s) return;
      const wasPlaying = !s.el.paused;
      const l = mediaList();
      const n = (l.findIndex((x) => x.id === s.id) + dir + l.length) % l.length;
      if (wasPlaying) {
        s.el.pause();
        l[n].el.currentTime = 0;
        playMedia(l[n].id);
      }
      deckSel = l[n].id;
      tickDeck();
    };
    $('#dm-prev', box).onclick = () => step(-1);
    $('#dm-next', box).onclick = () => step(1);
    $('#dm-prog', box).onclick = (e) => {
      const s = cur();
      const r = e.currentTarget.getBoundingClientRect();
      if (s?.el.duration) s.el.currentTime = ((e.clientX - r.left) / r.width) * s.el.duration;
    };
    $('#dm-stage', box).onclick = () => {
      const s = cur();
      if (s) toggleStage(s.id);
      if (tabOpen('media')) updateMediaRows();
    };
    $('#dm-vol', box).oninput = (e) => {
      const s = cur();
      if (s) mixer.setVolume(s.id, +e.target.value);
    };
  }
  const s = S.sources.get(deckSel);
  if (!s) return;
  const el = s.el;
  const sel = $('#dm-sel', box);
  if (sel && document.activeElement !== sel) sel.value = s.id;
  const play = $('#dm-play', box);
  const pst = el.ended ? 'ended' : el.paused ? 'paused' : 'playing';
  const icon = el.ended ? '↻' : el.paused ? icons.play : '⏸';
  if (play.dataset.st !== pst) {
    play.dataset.st = pst;
    play.innerHTML = icon;
    play.title = el.ended ? 'Repetir' : el.paused ? 'Tocar' : 'Pausar';
  }
  $('#dm-prog i', box).style.width = el.duration ? `${(el.currentTime / el.duration) * 100}%` : '0%';
  $('#dm-time', box).textContent = `${fmtClock(el.currentTime)} / ${fmtClock(el.duration)}`;
  const onStage = S.stage.includes(s.id);
  const onAir = S.take === s.id;
  const sb = $('#dm-stage', box);
  const txt = onAir ? 'No ar' : onStage ? 'No palco' : 'Pôr no palco';
  if (sb.dataset.src !== txt) { sb.dataset.src = txt; sb.textContent = txt; }
  sb.hidden = false; // áudio também vai ao palco (o compositor desenha o visualizador animado)
  sb.classList.toggle('on', onStage);
  sb.classList.toggle('live', onAir);
  const vol = $('#dm-vol', box);
  if (document.activeElement !== vol) vol.value = mixer.sources.get(s.id)?.volume ?? 1;
  $('#deck-media').classList.toggle('playing', !el.paused);
  if (tabOpen('playout')) updatePlayout();
}

async function gcQuick() {
  const res = await modal(
    `<h3>Banner rápido</h3><p class="sub">Vai ao ar na hora por 10 segundos.</p>
     <label class="field"><span>Título</span><input class="input" id="gq-t" maxlength="90"></label>
     <label class="field"><span>Subtítulo (opcional)</span><input class="input" id="gq-s" maxlength="120"></label>
     <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="gq-go">Colocar no ar</button></div>`,
    {
      onMount(m, close) {
        const go = () => $('#gq-t', m).value.trim() && close({ title: $('#gq-t', m).value.trim(), subtitle: $('#gq-s', m).value.trim() });
        $('#gq-go', m).onclick = go;
        m.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        $('#gq-t', m).focus();
      },
    },
  );
  if (!res) return;
  if (S.activeBanner) toggleBanner(S.activeBanner);
  toggleBanner('quick:gc', { ...res, style: 'bar', pos: 'bl', dur: 10 });
}

// alterna entre os banners salvos (um por vez) a cada N segundos
function applyBannerRotation() {
  clearInterval(rotateTimer);
  const r = S.brand.bannerRotate;
  if (!r?.on) return;
  let i = -1;
  rotateTimer = setInterval(() => {
    if (!S.banners.length) return;
    i = (i + 1) % S.banners.length;
    const bn = S.banners[i];
    S.activeBanner = null;
    toggleBanner(bn.id);
  }, Math.max(5, r.secs) * 1000);
}
function renderChatPanel() {
  const p = $('#panel-chat');
  const isFloating = !!p.closest?.('.fw') || !!p.closest?.('.fw-popout-root') || p.classList.contains('fw-panel') || !!floatWins?.has?.('chat');
  p.innerHTML = `
    <div class="chat">
      ${
        !isFloating
          ? `<div class="chat-top-bar" style="display:flex;justify-content:flex-end;align-items:center;padding:0 0 6px">
              <button class="btn sm ghost" id="chat-btn-float" title="Destacar este painel em uma janela flutuante com botão de fixar no topo (📌)">
                <span>⧉ Destacar chat</span>
              </button>
            </div>`
          : ''
      }
      <div class="chat-log" id="chat-log">${S.chat.length ? '' : '<div class="empty">Chat privado do estúdio (host + convidados). Não vai ao ar, a menos que você clique em “Mostrar”.</div>'}</div>
      <form class="chat-form" id="chat-form"><input class="input" id="chat-input" placeholder="Mensagem…" maxlength="500" autocomplete="off" aria-label="Mensagem do chat"><button class="btn primary icon" type="submit" title="Enviar mensagem" aria-label="Enviar mensagem">${icons.up}</button></form>
    </div>`;
  const btnFloat = $('#chat-btn-float', p);
  if (btnFloat) {
    btnFloat.onclick = () => (floatWins?.has('chat') ? floatWins.close('chat') : detachCurrent('chat'));
  }
  const log = $('#chat-log', p);
  for (const m of S.chat) log.append(chatEl(m));
  log.scrollTop = log.scrollHeight;
  $('#chat-form', p).onsubmit = (e) => {
    e.preventDefault();
    const inp = $('#chat-input', p);
    const text = inp.value.trim();
    if (!text) return;
    sig.send({ type: 'chat', text });
    inp.value = '';
  };
}

function chatEl(m) {
  const el = h(`<div class="msg ${m.role === 'host' ? 'host' : ''}"><b>${esc(m.name)}</b><p>${esc(m.text)}</p>
    <button class="btn sm show ${S.activeBanner === 'chat:' + m.id ? 'primary' : ''}">${S.activeBanner === 'chat:' + m.id ? 'Ocultar' : 'Mostrar'}</button></div>`);
  el.querySelector('.show').onclick = () => toggleBanner('chat:' + m.id, { title: m.name, subtitle: m.text, style: 'card', pos: 'bl' });
  return el;
}

function addChat(m) {
  widgets?.onChatMessage({ key: `room:${m.id || m.name}`, text: m.text });
  S.chat.push(m);
  if (S.chat.length > 300) S.chat.shift();
  if (tabOpen('chat')) {
    const log = $('#chat-log');
    if (S.chat.length === 1) log.innerHTML = '';
    log.append(chatEl(m));
    log.scrollTop = log.scrollHeight;
  } else if (m.role !== 'host') {
    S.unread++;
    updateUnread();
  }
}

function updateUnread() {
  $$('.chat-count').forEach((c) => {
    c.hidden = !S.unread;
    c.textContent = S.unread;
  });
}

function intercomGuests() {
  return [...S.guests.values()].filter((g) => g.cam && !g.removed);
}

function intercomGroupOf(g) {
  return g.state?.intercomRole === 'reporter' ? 'rep' : 'cam';
}

function intercomSourceId(g) {
  return `${g.id}:cam:audio`;
}

function intercomTalkIds(key) {
  const all = intercomGuests();
  if (key === 'all') return all.map((g) => g.id);
  return all.filter((g) => intercomGroupOf(g) === key).map((g) => g.id);
}

function intercomSetTalk(ids, on) {
  for (const id of ids) {
    if (on) S.intercom.talk[id] = true;
    else delete S.intercom.talk[id];
    mixer.setIntercomTalk(id, on);
  }
}

function intercomReleaseAll() {
  intercomSetTalk(Object.keys(S.intercom.talk), false);
  document.querySelectorAll('#panel-intercom .ic-key.on, #panel-intercom .ic-ptt.on, #panel-intercom .ic-person-ptt.on').forEach((b) => b.classList.remove('on'));
  document.querySelectorAll('#panel-intercom .ic-person.ic-talking').forEach((b) => b.classList.remove('ic-talking'));
}

window.addEventListener('blur', intercomReleaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) intercomReleaseAll(); });
setInterval(() => {
  const bar = $('#ic-mic-bar');
  if (!bar || !tabOpen('intercom')) return;
  const db = mixer?.levelDb?.('host:mic')?.peak ?? -90;
  const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  bar.style.width = `${pct}%`;
}, 120);

async function showIntercomLink() {
  let sys = S.system;
  try { sys = await api('/system'); } catch {}
  const key = encodeURIComponent(S.outKey || '');
  const lan = (sys.lan || [])[0];
  const tunnel = sys.tunnel?.url;
  const urls = [
    lan ? { title: 'Mesma rede (Wi‑Fi)', sub: 'Melhor qualidade, sem internet', url: `${lan.url}/intercom/${studioId}?k=${key}` } : null,
    tunnel ? { title: 'Internet', sub: 'De qualquer lugar (4G/5G)', url: `${tunnel}/intercom/${studioId}?k=${key}` } : null,
  ].filter(Boolean);
  await modal(
    `<h3>Link do intercom</h3>
     <p class="sub">Quem receber este link entra como câmera/repórter de áudio. A chave do estúdio é obrigatória.</p>
     <div class="camqr">${urls.length ? urls.map((x) => `<div class="camqr-card">
       <div class="camqr-head"><span>${x.title === 'Internet' ? '🌐' : '📶'}</span><div><strong>${esc(x.title)}</strong><small>${esc(x.sub)}</small></div></div>
       <div class="camqr-code">${qrSvg(x.url)}</div><code class="camqr-url" title="${esc(x.url)}">${esc(x.url)}</code>
       <div class="camqr-actions"><button class="btn sm" data-ic-copy="${esc(x.url)}">${icons.copy} Copiar</button><a class="btn sm ghost" href="${esc(x.url)}" target="_blank" rel="noopener">Abrir</a></div>
     </div>`).join('') : '<p class="hint">Nenhum link disponível. Verifique a rede local e o túnel em Painel → Conexão.</p>'}</div>
     <p class="hint">No celular, use fone. O microfone começa fechado; segure o PTT para falar.</p>
     <div class="modal-actions"><button class="btn primary" data-close>Pronto</button></div>`,
    { onMount: (m) => m.querySelectorAll('[data-ic-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.icCopy))) },
  );
}

let intercomMiniEl = null;

function intercomMiniCams() {
  return [...S.sources.values()].filter((s) => s.kind === 'camera').slice(0, 8);
}

function intercomMiniTalk(ids, on) {
  intercomSetTalk(ids, on);
  const btn = intercomMiniEl?.querySelector('#icm-ptt');
  if (btn) btn.classList.toggle('on', Object.keys(S.intercom.talk || {}).length > 0);
}

function ensureIntercomMini() {
  if (intercomMiniEl) return intercomMiniEl;
  const el = document.createElement('div');
  el.id = 'intercom-mini';
  el.className = 'ic-mini';
  el.hidden = true;
  el.innerHTML = `<div class="ic-mini-head" id="icm-drag" title="Arraste para mover"><span class="ic-mini-dot"></span><b>INTERCOM + CORTE</b><button type="button" class="ic-mini-x" data-icm-close aria-label="Fechar mini intercom">×</button></div>
    <button type="button" class="ic-mini-ptt" id="icm-ptt">SEGURE PARA FALAR</button>
    <div class="ic-mini-row"><button type="button" class="ic-mini-btn" id="icm-latch">Travar PTT</button><button type="button" class="ic-mini-btn" id="icm-open">Painel</button></div>
    <div class="ic-mini-label">CORTE RÁPIDO</div><div class="ic-mini-cams" id="icm-cams"></div>`;
  document.body.append(el);
  intercomMiniEl = el;
  const ptt = el.querySelector('#icm-ptt');
  const off = () => {
    if (S.intercom.latch) return;
    intercomMiniTalk(Object.keys(S.intercom.talk || {}), false);
  };
  ptt.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const list = intercomTalkIds('all');
    if (!list.length) {
      toast('Nenhum participante conectado no intercom. Abra o Link/QR para chamar a equipe.', 'info');
      return;
    }
    if (S.intercom.latch) {
      const on = !Object.keys(S.intercom.talk || {}).length;
      intercomMiniTalk(list, on);
    } else {
      try { ptt.setPointerCapture(e.pointerId); } catch {}
      intercomMiniTalk(list, true);
    }
  });
  ptt.addEventListener('pointerup', off);
  ptt.addEventListener('pointercancel', off);
  ptt.addEventListener('lostpointercapture', off);
  el.querySelector('#icm-latch').onclick = () => {
    S.intercom.latch = !S.intercom.latch;
    if (!S.intercom.latch) intercomReleaseAll();
    paintIntercomMini();
    if (tabOpen('intercom')) renderIntercomPanel();
  };
  el.querySelector('#icm-open').onclick = () => {
    const st = $('.studio');
    if (st && !st.classList.contains('side-mini') && !st.classList.contains('panel-open')) $('#btn-panel')?.click();
    openSideTab('intercom');
    if (window.innerWidth < 900) toggleIntercomMini(false);
  };
  el.querySelector('[data-icm-close]').onclick = () => toggleIntercomMini(false);
  el.querySelector('#icm-cams').onclick = (e) => {
    const b = e.target.closest('[data-mini-cut]');
    if (!b || !S.sources.has(b.dataset.miniCut)) return;
    if (!S.switcher) switcher?.toggle();
    switcher?.cutTo(b.dataset.miniCut);
    paintIntercomMini();
  };
  // posição arrastável
  try {
    const pos = JSON.parse(localStorage.getItem('castdeck.intercomMiniPos') || 'null');
    if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
      el.style.left = `${Math.max(0, Math.min(innerWidth - 260, pos.left))}px`;
      el.style.top = `${Math.max(0, Math.min(innerHeight - 160, pos.top))}px`;
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }
  } catch {}
  const head = el.querySelector('#icm-drag');
  let drag = null;
  const moveDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    e.preventDefault();
    const left = Math.max(0, Math.min(innerWidth - el.offsetWidth, drag.left + e.clientX - drag.x));
    const top = Math.max(0, Math.min(innerHeight - el.offsetHeight, drag.top + e.clientY - drag.y));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.bottom = 'auto';
    el.style.right = 'auto';
  };
  const stopDrag = (e) => {
    if (!drag || (e?.pointerId !== undefined && e.pointerId !== drag.id)) return;
    drag = null;
    try { localStorage.setItem('castdeck.intercomMiniPos', JSON.stringify({ left: Math.round(el.offsetLeft), top: Math.round(el.offsetTop) })); } catch {}
  };
  // Os listeners ficam na window: o ponteiro pode sair do cabeçalho (ou do painel)
  // durante o arraste; pointerup no próprio cabeçalho deixava o drag "colado" no mouse.
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: el.getBoundingClientRect().left, top: el.getBoundingClientRect().top };
  });
  window.addEventListener('pointermove', moveDrag, { passive: false });
  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointercancel', stopDrag);
  window.addEventListener('blur', () => stopDrag());
  return el;
}

function paintIntercomMini() {
  if (!intercomMiniEl || intercomMiniEl.hidden) return;
  const cams = intercomMiniCams();
  const list = intercomMiniEl.querySelector('#icm-cams');
  list.innerHTML = cams.length
    ? cams.map((s, i) => `<button type="button" class="ic-mini-cut ${S.take === s.id ? 'pgm' : S.pvw === s.id ? 'pvw' : ''}" data-mini-cut="${esc(s.id)}"><b>${i + 1}</b><span>${esc(s.label || 'Câmera')}</span></button>`).join('')
    : '<div class="ic-mini-empty">Sem câmeras</div>';
  const ptt = intercomMiniEl.querySelector('#icm-ptt');
  if (ptt) {
    const on = Object.keys(S.intercom.talk || {}).length > 0;
    const hasPeople = intercomTalkIds('all').length > 0;
    ptt.disabled = !hasPeople;
    ptt.classList.toggle('on', on);
    ptt.textContent = !hasPeople ? 'SEM PARTICIPANTES' : S.intercom.latch ? (on ? 'MIC ABERTO · CLIQUE PARA FECHAR' : 'CLIQUE PARA ABRIR O MIC') : 'SEGURE PARA FALAR';
  }
  const latch = intercomMiniEl.querySelector('#icm-latch');
  if (latch) {
    latch.classList.toggle('on', S.intercom.latch);
    latch.textContent = S.intercom.latch ? 'MIC TRAVADO' : 'Travar PTT';
  }
  const topBtn = $('#btn-intercom-mini');
  if (topBtn) topBtn.setAttribute('aria-pressed', String(!intercomMiniEl.hidden));
}

function toggleIntercomMini(force) {
  const el = ensureIntercomMini();
  const show = typeof force === 'boolean' ? force : el.hidden;
  el.hidden = !show;
  if (show) paintIntercomMini();
  const topBtn = $('#btn-intercom-mini');
  if (topBtn) topBtn.setAttribute('aria-pressed', String(show));
}

setInterval(() => { if (intercomMiniEl && !intercomMiniEl.hidden) paintIntercomMini(); }, 700);

function renderIntercomPanel() {
  const p = $('#panel-intercom');
  if (!p) return;
  const gs = intercomGuests();
  const active = Object.keys(S.intercom.talk || {}).length;
  const rows = gs.length
    ? gs.map((g) => {
      const src = S.sources.get(`${g.id}:cam`);
      const onStage = !!(src && S.stage.includes(src.id));
      const onAir = !!(src && S.take === src.id);
      const listening = S.intercom.listen[g.id] !== false;
      const role = intercomGroupOf(g) === 'rep' ? 'Reportagem' : 'Câmera';
      return `<div class="ic-person ${onAir ? 'on-air' : onStage ? 'on-stage' : ''}" data-ic-person="${esc(g.id)}">
        <span class="ic-dot ${S.intercom.talk[g.id] ? 'talk' : 'on'}"></span>
        <div class="ic-who"><b>${esc(g.name || 'Participante')}</b><small>${role}${onAir ? ' · PGM' : onStage ? ' · palco' : ''}</small></div>
        <button type="button" class="btn sm ic-listen ${listening ? 'on' : ''}" data-ic-listen="${esc(g.id)}" aria-pressed="${listening}">${listening ? 'Ouvindo' : 'Ouvir'}</button>
        <button type="button" class="btn sm ic-person-ptt" data-ic-ptt="${esc(g.id)}" title="Segure para falar com ${esc(g.name || 'participante')}">PTT</button>
      </div>`;
    }).join('')
    : '<div class="ic-empty">Nenhum celular/câmera conectado. Use <b>Link/QR</b> para chamar a equipe.</div>';
  p.innerHTML = `<div class="ic-head"><div><b>Intercom</b><small>Diretor · câmeras · reportagem</small></div><span class="ic-count ${active ? 'on' : ''}">${gs.length} conectado${gs.length === 1 ? '' : 's'}${active ? ` · ${active} falando` : ''}</span><button type="button" class="btn sm" id="ic-mini-toggle" aria-pressed="${!!document.querySelector('#intercom-mini:not([hidden])')}">Mini</button><button type="button" class="btn sm" id="ic-link">Link/QR</button></div>
    <div class="ic-director">
      <button type="button" class="ic-ptt" id="ic-ptt" aria-label="Segure para falar com todos">🎙<b>PTT GERAL</b><small>${S.intercom.latch ? 'clique para abrir/fechar' : 'segure para falar com todos'}</small></button>
      <div class="ic-mic"><span>MIC</span><div class="ic-meter"><i id="ic-mic-bar"></i></div><small>${S.intercom.latch ? 'PTT travado: clique para fechar' : 'Fale e solte para fechar'}</small><button type="button" class="btn sm ic-latch ${S.intercom.latch ? 'on' : ''}" id="ic-latch" aria-pressed="${S.intercom.latch}">${S.intercom.latch ? 'MIC TRAVADO' : 'Travar PTT'}</button></div>
    </div>
    <div class="ic-audio">
      <label><span>Microfone da direção (programa + intercom)</span><select class="input sm" id="ic-mic-dev"></select></label>
      <label><span>Saída do retorno (fone)</span><select class="input sm" id="ic-out-dev"></select></label>
      <button type="button" class="btn sm" id="ic-audio-test">Testar saída</button>
      <span class="ic-audio-note" id="ic-audio-note">A troca vale na hora. A saída escolhida atende ao monitor e ao intercom.</span>
    </div>
    <div class="ic-keys">
      <button type="button" class="ic-key" data-ic-talk="all"><b>TODOS</b><small>${gs.length} pessoas</small><span class="ic-key-line"></span></button>
      <button type="button" class="ic-key" data-ic-talk="cam"><b>CÂMERAS</b><small>${intercomTalkIds('cam').length} conectada${intercomTalkIds('cam').length === 1 ? '' : 's'}</small><span class="ic-key-line"></span></button>
      <button type="button" class="ic-key" data-ic-talk="rep"><b>REPORTAGEM</b><small>${intercomTalkIds('rep').length} conectado${intercomTalkIds('rep').length === 1 ? '' : 's'}</small><span class="ic-key-line"></span></button>
      <button type="button" class="ic-key ic-key-pgm" id="ic-pgm"><b>PGM</b><small>só escuta</small><span class="ic-key-line"></span></button>
    </div>
    <div class="ic-people">${rows}</div>
    <div class="ic-ifb"><label class="check"><input type="checkbox" id="ic-ifb" ${S.intercom.ifb !== false ? 'checked' : ''}> <span>Enviar programa no IFB</span></label>
      <input type="range" id="ic-ifb-level" min="0" max="1" step="0.01" value="${S.intercom.ifbLevel ?? 0.18}" aria-label="Volume do programa no IFB">
      <small>Nível do programa separado do PTT.</small></div>
    <div class="ic-admin"><button type="button" class="btn sm" id="ic-unlatch">Mic Unlatch</button><button type="button" class="btn sm danger" id="ic-mute-all">Silenciar todos</button><button type="button" class="btn sm" id="ic-mic-test">Testar fone</button></div>`;

  const idsFor = (key) => intercomTalkIds(key);
  const hold = (btn, ids) => {
    let pointer = null;
    const paint = () => {
      const list = ids();
      for (const id of list) p.querySelector(`[data-ic-person="${CSS.escape(id)}"]`)?.classList.add('ic-talking');
      btn.classList.add('on');
    };
    const off = () => {
      if (S.intercom.latch) return;
      if (pointer === null) return;
      pointer = null;
      intercomSetTalk(ids(), false);
      btn.classList.remove('on');
      p.querySelectorAll('.ic-person').forEach((row) => row.classList.remove('ic-talking'));
      p.querySelectorAll('[data-ic-talk]').forEach((b) => b.classList.remove('on'));
    };
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const list = ids();
      if (S.intercom.latch) {
        const on = !list.some((id) => S.intercom.talk[id]);
        intercomSetTalk(list, on);
        btn.classList.toggle('on', on);
        for (const id of list) p.querySelector(`[data-ic-person="${CSS.escape(id)}"]`)?.classList.toggle('ic-talking', on);
        p.querySelectorAll('[data-ic-talk]').forEach((b) => {
          const l = idsFor(b.dataset.icTalk);
          b.classList.toggle('on', l.some((id) => S.intercom.talk[id]));
        });
        return;
      }
      pointer = e.pointerId;
      try { btn.setPointerCapture(e.pointerId); } catch {}
      intercomSetTalk(list, true);
      paint();
    });
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('lostpointercapture', off);
  };

  hold($('#ic-ptt', p), () => idsFor('all'));
  p.querySelectorAll('[data-ic-talk]').forEach((b) => hold(b, () => idsFor(b.dataset.icTalk)));
  p.querySelectorAll('[data-ic-ptt]').forEach((b) => hold(b, () => [b.dataset.icPtt]));
  p.querySelectorAll('[data-ic-listen]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.icListen;
      const on = S.intercom.listen[id] === false;
      S.intercom.listen[id] = on;
      mixer.setIntercomListen(intercomSourceId({ id }), on);
      b.classList.toggle('on', on);
      b.textContent = on ? 'Ouvindo' : 'Ouvir';
      b.setAttribute('aria-pressed', String(on));
    };
  });
  const applyIfb = () => {
    S.intercom.ifb = !!$('#ic-ifb', p)?.checked;
    S.intercom.ifbLevel = Number($('#ic-ifb-level', p)?.value) || 0.18;
    for (const g of intercomGuests()) mixer.setIntercomProgram(g.id, S.intercom.ifb, S.intercom.ifbLevel);
  };
  $('#ic-ifb', p).onchange = applyIfb;
  $('#ic-ifb-level', p).oninput = applyIfb;
  applyIfb();
  for (const g of gs) mixer.setIntercomListen(intercomSourceId(g), S.intercom.listen[g.id] !== false);
  $('#ic-link', p).onclick = showIntercomLink;
  $('#ic-mini-toggle', p).onclick = () => toggleIntercomMini();
  const icMicDev = $('#ic-mic-dev', p);
  const icOutDev = $('#ic-out-dev', p);
  const icAudioNote = $('#ic-audio-note', p);
  const canPickOutput = typeof mixer.ctx?.setSinkId === 'function';
  if (icOutDev) icOutDev.disabled = !canPickOutput;
  if (!canPickOutput && icAudioNote) icAudioNote.textContent = 'Neste aparelho, a saída de áudio segue o sistema. A escolha de microfone continua disponível.';
  listDevices().then(({ mics, speakers }) => {
    if (!document.body.contains(p)) return;
    if (icMicDev) {
      icMicDev.innerHTML = '<option value="">Padrão do sistema</option>' + mics.map((d) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Microfone')}</option>`).join('');
      const saved = loadPrefs().micId || '';
      if ([...icMicDev.options].some((o) => o.value === saved)) icMicDev.value = saved;
      icMicDev.onchange = async () => {
        const deviceId = icMicDev.value;
        icMicDev.disabled = true;
        try {
          const mic = await getMic(deviceId || '');
          const old = S.local.mic;
          S.local.mic = mic;
          mixer.addStream('host:mic', mic, { ownerId: 'host', stageKey: 'host:cam', monitor: false });
          mixer.setMuted('host:mic', !S.local.micOn, { save: false });
          old?.getTracks?.().forEach((t) => { try { t.stop(); } catch {} });
          savePrefs({ micId: deviceId || '' });
          toast('Microfone do intercom trocado.', 'ok');
        } catch (e) {
          if (icMicDev) icMicDev.value = loadPrefs().micId || '';
          toast('Não foi possível trocar o microfone: ' + (e.message || e.name), 'err');
        } finally {
          if (icMicDev) icMicDev.disabled = false;
        }
      };
    }
    if (icOutDev && canPickOutput) {
      icOutDev.innerHTML = '<option value="">Saída padrão do sistema</option>' + speakers.map((d) => `<option value="${esc(d.deviceId)}">${esc(d.label || 'Saída')}</option>`).join('');
      const saved = loadPrefs().speakerId || '';
      if ([...icOutDev.options].some((o) => o.value === saved)) icOutDev.value = saved;
      icOutDev.onchange = async () => {
        try {
          await mixer.setSpeaker(icOutDev.value);
          savePrefs({ speakerId: icOutDev.value });
          toast('Saída do intercom trocada.', 'ok');
        } catch (e) {
          icOutDev.value = loadPrefs().speakerId || '';
          toast('Não foi possível trocar a saída: ' + (e.message || e.name), 'err');
        }
      };
    }
  }).catch(() => {
    if (icAudioNote) icAudioNote.textContent = 'Não foi possível listar os dispositivos de áudio.';
  });
  $('#ic-audio-test', p).onclick = async () => {
    try { await mixer.resume(); await mixer.beep(); toast('Tom tocado na saída escolhida.', 'info'); }
    catch (e) { toast('Não foi possível tocar o tom: ' + (e.message || e.name), 'err'); }
  };
  $('#ic-latch', p).onclick = () => {
    S.intercom.latch = !S.intercom.latch;
    if (!S.intercom.latch) intercomReleaseAll();
    toast(S.intercom.latch ? 'PTT travado: clique para abrir/fechar o microfone.' : 'PTT momentâneo restaurado.', 'info');
    renderIntercomPanel();
  };
  $('#ic-unlatch', p).onclick = () => { intercomReleaseAll(); toast('Microfones do intercom destravados.'); };
  $('#ic-mute-all', p).onclick = () => {
    intercomReleaseAll();
    for (const g of intercomGuests()) sig?.send({ type: 'control', to: g.id, action: 'mute' });
    toast('Intercom silenciado para todos.', 'info');
  };
  $('#ic-mic-test', p).onclick = () => {
    const el = $('#ic-mic-bar', p);
    if (el) { el.style.width = '100%'; setTimeout(() => (el.style.width = '0%'), 450); }
    const sent = mixer.intercomTestTone?.();
    toast(sent ? 'Tom enviado para o retorno de quem está no intercom.' : 'Nenhum participante para testar o retorno.', sent ? 'info' : 'err');
  };
}

function renderAudioPanel() {
  audioPanel?.render();
  try {
    if (window._audioPopout && !window._audioPopout.closed) {
      window._audioPopout.renderAudio?.();
    }
  } catch {}
}

function renderOutputPanel() {
  const p = $('#panel-output');
  const st = S.status;
  const presets = S.system.presets;
  const stateLabel = { connecting: ['warn', 'Conectando'], reconnecting: ['warn', 'Reconectando'], live: ['ok', 'Ao vivo'], error: ['err', 'Erro'], failed: ['err', 'Falhou'], stopped: ['', 'Encerrado'], idle: ['', 'Aguardando'] };
  p.innerHTML = `
    <h4>Qualidade de saída</h4>
    <label class="field"><span>Resolução / FPS</span>
      <select class="input" id="o-preset" ${S.live ? 'disabled' : ''}>
        ${Object.entries(presets).filter(([, v]) => !v.vertical).map(([k, v]) => `<option value="${k}" ${k === S.preset ? 'selected' : ''}>${v.height}p ${v.fps}fps — ${(v.videoKbps / 1000).toFixed(1)} Mbps</option>`).join('')}
      </select></label>
    <label class="field"><span>Taxa de bits (Bitrate de vídeo)</span>
      <select class="input" id="o-bitrate" ${S.live ? 'disabled' : ''}>
        ${BITRATE_OPTS.map(([v, l]) => `<option value="${v}" ${v === (S.bitrate || 0) ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select></label>
    <label class="field"><span>Encoder (FFmpeg)</span>
      <select class="input" id="o-enc" ${S.live ? 'disabled' : ''}>
        ${S.system.ffmpeg.encoders.map((e) => `<option value="${e.id}" ${e.id === S.encoder ? 'selected' : ''}>${esc(e.label)}${e.hw ? ' (GPU)' : ''}</option>`).join('')}
      </select></label>
    ${
      st
        ? `<h4>Transmissão</h4>
      <div class="dest-status">
        <div class="dest-row"><div class="meta"><strong>Encoder</strong><span>${st.fps || 0} fps · ${esc(st.bitrate || '—')} · velocidade ${esc(st.speed || '—')}</span></div></div>
        ${st.outputs
          .map((o) => {
            const [cls, label] = stateLabel[o.state] || ['', o.state];
            return `<div class="dest-row"><div class="meta"><strong>${esc(o.name)}</strong><span>${o.kind === 'record' ? esc(o.file || '') : fmtBytes(o.bytes) + ' enviados'}${o.restarts ? ` · ${o.restarts} reconexões` : ''}${o.error && o.state !== 'live' ? ' · ' + esc(o.error) : ''}</span></div><span class="pill ${cls}">${label}</span></div>`;
          })
          .join('')}
      </div>`
        : ''
    }
    <div class="dm-head"><h4>Destinos</h4><div style="display:flex;gap:6px"><button class="btn sm ghost" id="o-key-help" title="Onde pego a chave de transmissão?">❓</button><button class="btn sm primary" id="o-dest-add">${icons.plus} Novo destino</button></div></div>
    ${S.live ? '<p class="hint" style="margin:-4px 0 8px">Mudanças nos destinos valem para a próxima transmissão.</p>' : ''}
    <div class="dest-status dm-list">${
      S.destinations.length
        ? S.destinations
            .map(
              (d) => `<div class="dest-row dm-row" data-id="${d.id}"><span class="plat ${d.platform}" style="width:30px;height:30px;font-size:11px;flex:none">${PLATFORMS[d.platform]?.short || '⚡'}</span>
                <div class="meta"><strong>${esc(d.name)} ${fmtBadge(d)}</strong><span>${esc(d.url)}${d.hasKey ? '' : ' · <b style="color:var(--warn)">sem chave</b>'}</span></div>
                <label class="switch" title="Marcado por padrão ao transmitir"><input type="checkbox" data-dtog ${d.enabled ? 'checked' : ''}><span></span></label>
                <button class="btn ghost sm icon" data-dedit title="Editar (nome, servidor e chave)" aria-label="Editar destino">${icons.edit}</button>
                <button class="btn ghost sm icon" data-ddel title="Remover destino" aria-label="Remover destino">${icons.trash}</button></div>`,
            )
            .join('')
        : '<div class="empty">Nenhum destino ainda. Adicione YouTube, Facebook, Twitch, Instagram, TikTok ou qualquer servidor RTMP.</div>'
    }</div>
    <p class="hint" style="margin-top:8px">A chave fica salva só neste aparelho. O botão ligado deixa o destino já marcado quando você clicar em Transmitir.</p>`;
  $('#o-preset', p).onchange = (e) => {
    S.preset = e.target.value;
    applyPreset();
    saveStudio();
  };
  $('#o-enc', p).onchange = (e) => {
    S.encoder = e.target.value;
    saveStudio();
  };
  $('#o-bitrate', p).onchange = (e) => {
    S.bitrate = Number(e.target.value) || 0;
    saveStudio();
  };
  const destOf = (el) => S.destinations.find((d) => d.id === el.closest('[data-id]')?.dataset.id);
  $('#o-dest-add', p).onclick = async () => (await editDestination()) && refreshDestinations();
  $('#o-key-help', p).onclick = () => showKeyHelp();
  $$('[data-dedit]', p).forEach((b) => (b.onclick = async () => (await editDestination(destOf(b))) && refreshDestinations()));
  $$('[data-ddel]', p).forEach((b) => (b.onclick = async () => (await deleteDestination(destOf(b))) && refreshDestinations()));
  $$('[data-dtog]', p).forEach((c) => (c.onchange = () => toggleDestination(destOf(c), c.checked)));
}

// recarrega os destinos e atualiza tudo que os mostra (painel Transmissão e painel Vertical)
async function refreshDestinations() {
  try {
    S.destinations = await api('/destinations');
  } catch {}
  if (tabOpen('output')) renderOutputPanel();
  buildVDests();
}

// =====================================================================
// Modo vertical 9:16 (Instagram / TikTok / Reels / Shorts), simultâneo ao horizontal.
// Painel acoplado ao lado do preview horizontal; o DOM é criado uma vez e só recebe
// atualizações pontuais (recriar o canvas a cada status fazia a prévia piscar).
// =====================================================================
const vPresetId = () => (S.system.presets[S.brand.vpreset]?.vertical ? S.brand.vpreset : 'v720p30');
const vPill = () => (S.vlive ? `<span class="pill live"><span class="dot"></span>VERTICAL ${fmtTime(Date.now() - S.vlive.startedAt)}</span>` : '');

function initVerticalDock() {
  const dock = $('#vdock');
  if (!dock || !vview) return;
  const vps = Object.entries(S.system.presets).filter(([, v]) => v.vertical);
  dock.innerHTML = `
    <div class="vd-head">
      <strong>Vertical 9:16</strong>
      <span class="vd-state" id="v-state"></span>
      <button class="btn ghost sm icon vd-focus" id="vd-focus" title="Foco no vertical (preview 9:16 grande)" aria-label="Foco no vertical" aria-pressed="false">${FOCUS_ICONS[0]}</button>
      <button class="btn ghost sm icon" id="vd-close" title="Ocultar o painel (a transmissão vertical continua se estiver ativa)" aria-label="Ocultar painel vertical">✕</button>
    </div>
    <div class="vframe" id="v-frame"></div>
    <div class="vd-layouts" id="v-layouts" role="group" aria-label="Layout vertical">${VERTICAL_LAYOUTS.map(([k, l], i) => `<button class="vl" data-l="${k}" title="Layout: ${l}" aria-label="${l}">${['Auto', 'Cheia', 'Pilha', 'Destaque', '16:9'][i] || l}</button>`).join('')}</div>
    <div class="vd-actions">
      <button class="btn primary grow" id="v-go"></button>
      <button class="btn icon" id="v-opt" title="Destinos, qualidade e gravação" aria-expanded="false" aria-label="Opções da saída vertical">⚙</button>
    </div>
    <div class="vd-opts" id="v-opts" hidden>
      <label class="field"><span>Qualidade</span><select class="input" id="v-preset">${vps.map(([k, v]) => `<option value="${k}">${v.width}×${v.height} · ${v.fps} fps · ${(v.videoKbps / 1000).toFixed(1)} Mbps</option>`).join('')}</select></label>
      <div class="vd-sub">Enviar para</div>
      <div class="list" id="v-dests"></div>
      <label class="check"><input type="checkbox" id="v-rec"> Gravar MP4 vertical</label>
      <label class="check"><input type="checkbox" id="v-safe"> Mostrar zona segura</label>
    </div>
    <div class="vd-status" id="v-status"></div>`;
  $('#v-frame', dock).appendChild(vview.canvas);
  $('#vd-close', dock).onclick = () => setVerticalDock(false);
  $('#vd-focus', dock).onclick = () => {
    const on = !dock.classList.contains('focus');
    dock.classList.toggle('focus', on);
    $('.stage-row')?.classList.toggle('v-focus', on);
    $('#vd-focus', dock).setAttribute('aria-pressed', String(on));
    $('#vd-focus', dock).innerHTML = FOCUS_ICONS[on ? 1 : 0];
  };
  $('#btn-vertical').onclick = () => setVerticalDock(!S.brand.vOn);
  $$('#v-layouts .vl', dock).forEach(
    (b) =>
      (b.onclick = () => {
        S.brand.vlayout = b.dataset.l;
        vview.layout = b.dataset.l;
        saveStudio();
        updateVerticalDock();
      }),
  );
  $('#v-opt', dock).onclick = () => {
    const o = $('#v-opts', dock);
    o.hidden = !o.hidden;
    $('#v-opt', dock).setAttribute('aria-expanded', String(!o.hidden));
    if (!o.hidden) buildVDests();
  };
  $('#v-preset', dock).onchange = (e) => {
    S.brand.vpreset = e.target.value;
    vview.setPreset(S.system.presets[vPresetId()]);
    saveStudio();
  };
  $('#v-rec', dock).onchange = () => saveVDest();
  $('#v-safe', dock).onchange = (e) => {
    S.vsafe = e.target.checked;
    updateVerticalDock();
  };
  $('#v-go', dock).onclick = () => {
    if (S.vlive) return stopVertical();
    saveVDest();
    if (!(S.brand.vdest || []).length && !S.brand.vrec) {
      $('#v-opts', dock).hidden = false;
      buildVDests();
      return toast('Escolha um destino ou marque "Gravar MP4 vertical".', 'err');
    }
    startVertical({ destinationIds: S.brand.vdest || [], record: !!S.brand.vrec });
  };
  setVerticalDock(!!S.brand.vOn, false);
  placeVFrame();
  MOBILE_MQ.addEventListener?.('change', placeVFrame);
}

// celular (em pé ou deitado): a prévia 9:16 fica ao lado do programa, na faixa fixa do topo,
// e os controles do vertical vão para a área de controles. No PC volta tudo para dentro do painel.
function placeVFrame() {
  const fr = $('#v-frame');
  const row = $('#stage-row');
  const dock = $('#vdock');
  if (!fr || !row || !dock) return;
  if (MOBILE_MQ.matches) {
    if (fr.parentElement !== row) row.append(fr);
    if (dock.parentElement === row) row.after(dock);
  } else {
    if (dock.parentElement !== row) row.append(dock);
    if (fr.parentElement !== dock) dock.querySelector('.vd-head')?.after(fr);
  }
}

function setVerticalDock(on, persist = true) {
  S.brand.vOn = !!on;
  $('#vdock').hidden = !on;
  if (!on) {
    $('#vdock').classList.remove('focus');
    $('.stage-row')?.classList.remove('v-focus');
  }
  $('.stage-row')?.classList.toggle('has-v', !!on);
  $('.stage-wrap')?.classList.toggle('v-on', !!on);
  if (persist) saveStudio();
  if (on) buildVDests();
  updateVerticalDock();
}

async function buildVDests() {
  const dock = $('#vdock');
  if (!dock || S.vlive) return;
  try {
    S.destinations = await api('/destinations');
  } catch {}
  const vds = S.destinations.filter((d) => destFormat(d) === 'v'); // só chaves verticais 9:16
  const sel = new Set(S.brand.vdest || vds.filter((d) => d.enabled).map((d) => d.id));
  const box = $('#v-dests', dock);
  if (!box) return;
  const html = vds.length
    ? vds
        .map((d) => `<label class="list-item card check"><input type="checkbox" name="vdest" value="${d.id}" ${sel.has(d.id) ? 'checked' : ''}><span class="plat ${d.platform}">${PLATFORMS[d.platform]?.short || '⚡'}</span><span class="meta"><strong>${esc(d.name)}</strong></span></label>`)
        .join('')
    : '<div class="empty">Nenhum destino vertical (9:16) cadastrado. <button class="btn sm" type="button" id="v-dest-add">＋ Adicionar</button> (Instagram, TikTok…)</div>';
  if (box._h !== html) {
    box.innerHTML = html;
    box._h = html;
    $$('input[name=vdest]', box).forEach((i) => (i.onchange = () => saveVDest()));
    const add = $('#v-dest-add', box);
    if (add) add.onclick = async () => (await editDestination(null, { format: 'v' })) && refreshDestinations();
  }
  $('#v-rec', dock).checked = !!S.brand.vrec;
  $('#v-preset', dock).value = vPresetId();
}

function saveVDest() {
  const dock = $('#vdock');
  S.brand.vdest = $$('input[name=vdest]:checked', dock).map((i) => i.value);
  S.brand.vrec = $('#v-rec', dock).checked;
  saveStudio();
}

// atualizações pontuais: nunca recria o canvas nem a lista inteira
function updateVerticalDock() {
  const dock = $('#vdock');
  if (!dock || !vview) return;
  const live = !!S.vlive;
  const on = !!S.brand.vOn;
  const btn = $('#btn-vertical');
  if (btn) {
    btn.classList.toggle('active', on);
    btn.classList.toggle('is-live', live);
    btn.setAttribute('aria-pressed', String(on));
  }
  const stateEl = $('#v-state', dock);
  const stateHtml = live ? `<span class="pill live"><span class="dot"></span>${S.vlive.recordOnly ? 'GRAVANDO' : 'AO VIVO'} ${fmtTime(Date.now() - S.vlive.startedAt)}</span>` : S.vstarting ? '<span class="pill warn">Iniciando…</span>' : '<span class="pill">Pronto</span>';
  if (stateEl._h !== stateHtml) {
    stateEl.innerHTML = stateHtml;
    stateEl._h = stateHtml;
  }
  const go = $('#v-go', dock);
  const label = live ? `${icons.stop} Parar vertical` : S.vstarting ? 'Iniciando…' : `${icons.broadcast} Iniciar vertical`;
  if (go._h !== label) {
    go.innerHTML = label;
    go._h = label;
  }
  go.className = `btn grow ${live ? 'live' : 'primary'}`;
  go.disabled = !!S.vstarting;
  $$('#v-layouts .vl', dock).forEach((b) => b.classList.toggle('on', b.dataset.l === (S.brand.vlayout || 'auto')));
  for (const el of $$('#v-preset, #v-rec, input[name=vdest]', dock)) el.disabled = live;
  $('#v-frame')?.classList.toggle('safe', !!S.vsafe);
  const st = S.vstatus;
  const stateLabel = { connecting: ['warn', 'Conectando'], reconnecting: ['warn', 'Reconectando'], live: ['ok', 'No ar'], error: ['err', 'Erro'], failed: ['err', 'Falhou'], stopped: ['', 'Encerrado'], idle: ['', 'Aguardando'] };
  let html = '';
  if (st && live) {
    html = `<div class="vd-line"><span>${st.fps || 0} fps · ${esc(st.bitrate || '—')}</span><span>vel. ${esc(st.speed || '—')}</span></div>`;
    html += (st.outputs || [])
      .map((o) => {
        const [cls, lab] = stateLabel[o.state] || ['', o.state];
        return `<div class="vd-line"><span class="vd-name" title="${esc(o.error || o.file || '')}">${esc(o.name)}</span><span class="pill ${cls}">${lab}</span></div>`;
      })
      .join('');
  }
  const sb = $('#v-status', dock);
  if (sb._h !== html) {
    sb.innerHTML = html;
    sb._h = html;
  }
}
setInterval(() => (S.vlive || S.vstarting) && updateVerticalDock(), 1000);

async function startVertical({ destinationIds, record, linked = false }) {
  S.vstarting = true;
  if (!S.brand.vOn) setVerticalDock(true);
  updateVerticalDock();
  vBroadcaster = new Broadcaster();
  vBroadcaster.on('status', (st) => {
    S.vstatus = st;
    // o servidor é a fonte da verdade (ex.: destino que falhou de vez). A janela de 3 s evita que um status
    // enviado antes do servidor processar o último comando desfaça o que o operador acabou de ligar.
    if (S.vlive && typeof st.isRecording === 'boolean' && Date.now() - (S.vlive.changedAt || S.vlive.startedAt) > 3000) {
      const live = !!st.isStreaming;
      if (S.vlive.record !== st.isRecording || (!live && S.vlive.destinationIds?.length)) {
        S.vlive.record = st.isRecording;
        if (!live) S.vlive.destinationIds = [];
        S.vlive.recordOnly = !S.vlive.destinationIds?.length;
        renderLiveStats();
      }
    }
    updateVerticalDock();
  });
  vBroadcaster.on('error', (msg) => toast('Vertical: ' + msg, 'err'));
  vBroadcaster.on('ended', () => {
    S.vlive = null;
    S.vstatus = null;
    renderLiveStats();
    updateVerticalDock();
    toast('Saída vertical encerrada', 'ok');
  });
  try {
    const id = vPresetId();
    const st = await vBroadcaster.start({ studioId, stream: vStream, destinationIds, record, preset: id, presetInfo: S.system.presets[id], encoder: S.encoder, vertical: true });
    S.vlive = { startedAt: Date.now(), record, destinationIds, recordOnly: !destinationIds.length, linked };
    S.vstatus = st;
    toast(S.vlive.recordOnly ? 'Gravando na vertical…' : 'Vertical AO VIVO!', 'ok');
  } catch (e) {
    toast('Vertical: ' + e.message, 'err');
  }
  S.vstarting = false;
  renderLiveStats();
  updateVerticalDock();
}

// A vertical "vinculada" (ligada pelos modais Gravar/Transmitir) acompanha os botões REC e LIVE:
// cada botão liga ou desliga só a sua parte (gravação ou destinos), sem derrubar a outra.
function vLinked() {
  return S.vlive?.linked && vBroadcaster?.active ? S.vlive : null;
}
function vPatch(p) {
  if (!S.vlive) return;
  Object.assign(S.vlive, p);
  S.vlive.recordOnly = !S.vlive.destinationIds?.length;
  S.vlive.changedAt = Date.now();
  renderLiveStats();
  updateVerticalDock();
}

async function stopVertical() {
  const rec = S.vlive?.recordOnly;
  if (!(await confirmDialog(rec ? 'Parar a gravação vertical?' : 'Encerrar a transmissão vertical?', { ok: rec ? 'Parar' : 'Encerrar', danger: true }))) return;
  if (!S.vlive) return; // já tinha parado enquanto o modal estava aberto
  vBroadcaster?.stop();
}

// =====================================================================
// Transmissão
// =====================================================================
function syncLiveCompat() {
  if (S.streaming || S.recording) {
    S.live = {
      startedAt: (S.streaming || S.recording).startedAt,
      record: !!S.recording,
      destinationIds: S.streaming?.destinationIds || [],
      recordOnly: !S.streaming,
    };
  } else {
    S.live = null;
  }
}

function setupBroadcasterEvents() {
  if (broadcaster) return;
  broadcaster = new Broadcaster();
  broadcaster.on('status', (st) => {
    S.status = st;
    // janela de 3 s: um status que já estava a caminho antes do comando start-record/start-destinations
    // chegar ao servidor não pode apagar o REC/LIVE que acabou de ser ligado
    const settled = (x) => Date.now() - x.startedAt > 3000;
    if (st.isRecording === false && S.recording && settled(S.recording)) {
      S.recording = null;
    }
    if (st.isStreaming === false && S.streaming && settled(S.streaming)) {
      S.streaming = null;
    }
    syncLiveCompat();
    renderLiveStats();
    if (tabOpen('output')) renderOutputPanel();
  });
  broadcaster.on('error', (msg) => toast(msg, 'err'));
  broadcaster.on('ended', () => {
    S.streaming = null;
    S.recording = null;
    S.live = null;
    S.status = null;
    broadcaster = null;
    renderLiveStats();
    if (tabOpen('output')) renderOutputPanel();
    pushStudioState();
  });
}

// =====================================================================
// Gravação Local (Independente)
// =====================================================================
async function openRecordModal() {
  const recDir = S.system.recordingsDir || '';
  const vWanted = S.brand.recVert ?? !!S.brand.vOn;
  // vertical vinculada que só está transmitindo: dá para ligar a gravação nela também
  const vLinkLive = !!(vLinked() && !S.vlive.record);
  const vBusy = !!S.vlive && !vLinkLive;
  const vChecked = vWanted && !vBusy;

  const result = await modal(
    `
    <h3>Gravar localmente</h3>
    <p class="sub">${S.system.platform === 'android' ? 'Grava o programa em MP4 na memória deste aparelho com aceleração por hardware.' : 'Grava o programa em alta qualidade diretamente em MP4 neste computador.'}</p>
    <div class="rec-choice" role="radiogroup" aria-label="O que gravar">
      <label class="rc-opt"><input type="radio" name="glv" value="h" ${vChecked ? '' : 'checked'}><span class="rc-ico h"></span><span class="rc-txt"><strong>Só horizontal</strong><span>16:9 · 1 arquivo MP4</span></span></label>
      <label class="rc-opt ${vBusy ? 'disabled' : ''}"><input type="radio" name="glv" value="hv" ${vChecked ? 'checked' : ''} ${vBusy ? 'disabled' : ''}><span class="rc-ico hv"></span><span class="rc-txt"><strong>Horizontal + vertical</strong><span>16:9 e 9:16 ao mesmo tempo · 2 arquivos (…_vertical.mp4)</span></span></label>
    </div>
    <div class="rec-where" id="gl-where"><span class="rw-lbl">Gravações em</span><code id="gl-dir-path" title="${esc(recDir)}">${esc(recDir)}</code><button class="btn sm ghost" id="gl-dir" type="button">Alterar…</button></div>
    <div class="row" style="margin-top:10px">
      <label class="field grow"><span>Qualidade</span><select class="input" id="gl-preset">${Object.entries(S.system.presets)
        .filter(([, v]) => !v.vertical)
        .map(([k, v]) => `<option value="${k}" ${k === S.preset ? 'selected' : ''}>${v.height}p${v.fps} · ${(v.videoKbps / 1000).toFixed(1)} Mbps</option>`)
        .join('')}</select></label>
      <label class="field grow"><span>Taxa de bits</span><select class="input" id="gl-bitrate">${BITRATE_OPTS
        .map(([v, l]) => `<option value="${v}" ${v === (S.bitrate || 0) ? 'selected' : ''}>${esc(l)}</option>`)
        .join('')}</select></label>
      <label class="field grow"><span>Encoder</span><select class="input" id="gl-enc">${S.system.ffmpeg.encoders
        .map((e) => `<option value="${e.id}" ${e.id === S.encoder ? 'selected' : ''}>${esc(e.label)}</option>`)
        .join('')}</select></label>
    </div>
    ${S.system.ffmpeg.available ? '' : `<p class="hint" style="color:hsl(354 90% 72%)">${esc(S.system.ffmpeg.error)}</p>`}
    <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="gl-go">${icons.record} Começar a gravar</button></div>`,
    {
      onMount(m, close) {
        $('#gl-dir', m).onclick = async () => {
          const dir = await chooseRecordingsDir(S.system.recordingsDir);
          if (!dir) return;
          S.system.recordingsDir = dir;
          const c = $('#gl-dir-path', m);
          c.textContent = dir;
          c.title = dir;
        };
        $('#gl-go', m).onclick = () => {
          const vertical = $('input[name=glv]:checked', m)?.value === 'hv';
          close({ vertical, preset: $('#gl-preset', m).value, bitrate: Number($('#gl-bitrate', m).value) || 0, encoder: $('#gl-enc', m).value });
        };
      },
    },
  );
  if (!result) return;
  if (typeof result.bitrate === 'number') S.bitrate = result.bitrate;
  if (result.preset !== S.preset) {
    S.preset = result.preset;
    applyPreset();
  }
  S.encoder = result.encoder;
  if (!vBusy) S.brand.recVert = result.vertical;
  saveStudio();

  await startRecording(result);
  if (result.vertical && S.recording) {
    if (!S.vlive) {
      await startVertical({ destinationIds: [], record: true, linked: true });
      buildVDests();
    } else if (vLinked() && !S.vlive.record) {
      vBroadcaster.startRecord();
      vPatch({ record: true });
    }
  }
}

async function startRecording({ vertical }) {
  const recBtn = $('#btn-record');
  recBtn.disabled = true;
  try {
    if (broadcaster?.active) {
      broadcaster.startRecord();
    } else {
      setupBroadcasterEvents();
      const st = await broadcaster.start({
        studioId,
        stream: programStream,
        destinationIds: [],
        record: true,
        preset: S.preset,
        presetInfo: S.system.presets[S.preset],
        encoder: S.encoder,
        videoKbps: S.bitrate || S.system.presets[S.preset].videoKbps,
      });
      S.status = st;
    }
    S.recording = { startedAt: Date.now(), vertical: !!vertical };
    syncLiveCompat();
    toast('Gravação iniciada!', 'ok');
    pushStudioState();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    recBtn.disabled = false;
    renderLiveStats();
    if (tabOpen('output')) renderOutputPanel();
  }
}

async function stopRecord() {
  if (!S.recording) return;
  if (!(await confirmDialog('Deseja parar a gravação local?', { ok: 'Parar gravação', danger: true }))) return;
  if (!S.recording) return;
  if (S.streaming) {
    broadcaster?.stopRecord();
  } else {
    broadcaster?.stop();
  }
  // vertical vinculada: para só a gravação dela; se ela também estiver transmitindo, continua no ar
  const v = vLinked();
  if (v?.record) {
    if (v.destinationIds?.length) {
      vBroadcaster.stopRecord();
      vPatch({ record: false });
    } else {
      vBroadcaster.stop();
    }
  }
  S.recording = null;
  syncLiveCompat();
  renderLiveStats();
  if (tabOpen('output')) renderOutputPanel();
  pushStudioState();
  toast('Gravação finalizada e salva em MP4', 'ok');
}

// =====================================================================
// Transmissão ao Vivo (Independente)
// =====================================================================
async function openGoLive() {
  try {
    S.destinations = await api('/destinations');
  } catch {}
  const recDir = S.system.recordingsDir || '';
  const vWanted = S.brand.liveVert ?? !!S.brand.vOn;
  // vertical vinculada que só está gravando: dá para colocar os destinos verticais no ar nela
  const vLinkRec = !!(vLinked() && !S.vlive.destinationIds?.length);
  const vBusy = !!S.vlive && !vLinkRec;
  const vChecked = vWanted && !vBusy;
  const hDests = S.destinations.filter((d) => destFormat(d) === 'h');
  const vDests = S.destinations.filter((d) => destFormat(d) === 'v');
  const vSel = new Set(S.brand.vdest || vDests.filter((d) => d.enabled).map((d) => d.id));
  const destRow = (d, name, checked) => `<label class="list-item card check gl-dest">
      <input type="checkbox" name="${name}" value="${d.id}" ${checked ? 'checked' : ''}>
      <span class="plat ${d.platform}">${PLATFORMS[d.platform]?.short || '⚡'}</span>
      <span class="meta"><strong>${esc(d.name)} ${fmtBadge(d)}</strong><span>${esc(d.url)}${d.hasKey ? '' : ' · sem chave'}</span></span></label>`;
  const noDest = (f) => `<div class="empty gl-empty">${f === 'v' ? 'Nenhum destino vertical (9:16) cadastrado ainda.' : 'Nenhum destino horizontal (16:9) cadastrado ainda.'}</div>`;
  const addBtn = (f) => `<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm ghost gl-add" type="button" data-gl-add="${f}">${f === 'v' ? '＋ Novo destino vertical' : '＋ Novo destino horizontal'}</button><button class="btn sm ghost gl-add" type="button" data-gl-help="${f}">❓ <span>Onde pego a chave?</span></button></div>`;

  const isAlreadyRecording = !!S.recording;

  const result = await modal(
    `
    <h3>Transmitir ao vivo</h3>
    <p class="sub">${S.system.platform === 'android' ? 'Escolha o formato e os destinos. A codificação usa o hardware do aparelho.' : 'Escolha o formato e os destinos. Todo o processamento acontece neste PC via FFmpeg.'}</p>
    <div class="rec-choice" role="radiogroup" aria-label="O que transmitir">
      <label class="rc-opt"><input type="radio" name="glv" value="h" ${vChecked ? '' : 'checked'}><span class="rc-ico h"></span><span class="rc-txt"><strong>Só horizontal</strong><span>16:9 · YouTube, Facebook, Twitch…</span></span></label>
      <label class="rc-opt ${vBusy ? 'disabled' : ''}"><input type="radio" name="glv" value="hv" ${vChecked ? 'checked' : ''} ${vBusy ? 'disabled' : ''}><span class="rc-ico hv"></span><span class="rc-txt"><strong>Horizontal + vertical</strong><span>16:9 e 9:16 juntos · + Instagram, TikTok, Shorts</span></span></label>
    </div>
    ${vBusy ? '<p class="hint gl-note">A saída vertical já está ativa no painel Vertical e continua independente.</p>' : ''}
    <div class="gl-sec" id="gl-sec-h">
      <div class="gl-sec-hd"><span class="rc-ico h sm"></span><strong>Destinos horizontais</strong><span class="hint">16:9</span></div>
      <div class="list gl-list">${hDests.length ? hDests.map((d) => destRow(d, 'dest', d.enabled)).join('') : noDest('h')}</div>
      ${addBtn('h')}
    </div>
    <div class="gl-sec" id="gl-sec-v" ${vChecked ? '' : 'hidden'}>
      <div class="gl-sec-hd"><span class="rc-ico v sm"></span><strong>Destinos verticais</strong><span class="hint">9:16 · layout do painel Vertical</span></div>
      <div class="list gl-list">${vDests.length ? vDests.map((d) => destRow(d, 'vdest-gl', vSel.has(d.id))).join('') : noDest('v')}</div>
      ${addBtn('v')}
    </div>
    ${isAlreadyRecording ? '<p class="hint" style="color:var(--ok);margin:6px 0">⏺ Gravação local já está ativa.</p>' : `<label class="check gl-rec-row"><input type="checkbox" id="gl-rec" ${S.brand.liveRec ? 'checked' : ''}> <span>Também gravar MP4 neste PC <span class="hint" id="gl-rec-hint">${vChecked ? '(horizontal e vertical)' : ''}</span></span></label>`}
    <div class="rec-where" id="gl-where" ${isAlreadyRecording || S.brand.liveRec ? '' : 'hidden'}><span class="rw-lbl">Gravações em</span><code id="gl-dir-path" title="${esc(recDir)}">${esc(recDir)}</code><button class="btn sm ghost" id="gl-dir" type="button">Alterar…</button></div>
    <div class="row" style="margin-top:10px">
      <label class="field grow"><span>Qualidade (horizontal)</span><select class="input" id="gl-preset">${Object.entries(S.system.presets)
        .filter(([, v]) => !v.vertical)
        .map(([k, v]) => `<option value="${k}" ${k === S.preset ? 'selected' : ''}>${v.height}p${v.fps} · ${(v.videoKbps / 1000).toFixed(1)} Mbps</option>`)
        .join('')}</select></label>
      <label class="field grow"><span>Taxa de bits</span><select class="input" id="gl-bitrate">${BITRATE_OPTS
        .map(([v, l]) => `<option value="${v}" ${v === (S.bitrate || 0) ? 'selected' : ''}>${esc(l)}</option>`)
        .join('')}</select></label>
      <label class="field grow"><span>Encoder</span><select class="input" id="gl-enc">${S.system.ffmpeg.encoders
        .map((e) => `<option value="${e.id}" ${e.id === S.encoder ? 'selected' : ''}>${esc(e.label)}</option>`)
        .join('')}</select></label>
    </div>
    <div class="gl-check" id="gl-check"></div>
    <label class="check gl-count-row"><input type="checkbox" id="gl-count" ${S.brand.liveCountdown ? 'checked' : ''}> <span>Contagem 3‑2‑1 antes de entrar <span class="hint">(só aparece aqui no estúdio)</span></span></label>
    ${S.system.ffmpeg.available ? '' : `<p class="hint" style="color:hsl(354 90% 72%)">${esc(S.system.ffmpeg.error)}</p>`}
    <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn live" id="gl-go">${icons.broadcast} Entrar ao vivo</button></div>`,
    {
      onMount(m, close) {
        const isHV = () => $('input[name=glv]:checked', m)?.value === 'hv';
        const sync = () => {
          const hv = isHV();
          const sv = $('#gl-sec-v', m);
          if (sv) sv.hidden = !hv;
          const rec = isAlreadyRecording || !!$('#gl-rec', m)?.checked;
          $('#gl-where', m).hidden = !rec;
          const hint = $('#gl-rec-hint', m);
          if (hint) hint.textContent = hv ? '(horizontal e vertical)' : '';
          const go = $('#gl-go', m);
          go.innerHTML = `${icons.broadcast} ${hv ? 'Entrar ao vivo (16:9 + 9:16)' : 'Entrar ao vivo'}`;
          // checagem pré-live: mic, imagem, chaves e disco antes de apertar o botão
          const destIds = [...$$('input[name=dest]:checked', m), ...(hv ? $$('input[name=vdest-gl]:checked', m) : [])].map((i) => i.value);
          onAir.preflight($('#gl-check', m), { destIds, record: rec, lastSignal: () => meters?.lastSignal() || 0, hasMic: () => !!meters?.hasMic(), api });
        };
        $$('input[name=glv]', m).forEach((i) => (i.onchange = sync));
        $$('input[name=dest], input[name=vdest-gl]', m).forEach((i) => (i.onchange = sync));
        const rc = $('#gl-rec', m);
        if (rc) rc.onchange = sync;
        sync();
        $$('[data-gl-add]', m).forEach(
          (b) =>
            (b.onclick = () => {
              close(null);
              setTimeout(async () => {
                await editDestination(null, { format: b.dataset.glAdd });
                await refreshDestinations();
                openGoLive();
              }, 50);
            }),
        );
        $$('[data-gl-help]', m).forEach((b) => (b.onclick = () => showKeyHelp(b.dataset.glHelp === 'v' ? 'instagram' : 'youtube')));
        $('#gl-dir', m).onclick = async () => {
          const dir = await chooseRecordingsDir(S.system.recordingsDir);
          if (!dir) return;
          S.system.recordingsDir = dir;
          const c = $('#gl-dir-path', m);
          c.textContent = dir;
          c.title = dir;
        };
        $('#gl-go', m).onclick = () => {
          const vertical = isHV();
          const destinationIds = $$('input[name=dest]:checked', m).map((i) => i.value);
          const vDestinationIds = !vertical ? [] : $$('input[name=vdest-gl]:checked', m).map((i) => i.value);
          const record = isAlreadyRecording || !!$('#gl-rec', m)?.checked;
          if (!destinationIds.length && !vDestinationIds.length) return toast('Selecione ao menos um destino de transmissão.', 'err');
          if (!destinationIds.length) return toast('Escolha um destino horizontal.', 'err');
          if (vertical && !vDestinationIds.length) return toast('Escolha um destino vertical.', 'err');
          close({ destinationIds, vDestinationIds, record, preset: $('#gl-preset', m).value, bitrate: Number($('#gl-bitrate', m).value) || 0, encoder: $('#gl-enc', m).value, vertical, countdown: !!$('#gl-count', m)?.checked });
        };
      },
    },
  );
  if (!result) return;
  if (typeof result.bitrate === 'number') S.bitrate = result.bitrate;
  if (result.preset !== S.preset) {
    S.preset = result.preset;
    applyPreset();
  }
  S.encoder = result.encoder;
  if (!vBusy) S.brand.liveVert = result.vertical;
  S.brand.liveRec = result.record;
  if (result.vertical) S.brand.vdest = result.vDestinationIds;
  S.brand.liveCountdown = !!result.countdown;
  saveStudio();

  if (result.countdown && !(await onAir.countdown(3))) return toast('Entrada ao vivo cancelada');
  if (S.streaming) return; // alguém (co-host/outra aba) já entrou ao vivo durante a contagem
  await startLive(result);
  if (result.vertical && S.streaming) {
    if (!S.vlive) {
      await startVertical({ destinationIds: result.vDestinationIds, record: result.record, linked: true });
      buildVDests();
    } else if (vLinked()) {
      // a vertical já estava gravando (botão Gravar): agora ela também vai ao ar
      vBroadcaster.startDestinations(result.vDestinationIds);
      if (result.record && !S.vlive.record) vBroadcaster.startRecord();
      vPatch({ destinationIds: result.vDestinationIds, record: S.vlive.record || !!result.record });
      buildVDests();
      toast('Vertical AO VIVO!', 'ok');
    }
  }
}

async function startLive({ destinationIds, record, vertical }) {
  const btn = $('#btn-live');
  btn.disabled = true;
  try {
    if (broadcaster?.active) {
      broadcaster.startDestinations(destinationIds);
      if (record && !S.recording) {
        broadcaster.startRecord();
        S.recording = { startedAt: Date.now(), vertical: !!vertical };
      }
    } else {
      setupBroadcasterEvents();
      const st = await broadcaster.start({
        studioId,
        stream: programStream,
        destinationIds,
        record,
        preset: S.preset,
        presetInfo: S.system.presets[S.preset],
        encoder: S.encoder,
        videoKbps: S.bitrate || S.system.presets[S.preset].videoKbps,
      });
      S.status = st;
      if (record) {
        S.recording = { startedAt: Date.now(), vertical: !!vertical };
      }
    }
    S.streaming = { startedAt: Date.now(), destinationIds, vertical: !!vertical };
    syncLiveCompat();
    toast('Você está AO VIVO!', 'ok');
    pushStudioState();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    renderLiveStats();
    if (tabOpen('output')) renderOutputPanel();
  }
}

async function stopLive() {
  if (!S.streaming) return;
  const vl = vLinked();
  const both = vl?.destinationIds?.length ? ' (horizontal e vertical)' : '';
  if (!(await confirmDialog(`Encerrar a transmissão ao vivo${both}?`, { ok: 'Encerrar', danger: true }))) return;
  if (!S.streaming) return;
  if (S.recording) {
    broadcaster?.stopDestinations();
  } else {
    broadcaster?.stop();
  }
  // vertical vinculada: tira só os destinos dela do ar; se estiver gravando, a gravação continua
  const v = vLinked();
  if (v?.destinationIds?.length) {
    if (v.record) {
      vBroadcaster.stopDestinations();
      vPatch({ destinationIds: [] });
    } else {
      vBroadcaster.stop();
    }
  }
  S.streaming = null;
  syncLiveCompat();
  renderLiveStats();
  if (tabOpen('output')) renderOutputPanel();
  pushStudioState();
  toast('Transmissão ao vivo encerrada', 'ok');
}

// botões REC/LIVE, selos no programa e pílula de saúde: tudo em onair.js
function renderLiveStats() {
  onAir.render();
}
setInterval(() => (S.streaming || S.recording || S.vlive) && renderLiveStats(), 1000);

// =====================================================================
// Modais: convite e ajustes
// =====================================================================
async function showInvite() {
  let sys = S.system;
  try {
    sys = await api('/system');
  } catch {}
  // corpo da janela: refeito sozinho enquanto o túnel conecta (o usuário só espera, não precisa reabrir)
  const body = (sys) => {
    const t = sys.tunnel || {};
    const links = [];
    if (t.url) links.push({ label: '🌐 Internet (qualquer lugar)', url: `${t.url}/join/${studioId}`, main: true });
    for (const l of sys.lan) links.push({ label: `Rede local · ${l.name}`, url: `${l.url}/join/${studioId}` });
    const tunnelMsg = {
      on: '',
      downloading: `⏳ Preparando a conexão para convidados de fora (${Math.round(Number(t.download?.progress) || 0)}%)… aguarde, o link de Internet aparece aqui sozinho.`,
      starting: '⏳ Conectando para receber convidados de fora… aguarde alguns segundos, o link de Internet aparece aqui sozinho.',
      off: 'A conexão para convidados de fora está desligada. Ative em Painel → Configurações.',
      error: `Conexão para convidados de fora indisponível: ${t.error || 'erro'}`,
    }[t.status || 'off'];
    return `${tunnelMsg ? `<div class="status-banner" style="margin-bottom:12px">${esc(tunnelMsg)}</div>` : ''}
    <div class="list">${
      links.length
        ? links
            .map(
              (l) => `<div class="list-item card invite-card" style="box-shadow:none;padding:10px 12px;${l.main ? 'border-color:var(--accent)' : ''}"><div class="invite-qr">${qrSvg(l.url)}</div><div class="meta"><strong>${esc(l.label)}</strong><span>${esc(l.url)}</span></div>
              <button class="btn sm ${l.main ? 'primary' : ''}" data-copy="${esc(l.url)}">${icons.copy} Copiar</button></div>`,
            )
            .join('')
        : '<div class="empty">Nenhum link disponível.</div>'
    }</div>`;
  };
  await modal(
    `
    <h3>Convidar pessoas</h3>
    <p class="sub">Envie o link para o convidado. Ele entra pelo navegador (Chrome/Edge), sem instalar nada e sem conta.</p>
    <div class="inv-body">${body(sys)}</div>
    <p class="hint" style="margin-top:14px">💡 <b>Convidado no mesmo Wi‑Fi que você?</b> Mande o link da <b>rede local</b>: é mais rápido e tem a melhor qualidade. O link de Internet é para quem está fora da sua rede (alguns roteadores não o ligam a aparelhos da própria casa; nesse caso, o convidado pode usar os dados móveis).</p>
    <p class="hint">O link de Internet muda cada vez que o CastDeck é reiniciado. O link de rede local usa certificado autoassinado (o navegador mostra um aviso; clique em <b>Avançado → Continuar</b>).</p>
    <p class="hint">Quem estiver em rede muito restritiva pode não conectar sem um servidor TURN — configure em Painel → Configurações.</p>
    <div class="modal-actions"><button class="btn primary" data-close>Pronto</button></div>`,
    {
      onMount(m) {
        const bind = () => $$('[data-copy]', m).forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
        bind();
        let last = `${sys.tunnel?.status}|${sys.tunnel?.url}|${sys.tunnel?.download?.progress}`;
        const tick = async () => {
          if (!m.isConnected) return;
          const st = sys.tunnel?.status;
          if (st === 'starting' || st === 'downloading') {
            try {
              sys = await api('/system');
              const key = `${sys.tunnel?.status}|${sys.tunnel?.url}|${sys.tunnel?.download?.progress}`;
              if (key !== last && m.isConnected) {
                last = key;
                $('.inv-body', m).innerHTML = body(sys);
                bind();
                if (sys.tunnel?.status === 'on') toast('Link de Internet pronto!', 'ok');
              }
            } catch {}
          }
          setTimeout(tick, 1500);
        };
        setTimeout(tick, 1500);
      },
    },
  );
}

// QR Code em SVG (nítido em qualquer tamanho), a partir do gerador próprio (qr.js)
function qrSvg(text) {
  const q = makeQR(text, 'M');
  const n = q.size + 8; // 4 módulos de margem branca de cada lado (zona de silêncio exigida pelos leitores)
  let d = '';
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  // Escala INTEIRA por módulo (px por módulo). Com 190px fixos o navegador caía em 4,63px por módulo e o
  // `crispEdges` serrilhava/entortava o desenho. Aqui cada módulo tem o mesmo número inteiro de pixels.
  const px = Math.max(2, Math.floor(200 / n));
  const dim = n * px;
  return `<svg width="${dim}" height="${dim}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" preserveAspectRatio="xMidYMid meet" role="img" aria-label="QR Code" style="width:${dim}px;height:${dim}px;max-width:100%;display:block;image-rendering:pixelated"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// "＋ Câmera": câmera ligada neste computador (USB/captura) ou um celular/aparelho pela rede (QR Code)
async function openAddCamera() {
  const pick = await modal(
    `<h3>Adicionar câmera</h3>
    <p class="sub">Escolha de onde vem a imagem.</p>
    <div class="addcam-opts">
      <button class="addcam-opt" data-pick="remote"><span class="addcam-ico">📱</span><strong>Celular ou outro aparelho</strong><span>Leia o QR Code com a câmera do celular. Funciona no mesmo Wi‑Fi ou pela internet.</span></button>
      <button class="addcam-opt" data-pick="usb"><span class="addcam-ico">🎥</span><strong>Câmera deste computador</strong><span>Webcam USB, placa de captura ou câmera virtual, com áudio próprio.</span></button>
      <button class="addcam-opt" data-pick="ingest"><span class="addcam-ico">🚁</span><strong>Drone ou câmera profissional</strong><span>Recebe RTMP ou SRT (H.264/H.265) de drones, câmeras, encoders e apps da mesma rede.</span></button>
      <button class="addcam-opt" data-pick="manage"><span class="addcam-ico">🎛️</span><strong>Gerenciar câmeras</strong><span>Preview, zoom, foco, ISO, exposição, cor, lanterna e interfaces de vídeo/áudio.</span></button>
    </div>
    <div class="modal-actions"><button class="btn" data-close>Cancelar</button></div>`,
    { onMount: (m, close) => m.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => close(b.dataset.pick))) },
  );
  if (pick === 'usb') extras?.camDialog();
  else if (pick === 'remote') showRemoteCam();
  else if (pick === 'ingest') ingest?.openPanel();
  else if (pick === 'manage') cameras?.open();
}

async function showRemoteCam() {
  let sys = S.system;
  try {
    sys = await api('/system');
  } catch {}
  let lans = (Array.isArray(sys.lan) ? sys.lan : []).filter((x) => x?.url);
  let lanIndex = 0;
  try {
    const saved = Number(localStorage.getItem('castdeck.cam.lan'));
    if (Number.isInteger(saved) && saved >= 0 && saved < lans.length) lanIndex = saved;
  } catch {}
  let grid = null;
  let live = null;
  let toolbar = null;
  let timer = null;
  let refreshing = false;
  let quality = '1080';
  try {
    const savedQ = localStorage.getItem('castdeck.cam.q');
    if (savedQ === '720' || savedQ === '1080') quality = savedQ;
  } catch {}
  const base = (u) => String(u || '').replace(/\/+$/, '');
  const linkFor = (u) => (u ? `${base(u)}/cam/${studioId}?q=${quality}&fps=30` : '');
  const lanUrl = () => linkFor(lans[lanIndex]?.url);
  const netUrl = () => linkFor(sys.tunnel?.url);
  const netMessage = () => {
    const t = sys.tunnel || {};
    return {
      downloading: `Preparando o link de internet (baixando ${t.download?.progress || 0}%)…`,
      starting: 'Abrindo o link de internet… aguarde alguns segundos.',
      off: 'Link de internet desligado. Ative em Painel → Conexão.',
      error: `Link de internet indisponível: ${t.error || 'erro'}`,
    }[t.status || 'off'] || 'Link de internet indisponível.';
  };
  const card = (ico, title, sub, url, empty) => `
    <div class="camqr-card">
      <div class="camqr-head"><span>${ico}</span><div><strong>${esc(title)}</strong><small>${esc(sub)}</small></div></div>
      ${url
        ? `<div class="camqr-qr"><div class="camqr-code">${qrSvg(url)}</div></div>
           <code class="camqr-url" title="${esc(url)}">${esc(url)}</code>
           <div class="camqr-actions">
             <button class="btn sm" data-copy="${esc(url)}">${icons.copy} Copiar link</button>
             <a class="btn sm ghost" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a>
           </div>`
        : `<div class="camqr-empty">${esc(empty)}</div>`}
    </div>`;
  const renderToolbar = () => {
    if (!toolbar || !toolbar.isConnected) return;
    toolbar.innerHTML =
      `<label class="camqr-opt"><span>Qualidade</span><select class="input" id="camqr-quality">
        <option value="1080" ${quality === '1080' ? 'selected' : ''}>Full HD · 1080p</option>
        <option value="720" ${quality === '720' ? 'selected' : ''}>HD · 720p</option>
      </select></label>` +
      (lans.length > 1
        ? `<label class="camqr-opt"><span>Rede deste PC</span><select class="input" id="camqr-lan">${lans.map((l, i) => `<option value="${i}" ${i === lanIndex ? 'selected' : ''}>${esc(l.label || 'Rede local')} — ${esc(l.address || `Rede ${i + 1}`)}</option>`).join('')}</select></label>`
        : '');
    const q = $('#camqr-quality', toolbar);
    if (q) {
      q.onchange = () => {
        quality = q.value === '720' ? '720' : '1080';
        try { localStorage.setItem('castdeck.cam.q', quality); } catch {}
        renderCards();
      };
    }
    const pick = $('#camqr-lan', toolbar);
    if (pick) {
      pick.onchange = () => {
        lanIndex = Math.max(0, Math.min(lans.length - 1, Number(pick.value) || 0));
        try { localStorage.setItem('castdeck.cam.lan', String(lanIndex)); } catch {}
        renderCards();
      };
    }
  };
  const renderCards = () => {
    if (!grid || !grid.isConnected) return;
    grid.innerHTML =
      card('📶', 'Mesma rede (Wi‑Fi)', 'Melhor qualidade, sem usar internet', lanUrl(), 'Nenhuma rede local encontrada. Use a Internet ou conecte o PC ao Wi‑Fi.') +
      card('🌐', 'Internet', 'De qualquer lugar (4G/5G ou outra rede)', netUrl(), netMessage());
    grid.querySelectorAll('[data-copy]').forEach((b) => {
      b.onclick = () => copyText(b.dataset.copy);
    });
  };
  const renderLive = () => {
    if (!live || !live.isConnected) return;
    const cams = [...S.guests.values()].filter((g) => g.cam && !g.removed);
    if (!cams.length) {
      live.innerHTML = '<div class="camqr-wait"><span class="camqr-dot"></span><div><b>Aguardando o celular…</b><small>Escaneie um QR Code; a câmera aparece aqui quando conectar.</small></div></div>';
      return;
    }
    const rows = cams.map((g) => {
      const src = S.sources.get(`${g.id}:cam`);
      const onStage = !!(src && S.stage.includes(src.id));
      const onAir = !!(src && S.take === src.id);
      const where = onAir ? 'No ar' : onStage ? 'No palco' : 'Conectada';
      return `<div class="camqr-live-item">
        <span class="camqr-dot on"></span>
        <div class="camqr-live-txt"><b>${esc(g.name || 'Celular')}</b><small>${where}</small></div>
        ${src && !onStage ? `<button class="btn sm" data-cam-stage="${esc(g.id)}">Pôr no palco</button>` : ''}
      </div>`;
    }).join('');
    live.innerHTML = `<div class="camqr-live-title"><b>${cams.length} celular${cams.length === 1 ? '' : 'es'} conectado${cams.length === 1 ? '' : 's'}</b><small>A câmera está conectada ao estúdio.</small></div>${rows}`;
    live.querySelectorAll('[data-cam-stage]').forEach((b) => {
      b.onclick = () => {
        const src = S.sources.get(`${b.dataset.camStage}:cam`);
        if (src) {
          toggleStage(src.id);
          renderLive();
        }
      };
    });
  };
  const refresh = async (notify) => {
    if (refreshing) return;
    refreshing = true;
    try {
      const next = await api('/system');
      sys = next;
      lans = (Array.isArray(sys.lan) ? sys.lan : []).filter((x) => x?.url);
      if (lanIndex >= lans.length) lanIndex = 0;
      renderToolbar();
      renderCards();
      renderLive();
      if (notify) toast('Links atualizados.', 'ok');
    } catch (e) {
      if (notify) toast('Não foi possível atualizar os links: ' + e.message, 'err');
    } finally {
      refreshing = false;
    }
  };
  let ticks = 0;
  await modal(
    `<h3>Celular como câmera</h3>
    <p class="sub">Aponte a câmera do celular para o QR Code (ou mande o link). A imagem aparece nos bastidores como <b>Câmera remota</b>.</p>
    <div class="camqr-toolbar" id="camqr-toolbar"></div>
    <div class="camqr" id="camqr-grid"></div>
    <div class="camqr-live" id="camqr-live" aria-live="polite"></div>
    <p class="hint">No link local o navegador mostra um aviso de certificado: toque em <b>Avançado → Continuar</b>. O microfone do celular começa desligado (ligue no próprio aparelho). Mantenha a tela ligada.</p>
    <div class="modal-actions">
      <button class="btn" id="camqr-refresh">↻ Atualizar links</button>
      <button class="btn primary" data-close>Pronto</button>
    </div>`,
    {
      onMount: (m) => {
        grid = $('#camqr-grid', m);
        live = $('#camqr-live', m);
        toolbar = $('#camqr-toolbar', m);
        renderToolbar();
        renderCards();
        renderLive();
        $('#camqr-refresh', m).onclick = () => refresh(true);
        timer = setInterval(() => {
          if (!live?.isConnected) {
            clearInterval(timer);
            timer = null;
            return;
          }
          ticks++;
          renderLive();
          const status = sys.tunnel?.status;
          if (ticks % 3 === 0 && (status === 'downloading' || status === 'starting')) refresh(false);
        }, 1000);
      },
    },
  );
  clearInterval(timer);
}

// Botão "Ajustes" da barra de baixo: abre Ajustes → Dispositivos no painel (no celular, abre o painel por cima).
// Antes era um modal separado; agora todos os ajustes ficam no mesmo grupo do painel.
function showSettings() {
  openSideTab('devices');
  // no celular/tablet o painel é uma gaveta (position: fixed) que precisa ser aberta; no PC ele já está à vista
  const side = $('#side');
  if (side && getComputedStyle(side).position === 'fixed') $('.studio')?.classList.add('panel-open');
}

// Ajustes → Dispositivos: nome, câmera, qualidade, microfone, câmeras extras, pasta das gravações e limpeza.
let devicesSeq = 0; // a lista de aparelhos é assíncrona: só a última chamada desenha
async function renderDevicesPanel() {
  const p = $('#panel-devices');
  if (!p) return;
  const seq = ++devicesSeq;
  const prefs = loadPrefs();
  const { cams, mics } = await listDevices();
  if (seq !== devicesSeq) return;
  p.innerHTML = `
    <h4>Você na tela</h4>
    <label class="field"><span>Seu nome na tela</span><input class="input" id="st-name" value="${esc(S.local.name)}" maxlength="40"></label>
    <h4>Câmera e microfone</h4>
    <label class="field"><span>Câmera</span><select class="input" id="st-cam">${cams.map((d, i) => `<option value="${d.deviceId}" ${d.deviceId === prefs.camId ? 'selected' : ''}>${esc(d.label || 'Câmera ' + (i + 1))}</option>`).join('')}</select></label>
    <label class="field"><span>Qualidade da câmera</span><select class="input" id="st-q">${[['720', 'HD 720p'], ['1080', 'Full HD 1080p'], ['480', 'SD 480p']].map(([v, l]) => `<option value="${v}" ${v === (prefs.quality || '720') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Microfone</span><select class="input" id="st-mic">${mics.map((d, i) => `<option value="${d.deviceId}" ${d.deviceId === prefs.micId ? 'selected' : ''}>${esc(d.label || 'Microfone ' + (i + 1))}</option>`).join('')}</select></label>
    <label class="check st-raw-row"><input type="checkbox" id="st-raw" ${prefs.rawMic ? 'checked' : ''}> <span>Áudio puro <span class="hint">(sem redução de ruído e sem cancelamento de eco)</span></span></label>
    <button class="btn primary st-apply" id="st-save" disabled>Aplicar</button>
    <h4>Câmeras extras e gravações</h4>
    <div class="st-more">
      <div class="st-more-txt"><strong>Câmeras extras</strong><span class="hint">${extras?.cams.size ? `${extras.cams.size} em uso: ${[...extras.cams.values()].map((c) => esc(c.label)).join(', ')}` : 'Webcams USB/UVC ou placas de captura, cada uma com seu áudio.'}</span></div>
      <button class="btn sm" id="st-addcam">＋ Adicionar</button>
    </div>
    <div class="st-more">
      <div class="st-more-txt"><strong>Pasta das gravações</strong><code class="hint" id="st-dir-path" style="overflow-wrap:anywhere">${esc(S.system.recordingsDir || '')}</code></div>
      <button class="btn sm" id="st-dir">Alterar…</button>
    </div>
    <div class="st-more">
      <div class="st-more-txt"><strong>Limpeza e armazenamento</strong><span class="hint">Gravações antigas, cache, mídias salvas e reset da cena.</span></div>
      <button class="btn sm" id="st-clean">Abrir</button>
    </div>
    <div class="st-more">
      <div class="st-more-txt"><strong>Diagnóstico</strong><span class="hint">Baixe versão, sistema, memória, FFmpeg, túnel e estado das salas para anexar no suporte.</span></div>
      <button class="btn sm" id="st-diag">Baixar .json</button>
    </div>
    <p class="hint" style="margin:10px 0 0">💾 O estúdio é salvo sozinho (câmeras, mídias, palco, marca e GCs) e volta como estava na próxima vez.</p>`;
  const save = $('#st-save', p);
  // "Aplicar" só acende quando algo mudou (trocar câmera/microfone reabre o aparelho: não fazer isso à toa)
  const dirty = () => {
    save.disabled = !(
      ($('#st-name', p).value.trim() || S.local.name) !== S.local.name ||
      $('#st-cam', p).value !== (prefs.camId || $('#st-cam', p).options[0]?.value) ||
      $('#st-mic', p).value !== (prefs.micId || $('#st-mic', p).options[0]?.value) ||
      $('#st-q', p).value !== (prefs.quality || '720') ||
      $('#st-raw', p).checked !== !!prefs.rawMic
    );
  };
  for (const id of ['#st-name', '#st-cam', '#st-mic', '#st-q', '#st-raw']) {
    $(id, p).addEventListener('input', dirty);
    $(id, p).addEventListener('change', dirty);
  }
  $('#st-name', p).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !save.disabled) {
      e.preventDefault();
      save.click();
    }
  });
  $('#st-addcam', p).onclick = () => extras.camDialog();
  $('#st-clean', p).onclick = () => extras.openCleanup();
  $('#st-diag', p).onclick = async () => {
    try {
      const r = await fetch('/api/diagnostics', { headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = new Blob([await r.text()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `castdeck-diagnostico-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      toast('Não foi possível gerar o diagnóstico: ' + e.message, 'err');
    }
  };
  $('#st-dir', p).onclick = async () => {
    const dir = await chooseRecordingsDir(S.system.recordingsDir);
    if (!dir) return;
    S.system.recordingsDir = dir;
    $('#st-dir-path', p).textContent = dir;
  };
  save.onclick = async () => {
    save.disabled = true;
    const name = $('#st-name', p).value.trim() || S.local.name;
    const camId = $('#st-cam', p).value;
    const micId = $('#st-mic', p).value;
    const quality = $('#st-q', p).value;
    const rawMic = $('#st-raw', p).checked;
    const rawChanged = rawMic !== !!prefs.rawMic;
    savePrefs({ rawMic });
    let ok = true;
    try {
      if (camId !== prefs.camId || quality !== prefs.quality || !S.local.cam) {
        const cam = await getCamera(camId, quality);
        S.local.cam?.getTracks().forEach((t) => t.stop());
        S.local.cam = cam;
        cam.getVideoTracks().forEach((t) => (t.enabled = S.local.camOn));
      }
      if (micId !== prefs.micId || !S.local.mic || rawChanged) {
        const mic = await getMic(micId);
        S.local.mic?.getTracks().forEach((t) => t.stop());
        S.local.mic = mic;
        mixer.addStream('host:mic', mic, { ownerId: 'host', stageKey: 'host:cam', monitor: false });
        mixer.setMuted('host:mic', !S.local.micOn, { save: false });
      }
    } catch (e) {
      ok = false;
      toast('Falha ao trocar dispositivo: ' + e.message, 'err');
    }
    S.local.name = name;
    savePrefs({ name, camId, micId, quality });
    addVideoSource('host:cam', S.local.cam, { label: name, camOff: !S.local.camOn });
    if (S.sources.has('host:screen')) addVideoSource('host:screen', undefined, { label: `Tela de ${name}` });
    if (ok) toast('Ajustes aplicados', 'ok');
    if (tabOpen('devices')) renderDevicesPanel();
  };
}
