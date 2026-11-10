# EGM — Performance, estabilidade e antifreeze do CastDeck

> **Status:** publicado na 1.3.28 (implementação parcial; supervisor/telemetria pendentes).
> **Objetivo:** reduzir travamentos ao mínimo possível e garantir que, se algo travar, o sistema
> **degrade ou se recupere sozinho**, sem derrubar a live.
> **Data:** 2026-11-03

---

## 1. Primeiro: o que “nunca travar” pode significar

Não é possível garantir **zero travamento** em qualquer combinação de Windows, driver de GPU, USB,
antivírus, rede, câmera, FFmpeg e navegador. É possível e obrigatório garantir:

1. **Nenhum travamento indefinido** sem diagnóstico.
2. **Nenhum congelamento total** da interface por trabalho ilimitado na thread principal.
3. **Degradação automática** antes da saturação (qualidade, previews, miniaturas).
4. **Recuperação automática** de servidor/FFmpeg/processos filhos.
5. **Falha isolada:** um convidado, uma mídia ou um DSK não pode derrubar o programa.
6. **Limites explícitos** para memória, fila de rede, fontes e buffers.

Meta de aceite: **nenhum freeze > 2 s** na matriz de teste; se ocorrer, o sistema deve **voltar sozinho
em até 10 s** e registrar a causa. “Nunca” vira um contrato mensurável, não uma promessa vazia.

### 1.1 Regra de ouro: retorno do convidado é crítico

O retorno de vídeo do convidado **não é uma preview descartável**. Ele é a experiência do convidado:
se cair para 15 fps, o usuário percebe como defeito do produto.

Portanto:

- **Seguir a mesa:** o fps do retorno acompanha o preset do programa — 30 no 720p30/1080p30,
  **60 no 720p60/1080p60** — com **piso de 30 fps**.
- **Nunca reduzir automaticamente o retorno para 15 fps.**
- **Resolução sub-HD:** 960×540 (540p) como padrão; 854×480 (480p) apenas como degrau de capacidade
  em máquina/rede muito apertada, mantendo o fps.
- **Bitrate moderado para compensar a resolução menor:** alvo inicial de **~2,2 Mbps em 540p30** e
  **~3,2 Mbps em 540p60**; não é para “estourar” a banda. Em congestionamento, o bitrate pode ceder
  antes do fps — a fluidez tem prioridade.
- A **prévia da mesa também acompanha o fps do PGM** (30/60); ela não nasce em 15 fps.
- Se a máquina não der conta, primeiro reduzem-se **miniaturas, vertical, replay, animações e recursos
  opcionais**; retorno e prévia permanecem fluidos. A prévia só cede em emergência, depois de tudo.
- Se nem isso bastar, o sistema deve **limitar a quantidade de retornos ativos com aviso explícito**
  (“limite de retornos desta máquina”), nunca degradar silenciosamente para 15 fps.
- “Qualidade” do retorno inclui **fps, latência, regularidade e bitrate**, não só resolução.

---

## 2. Escopo da varredura

| Área | O que foi olhado |
|---|---|
| Render do programa | loop principal, compositor, canvas, fonte/overlays, widgets, DSK |
| Saídas | PGM, prévia da mesa, vertical 9:16, retorno de convidados |
| UI | abas, miniaturas, listas, modais, painéis, DOM |
| Captura e mídia | câmera, tela, arquivos, MediaRecorder, WebRTC |
| Rede | sinalização, WebSocket de ingest, convidados, túnel |
| Servidor | Express, store JSON, polling, processos filhos |
| FFmpeg | encoder principal, destinos RTMP, gravação, ingest/Mediamtx |
| Replay | buffer em RAM, clipes, IndexedDB/blob |
| Launcher | processo do servidor, janela, bandeja, encerramento |
| Android | WebView, câmera, memória, telas menores |
| Qualidade | testes existentes, instrumentação, logs, recuperação |

---

## 3. Arquitetura de performance

```text
CÂMERA/TELA/ARQUIVO
  → <video>/<img>
  → Compositor (canvas 2D)
  → captureStream
  → MediaRecorder (WebM)
  → WebSocket /ingest
  → FFmpeg encoder
  → FFmpeg destinos (RTMP) + gravação

Em paralelo:
  → prévia da mesa (mesmo fps do PGM: 30/60)
  → miniaturas da mesa e bastidores (8–10 fps)
  → retorno compartilhado do PGM (fps do preset, mínimo 30; 960×540; bitrate moderado)
  → vertical 9:16 (quando ativo)
  → replay ring buffer
  → DSK (imagem/vídeo/página web)
```

