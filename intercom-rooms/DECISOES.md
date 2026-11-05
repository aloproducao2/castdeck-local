# Decisões finais — CastDeck Intercom

> **Status:** decisões fechadas; MVP **publicado** em `cast.flue.live/intercom/`.
> **Produto:** **CastDeck Intercom**.
> **URL:** **https://cast.flue.live/intercom/**

## Identidade

| Item | Decisão |
|---|---|
| Nome | **CastDeck Intercom** |
| Página de marketing | `cast.flue.live/intercom.html` (existente, separada) |
| App público | `cast.flue.live/intercom/` |
| Papel | Intercom de produção ao vivo |
| Áudio | Sim, áudio-only |
| Vídeo/chat/tela/gravação | Não |
| IFB de programa | Não (não há mesa de programa no app) |
| Login | Não |

## Sala

| Item | Decisão |
|---|---|
| ID padrão | Aleatório, 8 caracteres base32 |
| ID personalizado | Permitido, 4–24 caracteres `a-z 0-9 -` |
| Colisão | Sala existente não é tomada; retorna conflito e sugere outro nome |
| Senha | Opcional no MVP; hash no servidor, nunca em texto |
| TTL | **6 h** (opção 1), com encerramento imediato quando o último participante sair |
| Sala vazia | Destruída após 5 min |
| Host ausente | Sala encerra após 5 min sem host |
| Limite | 1 host + 14 convidados (15 no total) |
| Aprovação manual | Fora do MVP; entra na fase 3 |
| Co-host/observador | Fora do MVP |
| Persistência | Em memória no MVP; Redis só na escala |

## Links e tokens

| Item | Decisão |
|---|---|
| Criar sala | `POST /intercom/api/rooms`, sem login |
| Link do host | `/intercom/host/<sala>#k=<hostToken>` |
| Link do convidado | `/intercom/<sala>#t=<guestToken>` |
| Token no servidor | Validado no `join` do WSS |
| Token em log | Não; usar fragmento e não registrar |
| Senha | Separada do token; solicitada na entrada |
| Lista pública de salas | Não |

## Rede e deploy

| Item | Decisão |
|---|---|
| Signaling | Node/WebSocket em `/intercom/ws` |
| API | `/intercom/api/` |
| TURN | Próprio na VPS, com credenciais temporárias |
| STUN | Público + fallback |
| TLS | Obrigatório |
| Limite de criação | Rate limit por IP |
| CAPTCHA | Só se houver abuso |
| Hospedagem | mesma VPS do site, processo Node separado |

## Reuso do app principal

Extrair da 1.3.33:

- `Peer` de `public/js/rtc.js`;
- retorno/mix-minus do `mixer.js`;
- PTT e travamento de `intercom.js`/`cam.js`;
- Wake Lock/Media Session;
- padrão visual do painel do host;
- QR e links.

Criar módulos próprios em `intercom-rooms/public/js/`; não importar o `studio.js` inteiro.

## Fora do escopo

Vídeo, chat, tela compartilhada, OBS, multistream, gravação, IFB, contas, workspaces, co-host,
observador e SFU no MVP.

## Próximo passo

Implementar a Fase 0:

1. API de criação de sala;
2. tokens de host/convidado;
3. signaling mínimo;
4. áudio bidirecional entre duas abas;
5. teste de latência e reconexão.
