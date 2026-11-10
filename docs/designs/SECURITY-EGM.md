# EGM — Segurança do CastDeck

> **Status:** plano/estratégia. **Nenhum código foi alterado e nenhuma versão foi mudada.**
> **Data:** 2026-11-03
> **Objetivo:** fechar a política de segurança, o modelo de ameaças e o plano de endurecimento antes de
> abrir o código e publicar instalador/atualizações.
> **Relação:** complementa [`SECURITY.md`](../SECURITY.md), [`GITHUB-PUBLICATION.md`](GITHUB-PUBLICATION.md)
> e [`LICENSING-STRATEGY.md`](LICENSING-STRATEGY.md).

> **Aviso:** engenharia de segurança, não auditoria independente nem parecer jurídico. Itens P0 devem ser
> testados em ambiente controlado e, quando possível, revisados por terceiro.

---

## 1. Resumo executivo

O CastDeck tem uma superfície de ataque **maior do que um app desktop comum**: ele sobe um servidor HTTP e
WebSocket em `0.0.0.0`, oferece HTTPS autoassinado para convidados na LAN, cria links de convidado e de
controle remoto, aceita mídia/URLs, executa FFmpeg/MediaMTX e se atualiza substituindo o próprio executável.

Os maiores riscos atuais, em ordem:

1. **Segredos de VPS/landpage na árvore de trabalho** (`deploy/`, `landpage/`, zips de fonte privados) —
   já mapeados no plano do GitHub; precisam ser excluídos/rotacionados.
2. **Atualização sem assinatura Authenticode** — SHA-256 protege contra corrupção, não contra um site
   comprometido; falta assinatura do binário/manifesto.
3. **APK Android assinado com chave de debug** (`signingConfig signingConfigs.debug`) — inaceitável para
   distribuição pública; precisa de keystore de release fora do repositório.
4. **Servidor HTTP/WS exposto na LAN e túnel** — depende de chaves/origem/rate limit; precisa de auditoria
   de autenticação, autorização por sala, CSRF/WS origin, limites e TLS.
5. **Cadeia de suprimentos** — `libsignal` GPL, `sharp/libvips` LGPL, dependências npm/Rust sem pinagem
   forte/SBOM/auditoria; publicação do fonte exige secret scanning.
6. **Privacidade/segredos locais** — chaves de transmissão e dados de estúdio; verificar criptografia em
   repouso e mascaramento em logs.

**Veredito EGM:** não abrir o GitHub público nem publicar instalador antes de concluir os P0 (§8):
secret scanning/limpeza, keystore Android de release, assinatura de update/instalador, revisão de
autenticação do servidor e política de reporte. O restante pode entrar em P1/P2.

---

## 2. Ativos e fronteiras de confiança

| Ativo | Onde vive | Fronteira | Impacto se comprometido |
|---|---|---|---|
| Vídeo/áudio do estúdio | RAM, WebRTC, canvas | Navegador ↔ servidor ↔ convidados | Exposição de conteúdo privado |
| Chaves de transmissão (RTMP/SRT) | `data/` store | App ↔ destinos | Transmitir em nome do usuário |
| Links de convidado/controle/saída | URLs com chaves | Internet/LAN ↔ servidor | Entrada indevida, sequestro de cena |
| Dados de estúdio/gravações | `%LOCALAPPDATA%\CastDeck`, `Videos` | SO ↔ app | Perda/exposição de conteúdo |
| Servidor local HTTP/WS | `0.0.0.0:3000`, HTTPS 3443 | LAN/túnel ↔ app | CSRF, SSRF, DoS, RCE via mídia |
| Túnel público | Cloudflare/localhost.run | Internet ↔ app | Exposição de endpoints |
| TURN | `turn.flue.live` | Internet ↔ VPS | Relay aberto/abuso |
| Atualizador | `cast.flue.live` | Internet ↔ cliente | Instalação de binário malicioso |
| Instalador/launcher | Windows | Usuário ↔ SO | Persistência, elevação, sequestro |
| APK Android | dispositivo | App ↔ WebView/arquivos | Exfiltração, permissões |
| Repositório GitHub | público/privado | Colaboradores ↔ código | Vazamento de VPS/landpage/segredos |
| VPS e landing page | infra do autor | Provedor ↔ site | Queda, desfiguração, vazamento |

