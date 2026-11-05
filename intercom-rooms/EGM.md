# EGM — CastDeck Intercom

> **Status:** escopo e decisões fechados; **MVP publicado** em `cast.flue.live/intercom/` (v0.1.0).
> **Base:** intercom do CastDeck 1.3.33 + estudo do modelo de salas do VDO.Ninja.
> **Objetivo:** uma versão pública do intercom, distribuída pelo site, com criação de salas sem login.

---

## 1. Pedido

Criar uma **nova pasta** com um app de intercom que:

- possa ser **distribuído direto pelo site**;
- crie **salas sem login**, como o VDO.Ninja;
- gere um **link de host** e um **link de convidado**;
- funcione em celular e PC, com fone;
- permita criar uma sala em poucos segundos;
- continue sendo um intercom de produção (PTT, escuta, travar microfone), não uma videochamada.

### O que não é

- Não é o intercom local do estúdio CastDeck.
- Não substitui o painel do host da 1.3.33.
- Não exige abrir o CastDeck.
- Não é uma conta, um workspace ou um SaaS com equipes.
- Não é vídeo, chat, gravação ou OBS.

### 1.1 Escopo fechado

Este projeto é **somente o intercom de produção ao vivo**:

- áudio entre diretor, cinegrafistas e repórteres;
- **sem vídeo, chat, tela, gravação, multistream ou OBS**;
- **sem login**;
- **sem IFB de programa** — não existe mesa de programa neste app;
- host é o hub;
- **1 host + 14 convidados (15 pessoas no total)** no MVP;
- sala efêmera com TTL;
- PTT momentâneo e microfone travado;
- URL pública exata: **https://cast.flue.live/intercom/**.

A página de marketing **intercom.html** continua existindo separada. O app é uma pasta em `/intercom/`.

### 1.2 Reuso do app principal

O novo app não deve reimplementar tudo. Deve extrair/adaptar os módulos já validados na 1.3.33:

| Recurso atual | Uso no CastDeck Intercom |
|---|---|
| `public/js/rtc.js` | Peer WebRTC, negociação e ICE |
| `mixer.js` (métodos de intercom) | retorno pessoal, talk, listen e teste de tom |
| `public/js/intercom.js` | PTT, travar, Wake Lock, Media Session e reconexão |
| `public/js/cam.js` | referência de PTT grande e latch na câmera |
| `public/js/studio/studio.js` | referência visual do painel do host |
| `qr.js` / UI | QR e links |
| `features.css` | base visual do intercom |

Recomendação: criar módulos compartilhados em `intercom-rooms/public/js/`:

```text
rtc-peer.js        ← Peer
intercom-router.js ← retorno/mix-minus
ptt.js             ← PTT e latch
host-panel.js      ← UI do host
guest-page.js      ← UI do convidado
```

Não importar `studio.js` inteiro no app público: ele carrega câmera, mixer, cenas, compositor e
dependências que não existem em uma sala de intercom.

---

## 2. Referência VDO.Ninja

O VDO.Ninja foi usado como **referência de fluxo**, não como cópia.

| Padrão | Como o VDO.Ninja faz | Decisão para o CastDeck Intercom |
|---|---|---|
| Criar sala | URL com `?room=` | `POST /api/rooms` gera sala e links |
| Host | `?director=room`; primeiro diretor reivindica | link de host com segredo próprio |
| Convidado | link de sala | link de convidado com token |
| Sem login | sem conta | igual |
| Senha | opcional; `&password` | senha opcional + tokens |
| URL parameters | controlam sala/papel | links com papéis explícitos |
| Sala efêmera | morre quando todos saem | TTL + último participante |
| Mídia | P2P; signaling só encontra | áudio WebRTC estrela no host |
| TURN | quando rota direta falha | TURN próprio/gerenciado |
| Escala | malha; Meshcast/SFU opcional | limite de sala; SFU futuro |
| Segredos | senha em fragmento/hash | tokens em fragmento, nunca em log |

Referências:

