# EGM — Teste do item 4: modo caixa de som / eco

> **Status:** teste local e plano. **Nenhum código foi alterado neste ciclo.**
> **Base:** CastDeck Local 1.3.28 + itens 4/5/8 locais (não publicados).
> **Data:** 2026-11-03

---

## 1. O que foi testado

O item 4 do relatório EGM é o **assistente de caixa de som / eco**:

- aviso de caixa no lobby;
- **Testar alto-falante**;
- checkbox **Estou usando caixa de som**;
- forçar AEC/NS/AGC;
- desligar **“Ouvir programa”**;
- reabrir o microfone com o modo seguro.

Testes feitos no Edge headless com **dispositivo falso** (`--use-fake-device-for-media-stream`),
sem simulação de eco acústico.

---

## 2. Resultados dos testes

| Teste | Resultado |
|---|---|
| `getMic` com `rawMic=true`, modo caixa desligado | `echoCancellation=false`, `noiseSuppression=false`, `autoGainControl=false` |
| `getMic` com `speakerMode=true` | `echoCancellation=true`, `noiseSuppression=true`, `autoGainControl=true` |
| `getMic(..., {echoSafe:true})` | constraints ligadas |
| Ativar modo caixa na UI | track do microfone trocado, novo track `live`, AEC/Ns/AGC true |
| “Ouvir programa” | desmarcado e `mixer.listenProgram=false` |
| Preferência | `speakerMode=true` salvo em `castdeck.devices` |
| Aviso da UI | “Modo caixa de som ativo: AEC forçado…” |
| Testar alto-falante | `testSpeaker()` retornou `true` |
| Erros de runtime | nenhum |

Isso prova que o **contrato de constraints e a UI** funcionam. **Não prova** que o eco acústico foi
cancelado.

---

## 3. Limitações do teste

O dispositivo falso:

- não tem microfone e caixa reais;
- não tem acoplamento acústico;
- não tem latência de caixa/Bluetooth;
- não reproduz o caminho `caixa → ar → microfone`;
- pode aceitar `echoCancellation:true` sem que o AEC seja eficaz.

Portanto, `getSettings().echoCancellation === true` é **condição necessária, não suficiente**.

---

## 4. Achados e riscos

### E1 — O modo pode dizer “ativo” mesmo se a reabertura falhar

`applySpeakerMode`:

1. salva a preferência;
2. tenta abrir novo microfone;
3. se falhar, mostra toast.

Mas a preferência já ficou `speakerMode=true` e o microfone antigo continua sem AEC forçado. A UI
mostra “modo caixa ativo”, embora o stream atual não esteja no modo seguro.

**Risco:** falso sentimento de proteção.

### E2 — `rawMic` continua parecendo ligado

Com modo caixa ativo, o AEC é forçado, mas o checkbox **“Áudio puro”** pode continuar marcado. O
operador vê duas configurações contraditórias.

**Risco:** achar que está em áudio puro quando não está.

### E3 — Trocar o microfone durante a live pode gerar clique/dropout

A implementação atual **reabre** o microfone (`getUserMedia` novo, troca no mixer). Isso pode gerar
um pequeno silêncio/clique.

**Alternativa a testar:** `track.applyConstraints({ echoCancellation:true, ... })` no track atual,
evitando nova captura quando o navegador permitir.

### E4 — Não há medição real de eco

“Testar saída” toca um tom; não mede retorno pelo microfone. Não há como dizer “eco baixo/médio/alto”.

**Risco:** o usuário ativa o modo, mas continua com eco e não sabe.

### E5 — Detecção de caixa é heurística

O aviso depende do rótulo do dispositivo (`Speakers`, `Headphones`). “Padrão do sistema” não informa
nada; Bluetooth pode se chamar apenas “Áudio”.

**Risco:** falso positivo/negativo.

### E6 — AEC com Web Audio/setSinkId não foi validado

O host ouve pelo `AudioContext` e pode usar `setSinkId`. O AEC do Chromium pode ou não usar essa
saída como referência. O teste de constraints não cobre isso.

### E7 — Guests compartilham o mesmo `castdeck.devices` no navegador

Se host e convidado usarem o mesmo navegador/perfil, `speakerMode` pode afetar o guest. Em geral são
dispositivos diferentes, mas o estado é global por origem.

### E8 — Sem feedback do AEC real

A UI não mostra `getSettings().echoCancellation`, `noiseSuppression` e `autoGainControl` do stream
atual. O operador não sabe o que o navegador realmente aplicou.

### E9 — Sem teste de double-talk

Ativar AEC pode cortar a voz do host enquanto o convidado fala. Não há teste de conversa simultânea.

### E10 — O modo não cobre o retorno do convidado

O host pode estar em modo caixa e o **convidado** também usar caixa. O problema pode ser do lado do
convidado; a UI do host não diagnostica isso.

---

## 5. EGM — seis lentes

### 5.1 Operador / UX

Precisa de:

- estado verdadeiro (“AEC aplicado neste microfone”);
- opção clara entre “caixa” e “fone”;
- teste de eco que dê resultado;
- aviso quando `rawMic` e modo caixa conflitam;
- possibilidade de desfazer sem sair da live.

### 5.2 Áudio / acústica

O que importa é o **eco residual no retorno do convidado**, não a constraint. Medir:

