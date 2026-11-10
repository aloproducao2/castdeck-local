# EGM — Auditoria do Replay/VAR, inconsistências e plano

Status: **auditoria concluída, plano proposto (sem código alterado)** · Data: 2026-11-01
Base estudada: `docs/ai/ESTUDO-REPLAY.md`, `PLANO-MODULO-REPLAY-VAR.md`, `ANALISE-REPLAY-VAR.md`,
`public/js/studio/replay-engine.js`, `public/js/replay.js`, `public/js/replay-quad.js`, `server/replay.js`.

---

## 1. Concept brief (6 lentes)

| Lente | Pergunta | Resposta |
|---|---|---|
| Valor | O replay entrega o que promete? | Sim: buffer em RAM, clipe, câmera lenta, playlist, VAR 4 câmeras e gravação de partida já existem. O risco hoje é **consistência operacional**, não falta de recurso. |
| Viabilidade | As correções cabem na arquitetura atual? | Sim. Os problemas mais graves são de **ciclo de vida e sincronização**, não de desempenho. Rust só se justifica se 4 ISO em 60 fps for meta. |
| Custo | Quanto custa corrigir? | P0 (segurança e precisão) ≈ 1 dia. P1 (experiência) ≈ 2–3 dias. Rust: semanas. |
| Risco | O que pode quebrar uma live? | Replay no ar sem console (PGM preto), "ao vivo" em câmera lenta por rate herdado, buffer zerado ao trocar câmera, OUT impreciso para VAR. |
| Acessibilidade | O operador consegue operar sozinho? | Hoje precisa focar a janela do console; os atalhos não existem no estúdio e F11/F12 colidem com o navegador. |
| Operação | Dá para confiar no estado? | Falta indicador global de buffer/on-air no estúdio e recuperação automática ao fechar o console. |

---

## 2. Achados (inconsistências verificadas no código)

| ID | Sev. | Evidência | Impacto |
|---|---|---|---|
| **RE-01** | **Alta** | `unregisterConsole` (`replay-engine.js:139-145`) remove a fonte e para o buffer, mas **não chama `stopPlayout`**; `previousStateBeforeReplay` fica vivo e `S.stage/S.take` continuam em `replay:out`. | Fechar o console com replay no ar deixa o **PGM preto/preso** até um TAKE manual. É o pior cenário em live. |
| **RE-02** | Média | `syncPreviewPlayout` (`replay-engine.js:833-869`) só ajusta `playbackRate` no ramo de **URL**; no ramo `srcObject` (sinal ao vivo) não reseta. | Depois de um replay em 0,5×, o espelhamento "ao vivo" pode continuar em **câmera lenta**. |
| **RE-03** | Média | Atalhos só em `replay.js:2037-2105` (`window` do console). O estúdio não trata F8–F12 (`studio.js:1944-1949` só trata `KeyF`). | O plano previa atalhos **globais**; hoje o operador precisa focar a janela do console. |
| **RE-04** | Média | `setCaptureSource` → `restartBuffer()` (`replay-engine.js:90-93` e `187-194`). | Trocar a câmera de captura **zera os 45 s** do buffer sem aviso. No modo 4 ISO isso não acontece (buffers próprios), mas o buffer principal some. |
| **RE-05** | Média | Corte de OUT por `playoutVideo.ontimeupdate` (`replay-engine.js:672-685`). | `timeupdate` dispara a ~4–66 Hz: o OUT pode **passar do ponto** em até ~250 ms. Insuficiente para VAR frame-accurate. |
| **RE-06** | Baixa/Média | `createClip` usa `nowTc = max(perf, último cluster)` (`replay-engine.js:381-425`); o MediaRecorder entrega em fatias de 1 s. | O clipe pode terminar com até **~1 s sem frame novo** (cauda congelada) e a duração declarada não bate com o último frame. |
| **RE-07** | Média | Buffer contínuo (`replay-engine.js:206+`) e gravação de partida (`replay-engine.js:909+`) criam **dois MediaRecorder** no mesmo sinal. `beforeunload` só protege a partida (`replay-engine.js:25-30`). | CPU de codificação **dobrada**; risco de queda de fps no PGM em PCs modestos. |
| **RE-08** | Baixa | `updateBufferStatus` repete o bloco `if (!isActive)` (`replay.js:204-237`) e divide por `maxDuration` sem guarda. | Código morto e risco de `NaN%` se o stat vier sem `maxDuration`. |
| **RE-09** | Baixa | `loadAtNow` cai para `offset: 0` quando o ângulo não tem histórico (`replay-quad.js:150-155`), mas o toast diz "congelados no mesmo instante" (`replay-quad.js:199`). | Operador acredita que os 4 ângulos estão alinhados quando um está em outro instante. |
| **RE-10** | Baixa | `playoutReplay` define `playbackRate` mas não `preservesPitch` (`replay-engine.js:660-669`); só `setPlayoutSpeed` define (`739-748`). | Em alguns navegadores o áudio do slow motion pode mudar de tom ao iniciar direto em 0,5×. |
| **RE-11** | Média | `onGlobalKeyDown` usa **F11** e **F12** (`replay.js:2092-2097`) sem checar modificador. | F11 = tela cheia do navegador e F12 = DevTools; atalhos podem **não chegar** ou abrir ferramentas no meio da operação. |
| **RE-12** | Baixa | `stopPlayout` limpa `src`/`srcObject` (`replay-engine.js:820-825`); a fonte `replay:out` fica preta. | Se o operador voltar ao replay sem novo TAKE, o preview do PGM fica preto (documentado no código, mas é armadilha). |

