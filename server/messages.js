// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Mensagens do público pelo celular: um QR Code no vídeo abre /msg/<estúdio>, onde o espectador
// manda um texto curto ou um áudio. Mesmo modelo da votação (polls.js): o estúdio (navegador do host)
// publica a "caixa de mensagens" a cada ~1,5 s (POST /api/studios/:id/msgs) e leva as que chegaram.
// Nada fica gravado em disco: a fila vive só na memória e é entregue ao estúdio na próxima sincronização.
import crypto from 'node:crypto';

const STALE_MS = 8000; // sem notícias do estúdio por esse tempo = caixa fechada
const MAX_TEXT = 200;
const MAX_NAME = 30;
const MAX_AUDIO_SEC = 30;
const MAX_AUDIO_B64 = 1_200_000; // ~880 KB de áudio (30 s de Opus cabem com folga)
const COOLDOWN_MS = 8000; // um envio a cada 8 s por aparelho
const MAX_PER_IP = 60; // por sessão da caixa (várias pessoas na mesma rede/NAT)
const MAX_QUEUE = 300;
const AUDIO_HEAD = /^data:audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)(;[\w=.-]+)*;base64,/i;

// remove caracteres de controle e espaços repetidos (o texto vai para a tela da live)
const cleanText = (s, n) =>
  String(s ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, n);

// confere o data URL do áudio sem regex sobre o corpo inteiro (strings grandes)
function validAudio(a) {
  if (typeof a !== 'string' || a.length > MAX_AUDIO_B64) return false;
  const m = AUDIO_HEAD.exec(a.slice(0, 120));
  if (!m) return false;
  for (let i = m[0].length; i < a.length; i++) {
    const c = a.charCodeAt(i);
    const ok = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 43 || c === 47 || c === 61;
    if (!ok) return false;
  }
  return a.length - m[0].length > 200;
}

export class MsgHub {
  constructor() {
    this.rooms = new Map();
  }
  room(id) {
    let r = this.rooms.get(id);
    if (!r) this.rooms.set(id, (r = { box: null, at: 0, session: '', senders: new Map(), ips: new Map(), queue: [] }));
    return r;
  }
  live(r) {
    return r?.box && Date.now() - r.at < STALE_MS ? r.box : null;
  }

  // estúdio → servidor: publica a caixa (ou null) e leva as mensagens pendentes
  sync(id, box) {
    const r = this.room(id);
    if (!box || typeof box !== 'object' || !box.session) {
      r.box = null;
      r.queue = [];
      return [];
    }
    const session = String(box.session).slice(0, 40);
    if (r.session !== session) {
      // nova sessão (o host reabriu o recebimento): libera todo mundo de novo
      r.session = session;
      r.senders.clear();
      r.ips.clear();
      r.queue = [];
    }
    r.box = {
      session,
      open: !!box.open,
      title: cleanText(box.title, 80) || 'Mande sua mensagem',
      audio: box.audio !== false,
      maxSec: MAX_AUDIO_SEC,
      maxText: MAX_TEXT,
    };
    r.at = Date.now();
    const out = r.queue;
    r.queue = [];
    return out;
  }

  // página pública: o que mostrar
  view(id) {
    const b = this.live(this.rooms.get(id));
    return b ? { ...b } : null;
  }

  send(id, body, ip) {
    const r = this.rooms.get(id);
    const b = this.live(r);
    if (!b || !b.open) return { status: 409, error: 'O recebimento de mensagens está fechado agora.' };
    if (String(body?.session || '') !== b.session) return { status: 409, error: 'A caixa de mensagens mudou. Atualize a página.' };
    const sender = String(body?.sender || '').replace(/[^\w-]/g, '').slice(0, 64);
    if (sender.length < 8) return { status: 400, error: 'Identificação inválida.' };
    const now = Date.now();
    const last = r.senders.get(sender) || 0;
    if (now - last < COOLDOWN_MS) return { status: 429, error: `Aguarde ${Math.ceil((COOLDOWN_MS - (now - last)) / 1000)} s para mandar outra.`, wait: COOLDOWN_MS - (now - last) };
    const text = cleanText(body?.text, MAX_TEXT);
    const name = cleanText(body?.name, MAX_NAME).replace(/\n/g, ' ');
    let audio = null;
    let dur = 0;
    if (body?.audio) {
      if (!b.audio) return { status: 400, error: 'Esta transmissão não está aceitando áudio.' };
      if (!validAudio(body.audio)) return { status: 400, error: 'Áudio inválido ou grande demais.' };
      dur = Math.max(0, Math.min(MAX_AUDIO_SEC + 1, Number(body.dur) || 0));
      audio = body.audio;
    }
    if (!text && !audio) return { status: 400, error: 'Escreva uma mensagem ou grave um áudio.' };
    const n = r.ips.get(ip) || 0;
    if (n >= MAX_PER_IP) return { status: 429, error: 'Muitas mensagens vindas desta rede.' };
    if (r.queue.length >= MAX_QUEUE) return { status: 503, error: 'Muitas mensagens ao mesmo tempo, tente de novo.' };
    r.ips.set(ip, n + 1);
    r.senders.set(sender, now);
    r.queue.push({ id: crypto.randomUUID().slice(0, 12), sender, name, text, audio, dur, at: now });
    return { status: 200, ok: true, wait: COOLDOWN_MS };
  }
}
