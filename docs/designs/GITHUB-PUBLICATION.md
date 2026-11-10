# EGM — Preparação do repositório público no GitHub

> **Status:** plano de preparação. **Nenhum código foi alterado.** A versão do produto continua a mesma.
> **Data:** 2026-11-03
> **Objetivo:** abrir o código no GitHub **sem vazar** dados da VPS, da landing page, chaves, dados de
> usuários ou material interno — mantendo o licenciamento AGPL + comercial e a builds reproduzíveis.

---

> **Skill operacional obrigatória:** `.agents/skills/castdeck-github-public/SKILL.md` — procedimento repetível para espelhar toda release no GitHub público limpo.

## 1. Resumo executivo

O repositório **não pode ser um `git init && git add .`**. Hoje a árvore de trabalho contém, no mesmo
diretório:

- scripts de **deploy por SSH** e configuração da VPS (IP, usuário root, caminho da chave, setup de nginx,
  coturn e fail2ban);
- a **landing page completa**, ferramentas de publicação, analytics, contatos e materiais de marketing;
- **zips de código-fonte privados** gerados por `pack-source.mjs` que incluem `deploy/` e `landpage/`;
- dados locais, gravações, chaves, builds e caches.

**Caminho recomendado:** criar um **export limpo por allowlist** (somente o que é necessário para compilar o
app), sanitizar, gerar os avisos de licença, publicar primeiro em repositório **privado** para revisão e só
depois tornar público. A landing page e a VPS ficam em um repositório/deploy separado e **nunca** entram no
repositório público.

A auditoria de terceiros já foi feita: **187 dependências npm de produção** (mais dev/build), **312 crates
Rust**, binários (FFmpeg, cloudflared, MediaMTX, yt-dlp, Node), modelos (Whisper MIT, Parakeet CC-BY-4.0),
MediaPipe/RNNoise e fonte Inter. Os textos estão em `licenses/`, o inventário em
`THIRD-PARTY-INVENTORY.csv`. Dois achados mudam o escopo comercial: **libsignal GPLv3** e **libvips LGPLv3**;
eles precisam ser resolvidos antes de prometer um binário fechado sob licença comercial.

---

## 2. Concept brief (6 lentes EGM)

| Lente | Pergunta | Direção |
|---|---|---|
| **Segurança** | O que não pode vazar? | IP/usuário/chave da VPS, TURN secret, analytics/contatos da landpage, dados de usuários, tokens, keystores, `.env`. |
| **Licença** | O que precisa ir junto? | AGPL completa, NOTICE, CLA, avisos de terceiros, fonte correspondente, FFmpeg GPL, oferta de fonte. |
| **Reprodutibilidade** | O público consegue compilar? | Incluir scripts de build, package-lock, Cargo.lock, instruções, sem caminhos internos. |
| **Comunidade** | O repositório é confiável? | README claro, issues/PR templates, SECURITY, histórico limpo, licença detectável, sem “código aberto” sem fonte. |
| **Operação** | Como manter? | Release/tag/source zip mapeados, CI sem segredos de deploy, checklist e automação de licenças. |
| **Marca** | O que continua reservado? | Nome/logo/splash; `TRADEMARK.md`; forks rebrandam. |

---

## 3. Inventário do que NÃO pode ir para o GitHub

> Nenhum valor sensível é reproduzido aqui; apenas caminhos e categorias.

