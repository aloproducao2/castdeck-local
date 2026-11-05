# Deploy do CastDeck Intercom

Este diretório contém os modelos de produção. **Aplicados na VPS em 2026-11-04.**

## Pré-requisitos

- Binário Linux x64 empacotado com `pkg` (`dist/castdeck-intercom-linux`).
- Nginx com o `map $http_upgrade $connection_upgrade` no contexto `http`.
- TURN disponível (a VPS já tem `coturn` e `/api/turn`).

## Passos

1. Copiar `public/` para `/opt/castdeck/intercom/public`.
2. Copiar o binário para `/opt/castdeck/intercom/castdeck-intercom`.
3. Copiar `castdeck-intercom.service` para `/etc/systemd/system/`.
4. `systemctl daemon-reload && systemctl enable --now castdeck-intercom`.
5. Adicionar `nginx-location.conf` ao server do site.
6. `nginx -t && systemctl reload nginx`.
7. Testar `https://cast.flue.live/intercom/`.
8. Só então trocar o item "Intercom" do menu do site para `/intercom/`.

## Variáveis

- `TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD`: TURN direto; ou
- `TURN_CREDS_URL=http://127.0.0.1:8099/api/turn`: credenciais temporárias do coturn.

## Rollback

- `systemctl stop castdeck-intercom`
- remover o bloco `location /intercom/` e recarregar o Nginx.
- o site estático continua intacto.
