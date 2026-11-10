# EGM — Layout mobile (Android retrato e paisagem)

> **Status:** implementado na versão local **1.3.6** (não publicado na VPS).
> **Data:** 2026-11-01
> **Escopo:** exclusivamente layout mobile. Desktop/PC intocado.

---

## 1. Concept brief (6 lentes)

| Lente | Pergunta | Resposta |
|---|---|---|
| **Uso real** | Como o operador segura o celular? | Retrato para conferir a live e trocar de fonte; paisagem para operar com o polegar e ver a prévia maior. |
| **Retrato** | O que precisa aparecer? | Prévia, cenas, corte, fontes; painel em drawer; nav inferior de 4 abas. |
| **Paisagem** | O que muda? | Altura útil cai para ~280 px; uma coluna empilhada obriga a rolar a prévia para fora. Precisa de **duas colunas**. |
| **Android** | O que corta? | Notch/gesture bar (`safe-area-inset-*`), barra de endereço do Chrome e teclado virtual. |
| **Toque** | Alvos? | Abas ≥ 54 px de altura, botões de corte 44–56 px, switches 46 px. |
| **Acessibilidade** | O que não pode? | Rolagem horizontal, conteúdo escondido atrás da nav, texto cortado. |

---

## 2. Auditoria (medidas reais headless)

### Retrato 390×844 (Android)
| Item | Medida | Situação |
|---|---|---|
| `scrollWidth` | **390** | sem rolagem horizontal ✅ |
| Header | 59 px | título/subtítulo/3 ações cabem ✅ |
| Nav inferior | 59,8 px | 4 abas com ícone + rótulo ✅ |
| Prévia PGM | 16:9 na largura | ✅ |
| Mesa | uma coluna | ✅ |

### Paisagem 844×390
| Item | Antes | Depois |
|---|---|---|
| `scrollWidth` | 844 | **844** (sem overflow) ✅ |
| Header | 59 px | **47 px** (subtítulo oculto, ícones 34 px) ✅ |
| Nav inferior | 59,8 px | **47,5 px** ✅ |
| `.mesa-cols` | uma coluna (empilhava prévia e fontes) | **grid de 2 colunas** (820 px) ✅ |
| Prévia 16:9 | ~460 px de altura (não cabia) | limitada por `calc(100vh - 140px)` ✅ |
| Fontes/layouts | 1 coluna | 2 colunas / 3 colunas ✅ |

### Studio (app Android) — verificação
- Drawer do painel: fechado fica fora da tela; aberto em retrato ocupa `y=168…843` (cabe) ✅.
- Topbar rola horizontalmente em 390 px (sem cortar Gravar/Transmitir) ✅.
- Nenhuma alteração necessária no studio nesta rodada; o foco foi a página móvel do controle remoto.

---

## 3. O que mudou (remote page)

- **`@media (orientation: landscape) and (max-height: 520px)`**:
  - Header compacto (subtítulo oculto, ícones 34 px, padding 6 px).
  - `main` com padding 8 px + safe-area.
  - **Mesa em duas colunas** (`minmax(0,1.15fr) minmax(0,.85fr)`), esquerda estática, fontes em 2 colunas e layouts em 3.
  - Prévia com `max-height: calc(100vh - 140px)`.
  - Botões de corte/auto com 44 px; nav 47 px; mini-player e toast reposicionados.
- **Safe areas** (`env(safe-area-inset-*)`) em header/main/nav no retrato e paisagem.
- Sem mudanças de lógica, comandos ou snapshot.

---

## 4. Testes

1. **390×844**: `scrollWidth = 390`, header 59, nav 59,8, Mesa em 1 coluna.
2. **844×390**: `scrollWidth = 844`, header 47, nav 47,5, `.mesa-cols` grid 820 px.
3. Troca de abas em paisagem: Áudio/Conteúdo/Mais continuam rolando verticalmente, sem overflow horizontal.
4. Sem exceções de runtime.

---

## 4.1 Correção 1.3.10 — app estúdio Android (pé e deitado)

A auditoria no app (WebView Android) encontrou **duas regras soltas no CSS** que quebravam o layout móvel:

1. `.side { position: relative; }` (topo de `studio.css`) sobrescrevia o `position: fixed` da gaveta do painel
   definido em `@media (max-width: 1000px)`. No celular o painel ficava como coluna de grid (aberto na lateral
   em paisagem / fora da tela em retrato). Agora a regra é só para `@media (min-width: 1001px)`.
