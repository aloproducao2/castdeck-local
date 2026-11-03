# crates/castdeck-parakeet/src/ — worker Parakeet

Worker Rust de legenda Parakeet-TDT ONNX (alta precisão pt-BR).

| Arquivo | Contrato |
|---|---|
| `main.rs` | PCM via stdin → ONNX Runtime → partial/final JSON |

## Invariantes

- onnxruntime.dll carregada dinamicamente ao lado do exe.
- Modelo ONNX em diretório fornecido por --model.
