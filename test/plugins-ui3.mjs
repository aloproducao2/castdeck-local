// Teste de UI dos extras: Sobre, Testar com 2 eventos, onboarding, resumo de regras e aviso de config pendente.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4345;
const CDP = 9411;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-plgui4-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 400)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(process.execPath, [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: 'ignore',
  windowsHide: true,
});
const perfil = path.join(os.tmpdir(), 'cd-plgui4-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', 'about:blank'], { stdio: 'ignore', windowsHide: true });

try {
  let pronto = false;
  for (let i = 0; i < 120 && !pronto; i++) {
    await esperar(500);
    try {
      pronto = (await (await fetch(BASE + '/api/plugins')).json()).api === 1;
    } catch {}
  }
  ok('servidor no ar', pronto);
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) {
    await esperar(500);
    try {
      alvo = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0;
  const pend = new Map();
  const erros = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') erros.push(String(m.params?.exceptionDetails?.exception?.description || '').slice(0, 160));
  });
  const cmd = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => {
    const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description || '').slice(0, 300));
    return r.result?.result?.value;
  };
  await cmd('Runtime.enable');
  await cmd('Page.navigate', { url: `${BASE}/` });
  await esperar(1500);

  // ---- 1) onboarding com lista vazia ----
  await ev(`(async () => {
    document.body.innerHTML = '<div id="panel-plugins"></div>';
    window.__plg = { pedido: null, teste: [] };
    const mod = await import('/js/studio/plugins.js');
    const ui = await import('/js/ui.js');
    window.fetch = async (url, opt) => {
      const u = String(url).split('?')[0];
      window.__plg.ultimo = { u, opt };
      const corpo = u.endsWith('/plugins')
        ? { api: 1, lista: [] }
        : u.endsWith('/plugins/catalog')
          ? { origem: 'mem', plugins: [] }
          : { ok: true };
      return new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const cd = mod.createPlugins({
      S: { stage: [], sources: new Map() }, $: (s, r = document) => r.querySelector(s),
      toast: () => {}, modal: ui.modal, confirmDialog: async () => false, comp: {},
      onMedia: (id) => window.__plg.teste.push('media:' + id), medias: () => [{ id: 'media:1', nome: 'VÃ­deo 1' }],
    });
    window.__plg.cd = cd;
    cd.render();
    await new Promise((r) => setTimeout(r, 300));
    return 'ok';
  })()`);
  const onb = await ev(`(() => { const p = document.querySelector('#panel-plugins'); return { onboarding: !!p.querySelector('.plg-onboarding'), botoes: [...p.querySelectorAll('[data-instalar-oficial]')].map((b) => b.dataset.instalarOficial), passos: p.querySelectorAll('.plg-passos li').length }; })()`);
  ok('onboarding no estado vazio', onb.onboarding && onb.passos === 3, JSON.stringify(onb));
  ok('botÃµes de instalar oficiais no onboarding', (onb.botoes || []).includes('castdeck.chat-commands') && onb.botoes.includes('castdeck.timer'), JSON.stringify(onb.botoes));

  // ---- 2) painel com 2 plugins: resumo de regras, config pendente, Sobre, Testar ----
  await ev(`(async () => {
    window.fetch = async (url, opt) => {
      const u = String(url).split('?')[0];
      window.__plg.ultimo = { u, opt };
      if (u.endsWith('/plugins')) {
        return new Response(JSON.stringify({ api: 1, lista: [
          { id: 'castdeck.chat-commands', nome: 'Comandos de chat', versao: '1.1.0', autor: 'flue.live', tier: 'declarative', descricao: 'Responde comandos', ativo: true, rodando: false, permissoes: ['events:chat','chat:send','overlay:show'], permissoesTexto: ['ler o chat','responder no chat do estÃºdio','desenhar aviso no programa'], regras: 2, listaRegras: [{ rotulo: '!discord' }, { rotulo: 'oi' }], settings: [], painel: null, configPendente: false, uso: ['No chat, os comandos respondem com aviso na tela.', 'Experimente: !discord, !redes.'], exemplos: [{ tipo: 'chat', texto: '!discord', usuario: 'Ana' }], teste: { tipo: 'chat', texto: '!discord' }, instaladoEm: new Date().toISOString(), licenca: 'AGPL-3.0-only' },
          { id: 'castdeck.timer', nome: 'CronÃ´metro no ar', versao: '1.0.0', autor: 'flue.live', tier: 'code', descricao: 'Contagem regressiva na tela', ativo: false, rodando: false, eventos: ['chat'], tags: ['tempo','overlay'], permissoes: ['events:chat','overlay:show','chat:send'], permissoesTexto: ['ler o chat','desenhar aviso','responder no chat'], permissoesDetalhe: [{ id: 'events:chat', texto: 'ler o chat', risco: 'baixo', porque: 'lÃª o que o pÃºblico escreve' }, { id: 'overlay:show', texto: 'desenhar aviso', risco: 'medio', porque: 'desenha no vÃ­deo' }, { id: 'chat:send', texto: 'responder no chat', risco: 'medio', porque: 'escreve no chat do estÃºdio' }], sensiveis: ['events:chat','overlay:show','chat:send'], regras: 0, listaRegras: [], settings: [{ key: 'titulo', label: 'TÃ­tulo', type: 'text', required: true }], painel: { id: 'controle', title: 'CronÃ´metro', entry: 'ui/panel.html' }, configPendente: true, instaladoEm: new Date().toISOString(), licenca: 'AGPL-3.0-only' },
        ] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.endsWith('/catalog')) return new Response(JSON.stringify({ origem: 'mem', plugins: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (u.includes('/test')) return new Response(JSON.stringify({ ok: true, acoes: [{ acao: 'overlay.show', ok: true, detalhe: 'Oi' }, { acao: 'chat.send', ok: true }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (u.includes('/doctor')) return new Response(JSON.stringify({ ok: false, checks: [
        { nome: 'manifesto', ok: true, detalhe: 'castdeck.timer v1.0.0', dica: '' },
        { nome: 'permissÃµes aprovadas', ok: true, detalhe: '3 aprovada(s)', dica: '' },
        { nome: 'configuraÃ§Ã£o', ok: false, detalhe: 'titulo: vazio', dica: 'abra Configurar' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (u.endsWith('/rules')) return new Response(JSON.stringify({ regras: [{ on: 'chat.comando', comando: 'oi', cooldownSeg: 20, do: [{ type: 'media.play', id: 'media:1' }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    window.__plg.cd.atualizar();
    await new Promise((r) => setTimeout(r, 500));
    return 'ok';
  })()`);
  const cards = await ev(`(() => {
    const p = document.querySelector('#panel-plugins');
    const cc = p.querySelector('.plg-card[data-id="castdeck.chat-commands"]');
    const luz = p.querySelector('.plg-card[data-id="castdeck.timer"]');
    return {
      cards: p.querySelectorAll('.plg-card[data-id]').length,
      regras: cc ? [...cc.querySelectorAll('.plg-chip.rule')].map((x) => x.textContent.trim()) : [],
      aviso: luz ? !!luz.querySelector('.plg-warn') : false,
      sobre: !!(cc && cc.querySelector('[data-plg-about]')),
    };
  })()`);
  ok('cards com resumo de regras', (cards.regras || []).join('|') === '!discord|oi', JSON.stringify(cards.regras));
  ok('aviso de configuraÃ§Ã£o pendente', cards.aviso === true);
  ok('botÃ£o Sobre no card', cards.sobre === true);

  // Sobre
  const sobre = await ev(`(async () => {
    document.querySelector('.plg-card[data-id="castdeck.chat-commands"] [data-plg-about]').click();
    await new Promise((r) => setTimeout(r, 400));
    const m = [...document.querySelectorAll('.modal-back')].pop();
    return m ? { abriu: true, texto: (m.innerText || '').slice(0, 400), tabela: m.querySelectorAll('.plg-sobre th').length, perms: m.querySelectorAll('.plg-perms li').length } : { abriu: false };
  })()`);
  ok('Sobre abre com tabela e permissÃµes', sobre.abriu && sobre.tabela >= 5 && sobre.perms >= 2, JSON.stringify(sobre).slice(0, 300));

  // Testar: explica o evento, deixa editar e mostra o resultado
  const teste = await ev(`(async () => {
    document.querySelectorAll('.modal-back').forEach((m) => m.remove());
    const card = document.querySelector('.plg-card[data-id="castdeck.chat-commands"]');
    card.querySelector('[data-plg-test]').click();
    await new Promise((r) => setTimeout(r, 600));
    const m = [...document.querySelectorAll('.modal-back')].pop();
    const temForm = !!m?.querySelector('#plg-teste-texto');
    const inicial = m?.querySelector('#plg-teste-texto')?.value || '';
    const explicacao = m ? (m.innerText || '') : '';
    m?.querySelector('[data-ok]')?.click();
    await new Promise((r) => setTimeout(r, 1500));
    const r = [...document.querySelectorAll('.modal-back')].pop();
    return {
      abriu: !!m,
      temForm,
      inicial,
      explicacao: /evento de verdade/.test(explicacao),
      resultado: !!r?.querySelector('.plg-resultado'),
      itens: r ? r.querySelectorAll('.plg-resultado li').length : 0,
      denovo: !!r?.querySelector('[data-teste-denovo]'),
      como: !!r?.querySelector('[data-teste-como]'),
    };
  })()`);
  ok('Testar explica, permite editar e mostra resultado', teste.abriu && teste.temForm && teste.explicacao && teste.resultado && teste.itens >= 1 && teste.denovo && teste.como, JSON.stringify(teste).slice(0, 320));

  // "Como usar": passos, exemplos clicÃ¡veis e atalho de teste
  const comoUsar = await ev(`(async () => {
    document.querySelectorAll('.modal-back').forEach((m) => m.remove());
    const card = document.querySelector('.plg-card[data-id="castdeck.chat-commands"]');
    card.querySelector('[data-plg-help]').click();
    await new Promise((r) => setTimeout(r, 500));
    const m = [...document.querySelectorAll('.modal-back')].pop();
    const texto = m ? (m.innerText || '') : '';
    const exemplos = m ? [...m.querySelectorAll('[data-exemplo]')].length : 0;
    return { abriu: !!m, passos: /Passos para usar/.test(texto), exemplos, testarAgora: !!m?.querySelector('[data-como-testar]') };
  })()`);
  ok('Como usar mostra passos, exemplos e Testar agora', comoUsar.abriu && comoUsar.passos && comoUsar.exemplos >= 1 && comoUsar.testarAgora, JSON.stringify(comoUsar).slice(0, 240));

  // regras: aÃ§Ã£o de mÃ­dia tem select com as mÃ­dias do estÃºdio
  const mediaSel = await ev(`(async () => {
    document.querySelectorAll('.modal-back').forEach((m) => m.remove());
    const card = document.querySelector('.plg-card[data-id="castdeck.chat-commands"]');
    card.querySelector('[data-plg-rules]').click();
    await new Promise((r) => setTimeout(r, 600));
    const m = [...document.querySelectorAll('.modal-back')].pop();
    const opcoes = m ? [...m.querySelectorAll('select')].map((s) => [...s.options].map((o) => o.value)) : [];
    return { abriu: !!m, temMedia: opcoes.some((o) => o.includes('media:1')), temPlay: opcoes.some((o) => o.includes('media.play')) };
  })()`);
  ok('editor oferece mÃ­dia do estÃºdio', mediaSel.abriu && mediaSel.temPlay && mediaSel.temMedia, JSON.stringify(mediaSel));

  // guia "Como funcionam"
  const guia = await ev(`(async () => {
    document.querySelectorAll('.modal-back').forEach((m) => m.remove());
    document.querySelector('#plg-guide').click();
    await new Promise((r) => setTimeout(r, 400));
    const m = [...document.querySelectorAll('.modal-back')].pop();
    return { abriu: !!m, passos: m ? m.querySelectorAll('.plg-guia-passos li').length : 0, riscos: m ? m.querySelectorAll('.plg-risco').length : 0, texto: m ? m.innerText.slice(0, 200) : '' };
  })()`);
  ok('guia "Como funcionam" abre com 4 passos', guia.abriu && guia.passos === 4, JSON.stringify(guia).slice(0, 320));

  // consentimento pelo card (painel de permissÃµes com risco)
  const consent = await ev(`(async () => {
    document.querySelectorAll('.modal-back').forEach((m) => m.remove());
    const card = document.querySelector('.plg-card[data-id="castdeck.timer"]');
    card.querySelector('[data-plg-on]').click();
    await new Promise((r) => setTimeout(r, 500));
    const m = [...document.querySelectorAll('.modal-back')].pop();
    return { abriu: !!m, linhas: m ? m.querySelectorAll('.plg-consent li').length : 0, riscos: m ? [...m.querySelectorAll('.plg-risco')].map((x) => x.textContent.trim()) : [] };
  })()`);
  ok('consentimento lista permissÃµes com risco', consent.abriu && consent.linhas >= 2 && consent.riscos.length >= 2, JSON.stringify(consent).slice(0, 320));

  // diagnÃ³stico: mostra checklist e dicas
  const diag = await ev(`(async () => {
    document.querySelectorAll('.modal-back').forEach((m) => m.remove());
    const card = document.querySelector('.plg-card[data-id="castdeck.chat-commands"]');
    card.querySelector('[data-plg-doctor]').click();
    await new Promise((r) => setTimeout(r, 700));
    const m = [...document.querySelectorAll('.modal-back')].pop();
    return { abriu: !!m, linhas: m ? m.querySelectorAll('.plg-diag-row').length : 0, ok: m ? m.querySelectorAll('.plg-diag-row.ok').length : 0, dica: m ? m.querySelectorAll('.plg-diag-dica').length : 0 };
  })()`);
  ok('diagnÃ³stico mostra checklist', diag.abriu && diag.linhas >= 2, JSON.stringify(diag));

  ok('sem erros de console', erros.length === 0, JSON.stringify(erros.slice(0, 3)));
  ws.close();
} catch (e) {
  falhas++;
  console.log('FALHA exceÃ§Ã£o:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nPLUGINS_UI3_FAIL (${falhas})` : '\nPLUGINS_UI3_OK');
process.exit(falhas ? 1 : 0);