### 2.1 Fronteiras principais

1. **Navegador do host** (confiável) ↔ servidor local (confiável, mas exposto).
2. **Servidor local** ↔ **LAN** (convidados não confiáveis).
3. **Servidor local** ↔ **internet** via túnel (não confiável).
4. **App** ↔ **destinos de stream** (terceiros).
5. **Cliente** ↔ **servidor de atualização** (internet).
6. **Repositório público** ↔ **infra privada** (VPS/landpage) — deve ser um muro, não uma porta.

---

## 3. EGM — seis lentes de segurança

| Lente | Pergunta | Achados | Direção |
|---|---|---|---|
| **Ativos e fronteiras** | O que protegemos e onde? | Servidor bind `0.0.0.0`; túnel; chaves em URLs; dados locais; VPS/landpage | Inventário, classificação, segregação de repositórios |
| **Ameaças e abuso** | Quem ataca e como? | Convidado malicioso, vizinho de LAN, site comprometido, dependência maliciosa, insider, phishing | STRIDE + abuso de recursos (relay/stream) |
| **Prevenção** | Como impedir? | Origin guard/CSRF, rate limit, body limit, chaves; faltam assinatura, keystore, hardening | Controles por superfície (§5) |
| **Detecção** | Como saber? | Logs locais, erros; sem telemetria/alertas | Logs de segurança, sinais de abuso, auditoria de update |
| **Resposta** | O que fazer? | Sem runbook público, contato provisório | Política, prazos, canal privado, advisories |
| **Recuperação** | Como voltar? | Backup de dados/rollback de update não formalizado | Backup, rollback, chaves rotacionáveis, restore testado |

### 3.1 Princípios

- **Menor privilégio:** nada de root/admin para uso normal; servidor local não deve permitir ações
  administrativas sem chave/origem.
- **Defesa em profundidade:** origem + chave + rate limit + limite de corpo + validação, não um só.
- **Falha segura:** se autenticação/TLS/update falhar, negar e avisar — não “seguir mesmo assim”.
- **Não confiar no cliente:** validação no servidor para todo input de convidado/controle.
- **Segredos fora do código:** `.env`/keystore/chaves nunca no Git; VPS e landpage em repositório separado.
- **Atualização verificável:** hash + assinatura + HTTPS + rollback.
- **Privacidade por padrão:** dados locais, sem telemetria, logs mascarados.

---

## 4. Modelo de ameaças (STRIDE)

| Superfície | Spoofing | Tampering | Repudiation | Info disclosure | DoS | Elevation |
|---|---|---|---|---|---|---|
| **Servidor HTTP/WS** | Link/chave roubada; origem falsa | Alterar payload/estado | Falta de log de ações | Vazar dados/chaves | Requisições grandes/muitas; `requestTimeout=0` | API admin sem autorização |
| **Convidado/LAN** | Entrar em sala alheia | Injetar comandos de cena | Negar ações | Ver cena/áudio de outra sala | Flood de conexões | Ser host/controle |
| **Túnel** | URL pública enumerada | MITM se TLS fraco | — | Expor endpoints internos | DDoS no túnel | Acesso remoto indevido |
| **Mídia/FFmpeg** | URL de mídia falsa | Arquivo/protocolo malicioso | — | SSRF para rede interna | Consumo de CPU/RAM | Execução via argumento/arquivo |
| **Updater** | Servidor comprometido | Trocar exe/manifesto | Logs ausentes | — | Impedir update | Instalar binário malicioso |
| **Instalador** | Pacote falso | Alterar setup | — | — | — | Elevação/auto-start |
| **Android** | APK falso | WebView bridge | — | Dados locais | — | Permissões indevidas |
| **GitHub** | Conta comprometida | Commit malicioso | Histórico | VPS/landpage/segredos | Ataque a CI | Publicar release falsa |
| **VPS/landpage** | SSH/phishing | Alterar site/deploy | — | Chaves/TURN | Derrubar site | Root na VPS |

