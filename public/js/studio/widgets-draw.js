// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Widgets desenhados no programa: código QR, enquete e placar de jogo.
// Tudo vai para o canvas (e portanto para a transmissão); o estado "no ar" vive aqui, os dados vêm de funções get().
import { hexToRgb, rgb, mix, luminance, roundRectPath } from './gfx.js';
import { makeQR } from './qr.js';

const ease = (p) => 1 - Math.pow(1 - p, 3);
const fit = (ctx, text, maxW) => {
  text = String(text ?? '');
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 2 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
};
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const rest = lines.slice(maxLines - 1).join(' ');
    lines.length = maxLines - 1;
    lines.push(fit(ctx, rest, maxW));
  }
  return lines.length ? lines : [''];
}

// ---------------------------------------------------------------------
// QR: renderiza o cartão (placa colorida, módulos arredondados, logo no centro, título) num canvas com cache
// ---------------------------------------------------------------------
const qrCache = new Map();
export const normalizeUrl = (u) => {
  u = String(u || '').trim();
  if (!u) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u;
};
const LOGO_FRAC = { H: 0.27, Q: 0.22, M: 0.15, L: 0 };

export function qrValid(url) {
  try {
    makeQR(normalizeUrl(url), 'L');
    return !!normalizeUrl(url);
  } catch {
    return false;
  }
}

export function renderQr(item, imageOf, fallbackColor = '#7c5cff') {
  const url = normalizeUrl(item.url);
  if (!url) return null;
  const color = item.useBrand ? fallbackColor : item.color || fallbackColor;
  const decoUrl = item.deco || '';
  const logo = decoUrl ? imageOf(decoUrl) : null;
  const title = item.showTitle && item.title ? item.title : '';
  const key = [url, color, decoUrl, logo ? 1 : 0, title].join('|');
  let cv = qrCache.get(key);
  if (cv) return cv;
  let qr;
  try {
    qr = makeQR(url, decoUrl ? 'H' : 'M');
  } catch {
    return null;
  }
  const S = 560;
  const border = S * 0.055;
  const quiet = S * 0.045;
  const titleH = title ? S * 0.2 : 0;
  cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S + titleH;
  const g = cv.getContext('2d');
  const base = hexToRgb(color);
  const modCol = luminance(base) > 0.78 ? '#15151f' : color;
  g.fillStyle = color;
  roundRectPath(g, 0, 0, S, S + titleH, S * 0.075);
  g.fill();
  g.fillStyle = '#fff';
  roundRectPath(g, border, border, S - border * 2, S - border * 2 + titleH, S * 0.045);
  g.fill();
  const inner = S - (border + quiet) * 2;
  const cell = inner / qr.size;
  const ox = border + quiet;
  const oy = border + quiet;
  const frac = logo ? LOGO_FRAC[qr.ecl] || 0 : 0;
  const lg = frac ? qr.size * frac : 0;
  const mid = qr.size / 2;
  const inLogo = (x, y) => lg && Math.abs(x + 0.5 - mid) < lg / 2 + 0.6 && Math.abs(y + 0.5 - mid) < lg / 2 + 0.6;
  const inFinder = (x, y) => (x < 8 && y < 8) || (x >= qr.size - 8 && y < 8) || (x < 8 && y >= qr.size - 8);
  g.fillStyle = modCol;
  for (let y = 0; y < qr.size; y++)
    for (let x = 0; x < qr.size; x++) {
      if (!qr.modules[y][x] || inFinder(x, y) || inLogo(x, y)) continue;
      g.beginPath();
      g.arc(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell, cell * 0.47, 0, 7);
      g.fill();
    }
  const eye = (cx, cy) => {
    const x = ox + cx * cell;
    const y = oy + cy * cell;
    g.fillStyle = modCol;
    roundRectPath(g, x, y, cell * 7, cell * 7, cell * 2);
    g.fill();
    g.fillStyle = '#fff';
    roundRectPath(g, x + cell, y + cell, cell * 5, cell * 5, cell * 1.4);
    g.fill();
    g.fillStyle = modCol;
    roundRectPath(g, x + cell * 2, y + cell * 2, cell * 3, cell * 3, cell * 0.9);
    g.fill();
  };
  eye(0, 0);
  eye(qr.size - 7, 0);
  eye(0, qr.size - 7);
  if (frac && logo) {
    const box = lg * cell;
    const cx = ox + mid * cell;
    const cy = oy + mid * cell;
    g.fillStyle = '#fff';
    roundRectPath(g, cx - box / 2, cy - box / 2, box, box, box * 0.28);
    g.fill();
    const pad = box * 0.12;
    const sc = Math.min((box - pad * 2) / logo.naturalWidth, (box - pad * 2) / logo.naturalHeight);
    g.drawImage(logo, cx - (logo.naturalWidth * sc) / 2, cy - (logo.naturalHeight * sc) / 2, logo.naturalWidth * sc, logo.naturalHeight * sc);
  }
  if (title) {
    g.fillStyle = '#15151f';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let fs = S * 0.085;
    g.font = `800 ${fs}px Outfit, Inter, sans-serif`;
    while (g.measureText(title).width > S - border * 3 && fs > 14) {
      fs -= 2;
      g.font = `800 ${fs}px Outfit, Inter, sans-serif`;
    }
    g.fillText(title, S / 2, S - border * 0.6 + titleH / 2 - border * 0.2);
  }
  qrCache.set(key, cv);
  if (qrCache.size > 40) qrCache.delete(qrCache.keys().next().value);
  return cv;
}

