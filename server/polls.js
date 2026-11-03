// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Votação do público pelo celular: a enquete no ar ganha um QR Code que abre /vote/<estúdio>.
// O estúdio (navegador do host) continua sendo a fonte da verdade: a cada ~1 s ele envia a enquete
// atual (POST /api/studios/:id/poll) e recebe de volta os votos que chegaram pela página externa.
const STALE_MS = 8000; // sem notícias do estúdio por esse tempo = enquete fora do ar
const MAX_PER_IP = 40; // várias pessoas na mesma rede (NAT) podem votar, mas não infinitamente
const MAX_QUEUE = 5000;
const STATES = new Set(['ready', 'open', 'closed']);

function clean(p) {
  const options = (Array.isArray(p.options) ? p.options : []).slice(0, 6).map((o) => ({
    text: String(o?.text ?? '').slice(0, 60),
    votes: Math.max(0, Math.floor(Number(o?.votes) || 0)),
  }));
  return {
    id: String(p.id).slice(0, 40),
    round: Math.floor(Number(p.round) || 0),
    question: String(p.question ?? '').slice(0, 140),
    options,
    state: STATES.has(p.state) ? p.state : 'closed',
    endsAt: Number(p.endsAt) || 0,
  };
}

export class PollHub {
  constructor() {
    this.rooms = new Map();
  }
  room(id) {
    let r = this.rooms.get(id);
    if (!r) this.rooms.set(id, (r = { key: '', poll: null, at: 0, voters: new Map(), ips: new Map(), queue: [] }));
    return r;
  }
  live(r) {
    return r?.poll && Date.now() - r.at < STALE_MS ? r.poll : null;
  }

  // estúdio → servidor: publica a enquete (ou null) e leva os votos pendentes
  sync(id, poll) {
    const r = this.room(id);
    if (!poll || typeof poll !== 'object' || !poll.id) {
      r.poll = null;
      r.queue = [];
      return [];
    }
    const p = clean(poll);
    const key = `${p.id}:${p.round}`;
    if (r.key !== key) {
      r.key = key;
      r.voters.clear();
      r.ips.clear();
      r.queue = [];
    }
    const out = r.queue;
    r.queue = [];
    // os votos que estão indo agora ainda não estão na contagem do estúdio: soma para a página não "voltar"
    for (const v of out) if (p.options[v.opt]) p.options[v.opt].votes++;
    r.poll = p;
    r.at = Date.now();
    return out;
  }

  // página de votação: o que mostrar
  view(id, voter) {
    const r = this.rooms.get(id);
    const p = this.live(r);
    if (!p) return null;
    const v = voter ? r.voters.get(String(voter)) : undefined;
    return {
      id: p.id,
      round: p.round,
      question: p.question,
      options: p.options,
      state: p.state === 'open' && p.endsAt && Date.now() > p.endsAt ? 'closed' : p.state,
      endsIn: p.endsAt ? Math.max(0, p.endsAt - Date.now()) : 0,
      voted: v ?? null,
    };
  }

  vote(id, body, ip) {
    const r = this.rooms.get(id);
    const p = this.live(r);
    if (!p) return { status: 409, error: 'Nenhuma enquete no ar agora.' };
    if (String(body?.pollId) !== p.id || Number(body?.round) !== p.round) return { status: 409, error: 'A enquete mudou. Atualize a página.' };
    if (p.state !== 'open' || (p.endsAt && Date.now() > p.endsAt)) return { status: 409, error: 'A votação já foi encerrada.' };
    const voter = String(body?.voter || '').replace(/[^\w-]/g, '').slice(0, 64);
    if (voter.length < 8) return { status: 400, error: 'Identificação inválida.' };
    const opt = Number(body?.opt);
    if (!Number.isInteger(opt) || opt < 0 || opt >= p.options.length) return { status: 400, error: 'Opção inválida.' };
    if (r.voters.has(voter)) return { status: 200, ok: false, already: true, voted: r.voters.get(voter) };
    const n = r.ips.get(ip) || 0;
    if (n >= MAX_PER_IP) return { status: 429, error: 'Muitos votos vindos desta rede.' };
    if (r.queue.length >= MAX_QUEUE) return { status: 503, error: 'Muitos votos ao mesmo tempo, tente de novo.' };
    r.ips.set(ip, n + 1);
    r.voters.set(voter, opt);
    r.queue.push({ key: 'web:' + voter, opt });
    p.options[opt].votes++;
    return { status: 200, ok: true, voted: opt };
  }
}
