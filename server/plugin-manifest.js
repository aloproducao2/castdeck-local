// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Validação de manifesto, versões e capacidades dos plugins (API 1).
export const API_VERSION = 1;

export const CAPABILITIES = {
  'events:chat': 'ler as mensagens do chat',
  'events:stage': 'saber quem está no ar e no palco',
  'events:recording': 'saber quando a gravação começa e termina',
  'overlay:show': 'desenhar aviso no programa',
  'panel:open': 'abrir um painel próprio',
  'control:mixer': 'mudar volume e mudo',
  'control:scene': 'trocar a cena',
  'control:playout': 'tocar e parar mídia',
  'chat:send': 'responder no chat',
  'network': 'acessar a internet (só nos endereços declarados)',
  'storage:own': 'gravar na própria pasta',
  'storage:read:media': 'ler as mídias do estúdio',
  'secrets:own': 'guardar um token próprio (cifrado)',
  'webhook:receive': 'receber avisos externos',
};

// capacidades que o usuário precisa aprovar explicitamente (as demais são implícitas)
export const CAPACIDADES_SENSIVEIS = new Set([
  'events:chat',
  'overlay:show',
  'control:mixer',
  'control:scene',
  'control:playout',
  'chat:send',
  'storage:read:media',
  'webhook:receive',
]);

const ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/; // castdeck.luz, com.autor.plugin
const EXT_PROIBIDAS = ['.exe', '.dll', '.node', '.bat', '.cmd', '.ps1', '.sh', '.msi', '.scr', '.com'];
const TAMANHO_MAX = 20 * 1024 * 1024;

