// Controle remoto (celular): mesa de corte completa sem enviar câmera/microfone. Fala com o estúdio pelo papel
// 'remote' da sinalização; o host valida e executa cada comando (ver server/signaling.js e studio/remote.js).
import { Signaling, Peer } from './rtc.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const room = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
const key = new URLSearchParams(location.search).get('k') || '';
let st = null; // último remote-state do estúdio
let hostOnline = true;
let wantVideo = localStorage.getItem('cd.remote.watch') === '1';
let wantAudio = localStorage.getItem('cd.remote.audio') === '1';
let audioPeer = null;
let hostId = null;
let lastFrame = '';
let tab = new URLSearchParams(location.search).get('tab') || 'mesa';
if (!['mesa', 'audio', 'replay', 'conteudo', 'mais'].includes(tab)) tab = 'mesa';
let tapCut = localStorage.getItem('cd.remote.tapcut') === '1';
let quick = { title: '', subtitle: '' };
let contentTab = 'gc'; // gc | msgs (dentro da aba Conteúdo)
let unreadChat = 0;
let localChat = []; // mensagens de chat recebidas/enviadas
let prevMasterVol = 1;
let connectTimer = 0;
const sig = new Signaling();

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 1600);
}
const buzz = () => { try { navigator.vibrate?.(12); } catch {} };
function cmd(c) {
  buzz();
  sig.send({ type: 'remote-cmd', cmd: c });
}
function fatal(msg) {
  $('#err-msg').textContent = msg;
  $('#err').classList.add('show');
}
function setDot() {
  const d = $('#dot');
  if (!d) return;
  const on = !!(st && hostOnline);
  d.className = 'dot ' + (on ? 'on' : 'wait');
  document.body.classList.toggle('offline', !on);
  if (!on) {
    $('#sub').textContent = 'Estúdio offline — aguardando…';
    return;
  }
  const lay = (st.layouts || []).find((l) => l.id === st.layout)?.label || st.layout || '';
  $('#sub').textContent = `${st.name || 'Conectado'} · ${lay} · ${st.live ? 'NO AR' : 'Fora do ar'}`;
}

const nameOf = (id) => st?.items.find((i) => i.id === id)?.label || (id ? 'Fonte' : 'Cena (palco)');
const kindTag = (i) => (i.kind === 'screen' ? 'tela' : i.kind === 'media' ? 'vídeo' : i.kind === 'image' ? 'imagem' : i.ownerId === 'host' ? 'host' : 'convidado');
const rank = (i) => (i.kind === 'camera' ? (i.ownerId === 'host' ? 0 : 1) : i.kind === 'screen' ? 2 : 3);
const items = () => [...(st?.items || [])].sort((a, b) => rank(a) - rank(b));

// ---------- monitoramento de áudio do PGM (WebRTC) ----------
function closeAudioPeer() {
  if (audioPeer) {
    try { audioPeer.close(); } catch {}
    audioPeer = null;
  }
  const el = $('#audio-pgm');
  if (el) el.srcObject = null;
}

function startAudioPeer() {
  closeAudioPeer();
  if (!hostId) return;
  audioPeer = new Peer({
    id: hostId,
    polite: true,
    signal: (data) => sig.send({ type: 'signal', to: hostId, data }),
  });
  audioPeer.pc.ontrack = (e) => {
    const el = $('#audio-pgm');
    if (el) {
      el.srcObject = new MediaStream([e.track]);
      el.play().catch(() => {});
    }
  };
  sig.send({ type: 'remote-audio', on: true });
}

function toggleAudio() {
  wantAudio = !wantAudio;
  localStorage.setItem('cd.remote.audio', wantAudio ? '1' : '0');
  $('#btn-audio')?.classList.toggle('on', wantAudio);
  if (wantAudio) {
    startAudioPeer();
    toast('Monitorando áudio do PGM (fones)');
  } else {
    sig.send({ type: 'remote-audio', on: false });
    closeAudioPeer();
    toast('Monitoramento de áudio desligado');
  }
  lastHtml['audio'] = '';
  render();
}

// ---------- abas ----------
function sceneBar() {
  const s = st;
  const list = s.scenes || [];
  if (!list.some(Boolean)) return '';
  return `<h2>Cenas rápidas <span class="h2-badge">F1–F6</span></h2><div class="scene-bar">${list.map((sc, i) => sc ? `<button class="scene-chip ${s.activeScene === i ? 'on' : ''}" data-act="scene" data-i="${i}"><b>F${i + 1}</b><span>${esc(sc.name || 'Cena')}</span></button>` : '').join('')}</div>`;
}