---

## 3. Melhorias propostas

**P0 — segurança e precisão (fazer antes de qualquer recurso novo)**
1. **Encerrar replay ao fechar o console** (RE-01): `unregisterConsole` chama `stopPlayout()` quando `S.solo/S.take === 'replay:out'` ou existir `previousStateBeforeReplay`; restaurar cena e disparar stinger de retorno.
2. **Reset de `playbackRate` no espelhamento ao vivo** (RE-02): no ramo `srcObject`, forçar `playbackRate = 1` e `preservesPitch = true`.
3. **Corte de OUT no frame** (RE-05): trocar `timeupdate` por `requestVideoFrameCallback` (fallback `timeupdate`) e pausar no primeiro frame com `currentTime >= markOut`.
4. **Atalhos sem colisão com o navegador** (RE-03/RE-11): manter F8/F9/F10 para 5/10/15 s; 30 s em **Shift+F10** ou `Ctrl+Alt+3`; "salvar lance" em **Ctrl+Alt+S**; adicionar os mesmos atalhos no estúdio com guarda de foco (não disparar em input/modal). Documentar.
5. **Cauda do clipe** (RE-06): encerrar o clipe no **último timecode real** (último cluster + 1 frame) e alinhar a duração a isso.

**P1 — experiência e previsibilidade (2–3 dias)**
6. **Preservar buffer ao trocar de fonte** (RE-04): avisar "buffer será reiniciado" e/ou manter o buffer antigo por 10 s enquanto o novo enche; no console, mostrar claramente `fonte mudou — buffer em 0`.
7. **Indicador global no estúdio** (RE-13): chip no topo com `REC buffer 32/45 s` e estado `REPLAY NO AR`, clicável para abrir o console.
8. **Unificar gravação** (RE-07): gravar a partida **a partir dos chunks do buffer** (mux no servidor, sem segundo encoder) ou desligar o buffer enquanto a partida grava, com aviso.
9. **ISO com aviso de desalinhamento** (RE-09): se algum ângulo não tiver histórico, toast "3 de 4 ângulos alinhados".
10. **Limpeza** (RE-08): remover bloco duplicado do HUD e proteger a divisão.

**P2 — motor nativo (só se necessário)**
11. Migrar ring buffer/remux para Rust (`castdeck-replay-core`) **se** as medições mostrarem quedas de fps com 4 ISO em 60 fps ou se o remux atual não der conta de clipes longos. Antes disso, Rust é custo sem retorno.

---

## 4. Decisão EGM (opções e recomendação)

| Opção | Escopo | Custo | Risco | Quando faz sentido |
|---|---|---|---|---|
| **A. Correções cirúrgicas** | P0 (RE-01, 02, 05, 06, 03/11) | ~1 dia | Baixo | **Agora** — elimina o risco de PGM preto e melhora a precisão |
| **B. Consolidação** | P0 + P1 (buffer preservado, gravação única, status global) | ~3–5 dias | Médio | Depois de A, com medições reais de CPU |
| **C. Motor Rust** | Reescrever buffer/remux nativo | semanas | Alto | Só se A/B não atingirem 4 ISO a 60 fps |

**Recomendação (goldfish):** **A agora; B em seguida; C adiado** até existir medição. O estudo original
superestimou o ganho do Rust para o uso atual (buffer WebM + MediaRecorder já entrega clipe em < 1 s) e
subestimou os riscos de ciclo de vida, que são o que realmente quebra a live.

