# castdeck-ndi-bridge

Ponte NDI em **Rust** do CastDeck. O lado NDI do app é este binário; o servidor e a UI
não carregam a SDK nativa.

O SDK do NDI **não é distribuído neste repositório**. O binário carrega o runtime
(`Processing.NDI.Lib.x64.dll`) em tempo de execução, sem linkar a SDK no Cargo.

## Estado atual

- `version` / `list`: descoberta de fontes NDI.
- `receive`: recebe uma fonte NDI e reporta resolução/contagem de vídeo e áudio.
- `send-test`: publica um padrão BGRA 1280×720 a 30 fps com áudio estéreo.
- `extract`: fonte NDI → `META` + registros `V`/`A` (UYVY/BGRA + f32le) por stdout;
  usado pelo servidor para criar a entrada MediaMTX/WHEP.
- `send-raw`: recebe registros `V`/`A` por stdin e publica NDI com
  `NDIlib_send_send_video_async_v2`; usado pela saída NDI do programa.
- Buffers pré-alocados/double buffering no envio; áudio FLTP planar.
- Integrado ao app local 1.4.0 (aba **Sinais → NDI**), ainda **não publicado**.

## Build (Windows)

Requisitos: Rust 1.80+ e NDI Runtime 6.3+.

```powershell
cargo build --release --manifest-path native/ndi-bridge/Cargo.toml
```

O `target/` e as DLLs do runtime são ignorados pelo git.

Para testar, instale o NDI Runtime (ou copie `Processing.NDI.Lib.x64.dll` para a pasta
do executável):

```powershell
$exe = "native/ndi-bridge/target/release/castdeck-ndi.exe"
& $exe version
& $exe list
& $exe send-test "CastDeck Teste" 20
& $exe receive "MKNITROV15 (CastDeck Teste)" 5
```

O nome NDI exibido pelo `list` inclui o prefixo da máquina; use-o no `receive`.

## Licença e marca

NDI® é uma marca registrada da Vizrt NDI AB. O SDK/runtime seguem a licença do
NDI; revise a seção de licença do plano antes de empacotar na release.
