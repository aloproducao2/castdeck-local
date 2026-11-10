# EGM — Eco, AEC e concorrentes: OBS × vMix × StreamYard

> **Status:** pesquisa, comparação e plano. **Nenhum código foi alterado.**
> **Base:** CastDeck Local 1.3.28 + item 4 local (modo caixa/AEC).
> **Data:** 2026-11-03

---

## 1. Pergunta

O item 4 (modo caixa de som) está implementado, mas ainda não há conclusão sobre:

- o AEC nativo resolve o eco do host com caixa?
- vale investir em AEC por software?
- o que OBS, vMix e StreamYard fazem de diferente?
- qual é o comportamento correto do CastDeck?

Este documento compara os três concorrentes e propõe um plano baseado em evidências.

---

## 2. Resumo da pesquisa

### 2.1 OBS Studio

**O que faz:**

- Captura o microfone como o sistema entrega; não há **filtro de cancelamento de eco** na lista
  oficial de filtros de áudio (a lista tem compressor, expander, gain, inversão de polaridade,
  limiter, noise gate, noise suppression e VST).
- O monitor de áudio toca uma fonte no dispositivo de monitoramento configurado; se esse dispositivo
  também alimentar uma entrada capturada, forma-se um loop.
- A responsabilidade de evitar eco é do operador: usar fone, separar monitor de entrada, usar
  plugin/OS/driver ou um mixer externo com mix-minus.
- O fórum oficial tem casos clássicos de “monitorar e capturar a mesma interface” gerando loop.

**Leitura:** OBS é modular e não promete AEC. O usuário precisa entender o roteamento. É o oposto de
uma experiência “caixa de som segura”.

**Fontes:**

