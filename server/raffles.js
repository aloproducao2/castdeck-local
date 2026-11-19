// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Sorteio ao vivo pelo celular: quando o sorteio está aberto, /raffle/<estúdio> aceita inscrições
// e acompanha o resultado ao vivo. O navegador do host continua sendo a fonte da verdade.

const STALE_MS = 10000;
const MAX_PER_IP = 40;
const MAX_QUEUE = 5000;
const STATES = new Set(['ready', 'open', 'spinning', 'winner', 'closed']);

function clean(r) {
  return {
    id: String(r.id || '').slice(0, 40),
    round: Math.floor(Number(r.round) || 0),
    title: String(r.title ?? 'Sorteio ao vivo').slice(0, 120),
    keyword: String(r.keyword ?? '').slice(0, 32),
    state: STATES.has(r.state) ? r.state : 'ready',
    askContact: !!r.askContact,
    contactLabel: String(r.contactLabel ?? '@Instagram ou WhatsApp').slice(0, 40),
    count: Math.max(0, Math.floor(Number(r.count) || 0)),
    spinName: String(r.spinName ?? '').slice(0, 60),
    winner: r.winner && r.winner.name ? {
      name: String(r.winner.name).slice(0, 60),
      ticketNo: Number(r.winner.ticketNo) || 0,
      source: String(r.winner.source || 'QR').slice(0, 16),
    } : null,
  };
}

export class RaffleHub {
  constructor() {
    this.rooms = new Map();
  }

  room(id) {
    let r = this.rooms.get(id);
    if (!r) {
      r = { key: '', raffle: null, at: 0, entries: new Map(), ips: new Map(), queue: [], seq: 0 };
      this.rooms.set(id, r);
    }
    return r;
  }

  live(r) {
    return r?.raffle && Date.now() - r.at < STALE_MS ? r.raffle : null;
  }

  sync(id, raffle) {
    const r = this.room(id);
    if (!raffle || typeof raffle !== 'object' || !raffle.id) {
      r.raffle = null;
      r.queue = [];
      return [];
    }
    const cleanR = clean(raffle);
    const key = `${cleanR.id}:${cleanR.round}`;
    if (r.key !== key) {
      r.key = key;
      r.entries.clear();
      r.ips.clear();
      r.queue = [];
      r.seq = 0;
    }
    const out = r.queue;
    r.queue = [];
    r.raffle = cleanR;
    r.at = Date.now();
    return out;
  }

  view(id, participant) {
    const r = this.rooms.get(id);
    const rf = this.live(r);
    if (!rf) return null;
    const joined = participant ? r.entries.get(String(participant)) : null;
    return {
      ...rf,
      joined: joined ? { name: joined.name, ticketNo: joined.ticketNo } : null,
    };
  }

  enter(id, body, ip) {
    const r = this.rooms.get(id);
    const rf = this.live(r);
    if (!rf) return { status: 409, error: 'Nenhum sorteio aberto agora.' };
    if (String(body?.raffleId) !== rf.id || Number(body?.round) !== rf.round) {
      return { status: 409, error: 'O sorteio foi reiniciado. Atualize a página.' };
    }
    if (rf.state !== 'open') return { status: 409, error: 'As inscrições para este sorteio estão fechadas.' };
    const participant = String(body?.participant || '').replace(/[^\w-]/g, '').slice(0, 64);
    if (participant.length < 8) return { status: 400, error: 'Identificação inválida.' };
    if (r.entries.has(participant)) {
      const prev = r.entries.get(participant);
      return { status: 200, ok: false, already: true, ticketNo: prev.ticketNo, name: prev.name };
    }
    const name = String(body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (name.length < 2) return { status: 400, error: 'Digite seu nome para participar.' };
    const contact = rf.askContact ? String(body?.contact || '').trim().slice(0, 60) : '';
    if (rf.askContact && contact.length < 2) {
      return { status: 400, error: `Informe ${rf.contactLabel || 'seu contato'}.` };
    }
    const ipHits = r.ips.get(ip) || 0;
    if (ipHits >= MAX_PER_IP) return { status: 429, error: 'Muitas inscrições vindas desta rede.' };
    if (r.queue.length >= MAX_QUEUE) return { status: 503, error: 'Fila cheia, tente novamente.' };

    const ticketNo = Math.max(rf.count, r.seq) + 1;
    r.seq = ticketNo;
    r.ips.set(ip, ipHits + 1);
    const entry = { key: 'web:' + participant, name, contact, ticketNo, source: 'QR', at: Date.now() };
    r.entries.set(participant, entry);
    r.queue.push(entry);
    rf.count++;
    return { status: 200, ok: true, ticketNo, name };
  }
}
