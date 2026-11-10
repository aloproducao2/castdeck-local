# EGM — GC Designer + Template Studio (elementos, templates próprios e automação)

> **Status:** **MVP-A implementado** (painel Operador) e **MVP-B parcial** (Template Studio em modal) na
> **1.3.17 local**. Automação/regras/canais múltiplos ainda são plano.
> **Data:** 2026-11-02
> **Objetivo:** substituir o formulário atual de GC por um **editor visual em modal** onde o usuário
> **monta o próprio template com elementos prontos** (arrasta, alinha, estiliza), salva para reutilizar e
> liga **automação** (dados, regras e gatilhos) — inspirado no **GT Title Designer** do vMix, sem perder
> o fluxo rápido “digita o nome → vai ao ar”.
>
> **Público:** o **criador** (monta templates) e o **operador** (preenche e coloca no ar). São dois modos
> do mesmo modal.

---

## 1. Concept brief (6 lentes)

| Lente | Pergunta | Direção |
|---|---|---|
| **Operação** | O que o operador faz no ar? | Cria/edita GC em segundos, coloca no ar, troca texto ao vivo, tira do ar. |
| **Criação** | O que o criador quer fazer? | Montar **o próprio template** com elementos prontos, sem depender de código ou de nós. |
| **Automação** | O que pode acontecer sozinho? | Puxar dados, mostrar/esconder elementos por condição, entrar/sair por gatilho ou horário. |
| **Cognição** | O que ele precisa entender de imediato? | O GC é composto por **camadas** (texto, logo, barra), não por “campos mágicos”. |
| **Velocidade** | Como fazer sem abrir 30 controles? | Modelos prontos + campos de dados no topo; o resto fica no inspetor. |
| **Confiança** | Como saber que está certo? | Prévia 16:9 grande, área de segurança, e o mesmo renderizador do PGM. |
| **Consistência** | Onde isso vive? | Um único **GC Designer**; Jornal/Banners viram atalhos para modelos e lista. |
| **Escala** | Como crescer sem virar um editor pesado? | MVP de camadas + modelos; animações e canais múltiplos em fases. |

**Princípio:** o modal deve ser tão rápido quanto o formulário atual para o caso simples, e tão poderoso
quanto o GT Title Designer para o caso “quero um GC diferente”.

---

## 1.1 Brainstorm EGM — template próprio + automação

### O que é um “template” neste produto

> **Template = elementos + slots de dados + regras + animação + metadados.**
> O criador monta uma vez; o operador só preenche os slots e aperta “No ar”.

| Ideia | Descrição | Valor | Fase |
|---|---|---|---|
| **Kit de elementos** | Barras, placas, chips de etiqueta, faixas, linhas, ícones, molduras, fundos, logo, QR, relógio. | Monta sem desenhar do zero. | MVP |
| **Arrastar e ajustar** | Elemento entra no canvas, move, redimensiona, alinha, trava, ordena. | Sensação de “desenhar”. | MVP |
| **Biblioteca pessoal** | Templates salvos com nome, categoria, miniatura e “duplicar”. | Reuso e padronização. | MVP |
| **Slots de dados** | Cada texto é um campo (`{{nome}}`, `{{cargo}}`, `{{manchete}}`). | Operador não mexe no design. | MVP |
| **Dados automáticos** | Convidado, função, título do RSS, placar, relógio, contagem. | Menos digitação/erro. | V1 |
| **Regras condicionais** | “Se etiqueta vazia → esconder chip”; “se texto > 32 chars → reduzir fonte”. | Robustez sem operador. | V1 |
| **Gatilhos** | Ao entrar no ar, ao convidado entrar, ao marcar ponto, no horário. | Automação de verdade. | V1 |
| **Animação por elemento** | Entrada/saída: slide, fade, wipe, scale; atraso em cascata. | Acabamento. | V1 |
| **Variações do mesmo template** | “Lower third claro/escuro”, “compacto/estendido”. | Marca consistente. | V2 |
| **Importar/exportar** | JSON do template (e da marca) para outro PC/equipe. | Portabilidade. | V2 |
| **Preview com dados reais** | Testar com o convidado/RSS antes de ir ao ar. | Confiança. | V1 |
| **Modo simplificado** | O operador vê só os slots + No ar; o design fica bloqueado. | Evita acidente no ar. | MVP |

### O que **não** é o objetivo (para não virar Photoshop)

- Editor de vetores livre com canetas/bezier.
- Aninhamento infinito de grupos.
- Keyframes por propriedade no MVP.
- Plugins de terceiros.
- Substituir o After Effects para peças complexas.

O foco é **GC de broadcast**: lower third, manchete, crédito, rodapé, identificação — rápidos de montar
e seguros no ar.

---

## 2. Estado atual (auditoria)

### 2.1 O que existe hoje
- **Jornal** (`journal.js`): formulário no painel lateral com modelo **Entrevistado/repórter** e
  **Hard news**; campos Nome/Cargo, etiqueta, posição, logo (marca/outro), tempo e cor; preview 640×360;
  lista de GCs salvos; botões “Colocar no ar”, “Atualizar no ar”, “Tirar do ar”.
- **GCs salvos** são `S.banners` com `style:'news'`; também aparecem em **GCs & Letreiro**.
- **Renderização** (`overlays.js`): dois desenhos fixos (`drawHardNews` e o clássico), sem camadas.
- **Edição ao vivo** já existe via “Atualizar no ar”, mas o formulário some no meio do painel.

### 2.2 Dores
1. **É um formulário, não um editor**: não dá para mover a barra, trocar fonte, alinhar ou criar um layout novo.
2. **Dois modelos apenas**: qualquer GC fora do padrão exige gambiarra (banner genérico).
3. **Duplicação de lugar**: Jornal e GCs & Letreiro listam o mesmo objeto; o usuário não sabe qual é “o certo”.
4. **Sem camadas**: logo/tag/texto competem por espaço fixo; não há noção de hierarquia.
5. **Prévia pequena e sem área de segurança**: o que parece bom no painel pode cortar no PGM.
6. **Sem animação**: entra/sai “seco”; o vMix tem in/out por camada.
7. **Sem undo/redo**: editar ao vivo é irreversível.
8. **Sem canais**: um GC por vez; o vMix tem Title 1–4.
9. **Sem dados vinculados**: nome/cargo precisam ser digitados; não puxa do convidado/RSS.

---

## 3. Referência: o que vale copiar do vMix GT (e o que não vale)

