# EGM — Oportunidades de melhoria do CastDeck

> **Status:** relatório de melhorias; itens **4, 5 e 8** implementados localmente em 2026-11-03,
> **sem publicar**.
> **Base:** CastDeck Local **1.3.28** (site e GitHub) + correções locais.
> **Data:** 2026-11-03

---

## 1. Resumo executivo

O app já tem uma base funcional grande: mesa de corte, modos Estúdio/PGM, convidados WebRTC,
multistream, gravação, replay, DSK, GCs, mídia, legendas, enquetes, QR, redes sociais, controle
remoto e Android.

As melhorias de maior retorno agora **não são novas telas**: são **confiabilidade, clareza,
segurança de distribuição e experiência do convidado**.

### Top 10 recomendado

| # | Melhoria | Por que agora | Esforço |
|---|---|---|---|
| 1 | CI com testes automatizados e regressão dos novos fluxos | 63 testes existem, mas sem pipeline; regressões recentes (QR, mesa, câmera) mostram o risco | M |
| 2 | Supervisor do servidor + watchdog de performance | Servidor pode morrer e a janela fica inutilizável; plano já existe | M |
| 3 | Assinatura Windows + keystore Android | Distribuição sem assinatura gera alertas e falsos positivos | M/L |
| 4 | Assistente de áudio/caixa de som (eco) | Host com caixa sem fone é um caso real e sem tratamento guiado | M |
| 5 | Pré-checagem do convidado (mic/câmera/rede/fone) | Evita entrar na live com problema e culpar o app | M |
| 6 | Ampliar “seguir vídeo” (rodízio, AUTO, co-host) | Base de playlist já existe; falta previsibilidade e opções | M |
| 7 | Limites de store/replay/ingest | Riscos de memória e CPU já mapeados no plano de performance | M |
| 8 | Acessibilidade e clareza dos dois modos | Estúdio × PGM ainda confunde; teclado/T-bar precisam de revisão | S/M |
| 9 | Exportar/importar estúdio + diagnóstico de sessão | Suporte e backup ficam dependentes de arquivos internos | M |
| 10 | GitHub visível + fallback de código-fonte | Conta 404 deixa link e página de fonte quebrados | S (externo) |

---

## 2. Método EGM

Seis lentes:

1. **Operador / UX** — clareza, onboarding, erros, acessibilidade.
2. **Confiabilidade / performance** — travamentos, recuperação, limites.
3. **Áudio** — microfone, caixa, fone, eco, mix-minus.
4. **Vídeo / mídia** — mesa, playlist, DSK, replay, convidados.
5. **Arquitetura / segurança / distribuição** — dados, secrets, assinatura, updates.
6. **Qualidade / suporte** — testes, diagnóstico, documentação, operação.

Critérios:

- **Impacto:** 1–5 (usuário sente? evita live perdida?).
- **Esforço:** S (dias), M (semanas), L (mês+).
- **Risco:** baixo/médio/alto.
- **Prioridade:** P0 (próximo ciclo), P1 (próximas ondas), P2 (estratégico).

---

## 3. Lente 1 — Operador / UX

### U1. Deixar explícito “Modo Estúdio” × “Modo PGM”

**Problema:** o mesmo clique em câmera/vídeo significa coisas diferentes:

- Estúdio: palco/Solo, sem take.
- Mesa: prévia/take, com Cena podendo ter Solo.

**Direção:**

- rótulos e tooltips por modo (“Seguir no palco” × “Seguir no PGM”);
- indicador fixo do modo atual e do que está no ar;
- guia de 1 página no primeiro uso.

**Impacto:** 5 · **Esforço:** S · **Prioridade:** P0.

### U2. Onboarding de primeira live

**Problema:** o lobby já pede câmera/mic, mas não valida caixa/fone, rede, destino ou encoding.

**Direção:** checklist curto:

1. câmera/mic funcionando;
2. teste de áudio (fone/caixa);
3. destino RTMP validado;
4. qualidade/encoder recomendado;
5. ensaio de 10 s com gravação local.

**Impacto:** 5 · **Esforço:** M · **Prioridade:** P1.

### U3. Central de diagnóstico para o operador

