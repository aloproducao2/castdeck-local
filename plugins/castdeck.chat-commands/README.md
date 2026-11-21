# Comandos de chat

Plugin **declarativo** (sem código): responde comandos do chat com mensagem, aviso na tela ou mídia.

## Comandos de exemplo (edite no `plugin.json`)

| Comando | O que faz |
|---|---|
| `!discord` | responde no chat o link do Discord e mostra o aviso na tela por 8 s |
| `!redes` | responde no chat com as redes da live |
| `!aviso <texto>` | mostra o texto como aviso grande no programa |
| `oi` / `olá` | dá boas-vindas a quem chegou (cooldown de 45 s por pessoa) |

## Como personalizar

Cada item de `rules` tem:

- `on`: `chat.comando` (com `comando`), `chat.regex` (com `padrao`) ou `chat.contem` (com `texto`);
- `cooldownSeg`: intervalo mínimo por pessoa (evita spam);
- `do`: lista de ações — `chat.send`, `overlay.show`, `media.play`, `sound.play`.

Variáveis disponíveis no texto: `{{usuario}}`, `{{texto}}`, `{{arg1}}`, `{{arg2}}`, `{{rede}}`.

## Permissões

- `events:chat` — ler as mensagens (necessária para reagir);
- `chat:send` — responder no chat;
- `overlay:show` — desenhar o aviso no programa.

Licença: AGPL-3.0-only (parte do CastDeck).
