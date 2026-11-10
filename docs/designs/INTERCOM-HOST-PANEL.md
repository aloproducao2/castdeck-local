# EGM — Painel de Intercom do Host

> **Status:** especificação implementada e publicada no CastDeck 1.3.33 em 2026-11-04 (`cast.flue.live` e GitHub release `v1.3.33`).
> **Base:** plano [`INTERCOM-EGM.md`](INTERCOM-EGM.md).
> **Observação:** o painel usa PTT GERAL + teclas TODOS/CÂMERAS/REPORTAGEM/PGM; o retorno de áudio e o PTT já estão ligados às câmeras e à página `/intercom`.
> **Nesta versão:** botão **Mini** abre um painel flutuante opcional com PTT, travar microfone e corte rápido de câmeras; o PTT pode ser momentâneo ou travado.
> **Objetivo:** definir como o **diretor/host** opera o intercom no CastDeck sem sair do fluxo da live.

---

## 1. Princípio central

O painel do host não é uma lista de contatos. É um **keypanel de broadcast**:

- teclas de canal com **talk** e **listen** independentes;
- um **PTT geral** grande para falar com todos;
- uma lista secundária de participantes para nível, fone, tally e atribuição;
- IFB do programa com volume próprio;
- administração sempre acessível: **Mic Unlatch**, **Silenciar todos**, **Page All**.

A operação precisa ser possível **com uma mão e sem tirar os olhos do programa**.

---

## 2. Onde ele vive

### 2.1 Local principal

**Painel lateral → Áudio → Intercom**.

Isso mantém o intercom ao lado do mixer, do diretor e das câmeras, sem criar mais uma janela
flutuante no meio da live.

### 2.2 Painel destacado

O botão **Destacar** existente abre o mesmo painel numa janela própria, para um segundo monitor.
No modo destacado, o layout passa de uma coluna para duas:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ INTERCOM DO DIRETOR        ● conectado  42 ms    [layout] [x]       │
├───────────────────────────────┬─────────────────────────────────────┤
│ PTT GERAL                     │ CANAIS                              │
│ [ SEGURE PARA FALAR ]         │ [ TODOS ] [ CÂMERAS ] [ REP ] [ PGM]│
│ mic ▮▮▮▮▯  Sidetone [──●──]   │                                     │
│ [Silenciar] [Mic Unlatch]     │ PARTICIPANTES                       │
│                               │ ● João  CAM1  PGM  fone  ▮▮▮       │
│ IFB DO PROGRAMA               │ ● Ana   CAM2  PVW  fone  ▮▮▯       │
│ [──●────] -18 dB  Duck -12    │ ● Rua   REP   —    fone  ▮▮▮       │
└───────────────────────────────┴─────────────────────────────────────┘
```

### 2.3 Mini barra quando a aba não está aberta

O host precisa falar enquanto corta câmeras. Opção segura:

```text
[● INTERCOM]  [ SEGURE PTT ]  [TODOS ▾]  [🔇]
```

- aparece acima da barra de palco quando o intercom está ligado;
- apenas PTT, destino e mute;
- clicar em “INTERCOM” abre o painel completo;
- pode ser desligada nas preferências para quem não usa.

> Essa mini barra é opcional na fase 1; o painel completo é obrigatório.

---

## 3. Anatomia do painel

### 3.1 Cabeçalho

```text
INTERCOM  ● ON   LAN 42 ms   [Destacar] [Configurar] [×]
```

Elementos:

- **estado**: ligado/desligado, conectando, erro;
- **latência** (RTT) do pior participante;
- **rede**: LAN / Internet;
- **participantes**: `3/8`;
- **Destacar**;
- **Configurar**: perfil, atalhos, latch, áudio;
- **fechar**.

O cabeçalho não tem botão de pânico escondido; pânico fica visível no corpo.

### 3.2 Faixa do diretor

```text
┌ DIRETOR ─────────────────────────────────────────────┐
│  [        SEGURE PARA FALAR        ]                 │
│  🎙 ▮▮▮▮▯▯  -12 dB       MIC ABERTO / MIC FECHADO   │
│  Sidetone [──●────] 30%   Ganho [──●──]             │
│  [Mudo]  [Travar PTT]  [Testar fone]                 │
└──────────────────────────────────────────────────────┘
```

Regras:

- **PTT grande** de no mínimo 56 px de altura; alvo de toque confortável.
- Pressionar e segurar; soltar fecha. Pointer capture para não “prender” se o mouse sair.
- **Travar PTT** é opcional e mostra estado azul/âmbar persistente.
- `MIC ABERTO` é texto + LED, não só cor.
- Medidor de microfone sempre visível quando o intercom está ligado.
- **Sidetone** de 0–20%; padrão baixo.
- Ganho de microfone separado do volume de escuta.
- **Testar fone** toca um tom curto no retorno.
- Não colocar botão de pânico no lugar do PTT.

### 3.3 Teclas de canal

Quatro teclas no desktop; duas no celular.

```text
┌ TODOS ───────┐ ┌ CÂMERAS ─────┐ ┌ REPORTAGEM ──┐ ┌ PGM ─────────┐
│ ● 2 falando  │ │ ● 1 conectada│ │ ○ ocioso     │ │ ▮ programa   │
│ [TALK] [LIS] │ │ [TALK] [LIS] │ │ [TALK] [LIS] │ │ volume -18dB │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

