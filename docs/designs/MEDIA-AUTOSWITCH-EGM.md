# EGM — Mesa inteligente para múltiplos vídeos (Estúdio × PGM)

> **Status:** publicado na 1.3.28 (2026-11-03).
> **Pergunta:** com **dois ou mais vídeos**, como a mesa deve comutar automaticamente a tela/PGM
> para o próximo sem surpreender o operador?
> **Data:** 2026-11-03

---

## 1. Primeiro: “modo Estúdio” e “modo PGM” são máquinas diferentes

Este é o ponto que precisa ficar claro antes de qualquer automação.

### 1.1 Modo Estúdio

```text
PGM = Cena (palco + layout)
     + Solo opcional de uma fonte do palco

Não existe S.take.
Não existe prévia de mesa.
```

- Clicar num vídeo **não o coloca em tela cheia**; ele entra no palco.
- Vários vídeos no palco podem aparecer **ao mesmo tempo** no layout.
- Tela cheia só com **Solo**.
- O áudio do palco pode misturar várias fontes.
- “Comutar a tela” aqui significa trocar o **slot de mídia do palco** ou trocar o **Solo**.

### 1.2 Modo Mesa / PGM

```text
PGM = S.take, se houver take
     ou Cena (palco + layout + Solo), se take = null

Prévia = S.pvw, ou Cena
```

- O vídeo só está “no PGM em tela cheia” se `S.take === id`.
- Se `S.take === null`, o PGM é a Cena — que **ainda pode ter um Solo ativo**.
- A prévia é independente; um vídeo pode estar na prévia sem estar no PGM.
- O palco continua valendo para áudio/contexto, mas **não define sozinho o vídeo do PGM** quando há take.

### 1.3 Por que isso muda a automação

Uma regra ingênua como “quando o vídeo termina, chama `cutTo(próximo)`” funciona no modo Mesa com
take, mas:

- no modo Estúdio **não existe take**, então `cutTo` não é o mecanismo correto;
- no modo Mesa com `take = null` e Solo de vídeo, o correto é trocar o **Solo**, não criar um take;
- no modo Estúdio com dois vídeos no palco, “o vídeo do PGM” é ambíguo: os dois podem estar visíveis.

É por isso que a automação precisa de **contexto de modo** e de um **token de quem estava no ar**.

---

## 2. Comportamento atual (antes do plano)

| Situação | Hoje |
|---|---|
| Playlist avança | `playMedia()` troca o vídeo no palco, mas não atualiza `S.take`/`comp.take` |
| Mesa com take no vídeo A | A termina; B toca no palco, mas PGM continua congelado em A |
| Estúdio com Solo no vídeo A | `setStage()` remove A e zera `S.solo`; B entra no layout, não em tela cheia |
| Vários vídeos, playlist off | Podem tocar juntos; áudio sobrepõe |
| Fim sem loop | Pode congelar no último quadro, sem Cena/FIM |
| Take manual em câmera | `el.onended` da playlist não sabe; pode tentar seguir mesmo assim |
| Prévia manual | Pode ser sobrescrita sem intenção |

O problema não é “faltar automação”; é **não existir um contrato entre playlist, palco, Solo e take**.

---

## 3. EGM — seis lentes

### 3.1 Operador / UX

Precisa saber, sem adivinhar:

- em que modo está (Estúdio ou Mesa);
- qual vídeo está no ar (Solo, take ou Cena);
- qual é o próximo;
- se a mesa vai comutar sozinha;
- como cancelar a automação sem parar a live.

**Direção:** um único estado visível, com rótulos diferentes por modo:
**“Seguir no palco”** (Estúdio) e **“Seguir no PGM”** (Mesa).

### 3.2 Estado / máquina

| Conceito | Estúdio | Mesa/PGM |
|---|---|---|
| PGM em tela cheia | `S.solo === id` | `S.take === id` |
| PGM em layout | `id` no palco | `S.take === null` + `id` no palco |
| PGM em Cena/Solo | `S.solo === id` (Cena) | `S.take === null` + `S.solo === id` |
| Prévia | não existe | `S.pvw` |
| Troca de tela cheia | `setSolo(id)` | `cutTo(id)` |
| Troca de layout | `setStage(...)` | `setStage(...)` (quando `take=null`) |

