# Intercom — guia EGM

> **Versão:** CastDeck Local 1.3.33.
> **Status:** publicado no site, no app e no GitHub.
> **Escopo:** diretor/host, cinegrafistas, repórteres e operação de corte.

---

## 1. O que é

O intercom é uma via de áudio de produção entre o diretor e a equipe:

```text
DIRETOR  ── fala/ouve ──  CÂMERA 1
         ── fala/ouve ──  CÂMERA 2
         ── fala/ouve ──  REPÓRTER
         ── envia ──────  PROGRAMA (IFB)
```

Ele não é uma chamada de vídeo e não vai ao programa por padrão. É a conversa de bastidor:
“entra no ar”, “abre mais o plano”, “segura o repórter”, “volta para a câmera 2”.

### O que ele resolve

- O cinegrafista ouve o diretor sem tirar a câmera do ar.
- O repórter pode entrar só com um link de áudio.
- O diretor fala com todos, com um grupo ou com uma pessoa.
- O microfone pode ser momentâneo ou ficar travado aberto.
- O retorno do programa (IFB) pode ir junto, em volume separado.
- Um mini painel opcional junta intercom e corte de câmeras.

### O que ele não é

- Não substitui um intercom de hardware RTS/Clear-Com.
- Não é uma via ponto a ponto sem o PC do host.
- Não grava áudio de intercom.
- Não garante funcionamento com o Android suspendendo a aba; veja a seção mobile.

---

## 2. Papéis e caminhos

| Papel | Onde entra | O que ouve | O que fala |
|---|---|---|---|
| **Diretor / host** | Estúdio → Áudio → Intercom | câmeras, repórteres e programa | todos, grupos ou uma pessoa |
| **Cinegrafista** | página `/cam` | diretor e, opcionalmente, programa | diretor |
| **Repórter** | página `/intercom/:id` | diretor e, opcionalmente, programa | diretor |
| **Convidado comum** | link de convidado | retorno do programa | programa |
| **Observador** | futuro | conforme permissão | conforme permissão |

O convidado comum **não entra no intercom automaticamente**. O intercom é para a equipe de produção.

---

## 3. EGM — seis lentes

### 3.1 Operação

O que o diretor precisa ao vivo:

- PTT grande, de uma mão, sem procurar menu.
- Teclas de canal: **TODOS**, **CÂMERAS**, **REPORTAGEM**, **PGM**.
- PTT individual por participante.
- Ver quem está conectado, quem está ouvindo e quem está falando.
- Abrir o painel de câmeras sem perder a operação.
- **Mic Unlatch** e **Silenciar todos** sempre acessíveis.

O mini painel resolve o caso de quem precisa cortar e falar no mesmo gesto: ele fica flutuando
sobre o estúdio com PTT, travar microfone e botões de corte das câmeras.

### 3.2 Criação

Como a equipe entra:

1. O host abre **Áudio → Intercom**.
2. Clica em **Link/QR**.
3. Escolhe o link da mesma rede (Wi‑Fi) ou o link de Internet.
4. Envia o QR/link para o celular.
5. O participante abre, libera o microfone, usa fone e começa a ouvir.

Não há instalação de aplicativo para o intercom no navegador.

### 3.3 Automação

O intercom usa automação apenas no que ajuda a operação:

- PTT abre e fecha o microfone com rampa curta, sem clique.
- O retorno é pessoal: cada participante não ouve a própria voz.
- O mesmo peer WebRTC da câmera é reutilizado; não há segunda conexão.
- A página independente reconecta ao voltar para a aba.
- O IFB pode receber o programa automaticamente, se estiver ligado no painel.
- O mini painel atualiza sozinho quando alguém entra ou sai.

O microfone **nunca abre sozinho**.

### 3.4 Cognição

O operador precisa entender o estado num relance:

| Estado | O que aparece |
|---|---|
| Conectado | ponto verde no participante |
| Ouvindo | botão “Ouvindo” |
| Falando | PTT aceso em azul/ciano |
| PTT travado | **MIC TRAVADO** em âmbar |
| Câmera no PGM | etiqueta PGM em vermelho |
| Câmera na prévia | etiqueta PVW em verde |
| Sem ninguém | **SEM PARTICIPANTES** no mini PTT |
| Erro de link | mensagem de chave inválida |
| Tela ativa | indicador na página mobile |

As cores do tally (vermelho/verde) não são usadas para “falando”, para não confundir
o intercom com o que está no ar.

### 3.5 Performance

- Áudio mono, sem vídeo no canal de repórter.
- Mesmo peer da câmera: o vídeo não renegocia uma segunda conexão.
- Um destino WebAudio por participante.
- Codec Opus do WebRTC, prioridade para latência baixa.
- Sem reencode de vídeo ao ativar o intercom.
- A página de repórter consome pouca bateria e banda.

