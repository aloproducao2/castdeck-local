// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Overlays do programa: banners (lower thirds) com estilos e posições, e o chat de redes sociais
// (cartão de destaque + feed rolante). Tudo é desenhado no canvas, então vai ao ar na transmissão.
import { hexToRgb, rgb, mix, luminance, roundRectPath } from './gfx.js';
import { renderQr } from './widgets-draw.js';

export const PLATFORMS = {
  twitch: { c: '#9146ff', l: 'Twitch' },
  youtube: { c: '#ff2d4d', l: 'YouTube' },
  kick: { c: '#53fc18', l: 'Kick' },
  facebook: { c: '#1877f2', l: 'Facebook' },
  tiktok: { c: '#25f4ee', l: 'TikTok' },
  instagram: { c: '#e1306c', l: 'Instagram' },
  twitter: { c: '#1d9bf0', l: 'X' },
  x: { c: '#1d9bf0', l: 'X' },
  discord: { c: '#5865f2', l: 'Discord' },
  trovo: { c: '#19d66b', l: 'Trovo' },
  rumble: { c: '#85c742', l: 'Rumble' },
  castdeck: { c: '#7c5cff', l: 'CastDeck' },
};
export const platformOf = (type) => {
  const k = String(type || '').toLowerCase();
  return PLATFORMS[k] || { c: '#7c5cff', l: type ? String(type).slice(0, 14) : 'Chat' };
};

const ease = (p) => 1 - Math.pow(1 - p, 3);

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  while (text.length > 3 && ctx.measureText(text + '…').width > maxW) text = text.slice(0, -1);
  return text + '…';
}

// Registra a área ocupada pelo banner (em pixels do canvas, já com o deslocamento da faixa do vertical),
// para o compositor tirar as imagens e as tarjas de nome de baixo dele no próximo quadro.
function markZone(c, top, x, y, w, h) {
  const t = c.ctx.getTransform();
  c._bz = { top, x0: t.e + x * t.a, x1: t.e + (x + w) * t.a, y0: t.f + y * t.d, y1: t.f + (y + h) * t.d };
}

// ---------------------------------------------------------------------
// GC de jornalismo: [logo] + barra do nome (cor da marca) + faixa branca do cargo + etiqueta (AO VIVO...)
// ---------------------------------------------------------------------
// quebra o texto em até maxLines linhas (a última recebe reticências se faltar espaço)
function wrapLines(ctx, text, maxW, maxLines) {
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
    lines.push(fitText(ctx, rest, maxW));
  }
  return lines.length ? lines : [''];
}

