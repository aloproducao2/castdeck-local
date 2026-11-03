# crates/ — workers Rust

Binários auxiliares compilados à parte e embutidos no executável. Rodam em processo separado; se caírem, a
live continua.

| Crate | Papel |
|---|---|
| `castdeck-caption` | Worker de legenda com whisper.cpp (Whisper local, fallback). |
| `castdeck-parakeet` | Worker de legenda Parakeet-TDT pt-BR (ONNX, alta precisão). |
| `castdeck-sherpa` | Estudo de worker streaming (sherpa-onnx/Kroko); build bloqueado no link MSVC. |

## Contrato comum

- Entrada: PCM `s16le`, mono, 16 kHz via `stdin`.
- Saída: JSON por linha em `stdout` (`ready`, `status`, `partial`, `final`, `error`).
- Argumentos: `--model <arquivo|dir> --lang pt|en|es`.

## Invariantes

- Não bloquear o servidor Node; toda inferência é no worker.
- Modelo ausente → erro claro, nunca travamento silencioso.

## Fontes

- [`castdeck-caption/src/`](castdeck-caption/src/README.md)
- [`castdeck-parakeet/src/`](castdeck-parakeet/src/README.md)
- [`castdeck-sherpa/src/`](castdeck-sherpa/src/README.md)