A latência real depende da rede local, do túnel e do TURN. O caminho de áudio é separado do
programa e não passa pelo encoder RTMP.

### 3.6 Confiança

- Intercom fora do programa por padrão.
- PTT travado tem botão de destravar no host.
- Link de intercom exige a chave do estúdio.
- O host só abre no próprio PC; o participante não comanda a live.
- “Silenciar todos” fecha os microfones da equipe.
- O programa no IFB tem volume próprio.
- O operador deve usar fone; alto-falante pode gerar eco.
- Nenhum áudio de intercom é gravado pelo CastDeck.

---

## 4. Começar em 3 minutos

### No PC do diretor

1. Abra o estúdio.
2. Vá em **Áudio → Intercom**.
3. Confira o medidor do microfone do host.
4. Clique em **Link/QR**.
5. Copie o link ou mostre o QR.

### No celular do cinegrafista

1. Abra o link no Chrome/Edge.
2. Aceite o microfone.
3. Use **fone**.
4. Segure **SEGURE PARA FALAR** para falar.
5. Solte para fechar o microfone.

### No celular do repórter

1. Abra o link `/intercom/...`.
2. Toque em **Ouvir diretor**.
3. Segure o PTT ou use **Travar PTT**.
4. Mantenha o navegador aberto e a tela ativa.

---

## 5. Painel do host

### Cabeçalho

- estado do intercom;
- número de conectados;
- botão **Mini**;
- botão **Link/QR**.

### Diretor

- **PTT GERAL**: segure para falar com todos.
- **Travar PTT**: clique para manter o microfone aberto até fechar.
- medidor do microfone;
- **Mic Unlatch**: fecha microfones travados.

### Teclas

| Tecla | Efeito |
|---|---|
| **TODOS** | fala/ouve todos |
| **CÂMERAS** | grupo de cinegrafistas |
| **REPORTAGEM** | grupo de repórteres |
| **PGM** | só escuta o programa |

### Participantes

Cada linha mostra nome, papel, PGM/palco, fone, nível, **Ouvindo** e **PTT** individual.
O microfone do participante começa fechado.

### IFB

- **Enviar programa no IFB**: manda o programa para o retorno.
- nível do programa separado do PTT;
- o programa não entra no programa (sem loop);
- o intercom não vai ao programa.

### Administração

- **Mic Unlatch**;
- **Silenciar todos**;
- **Testar fone**: envia um tom curto para os retornos;
- link/QR.

---

## 6. Página da câmera (`/cam`)

O cinegrafista continua enxergando e ajustando a câmera. O intercom é uma faixa:

```text
● INTERCOM          [Ouvindo] [Travar]
┌──────────────────────────────────────┐
│            SEGURE PARA FALAR         │
└──────────────────────────────────────┘
```

- PTT grande, com área de toque confortável.
- O microfone da câmera começa desligado.
- O mesmo microfone é usado pelo intercom quando o PTT abre.
- **Travar** mantém o microfone aberto; um toque abre, outro fecha.
- O retorno de áudio entra no mesmo peer da câmera.
- O vídeo continua normalmente ao ativar/desativar o intercom.
- O estado de tally continua valendo: vermelho no ar, verde na prévia.

---

## 7. Página independente (`/intercom/:id`)

Para repórter ou cinegrafista que só precisa de áudio:

- página enxuta, sem vídeo;
- PTT grande;
- escuta do diretor;
- volume de escuta;
- **Travar PTT**;
- indicador de tela ativa;
- notificação de mídia do Chrome;
- reconexão ao voltar.

Link:

```text
https://<servidor>/intercom/<id-do-estúdio>?k=<chave>&role=reporter
```

O papel `camera` também é aceito para quem só quer áudio.

---

## 8. Mini painel Intercom + Corte

O mini painel é opcional e foi feito para quem opera sozinho:

- abre pelo ícone de microfone na barra superior ou pelo botão **Mini** no painel;
- fica flutuante e pode ser arrastado;
- pode ficar aberto ou ser fechado;
- compartilha o PTT e o estado de travamento com o painel principal;
- mostra as câmeras em **CORTE RÁPIDO**;
- clicar numa câmera coloca a fonte no programa (e ativa a mesa de corte se necessário).

### Como arrastar

Segure a barra de título **INTERCOM + CORTE** e arraste. Solte em qualquer lugar. A posição fica
salva no navegador.

### PTT no mini

- **Segurar** = fala enquanto pressiona.
- **Travar PTT** = um clique abre, outro fecha.
- Sem participantes, o botão fica **SEM PARTICIPANTES**.

---

## 9. PTT momentâneo x travado

| Modo | Como usar | Quando usar |
|---|---|---|
| **Momentâneo** | segure o botão | operação normal, evita microfone aberto |
| **Travado** | toque em **Travar PTT** e depois clique no PTT | mãos ocupadas, direção contínua |

