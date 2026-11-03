# public/css/ — estilos

| Arquivo | Papel |
|---|---|
| `app.css` | Estilo principal do estúdio (fonte, usado em desenvolvimento). |
| `app.bundle.css` | Bundle do estilo do estúdio servido em produção. |
| `dash.css` | Painel/dashboard. |
| `msg.css` | Página de mensagens. |
| `vote.css` | Página de votação. |

## Invariantes

- Alterações de UI entram em `app.css` e são refletidas no bundle via `build/vendor-web.mjs`.
- Sem dependência de CDN; fontes/ícones locais.