### 4.1 Cenários prioritários

| # | Cenário | Prob. | Impacto | Mitigação |
|---|---|---|---|---|
| 1 | Segredo de VPS/landpage vai para o GitHub | Média | Crítico | Allowlist, secret scanning, histórico limpo, rotação |
| 2 | Update malicioso por site/DNS comprometido | Média | Crítico | Assinatura Authenticode + hash + TLS + rollback |
| 3 | APK com chave debug distribuído | Alta | Alto | Keystore de release + Play App Signing/assinatura |
| 4 | Convidado acessa sala/controle sem chave | Média | Alto | Chaves fortes, autorização por sala, testes |
| 5 | SSRF via URL de mídia/overlay para rede interna | Média | Alto | Allowlist de esquemas/hosts, bloquear IP privado, timeout |
| 6 | Path traversal em upload/gravação | Média | Alto | Normalização, raiz fixa, sem `..`, validação |
| 7 | CSRF em API local | Média | Alto | Origin guard + token + SameSite + método |
| 8 | Dependência npm/Rust maliciosa | Média | Alto | Lockfile, auditoria, provenance, pinagem, revisão |
| 9 | Vazamento de chave de stream em log | Média | Alto | Mascarar, não logar body, redigir |
| 10 | DDoS local/túnel | Média | Médio | Rate limit, timeouts, limites, Cloudflare |
| 11 | XSS em nome/chat/overlay | Média | Alto | Escape, CSP, sanitização |
| 12 | WebView Android com bridge insegura | Baixa | Alto | `addJavascriptInterface` mínimo, origin check |

---

## 5. Controles por superfície

### 5.1 Servidor HTTP/WebSocket local

**Estado atual observado (verificar em auditoria):**

- `httpServer.listen(HTTP_PORT, '0.0.0.0')` e HTTPS em `0.0.0.0` — intencional para convidados LAN.
- `apiOriginGuard` (CSRF por Origin/Sec-Fetch-Site), rate limit por IP, body limit, `X-Frame-Options`,
  `Cross-Origin-Resource-Policy`.
- `requestTimeout = 0` para importação longa — pode facilitar conexões lentas/DoS; revisar.
- HTTPS com certificado autoassinado para convidados.

**P0/P1:**

- [ ] Auditar **todas** as rotas `/api` e WebSocket: autenticação, autorização por estúdio, papel
  (host/convidado/controle/saída), IDOR.
- [ ] WS: validar `Origin`, chave, sala, papel; rejeitar mensagens antes do handshake/entrada.
- [ ] CSRF: manter Origin guard; adicionar token para mutações sensíveis; cookies `SameSite=Strict` se
  houver cookie; nunca confiar só em `Origin`.
- [ ] Limites: body, header, upload, conexões WS por IP/sala, taxa de mensagens, timeout ocioso.
- [ ] Revisar `requestTimeout=0`: usar timeout alto com cancelamento/limite de tamanho.
- [ ] Cabeçalhos: CSP restritiva (hoje app usa inline/eval? verificar), `X-Content-Type-Options`,
  `Referrer-Policy`, HSTS no HTTPS, `Permissions-Policy`.
- [ ] Path traversal: uploads/gravações/overlays sempre dentro de raiz permitida; canonicalizar e negar
  `..`, links simbólicos e caminhos absolutos.
- [ ] SSRF: URLs de mídia/overlay/imagem — permitir só `http(s)`, bloquear IP privado/loopback/metadata
  (169.254.169.254), resolver DNS e revalidar, limitar redirecionamentos/tempo/tamanho.
- [ ] XSS: escapar nomes/chat/RSS/legendas no DOM; CSP sem `unsafe-inline` quando possível.
- [ ] Segredos: nunca devolver chave completa em logs/erros; mascarar como já feito em destinos.
- [ ] Logs de segurança: login/link inválido, rate limit, update, falha de auth — sem conteúdo sensível.
- [ ] Testes: CSRF, IDOR, WS sem chave, body grande, path traversal, SSRF, XSS, rate limit.

