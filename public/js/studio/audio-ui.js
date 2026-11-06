// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Mesa de áudio do estúdio (aba Áudio): estilo console de broadcast simples.
import { openEchoHelp } from '../audio-help.js';
//  - Master do programa com medidores L/R em dBFS (escala -60…0, referência -18 dBFS = 0 VU),
//    retenção de pico, LED de clip e indicador do limitador.
//  - Canais com fader em % (e dB), mudo e redução de ruído (RNNoise) liga/desliga + intensidade.
// Os medidores atualizam só com a aba aberta e mexem apenas em transform (barato para o navegador).

const MIN_DB = -60;
const BUS_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
// escala com mais resolução perto do topo, como nos medidores de mesa: -60..-20 ocupa 40%, -20..0 ocupa 60%
export const dbPos = (db) => (db <= MIN_DB ? 0 : db >= 0 ? 1 : db < -20 ? ((db - MIN_DB) / 40) * 0.4 : 0.4 + ((db + 20) / 20) * 0.6);
const TICKS = [-60, -40, -30, -20, -12, -6, -3, 0];
const REF_DB = -18; // nível de alinhamento (EBU R68): 0 VU
const fmtDb = (v) => (v <= 0.0001 ? '−∞' : `${v >= 1 ? '+' : ''}${(20 * Math.log10(v)).toFixed(1).replace('-', '−')}`);
const fmtLvl = (db) => (db <= -89 ? '−∞' : db.toFixed(0).replace('-', '−'));

