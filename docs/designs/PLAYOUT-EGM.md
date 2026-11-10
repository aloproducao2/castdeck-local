# EGM — Playout e ordem do mini player

> **Status:** publicado na 1.3.29 (2026-11-04); fases 0–2, fase 3 parcial.
> **Base:** CastDeck Local 1.3.28 + alterações locais (i18n, Diretor em acordeão).
> **Data:** 2026-11-03

---

## 1. Pedido

1. O mini player de vídeo deve seguir a **ordem da miniatura em relação ao posicionamento na fila**.
2. Ajustar o menu.
3. Criar um painel separado para ele chamado **Playout**.

O ponto central não é “mover uma caixinha”: é ter **uma única ordem de fila** e uma **única posição
atual**, usadas por:

- miniaturas da biblioteca;
- mini player do deck;
- botões anterior/próximo;
- playlist automática;
- novo painel Playout;
- controle remoto e cohost.

---

## 2. O que existe hoje

### 2.1 Ordem atual

`mediaList()` devolve os vídeos/áudios na ordem em que estão no `Map` de `S.sources`
(`studio.js`, ~linha 2655).

- Arrastar miniatura (`reorderMedia`) e “mover na playlist” (`moveMedia`) **reconstroem o Map**.
- A grade mostra “ordem = playlist”; o número da miniatura é o índice na lista completa.
- O `<select>` do mini player também usa `mediaList()` e numera `1.`, `2.`…
- A playlist automática (`playlistStep`) também usa `mediaList()`.

Ou seja: **a ordem já é compartilhada** — mas está acoplada à ordem de inserção do `Map` e não existe
uma fila explícita.

### 2.2 Mini player hoje

`tickDeck()` (`studio.js`, ~linha 4588):

- escolhe o item focado pelo **take**, depois pelo **palco**, depois pela **prévia**;
- esse foco **sobrescreve** `deckSel`;
- o `<select>` é reconstruído quando `id + label` da lista muda;
- `dm-prev` / `dm-next` andam em `mediaList()`;
- “Tocar playlist” (`pl-next`) usa o item **tocando** ou o primeiro, não a seleção do mini player.

### 2.3 Problemas que isso cria

**P1 — Seleção sobrescrita**
O operador escolhe o vídeo 4 no mini player; se o vídeo 2 está no palco, o próximo tick volta para o
2. A seleção não é estável.

**P2 — Duas noções de “atual”**
Existem:

- item selecionado no mini player (`deckSel`);
- item tocando;
- item no take/palco/prévia;
- “próximo” da playlist.

Cada um pode apontar para um lugar diferente. O operador perde a noção de posição na fila.

**P3 — Número da miniatura × posição no mini player**
A grade numera a lista completa, mas filtros/busca escondem cartões. O `<select>` do mini player
também usa a lista completa. Funciona por coincidência, mas não há um contrato explícito de
“posição na fila”.

**P4 — Fila acoplada ao `Map`**
Qualquer código que insira/remova uma fonte pode alterar a ordem da fila. Imagens, câmeras e telas
compartilham o mesmo `Map`; a fila de mídia não tem estrutura própria.

**P5 — Playout escondido em Mídia**
O painel Mídia acumula:

- biblioteca e importação;
- download do YouTube;
- imagens;
- mini player;
- controles de playlist;
- automação (seguir, repetir, tocar um após o outro).

Isso mistura **biblioteca** com **operação no ar** — dois trabalhos diferentes.

---

## 3. EGM — seis lentes

### 3.1 Operador

O operador ao vivo precisa responder em 2 segundos:

1. o que está no ar?
2. o que está tocando?
3. o que vem depois?
4. qual é a posição desse item na fila?
5. como pular/voltar sem mudar o que está no ar por acidente?

O painel Playout deve responder a essas perguntas sem abrir a biblioteca.

### 3.2 Fila / estado

Precisa existir uma **fila canônica**:

```text
queue = [mediaId1, mediaId2, mediaId3, ...]   // somente vídeos/áudios
cursor = mediaId                               // item selecionado para transporte
playing = mediaId | null                       // o que está tocando
onAir = mediaId | null                         // o que está no PGM
```

`queue` é a ordem. `cursor` é a posição de trabalho. `playing` e `onAir` são estados de saída, não
devem sobrescrever o cursor sem ação explícita.

### 3.3 Interface / menu

- **Mídia** = biblioteca: importar, organizar, editar, imagens.
- **Playout** = operação: fila, mini player, agora/próximo, automação.
- **Deck** = acesso rápido ao playout durante a live.

O nome “Mídia Player” no deck deve virar **Playout** para não competir com “Mídia”.

### 3.4 Automação

