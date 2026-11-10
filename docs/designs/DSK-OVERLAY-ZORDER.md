# EGM — Seletor de camada sobre o DSK (comentários, enquetes e banners)

> **Status:** **publicado em 1.3.27** (2026-11-03). O GitHub não foi sincronizado porque a conta continua
> retornando 404 para visitantes anônimos.
> **Pedido:** comentários, enquetes e banner devem ter um seletor para escolher se ficam **atrás do DSK**
> (como hoje) ou **na frente do DSK**, por cima da imagem/vídeo das camadas DSK 1/2.
> **Data:** 2026-11-03

---

## 1. Resumo executivo

Hoje o DSK 1/2 é desenhado **por último**, depois de widgets (enquete/QR/placar), comentários das redes,
banner, letreiro e legendas. Isso garante que o DSK fique sempre por cima, mas impede que uma enquete,
um comentário ou um banner apareça sobre um DSK de tela cheia ou sobre uma arte que cubra a área.

O pedido é um **seletor de camada** para esses três sistemas. **Decisão aprovada pelo usuário:**

- **Um único seletor global** para o grupo **comentários + enquetes + banners** — não por item.
- **Comentários:** o mesmo seletor vale para destaque e feed (global).
- **Padrão:** atrás do DSK, preservando o comportamento atual.
- **Acima do DSK:** desenhar os três sistemas **depois** do DSK 1/2 e **antes** de VAR/replay/stinger.
- **Android:** esconder/desabilitar o seletor com explicação, porque o DSK não é renderizado lá.
- **Letreiro e legendas:** continuam atrás do DSK (recomendação mantida; ver §11).

Isso entrega controle sem transformar o operador em engenheiro de composição: **uma chave clara**
(“Overlays acima do DSK”) com prévia ao vivo e persistência no estúdio. Se no futuro for necessário separar
por sistema, o modelo global já deixa o caminho aberto.

---

## 2. Como funciona hoje

### 2.1 Ordem de desenho no compositor

`public/js/studio/compositor.js` desenha o programa nesta ordem aproximada:

```text
cena/câmeras
  → overlays da marca e logo
  → widgets (QR, enquete, placar)
  → comentários das redes (social)
  → banner (lower third)
  → letreiro (ticker)
  → legendas
  → DSK 1 e 2
  → linhas do VAR
  → selo REPLAY
  → stinger
```

O trecho do DSK comenta explicitamente: *“DSK 1 e 2 (downstream keyers): por cima de tudo que a cena
desenha”*. O `dsk.js` desenha as duas camadas por último e restaura `globalAlpha` e
`globalCompositeOperation` ao final.

### 2.2 Onde cada sistema guarda estado

| Sistema | Estado | Persistência |
|---|---|---|
| Banner | `S.banners[]`, `S.activeBanner` | `studioBody()` → servidor |
| Enquete | `S.brand.polls[]`, `comp.wg` (widget no ar) | servidor (`brand`) |
| Comentários | `social-ui.js`, `st` (localStorage `castdeck.social`), `comp.social` | hoje só localStorage |
| DSK | `S.brand.dsk[]`, `comp.dsk` | servidor (`brand.dsk`) |

### 2.3 Consequências atuais

- DSK de tela cheia **cobre** enquete, comentários e banner.
- DSK com arte grande cobre parcialmente; o operador não tem como escolher.
- O banner pode ficar invisível atrás do DSK justamente quando o DSK está no ar.
- O comportamento é correto para quem quer o DSK sempre no topo, mas não permite o contrário.

---

## 3. EGM — seis lentes

