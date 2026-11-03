# test/ — testes e2e e utilitários

Scripts Node/Playwright-like para validar estúdio, WebRTC, legenda, layout, gravações e Android.

| Grupo | Exemplos |
|---|---|
| Estúdio/layout | `deck-e2e.mjs`, `layout-e2e.mjs`, `drag-e2e.mjs`, `float-e2e.mjs` |
| Legenda | `caption-e2e.mjs`, `caption-ui-e2e.mjs`, `caption-worker.test.mjs`, `caption-bench.mjs` |
| WebRTC/convidados | `guest-quality-e2e.mjs`, `cohost-e2e.mjs`, `bitrate-audience-test.mjs` |
| Mídia/ingest | `ingest-e2e.mjs`, `audio-popout-e2e.mjs`, `autovoz-e2e.mjs` |
| Android | `android-e2e.mjs`, `android-assets.test.mjs` |
| Utilidades | `dbg.mjs`, `fmt-probe.mjs`, `layout-audit.mjs`, `inspect-*.mjs`, `*.shot.mjs` |

## Invariantes

- Testes não podem depender da VPS; rodam contra o servidor local.
- Scripts e2e sobem um servidor isolado (`CASTDECK_DATA` temporário) quando aplicável.
