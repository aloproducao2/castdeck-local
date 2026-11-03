# Licenças de terceiros

Este diretório reúne os textos e avisos dos componentes de terceiros usados/redistribuídos pelo CastDeck.
O código original do CastDeck está em `../LICENSE` (AGPL-3.0-only) e os avisos gerais em `../NOTICE`.

## Índice

| Arquivo | Conteúdo |
|---|---|
| `AGPL-3.0.txt` | Licença do CastDeck (cópia de `../LICENSE`) |
| `GPL-3.0.txt` | GPLv3 (FFmpeg, libsignal) |
| `LGPL-3.0.txt` | LGPLv3 (libvips/sharp, conforme build) |
| `Apache-2.0.txt` | Apache 2.0 (cloudflared, MediaPipe, sharp, etc.) |
| `MIT.txt` | MIT (modelo genérico; textos específicos em `npm-dependencies.txt`) |
| `BSD-3-Clause.txt` | BSD 3-cláusulas (RNNoise, NanoHTTPD/JSch quando aplicável) |
| `ISC.txt` | ISC (dependências npm) |
| `MPL-2.0.txt` | MPL 2.0 (option-ext) |
| `Unlicense.txt` | Unlicense (yt-dlp) |
| `CC-BY-4.0.txt` | Creative Commons Attribution 4.0 (modelo Parakeet pt-BR) |
| `OFL-1.1.txt` | SIL Open Font License 1.1 (Inter) |
| `Zlib.txt` / `0BSD.txt` | Licenças permissivas de crates |
| `Unicode-3.0.txt` | Unicode License v3 (unicode-ident) |
| `BlueOak-1.0.0.txt` | BlueOak 1.0.0 (npm build/dev) |
| `CDLA-Permissive-2.0.txt` | CDLA Permissive 2.0 (webpki roots) |
| `npm-dependencies.txt` | Textos/avisos de todas as dependências npm do lockfile |
| `rust-dependencies.txt` | Textos/avisos dos crates Rust do launcher e dos workers de legenda |
| `components/` | Avisos específicos de binários/modelos (FFmpeg, cloudflared, MediaMTX, yt-dlp, Node, MediaPipe, RNNoise, Whisper, Parakeet, libsignal, sharp/libvips, Inter, Android, BlueOak/CDLA) |
| `../THIRD-PARTY-INVENTORY.csv` | Inventário máquina-legível (ecossistema, nome, versão, licença, relação) |

## Componentes críticos

- **FFmpeg** — binário GPLv3. Fonte/oferta correspondente obrigatória. Ver `components/FFmpeg.txt`.
- **libsignal** — GPLv3 na cadeia do Baileys. O binário que o inclui precisa de análise de conformidade
  GPL/AGPL e não pode ser coberto pela licença comercial como se fosse proprietário. Ver
  `components/libsignal.txt`.
- **sharp/libvips** — Apache-2.0 + LGPLv3. Verificar empacotamento (relink) e avisos. Ver
  `components/sharp-libvips.txt`.
- **Parakeet pt-BR** — CC-BY-4.0: exigir atribuição visível no app/site. Ver `components/Parakeet-model.txt`.
- **Whisper ggml** — MIT; modelos baixados em runtime. Ver `components/Whisper-models.txt`.
- **MediaPipe/RNNoise** — Apache-2.0/BSD-3. Ver componentes.

## Como atualizar

O build/release deve regenerar este diretório a partir de `package-lock.json`, `cargo metadata`, binários
vendorizados e modelos. Não publicar com componente redistribuído sem licença mapeada. O arquivo
`../THIRD-PARTY-NOTICES.md` é o resumo humano; este diretório é a fonte dos textos.

## Aviso

Os textos foram copiados dos pacotes/repositórios oficiais ou de licenças padrão. Em caso de divergência,
prevalece o texto original do componente. Este material não é parecer jurídico.