**Riscos de não fazer:** RE-01 é o único que pode deixar a transmissão preta em produção; RE-11 pode abrir
DevTools no meio de um lance; RE-05 compromete a promessa de VAR.

**Riscos de fazer A:** `stopPlayout` ao fechar o console pode surpreender quem queria terminar o replay no
console — mitigado com confirmação opcional ou atalho "manter no ar".

---

## 5. Plano proposto (ondas)

### Onda 1 — P0 (1 dia)
- [ ] `unregisterConsole` → `stopPlayout()` com restauração + stinger (RE-01).
- [ ] `syncPreviewPlayout` → rate/pitch no ramo `srcObject` (RE-02).
- [ ] OUT por `requestVideoFrameCallback` com fallback (RE-05).
- [ ] Clipe termina no último timecode real (RE-06).
- [ ] Atalhos novos no console + estúdio (RE-03/RE-11), com guarda de foco.
- [ ] Testes: fechar console no ar; espelhar ao vivo após 0,5×; OUT em 0,25×; clipe de 5 s duração real.

### Onda 2 — P1 (2–3 dias)
- [ ] Preservar buffer na troca de fonte (aviso + buffer antigo por 10 s) (RE-04).
- [ ] Chip de status global no estúdio (buffer + on-air) (RE-13).
- [ ] Gravação de partida a partir dos chunks (sem segundo encoder) (RE-07).
- [ ] Aviso de alinhamento no ISO 4 (RE-09); limpeza do HUD (RE-08).
- [ ] Testes: trocar câmera no meio do lance; gravar partida + replay; 4 ISO em 30/60 fps.

### Onda 3 — P2 (avaliar)
- [ ] Medir CPU/fps com 4 ISO a 60 fps e clipes de 30 s.
- [ ] Só então decidir Rust (`castdeck-replay-core`) ou otimizações no pipeline WebM.

---

## 6. Critérios de aceite

- Fechar o console com replay no ar **nunca** deixa o PGM preto; cena anterior restaurada em < 1 s.
- Após qualquer replay em 0,25–0,75×, "ao vivo" volta a **1,00×** (verificável no console).
- OUT de um clipe em 0,25× erra no máximo **1 frame**.
- Clipe de 5 s tem duração de arquivo entre 5,0 e 5,1 s (sem cauda congelada).
- Nenhum atalho abre tela cheia/DevTools.
- Gravar partida + replay não reduz o fps do PGM (medido com preset 60).

---

## 7. Perguntas para decidir (discussão)

1. **Fechar o console com replay no ar:** (a) encerra e volta ao vivo automaticamente; (b) pergunta; (c) mantém no ar e avisa. *Recomendo (a) com opção "manter" apenas para quem usa 2ª tela.*
2. **Atalhos globais no estúdio:** liberar F8/F9/F10 + Shift+F10 (30 s) e `Ctrl+Alt+S` (salvar lance), ou manter os atalhos só no console? Há risco de o operador disparar replay sem querer no estúdio.
3. **Precisão do OUT:** frame-accurate é obrigatório para o VAR ou ±1 frame é aceitável?
4. **Gravação de partida:** unificar com o buffer (economiza CPU, exige mux no servidor) ou manter dois encoders (simples, mais CPU)?
5. **Rust agora ou depois:** concorda em adiar o motor nativo até medirmos 4 ISO a 60 fps?
6. **Buffer ao trocar de fonte:** preservar 10 s do buffer antigo ou aceitar reinício com aviso?

---

## 8. Decisões e status (2026-11-01)

| # | Decisão | Status |
|---|---|---|
| 1 | Fechar console com replay no ar **encerra e volta ao vivo** (recomendado) | ✅ implementado (`unregisterConsole` chama `stopPlayout`, restaura cena e dispara stinger de retorno) |
| 2 | Atalhos globais no estúdio **F8/F9/F10 + Shift+F10 (30 s) + Ctrl+Alt+S (salvar)** | ✅ implementado no estúdio (via `postMessage` ao console) e no console (F11/F12 removidos) |
| 3 | OUT **frame-accurate quando barato**: `requestVideoFrameCallback` com fallback `timeupdate` | ✅ implementado (erro ≤ 1 quadro quando rVFC existe) |
| 4 | Unificar gravação de partida com o buffer **se não gerar problema** | ⏸ **não feito**: o buffer descarta o header EBML no prune e reinicia na troca de fonte — unificar agora pode **corromper o arquivo da partida**. Plano dedicado: servidor corta clipes a partir do arquivo da partida (Onda 2). Por ora os dois encoders seguem independentes. |
| 5 | Rust adiado até medir 4 ISO a 60 fps | ✅ (sem código Rust) |
| 6 | Preservar buffer na troca de fonte **à prova de idiotas** | ✅ guarda: troca de fonte de captura é **bloqueada com replay no ar**; fora disso reinicia com aviso claro (“os clipes salvos continuam”). Snapshot do buffer antigo para clipes ficou para a Onda 2. |

