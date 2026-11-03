# src-tauri/ — launcher desktop

Launcher nativo em Rust/Tauri que abre o exe do CastDeck sem console, com ícone, splash e bandeja.

| Arquivo | Papel |
|---|---|
| `Cargo.toml` / `Cargo.lock` | Dependências do launcher. |
| `build.rs` | Build script (ícones/recursos). |
| `tauri.conf.json` | Identidade, janela, bundling. |
| `icon_32.rgba` | Ícone usado pelo launcher. |

## Invariantes

- O launcher não contém a lógica do estúdio; ele apenas inicia o servidor embutido.
- Sem console visível; sair pela bandeja.

## Fontes

- [`src/`](src/README.md) — código do launcher
