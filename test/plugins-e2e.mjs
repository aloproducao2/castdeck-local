// E2E do sistema de plugins: instala os 2 plugins oficiais, aprova permissões, dispara eventos de chat e de
// palco (com um servidor HTTP falso no lugar da luz), confere overlay chegando no estúdio por WebSocket,
// auditoria, log, rejeição de plugin malicioso, permissões obrigatórias e desligamento.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const RAIZ = process.cwd();
const PORTA = 4213;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'castdeck-plugins-e2e-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (nome, cond, info = '') => {
  if (!cond) falhas++;
  console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + String(info).slice(0, 400)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const api = async (rota, opt = {}) => {
  const r = await fetch(BASE + '/api' + rota, {
    method: opt.method || 'GET',
    headers: { 'content-type': 'application/json' },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {}
  return { status: r.status, json, texto };
};

// ---------- servidor falso da "luz" ----------
const recebidos = [];
const luz = http.createServer((req, res) => {
  let corpo = '';
  req.on('data', (d) => (corpo += d));
  req.on('end', () => {
    recebidos.push({ url: req.url, metodo: req.method, corpo, auth: req.headers.authorization || '' });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
});
await new Promise((r) => luz.listen(0, '127.0.0.1', r));
const luzPorta = luz.address().port;

// ---------- sobe o servidor do CastDeck ----------
const log = [];
const proc = spawn(process.execPath, [path.join(RAIZ, 'server', 'index.js')], {
  env: {
    ...process.env,
    PORT: String(PORTA),
    CASTDECK_DATA: DADOS,
    NO_OPEN: '1',
    CASTDECK_PLUGIN_TEST: '1',
    CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/index.json',
    CASTDECK_SKIP_FFMPEG_CHECK: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
proc.stdout.on('data', (d) => log.push(String(d)));
proc.stderr.on('data', (d) => log.push(String(d)));

const encerrar = async () => {
  try {
    proc.kill('SIGKILL');
  } catch {}
  try {
    luz.close();
  } catch {}
};

try {
  let pronto = false;
  for (let i = 0; i < 120 && !pronto; i++) {
    await esperar(500);
    try {
      const r = await api('/plugins');
      pronto = r.status === 200;
    } catch {}
  }
  ok('servidor no ar e /api/plugins responde', pronto, log.join('').slice(-600));
  if (!pronto) throw new Error('servidor não subiu');

  // ---------- instala os oficiais ----------
  const inst1 = await api('/plugins/install', { method: 'POST', body: { pasta: 'plugins/castdeck.chat-commands' } });
  ok('instala chat-commands da pasta', inst1.status === 200 && inst1.json?.id === 'castdeck.chat-commands', inst1.texto);

  const semPermissao = await api('/plugins/castdeck.chat-commands/enable', { method: 'POST', body: {} });
  ok('ativar sem aprovar permissões é recusado', semPermissao.status === 400 && /permiss/i.test(semPermissao.texto), semPermissao.texto);

  const ativar1 = await api('/plugins/castdeck.chat-commands/enable', {
    method: 'POST',
    body: { permissoes: ['events:chat', 'chat:send', 'overlay:show'] },
  });
  ok('ativa chat-commands com permissões', ativar1.status === 200, ativar1.texto);

  // ---------- estúdio fake no WebSocket para ver o overlay ----------
  const estudos = await api('/studios', { method: 'POST', body: { name: 'Teste plugins' } });
  const studioId = estudos.json?.id || estudos.json?.studio?.id;
  ok('cria estúdio para o teste', !!studioId, estudos.texto);

  const msgs = [];
  const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws`);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  ws.on('message', (d) => {
    try {
      msgs.push(JSON.parse(String(d)));
    } catch {}
  });
  ws.send(JSON.stringify({ type: 'join', room: studioId, role: 'host' }));
  await esperar(600);

  // ---------- comando de chat -> overlay no estúdio ----------
  const chat = await api('/plugins/_test/chat', { method: 'POST', body: { usuario: 'ana', texto: '!discord https://d.gg/x' } });
  ok('evento de chat dispara regra', chat.status === 200 && (chat.json?.executadas || []).length > 0, chat.texto);
  await esperar(500);
  const overlay = msgs.find((m) => m.type === 'plugin' && m.acao === 'plugin-overlay');
  ok('overlay chegou no estúdio', !!overlay, JSON.stringify(msgs.slice(-4)));
  ok('overlay tem o texto interpolado', overlay?.payload?.spec?.titulo === 'Discord', JSON.stringify(overlay?.payload));

  // cooldown: mesmo usuário, mesmo comando, não repete
  const chat2 = await api('/plugins/_test/chat', { method: 'POST', body: { usuario: 'ana', texto: '!discord https://d.gg/x' } });
  ok('cooldown segura repetição do mesmo usuário', (chat2.json?.executadas || []).length === 0, chat2.texto);

  const auditoria = await api('/plugins/audit');
  const linhas = auditoria.json?.linhas || [];
  ok('auditoria registra ativação', linhas.some((l) => l.includes('"tipo":"ativar"')), linhas.slice(-3));
  ok('auditoria registra a ação de overlay', linhas.some((l) => l.includes('overlay.show')), linhas.slice(-3));

  // ---------- plugin de código: luz ----------
  const inst2 = await api('/plugins/install', { method: 'POST', body: { pasta: 'test/fixtures/castdeck.luz' } });
  ok('instala luz da pasta', inst2.status === 200 && inst2.json?.id === 'castdeck.luz', inst2.texto);

  const cfg = await api('/plugins/castdeck.luz/settings', {
    method: 'POST',
    body: { urlLigar: `http://127.0.0.1:${luzPorta}/on`, urlDesligar: `http://127.0.0.1:${luzPorta}/off`, aviso: false, segundos: 3 },
  });
  ok('salva configuração do painel', cfg.status === 200 && cfg.json?.settings?.urlLigar.includes('/on'), cfg.texto);

  const ativar2 = await api('/plugins/castdeck.luz/enable', {
    method: 'POST',
    body: { permissoes: ['events:stage', 'events:chat', 'overlay:show', 'storage:own', 'network:http://127.0.0.1', 'network:http://localhost'] },
  });
  ok('ativa luz (processo separado)', ativar2.status === 200, ativar2.texto);

  let lista = await api('/plugins');
  const luzInfo = lista.json?.lista?.find((p) => p.id === 'castdeck.luz');
  ok('luz aparece rodando', luzInfo?.rodando === true, JSON.stringify(luzInfo));

  // entra no palco -> deve chamar o servidor falso
  await api('/plugins/event', { method: 'POST', body: { tipo: 'stage', acao: 'entrou', fonte: 'cam2', fonteNome: 'Fulano' } });
  for (let i = 0; i < 24 && !recebidos.length; i++) await esperar(250);
  ok('plugin de código fez a requisição HTTP (luz ligou)', recebidos.some((r) => r.url === '/on' && r.metodo === 'POST'), JSON.stringify(recebidos));

  // sai do palco -> desliga
  await api('/plugins/event', { method: 'POST', body: { tipo: 'stage', acao: 'saiu', fonte: 'cam2' } });
  for (let i = 0; i < 24 && !recebidos.some((r) => r.url === '/off'); i++) await esperar(250);
  ok('saiu do palco -> desligou a luz', recebidos.some((r) => r.url === '/off'), JSON.stringify(recebidos));

  const logLuz = await api('/plugins/castdeck.luz/log');
  ok('log do plugin registra a ação', /luz ligada/i.test(logLuz.texto), logLuz.texto.slice(-300));

  // rede fora da allowlist é bloqueada (permisso de host não cobre outro endereço)
  const testeHost = await api('/plugins/castdeck.luz/settings', {
    method: 'POST',
    body: { urlLigar: 'http://10.255.255.1:9/x', aviso: false },
  });
  ok('aceita salvar endereço não permitido (ajuste do usuário)', testeHost.status === 200, testeHost.texto);
  const antes = recebidos.length;
  await api('/plugins/event', { method: 'POST', body: { tipo: 'stage', acao: 'saiu', fonte: 'cam2' } });
  await esperar(1200);
  ok('host fora da lista não recebe requisição do plugin', recebidos.length === antes, 'recebeu ' + (recebidos.length - antes));
  await api('/plugins/castdeck.luz/settings', {
    method: 'POST',
    body: { urlLigar: `http://127.0.0.1:${luzPorta}/on`, urlDesligar: `http://127.0.0.1:${luzPorta}/off` },
  });

  // ---------- plugin oficial de código: Cronômetro no ar (painel + overlay persistente) ----------
  const instTimer = await api('/plugins/install', { method: 'POST', body: { pasta: 'plugins/castdeck.timer' } });
  ok('instala o cronômetro da pasta oficial', instTimer.status === 200 && instTimer.json?.id === 'castdeck.timer', instTimer.texto);

  const ativarTimer = await api('/plugins/castdeck.timer/enable', {
    method: 'POST',
    body: { permissoes: ['events:chat', 'overlay:show', 'chat:send', 'storage:own'] },
  });
  ok('ativa o cronômetro (processo separado)', ativarTimer.status === 200, ativarTimer.texto);

  let listaTimer = await api('/plugins');
  const timerInfo = listaTimer.json?.lista?.find((p) => p.id === 'castdeck.timer');
  ok('cronômetro aparece rodando', timerInfo?.rodando === true, JSON.stringify(timerInfo));
  ok('card mostra eventos e tags do plugin', (timerInfo?.eventos || []).includes('chat') && (timerInfo?.tags || []).includes('tempo'), JSON.stringify({ eventos: timerInfo?.eventos, tags: timerInfo?.tags }));
  ok('permissões vêm com risco explicado', (timerInfo?.permissoesDetalhe || []).every((p) => p.risco && p.texto && p.porque), JSON.stringify(timerInfo?.permissoesDetalhe));

  // diagnóstico do plugin
  const doctor = await api('/plugins/castdeck.timer/doctor');
  ok('diagnóstico responde com checklist', doctor.status === 200 && Array.isArray(doctor.json?.checks) && doctor.json.checks.length >= 5, doctor.texto);
  ok('diagnóstico fica tudo certo', doctor.json?.ok === true, JSON.stringify(doctor.json?.checks?.filter((c) => !c.ok)));

  // botão do painel: iniciar 1 minuto -> overlay persistente com o tempo
  const antesPainel = msgs.length;
  const painel = await api('/plugins/castdeck.timer/panel', { method: 'POST', body: { nome: 'iniciar', dados: { minutos: 1 } } });
  ok('ação do painel chega no plugin', painel.status === 200 && painel.json?.ok === true, painel.texto);
  for (let i = 0; i < 20 && !msgs.slice(antesPainel).some((m) => m.type === 'plugin' && m.acao === 'plugin-overlay'); i++) await esperar(200);
  const overlayTimer = msgs.slice(antesPainel).find((m) => m.type === 'plugin' && m.acao === 'plugin-overlay');
  ok('cronômetro desenha o aviso no estúdio', !!overlayTimer, JSON.stringify(msgs.slice(antesPainel).slice(-3)));
  ok('aviso do cronômetro é persistente', overlayTimer?.payload?.spec?.persistente === true, JSON.stringify(overlayTimer?.payload?.spec));
  ok('aviso mostra o tempo (1:00)', /1:00/.test(String(overlayTimer?.payload?.spec?.texto || '')), String(overlayTimer?.payload?.spec?.texto));

  const cfgTimer = await api('/plugins/castdeck.timer/settings');
  ok('estado do cronômetro fica salvo para o painel', cfgTimer.json?.settings?.estado?.rodando === true, cfgTimer.texto.slice(0, 240));

  // comando de chat do cronômetro (o plugin de código recebe o evento e age na hora)
  const chatTimer = await api('/plugins/_test/chat', { method: 'POST', body: { usuario: 'bia', texto: '!timer 2' } });
  ok('comando !timer 2 chega no plugin', chatTimer.status === 200, chatTimer.texto);
  for (let i = 0; i < 25 && !msgs.some((m) => m.type === 'chat' && /Cronômetro de 2:00/.test(String(m.text || ''))); i++) await esperar(200);
  const chatLocal = msgs.find((m) => m.type === 'chat' && /Cronômetro de 2:00/.test(String(m.text || '')));
  ok('resposta do cronômetro aparece no chat do estúdio', !!chatLocal, JSON.stringify(msgs.filter((m) => m.type === 'chat').slice(-3)));

  const pararTimer = await api('/plugins/castdeck.timer/panel', { method: 'POST', body: { nome: 'parar' } });
  ok('painel consegue parar o cronômetro', pararTimer.status === 200 && pararTimer.json?.ok === true, pararTimer.texto);

  const desativaTimer = await api('/plugins/castdeck.timer/disable', { method: 'POST', body: {} });
  ok('desliga o cronômetro', desativaTimer.status === 200, desativaTimer.texto);

  // ---------- plugin malicioso é recusado ----------
  const malicioso = path.join(os.tmpdir(), 'cd-malicioso-' + crypto.randomBytes(3).toString('hex'));
  fs.mkdirSync(path.join(malicioso, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(malicioso, 'plugin.json'),
    JSON.stringify({
      id: 'com.teste.malicioso',
      name: 'Malicioso',
      version: '1.0.0',
      license: 'MIT',
      engines: { castdeck: '>=1.0.0', api: 1 },
      tier: 'code',
      entry: 'src/index.js',
      permissions: ['events:chat'],
    }),
  );
  fs.writeFileSync(path.join(malicioso, 'src', 'index.js'), "require('child_process').exec('calc');\n");
  const instMal = await api('/plugins/install', { method: 'POST', body: { pasta: malicioso } });
  ok('plugin com child_process é recusado', instMal.status === 400 && /bloqueado|perigoso/i.test(instMal.texto), instMal.texto);

  // ---------- desligar e remover ----------
  const off = await api('/plugins/castdeck.luz/disable', { method: 'POST', body: {} });
  ok('desliga a luz', off.status === 200, off.texto);
  await esperar(600);
  lista = await api('/plugins');
  ok('luz aparece desligada', lista.json?.lista?.find((p) => p.id === 'castdeck.luz')?.ativo === false, JSON.stringify(lista.json?.lista));

  const del = await api('/plugins/castdeck.chat-commands', { method: 'DELETE' });
  ok('remove chat-commands', del.status === 200, del.texto);
  lista = await api('/plugins');
  ok('chat-commands não está mais na lista', !(lista.json?.lista || []).some((p) => p.id === 'castdeck.chat-commands'), JSON.stringify(lista.json?.lista));

  ws.close();
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  await encerrar();
  try {
    fs.rmSync(DADOS, { recursive: true, force: true });
  } catch {}
}

console.log(falhas ? `\nPLUGINS_E2E_FAIL (${falhas})` : '\nPLUGINS_E2E_OK');
process.exit(falhas ? 1 : 0);
