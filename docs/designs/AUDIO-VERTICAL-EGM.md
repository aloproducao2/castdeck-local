# EGM — Mesa de áudio vertical

> **Status:** implementado localmente em 2026-11-04 (fases 1–2; canais e buses verticais; master/retorno horizontais), **não publicado**.
> **Base:** CastDeck Local 1.3.29 + painel de áudio atual.
> **Data:** 2026-11-04

---

## 1. Pedido

Criar um botão para colocar o painel de áudio com os controles **na vertical**, como uma mesa de
áudio. A ideia é que, **no painel destacado**, isso fique ainda melhor.

O pedido tem duas partes:

1. um **modo vertical** para os controles;
2. um **botão** para alternar esse modo;
3. uma experiência melhor quando o painel está **destacado**.

---

## 2. Estado atual

O painel de áudio (`audio-ui.js`) já tem:

- **Master** com VU L/R, fader horizontal, mute, dim e limitador;
- **Canais** com VU horizontal, fader horizontal, mute, solo, CC, sends A–G e redução de ruído;
- **Buses A–G** com fader horizontal e medidor;
- **Retorno/Fone** com volume, “Ouvir programa”, teste de saída e ajuda de eco;
- accordions por seção;
- botão **Destacar painel** (`floatwin`) e popout próprio (`audio-popout.html`);
- faders horizontais (`input[type=range]`) e VUs horizontais.

Hoje a mesa é uma **lista vertical de canais horizontais**. Funciona bem na lateral, mas:

- cada canal ocupa uma linha larga;
- com muitos convidados/mídias, o operador rola muito;
- não parece uma mesa de mixagem;
- no painel destacado, sobra largura e falta aproveitamento de colunas.

---

## 3. EGM — seis lentes

### 3.1 Operador

O que o operador precisa ao vivo:

- ver todos os canais principais de uma vez;
- comparar níveis rapidamente;
- achar mute/solo/CC sem caçar;
- não perder o master;
- alternar para horizontal quando estiver no celular ou na lateral estreita.

O modo vertical deve ser **opcional e previsível**, não uma segunda mesa com estado próprio.

### 3.2 Layout / informação

Uma mesa vertical pede:

- uma coluna por canal;
- master em coluna fixa;
- medidor vertical ao lado do fader;
- botões M/S/CC no topo ou base da coluna;
- sends A–G compactos;
- nome/tag legíveis;
- scroll horizontal quando houver canais demais.

Na lateral estreita, uma coluna de 80–96 px ainda cabe, mas 6+ canais exigem rolagem. No painel
destacado (520–760 px), cabem 5–7 colunas com master, que é o cenário ideal.

### 3.3 Estado / comportamento

O modo é **só visual**:

- não recria o mixer;
- não muda ganho, mute, solo, rotas ou buses;
- não duplica elementos `<input>`;
- mantém os mesmos ids/handlers;
- persiste a preferência.

Isso evita a maior regressão possível: duas mesas com estados diferentes.

### 3.4 Painel destacado

O painel destacado tem mais largura e altura. É o lugar natural para a mesa vertical.

Duas ações devem coexistir:

- **Mesa vertical**: alterna o layout no painel atual;
- **Destacar em mesa vertical**: abre o painel destacado já no modo vertical.

Não é bom forçar o modo vertical ao destacar sem aviso: o operador pode ter escolhido horizontal.
Mas o botão de destaque pode ser explícito.

### 3.5 Acessibilidade

- fader vertical precisa continuar operável por teclado;
- `aria-orientation="vertical"`;
- labels de canal e botões preservados;
- contraste dos LEDs (mute/solo/CC);
- foco visível;
- não depender só de cor.

### 3.6 Performance / manutenção

- CSS-first: alternar classe no container;
- sem novo `AudioContext`, sem novo medidor, sem novo stream;
- os medidores existentes continuam atualizando;
- evitar re-renderizar o painel inteiro ao alternar;
- testes de regressão de áudio.

---

## 4. Opções e ponderação

### Opção A — Só um toggle CSS na lateral

**O que é:** botão “Mesa vertical” adiciona `.ax-vertical` e reflui os mesmos canais.

- **Prós:** menor esforço; baixo risco; nenhum estado novo.
- **Contras:** na lateral de ~360 px, as colunas ficam apertadas; poucos canais visíveis; a
  experiência pode piorar sem o painel destacado.
- **Veredito:** útil como base, insuficiente sozinho.

### Opção B — Só um popout “Mesa vertical”

**O que é:** botão abre uma janela dedicada, sempre vertical.

- **Prós:** espaço ideal; cara de mesa; não mexe na lateral.
- **Contras:** cria uma segunda superfície; o operador pode ficar com duas janelas; se o popup for
  bloqueado, fallback ruim; não atende “colocar o painel atual na vertical”.
- **Veredito:** bom complemento, não solução única.

### Opção C — Toggle + destaque vertical (recomendada)

**O que é:**