// ---------------------------------------------------------------------
// Camada de widgets
// ---------------------------------------------------------------------
export class WidgetLayer {
  constructor() {
    this.items = new Map();
  }
  show(key, kind, get, pos = 'br') {
    const it = this.items.get(key);
    if (it && !it.hiding) {
      it.get = get;
      it.pos = pos;
      return;
    }
    this.items.set(key, { key, kind, get, pos, t0: performance.now(), hiding: false, disp: null });
  }
  hide(key) {
    const it = this.items.get(key);
    if (it && !it.hiding) {
      it.hiding = true;
      it.t1 = performance.now();
    }
  }
  has(key) {
    const it = this.items.get(key);
    return !!it && !it.hiding;
  }
  get active() {
    return this.items.size > 0;
  }

  draw(c, color, now, only = null) {
    if (!this.items.size) return;
    const { ctx, W, H } = c;
    const brand = c.brand || {};
    const m = H * 0.035;
    const gap = H * 0.022;
    const tickerH = c.ticker ? Math.round((c.uh ? c.uh() : H) * 0.062) : 0;
    const used = {};
    const logoPos = brand.logoPos || 'tr';
    const logoH = brand.logo ? H * ((brand.logoSize || 11) / 100) + m * 0.4 : 0;
    const DUR = 380;
    for (const [key, it] of [...this.items]) {
      if (only && !only((it.pos || 'br')[0])) continue;
      let p = Math.min(1, (now - it.t0) / DUR);
      if (it.hiding) {
        p = 1 - Math.min(1, (now - it.t1) / DUR);
        if (p <= 0) {
          this.items.delete(key);
          continue;
        }
      }
      const e = ease(p);
      const data = it.get();
      if (!data) continue;
      const meas = { qr: this.mQr, poll: this.mPoll, msg: this.mMsg, msgqr: this.mMsgQr }[it.kind] || this.mScore;
      const d = meas.call(this, c, data, color, it, now);
      if (!d) continue;
      const pos = it.pos || 'br';
      const v = pos[0]; // t | b | m
      const side = pos[1]; // l | r | c
      let x = side === 'l' ? m : side === 'r' ? W - m - d.w : (W - d.w) / 2;
      let y;
      if (v === 'm') y = (H - d.h) / 2;
      else {
        const k = pos;
        let start = v === 't' ? m : H - tickerH - m;
        if (v === 't' && brand.logo && logoPos[0] === 't' && (logoPos[1] === side || (side === 'c' && false))) start += logoH;
        if (v === 'b' && brand.logo && logoPos[0] === 'b' && logoPos[1] === side) start -= logoH;
        const off = used[k] || 0;
        y = v === 't' ? start + off : start - off - d.h;
        used[k] = off + d.h + gap;
      }
      // área ocupada (coordenadas reais do canvas): o compositor afasta as imagens dela no próximo quadro
      if (!it.hiding && it.kind !== 'score' && c._wz) {
        const tf = ctx.getTransform();
        c._wz.push({ x: x + tf.e, y: y + tf.f, w: d.w, h: d.h, v, side });
      }
      ctx.save();
      ctx.globalAlpha = e;
      const slide = (1 - e) * H * 0.05;
      ctx.translate(side === 'l' ? -slide : side === 'r' ? slide : 0, side === 'c' ? (v === 't' ? -slide : slide) : 0);
      ctx.shadowColor = 'rgba(0,0,0,.45)';
      ctx.shadowBlur = H * 0.03;
      ctx.shadowOffsetY = H * 0.006;
      d.draw(x, y);
      ctx.restore();
    }
  }