**Problema:** já existe `/api/diagnostics`, mas o operador não tem uma visão simples de “por que está
ruim” (rede, CPU, encoder, câmera, fila).

**Direção:** painel “Saúde da live” com:

- fps real × alvo; frame time;
- CPU/RAM do app, FFmpeg e navegador;
- fila de ingest, dropped frames, speed;
- câmeras sem frame, convidados com perda/RTT;
- botão “Exportar relatório”.

**Impacto:** 5 · **Esforço:** M · **Prioridade:** P1.

### U4. Acessibilidade de teclado e foco

**Problema:** a mesa tem atalhos globais e controles interativos; T-bar, cartões e foco ainda
precisam de revisão contínua.

**Direção:**

- foco visível em todos os controles;
- ordem de tab lógica;
- ARIA em monitores/tally/T-bar;
- atalhos documentados e sem conflito com botões;
- teste automatizado de foco.

**Impacto:** 4 · **Esforço:** M · **Prioridade:** P1.

### U5. Menos “surpresa” em ações destrutivas

**Problema:** parar transmissão, remover fonte no ar, fechar câmera e trocar layout podem ter
consequências diferentes.

**Direção:** confirmação contextual só quando necessário, com prévia do efeito (“PGM voltará para a
Cena”, “esta fonte está no ar”).

**Impacto:** 4 · **Esforço:** S · **Prioridade:** P1.

### U6. Ajuda contextual e “o que é isto?”

**Problema:** recursos avançados (Solo, take, Cena, DSK, GC, replay, mix-minus) são densos.

**Direção:** botão de ajuda por painel, tooltips longos e link para DOCUMENTACAO; tour de 5 passos
no primeiro acesso.

**Impacto:** 3 · **Esforço:** S · **Prioridade:** P2.

---

## 4. Lente 2 — Confiabilidade / performance

### R1. Supervisor do servidor no launcher

**Problema:** o Tauri inicia o servidor, mas não monitora/reinicia se ele cair; health check é só TCP.

**Direção:**

- health HTTP real com timeout;
- restart com backoff;
- aviso na UI “servidor reiniciando”;
- botão “Recuperar”;
- limite de tentativas e diagnóstico.

**Impacto:** 5 · **Esforço:** M · **Prioridade:** P0.

### R2. Watchdog de frame e degradação automática

**Problema:** o loop já espera ACK, mas não mede frame time nem sabe quando degradar.

**Direção:**

- medir p50/p95/p99;
- se estourar orçamento: pausar miniaturas/prévia, reduzir opcionais;
- nunca degradar o PGM/retorno;
- mostrar estado “protegido/economia”.

**Impacto:** 5 · **Esforço:** M · **Prioridade:** P0.

### R3. Limites de store/replay/ingest

**Problema:** `db.json` completo, replay em RAM e conversões de ingest podem crescer sem limite.

**Direção:**

- store incremental + limite/tamanho + compactação;
- replay com orçamento de memória e aviso;
- admissão de ingest por CPU;
- recusar nova conversão antes de saturar.

**Impacto:** 4 · **Esforço:** M · **Prioridade:** P1.

### R4. Teste de soak contínuo

**Problema:** não há evidência de 8 h estável com convidados, vertical, replay, DSK e multistream.

**Direção:** matriz de 4 perfis de hardware, 8 h, coleta de memória/frame/recuperação; falha se
freeze > 2 s ou crescimento linear.

**Impacto:** 5 · **Esforço:** M · **Prioridade:** P1.

### R5. Tratamento de erro por subsistema na UI

**Problema:** erros de DSK/convidado/mídia podem aparecer como toast genérico ou só console.

**Direção:** estado do subsistema no painel, última falha, botão “tentar de novo”; não derrubar o
PGM.

**Impacto:** 4 · **Esforço:** M · **Prioridade:** P1.

---

## 5. Lente 3 — Áudio

### A1. Assistente de caixa de som / fone

**Problema:** host com caixa sem fone pode gerar eco; o plano [`HOST-ECHO-AEC.md`](HOST-ECHO-AEC.md)
existe, mas não foi implementado.

**Direção:**

- aviso de caixa detectada;
- modo caixa (AEC ligado, “Ouvir programa” desligado);
- teste curto de eco;
- não destruir `rawMic` sem aviso.

