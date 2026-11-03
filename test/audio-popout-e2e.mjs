// SPDX-License-Identifier: AGPL-3.0-only
// Teste e2e do painel de áudio: botão de destacar (popout), sincronização com popout e áudio de tela/janela.
// Requer servidor (:3100) e Edge com CDP (:9333).
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const v = await (await fetch(`${CDP}/json/version`)).json();
const bws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let bid = 0;
const bp = new Map();
bws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && bp.has(m.id)) {
    bp.get(m.id)(m);
    bp.delete(m.id);
  }
};
const bsend = (method, params = {}) =>
  new Promise((r) => {
    const i = ++bid;
    bp.set(i, r);
    bws.send(JSON.stringify({ id: i, method, params }));
  });

async function open(url) {
  const { result } = await bsend('Target.createTarget', { url: 'about:blank' });
  const ws = new WebSocket(`ws://127.0.0.1:9333/devtools/page/${result.targetId}`);
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
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
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
  await send('Page.bringToFront');
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result.result.value;
  };
  await send('Page.navigate', { url });
  return { ev, errors, send, close: () => bsend('Target.closeTarget', { targetId: result.targetId }) };
}

const waitFor = async (p, expr, ms = 15000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      if (await p.ev(expr)) return true;
    } catch {}
    await sleep(150);
  }
  return false;
};

let fails = 0;
const check = (n, ok, extra = '') => {
  console.log(ok ? 'OK   ' : 'FALHA', n, ok ? '' : extra);
  if (!ok) fails++;
};
const post = (p, b) =>
  fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());

const studio = await post('/api/studios', { name: 'Audio Popout E2E' });
const host = await open(`${base}/studio/${studio.id}?lang=pt`);
await host.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });
await waitFor(host, `!!document.querySelector('#lb-go')`);
await sleep(1000);
await host.ev(`document.querySelector('#lb-go').click()`);
check('estúdio abriu', await waitFor(host, `!!document.querySelector('#program-canvas')`));
await sleep(1000);

// Abre aba de áudio
await host.ev(`document.querySelector('[data-tab="audio"]')?.click()`);
await sleep(500);

// 1) Botão de destacar existe no painel de áudio
const hasPopoutBtn = await host.ev(`!!document.querySelector('#ax-btn-popout')`);
check('botão #ax-btn-popout existe no painel de áudio', hasPopoutBtn);

const popoutBtnText = await host.ev(`document.querySelector('#ax-btn-popout')?.textContent.trim()`);
check('botão tem rótulo "Destacar janela"', popoutBtnText && popoutBtnText.includes('Destacar'));

// 2) Abre a janela popout simulada e conecta ao opener
const popoutTest = await host.ev(`(async () => {
  let openedUrl = null;
  const origOpen = window.open;
  window.open = (url, name, feat) => {
    openedUrl = url;
    return origOpen.call(window, url, name, feat);
  };
  document.querySelector('#ax-btn-popout').click();
  return openedUrl;
})()`);
check('clique no botão chama window.open com /audio-popout.html', popoutTest === '/audio-popout.html');

// 3) Carrega /audio-popout.html diretamente com window.opener simulado
const popPage = await host.ev(`(async () => {
  const iframe = document.createElement('iframe');
  iframe.id = 'test-popout-frame';
  iframe.src = '/audio-popout.html';
  iframe.style.cssText = 'position:fixed;bottom:10px;right:10px;width:500px;height:600px;z-index:9999;border:2px solid purple';
  document.body.appendChild(iframe);
  await new Promise(r => iframe.onload = r);
  // simula window.opener apontando para o host
  iframe.contentWindow.opener = window;
  window._audioPopout = iframe.contentWindow;
  iframe.contentWindow.init?.();
  await new Promise(r => setTimeout(r, 800));
  const doc = iframe.contentDocument;
  const status = doc.querySelector('#pop-status')?.textContent;
  const masterVu = !!doc.querySelector('[data-vu="__L"]');
  const hostMic = !!doc.querySelector('[data-ch="host:mic"]');
  return { status, masterVu, hostMic };
})()`);
check('popout conectou com sucesso ao estúdio', popPage && popPage.status && popPage.status.includes('Conectado'));
check('popout exibe medidores Master PGM', popPage && popPage.masterVu);
check('popout exibe canal de microfone do host', popPage && popPage.hostMic);

