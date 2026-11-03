# server/ — servidor local do CastDeck

Servidor Node.js/Express do estúdio. Serve a UI, expõe a API local, comanda FFmpeg/MediaMTX, distribui a
legenda e faz a sinalização WebRTC. Roda embutido no executável (pkg) e também no app Android.

## Arquivos

| Arquivo | Contrato |
|---|---|
| `index.js` | Entrada. Rotas HTTP + WS, sobe deps, estúdios, túnel e encerra limpo (`/api/quit`). |
| `broadcast.js` | Pipeline FFmpeg → RTMP/SRT, gravação local em H.264/AAC, recuperação. |
| `caption.js` | Legenda: worker Whisper/Parakeet, download de modelos, partial/final, `/cc`. |
| `signaling.js` | Sinalização WebRTC (ofertas, ICE, convidados) e estado das conexões. |
| `rtc`/`net.js` | Rede local, IPs, ICE/TURN. |
| `ingest.js` | Ingest SRT/RTMP via MediaMTX (convidados externos). |
| `deps.js` / `binaries.js` | Instala/atualiza FFmpeg, cloudflared, MediaMTX, yt-dlp e workers embutidos. |
| `store.js` | Persistência JSON (estúdios, config, credenciais). |
| `recordings.js` / `replay.js` | Biblioteca de gravações e replay. |
| `messages.js`, `polls.js`, `dsk.js`, `feeds.js` | Módulos de interação (mensagens, enquetes, DSK, feeds). |
| `whatsapp.js`, `social-scraper.js`, `ytdlp.js` | Integrações externas. |
| `tunnel.js` | Link público via cloudflared. |
| `updater.js` | Atualização local do app. |

## Invariantes

- Nunca derrubar a live por falha de módulo opcional (legenda, túnel, integrações caem sozinhos).
- Bind apenas em localhost/LAN; nada de dados de mídia para terceiros.
- Segredos ficam em `data/`, nunca no repositório.