**Também corrigido nesta rodada:** clipe termina no último Cluster real (sem ~1 s de cauda congelada) e
`syncPreviewPlayout` força `1,00×` no sinal ao vivo.

---

## 9. Auditoria — 4 câmeras / ISO (`replay-quad.js`)

| ID | Sev. | Achado | Evidência | Correção |
|---|---|---|---|---|
| **Q-01** | **Crítica** | **Câmera lenta não funcionava no quadrante**: o relógio mestre somava tempo de **parede**, mas os vídeos andavam em `playbackRate`; o “corrige deriva” (0,18 s) empurrava o vídeo para frente e anulava o 0,25×/0,5×. | `replay-quad.js: play()/tick()` | relógio mestre agora é em **tempo de mídia** (`t = parede × rate`) e é rebasado em `play/setSpeed/seek` |
| **Q-02** | **Alta** | **Scrub durante o play não “grudava”**: `seek()` não rebasava o relógio mestre; o tick seguinte voltava para o tempo antigo. | `replay-quad.js: seek()` | `seek` rebasa `masterStart` quando está tocando |
| **Q-03** | **Alta** | **Trocar o sinal de um slot com ISO ativo não trocava a captura**: só o preview ao vivo mudava; o ângulo continuava gravando a câmera antiga. | `replay.js: setCamSource()` + `replay-quad.js` | novo `quadIso.setSlotSource(slot, src)`: reinicia só aquele buffer e **recongela** em ~3 s; bloqueado com replay no ar |
| **Q-04** | **Alta** | O guard de troca de fonte (Onda 1) usava `S.solo/S.take` **global**: com o replay principal no ar, configurar um ângulo ISO era recusado (e o ângulo caía em PGM). | `replay-engine.js: setCaptureSource` | guard agora usa estado **do próprio motor** (`ownPlayoutOnAir`) |
| **Q-05** | Média | Slot com fonte inexistente (`media`, `screen` sem mídia/tela) caía em **PGM silenciosamente** — 4 quadrantes podiam ser o mesmo sinal. | `replay-quad.js: sourceFor()` | valida `S.sources`; cai para PGM **com aviso** listando os slots inválidos |
| **Q-06** | Média | **ISO é vídeo-only** (decisão de custo), então TAKE do quadrante vai ao ar **sem áudio do ângulo**; o comentário antigo dizia que usava o áudio do clipe. | `replay-quad.js: ensureEngine()` | comportamento mantido (evita 4 encoders Opus), comentário/UI corrigidos |
| **Q-07** | Média | Toast dizia “congelados no mesmo instante” mesmo quando um ângulo **não tinha histórico** (offset 0). | `replay-quad.js: loadAtNow()` | toast agora informa `N/4 ângulos` e quantos “sem histórico” |
| **Q-08** | Baixa | `getActive()` devolvia `slot: activeSlot` mesmo quando usava outro ângulo como fallback → TAKE rotulado errado. | `replay-quad.js: getActive()` | devolve o **slot real** do clipe |
| **Q-09** | Média | 4 encoders ISO (1,5 Mbps) + buffer principal (4 Mbps) = **5 MediaRecorders**; sem indicador de custo. | `replay-quad.js: ensureEngine()` | documentado; medição de CPU fica na Onda 2 (Rust só se necessário) |
| **Q-10** | Baixa | `disable()` não limpava o timer de recongelamento do slot. | `replay-quad.js` | `slotReloadTimer` limpo no `disable` |

**Não corrigido (decisão):** áudio por ângulo (Q-06) e alinhamento por frame entre 4 buffers (limite do
MediaRecorder). Se o VAR exigir áudio do ângulo, o caminho é capturar o áudio da fonte ativa **só do slot
selecionado** e remuxar no TAKE — Onda 2.

---

## 10. Rodada 2 — controles do PGM, lista e ISO (revisão EGM)

### 10.1 Controles do replay NO AR (PGM)