export function vence(versao, faixa) {
  // parser mínimo de faixa semver: *, ^x.y.z, ~x.y.z, >=x, <=x, >x, <x, =x (combináveis por espaço)
  const v = String(versao || '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  const partes = String(faixa || '*').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return true;
  return partes.every((p) => {
    const m = p.match(/^(>=|<=|>|<|=|\^|~)?\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
    if (!m) return true; // faixa desconhecida: não bloqueia
    const op = m[1] || '=';
    const alvo = [Number(m[2]), Number(m[3] || 0), Number(m[4] || 0)];
    const c = cmp(v, alvo);
    if (op === '>=') return c >= 0;
    if (op === '<=') return c <= 0;
    if (op === '>') return c > 0;
    if (op === '<') return c < 0;
    if (op === '^') return c >= 0 && v[0] === alvo[0];
    if (op === '~') return c >= 0 && v[0] === alvo[0] && v[1] === alvo[1];
    return c === 0;
  });
}

export function validarManifesto(m, { castdeckVersion = '0.0.0' } = {}) {
  const erros = [];
  const avisos = [];
  if (!m || typeof m !== 'object') return { ok: false, erros: ['manifesto ausente'], avisos };

  if (!m.id || !ID_RE.test(m.id)) erros.push('id inválido (use letras minúsculas, números, ponto ou hífen: ex. castdeck.luz)');
  if (m.id && /^castdeck\./.test(m.id) && m.author?.name && !/flue\.live|kallemback/i.test(String(m.author?.name))) {
    avisos.push('id castdeck.* é reservado aos plugins oficiais');
  }
  if (!m.name || String(m.name).length > 60) erros.push('name obrigatório (até 60 caracteres)');
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(String(m.version || ''))) erros.push('version deve ser semver (x.y.z)');
  if (!m.license) erros.push('license obrigatória (SPDX, ex. MIT ou AGPL-3.0-only)');
  if (!m.engines || Number(m.engines.api) !== API_VERSION) erros.push(`engines.api deve ser ${API_VERSION}`);
  if (!m.engines?.castdeck || !vence(castdeckVersion, m.engines.castdeck)) {
    erros.push(`incompatível com o CastDeck ${castdeckVersion} (engines.castdeck: ${m.engines?.castdeck || '—'})`);
  }
  if (!['declarative', 'code'].includes(m.tier)) erros.push('tier deve ser "declarative" ou "code"');
  if (m.tier === 'code' && !m.entry) erros.push('plugin de código precisa de entry (ex. "src/index.js")');

  const perms = Array.isArray(m.permissions) ? m.permissions : [];
  for (const p of perms) {
    if (!p.startsWith('network:') && !CAPABILITIES[p]) erros.push(`permissão desconhecida: ${p}`);
    if (p.startsWith('network:') && !CAPABILITIES['network']) erros.push('network inválido');
  }
  if (m.tier === 'declarative' && !Array.isArray(m.rules) && !Array.isArray(m.triggers)) {
    erros.push('plugin declarativo precisa de "rules" (ou triggers/actions)');
  }

  for (const campo of [m.entry, ...(m.panels || []).map((p) => p?.entry), ...(m.overlays || []).map((o) => o?.entry)]) {
    if (!campo) continue;
    if (campo.includes('..') || campo.startsWith('/') || /^[a-z]+:/i.test(campo)) erros.push(`caminho inválido: ${campo}`);
    if (EXT_PROIBIDAS.some((e) => String(campo).toLowerCase().endsWith(e))) erros.push(`extensão proibida: ${campo}`);
  }

  return { ok: erros.length === 0, erros, avisos };
}

// Varredura de código: barreira extra além do processo separado.
const PROIBIDOS = [
  [/require\s*\(\s*['"]node:(child_process|fs|fs\/promises|net|http|https|http2|dns|tls|cluster|worker_threads|vm|v8|module)['"]/g, 'módulo perigoso'],
  [/from\s+['"]node:(child_process|fs|fs\/promises|net|http|https|http2|dns|tls|cluster|worker_threads|vm|v8|module)['"]/g, 'módulo perigoso'],
  [/require\s*\(\s*['"](child_process|fs|net|http|https|dns|tls|cluster|worker_threads|vm)['"]/g, 'módulo perigoso'],
  [/process\.binding|process\.dlopen|\bglobalThis\.process\.mainModule\b/g, 'acesso ao processo'],
  [/eval\s*\(/g, 'eval'],
  [/new\s+Function\s*\(/g, 'new Function'],
];

export function varrerCodigo(texto, arquivo = '') {
  const achados = [];
  for (const [re, motivo] of PROIBIDOS) {
    re.lastIndex = 0;
    if (re.test(texto)) achados.push(`${motivo}${arquivo ? ` em ${arquivo}` : ''}`);
  }
  return achados;
}

export function validarPacote(entradas, { castdeckVersion = '0.0.0' } = {}) {
  const erros = [];
  let total = 0;
  const manifestos = entradas.filter((e) => /(^|\/)plugin\.json$/.test(e.name));
  for (const e of entradas) {
    total += e.data.length;
    const ext = e.name.toLowerCase().slice(e.name.lastIndexOf('.'));
    if (EXT_PROIBIDAS.includes(ext)) erros.push(`arquivo proibido no pacote: ${e.name}`);
    if (/\.(js|mjs|cjs)$/i.test(e.name)) {
      const achados = varrerCodigo(e.data.toString('utf8'), e.name);
      for (const a of achados) erros.push(`código bloqueado (${a})`);
    }
  }
  if (total > TAMANHO_MAX) erros.push(`pacote muito grande (${(total / 1048576).toFixed(1)} MB; máximo 20 MB)`);
  if (manifestos.length !== 1) erros.push('o pacote precisa ter exatamente um plugin.json (na raiz)');
  return { ok: erros.length === 0, erros };
}

// Permissões efetivas: `network:` vira lista de hosts
export function normalizarPermissoes(perms) {
  const caps = new Set();
  const hosts = [];
  for (const p of perms || []) {
    if (String(p).startsWith('network:')) {
      const host = String(p).slice('network:'.length).trim().toLowerCase();
      if (host) hosts.push(host);
      caps.add('network');
    } else if (String(p) === 'network') {
      caps.add('network');
    } else caps.add(p);
  }
  return { caps, hosts };
}

// Host permitido para requisições (aceita "api.exemplo.com", "api.exemplo.com:8080" e "https://api.exemplo.com/base")
export function hostPermitido(url, hosts) {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const alvo = u.hostname.toLowerCase();
    const alvoComPorta = u.host.toLowerCase();
    const caminho = u.href.toLowerCase();
    return (hosts || []).some((h) => {
      const limpo = h.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();
      if (!limpo) return false;
      if (limpo === alvo || limpo === alvoComPorta) return true;
      if (limpo.includes(':')) return limpo === alvoComPorta;
      return alvo.endsWith(`.${limpo}`) || caminho.startsWith(h.toLowerCase());
    });
  } catch {
    return false;
  }
}

export function descreverPermissoes(perms) {
  return (perms || []).map((p) => {
    if (String(p).startsWith('network:')) return `acessar ${String(p).slice(8)}`;
    return CAPABILITIES[p] || p;
  });
}
