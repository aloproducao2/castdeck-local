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
    id: 'gc-lower-third',
    name: 'Lower third',
    builtin: true,
    category: 'Entrevista',
    fav: true,
    fields: ['name', 'role', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 70, y: 808, w: 1000, h: 152, fill: '#000000', radius: 16, opacity: 0.26 },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 80, y: 818, w: 980, h: 132 },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 80, y: 818, w: 8, h: 132, fill: 'brand', radius: 3 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 112, y: 836, w: 920, h: 58 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 112, y: 898, w: 920, h: 38, size: 26, weight: 600 },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 80, y: 762 },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1600, y: 818, w: 240, h: 132 },
    ],
  },
  {
    id: 'gc-hard',
    name: 'Hard news',
    builtin: true,
    category: 'Jornalismo',
    fav: true,
    fields: ['headline', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 0, y: 842, w: 1920, h: 160, fill: '#111827', radius: 0 },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 64, y: 790, w: 220, h: 48, size: 24 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'headline', x: 80, y: 866, w: 1500, h: 64, size: 48, weight: 900 },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1660, y: 858, w: 200, h: 110 },
    ],
  },
  {
    id: 'gc-strap',
    name: 'Nome / strap',
    builtin: true,
    category: 'Crédito',
    fav: false,
    fields: ['name', 'role'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 80, y: 892, w: 120, h: 8, radius: 4 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 80, y: 800, w: 900, h: 66, size: 54, weight: 900 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 80, y: 910, w: 900, h: 38, size: 26, weight: 600, color: '#cbd5e1' },
    ],
  },
  {
    id: 'gc-breaking',
    name: 'Plantão / breaking',
    builtin: true,
    category: 'Jornalismo',
    fav: true,
    fields: ['headline', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 0, y: 770, w: 1920, h: 230, fill: '#0b1220', radius: 0, opacity: 0.96 },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 0, y: 770, w: 14, h: 230, fill: '#ef4444', radius: 0 },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 56, y: 792, w: 240, h: 46, size: 22, bg: '#ef4444' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'headline', x: 56, y: 850, w: 1660, h: 82, size: 54, weight: 900 },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1700, y: 826, w: 170, h: 112 },
    ],
  },
  {
    id: 'gc-opening',
    name: 'Abertura / título',
    builtin: true,
    category: 'Marca',
    fav: false,
    fields: ['name', 'role', 'tag'],
    layers: [
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 0, y: 0, w: 1920, h: 1080, fill: '#0d1020', radius: 0, opacity: 0.94 },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 760, y: 596, w: 400, h: 8, radius: 4 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 160, y: 380, w: 1600, h: 112, size: 82, weight: 900, align: 'center' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 160, y: 516, w: 1600, h: 54, size: 30, weight: 600, align: 'center', color: '#cbd5e1' },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 760, y: 650, w: 400, h: 46, size: 20, bg: 'brand' },
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
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 64, y: 838, w: 776, h: 120, fill: '#000000', radius: 10, opacity: 0.24 },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 72, y: 846, w: 760, h: 104, fill: '#0f172a', radius: 8, opacity: 0.96 },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 72, y: 846, w: 8, h: 104, fill: 'brand', radius: 2 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'name', x: 100, y: 858, w: 700, h: 48, size: 38, weight: 900 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', x: 100, y: 906, w: 700, h: 30, size: 22, weight: 600, color: '#cbd5e1' },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 72, y: 794, w: 170, h: 36, size: 17, bg: 'brand' },
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
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 0, y: 748, w: 1920, h: 332, fill: '#052e24', radius: 0, opacity: 0.97 },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 0, y: 744, w: 1920, h: 5, fill: '#d4a93c', radius: 0 },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 36, y: 30, w: 330, h: 128, fill: '#06120e', radius: 12, opacity: 0.9 },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 54, y: 44, w: 294, h: 64 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'seller', x: 56, y: 112, w: 292, h: 28, size: 16, weight: 700, color: '#bfe8d0' },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 36, y: 168, w: 180, h: 36, size: 17, bg: '#145c43' },
      { ...LAYER_DEFAULTS.image, id: uid(), src: 'brand', x: 1500, y: 28, w: 260, h: 100 },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'clock', x: 1540, y: 140, w: 150, h: 36, size: 28, weight: 900, color: '#f5d77a', align: 'right' },
      { ...LAYER_DEFAULTS.qr, id: uid(), key: 'qr', x: 1710, y: 118, w: 170, h: 170, qrColor: '#ffffff' },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 40, y: 650, w: 220, h: 92, fill: '#0d4a36', radius: 12 },
      { ...LAYER_DEFAULTS.text, id: uid(), text: 'PESO MÉDIO', x: 56, y: 662, w: 188, h: 22, size: 15, weight: 700, color: '#a7d8c4' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'weight', x: 56, y: 686, w: 188, h: 50, size: 36, weight: 900, color: '#f5d77a' },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 1320, y: 650, w: 250, h: 92, fill: '#0d4a36', radius: 12 },
      { ...LAYER_DEFAULTS.text, id: uid(), text: 'VALOR POR KG', x: 1338, y: 662, w: 214, h: 22, size: 15, weight: 700, color: '#a7d8c4' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'priceKg', x: 1338, y: 686, w: 214, h: 48, size: 34, weight: 900, color: '#f5d77a' },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 1584, y: 650, w: 296, h: 92, fill: '#0d4a36', radius: 12 },
      { ...LAYER_DEFAULTS.text, id: uid(), text: 'VALOR POR @', x: 1602, y: 662, w: 260, h: 22, size: 15, weight: 700, color: '#a7d8c4' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'priceArroba', x: 1602, y: 686, w: 260, h: 48, size: 34, weight: 900, color: '#f5d77a' },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 40, y: 760, w: 220, h: 280, fill: '#0a5a3f', radius: 14 },
      { ...LAYER_DEFAULTS.text, id: uid(), text: 'LOTE', x: 62, y: 778, w: 176, h: 26, size: 17, weight: 800, color: '#bfe8d0' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'lot', x: 54, y: 812, w: 192, h: 150, size: 100, weight: 900, color: '#f5d77a', align: 'center' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'item', x: 290, y: 786, w: 1000, h: 76, size: 50, weight: 900, color: '#ffffff' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'contact', x: 290, y: 872, w: 1000, h: 34, size: 20, weight: 600, color: '#bfe8d0' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'bidder', x: 290, y: 916, w: 700, h: 32, size: 19, weight: 700, color: '#f5d77a' },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 1320, y: 760, w: 560, h: 280, fill: '#0d4a36', radius: 14 },
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
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 38, y: 726, w: 1844, h: 298, fill: '#000000', radius: 16, opacity: 0.24 },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 48, y: 736, w: 1824, h: 278, fill: '#0b1220', radius: 14, opacity: 0.97 },
      { ...LAYER_DEFAULTS.rect, id: uid(), x: 48, y: 736, w: 10, h: 278, fill: '#f59e0b', radius: 3 },
      { ...LAYER_DEFAULTS.tag, id: uid(), key: 'tag', x: 82, y: 756, w: 220, h: 40, size: 18, bg: '#d97706' },
      { ...LAYER_DEFAULTS.text, id: uid(), key: 'item', x: 82, y: 814, w: 1420, h: 66, size: 48, weight: 900 },
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
    if (t.id === 'gc-lower-third') {
      push(v,
        rect({ x: 40, y: 1460, w: 1000, h: 360, fill: '#0b1220', radius: 18, opacity: 0.96 }),
        rect({ x: 40, y: 1460, w: 10, h: 360, fill: 'brand', radius: 4 }),
        tag(t, { x: 68, y: 1484, w: 220, h: 46, size: 20 }),
        cp(t, 'name', 'text', { x: 98, y: 1548, w: 700, h: 76, size: 58 }),
        cp(t, 'role', 'text', { x: 98, y: 1632, w: 700, h: 44, size: 26 }),
        image(t, { x: 830, y: 1540, w: 180, h: 180 })
      );
    } else if (t.id === 'gc-hard' || t.id === 'gc-breaking') {
      push(v,
        rect({ x: 0, y: 1500, w: 1080, h: 420, fill: '#0b1220', radius: 0, opacity: 0.97 }),
        rect({ x: 0, y: 1500, w: 12, h: 420, fill: t.id === 'gc-breaking' ? '#ef4444' : '#d4a93c', radius: 0 }),
        tag(t, { x: 48, y: 1524, w: 240, h: 48, size: 22 }),
        cp(t, 'headline', 'text', { x: 48, y: 1600, w: 780, h: 160, size: 46 }),
        image(t, { x: 850, y: 1540, w: 170, h: 170 })
      );
    } else if (t.id === 'gc-strap') {
      push(v,
        rect({ x: 80, y: 1450, w: 160, h: 8, fill: 'brand', radius: 4 }),
        cp(t, 'name', 'text', { x: 80, y: 1488, w: 900, h: 82, size: 58 }),
        cp(t, 'role', 'text', { x: 80, y: 1582, w: 900, h: 44, size: 26 })
      );
    } else if (t.id === 'gc-opening') {
      push(v,
        rect({ x: 0, y: 0, w: 1080, h: 1920, fill: '#0d1020', radius: 0, opacity: 0.94 }),
        rect({ x: 340, y: 1000, w: 400, h: 8, fill: 'brand', radius: 4 }),
        image(t, { x: 410, y: 390, w: 260, h: 130 }),
        cp(t, 'name', 'text', { x: 80, y: 720, w: 920, h: 120, size: 76, align: 'center' }),
        cp(t, 'role', 'text', { x: 80, y: 870, w: 920, h: 54, size: 28, align: 'center' }),
        tag(t, { x: 390, y: 1030, w: 300, h: 48, size: 19 })
      );
    } else if (t.id === 'gc-compact') {
      push(v,
        rect({ x: 40, y: 1560, w: 820, h: 270, fill: '#0f172a', radius: 12, opacity: 0.96 }),
        rect({ x: 40, y: 1560, w: 8, h: 270, fill: 'brand', radius: 3 }),
        cp(t, 'name', 'text', { x: 70, y: 1590, w: 760, h: 66, size: 42 }),
        cp(t, 'role', 'text', { x: 70, y: 1664, w: 760, h: 38, size: 23 }),
        tag(t, { x: 40, y: 1504, w: 190, h: 40, size: 17 })
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
  // garante que os modelos do sistema existam, sem apagar os do usuário
  for (const b of BUILTINS) {
    const cur = S.gcTemplates.find((t) => t.id === b.id);
    if (!cur) S.gcTemplates.push(clone(b));
    else if (cur.builtin && !Array.isArray(cur.verticalLayers) && b.verticalLayers) cur.verticalLayers = clone(b.verticalLayers);
  }
  for (const t of S.gcTemplates) {
    if (!t.category) t.category = 'Personalizado';
    if (t.builtin) for (const l of [...(t.layers || []), ...(t.verticalLayers || [])]) if (l.text && l.key) delete l.key;
  }
}

export function createGcDesigner({ S, comp, modal, esc, icons, toast, saveStudio, brandColor, render, onAir, getGuest, getHeadline, allowPopout = false }) {
  ensureGcTemplates(S);
  let selId = S.gcTemplates.some((t) => t.id === S.brand.lastGcTemplate) ? S.brand.lastGcTemplate : S.gcTemplates[0].id;
  let search = '';
  let cat = 'todos';
  let favOnly = false;
  let active = false;
  let activeTplId = null;
  let timer = null;
  let previewVertical = !!(S.brand?.vOn || S.vlive);
  const data = {
    name: 'Maria Silva', role: 'Repórter — Brasília', tag: 'AO VIVO', headline: '', dur: 0,
    item: '01 VACA CRUZADA | ACIMA 36 MESES', bid: 'R$ 4.420,00', bidder: 'Júnior', lot: '86',
    weight: '458', priceKg: 'R$ 9,65', priceArroba: 'R$ 289,46', payment: 'PAGAMENTO À VISTA',
    contact: 'Júnior (18) 99765-9868 · Adriano (18) 99699-9136',
    seller: 'LUCÉLIA LEILÕES', clock: '01:24', qr: 'https://castdeck.local/leilao',
  };
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

  function draw(canvas, tpl, selectedIndex = -1) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2b3350');
    g.addColorStop(1, '#10131f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.38, H * 0.2, 0, 7);
    ctx.fill();
    ctx.fillRect(W * 0.34, H * 0.56, W * 0.32, H * 0.5);
    const p = payload(tpl);
    drawBanner({ ctx, W, H, image, banner: { ...p, t0: performance.now() - 2000 } }, hexToRgb(brandColor()), performance.now(), 0, 0);
    // área de segurança (5%)
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1;
    ctx.strokeRect(W * 0.05, H * 0.05, W * 0.9, H * 0.9);
    ctx.setLineDash([]);
    const l = tpl.layers[selectedIndex];
    if (l) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.strokeRect((l.x / 1920) * W, (l.y / 1080) * H, (l.w / 1920) * W, (l.h / 1080) * H);
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
      const el = document.getElementById(id);
      if (el && document.activeElement !== el && el.value !== String(data[key] ?? '')) el.value = String(data[key] ?? '');
    }
    for (const el of document.querySelectorAll('[data-gc-extra]')) {
      const k = el.dataset.gcExtra;
      if (k && document.activeElement !== el && el.value !== String(data[k] ?? '')) el.value = String(data[k] ?? '');
    }
    const dur = document.getElementById('gc-dur');
    if (dur && document.activeElement !== dur && Number(dur.value) !== Number(data.dur || 0)) dur.value = String(Number(data.dur) || 0);
  }

  function renderPreview() {
    syncFields();
    const cv = document.getElementById('gc-prev');
    if (cv) {
      const w = previewVertical ? 360 : 640;
      const h = previewVertical ? 640 : 360;
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
      cv.classList.toggle('is-vertical', previewVertical);
      const pv = document.getElementById('gc-prev-orient');
      if (pv) pv.textContent = previewVertical ? '9:16' : '16:9';
      draw(cv, sel());
    }
    const state = document.getElementById('gc-op-state');
    if (state) {
      state.textContent = active ? 'NO AR' : '';
      state.className = 'gc-op-state' + (active ? ' on' : '');
    }
    const air = document.getElementById('gc-air');
    if (air) air.textContent = active ? 'Atualizar no ar' : 'Colocar no ar';
    const off = document.getElementById('gc-op-off');
    if (off) off.disabled = !active;
    const airline = document.getElementById('gc-airline');
    if (airline) airline.classList.toggle('on', active);
    const airlineTitle = document.getElementById('gc-airline-title');
    if (airlineTitle) airlineTitle.textContent = active ? (S.activeBannerTitle || sel().name) : 'Fora do ar';
    const airlineStop = document.getElementById('gc-airline-stop');
    if (airlineStop) airlineStop.disabled = !active;
    const tpl = sel();
    const hasHeadline = tpl.layers.some((l) => l.key === 'headline');
    const hasName = tpl.layers.some((l) => l.key === 'name');
    const nameEmpty = !String(data.name || '').trim();
    const headEmpty = !String(data.headline || '').trim();
    const requiredEmpty = (tpl.required || []).filter((k) => !String(data[k] ?? '').trim());
    const missing = (hasName && nameEmpty) || (hasHeadline && headEmpty) || (!hasName && !hasHeadline && nameEmpty && headEmpty) || requiredEmpty.length > 0;
    const warn = document.getElementById('gc-warn');
    if (warn) {
      warn.hidden = !missing;
      warn.textContent = requiredEmpty.length
        ? `Preencha ${requiredEmpty.map(fieldLabel).join(' e ')} antes de ir ao ar.`
        : hasHeadline && headEmpty ? 'Preencha a manchete antes de ir ao ar.' : 'Preencha o nome antes de ir ao ar.';
    }
    if (air) air.disabled = missing && !active;
  }

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
    const off = document.getElementById('gc-op-off');
    if (off) off.disabled = true;
    const airlineStop = document.getElementById('gc-airline-stop');
    if (airlineStop) airlineStop.disabled = true;
    onAir?.();
  }

  function operatorHtml() {
    const tpl = sel();
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
    return `
      <div class="gc-op">
        <div class="gc-airline ${active ? 'on' : ''}" id="gc-airline">
          <span class="gc-airline-dot"></span>
          <b id="gc-airline-title">${active ? esc(S.activeBannerTitle || tpl.name) : 'Fora do ar'}</b>
          <button class="btn danger sm" id="gc-airline-stop" ${active ? '' : 'disabled'}>Tirar do ar</button>
        </div>
        <div class="gc-op-head"><h4>Grafismo ao vivo <span class="hint" id="gc-op-state"></span></h4><button class="btn ghost sm" id="gc-prev-orient" title="Alternar prévia 16:9 / 9:16">${previewVertical ? '9:16' : '16:9'}</button><button class="btn ghost sm" id="gc-new-tpl">${icons.plus} Novo template</button></div>
        <div class="gc-lib-tools">
          <input class="input" id="gc-search" placeholder="Buscar template…" value="${escAttr(search)}" autocomplete="off">
          <select class="input" id="gc-cat"><option value="todos">Todas as categorias</option>${[...new Set(S.gcTemplates.map((t) => t.category || 'Personalizado'))].map((c) => `<option value="${escAttr(c)}" ${cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <button class="btn ghost sm ${favOnly ? 'primary' : ''}" id="gc-fav" title="Só favoritos">★</button>
        </div>
        <div class="gc-tpl-row">${S.gcTemplates.map((t) => `<div class="gc-tpl ${t.id === selId ? 'sel' : ''}" data-gct="${escAttr(t.id)}" data-cat="${escAttr(t.category || 'Personalizado')}" data-name="${escAttr(String(t.name).toLowerCase())}" tabindex="0" role="button"><canvas class="gc-thumb" data-thumb="${escAttr(t.id)}" width="160" height="90"></canvas><span class="gc-tpl-meta"><b>${esc(t.name)}</b><small>${esc(t.category || 'Personalizado')}${t.autoGuest ? ' · auto convidado' : ''}${t.autoRss ? ' · auto RSS' : ''}</small></span><button class="gc-star ${t.fav ? 'on' : ''}" data-favbtn="${escAttr(t.id)}" title="Favorito">★</button>${t.builtin ? '' : `<button class="gc-del" data-deltpl="${escAttr(t.id)}" title="Excluir template" aria-label="Excluir template ${escAttr(t.name)}">${icons.trash || '🗑'}</button>`}</div>`).join('')}</div>
        <div class="gc-auto-row"><button class="btn ghost sm" id="gc-fill-guest">Do convidado</button><button class="btn ghost sm" id="gc-fill-rss">Do RSS</button>${tpl.autoGuest ? '<span class="hint">auto: convidado</span>' : ''}${tpl.autoRss ? '<span class="hint">auto: RSS</span>' : ''}</div>
        ${schedHtml()}
        <p class="hint" id="gc-empty" hidden>Nenhum template com esse filtro.</p>
        <div class="gc-op-grid">
          <canvas id="gc-prev" width="${previewVertical ? 360 : 640}" height="${previewVertical ? 640 : 360}" class="${previewVertical ? 'is-vertical' : ''}"></canvas>
          <div class="gc-op-fields">
            ${fieldOrder.map(fieldHtml).join('')}
            <div class="row" style="gap:8px">
              <label class="field grow"><span>Duração</span><select class="input" id="gc-dur">${[0, 5, 8, 10, 15, 30].map((n) => `<option value="${n}" ${Number(data.dur) === n ? 'selected' : ''}>${n ? n + ' s' : 'Manual'}</option>`).join('')}</select></label>
            </div>
            <div class="gc-warn" id="gc-warn" hidden>Preencha o nome (ou a manchete) antes de ir ao ar.</div>
            <div class="row" style="gap:6px;margin-top:6px">
              <button class="btn primary grow" id="gc-air">Colocar no ar</button>
              <button class="btn danger" id="gc-op-off" disabled>Tirar</button>
            </div>
            <button class="btn ghost sm" id="gc-edit" style="margin-top:6px">✎ Editar design</button>
          </div>
        </div>
      </div>`;
  }

  function bind(p) {
    const q = (s) => p.querySelector(s);
    q('#gc-new-tpl')?.addEventListener('click', () => openDesigner(null));
    q('#gc-prev-orient')?.addEventListener('click', () => {
      previewVertical = !previewVertical;
      renderPreview();
    });
    q('#gc-edit')?.addEventListener('click', () => openDesigner(selId));
    q('#gc-fill-guest')?.addEventListener('click', () => fillGuest());
    q('#gc-fill-rss')?.addEventListener('click', () => fillHeadline());
    q('#gc-air')?.addEventListener('click', () => apply());
    q('#gc-op-off')?.addEventListener('click', stop);
    q('#gc-airline-stop')?.addEventListener('click', stop);
    for (const el of p.querySelectorAll('[data-gc-extra]')) {
      el.addEventListener('input', () => {
        const k = el.dataset.gcExtra;
        if (k) { data[k] = el.value; renderPreview(); }
      });
    }
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
      const has = (k) => sel().layers.some((l) => l.key === k);
      for (const [k, wrap] of [['name', '#gc-name-wrap'], ['role', '#gc-role-wrap'], ['headline', '#gc-headline-wrap'], ['tag', '#gc-tag-wrap']]) {
        const el = q(wrap);
        if (el) el.hidden = !has(k);
      }
      renderPreview();
      render();
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
    for (const [id, key] of [['#gc-name', 'name'], ['#gc-role', 'role'], ['#gc-tag', 'tag'], ['#gc-headline', 'headline']]) {
      const el = q(id);
      if (el) el.addEventListener('input', () => { data[key] = el.value; renderPreview(); });
    }
    q('#gc-dur')?.addEventListener('change', (e) => { data.dur = Number(e.target.value) || 0; });
    bindSchedule(p);
    filter();
    renderPreview();
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
        { ...LAYER_DEFAULTS.rect, id: uid() },
        { ...LAYER_DEFAULTS.text, id: uid(), key: 'name' },
        { ...LAYER_DEFAULTS.text, id: uid(), key: 'role', y: 898, h: 38, size: 26, weight: 600 },
      ];
    }
    let selected = 0;
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
    const layerName = (l) => {
      const kind = l.type === 'text' ? 'Texto' : l.type === 'tag' ? 'Etiqueta' : l.type === 'image' ? 'Imagem' : l.type === 'qr' ? 'QR' : 'Forma';
      const field = l.key ? fieldLabel(l.key) : '';
      return field ? `${kind}: ${field}` : kind;
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
          // O window.open pode devolver um about:blank antes de navegar para o shell.
          // Só adota o modal quando o documento final do Template Studio estiver pronto.
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
          const timer = setInterval(() => {
            if (win.closed || !back.isConnected) {
              clearInterval(timer);
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
    const colorField = (l, key, label) => {
      const raw = l[key];
      const isBrand = raw === 'brand';
      const fallback = key === 'color' ? '#ffffff' : '#7c5cff';
      const hexValue = isBrand ? brandColor() : (normalizeHex(raw) || normalizeHex(fallback) || fallback);
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
        <h3>${esc(base.name)} <span class="hint">— arraste os elementos no canvas</span></h3>
        <div class="gc-dz-grid">
          <aside class="gc-dz-left">
            <details class="gc-dz-acc" open>
              <summary>Adicionar elemento</summary>
              <div class="gc-palette">
                <button class="btn sm" data-add="rect">▭ Barra</button>
                <button class="btn sm" data-add="text">T Nome</button>
                <button class="btn sm" data-add="text">T Texto</button>
                <button class="btn sm" data-add="tag">● Etiqueta</button>
                <button class="btn sm" data-add="image">▣ Logo</button>
                <button class="btn sm" data-add="qr">▦ QR Code</button>
              </div>
            </details>
            <details class="gc-dz-acc" open>
              <summary>Camadas <span class="hint" id="gz-layer-count">0</span></summary>
              <div id="gz-layers"></div>
            </details>
            <details class="gc-dz-acc" open>
              <summary>Regras</summary>
              <div id="gz-rules"></div>
              <button class="btn ghost sm" id="gz-add-rule" style="margin-top:4px">+ Regra</button>
            </details>
          </aside>
          <div class="gc-dz-canvas"><canvas id="gz-canvas" width="960" height="540"></canvas></div>
          <aside class="gc-dz-insp" id="gz-insp"></aside>
        </div>
        <div class="gc-dz-foot">
          <div class="gc-dz-row">
            <label class="field grow"><span>Nome do template</span><input class="input" id="gz-name" maxlength="40" value="${escAttr(base.name)}"></label>
            <label class="field"><span>Categoria</span><select class="input" id="gz-cat">${[...new Set(['Personalizado', 'Jornalismo', 'Entrevista', 'Esporte', 'Leilão', 'Marca', 'Crédito', 'Rodapé', ...S.gcTemplates.map((t) => t.category || 'Personalizado')])].map((c) => `<option value="${escAttr(c)}" ${(base.category || 'Personalizado') === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
            <label class="check" style="align-self:center"><input type="checkbox" id="gz-fav" ${base.fav ? 'checked' : ''}> Favorito</label>
          </div>
          <div class="gc-dz-row gc-dz-actions">
            <div class="gc-dz-opts">
              <label class="check" title="Preencher o nome quando um convidado entrar"><input type="checkbox" id="gz-autoguest" ${base.autoGuest ? 'checked' : ''}> Auto convidado</label>
              <label class="check" title="Preencher a manchete com o RSS mais recente"><input type="checkbox" id="gz-autorss" ${base.autoRss ? 'checked' : ''}> Auto RSS</label>
              <label class="check" title="Entrar no ar quando um convidado entrar"><input type="checkbox" id="gz-takeguest" ${base.takeGuest ? 'checked' : ''}> TAKE convidado</label>
              <label class="check" title="Entrar no ar quando o RSS atualizar"><input type="checkbox" id="gz-takerss" ${base.takeRss ? 'checked' : ''}> TAKE RSS</label>
            </div>
            <div class="gc-dz-btns">
              <button class="btn ghost" id="gz-undo" title="Desfazer (Ctrl+Z)" disabled>↶</button>
              <button class="btn ghost" id="gz-redo" title="Refazer (Ctrl+Y)" disabled>↷</button>
              <button class="btn ghost" id="gz-dup" title="Duplicar este template">Duplicar</button>
              <button class="btn ghost" id="gz-del-tpl" title="Excluir este template" ${base.builtin ? 'disabled' : ''}>Excluir</button>
              <button class="btn" id="gz-cancel">Cancelar</button>
              <button class="btn primary" id="gz-save">${icons.plus} Salvar</button>
            </div>
          </div>
        </div>
      </div>`,
      {
        screen: true,
        sticky: true,
        onMount: (m, close) => {
          openEditorWindow(m);
          const cv = m.querySelector('#gz-canvas');
          // histórico do design (30 passos)
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
            history.push(clone(base.layers));
            if (history.length > 30) history.shift();
            hi = history.length - 1;
            updateUndo();
          };
          // Agrupa mudanças rápidas (arrastar/teclar) num único passo: só grava depois de 450 ms de pausa.
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
            base.layers = clone(history[hi]);
            selected = Math.max(0, Math.min(selected, base.layers.length - 1));
            drawIt();
          };
          const redo = () => {
            if (hi >= history.length - 1) return;
            cancelSnap();
            hi++;
            base.layers = clone(history[hi]);
            selected = Math.max(0, Math.min(selected, base.layers.length - 1));
            drawIt();
          };
          const drawIt = () => {
            const ctx = cv.getContext('2d');
            const g = ctx.createLinearGradient(0, 0, cv.width, cv.height);
            g.addColorStop(0, '#2b3350');
            g.addColorStop(1, '#10131f');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, cv.width, cv.height);
            const p = payload(base);
            drawBanner({ ctx, W: cv.width, H: cv.height, image, banner: { ...p, t0: performance.now() - 2000 } }, hexToRgb(brandColor()), performance.now(), 0, 0);
            ctx.strokeStyle = 'rgba(255,255,255,.22)';
            ctx.setLineDash([6, 6]);
            ctx.strokeRect(cv.width * 0.05, cv.height * 0.05, cv.width * 0.9, cv.height * 0.9);
            ctx.setLineDash([]);
            const l = base.layers[selected];
            if (l) {
              ctx.strokeStyle = '#f59e0b';
              ctx.lineWidth = 2;
              const rx = (l.x / 1920) * cv.width;
              const ry = (l.y / 1080) * cv.height;
              const rw = (l.w / 1920) * cv.width;
              const rh = (l.h / 1080) * cv.height;
              ctx.strokeRect(rx, ry, rw, rh);
              // alças de redimensionamento (cantos e meios)
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
            m.querySelector('#gz-layers').innerHTML = base.layers.length
              ? base.layers
                .map((l, i) => `<div class="gz-layer-row ${i === selected ? 'sel' : ''}">
                  <button class="gz-layer-name" data-layer="${i}" title="Selecionar camada">${i + 1}. ${l.type === 'text' ? 'T' : l.type === 'tag' ? '●' : l.type === 'image' ? '▣' : l.type === 'qr' ? '▦' : '▭'} ${esc(layerName(l))}</button>
                  <button class="gz-mini" data-vis="${i}" title="${l.hidden ? 'Mostrar camada' : 'Ocultar camada'}">${l.hidden ? '◌' : '◉'}</button>
                  <button class="gz-mini" data-lock="${i}" title="${l.lock ? 'Destravar camada' : 'Travar camada'}">${l.lock ? '🔒' : '🔓'}</button>
                  <button class="gz-mini" data-up="${i}" title="Subir camada" ${i === 0 ? 'disabled' : ''}>↑</button>
                  <button class="gz-mini" data-down="${i}" title="Descer camada" ${i === base.layers.length - 1 ? 'disabled' : ''}>↓</button>
                  <button class="gz-mini gz-mini-del" data-dellayer="${i}" title="Excluir camada" aria-label="Excluir camada ${esc(layerName(l))}">🗑</button>
                </div>`)
                .join('')
              : '<p class="hint">Nenhuma camada. Adicione um elemento.</p>';
            const gzLayerCount = m.querySelector('#gz-layer-count');
            if (gzLayerCount) gzLayerCount.textContent = String(base.layers.length);
            m.querySelectorAll('[data-layer]').forEach((b) => (b.onclick = () => { selected = +b.dataset.layer; drawIt(); inspector(); }));
            m.querySelectorAll('[data-vis]').forEach((b) => (b.onclick = () => {
              const l = base.layers[+b.dataset.vis];
              if (!l) return;
              l.hidden = !l.hidden;
              snapNow();
              drawIt();
            }));
            m.querySelectorAll('[data-lock]').forEach((b) => (b.onclick = () => {
              const l = base.layers[+b.dataset.lock];
              if (!l) return;
              l.lock = !l.lock;
              snapNow();
              drawIt();
            }));
            for (const dir of ['up', 'down']) m.querySelectorAll(`[data-${dir}]`).forEach((b) => (b.onclick = () => {
              const i = +b.dataset[dir];
              const j = i + (dir === 'up' ? -1 : 1);
              if (j < 0 || j >= base.layers.length) return;
              [base.layers[i], base.layers[j]] = [base.layers[j], base.layers[i]];
              selected = j;
              snapNow();
              drawIt();
            }));
            m.querySelectorAll('[data-dellayer]').forEach((b) => (b.onclick = (e) => {
              e.stopPropagation();
              const i = +b.dataset.dellayer;
              if (!base.layers[i]) return;
              flushSnap();
              base.layers.splice(i, 1);
              selected = Math.max(0, Math.min(selected, base.layers.length - 1));
              snapNow();
              drawIt();
              inspector();
              renderRules();
            }));
            inspector();
            renderRules();
          };
          const inspector = () => {
            const l = base.layers[selected];
            const box = m.querySelector('#gz-insp');
            if (!l) { box.innerHTML = '<p class="hint">Adicione um elemento.</p>'; return; }
            const keyOptions = [...new Set([...BASE_FIELDS, ...extraKeysFor(base), l.key].filter(Boolean))];
            const num = (k, label, min = -5000, max = 5000) => `<label class="field"><span>${label}</span><input class="input" type="number" id="gz-${k}" value="${Math.round(l[k] || 0)}" min="${min}" max="${max}"></label>`;
            box.innerHTML = `
              <h4>${l.type === 'text' ? 'Texto' : l.type === 'tag' ? 'Etiqueta' : l.type === 'image' ? 'Imagem' : l.type === 'qr' ? 'QR Code' : 'Forma'}</h4>
              ${l.type === 'text' || l.type === 'tag' ? `<label class="field"><span>Campo</span><select class="input" id="gz-key">${keyOptions.map((k) => `<option value="${escAttr(k)}" ${l.key === k ? 'selected' : ''}>${esc(fieldLabel(k))}</option>`).join('')}</select></label>` : ''}
              ${l.type === 'text' ? `<label class="field"><span>Texto fixo (sem campo)</span><input class="input" id="gz-text" maxlength="120" value="${escAttr(l.text || '')}" placeholder="Ex.: LANCE ATUAL"></label>` : ''}
              ${l.type === 'text' || l.type === 'tag' ? `<label class="field"><span>Tamanho</span><input class="input" type="number" id="gz-size" value="${l.size || 32}" min="10" max="160"></label>` : ''}
              <div class="row" style="gap:6px">${num('x', 'X')}${num('y', 'Y')}</div>
              <div class="row" style="gap:6px">${num('w', 'Largura', 10, 1920)}${num('h', 'Altura', 10, 1080)}</div>
              <div class="gz-align" title="Alinhar na área de segurança">
                <button data-align="left" title="Esquerda">⇤</button>
                <button data-align="center" title="Centro horizontal">↔</button>
                <button data-align="right" title="Direita">⇥</button>
                <button data-align="top" title="Topo">⇧</button>
                <button data-align="middle" title="Centro vertical">↕</button>
                <button data-align="bottom" title="Base">⇩</button>
              </div>
              ${l.type === 'rect' ? colorField(l, 'fill', 'Cor da barra') : ''}
              ${l.type === 'text' ? colorField(l, 'color', 'Cor do texto') : ''}
              ${l.type === 'tag' ? colorField(l, 'bg', 'Cor de fundo') + colorField(l, 'color', 'Cor do texto') : ''}
              ${l.type === 'qr' ? colorField(l, 'qrColor', 'Cor do QR') : ''}
              ${l.type === 'text' || l.type === 'tag' ? `<label class="check" style="margin:2px 0 6px"><input type="checkbox" id="gz-hideempty" ${l.hideEmpty ? 'checked' : ''}> Ocultar se o campo estiver vazio</label>` : ''}
              <div class="row" style="gap:6px;margin-top:8px"><button class="btn ghost sm grow" id="gz-dup-layer">Duplicar camada</button><button class="btn danger sm" id="gz-del">Excluir camada</button></div>`;
            box.querySelectorAll('input,select').forEach((el) => {
              if (el.matches('[data-gz-color],[data-gz-hex]')) return;
              el.oninput = () => {
                const k = el.id.slice(3);
                if (k === 'key') l.key = el.value;
                else if (k === 'hideempty') l.hideEmpty = el.checked;
                else l[k] = Number(el.value);
                drawIt();
                snap();
              };
            });
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
                const hex = field.querySelector('[data-gz-hex]');
                if (native) native.value = shown;
                if (hex) hex.value = shown;
                field.querySelectorAll('[data-gz-swatch]').forEach((b) => b.classList.toggle('on', !brand && b.dataset.gzSwatch === l[key]));
                field.querySelector('[data-gz-brand]')?.classList.toggle('on', brand);
                drawIt();
                snap();
              };
              const native = field.querySelector('[data-gz-color]');
              if (native) native.oninput = () => applyColor(native.value);
              const hex = field.querySelector('[data-gz-hex]');
              if (hex) {
                hex.oninput = () => { if (normalizeHex(hex.value)) applyColor(hex.value); };
                hex.onchange = () => { if (!normalizeHex(hex.value)) { hex.value = l[key] === 'brand' ? brandColor() : (l[key] || '#ffffff'); } };
              }
              field.querySelectorAll('[data-gz-swatch]').forEach((b) => {
                b.onclick = () => applyColor(b.dataset.gzSwatch);
              });
              field.querySelector('[data-gz-brand]')?.addEventListener('click', () => applyColor('brand', true));
            });
            box.querySelectorAll('[data-align]').forEach((b) => (b.onclick = () => {
              const k = b.dataset.align;
              const m = 96; // 5% de 1920
              if (k === 'left') l.x = m;
              else if (k === 'center') l.x = Math.round((1920 - l.w) / 2);
              else if (k === 'right') l.x = 1920 - m - l.w;
              else if (k === 'top') l.y = 54; // 5% de 1080
              else if (k === 'middle') l.y = Math.round((1080 - l.h) / 2);
              else if (k === 'bottom') l.y = 1080 - 54 - l.h;
              snapNow();
              drawIt();
            }));
            box.querySelector('#gz-dup-layer').onclick = () => {
              flushSnap();
              const copy = clone(l);
              copy.id = uid();
              copy.x += 20;
              copy.y += 20;
              base.layers.splice(selected + 1, 0, copy);
              selected++;
              snapNow();
              drawIt();
            };
            box.querySelector('#gz-del').onclick = () => {
              flushSnap();
              base.layers.splice(selected, 1);
              selected = Math.max(0, selected - 1);
              snapNow();
              drawIt();
            };
          };
          const renderRules = () => {
            const box = m.querySelector('#gz-rules');
            if (!box) return;
            if (!base.rules.length) {
              box.innerHTML = '<p class="hint">Nenhuma regra. Ex.: ocultar a etiqueta quando o campo estiver vazio ou reduzir a fonte se o nome for longo.</p>';
              return;
            }
            const opLabels = { empty: 'está vazio', notempty: 'está preenchido', equals: 'é igual a', notequals: 'é diferente de', contains: 'contém', notcontains: 'não contém', startswith: 'começa com', endswith: 'termina com', 'length>': 'tem mais de', 'length<': 'tem menos de', gt: 'número maior que', lt: 'número menor que' };
            const needsValue = (op) => !['empty', 'notempty'].includes(op);
            const numericOp = (op) => ['length>', 'length<', 'gt', 'lt'].includes(op);
            const actionLabels = { hide: 'ocultar', show: 'mostrar', size: 'ajustar fonte', color: 'mudar cor do texto', bg: 'mudar fundo', opacity: 'ajustar opacidade' };
            const fields = [...new Set([...BASE_FIELDS, ...extraKeysFor(base), ...base.layers.map((l) => l.key).filter(Boolean)])];
            const targets = base.layers;
            box.innerHTML = base.rules.map((r) => {
              const cond = r.cond ?? r.value ?? '';
              const act = r.act ?? r.value ?? '';
              const op = r.op || 'empty';
              const action = r.action || 'hide';
              const condInput = needsValue(op) ? `<input class="input" data-rk="cond" type="${numericOp(op) ? 'number' : 'text'}" value="${escAttr(cond)}" ${numericOp(op) ? 'min="1" max="200"' : ''} placeholder="${numericOp(op) ? '20' : 'valor'}">` : '';
              const actInput = action === 'size' ? `<input class="input" data-rk="act" type="number" min="12" max="160" value="${Number(act) || 32}" placeholder="tamanho">`
                : (action === 'color' || action === 'bg') ? `<input class="input gz-rule-color" data-rk="act" type="color" value="${normalizeHex(act) || '#ffffff'}">`
                : action === 'opacity' ? `<input class="input" data-rk="act" type="number" min="0" max="1" step="0.1" value="${Number(act) || 1}">` : '';
              const target = base.layers.find((l) => l.id === r.layer);
              return `<div class="gz-rule" data-rule="${r.id}">
                <div class="gz-rule-head"><span>SE</span><button class="btn ghost sm" data-rdup title="Duplicar regra">⧉</button><button class="btn ghost sm" data-rdel title="Excluir regra">✕</button></div>
                <div class="row" style="gap:4px"><select class="input" data-rk="field">${fields.map((k) => `<option value="${escAttr(k)}" ${r.field === k ? 'selected' : ''}>${esc(fieldLabel(k))}</option>`).join('')}</select><select class="input" data-rk="op">${Object.entries(opLabels).map(([k, label]) => `<option value="${k}" ${op === k ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
                ${condInput ? `<div class="row" style="gap:4px">${condInput}</div>` : ''}
                <div class="row" style="gap:4px"><select class="input" data-rk="action">${Object.entries(actionLabels).map(([k, label]) => `<option value="${k}" ${action === k ? 'selected' : ''}>${label}</option>`).join('')}</select><select class="input" data-rk="layer">${targets.map((l) => `<option value="${l.id}" ${r.layer === l.id ? 'selected' : ''}>${esc(layerName(l))}</option>`).join('')}</select></div>
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
                    if (k === 'op' && !needsValue(el.value)) { delete r.cond; }
                    if (k === 'action') {
                      if (el.value === 'size') r.act = Number(r.act) || 32;
                      else if (el.value === 'color') r.act = r.act || '#ffffff';
                      else if (el.value === 'bg') r.act = r.act || '#7c5cff';
                      else if (el.value === 'opacity') r.act = Number(r.act) || 1;
                    }
                  }
                  snap();
                  drawIt();
                  renderRules();
                };
              }
              row.querySelector('[data-rdel]').onclick = () => {
                flushSnap();
                base.rules = base.rules.filter((x) => x.id !== r.id);
                snapNow();
                drawIt();
                renderRules();
              };
              row.querySelector('[data-rdup]').onclick = () => {
                flushSnap();
                const copy = { ...r, id: uid(), x: undefined };
                base.rules.splice(base.rules.indexOf(r) + 1, 0, copy);
                snapNow();
                drawIt();
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
            drawIt();
            renderRules();
          };
          m.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
            const type = b.dataset.add;
            const l = clone(LAYER_DEFAULTS[type]);
            l.id = uid();
            if (type === 'text') l.key = base.layers.some((x) => x.key === 'name') ? 'role' : 'name';
            if (type === 'text' && base.layers.some((x) => x.key === 'role')) l.key = 'headline';
            flushSnap();
            l.y = Math.min(980, 760 + base.layers.length * 50);
            base.layers.push(l);
            selected = base.layers.length - 1;
            snapNow();
            drawIt();
          }));
          // arrastar no canvas
          let drag = null;
          cv.addEventListener('pointerdown', (e) => {
            flushSnap();
            const r = cv.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * 1920;
            const y = ((e.clientY - r.top) / r.height) * 1080;
            const tol = 18;
            const pts = (l) => ({
              nw: [l.x, l.y], n: [l.x + l.w / 2, l.y], ne: [l.x + l.w, l.y],
              e: [l.x + l.w, l.y + l.h / 2], se: [l.x + l.w, l.y + l.h],
              s: [l.x + l.w / 2, l.y + l.h], sw: [l.x, l.y + l.h], w: [l.x, l.y + l.h / 2],
            });
            const cur = base.layers[selected];
            if (cur && !cur.lock) {
              const hit = Object.entries(pts(cur)).find(([, [hx, hy]]) => Math.abs(x - hx) <= tol && Math.abs(y - hy) <= tol);
              if (hit) {
                drag = { mode: 'resize', i: selected, dir: hit[0], x0: x, y0: y, box: { x: cur.x, y: cur.y, w: cur.w, h: cur.h } };
                cv.setPointerCapture?.(e.pointerId);
                return;
              }
            }
            for (let i = base.layers.length - 1; i >= 0; i--) {
              const l = base.layers[i];
              if (!l.lock && x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) {
                selected = i;
                drag = { mode: 'move', i, dx: x - l.x, dy: y - l.y };
                cv.setPointerCapture?.(e.pointerId);
                drawIt();
                break;
              }
            }
          });
          cv.addEventListener('pointermove', (e) => {
            const r = cv.getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * 1920;
            const y = ((e.clientY - r.top) / r.height) * 1080;
            if (!drag) {
              // cursor de redimensionamento nas alças
              const l = base.layers[selected];
              if (!l) { cv.style.cursor = 'default'; return; }
              const pts = { nw: [l.x, l.y], n: [l.x + l.w / 2, l.y], ne: [l.x + l.w, l.y], e: [l.x + l.w, l.y + l.h / 2], se: [l.x + l.w, l.y + l.h], s: [l.x + l.w / 2, l.y + l.h], sw: [l.x, l.y + l.h], w: [l.x, l.y + l.h / 2] };
              const hit = Object.entries(pts).find(([, [hx, hy]]) => Math.abs(x - hx) <= 18 && Math.abs(y - hy) <= 18);
              cv.style.cursor = hit ? (hit[0].includes('n') || hit[0].includes('s') ? 'ns-resize' : 'ew-resize') : 'move';
              if (hit && hit[0].length === 2) cv.style.cursor = 'nwse-resize';
              return;
            }
            const snap10 = (v) => (e.shiftKey ? Math.round(v) : Math.round(v / 10) * 10);
            if (drag.mode === 'move') {
              const l = base.layers[drag.i];
              l.x = snap10(x - drag.dx);
              l.y = snap10(y - drag.dy);
            } else {
              const l = base.layers[drag.i];
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
            drawIt();
          });
          cv.addEventListener('pointerup', () => { if (drag) snapNow(); drag = null; cv.style.cursor = 'default'; });
          m.querySelector('#gz-cancel').onclick = () => close(null);
          m.querySelector('#gz-dup').onclick = () => {
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
          m.querySelector('#gz-save').onclick = () => {
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
            render();
            toast(`Template “${base.name}” salvo`, 'ok');
          };
          drawIt();
          snapNow();
          m.querySelector('#gz-undo').onclick = undo;
          m.querySelector('#gz-redo').onclick = redo;
          m.addEventListener('keydown', (e) => {
            const tag = (e.target?.tagName || '').toUpperCase();
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
            else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
              const l = base.layers[selected];
              if (!l) return;
              e.preventDefault();
              flushSnap();
              const copy = clone(l);
              copy.id = uid();
              copy.x += 20;
              copy.y += 20;
              base.layers.splice(selected + 1, 0, copy);
              selected++;
              snapNow();
              drawIt();
            } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
              const l = base.layers[selected];
              if (!l || l.lock) return;
              e.preventDefault();
              const step = e.shiftKey ? 10 : 1;
              if (e.key === 'ArrowLeft') l.x -= step;
              if (e.key === 'ArrowRight') l.x += step;
              if (e.key === 'ArrowUp') l.y -= step;
              if (e.key === 'ArrowDown') l.y += step;
              drawIt();
              snap();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
              if (base.layers[selected]) {
                e.preventDefault();
                base.layers.splice(selected, 1);
                selected = Math.max(0, selected - 1);
                snapNow();
                drawIt();
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
