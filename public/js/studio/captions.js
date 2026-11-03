// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Legenda ao vivo no estúdio (aba lateral "Legendas").
//  - liga o reconhecimento (worker Rust no servidor) e manda o áudio do captionBus do mixer (16 kHz mono)
//  - duas saídas independentes: ① na tela (camada no PGM/vertical/retorno, ver compositor.drawCaptions)
//    e ② link ao vivo (/cc/<estúdio>?k=…, página só com a legenda, para o público ou para o OBS)
//  - CC por canal no painel de Áudio decide quem vai para a legenda (padrão: as pessoas)
// As escolhas ficam em S.brand.cc (salvas com o estúdio).

const DEFAULTS = {
  engine: false, // reconhecimento ligado
  show: true, // ① na tela (PGM)
  link: false, // ② link ao vivo
  lang: 'pt',
  mode: 'orig', // orig | en | both (both: português na tela e inglês também no link)
  model: 'equilibrado',
  size: 'm',
  posH: { y: 'b', x: 'c' }, // posição no programa 16:9 (em cima/meio/embaixo × esquerda/centro/direita)
  posV: { y: 'b', x: 'c' }, // posição na saída vertical 9:16
  color: '#ffffff',
  bgColor: '#000000',
  lines: 2,
  bg: 0.72,
  appear: 'live', // live | word | line — como o texto entra na tela (padrão: parcial ao vivo)
  delay: 0.6, // segundos de consolidação antes de mostrar (evita pegar texto ainda mudando)
  wordMs: 170, // ms por palavra no modo word (leitura confortável)
  live: false, // legado: antigo "mostrar parcial ao vivo"
  upper: false, // tudo em MAIÚSCULAS (comum em legenda de TV; lê melhor de longe)
  prompt: '',
  who: 'off', // off (padrão) | auto | always — mostrar o nome de quem fala
  whoWhen: 'both', // both | final | partial — em que momento rotular
};
const TEXT_COLORS = ['#ffffff', '#ffe14d', '#7ee8ff', '#9dff8a', '#ffb3c7'];
const BG_COLORS = ['#000000', '#101a3a', '#3a0d14', '#0f2e1d', '#ffffff'];
const LANGS = [
  ['pt', 'Português'],
  ['en', 'Inglês'],
  ['es', 'Espanhol'],
  ['auto', 'Detectar automaticamente'],
];
const MODES = [
  ['orig', 'Só o idioma falado'],
  ['en', 'Traduzir para inglês (no lugar do original)'],
  ['both', 'Original na tela + inglês também no link'],
];