### 3.3 Mídia / playback

- `playMedia`, `playlistStep`, `ended`, loop, pause, seek.
- Múltiplos vídeos: um só deve ter áudio no ar; os demais pausados.
- Vídeo só de áudio não deve virar tela cheia.
- Próximo removido/corrompido não pode gerar tela preta.

### 3.4 Composição

- Tela cheia × layout; corte seco × AUTO.
- Overlays/DSK/banner/legendas continuam.
- Vertical e retorno do convidado acompanham.
- Não iniciar troca no meio de um fade em andamento.

### 3.5 Persistência / colaboração

- `playlist.on`, `playlist.loop`, `followPgm` persistidos separadamente.
- Co-host/remoto pode dar take; automação não desfaz.
- F1–F6/cenas têm prioridade.
- Restauração de sessão não deve “armar” automação antiga.

### 3.6 Qualidade / testes

- 1, 2, 5, 20 vídeos.
- Playlist on/off; loop on/off.
- Estúdio: layout, Solo, vários vídeos.
- Mesa: take vídeo, take câmera, Cena sem Solo, Cena com Solo, prévia.
- Take manual, troca de modo, remoção, áudio-only, erro.

---

## 4. Contrato proposto

### 4.1 Modos de automação

| Modo | O que faz |
|---|---|
| **Manual** | Nada automático; operador escolhe palco, Solo, prévia e take. |
| **Seguir playlist** | Quando o vídeo **que estava no ar** termina, o próximo assume o mesmo “lugar” no modo atual. |
| **Rodízio** | 2+ vídeos alternam em tela cheia por tempo/duração, com opt-in. |

“Seguir playlist” e “Tocar um após o outro” são **coisas diferentes**:

- tocar em sequência = playback;
- seguir = **mexer no PGM**.

### 4.2 Token de contexto (a parte inteligente)

Ao dar play em um vídeo, capturar:

```js
{
  id,
  mode: 'studio' | 'mesa',
  air: 'solo' | 'take' | 'scene' | 'preview' | 'off',
  stage: [...],       // cópia
  take: S.take,       // só mesa
  solo: S.solo,
  seq: ++mediaAirSeq  // invalida automação antiga
}
```

No `ended`, só seguir se:

1. `follow` está ligado;
2. o token ainda é o atual (`seq`);
3. o modo não mudou;
4. o vídeo ainda está no ar no mesmo papel;
5. o próximo existe e tem vídeo válido;
6. o operador não deu take em outra fonte.

Se qualquer condição falhar: **não mexe no PGM**. Atualiza no máximo palco/prévia e avisa.

### 4.3 Regra por modo

#### Modo Estúdio

| Contexto no play | Ação no fim |
|---|---|
| `S.solo === A` | B substitui A no palco e **herda o Solo** |
| A é o único vídeo do palco | B substitui A no palco; layout continua |
| A divide o palco com câmeras | B substitui só o slot de mídia; sem Solo |
| Vários vídeos no palco | modo playlist deve manter **um slot de mídia**; os outros pausam |
| A só foi tocado, não está no palco | não segue; avisa que não estava no ar |

No Estúdio **nunca chamar `cutTo`**; a tela cheia é Solo.

#### Modo Mesa / PGM

| Contexto no play | Ação no fim |
|---|---|
| `S.take === A` | B vira take com **corte** (ou AUTO); PGM B |
| `S.take === null` e `S.solo === A` | B substitui A no palco e **herda o Solo**; continua Cena |
| `S.take === null` e A está no palco | B substitui A no palco; PGM continua Cena |
| `S.pvw === A` e A não é PGM | B vira **prévia**, não PGM |
| `S.take` é câmera/outra fonte | **não corta**; B vai para palco/prévia com aviso |
| `S.take` mudou desde o play | automação cancelada |

