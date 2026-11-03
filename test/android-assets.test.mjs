// Garante que o APK leva o painel Câmeras e NÃO leva o Replay & VAR (exclusivo do desktop).
// Usa os assets gerados pelo build-android; rode `npm run build:android` antes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const web = path.resolve('android/app/build/generated/castdeck-assets/web');
const read = (p) => fs.readFileSync(path.join(web, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(web, p));

assert.ok(fs.existsSync(web), 'assets web do Android não encontrados; rode npm run build:android');
assert.ok(exists('js/studio/camera-panel.js'), 'camera-panel.js deve estar no APK');
assert.match(read('js/studio/camera-panel.js'), /cameras|Ajustar|interface/i, 'painel Câmeras deve estar no APK');
assert.ok(exists('js/studio/whatsapp.js'), 'módulo WhatsApp deve estar no APK, mas o host Android não o expõe');
assert.equal(exists('replay.html'), false, 'replay.html NÃO deve existir no APK');
assert.equal(exists('js/replay.js'), false, 'js/replay.js NÃO deve existir no APK');
console.log('OK assets Android: Câmeras/WhatsApp presentes; Replay & VAR ausente');
