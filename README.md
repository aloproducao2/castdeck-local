<div align="center">

<img src="https://cast.flue.live/assets/img/icon.png" width="92" alt="CastDeck Local">

# CastDeck Local

**Your live studio on your own computer — with the video call at the center.**

A StreamYard alternative for creators who want browser-based guests, professional scenes, local recording
and multistream without a cloud subscription.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-7c5cff)](LICENSE)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%C2%B7%20Linux%20%C2%B7%20macOS%20%C2%B7%20Android-6f42c1)](#downloads)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933)](package.json)
[![CI](https://github.com/aloproducao2/castdeck-local/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/aloproducao2/castdeck-local/actions/workflows/ci.yml)
[![PRs](https://img.shields.io/badge/PRs-welcome-22c55e)](CONTRIBUTING.md)

[**Download**](https://cast.flue.live/downloads.html) ·
[**StreamYard alternative**](docs/streamyard-alternative.en.md) ·
[**Documentation**](docs/DOCUMENTACAO.md) ·
[**Português**](README.pt.md) · [**Support the project**](https://apoia.se/casdecklocal) · [**Español**](README.es.md)

<a href="https://www.producthunt.com/products/castdeck-local?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-castdeck-local" target="_blank" rel="noopener noreferrer"><img alt="CastDeck Local - Your free, open-source alternative to StreamYard | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1301120&amp;theme=light&amp;t=1793684308962"></a>

</div>

![CastDeck Local — studio with guests and switcher](https://cast.flue.live/assets/img/estudio-grade.png)

## Why CastDeck

CastDeck starts from a simple idea: **the video call is the heart of a live show**, but the studio does not
need to live in the cloud. Open CastDeck on your PC, invite people with a link, and run everything —
cameras, audio, scenes, graphics, replay and streaming — from one place.

| | Cloud studios | **CastDeck Local** |
|---|---|---|
| Where video is composited | vendor servers | **your computer** |
| Guests | vendor account/app | **browser, nothing to install** |
| Recording | plan-dependent | **local MP4** |
| Outputs | vendor platforms | **RTMP/RTMPS/SRT anywhere** |
| Vertical 9:16 | add-on/plan | **simultaneous and independent** |
| Cost | subscription | **free and open (AGPL-3.0)** |
| Source code | closed | **auditable and modifiable** |

> StreamYard is a trademark of its respective owners. This is an independent comparison, not affiliated.

## Video call first

- **Invite by link.** Guests join from Chrome/Edge on phone or desktop — no account, no install.
- **Real mix-minus.** Each person hears the program without hearing their own voice, so conversation flows.
- **Guests see the program.** They follow the live scene, not just their own camera.
- **Host + guests on stage**, with layouts from 1 to 4+ and one-click switching.
- **Screen, tab and media sharing** for interviews, classes, podcasts and coverage.
- **Vertical 9:16 mode** with its own layout and separate recording for TikTok/Reels/Shorts.

## Live in one minute

1. **Download and open** CastDeck (Windows, Linux, macOS or Android).
2. Create a studio and click **Invite** — copy the link and send it.
3. Add your destinations (YouTube, Twitch, Facebook, RTMP/SRT) and click **Go live**.

No login, no credit card, no monthly fee. FFmpeg and cloudflared are bundled in the executable.

## Features that matter

| 🎥 **Production** | 🎙️ **Audio** | 📺 **Delivery** |
|---|---|---|
| Scenes, layouts and transitions | Mixer with faders and dBFS meters | Multistream RTMP/RTMPS/SRT |
| Independent preview and PGM | Mix-minus and noise reduction | Unlimited local MP4 recording |
| News-style lower thirds and banners | Buses A–G and monitoring | 16:9 and 9:16 at the same time |
| Replay & VAR with IN/OUT | Music, media and jingles | Replay, stinger and slow motion |
| Overlays and image gallery | Talkback and guests | Phone remote control |
| Live captions (Whisper/Parakeet) | System and guest audio | Android as camera/remote |

## Honest comparison

**StreamYard** is a great choice when you want a fully managed cloud room, zero installation and vendor
support. **CastDeck** is for a different trade-off:

| Question | StreamYard (SaaS) | CastDeck Local |
|---|---|---|
| I want to process and record on my PC | no | **yes** |
| I want guests without an account/app | yes | **yes** |
| I want multistream without plan limits | plan | **yes** |
| I want open, auditable source | no | **yes** |
| I want official 24/7 support | yes | **community** |
| I want to use it without installing anything | yes | **local app (or Android)** |

**Choose CastDeck if** privacy, predictable cost, local recording, simultaneous vertical output and code
ownership matter. **Choose StreamYard if** you need a fully managed operation, contracted support and do
not want to manage a computer.

Read the full breakdown: [**CastDeck as a StreamYard alternative**](docs/streamyard-alternative.en.md)
(also in [Português](docs/streamyard-alternative.pt-BR.md) and [Español](docs/streamyard-alternative.es.md)).

## Downloads

| System | How to get it |
|---|---|
| **Windows 10/11 x64** | [cast.flue.live/downloads.html](https://cast.flue.live/downloads.html) |
| **Android 8+** | Official APK on the site |
| **Linux x64/arm64** | binary/AppImage on the site |
| **macOS Intel/Apple Silicon** | binary on the site |

> macOS is unsigned: on first launch use **right-click → Open**.
> Requirements: Windows 10/11, Linux or macOS; Chrome/Edge for the UI; 8 GB RAM recommended.

## How it works

```text
Host browser ──HTTP/WS──► Local server (Node) ──► FFmpeg ──► YouTube/Twitch/RTMP
      │                            │
      │ WebRTC                     ├─ guests (browser, mix-minus)
      ▼                            ├─ MediaMTX (RTMP/SRT from drones/cameras)
 Canvas/Compositor ◄── scenes, graphics, overlays, replay
```

- **Local server** Express/WebSocket on `127.0.0.1`/LAN.
- **WebRTC** for guests, with optional TURN for difficult NAT.
- **FFmpeg** for compositing/recording/RTMP; **MediaMTX** for ingest.
- **Framework-free web UI**, served by the app itself.

## Privacy and security

Studio video and audio stay on your device. The app contacts the website only to check for updates; it does
not send your live content to CastDeck. Read [`SECURITY.md`](SECURITY.md) and [`PRIVACY.md`](PRIVACY.md).
For vulnerabilities, use the private channel — do not open a public exploit issue.

## Support the project

CastDeck is free and independent. If it helps your live production, you can support the project on
[Apoia.se](https://apoia.se/casdecklocal) — it helps cover servers, devices and development time.

## License and community

CastDeck is **free software under AGPL-3.0-only**, with an optional **commercial license** for embedding the
code in closed products. Third-party components keep their own licenses; see
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) and [`licenses/`](licenses/).

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — CLA and contribution rules
- [`CLA.md`](CLA.md) — contributor agreement
- [`TRADEMARK.md`](TRADEMARK.md) — brand usage
- [`SOURCE-OFFER.md`](SOURCE-OFFER.md) — corresponding source
- [`COMMERCIAL-LICENSE.md`](COMMERCIAL-LICENSE.md) — commercial license

## Status

Version **1.3.32** — Remote camera with centered QR, 1080p/720p and high bitrate, plus autoplay and a one-video-at-a-time policy. See the
[releases](https://github.com/aloproducao2/castdeck-local/releases).

Built by **Miguel Kallemback / flue.live**, from Brazil to the world. 🌎
