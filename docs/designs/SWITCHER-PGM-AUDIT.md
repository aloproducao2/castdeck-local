# EGM — Auditoria da mesa de corte (PGM) e do modo Estúdio

> **Status:** publicado na 1.3.28 (2026-11-03).
> **Escopo:** corte de câmeras em **PROGRAMA (PGM)**, prévia, AUTO/dissolve, T-bar, atalhos e o
> **modo Estúdio** (palco/layout/solo), incluindo áudio, tally e saídas derivadas.
> **Data:** 2026-11-03

---

## 1. Método

- Leitura do fluxo `studio.js` → `switcher.js` → `compositor.js` → `scenes.js` → `autoswitch.js`.
- Verificação do contrato de estado: `S.take` (PGM em tela cheia), `S.pvw` (prévia), `S.stage`,
  `S.solo`, `S.switcher`, `comp.take`, `comp.fade`.
- Teste local com estúdio descartável + câmera falsa do Edge:
  - `take('mix')` repetido;
  - tecla **Espaço** com foco no botão **AUTO**;
  - inspeção de `S.take`, `S.pvw`, `comp.fade` e `mixProgress()`.
- Não houve alteração de código nem publicação.

---

## 2. Contrato atual

```text
S.switcher = false (modo Estúdio)
  PGM = S.stage (layout)
  S.solo = uma fonte do palco em tela cheia (opcional)
  S.take = null

S.switcher = true (mesa de corte)
  S.take = id da fonte | null (Cena = palco/layout/solo)
  S.pvw  = id da fonte | null (prévia)
  CORTE/AUTO trocam S.pvw ↔ S.take
  T-bar faz a troca manual
  Saídas derivadas (vertical, retorno do convidado) copiam S.take
```

O comentário do próprio `switcher.js` define que **o palco continua valendo para o áudio** e que
`airKeys()` = palco + take. Essa parte está coerente.

---

## 3. EGM — seis lentes

| Lente | O que foi verificado | Resultado |
|---|---|---|
| **Estado / máquina de corte** | corte, auto, manual, repetição, troca de modo | Encontrou estado inconsistente em transição e teclado |
| **Vídeo / PGM** | `comp.take`, `fade`, câmera em tela cheia, cena | PGM principal correto; derivadas não acompanham fade |
| **Áudio** | `airKeys`, `applyAir`, mídia, mute | Coerente: áudio do take entra mesmo fora do palco |
| **Tally / prévia** | PGM, prévia, palco, convidados | Coerente na maior parte |
| **UX / operador** | modo Estúdio × mesa, foco, atalhos, cenas | Várias ações ambíguas ou sem feedback |
| **Qualidade / testes** | regressão, automação, acessibilidade | Faltam testes para transição, foco e derivadas |

---

## 4. Achados

### F1 — AUTO/CUT durante uma transição reinicia a mistura e pode voltar para a Cena

**Severidade:** alta

**Evidência:**

```js
// switcher.js — canTake()
const canTake = () =>
  S.switcher &&
  !(comp.fade && comp.fade.manual) &&   // só bloqueia T-bar manual
  S.pvw !== S.take &&
  (!S.pvw || S.sources.has(S.pvw));
```

`comp.fade` de um **AUTO** (não manual) continua ativo por `S.transMs`. Nesse intervalo, `canTake()`
retorna `true`; uma segunda chamada de `take()` executa outro `swap()`:

```text
Cena (take=null, pvw=cam)
→ AUTO 1: take=cam, pvw=null, fade ativo
→ AUTO 2: take=null, pvw=cam, fade reinicia
```

O PGM **volta para a Cena** e o dissolve recomeça. O mesmo acontece com:

- CUT durante AUTO;
- CUT/AUTO durante um T-bar já motorizado (`resumeMix`);
- tecla Espaço/Enter repetida (key repeat);
- duplo clique no cartão da fonte.

**Teste local (1000 ms):**

