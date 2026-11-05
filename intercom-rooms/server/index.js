// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// CastDeck Intercom: salas públicas, sem login, áudio-only.
//
// Este servidor é independente do estúdio local do CastDeck. Ele cria salas efêmeras,
// valida tokens de host/convidado e faz apenas o signaling WebRTC (SDP/ICE).
// A mídia continua ponto a ponto; não há gravação nem relay de áudio aqui.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const here = (() => { try { return path.dirname(fileURLToPath(import.meta.url)); } catch { return process.cwd(); } })();
const PUBLIC = process.env.INTERCOM_PUBLIC || path.join(here, '..', 'public');
const BASE = (process.env.INTERCOM_BASE || '/intercom').replace(/\/+$/, '');
const PORT = Number(process.env.PORT || 3210);
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS || 6 * 60 * 60 * 1000);
const HOST_GRACE_MS = Number(process.env.HOST_GRACE_MS || 5 * 60 * 1000);
const MAX_PARTICIPANTS = 8;
const RESERVED = new Set(['host', 'api', 'ws', 'index', 'new', 'room', 'favicon', 'css', 'js', 'assets']);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '16kb' }));

const rooms = new Map();
const rate = new Map();

const clean = (s, n = 80) => String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const randomToken = (n = 24) => crypto.randomBytes(n).toString('hex');
const randId = (len = 8) => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
};
const same = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const normRoom = (s) => clean(s, 24).toLowerCase();
const validCustom = (id) => /^[a-z0-9-]{4,24}$/.test(id) && !RESERVED.has(id);

function allow(key, max, windowMs) {
  const now = Date.now();
  const list = (rate.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length >= max) return false;
  list.push(now);
  rate.set(key, list);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rate) {
    const live = v.filter((t) => now - t < 60 * 60 * 1000);
    if (live.length) rate.set(k, live);
    else rate.delete(k);
  }
}, 10 * 60 * 1000).unref();

function passwordRecord(password) {
  if (!password) return null;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}
function checkPassword(room, password) {
  if (!room.password) return true;
  if (typeof password !== 'string' || !password) return false;
  const salt = Buffer.from(room.password.salt, 'hex');
  const want = Buffer.from(room.password.hash, 'hex');
  const got = crypto.scryptSync(password, salt, 32);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function roomUrl(req, room, role) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`).split(',')[0].trim();
  const origin = `${proto}://${host}${BASE}`;
  if (role === 'host') return `${origin}/host/${room.id}#k=${room.hostToken}`;
  return `${origin}/${room.id}#t=${room.guestToken}`;
}

function publicRoom(room) {
  return {
    roomId: room.id,
    name: room.name,
    maxParticipants: room.maxParticipants,
    hasPassword: !!room.password,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    hostOnline: !!room.host,
    participants: room.clients.size,
  };
}
function guestInfo(c) {
  return { id: c.id, name: c.name, role: 'guest', state: c.state };
}
function send(ws, msg) {
  try {
    if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
  } catch {}
}
function broadcast(room, msg, except) {
  for (const c of room.clients.values()) if (c.ws !== except) send(c.ws, msg);
  if (except !== room.host?.ws) send(room.host?.ws, msg);
}

function endRoom(room, reason) {
  if (!room || room.ended) return;
  room.ended = true;
  clearTimeout(room.ttlTimer);
  clearTimeout(room.emptyTimer);
  clearTimeout(room.hostTimer);
  broadcast(room, { type: 'room-ended', reason });
  for (const c of room.clients.values()) {
    c.room = null;
    try { c.ws.close(4001, reason); } catch {}
  }
  if (room.host) {
    room.host.room = null;
    try { room.host.ws.close(4001, reason); } catch {}
  }
  rooms.delete(room.id);
}

function scheduleEmpty(room) {
  clearTimeout(room.emptyTimer);
  if (room.clients.size || room.host) return;
  room.emptyTimer = setTimeout(() => endRoom(room, 'empty'), 5 * 60 * 1000);
  room.emptyTimer.unref?.();
}

