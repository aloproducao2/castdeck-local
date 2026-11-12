# Estudo — câmeras UVC e placas de captura USB no Android

> Documento de viabilidade e arquitetura. Nada foi implementado nesta etapa.
> O objetivo é permitir webcams e placas de captura USB no CastDeck Android usando
> o mesmo estúdio, compositor, gravação e transmissão já existentes.

---

## 1. Conclusão executiva

É tecnicamente possível, mas **não pelo `getUserMedia` do WebView**.

O CastDeck Android atual é um WebView que carrega o estúdio e captura câmera/microfone
pelo navegador. O WebView do Android não enumera webcams USB como câmera do sistema.
Para UVC é necessário um caminho nativo:

```text
Webcam/placa UVC
      │ USB OTG
      ▼
Captura nativa Android (UVC)
      │ vídeo + áudio
      ▼
Ponte local (HTTP/WebSocket)
      │
      ▼
WebView / estúdio / compositor / mixer
      │
      ▼
Gravação, transmissão RTMP e Multigravação já existentes
```

A biblioteca mais adequada para o spike é a **AUSBC / AndroidUSBCamera 3.x**:
Apache-2.0, suporte a Android 4.4+, múltiplas câmeras, preview, captura offscreen,
formatos MJPEG/YUY2 e captura de áudio UAC/PCM/AAC, além de callbacks de H.264/AAC.
Ela usa a pilha UVCCamera/libuvc e não exige root.

**Não é correto prometer “qualquer webcam ou placa”.** O suporte real depende de:

- a câmera ser UVC padrão;
- o aparelho Android ter USB host/OTG e permitir transferências necessárias;
- a alimentação do dispositivo;
- o formato suportado (MJPEG/YUY2, resolução e fps);
- áudio UAC separado, quando existir;
- limitações do fabricante do celular/tablet.

O compromisso correto é: **câmeras e placas UVC padrão, com vídeo MJPEG/YUY2 e áudio
UAC quando o dispositivo expuser esses recursos**.

---

## 2. Situação atual do Android

O app Android tem uma arquitetura própria, diferente do desktop:

- `MainActivity` cria um WebView;
- o WebView carrega o estúdio servido pelo `LocalServer` embutido;
- `ServerService` mantém o servidor e a captura em primeiro plano;
- `Broadcast` recebe o WebM do estúdio, demuxa, decodifica e recodifica para RTMP;
- câmera e microfone do aparelho chegam ao estúdio por `getUserMedia`;
- o manifesto já declara `android.hardware.usb.host` como opcional;
- o app já tem permissões de câmera, microfone, foreground service e wake lock.

O que falta:

- enumerar dispositivos USB de classe vídeo;
- pedir permissão USB;
- abrir o dispositivo UVC;
- transformar os quadros em uma fonte que o WebView consiga exibir;
- transportar o áudio UAC para o mixer;
- integrar isso à UI de Fontes e ao ciclo de vida do serviço.

### 2.1 Por que `getUserMedia` não resolve

O WebView não é um app de câmera nativo com um provider UVC próprio. Ele depende do
Camera2/HAL do sistema. Alguns aparelhos Android 9+ têm suporte a câmera externa no
Camera2, mas isso é **dependente do fabricante**, não é uniforme e não garante que o
WebView enumerará a câmera.

Além disso, mesmo que a câmera externa aparecesse no Camera2, o comportamento varia
entre aparelhos e versões. Não é uma base confiável para “qualquer webcam UVC”.

---

## 3. Alternativas estudadas

| Alternativa | Como funcionaria | Veredito |
|---|---|---|
| `getUserMedia` no WebView | Usar a câmera como no desktop | Não funciona para UVC na maioria dos aparelhos |
| Camera2 com câmera externa | Camera2 HAL do Android 9+ | Dependente do OEM; não garante WebView |
| AUSBC + MJPEG local | Nativo captura, WebView exibe stream MJPEG | **Melhor MVP** |
| AUSBC + H.264/WebRTC | Nativo entrega H.264/AAC ao WebView | Melhor latência; mais complexo |
| libuvc custom | JNI próprio sobre libusb | Controle total; muito mais trabalho |
| UVCCamera antigo | Biblioteca histórica | Mantida por terceiros; optar por AUSBC |
| Câmera IP/RTSP | Não é USB | Já é outro caminho de ingest |

