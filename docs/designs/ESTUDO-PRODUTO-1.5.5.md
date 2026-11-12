# Estudo de evolução do CastDeck Local — usabilidade e novas funções

> **Versão analisada:** 1.5.5
> **Data:** 2026-11-12
> **Escopo:** dashboard, estúdio, mesa de corte, áudio, convidados, mídia, gravação, diagnóstico, Android e fluxo pós-live.
> **Método:** leitura do código atual (`public/js/studio/*`, `public/js/dashboard.js`, `public/js/guest.js`,
> `server/index.js`), documentação e auditorias anteriores (`docs/ai/ANALISE-APP-PRINCIPAL.md`,
> `docs/designs/IMPROVEMENTS-EGM.md`, `docs/PLANO-MELHORIAS.md`).
> **Limite:** este estudo é uma hipótese de produto baseada em código e auditorias; **não houve teste com
> operadores nesta rodada**. Itens marcados “validar” precisam de sessão real.
> **Status:** proposta. Nada foi implementado.
>
> **Revisão crítica e direção de layout:** [ESTUDO-PRODUTO-1.5.5-REVISAO.md](ESTUDO-PRODUTO-1.5.5-REVISAO.md)
> — separa o que é relevante do que é dispensável e propõe uma evolução incremental da interface.

---

## 1. Resumo executivo

### 1.1 Diagnóstico em uma frase

O CastDeck já tem **funções suficientes para operar uma live profissional**. O que mais limita o uso diário
não é falta de recurso: é **carga de decisão**, **confiança antes de entrar no ar**, **capacidade de voltar
atrás durante a live** e **falta de um fluxo depois que a live termina**.

Hoje o operador precisa saber:

- em qual dos dois modos está: **Estúdio** ou **Mesa de corte**;
- onde fica cada função entre **9 grupos e 21 sub-abas**;
- quais sinais, destinos, janelas e permissões estão saudáveis;
- o que fazer quando uma câmera, convidado ou destino falha;
- como testar sem publicar;
- como encontrar a gravação e transformá-la em conteúdo.

O produto ganha mais se o próximo ciclo **reduzir o número de coisas que o operador precisa saber**, em vez
de adicionar mais botões.

### 1.2 Cinco apostas principais

| # | Aposta | Resultado esperado | Esforço |
|---|---|---|---|
| 1 | **Central “Pronto para ir ao vivo?”** | O operador vê, num só lugar, o que está pronto, o que está em risco e o que precisa de ação antes de publicar | M |
| 2 | **Perfis de operação** | “Podcast”, “Igreja”, “Evento”, “Aula/Solo” e “Vertical” configuram o estúdio em um clique, com prévia | M |
| 3 | **Paleta de comandos e busca** | `Ctrl+K` encontra qualquer ação, fonte, painel ou ajuste sem navegar por 21 abas | S |
| 4 | **Modo ensaio + desfazer seguro** | Testar sem ir ao ar e corrigir ações sem medo de derrubar o programa | M |
| 5 | **Biblioteca pós-live** | Encontrar, revisar, marcar e exportar gravações e clipes sem sair do app | M |

### 1.3 O que **não** fazer agora

- Não adicionar mais uma fileira de botões permanentes na topbar.
- Não reintroduzir direção automática ligada por padrão.
- Não transformar o app em um dashboard de nuvem; a vantagem local continua sendo o centro.
- Não começar por IA generativa antes de resolver preparação, teste e recuperação.
- Não esconder **Gravar/Transmitir** em menu “mais”.

---

## 2. O que já está bom e deve ser preservado

| Área | O que já existe | Por que importa |
|---|---|---|
| Primeiro contato | Dashboard com “Como começar”, criar estúdio, destinos e gravações | Já existe uma trilha inicial; falta refiná-la, não recriá-la |
| Lobby | Prévia de câmera, medidor, teste de alto-falante e recomendação de fone | É a base da confiança do convidado |
| Operação | Estúdio + Mesa de corte, CORTE/AUTO, T-bar, atalhos | Atende tanto quem quer simplicidade quanto quem quer mesa broadcast |
| Saúde | Pílula de saúde com destinos, fps, bitrate, velocidade e quadros perdidos | Boa matéria-prima para uma central acionável |
| Persistência | Salvamento automático, `db.json` atômico, backup, restauração de sessão | Reduz perda de trabalho e já tem mensagens de estado |
| Direção | Diretor Auto agora é **manual** e o remoto só desliga | Mudança recente correta; não voltar atrás |
| Áudio | Ducking por tipo de fonte, prioridade para pessoas, mixer, AEC, denoise | O áudio já é tratado como produção, não como acessório |
| Conteúdo | Mídia, GC, Jornal, Esportes, Widgets, DSK, Replay, NDI, vertical | Cobre igreja, podcast, evento, jornalismo e esporte |
| Pós-live | Player de gravação, mostrar na pasta, apagar, 9:16 | Existe base; falta organizar e dar saída |
| Diagnóstico | `/api/diagnostics` + botão “Baixar .json” | Já há dados úteis; falta torná-los visíveis no momento certo |
| Acessibilidade | `modal()` com foco preso, toasts `aria-live`, `aria-pressed`, foco visível | Base acima da média para app vanilla |

