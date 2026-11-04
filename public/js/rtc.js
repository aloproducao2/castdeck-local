// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Cliente de sinalização + peer WebRTC com "perfect negotiation" (lida com renegociação e glare).

export class Signaling extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.queue = [];
    this.closedByUser = false;
    this.joinMsg = null;
  }

  connect(joinMsg) {
    this.joinMsg = joinMsg;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify(joinMsg));
      for (const m of this.queue.splice(0)) ws.send(m);
      this.emit('open');
      clearInterval(this._ka);
      this._ka = setInterval(() => ws.readyState === 1 && ws.send('{"type":"ping"}'), 20000);
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      this.emit(msg.type, msg);
    };
    ws.onclose = (e) => {
      clearInterval(this._ka);
      this.emit('close', { code: e.code, reason: e.reason });
      // reconecta automaticamente, exceto se foi expulso/substituído
      if (!this.closedByUser && ![4001, 4002, 4003, 4004].includes(e.code)) {
        const delay = this.nextDelay || 1500; // backoff opcional definido por quem forçou a reconexão
        this.nextDelay = 0;
        setTimeout(() => this.connect(this.joinMsg), delay);
      }
    };
  }

  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, fn) {
    this.addEventListener(type, (e) => fn(e.detail));
    return this;
  }

  send(msg) {
    const raw = JSON.stringify(msg);
    if (this.ws?.readyState === 1) this.ws.send(raw);
    else {
      // Guarda só as mensagens mais novas enquanto o socket está fora (como o VDO.Ninja),
      // para não entupir a memória nem replays velhos de ICE/SDP depois de reconectar.
      this.queue.push(raw);
      if (this.queue.length > 100) this.queue = this.queue.slice(-100);
    }
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
  }
}

// Servidores ICE vêm do servidor local (/api/public/ice): STUN gratuito + TURN opcional do usuário.
// Chame `await loadIce()` antes de criar peers.
let ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
export async function loadIce() {
  try {
    const r = await fetch('/api/public/ice', { cache: 'no-store' });
    const j = await r.json();
    if (Array.isArray(j.iceServers)) ICE = j.iceServers;
  } catch {}
  return ICE;
}
export function iceServers() {
  return ICE;
}


export class Peer extends EventTarget {
  constructor({ id, polite, signal, sdpTransform }) {
    super();
    this.id = id;
    this.polite = polite;
    this.signal = signal; // (data) => void
    this.sdpTransform = sdpTransform || null; // (sdp) => sdp, aplicado às respostas locais
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.srdAnswerPending = false;
    this.closed = false;
    this.restarts = 0;
    this.everConnected = false;
    this.relay = false;
    this.pendingIce = []; // candidates que chegam antes da descrição remota
    const pc = new RTCPeerConnection({ iceServers: iceServers(), bundlePolicy: 'max-bundle' });
    this.pc = pc;

    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        this.signal({ description: pc.localDescription });
      } catch (e) {
        console.warn('[peer] negotiation', e);
      } finally {
        this.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => candidate && this.signal({ candidate });
    pc.ontrack = (e) => this.dispatchEvent(new CustomEvent('track', { detail: e }));
    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      this.dispatchEvent(new CustomEvent('state', { detail: st }));
      clearTimeout(this._disc);
      if (st === 'connected') {
        this.everConnected = true;
        clearTimeout(this._watchdog);
        clearTimeout(this._stuck);
        this.restarts = 0;
      } else if (st === 'disconnected') {
        // quedas curtas se recuperam sozinhas; se persistir, força novo caminho ICE
        this._disc = setTimeout(() => this.recover(), 4000);
      } else if (st === 'failed') {
        this.recover();
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') this.recover();
    };
    // primeiro prazo: tenta recuperar sozinho; só depois declara travado.
    this._watchdog = setTimeout(() => {
      if (!this.closed && pc.connectionState !== 'connected') {
        this.recover();
        this._stuck = setTimeout(() => {
          if (!this.closed && pc.connectionState !== 'connected') this.dispatchEvent(new CustomEvent('stuck'));
        }, 15000);
      }
    }, 15000);
  }

  // Direcional como no VDO.Ninja: reinicia o ICE algumas vezes; se a rota direta não vingar,
  // tenta só por relay (TURN) e depois restaura a política direta.
  recover() {
    if (this.closed) return;
    this.restarts = (this.restarts || 0) + 1;
    if (this.restarts > 6) {
      this.dispatchEvent(new CustomEvent('stuck'));
      return;
    }
    const useRelay = this.restarts >= 3;
    if (useRelay && !this.relay) {
      this.relay = true;
      try {
        this.pc.setConfiguration({ iceServers: iceServers(), iceTransportPolicy: 'relay' });
      } catch {}
    }
    try {
      this.pc.restartIce();
    } catch {}
    clearTimeout(this._relayT);
    if (useRelay) this._relayT = setTimeout(() => this.restoreRelay(), 45000);
  }

