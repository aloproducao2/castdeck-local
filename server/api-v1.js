// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// API pública do CastDeck (v1) para integrações locais e de rede (Stream Deck, Home Assistant, Node-RED,
// scripts e agentes de IA). É uma fachada estável sobre as rotas internas usadas pelo estúdio.
//
// Autenticação: requisições de localhost são aceitas sem chave (o app é local). De outro computador é preciso
// enviar a chave em `Authorization: Bearer <chave>` ou `X-CastDeck-Key`. A chave fica nos ajustes do app
// (settings.apiKey) e pode ser fixada por CASTDECK_API_KEY.
import express from 'express';
import crypto from 'node:crypto';

const ACONTECIMENTOS = new Set(['overlay.show', 'overlay.hide', 'chat.send', 'scene.set', 'mixer.setVolume', 'mixer.mute', 'media.play', 'media.stop', 'stage.add', 'stage.remove']);

export function criarApiV1({ store, hub, plugins, appVersion, dataDir, log = console.log }) {
  const r = express.Router();
  r.use(express.json({ limit: '1mb' }));

  // chave: env > settings > gerada na primeira vez e guardada em memória + data/settings.json
  let chaveCache = '';
  const chave = () => {
    if (process.env.CASTDECK_API_KEY) return process.env.CASTDECK_API_KEY;
    if (chaveCache) return chaveCache;
    const atual = store.getSettings().apiKey;
    if (atual) {
      chaveCache = atual;
      return chaveCache;
    }
    chaveCache = 'cdk_' + crypto.randomBytes(24).toString('base64url');
    store.updateSettings({ apiKey: chaveCache });
    log('[api] chave da API gerada (veja em GET /api/v1 ou no arquivo de ajustes)');
    return chaveCache;
  };

  const ehLocal = (req) => {
    const ip = req.socket.remoteAddress || '';
    const loop = /^(::1|::ffff:127\.|127\.)/.test(ip);
    const h = req.headers;
    const atravessaProxy = !!(h['cf-connecting-ip'] || h['cf-ray'] || h['x-forwarded-for'] || h['x-forwarded-host']);
    return loop && !atravessaProxy;
  };

  const autenticado = (req) => {
    if (ehLocal(req)) return true;
    const cab = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const alt = String(req.headers['x-castdeck-key'] || '').trim();
    const esperada = chave();
    const igual = (a) => a.length === esperada.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(esperada));
    return (cab && igual(cab)) || (alt && igual(alt));
  };

  // CORS: ferramentas de browser (painéis, PWA local) e CORS liberado apenas com chave
  r.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'content-type, authorization, x-castdeck-key');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Vary', 'Origin');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!autenticado(req)) {
      return res.status(401).json({ erro: 'chave da API ausente ou inválida', comoUsar: 'Authorization: Bearer <chave> — pegue em GET /api/v1 (no próprio PC)' });
    }
    next();
  });

  const studies = () => (store.listStudios ? store.listStudios() : []);
  const studioOuErro = (req, res) => {
    const id = String(req.params.id || '');
    if (!id || !store.getStudio(id)) {
      res.status(404).json({ erro: 'estúdio não encontrado', id });
      return null;
    }
    return id;
  };

  // envia uma ação para o estúdio aberto (a UI executa; o app é quem manda no palco)
  const mandarAcao = (id, acao) => {
    const sala = hub.rooms.get(id);
    if (!sala?.host) return 0;
    hub.send(sala.host, { type: 'api', acao });
    return 1;
  };

  // ---------- info + descoberta ----------
  r.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      nome: 'CastDeck Local API',
      api: 1,
      versao: appVersion,
      docs: '/api/v1/openapi.json',
      guia: 'https://cast.flue.live/api.html',
      autenticacao: ehLocal(req) ? 'sem chave (localhost)' : 'Authorization: Bearer <chave>',
      chave: ehLocal(req) ? chave() : '(somente local)',
      endpoints: [
        'GET /api/v1/status',
        'GET /api/v1/studios',
        'GET /api/v1/studios/:id',
        'POST /api/v1/studios/:id/action',
        'GET /api/v1/events (SSE)',
        'GET /api/v1/openapi.json',
        'GET /api/plugins (plugins instalados)',
        'POST /api/plugins/:id/test',
      ],
    });
  });

  r.get('/openapi.json', (req, res) => {
    res.set('Cache-Control', 'no-store').json(openapi(appVersion));
  });

  // ---------- estado ----------
  r.get('/status', (req, res) => {
    const lista = studies();
    const ativos = [];
    for (const [id, sala] of hub.rooms.entries()) if (sala.host) ativos.push(id);
    res.set('Cache-Control', 'no-store').json({
      nome: 'CastDeck Local',
      versao: appVersion,
      api: 1,
      hora: new Date().toISOString(),
      estudios: lista.length,
      estudiosAbertos: ativos,
      plugins: plugins ? { instalados: Object.keys(plugins.state.plugins).length, ativos: plugins.listar().filter((p) => p.ativo).length } : null,
      sistema: { plataforma: process.platform, arquitetura: process.arch, memoriaMB: Math.round(process.memoryUsage().rss / 1048576) },
    });
  });

  r.get('/studios', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
      estudios: studies().map((s) => ({ id: s.id, nome: s.name || '', criadoEm: s.createdAt || null, aberto: !!hub.rooms.get(s.id)?.host })),
    });
  });

  r.get('/studios/:id', (req, res) => {
    const id = studioOuErro(req, res);
    if (!id) return;
    const s = store.getStudio(id);
    res.set('Cache-Control', 'no-store').json({
      id,
      nome: s.name || '',
      aberto: !!hub.rooms.get(id)?.host,
      fontes: (s.brand?.sources || []).length,
      banners: (s.banners || []).length,
      layout: s.brand?.layout || null,
    });
  });

  // ---------- ações no estúdio ----------
  r.post('/studios/:id/action', (req, res) => {
    const id = studioOuErro(req, res);
    if (!id) return;
    const { tipo, ...dados } = req.body || {};
    const acao = String(tipo || '');
    if (!ACONTECIMENTOS.has(acao)) {
      return res.status(400).json({ erro: 'ação desconhecida', acao, acoes: [...ACONTECIMENTOS] });
    }
    if (!hub.rooms.get(id)?.host) {
      return res.status(409).json({ erro: 'o estúdio não está aberto no navegador; ações no palco exigem a janela do estúdio' });
    }
    // chat.send direto no chat do estúdio (não precisa da UI processar)
    if (acao === 'chat.send') {
      const texto = String(dados.texto || '').slice(0, 500);
      if (!texto) return res.status(400).json({ erro: 'texto vazio' });
      const msg = { type: 'chat', id: 'api-' + Date.now(), from: 'api', name: 'API', role: 'host', text: texto, ts: Date.now() };
      for (const sala of hub.rooms.values()) for (const c of sala.clients.values()) hub.send(c, msg);
      if (plugins) plugins.auditar({ tipo: 'api', id, acao, por: ehLocal(req) ? 'local' : 'rede' });
      publicar({ tipo: 'chat', origem: 'api', estudo: id, texto, em: new Date().toISOString() });
      return res.json({ ok: true, acao, estudio: id });
    }
    const enviado = mandarAcao(id, { tipo: acao, ...dados });
    if (plugins) plugins.auditar({ tipo: 'api', id, acao, por: ehLocal(req) ? 'local' : 'rede' });
    res.json({ ok: enviado === 1, acao, estudio: id });
  });

  // ---------- eventos ao vivo (SSE) ----------
  const assinantes = new Set();
  const publicar = (evento) => {
    for (const s of assinantes) {
      try {
        s.res.write(`event: ${evento.tipo || 'mensagem'}\ndata: ${JSON.stringify(evento)}\n\n`);
      } catch {}
    }
  };
  r.get('/events', (req, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'access-control-allow-origin': '*',
    });
    res.write(`event: pronto\ndata: ${JSON.stringify({ versao: appVersion, api: 1 })}\n\n`);
    const assinante = { res };
    assinantes.add(assinante);
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {}
    }, 15000);
    req.on('close', () => {
      clearInterval(ping);
      assinantes.delete(assinante);
    });
  });

  return {
    router: r,
    publicar,
    chave,
    get assinantes() {
      return assinantes.size;
    },
  };
}

