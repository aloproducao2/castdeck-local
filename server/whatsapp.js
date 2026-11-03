// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Bridge local do WhatsApp (experimental): conecta como WhatsApp Web via Baileys, sem API oficial e sem
// enviar mensagens automaticamente. O host lê o QR, escolhe o que vai à fila e nada entra no ar sozinho.
// Isolado do resto do estúdio: se o WhatsApp cair, a live continua.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pino from 'pino';

const MAX_MESSAGES = 300;
const MAX_TEXT = 1000;
const MAX_NAME = 80;
const AUTH_DIR = 'whatsapp-auth';
const LOG = pino({ level: process.env.CASTDECK_WA_LOG || 'silent' });

const now = () => Date.now();
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

function unwrap(m) {
  let x = m?.message;
  for (let i = 0; i < 4 && x; i++) {
    x = x.ephemeralMessage?.message || x.viewOnceMessage?.message || x.viewOnceMessageV2?.message || x.documentWithCaptionMessage?.message || x;
    if (!x?.ephemeralMessage && !x?.viewOnceMessage && !x?.viewOnceMessageV2 && !x?.documentWithCaptionMessage) break;
  }
  return x || {};
}

function contentOf(m) {
  const x = unwrap(m);
  if (x.conversation) return { kind: 'text', text: x.conversation };
  if (x.extendedTextMessage?.text) return { kind: 'text', text: x.extendedTextMessage.text };
  if (x.imageMessage) return { kind: 'image', text: x.imageMessage.caption || '' };
  if (x.videoMessage) return { kind: 'video', text: x.videoMessage.caption || '' };
  if (x.audioMessage) return { kind: 'audio', text: '' };
  if (x.documentMessage) return { kind: 'document', text: x.documentMessage.fileName || x.documentMessage.caption || '' };
  if (x.stickerMessage) return { kind: 'sticker', text: '' };
  return { kind: 'unsupported', text: '' };
}

function isGroup(jid) {
  return typeof jid === 'string' && jid.endsWith('@g.us');
}

