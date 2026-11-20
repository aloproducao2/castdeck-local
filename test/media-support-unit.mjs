// Teste do detector de contêiner e do veredito de reprodução por navegador.
import { sniffContainer, containerFromMime, playsHere, inspectFile } from '../public/js/media-support.js';

let falhas = 0;
const ok = (nome, cond, info = '') => {
  if (!cond) falhas++;
  console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + info));
};
const bytes = (...b) => new Uint8Array(b);
const txt = (s, extra = []) => new Uint8Array([...s].map((c) => c.charCodeAt(0)).concat(extra));

// --- sniff ---
const mp4 = new Uint8Array(16);
mp4.set(txt('....ftypisom').slice(0, 12));
ok('MP4 (ftyp isom)', sniffContainer(mp4) === 'mp4');
const mov = new Uint8Array(16);
mov.set(txt('....ftypqt  ').slice(0, 12));
ok('MOV (ftyp qt)', sniffContainer(mov) === 'mp4');
const mkv = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...txt('B\x82\x88matroska')]);
ok('MKV', sniffContainer(mkv) === 'mkv');
const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...txt('B\x82\x84webm')]);
ok('WebM', sniffContainer(webm) === 'webm');
ok('AVI', sniffContainer(txt('RIFF....AVI ')) === 'avi');
ok('WAV', sniffContainer(txt('RIFF....WAVE')) === 'wav');
ok('WEBP', sniffContainer(txt('RIFF....WEBP')) === 'webp');
const ts = new Uint8Array(400);
ts[0] = 0x47;
ts[188] = 0x47;
ok('MPEG-TS', sniffContainer(ts) === 'ts');
ok('FLV', sniffContainer(txt('FLV\x01')) === 'flv');
ok('OGG', sniffContainer(txt('OggS\0')) === 'ogg');
ok('FLAC', sniffContainer(txt('fLaC')) === 'flac');
ok('MP3 (ID3)', sniffContainer(txt('ID3\x03')) === 'mp3');
ok('MP3 (frame)', sniffContainer(bytes(0xff, 0xfb, 0x90, 0x00)) === 'mp3');
ok('AAC (ADTS)', sniffContainer(bytes(0xff, 0xf1, 0x50, 0x80)) === 'aac');
ok('PNG', sniffContainer(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) === 'png');
ok('JPEG', sniffContainer(bytes(0xff, 0xd8, 0xff, 0xe0)) === 'jpeg');
ok('GIF', sniffContainer(txt('GIF89a')) === 'gif');
ok('desconhecido', sniffContainer(bytes(1, 2, 3, 4, 5, 6, 7, 8)) === 'unknown');
ok('mime de reserva', containerFromMime('video/x-matroska') === 'mkv');

// --- veredito por navegador (canPlayType simulado) ---
const chrome = (t) => (/(video\/mp4|video\/webm|audio\/mpeg|audio\/mp4|audio\/wav|audio\/ogg)/.test(t) ? 'probably' : '');
const safari = (t) => (/(video\/mp4|audio\/mp4|audio\/mpeg|audio\/wav)/.test(t) ? 'maybe' : '');
const semNada = () => '';

ok('MP4 toca no Chrome', playsHere('mp4', 'video', chrome) === 'maybe');
ok('MP4 toca no Safari', playsHere('mp4', 'video', safari) === 'maybe');
ok('MKV NÃO toca no Chrome', playsHere('mkv', 'video', chrome) === 'no');
ok('MKV NÃO toca no Safari', playsHere('mkv', 'video', safari) === 'no');
ok('AVI NÃO toca no Safari', playsHere('avi', 'video', safari) === 'no');
ok('WebM toca no Chrome', playsHere('webm', 'video', chrome) === 'maybe');
ok('WebM NÃO toca no Safari', playsHere('webm', 'video', safari) === 'no');
ok('OGG NÃO toca no Safari', playsHere('ogg', 'audio', safari) === 'no');
ok('MP3 toca no Safari', playsHere('mp3', 'audio', safari) === 'yes');
ok('sem suporte nenhum: MP4 vira no', playsHere('mp4', 'video', semNada) === 'no');
ok('imagem PNG toca sempre', playsHere('png', 'image', semNada) === 'yes');
ok('imagem desconhecida não', playsHere('unknown', 'image', semNada) === 'no');

// --- inspectFile com File falso (slice -> arrayBuffer) ---
const fakeFile = (nome, mime, head) => ({
  name: nome,
  type: mime,
  slice: () => ({ arrayBuffer: async () => head.buffer.slice(head.byteOffset, head.byteOffset + head.byteLength) }),
});
const r1 = await inspectFile(fakeFile('clipe.mkv', 'video/x-matroska', mkv), safari);
ok('inspectFile: MKV no Safari pede conversão', r1.container === 'mkv' && r1.veredito === 'no', JSON.stringify(r1));
const r2 = await inspectFile(fakeFile('festa.mp4', 'video/mp4', mp4), chrome);
ok('inspectFile: MP4 no Chrome passa', r2.container === 'mp4' && r2.veredito === 'maybe', JSON.stringify(r2));
const r3 = await inspectFile(fakeFile('foto.heic', 'image/heic', new Uint8Array([0, 0, 0, 1, 2, 3])), safari);
ok('inspectFile: HEIC cai em "no"', r3.veredito === 'no', JSON.stringify(r3));

console.log(falhas ? `\nMEDIA_SUPPORT_FAIL (${falhas})` : '\nMEDIA_SUPPORT_OK');
process.exit(falhas ? 1 : 0);
