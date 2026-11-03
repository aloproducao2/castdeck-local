// SPDX-License-Identifier: AGPL-3.0-only
// Teste unitário de garantia de no mínimo 128 kbps de áudio no RTMP
import assert from 'node:assert';
import { PRESETS, Broadcast } from '../server/broadcast.js';

console.log('Testando presets de áudio RTMP...');
for (const [name, preset] of Object.entries(PRESETS)) {
  assert(preset.audioKbps >= 128, `Preset ${name} deve ter audioKbps >= 128, tem ${preset.audioKbps}`);
}
console.log('OK - Todos os presets têm no mínimo 128k de áudio');

// Testando que mesmo com audioKbps baixo passado manualmente, Broadcast força no mínimo 128
const fakeStudio = { id: 'test-studio', name: 'Test' };
const bc = new Broadcast({
  ffmpegPath: 'ffmpeg',
  recordingsDir: 'tmp',
  studio: fakeStudio,
  destinations: [{ id: 'd1', name: 'Dest', url: 'rtmp://example.com/live/key' }],
  record: false,
  presetId: '720p30',
  audioKbps: 64, // pede 64 propositalmente
});

assert(bc.preset.audioKbps >= 128, `audioKbps deve ser no mínimo 128, ficou ${bc.preset.audioKbps}`);
console.log('OK - Broadcast limitou audioKbps de 64 para:', bc.preset.audioKbps);

console.log('Tudo certo no teste de áudio RTMP!');