function mesa() {
  const s = st;
  const list = items();
  const screen = wantVideo && s.allowVideo
    ? `<div class="screen"><span class="tag">PGM</span><img id="frame" alt="Programa" ${lastFrame ? `src="${lastFrame}"` : ''}></div>`
    : `<div class="screen off"><span class="tag">PGM</span><b>${esc(s.switcher ? nameOf(s.take) : 'Palco (cena)')}</b></div>`;
  let controls = screen + sceneBar();
  if (!s.switcher) {
    controls += `<div class="note">A mesa de corte está desligada neste estúdio.<br>Ligue para escolher PRÉVIA e PROGRAMA.<br><button class="btn" data-act="sw-on">Ligar mesa de corte</button></div>`;
  } else {
    controls += `<div class="bus"><div class="busbox pgm"><small>NO AR</small><b>${esc(nameOf(s.take))}</b></div><div class="busbox pvw"><small>PRÉVIA</small><b>${esc(s.pvw ? nameOf(s.pvw) : '—')}</b></div></div>
      <div class="trans"><button class="cut" data-act="cut">CORTE</button><button class="auto" data-act="auto">AUTO</button><button class="ftb ${s.ftb ? 'on' : ''}" data-act="ftb">FTB</button></div>`;
  }

  let sources = `<h2>Fontes ${s.switcher ? `<span class="tapcut-wrap"><label><input type="checkbox" id="tapcut" ${tapCut ? 'checked' : ''}> toque corta direto</label></span>` : ''}</h2><div class="grid">`;
  for (const i of list) {
    const pgm = s.switcher && s.take === i.id;
    const pvw = s.switcher && s.pvw === i.id;
    sources += `<button class="src ${pgm ? 'pgm' : pvw ? 'pvw' : ''} ${i.muted ? 'muted' : ''}" data-act="src" data-id="${esc(i.id)}"><b>${esc(i.label || 'Fonte')}</b><small>${kindTag(i)}${i.camOff ? ' · câmera off' : ''}${i.hasAudio && i.muted ? ' · mudo' : ''}</small>${pgm ? '<span class="pill">NO AR</span>' : pvw ? '<span class="pill">PRÉVIA</span>' : ''}</button>`;
  }
  if (!list.length) sources += '<div class="note" style="grid-column:1/-1">Nenhuma fonte no estúdio ainda.</div>';
  sources += '</div>';

  return `<div class="mesa-cols">
    <div class="mesa-left">${controls}</div>
    <div class="mesa-right">${sources}${layoutsBlock()}${stageBlock()}</div>
  </div>`;
}

// Layouts e “No palco” agora vivem na aba Mesa (a antiga aba Cena foi incorporada).
function layoutsBlock() {
  const s = st;
  let h = '<h2>Layout do programa</h2><div class="lay">';
  for (const l of s.layouts || []) h += `<button data-act="layout" data-id="${esc(l.id)}" class="${s.layout === l.id ? 'active' : ''}"><svg viewBox="0 0 48 28">${l.icon || ''}</svg>${esc(l.label)}</button>`;
  return h + '</div>';
}
function stageBlock() {
  const s = st;
  let h = '<h2>No palco</h2>';
  for (const i of items()) {
    const on = s.stage.includes(i.id);
    h += `<div class="row ${on ? 'on' : ''}"><span><b>${esc(i.label || 'Fonte')}</b><small>${kindTag(i)}${s.solo === i.id ? ' · SOLO' : ''}</small></span><div class="mini"><button class="${s.solo === i.id ? 'on' : ''}" data-act="solo" data-id="${esc(i.id)}">Solo</button></div><button aria-label="Palco" data-act="stage" data-id="${esc(i.id)}" data-on="${on ? 0 : 1}" style="background:none;padding:0"><i class="sw" style="display:block"></i></button></div>`;
  }
  if (s.solo) h += '<button class="btn ghost" style="width:100%" data-act="unsolo">Sair do solo</button>';
  return h;
}

function gc() {
  const s = st;
  let h = `<h2>Faixa rápida</h2><input type="text" id="q-title" placeholder="Título (ex.: Maria Silva)" value="${esc(quick.title)}"><input type="text" id="q-sub" placeholder="Subtítulo (opcional)" value="${esc(quick.subtitle)}"><button class="btn" style="width:100%" data-act="quick">Mostrar na tela</button>`;
  h += '<h2>Banners</h2>';
  if (s.activeBanner) h += '<button class="btn ghost" style="width:100%;margin-bottom:8px" data-act="hide-banner">Esconder o banner no ar</button>';
  for (const b of s.banners || []) h += `<button class="row ${s.activeBanner === b.id ? 'air' : ''}" data-act="banner" data-id="${esc(b.id)}"><span><b>${esc(b.title || 'Banner')}</b><small>${esc(b.subtitle || '')}</small></span><i class="sw" style="${s.activeBanner === b.id ? 'background:var(--pgm)' : ''}"></i></button>`;
  if (!(s.banners || []).length) h += '<div class="note">Nenhum banner criado. Crie no painel Banners do estúdio.</div>';
  return h;
}

