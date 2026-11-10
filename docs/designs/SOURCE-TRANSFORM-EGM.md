# EGM — Enquadramento de fontes e DSK (decisão)

Status: decisão arquitetural local, 2026-11-06.  
Escopo: fontes de cena (câmera, tela, mídia, imagem, ingest) e camadas DSK 1/2.

## Problema

1. O ajuste de fonte aceita zoom só de **100% a 300%**; não há como diminuir a fonte e reposicioná-la.
2. O DSK tem posição e corte, mas não tem **zoom/pan de camada**.
3. O DSK de página web é capturado no tamanho exato da área (`rect × programa`). Ao mudar a área, o
   viewport da página muda e o site reflui ou reposiciona elementos. Isso torna posição/zoom/corte
   imprevisíveis e pode “quebrar” um overlay que já estava aprovado.
4. DSK não é uma fonte do palco: aplicar o `sourceAdjust` da fonte diretamente no keyer mexeria em
   transição, key e ordem de camadas. A camada DSK precisa continuar independente.

## Decisão EGM

### 1. Fonte de cena: transformação única, zoom 10–300%

- `normalizeAdjust` passa a aceitar **0,10–3,00** de zoom.
- Pan continua em **−100%…+100%** (metade do espaço do layout), suficiente para reposicionar uma
  fonte reduzida; a posição é aplicada depois do corte e do encaixe.
- Cortes continuam em até 45% por lado.
- Nenhum valor antigo muda: zooms ≥1 e posições atuais permanecem idênticos.
- UI: slider de zoom de **10% a 300%**, com o mesmo preview ao vivo.

### 2. DSK: transformação de camada separada

Cada DSK ganha, por formato (horizontal e vertical independentes):

- `zoom` 10–300%;
- `x`/`y` de pan −100…+100 (além do `rect` de área);
- o `crop` existente é mantido.

A ordem é:

```text
captura → página/imagem/fonte → corte → fit/zoom/pan da camada → retângulo final
```

`rect` continua sendo a área de referência; zoom/pan são aplicados ao redor dela. A camada DSK
continua acima da cena, com fade, opacidade e keyer inalterados.

### 3. Página web do DSK: viewport fixo por padrão para páginas novas

- Configuração nova de página: viewport **fixo**, padrão `1280×720`, com opções `1280×720`,
  `1920×1080` e `1024×576`.
- O viewport é independente de `rect`, zoom e pan. Mudar a área não recria nem reflui a página.
- A captura fixa é encaixada na área com:
  - **Preencher** (`cover`): cobre a área e corta as bordas;
  - **Conter** (`contain`): mostra a página inteira; sobras ficam transparentes.
- **Compatibilidade:** DSKs antigos sem o campo `page` continuam no modo **área do DSK (legado)**.
  O operador pode migrar para o modo fixo quando quiser; nada muda sozinho.

### 4. Limites (não fazer)

- Não aplicar `sourceAdjust` diretamente dentro do keyer do DSK.
- Não mudar a ordem de camadas, o fade ou a captura de áudio do DSK.
- Não recapturar a página a cada movimento de zoom/pan/posição quando o viewport é fixo.
- Não alterar páginas legadas sem ação explícita do operador.

## Implementação

| Área | Mudança |
|---|---|
| `compositor.js` | zoom mínimo de `normalizeAdjust` para 0,10 |
| `studio.js` | slider de zoom do ajuste de fonte começa em 10% |
| `dsk.js` | `page {mode,width,height,fit}`, zoom/pan por camada, viewport fixo, migração legada |
| UI do DSK | controles de página, encaixe, zoom e pan; cópia para o vertical |

## Critérios de aceite

- Fonte de cena em 10%, 50%, 100% e 300% desenha no lugar esperado, com corte e pan.
- DSK com zoom 50% e pan desloca a camada sem alterar key/fade.
- DSK de página fixa mantém o layout ao mudar `rect`, zoom e pan; status do servidor permanece no
  tamanho escolhido.
- DSK legado com página em modo área mantém o comportamento anterior.
- Crop, lupa de prévia, arraste Alt, vertical e keyer continuam funcionando.
- Sem publicação: validação local antes de VPS/GitHub.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Página fixa consumir mais CPU | padrão 1280×720 e opção 1024×576; página só abre quando o DSK está ligado |
| Overlay antigo mudar de aparência | modo legado quando `page` está ausente; migração explícita |
| Zoom pequeno deixar área vazia | escolher `cover`/`contain`, crop e cor de fundo do canal; preview ao vivo |
| Pan/zoom divergir do keyer | zoom/pan aplicados depois da captura/key, no desenho da camada |
