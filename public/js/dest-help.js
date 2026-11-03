// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// "Onde pego a chave?": passo a passo por plataforma, link direto para a página da chave e guia em PDF.
// Dados puros (sem DOM) — também usados por build/make-key-guides.mjs para gerar os PDFs em public/guias/.
// Os textos ficam em português; a tradução (en/es) vem do dicionário public/js/i18n/strings.json.

export const KEY_HELP = {
  youtube: {
    link: 'https://studio.youtube.com/',
    linkLabel: 'YouTube Studio',
    steps: [
      'Entre no YouTube Studio com a conta do canal.',
      'Clique em Criar → Entrar ao vivo (na primeira vez o YouTube pode levar até 24 horas para liberar as lives).',
      'Na aba Stream, copie a “Chave de transmissão”.',
      'A URL do servidor já vem preenchida no CastDeck (rtmp://a.rtmp.youtube.com/live2).',
    ],
    notes: ['A chave padrão do YouTube é reutilizável: você salva uma vez e usa sempre.'],
  },
  facebook: {
    link: 'https://www.facebook.com/live/producer',
    linkLabel: 'Facebook Live Producer',
    steps: [
      'Abra o Live Producer do Facebook no computador.',
      'Escolha onde publicar (seu perfil, página ou grupo).',
      'Em “Configuração do vídeo”, selecione “Software de streaming”.',
      'Copie a “Chave de transmissão” (e a URL do servidor, se for diferente da que já vem no CastDeck).',
    ],
    notes: ['Marque “Usar chave de transmissão persistente” para não precisar trocar a chave a cada live.'],
  },
  twitch: {
    link: 'https://dashboard.twitch.tv/settings/stream',
    linkLabel: 'Painel da Twitch → Configurações → Transmissão',
    steps: [
      'Entre no painel de criador da Twitch.',
      'Vá em Configurações → Transmissão.',
      'Em “Chave de transmissão principal”, clique em Copiar.',
      'A URL do servidor já vem preenchida no CastDeck (rtmp://live.twitch.tv/app).',
    ],
    notes: ['Se a chave vazar, use “Redefinir” na Twitch e cole a nova aqui.'],
  },
  kick: {
    link: 'https://kick.com/dashboard/settings/stream',
    linkLabel: 'Painel do Kick → Stream',
    steps: [
      'Entre no painel do Kick (Dashboard).',
      'Vá em Configurações → Stream.',
      'Copie a “Stream URL” e a “Stream Key”.',
      'Cole a URL e a chave aqui no CastDeck.',
    ],
    notes: [],
  },
  instagram: {
    link: 'https://www.instagram.com/',
    linkLabel: 'Instagram no navegador do computador',
    steps: [
      'Abra o Instagram no navegador do computador (conta profissional: criador ou empresa).',
      'Clique em Criar (+) → Vídeo ao vivo.',
      'Dê um título, escolha o público e clique em Avançar.',
      'Copie a “URL de transmissão” e a “Chave de transmissão” e cole aqui.',
      'Inicie a transmissão no CastDeck, volte para a aba do Instagram e clique em “Ao vivo” quando a prévia aparecer.',
    ],
    notes: ['A chave do Instagram muda a cada live: atualize o destino antes de cada transmissão.', 'Formato vertical 9:16 (720×1280). Deixe a aba do Instagram aberta durante a live.'],
  },
  tiktok: {
    link: 'https://livecenter.tiktok.com/producer',
    linkLabel: 'TikTok LIVE Center → Producer',
    steps: [
      'Abra o TikTok LIVE Center no computador e entre na sua conta.',
      'Preencha título e categoria da live.',
      'Clique em “Salvar e ir para o LIVE” (Save & Go LIVE).',
      'Em Configurações de transmissão, copie a “URL do servidor” e a “Chave de transmissão” e cole aqui.',
    ],
    notes: ['O TikTok só libera a chave para contas elegíveis (normalmente a partir de 1.000 seguidores).', 'A chave do TikTok muda a cada live: atualize o destino antes de cada transmissão.'],
  },
  linkedin: {
    link: 'https://www.linkedin.com/feed/',
    linkLabel: 'LinkedIn → Evento ao vivo',
    steps: [
      'No LinkedIn, clique em Evento → Criar evento.',
      'Escolha o formato LinkedIn Live e, como ferramenta, “Transmissão personalizada (RTMP)”.',
      'Depois de criar o evento, abra o painel de transmissão dele.',
      'Copie a “URL do stream” e a “Chave do stream” e cole aqui.',
    ],
    notes: ['O LinkedIn Live precisa estar liberado no seu perfil ou página.'],
  },
  x: {
    link: 'https://studio.x.com/producer',
    linkLabel: 'X Media Studio → Producer',
    steps: [
      'Abra o Media Studio do X (Producer) no computador.',
      'Em Fontes, clique em “Criar fonte”, escolha RTMP e a região mais próxima.',
      'Em Transmissões, crie uma transmissão usando essa fonte.',
      'Copie a URL RTMP e a chave da fonte e cole aqui.',
    ],
    notes: ['Transmitir por RTMP no X normalmente exige assinatura Premium.'],
  },
  custom: {
    link: '',
    linkLabel: '',
    steps: [
      'Use para qualquer servidor RTMP/RTMPS: outra plataforma, servidor próprio ou um encoder.',
      'Cole a URL do servidor (começa com rtmp:// ou rtmps://) e a chave fornecida pelo serviço.',
    ],
    notes: [],
  },
};

// PDFs gerados por build/make-key-guides.mjs (pt/en/es). No app Android o WebView não abre PDF:
// usa a cópia publicada no site, que o navegador do celular abre direto.
const PDF_BASE = typeof navigator !== 'undefined' && /CastDeckAndroid/.test(navigator.userAgent) ? 'https://cast.flue.live' : '';
export const guidePdf = (plat, lang = 'pt') => (KEY_HELP[plat]?.link ? `${PDF_BASE}/guias/${plat}-${['en', 'es'].includes(lang) ? lang : 'pt'}.pdf` : '');
