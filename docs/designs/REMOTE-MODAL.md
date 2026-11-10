# EGM — Redesign do modal “Controle remoto no celular”

> **Status:** implementado na versão local **1.3.3** (não publicada na VPS).
> **Data:** 2026-11-01
> **Escopo:** apenas apresentação do modal/painel de controle remoto (QR, link, rede, status, vídeo). Nenhuma
> mudança de protocolo, sinalização ou comandos.

---

## 1. Concept brief (6 lentes)

| Lente | Pergunta | Resposta |
|---|---|---|
| **Clareza** | Em 2 s o operador entende o que fazer? | Antes não: QR gigante, link quebrando linha, botões de pesos iguais e status apagado. Agora: QR à esquerda, “copiar link” como ação primária e status visível. |
| **Hierarquia** | O que é principal? | 1) QR; 2) link/ação de copiar; 3) rede; 4) opções (vídeo, internet). |
| **Densidade** | Cabe sem poluir? | Duas colunas no desktop (QR 220 px + controles), uma no celular. |
| **Ergonomia** | Alvos grandes e previsíveis? | Botões 2×2, selects full-width, toggle em linha própria. |
| **Erro** | Evita erro de rede? | O seletor de rede ficou rotulado (“REDE”) e o diagnóstico/aviso de firewall ficou abaixo, legível. |
| **Acessibilidade** | Teclado/leitor? | Título semântico, labels nos selects, checkbox nativo, contraste maior no status e no texto de ajuda. |

---

## 2. Diagnóstico do layout anterior (screenshot)

| Problema | Impacto |
|---|---|
| QR ocupava ~70% do card e ficava centralizado num card estreito (360 px). | Empurrava link e ações para baixo; leitura em “torre”. |
| URL com `word-break: break-all` quebrava no meio do token (`…f26` / `4ead`). | Difícil conferir/copiar; parece truncada. |
| Quatro botões com o mesmo peso visual. | Ninguém sabia qual era a ação principal. |
| “Testar rede” parecia link; diagnóstico vazio ocupava espaço. | Ações secundárias confundiam. |
| Sem rótulo no seletor de rede. | Operador não sabia o que aquele select controlava. |
| Toggle “Permitir vídeo” no rodapé, apertado. | Parecia opção avançada, não configuração. |
| Status “Nenhum controle conectado” em texto solto. | Fácil de ignorar. |
| Modal em 360 px com conteúdo interno de ~600 px. | Conteúdo cortado à direita (visto no teste). |

---

## 3. Opções consideradas

| Opção | Descrição | Veredito |
|---|---|---|
| A. Card vertical (atual) | Empilhar tudo | Já era o problema; muito altura e hierarquia fraca. |
| **B. Duas colunas (QR + controles)** | QR 220 px à esquerda; rede, link, ações e status à direita; vídeo/ajuda embaixo | **Escolhida**: equilíbrio entre leitura do QR e operação. |
| C. Wizard em 2 passos | “Conecte” → “Opções” | Excesso de cliques para uma tarefa de 1 tela. |
| D. Abas (QR / Rede / Opções) | Esconde conteúdo | Pior para operador ao vivo; mais cliques. |

**Decisão:** B, com largura de modal ampliada (660 px) e grid que colapsa em 1 coluna abaixo de 620 px.

---

## 4. O que mudou

### 4.1 Estrutura

```
┌ Cabeçalho: ícone + título + subtítulo ───────────────┐
│ ┌ QR (card branco) ─┐ ┌ REDE (select) ──────────────┐│
│ │                   │ │ LINK (URL truncada)         ││
│ │      QR 190px     │ │ [Copiar link] [Abrir no PC] ││
│ │                   │ │ [Ocultar QR] [Testar rede]  ││
│ │ “Aponte a câmera” │ │ ● Nenhum controle conectado ││
│ └───────────────────┘ │ [Usar link da Internet]     ││
│                       └─────────────────────────────┘│
│ [ Permitir vídeo no controle ................ (on) ] │
│ Ajuda de firewall/rede                               │
└──────────────────────────────────────────────────────┘
```

### 4.2 Detalhes

- **Largura:** `min(660px, 100vw - 24px)`; grid `220px | 1fr`; colapsa em 1 coluna ≤620 px.
- **QR:** card branco com sombra, 190 px no modal (168 px no painel do Diretor), legenda curta.
- **Link:** `white-space: nowrap` + `text-overflow: ellipsis` + `title` com a URL completa; sem quebra no meio
  do token.
- **Ações:** grid 2×2; **Copiar link** é `primary`; as demais são secundárias/ghost.
- **Rede:** select full-width com rótulo “REDE”; quando só há uma opção, vira pill estática.
- **Status:** pill com **dot** verde quando há controle conectado; texto com ellipsis se faltar espaço.
- **Vídeo:** linha própria com descrição, checkbox nativo e switch.
- **Diagnóstico:** vazio não ocupa espaço (`:empty`); quando há texto, aparece em roxo claro.
- **Ajuda:** texto menor no rodapé, quebrando linha naturalmente.
- **Acessibilidade:** `<label>` no select e no toggle; `aria-hidden` no dot; título e subtítulo legíveis; foco do
  modal continua no comportamento existente.
- **Sem mudanças funcionais:** todos os `data-rc` (copy, qr, open, test, net, tunnel, video, diag, count)
  preservados; mesmos handlers.

### 4.3 Responsivo/painel

- **Painel do Diretor (`#remote-box`):** 1 coluna, QR 168 px, mesmos componentes compactos.
- **Modal:** 2 colunas até 620 px; abaixo disso, QR em cima e controles embaixo.
- Testado em 1100×900 (modal 610 px, sem overflow).

---

## 5. Testes executados (headless)

- Modal aberto em 1100×900: `width = 610`, `scrollWidth = 610` (sem corte).
- Screenshot conferido: QR 190, link truncado com ellipsis, botões 2×2, status e toggle visíveis.
- “Ocultar QR” → card some e botão vira “Mostrar QR”; “Mostrar QR” → volta.
- Toggle “Permitir vídeo” grava `cd.remote.video = 0` e alterna.
- Nenhuma exceção de runtime.

---

## 6. Pendências / próximos ajustes

- Feedback visual “Link copiado” no botão (hoje só copia).
- Traduções: as novas strings usam `t()` com fallback em português; revisar EN/ES no i18n.
- No painel do Diretor, o card pode ganhar um botão “Abrir modal” para quem prefere a versão grande.
- Testar em celular real (QR + link) e em tema claro, se existir.
