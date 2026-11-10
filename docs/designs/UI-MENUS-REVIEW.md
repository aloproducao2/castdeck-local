# REVISÃO — Menus e submenus (UI e contraste)

Revisão EGM do painel lateral do estúdio: grupos (8), submenus/abas (24), barra superior e dock.
Ferramenta: `test/egm-menus-review.mjs` (Edge headless/CDP, câmera e microfone simulados, capturas + WCAG).

## Método

- Servidor isolado em `:3101`; câmera/microfone falsos para o estúdio inicializar de verdade.
- Cliques reais via `Input.dispatchMouseEvent` (gesto confiável) para liberar o `AudioContext`.
- Para cada aba: captura em PNG (`scratch/egm-menus/tab-*.png`) e cálculo de contraste
  texto × fundo efetivo (WCAG AA: 4,5:1 normal; 3:1 para texto grande).

## Achados e correções

| # | Achado | Contraste | Correção |
|---|---|---|---|
| 1 | Rótulo da aba ativa (ex.: "Mídia") branco sobre accent `#7a5afc` | 4,47:1 (quase) | `--accent` escurecido para `hsl(252 92% 60%)` |
| 2 | Selo de time "TMA" branco sobre verde `#16a34a` | **3,3:1** | `.sp-tm-badge` com fundo `color-mix(var(--c) 74%, #000)` |
| 3 | Links/realces roxos pequenos ("Times", "Cadastrar novo time") | 3,99–4,27:1 | novo `--accent-text: hsl(252 100% 80%)`; `a` usa `--accent-text` |

Depois das correções o script reporta **0 elementos abaixo do mínimo** nas 15 telas percorridas.

## Observações de usabilidade (não bloqueiam)

- **Hierarquia:** 8 grupos + até 4 abas por grupo. Rótulos claros, ícones consistentes e estado ativo visível.
- **Altura dos menus:** a grade de grupos ocupa ~150 px (3 linhas) e as abas mais ~55 px; em 768 px de altura
  sobram ~430 px para o conteúdo. Sugestão futura: modo compacto da grade quando o painel está aberto.
- **CTA "Adicionar vídeos, áudios ou imagens…"** é uma faixa gradiente larga; funciona, mas compete visualmente
  com os cards. Sugestão futura: transformar em botão primário compacto no cabeçalho da seção.
- **Botões só de ícone** no topo (WhatsApp, câmeras, remoto) dependem de tooltip; aceitável em desktop.
- **Lobby:** régua acima de "Áudio puro" é divisor de seção; sem sobreposição.

## Verificação

- 15 telas capturadas (topo + 14 abas) em 1366×768, sem overflow horizontal.
- Contraste: 0 falhas após as correções.
- Artefatos: `scratch/egm-menus/report.json` e `scratch/egm-menus/*.png`.