export function openapi(appVersion) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'CastDeck Local API',
      version: '1.0.0',
      description:
        'API local do CastDeck para integrar o estúdio com Stream Deck, Home Assistant, Node-RED, scripts e agentes de IA. Requisições de localhost não precisam de chave; de outro computador use Authorization: Bearer <chave> (veja em GET /api/v1). Ações de palco exigem o estúdio aberto no navegador.',
      license: { name: 'AGPL-3.0-only', url: 'https://www.gnu.org/licenses/agpl-3.0.txt' },
    },
    servers: [{ url: 'http://localhost:3000/api/v1', description: 'app local (a porta pode variar)' }],
    components: {
      securitySchemes: { chave: { type: 'http', scheme: 'bearer' } },
      schemas: {
        Acao: {
          type: 'object',
          required: ['tipo'],
          properties: {
            tipo: {
              type: 'string',
              enum: ['overlay.show', 'overlay.hide', 'chat.send', 'scene.set', 'mixer.setVolume', 'mixer.mute', 'media.play', 'media.stop', 'stage.add', 'stage.remove'],
            },
            titulo: { type: 'string', description: 'overlay.show' },
            texto: { type: 'string', description: 'overlay.show / chat.send' },
            cor: { type: 'string', description: 'overlay.show (#hex)' },
            segundos: { type: 'number', description: 'overlay.show (1..60)' },
            layout: { type: 'string', description: 'scene.set (grid, solo, leader, sidebar, pip, split)' },
            fonte: { type: 'string', description: 'mixer.* / media.* / stage.* (id da fonte)' },
            volume: { type: 'number', description: 'mixer.setVolume (0..1)' },
            on: { type: 'boolean', description: 'mixer.mute / stage.add/remove' },
          },
        },
      },
    },
    security: [{ chave: [] }],
    paths: {
      '/': { get: { summary: 'Informações e descoberta', security: [], responses: { 200: { description: 'Info', content: { 'application/json': { schema: { type: 'object' } } } } } } },
      '/openapi.json': { get: { summary: 'Este documento', security: [], responses: { 200: { description: 'OpenAPI' } } } },
      '/status': {
        get: {
          summary: 'Versão, estúdios abertos, plugins e sistema',
          responses: { 200: { description: 'Estado', content: { 'application/json': { schema: { type: 'object' } } } } },
        },
      },
      '/studios': { get: { summary: 'Lista de estúdios', responses: { 200: { description: 'Estúdios' } } } },
      '/studios/{id}': {
        get: {
          summary: 'Detalhe do estúdio',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Estúdio' }, 404: { description: 'Não encontrado' } },
        },
      },
      '/studios/{id}/action': {
        post: {
          summary: 'Executa uma ação no estúdio aberto',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Acao' } } } },
          responses: { 200: { description: 'Ação enviada' }, 400: { description: 'Ação inválida' }, 409: { description: 'Estúdio fechado' } },
        },
      },
      '/events': { get: { summary: 'Fluxo de eventos (SSE)', security: [], responses: { 200: { description: 'text/event-stream' } } } },
    },
  };
}
