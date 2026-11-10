# EGM — Mesa de áudio: auditoria, roteamento de saídas e plano

> **Status:** Fase 0 + núcleo da Fase 1 implementados na **versão local 1.3.1** (não publicada na VPS).
> O restante do plano segue nas seções 6 e 11.
> **Data:** 2026-11-01
> **Escopo:** mesa de áudio do estúdio (`AudioMixer`), painel Áudio, sinais ISO, controle remoto e o pedido
> de **direcionar qualquer sinal de áudio para uma interface de saída**.

---

## 1. Concept brief (6 lentes)

| Lente | Pergunta | Resposta |
|---|---|---|
| **Valor** | O que o operador ganha? | Escolher o que vai para cada saída física (fone, PGM, aux de convidado, interface USB) e ouvir um canal sem colocá-lo no ar. É o que separa “chat com áudio” de mesa de broadcast. |
| **Viabilidade** | Cabe no navegador? | **Sim, com limites**: `AudioContext.setSinkId`/`HTMLMediaElement.setSinkId` permitem vários dispositivos, mas cada contexto tem **um** destino. Vários mixes exigem um barramento por saída + elemento oculto com `setSinkId` (ou contexto por dispositivo). Pares 3+4/5+6 do mesmo dispositivo são limitados no Chromium. |
| **Custo** | Quanto custa? | P0 (bugs) ≈ 1–2 dias. Núcleo de buses/roteamento/Solo ≈ 4–6 dias. Nível console (AFV, grupos, EQ/comp, presets, remoto) ≈ 1–2 semanas. |
| **Risco** | O que pode quebrar? | O caminho do **PGM** é sagrado: um bus mal ligado pode tirar o host do ar ou criar realimentação. Por isso a implementação precisa de caminho paralelo + testes e nunca trocar o grafo do programa de uma vez. |
| **Acessibilidade** | Dá para operar sozinho? | Hoje não: sem Solo/PFL, sem “no ar” por canal, sem roteamento. O operador precisa adivinhar e testar ao vivo. |
| **Operação** | Confia no estado? | Não. Há estados divergentes (mute remoto × botão do host, master remoto × fader, CC × legenda mestre) — exatamente os “botões que deveriam atuar juntos”. |

---

## 2. Benchmark

### 2.1 vMix — mixer e saídas

