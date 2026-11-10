# EGM — Eco do host com microfone e caixa de som (sem fone)

> **Status:** análise e plano. **Nenhum código foi alterado.**
> **Pergunta:** quando o host usa microfone + caixa de som (sem fone), o áudio do programa volta pelo
> microfone e vira eco para os convidados e para a transmissão. Como diagnosticar, reduzir e testar?
> **Data:** 2026-11-03

---

## 1. Resumo executivo

Hoje o CastDeck depende do **cancelamento de eco do navegador** (`echoCancellation: true` no
`getUserMedia`) e do roteamento do mixer. O host ouve, por padrão, **convidados + mídias** (sem o próprio
microfone), mas essa saída vai para a caixa de som. O microfone captura essa caixa e devolve o áudio ao
convidado — exatamente o caminho clássico de eco.

O navegador **pode** cancelar esse eco, mas não em todos os cenários:

- o áudio passa por **Web Audio** (`AudioContext`), `setSinkId` e uma saída física escolhida;
- o host pode ligar **“Ouvir programa”**, que inclui o próprio microfone e cria realimentação;
- o modo **microfone bruto** (`rawMic`) desliga AEC/NS/AGC;
- caixas Bluetooth têm latência alta; volumes altos e microfone perto da caixa pioram;
- o AEC do Chromium pode não usar a saída Web Audio como referência em algumas combinações.

**Recomendação:** tratar o assunto em camadas:

1. **Diagnóstico e transparência:** detectar/avisar caixa de som, mostrar se AEC está ativo, oferecer teste.
2. **Modo caixa de som:** AEC ligado, “Ouvir programa” desligado, monitor em volume seguro, aviso claro.
3. **Medição real:** testar AEC com sinal conhecido, caixa/mic reais e convidado real; só então decidir se
   precisamos de AEC por software (WebRTC APM/WASM) ou de orientação mais dura (fone obrigatório).
4. **Fallback:** se o eco continuar, recomendar fone; não prometer “anti-eco” universal.

---

## 2. Como o áudio do host funciona hoje

### 2.1 Captura

`public/js/media.js`:

- `getMic()` e o lobby pedem `echoCancellation`, `noiseSuppression` e `autoGainControl` iguais a
  `!rawMic()`.
- `rawMic` é uma preferência salva; quando ligada, **desliga os três** (qualidade para música/instrumento).
- `channelCount: 1`.

Consequência: com `rawMic` ligado, não há AEC; com `rawMic` desligado, o AEC é o do Chromium/Edge.

### 2.2 Mixer e monitor

`public/js/studio/mixer.js`:

- `programBus` → limitador → `programDest` (o que vai ao stream/gravação).
- `monitorBus` → `ctx.destination`: o host ouve convidados + mídias; **não inclui o próprio microfone**.
- `programMonitor` → `ctx.destination`: opcional “Ouvir programa”, **inclui o próprio microfone**.
- `setSpeaker()` aplica `AudioContext.setSinkId(deviceId)`.
- O microfone do host entra em `mixer.addStream('host:mic', ...)`; convidados e mídias também entram no
  monitor conforme a rota.

Consequência: no modo padrão, a caixa toca os convidados; o microfone captura essa caixa; o AEC do navegador
tenta cancelar. No modo “Ouvir programa”, a caixa também toca a voz do host, criando um loop direto.

### 2.3 Caminho do eco

```text
convidado fala
  → programa/monitor
  → caixa de som do host
  → ar
  → microfone do host
  → AEC (tenta cancelar)
  → programa (com resíduo de eco)
  → convidado ouve a própria voz atrasada
```

O atraso inclui buffer do navegador, Web Audio, saída, ar e captura. Quanto maior o atraso (Bluetooth,
caixa com DSP, buffer alto), mais difícil para o AEC.

---

## 3. EGM — seis lentes

| Lente | Pergunta | Direção |
|---|---|---|
| **Acústica** | O que fisicamente causa o eco? | Volume, distância, posição do mic, caixa, mesa, sala, latência. |
| **Navegador/AEC** | O AEC do Chromium está funcionando? | Constraint real, referência de saída, `setSinkId`, Web Audio, rawMic, double-talk. |
| **Mixer/roteamento** | O host precisa ouvir o quê? | Monitor sem o próprio mic por padrão; “Ouvir programa” com aviso; AEC não corrige loop de monitor. |
| **UX/operador** | Como o host entende e corrige? | Detecção de caixa, aviso, teste de eco, modo caixa de som, recomendação de fone. |
| **Medição/teste** | Como provar melhora? | Sinal conhecido, ERL/ERLE, atraso, double-talk, convidado real, matriz de dispositivos. |
| **Suporte/fallback** | O que fazer quando o AEC falha? | Fone, reduzir volume, desligar “Ouvir programa”, microfone direcional, AEC por software. |

