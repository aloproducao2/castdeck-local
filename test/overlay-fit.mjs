// Encaixe de overlay: mesma proporção preenche; proporção diferente é centralizada sem esticar.
import { ajustarOverlay } from '../public/js/studio/overlay-fit.js';

let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + JSON.stringify(i)));
};
const perto = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;

// 16:9 no quadro 16:9 → ocupa tudo
let r = ajustarOverlay(1920, 1080, 1920, 1080);
ok('16:9 no 16:9 preenche', r.cheio && r.w === 1920 && r.h === 1080 && r.x === 0 && r.y === 0, r);

// 16:9 no quadro vertical 9:16 → largura cheia, altura proporcional, centralizado (nada de esticar)
r = ajustarOverlay(1920, 1080, 720, 1280);
ok('16:9 no 9:16 não distorce', perto(r.w, 720) && perto(r.h, 405) && perto(r.x, 0) && perto(r.y, (1280 - 405) / 2), r);
ok('16:9 no 9:16 mantém a proporção', perto(r.w / r.h, 1920 / 1080, 0.01), r.w / r.h);

// 9:16 no quadro vertical → preenche
r = ajustarOverlay(1080, 1920, 720, 1280);
ok('9:16 no 9:16 preenche', r.cheio && r.w === 720 && r.h === 1280, r);

// 9:16 no 16:9 → centralizado sem esticar
r = ajustarOverlay(1080, 1920, 1920, 1080);
ok('9:16 no 16:9 centraliza', perto(r.h, 1080) && perto(r.w, 607.5) && perto(r.x, (1920 - 607.5) / 2) && perto(r.y, 0), r);

// quadrado no vertical → centralizado nos dois eixos
r = ajustarOverlay(1080, 1080, 720, 1280);
ok('quadrado no vertical centraliza', perto(r.w, 720) && perto(r.h, 720) && perto(r.x, 0) && perto(r.y, 280), r);

// formatos estranhos e dados inválidos não quebram
ok('dimensão inválida vira quadro cheio', ajustarOverlay(0, 0, 720, 1280).cheio === true, ajustarOverlay(0, 0, 720, 1280));
ok('dimensão ausente vira quadro cheio', ajustarOverlay(undefined, undefined, 720, 1280).cheio === true);

// nunca passa do quadro (clamp por contain)
for (const [iw, ih] of [[4000, 100], [100, 4000], [1920, 1080], [1080, 1920]]) {
  const q = ajustarOverlay(iw, ih, 720, 1280);
  ok(`contain ${iw}x${ih} dentro do quadro`, q.w <= 720 + 0.01 && q.h <= 1280 + 0.01 && q.x >= -0.01 && q.y >= -0.01, q);
}

console.log(falhas ? `\nOVERLAY_FIT_FAIL (${falhas})` : '\nOVERLAY_FIT_OK');
process.exit(falhas ? 1 : 0);