- Fim do vídeo → próximo da fila.
- “Tocar playlist” → começa no cursor (ou no primeiro, se não houver cursor).
- “Seguir no palco/PGM” → só troca o que está no ar; não muda a ordem.
- Loop → volta ao começo da fila.
- Manual take no PGM → marca “No ar”, mas **não reposiciona** o cursor sozinho.

### 3.5 Robustez

- Não criar um segundo elemento `<video>` para o painel Playout; usar o mesmo `S.sources`.
- Miniaturas do Playout podem ser leves (canvas/thumbnail existente); não capturar stream novo.
- Migrar sessões antigas: se não houver `queue`, derivar da ordem atual do `Map`.
- Cohost/remote devem receber `queue` + `cursor`, não uma lista sem posição.

### 3.6 Testes / manutenção

- Testes de ordem e posição, não só “toca/não toca”.
- Teste de arrastar, filtrar, buscar, reiniciar, excluir, loop, fim de vídeo e controle remoto.
- Teste de i18n do novo painel.

---

## 4. Opções e ponderação

### Opção A — Só corrigir o mini player dentro de Mídia

**O que é:** manter o painel atual; separar `cursor` de `onAir`; usar a ordem da lista.

- **Prós:** menor esforço; menos risco; resolve a seleção sobrescrita.
- **Contras:** menu continua misturando biblioteca e playout; o pedido do painel separado não é
  atendido; a fila continua acoplada ao `Map`.
- **Veredito:** insuficiente.

### Opção B — Criar Playout e mover tudo para lá

**O que é:** Mídia vira só biblioteca; todo o mini player/playlist sai do deck e vai para Playout.

- **Prós:** separação conceitual limpa; um único lugar para operar.
- **Contras:** ao vivo, abrir um painel para dar play/pular é mais lento; o deck perde o controle
  rápido; risco de regressão grande.
- **Veredito:** bom para organização, ruim para operação ao vivo.

### Opção C — Playout completo + deck compacto (recomendada)

**O que é:**

- criar a aba **Playout** com fila, agora/próximo e mini player completo;
- manter no deck um **controle compacto** de play/pause/anterior/próximo, com rótulo Playout;
- Mídia fica com biblioteca/importação/imagens;
- os dois usam a mesma fila e o mesmo cursor.

- **Prós:** operação rápida no deck; organização no painel; uma única fonte de verdade; atende ao
  pedido sem sacrificar a live.
- **Contras:** mais código e mais testes; é preciso deixar claro que o deck é um atalho, não outro
  player.
- **Veredito:** **recomendada**.

### Opção D — Criar um grupo de menu só para Playout

- **Prós:** destaque.
- **Contras:** um grupo com uma aba só aumenta a densidade do menu; o padrão atual é grupo com
  várias abas.
- **Veredito:** não vale a pena. Playout entra em **Conteúdo**, logo após Mídia.

### Comparação

| Critério | A | B | C | D |
|---|---|---|---|---|
| Ordem estável | parcial | sim | **sim** | sim |
| Operação ao vivo | boa | ruim | **boa** | boa |
| Painel separado | não | sim | **sim** | sim |
| Menu limpo | ruim | bom | **bom** | pior |
| Esforço | S | M | **M** | M |
| Risco | baixo | alto | **médio** | médio |

---

## 5. Plano recomendado

### Fase 0 — Contrato da fila (sem mudar a UI)

1. Criar `queue` canônica em `S.playlist.order` (array de IDs de mídia).
2. Criar helpers:
   - `queueList()` — retorna os itens na ordem da fila;
   - `queueIndex(id)` — posição 1-based;
   - `queueNext(id, dir)` — vizinho com wrap/limite;
   - `queueNormalize()` — remove IDs inexistentes, acrescenta mídias novas ao fim.
3. Migração: se `S.playlist.order` não existir, derivar da ordem atual de `mediaList()`.
4. Reordenar/remover/adicionar passam a operar **somente** em `queue`.
5. Não incluir imagens, câmeras, telas ou vídeo de fundo na fila.

**Critério de saída:** qualquer função que hoje usa `mediaList()` para ordem usa `queueList()`.

### Fase 1 — Mini player com posição estável

1. Separar:
   - `playoutCursor` (seleção);
   - `playing` (tocando);
   - `onAir` (PGM).
2. `tickDeck()` **não sobrescreve** o cursor quando há take/palco/prévia. Apenas mostra badges
   “No ar”, “No palco” e “Tocando”.
3. Exceções que movem o cursor:
   - iniciar um item pela biblioteca/deck;
   - playlist automática avançar;
   - usuário escolher no `<select>` ou na fila.
4. `dm-prev` / `dm-next` usam `queueNext`; não usam `mediaList()` bruto.
5. `pl-next`/`pl-prev` usam o cursor quando ele existe; senão, o item tocando; senão, o primeiro.
6. Números:
   - cartão da biblioteca = `queueIndex`;
   - opção do `<select>` = `queueIndex`;
   - item do Playout = `queueIndex`;
   - filtro/busca não renumeram.
