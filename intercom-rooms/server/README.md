# CastDeck Intercom — server

Servidor do MVP local.

- `index.js` — HTTP, API de salas, WebSocket e TTL;
- salas em memória;
- tokens de host/convidado;
- senha opcional com scrypt;
- rate limit;
- signaling WebRTC (SDP/ICE).

Rodar:

```powershell
cd D:\REA
npm run intercom
```

Abrir `http://localhost:3210/intercom/`.

Configuração por variáveis em `../README.md`.
