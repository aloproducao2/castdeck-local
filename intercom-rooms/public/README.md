# CastDeck Intercom — public

App estático do MVP local.

- `index.html` — criar sala;
- `host.html` — painel do diretor;
- `room.html` — convidado;
- `css/intercom.css` — interface;
- `js/create.js` — criação;
- `js/host.js` — host, PTT, latch e presença;
- `js/guest.js` — convidado, PTT, latch e escuta;
- `js/peer.js` — Peer WebRTC (base do app principal);
- `js/qr.js` — QR próprio do CastDeck;
- `js/devices.js` — microfone, saída de áudio e tela ligada;
- `manifest.webmanifest` — PWA;
- `sw.js` — cache offline do app;
- `icon-180.png`, `icon-192.png`, `icon-512.png` — ícones do PWA.

Servido em `/intercom/` pelo `server/index.js`.