| Caminho/categoria | O que contém | Ação |
|---|---|---|
| `deploy/deploy.json` | Host/IP, usuário root, caminho da chave SSH, webroot | **Excluir**; manter só local |
| `deploy/vps-setup.sh` | IP, nginx, coturn/TURN secret, fail2ban, TLS | **Excluir** |
| `build/deploy.mjs` | Lógica de SSH/SFTP, delta de deploy, setup da VPS | **Excluir** do repo público |
| `build/release.mjs` | Orquestra builds + publicação na VPS/landpage | **Excluir** ou substituir por release público sanitizado |
| `landpage/` | Site de marketing, ferramentas de publicação, analytics, contatos/Pix, downloads/metadados | **Excluir inteiro**; repositório próprio, se um dia público |
| `build/pack-source.mjs` | Gera zip privado incluindo `deploy/` e `landpage/` | **Não publicar os zips atuais**; refazer com allowlist |
| `dist/source/*.zip` | Zips de fonte privados que podem conter itens acima | **Não enviar**; apagar/refazer após sanitização |
| `docs/ai/` | Estado interno, diário, VPS, release | **Excluir** |
| `data/`, `recordings/`, `backups/` | Dados de usuários, chaves, gravações, pacotes antigos | **Excluir** |
| `.env`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `.ssh/` | Segredos/certificados | **Excluir**; já no `.gitignore` |
| `android/local.properties`, builds, `.gradle`, `.idea` | Caminhos locais/artefatos | **Excluir** |
| `build/vendor/`, `build/tmp/`, `src-tauri/server.bin` | Binários baixados/temporários | **Excluir** |
| `node_modules/`, `dist/`, `*.exe`, `*.apk`, `*.AppImage`, `*.zip` | Artefatos | **Excluir** |
| `test/.shot.mjs`, `test/dbg.mjs` | Scratch/automação manual | **Excluir** |
| `README`, docs | Podem citar domínio público, não IP/SSH | **Revisar** e remover qualquer referência operacional |

**Observação crítica:** o `pack-source.mjs` atual inclui `deploy`, `landpage`, `docs`, `test` e `build` no
zip. Os zips privados existentes **não são seguros** para publicação até serem regenerados com allowlist.
O `.gitignore` foi endurecido, mas ele **não limpa arquivos já gerados** nem históricos antigos.

---

## 4. O que o repositório público deve conter

```text
castdeck/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── pull_request_template.md
│   └── workflows/            # CI de teste/build sem segredos de deploy
├── android/                  # código do app, sem build/local.properties/keystore
├── build/                    # build-exe, build-android, build-appimage, assets, version
├── docs/                     # DOCUMENTACAO.md + designs públicos (sem docs/ai)
├── public/                   # UI web, vendor e licenças
├── server/                   # servidor Node
├── src-tauri/                # launcher Rust (sem server.bin/target)
├── test/                     # testes oficiais, sem scratch
├── package.json
├── package-lock.json
├── Cargo.lock (se aplicável)
├── README.md
├── BUILDING.md
├── LICENSE                   # AGPL-3.0
├── NOTICE
├── COMMERCIAL-LICENSE.md
├── CLA.md
├── CONTRIBUTING.md
├── TRADEMARK.md
├── SECURITY.md
├── PRIVACY.md
├── SOURCE-OFFER.md
├── THIRD-PARTY-NOTICES.md    # visão humana; textos completos em licenses/
├── THIRD-PARTY-INVENTORY.csv # inventário npm/Rust/Android/binários
├── licenses/                 # textos e avisos de terceiros
│   ├── README.md
│   ├── npm-dependencies.txt
│   ├── rust-dependencies.txt
│   └── components/
└── .gitignore
```

**Fora:** `landpage/`, `deploy/`, `build/deploy.mjs`, `build/release.mjs`, `docs/ai/`, `dist/`, `data/`,
`recordings/`, `backups/`, `build/tmp/`, `build/vendor/`, `android/local.properties`, segredos.

### 4.1 Correspondência com a AGPL

O binário do CastDeck **não inclui a landing page nem os scripts de deploy**, portanto excluí-los do
repositório público não quebra a “fonte correspondente” do programa. O que precisa estar público:

- código do servidor, UI, launcher, Android;
- scripts de build e instruções para gerar os binários;
- licenças e avisos;
- scripts de empacotamento de fonte (sanitizados);
- FFmpeg: fonte/oferta separada (não é código do CastDeck).

Se a landing page for publicada um dia, ela deve ir para **outro repositório**, sem configuração de VPS.

### 4.2 O que a auditoria de terceiros encontrou