**Conclusão parcial:** o produto não precisa de uma reinvenção visual. Precisa de **camadas de orientação,
teste e recuperação** em cima do que já funciona.

---

## 3. Mapa de atrito

### 3.1 Números da interface atual

| Indicador | Situação atual | Efeito |
|---|---:|---|
| Modos principais | 2 (Estúdio e Mesa) | Conceptual e visualmente parecidos em alguns controles |
| Grupos no painel lateral | 9 | O operador precisa lembrar em qual grupo está cada função |
| Sub-abas no painel | 21 | “Onde fica?” é uma pergunta frequente |
| Botões de ação na topbar | ≈16 | Competem com Gravar/Transmitir |
| Botões na barra inferior | ≈11 | Rola ou corta em telas menores |
| Passos do “Como começar” no dashboard | 4 | Cobre o básico, mas não prepara uma live específica |
| Checks de saúde antes do ar | Câmera/mic no lobby; saúde só depois de iniciar | O operador descobre problemas no pior momento |
| Ações com desfazer | Editor de layout, GC designer e alguns fluxos | Remover fonte, mudar palco e apagar gravação não têm desfazer geral |
| Modo de ensaio | Não existe | Testar significa publicar ou gravar |
| Sala de espera/PIN de convidado | Não há admissão explícita | O link público entra direto na sala |
| Roteiro/rundown | Não existe | Podcasts, igrejas e eventos controlam tudo por notas externas |

> Os números são aproximados e servem para orientar decisão; não são uma métrica de qualidade.

### 3.2 Jornadas e atritos

| Intenção do operador | Caminho atual | Atrito | Oportunidade |
|---|---|---|---|
| “Quero começar rápido” | Dashboard → criar → lobby → estúdio | O estúdio abre com muitas opções e nenhum perfil | Perfis de operação + “modo simples” |
| “Será que posso ir ao vivo?” | Lobby valida câmera/mic; saúde só aparece durante a live | Falta uma visão de prontidão de destinos, convidados, disco, encoder | Central “Pronto para ir ao vivo?” |
| “Onde fica a função X?” | 9 grupos × 21 abas + topbar | Depende de memória e treinamento | `Ctrl+K` + ajuda contextual |
| “Vou testar antes” | Não há ensaio; só gravar ou transmitir | Teste pode gerar arquivo desnecessário ou ir ao ar | Modo ensaio com watermark e destinos bloqueados |
| “Errei uma ação” | Alguns diálogos confirmam; outros não | Operador com medo de remover algo no ar | Desfazer contextual + lixeira + confirmação inteligente |
| “Quem está falando?” | Medidores, miniaturas, Diretor Auto manual | Informação espalhada | Painel de pessoas com estado de fala e sugestão |
| “Entrou convidado errado” | Link direto para a sala | Sem sala de espera, PIN ou expiração | Guest 2.0 com admissão e TTL |
| “Acabou a live” | Fecha, procura gravação na pasta | Falta resumo, marcadores e clipes | Biblioteca pós-live + relatório |
| “A live caiu” | Saúde mostra estado; diagnóstico fica em Ajustes | Não há um botão único de recuperação | Central de saúde acionável |
| “Quero reaproveitar o estúdio” | Cada estúdio guarda o próprio estado | Sem exportar/importar template | Brand kit e pacote de estúdio |

### 3.3 Problemas específicos que merecem correção

1. **Modo persistido sem aviso**
   - O modo Mesa de corte é salvo em `localStorage` e pode reabrir sem o operador perceber.
   - A auditoria anterior já recomendava um toast “Abrindo em modo mesa de corte”.
   - Correção: banner/toast de entrada + botão “Voltar ao Estúdio” sempre visível.

2. **Ajuda de atalhos ausente**
   - A auditoria de 2026-10-29 registrou que não existe um “?” com a lista de atalhos.
   - Hoje há `F`, `Shift+P`, `Shift+R`, `F1–F6`, espaço na mesa, etc.
   - Correção: modal `?` com atalhos por contexto e link para a documentação.

3. **Diagnóstico escondido**
   - `/api/diagnostics` já tem versão, SO, memória, FFmpeg, túnel, salas e broadcasts.
   - O botão existe em Ajustes, mas não no momento de falha.
   - Correção: “Exportar diagnóstico” na central de saúde e no erro de destino.

4. **Sem teste de destino**
   - A tela de destinos salva e valida campos, mas não oferece um teste seguro de alcance.
   - Correção: teste opcional de handshake/credenciais, sem publicar; nunca prometer que o teste garante
     que a plataforma aceitará a live.

5. **Sem retorno ao vivo anterior**
   - Parar a transmissão, trocar preset ou remover uma fonte não têm “voltar como estava”.
   - Correção: snapshots de estado antes de ações de risco e um “Restaurar estado anterior” limitado.

---

## 4. Princípios de desenho

