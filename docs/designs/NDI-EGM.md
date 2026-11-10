# NDI no CastDeck — decisão e plano (EGM)

Status: **Fases 1/2 implementadas localmente em 1.4.0**, 2026-11-06. Sem publicação.

## 0. Fase 0 iniciada

Backup local antes de tocar no código:

- `D:\Backups\CastDeck\castdeck-pre-ndi-20261106-021055.tar.gz`
- 24.451.978 bytes
- SHA-256 `E13E7DEC5E64FD86D4456D39F93378E6020B790E85D290C72C22B6B61F94EAA4`

Foi criado o protótipo nativo em **Rust** [`native/ndi-bridge`](../../native/ndi-bridge/README.md):

- carrega o NDI Runtime dinamicamente (o SDK não entra no repositório);
- `version`, `list`, `receive` e `send-test`;
- testado com NDI Runtime 6.3.2 e NDI Test Patterns:
  - descoberta de fonte;
  - recepção 1920×1080 com vídeo + áudio;
  - envio de padrão 1280×720 BGRA + áudio estéreo e recepção do próprio sinal.

A Fase 0 validou o runtime e os caminhos de envio/recepção. As Fases 1 e 2 foram
implementadas localmente em 1.4.0 (sem publicação), como descrito abaixo.

### 0.1 Fase 1/2 local (2026-11-06)

Implementado no app local **1.4.0**, ainda sem publicação:

- **NDI Source:** bridge `extract` entrega UYVY/BGRA + f32le por stdout; o servidor cria
  uma entrada MediaMTX, codifica H.264/AAC com FFmpeg e o painel usa o fluxo WHEP existente.
- **NDI Output:** `programStream` → WebSocket local → FFmpeg decodifica para UYVY + f32le →
  bridge `send-raw` → `NDIlib_send_send_video_async_v2`.
- Painel **Sinais → NDI** com fontes descobertas, adicionar/remover, ligar/parar a saída.
- **NDI desligado por padrão** (`settings.ndiEnabled=false`); um seletor no painel ou o botão
  **NDI** na barra superior ativa o subsistema. Ao desativar, todas as sessões são encerradas.
- Botão **NDI** separado na barra superior e opção **Fonte NDI** no menu **+ Câmeras**,
  redesenhado com ícones SVG e cartões de origem.
- A fonte NDI adicionada entra nos bastidores mesmo quando a conversão WHEP ainda não
  tem `play`; o `ingest.addToStudio` atualiza `/api/ingest` antes de conectar.
- Fontes de baixo FPS (NDI Test Patterns entrega ~1 fps) são convertidas para CFR 30 no
  FFmpeg com repetição do último quadro; o caminho é aguardado no MediaMTX e o FFmpeg
  reconecta algumas vezes se o publisher ainda não estiver pronto.
- A entrada é normalizada para 1920×1080 (letterbox/pillarbox quando necessário). Dimensões
  fora do padrão, como 1774×886 do Test Patterns redimensionado, causavam tearing/ruído no
  decoder H.264 do WebRTC.
- Se resolução/FourCC mudar durante a sessão, o bridge envia um registro `M` e o servidor
  reinicia o FFmpeg com o novo formato; stride 0/negativo também é tratado no `extract`.
- A fonte NDI publica direto em **SRT H.264 + Opus** (latência 100 ms) e o MediaMTX não cria `_web`; entradas órfãs de sessões anteriores são podadas automaticamente.
- A saída NDI usa `clock_video=false`, time-slice de 50 ms e `-vsync 0` no decode para reduzir o atraso.
- O áudio da fonte NDI entra no Mixer (canal `ingest:<key>:audio`, tag NDI), fica roteado
  no **retorno de monitor** por padrão e acompanha o palco/programa como as câmeras locais.
  O `addStream` só é chamado quando a faixa de áudio WebRTC realmente chega, evitando a
  corrida em que o canal ficava vazio.
- Build local inclui `castdeck-ndi.exe` em `vendor/win-x64`; o NDI Runtime continua externo.
- Testes locais:
  - fonte NDI estável → MediaMTX `live=true`, H264 + AAC, WHEP disponível;
  - saída do programa 1280×720@30 → receptor NDI recebeu **91 vídeos/91 áudios em 3 s**;
  - UI E2E no Edge: **19/19**, incluindo seletor, botão NDI separado, fonte nos bastidores,
    conexão WHEP, áudio no Mixer e retorno de monitor. Entrada pronta em ~1,3 s.


