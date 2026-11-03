# Avisos de terceiros — CastDeck

Copyright © 2026 Miguel Kallemback / flue.live.

O CastDeck redistribui e/ou utiliza componentes de terceiros. Cada componente permanece sob sua própria
licença; a **AGPL-3.0 do CastDeck não altera** essas licenças e a **licença comercial do CastDeck não
relicencia** componentes de terceiros.

Esta é a visão humana. Os textos completos estão em:

- [`licenses/`](licenses/) — licenças e avisos por componente;
- [`licenses/npm-dependencies.txt`](licenses/npm-dependencies.txt) — todas as dependências npm do lockfile;
- [`licenses/rust-dependencies.txt`](licenses/rust-dependencies.txt) — crates Rust do launcher;
- [`THIRD-PARTY-INVENTORY.csv`](THIRD-PARTY-INVENTORY.csv) — inventário máquina-legível (nome, versão,
  licença, relação, redistribuição).

> O build/release deve regenerar esses arquivos e **falhar** se um componente redistribuído não tiver
> licença mapeada. Não publicar com pendências.

**Inventário atual:** 665 entradas — 338 npm (187 de produção), 312 crates Rust (launcher + workers de
legenda), 4 Android, 5 binários, 4 modelos e 2 ativos de marca/fonte. As licenças predominantes são MIT,
Apache-2.0, BSD, ISC, MPL e Zlib; os casos de copyleft estão destacados abaixo.

## Resumo por categoria

| Categoria | Exemplos | Licenças | Ação |
|---|---|---|---|
| **Binários embutidos** | FFmpeg, cloudflared, MediaMTX, yt-dlp, Node.js | GPLv3, Apache-2.0, MIT, Unlicense, MIT | Licença + fonte/oferta; ver abaixo |
| **npm (runtime)** | Express, ws, pino, Baileys, libsignal, sharp/libvips | MIT, Apache-2.0, LGPL-3.0, GPL-3.0 | Textos em `licenses/npm-dependencies.txt`; atenção a libsignal/LGPL |
| **Rust (launcher)** | tray-icon, muda, windows-sys, serde, open | MIT/Apache-2.0/MPL-2.0/Zlib/Unicode-3.0 | Textos em `licenses/rust-dependencies.txt` |
| **Android** | NanoHTTPD WebSocket, JSch; JUnit/JSON (teste) | BSD-3-Clause / EPL-1.0 / Public Domain | Avisos no app/instalador |
| **Web vendor** | MediaPipe Tasks Vision + modelos, RNNoise WASM | Apache-2.0/BSD-3 | `licenses/components/` |
| **Modelos de fala** | Whisper ggml, Parakeet pt-BR | MIT / CC-BY-4.0 | Atribuição; ver componentes |
| **Fontes** | Inter | SIL OFL 1.1 | `licenses/OFL-1.1.txt` |
| **Marca/conteúdo** | CastDeck, logo, splash | Direitos reservados, fora da AGPL | `TRADEMARK.md` |

## Componentes críticos e obrigações

### FFmpeg — GPLv3

- Binário redistribuído (gyan.dev “essentials” no Windows; `ffmpeg-static` nos demais).
- Obrigatório: licença GPLv3, avisos de copyright e **fonte correspondente** do FFmpeg + configuração de
  build (ou oferta escrita válida).
- Fonte oficial: <https://ffmpeg.org/>. Build/fonte correspondente deve ser publicada em
  `https://cast.flue.live/downloads/source/`.
- A licença comercial do CastDeck **não** cobre o FFmpeg.
- Detalhe: [`licenses/components/FFmpeg.txt`](licenses/components/FFmpeg.txt).

### libsignal — GPLv3 (cadeia do Baileys)

- `libsignal` está na árvore de produção do Baileys e é **GPL-3.0**.
- Consequência: o binário que inclui libsignal precisa de análise GPL/AGPL e oferecimento de fonte; não pode
  ser tratado como “código fechado” pela licença comercial.
- Ação recomendada antes de vender licença comercial para o binário completo: revisar com advogado,
  isolar o WhatsApp em componente separado/opcional ou remover a dependência.
- Detalhe: [`licenses/components/libsignal.txt`](licenses/components/libsignal.txt).

### sharp / libvips — Apache-2.0 + LGPL-3.0

- `sharp` é Apache-2.0; `libvips` é LGPL-3.0-or-later.
- LGPL exige possibilidade de relink/uso da biblioteca e avisos; verificar como o pkg empacota o binário
  nativo. A licença comercial não cobre esses componentes.
- Detalhe: [`licenses/components/sharp-libvips.txt`](licenses/components/sharp-libvips.txt).

### Modelos de fala

| Modelo | Licença | Obrigação |
|---|---|---|
| Whisper ggml (`ggerganov/whisper.cpp`) | MIT | Incluir copyright/licença; baixado em runtime |
| Parakeet pt-BR ONNX (`calneymgp/...`) | **CC-BY-4.0** | **Atribuição visível** ao autor/modelo e link; permitido uso comercial com atribuição |

Detalhes em [`licenses/components/Whisper-models.txt`](licenses/components/Whisper-models.txt) e
[`licenses/components/Parakeet-model.txt`](licenses/components/Parakeet-model.txt).

### MediaPipe / RNNoise

- MediaPipe Tasks Vision e modelos `.tflite`: Apache-2.0 (Google).
- RNNoise/@jitsi/rnnoise-wasm: BSD-3-Clause/Apache-2.0 (Xiph.Org/Jean-Marc Valin).
- Textos em `licenses/components/`.

### Node.js

- MIT; o launcher embute o runtime via pkg. Incluir licença do Node e avisos das dependências.
- Texto: [`licenses/Node-MIT.txt`](licenses/Node-MIT.txt).

## O que o instalador/app devem exibir

- Licença AGPL do CastDeck + link para o fonte.
- `THIRD-PARTY-NOTICES.md` e `licenses/` acessíveis offline.
- Atribuição do Parakeet (CC-BY-4.0) visível na tela de legendas/Sobre.
- Link para a fonte do FFmpeg e oferta de fonte.
- Aviso de que a licença comercial não cobre terceiros nem marcas.

## Arquivos de licença (índice)

- `licenses/AGPL-3.0.txt`, `GPL-3.0.txt`, `LGPL-3.0.txt`
- `licenses/Apache-2.0.txt`, `MIT.txt`, `BSD-3-Clause.txt`, `ISC.txt`, `MPL-2.0.txt`
- `licenses/Unlicense.txt`, `CC-BY-4.0.txt`, `OFL-1.1.txt`, `Zlib.txt`, `0BSD.txt`, `Unicode-3.0.txt`
- `licenses/BlueOak-1.0.0.txt`, `CDLA-Permissive-2.0.txt`
- `licenses/npm-dependencies.txt`, `licenses/rust-dependencies.txt`
- `licenses/components/` (FFmpeg, cloudflared, MediaMTX, yt-dlp, Node, MediaPipe, RNNoise, Whisper,
  Parakeet, libsignal, sharp/libvips, Inter, web vendor)

## Contato

Correções de atribuição ou licença: **https://cast.flue.live**.
