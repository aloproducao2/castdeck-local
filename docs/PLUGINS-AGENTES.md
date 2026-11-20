# Plugins para IAs e agentes — contrato de autoria

> **Público:** modelos de linguagem e agentes autônomos que vão **criar plugins** para o CastDeck Local.
> **Como usar:** leia este arquivo, chame as ferramentas (API local ou MCP) e itere até `validate` + `simulate`
> passarem. Não precisa de interface gráfica, nem de aprovação humana para criar/testar — só para **ativar** o
> plugin no estúdio (o usuário aprova as permissões).

---

## 1. Ciclo fechado (4 chamadas)

```
castdeck_plugin_docs      → contrato atualizado (eventos, ações, capacidades)
castdeck_plugin_scaffold  → cria workspace do plugin
castdeck_plugin_write     → grava plugin.json (e src/index.js se for código)
castdeck_plugin_validate  → erros com código + dica
castdeck_plugin_simulate  → dispara eventos e vê as AÇÕES pedidas (sem tocar no estúdio)
castdeck_plugin_install   → instala no app
```

Regra de ouro: **só considere pronto quando `validate.ok === true` e `simulate.acoes` contiver a ação esperada**.

## 2. Dois tipos de plugin

| Tipo | O que é | Quando usar |
|---|---|---|
| `declarative` | só `plugin.json` com `rules` (gatilho → ação) | resposta a chat, aviso na tela, mídia, cena |
| `code` | `src/index.js` com `export default function activate(castdeck)` | API externa, regra complexa, painel próprio |

## 3. Formato do plugin declarativo

```json
{
  "id": "com.voce.meu-plugin",
  "name": "Meu plugin",
  "description": "O que ele faz em uma frase",
  "version": "1.0.0",
  "author": { "name": "Seu Nome" },
  "license": "MIT",
  "engines": { "castdeck": ">=2.0.0", "api": 1 },
  "tier": "declarative",
  "permissions": ["events:chat", "chat:send", "overlay:show"],
  "rules": [
    {
      "on": "chat.comando",
      "comando": "discord",
      "cooldownSeg": 30,
      "do": [
        { "type": "chat.send", "texto": "Entre no Discord: discord.gg/exemplo" },
        { "type": "overlay.show", "titulo": "Discord", "texto": "discord.gg/exemplo", "cor": "#5865f2", "segundos": 8 }
      ]
    }
  ]
}
```

Gatilhos: `chat`, `chat.comando`, `chat.regex`, `chat.contem`, `doacao`, `stage.entrou`, `stage.saiu`,
`scene.mudou`, `live.iniciou`, `live.encerrou`.
Ações: `overlay.show`, `overlay.hide`, `chat.send`, `panel.open`, `sound.play`, `http.request`.
Variáveis: `{{usuario}}`, `{{texto}}`, `{{arg1}}`, `{{arg2}}`, `{{rede}}`, `{{cena}}`, `{{fonte}}`, `{{titulo}}`.

## 4. Formato do plugin com código

```js
// src/index.js
export default function activate(castdeck) {
  castdeck.events.on('chat', async (m) => {
    if (!/^!presenca\b/i.test(String(m.texto || ''))) return;
    const { url } = castdeck.settings.get();       // só as chaves declaradas no manifesto
    const r = await castdeck.http.post(url, { usuario: m.usuario });
    castdeck.log('enviado: ' + r.result.status);
    castdeck.overlay.show({ titulo: 'Presença', texto: m.usuario + ' registrado' }, 6);
  });
}
```

API injetada: `events.on(nome, fn)`, `overlay.show(spec, segundos)`, `overlay.hide()`, `chat.send(texto)`,
`http.get(url)`, `http.post(url, body)`, `sound.play(id)`, `panel.open()`, `settings.get()`,
`settings.save(patch)`, `log(texto)`, `plugin.dataDir`.

## 5. Permissões (peça só o necessário)

