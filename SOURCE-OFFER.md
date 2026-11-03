# Código-fonte correspondente (AGPL-3.0)

O CastDeck é software livre sob **GNU Affero General Public License v3.0 only** (`AGPL-3.0-only`).
Quem recebe um binário tem direito ao **código-fonte correspondente** àquela versão.

## Onde obter

- Repositório: **https://github.com/aloproducao2/castdeck-local**
- Página oficial: **https://cast.flue.live/downloads/source/**
- Versão desta árvore: `1.3.27`
- Pacote de fonte: `castdeck-1.3.27-source.zip` (gerado a partir do mesmo commit/tag)

Cada pacote inclui, no mínimo:

- código do servidor, interface web, launcher desktop e app Android;
- scripts de build necessários para gerar os binários correspondentes;
- `LICENSE`, `NOTICE`, `COMMERCIAL-LICENSE.md`, `CONTRIBUTING.md`, `TRADEMARK.md`;
- `THIRD-PARTY-NOTICES.md` e a pasta `licenses/` dos componentes redistribuídos;
- instruções de build no `README.md`/`BUILDING.md`;
- versão, commit/tag e SHA-256 do pacote publicado.

## Oferta por escrito

Enquanto a página oficial não estiver no ar, esta é a oferta por escrito, válida por **três anos** a partir
da data da distribuição do binário:

> Miguel Kallemback / flue.live oferece, pelo mesmo preço do download (gratuito), o código-fonte
> correspondente à versão distribuída do CastDeck. A fonte pode ser obtida em
> https://cast.flue.live/downloads/source/ ou solicitada pelo contato do site.

Versão desta árvore: `1.3.27`. O SHA-256 do pacote publicado e a data são registrados no release e na
página de fonte no momento da publicação.

## Componentes de terceiros

O pacote de fonte do CastDeck cobre o **código original** e os scripts de build. Componentes redistribuídos
mantêm suas próprias licenças e fontes:

- **FFmpeg** (GPLv3, conforme a build usada): fonte correspondente e configuração de build devem ser
  disponibilizadas junto ou por oferta específica;
- **libsignal** (GPLv3, via Baileys): fonte correspondente/análise GPL; a licença comercial não cobre;
- **sharp/libvips** (Apache-2.0/LGPLv3): avisos e possibilidade de relink/uso da biblioteca;
- **cloudflared** (Apache-2.0): fonte no projeto oficial;
- **MediaMTX** (MIT): fonte no projeto oficial;
- **yt-dlp** (Unlicense): fonte no projeto oficial;
- **MediaPipe/RNNoise** (Apache-2.0/BSD-3): fonte nos projetos oficiais;
- **Whisper ggml** (MIT) e **Parakeet pt-BR** (CC-BY-4.0): modelos e atribuição em `licenses/components/`;
- **Node.js** (MIT) e dependências npm/Rust: avisos em `THIRD-PARTY-NOTICES.md` e `licenses/`.

A AGPL do CastDeck não relicencia esses componentes.

## Modificações

Se o binário distribuído contiver patches locais, o código-fonte publicado deve incluir esses patches e os
scripts para reproduzir o binário. Não remova avisos de copyright.

## Contato

Dúvidas sobre fonte, licença comercial ou marca: **https://cast.flue.live**.