Regras:

- O PTT travado é exibido em âmbar.
- **Mic Unlatch** fecha imediatamente.
- Ao destravar, o microfone é fechado se estava aberto.
- O travamento é local do host/câmera/repórter.

---

## 10. IFB e programa

O IFB é o retorno do programa para quem está na rua ou atrás da câmera:

```text
PROGRAMA ──► retorno pessoal ──► fone do cinegrafista
DIRETOR  ──► retorno pessoal ──► fone do cinegrafista
```

- O volume do programa é independente do volume da voz do diretor.
- O participante não ouve a própria voz.
- O programa não é enviado ao programa.
- Se o participante estiver com alto-falante, pode ocorrer eco.
- Use fone.

---

## 11. Celular e tela desligada

A página `/intercom` e a `/cam` usam:

- **Screen Wake Lock** para manter a tela ativa enquanto o navegador permite;
- **Media Session** com o título “Intercom — CastDeck” e controles de mídia;
- **áudio de manutenção silencioso** para manter o contexto de áudio;
- reconexão quando a página volta a ficar visível.

### Limite importante

Isso é o máximo que uma página web consegue fazer sem um serviço nativo. O Android ainda pode
suspender a aba quando o usuário bloqueia o aparelho. Para background garantido seria necessário
um **serviço em primeiro plano no app Android**.

Recomendações:

- usar fone;
- manter o Chrome em primeiro plano;
- deixar a tela ativa;
- não bloquear o aparelho durante a operação crítica;
- testar o aparelho antes da live.

---

## 12. Link, chave e segurança

- A página independente exige `k=<chave>`.
- O link da mesma rede usa HTTPS local; aceite o certificado na primeira vez.
- O link de Internet depende do túnel.
- A chave é a mesma do link de saída nesta versão.
- O host só abre no PC local.
- O intercom não é enviado ao programa nem gravado.
- “Silenciar todos” não desliga o áudio do programa.
- Não compartilhe o link fora da equipe.

---

## 13. Solução de problemas

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Página não abre | link incompleto ou estúdio fechado | gerar novo Link/QR |
| “Link inválido” | chave errada/expirada | gerar novo link no host |
| Não ouço o diretor | fone/volume ou áudio bloqueado | tocar em Ouvir; liberar áudio no navegador |
| Não falo | microfone negado ou PTT não segurado | liberar microfone; segurar ou travar |
| Eco | alto-falante aberto | usar fone |
| Câmera sem intercom | página antiga em cache | recarregar; conferir versão 1.3.33 |
| Mini PTT sem reação | nenhum participante conectado | conectar câmera/repórter; ver “SEM PARTICIPANTES” |
| Painel não abre pelo mini | lateral fechada | agora o botão abre a lateral automaticamente |
| Tela apaga | Android suspendeu a aba | manter ativa; usar app nativo se precisar |
| Mini não arrasta | botão pressionado em vez da barra | arrastar pela barra de título |

---

## 14. Limites desta versão

- Sem sidetone ajustável.
- Sem call/cue sem voz.
- Sem ducking automático do IFB.
- Grupos fixos (Câmeras/Reportagem); sem editor de grupos.
- Sem chave separada da chave de saída.
- Sem gravação de intercom.
- Sem garantia de background no Android; melhor esforço via Wake Lock/Media Session.
- Teste em aparelhos reais ainda é recomendado.

---

## 15. Relação com o EGM de design

- [`designs/INTERCOM-EGM.md`](designs/INTERCOM-EGM.md): decisões de produto, arquitetura, fases e riscos.
- [`designs/INTERCOM-HOST-PANEL.md`](designs/INTERCOM-HOST-PANEL.md): wireframes e comportamento do painel do host.
- Este guia: uso, operação e suporte.

O EGM foi usado para documentar o **porquê**, o **como** e o **o que foi entregue**, sem separar
produto, engenharia e operação em documentos desconectados.

---

## 16. Critérios de aceite

- [ ] Host fala com todos, grupo e pessoa.
- [ ] Câmera ouve o diretor e fala de volta.
- [ ] Repórter entra pelo link com chave.
- [ ] PTT travado abre/fecha com um clique.
- [ ] Mic Unlatch funciona.
- [ ] Intercom não vai ao programa por padrão.
- [ ] IFB tem volume próprio.
- [ ] Câmera não perde vídeo ao usar intercom.
- [ ] Mini painel abre, arrasta e corta câmera.
- [ ] Mini PTT atualiza quando alguém entra/sai.
- [ ] Página mobile mostra “Tela ativa” após o primeiro toque.
- [ ] Link sem chave é recusado.
- [ ] Funciona em LAN e Internet.
- [ ] Testado com fone, sem eco.