| ID | Sev. | Achado | Evidência | Correção |
|---|---|---|---|---|
| **P-01** | **Crítica** | Pausar/tocar/seek/jog não faziam efeito no replay que estava no ar: tudo ia para o `<video>` do Preview; o playout do estúdio (outra janela) não tinha API de transporte. | `replay.js: playClip/pauseClip/stepFrame/scrub`; engine só expunha `setPlayoutSpeed` | engine ganhou `isPlayoutOnAir/getPlayoutState/pausePlayout/playPlayout/seekPlayout/stepPlayout`; console roteia os controles para o PGM quando `pgmOnAir()` |
| **P-02** | Alta | Scrub/timecode continuavam mostrando o Preview; `onPvwTimeUpdate` e o `onTime` do quad sobrescreviam o scrub, brigando com o PGM. | `replay.js: onPvwTimeUpdate, initQuadIso.onTime` | ambos retornam cedo com `pgmOnAir()`; tick de 10 Hz atualiza scrub, timecode, botão e o card “no ar” |
| **P-03** | Média | Jog/shuttle não funcionava no PGM (ele chama `stepFrame`). | `replay.js: initJogWheel` | como `stepFrame` agora roteia para o PGM, o jog acompanhou |
| **P-04** | Baixa | T-Bar mudava a velocidade do PGM (via `setPlayoutSpeed`) mas o usuário não tinha feedback do tempo/estado. | `replay.js: updatePgmTransportUI` | selo `REPLAY (25%)` / `REPLAY (PAUSA)` atualizado no tick |

**Comportamento escolhido:** enquanto o replay está no ar, **os controles são do PGM**. Para preparar outro
lance no Preview sem cortar, o operador carrega o clipe e usa TAKE; o `cutToLive` devolve os controles ao Preview.

### 10.2 Lista de lances (playlist)

| ID | Sev. | Achado | Correção |
|---|---|---|---|
| **L-01** | Baixa | Estado vazio mandava apertar **F12** (atalho removido na Onda 1). | texto agora `Ctrl+Alt+S` |
| **L-02** | Média | Reordenar os lances não persistia: ao reabrir, voltava à ordem do disco. | ordem salva em `localStorage` (`castdeck.replay.order`) e aplicada no `loadSavedClips` |
| **L-03** | Média | Nenhum indicador de qual lance está **no ar**. | card ganha `.active` casando `data-url` com `getPlayoutState().url`, atualizado no tick |
| **L-04** | Baixa | `tag`/`url` do card não eram escapados. | `escapeHtml` no `src`, `data-url`, `title` e tag |
| **L-05** | Média (pendente) | Cada card cria um `<video preload="metadata">`; com 50+ lances o console carrega muito metadata. | Onda 3: thumbnail em canvas/JPEG no momento de salvar (ou lazy por interseção) |

### 10.3 ISO 4 câmeras (rodada 2)

| ID | Sev. | Achado | Correção |
|---|---|---|---|
| **Q-11** | Alta | `loadAtNow` setava `currentTime` **antes** de `load()`; o seek era descartado em alguns ângulos (quadrante preto/1º quadro). | espera `loadedmetadata` de cada vídeo (com timeout de 1,2 s) antes de buscar o offset |
| **Q-12** | Média | Se um sinal ainda estava subindo, o congelamento ficava parcial para sempre. | até 2 recongelamentos automáticos após o enable (sem atropelar quem está tocando) |
| **Q-13** | Média | **Live Mirror no modo 4 câmeras** espelhava o `pvwVideo` (escondido), mandando ao PGM o sinal errado. | mirror bloqueado no quad com aviso; `syncToPgm` ignora quad |
| **Q-14** | Baixa | `setSlotSource` recongelava uma vez só; se o buffer novo tivesse <1 s, ficava parcial. | segunda tentativa em 3,2 s |
| **Q-15** | Média | `onTime` do quad e o tick do PGM disputavam o scrub quando um clipe do quad estava no ar. | `onTime` não atualiza UI com `pgmOnAir()` |

**Ainda pendente (Onda 3):** áudio por ângulo, thumbnail leve na lista e medição de CPU com 4 ISO a 60 fps
(para decidir Rust).

---

### 10.4 Testes de aceite desta rodada

- Com replay no ar: **pausar, tocar, arrastar o scrub, rodar o jog e mudar o T-Bar** alteram o PGM.
- O tempo/scrub do PGM andam sozinhos, sem brigar com o Preview.
- Na lista, o lance no ar fica destacado; reordenar e reabrir o console mantém a ordem.
- ISO: congelar com 4 sinais; trocar o sinal de um slot; usar 0,25×; scrub tocando. Nenhum quadrante preto.

## 11. Rodada 3 — Onda 3 implementada (2026-11-01)

