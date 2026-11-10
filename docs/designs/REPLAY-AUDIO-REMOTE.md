# EGM — Replay: monitoramento sem duplicar áudio + controle remoto

> **Status:** implementado na versão local **1.3.7** (não publicado na VPS).
> **Data:** 2026-11-01

---

## 1. Problema

1. O replay podia tocar áudio **duas vezes no mesmo PC**: o `<video>` de Preview do console, o monitor B
   (`#rp-video-pgm`) e o ângulo ativo do ISO quadrante tocam no computador do operador, enquanto o áudio do
   PGM/stream já está saindo pelo mixer. Não havia um mute **só do monitoramento local**.
2. Não havia como abrir o controle de replay em outro dispositivo da mesma rede.

---

## 2. Concept brief (EGM)

| Lente | Resposta |
|---|---|
| **Segurança** | Mute de monitoramento **não pode** calar o PGM/stream. São caminhos separados. |
| **Padrão** | O console **começa sempre mudo** no monitor local (evita duplicação acidental em toda abertura). |
| **Clareza** | Um botão de monitor (alto-falante) separado do mute geral; cor verde = ouvindo, vermelho = mudo. |
| **Controle remoto** | O operador de replay pode usar tablet/celular na mesma rede: link/QR existente + aba Replay. |
| **Operação** | Depois de copiar o link, o console abre uma janela remota; o celular já cai na aba Replay (`?tab=replay`). |
| **Risco** | O botão de monitor não altera roteamento PGM; o botão de mute geral continua existindo para emergência. |

---

## 3. Implementação

### 3.1 Monitoramento local

- `monitorMuted = true` (constante em memória; **sempre começa mudo**).
- `#rp-mon-mute` no rack de áudio do replay:
  - **Mudo** = `pvwVideo`, `pgmVideo` e os 4 vídeos do ISO em `muted`.
  - **Ouvindo** = apenas `pvwVideo`/ângulo ativo do ISO; o monitor B permanece mudo.
  - Se a rota estiver em `mute`, desmutar o monitor muda automaticamente para **CUE**.
- O PGM/stream continua sendo controlado pelo seletor de rota (`mute/cue/pgm/both`) e pelo mute geral.
- `quadIso.setMonitorMuted()` garante que o ângulo ativo também respeite o botão.

### 3.2 Controle remoto do replay

- **`#rp-btn-remote`** no console: pega o link da mesma rede (`window.opener.__castdeck.remote.link()`),
  acrescenta `&tab=replay`, copia para a área de transferência e abre a janela remota.
- A página remota ganhou a aba **Replay** (5ª aba):
  - Estado do buffer (s/ máx), NO AR/PAUSADO, velocidade e tempo.
  - Botões **5s/10s/15s/30s** → puxam o buffer e colocam o replay **direto no PGM** (áudio no programa).
  - **Pausar/Tocar**, **Voltar ao vivo**, **Buffer circular** e velocidades 25/50/75/100%.
- Snapshot do estúdio inclui `replay`; comandos novos: `replay-trigger`, `replay-stop`, `replay-pause`,
  `replay-play`, `replay-buffer`, `replay-speed`.
- **Primeiro clique no gatilho também funciona:** se o buffer estiver parado, o host inicia, espera o 1º
  pedaço e tenta recortar até 4 vezes (1,4 s + 3×0,8 s). Antes o primeiro clique só iniciava o buffer e não ia
  ao ar.
- **Velocidade escolhida no celular é lembrada** (`replaySpeed`): vale para o próximo gatilho e é aplicada na
  hora se o replay já estiver no ar.
- `?tab=replay` já abre a aba certa no celular/tablet; a navegação inferior foi para 5 itens.

---

## 4. Testes executados (headless)

- Replay console: `pvw` e `pgm` iniciaram **muted=true**; botão com classe `muted`.
- Link remoto gerado a partir do console: `http://192.168…/remote/<id>?k=…`.
- Aba Replay no link `&tab=replay`: ativa automaticamente, com 4 gatilhos, 4 velocidades e status.
- Sem overflow horizontal em 390×844; sem exceções de runtime.

---

## 4.1 Correção 1.3.9 — comandos não chegavam ao host

O servidor valida os comandos do controle remoto em `cleanRemoteCmd` (`server/signaling.js`) e **descartava**
todas as operações novas: `replay-trigger`, `replay-speed`, `send`, `audio-solo`, `mute-all`, etc. Por isso a
tela mostrava tudo, mas nada acontecia. Foram adicionadas à allowlist, com validação de barramento (A–G), nível
(0–2), segundos (1–60) e velocidade (0,05–2).

## 4.2 AUTO TAKE (ir ao ar direto)

- **Padrão ligado:** o gatilho de replay (console e remoto) coloca no ar direto.
- **Engine** guarda `autoTake` em `localStorage` (`castdeck.replay.autotake`), exposto por `getAutoTake/setAutoTake`.
- **Console:** botão `AUTO ON/OFF` no cabeçalho; `triggerReplay` dá TAKE automático quando ligado.
- **Remoto:** switch “Ir ao ar direto (AUTO TAKE)” na aba Replay; desligado, o host cria o clipe e manda para o
  Preview do console (`preview-clip`), sem ir ao ar.
- O estado é o mesmo nos dois lados (engine + `sendCommand`).

## 5. Pendências

- Teste em dois PCs/celulares reais na mesma rede (latência do comando e fuso do buffer).
- O gatilho remoto manda direto para o PGM; se o operador quiser pré-visualizar antes, será preciso um
  “preview remoto” (fase futura).
- Rota de áudio do replay remoto fixa em PGM; expor CUE/PGM na aba Replay é próximo passo.
