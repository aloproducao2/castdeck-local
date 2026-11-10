# PTZ USB, NDI e câmera remota — plano EGM

**Status:** fases locais 1–4 + PTZ remoto + digital no host + ONVIF + UX inspirada no VDO.Ninja em 1.5.2; validação com hardware real ainda pendente. Nada publicado.
**Base:** CastDeck Local 1.5.2 (Windows desktop).
**Data:** 2026-11-09.

---

## 1. Resumo executivo

O CastDeck já tem:

- câmeras locais e extras por UVC;
- fontes NDI recebidas pelo sidecar `castdeck-ndi`;
- o modo **Câmera remota**, em que um celular ou PC abre um link e envia câmera/microfone por WebRTC;
- painel de câmeras com zoom, foco, exposição e cor;
- HUD PTZ flutuante, atalhos e MIDI no build local 1.4.5.

O próximo passo é fazer o **PTZ chegar também às câmeras remotas**:

```text
host (HUD PTZ)
  → signaling 'camera'
  → remetente (celular/PC)
  → câmera local do remetente
  → estado de volta ao host
```

Para uma câmera PTZ USB no PC remetente, o controle é físico. Para um celular sem hardware PTZ, não há pan/tilt físico; qualquer movimento teria de ser **digital** e precisa de uma decisão separada.

---

## 2. Método EGM

O plano usa as seis lentes:

1. **Operador / UX** — o controle remoto precisa ser claro e seguro no ar.
2. **Confiabilidade / performance** — comandos coalescidos, parada e reconexão.
3. **Áudio** — motores PTZ podem ser captados pelo microfone.
4. **Vídeo / mídia** — PTZ físico × enquadramento digital.
5. **Arquitetura / segurança / distribuição** — signaling, validação, NDI e SDK.
6. **Qualidade / suporte** — modelos, protocolos e testes físicos.

---

## 3. Drivers PTZ

### 3.1 UVC local

Implementado no HUD:

- lê `MediaStreamTrack.getCapabilities()`;
- aplica `pan`, `tilt` e `zoom` com `applyConstraints()`;
- mantém posição por `getSettings()`;
- presets locais, Home, Parar e velocidade;
- não mostra controles quando a câmera não expõe as capacidades.

### 3.2 NDI

Implementado localmente:

- bridge Rust `castdeck-ndi` com o comando `ptz`;
- receiver NDI dedicado ao controle;
- detecção com `NDIlib_recv_ptz_is_supported`;
- comandos de pan/tilt, zoom, presets, Home e Parar;
- API local `GET/POST /api/ndi/ptz/:key`;
- HUD lista fontes NDI quando entram nos bastidores.

Limitação: ainda não foi validado com uma câmera NDI PTZ física. O teste com fonte NDI sintética apresentou instabilidade no servidor e precisa ser investigado antes de produção.

### 3.5 Aprendizados do VDO.Ninja

O VDO.Ninja usa PTZ UVC do navegador (`getCapabilities`/`applyConstraints`) via canal remoto; não implementa ONVIF. Aproveitamos o modelo normalizado, passos, modo fino, inversão, presets, foco/autofoco, recuperação de câmera e aviso de aba remota oculta. O backend ONVIF continua sendo o caminho para a câmera 4K do cliente.

### 3.4 ONVIF

Implementado localmente em 1.4.8 para câmeras USB cujo vídeo e controle são separados:

- configuração por fonte: IP/host, porta, usuário e senha;
- teste de conexão e descoberta de perfis;
- cliente ONVIF no servidor local, não no navegador;
- autenticação WS-Security UsernameToken;
- perfis, AbsoluteMove, Stop e Home;
- HUD com driver `PTZ ONVIF` e botão de configuração;
- vídeo continua vindo pelo UVC/USB; o controle vai pela rede;
- configuração salva localmente por fonte.

1.5.0: descoberta WS-Discovery, HTTPS self-signed, WS-Security digest/text + HTTP Digest/Basic, GetStatus periódico e reconexão com status no HUD. O painel ONVIF é um diálogo com backdrop/Escape; presets têm Salvar/Limpar e estado ativo; o direcional usa ContinuousMove; a URL PTZ é validada contra o host configurado.

Ainda não foi validado com uma câmera ONVIF real.

