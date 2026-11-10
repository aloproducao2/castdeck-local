# EGM — Auditoria de consistência dos menus

> **Status:** auditoria concluída em 2026-11-02. Acessibilidade na **1.3.15**; **renomeações e mudança de IA
> aplicadas na 1.3.16** (local). Itens P1/P2 abaixo marcados como resolvidos.
> **Escopo:** 9 grupos, 17 abas do painel lateral, topbar e bottombar do estúdio.

---

## 1. Concept brief (6 lentes)

| Lente | Pergunta | O que a auditoria buscou |
|---|---|---|
| **Consistência** | O mesmo conceito tem o mesmo nome, ícone e lugar? | “Saídas” × “Transmissão”, “Banners” × “Jornal”, ícones repetidos |
| **Hierarquia** | O que é principal aparece primeiro? | 4 grupos de aba única, atalhos da topbar vs painel |
| **Nomenclatura** | O rótulo descreve o conteúdo? | “Enquetes” (tem QR), “Dispositivos” (tem gravação), “Público” (tem chat privado) |
| **Acessibilidade** | Todo controle tem nome? | 9 swatches e 1 botão de enviar sem `aria-label`/`title` |
| **Descoberta** | Dá para achar a função sem saber onde está? | WhatsApp/câmeras em dois lugares; Remoto/Replay só na topbar |
| **Manutenção** | O que quebra sem aviso? | Botão sem handler (`#rss-add`, 1.3.14) |

---

## 2. Método

Auditoria headless (Edge/CDP, 1400×900, UA desktop) com o estúdio real:

1. Abriu cada uma das 17 abas e verificou: painel existe, renderiza sem exceção, sem `id` duplicado.
2. Contou botões sem nome acessível (`textContent` + `title` + `aria-label`).
3. Comparou rótulos, ícones, ids e agrupamento com o conteúdo real de cada painel.
4. Cruzou os atalhos da topbar/bottombar com as abas do painel.
5. Caça manual a handlers ausentes (o caso `#rss-add` foi encontrado assim).

**Resultado bruto:** 17/17 painéis existem e renderizam; **0 exceções**; **0 ids duplicados**; 1 painel com 9 botões sem nome (Marca) e 1 com 1 botão sem nome (Chat).

---

## 3. Inventário

| Grupo | Aba (id) | Ícone | Conteúdo | Observação |
|---|---|---|---|---|
| Conteúdo | Mídia (`media`) | film | vídeos/áudios/imagens | ok |
| Conteúdo | Banners (`banners`) | banner | GCs/banners salvos | **mesmo ícone do Jornal**; lista banners `style:'news'` |
| Conteúdo | Jornal (`journal`) | banner | GC de jornalismo + **RSS/letreiro** | RSS mora aqui, não em Banners |
| Conteúdo | Esportes (`sports`) | ball | placar/cronômetro | ok |
| Visual | Marca (`brand`) | brand | cores, logo, overlay | 9 swatches sem nome (corrigido) |
| Visual | Exibição (`display`) | display | nomes/espaçamento | ok |
| Interatividade | Enquetes (`widgets`) | widgets | enquetes + QR | rótulo mais estreito que o conteúdo |
| Interatividade | Mensagens (`messages`) | inbox | mensagens do público | ok |
| Interatividade | WhatsApp (`whatsapp`) | whatsapp | bridge local | depende do bridge no PC |
| Público | Chat (`chat`) | chat | chat **host + convidados** | não é público/audiência |
| Público | Redes (`social`) | social | comentários YouTube/Twitch | ok |
| Diretor | Diretor (`director`) | spark | corte automático | ícone igual ao grupo Interatividade |
| Áudio | Mixer (`audio`) | mixer | volumes | ok |
| Legendas | Legendas (`captions`) | cc | legenda ao vivo | ok |
| Saídas | Saídas (`outputs`) | screen | sinais OBS/vMix | **nome colide com “Transmissão”**; ícone igual a “Tela” |
| Ajustes | Transmissão (`output`) | broadcast | destinos/qualidade/gravação | id vizinho de `outputs` |
| Ajustes | Dispositivos (`devices`) | cam | nome/câmera/mic/pasta | rótulo estreito (inclui gravação) |

Topbar: Estúdio · Mesa de corte · Replay & VAR · 9:16 Vertical · WhatsApp · Câmeras · Controle remoto · Tela cheia · Painel · Gravar · Transmitir.
Bottombar: Microfone · Câmera · Convidar · Mídia · Tela · Aba · Nomes · Cursor · Ajustes · Sair.

---

## 4. Achados priorizados

### P1 — confundem a operação

1. **“Saídas” × “Transmissão”**
   - Grupo **Saídas** (`outputs`) = sinais para OBS/vMix; aba **Transmissão** (`output`) = destinos YouTube/Twitch.
   - Os rótulos não deixam claro “sinal local” vs “destino na internet”, e os ids diferem por uma letra (`output`/`outputs`).
   - **Recomendação:** renomear para **“Sinais”** (OBS/vMix) e **“Destinos”** (transmissão), ou “Saídas locais”/“Transmissão”.

