# Privacidade

## O aplicativo

O CastDeck Local foi projetado para rodar no seu aparelho:

- vídeo, áudio, câmeras, convidados, gravações, chaves de transmissão e configurações ficam no seu
  computador/celular;
- não há conta, login central ou envio de vídeo para servidores do CastDeck;
- os dados ficam em `%LOCALAPPDATA%\CastDeck` (Windows), `~/Library/Application Support/CastDeck` (macOS) ou
  `~/.local/share/CastDeck` (Linux); gravações em `Vídeos/CastDeck`;
- logs locais ficam na pasta de dados e servem para diagnóstico.

## Atualizações

O aplicativo consulta `https://cast.flue.live` para verificar versões e baixar atualizações. Essa consulta
pode registrar dados técnicos do servidor (endereço IP, user-agent) como qualquer acesso HTTP. Nenhum
conteúdo do estúdio, vídeo, áudio ou chave de transmissão é enviado.

## Site

O site `cast.flue.live` pode usar analytics (por exemplo, Google) para métricas de visita. Consulte os
avisos de cookies/privacidade no próprio site. O código-fonte do CastDeck não contém dados de analytics do
site.

## Convidados e transmissão

Quando você convida alguém ou transmite, o tráfego vai para os serviços que **você** escolher (YouTube,
Twitch, serviços TURN/Cloudflare etc.). As políticas desses serviços se aplicam. O CastDeck não controla
esses destinos.

## Dados de terceiros

Não use o CastDeck para tratar dados pessoais sem base legal e consentimento adequados. Você é o
controlador dos dados do seu estúdio e das suas gravações.

## Direitos do usuário (LGPD)

Você pode acessar, corrigir, exportar ou apagar os dados locais diretamente nas pastas do aplicativo.
Desinstalar com a opção “manter dados” preserva os dados; a opção de apagar remove os dados do app.

## Contato

Dúvidas de privacidade: **https://cast.flue.live**.