- **TODOS**: PTT geral (também disponível na faixa do diretor).
- **CÂMERAS**: fala/ouve o grupo de cinegrafistas.
- **REPORTAGEM**: fala/ouve o grupo de repórteres.
- **PGM**: **listen only**; o botão de talk fica desabilitado.
- Cada tecla tem nome, estado, cor, talk, listen e volume.
- **Talk** é momentâneo; **Listen** é chave de escuta.
- O texto da tecla é mais importante que o ícone.
- Ordem das teclas é **fixa durante a live**; não reordenar quando alguém fala.

### 3.4 Participantes

A lista é operacional, não decorativa:

```text
● Câmera 1 — João      CAM1   PGM   🎧   -32 dBm   [▮▮▮▯]  [🔊] [PTT]
● Câmera 2 — Ana       CAM2   PVW   🎧   -41 dBm   [▮▮▯▯]  [🔊] [PTT]
● Repórter — Rua       REP    —     🎧   online    [▮▮▮▮]  [🔊] [PTT]
○ Câmera 3 — aguardando…
```

Cada linha:

- ponto de presença;
- nome;
- papel (câmera/reporter/produtor);
- tally PGM/PVW;
- fone;
- latência/sinal;
- medidor de voz;
- volume de escuta;
- mute;
- PTT individual;
- “abrir no painel de câmeras”.

Regras:

- **ordem estável** (por grupo + nome), nunca reordenar por “quem falou por último”;
- o estado ativo muda a cor/borda, não a posição;
- linhas com 44 px de altura mínima;
- clique no nome abre a câmera correspondente;
- microfone de participante começa fechado;
- um “ponto” verde não é tally; tally é PGM/PVW.

### 3.5 IFB do programa

```text
┌ PROGRAMA (IFB) ──────────────────────────────┐
│ [x] Enviar programa    Nível [──●────] -18dB │
│ [x] Ducking quando o diretor fala   -12 dB   │
│ [Testar]                                     │
└──────────────────────────────────────────────┘
```

- programa é **listen-only**;
- nível separado do talkback;
- ducking opcional;
- “Enviar programa” pode ser desligado por participante;
- nunca mandar o intercom para o programa por esse bloco.

### 3.6 Administração

No topo ou rodapé, sempre visível:

```text
[Silenciar todos]  [Mic Unlatch]  [Page All]  [Link/QR]  [Bloquear]
```

- **Silenciar todos**: fecha microfones de todos.
- **Mic Unlatch**: destrava qualquer PTT travado.
- **Page All**: fala com todos, independentemente de seleção.
- **Link/QR**: abre o modal de convite (LAN/Internet, chave, QR).
- **Bloquear**: trava o painel para evitar toque acidental em tablet.
- Ações destrutivas pedem confirmação.

### 3.7 Rodapé de telemetria

```text
LAN · 42 ms · perda 0.0% · 3/8 participantes · microfone OK
```

- mostra o que o host precisa para confiar;
- se um participante estiver com perda alta, destacar na linha dele;
- erro de áudio/túnel aparece como banner, não como toast que some.

---

## 4. Estados visuais