| Recurso do GT Title Designer | Trazer? | Por quê |
|---|---|---|
| Canvas 16:9 com safe area | **Sim** | Evita corte em TVs/streams. |
| Camadas (texto, imagem, forma) | **Sim** | É o coração do editor. |
| Templates/presets | **Sim** | Velocidade no ar. |
| Inspetor de propriedades | **Sim** | Organiza sem poluir. |
| Animação in/out | **Sim (V1)** | Acabamento profissional. |
| 4 canais de título | **Sim (V1)** | Prévia + programa + “próximo”. |
| Edição ao vivo | **Sim** | Já temos a base; precisa ser melhor. |
| Data binding (guests, RSS) | **Sim (V1.5)** | Evita digitação e erro. |
| Editor de curvas/KEY em detalhe | **Não no MVP** | Complexidade alta, pouco uso diário. |
| Árvore de camadas profunda/aninhamento | **V2** | Grupos simples bastam no início. |
| Importar projeto .gtzip | **Não** | Formato proprietário; nosso export/import JSON é suficiente. |

---

## 4. Arquitetura de informação do modal

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  GC Designer — [Nome do GC]          [Desfazer] [Refazer]   [Salvar] [✕]     │
├────────────────┬──────────────────────────────────────────┬──────────────────┤
│ MODELOS        │                                          │ INSPETOR         │
│ ▸ Lower third  │            CANVAS 16:9                   │ ▸ Camada         │
│ ▸ Hard news    │      ┌──────────────────────────┐        │   Texto          │
│ ▸ Nome/strap   │      │  área de segurança       │        │   Fonte/tamanho  │
│ ▸ Rodapé       │      │   ┌───────────────┐      │        │   Cor/contorno   │
│ ▸ Full frame   │      │   │  sua arte     │      │        │   Alinhamento    │
│ ▸ Bug          │      │   └───────────────┘      │        │ ▸ Animação       │
│                │      └──────────────────────────┘        │ ▸ Dados          │
│ CAMADAS        │  [−] 100% [+]   [16:9] [9:16]             │ ▸ Posição        │
│ ● Texto nome   │                                          │                  │
│ ● Cargo        │  DADOS RÁPIDOS                           │                  │
│ ● Barra        │  Nome: [__________] Cargo: [_________]   │                  │
│ ● Logo         │  Etiqueta: [AO VIVO ▾]  Duração: [10s]   │                  │
├────────────────┴──────────────────────────────────────────┴──────────────────┤
│ [Prévia PVW] [Colocar no ar] [Atualizar] [Tirar do ar]   Canal: [1][2][3][4] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Regiões
1. **Topo:** nome do GC, undo/redo, salvar, fechar. Estado “alterações não salvas”.
2. **Esquerda:** biblioteca de **modelos** + **árvore de camadas** (visibilidade, lock, ordem).
3. **Centro:** canvas 16:9 (ou 9:16 quando aplicável), régua, safe area, zoom, snap, seleção e handles.
4. **Direita:** inspetor contextual da camada selecionada; abas **Conteúdo / Estilo / Animação / Dados**.
5. **Faixa inferior:** dados rápidos (nome, cargo, etiqueta, duração), botões de ar e **canais 1–4**.

### 4.2 Princípios de interação
- **Duplo clique** no canvas edita o texto inline.
- **Arrastar** move; **handles** redimensionam; **Shift** mantém proporção; **Alt** duplica ao arrastar.
- **Snap** em margens, centro e outras camadas; guias rosas.
- **Delete** remove camada; **Ctrl+Z/Y** desfaz/refaz (mín. 30 passos).
- **Ctrl+D** duplica; **Ctrl+C/V** copia/cola estilo.
- **Tab** alterna camadas; **Esc** fecha o modal (pedindo confirmação se não salvo).
- **Enter** no campo de nome aplica e mantém o foco no canvas.

### 4.3 Dois modos (mesmo modal, públicos diferentes)

| Modo | Para quem | O que mostra | O que bloqueia |
|---|---|---|---|
| **Criador** (Design) | quem monta o template | canvas, biblioteca de elementos, camadas, inspetor, regras, automação | nada |
| **Operador** (Preencher) | quem está no ar | prévia + slots de dados + botões de ar | move/estiliza camadas (design travado) |

- Alternância no topo: **“Editar design”** (criador) × **“Preencher”** (operador).
- Template salvo abre no modo Operador por padrão; “Editar design” pede confirmação se o GC estiver no ar.
- No modo Operador, campos obrigatórios vazios ficam destacados e o botão de ar avisa o que falta.

### 4.4 Ferramentas de desenho do canvas

| Ferramenta | Comportamento |
|---|---|
| Canvas | 1920×1080 (16:9), 1080×1920 (9:16) e 1080×1080 (1:1) |
| Régua e guias | guias arrastáveis; snap magnético |
| Grade | 10 px ligável; “snap to grid” |
| Área de segurança | 5%/10% com aviso quando um texto encosta |
| Alinhar/distribuir | esquerda, centro, direita, topo, meio, base; espaçamento igual |
| Ordem (z) | frente/trás, mover uma camada |
| Travar/ocultar | por camada; cadeado na árvore |
| Grupo | agrupar/desagrupar (V1) |
| Multi-seleção | Shift+clique / laço |
| Duplicar | Alt+arrastar ou Ctrl+D |
| Fundo de referência | congelar um frame do PGM atrás do canvas para encaixar o GC |
| Zoom | 25–200%, “caber na tela” |
| Histórico | undo/redo de 30+ passos |

### 4.5 Biblioteca de elementos prontos

Elementos entram por **clique** ou **arrastar** para o canvas. Todos são editáveis (não são imagens fixas).

| Categoria | Elementos | Propriedades principais |
|---|---|---|
| **Fundos** | barra sólida, barra gradiente, placa, faixa de largura total, moldura, painel translúcido | cor/gradiente, raio, opacidade, sombra |
| **Texto** | nome, cargo, manchete, linha de apoio, etiqueta/chip, crédito, número, relógio, contagem | fonte, tamanho, peso, cor, contorno, sombra, alinhamento, caixa alta |
| **Imagens** | logo da marca, upload, avatar do convidado, QR, ícone | ajuste (contain/cover), raio, borda, opacidade |
| **Formas** | retângulo, linha, divisor, círculo, seta, destaque | cor, espessura, raio |
| **Compostos** | lower third, hard news, nome/strap, rodapé, bug, full frame | herdam os elementos acima |

Cada elemento tem **slot** opcional (`{{nome}}`, `{{cargo}}`, `{{tag}}`) e pode ser marcado como
**obrigatório**, **oculto se vazio** ou **auto-ajustável**.

