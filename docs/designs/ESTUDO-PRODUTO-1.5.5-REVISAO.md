# Revisão crítica do plano e evolução do layout — CastDeck 1.5.5

> **Documento relacionado:** [ESTUDO-PRODUTO-1.5.5.md](ESTUDO-PRODUTO-1.5.5.md)
> **Versão analisada:** 1.5.5
> **Data:** 2026-11-12
> **Objetivo:** separar o que resolve atrito real do que é apenas ideia atraente, e propor uma evolução
> incremental de layout — sem redesenhar o produto.
> **Status:** proposta. Nada implementado.

---

## 1. Veredito

O plano original acertou o diagnóstico, mas exagerou no número de frentes. Se todas as 20 ideias forem
tratadas como roadmap, o produto ganha complexidade mais rápido do que ganha clareza.

A ordem correta é:

1. **Consertar a confiança antes da live** (prontidão, ensaio, cena segura).
2. **Reduzir o custo de navegação** (hierarquia, busca, atalhos).
3. **Organizar o depois** (gravação, clipes, transcrição).
4. **Só então** pensar em roteiro, sugestões e IA.

O layout não precisa de uma nova arquitetura de informação. Precisa de **hierarquia**: o programa deve
dominar a tela, as ações de ar devem dominar a topbar e as ferramentas de nicho devem sair da frente.

**Regra de corte:** se uma ideia não reduz uma decisão, não evita uma live perdida ou não melhora a
operação no ar, ela não entra no próximo ciclo.

---

## 2. O que é realmente relevante

| Item do plano | Veredito | Por quê | Ação revisada |
|---|---|---|---|
| **Prontidão antes da live** | **Manter — prioridade máxima** | É o medo mais caro do operador: publicar com problema que poderia ter visto antes | Versão enxuta, 6 grupos, sem painel pesado |
| **Cena segura / fallback** | **Adicionar — faltou no plano** | Em pânico, o operador precisa de um plano B imediato | Botão “Cena segura” + atalho |
| **Desfazer e confirmação contextual** | **Manter** | Evita acidentes no ar; hoje só existe em layout/GC | Toast de desfazer + snapshot |
| **Aviso de modo persistido** | **Manter** | O modo Mesa pode reabrir sem o operador perceber | Toast + “Voltar ao Estúdio” |
| **Ajuda de atalhos** | **Manter** | Item aberto em auditoria; custo baixo | Modal `?` |
| **Modo ensaio** | **Manter** | Testar hoje significa publicar ou gravar | Estado do botão Transmitir, não novo modo |
| **Saúde acionável** | **Manter** | Já existe pílula de saúde; falta ação | Evoluir o popover existente |
| **Biblioteca de gravações/clipes** | **Manter, evoluindo o que existe** | Player e pasta já existem; falta organização e clipe | Não criar outra área; melhorar a aba |
| **Sala de espera/PIN** | **Manter em P1** | Segurança e controle de convidado | Guest 2.0, sem misturar com layout |
| **Exportação SRT/VTT** | **Manter como quick win** | Legenda já existe; valor pós-live alto e esforço baixo | Botão de download |
| **Perfis de operação** | **Simplificar** | 5 perfis permanentes é excesso; a maioria quer começar | 3 templates no “Novo estúdio”, não cards no app |
| **Paleta de comandos** | **Manter como opcional** | Ajuda quem já conhece, mas não é o primeiro passo para iniciante | Busca no painel; `Ctrl+K` depois |
| **Relatório pós-live** | **Cortar / fundir** | Vira mais uma tela para ler; pouca ação | Resumo dentro do card da gravação |
| **Templates/brand kit** | **Adiar** | Útil para agência, não para o operador solo | Só depois de validar perfis |
| **Tags/favoritos de mídia** | **Adiar** | Nice-to-have; não bloqueia live | Evolução de médio prazo |
| **Rundown** | **Adiar e validar** | Função forte, mas de persona específica e esforço L | Testar demanda com igreja/evento/podcast |
| **Director Assist** | **Cortar por agora** | O usuário acabou de pedir menos automação; sugestão pode virar ruído | Reavaliar depois de prontidão/ensaio |
| **Network doctor** | **Separar** | É confiabilidade/infra, não layout | Roadmap técnico próprio |
| **IA local de highlights** | **Cortar do curto prazo** | Custo alto, risco de performance, valor ainda não provado | P2/P3 após transcrição |
| **Companion mobile** | **Cortar** | O controle remoto já cobre o básico | Melhorar remote existente |
| **Multi-destino avançado** | **Separar** | É confiabilidade de saída, não usabilidade | Roadmap de transmissão |