- [Rooms](https://docs.vdo.ninja/getting-started/rooms.md)
- [Group rooms FAQ](https://docs.vdo.ninja/guides/how-does-group-chat-work.md)
- [&room](https://docs.vdo.ninja/advanced-settings/setup-parameters/room.md)
- [&director](https://docs.vdo.ninja/advanced-settings/director-parameters/director.md)
- [&password](https://docs.vdo.ninja/advanced-settings/setup-parameters/and-password.md)
- [How it works](https://docs.vdo.ninja/readme/how-does-it-work.md)

### O que vamos simplificar

O VDO.Ninja é uma ferramenta de vídeo com muitas opções. O CastDeck Intercom deve ser:

- **áudio-only**;
- **PTT como padrão**;
- **sem conta**;
- **sem cenas, sem gravação e sem multistream**;
- **com uma única função**: direção e equipe se ouvirem.

---

## 3. Proposta de produto

### 3.1 Fluxo de criação

```text
cast.flue.live/intercom/
        │
        ├─ [Criar sala]
        │     nome opcional
        │     senha opcional
        │     limite de participantes
        │
        ├─ Host link  ──► /intercom/host/<room>#k=<hostToken>
        └─ Guest link ──► /intercom/<room>#t=<guestToken>
```

Criar sala **não pede login, e-mail ou cartão**.

### 3.2 Fluxo do host

1. Abre o site.
2. Clica em **Criar sala**.
3. Dá um nome opcional.
4. Recebe:
   - link do host (privado);
   - link do convidado (para a equipe);
   - QR Code;
   - senha opcional.
5. Entra no painel do diretor.
6. Fala por PTT ou microfone travado.
7. Fecha a sala quando terminar.

### 3.3 Fluxo do convidado

1. Abre o link no celular.
2. Aceita o microfone.
3. Vê “Conectado ao diretor”.
4. Usa fone.
5. Segura o PTT ou ativa **Travar PTT**.

### 3.4 Papéis

O MVP tem somente **host** e **convidado**. Co-host e observador ficam fora do MVP.

| Papel | Link | Direitos |
|---|---|---|
| **Host** | `/intercom/host/<room>#k=...` | PTT, escuta, travar, expulsar, encerrar |
| **Convidado** | `/intercom/<room>#t=...` | PTT, escuta, travar o próprio microfone |

---

## 4. EGM — seis lentes

### 4.1 Operação

O que o diretor precisa:

- entrar em menos de 10 segundos;
- PTT grande;
- ver quem está na sala;
- falar com todos ou com uma pessoa;
- travar o microfone;
- encerrar a sala;
- compartilhar o link por WhatsApp/QR.

O que o convidado precisa:

- abrir link e ouvir;
- falar sem procurar configuração;
- saber se está falando;
- usar fone;
- reconectar se a tela apagar.

### 4.2 Criação

- nenhuma conta;
- sala aleatória ou nome legível;
- senha opcional;
- limite de participantes;
- link do host separado do link de convidado;
- QR já na criação;
- sala pode ser criada no celular.

### 4.3 Automação

- sala expira por inatividade;
- host ausente encerra ou coloca em espera;
- reconexão com o mesmo papel;
- limpeza de participantes fantasmas;
- rate limit na criação;
- nenhum microfone abre sozinho;
- PTT com rampa.

### 4.4 Cognição

- estados claros:
  - aguardando host;
  - conectado;
  - ouvindo;
  - falando;
  - microfone travado;
  - reconectando;
  - sala encerrada/expirada.
- cor não é o único sinal;
- o host vê quem está transmitindo;
- o convidado vê “diretor falando”;
- sem confundir com PGM/PVW (não existe tally nesta versão).

### 4.5 Performance

- áudio Opus mono;
- estrela no host: cada convidado envia uma faixa; o host devolve um mix pessoal;
- sem vídeo;
- sem reencode de vídeo;
- limite inicial de **15 pessoas na sala** (1 host + 14 convidados);
- TURN quando necessário;
- sala com 1 host + 4 convidados deve ser confortável em 4G.

### 4.6 Confiança

Sem login não significa sem controle:

- ID de sala aleatório e não sequencial;
- token de host separado do token de convidado;
- token no fragmento da URL (não vai ao servidor em logs);
- validação no servidor ao entrar;
- limite de tentativas;
- sala efêmera;
- host pode expulsar e encerrar;
- senha opcional;
- nenhuma gravação;
- sem anúncio ou rastreamento no app;
- links não listados publicamente.

---

## 5. Arquitetura proposta

```text
┌────────────────────── cast.flue.live/intercom/ ──────────────────────┐
│  app estático: criar sala, host, convidado, QR, PTT                  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ WSS + HTTPS
┌──────────────────────────────▼───────────────────────────────────────┐
│  intercom-signal (Node)                                               │
│  ├─ POST /api/rooms      cria sala + tokens                           │
│  ├─ WSS /ws              signaling + presença                         │
│  ├─ GET /api/rooms/:id   metadados mínimos (nome, estado)             │
│  ├─ rate limit / cap / TTL                                            │
│  └─ sem mídia: só SDP/ICE                                             │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ ICE / TURN
┌──────────────────────────────▼───────────────────────────────────────┐
│  WebRTC áudio                                                        │
│  host ◄── microfone ── convidado 1                                   │
│       ◄── microfone ── convidado 2                                   │
│       ── retorno pessoal ──► convidado 1/2                           │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.1 Modelo de mídia

- O host é o **hub**.
- Cada convidado tem **um peer** com o host.
- O host cria um retorno pessoal por convidado com WebAudio.
- O retorno inclui:
  - voz do host quando o PTT está aberto;
  - vozes dos outros convidados, se a sala for partyline;
  - nunca a voz do próprio convidado.
- Sem vídeo, sem canvas e sem encoder.

### 5.2 Limite de sala

| Versão | Limite |
|---|---:|
| MVP | 1 host + 14 convidados |
| Confortável em 4G | 1 host + 4 convidados |
| Fase SFU | 30+ |

Acima de 8, a estrela do host começa a pesar. SFU não entra no MVP.

### 5.3 Signaling

Mensagens propostas:

| Mensagem | Direção | Função |
|---|---|---|
| `room-create` | HTTP | cria sala e tokens |
| `join` | cliente → servidor | entra com token |
| `room-state` | servidor → clientes | presença e estado |
| `signal` | troca | SDP/ICE |
| `ptt` | host/convidado | microfone aberto/fechado |
| `host-command` | host | mute, expulsar, encerrar |
| `room-ended` | servidor | sala encerrada/expirada |

### 5.4 API de criação

```http
POST /api/rooms
Content-Type: application/json

{
  "name": "Reportagem",
  "maxParticipants": 8,
  "password": "opcional"
}
```

Resposta:

```json
{
  "roomId": "K7Q2M9",
  "hostUrl": "https://cast.flue.live/intercom/host/K7Q2M9#k=...",
  "guestUrl": "https://cast.flue.live/intercom/K7Q2M9#t=...",
  "expiresAt": "2026-11-05T01:00:00Z",
  "maxParticipants": 8
}
```

- `POST` sem login.
- Rate limit por IP.
- Token de host não é retornado em nenhuma API pública posterior.
- Senha nunca é armazenada em texto; hash com sal.
- Sala em memória no MVP; Redis na fase de escala.

### 5.5 Estrutura de pastas

```text
intercom-rooms/
├── public/
│   ├── index.html              # criar sala
│   ├── host.html               # painel do diretor
│   ├── room.html               # convidado
│   ├── css/intercom.css
│   └── js/
│       ├── create.js
│       ├── host.js
│       ├── guest.js
│       ├── rtc.js
│       ├── ptt.js
│       └── qr.js
├── server/
│   ├── index.js                # HTTP + WSS
│   ├── rooms.js                # criação, TTL, tokens
│   ├── signaling.js            # salas e mensagens
│   ├── rate-limit.js
│   └── config.js
├── test/
│   ├── rooms.test.js
│   └── e2e-audio.test.js
└── README.md
```

Nada disso foi implementado ainda.

---

### 5.6 Publicação em `cast.flue.live/intercom/`

Rotas de produção:

```text
GET  /intercom/                 → app de criação de sala (index.html)
GET  /intercom/host/<sala>      → painel do host
GET  /intercom/<sala>           → convidado
POST /intercom/api/rooms        → cria sala
WSS  /intercom/ws               → signaling
GET  /intercom.html             → página de marketing existente
```

Nginx (conceito):

```nginx
location = /intercom/ { try_files /intercom/index.html =404; }
location /intercom/api/ { proxy_pass http://127.0.0.1:3210/api/; }
location /intercom/ws {
  proxy_pass http://127.0.0.1:3210/ws;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
location /intercom/ { try_files $uri $uri/ /intercom/index.html; }
```

- O app não depende do CastDeck local.
- O servidor de signaling pode ser um processo Node separado.
- O TURN deve ter credenciais temporárias e TLS.
- A pasta `landpage/` continua sendo o site; o build/deploy precisa copiar
  `intercom-rooms/public` para `landpage/intercom/`.
- Não usar a rota `/intercom/:id` local do app 1.3.33 neste domínio; ela é do estúdio local.


## 6. Segurança sem login

O maior risco de uma sala sem login é virar um canal aberto de abuso.

### 6.1 Tokens

- `roomId`: 8 caracteres base32, aleatório.
- `hostToken`: 32 bytes aleatórios.
- `guestToken`: JWT/HMAC curto com `roomId`, papel, expiração.
- Host token **nunca** vai ao servidor de mídia; só no `join` WSS.
- Tokens em **fragmento** (`#`) para não aparecer em logs de proxy.
- Servidor não registra token completo.

### 6.2 Controles

- limite de participantes;
- limite de salas por IP;
- rate limit no `POST /api/rooms`;
- TTL de sala (ex.: 6 h);
- sala encerra se o host cair por mais de 5 min;
- aprovação manual opcional na fase 2;
- host pode expulsar;
- bloqueio de origens desconhecidas;
- TLS obrigatório;
- TURN com credenciais temporárias;
- sem gravação;
- sem listagem pública de salas.

### 6.3 Abuso

- CAPTCHA só se houver abuso real;
- bloqueio por ASN/IP em caso de flood;
- limite de microfone simultâneo;
- sala “morta” não consome mídia;
- logs de eventos, não de áudio.

---

## 7. Interface

### 7.1 Criar sala

```text
┌ Intercom ──────────────────────────────┐
│ Crie uma sala para sua equipe          │
│ [Nome opcional]                        │
│ [Senha opcional]                       │
│ Participantes [4 ▾]                    │
│ [Criar sala grátis]                    │
│ Sem login · sala efêmera · áudio       │
└────────────────────────────────────────┘
```

Depois de criar:

```text
Sala criada
[Link do host]   copiar
[Link da equipe] copiar / QR
[Entrar como diretor]
```

### 7.2 Host

- título da sala;
- PTT geral;
- lista de convidados;
- PTT individual;
- mute/expulsar;
- travar microfone;
- link/QR;
- encerrar sala;
- status de conexão.

### 7.3 Convidado

- “Conectado ao diretor”;
- PTT grande;
- ouvir;
- travar;
- sair.

### 7.4 Celular

- PTT de 56 px ou mais;
- fone;
- tela ativa;
- notificação de mídia;
- reconexão;
- sem scroll horizontal.

---

## 8. Fases

### Status da implementação

- Fase 0: **implementada localmente** (API de salas, tokens, senha, signaling e áudio WebRTC).
- Fase 1: **implementada localmente** (criação, host, convidado, PTT, latch, QR, mute, remover, encerrar).
- Fase 2: **publicada** em `/intercom/` com Nginx, processo na VPS e TURN.
- Fase 3/4: pendentes.


### Fase 0 — Prova técnica (1–2 dias)

- extrair `Peer`, PTT/travar e retorno pessoal do app 1.3.33;
- signaling mínimo;
- duas abas trocando áudio;
- `POST /api/rooms`;
- host/guest token;
- medir latência e reconexão.

**Critério:** host ouve convidado e convidado ouve host em duas abas.

### Fase 1 — MVP da sala (4–6 dias)

- criar sala;
- host link + guest link;
- painel do host reutilizando a UI do intercom 1.3.33;
- página do convidado reutilizando a página mobile;
- PTT e travar;
- QR;
- TTL e encerramento;
- nenhum vídeo, chat ou IFB.

### Fase 2 — Publicação no site (2–4 dias)

- pasta pública em `/intercom/`;
- deploy estático a partir de `intercom-rooms/public`;
- signaling em `/intercom/ws` (ou subdomínio);
- API em `/intercom/api/`;
- TURN;
- link no menu e na página de recursos;
- manter `intercom.html` como página de marketing;
- SEO e páginas de ajuda;
- rate limit.

### Fase 3 — Endurecimento (3–5 dias)

- reconexão;
- aprovação;
- mute/expulsar;
- logs;
- métricas;
- testes mobile;
- tratamento de abuso.

### Fase 4 — Escala (futuro)

- Redis para salas;
- múltiplas instâncias de signaling;
- SFU para salas grandes;
- co-host;
- observador;
- gravação opcional.

**Total MVP:** 1–2 semanas.
**Publicação com TURN e hardening:** +1 semana.

---

## 9. Critérios de aceite

- [ ] Criar sala sem login.
- [ ] Host recebe link privado e link da equipe.
- [ ] Convidado entra pelo link sem conta.
- [ ] Host e convidados se ouvem.
- [ ] PTT momentâneo funciona.
- [ ] PTT travado abre/fecha com um clique.
- [ ] Host pode mutar/expulsar.
- [ ] Sala expira.
- [ ] Host token não vaza em logs.
- [ ] Link de convidado sem token não entra.
- [ ] Limite de participantes respeitado.
- [ ] Funciona em LAN e Internet.
- [ ] Funciona no Chrome Android e desktop.
- [ ] Tela ativa/media session no celular.
- [ ] Sem vídeo, sem gravação e sem login no MVP.
- [ ] Rate limit na criação.
- [ ] Nenhum áudio aberto sem PTT.
- [ ] Testes com fone, sem eco.

---

## 10. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Host como hub | Host com rede ruim derruba a sala | teste de rede, TURN, limite de 8 |
| Abuso sem login | Spam de salas | rate limit, TTL, CAPTCHA condicional |
| Link vazado | Estranho entra | token, senha, aprovação, expulsar |
| TURN caro | Custo por minuto | preferir direto; limite; monitorar |
| Android suspende aba | Mic para | Wake Lock/Media Session; app nativo futuro |
| Eco | Todos falam junto | PTT, fone, mix-minus |
| Celular fraco | UI e áudio ruins | página leve, áudio apenas, testes reais |
| Escala | Muitas salas | Redis, múltiplas instâncias, SFU |

---

## 11. Decisões finais

As decisões estão detalhadas em [`DECISOES.md`](DECISOES.md). Resumo:

| Tema | Decisão |
|---|---|
| Nome | **CastDeck Intercom** |
| URL | **https://cast.flue.live/intercom/** |
| Escopo | som de produção ao vivo, áudio-only |
| Login | não |
| Papéis MVP | host e convidado |
| Limite | 1 host + 14 convidados |
| ID | aleatório ou digitado pelo usuário |
| Senha | opcional no MVP |
| TTL | 6 h |
| Aprovação | fora do MVP |
| IFB/vídeo/chat/gravação | fora do MVP |
| TURN | próprio na VPS, credenciais temporárias |
| Deploy | app estático em `/intercom/`, signaling Node em `/intercom/ws` e API em `/intercom/api/` |

### ID personalizado

- O host pode digitar um nome curto.
- Regras: 4–24 caracteres, `a-z`, `0-9` e `-`.
- Se já existir, a criação falha e oferece outro nome; ninguém toma a sala de outro host.
- Em branco, o sistema gera 8 caracteres aleatórios.
- Nomes reservados: `host`, `api`, `ws`, `index`, `new`, `room`.

### Senha opcional

- Campo opcional na criação.
- Hash no servidor; nunca em texto.
- Não vai no link; o convidado digita na entrada.
- Não substitui o token de host/convidado.

## 12. Resumo

O caminho certo é:

1. criar uma **sala efêmera** sem login;
2. dar ao host um **link privado** e à equipe um **link de convidado**;
3. usar **WebRTC estrela no host**, áudio-only;
4. reutilizar a lógica de PTT/travar do intercom 1.3.33;
5. validar tokens no signaling, sem expor segredos;
6. publicar em `cast.flue.live/intercom/`;
7. manter o limite em 8 e TURN pronto;
8. só depois pensar em SFU, co-host e gravação.

O VDO.Ninja prova que o fluxo “criar link e entrar” funciona. O CastDeck Intercom deve pegar essa
simplicidade e reduzir o escopo para **áudio de produção**, que é o que a equipe realmente precisa.
