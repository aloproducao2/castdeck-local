// Renderização real (navegador) da aba Plugins: importa o módulo, injeta container, fixture de fetch e
// confere cards, selos, botões, catálogo e o pedido de permissões.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4261;
const CDP = 9375;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-plgui2-' + crypto.randomBytes(4).toString('hex'));
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
const perfil = path.join(os.tmpdir(), 'cd-plgui2-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', 'about:blank'], { stdio: 'ignore', windowsHide: true });

try {
  let pronto = false;
  for (let i = 0; i < 120 && !pronto; i++) {
    await esperar(500);
    try { pronto = (await (await fetch(BASE + '/api/plugins')).json()).api === 1; } catch {}
  }
  ok('servidor no ar', pronto);
  if (!pronto) throw new Error('servidor não subiu');

  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) {
    await esperar(500);
    try { alvo = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
  }
  ok('navegador abriu', !!alvo);
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0;
  const pend = new Map();
  ws.on('message', (d) => { const m = JSON.parse(String(d)); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const cmd = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => {
    const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text).slice(0, 400));
    return r.result?.result?.value;
  };
  await cmd('Runtime.enable');
  await cmd('Page.navigate', { url: `${BASE}/` });
  await esperar(1200);

  const prep = await ev(`(async () => {
    const mod = await import('/js/studio/plugins.js');
    const div = document.createElement('div');
    div.id = 'panel-plugins';
    document.body.appendChild(div);
    window.__plg = { pedido: null, avisos: [] };
    const fixture = {
      '/api/plugins': { api: 1, lista: [
        { id: 'castdeck.chat-commands', nome: 'Comandos de chat', versao: '1.0.0', autor: 'flue.live', tier: 'declarative', descricao: 'Responde !discord', ativo: true, rodando: false, sensiveis: ['events:chat','chat:send','overlay:show'], permissoesTexto: ['ler o chat','responder no chat','desenhar aviso'], permissivas: 3, painel: null, erro: null },
        { id: 'castdeck.luz', nome: 'Luz do convidado', versao: '1.0.0', autor: 'flue.live', tier: 'code', descricao: 'Acende a luz', ativo: false, rodando: false, sensiveis: ['events:stage','network:http://127.0.0.1'], permissoesTexto: ['saber quem está no palco','acessar 127.0.0.1'], permissivas: 2, painel: { id: 'config', title: 'Configuração', entry: 'ui/panel.html' }, erro: null },
      ] },
      '/api/plugins/catalog': { origem: 'mem', plugins: [
        { id: 'castdeck.agenda', nome: 'Agenda', versao: '1.0.0', resumo: 'Próximo evento no ar', instalado: false },
        { id: 'castdeck.chat-commands', nome: 'Comandos de chat', versao: '1.0.0', resumo: 'já instalado', instalado: true },
      ] },
    };
    window.fetch = async (url, opt) => {
      const u = String(url);
      const corpo = fixture[u] || { ok: true };
      return new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const cd = mod.createPlugins({
      S: { stage: [], sources: new Map(), layout: 'grid' },
      $: (s, raiz = document) => raiz.querySelector(s),
      toast: (t) => window.__plg.avisos.push(String(t)),
      modal: () => {},
      confirmDialog: async (texto) => { window.__plg.pedido = String(texto || ''); return false; },
      comp: { setPluginOverlay() {}, clearPluginOverlay() {} },
    });
    window.__plg.cd = cd;
    cd.render();
    await new Promise((r) => setTimeout(r, 250));
    return 'preparado';
  })()`);
  ok('módulo e painel preparados', prep === 'preparado', prep);

  const r = await ev(`(() => {
    const p = document.querySelector('#panel-plugins');
    const cards = [...p.querySelectorAll('.plg-card[data-id]')];
    const botoes = [...p.querySelectorAll('button')].map((b) => b.textContent.trim());
    const selos = [...p.querySelectorAll('.plg-badge')].map((b) => b.textContent.trim());
    const cats = [...p.querySelectorAll('[data-cat]')].map((c) => c.dataset.cat);
    return {
      cards: cards.length,
      nomes: cards.map((c) => c.querySelector('strong').textContent),
      botoes,
      selos,
      cats,
      instaladoDesabilitado: [...p.querySelectorAll('[data-cat-install]')].some((b) => b.disabled),
      htmlLen: p.innerHTML.length,
    };
  })()`);
  ok('painel renderizou', r?.cards === 2, JSON.stringify(r).slice(0, 400));
  ok('dois plugins com nomes', (r?.nomes || []).join('|') === 'Comandos de chat|Luz do convidado', JSON.stringify(r?.nomes));
  ok('selo de ativo', (r?.selos || []).includes('ativo'), JSON.stringify(r?.selos));
  ok('selos de tier', (r?.selos || []).includes('declarativo') && (r?.selos || []).includes('código'), JSON.stringify(r?.selos));
  ok('instalar do arquivo', (r?.botoes || []).some((b) => b.includes('Instalar do arquivo')), JSON.stringify(r?.botoes));
  ok('desligar todos', (r?.botoes || []).some((b) => b.includes('Desligar todos')), JSON.stringify(r?.botoes));
  ok('botão painel do plugin de código', (r?.botoes || []).some((b) => b === 'Painel'), JSON.stringify(r?.botoes));
  ok('catálogo com 2 itens', (r?.cats || []).length === 2, JSON.stringify(r?.cats));
  ok('catálogo desabilita instalado', r?.instaladoDesabilitado === true);

  const perm = await ev(`(async () => {
    const card = document.querySelector('.plg-card[data-id="castdeck.luz"]');
    card.querySelector('[data-plg-on]').click();
    await new Promise((r) => setTimeout(r, 300));
    return window.__plg.pedido || '';
  })()`);
  ok('ativar sensível pede permissões', /permiss|Este plugin quer/i.test(String(perm)), String(perm).slice(0, 240));
  ok('pedido lista o que o plugin quer', /palco|127\.0\.0\.1/i.test(String(perm)), String(perm).slice(0, 240));

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

console.log(falhas ? `\nPLUGINS_UI_FAIL (${falhas})` : '\nPLUGINS_UI_OK');
process.exit(falhas ? 1 : 0);