function msgs() {
  const s = st;
  let h = `<h2>Mensagem rápida na tela</h2>
    <div style="background:var(--panel);padding:12px;border-radius:14px;border:1px solid var(--line);margin-bottom:14px">
      <input type="text" id="msg-screen-title" placeholder="Título ou Nome (ex: Comentário)" value="${esc(quick.title)}">
      <textarea id="msg-screen-sub" rows="2" placeholder="Texto que vai aparecer na tela...">${esc(quick.subtitle)}</textarea>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
        <button class="btn" data-act="send-screen-msg">Colocar na tela</button>
        <button class="btn ghost" data-act="hide-screen-msg">Ocultar</button>
      </div>
    </div>
    <h2>Mensagens do programa <span class="h2-badge">${(s.messages || []).length}</span></h2>
    <div class="rmsgs">${(s.messages || []).length
      ? s.messages.map((m) => `<button class="rmsg ${m.air ? 'air' : ''}" data-act="msg" data-id="${esc(m.id)}"><span class="rmsg-src ${m.source === 'whatsapp' ? 'wa' : ''}">${m.source === 'whatsapp' ? 'WhatsApp' : 'Público'}</span><span class="rmsg-main"><b>${esc(m.name || 'Mensagem')}</b><small>${esc(m.text || (m.audio ? 'Áudio' : 'Mensagem'))}</small></span><span class="rmsg-tag">${m.air ? 'NO AR' : 'No ar'}</span></button>`).join('')
      : '<div class="note">Nenhuma mensagem recebida ainda.</div>'}</div>
    <h2>Chat dos bastidores</h2>
    <div class="chat-box" id="chat-box">`;
  
  const allMsgs = localChat.length ? localChat : (s.chat || []);
  if (!allMsgs.length) {
    h += `<div class="chat-empty">Nenhuma mensagem no chat ainda.<br>Envie avisos rápidos para o estúdio.</div>`;
  } else {
    for (const m of allMsgs) {
      const isRemote = m.role === 'remote';
      const isHost = m.role === 'host' || m.from === 'host';
      const roleClass = isRemote ? 'remote' : isHost ? 'host' : '';
      const author = m.name || (isHost ? 'Host' : isRemote ? 'Controle' : 'Convidado');
      const time = m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      h += `<div class="chat-msg ${roleClass}">
        <div class="chat-hdr"><b>${esc(author)}</b><small>${esc(time)}</small></div>
        <div class="chat-text">${esc(m.text || '')}</div>
        <div class="chat-act">
          <button data-act="msg-to-screen" data-author="${esc(author)}" data-text="${esc(m.text || '')}">Mandar p/ Tela</button>
        </div>
      </div>`;
    }
  }
  h += `</div>
    <form class="chat-form" id="chat-form">
      <input type="text" id="chat-input" placeholder="Mensagem aos bastidores..." autocomplete="off">
      <button type="submit" class="btn">Enviar</button>
    </form>`;
  return h;
}

