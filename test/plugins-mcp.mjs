// Testa o servidor MCP: handshake, tools/list e um ciclo real (docs → scaffold → write → validate → simulate)
// contra um app rodando em porta temporária.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORTA = 4291;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-mcp-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 500)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const app = spawn(process.execPath, [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_TEST: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: ['ignore', 'ignore', 'ignore'],
  windowsHide: true,
});

const mcp = spawn(process.execPath, ['D:/CastDeck-Plugins/tools/mcp-plugins.mjs'], {
  env: { ...process.env, CASTDECK_URL: BASE },
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true,
});
let saidaMcp = '';
mcp.stdout.on('data', (d) => (saidaMcp += d));
mcp.stderr.on('data', () => {});

const pend = new Map();
let seq = 0;
mcp.stdout.on('data', () => {
  let i;
  while ((i = saidaMcp.indexOf('\n')) >= 0) {
    const linha = saidaMcp.slice(0, i).trim();
    saidaMcp = saidaMcp.slice(i + 1);
    if (!linha) continue;
    let msg;
    try {
      msg = JSON.parse(linha);
    } catch {
      continue;
    }
    if (msg.id && pend.has(msg.id)) {
      pend.get(msg.id)(msg);
      pend.delete(msg.id);
    }
  }
});

const rpc = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, res);
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    setTimeout(() => {
      if (pend.has(id)) {
        pend.delete(id);
        rej(new Error('sem resposta para ' + method));
      }
    }, 15000);
  });

const ferramenta = async (nome, args = {}) => {
  const r = await rpc('tools/call', { name: nome, arguments: args });
  const texto = r.result?.content?.[0]?.text || '';
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {}
  return { isError: !!r.result?.isError, json, texto };
};

try {
  let pronto = false;
  for (let i = 0; i < 120 && !pronto; i++) {
    await esperar(500);
    try {
      pronto = (await fetch(BASE + '/api/plugins')).status === 200;
    } catch {}
  }
  ok('app no ar', pronto);

  const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'teste', version: '1' } });
  ok('handshake MCP', init.result?.serverInfo?.name === 'castdeck-plugins', JSON.stringify(init));
  mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const lista = await rpc('tools/list');
  const nomes = (lista.result?.tools || []).map((t) => t.name);
  ok('lista de ferramentas', nomes.length === 11, nomes.join(','));
  ok('tem scaffold/validate/simulate/install', ['castdeck_plugin_scaffold', 'castdeck_plugin_validate', 'castdeck_plugin_simulate', 'castdeck_plugin_install'].every((n) => nomes.includes(n)), nomes.join(','));

  const docs = await ferramenta('castdeck_plugin_docs');
  ok('docs via MCP', docs.json?.acoes?.['overlay.show'] && docs.json?.eventos?.['chat.comando'], docs.texto.slice(0, 200));

  const tpl = await ferramenta('castdeck_plugin_templates');
  ok('templates via MCP', !!tpl.json?.declarativo?.arquivos?.['plugin.json'], tpl.texto.slice(0, 120));

  const sc = await ferramenta('castdeck_plugin_scaffold', { id: 'com.teste.mcp', tier: 'declarative', name: 'Do MCP' });
  ok('scaffold via MCP', sc.json?.manifesto?.id === 'com.teste.mcp', sc.texto.slice(0, 200));

  const escrever = await ferramenta('castdeck_plugin_write', {
    id: 'com.teste.mcp',
    arquivos: [
      {
        arquivo: 'plugin.json',
        conteudo: JSON.stringify(
          {
            id: 'com.teste.mcp',
            name: 'Do MCP',
            description: 'criado por agente',
            version: '1.0.0',
            author: { name: 'agente' },
            license: 'MIT',
            engines: { castdeck: '>=1.0.0', api: 1 },
            tier: 'declarative',
            permissions: ['events:chat', 'overlay:show'],
            rules: [{ on: 'chat.contem', texto: 'oi', cooldownSeg: 0, do: [{ type: 'overlay.show', titulo: 'MCP', texto: 'de {{usuario}}' }] }],
          },
          null,
          2,
        ),
      },
    ],
  });
  ok('write via MCP', escrever.json?.gravados === 1, escrever.texto);

  const val = await ferramenta('castdeck_plugin_validate', { id: 'com.teste.mcp' });
  ok('validate via MCP', val.json?.ok === true, val.texto.slice(0, 200));

  const sim = await ferramenta('castdeck_plugin_simulate', { id: 'com.teste.mcp', eventos: [{ tipo: 'chat', usuario: 'ana', texto: 'oi pessoal' }] });
  ok('simulate via MCP', (sim.json?.acoes || []).some((a) => a.acao?.texto === 'de ana'), sim.texto.slice(0, 200));

  const inst = await ferramenta('castdeck_plugin_install', { id: 'com.teste.mcp' });
  ok('install via MCP', inst.json?.ok === true, inst.texto.slice(0, 200));

  const st = await ferramenta('castdeck_plugin_status');
  ok('status via MCP', (st.json?.plugins || []).some((p) => p.id === 'com.teste.mcp'), st.texto.slice(0, 200));

  const logs = await ferramenta('castdeck_plugin_logs', { id: 'com.teste.mcp' });
  ok('logs via MCP', typeof logs.json?.log === 'string', logs.texto.slice(0, 120));

  const err = await ferramenta('castdeck_plugin_scaffold', { id: 'ID INVALIDO' });
  ok('erro volta como isError', err.isError === true, err.texto.slice(0, 160));
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { mcp.kill('SIGKILL'); } catch {}
  try { app.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nPLUGINS_MCP_FAIL (${falhas})` : '\nPLUGINS_MCP_OK');
process.exit(falhas ? 1 : 0);