  // ---------- QR ----------
  mQr(c, data) {
    const cv = renderQr(data, (u) => c.image(u), c.brand?.color || '#7c5cff');
    if (!cv) return null;
    const w = c.H * 0.3;
    const h = (w * cv.height) / cv.width;
    return { w, h, draw: (x, y) => c.ctx.drawImage(cv, x, y, w, h) };
  }

  // ---------- QR da caixa de mensagens ("Mande sua mensagem") ----------
  mMsgQr(c, data) {
    const { ctx, W, H } = c;
    const u = H / 720;
    const qrCv = data.url ? renderQr({ url: data.url, useBrand: true }, (s) => c.image(s), c.brand?.color || '#7c5cff') : null;
    if (!qrCv) return null;
    const pad = 14 * u;
    const qrS = 118 * u;
    const tw = Math.min(W * 0.3, 230 * u);
    const w = pad + qrS + pad + tw + pad;
    ctx.save();
    ctx.font = `800 ${21 * u}px Outfit, Inter, sans-serif`;
    const lines = wrap(ctx, data.title || 'Mande sua mensagem', tw, 3);
    ctx.restore();
    const h = Math.max(qrS + pad * 2, pad + 24 * u + lines.length * 25 * u + 40 * u);
    return {
      w,
      h,
      draw: (x, y) => {
        const bc = c.brand?.color ? hexToRgb(c.brand.color) : [124, 92, 255];
        ctx.fillStyle = 'rgba(14,14,26,.93)';
        roundRectPath(ctx, x, y, w, h, 14 * u);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = rgb(bc);
        roundRectPath(ctx, x, y, w, 5 * u, 3 * u);
        ctx.fill();
        ctx.drawImage(qrCv, x + pad, y + (h - qrS) / 2, qrS, (qrS * qrCv.height) / qrCv.width);
        const tx = x + pad + qrS + pad;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = `800 ${11 * u}px Inter, sans-serif`;
        const tag = data.audio ? 'TEXTO OU ÁUDIO' : 'MENSAGENS';
        const tagW = ctx.measureText(tag).width + 18 * u;
        let ty = y + (h - (24 * u + lines.length * 25 * u + 34 * u)) / 2;
        ctx.fillStyle = rgb(bc);
        roundRectPath(ctx, tx, ty, tagW, 20 * u, 10 * u);
        ctx.fill();
        ctx.fillStyle = luminance(bc) > 0.6 ? '#111' : '#fff';
        ctx.fillText(tag, tx + 9 * u, ty + 10.5 * u);
        ty += 24 * u + 12 * u;
        ctx.fillStyle = '#fff';
        ctx.font = `800 ${21 * u}px Outfit, Inter, sans-serif`;
        for (const l of lines) {
          ctx.fillText(l, tx, ty);
          ty += 25 * u;
        }
        ctx.fillStyle = 'rgba(255,255,255,.62)';
        ctx.font = `600 ${12 * u}px Inter, sans-serif`;
        ctx.fillText(fit(ctx, 'Aponte a câmera do celular', tw), tx, ty + 4 * u);
      },
    };
  }