### 5.2 LAN, convidados e túnel

- [ ] Chaves de convidado/controle/saída: comprimento suficiente (≥128 bits), revogáveis, não previsíveis;
  hoje `outKey` 16 hex/64 bits e `ccKey` 12 hex/48 bits — **avaliar aumentar** (o comprimento reduz
  entropia; URL é pública no link).
- [ ] Expiração/rotação de links; botão “revogar link” que invalida sessões.
- [ ] Aprovação do host para entrada (lobby) quando possível; limite de convidados.
- [ ] Túnel: preferir Cloudflare Tunnel; nunca abrir portas do roteador sem necessidade; documentar que
  túnel público expõe o estúdio.
- [ ] TURN: credenciais temporárias (já existe), segredo forte, rate limit, sem relay aberto.
- [ ] Firewall Windows: regra só para perfil privado e porta necessária; não expor 3000/3443 à internet.
- [ ] Aviso na UI: “não compartilhe o link do painel”; links de convidado ≠ painel.

### 5.3 Mídia, FFmpeg e destinos

- [ ] Argumentos FFmpeg: nunca concatenar strings com input do usuário sem validação; usar array de args,
  escapar/negar metacaracteres.
- [ ] URLs de destino: validar esquema/host; chaves RTMP não aparecem em logs nem em erros.
- [ ] Arquivos importados: tipo/tamanho, varredura básica, conversão em processo separado com limites.
- [ ] MediaMTX/ingest: bind restrito, auth, sem porta pública aberta.
- [ ] Replay/overlay: conteúdo de terceiros tratado como não confiável; CSP/iframe sandbox.
- [ ] Matar processos filhos ao sair; Job Object já usado — validar órfãos.

### 5.4 Atualizador e instalador

- [ ] **Assinatura Authenticode** do exe portátil, setup e `unins000.exe`; timestamp.
- [ ] Manifesto assinado (ou assinatura separada) com versão, hash, URL e canal; validar antes de baixar.
- [ ] HTTPS + certificate pinning? (avaliar; pinning pode quebrar rotação) e timeout.
- [ ] Verificar SHA-256 (já existe), assinatura, tamanho e versão; rejeitar downgrade.
- [ ] Instalação silenciosa somente se assinatura válida; nunca executar como admin sem necessidade.
- [ ] Backup/rollback do binário anterior; se falhar, manter versão atual e avisar.
- [ ] Log de update sem dados sensíveis; opção “baixar manualmente”.
- [ ] Instalador: assinatura, UAC mínimo, per-user por padrão, fechar app, não apagar dados.
- [ ] Não usar `latest` sem hash para FFmpeg/cloudflared; fixar versão e verificar hash no build.

### 5.5 Dados locais e privacidade

- [ ] Permissões de `%LOCALAPPDATA%\CastDeck` restritas ao usuário; gravações idem.
- [ ] Chaves de transmissão: criptografia em repouso (DPAPI no Windows; Keychain/Secret Service fora) ou
  pelo menos arquivo com ACL e sem backup automático.
- [ ] Logs com redaction; não logar corpos de API, chaves ou tokens.
- [ ] Backups: orientar cópia segura; não incluir chaves em local compartilhado.
- [ ] Apagar dados: sobrescrever/apagar com confirmação; desinstalador “manter dados” claro.
- [ ] Sem telemetria oculta; update check declarado; LGPD/privacidade.

### 5.6 Android

- [ ] **Keystore de release** (não `signingConfigs.debug`); segredo fora do repositório/CI protegido.
- [ ] `android:exported` correto; activities/services/receivers mínimos.
- [ ] WebView: `setJavaScriptEnabled` necessário, sem `addJavascriptInterface` amplo; validar origem;
  `setAllowFileAccess(false)` quando possível; mixed content desabilitado.
