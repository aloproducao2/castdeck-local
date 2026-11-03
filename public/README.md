# public/ — UI web do CastDeck

Páginas e assets servidos pelo servidor local. É a interface de operação do estúdio e também as páginas
auxiliares (convidado, link de legenda, projetor, replay, mensagens, votação).

## Páginas principais

| Arquivo | Papel |
|---|---|
| `studio.html` | Estúdio (operação): compositor, mixer, cenas, mídia, legendas. |
| `join.html` | Entrada do convidado (câmera/microfone via WebRTC). |
| `cc.html` | Overlay de legenda para OBS (fundo transparente). |
| `projector.html` | Projeção em tela cheia. |
| `remote.html` | Controle remoto do celular. |
| `replay.html` | Replay/VAR. |
| `msg.html`, `vote.html` | Mensagens e enquetes para a audiência. |
| `out*.html`, `cam.html` | Popouts de saída e câmera. |

## JS

- `js/studio/` — módulos do estúdio (ver `js/studio/README.md`).
- `js/*.js` — páginas auxiliares (convidado, remote, replay, popouts).
- `css/app.css` + `app.bundle.css` — estilo principal do estúdio.

## Invariantes

- Sem framework: JS vanilla e ES modules.
- A UI nunca depende de Internet para operar.
- Áudio do programa separado do vídeo; legendas são um canal de texto.

## Subdiretórios

- [`js/`](js/README.md) — scripts das páginas
- [`js/studio/`](js/studio/README.md) — módulos do estúdio
- [`js/i18n/`](js/i18n/README.md) — traduções
- [`css/`](css/README.md) — estilos
- [`css/modules/`](css/modules/README.md) — CSS modular
- [`guias/`](guias/README.md) — guias
- [`vendor/`](vendor/README.md) — bibliotecas de terceiros
- [`assets/backgrounds/`](assets/backgrounds/README.md) — fundos
