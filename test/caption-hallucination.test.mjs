// Filtro anti-alucinação do Whisper (servidor): frases de chamada em música/ruído.
// Uso: node test/caption-hallucination.test.mjs
import assert from 'node:assert/strict';
import { CaptionService } from '../server/caption.js';

const c = new CaptionService({ deps: { hasBundled: () => true, exists: () => true }, dataDir: process.env.TEMP });
const drop = ['Se inscreva no canal', 'Inscreva-se no canal!', 'Obrigado por assistir', 'Legendas pela comunidade', 'Thank you for watching', 'Curta e compartilhe'];
const keep = ['Obrigado por assistir, pessoal!', 'Gol do Flamengo!', 'Vamos começar a live', 'Bem-vindos ao CastDeck'];
for (const t of drop) assert.equal(c.isHallucination(t), true, `deveria descartar: ${t}`);
for (const t of keep) assert.equal(c.isHallucination(t), false, `deveria manter: ${t}`);

// onEvent não deixa a alucinação chegar ao estúdio
const sent = [];
const ws = { send: (s) => sent.push(JSON.parse(s)), on() {}, readyState: 1 };
// handleStudio usa EventEmitter; testa direto o caminho de evento
c.cfg = { studioId: 's', model: 'equilibrado', lang: 'pt', mode: 'orig' };
c.onEvent({ type: 'partial', id: 1, text: 'Se inscreva no canal', lang: 'pt' });
c.onEvent({ type: 'final', id: 1, text: 'Se inscreva no canal', lang: 'pt' });
assert.equal(sent.filter((m) => m.type === 'partial' || m.type === 'final').length, 0, 'nada deve ser emitido');
console.log('OK: caption hallucination filter');