Objetivo: receber fontes NDI e publicar a saída do programa como NDI, sem transformar o navegador
em um host de plugins nativos e sem quebrar o caminho atual de WebRTC, RTMP, gravação e Playout.

## 1. Resumo da decisão

Adotar um **sidecar nativo** (`castdeck-ndi`) conversando com o servidor local:

- **Entrada NDI:** NDI SDK → sidecar → transcodifica para H.264/Ópus → MediaMTX local → WHEP →
  navegador. O NDI aparece como uma fonte normal do estúdio (palco, layout, ajuste de enquadramento,
  mixer), reutilizando a infraestrutura de `server/ingest.js`.
- **Saída NDI:** `programStream` ou `vStream` → MediaRecorder/WebCodecs → WebSocket local → sidecar →
  FFmpeg decodifica → quadros UYVY/BGRA + áudio → NDI SDK.
- O sidecar é um processo separado, com NDI SDK carregado dinamicamente. O navegador e o compositor
  continuam sem código nativo.
- O caminho NDI é independente de “Transmitir”/“Gravar”, mas não substitui WebRTC/RTMP existentes.

Essa escolha evita três armadilhas: carregar SDK proprietário no WebView, reescrever o compositor em
C++ e acoplar NDI ao FFmpeg de transmissão.

## 2. Como o OBS faz (estudo)

O OBS Studio não tem NDI no núcleo. O [DistroAV](https://github.com/DistroAV/DistroAV) (antigo
OBS-NDI, licença GPL-2.0) é um plugin C/C++ que registra tipos de fonte/saída no OBS:

### Fonte NDI

