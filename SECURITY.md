# Segurança

O CastDeck é um estúdio local que sobe servidor HTTP/WebSocket, recebe convidados por link e executa
FFmpeg/MediaMTX. Segurança é tratada como requisito de release, não como detalhe opcional.

A política de reporte e as versões suportadas estão abaixo. O plano interno detalhado não faz parte
do repositório público.

## Versões suportadas

| Versão | Suporte |
|---|---|
| Última estável publicada em https://cast.flue.live | Correções de segurança |
| Versão anterior | Correções quando viável |
| Versões antigas / builds de terceiros | Não suportadas; atualize |

## Como relatar uma vulnerabilidade

**Não abra issue pública com detalhes exploráveis.**

Envie um relato privado com:

- versão e sistema operacional;
- descrição do problema e impacto;
- passos para reproduzir (prova de conceito mínima);
- arquivos/logs relevantes, **sem dados pessoais, chaves, gravações ou segredos de VPS**;
- se possível, sugestão de correção.

Canal provisório: contato do site https://cast.flue.live (WhatsApp/Instagram de Miguel Kallemback).
**Antes da publicação do repositório**, um e-mail dedicado de segurança deve ser definido e publicado no
site/GitHub. Alertas do GitHub Security Advisories também serão aceitos após a abertura do repositório.

Se o relato envolver terceiros (FFmpeg, MediaMTX, cloudflared, yt-dlp, Node.js, modelos), avise também o
projeto responsável.

## Escopo

Estão no escopo:

- servidor HTTP/WebSocket local e APIs administrativas;
- autenticação de host/convidado/controle remoto/saída e isolamento por sala;
- links, chaves e revogação de acesso;
- túnel público, LAN, TURN e exposição de portas;
- tratamento de mídia, uploads, URLs, caminhos de arquivo, overlays e FFmpeg;
- atualizações automáticas, verificação de hash/assinatura e troca de executável;
- instalador/launcher, inicialização automática e permissões no Windows;
- app Android, WebView, keystore, permissões e assinatura do APK;
- vazamento de dados locais, chaves de transmissão e logs;
- cadeia de suprimentos (npm/Rust/binários), repositório GitHub, releases e landing page.

Fora do escopo:

- falhas em componentes de terceiros (reporte também ao projeto deles);
- engenharia social e ataques físicos;
- configurações inseguras feitas pelo usuário (ex.: expor o painel local diretamente na internet);
- versões modificadas por terceiros;
- bugs de funcionalidade sem impacto de segurança.

## Compromissos e divulgação responsável

- Confirmaremos o recebimento e daremos uma estimativa de prazo.
- Pedimos prazo razoável para investigar e corrigir antes de qualquer divulgação pública.
- Não tomaremos medidas legais contra pesquisadores que atuarem de boa-fé, dentro do escopo, sem
  exfiltrar/destruir dados e sem interromper serviços de terceiros (**safe harbor**).
- Você será creditado se desejar.
- Não publique exploit funcional antes da correção.
- Correções críticas terão advisory e versão nova; quando aplicável, CVE.

## Atualizações

O app verifica atualizações em `https://cast.flue.live`, baixa o binário e só instala após conferir o
SHA-256. A assinatura Authenticode e a verificação no updater são um requisito P0 do plano de segurança.
Nunca instale um binário de origem desconhecida.

## Recomendações ao usuário

- Baixe somente de `https://cast.flue.live`.
- Não compartilhe o link do **painel**; compartilhe apenas o link de **convidado**.
- Use firewall/rede privada; não abra portas do roteador para o servidor local.
- Se usar túnel público, saiba que o estúdio fica acessível pela internet; prefira Cloudflare Tunnel.
- Mantenha o app atualizado e o antivírus ativo.
- Faça backup dos dados e não compartilhe a pasta `data/` (contém chaves de transmissão).
- No Android, instale apenas o APK oficial assinado; não use builds de terceiros.

## Terceiros e licenças

Componentes de terceiros têm licenças e obrigações próprias. Consulte
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) e [`licenses/`](licenses/). A licença comercial do
CastDeck não cobre terceiros nem remove direitos da AGPL.

## Divulgação

Este documento pode ser atualizado a cada release. A versão vigente é a publicada no repositório e no site.