- botão **Mesa vertical** alterna o layout no painel atual;
- botão **Destacar em mesa vertical** abre o painel destacado já vertical;
- o painel destacado lembra o modo;
- o modo pode ser alternado também dentro do painel destacado.

- **Prós:** atende ao pedido; funciona bem na lateral e no destacado; uma única mesa/estado; o
  destaque é explícito; boa operabilidade.
- **Contras:** duas ações na interface; precisa de CSS responsivo e testes de popout/floating.
- **Veredito:** **recomendada**.

### Opção D — Substituir o horizontal pelo vertical

- **Prós:** visual de mesa.
- **Contras:** quebra mobile/lateral; perde a leitura horizontal dos VUs; regressão para quem usa
  pouco espaço.
- **Veredito:** não fazer.

### Matriz

| Critério | A | B | C | D |
|---|---|---|---|---|
| Atende “painel atual vertical” | sim | não | **sim** | sim |
| Boa na lateral | ruim | sim | **média** | ruim |
| Boa no destacado | média | sim | **sim** | média |
| Estado único | sim | não | **sim** | sim |
| Esforço | S | M | **M** | M |
| Risco | baixo | médio | **médio** | alto |

---

## 5. Desenho proposto

### 5.1 Botões

No topo do painel de áudio:

```text
[▥ Mesa vertical]  [⧉ Destacar em mesa vertical]  [⤢ Destacar painel]
```

- **Mesa vertical**:
  - alterna `horizontal` ↔ `vertical`;
  - `aria-pressed`;
  - ícone de colunas;
  - atalho opcional depois.
- **Destacar em mesa vertical**:
  - abre o popout/floating já com `audioView=vertical`;
  - usa o mesmo painel/controles.
- **Destacar painel**:
  - mantém o comportamento atual;
  - abre no modo salvo.

No painel destacado, o botão **Mesa horizontal** aparece para voltar.

### 5.2 Estrutura visual

Modo horizontal (atual):

```text
[Master]
[canal 1  VU ─────  fader ─────  M S CC  sends]
[canal 2  VU ─────  fader ─────  M S CC  sends]
[canal 3  ...]
```

Modo vertical:

```text
[Master] [Canal 1] [Canal 2] [Canal 3] ... → scroll horizontal
          nome      nome      nome
          VU        VU        VU
          fader     fader     fader
          M S CC    M S CC    M S CC
          sends     sends     sends
```

- Master fixo à esquerda.
- Canais em grid/flex de colunas.
- Largura da coluna: 84–100 px.
- Fader vertical com `writing-mode: vertical-lr; direction: rtl` (Chromium) e fallback.
- VU vertical: mesma lógica de máscara, rotacionada/empilhada.
- Em painel largo: 5–7 canais visíveis.
- Em painel estreito: scroll horizontal; sem esmagar botões.
- Buses/Retorno continuam abaixo, em accordions, sem virar colunas.

### 5.3 Estado

```text
audioView: 'horizontal' | 'vertical'     // localStorage castdeck.audio.view
```

- O toggle não recria o DOM do mixer; só troca classe/estrutura.
- Se for necessário re-renderizar para fader vertical, preservar valores atuais e não reiniciar áudio.
- No popout, `view=vertical` na URL ou preferência própria.
- O modo não é salvo por canal; é uma preferência de interface.

### 5.4 Responsividade

| Contexto | Comportamento |
|---|---|
| Lateral < 380 px | vertical permitido, mas com scroll horizontal; sugestão de destacar |
| Lateral 380–520 px | vertical em 3–4 colunas |
| Destacado 520–760 px | vertical em 5–7 colunas + master |
| Mobile retrato | horizontal por padrão; vertical opcional com scroll |
| Mobile paisagem | vertical permitido |

Não bloquear o botão no mobile; apenas não prometer que todos os canais cabem.

---

## 6. Plano por fases

### Fase 0 — Auditoria e contrato

1. Medir largura real da lateral, do floating e do popout.
2. Definir breakpoints e largura de coluna.
3. Congelar o contrato: modo é visual; mixer/estado não muda.

### Fase 1 — Toggle no painel

1. Adicionar `audioView` persistido.
2. Adicionar classe `.ax-vertical` no `.ax`.
3. CSS de grid/colunas, master fixo e scroll horizontal.
4. Botão com `aria-pressed`, título e ícone.
5. Manter faders horizontais nesta fase; só testar o reflow.

### Fase 2 — Faders e VUs verticais

1. Fader vertical acessível (`aria-orientation=vertical`).
2. VU vertical reutilizando a mesma máscara.
3. Ajustar labels, dB, clips e botões.
4. Testar valores e teclado.

### Fase 3 — Painel destacado

1. Botão **Destacar em mesa vertical**.
2. `audio-popout`/floatwin recebem o modo.
3. Largura mínima e scroll.
4. Lembrar preferência ao reabrir.

### Fase 4 — Acabamento

1. i18n PT/EN/ES.
2. Atalho e tooltip.
3. Acessibilidade (foco, ARIA, contraste).
4. Testes mobile/lateral/destacado.
5. Documentação.

---

## 7. Testes

### Unitários/DOM

