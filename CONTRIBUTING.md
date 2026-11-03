# Contribuindo com o CastDeck

Obrigado pelo interesse! O CastDeck é distribuído sob **AGPL-3.0-only** e também sob uma
**licença comercial** (veja [NOTICE](NOTICE), [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) e
[CLA.md](CLA.md)). Para que o licenciamento duplo continue possível, toda contribuição precisa do CLA.

## Antes de contribuir

- Abra uma issue descrevendo o problema ou a ideia antes de mudanças grandes.
- Não inclua **chaves, senhas, dados de usuários, IPs de VPS, configurações internas de deploy ou
  informações da landing page** em issues, commits ou pull requests.
- Não copie código, imagens, modelos ou fontes de terceiros sem licença compatível e o aviso adequado.
- Mantenha a interface em português (pt-BR) e o app leve.
- Rode `node --check` nos arquivos alterados e os testes em `test/` quando aplicável.

## CLA (obrigatório para licenciamento duplo)

Ao enviar uma contribuição (código, documentação, imagens, traduções, testes ou outro material), você
concorda com o [CLA.md](CLA.md), que em resumo declara:

1. A contribuição é de sua autoria, ou você tem autorização para enviá-la.
2. Você a licencia ao projeto sob **AGPL-3.0-only**.
3. Você concede a **Miguel Kallemback / flue.live** uma licença mundial, perpétua, irrevogável,
   não exclusiva, gratuita e sublicenciável para usar, modificar, distribuir e **relicenciar** a
   contribuição, inclusive sob termos comerciais.
4. Você mantém os direitos autorais da sua contribuição.
5. A contribuição não contém segredos nem dados confidenciais.

Inclua no pull request a frase:

> “Li e concordo com o CLA do CastDeck (CLA.md) e licencio minha contribuição sob AGPL-3.0-only, com a
> licença de relicenciamento descrita acima.”

Pull requests sem essa declaração não podem ser aceitos enquanto o licenciamento duplo existir.

## Padrões técnicos

- Preserve os avisos SPDX/copyright nos arquivos.
- Não remova avisos de terceiros (`THIRD-PARTY-NOTICES.md`, `licenses/`).
- Novos componentes precisam de licença mapeada; o build deve falhar se faltar.
- Mudanças de UI devem seguir o design existente e testar desktop/mobile.
- Mudanças no build/release não podem incluir dados privados da VPS ou da landing page.

## Segurança

Vulnerabilidades devem ser reportadas em privado, conforme [SECURITY.md](SECURITY.md); não abra issue
pública com exploit.