function audio() {
  const s = st;
  const masterVol = s.masterVolume ?? 1;
  const masterPct = Math.round(masterVol * 100);

  let h = `
    <div class="master-box">
      <div class="master-head">
        <span>🔊 Volume Master (PGM)</span>
        <span style="font-variant-numeric:tabular-nums">${masterPct}%</span>
      </div>
      <div class="vol-bar">
        <button class="btn sm ${s.masterMuted ? 'danger' : 'ghost'}" data-act="master-mute" style="padding:6px 10px;font-size:12px">${s.masterMuted ? 'Desmutar' : 'Mute'}</button>
        <button class="btn sm ${s.dim ? 'on' : 'ghost'}" data-act="dim" style="padding:6px 10px;font-size:12px">DIM</button>
        <input type="range" min="0" max="100" value="${masterPct}" class="vol-slider" data-act="master-slider">
      </div>
    </div>

    <div class="quick-audio">
      <button class="btn sm ${items().some((i) => i.hasAudio && !i.muted) ? 'danger' : 'ghost'}" data-act="mute-all" data-on="${items().some((i) => i.hasAudio && !i.muted) ? 1 : 0}">${items().some((i) => i.hasAudio && !i.muted) ? 'Mudo geral' : 'Reativar todos'}</button>
      ${s.anySolo ? '<button class="btn sm ghost" data-act="clear-solo">Limpar solos</button>' : ''}
    </div>

    <h2>Monitoramento de áudio</h2>
    <div class="row ${wantAudio ? 'on' : ''}" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <span><b>Ouvir programa (fones)</b><small>${wantAudio ? '🟢 Monitorando saída PGM' : 'Desligado'}</small></span>
        <button class="iconbtn ${wantAudio ? 'on' : ''}" data-act="toggle-audio-mon" style="width:36px;height:36px;font-size:16px" title="Monitorar áudio PGM">🎧</button>
      </div>
    </div>

    <h2>Fontes e faders de volume</h2>`;

  const withAudio = items().filter((i) => i.hasAudio);
  for (const i of withAudio) {
    const vol = Math.round((i.volume ?? 1) * 100);
    h += `
    <div class="row ${i.muted ? 'bad' : ''}" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span><b>${esc(i.label || 'Fonte')}</b><small>${i.muted ? 'Mudo' : 'Com áudio'}${i.solo ? ' · SOLO' : ''}</small></span>
        <span style="display:flex;gap:6px;align-items:center">
          <button class="btn sm ${i.solo ? 'on' : 'ghost'}" data-act="asolo" data-id="${esc(i.id)}" data-on="${i.solo ? 0 : 1}" style="padding:4px 9px;font-size:11px" title="Solo no fone">S</button>
          <button aria-label="Mudo" data-act="mute" data-id="${esc(i.id)}" data-on="${i.muted ? 0 : 1}" style="background:none;padding:0"><i class="sw"></i></button>
        </span>
      </div>
      <div class="vol-bar" style="margin-top:6px">
        <span style="font-size:11px;color:var(--mut)">Vol</span>
        <input type="range" min="0" max="100" value="${vol}" class="vol-slider" data-act="src-slider" data-id="${esc(i.id)}">
        <span style="font-size:11px;color:var(--mut);min-width:32px;text-align:right">${vol}%</span>
      </div>
      <div class="send-row" style="display:flex;gap:4px;margin-top:6px;align-items:center">
        <span style="font-size:10px;color:var(--mut)">Buses</span>
        ${(s.buses || []).map((b) => `<button class="btn sm ${i.sends?.[b.id] ? 'on' : 'ghost'}" data-act="send" data-id="${esc(i.id)}" data-bus="${b.id}" data-on="${i.sends?.[b.id] ? 0 : 1}" style="padding:2px 7px;font-size:10px">${b.id}</button>`).join('')}
      </div>
    </div>`;
  }
  if (!withAudio.length) h += '<div class="note">Nenhuma fonte com áudio.</div>';
  if (s.buses?.length) {
    h += '<h2>Buses de saída (A–G)</h2>';
    for (const b of s.buses) {
      h += `<div class="row ${b.mute ? 'bad' : ''}" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span><b>Bus ${b.id}</b><small>${b.mute ? 'Mudo' : (b.deviceId ? 'Com saída' : 'Sem dispositivo')}</small></span>
          <button aria-label="Mudo" data-act="bus-mute" data-bus="${b.id}" data-on="${b.mute ? 0 : 1}" style="background:none;padding:0"><i class="sw"></i></button>
        </div>
        <div class="vol-bar" style="margin-top:6px">
          <span style="font-size:11px;color:var(--mut)">Vol</span>
          <input type="range" min="0" max="150" value="${Math.round((b.level ?? 1) * 100)}" class="vol-slider" data-act="bus-slider" data-bus="${b.id}">
        </div>
      </div>`;
    }
  }
  if (s.anySolo) h += '<button class="btn ghost" style="width:100%;margin-top:8px" data-act="clear-solo">Limpar solos</button>';
  const guests = items().filter((i) => i.kind === 'camera' && i.ownerId && i.ownerId !== 'host');
  if (guests.length) {
    h += '<h2>Microfone dos convidados</h2>';
    for (const i of guests) h += `<div class="row"><span><b>${esc(i.label || 'Convidado')}</b><small>${i.micOn === false ? 'Microfone fechado' : 'Microfone aberto'}</small></span><div class="mini"><button data-act="gmute" data-id="${esc(i.ownerId)}">Silenciar</button><button data-act="gask" data-id="${esc(i.ownerId)}">Pedir</button></div></div>`;
  }
  return h;
}

function conteudo() {
  const s = st;
  const dot = unreadChat > 0 ? '<i class="badge-dot in-seg"></i>' : '';
  return `<div class="seg" role="tablist" aria-label="Conteúdo">
      <button role="tab" aria-selected="${contentTab === 'gc'}" class="${contentTab === 'gc' ? 'active' : ''}" data-content="gc">GC e faixas</button>
      <button role="tab" aria-selected="${contentTab === 'msgs'}" class="${contentTab === 'msgs' ? 'active' : ''}" data-content="msgs">Mensagens ${dot}</button>
    </div>` + (contentTab === 'msgs' ? msgs() : gc());
}

function mais() {
  const s = st;
  return `
    <h2>Diretor automático</h2>
    <button class="row ${s.director?.on ? 'on' : ''}" data-act="director"><span><b>Corte inteligente</b><small>Corta para quem está falando</small></span><i class="sw"></i></button>
    <button class="row ${s.director?.duck ? 'on' : ''}" data-act="ducking"><span><b>Áudio inteligente</b><small>Música abaixa quando alguém fala</small></span><i class="sw"></i></button>

    <h2>Conexão</h2>
    <div class="row conn-row">
      <span><b>${esc(s.name || 'Estúdio CastDeck')}</b><small>${hostOnline ? 'Conectado' : 'Reconectando…'} · ${esc(location.host)}</small></span>
      <i class="dot ${hostOnline ? 'on' : 'wait'}" aria-hidden="true"></i>
    </div>
    <div class="quick-audio">
      <button class="btn sm ghost" data-act="reload">Reconectar</button>
      <button class="btn sm ghost" data-act="fullscreen">Tela cheia</button>
    </div>

    <h2>Vídeo do programa</h2>
    <button class="row ${wantVideo ? 'on' : ''}" data-act="video-toggle">
      <span><b>Prévia de vídeo</b><small>Mostra o PGM no celular (gasta rede)</small></span><i class="sw"></i>
    </button>

    <h2>Atalhos no PC</h2>
    <div class="shortcuts">
      <span><b>C</b> Corte</span><span><b>A</b> Auto</span><span><b>1–9</b> Fontes</span>
      <span><b>F</b> Tela cheia</span><span><b>M</b> Mudo geral</span>
    </div>
    <p class="note" style="text-align:left">Toque nas fontes para prévia; ative “toque corta direto” na aba Mesa para ir ao ar com um toque.</p>`;
}

