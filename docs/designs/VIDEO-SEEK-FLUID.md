# EGM — Sumiço do vídeo no seek (iniciais da fonte)

> **Status:** implementado na versão local **1.3.5** (não publicado na VPS).
> **Data:** 2026-11-01
> **Sintoma:** ao arrastar o seek de um vídeo (ou do replay), a imagem some por um instante e aparece o
> desenho com as **iniciais da fonte**.

---

## 1. Concept brief (6 lentes)

| Lente | Pergunta | Resposta |
|---|---|---|
| **Causa** | Por que some? | Ao mudar `currentTime`, o `<video>` cai para `readyState < 2` (ou fica sem frame) enquanto decodifica o keyframe. O compositor trata “não pronto” como fonte sem vídeo e desenha o avatar de iniciais. |
| **Valor** | O que o operador espera? | Que o quadro **segure** até o novo frame chegar; um seek deve parecer um corte seco, não um “erro”. |
| **Opções** | Como resolver? | (A) cache do último quadro bom; (B) dois `<video>` A/B; (C) canvas com blend; (D) keyframes menores. |
| **Custo** | Qual o menor risco? | **A**: uma cópia de quadro a cada 120 ms por mídia, memória ~2 MB por fonte (960×540), sem mexer no caminho do PGM. |
| **Risco** | O que pode dar errado? | Mostrar quadro velho de câmera desconectada (não fazemos: cache só para `kind === 'media'`); cache de vídeo antigo ao trocar o elemento (limpamos no `upsertSource`). |
| **Resultado** | Como fica? | Seek de vídeo/replay mantém a última imagem até o decoder entregar o novo frame; sem piscar iniciais. |

---

## 2. Diagnóstico

- `compositor.js` `drawTile` calculava `ready = el.videoWidth > 0 && el.readyState >= 2`.
- Durante um seek, o Chromium baixa o `readyState` e pode limpar a superfície do vídeo.
- `ready` falso → ramo final `else` → **avatar com as iniciais** (`s.label`), exatamente o desenho relatado.
- O replay usa o mesmo caminho (`replay:out` é `kind: 'media'`), então o problema era idêntico no PGM.

---

## 3. Opções avaliadas

| Opção | Descrição | Veredito |
|---|---|---|
| **A. Cache do último quadro** | Copiar o frame bom para um canvas por fonte e desenhá-lo enquanto `ready` for falso. | **Escolhida** — baixo risco, cobre vídeo e replay, sem tocar no caminho de saída. |
| B. Dois `<video>` A/B | Enquanto A busca, B mostra o último frame; troca quando pronto. | Mais complexo (sincronizar áudio, dois decoders por fonte) — fase futura. |
| C. Canvas de blend | Crossfade entre quadro antigo e novo. | Já tentado no replay (1.2.101) e revertido; não repetir sem teste controlado. |
| D. Keyframe de 0,5 s | Reduz o tempo de decodificação, mas não elimina o `readyState` falso. | Complementar, não resolve sozinho. |

---

## 4. Implementação (1.3.5)

Em `public/js/studio/compositor.js`:

- `_frameCache` / `_frameCacheAt` por fonte.
- `cacheFrame(id, el, vw, vh)`: copia o quadro atual para um canvas de até **960×540**, no máximo a cada
  **120 ms** (custo baixo; sempre há um frame recente).
- No `drawTile`, quando `ready` for verdadeiro e a fonte for `media`, o cache é atualizado.
- Quando `ready` for falso e existir cache e a fonte for `media` (e não `camOff`), desenha o **cache** em vez do
  avatar, respeitando `contain`/ajuste manual.
- `camOff` continua indo para o visualizador de áudio; **câmeras** continuam com avatar quando caem (não exibimos
  quadro congelado de câmera desconectada).
- `removeSource` e troca de `el` em `upsertSource` limpam o cache (vídeo novo não herda quadro antigo).

---

## 5. Testes

1. Vídeo na mídia: arrastar o seek várias vezes — a imagem deve **segurar** o último quadro e retomar; sem iniciais.
2. Replay: dar TAKE, arrastar o scrub no PGM — mesmo comportamento.
3. Vídeo só de áudio (`camOff`): continua mostrando o visualizador de áudio.
4. Câmera desconectada: continua avatar (não mostra quadro congelado).
5. Trocar o vídeo da mesma fonte: não deve aparecer o quadro do vídeo anterior.

**Teste headless planejado:** fonte fake `kind:'media'` com canvas vermelho, `readyState:2` → `comp.render()`
(preenche cache); depois `readyState:0` → `comp.render()` e conferir que o canvas do programa continua vermelho
(não o avatar escuro). Memória: ~2 MB por fonte em 960×540.

---

## 6. Limitações e próximos passos

- **Primeira carga** (antes do primeiro frame) ainda mostra avatar; não há o que cachear.
- Cache é um quadro **congelado** durante o seek; para “fluidez” de movimento durante o arrasto, seria preciso
  pré-carregar keyframes/duplo decoder (opção B) ou blend (opção C).
- O seek continua dependente do keyframe do arquivo (MediaRecorder ~1 s). Para reduzir o salto visual, a opção B
  é a próxima evolução.
