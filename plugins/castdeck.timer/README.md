# Cronômetro no ar (`castdeck.timer`)

Contagem regressiva **na tela** (e na gravação) para intervalo, BRB, tempo de prova ou qualquer pausa com
hora de voltar. Não depende de outro programa: o número é desenhado pelo próprio CastDeck, então aparece
exatamente no que o público vê.

## Como usar

- **Painel** (aba Plugins → Cronômetro → *Configurar*): escolha 1, 3, 5 ou 10 minutos, ou digite outro tempo
  (`7`, `2:30`, `90s`). Tem **Pausar**, **Continuar**, **Parar e limpar** e **Mostrar na tela**.
- **Chat**: `!timer 5` (minutos), `!timer 1:30`, `!timer 90s`, `!timer pausar`, `!timer continuar`,
  `!timer parar`, `!tempo` (responde quanto falta).
- O cronômetro continua rodando mesmo se você fechar o painel; se o plugin reiniciar, ele retoma de onde parou.

## Configuração

| Campo | O que faz |
|---|---|
| Título | Texto pequeno acima do relógio (ex.: “Voltamos em”) |
| Cor | Cor do aviso (`#7c5cff` por padrão) |
| Avisar no chat | Envia “tempo encerrado” no chat do estúdio quando chega a zero |
| Texto da tela ao terminar | Mensagem final (ex.: “Voltamos!”) que fica 8 segundos |

## Como ele funciona por dentro (para quem vai fazer o seu)

- Permissões: `events:chat` (ler comandos), `overlay:show` (desenhar o relógio), `chat:send` (responder) e
  `storage:own` (guardar o estado no próprio `settings.json`).
- O aviso usa `castdeck.overlay.show({ titulo, texto, cor, persistente: true })`: **persistente** fica na tela
  até o plugin mandar esconder — é o mesmo recurso que permite atualizar um relógio a cada segundo sem piscar.
- Os botões do painel chegam ao plugin como evento `panel`:
  `castdeck.events.on('panel', ({ nome, dados }) => ...)`. Para o painel saber o tempo, o plugin grava
  `estado` em `castdeck.settings.save({ estado: { restante, total, rodando } })` (a cada 5 s e a cada mudança).

## Limites

- O tempo máximo é 180 minutos e o mínimo 15 segundos.
- Um cronômetro por vez (o novo substitui o anterior).
