# Assinatura de código (Windows) — CastDeck Local

Este repositório é **AGPL-3.0** e os binários do CastDeck Local são assinados gratuitamente por um
programa para projetos de código aberto.

> **Free code signing provided by [SignPath.io](https://signpath.io), certificate by
> [SignPath Foundation](https://signpath.org).**

## Por que assinatura

O Windows (Defender/SmartScreen) trata binário sem assinatura como desconhecido: mostra “aplicativo não
reconhecido” e, em alguns casos, coloca o arquivo em quarentena. A assinatura Authenticode resolve a
identidade do arquivo e deixa a reputação acumular com o tempo.

## Papéis (política de assinatura)

| Papel | Responsável |
|---|---|
| Autor (commits no repositório) | Miguel Kallemback ([@miguelkallemback](https://github.com/miguelkallemback)) |
| Revisor (revisão do código do release) | Miguel Kallemback |
| Aprovador (aprova a requisição de assinatura no SignPath) | Miguel Kallemback |

- Todos os integrantes usam **MFA** no GitHub e no SignPath.
- A assinatura só acontece a partir do **workflow deste repositório** (`.github/workflows/sign-windows.yml`),
  em runner hospedado pelo GitHub — nenhuma máquina local assina releases públicas.
- Cada requisição de assinatura exige **aprovação manual** no SignPath antes de o binário ser assinado.

## Como o binário é produzido e assinado

1. O workflow `sign-windows` roda em `windows-2022` (GitHub-hosted).
2. Ele compila o executável (`npm ci` → `npm run build:exe`), o que gera `dist/CastDeck.exe`.
3. O artefato é enviado como **artifact do GitHub Actions** e submetido ao SignPath
   (`submit-signing-request`), que valida a origem e assina.
4. O artefato assinado volta para o workflow e é publicado (artifact do run / release).

## Verificar a assinatura

Windows (PowerShell):

```powershell
Get-AuthenticodeSignature .\CastDeck.exe | Format-List Status, SignerCertificate, TimeStamperCertificate
```

O `Status` deve ser **Valid** e o signatário deve ser a **SignPath Foundation** (o binário também pode ser
assinado com certificado da flue.live quando emitido). No Explorer: botão direito → Propriedades →
**Assinaturas digitais**.

## Licença e código-fonte

O nome CastDeck, o logo e a marca são reservados (ver `TRADEMARK.md`); o código é AGPL-3.0 (`LICENSE`).
O código-fonte do binário assinado é exatamente o do commit/tag indicado na release (`vX.Y.Z`).
