// Teste de UI da busca rápida (paleta): agrupamento no estado vazio, ranqueamento, sinônimos,
// destaque de match, estado vazio de busca e MRU ("Recentes").
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4457;
const CDP = 9491;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-cmd-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 320)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = spawn(process.execPath, [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: 'ignore',
  windowsHide: true,
});
const perfil = path.join(os.tmpdir(), 'cd-cmd-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', 'about:blank'], { stdio: 'ignore', windowsHide: true });

try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) {
    await esperar(600);
    try { pronto = (await fetch(BASE + '/')).ok; } catch {}
  }
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Busca' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;

  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) {
    await esperar(500);
    try { alvo = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
  }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0;
  const pend = new Map();
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  const cmd = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => {
    const r = await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception?.description || '').slice(0, 300));
    return r.result?.result?.value;
  };
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: `${BASE}/studio/${sid}` });
  await esperar(3500);
  await ev(`document.querySelector('#lb-go')?.click()`);
  for (let i = 0; i < 40; i++) { if (await ev(`!!document.querySelector('#program-canvas')`)) break; await esperar(500); }
  await esperar(1000);

  const abrir = () => ev(`document.querySelector('#btn-cmd').click()`);
  const digitar = (txt) => ev(`(() => { const i = document.querySelector('#cmd-input'); i.value = ${JSON.stringify(txt)}; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const fechar = () => ev(`document.querySelectorAll('.modal-back').forEach((m) => m.remove())`);

  // estado vazio: agrupado (Ações + Painéis) + rodapé
  await abrir();
  await esperar(500);
  const vazio = await ev(`(() => {
    const grupos = [...document.querySelectorAll('.cmd-group')].map((g) => g.textContent);
    const total = document.querySelectorAll('.cmd-item').length;
    const rodape = document.querySelector('#cmd-footer')?.textContent || '';
    return { grupos, total, rodape };
  })()`);
  ok('estado vazio agrupa Ações e Painéis', vazio.grupos.includes('Ações') && vazio.grupos.includes('Painéis'), JSON.stringify(vazio.grupos));
  ok('estado vazio lista todos (ações + painéis) e mostra rodapé', vazio.total >= 30 && /navegar/.test(vazio.rodape), JSON.stringify({ total: vazio.total, rodape: vazio.rodape }));

  // sinônimo: "chave" acha Destinos; "instagram" acha Redes; "replay" acha a ação
  await digitar('chave');
  await esperar(400);
  const r1 = await ev(`[...document.querySelectorAll('.cmd-item strong')].map((x) => x.textContent.trim())`);
  ok('"chave" acha Destinos', r1.includes('Destinos'), JSON.stringify(r1.slice(0, 6)));

  await digitar('instagram');
  await esperar(400);
  const r2 = await ev(`[...document.querySelectorAll('.cmd-item strong')].map((x) => x.textContent.trim())`);
  ok('"instagram" acha Redes', r2.includes('Redes'), JSON.stringify(r2.slice(0, 6)));

  await digitar('replay');
  await esperar(400);
  const r3 = await ev(`[...document.querySelectorAll('.cmd-item strong')].map((x) => x.textContent.trim())`);
  ok('"replay" acha a ação Replay & VAR', r3.includes('Abrir Replay & VAR'), JSON.stringify(r3.slice(0, 6)));

  // destaque de match + ranqueamento (prefixo no topo)
  await digitar('gc');
  await esperar(400);
  const r4 = await ev(`(() => {
    const primeiro = document.querySelector('.cmd-item strong');
    const temMark = !!document.querySelector('.cmd-item mark');
    return { primeiro: primeiro?.textContent.trim() || '', temMark };
  })()`);
  ok('"gc" destaca o match (<mark>) e põe Grafismo no topo', r4.temMark === true && /Grafismo/i.test(r4.primeiro), JSON.stringify(r4));

  // sem resultado
  await digitar('zzzzxx');
  await esperar(400);
  const r5 = await ev(`!!document.querySelector('.cmd-list .empty')`);
  ok('busca sem resultado mostra estado vazio claro', r5 === true);

  // MRU: selecionar "Mídia" grava e reaparece em "Recentes"
  await fechar();
  await abrir();
  await esperar(400);
  await digitar('midia');
  await esperar(400);
  await ev(`document.querySelector('.cmd-item')?.click()`);
  await esperar(400);
  const mru = await ev(`JSON.parse(localStorage.getItem('castdeck.cmd.mru.v1') || '[]')`);
  ok('selecionar um painel grava no MRU', Array.isArray(mru) && mru[0] === 'tab:media', JSON.stringify(mru));
  await abrir();
  await esperar(400);
  const rec = await ev(`[...document.querySelectorAll('.cmd-group')].map((g) => g.textContent)`);
  ok('reabrindo, "Recentes" aparece primeiro', rec[0] === 'Recentes', JSON.stringify(rec));

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
console.log(falhas ? `\nCMD_UI_FAIL (${falhas})` : '\nCMD_UI_OK');
process.exit(falhas ? 1 : 0);