#### Prévia no modo Mesa

- Se a prévia era o vídeo antigo, atualizar para o próximo.
- Se o operador escolheu outra prévia, **preservar**.
- Não usar a prévia como desculpa para roubar o PGM.

### 4.4 Transição

- **Corte seco** como padrão no follow (previsível).
- **AUTO/dissolve** opcional, usando `S.transMs`.
- Nunca trocar durante outro fade; aguardar o fim ou cortar.

### 4.5 Fim da lista

- **Loop on:** não avança.
- **Loop off e existe próximo:** segue.
- **Loop off e último:**
  - Estúdio: sair do Solo e voltar ao palco/layout, ou manter o último com selo “FIM”.
  - Mesa: voltar para a Cena, ou manter com selo “FIM”.
- **Nunca** deixar frame congelado sem aviso.
- Recomendação segura: **voltar para a Cena** com fade e toast.

### 4.6 Áudio

- Um vídeo no ar por vez; se o próximo entra, o anterior pausa.
- Vídeo só de áudio não pode virar tela cheia; entra no áudio/mixer.
- Se o próximo falhar ao decodificar, manter o atual e avisar.
- Não vazar áudio do próximo antes do corte.

---

## 5. Matriz de casos — Modo Estúdio

| # | Vídeos | Playlist | PGM antes | Ação | Esperado |
|---|---|---|---|---|---|
| E1 | 1 | off | layout | play | manual; sem auto |
| E2 | 2 | off | layout | play dois | não auto; avisar sobre áudio; oferecer rodízio |
| E3 | 2 | on | Solo A | A termina | B Solo; PGM B em tela cheia |
| E4 | 2 | on | A no layout | A termina | B substitui A no palco; layout continua |
| E5 | 2 | on | A no palco + câmera | A termina | B troca só o slot de mídia |
| E6 | 2 | on | A fora do palco | A termina | não segue; aviso |
| E7 | 2 | on | Solo A → operador volta ao layout | A termina | não segue; automação cancelada |
| E8 | 2 | on | Solo A → operador muda para câmera | A termina | não segue; câmera permanece |
| E9 | 2 | on | A só áudio | A termina | próximo toca sem tela cheia |
| E10 | 20 | on | Solo A | A termina | próximo da ordem; sem pular |

---

## 6. Matriz de casos — Modo Mesa / PGM

| # | Vídeos | Playlist | PGM antes | Ação | Esperado |
|---|---|---|---|---|---|
| M1 | 1 | off | Cena | play | manual |
| M2 | 2 | off | Take A | A termina | não segue; FIM/aviso |
| M3 | 2 | on | Take A | A termina | B take (corte/AUTO); PGM B |
| M4 | 2 | on | Cena (sem Solo) | A termina | B substitui no palco; PGM Cena |
| M5 | 2 | on | Cena + Solo A | A termina | B herda Solo; PGM Cena com B |
| M6 | 2 | on | Take câmera | A termina | não corta; B palco/prévia + aviso |
| M7 | 2 | on | Take A → operador corta câmera | A termina | não segue; câmera permanece |
| M8 | 2 | on | Prévia A, PGM câmera | A termina | B vira prévia; PGM câmera permanece |
| M9 | 2 | on | Take A, loop on | A termina | não avança |
| M10 | 2 | on | Take A, B removido | A termina | fallback Cena + aviso |
| M11 | 2 | on | Take A, B só áudio | A termina | não take; áudio/aviso |
| M12 | 2 | on | Take A, B erro de decode | A termina | mantém A/FIM; não tela preta |
| M13 | 20 | on | Take A | A termina | próximo da ordem |
| M14 | 2 | on | Take A, F1–F6 cena | A termina | cena tem prioridade; automação pausa |

---

## 7. UX proposta

### 7.1 Um controle por modo

- **Estúdio:** “Seguir no palco”.
- **Mesa:** “Seguir no PGM”.
- Tooltip explica a diferença; não usar o mesmo rótulo para as duas máquinas.

