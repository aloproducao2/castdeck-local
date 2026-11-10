# EGM — Substituir o painel atual pelo hub Grafismo?

> **Status:** decisão de informação/arquitetura; **nenhum código alterado**.
> **Base:** CastDeck 1.3.29 + plano [`GC-MARKET-EGM.md`](GC-MARKET-EGM.md).
> **Data:** 2026-11-04

---

## 1. A pergunta

Substituir o painel atual de GC por um **hub Grafismo** — e isso é melhor para o usuário?

A resposta curta é:

> **Sim para o painel de GC. Não imediatamente para Jornal e Esportes.**
> O alvo final pode ser um único hub, mas a substituição deve ser por fases e sem duplicar caminhos.

Não é uma questão de “caber mais coisa na lateral”. É uma mudança de **modelo mental**:

```text
Hoje:
GCs & Letreiro  |  Jornal  |  Esportes
cada um com seu fluxo, seu estado e seus botões

Depois:
Grafismo
  ├─ Ao vivo
  ├─ Templates
  ├─ Dados
  └─ Saídas
```

---

## 2. O que o mercado ensina sobre separar criar × operar

Os produtos mais maduros **separam autoria de operação**, mas mantêm um único modelo de template:

- **vMix:** o GT Designer é uma ferramenta separada do vMix; o vMix opera Titles/canais.
- **H2R:** tem **Build** e **Rundown** como visões diferentes do mesmo app.
- **Singular:** tem **Composer** (autoria) e **Control Application** (operação).
- **SPX:** é um controlador/rundown; não tem design tool — o template vem de fora.
- **OGraf Editor:** edita e exporta; o playout consome.

**Conclusão:** o usuário não quer um único modal gigante que faz tudo ao mesmo tempo. Quer um
**único lugar** com **dois modos claros**: operar e criar.

---

## 3. O que o usuário realmente faz

| Tarefa | Frequência | O que precisa |
|---|---|---|
| Colocar um GC no ar | Muito alta | 1–3 cliques, campos grandes, preview |
| Trocar texto ao vivo | Alta | edição sem sair do ar |
| Escolher template | Alta | biblioteca visual |
| Criar/editar template | Baixa/média | canvas, camadas, animação |
| Configurar dados | Baixa | fonte, mapeamento, teste |
| Ver o que está no ar | Alta | fila/layers |
| Exportar para OBS/vMix | Média | URL/arquivo |

O painel deve ser desenhado em volta das tarefas **frequentes**. O designer não pode dominar a
primeira tela do operador.

---

## 4. Opções de substituição

### A — Adicionar Grafismo e manter GC/Jornal/Esportes

- **Prós:** ninguém perde nada; migração fácil.
- **Contras:** dois caminhos para a mesma coisa; estados duplicados; menu maior; o usuário não sabe
  qual é o “oficial”.
- **Veredito:** pior dos mundos a médio prazo. Só aceitável como beta temporário.

### B — Substituir apenas GCs & Letreiro por Grafismo

- **Prós:** remove o fluxo mais duplicado; mantém Jornal/Esportes com seus editores de dados;
  entrega valor rápido; risco controlado.
- **Contras:** ainda existem três entradas de “gráfico” no menu.
- **Veredito:** **recomendada para a primeira fase**.

### C — Substituir GCs & Letreiro + Jornal + Esportes por Grafismo

- **Prós:** modelo final mais limpo; uma biblioteca, uma fila, um estado.
- **Contras:** Jornal e Esportes não são “só template”: têm RSS, edição de notícia, times, elenco,
  placar, cronômetro, regras. Absorver sem paridade quebra fluxo.
- **Veredito:** **alvo final**, desde que a paridade venha antes da remoção.

### D — Substituir todo o grupo Conteúdo

Inclui Mídia e Playout. Não faz sentido: são fluxos diferentes.

### E — Transformar Grafismo em um workspace separado do painel

- **Prós:** espaço de editor de verdade; não esmaga a lateral.
- **Contras:** mais uma janela; mobile pior; o operador sai do painel.
- **Veredito:** usar apenas o **Designer** em modo expandido; a operação fica no hub.

