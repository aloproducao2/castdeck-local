# android/.../studio/ — código Java

Servidor local, sinalização, captura e publicação RTMP do app Android.

| Arquivo | Contrato |
|---|---|
| `MainActivity.java` | Tela principal |
| `ServerService.java, LocalServer.java` | Servidor embutido |
| `SignalingHub.java, Net.java` | WebRTC/rede |
| `Broadcast.java, RtmpPublisher.java, H264.java` | Captura/encode/RTMP |
| `Store.java, I18n.java, Updater.java, SelfSignedCert.java` | Persistência, i18n, update, TLS |

## Invariantes

- App sobe o próprio servidor; não depende do desktop.