export class WhatsAppService {
  constructor({ dataDir }) {
    this.dataDir = path.join(dataDir, 'whatsapp');
    this.authDir = path.join(this.dataDir, AUTH_DIR);
    this.mediaDir = path.join(this.dataDir, 'media');
    this.file = path.join(this.dataDir, 'messages.jsonl');
    this.status = 'off';
    this.qr = null;
    this.error = null;
    this.account = null;
    this.messages = [];
    this.seen = new Set();
    this.chats = new Map();
    this.sock = null;
    this.userClosed = false;
    this.reconnectTimer = null;
    this.startedAt = null;
    this.retries = 0;
    this.hadQr = false;
    this.everOpened = false;
    this.sockToken = 0;
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true }).catch(() => {});
    await fs.mkdir(this.mediaDir, { recursive: true }).catch(() => {});
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      for (const line of raw.split('\n').filter(Boolean).slice(-MAX_MESSAGES)) {
        try {
          const m = JSON.parse(line);
          if (m?.id) {
            this.messages.push(m);
            this.seen.add(m.id);
          }
        } catch {}
      }
      this.messages.sort((a, b) => b.at - a.at);
    } catch {}
  }

  info() {
    return {
      status: this.status,
      qr: this.qr,
      error: this.error,
      account: this.account,
      chats: [...this.chats.values()],
      messages: this.messages.map(({ mediaFile, ...m }) => ({
        ...m,
        mediaUrl: mediaFile ? `/api/whatsapp/media/${encodeURIComponent(m.id)}` : undefined,
      })),
      startedAt: this.startedAt,
      experimental: true,
    };
  }

  media(id) {
    const m = this.messages.find((x) => x.id === id);
    if (!m?.mediaFile) return null;
    const file = path.resolve(this.mediaDir, m.mediaFile);
    if (!file.startsWith(path.resolve(this.mediaDir) + path.sep)) return null;
    return { file, mime: m.mediaMime || 'application/octet-stream' };
  }

  async append(m) {
    try {
      await fs.appendFile(this.file, JSON.stringify(m) + '\n', 'utf8');
    } catch {}
  }

  add(msg) {
    if (!msg?.id || this.seen.has(msg.id)) return;
    this.seen.add(msg.id);
    this.messages.unshift(msg);
    if (this.messages.length > MAX_MESSAGES) {
      for (const old of this.messages.splice(MAX_MESSAGES)) this.seen.delete(old.id);
    }
    const c = this.chats.get(msg.chatId) || { id: msg.chatId, name: msg.chatName || msg.name, group: msg.group, at: 0, unread: 0 };
    c.name = msg.chatName || c.name || msg.name;
    c.group = msg.group;
    c.at = msg.at;
    c.unread = (c.unread || 0) + 1;
    this.chats.set(msg.chatId, c);
    this.append(msg);
    return msg;
  }

  setStatus(s, error = null) {
    this.status = s;
    if (error !== undefined) this.error = error;
    if (s !== 'qr') this.qr = null;
  }

  async ingestMessage(m) {
    if (!m?.message || m.key?.fromMe) return;
    const jid = m.key?.remoteJid;
    if (!jid || jid === 'status@broadcast') return;
    const content = contentOf(m);
    if (!content.text && content.kind === 'unsupported') return;
    const group = isGroup(jid);
    const chat = this.chats.get(jid);
    const chatName = group ? (m.chatName || chat?.name || jid.split('@')[0]) : m.pushName || chat?.name || jid.split('@')[0];
    let mediaFile = null;
    let mediaMime = null;
    let dur = 0;
    if (content.kind === 'audio') {
      const audio = unwrap(m).audioMessage;
      const declared = String(audio?.mimetype || 'audio/ogg').split(';')[0].toLowerCase();
      mediaMime = /^audio\/(ogg|mpeg|mp4|wav|webm|aac|m4a)$/.test(declared) ? declared : 'audio/ogg';
      dur = Number(audio?.seconds || 0);
      const size = Number(audio?.fileLength || 0);
      if ((!size || size <= 20 * 1024 * 1024) && this.downloadMedia) {
        try {
          const buf = await this.downloadMedia(m, 'buffer', {}, { logger: LOG, reuploadRequest: this.sock?.updateMediaMessage });
          if (buf?.length && buf.length <= 20 * 1024 * 1024) {
            const ext = mediaMime.includes('mpeg') ? 'mp3' : mediaMime.includes('mp4') ? 'm4a' : mediaMime.includes('wav') ? 'wav' : 'ogg';
            mediaFile = `${crypto.randomUUID()}.${ext}`;
            await fs.writeFile(path.join(this.mediaDir, mediaFile), buf);
          }
        } catch (e) {
          LOG.debug?.('audio download: ' + (e?.message || e));
        }
      }
    }
    this.add({
      id: String(m.key.id || '').slice(0, 120),
      chatId: jid,
      chatName: clean(chatName, MAX_NAME),
      name: clean(m.pushName || chatName, MAX_NAME),
      group,
      kind: content.kind,
      text: clean(content.text, MAX_TEXT),
      at: (Number(m.messageTimestamp) || now() / 1000) * 1000,
      audio: content.kind === 'audio',
      dur: Math.max(0, Math.min(600, dur)),
      ...(mediaFile ? { mediaFile, mediaMime } : {}),
    });
  }

  scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    const delay = Math.min(8000, 1200 * Math.min(5, 2 ** this.retries));
    this.retries += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.startSocket().catch(() => {});
    }, delay);
  }

  async startSocket() {
    const token = ++this.sockToken;
    this.sock = null;
    this.hadQr = false;
    this.setStatus('connecting', null);
    this.startedAt ||= now();
    try {
      const mod = await import('@whiskeysockets/baileys');
      const { makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason, downloadMediaMessage } = mod;
      this.downloadMedia = downloadMediaMessage;
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      const sock = makeWASocket({
        auth: state,
        logger: LOG,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('CastDeck Local'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });
      this.sock = sock;
      this.DisconnectReason = DisconnectReason;

      const current = () => this.sockToken === token && this.sock === sock;
      sock.ev.on('creds.update', (creds) => {
        if (current()) saveCreds(creds).catch(() => {});
      });
      sock.ev.on('connection.update', (u) => {
        if (!current()) return;
        if (u.qr) {
          this.hadQr = true;
          this.qr = u.qr;
          this.setStatus('qr', null);
        }
        if (u.connection === 'open') {
          this.everOpened = true;
          this.retries = 0;
          this.setStatus('connected', null);
          this.account = {
            name: clean(sock.user?.name || sock.user?.verifiedName || '', MAX_NAME),
            phone: clean(String(sock.user?.id || '').split(':')[0].split('@')[0], 30),
          };
        }
        if (u.connection === 'close') {
          const code = u.lastDisconnect?.error?.output?.statusCode;
          const loggedOut = code === DisconnectReason?.loggedOut;
          this.sock = null;
          this.account = null;
          if (this.userClosed) {
            this.setStatus('off', null);
          } else if (loggedOut) {
            this.setStatus('logged-out', 'Sessão encerrada. Gere um novo QR Code.');
          } else {
            // Antes de ver QR/conectar, um "close" é só o baileys tentando outra rota: reconecta em silêncio.
            this.setStatus('connecting', this.everOpened || this.hadQr ? 'Conexão caiu; tentando reconectar…' : null);
            this.scheduleReconnect();
          }
        }
      });

      sock.ev.on('messages.upsert', ({ messages }) => {
        if (!current()) return;
        for (const m of messages || []) {
          this.ingestMessage(m).catch((e) => LOG.debug?.('ingest: ' + (e?.message || e)));
        }
      });

      sock.ev.on('contacts.upsert', (contacts) => {
        if (!current()) return;
        for (const c of contacts || []) {
          const jid = c.id;
          if (!jid) continue;
          const cur = this.chats.get(jid) || { id: jid, name: c.notify || c.name || jid.split('@')[0], group: false, at: 0, unread: 0 };
          cur.name = c.name || c.notify || cur.name;
          this.chats.set(jid, cur);
        }
      });
      sock.ev.on('chats.upsert', (chats) => {
        if (!current()) return;
        for (const c of chats || []) {
          if (!c.id) continue;
          const cur = this.chats.get(c.id) || { id: c.id, name: c.name || c.id.split('@')[0], group: isGroup(c.id), at: 0, unread: 0 };
          cur.name = c.name || cur.name;
          cur.group = isGroup(c.id);
          this.chats.set(c.id, cur);
        }
      });
    } catch (e) {
      if (this.sockToken === token) {
        this.sock = null;
        this.setStatus('error', 'Falha ao iniciar o bridge: ' + (e.message || e.name));
        if (!this.userClosed) this.scheduleReconnect();
      }
      throw e;
    }
    return this.info();
  }

  async connect() {
    if (this.sock || this.status === 'connecting' || this.status === 'qr') return this.info();
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.retries = 0;
    this.userClosed = false;
    return this.startSocket();
  }

  async disconnect() {
    this.userClosed = true;
    this.sockToken += 1;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.retries = 0;
    const sock = this.sock;
    this.sock = null;
    if (sock) {
      try {
        await sock.end(undefined);
      } catch {}
    }
    this.account = null;
    this.setStatus('off', null);
    return this.info();
  }

  async logout() {
    this.userClosed = true;
    this.sockToken += 1;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.retries = 0;
    const sock = this.sock;
    this.sock = null;
    try {
      await sock?.logout();
    } catch {}
    await fs.rm(this.authDir, { recursive: true, force: true }).catch(() => {});
    this.account = null;
    this.setStatus('off', 'Sessão removida. Gere um novo QR Code para conectar outro número.');
    return this.info();
  }

  async clear() {
    this.messages = [];
    this.seen.clear();
    this.chats.clear();
    await fs.rm(this.file, { force: true }).catch(() => {});
    await fs.rm(this.mediaDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(this.mediaDir, { recursive: true }).catch(() => {});
    return this.info();
  }
}