- [OBS Filters Guide](https://obsproject.com/kb/filters-guide)
- [OBS Audio Mixer Guide](https://obsproject.com/kb/audio-mixer-guide)
- [OBS Forum — Audio Monitoring loop](https://obsproject.com/forum/threads/audio-monitoring-causes-a-loop-that-keeps-getting-louder.164974/)

### 2.2 vMix

**O que faz:**

- **vMix Call** cria automaticamente um **mix-minus**: o convidado nunca recebe o próprio microfone.
- Oferece três retornos para o convidado: **Master**, **Headphones** (o que o operador ouve, menos o
  convidado) e **Buses A–G**.
- O guia recomenda **headphones** para operador e convidados. Se ainda houver eco, a causa pode ser
  operador com caixa, convidado com caixa ou fonte de áudio ligada por engano.
- O vMix Call tem **echo cancellation** no lado do convidado (o guest pode desligar em
  `advanced.vmixcall.com`, conforme a KB).
- A KB de áudio “garbled/underwater” diz que todos devem usar fone; a AEC pode até **cancelar demais**
  a voz em panel com várias pessoas falando (artigo da Streaming Media).
- O mixer tem EQ, compressor, noise gate, channel matrix e buses; **não é um AEC genérico de host**
  na lista de processamento.

**Leitura:** vMix separa dois problemas:

1. **mix-minus** resolve “o convidado ouvir a si mesmo”;
2. **headphones/AEC do guest** reduzem o eco acústico.

O mix-minus **não** impede o microfone do host de captar a caixa do host.

**Fontes:**

- [vMix — Mix Minus Basics](https://w.vmix.com/knowledgebase/article.aspx/254/mix-minus-basics-and-troubleshooting)
- [vMix Call — Audio and Talkback](https://m.vmix.com/help26/vMixCallAudio.html)
- [vMix — audio garbled with multiple guests](https://www.vmix.com/knowledgebase/article.aspx/344/article.aspx/294/vmix-call-audio-sounds-garbled-distorted-or-underwater-when-using-multiple-guests)
- [vMix Audio Settings](https://www.vmix.com/help29/AudioSettings.html)
- [Streaming Media — Echo Cancellation and Multi-caller Remote Production](https://www.streamingmedia.com/Producer/Articles/ReadArticle.aspx?ArticleID=143208)

### 2.3 StreamYard

**O que faz:**

- Tem um **toggle explícito de Echo Cancellation** nas configurações de áudio.
- Quando ligado, aplica **echo cancellation + noise suppression + gain**.
- Recomenda ligar quando não há fone/ambiente ruidoso.
- Recomenda **desligar** para microfones de alta qualidade ou música — e, nesse caso, **usar fone
  obrigatoriamente**.
- O artigo “How to fix Echo” orienta:
  - conferir AEC de todos;
  - baixar volume da caixa;
  - usar fone;
  - fechar abas/programas duplicados;
  - cuidado com áudio de tela compartilhada;
  - mix-minus no mixer externo.
- A própria documentação reconhece o trade-off: AEC melhora voz, mas pode prejudicar música.

**Leitura:** StreamYard é o mais próximo do CastDeck em UX: uma opção visível, com trade-off
declarado e recomendação de fone.

**Fontes:**

- [StreamYard — What is Echo Cancellation?](https://support.streamyard.com/hc/en-us/articles/360052718951-What-is-Echo-Cancellation)
- [StreamYard — How to fix Echo](https://support.streamyard.com/hc/en-us/articles/14015208551188-How-to-fix-Echo)
- [StreamYard — Audio Quality Issues](https://support.streamyard.com/hc/en-us/articles/18253495647380-Audio-Quality-Issues)

### 2.4 CastDeck hoje

- `getUserMedia` já pede AEC/NS/AGC por padrão; `rawMic` desliga os três.
- O item 4 adicionou “Estou usando caixa de som”, que força AEC, desliga “Ouvir programa” e reabre
  o microfone.
- O retorno de convidado usa mix-minus por convidado no mixer.
- O lobby agora tem teste de alto-falante, medidor de mic e recomendação de fone.
- **Ainda não há:** status real do AEC do track, teste de eco, validação acústica, double-talk,
  mix-minus verificável na UI.

---

## 3. Comparação direta

| Dimensão | OBS | vMix | StreamYard | CastDeck atual |
|---|---|---|---|---|
| AEC no host | Não tem filtro AEC nativo; depende de SO/VST | AEC no vMix Call/guest; host depende de roteamento | Toggle explícito | Constraint no `getUserMedia` + modo caixa |
| Mix-minus guest | Não é função de call; usuário monta | Automático no vMix Call | Não detalhado no artigo; foco em AEC/fone | Sim, por convidado no mixer |
| Monitor | Dispositivo configurável; risco de loop | Master/Headphones/Buses | Configurações do navegador | Monitor + “Ouvir programa” |
| Controle do usuário | Manual, modular | Profissional, mix-minus/buses | Simples, toggle AEC | Manual; modo caixa |
| Proteção contra caixa | Nenhuma promessa; fone | Fone obrigatório na prática | AEC + fone | Aviso + AEC forçado |
| Risco de AEC “comer” voz | N/A | Documentado em panel | Trade-off declarado (música) | Não medido |
| Diagnóstico | Logs/medidores | Medidores/buses | Ajuda e teste de mic | Diagnóstico geral; sem teste de eco |

---

## 4. O que os concorrentes ensinam

### 4.1 Nenhum deles promete “caixa de som sem eco”

Os três recomendam **fone** como solução principal. vMix e StreamYard têm AEC, mas continuam dizendo
“use headphones”. O OBS nem tenta esconder: é roteamento e responsabilidade do operador.

**Conclusão:** o CastDeck não deve prometer “nunca terá eco com caixa”. Deve prometer **diagnóstico,
controle e degradação segura**.

### 4.2 Mix-minus e AEC resolvem problemas diferentes

- **Mix-minus:** o convidado não ouve a si mesmo. Não impede o microfone do host de captar a caixa.
- **AEC:** tenta remover o áudio da caixa do sinal do microfone. Pode falhar com atraso, volume,
  Bluetooth, double-talk.
- **Fone:** elimina o acoplamento acústico. É a solução mais confiável.

O CastDeck precisa mostrar isso de forma clara, não tratar “AEC ligado” como “eco resolvido”.

### 4.3 AEC tem custo de qualidade

StreamYard recomenda desligar AEC para música/mic de alta qualidade; o vMix pode “cancelar demais” a
voz em panel. O CastDeck já tem `rawMic`; o modo caixa não pode deixar o usuário confuso sobre qual
está valendo.

### 4.4 Transparência vence mágica

StreamYard mostra o toggle e explica o trade-off. OBS deixa o usuário montar. vMix mostra buses e
mix-minus. O CastDeck deve mostrar:

- AEC **real** do track;
- se o modo caixa foi aplicado;
- se o monitor está ouvindo o programa;
- se o guest está em mix-minus;
- um teste de eco honesto.

---

## 5. EGM — seis lentes

### 5.1 Operador / UX

O operador precisa de três escolhas explícitas:

1. **Fone** — qualidade máxima, AEC pode ficar off para música.
2. **Caixa** — AEC on, “Ouvir programa” off, teste de eco, aviso.
3. **Áudio puro/música** — AEC off, fone obrigatório.

Sem um seletor, o usuário não sabe o que o app está fazendo.

### 5.2 Áudio / acústica

O que importa é o **eco residual no retorno do convidado**, não a constraint. Medir:

- ERL/ERLE;
- atraso;
- double-talk;
- volume;
- distância/posição;
- Bluetooth.

### 5.3 Navegador / arquitetura

- `getUserMedia` AEC pode ser ignorado ou ineficaz.
- Web Audio/setSinkId pode afetar a referência.
- AEC nativo é a primeira opção; software AEC é caro e pode piorar double-talk.
- Não vale adicionar AEC por WASM antes de medir o nativo.

### 5.4 Produto / posicionamento

- OBS = modular, para quem entende áudio.
- vMix = profissional, mix-minus/buses.
- StreamYard = simples, toggle AEC.
- CastDeck = local, com oportunidade de ser **mais transparente que os três**: mostrar AEC real,
  mix-minus e teste de eco no próprio app.

### 5.5 Persistência / dispositivos

- modo por dispositivo, não global?
- restaurar sem reabrir microfone inesperadamente;
- manter mute/rota;
- labels de dispositivo.

### 5.6 Qualidade / suporte

- teste de eco reproduzível;
- diagnóstico exportável;
- matriz de hardware;
- documentação “fone × caixa × música”.

---

## 6. Plano recomendado

### Fase 0 — Não prometer o que não foi medido

- Mostrar `getSettings().echoCancellation/noiseSuppression/autoGainControl` do track atual.
- Se o modo caixa foi ativado mas o track não tem AEC, mostrar **“modo não aplicado”**.
- Se a reabertura falhar, reverter `speakerMode` ou marcar pendente.
- UI de três perfis: **Fone**, **Caixa**, **Música/raw**.

### Fase 1 — Teste de eco no app

- chirp curto na saída;
- gravação de 2–3 s do mic;
- correlação/atraso/nível;
- resultado **baixo/médio/alto**;
- recomendação: fone, volume, modo caixa, posição.

### Fase 2 — Aplicação sem dropout

- tentar `applyConstraints` no track atual;
- se falhar, reabrir com crossfade/mute curto;
- preservar mute, rota, nível;
- testar ao vivo.

### Fase 3 — Validar mix-minus

- confirmar que cada guest recebe o programa **sem a própria voz**;
- testar com guest real;
- mostrar “mix-minus ativo” no painel do guest;
- não confundir com AEC.

### Fase 4 — Medição acústica

Matriz com:

- notebook/USB/Bluetooth;
- caixa/fone;
- volumes 25/50/75/100%;
- 1/2/3 convidados;
- double-talk;
- Web Audio × elemento;
- Chrome/Edge;
- Windows/Android.

### Fase 5 — Só então decidir AEC por software

Se o AEC nativo falhar de forma reproduzível:

- WebRTC APM/AEC3 com referência; ou
- fone como requisito; ou
- ducking/volume seguro.

Não começar por software AEC.

---

## 7. Critérios de aceite

- [ ] UI mostra AEC real, não só preferência.
- [ ] Modo caixa nunca aparece “ativo” se o track atual não estiver protegido.
- [ ] `rawMic`/música e modo caixa não ficam contraditórios.
- [ ] Teste de eco mostra resultado coerente com um guest real.
- [ ] Ativar/desativar não derruba o áudio por mais de 200 ms.
- [ ] Mix-minus é verificável e não é confundido com AEC.
- [ ] Com caixa e AEC, eco inaudível em volume normal na matriz física.
- [ ] Double-talk não corta a voz do host de forma inaceitável.
- [ ] Toda recomendação (“use fone”) é baseada em medição, não em promessa.

---

## 8. Decisões em aberto

1. O perfil padrão deve ser **Fone** ou **Caixa**?
2. `speakerMode` por dispositivo ou global?
3. O teste de eco é obrigatório no primeiro uso ou opcional?
4. Podemos desligar `rawMic` ao ativar caixa ou só avisar?
5. Mix-minus deve ser exibido no guest?
6. AEC por software é prioridade ou fone basta?
7. O teste de eco cobre guest ou só host?

---

## 9. Veredito EGM

A pesquisa mostra um padrão claro:

- **OBS:** não esconde; o usuário monta o áudio.
- **vMix:** mix-minus automático + fone; AEC no guest; cuidado com excesso de cancelamento.
- **StreamYard:** toggle AEC explícito, com trade-off e fone obrigatório quando desligado.
- **CastDeck:** já tem mix-minus e um modo caixa, mas ainda não tem **prova acústica nem status
  real**.

O caminho não é copiar um “botão mágico”. É copiar o que os três fazem de melhor:

1. **mix-minus** para o guest;
2. **AEC explícito e honesto**;
3. **fone como recomendação principal**;
4. **diagnóstico e teste de eco**;
5. **degradação segura** quando a caixa falhar.

Antes de investir em AEC por software, o CastDeck precisa provar, com caixa e microfone reais, se o
AEC do navegador já é suficiente. A pesquisa não autoriza prometer “sem eco”; autoriza prometer
**clareza, teste e fallback**.


---

## 10. Ajuda em modal implementada (2026-11-03)

Sem alterar o sistema de áudio, foi adicionado um modal **Como evitar eco** acessível pelo lobby do host/convidado e pela aba Áudio → Retorno/Fone. Conteúdo: fone, caixa, AEC, teste com convidado, mix-minus × AEC e áudio puro. É orientação; não muda microfone, AEC, mixer nem preferências.