### Orçamento proposto

| Componente | Meta |
|---|---|
| Frame do PGM 1080p30 | p95 ≤ 20 ms, p99 ≤ 28 ms |
| Frame do PGM 1080p60 | p95 ≤ 12 ms, p99 ≤ 15 ms (headroom para 16,7 ms) |
| **Retorno do convidado** | fps do preset, **mínimo 30** (60 em presets 60); 960×540; intervalo p95 ≤ 45 ms (30) / ≤ 22 ms (60); nenhum gap > 200 ms |
| **Bitrate do retorno** | ~2,2 Mbps em 540p30; ~3,2 Mbps em 540p60; adaptação para baixo só sob congestionamento |
| **Custo do retorno por convidado** | ≤ 8 ms/frame no PGM, quando derivado do quadro do programa |
| UI tick | ≤ 4 ms; nenhuma long task > 50 ms |
| Servidor (event loop lag) | p99 ≤ 50 ms; pior caso ≤ 250 ms |
| Fila WebSocket de ingest | ≤ 8 MB; nunca > 24 MB |
| Fila interna FFmpeg | ≤ 8 MB; nunca > 24 MB |
| Memória após warm-up | crescimento ≤ 1–2%/h; sem tendência de OOM |
| Recuperação de falha | ≤ 10 s, com estado visível |
| Freeze de UI | 0 eventos > 2 s na matriz de teste |

---

## 4. EGM — seis lentes

### 4.1 Operador / UX

O operador percebe “travou” quando:

- o vídeo do PGM congela, mas o áudio continua;
- o painel não responde ao clique;
- a prévia para, mas o programa segue;
- o botão “No ar” não reage;
- o app fecha/reabre e perde estado.

**Direção:** status de saúde visível, modo de degradação explícito, botão “recuperar” e nunca uma tela
preta silenciosa.

### 4.2 Render / composição

Hoje o loop do programa:

```js
ticker.onmessage = () => {
  comp.render();
  vview?.render();
  for (const g of S.guests.values()) g.view?.render();
  switcher?.render();
  autoVoice?.tick();
  ...
};
```

O timer do Worker publica no intervalo fixo do preset, sem verificar se o frame anterior terminou.
Se um frame demorar mais que o intervalo, as mensagens se acumulam.

**Direção:** loop com **frame budget**, flag `inFlight`, descarte de frames atrasados e degradação
antes de a fila crescer.

### 4.3 Rede / FFmpeg

O `Broadcaster` avisa quando `ws.bufferedAmount > 48 MB`, mas **continua enviando**. No servidor,
`enc.stdin.write(chunk)` ignora o retorno `false` (backpressure); o FFmpeg pode acumular dados e
memória até travar/OOM.

**Direção:** pausar o MediaRecorder/WebSocket quando a fila passar do limite; derrubar/reiniciar o
encoder com erro visível; nunca deixar a fila crescer sem limite.

### 4.4 Persistência / processos

- `store.js` faz `JSON.stringify(this.data, null, 2)` completo e `fsync` a cada alteração (debounce
  150 ms). Um `db.json` grande bloqueia o event loop e pode travar a API inteira.
- O launcher Tauri inicia o servidor, mas não monitora o processo depois: se o servidor cair, a
  janela continua aberta e o estúdio fica morto.
- Cada destino RTMP e cada conversão de ingest é um FFmpeg separado; não há orçamento de CPU global.

**Direção:** store incremental/assíncrono com limite de tamanho; supervisor do servidor com health
check HTTP e restart; admissão de processos por CPU.

### 4.5 Plataforma / Android

- Android/WebView tem menos memória e GPU; 1080p60 + previews + retorno pode ser demais.
- O `lowPower` atual só reduz sombra/blur; não reduz resolução, fps de previews ou buffers.
- Tela apagada/câmera fechada já tem watchdog de câmera, mas não watchdog de render.

**Direção:** perfis de dispositivo e modo economia com metas menores, sem esconder a degradação.

### 4.6 Qualidade / observabilidade

Hoje existe `renderFps` do programa, mas não:

- tempo por frame (p50/p95/p99);
- memória JS/heap;
- lag do event loop do servidor;
- fila do WebSocket/FFmpeg;
- frames descartados por subsistema;
- logs de freeze com o último estado.

**Direção:** instrumentar antes de otimizar; sem medição, “não travou” é opinião.

---

## 5. Achados e riscos

> **Legenda:** P0 = pode travar/perder live; P1 = degrada e pode virar freeze em carga; P2 = melhoria.