function replayTab() {
  const r = st.replay || {};
  const onAir = !!r.onAir;
  const pct = r.max > 0 ? Math.min(100, (r.duration / r.max) * 100) : 0;
  return `
    <div class="rp-head ${onAir ? 'on-air' : ''}">
      <div class="rp-head-top">
        <span class="rp-badge">${onAir ? 'NO AR' : 'REPLAY'}</span>
        <b>${onAir ? (r.paused ? 'PAUSADO' : `${Math.round((r.speed || 1) * 100)}% · ${fmtTime(r.time || 0)}`) : 'Buffer de replay'}</b>
        <small>${r.active ? `${Math.round(r.duration || 0)}s / ${r.max || 45}s em RAM` : 'Buffer parado'}</small>
      </div>
      <div class="rp-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    </div>

    <h2>Instant replay</h2>
    <div class="rp-triggers">
      ${[5, 10, 15, 30].map((s) => `<button class="rp-trig" data-act="replay-trigger" data-sec="${s}"><b>${s}s</b><small>ir ao ar</small></button>`).join('')}
    </div>
    <div class="rp-controls">
      ${onAir ? `<button class="btn ${r.paused ? '' : 'ghost'}" data-act="replay-pause">${r.paused ? '▶ Tocar' : '⏸ Pausar'}</button>` : ''}
      <button class="btn danger" data-act="replay-stop">Voltar ao vivo</button>
    </div>

    <h2>Buffer</h2>
    <button class="row ${r.active ? 'on' : ''}" data-act="replay-buffer">
      <span><b>Buffer circular</b><small>${r.active ? `${Math.round(r.duration || 0)}s gravados` : 'Parado — inicie para poder puxar o lance'}</small></span><i class="sw"></i>
    </button>
    <h2>Comportamento do gatilho</h2>
    <button class="row ${r.autoTake !== false ? 'on' : ''}" data-act="replay-auto-take" data-on="${r.autoTake !== false ? 0 : 1}">
      <span><b>Ir ao ar direto (AUTO TAKE)</b><small>${r.autoTake !== false ? 'O gatilho coloca o replay no PGM na hora' : 'O gatilho só prepara no Preview do console'}</small></span><i class="sw"></i>
    </button>

    <h2>Velocidade</h2>
    <div class="rp-speed">
      ${[0.25, 0.5, 0.75, 1].map((v) => `<button class="btn sm ${Math.abs((r.speed || 1) - v) < 0.01 ? 'on' : 'ghost'}" data-act="replay-speed" data-speed="${v}">${Math.round(v * 100)}%</button>`).join('')}
    </div>
    <p class="note" style="text-align:left">Os botões de tempo puxam o buffer e colocam o replay <b>direto no PGM</b> (com áudio no programa).</p>`;
}

const RENDER = { mesa, audio, replay: replayTab, conteudo, mais };

// ---------- mini player estilo app de música ----------
function updateMiniPlayer() {
  const mp = $('#mini-player');
  if (!mp || !st) return;
  const medias = st.medias || [];
  const cur = medias.find((m) => m.id === st.activeMedia) || medias.find((m) => !m.paused) || medias[0];
  if (!cur) {
    mp.hidden = true;
    document.body.classList.add('no-media');
    return;
  }
  mp.hidden = false;
  document.body.classList.remove('no-media');

  mp.classList.toggle('playing', !cur.paused);
  $('#mp-ico').textContent = cur.isAudio ? '🎵' : '🎬';
  $('#mp-title').textContent = cur.label || (cur.isAudio ? 'Música / Áudio' : 'Vídeo');
  
  const curT = cur.currentTime || 0;
  const dur = cur.duration || 0;
  if (dur > 0) {
    const pct = Math.max(0, Math.min(100, (curT / dur) * 100));
    $('#mp-fill').style.width = pct + '%';
    $('#mp-time').textContent = `${fmtTime(curT)} / ${fmtTime(dur)}`;
  } else {
    $('#mp-fill').style.width = cur.paused ? '0%' : '100%';
    $('#mp-time').textContent = fmtTime(curT);
  }

  const pBtn = $('#mp-play');
  pBtn.textContent = cur.paused ? '▶' : '⏸';
  pBtn.title = cur.paused ? 'Tocar' : 'Pausar';
  pBtn.dataset.id = cur.id;
  pBtn.dataset.paused = cur.paused ? '1' : '0';

  const sBtn = $('#mp-stage');
  sBtn.classList.toggle('on', !!cur.onStage);
  sBtn.textContent = cur.onStage ? 'No palco' : 'Palco';
  sBtn.dataset.id = cur.id;
  sBtn.dataset.on = cur.onStage ? '0' : '1';
}

