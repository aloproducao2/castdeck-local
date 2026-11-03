# crates/castdeck-caption/src/ — worker Whisper

Worker Rust de legenda com whisper.cpp: VAD por energia, parciais e finais.

| Arquivo | Contrato |
|---|---|
| `main.rs` | Lê PCM s16le/16 kHz do stdin e emite JSON no stdout |

## Invariantes

- Processo separado; não bloqueia o servidor.
- Modelo GGML fornecido por --model.
