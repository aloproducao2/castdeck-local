# EGM — Auditoria de tradução (PT/EN/ES)

> **Status:** publicado na 1.3.29 (2026-11-04).
> **Base:** CastDeck Local 1.3.28 + itens 4/5/8 + ajuda em modal.
> **Data:** 2026-11-03

---

## 1. Método

1. Extrair todas as chamadas `t('...')` de `public/js/**/*.js` e conferir cada chave no
   dicionário `public/js/i18n/strings.json`.
2. Abrir o estúdio em **EN** e percorrer as **18 abas** do painel:
   `media`, `banners`, `journal`, `sports`, `brand`, `display`, `widgets`, `messages`,
   `whatsapp`, `chat`, `social`, `director`, `audio`, `captions`, `outputs`, `output`,
   `devices`.
3. Coletar texto visível e atributos (`title`, `placeholder`, `aria-label`, `alt`, `data-tip`).
4. Repetir no **ES** e no **PT**, incluindo troca de idioma ao vivo.
5. Testar o painel do Diretor em acordeão e o modal de eco.

---

## 2. Resultado geral

> A aba **Playout** entrou depois da auditoria original e também foi traduzida em PT/EN/ES.

| Métrica | Resultado |
|---|---|
| Chaves no dicionário | **2.088** |
| Chamadas `t()` sem chave | **0** |
| Abas auditadas | **18** |
| Erros de runtime no teste | **0** |
| Texto PT restante nas abas em EN | apenas o nome próprio **“Brasília”** em um exemplo |
| Troca EN → ES → PT no Diretor | summaries, labels, checks e deck sincronizados |

O teste de DOM encontrou inicialmente centenas de textos/atributos sem chave. Foram adicionadas
traduções para:

- Diretor automático inteiro (perfis, sensibilidades, ducking, estados e ajuda);
- acordeões e controle remoto;
- mídia, banners, jornal, esportes, marca, mensagens, WhatsApp, redes sociais;
- mesa de áudio, legendas, saídas e diagnóstico;
- barra superior, barra de cenas, dicas e descrições dos menus;
- ajuda “Como evitar eco”.

---

## 3. O que foi corrigido

### 3.1 Diretor automático

- Strings de perfil, sensibilidade, velocidade do Ritmo, ducking, estados e textos de ajuda.
- Tooltips dos perfis e das opções.
- Resumo do acordeão e labels das caixas.
- O painel usa `t()` no HTML; ao trocar o idioma ele é **remontado**, evitando ficar preso no
  idioma anterior.

### 3.2 Controle remoto e cenas

- Strings de rede local, túnel, QR, vídeo e diagnóstico traduzidas.
- O bloco de controle remoto agora fica como uma seção do acordeão do Diretor, e não como um
  `section` solto.
- Strings de cenas (corte, fontes ausentes, expandir/recolher) traduzidas.

### 3.3 Interface geral

- Títulos, descrições de menus, dicas de atalho, tela cheia, câmeras e dispositivos.
- Textos de saída, bitrates, legendas e mesa de áudio.
- Modal de eco e textos de “Testar alto-falante”.

### 3.4 Bug encontrado

Ao trocar o idioma com o Diretor aberto, o painel podia mostrar summaries em inglês e labels em
espanhol misturados. A causa: HTML montado com `t()` fica “congelado” no idioma da montagem, e o
observador de DOM não tem o texto-fonte português para reverter.

Correção:

- listener de idioma remove e remonta o painel do Diretor;
- recalcula labels do deck (`AUTO DIRECTOR` ↔ `DIRECTOR AUTO` ↔ `DIRETOR AUTO`);
- remonta o bloco de controle remoto;
- testado EN → ES → PT.

---

## 4. O que permanece em inglês (proposital ou técnico)

- **Marcas/siglas:** OBS, vMix, PGM, QR, PT/EN/ES, YouTube, Twitch, WhatsApp.
- **Rótulos técnicos de futebol** em inglês no seletor: `Half time`, `Extra time 1/2`,
  `Stoppage time`, `Full time`. Eles vêm de opções e são entendidos como termos de transmissão;
  podem ser traduzidos numa próxima passada, mas não são chaves faltando.
- **Ajuda de integração** de OBS/vMix em inglês em alguns trechos de “Saídas”. São instruções
  copiáveis para ferramentas externas; vale revisar caso o público-alvo seja 100% PT/ES.
- **Conteúdo do usuário:** nomes de convidados, mensagens, URLs, templates e textos digitados não
  são traduzidos.
- **Exemplo** `E.g.: Reporter - live from Brasília` contém o nome próprio Brasília; a frase está
  traduzida, só o nome permanece.

---

## 5. Testes executados

- 18 abas em EN: texto e atributos sem português não traduzido (exceto nome próprio).
- Diretor em EN/ES/PT:
  - summaries: Smart switching / Corte inteligente / etc.;
  - labels: Profile / Perfil / etc.;
  - checks: Enable automatic switching / Activar corte automático;
  - deck e título.
- Modal de eco em EN:
  - título, 4 cartões, notas, botões e “Test speaker”.
- Acordeões:
  - `cut` aberto por padrão;
  - `duck` aberto;
  - `remote` fechado;
  - `help` fechado por padrão (estado persistido por seção);
  - toggle grava em `castdeck.dirsec.*`.
- Controle remoto dentro de `#dir-remote-slot`.
- `node --check` nos arquivos alterados.
- `npm run test:security`: OK.

---

## 6. Recomendação

1. Incluir no CI um teste que reprove `t()` sem chave.
2. Incluir um smoke test de troca de idioma em EN → ES → PT no Diretor.
3. Revisar os rótulos técnicos de futebol e as instruções OBS/vMix se o produto for vendido fora do
   Brasil.
4. Não traduzir conteúdo digitado pelo usuário.

O programa **não está 100% livre de inglês**: restam termos técnicos intencionais e conteúdo de
exemplo. Mas a interface do estúdio, as 18 abas e o Diretor estão cobertos.
