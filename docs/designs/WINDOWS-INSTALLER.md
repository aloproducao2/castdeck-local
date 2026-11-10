# EGM — Instalador Windows + versão portátil (sem mudar as versões atuais)

> **Status:** análise/plano. **Nenhum código foi escrito e nenhuma versão foi alterada.**
> **Data:** 2026-11-03
> **Objetivo:** manter o executável atual como **CastDeck Portátil** e acrescentar um **instalador Windows**
> (recomendado para a maioria dos usuários) com **build e atualização automáticos**, sem quebrar o fluxo
> atual de release nem os clientes já instalados na 1.3.26.

---

## 1. Resumo executivo

Hoje existe **um único artefato Windows**: `CastDeck-<versão>-windows-x64.exe`, um launcher Rust de ~190 MB
que embute o servidor Node/FFmpeg e extrai o servidor para `%LOCALAPPDATA%\CastDeck\app`. Ele **não instala**
nada (sem atalhos, sem ARP, sem desinstalador) e **se atualiza substituindo o próprio .exe** via script `.cmd`.

O plano é passar a publicar **dois artefatos** com a mesma versão e o mesmo binário base:

| Artefato | Nome | Público | Atualização |
|---|---|---|---|
| **Portátil** | `CastDeck-<v>-windows-x64-portable.exe` | quem quer “baixar e usar”, USB, máquina sem admin | troca do próprio .exe (fluxo atual) |
| **Instalador** | `CastDeck-<v>-windows-x64-setup.exe` | maioria, uso diário, atalhos e ARP | instalador silencioso ou substituição do .exe |

O instalador **não substitui** o portátil: os dois continuam sendo gerados em toda release. A versão atual
(1.3.26) permanece intacta; este documento só descreve o que muda na próxima versão em que o instalador for
habilitado.

Além do setup, entram duas peças de produto: **licença/conformidade** (AGPL + FFmpeg GPL + terceiros) e um
**launcher visual** próprio (HTML/CSS local em Edge/Chrome app mode), detalhados nas §16 e §17.

**Decisão de produto sugerida:** instalador **por usuário** (sem UAC) como padrão; opção “para todos os
usuários” (admin) como escolha avançada. Portátil com **modo de dados explícito** (ver §6).

---

## 2. Estado atual (fatos do código)

| Item | Como está hoje | Impacto para o instalador |
|---|---|---|
| Build | `build/build-exe.mjs` gera `dist/CastDeck.exe` (pkg + esbuild + launcher Rust) | precisa de um passo novo que empacote esse exe |
| Launcher | `src-tauri` compila `castdeck-launcher.exe` com `embedded-server`; extrai o servidor para `%LOCALAPPDATA%\CastDeck\app` | instalador deve instalar só o launcher (o servidor continua sendo extraído em AppData) |
| Dados | `server/platform.js` → `%LOCALAPPDATA%\CastDeck`; gravações → `Videos\CastDeck` | instalador/portátil precisam decidir se compartilham ou isolam esses dados |
| Launcher (recordings) | `src-tauri/src/main.rs` também calcula `%LOCALAPPDATA%\CastDeck\recordings` | **inconsistência a reconciliar** com `Videos\CastDeck` |
| Atualizador | `server/updater.js` baixa `releases.json`, verifica SHA-256 e troca `CASTDECK_EXE` por `.cmd`/WMI | funciona no portátil; em `Program Files` pode não ter permissão |
| Manifesto | `releases.json` tem `platform: "windows-x64"` e o site usa `latestByPlatform` | é preciso um segundo “platform”/campo para o instalador |
| Release | `release.mjs`: build:all → Android → AppImage → publish → source → deploy | falta compilar, assinar e publicar o instalador |
| Assinatura | **não há** Authenticode hoje | SmartScreen/antivírus; assinatura é o maior ganho de confiança |
| Tauri config | `tauri.conf.json` com `version: 1.2.43` e `bundle.targets: all` (não usado no build atual) | **dívida**: uma versão duplicada e um bundler que não é o caminho real |
| Instância | servidor fixo na porta **3000**; aborta se já houver um CastDeck ativo | instalador deve fechar a instância em uso antes de atualizar |
| Site | `/dl/<arquivo>` conta download; `latest.json` por plataforma | precisa exibir as duas opções (instalador recomendado + portátil) |

---

## 3. Concept brief (6 lentes EGM)

| Lente | Pergunta | Resposta do plano |
|---|---|---|
| **Instalação** | O usuário comum consegue instalar sem medo? | Instalador por usuário, sem admin, com atalhos e desinstalador; portátil continua para quem quer zero instalação. |
| **Atualização** | Como cada modo se mantém atualizado? | Portátil troca o exe; instalado usa o instalador silencioso (ou substituição do launcher se per-user). O updater escolhe pelo **modo de instalação**, nunca pelo palpite. |
| **Dados** | O que acontece com estúdios, gravações e configurações? | Instalador nunca apaga dados; upgrade preserva; uninstall pergunta. Portátil tem modo de dados explícito (AppData ou pasta ao lado). |
| **Confiança** | Por que o Windows não vai bloquear? | Assinatura Authenticode do exe e do setup, timestamp, hash no manifesto e verificação no updater. |
| **Automação** | Como isso entra no release sem trabalho manual? | `npm run release` passa a gerar, assinar, publicar e manifestar os dois artefatos; falha cedo se faltar ferramenta. |
| **Suporte** | Como diagnosticar e reverter? | Log do instalador, modo de instalação visível, SHA no site, versão anterior mantida para rollback, desinstalador com opção “manter dados”. |