| ID | Severidade | Achado | Evidência | Consequência |
|---|---|---|---|---|
| PF-01 | **P0** | Loop principal sem controle de frame em andamento | `studio.js` ~878–885: timer do Worker chama render sem `inFlight` | Frames enfileirados, atraso crescente e UI travada em CPU alta |
| PF-02 | **P0** | `GuestView` fixo em 960×540/30 fps, com bitrate inicial de 1,5 Mbps, recompõe a cena inteira por convidado | `compositor.js` `GuestView`; `studio.js` `setMaxBitrate(...,1_500_000)` | Não segue preset de 60 fps e tem pouco bitrate para 540p; **a correção não é baixar para 15 fps** |
| PF-03 | **P0** | Backpressure de WebSocket/FFmpeg incompleto | `broadcaster.js` avisa >48 MB mas envia; `broadcast.js` `write()` ignora retorno de `stdin.write` | Memória cresce, encoder trava, live cai |
| PF-04 | **P0** | Servidor/launcher sem supervisor pós-start | `src-tauri/src/main.rs`: `spawn_server` + `wait_for_server`; sem restart; health só TCP | Servidor morto = estúdio inacessível até reiniciar o app |
| PF-05 | **P1** | UI desenha todas as miniaturas a 10 Hz | `studio.js` `uiTick()` 100 ms, canvas 320×180 por fonte | CPU alta com muitas fontes/abas |
| PF-06 | **P1** | Store grava JSON completo no event loop | `store.js` `flush()`/`_writeOnce`, `JSON.stringify` + `fsync` | API/WS travam durante saves grandes |
| PF-07 | **P1** | Replay buffer e cópias de Blob/Uint8Array | `replay-engine.js` ring buffer até 180 s, `arrayBuffer()`, `new Uint8Array` | Picos de memória e GC no meio da live |
| PF-08 | **P1** | Conversão de ingest sem orçamento de CPU | `ingest.js`: até 12 fontes; `libx264` ≈1 núcleo/1080p | Várias câmeras RTMP saturam a máquina |
| PF-09 | **P1** | Long tasks de imagem/JSON/DOM na main thread | uploads, data URLs, render de listas, `readImage`, QR | UI congela por >1 s em operações grandes |
| PF-10 | **P1** | Timers concorrentes | `uiTick` 100 ms, `cohostSync` 250 ms, `tickDeck` 300 ms, mídia 300 ms, vertical 1 s | Callbacks se sobrepõem quando o event loop atrasa |
| PF-11 | **P1** | Erro de um subsistema derruba o restante do tick | `comp.render()` sem try/catch no loop; se lançar, `vview`/convidados/switcher não rodam | Um erro de overlay pode parar todos os previews |
| PF-12 | **P1** | Sem telemetria de frame/heap/servidor | Apenas `renderFps`; sem long task/memória/lag | Impossível provar melhora ou detectar vazamento |
| PF-13 | **P2** | Canvas em resolução cheia + DPR + múltiplas saídas | `comp.setSize(p.width,p.height)`; previews e guest canvases | GPU/CPU alta, especialmente 1080p60 + vertical |
| PF-14 | **P2** | Ciclo de vida de streams/tracks/blobs | vários `URL.createObjectURL`; alguns revogados, outros não | Vazamento lento de memória/tracks |
| PF-15 | **P2** | Rede/scrapers/pollers sem circuit breaker global | callbacks assíncronos e reconexões | Tempestade de reconexão e CPU em rede instável |
| PF-16 | **P2** | Sem limite global de fontes/mídia/DSK/social | limites pontuais (200 mensagens, 250 social) | DOM e arrays crescem, render fica pesado |

---

## 6. Estratégia proposta

A ordem correta é **medir → conter → degradar → recuperar → otimizar**. Otimizar antes de instrumentar
esconde o problema; adicionar watchdog sem medir gera reinício no lugar errado.

### 6.1 Retorno do convidado: crítico, fluido e barato

Hoje cada `GuestView` mantém um `Compositor` próprio, **recompõe a cena inteira** e fica fixo em
960×540/30 fps, com teto inicial de 1,5 Mbps. Com vários convidados, isso multiplica a composição e
não acompanha um preset de 60 fps.

Proposta:

1. **Uma única composição de retorno por quadro do PGM.**
   - O PGM é desenhado uma vez.
   - O retorno é derivado do canvas do PGM com `drawImage` para um canvas 960×540.
   - Todos os convidados recebem o mesmo quadro de retorno (o programa é o mesmo); o áudio continua
     individual (mix-minus).
   - Evita N compositores completos e N renders de DSK/widgets/banner.
   - Se um dia o retorno precisar ser individualizado por convidado, o custo volta a ser por pessoa;
     nesse caso vale o limite de **quantidade no fps do preset**, nunca a redução de fps.

2. **Agendador próprio do retorno no fps da mesa, com piso de 30.**
   - `returnFps = max(30, fpsDoPreset)`: 30 no 720p30/1080p30; **60 no 720p60/1080p60**.
   - Não depende do tick de preview/miniaturas.
   - Se o PGM atrasar, o retorno usa o último quadro válido; não inventa 15 fps nem “meio fps”.
   - Medir intervalo entre quadros no host e no lado do convidado.

3. **Prioridade de frame.**
   ```text
   1. PGM
   2. retorno do convidado
   3. áudio/controles
   4. prévia da mesa
   5. miniaturas
   6. vertical/replay/animações opcionais
   ```
   O retorno nunca espera thumbnail, prévia, DSK page ou render de lista.

4. **Capacidade, não fps.**
   - Medir o custo real de um retorno na máquina, no fps do preset.
   - Definir o número máximo de retornos **no fps da mesa (mínimo 30)**.
   - Acima disso: aviso e limite de quantidade; jamais “15 fps para caber”.
   - Em hardware fraco, o retorno continua no fps da mesa (mínimo 30) e o que cai são
     previews/vertical/overlays.

5. **Resolução sub-HD + bitrate moderado.**
   - Base **960×540 (540p)**; 854×480 apenas como degrau de capacidade em máquina/rede muito apertada,
     **sem baixar o fps**.
   - Bitrate alvo: **~2,2 Mbps em 540p30**, **~3,2 Mbps em 540p60**. É um aumento moderado sobre o
     1,5 Mbps atual, suficiente para compensar a resolução menor sem virar um “4K no retorno”.
   - Em congestionamento, o bitrate pode ceder antes do fps; a cadência de 30/60 é preservada.
   - Não usar bitrate alto fixo para todos: adaptar ao preset e à qualidade medida, com piso que evite
     imagem borrada e teto que não sature a rede do convidado.
   - Substituir a escada atual (350/650/1,1/1,5 Mbps) por uma proporcional ao preset — por exemplo,
     540p30: 2,2 → 1,8 → 1,5 → 1,2 Mbps; 540p60: 3,2 → 2,6 → 2,2 → 1,8 Mbps. O piso é para manter
     nitidez; se nem o piso couber, avisar e preservar o fps.

6. **Fallback de emergência.**
   - Se nem a composição compartilhada couber no orçamento, o sistema mostra “retorno em risco” e
     permite ao operador fechar fontes/preview — não degrada o retorno silenciosamente.
   - Um retorno abaixo do mínimo (30 fps, ou o fps do preset) é **falha medida**, não um modo de operação.

### Fase 0 — Instrumentação e linha de base

- Coletar por sessão:
  - frame time p50/p95/p99 do PGM, vertical, preview e guests;
  - long tasks da main thread (>50 ms);
  - heap JS (`performance.memory` quando disponível) e memória do processo;
  - FPS real, frames pulados, fontes ativas;
  - WebSocket `bufferedAmount`;
  - FFmpeg `fps/speed/drop_frames/backlog`;
  - event loop lag do servidor (`perf_hooks.monitorEventLoopDelay`);
  - CPU/RAM do processo FFmpeg e do navegador;
  - erros/exception por subsistema.
- Criar um **HUD de diagnóstico** opcional (não poluir a live).
- Criar um teste de stress reproduzível com câmera falsa + vídeos 1080p.

### Fase 1 — P0: impedir congelamento indefinido

1. **Frame budget + in-flight**
   - Se o frame anterior não terminou, não iniciar outro.
   - Se o frame passou do orçamento, pular previews/miniaturas e registrar.
   - Nunca deixar a fila de mensagens do Worker crescer sem limite.

2. **Backpressure real**
   - `MediaRecorder` pausa quando `ws.bufferedAmount` passar do limite.
   - Servidor pausa o WebSocket quando `enc.stdin.write()` retornar `false` e retoma no `drain`.
   - Limite duro: se a fila passar de 24 MB, encerra com erro claro e reinicia, em vez de OOM.
   - Watchdog do FFmpeg: sem `progress` por N segundos → kill + restart com backoff.

