// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Sinalização WebRTC em topologia estrela: o host (estúdio) conecta-se a cada convidado.
// O host compõe a cena e devolve o "programa" para os convidados – igual a um estúdio web.
import { randomUUID } from 'node:crypto';

const clean = (s, n = 60) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const CAM_CAPS = ['zoom', 'focusDistance', 'exposureCompensation', 'exposureTime', 'iso', 'brightness', 'contrast', 'saturation', 'sharpness', 'colorTemperature', 'pan', 'tilt'];
const CAM_MODES = ['focusMode', 'exposureMode', 'whiteBalanceMode'];
const cleanRange = (v) => {
  if (!v || typeof v !== 'object') return null;
  const min = Number(v.min);
  const max = Number(v.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  const step = Number(v.step);
  return { min, max, step: Number.isFinite(step) && step > 0 ? step : 0 };
};
// capacidades/estado dos controles da câmera remota: campos conhecidos, tamanhos limitados
const cleanCamCaps = (caps = {}) => {
  const out = {};
  if (!caps || typeof caps !== 'object') return out;
  for (const k of CAM_CAPS) {
    const r = cleanRange(caps[k]);
    if (r) out[k] = r;
  }
  for (const k of CAM_MODES) {
    if (Array.isArray(caps[k])) out[k] = caps[k].filter((x) => typeof x === 'string').map((x) => clean(x, 24)).slice(0, 12);
  }
  if (typeof caps.torch === 'boolean') out.torch = caps.torch;
  return out;
};
const cleanCamCtl = (ctl = {}) => {
  const out = {};
  if (!ctl || typeof ctl !== 'object') return out;
  for (const k of CAM_CAPS) if (Number.isFinite(+ctl[k])) out[k] = +ctl[k];
  for (const k of CAM_MODES) if (typeof ctl[k] === 'string') out[k] = clean(ctl[k], 24);
  if (typeof ctl.torch === 'boolean') out.torch = ctl.torch;
  return out;
};
const cleanDevices = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .filter((d) => d && typeof d === 'object' && typeof d.id === 'string')
    .slice(0, 12)
    .map((d) => ({ id: clean(d.id, 120), label: clean(d.label, 60) }));
};
// únicos campos de estado que um participante pode publicar (evita lixo/memória ilimitada vindos de convidados)
const cleanState = (s = {}) => {
  const out = {};
  if (typeof s.name === 'string') out.name = clean(s.name);
  if (typeof s.camOn === 'boolean') out.camOn = s.camOn;
  if (typeof s.micOn === 'boolean') out.micOn = s.micOn;
  if (s.camStreamId === null || typeof s.camStreamId === 'string') out.camStreamId = s.camStreamId && clean(s.camStreamId, 80);
  if (s.screenStreamId === null || typeof s.screenStreamId === 'string') out.screenStreamId = s.screenStreamId && clean(s.screenStreamId, 80);
  // câmera remota (celular pelo QR /cam): só envia vídeo, o host não monta retorno nem mix-minus para ela
  if (typeof s.cam === 'boolean') out.cam = s.cam;
  if (s.camCaps && typeof s.camCaps === 'object') out.camCaps = cleanCamCaps(s.camCaps);
  if (s.camCtl && typeof s.camCtl === 'object') out.camCtl = cleanCamCtl(s.camCtl);
  if (Array.isArray(s.camVideoDevices)) out.camVideoDevices = cleanDevices(s.camVideoDevices);
  if (Array.isArray(s.camAudioDevices)) out.camAudioDevices = cleanDevices(s.camAudioDevices);
  if (typeof s.camVideoId === 'string') out.camVideoId = clean(s.camVideoId, 120);
  if (typeof s.camAudioId === 'string') out.camAudioId = clean(s.camAudioId, 120);
  return out;
};

export { cleanState, cleanCamCaps, cleanCamCtl, cleanDevices };

export class SignalingHub {
  constructor({ studioExists, outKey }) {
    this.rooms = new Map(); // roomId -> { host, clients: Map }
    this.studioExists = studioExists;
    this.outKey = outKey || (() => ''); // chave das saídas para OBS/vMix (links /out)
    setInterval(() => this.heartbeat(), 15000).unref();
  }

  room(id) {
    let r = this.rooms.get(id);
    if (!r) {
      r = { id, host: null, clients: new Map(), live: false };
      this.rooms.set(id, r);
    }
    return r;
  }

