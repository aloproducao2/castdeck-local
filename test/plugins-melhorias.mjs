// Testa as novas rotas (testar plugin, regras declarativas) e a instalação de pasta local (arquivos do navegador
// e caminho absoluto no disco), inclusive com o servidor empacotado.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EXE = process.env.CASTDECK_TEST_EXE || '';
const PORTA = Number(process.env.CASTDECK_TEST_PORT || 4299);
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-mel-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 400)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const comando = EXE ? EXE : process.execPath;
const args = EXE ? [] : [path.join(process.cwd(), 'server', 'index.js')];
const proc = spawn(comando, args, {
  env: { ...process.env, PORT: String(PORTA), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_TEST: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let log = '';
proc.stdout.on('data', (d) => (log += d));
proc.stderr.on('data', (d) => (log += d));

const api = async (rota, opt = {}) => {
  const r = await fetch(BASE + '/api' + rota, {
    method: opt.method || 'GET',
    headers: { 'content-type': 'application/json' },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {}
  return { status: r.status, json: j, texto: t };
};

const b64 = (arquivo) => fs.readFileSync(arquivo).toString('base64');

try {
  let pronto = false;
  for (let i = 0; i < 160 && !pronto; i++) {
    await esperar(600);
    try {
      pronto = (await api('/plugins')).status === 200;
    } catch {}
  }
  ok('servidor no ar', pronto, log.slice(-300));
  if (!pronto) throw new Error('não subiu');

  // ---------- 1) instalar plugin a partir de PASTA LOCAL (arquivos do navegador) ----------
  const pasta = 'plugins/castdeck.chat-commands';
  const arquivos = fs
    .readdirSync(pasta, { recursive: true })
    .filter((n) => fs.statSync(path.join(pasta, String(n))).isFile())
    .map((n) => ({ nome: String(n).replace(/\\/g, '/'), conteudoBase64: b64(path.join(pasta, String(n))) }));
  const instPasta = await api('/plugins/install', { method: 'POST', body: { arquivos } });
  ok('instala plugin de pasta local (arquivos)', instPasta.status === 200 && instPasta.json?.id === 'castdeck.chat-commands', instPasta.texto);

  // ---------- 2) instalar por caminho absoluto no disco ----------
  const instCaminho = await api('/plugins/install', { method: 'POST', body: { pasta: path.resolve('plugins/castdeck.luz') } });
  ok('instala plugin por caminho absoluto', instCaminho.status === 200 && instCaminho.json?.id === 'castdeck.luz', instCaminho.texto);
  const instRuim = await api('/plugins/install', { method: 'POST', body: { pasta: 'plugins/nao-existe' } });
  ok('caminho inexistente dá erro claro', instRuim.status === 400 && /não encontrada/i.test(instRuim.texto), instRuim.texto);

  // ---------- 3) lista com settings/regras ----------
  const lista = await api('/plugins');
  const cc = lista.json?.lista?.find((p) => p.id === 'castdeck.chat-commands');
  ok('lista traz contagem de regras', cc?.regras > 0, JSON.stringify(cc?.regras));
  ok('lista traz campos de settings', Array.isArray(cc?.settings), typeof cc?.settings);

  // ---------- 4) TESTAR plugin declarativo (executa de verdade e devolve ações) ----------
  await api('/plugins/castdeck.chat-commands/enable', { method: 'POST', body: { permissoes: ['events:chat', 'chat:send', 'overlay:show'] } });
  const teste = await api('/plugins/castdeck.chat-commands/test', { method: 'POST', body: { tipo: 'chat', texto: '!oi' } });
  ok('test-drive do declarativo responde', teste.status === 200 && teste.json?.ok === true, teste.texto);
  ok('test-drive mostra as ações', (teste.json?.acoes || []).length > 0, JSON.stringify(teste.json?.acoes));

  // ---------- 5) EDITOR DE REGRAS ----------
  const regras = await api('/plugins/castdeck.chat-commands/rules');
  ok('GET regras devolve as regras', (regras.json?.regras || []).length > 0, regras.texto.slice(0, 200));
  const novas = [
    { on: 'chat.comando', comando: 'teste', cooldownSeg: 5, do: [{ type: 'overlay.show', titulo: 'Teste', texto: 'de {{usuario}}', cor: '#22d3ee', segundos: 4 }] },
    { on: 'stage.entrou', cooldownSeg: 0, do: [{ type: 'chat.send', texto: 'Entrou {{fonte}}' }] },
  ];
  const salvar = await api('/plugins/castdeck.chat-commands/rules', { method: 'POST', body: { regras: novas } });
  ok('POST regras salva', salvar.status === 200 && (salvar.json?.regras || []).length === 2, salvar.texto);
  const relido = JSON.parse(fs.readFileSync(path.join(DADOS, 'plugins', 'castdeck.chat-commands', 'plugin.json'), 'utf8'));
  ok('plugin.json atualizado no disco', relido.rules?.length === 2 && relido.rules[0].comando === 'teste', JSON.stringify(relido.rules?.length));
  const teste2 = await api('/plugins/castdeck.chat-commands/test', { method: 'POST', body: { tipo: 'chat', texto: '!teste' } });
  ok('regra nova funciona na hora', (teste2.json?.acoes || []).some((a) => a.acao === 'overlay.show'), teste2.texto);
  const regraRuim = await api('/plugins/castdeck.chat-commands/rules', { method: 'POST', body: { regras: [{ on: 'xpto', do: [] }] } });
  ok('regra inválida é recusada com erro', regraRuim.status === 400 && /evento inválido|ação/i.test(regraRuim.texto), regraRuim.texto);

  // plugin de código: GET rules deve recusar
  const regrasCod = await api('/plugins/castdeck.luz/rules');
  ok('plugin de código não tem regras', regrasCod.status === 400, regrasCod.texto);

  // ---------- 6) teste do plugin de código (precisa estar ativo) ----------
  const testeCod = await api('/plugins/castdeck.luz/test', { method: 'POST', body: { tipo: 'stage' } });
  ok('teste de plugin de código desligado dá erro claro', testeCod.status === 400 && /não está rodando|ative/i.test(testeCod.texto), testeCod.texto);
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { proc.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nPLUGINS_MELHORIAS_FAIL (${falhas})` : '\nPLUGINS_MELHORIAS_OK');
process.exit(falhas ? 1 : 0);