### 4.6 Templates do usuário

**Ciclo de vida**

```
Começar de um modelo do sistema  ─┐
Começar em branco               ─┼─▶  Editar design  ─▶  Salvar como template
Duplicar um template existente  ─┘                              │
                                                               ▼
                                  Biblioteca (nome, categoria, miniatura)
                                                               │
                                      ┌────────────────────────┴──────────────┐
                                      ▼                                       ▼
                             Usar no ar (instância)                  Editar / duplicar / exportar
```

- **Template** = design + slots + regras + animação. **Instância** = template + dados preenchidos.
- Todo template salvo ganha **miniatura automática** do canvas, **categoria** e **tags**.
- Categorias iniciais: Jornalismo, Entrevista, Esporte, Crédito, Rodapé, Personalizado.
- “Salvar como template” não altera o GC que está no ar (cria uma versão nova).
- Template pode ser **bloqueado** (somente leitura) para equipe.
- Um template pode ter **variações** (ex.: claro/escuro, compacto/estendido) — V2.

### 4.7 Depois do template criado: o painel do operador

O template pronto **não** deve abrir o editor. Ele abre no **painel de operação**, que vira o centro do GC:

```
┌ GCs & Letreiro ───────────────────────────────────────────────────────────────┐
│ CANAIS   [1  PVW  Maria Silva] [2  vazio] [3  NO AR  Manchete] [4  vazio]     │
│          [Preparar] [Atualizar no ar] [Tirar do ar] [Próximo ▸]               │
├──────────────────────────────┬────────────────────────────────────────────────┤
│ TEMPLATES                    │ GC SELECIONADO — modo Operador                 │
│ 🔎 [buscar…]                 │ ┌──────────────────────────────────────────┐   │
│ ★ Lower third                │ │             prévia 16:9                 │   │
│   Hard news                  │ │        (com safe area e dados)           │   │
│   Nome/strap                 │ └──────────────────────────────────────────┘   │
│   Meu GC de entrevista       │ Nome  [Maria Silva            ] (do convidado)  │
│   + Novo template            │ Cargo [Repórter — Brasília    ]                │
│                              │ Etiqueta [AO VIVO ▾]  Duração [10 s ▾]         │
│                              │ ⚠ 1 campo obrigatório vazio                    │
│                              │ [Preparar no PVW] [Colocar no ar] [Salvar]     │
├──────────────────────────────┴────────────────────────────────────────────────┤
│ FILA   ▸ Maria (pronto)  ▸ Manchete (no ar)  ▸ Crédito (rascunho)  [+ Adicionar]│
│ AUTOMAÇÃO  ● convidado  ● RSS  [pausar]   último: “guest-join → Maria”         │
└──────────────────────────────────────────────────────────────────────────────┘
```

**O que muda em relação ao painel atual**

| Antes | Depois |
|---|---|
| Formulário único no Jornal | **Biblioteca de templates** + **editor de instância** |
| “Salvar na lista” | “Salvar como template” / “Salvar GC” / “Duplicar” |
| Um GC por vez | **4 canais** com estado PVW / NO AR / vazio |
| Texto digitado do zero | **Slots** com auto-preenchimento (convidado, RSS) e validação |
| Preview pequena no meio do formulário | **Prévia fixa** no topo do GC selecionado |
| Sem fila | **Fila de GCs preparados** com reordenar e “próximo” |
| Automação invisível | **Chips de automação** + pausar + último gatilho |

**Estados de cada canal**

| Estado | Cor | Ações |
|---|---|---|
| Vazio | cinza | escolher template |
| Rascunho | amarelo | preencher, preparar |
| Preparado (PVW) | azul | atualizar, levar ao ar |
| No ar (PGM) | vermelho | atualizar ao vivo, tirar |
| Erro (slot obrigatório) | vermelho tracejado | corrigir campo |

**Fluxo do operador (caso 80%)**

1. Abre **GCs & Letreiro**.
2. Clica no template favorito (ou já vem o último usado).
3. Os slots vêm preenchidos do convidado/RSS quando disponíveis.
4. Confere a prévia e aperta **Colocar no ar** (ou `Enter`).
5. Para corrigir: edita o slot, vê a prévia e aperta **Atualizar no ar** (sem piscar).
6. **Tirar do ar** ou deixa a duração automática encerrar.

**Regras do modo Operador**

- Design **travado**; “Editar design” abre o modal com aviso se o GC estiver no ar.
- Nada de modal durante a operação: o painel precisa ficar visível o tempo todo.
- Atualização no ar é **explícita** (“Atualizar no ar”), nunca a cada tecla.
- Botão **Reverter** volta ao último estado que foi ao ar.
- No celular/controle remoto: só canais + slots + preparar/take/out.

### 4.8 O que acontece com Jornal e Banners

- **GCs & Letreiro** vira a casa única: abas **Ao vivo · Templates · Letreiro/RSS**.
- **Jornal** deixa de ser um formulário separado e vira:
  - um **template de categoria “Jornalismo”** (hard news / entrevista), e
  - um atalho **“Novo GC de notícia”** que abre o Designer já no modelo jornalístico.
- **Banners** genéricos continuam existindo para GCs simples/legados, mas a lista de GCs de jornalismo
  sai de lá (sem duplicação).
- O **letreiro/RSS** fica na aba Letreiro/RSS do mesmo painel, com o editor de GC ao lado.

### 4.9 Automação visível no painel

- Chips no rodapé: `● convidado`, `● RSS`, `● horário`, cada um com **pausar/retomar**.
- “Último gatilho” em texto: `guest-join → Maria Silva (há 2 s)`.
- Se uma regra for aplicada, um selo discreto no slot: “auto”.
- O operador pode **sobrescrever** um valor automático; o campo fica marcado “manual” e a automação não
  volta a mexer nele até “reverter para automático”.
- Log curto (últimas 20 ações) acessível por “Ver log”.

---

## 5. Modelo de dados proposto

