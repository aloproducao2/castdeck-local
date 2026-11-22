import { Broadcast, PRESETS } from '../server/broadcast.js';
import { videoEncoderArgs } from '../server/ffmpeg.js';
import fs from 'node:fs';

let ok = true;
const check = (title, condition, info = '') => {
  if (!condition) ok = false;
  console.log(condition ? 'PASS' : 'FAIL', title, info ? `(${info})` : '');
};

console.log('=== TESTE: ESCOLHA DE BITRATE E ORDEM DAS ABAS ===');

// 1. Validar Broadcast com bitrate customizado (alta qualidade)
const mockStudio = { id: 's1', name: 'Estúdio Teste' };
const bDefault = new Broadcast({
  ffmpegPath: 'ffmpeg',
  recordingsDir: '.',
  studio: mockStudio,
  destinations: [],
  record: true,
  presetId: '1080p30',
  encoder: 'libx264',
});
check('Preset 1080p30 padrão tem 6000 kbps', bDefault.preset.videoKbps === 6000, `${bDefault.preset.videoKbps} kbps`);

const bCustom = new Broadcast({
  ffmpegPath: 'ffmpeg',
  recordingsDir: '.',
  studio: mockStudio,
  destinations: [],
  record: true,
  presetId: '1080p30',
  encoder: 'libx264',
  videoKbps: 12000,
});
check('Bitrate customizado de 12.000 kbps aceito no Broadcast', bCustom.preset.videoKbps === 12000, `${bCustom.preset.videoKbps} kbps`);

const args = videoEncoderArgs('libx264', bCustom.preset.videoKbps, 30);
check('Argumentos do FFmpeg aplicam -b:v 12000k', args.includes('-b:v') && args[args.indexOf('-b:v') + 1] === '12000k', args.join(' '));
check('Argumentos do FFmpeg aplicam -maxrate 12000k', args.includes('-maxrate') && args[args.indexOf('-maxrate') + 1] === '12000k');

// 2. Validar a organização das abas (por ids, robusto a renomeações de rótulo)
const studioCode = fs.readFileSync('public/js/studio/studio.js', 'utf8');
const intIdx = studioCode.indexOf("id: 'interaction'");
check('Grupo interaction encontrado no studio.js', intIdx !== -1);
if (intIdx !== -1) {
  const intBlock = studioCode.slice(intIdx, studioCode.indexOf("id: 'audience'", intIdx));
  check('Rótulo do grupo é "Interatividade"', intBlock.includes("label: 'Interatividade'"));
  check('Rótulo curto é "Interação"', intBlock.includes("short: 'Interação'"));
  for (const t of ["['widgets',", "['raffle',", "['messages',", "['whatsapp',", "['plugins',"]) {
    check(`Interação tem a aba ${t}`, intBlock.includes(t), t);
  }
}
const audIdx = studioCode.indexOf("id: 'audience'");
check('Grupo audience encontrado no studio.js', audIdx !== -1);
if (audIdx !== -1) {
  const audBlock = studioCode.slice(audIdx, studioCode.indexOf("id: 'director'", audIdx));
  check('Público não tem mais as enquetes', audBlock.indexOf("['widgets',") === -1);
  check('Público tem chat e social', audBlock.includes("['chat',") && audBlock.includes("['social',"));
}
// Nomes na tela / Espaçamento e cantos: em Configurar → Exibição (não mais na Marca)
check('Configurar tem a aba display (Exibição)', studioCode.includes("['display', 'Exibição'"));
const brandFn = studioCode.slice(studioCode.indexOf('function renderBrandPanel'), studioCode.indexOf('function renderDisplayPanel'));
check('Aba Marca não tem mais Nomes na tela', !brandFn.includes('<h4>Nomes na tela</h4>'));
check('renderDisplayPanel tem Nomes na tela e Espaçamento e cantos', /function renderDisplayPanel[\s\S]*<h4>Nomes na tela<\/h4>[\s\S]*<h4>Espaçamento e cantos<\/h4>/.test(studioCode));

// 3. Validar seletor de bitrate no painel de saída e no modal openGoLive
check('studio.js tem seletor #o-bitrate no painel de saída', studioCode.includes('id="o-bitrate"'));
check('studio.js tem seletor #gl-bitrate no modal openGoLive', studioCode.includes('id="gl-bitrate"'));
check('studio.js salva bitrate no studioBody', studioCode.includes('bitrate: S.bitrate'));

// 4. Validar i18n
const stringsJson = JSON.parse(fs.readFileSync('public/js/i18n/strings.json', 'utf8'));
check('strings.json tem tradução para "Pessoas"', !!stringsJson['Pessoas']);
check('strings.json tem tradução para "Interatividade"', !!stringsJson['Interatividade']);

console.log(ok ? '\nTODOS OS TESTES PASSARAM COM SUCESSO!' : '\nHOUVE FALHAS NOS TESTES.');
process.exit(ok ? 0 : 1);