export function createCaptions({ S, comp, getMixer, $, esc, toast, icons, api, studioId, copyText, saveStudio, qrSvg, onAudioUi }) {
  const cfg = () => {
    const saved = S.brand.cc || {};
    const c = (S.brand.cc = { ...DEFAULTS, ...saved });
    // versão anterior guardava só "pos: top|bottom" (vale para as duas saídas)
    if (c.pos) {
      const y = c.pos === 'top' ? 't' : 'b';
      c.posH = { ...c.posH, y };
      c.posV = { ...c.posV, y };
      delete c.pos;
    }
    if (c.model === 'qualidade' || c.model === 'maximo') c.model = 'preciso'; // nome antigo do nível mais preciso
    // legado: quem tinha "live" ligado passa para o modo ao vivo; quem nunca configurou fica no padrão palavra a palavra
    if (!('appear' in saved) && saved.live === true) c.appear = 'live';
    return c;
  };
  // estado compartilhado com o compositor (e com as visões derivadas: vertical, retorno e prévia)
  // items: frases finais recentes (o compositor quebra cada uma em linhas uma vez e faz a rolagem)
  const view = { show: false, text: '', items: [], partial: '', t: 0, style: {} };
  comp.cc = view;
  let ws = null;
  let wsRetry = 0;
  let node = null; // AudioWorkletNode da captura
  let sink = null;
  let status = { status: 'off', available: true, models: {} };
  let finals = []; // frases finais recentes (idioma principal)
  let linkInfo = null;
  let lastFinal = { pt: '', en: '' };
  let speaking = false;
  let pollT = null;
  let reveal = null; // { words, shown, t, delay, wordMs, id, text } revelação palavra a palavra
  const revealTimer = setInterval(tickReveal, 120);
  // revelação suave do parcial no modo "ao vivo": cada palavra aparece como legenda de TV
  let partialWords = [];
  let partialShown = 0;
  let partialWho = '';
  const partialTimer = setInterval(tickPartial, 110);

  function applyView() {
    const c = cfg();
    view.show = !!(c.engine && c.show);
    view.style = { size: c.size, posH: c.posH, posV: c.posV, color: c.color, bgColor: c.bgColor, lines: c.lines, bg: c.bg, live: c.appear === 'word' || c.appear === 'live', upper: c.upper };
  }

  // padrão do CC por tipo de canal do mixer: microfone do host, convidados e câmeras com áudio = sim;
  // mídia, tela/aba, DSK e entradas RTMP/SRT = não (o operador pode inverter pelo botão CC)
  function ccDefault(id) {
    if (id === 'host:mic') return true;
    if (id.startsWith('dsk:')) return false;
    const src = S.sources.get(id.endsWith(':audio') ? id.slice(0, -6) : id);
    if (!src) return false;
    if (src.kind === 'camera') return !src.ingest;
    return false;
  }

  // ---------- quem está falando (opcional; desligado por padrão) ----------
  let speaker = { id: '', name: '', at: 0 };
  let pendingSpk = { id: '', since: 0 };

  function sourceName(src) {
    if (!src) return '';
    if (src.id === 'host:mic') return 'Host';
    const g = src.ownerId && S.guests?.get?.(src.ownerId);
    if (g?.name) return g.name;
    const base = String(src.id || '').endsWith(':audio') ? src.id.slice(0, -6) : src.id;
    const meta = S.sources?.get?.(base);
    if (meta?.label) return meta.label;
    if (src.kind === 'media') return 'Mídia';
    if (src.kind === 'camera') return 'Câmera';
    return 'Microfone';
  }

  function tickSpeaker() {
    // sai cedo sem materializar cfg() a cada 250 ms quando o recurso está desligado (padrão)
    if ((S.brand?.cc?.who ?? 'off') === 'off' || !S.brand?.cc?.engine) return;
    const c = cfg();
    const mixer = getMixer?.();
    if (!mixer || !c.engine || c.who === 'off' || !ws || ws.readyState !== 1) return;
    const cands = [];
    for (const s of mixer.sources.values()) {
      if (!s.cc || s.muted) continue;
      const { rms } = mixer._db(s.analyser);
      if (rms > -45) cands.push({ s, rms, name: sourceName(s) });
    }
    // auto só rotula quando há mais de uma fonte com CC; always aceita uma
    if (cands.length < (c.who === 'always' ? 1 : 2)) return;
    cands.sort((a, b) => b.rms - a.rms);
    const top = cands[0];
    const second = cands[1];
    if (second && top.rms - second.rms < 3.5) return; // ~1,5× em dB: empate, não chuta
    const now = Date.now();
    if (top.s.id !== speaker.id) {
      if (pendingSpk.id !== top.s.id) {
        pendingSpk = { id: top.s.id, since: now };
        return;
      }
      if (now - pendingSpk.since < 600) return; // histerese: espera 600 ms
      speaker = { id: top.s.id, name: top.name, at: now };
    } else {
      speaker.at = now;
    }
    try {
      ws.send(JSON.stringify({ type: 'speaker', id: speaker.id, name: speaker.name, level: Math.round(top.rms) }));
    } catch {}
  }
  const speakerTimer = setInterval(tickSpeaker, 250);

  // nome para exibir o rótulo (quando a opção permite) no parcial/final
  function whoFor(m, when) {
    const c = cfg();
    if (c.who === 'off') return '';
    if (c.whoWhen !== 'both' && c.whoWhen !== when) return '';
    return String(m.speaker?.name || speaker.name || '').trim();
  }

  // ---------- conexão com o servidor ----------
  function connect() {
    if (ws && ws.readyState <= 1) return;
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/caption`);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => (wsRetry = 0);
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      onMessage(m);
    };
    ws.onclose = () => {
      ws = null;
      if (cfg().engine) setTimeout(connect, Math.min(8000, 500 * 2 ** wsRetry++));
    };
  }

  function onMessage(m) {
    const c = cfg();
    if (m.type === 'status') {
      const was = status.status;
      status = m;
      if (was !== m.status || $('#panel-captions')?.offsetParent) paintStatus();
      return;
    }
    if (m.type === 'vad') {
      speaking = m.speech;
      $('#cc-vad')?.classList.toggle('on', speaking);
      return;
    }
    if (m.type === 'clear') {
      finals = [];
      view.text = '';
      view.items = [];
      view.partial = '';
      reveal = null;
      partialWords = [];
      partialShown = 0;
      partialWho = '';
      return;
    }
    // no modo "both" o worker manda, depois de cada frase final, a mesma frase em inglês (lang 'en'): vai só ao link
    const isExtra = c.mode === 'both' && m.lang === 'en';
    if (m.type === 'partial' && !isExtra) {
      if (c.appear === 'live') feedPartial(m.text, whoFor(m, 'partial'));
      return;
    }
    if (m.type === 'final') {
      if (isExtra) {
        lastFinal.en = m.text;
        paintLast();
        return;
      }
      if (!m.text) return;
      const who = whoFor(m, 'final');
      if (c.appear === 'word' || c.appear === 'line') {
        const words = m.text.split(/\s+/).filter(Boolean);
        partialWords = [];
        partialShown = 0;
        if (!words.length) return;
        reveal = {
          words,
          shown: 0,
          t: performance.now(),
          delay: Math.max(0, Number(c.delay) || 0) * 1000,
          wordMs: c.appear === 'word' ? Math.max(60, Number(c.wordMs) || 170) : 10,
          id: m.id,
          text: m.text,
          who,
        };
        view.partial = '';
        return;
      }
      commitFinal(m.id, m.text, who);
    }
  }

  function feedPartial(text, who = '') {
    partialWho = String(who || '').trim();
    partialWords = String(text || '').split(/\s+/).filter(Boolean);
    // se o texto encolheu (correção), não volta atrás na exibição além do que já foi mostrado
    partialShown = Math.min(partialShown, partialWords.length);
    tickPartial();
  }

  function tickPartial() {
    if (partialShown < partialWords.length) {
      partialShown++;
      const body = partialWords.slice(0, partialShown).join(' ');
      view.partial = partialWho ? `${partialWho}: ${body}` : body;
      view.t = performance.now();
      paintLast();
    }
  }

  function commitFinal(id, text, who = '') {
    reveal = null;
    partialWords = [];
    partialShown = 0;
    partialWho = '';
    view.partial = '';
    const shown = who ? `${who}: ${text}` : text;
    lastFinal.pt = shown;
    finals.push(shown);
    if (finals.length > 4) finals.shift();
    view.text = finals.slice(-2).join(' ');
    view.items = [...view.items, { id, text: shown }].slice(-6);
    view.t = performance.now();
    paintLast();
  }

  function tickReveal() {
    if (!reveal) return;
    const now = performance.now();
    const dt = now - reveal.t;
    if (dt < reveal.delay) return;
    const n = Math.min(reveal.words.length, 1 + Math.floor((dt - reveal.delay) / reveal.wordMs));
    if (n !== reveal.shown) {
      reveal.shown = n;
      view.partial = reveal.words.slice(0, n).join(' ');
      view.t = now;
      paintLast();
    }
    if (n >= reveal.words.length) commitFinal(reveal.id, reveal.text, reveal.who);
  }

  // ---------- áudio ----------
  async function startAudio() {
    const mixer = getMixer();
    if (!mixer || node) return;
    const ctx = mixer.ctx;
    await ctx.audioWorklet.addModule('/js/studio/caption-worklet.js');
    node = new AudioWorkletNode(ctx, 'castdeck-caption-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
    node.port.onmessage = (e) => {
      if (ws && ws.readyState === 1 && ws.bufferedAmount < 256 * 1024) ws.send(e.data);
    };
    // o nó precisa estar ligado a um destino para o navegador processar (ganho 0: não sai som)
    sink = ctx.createGain();
    sink.gain.value = 0;
    mixer.captionBus.connect(node).connect(sink).connect(ctx.destination);
    mixer.setCaptionOn(true);
  }

  function stopAudio() {
    const mixer = getMixer();
    mixer?.setCaptionOn(false);
    try {
      mixer?.captionBus.disconnect(node);
    } catch {}
    try {
      node?.disconnect();
      sink?.disconnect();
    } catch {}
    node = null;
    sink = null;
  }

  // ---------- ligar / desligar ----------
  async function startEngine() {
    const c = cfg();
    connect();
    try {
      await startAudio();
    } catch (e) {
      toast('Não foi possível capturar o áudio para a legenda: ' + e.message, 'err');
      return false;
    }
    try {
      status = await api('/caption/start', { method: 'POST', body: { studioId, model: c.model, lang: c.lang, mode: c.mode, prompt: c.prompt } });
    } catch (e) {
      toast(e.message, 'err');
      status = { ...status, status: 'error', error: e.message };
      paintStatus();
      return false;
    }
    paintStatus();
    return true;
  }

  async function stopEngine() {
    stopAudio();
    reveal = null;
    partialWords = [];
    partialShown = 0;
    partialWho = '';
    speaker = { id: '', name: '', at: 0 };
    pendingSpk = { id: '', since: 0 };
    finals = [];
    view.text = '';
    view.items = [];
    view.partial = '';
    try {
      status = await api('/caption/stop', { method: 'POST' });
    } catch {}
    paintStatus();
  }

  async function setCfg(patch, { restart = false } = {}) {
    Object.assign(cfg(), patch);
    applyView();
    saveStudio();
    if (restart && cfg().engine) await startEngine();
    onAudioUi?.();
  }

  // ---------- painel ----------
  function statusText() {
    const c = cfg();
    if (status.available === false) return ['err', 'Indisponível neste sistema (por enquanto só Windows 64 bits).'];
    if (!c.engine) return ['', 'Desligada'];
    const st = status.status;
    if (st === 'downloading') return ['wait', `Baixando o modelo… ${status.download?.progress ?? 0}%`];
    if (st === 'starting') return ['wait', 'Iniciando o reconhecedor…'];
    if (st === 'running') return ['ok', `Ouvindo${status.lastMs ? ` · ${status.lastMs} ms por frase` : ''}`];
    if (st === 'error') return ['err', status.error || 'Erro no reconhecedor'];
    return ['wait', 'Conectando…'];
  }

  function paintStatus() {
    const el = $('#cc-status');
    if (!el) return;
    const [cls, txt] = statusText();
    el.className = 'cc-status ' + cls;
    el.querySelector('span').textContent = txt;
    const m = $('#cc-model-note');
    if (m) {
      const mm = status.models?.[cfg().model];
      m.textContent = mm ? (mm.ready ? 'Modelo baixado neste PC.' : `Será baixado na primeira vez (~${mm.mb} MB).`) : '';
    }
    const v = $('#cc-viewers');
    if (v) v.textContent = String(status.viewers ?? 0);
    const sw = $('#cc-engine');
    if (sw && sw.checked !== cfg().engine) sw.checked = cfg().engine;
    clearInterval(pollT);
    if (cfg().engine && ['downloading', 'starting'].includes(status.status)) {
      pollT = setInterval(async () => {
        try {
          status = await api(`/caption?studio=${encodeURIComponent(studioId)}`);
          paintStatus();
        } catch {}
      }, 1000);
    }
  }

  function paintLast() {
    const el = $('#cc-last');
    if (!el) return;
    const c = cfg();
    const parts = [];
    if (view.partial) parts.push(`<div class="cc-line partial">${esc(view.partial)}</div>`);
    if (lastFinal.pt) parts.push(`<div class="cc-line">${esc(lastFinal.pt)}</div>`);
    if (c.mode === 'both' && lastFinal.en) parts.push(`<div class="cc-line en"><b>EN</b> ${esc(lastFinal.en)}</div>`);
    el.innerHTML = parts.join('') || '<div class="cc-empty">A última frase reconhecida aparece aqui.</div>';
  }

  async function loadLink(regen = false) {
    try {
      linkInfo = await api(`/caption/link/${encodeURIComponent(studioId)}${regen ? '?regen=1' : ''}`);
    } catch (e) {
      linkInfo = null;
      toast(e.message, 'err');
    }
    paintLink();
  }

  function paintLink() {
    const box = $('#cc-links');
    if (!box) return;
    if (!cfg().link) {
      box.innerHTML = '<p class="hint">Ligue o link para gerar o endereço e o QR Code.</p>';
      return;
    }
    if (!linkInfo) {
      box.innerHTML = '<p class="hint">Gerando link…</p>';
      return;
    }
    const all = [...linkInfo.links];
    const main = all[0];
    box.innerHTML = `
      ${main ? `<div class="cc-qr">${qrSvg(main.url)}</div>` : ''}
      ${all.map((l) => `<div class="cc-link"><div class="meta"><strong>${esc(l.label)}</strong><code>${esc(l.url)}</code></div><button class="btn sm" data-copy="${esc(l.url)}">${icons.copy} Copiar</button></div>`).join('') || '<p class="hint">Sem rede local nem link de Internet. Ligue o link externo em Convidar.</p>'}
      <div class="cc-link"><div class="meta"><strong>OBS / vMix (fundo transparente)</strong><code>${esc(linkInfo.local + '&view=overlay&bg=transparent' + (cfg().upper ? '&upper=1' : ''))}</code></div><button class="btn sm" data-copy="${esc(linkInfo.local + '&view=overlay&bg=transparent' + (cfg().upper ? '&upper=1' : ''))}">${icons.copy} Copiar</button></div>
      <p class="hint">O link de Internet muda quando o CastDeck reinicia. Quem abrir vê só a legenda (sem áudio, vídeo ou controles).</p>`;
    box.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
  }

  // seções em sanfona: o estado aberto/fechado fica salvo neste PC (Saídas aberta na primeira vez)
  const openSecs = (() => {
    try {
      return JSON.parse(localStorage.getItem('cd.cc.open') || '["out"]');
    } catch {
      return ['out'];
    }
  })();
  const sec = (id, title, html) => `<details class="cc-card cc-acc" data-sec="${id}" ${openSecs.includes(id) ? 'open' : ''}><summary><h4>${title}</h4></summary><div class="cc-acc-body">${html}</div></details>`;
  // grade 3×3 de posição desenhada no formato da saída (16:9 ou 9:16)
  const POS_Y = [['t', 'em cima'], ['m', 'no meio'], ['b', 'embaixo']];
  const POS_X = [['l', 'à esquerda'], ['c', 'no centro'], ['r', 'à direita']];
  const posGrid = (key, cur, ar) =>
    `<div class="cc-posgrid" data-pos="${key}" style="aspect-ratio:${ar}">${POS_Y.map(([y, yl]) => POS_X.map(([x, xl]) => `<button class="${cur?.y === y && cur?.x === x ? 'on' : ''}" data-y="${y}" data-x="${x}" title="Legenda ${yl}, ${xl}" aria-label="Legenda ${yl}, ${xl}"><i></i></button>`).join('')).join('')}</div>`;

  function paintPreview() {
    const el = $('#cc-preview span');
    if (!el) return;
    const c = cfg();
    const h = c.bgColor.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0);
    el.style.color = c.color;
    el.style.textTransform = c.upper ? 'uppercase' : 'none';
    el.style.background = `rgba(${r},${g},${b},${c.bg})`;
  }

  function render() {
    const p = $('#panel-captions');
    if (!p) return;
    const c = cfg();
    const opt = (list, v) => list.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
    const models = status.models && Object.keys(status.models).length ? status.models : { equilibrado: { label: 'Equilibrado (recomendado)' }, preciso: { label: 'Preciso' }, leve: { label: 'Básico' } };
    p.innerHTML = `
      <div class="cc-panel">
        <section class="cc-card cc-main">
          <label class="check cc-master"><span><strong>Legenda ao vivo</strong><small>Reconhece a fala no próprio PC (sem internet)</small></span><span class="switch"><input type="checkbox" id="cc-engine" ${c.engine ? 'checked' : ''}><span></span></span></label>
          <div class="cc-status" id="cc-status"><i id="cc-vad" title="Acende quando alguém está falando"></i><span></span></div>
          <div class="cc-last" id="cc-last"></div>
        </section>

        ${sec('out', 'Saídas', `
          <label class="check"><span>① Mostrar na tela (PGM, vertical e retorno)</span><span class="switch"><input type="checkbox" id="cc-show" ${c.show ? 'checked' : ''}><span></span></span></label>
          <label class="check"><span>② Link ao vivo (página só com a legenda)</span><span class="switch"><input type="checkbox" id="cc-link" ${c.link ? 'checked' : ''}><span></span></span></label>
          <div id="cc-links" class="cc-links"></div>
          ${c.link ? `<div class="row cc-link-actions"><span class="hint">Vendo agora: <b id="cc-viewers">0</b></span><button class="btn sm ghost" id="cc-regen" title="Troca a chave: quem estava com o link antigo perde o acesso">Gerar novo link</button></div>` : ''}`)}

        ${sec('look', 'Aparência', `
          <div class="cc-grid">
            <label class="field"><span>Tamanho</span><select class="input" id="cc-size">${opt([['s', 'Pequeno'], ['m', 'Médio'], ['l', 'Grande']], c.size)}</select></label>
            <label class="field"><span>Linhas</span><select class="input" id="cc-lines">${opt([['1', '1 linha'], ['2', '2 linhas'], ['3', '3 linhas']], String(c.lines))}</select></label>
          </div>
          <div class="cc-colors">
            <span class="cc-lbl">Cor do texto</span>
            <div class="cc-swatches" data-swatch="color">${TEXT_COLORS.map((k) => `<button class="cc-sw ${k === c.color ? 'on' : ''}" data-v="${k}" style="--c:${k}" title="${k}"></button>`).join('')}<input type="color" id="cc-color" value="${esc(c.color)}" title="Outra cor"></div>
          </div>
          <div class="cc-colors">
            <span class="cc-lbl">Cor do fundo</span>
            <div class="cc-swatches" data-swatch="bgColor">${BG_COLORS.map((k) => `<button class="cc-sw ${k === c.bgColor ? 'on' : ''}" data-v="${k}" style="--c:${k}" title="${k}"></button>`).join('')}<input type="color" id="cc-bgcolor" value="${esc(c.bgColor)}" title="Outra cor"></div>
          </div>
          <label class="field"><span>Transparência do fundo</span><select class="input" id="cc-bg">${opt([['0', 'Sem fundo (só texto)'], ['0.5', 'Leve'], ['0.72', 'Médio'], ['0.9', 'Forte'], ['1', 'Sólido']], String(c.bg))}</select></label>
          <div class="cc-preview" id="cc-preview"><span>Assim fica a legenda no ar</span></div>
          <label class="field"><span>Aparecimento</span><select class="input" id="cc-appear">${opt([['live', 'Ao vivo (padrão, texto parcial)'], ['word', 'Palavra por palavra'], ['line', 'Frase inteira']], c.appear)}</select></label>
          <label class="field cc-delay-row"><span>Delay de consolidação</span><input type="range" id="cc-delay" min="0" max="2" step="0.1" value="${c.delay}"><b id="cc-delay-v">${c.delay}s</b></label>
          <label class="field cc-delay-row ${c.appear === 'word' ? '' : 'disabled'}"><span>Velocidade das palavras</span><input type="range" id="cc-wordms" min="90" max="320" step="10" value="${c.wordMs}"><b id="cc-wordms-v">${c.wordMs} ms</b></label>
          <label class="check"><span>TUDO EM MAIÚSCULAS</span><span class="switch"><input type="checkbox" id="cc-upper" ${c.upper ? 'checked' : ''}><span></span></span></label>`)}

        ${sec('pos', 'Posição na tela', `
          <div class="cc-pos-row">
            <div class="cc-pos-col"><span class="cc-lbl">Programa 16:9</span>${posGrid('posH', c.posH, '16 / 9')}</div>
            <div class="cc-pos-col"><span class="cc-lbl">Vertical 9:16</span>${posGrid('posV', c.posV, '9 / 16')}</div>
          </div>
          <p class="hint">Clique no ponto da tela onde a legenda deve ficar. Embaixo e em cima ela desvia sozinha do GC e do letreiro.</p>`)}

        ${sec('lang', 'Idioma e tradução', `
          <label class="field"><span>Idioma da fala</span><select class="input" id="cc-lang">${opt(LANGS, c.lang)}</select></label>
          <label class="field"><span>Tradução</span><select class="input" id="cc-mode">${opt(MODES, c.mode)}</select></label>
          <label class="field"><span>Palavras do programa <small>(nomes, marcas, termos — ajuda a acertar a grafia)</small></span><input class="input" id="cc-prompt" maxlength="300" placeholder="Ex.: CastDeck, Miguel Kallemback, Flamengo" value="${esc(c.prompt)}"></label>`)}

        ${sec('rec', 'Reconhecimento', `
          <label class="field"><span>Modelo</span><select class="input" id="cc-model">${Object.entries(models).map(([k, m]) => `<option value="${k}" ${k === c.model ? 'selected' : ''}>${esc(m.label)}${m.ready ? ' ✓' : m.mb ? ` · ${m.mb} MB` : ''}</option>`).join('')}</select></label>
          <label class="field"><span>Mostrar quem fala</span><select class="input" id="cc-who">${opt([['off', 'Desligado (padrão)'], ['auto', 'Automático (2+ fontes)'], ['always', 'Sempre']], c.who)}</select></label>
          <label class="field" id="cc-whowhen-wrap"${c.who === 'off' ? ' hidden' : ''}><span>Quando rotular</span><select class="input" id="cc-whowhen">${opt([['both', 'Parcial e final'], ['final', 'Só no final'], ['partial', 'Só no parcial']], c.whoWhen)}</select></label>
          <p class="hint" id="cc-model-note"></p>
          <p class="hint">Quem vai para a legenda: botão <b class="cc-chip">CC</b> em cada canal do painel <b>Áudio</b>. Por padrão, só as pessoas (microfones e convidados); mídias e tela ficam de fora para música não virar texto.</p>`)}
      </div>`;
    bind(p);
    paintStatus();
    paintLast();
    paintLink();
    paintPreview();
    if (c.link) loadLink();
  }

  function bind(p) {
    const on = (id, ev, fn) => {
      const el = p.querySelector(id);
      if (el) el[ev] = fn;
    };
    on('#cc-engine', 'onchange', async (e) => {
      await setCfg({ engine: e.target.checked });
      if (e.target.checked) {
        const ok = await startEngine();
        if (!ok) {
          await setCfg({ engine: false });
          e.target.checked = false;
        }
      } else await stopEngine();
      onAudioUi?.();
    });
    on('#cc-show', 'onchange', (e) => setCfg({ show: e.target.checked }));
    on('#cc-link', 'onchange', async (e) => {
      await setCfg({ link: e.target.checked });
      render();
    });
    on('#cc-regen', 'onclick', () => loadLink(true).then(() => toast('Link novo gerado. O anterior parou de funcionar.', 'ok')));
    on('#cc-lang', 'onchange', (e) => setCfg({ lang: e.target.value }, { restart: true }));
    on('#cc-mode', 'onchange', (e) => setCfg({ mode: e.target.value }, { restart: true }));
    on('#cc-model', 'onchange', (e) => setCfg({ model: e.target.value }, { restart: true }).then(paintStatus));
    on('#cc-who', 'onchange', (e) => { const w = e.target.value; cfg().who = w; $('#cc-whowhen-wrap')?.toggleAttribute('hidden', w === 'off'); saveStudio?.(); });
    on('#cc-whowhen', 'onchange', (e) => { cfg().whoWhen = e.target.value; saveStudio?.(); });
    on('#cc-prompt', 'onchange', (e) => setCfg({ prompt: e.target.value.trim() }, { restart: true }));
    on('#cc-size', 'onchange', (e) => setCfg({ size: e.target.value }));
    p.querySelectorAll('details.cc-acc').forEach((d) =>
      d.addEventListener('toggle', () => {
        const ids = [...p.querySelectorAll('details.cc-acc[open]')].map((x) => x.dataset.sec);
        try {
          localStorage.setItem('cd.cc.open', JSON.stringify(ids));
        } catch {}
        openSecs.splice(0, openSecs.length, ...ids);
      })
    );
    p.querySelectorAll('.cc-posgrid').forEach((g) =>
      g.querySelectorAll('button').forEach((b) =>
        (b.onclick = () => {
          setCfg({ [g.dataset.pos]: { y: b.dataset.y, x: b.dataset.x } });
          g.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        })
      )
    );
    p.querySelectorAll('[data-swatch]').forEach((box) => {
      const key = box.dataset.swatch;
      const pick = (v) => {
        setCfg({ [key]: v });
        box.querySelectorAll('.cc-sw').forEach((x) => x.classList.toggle('on', x.dataset.v === v));
        const inp = box.querySelector('input[type=color]');
        if (inp) inp.value = v;
        paintPreview();
      };
      box.querySelectorAll('.cc-sw').forEach((b) => (b.onclick = () => pick(b.dataset.v)));
      const inp = box.querySelector('input[type=color]');
      if (inp) inp.oninput = () => pick(inp.value);
    });
    on('#cc-lines', 'onchange', (e) => setCfg({ lines: +e.target.value }));
    on('#cc-bg', 'onchange', (e) => setCfg({ bg: +e.target.value }).then(paintPreview));
    on('#cc-appear', 'onchange', (e) => setCfg({ appear: e.target.value }).then(render));
    on('#cc-delay', 'oninput', (e) => {
      const v = (+e.target.value).toFixed(1);
      const b = p.querySelector('#cc-delay-v');
      if (b) b.textContent = v + 's';
      setCfg({ delay: +e.target.value });
    });
    on('#cc-wordms', 'oninput', (e) => {
      const v = e.target.value;
      const b = p.querySelector('#cc-wordms-v');
      if (b) b.textContent = v + ' ms';
      setCfg({ wordMs: +v });
    });
    on('#cc-upper', 'onchange', (e) => setCfg({ upper: e.target.checked }).then(paintPreview));
  }

  // ---------- início ----------
  async function init() {
    const mixer = getMixer();
    if (mixer) mixer.ccDefault = ccDefault;
    applyView();
    try {
      status = await api(`/caption?studio=${encodeURIComponent(studioId)}`);
    } catch {}
    // a legenda estava ligada quando o estúdio fechou: liga de novo (o modelo já está no PC)
    if (cfg().engine && status.available !== false) startEngine();
  }

  // atalho: mostrar/esconder a legenda na tela durante a live
  function toggleShow() {
    const c = cfg();
    if (!c.engine) return toast('Ligue a legenda na aba Legendas.', 'info');
    setCfg({ show: !c.show });
    toast(c.show ? 'Legenda na tela: visível' : 'Legenda na tela: escondida');
    const sw = $('#cc-show');
    if (sw) sw.checked = c.show;
  }

  return { init, render, toggleShow, isOn: () => cfg().engine };
}