| Momento | `S.take` | `S.pvw` | `comp.fade` |
|---|---|---|---|
| inicial | `null` | `host:cam` | não |
| depois do 1º AUTO | `host:cam` | `null` | sim (`p≈0.007`) |
| depois do 2º AUTO | `null` | `host:cam` | sim (`p≈0.001`) |

**Impacto:** o programa pisca/volta para a Cena no meio da transição; com áudio, o retorno de áudio
também inverte. É o achado mais grave.

**Correção sugerida:** bloquear **qualquer** `comp.fade` ativo em `canTake()`; ignorar `e.repeat`;
desabilitar visualmente CUT/AUTO durante a transição; opcionalmente enfileirar uma única transição.

---

### F2 — Saídas vertical e retorno do convidado fazem corte seco enquanto o PGM dissolve

**Severidade:** média/alta

**Evidência:**

- `compositor.js` → `transition()` incrementa `cutSeq` em **todo** corte/mix.
- `GuestView.render()` e `VerticalView.render()` fazem:

```js
v.take = m.take;
if (this.cutSeq !== m.cutSeq) {
  this.cutSeq = m.cutSeq;
  v.snap = true;      // próximo quadro vai direto ao estado novo
}
v.render();
```

- Nenhum dos dois copia `m.fade` nem desenha a cena anterior.
- O `PreviewView` também usa `snap`, mas isso é esperado para prévia.

**Impacto:** o operador vê um dissolve no monitor PGM, mas:

- a saída **9:16** corta seco;
- o **retorno do convidado** corta seco;
- o áudio já trocou no início do AUTO.

Isso quebra a promessa de “mesmo corte” e cria diferença entre o que o público horizontal vê e o
que o vertical/convidado vê.

**Correção sugerida:** propagar o fade para as visões derivadas (mesmo `fromView`/`fade` com
tamanho próprio) ou assumir/documentar explicitamente que derivadas são sempre corte seco. Preferir
propagar.

---

### F3 — Atalhos globais sequestram Espaço/Enter de botões focados

**Severidade:** média

**Evidência:**

```js
function onKey(e) {
  if (!S.switcher || tb.drag || e.ctrlKey || e.metaKey || e.altKey) return;
  const el = e.target;
  if (el?.closest?.('input, textarea, select, [contenteditable="true"], .modal-back')) return;
  if (document.querySelector('.modal-back')) return;
  ...
  } else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    take('cut');
  }
}
```

Não há guarda para `button`, `a` ou `[role="button"]`. O handler global chama `take('cut')` e
`preventDefault()`, impedindo a ativação normal do controle focado.

**Teste local:** foco em `#sw-auto` (AUTO) + Espaço → `S.take` mudou e `comp.fade` ficou **false**,
ou seja, fez **CORTE**, não AUTO.

**Impacto:**

- teclado não consegue acionar AUTO, cartões de fonte, “Adicionar câmera” etc.;
- Espaço em um cartão de fonte corta em vez de selecionar;
- acessibilidade piora justamente no controle principal.

**Correção sugerida:** não interceptar Espaço/Enter quando o alvo é um controle interativo; ou
limitar os atalhos ao canvas/área da mesa. Se for manter atalho global, usar uma tecla que não colida
(por exemplo, `C` para corte) e deixar Espaço/Enter para o controle focado.

---

### F4 — Segurar Espaço/Enter alterna o PGM repetidamente

**Severidade:** média

**Evidência:** `onKey` não verifica `e.repeat`. Cada repetição do keydown chama `take('cut')`; como
`swap()` troca `S.pvw` e `S.take`, a segunda repetição desfaz a primeira e assim por diante.

**Impacto:** o PGM pisca entre duas fontes enquanto a tecla está pressionada; o operador pode soltar
no estado errado. O mesmo vale para `T` repetido, que reinicia mixes.

**Correção sugerida:** `if (e.repeat) return;` no início de `onKey` e no handler de F1–F6.

---

### F5 — Sair da mesa de corte descarta o PGM em tela cheia sem deixar isso explícito

**Severidade:** média (contrato/UX)

**Evidência:** `setMode(false)`:

```js
const prev = S.take;
S.take = null;
S.pvw = null;
comp.take = null;
comp.endMix();
...
onAir(prev);
```

O modo Estúdio volta ao palco/layout (e ao `S.solo` que já existia). Se o operador estava com uma
câmera em tela cheia no PGM, ela **deixa de estar no ar** ao desligar a mesa; o palco volta.

**Impacto:** trocar de modo não é “só uma visão”: muda o programa. Isso é coerente com a definição
“mesa = take separado do palco”, mas não está claro na UI; o operador pode achar que só fechou o
painel.

**Correção sugerida:** confirmar/avisar ao desligar com take ativo (“o PGM voltará para a Cena”);
ou manter o take ao alternar; ou documentar claramente o contrato.

---

### F6 — F1–F6 aplicam cena imediatamente no modo Estúdio, mas só na prévia na mesa

**Severidade:** média (UX)

**Evidência:** `scenes.js`:

```js
const offAir = S.switcher && S.take !== null;
if (!offAir && !S.ftb) comp.transition('mix', ...);
...
if (offAir) {
  sw?.setPreview(null);
  toast('Cena na PRÉVIA: CORTE ou AUTO põe no ar.');
}
```

**Impacto:** a mesma tecla F1–F6:

- no modo Estúdio: entra no ar;
- na mesa com PGM em tela cheia: **não entra**, só prepara a Cena na prévia.

É uma decisão defensável (evita cortar sem intenção), mas é uma inconsistência de comportamento que
precisa estar visível no atalho/UI.

**Correção sugerida:** mostrar o estado “Cena na prévia” e/ou oferecer `Shift+F1..F6` para cortar a
cena; documentar.

---

### F7 — “Cena” pode estar em tela cheia por causa do Solo, mas o rótulo diz “Cena”

**Severidade:** baixa/média

**Evidência:** ao entrar na mesa, `setMode(true)` não limpa `S.solo`; `S.take = null`; o PGM é
`S.take === null` → “Cena (palco)”, mas `comp.solo` continua ativo e desenha uma fonte em tela cheia.

**Impacto:** o monitor diz “Cena”, o cartão “Cena (palco)” está marcado como PGM, mas o vídeo pode
ser uma câmera solo. O operador pode não entender por que a Cena não é o layout.

**Correção sugerida:** ao entrar na mesa, limpar o solo ou mostrar “Cena (solo: X)” no label.

---

### F8 — CUT/AUTO não indicam quando não farão nada

**Severidade:** baixa

**Evidência:** `canTake()` retorna falso em vários casos (prévia igual ao PGM, fade manual, fonte
inválida), mas os botões não recebem `disabled` nem aviso; `refresh()` só atualiza classes/ativos.

**Impacto:** o operador clica e não acontece nada; em live, isso vira dúvida.

**Correção sugerida:** desabilitar CUT/AUTO quando `!canTake()`, com tooltip do motivo; ou dar
feedback curto.

---

### F9 — Clique em câmera tem significados diferentes nos dois modos

**Severidade:** média (UX, não necessariamente bug)

**Evidência:**

- **Modo Estúdio:** o tile chama `toggleStage`; colocar em tela cheia exige “Solo”.
- **Mesa:** o cartão chama `setPreview`; só **duplo clique** ou CUT/AUTO coloca no ar.
- **Painel de câmeras** e **barra de fontes** repetem a diferença.

**Impacto:** o mesmo “clique na câmera” adiciona ao palco, prepara a prévia ou não muda o PGM,
dependendo do modo. Falta um rótulo/ação explícita (“Prévia”, “Palco”, “Solo”).

**Correção sugerida:** padronizar o clique principal por contexto e mostrar a ação no hover; nunca
fazer o clique parecer um corte se ele só prepara.

---

### F10 — F1–F6 e atalhos não têm guarda de repetição/foco

**Severidade:** baixa

**Evidência:** `scenes.js` keydown não checa `e.repeat`; `switcher.onKey` também não. O handler de
cenas ignora inputs/modais, mas não botões.

**Impacto:** segurar F5 reaplica a cena; foco em um botão + atalho pode ter efeitos colaterais.