No [`ndi-source.cpp`](https://github.com/DistroAV/DistroAV/blob/master/src/ndi-source.cpp):

- o plugin descobre fontes com o finder do NDI SDK e permite escolher nome, bandwidth
  (highest/lowest/audio-only), formato de cor, áudio e PTZ;
- cria o receptor com `NDIlib_recv_create_v3` (ou APIs equivalentes do SDK), com framesync;
- captura vídeo/áudio e chama `obs_source_output_video` / `obs_source_output_audio`;
- o OBS recebe quadros já reproduzíveis e cuida do clock, render e mistura como qualquer fonte.

Ou seja: o plugin é um adaptador fino. Ele não compõe a cena nem grava; entrega frames ao OBS.

### Saída NDI

No [`ndi-output.cpp`](https://github.com/DistroAV/DistroAV/blob/master/src/ndi-output.cpp):

- registra um `obs_output_info` com `raw_video` e `raw_audio`;
- ao iniciar, cria o sender NDI com `NDIlib_send_create`;
- envia o programa com `NDIlib_send_send_video_async_v2` e o áudio com
  `NDIlib_send_send_audio_v3`;
- usa o pipeline de vídeo/áudio do OBS, sem recodificar dentro do plugin.

O DistroAV também expõe saída principal, prévia e filtro/dedicated output. A documentação oficial
recomenda NDI Runtime **6.3+** para a versão atual do plugin
([requisitos](https://github.com/DistroAV/DistroAV#-requirements)).

### O que não copiar

O DistroAV é GPL-2.0. O CastDeck é AGPL-3.0. O plano **não reutiliza código do DistroAV**: usa apenas o
comportamento e a API pública do NDI SDK como referência. Qualquer trecho de terceiros precisa de
revisão de licença antes de entrar no repositório.

## 3. Restrições e requisitos do NDI

- O receptor usa `NDIlib_recv_create_v3`/`v4` e o finder do SDK; o sender usa `NDIlib_send_create` e
  as chamadas assíncronas de vídeo.
- O SDK espera **program stream em resolução plena** e, para boa interoperabilidade, um **preview
  stream** progressivo com maior lado de 640 px e no máximo ~45 Hz
  ([sending](https://docs.ndi.video/all/developing-with-ndi/advanced-sdk/ndi-sdk-review/sending.md)).
- O áudio deve chegar no nível correto (referência +4 dBU para faixa -1…+1) e com timestamp coerente.
- A descoberta é feita pelo finder/NDI Discovery; a rede precisa permitir mDNS/portas NDI. NDI não é
  autenticado por padrão: limitar ao segmento local e documentar firewall.
- O NDI Runtime 6.3+ deve estar disponível. O sidecar deve detectar ausência e mostrar link para
  <https://ndi.video/tools/>.

## 4. Licença e distribuição (gate obrigatório)

O SDK é proprietário. A [licença do NDI Advanced SDK](https://docs.ndi.video/all/developing-with-ndi/advanced-sdk/licensing.md)
exige, entre outros pontos:

- link para <https://ndi.video/> perto dos locais onde NDI é usado/selecionado, no site e na documentação;
- não distribuir as NDI Tools (apenas link para <https://ndi.video/tools/>);
- usar **NDI®** com a atribuição “NDI® is a registered trademark of Vizrt NDI AB”;
- incluir as DLLs do NDI na pasta da aplicação, não no PATH do sistema;
- contatar licensing/vendor ID para uso comercial do Advanced SDK;
- revisar licenças de H.264/AAC/H.265 conforme o caso.

**Antes de qualquer release com NDI:** revisar o contrato do SDK, obter vendor ID se necessário e
adicionar `NOTICE`/página de créditos. O sidecar e o CastDeck precisam continuar compatíveis com
AGPL-3.0 (código do sidecar disponível e build reproduzível).

## 5. Arquitetura proposta

```text
                       ┌──────────────────────────── CastDeck ───────────────────────────┐
                       │  UI (browser)                                                  │
                       │   ├── NDI Source: escolhe fonte, adiciona ao palco             │
                       │   └── NDI Output: liga/desliga, nome, PGM/vertical              │
                       │                    │ WebSocket/HTTP local                     │
                       │              Node server (auth local)                          │
                       └───────────────┬───────────────────────────┬────────────────────┘
                                       │                           │
                       ┌───────────────▼───────────┐   ┌───────────▼──────────────────┐
                       │ MediaMTX (já embutido)    │   │ castdeck-ndi (sidecar)       │
                       │ RTMP/WHIP/WHEP local      │   │ NDI SDK + FFmpeg             │
                       └───────────────▲───────────┘   │  ├─ receiver/finder          │
                                       │               │  ├─ sender                   │
                         H.264/Ópus    │               │  └─ sessões/status           │
                                       │               └───────────▲──────────────────┘
                       ┌───────────────┴───────────┐               │
                       │ Navegador (fonte WHEP)     │       NDI na rede local
                       └───────────────────────────┘
```

### Processos

| Processo | Responsabilidade |
|---|---|
| Navegador/CastDeck | UI, compositor, áudio, `programStream`/`vStream`, MediaRecorder/WebCodecs |
| `server/` | API local, orquestração, autenticação, ingest WHEP, supervisão do sidecar |
| MediaMTX | reempacotamento RTMP↔WHEP; já existe para entradas RTMP/SRT |
| `castdeck-ndi` | Rust: única camada que fala NDI SDK; receptor, sender, finder e conversão |
| FFmpeg | codecs/containers no sidecar e no ingest atual |

O sidecar nunca escuta fora de `127.0.0.1`; o servidor inicia/para e faz health check. O NDI sai/entra
pela rede local via SDK.

## 6. Entrada NDI em detalhe

### Fluxo

```text
NDI source ──NDI SDK──> castdeck-ndi (receiver)
  ├─ vídeo: UYVY/BGRA ou comprimido ──> FFmpeg H.264
  └─ áudio: PCM ──────────────────────> FFmpeg Ópus/AAC
        └──RTMP──> MediaMTX (path ndi-xxxxxx) ──WHEP──> navegador
```

### Integração com o estúdio

1. UI lista fontes via `GET /api/ndi/sources` (finder do sidecar, cache de 1–2 s).
2. Ao escolher uma fonte:
   - servidor cria uma entrada no MediaMTX (`ingest.addSource`) com nome “NDI · <fonte>”;
   - sidecar inicia o receiver, converte e publica em `rtmp://127.0.0.1:1935/<key>`;
   - servidor cria a fonte no estúdio como `kind: 'camera'`/`ndi`, com `ingest` e áudio no mixer;
   - UI reutiliza o mesmo pipeline WHEP dos drones/câmeras.
3. “Remover” para o receiver, remove o path e a fonte.
4. Reconexão: se a fonte NDI cair, sidecar mantém o path e tenta `recv` novamente; UI mostra “sem sinal”.

### Codecs e latência

- Fase 1: H.264 + Ópus a 48 kHz, resolução/fps do preset do estúdio; usar encoder de hardware
  (`h264_nvenc`/`qsv`/`amf`/`videotoolbox`) detectado pelo ingest.
- O caminho NDI→RTMP→WHEP acrescenta latência de transcodificação e buffer. Meta inicial:
  **LAN, 1080p30, < 800 ms**; medir e ajustar.
- Fase 2 (opcional): passthrough/WHIP ou WebCodecs no navegador para reduzir latência; só entra se a
  Fase 1 falhar nos testes de lip sync/qualidade.

### Descoberta e UX

- Lista com nome NDI, endereço, grupos e status.
- Campo para **endereço manual** (quando mDNS está bloqueado).
- Opções: bandwidth (high/low/audio-only), áudio ligado, formato de cor; PTZ em fase posterior.
- Mensagens claras para “NDI Runtime não encontrado” e “fonte não encontrada”.

## 7. Saída NDI em detalhe

### Fluxo

```text
canvas + mixer.programTrack
   └─ MediaRecorder WebM (H.264/VP8 + Ópus) ou WebCodecs H.264
        └─ WebSocket ──> Node ──pipe──> castdeck-ndi
             └─ FFmpeg decode → UYVY/BGRA + PCM → NDI sender
                  ├─ program stream (resolução do preset)
                  └─ preview 640×360, progressivo, ≤45 Hz
```

### Integração

- Aba **NDI** em Sinais/Saídas, com:
  - ligar/desligar saída;
  - nome (`CastDeck — <estúdio> — PGM`) e grupos;
  - escolher programa horizontal, vertical ou futuramente fonte isolada;
  - áudio ligado/desligado;
  - status, fps, bitrate, erros e botão “testar no NDI Monitor”.
- O servidor mantém uma sessão por saída; o navegador abre um WebSocket local e envia mídia
  independentemente de live/gravação.
- O sidecar envia programas + preview ao SDK; o NDI aparece em OBS, vMix, NDI Monitor etc.

### Por que MediaRecorder na Fase 1

- Reutiliza o mesmo modelo do `Broadcaster` (WebM + WebSocket + FFmpeg).
- Não exige WebRTC nativo no sidecar.
- Funciona com o `programStream` atual e com o áudio do mixer.
- Custo: encode/decode extra e latência de ~200–500 ms; aceitável para a primeira versão,
  mensurável e substituível por WebCodecs na Fase 3.

### Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Plugin nativo no navegador/WebView | navegador não carrega NDI SDK; exigiria C++ no renderer |
| NDI direto no compositor | quebra portabilidade e separação de processos |
| Só RTMP local quando “Transmitir” está ligado | não é saída independente; NDI deve funcionar parado |
| WebRTC nativo já na Fase 1 | maior complexidade de ICE/codecs; adiar |

## 8. Contratos de API e dados

Proposta inicial (nomes podem mudar na implementação):

| Rota | Uso |
|---|---|
| `GET /api/ndi/status` | runtime, sidecar, versão, sessões ativas |
| `GET /api/ndi/sources` | fontes NDI descobertas, grupos, endereço |
| `POST /api/ndi/sources/:name/start` | abre receiver e cria path/fonte |
| `POST /api/ndi/source/:id/stop` | encerra receiver/path |
| `POST /api/ndi/outputs` | inicia saída (nome, PGM/vertical, áudio, preview) |
| `DELETE /api/ndi/outputs/:id` | encerra saída |
| `WS /api/ndi/status` | eventos de descoberta, fps, erros e quedas |

Persistência local:

```json
{
  "ndi": {
    "sources": [{ "name": "CAM 1 (Program)", "bandwidth": "highest", "audio": true }],
    "outputs": [{ "name": "CastDeck — PGM", "source": "pgm", "preview": true }]
  }
}
```

As fontes NDI entram no modelo normal de `S.sources` (com `ownerId: host`, `ingest: true`, `adjust`
do estúdio). O NDI não cria thumbnails próprios: o backstage usa o mesmo canvas/WHEP das outras fontes.

## 9. Fases

### Fase 0 — prova técnica e licença

- sidecar mínimo: listar fontes, receber 1 frame, criar sender.
- validar NDI Runtime 6.3+, Windows/Linux/macOS, FFmpeg e SDK.
- revisar licença/vendor ID, NOTICE e página de créditos.
- medir CPU/latência com 1080p30.

**Saída:** protótipo que não entra na release; decisão go/no-go.

### Fase 1 — NDI Source

- sidecar + MediaMTX + WHEP;
- aba NDI, descoberta, iniciar/parar, status, reconexão;
- fonte no palco/mixer, áudio, ajustes de enquadramento;
- testes de sync e queda de rede.

### Fase 2 — NDI Output PGM

- MediaRecorder/WebM + WebSocket + sidecar;
- saída independente de live/gravação;
- programa + preview; áudio do mixer;
- UI de saída, persistência e health check.

### Fase 3 — Qualidade e operação

- WebCodecs/raw ou passthrough quando necessário;
- vertical e saídas isoladas;
- alpha, grupos, PTZ, bandwidth, áudio-only;
- múltiplas saídas, reconexão, watchdog e telemetria;
- empacotamento assinado e documentação.

## 10. Critérios de aceite

- NDI Source aparece em NDI Studio Monitor e pode ser adicionada ao palco.
- Vídeo e áudio sincronizados; reconexão após queda; sem travar o estúdio.
- NDI Output aparece em OBS/vMix/NDI Monitor com programa+preview e áudio.
- NDI Output funciona com a live parada e simultânea a RTMP/gravação.
- NDI Source + Output simultâneos sem conflito de portas/processos.
- Sem NDI Runtime: erro claro, link e nenhuma queda do app.
- CPU/latência dentro da meta; perda de pacote não derruba o programa.
- Sidecar morto é reiniciado/avisado sem afetar o palco.
- Licença, créditos e NOTICE revisados antes da release.

## 11. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| CPU alta por transcode NDI↔H.264 | hardware encoders, presets, preview baixo, medir; Fase 3 WebCodecs |
| Latência/lip sync | buffers pequenos, timestamps NDI, teste com NDI Monitor; meta explícita |
| NDI SDK proprietário/AGPL | sidecar separado, revisão jurídica, vendor ID, NOTICE |
| DLLs conflitantes com OBS/NDI Tools | DLLs na pasta do app, nunca no PATH |
| Descoberta mDNS bloqueada | entrada manual, NDI Discovery Server opcional, docs de firewall |
| Rede não confiável (NDI sem auth) | LAN only, firewall, grupos, não expor no túnel |
| Sidecar instável | supervisão, timeout, logs, reconexão; áudio/vídeo do estúdio independem |
| Codecs que o navegador não toca | H.264/Ópus na Fase 1; fallback de conversão no MediaMTX |

## 12. Referências

- NDI SDK — recebendo: <https://docs.ndi.video/all/developing-with-ndi/advanced-sdk/ndi-sdk-review/receiving.md>
- NDI SDK — enviando (program + preview): <https://docs.ndi.video/all/developing-with-ndi/advanced-sdk/ndi-sdk-review/sending.md>
- NDI SDK — finding: <https://docs.ndi.video/all/developing-with-ndi/advanced-sdk/ndi-sdk-review/finding.md>
- NDI — licenciamento: <https://docs.ndi.video/all/developing-with-ndi/advanced-sdk/licensing.md>
- NDI em OBS (DistroAV): <https://docs.ndi.video/all/using-ndi/obs-and-3rd-party-software/getting-started-with-ndi-in-obs-for-windows-or-mac.md>
- DistroAV (GPL-2.0): <https://github.com/DistroAV/DistroAV>
- Fonte OBS: <https://github.com/DistroAV/DistroAV/blob/master/src/ndi-source.cpp>
- Saída OBS: <https://github.com/DistroAV/DistroAV/blob/master/src/ndi-output.cpp>
- MediaMTX (já embutido no CastDeck): <https://github.com/bluenviron/mediamtx>

**NDI® is a registered trademark of Vizrt NDI AB.**