7. O mini player do deck mostra `posição/total` e o título; o `<select>` lista a fila inteira.

**Critério de saída:** escolher o item 4, arrastar o item 6 para cima, filtrar e reiniciar a sessão
mantém posição/ordem coerentes.

### Fase 2 — Painel Playout e menu

1. Adicionar ao `TAB_GROUPS`, no grupo `content`, depois de Mídia:

   ```js
   ['playout', 'Playout', 'play', 'Fila, mini player e o que está no ar']
   ```

2. Adicionar `<div class="panel" id="panel-playout"></div>` ao esqueleto.
3. Adicionar `playout: renderPlayoutPanel` ao mapa de `renderTabContent`.
4. Layout do painel:

   - **Agora:** thumb, título, posição `3/12`, tempo, progresso, play/pause, anterior/próximo,
     volume, “No ar/No palco”.
   - **Próximo:** thumb e título do próximo da fila.
   - **Fila:** lista numerada, arrastável, com duração, badges e ações (tocar, cue, remover).
   - **Automação:** “Tocar um após o outro”, “Seguir no palco/PGM”, “Repetir a lista”.
   - **Estado vazio:** “Nenhum vídeo na fila” + botão para abrir Mídia.

5. Mídia:
   - mantém biblioteca, importação, YouTube, imagens e edição;
   - remove os controles de playlist que forem duplicados;
   - cada cartão ganha “Cue no Playout” e “Tocar agora” (sem duplicar player).
6. Deck:
   - renomear “Mídia Player” para **“Playout”**;
   - manter transporte compacto;
   - clicar no rótulo/ícone abre o painel Playout;
   - não criar segundo `<video>`.
7. Rodapé:
   - manter “Mídia” para biblioteca;
   - avaliar um botão “Playout” se o painel ficar muito escondido;
   - não adicionar atalho conflitante com `Shift+P` (projetor) ou `F` (tela cheia).

**Critério de saída:** o operador consegue dar play, pular e reordenar sem abrir a biblioteca; e
encontra a biblioteca sem ver controles de playout duplicados.

### Fase 3 — Acabamento

1. Arrastar da biblioteca para a fila (opcional).
2. “Tocar próximo” / “Cue” independentes de “Tocar agora”.
3. Indicador de duração total da fila e do restante.
4. Estado no controle remoto/cohost (`queue`, `cursor`, `onAir`).
5. Mobile: fila em lista compacta, botões grandes, sem overflow.
6. i18n do painel e do novo rótulo.
7. Persistência e migração testadas.

---

## 6. Matriz de comportamento

| Evento | Cursor | Tocando | No ar | Fila |
|---|---|---|---|---|
| Importar vídeo | não muda | não muda | não muda | novo item no fim |
| Clicar na miniatura | vai para o item | não muda | não muda | não muda |
| Play na miniatura | vai para o item | vai para o item | conforme palco/PGM | não muda |
| Próximo no deck | próximo da fila | toca se estava tocando | segue o modo | não muda |
| Fim do vídeo | próximo | próximo | follow | não muda |
| Arrastar miniatura | mesmo ID | mesmo ID | mesmo ID | nova ordem |
| Filtrar/buscar | não muda | não muda | não muda | não muda |
| Take manual de câmera | não muda | não muda | câmera | não muda |
| Take manual de mídia | vai para a mídia | conforme play | mídia | não muda |
| Excluir item atual | próximo | para | para se era o item | remove |
| Reiniciar sessão | restaura/primeiro | parado | vazio | restaura ordem |

---

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Duas fontes de verdade | `queue` única; mini player e Playout leem a mesma função |
| Seleção sobrescrita | `playoutCursor` separado de `onAir`; foco não escreve no cursor |
| Regressão no deck | manter transporte compacto; testar play/pause/next |
| Fila perdida ao recarregar | persistir `S.playlist.order`; migrar do Map |
| Imagens entrarem na fila | filtrar `kind === 'media'`; teste explícito |
| Vídeo duplicado | reutilizar `S.sources`; proibido criar segundo `<video>` |
| Painel pesado | lista leve + thumbs existentes; sem novo captureStream |
| Cohost/remote fora de ordem | enviar `queue`/`cursor`; testes de sincronização |
| Menu poluído | uma aba em Conteúdo, não um grupo novo |
| Confusão Mídia × Playout | nomes e textos explícitos; biblioteca × operação |

---

## 8. Testes

### Unitários

- `queueNormalize` com IDs ausentes/duplicados.
- `queueIndex` 1-based e filtros.
- `queueNext` com 0, 1, 2 e N itens; wrap/loop.
- Migração de sessão antiga.
- Reorder preserva cursor e playing.

