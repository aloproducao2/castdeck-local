// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Template Studio do GC: biblioteca de templates, modo Operador e designer em modal.
// O render no PGM é feito por overlays.js (style:'custom'), o mesmo da prévia.
import { drawBanner } from './overlays.js';

const uid = () => 'gc-' + Math.random().toString(36).slice(2, 9);

const LAYER_DEFAULTS = {
  rect: { type: 'rect', x: 80, y: 820, w: 900, h: 120, fill: 'brand', radius: 10 },
  text: { type: 'text', key: 'name', x: 110, y: 835, w: 840, h: 54, size: 46, weight: 800, color: '#ffffff', align: 'left' },
  tag: { type: 'tag', key: 'tag', x: 80, y: 760, w: 190, h: 42, size: 20, bg: '#ef4444', color: '#ffffff' },
  image: { type: 'image', src: 'brand', x: 1600, y: 820, w: 240, h: 120 },
  qr: { type: 'qr', key: 'qr', x: 1680, y: 120, w: 180, h: 180, qrColor: '#ffffff', opacity: 1 },
};

const BUILTINS = [
  {
    id: 'gc-glass',
    name: 'Broadcast Glass',
    builtin: true,
    category: 'Entrevista',
    fav: true,
    fields: ['name', 'role', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 76, y: 812, w: 980, h: 144, fill: '#080d1c', fill2: '#131d38', gradDir: 'd', radius: 18, opacity: 0.94, shadow: true, stroke: '#ffffff', strokeOp: 0.2, strokeW: 2, accentBar: 'brandLight', accentBar2: 'brand', accentW: 12, topHighlight: 'rgba(255,255,255,0.22)', topHighlightH: 2 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 118, y: 830, w: 880, h: 60, size: 46, weight: 800, font: 'display' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 118, y: 894, w: 880, h: 38, size: 25, weight: 500, color: '#cbd5e1' },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 96, y: 764, w: 230, h: 40, size: 17, bg: '#ef4444', bg2: '#b91c1c', pill: true, dot: true, shadow: true, stroke: '#ffffff', strokeOp: 0.22 },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1620, y: 816, w: 220, h: 132 },
    ],
  },
  {
    id: 'gc-lower-third',
    name: 'Lower third Pro',
    builtin: true,
    category: 'Entrevista',
    fav: true,
    fields: ['name', 'role', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 80, y: 816, w: 980, h: 136, fill: 'brand', fill2: 'brandDark', gradDir: 'd', radius: 16, opacity: 0.96, shadow: true, stroke: '#ffffff', strokeOp: 0.24, strokeW: 2, accentBar: '#ffffff', accentW: 8 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 116, y: 834, w: 910, h: 58, size: 46, weight: 800, font: 'display' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 116, y: 896, w: 910, h: 38, size: 26, weight: 600, color: '#f1f5f9' },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 80, y: 762, w: 220, h: 42, size: 18, bg: '#ef4444', bg2: '#dc2626', radius: 10, dot: true, shadow: true },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1600, y: 818, w: 240, h: 132 },
    ],
  },
  {
    id: 'gc-podcast',
    name: 'Podcast & Criador',
    builtin: true,
    category: 'Criador',
    fav: true,
    fields: ['name', 'role', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 84, y: 822, w: 860, h: 130, fill: '#0b0b15', fill2: '#1d1635', gradDir: 'd', radius: 26, opacity: 0.95, shadow: true, stroke: 'brandLight', strokeOp: 0.55, strokeW: 2.5 },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 112, y: 774, w: 240, h: 38, size: 17, bg: 'brand', bg2: 'brandLight', pill: true, shadow: true },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 118, y: 840, w: 780, h: 56, size: 44, weight: 800, font: 'display' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 118, y: 898, w: 780, h: 34, size: 24, weight: 500, color: '#c4b5fd' },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1620, y: 820, w: 220, h: 120 },
    ],
  },
  {
    id: 'gc-esporte',
    name: 'Esporte / Repórter',
    builtin: true,
    category: 'Esportes',
    fav: true,
    fields: ['name', 'role', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 96, y: 822, w: 940, h: 128, fill: '#071426', fill2: '#102b4c', gradDir: 'h', radius: 10, opacity: 0.96, shadow: true, skew: -10, stroke: '#ffffff', strokeOp: 0.18, strokeW: 2, accentBar: '#10b981', accentBar2: '#34d399', accentW: 16 },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 120, y: 774, w: 230, h: 38, size: 18, bg: '#059669', bg2: '#10b981', skew: -10, radius: 6, dot: true, shadow: true },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 136, y: 838, w: 860, h: 56, size: 46, weight: 900, font: 'display', upper: true },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 130, y: 896, w: 860, h: 36, size: 24, weight: 600, color: '#a7f3d0' },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1620, y: 820, w: 220, h: 128 },
    ],
  },
  {
    id: 'gc-hard',
    name: 'Hard news TV',
    builtin: true,
    category: 'Jornalismo',
    fav: true,
    fields: ['headline', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 0, y: 842, w: 1920, h: 160, fill: '#0b1020', fill2: '#16203a', gradDir: 'h', radius: 0, opacity: 0.97, shadow: true, topHighlight: '#38bdf8', topHighlightH: 4, accentBar: '#dc2626', accentBar2: '#991b1b', accentW: 16 },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 64, y: 790, w: 260, h: 48, size: 23, bg: '#dc2626', bg2: '#991b1b', radius: 8, dot: true, shadow: true },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'headline', x: 80, y: 866, w: 1500, h: 68, size: 48, weight: 900, font: 'display', upper: true },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1660, y: 858, w: 200, h: 110 },
    ],
  },
  {
    id: 'gc-strap',
    name: 'Minimalista Glass',
    builtin: true,
    category: 'Crédito',
    fav: false,
    fields: ['name', 'role'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 76, y: 892, w: 180, h: 7, fill: 'brandLight', fill2: 'brand', radius: 4, shadow: true },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 76, y: 802, w: 940, h: 68, size: 54, weight: 900, font: 'display' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 76, y: 912, w: 940, h: 38, size: 26, weight: 600, color: '#e2e8f0' },
    ],
  },
  {
    id: 'gc-breaking',
    name: 'Plantão Urgente',
    builtin: true,
    category: 'Jornalismo',
    fav: true,
    fields: ['headline', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 0, y: 786, w: 1920, h: 214, fill: '#0a0f1d', fill2: '#240b14', gradDir: 'h', radius: 0, opacity: 0.96, shadow: true, accentBar: '#ef4444', accentBar2: '#b91c1c', accentW: 18, topHighlight: '#ef4444', topHighlightH: 4 },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 56, y: 808, w: 260, h: 46, size: 22, bg: '#ef4444', bg2: '#b91c1c', radius: 8, dot: true, shadow: true },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'headline', x: 56, y: 868, w: 1620, h: 82, size: 52, weight: 900, font: 'display', upper: true },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1700, y: 826, w: 170, h: 112 },
    ],
  },
  {
    id: 'gc-opening',
    name: 'Abertura / Título',
    builtin: true,
    category: 'Marca',
    fav: false,
    fields: ['name', 'role', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 0, y: 0, w: 1920, h: 1080, fill: '#070a14', fill2: 'brandDark', gradDir: 'd', radius: 0, opacity: 0.94 },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 740, y: 596, w: 440, h: 7, fill: 'brandLight', fill2: 'brand', radius: 4 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 160, y: 380, w: 1600, h: 112, size: 82, weight: 900, align: 'center', font: 'display' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 160, y: 516, w: 1600, h: 54, size: 30, weight: 600, align: 'center', color: '#cbd5e1' },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 760, y: 650, w: 400, h: 46, size: 20, bg: 'brand', bg2: 'brandLight', pill: true, shadow: true },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 830, y: 196, w: 260, h: 130 },
    ],
  },
  {
    id: 'gc-compact',
    name: 'Entrevista compacta',
    builtin: true,
    category: 'Entrevista',
    fav: false,
    fields: ['name', 'role', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 72, y: 846, w: 780, h: 108, fill: '#0b1224', fill2: '#18223d', gradDir: 'd', radius: 14, opacity: 0.96, shadow: true, stroke: '#ffffff', strokeOp: 0.16, strokeW: 1.5, accentBar: 'brandLight', accentBar2: 'brand', accentW: 9 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 104, y: 858, w: 710, h: 48, size: 38, weight: 900, font: 'display' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 104, y: 906, w: 710, h: 30, size: 22, weight: 600, color: '#cbd5e1' },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 72, y: 796, w: 190, h: 36, size: 17, bg: 'brand', bg2: 'brandLight', pill: true, shadow: true },
    ],
  },
  {
    id: 'gc-auction-premium',
    name: 'Leilão — Premium',
    builtin: true,
    category: 'Leilão',
    fav: true,
    required: ['item', 'bid'],
    fields: ['item', 'lot', 'weight', 'priceKg', 'priceArroba', 'bid', 'bidder', 'payment', 'contact', 'seller', 'clock', 'qr', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 0, y: 748, w: 1920, h: 332, fill: '#04271e', fill2: '#073c2e', gradDir: 'h', radius: 0, opacity: 0.97, shadow: true },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 0, y: 744, w: 1920, h: 5, fill: '#d4a93c', fill2: '#f5d77a', radius: 0 },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 36, y: 30, w: 330, h: 128, fill: '#06120e', radius: 12, opacity: 0.9, stroke: '#d4a93c', strokeOp: 0.35 },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 54, y: 44, w: 294, h: 64 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'seller', x: 56, y: 112, w: 292, h: 28, size: 16, weight: 700, color: '#bfe8d0' },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 36, y: 168, w: 180, h: 36, size: 17, bg: '#145c43', pill: true, dot: true },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1500, y: 28, w: 260, h: 100 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'clock', x: 1540, y: 140, w: 150, h: 36, size: 28, weight: 900, color: '#f5d77a', align: 'right' },
      { ...LAYER_DEFAULTS.qr, id: uid(), key: 'qr', x: 1710, y: 118, w: 170, h: 170, qrColor: '#ffffff' },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 40, y: 650, w: 220, h: 92, fill: '#0b3d2c', fill2: '#0f543d', gradDir: 'v', radius: 12, stroke: '#ffffff', strokeOp: 0.14 },
      { ...LAYER_DEFAULTS.text, id: uid(), text: 'PESO MÉDIO', x: 56, y: 662, w: 188, h: 22, size: 15, weight: 700, color: '#a7d8c4' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'weight', x: 56, y: 686, w: 188, h: 50, size: 36, weight: 900, color: '#f5d77a' },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 1320, y: 650, w: 250, h: 92, fill: '#0b3d2c', fill2: '#0f543d', gradDir: 'v', radius: 12, stroke: '#ffffff', strokeOp: 0.14 },
      { ...LAYER_DEFAULTS.text, id: uid(), text: 'VALOR POR KG', x: 1338, y: 662, w: 214, h: 22, size: 15, weight: 700, color: '#a7d8c4' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'priceKg', x: 1338, y: 686, w: 214, h: 48, size: 34, weight: 900, color: '#f5d77a' },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 1584, y: 650, w: 296, h: 92, fill: '#0b3d2c', fill2: '#0f543d', gradDir: 'v', radius: 12, stroke: '#ffffff', strokeOp: 0.14 },
      { ...LAYER_DEFAULTS.text, id: uid(), text: 'VALOR POR @', x: 1602, y: 662, w: 260, h: 22, size: 15, weight: 700, color: '#a7d8c4' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'priceArroba', x: 1602, y: 686, w: 260, h: 48, size: 34, weight: 900, color: '#f5d77a' },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 40, y: 760, w: 220, h: 280, fill: '#095239', fill2: '#0d6e4d', gradDir: 'v', radius: 14, stroke: '#d4a93c', strokeOp: 0.35 },
      { ...LAYER_DEFAULTS.text, id: uid(), text: 'LOTE', x: 62, y: 778, w: 176, h: 26, size: 17, weight: 800, color: '#bfe8d0' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'lot', x: 54, y: 812, w: 192, h: 150, size: 100, weight: 900, color: '#f5d77a', align: 'center' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'item', x: 290, y: 786, w: 1000, h: 76, size: 50, weight: 900, color: '#ffffff' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'contact', x: 290, y: 872, w: 1000, h: 34, size: 20, weight: 600, color: '#bfe8d0' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'bidder', x: 290, y: 916, w: 700, h: 32, size: 19, weight: 700, color: '#f5d77a' },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 1320, y: 760, w: 560, h: 280, fill: '#0b4431', fill2: '#0f5b42', gradDir: 'd', radius: 14, stroke: '#d4a93c', strokeOp: 0.45 },
      { ...LAYER_DEFAULTS.text, id: uid(), text: 'LANCE ATUAL', x: 1350, y: 778, w: 500, h: 28, size: 17, weight: 800, color: '#bfe8d0' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'bid', x: 1350, y: 810, w: 500, h: 92, size: 62, weight: 900, color: '#f5d77a' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'payment', x: 1350, y: 930, w: 500, h: 34, size: 20, weight: 700, color: '#bfe8d0' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'seller', x: 1350, y: 972, w: 500, h: 26, size: 16, weight: 600, color: '#8fc3ac' },
    ],
  },
  {
    id: 'gc-auction',
    name: 'Leilão — Compacto',
    builtin: true,
    category: 'Leilão',
    fav: true,
    required: ['item', 'bid'],
    fields: ['item', 'bid', 'bidder', 'lot', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 48, y: 736, w: 1824, h: 278, fill: '#081020', fill2: '#131d36', gradDir: 'd', radius: 16, opacity: 0.96, shadow: true, stroke: '#f59e0b', strokeOp: 0.35, accentBar: '#f59e0b', accentBar2: '#fbbf24', accentW: 12 },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 82, y: 756, w: 220, h: 40, size: 18, bg: '#d97706', bg2: '#f59e0b', pill: true },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'item', x: 82, y: 814, w: 1420, h: 66, size: 48, weight: 900, font: 'display' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'bid', x: 82, y: 892, w: 560, h: 76, size: 54, weight: 900, color: '#fbbf24' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'bidder', x: 700, y: 898, w: 700, h: 42, size: 25, weight: 600, color: '#e2e8f0' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'lot', x: 82, y: 972, w: 500, h: 28, size: 18, weight: 600, color: '#94a3b8' },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1600, y: 804, w: 220, h: 132 },
    ],
  },
];

const clone = (v) => JSON.parse(JSON.stringify(v));
// Texto com `text` é rótulo fixo do layout, não um slot de dado. Remove o `key`
// herdado de LAYER_DEFAULTS.text para não ser sobrescrito por nome/manchete.
for (const t of BUILTINS) for (const l of t.layers || []) if (l.text && l.key) delete l.key;
const BASE_FIELDS = ['name', 'role', 'tag', 'headline'];
const FIELD_LABELS = {
  name: 'Nome', role: 'Cargo / função', tag: 'Etiqueta', headline: 'Manchete',
  item: 'Item / lote', bid: 'Lance atual', bidder: 'Arrematante', lot: 'Lote', note: 'Observação',
  weight: 'Peso médio', priceKg: 'Valor por kg', priceArroba: 'Valor por @', payment: 'Pagamento',
  contact: 'Contato / telefone', seller: 'Vendedor', clock: 'Relógio', qr: 'Link do QR',
};
const fieldLabel = (k) => FIELD_LABELS[k] || k.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const extraKeysFor = (tpl) => [...new Set((tpl.layers || []).map((l) => l.key).filter((k) => k && !BASE_FIELDS.includes(k)))];