| Permissão | Libera |
|---|---|
| `events:chat` | ler mensagens do chat |
| `events:stage` | saber quem está no palco e a cena |
| `events:recording` | saber de gravações |
| `overlay:show` | desenhar aviso no programa |
| `panel:open` | abrir painel próprio |
| `control:mixer` / `control:scene` / `control:playout` | mexer em áudio/cena/mídia |
| `chat:send` | responder no chat do estúdio |
| `network:<host>` | chamar um endereço (ex.: `network:https://api.exemplo.com`) |
| `storage:own` | gravar na pasta do plugin |

As que exigem aprovação do usuário são mostradas em português na ativação. Se você usar uma ação sem a
permissão correspondente, a ação **não roda** — e a simulação mostra a falta.

## 6. Limites de segurança (o app recusa)

- sem `.exe`, `.dll`, `.node`, `.bat`, `.cmd`, `.ps1`, `.sh` no pacote;
- sem `child_process`, `fs`, `net`, `http`, `dns` no código — use `castdeck.http`;
- sem `eval` nem `new Function`;
- rede somente nos hosts declarados em `network:`;
- `license` SPDX e `engines.castdeck` compatível com o app;
- pacote até 20 MB; um único `plugin.json` na raiz.

## 7. Erros mais comuns e como corrigir

| Código | Causa | Correção |
|---|---|---|
| `ID_INVALIDO` | id sem ponto ou com maiúscula | `com.voce.nome` (minúsculo) |
| `JSON_INVALIDO` | vírgula sobrando | valide o JSON antes de gravar |
| `SEM_LICENCA` | falta `license` | `"MIT"` |
| `ENGINES_INCOMPATIVEL` | `engines.castdeck` não cobre a versão | `">=2.0.0"` |
| `PERMISSAO_INVALIDA` | ação sem permissão | adicione a permissão da ação |
| `SEM_ENTRADA` | `entry` aponta para arquivo inexistente | crie `src/index.js` |
| `CODIGO_BLOQUEADO` | `require('fs')`, `child_process`, `eval` | use a API `castdeck.*` |
| `ARQUIVO_PROIBIDO` | binário no pacote | remova |
| `SEM_REGRAS` | declarativo sem `rules` | adicione ao menos uma regra |

## 8. Acesso

**API local** (o app roda em `http://localhost:3000`):
- `GET  /api/plugins/author/docs`
- `GET  /api/plugins/author/templates`
- `POST /api/plugins/author/scaffold` `{ id, tier, name }`
- `PUT  /api/plugins/author/files/<id>` `{ arquivos: [{ arquivo, conteudo }] }`
- `POST /api/plugins/author/validate` `{ id }`
- `POST /api/plugins/author/simulate` `{ id, eventos: [...] }`
- `POST /api/plugins/author/install` `{ id }`
- `GET  /api/plugins` · `GET /api/plugins/<id>/log`

**MCP** (para o agente usar como ferramentas):
```bash
node tools/mcp-plugins.mjs          # CASTDECK_URL padrão http://127.0.0.1:3000
```
Ferramentas: `castdeck_plugin_docs`, `castdeck_plugin_templates`, `castdeck_plugin_list`,
`castdeck_plugin_scaffold`, `castdeck_plugin_write`, `castdeck_plugin_validate`, `castdeck_plugin_simulate`,
`castdeck_plugin_install`, `castdeck_plugin_status`, `castdeck_plugin_logs`, `castdeck_plugin_catalog`.

## 9. Exemplo de raciocínio que funciona

1. **Objetivo:** “quando alguém entrar no palco, avisar e registrar num endpoint”.
2. `docs` → confirme `stage.entrou` e `overlay.show`.
3. `scaffold { tier: 'code' }` → escreva `plugin.json` com `permissions: ['events:stage','overlay:show','network:https://api.exemplo.com']` e `src/index.js`.
4. `validate` → corrija o que vier com código/dica.
5. `simulate { eventos: [{ tipo:'stage', acao:'entrou', fonteNome:'Fulano' }] }` → deve listar `overlay.show` e `http.request`.
6. `install` → peça ao usuário para **ativar** e aprovar as permissões na aba Plugins.
