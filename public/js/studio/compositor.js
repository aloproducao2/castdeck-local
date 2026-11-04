// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Compositor de cena em canvas – o "programa" que vai ao ar.
// Layouts animados, tarjas de nome, banners (lower thirds), letreiro (ticker), logo, overlay e fundo.

import { hexToRgb, rgb, mix, luminance, roundRectPath } from './gfx.js';
import { drawBanner as drawBannerFx, drawSocial } from './overlays.js';
import { WidgetLayer } from './widgets-draw.js';
export const LAYOUTS = [
  { id: 'solo', label: 'Solo', icon: '<rect x="2" y="2" width="44" height="24" rx="2"/>' },
  { id: 'grid', label: 'Grade', icon: '<rect x="2" y="2" width="21" height="11" rx="2"/><rect x="25" y="2" width="21" height="11" rx="2"/><rect x="2" y="15" width="21" height="11" rx="2"/><rect x="25" y="15" width="21" height="11" rx="2"/>' },
  { id: 'leader', label: 'Destaque', icon: '<rect x="8" y="2" width="32" height="17" rx="2"/><rect x="10" y="21" width="8" height="5" rx="1"/><rect x="20" y="21" width="8" height="5" rx="1"/><rect x="30" y="21" width="8" height="5" rx="1"/>' },
  { id: 'sidebar', label: 'Lateral', icon: '<rect x="2" y="4" width="33" height="20" rx="2"/><rect x="37" y="4" width="9" height="6" rx="1"/><rect x="37" y="11" width="9" height="6" rx="1"/><rect x="37" y="18" width="9" height="6" rx="1"/>' },
  { id: 'pip', label: 'PiP', icon: '<rect x="2" y="2" width="44" height="24" rx="2" opacity=".55"/><rect x="32" y="16" width="12" height="8" rx="1.5"/>' },
  { id: 'split', label: 'Lado a lado', icon: '<rect x="2" y="5" width="21" height="18" rx="2"/><rect x="25" y="5" width="21" height="18" rx="2"/>' },
];

export const DEFAULT_BRAND = {
  color: '#7c5cff',
  background: { type: 'image', value: '/assets/backgrounds/aurora.jpg' },
  logo: null, // dataURL
  overlay: null, // legado: dataURL único (PNG transparente 16:9)
  overlays: [], // vários PNGs/WebPs empilhados, na ordem
  showNames: true,
  // Auto play de vídeos ao entrar no PGM (Mesa) ou ao colocar no palco (Estúdio).
  autoPlayMedia: true,
  nameStyle: 'bubble', // bubble | block | minimal
  corner: 14,
  padding: 'normal', // tight | normal | wide
  // Camadas de overlays em relação ao DSK: global, escolhido pelo operador.
  // false = comentários/enquetes/banner atrás do DSK; true = acima do DSK 1/2.
  overlayLayers: { aboveDsk: false },
};

const num = (v, min, max, fallback) => (Number.isFinite(+v) ? Math.max(min, Math.min(max, +v)) : fallback);
// Ajuste de enquadramento por fonte: fit cover/contain, zoom, pan e corte nas quatro bordas.
// O objeto fica em s.adjust e é salvo em brand.sourceAdjust pelo estúdio.
export function normalizeAdjust(a = {}) {
  const crop = a.crop || {};
  let l = num(crop.l, 0, 0.45, 0), r = num(crop.r, 0, 0.45, 0);
  let t = num(crop.t, 0, 0.45, 0), b = num(crop.b, 0, 0.45, 0);
  // nunca deixa o corte atravessar a fonte inteira
  if (l + r > 0.9) { const k = 0.9 / (l + r); l *= k; r *= k; }
  if (t + b > 0.9) { const k = 0.9 / (t + b); t *= k; b *= k; }
  return {
    fit: a.fit === 'contain' ? 'contain' : 'cover',
    zoom: num(a.zoom, 1, 3, 1),
    x: num(a.x, -1, 1, 0),
    y: num(a.y, -1, 1, 0),
    crop: { l, r, t, b },
  };
}

// Desenha uma fonte já recortada/posicionada dentro de um tile. Compartilhado com o modal de ajustes.
export function drawFramed(ctx, img, x, y, w, h, sw, sh, adjust) {
  if (!sw || !sh || !w || !h) return;
  const a = normalizeAdjust(adjust);
  const sx = sw * a.crop.l;
  const sy = sh * a.crop.t;
  const cw = Math.max(1, sw * (1 - a.crop.l - a.crop.r));
  const ch = Math.max(1, sh * (1 - a.crop.t - a.crop.b));
  const contain = a.fit === 'contain';
  const base = contain ? Math.min(w / cw, h / ch) : Math.max(w / cw, h / ch);
  const sc = base * a.zoom;
  const dw = cw * sc;
  const dh = ch * sc;
  if (contain) {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, h);
  }
  const dx = x + (w - dw) / 2 + a.x * (w / 2);
  const dy = y + (h - dh) / 2 + a.y * (h / 2);
  ctx.drawImage(img, sx, sy, cw, ch, dx, dy, dw, dh);
}


// No vertical (720 px de largura) a interface é desenhada numa faixa 16:9 virtual ampliada, para GC e textos ficarem legíveis no celular
const VERT_UI = 1.85;

// ---------- algoritmos de layout ----------
function fitGrid(n, W, H, gap, aspect) {
  let best = { cols: 1, rows: n, tw: 0, th: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    let tw = (W - gap * (cols - 1)) / cols;
    let th = tw / aspect;
    if (th * rows + gap * (rows - 1) > H) {
      th = (H - gap * (rows - 1)) / rows;
      tw = th * aspect;
    }
    if (tw > best.tw) best = { cols, rows, tw, th };
  }
  return best;
}

function gridRects(ids, area, gap, aspect = 16 / 9) {
  const out = new Map();
  const n = ids.length;
  if (!n) return out;
  const { cols, rows, tw, th } = fitGrid(n, area.w, area.h, gap, aspect);
  const totalH = rows * th + (rows - 1) * gap;
  let y = area.y + (area.h - totalH) / 2;
  for (let r = 0; r < rows; r++) {
    const rowIds = ids.slice(r * cols, r * cols + cols);
    const rowW = rowIds.length * tw + (rowIds.length - 1) * gap;
    let x = area.x + (area.w - rowW) / 2;
    for (const id of rowIds) {
      out.set(id, { x, y, w: tw, h: th });
      x += tw + gap;
    }
    y += th + gap;
  }
  return out;
}

function fitAspect(area, aspect = 16 / 9) {
  let w = area.w;
  let h = w / aspect;
  if (h > area.h) {
    h = area.h;
    w = h * aspect;
  }
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
}