| Estado | Aparência | Texto |
|---|---|---|
| Intercom desligado | cinza | “Intercom desligado” |
| Conectando | âmbar pulsante | “Conectando…” |
| Ocioso | cinza-esverdeado | “Ocioso” |
| Ouvindo | ciano suave | “Ouvindo” |
| Falando (PTT) | azul forte | “FALANDO” |
| PTT travado | azul + borda âmbar | “MIC TRAVADO” |
| Participante mudo | cinza | “Mudo” |
| Offline | tracejado | “Sem conexão” |
| Fone ausente | âmbar | “Sem fone” |
| Erro de áudio | vermelho de sistema | “Áudio bloqueado” |
| PGM/PVW tally | vermelho/verde | “PGM”/“PVW” |

Importante:

- **vermelho/verde são reservados ao tally**;
- talkback usa **azul/ciano**;
- cue/call usa **âmbar**;
- não depender só da cor: sempre texto/ícone.

---

## 5. Interações

### 5.1 Falar com todos

1. Pressionar e segurar **PTT GERAL**.
2. O microfone abre, o medidor reage e as teclas acendem em azul.
3. Soltar fecha o microfone e o estado volta a “ouvindo”.

Atalho: `Ctrl + Space` quando o painel está focado, configurável. O atalho global deve avisar
conflito com atalhos do sistema/navegador.

### 5.2 Falar com um grupo

- Segurar **TALK** em `CÂMERAS` ou `REPORTAGEM`.
- O grupo inteiro ouve; o botão fica azul; os participantes do grupo acendem.

### 5.3 Falar com uma pessoa

- Segurar o **PTT** da linha do participante.
- O grupo não é afetado.
- Use quando a coordenação é individual.

### 5.4 Ouvir sem falar

- Ligar **LIS** na tecla/participante.
- O nível de escuta é independente do talk.
- É possível ouvir um grupo inteiro ou uma pessoa.

### 5.5 Travar o microfone

- Duplo clique no PTT ou menu “Travar PTT”.
- Estado travado é muito visível.
- **Mic Unlatch** no topo; `Esc` também destrava com confirmação.

### 5.6 Chamar atenção sem falar

- Botão **Call** na tecla/linha.
- Pulso âmbar, vibração no celular quando possível.
- Não abre microfone.

### 5.7 Silenciar tudo

- **Silenciar todos** fecha microfones de participantes e do diretor?
  - O correto: fechar microfones dos participantes; o diretor ainda pode falar se quiser.
  - “Silenciar tudo” separado para emergência.

### 5.8 Sair/desligar

- **Desligar intercom** encerra todos os retornos e participantes.
- Confirmação se houver gente conectada.
- O áudio do programa continua normalmente.

---

## 6. Layout responsivo

### 6.1 Sidebar (360 px)

- uma coluna;
- PTT geral;
- 4 teclas em grade 2×2;
- participantes em lista rolável;
- IFB e administração em acordeões;
- alvos grandes; nada de hover-only.

### 6.2 Painel destacado (640–900 px)

- duas colunas;
- esquerda: diretor, teclas, IFB;
- direita: participantes e log;
- teclas em linha única;
- medidores maiores.

### 6.3 Tablet/celular do host

- modo de **2 teclas** + PTT geral;
- participantes em lista;
- painel em tela cheia;
- não tentar mostrar 4 teclas minúsculas.

### 6.4 Mini barra

- 40 px de altura;
- PTT, destino e mute;
- sem configurações;
- não cobre o tally nem o programa.

---

## 7. Fluxos de uso

### 7.1 Primeiro uso

```text
Abrir Áudio → Intercom
→ Nenhum participante
→ [Link/QR]
→ escolher LAN/Internet
→ copiar link ou mostrar QR
→ câmera conecta
→ linha aparece “conectada”
→ PTT já disponível
```

### 7.2 Durante a live

```text
Câmera 1 no PGM (tally vermelho)
→ diretor precisa reposicionar
→ segura PTT da câmera 1
→ câmera ouve somente o diretor
→ diretor solta
→ câmera continua no ar
```

### 7.3 Emergência

```text
PTT travado
→ banner “MIC TRAVADO”
→ [Mic Unlatch]
→ microfone fecha
→ estado normal
```

### 7.4 Saída de participante