  send(client, msg) {
    if (client?.ws.readyState === 1) client.ws.send(JSON.stringify(msg));
  }

  handle(ws, { isLocal }) {
    const client = { id: randomUUID().slice(0, 8), ws, room: null, role: null, name: '', isLocal, alive: true, state: {} };
    ws.on('pong', () => (client.alive = true));
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      try {
        this.onMessage(client, msg);
      } catch (e) {
        console.error('[signal]', e);
      }
    });
    ws.on('close', () => this.leave(client));
    ws.on('error', () => {});
  }

  heartbeat() {
    for (const r of this.rooms.values()) {
      for (const c of r.clients.values()) {
        if (!c.alive) {
          c.ws.terminate();
          continue;
        }
        c.alive = false;
        try {
          c.ws.ping();
        } catch {}
      }
    }
  }

  publicInfo(c) {
    return { id: c.id, name: c.name, role: c.role, state: c.state, cohost: !!c.cohost };
  }

  // valida/sanitiza comandos de co-host (só operações de edição de cena)
  cleanCmd(cmd) {
    if (!cmd || typeof cmd !== 'object') return null;
    const LAYOUTS = ['grid', 'solo', 'leader', 'sidebar', 'pip', 'split'];
    switch (cmd.op) {
      case 'layout':
        return LAYOUTS.includes(cmd.layout) || /^c-[a-z0-9]{3,12}$/.test(String(cmd.layout)) ? { op: 'layout', layout: cmd.layout } : null;
      case 'stage':
        return cmd.id ? { op: 'stage', id: clean(cmd.id, 80), on: !!cmd.on } : null;
      case 'solo':
        return { op: 'solo', id: cmd.id ? clean(cmd.id, 80) : null };
      case 'banner':
        return cmd.id ? { op: 'banner', id: clean(cmd.id, 80) } : null;
      case 'scene': {
        const i = Number(cmd.index);
        return Number.isInteger(i) && i >= 0 && i < 6 ? { op: 'scene', index: i } : null;
      }
      case 'message':
        return cmd.id ? { op: 'message', id: clean(cmd.id, 140) } : null;
      case 'hide-banner':
        return { op: 'hide-banner' };
      case 'quick-banner': {
        const title = clean(cmd.title, 90);
        return title ? { op: 'quick-banner', title, subtitle: clean(cmd.subtitle, 120) } : null;
      }
      case 'mic':
        return cmd.to && ['mute', 'unmute-request'].includes(cmd.action) ? { op: 'mic', to: clean(cmd.to, 20), action: cmd.action } : null;
    }
    return null;
  }

  // comandos do controle remoto (celular via QR): mesa de corte completa. O host valida de novo antes de executar.
  cleanRemoteCmd(cmd) {
    if (!cmd || typeof cmd !== 'object') return null;
    const base = this.cleanCmd(cmd);
    if (base) return base;
    const id = cmd.id ? clean(cmd.id, 80) : null;
    switch (cmd.op) {
      case 'pvw':
        return id ? { op: 'pvw', id } : null;
      case 'cut-to':
        return id ? { op: 'cut-to', id } : null;
      case 'take':
        return { op: 'take', kind: cmd.kind === 'mix' ? 'mix' : 'cut' };
      case 'ftb':
        return { op: 'ftb', on: !!cmd.on };
      case 'switcher':
        return { op: 'switcher', on: !!cmd.on };
      case 'mute':
        return id ? { op: 'mute', id, on: !!cmd.on } : null;
      case 'director':
        return { op: 'director', on: !!cmd.on };
      case 'ducking':
        return { op: 'ducking', on: !!cmd.on };
      case 'media-play':
        return { op: 'media-play', id: id || undefined };
      case 'media-pause':
        return { op: 'media-pause', id: id || undefined };
      case 'media-step':
        return { op: 'media-step', dir: Number(cmd.dir) < 0 ? -1 : 1 };
      case 'media-seek':
        return { op: 'media-seek', id: id || undefined, time: Number(cmd.time) || 0 };
      case 'media-vol':
        return id ? { op: 'media-vol', id, vol: Math.max(0, Math.min(1, Number(cmd.vol) || 0)) } : null;
      case 'master-vol':
        return { op: 'master-vol', vol: Math.max(0, Math.min(1, Number(cmd.vol) || 0)) };
      case 'src-vol':
        return id ? { op: 'src-vol', id, vol: Math.max(0, Math.min(1, Number(cmd.vol) || 0)) } : null;
      case 'audio-solo':
        return id ? { op: 'audio-solo', id, on: !!cmd.on } : null;
      case 'clear-solo':
        return { op: 'clear-solo' };
      case 'mute-all':
        return { op: 'mute-all', on: !!cmd.on };
      case 'send': {
        const bus = /^[A-G]$/.test(String(cmd.bus || '')) ? cmd.bus : null;
        return id && bus ? { op: 'send', id, bus, on: !!cmd.on } : null;
      }
      case 'bus-mute': {
        const bus = /^[A-G]$/.test(String(cmd.bus || '')) ? cmd.bus : null;
        return bus ? { op: 'bus-mute', bus, on: !!cmd.on } : null;
      }
      case 'bus-level': {
        const bus = /^[A-G]$/.test(String(cmd.bus || '')) ? cmd.bus : null;
        const level = Math.max(0, Math.min(2, Number(cmd.level) || 0));
        return bus ? { op: 'bus-level', bus, level } : null;
      }
      case 'master-mute':
        return { op: 'master-mute', on: !!cmd.on };
      case 'dim':
        return { op: 'dim', on: !!cmd.on };
      case 'replay-buffer':
        return { op: 'replay-buffer' };
      case 'replay-trigger':
        return { op: 'replay-trigger', seconds: Math.max(1, Math.min(60, Number(cmd.seconds) || 10)) };
      case 'replay-stop':
        return { op: 'replay-stop' };
      case 'replay-pause':
        return { op: 'replay-pause' };
      case 'replay-play':
        return { op: 'replay-play' };
      case 'replay-speed':
        return { op: 'replay-speed', speed: Math.max(0.05, Math.min(2, Number(cmd.speed) || 0.5)) };
      case 'replay-auto-take':
        return { op: 'replay-auto-take', on: !!cmd.on };
    }
    return null;
  }

  remoteStats(r) {
    const rem = [...r.clients.values()].filter((x) => x.role === 'remote');
    return { type: 'remote-count', n: rem.length, viewers: rem.filter((x) => x.view).length, listeners: rem.filter((x) => x.audio).length };
  }

  onMessage(c, msg) {
    if (msg.type === 'join') return this.join(c, msg);
    if (!c.room) return;
    const r = this.rooms.get(c.room);
    if (!r) return;
    // saída (OBS/vMix) só negocia a conexão com o host
    if (c.role === 'output' && msg.type !== 'signal') return;
    // controle remoto só envia comandos, chat, sinal WebRTC e pede/para o vídeo ou áudio de prévia
    if (c.role === 'remote' && msg.type !== 'remote-cmd' && msg.type !== 'remote-view' && msg.type !== 'remote-audio' && msg.type !== 'chat' && msg.type !== 'signal') return;

    switch (msg.type) {
      case 'remote-audio': {
        c.audio = !!msg.on;
        if (r.host) this.send(r.host, { type: 'remote-audio', from: c.id, on: c.audio });
        break;
      }
      case 'signal': {
        const target = r.clients.get(msg.to);
        // estrela: só host <-> convidado/remoto
        if (!target || (c.role !== 'host' && target.role !== 'host')) return;
        this.send(target, { type: 'signal', from: c.id, data: msg.data });
        break;
      }
      case 'chat': {
        const text = clean(msg.text, 500);
        if (!text) return;
        // limite de 6 mensagens a cada 4 s por participante
        const now = Date.now();
        c.chatTimes = (c.chatTimes || []).filter((t) => now - t < 4000);
        if (c.chatTimes.length >= 6) return this.send(c, { type: 'error', code: 'rate', message: 'Muitas mensagens. Aguarde um instante.' });
        c.chatTimes.push(now);
        const out = { type: 'chat', id: randomUUID().slice(0, 8), from: c.id, name: c.name, role: c.role, text, ts: Date.now() };
        for (const other of r.clients.values()) this.send(other, out);
        break;
      }
      case 'state': {
        const st = cleanState(msg.state);
        if (st.name) c.name = st.name;
        c.state = { ...c.state, ...st, name: c.name };
        if (c.role === 'guest' && r.host) this.send(r.host, { type: 'guest-state', id: c.id, state: c.state });
        break;
      }
      case 'control': {
        // host -> convidado: mute, unmute-request, kick, stage
        if (c.role !== 'host') return;
        const target = r.clients.get(msg.to);
        if (!target) return;
        this.send(target, { type: 'control', action: clean(msg.action, 30), data: msg.data ?? null });
        if (msg.action === 'kick') setTimeout(() => target.ws.close(4001, 'kicked'), 300);
        break;
      }
      case 'studio-state': {
        // host -> todos: ao vivo, gravando, quem está no palco
        if (c.role !== 'host') return;
        r.live = !!msg.state?.live;
        r.studioState = msg.state || null;
        for (const other of r.clients.values()) {
          if (other !== c) this.send(other, { type: 'studio-state', state: msg.state });
        }
        break;
      }
      case 'set-cohost': {
        if (c.role !== 'host') return;
        const target = r.clients.get(msg.id);
        if (!target || target.role !== 'guest') return;
        const on = !!msg.on;
        target.cohost = on;
        if (target.key) {
          r.cohostKeys = r.cohostKeys || new Set();
          on ? r.cohostKeys.add(target.key) : r.cohostKeys.delete(target.key);
        }
        this.send(target, { type: 'role', cohost: on });
        if (on && r.cohostState) this.send(target, { type: 'cohost-state', state: r.cohostState });
        break;
      }
      case 'cohost-state': {
        if (c.role !== 'host') return;
        r.cohostState = msg.state || null;
        for (const o of r.clients.values()) if (o.cohost) this.send(o, { type: 'cohost-state', state: r.cohostState });
        break;
      }
      case 'remote-state': {
        if (c.role !== 'host') return;
        r.remoteState = msg.state || null;
        for (const o of r.clients.values()) if (o.role === 'remote') this.send(o, { type: 'remote-state', state: r.remoteState });
        break;
      }
      case 'remote-frame': {
        // quadro JPEG do programa: só vai a quem ligou o vídeo
        if (c.role !== 'host' || typeof msg.data !== 'string' || msg.data.length > 200000) return;
        for (const o of r.clients.values()) if (o.role === 'remote' && o.view) this.send(o, { type: 'remote-frame', data: msg.data });
        break;
      }
      case 'remote-view': {
        if (c.role !== 'remote') return;
        c.view = !!msg.on;
        if (r.host) this.send(r.host, this.remoteStats(r));
        break;
      }
      case 'remote-cmd': {
        if (c.role !== 'remote' || !r.host) return;
        const nowR = Date.now();
        c.cmdTimes = (c.cmdTimes || []).filter((t) => nowR - t < 1000);
        if (c.cmdTimes.length >= 30) return;
        c.cmdTimes.push(nowR);
        const rc = this.cleanRemoteCmd(msg.cmd);
        if (!rc) return;
        this.send(r.host, { type: 'remote-cmd', from: c.id, name: c.name, cmd: rc });
        break;
      }
      case 'cohost-cmd': {
        if (!c.cohost || !r.host) return;
        const now = Date.now();
        c.cmdTimes = (c.cmdTimes || []).filter((t) => now - t < 1000);
        if (c.cmdTimes.length >= 20) return;
        c.cmdTimes.push(now);
        const cmd = this.cleanCmd(msg.cmd);
        if (!cmd) return;
        this.send(r.host, { type: 'cohost-cmd', from: c.id, name: c.name, cmd });
        break;
      }
    }
  }

  join(c, msg) {
    if (c.room) return;
    const roomId = clean(msg.room, 64);
    if (!roomId || !this.studioExists(roomId)) {
      this.send(c, { type: 'error', code: 'no-studio', message: 'Estúdio não encontrado.' });
      c.ws.close(4004, 'no-studio');
      return;
    }
    const wantsHost = msg.role === 'host';
    const wantsOutput = msg.role === 'output';
    const wantsRemote = msg.role === 'remote';
    if (wantsHost && !c.isLocal) {
      this.send(c, { type: 'error', code: 'host-local-only', message: 'O estúdio só pode ser aberto no próprio PC (localhost).' });
      c.ws.close(4003, 'host-local-only');
      return;
    }
    // saída para OBS/vMix: livre neste PC; de outro computador só com a chave do link
    if (wantsOutput && !c.isLocal && clean(msg.key, 40) !== this.outKey(roomId)) {
      this.send(c, { type: 'error', code: 'bad-key', message: 'Link de saída inválido. Copie o link de novo no painel Sinais do estúdio.' });
      c.ws.close(4005, 'bad-key');
      return;
    }
    // controle remoto: sempre exige a chave do link (mesmo na rede local), pois comanda a live
    if (wantsRemote && clean(msg.key, 40) !== this.outKey(roomId)) {
      this.send(c, { type: 'error', code: 'bad-key', message: 'Link do controle remoto inválido. Gere o QR de novo no painel Diretor do estúdio.' });
      c.ws.close(4005, 'bad-key');
      return;
    }
    const r = this.room(roomId);
    c.room = roomId;
    c.role = wantsHost ? 'host' : wantsOutput ? 'output' : wantsRemote ? 'remote' : 'guest';
    c.name = clean(msg.name) || (wantsHost ? 'Host' : wantsOutput ? 'Saída' : wantsRemote ? 'Controle' : 'Convidado');
    c.state = { ...cleanState(msg.state), name: c.name };
    if (wantsOutput) c.src = clean(msg.src, 100);
    if (!wantsHost && !wantsOutput && !wantsRemote) {
      c.key = clean(msg.key, 40);
      c.cohost = !!(c.key && r.cohostKeys?.has(c.key));
    }

    if (wantsHost && r.host && r.host !== c) {
      // novo host assume (ex.: recarregou a página)
      const old = r.host;
      this.send(old, { type: 'error', code: 'replaced', message: 'O estúdio foi aberto em outra janela.' });
      r.clients.delete(old.id);
      old.room = null;
      old.ws.close(4002, 'replaced');
    }

    r.clients.set(c.id, c);
    if (wantsHost) r.host = c;

    const guests = [...r.clients.values()].filter((x) => x.role === 'guest').map((x) => this.publicInfo(x));
    const outputs = [...r.clients.values()].filter((x) => x.role === 'output').map((x) => ({ id: x.id, src: x.src }));
    this.send(c, {
      type: 'welcome',
      id: c.id,
      role: c.role,
      hostId: r.host?.id ?? null,
      guests: wantsHost ? guests : [],
      outputs: wantsHost ? outputs : [],
      outKey: wantsHost ? this.outKey(roomId) : undefined,
      live: r.live,
      cohost: !!c.cohost,
    });
    if (c.cohost && r.cohostState) this.send(c, { type: 'cohost-state', state: r.cohostState });
    if (wantsRemote && r.remoteState) this.send(c, { type: 'remote-state', state: r.remoteState });

    if (wantsHost) {
      for (const g of r.clients.values()) if (g.role === 'guest' || g.role === 'output' || g.role === 'remote') this.send(g, { type: 'host-online', hostId: c.id });
      this.send(c, this.remoteStats(r));
    } else if (wantsRemote) {
      if (r.host) this.send(r.host, this.remoteStats(r));
    } else if (wantsOutput) {
      if (r.host) this.send(r.host, { type: 'output-joined', id: c.id, src: c.src });
    } else if (r.host) {
      this.send(r.host, { type: 'guest-joined', guest: this.publicInfo(c) });
      // quem (re)entra já recebe quem está no palco / se está ao vivo
      if (r.studioState) this.send(c, { type: 'studio-state', state: r.studioState });
    }
  }

  leave(c) {
    if (!c.room) return;
    const r = this.rooms.get(c.room);
    c.room = null;
    if (!r) return;
    r.clients.delete(c.id);
    if (r.host === c) {
      r.host = null;
      r.live = false;
      r.studioState = null;
      r.remoteState = null;
      for (const g of r.clients.values()) this.send(g, { type: 'host-offline' });
    } else if (r.host) {
      this.send(r.host, c.role === 'output' ? { type: 'output-left', id: c.id } : c.role === 'remote' ? this.remoteStats(r) : { type: 'guest-left', id: c.id });
    }
    if (r.clients.size === 0) this.rooms.delete(r.id);
  }

  roomStats() {
    return [...this.rooms.values()].map((r) => ({ id: r.id, hostOnline: !!r.host, participants: r.clients.size, live: r.live }));
  }
}