---

## 3. O que é firula — e por quê

Não é que essas ideias sejam inúteis. Elas são **boas ideias na hora errada**.

| Ideia | Por que parece atraente | Por que não agora |
|---|---|---|
| Tour de 5 passos no primeiro uso | Parece onboarding moderno | Tour é ignorado; o operador aprende operando. Use dicas contextuais e prontidão |
| Paleta de comandos como prioridade | Produtividade de power user | O iniciante não sabe o nome do comando; primero melhore hierarquia e busca simples |
| 5 perfis de operação persistentes | Cobre todos os públicos | Vira mais uma decisão antes de entrar; 3 templates no início bastam |
| Relatório pós-live detalhado | Dados são interessantes | Se não gera ação, é dashboard de vaidade; resumo no card basta |
| IA de highlights | Diferencial de marketing | Não resolve o problema de “vou ao ar e algo falha”; alto custo e risco |
| Director Assist | Ajuda quem não sabe cortar | Recentemente o produto optou por não automatizar; sugestão pode distrair mais que ajudar |
| Brand kit exportável | Reuso e profissionalização | Antes é preciso ter um fluxo de estúdio confiável e simples |
| Media tags/favoritos | Organização | Bibliotecas pequenas não sentem; resolver quando doer |
| Companion mobile | Segundo controle | O celular já é controle remoto; não abrir outra frente |
| Redesenhar a navegação de 9 para 6 grupos |“Mais limpo”| Custo alto de migração e memória; evolua a hierarquia, não a taxonomia inteira |

### 3.1 O que é “firula” de layout

- Nova sidebar com ícones e labels em outra lógica.
- Novo dashboard cheio de cards e gráficos.
- Nova tela de boas-vindas toda vez que abre.
- Temas e animações antes de resolver o ar.
- Esconder Gravar/Transmitir em menu “mais”.
- `Ctrl+K` como único caminho para funções essenciais.

**Bom design aqui é remover ruído, não adicionar personalidade.**

---

## 4. Plano revisado

### 4.1 Núcleo recomendado — 8 itens

| Ordem | Entrega | Resultado | Esforço |
|---:|---|---|---|
| 1 | **Prontidão enxuta** | “Posso ir ao vivo?” com 6 checks e ações | M |
| 2 | **Cena segura + desfazer** | Plano B em 1 clique e erro reversível | M |
| 3 | **Modo + atalhos** | Sem abrir no modo errado; atalhos descobertos | S |
| 4 | **Ensaio** | Testar sem publicar | M |
| 5 | **Saúde com ação** | Reconectar destino, reabrir câmera, exportar diagnóstico | M |
| 6 | **Biblioteca de gravação evoluída** | Buscar, marcar, clipe vertical, lixeira | M |
| 7 | **Guest 2.0** | Sala de espera, PIN opcional, TTL | M |
| 8 | **SRT/VTT** | Legenda vira transcrição reutilizável | S/M |

### 4.2 O que entra depois

- Perfis como **templates de criação** (não como cards permanentes).
- Paleta de comandos/busca.
- Templates/brand kit.
- Relatório pós-live **dentro do card de gravação**.
- Rundown, somente após validação com 3–5 usuários de igreja/evento/podcast.

### 4.3 O que sai do roadmap de produto

- Director Assist no curto prazo.
- IA de highlights.
- Companion mobile.
- Tour modal.
- Reorganização completa da navegação.
- Network doctor como item de UI; tratar como infraestrutura.

---

## 5. Layout: evoluir, não redesenhar

### 5.1 Princípio central

**O programa é o protagonista. A topbar decide. O painel aprofunda. O rodapé não compete.**

Hoje:

- o palco divide espaço vertical com GC, cenas, palco, layouts e backstage;
- a topbar tem ~16 ações;
- o painel lateral tem 9 grupos e 21 sub-abas;
- a barra inferior tem ~11 controles.

Proposta: manter a linguagem visual e a estrutura, mas criar **três níveis claros**:

1. **Nível de decisão** — modo, prontidão, gravar, transmitir.
2. **Nível de operação** — palco, fontes, cenas, GC.
3. **Nível de ferramenta** — NDI, PTZ, câmeras, remote, intercom, WhatsApp, replay.

### 5.2 Topbar: de “tudo visível” para “tudo importante”

**Manter sempre visível:**

- marca e nome do estúdio;
- seletor **Estúdio | Mesa**;
- estado de prontidão;
- **Convidar**;
- **Gravar**;
- **Transmitir**;
- **Painel**;
- **Sair**.

**Mover para “Ferramentas”:**

- NDI;
- PTZ;
- Câmeras;
- Remote;
- Intercom mini;
- WhatsApp;
- Replay;
- Vertical;
- idioma.

**Regras:**

- Gravar e Transmitir nunca entram em overflow.
- O menu Ferramentas mostra estado e atalho de cada item.
- Em telas pequenas, Ferramentas vira um drawer, não uma barra quebrada.
- A ação primária usa cor cheia; o resto é ghost.

**Ganho:** reduz a competição visual e deixa claro o que é operação e o que é ferramenta.

### 5.3 Prontidão: chip na topbar, não nova tela

Em vez de um dashboard novo:

```text
[● Pronto 8/9]  → clique abre painel lateral
```

O painel lista:

- Pessoas;
- Áudio;
- Rede;
- Saídas;
- Sistema;
- Conteúdo.

Cada linha tem **um ícone, uma frase e uma ação**. Sem gráficos, sem CPU em tempo real por padrão.

**Onde aparece:**

- chip na topbar;
- card do estúdio no dashboard;
- primeiro clique em Transmitir, se ainda não foi visto.

**Não bloqueia gravação local.** Não vira modal gigante.

### 5.4 Palco: mais altura útil com “deck” recolhível

O maior ganho visual não é trocar a sidebar: é **devolver altura ao programa**.

Proposta incremental:

- manter a ordem atual;
- agrupar `GC`, `Cenas`, `No palco`, `Layouts` e `Backstage` em um **deck inferior recolhível**;
- o deck começa aberto no modo Estúdio e **recolhido quando a live começa**, deixando um resumo de uma linha;
- botão “Abrir deck” e atalho;
- `No palco` tem uma faixa mínima sempre visível, porque é contexto de operação.

**Resultado esperado:** em 900 px de altura, o programa deixa de ficar com ~200 px e ganha espaço útil
sem esconder funções.

**Wireframe textual:**

```text
┌────────────────────────────────────────────────────────────────────┐
│ CastDeck  Estúdio 1     [Estúdio | Mesa]   [● 8/9]  [Convidar] [REC] [LIVE] [Ferramentas] │
├────────────────────────────────────────────────────────────────────┤
│  PROGRAMA                                                          │
│                                                                    │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│  No palco: [Você] [Ana] [Tela]        [▲ Abrir deck]               │
├────────────────────────────────────────────────────────────────────┤
│  Deck: [Cenas] [Fontes] [Layouts] [GC]        (recolhido na live)  │
├────────────────────────────────────────────────────────────────────┤
│  🎙 Microfone  📷 Câmera  ＋ Convidar  ▶ Mídia  ⬛ Tela  ⋯ Mais     │
└────────────────────────────────────────────────────────────────────┘
```

Isso é evolução: mesma lógica, menos ruído, mais programa.

### 5.5 Painel lateral: manter, não reinar

Não fazer a grande migração de 9 para 6 grupos agora. Em vez disso:

- manter os 9 grupos;
- mostrar o grupo ativo com mais contraste;
- lembrar a última sub-aba (já existe);
- adicionar uma **busca** no topo do painel;
- permitir **fixar 3–4 atalhos** (“Mixer”, “Grafismo”, “Mídia”, “Saídas”);
- usar “recentes” no topo quando o operador alterna muito;
- esconder descrições longas em tooltip.

A busca é o primeiro passo da paleta de comandos, sem o custo e o risco de uma nova interface.

