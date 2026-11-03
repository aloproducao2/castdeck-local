// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Aba Sports: placar + cronômetro (progressivo ou regressivo) e GCs comuns de futebol (gol, cartões, substituição...).
// Os times ficam num cadastro único (S.brand.teams: nome, sigla, cor, escudo, técnico e elenco) e alimentam o placar,
// os GCs, as sugestões de jogadores e as variáveis {mandante} {visitante} {placar} {competicao} usadas em qualquer banner.
// Os eventos usam o mesmo GC de jornal (lower third) e também podem ser disparados pela barra de controle.

const uid = () => Math.random().toString(36).slice(2, 9);
const PERIODS = [
  { id: 'pre', btn: 'Pré-jogo', label: 'PRÉ-JOGO', fixed: '00:00' },
  { id: 't1', btn: '1º tempo', label: '1º TEMPO', timed: true },
  { id: 'ht', btn: 'Intervalo', label: 'INTERVALO', fixed: 'INT' },
  { id: 't2', btn: '2º tempo', label: '2º TEMPO', timed: true },
  { id: 'et1', btn: 'Prorrog. 1', label: 'PRORROGAÇÃO', timed: true },
  { id: 'et2', btn: 'Prorrog. 2', label: 'PRORROGAÇÃO', timed: true },
  { id: 'pen', btn: 'Pênaltis', label: 'PÊNALTIS', fixed: 'PÊN' },
  { id: 'ft', btn: 'Fim', label: 'FIM DE JOGO', fixed: 'FIM' },
];
const PER = Object.fromEntries(PERIODS.map((p) => [p.id, p]));
const NEXT = { pre: 't1', t1: 'ht', ht: 't2', t2: 'ft', et1: 'et2', et2: 'pen', pen: 'ft', ft: 'ft' };
const SB_POS = [
  ['tl', 'Em cima à esquerda'],
  ['tc', 'Em cima no centro'],
  ['tr', 'Em cima à direita'],
  ['bl', 'Embaixo à esquerda'],
];
const DURS = [
  [6, '6 s'],
  [8, '8 s'],
  [10, '10 s'],
  [15, '15 s'],
  [0, 'Manual'],
];
const PRESETS = [
  { k: 'fut', label: 'Futebol', half: 45, et: 15, mode: 'up' },
  { k: 'soc', label: 'Society', half: 25, et: 5, mode: 'up' },
  { k: 'fs', label: 'Futsal', half: 20, et: 5, mode: 'down' },
  { k: 'base', label: 'Sub-15', half: 35, et: 10, mode: 'up' },
];
const ROLES = ['Árbitro', 'Assistente 1', 'Assistente 2', 'Quarto árbitro', 'Árbitro de vídeo (VAR)'];
const POSITIONS = ['Goleiro', 'Lateral direito', 'Zagueiro', 'Lateral esquerdo', 'Volante', 'Meio-campo', 'Meia', 'Ponta direita', 'Ponta esquerda', 'Atacante', 'Centroavante'];

const EVENTS = [
  { k: 'goal', ico: '⚽', label: 'Gol', tag: 'GOL!', color: '#16a34a', look: 'hard', f: ['team', 'player', 'minute'] },
  { k: 'yellow', ico: '🟨', label: 'Cartão amarelo', tag: 'CARTÃO AMARELO', color: '#eab308', f: ['team', 'player', 'minute'] },
  { k: 'red', ico: '🟥', label: 'Cartão vermelho', tag: 'CARTÃO VERMELHO', color: '#dc2626', f: ['team', 'player', 'minute'] },
  { k: 'sub', ico: '🔁', label: 'Substituição', tag: 'SUBSTITUIÇÃO', color: '#2563eb', f: ['team', 'out', 'in', 'minute'] },
  { k: 'pen', ico: '🎯', label: 'Pênalti', tag: 'PÊNALTI', color: '#f97316', f: ['team', 'player', 'minute'] },
  { k: 'var', ico: '📺', label: 'VAR', tag: 'VAR', color: '#7c3aed', f: ['text', 'minute'] },
  { k: 'extra', ico: '⏱', label: 'Acréscimos', tag: 'ACRÉSCIMOS', color: '#0ea5e9', look: 'hard', f: ['n'] },
  { k: 'match', ico: '🆚', label: 'Confronto', tag: 'AO VIVO', color: null, look: 'hard', f: [] },
  { k: 'scoreline', ico: '🔢', label: 'Placar', tag: 'PLACAR', color: null, look: 'hard', f: [] },
  { k: 'ht', ico: '⏸', label: 'Intervalo', tag: 'INTERVALO', color: '#64748b', look: 'hard', f: [] },
  { k: 'ft', ico: '🏁', label: 'Fim de jogo', tag: 'FIM DE JOGO', color: '#475569', look: 'hard', f: [] },
  { k: 'lineup', ico: '👕', label: 'Jogador', tag: 'ESCALAÇÃO', color: null, f: ['team', 'player', 'number', 'pos'] },
  { k: 'coach', ico: '🧢', label: 'Técnico', tag: 'TÉCNICO', color: null, f: ['team', 'player'] },
  { k: 'ref', ico: '🧑‍⚖️', label: 'Arbitragem', tag: 'ARBITRAGEM', color: '#334155', f: ['player', 'role'] },
];
const EV = Object.fromEntries(EVENTS.map((e) => [e.k, e]));

const abbrOf = (n) =>
  String(n || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .slice(0, 3)
    .toUpperCase();
const pad = (n) => String(n).padStart(2, '0');
const mmss = (sec) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
const DEF = {
  home: { id: '', name: 'Mandante', abbr: 'MAN', color: '#16a34a', logo: '', coach: '', players: [] },
  away: { id: '', name: 'Visitante', abbr: 'VIS', color: '#2563eb', logo: '', coach: '', players: [] },
};

// "10 Gabriel Barbosa - Atacante" → { num: '10', name: 'Gabriel Barbosa', pos: 'Atacante' }
export function parseRoster(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      let num = '';
      const m = /^(\d{1,3})\s*[-–.)]?\s+(.*)$/.exec(l);
      if (m) {
        num = m[1];
        l = m[2];
      }
      const parts = l.split(/\s+[-–]\s+|\s*[|;,]\s*/);
      return { num, name: (parts[0] || '').trim().slice(0, 40), pos: (parts.slice(1).join(' ') || '').trim().slice(0, 20) };
    })
    .filter((p) => p.name)
    .slice(0, 60);
}
const rosterText = (players) => (players || []).map((p) => `${p.num ? p.num + ' ' : ''}${p.name}${p.pos ? ' - ' + p.pos : ''}`).join('\n');

import { confirmDialog } from '../ui.js';