- toggle adiciona/remove classe;
- `aria-pressed` acompanha;
- preferência persiste;
- ids e valores dos faders não mudam.

### E2E

1. Abrir áudio; alternar vertical; conferir master/canais.
2. Mover fader vertical; valor no mixer muda.
3. Mute/solo/CC/sends continuam funcionando.
4. Alternar de volta; valores preservados.
5. Destacar em mesa vertical; popout abre no modo vertical.
6. Fechar/reabrir; modo lembrado.
7. Redimensionar painel; sem overflow invisível.
8. Mobile: horizontal padrão, vertical com scroll.
9. Teclado: setas sobem/descem o fader.
10. Sem erros de áudio/console.

### Regressão

- Faders, VUs, buses, retorno, teste de som, ajuda de eco.
- Painel flutuante e popup.
- i18n.

---

## 8. Critérios de aceite

- [ ] Um botão visível alterna horizontal ↔ vertical.
- [ ] O modo vertical usa colunas com master fixo e canais roláveis.
- [ ] Faders verticais são operáveis e acessíveis.
- [ ] Mute/solo/CC/sends/NR continuam funcionando.
- [ ] Alternar não muda ganho, rotas ou mute.
- [ ] Preferência persiste.
- [ ] “Destacar em mesa vertical” abre o painel já vertical.
- [ ] Lateral estreita não quebra; há scroll.
- [ ] Mobile mantém horizontal por padrão.
- [ ] Sem segundo mixer ou segundo `<input>` duplicado.
- [ ] PT/EN/ES.

---

## 9. Riscos

| Risco | Mitigação |
|---|---|
| Fader vertical com layout instável | testar `writing-mode` e fallback; largura fixa |
| Fader vertical difícil de acertar | área de toque maior; teclado |
| Muitos canais esmagados | scroll horizontal; largura mínima |
| Duas mesas/estados | uma árvore DOM; só classe/layout |
| Popup bloqueado | fallback floatwin existente |
| Mobile pior | horizontal padrão; vertical opcional |
| VU invertido | teste visual e de valores |
| i18n esquecida | strings no dicionário desde a fase 1 |

---

## 10. Decisões em aberto

1. O padrão no painel destacado é vertical ou o último modo usado?
2. O botão “Mesa vertical” fica no topo ou no cabeçalho de “Canais”?
3. O master fica fixo à esquerda ou no fim?
4. Mostrar todos os canais com scroll ou limitar a 6 e paginar?
5. No mobile, esconder o botão ou manter com scroll?
6. O modo vertical deve ser por painel (lateral × destacado) ou global?

---

## 11. Veredito EGM

A melhor solução é a **Opção C**:

1. botão **Mesa vertical** no painel atual;
2. layout de colunas com master fixo e scroll;
3. faders/VUs verticais acessíveis;
4. botão **Destacar em mesa vertical** para o cenário ideal;
5. um único mixer e um único estado.

Não vale substituir o horizontal: a lateral e o mobile precisam dele. Também não vale criar uma
segunda mesa só no popout: o operador teria dois lugares para o mesmo estado.

O painel destacado é o melhor lugar para a mesa vertical — mas o modo deve ser **explícito e
persistente**, não forçado sem aviso.


---

## 12. Implementação local (2026-11-04)

- Botão **Mesa vertical** no topo do painel; alterna `ax-vertical` e persiste em `castdeck.audio.view`.
- Botão **Destacar em mesa vertical** define o modo e destaca o painel (floating/popup com fallback).
- Canais viram colunas de 104 px com scroll horizontal; faders e VUs ficam verticais.
- `aria-orientation`/`orient` acompanham o modo; valores, mute, solo, CC, sends e NR são os mesmos.
- O modo é só visual: não recria mixer, áudio ou inputs.
- O painel destacado/popout lê o mesmo estado e mostra o botão de voltar para horizontal.
- **Canais e Buses A–G são verticais** nesta versão. Master e Retorno/Fone continuam horizontais; a transformação do Master em coluna fica para a próxima fase.

### Ajuste de VU/fader (2026-11-04)

- VU vertical cresce **de baixo para cima** (`transform-origin: top` na máscara; peak acompanha).
- Fader de canal e de bus usa **trilho escuro + cap retangular**, com wrapper `fader-rail` e input rotacionado.
- Intensidade do noise reduction fica empilhada dentro do card.

### Testes

- Toggle horizontal ↔ vertical: classe, `aria-pressed`, texto e persistência.
- Fader de canal vertical: 100 → 60, mixer recebeu 0,60.
- Fader de bus vertical: 100 → 70, `mixer.getBus('A').level` recebeu 0,70.
- Buses em grid de 3 colunas na lateral, com faders/meters verticais.
- Reload manteve o modo vertical.
- “Destacar em mesa vertical” abriu o painel flutuante já vertical.
- Sem erros de runtime.
- `npm run test:security`: OK.

**Build local:** 190.867.968 bytes; SHA-256
`0791306c855576007fe7ee0c9f11695dcd82410084f9afa649ed7a825c94e7fb`.