- [ ] Cleartext HTTP só para `127.0.0.1`/LAN explícita; `networkSecurityConfig`.
- [ ] Permissões mínimas (câmera/mic/armazenamento) e justificativa.
- [ ] Não incluir keystore/local.properties no Git; builds reproduzíveis.
- [ ] Verificar atualização/instalação de APK: assinatura, versionCode, canal.

### 5.7 GitHub e cadeia de suprimentos

- [ ] Repositório privado primeiro; secret scanning + push protection + Dependabot + CodeQL.
- [ ] `.gitignore`/allowlist; nenhum `deploy/`, `landpage/`, `docs/ai/`, dados, chaves.
- [ ] `npm ci` com lockfile; `npm audit`; `cargo audit`; dependency review em PR.
- [ ] Fixar versões de FFmpeg/cloudflared/MediaMTX/yt-dlp e verificar SHA no build; não usar `latest`.
- [ ] SBOM (CycloneDX) por release; inventário de licenças (já em `THIRD-PARTY-INVENTORY.csv`).
- [ ] Branch protection, revisão obrigatória, status checks, 2FA, commits assinados (opcional).
- [ ] GitHub Actions com permissões mínimas, pinadas por SHA, sem secrets de VPS; OIDC para assinatura.
- [ ] Releases assinadas/tag protegida; source zip + SHA; nunca publicar zip privado antigo.
- [ ] Auditar scripts de instalação npm (`postinstall`) e dependências novas.
- [ ] Rotacionar qualquer segredo que já tenha estado em zip compartilhado.

### 5.8 VPS e landing page

- [ ] **Nunca** no repositório público: `deploy/`, `build/deploy.mjs`, `build/release.mjs`, `landpage/`,
  `docs/ai/`.
- [ ] Segredos em cofre/ambiente, não em JSON versionado; chave SSH com passphrase e rotação.
- [ ] VPS: SSH só por chave, fail2ban, firewall, updates, TLS, backups; TURN secret forte.
- [ ] Landing page em repositório/deploy separado, sem credenciais no código.
- [ ] Cloudflare/WAF/rate limit para o site; monitorar alterações.
- [ ] Varredura de segredos no CI do site também.

---

## 6. Detecção e monitoramento

- [ ] Logs locais estruturados (sem segredos) para auth, links, updates, erros de mídia.
- [ ] Contadores de rate limit e falhas de auth; aviso na UI em picos.
- [ ] Health check local; status de túnel/TURN/streams.
- [ ] No GitHub: secret scanning alerts, Dependabot, CodeQL, branch protection.
- [ ] No site: monitor de disponibilidade e de integridade (hash) dos downloads.
- [ ] Sem telemetria por padrão; se adicionar, opt-in e privacy policy.

---

## 7. Resposta a incidentes

### 7.1 Runbook

1. **Detectar/confirmar:** relato privado, alerta de CI, anomalia de stream/update.
2. **Conter:** revogar chaves/links, desligar túnel/stream, bloquear IP, tirar release do ar.
3. **Erradicar:** corrigir, testar, atualizar dependências; rotacionar segredos.
4. **Recuperar:** publicar versão corrigida assinada; restaurar dados de backup; monitorar.
5. **Comunicar:** advisory (GitHub Security Advisory/CVE quando aplicável), crédito ao reporter,
   orientação aos usuários.
6. **Postmortem:** causa raiz, linha do tempo, ações, prazo; sem culpa.

### 7.2 Prazos sugeridos

| Severidade | Exemplo | Primeira resposta | Correção |
|---|---|---|---|
| Crítica | RCE, vazamento de chave, update malicioso | 24 h | 72 h / hotfix |
| Alta | Auth bypass, IDOR, XSS armazenado | 2 dias | 7 dias |
| Média | CSRF limitado, DoS local | 5 dias | 30 dias |
| Baixa | Hardening, informação | 10 dias | próximo ciclo |

### 7.3 Contato

- Canal privado: definir e-mail `security@…` antes do GitHub público; hoje o contato provisório é o site.
- GitHub Security Advisories habilitado.
- Não abrir issue pública com exploit.

---

## 8. Roadmap P0/P1/P2