3. **Supervisor do servidor**
   - Health HTTP real (`/api/health` com uptime, event loop lag, versão) em vez de só TCP.
   - Launcher monitora o processo; se cair, reinicia com backoff e reabre/recarrega o estúdio.
   - Botão “Recuperar” no estúdio se a API não responder.
   - Limitar tentativas e mostrar diagnóstico se não recuperar.

4. **Isolamento de erros**
   - `try/catch` por subsistema no tick: falha de um guest/DSK/preview não impede o PGM.
   - Após N erros consecutivos, desabilitar aquele subsistema e avisar.
   - Nunca uma exceção silenciosa parar o render inteiro.

5. **Limites de admissão**
   - Máximo de retornos de convidados ativos **no fps da mesa (mínimo 30)** (ex.: 6), com fila/lista de
     espera; nunca reduzir o fps para caber mais um.
   - Máximo de fontes simultâneas, DSKs, páginas web, conversões de ingest.
   - Rejeitar/avisar antes de iniciar, não depois de travar.

### Fase 2 — P1: eliminar os maiores ofensores

- **Guest views fluidos e protegidos:** seguir o **fps do preset (mínimo 30)** em **960×540**, com bitrate
  moderado (~2,2/3,2 Mbps); não reduzir para 15 fps nem degradar silenciosamente. Otimizar o caminho
  para o retorno ser derivado do **quadro já composto do PGM**
  (`drawImage` para o canvas do convidado), em vez de recompor a cena inteira por convidado. Pausar só
  quando o convidado não está conectado/retorno não está ativo — nunca por “economia” durante a live.
- **Miniaturas:** atualizar só as visíveis (`IntersectionObserver`), 5–8 fps, canvas menor; pausar
  bastidores fechados.
- **Store:** separar metadados de assets; escrever incremental; limitar `db.json`; nunca `JSON.stringify`
  gigante no caminho crítico; compactar/arquivar.
- **Replay:** reduzir buffer padrão; reciclar buffers; evitar cópia extra; liberar blobs/clips.
- **Ingest:** converter no máximo N fontes por CPU; priorizar encoder de hardware; recusar nova conversão
  se a máquina estiver saturada.
- **Main thread:** processar uploads/imagens em `createImageBitmap`/worker; fatiar listas grandes;
  limitar data URLs e arquivos; não renderizar DOM inteiro a cada mensagem.
- **Rede:** timeouts, backoff exponencial, circuit breaker e cancelamento de polls concorrentes.
- **Ciclo de vida:** revogar todo object URL, parar tracks/MediaRecorder/peers e remover listeners ao
  excluir fonte/aba.

### Fase 3 — P2: arquitetura e desempenho

- **OffscreenCanvas/Worker** para composição fora da main thread, se o suporte for estável.
- **WebCodecs** para captura/encode sem MediaRecorder quando disponível.
- **Camadas estáticas em cache** (fundo/logo/GC) e dirty rectangles para overlays.
- **Escala adaptativa** por dispositivo (DPR/resolução/fps de previews).
- **Separar pipeline de programa e pipeline de monitoração**; previews não devem competir com o PGM.
- **Android:** perfil “economia” com 720p, previews 5–10 fps e sem retornos ociosos; retorno ativo
  continua no fps da mesa (mínimo 30).

---

## 7. Política de degradação automática

Estados:

```text
normal     → todos os recursos
protegido  → miniaturas reduzidas; prévia/retorno intactos (fps da mesa)
economia   → vertical/replay/overlays reduzidos; prévia/retorno intactos (fps da mesa)
emergência → PGM + áudio + encoder + retornos e prévia no fps da mesa;
             overlays/animações pesadas desativados; aviso na UI
```

**Ordem de corte (sempre de baixo para cima):**

1. miniaturas de bastidores;
2. vertical/9:16, replay e páginas DSK;
3. animações de social/banner/letreiro;
4. fontes não essenciais;
5. **por último, quantidade de retornos ativos** — com aviso e escolha do operador;
6. em emergência extrema, a prévia pode reduzir, mas retorno e PGM não.

O **retorno do convidado nunca entra na lista de corte de fps**: não existe “modo 15 fps”. Se a máquina
não suportar todos os retornos, o sistema limita a quantidade ativa e explica, em vez de entregar uma
experiência ruim.

Gatilhos sugeridos:

| Sinal | Entra em | Ação |
|---|---|---|
| frame p95 > 80% do orçamento por 3 s | protegido | pausa miniaturas; prévia/retorno intactos |
| frame p99 > orçamento por 5 s | economia | reduz vertical/replay/overlays; **prévia e retorno continuam no fps da mesa** |
| heap crescendo > 20% em 5 min | protegido | libera caches de miniaturas/DSK, não o retorno |
| fila WS/FFmpeg > 8 MB | protegido | pausa envio/MediaRecorder |
| fila > 24 MB | emergência | reinicia encoder, aviso |
| event loop lag servidor > 500 ms | economia | pausa scrapers/saves não críticos |
| erro repetido em subsistema | isolamento | desliga subsistema, mantém PGM e retorno |

Regras:

- Toda degradação precisa ser **visível** (“Qualidade reduzida para manter a live”).
- Voltar a `normal` só depois de N segundos estáveis, com histerese.
- Nunca desligar o PGM/áudio/encoder/retorno ativo sem ação do operador.
- Ter um botão **“Forçar qualidade máxima”** com aviso de risco.
- Se o retorno estiver abaixo do mínimo (30 fps, ou o fps do preset), isso é **falha**, não degradação
  aceitável; registrar e corrigir.

---

## 8. Observabilidade e diagnóstico

### 8.1 Métricas mínimas

- `frame_ms{p50,p95,p99}`, `frame_skipped`, `render_fps`, `canvas_mb`;
- `guest_views`, `sources`, `dsk_pages`, `preview_fps`, `thumb_fps`;
- `ws_buffered_bytes`, `encoder_stdin_backlog`, `ffmpeg_fps/speed/drop`;
- `server_event_loop_lag`, `store_write_ms`, `db_size`;
- `heap_used`, `heap_growth`, `object_urls_live`;
- `long_tasks`, `exceptions`, `reconnects`, `degradation_state`.

### 8.2 Logs de freeze

Quando um frame/UI passar de 2 s:

- último estado (take, layout, guests, DSK, fila, memória);
- stack do erro (se houver);
- screenshot opcional do canvas;
- timestamp e duração.

### 8.3 Ferramentas

- Chrome/Edge tracing e Performance panel;
- `performance.measure`/`PerformanceObserver` para long tasks;
- Node `perf_hooks.monitorEventLoopDelay`, `process.memoryUsage`;
- Windows Performance Recorder/ETW para CPU/GPU/disco;
- GPU driver logs e `chrome://gpu`;
- teste com OBS/vMix consumindo as saídas.

---

## 9. Plano de testes

### 9.1 Bancada de perfis

| Perfil | Hardware | Meta |
|---|---|---|
| Baixo | 4 núcleos, 8 GB, iGPU, Windows 10 | 720p30 estável; retorno no fps da mesa; sem freeze |
| Médio | 8 núcleos, 16 GB, GPU integrada | 1080p30 + 2 convidados + DSK; retorno a 30 fps |
| Alto | 12+ núcleos, 32 GB, GPU dedicada | 1080p60 + 4 convidados + vertical; retorno a 60 fps |

### 9.2 Cenários

1. Host sozinho, 720p30, 30 min.
2. Host + 2 convidados + tela + 2 DSK + banner + social, 1080p30, 2 h.
3. Host + 6 convidados, 1080p30, 1 h.
4. 10 fontes + miniaturas + prévia da mesa, 1 h.
5. 12 entradas de ingest com conversão, 30 min.
6. 3 destinos RTMP + gravação + vertical, 1 h.
7. Replay 180 s + salvar clipe durante live.
8. 100 mídias na biblioteca + rolagem/thumbnails.
9. Upload de imagem 25 MB/DSK + página web + carrossel.
10. Aba minimizada/background por 30 min; voltar.
11. Rede caindo/reconectando a cada 30 s.
12. Matar FFmpeg, matar servidor, desconectar câmera, remover permissão de mídia.
13. Disco cheio/gravação falhando.
14. Driver de GPU reset / contexto WebGL perdido.
15. Android 4 GB RAM, 720p, 30 min.
16. **Fluidez do retorno**: 2 convidados assistindo ao próprio retorno + PGM 1080p30 + CPU ocupada;
    medir fps e intervalos do retorno **em cada convidado**, não só no host.
17. **Carga gradual**: subir de 1 para 6 convidados até o sistema degradar; verificar que a primeira
    coisa a cair são previews/miniaturas/vertical, nunca o retorno.
18. **Preset 60**: 1080p60 + 2 convidados; medir retorno a **60 fps**, bitrate ~3,2 Mbps e jitter.
19. **Rede apertada**: limitar a banda do convidado; o bitrate deve ceder, mas o fps deve continuar
    no mínimo (30/60), sem cair para 15.

### 9.3 Medições por cenário