// Hard news: faixa larga na largura da tela, bloco vermelho de etiqueta, manchete em caixa alta e logo na ponta.
// No vertical (9:16) a etiqueta vai por cima da faixa e manchete/apoio quebram em várias linhas (legível no celular).
function drawHardNews(c, b, bc, p, e, tickerH, lift) {
  const { ctx, W, H } = c;
  const vert = !!c.vertical;
  const m = vert ? W * 0.04 : H * 0.04;
  const top = (b.pos || 'bl')[0] === 't';
  const hfs = H * (vert ? 0.052 : 0.056);
  const sfs = H * (vert ? 0.031 : 0.03);
  const tfs = H * (vert ? 0.03 : 0.032);
  const bw = W - m * 2;
  const x = m;
  const tag = (b.tag || 'URGENTE').toUpperCase();
  const logo = b.logo && c.image ? c.image(b.logo) : null;
  ctx.save();
  ctx.font = `900 ${tfs}px Inter, sans-serif`;

  if (vert) {
    const lw = b.logo ? H * 0.16 : 0;
    const padX = hfs * 0.5;
    ctx.font = `900 ${hfs}px Outfit, Inter, sans-serif`;
    const hl = wrapLines(ctx, (b.title || '').toUpperCase(), bw - lw - padX * 2, 3);
    ctx.font = `700 ${sfs}px Inter, sans-serif`;
    const sl = b.subtitle ? wrapLines(ctx, b.subtitle, bw - lw - padX * 2, 2) : [];
    const hh = hl.length * hfs * 1.16 + hfs * 0.8;
    const sh = sl.length ? sl.length * sfs * 1.32 + sfs * 0.9 : 0;
    const tagH = tfs * 2.1;
    ctx.font = `900 ${tfs}px Inter, sans-serif`;
    const tagW = ctx.measureText(tag).width + tfs * 2.2;
    const bh = hh + sh;
    const y = top ? m + tagH : H - tickerH - m - bh - (lift ? lift + H * 0.02 : 0);
    markZone(c, top, x, y - tagH, bw, bh + tagH);
    ctx.globalAlpha = Math.min(1, p * 1.5);
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = H * 0.025;
    ctx.beginPath();
    ctx.rect(x - 4, y - tagH - 4, (bw + 8) * e, bh + tagH + 8);
    ctx.clip();
    ctx.fillStyle = '#d4142e';
    ctx.fillRect(x, y - tagH, tagW, tagH);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const pulse = ctx.globalAlpha;
    ctx.globalAlpha = pulse * (0.8 + 0.2 * Math.abs(Math.sin(performance.now() / 450)));
    ctx.fillText(tag, x + tfs * 1.1, y - tagH / 2 + tfs * 0.04);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = 'rgb(' + mix([14, 20, 40], bc, 0.12).map(Math.round).join(',') + ')';
    ctx.fillRect(x, y, bw, hh);
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${hfs}px Outfit, Inter, sans-serif`;
    hl.forEach((ln, i) => ctx.fillText(ln, x + padX, y + hfs * 0.4 + hfs * 0.58 + i * hfs * 1.16));
    if (sl.length) {
      ctx.fillStyle = 'rgba(255,255,255,.97)';
      ctx.fillRect(x, y + hh, bw, sh);
      ctx.fillStyle = rgb(bc);
      ctx.fillRect(x, y + hh, Math.max(4, H * 0.007), sh);
      ctx.fillStyle = '#16161f';
      ctx.font = `700 ${sfs}px Inter, sans-serif`;
      sl.forEach((ln, i) => ctx.fillText(ln, x + padX, y + hh + sfs * 0.45 + sfs * 0.66 + i * sfs * 1.32));
    }
    if (lw) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(x + bw - lw, y - tagH, lw, tagH + hh);
      if (logo) {
        const pad = lw * 0.12;
        const area = { w: lw - pad * 2, h: tagH + hh - pad * 2 };
        const s = Math.min(area.w / logo.naturalWidth, area.h / logo.naturalHeight);
        ctx.drawImage(logo, x + bw - lw + (lw - logo.naturalWidth * s) / 2, y - tagH + (tagH + hh - logo.naturalHeight * s) / 2, logo.naturalWidth * s, logo.naturalHeight * s);
      }
    }
    ctx.restore();
    return;
  }

  const hh = hfs * 1.75;
  const sh = b.subtitle ? sfs * 1.85 : 0;
  const bh = hh + sh;
  const y = top ? m : H - tickerH - m - bh - (lift ? lift + H * 0.02 : 0);
  markZone(c, top, x, y, bw, bh);
  const tw = Math.max(bh * 1.25, ctx.measureText(tag).width + tfs * 2.2);
  const lw = b.logo ? bh * 1.25 : 0;
  const px = x + tw;
  const mw = bw - tw - lw;
  ctx.globalAlpha = Math.min(1, p * 1.5);
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowBlur = H * 0.025;
  ctx.beginPath();
  ctx.rect(x - 4, y - 4, (bw + 8) * e, bh + 8);
  ctx.clip();
  // tag
  ctx.fillStyle = '#d4142e';
  ctx.fillRect(x, y, tw, bh);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.globalAlpha = Math.min(1, p * 1.5) * (0.8 + 0.2 * Math.abs(Math.sin(performance.now() / 450)));
  ctx.fillText(tag, x + tw / 2, y + bh / 2 + tfs * 0.04);
  ctx.globalAlpha = Math.min(1, p * 1.5);
  ctx.textAlign = 'left';
  // manchete
  ctx.fillStyle = 'rgb(' + mix([14, 20, 40], bc, 0.12).map(Math.round).join(',') + ')';
  ctx.fillRect(px, y, mw + lw, hh);
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${hfs}px Outfit, Inter, sans-serif`;
  ctx.fillText(fitText(ctx, (b.title || '').toUpperCase(), mw - hfs * 0.9), px + hfs * 0.45, y + hh / 2 + hfs * 0.04);
  if (b.subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,.97)';
    ctx.fillRect(px, y + hh, mw + lw, sh);
    ctx.fillStyle = rgb(bc);
    ctx.fillRect(px, y + hh, Math.max(3, H * 0.006), sh);
    ctx.fillStyle = '#16161f';
    ctx.font = `700 ${sfs}px Inter, sans-serif`;
    ctx.fillText(fitText(ctx, b.subtitle, mw - hfs * 0.9), px + hfs * 0.45, y + hh + sh / 2 + sfs * 0.04);
  }
  if (lw) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + bw - lw, y, lw, bh);
    if (logo) {
      const pad = bh * 0.14;
      const s = Math.min((lw - pad * 2) / logo.naturalWidth, (bh - pad * 2) / logo.naturalHeight);
      ctx.drawImage(logo, x + bw - lw + (lw - logo.naturalWidth * s) / 2, y + (bh - logo.naturalHeight * s) / 2, logo.naturalWidth * s, logo.naturalHeight * s);
    }
  }
  ctx.restore();
}