---

## 4. Alternativas de empacotamento

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **Inno Setup 6** | Maduro, script único, per-user/per-machine, atalhos, ARP, desinstalador, tarefas opcionais, assinatura, silent flags, Unicode | precisa instalar o ISCC na máquina de build/CI | **Recomendado** |
| **NSIS** | Pequeno, flexível, gera exe; usado pelo Tauri | scripts mais verbosos, manutenção de páginas/tarefas manual | Fallback viável |
| **MSI (WiX)** | Padrão corporativo, GPO/Intune | mais complexo, elevação, curvas de aprendizagem | Só se houver demanda corporativa |
| **Tauri bundler** | Já existe `bundle` no projeto | hoje o build real não usa o bundler; `tauri.conf` está desatualizado; custom launcher/embedded server exigiria reconfigurar | Não no MVP; reavaliar depois |
| **Instalador próprio (ZIP + script)** | Simples | sem ARP, sem desinstalador, sem confiança | Não |

**Recomendação:** **Inno Setup 6** com um `CastDeck.iss` versionado, invocado por um novo
`build/build-installer.mjs`. NSIS fica como plano B se o ambiente de build não puder ter o Inno.

---

## 5. Especificação do instalador (per-user como padrão)

### 5.1 Modos de instalação

| Modo | Pasta | Admin | ARP | Atalhos | Uso |
|---|---|---|---|---|---|
| **Por usuário (padrão)** | `%LOCALAPPDATA%\Programs\CastDeck` | não | HKCU | Menu Iniciar + opcional Desktop | maioria |
| **Para todos os usuários** | `%ProgramFiles%\CastDeck` | sim (UAC) | HKLM | Menu Iniciar comum | máquina compartilhada |

- O instalador detecta instalação existente e oferece **Atualizar** / **Reparar** / **Desinstalar**.
- **Não** instalar serviço do Windows; o app é desktop/tray.
- **Não** instalar Node/FFmpeg separados: continuam embutidos no exe (servidor extraído em AppData).

### 5.2 Atalhos e integração

- Menu Iniciar: **CastDeck**.
- Desktop: opcional (task desmarcada por padrão).
- “Iniciar com o Windows”: opcional (HKCU Run), desmarcado por padrão.
- **AppUserModelID** explícito (`live.flue.castdeck`) no launcher e no atalho, para agrupamento na barra e
  notificações coerentes.
- Sem associação de arquivos (o app não tem extensão própria hoje).
- Ícone do desinstalador e `DisplayIcon` no ARP.
- `DisplayName`: “CastDeck Local”; `Publisher`: “Miguel Kallemback / flue.live”; `DisplayVersion` = versão
  do package; `URLInfoAbout` = site; `HelpLink` = documentação.

### 5.3 Desinstalação

- Fecha o CastDeck se estiver aberto (com confirmação).
- Remove atalhos, ARP e a pasta de instalação.
- Pergunta **“Manter estúdios, configurações e gravações?”**
  - **Sim (padrão):** mantém `%LOCALAPPDATA%\CastDeck` e `Videos\CastDeck`.
  - **Não:** apaga dados do app (nunca apaga `Videos\CastDeck` sem confirmação dupla).
- Log em `%TEMP%\CastDeck-setup.log` (opção `/LOG`).

### 5.4 Firewall e rede

- O app abre servidor local na **porta 3000** e usa LAN/WebRTC para convidados.
- Windows já pergunta na primeira execução; o instalador **não deve** criar regra silenciosamente.
- Opção avançada (somente modo todos-os-usuários/admin): criar regra de entrada para 3000/3443 com
  consentimento explícito. No per-user, apenas documentar o prompt.
- Nunca abrir porta na internet sem o túnel existente.

### 5.5 Flags silenciosas (para o auto-update)

```
CastDeck-<v>-windows-x64-setup.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /LOG="%TEMP%\CastDeck-update.log"
```

- `/CLOSEAPPLICATIONS` deve fechar o launcher/tray; se não fechar, o instalador falha com mensagem clara.
- O update deve preservar dados e configurações.
- Código de saída ≠ 0 → updater mostra erro e mantém a versão antiga.

---

### 5.6 Licença no instalador

- Página de licença no Inno Setup (`LicenseFile`) com a **AGPL-3.0-only** completa, em PT/EN/ES quando possível.
- Página “Avisos de terceiros” com `THIRD-PARTY-NOTICES.txt` (FFmpeg, cloudflared, MediaMTX, yt-dlp, Node,
  bibliotecas Rust/npm, fontes e modelos).
- `SOURCE-OFFER.txt` no diretório de instalação + atalho “Código-fonte” no Menu Iniciar, apontando para a
  versão exata (tag/zip/SHA) no site.
- Checkbox “Li e aceito a AGPL-3.0 e os avisos de terceiros” — **sem** criar EULA que restrinja a AGPL.
- O instalador **não** pode remover/restringir direitos da AGPL; o código-fonte continua disponível.
- Estudo legal completo na §16.

### 5.7 Launcher bonito