1. **Preparar → Operar → Entregar**
   - O app deve ter três fases claras, não uma tela única que serve para tudo.
2. **Essencial em um clique; avançado em dois**
   - Gravar, transmitir, convidar e falar com a equipe ficam sempre à mão.
   - O resto pode viver em “Ferramentas” ou na paleta de comandos.
3. **Nada muda no ar sem intenção explícita**
   - Perfis, cenas e sugestões mostram prévia; aplicar ao vivo pede confirmação.
4. **Toda ação de risco tem saída**
   - Desfazer, lixeira, snapshot ou confirmação contextual.
5. **Nada de nuvem obrigatória**
   - Preparação, ensaio, transcrição e IA local funcionam offline; rede é opcional.
6. **Não esconder o que é crítico**
   - Se Gravar/Transmitir estão ativos, seus controles nunca vão para um menu secundário.
7. **Explicar o efeito, não o recurso**
   - “Tirar do palco” em vez de “Desmarcar stage”; “Corte para a câmera 2” em vez de “Take”.
8. **Acessibilidade e i18n desde o início**
   - Toda nova tela precisa de teclado, foco, ARIA e três idiomas.

---

## 5. Oportunidades priorizadas

Escala: **Impacto** 1–5; **Esforço** S (dias), M (semanas), L (mês+); **Prioridade** P0 (próximo ciclo),
P1 (próximas ondas), P2 (estratégico).

| ID | Oportunidade | Tipo | Impacto | Esforço | Prioridade |
|---|---|---|---:|---|---|
| U1 | Central “Pronto para ir ao vivo?” | Melhoria de uso | 5 | M | P0 |
| U2 | Perfis de operação com prévia | Melhoria de uso | 5 | M | P0 |
| U3 | Paleta de comandos (`Ctrl+K`) | Nova função | 4 | S | P0 |
| U4 | Ajuda de atalhos e tour contextual | Melhoria de uso | 3 | S | P0 |
| U5 | Desfazer, lixeira e confirmações contextuais | Melhoria de uso | 4 | M | P0 |
| U6 | Aviso de modo persistido | Correção de UX | 3 | S | P0 |
| U7 | Central de saúde acionável | Melhoria de uso | 5 | M | P1 |
| U8 | Modo ensaio | Nova função | 5 | M | P1 |
| U9 | Biblioteca de gravações e clipes | Nova função | 4 | M | P1 |
| U10 | Guest 2.0: sala de espera, PIN e TTL | Nova função | 4 | M | P1 |
| U11 | Biblioteca de mídia com tags/favoritos | Melhoria de uso | 3 | M | P1 |
| U12 | Templates de estúdio e brand kit exportável | Nova função | 4 | M | P1 |
| U13 | Exportação de legenda/transcrição (SRT/VTT) | Nova função | 4 | S/M | P1 |
| U14 | Relatório pós-live | Nova função | 4 | S/M | P1 |
| U15 | Rundown/roteiro ao vivo | Nova função | 5 | L | P2 |
| U16 | Director Assist (sugestões, não automático) | Nova função | 3 | M | P2 |
| U17 | Network doctor | Nova função | 4 | M | P2 |
| U18 | IA local para capítulos/highlights | Nova função | 3 | L | P2 |
| U19 | Companion mobile/segunda tela | Melhoria de uso | 3 | M | P2 |
| U20 | Multi-destino com fallback e saúde individual | Melhoria de uso | 4 | M | P2 |

### 5.1 Ordem recomendada

**Ciclo 1 — “Confiança e clareza” (1.6)**

1. U1 — Central de prontidão.
2. U2 — Perfis de operação.
3. U3 — Paleta de comandos.
4. U4 — Ajuda de atalhos.
5. U5 — Desfazer/lixeira.
6. U6 — Aviso de modo.
7. U7 — Saúde acionável (versão inicial).

**Ciclo 2 — “Teste e entrega” (1.7)**

8. U8 — Modo ensaio.
9. U9 — Biblioteca de gravações e clipes.
10. U10 — Guest 2.0.
11. U14 — Relatório pós-live.
12. U13 — Exportação de legendas.
13. U11/U12 — Mídia e templates.

**Ciclo 3 — “Roteiro e inteligência” (1.8+)**

14. U15 — Rundown.
15. U16 — Director Assist.
16. U17 — Network doctor.
17. U18 — IA local.
18. U19/U20 — Companion e multi-destino avançado.

---

## 6. Detalhamento das prioridades

### 6.1 U1 — Central “Pronto para ir ao vivo?”

**Problema.** O lobby valida câmera e microfone, e a pílula de saúde mostra o que já está no ar. Não existe
uma visão única de **prontidão para publicar**: convidados, destinos, túnel, encoder, disco, vertical e
legendas. O operador descobre o problema depois do clique em Transmitir.

**Proposta.** Um painel lateral/modal com checks agrupados e ações:

| Grupo | Checks | Exemplos de ação |
|---|---|---|
| Pessoas | Host com câmera/mic; convidados conectados; retorno de áudio | “Abrir câmeras”, “Reenviar convite” |
| Áudio | Master não mudo; modo caixa/fone; ducking; medidor de fala | “Abrir mixer”, “Testar saída” |
| Rede | Túnel online; TURN configurado; estimativa de subida | “Abrir conexão”, “Testar convidado” |
| Saídas | Destinos salvos/ativos; gravação; vertical; NDI | “Abrir destinos” |
| Sistema | FFmpeg, encoder, CPU/RAM, espaço em disco | “Exportar diagnóstico” |
| Conteúdo | Layout, fontes no palco, GCs, legendas | “Abrir cena” |

**Comportamento:**

- Cada item tem estado **OK / Atenção / Bloqueio** e uma frase em linguagem de operador.
- “Ir para o item” abre a aba/painel correspondente sem fechar o painel de prontidão.
- “Testar 15 s” toca um ensaio local sem publicar; destinos permanecem bloqueados.
- “Publicar mesmo assim” só aparece em itens de atenção; bloqueios exigem correção.
- **Não bloquear gravação local** por falta de destino; o check é contextual.
- Lembrar “ignorar por esta sessão” para avisos conscientes.

**Onde entra:**

- Card do estúdio no dashboard: “Pronto? 8/9”.
- Botão na topbar perto de Gravar/Transmitir: “Pronto?”.
- Primeiro clique em Transmitir, se o checklist ainda não foi visto.

**Aceite:**

- O operador consegue responder “posso ir ao vivo?” sem abrir 5 abas.
- Todo item de atenção tem um botão que leva à correção.
- Nenhum check pesado bloqueia a UI por mais de ~300 ms.
- O teste não aparece em nenhum destino nem grava arquivo permanente por padrão.
- O painel lembra a dispensa apenas na sessão.

**Métrica:** percentual de lives com checklist concluído; tempo entre abrir o estúdio e iniciar; incidentes
nos primeiros 5 minutos.

---

### 6.2 U2 — Perfis de operação

**Problema.** O mesmo estúdio pode ser podcast, culto, aula, entrevista ou evento vertical. O operador
reconfigura layout, áudio, autoplay, direção e cenas manualmente.

**Proposta.** Cards de perfil com prévia do que será alterado:

| Perfil | Sugestões iniciais |
|---|---|
| **Podcast / entrevista** | Layout 2-up/grade, Diretor Auto **desligado**, GC de nomes, autoplay ligado, ducking médio |
| **Igreja** | Plano aberto, cortes lentos, GC discreto, autoplay desligado, ducking leve |
| **Evento / palco** | Grade + telão, cortes rápidos, GC de nomes, replay acessível |
| **Aula / solo** | Tela + câmera PiP, foco em mídia, legendas, gravação local |
| **Vertical** | 9:16, layout automático, legendas, destinos verticais |

**Regras:**

- Aplicar **antes da live**: altera layout, cenas, áudio, autoplay e preferências visuais.
- **Não alterar destinos** sem confirmação; destino é configuração de conta, não de cena.
- Mostrar **diff** (“3 mudanças; 0 remoções”) e permitir desfazer.
- Se a live estiver no ar, “Aplicar ao vivo” pede confirmação e cria snapshot.
- O usuário pode salvar “Meu perfil” e duplicar para outro estúdio.

**Aceite:**

- Um perfil aplica em ≤2 cliques com prévia.
- Nenhuma configuração do usuário é apagada sem diff/undo.
- Funciona offline e não depende de telemetria.

**Métrica:** tempo de preparação por tipo de live; quantidade de ajustes manuais após aplicar.

---

### 6.3 U3 — Paleta de comandos (`Ctrl+K`)

**Problema.** A interface tem 21 sub-abas e dezenas de ações. Quem não usa todos os dias precisa procurar.

**Proposta.** Paleta acessível por `Ctrl+K` / `Cmd+K`:

- busca difusa por **ação**, **painel**, **fonte**, **ajuste**, **documentação**;
- mostra o atalho de teclado e o contexto (“Mesa de corte”);
- itens desabilitados explicam o motivo (“Disponível só na mesa”);
- recentes e favoritos;
- ações de risco pedem a confirmação já existente;
- não aparece para convidados.

**Exemplos:** “mutar convidado”, “abrir mixer”, “trocar layout”, “iniciar gravação”, “exportar diagnóstico”,
“ativação do modo ensaio”.

**Aceite:**

- 100% das ações principais acessíveis em ≤3 teclas.
- A busca não cria uma segunda fonte de verdade: executa as mesmas funções da UI.
- Funciona com teclado e leitor de tela.
- Não abre durante modal destrutivo.

**Métrica:** uso por sessão; queda de buscas no suporte por “onde fica”.

---

### 6.4 U4 — Ajuda de atalhos e tour contextual

**Problema.** A auditoria de usabilidade registrou ausência de uma lista de atalhos; atalhos como `Shift+R`,
`Shift+P`, `F1–F6` e espaço na mesa não são descobertos.

**Proposta:**