### 7.2 Painel Mídia

- Status:
  > **Seguindo:** ativo · Modo: PGM · Próximo: “Clipe 2” · Corte seco
- Selo **NO AR** no vídeo atual e **PRÓXIMO** no seguinte.
- Quando o operador assume outra fonte:
  > “Automação pausada: take manual em Câmera 1.”

### 7.3 Mesa

- Badge na prévia: “Próximo da playlist”.
- Nunca mostrar dois vídeos com áudio no PGM.
- Se o PGM é câmera, não trocar; mostrar o próximo como disponível.

### 7.4 Estúdio

- Se era Solo, continuar Solo; não cair silenciosamente para layout.
- Se era layout, trocar apenas o slot de mídia.
- Se o operador voltou ao layout antes do fim, cancelar automação.

### 7.5 Fim da lista

- Aviso claro e ação “Voltar para a Cena”.
- Não manter frame congelado sem selo.

---

## 8. Arquitetura sugerida

```text
MediaAirCoordinator
  - current { id, mode, air, seq, take, solo, stage }
  - follow (bool)
  - mode: manual | follow | rotate
  - arm(id)          // chamado no play
  - invalidate()     // take/solo/stage/mode mudou
  - onEnded(id)      // só age se o token ainda valer
  - followStudio(ctx, next)
  - followMesa(ctx, next)
```

### Regras de segurança

- `followStudio` só usa `setStage`/`setSolo`; **nunca** `cutTo`.
- `followMesa` só usa `cutTo` quando `ctx.air === 'take'`.
- `take` de câmera ou fonte não-mídia invalida o token.
- Troca de modo Estúdio ↔ Mesa invalida.
- F1–F6/take remoto invalidam.
- Próximo inválido não altera nada.
- `audio-only` nunca vira tela cheia.
- Loop não dispara follow.
- Um `ended` antigo (fonte já removida) não pode agir.

---

## 9. Plano de testes

### 9.1 Estado

- Todos os casos E1–E10 e M1–M14.
- Token invalidado por take manual, Solo, mudança de modo, remoção.
- `ended` repetido/atrasado não segue duas vezes.
- Loop e fim de lista.

### 9.2 Áudio

- Apenas um vídeo com áudio no PGM.
- Próximo não vaza antes do corte.
- Áudio-only não ocupa tela.
- Vídeo anterior pausa ao sair.

### 9.3 Visual

- Estúdio: Solo herdado, layout preservado, slot de mídia correto.
- Mesa: take/corte/AUTO, Cena e Cena+Solo.
- DSK/banner/legendas/vertical/retorno do convidado.
- Sem frame preto no fim.

### 9.4 Critérios de aceite

- [ ] Estúdio nunca chama `cutTo`; Mesa só corta quando o contexto é `take`.
- [ ] Take manual em câmera nunca é desfeito.
- [ ] Solo é herdado no Estúdio e na Cena+Solo da Mesa.
- [ ] PGM em Cena sem Solo não vira take por acidente.
- [ ] Prévia manual é preservada.
- [ ] Um vídeo com áudio por vez.
- [ ] Fim de lista não congela sem aviso.
- [ ] Casos E1–E10 e M1–M14 passam.

---

## 10. Roadmap

### Fase 0 — Decidir
- Follow opt-in ou padrão com playlist?
- Corte ou AUTO?
- Fim da lista: Cena, FIM ou último frame?
- Herdar Solo em ambos os modos?
- Rodízio no MVP?

### Fase 1 — Coordenador e follow
- Token de contexto.
- Follow Estúdio (Solo/layout).
- Follow Mesa (take/Cena/Solo).
- Cancelamento por take manual.
- Avisos e selos.

### Fase 2 — Bordas
- Fim de lista, loop, áudio-only, removido, erro.
- F1–F6, co-host, remoto, prévia manual.
- Testes E/M completos.

### Fase 3 — Rodízio
- 2+ vídeos alternando com opt-in.
- UI de pausa/retomada.
- Tempo/duração por item.

