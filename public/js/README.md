# public/js/ — scripts das páginas

Scripts das páginas auxiliares e do estúdio (carregados como ES modules).

| Arquivo | Contrato |
|---|---|
| `rtc.js` | WebRTC do convidado/host: sinalização, ICE/TURN, recuperação |
| `media.js` | Captura de microfone/câmera, dispositivos e permissões |
| `i18n.js` | Traduções de UI |
| `updates.js` | Aviso/instalação de atualização |
| `recdir.js` | Escolha do diretório de gravações |
| `cam.js, out.js, guest.js, remote.js, replay.js, projector.js, msg.js, vote.js` | Controladores das páginas correspondentes |

## Invariantes

- Sem framework; cada página importa apenas o que usa.
- Nada de rede externa para o fluxo principal.
