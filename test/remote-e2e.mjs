// SPDX-License-Identifier: AGPL-3.0-only
// e2e do controle remoto por celular (QR). Uso: SCRIPT=test/remote-e2e.mjs node test/run-audio-test.mjs
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());
let fails = 0;
const check = (n, ok, d = '') => { console.log(ok ? 'OK   ' : 'FALHA', n, ok ? '' : d); if (!ok) fails++; };

async function open(url, mobile) {
  const t = await (await fetch(`${CDP}/json/new?${url}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pend = new Map();
  const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    pend.get(m.id)?.(m);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result.result.value;
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', mobile ? { width: 390, height: 800, deviceScaleFactor: 2, mobile: true } : { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });
  const waitFor = async (expr, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return true; await sleep(150); } return false; };
  return { ev, send, errors, waitFor };
}

const studio = await post('/api/studios', { name: 'Remote E2E' });
const host = await open(`${base}/studio/${studio.id}?lang=pt`);
await host.waitFor(`document.querySelector('#lb-go') && !document.querySelector('#lb-go').disabled`, 8000);
await host.ev(`document.querySelector('#lb-go').click()`);
await host.waitFor(`!document.querySelector('.lobby')`, 8000);
await host.waitFor(`!!window.__castdeck?.switchTab`, 8000);
await host.ev(`__castdeck.switchTab('director')`);

check('painel Diretor tem a caixa do controle remoto', await host.waitFor(`!!document.querySelector('#remote-box .rc-qr svg')`, 8000));
const url = await host.ev(`document.querySelector('#remote-box .rc-url, .rc-url')?.textContent || ''`);
check('link tem /remote/ e chave k=', /\/remote\/.+\?k=\w+/.test(url), url);
check('mostra 0 controles', /Nenhum controle/.test(await host.ev(`document.querySelector('[data-rc=count]')?.textContent || ''`)));

// link inválido (sem chave) deve ser recusado
const bad = await open(`${base}/remote/${studio.id}?k=errada`, true);
check('chave errada: tela de erro', await bad.waitFor(`document.querySelector('#err').classList.contains('show')`));

const path = new URL(url).pathname + new URL(url).search;
const rem = await open(base + path, true);
check('celular conecta e lista fontes', await rem.waitFor(`document.querySelectorAll('#tab-mesa .src').length >= 1`, 8000));
check('host mostra 1 controle conectado', await host.waitFor(`/1 controle/.test(document.querySelector('[data-rc=count]')?.textContent||'')`));
const nSrc = await rem.ev(`document.querySelectorAll('#tab-mesa .src').length`);

// mesa de corte: ligar, prévia, corte
await rem.ev(`document.querySelector('[data-act=sw-on]')?.click()`);
check('ligar mesa pelo celular', await host.waitFor(`__castdeck.S.switcher === true`));
check('celular mostra CORTE/AUTO/FTB', await rem.waitFor(`!!document.querySelector('.trans .cut')`));
await rem.ev(`document.querySelector('#tab-mesa .src:not(.pgm)')?.click()`);
check('toque na fonte define a PRÉVIA no host', await host.waitFor(`!!__castdeck.S.pvw`));
const pvw = await host.ev(`__castdeck.S.pvw`);
await rem.ev(`document.querySelector('.trans .cut').click()`);
check('CORTE leva a prévia ao ar', await host.waitFor(`__castdeck.S.take === ${JSON.stringify(pvw)}`));
check('celular reflete NO AR', await rem.waitFor(`document.querySelector('.busbox.pgm b')?.textContent.length > 0 && !!document.querySelector('#tab-mesa .src.pgm')`));
await rem.ev(`document.querySelector('.trans .ftb').click()`);
check('FTB pelo celular', await host.waitFor(`__castdeck.S.ftb === true`));
await rem.waitFor(`!!document.querySelector('.trans .ftb.on')`);
await rem.ev(`document.querySelector('.trans .ftb').click()`);
check('FTB desliga', await host.waitFor(`!__castdeck.S.ftb`));

// layout e palco
await rem.ev(`document.querySelector('nav button[data-tab=cena]').click()`);
await rem.waitFor(`document.querySelectorAll('#tab-cena .lay button').length > 2`);
await rem.ev(`[...document.querySelectorAll('#tab-cena .lay button')].find(b=>b.dataset.id==='sidebar')?.click()`);
check('layout pelo celular', await host.waitFor(`__castdeck.S.layout === 'sidebar'`));

// GC rápido
await rem.ev(`document.querySelector('nav button[data-tab=gc]').click()`);
await rem.waitFor(`!!document.querySelector('#q-title')`);
await rem.ev(`document.querySelector('#q-title').value='Maria Silva'; document.querySelector('[data-act=quick]').click()`);
check('faixa rápida pelo celular', await host.waitFor(`!!__castdeck.S.activeBanner`));

// Diretor automático
await rem.ev(`document.querySelector('nav button[data-tab=audio]').click()`);
await rem.waitFor(`!!document.querySelector('[data-act=director]')`);
await rem.ev(`document.querySelector('[data-act=director]').click()`);
check('Diretor ligado pelo celular', await host.waitFor(`__castdeck.autoVoice.on === true`));
await rem.waitFor(`!!document.querySelector('.row.on[data-act=director]')`);
await rem.ev(`document.querySelector('[data-act=director]').click()`);
check('Diretor desligado pelo celular', await host.waitFor(`__castdeck.autoVoice.on === false`));

// vídeo opcional
await rem.ev(`document.querySelector('nav button[data-tab=mesa]').click()`);
await rem.ev(`document.querySelector('#btn-video').click()`);
check('host sabe que há 1 controle com vídeo', await host.waitFor(`/1 com v/.test(document.querySelector('[data-rc=count]')?.textContent||'')`));
check('celular recebe quadros do PGM', await rem.waitFor(`/^data:image\\/jpeg/.test(document.querySelector('#frame')?.src||'')`, 8000));
await rem.ev(`document.querySelector('#btn-video').click()`);
check('desligar vídeo avisa o host', await host.waitFor(`!/com v/.test(document.querySelector('[data-rc=count]')?.textContent||'')`));

// tela cheia
check('botão tela cheia existe', await rem.waitFor(`!!document.querySelector('#btn-fs')`));
await rem.ev(`document.querySelector('#btn-fs').click()`);

// aba de mensagens e chat
await rem.ev(`document.querySelector('nav button[data-tab=msgs]').click()`);
check('aba de mensagens visível', await rem.waitFor(`document.querySelector('#tab-msgs').classList.contains('active')`));
// mensagens do público/WhatsApp: o celular coloca e retira do ar
await host.ev(`__castdeck.messages.external({ id:'remote-test-msg', sender:'teste', name:'Remoto', text:'Mensagem pelo celular' })`);
check('controle vê mensagem do programa', await rem.waitFor(`!!document.querySelector('.rmsg')`));
await rem.ev(`document.querySelector('.rmsg').click()`);
check('controle coloca mensagem no ar', await host.waitFor(`__castdeck.messages.airId === 'remote-test-msg'`));
await rem.ev(`document.querySelector('.rmsg').click()`);
check('controle retira mensagem do ar', await host.waitFor(`__castdeck.messages.airId !== 'remote-test-msg'`));

// envio de chat pelo controle remoto
await rem.ev(`
  document.querySelector('#chat-input').value = 'Aviso dos bastidores';
  document.querySelector('#chat-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
`);
check('chat enviado pelo celular chega ao host', await host.waitFor(`(__castdeck.S.chat || []).some(m => m.text === 'Aviso dos bastidores')`, 6000));
check('mensagem de chat aparece na lista do celular', await rem.waitFor(`[...document.querySelectorAll('.chat-text')].some(el => el.textContent.includes('Aviso dos bastidores'))`, 6000));

// mensagem rápida na tela via aba msgs
await rem.ev(`
  document.querySelector('#msg-screen-title').value = 'Urgente';
  document.querySelector('#msg-screen-sub').value = 'Entramos em 1 minuto';
  document.querySelector('[data-act=send-screen-msg]').click();
`);
check('mensagem rápida colocada na tela do estúdio', await host.waitFor(`__castdeck.S.activeBanner === 'cohost:quick'`, 6000));
await rem.ev(`document.querySelector('[data-act=hide-screen-msg]').click()`);
check('ocultar mensagem rápida da tela', await host.waitFor(`!__castdeck.S.activeBanner`, 6000));

// teste de mídia e mini-player
await host.ev(`
  const fakeAudio = document.createElement('audio');
  fakeAudio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  __castdeck.S.sources.set('media-test', {
    id: 'media-test',
    kind: 'media',
    label: 'Trilha Sonora',
    camOff: true,
    el: fakeAudio
  });
`);
await host.ev(`__castdeck.remote?.sync?.()`);
await sleep(600);
check('mini player detecta mídia ativa', await rem.waitFor(`!document.querySelector('#mini-player').hidden && document.querySelector('#mp-title')?.textContent.includes('Trilha Sonora')`, 6000));
await rem.ev(`document.querySelector('#mp-stage').click()`);
check('colocar mídia no palco via mini player', await host.waitFor(`__castdeck.S.stage.includes('media-test')`, 6000));
await rem.waitFor(`document.querySelector('#mp-stage.on')`, 6000);
await rem.ev(`document.querySelector('#mp-stage').click()`);
// teste de volume master e faders na aba áudio
await rem.ev(`document.querySelector('nav button[data-tab=audio]').click()`);
check('aba áudio visível', await rem.waitFor(`document.querySelector('#tab-audio').classList.contains('active')`));
check('card master pgm visível', await rem.waitFor(`!!document.querySelector('.master-box [data-act=master-slider]')`));
await rem.ev(`
  const slider = document.querySelector('.master-box [data-act=master-slider]');
  slider.value = '75';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
`);
check('slider master ajusta volume no estúdio para 0.75', await host.waitFor(`Math.abs((__castdeck.mixer?.master ?? 1) - 0.75) < 0.05`, 6000));
await rem.ev(`document.querySelector('[data-act=mute-master]').click()`);
check('botão mudo master silencia o programa', await host.waitFor(`__castdeck.mixer?.master === 0`, 6000));
await rem.waitFor(`document.querySelector('[data-act=mute-master]')?.textContent?.includes('Desmutar')`, 6000);
await rem.ev(`document.querySelector('[data-act=mute-master]').click()`);
check('botão mudo master desmuta o programa', await host.waitFor(`__castdeck.mixer?.master > 0`, 6000));

// monitoramento de áudio PGM pelo celular (WebRTC)
await rem.ev(`document.querySelector('#btn-audio').click()`);
check('botão de áudio ativado', await rem.waitFor(`document.querySelector('#btn-audio').classList.contains('on')`));
check('celular recebe faixa de áudio PGM via WebRTC', await rem.waitFor(`(document.querySelector('#audio-pgm')?.srcObject?.getAudioTracks().length || 0) > 0`, 8000));
await rem.ev(`document.querySelector('#btn-audio').click()`);
check('desligar monitoramento de áudio limpa o stream', await rem.waitFor(`!document.querySelector('#audio-pgm')?.srcObject`, 6000));

await host.ev(`__castdeck.floatWins.close('director')`); // janela flutuante persiste entre execuções
await sleep(2500); // dá tempo do Edge gravar o localStorage antes de ser encerrado
check('sem erros JS no celular', rem.errors.length === 0, JSON.stringify(rem.errors));
check('sem erros JS no host', host.errors.filter((e) => !/Receiving end/.test(e)).length === 0, JSON.stringify(host.errors));
console.log(`fontes vistas: ${nSrc}`);
console.log(fails ? `${fails} falha(s)` : 'tudo certo');
process.exit(fails ? 1 : 0);