**Correção sugerida:** `e.repeat` e a mesma guarda de controles interativos.

---

## 5. O que está coerente

- **Áudio do take fora do palco:** `airKeys()` inclui `S.take`, e `applyAir()` atualiza o mixer no
  corte. Teste de leitura: cortar para uma câmera fora do palco mantém o áudio dela.
- **Tally:** PGM = take (ou palco quando take é null); prévia = `S.pvw`; o modo Estúdio usa palco +
  solo. A lógica está consistente com o contrato.
- **T-bar manual:** `canTake()` bloqueia take durante fade manual; `revert()` restaura a prévia.
- **FTB:** desligar a mesa limpa o FTB; vertical copia `m.ftb`.
- **Prévia:** `PreviewView` usa `snap`, o que é correto para o monitor de prévia.

---

## 6. Plano de testes

### 6.1 Estado / transições

| # | Cenário | Esperado |
|---|---|---|
| 1 | CUT com prévia diferente | PGM = prévia; prévia = antigo PGM |
| 2 | AUTO 500/1000 ms | PGM dissolve; prévia troca; áudio troca no início |
| 3 | AUTO + AUTO durante fade | **não** deve reiniciar/voltar; ficar no destino ou ignorar |
| 4 | CUT durante AUTO | não deve reiniciar; comportamento definido |
| 5 | Segurar Espaço | uma única troca; sem flicker |
| 6 | CUT/AUTO com prévia = PGM | no-op com feedback |
| 7 | T-bar até o fim / soltar no meio / voltar | estado final coerente |
| 8 | Trocar modo com take ativo | contrato explícito e aviso |
| 9 | Remover fonte no PGM | volta para Cena, sem tela preta |
| 10 | F1–F6 nos dois modos | comportamento documentado |

### 6.2 Teclado / acessibilidade

- Foco em **AUTO** + Espaço → deve acionar AUTO (ou atalho global explícito), nunca CUT silencioso.
- Foco em cartão de fonte + Espaço/Enter → selecionar, não cortar.
- Foco em **Adicionar câmera** + Enter → abrir modal.
- Tab por todos os controles; `aria-pressed` e foco visível.
- `e.repeat` em Espaço/Enter/T/F1–F6.

### 6.3 Saídas derivadas

- Com AUTO de 1000 ms, comparar PGM, vertical 9:16 e retorno do convidado em 0/25/50/75/100%.
- Verificar se o vertical/retorno fazem corte seco (achado F2) e se o áudio/GC/DSK acompanham.
- FTB no horizontal e vertical.

### 6.4 Áudio / tally

- Câmera fora do palco no PGM: áudio entra?
- Câmera no palco fora do PGM: áudio continua?
- Mídia no PGM pausa ao sair; volta ao ponto.
- Tally PGM/PRÉVIA no celular do convidado; troca de modo.

### 6.5 Modo Estúdio

- Clique no tile: adiciona/remove do palco.
- Solo: tela cheia; clique de novo volta ao layout.
- Trocar layout com solo ativo.
- Entrar/sair da mesa preservando ou limpando solo (definir contrato).

### 6.6 Automação local

- Expor `switcher` já existe (`window.__castdeck.switcher`); montar estúdio descartável e câmera falsa.
- Testes de estado: chamar `take('mix')` duas vezes e falhar se `S.take` voltar ao valor anterior.
- Teste DOM: focar AUTO e enviar Space; falhar se `comp.fade` não for true.
- Pixel test das derivadas durante o fade; comparar com PGM.

---

## 7. Correções recomendadas (depois da aprovação)

### P0 — antes de qualquer release

1. Bloquear `canTake()` com **qualquer fade** ativo e ignorar `e.repeat`.
2. Corrigir o sequestro de Espaço/Enter em controles focados.
3. Propagar o fade para vertical/retorno do convidado (ou documentar a diferença como decisão).

### P1 — clareza de estado