### E2E

1. Importar 3 vídeos; conferir 1/2/3 na biblioteca e no mini player.
2. Arrastar o 3 para o topo; conferir deck, Playout e playlist.
3. Escolher item 2 no mini player; take de câmera não muda a seleção.
4. Play no item 2; próximo toca o 3.
5. Fim do 2 com follow ligado; próximo no PGM/palco.
6. Filtrar “a” e conferir que os números continuam os da fila.
7. Reiniciar sessão e conferir ordem.
8. Excluir item atual; conferir cursor/playing.
9. Abrir Playout no mobile; sem overflow.
10. Trocar EN/ES/PT; painel traduzido.

### Regressão

- YouTube, importação, imagens, áudio, replay, cohost, remote.
- Acessibilidade: foco, teclado, ARIA nos botões.

---

## 9. Critérios de aceite

- [ ] Existe uma fila canônica, independente da ordem do `Map`.
- [ ] Miniatura, `<select>` do mini player e Playout mostram a mesma posição.
- [ ] Arrastar miniatura reordena a fila e o mini player na mesma hora.
- [ ] Selecionar item não é sobrescrito por take/palco/prévia.
- [ ] Próximo/anterior seguem a fila, não a ordem de inserção.
- [ ] “Tocar playlist” começa no cursor (ou primeiro).
- [ ] Filtro não renumerar a fila.
- [ ] Imagens não entram no playout.
- [ ] Deck compacto e Playout compartilham estado, sem segundo player.
- [ ] Menu tem **Mídia** e **Playout** separados, sem grupo novo.
- [ ] Persistência/migração e cohost testados.
- [ ] i18n do novo painel.

---

## 10. Decisões em aberto

1. O deck mantém transporte compacto ou vira apenas um botão “Abrir Playout”?
2. O Playout deve listar **somente a fila** ou também imagens?
3. O cursor deve ser persistido entre sessões ou reiniciar no primeiro item?
4. “Próximo” deve tocar automaticamente ou apenas selecionar?
5. Vamos aceitar arrastar da biblioteca para a fila agora ou em fase 3?
6. A ordem da fila deve ser compartilhada com cohost/remote já na primeira versão?

---

## 11. Veredito EGM

O pedido é coerente, mas o problema real é maior que o mini player: **não existe uma fila explícita**.
Hoje a ordem depende do `Map`, e o foco no take/palco pode sobrescrever a seleção.

A recomendação é a **Opção C**:

1. criar a fila canônica;
2. separar cursor de “no ar”;
3. fazer o mini player seguir a fila;
4. criar o painel **Playout** em Conteúdo, depois de Mídia;
5. manter um transporte compacto no deck;
6. deixar Mídia como biblioteca.

Não vale a pena criar um grupo de menu só para Playout, nem duplicar o player. O caminho mais seguro
é implementar em fases, começando pela fila e pelo cursor, e só depois mover a UI.


---

## 12. Implementação local (2026-11-03)

- `S.playlist.order` é a fila canônica; `normalizeQueue` migra a ordem antiga e remove IDs inexistentes.
- `mediaList` / miniaturas / selects / playlist usam a mesma fila.
- Mini player segue take/palco/prévia (como antes); a fila define apenas a ordem, não a seleção.
- “Tocar playlist” começa no cursor; fim do vídeo avança na ordem da fila.
- Arrastar na biblioteca ou no Playout reordena a mesma fila.
- Nova aba **Playout** em Conteúdo, depois de Mídia; `#panel-playout` com agora/próximo/fila/automação.
- Mídia ficou como biblioteca; controles de playlist saíram de lá; link “Abrir Playout”.
- Deck renomeado para **Playout**; clique no rótulo abre o painel.
- Controle remoto do Diretor também foi acomodado no acordeão.

### Testes locais

- 3 vídeos importados: ordem 1/2/3, opções `1/3`, `2/3`, `3/3`.
- Selecionar o item 2 com o item 1 no palco volta ao item 1 — foco de tela prioritário.
- Próximo no Playout segue a fila.
- Arrastar o 3º para o topo reordena para `[3,1,2]`.
- Reiniciar a sessão restaura `[3,1,2]`.
- Playlist inicia no cursor e avança para o próximo da fila.
- EN/ES/PT no painel Playout.
- Sem erros de runtime; `npm run test:security` OK.

**Build local:** 190.865.920 bytes; SHA-256
`94ae35993452009456a827d0336926c68cd6ec76ebc11a598ee7e618b3b563c4`.

### Ainda não implementado

- Arrastar da biblioteca para a fila em um gesto dedicado (hoje o arrastar reordena).
- Sincronização explícita de `queue`/`cursor` no cohost/remote.
- Remover item da fila sem abrir “Mais ações”.
- Teste de soak com filas grandes.
