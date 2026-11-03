// Teste do worker de legenda (Rust): toca um WAV 16 kHz mono em tempo real no stdin e mede a latência.
//   node test/caption-worker.test.mjs <modelo.bin> <fala.wav>
// Sem argumentos usa build/tmp/caption-test/ (modelo base-q5_1 + fala gerada pela voz Maria do Windows).
// Sai com código 0 se o texto final contiver palavras esperadas.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const exe = path.resolve('build', 'vendor', 'win-x64', 'castdeck-caption.exe');
const model = process.argv[2] || path.resolve('build', 'tmp', 'caption-test', 'ggml-base-q5_1.bin');
const wav = process.argv[3] || path.resolve('build', 'tmp', 'caption-test', 'fala.wav');
const expect = (process.env.EXPECT || 'programa,legenda').split(',');
if (!fs.existsSync(exe) || !fs.existsSync(model) || !fs.existsSync(wav)) {
  console.log('PULADO: falta worker, modelo ou WAV de teste');
  process.exit(0);
}
const pcm = fs.readFileSync(wav).subarray(44);
const silence = Buffer.alloc(16000 * 2 * 2);
const all = Buffer.concat([silence.subarray(0, 16000), pcm, silence]);
const p = spawn(exe, ['--model', model, '--lang', process.env.LANG_CC || 'pt', '--translate', process.env.TRANSLATE || '0', '--dual', process.env.DUAL || '0', '--threads', '4'], { stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
const finals = [];
let t0 = 0;
let lastSpeechEnd = 0;
p.stderr.on('data', () => {});
p.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const t = ((Date.now() - t0) / 1000).toFixed(2);
    if (ev.type === 'ready') {
      console.log('pronto; enviando áudio em tempo real…');
      t0 = Date.now();
      send();
    } else if (ev.type === 'vad') {
      if (!ev.speech) lastSpeechEnd = Date.now();
      console.log(`[${t}s] vad ${ev.speech ? 'fala' : 'pausa'} #${ev.id}`);
    } else if (ev.type === 'partial') console.log(`[${t}s] parcial #${ev.id} (${ev.ms} ms): ${ev.text}`);
    else if (ev.type === 'final') {
      const lat = lastSpeechEnd ? Date.now() - lastSpeechEnd : 0;
      console.log(`[${t}s] FINAL #${ev.id} (${ev.ms} ms, ${lat} ms após a pausa): ${ev.text}`);
      if (ev.text) finals.push(ev.text);
    } else console.log(line);
  }
});
function send() {
  const chunk = 3200; // 100 ms
  let off = 0;
  const iv = setInterval(() => {
    if (off >= all.length) {
      clearInterval(iv);
      p.stdin.end();
      return;
    }
    p.stdin.write(all.subarray(off, off + chunk));
    off += chunk;
  }, 100);
}
p.on('close', (code) => {
  const text = finals.join(' ').toLowerCase();
  const ok = expect.every((w) => text.includes(w.toLowerCase()));
  console.log(`\nworker saiu (${code}). Texto: ${text}`);
  console.log(ok ? 'Tudo OK' : `FALHA: esperado conter ${expect.join(', ')}`);
  process.exit(ok ? 0 : 1);
});