**Impacto:** 5 · **Esforço:** M · **Prioridade:** P0.

### A2. Pré-checagem de áudio do convidado

**Problema:** convidado entra com mic mudo, caixa aberta ou sem fone; o host descobre ao vivo.

**Direção:** no lobby do convidado:

- medidor de mic;
- escolha de saída;
- recomendação de fone;
- teste “você se ouve?” com aviso de eco.

**Impacto:** 4 · **Esforço:** M · **Prioridade:** P1.

### A3. Monitor mix-minus mais claro

**Problema:** “Ouvir programa” e monitor padrão são conceitos distintos, mas a UI pode não deixar
claro o que o host ouve.

**Direção:** rótulos “Ouvir convidados (sem minha voz)” × “Ouvir programa inteiro”, com aviso de
loop quando caixa.

**Impacto:** 4 · **Esforço:** S · **Prioridade:** P1.

### A4. Diagnóstico de dispositivo de áudio

**Problema:** troca de dispositivo, sample rate e Bluetooth podem falhar silenciosamente.

**Direção:** status de dispositivo, taxa, latência e “testar tom”; fallback para padrão do sistema.

**Impacto:** 3 · **Esforço:** M · **Prioridade:** P2.

---

## 6. Lente 4 — Vídeo / mídia

### V1. Rodízio de vídeos 2+ (opt-in)

**Problema:** o follow de playlist já existe, mas dois vídeos no palco ainda não alternam por tempo.

**Direção:** modo “Rodízio” separado:

- tempo/duração por item;
- pausar/retomar;
- não substituir câmera no PGM;
- indicador do próximo.

**Impacto:** 4 · **Esforço:** M · **Prioridade:** P1.

### V2. Transição do follow: corte × AUTO

**Problema:** hoje o follow usa corte seco.

**Direção:** opção por modo/playlist; AUTO usa `S.transMs`; não iniciar durante outro fade.

**Impacto:** 3 · **Esforço:** S · **Prioridade:** P1.

### V3. Biblioteca de mídia mais organizada

**Problema:** busca/filtro existem, mas bibliotecas grandes ainda ficam difíceis.

**Direção:** tags/favoritos, ordenação, duração/resolução visível, seleção múltipla, “mover para
playlist” e limpeza de arquivos.

**Impacto:** 4 · **Esforço:** M · **Prioridade:** P1.

### V4. DSK de página web mais resiliente

**Problema:** página externa pode falhar, travar e não avisar.

**Direção:** timeout, retry, último frame válido, indicador de erro e limite de fps.

**Impacto:** 4 · **Esforço:** M · **Prioridade:** P1.

### V5. Replay com orçamento e clipes

**Problema:** buffer em RAM e clipes grandes pressionam memória.

**Direção:** orçamento visível, limite de clipes, compressão/limpeza e aviso antes de gravar clipe
grande.

**Impacto:** 3 · **Esforço:** M · **Prioridade:** P2.

### V6. Vertical com prévia/qualidade consciente

**Problema:** vertical é uma saída extra e pode pesar; usuário precisa saber o custo.

**Direção:** indicador de carga, preset recomendado e possibilidade de desligar preview sem
desligar saída.

**Impacto:** 3 · **Esforço:** S · **Prioridade:** P2.

---

## 7. Lente 5 — Arquitetura / segurança / distribuição

### S1. Assinatura Authenticode no Windows

**Problema:** executável sem assinatura gera alertas e falsos positivos.

**Direção:** certificado, assinatura no build, verificação no release, instruções de confiança.

**Impacto:** 5 · **Esforço:** M/L · **Prioridade:** P0.

### S2. Keystore Android de release

**Problema:** APK de release precisa de chave estável; sem isso, updates quebram.

**Direção:** keystore dedicado, secrets fora do repo, assinatura no CI, rotação documentada.

**Impacto:** 5 · **Esforço:** M · **Prioridade:** P0.

### S3. Auditoria de autenticação/painel

**Problema:** API local exposta na LAN e túnel; precisa revisar auth, CSRF, origens e rate limit.

**Direção:** revisão STRIDE do [`SECURITY-EGM.md`](SECURITY-EGM.md), testes de abuso, limites.

