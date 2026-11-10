# build/ — build e publicação

Scripts de empacotamento do CastDeck para Windows, AppImage e Android, além do deploy do site.

| Script | Contrato |
|---|---|
| `build-exe.mjs` | Gera os executáveis (pkg + launcher Rust). Alvo deste PC compila o worker de legenda. |
| `build-caption.mjs` | Compila `crates/castdeck-caption` (Whisper) e `castdeck-parakeet` (ONNX) para embutir. |
| `build-tauri.mjs` | Compila o launcher nativo (ícone, splash, bandeja). |
| `build-appimage.ps1/.sh` | Gera AppImage Linux. |
| `build-android.ps1` | Gera o APK Android. |
| `release.mjs` | Preflight, build de todos os alvos, hashes, empacotamento e deploy. |
| `deploy.mjs` | Envia `landpage/`, `downloads/` e manifests para a VPS. |
| `version.mjs` | Lê/gerencia a versão do `package.json`. |
| `pkg.*.json` | Configuração do pkg por alvo. |
| `pack-source.mjs`, `vendor-web.mjs`, `i18n-extract.mjs`, `make-*.mjs` | Utilitários de pacote, assets, i18n e guias. |

## Invariantes

- Nunca publicar sem `--preflight-only` OK e app fechado (evita EBUSY).
- Sempre fechar o CastDeck e o servidor embutido antes de substituir `dist/CastDeck.exe`.
- Binários externos ficam em `build/vendor/<alvo>/` e são embutidos como assets.

## Subdiretórios

- [`assets/`](assets/README.md) — ícones, licenças e fontes
- [`tutorial/`](tutorial/README.md) — gerador do tutorial