```json
{
  "id": "gc_abc123",
  "name": "Entrevistado — padrão",
  "template": "lower-third",
  "channel": 1,
  "duration": 10,
  "position": "bl",
  "canvas": { "w": 1920, "h": 1080, "safe": 5 },
  "variables": { "name": "Maria Silva", "role": "Repórter — Brasília", "tag": "AO VIVO" },
  "schema": {
    "name": { "type": "text", "required": true, "max": 40, "autoFit": true },
    "role": { "type": "text", "required": false, "max": 60 },
    "tag":  { "type": "text", "required": false, "options": ["AO VIVO", "URGENTE", "ENTREVISTA"] },
    "logo": { "type": "image", "required": false }
  },
  "rules": [
    { "if": "empty(vars.tag)", "then": { "hide": ["l4"] } },
    { "if": "length(vars.name) > 32", "then": { "font": { "l2": 38 } } }
  ],
  "triggers": [
    { "on": "guest-join", "data": { "name": "guest.name", "role": "guest.role" } },
    { "on": "rss-new", "data": { "name": "rss.title" } }
  ],
  "layers": [
    { "id": "l1", "type": "shape", "shape": "bar", "x": 80, "y": 820, "w": 900, "h": 120,
      "fill": "#7c5cff", "radius": 10, "opacity": 1 },
    { "id": "l2", "type": "text", "role": "name", "text": "{{name}}",
      "x": 110, "y": 835, "w": 840, "h": 54, "font": "Inter", "size": 46, "weight": 800,
      "color": "#ffffff", "align": "left", "valign": "middle", "case": "none" },
    { "id": "l3", "type": "text", "role": "role", "text": "{{role}}",
      "x": 110, "y": 892, "w": 840, "h": 34, "font": "Inter", "size": 26, "weight": 600,
      "color": "#ffffff", "align": "left" },
    { "id": "l4", "type": "text", "role": "tag", "text": "{{tag}}",
      "x": 80, "y": 760, "w": 180, "h": 42, "fill": "#ef4444", "color": "#fff", "size": 20 },
    { "id": "l5", "type": "image", "role": "logo", "src": "brand", "x": 1600, "y": 820, "w": 240, "h": 120 }
  ],
  "animation": {
    "in":  { "type": "slide-up", "ms": 350, "ease": "out-cubic" },
    "out": { "type": "fade", "ms": 250 },
    "perLayer": false
  }
}
```

**Compatibilidade:** GCs antigos (`style:'news'`) são migrados para `template:'lower-third'`/`'hard-news'`
com os campos atuais; o renderizador antigo continua como fallback até a migração terminar.

### 5.1 Slots e fontes de dados

| Slot | Tipo | Fonte | Exemplo |
|---|---|---|---|
| `{{name}}` | texto | manual, convidado, planilha | “Maria Silva” |
| `{{role}}` | texto | manual, convidado | “Repórter — Brasília” |
| `{{tag}}` | lista | manual, regra | “AO VIVO” |
| `{{headline}}` | texto | RSS, manual | manchete do G1 |
| `{{score.home}}` / `{{score.away}}` | número | placar | “2 × 1” |
| `{{clock}}` | relógio | sistema | “21:47” |
| `{{countdown}}` | número | timer | “00:30” |
| `{{logo}}` | imagem | marca, upload | PNG da emissora |
| `{{avatar}}` | imagem | convidado | foto/iniciais |

- Sintaxe `{{fonte.campo}}`; fallback configurável (`{{name | "Convidado"}}`).
- **Auto-fit:** reduz a fonte até caber (mínimo configurável) ou aplica reticências.
- Slot obrigatório vazio bloqueia o “No ar” com aviso claro.
- Dados automáticos são **pré-visualizados** antes de aplicar (nada entra no ar sem confirmação no modo Operador).

### 5.2 Regras condicionais (sem código)

Interface: seleciona elemento → **Adicionar condição** → escolhe campo, operador e ação.

| Condição | Ações possíveis |
|---|---|
| campo vazio / não vazio | ocultar/mostrar elemento, trocar texto |
| texto maior/menor que N | reduzir fonte, quebrar linha, encurtar |
| tag = “URGENTE” | trocar cor da barra, mostrar faixa extra |
| convidado entrou/saiu | preencher nome/cargo, mostrar/ocultar avatar |
| horário entre X e Y | trocar variação (claro/escuro) |

Exemplo visual:

```
SE {{tag}} está vazio
   ENTÃO ocultar chip de etiqueta
SE {{name}} tem mais de 32 caracteres
   ENTÃO fonte do nome = 38 e quebrar em 2 linhas
```

### 5.3 Gatilhos e ações (automação)

| Gatilho | Quando dispara | Ações típicas |
|---|---|---|
| `on-take` | GC entrou no ar | iniciar animação de entrada, agendar saída |
| `on-out` | GC saiu | limpar dados, liberar canal |
| `on-guest-join` | convidado entrou | preencher slots do convidado |
| `on-rss` | novo item no feed | atualizar manchete, marcar “URGENTE” |
| `on-score` | placar mudou | atualizar números e animar destaque |
| `on-time` | horário agendado | entrar/sair automaticamente |
| `on-hotkey` | tecla do operador | próximo GC, variação, entrada/saída |
| `on-scene` | cena/layout mudou | mostrar GC de identificação da cena |

**Ações:** mostrar/ocultar camada, trocar variação, preencher slot, mudar cor/fonte, iniciar animação,
definir duração, ir ao ar, sair do ar, avançar para o próximo da fila.

**Cadeia:** um gatilho pode disparar uma sequência (ex.: entrar → 8 s → atualizar → sair) com **limite
de passos** e cancelamento manual.

### 5.4 Exemplos de automação

1. **Entrevista:** ao entrar no ar, puxa `guest.name`/`guest.role`; se o cargo vier vazio, esconde a segunda
   linha e reduz a barra.
2. **Plantão:** novo item do RSS com “urgente” → GC de hard news entra por 15 s, tag vermelha, depois sai.
3. **Placar:** ao mudar o placar, o bug atualiza os números e pisca o time que marcou.
4. **Crédito:** operador aperta `F9`, o GC usa o nome do convidado ativo e o logo da marca; sai em 8 s.

### 5.5 Automação segura

- **Dry-run:** testar regras/gatilhos com dados de exemplo sem ir ao ar.
- **Log:** “por que esse GC entrou/saiu” (gatilho, regra, horário).
- **Limites:** máximo de regras por template, máximo de passos por cadeia, sem loops.
- **Desfazer:** qualquer ação automática pode ser revertida pelo operador.
- **Modo conservador:** automação desligada por padrão em templates novos; o criador liga explicitamente.

---

## 6. Escopo por fases

### MVP-A — “painel Operador + biblioteca” (primeiro, maior valor)
- **GCs & Letreiro** reconstruído como console de operação: canais, fila, prévia fixa, slots e botões de ar.
- **Biblioteca de templates** com busca, categorias, favoritos e miniatura; último template lembrado.
- **Modo Operador**: preenche slots, valida obrigatórios, prepara no PVW, coloca/atualiza/tira do ar.
- **Regras simples:** ocultar elemento se slot vazio; reduzir fonte se texto longo.
- **Um canal** (Title 1) no MVP-A; migração dos GCs antigos para templates equivalentes.
- **Sem modal nesta etapa**: “Editar design” fica desabilitado/“em breve” ou abre um editor mínimo de campos.
- Meta: GC simples no ar em **< 20 s**, sem abrir modal.

