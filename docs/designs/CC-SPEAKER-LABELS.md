# DESIGN — Legenda com identificação de quem fala + melhorias de Closed Caption

Status: **implementado (opt-in, padrão desligado)** · Autor: Miguel / CastDeck · Data: 2026-10-31
Implementação: `server/caption.js` (dica via WS + carimbo), `public/js/studio/captions.js` (tracker/UI),
`public/js/cc.js` + `public/cc.html` (rótulo no link), teste `test/caption-speaker.test.mjs`.

## 1. Concept brief (brainstorm)

### Problema

Hoje a legenda é um **único fluxo de texto**: o `captionBus` do mixer mistura todas as fontes com CC ligado
(microfones, convidados, mídias) e o worker transcreve o mix. Quem assiste não sabe **quem falou**, e em
conversas com convidados a leitura fica ambígua ("...eu acho que sim" — de quem?).

### Hipótese

Se cada trecho da legenda vier com o **nome da fonte de áudio dominante** (`Host:`, `Ana:`, `Mídia:`), a
compreensão melhora sem custo de um segundo modelo, porque o estúdio já sabe quais fontes estão no ar e
quanta energia cada uma tem.

### 6 lentes (goldfish)

| Lente | Pergunta | Resposta |
|---|---|---|
| Valor | resolve dor real? | Sim em entrevistas/mesas; em live solo o rótulo é dispensável (padrão **desligado**). |
| Viabilidade | dá para fazer sem outro modelo? | Sim: atribuição por energia/VAD no cliente + carimbo no servidor. |
| Custo | quanta CPU? | ~0 no servidor; no cliente, ler analisadores já existentes a 4 Hz. |
| Risco | o que quebra? | Fala sobreposta, música alta, convidado com eco; mitigar com margem + fallback sem rótulo. |
| Acessibilidade | ajuda? | Sim: identifica interlocutor; combina com cor por fonte e leitura por CPS. |
| Operação | dá para desligar? | Sim: `off` (padrão) / `auto` / `sempre` por estúdio; não altera o texto do worker. |

### Fora de escopo (v1)

- Diarização por voz (quem falou dentro do mesmo microfone).
- Separação de fontes por IA (source separation).
- Identificar o locutor pelo timbre.

## 2. Objetivos e não-objetivos

**Objetivos**

1. Rotular `partial`/`final` com a fonte dominante **quando a opção estiver ligada** (padrão: desligado).
2. Não aumentar a latência perceptível (< 50 ms adicionais) nem criar um worker por fonte.
3. Funcionar no estúdio, no overlay `/cc` e na tradução.
4. Melhorar a legibilidade do CC (CPS, quebra de linha, pontuação, cores).
5. Ser desligável e não quebrar o fluxo atual (Whisper/Parakeet).

**Não-objetivos**

- Garantir 100% de acerto em falas simultâneas.
- Rotular fontes sem CC ligado.

## 3. Opções avaliadas

| Opção | Como | Prós | Contras | Veredito |
|---|---|---|---|---|
| A. Um worker por fonte | cada fonte com CC vira um stream PCM próprio | rótulo exato; textos independentes | N workers, RAM/CPU ×N, mistura/ordem complexa | inviável em PC fraco |
| B. Atribuição por energia (recomendada) | um worker no mix; cliente mede RMS por fonte e envia "quem está falando" | custo ~0; usa infra atual | aproxima em sobreposição | **v1** |
| C. Diarização | modelo de speaker embedding | separa vozes no mesmo mic | peso, latência, complexidade | v2/v3 |

**Decisão:** B, com histórico curto de falantes para carimbar os finais.

## 4. Arquitetura (opção B)

```text
┌ estúdio (browser) ─────────────────────────────────────────────┐
│ mixer.sources (id, stageKey, toCaption, analyser)              │
│   └─ SpeakerTracker 4 Hz: RMS por fonte com CC                  │
│        └─ a cada 250 ms: {type:"speaker", id, name, level}     │
│ captions.js: worklet PCM 16 kHz ──► WS /caption (binário)       │
└────────────────────────────────────────────────────────────────┘
                 │ texto (JSON)                    │ áudio (binário)
                 ▼                                 ▼
┌ servidor ──────────────────────────────────────────────────────┐
│ caption.js: speakerHint = {id,name,at} (últimos 2 s)            │
│   onEvent(partial/final) → stamp speaker se |now-at| < 1200 ms  │
│   dedupe de rótulo repetido; sem rótulo se ambíguo              │
└────────────────────────────────────────────────────────────────┘
```

### Protocolo

Cliente → servidor (WS `/caption`, mensagem **texto** JSON):

```json
{ "type": "speaker", "id": "guest:abc", "name": "Ana", "level": -18.3, "at": 1730000000000 }
```

Servidor → clientes (mesmo canal de `partial`/`final`):

```json
{ "type": "final", "id": "s1", "text": "vamos começar", "lang": "pt",
  "speaker": { "id": "guest:abc", "name": "Ana" }, "t": 1730000000123 }
```

- `speaker` é **opcional**; ausente = sem rótulo.
- O servidor aceita mensagens de texto no `handleStudio` (hoje só trata binário) e ignora `speaker` de estúdio
  que não seja o dono da legenda.

### Regras de atribuição