// Variantes 9:16 (1080×1920). As regras que apontam para a camada horizontal
// encontram a equivalente vertical pelo mesmo `key`.
function buildVerticalLayouts() {
  const byKey = (t, key, type) => t.layers.find((l) => l.key === key && (!type || l.type === type));
  const cp = (t, key, type, o = {}) => {
    const src = byKey(t, key, type);
    return src ? { ...clone(src), ...o, id: uid() } : null;
  };
  const rect = (o) => ({ ...clone(LAYER_DEFAULTS.rect), id: uid(), ...o });
  const text = (s, o, style = {}) => ({ ...clone(LAYER_DEFAULTS.text), id: uid(), key: undefined, text: s, ...style, ...o });
  const image = (t, o) => cp(t, null, 'image', o) || { ...clone(LAYER_DEFAULTS.image), id: uid(), ...o };
  const tag = (t, o) => cp(t, 'tag', 'tag', o);
  const push = (arr, ...items) => { for (const it of items) if (it) arr.push(it); return arr; };

  for (const t of BUILTINS) {
    const v = [];
    if (t.id === 'gc-glass') {
      push(v,
        rect({ x: 36, y: 1460, w: 1008, h: 356, fill: '#080d1c', fill2: '#131d38', gradDir: 'd', radius: 22, opacity: 0.94, shadow: true, stroke: '#ffffff', strokeOp: 0.2, strokeW: 2, accentBar: 'brandLight', accentBar2: 'brand', accentW: 12 }),
        tag(t, { x: 64, y: 1408, w: 250, h: 42, size: 18, bg: '#ef4444', bg2: '#b91c1c', pill: true, dot: true, shadow: true }),
        cp(t, 'name', 'text', { x: 76, y: 1500, w: 740, h: 86, size: 54, weight: 800, font: 'display' }),
        cp(t, 'role', 'text', { x: 76, y: 1600, w: 740, h: 52, size: 26, color: '#cbd5e1' }),
        image(t, { x: 840, y: 1530, w: 170, h: 170 })
      );
    } else if (t.id === 'gc-lower-third') {
      push(v,
        rect({ x: 40, y: 1460, w: 1000, h: 360, fill: 'brand', fill2: 'brandDark', gradDir: 'd', radius: 18, opacity: 0.96, shadow: true, stroke: '#ffffff', strokeOp: 0.24, strokeW: 2, accentBar: '#ffffff', accentW: 10 }),
        tag(t, { x: 68, y: 1484, w: 220, h: 46, size: 20, bg: '#ef4444', bg2: '#dc2626', radius: 10, dot: true }),
        cp(t, 'name', 'text', { x: 98, y: 1548, w: 700, h: 76, size: 58, font: 'display' }),
        cp(t, 'role', 'text', { x: 98, y: 1632, w: 700, h: 44, size: 26 }),
        image(t, { x: 830, y: 1540, w: 180, h: 180 })
      );
    } else if (t.id === 'gc-podcast') {
      push(v,
        rect({ x: 48, y: 1490, w: 984, h: 320, fill: '#0b0b15', fill2: '#1d1635', gradDir: 'd', radius: 28, opacity: 0.95, shadow: true, stroke: 'brandLight', strokeOp: 0.55, strokeW: 2.5 }),
        tag(t, { x: 80, y: 1440, w: 260, h: 42, size: 18, bg: 'brand', bg2: 'brandLight', pill: true, shadow: true }),
        cp(t, 'name', 'text', { x: 88, y: 1532, w: 730, h: 80, size: 52, font: 'display' }),
        cp(t, 'role', 'text', { x: 88, y: 1624, w: 730, h: 48, size: 26, color: '#c4b5fd' }),
        image(t, { x: 830, y: 1550, w: 170, h: 170 })
      );
    } else if (t.id === 'gc-esporte') {
      push(v,
        rect({ x: 52, y: 1500, w: 976, h: 310, fill: '#071426', fill2: '#102b4c', gradDir: 'h', radius: 12, opacity: 0.96, shadow: true, skew: -8, stroke: '#ffffff', strokeOp: 0.18, accentBar: '#10b981', accentBar2: '#34d399', accentW: 16 }),
        tag(t, { x: 80, y: 1452, w: 240, h: 40, size: 18, bg: '#059669', bg2: '#10b981', skew: -8, radius: 6, dot: true }),
        cp(t, 'name', 'text', { x: 96, y: 1536, w: 720, h: 78, size: 52, font: 'display', upper: true }),
        cp(t, 'role', 'text', { x: 92, y: 1626, w: 720, h: 44, size: 25, color: '#a7f3d0' }),
        image(t, { x: 830, y: 1550, w: 160, h: 160 })
      );
    } else if (t.id === 'gc-hard' || t.id === 'gc-breaking') {
      push(v,
        rect({ x: 0, y: 1500, w: 1080, h: 420, fill: '#0b1020', fill2: t.id === 'gc-breaking' ? '#240b14' : '#16203a', gradDir: 'h', radius: 0, opacity: 0.97, topHighlight: t.id === 'gc-breaking' ? '#ef4444' : '#38bdf8', topHighlightH: 4 }),
        rect({ x: 0, y: 1500, w: 14, h: 420, fill: '#ef4444', fill2: '#b91c1c', radius: 0 }),
        tag(t, { x: 48, y: 1524, w: 260, h: 48, size: 22, bg: '#dc2626', bg2: '#991b1b', radius: 8, dot: true }),
        cp(t, 'headline', 'text', { x: 48, y: 1600, w: 780, h: 160, size: 46, font: 'display', upper: true }),
        image(t, { x: 850, y: 1540, w: 170, h: 170 })
      );
    } else if (t.id === 'gc-strap') {
      push(v,
        rect({ x: 80, y: 1450, w: 180, h: 8, fill: 'brandLight', fill2: 'brand', radius: 4 }),
        cp(t, 'name', 'text', { x: 80, y: 1488, w: 900, h: 82, size: 58, font: 'display' }),
        cp(t, 'role', 'text', { x: 80, y: 1582, w: 900, h: 44, size: 26 })
      );
    } else if (t.id === 'gc-opening') {
      push(v,
        rect({ x: 0, y: 0, w: 1080, h: 1920, fill: '#070a14', fill2: 'brandDark', gradDir: 'd', radius: 0, opacity: 0.94 }),
        rect({ x: 340, y: 1000, w: 400, h: 8, fill: 'brandLight', fill2: 'brand', radius: 4 }),
        image(t, { x: 410, y: 390, w: 260, h: 130 }),
        cp(t, 'name', 'text', { x: 80, y: 720, w: 920, h: 120, size: 76, align: 'center', font: 'display' }),
        cp(t, 'role', 'text', { x: 80, y: 870, w: 920, h: 54, size: 28, align: 'center' }),
        tag(t, { x: 390, y: 1030, w: 300, h: 48, size: 19, bg: 'brand', bg2: 'brandLight', pill: true })
      );
    } else if (t.id === 'gc-compact') {
      push(v,
        rect({ x: 40, y: 1560, w: 820, h: 270, fill: '#0b1224', fill2: '#18223d', gradDir: 'd', radius: 14, opacity: 0.96, shadow: true, stroke: '#ffffff', strokeOp: 0.16, accentBar: 'brandLight', accentBar2: 'brand', accentW: 9 }),
        cp(t, 'name', 'text', { x: 74, y: 1590, w: 760, h: 66, size: 42, font: 'display' }),
        cp(t, 'role', 'text', { x: 74, y: 1664, w: 760, h: 38, size: 23 }),
        tag(t, { x: 40, y: 1504, w: 190, h: 40, size: 17, bg: 'brand', bg2: 'brandLight', pill: true })
      );
    } else if (t.id === 'gc-auction-premium') {
      push(v,
        rect({ x: 0, y: 1240, w: 1080, h: 680, fill: '#052e24', radius: 0, opacity: 0.97 }),
        rect({ x: 0, y: 1236, w: 1080, h: 5, fill: '#d4a93c', radius: 0 }),
        rect({ x: 300, y: 32, w: 400, h: 128, fill: '#06120e', radius: 12, opacity: 0.9 }),
        image(t, { x: 316, y: 48, w: 368, h: 64 }),
        cp(t, 'seller', 'text', { x: 316, y: 112, w: 368, h: 28, size: 16, weight: 700, color: '#bfe8d0' }),
        tag(t, { x: 300, y: 176, w: 220, h: 40, size: 17 }),
        cp(t, 'qr', 'qr', { x: 840, y: 28, w: 190, h: 190 }),
        cp(t, 'clock', 'text', { x: 720, y: 226, w: 110, h: 34, size: 24, align: 'right', color: '#f5d77a' }),
        rect({ x: 32, y: 1260, w: 250, h: 150, fill: '#0d4a36', radius: 12 }),
        text('PESO MÉDIO', { x: 48, y: 1274, w: 218, h: 22, size: 15, color: '#a7d8c4' }),
        cp(t, 'weight', 'text', { x: 48, y: 1300, w: 218, h: 72, size: 46, color: '#f5d77a' }),
        rect({ x: 296, y: 1260, w: 240, h: 150, fill: '#0d4a36', radius: 12 }),
        text('R$/KG', { x: 312, y: 1274, w: 208, h: 22, size: 15, color: '#a7d8c4' }),
        cp(t, 'priceKg', 'text', { x: 312, y: 1300, w: 208, h: 66, size: 38, color: '#f5d77a' }),
        rect({ x: 548, y: 1260, w: 240, h: 150, fill: '#0d4a36', radius: 12 }),
        text('R$/@', { x: 564, y: 1274, w: 208, h: 22, size: 15, color: '#a7d8c4' }),
        cp(t, 'priceArroba', 'text', { x: 564, y: 1300, w: 208, h: 66, size: 36, color: '#f5d77a' }),
        rect({ x: 800, y: 1260, w: 248, h: 260, fill: '#0a5a3f', radius: 12 }),
        text('LOTE', { x: 824, y: 1282, w: 200, h: 24, size: 16, color: '#bfe8d0' }),
        cp(t, 'lot', 'text', { x: 810, y: 1320, w: 228, h: 150, size: 100, align: 'center', color: '#f5d77a' }),
        cp(t, 'item', 'text', { x: 32, y: 1436, w: 740, h: 100, size: 44 }),
        cp(t, 'contact', 'text', { x: 32, y: 1540, w: 740, h: 64, size: 18, color: '#bfe8d0' }),
        rect({ x: 32, y: 1638, w: 1016, h: 240, fill: '#0d4a36', radius: 14 }),
        text('LANCE ATUAL', { x: 60, y: 1658, w: 500, h: 28, size: 17, color: '#bfe8d0' }),
        cp(t, 'bid', 'text', { x: 60, y: 1690, w: 500, h: 88, size: 56, color: '#f5d77a' }),
        cp(t, 'payment', 'text', { x: 570, y: 1690, w: 440, h: 34, size: 19, color: '#bfe8d0' }),
        cp(t, 'seller', 'text', { x: 570, y: 1740, w: 440, h: 30, size: 17, color: '#8fc3ac' }),
        cp(t, 'bidder', 'text', { x: 60, y: 1790, w: 500, h: 34, size: 18, color: '#f5d77a' })
      );
    } else if (t.id === 'gc-auction') {
      push(v,
        rect({ x: 32, y: 1500, w: 1016, h: 360, fill: '#0b1220', radius: 16, opacity: 0.97 }),
        rect({ x: 32, y: 1500, w: 10, h: 360, fill: '#f59e0b', radius: 3 }),
        tag(t, { x: 60, y: 1522, w: 210, h: 38, size: 16 }),
        cp(t, 'item', 'text', { x: 60, y: 1570, w: 780, h: 70, size: 38 }),
        cp(t, 'bid', 'text', { x: 60, y: 1660, w: 500, h: 82, size: 50, color: '#fbbf24' }),
        cp(t, 'bidder', 'text', { x: 600, y: 1680, w: 400, h: 34, size: 20 }),
        cp(t, 'lot', 'text', { x: 60, y: 1774, w: 300, h: 30, size: 18, color: '#94a3b8' }),
        cp(t, 'qr', 'qr', { x: 850, y: 1560, w: 160, h: 160 })
      );
    }
    if (v.length) t.verticalLayers = v;
  }
}
buildVerticalLayouts();
const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hexToRgb = (c) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c || '');
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [124, 92, 255];
};

// Regras de template: o campo/condição controla qualquer camada.
// `value` mantém compatibilidade com templates antigos; `cond` e `act` permitem
// condição textual + ação de tamanho/cor no mesmo registro.
export function resolveGcLayers(tpl, data, which = 'layers') {
  const layers = clone(tpl[which] || []);
  const val = (k) => String(data?.[k] ?? '');
  // Atalho por camada primeiro; regras explícitas podem sobrescrever.
  for (const l of layers) if (l.hideEmpty && l.key && !val(l.key).trim()) l.hidden = true;
  for (const r of tpl.rules || []) {
    const raw = val(r.field);
    const cond = r.cond ?? r.value;
    const text = String(cond ?? '');
    const n = Number(text) || 0;
    const hit = r.op === 'empty' ? !raw.trim()
      : r.op === 'notempty' ? !!raw.trim()
      : r.op === 'equals' ? raw === text
      : r.op === 'notequals' ? raw !== text
      : r.op === 'contains' ? raw.toLowerCase().includes(text.toLowerCase())
      : r.op === 'notcontains' ? !raw.toLowerCase().includes(text.toLowerCase())
      : r.op === 'startswith' ? raw.toLowerCase().startsWith(text.toLowerCase())
      : r.op === 'endswith' ? raw.toLowerCase().endsWith(text.toLowerCase())
      : r.op === 'length>' ? raw.length > n
      : r.op === 'length<' ? raw.length < n
      : r.op === 'gt' ? (Number(raw) || 0) > n
      : r.op === 'lt' ? (Number(raw) || 0) < n
      : false;
    if (!hit) continue;
    let l = layers.find((x) => x.id === r.layer);
    if (!l && which === 'verticalLayers') {
      const original = (tpl.layers || []).find((x) => x.id === r.layer);
      if (original) {
        l = layers.find((x) => x.key && x.key === original.key && x.type === original.type)
          || layers.find((x) => x.key && x.key === original.key);
      }
    }
    if (!l) continue;
    const act = r.act ?? r.value;
    if (r.action === 'hide') l.hidden = true;
    else if (r.action === 'show') l.hidden = false;
    else if (r.action === 'size') l.size = Math.max(12, Math.min(160, Number(act) || l.size));
    else if (r.action === 'color') l.color = act || l.color;
    else if (r.action === 'bg') l.bg = act || l.bg;
    else if (r.action === 'opacity') l.opacity = Math.max(0, Math.min(1, Number(act) || 0));
  }
  return layers;
}

export function ensureGcTemplates(S) {
  if (!Array.isArray(S.gcTemplates)) S.gcTemplates = [];
  if (!S.gcTemplates.length) S.gcTemplates = clone(BUILTINS);
  // Atualiza modelos nativos mantendo os templates personalizados e os favoritos do usuário.
  for (let i = 0; i < BUILTINS.length; i++) {
    const b = BUILTINS[i];
    const cur = S.gcTemplates.find((t) => t.id === b.id);
    if (!cur) {
      S.gcTemplates.splice(Math.min(i, S.gcTemplates.length), 0, clone(b));
    } else if (cur.builtin) {
      const prevFav = cur.fav;
      Object.assign(cur, clone(b));
      if (typeof prevFav === 'boolean') cur.fav = prevFav;
    }
  }
  for (const t of S.gcTemplates) {
    if (!t.category) t.category = 'Personalizado';
    if (t.builtin) for (const l of [...(t.layers || []), ...(t.verticalLayers || [])]) if (l.text && l.key) delete l.key;
  }
}

