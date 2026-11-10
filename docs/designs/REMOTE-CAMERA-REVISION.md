# EGM — Revisão do “Celular como câmera”

> **Status:** implementado no app principal; build local ainda não publicado.

## O que melhorou

- Seletor **Qualidade** no modal: Full HD 1080p (padrão) ou HD 720p; o QR/link levam `?q=` para o celular.
- Bitrate de envio elevado: **9 Mbps em 1080p** e **5 Mbps em 720p** (30 fps).
- Encoder com `maintain-resolution`: a rede pode reduzir fps, mas não troca a resolução no meio da transmissão.
- Layout dos cards equalizado; controles de qualidade/rede ficam em uma barra própria acima dos QR Codes.

- O modal mostra o **status ao vivo** dos celulares conectados.
- Quando a câmera entra, aparece o nome e o estado: conectada, no palco ou no ar.
- Botão **Pôr no palco** para a câmera recém-conectada.
- Botão **Atualizar links** para reler o túnel e a rede local.
- Enquanto o túnel está baixando/abrindo, o modal consulta o `/system` e atualiza o link sozinho.
- Se o PC tem mais de uma rede, o operador escolhe **Rede deste PC** e o QR/link acompanham.
- Cada card ganhou **Copiar link** e **Abrir** (teste no próprio PC).
- Instruções mais curtas: certificado local, microfone desligado e tela ligada.

## Fluxo

1. Operador abre **＋ Câmera → Celular ou outro aparelho**.
2. Escolhe a rede local ou Internet.
3. Escaneia o QR.
4. O modal mostra **Aguardando o celular…**.
5. Ao conectar, mostra o nome e permite pôr no palco.

## Critérios de teste

- [x] Modal abre com dois cards.
- [x] QR local gerado.
- [x] Botão Atualizar e select de rede presentes.
- [x] Status “Aguardando” inicial.
- [x] Status “celular conectado / no palco” com convidado simulado.
- [x] Sem erros de runtime.
- [x] Qualidade 1080/720 muda a URL e o QR.
- [x] Bitrate alto + maintain-resolution configurado no sender.
- [ ] Teste real com celular na mesma rede.
- [ ] Teste real pelo túnel de Internet.

## Próximo

- Testar com iPhone e Android reais.
- Se necessário, adicionar token de acesso ao link de câmera (hoje o link é quem autoriza).