### 3.3 Câmera remota

Proposta em aprovação. O caminho físico usa o modo Câmera remota existente:

- `public/js/cam.js` passa a anunciar `pan`/`tilt` em `REMOTE_CTL`;
- `capsSnapshot()` e `ctlSnapshot()` incluem os novos eixos;
- `acceptedCtl()` valida os valores contra as capacidades do remetente;
- `applyCtl()` aplica no `MediaStreamTrack` local;
- o host envia patches de câmera pelo signaling existente;
- o HUD ganha um driver **Remoto** e lista câmeras remotas.

Não é necessário endpoint novo no servidor.

---

## 4. HUD flutuante

Implementado localmente:

- painel arrastável e redimensionável;
- preview, tally PGM/PVW;
- pan/tilt por botões e por arraste no preview;
- zoom por roda, slider e botões;
- velocidade;
- presets 1–8;
- Home e Parar;
- posição/tamanho restaurados;
- modo de teclado armado.

Pendente: snap de cantos, opacidade, Document Picture-in-Picture.

---

## 5. Atalhos

Implementado:

- setas para pan/tilt;
- `+`/`-` para zoom;
- `1`–`8` para presets;
- `Shift+1`–`8` para salvar;
- `Home` e `Esc`;
- modo armado para não conflitar com os atalhos da mesa;
- parada ao perder foco, trocar de câmera ou fechar o HUD.

Pendente: tela de perfil de atalhos configurável.

---

## 6. MIDI

Implementado:

- Web MIDI com permissão explícita;
- hot-plug;
- learn por ação;
- CC absoluto e notas;
- encoder relativo com seletor **Abs/Rel** por eixo;
- mapeamentos de pan/tilt/zoom, presets, Home e Parar;
- persistência;
- pânico/parada.

Pendente: feedback de LED/fader motorizado, importação/exportação de perfis e SysEx/NRPN.

---

## 7. PTZ na câmera remota — decisão

### 7.1 Caminho A — físico no remetente

Cenário: o link **Câmera remota** é aberto em um PC com uma câmera PTZ USB/UVC.

Fluxo:

```text
HUD host
  → sig.send({ type:'control', action:'camera', data:{ patch:{ pan, tilt, zoom } } })
  → cam.js acceptedCtl()
  → C.video.applyConstraints()
  → cam.js pushState()
  → HUD atualiza posição
```

Vantagens:

- usa a infraestrutura existente;
- controle físico real;
- sem servidor novo;
- funciona também com uma webcam UVC comum que exponha zoom.

Limitação:

- celular sem hardware PTZ não ganha pan/tilt físico;
- a câmera remota precisa expor as capacidades ao navegador.

### 7.2 Caminho B — digital para qualquer câmera

Se o objetivo for pan/tilt/zoom em **qualquer celular**, há duas opções:

| Opção | Onde processa | Vantagem | Limite |
|---|---|---|---|
| Digital no host | PC do estúdio | funciona com qualquer fonte; menor custo no celular | não move a câmera; altera o enquadramento no host |
| Digital no remetente | celular/PC remetente | enquadramento chega pronto ao host | CPU/bateria no celular; exige canvas/crop |
| Físico no remetente | PC com PTZ UVC | movimento real | só com hardware compatível |

Recomendação: **não misturar** os conceitos na interface. O HUD deve mostrar:

- `PTZ remoto físico`;
- `Digital (host)`;
- `Sem PTZ`.

O caminho A é o MVP. O caminho B deve ser uma fase separada depois da validação.

---

### 7.3 Digital no host — implementado

O PTZ digital em celulares remotos roda **no PC do host**, sem enviar comandos ao celular:

- usa o `s.adjust` existente (`fit`, `zoom`, `x`, `y`, `crop`);
- o HUD ativa **Digital (host)** quando a câmera remota não tem pan/tilt físico;
- pan/tilt/zoom atualizam o compositor por `setSourceAdjust()`;
- `brand.sourceAdjust` persiste o enquadramento;
- o preview do HUD usa canvas com `drawFramed()`;
- o smartphone não processa recorte, não gasta bateria extra e não recebe controle PTZ;
- `Home` volta x/y para zero e zoom para 1;
- PTZ físico continua tendo prioridade; o digital não aparece para câmera remota com pan/tilt físico.