  // ---------- Mensagem do público no ar ----------
  mMsg(c, m, color, it, now) {
    const { ctx, W, H } = c;
    const u = H / 720;
    const w = Math.min(W * 0.46, 440 * u);
    const pad = 16 * u;
    const text = m.text || '';
    const isAudio = !!m.audio;
    ctx.save();
    ctx.font = `600 ${19 * u}px Inter, sans-serif`;
    const lines = text ? wrap(ctx, text, w - pad * 2, 5) : [];
    ctx.restore();
    const headH = 24 * u;
    const nameH = 30 * u;
    const lineH = 25 * u;
    const audioH = isAudio ? 40 * u : 0;
    const h = pad + headH + 8 * u + nameH + lines.length * lineH + (lines.length && isAudio ? 8 * u : 0) + audioH + pad;
    return {
      w,
      h,
      draw: (x, y) => {
        const bc = c.brand?.color ? hexToRgb(c.brand.color) : color;
        const accent = rgb(bc);
        ctx.fillStyle = 'rgba(14,14,26,.94)';
        roundRectPath(ctx, x, y, w, h, 14 * u);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = accent;
        roundRectPath(ctx, x, y, 5 * u, h, 3 * u);
        ctx.fill();
        // etiqueta
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = `800 ${11 * u}px Inter, sans-serif`;
        const tag = isAudio ? 'ÁUDIO DO PÚBLICO' : 'MENSAGEM DO PÚBLICO';
        const tw = ctx.measureText(tag).width + 18 * u;
        ctx.fillStyle = accent;
        roundRectPath(ctx, x + pad, y + pad, tw, 21 * u, 11 * u);
        ctx.fill();
        ctx.fillStyle = luminance(bc) > 0.6 ? '#111' : '#fff';
        ctx.fillText(tag, x + pad + 9 * u, y + pad + 11 * u);
        // nome
        let ty = y + pad + headH + 8 * u + nameH / 2;
        ctx.fillStyle = '#fff';
        ctx.font = `800 ${22 * u}px Outfit, Inter, sans-serif`;
        ctx.fillText(fit(ctx, m.name || 'Espectador', w - pad * 2), x + pad, ty);
        ty += nameH / 2 + lineH / 2;
        // texto
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.font = `600 ${19 * u}px Inter, sans-serif`;
        for (const l of lines) {
          ctx.fillText(l, x + pad, ty);
          ty += lineH;
        }
        // áudio: barras animadas enquanto toca + progresso
        if (isAudio) {
          const ay = y + h - pad - audioH;
          const playing = !!m.playing?.();
          const prog = Math.max(0, Math.min(1, m.progress?.() || 0));
          ctx.fillStyle = 'rgba(255,255,255,.08)';
          roundRectPath(ctx, x + pad, ay, w - pad * 2, audioH, 10 * u);
          ctx.fill();
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.arc(x + pad + 20 * u, ay + audioH / 2, 13 * u, 0, 7);
          ctx.fill();
          ctx.fillStyle = luminance(bc) > 0.6 ? '#111' : '#fff';
          // ícone de microfone simplificado
          roundRectPath(ctx, x + pad + 16.5 * u, ay + audioH / 2 - 8 * u, 7 * u, 11 * u, 3.5 * u);
          ctx.fill();
          ctx.fillRect(x + pad + 19.3 * u, ay + audioH / 2 + 4 * u, 1.6 * u, 4 * u);
          const bx = x + pad + 44 * u;
          const bw = w - pad * 2 - 44 * u - 54 * u;
          const n = Math.max(8, Math.floor(bw / (6 * u)));
          for (let i = 0; i < n; i++) {
            const seed = Math.sin(i * 12.9898 + (m.id || '').length * 3.1) * 43758.5453;
            const base = 0.25 + (seed - Math.floor(seed)) * 0.6;
            const amp = playing ? base * (0.55 + 0.45 * Math.sin(now / 110 + i * 0.9)) : base * 0.6;
            const bh = Math.max(3 * u, amp * (audioH - 14 * u));
            ctx.fillStyle = i / n <= prog ? accent : 'rgba(255,255,255,.35)';
            roundRectPath(ctx, bx + i * 6 * u, ay + (audioH - bh) / 2, 3 * u, bh, 1.5 * u);
            ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,255,255,.75)';
          ctx.font = `700 ${13 * u}px Inter, sans-serif`;
          ctx.textAlign = 'right';
          const d = Math.round(m.dur || 0);
          ctx.fillText(`${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`, x + w - pad - 10 * u, ay + audioH / 2);
          ctx.textAlign = 'left';
        }
      },
    };
  }