- Hoje o launcher abre direto o estúdio no Edge/Chrome em modo app, sem janela própria.
- Proposta: uma **janela de launcher** em HTML/CSS servida localmente (mesma pilha web, sem WebView2 extra),
  aberta em Edge/Chrome `--app`, com hero, versão, “Abrir estúdio”, atualização, dados/logs, licenças e sair.
- Primeiro uso: idioma, licença, teste rápido de câmera/mic, modo de dados e atalhos.
- Design e estados completos na §17.

---

## 6. Versão portátil: o que “portátil” significa

O artefato atual **não é totalmente portátil**: ele não instala nada, mas grava dados em
`%LOCALAPPDATA%\CastDeck` e gravações em `Videos\CastDeck`. Isso é “sem instalação”, não “leva no pendrive”.

### 6.1 Opções

| Modo | Dados | Prós | Contras |
|---|---|---|---|
| **A. Sem instalação (atual)** | `%LOCALAPPDATA%\CastDeck` + `Videos` | compatível, sem permissão, atualização simples | não leva configurações no pendrive; mistura com instalado |
| **B. Portátil de verdade** | pasta `CastDeck-data\` ao lado do exe | leva tudo no pendrive; isola de outra instalação | exige pasta gravável; não pode ficar em Program Files; gravações no pendrive podem ser lentas |
| **C. Híbrido** | flag/arquivo `portable.flag` ou `--portable` ativa B; sem flag, A | melhor dos dois; retrocompatível | duas pastas de dados para suportar/documentar |

**Recomendação:** **C**. Manter o comportamento atual como padrão (A) para não quebrar a 1.3.26 e oferecer
um pacote **Portátil (dados ao lado)** quando o usuário criar `portable.flag` ou usar
`CastDeck.exe --portable`. O instalador sempre usa A.

### 6.2 Regras do modo B

- Dados em `<pasta do exe>\CastDeck-data\`; gravações em `<pasta do exe>\CastDeck-data\recordings\`.
- Se a pasta não for gravável → mensagem clara e oferta de usar AppData.
- Não cria atalhos, não escreve ARP, não inicia com Windows.
- Atualização: baixa o exe portátil e substitui; nunca baixa o instalador.
- Migração A→B: copiar dados manualmente (ou botão “Exportar/Importar” futuro); não automático no MVP.
- O servidor precisa receber `CASTDECK_DATA` e `CASTDECK_RECORDINGS` do launcher quando em modo portátil;
  hoje `server/index.js` só respeita essas vars em modo dev, então isso **precisa mudar** no modo empacotado.

### 6.3 Nome e compatibilidade

- Portátil: `CastDeck-<v>-windows-x64-portable.exe`.
- Instalador: `CastDeck-<v>-windows-x64-setup.exe`.
- **Compatibilidade:** manter o artifact antigo `windows-x64` apontando para o portátil (clientes 1.3.26
  continuam atualizando); adicionar `windows-x64-installer` para o instalado.
- O site deve mostrar **Instalador (recomendado)** e **Portátil** com tamanhos/hashes.

---

## 7. Atualização automática por modo

### 7.1 Matriz

| Instalação | Manifesto usado | Download | Como aplica | Reinício |
|---|---|---|---|---|
| **Portátil** | `windows-x64` | `...-portable.exe` | script `.cmd`/WMI troca o exe (fluxo atual) | launcher reabre |
| **Instalado per-user** | `windows-x64-installer` | `...-setup.exe` | instalador silencioso (`/VERYSILENT...`) | instalador reabre |
| **Instalado all-users** | `windows-x64-installer` | `...-setup.exe` | instalador silencioso **elevado** | instalador reabre |
| **Instalado sem permissão** | `windows-x64-installer` | `...-setup.exe` | baixa e abre o instalador interativo | usuário conclui |

### 7.2 Detecção do modo

- Gravar no instalador: `HKCU\Software\CastDeck` (per-user) ou `HKLM\Software\CastDeck` (all-users)
  com `InstallMode = installed`, `InstallDir`, `Version`.
- Launcher exporta `CASTDECK_INSTALL_MODE=installed|portable` para o servidor.
- O updater lê o modo; se ausente, cai no comportamento atual (portátil), garantindo retrocompatibilidade.
- **Nunca** inferir só por `Program Files`; usar o registro/marcador.

### 7.3 Fluxo instalado

1. `GET releases.json` (sem cache).
2. Escolhe o artefato `windows-x64-installer` da versão mais nova.
3. Baixa com progresso em `%LOCALAPPDATA%\CastDeck\update\`.
4. Confere **SHA-256** e, se disponível, a assinatura Authenticode.
5. Executa o setup silencioso com `/CLOSEAPPLICATIONS /RESTARTAPPLICATIONS`.
6. O instalador fecha o app, substitui os arquivos e reabre.
7. Se o código de saída falhar, mantém a versão antiga e mostra “Baixar manualmente”.

### 7.4 Fluxo portátil

- Igual ao atual, mas com:
  - verificação de que a pasta do exe é gravável (senão oferece baixar manualmente);
  - backup do exe anterior em `%LOCALAPPDATA%\CastDeck\update\backup\` (rollback);
  - mensagem se a versão estiver rodando de um pendrive somente leitura.

### 7.5 Segurança do updater

- HTTPS + SHA-256 obrigatório (já existe).
- **Assinatura Authenticode** do setup e do exe portátil; verificar antes de executar (novo).
- Publicar `sha256` e `size` no manifesto; nunca confiar só no nome.
- Bloquear downgrade/versão igual (já existe).
- Log local de updates e opção “baixar manualmente”.

---

## 8. Mudanças no manifesto e no site

### 8.1 `releases.json` (proposta)

```json
{
  "version": "1.4.0",
  "artifacts": [
    {
      "platform": "windows-x64",
      "kind": "portable",
      "os": "windows",
      "label": "Windows 10/11 (portátil)",
      "file": "downloads/1.4.0/CastDeck-1.4.0-windows-x64-portable.exe",
      "size": 190000000,
      "sha256": "…",
      "available": true,
      "legacy": true
    },
    {
      "platform": "windows-x64-installer",
      "kind": "installer",
      "os": "windows",
      "label": "Windows 10/11 (instalador)",
      "file": "downloads/1.4.0/CastDeck-1.4.0-windows-x64-setup.exe",
      "size": 95000000,
      "sha256": "…",
      "available": true,
      "installer": { "scope": "per-user", "silent": "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS" }
    }
  ]
}
```

- **`platform: windows-x64` continua existindo** (portátil) para não quebrar o updater atual.
- `latestByPlatform` ganha `windows-x64-installer`.
- Site: bloco Windows com dois botões, **Instalador recomendado** primeiro; hash e tamanho.
- `/dl/` continua contando downloads por arquivo.

### 8.2 Compatibilidade com clientes antigos

- Updater 1.3.26 procura `platform === 'windows-x64'`; mantendo esse artifact como portátil, ele continua
  atualizando normalmente.
- Clientes instalados só existirão a partir da versão com instalador; o updater novo lê `kind`/registro.

---

## 9. Build e release automáticos

### 9.1 Fluxo proposto

```
npm run release -- --notes "..."
  ├─ preflight (app fechado, doc page íntegra, ISCC presente, signtool presente se assinar)
  ├─ build:licenses      (NOVO: gera THIRD-PARTY-NOTICES.txt, licenses/ e inventory; falha se faltar)
  ├─ build:all            (portátil Windows/Linux/macOS)
  ├─ build:android
  ├─ build:appimage
  ├─ build:installer      (NOVO: Inno Setup a partir de dist/CastDeck.exe)
  ├─ sign                 (NOVO: sign portable + setup + uninstaller; timestamp)
  ├─ publish              (site: dois artefatos + latest/releases + docs + licenças)
  ├─ pack-source          (zip sanitizado, com licenses/ e source offer)
  └─ deploy               (VPS)
