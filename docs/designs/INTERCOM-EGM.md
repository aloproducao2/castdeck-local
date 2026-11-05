# EGM — Intercom do CastDeck

> **Status:** publicado no CastDeck 1.3.33 em 2026-11-04 (site/VPS `cast.flue.live`).
> **Base:** CastDeck Local 1.3.33 (mixer, câmeras remotas, signaling WebRTC e painel lateral).
> **Escopo desta implementação:** painel Intercom no host, PTT/IFB por participante, retorno de áudio no mesmo peer da câmera, PTT na página `/cam`, página independente `/intercom/:id` com chave, controles no painel Câmeras e teste de tom no retorno.
> **Também nesta versão:** PTT travado (host, câmera e repórter), mini painel opcional de intercom + corte, PTT maior na câmera e na página mobile, Wake Lock e Media Session/keepalive na página independente.
> **Ainda não incluído:** sidetone ajustável, grupos configuráveis pelo operador, call/cue sem voz, ducking do IFB e papéis separados no signaling.
> **Sobre tela desligada no celular:** a página usa Wake Lock + Media Session e um áudio de manutenção silencioso. Isso mantém a tela ativa e cria a notificação de mídia do Chrome enquanto o navegador mantém a aba viva; não é uma garantia contra o Android encerrar a aba. Para background realmente garantido seria necessário um serviço em primeiro plano no app Android.
> **Data:** 2026-11-04
> **Detalhe de UI do host:** [`INTERCOM-HOST-PANEL.md`](INTERCOM-HOST-PANEL.md).
> **Objetivo:** dar ao diretor, cinegrafistas e repórteres uma comunicação de áudio em tempo real,
> integrada ao estúdio e às câmeras, com página própria para celular/rede.

---

## 1. Pedido

Criar um **intercom** que funcione junto com o resto do CastDeck:

- o diretor fala com cinegrafistas e repórteres;
- cinegrafistas e repórteres ouvem o diretor e podem falar de volta;
- deve funcionar localmente e, opcionalmente, pela internet;
- deve ter uma **página independente** para quem não está operando o estúdio;
- deve aparecer também no **sistema de câmeras** já existente;
- não pode atrapalhar o áudio do programa nem a qualidade das câmeras.

A referência mental é uma **partyline de broadcast** com **IFB**:

```text
DIRETOR  ── fala/ouve ──  CÂMERA 1
         ── fala/ouve ──  CÂMERA 2
         ── fala/ouve ──  REPÓRTER
         ── ouve ───────  retorno do programa (IFB)
```

---

## 2. Decisões de produto

### 2.1 Não é um app separado

O intercom é uma **camada de áudio** do próprio CastDeck:

- mesma sala de sinalização;
- mesmo servidor local;
- mesmo estúdio;
- mesma chave de acesso;
- mesma identidade visual.

A página independente é só uma **interface** para participantes que não estão no estúdio.

### 2.2 PTT como padrão

- **Push-to-talk** para falar.
- Escuta sempre ligada (IFB), com volume próprio.
- Modo **travar** opcional para mãos ocupadas.
- Microfone fechado por padrão para câmeras/repórteres.
- O diretor tem PTT geral, PTT por grupo e PTT individual.

### 2.3 O intercom não vai ao programa por padrão

O áudio de talkback é uma via de produção, não de transmissão. Mandar para o PGM precisa ser uma
ação explícita (por exemplo, “abrir talkback no programa”), com confirmação.

### 2.4 Um único microfone por participante

Para câmera que já envia microfone ao estúdio, o intercom **reutiliza a mesma faixa**. Não criar
uma segunda captura/encoder no celular.

### 2.5 Pesquisa em intercoms broadcast

Referências de design consultadas (não são dependências de software):

