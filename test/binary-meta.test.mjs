// Garante que o binário Windows publicado tem cara de CastDeck (VERSIONINFO) e informa o estado da
// assinatura. Roda só quando dist/CastDeck.exe existe (senão passa): é guarda de release, não de CI puro.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const EXE = 'dist/CastDeck.exe';
let falhas = 0;
const ok = (nome, cond, info = '') => {
  if (!cond) falhas++;
  console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + info));
};

if (!fs.existsSync(EXE)) {
  console.log('OK   (sem dist/CastDeck.exe: nada a conferir)');
  console.log('\nBINARIO_OK');
  process.exit(0);
}

if (process.platform !== 'win32') {
  console.log('OK   (fora do Windows: VERSIONINFO não é verificável aqui)');
  process.exit(0);
}

// 1) VERSIONINFO do executável que o usuário baixa
const vi = spawnSync(
  'powershell',
  [
    '-NoProfile',
    '-Command',
    `$v = (Get-Item -LiteralPath '${EXE}').VersionInfo; "$($v.FileDescription)|$($v.CompanyName)|$($v.ProductName)|$($v.FileVersion)|$($v.LegalCopyright)"`,
  ],
  { encoding: 'utf8', windowsHide: true },
).stdout.trim();
const [desc, empresa, produto, versao, copyright] = vi.split('|');
ok('tem FileDescription', desc === 'CastDeck Local', desc);
ok('tem editor (CompanyName)', /flue\.live/.test(empresa || ''), empresa);
ok('tem ProductName', produto === 'CastDeck Local', produto);
ok('tem versão em 4 partes', /^\d+\.\d+\.\d+\.\d+$/.test(versao || ''), versao);
ok('tem copyright/licença', /Copyright/i.test(copyright || ''), copyright);

// 2) assinatura: hoje pode não existir (sem certificado), mas o release deve saber disso
const sig = spawnSync(
  'powershell',
  ['-NoProfile', '-Command', `(Get-AuthenticodeSignature -LiteralPath '${EXE}').Status`],
  { encoding: 'utf8', windowsHide: true },
).stdout.trim();
const assinado = /Valid/i.test(sig);
console.log(`${assinado ? 'OK   ' : 'AVISO'} assinatura Authenticode: ${sig || 'desconhecida'}`);
if (!assinado) console.log('       → sem certificado o antivírus/SmartScreen continuam reclamando (docs/ai/WINDOWS-ANTIVIRUS-ASSINATURA.md)');

console.log(falhas ? `\nBINARIO_FAIL (${falhas})` : '\nBINARIO_OK');
process.exit(falhas ? 1 : 0);