function dropClient(c, code = 1000) {
  if (c.removed) return;
  c.removed = true;
  const room = c.room;
  if (!room) return;
  if (c.role === 'host') {
    room.host = null;
    clearTimeout(room.hostTimer);
    room.hostTimer = setTimeout(() => endRoom(room, 'host-timeout'), HOST_GRACE_MS);
    room.hostTimer.unref?.();
    broadcast(room, { type: 'host-offline' });
  } else {
    room.clients.delete(c.id);
    broadcast(room, { type: 'participant-left', id: c.id });
    scheduleEmpty(room);
  }
  c.room = null;
  try { c.ws.close(code); } catch {}
}

function roomCreate(req, res) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!allow(`create:${ip}`, 30, 60 * 60 * 1000)) return res.status(429).json({ error: 'rate', message: 'Muitas salas criadas. Tente novamente mais tarde.' });
  const custom = normRoom(req.body?.roomId || '');
  if (custom && !validCustom(custom)) return res.status(400).json({ error: 'bad-room', message: 'Use 4–24 caracteres: a-z, 0-9 ou hífen. Esse nome é reservado ou inválido.' });
  const password = typeof req.body?.password === 'string' ? req.body.password.slice(0, 64) : '';
  if (password && password.length < 3) return res.status(400).json({ error: 'bad-password', message: 'A senha precisa ter pelo menos 3 caracteres.' });
  let id = custom;
  if (!id) {
    do id = randId(8); while (rooms.has(id));
  } else if (rooms.has(id)) {
    return res.status(409).json({ error: 'room-exists', message: 'Já existe uma sala com esse nome. Escolha outro.' });
  }
  const now = Date.now();
  const room = {
    id,
    name: clean(req.body?.name || 'Intercom de produção', 40) || 'Intercom de produção',
    hostToken: randomToken(),
    guestToken: randomToken(),
    password: passwordRecord(password),
    maxParticipants: Math.max(2, Math.min(MAX_PARTICIPANTS, Number(req.body?.maxParticipants) || MAX_PARTICIPANTS)),
    createdAt: now,
    expiresAt: now + ROOM_TTL_MS,
    host: null,
    clients: new Map(),
    ended: false,
  };
  room.ttlTimer = setTimeout(() => endRoom(room, 'expired'), ROOM_TTL_MS);
  room.ttlTimer.unref?.();
  rooms.set(id, room);
  res.status(201).json({
    ...publicRoom(room),
    hostUrl: roomUrl(req, room, 'host'),
    guestUrl: roomUrl(req, room, 'guest'),
  });
}

app.get(`${BASE}/api/health`, (_req, res) => res.json({ ok: true, rooms: rooms.size, version: '0.1.0' }));

app.get(`${BASE}/api/ice`, async (req, res) => {
  const stun = String(process.env.ICE_STUN || 'stun:stun.cloudflare.com:3478,stun:stun.l.google.com:19302').split(',').map((s) => s.trim()).filter(Boolean);
  const iceServers = [{ urls: stun }];
  const turnUrl = process.env.TURN_URL;
  if (turnUrl) {
    const username = process.env.TURN_USERNAME || '';
    const credential = process.env.TURN_PASSWORD || '';
    iceServers.push({ urls: turnUrl.split(',').map((s) => s.trim()).filter(Boolean), username, credential });
  } else if (process.env.TURN_CREDS_URL) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 1800);
      const r = await fetch(process.env.TURN_CREDS_URL, { signal: ac.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j.iceServers)) iceServers.push(...j.iceServers);
      }
    } catch {}
  }
  res.set('Cache-Control', 'no-store').json({ iceServers });
});

app.post(`${BASE}/api/rooms`, roomCreate);

app.get(`${BASE}/api/rooms/:room`, (req, res) => {
  const room = rooms.get(normRoom(req.params.room));
  if (!room || room.ended) return res.status(404).json({ error: 'not-found', message: 'Sala não encontrada ou expirada.' });
  res.set('Cache-Control', 'no-store').json(publicRoom(room));
});

app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'microphone=(self)');
  next();
});

