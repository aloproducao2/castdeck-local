# EGM — Estratégia de licenciamento e publicação do código

> **Status:** análise/plano. **Nenhum código foi escrito e nenhuma versão foi alterada.**
> **Data:** 2026-11-03
> **Pedido:** manter os direitos autorais, respeitar as licenças de terceiros e publicar o código em breve.
> **Fontes lidas:** site [cast.flue.live](https://cast.flue.live/), página [Sobre/Licença](https://cast.flue.live/sobre.html#licenca),
> [Código-fonte](https://cast.flue.live/downloads/source/), `LICENSE`, `NOTICE`, `COMMERCIAL-LICENSE.md`,
> `CONTRIBUTING.md`, `README.md`, `build/pack-source.mjs`, `server/binaries.js`, `NOTICE` de terceiros.

> **Aviso:** engenharia de conformidade, não parecer jurídico. Antes de publicar o repositório e vender
> licença comercial, uma revisão jurídica do CLA, do contrato comercial, do FFmpeg, do libsignal (GPLv3) e
> do libvips (LGPLv3) é recomendada.

---

## 1. Resumo executivo

O caminho que o site já anuncia — **AGPL-3.0-only + licença comercial opcional + marca protegida** — é o
melhor para o seu caso, **desde que** cinco coisas sejam corrigidas antes da próxima distribuição:

1. **Publicar o código-fonte de verdade.** Hoje os binários são distribuídos sob AGPL, mas a página
   [Código-fonte](https://cast.flue.live/downloads/source/) diz **“em breve”** e o `pack-source.mjs` mantém o
   zip **privado**. A AGPL (§6) exige fonte correspondente (ou oferta escrita válida) para quem recebe o
   binário. “Em breve” **não é oferta válida**.
2. **Separar o que é seu do que é de terceiros.** A licença comercial só pode cobrir o **código original**.
   FFmpeg (GPL), cloudflared, MediaMTX, yt-dlp, Node, modelos e fontes têm licenças próprias e obrigações
   próprias; o contrato comercial e a página de licença precisam dizer isso.
3. **Fechar as lacunas de avisos.** O acervo agora está em `licenses/` e `THIRD-PARTY-INVENTORY.csv`; antes
   só havia a licença do MediaMTX.
4. **Resolver libsignal (GPLv3) e libvips (LGPLv3).** Eles estão na árvore de produção do Baileys/sharp.
   Enquanto o binário os incluir, a licença comercial **não pode** prometer “código fechado sem obrigações”;
   é preciso isolar, substituir ou aceitar as obrigações GPL/LGPL.
5. **Atribuir o Parakeet (CC-BY-4.0).** O modelo pt-BR exige atribuição visível; incluí-la no app/site.

**Recomendação:** manter **AGPL-3.0-only + licença comercial**, publicar o repositório e o zip de fonte por
release, manter o **CLA atual** (ou revisar), criar **política de marca** e **avisos de terceiros**, e trocar
“em breve” por **download real da fonte** antes de qualquer novo binário.

**Preparação do GitHub:** [`GITHUB-PUBLICATION.md`](GITHUB-PUBLICATION.md) traz o export por allowlist, a
lista do que não pode vazar (VPS/landpage/chaves), a configuração do repositório e o checklist de publicação.
Os arquivos legais preparados estão na raiz: `NOTICE`, `COMMERCIAL-LICENSE.md`, `CLA.md`,
`CONTRIBUTING.md`, `TRADEMARK.md`, `SECURITY.md`, `SOURCE-OFFER.md`, `PRIVACY.md` e
`THIRD-PARTY-NOTICES.md`.

---

## 2. O que o site promete hoje

| Onde | Promessa | Situação real | Risco |
|---|---|---|---|
| Home | “Código aberto — AGPL-3.0” | Binários públicos; fonte ainda “em breve” | **Alto** — AGPL exige fonte/oferta; a promessa não está cumprida |
| Home | “100% gratuito” | AGPL permite uso gratuito; comercial é opcional | Baixo, se o texto deixar claro que a comercial é para casos específicos |
| Sobre | “Licença dupla AGPL-3.0 + comercial” | Compatível com o desejo, mas a comercial precisa excluir terceiros | Médio |
| Sobre | “Quem modificar e distribuir deve publicar o código” | Correto para AGPL | Baixo |
| Sobre | “Oferecer como serviço online obriga a liberar o código” | Correto (AGPL §13) | Baixo |
| Sobre | “Nome e marca CastDeck não podem ser usados em derivados” | É política de marca, não cláusula da AGPL | Médio — precisa estar separada para não parecer restrição adicional |
| FAQ | “Empresas ... licença comercial” | Correto, mas não menciona componentes de terceiros | Médio |
| Fonte | “Em breve” | **Não é fonte nem oferta** | **Crítico** para conformidade AGPL |
| NOTICE | “Todos os componentes compatíveis com AGPL” | Simplificação; FFmpeg GPL exige fonte própria | Médio |

**Conclusão:** a estratégia está certa; a **execução da transparência** está atrasada. O maior risco hoje não
é a licença comercial — é a **distribuição de binários AGPL sem a fonte disponível**.

---

## 3. Concept brief (6 lentes EGM)

| Lente | Pergunta | Direção |
|---|---|---|
| **Direitos** | Como manter a titularidade e o direito de licenciar comercialmente? | Copyright notices, AGPL + comercial, CLA para contribuições, marca separada, revisão de proveniência. |
| **Comunidade** | Por que alguém confiaria e contribuiria? | Fonte pública real, build reproduzível, issues, documentação, licença clara e sem “pegadinha”. |
| **Conformidade** | O que a lei das licenças exige? | Fonte AGPL por release, oferta §13, avisos de terceiros, FFmpeg GPL, modelos/fontes. |
| **Negócio** | Como vender licença comercial sem conflitar com a AGPL? | Contrato só sobre código original; exclusões de terceiros e marca; suporte como diferencial. |
| **Segurança** | O que pode vazar ao publicar? | Chaves, dados de usuário, endpoints privados, certificados, histórico; sanitização e SBOM. |
| **Manutenção** | Como não repetir o atraso? | Fonte gerada no release, checklist de conformidade, falha de build se faltar licença, página automática. |

---

## 4. O que já está bom no projeto

- `LICENSE` com AGPL-3.0 completo.
- `NOTICE` com copyright, licença dupla, marcas e contribuições.
- `COMMERCIAL-LICENSE.md` com “quando precisa/não precisa” e a ressalva de que não altera direitos da AGPL.
- `CONTRIBUTING.md` com CLA que **mantém seus direitos autorais** e concede licença para relicenciar — é o
  formato necessário para licença dupla.
- `pack-source.mjs` já sabe montar o zip do fonte e tem modo `--public`, além de excluir dados/segredos.
- `NOTICE` cita MediaPipe, RNNoise, FFmpeg, cloudflared, Express/ws.
- Site já declara AGPL e licença comercial, e a marca está explicitamente separada.

---

## 5. Lacunas que precisam ser resolvidas antes de publicar

### 5.1 AGPL: fonte e oferta

- [ ] Publicar `castdeck-<versão>-source.zip` em `/downloads/source/` **antes** do próximo binário.
- [ ] Página de fonte com versão, SHA-256, data, instruções de build e licença.
- [ ] Link “Código-fonte” no app (Sobre), no launcher, na página do convidado, no controle remoto e no site.
- [ ] Oferta por escrito para quem baixou versões antigas: página com URL estável e instruções.
- [ ] Incluir `LICENSE`, `NOTICE`, `COMMERCIAL-LICENSE.md`, `CONTRIBUTING.md`, `THIRD-PARTY-NOTICES.txt` e
      `SOURCE-OFFER.txt` no zip e no instalador.
- [ ] Se usar zip por release, manter pelo menos as versões ainda suportadas; a AGPL exige fonte da versão
      entregue, não só da última.
- [ ] Não afirmar “código aberto” enquanto a fonte não estiver pública.

### 5.2 FFmpeg (GPL)

- [ ] Confirmar a licença exata dos binários usados (gyan.dev “essentials” e `ffmpeg-static`): provavelmente
      **GPLv3**.
- [ ] Fixar versão/URL (hoje `latest` pode mudar e quebrar a correspondência fonte/binário).
- [ ] Incluir licença GPLv3, avisos e **fonte correspondente** do FFmpeg/build (ou oferta escrita válida).
- [ ] Separar no site: “CastDeck é AGPL; FFmpeg é GPL e vem com sua própria licença”.
- [ ] Avaliar build **LGPL** se o objetivo for reduzir obrigações; testar codecs/filtros usados.
- [ ] Não incluir FFmpeg no mesmo contrato comercial como se fosse código original.

### 5.2-A libsignal, sharp/libvips e modelos (achados críticos)

A auditoria do `package-lock.json` revelou componentes que **mudam o escopo da licença comercial**:

- **`libsignal` — GPL-3.0.** Está na árvore de produção do Baileys (WhatsApp). Se o binário empacotado
  incluir libsignal (o `pkg` inclui a árvore de produção), há obrigações GPLv3: fonte correspondente,
  avisos e análise de compatibilidade GPL/AGPL. A licença comercial **não pode** apresentar esse binário
  como código fechado. Opções: revisar juridicamente, isolar o WhatsApp em componente separado/opcional,
  remover a dependência ou aceitar a distribuição sob GPL para o conjunto que a inclui.
- **`sharp` / `libvips` — Apache-2.0 / LGPL-3.0-or-later.** O libvips é LGPL; é preciso permitir
  relink/uso da biblioteca, incluir avisos e fonte. Verificar como o `pkg` empacota o binário nativo.
- **Parakeet pt-BR — CC-BY-4.0.** O modelo baixado de `calneymgp/...` exige **atribuição** ao autor/modelo
  e link; uso comercial é permitido com atribuição, mas ela precisa aparecer no app/site.
- **Whisper ggml — MIT.** Modelos de `ggerganov/whisper.cpp`; incluir copyright.
- **MediaPipe** (Apache-2.0), **RNNoise** (BSD-3), **Inter** (OFL) e **Node** (MIT) já mapeados.

**Consequência para o plano:** antes de vender a licença comercial do binário completo, é obrigatório
resolver libsignal e libvips. A licença comercial pode cobrir o código original, mas não pode prometer
“binário fechado sem obrigações” enquanto esses componentes estiverem embutidos.

### 5.3 Outros terceiros

- [x] cloudflared (Apache-2.0) — texto em `licenses/Apache-2.0.txt` e componente.
- [x] MediaMTX (MIT) — `licenses/components/MediaMTX-MIT.txt`.
- [x] yt-dlp (Unlicense) — `licenses/Unlicense.txt`.
- [x] Node.js (MIT) — `licenses/Node-MIT.txt`.
- [x] Dependências npm — inventário e textos em `THIRD-PARTY-INVENTORY.csv` e `licenses/npm-dependencies.txt`.
- [x] Rust crates — `licenses/rust-dependencies.txt`.
- [x] MediaPipe, RNNoise — componentes em `licenses/components/`.
- [x] Whisper e Parakeet — componentes; Parakeet com atribuição CC-BY-4.0.
- [x] Fonte Inter — `licenses/OFL-1.1.txt`.
- [x] Web vendor — `licenses/components/web-vendor.txt` (completar com textos completos).
- [ ] Avisos completos de Android (NanoHTTPD/JSch; JUnit/JSON são só teste) — `licenses/components/Android-deps.txt`.
- [ ] Gerar `THIRD-PARTY-NOTICES.txt` e `licenses/` automaticamente no release; falhar se faltar licença.
- [ ] Revisar `libsignal` e `libvips` com advogado antes de publicar o binário/contrato comercial.

### 5.4 Marca

- [ ] Manter o aviso de marca **fora** da licença de código (como já está no NOTICE).
- [ ] Criar `TRADEMARK.md` com regras de uso, forks, indicação de origem e contato.
- [ ] Considerar registro da marca no INPI (se ainda não houver) e do domínio.
- [ ] Logo/splash/ícones: declarar direitos e não licenciar implicitamente pela AGPL.
- [ ] O contrato comercial deve incluir/limitar uso de marca separadamente.

### 5.5 Contribuições e titularidade

- [ ] Auditar a proveniência do código existente (todo o código foi escrito por você? há trechos copiados?).
- [ ] Manter o CLA atual, que preserva seu copyright e permite relicenciar; revisar juridicamente a cláusula 3.
- [ ] Se não quiser licença comercial, trocar CLA por DCO (mais simples), mas aí perde o relicenciamento.
- [ ] Definir processo de contribuição: issue, PR, teste, aceite do CLA, headers SPDX.
- [ ] Nunca aceitar contribuição sem CLA se o objetivo é vender licença comercial.
- [ ] Registrar autores/anos nos arquivos; não apagar avisos de copyright.

### 5.6 Site e comunicação

- [ ] Trocar “em breve” por fonte real.
- [ ] Criar página “Licenças e conformidade” com AGPL, comercial, terceiros, marca, fonte e privacidade.
- [ ] Ajustar FAQ: “a licença comercial cobre o código original do CastDeck; componentes de terceiros mantêm
      suas licenças”.
- [ ] Explicar que “grátis” é para uso sob AGPL; a comercial é para quem não pode cumprir AGPL.
- [ ] Política de privacidade: analytics do site (gtag), dados locais, updates consultando o site.
- [ ] Canal de segurança/contato para vulnerabilidades.

---

## 6. Alternativas de licenciamento (matriz EGM)

Pesos: direitos 25, conformidade 25, comunidade 15, negócio 15, esforço 10, risco 10.

| Opção | Direitos | Conform. | Comunidade | Negócio | Esforço | Risco | Nota |
|---|---:|---:|---:|---:|---:|---:|---:|
| **A. AGPL-3.0-only + comercial + CLA (atual, executado)** | 5 | 5 | 5 | 5 | 3 | 3 | **4,60** |
| B. AGPL-3.0-only, sem comercial, DCO | 3 | 5 | 5 | 2 | 5 | 2 | 3,75 |
| C. MIT/Apache-2.0 | 2 | 5 | 4 | 2 | 5 | 2 | 3,35 |
| D. Source-available (BUSL/Elastic) | 5 | 4 | 2 | 4 | 3 | 5 | 3,95 |
| E. Open core (núcleo AGPL + plugins fechados) | 4 | 3 | 3 | 4 | 2 | 4 | 3,40 |
| F. Adiar a abertura (“em breve” por tempo indeterminado) | 2 | 1 | 1 | 2 | 5 | 5 | **2,20** |

**Veredito:** **A** é a melhor escolha para os seus objetivos (manter direitos, permitir uso gratuito,
vender licença comercial e respeitar terceiros). **F não é opção**: é a situação atual e está em conflito com
a AGPL.

### 6.1 Por que A e não B

- B é mais simples e mais “puro” para a comunidade, mas **fecha a porta da licença comercial** (qualquer
  contribuição sem CLA impede relicenciamento).
- A mantém a possibilidade de licença comercial e ainda entrega AGPL real; o custo é o processo de CLA.
- Se a licença comercial nunca for usada, migrar de A para B é possível (abrindo mão do relicenciamento);
  o contrário é muito mais difícil.

### 6.2 Por que não D/E

- D (source-available) deixa de ser “código aberto” e contradiz o site; gera desconfiança.
- E (open core) exige separar rigorosamente o que é AGPL e o que é plugin; risco de linkagem e de confusão;
  só vale se houver um produto corporativo claro.

---

## 7. Estrutura jurídica recomendada

### 7.1 Camadas

1. **Código original:** AGPL-3.0-only + licença comercial opcional (dual licensing).
2. **Terceiros:** cada componente sob sua licença; avisos e fontes obrigatórias; nunca cobertos pela comercial.
3. **Marca:** “CastDeck”, “CastDeck Local”, “flue.live”, logo e identidade — direitos reservados, política
   separada.
4. **Conteúdo do usuário:** estúdios, gravações, templates e dados pertencem ao usuário; o app não reivindica
   propriedade.
5. **Site/documentação:** AGPL para o código; textos/imagens com direitos do autor; analytics com aviso.

### 7.2 Licença comercial (o que o contrato precisa dizer)

- Concede direitos **somente sobre o código original** do CastDeck.
- **Exclui** expressamente FFmpeg, cloudflared, MediaMTX, yt-dlp, Node, modelos, fontes e demais terceiros.
- Não concede marca; white-label exige autorização separada.
- Não remove direitos da AGPL de quem já recebeu sob AGPL.
- Define escopo (instância, empresa, receita), prazo, suporte, atualizações, garantias e limitação.
- Não promete “sem obrigações de terceiros”: o cliente ainda precisa cumprir GPL/Apache/etc. dos binários.
- Se houver SaaS, deixar claro o que é serviço seu e o que é componente de terceiro.

### 7.3 CLA (manter ou revisar)

O CLA atual:
- mantém seu copyright na contribuição;
- licencia a contribuição sob AGPL-3.0-only;
- concede a você licença **perpétua, irrevogável, mundial, não exclusiva, gratuita e sublicenciável** para
  relicenciar, inclusive comercialmente.

Isso é adequado para licença dupla; a cláusula 3 é ampla e deve ser revisada por advogado. Alternativas:
- **CLA de licença** (atual) — necessária para dual licensing.
- **Copyright assignment** — mais forte, mas afasta contribuidores; não é necessária.
- **DCO** — simples, mas inviabiliza relicenciamento; só se desistir da comercial.

---

## 8. Plano de publicação do código (sem alterar a versão atual)

### Fase 0 — Antes do próximo binário
- [ ] Rodar `pack-source.mjs --public` para a versão atual e publicar o zip.
- [ ] Criar página de fonte com versão/SHA/build.
- [ ] Atualizar site: link real, remover “em breve”, adicionar avisos de terceiros.
- [ ] Adicionar links de fonte no app (Sobre), launcher, página do convidado e controle remoto.
- [ ] Congelar a distribuição de novos binários até a fonte estar no ar (ou publicar junto).

### Fase 1 — Repositório público
- [ ] Inicializar/organizar repositório (GitHub/GitLab) com README, LICENSE, NOTICE, COMMERCIAL, CONTRIBUTING.
- [ ] Tag `v<versão>` correspondente ao binário publicado.
- [ ] Release com source zip + SHA + notas.
- [ ] `SECURITY.md`, issue/PR templates, código de conduta.
- [ ] Verificar que não há segredos/keys/dados no histórico e no zip.

### Fase 2 — Conformidade de terceiros
- [ ] Avisos automáticos (`THIRD-PARTY-NOTICES.txt`, `licenses/`).
- [ ] FFmpeg: fonte/oferta e versão fixada.
- [ ] Modelos/fontes/vendor com licenças.
- [ ] SBOM (CycloneDX) por release.

### Fase 3 — Comercial e marca
- [ ] Página de licença comercial com escopo e exclusões.
- [ ] Contrato-modelo e processo de compra.
- [ ] `TRADEMARK.md`; registro de marca se aplicável.
- [ ] Política de privacidade e cookies/analytics.

### Fase 4 — Sustentação
- [ ] Checklist no release: fonte, avisos, SHA, versão, links.
- [ ] CI que falha se faltar licença ou fonte.
- [ ] Revisão jurídica periódica.

---

## 9. Riscos ao publicar o código

| Risco | Mitigação |
|---|---|
| Vazar chaves/API tokens/certificados | Scan de segredos; excluir `data/`, `.env`, keystores; revisar histórico |
| Vazar dados de usuários/estúdios | Nunca incluir `data/`; usar dados de exemplo fictícios |
| Vazar endpoints privados/TURN keys | Variáveis de ambiente; documentar configuração |
| Copiar código de terceiros sem licença | Auditoria de proveniência; SPDX; notices |
| Expor vulnerabilidades | SECURITY.md; divulgação responsável; não publicar exploits |
| Perder chance de licença comercial por contribuições sem CLA | CLA obrigatório; revisar PRs |
| Contradizer o site (“aberto” mas sem fonte) | Publicar antes de divulgar; corrigir textos |
| FFmpeg GPL mal comunicado | Página específica de terceiros; fonte/oferta |
| Modelos não redistribuíveis | Baixar em runtime com aceite; não embutir |
| Pirataria/forks com marca | Política de marca; não confundir com licença |

---

## 10. Critérios de aceite da estratégia

- [ ] Todo binário publicado tem fonte correspondente pública (ou oferta válida) **no mesmo release**.
- [ ] Página de fonte lista versão, SHA, build e licença; link no app e no site.
- [ ] Licença comercial cobre só código original e exclui terceiros.
- [ ] FFmpeg tem licença + fonte/oferta; demais terceiros têm avisos.
- [ ] CLA obrigatório para contribuições; copyright do autor preservado.
- [ ] Marca separada da licença e com política pública.
- [ ] Nenhum segredo/dado de usuário no zip/repositório.
- [ ] Site não diz “em breve” para fonte.
- [ ] Usuários de rede (convidados) têm acesso à oferta de fonte.
- [ ] Revisão jurídica concluída antes da primeira venda comercial.

---

## 11. Decisões para você

1. **Licença comercial:** mantém a oferta? (recomendado: sim, com CLA)
2. **CLA:** mantém o atual ou quer revisar a cláusula 3 com advogado?
3. **FFmpeg:** continuar GPL (com fonte/oferta) ou migrar para LGPL?
4. **Modelos de IA:** podem ser redistribuídos? Se não, baixar em runtime com aviso?
5. **Publicação:** repositório público + zip por release, ou apenas zip no site?
6. **Marca:** vai registrar “CastDeck” no INPI? Precisa de política de uso?
7. **Data de abertura:** qual versão será a primeira com fonte pública? (a atual já está distribuída)
8. **Jurídico:** quem revisa CLA/contrato/AGPL antes da publicação?

---

## 12. Veredito EGM

**Melhor caminho:** manter **AGPL-3.0-only + licença comercial**, com **CLA**, **marca separada** e
**publicação imediata da fonte**. É o único caminho que:

- preserva seus direitos autorais e a possibilidade de licenciar comercialmente;
- cumpre a AGPL que o site já anuncia;
- respeita FFmpeg/GPL e os demais terceiros;
- mantém a confiança da comunidade e a coerência do discurso “código aberto”.

**O que não fazer:** continuar distribuindo binários com “código-fonte em breve”; vender licença comercial
como se cobrisse FFmpeg/terceiros; ou trocar para uma licença “source-available” mantendo o texto de “código
aberto”.