export function computeLayout(layout, items, W, H, opts = {}) {
  const pad = { tight: 0.02, normal: 0.045, wide: 0.08 }[opts.padding || 'normal'];
  const m = H * pad;
  const g = H * 0.018;
  const bottom = opts.reserveBottom || 0;
  // banner no ar: distância do rodapé até o topo do banner (bannerBottom) ou do topo até a base dele (bannerTop).
  // As imagens são reposicionadas para não ficarem embaixo dele.
  const bb = opts.bannerBottom || 0;
  const bt = opts.bannerTop || 0;
  // enquete/QR no ar na lateral: coluna reservada (as imagens ficam do outro lado, sem ficar embaixo do widget)
  const rl = opts.reserveLeft ? opts.reserveLeft + g : 0;
  const rr = opts.reserveRight ? opts.reserveRight + g : 0;
  const resB = Math.max(bottom, bb ? bb - m + g : 0);
  const resT = bt ? Math.max(0, bt - m + g) : 0;
  const ax = Math.max(m, rl);
  const area = { x: ax, y: m + resT, w: Math.max(W * 0.3, W - ax - Math.max(m, rr)), h: Math.max(H * 0.3, H - 2 * m - resB - resT) };
  // faixa livre para os layouts de tela cheia com várias pessoas (empilhado/destaque do vertical)
  const band = { y: bt ? bt + g * 0.5 : 0, y1: bb ? H - bb - g * 0.5 : H - bottom };
  if (band.y1 - band.y < H * 0.4) Object.assign(band, { y: 0, y1: H - bottom });
  const rects = new Map();
  const ids = items.map((i) => i.id);
  if (!ids.length) return rects;

  // o primeiro do palco é o item principal (a ordem é definida pelo usuário arrastando)
  const mainId = ids[0];
  const others = ids.filter((id) => id !== mainId);
  const full = { x: rl, y: 0, w: Math.max(W * 0.4, W - rl - rr), h: H - bottom, full: true };

  // layout personalizado: o espaço n recebe o n-ésimo item do palco (excedentes ficam ocultos)
  const custom = String(layout).startsWith('c-') ? (opts.custom || []).find((c) => c.id === layout) : null;
  if (custom) {
    const H2 = H - bottom;
    ids.slice(0, custom.slots.length).forEach((id, i) => {
      const s = custom.slots[i];
      const covers = s.x <= 0.005 && s.y <= 0.005 && s.w >= 0.99 && s.h >= 0.99;
      rects.set(id, covers ? full : { x: s.x * W, y: s.y * H2, w: s.w * W, h: s.h * H2, pip: s.w * s.h < 0.2 && s.w < 0.5 });
    });
    return rects;
  }

  switch (layout) {
    // ---- modo vertical (9:16) ----
    case 'auto':
    case 'vfill':
      if (layout === 'auto' && ids.length > 1) return computeLayout(ids.length === 2 ? 'vstack' : 'vlead', items, W, H, opts);
      rects.set(mainId, full);
      break;
    case 'vstack': {
      const list = ids.slice(0, 4);
      const gg = H * 0.004;
      const hh = (band.y1 - band.y - gg * (list.length - 1)) / list.length;
      list.forEach((id, i) => rects.set(id, { x: 0, y: band.y + i * (hh + gg), w: W, h: hh, full: true }));
      break;
    }
    case 'vlead': {
      if (!others.length) {
        rects.set(mainId, full);
        break;
      }
      const mh = Math.min(H * 0.6, (band.y1 - band.y) * 0.64);
      rects.set(mainId, { x: 0, y: band.y, w: W, h: mh, full: true });
      const rest = others.slice(0, 3);
      const gg = W * 0.02;
      const tw = (W - gg * (rest.length + 1)) / rest.length;
      const free = band.y1 - band.y - mh - gg * 2;
      const th = Math.min(tw * 1.1, free);
      rest.forEach((id, i) => rects.set(id, { x: gg + i * (tw + gg), y: band.y + mh + gg + (free - th) / 2, w: tw, h: th }));
      break;
    }
    case 'vfit':
      return gridRects(ids, area, g);
    case 'solo':
      rects.set(mainId, full);
      break;
    case 'grid':
      return gridRects(ids, area, g);
    case 'split': {
      const two = [mainId, ...others].slice(0, 2);
      if (two.length === 1) return gridRects(two, area, g);
      const half = { ...area, w: (area.w - g) / 2 };
      rects.set(two[0], { ...half });
      rects.set(two[1], { ...half, x: area.x + half.w + g });
      // demais ficam ocultos
      break;
    }
    case 'leader': {
      if (!others.length) return gridRects([mainId], area, g);
      const mainH = (area.h - g) * 0.76;
      rects.set(mainId, fitAspect({ x: area.x, y: area.y, w: area.w, h: mainH }));
      const strip = { x: area.x, y: area.y + mainH + g, w: area.w, h: area.h - mainH - g };
      const tw = Math.min(strip.h * (16 / 9), (strip.w - g * (others.length - 1)) / others.length);
      const th = tw / (16 / 9);
      const rowW = others.length * tw + (others.length - 1) * g;
      let x = strip.x + (strip.w - rowW) / 2;
      for (const id of others) {
        rects.set(id, { x, y: strip.y + (strip.h - th) / 2, w: tw, h: th });
        x += tw + g;
      }
      break;
    }
    case 'sidebar': {
      if (!others.length) return gridRects([mainId], area, g);
      const colW = Math.min(area.w * 0.24, ((area.h - g * (others.length - 1)) / others.length) * (16 / 9));
      const mainArea = { x: area.x, y: area.y, w: area.w - colW - g, h: area.h };
      const mainRect = fitAspect(mainArea);
      rects.set(mainId, mainRect);
      const th = colW / (16 / 9);
      const colH = others.length * th + (others.length - 1) * g;
      let y = area.y + (area.h - colH) / 2;
      const x = mainRect.x + mainRect.w + g;
      for (const id of others) {
        rects.set(id, { x, y, w: colW, h: th });
        y += th + g;
      }
      break;
    }
    case 'pip': {
      rects.set(mainId, full);
      const tw = W * 0.22;
      const th = tw / (16 / 9);
      let x = W - Math.max(m, rr) - tw;
      const py = (bb ? H - bb - g : H - bottom - m) - th; // miniaturas sobem para cima do banner
      for (const id of others.slice(0, 3)) {
        rects.set(id, { x, y: py, w: tw, h: th, pip: true });
        x -= tw + g;
      }
      break;
    }
    default:
      return gridRects(ids, area, g);
  }
  return rects;
}

