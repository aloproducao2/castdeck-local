# SITEMAP — Design docs (EGM)

Índice dos artefatos de design do CastDeck Local. Documentos de plano e análise ficam em `docs/ai/`; designs
formais do fluxo EGM ficam em `docs/designs/`.

## Designs ativos

| Documento | Status | Resumo |
|---|---|---|
| [`PLANO-ASR-SUBSTITUTO-WHISPER.md`](../ai/PLANO-ASR-SUBSTITUTO-WHISPER.md) | implementado | Motor Parakeet pt-BR ONNX (Whisper fallback) |
| [`PLANO-LEGENDA-AUDIO-WEBRTC.md`](../ai/PLANO-LEGENDA-AUDIO-WEBRTC.md) | parcial | Web Speech × Whisper; áudio WebRTC com AEC/NS/AGC |
| [`PLANO-MELHORIA-MIDIA-MINIATURAS.md`](../ai/PLANO-MELHORIA-MIDIA-MINIATURAS.md) | implementado | Biblioteca de mídia, miniaturas compactas |
| [`PLANO-LEGENDAS-TRADUCAO.md`](../ai/PLANO-LEGENDAS-TRADUCAO.md) | referência | Estudo de modelos e arquitetura de legenda/tradução |
| [`LAYOUT-REVIEW.md`](LAYOUT-REVIEW.md) | concluído | Revisão EGM de layout/sobreposições; correção do topo em 1280 |
| [`UI-MENUS-REVIEW.md`](UI-MENUS-REVIEW.md) | concluído | Revisão EGM dos menus/submenus e contraste (WCAG) |
| [`CC-SPEAKER-LABELS.md`](CC-SPEAKER-LABELS.md) | implementado | Legenda com nome de quem fala (opt-in) + melhorias de Closed Caption |
| [`REPLAY-AUDIT.md`](REPLAY-AUDIT.md) | auditoria/plano | Inconsistências do Replay/VAR e plano de correção em ondas |
| [`AUDIO-MIXER-PLAN.md`](AUDIO-MIXER-PLAN.md) | auditoria/plano | Mesa de áudio: bugs de estado, roteamento para saídas físicas, Solo/PFL, buses, AFV e plano por fases |
| [`REMOTE-MODAL.md`](REMOTE-MODAL.md) | implementado (local) | Redesign do modal “Controle remoto no celular” (QR + controles em duas colunas) |
| [`REMOTE-CONTROL.md`](REMOTE-CONTROL.md) | implementado (local) | Controle remoto: 4 abas por tarefa, Conteúdo segmentado, Mesa em duas colunas no PC e atalhos |
| [`VIDEO-SEEK-FLUID.md`](VIDEO-SEEK-FLUID.md) | implementado (local) | Seek suave: cache do último quadro evita o avatar de iniciais durante seeks de vídeo/replay |
| [`MOBILE-LAYOUT.md`](MOBILE-LAYOUT.md) | implementado (local) | Layout mobile Android retrato/paisagem: 4 abas, Mesa em 2 colunas na horizontal, safe areas |
| [`REPLAY-AUDIO-REMOTE.md`](REPLAY-AUDIO-REMOTE.md) | implementado (local) | Replay: monitor local começa mudo (sem duplicar áudio) + botão/aba de controle remoto na LAN |
| [`MENU-AUDIT.md`](MENU-AUDIT.md) | auditoria | Consistência dos 17 menus: nomenclatura, ícones, atalhos, acessibilidade e handlers ausentes |
| [`GC-GRAFISMO-IA-EGM.md`](GC-GRAFISMO-IA-EGM.md) | decisão/plano | Substituir GC atual pelo hub Grafismo, migração de Jornal/Esportes e ponderação |
| [`GC-MARKET-EGM.md`](GC-MARKET-EGM.md) | pesquisa/plano | GC de mercado, templates, dados, controle unificado e saídas HTML/OGraf |
| [`GC-DESIGNER.md`](GC-DESIGNER.md) | plano | Template Studio: painel Operador, designer em modal, elementos, automação e decisão EGM (modal × painel) |
| [`WINDOWS-INSTALLER.md`](WINDOWS-INSTALLER.md) | plano | Instalador Windows per-user + portátil, auto-update, assinatura, conformidade AGPL/GPL e launcher visual |
| [`LICENSING-STRATEGY.md`](LICENSING-STRATEGY.md) | plano | AGPL + licença comercial + CLA + marca, lacunas do site e plano de publicação do código-fonte |
| [`GITHUB-PUBLICATION.md`](GITHUB-PUBLICATION.md) | plano | Export allowlist, sanitização de VPS/landpage, licenças e checklist para abrir o GitHub |
| [`SECURITY-EGM.md`](SECURITY-EGM.md) | plano | Política de segurança, modelo de ameaças STRIDE, controles, resposta e roadmap P0/P1/P2 |
| [`DSK-OVERLAY-ZORDER.md`](DSK-OVERLAY-ZORDER.md) | publicado 1.3.27 | Seletor global “atrás/acima do DSK” para banners, enquetes e comentários: UX, estado, renderização e testes |
| [`SOURCE-TRANSFORM-EGM.md`](SOURCE-TRANSFORM-EGM.md) | implementado local 1.3.38 | Enquadramento de fontes (zoom 10–300%) e DSK (zoom/pan/corte, viewport fixo da página e legado) |
| [`NDI-EGM.md`](NDI-EGM.md) | implementado local 1.4.0 | NDI como fonte e saída: estudo OBS/DistroAV, bridge Rust, MediaMTX, WebSocket, licença e testes |
| [`ECHO-COMPETITORS-EGM.md`](ECHO-COMPETITORS-EGM.md) | pesquisa/plano | OBS × vMix × StreamYard: AEC, mix-minus, fone e plano de validação do eco |
| [`ECHO-ITEM4-TEST-EGM.md`](ECHO-ITEM4-TEST-EGM.md) | teste/plano | Teste local do modo caixa/AEC: constraints, falhas, plano de validação acústica |
| [`HOST-ECHO-AEC.md`](HOST-ECHO-AEC.md) | plano | Eco do host com microfone + caixa de som: AEC do navegador, monitor, modo caixa, medição e testes |
| [`SWITCHER-PGM-AUDIT.md`](SWITCHER-PGM-AUDIT.md) | publicado 1.3.28 | Mesa de corte PGM × modo Estúdio: transições, atalhos, áudio/tally, saídas derivadas e testes |
| [`PERFORMANCE-FREEZE-EGM.md`](PERFORMANCE-FREEZE-EGM.md) | publicado 1.3.28 (parcial) | Performance e antifreeze: retorno/prévia 30/60, frame budget, backpressure, miniaturas e testes |
| [`MEDIA-AUTOSWITCH-EGM.md`](MEDIA-AUTOSWITCH-EGM.md) | publicado 1.3.28 | Mesa inteligente com 2+ vídeos: diferenças Estúdio × PGM, playlist, Solo/take, matrizes E/M e áudio |
| [`AUDIO-VERTICAL-EGM.md`](AUDIO-VERTICAL-EGM.md) | implementado local (fase 1–2) | Botão de mesa de áudio vertical, faders/VUs em colunas e painel destacado |
| [`PLAYOUT-EGM.md`](PLAYOUT-EGM.md) | publicado 1.3.29 | Fila canônica, mini player, painel Playout e mudanças de menu |
| [`I18N-AUDIT.md`](I18N-AUDIT.md) | publicado 1.3.29 | Tradução PT/EN/ES das 17 abas, Diretor em acordeão, troca de idioma e strings restantes |
| [`IMPROVEMENTS-EGM.md`](IMPROVEMENTS-EGM.md) | publicado 1.3.29 | Oportunidades priorizadas por seis lentes: confiabilidade, segurança, áudio, mídia, UX e suporte |

## Estrutura EGM

```text
.agents/skills/
  castdeck-elephant/SKILL.md   # contexto do projeto
docs/designs/
  SITEMAP.md                   # este índice
  <FEATURE>.md                 # design de uma feature
```

## Fluxo

1. **Brainstorm** — clarear a ideia e o brief.
2. **Draft** — escrever o design em `docs/designs/<FEATURE>.md`.
3. **Review** — revisão com contexto zero (goldfish).
4. **Implement** — codar a partir do design aprovado.
5. **Drift** — comparar design × código periodicamente.