2. **“Banners” × “Jornal” × RSS**
   - O gerador de jornal salva em `S.banners` com `style:'news'`, então o mesmo item aparece em **Banners** e **Jornal**.
   - RSS/letreiro fica em **Jornal**, mas o operador chama de “banners”.
   - **Recomendação:** transformar **Banners** em “GCs & Letreiro” (com o bloco RSS) ou mover o RSS para Banners e deixar Jornal só para o GC.

3. **“Público” > “Chat”**
   - O grupo se chama Público, mas o Chat é privado (host + convidados), como o próprio hint diz.
   - **Recomendação:** mover Chat para Interatividade ou renomear o grupo para “Pessoas”.

4. **Atalho “Ajustes” abre um lugar diferente do grupo “Ajustes”**
   - O botão da bottombar abre direto **Dispositivos**; o grupo da lateral abre a última aba usada (padrão **Transmissão**).
   - **Recomendação:** o atalho abrir o grupo (primeira aba) ou ser rotulado “Dispositivos”.

5. **Descoberta inconsistente**
   - WhatsApp e Câmeras estão na topbar **e** no painel; Remoto e Replay existem **só** na topbar.
   - **Recomendação:** definir a topbar como atalhos e garantir que toda função tenha também um lugar no painel (ou documentar o contrário).

### P2 — polimento

6. **Ícones repetidos:** `banner` em Banners e Jornal; `spark` em Interatividade e Diretor; `screen` em Saídas e “Tela”. Criar `news`, `auto` e `signal` no mapa de ícones.
7. **Acessibilidade:** 9 swatches de cor sem nome e o botão de enviar do chat só com ícone — **corrigido na 1.3.15** (`title`/`aria-label`; `aria-pressed` nos swatches).
8. **Ritmo vertical:** grupos de aba única (Diretor/Áudio/Legendas/Saídas) escondem a linha de sub-abas e o painel começa 52 px mais alto (641 × 589). Normalizar o padding superior.
9. **Rótulos estreitos:** “Enquetes” (inclui QR) → “Widgets & QR”; “Dispositivos” (inclui gravação) → “Dispositivos & gravação”.
10. **WhatsApp sem estado de indisponibilidade:** se o bridge local não estiver ativo, a aba deveria explicar/desabilitar em vez de parecer vazia.
11. **Lint de handlers:** o `#rss-add` ficou sem `onclick` e ninguém notou. Um teste de fumaça que clica em todo botão de formulário evitaria regressões.

---

## 4.3 Resolvido na 1.3.16 (estrutural)

| Antes | Depois |
|---|---|
| Grupo/aba **Saídas** (`outputs`) | **Sinais** (`outputs`) — OBS/vMix |
| Aba **Transmissão** (`output`) | **Destinos** (`output`) — YouTube/Twitch/gravação |
| Aba **Enquetes** | **Widgets & QR** |
| Grupo **Público** | **Pessoas** (chat privado + redes) |
| Aba **Banners** | **GCs & Letreiro** |
| RSS/letreiro dentro de **Jornal** | movido para **GCs & Letreiro** (Jornal ficou só com GC) |
| Bottombar **Ajustes** → Dispositivos | **Dispositivos** (rótulo igual ao destino) |
| Ícones `banner` (Banners/Jornal), `spark` (Interatividade/Diretor), `screen` (Saídas/Tela) | novos ícones **news**, **auto** e **signal** |

Teste headless após a mudança: grupos `Conteúdo · Visual · Interatividade · Pessoas · Diretor · Áudio ·
Legendas · Sinais · Ajustes`; RSS com `#rss-add` dentro de **GCs & Letreiro**, G1 → **50 manchetes**,
`tickerOn=true`; Jornal sem RSS; sem exceções.

## 5. Correções já aplicadas

| Versão | Correção |
|---|---|
| 1.3.14 | `#rss-add` voltou a ter handler (RSS/letreiro) |
| 1.3.15 | `title` + `aria-label` + `aria-pressed` nos 9 swatches de cor e na cor personalizada |
| 1.3.15 | `aria-label`/`title`/`type=submit` no botão de enviar do chat |
| 1.3.16 | Renomeações Sinais/Destinos, Pessoas, GCs & Letreiro, Widgets & QR; RSS movido para GCs & Letreiro; ícones novos; bottombar Dispositivos |

Nenhuma renomeação estrutural foi feita para não quebrar o mapa mental do operador; ficam listadas acima para aprovação.

---

## 6. Critérios de aceite (próxima rodada)

- [ ] Nenhum botão do estúdio sem nome acessível (texto, `title` ou `aria-label`).
- [ ] “Saídas” e “Transmissão” com nomes que não se confundam.
- [ ] RSS/letreiro acessível a partir de **Banners** (ou Banners renomeado).
- [ ] Chat no grupo coerente com o conteúdo (privado × público).
- [ ] Atalho “Ajustes” e grupo “Ajustes” abrindo o mesmo destino.
- [ ] Teste de fumaça clicando em todos os botões de formulário dos 17 painéis, sem exceção.