- `?` abre um modal com atalhos **por contexto** (global, estúdio, mesa, mídia, áudio).
- Botão “?” no canto da topbar.
- Tour de 5 passos no primeiro estúdio, dispensável e reabrível em Ajuda.
- Links para a documentação e para o checklist de prontidão.

**Aceite:** todos os atalhos globais documentados; conflito com campos de texto tratado; três idiomas.

---

### 6.5 U5 — Desfazer, lixeira e confirmações contextuais

**Problema.** Algumas ações destrutivas confirmam, outras não. Não há desfazer geral para:
remover fonte, trocar palco, parar transmissão, substituir mídia ou apagar gravação.

**Proposta:**

- **Toast de desfazer** (8–10 s) para ações reversíveis: remover do palco, mover, renomear, aplicar cena.
- **Lixeira** para gravações e mídias, com restauração; exclusão definitiva só na lixeira.
- **Snapshot** antes de: parar live, trocar preset, aplicar perfil/cena, remover fonte no ar.
- “Restaurar estado anterior” disponível por 30 s/até nova ação.
- Confirmação contextual: “Esta fonte está no ar. Trocar para a Cena?” com prévia.
- Nunca usar confirm genérico para tudo; confirmar só quando o efeito não é óbvio.

**Aceite:**

- Nenhuma ação de conteúdo no palco é irreversível em 10 s.
- Parar a transmissão mostra o que será encerrado (horizontal, vertical, gravação).
- A lixeira não apaga arquivos em gravação.

**Métrica:** número de ações desfeitas; redução de “apaguei sem querer”; incidentes por ação acidental.

---

### 6.6 U6 — Aviso de modo persistido

**Problema.** O modo Mesa de corte sobrevive ao reload. O operador pode abrir o estúdio no modo errado sem
perceber, sobretudo se outra pessoa usou o computador.

**Proposta:**

- Toast/banner na entrada: “Abrindo na Mesa de corte (último modo usado)”.
- Botão “Voltar ao Estúdio” no banner e na paleta.
- Indicador de modo já existente recebe contraste e descrição do que muda.
- Opção “sempre abrir no Estúdio” por estúdio.

**Aceite:** o modo atual é reconhecível em <2 s e reversível em 1 clique.

---

### 6.7 U7 — Central de saúde acionável

**Problema.** A pílula de saúde atual mostra fps, bitrate, velocidade e perda por destino, mas não responde
“o que faço agora?”. Diagnóstico fica em Ajustes.

**Proposta:** evoluir o popover de saúde para um pequeno centro de operação:

- **Resumo:** “Tudo OK”, “Atenção: destino X reconectando”, “Problema: encoder lento”.
- **Causas prováveis** em linguagem simples.
- **Ações:** reconectar destino, reduzir bitrate/preset, reabrir câmera, abrir áudio, exportar diagnóstico.
- **Sistema:** CPU, RAM, disco livre, frame time, fila de ingest.
- **Últimos eventos:** “destino reiniciou 3×”, “convidado perdeu 12%”.
- **Exportar .json** com um clique, sem chaves/segredos.

**Aceite:**

- Um problema de destino pode ser diagnosticado e re-tentado sem abrir Ajustes.
- Nenhuma ação de saúde altera o programa sem confirmação.
- Dados disponíveis offline e sem telemetria obrigatória.

---

### 6.8 U8 — Modo ensaio

**Problema.** Testar convidado, cena, legenda e áudio hoje significa gravar um arquivo ou publicar.

**Proposta:**

- Botão “Ensaio” na topbar/prontidão.
- Banner permanente **“ENSAIO — não vai ao ar”**.
- Destinos RTMP/NDI bloqueados; gravação local opcional; timer.
- Convidados entram normalmente para teste; host pode simular “corte” e “GC”.
- Ao sair: “Descartar ensaio” ou “Aproveitar gravação de teste”.
- “Ir ao vivo a partir do ensaio” com uma confirmação.

**Aceite:**

- Nenhum byte vai para destinos durante ensaio.
- A UI não deixa dúvida sobre o estado.
- Sair do ensaio restaura o estado anterior.
- Funciona offline.

**Métrica:** número de primeiras lives precedidas de ensaio; queda de falhas no primeiro minuto.

---

### 6.9 U9 — Biblioteca de gravações e clipes

**Problema.** A aba Gravações mostra recentes, player e “mostrar na pasta”, mas o pós-live ainda termina no
sistema de arquivos. Não há busca, tags, marcadores ou clipes.

**Proposta:**

- Biblioteca com filtros por estúdio, data, horizontal/vertical, duração e status.
- Busca por nome; renomear sem quebrar o player; favoritos.
- Marcadores durante a live (“clip”), gerando trechos de 15–60 s a partir da gravação/Replay.
- Exportar clipe vertical 9:16; abrir no player; copiar caminho; enviar para pasta.
- Lixeira com prazo de retenção.
- “Relatório da gravação”: duração, fps médio, perdas, destinos.

**Aceite:**