Fonte: [vMix Audio Mixer](https://www.vmix.com/help26/Mixer.html) e [vMix Audio Outputs](https://2354.vmix.com/help28/AudioOutputs.html).

| Recurso vMix | Comportamento | O que ensina |
|---|---|---|
| **Master + Bus A/B (até A–G)** | O mixer mostra Master ao lado de A e B; até **8 mixes** independentes | O CastDeck precisa de **buses nomeados**, não só “programa”. |
| **Botões M / A / B por entrada** | Cada input escolhe em quais mixes entra; padrão só Master | Roteamento é **por canal × bus**, um clique por célula. |
| **Solo** | Prévia no fone **pós-fader/pós-efeitos**, audível **mesmo com o canal mudo**; clique direito = vários solos | Solo é ferramenta de conferência, não de programa. |
| **Mute** | O botão de mudo vale para **todos os buses** | Mudo é global no canal; não é “mudo só no PGM”. |
| **Automatically Mix Audio (Follow)** | Áudio acompanha o vídeo do switcher (AFV) | O CastDeck tem isso “pela metade”: o áudio segue palco+take, mas não há opção por canal. |
| **Audio Outputs** | Até **8 saídas** independentes; Master, Headphones, A–G; cada uma em um dispositivo | Saída física é um **destino de bus**, não um único `setSinkId` global. |
| **Pares 1+2 / 3+4 / 5+6** | Uma placa com 3 saídas estéreo pode levar 3 mixes; mono faz downmix | Interfaces USB multiportas são caso real; navegador limita, mas dá para documentar e mitigar. |
| **Headphones separado** | Fone com volume próprio e **Solo tem prioridade** sobre o Master | O CastDeck hoje tem um único barramento de retorno; falta o fone “solo”. |
| **Por input: headphone volume, pré/pós medidor, canal/separate mono, gain, delay, compressor, gate, channel mixer, matriz 16×16** | Cada entrada tem um mini-console | O usuário espera **gain, delay e dinâmica**, não só fader %. |

### 2.2 Consoles digitais (Allen & Heath SQ, Behringer X32, Yamaha DM3)

Padrões que valem copiar sem copiar o preço:

- **Channel strip**: gain → HPF → EQ → compressor → fader → pan → mute → **sends** para buses.
- **Buses auxiliares** (A–D/FX) e **matriz** de saídas; **VCA/grupos** para mover vários faders juntos.
- **PFL/Solo** no fone, **talkback** para o convidado, **mute groups**.
- **Cenas** salvam o mix inteiro; **lock** protege o operador.

### 2.3 “Sinsan”

Não localizei documentação pública de um console/software com esse nome nas buscas (aparecem empresas e
homônimos). **Se for um modelo específico, me diga o nome completo/fabricante** para eu extrair o layout exato.
Por ora, o plano usa o padrão de consoles digitais acima + o vMix como referência de operação.

---

## 3. Como o CastDeck faz áudio hoje

```
canal (mic/câmera/tela/mídia/DSK)
  → pre → [RNNoise] → gain (volume × mute) → analyser
                                             ├─ toProgram ─► programBus → limiter → programDest (stream/rec)
                                             ├─ toMonitor ─► monitorBus ─► ctx.destination
                                             ├─ toCaption ─► captionBus (CC ao vivo)
                                             └─ outs (mix-minus por convidado)

programBus → programa (PGM)   |   monitorBus/programMonitor → fone (um dispositivo)
isos (por stageKey) → sinal individual para OBS/vMix (WebRTC)
```

- **Um destino físico**: `ctx.destination` + `setSinkId` (só o retorno/fone); o PGM sai por `MediaStreamDestination`.
- **Sem buses auxiliares**: só PGM, retorno, legenda e mix-minus de convidado.
- **Sinais ISO**: `mixer.isoTrack(stageKey)` — um por fonte de vídeo, consumido por `outputs.js` para OBS/vMix.
- **“No ar”**: `airKeys()` = `S.stage + S.take + DSK`; não existe estado “no ar” por canal na UI.
- **Remoto**: lê `snapshot()` e manda `remote-cmd` (mute, src-vol, master-vol, mídia, layout/palco).

---

## 4. Achados — erros de funcionamento e usabilidade

### 4.1 Bugs de estado (alto impacto)

| ID | Sev. | Achado | Evidência | Impacto |
|---|---|---|---|---|
| **M-01** | **Alta** | **Volume do convidado/tela no celular não funciona**: o remoto lê `mixer.sources.get(s.id)`, mas o canal de áudio é `s.id + ':audio'`; `src-vol` aplica no id errado. | `remote.js` `snapshot()` (items volume), `run()` case `src-vol`; canais criados em `studio.js:3498` (`camId + ':audio'`). | Slider do celular não muda nada; operador acha que mudou. |
| **M-02** | **Alta** | **Mute do host divergente**: o remoto faz `mixer.setMuted('host:mic')`, mas o botão do estúdio lê `S.local.micOn`. O botão continua “ligado” e um clique desliga de novo. | `remote.js` case `mute`; `audio-ui.js:124-126,346-352`; `studio.js` `#c-mic`. | Dois estados para o mesmo mute; risco de microfone aberto/fechado errado. |
| **M-03** | Média | **Master do remoto não aparece no PC**: `mixer.setMaster` muda o ganho, mas o fader do painel só lê `mixer.master` no render. | `remote.js` `master-vol`; `audio-ui.js:114,208`. | Fader mostra 100% com o programa mudo/alterado. |
| **M-04** | Média | **CC “idle” fica velho**: a classe `.idle` é calculada só no `render()`; ligar/desligar a legenda mestre (aba Legendas) não repinta os botões CC. | `audio-ui.js:132`; `captions.js:306-311` (`setCaptionOn`). | Operador acha que o canal está enviando para a legenda quando não está. |
| **M-05** | **Alta** | **Não existe Solo/PFL**: não há como ouvir um canal sem colocá-lo no palco/programa. | `mixer.js` sem solo; `audio-ui.js` só M e CC. | Conferir microfone/convidado exige ir ao ar. |
| **M-06** | **Alta** | **Sem “no ar” por canal**: o painel lista todos os canais e mede pós-fader, mas não indica quais estão em `airKeys()`. Um canal mudo com vídeo no ar passa despercebido. | `audio-ui.js` `rowsFor()` não consulta `mixer.onStage`/`S.take`; `studio.js:1106` `airKeys`. | Risco de ir ao ar sem áudio. |
| **M-07** | Média | **Follow/AFV inexistente**: o áudio segue palco+take (comentário em `studio.js:1104`), mas não há opção por canal; trocar o take não muda o áudio e não há indicação. | `studio.js` `airKeys()`/`applyAir`. | Comportamento não é o do vMix/X32; operador não sabe o que esperar. |

### 4.2 Falta de roteamento (o pedido central)

| ID | Sev. | Achado | Impacto |
|---|---|---|---|
| **M-08** | **Alta** | **Não há buses nem matriz de saída**: só PGM, retorno, CC e ISO por fonte. `setSpeaker` troca **um** dispositivo para todo o contexto. | Impossível mandar “host no fone, convidado no aux 1, música no aux 2”. |
| **M-09** | Média | **Rota do Replay invisível**: `replay:out` aparece como mídia no painel, mas o estado `setRoute(program/monitor)` (CUE/PGM/BOTH/MUTE) não é mostrado; o mute/fader do painel não reflete a rota. | Botões do replay e da mesa não atuam juntos. |
| **M-10** | Média | **Sem master mute/dim**: só fader; o remoto “mute-master” zera o volume (e não restaura). | Não dá para abaixar o PGM sem perder o nível. |
| **M-11** | Média | **Fader em %**: sem dB, pan, gain, delay, EQ/compressor por canal (só limitador no PGM). | Fora do padrão de mesa; microfonia e sincronia ficam manuais. |
| **M-12** | Média | **Saída física só “speakers”**: sem pares 3+4/5+6, sem múltiplos dispositivos, sem medidor por saída. | Interfaces multiportas ficam subutilizadas. |
| **M-13** | Média | **Sem grupos/VCA/link**: host mic + câmera, estéreo e convidados não andam juntos. | “Botões que deveriam atuar juntos” — exatamente. |
| **M-14** | Baixa | **Sem presets/cenas de áudio** e sem lock. | Reconfigurar convidados toda live. |
| **M-15** | Baixa | **Sem talkback** e mix-minus fixo por convidado (sem aux). | Convidado não recebe o que o operador quer. |
| **M-16** | Média | **Remoto sem medidores/PFL/bus**: só master e fader por fonte (e o fader de convidado está quebrado — M-01). | Segundo operador fica cego. |
| **M-17** | Baixa | **Sem renomear/reordenar canais**; nomes automáticos. | Mesa longa fica confusa. |
| **M-18** | Baixa | **Teste (`beep`) só no dispositivo do monitor**; sem teste por saída. | Não dá para conferir aux 1/2. |

---

## 5. Arquitetura proposta

### 5.1 Modelo de canal (channel strip)

```
entrada → preamp/gain → HPF → RNNoise → EQ 3 bandas → compressor
        → fader (dB) → pan → mute → sends:
             M  (PGM, pós-fader/pós-mute)
             A–D (aux, pós-fader, com opção pré-fader)
             CUE/PFL (fone; pós-fader e pós-mute como no vMix)
             CC (legenda; pós-fader, pré-mute ou pós-mute — decidir)
```

- **Gain** separado de fader (headroom), **delay** por canal (lip sync de câmera/NDI), **pan** (mono→estéreo).
- **Mute global do canal** (todos os buses), como no vMix; **solo** não altera o programa.
- **Fader em dB** (‑∞, ‑60…+10), duplo clique = 0 dB; manter % como tooltip (compatibilidade).

### 5.2 Buses

| Bus | Destino | Uso |
|---|---|---|
| **M (Master)** | Stream/gravação + saída master | PGM |
| **A–D** | Saídas físicas / OBS / convidados | Aux 1–4 (ex.: convidado, trilha, sala, gravação limpa) |
| **CUE/PFL** | Só fone (com prioridade sobre Master) | Conferência |
| **GUEST n** | Retorno do convidado | Mix-minus configurável (não fixo) |
| **CC** | Legenda ao vivo | Já existe; passa a ter ganho próprio |

Cada bus: `gain`, `mute`, `limiter`, `meter`, `dim`, **device/pair**.

### 5.3 Gerenciador de saídas (o pedido “qualquer sinal → interface de saída”)

**Fase 1 (recomendada):** um `MediaStreamAudioDestinationNode` por bus → `<audio>` oculto com
`srcObject` + `setSinkId(deviceId)`. Vantagens: um único `AudioContext` (clock comum), funciona no
Chromium/Edge, mantém o PGM intacto. Limite: **um par estéreo por dispositivo**.

**Fase 2:** contexto por dispositivo (`AudioContext.setSinkId`), com `MediaStreamAudioSourceNode` do bus
para o contexto de destino. Permite latências/relógios separados; mais CPU e um “device” por contexto.

**Fase 3 (nativo, se necessário):** motor Rust/Tauri com WASAPI/ASIO para **pares 3+4/5+6** e baixa latência.
Só entra se a Fase 1/2 não atender (medir antes).

Saídas físicas:
- `Master` (stream/rec) e `Headphones` (fone) separados, como no vMix.
- `A–D` para dispositivos/pares (ex.: interface USB 1+2, 3+4, 5+6).
- **Default bus** para novos inputs; **mono downmix** quando o destino é mono.
- **Test tone** por saída; medidor por saída; mute/dim.

### 5.4 Solo/PFL

- **Solo** manda o canal para `CUE`/fone, **pós-fader e pós-mute** (igual vMix: solo audível mesmo mudo).
- Clique direito no Solo = múltiplos; **“limpar solos”**; **solo safe** em retornos de convidado.
- **PFL** opcional (pré-fader) para conferir microfone antes de abrir.

### 5.5 AFV / Follow

- Por canal: `off` (manual), `follow video` (segue take/palco), `follow audio` (segue o bus).
- Modos: **AFV** (áudio segue o vídeo) com **hold** para não cortar microfone ao trocar câmera;
  “manter mics sempre abertos” como preset.
- Indicador no canal: `AFV` / `MANUAL` / `HOLD`.

### 5.6 Grupos / VCA / link

- **Link** host mic + câmera, pares estéreo, convidados.
- **VCA** (um fader move vários) e **mute group**.
- “Botões que atuam juntos”: mute/solo/CC/rota com **um único estado** no mixer; UI apenas reflete.

### 5.7 UI (layout vMix + console)

```
┌ Master ──────────────┐ ┌ Canais (scroll horizontal) ─────────────────────────────┐ ┌ Buses ─────────┐
│ meter L/R  [MUTE][DIM]│ │ [MIC HOST] [CAM1] [GUEST 1] [TELA] [MÍDIA] [REPLAY] …  │ │ M  A  B  C  D  │
│ fader dB   [TALKBACK] │ │ nome/tag  [no ar]  [M][S][CC]  meter pré/pós            │ │ meter / mute   │
│                       │ │ gain  pan  delay  fader dB  [M][A][B][C][D]             │ │ device/pair    │
└───────────────────────┘ └────────────────────────────────────────────────────────┘ │ [TESTE]        │
                                  [Matriz de roteamento]  (grid input × bus)          └────────────────┘
```

- **No ar**: borda/indicador por canal (palco/take/DSK); mute com vídeo no ar = alerta.
- **Fader dB** com escala; **medidor pré/pós** selecionável; **clip/hold**.
- **Matriz**: linhas = inputs, colunas = buses; clique liga/desliga; “aplicar a todos”.
- **Remoto**: aba Áudio com master, faders/mutes, **Solo**, **buses** (permissão), medidores; IDs corrigidos.
- **Accordion** (pedido do operador): seções **Master**, **Canais**, **Buses A–G** e **Retorno/Fone** recolhíveis
  por clique no cabeçalho, com resumo no título quando fechadas (ex.: “Buses · 3 ativos”), estado salvo por
  usuário e medidores pausados nas seções fechadas.

### 5.8 Presets / cenas

- Salvar/restaurar o mix (routing, faders, mutes, solo, buses) por **preset** e opcionalmente por **cena**.
- Lock de mesa (operador não mexe sem senha).

---

## 6. Plano por fases

### Fase 0 — Correções de estado (1–2 dias)

1. **M-01**: unificar mapeamento de canal (`audioIdOf(source)`), corrigir `snapshot`/`src-vol`.
2. **M-02**: mute do host com **uma fonte de verdade** (`mixer`), `S.local.micOn` derivado; botão/remoto idênticos.
3. **M-03**: master com evento (`mixer.onMaster`) → painel e remoto atualizam.
4. **M-04**: evento de legenda → repintar CC `.idle`.
5. **M-06**: `onAir` por canal no painel (palco/take/DSK) + alerta “no ar e mudo”.
6. **M-09**: badge CUE/PGM/BOTH/MUTE no canal do replay.
7. **M-10**: master mute/dim (com restauração).

**Aceite:** mute pelo celular reflete no PC e vice-versa; slider de convidado funciona; master idem; CC
acompanha legenda mestre; canal no ar e mudo pisca.

### Fase 1 — Buses e saídas (4–6 dias)

1. `mixer.buses` (M, A–D, CUE) com gain/mute/meter/limiter.
2. `setSend(channelId, busId, on/level)` + UI M/A/B/C/D por canal.
3. `outputManager`: dispositivo + par estéreo → `<audio>` oculto com `setSinkId`.
4. Solo/PFL (pós-fader/pós-mute) e “limpar solos”.
5. Medidores por bus e por saída; teste por saída.
6. Fader em dB (mínimo: exibir dB e manter %).

**Aceite:** host no Master, convidado no Aux 1, música no Aux 2, cada um em um dispositivo; solo não muda
o PGM; trocar dispositivo não interrompe o PGM.

### Fase 2 — Console (1–2 semanas)

1. AFV/Follow por canal + hold; preset “mics sempre abertos”.
2. Grupos/VCA/mute groups; link host mic+cam.
3. Pan, gain, delay, EQ 3 bandas, compressor/gate por canal.
4. Presets/cenas de áudio e lock.
5. Remoto: aba Áudio completa (medidores, solo, buses, permissões).
6. Talkback e retorno de convidado configurável (aux).
7. **Painel em accordion** (pedido do operador): seções recolhíveis, resumo no cabeçalho, estado por usuário e
   atualização de medidores só nas seções abertas.

### Fase 3 — Avançado (avaliar)

1. Pares 3+4/5+6 e matriz 16×16 (limite do navegador → motor nativo).
2. Motor de áudio Rust (WASAPI/ASIO) se latência/multicanal exigirem.
3. Loudness (EBU R128) e stems de gravação por bus.

---

## 7. Decisões que preciso de você

1. **Quantos buses?** 4 (A–D) cobre o caso “convidado/trilha/sala/limpo”; 8 (A–G) é o teto do vMix.
2. **Saídas físicas**: estéreo por dispositivo basta ou você precisa de **3+4/5+6** na mesma interface?
3. **Solo**: pós-fader/pós-mute (vMix) ou PFL pré-fader? (recomendo pós-fader + PFL opcional).
4. **AFV**: ligar por padrão em mídia/tela e desligar em mics? Ou tudo manual?
5. **Remoto**: pode mudar **roteamento de bus** ou só fader/mute/solo? (recomendo só fader/mute/solo para
   convidados; routing só host).
6. **Sinsan**: qual modelo/fabricante? (para eu alinhar o layout).
7. **Fader**: migrar de % para dB mantendo % no tooltip?
8. **Convidado**: retorno fixo mix-minus ou aux configurável?
9. **Talkback**: necessário nesta fase?
10. **Rust**: autoriza medir antes; só migrar se a Fase 1/2 não atender.

---

## 8. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Realimentação ao ouvir PGM no fone | Aviso já existe; padrão retorno; “listen program” com confirmação e dim. |
| `setSinkId` indisponível/negado | Detectar e cair para “padrão do sistema”, com aviso; testar device. |
| Latência entre bus e dispositivo | Medir; `latencyHint:'interactive'` no bus; opção de delay por saída. |
| CPU com N saídas | Cada saída é um MediaStream + elemento; limitar a 4 na Fase 1. |
| Estado divergente | **Uma fonte de verdade** no mixer + eventos; UI só espelha. |
| PGM quebrar | Nunca trocar o grafo do PGM de uma vez; buses em paralelo, feature flag e testes A/B. |

---

## 9. Testes de aceite (macro)

1. **Canais**: 2 convidados + tela + mídia + replay; medidores e faders coerentes entre PC e celular.
2. **Solo**: solo em mic mudo → só o fone ouve; PGM intacto; limpar solos restaura.
3. **Buses**: host no M, convidado no A, música no B; mute do convidado não afeta A? (definir: mute global).
4. **Saídas**: trocar dispositivo de A sem parar o PGM; teste de tom em cada saída.
5. **AFV**: take para câmera 2 com “hold” não corta o mic; sem hold, corta conforme configurado.
6. **Estado**: mute pelo celular reflete no PC; master idem; CC idem; replay CUE/PGM visível.
7. **Regressão**: stream/gravação com áudio igual ao atual; latência medida antes/depois.

---

## 10. Referências

- [vMix — Audio Mixer](https://www.vmix.com/help26/Mixer.html)
- [vMix — Audio Outputs](https://2354.vmix.com/help28/AudioOutputs.html)
- [vMix — Audio Settings / Channel Matrix](https://www.vmix.com/help26/AudioSettings.html)
- [Allen & Heath SQ — routing](https://support.allen-heath.com/hc/zh-cn/articles/45946654916753-SQ-%E8%B7%AF%E7%94%B1)
- Código estudado: `public/js/studio/mixer.js`, `audio-ui.js`, `remote.js`, `public/js/remote.js`,
  `studio.js` (`airKeys`, `syncAudio`, `addGuestOutput`), `outputs.js` (`isoTrack`).

---

## 11. Implementado na versão local 1.3.1 (2026-11-01)

> **Nada foi enviado para a VPS.** Esta versão é só para teste local.

### 11.1 Ponto de restauração

`D:\REA\backups\pre-mixer-1.3.0\` contém:

- `CastDeck-1.3.0-restore.exe` — binário que funcionava antes desta mesa;
- `source-public-server.zip` — `public/` + `server/` completos;
- `package.json` e `RESTAURAR.txt` com o passo a passo.

### 11.2 O que entrou

| Item | Implementação |
|---|---|
| **Buses A–G** | `AudioMixer.buses` com gain, mute, analyser, `MediaStreamDestination` e `setBusDevice(id, deviceId)` (elemento oculto + `setSinkId`). Master continua no `programBus`. |
| **Sends por canal** | Botões `A–G` em cada canal; `setSend(id, bus, on)` pós-fader/pós-mute, salvo nas prefs do canal. Master (PGM) continua pelo palco/take. |
| **Solo (vMix)** | `setSolo`/`toggleSolo`/`clearSolo`: o canal solo vai para `cueBus` **pós-fader e pré-mute** (audível mesmo mudo); o retorno normal é silenciado enquanto há solo. |
| **Mute separado** | `gain` (fader) e `muteGain` (mute) separados; todos os buses (PGM, ISO, convidados, CC) saem pós-mute; o Solo sai pré-mute. |
| **Master MUTE/DIM** | `setMasterMuted` e `setDim` (−14 dB), sem perder o nível do fader. |
| **Saída física por bus** | Select de dispositivo em cada bus A–G e no Master; botão **TESTE** (tom no bus). Estéreo por dispositivo (limite do navegador). |
| **Fone** | O dispositivo de fone continua sendo o `ctx.destination` (`#spk`); o Solo tem prioridade sobre o retorno normal. |
| **“No ar” por canal** | Badge `NO AR` no painel usando `mixer.isOnAir` (palco/take/DSK), atualizado a cada 120 ms. |
| **Rota do Replay** | Badge `PGM`, `FONE`, `PGM+FONE` ou `MUDO` no canal `replay:out`. |
| **Remoto — IDs corrigidos** | `audioIdOf` resolve `id`, `id:audio` ou canal por `stageKey`; fader de convidado/tela agora funciona. |
| **Remoto — mute coerente** | `mixer.onMute` atualiza `S.local.micOn` e o botão do host; PC e celular mostram o mesmo estado. |
| **Remoto — Solo/Buses/Master** | Comandos `audio-solo`, `send`, `bus-mute`, `bus-level`, `master-mute`, `dim`, `clear-solo`; UI do celular com S, A–G, buses e DIM. |
| **CC** | `idle` dos botões CC sincroniza com `mixer.captionOn` no tick. |
| **Master no PC** | Fader/mute/dim do painel sincronizam com o mixer (mesmo se o celular mudar). |

### 11.3 Testes executados (headless + fonte)

- `mixer.buses.size === 7`; painel renderiza **7 buses** e **7 sends**.
- Clique no send A → `getSend('host:mic','A') === true` e botão `.on`.
- Clique no Solo → `sources.get('host:mic').solo === true`, `toCue === 1`, `monitorBus === 0`.
- Mute remoto do host → `S.local.micOn === false` e `sources.get('host:mic').muted === true`.
- `setCaptionOn(false)` → botão CC recebe `.idle`.
- Select de dispositivo do bus A → `getBus('A').deviceId === 'spk1'`; Master idem.
- Nenhuma exceção de runtime.

### 11.4 Ainda não implementado (próximas fases)

- **AFV/Follow** por canal e grupos/VCA.
- **Pan, gain, delay, EQ, compressor/gate** por canal.
- **Presets/cenas de áudio** e lock.
- **Medidores no celular** e PFL pré-fader.
- **Talkback** e retorno de convidado configurável.
- **Pares 3+4/5+6** no mesmo dispositivo (limite do Chromium; motor nativo no futuro).

### 11.5 Como testar

1. Abra o estúdio local, painel **Áudio**.
2. Conecte um fone/interface; escolha o dispositivo do bus **A** e clique **TESTE**.
3. Ligue um canal no bus **A** (botão `A` no canal) e confira o som na interface.
4. Clique **S** em um microfone: só o fone deve ouvir; o PGM não muda.
5. Mute o host pelo celular (aba Áudio) e confira o botão do PC.
6. Master **MUTE** e **DIM**; confira que o stream/gravação seguem o Master.

### 11.6 Painel em accordion — implementado na 1.3.2

Pedido do operador depois do teste da 1.3.1: o painel de Áudio deve ser **accordion**.

**Especificação:**

- Seções: **Master** (medidores, MUTE/DIM, fader, saída), **Canais** (todos os channel strips), **Buses A–G**
  (medidor, mute, nível, dispositivo, teste) e **Retorno/Fone** (volume, ouvir programa, dispositivo, teste).
- Cabeçalho de cada seção vira `<button>` com `aria-expanded`; Enter/Espaço abre/fecha; ícone ▸/▾.
- **Estado salvo** por usuário/estúdio (`localStorage`), padrão: Master e Canais abertos; Buses e Retorno
  abertos na primeira vez e depois lembrados.
- **Resumo quando fechado** (para não perder informação): “Master · −6 dB · MUTE”, “Canais · 6 fontes”,
  “Buses · 3 ativos”, “Retorno · fone”.
- **Custo:** o tick de medidores só atualiza as seções abertas (economiza DOM a cada 120 ms).
- **Popout/janela flutuante** usa o mesmo estado; “Expandir tudo / Recolher tudo” no topo.
- Não muda nada do mixer: é só organização visual.
