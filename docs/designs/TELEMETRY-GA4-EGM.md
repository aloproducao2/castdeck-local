# Telemetria GA4 — uso contínuo do CastDeck — EGM

**Status:** implementado no build local 1.5.3 (pulso `studio_active`, leader, visibilidade e estado de produção).
**Base analisada:** CastDeck Local 1.5.2.
**Data:** 2026-11-10.
**Escopo:** Google Analytics 4 do site e do app desktop. Não altera a telemetria local de performance nem os logs de diagnóstico.

---

## 1. Resumo executivo

O CastDeck carrega o `gtag.js` em todas as páginas, mas só envia o `page_view` automático do carregamento. O estúdio é uma aplicação de página única: o operador pode ficar duas horas na mesma tela, em produção, sem navegar e sem gerar nenhum evento.

O GA4 encerra a sessão depois de **30 minutos sem eventos** (padrão do property) e o relatório **Tempo real** mostra apenas os últimos 30 minutos. Por isso, depois de algum tempo, o programa parece ter “parado de marcar” uso, mesmo continuando aberto e em operação.

A recomendação **não é** um ping cego de minuto em minuto. O próprio Google desaconselha keep-alives genéricos porque eles inflam duração, sessões engajadas e custo de dados. Para uma aplicação interativa de produção ao vivo, a solução correta é um **pulso de atividade de produção**:

- evento `studio_active` a cada **5 minutos**;
- somente com a janela **visível**;
- somente com uso real: interação recente **ou** produção ativa (`on_air`/`recording`);
- sem pulsos quando a janela está oculta, minimizada ou ociosa;
- um único líder entre as várias janelas do CastDeck;
- parâmetros que dão significado ao evento e permitem separar app desktop de site.

Esse desenho mantém a sessão viva enquanto o operador realmente usa o estúdio, sem transformar a telemetria em ruído.

---

## 2. Sintoma e reprodução

### Sintoma observado

Depois de um tempo com o CastDeck aberto, o GA4 deixa de indicar usuário ativo/sessão em andamento.

### Reprodução provável

1. Abrir o CastDeck;
2. entrar no estúdio;
3. deixar a janela visível, em uso, por 30–40 minutos;
4. observar o **Tempo real** do GA4 e os relatórios de sessão;
5. a atividade inicial aparece, mas o usuário some após a janela de inatividade do GA4.

### Confirmação necessária

- GA4 DebugView: confirmar se, depois do `page_view`, existe algum evento antes de 30 minutos;
- Rede do navegador/CEF: confirmar se não há requisições para `google-analytics.com` depois do carregamento;
- Tempo real: confirmar se o usuário desaparece perto do 30º minuto;
- comparar uma janela visível e ativa com outra minimizada.

---

## 3. Como o GA4 se comporta

| Comportamento | Efeito no CastDeck |
|---|---|
| Sessão padrão expira após **30 min de inatividade** | Sem eventos, a sessão do estúdio termina |
| `page_view` é enviado no carregamento | Não há novo pageview quando o operador troca de cena, câmera ou abre um painel |
| `user_engagement` automático é enviado principalmente ao ocultar/sair da página | Não mantém a sessão viva enquanto a página fica visível |
| Tempo real considera a janela recente (últimos 30 min) | Depois de meia hora sem evento, o operador “desaparece” do Tempo real |
| Timers de páginas ocultas são desacelerados ou suspensos pelo navegador | Um `setInterval` sem Page Visibility não é confiável |
| O GA4 desaconselha pings genéricos de keep-alive | O pulso precisa representar uso real, não apenas “aba aberta” |

A documentação de sessões do GA4 descreve a expiração por inatividade e alerta que pings artificiais distorcem as métricas. A mesma documentação reconhece o caso legítimo de **vídeo longo, artigos longos e aplicações interativas de monitoramento** e recomenda combinar medições com a **Page Visibility API**, interrompendo os eventos quando a página não está visível.

Fontes:

- [About Analytics sessions](https://support.google.com/analytics/answer/9191807)
- [Measure sessions and user engagement](https://developers.google.com/analytics/devguides/collection/ga4/sessions)
- [Page Visibility API](https://developer.mozilla.org/docs/Web/API/Page_Visibility_API)

---

## 4. Estado atual no CastDeck

### 4.1 O que existe hoje

Todas as páginas principais carregam:

```text
gtag.js
  → gtag('js', new Date())
  → gtag('config', 'G-6B798YQVS1')
```

Páginas encontradas com o bloco: `index`, `studio`, `cam`, `join`, `msg`, `out`, `projector`, `social-popout`, `vote`, além das páginas da landing page.

### 4.2 O que não existe

- nenhum evento customizado de uso;
- nenhum heartbeat/pulso;
- nenhuma escuta de `visibilitychange` para telemetria;
- nenhuma distinção entre site e app desktop;
- nenhuma eleição de janela líder;
- nenhum evento de início/fim de produção;
- nenhuma integração entre o estado do estúdio (`on_air`, `recording`, convidados) e o GA4.

### 4.3 Consequências

1. **Sessão curta artificialmente:** a sessão é encerrada por inatividade, não porque o operador saiu.
2. **Tempo real enganoso:** o operador some do Tempo real após ~30 min.
3. **Métricas de engajamento distorcidas:** o tempo real de uso não é registrado.
4. **Múltiplas janelas:** estúdio, popouts, câmera e projetor carregam o mesmo `gtag`; sem líder, podem gerar pageviews e sessões duplicadas.
5. **Origem confusa:** o app desktop abre `localhost`; os relatórios podem mostrar host local e misturar app com site.
6. **Nenhum filtro de versão/plataforma:** não é possível separar Windows, Android, CEF ou navegador.

---

## 5. Objetivos e não objetivos

### Objetivos

- Manter a sessão do GA4 ativa enquanto o CastDeck estiver **visível e em uso real**.
- Fazer o **Tempo real** refletir o uso contínuo do estúdio.
- Medir duração de uso e produção sem inflar pageviews.
- Separar app desktop, site, Android e CEF.
- Evitar pulsos em janelas ocultas, minimizadas ou ociosas.
- Evitar duplicidade entre múltiplas janelas.
- Preservar privacidade: sem nomes, salas, chaves RTMP, IP, e-mail ou conteúdo de mídia.

### Não objetivos

- Aumentar artificialmente “usuários ativos”.
- Contar uma janela esquecida aberta a noite inteira como uso.
- Substituir logs locais de erro/performance.
- Rastrear convidados ou conteúdo transmitido.
- Fazer o GA4 ser a fonte de verdade de faturamento ou limites.

---

## 6. Definições

| Termo | Definição proposta |
|---|---|
| **App aberto** | Processo/page do CastDeck carregado, independentemente de foco |
| **Visível** | `document.visibilityState === 'visible'` |
| **Interação recente** | pointer, teclado, toque, wheel ou foco nos últimos 15 min |
| **Produção ativa** | `on_air` ou `recording` verdadeiro no estado do estúdio |
| **Uso ativo** | visível **e** (interação recente **ou** produção ativa) |
| **Ocioso** | visível, sem interação recente e sem produção ativa |
| **Pulso** | evento `studio_active` enviado enquanto o uso ativo continua |
| **Sessão** | sessão do GA4; não é a mesma coisa que “sessão de produção” do CastDeck |

### Regra padrão

```text
usar = visível && (última_interação < 15 min || on_air || recording)
```

O limiar de 15 min é deliberadamente menor que o timeout de 30 min. Assim, quando o operador para de interagir e não está produzindo, o pulso para antes de o GA4 considerar uma sessão “zumbi”.

Para produções longas sem clique (culto, transmissão contínua, monitoramento), `on_air`/`recording` mantêm o pulso mesmo sem interação. Isso é uso real, não um keep-alive genérico.

---

## 7. Arquitetura proposta

```text
                    ┌─────────────────────────────┐
                    │  página principal do app     │
                    │  estúdio / dashboard         │
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
                    │  telemetry.js               │
                    │  - estado visível/foco      │
                    │  - última interação         │
                    │  - estado de produção       │
                    │  - líder entre janelas      │
                    │  - fila e deduplicação      │
                    └──────────────┬──────────────┘
                                   │ gtag('event', 'studio_active', ...)
                    ┌──────────────▼──────────────┐
                    │  GA4 G-6B798YQVS1           │
                    │  evento + engagement_time   │
                    └─────────────────────────────┘

    Popouts / câmera / projetor:
      carregam page_view, mas NÃO disputam o pulso principal.
```

### 7.1 Módulo central

Um único módulo de telemetria, carregado apenas nas páginas que representam o app principal:

- `index` (dashboard);
- `studio` (estúdio).

As páginas `cam`, `join`, `msg`, `out`, `projector`, `social-popout` e `vote` continuam com o pageview normal, mas **não** enviam `studio_active`. Isso evita contar a mesma produção várias vezes.

### 7.2 Adaptador de estado

O estúdio já mantém estado de cena, convidados, saídas e produção. O módulo não deve ler detalhes internos diretamente; deve receber um contrato mínimo:

- `onAir` — programa no ar;
- `recording` — gravação ativa;
- `guestCount` — apenas número agregado;
- `sourceCount` — apenas número agregado;
- `outputCount` — apenas número agregado;
- `route`/`surface` — dashboard ou estúdio.

Esses dados são agregados. **Nunca** enviar nome de convidado, sala, URL de origem, chave de transmissão ou título de mídia.

### 7.3 Líder entre janelas

O CastDeck pode abrir estúdio, popouts, câmera e projetor. Sem eleição, cada janela poderia enviar pulsos.

Solução:

- `BroadcastChannel('castdeck.telemetry')` para eleger um líder;
- fallback com `localStorage` + evento `storage`;
- lease de 20–30 s, renovado a cada pulso;
- somente o líder envia `studio_active`;
- se o líder fechar, outro assume e envia um pulso imediato;
- popouts e páginas auxiliares nunca assumem liderança.

---

## 8. Regras do pulso

### 8.1 Intervalo

**5 minutos (300 s)**, com jitter de ±15 s.

Justificativa:

- fica bem abaixo do timeout de 30 min;
- gera 12 eventos/hora;
- em 8 horas, 96 eventos;
- em 24 horas, 288 eventos;
- fica abaixo do limite documentado de eventos por sessão do GA4 (500), mesmo em produções muito longas.

Não usar 1 minuto: aumenta ruído, custo e risco de distorção sem melhorar a detecção.

### 8.2 Primeiro pulso

- `app_open` no carregamento;
- primeiro `studio_active` imediatamente após a inicialização, se o app estiver visível e ativo;
- depois, a cada 5 min.

### 8.3 Quando não enviar

- `document.visibilityState !== 'visible'`;
- janela sem foco e sem produção ativa, por mais de 15 min;
- usuário ocioso sem `on_air`/`recording`;
- durante `pagehide` (aí o evento é final, não pulso);
- quando o consentimento/opt-out estiver negado;
- em ambiente de desenvolvimento/teste, se o filtro de tráfego interno estiver ativo.

### 8.4 Retomada

Ao voltar a ficar visível ou ao retomar interação:

1. enviar `studio_resume`;
2. se o último pulso tiver mais de 5 min, enviar `studio_active` imediatamente;
3. retomar o timer.

### 8.5 Fim

- `visibilitychange` para oculto: enviar `studio_hidden` e pausar;
- `pagehide`/`beforeunload`: enviar `studio_close` com `transport_type: 'beacon'` quando disponível;
- envio final não deve ser duplicado por `pagehide` + `beforeunload`.

### 8.6 Tempo de engajamento

O parâmetro `engagement_time_msec` deve representar o tempo ativo desde o evento anterior, não o tempo total acumulado desde a abertura.

```text
engagement_time_msec =
  min(tempo_ativo_desde_o_evento_anterior, 300000)
```

Isso evita que uma pausa de 30 min entre no cálculo como 30 min de engajamento.

### 8.7 Limite de eventos

- 5 min → 12/h;
- 8 h → 96;
- 24 h → 288;
- limite de segurança: interromper o pulso após 400 eventos na mesma sessão e enviar um `studio_event_limit` (sem nomes/PII).

---

## 9. Eventos e parâmetros

### 9.1 Eventos propostos

| Evento | Quando | Observação |
|---|---|---|
| `app_open` | uma vez por carregamento | separado do `page_view` automático |
| `studio_active` | pulso de 5 min | evento principal de uso contínuo |
| `studio_idle` | ao entrar em ócio | para o pulso |
| `studio_hidden` | ao ocultar/minimizar | pausa imediata |
| `studio_resume` | ao voltar visível/ativo | retoma o pulso |
| `studio_close` | ao fechar/sair | envio final, se possível |
| `production_started` | `on_air`/`recording` inicia | evento de negócio, não substitui o pulso |
| `production_ended` | `on_air`/`recording` termina | idem |
| `feature_used` | ação relevante (opcional) | ex.: corte, PTZ, gravação; sem conteúdo |

Não criar um `session_start` manual: o GA4 já tem o evento reservado `session_start`.

### 9.2 Parâmetros

| Parâmetro | Exemplo | Uso |
|---|---|---|
| `app_surface` | `desktop`, `web`, `android`, `cef` | separar app do site |
| `app_version` | `1.5.2` | comparar versões |
| `window_role` | `studio`, `dashboard` | identificar a janela principal |
| `route` | `studio`, `dashboard` | tela atual |
| `production_state` | `off_air`, `preview`, `on_air`, `recording` | contextualizar o uso |
| `active_seconds` | `285` | tempo ativo desde o último evento |
| `idle_seconds` | `0` | tempo sem interação |
| `heartbeat_seq` | `7` | depuração/deduplicação |
| `guest_count` | `3` | apenas agregado |
| `source_count` | `4` | apenas agregado |
| `output_count` | `2` | apenas agregado |
| `transport_type` | `beacon` | envio final |
| `engagement_time_msec` | `298000` | engajamento real |

### 9.3 Dimensões e métricas no GA4 Admin

Criar, no mínimo:

**Dimensões personalizadas (event-scoped):**

- `app_surface`
- `app_version`
- `window_role`
- `route`
- `production_state`

**Métricas personalizadas:**

- `active_seconds`
- `idle_seconds`

Sem isso, os parâmetros aparecem no DebugView, mas não ficam disponíveis nos relatórios padrão.

### 9.4 O que nunca enviar

- nome ou e-mail de convidado;
- ID/nome de sala;
- chave RTMP, token, URL de destino;
- título de mídia ou nome de arquivo;
- conteúdo de chat;
- IP coletado manualmente;
- coordenadas de mouse, texto digitado ou conteúdo de tela.

O GA4 já coleta IP automaticamente; a política de privacidade deve explicar isso. Não acrescentar PII.

---

## 10. Multi-janela, deduplicação e ciclo de vida

### 10.1 Eleição de líder

- cada janela tem `instance_id` efêmero;
- líder renova lease a cada pulso;
- se o lease expirar, uma janela principal visível assume;
- popouts, câmera, projetor e `out` não participam;
- se duas abas do estúdio estiverem abertas, apenas uma envia.

### 10.2 Duplicidade de pageview

O `page_view` automático continua existindo. O pulso **não** é pageview e não deve chamar `gtag('config')` novamente.

### 10.3 Fechamento e rede

- `navigator.sendBeacon`/`transport_type: 'beacon'` para o evento final;
- não criar retry infinito;
- se offline, o `gtag` pode enfileirar; não enviar uma fila de horas depois como se fosse uso atual;
- limitar a fila local e descartar após algumas horas.

---

## 11. Configuração do GA4

### 11.1 Property e stream

- manter `G-6B798YQVS1` como stream web;
- não aumentar o session timeout para “resolver” o problema: isso só esconde a ausência de eventos;
- manter o Tempo real como está;
- criar uma visualização/exploração com filtros por `app_surface`.

### 11.2 Page location do app desktop

O app desktop abre `localhost`. Isso pode poluir os relatórios de página.

Opções:

| Opção | Prós | Contras |
|---|---|---|
| Manter `localhost` + `app_surface=desktop` | simples, sem risco de misturar | relatórios de página com host local |
| Virtualizar `page_location` para `/app/studio` | relatórios limpos | exige cuidado para não parecer tráfego do site |
| Não enviar pageview no app; só eventos | separação total | perde páginas do app nos relatórios |

**Recomendação:** manter o pageview, adicionar `app_surface` e `app_version`; em uma segunda fase, avaliar `page_location` virtual `https://cast.flue.live/app/...` com `app_surface=desktop`. Não fazer as duas coisas ao mesmo tempo.

### 11.3 Tráfego interno

- excluir IPs de teste/desenvolvimento quando possível;
- usar `debug_mode` apenas em desenvolvimento;
- não enviar eventos de builds locais de teste para a propriedade de produção.

### 11.4 Consentimento

O site carrega o GA4 diretamente, sem consentimento explícito. O pulso aumenta o volume de dados; a política precisa ser revista.

Recomendação:

- aviso de privacidade claro;
- opt-out nas configurações do app;
- Consent Mode para visitantes da UE/UK quando aplicável;
- não enviar telemetria antes do consentimento quando exigido;
- manter a telemetria local de diagnóstico separada da analytics de produto.

Isso é uma decisão de produto/jurídico, não apenas técnica.

---

## 12. Measurement Protocol: quando considerar

O Measurement Protocol (MP) permite enviar eventos do servidor local para o GA4. Pode parecer uma solução para “sempre enviar”, mas **não é a primeira escolha**:

- exige API secret no cliente/servidor local, que pode ser extraído;
- precisa de `client_id`/`session_id` consistentes;
- pode duplicar eventos do `gtag`;
- não sabe se a janela está visível sem o renderer informar;
- aumenta risco de sessão zumbi e de privacidade;
- o Google recomenda MP para dados offline/medição suplementar, não para substituir o tagging web.

**Decisão:** usar `gtag` + pulso visibility-aware. MP fica como contingência para confiabilidade se o CEF/navegador estiver bloqueando eventos, com feature flag e reconciliação para não duplicar.

---

## 13. Alternativas avaliadas

| Alternativa | Veredito |
|---|---|
| Aumentar o session timeout do GA4 | Não resolve; só atrasa o desaparecimento e distorce sessões |
| Enviar `page_view` a cada 5 min | Rejeitado; infla pageviews e métricas de navegação |
| Ping cego a cada 1 min | Rejeitado; ruído, custo e sessões zumbis |
| Enviar pulso mesmo com janela oculta | Rejeitado; conta uso que não existe |
| Enviar pulso por 24 h com app aberto | Rejeitado; “aberto” não é “usado” |
| Pulso visibility-aware + estado de produção | **Recomendado** |
| Measurement Protocol como fonte primária | Rejeitado nesta fase |
| Só logs locais de performance | Complementar, não substitui GA4 |

---

## 14. Métricas e validação

### 14.1 O que observar

- **Tempo real**: usuários ativos durante produção contínua;
- **Eventos**: contagem de `studio_active` por sessão;
- **Duração média da sessão**: deve refletir uso, não abandono;
- **Sessões engajadas**: comparar antes/depois;
- **Pageviews**: não devem crescer junto com os pulsos;
- **Usuários por `app_surface`/`app_version`**;
- **Eventos por sessão**: não exceder 500.

### 14.2 Testes de aceitação

| # | Cenário | Resultado esperado |
|---|---|---|
| 1 | App visível e ativo por 35 min | `studio_active` a cada ~5 min; sessão única; Tempo real ativo |
| 2 | App oculto/minimizado por 35 min | nenhum pulso; sem sessão zumbi |
| 3 | App visível, sem interação e sem produção por 20 min | pulso para após 15 min; `studio_idle` |
| 4 | Produção no ar por 2 h sem cliques | pulsos continuam; sem falso ocioso |
| 5 | Duas abas do estúdio | somente uma envia pulso |
| 6 | Popout/projetor/câmera abertos | não enviam `studio_active` |
| 7 | Fechar/reabrir | `studio_close` no máximo uma vez; retomada sem duplicar |
| 8 | Offline por 10 min | sem fila infinita; retomada controlada |
| 9 | Consentimento negado | nenhuma requisição ao GA4 |
| 10 | CEF desktop, Chrome e Android | mesma semântica de visibilidade e pulso |

### 14.3 Critérios de aceite

- com app visível e ativo, intervalo entre pulsos ≤ 6 min;
- nenhum pulso com página oculta;
- nenhum pulso após 15 min de ócio sem produção;
- sessão do GA4 não expira durante uso contínuo;
- pageviews não aumentam por causa do pulso;
- no máximo um pulso por janela líder a cada 5 min;
- todos os parâmetros são agregados, sem PII.

---

## 15. Rollout

### Fase 0 — medição de base

- confirmar o comportamento atual no DebugView;
- registrar sessões/eventos por 7 dias;
- criar dimensões e métricas personalizadas;
- criar filtro de tráfego interno.

### Fase 1 — pulso em feature flag

- implementar `telemetry.js` atrás de flag;
- ativar em builds internos;
- validar 35 min, 2 h, oculto, ócio e multi-janela.

### Fase 2 — produção limitada

- ativar em um grupo pequeno;
- comparar Tempo real, duração e eventos;
- monitorar picos de eventos e sessões.

### Fase 3 — liberação

- ativar por padrão;
- documentar a métrica “uso ativo”;
- revisar política de privacidade;
- manter rollback por flag.

### Rollback

Desligar a flag interrompe os pulsos sem remover o `gtag`/pageviews existentes.

---

## 16. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Google desaconselha keep-alive | métricas distorcidas | pulso só com uso real; visibilidade; estado de produção |
| Sessões “zumbis” | duração inflada | parar após 15 min de ócio sem produção |
| Excesso de eventos | custo/limites | intervalo de 5 min; limite de 400/sessão |
| Timers suspensos | falha de pulso | Visibility API + retomada imediata |
| Múltiplas janelas | duplicidade | líder com lease |
| Adblock/CEF bloqueando GA | dados incompletos | monitorar; MP apenas como contingência |
| Privacidade/consentimento | risco legal | opt-out, consent mode, política |
| PII acidental | vazamento | contrato de parâmetros; revisão; nunca enviar IDs |
| App localhost misturado ao site | relatórios confusos | `app_surface`; page_location virtual em fase 2 |

---

## 17. Decisões abertas

1. **Ócio:** 15 min é o limiar correto para o operador? Pode ser configurável.
2. **Preview:** `preview` conta como produção ativa ou só `on_air`/`recording`?
3. **Produção longa:** manter pulso indefinidamente ou limitar a 12 h?
4. **Consentimento:** opt-in, opt-out ou consent mode?
5. **Page location:** manter `localhost` ou virtualizar `/app/...`?
6. **Android/CEF:** mesma política de visibilidade do desktop?
7. **Measurement Protocol:** necessário como contingência ou o `gtag` basta?

**Padrão recomendado:** 5 min de pulso, 15 min de ócio, `on_air`/`recording` mantêm ativo, `app_surface` obrigatório, sem MP na primeira versão.

---

## 18. Referências

- [About Analytics sessions](https://support.google.com/analytics/answer/9191807)
- [Measure sessions and user engagement](https://developers.google.com/analytics/devguides/collection/ga4/sessions)
- [User engagement](https://support.google.com/analytics/answer/11109416)
- [Event collection limits](https://support.google.com/analytics/answer/9267744)
- [Measurement Protocol use cases](https://developers.google.com/analytics/devguides/collection/protocol/ga4/use-cases)
- [Realtime report](https://support.google.com/analytics/answer/9271392)
- [DebugView](https://support.google.com/analytics/answer/7201382)
- [Page Visibility API](https://developer.mozilla.org/docs/Web/API/Page_Visibility_API)
- [gtag.js reference](https://developers.google.com/tag-platform/gtagjs/reference)
