// Teste de UI do painel novo (renderização no navegador com fetch mockado): abas, chips, botões novos,
// botão "Pasta local…", formulário de configuração e editor de regras.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4303;
const CDP = 9397;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-plgui3-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 500)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(process.execPath, [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: 'ignore',
  windowsHide: true,
});
const perfil = path.join(os.tmpdir(), 'cd-plgui3-edge-' + crypto.randomBytes(3).toString('hex'));
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
    if (m.method === 'Runtime.exceptionThrown') erros.push(String(m.params?.exceptionDetails?.exception?.description || '').slice(0, 180));
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

  const prep = await ev(`(async () => {
    document.body.innerHTML = '<div id="panel-plugins"></div>';
    const mod = await import('/js/studio/plugins.js');
    const ui = await import('/js/ui.js');
    window.__plg = { pedido: null };
    const lista = [
      { id: 'castdeck.chat-commands', nome: 'Comandos de chat', versao: '1.0.0', autor: 'flue.live', tier: 'declarative', descricao: 'Responde comandos', ativo: true, rodando: false, sensiveis: ['events:chat','chat:send','overlay:show'], permissoes: ['events:chat','chat:send','overlay:show'], permissoesTexto: ['ler o chat','responder no chat do estúdio','desenhar aviso no programa'], regras: 2, settings: [], painel: null, erro: null },
      { id: 'castdeck.timer', nome: 'Cronômetro no ar', versao: '1.0.0', autor: 'flue.live', tier: 'code', descricao: 'Contagem regressiva na tela', ativo: false, rodando: false, eventos: ['chat'], tags: ['tempo'], sensiveis: ['events:chat','overlay:show','chat:send'], permissoes: ['events:chat','overlay:show','chat:send'], permissoesTexto: ['ler o chat','desenhar aviso','responder no chat'], permissoesDetalhe: [{ id: 'events:chat', texto: 'ler o chat', risco: 'baixo', porque: 'lê o que o público escreve' }, { id: 'overlay:show', texto: 'desenhar aviso', risco: 'medio', porque: 'desenha no vídeo' }, { id: 'chat:send', texto: 'responder no chat', risco: 'medio', porque: 'escreve no chat do estúdio' }], regras: 0, settings: [{ key: 'titulo', label: 'Título', type: 'text' }], painel: null, erro: null },
    ];
    const respostas = {
      '/api/plugins': { api: 1, lista },
      '/api/plugins/catalog': { origem: 'mem', plugins: [{ id: 'castdeck.agenda', nome: 'Agenda', versao: '1.0.0', resumo: 'Próximo evento', instalado: false, tier: 'declarative' }] },
      '/api/plugins/audit': { linhas: [JSON.stringify({ em: new Date().toISOString(), tipo: 'acao', id: 'castdeck.chat-commands', acao: 'overlay.show' })] },
      '/api/plugins/castdeck.timer/settings': { settings: { urlLigar: 'http://127.0.0.1/on' }, campos: [{ key: 'urlLigar', label: 'Endereço para ligar', type: 'text' }] },
      '/api/plugins/castdeck.chat-commands/rules': { regras: [{ on: 'chat.comando', comando: 'oi', cooldownSeg: 20, do: [{ type: 'overlay.show', titulo: 'Oi', texto: '{{usuario}} chegou', segundos: 5 }] }] },
    };
    window.fetch = async (url, opt) => {
      const u = String(url);
      const base = u.split('?')[0];
      window.__plg.ultimo = { u, opt };
      const corpo = respostas[base] || { ok: true, acoes: [{ acao: 'overlay.show', ok: true }] };
      return new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const cd = mod.createPlugins({
      S: { stage: [], sources: new Map() },
      $: (s, r = document) => r.querySelector(s),
      toast: () => {},
      modal: ui.modal,
      confirmDialog: async (t) => { window.__plg.pedido = String(t || ''); return false; },
      comp: { setPluginOverlay() {}, clearPluginOverlay() {} },
    });
    window.__plg.cd = cd;
    cd.render();
    await new Promise((r) => setTimeout(r, 300));
    return 'ok';
  })()`);
  ok('painel montado', prep === 'ok', prep);

  const r = await ev(`(() => {
    const p = document.querySelector('#panel-plugins');
    const abas = [...p.querySelectorAll('[data-plg-tab]')].map((b) => b.dataset.plgTab);
    const botoes = [...p.querySelectorAll('button')].map((b) => b.textContent.trim());
    return {
      abas,
      botoes,
      cards: p.querySelectorAll('.plg-card[data-id]').length,
      chips: p.querySelectorAll('.plg-chip').length,
      temResumo: !!p.querySelector('.plg-resumo'),
      temPasta: !!p.querySelector('#plg-add-dir') && !!p.querySelector('#plg-dir[webkitdirectory]'),
      temTestar: botoes.includes('Testar'),
      temRegras: botoes.includes('Regras'),
      temConfig: botoes.includes('Configurar'),
      temAtualizar: botoes.some((b) => b.includes('Atualizar')),
    };
  })()`);
  ok('3 abas (instalados/catálogo/atividade)', (r.abas || []).join(',') === 'instalados,catalogo,atividade', JSON.stringify(r.abas));
  ok('2 cards instalados', r.cards === 2, String(r.cards));
  ok('chips de permissões', r.chips >= 4, String(r.chips));
  ok('resumo no topo', r.temResumo);
  ok('botão e input de pasta local', r.temPasta);
  ok('botões testar/regras/configurar', r.temTestar && r.temRegras && r.temConfig, JSON.stringify(r.botoes));

  // configuração automática a partir dos settings do manifesto
  const form = await ev(`(async () => {
    const card = document.querySelector('.plg-card[data-id="castdeck.timer"]');
    let capturado = null;
    window.__plg.cd.render();
    // abre o modal real (a janela usa o modal do app; aqui interceptamos o clique)
    const btn = card.querySelector('[data-plg-config]');
    btn.click();
    await new Promise((r) => setTimeout(r, 400));
    const modal = document.querySelector('.modal-back');
    return { abriu: !!modal, campos: modal ? modal.querySelectorAll('[data-key]').length : 0, texto: modal ? (modal.innerText || '').slice(0, 120) : '' };
  })()`);
  ok('configurar abre formulário com campos do manifesto', form.abriu && form.campos >= 1, JSON.stringify(form));

  // editor de regras
  const regras = await ev(`(async () => {
    const b = document.createElement('div'); b.innerHTML = '';
    window.__plg.cd.render();
    const card = [...document.querySelectorAll('.plg-card[data-id="castdeck.chat-commands"]')][0];
    card.querySelector('[data-plg-rules]').click();
    await new Promise((r) => setTimeout(r, 600));
    const modal = [...document.querySelectorAll('.modal-back')].pop();
    return { abriu: !!modal, selects: modal ? modal.querySelectorAll('select').length : 0, inputs: modal ? modal.querySelectorAll('input').length : 0, texto: modal ? (modal.innerText || '').slice(0, 160) : '' };
  })()`);
  ok('editor de regras abre com campos', regras.abriu && regras.selects >= 2 && regras.inputs >= 1, JSON.stringify(regras));

  // aba atividade
  const ativ = await ev(`(async () => {
    const b = document.querySelector('[data-plg-tab="atividade"]');
    b.click();
    await new Promise((r) => setTimeout(r, 400));
    return { linhas: document.querySelectorAll('.plg-audit-row').length, texto: (document.querySelector('#panel-plugins')?.innerText || '').slice(0, 120) };
  })()`);
  ok('aba atividade mostra a auditoria', ativ.linhas >= 1, JSON.stringify(ativ));

  // catálogo com busca
  const cat = await ev(`(async () => {
    document.querySelector('[data-plg-tab="catalogo"]').click();
    await new Promise((r) => setTimeout(r, 400));
    const busca = document.querySelector('#plg-busca');
    return { temBusca: !!busca, cards: document.querySelectorAll('.plg-card.cat').length };
  })()`);
  ok('aba catálogo com busca', cat.temBusca && cat.cards >= 1, JSON.stringify(cat));

  // consentimento: ativar plugin sensível pede permissões
  const perm = await ev(`(async () => {
    document.querySelector('[data-plg-tab="instalados"]').click();
    await new Promise((r) => setTimeout(r, 300));
    const card = document.querySelector('.plg-card[data-id="castdeck.timer"]');
    card.querySelector('[data-plg-on]').click();
    await new Promise((r) => setTimeout(r, 500));
    const m = [...document.querySelectorAll('.modal-back')].pop();
    const texto = m ? m.innerText : '';
    const riscos = m ? [...m.querySelectorAll('.plg-risco')].map((x) => x.textContent.trim()) : [];
    const linhas = m ? m.querySelectorAll('.plg-consent li').length : 0;
    return { texto, riscos, linhas, temAtivar: !!(m && m.querySelector('[data-ok]')) };
  })()`);
  ok('pedido de permissões ao ativar plugin sensível', perm.temAtivar && perm.linhas >= 1 && /Ativar/i.test(perm.texto), JSON.stringify(perm).slice(0, 400));
  ok('consentimento mostra o risco de cada permissão', perm.riscos.length >= 1 && perm.riscos.every((r) => /risco/i.test(r)), JSON.stringify(perm.riscos));

  ok('sem erros de console', erros.length === 0, JSON.stringify(erros.slice(0, 3)));
  ws.close();
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nPLUGINS_UI2_FAIL (${falhas})` : '\nPLUGINS_UI2_OK');
process.exit(falhas ? 1 : 0);