---

## 5. Ponderação

Pesos para a decisão:

| Critério | Peso | A | B | C | D |
|---|---:|---:|---:|---:|---:|
| Velocidade do operador | 25% | 3 | 5 | 5 | 3 |
| Descoberta/uma porta | 20% | 2 | 3 | 5 | 2 |
| Risco de regressão | 20% | 5 | 4 | 2 | 2 |
| Paridade Jornal/Esportes | 15% | 5 | 5 | 2 | 3 |
| Mobile | 10% | 3 | 4 | 4 | 3 |
| Clareza do modelo mental | 10% | 1 | 3 | 5 | 3 |
| **Média ponderada** | | **3,25** | **4,05** | **3,95** | **2,65** |

**B e C praticamente empatam**, mas por motivos opostos:

- B é melhor **agora** porque preserva Jornal/Esportes e reduz risco.
- C é melhor **no fim** porque elimina de vez a duplicação.

A sequência ideal é **B → C**, não escolher uma e abandonar a outra.

---

## 6. Arquitetura de informação recomendada

### 6.1 Menu final (alvo)

```text
Conteúdo
├─ Mídia
├─ Playout
└─ Grafismo
```

Jornal e Esportes deixam de ser abas externas e passam a ser **pacotes dentro de Grafismo**:

```text
Grafismo
├─ Ao vivo        ← padrão
├─ Templates      ← biblioteca + editor
├─ Dados          ← jornal, esporte, convidados, RSS, planilhas
└─ Saídas         ← PGM, vertical, HTML/OBS/vMix, OGraf
```

### 6.2 Menu transitório (primeira fase)

```text
Conteúdo
├─ Mídia
├─ Playout
├─ Grafismo       ← substitui GCs & Letreiro
├─ Jornal         ← mantido temporariamente
└─ Esportes       ← mantido temporariamente
```

Nesse período:

- Jornal e Esportes continuam funcionando;
- o botão “Novo GC” deles abre o **mesmo designer** do Grafismo;
- não há dois editores de template;
- a biblioteca do Grafismo lista templates de jornal/esporte;
- o estado de “no ar” é um só.

### 6.3 Dentro do Grafismo

**Ao vivo** (primeira tela):

- layers no ar;
- próximo;
- fila/rundown;
- botões Preparar / No ar / Atualizar / Tirar;
- tempo restante;
- busca rápida.

**Templates**:

- galeria com thumbnails;
- filtros;
- “Usar”, “Duplicar”, “Editar”;
- editor abre em modo expandido/full-panel.

**Dados**:

- fontes;
- mapeamento;
- teste;
- fallback.

**Saídas**:

- PGM;
- vertical;
- HTML para OBS/vMix;
- exportação.

---

## 7. O que substituir primeiro

### Fase 1 — GCs & Letreiro

- “GCs & Letreiro” vira **Grafismo**.
- O operador atual continua com os mesmos campos no modo Ao vivo.
- O designer atual vai para “Templates → Editar”.
- Jornal/Esportes ficam, mas perdem o botão duplicado de “criar template”.
- Compatibilidade: `switchTab('banners')` redireciona para `graphics` por um ciclo.
- Salvar/restaurar `S.tab` com alias.

### Fase 2 — Jornal

Absorver quando houver paridade:

- RSS/feeds;
- manchete, linha de apoio, etiqueta;
- modelos claros/escuros;
- agendamento;
- aprovação/último valor bom.

### Fase 3 — Esportes

Absorver quando houver paridade:

- times/elenco;
- placar;
- cronômetro/regras;
- período;
- GCs de futebol;
- dados ao vivo.

### Fase 4 — remover abas antigas

- menu final;
- redirecionamentos antigos;
- uma única fila/estado.

---

## 8. O que não pode acontecer

1. **Dois “No ar”.** O estado de GC tem de ser único.
2. **Dois designers.** O mesmo template não pode ser editado em dois lugares.
3. **Perder Jornal/Esportes** antes da paridade.
4. **Esconder o designer** atrás de muitos cliques no celular.
5. **Um hub tão complexo quanto três abas.**
6. **Duplicar fila e agendamento.**
7. **Quebrar links salvos/testes** sem alias.
8. **Misturar mídia/playout** no Grafismo.