- **RTS KP-812 / keypanels** — teclas atribuíveis com funções de talk e listen, display alfanumérico,
  atribuição de teclas e modos de operação. Manual: [RTS KP 812](https://products.rtsintercoms.com/binary/KP%20812%20User%20Manual.pdf).
- **Clear-Com HelixNet** — partyline digital por canais, beltpacks de 2 teclas e áudio de programa.
  Referência: [HelixNet Beltpack](https://www.clearcom.com/DownloadCenter/datasheets/HelixNet/HelixNet-Beltpack_Datasheet.pdf).
- **Green-GO WBPX / Beltpack X** — 2, 3 ou 4 canais por modo de interface; botões e LEDs RGB por canal;
  talk, listen e call; encoders configuráveis para **volume principal, programa e sidetone**; estados
  de canal (livre, sem membro, ocioso, ativo, talk, autotalk, call, alerta, cue); lista rápida de
  destinos. Documentação: [Green-GO WBPX](https://manual.greengoconnect.com/en/devices/wbpx/).
- **Unity Intercom** — estações em celular; seleção independente de **Talk** e **Listen** por canal;
  volume independente do programa; PTT grande momentâneo ou travado; tally PGM/PVW no celular;
  permissões por usuário; administração com **Page All** e **Mic Unlatch**. Referência:
  [Unity Intercom self-hosted](https://vtx.uk/unity-intercom-self-hosted/).
- **Studio Technologies IFB** — feed de programa com interrupção de talkback para talento.
  Referência: [Model 42A](http://studio-tech.com/wp-content/uploads/2017/12/ug_m42a_2.pdf).

#### O que esses sistemas ensinam

| Padrão broadcast | Tradução para o CastDeck |
|---|---|
| O objeto principal é o **canal/tecla**, não a lista de contatos | Teclas: **DIRETOR**, **CÂMERAS**, **REPORTAGEM**, **PROGRAMA** |
| **Talk** e **Listen** são independentes | Cada tecla pode falar, ouvir ou ambos |
| PTT é **momentâneo** por padrão; latch é exceção | Segurar fala; travar exige ação deliberada |
| Há sempre um botão de **unlatch/mic all** | “Silenciar todos” e “Destravar microfones” no host |
| Programa/IFB tem **volume próprio** | Slider separado de programa e de intercom |
| Operador precisa se ouvir | **Sidetone** ajustável + medidor de microfone |
| Estado do canal é visível de longe | LED/cor + nome + nível + “falando” |
| Poucas teclas por tela, com modos 2/3/4 | 2 teclas no celular, 4 no desktop, sem micro-controles |
| Há sinais não verbais de chamada/cue | Alerta visual/“chamada” opcional, sem abrir voz |
| Fone é o padrão de operação | Aviso e bloqueio de alto-falante em câmera/reportagem |

#### Partyline, matriz e IFB

Os três modelos convivem no broadcast:

| Modelo | Como funciona | Vantagem | Risco |
|---|---|---|---|
| **Partyline** | todos num canal compartilhado ouvem/falam | simples, rápido, uma tecla | ruído acumulado, todos falam junto |
| **Matriz** | cada tecla é um crosspoint seletivo | controle fino, grupos, privacidade | configuração mais complexa |
| **IFB** | programa em uma via; diretor interrompe | talento ouve o programa e a direção | precisa mix-minus e nível separado |

O CastDeck deve ser um **híbrido em software**:

- teclas de grupo funcionam como partyline;
- teclas individuais funcionam como matriz;
- o canal PGM é IFB, com programa e talkback no mesmo retorno;
- o host faz o roteamento, sem hardware de matriz.

#### Semântica de cor do CastDeck

Broadcast usa vermelho/verde para **tally** (PGM/PVW). O intercom não deve reutilizar essas cores
para “falar”, senão o operador confunde talkback com câmera no ar.

| Estado | Cor | Uso |
|---|---|---|
| PGM / no ar | vermelho | tally existente |
| PVW / prévia | verde | tally existente |
| Intercom falando (PTT) | azul/ciano | botão de talk e borda da tecla |
| Escutando voz | ciano suave | atividade de listen |
| Chamada / cue / atenção | âmbar | piscar ou vibração |
| Conectado ocioso | cinza-esverdeado | ponto de presença |
| Mudo | cinza | microfone fechado |
| Offline / sem membro | cinza tracejado | tecla sem destino |

#### Anti-padrões que vamos evitar

- PTT pequeno no meio de outros controles da câmera.
- Microfone aberto por padrão em câmera/reportagem.
- Um único slider misturando programa e intercom.
- Lista de 12 pessoas em vez de 3–4 teclas operacionais.
- Usar vermelho/verde do tally para estados de talkback.
- Fechar o intercom quando a câmera entra no ar.
- Deixar o operador sem indicação de “seu microfone está aberto”.
- Depender de alto-falante do celular em ambiente com PA.

#### Aplicação no desenho das telas

- **Estúdio:** PTT geral + teclas `CAM`, `REP` e `PGM`, cada uma com nome, estado, PTT e listen.
- **Câmera (`/cam`):** modo simplificado de **2 teclas** — DIRETOR e PROGRAMA — com PTT grande.
- **Repórter (`/intercom`):** **2 teclas** — DIRETOR e PROGRAMA — e volume de programa.
- **Painel Câmeras:** por câmera, apenas o essencial: ouvir diretor, ouvir programa, PTT, volume.
- **Administração:** “Page all”, “Mic unlatch”, mute geral e rotação de chave.

---

## 3. Papéis e canais

| Papel | Ouve | Pode falar | Observações |
|---|---|---|---|
| **Diretor / host** | todos + programa | todos, grupos ou pessoa | Pode fazer PTT geral |
| **Cinegrafista** | diretor + programa (opcional) | diretor | Usa `/cam` ou `/intercom` |
| **Repórter** | diretor + programa (opcional) | diretor | Página de áudio, sem vídeo |
| **Convidado** | programa (retorno existente) | programa | Não entra no intercom por padrão |
| **Produtor / observador** | opcional | opcional | Escuta sem falar |

### Canais lógicos

1. **DIRETOR** — voz do host/diretor.
2. **PROGRAMA (IFB)** — programa mixado, em nível baixo e com ducking.
3. **PARTYLINE** — vozes dos outros participantes, opcional por pessoa.
4. **GRUPOS** — ex.: “Câmeras”, “Reportagem”, “Todos”.

O padrão de fábrica é:

```text
Câmera:   ouve DIRETOR + PROGRAMA (baixo)  / fala com DIRETOR
Repórter: ouve DIRETOR + PROGRAMA (baixo)  / fala com DIRETOR
Diretor:  ouve TODOS + PROGRAMA conforme mixer
```

### Teclas padrão

O operador pensa em **teclas de canal**, como num keypanel:

| Tecla | Destino | Talk | Listen |
|---|---|---|---|
| **TODOS** | todos / PTT geral | diretor fala com todos | todos ouvem o diretor |
| **CAM** | grupo Câmeras | diretor fala para o grupo | câmeras se ouvem, se habilitado |
| **REP** | grupo Reportagem | diretor fala para o grupo | repórteres se ouvem, se habilitado |
| **PGM** | programa/IFB | **não é talk** | volume de programa separado |

### Modos de interface

- **2 teclas:** câmera/reporter no celular (`DIR`, `PGM`).
- **3 teclas:** câmera com grupo (`DIR`, `CAM`, `PGM`).
- **4 teclas:** diretor no desktop (`TODOS`, `CAM`, `REP`, `PGM`).
- Nunca mostrar 12 participantes como 12 botões minúsculos; os participantes ficam em uma lista
  secundária de níveis/mute.

O **talk** e o **listen** de cada tecla são independentes. Uma tecla pode estar apenas ouvindo,
apenas falando, nos dois ou desligada.

---

## 4. Experiência

### 4.1 Estúdio — nova aba “Intercom”

Local sugerido: grupo **Áudio**, ao lado de **Mixer** (o intercom é operação de áudio, não uma
tela de conteúdo).

```text
┌ Intercom ──────────────────────────────────────────────────────────────┐
│ DIRETOR  [🎙 SEGURE PARA FALAR]   Sidetone [──●──]  [Silenciar todos]  │
│                                                                         │
│ ┌ TODOS ───────┐ ┌ CAM ─────────┐ ┌ REP ─────────┐ ┌ PGM ─────────┐   │
│ │ ● falando    │ │ ○ ocioso     │ │ ● ouvindo    │ │ ▮ programa   │   │
│ │ [Talk] [Lis] │ │ [Talk] [Lis] │ │ [Talk] [Lis] │ │ volume -18dB │   │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │
│                                                                         │
│ Participantes (níveis e atribuição)                                     │
│ ● Câmera 1 — João   no palco  fone OK   [volume] [mudo]                 │
│ ● Câmera 2 — Ana    prévia    fone OK   [volume] [mudo]                 │
│ ○ Câmera 3 — aguardando…                                                │
│                                                                         │
│ [Link/QR] [Destravar microfones] [Atualizar links]                      │
└─────────────────────────────────────────────────────────────────────────┘
```

As teclas são o centro da operação. A lista de participantes serve para conferir presença, nível,
fone e atribuição — não para substituir as teclas.

Recursos:

- indicador de conexão, tally, nível de cada participante;
- PTT do diretor;
- escolha: todos, grupo, pessoa;
- volume de retorno por participante;
- “ouvir programa” e nível de IFB;
- microfone do diretor com medidor;
- link/QR para câmera/reporter;
- botão de pânico “tudo mudo”;
- status “microfone aberto” e “sem fone” quando detectável.

### 4.2 Sistema de câmeras

Dentro do painel **Câmeras** (`camera-panel.js`), cada câmera remota ganha um bloco:

```text
Intercom
  [x] Ouvir diretor        volume [──●──]
  [x] Ouvir programa       volume [──●──]
  [ ] Falar (PTT)          [segurar para falar]
  Status: conectada · fone OK · 42 ms
```

Ações:

- ativar/desativar o retorno de intercom da câmera;
- PTT do diretor para aquela câmera;
- ouvir o áudio que a câmera enviar;
- abrir a página de intercom no celular;
- ver se o operador está com fone (quando o aparelho informar).

### 4.3 Página `/cam` — modo câmera

A página atual de câmera remota continua sendo a tela principal do cinegrafista. Ganha uma
**faixa de intercom** discreta:

```text
┌──────────────────────────────────────┐
│ [vídeo da câmera]                    │
│                                      │
│  DIRETOR  ● conectado   42 ms        │
│  [🎙 SEGURE PARA FALAR]              │
│  Ouvir diretor  [──●──]              │
│  Ouvir programa [──●──]              │
└──────────────────────────────────────┘
```

- O vídeo continua no mesmo `RTCPeerConnection`.
- O retorno de áudio do intercom entra no **mesmo peer**, sem nova conexão.
- A câmera não precisa abrir outra página.
- Microfone do intercom usa a mesma faixa quando já existe; PTT controla o envio.
- Botões grandes, resistentes a toque acidental.
- Aviso de fone obrigatório; nunca usar alto-falante no set.

### 4.4 Página independente `/intercom/:studio`

Para repórter/cinegrafista que só precisa de áudio:

```text
┌──────────────────────────────────────┐
│ CastDeck Intercom                    │
│ Estúdio: Podcast da Semana           │
│ ● Conectado ao diretor               │
│                                      │
│           [ SEGURE PARA FALAR ]      │
│                                      │
│ Ouvir diretor   [────●────]  -6 dB  │
│ Ouvir programa  [──●──────] -18 dB  │
│ [Mudo geral]                         │
│                                      │
│ Fone recomendado · tela ligada       │
└──────────────────────────────────────┘
```

- Áudio only: baixo consumo de bateria e rede.
- Funciona em celular/tablet/PC.
- Link local ou Internet, com chave.
- Pode ser aberta em navegador sem instalar.
- Tela cheia, wake lock, reconexão automática.

### 4.5 Link e QR

No painel Intercom e no painel Câmeras:

- link **LAN** (`https://192.168.x.x:3443/intercom/<id>?k=...`);
- link **Internet** quando o túnel estiver ativo;
- QR Code;
- botão copiar;
- botão “Testar neste PC”;
- regenerar chave.

O link deve deixar claro o papel:

```text
/intercom/<id>?k=<chave>&role=camera
/intercom/<id>?k=<chave>&role=reporter
```

---

## 5. Arquitetura

```text
┌────────────────────────────── CastDeck estúdio (host) ──────────────────────────────┐
│                                                                                      │
│  microfone do diretor ─┐                                                            │
│  câmeras/repórteres ───┼──► IntercomRouter ──► saída por participante (WebAudio)     │
│  programa (opcional) ──┘         │                    │                             │
│                                  │                    ├─► peer da câmera 1          │
│                                  │                    ├─► peer da câmera 2          │
│                                  │                    └─► peer do repórter           │
│                                  │                                                  │
│                            mixer/WebAudio                                           │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │ signaling (mesma sala, role=intercom)
                                      │
             /cam (câmera)             /intercom (repórter)
        vídeo + áudio                áudio only
        mesmo Peer                   Peer dedicado
```

### 5.1 Componentes novos

| Componente | Função |
|---|---|
| `intercomBus` no `mixer.js` | barramento interno de talkback, separado do programa e dos buses A–G |
| `intercomOutput(participantId)` | mix pessoal do participante, com exclusão do próprio microfone |
| `IntercomPanel` no estúdio | UI do diretor, grupos, PTTs, níveis e links |
| `intercom` no `camera-panel.js` | controles por câmera já existente |
| `/intercom/:id` | página autônoma de áudio |
| `intercom` no signaling | entrada/saída, PTT, estado, autorização e limite |
| `intercomKey` no `store` | chave por estúdio para link local/Internet |

### 5.2 Por que não usar os buses A–G

Os buses A–G já são saídas físicas configuráveis pelo operador. Usá-los para intercom:

- mistura roteamento de saída com talkback;
- pode mandar voz para uma interface errada;
- quebra expectativas de quem já usa os buses.

O intercom deve ter um **barramento privado**, com nome e semântica próprios.

---

## 6. Mixagem de áudio

### 6.1 Fonte do diretor

- Microfone do host (`host:mic`), pós-fader e pós-mute.
- Um **send** dedicado para o intercom.
- PTT controla o send com rampa curta (10–20 ms) para evitar clique.
- O diretor pode falar sem abrir o microfone do programa? Não: o mesmo microfone alimenta o
  programa quando o canal está aberto. O PTT do intercom **não** deve abrir o microfone do PGM.

### 6.2 Retorno por participante

Cada participante recebe um `MediaStreamAudioDestinationNode` com:

```text
diretor (PTT) ──► gain diretor
programa (IFB) ─► gain programa (baixo, com ducking)
partyline ──────► gain outros (opcional)
                 │
                 ▼
        MediaStreamDestination ──► peer do participante
```

Regras:

- **nunca** incluir o próprio microfone do participante;
- nunca incluir o intercom no `programBus`;
- o programa no IFB vem do **limiter/programBus**, com gain separado;
- o retorno é mono para economizar banda (ou estéreo se o dispositivo suportar);
- o nível de programa no IFB fica entre -18 e -24 dBFS por padrão;
- quando o diretor fala, o programa abaixa (ducking) por sidechain/compressor;
- rampas de 10–30 ms em todos os ganhos para não estalar.

### 6.3 Recepção dos participantes

- Câmera/reporter que já envia microfone: o host recebe a faixa no peer existente e liga no
  `intercomReceive`.
- Reporter só de áudio: peer novo, uma faixa de microfone.
- O diretor ouve os participantes no **monitor/cue** do mixer, não no programa.
- Cada participante tem mute/solo/volume próprios no painel.

### 6.4 Evitar duas vozes/eco

- Um microfone por pessoa.
- PTT fecha o microfone quando solto.
- Microfone da câmera começa desligado.
- O operador deve usar fone; a página avisa.
- O retorno IFB exclui a própria voz.
- O talkback jamais entra no PGM por padrão.
- Ao abrir o intercom, o áudio do programa no celular fica no fone, não no alto-falante.

### 6.5 Sidetone, microfone e confiança

Broadcast não é só “mandar áudio”: o operador precisa **confiar que o microfone está aberto** e que
o nível está certo.

- **Sidetone** local (o operador ouve a própria voz) ajustável de 0 a 20%; padrão baixo.
- Medidor de microfone e indicador **MIC ABERTO** sempre visíveis durante o PTT.
- Ganho de microfone separado do volume de escuta.
- Nível de talkback alvo: **-6 dBFS** de pico; limitador no retorno.
- Programa no IFB: **-18 a -24 dBFS**, separado.
- Teste de fone/mic no primeiro acesso.
- Sem sidetone em alto-falante aberto (evita realimentação).

### 6.6 Call, cue e atenção

Sinais não verbais são parte do intercom broadcast:

- **Call**: chama a atenção de uma tecla sem abrir voz (flash âmbar, vibração quando suportado).
- **Cue/GO**: pulso visual de “entrar no ar” ou “atenção”.
- **Alerta**: prioridade sobre o áudio normal.
- Sons de chamada são opcionais; em câmera/reportagem, padrão é vibração/visual.
- Nada disso abre microfone.

### 6.7 Administração e segurança operacional

- **Page All**: fala com todos.
- **Mic Unlatch**: destrava microfones que ficaram travados (equivalente ao Unity).
- **Silenciar todos**: fecha todos os microfones.
- **Encerrar intercom**: derruba todos os retornos e participantes.
- Ação de pânico no topo do painel, acessível sem menu.
- Log de entradas/saídas e de microfone travado, sem gravar áudio.
- PTT do diretor não pode ficar travado acidentalmente: latch exige confirmação ou opção
  “latch desabilitado” no perfil.

---

## 7. Transporte e signaling

### 7.1 Câmera existente

Não criar um segundo peer para a câmera:

1. o host já tem `g.peer` da câmera;
2. ao ativar intercom, o host adiciona uma faixa de áudio de retorno ao mesmo peer;
3. o `cam.js` escuta `peer.addEventListener('track')` e toca a faixa de áudio;
4. o microfone da câmera continua no mesmo `MediaStream`/sender;
5. PTT só abre/fecha o track de áudio.

Vantagens:

- zero conexão extra;
- mesma ICE/TURN;
- menor latência;
- menor consumo no celular;
- o vídeo não é interrompido.

### 7.2 Página independente

- Um peer **audio-only** por participante.
- O host recebe o microfone; devolve o mix pessoal.
- Sem vídeo, sem canvas, sem segundo encoder.
- Mesmo ICE/TURN e mesma sala.

### 7.3 Mensagens de signaling

| Mensagem | Direção | Função |
|---|---|---|
| `join {role:'intercom', kind, key}` | participante → servidor | entra no canal |
| `intercom-joined/left` | servidor → host | presença |
| `intercom-state` | host ↔ participante | nome, fone, PTT, nível, conexão |
| `intercom-ptt` | host/participante | abrir/fechar microfone |
| `intercom-cue` | host → participante | ouvir programa, volume, grupo |
| `intercom-tally` | host → participante | PGM/PVW e status |
| `intercom-error` | servidor → participante | chave inválida, cheio, etc. |

O servidor valida papel, chave e limites; o host revalida comandos.

### 7.4 Autorização

- `intercomKey` separada de `outKey` (OBS/vMix) e de `ccKey` (legendas).
- Chave obrigatória mesmo na rede local para intercom, pois envolve áudio de produção.
- `GET /api/intercom/:id/link` — só local; devolve URLs LAN/Internet, chave e QR.
- `POST /api/intercom/:id/rotate` — só local.
- Limite de participantes e taxa de mensagens.
- Expiração/rotação manual.

---

## 8. Integração com o sistema de câmeras

### 8.1 Painel Câmeras

Adicionar no cartão de cada câmera remota:

- “Intercom conectado”;
- “Ouvir diretor”;
- “Ouvir programa”;
- PTT para a câmera;
- volume de retorno;
- abrir link no celular;
- microfone do cinegrafista (já existente) com indicação de uso no intercom.

### 8.2 Página `/cam`

- Implementar `peer.ontrack` para o áudio de retorno.
- `C.mic` já existe; reutilizar quando o intercom estiver ativo.
- PTT no rodapé, não no meio do vídeo.
- Mostrar “DIRETOR FALANDO” e “VOCÊ ESTÁ FALANDO”.
- Wake lock e reconexão já existentes.
- Se a câmera não tiver fone, aviso; nunca abrir alto-falante automaticamente.

### 8.3 Câmera como repórter

Uma câmera pode ser marcada como **reporter** no estúdio. A diferença é de rótulo e de
permissões; o transporte é o mesmo.

---

## 9. Modelo de dados

Persistido no estúdio (host):

```json
{
  "intercom": {
    "enabled": true,
    "directorPtt": false,
    "ifbProgram": true,
    "ifbLevel": -18,
    "duck": true,
    "groups": [
      { "id": "cameras", "label": "Câmeras", "members": ["cam1", "cam2"] },
      { "id": "reportagem", "label": "Reportagem", "members": ["rep1"] }
    ],
    "participants": {
      "cam1": {
        "role": "camera",
        "label": "João",
        "listen": ["director", "program"],
        "talk": "director",
        "volume": 0.8,
        "ifbVolume": 0.35,
        "mic": true
      }
    }
  }
}
```

- Estado de conexão/PTT é efêmero.
- Chaves ficam no servidor, não no `brand` público.
- A configuração sobrevive a reload/reconexão.

---

## 10. Segurança e privacidade

- Chave por estúdio, link com `role`; sem chave não entra.
- Intercom não entra no programa nem nas gravações por padrão.
- Microfone do diretor só abre com PTT.
- Limite de participantes e de mensagens.
- Sanitização de nomes/estados (padrão do signaling atual).
- Logs de entrada/saída, sem gravar áudio.
- Aviso explícito de que o áudio é privado da produção.
- “Silenciar todos” e “sair do intercom” sempre visíveis.
- TURN opcional para internet; mesma política do convidado.

---

## 11. Performance e latência

Metas:

| Métrica | Meta |
|---|---|
| Latência LAN (voz diretor → câmera) | < 120 ms |
| Latência Internet | < 250 ms |
| CPU no host com 6 participantes | < 3% adicional |
| Banda por participante | 32–64 kbps Opus mono |
| Vídeo da câmera | inalterado |

Decisões:

- áudio mono, 48 kHz, Opus;
- sem vídeo no canal de reporter;
- um peer por câmera (reaproveitado);
- um output WebAudio por participante;
- nada de reencode/reprocessamento;
- limitar a 8–12 participantes;
- pausar o áudio quando a página estiver oculta, se seguro.

---

## 12. EGM — seis lentes

### 12.1 Operação

- PTT de uma mão, botão grande.
- Status “falando/ouvindo/conectado” visível de longe.
- O diretor não precisa procurar a câmera no painel para falar.
- “Todos” e grupos em um clique.

### 12.2 Criação

- Nenhum novo app para instalar.
- O mesmo link/QR do ecossistema CastDeck.
- Página de intercom reutiliza o design e o servidor.

### 12.3 Automação

- PTT abre/fecha com rampa.
- IFB com ducking do programa.
- Reconexão automática.
- Sem automação que possa abrir microfone sozinho.

### 12.4 Cognição

- Cores e rótulos claros: ouvindo, falando, mudo, sem fone.
- Tally do PGM/PVW no intercom.
- Um painel, não três telas.

### 12.5 Performance

- Áudio only.
- Mesmo peer da câmera.
- Sem impacto no vídeo.
- Prioridade para latência baixa.

### 12.6 Confiança

- Chave e papel.
- Intercom fora do PGM por padrão.
- Headphone-first.
- Botão de pânico.
- Nada de áudio gravado sem ação explícita.

---

## 13. Fases de implementação

### Fase 0 — Prova técnica (1–2 dias)

- Validar áudio bidirecional no peer da câmera (`/cam`) com `Peer.ontrack`.
- Testar `MediaStreamAudioDestinationNode` → `addTrack` → renegociação no Chromium/Edge.
- Medir latência e perda.
- Validar o desenho de **teclas** (2/3/4), PTT de uma mão e semântica de cor.
- Definir `intercomKey` e o papel `intercom` no signaling.

**Critério:** câmera ouve um tom do host e o host ouve o microfone da câmera no mesmo peer.

### Fase 1 — Núcleo do host (3–4 dias)

- `intercomBus` e `intercomOutput` no mixer.
- PTT do diretor, send para intercom, mix-minus e limiter.
- Aba **Intercom** no painel Áudio, com PTT geral e teclas TODOS/CAM/REP/PGM.
- Presença, níveis e administração (mute all / unlatch).
- Controles no painel Câmeras.

**Critério:** diretor fala com uma câmera e a câmera fala de volta, sem entrar no PGM.

### Fase 2 — Câmera remota (2–3 dias)

- `/cam` com retorno de áudio, modo de **2 teclas** (DIR/PGM), PTT, volume e status.
- Microfone opcional reutilizado; sidetone e medidor.
- Aviso de fone e wake lock.
- Reconexão e troca de câmera sem derrubar o intercom.

**Critério:** cinegrafista opera a câmera e conversa com o diretor na mesma tela.

### Fase 3 — Página independente (3–4 dias)

- `/intercom/:id` audio-only, 2 teclas e PTT grande.
- `role=camera|reporter`.
- QR/link local e Internet.
- `intercomKey`, rotação e limite.
- Layout mobile-first.

**Critério:** repórter entra pelo celular com link e conversa com o diretor.

### Fase 4 — Partyline, grupos e IFB (2–3 dias)

- Grupos “Câmeras”, “Reportagem”, “Todos”.
- PTT por grupo/pessoa.
- Programa no IFB com nível e ducking.
- Call/cue, sidetone e estados de fone.
- Tally com cores distintas do intercom.
- “Silenciar todos”, “Mic unlatch” e “Page all”.

**Critério:** 6 participantes em grupos, sem eco e sem vazar para o programa.

### Fase 5 — Qualidade e release (2 dias)

- Testes iPhone/Android/desktop.
- Teste LAN e Internet.
- Documentação, atalhos e ajuda.
- Release.

**Total estimado:** 2–3 semanas.

---

## 14. Critérios de aceite

- [ ] Diretor ouve câmera e câmera ouve diretor.
- [ ] PTT abre/fecha sem clique e sem abrir o microfone do PGM.
- [ ] Intercom não entra no programa nem na gravação por padrão.
- [ ] Câmera usa o mesmo peer; vídeo não cai ao ativar intercom.
- [ ] Câmera e repórter entram por link com chave.
- [ ] Página `/intercom` funciona local e pela Internet.
- [ ] Programa no IFB é opcional e tem ducking.
- [ ] Cada participante tem volume/mute independentes.
- [ ] PTT geral e teclas TODOS/CAM/REP/PGM com talk e listen independentes.
- [ ] PTT momentâneo; latch só quando habilitado.
- [ ] Tally vermelho/verde e intercom azul/âmbar não se confundem.
- [ ] Sidetone e medidor de microfone funcionam.
- [ ] “Mic unlatch”/“Silenciar todos” funcionam.
- [ ] Tally e status de conexão visíveis.
- [ ] Reconexão automática após tela bloqueada/queda de rede.
- [ ] Sem realimentação quando o operador usa fone.
- [ ] 6 participantes simultâneos sem impacto mensurável no vídeo.
- [ ] iPhone, Android e desktop validados.
- [ ] “Silenciar todos” e sair do intercom funcionam.

---

## 15. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Eco/realimentação | fone obrigatório, PTT, exclusão do próprio áudio, ducking |
| Latência alta | áudio mono, mesmo peer, sem vídeo, TURN próximo |
| Celular bloqueia tela | wake lock, reconexão, reabrir áudio no `visibilitychange` |
| Microfone abre sem querer | PTT com hold, latch opcional, confirmação para PTT geral |
| Voz vaza para o PGM | intercom em barramento privado; sem rota ao `programBus` |
| Link vaza | chave por estúdio, rotação, limite, log |
| Muitos participantes | limite 8–12, áudio only, monitores leves |
| Safari/iOS | teste específico, `playsInline`, áudio só após gesto |
| Operador não tem fone | aviso visual; não abrir alto-falante automaticamente |
| PTT travado / mic aberto | latch desabilitado por padrão, indicador MIC ABERTO, Mic Unlatch no host |
| Confundir tally com intercom | vermelho/verde só tally; talk azul, cue âmbar |
| Intercom atrapalha câmera | mesmo peer, sem alterar sender de vídeo |

---

## 16. Fora de escopo nesta primeira versão

- Substituir intercom de hardware (RTS/Clear-Com).
- Vídeo no canal de reporter.
- Tradução simultânea.
- Gravação de intercom.
- Comunicação ponto-a-ponto sem o host.
- Integração com NDI/ATEM.

### Evoluções futuras

- PTT por pedal/MIDI.
- Canais de IFB separados por grupo.
- “Diretor de palco” com permissões próprias.
- Intercom via celular em modo PWA offline.
- Monitor de latência por participante.
- Registro de eventos (sem áudio).

---

## 17. Resumo

O caminho certo é:

1. **barramento privado de intercom** no mixer;
2. **PTT** e mix-minus por participante;
3. **mesmo peer da câmera** para cinegrafistas;
4. **peer audio-only** e página `/intercom` para repórteres;
5. **chave e papel** em todos os links;
6. **IFB do programa** opcional, com ducking;
7. integração natural no painel de câmeras e no painel Áudio.

Isso entrega uma comunicação de produção de verdade sem criar um segundo sistema de áudio, sem
duplicar captura no celular e sem risco de vazar talkback para o programa.


---

## 18. Implementação local — 1.3.33

Implementado localmente em 2026-11-04, sem publicação:

| Arquivo | O que foi feito |
|---|---|
| `public/js/studio/mixer.js` | `intercomOutputs`, talk/program por participante, listen, tom de teste e reconexão do mic do host |
| `public/js/studio/studio.js` | aba **Intercom**, painel do host, PTT geral/grupo/pessoa, IFB, links/QR e API para o painel Câmeras |
| `public/js/studio/camera-panel.js` | bloco **Intercom** no cartão da câmera remota |
| `public/js/cam.js` | retorno de áudio no mesmo peer, PTT e volume de escuta na página da câmera |
| `public/js/intercom.js` + `public/intercom.html` | página independente audio-only, PTT, escuta e chave |
| `server/signaling.js` | estado `intercom`/`intercomRole` e validação de chave para a página independente |
| `server/index.js` | rota `/intercom/:id` |

Fluxo validado localmente com Edge e mídia fake:

- host e câmera remota no mesmo peer;
- PTT da câmera chega ao host;
- PTT do host chega à câmera e à página `/intercom`;
- IFB do programa;
- link com chave;
- página independente conectada.

Ainda não incluído: sidetone, call/cue, ducking real, grupos configuráveis e chave separada da chave de saída.
