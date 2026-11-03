# Compilando o CastDeck

Este documento cobre a compilação do **código original**. Componentes de terceiros (FFmpeg, cloudflared,
MediaMTX, yt-dlp) são baixados pelos scripts e mantêm suas próprias licenças.

## Requisitos

- Node.js 20+ (recomendado 22)
- npm
- Rust/cargo (para o launcher desktop)
- Windows: compilador Rust (MSVC) e, opcionalmente, Inno Setup para instalador
- Linux: dependências usuais de build; AppImage usa o script do repositório
- Android: JDK 17+ e Android SDK (variáveis `ANDROID_HOME`/`JAVA_HOME`)

## Instalação de dependências

```bash
npm ci
npm run vendor:web
```

`vendor:web` copia as bibliotecas web vendorizadas. Os binários de FFmpeg/cloudflared/MediaMTX/yt-dlp são
baixados uma vez para `build/vendor/<alvo>` pelos scripts de build; **não são versionados**.

## Windows

```bash
npm run build:exe
```

Saída: `dist/CastDeck.exe` (launcher + servidor embutido). Para o instalador, veja a documentação de
release na pasta `docs/` (o instalador é opcional; o portátil continua disponível).

## Linux

```bash
npm run build:exe -- --targets linux-x64
npm run build:appimage
```

## macOS

```bash
npm run build:exe -- --targets macos-arm64
```

## Android

```bash
npm run build:android
```

## Testes

```bash
npm run test:unit
# testes E2E exigem um estúdio local e navegador/Edge com CDP
npm run test:ui
```

## Estrutura

- `server/` — servidor Express/WebSocket, mídia, replay, signaling.
- `public/` — UI web do estúdio, convidados, controle remoto e replay.
- `src-tauri/` — launcher desktop Rust.
- `android/` — app Android.
- `build/` — scripts de build e assets.
- `docs/` — documentação e designs.

## Licença

AGPL-3.0-only. Veja [LICENSE](LICENSE), [NOTICE](NOTICE), [SOURCE-OFFER.md](SOURCE-OFFER.md) e
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). Uso comercial fechado: [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).