  restoreRelay() {
    if (this.closed || !this.relay) return;
    this.relay = false;
    try {
      this.pc.setConfiguration({ iceServers: iceServers(), iceTransportPolicy: 'all' });
    } catch {}
    try {
      this.pc.restartIce();
    } catch {}
  }

  // Mede qualidade a cada 2s: rtt (ms), perda (%), bitrate de envio/recebimento (kbps) e nota 0-3.
  monitor(cb, every = 2000) {
    let prev = null;
    this._mon = setInterval(async () => {
      if (this.closed || this.pc.connectionState !== 'connected') return;
      try {
        const stats = await this.pc.getStats();
        let rtt = null;
        let sent = 0;
        let recv = 0;
        let lost = 0;
        let pkts = 0;
        let sentLimited = null;
        stats.forEach((r) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated && r.currentRoundTripTime != null) rtt = r.currentRoundTripTime * 1000;
          if (r.type === 'outbound-rtp' && r.kind === 'video') {
            sent += r.bytesSent || 0;
            if (r.qualityLimitationReason && r.qualityLimitationReason !== 'none') sentLimited = r.qualityLimitationReason;
          }
          if (r.type === 'outbound-rtp' && r.kind === 'audio') sent += r.bytesSent || 0;
          if (r.type === 'inbound-rtp') {
            recv += r.bytesReceived || 0;
            lost += r.packetsLost || 0;
            pkts += (r.packetsReceived || 0) + (r.packetsLost || 0);
          }
        });
        const now = performance.now();
        let sendKbps = 0;
        let recvKbps = 0;
        let lossPct = 0;
        if (prev) {
          const dt = (now - prev.t) / 1000;
          sendKbps = Math.max(0, ((sent - prev.sent) * 8) / dt / 1000);
          recvKbps = Math.max(0, ((recv - prev.recv) * 8) / dt / 1000);
          const dp = pkts - prev.pkts;
          lossPct = dp > 0 ? (Math.max(0, lost - prev.lost) / dp) * 100 : 0;
        }
        prev = { t: now, sent, recv, lost, pkts };
        const quality = rtt == null ? 3 : lossPct > 8 || rtt > 500 ? 0 : lossPct > 3 || rtt > 250 ? 1 : lossPct > 1 || rtt > 120 ? 2 : 3;
        cb({ rtt, lossPct, sendKbps, recvKbps, quality, limited: sentLimited });
      } catch {}
    }, every);
  }

  async handle({ description, candidate }) {
    const pc = this.pc;
    try {
      if (description) {
        const readyForOffer = !this.makingOffer && (pc.signalingState === 'stable' || this.srdAnswerPending);
        const collision = description.type === 'offer' && !readyForOffer;
        this.ignoreOffer = !this.polite && collision;
        if (this.ignoreOffer) return;
        this.srdAnswerPending = description.type === 'answer';
        await pc.setRemoteDescription(description);
        this.srdAnswerPending = false;
        if (description.type === 'offer') {
          if (this.sdpTransform) {
            const ans = await pc.createAnswer();
            await pc.setLocalDescription({ type: 'answer', sdp: this.sdpTransform(ans.sdp) });
          } else await pc.setLocalDescription();
          this.signal({ description: pc.localDescription });
        }
        // candidates que chegaram antes da descrição remota agora podem ser aplicados
        const pending = this.pendingIce.splice(0);
        for (const c of pending) {
          try {
            await pc.addIceCandidate(c);
          } catch {}
        }
      } else if (candidate) {
        if (!pc.remoteDescription) {
          this.pendingIce.push(candidate);
          if (this.pendingIce.length > 100) this.pendingIce.shift();
          return;
        }
        try {
          await pc.addIceCandidate(candidate);
        } catch (e) {
          if (!this.ignoreOffer) console.warn('[peer] ice', e);
        }
      }
    } catch (e) {
      console.warn('[peer] signal', e);
    }
  }

  // Ajusta bitrate máximo de envio de vídeo (ex.: programa de volta aos convidados).
  // Opções opcionais evitam que o encoder reduza a resolução quando a rede oscila.
  async setMaxBitrate(sender, bps, opts = {}) {
    const apply = async (advanced) => {
      const p = sender.getParameters();
      if (!p.encodings?.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = bps;
      if (advanced && opts.maxFramerate) p.encodings[0].maxFramerate = opts.maxFramerate;
      if (advanced && opts.degradationPreference) p.degradationPreference = opts.degradationPreference;
      await sender.setParameters(p);
    };
    try {
      await apply(true);
    } catch {
      // Safari/versões antigas podem recusar maxFramerate/degradationPreference.
      // O bitrate é o essencial; tenta de novo só com ele antes de desistir.
      try { await apply(false); } catch {}
    }
  }

  close() {
    this.closed = true;
    clearInterval(this._mon);
    clearTimeout(this._watchdog);
    clearTimeout(this._stuck);
    clearTimeout(this._disc);
    clearTimeout(this._relayT);
    this.pendingIce = [];
    try {
      this.pc.close();
    } catch {}
  }
}