export function createGcDesigner({ S, comp, modal, esc, icons, toast, saveStudio, brandColor, render, onAir, onSaveBanner, getGuest, getHeadline, allowPopout = false }) {
  ensureGcTemplates(S);
  let selId = S.gcTemplates.some((t) => t.id === S.brand.lastGcTemplate) ? S.brand.lastGcTemplate : S.gcTemplates[0].id;
  let search = '';
  let cat = 'todos';
  let favOnly = false;
  let active = false;
  let activeTplId = null;
  let timer = null;
  let rootEl = null;
  let previewVertical = !!(S.brand?.vOn || S.vlive);
  let previewLiveBg = true;
  const data = {
    name: 'Maria Silva', role: 'Repórter — Brasília', tag: 'AO VIVO', headline: 'Acompanhe a cobertura especial ao vivo', dur: 0,
    item: '01 VACA CRUZADA | ACIMA 36 MESES', bid: 'R$ 4.420,00', bidder: 'Júnior', lot: '86',
    weight: '458', priceKg: 'R$ 9,65', priceArroba: 'R$ 289,46', payment: 'PAGAMENTO À VISTA',
    contact: 'Júnior (18) 99765-9868 · Adriano (18) 99699-9136',
    seller: 'LUCÉLIA LEILÕES', clock: '01:24', qr: 'https://castdeck.local/leilao',
  };
  const findEl = (id) => {
    const selId_ = '#' + id;
    if (rootEl?.isConnected) {
      const hit = rootEl.querySelector(selId_);
      if (hit) return hit;
    }
    return document.getElementById(id) || window.__castdeck?.findInPopout?.(selId_) || null;
  };
  const findAll = (selector) => {
    const out = new Set();
    if (rootEl?.isConnected) for (const el of rootEl.querySelectorAll(selector)) out.add(el);
    for (const el of document.querySelectorAll(selector)) out.add(el);
    for (const el of window.__castdeck?.findAllInPopouts?.(selector) || []) out.add(el);
    return [...out];
  };
  const isFocused = (el) => !!el && el.ownerDocument?.activeElement === el;
  const imgs = new Map();

  const image = (u) => {
    if (!u) return null;
    let im = imgs.get(u);
    if (!im) {
      im = new Image();
      im.onload = () => renderPreview();
      im.src = u;
      imgs.set(u, im);
    }
    return im.complete && im.naturalWidth ? im : null;
  };
  const sel = () => S.gcTemplates.find((t) => t.id === selId) || S.gcTemplates[0];
  const payload = (tpl = sel()) => {
    const d = { ...data, headline: data.headline || data.name, logo: S.brand.logo || null };
    const isHeadline = (tpl.layers || []).some((l) => l.key === 'headline');
    const isItem = (tpl.layers || []).some((l) => l.key === 'item');
    const title = (isHeadline ? d.headline || d.item || d.name : isItem ? d.item || d.name : d.name || d.item) || tpl.name;
    return {
      style: 'custom', title,
      layers: resolveGcLayers(tpl, d),
      verticalLayers: Array.isArray(tpl.verticalLayers) && tpl.verticalLayers.length ? resolveGcLayers(tpl, d, 'verticalLayers') : null,
      data: d, dur: Number(d.dur) || 0,
    };
  };

  function drawPreviewBackground(ctx, W, H, useLive = true) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1e253d');
    g.addColorStop(1, '#0b0e18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Grade sutil de estúdio para facilitar o alinhamento quando sem câmera ao vivo
    ctx.strokeStyle = 'rgba(255,255,255,.035)';
    ctx.lineWidth = 1;
    const stepX = Math.max(24, W / 12);
    const stepY = Math.max(24, H / 8);
    ctx.beginPath();
    for (let x = stepX; x < W; x += stepX) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = stepY; y < H; y += stepY) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    const pgm = useLive ? comp?.canvas : null;
    if (pgm && pgm.width > 0 && pgm.height > 0) {
      const sc = Math.max(W / pgm.width, H / pgm.height);
      const dw = pgm.width * sc;
      const dh = pgm.height * sc;
      try {
        ctx.drawImage(pgm, (W - dw) / 2, (H - dh) / 2, dw, dh);
        ctx.fillStyle = 'rgba(6, 8, 16, 0.14)';
        ctx.fillRect(0, 0, W, H);
        return;
      } catch {}
    }
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.36, Math.min(W, H) * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(W * 0.34, H * 0.54, W * 0.32, H * 0.5);
  }

  function draw(canvas, tpl, selectedIndex = -1, opts = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const vert = opts.vert !== undefined ? !!opts.vert : H > W;
    const liveBg = opts.liveBg !== undefined ? !!opts.liveBg : previewLiveBg;
    const sw = opts.sw || (vert ? 1080 : 1920);
    const sh = opts.sh || (vert ? 1920 : 1080);
    const t0 = opts.t0 !== undefined ? opts.t0 : performance.now() - 2000;

    drawPreviewBackground(ctx, W, H, liveBg);
    const p = payload(tpl);
    drawBanner({ ctx, W, H, vertical: vert, image, banner: { ...p, t0 } }, hexToRgb(brandColor()), performance.now(), 0, 0);

    // área de segurança (5%)
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
    ctx.setLineDash([]);

    if (opts.guideX != null) {
      const gx = (opts.guideX / sw) * W;
      ctx.strokeStyle = 'rgba(56,189,248,.85)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (opts.guideY != null) {
      const gy = (opts.guideY / sh) * H;
      ctx.strokeStyle = 'rgba(56,189,248,.85)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const activeList = vert && Array.isArray(tpl.verticalLayers) && tpl.verticalLayers.length ? tpl.verticalLayers : tpl.layers;
    const l = activeList?.[selectedIndex];
    if (l) {
      const rx = (l.x / sw) * W;
      const ry = (l.y / sh) * H;
      const rw = (l.w / sw) * W;
      const rh = (l.h / sh) * H;
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#11101d';
      ctx.lineWidth = 1;
      for (const [hx, hy] of [
        [rx, ry], [rx + rw / 2, ry], [rx + rw, ry],
        [rx + rw, ry + rh / 2], [rx + rw, ry + rh],
        [rx + rw / 2, ry + rh], [rx, ry + rh], [rx, ry + rh / 2],
      ]) {
        ctx.fillRect(hx - 4, hy - 4, 8, 8);
        ctx.strokeRect(hx - 4, hy - 4, 8, 8);
      }
    }
  }

  function drawThumb(canvas, tpl) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#11101d';
    ctx.fillRect(0, 0, W, H);
    const p = payload(tpl);
    drawBanner({ ctx, W, H, image, banner: { ...p, t0: performance.now() - 2000 } }, hexToRgb(brandColor()), performance.now(), 0, 0);
  }

  function syncFields() {
    for (const [id, key] of [['gc-name', 'name'], ['gc-role', 'role'], ['gc-tag', 'tag'], ['gc-headline', 'headline']]) {
      const el = findEl(id);
      if (el && !isFocused(el) && el.value !== String(data[key] ?? '')) el.value = String(data[key] ?? '');
    }
    for (const el of findAll('[data-gc-extra]')) {
      const k = el.dataset.gcExtra;
      if (k && !isFocused(el) && el.value !== String(data[k] ?? '')) el.value = String(data[k] ?? '');
    }
    const dur = findEl('gc-dur');
    if (dur && !isFocused(dur) && Number(dur.value) !== Number(data.dur || 0)) dur.value = String(Number(data.dur) || 0);
  }

  function renderPreview() {
    syncFields();
    const curTpl = sel();
    for (const cv of findAll('#gc-prev')) {
      const w = previewVertical ? 360 : 640;
      const h = previewVertical ? 640 : 360;
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
      cv.classList.toggle('is-vertical', previewVertical);
      draw(cv, curTpl, -1, { vert: previewVertical, liveBg: previewLiveBg });
    }
    const pv = findEl('gc-prev-orient');
    if (pv) pv.textContent = previewVertical ? '9:16' : '16:9';
    const bgBtn = findEl('gc-prev-bg');
    if (bgBtn) bgBtn.textContent = previewLiveBg ? '🎥 PGM' : '⬛ Grade';
    for (const thumb of findAll(`[data-thumb="${CSS.escape(curTpl.id)}"]`)) {
      drawThumb(thumb, curTpl);
    }
    const state = findEl('gc-op-state');
    if (state) {
      state.textContent = active ? 'NO AR' : '';
      state.className = 'gc-op-state' + (active ? ' on' : '');
    }
    const air = findEl('gc-air');
    if (air) air.textContent = active ? 'Atualizar no ar' : 'Colocar no ar';
    const off = findEl('gc-op-off');
    if (off) off.disabled = !active;
    const airline = findEl('gc-airline');
    if (airline) airline.classList.toggle('on', active);
    const airlineTitle = findEl('gc-airline-title');
    if (airlineTitle) airlineTitle.textContent = active ? (S.activeBannerTitle || curTpl.name) : 'Fora do ar';
    const airlineStop = findEl('gc-airline-stop');
    if (airlineStop) airlineStop.disabled = !active;
    const tpl = curTpl;
    const hasHeadline = tpl.layers.some((l) => l.key === 'headline');
    const hasName = tpl.layers.some((l) => l.key === 'name');
    const nameEmpty = !String(data.name || '').trim();
    const headEmpty = !String(data.headline || '').trim();
    const requiredEmpty = (tpl.required || []).filter((k) => !String(data[k] ?? '').trim());
    const missing = (hasName && nameEmpty) || (hasHeadline && headEmpty) || (!hasName && !hasHeadline && nameEmpty && headEmpty) || requiredEmpty.length > 0;
    const warn = findEl('gc-warn');
    if (warn) {
      warn.hidden = !missing;
      warn.textContent = requiredEmpty.length
        ? `Preencha ${requiredEmpty.map(fieldLabel).join(' e ')} antes de ir ao ar.`
        : hasHeadline && headEmpty ? 'Preencha a manchete antes de ir ao ar.' : 'Preencha o nome antes de ir ao ar.';
    }
    if (air) air.disabled = missing && !active;
  }

  // Atualiza a prévia ao vivo periodicamente quando o painel estiver visível (inclusive em janela destacada/PiP)
  setInterval(() => {
    const cvs = findAll('#gc-prev');
    for (const cv of cvs) {
      if (!cv.isConnected || cv.ownerDocument?.visibilityState === 'hidden') continue;
      const r = cv.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        draw(cv, sel(), -1, { vert: previewVertical, liveBg: previewLiveBg });
      }
    }
  }, 260);

  function apply(tpl = sel()) {
    activeTplId = tpl.id;
    const p = payload(tpl);
    if (active && comp.banner) {
      // atualiza sem reiniciar a animação de entrada
      comp.banner = { ...comp.banner, ...p, t0: comp.banner.t0, hiding: false };
    } else {
      comp.showBanner(p);
      active = true;
    }
    S.activeBanner = 'gc:air';
    S.activeBannerTitle = p.title;
    clearTimeout(timer);
    if (p.dur > 0) timer = setTimeout(stop, p.dur * 1000);
    renderPreview();
    onAir?.();
  }

  function stop() {
    clearTimeout(timer);
    comp.hideBanner();
    // Garante a saída mesmo se o compositor estiver sem frames no momento do clique.
    setTimeout(() => {
      if (comp.banner?.style === 'custom' && comp.banner.hiding) comp.banner = null;
    }, 600);
    if (S.activeBanner === 'gc:air') {
      S.activeBanner = null;
      S.activeBannerTitle = null;
    }
    active = false;
    activeTplId = null;
    renderPreview();
    const off = findEl('gc-op-off');
    if (off) off.disabled = true;
    const airlineStop = findEl('gc-airline-stop');
    if (airlineStop) airlineStop.disabled = true;
    onAir?.();
  }

  function dynFieldsHtml(tpl) {
    const hasHeadline = tpl.layers.some((l) => l.key === 'headline');
    const hasName = tpl.layers.some((l) => l.key === 'name');
    const hasRole = tpl.layers.some((l) => l.key === 'role');
    const hasTag = tpl.layers.some((l) => l.key === 'tag');
    const extraKeys = extraKeysFor(tpl).filter((k) => k !== 'headline');
    const fieldOrder = [...new Set(tpl.fields && tpl.fields.length ? tpl.fields : [...BASE_FIELDS, ...extraKeys])];
    const fieldHtml = (k) => {
      if (k === 'name') return `<label class="field" id="gc-name-wrap" ${hasName ? '' : 'hidden'}><span>Nome</span><input class="input" id="gc-name" maxlength="60" value="${escAttr(data.name)}"></label>`;
      if (k === 'role') return `<label class="field" id="gc-role-wrap" ${hasRole ? '' : 'hidden'}><span>Cargo / função</span><input class="input" id="gc-role" maxlength="80" value="${escAttr(data.role)}"></label>`;
      if (k === 'tag') return `<label class="field" id="gc-tag-wrap" ${hasTag ? '' : 'hidden'}><span>Etiqueta</span><input class="input" id="gc-tag" maxlength="20" value="${escAttr(data.tag)}"></label>`;
      if (k === 'headline') return `<label class="field" id="gc-headline-wrap" ${hasHeadline ? '' : 'hidden'}><span>Manchete</span><input class="input" id="gc-headline" maxlength="120" value="${escAttr(data.headline)}"></label>`;
      return `<label class="field"><span>${esc(fieldLabel(k))}</span><input class="input" data-gc-extra="${escAttr(k)}" maxlength="120" value="${escAttr(data[k] ?? '')}"></label>`;
    };
    return fieldOrder.map(fieldHtml).join('');
  }

  function operatorHtml() {
    const tpl = sel();
    return `
      <div class="gc-op">
        <div class="gc-airline ${active ? 'on' : ''}" id="gc-airline">
          <span class="gc-airline-dot"></span>
          <b id="gc-airline-title">${active ? esc(S.activeBannerTitle || tpl.name) : 'Fora do ar'}</b>
          <button class="btn danger sm" id="gc-airline-stop" ${active ? '' : 'disabled'}>Tirar do ar</button>
        </div>
        <div class="gc-op-head">
          <h4>Grafismo ao vivo <span class="hint" id="gc-op-state"></span></h4>
          <div class="row" style="gap:4px">
            <button class="btn ghost sm" id="gc-prev-bg" title="Alternar fundo entre vídeo do PGM e grade de estúdio">${previewLiveBg ? '🎥 PGM' : '⬛ Grade'}</button>
            <button class="btn ghost sm" id="gc-prev-orient" title="Alternar prévia 16:9 / 9:16">${previewVertical ? '9:16' : '16:9'}</button>
            <button class="btn ghost sm" id="gc-new-tpl">${icons.plus} Novo template</button>
          </div>
        </div>
        <div class="gc-lib-tools">
          <input class="input" id="gc-search" placeholder="Buscar template…" value="${escAttr(search)}" autocomplete="off">
          <select class="input" id="gc-cat"><option value="todos">Todas as categorias</option>${[...new Set(S.gcTemplates.map((t) => t.category || 'Personalizado'))].map((c) => `<option value="${escAttr(c)}" ${cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <button class="btn ghost sm ${favOnly ? 'primary' : ''}" id="gc-fav" title="Só favoritos">★</button>
        </div>
        <div class="gc-tpl-row">${S.gcTemplates.map((t) => `<div class="gc-tpl ${t.id === selId ? 'sel' : ''}" data-gct="${escAttr(t.id)}" data-cat="${escAttr(t.category || 'Personalizado')}" data-name="${escAttr(String(t.name).toLowerCase())}" tabindex="0" role="button"><canvas class="gc-thumb" data-thumb="${escAttr(t.id)}" width="160" height="90"></canvas><span class="gc-tpl-meta"><b>${esc(t.name)}</b><small>${esc(t.category || 'Personalizado')}${t.autoGuest ? ' · auto convidado' : ''}${t.autoRss ? ' · auto RSS' : ''}</small></span><button class="gc-star ${t.fav ? 'on' : ''}" data-favbtn="${escAttr(t.id)}" title="Favorito">★</button>${t.builtin ? '' : `<button class="gc-del" data-deltpl="${escAttr(t.id)}" title="Excluir template" aria-label="Excluir template ${escAttr(t.name)}">${icons.trash || '🗑'}</button>`}</div>`).join('')}</div>
        <div class="gc-auto-row"><button class="btn ghost sm" id="gc-fill-guest">Do convidado</button><button class="btn ghost sm" id="gc-fill-rss">Do RSS</button><span id="gc-auto-hints">${tpl.autoGuest ? '<span class="hint">auto: convidado</span>' : ''}${tpl.autoRss ? '<span class="hint">auto: RSS</span>' : ''}</span></div>
        ${schedHtml()}
        <p class="hint" id="gc-empty" hidden>Nenhum template com esse filtro.</p>
        <div class="gc-op-grid">
          <canvas id="gc-prev" width="${previewVertical ? 360 : 640}" height="${previewVertical ? 640 : 360}" class="${previewVertical ? 'is-vertical' : ''}"></canvas>
          <div class="gc-op-fields">
            <div id="gc-dyn-fields">${dynFieldsHtml(tpl)}</div>
            <div class="row" style="gap:8px">
              <label class="field grow"><span>Duração</span><select class="input" id="gc-dur">${[0, 5, 8, 10, 15, 30].map((n) => `<option value="${n}" ${Number(data.dur) === n ? 'selected' : ''}>${n ? n + ' s' : 'Manual'}</option>`).join('')}</select></label>
            </div>
            <div class="gc-warn" id="gc-warn" hidden>Preencha o nome (ou a manchete) antes de ir ao ar.</div>
            <div class="row" style="gap:6px;margin-top:6px">
              <button class="btn primary grow" id="gc-air">Colocar no ar</button>
              <button class="btn danger" id="gc-op-off" disabled>Tirar</button>
            </div>
            <div class="row" style="gap:6px;margin-top:6px">
              <button class="btn grow" id="gc-save-banner" title="Cadastra este GC pronto na lista e na barra fina abaixo do vídeo">＋ Cadastrar na barra de GC</button>
              <button class="btn ghost sm" id="gc-edit">✎ Editar design</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  function buildBannerItem(tpl = sel()) {
    const p = payload(tpl);
    const hasRole = tpl.layers.some((l) => l.key === 'role');
    const sub = hasRole && data.role ? data.role : data.bid || data.tag || '';
    const d = { ...p.data };
    delete d.logo; // logo vem de S.brand.logo em tempo de execução para não inflar o JSON de banners
    return {
      id: 'bn-' + Math.random().toString(36).slice(2, 9),
      title: p.title,
      subtitle: String(sub || ''),
      style: 'tpl',
      pos: 'bl',
      dur: p.dur,
      color: brandColor(),
      tplId: tpl.id,
      tplName: tpl.name,
      layers: p.layers,
      verticalLayers: p.verticalLayers,
      data: d,
    };
  }

  function bind(p) {
    rootEl = p;
    const q = (s) => p.querySelector(s);
    const bindInputFields = (scope) => {
      if (!scope) return;
      for (const el of scope.querySelectorAll('[data-gc-extra]')) {
        el.addEventListener('input', () => {
          const k = el.dataset.gcExtra;
          if (k) { data[k] = el.value; renderPreview(); }
        });
      }
      for (const [id, key] of [['#gc-name', 'name'], ['#gc-role', 'role'], ['#gc-tag', 'tag'], ['#gc-headline', 'headline']]) {
        const el = scope.querySelector(id);
        if (el) el.addEventListener('input', () => { data[key] = el.value; renderPreview(); });
      }
    };
    q('#gc-new-tpl')?.addEventListener('click', () => openDesigner(null));
    q('#gc-prev-bg')?.addEventListener('click', () => {
      previewLiveBg = !previewLiveBg;
      renderPreview();
    });
    q('#gc-prev-orient')?.addEventListener('click', () => {
      previewVertical = !previewVertical;
      renderPreview();
    });
    q('#gc-edit')?.addEventListener('click', () => openDesigner(selId));
    q('#gc-save-banner')?.addEventListener('click', () => {
      const tpl = sel();
      const item = buildBannerItem(tpl);
      if (!String(item.title || '').trim()) {
        toast('Preencha o título/nome do GC antes de cadastrar.', 'err');
        return;
      }
      if (onSaveBanner) onSaveBanner(item);
      else {
        S.banners.push(item);
        saveStudio();
        render();
        toast(`GC “${item.title}” cadastrado na barra!`, 'ok');
      }
    });
    q('#gc-fill-guest')?.addEventListener('click', () => fillGuest());
    q('#gc-fill-rss')?.addEventListener('click', () => fillHeadline());
    q('#gc-air')?.addEventListener('click', () => apply());
    q('#gc-op-off')?.addEventListener('click', stop);
    q('#gc-airline-stop')?.addEventListener('click', stop);
    bindInputFields(q('#gc-dyn-fields') || p);
    const cards = [...p.querySelectorAll('[data-gct]')];
    const filter = () => {
      const term = search.trim().toLowerCase();
      let visible = 0;
      for (const c of cards) {
        const t = S.gcTemplates.find((x) => x.id === c.dataset.gct);
        const okSearch = !term || (c.dataset.name || '').includes(term);
        const okCat = cat === 'todos' || (t?.category || 'Personalizado') === cat;
        const okFav = !favOnly || !!t?.fav;
        c.hidden = !(okSearch && okCat && okFav);
        if (!c.hidden) visible++;
      }
      const empty = q('#gc-empty');
      if (empty) empty.hidden = visible > 0;
    };
    const selectCard = (b) => {
      selId = b.dataset.gct;
      S.brand.lastGcTemplate = selId;
      saveStudio();
      for (const x of cards) x.classList.toggle('sel', x === b);
      const curTpl = sel();
      const dyn = q('#gc-dyn-fields');
      if (dyn) {
        dyn.innerHTML = dynFieldsHtml(curTpl);
        bindInputFields(dyn);
      }
      const hints = q('#gc-auto-hints');
      if (hints) hints.innerHTML = `${curTpl.autoGuest ? '<span class="hint">auto: convidado</span>' : ''}${curTpl.autoRss ? '<span class="hint">auto: RSS</span>' : ''}`;
      const schedSel = q('#gc-sched-tpl');
      if (schedSel) schedSel.value = curTpl.id;
      renderPreview();
    };
    for (const b of cards) {
      b.addEventListener('click', (e) => {
        if (e.target.closest('[data-favbtn],[data-deltpl]')) return;
        selectCard(b);
      });
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCard(b); } });
      const star = b.querySelector('[data-favbtn]');
      if (star) star.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = S.gcTemplates.find((x) => x.id === star.dataset.favbtn);
        if (!t) return;
        t.fav = !t.fav;
        saveStudio();
        render();
      });
      const del = b.querySelector('[data-deltpl]');
      if (del) del.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteTemplate(del.dataset.deltpl);
      });
      const cv = b.querySelector('[data-thumb]');
      const t = S.gcTemplates.find((x) => x.id === b.dataset.gct);
      if (cv && t) drawThumb(cv, t);
    }
    q('#gc-search')?.addEventListener('input', (e) => { search = e.target.value; filter(); });
    q('#gc-cat')?.addEventListener('change', (e) => { cat = e.target.value; filter(); });
    q('#gc-fav')?.addEventListener('click', () => { favOnly = !favOnly; render(); });
    q('#gc-dur')?.addEventListener('change', (e) => { data.dur = Number(e.target.value) || 0; });
    bindSchedule(p);
    filter();
    renderPreview();
  }

  // Converte camadas 16:9 (1920x1080) para um layout vertical 9:16 (1080x1920) legível
  function autoConvertToVertical(srcLayers = []) {
    const out = clone(srcLayers).map((l) => ({ ...l, id: uid() }));
    const nonFull = out.filter((l) => !(l.type === 'rect' && l.w >= 1700 && l.h >= 900));
    const bottoms = nonFull.filter((l) => (l.y || 0) >= 540);
    const minBotY = bottoms.length ? Math.min(...bottoms.map((l) => l.y || 760)) : 760;
    for (const l of out) {
      if (l.type === 'rect' && l.w >= 1700 && l.h >= 900) {
        l.x = 0; l.y = 0; l.w = 1080; l.h = 1920;
        continue;
      }
      const x = Number(l.x) || 0;
      const y = Number(l.y) || 0;
      const w = Number(l.w) || 200;
      const h = Number(l.h) || 60;
      if (w >= 1500) {
        l.x = 0;
        l.w = 1080;
      } else if (x >= 1350 && y >= 540 && l.type === 'image') {
        l.w = Math.min(180, Math.round(w * 0.85));
        l.h = Math.min(180, Math.round(h * 0.9));
        l.x = Math.max(32, 1080 - 48 - l.w);
      } else if (x >= 1350 && l.type === 'qr') {
        l.w = Math.min(190, w);
        l.h = Math.min(190, h);
        l.x = 1080 - 36 - l.w;
      } else {
        const nx = Math.round((x / 1920) * 1080);
        l.x = Math.max(24, Math.min(1080 - 120, nx));
        l.w = Math.min(1080 - l.x - 36, Math.max(80, w >= 550 ? Math.round(w * 0.94) : w));
      }
      if (y < 320) {
        l.y = Math.round(36 + y * 0.95);
      } else if (y < 540) {
        l.y = Math.round(740 + (y - 320) * 1.1);
      } else {
        l.y = Math.min(1880 - h, Math.round(1430 + (y - minBotY) * 1.08));
      }
      if (l.type === 'text' && (l.size || 32) > 48 && l.w < 960) {
        l.size = Math.max(36, Math.round(l.size * 0.92));
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ designer
  function openDesigner(tplId) {
    const base = tplId ? clone(S.gcTemplates.find((t) => t.id === tplId) || sel()) : { id: uid(), name: 'Meu template', builtin: false, category: 'Personalizado', fav: false, layers: [] };
    // modelo do sistema nunca é sobrescrito: editar vira uma cópia “meu template”
    if (base.builtin) {
      base.id = uid();
      base.name = `${base.name} (meu)`;
      base.builtin = false;
    }
    if (!Array.isArray(base.rules)) base.rules = [];
    if (!base.layers.length) {
      base.layers = [
        { ...LAYER_DEFAULTS.rect, id: uid(), fill: '#080d1c', fill2: '#131d38', gradDir: 'd', radius: 18, opacity: 0.94, shadow: true, stroke: '#ffffff', strokeOp: 0.2, strokeW: 2, accentBar: 'brandLight', accentBar2: 'brand', accentW: 12 },
        { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 96, y: 764, w: 220, h: 40, size: 17, bg: '#ef4444', bg2: '#b91c1c', pill: true, dot: true, shadow: true },
        { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 118, y: 830, w: 840, h: 58, size: 46, weight: 800, font: 'display' },
        { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 118, y: 894, w: 840, h: 38, size: 25, weight: 500, color: '#cbd5e1' },
      ];
    }
    let selected = 0;
    let editVert = false;
    let designerLiveBg = previewLiveBg;
    let animT0 = performance.now() - 2000;
    let animRaf = 0;
    let guideX = null;
    let guideY = null;
    const activeLayers = () => (editVert ? (base.verticalLayers ||= []) : base.layers);
    const dims = () => (editVert ? { sw: 1080, sh: 1920, cw: 540, ch: 960 } : { sw: 1920, sh: 1080, cw: 960, ch: 540 });

    // Paleta do Template Studio: marca + cores seguras para broadcast + recentes.
    const COLOR_KEY = 'castdeck.gc.colors';
    const DEFAULT_COLORS = ['#ffffff', '#0b1220', '#111827', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b'];
    const readRecents = () => {
      try {
        const list = JSON.parse(localStorage.getItem(COLOR_KEY) || '[]');
        return Array.isArray(list) ? list.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6) : [];
      } catch { return []; }
    };
    const rememberColor = (c) => {
      const v = String(c || '').toLowerCase();
      if (!/^#[0-9a-f]{6}$/.test(v)) return;
      try { localStorage.setItem(COLOR_KEY, JSON.stringify([v, ...readRecents().filter((x) => x.toLowerCase() !== v)].slice(0, 6))); } catch {}
    };
    const normalizeHex = (v) => {
      const s = String(v || '').trim();
      const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
      if (!m) return null;
      return '#' + (m[1].length === 3 ? m[1].split('').map((x) => x + x).join('') : m[1]).toLowerCase();
    };
    const resolveHex = (v, fallback = '#7c5cff') => {
      if (v === 'brand' || v === 'brandLight' || v === 'brandDark') return brandColor();
      return normalizeHex(v) || normalizeHex(fallback) || '#7c5cff';
    };
    const layerName = (l) => {
      const kind = l.type === 'text' ? 'Texto' : l.type === 'tag' ? 'Etiqueta' : l.type === 'image' ? 'Imagem' : l.type === 'qr' ? 'QR' : 'Barra';
      const field = l.key ? fieldLabel(l.key) : (l.text ? String(l.text).slice(0, 18) : '');
      return field ? `${kind}: ${field}` : kind;
    };
    const uploadLayerAsset = async (file) => {
      if (!file) return null;
      if (file.size > 25 * 1024 * 1024) throw new Error('Arquivo maior que 25 MB');
      const name = file.name || 'gc-asset.png';
      const rawType = String(file.type || '').toLowerCase();
      const mime = /^image\/(png|jpeg|webp|gif)$/.test(rawType)
        ? rawType
        : /\.png$/i.test(name) ? 'image/png'
        : /\.webp$/i.test(name) ? 'image/webp'
        : /\.gif$/i.test(name) ? 'image/gif'
        : /\.jpe?g$/i.test(name) ? 'image/jpeg'
        : null;
      if (mime) {
        try {
          const r = await fetch(`/api/dsk/assets?name=${encodeURIComponent(name)}`, {
            method: 'POST',
            headers: { 'Content-Type': mime },
            body: file,
          });
          const res = await r.json().catch(() => ({}));
          if (r.ok && res.url) return res.url;
        } catch {}
      }
      return await new Promise((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(String(rd.result || ''));
        rd.onerror = () => reject(new Error('Falha ao ler a imagem'));
        rd.readAsDataURL(file);
      });
    };
    const openEditorWindow = (card) => {
      if (!allowPopout) return null;
      const back = card.closest('.modal-back');
      if (!back) return null;
      const w = Math.min(1440, Math.max(1160, (window.screen.availWidth || 1280) - 60));
      const h = Math.min(860, Math.max(620, (window.screen.availHeight || 900) - 90));
      const left = Math.max(12, (window.screenLeft || 0) + 48);
      const top = Math.max(12, (window.screenTop || 0) + 36);
      let win = null;
      try {
        win = window.open('/template-studio.html', 'CastDeckTemplateStudio', `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`);
      } catch { return null; }
      if (!win) return null;
      const move = () => {
        try {
          if (!back.isConnected) { try { win.close(); } catch {} return true; }
          if (!/template-studio\.html/.test(win.location?.href || '') || win.document.readyState === 'loading') return false;
          win.document.body.append(back);
          win.document.body.classList.add('modal-open');
          win.document.title = 'Template Studio — CastDeck';
          win.focus();
          win.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && back.isConnected) {
              e.preventDefault();
              card.querySelector('.modal-x')?.click();
            }
          });
          win.addEventListener('beforeunload', () => {
            if (back.isConnected) card.querySelector('.modal-x')?.click();
          });
          const tmr = setInterval(() => {
            if (win.closed || !back.isConnected) {
              clearInterval(tmr);
              if (!win.closed) { try { win.close(); } catch {} }
            }
          }, 300);
          return true;
        } catch (err) {
          console.warn('Template Studio: não foi possível mover para a janela separada.', err);
          if (back.ownerDocument === document) { try { win.close(); } catch {} }
          return false;
        }
      };
      let attempts = 0;
      const waitForShell = () => {
        if (win.closed || move()) return;
        if (++attempts < 120) setTimeout(waitForShell, 100);
      };
      win.addEventListener('load', waitForShell);
      waitForShell();
      return win;
    };
    const colorField = (l, key, label, fallback = '#7c5cff') => {
      const raw = l[key];
      const isBrand = raw === 'brand';
      const hexValue = isBrand ? brandColor() : resolveHex(raw, fallback);
      const recent = readRecents();
      return `<div class="gz-color-field">
        <div class="gz-color-label">
          <span>${label}</span>
          <button type="button" class="gz-color-brand ${isBrand ? 'on' : ''}" data-gz-brand="${key}">Marca</button>
        </div>
        <div class="gz-color-main">
          <label class="gz-color-native" style="--sw:${hexValue}" title="Escolher cor">
            <input type="color" data-gz-color="${key}" value="${hexValue}" aria-label="${label}">
          </label>
          <input class="input gz-hex" data-gz-hex="${key}" value="${hexValue}" maxlength="7" spellcheck="false" aria-label="${label} em HEX">
        </div>
        <div class="gz-swatches" role="group" aria-label="${label}: cores prontas">
          ${DEFAULT_COLORS.map((c) => `<button type="button" class="gz-swatch ${!isBrand && raw === c ? 'on' : ''}" data-gz-swatch="${c}" style="--sw:${c}" title="${c}" aria-label="${c}"></button>`).join('')}
        </div>
        ${recent.length ? `<div class="gz-recents"><span>Recentes</span><div class="gz-swatches">${recent.map((c) => `<button type="button" class="gz-swatch ${!isBrand && raw === c ? 'on' : ''}" data-gz-swatch="${c}" style="--sw:${c}" title="${c}" aria-label="Cor recente ${c}"></button>`).join('')}</div></div>` : ''}
      </div>`;
    };
    modal(
      `<div class="gc-dz">
        <div class="gc-dz-top">
          <div class="gc-dz-title-row">
            <div class="gc-dz-brand">
              <h3>Criador de Templates</h3>
              <span class="hint">Arraste, redimensione e personalize cada camada sobre a prévia</span>
            </div>
            <div class="gc-dz-meta">
              <input class="input" id="gz-name" maxlength="40" value="${escAttr(base.name)}" placeholder="Nome do template" aria-label="Nome do template">
              <select class="input" id="gz-cat" aria-label="Categoria">${[...new Set(['Personalizado', 'Jornalismo', 'Entrevista', 'Esporte', 'Criador', 'Leilão', 'Marca', 'Crédito', 'Rodapé', ...S.gcTemplates.map((t) => t.category || 'Personalizado')])].map((c) => `<option value="${escAttr(c)}" ${(base.category || 'Personalizado') === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
              <label class="check gz-top-fav" title="Marcar como favorito"><input type="checkbox" id="gz-fav" ${base.fav ? 'checked' : ''}> ★</label>
              ${allowPopout ? '<button type="button" class="btn ghost sm" id="gz-popout" title="Abrir editor em janela separada">↗ Janela</button>' : ''}
            </div>
          </div>
          <div class="gc-dz-toolbar">
            <div class="seg gz-orient" role="group" aria-label="Formato do template">
              <button type="button" id="gz-orient-169" class="active">16:9 Horizontal</button>
              <button type="button" id="gz-orient-916">9:16 Vertical</button>
            </div>
            <button type="button" class="btn ghost sm" id="gz-gen-vert" title="Gerar ou atualizar layout 9:16 automaticamente a partir do 16:9">⚡ Gerar 9:16</button>
            <span class="gz-tb-sep"></span>
            <button type="button" class="btn ghost sm" id="gz-bg-toggle" title="Alternar fundo entre vídeo do PGM e grade">${designerLiveBg ? '🎥 Vídeo PGM' : '⬛ Grade'}</button>
            <button type="button" class="btn ghost sm" id="gz-test-anim" title="Visualizar animação de entrada">▶ Testar entrada</button>
            <span class="gz-tb-sep"></span>
            <button type="button" class="btn ghost sm" id="gz-undo" title="Desfazer (Ctrl+Z)" disabled>↶ Desfazer</button>
            <button type="button" class="btn ghost sm" id="gz-redo" title="Refazer (Ctrl+Y)" disabled>↷ Refazer</button>
            <span class="hint gz-dims-badge" id="gz-dims-badge">1920 × 1080</span>
          </div>
        </div>
        <div class="gc-dz-grid">
          <aside class="gc-dz-left">
            <details class="gc-dz-acc" open>
              <summary>Adicionar camada</summary>
              <div class="gc-palette">
                <button type="button" class="btn sm" data-add="rect" data-add-kind="rect">▭ Barra / Caixa</button>
                <button type="button" class="btn sm" data-add="text" data-add-kind="text-name">T Nome</button>
                <button type="button" class="btn sm" data-add="text" data-add-kind="text-role">T Cargo</button>
                <button type="button" class="btn sm" data-add="text" data-add-kind="text-headline">T Manchete</button>
                <button type="button" class="btn sm" data-add="tag" data-add-kind="tag">● Etiqueta</button>
                <button type="button" class="btn sm" data-add="text" data-add-kind="text-fixed">T Texto fixo</button>
                <button type="button" class="btn sm" data-add="image" data-add-kind="image">▣ Logo / PNG</button>
                <button type="button" class="btn sm" data-add="qr" data-add-kind="qr">▦ QR Code</button>
              </div>
            </details>
            <details class="gc-dz-acc" open>
              <summary>Camadas <span class="hint" id="gz-layer-count">0</span></summary>
              <div id="gz-layers"></div>
            </details>
            <details class="gc-dz-acc" open>
              <summary>Estilos rápidos (1 clique)</summary>
              <div class="gz-themes">
                <button type="button" class="btn sm" data-theme="glass">✦ Vidro Pro</button>
                <button type="button" class="btn sm" data-theme="breaking">🔴 Plantão</button>
                <button type="button" class="btn sm" data-theme="sport">⚡ Esporte</button>
                <button type="button" class="btn sm" data-theme="brand">🎨 Marca</button>
                <button type="button" class="btn sm" data-theme="gold">★ Ouro</button>
              </div>
            </details>
            <details class="gc-dz-acc">
              <summary>Regras dinâmicas</summary>
              <div id="gz-rules"></div>
              <button type="button" class="btn ghost sm" id="gz-add-rule" style="margin-top:4px">+ Nova regra</button>
            </details>
          </aside>
          <div class="gc-dz-center">
            <div class="gc-dz-canvas"><canvas id="gz-canvas" width="960" height="540"></canvas></div>
            <div class="gz-testbar">
              <span class="gz-test-lbl">Testar dados:</span>
              <input class="input" id="gz-test-name" maxlength="60" value="${escAttr(data.name)}" placeholder="Nome" title="Nome de teste no preview">
              <input class="input" id="gz-test-role" maxlength="80" value="${escAttr(data.role)}" placeholder="Cargo / função" title="Cargo de teste no preview">
              <input class="input" id="gz-test-headline" maxlength="120" value="${escAttr(data.headline)}" placeholder="Manchete" title="Manchete de teste no preview">
              <input class="input" id="gz-test-tag" maxlength="20" value="${escAttr(data.tag)}" placeholder="Etiqueta" title="Etiqueta de teste no preview">
            </div>
          </div>
          <aside class="gc-dz-insp" id="gz-insp"></aside>
        </div>
        <div class="gc-dz-foot">
          <div class="gc-dz-row gc-dz-actions">
            <div class="gc-dz-opts">
              <label class="check" title="Preencher o nome quando um convidado entrar"><input type="checkbox" id="gz-autoguest" ${base.autoGuest ? 'checked' : ''}> Auto convidado</label>
              <label class="check" title="Preencher a manchete com o RSS mais recente"><input type="checkbox" id="gz-autorss" ${base.autoRss ? 'checked' : ''}> Auto RSS</label>
              <label class="check" title="Entrar no ar quando um convidado entrar"><input type="checkbox" id="gz-takeguest" ${base.takeGuest ? 'checked' : ''}> TAKE convidado</label>
              <label class="check" title="Entrar no ar quando o RSS atualizar"><input type="checkbox" id="gz-takerss" ${base.takeRss ? 'checked' : ''}> TAKE RSS</label>
            </div>
            <div class="gc-dz-btns">
              <button type="button" class="btn ghost" id="gz-dup" title="Duplicar este template">Duplicar</button>
              <button type="button" class="btn ghost" id="gz-del-tpl" title="Excluir este template" ${base.builtin ? 'disabled' : ''}>Excluir</button>
              <button type="button" class="btn" id="gz-cancel">Cancelar</button>
              <button type="button" class="btn" id="gz-save-bar" title="Salva o template e já cadastra um GC na fita fina do estúdio">＋ Salvar e pôr na barra</button>
              <button type="button" class="btn primary" id="gz-save">${icons.plus} Salvar template</button>
            </div>
          </div>
        </div>
      </div>`,
      {
        screen: true,
        sticky: true,
        onMount: (m, close) => {
          const cv = m.querySelector('#gz-canvas');
          // histórico do design (30 passos) cobrindo 16:9 e 9:16
          let history = [];
          let hi = -1;
          const updateUndo = () => {
            const u = m.querySelector('#gz-undo');
            const r = m.querySelector('#gz-redo');
            if (u) u.disabled = hi <= 0;
            if (r) r.disabled = hi >= history.length - 1;
          };
          let histTimer = null;
          let dirty = false;
          const snapNow = () => {
            history = history.slice(0, hi + 1);
            history.push({ layers: clone(base.layers), verticalLayers: clone(base.verticalLayers || []) });
            if (history.length > 30) history.shift();
            hi = history.length - 1;
            updateUndo();
          };
          const snap = () => {
            dirty = true;
            clearTimeout(histTimer);
            histTimer = setTimeout(() => { dirty = false; snapNow(); }, 450);
          };
          const flushSnap = () => {
            clearTimeout(histTimer);
            if (dirty) { dirty = false; snapNow(); }
          };
          const cancelSnap = () => { clearTimeout(histTimer); dirty = false; };
          const undo = () => {
            if (hi <= 0) return;
            cancelSnap();
            hi--;
            const st = history[hi];
            base.layers = clone(st.layers);
            base.verticalLayers = clone(st.verticalLayers || []);
            const cur = activeLayers();
            selected = cur.length ? Math.max(0, Math.min(selected, cur.length - 1)) : -1;
            drawIt();
          };
          const redo = () => {
            if (hi >= history.length - 1) return;
            cancelSnap();
            hi++;
            const st = history[hi];
            base.layers = clone(st.layers);
            base.verticalLayers = clone(st.verticalLayers || []);
            const cur = activeLayers();
            selected = cur.length ? Math.max(0, Math.min(selected, cur.length - 1)) : -1;
            drawIt();
          };

          const drawCanvasOnly = () => {
            const { sw, sh, cw, ch } = dims();
            if (cv.width !== cw) cv.width = cw;
            if (cv.height !== ch) cv.height = ch;
            cv.classList.toggle('is-vertical', editVert);
            draw(cv, base, selected, { vert: editVert, liveBg: designerLiveBg, t0: animT0, guideX, guideY, sw, sh });
          };

          const syncGeomInputs = () => {
            const l = activeLayers()[selected];
            if (!l) return;
            for (const k of ['x', 'y', 'w', 'h']) {
              const el = m.querySelector(`#gz-${k}`);
              if (el && el.ownerDocument?.activeElement !== el) el.value = String(Math.round(l[k] || 0));
            }
          };

          const renderLayerList = () => {
            const cur = activeLayers();
            const listBox = m.querySelector('#gz-layers');
            listBox.innerHTML = cur.length
              ? cur
                .map((l, i) => `<div class="gz-layer-row ${i === selected ? 'sel' : ''}">
                  <button type="button" class="gz-layer-name" data-layer="${i}" title="Selecionar camada">${i + 1}. ${l.type === 'text' ? 'T' : l.type === 'tag' ? '●' : l.type === 'image' ? '▣' : l.type === 'qr' ? '▦' : '▭'} ${esc(layerName(l))}</button>
                  <button type="button" class="gz-mini" data-vis="${i}" title="${l.hidden ? 'Mostrar camada' : 'Ocultar camada'}">${l.hidden ? '◌' : '◉'}</button>
                  <button type="button" class="gz-mini" data-lock="${i}" title="${l.lock ? 'Destravar camada' : 'Travar camada'}">${l.lock ? '🔒' : '🔓'}</button>
                  <button type="button" class="gz-mini" data-up="${i}" title="Subir camada" ${i === 0 ? 'disabled' : ''}>↑</button>
                  <button type="button" class="gz-mini" data-down="${i}" title="Descer camada" ${i === cur.length - 1 ? 'disabled' : ''}>↓</button>
                  <button type="button" class="gz-mini gz-mini-del" data-dellayer="${i}" title="Excluir camada" aria-label="Excluir camada ${esc(layerName(l))}">🗑</button>
                </div>`)
                .join('')
              : '<p class="hint">Nenhuma camada. Adicione um elemento acima.</p>';
            const gzLayerCount = m.querySelector('#gz-layer-count');
            if (gzLayerCount) gzLayerCount.textContent = String(cur.length);
            m.querySelectorAll('[data-layer]').forEach((b) => (b.onclick = () => { selected = +b.dataset.layer; drawIt(); }));
            m.querySelectorAll('[data-vis]').forEach((b) => (b.onclick = () => {
              const l = cur[+b.dataset.vis];
              if (!l) return;
              l.hidden = !l.hidden;
              snapNow();
              drawIt();
            }));
            m.querySelectorAll('[data-lock]').forEach((b) => (b.onclick = () => {
              const l = cur[+b.dataset.lock];
              if (!l) return;
              l.lock = !l.lock;
              snapNow();
              drawIt();
            }));
            for (const dir of ['up', 'down']) m.querySelectorAll(`[data-${dir}]`).forEach((b) => (b.onclick = () => {
              const i = +b.dataset[dir];
              const j = i + (dir === 'up' ? -1 : 1);
              if (j < 0 || j >= cur.length) return;
              [cur[i], cur[j]] = [cur[j], cur[i]];
              selected = j;
              snapNow();
              drawIt();
            }));
            m.querySelectorAll('[data-dellayer]').forEach((b) => (b.onclick = (e) => {
              e.stopPropagation();
              const i = +b.dataset.dellayer;
              if (!cur[i]) return;
              flushSnap();
              cur.splice(i, 1);
              selected = cur.length ? Math.max(0, Math.min(selected, cur.length - 1)) : -1;
              snapNow();
              drawIt();
            }));
          };

          const drawIt = (rebuildInspector = true) => {
            drawCanvasOnly();
            renderLayerList();
            if (rebuildInspector) inspector();
            else syncGeomInputs();
            renderRules();
          };

          const inspector = () => {
            const cur = activeLayers();
            const l = cur[selected];
            const box = m.querySelector('#gz-insp');
            if (!l) { box.innerHTML = '<div class="gz-insp-empty"><p class="hint">Selecione uma camada no canvas ou clique em <b>Adicionar camada</b> à esquerda.</p></div>'; return; }
            const { sw, sh } = dims();
            const keyOptions = [...new Set([...BASE_FIELDS, ...extraKeysFor(base), l.key].filter(Boolean))];
            const num = (k, label, min = -5000, max = 5000) => `<label class="field"><span>${label}</span><input class="input" type="number" id="gz-${k}" value="${Math.round(l[k] || 0)}" min="${min}" max="${max}"></label>`;
            const isFixedText = l.type === 'text' && !l.key;
            const hasFill2 = l.type === 'rect' && !!l.fill2;
            const hasBg2 = l.type === 'tag' && !!l.bg2;
            const hasAccent = l.type === 'rect' && !!l.accentBar;
            const hasStroke = (l.type === 'rect' || l.type === 'tag') && !!l.stroke;
            const opPct = Math.round((l.opacity ?? 1) * 100);
            const skewDeg = Math.round(Number(l.skew) || 0);
            const radPx = Math.round(Number(l.radius) || 0);
            const kindTitle = l.type === 'text' ? 'Texto' : l.type === 'tag' ? 'Etiqueta' : l.type === 'image' ? 'Imagem / Logo' : l.type === 'qr' ? 'QR Code' : 'Barra / Caixa';

            box.innerHTML = `
              <div class="gz-insp-head">
                <h4>${kindTitle}</h4>
                <div class="row" style="gap:4px">
                  <button type="button" class="btn ghost sm" id="gz-dup-layer" title="Duplicar camada (Ctrl+D)">⧉</button>
                  <button type="button" class="btn danger sm" id="gz-del" title="Excluir camada (Del)">🗑</button>
                </div>
              </div>

              ${(l.type === 'text' || l.type === 'tag') ? `
              <div class="gz-sec">
                <div class="gz-sec-title">Conteúdo</div>
                ${l.type === 'text' ? `
                <div class="seg gz-seg" style="margin-bottom:6px">
                  <button type="button" data-textmode="field" class="${!isFixedText ? 'active' : ''}">Campo dinâmico</button>
                  <button type="button" data-textmode="fixed" class="${isFixedText ? 'active' : ''}">Texto fixo</button>
                </div>` : ''}
                ${(!isFixedText) ? `<label class="field"><span>Campo do estúdio</span><select class="input" id="gz-key">${keyOptions.map((k) => `<option value="${escAttr(k)}" ${l.key === k ? 'selected' : ''}>${esc(fieldLabel(k))}</option>`).join('')}</select></label>` : ''}
                ${(isFixedText || l.type === 'tag') ? `<label class="field"><span>${l.type === 'tag' ? 'Texto se vazio' : 'Texto fixo'}</span><input class="input" id="gz-text" maxlength="120" value="${escAttr(l.text || '')}" placeholder="Ex.: AO VIVO ou LANCE ATUAL"></label>` : ''}
                <label class="check"><input type="checkbox" id="gz-hideempty" ${l.hideEmpty ? 'checked' : ''}> Ocultar se vazio</label>
              </div>` : ''}

              ${l.type === 'image' ? `
              <div class="gz-sec">
                <div class="gz-sec-title">Imagem</div>
                <div class="seg gz-seg" style="margin-bottom:6px">
                  <button type="button" data-imgmode="brand" class="${l.src === 'brand' || !l.src ? 'active' : ''}">Logo da marca</button>
                  <button type="button" data-imgmode="custom" class="${l.src && l.src !== 'brand' ? 'active' : ''}">PNG próprio</button>
                </div>
                ${l.src && l.src !== 'brand' ? `<div class="gz-img-prev"><img src="${escAttr(l.src)}" alt="Preview da camada"></div>` : ''}
                <button type="button" class="btn sm" id="gz-img-upload" style="width:100%">📁 Enviar PNG / Imagem</button>
                <div class="row" style="gap:6px;margin-top:6px">
                  <label class="field grow"><span>Encaixe</span>
                    <select class="input" id="gz-fit">
                      <option value="contain" ${(l.fit || 'contain') === 'contain' ? 'selected' : ''}>Ajustar inteiro</option>
                      <option value="cover" ${l.fit === 'cover' ? 'selected' : ''}>Preencher caixa</option>
                    </select>
                  </label>
                </div>
                <div class="gz-range-row"><label><span>Opacidade</span><small id="gz-opacity-val">${opPct}%</small></label><input type="range" id="gz-opacity" min="10" max="100" value="${opPct}"></div>
                <div class="gz-range-row"><label><span>Cantos</span><small id="gz-radius-val">${radPx}px</small></label><input type="range" id="gz-radius" min="0" max="120" value="${radPx}"></div>
              </div>` : ''}

              ${l.type === 'qr' ? `
              <div class="gz-sec">
                <div class="gz-sec-title">QR Code</div>
                <label class="field"><span>Link fixo (opcional)</span><input class="input" id="gz-url" maxlength="200" value="${escAttr(l.url || '')}" placeholder="Deixe vazio para usar o link do estúdio"></label>
                ${colorField(l, 'qrColor', 'Cor do QR', '#ffffff')}
              </div>` : ''}

              ${(l.type === 'text' || l.type === 'tag') ? `
              <div class="gz-sec">
                <div class="gz-sec-title">Tipografia</div>
                <div class="row" style="gap:6px">
                  <label class="field grow"><span>Fonte</span>
                    <select class="input" id="gz-font">
                      <option value="display" ${(l.font || 'display') === 'display' ? 'selected' : ''}>Outfit (Display)</option>
                      <option value="sans" ${l.font === 'sans' ? 'selected' : ''}>Inter (Limpa)</option>
                    </select>
                  </label>
                  <label class="field" style="width:94px"><span>Peso</span>
                    <select class="input" id="gz-weight">
                      ${[500, 600, 700, 800, 900].map((w) => `<option value="${w}" ${(Number(l.weight) || (l.type === 'tag' ? 800 : 700)) === w ? 'selected' : ''}>${w}</option>`).join('')}
                    </select>
                  </label>
                </div>
                <div class="gz-range-row"><label><span>Tamanho</span><small id="gz-size-val">${Math.round(l.size || 32)}px</small></label><input type="range" id="gz-size-r" min="12" max="140" value="${Math.round(l.size || 32)}"></div>
                <input class="input" type="number" id="gz-size" value="${Math.round(l.size || 32)}" min="10" max="160" style="margin-bottom:6px">
                ${l.type === 'text' ? `
                <div class="seg gz-seg" style="margin-bottom:6px">
                  <button type="button" data-talign="left" class="${(l.align || 'left') === 'left' ? 'active' : ''}">Esquerda</button>
                  <button type="button" data-talign="center" class="${l.align === 'center' ? 'active' : ''}">Centro</button>
                  <button type="button" data-talign="right" class="${l.align === 'right' ? 'active' : ''}">Direita</button>
                </div>` : ''}
                <label class="check"><input type="checkbox" id="gz-upper" ${(l.upper || l.uppercase) ? 'checked' : ''}> CAIXA ALTA</label>
                ${l.type === 'text' ? `<label class="check"><input type="checkbox" id="gz-textshadow" ${l.shadow !== false ? 'checked' : ''}> Sombra de leitura</label>` : ''}
              </div>` : ''}

              ${l.type === 'rect' ? `
              <div class="gz-sec">
                <div class="gz-sec-title">Cores &amp; Estilo da Barra</div>
                ${colorField(l, 'fill', 'Cor principal', '#0b1220')}
                <label class="check"><input type="checkbox" id="gz-hasfill2" ${hasFill2 ? 'checked' : ''}> Gradiente (2 cores)</label>
                ${hasFill2 ? `
                  ${colorField(l, 'fill2', 'Cor final', '#1e293b')}
                  <label class="field"><span>Direção do gradiente</span>
                    <select class="input" id="gz-graddir">
                      <option value="h" ${(l.gradDir || 'h') === 'h' ? 'selected' : ''}>Horizontal →</option>
                      <option value="v" ${l.gradDir === 'v' ? 'selected' : ''}>Vertical ↓</option>
                      <option value="d" ${l.gradDir === 'd' ? 'selected' : ''}>Diagonal ↘</option>
                    </select>
                  </label>` : ''}
                <div class="gz-range-row"><label><span>Opacidade</span><small id="gz-opacity-val">${opPct}%</small></label><input type="range" id="gz-opacity" min="10" max="100" value="${opPct}"></div>
                <div class="gz-range-row"><label><span>Arredondamento</span><small id="gz-radius-val">${radPx}px</small></label><input type="range" id="gz-radius" min="0" max="60" value="${radPx}"></div>
                <div class="gz-range-row"><label><span>Inclinação</span><small id="gz-skew-val">${skewDeg}°</small></label><input type="range" id="gz-skew" min="-20" max="20" value="${skewDeg}"></div>
                <label class="check"><input type="checkbox" id="gz-shadow" ${l.shadow ? 'checked' : ''}> Sombra projetada</label>
                <label class="check"><input type="checkbox" id="gz-hasaccent" ${hasAccent ? 'checked' : ''}> Faixa lateral de destaque</label>
                ${hasAccent ? `
                  <div class="gz-range-row"><label><span>Largura da faixa</span><small id="gz-accentw-val">${Math.round(Number(l.accentW) || 10)}px</small></label><input type="range" id="gz-accentw" min="2" max="36" value="${Math.round(Number(l.accentW) || 10)}"></div>
                  ${colorField(l, 'accentBar', 'Cor da faixa', '#7c5cff')}` : ''}
                <label class="check"><input type="checkbox" id="gz-hasstroke" ${hasStroke ? 'checked' : ''}> Borda / Contorno</label>
                ${hasStroke ? `
                  <div class="gz-range-row"><label><span>Espessura da borda</span><small id="gz-strokew-val">${Math.round(Number(l.strokeW) || 2)}px</small></label><input type="range" id="gz-strokew" min="1" max="8" value="${Math.round(Number(l.strokeW) || 2)}"></div>
                  ${colorField(l, 'stroke', 'Cor da borda', '#ffffff')}` : ''}
              </div>` : ''}

              ${l.type === 'tag' ? `
              <div class="gz-sec">
                <div class="gz-sec-title">Cores &amp; Estilo da Etiqueta</div>
                ${colorField(l, 'bg', 'Cor de fundo', '#ef4444')}
                <label class="check"><input type="checkbox" id="gz-hasbg2" ${hasBg2 ? 'checked' : ''}> Gradiente na etiqueta</label>
                ${hasBg2 ? colorField(l, 'bg2', 'Cor final', '#b91c1c') : ''}
                ${colorField(l, 'color', 'Cor do texto', '#ffffff')}
                <label class="check"><input type="checkbox" id="gz-dot" ${l.dot ? 'checked' : ''}> Ponto pulsante AO VIVO</label>
                <label class="check"><input type="checkbox" id="gz-pill" ${l.pill ? 'checked' : ''}> Formato pílula redonda</label>
                ${!l.pill ? `<div class="gz-range-row"><label><span>Arredondamento</span><small id="gz-radius-val">${Math.round(Number(l.radius ?? 8) || 0)}px</small></label><input type="range" id="gz-radius" min="0" max="40" value="${Math.round(Number(l.radius ?? 8) || 0)}"></div>` : ''}
                <label class="check"><input type="checkbox" id="gz-shadow" ${l.shadow ? 'checked' : ''}> Sombra projetada</label>
                <div class="gz-range-row"><label><span>Inclinação</span><small id="gz-skew-val">${skewDeg}°</small></label><input type="range" id="gz-skew" min="-20" max="20" value="${skewDeg}"></div>
              </div>` : ''}

              ${l.type === 'text' ? `<div class="gz-sec">${colorField(l, 'color', 'Cor do texto', '#ffffff')}<div class="gz-range-row"><label><span>Inclinação</span><small id="gz-skew-val">${skewDeg}°</small></label><input type="range" id="gz-skew" min="-20" max="20" value="${skewDeg}"></div></div>` : ''}

              <div class="gz-sec">
                <div class="gz-sec-title">Posição &amp; Tamanho (${editVert ? '9:16' : '16:9'})</div>
                <div class="gz-align" title="Alinhar na área de segurança">
                  <button type="button" data-align="left" title="Esquerda">⇤</button>
                  <button type="button" data-align="center" title="Centro horizontal">↔</button>
                  <button type="button" data-align="right" title="Direita">⇥</button>
                  <button type="button" data-align="top" title="Topo">⇧</button>
                  <button type="button" data-align="middle" title="Centro vertical">↕</button>
                  <button type="button" data-align="bottom" title="Base">⇩</button>
                  <button type="button" data-align="wide" title="Largura total na área segura">⇔</button>
                </div>
                <div class="row" style="gap:6px">${num('x', 'X')}${num('y', 'Y')}</div>
                <div class="row" style="gap:6px">${num('w', 'Largura', 10, sw)}${num('h', 'Altura', 10, sh)}</div>
              </div>
            `;

            // Alternar campo dinâmico × texto fixo
            box.querySelectorAll('[data-textmode]').forEach((btn) => {
              btn.onclick = () => {
                flushSnap();
                if (btn.dataset.textmode === 'fixed') {
                  delete l.key;
                  if (!l.text) l.text = 'TEXTO FIXO';
                } else {
                  delete l.text;
                  if (!l.key) l.key = 'name';
                }
                snapNow();
                drawIt(true);
              };
            });

            // Modo imagem: marca × PNG próprio
            box.querySelectorAll('[data-imgmode]').forEach((btn) => {
              btn.onclick = () => {
                flushSnap();
                if (btn.dataset.imgmode === 'brand') {
                  l.src = 'brand';
                  snapNow();
                  drawIt(true);
                } else if (!l.src || l.src === 'brand') {
                  box.querySelector('#gz-img-upload')?.click();
                }
              };
            });
            box.querySelector('#gz-img-upload')?.addEventListener('click', () => {
              const inp = box.ownerDocument.createElement('input');
              inp.type = 'file';
              inp.accept = 'image/*';
              inp.style.cssText = 'position:fixed;left:-9999px;opacity:0';
              inp.onchange = async () => {
                const file = inp.files?.[0];
                inp.remove();
                if (!file) return;
                try {
                  toast('Enviando imagem da camada…');
                  const url = await uploadLayerAsset(file);
                  if (!url) return;
                  flushSnap();
                  l.src = url;
                  snapNow();
                  drawIt(true);
                  toast('Imagem aplicada na camada!', 'ok');
                } catch (e) {
                  toast('Erro ao enviar imagem: ' + e.message, 'err');
                }
              };
              box.ownerDocument.body.append(inp);
              inp.click();
            });

            // Alinhamento de texto
            box.querySelectorAll('[data-talign]').forEach((btn) => {
              btn.onclick = () => {
                l.align = btn.dataset.talign;
                box.querySelectorAll('[data-talign]').forEach((x) => x.classList.toggle('active', x === btn));
                snapNow();
                drawCanvasOnly();
              };
            });

            // Checkboxes e selects simples (alguns reconstroem sub-opções do inspetor)
            const bindVal = (id, fn, rebuild = false) => {
              const el = box.querySelector('#' + id);
              if (!el) return;
              const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
              el.addEventListener(ev, () => {
                fn(el);
                if (rebuild) { snapNow(); drawIt(true); }
                else { drawCanvasOnly(); renderLayerList(); snap(); }
              });
            };
            bindVal('gz-key', (el) => { l.key = el.value; delete l.text; });
            bindVal('gz-text', (el) => { l.text = el.value; });
            bindVal('gz-url', (el) => { l.url = el.value.trim(); });
            bindVal('gz-font', (el) => { l.font = el.value; });
            bindVal('gz-weight', (el) => { l.weight = Number(el.value) || 700; });
            bindVal('gz-fit', (el) => { l.fit = el.value; });
            bindVal('gz-graddir', (el) => { l.gradDir = el.value; });
            bindVal('gz-hideempty', (el) => { l.hideEmpty = el.checked; });
            bindVal('gz-upper', (el) => { l.upper = el.checked; });
            bindVal('gz-textshadow', (el) => { l.shadow = el.checked; });
            bindVal('gz-shadow', (el) => { l.shadow = el.checked; });
            bindVal('gz-dot', (el) => { l.dot = el.checked; });
            bindVal('gz-pill', (el) => { l.pill = el.checked; }, true);
            bindVal('gz-hasfill2', (el) => {
              if (el.checked) { l.fill2 = l.fill2 || '#1e293b'; l.gradDir = l.gradDir || 'd'; }
              else delete l.fill2;
            }, true);
            bindVal('gz-hasbg2', (el) => {
              if (el.checked) l.bg2 = l.bg2 || '#b91c1c';
              else delete l.bg2;
            }, true);
            bindVal('gz-hasaccent', (el) => {
              if (el.checked) { l.accentBar = l.accentBar || 'brand'; l.accentW = Number(l.accentW) || 10; }
              else { delete l.accentBar; delete l.accentBar2; }
            }, true);
            bindVal('gz-hasstroke', (el) => {
              if (el.checked) { l.stroke = l.stroke || '#ffffff'; l.strokeW = Number(l.strokeW) || 2; l.strokeOp = l.strokeOp ?? 0.35; }
              else { delete l.stroke; }
            }, true);

            for (const k of ['x', 'y', 'w', 'h']) {
              bindVal('gz-' + k, (el) => { l[k] = Number(el.value) || 0; });
            }
            const sizeNum = box.querySelector('#gz-size');
            const sizeRange = box.querySelector('#gz-size-r');
            const sizeVal = box.querySelector('#gz-size-val');
            if (sizeNum) {
              sizeNum.oninput = () => {
                const v = Math.max(10, Math.min(160, Number(sizeNum.value) || 32));
                l.size = v;
                if (sizeRange) sizeRange.value = String(v);
                if (sizeVal) sizeVal.textContent = v + 'px';
                drawCanvasOnly();
                snap();
              };
            }
            if (sizeRange) {
              sizeRange.oninput = () => {
                const v = Math.max(10, Math.min(160, Number(sizeRange.value) || 32));
                l.size = v;
                if (sizeNum) sizeNum.value = String(v);
                if (sizeVal) sizeVal.textContent = v + 'px';
                drawCanvasOnly();
                snap();
              };
            }
            const bindRange = (id, prop, valId, suffix, xf = (v) => v) => {
              const r = box.querySelector('#' + id);
              const vEl = box.querySelector('#' + valId);
              if (!r) return;
              r.oninput = () => {
                const numV = Number(r.value);
                l[prop] = xf(numV);
                if (vEl) vEl.textContent = numV + suffix;
                drawCanvasOnly();
                snap();
              };
            };
            bindRange('gz-opacity', 'opacity', 'gz-opacity-val', '%', (v) => Math.max(0.1, Math.min(1, v / 100)));
            bindRange('gz-radius', 'radius', 'gz-radius-val', 'px');
            bindRange('gz-skew', 'skew', 'gz-skew-val', '°');
            bindRange('gz-accentw', 'accentW', 'gz-accentw-val', 'px');
            bindRange('gz-strokew', 'strokeW', 'gz-strokew-val', 'px');

            // Seletor de cor: paleta + HEX + picker nativo + recentes.
            box.querySelectorAll('.gz-color-field').forEach((field) => {
              const key = field.querySelector('[data-gz-color]')?.dataset.gzColor;
              if (!key) return;
              const applyColor = (value, brand = false) => {
                if (brand) l[key] = 'brand';
                else {
                  const hex = normalizeHex(value);
                  if (!hex) return;
                  l[key] = hex;
                  rememberColor(hex);
                }
                const shown = brand ? brandColor() : l[key];
                const native = field.querySelector('[data-gz-color]');
                const hexIn = field.querySelector('[data-gz-hex]');
                const nativeWrap = field.querySelector('.gz-color-native');
                if (native) native.value = shown;
                if (hexIn) hexIn.value = shown;
                if (nativeWrap) nativeWrap.style.setProperty('--sw', shown);
                field.querySelectorAll('[data-gz-swatch]').forEach((b) => b.classList.toggle('on', !brand && b.dataset.gzSwatch === l[key]));
                field.querySelector('[data-gz-brand]')?.classList.toggle('on', brand);
                drawCanvasOnly();
                snap();
              };
              const native = field.querySelector('[data-gz-color]');
              if (native) native.oninput = () => applyColor(native.value);
              const hexIn = field.querySelector('[data-gz-hex]');
              if (hexIn) {
                hexIn.oninput = () => { if (normalizeHex(hexIn.value)) applyColor(hexIn.value); };
                hexIn.onchange = () => { if (!normalizeHex(hexIn.value)) hexIn.value = resolveHex(l[key]); };
              }
              field.querySelectorAll('[data-gz-swatch]').forEach((b) => { b.onclick = () => applyColor(b.dataset.gzSwatch); });
              field.querySelector('[data-gz-brand]')?.addEventListener('click', () => applyColor('brand', true));
            });

            box.querySelectorAll('[data-align]').forEach((b) => (b.onclick = () => {
              const k = b.dataset.align;
              const mx = Math.round(sw * 0.05);
              const my = Math.round(sh * 0.05);
              if (k === 'left') l.x = mx;
              else if (k === 'center') l.x = Math.round((sw - l.w) / 2);
              else if (k === 'right') l.x = sw - mx - l.w;
              else if (k === 'top') l.y = my;
              else if (k === 'middle') l.y = Math.round((sh - l.h) / 2);
              else if (k === 'bottom') l.y = sh - my - l.h;
              else if (k === 'wide') { l.x = mx; l.w = sw - mx * 2; }
              snapNow();
              syncGeomInputs();
              drawCanvasOnly();
            }));

            box.querySelector('#gz-dup-layer').onclick = () => {
              flushSnap();
              const copy = clone(l);
              copy.id = uid();
              copy.x += 20;
              copy.y += 20;
              cur.splice(selected + 1, 0, copy);
              selected++;
              snapNow();
              drawIt(true);
            };
            box.querySelector('#gz-del').onclick = () => {
              flushSnap();
              cur.splice(selected, 1);
              selected = cur.length ? Math.max(0, selected - 1) : -1;
              snapNow();
              drawIt(true);
            };
          };

          const renderRules = () => {
            const box = m.querySelector('#gz-rules');
            if (!box) return;
            const cur = activeLayers();
            if (!base.rules.length) {
              box.innerHTML = '<p class="hint">Nenhuma regra. Ex.: ocultar etiqueta se vazia ou diminuir fonte se o nome for longo.</p>';
              return;
            }
            const opLabels = { empty: 'está vazio', notempty: 'está preenchido', equals: 'é igual a', notequals: 'é diferente de', contains: 'contém', notcontains: 'não contém', startswith: 'começa com', endswith: 'termina com', 'length>': 'tem mais de', 'length<': 'tem menos de', gt: 'número maior que', lt: 'número menor que' };
            const needsValue = (op) => !['empty', 'notempty'].includes(op);
            const numericOp = (op) => ['length>', 'length<', 'gt', 'lt'].includes(op);
            const actionLabels = { hide: 'ocultar', show: 'mostrar', size: 'ajustar fonte', color: 'mudar cor do texto', bg: 'mudar fundo', opacity: 'ajustar opacidade' };
            const fields = [...new Set([...BASE_FIELDS, ...extraKeysFor(base), ...base.layers.map((l) => l.key).filter(Boolean)])];
            box.innerHTML = base.rules.map((r) => {
              const cond = r.cond ?? r.value ?? '';
              const act = r.act ?? r.value ?? '';
              const op = r.op || 'empty';
              const action = r.action || 'hide';
              const condInput = needsValue(op) ? `<input class="input" data-rk="cond" type="${numericOp(op) ? 'number' : 'text'}" value="${escAttr(cond)}" ${numericOp(op) ? 'min="1" max="200"' : ''} placeholder="${numericOp(op) ? '20' : 'valor'}">` : '';
              const actInput = action === 'size' ? `<input class="input" data-rk="act" type="number" min="12" max="160" value="${Number(act) || 32}" placeholder="tamanho">`
                : (action === 'color' || action === 'bg') ? `<input class="input gz-rule-color" data-rk="act" type="color" value="${normalizeHex(act) || '#ffffff'}">`
                : action === 'opacity' ? `<input class="input" data-rk="act" type="number" min="0" max="1" step="0.1" value="${Number(act) || 1}">` : '';
              const target = base.layers.find((l) => l.id === r.layer) || cur.find((l) => l.id === r.layer);
              return `<div class="gz-rule" data-rule="${r.id}">
                <div class="gz-rule-head"><span>SE</span><button type="button" class="btn ghost sm" data-rdup title="Duplicar regra">⧉</button><button type="button" class="btn ghost sm" data-rdel title="Excluir regra">✕</button></div>
                <div class="row" style="gap:4px"><select class="input" data-rk="field">${fields.map((k) => `<option value="${escAttr(k)}" ${r.field === k ? 'selected' : ''}>${esc(fieldLabel(k))}</option>`).join('')}</select><select class="input" data-rk="op">${Object.entries(opLabels).map(([k, label]) => `<option value="${k}" ${op === k ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
                ${condInput ? `<div class="row" style="gap:4px">${condInput}</div>` : ''}
                <div class="row" style="gap:4px"><select class="input" data-rk="action">${Object.entries(actionLabels).map(([k, label]) => `<option value="${k}" ${action === k ? 'selected' : ''}>${label}</option>`).join('')}</select><select class="input" data-rk="layer">${base.layers.map((l) => `<option value="${l.id}" ${r.layer === l.id ? 'selected' : ''}>${esc(layerName(l))}</option>`).join('')}</select></div>
                ${actInput ? `<div class="row" style="gap:4px">${actInput}</div>` : ''}
                <small class="gz-rule-sum">${esc(target ? `Se ${fieldLabel(r.field)} ${opLabels[op] || op}${needsValue(op) ? ` “${cond}”` : ''} → ${actionLabels[action] || action} em ${layerName(target)}` : 'Escolha uma camada de destino.')}</small>
              </div>`;
            }).join('');
            for (const row of box.querySelectorAll('[data-rule]')) {
              const r = base.rules.find((x) => x.id === row.dataset.rule);
              if (!r) continue;
              for (const el of row.querySelectorAll('[data-rk]')) {
                el.onchange = () => {
                  const k = el.dataset.rk;
                  if (k === 'cond') r.cond = numericOp(r.op) ? Number(el.value) : el.value;
                  else if (k === 'act') r.act = ['size', 'opacity'].includes(r.action) ? Number(el.value) : el.value;
                  else {
                    r[k] = el.value;
                    if (k === 'op' && !needsValue(el.value)) delete r.cond;
                    if (k === 'action') {
                      if (el.value === 'size') r.act = Number(r.act) || 32;
                      else if (el.value === 'color') r.act = r.act || '#ffffff';
                      else if (el.value === 'bg') r.act = r.act || '#7c5cff';
                      else if (el.value === 'opacity') r.act = Number(r.act) || 1;
                    }
                  }
                  snap();
                  drawIt(false);
                  renderRules();
                };
              }
              row.querySelector('[data-rdel]').onclick = () => {
                flushSnap();
                base.rules = base.rules.filter((x) => x.id !== r.id);
                snapNow();
                drawIt(false);
                renderRules();
              };
              row.querySelector('[data-rdup]').onclick = () => {
                flushSnap();
                const copy = { ...r, id: uid() };
                base.rules.splice(base.rules.indexOf(r) + 1, 0, copy);
                snapNow();
                drawIt(false);
                renderRules();
              };
            }
          };

          m.querySelector('#gz-add-rule').onclick = () => {
            const target = base.layers.find((l) => ['text', 'tag'].includes(l.type)) || base.layers[0];
            if (!target) return;
            flushSnap();
            base.rules.push({ id: uid(), field: target.key || 'name', op: 'empty', action: 'hide', layer: target.id });
            snapNow();
            drawIt(false);
            renderRules();
          };

          // Barra superior: 16:9 / 9:16, Gerar 9:16, Fundo, Testar entrada, Popout
          const setOrient = (vert) => {
            flushSnap();
            editVert = !!vert;
            if (editVert && (!Array.isArray(base.verticalLayers) || !base.verticalLayers.length)) {
              base.verticalLayers = autoConvertToVertical(base.layers);
              toast('Layout 9:16 gerado automaticamente a partir do 16:9', 'ok');
            }
            m.querySelector('#gz-orient-169')?.classList.toggle('active', !editVert);
            m.querySelector('#gz-orient-916')?.classList.toggle('active', editVert);
            const badge = m.querySelector('#gz-dims-badge');
            if (badge) badge.textContent = editVert ? '1080 × 1920' : '1920 × 1080';
            const cur = activeLayers();
            selected = cur.length ? 0 : -1;
            drawIt(true);
          };
          m.querySelector('#gz-orient-169')?.addEventListener('click', () => setOrient(false));
          m.querySelector('#gz-orient-916')?.addEventListener('click', () => setOrient(true));
          m.querySelector('#gz-gen-vert')?.addEventListener('click', () => {
            flushSnap();
            base.verticalLayers = autoConvertToVertical(base.layers);
            snapNow();
            setOrient(true);
            toast('Layout 9:16 gerado a partir do 16:9!', 'ok');
          });
          m.querySelector('#gz-bg-toggle')?.addEventListener('click', (e) => {
            designerLiveBg = !designerLiveBg;
            e.currentTarget.textContent = designerLiveBg ? '🎥 Vídeo PGM' : '⬛ Grade';
            drawCanvasOnly();
          });
          m.querySelector('#gz-test-anim')?.addEventListener('click', () => {
            cancelAnimationFrame(animRaf);
            animT0 = performance.now();
            const step = () => {
              if (!m.isConnected) return;
              drawCanvasOnly();
              if (performance.now() - animT0 < 700) animRaf = requestAnimationFrame(step);
            };
            animRaf = requestAnimationFrame(step);
          });
          m.querySelector('#gz-popout')?.addEventListener('click', () => {
            const w = openEditorWindow(m);
            if (!w) toast('Pop-up bloqueado neste navegador.', 'err');
          });

          // Temas rápidos de 1 clique
          const THEMES = {
            glass: { rect: { fill: '#080d1c', fill2: '#131d38', gradDir: 'd', opacity: 0.94, radius: 18, shadow: true, stroke: '#ffffff', strokeOp: 0.2, strokeW: 2, accentBar: 'brandLight', accentBar2: 'brand', accentW: 12, skew: 0 }, tag: { bg: '#ef4444', bg2: '#b91c1c', color: '#ffffff', pill: true, dot: true, skew: 0, shadow: true }, textColor: '#ffffff', subColor: '#cbd5e1' },
            breaking: { rect: { fill: '#0a0f1d', fill2: '#2a0b15', gradDir: 'h', opacity: 0.97, radius: 4, shadow: true, stroke: '#ef4444', strokeOp: 0.35, strokeW: 2, accentBar: '#ef4444', accentBar2: '#b91c1c', accentW: 16, topHighlight: '#ef4444', topHighlightH: 4, skew: 0 }, tag: { bg: '#ef4444', bg2: '#991b1b', color: '#ffffff', pill: false, radius: 6, dot: true, skew: 0, shadow: true }, textColor: '#ffffff', subColor: '#fecaca' },
            sport: { rect: { fill: '#071426', fill2: '#102b4c', gradDir: 'h', opacity: 0.96, radius: 10, shadow: true, stroke: '#ffffff', strokeOp: 0.18, strokeW: 2, accentBar: '#10b981', accentBar2: '#34d399', accentW: 16, skew: -10 }, tag: { bg: '#059669', bg2: '#10b981', color: '#ffffff', pill: false, radius: 6, dot: true, skew: -10, shadow: true }, textColor: '#ffffff', subColor: '#a7f3d0' },
            brand: { rect: { fill: 'brand', fill2: 'brandDark', gradDir: 'd', opacity: 0.96, radius: 22, shadow: true, stroke: '#ffffff', strokeOp: 0.24, strokeW: 2, accentBar: '#ffffff', accentW: 10, skew: 0 }, tag: { bg: 'brandLight', bg2: 'brand', color: '#ffffff', pill: true, dot: true, skew: 0, shadow: true }, textColor: '#ffffff', subColor: '#f1f5f9' },
            gold: { rect: { fill: '#08111e', fill2: '#142033', gradDir: 'd', opacity: 0.96, radius: 14, shadow: true, stroke: '#d4a93c', strokeOp: 0.48, strokeW: 2, accentBar: '#d4a93c', accentBar2: '#f5d77a', accentW: 12, skew: 0 }, tag: { bg: '#d97706', bg2: '#f59e0b', color: '#ffffff', pill: true, dot: false, skew: 0, shadow: true }, textColor: '#ffffff', subColor: '#fde68a' },
          };
          m.querySelectorAll('[data-theme]').forEach((btn) => {
            btn.onclick = () => {
              const th = THEMES[btn.dataset.theme];
              if (!th) return;
              flushSnap();
              for (const l of activeLayers()) {
                if (l.type === 'rect' && (l.h || 0) >= 24) Object.assign(l, th.rect);
                else if (l.type === 'tag') Object.assign(l, th.tag);
                else if (l.type === 'text') l.color = l.key === 'role' || l.key === 'subtitle' ? th.subColor : th.textColor;
              }
              snapNow();
              drawIt(true);
              toast(`Estilo "${btn.textContent.trim()}" aplicado!`, 'ok');
            };
          });

          // Dados de teste ao vivo abaixo do canvas
          for (const [id, key] of [['#gz-test-name', 'name'], ['#gz-test-role', 'role'], ['#gz-test-headline', 'headline'], ['#gz-test-tag', 'tag']]) {
            const inp = m.querySelector(id);
            if (!inp) continue;
            inp.addEventListener('input', () => {
              data[key] = inp.value;
              drawCanvasOnly();
              renderPreview();
            });
          }

          // Adicionar camada com tipo específico
          m.querySelectorAll('[data-add-kind]').forEach((b) => (b.onclick = () => {
            const kind = b.dataset.addKind;
            const { sw, sh } = dims();
            const cur = activeLayers();
            let l;
            if (kind === 'rect') {
              l = { ...clone(LAYER_DEFAULTS.rect), id: uid(), x: Math.round(sw * 0.05), y: Math.round(sh * 0.74), w: Math.round(sw * 0.56), h: Math.round(sh * 0.13), fill: '#080d1c', fill2: '#131d38', gradDir: 'd', radius: 16, opacity: 0.94, shadow: true, accentBar: 'brand', accentW: 10 };
            } else if (kind === 'text-name') {
              l = { ...clone(LAYER_DEFAULTS.text), id: uid(), key: 'name', x: Math.round(sw * 0.07), y: Math.round(sh * 0.75), w: Math.round(sw * 0.5), h: 58, size: 44, weight: 800, font: 'display' };
            } else if (kind === 'text-role') {
              l = { ...clone(LAYER_DEFAULTS.text), id: uid(), key: 'role', x: Math.round(sw * 0.07), y: Math.round(sh * 0.81), w: Math.round(sw * 0.5), h: 38, size: 25, weight: 500, color: '#cbd5e1' };
            } else if (kind === 'text-headline') {
              l = { ...clone(LAYER_DEFAULTS.text), id: uid(), key: 'headline', x: Math.round(sw * 0.07), y: Math.round(sh * 0.78), w: Math.round(sw * 0.75), h: 66, size: 46, weight: 900, font: 'display', upper: true };
            } else if (kind === 'text-fixed') {
              l = { ...clone(LAYER_DEFAULTS.text), id: uid(), text: 'TEXTO FIXO', x: Math.round(sw * 0.07), y: Math.round(sh * 0.72), w: 380, h: 42, size: 26, weight: 800, color: '#f59e0b' };
              delete l.key;
            } else if (kind === 'tag') {
              l = { ...clone(LAYER_DEFAULTS.tag), id: uid(), key: 'tag', x: Math.round(sw * 0.06), y: Math.round(sh * 0.70), w: 220, h: 40, size: 18, bg: '#ef4444', bg2: '#b91c1c', pill: true, dot: true, shadow: true };
            } else if (kind === 'image') {
              l = { ...clone(LAYER_DEFAULTS.image), id: uid(), src: 'brand', x: Math.round(sw * 0.82), y: Math.round(sh * 0.75), w: 180, h: 120 };
            } else {
              l = { ...clone(LAYER_DEFAULTS.qr), id: uid(), key: 'qr', x: Math.round(sw * 0.84), y: Math.round(sh * 0.08), w: 160, h: 160 };
            }
            flushSnap();
            cur.push(l);
            selected = cur.length - 1;
            snapNow();
            drawIt(true);
          }));

          // Interação no canvas (arrastar, redimensionar com guias de centro, duplo clique para editar)
          const canvasPoint = (e) => {
            const { sw, sh } = dims();
            const r = cv.getBoundingClientRect();
            const x = r.width > 0 ? ((e.clientX - r.left) / r.width) * sw : 0;
            const y = r.height > 0 ? ((e.clientY - r.top) / r.height) * sh : 0;
            return { x, y, sw, sh };
          };
          let drag = null;
          cv.addEventListener('pointerdown', (e) => {
            flushSnap();
            const curLayers = activeLayers();
            const { x, y, sw } = canvasPoint(e);
            const tol = Math.round(sw * 0.015);
            const pts = (l) => ({
              nw: [l.x, l.y], n: [l.x + l.w / 2, l.y], ne: [l.x + l.w, l.y],
              e: [l.x + l.w, l.y + l.h / 2], se: [l.x + l.w, l.y + l.h],
              s: [l.x + l.w / 2, l.y + l.h], sw: [l.x, l.y + l.h], w: [l.x, l.y + l.h / 2],
            });
            const cur = curLayers[selected];
            if (cur && !cur.lock) {
              const hit = Object.entries(pts(cur)).find(([, [hx, hy]]) => Math.abs(x - hx) <= tol && Math.abs(y - hy) <= tol);
              if (hit) {
                drag = { mode: 'resize', i: selected, dir: hit[0], x0: x, y0: y, box: { x: cur.x, y: cur.y, w: cur.w, h: cur.h } };
                cv.setPointerCapture?.(e.pointerId);
                return;
              }
            }
            let hitIndex = -1;
            for (let i = curLayers.length - 1; i >= 0; i--) {
              const l = curLayers[i];
              if (!l.hidden && !l.lock && x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) {
                hitIndex = i;
                break;
              }
            }
            if (hitIndex >= 0) {
              const changed = selected !== hitIndex;
              selected = hitIndex;
              const l = curLayers[selected];
              drag = { mode: 'move', i: selected, dx: x - l.x, dy: y - l.y };
              cv.setPointerCapture?.(e.pointerId);
              drawIt(changed);
            }
          });
          cv.addEventListener('pointermove', (e) => {
            const curLayers = activeLayers();
            const { x, y, sw, sh } = canvasPoint(e);
            if (!drag) {
              const l = curLayers[selected];
              if (!l) { cv.style.cursor = 'default'; return; }
              const pts = { nw: [l.x, l.y], n: [l.x + l.w / 2, l.y], ne: [l.x + l.w, l.y], e: [l.x + l.w, l.y + l.h / 2], se: [l.x + l.w, l.y + l.h], s: [l.x + l.w / 2, l.y + l.h], sw: [l.x, l.y + l.h], w: [l.x, l.y + l.h / 2] };
              const tol = Math.round(sw * 0.015);
              const hit = Object.entries(pts).find(([, [hx, hy]]) => Math.abs(x - hx) <= tol && Math.abs(y - hy) <= tol);
              if (hit) cv.style.cursor = hit[0].length === 2 ? 'nwse-resize' : (hit[0].includes('n') || hit[0].includes('s') ? 'ns-resize' : 'ew-resize');
              else if (x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) cv.style.cursor = 'move';
              else cv.style.cursor = 'default';
              return;
            }
            const snap10 = (v) => (e.shiftKey ? Math.round(v) : Math.round(v / 10) * 10);
            const l = curLayers[drag.i];
            if (!l) return;
            guideX = null;
            guideY = null;
            if (drag.mode === 'move') {
              let nx = snap10(x - drag.dx);
              let ny = snap10(y - drag.dy);
              if (!e.shiftKey) {
                const cx = nx + l.w / 2;
                const cy = ny + l.h / 2;
                if (Math.abs(cx - sw / 2) <= 14) { nx = Math.round(sw / 2 - l.w / 2); guideX = sw / 2; }
                if (Math.abs(cy - sh / 2) <= 14) { ny = Math.round(sh / 2 - l.h / 2); guideY = sh / 2; }
              }
              l.x = nx;
              l.y = ny;
            } else {
              const b = drag.box;
              const dx = x - drag.x0;
              const dy = y - drag.y0;
              let nx = b.x, ny = b.y, nw = b.w, nh = b.h;
              if (drag.dir.includes('e')) nw = Math.max(20, b.w + dx);
              if (drag.dir.includes('s')) nh = Math.max(20, b.h + dy);
              if (drag.dir.includes('w')) {
                const cand = Math.max(20, b.w - dx);
                nx = b.x + (b.w - cand);
                nw = cand;
              }
              if (drag.dir.includes('n')) {
                const cand = Math.max(20, b.h - dy);
                ny = b.y + (b.h - cand);
                nh = cand;
              }
              l.x = snap10(nx); l.y = snap10(ny);
              l.w = Math.max(20, snap10(nw)); l.h = Math.max(20, snap10(nh));
            }
            drawCanvasOnly();
            syncGeomInputs();
          });
          cv.addEventListener('pointerup', () => {
            guideX = null;
            guideY = null;
            if (drag) { snapNow(); drawCanvasOnly(); }
            drag = null;
            cv.style.cursor = 'default';
          });
          cv.addEventListener('dblclick', () => {
            const focusEl = m.querySelector('#gz-text') || m.querySelector('#gz-key');
            focusEl?.focus?.();
            focusEl?.select?.();
          });

          const commitSave = (addToBar = false) => {
            flushSnap();
            cancelAnimationFrame(animRaf);
            base.name = m.querySelector('#gz-name').value.trim() || 'Meu template';
            base.category = m.querySelector('#gz-cat').value || 'Personalizado';
            base.fav = !!m.querySelector('#gz-fav').checked;
            base.autoGuest = !!m.querySelector('#gz-autoguest').checked;
            base.autoRss = !!m.querySelector('#gz-autorss').checked;
            base.takeGuest = !!m.querySelector('#gz-takeguest').checked;
            base.takeRss = !!m.querySelector('#gz-takerss').checked;
            const existing = S.gcTemplates.find((t) => t.id === base.id);
            if (existing) Object.assign(existing, base);
            else S.gcTemplates.push(base);
            saveStudio();
            close(base.id);
            selId = base.id;
            if (addToBar) {
              const item = buildBannerItem(base);
              if (onSaveBanner) onSaveBanner(item);
              else {
                S.banners.push(item);
                saveStudio();
                render();
                toast(`Template "${base.name}" salvo e cadastrado na barra!`, 'ok');
              }
            } else {
              render();
              toast(`Template “${base.name}” salvo`, 'ok');
            }
          };

          m.querySelector('#gz-cancel').onclick = () => { cancelAnimationFrame(animRaf); close(null); };
          m.querySelector('#gz-dup').onclick = () => {
            flushSnap();
            const copy = clone(base);
            copy.id = uid();
            copy.name = `${m.querySelector('#gz-name').value.trim() || base.name} (cópia)`;
            copy.builtin = false;
            S.gcTemplates.push(copy);
            saveStudio();
            close(copy.id);
            selId = copy.id;
            render();
            toast(`Template “${copy.name}” criado`, 'ok');
          };
          const delBtn = m.querySelector('#gz-del-tpl');
          let delArmed = false;
          let delTimer = null;
          const resetDel = () => {
            delArmed = false;
            clearTimeout(delTimer);
            if (!delBtn) return;
            delBtn.textContent = 'Excluir';
            delBtn.classList.remove('danger');
          };
          if (delBtn) delBtn.onclick = () => {
            if (base.builtin) return;
            if (!delArmed) {
              delArmed = true;
              delBtn.textContent = 'Confirmar exclusão';
              delBtn.classList.add('danger');
              delTimer = setTimeout(resetDel, 3500);
              return;
            }
            clearTimeout(delTimer);
            deleteTemplateNow(base.id, () => close(null));
          };
          m.querySelector('#gz-save').onclick = () => commitSave(false);
          m.querySelector('#gz-save-bar').onclick = () => commitSave(true);

          drawIt(true);
          snapNow();
          m.querySelector('#gz-undo').onclick = undo;
          m.querySelector('#gz-redo').onclick = redo;
          m.addEventListener('keydown', (e) => {
            const tag = (e.target?.tagName || '').toUpperCase();
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
            const cur = activeLayers();
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
              const l = cur[selected];
              if (!l) return;
              e.preventDefault();
              flushSnap();
              const copy = clone(l);
              copy.id = uid();
              copy.x += 20;
              copy.y += 20;
              cur.splice(selected + 1, 0, copy);
              selected++;
              snapNow();
              drawIt(true);
            } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              const l = cur[selected];
              if (!l || l.lock) return;
              e.preventDefault();
              const step = e.shiftKey ? 10 : 1;
              if (e.key === 'ArrowLeft') l.x -= step;
              if (e.key === 'ArrowRight') l.x += step;
              if (e.key === 'ArrowUp') l.y -= step;
              if (e.key === 'ArrowDown') l.y += step;
              drawCanvasOnly();
              syncGeomInputs();
              snap();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
              if (cur[selected]) {
                e.preventDefault();
                cur.splice(selected, 1);
                selected = cur.length ? Math.max(0, selected - 1) : -1;
                snapNow();
                drawIt(true);
              }
            }
          });
        },
      },
    );
  }

  function fillGuest(silent = false) {
    const g = getGuest?.();
    if (!g?.name) { if (!silent) toast('Nenhum convidado no backstage.', 'err'); return false; }
    data.name = g.name;
    data.role = g.state?.role || g.state?.title || data.role || '';
    renderPreview();
    return true;
  }
  function fillHeadline(silent = false) {
    const t = getHeadline?.();
    if (!t) { if (!silent) toast('Nenhuma manchete de RSS disponível.', 'err'); return false; }
    data.headline = t;
    if (!data.name) data.name = t;
    renderPreview();
    return true;
  }
  function onGuestJoin(g) {
    if (sel()?.autoGuest) fillGuest(true);
    if (sel()?.takeGuest && !active && g?.name) apply();
  }
  function onHeadline(t) {
    if (sel()?.autoRss && t && t !== data.headline) { data.headline = t; renderPreview(); }
    if (sel()?.takeRss && !active && t) apply();
  }

  // ------------------------------------------------------------- agendamento
  const fired = new Map();
  const todayKey = () => new Date().toISOString().slice(0, 10);
  const schedule = () => (S.brand.gcSchedule ||= []);
  function checkSchedule() {
    const now = new Date();
    const hh = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const s of schedule()) {
      if (s.at !== hh || fired.get(s.id) === todayKey()) continue;
      fired.set(s.id, todayKey());
      const tpl = S.gcTemplates.find((t) => t.id === s.templateId);
      if (!tpl) continue;
      selId = tpl.id;
      if (s.autoGuest) fillGuest(true);
      data.dur = Number(s.dur) || 0;
      apply(tpl);
      toast(`GC agendado: “${tpl.name}” entrou no ar`, 'ok');
    }
  }
  setInterval(checkSchedule, 15000);
  checkSchedule();

  function schedHtml() {
    const list = schedule();
    return `<details class="gc-sched"><summary>Agendar GC…</summary>
      <div class="row" style="gap:5px;align-items:end;margin-top:6px">
        <label class="field" style="margin:0"><span>Agendar</span><input class="input" type="time" id="gc-sched-time"></label>
        <label class="field grow" style="margin:0"><span>Template</span><select class="input" id="gc-sched-tpl">${S.gcTemplates.map((t) => `<option value="${escAttr(t.id)}" ${t.id === selId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
        <label class="field" style="margin:0"><span>Duração</span><input class="input" type="number" id="gc-sched-dur" value="10" min="0" max="120" style="width:62px"></label>
        <button class="btn ghost sm" id="gc-sched-add">+</button>
      </div>
      <div id="gc-sched-list">${list.length ? list.map((s) => `<div class="gc-sched-item"><b>${s.at}</b> ${esc(S.gcTemplates.find((t) => t.id === s.templateId)?.name || '?')} · ${s.dur || 0}s <button class="btn ghost sm" data-schedel="${escAttr(s.id)}" title="Cancelar">✕</button></div>`).join('') : '<span class="hint">Nenhum GC agendado.</span>'}</div>
    </details>`;
  }
  function bindSchedule(p) {
    p.querySelector('#gc-sched-add')?.addEventListener('click', () => {
      const at = p.querySelector('#gc-sched-time').value;
      const templateId = p.querySelector('#gc-sched-tpl').value;
      const dur = Number(p.querySelector('#gc-sched-dur').value) || 0;
      if (!at || !templateId) return toast('Escolha hora e template.', 'err');
      schedule().push({ id: uid(), at, templateId, dur });
      saveStudio();
      render();
    });
    for (const b of p.querySelectorAll('[data-schedel]')) b.addEventListener('click', () => {
      S.brand.gcSchedule = schedule().filter((s) => s.id !== b.dataset.schedel);
      saveStudio();
      render();
    });
  }

  // Galeria enxuta para o hub Grafismo: miniaturas grandes + ações explícitas.
  function deleteTemplateNow(id, after) {
    const t = S.gcTemplates.find((x) => x.id === id);
    if (!t) { after?.(); return; }
    if (t.builtin) {
      toast('Templates do sistema não podem ser excluídos. Duplique para editar.', 'err');
      return;
    }
    if (active && activeTplId === id) stop();
    S.gcTemplates = S.gcTemplates.filter((x) => x.id !== id || x.builtin);
    if (selId === id) selId = S.gcTemplates[0]?.id;
    if (S.brand.lastGcTemplate === id) S.brand.lastGcTemplate = selId;
    saveStudio();
    after?.();
    render();
    toast(`Template “${t.name}” excluído`, 'ok');
  }

  async function confirmDeleteTemplate(id, after) {
    const t = S.gcTemplates.find((x) => x.id === id);
    if (!t) { after?.(); return; }
    if (t.builtin) {
      toast('Templates do sistema não podem ser excluídos. Duplique para editar.', 'err');
      return;
    }
    const ok = await modal(`<h3>Excluir template?</h3>
      <p class="sub">“${esc(t.name)}” será removido da biblioteca. Essa ação não pode ser desfeita.</p>
      <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" data-close>Cancelar</button><button class="btn danger" data-del-ok>Excluir template</button></div>`,
      { onMount: (m, close) => { m.querySelector('[data-del-ok]').onclick = () => close(true); } });
    if (ok) deleteTemplateNow(id, after);
  }

  function galleryHtml() {
    return `<div class="gf-gallery">
      <div class="gf-gallery-head">
        <div><b>Biblioteca de templates</b><span class="hint"> ${S.gcTemplates.length} modelos</span></div>
        <button class="btn ghost sm" id="gf-new-tpl">${icons.plus} Novo template</button>
      </div>
      <div class="gf-gallery-grid">
        ${S.gcTemplates.map((t) => `<article class="gf-card" data-gf-card="${escAttr(t.id)}">
          <canvas class="gf-thumb" data-gf-thumb="${escAttr(t.id)}" width="280" height="158"></canvas>
          <div class="gf-card-body">
            <b>${esc(t.name)}</b>
            <small>${esc(t.category || 'Personalizado')} · ${t.verticalLayers?.length ? '16:9 + 9:16' : '16:9'}${t.autoGuest ? ' · auto convidado' : ''}${t.autoRss ? ' · auto RSS' : ''}</small>
            <div class="gf-card-acts">
              <button class="btn primary sm" data-gf-use="${escAttr(t.id)}">Usar</button>
              <button class="btn ghost sm" data-gf-edit="${escAttr(t.id)}">Editar</button>
              ${t.builtin ? '' : `<button class="btn danger sm gf-del" data-gf-del="${escAttr(t.id)}" title="Excluir template" aria-label="Excluir template ${escAttr(t.name)}">${icons.trash || '🗑'}</button>`}
            </div>
          </div>
        </article>`).join('')}
      </div>
    </div>`;
  }

  function bindGallery(p, { onUse } = {}) {
    p.querySelectorAll('[data-gf-thumb]').forEach((cv) => {
      const t = S.gcTemplates.find((x) => x.id === cv.dataset.gfThumb);
      if (t) drawThumb(cv, t);
    });
    p.querySelector('#gf-new-tpl')?.addEventListener('click', () => openDesigner(null));
    p.querySelectorAll('[data-gf-edit]').forEach((b) => b.addEventListener('click', () => openDesigner(b.dataset.gfEdit)));
    p.querySelectorAll('[data-gf-del]').forEach((b) => b.addEventListener('click', () => confirmDeleteTemplate(b.dataset.gfDel)));
    p.querySelectorAll('[data-gf-use]').forEach((b) => b.addEventListener('click', () => {
      selectTemplate(b.dataset.gfUse);
      onUse?.(b.dataset.gfUse);
    }));
  }

  function selectTemplate(id) {
    if (!S.gcTemplates.some((t) => t.id === id)) return false;
    selId = id;
    S.brand.lastGcTemplate = id;
    saveStudio();
    renderPreview();
    return true;
  }

  return { operatorHtml, bind, openDesigner, renderPreview, stop, onGuestJoin, onHeadline, galleryHtml, bindGallery, selectTemplate, fillGuest, fillHeadline };
}