- ERL/ERLE;
- atraso;
- double-talk;
- volume;
- posição/distância;
- Bluetooth.

### 5.3 Navegador / Web Audio

Testar:

- saída padrão × `setSinkId`;
- áudio por Web Audio × elemento `<audio>`;
- AEC ligado/desligado;
- rawMic;
- Chrome/Edge, Windows/macOS/Android.

### 5.4 Mesa / estado

- modo caixa ligado/desligado;
- troca de dispositivo;
- mute;
- “Ouvir programa”;
- sessão salva;
- reconexão.

### 5.5 Persistência / dispositivos

- `speakerMode` por dispositivo, não global?
- restaurar preferência sem reabrir microfone de forma inesperada;
- labels de dispositivo.

### 5.6 Qualidade / suporte

- diagnóstico exportável com constraints reais;
- teste de eco reproduzível;
- matriz de hardware;
- logs.

---

## 6. Plano proposto

### Fase 0 — Diagnóstico verdadeiro

1. Mostrar no painel os valores reais do track:
   - `echoCancellation`;
   - `noiseSuppression`;
   - `autoGainControl`;
   - deviceId/label.
2. Se o modo caixa estiver ativo e o track atual não tiver AEC, mostrar **“modo não aplicado”**, não
   “ativo”.
3. Se a reabertura falhar, reverter `speakerMode` para false ou marcar pendente.
4. Diferenciar `speakerMode` de `rawMic` na UI: quando o modo força AEC, mostrar “AEC forçado pelo
   modo caixa” e desabilitar/avisar o raw.

### Fase 1 — Teste de eco real

Adicionar um assistente:

1. tocar um chirp curto na saída escolhida;
2. gravar 2–3 s do microfone;
3. calcular correlação/atraso e nível de retorno;
4. mostrar **eco baixo/médio/alto**;
5. sugerir: usar fone, baixar volume, ativar modo caixa, reposicionar mic.

Importante: o teste precisa deixar claro que é uma **estimativa**, não uma promessa de AEC.

### Fase 2 — Aplicação sem dropout

- Tentar `track.applyConstraints` no microfone atual.
- Se o navegador não permitir, reabrir em momento seguro, com crossfade/mute curto.
- Preservar mute, rota, nível e nome.
- Testar em live.
- Aplicar por dispositivo, não global, se possível.

### Fase 3 — Validação acústica de bancada

Matriz:

| # | Microfone | Saída | AEC | Raw | Monitor | Medir |
|---|---|---|---|---|---|---|
| 1 | notebook | caixa notebook | on | off | convidados | ERLE/eco |
| 2 | notebook | caixa notebook | off | on | convidados | piora |
| 3 | USB | caixa externa | on | off | convidados | AEC |
| 4 | USB | headset | on | off | programa | controle |
| 5 | Bluetooth | caixa BT | on | off | convidados | latência |
| 6 | notebook | caixa | on | off | programa | realimentação |
| 7 | qualquer | volume 25/50/75/100% | on | off | convidados | limiar |
| 8 | qualquer | 1/2/3 convidados | on | off | convidados | double-talk |
| 9 | host | Web Audio × elemento | on | off | caixa | referência |
| 10 | guest | caixa | on | off | programa | eco do guest |

### Fase 4 — Se o AEC nativo não bastar

- AEC por software (WebRTC APM/WASM) com referência do programa; ou
- fone como requisito recomendado; ou
- ducking/volume seguro no modo caixa.

---

## 7. Critérios de aceite

- [ ] UI mostra o estado real do AEC do track, não só a preferência.
- [ ] Se o modo caixa falhar, a UI não afirma “ativo”.
- [ ] `rawMic` e modo caixa não parecem contraditórios.
- [ ] Ativar/desativar não derruba o áudio por mais de 200 ms.
- [ ] Teste de eco mostra resultado coerente com a percepção de um convidado real.
- [ ] Com caixa e AEC, eco inaudível em volume normal na matriz física.
- [ ] Double-talk não corta a voz do host de forma inaceitável.
- [ ] Diagnóstico exporta constraints reais, sem segredos.

---

## 8. Decisões em aberto

1. `speakerMode` deve ser **por dispositivo** ou global por navegador?
2. Podemos usar `applyConstraints` ou aceitamos reabrir o mic?
3. O teste de eco deve ser obrigatório no primeiro uso ou opcional?
4. Se o AEC nativo falhar, investimos em AEC por software ou recomendamos fone?
5. O modo caixa deve desligar `rawMic` automaticamente ou apenas avisar?
6. O teste de eco deve cobrir também o **guest** com caixa?

---

## 9. Veredito EGM

O item 4 está **implementado no nível de UI/constraints**, mas ainda não está **provado no nível
acústico**.

O que funciona:

- o modo força AEC/NS/AGC no novo stream;
- “Ouvir programa” é desligado;
- preferência e aviso existem;
- teste de alto-falante funciona.

O que falta para ser confiável:

1. mostrar o AEC **real** do track;
2. não mentir “ativo” se a reabertura falhar;
3. medir eco de verdade;
4. evitar/reduzir dropout na troca;
5. validar com caixa/mic reais, inclusive double-talk e Web Audio.

O próximo passo não é “mais um toggle”; é **diagnóstico honesto + teste acústico**.