app.get(BASE || '/', (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get(`${BASE}/host/:room`, (_req, res) => res.sendFile(path.join(PUBLIC, 'host.html')));
app.get(`${BASE}/:room`, (req, res, next) => {
  const id = normRoom(req.params.room);
  if (!validCustom(id)) return next();
  res.sendFile(path.join(PUBLIC, 'room.html'));
});
app.use(BASE || '/', express.static(PUBLIC, { extensions: ['html'], maxAge: 0 }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: `${BASE}/ws`, maxPayload: 128 * 1024 });

wss.on('connection', (ws, req) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const client = { id: '', ws, room: null, role: '', name: '', state: { micOn: false, ptt: false }, origin: req.headers.origin || '', ip };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const fail = (code, message, closeCode = 4005) => {
    send(ws, { type: 'error', code, message });
    try { ws.close(closeCode, code); } catch {}
  };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (!client.room && msg.type === 'join') {
      if (!allow(`join:${client.ip}`, 45, 60 * 1000)) return fail('rate', 'Muitas tentativas. Aguarde um minuto.', 4007);
      const id = normRoom(msg.room);
      const room = rooms.get(id);
      if (!room || room.ended) return fail('not-found', 'Sala não encontrada ou expirada.', 4004);
      const role = msg.role === 'host' ? 'host' : msg.role === 'guest' ? 'guest' : '';
      if (!role) return fail('bad-role', 'Papel inválido.');
      if (role === 'host') {
        if (!same(msg.token, room.hostToken)) return fail('bad-token', 'Link de host inválido.');
        if (room.host) return fail('host-busy', 'O host já está conectado nesta sala.', 4009);
      } else {
        if (!same(msg.token, room.guestToken)) return fail('bad-token', 'Link de convidado inválido.');
        if (room.clients.size >= room.maxParticipants - 1) return fail('room-full', 'A sala está cheia.', 4008);
        if (room.password && !checkPassword(room, msg.password)) return fail('password', 'Senha incorreta ou ausente.', 4006);
      }
      clearTimeout(room.hostTimer);
      clearTimeout(room.emptyTimer);
      client.room = room;
      client.role = role;
      client.name = clean(msg.name || (role === 'host' ? 'Diretor' : 'Convidado'), 30) || (role === 'host' ? 'Diretor' : 'Convidado');
      client.id = randomToken(4);
      if (role === 'host') room.host = client;
      else room.clients.set(client.id, client);
      send(ws, {
        type: 'welcome',
        id: client.id,
        role,
        room: publicRoom(room),
        hostId: room.host?.id || null,
        guestUrl: role === 'host' ? roomUrl(req, room, 'guest') : undefined,
        hostUrl: role === 'host' ? roomUrl(req, room, 'host') : undefined,
        participants: [...room.clients.values()].map(guestInfo),
      });
      if (role === 'host') broadcast(room, { type: 'host-joined', id: client.id, name: client.name });
      else broadcast(room, { type: 'participant-joined', participant: guestInfo(client) }, ws);
      return;
    }
    if (!client.room) return;

    if (msg.type === 'signal') {
      const target = client.role === 'host' ? client.room.clients.get(clean(msg.to, 40)) : client.room.host;
      if (target?.ws) send(target.ws, { type: 'signal', from: client.id, data: msg.data });
      return;
    }
    if (msg.type === 'state') {
      const state = { micOn: !!msg.state?.micOn, ptt: !!msg.state?.ptt };
      client.state = state;
      const info = client.role === 'host' ? { id: client.id, name: client.name, role: 'host', state } : guestInfo(client);
      broadcast(client.room, { type: 'state', from: client.id, participant: info }, client.ws);
      return;
    }
    if (msg.type === 'control' && client.role === 'host') {
      const action = clean(msg.action, 20);
      if (action === 'end') return endRoom(client.room, 'host-ended');
      const target = client.room.clients.get(clean(msg.to, 40));
      if (!target) return;
      if (action === 'mute') {
        target.state = { ...target.state, micOn: false, ptt: false };
        send(target.ws, { type: 'control', action: 'mute' });
        broadcast(client.room, { type: 'state', from: target.id, participant: guestInfo(target) });
      } else if (action === 'remove') {
        send(target.ws, { type: 'control', action: 'remove', message: 'O host removeu você da sala.' });
        dropClient(target, 4001);
      }
      return;
    }
    if (msg.type === 'ping') send(ws, { type: 'pong' });
  });

  ws.on('close', () => { if (client.room) dropClient(client); });
  ws.on('error', () => {});
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30000).unref();

server.listen(PORT, () => {
  console.log(`CastDeck Intercom em http://localhost:${PORT}${BASE}/`);
  console.log(`WebSocket: ws://localhost:${PORT}${BASE}/ws`);
});