  // ---------- Enquete ----------
  mPoll(c, poll, color, it, now) {
    const { ctx, W, H } = c;
    const u = H / 720;
    const w = Math.min(W * 0.4, 360 * u);
    const pad = 16 * u;
    const q = poll.question || '';
    const opts = poll.options || [];
    const total = opts.reduce((a, o) => a + (o.votes || 0), 0);
    const closed = poll.state === 'closed';
    ctx.save();
    ctx.font = `800 ${21 * u}px Outfit, Inter, sans-serif`;
    const lines = wrap(ctx, q, w - pad * 2, 3);
    ctx.restore();
    const headH = 26 * u;
    const qH = lines.length * 26 * u;
    const rowH = 38 * u;
    const rowGap = 8 * u;
    const footH = 26 * u;
    let h = pad + headH + qH + 8 * u + opts.length * (rowH + rowGap) + footH + pad * 0.4;
    if (!it.disp || it.disp.length !== opts.length) it.disp = opts.map(() => 0);
    const maxV = Math.max(...opts.map((o) => o.votes || 0), 0);
    // votação pelo celular: coluna com o QR Code à direita
    const qrCv = poll.voteUrl && !closed ? renderQr({ url: poll.voteUrl, useBrand: true }, (s) => c.image(s), c.brand?.color || '#7c5cff') : null;
    let qrS = qrCv ? 112 * u : 0;
    if (qrCv && w + qrS + pad > W * 0.92) qrS = Math.max(70 * u, W * 0.92 - w - pad);
    const qrCol = qrCv ? qrS + pad : 0;
    const capH = 34 * u;
    if (qrCv) h = Math.max(h, pad + qrS + capH + pad * 0.6);
    const cw = w + qrCol;
    return {
      w: cw,
      h,
      draw: (x, y) => {
        const bc = c.brand?.color ? hexToRgb(c.brand.color) : color;
        const accent = rgb(bc);
        ctx.fillStyle = 'rgba(14,14,26,.93)';
        roundRectPath(ctx, x, y, cw, h, 14 * u);
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = accent;
        roundRectPath(ctx, x, y, cw, 5 * u, 3 * u);
        ctx.fill();
        if (qrCv) {
          const qx = x + w;
          const qy = y + pad;
          ctx.drawImage(qrCv, qx, qy, qrS, (qrS * qrCv.height) / qrCv.width);
          ctx.fillStyle = 'rgba(255,255,255,.85)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `700 ${11 * u}px Inter, sans-serif`;
          ctx.fillText(fit(ctx, 'Aponte a câmera', qrS + pad * 0.6), qx + qrS / 2, qy + qrS + 11 * u);
          ctx.fillStyle = 'rgba(255,255,255,.6)';
          ctx.font = `600 ${10.5 * u}px Inter, sans-serif`;
          ctx.fillText(fit(ctx, 'e vote pelo celular', qrS + pad * 0.6), qx + qrS / 2, qy + qrS + 25 * u);
          ctx.textAlign = 'left';
        }
        // cabeçalho
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = `800 ${11.5 * u}px Inter, sans-serif`;
        const tag = closed ? 'RESULTADO' : 'ENQUETE';
        const tw = ctx.measureText(tag).width + 18 * u;
        ctx.fillStyle = closed ? 'rgba(255,255,255,.14)' : accent;
        roundRectPath(ctx, x + pad, y + pad, tw, 21 * u, 11 * u);
        ctx.fill();
        ctx.fillStyle = luminance(bc) > 0.6 && !closed ? '#111' : '#fff';
        ctx.fillText(tag, x + pad + 9 * u, y + pad + 11.5 * u);
        if (!closed) {
          const pulse = 0.5 + 0.5 * Math.sin(now / 280);
          ctx.fillStyle = `rgba(52,211,153,${0.4 + pulse * 0.6})`;
          ctx.beginPath();
          ctx.arc(x + pad + tw + 12 * u, y + pad + 11.5 * u, 4 * u, 0, 7);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.7)';
          ctx.font = `600 ${11 * u}px Inter, sans-serif`;
          let label = 'votação aberta';
          if (poll.endsAt) {
            const left = Math.max(0, Math.ceil((poll.endsAt - Date.now()) / 1000));
            label = `encerra em ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
          }
          ctx.fillText(label, x + pad + tw + 22 * u, y + pad + 11.5 * u);
        }
        // pergunta
        ctx.fillStyle = '#fff';
        ctx.font = `800 ${21 * u}px Outfit, Inter, sans-serif`;
        let ty = y + pad + headH + 12 * u;
        for (const l of lines) {
          ctx.fillText(l, x + pad, ty);
          ty += 26 * u;
        }
        // opções
        let oy = y + pad + headH + qH + 8 * u;
        const rw = w - pad * 2;
        opts.forEach((o, i) => {
          const pct = total ? (o.votes || 0) / total : 0;
          it.disp[i] += (pct - it.disp[i]) * 0.14;
          const win = closed && maxV > 0 && (o.votes || 0) === maxV;
          ctx.fillStyle = 'rgba(255,255,255,.08)';
          roundRectPath(ctx, x + pad, oy, rw, rowH, 9 * u);
          ctx.fill();
          if (it.disp[i] > 0.002) {
            ctx.save();
            roundRectPath(ctx, x + pad, oy, rw, rowH, 9 * u);
            ctx.clip();
            ctx.fillStyle = win || !closed ? rgb(bc, win ? 1 : 0.85) : rgb(mix(bc, [90, 90, 110], 0.6), 0.6);
            ctx.fillRect(x + pad, oy, rw * it.disp[i], rowH);
            ctx.restore();
          }
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.beginPath();
          ctx.arc(x + pad + 17 * u, oy + rowH / 2, 11 * u, 0, 7);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.font = `800 ${12.5 * u}px Inter, sans-serif`;
          ctx.fillText(String(i + 1), x + pad + 17 * u, oy + rowH / 2 + 0.5 * u);
          ctx.textAlign = 'left';
          const pctTxt = `${Math.round(pct * 100)}%`;
          ctx.font = `800 ${15 * u}px Outfit, Inter, sans-serif`;
          const pw = ctx.measureText(pctTxt).width;
          ctx.font = `600 ${15 * u}px Inter, sans-serif`;
          ctx.fillStyle = '#fff';
          ctx.shadowColor = 'rgba(0,0,0,.5)';
          ctx.shadowBlur = 4 * u;
          ctx.fillText(fit(ctx, o.text || `Opção ${i + 1}`, rw - 46 * u - pw - 14 * u), x + pad + 36 * u, oy + rowH / 2 + 0.5 * u);
          ctx.textAlign = 'right';
          ctx.font = `800 ${15 * u}px Outfit, Inter, sans-serif`;
          ctx.fillText(pctTxt, x + pad + rw - 10 * u, oy + rowH / 2 + 0.5 * u);
          ctx.textAlign = 'left';
          ctx.shadowColor = 'transparent';
          oy += rowH + rowGap;
        });
        // rodapé
        ctx.fillStyle = 'rgba(255,255,255,.62)';
        ctx.font = `600 ${12 * u}px Inter, sans-serif`;
        const foot = closed
          ? `Votação encerrada · ${total} ${total === 1 ? 'voto' : 'votos'}`
          : qrCv
            ? `QR Code ou chat (${opts.length > 1 ? `1 a ${opts.length}` : '1'}) · ${total} ${total === 1 ? 'voto' : 'votos'}`
            : `Vote no chat digitando ${opts.length > 1 ? `1 a ${opts.length}` : '1'} · ${total} ${total === 1 ? 'voto' : 'votos'}`;
        ctx.fillText(fit(ctx, foot, rw), x + pad, oy + footH / 2 - 3 * u);
      },
    };
  }

  // ---------- Placar ----------
  mScore(c, s, color) {
    const { ctx, H } = c;
    const u = H / 720;
    const bh = 46 * u;
    const chip = 8 * u;
    const logoS = 32 * u;
    const abbrW = (t) => {
      ctx.save();
      ctx.font = `800 ${22 * u}px Outfit, Inter, sans-serif`;
      const w = ctx.measureText(t).width;
      ctx.restore();
      return w;
    };
    const teamW = (t) => chip + 10 * u + (t.logo ? logoS + 8 * u : 0) + Math.max(abbrW(t.abbr || ''), 40 * u) + 12 * u;
    const scoreW = 44 * u;
    const clockW = 96 * u;
    const hw = teamW(s.home);
    const aw = teamW(s.away);
    const w = hw + scoreW + clockW + scoreW + aw;
    const tabH = s.tab ? 20 * u : 0;
    const h = bh + tabH;
    return {
      w,
      h,
      draw: (x, y) => {
        const bc = c.brand?.color ? hexToRgb(c.brand.color) : color;
        const team = (t, tx, away) => {
          ctx.fillStyle = '#12121e';
          ctx.fillRect(tx, y, away ? aw : hw, bh);
          ctx.fillStyle = t.color || '#888';
          ctx.fillRect(away ? tx + aw - chip : tx, y, chip, bh);
          let cx = away ? tx + 12 * u : tx + chip + 10 * u;
          const logo = t.logo ? c.image(t.logo) : null;
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.font = `800 ${22 * u}px Outfit, Inter, sans-serif`;
          ctx.textAlign = 'left';
          if (away) {
            ctx.fillText(t.abbr || '', cx, y + bh / 2 + 1 * u);
            if (logo) drawContain(ctx, logo, cx + Math.max(abbrW(t.abbr || ''), 40 * u) + 8 * u, y + (bh - logoS) / 2, logoS, logoS);
          } else {
            if (logo) {
              drawContain(ctx, logo, cx, y + (bh - logoS) / 2, logoS, logoS);
              cx += logoS + 8 * u;
            }
            ctx.fillText(t.abbr || '', cx, y + bh / 2 + 1 * u);
          }
        };
        const scoreBox = (v, sx) => {
          ctx.fillStyle = '#fff';
          ctx.fillRect(sx, y, scoreW, bh);
          ctx.fillStyle = '#111';
          ctx.font = `800 ${28 * u}px Outfit, Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(v), sx + scoreW / 2, y + bh / 2 + 1.5 * u);
          ctx.textAlign = 'left';
        };
        ctx.save();
        roundRectPath(ctx, x, y, w, bh, 8 * u);
        ctx.clip();
        team(s.home, x, false);
        scoreBox(s.home.score, x + hw);
        ctx.fillStyle = '#1d1d30';
        ctx.fillRect(x + hw + scoreW, y, clockW, bh);
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${22 * u}px Outfit, Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.clock, x + hw + scoreW + clockW / 2, y + bh / 2 + 1 * u);
        scoreBox(s.away.score, x + hw + scoreW + clockW);
        team(s.away, x + hw + scoreW + clockW + scoreW, true);
        ctx.restore();
        if (s.tab) {
          ctx.shadowColor = 'transparent';
          ctx.font = `800 ${11.5 * u}px Inter, sans-serif`;
          const tw = Math.min(w, ctx.measureText(s.tab).width + 26 * u);
          const tx = x + hw + scoreW + clockW / 2 - tw / 2;
          ctx.fillStyle = rgb(bc);
          ctx.beginPath();
          ctx.moveTo(tx, y + bh);
          ctx.lineTo(tx + tw, y + bh);
          ctx.lineTo(tx + tw - 6 * u, y + bh + tabH);
          ctx.lineTo(tx + 6 * u, y + bh + tabH);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = luminance(bc) > 0.6 ? '#111' : '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(s.tab, tx + tw / 2, y + bh + tabH / 2 + 0.5 * u);
          ctx.textAlign = 'left';
        }
      },
    };
  }
}

function drawContain(ctx, img, x, y, w, h) {
  const sc = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const iw = img.naturalWidth * sc;
  const ih = img.naturalHeight * sc;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