### MVP-B — “Designer em modal” (segundo)
- Modal `GC Designer` aberto pela biblioteca, com **modos Criador/Operador**.
- **Canvas de desenho 16:9:** grade, réguas, safe area, snap, zoom, mover/redimensionar, ordem (z),
  travar/ocultar, alinhar/distribuir, undo/redo, duplicar.
- **Biblioteca de elementos prontos:** fundos, textos, imagens, formas e compostos (lower third, hard news,
  nome/strap, rodapé, full frame, bug).
- **“Começar em branco” + “salvar como template”** com nome, categoria e miniatura.
- **Slots** (`{{name}}`, `{{role}}`, `{{tag}}`, `{{headline}}`) e auto-fit.
- **Inspetor:** fonte, tamanho, peso, cor, contorno, sombra, alinhamento, opacidade, raio, espaçamento.
- Templates do sistema editáveis e “salvar como meu”.

### V1 — “automação de verdade”
- **Construtor de regras** (campo + operador + ação) com dry-run e log.
- **Gatilhos:** on-take/out, guest-join, on-rss, on-score, on-time, on-hotkey, on-scene.
- **Fontes de dados:** convidado, RSS (manchete), placar, relógio/contagem e planilha simples.
- **4 canais** (Title 1–4) com PVW/PGM e “próximo”.
- **Animações in/out** por template e por elemento (slide, fade, wipe, cascata).
- **Variações de template** (claro/escuro, compacto/estendido) e grupos.
- **Editar no ar** sem fechar o modal; preview em PVW.
- **Mais elementos:** ticker como camada, barra de progresso, contagem regressiva, tabela simples.
- **Fontes do sistema + upload WOFF2** e presets da marca.

### V2 — “biblioteca e escala”
- **Export/import JSON** de templates e pacotes de marca.
- **Fila/playlist de GCs** e agendamento (entrar/sair em horário).
- **Editor remoto** no celular (preencher slots e dar take).
- **Versões/histórico** de template e restauração.
- **Variações por marca** (tema claro/escuro automático por horário ou programa).
- **Galeria compartilhada** entre estúdios da mesma instalação.

---

## 7. UX do fluxo rápido (o caso 80%)

1. Operador clica **Novo GC**.
2. Modal abre já com o modelo **Lower third** e o campo **Nome** focado.
3. Digita o nome; o canvas atualiza ao vivo.
4. Digita cargo; escolhe etiqueta.
5. **Enter** ou **Colocar no ar** → GC entra no PGM.
6. Se precisar ajustar: arrasta a barra, muda a cor no inspetor; **Atualizar** aplica no ar.
7. **Salvar** guarda na lista (ou salva automaticamente como “GC sem nome”).

**Meta:** menos de **20 segundos** do clique ao ar no caso simples; **sem abrir o inspetor**.

---

## 8. Regras de layout e renderização

- Canvas interno **1920×1080** (escala para 640×360 na prévia).
- **Safe area** 5% (configurável); nada de texto fora dela sem aviso.
- Snap em: margens, centro, borda de outras camadas, baseline.
- **Posições predefinidas** (6 cantos + centro) continuam existindo, mas movem o **grupo** selecionado.
- Renderização usa o **mesmo** `drawTitle()` do PGM (uma fonte de verdade), com cache de camadas estáticas.
- Texto: `measureText` + quebra de linha; nunca cortar sem reticências explícitas.
- Logo: `contain`, nunca distorcer; fallback para marca.
- **Sem flicker** ao atualizar no ar: troca de estado no próximo frame, sem recriar o canvas.

---

## 9. Integração com o que já existe

| Área | Mudança |
|---|---|
| `S.titles` | Nova coleção; migração de `S.banners` com `style:'news'`. |
| `journal.js` | Vira atalho: “Criar GC” abre o modal com modelo jornalístico; lista permanece. |
| `studio.js` (GCs & Letreiro) | Lista unificada de títulos; “Novo GC” abre o modal. |
| `overlays.js` | `drawBanner` legado permanece; novo `drawTitle` por camadas. |
| `compositor.js` | Desenha canais ativos (`S.titleChannels[1..4]`) com animação. |
| `banners` genéricos | Continuam para GCs simples/legados; não são removidos no MVP. |
| Controle remoto | Fase V2: editar texto do GC ativo pelo celular. |
| Persistência | `saveStudio()` salva `S.titles` + `S.titleChannels`; migração automática na carga. |

---

## 10. Acessibilidade e mobile

- Todos os botões com `title`/`aria-label`; foco visível.
- Modal navegável por teclado; **Esc** fecha; **Tab** preso dentro do modal.
- Canvas com alternativa textual (lista de camadas) para leitor de tela.
- No celular: o editor abre em modo **somente dados** (nome/cargo/etiqueta) + prévia; edição de camadas
  fica para desktop/tablet. O controle remoto continua focado no ao vivo.
- Contraste mínimo AA nos textos e controles.

---

## 11. Riscos e decisões a polir

| Risco | Mitigação |
|---|---|
| Editor pesado assustar o operador | Abrir no modelo + campo nome; inspetor colapsado. |
| Migração quebrar GCs salvos | Normalizador + fallback do renderizador antigo; testes com GCs reais. |
| Duplicar Jornal/Banners | Uma lista só; Jornal vira “modelo” e atalho. |
| Fontes externas não carregarem | Lista de fontes do sistema + upload opcional; fallback Inter. |
| Canvas 1920×1080 custar CPU | Cache de camadas estáticas e render sob demanda. |
| Edição ao vivo piscar | Atualização no próximo frame; sem recriar elemento. |
| Escopo infinito (virar Photoshop) | Fases fechadas; MVP sem curvas/aninhamento. |
| Template do usuário quebrar no PGM | Safe area + validação de slots + preview com dados reais. |
| Automação disparar na hora errada | Dry-run, log, modo conservador e botão de pânico “desligar automação”. |
| Dados automáticos errados (RSS/convidado) | Prévia obrigatória antes do take no modo Operador. |
| Muitos templates viram bagunça | Categorias, busca, miniaturas e “favoritos”. |
| Export/import incompatível entre versões | Campo `schemaVersion` + migrador no import. |

---

## 12. Critérios de aceite (MVP)