| ID | Entrega | Detalhe técnico |
|---|---|---|
| **A-01** | **Thumbnail leve na lista** | o card nasce com `.bc-thumb-ph` (placeholder); um `IntersectionObserver` (rootMargin 140 px) carrega 1 quadro só quando o card entra na tela, desenha em canvas 160×90 e vira `background-image` JPEG. Antes cada card criava um `<video preload="metadata">` — com 50+ lances o console carregava metadata de todos. |
| **A-02** | **Áudio por ângulo no ISO** | os motores ISO usam a trilha da **própria fonte** (câmera com microfone) e `fallbackToProgram:false` — se a fonte não tem áudio, o ângulo fica mudo em vez de embutir o PGM 4×. Slot `pgm` fica mudo. O TAKE do quadrante agora leva o áudio do ângulo (roteado por CUE/PGM/BOTH/MUTE como no single). |
| **A-03** | **Medidor do custo do ISO** | o estúdio mede o FPS real do render (`window.__castdeck.renderFps` / `renderTargetFps`, janela de 1 s no ticker); o console mostra `58/60 fps · 4/4` ao lado dos botões ISO, em âmbar quando cai >15%. É o dado que faltava para decidir Rust. |
| **A-04** | **Alinhamento mais estável** | `loadAtNow` espera `loadedmetadata` de cada ângulo antes do seek (Q-11) e recongela até 2× (Q-12); o `seek` de play/scrub rebasa o relógio mestre (Q-01/Q-02). Precisão continua limitada ao keyframe do MediaRecorder (~1 quadro) — documentado. |

**Decisão sobre Rust:** adiada até o medidor A-03 mostrar queda consistente >15% com 4 ISO a 60 fps em máquina
de teste. Sem esse dado, migrar seria custo sem retorno.

**Pendente (próxima onda):** alinhamento **frame-exato** entre 4 buffers (exige timestamps de captura por quadro,
não só relógio de parede) e thumbnail persistido no disco (hoje é gerado no cliente a cada sessão).

---

## 12. Rodada 4 — EGM: avaliação de direção e decisão

### 12.1 Estamos no caminho certo?

**Sim, com uma correção de rota.** As rodadas 1–3 atacaram causas reais (ciclo de vida do playout, relógio do
slow motion, transporte do PGM) e o single-camera foi confirmado pelo operador. Mas no quad estávamos
**corrigindo no escuro**: sem telemetria por ângulo, cada correção dependia de adivinhação. A prova veio agora:
ao testar a miniatura descobrimos que **`/api/replay/file` respondia 500** (bug de `fs.existsSync` no módulo
`fs/promises`), ou seja, **clipes em disco não tocavam** — um problema básico escondido atrás de “a lista não
funciona”.

Correção de rota: **parar de empilhar features e fechar confiabilidade + observabilidade primeiro.**

### 12.2 Opções e decisão

| Opção | Custo | Valor | Veredito |
|---|---|---|---|
| A. Mais features na lista (filtros, tags, export) | médio | baixo agora | adiar |
| **B. Confiabilidade + observabilidade** | baixo | **alto** | **escolhida** |
| C. Motor Rust | semanas | incerto | adiar até ter dados do diagnóstico |

### 12.3 Implementado (1.2.98)

- **B-01 · Clipes em disco voltaram a tocar:** `existsSync` vinha de `node:fs/promises` (não existe) → `/api/replay/file`
  e `/api/replay/thumb` davam 500. Importado de `node:fs`.
- **B-02 · Miniatura persistida:** o console gera JPEG 320×180 no momento de salvar e POSTa em
  `/api/replay/thumb/:id`; o servidor valida a assinatura JPEG, devolve `thumbUrl` na lista e apaga junto com o
  clipe. A playlist abre instantânea depois de reiniciar, sem recarregar 1 quadro de cada vídeo.
- **B-03 · Diagnóstico do ISO:** clicar no medidor `fps · N/4` mostra um relatório por ângulo (fonte, áudio,
  buffer em segundos, clipe carregado, `readyState`, `currentTime`, **deriva** vs relógio mestre) + FPS real do
  programa. Vai para a tela e para o `console`.
- **B-04 · Teste de integração das rotas:** `save → thumb POST 200 → GET 200 image/jpeg → list com thumbUrl →
  DELETE remove .jpg`; `/api/replay/file` voltou a responder 200 `video/webm`.

### 12.4 Próxima decisão (guiada pelo diagnóstico)