function drawNews(c, b, bc, p, e, tickerH, lift) {
  if (b.look === 'hard') return drawHardNews(c, b, bc, p, e, tickerH, lift);
  const { ctx, W, H } = c;
  const pos = b.pos || 'bl';
  const m = H * 0.045;
  const nfs = H * 0.05;
  const rfs = H * 0.03;
  const cfs = H * 0.021;
  ctx.save();
  ctx.font = `800 ${nfs}px Outfit, Inter, sans-serif`;
  const nW = ctx.measureText(b.title || '').width;
  ctx.font = `600 ${rfs}px Inter, sans-serif`;
  const rW = b.subtitle ? ctx.measureText(b.subtitle).width : 0;
  const padX = nfs * 0.55;
  const nh = nfs * 1.7;
  const rh = b.subtitle ? rfs * 1.8 : 0;
  const bh = nh + rh;
  const logo = b.logo && c.image ? c.image(b.logo) : null;
  const lw = b.logo ? bh : 0; // caixa quadrada do logo
  const bw = Math.min(W * 0.8 - lw, Math.max(nW, rW) + padX * 2);
  const total = lw + bw;
  const x = pos.endsWith('c') ? (W - total) / 2 : pos.endsWith('r') ? W - m - total : m;
  const top = pos[0] === 't';
  const chipH = b.tag ? cfs * 2 : 0;
  const y = top ? m : H - tickerH - m - bh - (lift ? lift + H * 0.02 : 0);
  markZone(c, top, x, top ? y : y - chipH, total, bh + chipH);
  const fg = luminance(bc) > 0.6 ? '#111' : '#fff';
  ctx.globalAlpha = Math.min(1, p * 1.5);
  ctx.shadowColor = 'rgba(0,0,0,.45)';
  ctx.shadowBlur = H * 0.02;
  // revela da esquerda para a direita
  ctx.beginPath();
  ctx.rect(x - 4, Math.min(y, y - chipH) - 4, (total + 8) * e, bh + chipH + 8);
  ctx.clip();
  if (lw) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, lw, bh);
    ctx.shadowColor = 'transparent';
    if (logo) {
      const pad = bh * 0.14;
      const s = Math.min((lw - pad * 2) / logo.naturalWidth, (bh - pad * 2) / logo.naturalHeight);
      const dw = logo.naturalWidth * s;
      const dh = logo.naturalHeight * s;
      ctx.drawImage(logo, x + (lw - dw) / 2, y + (bh - dh) / 2, dw, dh);
    }
    ctx.fillStyle = rgb(mix(bc, [255, 255, 255], 0.25));
    ctx.fillRect(x + lw - Math.max(2, H * 0.004), y, Math.max(2, H * 0.004), bh);
  }
  ctx.shadowColor = lw ? 'transparent' : 'rgba(0,0,0,.45)';
  ctx.fillStyle = rgb(bc);
  ctx.fillRect(x + lw, y, bw, nh);
  ctx.shadowColor = 'transparent';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.font = `800 ${nfs}px Outfit, Inter, sans-serif`;
  ctx.fillText(fitText(ctx, b.title || '', bw - padX * 2), x + lw + padX, y + nh / 2 + nfs * 0.04);
  if (b.subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,.97)';
    ctx.fillRect(x + lw, y + nh, bw, rh);
    ctx.fillStyle = '#16161f';
    ctx.font = `600 ${rfs}px Inter, sans-serif`;
    ctx.fillText(fitText(ctx, b.subtitle, bw - padX * 2), x + lw + padX, y + nh + rh / 2 + rfs * 0.04);
  }
  if (b.tag) {
    const live = /vivo|urgente|plant|direto/i.test(b.tag);
    ctx.font = `800 ${cfs}px Inter, sans-serif`;
    const dot = live ? cfs * 1.1 : 0;
    const tw = ctx.measureText(b.tag).width + cfs * 1.5 + dot;
    const cy = top ? y + bh : y - chipH;
    ctx.fillStyle = live ? '#d4142e' : '#14141c';
    ctx.fillRect(x + lw, cy, tw, chipH);
    ctx.fillStyle = '#fff';
    if (live) {
      ctx.globalAlpha *= 0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 450));
      ctx.beginPath();
      ctx.arc(x + lw + cfs * 0.85, cy + chipH / 2, cfs * 0.28, 0, 7);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, p * 1.5);
    }
    ctx.fillText(b.tag, x + lw + cfs * 0.75 + dot, cy + chipH / 2 + cfs * 0.04);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
