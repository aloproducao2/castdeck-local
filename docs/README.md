# docs/ — documentação

| Caminho | Papel |
|---|---|
| `DOCUMENTACAO.md` | Documentação funcional do CastDeck. |
| `INTERCOM.md` | Guia EGM do intercom: operação, PTT, IFB, mini painel, mobile e diagnóstico. |
| `PLANO-MELHORIAS.md` | Plano geral de melhorias. |
| `artigo-imprensa.md` | Texto de divulgação. |
| `ai/ESTADO.md` | Estado atual, versões e diário de trabalho. |
| `ai/HISTORICO.md` | Histórico longo. |
| `ai/PLANO-*.md` | Planos de features e estudos. |
| `ai/ANALISE-*.md` | Análises técnicas. |
| `designs/SITEMAP.md` | Índice de designs (fluxo EGM). |

## Invariantes

- `ESTADO.md` é a fonte de verdade do estado atual (versão local × publicada).
- Planos novos seguem `PLANO-<ASSUNTO>.md` em `docs/ai/`.
- Textos em pt-BR.

## Subdiretórios

- [`ai/`](ai/README.md) — estado, histórico e planos
- [`designs/`](designs/README.md) — designs EGM
- [`INTERCOM.md`](INTERCOM.md) — guia EGM do intercom
