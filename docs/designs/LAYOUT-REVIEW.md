# REVISÃO — Layout e sobreposições (EGM review)

Revisão no formato Elephant-Goldfish: diagnóstico automatizado + inspeção visual do estúdio e lobby.
Ferramenta: `test/egm-layout-review.mjs` (CDP/Edge headless, screenshot + detecção de overflow/sobreposição).

## Método

- Servidor local isolado (`CASTDECK_DATA` temporário) em `:3100`.
- Edge headless (CDP `:9333`), estúdio real em 1920×1080, 1366×768 e 1280×720.
- Para cada tamanho: `scrollWidth/Height`, retângulos dos painéis e interseção de elementos visíveis.
- Inspeção visual das capturas em `scratch/egm-shots/`.

## Achados

| # | Severidade | Achado | Status |
|---|---|---|---|
| 1 | média | Em 1280 px o nome do estúdio no topo colapsava para uma letra ("E...") e o subtítulo para "Ne..." porque o bloco do título tinha `flex: 0 1 auto` e encolhia até o min-content. | **corrigido** |
| 2 | baixa | Faixa fina de 12 px sob o PGM (`#rz-stage`) parece uma barra perdida; é a alça de redimensionamento do palco. | intencional (documentado) |
| 3 | baixa | Régua horizontal acima de "Áudio puro" no lobby é o divisor da seção. | intencional |
| 4 | — | Sem overflow de página e sem sobreposição entre painéis em 1920/1366/1280. | ok |

## Correção aplicada

`public/css/modules/studio.css`:

- `.topbar > div:nth-child(2)` → `min-width: 140px; flex: 1 1 200px;` (o título não encolhe mais a uma letra).
- `@media (max-width: 1366px) { .studio .topbar .brand-txt { display: none; } }` (devolve espaço ao título;
  especificidade acima da regra de `onair.css`).

## Verificação

- 1280×720: título "EGM Layout Fix3" visível (145 px), marca oculta, `scrollWidth = 1280` (sem overflow).
- 1366×768 e 1920×1080: unchanged, sem overflow/sobreposição.

## Pendências de QA manual

- Abrir o painel lateral e a saída 9:16 com câmera/microfone reais (no headless o `getUserMedia` é negado e
  parte dos handlers não executa) e repetir a checagem em 1280 e 1366.