| Lente | Pergunta | Direção |
|---|---|---|
| **Operador (UX)** | O seletor é natural e não gera erro? | Opção “Atrás do DSK (padrão)” / “Acima do DSK”; prévia no PGM; badge no item; padrão seguro. |
| **Composição visual** | Como fica a pilha? | DSK 1/2 no meio; selecionados acima; VAR/replay no topo; ordem relativa preservada. |
| **Arquitetura** | Como implementar sem duplicar desenho? | Separar o desenho em `underDsk`, `dsk`, `aboveDsk`; flags no estado; medições separadas. |
| **Persistência/colaboração** | O ajuste sobrevive a reload/outra janela? | Banner/enquete no servidor; comentários no estúdio + localStorage; migração default `false`. |
| **Qualidade** | Como provar que funciona? | Testes de pixel com DSK opaco, vertical, PGM/prévia/retorno do convidado e reload. |
| **Operação/suporte** | O que acontece no Android e em casos ambíguos? | Android sem DSK: esconder/avisar; documentar que letreiro/legendas continuam atrás do DSK. |

---

## 4. Modelo de camadas proposto

```text
┌──────────────────────────────────────────────┐
│ 5. VAR / REPLAY / stinger                    │  sempre no topo
├──────────────────────────────────────────────┤
│ 4. Acima do DSK (global ligado)              │  enquete → comentários → banner
├──────────────────────────────────────────────┤
│ 3. DSK 1 + DSK 2                             │  camadas downstream
├──────────────────────────────────────────────┤
│ 2. Atrás do DSK                              │  widgets, social, banner, ticker, legendas
├──────────────────────────────────────────────┤
│ 1. Cena, câmeras, marca e logo               │
└──────────────────────────────────────────────┘
```

### 4.1 Ordem dentro do grupo “acima do DSK”

Preservar a ordem relativa atual dos três sistemas:

1. **Enquete** (widget)
2. **Comentários** (social)
3. **Banner** (por cima dos dois)

Assim, com o global ligado, o banner continua sendo o topo do grupo, como hoje.
Uma central de camadas com ordem livre fica para uma fase futura.

### 4.2 O que NÃO muda

- Letreiro (ticker) e legendas continuam **atrás do DSK** nesta entrega.
- VAR/replay/stinger continuam no topo absoluto.
- DSK 1 e DSK 2 continuam sendo desenhados juntos; não há seletor “acima do DSK 1 mas atrás do DSK 2”.
- O DSK continua sendo a camada “downstream”; o nome “acima do DSK” significa acima das duas camadas.

---

## 5. UX e controles — **um seletor global**

### 5.1 Onde fica

Um único controle, aplicado aos **três sistemas**:

```text
Overlays na frente do DSK
[ Atrás do DSK (padrão)  ▾ ]
[ Acima do DSK             ]
```

**Local recomendado:** dentro da configuração do DSK, como primeiro campo (“Camadas”), porque é ali que o
operador entende a relação com a arte/vídeo do DSK. Alternativa: uma seção “Camadas” no painel
**GCs & Letreiro**. O importante é existir **um só lugar** de configuração.

- Aplica a **todos** os banners, **todas** as enquetes e ao **destaque + feed** de comentários.
- Não há seletor por banner, por enquete ou por mensagem.
- Banner de convite rápido/co-host (`toggleBanner('cohost:quick', ...)`) usa o mesmo global.
- Os painéis Banners, Widgets & QR e Redes mostram apenas um **selo de status** (“Overlays acima do DSK”)
  quando o global estiver ligado — sem duplicar o controle.

### 5.2 Textos e ajuda

- Opção 1: **Atrás do DSK (padrão)** — o DSK cobre comentários, enquetes e banner.
- Opção 2: **Acima do DSK** — comentários, enquetes e banner aparecem por cima da arte/vídeo do DSK 1/2.
- Tooltip:
  - *Atrás:* mantém o comportamento atual; a arte do DSK fica no topo.
  - *Acima:* os overlays ficam na frente do DSK; use quando a arte cobre a área e você ainda quer ver o banner/enquete.
- A prévia/PGM é a fonte da verdade; a opção só muda a ordem.

### 5.3 Android e estados

- **Android:** esconder o controle (ou mostrar desabilitado) com a explicação “DSK não é renderizado no Android”.
  O valor salvo continua no estúdio e vale quando abrir no desktop.
