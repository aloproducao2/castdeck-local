# Plugins

Os plugins do CastDeck **não moram neste repositório**. O catálogo oficial (plugins gratuitos, código dos
oficiais, schema, CLI de autoria, servidor MCP e CI que assina o índice) fica em:

**https://github.com/aloproducao2/castdeck-local-plugins**

Aqui no repositório do app você encontra:

- o **sistema de plugins** (`server/plugin-*.js`, `public/js/studio/plugins.js`);
- o **guia do autor**: [`docs/PLUGINS-DEV.md`](../docs/PLUGINS-DEV.md);
- o **contrato para IA/agente**: [`docs/PLUGINS-AGENTES.md`](../docs/PLUGINS-AGENTES.md);
- o catálogo publicado: https://cast.flue.live/plugins/index.json (índice assinado com Ed25519);
- a página pública: https://cast.flue.live/plugins.html

## Por que separado

- o catálogo é **dado** (manifesto + pacotes assinados), não código do app;
- o app continua pequeno e o catálogo evolui no seu próprio ritmo (PR + CI);
- quem cria plugin não precisa compilar o CastDeck.

Se você quer **criar um plugin**, comece por https://cast.flue.live/plugins/AGENTS.md.
