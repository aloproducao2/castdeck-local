# EGM — GC de mercado, templates e controle unificado

> **Status:** pesquisa + plano. **Nenhum código foi alterado.**
> **Base:** CastDeck Local 1.3.29 + GC Designer atual.
> **Data:** 2026-11-04

---

## 1. Objetivo

Comparar o **GC Designer** do CastDeck com soluções reais de mercado, levantar templates e
referências de overlays HTML para OBS/vMix, e desenhar um plano EGM para deixar o GC:

- mais **inteligente** (dados, regras, variantes, leitura);
- mais **prático** (operador resolve em segundos);
- mais **bonito** (design system e templates de verdade);
- com **controle unificado** (um lugar para criar, agendar, colocar no ar e controlar).

---

## 2. Referências pesquisadas

### 2.1 vMix GT Title Designer

Fonte: [vMix GT Title Designer](https://www.vmix.com/products/vmix-gt-title-designer.aspx) e
[Help Guide](https://help.vmix.com/graphics/6/).

**Standard:**

- GPU accelerated;
- texto, retângulos, elipses, imagens, texto 3D e tickers;
- até 4 direções de ticker;
- camadas e grupos sem limite prático;
- fontes do Windows e vários idiomas;
- auto size, auto shrink, word wrap, auto uppercase;
- sombra, reflexão, skew, crop e mask;
- dados do vMix Data Sources e vMix Social.

**Advanced:**

- animação/transição para todos os objetos e camadas;
- `TransitionIn`, `TransitionOut`;
- animação contínua (rotação, offset de gradiente/textura);
- `DataChangeIn`, `DataChangeOut`;
- animações `Page1–10` para reveals em etapas;
- importação PSD com textos data-driven.

**Leitura:** é um editor de verdade, com camadas, dados, animação e ticker. O CastDeck já tem
canvas/layers/rules, mas está muito atrás em animação, formas, ticker e grupos.

### 2.2 SPX Graphics Controller (HTML/OGraf)

Fonte: [SPX-GC](https://github.com/TuomoKu/SPX-GC) e
[Template Demo Pack](https://github.com/tuomoku/spx-gc/blob/9ad2d01e4d2af1390ff67109f71f9c2f444200fb/ASSETS/templates/softpix/Template_Pack_1.3.2/README.md).

- controle de gráficos HTML para OBS, vMix, CasparCG, Wirecast, LiveU e outros;
- on-premise, sem internet;
- projeto → rundowns → templates;
- não tem design tool: “Bring Your Design”;
- OGraf compliant;
- camadas e múltiplas saídas;
- API/plugins;
- exemplos: bumper, info left/right com Lottie, name strap, ticker RSS, ticker Excel, título em 2 etapas.

**Leitura:** o valor está no **rundown + controle + HTML/OGraf**, não no editor. É a melhor
referência para o lado “operar no ar” e para exportar templates portáveis.

### 2.3 H2R Graphics

Fontes: [H2R Graphics](https://h2r.graphics/), [Pro graphics](https://h2r.graphics/docs/pro/pro-graphics/)
e [Custom HTML](https://h2r.graphics/docs/graphics/custom-html/).

- app desktop (Windows/macOS/Linux/RPi) para overlays em OBS, vMix, ATEM, Wirecast;
- builder drag-and-drop dentro do app;
- temas, fontes, cores e CSS custom;
- rundown/variáveis;
- Google Sheets, YouTube Live Chat, HTTP listener, SocialStream;
- múltiplas saídas e NDI;
- gráficos prontos: big timer (circle/line/mask), lower third animado
  (slide-out/unfold/reveal), icon message, credits, ticker, progress, map, lyrics, now/next/then;
- Custom HTML com funções `play()`/`update()` e metadados GDD.

**Leitura:** é o melhor exemplo de **builder simples + temas + dados + saídas** para criadores e
produtoras pequenas. Também mostra que template não é só “barra e texto”: timer, ticker, créditos,
mapa e agenda vendem o produto.

### 2.4 Singular.live

Fontes: [Features](https://www.singular.live/features) e
[Adaptive outputs](https://support.singular.live/hc/en-us/articles/360042682051-Assigning-Specific-Graphics-to-Specific-Outputs-using-Adaptive-Feature).

- Composer para autoria;
- Control Application para operar;
- rundowns, APIs, SDK, Data Streams, Google Sheets;
- saídas IP/NDI/SDI;
- **Adaptive**: uma composição, vários outputs; ex.: ticker no Output A, panes/lower thirds no B,
  fullscreens no C;
- intelligent overlays: interativos, adaptativos, localizados, renderizados no dispositivo.

**Leitura:** o controle precisa ser **um só**, mesmo com vários outputs e variantes. É o norte de
“controle unificado”.

### 2.5 OGraf / Eyevinn Editor

Fonte: [OGraf Template Editor — Getting Started](https://github.com/Eyevinn/ograf-editor/blob/main/GETTING_STARTED.md).

- editor web de templates no padrão EBU OGraf;
- templates: lower third, title card, station bug, custom;
- canvas 1920×1080, zoom/pan, mover/redimensionar, snapshots;
- **data inputs** e tokens `{{name}}`;
- animação rápida (None/Fade/Slide/Pop) + timeline/keyframes;
- preview operacional;
- **live data** (JSON/RSS) com mapeamento e refresh;
- **steps** (mostrar/esconder elementos e sobrescrever dados por etapa);
- export/import `.ograf.zip` com manifest + web component.

**Leitura:** é a referência mais próxima do que o CastDeck deveria ser: editor + data + preview +
steps + export portável. O CastDeck já tem canvas/rules/categorias, mas não tem animação, steps,
live data mapeada nem export.

### 2.6 Regras de title design

Fonte: [Title craft basics](https://github.com/varghq/skills/blob/main/title-design/references/title-craft-basics.md).

- **safe area 16:9 broadcast:** EBU R95 5% (x 96–1824, y 54–1026);
- lower third: base em 86–88% da altura, início em 7.5% da largura;
- 9:16: zonas Meta Reels; texto entre ~14% topo e 35% base;
- **hold:** `clamp(2 × max(words × 0.36, chars / 20), 3.0, 7.0)` s;
- leitura: 160–180 wpm / 20 caracteres por segundo;
- tipo: nome 4.5–5.5% da altura; cargo 60–70% do nome; mínimo 2% H;
- tracking de caps 5–12%; tabular figures para números;
- easing Material: entrada decelerate, saída accelerate;
- animação não pode atrapalhar leitura.

**Leitura:** dá para fazer o GC “inteligente” sem IA: **medir texto, aplicar safe area, calcular hold
e escolher tamanho** com regras de broadcast.

---

## 3. Comparação direta

| Recurso | vMix GT | SPX-GC | H2R | Singular | OGraf Editor | CastDeck hoje |
|---|---|---|---|---|---|---|
| Editor visual | Sim | Não | Sim | Sim | Sim | **Sim (MVP)** |
| Camadas/grupos | Sim, ilimitado | Depende do HTML | Sim | Sim | Sim | Camadas, **sem grupos** |
| Texto/imagem/forma | Texto, rect, ellipse, tri, 3D, ticker | HTML | Builder | Composer | Texto, imagem, rect, circle | Texto, rect, tag, imagem |
| Animação | Avançada, por objeto, pages | CSS/JS | Presets e custom | Composer | Presets + timeline | **Só fade/lift global** |
| Data binding | Data Sources/Social | Feedproxy/Excel | Sheets/social/HTTP | API/Sheets/streams | JSON/RSS | Guest/RSS simples |
| Regras | Implícitas/data | JS | Dados | Composer | Steps | **Regras hide/size** |
| Rundown/playout | Título/canal | Sim, forte | Sim | Sim | Preview | **Não** |
| Múltiplos outputs | Canais/overlays | Sim | Sim | Sim, adaptive | 1 template | **1 PGM** |
| HTML/OGraf | Export/PSD | Sim/OGraf | Custom HTML/OGraf | Web-native | OGraf | **Não** |
| Templates prontos | Pack vMix | Pack SPX | 20 temas + pro graphics | Marketplace | Tipos básicos | **3 builtins** |
| Dados ao vivo | Sim | Sim | Sim | Sim | Sim | Parcial (RSS/guest) |
| Preview operador | vMix | Sim | Sim | Sim | Sim | Sim |
| Curva de aprendizado | Média/alta | Média | Baixa | Média | Baixa/média | **Média** |

---

## 4. O que o CastDeck já tem de bom

- Canvas 1920×1080 mapeado para o PGM real.
- Templates com camadas e dados (`name`, `role`, `tag`, `headline`).
- Regras simples (esconder, mostrar, reduzir fonte).
- Auto-preenchimento de convidado e RSS.
- Agendamento por horário.
- Categorias, busca, favoritos, miniatura, duplicar, undo/redo.
- Modo Operador + Template Studio.
- Mesmo renderizador no PGM e na prévia.
- Integração com Jornal/Banners/Esportes/quiz.

## 5. Lacunas prioritárias

1. **Poucos templates e pouco bonitos.**
2. **Sem animação de entrada/saída por camada.**
3. **Sem grupos** (mover a placa inteira junto).
4. **Sem formas** (círculo, linha, triângulo) e sem ticker/relógio.
5. **Sem dados ao vivo mapeados** (Google Sheets, JSON, placar, agenda).
6. **Sem steps/reveals** (informação em etapas).
7. **Sem rundown** (fila de GCs, próximo/no ar).
8. **Sem múltiplos outputs/layers** (ticker + lower third ao mesmo tempo).
9. **Sem HTML/OGraf/export** para OBS/vMix.
10. **Sem validação de safe area/leitura** no editor.

---

## 6. Conceito proposto — “Grafismo”

Um único hub, com quatro modos:

```text
Grafismo
├─ Biblioteca   → templates prontos, favoritos, categorias, busca, temas
├─ Operador     → campos, preview, próximo/no ar, duração, fila/rundown
├─ Designer     → canvas, camadas/grupos, animação, dados, safe area
└─ Saídas       → PGM, 16:9/9:16, HTML para OBS/vMix, OGraf
```

O botão **Grafismo** no topo/menu abre o hub. Jornal, Banners e Esportes continuam como atalhos
para templates e dados, mas não têm mais controles duplicados.

### 6.1 Biblioteca

- galeria com thumbnail animado (ou poster) e categorias:
  - Entrevista, Jornalismo, Esporte, Igreja, Podcast, Marca, Patrocinador, Ticker, Título;
- filtros: tipo, proporção, tema, favorito, recente;
- “Usar”, “Duplicar”, “Editar”, “Exportar”;
- 12–16 templates iniciais (lista na seção 7).

### 6.2 Operador

- campos grandes e auto-preenchidos;
- preview ao vivo com safe area;
- **Próximo / No ar / Tirar**;
- duração sugerida pelo texto (hold de leitura);
- fila/rundown com reordenar, duração, template, dados;
- botão “Preencher do convidado/RSS/placar”;
- “Ao vivo” mostra todos os GCs no ar, não só um.

### 6.3 Designer

- canvas central, zoom/pan, réguas e safe areas;
- camadas com grupos, bloqueio, visibilidade, alinhamento e distribuição;
- paleta: texto, barra, cartão, círculo, linha, ícone/logo, imagem, ticker, relógio, QR;
- inspetor: posição, tamanho, tipografia, cor, raio, sombra, opacidade;
- animação: entrada/saída, stagger, steps/timeline;
- dados: slots, regras, fontes e fallback;
- validação: “texto cabe?”, “está na safe area?”, “contraste?”;
- salvar/duplicar/exportar.

### 6.4 Saídas

- PGM nativo (canvas);
- **HTML overlay** transparente para OBS/vMix, com URL e query params;
- 16:9 e 9:16 com variantes do mesmo template;
- OGraf import/export (fase posterior);
- múltiplos layers de saída (ex.: lower third + ticker) em um controlador só.

---

## 7. Templates propostos (exemplos reais)

| # | Template | Slots | Dados/animação | Prioridade |
|---|---|---|---|---|
| 1 | **Lower third entrevista** | nome, cargo, tag, logo | slide da barra + fade do texto; 16:9/9:16 | P0 |
| 2 | **Hard news** | manchete, tag, logo | faixa larga, kicker, reveal | P0 |
| 3 | **Strap de nome** | nome, função | linha de marca + slide | P0 |
| 4 | **Ticker RSS** | manchetes | loop contínuo, RSS | P0 |
| 5 | **Placar de futebol** | mandante, visitante, placar, tempo | fonte do painel Esportes; entrada por etapas | P0 |
| 6 | **Cartão de jogador** | nome, número, posição, foto | slide lateral + foto | P1 |
| 7 | **Lower third igreja** | nome, cargo, versículo | tema claro, serifa, fade suave | P1 |
| 8 | **Podcast nameplate** | participant, role, ep | placa dupla, stagger | P1 |
| 9 | **Quote card** | citação, autor | aspas grandes, blur/plate | P1 |
| 10 | **Título de abertura** | título, subtítulo | scale/blur/steps | P1 |
| 11 | **Countdown/timer** | rótulo, segundos | relógio, format mm:ss | P1 |
| 12 | **Now / Next / Then** | agenda | fonte de dados/schedule | P2 |
| 13 | **Créditos** | lista | roll contínuo | P2 |
| 14 | **Patrocinador / bug** | logo, texto | canto, loop discreto | P2 |
| 15 | **QR / social** | handle, URL | QR gerado, slide | P2 |

Cada template precisa de:

- thumbnail;
- variantes **clara/escura** e **16:9/9:16**;
- safe area;
- campos e defaults;
- animação de entrada/saída;
- hold sugerido;
- regra de “texto vazio não aparece”;
- source de dados compatível.

---

## 8. Inteligência sem “IA mágica”

### 8.1 Auto-preenchimento

- convidado no palco → nome/cargo;
- RSS → manchete;
- placar → times/score/tempo;
- Google Sheets/JSON → campos mapeados;
- agenda → now/next;
- último valor bom permanece se a fonte falhar.

### 8.2 Regras de leitura

- auto-fit de texto (já existe, evoluir);
- hold sugerido por palavras/caracteres;
- número máximo de linhas;
- esconder slot vazio;
- reduzir fonte / trocar variante quando passar do limite;
- safe area e contraste no designer;
- “texto longo demais” não vai ao ar sem confirmação.

### 8.3 Variantes inteligentes

Um template, várias saídas:

- 16:9 e 9:16;
- claro/escuro;
- PT/EN/ES;
- compacto/estendido;
- por output (PGM, vertical, HTML).

### 8.4 Steps

- revelar informação em 2–3 etapas;
- “Próximo” avança, “Voltar” retorna;
- cada etapa pode esconder camada e sobrescrever dados;
- ideal para esporte, notícia e abertura.

---

## 9. Controle unificado

### Problema atual

- GC fica num modal próprio.
- Jornal/Banners/Esportes têm fluxos separados.
- Não existe fila de GCs.
- Um único `activeBanner` limita composição.

### Proposta

Um **Controlador de Grafismo** com:

- **Ao vivo**: GCs no ar, camadas, opacidade, tempo restante;
- **Próximo**: fila/rundown, reordenar, segurar, soltar;
- **Biblioteca**: templates;
- **Dados**: fontes ativas;
- **Saídas**: PGM/vertical/HTML.

O operador vê:

```text
[No ar: Lower third — Maria]  [Ticker: RSS]  [Tempo: 00:04]
[Próximo: Placar — 2×1]
[Fila: ...]
```

Botões:

- **Preparar** (cue, não vai ao ar);
- **No ar**;
- **Atualizar ao vivo**;
- **Tirar**;
- **Próximo**;
- **Auto** (avança por tempo/duração).

### Múltiplas camadas

- Fase 1: 1 GC principal + 1 ticker; evita refatorar tudo;
- Fase 2: até 3 layers independentes;
- cada layer tem template, dados, posição, duração e output;
- Jornal/Banners/Esportes viram **presets** de template, não fluxos paralelos.

---

## 10. Integração OBS/vMix/HTML

### Opção nativa

Renderizar o mesmo canvas como PGM. Continua sendo o padrão.

### Opção HTML

Criar um endpoint transparente, por exemplo:

```text
/overlay/gc?studio=...&layer=lower&token=...
```

- fundo transparente;
- WebSocket/SSE para atualizar dados;
- `play()`/`update()`/`out()` no template;
- URL sem interface, pronta para Browser Source no OBS ou Web Browser no vMix;
- query params para variante, tema e output;
- autenticação por token.

### OGraf

- importar/exportar `.ograf.zip` (manifest + web component);
- permite usar templates de terceiros e levar os nossos para outros playouts;
- fase posterior, mas o modelo de dados deve nascer compatível.

### Custom HTML

- aceitar HTML externo com metadados de campos;
- `play`, `update`, `stop` como H2R;
- sandbox/iframe e limites de segurança.

---

## 11. EGM — seis lentes

### 11.1 Operador

- menos cliques: template → preencher → No ar;
- fila e “próximo”;
- dados automáticos;
- preview claro;
- não perder o que está no ar.

### 11.2 Criador

- camadas/grupos;
- animações e steps;
- design system;
- templates prontos;
- validação de safe area/leitura.

### 11.3 Automação

- fontes de dados;
- regras;
- agendamento;
- gatilhos por convidado/RSS/placar;
- fallback.

### 11.4 Consistência

- um único estado/controlador;
- Jornal/Banners/Esportes como presets;
- mesmo template no PGM, vertical e HTML.

### 11.5 Performance

- animação no canvas do PGM sem novo stream;
- evitar DOM/canvas por camada desnecessário;
- cache de fontes/imagens;
- HTML output só quando habilitado.

### 11.6 Confiança

- preview fiel;
- validação antes do ar;
- log de alterações;
- “texto longo” e “fora da safe area” avisados;
- fallback de dados.

---

## 12. Opções e ponderação

### A — Só adicionar templates e animações ao designer atual

- **Prós:** menor esforço; melhora visual imediata.
- **Contras:** não resolve controle unificado, fila, dados, múltiplos outputs.
- **Veredito:** necessário, insuficiente.

### B — Clonar o vMix GT/Composer

- **Prós:** poder máximo; camadas, animação, PSD, dados.
- **Contras:** vira um editor pesado; alto custo; usuário quer praticidade; não resolve operação.
- **Veredito:** não copiar o editor inteiro.

### C — Híbrido: operador rápido + designer avançado + HTML/OGraf (recomendado)

- **Prós:** atende criador e operador; um controle; templates bonitos; dados; portabilidade.
- **Contras:** maior escopo; precisa de fases.
- **Veredito:** **recomendado**.

### D — Integrar SPX/OGraf externo já

- **Prós:** rundown/HTML prontos; ecossistema.
- **Contras:** dependência externa; outra UI; perde integração nativa com Jornal/Esportes/áudio.
- **Veredito:** opção futura, não substituto.

### Matriz

| Critério | A | B | C | D |
|---|---|---|---|---|
| Beleza/templates | médio | alto | **alto** | alto |
| Praticidade | médio | baixo | **alto** | médio |
| Controle unificado | não | parcial | **sim** | não |
| Dados/automação | baixo | alto | **alto** | alto |
| Esforço | S | L | **M/L** | M |
| Risco | baixo | alto | **médio** | médio |

---

## 13. Plano por fases

### Fase 0 — Design system e biblioteca

1. Tokens: tipo, espaçamento, cores, raio, sombra, opacidade.
2. 6 templates iniciais (1–5 + um vertical).
3. Thumbnails e previews.
4. Safe area/leitura no canvas.
5. Consolidar CSS dos templates.

### Fase 1 — Engine de template

1. Grupos de camadas.
2. Formas: círculo, linha, triângulo.
3. Animação por camada: fade/slide/wipe/pop, entrance/out, stagger.
4. Steps/reveals.
5. Variantes 16:9/9:16 e tema claro/escuro.
6. Auto-hold por texto.
7. Export/import JSON do template.

### Fase 2 — Controle unificado

1. Hub Grafismo (Biblioteca/Operador/Designer/Saídas).
2. Rundown/fila: preparar, no ar, próximo, auto.
3. Múltiplos layers (1 principal + ticker na primeira fase).
4. Jornal/Banners/Esportes como presets.
5. Estado ao vivo unificado.

### Fase 3 — Dados e automação

1. Google Sheets/JSON/RSS.
2. Mapeamento de campos.
3. Refresh/fallback.
4. Gatilhos por convidado/RSS/placar.
5. Agendamento existente integrado à fila.

### Fase 4 — Saídas HTML/OGraf

1. Endpoint transparente para OBS/vMix.
2. `play/update/stop` + WebSocket.
3. Variantes por query.
4. Import/export OGraf.
5. Custom HTML seguro.

### Fase 5 — Acabamento

1. 15 templates.
2. Temas.
3. Documentação/atalhos.
4. Testes de performance e leitura.

---

## 14. Critérios de aceite

- [ ] Biblioteca com 6–15 templates bonitos e categorizados.
- [ ] Template tem variantes 16:9/9:16 e claro/escuro.
- [ ] Animação de entrada/saída por camada, com stagger.
- [ ] Steps funcionam no preview e no ar.
- [ ] Safe area e auto-fit validados.
- [ ] Hold sugerido pelo texto.
- [ ] Dados de convidado/RSS/planilha/placar preenchem slots.
- [ ] Regras escondem slot vazio.
- [ ] Fila/rundown com preparar/no ar/próximo.
- [ ] Pelo menos 2 layers simultâneos.
- [ ] HTML transparente para OBS/vMix.
- [ ] Export/import de template.
- [ ] Operador consegue ir ao ar em ≤ 3 cliques.

---

## 15. Decisões em aberto

1. O hub Grafismo substitui os menus atuais ou fica como painel adicional?
2. Quantos layers simultâneos no MVP: 1+ ticker ou 3?
3. OGraf é prioridade ou só JSON próprio?
4. HTML output vem antes ou depois de dados/rundown?
5. Vamos importar PSD (vMix) ou começar com JSON/OGraf?
6. Template variants por output ou por query string?
7. IA de texto (sugerir título/resumo) entra ou fica fora?

---

## 16. Veredito EGM

O mercado mostra três padrões:

1. **vMix GT** vence em autoria/animação, mas é um editor pesado.
2. **SPX/Singular/H2R** vencem em **controle, rundown, dados e HTML**.
3. **OGraf** é o caminho para templates portáveis.

O CastDeck já tem uma base boa de camadas, regras e operador. O que falta não é “mais um campo”:
é **design system + animação + templates + dados + fila + HTML**.

A recomendação é a **Opção C**:

- manter o editor simples para o operador;
- dar poder real ao criador;
- unificar o controle em **Grafismo**;
- começar por templates bonitos e animação;
- depois fila, dados e HTML/OGraf.

O primeiro ciclo ideal entrega:

1. 6 templates;
2. grupos e formas;
3. animação por camada;
4. safe area/leitura;
5. variantes 16:9/9:16;
6. um controlador de fila simples.
