// Ciclo completo do author (IA/agente): docs → scaffold → gravar arquivos → validate → simulate → install,
// e o caso de erro estruturado (código bloqueado) + simulação de plugin com código.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORTA = 4287;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-author-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 500)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(process.execPath, [path.join(process.cwd(), 'server', 'index.js')], {
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

try {
  let pronto = false;
  for (let i = 0; i < 120 && !pronto; i++) {
    await esperar(500);
    try {
      pronto = (await api('/plugins')).status === 200;
    } catch {}
  }
  ok('servidor no ar', pronto, log.slice(-300));
  if (!pronto) throw new Error('não subiu');

  // 1) documentação legível por máquina
  const docs = await api('/plugins/author/docs');
  ok('docs com eventos e ações', docs.status === 200 && !!docs.json?.eventos?.['chat.comando'] && !!docs.json?.acoes?.['overlay.show'], docs.texto);
  ok('docs trazem capacidades', (docs.json?.capacidades || []).length >= 10, JSON.stringify(docs.json?.capacidades?.length));
  ok('docs trazem ciclo do agente', JSON.stringify(docs.json?.ciclo) === '["scaffold","validate","simulate","install"]', JSON.stringify(docs.json?.ciclo));

  const tpl = await api('/plugins/author/templates');
  ok('templates para IA', !!tpl.json?.declarativo?.arquivos?.['plugin.json'] && !!tpl.json?.codigo?.arquivos?.['src/index.js'], tpl.texto);

  // 2) scaffold + gravação de arquivos
  const sc = await api('/plugins/author/scaffold', { method: 'POST', body: { id: 'com.teste.ia', tier: 'declarative', name: 'Plugin de IA' } });
  ok('scaffold cria o plugin', sc.status === 200 && sc.json?.manifesto?.id === 'com.teste.ia', sc.texto);

  const grava = await api('/plugins/author/files/com.teste.ia', {
    method: 'PUT',
    body: {
      arquivos: [
        {
          arquivo: 'plugin.json',
          conteudo: JSON.stringify(
            {
              id: 'com.teste.ia',
              name: 'Plugin de IA',
              description: 'teste',
              version: '1.0.0',
              author: { name: 'agente' },
              license: 'MIT',
              engines: { castdeck: '>=1.0.0', api: 1 },
              tier: 'declarative',
              permissions: ['events:chat', 'chat:send', 'overlay:show'],
              rules: [{ on: 'chat.comando', comando: 'teste', cooldownSeg: 0, do: [{ type: 'overlay.show', titulo: 'Teste', texto: 'de {{usuario}}' }] }],
            },
            null,
            2,
          ),
        },
      ],
    },
  });
  ok('agente grava arquivos', grava.status === 200 && grava.json?.gravados === 1, grava.texto);

  const val = await api('/plugins/author/validate', { method: 'POST', body: { id: 'com.teste.ia' } });
  ok('validate aprova', val.status === 200 && val.json?.ok === true, val.texto);

  // 3) simulate: evento sintético → ações
  const sim = await api('/plugins/author/simulate', { method: 'POST', body: { id: 'com.teste.ia', eventos: [{ tipo: 'chat', usuario: 'ana', texto: '!teste', args: [] }] } });
  ok('simulate mostra a ação', sim.status === 200 && (sim.json?.acoes || []).some((a) => a.acao?.type === 'overlay.show'), sim.texto);
  ok('simulate interpola variáveis', (sim.json?.acoes || []).some((a) => a.acao?.texto === 'de ana'), JSON.stringify(sim.json?.acoes));

  // ação não listada no manifesto não deve rodar (falta permissão chat:send no exemplo)
  const sim2 = await api('/plugins/author/simulate', { method: 'POST', body: { id: 'com.teste.ia', eventos: [{ tipo: 'stage', acao: 'entrou', fonteNome: 'Fulano' }] } });
  ok('evento sem regra não gera ação', (sim2.json?.acoes || []).length === 0, sim2.texto);

  // 4) install (do workspace) e execução real
  const inst = await api('/plugins/author/install', { method: 'POST', body: { id: 'com.teste.ia' } });
  ok('install do workspace', inst.status === 200, inst.texto);
  const atv = await api('/plugins/com.teste.ia/enable', { method: 'POST', body: { permissoes: ['events:chat', 'chat:send', 'overlay:show'] } });
  ok('ativa plugin criado por IA', atv.status === 200, atv.texto);
  const chat = await api('/plugins/_test/chat', { method: 'POST', body: { usuario: 'ana', texto: '!teste' } });
  ok('plugin criado por IA funciona no app', (chat.json?.executadas || []).length > 0, chat.texto);

  // 5) erro estruturado: código perigoso
  await api('/plugins/author/scaffold', { method: 'POST', body: { id: 'com.teste.ruim', tier: 'code' } });
  await api('/plugins/author/files/com.teste.ruim', {
    method: 'PUT',
    body: { arquivos: [{ arquivo: 'src/index.js', conteudo: "require('child_process').exec('calc');\n" }] },
  });
  const valRuim = await api('/plugins/author/validate', { method: 'POST', body: { id: 'com.teste.ruim' } });
  ok('validate reprova código perigoso com código', valRuim.json?.ok === false && (valRuim.json?.erros || []).some((e) => e.codigo === 'CODIGO_BLOQUEADO'), valRuim.texto);
  ok('erro traz dica para o agente', (valRuim.json?.erros || []).every((e) => !e.dica || typeof e.dica === 'string'), JSON.stringify(valRuim.json?.erros));

  // 6) simulação de plugin de código: ações capturadas sem executar
  await api('/plugins/author/scaffold', { method: 'POST', body: { id: 'com.teste.codigo', tier: 'code' } });
  await api('/plugins/author/files/com.teste.codigo', {
    method: 'PUT',
    body: {
      arquivos: [
        { arquivo: 'src/index.js', conteudo: "export default function activate(cd) {\n  cd.events.on('chat', (m) => { cd.log('recebi ' + m.usuario); cd.overlay.show({ titulo: 'Oi', texto: m.usuario }, 5); });\n}\n" },
        {
          arquivo: 'plugin.json',
          conteudo: JSON.stringify(
            { id: 'com.teste.codigo', name: 'Código', description: 'x', version: '1.0.0', author: { name: 'a' }, license: 'MIT', engines: { castdeck: '>=1.0.0', api: 1 }, tier: 'code', entry: 'src/index.js', permissions: ['events:chat', 'overlay:show'] },
            null,
            2,
          ),
        },
      ],
    },
  });
  const valCod = await api('/plugins/author/validate', { method: 'POST', body: { id: 'com.teste.codigo' } });
  ok('validate aprova plugin de código', valCod.json?.ok === true, valCod.texto);
  const simCod = await api('/plugins/author/simulate', { method: 'POST', body: { id: 'com.teste.codigo', eventos: [{ tipo: 'chat', usuario: 'bia', texto: 'oi', args: [] }] } });
  ok(
    'simulate do código captura a ação',
    (simCod.json?.acoes || []).some((a) => a.acao?.type === 'overlay.show' && (a.acao?.spec?.texto === 'bia' || a.acao?.params?.spec?.texto === 'bia')),
    JSON.stringify(simCod.json?.acoes) + ' | ' + simCod.json?.log,
  );
  ok('simulate não falhou', simCod.json?.ok === true, simCod.texto);
  ok('log do plugin aparece na simulação', /recebi bia/.test(String(simCod.json?.log || '')), String(simCod.json?.log || '').slice(0, 200));

  // 7) não deixa sair do workspace
  const fora = await api('/plugins/author/files/..%2F..%2Fetc', { method: 'PUT', body: { arquivos: [{ arquivo: 'x.txt', conteudo: 'x' }] } });
  ok('recusa caminho fora do workspace', fora.status === 400, fora.texto);
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { proc.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nPLUGINS_AUTHOR_FAIL (${falhas})` : '\nPLUGINS_AUTHOR_OK');
process.exit(falhas ? 1 : 0);
