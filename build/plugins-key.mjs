// Gera (uma vez) o par de chaves Ed25519 do catálogo de plugins.
// Uso: node build/plugins-key.mjs
//   - grava a PRIVADA em deploy/plugins-sign-key.pem (nunca versionar; deploy/ é interno)
//   - imprime a PÚBLICA (base64) para colar em server/plugin-catalog.js (CATALOG_PUBKEY)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chavePublicaDe } from '../server/plugin-catalog.js';

const arquivo = path.join(process.cwd(), 'deploy', 'plugins-sign-key.pem');
if (fs.existsSync(arquivo)) {
  const pem = fs.readFileSync(arquivo, 'utf8');
  console.log('chave já existe:', arquivo);
  console.log('pública:', chavePublicaDe(pem));
  process.exit(0);
}
const { privateKey } = crypto.generateKeyPairSync('ed25519');
const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
fs.mkdirSync(path.dirname(arquivo), { recursive: true });
fs.writeFileSync(arquivo, pem, { mode: 0o600 });
console.log('chave privada gerada em', arquivo);
console.log('pública (cole em CATALOG_PUBKEY):');
console.log(chavePublicaDe(pem));