### 5.6 Dashboard: menos hero, mais “retomar”

Hoje o hero ocupa bastante espaço mesmo para quem já usa o app. Evolução:

- **primeiro card:** “Continuar [estúdio]” com estado “Pronto / Ao vivo / Ensaio”;
- se houver live ativa, faixa no topo com tempo, saúde e “Abrir”;
- cards de estúdio com:
  - miniatura;
  - nome;
  - último uso;
  - `Pronto 8/9`;
  - ações “Abrir”, “Duplicar”, “Exportar”.
- o bloco “Como começar” continua, mas encolhe para quem já concluiu os passos.

Sem nova aba, sem novo dashboard.

### 5.7 Mobile

Manter a mesma UI, com hierarquia mais rígida:

- topbar compacta: modo, prontidão, ferramentas;
- rodapé fixo: microfone, câmera, convidar, mídia, live/record;
- “Mais” para tela, nomes, cursor, ajustes;
- deck inferior recolhido por padrão;
- sem rolagem horizontal escondendo ação primária.

### 5.8 Linguagem visual

- **Vermelho:** AO VIVO e gravando (com distinção por rótulo/ícone).
- **Âmbar:** ensaio e atenção.
- **Verde:** pronto/OK.
- **Azul/acento:** ação primária, não status.
- Menos gradientes em cards; mais camadas de superfície.
- Um único botão primário por contexto.
- Ícones com rótulo quando a ação é ambígua.
- Movimento só para estado (live, transição), não para decorar.

### 5.9 Navegação: manter a memória do usuário

Não renomear grupos nem mover funções sem necessidade. O operador já aprendeu onde ficam “Grafismo”,
“Jornal” e “Esportes”. Evolução de layout deve **reduzir ruído**, não **mudar o mapa**.

Se um grupo precisar sair da topbar, ele continua existindo no painel. A topbar não é o único caminho.

---

## 6. O que não mudar

- O programa continua no centro.
- Gravar e Transmitir continuam independentes e visíveis.
- O modo Estúdio/Mesa continua existindo.
- O painel lateral continua sendo o lugar de configuração.
- O dashboard continua com estúdios, destinos, gravações e sistema.
- O visual escuro, a tipografia e a identidade atual são ativos; não trocar por “tema novo”.
- O Android continua com a mesma UI, com supressões específicas.

---

## 7. Critérios de aceite do layout

- Em 900×700, o programa ganha altura útil com o deck recolhido.
- Em 390×844, nenhuma ação primária fica fora da tela.
- A topbar mostra no máximo **8 ações primárias**.
- Ferramentas abre por teclado e mostra estado de NDI/PTZ/Remote.
- O chip de prontidão abre em ≤1 clique e não bloqueia gravação.
- O deck pode ser recolhido/aberto por teclado e mantém “No palco” visível.
- Nenhuma função atual desaparece; apenas muda de nível.
- Contraste e foco visível mantidos.
- Três idiomas cobertos.

---

## 8. Sequência de implementação do layout

### Fase 1 — barata e de alto impacto

1. Reagrupar a topbar em primário + Ferramentas.
2. Adicionar chip “Pronto 8/9”.
3. Recolher deck inferior na live.
4. Faixa “No palco” mínima.
5. Ajustar rodapé mobile para “Mais”.

### Fase 2 — média

6. Painel lateral com busca e fixados.
7. Dashboard com “Continuar” e estado de prontidão.
8. Cena segura como ação destacada.

### Fase 3 — validar antes

9. Perfis/templates no novo estúdio.
10. Paleta de comandos.
11. Rundown.

---

## 9. Conclusão

O plano original tinha boas ideias, mas misturou **necessidade**, **oportunidade** e **desejo**.

O que realmente importa:

1. **saber se está pronto**;
2. **ter um plano B**;
3. **poder desfazer**;
4. **testar sem publicar**;
5. **encontrar o que importa rápido**;
6. **entregar a gravação**.

O layout deve evoluir em três movimentos:

> **topbar mais curta, programa mais alto, painel mais encontrável.**

Sem trocar a identidade, sem reorganizar tudo e sem adicionar um novo produto dentro do produto.