```

### 9.2 Novo script `build/build-installer.mjs`

Responsabilidades:

1. Ler versão do `package.json` e o exe portátil `dist/CastDeck.exe`.
2. Verificar se `ISCC.exe` existe (ou baixar/instalar em CI).
3. Gerar `dist/installer/CastDeck-<v>-windows-x64-setup.exe`.
4. Calcular tamanho/SHA-256 e devolver JSON para o publish.
5. Opcional: assinar com `signtool` usando variáveis de ambiente.
6. Incluir `licenses/`, `THIRD-PARTY-NOTICES.md`, `SOURCE-OFFER.md` e a atribuição do Parakeet no pacote.
7. Falhar cedo se o exe não existir, se faltar licença de componente redistribuído ou se o Inno não estiver
   disponível (a menos que `--no-installer`).

### 9.3 Dependências de build

- **Inno Setup 6** instalado (winget/choco) ou caminho via `INNO_ISCC`.
- **Windows SDK signtool** para assinatura (se `SIGN_CERT` configurado).
- Node 22, Rust/cargo, pkg, esbuild (já usados).
- CI: Windows runner com cache de Inno/signtool; segredos do certificado fora do repositório.

### 9.4 Versionamento único

- `package.json` continua sendo a fonte da verdade.
- `tauri.conf.json` (1.2.43) deve ser corrigido/removido do caminho real ou atualizado pelo build.
- Versão do instalador, `DisplayVersion`, `Cargo.toml` e site devem sair todas da mesma versão.
- Não mudar versão nesta análise; só no release que habilitar o instalador.

### 9.5 Assinatura

- Assinar **portátil**, **setup** e **unins000.exe**.
- `signtool sign /fd SHA256 /tr <timestamp> /td SHA256 /a`.
- Sem certificado: release funciona, mas marca `unsigned: true` e aviso no site; SmartScreen aparece.
- Opções: certificado OV/EV em token, Azure Trusted Signing, ou ambos.
- Verificação pós-assinatura: `signtool verify /pa /v`.

---

## 10. Dados, migração e coexistência

| Cenário | Comportamento |
|---|---|
| Instalar sobre portátil atual | Instalador detecta app aberto, pede para fechar, instala; **não** move dados de AppData (já estão lá). |
| Desinstalar mantendo dados | Remove programa/atalhos; mantém `%LOCALAPPDATA%\CastDeck` e `Videos\CastDeck`. |
| Desinstalar apagando dados | Confirmação extra; apaga AppData; pergunta sobre gravações. |
| Portátil + instalado na mesma máquina | Compartilham AppData/porta 3000; não rodam juntos. Documentar. |
| Portátil de verdade (B) | Dados ao lado; isolado; não compartilha com instalado. |
| Atualização instalado | Instalador preserva dados; versão nova em cima da antiga. |
| Rollback | Manter setup anterior disponível no site; updater guarda backup quando possível. |

**Inconsistência a corrigir:** `src-tauri` calcula gravações em `AppData\CastDeck\recordings`, enquanto
`server/platform.js` usa `Videos\CastDeck`. O instalador/portátil precisa de uma regra única; sugerir
`Videos\CastDeck` como padrão e `portable-data\recordings` no modo portátil verdadeiro.

---

## 11. Riscos e mitigação

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| SmartScreen/antivírus bloquear setup não assinado | Alta | Alto | Assinatura + reputação; publicar hash; instruções |
| Updater baixar instalador e tentar substituir o exe | Média | Alto | `kind`/`platform` distintos + teste automatizado |
| Instalado em Program Files sem permissão para auto-update | Média | Alto | per-user como padrão; all-users usa instalador elevado |
| Instalador apagar dados do usuário | Baixa | Crítico | “manter dados” padrão; testes de upgrade/uninstall |
| Duas instâncias/porta 3000 | Média | Médio | instalador fecha app; mutex de instância; mensagem clara |
| `tauri.conf`/versões divergentes | Alta | Médio | fonte única de versão; lint de release |
| Build quebrar por falta do Inno | Média | Médio | preflight + fallback NSIS ou `--no-installer` |
| Firewall bloquear convidados LAN | Alta | Médio | documentar prompt; opção de regra com consentimento |
| Paths Unicode/português | Média | Médio | Inno Unicode; testes com “Área de Trabalho” |
| Portátil em pendrive somente leitura | Média | Médio | detectar escrita; oferecer AppData |
| Perda de configurações ao migrar A→B | Baixa | Médio | migração manual/export futuro; documentar |

---

## 12. Plano de testes

### 12.1 Instalação

- [ ] Windows 10 22H2 x64 e Windows 11 x64, conta **sem admin**.
- [ ] Instalação limpa per-user: atalho, ARP, ícone, versão, desinstalador.
- [ ] Instalação all-users com UAC (se implementado).
- [ ] Instalar com o app aberto → fecha e continua.
- [ ] Instalar em caminho com acentos/espaços.
- [ ] Antivírus/SmartScreen: comportamento documentado.

### 12.2 Atualização

- [ ] Portátil 1.3.26 → nova versão (substituição do exe).
- [ ] Instalado per-user → setup silencioso → reabre na versão nova.
- [ ] Atualização com estúdio aberto → fecha, atualiza, dados preservados.
- [ ] Falha de rede/hash errado → mantém versão antiga e mensagem.
- [ ] Downgrade bloqueado.
- [ ] Instalado all-users sem elevação → abre instalador interativo.

### 12.3 Dados e desinstalação

- [ ] Upgrade preserva estúdios, marca, templates, gravações.
- [ ] Desinstalar “manter dados” → reinstalar recupera tudo.
- [ ] Desinstalar “apagar dados” → confirmações corretas.
- [ ] Portátil modo A e modo B isolados.
- [ ] Gravações em `Videos\CastDeck` e no portátil B.

### 12.4 Rede/segurança

- [ ] Firewall: convidado LAN conecta após permitir.
- [ ] Porta 3000 ocupada → mensagem.
- [ ] Assinatura válida (`signtool verify /pa`).
- [ ] Hash do site confere com o arquivo baixado.

---

## 13. Roadmap sugerido (sem alterar a versão atual)

### Fase 0 — Decisões (esta análise)
- [ ] Confirmar per-user como padrão.
- [ ] Confirmar o que “portátil” significa (A, B ou C).
- [ ] Confirmar se haverá assinatura já no primeiro release com instalador.
- [ ] Confirmar se all-users entra no MVP.
- [ ] Revisão jurídica da AGPL + FFmpeg GPL + marca (ver §16).
- [ ] Confirmar launcher HTML/CSS em app mode (ver §17).

### Fase 1 — Instalador manual + licenças
- [ ] `CastDeck.iss` + `build/build-installer.mjs`.
- [ ] `build/licenses.mjs` gera `THIRD-PARTY-NOTICES.txt` e `licenses/`.
- [ ] Página de licença + `SOURCE-OFFER.txt` + link do código-fonte.
- [ ] Launcher mínimo (HTML local) com Abrir/Atualizar/Licenças/Sair.
- [ ] Gerar setup local, testar instalar/desinstalar/upgrade.
- [ ] Publicar o setup apenas como download manual (sem auto-update ainda).

### Fase 2 — Release automática
- [ ] `release.mjs` gera portátil + setup na mesma execução.
- [ ] `releases.json`/`latest.json` com os dois artefatos.
- [ ] Site com dois botões e hashes.
- [ ] Preflight do ISCC.

### Fase 3 — Auto-update instalado
- [ ] Registro do modo de instalação.
- [ ] Updater escolhe `windows-x64-installer` e executa silent.
- [ ] Testes de upgrade/falha/rollback.

### Fase 4 — Assinatura e polimento
- [ ] Assinatura Authenticode de exe/setup/uninstall.
- [ ] AppUserModelID e notificações.
- [ ] Firewall opcional documentado.
- [ ] Migração/portátil B, se aprovado.

### Fase 5 — Launcher completo
- [ ] Wizard de primeiro uso (idioma, licença, mídia, atalhos).
- [ ] Estados de update com progresso e release notes.
- [ ] Página “Sobre / Licenças / Código-fonte” offline.
- [ ] Bandeja e atalhos consistentes.
- [ ] Acessibilidade AA e fallback para navegador comum.

---

## 14. Critérios de aceite

- [ ] A release continua gerando o **portátil** atual sem regressão.
- [ ] O instalador instala e desinstala sem admin (per-user), com atalho e ARP.
- [ ] `npm run release` gera os dois artefatos, assina (se configurado), publica e atualiza os manifestos.
- [ ] Cliente 1.3.26 continua atualizando pelo artifact `windows-x64` (portátil).
- [ ] Instalado detecta modo e atualiza via setup; portátil via exe.
- [ ] Dados sobrevivem a upgrade e a desinstalação com “manter dados”.
- [ ] SHA-256 e assinatura conferem; falha mantém versão anterior.
- [ ] Instalador mostra AGPL + terceiros e `SOURCE-OFFER.txt` aponta para a versão/fonte correta.
- [ ] FFmpeg GPL com licença e fonte/oferta presentes; marca com aviso próprio.
- [ ] Launcher abre, mostra versão/modo, atualiza e dá acesso a licenças/fonte.
- [ ] Nenhuma versão é alterada por esta análise; a próxima release define o número.

---

## 15. Perguntas para decidir antes de implementar

1. **Escopo do instalador:** per-user (sem admin) é o padrão? All-users entra já ou depois?
2. **Portátil:** mantém dados em AppData (A), vira “dados ao lado” (B) ou híbrido com flag (C)?
3. **Assinatura:** já temos certificado (OV/EV/Azure Trusted Signing) para o primeiro release com setup?
4. **Auto-update instalado:** setup silencioso ou substituição do exe no per-user?
5. **Firewall:** o instalador deve oferecer criar regra de entrada (elevação) ou só documentar?
6. **Inno Setup** pode ser dependência fixa da máquina de build/CI?
7. **MSI** é requisito para algum cliente corporativo?
8. **Tauri bundler:** corrigir/remover `tauri.conf` agora ou deixar para uma limpeza separada?
9. **Portátil de verdade:** precisa de migração automática dos dados atuais ou manual no primeiro release?
10. **Nome do produto no ARP:** “CastDeck Local” ou “CastDeck”?
11. **FFmpeg:** continuar com build GPL (e publicar a fonte) ou migrar para LGPL?
12. **Licença:** incluir o zip do código-fonte dentro do instalador ou apenas oferta/link com SHA?
13. **Launcher:** HTML/CSS em Edge/Chrome app mode é suficiente ou você quer uma janela nativa (Tauri/egui)?
14. **Primeiro uso:** wizard obrigatório ou “Abrir estúdio” direto com licença em Sobre?
15. **Marca:** qual aviso de marca/forks deve constar no instalador e no launcher?

---

## 16. Estudo aprofundado de licenças

> **Aviso:** isto é engenharia de conformidade, não parecer jurídico. Antes de publicar o instalador, uma
> revisão jurídica do conjunto (AGPL + binários GPL + marcas) é recomendada.
>
> **Leitura obrigatória:** [`LICENSING-STRATEGY.md`](LICENSING-STRATEGY.md) aprofunda a estratégia AGPL +
> comercial, o CLA, a marca e a lacuna atual do site (“código-fonte em breve”). O instalador só deve ser
> publicado **depois** de a fonte estar pública.

### 16.1 O que o instalador redistribui

| Componente | Licença atual/provável | Obrigação principal | Ação no instalador/launcher |
|---|---|---|---|
| **CastDeck** (código, launcher, web) | **AGPL-3.0-only** (SPDX no topo dos arquivos) | Disponibilizar o código correspondente; manter avisos; não impor restrições adicionais; oferecer fonte a usuários que interagem pela rede (§13) | Licença completa, SOURCE-OFFER, link “Código-fonte”, aviso §13 |
| **FFmpeg** (gyan.dev essentials / ffmpeg-static) | **GPLv3** (confirmar build) | Licença GPL, copyright e **fonte correspondente** do FFmpeg/build | `licenses/components/FFmpeg.txt`, `GPL-3.0.txt`, fonte/oferta |
| **cloudflared** | Apache-2.0 | Licença + NOTICE | `licenses/components/cloudflared.txt`, `Apache-2.0.txt` |
| **MediaMTX** | MIT | Licença/copyright | `licenses/components/MediaMTX-MIT.txt` |
| **yt-dlp** | Unlicense | Aviso | `licenses/Unlicense.txt` |
| **Node.js** embutido pelo pkg | MIT | Licença do Node e avisos | `licenses/Node-MIT.txt` + `npm-dependencies.txt` |
| **npm deps** (Express, ws, pino, Baileys, **libsignal**, **sharp/libvips**…) | MIT/Apache/ISC/**GPLv3**/**LGPLv3** | Avisos; libsignal/libvips exigem fonte/relink e análise jurídica | `licenses/npm-dependencies.txt` + `THIRD-PARTY-INVENTORY.csv` |
| **Rust crates** (launcher + workers de legenda) | MIT/Apache/MPL/Zlib/Unicode | Avisos | `licenses/rust-dependencies.txt` |
| **Web vendor** (MediaPipe, RNNoise, modelos `.tflite`) | Apache-2.0/BSD-3 | Avisos | `licenses/components/MediaPipe.txt`, `RNNoise.txt` |
| **Modelos de legenda/voz** | Whisper **MIT**; Parakeet **CC-BY-4.0** | Atribuição (Parakeet) e licença | `licenses/components/Whisper-models.txt`, `Parakeet-model.txt` |
| **Fonte Inter** | SIL OFL 1.1 | Aviso OFL | `licenses/OFL-1.1.txt` |
| **Marca, logo, splash, nome “CastDeck”** | Direitos do autor, **não** cobertos pela AGPL | Não confundir licença de código com licença de marca | Aviso de marca; forks devem renomear/rebrandar |

### 16.2 AGPL: o que não pode faltar

1. **Texto completo** da AGPL-3.0 no instalador e no launcher (“Sobre → Licenças”).
2. **Código-fonte correspondente** à versão exata do binário:
   - pack-source.mjs já gera o zip por release; publicar em /source/<versão>/… e linkar.
   - SOURCE-OFFER.txt no diretório de instalação com URL, versão, SHA-256 e instruções.
3. **Oferta para usuários de rede (§13):** convidados que usam o estúdio pelo navegador também devem ter
   acesso ao fonte. Link “Código-fonte” no launcher, na página do convidado e na documentação.
4. **Sem restrições adicionais:** não usar EULA que proíba modificação, engenharia reversa ou redistribuição
   além do que a AGPL permite. “Li e aceito” é apenas ciência da licença.
5. **Avisos de modificações:** se o binário tiver patches locais, o fonte publicado deve incluí-los.

### 16.3-A libsignal (GPLv3) e libvips (LGPLv3): bloqueio comercial

- **libsignal** está na árvore de produção do Baileys (WhatsApp) e é **GPL-3.0**. O instalador que incluir
  esse binário precisa de fonte correspondente, avisos e análise GPL/AGPL; não pode ser descrito como
  “código fechado” pela licença comercial.
- **sharp/libvips**: Apache-2.0 + LGPL-3.0-or-later. É preciso permitir relink/uso da biblioteca e incluir
  fonte/avisos; revisar como o `pkg` empacota o nativo.
- Antes de publicar o instalador com promessa comercial, resolver: isolar o WhatsApp em componente separado,
  remover libsignal, ou aceitar as obrigações GPL no binário. Idem para libvips.
- Textos: `licenses/components/libsignal.txt` e `licenses/components/sharp-libvips.txt`.

### 16.3 FFmpeg: o ponto mais delicado

- As builds usadas hoje (gyan.dev “essentials” no Windows e ffmpeg-static nos demais) são **GPLv3**.
- Distribuir o executável do FFmpeg exige:
  - licença GPLv3 e avisos de copyright;
  - **fonte correspondente** do FFmpeg e da configuração de build (ou oferta escrita válida);
  - não impor restrições adicionais sobre o FFmpeg.
- O CastDeck chama o FFmpeg como **processo separado**, mas isso não elimina a obrigação de fonte do binário
  GPL redistribuído. O instalador deve incluir a licença e a oferta.
- Alternativas a avaliar:
  - migrar para uma build **LGPL** (sem componentes GPL) para reduzir obrigações, perdendo alguns codecs/filtros;
  - continuar GPL e incluir ffmpeg-source.tar.xz + script de build no pacote/site;
  - oferecer “source package” separado com checksum e link permanente.
- Fixar **versão e URL exatas** no build (hoje “latest” do gyan/ffmpeg-static pode mudar) para que a fonte
  correspondente seja reproduzível.

### 16.4 Marca e conteúdo

- AGPL não concede direito ao nome, logo ou identidade visual “CastDeck/Flow”.
- Incluir TRADEMARK.txt: uso permitido para se referir ao projeto; forks devem rebrandar.
- Splash/logo/ícones: autoria e direitos reservados; não relicenciar implicitamente.
- Conteúdo de exemplo (templates, imagens) deve ter licença própria ou ser criado pelo usuário.

### 16.5 Privacidade e atualização

- O app é local; o updater consulta cast.flue.live e baixa binários. Declarar isso no launcher/instalador.
- Sem telemetria por padrão; logs locais em %LOCALAPPDATA%\CastDeck\logs.
- Instalador não deve coletar dados nem enviar estatísticas sem consentimento.

### 16.6 Geração automática dos avisos

Propor build/licenses.mjs:

1. Lê package-lock.json e cargo metadata.
2. Coleta os textos de licença dos pacotes e dos binários vendorizados.
3. Junta public/vendor/LICENSES.txt + licenças de modelos/fontes.
4. Gera THIRD-PARTY-NOTICES.txt e a pasta licenses/.
5. Falha o release se faltar licença de um componente redistribuído.
6. O Inno inclui licenses/; o launcher exibe os mesmos arquivos.

### 16.7 Testes de conformidade

- [ ] Instalador mostra AGPL e permite abrir o texto completo.
- [ ] SOURCE-OFFER.txt aponta para a versão exata e o SHA confere.
- [ ] Link “Código-fonte” funciona no launcher e na página do convidado.
- [ ] FFmpeg: licença GPL + fonte/oferta presente.
- [ ] cloudflared, MediaMTX, yt-dlp, Node e modelos com licença presentes.
- [ ] Nenhum EULA restringe a AGPL.
- [ ] Aviso de marca presente.
- [ ] Build falha se um componente novo não tiver licença mapeada.

---

## 17. Launcher: design e estados

### 17.1 Objetivo

O launcher deixa de ser “abrir o estúdio direto” e vira a **porta de entrada confiável**:

- mostra versão, modo (instalado/portátil) e estado do servidor;
- abre o estúdio em um clique;
- gerencia atualização, dados, logs, licenças e saída;
- no primeiro uso, configura idioma, licença, câmera/mic e atalhos;
- mantém a estética do CastDeck (dark, roxo, vermelho ao vivo).

### 17.2 Tecnologia

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **HTML/CSS local em Edge/Chrome --app** | Reusa a pilha web, design bonito, sem runtime extra, atualiza junto com o app | depende de Edge/Chrome; fallback para navegador comum | **Recomendado** |
| Tauri/WebView2 | Janela nativa integrada | adiciona WebView2/runtime e peso; reescrever launcher | Não no MVP |
| Rust nativo (egui/slint) | Pequeno, sem navegador | UI menos flexível; mais trabalho de design | Alternativa de longo prazo |
| Página no navegador padrão | Simples | sem modo app, aparência inconsistente | Fallback |

**Fluxo:** launcher Rust inicia servidor → abre http://127.0.0.1:3000/launcher em Edge/Chrome --app →
usuário escolhe “Abrir estúdio” → mesma janela navega para /studio; a bandeja reabre o launcher.

### 17.3 Layout (980×640, mínimo 860×560)

```
┌────────────────────────────────────────────────────────────────────┐
│  ◈ CastDeck                                      v1.3.26 · ● pronto │
│                                                                    │
│   Seu estúdio, local.                                              │
│   Câmeras, convidados e transmissão no seu computador.             │
│                                                                    │
│   ┌──────────────────────┐   ┌───────────────────────────────┐    │
│   │   ▶ Abrir estúdio    │   │ Atualização                    │    │
│   └──────────────────────┘   │ Verificando… / Baixar / Pronto │    │
│                              └───────────────────────────────┘    │
│   Dados: %LOCALAPPDATA%\CastDeck      Gravações: Vídeos\CastDeck │
│                                                                    │
│   [Abrir pasta de dados] [Logs] [Verificar atualizações]           │
│                                                                    │
│   Licenças · Código-fonte · Documentação · Sair                    │
└────────────────────────────────────────────────────────────────────┘
```

**Primeiro uso (wizard):**

1. Boas-vindas + escolha de idioma (PT/EN/ES).
2. Licença AGPL + avisos de terceiros + “Li e compreendo” + link do fonte.
3. Teste opcional de câmera/microfone (pular).
4. Modo de dados (AppData ou pasta ao lado/portátil) e atalhos.
5. Pronto → Abrir estúdio.

### 17.4 Estados

| Estado | Aparência | Ações |
|---|---|---|
| Iniciando servidor | skeleton/spinner, “Preparando o estúdio…” | aguardar; ver logs |
| Pronto | status verde, botão principal ativo | Abrir, atualizar, dados |
| Verificando update | spinner discreto | continuar usando |
| Baixando | barra + MB/total + versão | cancelar? (não interromper o uso) |
| Pronto para instalar | botão “Reiniciar e atualizar” + notas | instalar depois |
| Erro de update | mensagem + “Baixar manualmente” | abrir site |
| Modo portátil | badge “Portátil” + caminho dos dados | abrir pasta |
| Instalado | badge “Instalado” + versão | desinstalar/abrir ARP |
| Offline | aviso discreto | seguir local |

### 17.5 Design tokens

| Token | Valor |
|---|---|
| Fundo | #0b0a14 / gradiente #141225 → #0b0a14 |
| Superfície | #141225 com borda #2a2440 |
| Acento | #7c5cff (roxo CastDeck) |
| Ao vivo | #ef4444 |
| Texto | #f5f3ff / secundário #a8a2c0 |
| Fonte | Inter (SIL OFL) |
| Raio | 12 px cards, 10 px botões |
| Movimento | 180 ms ease-out; respeitar prefers-reduced-motion |
| Contraste | AA mínimo; foco visível em todos os controles |

### 17.6 Bandeja e atalhos

Menu da bandeja:

- Abrir launcher
- Abrir estúdio
- Verificar atualizações
- Abrir pasta de dados
- Abrir logs
- Sobre / Licenças
- Sair

Atalhos: Enter abre o estúdio; Esc minimiza para a bandeja; Ctrl+U verifica update; Ctrl+L licenças.

### 17.7 Integração com instalador e portátil

- Instalador cria atalho para o **launcher** (não direto para o estúdio).
- Portátil abre o launcher com badge “Portátil” e dados ao lado (se modo B) ou AppData (A).
- “Desinstalar” no launcher instalado abre “Aplicativos e recursos” ou o uninstaller.
- Primeiro uso só aparece uma vez por instalação (HKCU/arquivo de estado).
- O launcher nunca baixa assets externos; tudo local, exceto checagem de update.
- Licenças e fonte acessíveis offline no licenses/ instalado.

### 17.8 Critérios de aceite do launcher

- [ ] Abre em < 1,5 s após o servidor responder.
- [ ] Funciona em Edge/Chrome app mode; fallback em navegador comum sem quebrar.
- [ ] Primeiro uso conclui em < 2 min, com licença e teste de mídia opcional.
- [ ] Atualização mostra progresso e não bloqueia o estúdio já aberto.
- [ ] Modo instalado/portátil visível e correto.
- [ ] Licenças e fonte acessíveis em 2 cliques.
- [ ] Teclado e leitor de tela; contraste AA.
- [ ] Sem dependência de WebView2 além do Edge/Chrome já usado.