- **Sem DSK no ar:** o seletor continua disponível; o resultado visual é o mesmo. Mostrar hint “Sem DSK no ar,
  esta opção não muda nada agora.”
- **DSK opaco/tela cheia:** avisar que os overlays acima podem cobrir a arte; não bloquear.
- Ao ligar/desligar, o estado é salvo imediatamente (debounce existente) e reflete em todas as janelas.

### 5.4 O que não muda

- O banner continua com sua posição/estilo; o seletor não altera layout, só a ordem.
- Enquete e comentários continuam com posição/escala atuais.
- Letreiro e legendas continuam atrás do DSK (decisão mantida).

---

## 6. Modelo de dados e persistência

### 6.1 Um único campo

```js
// S.brand.overlayLayers
{ aboveDsk: false }   // false = atrás do DSK (padrão); true = acima do DSK
```

- Não há `aboveDsk` em `banner`, `poll` ou mensagem de comentário.
- O mesmo valor é lido pelo compositor para os três sistemas.
- `normalizeBrand`/`studioBody` devem garantir `S.brand.overlayLayers = { aboveDsk: !!... }` para estúdios antigos.
- O compositor expõe `comp.overlayLayers.aboveDsk` (ou `comp.aboveDsk`) para widgets/social/banner.

### 6.2 Onde persistir

| Dado | Onde | Motivo |
|---|---|---|
| `overlayLayers.aboveDsk` | `S.brand` no servidor | mesmo comportamento em qualquer janela/operador |
| Espelho local | opcional em `localStorage` para resposta imediata | não é fonte de verdade; o servidor manda |

- `studioBody()` já envia `brand`; não é necessário novo endpoint nem migração de dados.
- O Android usa a mesma UI web, mas não desenha DSK (`dsk.js` retorna cedo no Android); esconder o controle.
- O retorno do convidado/prévia copia `banner`, `social` e `comp.wg`; adicionar/assegurar a cópia do campo global.
- Se o operador trocar o valor, salvar o estúdio e refletir no próximo frame; não reiniciar streams.

---

## 7. Arquitetura de renderização

### 7.1 Ponto central

`compositor.js` hoje chama `wg.draw`, `drawSocial`, `drawBanner`, `drawTicker`, `drawCaptions` e só depois
`dsk.draw`. A mudança é dividir o trecho em três fases:

```text
const f = comp.overlayLayers.aboveDsk; // um único valor global

drawUnderDsk()
  → marca/logo
  → se !f: widgets (enquete/QR/placar)
  → se !f: social (comentários)
  → se !f: banner
  → ticker
  → legendas

dsk.draw()          // DSK 1 e 2

drawAboveDsk()
  → se f: widgets (enquete/QR/placar)
  → se f: social (comentários)
  → se f: banner

drawTop()           // VAR, REPLAY, stinger
```

### 7.2 Widgets

- O compositor lê `comp.overlayLayers.aboveDsk`; **não** é preciso mudar `WidgetLayer.show` para guardar
  camada por item.
- `WidgetLayer.draw` ganha um filtro de fase **sem quebrar** o filtro posicional usado no vertical.
  - Sugestão: `draw(c, color, now, { layer: 'under'|'above', only })`.
- O widget é desenhado em uma fase só; não desenhar duas vezes.

### 7.3 Social

- `comp.social.opts.aboveDsk` deixa de ser necessário; o compositor usa o global.
- `drawSocial()` chamado na fase correspondente.
- **Medição:** o banner usa `socialH` para se afastar dos comentários. Separar “medir” de “desenhar” ou
  calcular a altura antes das duas fases para o banner não pular quando os comentários estão acima.

### 7.4 Banner

- `showBanner(b)` não precisa guardar camada; o compositor usa o global.
- O banner entra/sai com a mesma animação, independentemente da camada.
- `_bz` continua sendo calculado no desenho; o compositor usa para reservar espaço na cena.

### 7.5 DSK