- Encontrar uma gravação por estúdio/data em ≤2 filtros.
- Criar clipe a partir de uma gravação sem abrir editor externo.
- Nada é apagado definitivamente sem confirmação na lixeira.

---

### 6.10 U10 — Guest 2.0: sala de espera, PIN e TTL

**Problema.** Quem tem o link entra direto na sala. O host não tem uma lista de admissão, PIN ou expiração;
links vazados podem ser usados.

**Proposta:**

- Sala de espera opcional: convidado vê “Aguardando o host admitir”.
- PIN curto por estúdio (opcional) + link com TTL/revogação.
- Host vê pré-checagem do convidado (mic/câmera/rede) antes de admitir.
- “Testar como convidado” a partir do estúdio.
- Reentrada com o mesmo `guestId` não duplica a pessoa.

**Aceite:**

- Host consegue admitir/recusar em 1 clique.
- Link expirado mostra mensagem clara, não tela branca.
- PIN não substitui TURN/auth; é camada de controle de sala.

---

### 6.11 U11 — Biblioteca de mídia

**Problema.** Com muitos arquivos, a lista atual fica difícil; faltam tags, favoritos, filtros e ações em
lote. É uma melhoria, não uma reescrita.

**Proposta:** busca, tags, favoritos, ordenação, duração/resolução, seleção múltipla, “mover para playlist”
e “mostrar na pasta”. Manter a importação atual.

---

### 6.12 U12 — Templates de estúdio e brand kit

**Problema.** Marca, layouts, cenas, banners e GCs ficam presos a um estúdio; reaproveitar exige refazer.

**Proposta:**

- Pacote `.castdeck` com marca, fontes, layouts, cenas, GCs e preferências (sem chaves/destinos).
- Galeria de templates: “Podcast”, “Igreja”, “Evento”, “Aula”.
- Importar com prévia e conflitos (“manter meu logo”).
- Exportar/importar para backup antes de update.

---

### 6.13 U13 — Legendas: transcrição e exportação

**Problema.** A legenda ao vivo existe, mas o valor pós-live é limitado se não há transcrição exportável.

**Proposta:**

- Exportar **SRT/VTT** por idioma.
- Busca na transcrição; capítulos por marcador.
- Copiar trecho; “criar clipe” a partir do trecho.
- Tudo local por padrão; nenhuma transcrição sai do dispositivo sem opt-in.

---

### 6.14 U14 — Relatório pós-live

**Problema.** Ao encerrar, o operador não vê um resumo do que aconteceu.

**Proposta:** cartão pós-live com:

- duração, pico de fps, quadros perdidos, reconexões por destino;
- arquivos gerados e caminhos;
- convidados e qualidade média;
- problemas e recomendações;
- “Exportar relatório” e “Abrir pasta”.

---

### 6.15 U15 — Rundown/roteiro ao vivo (nova função estratégica)

**Problema.** Podcasts, igrejas, aulas e eventos costumam ter um roteiro em outro lugar. O operador faz
“Ctrl+Tab” mental entre notas, câmera, GC e mídia.

**Proposta.** Uma aba **Roteiro** com blocos:

| Campo | Exemplo |
|---|---|
| Horário/duração | 00:00–05:00 |
| Título | Abertura |
| Notas | “Bom dia; apresentar convidado” |
| Fonte/câmera | Câmera 1 / Cena |
| Mídia | Intro.mp4 |
| GC | Nome do convidado |
| Convidado | Ana |
| Estado | Pendente / No ar / Concluído |

- Botão **Próximo** avança o bloco e mostra o que vem.
- Timer do bloco e da live.
- “Preparar próximo” coloca mídia na prévia sem cortar.
- Auto-avanço **opcional** e desligado por padrão.
- Templates de roteiro; importar CSV/Markdown simples.
- Exibir “próximo” também no **remote control** e em uma segunda tela.

**Por que é forte:** é uma função que OBS/vMix não entregam de forma simples e que conversa com o público
de podcast, igreja e evento — o mesmo público que já usa GC, Jornal, Esportes e Replay.

**Aceite:**

- Criar um roteiro de 5 blocos em <2 min.
- Avançar não altera o programa sem ação explícita de cena/corte.
- Funciona offline; o remote vê o próximo bloco.
- Não substitui cenas rápidas; integra.

---

### 6.16 U16 — Director Assist (sugestões, não automático)

**Problema.** O Diretor Auto agora é manual por decisão de produto. Operadores iniciantes ainda não sabem
para quem cortar.

**Proposta:**

- Faixa discreta de sugestão: “Ana está falando há 4 s — cortar para Câmera 2?”.
- Ações: `Enter` aceita, `Esc` ignora, “não sugerir nesta cena”.
- Aprender preferências locais (quem mais fala, layouts).
- **Nunca** cortar sozinho; sem persistência de “ligado”.
- Log de sugestões para revisão pós-live.

**Aceite:** nenhuma sugestão altera o PGM sem aceite; desligar é imediato; funciona sem áudio de convidados.

---

### 6.17 U17 — Network doctor

**Problema.** Falhas de convidado são atribuídas ao app quando muitas vezes são NAT, TURN, firewall, Wi-Fi
ou upload.