4. Desabilitar CUT/AUTO sem ação e explicar o motivo.
5. Avisar ao sair da mesa com take ativo.
6. Mostrar “Cena (solo: X)” ou limpar solo ao entrar.
7. Alinhar F1–F6: prévia + indicação clara, ou `Shift+F` para cortar.

### P2 — UX

8. Padronizar clique em câmera (palco vs prévia) e rótulos de ação.
9. Testes de acessibilidade por teclado.
10. Testes automatizados de transição e derivadas.

---

## 8. Decisões em aberto

1. Sair da mesa deve **manter o take** ou voltar para a Cena (comportamento atual)?
2. AUTO/CUT durante transição: **ignorar** ou enfileirar o próximo destino?
3. Vertical e retorno do convidado devem mostrar o mesmo dissolve ou corte seco é aceitável?
4. F1–F6 na mesa: manter “só prévia” ou ter um atalho explícito para cortar a cena?
5. Cena com Solo ativo: limpar o solo ao entrar na mesa ou rotular “Cena (solo)”?
6. Teclas Espaço/Enter: atalho global ou respeitar o controle focado?

---

## 9. Veredito EGM

A mesa de corte tem uma base boa: o contrato `take`/`pvw`/`stage` é claro, o áudio do take está
correto e o T-bar manual foi pensado. O problema não é “o corte não funciona”; é **o estado durante a
transição e a diferença entre as saídas**.

Os dois riscos que precisam de correção antes de evoluir:

- **F1**: repetir CUT/AUTO no meio de um fade pode voltar o PGM para a Cena;
- **F3**: os atalhos globais impedem o uso normal de botões pelo teclado.

Depois disso, alinhar as derivadas (F2) e o contrato dos dois modos (F5/F6/F7) evita que a mesa seja
tecnicamente correta e continue imprevisível para o operador.


---

## 10. Correções implementadas localmente (2026-11-03)

| Achado | Correção | Teste |
|---|---|---|
| F1 | `canTake()` bloqueia qualquer `comp.fade`; teclas repetidas ignoradas com `e.repeat` | 2º AUTO não altera mais `S.take`; botões desabilitados durante a transição |
| F2 | `syncDerivedTransition()` copia o fade do PGM para retorno do convidado e vertical | `VerticalView` com AUTO de 1000 ms: `fade=true`, `ms=1000` |
| F3 | Atalhos ignoram `button/a/[role=button]`; clique de mouse dá blur | Foco em AUTO + Espaço executou AUTO (`fade=true`), não CUT |
| F4 | `e.repeat` em `onKey` e nas cenas | Segurar a tecla não repete a troca |
| F5 | Aviso ao desligar a mesa com take ativo | Toast confirmado: “Mesa desligada: Host saiu do ar; o PGM voltou para a Cena.” |
| F6 | `Shift+F1..F6` aplica a cena direto no PGM | Cena salva + `apply(0,{cut:true})`: `S.take=null`; caminho de teclado usa o mesmo `apply` |
| F7 | Rótulo `Cena (solo: X)` quando há solo | `label(null)` e cartão testados: “Cena (solo: Host)” |
| F8 | CUT/AUTO desabilitados sem ação; `render()` reabilita quando o fade termina | Botões `disabled=true` no AUTO e `false` no fim |
| F10 | `e.repeat` nas cenas | Incluído no teste de repetição |
| T-bar | Solta no meio: a alavanca **fica na posição**, o fade manual continua parado; próximo arrasto retoma dali. Ao chegar na ponta, completa; ao voltar ao início, reverte | Teste com mouse: 50% → `handle=50%`, `fade.p=0.5`; continuar até 0% → `fade=null`, `handle=0%` |

**Ainda em aberto:** F9 (semântica de clique palco × prévia), que é uma decisão de UX, e a possibilidade de o operador escolher manter o take ao sair da mesa (hoje o comportamento é avisado e documentado).

**Build local:** `dist/CastDeck.exe` 190.838.272 bytes; SHA-256
`3b3faa63262d45e42e9fc01a9a3ecb682322fd4e9bea29494f3225ceb019ba2e`. Nada foi publicado na VPS/GitHub.
