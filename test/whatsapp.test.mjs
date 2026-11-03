// Testa o pipeline de mídia do bridge local sem conectar ao WhatsApp:
// mensagem de áudio -> download simulado -> arquivo em data/whatsapp/media -> URL no /api/whatsapp/status.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WhatsAppService } from '../server/whatsapp.js';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'castdeck-wa-test-'));
const wa = new WhatsAppService({ dataDir: dir });
await wa.init();
wa.downloadMedia = async () => Buffer.from('OggS fake audio payload');
wa.sock = null;

const msg = {
  key: { id: 'wamid-TEST-1', remoteJid: '5521999999999@s.whatsapp.net', fromMe: false },
  pushName: 'Maria',
  messageTimestamp: 1760000000,
  message: {
    audioMessage: {
      mimetype: 'audio/ogg; codecs=opus',
      seconds: 7,
      fileLength: 22,
    },
  },
};
await wa.ingestMessage(msg);
const info = wa.info();
const m = info.messages.find((x) => x.id === 'wamid-TEST-1');
assert.ok(m, 'mensagem de áudio deve entrar no estado');
assert.equal(m.audio, true);
assert.equal(m.kind, 'audio');
assert.equal(m.dur, 7);
assert.match(m.mediaUrl, /^\/api\/whatsapp\/media\//);
const media = wa.media(m.id);
assert.ok(media?.file, 'arquivo de mídia deve existir');
assert.equal(media.mime, 'audio/ogg');
assert.equal(await fs.readFile(media.file, 'utf8'), 'OggS fake audio payload');

// idempotência: a mesma mensagem não duplica
await wa.ingestMessage(msg);
assert.equal(wa.messages.filter((x) => x.id === 'wamid-TEST-1').length, 1);
const mediaPath = media.file;
await wa.clear();
assert.equal(wa.messages.length, 0, 'limpar deve zerar as mensagens');
assert.equal(wa.media(m.id), null, 'limpar deve remover a mídia');
await assert.rejects(fs.access(mediaPath), 'arquivo de mídia deve ser apagado');
console.log('OK WhatsApp: estado, áudio, mídia, URL, deduplicação e limpeza');

await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