let lastHtml = {};
function render() {
  if (!st) return;
  // Mantém a aba do URL (?tab=replay) e a navegação coerentes mesmo antes do primeiro clique.
  $$('nav button').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-current', on ? 'page' : 'false');
  });
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + tab));
  for (const t of Object.keys(RENDER)) {
    if (t !== tab) continue; // só a aba visível
    const box = $('#tab-' + t);
    // não recria o campo de texto enquanto a pessoa digita
    if (t === 'conteudo' && document.activeElement?.closest('#tab-conteudo input, #tab-conteudo textarea')) continue;
    const html = RENDER[t]();
    if (html !== lastHtml[t]) {
      lastHtml[t] = html;
      box.innerHTML = html;
      if (t === 'conteudo' && contentTab === 'msgs') {
        const cb = $('#chat-box');
        if (cb) cb.scrollTop = cb.scrollHeight;
      }
    }
  }
  $('#b-live').hidden = !st.live;
  $('#b-rec').hidden = !st.rec;
  const bv = $('#btn-video');
  bv.hidden = !st.allowVideo;
  bv.classList.toggle('on', wantVideo && st.allowVideo);
  $('#btn-audio')?.classList.toggle('on', wantAudio);
  setDot();
  updateMiniPlayer();
}

// ---------- tela cheia ----------
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}
document.addEventListener('fullscreenchange', () => {
  const isFs = !!document.fullscreenElement;
  $('#btn-fs')?.classList.toggle('on', isFs);
});