// Banners: estilos 'bar' | 'card' | 'clean' | 'center'; posições bl/bc/br/tl/tc/tr
// ---------------------------------------------------------------------
// GC montado no Template Studio: camadas em coordenadas de 1920×1080, escaladas para o canvas.
// Estilos de camada: rect, text, tag, image. Texto aceita {{name}}/{{role}}/{{tag}}/{{headline}}.
function drawCustom(c, b, bc, p, e, tickerH, lift) {
  const { ctx, W, H } = c;
  const data = b.data || {};
  const vertical = !!c.vertical || H > W;
  const sourceW = vertical ? 1080 : 1920;
  const sourceH = vertical ? 1920 : 1080;
  const layers = vertical && Array.isArray(b.verticalLayers) && b.verticalLayers.length ? b.verticalLayers : b.layers;
  const sx = W / sourceW;
  const sy = H / sourceH;
  const brand = `rgb(${bc[0]},${bc[1]},${bc[2]})`;
  const pick = (v) => (v === 'brand' ? brand : v || '#7c5cff');

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, e));
  ctx.translate(0, (1 - e) * H * 0.04 + (lift || 0));
  ctx.scale(sx, sy);

  for (const l of layers) {
    if (!l || l.hidden) continue;
    const x = Number(l.x) || 0;
    const y = Number(l.y) || 0;
    const w = Math.max(0, Number(l.w) || 0);
    const h = Math.max(0, Number(l.h) || 0);
    if (l.type === 'rect') {
      ctx.globalAlpha = Math.max(0, Math.min(1, e)) * (l.opacity ?? 1);
      ctx.fillStyle = pick(l.fill);
      const r = Math.max(0, Math.min(Number(l.radius) || 0, Math.min(w, h) / 2));
      if (r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
        ctx.fill();
      } else ctx.fillRect(x, y, w, h);
      continue;
    }
    if (l.type === 'text' || l.type === 'tag') {
      const raw = data[l.key] ?? l.text ?? '';
      const text = l.uppercase ? String(raw).toUpperCase() : String(raw);
      if (!text) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, e)) * (l.opacity ?? 1);
      let size = Number(l.size) || 32;
      const weight = l.weight || 700;
      ctx.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
      // auto-fit: reduz a fonte até caber na caixa (mín. 12 px), depois aplica reticências.
      const maxTextW = Math.max(10, w - (l.type === 'tag' ? size * 1.2 : 0));
      while (size > 12 && ctx.measureText(text).width > maxTextW) {
        size -= 2;
        ctx.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
      }
      ctx.textBaseline = 'middle';
      ctx.textAlign = l.align === 'center' ? 'center' : l.align === 'right' ? 'right' : 'left';
      const tx = l.align === 'center' ? x + w / 2 : l.align === 'right' ? x + w : x;
      if (l.type === 'tag') {
        const tw = Math.min(w, ctx.measureText(text).width + size * 1.2);
        ctx.fillStyle = pick(l.bg || '#ef4444');
        ctx.fillRect(x, y, tw, h);
        ctx.fillStyle = pick(l.color || '#fff');
        ctx.fillText(fitText(ctx, text, tw - size * 0.8), x + size * 0.55, y + h / 2 + size * 0.04);
      } else {
        ctx.fillStyle = pick(l.color || '#fff');
        const label = l.nowrap ? fitText(ctx, text, w) : fitText(ctx, text, w);
        ctx.fillText(label, tx, y + h / 2 + size * 0.04);
      }
      continue;
    }
    if (l.type === 'qr') {
      const url = String(data[l.key] || l.url || '').trim();
      if (!url) continue;
      const qr = renderQr({ url, useBrand: false, color: l.qrColor || '#ffffff', showTitle: false }, c.image);
      if (!qr) continue;
      ctx.globalAlpha = Math.max(0, Math.min(1, e)) * (l.opacity ?? 1);
      ctx.drawImage(qr, x, y, w, h);
      continue;
    }
    if (l.type === 'image') {
      const src = l.src === 'brand' ? data.logo : l.src || data.logo;
      const im = src && c.image ? c.image(src) : null;
      if (!im) continue;
      const s = Math.min(w / im.naturalWidth, h / im.naturalHeight);
      const dw = im.naturalWidth * s;
      const dh = im.naturalHeight * s;
      ctx.globalAlpha = Math.max(0, Math.min(1, e)) * (l.opacity ?? 1);
      ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }
  }
  ctx.restore();
}

