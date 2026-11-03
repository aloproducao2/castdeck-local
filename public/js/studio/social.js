// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Integração com o Social Stream Ninja (https://socialstream.ninja, código aberto).
// O SSN agrega o chat de Twitch, YouTube, Kick, Facebook, TikTok etc. (via extensão/app) e republica no servidor de API
// (wss://io.socialstream.ninja) numa "sessão". Aqui o CastDeck entra na sessão como um overlay (igual ao featured.html do SSN):
//   - canal 2 → a mensagem que você DESTACA no dock do SSN (e o "limpar")
//   - canal 4 → todas as mensagens do chat (precisa do toggle "Send chat messages to API server" no SSN)
// Protocolo (estudado no featured.html/api.md do SSN): abrir WebSocket e enviar {"join": SESSAO, "out": 3, "in": CANAL}.
// As mensagens chegam como JSON {chatname, chatmessage, chatimg, type, nameColor, hasDonation, membership, contentimg, event...},
// às vezes embrulhadas em {overlayNinja: …}, {content: …} ou {action:"content", value:"<json>"}; "false" significa limpar.

export const SSN_DEFAULT_SERVER = 'wss://io.socialstream.ninja';

export function cleanSession(s) {
  return String(s ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}

export function normalizeServer(s) {
  s = String(s || '').trim();
  if (!s) return SSN_DEFAULT_SERVER;
  if (/^https:\/\//i.test(s)) s = 'wss://' + s.slice(8);
  else if (/^http:\/\//i.test(s)) s = 'ws://' + s.slice(7);
  else if (!/^wss?:\/\//i.test(s)) s = 'wss://' + s;
  return s.replace(/\/+$/, '');
}

// Mapeamento de emoticons clássicos em texto
const EMOTICONS = {
  ':)': '1f60a',
  ':-)': '1f60a',
  '(:': '1f60a',
  ':D': '1f600',
  ':-D': '1f600',
  ';)': '1f609',
  ';-)': '1f609',
  '<3': '2764',
  ':P': '1f61b',
  ':-P': '1f61b',
  ':p': '1f61b',
  ':-p': '1f61b',
  ':(': '1f641',
  ':-(': '1f641',
  '):': '1f641',
  ':O': '1f62e',
  ':-O': '1f62e',
  ':o': '1f62e',
  ':-o': '1f62e',
  ':|': '1f610',
  ':-|': '1f610',
  'B)': '1f60e',
  'B-)': '1f60e',
  'XD': '1f606',
  'xd': '1f606',
  ':/': '1f615',
  ':-/': '1f615',
  ":'(": '1f622',
  ":'-(": '1f622',
};

// Shortcodes populares de chat
const POPULAR_SHORTCODES = {
  fire: '1f525',
  heart: '2764',
  clap: '1f44f',
  thumbsup: '1f44d',
  100: '1f4af',
  star: '2b50',
  joy: '1f602',
  rofl: '1f923',
  smile: '1f604',
  wink: '1f609',
  sunglasses: '1f60e',
  cry: '1f622',
  sob: '1f62d',
  eyes: '1f440',
  rocket: '1f680',
  tada: '1f389',
  party: '1f389',
  check: '2705',
  crown: '1f451',
  sparkles: '2728',
  brasil: '1f1e7-1f1f7',
  brazil: '1f1e7-1f1f7',
  eua: '1f1fa-1f1f8',
  usa: '1f1fa-1f1f8',
  portugal: '1f1f5-1f1f9',
  argentina: '1f1e6-1f1f7',
  espanha: '1f1ea-1f1f8',
  spain: '1f1ea-1f1f8',
  japao: '1f1ef-1f1f5',
  japan: '1f1ef-1f1f5',
  italia: '1f1ee-1f1f9',
  italy: '1f1ee-1f1f9',
  franca: '1f1eb-1f1f7',
  france: '1f1eb-1f1f7',
  alemanha: '1f1e9-1f1ea',
  germany: '1f1e9-1f1ea',
  uk: '1f1ec-1f1e7',
};

// Converte qualquer código ISO de país de 2 letras (br, us, pt, etc.) para os codepoints de bandeira
function countryCodeToFlagHex(cc) {
  cc = String(cc || '').toLowerCase();
  if (!/^[a-z]{2}$/.test(cc)) return null;
  const a = 0x1F1E6;
  const c1 = (a + cc.charCodeAt(0) - 97).toString(16);
  const c2 = (a + cc.charCodeAt(1) - 97).toString(16);
  return `${c1}-${c2}`;
}

function toCodePoints(unicodeSurrogates) {
  const points = [];
  let p = 0;
  let c = 0;
  let i = 0;
  while (i < unicodeSurrogates.length) {
    c = unicodeSurrogates.charCodeAt(i++);
    if (p) {
      points.push((0x10000 + ((p - 0xD800) << 10) + (c - 0xDC00)).toString(16));
      p = 0;
    } else if (0xD800 <= c && c <= 0xDBFF) {
      p = c;
    } else {
      points.push(c.toString(16));
    }
  }
  return points;
}

function emojiToHex(rawText) {
  return toCodePoints(rawText.indexOf('\u200D') < 0 ? rawText.replace(/\uFE0F/g, '') : rawText).join('-');
}

export function twemojiUrl(hex) {
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/${hex}.png`;
}

// Analisa texto bruto para encontrar bandeiras Unicode, emojis, shortcodes e emoticons
export function parseEmojiAndEmoticons(text) {
  if (!text) return [];
  const tokens = [];
  let lastIndex = 0;

  // Regex para bandeiras (pares de indicadores regionais U+1F1E6-U+1F1FF ou subdivisões), emojis Unicode e :shortcodes:
  const combinedRegex = /(?:[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[\u{E0060}-\u{E007F}]+|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*|:([a-zA-Z0-9_-]+):)/gu;

  let match;
  while ((match = combinedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const slice = text.slice(lastIndex, match.index);
      tokens.push(...parseTextEmoticons(slice));
    }

    const matchedStr = match[0];
    const shortcode = match[1];

    if (shortcode) {
      const sc = shortcode.toLowerCase();
      let hex = null;
      if (sc.startsWith('flag-') || sc.startsWith('flag_')) {
        hex = countryCodeToFlagHex(sc.slice(5));
      } else if (/^[a-z]{2}$/.test(sc)) {
        hex = countryCodeToFlagHex(sc);
      }
      if (!hex && POPULAR_SHORTCODES[sc]) {
        hex = POPULAR_SHORTCODES[sc];
      }

      if (hex) {
        tokens.push({ t: 'img', src: twemojiUrl(hex), alt: matchedStr });
      } else {
        tokens.push({ t: 'text', v: matchedStr });
      }
    } else {
      const hex = emojiToHex(matchedStr);
      tokens.push({ t: 'img', src: twemojiUrl(hex), alt: matchedStr });
    }

    lastIndex = match.index + matchedStr.length;
  }

  if (lastIndex < text.length) {
    const slice = text.slice(lastIndex);
    tokens.push(...parseTextEmoticons(slice));
  }

  return tokens;
}

function parseTextEmoticons(text) {
  const parts = text.split(/(\s+)/);
  const out = [];
  for (const part of parts) {
    if (!part) continue;
    const clean = part.trim();
    if (EMOTICONS[clean]) {
      const hex = EMOTICONS[clean];
      out.push({ t: 'img', src: twemojiUrl(hex), alt: clean });
    } else {
      out.push({ t: 'text', v: part });
    }
  }
  return out;
}

export function renderMessageHtml(tokens) {
  if (!tokens || !tokens.length) return '';
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return tokens.map((t) => {
    if (t.t === 'img') {
      return `<img class="emoji" src="${esc(t.src)}" alt="${esc(t.alt || '')}" referrerpolicy="no-referrer">`;
    }
    return esc(t.v);
  }).join('');
}

// A mensagem pode vir com HTML (emotes como <img>). Converte em tokens {t:'text'|'img'} e resolve bandeiras e emoticons.
export function tokenize(html) {
  if (typeof DOMParser === 'undefined') {
    const out = [];
    const parts = String(html ?? '').split(/(<img[^>]*>|<br\s*\/?>)/i);
    for (const part of parts) {
      if (!part) continue;
      if (/^<br/i.test(part)) {
        out.push({ t: 'text', v: ' ' });
      } else if (/^<img/i.test(part)) {
        const srcMatch = part.match(/src=["']([^"']+)["']/i);
        const altMatch = part.match(/alt=["']([^"']+)["']/i);
        const src = srcMatch ? srcMatch[1] : '';
        const alt = altMatch ? altMatch[1] : '';
        if (/^(https?:|data:image\/)/i.test(src)) {
          out.push({ t: 'img', src, alt: alt || 'emoji' });
        } else if (alt) {
          out.push(...parseEmojiAndEmoticons(alt));
        }
      } else {
        const clean = part.replace(/<[^>]*>/g, '');
        out.push(...parseEmojiAndEmoticons(clean));
      }
    }
    return out;
  }
  const doc = new DOMParser().parseFromString('<body>' + String(html ?? '') + '</body>', 'text/html');
  const out = [];
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) {
        if (c.textContent) {
          out.push(...parseEmojiAndEmoticons(c.textContent));
        }
      } else if (c.nodeName === 'IMG') {
        const src = c.getAttribute('src') || '';
        const alt = c.getAttribute('alt') || '';
        if (/^(https?:|data:image\/)/i.test(src)) {
          out.push({ t: 'img', src, alt: alt || 'emoji' });
        } else if (alt) {
          out.push(...parseEmojiAndEmoticons(alt));
        }
      } else if (c.nodeName === 'BR') {
        out.push({ t: 'text', v: ' ' });
      } else if (!/^(SCRIPT|STYLE)$/.test(c.nodeName)) {
        walk(c);
      }
    }
  };
  walk(doc.body);
  return out;
}

let seq = 0;

// Converte qualquer formato aceito numa mensagem uniforme. Retorna:
//   null            → ignorar
//   { clear: true } → limpar o destaque
//   { id, name, text, tokens, avatar, type, color, donation, membership, event, img, ts }
export function normalizeMessage(raw) {
  let d = raw;
  if (d && typeof d === 'object' && 'overlayNinja' in d) d = d.overlayNinja;
  if (d && typeof d === 'object' && 'content' in d && !('chatmessage' in d) && !('chatname' in d)) d = d.content;
  if (d && typeof d === 'object' && d.action === 'content') {
    try {
      d = d.value ? (typeof d.value === 'string' ? JSON.parse(d.value) : d.value) : false;
    } catch {
      return null;
    }
  }
  if (d && typeof d === 'object' && d.contents) d = d.contents;
  if (d === false || d === null || d === 'false') return { clear: true };
  if (typeof d !== 'object') return null;
  if (d.action && !d.chatmessage && !d.chatname) return /^(clear|clearOverlay)$/i.test(d.action) ? { clear: true } : null;
  if (!d.chatname && !d.chatmessage && !d.contentimg && !d.hasDonation && !d.donation && !d.author && !d.text) return null;
  const name = d.chatname || d.author || 'Anônimo';
  const textRaw = d.chatmessage ?? d.text ?? d.textContent ?? '';
  const tokens = tokenize(textRaw);
  const text = tokens.map((t) => (t.t === 'img' ? (t.alt || ' ') : t.v)).join('').replace(/\s+/g, ' ').trim();
  const strip = (v) => (v == null ? '' : String(v).replace(/<[^>]*>/g, '').trim());
  const avatarUrl = d.chatimg || d.avatar || '';
  return {
    id: String(d.id ?? d.messageId ?? `${d.type || 'x'}:${name}:${text.slice(0, 40)}:${Date.now()}:${seq++}`),
    name: strip(name),
    text,
    tokens,
    avatar: typeof avatarUrl === 'string' && /^https?:/i.test(avatarUrl) ? avatarUrl : '',
    type: d.type ? String(d.type).toLowerCase() : 'youtube',
    sourceId: d.sourceId ? String(d.sourceId) : '',
    color: typeof d.nameColor === 'string' && /^#[0-9a-f]{3,8}$/i.test(d.nameColor) ? d.nameColor : '',
    donation: strip(d.hasDonation || d.donation),
    membership: strip(d.membership || d.hasMembership),
    event: d.event ? String(d.event) : '',
    img: typeof d.contentimg === 'string' && /^https?:/i.test(d.contentimg) ? d.contentimg : '',
    ts: d.timestamp || Date.now(),
  };
}

// Cliente WebSocket com reconexão automática.
export class SSNClient {
  constructor({ server, session, channel, onMessage, onStatus }) {
    this.server = normalizeServer(server);
    this.session = cleanSession(session);
    this.channel = channel;
    this.onMessage = onMessage;
    this.onStatus = onStatus || (() => {});
    this.ws = null;
    this.tries = 0;
    this.closed = false;
    this.lastAt = 0;
  }
  connect() {
    if (!this.session) return this.onStatus('idle');
    this.closed = false;
    this.onStatus(this.tries ? 'reconnecting' : 'connecting');
    let ws;
    try {
      ws = new WebSocket(this.server);
    } catch {
      this.onStatus('error');
      return this._retry();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      ws.send(JSON.stringify({ join: this.session, out: 3, in: this.channel }));
      this.onStatus('online');
    };
    ws.onmessage = (ev) => {
      if (!ev.data) return;
      let data = ev.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      this.lastAt = Date.now();
      this.onMessage?.(data);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.closed) {
        this.onStatus('reconnecting');
        this._retry();
      }
    };
  }
  _retry() {
    clearTimeout(this._t);
    this.tries++;
    this._t = setTimeout(() => !this.closed && this.connect(), Math.min(15000, 500 * this.tries ** 1.5));
  }
  close() {
    this.closed = true;
    clearTimeout(this._t);
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {}
    this.onStatus('idle');
  }
}
