// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
//
// Gera o "pacote" para relatar falso positivo de antivírus: nome, tamanho e SHA-256 dos binários da
// versão atual + texto pronto para colar nos formulários (Microsoft WDSI e fabricantes de AV).
//
// Uso: node build/av-report.mjs [--out arquivo.md]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const versao = pkg.version;
const alvos = [
  ['Windows (portátil)', `dist/CastDeck.exe`],
  ['Windows (instalador)', `dist/installer/CastDeck-Setup-${versao}.exe`],
  ['Windows (release)', `landpage/downloads/${versao}/CastDeck-${versao}-windows-x64.exe`],
  ['Windows (instalador release)', `landpage/downloads/${versao}/CastDeck-Setup-${versao}.exe`],
  ['Android', `landpage/downloads/${versao}/CastDeck-${versao}-android-arm64.apk`],
  ['Linux x64', `landpage/downloads/${versao}/CastDeck-${versao}-linux-x64`],
  ['Linux arm64', `landpage/downloads/${versao}/CastDeck-${versao}-linux-arm64`],
  ['macOS arm64', `landpage/downloads/${versao}/CastDeck-${versao}-macos-arm64`],
  ['macOS x64', `landpage/downloads/${versao}/CastDeck-${versao}-macos-x64`],
];

const linhas = [];
for (const [rotulo, rel] of alvos) {
  if (!fs.existsSync(rel)) continue;
  const buf = fs.readFileSync(rel);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  linhas.push({ rotulo, rel, bytes: buf.length, mb: (buf.length / 1048576).toFixed(1), sha });
}

const texto = `# Falso positivo de antivírus — CastDeck Local ${versao}

Gerado em ${new Date().toISOString().slice(0, 10)}. Use este arquivo para abrir chamados nos antivírus
(comece pela Microsoft) e para responder usuários que tiveram o download bloqueado.

## O que é o produto

CastDeck Local é um estúdio de transmissão ao vivo **local** (AGPL-3.0, código em
https://github.com/aloproducao2/castdeck-local). Não instala serviço, não abre portas para fora, não coleta
dados: sobe um servidor HTTP em 127.0.0.1 para a interface e usa FFmpeg/MediaMTX embutidos para o streaming.

- Site oficial: https://cast.flue.live
- Download: https://cast.flue.live/downloads.html
- SHA-256 publicado: nesta página (coluna de integridade)
- Assinatura de código: ainda não temos certificado pago; por isso o Windows mostra "editor desconhecido".

## Arquivos desta versão

${linhas.map((l) => `- **${l.rotulo}** — \`${path.basename(l.rel)}\` · ${l.mb} MB\n  SHA-256: \`${l.sha}\``).join('\n')}

## Texto para colar no formulário (Microsoft WDSI)

> Este arquivo é o instalador/portátil de um software de código aberto (AGPL-3.0) chamado CastDeck Local,
> um estúdio de transmissão ao vivo que roda 100% na máquina do usuário. Ele não instala serviços, não
> persiste em segundo plano além do próprio aplicativo e não faz comunicação com servidores nossos.
> O executável é um auto-extraível (Node.js embutido via pkg) que grava o servidor local em
> %LOCALAPPDATA%\\CastDeck\\app\\<versão>\\castdeck-server.exe e o executa — comportamento esperado do
> produto. Código-fonte: https://github.com/aloproducao2/castdeck-local (commit da versão na tag v${versao}).
> SHA-256 do arquivo: <cole o hash acima>. Pedimos a revisão da classificação como falso positivo.

## Onde abrir o chamado

| Fabricante | Formulário |
|---|---|
| Microsoft (Defender/SmartScreen) | <https://www.microsoft.com/en-us/wdsi/filesubmission> |
| Kaspersky | <https://opentip.kaspersky.com/> (aba "Report false detection") |
| Avast / AVG | <https://www.avast.com/false-positive-file-form> |
| ESET | <https://www.eset.com/int/support/false-positive/> |
| Bitdefender | <https://www.bitdefender.com/consumer/support/answer/29358/> |
| Sophos | <https://support.sophos.com/support/s/> (caso "false positive") |
| McAfee | <https://www.mcafee.com/support/> (false positive) |

## Dicas

- Envie o **instalador** e o **portátil** — a classificação costuma ser por hash de arquivo.
- Enquanto espera, oriente o usuário a restaurar da quarentena e adicionar a pasta nas exclusões
  (passo a passo em https://cast.flue.live/downloads.html#aviso-antivirus).
- Ao comprar um certificado de code signing, este documento serve de base para o SmartScreen também.
`;

const iOut = process.argv.indexOf('--out');
const destino = iOut >= 0 ? process.argv[iOut + 1] : `docs/ai/FALSO-POSITIVO-${versao}.md`;
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, texto, 'utf8');
console.log(`arquivos analisados: ${linhas.length}`);
for (const l of linhas) console.log(`  ${l.rotulo}: ${l.mb} MB  ${l.sha.slice(0, 16)}…`);
console.log(`\nrelatório: ${destino}`);
