// Regressão: o áudio inteligente precisa abaixar também Browser (e aba/tela), inclusive quando o
// canal de áudio registra o id completo com sufixo ":audio" no stageKey.
import { DUCK_KINDS, duckSourceOf, isDuckChannel } from '../public/js/studio/autoswitch.js';

let falhou = false;
const ok = (nome, cond, info = '') => { if (!cond) falhou = true; console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + String(info))); };

const S = {
  sources: new Map([
    ['browser:abc', { id: 'browser:abc', kind: 'browser', label: 'Browser' }],
    ['media:1', { id: 'media:1', kind: 'media', label: 'Vídeo' }],
    ['guest:2:screen', { id: 'guest:2:screen', kind: 'screen', label: 'Tela' }],
    ['host:cam', { id: 'host:cam', kind: 'camera', label: 'Host' }],
  ]),
};

ok('browser está nos tipos que abaixam', DUCK_KINDS.has('browser'), [...DUCK_KINDS].join(','));
ok('mídia/tela no ducking', DUCK_KINDS.has('media') && DUCK_KINDS.has('screen'));

const br = duckSourceOf(S, { id: 'browser:abc:audio', stageKey: 'browser:abc' });
ok('resolve browser pelo stageKey', br?.kind === 'browser', JSON.stringify(br));
const br2 = duckSourceOf(S, { id: 'browser:abc:audio' });
ok('resolve browser só pelo id com :audio', br2?.kind === 'browser', JSON.stringify(br2));
const sc = duckSourceOf(S, { id: 'guest:2:screen:audio', stageKey: 'guest:2:screen:audio' });
ok('resolve aba/tela com stageKey = id:audio', sc?.kind === 'screen', JSON.stringify(sc));
const cam = duckSourceOf(S, { id: 'host:mic', stageKey: 'host:cam' });
ok('resolve pessoa (host) para voz', cam?.kind === 'camera', JSON.stringify(cam));

ok('browser entra no ducking', isDuckChannel(S, { id: 'browser:abc:audio', stageKey: 'browser:abc' }) === true);
ok('mídia entra no ducking', isDuckChannel(S, { id: 'media:1:audio', stageKey: 'media:1' }) === true);
ok('tela/aba entra no ducking', isDuckChannel(S, { id: 'guest:2:screen:audio', stageKey: 'guest:2:screen:audio' }) === true);
ok('pessoa NÃO entra no ducking', isDuckChannel(S, { id: 'host:mic', stageKey: 'host:cam' }) === false);
ok('fallback de browser sem fonte no mapa', isDuckChannel({ sources: new Map() }, { id: 'browser:xyz:audio' }) === true);

console.log(falhou ? '\nDUCK_BROWSER_FAIL' : '\nDUCK_BROWSER_OK');
process.exit(falhou ? 1 : 0);