### P0 — antes de abrir o GitHub / publicar instalador

- [ ] Limpar/allowlist do repositório; secret scanning; rotacionar segredos expostos.
- [ ] Keystore Android de release (remover debug signing).
- [ ] Assinatura Authenticode do instalador/portátil + verificação no updater.
- [ ] Auditar autenticação/autorização HTTP/WS (IDOR, origem, chave, sala).
- [ ] Auditar path traversal/SSRF/upload/FFmpeg args.
- [ ] Definir canal de segurança e `SECURITY.md` final.
- [ ] Revisar `libsignal`/`libvips`/FFmpeg (licença + supply chain) antes do contrato comercial.
- [ ] Publicar fonte correspondente e remover “em breve”.

### P1 — primeiras semanas

- [ ] CSP/headers, rate limit/WS, timeout, limites.
- [ ] Criptografia/ACL de chaves de stream; redaction de logs.
- [ ] SBOM + auditoria de dependências no CI; pinagem de binários.
- [ ] Testes de segurança automatizados (CSRF, IDOR, path, SSRF, WS auth).
- [ ] Backup/rollback documentado e testado.
- [ ] Hardening do Android (WebView, exported, permissões).

### P2 — contínuo

- [ ] Fuzzing de parsers/URLs, revisão externa, bug bounty (opcional).
- [ ] Assinatura de commits/tags, SLSA/provenance.
- [ ] Monitoramento do site e integridade de releases.
- [ ] Revisão periódica de dependências/licenças.
- [ ] Tabletop de incidente e restore de backup.

---

## 9. Critérios de aceite

- [ ] Nenhum segredo de VPS/landpage no repositório, histórico ou zip de fonte.
- [ ] APK de release assinado com keystore próprio; debug signing removido.
- [ ] Instalador/portátil assinados; updater verifica assinatura + SHA + versão.
- [ ] Rotas/WS com autorização por sala e testes de IDOR/CSRF.
- [ ] Path traversal, SSRF e injeção de argumentos cobertos por validação/testes.
- [ ] Chaves de stream protegidas e logs sem segredos.
- [ ] `SECURITY.md` com canal real, escopo, safe harbor e prazos.
- [ ] CI com secret scanning, Dependabot, CodeQL e auditoria de dependências.
- [ ] SBOM e inventário de licenças por release.
- [ ] Fonte pública disponível e site sem “em breve”.
- [ ] Plano de resposta/rollback testado.

---

## 10. Decisões pendentes

1. **Canal de segurança:** qual e-mail/URL? (ex.: `security@cast.flue.live`) e PGP?
2. **Assinatura:** certificado OV/EV/Azure Trusted Signing disponível para o primeiro release?
3. **Android:** keystore de release existe? Vai usar Play App Signing?
4. **Chaves de stream:** criptografar em repouso com DPAPI ou manter ACL? Impacto em backup/portátil.
5. **Servidor:** manter `0.0.0.0` por padrão (LAN) ou tornar opt-in? Recomendo manter com aviso e firewall.
6. **Túnel:** Cloudflare como padrão; permitir outros provedores?
7. **Telemetria:** nenhuma (recomendado) ou opt-in para segurança/estabilidade?
8. **Bug bounty:** abrir programa ou apenas créditos?
9. **Libsignal:** isolar/remover/aceitar GPL — impacta contrato e superfície.
10. **Revisão externa:** contratar pentest antes do instalador público?

---

## 11. Veredito EGM

O CastDeck já tem controles importantes (origem/CSRF, rate limit, body limit, chaves por sala, TURN
temporário, Job Object, verificação SHA-256). O que falta para um lançamento seguro não é “mais uma
feature”, e sim **fechar os buracos estruturais**: segredos fora do Git, APK com chave real, updates
assinados, autorização de servidor auditada e uma política de resposta.

**Ordem correta:** P0 → publicar fonte sanitizada → GitHub privado → revisão → GitHub público →
instalador assinado → P1 contínuo. Segurança não é um arquivo `SECURITY.md`: é o conjunto de controles,
testes e resposta que acompanha cada release.
