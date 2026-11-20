// Testa a API v1: descoberta, OpenAPI, status, estúdios, ações (com estúdio aberto via WS), chat, SSE e
// autenticação por chave quando a requisição vem pela rede local (não-loopback).
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4321;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-api-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 400)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const EXE = process.env.CASTDECK_TEST_EXE || '';
const proc = spawn(EXE || process.execPath, EXE ? [] : [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let log = '';
proc.stdout.on('data', (d) => (log += d));
proc.stderr.on('data', (d) => (log += d));

const req = async (rota, opt = {}) => {
  const r = await fetch(BASE + '/api/v1' + rota, {
    method: opt.method || 'GET',
    headers: { 'content-type': 'application/json', ...(opt.headers || {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {}
  return { status: r.status, json: j, texto: t, headers: r.headers };
};

try {
  let pronto = false;
  for (let i = 0; i < 160 && !pronto; i++) {
    await esperar(600);
    try {
      pronto = (await req('/')).status === 200;
    } catch {}
  }
  ok('API responde', pronto, log.slice(-300));
  if (!pronto) throw new Error('não subiu');

  // descoberta
  const info = await req('/');
  ok('info com versão e endpoints', info.json?.api === 1 && Array.isArray(info.json?.endpoints) && info.json.endpoints.length >= 6, info.texto.slice(0, 200));
  ok('chave disponível para localhost', String(info.json?.chave || '').startsWith('cdk_'), String(info.json?.chave).slice(0, 10));
  const chave = info.json.chave;

  // openapi
  const oa = await req('/openapi.json');
  ok('OpenAPI 3 válido', oa.json?.openapi?.startsWith('3.') && !!oa.json?.paths?.['/studios/{id}/action'], oa.texto.slice(0, 120));
  ok('OpenAPI descreve as ações', (oa.json?.components?.schemas?.Acao?.properties?.tipo?.enum || []).includes('overlay.show'));

  // status
  const st = await req('/status');
  ok('status com versão', st.json?.versao && st.json?.api === 1, st.texto.slice(0, 160));
  ok('status conta estúdios', typeof st.json?.estudios === 'number', String(st.json?.estudios));

  // estúdios
  const estudos = await (await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'API Test' }) })).json();
  const sid = estudos.id || estudos.studio?.id;
  ok('estúdio criado', !!sid, JSON.stringify(estudos).slice(0, 120));
  const lista = await req('/studios');
  ok('lista de estúdios', (lista.json?.estudios || []).some((s) => s.id === sid), lista.texto.slice(0, 160));
  const um = await req('/studios/' + sid);
  ok('detalhe do estúdio', um.json?.id === sid, um.texto.slice(0, 160));
  const naoExiste = await req('/studios/inexistente');
  ok('estúdio inexistente dá 404', naoExiste.status === 404, naoExiste.texto.slice(0, 120));

  // ação com estúdio fechado -> 409
  const fechado = await req('/studios/' + sid + '/action', { method: 'POST', body: { tipo: 'overlay.show', titulo: 'X', texto: 'Y' } });
  ok('ação sem estúdio aberto dá 409', fechado.status === 409, fechado.texto.slice(0, 160));

  // abre o estúdio (host) via WS e testa as ações
  const msgs = [];
  const ws = new WebSocket(`ws://127.0.0.1:${PORTA}/ws`);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  ws.on('message', (d) => {
    try {
      msgs.push(JSON.parse(String(d)));
    } catch {}
  });
  ws.send(JSON.stringify({ type: 'join', room: sid, role: 'host' }));
  await esperar(600);

  const overlay = await req('/studios/' + sid + '/action', { method: 'POST', body: { tipo: 'overlay.show', titulo: 'API', texto: 'funcionando', segundos: 3 } });
  ok('ação overlay.show aceita', overlay.status === 200 && overlay.json?.ok === true, overlay.texto);
  await esperar(400);
  const recebeu = msgs.find((m) => m.type === 'api' && m.acao?.tipo === 'overlay.show');
  ok('estúdio recebeu a ação', !!recebeu && recebeu.acao.titulo === 'API', JSON.stringify(msgs.slice(-3)));

  const chat = await req('/studios/' + sid + '/action', { method: 'POST', body: { tipo: 'chat.send', texto: 'ola da api' } });
  ok('chat.send aceito', chat.status === 200, chat.texto);
  await esperar(300);
  ok('chat aparece no estúdio', msgs.some((m) => m.type === 'chat' && m.name === 'API' && m.text === 'ola da api'), JSON.stringify(msgs.slice(-3)));

  const cena = await req('/studios/' + sid + '/action', { method: 'POST', body: { tipo: 'scene.set', layout: 'solo' } });
  ok('scene.set aceito', cena.status === 200, cena.texto);
  const invalida = await req('/studios/' + sid + '/action', { method: 'POST', body: { tipo: 'fazer.cafe' } });
  ok('ação inválida dá 400 com lista', invalida.status === 400 && Array.isArray(invalida.json?.acoes), invalida.texto.slice(0, 160));

  // SSE: recebe eventos (chat via API + evento de plugin)
  const ctrl = new AbortController();
  const sse = await fetch(BASE + '/api/v1/events', { signal: ctrl.signal, headers: { accept: 'text/event-stream' } });
  ok('SSE conecta', sse.status === 200 && /text\/event-stream/.test(sse.headers.get('content-type') || ''), String(sse.status));
  const leitor = sse.body.getReader();
  const dec = new TextDecoder();
  let buffer = '';
  const ler = async (ms) => {
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        if (buffer.includes('event: plugin') || buffer.includes('event: chat')) break;
      }
    } catch {}
    clearTimeout(t);
  };
  await req('/studios/' + sid + '/action', { method: 'POST', body: { tipo: 'chat.send', texto: 'evento sse' } });
  await ler(4000);
  ok('SSE recebe evento de chat', /event: chat/.test(buffer), buffer.slice(0, 200));

  ws.close();

  // autenticação: pela rede local (IP da máquina) exige chave
  const osmod = os.networkInterfaces();
  const ip = Object.values(osmod).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  if (ip) {
    const semChave = await fetch(`http://${ip}:${PORTA}/api/v1/status`).then((r) => r.status).catch(() => 0);
    ok('rede sem chave é 401', semChave === 401, String(semChave));
    const comChave = await fetch(`http://${ip}:${PORTA}/api/v1/status`, { headers: { authorization: 'Bearer ' + chave } }).then((r) => r.status).catch(() => 0);
    ok('rede com chave é 200', comChave === 200, String(comChave));
    const chaveErrada = await fetch(`http://${ip}:${PORTA}/api/v1/status`, { headers: { 'x-castdeck-key': 'errada' } }).then((r) => r.status).catch(() => 0);
    ok('chave errada é 401', chaveErrada === 401, String(chaveErrada));
  } else {
    console.log('AVISO sem IP de rede para testar autenticação');
  }
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { proc.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nAPI_V1_FAIL (${falhas})` : '\nAPI_V1_OK');
process.exit(falhas ? 1 : 0);
