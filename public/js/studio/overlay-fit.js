// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Encaixe de overlays no quadro de saída (16:9 ou 9:16) sem distorcer: mesma proporção preenche o quadro,
// proporção diferente é reduzida por inteiro e centralizada (letterbox), nunca esticada.
export function ajustarOverlay(largura, altura, W, H) {
  const iw = Number(largura) || 0;
  const ih = Number(altura) || 0;
  if (!(iw > 0) || !(ih > 0)) return { x: 0, y: 0, w: W, h: H, cheio: true };
  const mesma = Math.abs(iw / ih - W / H) < 0.02; // tolerância de 2% (arredondamento de exportação)
  if (mesma) return { x: 0, y: 0, w: W, h: H, cheio: true };
  const escala = Math.min(W / iw, H / ih);
  const w = iw * escala;
  const h = ih * escala;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h, cheio: false };
}