```text
câmera cai
→ linha fica “reconectando…”
→ retorno não toca alto-falante
→ ao voltar, volta ao mesmo grupo/tecla
→ sem duplicar linha
```

---

## 8. Acessibilidade e ergonomia

- Alvos de toque mínimos de **44 × 44 px**; PTT ideal ≥ 56 px.
- Foco visível em teclado.
- `aria-pressed` em talk/listen/mute.
- Texto de estado sempre presente; não depender de cor.
- Navegação por Tab; `Esc` cancela/desarma.
- `prefers-reduced-motion` para pulsos.
- Não usar som de interface padrão durante a live; só cue opcional.
- Não mover controles sob o cursor quando algo fala.
- Não colocar ações destrutivas ao lado do PTT.
- Funcionar com teclado e com toque.

---

## 9. Componentes técnicos

| Componente | Responsabilidade |
|---|---|
| `intercom-panel.js` | UI do host, teclas, participantes, IFB |
| `mixer.intercomBus` | barramento privado |
| `mixer.intercomOutput(id)` | retorno pessoal |
| `mixer.setIntercomSend(id, on)` | PTT/talk por fonte |
| `signaling` role `intercom` | presença e comandos |
| `camera-panel.js` | bloco compacto da câmera |
| `cam.js` | retorno + PTT na página da câmera |
| `intercom.html/js` | página independente |

### Eventos do painel

- `intercom-participant-joined/left`;
- `intercom-state` (mic, fone, rede);
- `intercom-ptt` (host/participante);
- `intercom-call`;
- `intercom-tally`;
- `intercom-error`.

### Fonte de verdade

- host: `S.intercom` para configuração e grupos;
- servidor: chave e presença;
- mixer: níveis e rotas;
- participantes: estado efêmero.

---

## 10. Regras de design que não podem ser quebradas

1. PTT sempre fecha ao soltar.
2. Nenhum microfone abre sozinho.
3. Intercom não vai ao PGM sem ação explícita.
4. Talk e listen nunca compartilham o mesmo botão.
5. Nome e estado do participante são legíveis de longe.
6. Tally vermelho/verde não é usado para talk.
7. A ordem das teclas não muda durante a live.
8. “Mic Unlatch” está sempre a um clique.
9. Fone é o padrão; alto-falante é exceção.
10. O host consegue falar sem abrir uma modal.

---

## 11. Critérios de aceite do painel do host

- [ ] Host fala com todos segurando um único PTT.
- [ ] Host fala com grupo e com pessoa.
- [ ] Talk/listen independentes por tecla.
- [ ] PTT solto fecha microfone em todas as situações (mouse, teclado, perda de foco, troca de aba).
- [ ] Latch é exceção e tem Mic Unlatch.
- [ ] Participantes aparecem com nome, grupo, tally, fone e nível.
- [ ] A ordem das teclas não muda quando alguém fala.
- [ ] Cores de tally e intercom são distintas.
- [ ] Programa/IFB tem volume e ducking independentes.
- [ ] “Silenciar todos” e “Mic Unlatch” funcionam.
- [ ] Painel cabe na sidebar de 360 px.
- [ ] Painel destacado usa duas colunas.
- [ ] Câmera continua no ar ao abrir/fechar intercom.
- [ ] Erros de áudio/túnel ficam visíveis sem toast temporário.
- [ ] Teclado e toque funcionam.
- [ ] Nada abre microfone ao entrar na aba.

---

## 12. Referências de design

- [RTS KP-812 Keypanel](https://products.rtsintercoms.com/binary/KP%20812%20User%20Manual.pdf)
- [Clear-Com HelixNet Beltpack](https://www.clearcom.com/DownloadCenter/datasheets/HelixNet/HelixNet-Beltpack_Datasheet.pdf)
- [Green-GO WBPX](https://manual.greengoconnect.com/en/devices/wbpx/)
- [Unity Intercom](https://vtx.uk/unity-intercom-self-hosted/)
- [Studio Technologies IFB 42A](http://studio-tech.com/wp-content/uploads/2017/12/ug_m42a_2.pdf)

Esses sistemas foram usados como **referência de operação e design**, não como cópia. O CastDeck
combina a clareza das teclas de keypanel com a flexibilidade de uma página web e o IFB do programa.