| Componente | Licença | Impacto no plano |
|---|---|---|
| `libsignal` (via Baileys) | **GPL-3.0** | Bloqueia promessa de “binário fechado”; exige fonte/análise GPL/AGPL, isolamento ou remoção |
| `sharp` / `libvips` | Apache-2.0 / **LGPL-3.0** | Exige relink/avisos; revisar empacotamento do binário nativo |
| `FFmpeg` | **GPLv3** | Fonte/oferta própria; não entra na licença comercial |
| `Parakeet pt-BR` | **CC-BY-4.0** | Atribuição visível no app/site |
| `Whisper ggml` | MIT | Copyright/licença; baixado em runtime |
| `MediaPipe` / `RNNoise` | Apache-2.0 / BSD-3 | Avisos e textos |
| npm/Rust/Android | MIT/Apache/BSD/ISC/MPL | Textos gerados em `licenses/` |

Os textos foram gerados em `licenses/` e o inventário em `THIRD-PARTY-INVENTORY.csv`. Antes de publicar,
revisar `libsignal`, `libvips` e FFmpeg com apoio jurídico; **não** afirmar que a licença comercial cobre
o binário inteiro.

---

## 5. Sanitização antes do primeiro commit

### 5.1 Export por allowlist (não `git add .`)

1. Criar uma pasta limpa `castdeck-public/`.
2. Copiar **somente** os diretórios/arquivos da §4.
3. Nunca copiar `.git`, `deploy/`, `landpage/`, `docs/ai/`, `data/`, `dist/`, caches.
4. Remover `node_modules`/`build/vendor` (o README explica como baixar).
5. Revisar `package-lock.json` (registry público, sem tokens/URLs privadas).
6. Revisar `android/build.gradle`/manifest por caminhos/chaves locais.
7. Revisar imagens/metadados (EXIF) e remover fotos pessoais não usadas.

### 5.2 Varredura de segredos

- [ ] `gitleaks detect`/`trufflehog filesystem` na pasta limpa.
- [ ] grep por IPv4, `ssh`, `root@`, `deploy`, `vps`, `token`, `secret`, `password`, `private key`.
- [ ] Procurar chaves de TURN/Cloudflare, `.env`, keystores, arquivos `.pem`.
- [ ] Procurar a palavra `landpage` em README/docs; remover caminhos internos.
- [ ] Procurar caminhos absolutos do seu PC (`D:\REA`, usuário Windows) e substituir por relativos.
- [ ] Verificar binários/zip: nenhum `dist/source` antigo, nenhum `build/vendor`.
- [ ] Verificar se `README` não expõe IP, SSH, webroot ou passos de deploy.

### 5.3 Histórico

- [ ] Preferir **primeiro commit limpo** (sem histórico antigo) para não vazar nada que já existiu.
- [ ] Se usar histórico existente, rodar filtro de segredos e revisar cada commit; nunca confiar só no
      `.gitignore`.
- [ ] Ativar **secret scanning** e **push protection** no GitHub antes do push.
- [ ] Fazer o primeiro push para repositório **privado**; revisar arquivos; só então tornar público.
- [ ] Se algum segredo já saiu em zip compartilhado, **rotacionar** (chave SSH, TURN secret, tokens).

### 5.4 Zip de fonte

- [ ] Atualizar/duplicar `pack-source` para uma versão pública com allowlist (sem landpage/deploy/docs ai).
- [ ] Gerar o zip a partir da pasta limpa, não da árvore de trabalho.
- [ ] Listar conteúdo (`tar -tf`) e confirmar ausência de itens sensíveis.
- [ ] Publicar zip + SHA no release/tag correspondente.
- [ ] Nunca publicar os zips privados atuais de `dist/source/`.

---

## 6. Licenças e arquivos legais

Já preparados nesta rodada:

| Arquivo | Papel |
|---|---|
| `LICENSE` | AGPL-3.0 completo |
| `NOTICE` | copyright, AGPL, licença dupla, marcas, contribuições e terceiros |
| `COMMERCIAL-LICENSE.md` | escopo comercial, exclusões de terceiros/marca, direitos da AGPL |
| `CLA.md` | acordo de contribuição que preserva seu copyright e permite relicenciar |
| `CONTRIBUTING.md` | processo, CLA, regras de segurança e terceiros |
| `TRADEMARK.md` | marcas, forks e usos permitidos |
| `SECURITY.md` | relato privado de vulnerabilidades |
| `SOURCE-OFFER.md` | oferta de fonte AGPL e componentes |
| `PRIVACY.md` | privacidade do app e do site |
| `THIRD-PARTY-NOTICES.md` | visão humana completa dos componentes e obrigações |
| `licenses/` | textos das licenças npm/Rust/binários/modelos/fontes |
| `THIRD-PARTY-INVENTORY.csv` | 665 entradas (npm, Rust/workers, Android, binários, modelos e fonte) para auditoria |
| `BUILDING.md` | build público sem VPS/landpage |