- [ ] Criar um lower third e colocá-lo no ar em **< 20 s**, só com nome/cargo.
- [ ] **Montar um template próprio do zero** arrastando elementos, alinhando com snap e salvando com
      nome/categoria/miniatura.
- [ ] Reabrir o template salvo no modo **Operador** e ir ao ar preenchendo só os slots.
- [ ] Painel Operador mostra **estado de cada canal** (vazio/rascunho/PVW/NO AR) sem abrir modal.
- [ ] Colocar no ar e atualizar um GC no painel em **≤ 2 cliques** e sem piscar.
- [ ] Fila de GCs preparados com reordenar e “próximo”.
- [ ] Automação visível, pausável e sobrescrevível pelo operador.
- [ ] Mover/redimensionar camadas com snap e safe area visível; travar/ocultar e ordenar.
- [ ] Trocar texto com o GC no ar **sem piscar** e sem sair do ar.
- [ ] Regra simples “se slot vazio, ocultar elemento” funciona no ar.
- [ ] Undo/redo de pelo menos 30 ações.
- [ ] Salvar, duplicar, excluir e reabrir GC sem perder estilo.
- [ ] GCs antigos abrem com o layout equivalente.
- [ ] Nenhum botão sem nome acessível; modal operável por teclado.
- [ ] Render do PGM idêntico à prévia (mesma função).
- [ ] Sem regressão no letreiro/RSS e nos banners genéricos.

---

## 13. Perguntas para o usuário (polir o plano)

1. O MVP deve ter **4 canais** ou começamos com **1** e adicionamos depois?
2. Quais **elementos** são indispensáveis na biblioteca inicial? (sugestão: barra, placa, chip, nome, cargo,
   manchete, logo, upload, avatar, linha, moldura, relógio, QR)
3. Quais **modelos do sistema** vêm prontos? (sugestão: lower third, hard news, nome/strap, rodapé, full frame)
4. O usuário pode **desenhar livremente** (mover/redimensionar/rotacionar) ou só **encaixar elementos em
   posições**?
5. O MVP já salva **template próprio** com nome/categoria/miniatura, ou primeiro só edita o GC atual e
   “salvar como” na V1?
6. Automação no MVP é só **“ocultar se vazio / auto-fit”** ou você já quer **gatilhos** (convidado, RSS,
   horário) no primeiro release?
7. Os dados automáticos (convidado/RSS/placar) entram no MVP ou na V1?
8. A edição ao vivo deve acontecer **no PGM** ou primeiro em **PVW** com TAKE?
9. Quer **upload de fontes** (WOFF2) ou basta a lista de fontes do sistema?
10. O modal deve abrir **por cima do estúdio** (como hoje) ou em **janela separada** (como o console de replay)?
11. Template pode ser **compartilhado/exportado** para outro PC já no MVP ou fica para a V2?
12. O modo Operador deve **esconder** o design por completo (à prova de acidente) ou permitir ajustes rápidos?

---

## 15. Estado da implementação (1.3.17 local)

### 15.1 Entregue

**Painel Operador (GCs & Letreiro)**
- Bloco **GC / Template Studio** no topo do painel.
- Cartões de templates (modelos do sistema + do usuário), com seleção.
- Prévia 16:9 + campos Nome, Cargo, Manchete (quando o template tem), Etiqueta e Duração.
- **Colocar no ar**, **Atualizar no ar** (sem reiniciar a animação) e **Tirar**.
- Duração automática (5/8/10/15/30 s ou manual).
- Botão **Novo template** e **Editar design**.

**Template Studio (modal)**
- Biblioteca de elementos: **barra/forma**, **texto**, **etiqueta** e **logo**.
- Canvas 960×540 com **arrastar** as camadas, seleção e área de segurança.
- Lista de camadas e inspetor: campo (`name/role/tag/headline`), X/Y, largura/altura, tamanho, cor.
- **Salvar template** com nome, **duplicar** e **excluir** (modelos do sistema viram cópia “(meu)”).
- **Undo/redo** de 30 passos, **snap em grade de 10 px** (Shift libera) e **duplicar camada**.
- **Alças de redimensionamento** nos 8 pontos da camada selecionada: clicar e arrastar a alça para mudar
  largura/altura na hora (cursor muda para resize).
- **Undo coalescido:** arrastar/redimensionar grava **um passo por gesto** (no final); digitar/ajustar no
  inspetor grava um passo após **450 ms de pausa**, não a cada pixel/tecla.
- **Camadas:** olho (ocultar), cadeado (travar no canvas), subir/descer z-order e **alinhar** à área de
  segurança (esquerda/centro/direita/topo/meio/base).
- **Teclado:** setas movem 1 px (Shift 10 px); **Ctrl+D** duplica a camada selecionada.
- **Acordeões (1.3.26):** o painel separa **GC / Template Studio**, **Banners** e **Letreiro & RSS**; o ticker e
  o RSS saíram do criador de templates. Cada seção abre/fecha e o estado fica salvo em
  `localStorage` (`castdeck.gcsec.*`). No designer, **Adicionar elemento**, **Camadas** e **Regras** também
  são acordeões.
- Atalhos: Ctrl+Z/Y, Delete remove a camada selecionada.
- **Validação no Operador:** nome/manchete vazio mostra aviso e bloqueia o “No ar”.
- **Auto-fit:** a fonte reduz até caber na caixa antes de aplicar reticências.
- **Regras condicionais:** vazio/preenchido/maior que → ocultar, mostrar ou reduzir fonte de uma camada;
  atalho “Ocultar se o campo estiver vazio” por camada. Persistidas no template e aplicadas na prévia e no PGM.
- **Dados automáticos:** botões **Do convidado** e **Do RSS** no Operador; template pode marcar
  **Auto convidado** e **Auto RSS** — ao entrar um convidado ou atualizar o feed, o slot é preenchido.
- **Gatilhos já ligados:** `guest-join` e `on-rss` (preenchem dados) e **TAKE opcional** por template
  (“TAKE convidado” / “TAKE RSS”) quando o operador marca.
- **Agendamento:** hora + template + duração no painel; persistido em `S.brand.gcSchedule`; dispara uma vez
  por dia por horário e respeita a duração (0 = manual).
- **Biblioteca:** miniatura renderizada de cada template, busca por nome, filtro por categoria,
  favoritos (★) e categoria/favorito definidos no designer.
- **Último template usado** é lembrado ao reabrir o estúdio (`S.brand.lastGcTemplate`).
- **Revisão de layout (1.3.23):** campos do Operador aparecem só se o template usa (`nome/cargo/manchete/etiqueta`);
  painel compacto (prévia + campos lado a lado quando há largura), agendamento em `<details>`;
  designer com rodapé em duas linhas e três colunas responsivas; sem overflow horizontal.
