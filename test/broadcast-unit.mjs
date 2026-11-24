// Regressão do bug que derrubava o "Entrar ao vivo": a Broadcast recebia videoKbps mas o
// construtor usava um parâmetro truncado (deoKbps) e estourava "videoKbps is not defined".
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Broadcast } from '../server/broadcast.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-bc-'));
const base = {
  ffmpegPath: 'ffmpeg',
  recordingsDir: () => dir,
  studio: { id: 's1', name: 'Teste' },
  destinations: [],
  record: true,
  presetId: '1080p30',
  encoder: 'libx264',
  inputMime: 'video/webm',
  vertical: false,
};
let falhou = false;
const ok = (nome, cond, info = '') => { if (!cond) falhou = true; console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + String(info))); };

try {
  const bc = new Broadcast({ ...base, videoKbps: 5000 });
  ok('constrói com videoKbps customizado', bc.preset.videoKbps === 5000, bc.preset.videoKbps);
  ok('preset 1080p30 aplicado', bc.preset.width === 1920 && bc.preset.height === 1080, JSON.stringify(bc.preset));
  const bc2 = new Broadcast({ ...base });
  ok('sem videoKbps usa o padrão do preset', bc2.preset.videoKbps === 6000, bc2.preset.videoKbps);
  const bc3 = new Broadcast({ ...base, videoKbps: 10 });
  ok('bitrate inválido cai no padrão', bc3.preset.videoKbps === 6000, bc3.preset.videoKbps);
  const bc4 = new Broadcast({ ...base, videoKbps: 9000, presetId: '720p60' });
  ok('preset 720p60 com bitrate customizado', bc4.preset.videoKbps === 9000, bc4.preset.videoKbps);
  ok('status inicial', bc.status().isRecording === true && bc.status().isStreaming === false, JSON.stringify(bc.status()));
} catch (e) {
  falhou = true;
  console.log('ERRO:', e.message);
} finally {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
console.log(falhou ? '\nBROADCAST_UNIT_FAIL' : '\nBROADCAST_UNIT_OK');
process.exit(falhou ? 1 : 0);