---

## 4. Hipóteses a testar

| # | Hipótese | Como confirmar | Ação se confirmar |
|---|---|---|---|
| H1 | AEC do Chromium cancela bem a caixa do notebook em volume normal | Sinal de teste + gravação; ERLE | Manter padrão e avisar |
| H2 | `AudioContext.setSinkId` quebra a referência do AEC | Comparar saída padrão × `setSinkId`; medir eco | Não usar saída alternativa para monitor ou usar AEC por software |
| H3 | Web Audio no caminho de monitor degrada o AEC | Comparar `<audio>` direto × Web Audio | Rever roteamento/duplicar referência |
| H4 | `rawMic` é a causa em usuários que reclamam de eco | Constraint `echoCancellation:false` + teste | Aviso forte/“modo caixa” desliga raw |
| H5 | “Ouvir programa” com caixa gera realimentação | Ligar/desligar; medir | Aviso e bloqueio no modo caixa |
| H6 | Bluetooth/ caixa com DSP tem atraso demais para o AEC | Medir atraso e ERLE | Recomendar fone; limitar modo caixa |
| H7 | Volume alto/distância curta vence o AEC | Testar 25/50/75/100% | Aviso de volume, ducking, fone |
| H8 | AEC do host é suficiente mesmo com convidado em caixa | Teste com 1–3 convidados | Se não, AEC por software ou fone |

---

## 5. Opções de produto

### A. Aviso + teste (mínimo)

- Detectar saída como “alto-falante” (rótulo do dispositivo, quando disponível) e mostrar:
  *“Você está usando caixa de som. Para evitar eco, use fone.”*
- Botão **Testar eco** no lobby/painel: toca um trecho curto na saída e grava o microfone; mede retorno e
  mostra “eco baixo/médio/alto”.
- Mostrar se o AEC está realmente ativo (`getSettings().echoCancellation`).

**Prós:** simples, honesto, não mexe no áudio.
**Contras:** depende do usuário; não resolve sozinho.

### B. Modo caixa de som (recomendado no MVP)

Um interruptor “Estou usando caixa de som” que:

- força `echoCancellation:true` (e `noiseSuppression` conforme o caso), mesmo que `rawMic` esteja ligado;
- desliga/bloqueia **“Ouvir programa”** (o loop direto);
- reduz o monitor para um volume seguro ou aplica ducking;
- mostra status “AEC ativo” e recomendação de fone;
- não altera o microfone para quem usa fone.

**Prós:** ataca as causas controláveis; mantém qualidade.
**Contras:** não garante AEC em todo hardware; precisa testar.

### C. AEC por software (se B não bastar)

- Processar o microfone com **WebRTC APM** (AEC3) ou WASM equivalente, usando a saída do programa como
  referência; ou usar `getUserMedia` com constraints mais fortes.
- Custo: latência, CPU, complexidade de referência, risco de piorar double-talk.

**Só depois de medir** H1–H8; não é MVP.

### D. Fone obrigatório

- Bloquear/avisar severamente quando a saída for caixa e o host estiver no ar.
- Melhor para qualidade, pior para usabilidade (host pode não ter fone).

### Matriz

| Opção | Esforço | Eficácia esperada | Risco |
|---|---|---|---|
| A. Aviso + teste | Baixo | Média (conscientização) | Baixo |
| B. Modo caixa | Médio | Alta se AEC funcionar | Médio |
| C. AEC software | Alto | Alta, mas imprevisível | Alto |
| D. Fone obrigatório | Baixo | Alta | Alto atrito |

**Recomendação:** **A + B** no MVP; **C** só se os testes mostrarem que o AEC nativo não dá conta.

---

## 6. UX proposta

### 6.1 Lobby / Dispositivos

- Ao escolher a saída, mostrar o tipo quando o rótulo permitir (`Headphones`, `Speakers`, `Bluetooth`).
- Se não for fone: card de aviso:
  > **Caixa de som detectada**  
  > O microfone pode captar o áudio dos convidados. Use fone ou ative o modo caixa de som.