export function createAudioPanel({
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
  toggleHostMic,
  onSpeakerMode,
  captureScreenAudioLoopback,
  attachDeviceAudioToScreen,
  detachScreenAudio,
  startScreen,
  container = '#panel-audio',
  isPopout = false,
}) {
  const meters = new Map(); // id -> estado de balística (pico, retenção, clip)
  let lastText = 0;
  // Accordion: estado por usuário; padrão tudo aberto na primeira vez.
  const SEC_KEY = 'castdeck.audiosec.v1';
  const DEFAULT_SEC = { master: true, channels: true, buses: true, mon: true };
  let secOpen = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem(SEC_KEY) || 'null');
      return raw && typeof raw === 'object' ? { ...DEFAULT_SEC, ...raw } : { ...DEFAULT_SEC };
    } catch { return { ...DEFAULT_SEC }; }
  })();
  const isSecOpen = (id) => secOpen[id] !== false;
  function setSecOpen(id, on) {
    secOpen[id] = !!on;
    try { localStorage.setItem(SEC_KEY, JSON.stringify(secOpen)); } catch {}
  }
  const secHeadHtml = (id, label, sum) => `<button class="ax-sec-head" data-acc="${id}" aria-expanded="${isSecOpen(id)}" title="${isSecOpen(id) ? 'Recolher' : 'Expandir'} ${label}">
    <span class="ax-arrow">${isSecOpen(id) ? '▾' : '▸'}</span><b>${label}</b><span class="ax-sec-sum" data-sum="${id}">${sum}</span>
  </button>`;
  const activeBusCount = () => BUS_IDS.filter((b) => [...mixer.sources.values()].some((s) => s.sends?.get(b)?.gain.value > 0.01)).length;
  const masterSum = () => `${fmtDb(mixer.master ?? 1)} dB${mixer.masterMuted ? ' · MUTE' : ''}${mixer.dim ? ' · DIM' : ''}`;
  const monSum = () => `${Math.round((mixer.monitorVol ?? 1) * 100)}%${mixer.listenProgram ? ' · PGM' : ''}${mixer.anySolo ? ' · SOLO' : ''}`;
  const getRoot = () => (typeof container === 'string' ? $(container) : container);
  const VIEW_KEY = 'castdeck.audio.view';
  let audioView = (() => {
    try {
      return localStorage.getItem(VIEW_KEY) === 'vertical' ? 'vertical' : 'horizontal';
    } catch {
      return 'horizontal';
    }
  })();
  function applyAudioView(view, { save = true } = {}) {
    audioView = view === 'vertical' ? 'vertical' : 'horizontal';
    const root = getRoot();
    const ax = root?.querySelector('.ax');
    ax?.classList.toggle('ax-vertical', audioView === 'vertical');
    const btn = root?.querySelector('#ax-btn-view');
    if (btn) {
      const vertical = audioView === 'vertical';
      btn.textContent = vertical ? 'Mesa horizontal' : 'Mesa vertical';
      btn.title = vertical ? 'Voltar aos controles horizontais' : 'Colocar os controles na vertical, como uma mesa';
      btn.setAttribute('aria-pressed', String(vertical));
    }
    root?.querySelectorAll('.fader-rail input[type=range]').forEach((r) => {
      r.setAttribute('aria-orientation', audioView === 'vertical' ? 'vertical' : 'horizontal');
      r.setAttribute('orient', audioView === 'vertical' ? 'vertical' : 'horizontal');
    });
    if (save) {
      try { localStorage.setItem(VIEW_KEY, audioView); } catch {}
    }
  }

  const scaleHtml = () =>
    `<div class="vu-scale">${TICKS.map((t) => `<span style="left:${dbPos(t) * 100}%">${t === 0 ? '0' : -t}</span>`).join('')}<span class="ref" style="left:${dbPos(REF_DB) * 100}%" title="Nível de referência: −18 dBFS (0 VU)">▼</span></div>`;
  const vuHtml = (id, label = '') =>
    `<div class="vu" data-vu="${esc(id)}">${label ? `<b class="vu-ch">${label}</b>` : ''}<div class="vu-bar"><i class="vu-mask"></i><i class="vu-pk"></i></div><span class="vu-clip" title="Clip: o sinal chegou a 0 dBFS">CLIP</span><span class="vu-db">−∞</span></div>`;

  function rowsFor() {
    const rows = [{ id: 'host:mic', name: `${S.local.name}`, tag: 'MIC' }];
    if (mixer.sources.has('music:ambient')) rows.push({ id: 'music:ambient', name: 'Trilha', tag: 'TRILHA', ambient: true });
    for (const s of S.sources.values()) {
      if (s.ownerId !== 'host' && s.kind === 'camera') rows.push({ id: s.id + ':audio', name: s.label, tag: S.guests.get(s.ownerId)?.cohost ? 'CO-HOST' : 'CONV' });
      if (s.extraCam) rows.push({ id: s.id + ':audio', name: s.label, tag: 'CAM' });
      if (s.kind === 'screen') {
        const hasAudio = mixer.sources.has(s.id + ':audio');
        const tag = s.isWindow ? 'JANELA' : s.surface === 'browser' ? 'ABA' : 'TELA';
        rows.push({
          id: s.id + ':audio',
          name: s.label,
          tag,
          isWindow: !!s.isWindow,
          hasAudio,
          hasAuxAudio: !!S.local?.screenAudioAux,
        });
      }
      if (s.kind === 'media') rows.push({ id: s.id, name: s.label, tag: 'MÍDIA' });
    }
    // som das páginas web do DSK (o canal só existe depois que a página tocou algo)
    for (const id of ['dsk:1', 'dsk:2']) rows.push({ id, name: `DSK ${id.slice(4)} (página)`, tag: 'DSK' });
    return rows.filter((r) => mixer.sources.has(r.id) || r.hasAudio === false);
  }

  function faderHtml(key, v, max = 200) {
    const pct = Math.round(v * 100);
    return `<div class="fader" data-fader="${esc(key)}">
        <span class="fader-rail"><input type="range" min="0" max="${max}" step="1" value="${pct}" title="Duplo clique: volta para 100%" aria-orientation="${audioView === 'vertical' ? 'vertical' : 'horizontal'}" orient="${audioView === 'vertical' ? 'vertical' : 'horizontal'}"></span>
        <label class="pct"><input type="number" min="0" max="${max}" step="1" value="${pct}" aria-label="Volume em porcentagem">%</label>
        <span class="fdb">${fmtDb(v)} dB</span>
      </div>`;
  }

  function openAudioPopout() {
    const w = Math.min(760, Math.max(520, (window.screen.availWidth || 1280) - 80));
    const h = Math.min(860, Math.max(560, (window.screen.availHeight || 900) - 90)); // a altura inclui a moldura: não passa da tela
    const left = Math.max(10, window.screenLeft + window.outerWidth - w - 20);
    const top = Math.max(10, window.screenTop + 40);
    const pop = window.open(
      '/audio-popout.html',
      'CastDeckAudioPopout',
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
    );
    window._audioPopout = pop;
    if (pop) pop.focus();
  }

  function render() {
    const p = getRoot();
    if (!p) return;
    const rows = rowsFor();
    const busRow = (b) => {
      const bus = mixer.getBus(b) || {};
      const pct = Math.round((bus.level ?? 1) * 100);
      return `<div class="ax-bus ${bus.mute ? 'muted' : ''}" data-bus-row="${b}">
        <span class="ax-bus-id">${b}</span>
        <div class="ax-bus-meter"><i data-bus-vu="${b}"></i></div>
        <button class="ch-mute ${bus.mute ? 'on' : ''}" data-bus-mute="${b}" title="Mute do bus ${b}">M</button>
        <span class="fader-rail bus-rail"><input type="range" min="0" max="150" step="1" value="${pct}" data-bus-level="${b}" title="Nível do bus ${b}" aria-orientation="${audioView === 'vertical' ? 'vertical' : 'horizontal'}" orient="${audioView === 'vertical' ? 'vertical' : 'horizontal'}"></span>
        <span class="ax-bus-pct" data-bus-pct="${b}">${pct}%</span>
        <select class="input sm" data-bus-dev="${b}" title="Dispositivo de saída do bus ${b}"><option value="">Sem saída</option></select>
        <button class="ax-mini" data-bus-test="${b}" title="Tom de teste na saída do bus ${b}">TESTE</button>
      </div>`;
    };
    const isFloating = !!p.closest?.('.fw') || !!p.closest?.('.fw-popout-root') || p.classList.contains('fw-panel') || !!window.__castdeck?.floatWins?.has?.('audio');
    p.innerHTML = `
      <div class="ax ${audioView === 'vertical' ? 'ax-vertical' : ''}">
        <div class="ax-top-bar" style="display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
          <button class="ax-popout-btn" id="ax-btn-view" aria-pressed="${audioView === 'vertical'}" title="${audioView === 'vertical' ? 'Voltar aos controles horizontais' : 'Colocar os controles na vertical, como uma mesa'}">${audioView === 'vertical' ? 'Mesa horizontal' : 'Mesa vertical'}</button>
          ${
            !isPopout && !isFloating
              ? `<button class="ax-popout-btn" id="ax-btn-detach-vertical" title="Destacar o painel já em modo de mesa vertical">
                  <span>Destacar em mesa vertical</span>
                </button>
                <button class="ax-popout-btn" id="ax-btn-float" title="Destacar este painel em uma janela flutuante com botão de fixar no topo (📌)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                  <span>Destacar painel</span>
                </button>`
              : ''
          }
        </div>
        <div class="ax-acc-tools">
          <button class="ax-mini" id="ax-expand-all" title="Abrir todas as seções">Expandir tudo</button>
          <button class="ax-mini" id="ax-collapse-all" title="Recolher todas as seções">Recolher tudo</button>
        </div>
        <section class="ax-sec" data-sec="master">
          ${secHeadHtml('master', 'Master', masterSum())}
          <div class="ax-sec-body" data-body="master" ${isSecOpen('master') ? '' : 'hidden'}>
          <section class="ax-master">
          <div class="ax-head"><span class="ax-badge pgm">PGM</span><b>Programa</b><span class="ax-sub">o que vai ao ar</span>
            <button class="ax-mini ${mixer.masterMuted ? 'on danger' : ''}" id="ax-mute" title="Mute do Master (não perde o nível do fader)">MUTE</button>
            <button class="ax-mini ${mixer.dim ? 'on' : ''}" id="ax-dim" title="Dim: abaixa o Master em ~14 dB">DIM</button>
            <span class="ax-gr" title="Limitador do programa: quanto está segurando os picos (dB)">LIM<i><b id="ax-gr"></b></i></span></div>
          ${vuHtml('__L', 'L')}${vuHtml('__R', 'R')}
          ${scaleHtml()}
          <div class="ax-row"><span class="ax-lbl">Master</span>${faderHtml('__master', mixer.master ?? 1, 150)}</div>
          <div class="ax-row"><span class="ax-lbl">Saída</span><select class="input" id="ax-master-dev" title="Dispositivo físico para o Master (opcional; stream/gravação não mudam)"></select></div>
        </section>
        </div>
        </section>

        <section class="ax-sec" data-sec="channels">
          ${secHeadHtml('channels', 'Canais', `${rows.length} fonte${rows.length === 1 ? '' : 's'}`)}
          <div class="ax-sec-body" data-body="channels" ${isSecOpen('channels') ? '' : 'hidden'}>
        <div class="ax-title"><span>Canais</span><span class="ax-sub">${rows.length} fonte${rows.length === 1 ? '' : 's'}</span></div>
        <div class="ax-channels">
        ${
          rows
            .map((r) => {
              const s = mixer.sources.get(r.id);
              const isAmbient = !!r.ambient;
              const isScreen = r.id.startsWith('host:screen');
              const hasSound = isScreen ? r.hasAudio : !!s;
              const vol = s ? s.volume : (mixer.prefs.get(r.id)?.volume ?? 1);
              const muted = r.id === 'host:mic' ? !S.local.micOn : (s ? s.muted : (mixer.prefs.get(r.id)?.muted ?? false));
              const nrOn = s ? s.nrOn : false;
              const onAir = s ? mixer.isOnAir(r.id) : false;
              const solo = !!s?.solo;
              const routeLabel = s?.route
                ? (s.route.program && s.route.monitor ? 'PGM+FONE' : s.route.program ? 'PGM' : s.route.monitor ? 'FONE' : 'MUDO')
                : '';

              return `<section class="ch ${muted ? 'muted' : ''} ${!hasSound ? 'ch-no-audio ch-waiting-audio' : ''} ${nrOn ? 'nr-on' : ''} ${onAir ? 'on-air' : ''} ${solo ? 'solo-on' : ''}" data-ch="${esc(r.id)}">
              <div class="ch-top">
                <span class="ch-tag">${r.tag}</span><span class="ch-name" title="${esc(r.name)}">${esc(r.name)}</span>
                ${onAir ? '<span class="ch-air" title="Este canal está no ar (palco/take/DSK)">NO AR</span>' : ''}
                ${routeLabel ? `<span class="ch-route" title="Rota de áudio fixa (independe do palco)">${routeLabel}</span>` : ''}
                ${isAmbient ? `<button class="ch-mon ${s?.route?.monitor === false ? 'off' : 'on'}" data-mon title="Ouvir a trilha no fone do host (não muda o programa)" aria-pressed="${s?.route?.monitor !== false}">${s?.route?.monitor === false ? 'FONE OFF' : 'FONE'}</button>` : ''}
                ${hasSound ? '<span class="badge ok" style="font-size:10px;padding:2px 6px">Áudio ativo</span>' : '<span class="badge warn" style="font-size:10px;padding:2px 6px">Aguardando áudio</span>'}
                ${!isAmbient && typeof mixer.ccOf === 'function' ? `<button class="ch-cc ${mixer.ccOf(r.id) ? 'on' : ''} ${mixer.captionOn ? '' : 'idle'}" data-cc title="${mixer.captionOn ? 'Legenda: enviar este áudio para a legenda ao vivo (clique liga/desliga; duplo clique = só este canal)' : 'Legenda: escolha se este áudio vai para a legenda. Ligue a legenda na aba Legendas do painel.'}" aria-pressed="${mixer.ccOf(r.id)}">CC</button>` : ''}
                <button class="ch-solo ${solo ? 'on' : ''}" data-solo title="Solo no fone: ouve este canal sem mudar o programa (funciona até mudo)">S</button>
                <button class="ch-mute ${muted ? 'on' : ''}" data-mute title="${r.id === 'host:mic' ? 'Liga/desliga seu microfone' : 'Silenciar este canal no programa e no retorno'}">M</button>
              </div>
              ${vuHtml(r.id)}
              ${faderHtml(r.id, vol, isAmbient ? 100 : 200)}
              <div class="ch-sends" title="Enviar este canal para os buses de saída (A–G)">${BUS_IDS.map((b) => `<button class="ch-send ${s && mixer.getSend(r.id, b) ? 'on' : ''}" data-send="${b}" ${s ? '' : 'disabled'} title="Enviar para o bus ${b}">${b}</button>`).join('')}</div>
              <label class="ch-nr ${s && !isAmbient ? '' : 'disabled'}" title="${isAmbient ? 'A trilha usa o volume do canal; redução de ruído fica desligada' : s ? 'Redução de ruído RNNoise nesta fonte' : 'Aguarde esta fonte ter áudio para ativar a redução de ruído'}">
                <input type="checkbox" data-nr ${s?.nrOn ? 'checked' : ''} ${s && !isAmbient ? '' : 'disabled'}>
                <span class="sw"></span><span>Redução de ruído</span>
              </label>
              ${
                isScreen && !hasSound
                  ? `<div class="ch-audio-prompt" style="margin-top:8px;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px dashed var(--line-strong);border-radius:6px;font-size:11.5px">
                      <div style="display:flex;align-items:center;gap:6px;color:var(--text-1);font-weight:600;margin-bottom:4px">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        <span>${r.isWindow ? 'Janelas no Windows não enviam som sozinhas' : 'Nenhum som detectado nesta captura'}</span>
                      </div>
                      <div style="color:var(--text-2);line-height:1.35;margin-bottom:8px">
                        Para o áudio tocar no programa e modular no medidor VU acima:
                      </div>
                      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
                        <button class="btn sm" id="btn-screen-sysaudio" style="gap:5px;font-size:11.5px;padding:4px 9px;font-weight:600" title="Captura o áudio do computador para esta janela">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                          <span>Capturar som do PC</span>
                        </button>
                        <button class="btn sm ghost" id="btn-screen-switch-full" title="Compartilhar Tela inteira com a caixinha Compartilhar áudio do sistema" style="font-size:11px;padding:4px 8px">
                          🔁 Trocar p/ Tela inteira
                        </button>
                      </div>
                      <div style="display:flex;align-items:center;gap:6px;margin-top:7px">
                        <span style="color:var(--text-3);font-size:11px;white-space:nowrap">Ou entrada:</span>
                        <select class="input sm" id="sel-screen-audio-dev" style="flex:1;font-size:11px;padding:2px 6px;height:24px">
                          <option value="">Vincular entrada (Mixagem estéreo, cabo virtual...)</option>
                        </select>
                      </div>
                    </div>`
                  : isScreen && r.hasAuxAudio
                  ? `<div style="margin-top:6px;display:flex;justify-content:flex-end">
                      <button class="btn sm ghost" id="btn-screen-detach-audio" style="font-size:10.5px;color:var(--text-2);padding:2px 6px">
                        Desvincular áudio auxiliar
                      </button>
                    </div>`
                  : ''
              }
              <div class="ch-nrc" ${s?.nrOn ? '' : 'hidden'}><span class="ax-lbl">Intensidade</span>
                <input type="range" min="0" max="100" step="1" value="${Math.round((s?.nrAmount ?? 0.8) * 100)}" data-nramt>
                <span class="nrv">${Math.round((s?.nrAmount ?? 0.8) * 100)}%</span></div>
            </section>`;
            })
            .join('') || '<div class="hint">Nenhuma fonte de áudio.</div>'
        }
        </div>
        <div class="vu-legend"><i class="g"></i>até −18 dBFS (nível ideal de fala) <i class="y"></i>−18 a −6 <i class="r"></i>acima de −6 (perto de distorcer)</div>
        </div>
        </section>

        <section class="ax-sec" data-sec="buses">
          ${secHeadHtml('buses', 'Buses A–G', `${activeBusCount()} ativo${activeBusCount() === 1 ? '' : 's'}`)}
          <div class="ax-sec-body" data-body="buses" ${isSecOpen('buses') ? '' : 'hidden'}>
          <section class="ax-buses">
            <div class="ax-head"><span class="ax-badge">BUS</span><b>Saídas auxiliares</b><span class="ax-sub">cada bus vira um par estéreo no dispositivo escolhido</span></div>
            ${BUS_IDS.map(busRow).join('')}
          </section>
          </div>
        </section>

        <section class="ax-sec" data-sec="mon">
          ${secHeadHtml('mon', 'Retorno / Fone', monSum())}
          <div class="ax-sec-body" data-body="mon" ${isSecOpen('mon') ? '' : 'hidden'}>
          <section class="ax-mon">
            <div class="ax-head"><span class="ax-badge">MON</span><b>Retorno</b><span class="ax-sub">o que você ouve</span></div>
            <div class="ax-row"><span class="ax-lbl">Volume</span>${faderHtml('__mon', mixer.monitorVol ?? 1, 150)}</div>
            <label class="check" style="justify-content:space-between;margin:6px 0"><span>Ouvir a saída do programa (o que vai ao ar)</span><span class="switch"><input type="checkbox" id="mon-prog" ${mixer.listenProgram ? 'checked' : ''}><span></span></span></label>
            <label class="check" style="justify-content:space-between;margin:6px 0"><span>Estou usando caixa de som</span><span class="switch"><input type="checkbox" id="mon-speaker" ${loadPrefs().speakerMode ? 'checked' : ''}><span></span></span></label>
            <p class="hint" id="mon-echo-hint" style="margin:2px 0 8px"></p>
            <button class="btn sm ghost" id="mon-echo-help" type="button" style="margin:0 0 8px">? Como evitar eco</button>
            <div class="row" style="gap:8px;align-items:flex-end">
              <label class="field" style="flex:1;margin:0"><span>Saída de áudio</span><select class="input" id="spk"></select></label>
              <button class="btn sm" id="mon-beep" title="Tocar um tom curto na saída escolhida">${icons.play} Testar saída</button>
            </div>
            <p class="hint">Use fones para evitar microfonia. Seu microfone nunca volta para você; cada convidado recebe um mix sem a própria voz (mix-minus).</p>
          </section>
          </div>
        </section>
      </div>`;
    bind(p);
  }

  function setFaderUi(box, v) {
    const pct = Math.round(v * 100);
    const [range, num] = box.querySelectorAll('input');
    if (document.activeElement !== range) range.value = pct;
    if (document.activeElement !== num) num.value = pct;
    box.querySelector('.fdb').textContent = `${fmtDb(v)} dB`;
  }

  function applyFader(key, v) {
    if (key === '__master') {
      mixer.setMaster(v);
      savePrefs({ mixer: { ...(loadPrefs().mixer || {}), master: v } });
    } else if (key === '__mon') mixer.setMonitorVolume(v);
    else mixer.setVolume(key, v);
  }

  function applySecUi(p, id) {
    const head = $(`[data-acc="${id}"]`, p);
    const body = $(`[data-body="${id}"]`, p);
    if (head) {
      head.setAttribute('aria-expanded', String(isSecOpen(id)));
      head.title = `${isSecOpen(id) ? 'Recolher' : 'Expandir'} ${head.querySelector('b')?.textContent || ''}`;
      const arrow = head.querySelector('.ax-arrow');
      if (arrow) arrow.textContent = isSecOpen(id) ? '▾' : '▸';
    }
    if (body) body.hidden = !isSecOpen(id);
  }

  function bind(p) {
    for (const head of $$('[data-acc]', p)) {
      head.onclick = () => {
        const id = head.dataset.acc;
        setSecOpen(id, !isSecOpen(id));
        applySecUi(p, id);
      };
    }
    const expandAll = $('#ax-expand-all', p);
    if (expandAll) expandAll.onclick = () => { for (const id of Object.keys(DEFAULT_SEC)) { setSecOpen(id, true); applySecUi(p, id); } };
    const collapseAll = $('#ax-collapse-all', p);
    if (collapseAll) collapseAll.onclick = () => { for (const id of Object.keys(DEFAULT_SEC)) { setSecOpen(id, false); applySecUi(p, id); } };
    const btnMute = $('#ax-mute', p);
    if (btnMute) {
      btnMute.onclick = () => {
        mixer.setMasterMuted(!mixer.masterMuted);
        btnMute.classList.toggle('on', !!mixer.masterMuted);
        btnMute.classList.toggle('danger', !!mixer.masterMuted);
      };
    }
    const btnDim = $('#ax-dim', p);
    if (btnDim) {
      btnDim.onclick = () => {
        mixer.setDim(!mixer.dim);
        btnDim.classList.toggle('on', !!mixer.dim);
      };
    }
    const masterDev = $('#ax-master-dev', p);
    if (masterDev) {
      masterDev.onchange = () => mixer.setMasterDevice(masterDev.value).catch((e) => toast(e.message, 'err'));
    }
    const btnView = $('#ax-btn-view', p);
    if (btnView) btnView.onclick = () => applyAudioView(audioView === 'vertical' ? 'horizontal' : 'vertical');
    const btnDetachVertical = $('#ax-btn-detach-vertical', p);
    if (btnDetachVertical) {
      btnDetachVertical.onclick = () => {
        applyAudioView('vertical');
        const fw = window.__castdeck?.floatWins;
        if (fw?.open) {
          const ok = fw.open('audio');
          if (!ok) openAudioPopout();
        } else {
          openAudioPopout();
        }
      };
    }
    const btnFloat = $('#ax-btn-float', p);
    if (btnFloat) {
      btnFloat.onclick = () => {
        window.__castdeck?.floatWins?.toggle?.('audio') ?? window.__castdeck?.floatWins?.open?.('audio');
      };
    }
    const btnPopout = $('#ax-btn-popout', p);
    if (btnPopout) btnPopout.onclick = openAudioPopout;

    for (const box of $$('[data-fader]', p)) {
      const key = box.dataset.fader;
      const [range, num] = box.querySelectorAll('input');
      const max = +range.max;
      const set = (pct) => {
        const v = Math.max(0, Math.min(max, Math.round(+pct || 0))) / 100;
        applyFader(key, v);
        setFaderUi(box, v);
      };
      range.oninput = () => set(range.value);
      range.ondblclick = () => set(100);
      num.oninput = () => set(num.value);
      num.onkeydown = (e) => {
        if (e.key === 'Enter') num.blur();
      };
    }
    for (const ch of $$('[data-ch]', p)) {
      const id = ch.dataset.ch;
      const s = mixer.sources.get(id);
      const muteBtn = $('[data-mute]', ch);
      if (muteBtn) {
        muteBtn.onclick = () => {
          if (id === 'host:mic') toggleHostMic();
          else {
            const isMuted = s ? !s.muted : !(mixer.prefs.get(id)?.muted ?? false);
            mixer.setMuted(id, isMuted);
          }
          syncMute(ch, id);
        };
      }
      const soloBtn = $('[data-solo]', ch);
      if (soloBtn) {
        soloBtn.onclick = () => {
          if (!s) return;
          mixer.setSolo(id, !s.solo);
          soloBtn.classList.toggle('on', !!mixer.sources.get(id)?.solo);
          ch.classList.toggle('solo-on', !!mixer.sources.get(id)?.solo);
        };
      }
      const monBtn = $('[data-mon]', ch);
      if (monBtn) {
        monBtn.onclick = () => {
          if (!s) return;
          const on = s.route?.monitor === false;
          mixer.setRoute(id, { program: true, monitor: on });
        };
      }
      for (const sendBtn of $$('[data-send]', ch)) {
        sendBtn.onclick = () => {
          if (!s) return;
          const bus = sendBtn.dataset.send;
          mixer.setSend(id, bus, !mixer.getSend(id, bus));
          sendBtn.classList.toggle('on', mixer.getSend(id, bus));
        };
      }
      const nr = $('[data-nr]', ch);
      const ccBtn = $('[data-cc]', ch);
      if (ccBtn) {
        const sync = () => {
          for (const b of $$('[data-cc]', p)) {
            const on = mixer.ccOf(b.closest('[data-ch]').dataset.ch);
            b.classList.toggle('on', on);
            b.setAttribute('aria-pressed', String(on));
          }
        };
        ccBtn.onclick = () => {
          mixer.setCc(id, !mixer.ccOf(id));
          sync();
        };
        ccBtn.ondblclick = () => {
          mixer.soloCc(id);
          sync();
          toast('Legenda: só este canal vai para a legenda.');
        };
      }
      if (nr && s) {
        nr.onchange = async () => {
          ch.classList.toggle('nr-on', nr.checked);
          $('.ch-nrc', ch).hidden = !nr.checked;
          try {
            await mixer.setNoise(id, { on: nr.checked });
          } catch (e) {
            nr.checked = false;
            ch.classList.remove('nr-on');
            $('.ch-nrc', ch).hidden = true;
            toast('Não foi possível ativar a redução de ruído: ' + e.message, 'err');
          }
        };
      }
      const amt = $('[data-nramt]', ch);
      if (amt && s) {
        amt.oninput = () => {
          $('.nrv', ch).textContent = amt.value + '%';
          mixer.setNoise(id, { amount: amt.value / 100 });
        };
      }
    }

    const btnSys = $('#btn-screen-sysaudio', p);
    if (btnSys && captureScreenAudioLoopback) {
      btnSys.onclick = () => captureScreenAudioLoopback();
    }
    const btnSwitch = $('#btn-screen-switch-full', p);
    if (btnSwitch && startScreen) {
      btnSwitch.onclick = () => startScreen('screen');
    }
    const btnDetach = $('#btn-screen-detach-audio', p);
    if (btnDetach && detachScreenAudio) {
      btnDetach.onclick = () => detachScreenAudio();
    }
    const selDev = $('#sel-screen-audio-dev', p);
    if (selDev) {
      listDevices().then(({ mics }) => {
        selDev.innerHTML =
          '<option value="">Vincular entrada (Mixagem estéreo, cabo virtual...)</option>' +
          mics.map((d) => `<option value="${d.deviceId}">${esc(d.label || 'Microfone / Linha')}</option>`).join('');
      });
      if (attachDeviceAudioToScreen) {
        selDev.onchange = () => {
          if (selDev.value) attachDeviceAudioToScreen(selDev.value);
        };
      }
    }

    const monProg = $('#mon-prog', p);
    if (monProg) {
      monProg.onchange = (e) => {
        mixer.setListenProgram(e.target.checked);
        toast(e.target.checked ? 'Você está ouvindo a saída do programa (inclui seu microfone: use fones).' : 'Voltou ao retorno normal.');
      };
    }
    const monSpeaker = $('#mon-speaker', p);
    const echoHint = $('#mon-echo-hint', p);
    const paintEchoHint = () => {
      if (!echoHint) return;
      const label = $('#spk', p)?.selectedOptions?.[0]?.textContent || '';
      const headset = /headphone|headset|fone|earbud|auricular/i.test(label);
      if (monSpeaker?.checked) echoHint.innerHTML = '<b>Modo caixa de som ativo:</b> AEC forçado e “Ouvir programa” desligado. Use fone para a melhor qualidade.';
      else if (label && !/padrão do sistema|default/i.test(label) && !headset) echoHint.innerHTML = '<b>Caixa de som selecionada:</b> ative “Estou usando caixa de som” ou use fone para evitar eco.';
      else echoHint.textContent = 'Se estiver usando caixa de som, ative o modo acima. Fone continua sendo a melhor opção.';
    };
    if (monSpeaker) {
      monSpeaker.onchange = () => {
        if (monSpeaker.checked) {
          mixer.setListenProgram(false);
          const prog = $('#mon-prog', p);
          if (prog) prog.checked = false;
        }
        savePrefs({ speakerMode: monSpeaker.checked });
        paintEchoHint();
        onSpeakerMode?.(monSpeaker.checked);
      };
    }
    const monBeep = $('#mon-beep', p);
    if (monBeep) {
      monBeep.onclick = () => mixer.beep();
    }
    const echoHelp = $('#mon-echo-help', p);
    if (echoHelp) echoHelp.onclick = () => openEchoHelp();
    for (const row of $$('[data-bus-row]', p)) {
      const b = row.dataset.busRow;
      const mute = $('[data-bus-mute]', row);
      if (mute) {
        mute.onclick = () => {
          const bus = mixer.getBus(b);
          mixer.setBusMute(b, !bus?.mute);
          mute.classList.toggle('on', !!mixer.getBus(b)?.mute);
          row.classList.toggle('muted', !!mixer.getBus(b)?.mute);
        };
      }
      const lvl = $('[data-bus-level]', row);
      if (lvl) {
        lvl.oninput = () => {
          mixer.setBusLevel(b, (+lvl.value || 0) / 100);
          const pct = $('[data-bus-pct]', row);
          if (pct) pct.textContent = `${lvl.value}%`;
        };
      }
      const test = $('[data-bus-test]', row);
      if (test) test.onclick = () => mixer.testBus(b);
      const dev = $('[data-bus-dev]', row);
      if (dev) {
        dev.onchange = () => mixer.setBusDevice(b, dev.value).then((ok) => {
          if (!ok) toast(`Não foi possível abrir a saída do bus ${b}`, 'err');
        });
      }
    }
    listDevices().then(({ speakers }) => {
      const opts = '<option value="">Padrão do sistema</option>' + speakers.map((d) => `<option value="${d.deviceId}">${esc(d.label || 'Saída')}</option>`).join('');
      const sel = $('#spk', p);
      if (sel) {
        sel.innerHTML = opts;
        sel.value = loadPrefs().speakerId || '';
        sel.onchange = () => {
          mixer.setSpeaker(sel.value).catch((e) => toast(e.message, 'err'));
          savePrefs({ speakerId: sel.value });
          paintEchoHint();
        };
        paintEchoHint();
      }
      const busOpts = '<option value="">Sem saída</option>' + speakers.map((d) => `<option value="${d.deviceId}">${esc(d.label || 'Saída')}</option>`).join('');
      for (const dev of $$('[data-bus-dev]', p)) {
        const b = dev.dataset.busDev;
        dev.innerHTML = busOpts;
        dev.value = mixer.getBus(b)?.deviceId || '';
      }
      const md = $('#ax-master-dev', p);
      if (md) {
        md.innerHTML = busOpts;
        md.value = mixer.masterDeviceId || '';
      }
    });
  }

  function syncMute(ch, id) {
    const s = mixer.sources.get(id);
    const muted = id === 'host:mic' ? !S.local.micOn : (s ? s.muted : (mixer.prefs.get(id)?.muted ?? false));
    ch.classList.toggle('muted', muted);
    const btn = $('[data-mute]', ch);
    if (btn) btn.classList.toggle('on', muted);
  }

  // balística tipo PPM: sobe na hora, desce ~13 dB/s; pico retido por 1,5 s; clip aceso por 2 s
  function ballistics(id, peakDb, now) {
    let m = meters.get(id);
    if (!m) meters.set(id, (m = { disp: -90, hold: -90, holdT: 0, clipT: 0, t: now }));
    const dt = Math.min(0.2, (now - m.t) / 1000);
    m.t = now;
    m.disp = peakDb >= m.disp ? peakDb : Math.max(peakDb, m.disp - 13 * dt);
    if (peakDb >= m.hold) {
      m.hold = peakDb;
      m.holdT = now;
    } else if (now - m.holdT > 1500) m.hold = Math.max(m.disp, m.hold - 20 * dt);
    if (peakDb >= -0.3) m.clipT = now;
    return m;
  }

  function paint(el, m, now, text) {
    if (!el) return;
    const pos = dbPos(m.disp);
    const vertical = !!el.closest('.ax-vertical .ax-channels');
    el._mask ||= el.querySelector('.vu-mask');
    el._pk ||= el.querySelector('.vu-pk');
    if (el._mask) el._mask.style.transform = vertical ? `scaleY(${(1 - pos).toFixed(4)})` : `scaleX(${(1 - pos).toFixed(4)})`;
    if (el._pk) {
      el._pk.style.transform = vertical ? `translateY(${((1 - dbPos(m.hold)) * 100).toFixed(2)}%)` : `translateX(${(dbPos(m.hold) * 100).toFixed(2)}%)`;
      el._pk.style.opacity = m.hold > MIN_DB ? '1' : '0';
    }
    const clip = now - m.clipT < 2000;
    if (el._clip !== clip) {
      el._clip = clip;
      el.classList.toggle('clip', clip);
    }
    if (text) {
      el._db ||= el.querySelector('.vu-db');
      if (el._db) el._db.textContent = fmtLvl(m.hold);
    }
  }

  function tick() {
    const p = getRoot();
    if (!p || !p.firstElementChild) return;
    const now = performance.now();
    const text = now - lastText > 120; // números mudam devagar (legíveis e sem custo de layout a cada quadro)
    if (text) lastText = now;

    // Accordion: seção fechada não paga medidor nem sincronização de DOM.
    if (isSecOpen('master')) {
      const [l, r] = mixer.programDb();
      paint(p.querySelector('[data-vu="__L"]'), ballistics('__L', l.peak, now), now, text);
      paint(p.querySelector('[data-vu="__R"]'), ballistics('__R', r.peak, now), now, text);
      const gr = p.querySelector('#ax-gr');
      if (gr) gr.style.transform = `scaleX(${Math.min(1, mixer.limiterGR() / 12).toFixed(3)})`;
      const mm = p.querySelector('#ax-mute');
      if (mm) {
        mm.classList.toggle('on', !!mixer.masterMuted);
        mm.classList.toggle('danger', !!mixer.masterMuted);
      }
      const md = p.querySelector('#ax-dim');
      if (md) md.classList.toggle('on', !!mixer.dim);
      if (text) {
        const box = p.querySelector('[data-fader="__master"]');
        if (box) {
          const [r0, n] = box.querySelectorAll('input');
          if (document.activeElement !== r0 && document.activeElement !== n) setFaderUi(box, mixer.master ?? 1);
        }
      }
    }

    if (isSecOpen('buses')) {
      for (const el of p.querySelectorAll('[data-bus-vu]')) {
        const b = el.dataset.busVu;
        const pct = `${(dbPos(mixer.busDb(b).peak) * 100).toFixed(1)}%`;
        if (el.closest('.ax-vertical')) {
          el.style.width = '100%';
          el.style.height = pct;
        } else {
          el.style.height = '100%';
          el.style.width = pct;
        }
      }
    }

    if (isSecOpen('channels')) {
      for (const el of p.querySelectorAll('.ch [data-vu]')) {
        const id = el.dataset.vu;
        paint(el, ballistics(id, mixer.levelDb(id).peak, now), now, text);
      }
      if (text) {
        // Estado vindo do celular ou de outra aba: espelha no painel (mute, solo, buses e “no ar”).
        for (const ch of p.querySelectorAll('[data-ch]')) {
          const id = ch.dataset.ch;
          const s = mixer.sources.get(id);
          ch.classList.toggle('on-air', !!s && mixer.isOnAir(id));
          ch.classList.toggle('solo-on', !!s?.solo);
          const sb = $('[data-solo]', ch);
          if (sb) sb.classList.toggle('on', !!s?.solo);
          const mb = $('[data-mon]', ch);
          if (mb) {
            const on = s?.route?.monitor !== false;
            mb.classList.toggle('on', on);
            mb.classList.toggle('off', !on);
            mb.textContent = on ? 'FONE' : 'FONE OFF';
            mb.setAttribute('aria-pressed', String(on));
          }
          const routeEl = $('.ch-route', ch);
          if (routeEl && s?.route) routeEl.textContent = s.route.program ? (s.route.monitor ? 'PGM+FONE' : 'PGM') : (s.route.monitor ? 'FONE' : 'MUDO');
          const cc = $('[data-cc]', ch);
          if (cc) cc.classList.toggle('idle', !mixer.captionOn);
          for (const btn of $$('[data-send]', ch)) btn.classList.toggle('on', !!s && mixer.getSend(id, btn.dataset.send));
          if (id === 'host:mic') syncMute(ch, id);
          else {
            ch.classList.toggle('muted', !!s?.muted);
            $('[data-mute]', ch)?.classList.toggle('on', !!s?.muted);
          }
        }
      }
    }

    // Resumo no cabeçalho fechado (não perde informação com a seção recolhida).
    if (text) {
      const setSum = (id, val) => {
        const el = p.querySelector(`[data-sum="${id}"]`);
        if (el && el.textContent !== val) el.textContent = val;
      };
      setSum('master', masterSum());
      const channelCount = p.querySelectorAll('[data-ch]').length;
      setSum('channels', `${channelCount} ${channelCount === 1 ? 'fonte' : 'fontes'}`);
      setSum('buses', `${activeBusCount()} ativo${activeBusCount() === 1 ? '' : 's'}`);
      setSum('mon', monSum());
    }
  }

  return { render, tick };
}