### 6.1 Pendências legais antes do push público

- [ ] Revisão jurídica do CLA, contrato comercial, FFmpeg, **libsignal (GPLv3)** e **libvips (LGPLv3)**.
- [ ] Confirmar licença/build exata do FFmpeg; incluir fonte/oferta.
- [ ] Resolver libsignal: isolar, remover ou aceitar obrigações GPL no binário.
- [ ] Resolver libvips: relink/avisos e empacotamento.
- [ ] Completar avisos de cloudflared, Node, yt-dlp, MediaMTX, modelos, fontes e vendor.
- [ ] Definir e-mail de segurança (substituir o contato provisório).
- [ ] Preencher `SOURCE-OFFER.md` sem marcadores `<versão>`/`<sha256>`.
- [ ] Gerar `THIRD-PARTY-NOTICES.md`/`licenses/` automaticamente e falhar o release se faltar licença.
- [ ] Atribuir Parakeet (CC-BY-4.0) no app/site.

---

## 7. GitHub: configuração do repositório

### 7.1 Antes de tornar público

- [ ] Criar repositório **privado** `castdeck` (nome provisório).
- [ ] Confirmar que a licença detectada é **AGPL-3.0**.
- [ ] Ativar **Secret scanning**, **Push protection**, **Dependabot alerts** e **Code scanning**.
- [ ] Configurar branch protection em `main`: PR obrigatório, revisão, status checks.
- [ ] Criar templates de issue/PR (sem pedir dados sensíveis).
- [ ] `SECURITY.md` com canal privado e [`SECURITY-EGM.md`](SECURITY-EGM.md) concluído.
- [ ] Resolver P0 de segurança: keystore Android de release, assinatura de update/instalador e revisão de auth HTTP/WS.
- [ ] Revisar se o README não aponta para a VPS/landpage.
- [ ] Rodar CI em modo somente leitura (sem secrets de deploy).
- [ ] Fazer uma revisão manual da árvore e do zip de fonte.

### 7.2 Depois de público

- [ ] Ativar Discussions (opcional), Sponsors (opcional).
- [ ] Publicar release com tag e source zip.
- [ ] Divulgar o repositório no site e no app, substituindo “em breve”.
- [ ] Monitorar issues/PRs; exigir CLA.
- [ ] Rodar auditoria de dependências e avisos a cada release.

### 7.3 CI/CD

- [ ] Workflow de testes (`node --check`, `test:unit`/testes aplicáveis).
- [ ] Workflow de build Windows/Linux/macOS/Android **sem** deploy.
- [ ] Build de instalador/assinatura só com secrets em ambiente protegido.
- [ ] Nenhum secret de VPS no GitHub Actions.
- [ ] Artefatos de release anexados via GitHub Releases (opcional), com SHA.
- [ ] Publicação no site continua no fluxo privado/local.

---

## 8. O que fazer com a landing page e a VPS

### 8.1 Landing page

- **Não** entra no repositório público.
- Se quiser abrir o site um dia: repositório separado, sanitizado, sem analytics/contatos pessoais,
  sem `deploy/`, sem tokens, sem metadados de release privados.
- O código do app não depende da landing page para compilar.

### 8.2 VPS

- `deploy/`, `build/deploy.mjs` e `build/release.mjs` ficam **locais/privados**.
- Remover IP/usuário/chave de qualquer doc público.
- Se o repositório precisar de um script de release público, criar uma versão **sem VPS**, que apenas
  gera artefatos e zips; deploy continua privado.
- Rotacionar chave SSH/TURN secret se houver suspeita de exposição em zips antigos.

---