- FPS real e frames pulados;
- **FPS do retorno do convidado, intervalos p95/p99 e gaps > 200 ms**;
- **bitrate real, resolução e adaptação do retorno** (540p/480p, 30/60);
- **latência retorno → convidado e regularidade (jitter)**;
- p50/p95/p99 de frame;
- CPU total, CPU por processo, GPU;
- RAM do navegador, servidor, FFmpeg;
- fila WS/FFmpeg e event loop lag;
- áudio: underruns/glitches;
- tempo de recuperação;
- long tasks e freeze > 2 s.

### 9.4 Detecção de freeze

- Heartbeat visual (canvas/worker) + cronômetro; se não atualizar por 2 s, registrar.
- Watchdog externo (CDP/PowerShell) tira screenshot e coleta processo.
- Teste de “hold”: simular CPU 100% por 10 s e verificar degradação.
- Teste de “hang”: bloquear a main thread propositalmente em ambiente de teste e ver se o servidor/launcher
  reage; não usar em produção.

### 9.5 Critérios de aceite

- [ ] Nenhum freeze > 2 s em 8 h de soak na matriz principal.
- [ ] Se o frame estourar o orçamento, previews/miniaturas caem antes do PGM.
- [ ] Fila WebSocket/FFmpeg nunca passa de 24 MB.
- [ ] Servidor morto é reiniciado e o estúdio volta em ≤10 s.
- [ ] Um erro de DSK/convidado não para os outros.
- [ ] Memória estável após warm-up (sem crescimento linear).
- [ ] 6 convidados + 1080p30 continua com áudio e PGM; previews podem degradar.
- [ ] **Cada retorno ativo segue o fps da mesa (mínimo 30)**: 30 em presets 30, **60 em presets 60**,
      com p95 de intervalo ≤45 ms (30) / ≤22 ms (60) e nenhum gap >200 ms.
- [ ] **Nunca existe modo automático de retorno a 15 fps**; retorno abaixo do mínimo conta como falha.
- [ ] **A prévia da mesa roda no mesmo fps do PGM** (30/60) em operação normal; não fica em 15.
- [ ] Bitrate do retorno próximo de **2,2 Mbps (540p30)** ou **3,2 Mbps (540p60)**, com adaptação apenas
      sob congestionamento e sem derrubar o fps.
- [ ] Sob carga, a ordem de degradação é miniaturas → prévia → vertical/replay → overlays → fontes opcionais;
      o retorno só é limitado por **quantidade**, com aviso, nunca por fps.
- [ ] Android 4 GB não é morto pelo sistema em 30 min no cenário alvo.
- [ ] Toda degradação/recuperação aparece na UI e no log.

---

## 10. Roadmap priorizado

### P0 — antes de qualquer nova feature de peso

1. Instrumentar frame time, memória, filas e event loop.
2. Frame budget/in-flight e descarte de frames.
3. Backpressure WS/FFmpeg + watchdog de encoder.
4. Supervisor do servidor/launcher com health HTTP.
5. Isolamento de erros por subsistema.
6. Capacidade de retornos fluidos: medir custo real por convidado e definir o número máximo de retornos
   **no fps da mesa (mínimo 30)**; acima disso, avisar e limitar quantidade, nunca fps.

### P1 — próxima onda

7. Retorno do convidado derivado do quadro do PGM (`drawImage`) + agendador próprio no fps do preset
   (mínimo 30), 540p e bitrate moderado; medir e garantir fluidez, sem redução de fps.
8. Miniaturas visíveis e throttle.
9. Store incremental e limite de `db.json`.
10. Replay com menos cópias e limite de memória.
11. Orçamento de CPU para ingest.
12. Ciclo de vida/limpeza de streams e blobs.
13. Timeouts/backoff/circuit breaker de rede.

### P2 — arquitetura

14. OffscreenCanvas/Worker, WebCodecs.
15. Cache de camadas estáticas e dirty rectangles.
16. Perfis por dispositivo/Android.
17. Testes de soak contínuos em CI/local.

---

## 11. Perguntas em aberto

1. Qual é o hardware mínimo oficial? (define o teto de guests/1080p60)
2. Quantos convidados simultâneos com retorno de vídeo **no fps da mesa (30/60)** são suportados por contrato?
3. A degradação pode reduzir o **fps do PGM** ou só preview/vertical/replay? (O retorno não entra.)
4. O operador prefere perder previews ou perder qualidade do PGM em carga?
5. Podemos limitar ingest a N conversões simultâneas por CPU?
6. O app deve reiniciar o servidor automaticamente ou pedir confirmação?
7. Replay de 180 s é requisito ou pode cair para 60–90 s em máquinas menores?
8. Android precisa de retorno de convidado ou só câmera/Programa?
9. **Confirmado:** retorno segue o preset (60 em 1080p60); falta definir quantos retornos 60 fps a máquina
   mínima suporta.