- **Correções:** título do GC de manchete usa a manchete (não o nome antigo); excluir template não deixa
  seleção órfã; editor de template do sistema sempre cria cópia “(meu)”.
- Modelos iniciais: **Lower third**, **Hard news**, **Nome / strap**.

**Renderização e persistência**
- Novo estilo `custom` em `overlays.js`, desenhando as camadas em 1920×1080 e escalando para o canvas.
- O mesmo `drawBanner` alimenta **prévia e PGM**.
- `S.gcTemplates` persistido no estúdio (servidor `store.js`, `studioBody`), com limite de 80 templates.
- Migração: estúdios antigos recebem os modelos do sistema automaticamente.

### 15.2 Testes executados (headless)

| Teste | Resultado |
|---|---|
| Painel mostra 3 modelos + prévia + botão de ar | OK |
| Selecionar Hard news troca campo Manchete | OK |
| Colocar no ar → `comp.banner.style='custom'`, `S.activeBanner='gc:air'` | OK |
| Atualizar no ar troca o título sem reiniciar | OK |
| Tirar do ar → `hiding=true`, `activeBanner=null` | OK |
| Prévia tem pixels brancos (texto desenhado) | 485 px |
| PGM tem pixels brancos com o GC no ar | 5.094 px |
| “Novo template” salva em `S.gcTemplates` | OK |
| Arrastar camada no canvas muda X/Y | OK |
| Recarregar o estúdio mantém os templates | OK |
| Nome vazio → aviso visível e “No ar” desabilitado | OK |
| Nome preenchido → aviso some e “No ar” habilita | OK |
| Adicionar camada → undo volta de 6 para 5 camadas | OK |
| Biblioteca: 3 cartões + 3 miniaturas desenhadas | OK |
| Busca “hard” filtra só Hard news | OK |
| Filtro categoria “Jornalismo” mostra só Hard news | OK |
| Regra “tag vazio → ocultar” esconde a camada no PGM | OK |
| Resolver de regras (unit): vazio esconde; length> altera fonte | OK |
| “Do convidado” preenche nome/cargo nos inputs | OK |
| Template salva `autoGuest`/`autoRss`/`takeGuest`/`takeRss` | OK |
| Agendar para o minuto atual + duração 0 → GC no ar após o tick | OK |
| Agendar com duração 4 s → entra e sai sozinho | OK |
| Hard news: nome/cargo ocultos, manchete visível | OK |
| Lower third: nome/cargo/etiqueta visíveis, manchete oculta | OK |
| Título do GC Hard news usa a manchete | OK |
| Salvar → editar → excluir template sem duplicar/órfão | OK |
| Arrastar alça SE muda largura/altura da camada | 980×132 → 1470×500 |
| Undo imediato após o gesto volta ao tamanho original | 1470×500 → 980×132 |
| Olho oculta camada; setas movem 1 px; alinhar centro | OK |
| Painel em 3 acordeões: Studio / Banners / Letreiro & RSS | OK |
| RSS e ticker dentro de “Letreiro & RSS”, fora do criador | OK |
| Designer em acordeões: Elementos / Camadas / Regras | OK |
| Nenhuma exceção de runtime | OK |

### 15.3 Ainda não implementado (próximas fases)

- Gatilhos on-score/on-scene e hotkeys por template; 4 canais/fila.
- Dados automáticos de convidado/RSS/placar.
- 4 canais e fila.
- Guias inteligentes entre camadas, multi-seleção e grupos.
- Upload de imagens/fontes e avatar.
- Modo Operador “à prova de acidente” no mobile/remote (hoje o painel é desktop).

---

## 14. EGM — “modal + painel novo” é a melhor escolha?

### 14.1 A pergunta

> Vale trocar o formulário atual por **(A) um designer em modal + um painel de operação novo**, ou existe
> uma opção melhor?

### 14.2 Alternativas ponderadas

| # | Alternativa | Descrição |
|---|---|---|
| **A** | **Modal Designer + painel Operador** (proposta) | Cria no modal; opera no painel; uma lista de templates. |
| B | Só evoluir o painel atual | Mais campos, modelos e preview no próprio painel; sem canvas/modal. |
| C | Editor em **janela separada** | Como o console de Replay: janela dedicada, painel só opera. |
| D | Editor **em tela cheia** | Substitui o estúdio enquanto edita. |
| E | **Importar** arte pronta (PNG/vMix) | Sem editor; usuário desenha fora e importa. |
| F | **Híbrido destacável** | Modal agora, destacável em janela na V2. |

### 14.3 Matriz de decisão (pesos)

| Critério | Peso | A | B | C | D | E |
|---|---:|---:|---:|---:|---:|---:|
| Operação ao vivo | 25 | 5 | 3 | 4 | 2 | 2 |
| Curva de aprendizado | 15 | 4 | 5 | 3 | 2 | 4 |
| Uso do espaço (palco visível) | 10 | 4 | 5 | 3 | 2 | 4 |
| Custo de implementação | 15 | 3 | 5 | 2 | 1 | 5 |
| Risco de regressão | 15 | 4 | 5 | 3 | 2 | 3 |
| Mobile/remote | 10 | 4 | 4 | 2 | 2 | 3 |
| Extensibilidade (automação/templates) | 10 | 5 | 2 | 4 | 3 | 1 |
| **Total ponderado** | 100 | **4,20** | **4,10** | 3,10 | 1,95 | 3,10 |

### 14.4 Veredito

**Sim, A é a melhor escolha — mas com uma inversão de prioridade:**

1. **O painel Operador é o produto principal.** É ele que fica aberto durante a live, mostra canais, fila,
   slots e automação. Sem ele, o modal é só um editor bonito que ninguém usa no ar.
2. **O modal Designer é secundário e nunca pode bloquear a operação.** Ele serve para criar/editar
   template fora do ar; ajustes ao vivo acontecem no painel, em “Atualizar no ar”.
3. **Se o orçamento só permitir uma entrega:** entregar primeiro o **painel Operador + biblioteca de
   templates** (B evoluído), e o modal completo depois. O valor percebido vem da operação, não do canvas.

A diferença A (4,20) × B (4,10) é pequena: o modal só se paga se o **painel** for reconstruído junto.
Modal sem painel novo é a pior combinação possível (editor poderoso + operação ruim).

### 14.5 Condições para A continuar sendo a melhor escolha