**Proposta:**

- Teste de STUN/TURN, tipo de NAT, perda/RTT, upload estimado, DNS e porta.
- “Testar este link como convidado” em outro dispositivo.
- Diagnóstico explicável: “Sem rota P2P; TURN necessário”.
- Exportar relatório.

---

### 6.18 U18 — IA local para capítulos/highlights

**Proposta de longo prazo, condicionada a desempenho:**

- transcrição já existente → capítulos automáticos;
- detecção de silêncio/retakes → sugestão de corte;
- highlights de 15–60 s para revisão;
- resumo local da live;
- modelos baixáveis, opt-in, sem upload por padrão.

**Não fazer:** enviar áudio para nuvem sem consentimento; rodar modelo pesado durante a live sem orçamento.

---

## 7. Arquitetura de informação proposta

### 7.1 Dashboard

Manter as 4 abas atuais, mas dar mais peso a **antes/depois da live**:

- **Estúdios** — cards com “Pronto?”, último modo, gravação recente.
- **Biblioteca** — gravações, clipes e transcrições (pode absorver “Gravações”).
- **Destinos** — saúde e teste.
- **Sistema** — diagnóstico, armazenamento, atualização.

### 7.2 Estúdio: de 9 grupos para 6

Proposta de consolidação, sem remover funções:

| Grupo novo | Absorve |
|---|---|
| **Cena** | Mídia, Playout, layouts, palco/backstage |
| **Gráficos** | Grafismo, Jornal, Esportes, Widgets/QR |
| **Pessoas** | Chat, Redes, Intercom, convidados |
| **Áudio** | Mixer, Trilha, legendas de áudio |
| **Saídas** | Destinos, Sinais, NDI, Vertical, gravação |
| **Sistema** | Dispositivos, Ajustes, diagnóstico, roteiro? |

> **Roteiro** pode ser um grupo próprio quando U15 existir; no MVP, fica como aba destacada em “Cena” ou
> botão na topbar.

### 7.3 Topbar

Manter:

- Estúdio/Mesa;
- Gravar;
- Transmitir;
- Convidar;
- Painel.

Mover para **“Ferramentas”** ou paleta:

- NDI;
- PTZ;
- Câmeras;
- Remote;
- Intercom mini;
- WhatsApp;
- Replay;
- Vertical.

Não mover: **Gravar, Transmitir, Sair, microfone/câmera**.

### 7.4 Barra inferior

- Microfone e câmera permanecem.
- “Convidar”, “Mídia”, “Tela/Aba” permanecem.
- “Nomes”, “Cursor”, “Dispositivos” podem ir para um menu “Exibição” com estado.
- “Sair” sempre visível.

---

## 8. Roadmap sugerido

### 8.1 Ciclo 1.6 — Confiança e clareza

**Duração estimada:** 2–3 semanas de desenvolvimento + validação.

| Entrega | Critério de saída |
|---|---|
| U1 Prontidão | Checklist cobre pessoas, áudio, rede, saídas, sistema e conteúdo |
| U2 Perfis | 4 perfis iniciais com diff e undo |
| U3 Paleta | 100% das ações principais |
| U4 Ajuda | `?` e tour |
| U5 Desfazer | Ações reversíveis + lixeira de gravações |
| U6 Modo | Aviso de entrada e “voltar ao estúdio” |
| U7 Saúde | Ações de reconexão + diagnóstico no popover |

**Não incluir IA nem rundown neste ciclo.**

### 8.2 Ciclo 1.7 — Teste e entrega

- U8 ensaio;
- U9 biblioteca/clipes;
- U10 sala de espera/PIN;
- U14 relatório pós-live;
- U13 exportação de legenda;
- U11/U12 mídia e templates.

### 8.3 Ciclo 1.8+ — Roteiro e inteligência

- U15 rundown;
- U16 Director Assist;
- U17 network doctor;
- U18 IA local;
- U19/U20 companion e multi-destino avançado.

---

## 9. Métricas e experimentos

### 9.1 Métricas principais

| Métrica | Definição | Meta inicial |
|---|---|---|
| Tempo até primeira live | Abrir o app → primeiro `AO VIVO` | −25% |
| Conclusão da prontidão | % de lives com checklist concluído | ≥80% |
| Falhas no primeiro minuto | Quedas/erros de destino/câmera nos primeiros 60 s | −30% |
| Sucesso de convidado | Entrou e permaneceu ≥2 min | ≥95% |
| Tempo para achar função | Busca/ajuda usada com sucesso | −40% de dúvidas |
| Uso de desfazer | Ações revertidas / ações de risco | acompanhar |
| Clipes exportados | Clipes criados por live | baseline → +20% |

### 9.2 Instrumentação

Se a telemetria opt-in estiver ativa, eventos sugeridos:

- `readiness_opened`, `readiness_check_failed`, `readiness_passed`;
- `profile_applied`, `profile_diff_viewed`;
- `command_palette_opened`, `command_executed`;
- `undo_used`, `snapshot_restored`;
- `rehearsal_started`, `rehearsal_finished`;
- `guest_waiting_room_admitted`;
- `clip_created`, `transcript_exported`;
- `rundown_advanced`.

Regras:

- nenhum conteúdo de áudio/texto sai do dispositivo;
- dados locais primeiro; remoto só opt-in;
- não instrumentar nomes de convidados ou chaves.

---

## 10. Riscos e não-objetivos

| Risco | Mitigação |
|---|---|
| Muitas telas novas aumentam a carga | Cada tela nova deve **remover** uma decisão, não adicionar |
| Perfis sobrescrevem configuração | Diff, preview, snapshot e undo |
| Rundown vira um produto dentro do produto | MVP de blocos + próximo; sem editor de texto rico |
| IA local pesa na live | rodar fora do horário ou em modo econômico; orçamento explícito |
| Nova topbar piora telas pequenas | testar 390/700/900/1280; overflow acessível |
| Guest PIN dá falsa segurança | documentar que não substitui TURN/auth; TTL e revogação reais |
| Métricas viram vigilância | local-first, opt-in e anonimização |
| Android fica para trás | paridade de UI testada; recursos desktop-only explícitos |

**Não-objetivos:**

- substituir o dashboard por uma rede social;
- vender assinatura dentro do app;
- exigir conta/cloud para preparar ou gravar;
- direção automática ligada por padrão;
- reescrever a UI em framework novo neste ciclo.

---

## 11. Decisões necessárias

1. **Persona principal do próximo ciclo:** criador solo, igreja, podcast, evento ou jornalismo?
2. **Perfis:** quatro é suficiente para o MVP ou precisa de perfil personalizado desde o início?
3. **Rundown:** é 1.7 ou 1.8? Ele substitui as “cenas rápidas” ou convive com elas?
4. **Guest 2.0:** PIN é obrigatório para todos os links ou opcional por estúdio?
5. **IA local:** há hardware mínimo para transcrição/highlights? Pode ser opt-in?
6. **Instrumentação:** a telemetria atual é suficiente ou precisamos de métricas locais novas?
7. **Redesign:** fazemos a consolidação da navegação agora ou depois do ciclo 1.6?
8. **Android:** quais itens novos entram no APK e quais são explicitamente desktop-only?

---

## 12. Anexo — evidências usadas

| Evidência | Onde | O que demonstra |
|---|---|---|
| 9 grupos / 21 sub-abas | `public/js/studio/studio.js` (`TAB_GROUPS`) | Carga de navegação |
| Topbar e bottombar densas | `public/js/studio/studio.js` (shell do estúdio) | Muitas ações competindo |
| Dashboard com 4 passos | `public/js/dashboard.js` (`steps`) | Onboarding inicial existe, mas é genérico |
| Saúde por destino | `public/js/studio/onair.js` (`health`, `sectionHtml`) | Já existe base para central acionável |
| Diagnóstico completo | `server/index.js` (`/api/diagnostics`) | Dados existem; faltam exposição contextual |
| Botão de diagnóstico em Ajustes | `public/js/studio/studio.js` | Está escondido no momento de falha |
| Diretor Auto manual | `public/js/studio/autoswitch.js` (`setOn`) | Direção automática não deve voltar sozinha |
| Modo persistido | `public/js/studio/switcher.js` (`localStorage` `castdeck.switcher`) | Risco de abrir no modo errado |
| Sem desfazer geral | busca por `undo`/`desfazer` | Undo só em layout/GC/fluxos pontuais |
| Sem ensaio/sala de espera | busca por `ensaio`/`waiting room` | Lacunas confirmadas |
| Auditoria de usabilidade | `docs/ai/ANALISE-APP-PRINCIPAL.md` | Itens abertos: atalhos, modo persistido, telas pequenas |
| Plano anterior | `docs/designs/IMPROVEMENTS-EGM.md` | Base de confiabilidade/segurança; este estudo foca produto/UX |
| Planos de infraestrutura | `docs/PLANO-MELHORIAS.md` | CI, auth, updater e assinatura continuam válidos, mas não são o foco aqui |

---

## 13. Conclusão

O CastDeck está no ponto em que **mais funções não equivalem a mais valor**. O próximo salto vem de:

1. **saber se está pronto** antes de ir ao vivo;
2. **encontrar a ação** sem decorar a interface;
3. **testar sem risco**;
4. **voltar atrás** quando algo sai errado;
5. **entregar a gravação** de forma organizada.

A sequência recomendada é:

> **1.6 Confiança** (prontidão, perfis, paleta, atalhos, undo, saúde)
> → **1.7 Produção** (ensaio, biblioteca/clipes, guest 2.0, relatório, legendas)
> → **1.8 Roteiro e inteligência** (rundown, Director Assist, IA local).

Se apenas uma coisa for feita no próximo ciclo, que seja a **Central “Pronto para ir ao vivo?”**. Ela ataca
o medo mais caro do operador — publicar com um problema que poderia ter sido visto antes — e usa dados que
o app já tem.
