# Seu primeiro plugin — guia rápido

> Vale para o CastDeck **2.0+**. O catálogo oficial é o repositório
> **`castdeck-local-plugins`**; plugins são **gratuitos**.

## 1. O que é um plugin

Uma pasta com `plugin.json` (manifesto) e, se precisar de lógica, um `src/index.js`. Dois tipos:

| Tipo | Quando usar | Precisa de código? |
|---|---|---|
| **declarativo** (`"tier": "declarative"`) | reagir a chat/palco/cena com ações prontas (aviso na tela, resposta no chat, mídia) | **não** |
| **código** (`"tier": "code"`) | integração com API, regra complexa, configuração própria | sim (roda em processo separado) |

## 2. Plugin declarativo em 3 minutos

`meu-plugin/plugin.json`:

```json
{
  "id": "com.voce.boas-vindas",
  "name": "Boas-vindas",
  "description": "Responde quem chega no chat",
  "version": "1.0.0",
  "author": { "name": "Seu Nome" },
  "license": "MIT",
  "engines": { "castdeck": ">=2.0.0", "api": 1 },
  "tier": "declarative",
  "permissions": ["events:chat", "chat:send", "overlay:show"],
  "rules": [
    {
      "on": "chat.regex",
      "padrao": "^!(oi|ola)\\b",
      "cooldownSeg": 30,
      "do": [
        { "type": "chat.send", "texto": "Oi, {{usuario}}!" },
        { "type": "overlay.show", "titulo": "Bem-vindo", "texto": "{{usuario}} chegou", "cor": "#7c5cff", "segundos": 6 }
      ]
    }
  ]
}
```

Gatilhos: `chat.comando`, `chat.regex`, `chat.contem`, `doacao`, `stage.entrou`, `stage.saiu`, `scene.mudou`,
`live.iniciou`, `live.encerrou`, `gravacao.salva`.
Ações: `chat.send`, `overlay.show`, `overlay.hide`, `media.play`, `sound.play`, `http.request`, `panel.open`.
Variáveis: `{{usuario}}`, `{{texto}}`, `{{arg1}}`, `{{arg2}}`, `{{rede}}`, `{{cena}}`, `{{titulo}}`.

## 3. Plugin com código

`meu-plugin/plugin.json` (trecho):

```json
{ "tier": "code", "entry": "src/index.js",
  "permissions": ["events:stage", "overlay:show", "network:https://api.minhaescola.com"] }
```

`meu-plugin/src/index.js`:

```js
export default function activate(castdeck) {
  castdeck.events.on('stage', async (e) => {
    if (e.acao !== 'entrou') return;
    const r = await castdeck.http.post('https://api.minhaescola.com/presenca', { quem: e.fonteNome });
    castdeck.log('presença enviada: ' + r.result.status);
    castdeck.overlay.show({ titulo: 'Presença', texto: `${e.fonteNome} entrou` }, 6);
  });
}
```

API disponível: `castdeck.events.on`, `castdeck.overlay.show/hide`, `castdeck.chat.send`,
`castdeck.http.get/post` (só nos `network:` declarados), `castdeck.settings.get/save`, `castdeck.sound.play`,
`castdeck.panel.open`, `castdeck.log`.

**Painel próprio (opcional):** `ui/panel.html` dentro de um iframe isolado; fale com o app por
`postMessage({ type: 'castdeck-plugin', id, method: 'settings.get' | 'settings.save', params })` e receba
`{ type: 'castdeck-plugin-resposta', id, result, error }`.

## 4. Testar

1. Ajustes → **Plugins** → *Instalar do arquivo* (empacote a pasta em `.cdplug`/`.zip`) ou
   `POST /api/plugins/install` com `{ "pasta": "plugins/meu-plugin" }` em desenvolvimento.
2. Ative e **aprove as permissões** (aparecem em português).
3. Dispare um evento (mande a mensagem no chat conectado, ou entre no palco) e veja o **Log** do plugin.

## 5. Regras de segurança (o app recusa se violar)

- sem `.exe`, `.dll`, `.node`, `.bat`, `.ps1` no pacote;
- sem `child_process`, `fs`, `net`, `http` e afins no código do plugin (use `castdeck.http`);
- sem `eval` / `new Function`;
- rede só nos endereços declarados (`network:http://192.168.0.50`, `network:https://api.exemplo.com`);
- `license` SPDX e `engines.castdeck` compatível;
- pacote até 20 MB.

## 6. Publicar no catálogo

O catálogo é servido em **https://cast.flue.live/plugins/index.json** (índice **assinado** com Ed25519). O app confere a assinatura antes de instalar; índice adulterado é recusado e o app cai para o cache offline.

PR no `castdeck-local-plugins` → CI valida, empacota e assina o índice → aparece na aba Plugins de todos.