- `dsk.draw` continua desenhando DSK 1/2 e restaurando alpha/blend.
- Antes de desenhar o grupo acima, garantir `globalAlpha=1` e `globalCompositeOperation='source-over'`.
- Se o DSK estiver com blend `screen`/`add`, ele ainda termina e o grupo acima usa composição normal.

### 7.6 Prévia, PGM e retorno do convidado

- `Compositor.draw` é usado no PGM, na prévia da mesa e no `fv` do convidado.
- O `fv` copia `banner`, `social`, `_bz`, `_wz`; incluir `overlayLayers.aboveDsk` no estado copiado.
- A ordem precisa ser **idêntica** nos três; teste de pixel em cada um.

### 7.7 Vertical 9:16

- O desenho vertical usa `scoped(true/false)` para widgets de baixo e cima.
- A separação por camada deve respeitar o `scoped` existente; não duplicar o widget de baixo.
- O DSK vertical só aparece se `cfg.vert.on`; o grupo acima continua acima dele.
- Testar 16:9 e 9:16 com DSK de tela cheia e com DSK parcial.

---

## 8. Testes e critérios de aceite

### 8.1 Testes visuais

- [ ] DSK opaco de tela cheia + banner atrás → banner **não aparece**.
- [ ] Mesmo DSK + banner acima → banner **aparece**.
- [ ] Global ligado: enquete atrás/acima com DSK parcial.
- [ ] Global ligado: comentário em destaque atrás/acima.
- [ ] Global ligado: feed de comentários atrás/acima.
- [ ] Global ligado: os três acima ao mesmo tempo, na ordem enquete → comentários → banner.
- [ ] Ligar/desligar DSK com o overlay acima não pisca nem muda de posição.
- [ ] Transição/dissolve não duplica o overlay.

### 8.2 Testes de estado

- [ ] Salvar estúdio, recarregar e reabrir: o valor global é preservado.
- [ ] Outra janela/operador vê o mesmo estado.
- [ ] Estúdio antigo sem `overlayLayers` assume `aboveDsk:false`.
- [ ] Android: seletor escondido/desabilitado e sem erro.
- [ ] Comando remoto de banner/enquete respeita o global.

### 8.3 Testes de layout

- [ ] Banner não pula ao alternar comentários entre atrás/acima.
- [ ] Widgets continuam reservando espaço na cena (não cobrem câmeras) mesmo quando acima.
- [ ] Vertical 9:16 com DSK e overlay acima.
- [ ] PGM, prévia e retorno do convidado iguais.
- [ ] Performance: sem queda mensurável de frame time (canvas 1920×1080).

### 8.4 Critérios de aceite

- [ ] **Um único seletor global** visível no desktop; selo de status nos três painéis.
- [ ] Padrão atrás do DSK preserva o comportamento atual.
- [ ] “Acima do DSK” desenha depois do DSK 1/2 e antes de VAR/replay/stinger.
- [ ] Estado persiste no estúdio e sobrevive a reload.
- [ ] Nenhuma regressão em DSK, vertical, PGM ou Android.

---

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Overlay cobrir a arte do DSK sem intenção | Padrão atrás; aviso/tooltip; badge na lista. |
| Operador achar que o DSK quebrou porque o banner sumiu | Texto “Atrás do DSK” e dica contextual. |
| Banner/comentário pular de posição ao alternar | Medir `socialH`/banner antes das fases; testes de layout. |
| Widget desenhado duas vezes | Filtro de camada explícito; teste de contagem/pixel. |
| Estado só no navegador | Persistir `S.brand.overlayLayers` no servidor; localStorage é só espelho. |
| Android sem DSK | Esconder controle; documentar. |
| Ordem inesperada entre os três acima | Ordem fixa documentada; futura central de camadas. |
| DSK com blend modes | Resetar composição antes da fase acima. |
| Regressão no vertical | Teste 9:16 obrigatório. |

---

## 10. Roadmap proposto