- Botão **Testar eco** (opcional):
  1. toca um sinal curto na saída escolhida;
  2. grava 3 s do microfone;
  3. mostra “Eco baixo / médio / alto” e um botão “Usar modo caixa”.
- Não bloquear o botão “Entrar no estúdio”.

### 6.2 Painel de áudio

Seção **Monitor**:

- “Ouvir programa” com aviso: *inclui seu microfone; com caixa de som pode gerar eco*.
- Interruptor **Modo caixa de som**.
- Status: `AEC: ativo` / `AEC: indisponível` / `Microfone bruto: AEC desligado`.
- Quando modo caixa ligado:
  - “Ouvir programa” desabilitado (ou exige confirmação);
  - volume do monitor limitado/ducking;
  - aviso “Use fone para qualidade máxima”.

### 6.3 Microfone bruto

- Se `rawMic` estiver ligado e a saída não for fone, mostrar confirmação:
  > “Microfone bruto desliga o cancelamento de eco. Com caixa de som, o eco pode voltar.”
- Não desligar `rawMic` silenciosamente; oferecer “Ativar modo caixa (liga AEC)”.

### 6.4 Convidado

- O convidado também pode usar caixa; o AEC do navegador dele é a primeira defesa. A UI do convidado deve
  mostrar a mesma dica de fone.
- Se o convidado ouvir eco, o problema pode ser o host **ou** o próprio convidado; o teste deve separar.

---

## 7. Estado e configuração

| Preferência | Uso | Onde |
|---|---|---|
| `rawMic` | desliga AEC/NS/AGC | prefs do lobby/estúdio |
| `speakerId` | saída do monitor | prefs |
| `listenProgram` | ouve o programa inteiro (inclui host) | mixer/estado |
| `monitorVol` | volume do monitor | mixer/estado |
| `echoMode` (novo) | `auto` / `headset` / `speakers` | prefs + UI |
| `echoTest` (novo) | último resultado do teste (baixo/médio/alto, data) | localStorage/estado |

Regras:

- `echoMode=speakers` força AEC e desliga `listenProgram`; não muda o dispositivo.
- `echoMode=auto` detecta pelo rótulo da saída; se não souber, pergunta.
- Android/mobile: sem DSK, mas o áudio é o mesmo; testar caixa do celular/tablet também.

---

## 8. Plano de testes

### 8.1 Teste físico controlado

**Equipamentos:**

- notebook com mic e caixa embutidos;
- microfone USB;
- caixa Bluetooth;
- headset com fone;
- caixa externa;
- segundo dispositivo (celular/PC) como “convidado” e como ouvinte.

**Cenários mínimos:**

| # | Microfone | Saída | AEC | Monitor | O que medir |
|---|---|---|---|---|---|
| 1 | notebook | caixa notebook | on | convidados | eco no retorno do convidado |
| 2 | notebook | caixa notebook | off/raw | convidados | piora esperada |
| 3 | USB | caixa externa | on | convidados | AEC com dispositivo diferente |
| 4 | USB | headset | on | programa | sem eco (controle) |
| 5 | Bluetooth | caixa BT | on | convidados | latência e resíduo |
| 6 | notebook | caixa notebook | on | programa | realimentação |
| 7 | qualquer | caixa | on | volume 25/50/75/100% | limiar de eco |
| 8 | qualquer | caixa | on | 1/2/3 convidados | double-talk |

### 8.2 Sinal e medição

- **Sinal de teste:** ruído rosa ou chirp logarítmico de 2–5 s, reproduzido pelo monitor; gravar o microfone
  com AEC ligado/desligado.
- **Atraso:** correlação cruzada entre sinal reproduzido e sinal capturado; reportar ms.
- **ERL/ERLE:** diferença de nível entre o sinal de referência e o eco capturado, antes/depois do AEC
  (quanto maior, melhor). Meta inicial: **≥ 20 dB de redução** e eco inaudível em volume normal.
- **Double-talk:** host fala enquanto convidado fala; verificar se o AEC corta a voz do host ou deixa passar
  o eco.
- **WebRTC stats:** quando disponível, `echoReturnLoss` / `echoReturnLossEnhancement` e `getSettings()`.
- **Teste subjetivo:** convidado real relata eco; gravar 30 s de conversa e ouvir o programa.

### 8.3 Teste automatizado possível

- Unitário: constraints refletem `rawMic`/modo caixa; `setListenProgram` desliga no modo caixa; estado
  persiste.