---

## 11. Decisões em aberto

1. “Seguir” vem ligado quando a playlist liga, ou opt-in?
2. Estúdio: herdar Solo do vídeo anterior?
3. Mesa: Cena com Solo deve herdar Solo, ou voltar ao layout?
4. Mesa: se o PGM é câmera, o próximo vai para prévia, palco ou nada?
5. Playlist desligada: dois vídeos podem tocar juntos ou um pausa o outro?
6. Fim da lista: voltar para Cena, cartão FIM ou manter frame?
7. Rodízio de 2+ vídeos no palco entra agora?
8. Se o próximo falhar, esperar, pular ou voltar para Cena?
9. O follow deve usar corte seco ou acompanhar o AUTO configurado?

---

## 12. Veredito EGM

A automação não pode ser uma função só; precisa ser um **coordenador com contexto**.

O erro a evitar é tratar “Estúdio” e “Mesa/PGM” como o mesmo lugar:

- no Estúdio, a tela cheia é **Solo** e não existe take;
- na Mesa, a tela cheia é **take**; a Cena pode ter Solo, mas continua sendo Cena;
- a prévia só existe na Mesa;
- a playlist pode trocar o palco sem trocar o PGM.

Com a regra:

> **Só segue se o vídeo que terminou ainda estiver no ar, no mesmo modo e no mesmo papel, e o operador não tiver assumido outra fonte.**

…o comportamento fica previsível nos dois modos, sem roubar câmera, sem perder Solo e sem congelar o
PGM no último frame.


---

## 13. Implementação local (2026-11-03)

### Feito

- **Controle:** toggle **Seguir vídeo no ar** na Playlist, separado de “Tocar um após o outro”;
  padrão ligado, cancelável pelo operador.
- **Contexto de quem está no ar:** `mediaAirContext` distingue Estúdio (`solo`/`scene`) de Mesa
  (`take`/`soloScene`/`scene`/`preview`); o follow só age se o contexto ainda for o mesmo.
- **Fim do vídeo:** `playlistStep(..., {auto:true})` segue o próximo se o token ainda valer.
- **Play manual:** iniciar outro vídeo com o anterior no ar também comuta, desde que o follow esteja
  ligado. No modo Estúdio nunca chama `cutTo`; na Mesa só chama quando o papel é `take`.
- **Estúdio:** Solo é herdado; layout troca só o slot de mídia.
- **Mesa:** take A → take B; Cena+Solo A → Cena+Solo B; Cena/layout → palco; prévia preservada;
  PGM em câmera não é roubado.
- **Áudio:** os outros vídeos pausam; um vídeo com áudio por vez.
- **Fim da lista:** volta para a Cena (take/Cena+Solo) e avisa; sem frame congelado silencioso.

### Ainda não implementado

- Rodízio por tempo/duração com 2+ vídeos no palco.
- Escolha entre corte seco e AUTO no follow (hoje é corte).
- Sincronização do toggle com co-host/controle remoto.
- Teste de todas as 24 combinações E/M em CI.

### Testes locais realizados

Com dois MP4s reais (1,5 s, vermelho e azul):

| Cenário | Resultado |
|---|---|
| Mesa, take A → fim | B virou take; A pausado |
| Play manual de B com A no PGM | B virou take; stage trocado; A pausado |
| Estúdio, Solo A → fim | B herdou o Solo |
| Estúdio, A no layout → fim | B substituiu A no palco; sem Solo |
| Mesa, Cena + Solo A → fim | B herdou o Solo; take continuou nulo |
| Take manual em câmera antes do fim | automação **não** roubou o PGM |
| Fim da lista | Solo/take limpos; aviso; sem tela preta |

`node --check` e `npm run test:security`: OK.

### Build local

`dist/CastDeck.exe` 190.842.368 bytes; SHA-256
`9652ffc3a66a86cfeeffcedaaf6fae3f6145b977ed5df2d357fe914cba92f0c9`.
VPS/GitHub não receberam esta implementação.