export function drawBanner(c, color, now, tickerH, lift = 0) {
  const b = c.banner;
  c._bz = null;
  if (!b) return;
  const { ctx, W, H } = c;
  const DUR = 450;
  let p = Math.min(1, (now - b.t0) / DUR);
  if (b.hiding) {
    p = 1 - Math.min(1, (now - b.t1) / DUR);
    if (p <= 0) {
      c.banner = null;
      return;
    }
  }
  const e = ease(p);
  const bc = b.color ? hexToRgb(b.color) : color;
  if (b.style === 'custom' && Array.isArray(b.layers)) return drawCustom(c, b, bc, p, e, tickerH, lift);
  if (b.style === 'news') return drawNews(c, b, bc, p, e, tickerH, lift);
  const style = b.style || 'bar';
  const pos = b.pos || 'bl';
  const big = style === 'center';
  const m = H * 0.045;
  const tfs = H * (big ? 0.068 : 0.042);
  const sfs = H * (big ? 0.04 : 0.028);

  ctx.save();
  ctx.font = `800 ${tfs}px Outfit, Inter, sans-serif`;
  const tW = ctx.measureText(b.title || '').width;
  ctx.font = `500 ${sfs}px Inter, sans-serif`;
  const sW = b.subtitle ? ctx.measureText(b.subtitle).width : 0;
  const padX = tfs * 0.6;
  const w = Math.min(W * (big ? 0.7 : 0.82), Math.max(tW, sW) + padX * 2 + (style === 'card' ? tfs * 0.4 : 0));
  const th = tfs * 1.75;
  const sh = b.subtitle ? sfs * 1.9 : 0;
  const totalH = th + sh;
  const x = big || pos.endsWith('c') ? (W - w) / 2 : pos.endsWith('r') ? W - m - w : m;
  const top = pos[0] === 't';
  const y = big ? (H - totalH) / 2 : top ? m : H - tickerH - m - totalH - (lift ? lift + H * 0.02 : 0);
  if (!big) markZone(c, top, x, y, w, totalH + (style === 'clean' ? H * 0.014 : 0));
  const fg = luminance(bc) > 0.6 ? '#111' : '#fff';
  ctx.globalAlpha = Math.min(1, p * 1.5);
  ctx.shadowColor = 'rgba(0,0,0,.4)';
  ctx.shadowBlur = H * 0.025;
  ctx.textBaseline = 'middle';

  if (style === 'bar') {
    // revela da esquerda p/ direita
    ctx.beginPath();
    ctx.rect(x - 2, y - 2, (w + 4) * e, totalH + 4);
    ctx.clip();
    ctx.fillStyle = rgb(mix(bc, [255, 255, 255], 0.25));
    ctx.fillRect(x, y, tfs * 0.18, totalH);
    ctx.fillStyle = rgb(bc);
    roundRectPath(ctx, x + tfs * 0.18, y, w - tfs * 0.18, th, 0);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = fg;
    ctx.font = `800 ${tfs}px Outfit, Inter, sans-serif`;
    ctx.fillText(fitText(ctx, b.title || '', w - padX * 2), x + padX, y + th / 2 + tfs * 0.04);
    if (b.subtitle) {
      ctx.fillStyle = 'rgba(255,255,255,.96)';
      ctx.fillRect(x + tfs * 0.18, y + th, w - tfs * 0.18, sh);
      ctx.fillStyle = '#16161f';
      ctx.font = `500 ${sfs}px Inter, sans-serif`;
      ctx.fillText(fitText(ctx, b.subtitle, w - padX * 2), x + padX, y + th + sh / 2 + sfs * 0.04);
    }
  } else {
    ctx.translate(0, (1 - e) * H * 0.05 * (top ? -1 : 1));
    if (style === 'card') {
      roundRectPath(ctx, x, y, w, totalH, H * 0.022);
      ctx.fillStyle = 'rgba(14,14,22,.9)';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      roundRectPath(ctx, x, y, tfs * 0.22, totalH, H * 0.022);
      ctx.fillStyle = rgb(bc);
      ctx.fill();
      const tx = x + padX + tfs * 0.22;
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${tfs}px Outfit, Inter, sans-serif`;
      ctx.fillText(fitText(ctx, b.title || '', w - padX * 2 - tfs * 0.22), tx, y + th / 2 + tfs * 0.04);
      if (b.subtitle) {
        ctx.fillStyle = 'rgba(255,255,255,.78)';
        ctx.font = `500 ${sfs}px Inter, sans-serif`;
        ctx.fillText(fitText(ctx, b.subtitle, w - padX * 2 - tfs * 0.22), tx, y + th + sh / 2 - sfs * 0.2);
      }
    } else if (style === 'clean') {
      ctx.shadowColor = 'rgba(0,0,0,.85)';
      ctx.shadowBlur = H * 0.012;
      ctx.fillStyle = '#fff';
      ctx.font = `800 ${tfs}px Outfit, Inter, sans-serif`;
      ctx.textAlign = pos.endsWith('r') ? 'right' : pos.endsWith('c') ? 'center' : 'left';
      const tx = ctx.textAlign === 'right' ? x + w : ctx.textAlign === 'center' ? x + w / 2 : x;
      ctx.fillText(fitText(ctx, b.title || '', w), tx, y + th / 2);
      if (b.subtitle) {
        ctx.fillStyle = 'rgba(255,255,255,.88)';
        ctx.font = `500 ${sfs}px Inter, sans-serif`;
        ctx.fillText(fitText(ctx, b.subtitle, w), tx, y + th + sh / 2 - sfs * 0.2);
      }
      ctx.shadowColor = 'transparent';
      const lw = Math.min(w, Math.max(tW, sW)) * 0.45;
      ctx.fillStyle = rgb(bc);
      const lx = ctx.textAlign === 'right' ? x + w - lw : ctx.textAlign === 'center' ? x + w / 2 - lw / 2 : x;
      ctx.fillRect(lx, y + totalH + H * 0.006, lw, Math.max(3, H * 0.006));
    } else {
      // center: cartão grande no meio da tela
      const g = ctx.createLinearGradient(x, y, x + w, y + totalH);
      g.addColorStop(0, rgb(bc));
      g.addColorStop(1, rgb(mix(bc, [10, 10, 16], 0.55)));
      roundRectPath(ctx, x - padX * 0.3, y - th * 0.15, w + padX * 0.6, totalH + th * 0.3, H * 0.035);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.font = `800 ${tfs}px Outfit, Inter, sans-serif`;
      ctx.fillText(fitText(ctx, b.title || '', w - padX), x + w / 2, y + th / 2);
      if (b.subtitle) {
        ctx.fillStyle = fg === '#fff' ? 'rgba(255,255,255,.88)' : 'rgba(0,0,0,.75)';
        ctx.font = `500 ${sfs}px Inter, sans-serif`;
        ctx.fillText(fitText(ctx, b.subtitle, w - padX), x + w / 2, y + th + sh / 2 - sfs * 0.2);
      }
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
// Chat de redes sociais
// ---------------------------------------------------------------------

// Quebra a mensagem (texto + emotes) em linhas, medindo com a fonte atual.
function layoutMsg(c, msg, maxW, fs, maxLines) {
  const key = `${Math.round(maxW)}|${Math.round(fs)}|${maxLines}`;
  if (msg._lay && msg._lay.key === key) return msg._lay;
  const { ctx } = c;
  ctx.font = `600 ${fs}px Inter, sans-serif`;
  const ew = fs * 1.2;
  const space = ctx.measureText(' ').width;
  const lines = [[]];
  let x = 0;
  let truncated = false;
  const line = () => lines[lines.length - 1];
  const push = (it, w) => {
    if (x + w > maxW && line().length) {
      if (lines.length >= maxLines) {
        truncated = true;
        return false;
      }
      lines.push([]);
      x = 0;
    }
    line().push({ ...it, w, x });
    x += w;
    return true;
  };
  outer: for (const t of msg.tokens || []) {
    if (t.t === 'img') {
      if (!push({ k: 'e', src: t.src }, ew)) break;
      x += fs * 0.12;
      continue;
    }
    for (const part of String(t.v).split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        if (x > 0) x += space;
        continue;
      }
      const w = ctx.measureText(part).width;
      if (w > maxW) {
        for (const ch of part) if (!push({ k: 'w', v: ch }, ctx.measureText(ch).width)) break outer;
        continue;
      }
      if (!push({ k: 'w', v: part }, w)) break outer;
    }
  }
  if (truncated && line().length) {
    const last = line();
    const w = ctx.measureText('…').width;
    last.push({ k: 'w', v: '…', w, x: last[last.length - 1].x + last[last.length - 1].w + 2 });
  }
  const lay = { key, lines: lines.filter((l) => l.length), lh: fs * 1.32, fs };
  msg._lay = lay;
  return lay;
}

function drawLines(c, lay, x, y, color = '#f4f4fa') {
  const { ctx } = c;
  ctx.font = `600 ${lay.fs}px Inter, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  lay.lines.forEach((ln, i) => {
    const yy = y + i * lay.lh;
    for (const it of ln) {
      if (it.k === 'w') {
        ctx.fillStyle = color;
        ctx.fillText(it.v, x + it.x, yy + lay.lh / 2);
      } else {
        const img = c.socialImage(it.src);
        if (img) ctx.drawImage(img, x + it.x, yy + (lay.lh - it.w) / 2, it.w, it.w);
      }
    }
  });
}

function drawAvatar(c, msg, cx, cy, r, pc) {
  const { ctx } = c;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  const img = c.socialImage(msg.avatar);
  if (img && img.naturalWidth) {
    const s = Math.max((r * 2) / img.naturalWidth, (r * 2) / img.naturalHeight);
    const dw = img.naturalWidth * s;
    const dh = img.naturalHeight * s;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, rgb(mix(pc, [255, 255, 255], 0.15)));
    g.addColorStop(1, rgb(mix(pc, [10, 10, 16], 0.5)));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#fff';
    ctx.font = `800 ${r * 1.0}px Outfit, Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((String(msg.name || '?').trim()[0] || '?').toUpperCase(), cx, cy + r * 0.05);
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.strokeStyle = rgb(pc);
  ctx.stroke();
  ctx.restore();
}

function chip(c, text, x, y, h, bg, fg, fs) {
  const { ctx } = c;
  ctx.font = `800 ${fs}px Inter, sans-serif`;
  const w = ctx.measureText(text).width + h * 0.9;
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + h * 0.45, y + h / 2 + fs * 0.04);
  return w;
}

function drawFeatured(c, msg, p, tickerH, top, m, o) {
  const { ctx, W, H } = c;
  const e = ease(p);
  const pf = platformOf(msg.type);
  const pc = hexToRgb(pf.c);
  const fs = H * 0.036;
  const nfs = H * 0.029;
  const pad = H * 0.028;
  const showAv = o.avatars !== false;
  const av = showAv ? H * 0.105 : 0;
  const cardW = Math.min(W * 0.78, W - m * 2);
  const innerX = pad + H * 0.012 + (showAv ? av + pad * 0.9 : 0);
  const textW = cardW - innerX - pad;
  const lay = layoutMsg(c, msg, textW, fs, 4);
  const nameH = nfs * 1.7;
  const donH = msg.donation ? nfs * 1.9 : 0;
  const contentH = nameH + (donH ? donH + nfs * 0.3 : 0) + lay.lines.length * lay.lh;
  const h = Math.max(av, contentH) + pad * 2;
  const x = (W - cardW) / 2;
  const baseY = top ? m : H - tickerH - m - h;
  const y = baseY + (1 - e) * H * 0.07 * (top ? -1 : 1);

  ctx.save();
  ctx.globalAlpha = Math.min(1, p * 1.4);
  ctx.shadowColor = 'rgba(0,0,0,.5)';
  ctx.shadowBlur = H * 0.03;
  ctx.shadowOffsetY = H * 0.008;
  roundRectPath(ctx, x, y, cardW, h, H * 0.034);
  ctx.fillStyle = 'rgba(14,14,22,.92)';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save();
  ctx.clip();
  ctx.fillStyle = rgb(pc);
  ctx.fillRect(x, y, H * 0.012, h);
  ctx.restore();

  if (showAv) drawAvatar(c, msg, x + pad + H * 0.012 + av / 2, y + pad + av / 2, av / 2, pc);
  let ty = y + pad;
  const tx = x + innerX;
  // nome + plataforma
  ctx.font = `800 ${nfs}px Outfit, Inter, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = msg.color || '#fff';
  const nm = fitText(ctx, msg.name || 'Anônimo', textW * 0.6);
  ctx.fillText(nm, tx, ty + nameH / 2);
  const nw = ctx.measureText(nm).width;
  const chH = nfs * 1.25;
  const fgc = luminance(pc) > 0.6 ? '#111' : '#fff';
  let cx = tx + nw + nfs * 0.7;
  cx += chip(c, pf.l, cx, ty + (nameH - chH) / 2, chH, rgb(pc), fgc, nfs * 0.62) + nfs * 0.4;
  if (msg.membership) chip(c, String(msg.membership).slice(0, 20), cx, ty + (nameH - chH) / 2, chH, 'rgba(255,255,255,.14)', '#fff', nfs * 0.62);
  ty += nameH;
  if (msg.donation) {
    chip(c, `💰 ${String(msg.donation).slice(0, 24)}`, tx, ty, donH, '#f7c948', '#1a1300', nfs * 0.8);
    ty += donH + nfs * 0.3;
  }
  drawLines(c, lay, tx, ty);
  ctx.restore();
  return h * e;
}

function drawFeed(c, now, top, anchorY, m, o) {
  const S = c.social;
  if (!o.feedOn || !S.feed.length) return;
  const { ctx, W, H } = c;
  const ttl = (o.feedTtl || 0) * 1000;
  if (ttl) S.feed = S.feed.filter((it) => now - it.t0 < ttl + 100);
  const items = S.feed.slice(-Math.max(1, o.feedMax || 5));
  if (!items.length) return;
  const colW = W * 0.3;
  const fs = H * 0.026;
  const nfs = H * 0.022;
  const pad = H * 0.014;
  const showAv = o.avatars !== false;
  const av = showAv ? H * 0.05 : 0;
  const gap = H * 0.01;
  const textW = colW - pad * 2 - (showAv ? av + pad : 0);
  const rows = items.map((it) => {
    const lay = layoutMsg(c, it.msg, textW, fs, 3);
    const h = Math.max(av, nfs * 1.5 + lay.lines.length * lay.lh) + pad * 2;
    return { it, lay, h };
  });
  const total = rows.reduce((s, r) => s + r.h + gap, -gap);
  let y = top ? anchorY : anchorY - total;
  const x = m;
  for (const { it, lay, h } of rows) {
    const age = now - it.t0;
    const a = Math.min(1, age / 300) * (ttl ? Math.max(0, Math.min(1, (ttl - age) / 500)) : 1);
    if (a > 0) {
      const pc = hexToRgb(platformOf(it.msg.type).c);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate((1 - ease(Math.min(1, age / 300))) * -H * 0.05, 0);
      roundRectPath(ctx, x, y, colW, h, H * 0.022);
      ctx.fillStyle = 'rgba(14,14,22,.8)';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = rgb(pc);
      ctx.fillRect(x, y, H * 0.007, h);
      ctx.restore();
      let tx = x + pad + H * 0.004;
      if (showAv) {
        drawAvatar(c, it.msg, tx + av / 2, y + pad + av / 2, av / 2, pc);
        tx += av + pad;
      }
      ctx.font = `800 ${nfs}px Outfit, Inter, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = it.msg.color || rgb(mix(pc, [255, 255, 255], 0.5));
      ctx.fillText(fitText(ctx, it.msg.name || 'Anônimo', textW), tx, y + pad + nfs * 0.75);
      ctx.font = `600 ${fs}px Inter, sans-serif`;
      drawLines(c, lay, tx, y + pad + nfs * 1.5);
      ctx.restore();
    }
    y += h + gap;
  }
}

// Desenha o destaque e o feed. Retorna a altura ocupada na parte de baixo (para o banner subir e não sobrepor).
export function drawSocial(c, color, now, tickerH) {
  const S = c.social;
  if (!S) return 0;
  const o = S.opts;
  const { H } = c;
  const top = o.pos === 'top';
  const m = H * 0.04;
  let fh = 0;
  const f = S.featured;
  if (f) {
    const DUR = 420;
    let p = Math.min(1, (now - f.t0) / DUR);
    if (f.hiding) {
      p = 1 - Math.min(1, (now - f.t1) / DUR);
      if (p <= 0) {
        S.featured = null;
        p = 0;
      }
    }
    if (p > 0) fh = drawFeatured(c, f.msg, p, tickerH, top, m, o);
  }
  const gap = H * 0.02;
  const anchor = top ? m + (fh ? fh + gap : 0) : H - tickerH - m - (fh ? fh + gap : 0);
  drawFeed(c, now, top, anchor, m, o);
  return top ? 0 : fh;
}
