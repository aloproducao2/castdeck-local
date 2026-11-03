// Monta o MP4 do tutorial a partir dos frames do screencast (horário real de cada frame em frames.json).
// O screencast só manda frame quando a tela muda, então cada imagem dura até o próximo frame (concat demuxer).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DIR = 'D:/REA/build/tmp/tutorial';
const FR = path.join(DIR, 'frames');
// uso: node make-video.mjs [saida.mp4] [--music trilha.mp3]
const args = process.argv.slice(2);
const mi = args.indexOf('--music');
const MUSIC = mi >= 0 ? path.resolve(args.splice(mi, 2)[1]) : null;
const OUT = args[0] || path.join(DIR, MUSIC ? 'castdeck-tutorial-desktop-musica.mp4' : 'castdeck-tutorial-desktop.mp4');
const FFMPEG = 'D:/REA/build/vendor/win-x64/ffmpeg.exe';
const frames = JSON.parse(fs.readFileSync(path.join(FR, 'frames.json'), 'utf8'));
if (!frames.length) throw new Error('sem frames');

let txt = '';
for (let i = 0; i < frames.length; i++) {
  // última imagem fica 2 s; pausas maiores que 8 s (espera técnica) são encurtadas
  const d = i < frames.length - 1 ? Math.min((frames[i + 1].t - frames[i].t) / 1000, 8) : 2;
  txt += `file '${frames[i].f}'\nduration ${Math.max(d, 0.001).toFixed(3)}\n`;
}
txt += `file '${frames.at(-1).f}'\n`; // o concat ignora a duração do último item sem repetir
fs.writeFileSync(path.join(FR, 'list.txt'), txt);

const total = (frames.at(-1).t - frames[0].t) / 1000 + 2;
console.log('frames', frames.length, '≈', total.toFixed(1), 's');
// com música: a trilha entra no lugar do silêncio e some em 2 s no fim (para não terminar seca)
const audioIn = MUSIC ? ['-i', MUSIC] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'];
const audioFx = MUSIC ? ['-af', `afade=t=out:st=${Math.max(total - 2.8, 0).toFixed(2)}:d=2`, '-b:a', '192k'] : ['-b:a', '96k'];
const r = spawnSync(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt', ...audioIn,
  '-map', '0:v:0', '-map', '1:a:0',
  '-vf', 'scale=1920:1080:flags=lanczos,fps=30,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-c:a', 'aac', ...audioFx, '-shortest',
  '-movflags', '+faststart', OUT], { cwd: FR, stdio: ['ignore', 'inherit', 'pipe'] });
const err = r.stderr.toString();
if (r.status !== 0) { console.error(err.slice(-2000)); process.exit(1); }
console.log(err.split('\n').filter((l) => /^(frame=|video:)/.test(l.trim())).slice(-2).join('\n'));
console.log('OK', OUT, (fs.statSync(OUT).size / 1048576).toFixed(1), 'MB');