## 9. README público (esqueleto)

1. Nome, descrição curta, screenshot.
2. O que é / recursos principais.
3. Download do binário e do instalador (site).
4. **Código-fonte** (AGPL) e link para `SOURCE-OFFER.md`.
5. Build: requisitos (Node, Rust, FFmpeg via script), `npm ci`, `npm run vendor:web`,
   `npm run build:exe`; Android/AppImage.
6. Estrutura do projeto.
7. Licença: AGPL-3.0 + comercial; link NOTICE/COMMERCIAL/CLA/TRADEMARK.
8. Contribuição: CLA + CONTRIBUTING.
9. Segurança: SECURITY.
10. Agradecimentos a terceiros, com link para notices.

Sem IP, sem SSH, sem analytics, sem Pix/contatos pessoais, sem passos de deploy da VPS.

---

## 10. Checklist de aceite

- [ ] Pasta pública contém apenas allowlist; nenhum `deploy`/`landpage`/`docs/ai`/dados.
- [ ] Nenhum IP, usuário root, chave SSH, TURN secret, token ou keystore.
- [ ] Zip de fonte público gerado da pasta limpa; SHA publicado; sem zips antigos.
- [ ] AGPL/NOTICE/CLA/COMMERCIAL/TRADEMARK/SECURITY/SOURCE-OFFER presentes e sem marcadores.
- [ ] FFmpeg com licença + fonte/oferta; demais terceiros com avisos.
- [ ] Repositório privado revisado, secret scanning ativo, depois público.
- [ ] CI sem secrets de VPS; branch protection e Dependabot.
- [ ] Site/app apontam para a fonte real (fim do “em breve”).
- [ ] Licença detectada como AGPL-3.0; README explica dual licensing sem prometer o que não cobre.
- [ ] Revisão jurídica concluída antes da primeira venda comercial.

---

## 11. Riscos

| Risco | Mitigação |
|---|---|
| Vazar IP/SSH em zip ou doc | Allowlist, grep, gitleaks, revisão do zip, rotação se necessário |
| Vazar landpage/analytics/contatos | Excluir `landpage/`; repositório separado |
| Publicar zip privado antigo | Não publicar `dist/source`; regenerar da pasta limpa |
| Fonte incompleta (AGPL) | Incluir build scripts, package-lock, instruções; testar build do zip |
| FFmpeg GPL sem fonte | Fonte/oferta separada e build fixada |
| Contribuição sem CLA inviabilizar comercial | Exigir CLA no PR; revisar |
| Histórico antigo contaminado | Primeiro commit limpo; secret scanning |
| Site prometer “aberto” sem fonte | Publicar fonte antes do próximo binário |

---

## 12. Decisões pendentes

1. Repositório será **novo/histórico limpo** ou importará histórico existente?
2. Nome/organização do GitHub e se será `castdeck` público + `castdeck-site` privado.
3. Landing page fica **totalmente fora** do GitHub (recomendado) ou em repo separado?
4. Data da primeira publicação e se o zip da 1.3.26 será o primeiro.
5. Quem revisa CLA/AGPL/FFmpeg juridicamente.
6. E-mail/canal de segurança definitivo.
7. Se `build/release.mjs` será substituído por um script público sem VPS.
8. Se as imagens/screenshots do README são suas e podem ser licenciadas.

---

## 13. Veredito EGM

**Sim, está pronto para abrir — desde que por allowlist, não por `git add .`.**

A ordem correta é:

1. Limpar/exportar somente o app.
2. Completar licenças e avisos (incluindo FFmpeg).
3. Gerar zip de fonte público e SHA.
4. Repositório privado + secret scanning + revisão.
5. Publicar a fonte e corrigir o site (“em breve” → link real).
6. Tornar o repositório público, com CLA e política de marca.

O maior risco não é a AGPL: é **vazar a VPS/landpage por pressa**. O segundo é **publicar sem a fonte
completa**. A preparação acima elimina os dois.

---

## 14. Execução — 2026-11-03 (repositório privado)

### 14.1 Feito

