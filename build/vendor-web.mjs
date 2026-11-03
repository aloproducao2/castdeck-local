#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Copia para public/vendor/ os motores que rodam 100% local no navegador do estúdio:
//   - MediaPipe Tasks Vision (remoção/troca de fundo e rastreamento de rosto) + modelos .tflite
//   - RNNoise (redução de ruído por canal, roda num AudioWorklet)
// Uso: npm run vendor:web   (só precisa de internet na primeira vez, para baixar os modelos)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nm = (...p) => path.join(root, 'node_modules', ...p);
const out = (...p) => path.join(root, 'public', 'vendor', ...p);

const COPY = [
  [nm('@mediapipe', 'tasks-vision', 'vision_bundle.mjs'), out('mediapipe', 'vision_bundle.mjs')],
  // só a versão SIMD (todos os Chrome/Edge/WebView atuais suportam): economiza ~13 MB
  [nm('@mediapipe', 'tasks-vision', 'wasm', 'vision_wasm_internal.js'), out('mediapipe', 'vision_wasm_internal.js')],
  [nm('@mediapipe', 'tasks-vision', 'wasm', 'vision_wasm_internal.wasm'), out('mediapipe', 'vision_wasm_internal.wasm')],
  [nm('@jitsi', 'rnnoise-wasm', 'dist', 'rnnoise.wasm'), out('rnnoise', 'rnnoise.wasm')],
];
const MODELS = [
  ['https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite', out('mediapipe', 'selfie_segmenter.tflite')],
  ['https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite', out('mediapipe', 'blaze_face_short_range.tflite')],
];

for (const [from, to] of COPY) {
  if (!fs.existsSync(from)) { console.error(`Faltando ${from}. Rode "npm install".`); process.exit(1); }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`  copiado  ${path.relative(root, to)} (${(fs.statSync(to).size / 1048576).toFixed(1)} MB)`);
}
for (const [url, to] of MODELS) {
  if (fs.existsSync(to) && fs.statSync(to).size > 10000) { console.log(`  em cache ${path.relative(root, to)}`); continue; }
  const r = await fetch(url);
  if (!r.ok) { console.error(`Falha ao baixar ${url}: ${r.status}`); process.exit(1); }
  fs.writeFileSync(to, Buffer.from(await r.arrayBuffer()));
  console.log(`  baixado  ${path.relative(root, to)} (${(fs.statSync(to).size / 1024).toFixed(0)} KB)`);
}
fs.writeFileSync(out('LICENSES.txt'), 'MediaPipe Tasks Vision - Apache License 2.0 - https://github.com/google-ai-edge/mediapipe\nRNNoise (jitsi/rnnoise-wasm, xiph/rnnoise) - BSD-3-Clause / Apache-2.0\n');
console.log('Concluído.');