10. O piso de resolução é **480p** ou 540p é o mínimo aceitável? (O fps não muda.)
11. O teto de bitrate do retorno deve ser fixo por preset ou adaptativo por convidado? (Proposta:
    alvo ~2,2/3,2 Mbps, adaptação para baixo sob congestionamento.)

---

## 12. Veredito EGM

O maior risco não é uma função lenta isolada: é o **acúmulo sem limite** em quatro lugares:

1. frames do render;
2. fila WebSocket/FFmpeg;
3. trabalho de imagem/JSON/DOM na main thread;
4. processos de ingest/FFmpeg.

O caminho certo é **conter e degradar antes de otimizar**. Com frame budget, backpressure, supervisor,
isolamento de erros e limites de recursos, o CastDeck deixa de depender de “a máquina aguentar” e passa a
ter um comportamento previsível: se a carga subir, a qualidade cai; se um processo cair, ele volta; se um
subsistema falhar, o PGM continua.

E a regra que não pode ser quebrada: **o retorno do convidado é crítico**. Ele não desce para 15 fps, não
“pisca” e não é sacrificado para salvar uma miniatura. A degradação começa no que é opcional e termina, no
limite, na **quantidade de retornos** — nunca na fluidez de cada um.

“Nunca travar” de verdade só existe com essa combinação: **medição + limite + degradação + recuperação**,
com o retorno na mesma prioridade do PGM.


---

## 13. Implementação local (2026-11-03)

### Feito

- **Retorno do convidado:**
  - `GuestView` deixou de recompor a cena inteira e agora copia o **quadro final do PGM**
    (`drawImage`) para **960×540**, um canvas por convidado, com `captureStream(60)`.
  - O retorno segue o **fps do preset** (`applyPreset` → `setFps`), com piso de 30.
  - Bitrate inicial **2,2 Mbps (30) / 3,2 Mbps (60)**; escada adaptativa proporcional
    (2,2/1,8/1,5/1,2 e 3,2/2,6/2,2/1,8), sem o degrau antigo de 350 kbps.
  - O áudio continua individual; o vídeo é o mesmo programa para todos.
- **Render loop:** o Worker só agenda o próximo quadro após o ACK do anterior; não há fila de frames.
  Cada subsistema (PGM, vertical, convidados, switcher, auto) é chamado com `try/catch` isolado.
- **Prévia da mesa:** `PreviewView` agora recebe o fps do preset via `setPreviewFps` (30/60), em vez de ficar em 15. A miniatura da Cena continua em 8 fps.
- **Câmera do host:** watchdog automático removido; track encerrado/mudo mostra **Reabrir câmera**, sem parar o áudio ou a câmera sozinho.
- **Miniaturas:** ~6–8 fps mesmo no modo Estúdio, e só quando o bastidor está visível.
- **Backpressure:**
  - cliente pausa o MediaRecorder quando o WebSocket passa de 24 MB e retoma abaixo de 8 MB;
  - servidor honra `stdin.write() === false`: pausa o WebSocket de ingest e retoma no `drain` do FFmpeg.

### Ainda não implementado

- Supervisor/restart do servidor no launcher Tauri.
- Telemetria de frame/heap/event loop e HUD de diagnóstico.
- Limites de store/replay/ingest e admissão de convidados por capacidade.
- Fallback explícito de 480p e testes de soak completos.

### Testes locais realizados

- `node --check` em `compositor.js`, `studio.js`, `broadcaster.js` e `server/broadcast.js`: OK.
- `npm run test:security`: OK.
- `GuestView` 960×540 copiando um PGM de cor conhecida: pixel conferido.
- `setFps(60)` e `setFps(30)`: `minGap` alterado corretamente.
- Loop de render com ACK: continuou gerando frames sem exceções no Edge headless.
- **Não testado ainda:** sessão real de convidado/WebRTC, saturação de rede e retorno a 60 fps em
  hardware real; isso entra na próxima bateria.

### Build local

`dist/CastDeck.exe` 190.840.832 bytes; SHA-256
`d508a13ade18afb967ff771ac8238c0ffb2b2b83b5854f066dd139d96fe327a6`.
VPS/GitHub não receberam esta implementação.