**Impacto:** 5 · **Esforço:** M · **Prioridade:** P0.

### S4. Secrets no cofre do SO

**Problema:** chaves RTMP/TURN e credenciais podem ficar em JSON.

**Direção:** keychain/DPAPI quando possível; mascarar logs; migração.

**Impacto:** 4 · **Esforço:** M · **Prioridade:** P1.

### S5. Update com rollback e verificação

**Problema:** atualização pode falhar no meio ou ser interrompida.

**Direção:** download verificado, instalação atômica, rollback, canal beta/estável.

**Impacto:** 4 · **Esforço:** M · **Prioridade:** P1.

### S6. Fallback de código-fonte e GitHub visível

**Problema:** conta `aloproducao2` retorna 404 anônimo; site e página de fonte apontam para link
morto.

**Direção:** resolver com GitHub; enquanto isso, oferecer pacote de fonte limpo no site (sem
documentos internos) e aviso.

**Impacto:** 3 · **Esforço:** S · **Prioridade:** P1.

---

## 8. Lente 6 — Qualidade / suporte

### Q1. CI com testes obrigatórios

**Problema:** 63 testes existem, mas não há pipeline no repositório de origem.

**Direção:** GitHub Actions/local CI:

- unitários;
- segurança;
- e2e de UI (smoke);
- build Windows/Linux;
- lint/syntax;
- artefato de release.

**Impacto:** 5 · **Esforço:** M · **Prioridade:** P0.

### Q2. Regressões dos fluxos recém-corrigidos

**Problema:** QR, câmera, follow de mídia e T-bar são novos e podem regredir.

**Direção:** testes específicos:

- QR cria/salva;
- câmera não para sozinha;
- preview no fps do PGM;
- follow Estúdio × PGM;
- T-bar para no meio.

**Impacto:** 5 · **Esforço:** S/M · **Prioridade:** P0.

### Q3. Relatório de diagnóstico de sessão

**Problema:** suporte depende de logs crus.

**Direção:** botão “Exportar diagnóstico da sessão” com:

- versão, sistema, hardware;
- fps/frame time, memória;
- fontes/guests/DSK;
- últimos erros;
- sem chaves/segredos.

**Impacto:** 4 · **Esforço:** S/M · **Prioridade:** P1.

### Q4. Matriz de hardware oficial

**Problema:** não há mínimo/recomendado claro para 1080p60, convidados e vertical.

**Direção:** publicar requisitos e limites testados; orientar presets.

**Impacto:** 4 · **Esforço:** S · **Prioridade:** P1.

### Q5. Documentação por tarefa

**Problema:** DOCUMENTACAO é extensa; operador precisa de receitas (“como fazer 2 câmeras + 2
convidados”, “como usar caixa sem fone”, “como recuperar câmera”).

**Direção:** guias curtos com checklist e imagens; vídeos de 2 min.

**Impacto:** 4 · **Esforço:** M · **Prioridade:** P1.

### Q6. Backups/exportação do estúdio

**Problema:** `db.json.bak` automático existe, mas não há export/import amigável.

**Direção:** exportar estúdio (marca, layouts, banners, cenas, DSK config) e importar com validação.

**Impacto:** 3 · **Esforço:** M · **Prioridade:** P2.

---

## 9. Backlog priorizado

### P0 — próximo ciclo

1. CI + regressões dos fluxos corrigidos.
2. Supervisor do servidor + watchdog de frame.
3. Assinatura Windows + keystore Android.
4. Auditoria de auth/API.
5. Assistente de caixa/fone (AEC).
6. Clareza Estúdio × PGM (rótulos/ajuda).

### P1 — ondas seguintes

7. Saúde da live + exportar diagnóstico.
8. Pré-checagem do convidado.
9. Rodízio/AUTO no follow.
10. Limites de store/replay/ingest.
11. Acessibilidade e testes de foco.
12. DSK web resiliente.
13. Biblioteca de mídia (tags/ordenação).
14. Secrets no cofre + update com rollback.
15. Fallback de fonte no site.

### P2 — estratégico

16. Matriz de hardware oficial.
17. Documentação por tarefa/vídeos.
18. Export/import de estúdio.
19. Backups/limpeza de mídia.
20. Telemetria opt-in e diagnóstico remoto.

