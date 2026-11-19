// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Central de Redes Sociais: agrega chat ao vivo de múltiplas plataformas (YouTube, Twitch e outras) simultaneamente,
// com zero consumo de cota de API e comunicação bidirecional para moderação destacada.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { findBrowser } from './dsk.js';

const IS_WIN = process.platform === 'win32';

function killTree(p) {
  if (!p || p.exitCode !== null) return;
  try {
    if (IS_WIN && p.pid) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
    else {
      if (p.pid) try { spawnSync('pkill', ['-KILL', '-P', String(p.pid)], { stdio: 'ignore', timeout: 3000 }); } catch {}
      p.kill('SIGKILL');
    }
  } catch {}
}

export function extractYoutubeVideoId(input = '') {
  input = String(input || '').trim();
  const m1 = input.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (m1) return m1[1];
  const m2 = input.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (m2) return m2[1];
  const m3 = input.match(/youtube\.com\/(?:live|shorts|embed)\/([a-zA-Z0-9_-]{11})/);
  if (m3) return m3[1];
  const m4 = input.match(/studio\.youtube\.com\/video\/([a-zA-Z0-9_-]{11})/i);
  if (m4) return m4[1];
  const m5 = input.match(/youtube\.com\/live_chat\?.*v=([a-zA-Z0-9_-]{11})/i);
  if (m5) return m5[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  return null;
}

export async function resolveYoutubeChannelLive(input = '') {
  const m = String(input || '').trim().match(/youtube\.com\/(@[^/?#]+|channel\/[^/?#]+|c\/[^/?#]+|user\/[^/?#]+)(?:\/live)?/i);
  if (!m) return null;
  try {
    const res = await fetch(`https://www.youtube.com/${m[1]}/live`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    const finalVid = extractYoutubeVideoId(res.url);
    if (finalVid) return finalVid;
    const html = await res.text();
    const c1 = html.match(/rel=["']canonical["'][^>]*href=["'][^"']*watch\?v=([a-zA-Z0-9_-]{11})/i)
      || html.match(/live_chat\?[^"'\s]*v=([a-zA-Z0-9_-]{11})/i);
    if (c1) return c1[1];
    if (html.includes('"isLive":true') || html.includes('"isLiveNow":true')) {
      const c2 = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
      return c2 ? c2[1] : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function cleanTwitchChannel(input = '') {
  input = String(input || '').trim();
  const m = input.match(/twitch\.tv\/([a-zA-Z0-9_]{3,25})/i);
  if (m) return m[1].toLowerCase();
  const clean = input.replace(/^[#@]/, '').trim().toLowerCase();
  return /^[a-zA-Z0-9_]{3,25}$/.test(clean) ? clean : null;
}

const INJECTED_SCRAPER_JS = `(() => {
  if (window.__cd_yt_injected) return;
  window.__cd_yt_injected = true;

  const seen = new Set();
  let switchedMode = false;
  let activeObserver = null;
  let activeList = null;
  let watchdogTimer = null;
  let lastStatus = '';

  function extractChatHtml(node) {
    if (!node) return '';
    let out = '';
    const kids = (node.childNodes && node.childNodes.length) ? node.childNodes : (node.shadowRoot ? node.shadowRoot.childNodes : []);
    for (const child of kids) {
      if (child.nodeType === 3) {
        out += child.textContent;
      } else if (child.nodeName === 'IMG') {
        const src = child.getAttribute('src') || '';
        const alt = child.getAttribute('alt') || child.getAttribute('shared-tooltip-text') || '';
        if (/^https?:/i.test(src)) {
          out += '<img class="emoji" src="' + src + '" alt="' + (alt || 'emoji').replace(/"/g, '&quot;') + '" referrerpolicy="no-referrer">';
        } else if (alt) {
          out += alt;
        }
      } else {
        out += extractChatHtml(child);
      }
    }
    return out.trim();
  }

  function emitStatus(status, detail = '') {
    const sig = status + '|' + detail;
    if (sig === lastStatus) return;
    lastStatus = sig;
    let tries = 0;
    const send = () => {
      if (typeof window.__castdeck_social_status === 'function') {
        window.__castdeck_social_status(JSON.stringify({ status, detail }));
      } else if (tries++ < 25) {
        setTimeout(send, 100);
      }
    };
    send();
  }

  function emitMessage(data) {
    if (!data) return;
    let tries = 0;
    const send = () => {
      if (typeof window.__castdeck_social_message === 'function') {
        window.__castdeck_social_message(JSON.stringify(data));
      } else if (tries++ < 30) {
        setTimeout(send, 100);
      }
    };
    send();
  }

  function acceptConsentIfNeeded() {
    try {
      const btn = document.querySelector('button[aria-label*="Accept"], button[aria-label*="Aceitar"], form[action*="consent"] button[type="submit"], form[action*="consent"] button');
      if (btn) {
        btn.click();
        return true;
      }
    } catch {}
    return false;
  }

  function trySwitchLiveChat() {
    if (switchedMode) return;
    try {
      const hdr = document.querySelector('yt-live-chat-header-renderer');
      if (!hdr) return;
      const items = document.querySelectorAll('yt-sort-filter-sub-menu-renderer tp-yt-paper-listbox a, yt-sort-filter-sub-menu-renderer a.yt-simple-endpoint');
      if (items.length >= 2) {
        switchedMode = true;
        const second = items[1];
        const selected = second.getAttribute('aria-selected') === 'true' || second.classList.contains('iron-selected');
        if (!selected) second.click();
      }
    } catch {}
  }

  function processItem(item, retryCount = 0) {
    if (!item || !item.tagName) return;
    const tag = item.tagName.toLowerCase();
    const id = item.getAttribute('id') || item.id || (tag + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7));
    if (seen.has(id)) return;

    let author = '';
    let avatar = '';
    let text = '';
    let donation = '';
    let membership = '';
    let nameColor = '';

    if (tag === 'yt-live-chat-text-message-renderer') {
      author = item.querySelector('#author-name')?.textContent?.trim() || '';
      avatar = item.querySelector('#author-photo img')?.src || '';
      text = extractChatHtml(item.querySelector('#message'));
      nameColor = item.querySelector('#author-name')?.style?.color || '';
      if (!text && retryCount < 4) {
        setTimeout(() => processItem(item, retryCount + 1), 80);
        return;
      }
    } else if (tag === 'yt-live-chat-paid-message-renderer') {
      author = item.querySelector('#author-name')?.textContent?.trim() || '';
      avatar = item.querySelector('#author-photo img')?.src || '';
      donation = item.querySelector('#purchase-amount')?.textContent?.trim() || 'Super Chat';
      text = extractChatHtml(item.querySelector('#message'));
    } else if (tag === 'yt-live-chat-membership-item-renderer') {
      author = item.querySelector('#author-name')?.textContent?.trim() || '';
      avatar = item.querySelector('#author-photo img')?.src || '';
      membership = item.querySelector('#header-subtext')?.textContent?.trim() || item.querySelector('#header-primary-text')?.textContent?.trim() || 'Novo Membro';
      text = extractChatHtml(item.querySelector('#message'));
    } else if (tag === 'yt-live-chat-paid-sticker-renderer') {
      author = item.querySelector('#author-name')?.textContent?.trim() || '';
      avatar = item.querySelector('#author-photo img')?.src || '';
      donation = item.querySelector('#purchase-amount-chip')?.textContent?.trim() || 'Super Sticker';
      const stickerImg = item.querySelector('#sticker img')?.src || '';
      text = stickerImg ? '<img class="emoji" src="' + stickerImg + '" alt="Super Sticker" referrerpolicy="no-referrer">' : '🖼️ [Super Sticker]';
    } else if (tag.includes('sponsorship') || tag.includes('gift')) {
      author = item.querySelector('#author-name, .author-name')?.textContent?.trim() || 'Canal';
      avatar = item.querySelector('#author-photo img, img')?.src || '';
      membership = extractChatHtml(item.querySelector('#header-content, #primary-text') || item);
    } else {
      return;
    }

    if (!author && !text && !donation && !membership) {
      if (retryCount < 4) {
        setTimeout(() => processItem(item, retryCount + 1), 80);
      }
      return;
    }

    seen.add(id);
    if (seen.size > 2000) seen.delete(seen.values().next().value);

    emitMessage({
      id,
      chatname: author,
      chatmessage: text,
      chatimg: avatar,
      nameColor,
      hasDonation: donation,
      membership,
      type: 'youtube',
      timestamp: Date.now()
    });
  }

  function handleAddedNode(n) {
    if (!n || n.nodeType !== 1) return;
    const tag = n.tagName ? n.tagName.toLowerCase() : '';
    if (tag.startsWith('yt-live-chat-')) {
      processItem(n);
    } else if (n.querySelectorAll) {
      const nested = n.querySelectorAll('yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer, yt-live-chat-paid-sticker-renderer');
      for (const el of nested) processItem(el);
    }
  }

  function attach() {
    acceptConsentIfNeeded();
    const unavailable = document.querySelector('yt-live-chat-unavailable-message-renderer');
    const list = document.querySelector('yt-live-chat-item-list-renderer #items, #items.yt-live-chat-item-list-renderer, #item-scroller > #item-offset > #items');
    if (!list) {
      const bodyTxt = document.body?.innerText || '';
      if (unavailable || /chat (is )?disabled|chat est[aá] desativado|live chat is not available|bate-papo ao vivo n[aã]o est[aá] dispon[ií]vel|o chat está desativado/i.test(bodyTxt)) {
        emitStatus('error', 'Chat ao vivo indisponível ou desativado neste vídeo.');
        return;
      }
      setTimeout(attach, 500);
      return;
    }

    if (activeObserver) {
      try { activeObserver.disconnect(); } catch {}
      activeObserver = null;
    }
    activeList = list;
    emitStatus('connected', '');
    trySwitchLiveChat();

    const children = list.children;
    for (let i = Math.max(0, children.length - 25); i < children.length; i++) {
      processItem(children[i]);
    }
    activeObserver = new MutationObserver((mutations) => {
      trySwitchLiveChat();
      for (const m of mutations) {
        for (const n of m.addedNodes) handleAddedNode(n);
      }
    });
    activeObserver.observe(list, { childList: true });

    if (!watchdogTimer) {
      watchdogTimer = setInterval(() => {
        try {
          trySwitchLiveChat();
          const scroller = document.querySelector('#item-scroller');
          if (scroller) scroller.scrollTop = scroller.scrollHeight;
          if (activeList && !activeList.isConnected) {
            if (activeObserver) { try { activeObserver.disconnect(); } catch {} activeObserver = null; }
            activeList = null;
            attach();
          }
        } catch {}
      }, 2500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();`;

// ---------------------------------------------------------------------
// Cliente Twitch IRC WebSocket (zero cota, sem chave, leve e instantâneo)
// ---------------------------------------------------------------------
class TwitchChatClient extends EventEmitter {
  constructor(channel, sourceId) {
    super();
    this.channel = channel.toLowerCase();
    this.sourceId = sourceId;
    this.ws = null;
    this.status = 'idle';
    this.error = null;
    this.closed = false;
    this.timer = null;
  }

  connect() {
    this.closed = false;
    this.status = 'connecting';
    this.error = null;

    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    this.ws = ws;

    ws.on('open', () => {
      if (this.ws !== ws) return;
      this.status = 'connected';
      this.emit('status', { status: 'connected', error: null });
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send('NICK justinfan' + Math.floor(Math.random() * 90000 + 10000));
      ws.send(`JOIN #${this.channel}`);
    });

    ws.on('message', (data) => {
      if (this.ws !== ws) return;
      const lines = data.toString().split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        if (line.startsWith('PING')) {
          try { ws.send('PONG :tmi.twitch.tv'); } catch {}
          continue;
        }
        if (line.includes(' PRIVMSG ')) {
          const msg = this.parseMessage(line);
          if (msg) this.emit('message', msg);
        }
      }
    });

    ws.on('error', (err) => {
      if (this.ws !== ws) return;
      this.error = err.message;
      this.emit('status', { status: 'error', error: err.message });
    });

    ws.on('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.closed) {
        this.status = 'connecting';
        this.emit('status', { status: 'connecting', error: null });
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.connect(), 4000);
      } else {
        this.status = 'idle';
        this.emit('status', { status: 'idle', error: null });
      }
    });
  }

  parseTwitchEmotes(text, emotesTag) {
    if (!emotesTag || !text) return text;
    const replacements = [];
    const entries = emotesTag.split('/');
    for (const entry of entries) {
      const colon = entry.indexOf(':');
      if (colon === -1) continue;
      const emoteId = entry.slice(0, colon);
      const ranges = entry.slice(colon + 1).split(',');
      for (const r of ranges) {
        const [startStr, endStr] = r.split('-');
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end) && end >= start) {
          replacements.push({ emoteId, start, end });
        }
      }
    }
    if (!replacements.length) return text;
    replacements.sort((a, b) => b.start - a.start);
    let res = text;
    for (const rep of replacements) {
      const emoteName = res.slice(rep.start, rep.end + 1);
      const imgHtml = `<img class="emoji twitch-emote" src="https://static-cdn.jtvnw.net/emoticons/v2/${rep.emoteId}/default/dark/1.0" alt="${emoteName}" referrerpolicy="no-referrer">`;
      res = res.slice(0, rep.start) + imgHtml + res.slice(rep.end + 1);
    }
    return res;
  }

  parseMessage(line) {
    const parts = line.split(' PRIVMSG ');
    if (parts.length < 2) return null;
    const pre = parts[0];
    const post = parts[1];
    const colonIdx = post.indexOf(' :');
    if (colonIdx === -1) return null;
    const text = post.slice(colonIdx + 2).trim();
    if (!text) return null;

    let name = '';
    let color = '';
    let bits = '';
    let isSub = false;
    let isMod = false;
    let isVip = false;
    let chatMsg = text;

    if (pre.startsWith('@')) {
      const tagStr = pre.slice(1).split(' :')[0];
      const tags = {};
      for (const t of tagStr.split(';')) {
        const eq = t.indexOf('=');
        if (eq > 0) tags[t.slice(0, eq)] = t.slice(eq + 1);
      }
      name = tags['display-name'] || '';
      color = tags['color'] || '';
      if (tags['bits']) bits = `${tags['bits']} Bits`;
      if (tags['badges']) {
        if (tags['badges'].includes('subscriber')) isSub = true;
        if (tags['badges'].includes('moderator')) isMod = true;
        if (tags['badges'].includes('vip')) isVip = true;
      }
      if (tags['emotes']) {
        chatMsg = this.parseTwitchEmotes(text, tags['emotes']);
      }
    }
    if (!name) {
      const m = pre.match(/:(\w+)!/);
      if (m) name = m[1];
    }

    return {
      id: `tw:${this.channel}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
      chatname: name || 'Anônimo',
      chatmessage: chatMsg,
      chatimg: '',
      nameColor: color,
      hasDonation: bits,
      membership: isSub ? 'Inscrito' : (isMod ? 'Moderador' : (isVip ? 'VIP' : '')),
      type: 'twitch',
      timestamp: Date.now(),
      sourceId: this.sourceId,
    };
  }

  close() {
    this.closed = true;
    clearTimeout(this.timer);
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.status = 'idle';
  }
}

// ---------------------------------------------------------------------
// Central de Redes Sociais (SocialHub)
// ---------------------------------------------------------------------
export class SocialHub extends EventEmitter {
  constructor(dataDir) {
    super();
    this.dataDir = dataDir;
    this.profileDir = null;
    this.proc = null;
    this.ws = null;
    this.cdpMsgId = 1;
    this.pending = new Map();
    this.clients = new Set();
    this.sources = new Map(); // id -> { id, type, target, label, status, error, count, targetId, sessionId, client }
    this.currentFeatured = null;
    this.queue = [];
    this.history = [];
    this.autoSequence = false;
    this.autoDur = 8;
  }

  recordMessage(msg) {
    if (!msg || !msg.id) return;
    if (this.history.some((m) => m.id === msg.id)) return;
    this.history.push(msg);
    if (this.history.length > 250) this.history.shift();
  }

  handleClient(ws) {
    this.clients.add(ws);
    ws.on('error', () => {});
    ws.on('close', () => this.clients.delete(ws));
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'get-state') {
          ws.send(JSON.stringify({
            type: 'state',
            sources: this.listSources(),
            featured: this.currentFeatured,
            queue: this.queue,
            history: this.history,
            autoSequence: this.autoSequence,
            autoDur: this.autoDur,
          }));
        } else if (msg.type === 'feature') {
          this.featureMessage(msg.message);
        } else if (msg.type === 'hide') {
          this.hideMessage();
        } else if (msg.type === 'chat') {
          if (msg.message) this.recordMessage(msg.message);
          this.broadcast(msg);
        } else if (msg.type === 'queue-add') {
          this.addToQueue(msg.message);
        } else if (msg.type === 'queue-remove') {
          this.removeFromQueue(msg.id);
        } else if (msg.type === 'queue-clear') {
          this.clearQueue();
        } else if (msg.type === 'auto-config') {
          this.setAutoConfig(msg);
        } else if (msg.type === 'next-sequence') {
          this.broadcast(msg);
        } else if (msg.type === 'clear-source') {
          if (this.currentFeatured && (this.currentFeatured.sourceId === msg.sourceId || (!this.currentFeatured.sourceId && this.currentFeatured.type === msg.sourceType))) {
            this.hideMessage();
          }
          this.queue = this.queue.filter((m) => !((msg.sourceId && m.sourceId === msg.sourceId) || (!m.sourceId && msg.sourceType && m.type === msg.sourceType)));
          this.history = this.history.filter((m) => !((msg.sourceId && m.sourceId === msg.sourceId) || (!m.sourceId && msg.sourceType && m.type === msg.sourceType)));
          this.broadcast({ type: 'queue-update', queue: this.queue });
          this.broadcast(msg);
        } else if (msg.type === 'clear-all') {
          this.clearAllMessages();
        }
      } catch {}
    });

    // Envia estado inicial ao conectar
    ws.send(JSON.stringify({
      type: 'state',
      sources: this.listSources(),
      featured: this.currentFeatured,
      queue: this.queue,
      history: this.history,
      autoSequence: this.autoSequence,
      autoDur: this.autoDur,
    }));
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(data); } catch {}
      }
    }
  }

  addToQueue(message) {
    if (!message || !message.id) return;
    const idx = this.queue.findIndex((m) => m.id === message.id);
    if (idx === -1) {
      this.queue.push(message);
    } else {
      this.queue[idx] = message;
    }
    if (this.queue.length > 200) this.queue.shift();
    this.broadcast({ type: 'queue-update', queue: this.queue });
  }

  removeFromQueue(id) {
    const idx = this.queue.findIndex((m) => m.id === id);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      this.broadcast({ type: 'queue-update', queue: this.queue });
    }
  }

  clearQueue() {
    this.queue = [];
    this.broadcast({ type: 'queue-update', queue: [] });
  }

  setAutoConfig({ autoSequence, autoDur }) {
    if (typeof autoSequence === 'boolean') this.autoSequence = autoSequence;
    if (typeof autoDur === 'number') this.autoDur = Math.max(2, Math.min(60, autoDur));
    this.broadcast({
      type: 'auto-config',
      autoSequence: this.autoSequence,
      autoDur: this.autoDur,
    });
  }

  featureMessage(msg) {
    this.currentFeatured = msg || null;
    this.emit('featured', this.currentFeatured);
    this.broadcast({ type: 'featured', message: this.currentFeatured });
  }

  hideMessage() {
    this.currentFeatured = null;
    this.emit('featured', null);
    this.broadcast({ type: 'featured', message: null });
  }

  clearAllMessages() {
    this.queue = [];
    this.history = [];
    this.hideMessage();
    this.broadcast({ type: 'queue-update', queue: [] });
    this.broadcast({ type: 'clear-all' });
  }

  listSources() {
    return Array.from(this.sources.values()).map((s) => ({
      id: s.id,
      type: s.type,
      target: s.target,
      label: s.label,
      status: s.status,
      error: s.error || null,
      count: s.count || 0,
    }));
  }

  // Compatibilidade com a rota antiga /api/social/youtube
  info() {
    const yt = Array.from(this.sources.values()).find((s) => s.type === 'youtube');
    return {
      status: yt?.status || 'idle',
      error: yt?.error || null,
      url: yt ? `https://www.youtube.com/live_chat?v=${yt.target}` : null,
      videoId: yt?.target || null,
      sources: this.listSources(),
    };
  }

  // ---------- Gerenciamento CDP do Chromium Headless (YouTube) ----------
  sendCdp(method, params = {}, sessionId = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('CDP desconectado'));
    const id = this.cdpMsgId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout em ${method}`));
        }
      }, 15000);
    });
  }

  async ensureBrowser() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    const exe = findBrowser();
    if (!exe) throw new Error('Nenhum navegador Chromium (Edge/Chrome/Brave) encontrado para capturar o chat.');

    this.profileDir = mkdtempSync(path.join(os.tmpdir(), 'cd-soc-'));

    const args = [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-features=Translate,OptimizationHints,MediaRouter',
      `--user-data-dir=${this.profileDir}`,
      '--remote-debugging-port=0',
      '--window-size=500,700',
      'about:blank',
    ];

    const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    this.proc = proc;

    proc.on('exit', () => {
      if (this.proc === proc) {
        this.proc = null;
        for (const s of this.sources.values()) {
          if (s.type === 'youtube' && s.status === 'connected') {
            s.status = 'idle';
          }
        }
        this.broadcast({ type: 'sources', sources: this.listSources() });
      }
      if (this.profileDir) {
        const dir = this.profileDir;
        this.profileDir = null;
        setTimeout(() => {
          try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch {}
        }, 1000);
      }
    });

    const wsUrl = await new Promise((resolve, reject) => {
      let buf = '';
      let done = false;
      const fail = (e) => {
        if (done) return;
        done = true;
        reject(e);
      };
      const t = setTimeout(() => fail(new Error('O navegador não respondeu ao iniciar o chat.')), 10000);

      proc.stderr.on('error', () => {});
      proc.stderr.on('data', (chunk) => {
        if (done) return;
        buf += chunk.toString();
        const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
        if (m) {
          done = true;
          clearTimeout(t);
          resolve(m[1]);
        }
      });
      proc.on('error', (e) => (clearTimeout(t), fail(e)));
      proc.on('exit', (code) => {
        clearTimeout(t);
        if (!done) fail(new Error(`Navegador encerrou prematuramente (código ${code})`));
      });
    });

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message || 'CDP erro'));
          else p.resolve(msg.result);
          return;
        }
        if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__castdeck_social_message') {
          try {
            const data = JSON.parse(msg.params.payload);
            const source = Array.from(this.sources.values()).find((s) => s.sessionId === msg.sessionId) || Array.from(this.sources.values()).find((s) => s.type === 'youtube');
            if (source) {
              source.count = (source.count || 0) + 1;
              data.sourceId = source.id;
            }
            this.recordMessage(data);
            this.emit('message', data);
            this.broadcast({ type: 'chat', message: data, sourceCount: source?.count });
          } catch {}
        } else if (msg.method === 'Runtime.bindingCalled' && msg.params?.name === '__castdeck_social_status') {
          try {
            const info = JSON.parse(msg.params.payload);
            const source = Array.from(this.sources.values()).find((s) => s.sessionId === msg.sessionId) || Array.from(this.sources.values()).find((s) => s.type === 'youtube');
            if (source) {
              clearTimeout(source._fallbackTimer);
              source.status = info.status === 'error' ? 'error' : 'connected';
              source.error = info.status === 'error' ? (info.detail || 'Erro ao carregar o chat ao vivo.') : null;
              this.broadcast({ type: 'sources', sources: this.listSources() });
            }
          } catch {}
        }
      } catch {}
    });
  }

  // ---------- Adicionar e remover fontes simultâneas ----------
  async addSource({ type, target }) {
    type = String(type || '').toLowerCase();
    target = String(target || '').trim();

    if (type === 'youtube') {
      const vid = extractYoutubeVideoId(target) || (await resolveYoutubeChannelLive(target));
      if (!vid) throw new Error('Link do YouTube inválido ou nenhuma transmissão ao vivo ativa encontrada.');
      const id = `yt:${vid}`;
      if (this.sources.has(id)) return this.sources.get(id);

      const source = {
        id,
        type: 'youtube',
        target: vid,
        label: `YouTube (${vid})`,
        status: 'connecting',
        error: null,
        count: 0,
      };
      this.sources.set(id, source);
      this.broadcast({ type: 'sources', sources: this.listSources() });

      try {
        await this.ensureBrowser();
        const { targetId } = await this.sendCdp('Target.createTarget', { url: 'about:blank', newWindow: true });
        source.targetId = targetId;

        const { sessionId } = await this.sendCdp('Target.attachToTarget', { targetId, flatten: true });
        source.sessionId = sessionId;

        await this.sendCdp('Page.enable', {}, sessionId);
        await this.sendCdp('Runtime.enable', {}, sessionId);
        await this.sendCdp('Network.setUserAgentOverride', {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        }, sessionId);
        await this.sendCdp('Runtime.addBinding', { name: '__castdeck_social_message' }, sessionId);
        await this.sendCdp('Runtime.addBinding', { name: '__castdeck_social_status' }, sessionId);
        await this.sendCdp('Page.addScriptToEvaluateOnNewDocument', { source: INJECTED_SCRAPER_JS }, sessionId);
        await this.sendCdp('Page.navigate', { url: `https://www.youtube.com/live_chat?is_popout=1&v=${vid}` }, sessionId);

        source._fallbackTimer = setTimeout(() => {
          if (this.sources.get(id) === source && source.status === 'connecting') {
            source.status = 'connected';
            this.broadcast({ type: 'sources', sources: this.listSources() });
          }
        }, 6000);
        console.log(`[social-hub] canal YouTube conectado: v=${vid}`);
        return source;
      } catch (e) {
        clearTimeout(source._fallbackTimer);
        source.status = 'error';
        source.error = e.message;
        console.error(`[social-hub] erro no YouTube v=${vid}:`, e.message);
        this.broadcast({ type: 'sources', sources: this.listSources() });
        throw e;
      }
    } else if (type === 'twitch') {
      const channel = cleanTwitchChannel(target);
      if (!channel) throw new Error('Nome do canal da Twitch inválido.');
      const id = `tw:${channel}`;
      if (this.sources.has(id)) return this.sources.get(id);

      const client = new TwitchChatClient(channel, id);
      const source = {
        id,
        type: 'twitch',
        target: channel,
        label: `Twitch (#${channel})`,
        status: 'connecting',
        error: null,
        count: 0,
        client,
      };
      this.sources.set(id, source);
      this.broadcast({ type: 'sources', sources: this.listSources() });

      client.on('message', (msg) => {
        source.count = (source.count || 0) + 1;
        this.recordMessage(msg);
        this.emit('message', msg);
        this.broadcast({ type: 'chat', message: msg, sourceCount: source.count });
      });

      client.on('status', ({ status, error }) => {
        source.status = status;
        source.error = error;
        this.broadcast({ type: 'sources', sources: this.listSources() });
      });

      client.connect();
      return source;
    } else {
      throw new Error(`Plataforma não suportada: ${type}`);
    }
  }

  async removeSource(id) {
    const s = this.sources.get(id);
    if (!s) return false;
    clearTimeout(s._fallbackTimer);
    this.sources.delete(id);

    if (s.type === 'youtube') {
      if (s.targetId && this.ws && this.ws.readyState === WebSocket.OPEN) {
        try { await this.sendCdp('Target.closeTarget', { targetId: s.targetId }); } catch {}
      }
      // Se não sobrou nenhum YouTube, fecha o navegador para liberar memória
      const hasYt = Array.from(this.sources.values()).some((x) => x.type === 'youtube');
      if (!hasYt) this.closeBrowser();
    } else if (s.type === 'twitch') {
      s.client?.close();
    }

    // Se a mensagem destacada no ar pertencer a essa rede, retira do ar
    if (this.currentFeatured && (this.currentFeatured.sourceId === id || (!this.currentFeatured.sourceId && this.currentFeatured.type === s.type))) {
      this.hideMessage();
    }

    // Remove mensagens da fonte removida da fila e do histórico do servidor
    this.queue = this.queue.filter((m) => !((id && m.sourceId === id) || (!m.sourceId && s.type && m.type === s.type)));
    this.history = this.history.filter((m) => !((id && m.sourceId === id) || (!m.sourceId && s.type && m.type === s.type)));
    this.broadcast({ type: 'queue-update', queue: this.queue });

    // Notifica todos os clientes para apagarem as mensagens da rede removida
    this.broadcast({ type: 'clear-source', sourceId: id, sourceType: s.type });
    this.broadcast({ type: 'sources', sources: this.listSources() });
    return true;
  }

  async reconnectSource(id) {
    const s = this.sources.get(id);
    if (!s) throw new Error('Fonte não encontrada.');
    const { type, target } = s;
    await this.removeSource(id);
    return this.addSource({ type, target });
  }

  closeBrowser() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.proc) {
      killTree(this.proc);
      this.proc = null;
    }
  }

  // Atalhos de retrocompatibilidade
  async start({ url, videoId }) {
    return this.addSource({ type: 'youtube', target: videoId || url });
  }

  async stop() {
    for (const [id, s] of Array.from(this.sources.entries())) {
      if (s.type === 'youtube') await this.removeSource(id);
    }
    return this.info();
  }

  async stopAll() {
    for (const id of Array.from(this.sources.keys())) {
      await this.removeSource(id);
    }
    this.closeBrowser();
  }
}

// Aliases para compatibilidade
export const SocialScraper = SocialHub;