// ---------- Compositor ----------
export class Compositor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.sources = new Map(); // id -> { id, kind, label, el, camOff }
    // Último quadro bom por fonte de mídia: durante um seek o <video> fica sem `readyState`,
    // e o desenho de iniciais piscava. Guardamos um frame recente para segurar a imagem.
    this._frameCache = new Map(); // id -> canvas
    this._frameCacheAt = new Map(); // id -> performance.now()
    this.stage = []; // ids
    this.layout = 'grid';
    this.brand = { ...DEFAULT_BRAND };
    this.images = new Map(); // url -> HTMLImageElement
    this.bgVideos = new Map(); // sourceId -> HTMLVideoElement dedicado (mudo/loop) para fundo em vídeo
    this.anim = new Map(); // id -> { x,y,w,h,a }
    this.banner = null; // { title, subtitle, t0, hiding, t1 }
    this.ticker = null; // { text, offset }
    this.solo = null; // id exibido sozinho em tela cheia
    // Mesa de corte: fonte no ar em tela cheia, acima do palco/solo (não precisa estar no palco)
    this.take = null;
    this.snap = false; // próximo quadro vai direto às posições finais (corte seco, sem animação)
    this.cutSeq = 0; // muda a cada transição: as visões derivadas (retorno, vertical) também cortam seco
    this.fade = null; // { from: Compositor da cena anterior, t0, ms, manual, p } dissolve em andamento
    this.keepLayer = false; // guarda a camada de imagens de cada quadro (usado pela cena anterior durante o dissolve)
    this.ftb = null; // { on, t0, ms } fade to black (FTB) da mesa de corte
    this.replayWipe = null; // { t0, ms, kind } transição de replay desenhada no PGM (não só no console)
    this.varOverlay = null; // { on, lines, stamp } linhas/carimbo do VAR no PGM
    this.cc = null; // legenda ao vivo { show, text, partial, t, style } (objeto compartilhado com o estúdio)
    this.hover = null; // id destacado durante o arrasto
    this.social = { featured: null, feed: [], opts: { pos: 'bottom', feedOn: false, feedMax: 5, feedTtl: 20, avatars: true } }; // chat de redes sociais no ar
    this.socialImgs = new Map();
    this._socialH = 0; // altura do social no quadro anterior (usada quando ele é desenhado acima do DSK)
    this.wg = new WidgetLayer(); // widgets no ar: QR, enquete, placar
    this._order = [];
    this.last = performance.now();
    // celulares e webviews móveis não suportam Gaussian blur pesado (shadowBlur em 1080p a 30fps)
    this.lowPower = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod|Mobile|Silk|CastDeckAndroid/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));
    this.setSize(1280, 720);
  }

  setSize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.W = w;
    this.H = h;
  }

  image(url) {
    if (!url) return null;
    let img = this.images.get(url);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.src = url;
      this.images.set(url, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  setBrand(brand) {
    this.brand = {
      ...DEFAULT_BRAND,
      ...brand,
      overlayLayers: { ...DEFAULT_BRAND.overlayLayers, ...(brand?.overlayLayers || {}) },
    };
  }

  // O vídeo de fundo usa um elemento próprio, mudo e em loop, para não interferir no player da playlist.
  bgVideo(id) {
    const s = this.sources.get(id);
    const src = s?.url || s?.el?.currentSrc || s?.el?.src;
    if (!src) return null;
    let v = this.bgVideos.get(id);
    if (!v) {
      v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      v.src = src;
      v.play().catch(() => {});
      this.bgVideos.set(id, v);
    } else if (v.paused) {
      v.play().catch(() => {});
    }
    return v.readyState >= 2 && v.videoWidth ? v : null;
  }

  upsertSource(id, patch) {
    const s = this.sources.get(id) || { id, kind: 'camera', label: '', el: null, camOff: false };
    const prevEl = s.el;
    Object.assign(s, patch);
    // Trocou o elemento (outro vídeo na mesma fonte): o cache antigo não pode aparecer no seek.
    if (patch.el && patch.el !== prevEl) {
      this._frameCache.delete(id);
      this._frameCacheAt.delete(id);
    }
    this.sources.set(id, s);
  }

  removeSource(id) {
    const v = this.bgVideos.get(id);
    if (v) {
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch {}
      this.bgVideos.delete(id);
    }
    this.sources.delete(id);
    this.stage = this.stage.filter((x) => x !== id);
    this._frameCache.delete(id);
    this._frameCacheAt.delete(id);
  }

  setStage(ids) {
    this.stage = ids.filter((id) => this.sources.has(id));
  }

  // Troca de cena da mesa de corte. 'cut' = seco; 'mix' = dissolve de `ms`; 'manual' = dissolve guiado pela T-bar
  // (setMix). Chame ANTES de trocar take/stage: a cena atual é copiada para um segundo compositor que continua
  // renderizando ao vivo durante a transição (como no vMix: as duas fontes se movem, nada fica congelado).
  // Logo, overlay, banners e widgets são desenhados depois, então não piscam (como as camadas DSK do vMix).
  transition(kind = 'cut', ms = 500) {
    this.snap = true;
    this.cutSeq++;
    if (kind === 'manual' || (kind === 'mix' && ms > 0)) {
      this.fade = { from: this.fromView(), t0: performance.now(), ms: ms || 500, manual: kind === 'manual', p: 0 };
    } else this.fade = null;
  }
  // T-bar: posição 0..1 do dissolve manual
  setMix(p) {
    if (this.fade) this.fade.p = Math.max(0, Math.min(1, p));
  }
  // T-bar solta no meio do caminho: termina sozinho a partir de onde parou
  resumeMix(ms) {
    const f = this.fade;
    if (!f || !f.manual) return;
    f.manual = false;
    f.linear = true;
    f.ms = ms;
    f.t0 = performance.now() - f.p * ms;
  }
  endMix() {
    this.fade = null;
  }
  // 0..1 do dissolve em andamento (null = nenhum), para a T-bar acompanhar o AUTO
  mixProgress(now = performance.now()) {
    const f = this.fade;
    if (!f) return null;
    return f.manual ? f.p : Math.min(1, (now - f.t0) / f.ms);
  }
  // cópia da cena atual que segue viva durante o dissolve (só a camada de imagens dela é usada)
  fromView() {
    const fv = this._fv || (this._fv = new Compositor(document.createElement('canvas')));
    if (fv.W !== this.W || fv.H !== this.H) fv.setSize(this.W, this.H);
    fv.sources = this.sources;
    fv.images = this.images;
    fv.socialImgs = this.socialImgs;
    fv.keepLayer = true;
    fv.layout = this.layout;
    fv.stage = [...this.stage];
    fv.solo = this.solo;
    fv.take = this.take;
    fv.fade = null;
    fv.ftb = null;
    fv.vertical = this.vertical;
    // mesmas posições e áreas reservadas: o 1º quadro do dissolve é idêntico ao programa (sem salto)
    fv.anim = new Map([...this.anim].map(([k, a]) => [k, { ...a }]));
    fv._bz = this._bz;
    fv._wz = this._wz;
    fv.last = this.last;
    return fv;
  }
  // FTB: escurece o programa inteiro (gráficos inclusive) e volta
  setBlack(on, ms = 700) {
    const cur = this.blackLevel();
    this.ftb = { on: !!on, ms, t0: performance.now() - (on ? cur : 1 - cur) * ms };
  }
  blackLevel(now = performance.now()) {
    const f = this.ftb;
    if (!f) return 0;
    const p = Math.min(1, (now - f.t0) / f.ms);
    return f.on ? p : 1 - p;
  }

  showBanner(b) {
    if (!b) return this.hideBanner();
    this.banner = { ...b, t0: performance.now(), hiding: false };
  }
  hideBanner() {
    if (this.banner && !this.banner.hiding) {
      this.banner.hiding = true;
      this.banner.t1 = performance.now();
    }
  }
  // ---- chat de redes sociais (Social Stream Ninja) ----
  setSocialOpts(o) {
    Object.assign(this.social.opts, o);
  }
  showFeatured(msg) {
    this.social.featured = msg ? { msg, t0: performance.now(), hiding: false } : null;
  }
  hideFeatured() {
    const f = this.social.featured;
    if (f && !f.hiding) {
      f.hiding = true;
      f.t1 = performance.now();
    }
  }
  pushFeed(msg) {
    const feed = this.social.feed;
    feed.push({ msg, t0: performance.now() });
    while (feed.length > 12) feed.shift();
  }
  clearFeed() {
    this.social.feed = [];
  }
  // imagens externas passam pelo proxy local (mesma origem) para não "contaminar" o canvas
  socialImage(url) {
    if (!url) return null;
    const src = /^(data:|blob:|\/)/.test(url) ? url : `/api/img-proxy?u=${encodeURIComponent(url)}`;
    let e = this.socialImgs.get(src);
    if (!e) {
      const img = new Image();
      e = { img, ok: false, failed: false };
      img.onload = () => (e.ok = true);
      img.onerror = () => (e.failed = true);
      img.src = src;
      this.socialImgs.set(src, e);
      if (this.socialImgs.size > 400) this.socialImgs.delete(this.socialImgs.keys().next().value);
    }
    return e.ok ? e.img : null;
  }
  setTicker(text, opts = {}) {
    if (!text) this.ticker = null;
    else if (!this.ticker) this.ticker = { text, offset: 0, label: opts.label || '', speed: opts.speed || 0.09 };
    else Object.assign(this.ticker, { text, label: opts.label || '', speed: opts.speed || 0.09 }); // mantém a posição da rolagem
  }

  // ---------- render ----------
  render() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const { ctx, W, H } = this;
    const brand = this.brand;
    const color = hexToRgb(brand.color);
    const uH = this.uh(); // unidade de interface: em 9:16 usa a escala do 16:9
    const tickerH = this.ticker ? Math.round(uH * 0.062) : 0;

    // fundo
    const bg = brand.background || {};
    const bgVideo = bg.type === 'video' ? this.bgVideo(bg.value) : null;
    const bgImg = bg.type === 'image' ? this.image(bg.value) : null;
    if (bgVideo) {
      this.drawCover(bgVideo, 0, 0, W, H, bgVideo.videoWidth, bgVideo.videoHeight);
    } else if (bgImg) {
      this.drawCover(bgImg, 0, 0, W, H, bgImg.naturalWidth, bgImg.naturalHeight);
    } else if (bg.type === 'color') {
      ctx.fillStyle = bg.value || '#111';
      ctx.fillRect(0, 0, W, H);
    } else {
      if (!this._bgGrad || this._bgW !== W || this._bgH !== H || this._bgColor !== brand.color) {
        this._bgW = W;
        this._bgH = H;
        this._bgColor = brand.color;
        const gr = ctx.createLinearGradient(0, 0, W, H);
        gr.addColorStop(0, rgb(mix(color, [8, 8, 16], 0.78)));
        gr.addColorStop(1, rgb(mix(color, [4, 4, 10], 0.9)));
        this._bgGrad = gr;
      }
      ctx.fillStyle = this._bgGrad;
      ctx.fillRect(0, 0, W, H);
    }

    // layout + animação (interpolação exponencial suave)
    const takeItem = this.take ? this.sources.get(this.take) : null;
    const soloItem = takeItem || (this.solo && this.stage.includes(this.solo) ? this.sources.get(this.solo) : null);
    const items = soloItem ? [soloItem] : this.stage.map((id) => this.sources.get(id)).filter(Boolean);
    // área do banner medida no quadro anterior (some assim que ele começa a sair, e as imagens voltam ao tamanho cheio)
    const bz = this.banner && !this.banner.hiding ? this._bz : null;
    let bannerBottom = bz && !bz.top ? H - bz.y0 : 0;
    // no vertical o letreiro fica acima da zona de interface dos apps: também não deve cobrir quem está empilhado
    if (this.vertical && tickerH) bannerBottom = Math.max(bannerBottom, H - (Math.round(H - uH - H * 0.17) + uH - tickerH));
    let bannerTop = bz && bz.top ? bz.y1 : 0;
    // enquete/QR no ar (área medida no quadro anterior). Centro/vertical reservam faixa em cima/embaixo.
    // Na lateral há duas opções — coluna ao lado ou faixa — e fica a que deixa as imagens maiores sem cobri-las.
    const wz = this._wz || [];
    const col = { reserveLeft: 0, reserveRight: 0, bannerTop, bannerBottom };
    const band = { reserveLeft: 0, reserveRight: 0, bannerTop, bannerBottom };
    for (const z of wz) {
      const asBand = this.vertical || z.side === 'c';
      for (const o of asBand ? [col, band] : [band]) {
        if (z.v === 't') o.bannerTop = Math.max(o.bannerTop, z.y + z.h);
        else if (z.v === 'b') o.bannerBottom = Math.max(o.bannerBottom, H - z.y);
      }
      if (!asBand) {
        if (z.side === 'l') col.reserveLeft = Math.max(col.reserveLeft, z.x + z.w);
        else col.reserveRight = Math.max(col.reserveRight, W - z.x);
        if (z.v === 'm') band[z.side === 'l' ? 'reserveLeft' : 'reserveRight'] = Math.max(band[z.side === 'l' ? 'reserveLeft' : 'reserveRight'], z.side === 'l' ? z.x + z.w : W - z.x);
      }
    }
    const lay = (o) => computeLayout(soloItem ? 'solo' : this.layout, items, W, H, { padding: brand.padding, reserveBottom: this.vertical ? 0 : tickerH, ...o, custom: brand.customLayouts });
    let targets = lay(col);
    if (wz.some((z) => !this.vertical && z.side !== 'c')) {
      const score = (rects) => {
        let s = 0;
        for (const r of rects.values()) {
          s += r.w * r.h;
          for (const z of wz) s -= 4 * Math.max(0, Math.min(r.x + r.w, z.x + z.w) - Math.max(r.x, z.x)) * Math.max(0, Math.min(r.y + r.h, z.y + z.h) - Math.max(r.y, z.y));
        }
        return s;
      };
      const alt = lay(band);
      if (score(alt) > score(targets) * 1.04) targets = alt;
    }
    const snap = this.snap;
    this.snap = false;
    const k = snap ? 1 : 1 - Math.exp(-dt * 11);
    for (const [id, t] of targets) {
      let a = this.anim.get(id);
      if (!a) {
        a = snap ? { ...t, a: 1 } : { x: t.x + t.w * 0.05, y: t.y + t.h * 0.05, w: t.w * 0.9, h: t.h * 0.9, a: 0 };
        this.anim.set(id, a);
      }
      a.x += (t.x - a.x) * k;
      a.y += (t.y - a.y) * k;
      a.w += (t.w - a.w) * k;
      a.h += (t.h - a.h) * k;
      a.a += (1 - a.a) * k;
      a.full = t.full;
      a.pip = t.pip;
    }
    for (const [id, a] of this.anim) {
      if (!targets.has(id)) {
        a.a += (0 - a.a) * k * 1.4;
        if (snap || a.a < 0.02 || !this.sources.has(id)) this.anim.delete(id);
      }
    }

    // ordem de desenho: tiles cheios primeiro, PiP por cima
    const order = [...this.anim.entries()].sort((x, y) => (x[1].full ? 0 : x[1].pip ? 2 : 1) - (y[1].full ? 0 : y[1].pip ? 2 : 1));
    this._order = order.map(([id]) => id);
    for (const [id, a] of order) {
      const s = this.sources.get(id);
      if (s) this.drawTile(s, a, color);
    }

    // dissolve da mesa de corte: a cena anterior (renderizada ao vivo) some por cima da cena nova
    if (this.fade) {
      const f = this.fade;
      const p = f.manual ? f.p : (now - f.t0) / f.ms;
      if (!f.manual && p >= 1) this.fade = null;
      else {
        const fv = f.from;
        fv.brand = brand;
        fv.vfx = this.vfx;
        fv.banner = this.banner;
        fv.social = this.social;
        fv.wg = this.wg;
        fv.ticker = this.ticker ? { ...this.ticker } : null;
        fv.render();
        const e = f.manual || f.linear ? p : p * p * (3 - 2 * p); // AUTO suaviza início e fim; T-bar segue a mão
        ctx.globalAlpha = 1 - e;
        ctx.drawImage(fv._layer, 0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }
    if (this.keepLayer) {
      const L = this._layer || (this._layer = document.createElement('canvas'));
      if (L.width !== W || L.height !== H) {
        L.width = W;
        L.height = H;
      }
      L.getContext('2d').drawImage(this.canvas, 0, 0);
    }

    // overlays da marca: vários PNGs/WebPs empilhados, na ordem; mantém o campo antigo por compatibilidade
    const ovs = [...(Array.isArray(brand.overlays) ? brand.overlays : [])];
    if (brand.overlay && !ovs.includes(brand.overlay)) ovs.unshift(brand.overlay);
    for (const src of ovs) {
      if (typeof src !== 'string' || !src) continue;
      const ov = this.image(src);
      if (ov) ctx.drawImage(ov, 0, 0, W, H);
    }

    // logo (posição e tamanho configuráveis)
    const logo = this.image(brand.logo);
    if (logo) this.scoped((brand.logoPos || 'tr').startsWith('t'), () => {
      const H = this.H;
      const m = H * 0.035;
      const maxH = H * ((brand.logoSize || 11) / 100);
      const maxW = W * Math.min(0.5, ((brand.logoSize || 11) / 100) * 1.64);
      const sc = Math.min(maxH / logo.naturalHeight, maxW / logo.naturalWidth);
      const lw = logo.naturalWidth * sc;
      const lh = logo.naturalHeight * sc;
      const pos = brand.logoPos || 'tr';
      const lx = pos.endsWith('l') ? m : W - m - lw;
      const ly = pos.startsWith('t') ? m : H - m - lh;
      ctx.drawImage(logo, lx, ly, lw, lh);
    });

    const front = !!brand.overlayLayers?.aboveDsk;
    const drawWidgets = () => {
      if (!this.wg.active) return;
      if (this.vertical) {
        // no 9:16 os widgets de baixo ficam na faixa inferior (acima da interface dos apps), não no meio da tela
        this.scoped(true, () => this.wg.draw(this, color, now, (v) => v !== 'b'));
        this.scoped(false, () => this.wg.draw(this, color, now, (v) => v === 'b'));
      } else this.wg.draw(this, color, now);
    };
    const drawSocialAndBanner = () => {
      const socialH = this.scoped(this.social.opts.pos === 'top', () => drawSocial(this, color, now, tickerH)) || 0;
      const b = this.banner;
      const fullVertical = this.vertical && b?.style === 'custom' && Array.isArray(b.verticalLayers) && b.verticalLayers.length;
      // Templates com variante 9:16 ocupam a tela vertical inteira; os GCs antigos
      // continuam na faixa 16:9 segura do compositor.
      if (fullVertical) this.drawBanner(color, now, tickerH, socialH);
      else this.scoped(((b && b.pos) || 'bl')[0] === 't', () => this.drawBanner(color, now, tickerH, socialH));
      return socialH;
    };
    const drawCaptionsNow = (socialH) => {
      // Legenda ao vivo: acima do GC/letreiro (desvia deles) e abaixo do DSK/FTB. Posição própria no 16:9 e no 9:16
      // (grade 3×3: em cima/meio/embaixo × esquerda/centro/direita)
      if (!this.cc?.show) return;
      const st = this.cc.style || {};
      const pp = (this.vertical ? st.posV : st.posH) || {};
      const pos = { y: pp.y || (st.pos === 'top' ? 't' : 'b'), x: pp.x || 'c' };
      if (pos.y === 'm') this.drawCaptions(now, tickerH, socialH, pos);
      else this.scoped(pos.y === 't', () => this.drawCaptions(now, tickerH, socialH, pos));
    };

    this._wz = [];
    if (!front) {
      drawWidgets();
      this._socialH = drawSocialAndBanner();
      this.scoped(false, () => this.drawTicker(color, dt, tickerH));
      drawCaptionsNow(this._socialH);
    } else {
      // Acima do DSK: comentários, enquetes e banner vão para depois das camadas DSK.
      // O letreiro/legenda continuam atrás do DSK; usam a altura do social do quadro anterior.
      this.scoped(false, () => this.drawTicker(color, dt, tickerH));
      drawCaptionsNow(this._socialH || 0);
    }

    // DSK 1 e 2 (downstream keyers): por cima de tudo que a cena desenha, independentes do corte/dissolve
    // (a cena anterior do dissolve não tem dsk, então a camada não "pisca" durante a transição)
    if (this.dsk) {
      try {
        this.dsk.draw(this, now);
      } catch (e) {
        console.warn('[dsk]', e);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    if (front) {
      // Grupo acima do DSK, na mesma ordem relativa de antes: widgets/enquete → social → banner.
      drawWidgets();
      this._socialH = drawSocialAndBanner();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Linhas/carimbo do VAR também no PGM (o console envia coordenadas normalizadas)
    if (this.varOverlay?.on) this.drawVarOverlayPgm(now);

    // Tag visual de transmissão "🔴 REPLAY" quando o replay está no ar (via take, solo ou playout)
    if (this.solo === 'replay:out' || this.take === 'replay:out' || this.replayBug) {
      this.drawReplayBug(now);
    }

    // Stinger de entrada/saída desenhado no próprio programa (antes era só CSS no console)
    if (this.replayWipe) this.drawReplayWipe(now);

    // FTB por cima de tudo (no ar some até o letreiro, como no vMix/ATEM)
    const bl = this.blackLevel(now);
    if (bl > 0) {
      ctx.globalAlpha = bl;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    } else if (this.ftb && !this.ftb.on) this.ftb = null;
  }

  // altura da faixa de interface (a do próprio canvas, ou a faixa 16:9 ampliada no vertical)
  uh() {
    return this.vertical ? Math.round(((this.W * 9) / 16) * VERT_UI) : this.H;
  }

  // Legenda ao vivo no vídeo, no estilo "roll-up" da TV: cada frase é quebrada em linhas UMA vez e as linhas novas
  // entram por baixo empurrando as antigas para cima. Antes o texto inteiro era requebrado a cada frase nova e todas
  // as linhas mudavam de lugar (difícil de acompanhar). Sem fade: aparece e some de uma vez, como legenda de TV.
  // Fundo por linha (cada linha com sua faixa), que não "pula" de largura como uma caixa única.
  drawCaptions(now, tickerH, socialH, pos = { y: 'b', x: 'c' }) {
    const cc = this.cc;
    const st = cc.style || {};
    const items = [...(cc.items || (cc.text ? [{ id: 0, text: cc.text }] : []))];
    if (st.live && cc.partial) items.push({ id: 'p', text: cc.partial, partial: true });
    if (!items.length) return;
    // tempo na tela: o suficiente para ler a última frase (mín. 4 s, ~70 ms por letra, máx. 10 s)
    const last = items[items.length - 1];
    const hold = Math.min(10000, Math.max(4000, (last.text || '').length * 70));
    if (now - (cc.t || 0) > hold) return;
    const { ctx, W } = this;
    const H = this.H;
    const top = pos.y === 't';
    // tamanho pela faixa de interface (no 9:16 é a faixa 16:9 ampliada, igual ao GC), mesmo quando fica no meio
    const fs = Math.round(this.uh() * ({ s: 0.042, m: 0.052, l: 0.066 }[st.size] || 0.052));
    const maxW = W * (pos.x === 'c' ? 0.84 : 0.62);
    const maxLines = Math.max(1, Math.min(3, st.lines || 2));
    const upper = !!st.upper;
    ctx.save();
    ctx.font = `${upper ? 800 : 700} ${fs}px Inter, "Segoe UI", sans-serif`;
    // quebra de linha por frase, guardada em cache (cada visão tem tamanho próprio: PGM, vertical, retorno)
    const wrapKey = `${fs}|${maxW}|${upper}`;
    if (this._ccWrapKey !== wrapKey) {
      this._ccWrapKey = wrapKey;
      this._ccWrap = new Map();
    }
    const wrap = (raw) => {
      const text = upper ? raw.toLocaleUpperCase('pt-BR') : raw;
      let got = this._ccWrap.get(text);
      if (got) return got;
      const lines = [];
      let cur = '';
      for (const w of text.split(/\s+/).filter(Boolean)) {
        const tryL = cur ? cur + ' ' + w : w;
        if (ctx.measureText(tryL).width <= maxW - fs || !cur) cur = tryL;
        else {
          lines.push(cur);
          cur = w;
        }
      }
      if (cur) lines.push(cur);
      got = lines.map((l) => ({ l, w: ctx.measureText(l).width }));
      if (this._ccWrap.size > 60) this._ccWrap.clear();
      this._ccWrap.set(text, got);
      return got;
    };
    const all = [];
    for (const it of items) for (const ln of wrap(it.text || '')) all.push({ ...ln, partial: it.partial });
    const lines = all.slice(-maxLines);
    if (!lines.length) {
      ctx.restore();
      return;
    }
    const lh = Math.round(fs * 1.42);
    const padX = Math.round(fs * 0.4);
    const blockH = lines.length * lh;
    const blockW = Math.min(maxW, Math.max(...lines.map((x) => x.w)) + padX * 2);
    const m = H * 0.045;
    // _bz (área do GC) vem em coordenadas absolutas do canvas; o vertical desenha numa faixa deslocada
    const ty = ctx.getTransform().f;
    const bz = this.banner && !this.banner.hiding ? this._bz : null;
    let y;
    if (pos.y === 'm') {
      y = (H - blockH) / 2;
    } else if (top) {
      y = m + (bz && bz.top ? Math.max(0, bz.y1 - ty) : 0) + (this.social?.opts?.pos === 'top' ? socialH : 0);
    } else {
      let bottom = H - m - (this.vertical ? 0 : tickerH) - (this.social?.opts?.pos !== 'top' ? socialH : 0);
      if (bz && !bz.top) bottom = Math.min(bottom, bz.y0 - ty - m * 0.4);
      y = bottom - blockH;
    }
    const mx = W * 0.04;
    const bx = pos.x === 'l' ? mx : pos.x === 'r' ? W - mx - blockW : (W - blockW) / 2;
    const bgc = hexToRgb(/^#[0-9a-f]{6}$/i.test(st.bgColor || '') ? st.bgColor : '#000000');
    const bgA = st.bg ?? 0.72;
    const r = Math.round(fs * 0.18);
    ctx.textAlign = pos.x === 'l' ? 'left' : pos.x === 'r' ? 'right' : 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((ln, i) => {
      const w = Math.min(maxW, ln.w + padX * 2);
      const lx = pos.x === 'l' ? bx : pos.x === 'r' ? bx + blockW - w : (W - w) / 2;
      const ly = y + i * lh;
      if (bgA > 0) {
        ctx.fillStyle = `rgba(${bgc[0]},${bgc[1]},${bgc[2]},${bgA})`;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(lx, ly, w, lh, r);
        else ctx.rect(lx, ly, w, lh);
        ctx.fill();
      }
      // sem fundo, a sombra/contorno garante a leitura sobre qualquer imagem
      if (bgA < 0.5 && !this.lowPower) {
        ctx.shadowColor = 'rgba(0,0,0,.85)';
        ctx.shadowBlur = fs * 0.18;
        ctx.lineWidth = Math.max(2, fs * 0.08);
        ctx.strokeStyle = 'rgba(0,0,0,.8)';
        ctx.strokeText(ln.l, pos.x === 'l' ? lx + padX : pos.x === 'r' ? lx + w - padX : W / 2, ly + lh / 2);
      }
      ctx.fillStyle = st.color || '#fff';
      ctx.globalAlpha = ln.partial ? 0.85 : 1;
      ctx.fillText(ln.l, pos.x === 'l' ? lx + padX : pos.x === 'r' ? lx + w - padX : W / 2, ly + lh / 2);
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    });
    ctx.restore();
  }

  // No modo vertical, textos/GC/letreiro são desenhados numa faixa 16:9 virtual (largura total),
  // na parte de cima ou acima da zona de interface do TikTok/Instagram (embaixo).
  scoped(top, fn) {
    if (!this.vertical) return fn();
    const { ctx, W, H } = this;
    const U = this.uh();
    ctx.save();
    ctx.translate(0, top ? Math.round(H * 0.07) : Math.round(H - U - H * 0.17));
    this.H = U;
    try {
      return fn();
    } finally {
      this.H = H;
      ctx.restore();
    }
  }

  // item mais acima na posição (x, y) em pixels do canvas (para arrastar/trocar no programa)
  hit(x, y) {
    for (let i = this._order.length - 1; i >= 0; i--) {
      const id = this._order[i];
      const a = this.anim.get(id);
      if (a && a.a > 0.3 && this.stage.includes(id) && x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return id;
    }
    return null;
  }

  drawCover(img, x, y, w, h, sw, sh, contain = false, focus = null, adjust = null) {
    if (!sw || !sh) return;
    const { ctx } = this;
    if (adjust) {
      drawFramed(ctx, img, x, y, w, h, sw, sh, adjust);
      return;
    }
    if (contain) {
      const sc = Math.min(w / sw, h / sh);
      const dw = sw * sc;
      const dh = sh * sc;
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      return;
    }
    // no vertical (9:16) abre um pouco o enquadramento para não cortar braços/ombros do intérprete
    const sc = Math.max(w / sw, h / sh) * (focus?.z || 1) * (this.vertical ? 0.9 : 1);
    const cw = Math.min(sw, w / sc);
    const ch = Math.min(sh, h / sc);
    // foco (enquadramento automático): centraliza o recorte no ponto pedido, sem sair da imagem
    const fx = focus ? focus.x * sw : sw / 2;
    const fy = focus ? focus.y * sh : sh / 2;
    const sx = Math.max(0, Math.min(sw - cw, fx - cw / 2));
    const sy = Math.max(0, Math.min(sh - ch, fy - ch / 2));
    ctx.drawImage(img, sx, sy, cw, ch, x, y, w, h);
  }

  // Guarda o último quadro bom de uma mídia (vídeo/replay) para segurar a imagem durante seeks.
  cacheFrame(id, el, vw, vh) {
    const now = performance.now();
    if (now - (this._frameCacheAt.get(id) || 0) < 120) return;
    const scale = Math.min(1, 960 / vw, 540 / vh);
    const w = Math.max(1, Math.round(vw * scale));
    const h = Math.max(1, Math.round(vh * scale));
    let c = this._frameCache.get(id);
    if (!c) {
      c = document.createElement('canvas');
      this._frameCache.set(id, c);
    }
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    try {
      c.getContext('2d').drawImage(el, 0, 0, w, h);
      this._frameCacheAt.set(id, now);
    } catch {}
  }

  drawTile(s, a, color) {
    const { ctx, H } = this;
    const brand = this.brand;
    const r = a.full ? 0 : (brand.corner ?? 14) * (H / 720);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a.a));
    if (!a.full && !this.lowPower) {
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = H * 0.03;
      ctx.shadowOffsetY = H * 0.008;
    }
    roundRectPath(ctx, a.x, a.y, a.w, a.h, r);
    ctx.fillStyle = '#0d0d14';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();

    const el = s.el;
    const isImg = el instanceof HTMLImageElement;
    const vw = isImg ? el?.naturalWidth : el?.videoWidth;
    const vh = isImg ? el?.naturalHeight : el?.videoHeight;
    const ready = el && vw > 0 && (isImg || el.readyState >= 2);
    const seeking = !isImg && !!el?.seeking;
    const adjust = s.adjust ? normalizeAdjust(s.adjust) : null;
    const contain = adjust ? adjust.fit === 'contain' : s.kind === 'screen' || s.kind === 'media' || s.kind === 'image';
    const hasCache = s.kind === 'media' && !s.camOff && this._frameCache.has(s.id);
    // Durante o seek, segura o último quadro bom mesmo que o readyState ainda esteja 2 (superfície pode estar vazia).
    if (ready && !s.camOff && !(seeking && hasCache)) {
      // Guarda o quadro bom continuamente (a 120 ms) para o seek não cair no avatar de iniciais.
      if (s.kind === 'media' && !isImg) this.cacheFrame(s.id, el, vw, vh);
      if (contain) {
        ctx.fillStyle = '#000';
        ctx.fillRect(a.x, a.y, a.w, a.h);
      }
      const fx = !contain && this.vfx && s.kind === 'camera' && !isImg ? this.vfx.frame(s.id, el) : null;
      // Com enquadramento automático ativo, o foco/zoom assume o corte; sem foco, mantém o ajuste manual.
      if (fx) this.drawCover(fx.img, a.x, a.y, a.w, a.h, fx.w, fx.h, false, fx.focus, fx.focus ? null : adjust);
      else this.drawCover(el, a.x, a.y, a.w, a.h, vw, vh, contain, null, adjust);
    } else if (hasCache) {
      // Seek/rebuffer: mostra o último quadro bom em vez do desenho de iniciais.
      const c = this._frameCache.get(s.id);
      if (contain) {
        ctx.fillStyle = '#000';
        ctx.fillRect(a.x, a.y, a.w, a.h);
      }
      this.drawCover(c, a.x, a.y, a.w, a.h, c.width, c.height, contain, null, adjust);
    } else if (s.kind === 'media' && s.camOff && el) {
      this.drawAudioViz(s, a, color);
    } else {
      // avatar com iniciais
      const g = ctx.createLinearGradient(a.x, a.y, a.x + a.w, a.y + a.h);
      g.addColorStop(0, rgb(mix(color, [20, 20, 30], 0.75)));
      g.addColorStop(1, rgb(mix(color, [10, 10, 16], 0.88)));
      ctx.fillStyle = g;
      ctx.fillRect(a.x, a.y, a.w, a.h);
      const rad = Math.min(a.w, a.h) * 0.2;
      ctx.beginPath();
      ctx.arc(a.x + a.w / 2, a.y + a.h / 2, rad, 0, Math.PI * 2);
      ctx.fillStyle = rgb(color);
      ctx.fill();
      ctx.fillStyle = luminance(color) > 0.6 ? '#111' : '#fff';
      ctx.font = `700 ${rad * 0.8}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const ini = String(s.label || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
      ctx.fillText(ini || '?', a.x + a.w / 2, a.y + a.h / 2 + rad * 0.04);
    }
    ctx.restore();

    const nameOn = s.kind === 'media' ? brand.showMediaNames !== false : brand.showNames;
    if (nameOn && s.label && s.kind !== 'image' && a.a > 0.3) this.drawNameTag(s.label, a, color);
  }

  // Mídia só de áudio: barras animadas + título + progresso (leve, sem analisador; pulsa só enquanto toca).
  drawAudioViz(s, a, color) {
    const { ctx } = this;
    const el = s.el;
    const playing = !el.paused && !el.ended;
    const g = ctx.createLinearGradient(a.x, a.y, a.x + a.w, a.y + a.h);
    g.addColorStop(0, rgb(mix(color, [40, 20, 80], 0.6)));
    g.addColorStop(1, rgb(mix(color, [8, 8, 18], 0.9)));
    ctx.fillStyle = g;
    ctx.fillRect(a.x, a.y, a.w, a.h);
    const n = 28;
    const bw = a.w * 0.6 / n;
    const baseY = a.y + a.h * 0.58;
    const maxH = a.h * 0.36;
    const t = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      const env = 0.35 + 0.65 * Math.sin((i / (n - 1)) * Math.PI); // mais alto no centro
      const wave = 0.5 + 0.5 * Math.sin(t * 5.2 + i * 0.9) * Math.sin(t * 2.3 + i * 0.37);
      const v = playing ? 0.12 + 0.88 * Math.abs(wave) * env : 0.06;
      const h = Math.max(3, maxH * v);
      const x = a.x + a.w * 0.2 + i * bw;
      ctx.fillStyle = `hsla(${265 + i * 3},90%,${62 + v * 16}%,${playing ? 0.95 : 0.4})`;
      roundRectPath(ctx, x + bw * 0.15, baseY - h, bw * 0.7, h * 2, bw * 0.35);
      ctx.fill();
    }
    const fs = Math.max(10, Math.min(a.h * 0.075, a.w * 0.05));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.font = `700 ${fs}px Inter, sans-serif`;
    let title = String(s.label || '').replace(/^[^\p{L}\p{N}]+/u, '');
    while (ctx.measureText(title).width > a.w * 0.85 && title.length > 3) title = title.slice(0, -2) + '…';
    ctx.fillText('♪ ' + title, a.x + a.w / 2, a.y + a.h * 0.2);
    if (el.duration > 0) {
      const px = a.x + a.w * 0.2, pw = a.w * 0.6, py = a.y + a.h * 0.88;
      ctx.fillStyle = 'rgba(255,255,255,.2)';
      ctx.fillRect(px, py, pw, Math.max(2, a.h * 0.008));
      ctx.fillStyle = 'hsl(268 90% 70%)';
      ctx.fillRect(px, py, pw * Math.min(1, el.currentTime / el.duration), Math.max(2, a.h * 0.008));
    }
  }

  drawNameTag(label, a, color) {
    const { ctx, H } = this;
    const style = this.brand.nameStyle;
    const scale = Math.max(0.55, Math.min(1, a.h / (H * 0.45)));
    const fs = (this.vertical ? this.uh() * 0.034 : H * 0.026) * scale;
    const padX = fs * 0.7;
    const padY = fs * 0.42;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a.a);
    ctx.font = `600 ${fs}px Inter, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const maxW = a.w * 0.8;
    let text = label;
    while (ctx.measureText(text).width > maxW && text.length > 3) text = text.slice(0, -2) + '…';
    const tw = ctx.measureText(text).width;
    const bw = tw + padX * 2;
    const bh = fs + padY * 2;
    const off = fs * 0.6;
    const x = a.x + off;
    const lowTile = this.vertical && a.y + a.h >= H - 2; // em 9:16 o nome de quem ocupa o rodapé vai para o topo (embaixo ficam GC e a interface do app)
    let y = lowTile ? a.y + H * 0.075 : a.y + a.h - off - bh;
    // a tarja não fica embaixo do banner: sobe para cima dele (ou vai para o topo da imagem)
    const bz = this.banner && !this.banner.hiding ? this._bz : null;
    const hitsBanner = (yy) => bz && x < bz.x1 && x + bw > bz.x0 && yy < bz.y1 + off * 0.5 && yy + bh > bz.y0 - off * 0.5;
    if (hitsBanner(y)) {
      const cands = bz.top ? [bz.y1 + off, a.y + a.h - off - bh] : [bz.y0 - off - bh, a.y + off];
      y = cands.find((yy) => yy >= a.y && yy + bh <= a.y + a.h && !hitsBanner(yy)) ?? y;
    }
    const fg = luminance(color) > 0.6 ? '#111' : '#fff';
    if (style === 'minimal') {
      if (!this.lowPower) {
        ctx.shadowColor = 'rgba(0,0,0,.8)';
        ctx.shadowBlur = fs * 0.5;
      }
      ctx.fillStyle = '#fff';
      ctx.fillText(text, x, y + bh / 2);
    } else {
      roundRectPath(ctx, x, y, bw, bh, style === 'block' ? fs * 0.12 : bh / 2);
      ctx.fillStyle = rgb(color, 0.92);
      ctx.fill();
      ctx.fillStyle = fg;
      ctx.fillText(text, x + padX, y + bh / 2 + fs * 0.03);
    }
    ctx.restore();
  }

  drawReplayBug(now) {
    const ctx = this.ctx;
    const text = 'REPLAY'; // sem velocidade: o selo identifica o replay, não o rate

    ctx.save();
    const vertical = !!this.vertical;
    const totalH = vertical ? 28 : 34;
    const padX = vertical ? 8 : 10;
    const icon = vertical ? 16 : 20;
    ctx.font = `900 ${vertical ? 13 : 15}px "Inter", -apple-system, sans-serif`;
    const textW = ctx.measureText(text).width;
    const totalW = Math.round(padX * 2 + icon + 8 + textW);

    const x = vertical ? 14 : 18;
    const y = vertical ? 24 : 14;

    // Selo vermelho de replay, grande o bastante para ser lido no PGM/stream.
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    const bgGrad = ctx.createLinearGradient(x, y, x + totalW, y + totalH);
    bgGrad.addColorStop(0, '#ef4444');
    bgGrad.addColorStop(1, '#b91c1c');
    ctx.fillStyle = bgGrad;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    roundRectPath(ctx, x, y, totalW, totalH, 6);
    ctx.fill();
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Ícone: seta circular de replay + triângulo de play, em branco.
    const cx = x + padX + icon / 2;
    const cy = y + totalH / 2;
    const r = icon / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = '#fff';
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.66, -0.25 * Math.PI, 1.25 * Math.PI);
    ctx.stroke();
    const ax = Math.cos(1.25 * Math.PI) * r * 0.66;
    const ay = Math.sin(1.25 * Math.PI) * r * 0.66;
    ctx.beginPath();
    ctx.moveTo(ax + 1, ay - 4);
    ctx.lineTo(ax + 4.5, ay + 1.5);
    ctx.lineTo(ax - 2.5, ay + 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.3);
    ctx.lineTo(r * 0.36, 0);
    ctx.lineTo(-r * 0.2, r * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${vertical ? 13 : 15}px "Inter", -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + padX + icon + 8, cy + 0.5);
    ctx.restore();
  }

  // Stinger de replay no PGM: painéis entram/saem cobrindo a tela, com o selo no centro.
  triggerReplayWipe(kind = 'in') {
    this.replayWipe = { t0: performance.now(), ms: 520, kind };
  }

  drawReplayWipe(now) {
    const w = this.replayWipe;
    if (!w) return;
    const p = (now - w.t0) / w.ms;
    if (p >= 1) {
      this.replayWipe = null;
      return;
    }
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    // 0 → cobre → 0 (fecha no primeiro meio, abre no segundo)
    const cover = p < 0.5 ? p * 2 : (1 - p) * 2;
    const eased = cover * cover * (3 - 2 * cover);
    const panelH = (H / 2) * eased;

    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(8, 6, 14, 0.98)');
    grad.addColorStop(0.5, 'rgba(20, 12, 32, 0.98)');
    grad.addColorStop(1, 'rgba(8, 6, 14, 0.98)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, panelH);
    ctx.fillRect(0, H - panelH, W, panelH);

    // Faixa vermelha fina na borda dos painéis
    ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
    ctx.fillRect(0, panelH - Math.max(1, H * 0.003), W, Math.max(1, H * 0.003));
    ctx.fillRect(0, H - panelH, W, Math.max(1, H * 0.003));

    const alpha = Math.min(1, eased * 1.4);
    if (alpha > 0.02) {
      ctx.globalAlpha = alpha;
      const isOut = w.kind === 'out';
      const text = isOut ? 'AO VIVO' : (this.replayBugText || 'REPLAY');
      const size = Math.round(H * 0.085);
      ctx.font = `900 ${size}px "Inter", -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(239, 68, 68, 0.65)';
      ctx.shadowBlur = size * 0.35;
      ctx.fillText(text, W / 2, H / 2);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.font = `700 ${Math.round(size * 0.22)}px "Inter", -apple-system, sans-serif`;
      ctx.fillStyle = 'rgba(226, 232, 240, 0.75)';
      ctx.fillText(isOut ? 'RETORNANDO PARA O SINAL AO VIVO' : 'INSTANT REPLAY', W / 2, H / 2 + size * 0.78);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // Recebe do console o estado do VAR (linhas/carimbo) em coordenadas 0..1.
  setVarOverlay(data) {
    this.varOverlay = data ? { on: data.on !== false, lines: data.lines || [], stamp: data.stamp || null } : null;
  }

  drawVarOverlayPgm() {
    const v = this.varOverlay;
    if (!v?.on) return;
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    ctx.save();
    for (const line of v.lines || []) {
      const x = Math.max(0, Math.min(1, Number(line.x) || 0)) * W;
      ctx.strokeStyle = line.color || '#00d2ff';
      ctx.lineWidth = Math.max(2, W * 0.0018);
      ctx.setLineDash([W * 0.008, W * 0.005]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.setLineDash([]);
      if (line.label) {
        const fs = Math.round(H * 0.024);
        ctx.font = `900 ${fs}px "Inter", -apple-system, sans-serif`;
        const tw = ctx.measureText(line.label).width + fs;
        ctx.fillStyle = line.color || '#00d2ff';
        ctx.fillRect(x - tw / 2, H * 0.045, tw, fs * 1.5);
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(line.label, x, H * 0.045 + fs * 0.78);
      }
    }
    if (v.stamp?.text) {
      const fs = Math.round(H * 0.028);
      ctx.font = `900 ${fs}px "Inter", -apple-system, sans-serif`;
      const tw = Math.min(W * 0.7, ctx.measureText(v.stamp.text).width + fs * 2);
      const x = Math.max(0, Math.min(1, Number(v.stamp.x) || 0.5)) * W;
      const y = Math.max(0, Math.min(1, Number(v.stamp.y) || 0.5)) * H;
      ctx.fillStyle = 'rgba(124, 92, 255, 0.95)';
      ctx.fillRect(x - tw / 2, y - fs * 0.9, tw, fs * 1.8);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(v.stamp.text, x, y);
    }
    ctx.restore();
  }

  drawBanner(color, now, tickerH, lift = 0) {
    drawBannerFx(this, color, now, tickerH, lift);
  }

  fit(text, maxW) {
    const { ctx } = this;
    if (ctx.measureText(text).width <= maxW) return text;
    while (text.length > 3 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
    return text + '…';
  }

  drawTicker(color, dt, th) {
    const t = this.ticker;
    if (!t || !th) return;
    const { ctx, W, H } = this;
    const y = H - th;
    ctx.save();
    ctx.fillStyle = rgb(mix(color, [10, 10, 16], 0.35));
    ctx.fillRect(0, y, W, th);
    ctx.fillStyle = rgb(mix(color, [255, 255, 255], 0.3));
    ctx.fillRect(0, y, W, Math.max(2, th * 0.06));
    const fs = th * 0.48;
    ctx.font = `600 ${fs}px Inter, sans-serif`;
    ctx.fillStyle = luminance(color) > 0.6 ? '#111' : '#fff';
    ctx.textBaseline = 'middle';
    const unit = t.text + '      •      ';
    const uw = ctx.measureText(unit).width || 1;
    t.offset = (t.offset + dt * W * (t.speed || 0.09)) % uw;
    for (let x = -t.offset; x < W; x += uw) ctx.fillText(unit, x, y + th / 2 + fs * 0.05);
    // selo fixo à esquerda (ex.: NOTÍCIAS)
    if (t.label) {
      const lab = t.label.toUpperCase();
      ctx.font = `800 ${fs * 0.82}px Inter, sans-serif`;
      const lw = ctx.measureText(lab).width + th * 0.9;
      ctx.fillStyle = rgb(mix(color, [0, 0, 0], 0.55));
      ctx.fillRect(0, y, lw, th);
      ctx.fillStyle = '#fff';
      ctx.fillText(lab, th * 0.45, y + th / 2 + fs * 0.05);
    }
    ctx.restore();
  }
}

// Mantém o dissolve nas saídas derivadas (retorno do convidado e vertical). Elas têm tamanho
// próprio, então cada uma copia a cena anterior para o seu `fromView()` e sincroniza o progresso
// com o fade do PGM. Sem isso, o PGM dissolve mas a saída derivada corta seco.
function syncDerivedTransition(v, main, owner) {
  const mf = main.fade;
  if (owner.cutSeq !== main.cutSeq) {
    owner.cutSeq = main.cutSeq;
    if (mf) {
      v.transition(mf.manual ? 'manual' : 'mix', mf.ms || 1);
    } else {
      v.endMix();
      v.snap = true;
    }
  }
  if (mf) {
    if (!v.fade) v.transition(mf.manual ? 'manual' : 'mix', mf.ms || 1);
    if (v.fade) {
      v.fade.t0 = mf.t0;
      v.fade.ms = mf.ms;
      v.fade.manual = !!mf.manual;
      v.fade.linear = !!mf.linear;
      v.fade.p = mf.p;
    }
  } else if (v.fade) {
    v.endMix();
  }
}

// Retorno de vídeo por convidado: espelha o quadro final do PGM, já composto.
// Antes cada convidado tinha um Compositor completo e recompunha a cena inteira a 30 fps.
// Agora o retorno é um drawImage do canvas do programa para 960×540: mesmo conteúdo (DSK,
// GC, banner, transição), muito menos CPU e pronto para acompanhar 30 ou 60 fps do preset.
export class GuestView {
  constructor(main, guestId, { width = 960, height = 540, fps = 60 } = {}) {
    this.main = main;
    this.guestId = guestId;
    this.width = width;
    this.height = height;
    this.fps = Math.max(30, Number(fps) || 30);
    // O ticker pode entregar 60 fps; uma folga pequena evita perder o quadro por oscilação do timer.
    this.minGap = 1000 / this.fps - 4;
    this.lastT = 0;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    // captureStream(60) permite subir para 60 quando o preset mudar, sem recriar o track.
    this.stream = this.canvas.captureStream(60);
  }

  get track() {
    return this.stream.getVideoTracks()[0];
  }

  setFps(fps) {
    this.fps = Math.max(30, Number(fps) || 30);
    this.minGap = 1000 / this.fps - 4;
  }

  render() {
    const now = performance.now();
    if (now - this.lastT < this.minGap) return;
    this.lastT = now;
    const src = this.main?.canvas;
    if (!src?.width) return;
    this.ctx.drawImage(src, 0, 0, this.width, this.height);
  }

  close() {
    this.track?.stop();
  }
}

// Saída vertical 9:16 (Instagram, TikTok, Reels, Shorts): segunda cena com layout próprio,
// renderizada em paralelo ao programa horizontal, com as mesmas fontes, marca, GC e letreiro.
export const VERTICAL_LAYOUTS = [
  ['auto', 'Automático'],
  ['vfill', 'Tela cheia'],
  ['vstack', 'Empilhado'],
  ['vlead', 'Destaque'],
  ['vfit', 'Encaixado 16:9'],
];
export class VerticalView {
  constructor(main, preset = { width: 720, height: 1280 }) {
    this.main = main;
    this.layout = 'auto';
    this.tickOffset = 0;
    this.view = new Compositor(document.createElement('canvas'));
    this.view.vertical = true;
    this.view.setSize(preset.width, preset.height);
    this.view.sources = main.sources;
    this.view.images = main.images;
    this.view.socialImgs = main.socialImgs;
    this.stream = this.view.canvas.captureStream();
  }

  get canvas() {
    return this.view.canvas;
  }

  get track() {
    return this.stream.getVideoTracks()[0];
  }

  setPreset(p) {
    this.view.setSize(p.width, p.height);
    this.view.anim.clear();
  }

  render() {
    const { main: m, view: v } = this;
    syncDerivedTransition(v, m, this);
    v.brand = m.brand;
    v.vfx = m.vfx;
    v.layout = this.layout;
    v.banner = m.banner;
    v.social = m.social;
    v.wg = m.wg;
    v.solo = m.solo;
    v.take = m.take;
    v.ftb = m.ftb; // FTB vale para as duas saídas (horizontal e vertical)
    v.dsk = m.dsk; // DSKs marcados "também no vertical" (com posição/corte próprios, ver dsk.js)
    v.cc = m.cc; // legenda ao vivo: mesma camada no retorno, no vertical e na prévia
    v.stage = m.stage;
    v.ticker = m.ticker ? { ...m.ticker, offset: this.tickOffset } : null;
    v.render();
    if (v.ticker) this.tickOffset = v.ticker.offset;
  }

  close() {
    this.track?.stop();
  }
}

// Monitor de PRÉVIA da mesa de corte: mesma marca/GC do programa, com a cena escolhida para entrar no ar.
// A prévia acompanha o fps do PGM (30/60) — não é mais um monitor de 15 fps.
export class PreviewView {
  constructor(main, canvas, { width = 640, height = 360, fps = 60 } = {}) {
    this.main = main;
    this.fps = Math.max(1, Number(fps) || 30);
    this.minGap = 1000 / this.fps - 4;
    this.lastT = 0;
    this.tickOffset = 0;
    this.scene = { take: null, stage: null, layout: null }; // take = fonte em tela cheia; senão o palco
    this.view = new Compositor(canvas);
    this.view.setSize(width, height);
    this.view.sources = main.sources;
    this.view.images = main.images;
    this.view.socialImgs = main.socialImgs;
  }

  setFps(fps) {
    this.fps = Math.max(1, Number(fps) || 30);
    this.minGap = 1000 / this.fps - 4;
  }

  set(scene) {
    this.scene = { take: null, stage: null, layout: null, ...scene };
    this.view.snap = true;
  }

  render() {
    const now = performance.now();
    if (now - this.lastT < this.minGap) return;
    this.lastT = now;
    const { main: m, view: v, scene } = this;
    v.brand = m.brand;
    v.vfx = m.vfx;
    v.layout = scene.layout || m.layout;
    v.banner = m.banner;
    v.social = m.social;
    v.wg = m.wg;
    v.solo = scene.take ? null : m.solo;
    v.take = scene.take;
    v.stage = scene.stage || m.stage;
    v.dsk = m.dsk; // como no ATEM: DSK no ar aparece também na prévia
    v.cc = m.cc; // legenda ao vivo: mesma camada no retorno, no vertical e na prévia
    v.ticker = m.ticker ? { ...m.ticker, offset: this.tickOffset } : null;
    v.render();
    if (v.ticker) this.tickOffset = v.ticker.offset;
  }
}
