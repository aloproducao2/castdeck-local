// Comparativo de modelos/ajustes do worker de legenda: velocidade (ms por frase) e erro (WER) num WAV conhecido.
//   node test/caption-bench.mjs
// Usa os modelos baixados em build/tmp/caption-test/. Não é teste de regressão: serve para escolher os padrões.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const exe = path.resolve('build', 'vendor', 'win-x64', 'castdeck-caption.exe');
const dir = path.resolve('build', 'tmp', 'caption-test');
const REF = 'O jogo de ontem terminou dois a um para o Flamengo, com gol de Pedro aos quarenta e cinco minutos do segundo tempo. A previsão para amanhã em São Paulo é de chuva forte, com temperatura máxima de vinte e três graus. Hoje vamos conversar com a deputada Ana Júlia sobre o novo projeto de lei da educação.';
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
// números por extenso ou em algarismo contam igual
const NUM = { 1: 'um', 2: 'dois', 3: 'tres', 23: 'vinte e tres', 45: 'quarenta e cinco' };
const expand = (w) => w.flatMap((x) => (NUM[x] ? NUM[x].split(' ') : [x]));
function wer(ref, hyp) {
  const r = expand(norm(ref));
  const h = expand(norm(hyp));
  const d = Array.from({ length: r.length + 1 }, (_, i) => [i, ...Array(h.length).fill(0)]);
  for (let j = 1; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length][h.length] / r.length;
}
function run(model, wav, extra) {
  return new Promise((resolve) => {
    const pcm = fs.readFileSync(path.join(dir, wav)).subarray(44);
    const all = Buffer.concat([Buffer.alloc(16000), pcm, Buffer.alloc(64000)]);
    const p = spawn(exe, ['--model', path.join(dir, model), '--lang', 'pt', '--threads', '4', ...extra]);
    let buf = '';
    const finals = [];
    const ms = [];
    let lastPause = 0;
    const lat = [];
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const ev = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        if (ev.type === 'ready') {
          let off = 0;
          const iv = setInterval(() => {
            if (off >= all.length) {
              clearInterval(iv);
              p.stdin.end();
              return;
            }
            p.stdin.write(all.subarray(off, off + 3200));
            off += 3200;
          }, 100);
        } else if (ev.type === 'vad' && !ev.speech) lastPause = Date.now();
        else if (ev.type === 'final') {
          if (ev.text) finals.push(ev.text);
          ms.push(ev.ms);
          if (lastPause) lat.push(Date.now() - lastPause);
        }
      }
    });
    p.stderr.on('data', () => {});
    p.on('close', () => resolve({ text: finals.join(' '), ms: Math.round(ms.reduce((a, b) => a + b, 0) / (ms.length || 1)), lat: Math.round(lat.reduce((a, b) => a + b, 0) / (lat.length || 1)) }));
  });
}
const cases = [
  ['ggml-small-q8_0.bin', [], 'small q8_0 greedy (equil.)'],
  ['ggml-small-q8_0.bin', ['--beam', '3', '--ctx-min', '768'], 'small q8_0 beam3 (preciso)'],
  ['ggml-large-v3-turbo-q5_0.bin', ['--ctx-min', '768', '--partials', '0'], 'turbo q5_0 (só com GPU)'],
  ...(process.env.ALL ? [
    ['ggml-base-q5_1.bin', [], 'base q5_1 greedy'],
    ['ggml-small-q5_1.bin', [], 'small q5_1 greedy'],
    ['ggml-small-q5_1.bin', ['--beam', '3', '--ctx-min', '768'], 'small q5_1 beam3 ctx768'],
  ] : []),
];
const wavs = (process.env.WAVS || 'dificil.wav,dificil-ruido.wav').split(',');
for (const [m, extra, label] of cases) {
  if (!fs.existsSync(path.join(dir, m))) continue;
  for (const w of wavs) {
    const r = await run(m, w, extra);
    console.log(`${label.padEnd(26)} ${w.padEnd(18)} WER ${(wer(REF, r.text) * 100).toFixed(1).padStart(5)}%  ${String(r.ms).padStart(5)} ms/frase  ${String(r.lat).padStart(5)} ms após pausa`);
    if (process.env.SHOW) console.log('   ', r.text);
  }
}

