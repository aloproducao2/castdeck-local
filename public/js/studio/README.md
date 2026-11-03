# public/js/studio/ — módulos do estúdio

Núcleo da UI de operação. Cada arquivo é um módulo ES que recebe dependências do `main` do estúdio.

| Módulo | Contrato |
|---|---|
| `compositor.js` | Desenha o programa no canvas, camadas, legendas, DSK, GC, transições. |
| `mixer.js` | Mixer/WebAudio: barramentos, ganhos, mute, `captionBus`, monitor. |
| `scenes.js` / `layout-editor.js` | Cenas e editor de layout. |
| `captions.js` | Liga/desliga legenda, estilos, overlay, sync com `/cc`. |
| `audio-ui.js` / `meters.js` / `denoise-worklet.js` | Painel de áudio, medidores, denoise. |
| `camera-panel.js` / `gfx.js` / `dsk.js` | Câmeras, GFX e DSK. |
| `media.js` | Biblioteca de mídia, miniaturas, importação. |
| `broadcaster.js` / `rtc.js` | Publicação e conexões WebRTC. |
| `outputs.js` / `onair.js` | Saídas e estado no ar. |
| `social.js` / `social-ui.js` / `messages.js` / `news.js` | Interação e feeds. |
| `journal.js` | Histórico/log do estúdio. |
| `qr.js`, `floatwin.js`, `projector.js`, `remote.js`, `autoswitch.js`, `extras.js`, `ingest.js`, `replay-engine.js`, `resize.js` | Recursos auxiliares. |

## Invariantes

- Nunca acoplar áudio à visibilidade do vídeo.
- Módulo opcional não pode travar o estúdio.
- Estado do layout/mixer é salvo em `localStorage`/servidor conforme o módulo.
