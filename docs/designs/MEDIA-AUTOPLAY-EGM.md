# EGM — Auto play de vídeos (PGM/palco)

> **Status:** implementado e publicado na **1.3.31**.

## Objetivo

Ter um controle na tela principal para decidir se vídeos começam automaticamente quando:

- entram no **PGM** pela prévia (modo Mesa de corte);
- entram no **palco** (modo Estúdio).

E impedir que dois vídeos toquem ao mesmo tempo.

## Comportamento

### Botão `Auto play` no topo

- **ON** (padrão): vídeo entra tocando ao ir para o PGM/palco.
- **OFF**: entrar no PGM/palco não inicia o vídeo; o operador usa **Tocar**.
- O estado fica salvo no `brand` do estúdio.
- O botão mostra `ON`/`OFF` e um ponto verde/cinza; em telas estreitas vira ícone compacto.

### Mesa de corte

- `preview → PGM` com mídia: `applyAir` inicia o vídeo se o auto play estiver ligado.
- Sem take, a Cena é o PGM; colocar mídia no palco inicia se ligado.
- Trocas de câmera não iniciam vídeo por acidente.

### Modo Estúdio

- Colocar um vídeo no palco inicia se o auto play estiver ligado.
- Vídeo retirado do palco pausa e pode ser retomado depois.
- Vídeo já em reprodução não reinicia ao reorganizar o palco.

### Um vídeo por vez

Sempre que um vídeo começa por:

- `playMedia` (Tocar, playlist, controle remoto);
- `setStage` (palco);
- `applyAir` (PGM);
- DSK de vídeo;
- ação manual de reproduzir;

os outros **vídeos** são pausados. Áudio-only (`camOff`) não é tratado como vídeo e pode
continuar como cama sonora.

## Critérios de teste

- [x] Botão ON/OFF alterna, salva no estúdio e persiste.
- [x] Modo Estúdio: palco A + B com auto play → só B toca.
- [x] Auto play OFF: colocar no palco não toca.
- [x] Mesa: `preview → PGM` com OFF não toca; com ON toca.
- [x] Publicado na 1.3.31.
- [x] Um vídeo por vez em `setStage`.
- [x] Sem erros de runtime no teste headless.