Limite: zoom digital máximo de 3× no ajuste atual; acima de ~2× em 1080p a perda de detalhe fica visível.

## 8. Mudanças previstas — caminho A

Arquivos:

- `public/js/cam.js`;
- `public/js/studio/camera-panel.js`;
- `public/js/studio/ptz-hud.js`;
- `public/js/studio/studio.js`.

Sem alterações em `server/` para o caminho A.

Requisitos:

- HUD passa a listar `s.remoteCam`;
- o driver remoto lê `S.guests.get(ownerId).state.camCaps/camCtl`;
- comandos vão por `sig.send({ type: 'control', action: 'camera', ... })`;
- validação no remetente contra `getCapabilities()`;
- estado volta após cada ajuste;
- parada ao desconectar/remover a câmera;
- presets remotos no host.

---

## 9. Critérios de aceite — caminho A

- [x] HUD lista câmeras remotas de PC e celular;
- [x] PC remoto com câmera PTZ UVC responde a pan/tilt/zoom (validado com capacidades simuladas);
- [ ] celular sem PTZ mostra `Sem PTZ`, sem controles falsos;
- [x] posição retorna no estado do convidado;
- [ ] presets remotos funcionam;
- [ ] perder conexão/remover câmera para o movimento;
- [x] comandos fora das capacidades são rejeitados;
- [ ] painel Câmeras, PGM e áudio não regridem;
- [ ] teste com PC + câmera PTZ e com celular sem PTZ.

---

## 10. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Celular não expõe pan/tilt | Alto | não mostrar controles; avaliar digital separadamente |
| Câmera remota usa VISCA serial | Alto | modo remoto não acessa serial; driver nativo futuro |
| Comando remoto no ar por acidente | Alto | confirmação, parada e modo armado |
| Latência do signaling | Médio | coalescer patches e limitar taxa |
| Estado remoto atrasado | Médio | feedback do remetente e timeout |
| Celular com CPU limitada no digital | Alto | não implementar digital no remetente sem teste |
| Regressão no modo Câmera remota | Alto | testes de vídeo/áudio/mute/tally |

---

## 11. Fases

1. **Aprovação** do escopo A ou A+B.
2. **Caminho A:** anunciar pan/tilt no remetente + driver remoto no HUD.
3. **Testes físicos:** PC com PTZ UVC e celular sem PTZ.
4. **Opcional:** digital no host para qualquer câmera.
5. **Opcional:** digital no remetente para celular.
6. **Polimento:** presets, atalhos, MIDI, i18n e documentação.

---

## 12. Questões abertas

1. O cenário principal é um **PC com câmera PTZ** usando o link de câmera remota? *(recomendado para o caminho A)*
2. Também é necessário pan/tilt/zoom **digital** em celular sem hardware PTZ?
3. Se sim, o digital deve rodar no host ou no remetente?
4. Presets remotos devem ficar no host ou na câmera remota?
5. Qual prioridade para uma câmera remota que só expõe zoom UVC, sem pan/tilt?

---

## 13. Referências internas

- [`public/js/cam.js`](../../public/js/cam.js) — remetente da câmera remota.
- [`public/js/studio/camera-panel.js`](../../public/js/studio/camera-panel.js) — controles remotos existentes.
- [`public/js/studio/ptz-hud.js`](../../public/js/studio/ptz-hud.js) — HUD atual.
- [`public/js/studio/studio.js`](../../public/js/studio/studio.js) — integração e signaling.
- [`native/ndi-bridge/`](../../native/ndi-bridge/) — bridge NDI.
- [`docs/designs/NDI-EGM.md`](NDI-EGM.md) — arquitetura NDI.

## 14. Referências externas

- MediaStreamTrack capabilities: <https://developer.mozilla.org/docs/Web/API/MediaStreamTrack/getCapabilities>
- MediaStreamTrack applyConstraints: <https://developer.mozilla.org/docs/Web/API/MediaStreamTrack/applyConstraints>
- NDI SDK — receiver/PTZ: <https://docs.ndi.video/all/developing-with-ndi/advanced-sdk/ndi-sdk-review/receiving.md>
- Web MIDI API: <https://developer.mozilla.org/docs/Web/API/Web_MIDI_API>