- E2E com Edge + dispositivos falsos: valida UI/estado e que o AEC é solicitado; **não simula eco acústico**.
- Loopback de áudio virtual (VB-Cable/BlackHole) pode simular uma referência, mas não substitui caixa+mic
  reais; usar como complemento.
- Teste de regressão: música com `rawMic` (sem AEC) e fone (AEC não deve destruir a qualidade).

### 8.4 Critérios de aceite

- [ ] Com caixa e AEC ligado, o convidado **não ouve eco audível** em volume normal.
- [ ] “Ouvir programa” com caixa é bloqueado/avisado e não gera realimentação.
- [ ] `rawMic` + caixa mostra aviso claro e oferece modo caixa.
- [ ] Fone continua funcionando sem processamento indesejado.
- [ ] Bluetooth é tratado como caso de risco (aviso), não promessa.
- [ ] O teste de eco mostra resultado coerente com a percepção do convidado.
- [ ] Nenhuma regressão no mixer, gravação ou transmissão.

---

## 9. Riscos

| Risco | Mitigação |
|---|---|
| AEC nativo não cancela com Web Audio/setSinkId | Medir H2/H3; testar saída padrão; se necessário, AEC software |
| AEC “come” a voz do host (double-talk) | Teste de double-talk; não forçar AEC para quem usa fone |
| Detecção de “caixa” errada | Não bloquear; pedir confirmação; permitir “é fone” |
| Bluetooth com atraso alto | Aviso explícito; recomendar fone com cabo/USB |
| Volume alto vence o AEC | Limitar/ducking no modo caixa; orientar |
| Usuário depende de caixa e não tem fone | Modo caixa + monitor baixo + aviso; não impedir a live |
| Eco do convidado confundido com eco do host | Teste separado (host grava, convidado grava, comparar) |
| Regressão para música/rawMic | Preservar opção raw; AEC só quando necessário |

---

## 10. Roadmap

### Fase 0 — Diagnóstico
- [ ] Reproduzir o eco em bancada com caixa + mic reais.
- [ ] Medir H1–H8 (AEC, setSinkId, Web Audio, rawMic, monitor, Bluetooth, volume).
- [ ] Definir limiar de aceite (ERLE/eco audível).

### Fase 1 — Transparência + segurança
- [ ] Mostrar tipo de saída e status do AEC.
- [ ] Aviso de caixa de som no lobby/painel.
- [ ] Aviso ao ligar “Ouvir programa” com caixa.
- [ ] Aviso ao usar `rawMic` com caixa.

### Fase 2 — Modo caixa de som
- [ ] `echoMode` e persistência.
- [ ] Forçar AEC/NS quando `speakers`.
- [ ] Bloquear/limitar `listenProgram` e monitor.
- [ ] Ducking/volume seguro.
- [ ] Teste de eco no lobby.

### Fase 3 — Medição contínua
- [ ] Teste objetivo automatizado (quando possível).
- [ ] Teste com convidado real na matriz de dispositivos.
- [ ] Ajustar limiares e mensagens.

### Fase 4 — Se necessário
- [ ] AEC por software (WebRTC APM/WASM) com referência.
- [ ] Cancelamento dedicado para caixa.
- [ ] Perfis por dispositivo (notebook, USB, Bluetooth).

---

## 11. Perguntas para decidir

1. O modo caixa de som deve ser **manual** (usuário declara), **automático pelo rótulo**, ou os dois?
2. Podemos **bloquear** “Ouvir programa” no modo caixa ou apenas avisar?
3. Qual o alvo de qualidade: eco inaudível em volume normal ou ausência total de eco?
4. O host precisa de monitor quando usa caixa? Se sim, aceita volume mais baixo/ducking?
5. `rawMic` deve ser desligado automaticamente no modo caixa ou só avisado?
6. Vamos investir em AEC por software se o nativo falhar, ou tratar fone como requisito?
7. Testar também o eco do **convidado** com caixa, ou só o host neste ciclo?

---

## 12. Veredito EGM

O eco do host com caixa de som **não é um bug de uma linha**: é um problema acústico com uma parte
controlável pelo software (constraints, monitor, rawMic, aviso) e outra que depende do hardware/sala.

O caminho certo é:

1. **medir** antes de prometer;
2. **avisar** e dar controle (modo caixa);
3. **não deixar** “Ouvir programa” + caixa criar loop;
4. **respeitar** quem usa fone/rawMic;
5. só então decidir por AEC por software.

Sem essa disciplina, o risco é “consertar” o eco destruindo a voz do host ou a qualidade de música.
