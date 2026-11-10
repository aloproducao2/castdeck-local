# EGM — Controle remoto: reorganização e experiência celular/PC

> **Status:** implementado na versão local **1.3.4** (não publicado na VPS).
> **Data:** 2026-11-01
> **Escopo:** página `/remote/<estúdio>` (celular e PC) e integração com o modal do estúdio.
> **Documento anterior:** [`REMOTE-MODAL.md`](REMOTE-MODAL.md) (redesign do modal no PC).

---

## 1. Concept brief (6 lentes)

| Lente | Pergunta | Resposta |
|---|---|---|
| **Clareza** | O operador acha o que precisa? | Antes havia 5 abas com funções cruzadas (Diretor dentro de Áudio, layouts em Cena, chat em Msgs). Agora 4 abas por **tarefa**: Mesa, Áudio, Conteúdo, Mais. |
| **Eficiência** | Menos toques para o ao vivo? | Mesa concentra prévia, cenas, corte/auto, fontes, layouts e palco. Um toque em “toque corta direto” vai ao ar. |
| **Consistência** | Celular e PC iguais? | Mesma estrutura; no PC a Mesa vira **duas colunas** (prévia/corte à esquerda, fontes/layouts à direita) e as abas de conteúdo ficam centradas. |
| **Ergonomia** | Alvos bons no celular? | 4 abas na barra inferior (alvos maiores), cards de 56 px, switches de 46 px, sliders com trilha alta. |
| **Segurança** | Evita comando errado? | “Mudo geral” é explícito; solos têm “Limpar solos”; FTB e corte têm cores distintas; chat e mensagens separados. |
| **Acessibilidade** | Teclado no PC? | Atalhos `C`, `A`, `1–9`, `F`, `M` (fora de campos de texto) + `aria-selected` nas sub-abas. |

---

## 2. Auditoria da estrutura antiga

| Aba antiga | Conteúdo | Problema |
|---|---|---|
| Mesa | prévia, cenas, switcher, fontes | OK, mas layouts e palco ficavam em “Cena”. |
| Cena | cenas rápidas, layouts, palco | Dois conceitos diferentes; o nome não dizia “layout/palco”. |
| GC | faixa rápida + banners | “GC” é jargão; ninguém acha banners ali. |
| Msgs | mensagens do público + chat dos bastidores | Dois fluxos distintos na mesma tela sem separação. |
| Áudio | master, monitor, **Diretor automático**, faders, buses | Diretor (vídeo/ducking) não é áudio; a aba ficava enorme. |

---

## 3. Nova informação architecture

```
Mesa        → prévia PGM · cenas rápidas · NO AR/PRÉVIA · CORTE/AUTO/FTB
              fontes · layouts · no palco
Áudio       → master (mute/dim) · mudo geral/limpar solos · monitor
              faders + solo + buses A–G por canal · saídas A–G
Conteúdo    → [GC e faixas] | [Mensagens]
              GC: faixa rápida, banners
              Mensagens: mensagem na tela, mensagens do programa, chat
Mais        → Diretor automático · conexão/reconectar · vídeo · atalhos do PC
```

- **4 abas** na barra inferior, com alvos maiores e badge de chat em Conteúdo.
- **Conteúdo** usa um **segmented control** (GC × Mensagens) em vez de duas abas.
- **Diretor automático** saiu de Áudio e foi para Mais (é operação de vídeo/ducking).
- **Layouts e palco** foram para Mesa (fazem parte da composição ao vivo).
- **Chat** continua em Mensagens, mas agora dentro de Conteúdo com o badge de não lidas.

---

## 4. Celular × PC

### Celular (≤ 999 px)
- Barra inferior fixa com 4 abas, respeitando `safe-area-inset-bottom`.
- Mesa em coluna única: prévia → cenas → corte → fontes → layouts → palco.
- Faders e buses com quebra de linha; botões de bus em pills de 22 px.
- Toasts acima do mini-player; sem scroll horizontal.

### PC/tablet (≥ 1000 px)
- `main` com largura máxima de 1040 px centralizada.
- **Mesa em duas colunas**: prévia/cenas/corte à esquerda (sticky) e fontes/layouts/palco à direita.
- Fontes em 2 colunas e layouts em 3 dentro da coluna direita.
- Áudio/Conteúdo/Mais centralizados em 820 px para leitura.
- Barra inferior centralizada (700 px) com bordas arredondadas.

---

## 5. Funções adicionadas/ajustadas

| Função | Onde | Detalhe |
|---|---|---|
| **Mudo geral / Reativar todos** | Áudio | `mute-all` no host (exceto replay); botão reflete se há canal aberto. |
| **Limpar solos** | Áudio | Aparece quando `anySolo`; `clear-solo` no host. |
| **Conteúdo segmentado** | Conteúdo | GC × Mensagens sem sair da aba; badge de chat. |
| **Reconectar** | Mais | Recarrega a página (nova sessão de sinalização). |
| **Vídeo do programa** | Mais | Mesmo toggle do header, com explicação de consumo de rede. |
| **Diretor automático** | Mais | Corte inteligente e ducking saíram de Áudio. |
| **Atalhos de PC** | Mais | `C` corte, `A` auto, `1–9` fontes, `F` tela cheia, `M` mudo geral. |
| **Cenas + layouts + palco** | Mesa | Menos navegação para montar o ao vivo. |

---

## 6. Testes executados (headless)

- Navegação: 4 abas (`Mesa/Audio/Conteudo/Mais`) renderizam; sem exceções.
- Conteúdo: 2 sub-abas; GC mostra campos; Mensagens mostra textarea e chat.
- Áudio: ações rápidas e faders; buses por canal.
- Mais: Diretor (2 ações), conexão, vídeo e atalhos.
- Desktop 1200×900: `.mesa-cols` em grid de 1000 px, duas colunas; abas centradas.
- Celular 390×844: uma coluna, nav inferior com 4 itens.

---

## 7. Pendências

- Medidores de nível ao vivo no celular (exigem stream de níveis separado; hoje só snapshot de estado).
- PTT/talkback (precisa de canal de áudio host→convidado).
- Traduções EN/ES das novas strings.
- Teste em celular real (iOS/Android) e em janela estreita de PC.
- Indicador de “quem está no controle” (contagem de remotos) no celular.