---

## 10. Critérios de sucesso

- CI verde em todas as releases; nenhum release sem testes.
- Nenhum freeze > 2 s nos cenários de soak; recuperação ≤ 10 s.
- Instaladores assinados e updates com rollback.
- Convidado consegue testar mic/câmera/fone antes de entrar.
- Host com caixa recebe aviso e modo seguro.
- Follow de mídia previsível nos dois modos, com teste E/M.
- Diagnóstico exportável sem vazar segredos.
- Documentação de tarefas principais em ≤ 1 página cada.

---

## 11. Decisões necessárias

1. Prioridade: **segurança/assinatura** antes de novas features?
2. Hardware mínimo oficial e máximo de convidados/vertical.
3. AEC por software ou fone como requisito quando a caixa falhar?
4. Rodízio de vídeos é MVP ou fase 2?
5. Telemetria pode ser local-only ou opt-in remota?
6. Quem fornece/gerencia o certificado Windows e a keystore Android?
7. GitHub: resolver conta ou publicar espelho alternativo?

---

## 12. Veredito EGM

O CastDeck já tem **features suficientes para operar**. O que mais falta é **previsibilidade**:

- um release que não regride;
- um servidor que não deixa a janela morta;
- uma câmera que não se desliga sozinha;
- um convidado que não entra com áudio errado;
- uma mesa que não surpreende entre Estúdio e PGM;
- uma distribuição que não assusta o usuário.

As melhorias de maior impacto são de **confiabilidade, segurança de distribuição e experiência de
áudio/convidado**, não de novas telas. O próximo ciclo ideal é **P0**: CI, supervisor/watchdog,
assinaturas, auditoria de auth e assistente de caixa/fone.


---

## 13. Implementação local — itens 4, 5 e 8 (2026-11-03)

### Item 4 — assistente de caixa de som / eco

- **Ajuda em modal “Como evitar eco”** no lobby (host/convidado) e no painel Áudio, sem alterar o sistema de áudio.

- O lobby compartilhado ganhou **Testar alto-falante** e aviso para usar fone.
- A aba **Áudio → Retorno / Fone** ganhou:
  - checkbox **Estou usando caixa de som** (preferência salva);
  - aviso contextual conforme o dispositivo escolhido;
  - botão **Testar saída**;
  - ao ativar: “Ouvir programa” é desligado e o microfone é reaberto com **AEC/NS/AGC forçados**,
    mesmo que o áudio puro esteja ligado.
- `getMic` aceita `echoSafe` e respeita `speakerMode`; o painel popout também usa o callback.

### Item 5 — pré-checagem do convidado

O lobby compartilhado (host e convidado) agora tem:

- preview de câmera;
- medidor de microfone;
- **Testar alto-falante**;
- recomendação explícita de fone;
- linha de rede (`effectiveType`, downlink e RTT quando o navegador fornece).

### Item 8 — clareza Estúdio × PGM e acessibilidade

- Indicador fixo no topo: **Estúdio · palco/Solo** ou **Mesa PGM · take/Cena · prévia**.
- `aria-pressed` dos botões de modo sincronizado.
- Rótulo do follow muda conforme o modo: **Seguir no palco** × **Seguir no PGM**.
- T-bar com `aria-valuenow` e `aria-valuetext`.
- Foco visível para botões, selects, inputs e elementos com `tabindex`.
- O guia textual do modo fica no `title` do indicador.

### Testes locais

- Lobby do guest: preview, medidor, teste de alto-falante e rede presentes.
- Audio UI: checkbox presente; ativar modo caixa desliga “Ouvir programa”, salva preferência,
  reabre o microfone e mostra o aviso correto.
- Modo: indicador alterna “Estúdio · palco/Solo” ↔ “Mesa PGM · take/Cena · prévia”;
  `aria-pressed` acompanha; o rótulo do follow vira “Seguir no PGM”.
- `node --check` e `npm run test:security`: OK.

### Build local

`dist/CastDeck.exe` 190.845.952 bytes; SHA-256
`65e0464ae999b080234d05d82ff523025638bd6bd660d49d3f48fd75bad33019`.
VPS/GitHub continuam na 1.3.28 **sem** estes três itens.