---

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Operador não acha o GC | Grafismo é o primeiro item de Conteúdo; Ao vivo é default |
| Jornal/Esportes perdem função | mantê-los até paridade; deep links |
| Duplicação de estado | uma camada/registry de GC; `activeBanner` legado vira alias |
| Menu maior | substituir, não adicionar |
| Mobile pior | hub com 4 segmentos; editor em full-panel |
| Migração de templates | JSON versionado + import/export |
| Regressão | testes de Jornal/Esportes/GC antes de remover |
| Curva de aprendizado | tour de 2 passos: “Ao vivo” × “Templates” |

---

## 10. Métricas de sucesso

- Tempo para colocar um lower third no ar: **≤ 5 s**.
- Número de cliques: **≤ 3** depois do template escolhido.
- Tempo para editar texto ao vivo: **≤ 2 s**.
- Zero duplicação de fluxo.
- Template encontrado em **≤ 2 buscas**.
- Nenhuma perda de Jornal/Esportes na migração.
- Mobile: todas as funções acessíveis sem overflow.

---

## 11. Recomendação final

**Substituir o painel GC atual por Grafismo na primeira fase.** Isso melhora a vida do usuário
porque:

- acaba com o modal solto;
- dá um lugar óbvio para operar;
- a biblioteca e o designer passam a ter casa;
- o estado “no ar” fica visível;
- Jornal/Esportes podem migrar depois sem pressa.

Mas **não substituir Jornal e Esportes no mesmo dia**. Eles têm dados e regras próprias; removê-los
antes da paridade seria trocar clareza por perda de função.

### Decisão

```text
Agora:  GCs & Letreiro → Grafismo
Depois: Jornal + Esportes → Dados/Pacotes dentro do Grafismo
Final:  um único hub, um único estado, um único designer
```

### Não fazer

- manter aba antiga e nova em paralelo “para sempre”;
- criar um segundo editor;
- transformar Grafismo em um editor pesado aberto por padrão;
- remover Jornal/Esportes sem paridade.

O caminho **B → C** é o que melhor equilibra utilidade imediata, risco e clareza no fim.


---

## 17. Implementação local (2026-11-04)

**Status:** Fase 1 implementada localmente, **sem publicação**.

- O item **GCs & Letreiro** do menu virou **Grafismo** (id `banners` preservado para compatibilidade).
- Hub com **Ao vivo**, **Templates**, **Dados** e **Saídas**.
- **Ao vivo:** operador atual, biblioteca, campos, preview, auto convidado/RSS, agendamento e No ar/Tirar.
- **Templates:** galeria com miniaturas, categorias, “Usar” e “Editar”.
- **Dados:** contagem de convidados, atalhos de preenchimento e lista de agendamentos com cancelamento.
- **Saídas:** overlays sobre DSK, banners legados, letreiro/RSS e rotação.
- **8 templates:** Lower third, Hard news, Nome/strap, Plantão/breaking, Abertura/título, Entrevista compacta, **Leilão — Premium** e **Leilão — Compacto**.
- **Jornal** e **Esportes** continuam como abas separadas nesta fase.
- Não implementado ainda: fila/rundown completa, múltiplos layers, animação por camada, HTML/OBS/vMix e OGraf.

### Camadas

- **QR Code** gerado a partir de um link.

### Correções de operação

- O botão **Tirar** do painel não funcionava porque compartilhava o id `gc-off` com o botão da barra inferior; a barra recebia o estado e o painel ficava desabilitado. O painel agora usa `gc-op-off`.
- **Tirar do ar** ganhou um botão fixo no topo do Ao vivo e limpeza de segurança caso o compositor não receba frames.
- Campos extras por template (`item`, `bid`, `bidder`, `lot`) alimentam o **Leilão ao vivo**.

**Build local:** 190.884.352 bytes; SHA-256 `0791306C855576007FE7EE0C9F11695DCD82410084F9AFA649ED7A825C94E7FB`.

**Backup:** `D:\REA\backups\pre-grafismo-20261104-005245`.