- O painel abre em **1 clique**, com o último template usado e campos focados.
- Criar e colocar no ar um GC simples continua em **< 20 s**.
- O modal abre **fora do ar** (ou com confirmação), nunca por cima de um take.
- O design de um template no ar fica **travado**; edição de design pausa/avisa.
- Operador consegue **sobrescrever** automação e reverter.
- Mobile/remote tem o fluxo mínimo (slots + take/out), sem canvas.

### 14.6 Quando A **não** seria a melhor escolha

| Cenário | Melhor opção |
|---|---|
| Usuário só usa 1–2 GCs fixos e nunca desenha | **B** — evoluir o painel, sem modal. |
| Equipe grande, templates compartilhados e editados fora do PC de live | **C/F** — editor destacável + export/import. |
| Design feito por designer em outra ferramenta | **E** — importar arte + editor só de dados. |
| Operação em celular/tablet o tempo todo | **B + remote** — sem canvas. |
| Nenhum tempo para o painel novo | **B primeiro**, A depois. |

### 14.7 Decisão registrada (ADR resumido)

- **Decisão:** adotar **A**, com o painel Operador na frente do modal.
- **Confiança:** alta (desenho + matriz), condicionada ao painel.
- **Reavaliar se:** o uso real mostrar que > 80% dos GCs são de um único template, ou que ninguém abre o
  designer depois da primeira semana.
- **Métrica de sucesso:** tempo até o ar, % de GCs criados por template, uso de slots automáticos, erros de
  campo obrigatório, quantos templates o usuário cria por mês.

## 16. EGM — ajustes naturais e undo coalescido (1.3.24)

### 16.1 Pergunta

Como deixar o editor **natural de ajustar** (mover/redimensionar na hora) sem transformar o histórico em
dezenas de passos de 1 px?

### 16.2 Lentes EGM

| Lente | Diagnóstico | Decisão |
|---|---|---|
| **Manipulação direta** | Antes só dava para mover a camada inteira; largura/altura só no inspetor. | **8 alças** na seleção (cantos e meios); arrastar a alça muda o tamanho ao vivo. |
| **Feedback** | O operador não sabia onde pegar. | Cursor muda para resize; alças visíveis; snap de 10 px com Shift livre. |
| **Granularidade do undo** | Cada tecla/px podia virar um passo. | **Um passo por gesto** (pointerup) e **um passo por pausa de 450 ms** no inspetor. |
| **Segurança** | Undo imediato depois de um gesto podia não existir (snapshot atrasado). | Ações estruturais e fim de arraste usam snapshot imediato; digitação usa debounce. |
| **Previsibilidade** | “Desfazer” deve voltar ao estado anterior ao gesto, não ao meio dele. | Snapshot pendente é descartado antes de iniciar arraste/ação e no undo. |
| **Custo** | 30 snapshots × camadas é barato. | Mantido limite de 30 passos. |

### 16.3 Regra final do histórico

1. **Arrastar/mover/redimensionar** → um snapshot no **pointerup**.
2. **Digitar/ajustar no inspetor** → snapshot após **450 ms sem mudanças**.
3. **Adicionar/duplicar/excluir camada ou regra** → snapshot imediato.
4. **Desfazer/refazer** → cancela snapshot pendente e volta ao passo anterior.
5. **Shift** durante o arraste → movimento fino (sem snap de 10 px).

### 16.4 Testes

| Teste | Resultado |
|---|---|
| Alça SE arrastada 40×30 px muda w/h | OK (980×132 → 1470×500) |
| Undo logo após o gesto | Volta a 980×132 |
| Várias teclas seguidas no inspetor | Um único passo após a pausa |
| Exceções | 0 |


---

## Template Studio em tela separada (2026-11-04)

O editor abre em tela cheia, com canvas central, paleta, camadas e inspetor. O seletor de cor tem paleta,
botão **Marca**, HEX, picker nativo e recentes; nomes de camada e campos extras são derivados do template.

## Regras 2.0 e janela separada (2026-11-04)

- Regras com operadores `empty`, `notempty`, `equals`, `notequals`, `contains`, `notcontains`,
  `startswith`, `endswith`, `length>`, `length<`, `gt` e `lt`.
- Ações: ocultar, mostrar, fonte, cor do texto, fundo e opacidade.
- Condição e ação têm valores independentes (`cond`/`act`), mantendo `value` para templates antigos.
- Qualquer camada pode ser destino; resumo em linguagem natural e duplicação de regra.
- Desktop: editor em janela separada (`/template-studio.html`) com o estúdio visível; mobile/fallback em tela cheia.

## Templates de leilão e QR (2026-11-04)

- **Leilão — Premium:** layout full frame inspirado em transmissões de leilão agro: lote, peso médio,
  R$/kg, R$/@, item, contato, lance, pagamento, vendedor, relógio e QR.
- **Leilão — Compacto:** lower third econômico.
- Nova camada **QR Code** (link no template) desenhada no canvas.

## Variantes 9:16 (2026-11-04)

- Cada template pode ter `verticalLayers` em coordenadas 1080×1920.
- O compositor escolhe a variante no vertical e regras caem no equivalente por `key`.
- Prévia do operador alterna 16:9/9:16; galeria mostra selo.
- No vertical, GC custom é desenhado em tela cheia; GCs antigos continuam na faixa 16:9 segura.

## Excluir template (2026-11-04)

- Galeria e biblioteca têm botão de exclusão com confirmação; o editor usa dois cliques.
- `openDesigner(id)` usa o id clicado (antes abria o template selecionado).

## Banners no Ao vivo (2026-11-04)

- Banners e letreiro voltaram ao fluxo principal do hub, junto do operador de GC.
- Saídas mantém apenas overlays/legado/ajuda.

## No ar agora (2026-11-04)

- Painel de status no Ao vivo com GC/banner/placar/letreiro ativos, tirar individual e limpar tudo.
- Badge no menu Conteúdo/Grafismo.

## Acordeões do Grafismo (2026-11-04)

- Banners, Ao vivo, Letreiro, Templates, Dados e Saídas em `<details>` independentes.
- Banners em primeiro lugar e abertos por padrão; estado persistido.

## Hub Grafismo (2026-11-04)

O painel **GCs & Letreiro** passou a ser **Grafismo**, com quatro modos: Ao vivo, Templates, Dados e Saídas.
O id interno `banners` foi mantido para compatibilidade com deep links e testes. Jornal e Esportes permanecem
separados até a paridade de dados. Ver [`GC-GRAFISMO-IA-EGM.md`](GC-GRAFISMO-IA-EGM.md).