export function createSports({ S, comp, $, $$, esc, toast, icons, modal, saveStudio, toggleBanner, readImage, pickFile, onAir = () => {} }) {
  const teams = () => (S.brand.teams ||= []);
  const sp = () => {
    const s = (S.brand.sports ||= { comp: '', home: { tid: '', score: 0 }, away: { tid: '', score: 0 }, period: 'pre', base: 0, pos: 'tl' });
    s.mode ||= 'up';
    s.half ||= 45;
    s.et ||= 15;
    if (s.stopAtZero === undefined) s.stopAtZero = true;
    if (s.deck === undefined) s.deck = true;
    s.runAt ||= 0;
    return s;
  };

  // migra o formato antigo (nome/cor dentro do placar) para o cadastro de times; cria 2 times de exemplo no 1º uso
  (function migrate() {
    const s = sp();
    for (const side of ['home', 'away']) {
      const o = s[side] || {};
      if (!o.tid && o.name) {
        const stale = ['TMA', 'TMB'].includes(o.abbr) && !/^time [ab]$/i.test(o.name); // sigla padrão que não acompanhou o nome
        const t = { id: uid(), name: o.name, abbr: !o.abbr || stale ? abbrOf(o.name) : o.abbr, color: o.color || DEF[side].color, logo: o.logo || '', coach: '', players: [] };
        teams().push(t);
        s[side] = { tid: t.id, score: o.score || 0 };
      } else s[side] = { tid: o.tid || '', score: o.score || 0 };
    }
    if (!teams().length) {
      const a = { id: uid(), name: 'Time A', abbr: 'TMA', color: '#16a34a', logo: '', coach: '', players: [] };
      const b = { id: uid(), name: 'Time B', abbr: 'TMB', color: '#2563eb', logo: '', coach: '', players: [] };
      teams().push(a, b);
      s.home.tid = a.id;
      s.away.tid = b.id;
    }
  })();

  // elenco: cada jogador ganha id fixo (gols, cartões e substituições ficam ligados a ele) e marca de titular
  function normPlayers(t) {
    const ps = (t.players ||= []);
    const anyStarter = ps.some((p) => typeof p.starter === 'boolean');
    ps.forEach((p, i) => {
      p.id ||= uid();
      p.num = String(p.num || '').replace(/\D/g, '').slice(0, 3);
      p.pos ||= '';
      if (!anyStarter) p.starter = i < 11;
    });
    return t;
  }
  teams().forEach(normPlayers);

  const team = (side) => teams().find((t) => t.id === sp()[side].tid) || DEF[side];
  const teamById = (tid) => teams().find((t) => t.id === tid);
  const sideKey = (v) => (v === 'away' ? 'away' : 'home');
  const sideOf = (e) => (sp().home.tid === e.tid ? 'home' : sp().away.tid === e.tid ? 'away' : e.side);
  let scoreOn = false;
  let used = false; // aba Sports aberta nesta sessão (mostra os atalhos de futebol na barra)
  let luSide = 'home'; // time mostrado na seção Escalação
  const ev = { k: 'goal', team: 'home', player: '', pid: '', in: '', inId: '', out: '', outId: '', text: '', minute: '', minuteEdited: false, number: '', pos: '', n: 3, role: ROLES[0], dur: 8, addScore: true };

  // ---------------- partida: quem está em campo + lance a lance (salvos com o estúdio) ----------------
  const match = () => {
    const m = (sp().match ||= {});
    m.on ||= {};
    m.log ||= [];
    return m;
  };
  // ids em campo do time (na 1ª vez vem dos titulares do cadastro)
  function onField(side) {
    const t = team(side);
    if (!t.id) return [];
    const m = match();
    const ps = t.players || [];
    if (!m.on[t.id]) m.on[t.id] = ps.filter((p) => p.starter).map((p) => p.id);
    else m.on[t.id] = m.on[t.id].filter((id) => ps.some((p) => p.id === id));
    return m.on[t.id];
  }
  function pstat(tid, pid) {
    const st = { g: 0, y: 0, r: 0, out: false, inn: false };
    if (!pid) return st;
    for (const e of match().log) {
      if (e.tid !== tid) continue;
      if (e.pid === pid) {
        if (e.k === 'goal') st.g++;
        else if (e.k === 'yellow') st.y++;
        else if (e.k === 'red') st.r++;
      }
      if (e.k === 'sub') {
        if (e.outId === pid) st.out = true;
        if (e.inId === pid) st.inn = true;
      }
    }
    return st;
  }
  const badgeHtml = (st) =>
    `${st.g ? `<i class="bd">⚽${st.g > 1 ? st.g : ''}</i>` : ''}${st.y && !st.r ? `<i class="bd">🟨</i>` : ''}${st.r ? '<i class="bd">🟥</i>' : ''}${st.inn ? '<i class="bd in" title="Entrou">▲</i>' : ''}${st.out ? '<i class="bd out" title="Saiu">▼</i>' : ''}`;

  // ---------------- relógio (persistente: continua certo depois de recarregar a página) ----------------
  const running = () => !!sp().runAt;
  const elapsed = () => {
    const s = sp();
    return s.base + (s.runAt ? Date.now() - s.runAt : 0);
  };
  // início/fim do período em segundos de jogo
  function span(id = sp().period) {
    const s = sp();
    const H = s.half * 60;
    const E = s.et * 60;
    return { t1: [0, H], t2: [H, 2 * H], et1: [2 * H, 2 * H + E], et2: [2 * H + E, 2 * H + 2 * E] }[id] || null;
  }
  function clockText() {
    const s = sp();
    const per = PER[s.period];
    if (per.fixed) return s.period === 'pre' && s.mode === 'down' ? mmss(s.half * 60) : per.fixed;
    const [a, b] = span();
    const ms = elapsed();
    if (s.mode === 'down') {
      const rem = b * 1000 - ms;
      if (rem > 0) return mmss(Math.ceil(rem / 1000));
      return s.stopAtZero ? '00:00' : '+' + mmss(Math.floor(-rem / 1000));
    }
    const sec = Math.floor(ms / 1000);
    if (sec >= b) return `${b / 60}+${Math.floor((sec - b) / 60) + 1}'`;
    return mmss(Math.max(a, sec));
  }
  // minuto do jogo (sempre progressivo, como na súmula): 1..45, 45+2, 46..90...
  function minuteLabel() {
    const s = sp();
    const sp_ = span();
    if (!sp_) return s.period === 'ht' ? String(s.half) : '';
    const sec = Math.floor(elapsed() / 1000);
    const end = sp_[1];
    if (sec >= end) return `${end / 60}+${Math.floor((sec - end) / 60) + 1}`;
    return String(Math.max(1, Math.floor(sec / 60) + 1));
  }
  function setRunning(on) {
    const s = sp();
    if (on === running()) return;
    if (on) {
      if (PER[s.period].fixed && s.period !== 'pre') return toast('Escolha um período com cronômetro (1º/2º tempo ou prorrogação)', 'err');
      if (s.period === 'pre') setPeriod('t1', true);
      if (s.mode === 'down' && s.stopAtZero && elapsed() >= span()[1] * 1000) return toast('Tempo esgotado — ajuste o relógio ou avance o período', 'err');
      s.runAt = Date.now();
    } else {
      s.base = elapsed();
      s.runAt = 0;
    }
    saveStudio();
    paintClock();
    onAir();
  }
  function setPeriod(id, quiet) {
    const s = sp();
    s.runAt = 0;
    s.period = id;
    const sp_ = span(id);
    if (sp_) s.base = sp_[0] * 1000;
    else if (id === 'pre') s.base = 0;
    if (!quiet) saveStudio();
    paintClock();
    paintPeriods();
    onAir();
  }
  function setClock(text) {
    const s = sp();
    const m = /^(\d{1,3})(?::(\d{1,2}))?$/.exec(String(text).trim());
    if (!m || +(m[2] || 0) > 59) return toast('Use o formato mm:ss (ex.: 45:00)', 'err'), false;
    const sp_ = span();
    if (!sp_) return toast('Escolha um período com cronômetro primeiro', 'err'), false;
    const v = +m[1] * 60 + +(m[2] || 0);
    const was = running();
    // regressivo: o valor é o tempo que falta; progressivo: o tempo de jogo mostrado
    s.base = (s.mode === 'down' ? sp_[1] - Math.min(v, sp_[1] - sp_[0]) : v) * 1000;
    s.runAt = was ? Date.now() : 0;
    saveStudio();
    paintClock();
    return true;
  }
  function setRules(patch) {
    const s = sp();
    const wasPer = span();
    const off = wasPer ? elapsed() - wasPer[0] * 1000 : 0; // mantém o tempo jogado dentro do período
    Object.assign(s, patch);
    const now = span();
    if (now) {
      s.base = now[0] * 1000 + Math.max(0, off);
      if (s.runAt) s.runAt = Date.now();
    }
    saveStudio();
    paintClock();
  }

  // ---------------- placar no ar ----------------
  const snapshot = () => {
    const s = sp();
    const h = team('home');
    const a = team('away');
    return {
      home: { abbr: h.abbr || abbrOf(h.name), color: h.color, logo: h.logo, score: s.home.score },
      away: { abbr: a.abbr || abbrOf(a.name), color: a.color, logo: a.logo, score: s.away.score },
      clock: clockText(),
      tab: s.period === 'pre' && s.comp ? s.comp.toUpperCase().slice(0, 28) : PER[s.period].label,
    };
  };
  function airScore(on) {
    scoreOn = on;
    if (on) comp.wg.show('score', 'score', snapshot, sp().pos || 'tl');
    else comp.wg.hide('score');
    paintAir();
    onAir();
  }
  const scoreLine = (s = sp()) => `${team('home').name} ${s.home.score} x ${s.away.score} ${team('away').name}`;
  function bumpScore(side, d) {
    const s = sp();
    s[side].score = Math.max(0, s[side].score + d);
    saveStudio();
    paintScore();
    onAir();
  }

  // variáveis para qualquer GC/banner: {mandante} {visitante} {placar} {competicao} {tempo} {sigla_mandante} {sigla_visitante}
  function fill(text) {
    if (!text || !String(text).includes('{')) return text;
    const s = sp();
    const map = {
      mandante: team('home').name,
      visitante: team('away').name,
      sigla_mandante: team('home').abbr,
      sigla_visitante: team('away').abbr,
      placar: `${s.home.score} x ${s.away.score}`,
      competicao: s.comp || '',
      tempo: clockText(),
      periodo: PER[s.period].btn,
    };
    return String(text).replace(/\{([a-z_çã]+)\}/gi, (all, k) => {
      const key = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return key in map ? map[key] : all;
    });
  }

  // ---------------- GCs ----------------
  function payload(def, f) {
    const s = sp();
    const t = team(sideKey(f.team));
    const min = f.minute ? `${String(f.minute).replace(/'/g, '')}'` : '';
    const player = (f.player || '').trim();
    let title = '';
    let sub = '';
    let tag = def.tag;
    switch (def.k) {
      case 'goal':
        title = player ? player.toUpperCase() : `GOL DO ${t.name.toUpperCase()}`;
        sub = `${t.name}${min ? ' · ' + min : ''}  |  ${scoreLine(s)}`;
        break;
      case 'yellow':
      case 'red':
        title = player || def.label;
        sub = `${t.name}${min ? ' · ' + min : ''}`;
        break;
      case 'sub':
        title = `Entra: ${(f.in || '').trim() || '—'}`;
        sub = `Sai: ${(f.out || '').trim() || '—'} · ${t.name}${min ? ' · ' + min : ''}`;
        break;
      case 'pen':
        title = `Pênalti para ${t.name}`;
        sub = `${player ? 'Cobrador: ' + player : 'Lance em análise'}${min ? ' · ' + min : ''}`;
        break;
      case 'var':
        title = (f.text || '').trim() || 'Lance em análise';
        sub = `Revisão do VAR${min ? ' · ' + min : ''}`;
        break;
      case 'extra':
        title = `+${f.n} MINUTO${f.n > 1 ? 'S' : ''} DE ACRÉSCIMO`;
        sub = PER[s.period].btn;
        break;
      case 'match':
        title = `${team('home').name} x ${team('away').name}`;
        sub = s.comp || 'Acompanhe ao vivo';
        if (s.period !== 'pre') tag = PER[s.period].label;
        break;
      case 'scoreline':
        title = scoreLine(s);
        sub = [PER[s.period].btn, PER[s.period].fixed ? '' : clockText(), s.comp].filter(Boolean).join(' · ');
        break;
      case 'ht':
        title = 'INTERVALO';
        sub = scoreLine(s);
        break;
      case 'ft':
        title = 'FIM DE JOGO';
        sub = scoreLine(s);
        break;
      case 'lineup':
        title = player || 'Jogador';
        sub = [f.pos?.trim(), f.number ? `Nº ${f.number}` : '', t.name].filter(Boolean).join(' · ');
        break;
      case 'coach':
        title = player || t.coach || 'Técnico';
        sub = `Técnico · ${t.name}`;
        break;
      case 'ref':
        title = player || 'Árbitro';
        sub = f.role || ROLES[0];
        break;
    }
    const hard = def.look === 'hard';
    const withLogo = def.f.includes('team') ? t.logo : '';
    const color = def.color || (def.f.includes('team') ? t.color : team('home').color);
    return { title, subtitle: sub, style: 'news', look: hard ? 'hard' : 'classic', pos: hard ? 'bc' : 'bl', color, tag, logo: withLogo || null, dur: f.dur };
  }

  // lances que entram no "lance a lance" (e atualizam quem está em campo)
  const LOGGED = ['goal', 'yellow', 'red', 'sub', 'pen'];
  const SECOND_YELLOW = { ...EV.red, tag: '2º AMARELO · EXPULSO' };
  function record(def, f, extra = {}) {
    if (!LOGGED.includes(def.k)) return null;
    const side = sideKey(f.team);
    const t = team(side);
    const e = { id: uid(), k: def.k, side, tid: t.id || '', minute: String(f.minute || '').replace(/'/g, ''), ...extra };
    if (def.k === 'sub') {
      Object.assign(e, { inId: f.inId || '', outId: f.outId || '', inName: (f.in || '').trim(), outName: (f.out || '').trim() });
      if (t.id) {
        const on = onField(side);
        const i = on.indexOf(e.outId);
        if (e.outId && i >= 0) on.splice(i, 1);
        if (e.inId && !on.includes(e.inId)) on.push(e.inId);
      }
    } else Object.assign(e, { pid: f.pid || '', name: (f.player || '').trim() });
    if (def.k === 'red' && e.pid && t.id) {
      const on = onField(side);
      const i = on.indexOf(e.pid);
      if (i >= 0) {
        on.splice(i, 1);
        e.removed = true;
      }
    }
    match().log.push(e);
    return e;
  }

  // id fixo por atalho (sp:goal:home, sp:ht...) para a barra saber qual está no ar; o formulário usa sp:form
  function sendEvent(def, f, id = 'sp:form', log = true) {
    const s = sp();
    let scored = false;
    if (def.k === 'goal' && f.addScore) {
      bumpScore(sideKey(f.team), 1);
      scored = true;
    }
    if (def.k === 'ht' && s.period !== 'ht') setPeriod('ht');
    if (def.k === 'ft' && s.period !== 'ft') setPeriod('ft');
    if (log) record(def, f, def.k === 'goal' ? { scored } : {});
    if (S.activeBanner) toggleBanner(S.activeBanner);
    toggleBanner(id, payload(def, f));
    saveStudio();
    paintAir();
    paintLog();
    paintLineup();
  }
  // nome digitado igual ao de um jogador do elenco: liga ao cadastro
  function matchIds() {
    const ps = team(ev.team).players || [];
    const find = (n) => ps.find((p) => p.name.toLowerCase() === String(n || '').trim().toLowerCase())?.id || '';
    if (!ev.pid && ev.player) ev.pid = find(ev.player);
    if (!ev.inId && ev.in) ev.inId = find(ev.in);
    if (!ev.outId && ev.out) ev.outId = find(ev.out);
  }
  function sendForm() {
    const def = EV[ev.k];
    if (['lineup', 'ref'].includes(def.k) && !ev.player.trim()) {
      $('#sp-f-player')?.focus();
      return toast('Digite o nome', 'err');
    }
    if (def.k === 'sub' && !ev.in.trim() && !ev.out.trim()) return toast('Escolha quem sai e quem entra', 'err');
    if (!ev.minuteEdited) ev.minute = minuteLabel();
    if (!['coach', 'ref'].includes(def.k)) matchIds();
    const tid = team(ev.team).id;
    const st = pstat(tid, ev.pid);
    if (def.k === 'yellow' && ev.pid && st.y >= 1 && !st.r) {
      // 2º amarelo: registra amarelo + vermelho (tira de campo) e vai ao ar como expulsão
      const y = record(EV.yellow, ev);
      record(EV.red, ev, { second: true, pair: y.id });
      sendEvent(SECOND_YELLOW, ev, 'sp:form', false);
      toast(`${ev.player}: segundo amarelo — expulso`, 'ok');
    } else sendEvent(def, ev);
    if (LOGGED.includes(def.k)) {
      // formulário pronto para o próximo lance
      ev.player = ev.in = ev.out = ev.pid = ev.inId = ev.outId = '';
      ev.minuteEdited = false;
      paintForm(false);
    }
  }
  // atalhos usados pela barra de controle
  function quick(id) {
    const [, k, side] = id.split(':');
    const def = EV[k];
    if (!def) return;
    sendEvent(def, { team: side || 'home', player: '', minute: minuteLabel(), dur: ev.dur || 8, n: ev.n || 3, addScore: true }, id);
  }
  const isSpOn = () => String(S.activeBanner || '').startsWith('sp:');

  // desfazer um lance: tira o gol do placar, devolve o jogador expulso/substituído ao campo
  function undoLog(id) {
    const m = match();
    const e = m.log.find((x) => x.id === id);
    if (!e) return;
    const s = sp();
    const side = sideOf(e);
    if (e.k === 'goal' && e.scored && s[side]) s[side].score = Math.max(0, s[side].score - 1);
    const on = e.tid ? m.on[e.tid] : null;
    if (on && e.k === 'sub') {
      const j = on.indexOf(e.inId);
      if (e.inId && j >= 0) on.splice(j, 1);
      if (e.outId && !on.includes(e.outId)) on.push(e.outId);
    }
    if (on && e.k === 'red' && e.removed && !on.includes(e.pid)) on.push(e.pid);
    m.log = m.log.filter((x) => x.id !== id && x.id !== e.pair);
    saveStudio();
    paintScore();
    paintLog();
    paintLineup();
    paintForm(false);
    onAir();
    toast('Lance desfeito' + (e.k === 'goal' && e.scored ? ' — gol retirado do placar' : ''), 'ok');
  }
  // mostra o GC de um lance de novo (sem registrar outra vez nem mexer no placar)
  function replayLog(id) {
    const e = match().log.find((x) => x.id === id);
    if (!e) return;
    const f = { team: sideOf(e), player: e.name || '', in: e.inName || '', out: e.outName || '', minute: e.minute, dur: ev.dur };
    if (S.activeBanner) toggleBanner(S.activeBanner);
    toggleBanner('sp:form', payload(e.second ? SECOND_YELLOW : EV[e.k], f));
    paintAir();
  }

  // ---------------- cadastro de times ----------------
  async function openTeamModal(existing, assignSide) {
    const t = existing ? { ...existing, players: (existing.players || []).map((p) => ({ ...p })) } : { id: uid(), name: '', abbr: '', color: '#e11d48', logo: '', coach: '', players: [] };
    const rows = t.players;
    const res = await modal(
      `<h3>${existing ? 'Editar time' : 'Novo time'}</h3>
       <p class="sub">Cadastre uma vez — nome, sigla, cor, escudo, técnico e elenco ficam salvos e preenchem o placar e os GCs.</p>
       <div class="sp-tm-head">
         <div class="sp-tm-logo" id="tm-logo" title="Clique para enviar escudo">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : icons.plus}</div>
         <div class="sp-tm-fields grow">
           <div class="row" style="gap:8px">
             <div class="field grow" style="margin:0">
               <label for="tm-name">Nome do time *</label>
               <input class="input" id="tm-name" maxlength="28" autocomplete="off" spellcheck="false" placeholder="Ex.: Flamengo" value="${esc(t.name)}">
             </div>
             <div class="field" style="margin:0;flex:none;width:96px">
               <label for="tm-abbr">Sigla</label>
               <input class="input" id="tm-abbr" maxlength="4" autocomplete="off" spellcheck="false" style="text-transform:uppercase;text-align:center" placeholder="FLA" value="${esc(t.abbr)}">
             </div>
           </div>
           <div class="row" style="gap:8px;margin-top:8px;align-items:center">
             <input type="color" class="qm-color" id="tm-color" value="${t.color}" title="Cor oficial do time">
             <span class="hint" style="font-weight:600">Cor</span>
             <span class="grow"></span>
             <button type="button" class="btn sm" id="tm-pick">${t.logo ? 'Trocar escudo' : 'Enviar escudo'}</button>
             <button type="button" class="btn ghost sm icon" id="tm-nologo" title="Remover escudo" ${t.logo ? '' : 'hidden'}>${icons.trash}</button>
           </div>
         </div>
       </div>
       <div class="field"><label for="tm-coach">Técnico</label><input class="input" id="tm-coach" maxlength="40" autocomplete="off" placeholder="Ex.: Filipe Luís" value="${esc(t.coach || '')}"></div>
       <div class="field"><span>Elenco <em class="hint" id="tm-count" style="font-style:normal"></em></span>
         <div class="tm-rh" id="tm-rh"><span>Nº</span><span>Nome</span><span>Posição</span><span title="Titular">Tit.</span><span></span></div>
         <div class="tm-roster" id="tm-roster"></div>
         <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"><button type="button" class="btn sm" id="tm-addp">${icons.plus} Jogador</button><button type="button" class="btn sm ghost" id="tm-text" title="Colar uma lista ou editar tudo como texto">📋 Colar / editar como texto</button></div>
         <div class="tm-pbox" id="tm-pbox" hidden><textarea class="input sp-roster" id="tm-ptx" rows="7" placeholder="Um jogador por linha: número, nome e posição&#10;1 Rossi - Goleiro&#10;10 Gabriel Barbosa - Atacante"></textarea>
           <div class="row" style="gap:6px;margin-top:6px;align-items:center"><span class="hint grow">Uma linha por jogador. Quem já estava na lista mantém titular e histórico.</span><button type="button" class="btn sm ghost" id="tm-pcancel">Cancelar</button><button type="button" class="btn sm primary" id="tm-papply">Aplicar lista</button></div></div>
       </div>
       <datalist id="tm-poslist">${POSITIONS.map((p) => `<option value="${p}">`).join('')}</datalist>
       <div class="hint" style="margin-top:-4px">★ = titular (começa em campo). Na partida, gol, cartão e substituição escolhem o jogador com um clique.</div>
       <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="tm-ok" ${existing ? 'data-save' : ''}>${existing ? 'Salvar' : 'Criar time'}</button></div>`,
      {
        onMount(m, close) {
          const name = $('#tm-name', m);
          const abbr = $('#tm-abbr', m);
          let autoAbbr = !t.abbr || t.abbr === abbrOf(t.name);
          const box = $('#tm-roster', m);
          const count = () => {
            const named = rows.filter((r) => r.name.trim());
            const st = named.filter((r) => r.starter).length;
            $('#tm-count', m).textContent = named.length ? `· ${named.length} jogador${named.length > 1 ? 'es' : ''} · ${st} titular${st !== 1 ? 'es' : ''}${st > 11 ? ' (mais de 11!)' : ''}` : '';
            $('#tm-rh', m).hidden = !rows.length;
          };
          const paintRows = (focusLast) => {
            box.innerHTML = rows.length
              ? rows
                  .map(
                    (r, i) => `<div class="tm-p" data-i="${i}"><input class="input tm-num" maxlength="3" inputmode="numeric" placeholder="Nº" aria-label="Número" value="${esc(r.num || '')}"><input class="input tm-nm" maxlength="40" placeholder="Nome do jogador" aria-label="Nome" value="${esc(r.name)}"><input class="input tm-pos" list="tm-poslist" maxlength="20" placeholder="Posição" aria-label="Posição" value="${esc(r.pos || '')}"><button type="button" class="tm-st ${r.starter ? 'on' : ''}" title="Titular / reserva" aria-pressed="${!!r.starter}">★</button><button type="button" class="btn ghost sm icon" data-rmp title="Remover jogador">${icons.trash}</button></div>`,
                  )
                  .join('')
              : '<div class="empty" style="padding:12px">Nenhum jogador ainda. Adicione um a um ou cole uma lista.</div>';
            $$('.tm-p', box).forEach((row) => {
              const i = +row.dataset.i;
              const r = rows[i];
              $('.tm-num', row).oninput = (e) => (r.num = e.target.value = e.target.value.replace(/\D/g, ''));
              $('.tm-nm', row).oninput = (e) => ((r.name = e.target.value), count());
              $('.tm-pos', row).oninput = (e) => (r.pos = e.target.value);
              $('.tm-st', row).onclick = (e) => {
                r.starter = !r.starter;
                e.currentTarget.classList.toggle('on', r.starter);
                e.currentTarget.setAttribute('aria-pressed', r.starter);
                count();
              };
              $('[data-rmp]', row).onclick = () => {
                rows.splice(i, 1);
                paintRows();
              };
              // Enter: próxima linha (na última, cria outro jogador)
              $$('input', row).forEach(
                (inp) =>
                  (inp.onkeydown = (e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    if (i + 1 >= rows.length) addRow();
                    else $(`.tm-p[data-i="${i + 1}"] .tm-num`, box)?.focus();
                  }),
              );
            });
            if (focusLast) $$('.tm-num', box).at(-1)?.focus();
            count();
          };
          const addRow = () => {
            rows.push({ id: uid(), num: '', name: '', pos: '', starter: rows.filter((r) => r.starter).length < 11 });
            paintRows(true);
          };
          $('#tm-addp', m).onclick = addRow;
          // colar/editar como texto: mantém id e titular de quem já existia (pelo nome)
          $('#tm-text', m).onclick = () => {
            const pb = $('#tm-pbox', m);
            pb.hidden = !pb.hidden;
            if (!pb.hidden) {
              $('#tm-ptx', m).value = rosterText(rows.filter((r) => r.name.trim()));
              $('#tm-ptx', m).focus();
            }
          };
          $('#tm-pcancel', m).onclick = () => ($('#tm-pbox', m).hidden = true);
          $('#tm-papply', m).onclick = () => {
            const list = parseRoster($('#tm-ptx', m).value);
            const old = rows.splice(0);
            const prevOf = (p) => old.find((o) => o.name.trim().toLowerCase() === p.name.toLowerCase());
            // quem já existia mantém titular/reserva; os novos completam os 11 titulares
            let st = list.filter((p) => prevOf(p)?.starter).length;
            for (const p of list) {
              const prev = prevOf(p);
              const starter = prev ? !!prev.starter : st < 11;
              if (starter && !prev) st++;
              rows.push({ ...p, id: prev?.id || uid(), starter });
            }
            $('#tm-pbox', m).hidden = true;
            paintRows();
            toast(`${list.length} jogador${list.length !== 1 ? 'es' : ''} na lista`, 'ok');
          };
          name.oninput = () => {
            if (autoAbbr) abbr.value = abbrOf(name.value);
          };
          abbr.oninput = () => {
            autoAbbr = !abbr.value.trim();
          };
          const paintLogo = () => {
            $('#tm-logo', m).innerHTML = t.logo ? `<img src="${esc(t.logo)}" alt="">` : icons.plus;
            $('#tm-pick', m).textContent = t.logo ? 'Trocar escudo' : 'Enviar escudo';
            $('#tm-nologo', m).hidden = !t.logo;
          };
          const pick = async () => {
            const f = await pickFile('image/*');
            if (!f) return;
            try {
              t.logo = await readImage(f, 200, 'image/png');
              paintLogo();
            } catch (e) {
              toast('Imagem inválida: ' + e.message, 'err');
            }
          };
          $('#tm-pick', m).onclick = pick;
          $('#tm-logo', m).onclick = pick;
          $('#tm-nologo', m).onclick = () => ((t.logo = ''), paintLogo());
          $('#tm-ok', m).onclick = () => {
            const n = name.value.trim();
            if (!n) return name.focus(), toast('Digite o nome do time', 'err');
            close({
              ...t,
              name: n,
              abbr: (abbr.value.trim() || abbrOf(n)).toUpperCase().slice(0, 4),
              color: $('#tm-color', m).value,
              coach: $('#tm-coach', m).value.trim(),
              players: rows
                .filter((r) => r.name.trim())
                .slice(0, 60)
                .map((r) => ({ id: r.id || uid(), num: String(r.num || '').replace(/\D/g, '').slice(0, 3), name: r.name.trim().slice(0, 40), pos: (r.pos || '').trim().slice(0, 20), starter: !!r.starter })),
            });
          };
          name.onkeydown = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              $('#tm-ok', m)?.click();
            }
          };
          paintRows();
          requestAnimationFrame(() => {
            name?.focus();
          });
        },
        sticky: true,
      },
    );
    if (!res) return;
    const list = teams();
    const i = list.findIndex((x) => x.id === res.id);
    if (i >= 0) list[i] = res;
    else list.push(res);
    // sem lances deste time na partida: a escalação volta a seguir os titulares do cadastro
    const m = match();
    if (!m.log.some((e) => e.tid === res.id)) delete m.on[res.id];
    if (assignSide) setSide(assignSide, res.id, true);
    saveStudio();
    toast(existing ? 'Time atualizado' : `${res.name} cadastrado`, 'ok');
    render();
    onAir();
  }
  function setSide(side, tid, quiet) {
    const s = sp();
    const other = side === 'home' ? 'away' : 'home';
    if (s[other].tid === tid && tid) [s.home, s.away] = [s.away, s.home]; // escolheu o time do outro lado: inverte
    else s[side].tid = tid;
    if (!quiet) {
      saveStudio();
      render();
      onAir();
    }
  }
  async function deleteTeam(t) {
    const s = sp();
    const inMatch = s.home.tid === t.id || s.away.tid === t.id;
    if (!(await confirmDialog(`Excluir ${t.name} do cadastro?${inMatch ? '\n\nEle está na partida atual e será substituído pelo nome genérico.' : ''}`, { ok: 'Excluir', danger: true }))) return;
    S.brand.teams = teams().filter((x) => x.id !== t.id);
    for (const side of ['home', 'away']) if (s[side].tid === t.id) s[side].tid = '';
    saveStudio();
    render();
    onAir();
  }

  // ---------------- painel ----------------
  function teamOpts(sel) {
    return `<option value="" ${!sel ? 'selected' : ''}>— escolher time —</option>${teams()
      .map((t) => `<option value="${t.id}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}</option>`)
      .join('')}`;
  }
  function libraryHtml() {
    const s = sp();
    const list = teams();
    if (!list.length) return '<div class="empty">Nenhum time cadastrado.</div>';
    return list
      .map((t) => {
        const side = s.home.tid === t.id ? 'Mandante' : s.away.tid === t.id ? 'Visitante' : '';
        const n = (t.players || []).length;
        const st = (t.players || []).filter((p) => p.starter).length;
        const meta = [n ? `${n} jogador${n > 1 ? 'es' : ''} · ${st} titular${st !== 1 ? 'es' : ''}` : 'sem elenco', t.coach ? `Téc. ${t.coach}` : ''].filter(Boolean).join(' · ');
        return `<div class="sp-tm" data-id="${t.id}">
          <span class="sp-tm-badge" style="--c:${t.color}">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : esc((t.abbr || abbrOf(t.name)).slice(0, 3))}</span>
          <div class="grow" style="min-width:0"><strong>${esc(t.name)}</strong> <span class="pill">${esc(t.abbr || abbrOf(t.name))}</span>${side ? ` <span class="pill ok">${side}</span>` : ''}<div class="hint">${esc(meta)}</div></div>
          <button class="btn ghost sm icon" data-tm="edit" title="Editar time">✎</button><button class="btn ghost sm icon" data-tm="del" title="Excluir time">${icons.trash}</button></div>`;
      })
      .join('');
  }

  function roster(side) {
    return team(side).players || [];
  }
  const byNum = (a, b) => (+a.num || 999) - (+b.num || 999) || a.name.localeCompare(b.name);
  // botões de jogador do elenco (um clique preenche o campo); field: player | in | out
  function pickerHtml(field) {
    const t = team(ev.team);
    const ps = t.players || [];
    if (!t.id || !ps.length) return '';
    const on = new Set(onField(ev.team));
    const sel = { player: ev.pid, in: ev.inId, out: ev.outId }[field];
    const inF = ps.filter((p) => on.has(p.id)).sort(byNum);
    const bench = ps.filter((p) => !on.has(p.id)).sort(byNum);
    const chip = (p) => {
      const st = pstat(t.id, p.id);
      const gone = st.r > 0 || st.out;
      const tip = [p.num && 'Nº ' + p.num, p.name, p.pos, st.out ? 'substituído' : st.r ? 'expulso' : ''].filter(Boolean).join(' · ');
      return `<button type="button" class="pk ${p.id === sel ? 'sel' : ''} ${gone ? 'gone' : ''}" data-pk="${field}" data-pid="${p.id}" title="${esc(tip)}"><b>${esc(p.num || '–')}</b><span>${esc(p.name)}</span>${badgeHtml(st)}</button>`;
    };
    const avail = bench.filter((p) => {
      const st = pstat(t.id, p.id);
      return !st.out && !st.r;
    });
    const groups = field === 'out' ? [['Em campo', inF]] : field === 'in' ? [['Banco', avail]] : [['Em campo', inF], [ev.k === 'lineup' ? 'Reservas' : 'Banco / fora', bench]];
    const body = groups
      .filter(([, l]) => l.length)
      .map(([lbl, l]) => `<div class="pk-lbl">${lbl} · ${l.length}</div><div class="pk-grid">${l.map(chip).join('')}</div>`)
      .join('');
    return `<div class="pk-wrap">${body || '<div class="hint">Ninguém disponível — ajuste em “Escalação”.</div>'}</div>`;
  }
  function fieldHtml(f) {
    const has = roster(ev.team).length > 0;
    switch (f) {
      case 'team':
        return `<div class="field"><span>Time</span><div class="seg" id="sp-f-team"><button class="${ev.team === 'home' ? 'active' : ''}" data-t="home">${esc(team('home').name)}</button><button class="${ev.team === 'away' ? 'active' : ''}" data-t="away">${esc(team('away').name)}</button></div></div>`;
      case 'player': {
        const isCoach = ev.k === 'coach';
        const noRoster = isCoach || ev.k === 'ref';
        const val = isCoach && !ev.player ? team(ev.team).coach || '' : ev.player;
        return `<label class="field" style="margin-bottom:6px"><span>${['coach', 'ref', 'lineup'].includes(ev.k) ? 'Nome' : 'Jogador'}</span><input class="input" id="sp-f-player" maxlength="40" autocomplete="off" placeholder="${ev.k === 'ref' ? 'Ex.: Wilton Pereira Sampaio' : isCoach ? 'Nome do técnico' : has ? 'Clique num jogador abaixo ou digite' : 'Ex.: Gabriel Barbosa'}" value="${esc(val)}"></label>${noRoster ? '' : pickerHtml('player')}`;
      }
      case 'in':
        return `<label class="field" style="margin-bottom:6px"><span>▲ Entra</span><input class="input" id="sp-f-in" maxlength="40" autocomplete="off" placeholder="${has ? 'Escolha no banco abaixo ou digite' : 'Nome de quem entra'}" value="${esc(ev.in)}"></label>${pickerHtml('in')}`;
      case 'out':
        return `<label class="field" style="margin-bottom:6px"><span>▼ Sai</span><input class="input" id="sp-f-out" maxlength="40" autocomplete="off" placeholder="${has ? 'Escolha quem está em campo ou digite' : 'Nome de quem sai'}" value="${esc(ev.out)}"></label>${pickerHtml('out')}`;
      case 'text':
        return `<label class="field"><span>Descrição</span><input class="input" id="sp-f-text" maxlength="60" placeholder="Ex.: Possível pênalti" value="${esc(ev.text)}"></label>`;
      case 'minute':
        return `<label class="field"><span>Minuto</span><input class="input" id="sp-f-minute" maxlength="6" style="width:90px" placeholder="auto" value="${esc(ev.minuteEdited ? ev.minute : minuteLabel())}"></label>`;
      case 'number':
        return `<label class="field"><span>Camisa</span><input class="input" id="sp-f-number" maxlength="3" inputmode="numeric" style="width:90px" value="${esc(ev.number)}"></label>`;
      case 'pos':
        return `<label class="field"><span>Posição</span><input class="input" id="sp-f-pos" maxlength="20" placeholder="Ex.: Atacante" value="${esc(ev.pos)}"></label>`;
      case 'n':
        return `<label class="field"><span>Minutos de acréscimo</span><select class="input" id="sp-f-n" style="width:110px">${Array.from({ length: 15 }, (_, i) => `<option ${ev.n === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>`;
      case 'role':
        return `<label class="field"><span>Função</span><select class="input" id="sp-f-role">${ROLES.map((r) => `<option ${ev.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></label>`;
    }
    return '';
  }

  function eventFormHtml() {
    const def = EV[ev.k];
    const hasMin = def.f.includes('minute');
    const ordered = def.f.filter((x) => x !== 'minute' && x !== 'number' && x !== 'pos');
    const rowsB = def.f.filter((x) => x === 'minute' || x === 'number' || x === 'pos');
    const r = roster(ev.team);
    const usesRoster = def.f.some((x) => ['player', 'in', 'out'].includes(x)) && !['ref', 'coach'].includes(def.k);
    const on = S.activeBanner === 'sp:form';
    const st = pstat(team(ev.team).id, ev.pid);
    const warn =
      ev.k === 'yellow' && ev.pid && st.y >= 1 && !st.r
        ? `<div class="sp-warn">⚠ ${esc(ev.player)} já tem amarelo — vai ao ar como <b>2º amarelo (expulsão)</b> e sai de campo.</div>`
        : (ev.k === 'red' || ev.k === 'yellow') && st.r
          ? `<div class="sp-warn">⚠ ${esc(ev.player)} já foi expulso.</div>`
          : ev.k === 'goal' && ev.pid && st.g
            ? `<div class="sp-note">⚽ ${esc(ev.player)} já marcou ${st.g} ${st.g > 1 ? 'gols' : 'gol'} neste jogo.</div>`
            : '';
    return `<div class="sp-form">
      <div class="sp-form-title"><span>${def.ico}</span><strong>${def.label}</strong>${on ? '<span class="pill live" style="margin-left:auto">NO AR</span>' : ''}</div>
      ${ordered.map(fieldHtml).join('')}
      ${warn}
      ${rowsB.length ? `<div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">${rowsB.map(fieldHtml).join('')}</div>` : ''}
      ${usesRoster && !r.length ? `<div class="hint">Dica: cadastre o elenco de ${esc(team(ev.team).name)} em <a href="#" id="sp-goteam">Times</a> para escolher os jogadores com um clique.</div>` : ''}
      ${def.f.length === 0 ? `<div class="hint sp-prev">${esc(payload(def, ev).title)}<br><small>${esc(payload(def, ev).subtitle)}</small></div>` : ''}
      <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <label class="field"><span>Tempo no ar</span><select class="input" id="sp-f-dur" style="width:110px">${DURS.map(([v, l]) => `<option value="${v}" ${v === ev.dur ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${def.k === 'goal' ? `<label class="check sp-chk"><input type="checkbox" id="sp-f-add" ${ev.addScore ? 'checked' : ''}> Somar gol no placar</label>` : ''}
        ${def.k === 'ht' || def.k === 'ft' ? '<span class="hint" style="flex:1;padding-bottom:14px">Também move o cronômetro para este período.</span>' : ''}
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <button class="btn primary grow" id="sp-send">▶ Colocar no ar</button>
        <button class="btn danger" id="sp-off" ${isSpOn() ? '' : 'disabled'} title="Tira o GC de futebol do ar">✕ Tirar</button>
      </div>
      ${hasMin ? '<div class="hint">O minuto vem do cronômetro; edite se precisar.</div>' : ''}</div>`;
  }

  function periodsHtml() {
    const cur = sp().period;
    return PERIODS.map((p) => `<button class="${p.id === cur ? 'active' : ''}" data-p="${p.id}">${p.btn}</button>`).join('');
  }

  // ---------------- lance a lance ----------------
  function logHtml() {
    const L = match().log;
    if (!L.length) return '<div class="empty">Gols, cartões, pênaltis e substituições enviados aparecem aqui — dá para reexibir ou desfazer.</div>';
    const paired = new Set(L.map((e) => e.pair).filter(Boolean)); // amarelo que faz parte do "2º amarelo"
    return [...L]
      .reverse()
      .filter((e) => !paired.has(e.id))
      .map((e) => {
        const t = teamById(e.tid) || team(sideOf(e));
        const ico = e.second ? '🟨🟥' : EV[e.k]?.ico || '•';
        const what = e.k === 'sub' ? `<b>▲ ${esc(e.inName || '—')}</b> <span class="hint">▼ ${esc(e.outName || '—')}</span>` : `<b>${esc(e.name || (e.k === 'goal' ? `Gol do ${t.name}` : EV[e.k]?.label || ''))}</b>${e.second ? ' <span class="hint">2º amarelo</span>' : ''}`;
        return `<div class="sp-log-it" data-id="${e.id}"><span class="sp-log-min">${e.minute ? esc(e.minute) + "'" : '–'}</span><span class="sp-log-ico">${ico}</span><span class="sp-log-tx">${what}<small><i style="background:${t.color}"></i>${esc(t.abbr || abbrOf(t.name))}</small></span><button class="btn ghost sm icon" data-log="replay" title="Mostrar este GC de novo">▶</button><button class="btn ghost sm icon" data-log="undo" title="Desfazer lance${e.k === 'goal' && e.scored ? ' (tira o gol do placar)' : ''}">↶</button></div>`;
      })
      .join('');
  }
  function paintLog() {
    const box = $('#sp-log');
    if (!box) return;
    box.innerHTML = logHtml();
    $$('.sp-log-it', box).forEach((row) => {
      row.onclick = async (e) => {
        const b = e.target.closest('[data-log]');
        if (!b) return;
        if (b.dataset.log === 'replay') replayLog(row.dataset.id);
        else if (await confirmDialog('Desfazer este lance?', { ok: 'Desfazer', danger: true })) undoLog(row.dataset.id);
      };
    });
  }

  // ---------------- escalação (quem está em campo) ----------------
  function lineupHtml() {
    const t = team(luSide);
    const ps = t.players || [];
    const seg = `<div class="seg" id="sp-lu-side">${['home', 'away'].map((sd) => `<button class="${luSide === sd ? 'active' : ''}" data-sd="${sd}">${esc(team(sd).name)}</button>`).join('')}</div>`;
    if (!t.id) return seg + '<div class="hint" style="margin-top:8px">Escolha o time da partida em “Times e competição”.</div>';
    if (!ps.length) return seg + `<div class="empty" style="margin-top:8px">${esc(t.name)} ainda não tem elenco. <a href="#" data-lu="edit">Cadastrar jogadores</a></div>`;
    const on = new Set(onField(luSide));
    const chip = (p) => {
      const st = pstat(t.id, p.id);
      return `<button type="button" class="pk ${on.has(p.id) ? 'sel' : ''} ${st.out || st.r ? 'gone' : ''}" data-lup="${p.id}" title="${on.has(p.id) ? 'Em campo — clique para mandar ao banco' : 'Banco — clique para colocar em campo'}"><b>${esc(p.num || '–')}</b><span>${esc(p.name)}</span>${badgeHtml(st)}</button>`;
    };
    const inF = ps.filter((p) => on.has(p.id)).sort(byNum);
    const bench = ps.filter((p) => !on.has(p.id)).sort(byNum);
    return `${seg}
      <div class="pk-lbl" style="margin-top:10px">Em campo · <b class="${inF.length > 11 ? 'warn' : ''}">${inF.length}</b></div><div class="pk-grid">${inF.map(chip).join('') || '<span class="hint">ninguém</span>'}</div>
      <div class="pk-lbl">Banco / fora · ${bench.length}</div><div class="pk-grid">${bench.map(chip).join('') || '<span class="hint">ninguém</span>'}</div>
      <div class="row" style="gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn sm" data-lu="starters" title="Volta para os titulares marcados no cadastro">↺ Titulares do cadastro</button><button class="btn sm ghost" data-lu="edit">✎ Editar elenco</button></div>
      <div class="hint" style="margin-top:6px">Clique num jogador para alternar entre campo e banco. Substituições e expulsões atualizam isso sozinhas.</div>`;
  }
  function paintLineup() {
    const box = $('#sp-lu');
    if (!box) return;
    box.innerHTML = lineupHtml();
    $$('[data-sd]', box).forEach(
      (b) =>
        (b.onclick = () => {
          luSide = b.dataset.sd;
          paintLineup();
        }),
    );
    $$('[data-lup]', box).forEach(
      (b) =>
        (b.onclick = () => {
          const on = onField(luSide);
          const i = on.indexOf(b.dataset.lup);
          if (i >= 0) on.splice(i, 1);
          else on.push(b.dataset.lup);
          saveStudio();
          paintLineup();
          paintForm(false);
        }),
    );
    $$('[data-lu]', box).forEach(
      (b) =>
        (b.onclick = (e) => {
          e.preventDefault();
          const t = team(luSide);
          if (b.dataset.lu === 'edit') return t.id ? openTeamModal(t) : openTeamModal(null, luSide);
          delete match().on[t.id];
          onField(luSide);
          saveStudio();
          paintLineup();
          paintForm(false);
          toast('Escalação inicial restaurada', 'ok');
        }),
    );
  }

  function render() {
    const p = $('#panel-sports');
    if (!p) return;
    used = true;
    const s = sp();
    const h = team('home');
    const a = team('away');
    p.innerHTML = `
      <h4>Partida e times</h4>
      <label class="field" style="margin-bottom:8px"><span>Competição (aparece no pré-jogo e no GC “Confronto”)</span><input class="input" id="sp-comp" maxlength="40" autocomplete="off" placeholder="Ex.: Brasileirão Série A · Rodada 12" value="${esc(s.comp)}"></label>
      <div class="field" style="margin-bottom:8px"><span>Confronto da partida</span>
        <div class="sp-match">
          <div class="sp-team-card" style="--c:${h.color}">
            <span class="sp-tm-badge" style="--c:${h.color}" title="${esc(h.name)}">${h.logo ? `<img src="${esc(h.logo)}" alt="">` : esc((h.abbr || abbrOf(h.name)).slice(0, 3))}</span>
            <select class="input" id="sp-home" aria-label="Mandante" title="Escolha o time mandante">${teamOpts(s.home.tid)}</select>
            <button class="btn ghost sm icon" id="sp-edit-home" title="Editar dados e elenco do Mandante">✎</button>
            <button class="btn ghost sm icon" id="sp-new-home" title="Cadastrar novo time para Mandante">＋</button>
          </div>
          <button class="btn sm icon" id="sp-swap" title="Inverter mandante e visitante">⇄</button>
          <div class="sp-team-card" style="--c:${a.color}">
            <span class="sp-tm-badge" style="--c:${a.color}" title="${esc(a.name)}">${a.logo ? `<img src="${esc(a.logo)}" alt="">` : esc((a.abbr || abbrOf(a.name)).slice(0, 3))}</span>
            <select class="input" id="sp-away" aria-label="Visitante" title="Escolha o time visitante">${teamOpts(s.away.tid)}</select>
            <button class="btn ghost sm icon" id="sp-edit-away" title="Editar dados e elenco do Visitante">✎</button>
            <button class="btn ghost sm icon" id="sp-new-away" title="Cadastrar novo time para Visitante">＋</button>
          </div>
        </div>
        <div class="sp-match-lbl"><span>Mandante</span><span>Visitante</span></div>
      </div>
      <div class="row" style="gap:8px;margin-bottom:12px;align-items:center">
        <button class="btn sm grow" id="sp-newteam">${icons.plus} Cadastrar novo time</button>
        <button class="btn sm ghost" id="sp-lib-toggle" title="Mostrar ou ocultar a lista de times salvos">📋 Times salvos (${teams().length})</button>
      </div>
      <div class="sp-lib-wrap" id="sp-lib-wrap" hidden>
        <div class="field"><span style="margin-bottom:4px">Todos os times salvos</span><div class="sp-lib" id="sp-lib">${libraryHtml()}</div></div>
      </div>

      <h4>Placar e cronômetro</h4>
      <div class="sp-board">
        <div class="sp-side"><i class="sp-chip" style="background:${h.color}"></i><b title="${esc(h.name)}">${esc(h.abbr || abbrOf(h.name))}</b>
          <div class="sp-score"><button class="btn sm icon" data-s="home:-1" title="−1 gol" aria-label="Tirar gol do mandante">−</button><output id="sp-sc-h">${s.home.score}</output><button class="btn sm icon primary" data-s="home:1" title="+1 gol" aria-label="Gol do mandante">＋</button></div></div>
        <div class="sp-mid"><button class="sp-clockbtn" id="sp-clockbtn" title="Clique para ajustar o relógio"><output id="sp-clock">${clockText()}</output></button><small id="sp-per">${PER[s.period].label}</small><small class="sp-mode" id="sp-modetag">${s.mode === 'down' ? '▼ regressivo' : '▲ progressivo'}</small></div>
        <div class="sp-side"><i class="sp-chip" style="background:${a.color}"></i><b title="${esc(a.name)}">${esc(a.abbr || abbrOf(a.name))}</b>
          <div class="sp-score"><button class="btn sm icon" data-s="away:-1" title="−1 gol" aria-label="Tirar gol do visitante">−</button><output id="sp-sc-a">${s.away.score}</output><button class="btn sm icon primary" data-s="away:1" title="+1 gol" aria-label="Gol do visitante">＋</button></div></div>
      </div>
      <div class="sp-adj" id="sp-adj" hidden><input class="input" id="sp-adj-v" maxlength="6" inputmode="numeric" placeholder="mm:ss"><button class="btn sm primary" id="sp-adj-ok">OK</button><button class="btn sm ghost" id="sp-adj-x">Cancelar</button><span class="hint" id="sp-adj-h"></span></div>
      <div class="row" style="gap:6px;margin:10px 0 8px;flex-wrap:wrap">
        <button class="btn primary grow" id="sp-run">${running() ? '⏸ Pausar' : '▶ Iniciar'}</button>
        <button class="btn" id="sp-set" title="Ajustar o relógio">⏱ Ajustar</button>
        <button class="btn" id="sp-next" title="Avançar para o próximo período">⏭ Próximo</button>
        <button class="btn ghost" id="sp-zero" title="Zerar placar, relógio e período">↺ Novo jogo</button>
      </div>
      <div class="field"><span>Período da partida</span><div class="seg sp-periods" id="sp-periods">${periodsHtml()}</div></div>
      <div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap">
        <label class="field grow"><span>Posição do placar na tela</span><select class="input" id="sp-pos">${SB_POS.map(([k, l]) => `<option value="${k}" ${k === s.pos ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <button class="btn ${scoreOn ? 'danger' : 'primary'}" id="sp-air" style="margin-bottom:14px">${scoreOn ? '✕ Tirar placar' : '▶ Placar no ar'}</button>
      </div>

      <h4>GCs esportivos</h4>
      <div class="sp-events" id="sp-events">${EVENTS.map((e) => `<button class="sp-ev ${e.k === ev.k ? 'on' : ''}" data-k="${e.k}" title="${e.label}"><span>${e.ico}</span><em>${e.label}</em></button>`).join('')}</div>
      <div id="sp-form">${eventFormHtml()}</div>

      <h4>Lance a lance</h4>
      <div class="sp-log" id="sp-log"></div>

      <h4>Escalação em campo</h4>
      <div id="sp-lu"></div>

      <h4>Relógio e regras da partida</h4>
      <div class="field"><span>Contagem do cronômetro</span><div class="seg" id="sp-mode"><button data-m="up" class="${s.mode === 'up' ? 'active' : ''}">▲ Progressivo</button><button data-m="down" class="${s.mode === 'down' ? 'active' : ''}">▼ Regressivo</button></div>
        <div class="hint" id="sp-mode-h">${s.mode === 'down' ? `Conta de ${s.half}:00 até 00:00 em cada tempo.` : `Conta de 00:00 até ${s.half}:00 (depois mostra os acréscimos, ex.: ${s.half}+2').`}</div></div>
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
        <label class="field" style="margin:0"><span>Cada tempo (min)</span><input class="input" type="number" id="sp-half" min="1" max="60" style="width:110px" value="${s.half}"></label>
        <label class="field" style="margin:0"><span>Prorrogação (min)</span><input class="input" type="number" id="sp-et" min="1" max="30" style="width:110px" value="${s.et}"></label>
      </div>
      <label class="check" id="sp-stop-w" ${s.mode === 'down' ? '' : 'hidden'}><input type="checkbox" id="sp-stop" ${s.stopAtZero ? 'checked' : ''}> Parar automaticamente no 00:00 (desmarcado: segue contando os acréscimos, ex.: +01:30)</label>
      <div class="field"><span>Modelos esportivos</span><div class="sp-presets">${PRESETS.map((x) => `<button class="btn sm ${s.half === x.half && s.mode === x.mode ? 'on' : ''}" data-pr="${x.k}" title="${x.half} min por tempo · ${x.mode === 'down' ? 'regressivo' : 'progressivo'}">${x.label} <small>${x.half}'</small></button>`).join('')}</div></div>
      <p class="hint" style="margin:10px 0 0">Em qualquer GC ou banner você pode escrever <code>{mandante}</code>, <code>{visitante}</code>, <code>{placar}</code>, <code>{competicao}</code> ou <code>{tempo}</code> — o texto é trocado na hora de ir ao ar.</p>`;
    bind(p);
  }

  function openAdjust() {
    const box = $('#sp-adj');
    if (!box) return;
    const s = sp();
    if (!span()) return toast('Escolha um período com cronômetro (1º/2º tempo ou prorrogação)', 'err');
    box.hidden = false;
    const inp = $('#sp-adj-v', box);
    inp.value = /^\d+:\d{2}$/.test(clockText()) ? clockText() : mmss(Math.floor(elapsed() / 1000));
    $('#sp-adj-h', box).textContent = s.mode === 'down' ? 'tempo que falta' : 'tempo de jogo';
    inp.focus();
    inp.select();
    const ok = () => setClock(inp.value) && (box.hidden = true);
    $('#sp-adj-ok', box).onclick = ok;
    $('#sp-adj-x', box).onclick = () => (box.hidden = true);
    // bloco com if: devolver false no onkeydown cancela a tecla (nada seria digitado)
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') ok();
      else if (e.key === 'Escape') box.hidden = true;
    };
  }

  function bind(p) {
    const s = sp();
    $$('[data-s]', p).forEach((b) => {
      b.onclick = () => {
        const [side, d] = b.dataset.s.split(':');
        bumpScore(side, +d);
      };
    });
    $('#sp-run', p).onclick = () => setRunning(!running());
    $('#sp-set', p).onclick = openAdjust;
    $('#sp-clockbtn', p).onclick = openAdjust;
    $('#sp-next', p).onclick = () => setPeriod(NEXT[s.period]);
    $('#sp-zero', p).onclick = async () => {
      if (!(await confirmDialog('Começar um novo jogo?\n\nZera placar, cronômetro, período e o lance a lance; a escalação volta aos titulares do cadastro.', { ok: 'Novo jogo', danger: true }))) return;
      s.home.score = s.away.score = 0;
      s.match = { on: {}, log: [] };
      ev.player = ev.in = ev.out = ev.pid = ev.inId = ev.outId = '';
      setPeriod('pre');
      paintScore();
      paintLog();
      paintLineup();
      paintForm(false);
    };
    $$('#sp-periods button', p).forEach((b) => (b.onclick = () => setPeriod(b.dataset.p)));
    $('#sp-pos', p).onchange = (e) => {
      s.pos = e.target.value;
      saveStudio();
      if (scoreOn) comp.wg.show('score', 'score', snapshot, s.pos);
    };
    $('#sp-air', p).onclick = () => airScore(!scoreOn);

    // relógio e regras
    $$('#sp-mode button', p).forEach(
      (b) =>
        (b.onclick = () => {
          setRules({ mode: b.dataset.m });
          render();
        }),
    );
    const num = (el, min, max, key) => {
      el.onchange = () => {
        const v = Math.round(+el.value);
        if (!(v >= min && v <= max)) {
          el.value = s[key];
          return toast(`Use um valor entre ${min} e ${max} minutos`, 'err');
        }
        setRules({ [key]: v });
        render();
      };
    };
    num($('#sp-half', p), 1, 60, 'half');
    num($('#sp-et', p), 1, 30, 'et');
    $('#sp-stop', p).onchange = (e) => setRules({ stopAtZero: e.target.checked });
    $$('[data-pr]', p).forEach(
      (b) =>
        (b.onclick = () => {
          const x = PRESETS.find((y) => y.k === b.dataset.pr);
          setRules({ half: x.half, et: x.et, mode: x.mode });
          toast(`Modelo ${x.label}: ${x.half} min por tempo, ${x.mode === 'down' ? 'regressivo' : 'progressivo'}`, 'ok');
          render();
        }),
    );

    // times e partida
    $('#sp-comp', p).oninput = (e) => {
      s.comp = e.target.value;
      saveStudio();
    };
    $('#sp-home', p).onchange = (e) => setSide('home', e.target.value);
    $('#sp-away', p).onchange = (e) => setSide('away', e.target.value);
    $('#sp-edit-home', p).onclick = () => {
      const t = team('home');
      if (t.id) openTeamModal(t, 'home');
      else openTeamModal(null, 'home');
    };
    $('#sp-new-home', p).onclick = () => openTeamModal(null, 'home');
    $('#sp-edit-away', p).onclick = () => {
      const t = team('away');
      if (t.id) openTeamModal(t, 'away');
      else openTeamModal(null, 'away');
    };
    $('#sp-new-away', p).onclick = () => openTeamModal(null, 'away');
    $('#sp-swap', p).onclick = () => {
      [s.home, s.away] = [s.away, s.home];
      ev.team = ev.team === 'home' ? 'away' : 'home';
      saveStudio();
      render();
      onAir();
    };
    $('#sp-newteam', p).onclick = () => openTeamModal(null, !s.home.tid ? 'home' : !s.away.tid ? 'away' : null);
    const libToggle = $('#sp-lib-toggle', p);
    if (libToggle) {
      libToggle.onclick = () => {
        const wrap = $('#sp-lib-wrap', p);
        if (wrap) wrap.hidden = !wrap.hidden;
      };
    }
    $$('#sp-lib .sp-tm', p).forEach((row) => {
      const t = teams().find((x) => x.id === row.dataset.id);
      row.onclick = (e) => {
        const b = e.target.closest('[data-tm]');
        if (!b || !t) return;
        if (b.dataset.tm === 'edit') openTeamModal(t);
        else deleteTeam(t);
      };
    });

    $$('#sp-events .sp-ev', p).forEach((b) => {
      b.onclick = () => {
        if (ev.k !== b.dataset.k) {
          ev.player = ev.in = ev.out = ev.pid = ev.inId = ev.outId = '';
          ev.number = '';
          ev.pos = '';
        }
        ev.k = b.dataset.k;
        ev.minuteEdited = false;
        $$('#sp-events .sp-ev', p).forEach((x) => x.classList.toggle('on', x === b));
        paintForm(!roster(ev.team).length);
      };
    });
    bindForm(p);
    paintLog();
    paintLineup();
  }

  function paintForm(focus = true) {
    const box = $('#sp-form');
    if (!box) return;
    box.innerHTML = eventFormHtml();
    bindForm($('#panel-sports'));
    if (focus) $('#sp-f-player')?.focus();
  }
  function bindForm(p) {
    const read = () => {
      const v = (id) => $(id, p)?.value;
      if ($('#sp-f-player', p)) ev.player = v('#sp-f-player');
      if ($('#sp-f-in', p)) ev.in = v('#sp-f-in');
      if ($('#sp-f-out', p)) ev.out = v('#sp-f-out');
      if ($('#sp-f-text', p)) ev.text = v('#sp-f-text');
      if ($('#sp-f-number', p)) ev.number = v('#sp-f-number').replace(/\D/g, '');
      if ($('#sp-f-pos', p)) ev.pos = v('#sp-f-pos');
      if ($('#sp-f-n', p)) ev.n = +v('#sp-f-n');
      if ($('#sp-f-role', p)) ev.role = v('#sp-f-role');
      ev.dur = +v('#sp-f-dur');
      if ($('#sp-f-add', p)) ev.addScore = $('#sp-f-add', p).checked;
      // nome digitado diferente do jogador escolhido: desfaz o vínculo com o cadastro
      const nameOf = (id) => roster(ev.team).find((x) => x.id === id)?.name;
      for (const [f, key] of [['player', 'pid'], ['in', 'inId'], ['out', 'outId']]) {
        if (ev[key] && nameOf(ev[key]) !== ev[f]) {
          ev[key] = '';
          $$(`#sp-form .pk.sel[data-pk="${f}"]`, p).forEach((x) => x.classList.remove('sel'));
        }
      }
    };
    $$('#sp-form input, #sp-form select', p).forEach((el) => {
      el.oninput = read;
      el.onchange = read;
      el.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          $('#sp-send', p)?.click();
        }
      };
    });
    const minute = $('#sp-f-minute', p);
    if (minute)
      minute.oninput = () => {
        ev.minute = minute.value;
        ev.minuteEdited = !!minute.value.trim();
      };
    // escolher um jogador do elenco preenche camisa e posição (GC de escalação)
    const pl = $('#sp-f-player', p);
    if (pl && ev.k === 'lineup')
      pl.addEventListener('change', () => {
        const hit = roster(ev.team).find((x) => x.name.toLowerCase() === pl.value.trim().toLowerCase());
        if (!hit) return;
        if (hit.num && $('#sp-f-number', p)) $('#sp-f-number', p).value = ev.number = hit.num;
        if (hit.pos && $('#sp-f-pos', p)) $('#sp-f-pos', p).value = ev.pos = hit.pos;
      });
    // um clique no jogador preenche o campo (de novo no mesmo: desmarca)
    $$('#sp-form [data-pk]', p).forEach((b) => {
      b.onclick = () => {
        read();
        const pl = roster(ev.team).find((x) => x.id === b.dataset.pid);
        if (!pl) return;
        const f = b.dataset.pk;
        const key = { player: 'pid', in: 'inId', out: 'outId' }[f];
        if (ev[key] === pl.id) {
          ev[key] = '';
          ev[f] = '';
        } else {
          ev[key] = pl.id;
          ev[f] = pl.name;
          if (ev.k === 'lineup') {
            ev.number = pl.num || '';
            ev.pos = pl.pos || '';
          }
        }
        paintForm(false);
      };
    });
    $$('#sp-f-team button', p).forEach((b) => {
      b.onclick = () => {
        if (ev.team === b.dataset.t) return;
        read();
        ev.team = b.dataset.t;
        ev.player = ev.in = ev.out = ev.pid = ev.inId = ev.outId = ''; // elenco do outro time
        paintForm(false); // elenco/técnico mudam com o time
      };
    });
    $('#sp-goteam', p)?.addEventListener('click', (e) => {
      e.preventDefault();
      const t = team(ev.team);
      if (t.id) openTeamModal(t);
      else openTeamModal(null, ev.team);
    });
    const send = $('#sp-send', p);
    if (send)
      send.onclick = () => {
        read();
        sendForm();
      };
    const off = $('#sp-off', p);
    if (off) off.onclick = () => isSpOn() && toggleBanner(S.activeBanner);
  }

  // ---------------- atualizações pontuais (sem recriar o painel) ----------------
  function paintScore() {
    const s = sp();
    const set = (id, v) => {
      const el = $(id);
      if (el) el.textContent = v;
    };
    set('#sp-sc-h', s.home.score);
    set('#sp-sc-a', s.away.score);
  }
  function paintClock() {
    const txt = clockText();
    const el = $('#sp-clock');
    if (el && el.textContent !== txt) el.textContent = txt;
    const dk = $('#deck-clock');
    if (dk && dk.textContent !== txt) dk.textContent = txt;
    const per = $('#sp-per');
    if (per) per.textContent = PER[sp().period].label;
    const run = $('#sp-run');
    if (run) run.textContent = running() ? '⏸ Pausar' : '▶ Iniciar';
  }
  function paintPeriods() {
    const box = $('#sp-periods');
    if (box) {
      box.innerHTML = periodsHtml();
      $$('button', box).forEach((b) => (b.onclick = () => setPeriod(b.dataset.p)));
    }
  }
  function paintAir() {
    const a = $('#sp-air');
    if (a) {
      a.className = 'btn ' + (scoreOn ? 'danger' : 'primary');
      a.textContent = scoreOn ? '✕ Tirar placar' : '▶ Placar no ar';
    }
    const off = $('#sp-off');
    if (off) off.disabled = !isSpOn();
    const t = $('#sp-form .sp-form-title');
    if (t) {
      const pill = $('.pill.live', t);
      const on = S.activeBanner === 'sp:form';
      if (on && !pill) t.insertAdjacentHTML('beforeend', '<span class="pill live" style="margin-left:auto">NO AR</span>');
      if (!on && pill) pill.remove();
    }
  }
  setInterval(() => {
    const s = sp();
    // regressivo: para sozinho no 00:00
    if (s.runAt && s.mode === 'down' && s.stopAtZero) {
      const sp_ = span();
      if (sp_ && elapsed() >= sp_[1] * 1000) {
        s.base = sp_[1] * 1000;
        s.runAt = 0;
        saveStudio();
        toast(`Fim do ${PER[s.period].btn} — 00:00`, 'ok');
        onAir();
      }
    }
    if (document.hidden) return;
    paintClock();
    const m = $('#sp-f-minute');
    if (m && !ev.minuteEdited && document.activeElement !== m) m.value = minuteLabel();
  }, 500);

  // ---------------- barra de controle ----------------
  // atalhos de GC de futebol (aparecem no seletor de GC da barra)
  function gcItems() {
    const s = sp(); // a barra só mostra estes atalhos com "Esportes" ativado (ver deckOn em studio.js)
    const h = team('home').name;
    const a = team('away').name;
    const list = [
      { id: 'sp:match', title: `🆚 ${h} x ${a}` },
      { id: 'sp:goal:home', title: `⚽ Gol — ${h}` },
      { id: 'sp:goal:away', title: `⚽ Gol — ${a}` },
      { id: 'sp:scoreline', title: `🔢 Placar ${s.home.score} x ${s.away.score}` },
      { id: 'sp:ht', title: '⏸ Intervalo' },
      { id: 'sp:ft', title: '🏁 Fim de jogo' },
    ];
    if (S.activeBanner === 'sp:form') list.unshift({ id: 'sp:form', title: S.activeBannerTitle || 'GC de futebol' });
    return list;
  }
  // placar como item da seção "Tela" da barra
  function deckItems() {
    const s = sp();
    return [{ id: 'score', label: `🏆 Placar ${team('home').abbr} ${s.home.score} x ${s.away.score} ${team('away').abbr}`, on: scoreOn }];
  }

  return {
    render,
    paintAir,
    clearAir: () => scoreOn && airScore(false),
    fill,
    quick,
    gcItems,
    deckItems,
    toggleScore: () => airScore(!scoreOn),
    toggleClock: () => setRunning(!running()),
    clock: () => ({ text: clockText(), running: running(), timed: !!span() || sp().period === 'pre' }),
  };
}
