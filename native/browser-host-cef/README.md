# BrowserHost CEF — spike local (Windows)

Protótipo **fora da release** para validar o caminho CEF OSR no Windows antes de
integrar ao servidor do CastDeck.

## Estado

- CEF **156** via `CefSharp.OffScreen.NETCore`.
- .NET 8 Windows x64, saída em `bin/Release/net8.0-windows/win-x64/`.
- Renderiza URL real em OSR e grava quadros JPEG para inspeção.
- Testado em 1280×720 e 3840×2160.
- **Shared texture/D3D11** implementado em `--shared` (720p chega a ~56 fps; 4K ~28 fps).
- **Ainda não está integrado** ao estúdio nem substitui o Edge headless da 1.4.2.

## Resultados locais (2026-11-07)

| Cenário | Quadros em 5 s | Taxa |
|---|---:|---:|
| 720p, página animada, 30 fps alvo | 139 | ~27,8 fps |
| 4K, página animada, 30 fps alvo | 100 | ~20 fps |
| 720p, página estática | 4 | só repinta quando há dano |
| 720p, **shared texture** | 283 | ~56,6 fps |
| 4K, **shared texture** | 283 | ~55 fps |
| 4K, página estática | 4 | só repinta quando há dano |

O gargalo é o OSR em CPU + cópia/JPEG. O próximo passo para 30/60 fps reais é
**shared texture/GPU (`OnAcceleratedPaint`)**, além de áudio e input.

## Uso

Shared texture/D3D11:

```powershell
.\browser-host-cef.exe --shared http://127.0.0.1:3011/cef-test.html 3840 2160 5 D:\REA\build\tmp\cef-shared 30
```

```powershell
cd native/browser-host-cef
dotnet build -c Release
.\bin\Release\net8.0-windows\win-x64\browser-host-cef.exe `
  http://127.0.0.1:3000/ 1280 720 5 D:\REA\build\tmp\cef-frames 30
```

Gera `frame-00001.jpg`, `frame-00002.jpg`, ... e `cef.log` no diretório de saída.

## Integração local

- `server/cef.js` sobe o helper com `--shared-pipe` e publica no WS `/cef`.
- A fonte Browser escolhe CEF automaticamente no Windows quando o helper existe.
- 720p no cliente: ~50 fps. Helper 4K: ~55 fps. Cliente 4K com ImageDecoder: ~32 fps.
- Áudio, input e inclusão do helper no instalador ainda não.

## Modo pipe (transporte inicial)

```powershell
.\browser-host-cef.exe --pipe http://127.0.0.1:3000/ 1280 720 30
```

Escreve no stdout `[tipo: 1=JPEG][uint32 little-endian tamanho][payload]` por quadro. Teste local: ~16 fps em 720p; ainda não integrado ao Node.

## Limitações

- Windows x64 apenas neste spike.
- Sem áudio da página.
- Sem mouse/teclado.
- Sem integração com `/dsk`/fonte Browser.
- Sem 30 fps estável em 4K no OSR de CPU.

## Próximos passos

1. Trocar JPEG/OSR CPU por shared texture/GPU.
2. Transporte de quadros para o Node (stdin/stdout ou WebSocket) e backend CEF
   opcional na fonte Browser.
3. Áudio CEF e input mouse/teclado.
4. Medir 720p/1080p/4K com a mesa gravando.
