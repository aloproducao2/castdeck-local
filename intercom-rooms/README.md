# CastDeck Intercom — rooms públicos

> **Status:** **publicado** em `https://cast.flue.live/intercom/` (v0.1.0 do app de salas).
> **Objetivo:** intercom de produção ao vivo, áudio-only, com salas sem login.

## O que já funciona

- Criar sala **sem login** em `https://cast.flue.live/intercom/` (ou local).
- Sala com ID **aleatório** ou **digitado**.
- **Senha opcional** com hash no servidor.
- Link do host e link da equipe.
- QR Code da sala.
- Host com PTT geral, PTT individual e **PTT travado**.
- Convidado com PTT, travar e escuta.
- Áudio WebRTC entre host e convidados.
- Host ouve todos; convidado ouve o host.
- Host pode **mutar** e **remover** convidados.
- Host encerra a **sessão ao vivo**, mantendo a sala e os links.
- Limite de **1 host + 14 convidados (15 pessoas no total)**.
- **Salas permanentes**: não expiram e podem ser reutilizadas com os mesmos links.
- Persistência em arquivo JSON protegido no servidor; sobrevive a restart.
- Rate limit de criação e tentativa de entrada.
- Escolha de **microfone** e **saída de áudio** durante a sala.
- PWA instalável (`manifest`, service worker e ícones).
- Android com Wake Lock opcional, Media Session, Audio Session e retomada de áudio.
- Página mobile com Wake Lock e Media Session básica.

## Produção

- URL: **https://cast.flue.live/intercom/**
- App servido pelo processo `castdeck-intercom` na VPS.
- Nginx encaminha `/intercom/` para `127.0.0.1:3210`.
- TURN: `turn.flue.live` com credenciais temporárias.
- Teste feito: host e convidado conectados em produção via Cloudflare.

## Rodar localmente

```powershell
cd D:\REA
npm run intercom
```

Abrir:

```text
http://localhost:3210/intercom/
```

Variáveis:

| Variável | Padrão | Função |
|---|---|---|
| `PORT` | `3210` | porta HTTP |
| `INTERCOM_BASE` | `/intercom` | prefixo público |
| `INTERCOM_DATA` | `intercom-rooms/data/rooms.json` | arquivo persistente das salas |
| `HOST_GRACE_MS` | 5 min | tolerância sem host antes de encerrar a sessão |
| `ICE_STUN` | Cloudflare + Google | STUN |
| `TURN_URL` | vazio | TURN |
| `TURN_USERNAME` | vazio | usuário TURN |
| `TURN_PASSWORD` | vazio | senha TURN |

## Arquitetura

```text
index.html  ── POST /intercom/api/rooms ──► registro permanente (JSON)
host.html   ── WSS /intercom/ws ─────────► signaling + presença
room.html   ── WSS /intercom/ws ─────────► signaling + presença
                   │
                   └── WebRTC áudio P2P host ↔ convidados
```

- Host é o hub.
- O host envia o próprio microfone; o convidado recebe o áudio do diretor.
- O convidado envia o microfone; o host recebe.
- Sem vídeo, sem gravação, sem IFB, sem chat.
- Sem servidor de mídia; signaling apenas troca SDP/ICE.
- A sessão ao vivo existe em memória; a identidade da sala, tokens e senha ficam no arquivo persistente.
- Encerrar a sessão desconecta todos, mas mantém a sala e os links.
- Reiniciar o serviço preserva as salas; as sessões ao vivo caem.

## Android e tela desligada

- O PWA pode ser instalado pelo menu do navegador ou pelo botão **Instalar app**.
- A opção **Manter a tela ligada** fica ligada por padrão; desmarque para permitir que a tela apague.
- Com a tela apagada, o WebRTC pode continuar, mas o Android pode suspender o microfone dependendo do fabricante.
- O app usa Wake Lock, Media Session, `audioSession` quando disponível e um oscilador inaudível para manter o contexto de áudio ativo.
- Teste em celular real: instale o PWA, entre na sala, desligue a tela e confirme com o diretor se o áudio continua.

## Limites do MVP

- O host fala com **todos** ou com **uma pessoa** pelo PTT da linha.
- O host ouve todos os convidados; ainda não há mix de convidados para convidados (partyline).
- A sessão ao vivo cai ao reiniciar o servidor; a sala permanente e os links continuam.
- Sem Redis/SFU.
- Publicado sem conta; o app é um serviço separado do CastDeck local.
- O link do host é a autoridade da sala; não há conta.
- Background no celular é melhor esforço.

## URLs planejadas para produção

```text
https://cast.flue.live/intercom/                 → criar sala
https://cast.flue.live/intercom/host/<sala>      → host
https://cast.flue.live/intercom/<sala>           → convidado
https://cast.flue.live/intercom/api/rooms        → criação
wss://cast.flue.live/intercom/ws                 → signaling
```

A página de marketing `cast.flue.live/intercom.html` continua separada.

## Testes locais

Foram testados:

- criação de sala aleatória e com ID fixo;
- ID duplicado retorna `409`;
- senha errada/ausente é recusada e o convite funciona com a senha correta;
- host e convidado conectam com WebRTC `connected`;
- host tem receiver de áudio do convidado;
- convidado recebe a faixa do host;
- PTT geral do host e PTT individual por convidado;
- PTT do host altera o microfone e o status;
- PTT do convidado chega ao host;
- mute do host fecha o microfone do convidado **sem** mutar a escuta dele;
- troca de microfone em tempo real no host e no convidado;
- troca de saída de áudio em desktop (Android/iOS seguem a saída do sistema);
- PWA registrado e cache do service worker ativo;
- QR e links gerados na tela.

## Próximo passo

Testar com celulares reais em 4G/Wi-Fi, adicionar aprovação/partyline e observar custo do TURN. A publicação em `/intercom/` já foi feita.

## Se o botão de abrir a sala não responder

1. Recarregue a página (ou feche e abra o PWA instalado).
2. Confirme a permissão de microfone no navegador.
3. O app usa módulos versionados; uma aba antiga pode estar com o JavaScript anterior em cache.
4. Em último caso, limpe os dados do site/PWA e abra de novo.