### Fase 0 — Decisão (concluída)
- [x] Um único seletor global para comentários + enquetes + banners.
- [x] Comentários globais (destaque + feed).
- [x] Padrão atrás do DSK.
- [x] Android escondido/desabilitado.
- [x] Letreiro/legendas continuam atrás do DSK (recomendação mantida).

### Fase 1 — Núcleo de renderização
- [ ] Separar `underDsk` / `dsk` / `aboveDsk` no compositor.
- [ ] Ler `S.brand.overlayLayers.aboveDsk` no compositor e aplicar aos três sistemas.
- [ ] Medição de altura/layout antes das fases.
- [ ] Testes de pixel com DSK opaco.

### Fase 2 — UI e persistência
- [ ] Um único seletor global na configuração do DSK (ou seção “Camadas” no GCs & Letreiro).
- [ ] Selo de status nos painéis Banners, Widgets e Redes.
- [ ] Normalização/default no `S.brand` e salvamento.
- [ ] Ajustes mobile, atalhos e acessibilidade.

### Fase 3 — Qualidade
- [ ] Testes PGM/prévia/retorno, vertical, Android e reload.
- [ ] Documentação do usuário e `docs/DOCUMENTACAO.md`.
- [ ] Registro no `ESTADO.md`.

### Fase 4 — Futuro (se necessário)
- [ ] Central de camadas com ordem livre.
- [ ] Override por mensagem de comentário.
- [ ] “Acima do DSK 1 / atrás do DSK 2”.
- [ ] Ticker/legendas também configuráveis.

---

## 11. Decisões e ponto em aberto

**Aprovado pelo usuário em 2026-11-03:**

1. **Um único seletor global** para comentários + enquetes + banners (não por item).
2. **Comentários globais**, aplicados ao destaque e ao feed.
3. **Padrão atrás do DSK.**
4. **Android:** esconder/desabilitar o controle com explicação.

**Mantido por recomendação (não respondido explicitamente):**

- Letreiro e legendas continuam **atrás do DSK**; só comentários, enquetes e banners são afetados pelo global.
- “Acima do DSK” cobre **DSK 1 + DSK 2** juntos; não há controle por camada nesta entrega.
- Ordem fixa no grupo acima: **enquete → comentários → banner**.

Se o usuário quiser mudar o letreiro/legendas ou separar por sistema, é uma extensão da mesma arquitetura.

---

## 12. Veredito EGM

A mudança é **pequena no conceito e média no compositor**: não é um novo overlay, é uma **política de
ordem de desenho** com **um estado global**. O caminho certo é:

- padrão atrás do DSK;
- **um único seletor** “Overlays acima do DSK”;
- separar o desenho em três fases;
- medir layout antes de desenhar;
- testar DSK opaco, vertical, PGM/prévia/retorno e Android.

Feito assim, o operador ganha controle sem perder o comportamento atual e sem transformar a pilha de
camadas em uma fonte de bugs.


---

## 13. Implementação local (2026-11-03)

- `public/js/studio/compositor.js`: `DEFAULT_BRAND.overlayLayers`, `setBrand` normaliza o objeto e o desenho
  foi separado em `underDsk → DSK → aboveDsk` (widgets/enquete → social → banner).
- `public/js/studio/studio.js`: normalização ao carregar, controle único no topo de **GCs & Letreiro** e
  persistência via `setBrand({ overlayLayers: { aboveDsk } })` no `S.brand`.
- `public/css/modules/onair.css`: `.gc-layerbar` responsivo; Android mostra o controle desabilitado com aviso.
- **Testes locais:** `node --check` OK; `npm run test:security` OK; pixel com DSK opaco em 16:9 e 9:16
  (atrás = coberto; acima = visível); API confirma `brand.overlayLayers.aboveDsk=true`; Android desabilita.
- **Publicado em 1.3.27** na VPS; GitHub não sincronizado (conta restrita/404 anônimo).
- Windows 1.3.27: 190.837.760 bytes; SHA-256 `d5e091881a9f42c6611bacabcb776123040737e85ac8df0c8aab94712d84d4d5`.

