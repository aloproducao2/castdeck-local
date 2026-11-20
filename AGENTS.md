# AGENTS.md — CastDeck Local

Estúdio de transmissão ao vivo **100% local** (Node 20+/22 + front-end em JS puro), com convidados por WebRTC,
multistream, replays, GCs, plugins e app Android.

## Como rodar e testar

```bash
npm install
npm run test:unit        # unidade (replay, rede, updater, signaling, segurança, whatsapp, mídia, SoC)
npm run test:plugins     # plugins: unidade, e2e, UI, catálogo e revogação
node server/index.js     # sobe o servidor local (porta 3000, ou a próxima livre)
```

Testes de navegador usam Edge/Chrome com CDP (veja `test/ui-e2e.mjs`). Windows é a plataforma principal;
Linux/macOS são suportados.

## Regras do código

- Código e comentários em **PT-BR**; UI em PT-BR com i18n completo em **5 idiomas** (`public/js/i18n/strings.json`).
- Nada de framework no front (`public/js/studio/*` é JS puro com módulos ESM).
- O app é **AGPL-3.0** com licença comercial (ver `COMMERCIAL-LICENSE.md`); contribuições exigem CLA.
- Segurança: o servidor escuta só local (`localOnly`), com validação de origem e segredos cifrados.
- Não adicione dependência pesada sem justificar; o executável é único e grande de propósito.

## Plugins (2.0)

O CastDeck tem plugins gratuitos com catálogo assinado. **Plugins de terceiros vivem no repositório
`castdeck-local-plugins`** — aqui o código é só do app.

- Guia do autor: [`docs/PLUGINS-DEV.md`](docs/PLUGINS-DEV.md)
- Contrato para IA/agente: [`docs/PLUGINS-AGENTES.md`](docs/PLUGINS-AGENTES.md)
- Catálogo (índice assinado): https://cast.flue.live/plugins/index.json
- Ponto de entrada para agentes: https://cast.flue.live/plugins/AGENTS.md

Ciclo de autoria (API local do app ou MCP): `docs → scaffold → write → validate → simulate → install`.
Regras rígidas: sem binários no pacote; sem `child_process`/`fs`/`net` no código do plugin; rede só em
`network:<host>` declarado; permissões aprovadas pelo usuário; sem `eval`.

## Onde não mexer sem pedir

- `landpage/`, `deploy/` e `docs/ai` **não** estão neste repositório (são internos).
- Não publique binários de terceiros nem dados de usuários.