1. Só entram fontes com `cc` ligado e `muted === false`.
2. Fonte dominante = maior RMS; exige **margem** de 1,5× sobre a segunda e RMS acima de −45 dBFS.
3. Histerese: mantém o falante atual por 600 ms para não piscar entre sílabas.
4. Sem dominância clara → `speaker: null` (não chuta).
5. `final` usa a janela dos últimos 1,2 s; `partial` usa o instante atual.
6. Dedupe: se o mesmo falante já rotulou o parágrafo, não repete o nome na linha seguinte.

### Nomes das fontes (decisão)

- Usa **o nome que a fonte tiver no estúdio**, seja pessoa, convidado, câmera, tela ou mídia:
  `sourceLabel(source)` = título/rótulo do canal (`Host`, `Ana`, `Mídia 1`, `Tela`, `Câmera 2`).
- Se a fonte não tiver nome, cai para o tipo ("Convidado", "Mídia", "Microfone") — nunca fica vazio.
- Sanitizar (máx. 24 chars, sem quebra de linha); nomes iguais recebem sufixo (“Ana 2”).
- O nome é congelado no momento do carimbo (renomear a fonte não reescreve a legenda já exibida).

## 5. UI e configuração

- **Legendas → Reconhecimento → “Mostrar quem fala”**: **`Desligado` (padrão)** / `Auto` / `Sempre`.
  - **Padrão desligado:** nada muda para quem já usa a legenda; o rótulo só aparece se o operador ligar.
  - `Auto`: rotula somente quando houver **2+ fontes com CC** e dominância clara.
  - `Sempre`: rotula sempre que houver fonte dominante, mesmo com uma fonte só.
- **“Quando rotular”** (decisão do usuário): `Parcial e final` (padrão) / `Só no final` / `Só no parcial`.
  O padrão `Parcial e final` mantém a leitura contínua; `Só no final` evita o nome “piscando” quando há troca rápida.
- Formato: `Nome: texto` (padrão) ou chip colorido no overlay.
- Cores por fonte (paleta com contraste AA), estáveis por `id`.
- No `/cc`: `<span class="cc-who">Ana</span> texto`; opção `who=0` na URL para desligar.
- No estúdio: o mesmo rótulo no PGM e no preview.

## 6. Melhorias de Closed Caption (análise)

| Área | Hoje | Proposta |
|---|---|---|
| Latência | parcial ~1 s; final ~1,5–2 s | parcial 500 ms no Parakeet; final com VAD 350 ms |
| Pontuação | depende do modelo | pós-processo leve: capitaliza início, ponto final, vírgula em pausas longas |
| Leitura (CPS) | sem limite | alvo 17 CPS: **encurtar por cláusula** primeiro; se não der, **segurar até 1,3× o tempo** calculado |
| Quebra | por largura | quebrar em fronteira de cláusula; máx. 2 linhas × 32 chars |
| Nomes próprios | dicionário | dicionário por estúdio + correção pós-STT (fuzzy) |
| Palavrões | passa | filtro opcional (máscara parcial) por estúdio |
| Tradução | texto separado | manter par PT/EN sincronizado e rótulo de falante nos dois |
| Cores/contraste | estilo único | cor por falante com contraste AA e opção “fundo sólido” |
| Acessibilidade | — | `aria-live="polite"` no `/cc`; velocidade de revelação configurável |

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Crosstalk (dois falam juntos) | margem + histerese + fallback sem rótulo |
| Música/mídia alta | fonte de mídia não entra por padrão (CC desligado nela) |
| Eco do convidado | AEC ligado por padrão; nível muito baixo não domina |
| Relógio cliente/servidor | servidor usa `Date.now()` no recebimento, não o `at` do cliente |
| Privacidade | nomes ficam no servidor local; nada vai para a nuvem |

## 8. Plano de testes

- **Unitário (servidor):** carimbo por janela, dedupe, fallback nulo, fonte sem CC.
- **Unitário (cliente):** dominância com margem, histerese, label sanitization.
- **e2e:** duas fontes alternando (mic + convidado fake) → finais com `speaker` correto em ≥ 85% das trocas.
- **Regressão:** legenda solo continua sem rótulo; `/cc` e tradução seguem funcionando.
- **Carga:** 3 fontes, 1 worker; medir CPU e latência antes/depois.

## 9. Rollout

1. Protocolo + tracker atrás de flag `ccSpeaker` (default `off`).
2. UI e `/cc` com o rótulo.
3. Medir precisão em live real; ajustar margem/histerese.
4. Se necessário, evoluir para diarização (opção C) sem mudar o contrato.

## 10. Decisões (revisão do usuário)

| # | Pergunta | Decisão |
|---|---|---|
| 0 | Rotular por padrão? | **Não.** `Desligado` é o padrão; a feature é opt-in por estúdio. |
| 1 | Rótulo no parcial ou no final? | **Opção do usuário**: `Parcial e final` (padrão quando ligado), `Só no final`, `Só no parcial`. |
| 2 | Nome do convidado? | **O nome que a fonte tiver** (pessoa, convidado, mídia, tela, câmera); fallback pelo tipo. |
| 3 | CPS: encurtar ou segurar? | **Encurtar por cláusula**; se ainda estourar, segurar até **1,3×**. (Recomendação técnica — sem certeza do usuário.) |

Pendência de implementação: `ccWhoWhen` (`both` \| `final` \| `partial`) por estúdio e por URL do `/cc` (`who=0|1`, `whowhen`).
