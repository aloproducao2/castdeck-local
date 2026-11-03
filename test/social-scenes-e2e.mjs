// SPDX-License-Identifier: AGPL-3.0-only
// Teste e2e: barra de cenas rápidas colapsável (F1–F6) e novo painel de Redes com ênfase nas mensagens
import { spawn } from 'node:child_process';

const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, info = '') => {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, info);
};

async function openPage(url, { w = 1400, h = 900 } = {}) {
  const t = await (await fetch(`${CDP}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text;
      if (!/Receiving end does not exist/.test(d || '')) errors.push(d);
    }
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pend.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result.result.value;
  };
  await send('Page.navigate', { url });
  return { ev, send, errors, close: () => fetch(`${CDP}/json/close/${t.id}`) };
}
const waitFor = async (p, expr, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await p.ev(expr)) return true;
    } catch {}
    await sleep(300);
  }
  return false;
};

const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'SCENES SOCIAL' }) })).json();
const host = await openPage(`${base}/studio/${studio.id}?lang=pt`);
try {
  await waitFor(host, `!!document.querySelector('#lb-go')`);
  await sleep(1000);
  await host.ev(`document.querySelector('#lb-go').click()`);
  check('estúdio abriu', await waitFor(host, `!!document.querySelector('#program-canvas') && !!window.__castdeck`));

  // ==========================================
  // 1. Cenas rápidas colapsáveis (#qscenes)
  // ==========================================
  const qsBox = await host.ev(`!!document.querySelector('#qscenes')`);
  check('barra de cenas existe', qsBox);

  // Inicialmente expandida
  check('cenas tem botão qs-toggle', await host.ev(`!!document.querySelector('#qs-toggle')`));
  check('cenas tem botões F1..F6 visíveis', await host.ev(`document.querySelectorAll('#qscenes .qs').length === 6`));

  // Clica no toggle para colapsar
  await host.ev(`document.querySelector('#qs-toggle').click()`);
  await sleep(300);
  check('cenas colapsou (.collapsed)', await host.ev(`document.querySelector('#qscenes').classList.contains('collapsed')`));
  check('estado gravado no localStorage', await host.ev(`localStorage.getItem('castdeck.scenes.collapsed') === '1'`));
  check('botões de cena sumiram no modo colapsado', await host.ev(`document.querySelectorAll('#qscenes .qs').length === 0`));

  // Clica no toggle para re-expandir
  await host.ev(`document.querySelector('#qs-toggle').click()`);
  await sleep(300);
  check('cenas expandiu de volta', await host.ev(`!document.querySelector('#qscenes').classList.contains('collapsed') && document.querySelectorAll('#qscenes .qs').length === 6`));
  check('localStorage atualizado para 0', await host.ev(`localStorage.getItem('castdeck.scenes.collapsed') === '0'`));

  // ==========================================
  // 2. Painel de Redes Sociais com Foco nas Mensagens
  // ==========================================
  await host.ev(`document.querySelector('.studio').classList.add('panel-open')`);
  // Abre o grupo Público e a aba Redes
  await host.ev(`document.querySelector('.grp[data-group=audience]').click()`);
  await sleep(300);
  await host.ev(`document.querySelector('.tab[data-tab=social]').click()`);
  await sleep(400);

  check('painel Redes está ativo e visível', await host.ev(`document.querySelector('#panel-social').classList.contains('active')`));
  check('topo tem barra compacta e não tem acordeons abertos', await host.ev(`!!document.querySelector('.soc-top-bar') && !document.querySelector('.soc-acc')`));
  check('gavetas de conexão e opções começam fechadas', await host.ev(`document.querySelector('#soc-box-connect').hidden && document.querySelector('#soc-box-options').hidden`));
  check('mostra empty state acolhedor', await host.ev(`document.querySelector('.soc-empty-box') !== null`));

  // Clica no botão de opções e vê a gaveta abrir
  await host.ev(`document.querySelector('#soc-btn-options').click()`);
  await sleep(200);
  check('gaveta de opções abriu ao clicar', await host.ev(`!document.querySelector('#soc-box-options').hidden`));

  // Desliga autoSuperChat para testar o clique manual no botão Colocar no ar
  await host.ev(`(()=>{const c = document.querySelector('#soc-autosc'); c.checked = false; c.dispatchEvent(new Event('change'));})()`);

  // Simula uma mensagem
  await host.ev(`document.querySelector('#soc-test').click()`);
  await sleep(400);

  // Fecha gaveta
  await host.ev(`document.querySelector('#soc-close-options').click()`);
  await sleep(200);
  check('gaveta fechou', await host.ev(`document.querySelector('#soc-box-options').hidden`));

  // Verifica que a mensagem está na lista em destaque
  check('mensagem simulada apareceu na lista', await host.ev(`document.querySelectorAll('#soc-list .soc-msg').length >= 1`));

  // Coloca a mensagem no ar
  await host.ev(`document.querySelector('#soc-list .soc-msg:last-child [data-act=toggle]').click()`);
  await sleep(400);
  check('banner NO AR NO PROGRAMA apareceu', await host.ev(`document.querySelector('#soc-cur-air').style.display !== 'none'`));
  check('card está com classe .on', await host.ev(`document.querySelector('#soc-list .soc-msg.on') !== null`));

  // Tira a mensagem do ar
  await host.ev(`document.querySelector('#soc-cur-hide').click()`);
  await sleep(400);
  check('banner NO AR sumiu após tirar', await host.ev(`document.querySelector('#soc-cur-air').style.display === 'none'`));
  check('card não está mais com classe .on', await host.ev(`document.querySelector('#soc-list .soc-msg.on') === null`));

} finally {
  await host.close();
}

console.log(fails === 0 ? '\nTODOS OS TESTES PASSARAM!' : `\n${fails} TESTE(S) FALHARAM!`);
process.exit(fails ? 1 : 0);