2. `.studio, .guest { grid-template-columns: minmax(0, 1fr) 360px; }` (topo) forçava **duas colunas** em
   qualquer largura, anulando o `grid-template-columns: 1fr` do mobile. Agora é só para `@media (min-width: 901px)`.

Também:
- Topbar do app: em `≤560px` e em paisagem `≤1000px/≤640px`, esconde botões secundários
  (WhatsApp, câmeras, controle remoto, idioma, modos, marca, título e espaçadores) para **Gravar** e
  **Transmitir** ficarem sempre visíveis — antes `Transmitir` vazava para fora da tela.
- Gaveta de paisagem: `position: fixed; left:0; right:0; bottom:0; width:100vw; height:min(70vh,480px)`,
  fechada por padrão e abre ao tocar em **Painel**.

Verificação (headless, UA Android):
| | 390×844 | 844×390 |
|---|---|---|
| `scrollWidth` | 390 (sem overflow) | 844 (sem overflow) |
| Topbar `scrollWidth` | 390 (cabe) | 844 (cabe) |
| Gravar/Transmitir | visíveis | visíveis |
| Gaveta `#side` | fixa, fechada (y=878) | fixa, fechada (y=404) |
| Gaveta ao abrir | — | y=136, visível |

A página do **controle remoto** também ganhou: subtítulo do header com reticências, `min-width:0` em linhas/
sliders, nav de 5 itens sem overflow e padding inferior corrigido em paisagem.

## 5. Pendências

- Teste em aparelho real (Chrome Android e WebView do app) com notch e barra de gestos.
- Teclado virtual nos campos de GC/Mensagens: garantir que a nav não cubra o campo.
- Se aparecer corte na barra de endereço do Chrome (modo não-PWA), considerar `100dvh`.
- Medidores de nível no celular continuam pendentes (feature, não layout).


---

## 6. Auditoria 1.3.29 — Android retrato e paisagem (local)

### Medições

| Viewport | `scrollWidth` | Resultado |
|---|---|---|
| 390×844 | 390 | sem overflow horizontal |
| 844×390 | 844 | sem overflow |
| 360×640 | 360 | sem overflow |
| 640×360 | 640 | sem overflow |

- Topbar: Gravar/Transmitir sempre visíveis nos quatro tamanhos.
- Drawer: fechado fora da tela, aberto dentro dos limites.
- Playout: em retrato o botão **Palco** fica visível; em paisagem o painel rola verticalmente.
- Áudio vertical: canais e buses em colunas, sem overflow de página.
- Convidado: lobby sem overflow horizontal.
- Painel inicial: sem overflow; conteúdo rola verticalmente.

### Correções

1. **Lobby do convidado em retrato:** o card fica em `100dvh`, o preview é limitado a 34dvh, o formulário rola internamente e o CTA fica sticky; a página não precisa mais rolar para achar **Entrar**.
2. **Gaveta em paisagem:** o menu de grupos vira uma linha de ícones (9 grupos), com labels ocultos e tooltips. Antes ocupava 162 px (3 linhas) e deixava só 111 px de conteúdo; agora ocupa 38 px e o conteúdo começa em y=155, com 235 px úteis.
3. **Lobby do convidado em paisagem:** o botão de entrada fica **sticky** no rodapé do formulário; antes ficava abaixo da dobra (bottom 712 em 390 px), agora fica em 337–371 px.
4. **Áudio vertical:** a **Intensidade** do noise reduction virou coluna dentro do canal; o range e o valor não saem mais para a direita do card. O cabeçalho do Master também quebra o subtítulo em linha própria em vez de espremê-lo letra a letra.
5. Mantidos os scrolls horizontais intencionais de **Cenas** e da barra inferior; todos os controles são alcançáveis por toque.

### Testes

- Android UA + touch, 390×844 e 844×390.
- Painéis Mídia, Playout, Áudio (incluindo vertical/buses), Diretor, Banners, Social e demais abas.
- Convidado em retrato/paisagem e dashboard.
- Sem erros de runtime.
- `npm run test:security`: OK.

**Build local:** 190.884.352 bytes; SHA-256
`0791306c855576007fe7ee0c9f11695dcd82410084f9afa649ed7a825c94e7fb`.