// ---------- ações de toque e cliques ----------
// Atalhos de teclado (PC): mesma lógica dos botões, sem interferir em campos de texto.
document.addEventListener('keydown', (e) => {
  if (!st || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const k = e.key.toLowerCase();
  if (k === 'c' || k === 'a' || k === 'f' || k === 'm' || /^[1-9]$/.test(k)) e.preventDefault();
  else return;
  if (k === 'c') return cmd({ op: 'take', kind: 'cut' });
  if (k === 'a') return cmd({ op: 'take', kind: 'mix' });
  if (k === 'f') return toggleFullscreen();
  if (k === 'm') {
    const anyLive = items().some((i) => i.hasAudio && !i.muted);
    return cmd({ op: 'mute-all', on: anyLive });
  }
  const src = items()[Number(k) - 1];
  if (!src) return;
  if (!st.switcher) return toast('Ligue a mesa de corte');
  return tapCut ? cmd({ op: 'cut-to', id: src.id }) : cmd({ op: 'pvw', id: src.id });
});

document.addEventListener('click', (e) => {
  // Navegação entre abas
  const nb = e.target.closest('nav button');
  if (nb) {
    tab = nb.dataset.tab;
    lastHtml = {};
    if (tab === 'conteudo' && unreadChat > 0) contentTab = 'msgs';
    if (tab === 'conteudo' && contentTab === 'msgs') {
      unreadChat = 0;
      $('#chat-dot').hidden = true;
    }
    $$('nav button').forEach((b) => {
      const on = b === nb;
      b.classList.toggle('active', on);
      b.setAttribute('aria-current', on ? 'page' : 'false');
    });
    $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + tab));
    $('main')?.scrollTo({ top: 0, behavior: 'smooth' });
    render();
    return;
  }

  // Sub-abas de Conteúdo (GC / Mensagens)
  const cbtn = e.target.closest('[data-content]');
  if (cbtn && st) {
    if (cbtn.dataset.content !== contentTab) {
      contentTab = cbtn.dataset.content;
      lastHtml = {};
      if (contentTab === 'msgs') {
        unreadChat = 0;
        $('#chat-dot').hidden = true;
      }
      render();
    }
    return;
  }

  // Alternar tela cheia
  if (e.target.closest('#btn-fs')) {
    toggleFullscreen();
    return;
  }

  // Monitorar áudio do PGM (fones)
  if (e.target.closest('#btn-audio') || e.target.closest('[data-act=toggle-audio-mon]')) {
    toggleAudio();
    return;
  }

  // Alternar vídeo de prévia PGM
  if (e.target.closest('#btn-video')) {
    wantVideo = !wantVideo;
    localStorage.setItem('cd.remote.watch', wantVideo ? '1' : '0');
    sig.send({ type: 'remote-view', on: wantVideo });
    lastHtml = {};
    render();
    return;
  }

  // Controles do Mini-Player de Música fixo
  if (e.target.closest('#mp-play')) {
    const cur = st?.medias?.find((m) => m.id === st.activeMedia) || st?.medias?.[0];
    if (!cur) return;
    if (cur.paused) {
      cmd({ op: 'media-play', id: cur.id });
    } else {
      cmd({ op: 'media-pause', id: cur.id });
    }
    return;
  }
  if (e.target.closest('#mp-prev')) {
    cmd({ op: 'media-step', dir: -1 });
    return;
  }
  if (e.target.closest('#mp-next')) {
    cmd({ op: 'media-step', dir: 1 });
    return;
  }
  if (e.target.closest('#mp-stage')) {
    const cur = st?.medias?.find((m) => m.id === st.activeMedia) || st?.medias?.[0];
    if (!cur) return;
    const onStage = st?.stage ? st.stage.includes(cur.id) : !!cur.onStage;
    cmd({ op: 'stage', id: cur.id, on: !onStage });
    return;
  }

  // Cliques gerais com data-act
  const b = e.target.closest('[data-act]');
  if (!b || !st) return;
  const id = b.dataset.id;
  switch (b.dataset.act) {
    case 'sw-on': return cmd({ op: 'switcher', on: true });
    case 'src':
      if (!st.switcher) return toast('Ligue a mesa de corte');
      return tapCut ? cmd({ op: 'cut-to', id }) : cmd({ op: 'pvw', id });
    case 'cut': return cmd({ op: 'take', kind: 'cut' });
    case 'auto': return cmd({ op: 'take', kind: 'mix' });
    case 'ftb': return cmd({ op: 'ftb', on: !st.ftb });
    case 'layout': return cmd({ op: 'layout', layout: id });
    case 'scene': return cmd({ op: 'scene', index: Number(b.dataset.i) });
    case 'stage': return cmd({ op: 'stage', id, on: b.dataset.on === '1' });
    case 'solo': return cmd({ op: 'solo', id: st.solo === id ? null : id });
    case 'unsolo': return cmd({ op: 'solo', id: null });
    case 'banner': return cmd({ op: 'banner', id });
    case 'msg': return cmd({ op: 'message', id });
    case 'hide-banner': return cmd({ op: 'hide-banner' });
    case 'quick': {
      const title = $('#q-title')?.value.trim();
      if (!title) return toast('Digite o título');
      quick = { title, subtitle: $('#q-sub')?.value.trim() || '' };
      cmd({ op: 'quick-banner', title: quick.title, subtitle: quick.subtitle });
      return toast('Faixa enviada');
    }
    case 'send-screen-msg': {
      const title = $('#msg-screen-title')?.value.trim();
      const subtitle = $('#msg-screen-sub')?.value.trim();
      if (!title && !subtitle) return toast('Digite um texto');
      quick = { title: title || 'Aviso', subtitle: subtitle || '' };
      cmd({ op: 'quick-banner', title: quick.title, subtitle: quick.subtitle });
      return toast('Mensagem colocada na tela');
    }
    case 'hide-screen-msg': {
      cmd({ op: 'hide-banner' });
      return toast('Banner ocultado');
    }
    case 'msg-to-screen': {
      const author = b.dataset.author || '';
      const text = b.dataset.text || '';
      cmd({ op: 'quick-banner', title: author, subtitle: text });
      return toast('Mensagem enviada para a tela');
    }
    case 'director': return cmd({ op: 'director', on: !st.director?.on });
    case 'ducking': return cmd({ op: 'ducking', on: !st.director?.duck });
    case 'reload': return location.reload();
    case 'fullscreen': return toggleFullscreen();
    case 'video-toggle':
      wantVideo = !wantVideo;
      localStorage.setItem('cd.remote.watch', wantVideo ? '1' : '0');
      sig.send({ type: 'remote-view', on: wantVideo });
      lastHtml = {};
      render();
      return;
    case 'mute-all':
      return cmd({ op: 'mute-all', on: b.dataset.on === '1' });
    case 'replay-trigger': {
      toast(st.replay?.autoTake === false ? 'Preparando o lance no Preview…' : 'Puxando o lance e indo ao ar…');
      return cmd({ op: 'replay-trigger', seconds: Number(b.dataset.sec) || 10 });
    }
    case 'replay-stop':
      return cmd({ op: 'replay-stop' });
    case 'replay-pause':
      return cmd({ op: st.replay?.paused ? 'replay-play' : 'replay-pause' });
    case 'replay-buffer':
      return cmd({ op: 'replay-buffer' });
    case 'replay-auto-take':
      return cmd({ op: 'replay-auto-take', on: b.dataset.on === '1' });
    case 'replay-speed':
      return cmd({ op: 'replay-speed', speed: Number(b.dataset.speed) || 0.5 });
    case 'mute': return cmd({ op: 'mute', id, on: b.dataset.on === '1' });
    case 'asolo': return cmd({ op: 'audio-solo', id, on: b.dataset.on === '1' });
    case 'send': return cmd({ op: 'send', id, bus: b.dataset.bus, on: b.dataset.on === '1' });
    case 'bus-mute': return cmd({ op: 'bus-mute', bus: b.dataset.bus, on: b.dataset.on === '1' });
    case 'clear-solo': return cmd({ op: 'clear-solo' });
    case 'master-mute': return cmd({ op: 'master-mute', on: !st?.masterMuted });
    case 'dim': return cmd({ op: 'dim', on: !st?.dim });
    case 'gmute': return cmd({ op: 'mic', to: id, action: 'mute' });
    case 'gask': return cmd({ op: 'mic', to: id, action: 'unmute-request' });
  }
});