// 4) Teste de compartilhamento de tela/janela SEM áudio
await host.ev(`(() => {
  const c = document.createElement('canvas'); c.width = 640; c.height = 360;
  const stream = c.captureStream(10);
  __castdeck.addVideoSource('host:screen', stream, { kind: 'screen', label: 'Janela de Apresentação', ownerId: 'host' });
  __castdeck.renderAudioPanel();
})()`);
await sleep(400);

const noAudioCheck = await host.ev(`(() => {
  const row = document.querySelector('#panel-audio .ch-no-audio');
  const tag = row?.querySelector('.ch-tag')?.textContent;
  const badge = row?.querySelector('.badge')?.textContent;
  const hasVu = !!row?.querySelector('[data-vu]');
  const hasFader = !!row?.querySelector('[data-fader]');
  const hasPrompt = !!row?.querySelector('.ch-audio-prompt');
  return { hasRow: !!row, tag, badge, hasVu, hasFader, hasPrompt };
})()`);
check('janela sem som tem tag, badge, VU e fader prontos', noAudioCheck && noAudioCheck.hasRow && noAudioCheck.hasVu && noAudioCheck.hasFader && noAudioCheck.hasPrompt);

// 5) Teste de compartilhamento de tela/janela COM áudio
await host.ev(`(() => {
  const C = __castdeck;
  const ctx = C.mixer.ctx;
  const osc = ctx.createOscillator();
  const dest = ctx.createMediaStreamDestination();
  osc.connect(dest);
  osc.start();
  C.mixer.addStream('host:screen:audio', dest.stream, { ownerId: 'host', stageKey: 'host:screen', monitor: false });
  C.renderAudioPanel();
})()`);
await sleep(400);

const hasAudioCheck = await host.ev(`(() => {
  const row = document.querySelector('#panel-audio [data-ch="host:screen:audio"]');
  const isNoAudio = row?.classList.contains('ch-no-audio');
  const hasFader = !!row?.querySelector('[data-fader="host:screen:audio"]');
  const hasVu = !!row?.querySelector('[data-vu="host:screen:audio"]');
  return { hasRow: !!row, isNoAudio, hasFader, hasVu };
})()`);
check('janela com áudio exibe fader e medidor VU normalmente', hasAudioCheck && hasAudioCheck.hasRow && !hasAudioCheck.isNoAudio && hasAudioCheck.hasFader && hasAudioCheck.hasVu);

const lvl = await host.ev(`__castdeck.mixer.levelDb('host:screen:audio')`);
console.log('NÍVEL MEDIDO DO VU DA TELA:', JSON.stringify(lvl));
check('VU da tela modula nível de áudio (peak > -60 dBFS)', lvl.peak > -60, `valor: ${lvl.peak}`);

// 6) Popout sincronizou a adição da tela/janela
const popoutSyncCheck = await host.ev(`(() => {
  const iframe = document.querySelector('#test-popout-frame');
  const doc = iframe?.contentDocument;
  const row = doc?.querySelector('[data-ch="host:screen:audio"]');
  const hasFader = !!row?.querySelector('[data-fader="host:screen:audio"]');
  return { hasRow: !!row, hasFader };
})()`);
check('janela popout sincronizou o canal de áudio da tela/janela', popoutSyncCheck && popoutSyncCheck.hasRow && popoutSyncCheck.hasFader);

// Limpa frame de teste
await host.ev(`document.querySelector('#test-popout-frame')?.remove()`);
await host.close();
bws.close();

console.log(`\nFim do teste: ${fails === 0 ? 'TODOS OS TESTES PASSARAM!' : `${fails} FALHA(S)`}`);
process.exit(fails === 0 ? 0 : 1);