- Export limpo em `D:\CastDeck-GitHub` (allowlist; sem `deploy/`, `landpage/`, `docs/ai/`, `data/`,
  `dist/`, `build/tmp`, `build/vendor`, keystores, `node_modules`).
- Removidos do export: `docs/designs`, `pack-source.mjs`, `i18n-extract.mjs`, `make-key-guides.mjs`,
  `test/inspect-landpage.mjs` e scripts npm de landpage/deploy/release.
- `.gitignore` endurecido; templates de issue/PR; CI mínimo; Dependabot.
- `npm ci` OK (287 pacotes); `npm run test:security` OK (Origin/CSRF, body, diagnóstico sem segredos).
- **Gitleaks:** nenhum segredo encontrado (varredura de 9,7 MB).
- **Nenhum IP/chave da VPS** no export; `landpage`/`deploy` ausentes.
- Git inicializado em `main`; commit `5a1ef2a` (“Initial source snapshot: CastDeck Local 1.3.26”).
- Repositório privado: **https://github.com/aloproducao2/castdeck-local**
- Release privada `v1.3.26` com `castdeck-1.3.26-source.zip` (13.903.909 bytes; SHA-256
  `ba6912fe99d1cd4c2ade5e537eb71b66d6f0cd1342a9a40792cae8f2917bcaa9`).
- Commit seguinte `15d6965` adiciona `.github/workflows/ci.yml` e Dependabot; push em `main`.
- CI do commit `15d6965`: **sucesso** (https://github.com/aloproducao2/castdeck-local/actions/runs/41578794654).
- Dependabot ativo; PRs abertos para npm, Cargo e GitHub Actions (não mesclar sem testar).
- GitHub CLI (`gh`) e Gitleaks instalados na máquina; login `aloproducao2`.

### 14.2 Pendências antes de tornar público

- [ ] Corrigir os 2 advisories de produção do `npm audit` (body-parser high, qs moderate) e revisar CI.
- [ ] Concluir P0 de segurança: keystore Android de release, assinatura Authenticode do updater/instalador,
  auditoria de auth HTTP/WS, path traversal/SSRF, canal de segurança definitivo.
- [ ] Revisar libsignal (GPLv3), libvips (LGPLv3) e fonte do FFmpeg.
- [ ] Preencher `SOURCE-OFFER.md` com SHA do pacote no release e publicar a página `/downloads/source/`.
- [ ] Ativar secret scanning/push protection (indisponível em repo privado sem GHAS; ativar ao publicar).
- [ ] Revisar se `ssh2` (dev/deploy) deve permanecer no repositório público.
- [ ] Remover `.gitignore` de referências internas? (não contém segredos; mantém proteção).

### 14.4 Correção — documentos internos removidos (2026-11-03)

- Removidos do GitHub público/privado: `docs/artigo-imprensa.md` e `docs/PLANO-MELHORIAS.md`.
- Repositório antigo **apagado por completo** e recriado com um único commit limpo:
  `5b208a8` — `Initial source snapshot: CastDeck Local 1.3.26 (clean)`.
- Novo ZIP de fonte (sem os docs): 14.655.627 bytes; SHA-256
  `59d8b6a61c14e62c583c7ff43dfcdb5f0c6cf81ccd0633d5e4507748427b6fce`.
- Branches/tags/releases/PRs do repo antigo não existem mais; CI do repo novo passou.
- `build/pack-source.mjs` e `.gitignore` agora excluem esses dois documentos também em futuras releases.
- Lição: docs internos não entram no export; o ZIP de fonte é gerado por `git archive` do commit limpo, não da árvore de trabalho.

### 14.3 Observações de validação

- `npm run test:unit` **não terminou** no ambiente local: o teste de replay entrou em loop
  (“Stream de sinal não disponível: pgm”). O teste de segurança passou. Não considerar a suíte completa
  verde até corrigir esse loop/isolamento.
- O repositório está **privado**; não há secret scanning automático disponível nessa modalidade sem GHAS.
  O Gitleaks local foi a varredura usada antes do push.
- O ZIP de fonte foi gerado por `git archive` do commit `5a1ef2a`; o commit `15d6965` (CI/Dependabot) é
  posterior e pode ser incluído em um novo ZIP/release se necessário.
