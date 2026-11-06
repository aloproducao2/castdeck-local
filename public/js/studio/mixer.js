// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Mixer de áudio (WebAudio).
//  - programa: só fontes "no palco" (o que vai ao ar)
//  - monitor: o que o host ouve (convidados + mídias; nunca o próprio microfone)
//  - mix-minus por convidado: tudo menos o próprio áudio do convidado (evita eco)

export class AudioMixer {
  constructor() {
    const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'playback' });
    this.ctx = ctx;
    this.programBus = ctx.createGain();
    this.programBus.channelCount = 2;
    this.programBus.channelCountMode = 'explicit';
    this.programBus.channelInterpretation = 'speakers';
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 3;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.25;
    this.programDest = ctx.createMediaStreamDestination();
    this.programBus.connect(limiter).connect(this.programDest);
    this.programAnalyser = ctx.createAnalyser();
    this.programAnalyser.fftSize = 512;
    limiter.connect(this.programAnalyser);
    // medidores L/R do programa (padrão de mesa de broadcast)
    const split = ctx.createChannelSplitter(2);
    limiter.connect(split);
    const pgmPull = ctx.createGain();
    pgmPull.gain.value = 0;
    pgmPull.connect(ctx.destination);
    this.programLR = [0, 1].map((ch) => {
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      split.connect(an, ch);
      an.connect(pgmPull);
      return an;
    });
    this.limiter = limiter;
    // monitor da SAÍDA: o host ouve exatamente o que vai ao ar (inclui o próprio microfone)
    this.programMonitor = ctx.createGain();
    this.programMonitor.gain.value = 0;
    limiter.connect(this.programMonitor).connect(ctx.destination);

    this.monitorBus = ctx.createGain();
    this.monitorBus.connect(ctx.destination);

    // Fone / CUE: solo substitui o retorno normal e sai com prioridade (vMix).
    this.cueBus = ctx.createGain();
    this.cueBus.gain.value = 0;
    this.cueBus.connect(ctx.destination);
    this.anySolo = false;

    // Buses auxiliares A–G (Master é o programBus). Cada bus tem seu próprio MediaStreamDestination
    // para ir a um dispositivo de saída (interface USB, placa, etc.) — um par estéreo por dispositivo.
    this.busOrder = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    this.buses = new Map();
    this.busOrder.forEach((id) => {
      const gain = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      const pull = ctx.createGain();
      pull.gain.value = 0;
      gain.connect(dest);
      gain.connect(an);
      an.connect(pull).connect(ctx.destination);
      this.buses.set(id, { id, gain, dest, analyser: an, pull, mute: false, level: 1, deviceId: '', el: null });
    });
    this.masterMuted = false;
    this.dim = false;
    this.masterDeviceId = '';
    this.masterEl = null;

    // Barramento da LEGENDA ao vivo: só canais no ar com o botão CC ligado (padrão: as pessoas). Não usa o programBus
    // inteiro porque música/vinheta no meio da fala faz o reconhecedor inventar texto. Mono, pós volume/mudo.
    this.captionBus = ctx.createGain();
    this.captionBus.channelCount = 1;
    this.captionBus.channelCountMode = 'explicit';
    this.captionBus.channelInterpretation = 'speakers';
    this.captionOn = false; // a legenda está ligada no estúdio (sem isso os envios ficam em 0)
    this.ccDefault = null; // (id, src) => boolean: padrão do CC por tipo de fonte (definido pelo estúdio)

    this.sources = new Map();
    this.outputs = new Map(); // guestId -> { bus, dest }
    this.intercomOutputs = new Map(); // participantId -> { bus, dest, talk, program, host }
    this.isos = new Map(); // fonte de vídeo (stageKey) -> destino com só o áudio dela (sinais para OBS/vMix)
    this.onStage = new Set();
    this._buf = new Float32Array(1024);
    this.master = 1;
    // ajustes por canal (volume, mudo, redução de ruído): sobrevivem à reconexão do convidado / troca de faixa
    this.prefs = new Map();
    this.onPrefs = null; // (id, prefs) => void, para persistir
    this.onChange = null; // (id, kind) => void, UI/remoto sincronizam
    this.onMute = null; // (id, muted) => void, mantém botão do host coerente
    this._nrReady = null;
  }

  resume() {
    return this.ctx.state !== 'running' ? this.ctx.resume() : Promise.resolve();
  }

  get programTrack() {
    return this.programDest.stream.getAudioTracks()[0];
  }

  addStream(id, stream, { ownerId = null, stageKey = id, monitor = true, remote = false } = {}) {
    this.remove(id);
    const track = stream?.getAudioTracks()[0];
    if (!track) return null;
    // Chromium Issue 40094084: faixas de áudio WebRTC remotas e captura de tela/janela (getDisplayMedia)
    // só fluem no WebAudio se estiverem anexadas a um elemento de mídia HTML ativo (pull model do Chromium).
    // Sem o keepAlive, o Chromium suspende a extração de pacotes de áudio e a entrada fica em silêncio.
    const keepAlive = new Audio();
    keepAlive.muted = false;
    keepAlive.volume = 0;
    keepAlive.srcObject = stream;
    keepAlive.play().catch(() => {});
    let input;
    try {
      input = this.ctx.createMediaStreamSource(stream);
    } catch {
      input = this.ctx.createMediaStreamSource(new MediaStream([track]));
    }
    const src = this._register(id, input, { ownerId, stageKey, monitor, keepAlive });
    if (id === 'host:mic') this._wireIntercomHosts();
    return src;
  }

  addElement(id, el, { ownerId = null, stageKey = id, monitor = true } = {}) {
    this.remove(id);
    // createMediaElementSource só pode ser chamado uma vez por elemento
    el._mixerNode ||= this.ctx.createMediaElementSource(el);
    return this._register(id, el._mixerNode, { ownerId, stageKey, monitor, keepAlive: null, persistent: true });
  }

  // canal a partir de um nó WebAudio do próprio contexto (ex.: áudio da página do DSK, que chega em PCM pelo WS)
  addNode(id, node, { ownerId = null, stageKey = id, monitor = true } = {}) {
    this.remove(id);
    return this._register(id, node, { ownerId, stageKey, monitor, keepAlive: null, persistent: true });
  }

  // Toca um elemento de áudio direto no programa, no retorno do host e no dos convidados, sem criar canal
  // (não depende do palco). Usado pelas mensagens de áudio do público. Devolve a função que desliga.
  playOnProgram(el) {
    el._mixerNode ||= this.ctx.createMediaElementSource(el);
    const node = el._mixerNode;
    const g = this.ctx.createGain();
    node.connect(g);
    g.connect(this.programBus);
    g.connect(this.monitorBus);
    for (const out of this.outputs.values()) g.connect(out.bus);
    this.resume();
    return () => {
      try {
        node.disconnect(g);
        g.disconnect();
      } catch {}
    };
  }

  _register(id, input, { ownerId, stageKey, monitor, keepAlive, persistent }) {
    const ctx = this.ctx;
    const pre = ctx.createGain(); // ponto de inserção da redução de ruído
    const gain = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const toProgram = ctx.createGain();
    toProgram.gain.value = this.onStage.has(stageKey) ? 1 : 0;
    const toMonitor = ctx.createGain();
    toMonitor.gain.value = monitor ? 1 : 0;
    const toCaption = ctx.createGain();
    toCaption.gain.value = 0;
    // Separar volume de mute permite ao Solo ouvir o canal mesmo mudo (pós-fader, pré-mute), como no vMix.
    const muteGain = ctx.createGain();
    const toCue = ctx.createGain();
    toCue.gain.value = 0;
    const sends = new Map();
    for (const busId of this.busOrder) {
      const send = ctx.createGain();
      send.gain.value = 0; // padrão vMix: entra só no Master
      muteGain.connect(send).connect(this.buses.get(busId).gain);
      sends.set(busId, send);
    }

    // Pull node com ganho 0 conectado diretamente ao hardware (ctx.destination):
    // Garante que o WebAudio processe e puxe os blocos de áudio através do analyser
    // mesmo quando o canal não está sendo ouvido nos fones (monitor = false)
    // ou quando o programa ainda não foi ligado.
    const pull = ctx.createGain();
    pull.gain.value = 0;
    analyser.connect(pull).connect(ctx.destination);
    // Rota fixa opcional (independente do palco): o Replay usa para decidir se o clipe
    // entra no programa e/ou no fone sem depender de S.stage/mixer.onStage.
    const route = null;

    input.connect(pre);
    pre.connect(gain);
    // gain = fader; muteGain = mute (todos os buses); toCue = fone (solo), pré-mute.
    gain.connect(muteGain);
    gain.connect(toCue).connect(this.cueBus);
    muteGain.connect(analyser);
    muteGain.connect(toProgram).connect(this.programBus);
    muteGain.connect(toMonitor).connect(this.monitorBus);
    muteGain.connect(toCaption).connect(this.captionBus);

    const p = this.prefs.get(id) || {};
    const src = { id, input, pre, nr: null, gain, muteGain, toCue, sends, analyser, pull, toProgram, toMonitor, toCaption, cc: typeof p.cc === 'boolean' ? p.cc : null, ownerId, stageKey, keepAlive, persistent, monitor, route, volume: p.volume ?? 1, muted: !!p.muted, nrOn: !!p.nrOn, nrAmount: p.nrAmount ?? 0.8, solo: false, outs: new Map(), meter: { peak: -90, hold: -90, holdT: 0, clipT: 0 } };
    gain.gain.value = src.volume;
    muteGain.gain.value = src.muted ? 0 : 1;
    // Rotas de bus salvas (o operador não perde o roteamento ao reconectar um convidado).
    const savedSends = p.sends || {};
    for (const busId of this.busOrder) {
      if (savedSends[busId]) sends.get(busId).gain.value = 1;
    }
    this.sources.set(id, src);
    for (const [guestId, out] of this.outputs) this._connectOut(src, guestId, out);
    this.isos.get(stageKey) && muteGain.connect(this.isos.get(stageKey));
    if (src.nrOn) this._applyNoise(src).catch(() => {});
    this._ccApply(src);
    return src;
  }

  // ---------- legenda (CC por canal) ----------
  // CC efetivo do canal: escolha salva do operador ou o padrão do tipo (pessoas ligadas, mídia/tela desligadas)
  ccOf(id) {
    const s = this.sources.get(id);
    if (s && typeof s.cc === 'boolean') return s.cc;
    const p = this.prefs.get(id);
    if (typeof p?.cc === 'boolean') return p.cc;
    return this.ccDefault ? !!this.ccDefault(id, s) : false;
  }

  // vai para a legenda = legenda ligada + no ar (palco) + CC ligado; rota fixa (Replay) nunca entra
  _ccApply(s, t = this.ctx.currentTime) {
    const on = this.captionOn && !s.route && this.onStage.has(s.stageKey) && this.ccOf(s.id);
    s.toCaption.gain.setTargetAtTime(on ? 1 : 0, t, 0.05);
  }

  setCaptionOn(on) {
    this.captionOn = !!on;
    for (const s of this.sources.values()) this._ccApply(s);
  }

  setCc(id, on, { save = true } = {}) {
    if (save) this._savePref(id, { cc: !!on });
    const s = this.sources.get(id);
    if (!s) return;
    s.cc = !!on;
    this._ccApply(s);
  }

  // "só este": liga o CC deste canal e desliga o dos outros (duplo clique no botão CC)
  soloCc(id) {
    for (const s of this.sources.values()) this.setCc(s.id, s.id === id);
  }

  _savePref(id, patch) {
    const p = { ...(this.prefs.get(id) || {}), ...patch };
    this.prefs.set(id, p);
    this.onPrefs?.(id, p);
  }

  // ---------- redução de ruído (RNNoise em AudioWorklet, carregado só quando alguém liga) ----------
  _loadNoise() {
    this._nrReady ||= (async () => {
      await this.ctx.audioWorklet.addModule('/js/studio/denoise-worklet.js');
      const r = await fetch('/vendor/rnnoise/rnnoise.wasm');
      if (!r.ok) throw new Error('rnnoise.wasm ' + r.status);
      return r.arrayBuffer();
    })();
    this._nrReady.catch(() => (this._nrReady = null));
    return this._nrReady;
  }

  async _applyNoise(src) {
    if (src.nrOn && !src.nr) {
      const wasm = await this._loadNoise();
      if (this.sources.get(src.id) !== src) return; // fonte removida enquanto carregava
      const node = new AudioWorkletNode(this.ctx, 'castdeck-denoise', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: 'explicit',
        processorOptions: { wasm, amount: src.nrAmount, active: true },
      });
      src.pre.disconnect();
      src.pre.connect(node).connect(src.gain);
      src.nr = node;
    }
    // depois de criado, ligar/desligar só muda a mistura (sem refazer o grafo e sem estalos)
    src.nr?.port.postMessage({ active: src.nrOn, amount: src.nrAmount });
  }

  async setNoise(id, { on, amount } = {}) {
    const s = this.sources.get(id);
    if (!s) return;
    if (typeof on === 'boolean') s.nrOn = on;
    if (typeof amount === 'number') s.nrAmount = Math.max(0, Math.min(1, amount));
    this._savePref(id, { nrOn: s.nrOn, nrAmount: s.nrAmount });
    await this._applyNoise(s);
  }

  _connectOut(src, guestId, out) {
    if (src.ownerId === guestId) return;
    const g = this.ctx.createGain();
    src.muteGain.connect(g).connect(out.bus);
    src.outs.set(guestId, g);
  }

  remove(id) {
    const s = this.sources.get(id);
    if (!s) return;
    try {
      s.input.disconnect();
    } catch {}
    for (const n of [s.pre, s.nr, s.gain, s.muteGain, s.toCue, s.analyser, s.pull, s.toProgram, s.toMonitor, s.toCaption, ...(s.sends?.values() || []), ...s.outs.values()]) {
      try {
        n?.disconnect();
      } catch {}
    }
    if (s.keepAlive) {
      try {
        s.keepAlive.pause();
      } catch {}
      s.keepAlive.srcObject = null;
    }
    this.sources.delete(id);
    // Se o canal removido estava em Solo, o fone não pode ficar mudo para sempre.
    if (s.solo) this._applySolo();
  }

  // áudio isolado de uma fonte de vídeo (todos os canais com esse stageKey: ex. microfone + câmera do convidado),
  // pós volume/mudo/redução de ruído e sem depender do palco. Usado nos sinais individuais para OBS/vMix.
  isoTrack(key) {
    let dest = this.isos.get(key);
    if (!dest) {
      dest = this.ctx.createMediaStreamDestination();
      this.isos.set(key, dest);
      for (const s of this.sources.values()) if (s.stageKey === key) s.muteGain.connect(dest);
    }
    return dest.stream.getAudioTracks()[0];
  }

  addGuestOutput(guestId) {
    this.removeGuestOutput(guestId);
    const bus = this.ctx.createGain();
    const dest = this.ctx.createMediaStreamDestination();
    bus.connect(dest);
    const out = { bus, dest };
    this.outputs.set(guestId, out);
    for (const s of this.sources.values()) this._connectOut(s, guestId, out);
    return dest.stream.getAudioTracks()[0];
  }

  removeGuestOutput(guestId) {
    const out = this.outputs.get(guestId);
    if (!out) return;
    for (const s of this.sources.values()) {
      const g = s.outs.get(guestId);
      if (g) {
        try {
          g.disconnect();
        } catch {}
        s.outs.delete(guestId);
      }
    }
    try {
      out.bus.disconnect();
    } catch {}
    this.outputs.delete(guestId);
  }

  // Intercom de produção: um retorno WebAudio por participante. O host mic entra
  // pós-fader e pré-mute (PTT pode falar mesmo com o microfone do PGM mutado).
  addIntercomOutput(participantId) {
    this.removeIntercomOutput(participantId);
    const ctx = this.ctx;
    const bus = ctx.createGain();
    const dest = ctx.createMediaStreamDestination();
    const talk = ctx.createGain();
    const program = ctx.createGain();
    talk.gain.value = 0;
    program.gain.value = 0;
    talk.connect(bus);
    program.connect(bus);
    this.limiter.connect(program);
    bus.connect(dest);
    const out = { bus, dest, talk, program, host: null };
    this._connectIntercomHost(out, this.sources.get('host:mic'));
    this.intercomOutputs.set(participantId, out);
    return dest.stream.getAudioTracks()[0];
  }

  _connectIntercomHost(out, host) {
    if (!out || !host?.gain) return;
    try { out.host?.disconnect(out.talk); } catch {}
    try {
      host.gain.connect(out.talk);
      out.host = host.gain;
    } catch {}
  }

  _wireIntercomHosts() {
    const host = this.sources.get('host:mic');
    for (const out of this.intercomOutputs.values()) this._connectIntercomHost(out, host);
  }

  setIntercomTalk(participantId, on) {
    const out = this.intercomOutputs.get(participantId);
    if (!out) return false;
    out.talk.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.015);
    return true;
  }

  setIntercomProgram(participantId, on, level = 0.18) {
    const out = this.intercomOutputs.get(participantId);
    if (!out) return false;
    out.program.gain.setTargetAtTime(on ? Math.max(0, Math.min(1, level)) : 0, this.ctx.currentTime, 0.08);
    return true;
  }

  // Escuta do host por participante: usa o monitor do canal, sem tocar no programa.
  setIntercomListen(sourceId, on) {
    const s = this.sources.get(sourceId);
    if (!s) return false;
    s.toMonitor.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.03);
    return true;
  }

  intercomTestTone(ms = 420) {
    if (!this.intercomOutputs.size) return false;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.connect(gain);
    for (const out of this.intercomOutputs.values()) gain.connect(out.bus);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.setValueAtTime(0, now + ms / 1000);
    osc.start(now);
    osc.stop(now + ms / 1000 + 0.02);
    osc.onended = () => { try { gain.disconnect(); } catch {} };
    return true;
  }

  removeIntercomOutput(participantId) {
    const out = this.intercomOutputs.get(participantId);
    if (!out) return;
    try { out.bus.disconnect(); } catch {}
    try { out.talk.disconnect(); } catch {}
    try { out.program.disconnect(); } catch {}
    try { out.host?.disconnect(out.talk); } catch {}
    this.intercomOutputs.delete(participantId);
  }

  setStage(keys) {
    this.onStage = new Set(keys);
    const t = this.ctx.currentTime;
    for (const s of this.sources.values()) {
      // Rota fixa (ex.: áudio do Replay) vence o palco; sem rota, segue o comportamento normal.
      const on = s.route?.program ?? this.onStage.has(s.stageKey);
      s.toProgram.gain.setTargetAtTime(on ? 1 : 0, t, 0.05);
      this._ccApply(s, t);
    }
  }

  // Fixa a rota de uma fonte fora do palco. `null` devolve o controle ao setStage.
  // Usado pelo Replay: CUE (só fone) / PGM (só programa) / ambos / mudo.
  setRoute(id, { program = null, monitor = null } = {}) {
    const s = this.sources.get(id);
    if (!s) return false;
    s.route = { program, monitor };
    const t = this.ctx.currentTime;
    const onProgram = program === null ? this.onStage.has(s.stageKey) : !!program;
    const onMonitor = monitor === null ? !!s.monitor : !!monitor;
    s.toProgram.gain.setTargetAtTime(onProgram ? 1 : 0, t, 0.02);
    s.toMonitor.gain.setTargetAtTime(onMonitor ? 1 : 0, t, 0.02);
    this._ccApply(s, t);
    this.onChange?.(id, 'route');
    return true;
  }

  setVolume(id, v, { save = true } = {}) {
    if (save) this._savePref(id, { volume: v });
    const s = this.sources.get(id);
    if (!s) return;
    s.volume = v;
    s.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    this.onChange?.(id, 'volume');
  }

  setMuted(id, muted, { save = true } = {}) {
    if (save) this._savePref(id, { muted });
    const s = this.sources.get(id);
    if (!s) return;
    s.muted = muted;
    // Mute separado do fader: Solo continua ouvindo o canal (pré-mute), como no vMix.
    s.muteGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.03);
    this.onMute?.(id, !!muted);
    this.onChange?.(id, 'mute');
  }

  // fader master do programa (antes do limitador), com mute/dim independentes
  _applyMaster() {
    const v = this.masterMuted ? 0 : this.master * (this.dim ? 0.2 : 1);
    this.programBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }
  setMaster(v) {
    this.master = v;
    this._applyMaster();
    this.onChange?.('__master', 'master');
  }
  setMasterMuted(on) {
    this.masterMuted = !!on;
    this._applyMaster();
    this.onChange?.('__master', 'master-mute');
  }
  setDim(on) {
    this.dim = !!on;
    this._applyMaster();
    this.onChange?.('__master', 'dim');
  }

  setMonitorVolume(v) {
    this.monitorVol = v;
    const t = this.ctx.currentTime;
    if (this.anySolo) this.cueBus.gain.setTargetAtTime(v, t, 0.03);
    else if (!this.listenProgram) this.monitorBus.gain.setTargetAtTime(v, t, 0.03);
    else this.programMonitor.gain.setTargetAtTime(v, t, 0.03);
    this.onChange?.('__mon', 'monitor');
  }

  // true: ouve a saída do programa; false: ouve o retorno (convidados + mídias, sem o próprio mic)
  setListenProgram(on) {
    this.listenProgram = !!on;
    const v = this.monitorVol ?? 1;
    const t = this.ctx.currentTime;
    if (this.anySolo) return; // Solo tem prioridade no fone
    this.monitorBus.gain.setTargetAtTime(on ? 0 : v, t, 0.03);
    this.programMonitor.gain.setTargetAtTime(on ? v : 0, t, 0.03);
  }

  // ---------- Solo / PFL (fone) ----------
  setSolo(id, on) {
    const s = this.sources.get(id);
    if (!s) return false;
    s.solo = !!on;
    this._applySolo();
    this.onChange?.(id, 'solo');
    return true;
  }
  toggleSolo(id) {
    const s = this.sources.get(id);
    if (!s) return false;
    return this.setSolo(id, !s.solo);
  }
  clearSolo() {
    for (const s of this.sources.values()) s.solo = false;
    this._applySolo();
    this.onChange?.('__solo', 'clear');
  }
  _applySolo() {
    this.anySolo = [...this.sources.values()].some((s) => s.solo);
    const t = this.ctx.currentTime;
    const v = this.monitorVol ?? 1;
    for (const s of this.sources.values()) s.toCue.gain.setTargetAtTime(this.anySolo && s.solo ? 1 : 0, t, 0.02);
    this.cueBus.gain.setTargetAtTime(this.anySolo ? v : 0, t, 0.03);
    if (this.anySolo) {
      this.monitorBus.gain.setTargetAtTime(0, t, 0.03);
      this.programMonitor.gain.setTargetAtTime(0, t, 0.03);
    } else if (!this.listenProgram) {
      this.monitorBus.gain.setTargetAtTime(v, t, 0.03);
      this.programMonitor.gain.setTargetAtTime(0, t, 0.03);
    } else {
      this.monitorBus.gain.setTargetAtTime(0, t, 0.03);
      this.programMonitor.gain.setTargetAtTime(v, t, 0.03);
    }
  }

  // ---------- Buses auxiliares A–G ----------
  busList() {
    return this.busOrder.map((id) => this.buses.get(id)).filter(Boolean);
  }
  getBus(id) {
    return this.buses.get(id) || null;
  }
  setSend(id, busId, on, { save = true } = {}) {
    const s = this.sources.get(id);
    const bus = this.buses.get(busId);
    if (!s || !bus) return false;
    const g = s.sends.get(busId);
    if (!g) return false;
    g.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.02);
    if (save) this._savePref(id, { sends: { ...(this.prefs.get(id)?.sends || {}), [busId]: !!on } });
    this.onChange?.(id, 'send');
    return true;
  }
  getSend(id, busId) {
    const s = this.sources.get(id);
    const g = s?.sends.get(busId);
    return !!g && g.gain.value > 0.01;
  }
  setBusLevel(id, v) {
    const bus = this.buses.get(id);
    if (!bus) return;
    bus.level = Math.max(0, Math.min(2, Number(v) || 0));
    this._applyBus(bus);
    this.onChange?.('bus:' + id, 'level');
  }
  setBusMute(id, on) {
    const bus = this.buses.get(id);
    if (!bus) return;
    bus.mute = !!on;
    this._applyBus(bus);
    this.onChange?.('bus:' + id, 'mute');
  }
  _applyBus(bus) {
    bus.gain.gain.setTargetAtTime(bus.mute ? 0 : bus.level, this.ctx.currentTime, 0.03);
  }
  busTrack(id) {
    const bus = this.buses.get(id);
    return bus ? bus.dest.stream.getAudioTracks()[0] : null;
  }
  busDb(id) {
    const bus = this.buses.get(id);
    return bus ? this._db(bus.analyser) : { peak: -90, rms: -90 };
  }
  // Saída física do bus (um par estéreo por dispositivo). Elemento oculto + setSinkId.
  async setBusDevice(id, deviceId) {
    const bus = this.buses.get(id);
    if (!bus) return false;
    bus.deviceId = deviceId || '';
    if (!deviceId) {
      try { bus.el?.pause(); } catch {}
      return true;
    }
    if (!bus.el) {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.crossOrigin = 'anonymous';
      el.srcObject = bus.dest.stream;
      bus.el = el;
    }
    try {
      if (bus.el.setSinkId) await bus.el.setSinkId(deviceId);
      await bus.el.play();
      return true;
    } catch (err) {
      console.warn('[mixer] Falha ao abrir saída do bus', id, err);
      return false;
    }
  }
  async setMasterDevice(deviceId) {
    this.masterDeviceId = deviceId || '';
    if (!deviceId) {
      try { this.masterEl?.pause(); } catch {}
      return true;
    }
    if (!this.masterEl) {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.srcObject = this.programDest.stream;
      this.masterEl = el;
    }
    try {
      if (this.masterEl.setSinkId) await this.masterEl.setSinkId(deviceId);
      await this.masterEl.play();
      return true;
    } catch (err) {
      console.warn('[mixer] Falha ao abrir saída master:', err);
      return false;
    }
  }
  // Tom de teste no bus (confere a interface escolhida sem passar pelo programa)
  async testBus(id) {
    const bus = this.buses.get(id);
    if (!bus) return;
    await this.resume();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = id === 'M' ? 660 : 880;
    g.gain.value = 0.0001;
    o.connect(g).connect(bus.gain);
    const t = this.ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.start(t);
    o.stop(t + 0.75);
  }
  isOnAir(id) {
    const s = this.sources.get(id);
    if (!s) return false;
    if (s.route?.program === true) return true;
    if (s.route?.program === false) return false;
    return this.onStage.has(s.stageKey);
  }

  // bipe curto no retorno para o usuário confirmar que a saída de áudio escolhida funciona
  async beep() {
    await this.resume();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.value = 660;
    g.gain.value = 0.0001;
    o.connect(g).connect(this.ctx.destination);
    const t = this.ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.start(t);
    o.stop(t + 0.65);
  }

  async setSpeaker(deviceId) {
    if (this.ctx.setSinkId) await this.ctx.setSinkId(deviceId || '');
  }

  _rms(an) {
    const buf = this._buf.subarray(0, an.fftSize);
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.min(1, Math.sqrt(sum / buf.length) * 4);
  }

  // pico e RMS em dBFS (para os medidores estilo broadcast)
  _db(an) {
    const buf = this._buf.subarray(0, an.fftSize);
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    let pk = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      sum += v * v;
      const a = v < 0 ? -v : v;
      if (a > pk) pk = a;
    }
    const rms = Math.sqrt(sum / buf.length);
    return { peak: pk > 1e-5 ? 20 * Math.log10(pk) : -90, rms: rms > 1e-5 ? 20 * Math.log10(rms) : -90 };
  }

  level(id) {
    const s = this.sources.get(id);
    return s ? this._rms(s.analyser) : 0;
  }

  levelDb(id) {
    const s = this.sources.get(id);
    return s ? this._db(s.analyser) : { peak: -90, rms: -90 };
  }

  programLevel() {
    return this._rms(this.programAnalyser);
  }

  programDb() {
    return this.programLR.map((an) => this._db(an));
  }

  // redução de ganho do limitador do programa (dB, positivo)
  limiterGR() {
    return Math.max(0, -(this.limiter.reduction || 0));
  }
}
