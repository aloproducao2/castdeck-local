// Teste do carimbo de falante na legenda (servidor): dica via WS de texto + partial/final.
// Uso: node test/caption-speaker.test.mjs
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CaptionService } from '../server/caption.js';

const sent = [];
const ws = new EventEmitter();
ws.send = (s) => sent.push(JSON.parse(s));
ws.readyState = 1;

const c = new CaptionService({ deps: { hasBundled: () => true, exists: () => true }, dataDir: process.env.TEMP });
c.cfg = { studioId: 's1', model: 'equilibrado', lang: 'pt', mode: 'orig' };
c.wanted = true;
c.handleStudio(ws);

// sem dica: não rotula
c.onEvent({ type: 'final', id: 'f0', text: 'sem nome', lang: 'pt' });
assert.equal(sent.at(-1).speaker, undefined, 'não deve rotular sem dica');

// dica de falante + partial/final
ws.emit('message', JSON.stringify({ type: 'speaker', id: 'guest:a', name: 'Ana', level: -18 }), false);
c.onEvent({ type: 'partial', id: 'p1', text: 'ola pessoal', lang: 'pt' });
c.onEvent({ type: 'final', id: 'f1', text: 'ola pessoal', lang: 'pt' });
const out = sent.filter((m) => (m.type === 'partial' || m.type === 'final') && ['p1', 'f1'].includes(m.id));
assert.deepEqual(out[0].speaker, { id: 'guest:a', name: 'Ana' });
assert.deepEqual(out[1].speaker, { id: 'guest:a', name: 'Ana' });
assert.equal(out[1].text, 'ola pessoal', 'texto não deve ser alterado pelo servidor');

// dica antiga (>1,2 s) expira
c.speaker.at = Date.now() - 2000;
c.onEvent({ type: 'final', id: 'f2', text: 'depois', lang: 'pt' });
assert.equal(sent.at(-1).speaker, undefined, 'dica antiga deve expirar');

// stop limpa tudo
c.stop();
assert.equal(c.speaker, null);
console.log('OK: caption speaker test');