// Controle de volume em tempo real (sliders de master e fontes)
document.addEventListener('input', (e) => {
  if (e.target.dataset.act === 'master-slider') {
    const vol = Number(e.target.value) / 100;
    cmd({ op: 'master-vol', vol });
  } else if (e.target.dataset.act === 'src-slider') {
    const id = e.target.dataset.id;
    const vol = Number(e.target.value) / 100;
    cmd({ op: 'src-vol', id, vol });
  } else if (e.target.dataset.act === 'bus-slider') {
    cmd({ op: 'bus-level', bus: e.target.dataset.bus, level: Number(e.target.value) / 100 });
  }
});

// Barra de progresso do mini-player para seek (arrastar ou clicar)
$('#mp-bar')?.addEventListener('click', (e) => {
  if (!st) return;
  const medias = st.medias || [];
  const cur = medias.find((m) => m.id === st.activeMedia) || medias.find((m) => !m.paused) || medias[0];
  if (!cur || !cur.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const time = ratio * cur.duration;
  cmd({ op: 'media-seek', id: cur.id, time });
});

// Envio de chat
document.addEventListener('submit', (e) => {
  if (e.target.id === 'chat-form') {
    e.preventDefault();
    const input = $('#chat-input');
    const text = input?.value.trim();
    if (!text) return;
    sig.send({ type: 'chat', text });
    // adiciona otimisticamente
    localChat.push({ id: 'loc-' + Date.now(), name: 'Controle', role: 'remote', text, ts: Date.now() });
    input.value = '';
    lastHtml['conteudo'] = '';
    render();
  }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'tapcut') {
    tapCut = e.target.checked;
    localStorage.setItem('cd.remote.tapcut', tapCut ? '1' : '0');
  }
});

// ---------- conexão ----------
sig.on('welcome', (m) => {
  hostOnline = true;
  hostId = m.hostId;
  if (wantVideo) sig.send({ type: 'remote-view', on: true });
  if (wantAudio) startAudioPeer();
  setDot();
});
sig.on('signal', (m) => {
  if (audioPeer && m.from === hostId) {
    audioPeer.handle(m.data);
  }
});
sig.on('remote-state', (e) => {
  st = e.state;
  clearTimeout(connectTimer);
  connectTimer = 0;
  if (st?.chat) {
    localChat = [...st.chat];
  }
  if (!st?.allowVideo) lastFrame = '';
  render();
});
sig.on('chat', (m) => {
  // mensagem nova de chat
  localChat.push({
    id: m.id || 'msg-' + Date.now(),
    name: m.name || (m.role === 'host' ? 'Host' : 'Convidado'),
    role: m.role || 'guest',
    text: m.text || '',
    ts: m.ts || Date.now(),
  });
  if (tab !== 'conteudo' || contentTab !== 'msgs') {
    unreadChat++;
    $('#chat-dot').hidden = false;
    toast(`Mensagem de ${m.name || 'Chat'}`);
  } else {
    lastHtml['conteudo'] = '';
    render();
  }
});
sig.on('remote-frame', (e) => {
  lastFrame = e.data;
  const img = $('#frame');
  if (img) img.src = lastFrame;
});
sig.on('host-offline', () => {
  hostOnline = false;
  closeAudioPeer();
  setDot();
});
sig.on('host-online', () => {
  hostOnline = true;
  if (wantVideo) sig.send({ type: 'remote-view', on: true });
  if (wantAudio) startAudioPeer();
  setDot();
});
sig.on('error', (e) => fatal(e.message || 'Erro de conexão'));
sig.on('close', () => {
  if (st) $('#sub').textContent = 'Reconectando…';
  $('#dot').className = 'dot wait';
});

if (!room || !key) fatal('Link inválido. Leia o QR do painel Diretor do estúdio.');
else {
  sig.connect({ type: 'join', room, role: 'remote', key, name: 'Controle' });
  connectTimer = setTimeout(() => {
    if (st) return;
    fatal('Não foi possível conectar ao estúdio. Confirme que o celular está na mesma rede Wi-Fi, desligue os dados móveis e permita o CastDeck no firewall do Windows. Se estiver fora de casa, peça ao host para usar o link pela Internet.');
  }, 12000);
}

// mantém a tela do celular acesa enquanto opera
async function keepAwake() {
  try {
    await navigator.wakeLock?.request('screen');
  } catch {}
}
keepAwake();
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && keepAwake());

