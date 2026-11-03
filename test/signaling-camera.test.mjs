// Contrato do estado de câmera usado pelo painel do host (Node) e que precisa ser espelhado no Android.
// Mantém um fixture explícito para comparar com SignalingHub.java quando o teste Java for adicionado.
import assert from 'node:assert/strict';
import { cleanState } from '../server/signaling.js';

const raw = {
  name: 'Celular da igreja',
  camOn: true,
  micOn: true,
  cam: true,
  camStreamId: 'stream-1',
  camCaps: {
    zoom: { min: 1, max: 4, step: 0.1 },
    iso: { min: 100, max: 3200, step: 1 },
    focusMode: ['continuous', 'manual'],
    torch: true,
    lixo: { min: 1, max: 2 },
  },
  camCtl: { zoom: 2, iso: 800, focusMode: 'manual', torch: true, lixo: 99 },
  camVideoDevices: [{ id: 'cam-traseira', label: 'Câmera traseira', extra: true }],
  camAudioDevices: [{ id: 'mic-1', label: 'Microfone 1' }],
  camVideoId: 'cam-traseira',
  camAudioId: 'mic-1',
  injected: 'não deve passar',
};

const out = cleanState(raw);
assert.equal(out.injected, undefined);
assert.equal(out.camCaps.lixo, undefined);
assert.equal(out.camCaps.torch, true);
assert.deepEqual(out.camCaps.zoom, { min: 1, max: 4, step: 0.1 });
assert.deepEqual(out.camCaps.focusMode, ['continuous', 'manual']);
assert.equal(out.camCtl.lixo, undefined);
assert.equal(out.camCtl.zoom, 2);
assert.equal(out.camCtl.focusMode, 'manual');
assert.equal(out.camCtl.torch, true);
assert.deepEqual(out.camVideoDevices, [{ id: 'cam-traseira', label: 'Câmera traseira' }]);
assert.deepEqual(out.camAudioDevices, [{ id: 'mic-1', label: 'Microfone 1' }]);
assert.equal(out.camVideoId, 'cam-traseira');
assert.equal(out.camAudioId, 'mic-1');

const empty = cleanState({ camCaps: 'inválido', camCtl: null, camVideoDevices: [null, { label: 'sem id' }] });
assert.equal(empty.camCaps, undefined);
assert.equal(empty.camCtl, undefined);
assert.deepEqual(empty.camVideoDevices, []);
console.log('OK contrato de estado de câmera (Node)');