### 3.1 AUSBC — por que é a primeira opção

A AUSBC 3.x oferece:

- abertura de múltiplas câmeras;
- preview em 480p/720p/1080p;
- renderização offscreen;
- captura de imagem, vídeo, YUV/RGBA/PCM/H.264/AAC;
- fonte de áudio do sistema ou UAC;
- callbacks de dados codificados;
- ABIs arm64-v8a, armeabi-v7a, x86 e x86_64;
- licença Apache-2.0.

Referências:

- [README da AUSBC](https://github.com/jiangdongguo/AndroidUSBCamera)
- [Documentação/FAQ da AUSBC](https://github.com/jiangdongguo/AndroidUSBCamera/blob/master/FAQ.md)

Riscos da dependência:

- projeto de terceiro, com manutenção variável;
- distribuição via JitPack;
- adiciona bibliotecas nativas e aumenta o APK;
- precisa de spike real em aparelhos, não apenas compilação.

---

## 4. Arquitetura recomendada

### 4.1 Visão geral

```text
┌─────────────────────────────────────────────────────────────┐
│ App Android                                                 │
│                                                             │
│  WebView (estúdio atual)                                    │
│     │  fonte "Câmera USB" (imagem/MJPEG)                    │
│     │  áudio UVC (PCM via WebSocket)                        │
│     ▼                                                       │
│  LocalServer (NanoHTTPD)                                    │
│     ├─ /uvc/devices                                         │
│     ├─ /uvc/open                                            │
│     ├─ /uvc/stream/<id>  (MJPEG multipart)                  │
│     └─ /uvc/audio/<id>   (WebSocket PCM)                    │
│                                                             │
│  UvcManager / UvcCameraService                              │
│     ├─ UsbManager + permissão                              │
│     ├─ AUSBC CameraUVC                                     │
│     ├─ callback de vídeo                                    │
│     └─ callback de áudio UAC                               │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Vídeo no MVP — MJPEG local

Fluxo:

1. `UvcManager` enumera dispositivos USB de vídeo.
2. Pede permissão ao Android.
3. Abre a câmera pela AUSBC.
4. Recebe quadros (NV21/RGBA ou MJPEG).
5. Publica um stream HTTP `multipart/x-mixed-replace` em `127.0.0.1`.
6. O WebView adiciona uma fonte `uvc` com um `<img src="/uvc/stream/...">`.
7. O compositor desenha a imagem no canvas do programa.
8. Gravação/transmissão continuam iguais: o canvas já contém a fonte.

Por que MJPEG:

- o WebView exibe sem plugin;
- funciona em versões antigas do Android;
- não exige WebRTC nem MSE;
- a maioria das webcams UVC oferece MJPEG;
- é o caminho de menor integração.

Limitações:

- taxa de quadros e latência dependem do dispositivo;
- se a câmera só entregar YUY2, será necessário converter para JPEG ou outro formato;
- 1080p30 pode pesar no celular;
- MJPEG não carrega áudio.

### 4.3 Áudio UAC

O áudio da placa de captura normalmente é USB Audio Class, não UVC. A AUSBC declara
suporte a áudio do sistema/UAC e a PCM/AAC.

Fluxo:

1. Callback de áudio nativo recebe PCM.
2. WebSocket local envia PCM para o WebView.
3. Um `AudioWorklet` no estúdio cria um `MediaStreamTrack` de áudio.
4. O mixer adiciona esse track como um canal normal.
5. O canal pode ir ao Master, aos buses A–G e à Multigravação.

No MVP, é aceitável começar com vídeo UVC e usar o microfone do aparelho como áudio.
O áudio UAC deve ser a fase seguinte, porque exige teste com placas reais e tratamento
de rotas/eco.

### 4.4 Baixa latência — fase avançada

Para menor latência:

- AUSBC já pode fornecer H.264/AAC por callback;
- o nativo pode entregar H.264 por WebSocket;
- o WebView decodifica via WebCodecs (quando disponível) ou MSE;
- alternativa: publicar em um MediaMTX/WebRTC local e consumir via WHEP.

Isso não é necessário para validar a funcionalidade, mas é o caminho para uma câmera
UVC com latência de transmissão.

---

## 5. Integração com o código atual

### 5.1 Android

Adicionar:

- dependência AUSBC;
- plugin Kotlin se a versão 3.x exigir;
- `UvcManager` no `ServerService`;
- receptor de `USB_DEVICE_ATTACHED`/`DETACHED`;
- permissão USB;
- endpoints em `LocalServer`;
- `UsesFeature usb.host` já existe, mas revisar `USB_DEVICE_ATTACHED` no manifesto;
- serviço em primeiro plano para manter a captura com a tela apagada.

### 5.2 Web/estúdio

Adicionar uma nova fonte:

- `kind: 'uvc'`;
- `el` do tipo `<img>`/canvas para o MJPEG;
- ações de abrir, trocar resolução, fechar e reconectar;
- indicador de “USB” na miniatura;
- aviso quando o dispositivo for removido;
- integração com o seletor de fontes da Multigravação (a fonte UVC aparece como
  qualquer outra).

### 5.3 Regra de ouro

Não tentar abrir a mesma câmera no WebView e no nativo. O **UvcManager** é o único dono
do dispositivo USB; o WebView só consome o stream local.

---

## 6. Suporte real: o que funciona e o que não funciona

### 6.1 Deve funcionar

- webcams UVC padrão (Logitech, genéricas, etc.);
- placas de captura HDMI/USB que se apresentam como UVC;
- MJPEG em 720p/1080p quando o dispositivo oferecer;
- YUY2, com conversão;
- áudio UAC quando a placa expuser esse recurso;
- um dispositivo por vez no MVP;
- múltiplos dispositivos em fase posterior, com hub alimentado.

### 6.2 Não há garantia

- dispositivos com driver proprietário;
- dispositivos que só funcionam em USB 3.0 com requisitos específicos;
- placas com HDCP ou proteção de conteúdo;
- aparelhos Android sem USB host ou com restrição de OEM;
- cabos/adaptadores sem alimentação suficiente;
- captura de áudio quando o dispositivo não expõe UAC;
- múltiplas câmeras 1080p no mesmo hub sem largura/energia.

### 6.3 Requisitos de aparelho

- OTG/USB host;
- Android 8+ (o app já tem `minSdk 26`);
- arm64-v8a como alvo principal;
- adaptador OTG ou hub alimentado;
- armazenamento e bateria para captura contínua.

---

## 7. Desempenho e limites

| Cenário | Expectativa |
|---|---|
| 1 webcam UVC 720p30 MJPEG | Viável; latência de 100–300 ms |
| 1 webcam UVC 1080p30 MJPEG | Viável em aparelho médio/bom; testar |
| 1 placa de captura 1080p | Viável se UVC e energia adequada |
| 2 câmeras 1080p no mesmo hub | Arriscado; limitar para 1–2 |
| Áudio UAC + vídeo | Depende da placa e do aparelho |
| Multigravação com UVC | Mesma fonte de vídeo; áudio selecionável pelos buses |

O gargalo pode ser USB, não CPU. Uma webcam 1080p MJPEG pode consumir muita banda;
um hub sem alimentação derruba a conexão.

---

## 8. Fases de implementação

### Fase 0 — Spike obrigatório (2–4 dias)

- compilar a AUSBC no projeto;
- testar enumeração/permissão em 2–3 aparelhos;
- abrir Logitech C920/C270 e uma placa UVC genérica;
- medir MJPEG/YUY2, 720p e 1080p;
- testar áudio UAC;
- testar hotplug e tela apagada;
- confirmar consumo de CPU/RAM/bateria;
- verificar se o WebView exibe o endpoint MJPEG sem travar.

Sem esse spike, não prometer suporte.

### Fase 1 — MVP de vídeo UVC

- `UvcManager` + permissão USB;
- endpoints `/uvc/devices`, `/uvc/open`, `/uvc/stream`;
- fonte “Câmera USB” no estúdio;
- preview e PGM;
- fechar/reconectar;
- fallback claro quando o dispositivo não for UVC.

### Fase 2 — Áudio UAC

- callback PCM;
- WebSocket local;
- AudioWorklet;
- canal de áudio no mixer;
- envio para Master, buses e Multigravação.

### Fase 3 — Baixa latência e múltiplas câmeras

- H.264/AAC nativo;
- WebCodecs/WebRTC/MSE;
- seleção de múltiplas câmeras;
- limite por banda USB;
- preferências por dispositivo.

### Fase 4 — Acabamento

- hotplug confiável;
- reconexão;
- indicador de USB;
- DeX/tablet;
- testes de longa duração;
- documentação para o usuário.

---

## 9. Testes necessários

1. Webcam Logitech UVC.
2. Webcam genérica UVC.
3. Placa de captura HDMI UVC.
4. Aparelho Samsung com DeX.
5. Pixel/Android puro.
6. Aparelho Xiaomi/realme com restrição de USB.
7. Hub alimentado com duas câmeras.
8. Remover o cabo durante a transmissão.
9. Bloquear/desbloquear a tela.
10. Rodar 1 hora com captura + RTMP.
11. Testar áudio UAC e microfone do aparelho.
12. Testar Multigravação com a fonte UVC.

Métricas:

- fps real;
- latência;
- CPU/RAM;
- bateria/temperatura;
- perda de quadros;
- reconexão;
- áudio sincronizado.

---

## 10. Critérios de aceite

- conectar uma webcam UVC padrão e ela aparecer em **Fontes**;
- permissão USB solicitada uma vez e lembrada;
- preview e PGM funcionando;
- 720p30 estável no aparelho de referência;
- 1080p quando o dispositivo e o aparelho suportarem;
- remover/reconectar sem derrubar o app;
- captura continua com a tela apagada;
- áudio UAC no mixer, quando disponível;
- nenhum root;
- nenhum crash em dispositivo não compatível — apenas mensagem clara.

---

## 11. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| WebView não vê UVC | Não usar getUserMedia; ponte nativa |
| Biblioteca de terceiro | Fixar versão; fork se necessário |
| JitPack fora do ar | Vendorizar AAR/nativos no repositório |
| APK muito grande | ABI arm64 primeiro; excluir x86 |
| USB sem energia | Exigir hub alimentado; aviso na UI |
| Placa proprietária | Detectar e explicar; não prometer |
| Latência MJPEG | MVP aceitável; H264/WebRTC depois |
| Áudio UAC ausente | Fallback para microfone do aparelho |
| Hotplug | Receptor USB + reconexão |
| OEM restritivo | Matriz de aparelhos; mensagem específica |

---

## 12. Recomendação

1. Aprovar um **spike com AUSBC 3.x** em aparelho real, antes de integrar ao produto.
2. Começar por **vídeo UVC via MJPEG local**.
3. Deixar **áudio UAC** para a fase 2.
4. Não prometer “qualquer câmera”; prometer **UVC padrão** e documentar limites.
5. Só depois evoluir para H.264/WebRTC e múltiplas câmeras.

O caminho é viável e se encaixa na arquitetura atual, mas a palavra-chave é **spike com
hardware**. Sem testar webcam, placa e OTG reais, qualquer suporte seria apenas uma
suposição.