| Sintoma no diagnóstico | Causa provável | Ação |
|---|---|---|
| `buffer=0` ou `ready<2` | sinal/engine não subiu | corrigir captura do slot, não a UI |
| `deriva > 0,2 s` | offsets/relógio | recalibrar `startWall`/seek por ângulo |
| `fps < 85% do alvo` | custo dos 4 encoders | aí sim avaliar Rust ou reduzir bitrate/FPS do ISO |
| tudo ok mas TAKE falha | transporte/roteamento | revisar `takePreviewToPgm` do quad |

**Conclusão EGM:** direção correta, mas a prioridade agora é **medir e fechar o básico** (B). Rust só entra com
número na mão.

---

## 13. Rodada 5 — bugs de coerência achados na revisão (1.2.99)

| ID | Sev. | Achado | Evidência | Correção |
|---|---|---|---|---|
| **C-01** | **Alta** | Carregar um lance da lista (`playHighlight`/`playAll`) chamava `setSpeed`, que aplicava a velocidade **no PGM**: preparar o próximo lance **mudava a velocidade do replay que estava no ar**. | `replay.js: setSpeed` → `engine.setPlayoutSpeed` | `setSpeed(speed, { applyPgm:false })`; lista e “tocar todos” preparam só o Preview; T-Bar e presets continuam comandando o PGM |
| **C-02** | **Alta** | Se o `MediaRecorder` do buffer dava erro, `isRecording` continuava `true`: o motor dizia “gravando”, o retry nunca reiniciava e **o buffer morria em silêncio**. | `replay-engine.js: recorder.onerror` | `onerror` zera `isRecording`/`recorder` e agenda reinício em 1,5 s quando há console aberto |
| **C-03** | Média | A lista não dizia qual lance estava **no ar** (só o contorno). | `replay.html` | selo **NO AR** no card ativo |
| **C-04** | Média | No ISO, quando um ângulo não tinha histórico no instante pedido, ele era mostrado em **outro instante** e o toast dizia “congelados”. | `replay-quad.js: loadAtNow` | ângulo sem histórico é **omitido** (3 ângulos corretos em vez de 4 desalinhados); toast informa `N/4` |

**Leitura EGM:** os dois bugs “altos” (C-01/C-02) são de **coerência de estado**, não de feature — reforçam a
decisão da rodada 4: confiabilidade antes de mais recursos.

---

## 14. “O replay dá saltos ao mudar a posição” — análise EGM e correção (1.2.100)

### 14.1 De onde vêm os saltos

| # | Origem | Evidência |
|---|---|---|
| S-1 | Scrub do PGM cravava `currentTime` a **cada evento** de `input`; a cada passo o decoder pula para o keyframe e volta. | `replay-engine.js: seekPlayout` |
| S-2 | Quadrante corrigia deriva com **seek seco** sempre que passava de 0,18 s — sob carga (4 decoders) isso acontecia a cada quadro e virava tremor. | `replay-quad.js: tick` |
| S-3 | `seek()` do quad cravava `currentTime` nos **4 vídeos** por evento de scrub, mesmo tocando. | `replay-quad.js: seek` |
| S-4 | WebM do MediaRecorder tem keyframe a cada ~1 s: qualquer seek decodifica do keyframe, então um salto grande é inevitável **sem** blend. | `replay-engine.js: createRecorder` |

### 14.2 Correção implementada (convergência suave)

- **PGM:** `seekPlayout` com o vídeo tocando e distância ≤ **0,75 s** não crava posição: define um alvo e o loop
  de `requestVideoFrameCallback` ajusta `playbackRate` (até ±60% da velocidade base, clamp 0,05–2×) até convergir;
  ao chegar (≤40 ms) volta à velocidade base. Distância maior (ou pausado) continua seek real.
- **Quadrante:** o tick corrige deriva **±12%** de velocidade em vez de seek seco; seek real só acima de **0,6 s**.
- **Scrub do quadrante tocando:** rebasa o relógio mestre e **não** crava `currentTime` — o tick converge.
- `getPlayoutState()` expõe `baseSpeed`; o selo mostra 50% e não o “137%” transitório da convergência.
- Novo `stopSoftSync()` no `stopPlayout` (nenhum loop fica rodando após o corte).

### 14.3 “Blendframes” de verdade — decisão

O navegador **não mistura quadros** de um `<video>`: o compositor desenha o elemento direto no PGM. Para ter
dissolução entre o quadro antigo e o novo no seek seria preciso:

| Opção | Como | Custo/risco |
|---|---|---|
| **B. Canvas A/B (recomendada)** | 2 `<video>` + canvas; ao buscar, o canvas segura o quadro atual, o B busca o alvo e faz dissolve de ~120 ms; o canvas vira a fonte `replay:out` (áudio continua no mixer). | Médio: o compositor hoje espera `videoWidth`/`readyState`; exige shims e teste de PGM/OBS |
| C. Interpolação real (RIFE/optical flow) | gerar quadros intermediários | Alto (GPU/CPU), fora do escopo local |
| D. Só keyframes menores (0,5 s) | reduzir o salto do seek | Baixo, mas aumenta bitrate e não elimina |

**Decisão EGM:** entregar **A (convergência suave) agora** — resolve o tremor contínuo e a maioria dos saltos de
scrub — e **não** trocar o caminho de vídeo do PGM sem aprovação, porque B mexe na fonte que vai ao ar. B fica
como próxima fase, com teste em OBS/vMix.

### 14.4 Testes de aceite

- Tocar um replay e arrastar o scrub em passos pequenos: o vídeo **acompanha sem pular** (pode acelerar/desacelerar).
- Quadrante em 0,25× por 30 s: sem “tremida” de correção; deriva ≤ 0,05 s no diagnóstico.
- Jog continua passo-a-passo (pausa + seek de 1 quadro), como esperado.
- Salto grande de scrub (>0,75 s) continua cortando direto — é o comportamento correto sem blend.

---

## 15. Blend de quadros no PGM — canvas A/B (1.2.101)

### 15.1 Arquitetura

```
<video id interno> ──desenha──► <canvas replay:out> ──► compositor ──► PGM/OBS
        └── áudio (mixer) ─────────────────────────────► programa
```

- O compositor passou a desenhar **o canvas**, não o `<video>`. O áudio continua vindo do `<video>` no
  mixer (`mixer.addElement('replay:out', playoutVideo)`), então CUE/PGM/BOTH/MUTE não mudaram.
- O canvas tem shims de `videoWidth`/`videoHeight`/`readyState`/`paused`/`ended`/`duration`/`currentTime` e
  `play`/`pause`/`load`, para continuar se passando por um elemento de mídia no compositor, backstage,
  mesa de corte e lista de mídias.
- Loop de desenho: `requestVideoFrameCallback` quando tocando (1 cópia por quadro apresentado), 16 ms durante
  o dissolve e 80 ms quando pausado (para o scrub aparecer no PGM).

### 15.2 Dissolve

- Seek real (distância > 0,75 s ou pausado): tira um **snapshot do quadro atual**, muda `currentTime` e faz
  **dissolve de 140 ms** do quadro antigo para o novo.
- Convergência suave (≤0,75 s tocando): sem dissolve — o movimento é contínuo por velocidade.
- Passo de quadro (jog/VAR): **sem** dissolve, para não borrar a inspeção quadro-a-quadro.
- `stopPlayout` limpa o canvas para preto (não deixa o último quadro “fantasma” ao voltar ao vivo).

### 15.3 Teste headless (executado)

- `replay:out` registrado com `el.tagName = CANVAS`; `S.stage` contém `replay:out` após o TAKE.
- Canvas com pixels não-pretos durante o playout (média 85 = fundo vermelho do clipe de teste).
- `seekPlayout(2.0)` retorna `{onAir:true, time:2, duration:3.008, baseSpeed:0.5}` sem exceções.
- **Canvas do programa** com pixels não-pretos (média 74): o compositor realmente desenha o blend no PGM.
- Nenhuma exceção de runtime registrada.

### 15.4 Risco e rollback

O caminho de vídeo do PGM mudou (elemento → canvas). Rollback de 1 linha: em
`ensureReplaySourceRegistered`, voltar `el: playoutVideo` e `comp.upsertSource(... el: playoutVideo)`.
Custo extra: 1 `drawImage` de 1280×720 por quadro apresentado (~1–2 ms). Se o teste em OBS/vMix mostrar
perda, o rollback não afeta áudio nem o resto do replay.



---

## 16. Rollback do blend por canvas (1.2.102/1.2.103)

O blend por canvas (1.2.101) **piorou o replay na prática** (relato do operador: "funcionava melhor antes, agora
está falhando"). O caminho de vídeo do PGM voltou a ser o `<video>` direto — o mesmo de 1.2.100 — atrás da flag
`BLEND_OUTPUT = false`. O código do canvas fica preservado para retomada com teste controlado.

Também foi adicionada uma **trava de segurança** na convergência suave: se o alvo não for alcançado em 1,2 s, o
playout crava a posição e restaura a velocidade base — nunca fica preso numa velocidade errada.
