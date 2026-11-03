# build/ — empacotamento

Scripts de build do CastDeck para Windows, Linux/AppImage e Android.

| Script | Contrato |
|---|---|
| `build-exe.mjs` | Gera os executáveis (pkg + launcher Rust). O alvo deste PC compila o worker de legenda. |
| `build-caption.mjs` | Compila `crates/castdeck-caption` (Whisper) e `castdeck-parakeet` (ONNX) para embutir. |
| `build-tauri.mjs` | Compila o launcher nativo (ícone, splash, bandeja). |
| `build-appimage.ps1/.sh` | Gera AppImage Linux. |
| `build-android.ps1` | Gera o APK Android. |
| `version.mjs` | Lê/gerencia a versão do `package.json`. |
| `pkg.*.json` | Configuração do pkg por alvo. |
| `vendor-web.mjs`, `make-assets.ps1` | Utilitários de vendor e assets. |

## Invariantes

- Feche o CastDeck e o servidor embutido antes de substituir `dist/CastDeck.exe`.
- Binários externos ficam em `build/vendor/<alvo>/` e são embutidos como assets; não são versionados.
- Nunca publique um build sem conferir versão, hash e licenças de terceiros.

## Subdiretórios

- [`assets/`](assets/README.md) — ícones, licenças e fontes
