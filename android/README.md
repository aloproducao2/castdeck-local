# android/ — app Android nativo

Port do CastDeck para celular/tablet: servidor local embutido, sinalização e publicação RTMP.

## Código principal

`app/src/main/java/com/castdeck/studio/`:

| Arquivo | Papel |
|---|---|
| `MainActivity.java` | Tela principal e ciclo de vida. |
| `ServerService.java` / `LocalServer.java` | Servidor local embutido. |
| `SignalingHub.java` / `Net.java` | Sinalização WebRTC e rede. |
| `Broadcast.java` / `RtmpPublisher.java` / `H264.java` | Captura, encode e publicação RTMP. |
| `IngestManager.java`, `MsgHub.java`, `PollHub.java` | Ingest, mensagens e enquetes. |
| `WebmDemuxer.java` | Demux de WebM. |
| `Store.java`, `I18n.java`, `SelfSignedCert.java`, `Updater.java`, `UpdateProvider.java`, `AndroidTunnel.java` | Persistência, i18n, TLS, atualização e túnel. |

## Invariantes

- O app não depende do servidor desktop; ele sobe o próprio servidor.
- Publicação usa RTMP com H.264/AAC.
- Assets da UI vêm de `app/src/main/assets/` (espelho de `public/`).

## Subdiretórios

- [`app/src/main/`](app/src/main/README.md)
- [`app/src/main/java/com/castdeck/studio/`](app/src/main/java/com/castdeck/studio/README.md)
