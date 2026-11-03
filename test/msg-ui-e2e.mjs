// E2E (Edge real via CDP): abas Interação/Mensagens e Configurar/Exibição no estúdio, mensagem do público
// chegando na lista, indo ao ar (widget no programa) e página pública /msg renderizando o formulário.
// Uso: BASE=http://localhost:3100 node test/msg-ui-e2e.mjs   (Edge com --remote-debugging-port=9333)
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
  const shot = async (file) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    (await import('node:fs')).writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  };
  await send('Page.navigate', { url });
  return { ev, send, errors, shot, close: () => fetch(`${CDP}/json/close/${t.id}`) };
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
const OUT = process.env.SHOTS || '';

const studio = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'MSG UI' }) })).json();
const host = await openPage(`${base}/studio/${studio.id}?lang=pt`);
try {
  await waitFor(host, `!!document.querySelector('#lb-go')`);
  await sleep(1200);
  await host.ev(`document.querySelector('#lb-go').click()`);
  check('estúdio abriu', await waitFor(host, `!!document.querySelector('#program-canvas') && !!window.__castdeck`));
  await host.ev(`document.querySelector('.studio').classList.add('panel-open')`);

  // ---- organização das abas: Interatividade e Público separados
  const grps = await host.ev(`[...document.querySelectorAll('.grp')].map(g=>g.dataset.group+':'+g.textContent.trim())`);
  check('grupo Público existe', grps.some((g) => g.startsWith('audience:Público')), grps.join(' | '));
  check('grupo Interatividade existe', grps.some((g) => g.startsWith('interaction:Interatividade')), grps.join(' | '));
  await host.ev(`document.querySelector('.grp[data-group=audience]').click()`);
  await sleep(300);
  const aud = await host.ev(`[...document.querySelectorAll('.subtabs .tab:not([hidden])')].map(t=>t.dataset.tab)`);
  check('Público: chat e redes', aud.join(',') === 'chat,social', aud.join(','));

  await host.ev(`document.querySelector('.grp[data-group=interaction]').click()`);
  await sleep(300);
  const inter = await host.ev(`[...document.querySelectorAll('.subtabs .tab:not([hidden])')].map(t=>t.dataset.tab)`);
  check('Interatividade: enquetes e mensagens', inter.join(',') === 'widgets,messages', inter.join(','));

  // ---- Configurar → Exibição
  await host.ev(`document.querySelector('.tab[data-tab=display]').click()`);
  await sleep(300);
  check('Exibição tem Nomes na tela e Espaçamento', await host.ev(`(()=>{const t=document.querySelector('#panel-display').textContent;return t.includes('Nomes na tela')&&t.includes('Espaçamento e cantos')&&!!document.querySelector('#panel-display #b-corner')})()`));
  await host.ev(`document.querySelector('#panel-display #b-padding button[data-v=wide]').click()`);
  await sleep(200);
  check('trocar espaçamento em Exibição aplica na marca', await host.ev(`window.__castdeck.S.brand.padding==='wide'`));
  await host.ev(`(()=>{const c=document.querySelector('#panel-display #b-names');c.checked=false;c.dispatchEvent(new Event('change'))})()`);
  check('desligar nomes em Exibição aplica', await host.ev(`window.__castdeck.S.brand.showNames===false`));
  await host.ev(`(()=>{const c=document.querySelector('#panel-display #b-names');c.checked=true;c.dispatchEvent(new Event('change'))})()`);
  await host.ev(`document.querySelector('.tab[data-tab=brand]').click()`);
  await sleep(300);
  check('Marca não tem mais Nomes na tela', await host.ev(`!document.querySelector('#panel-brand #b-names') && !document.querySelector('#panel-brand').textContent.includes('Espaçamento e cantos')`));

  // ---- Mensagens
  await host.ev(`document.querySelector('.tab[data-tab=messages]').click()`);
  check('painel Mensagens renderizou', await waitFor(host, `!!document.querySelector('#mb-status #mb-open')`));
  await host.ev(`document.querySelector('#mb-open').click()`);
  await sleep(300);
  check('recebimento aberto', await host.ev(`document.querySelector('#mb-status').classList.contains('on')`));
  // espera a caixa publicada no servidor
  let box = null;
  for (let i = 0; i < 20 && !box?.open; i++) {
    await sleep(400);
    box = (await (await fetch(`${base}/api/public/msg/${studio.id}`)).json()).box;
  }
  check('caixa publicada e aberta no servidor', box?.open === true, JSON.stringify(box));

  // página pública
  const pub = await openPage(`${base}/msg/${studio.id}?lang=pt`, { w: 420, h: 860 });
  check('página pública mostra o formulário', await waitFor(pub, `!!document.querySelector('#m-text') && !!document.querySelector('#m-send')`));
  await pub.ev(`(()=>{const n=document.querySelector('#m-name');n.value='Carla';n.dispatchEvent(new Event('input'));const t=document.querySelector('#m-text');t.value='Bom dia, estúdio! Manda um salve para Recife.';t.dispatchEvent(new Event('input'))})()`);
  await sleep(200);
  check('botão Enviar habilita com texto', await pub.ev(`!document.querySelector('#m-send').disabled`));
  if (OUT) await pub.shot(`${OUT}/msg_public_form.png`);
  await pub.ev(`document.querySelector('#m-send').click()`);
  check('página confirma o envio', await waitFor(pub, `!!document.querySelector('.sent')`));
  if (OUT) await pub.shot(`${OUT}/msg_public_sent.png`);
  await host.send('Page.bringToFront');

  // um áudio direto pela API (gravação real não roda sem microfone)
  const wav = (() => {
    // WAV de 1,2 s com um tom (44 bytes de cabeçalho + PCM 16 bits mono 8 kHz)
    const sr = 8000, n = Math.round(sr * 1.2), b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((i / sr) * 2 * Math.PI * 440) * 8000), 44 + i * 2);
    return 'data:audio/wav;base64,' + b.toString('base64');
  })();
  const ra = await fetch(`${base}/api/public/msg/${studio.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: box.session, sender: 'audiosender0001', name: 'Diego', audio: wav, dur: 1.2 }) });
  check('áudio enviado pela API', ra.status === 200, String(ra.status));

  check('mensagens chegaram na lista do estúdio', await waitFor(host, `document.querySelectorAll('#mb-list .msg-item').length===2`, 8000));
  check('texto e nome corretos na lista', await host.ev(`[...document.querySelectorAll('#mb-list .msg-item')].some(e=>e.textContent.includes('Carla')&&e.textContent.includes('salve para Recife'))`));
  check('áudio tem player de prévia (blob)', await host.ev(`(document.querySelector('#mb-list .msg-au')?.src||'').startsWith('blob:')`));

  // mostrar a mensagem de texto no ar
  await host.ev(`[...document.querySelectorAll('#mb-list .msg-item')].find(e=>e.textContent.includes('Carla')).querySelector('[data-act=show]').click()`);
  await sleep(500);
  check('mensagem de texto no ar (widget msg)', await host.ev(`window.__castdeck.comp.wg.has('msg')`));
  check('item marcado NO AR', await host.ev(`!!document.querySelector('#mb-list .msg-item.showing')`));
  if (OUT) await host.shot(`${OUT}/msg_studio_text.png`);

  // áudio no ar
  await host.ev(`[...document.querySelectorAll('#mb-list .msg-item')].find(e=>e.textContent.includes('Diego')).querySelector('[data-act=show]').click()`);
  await sleep(500);
  check('áudio no ar com barras tocando', await host.ev(`window.__castdeck.comp.wg.has('msg') && window.__castdeck.comp.wg.items.get('msg').get().audio===true`));
  check('áudio tocando no programa', await waitFor(host, `window.__castdeck.comp.wg.items.get('msg')?.get().playing()`, 3000));
  if (OUT) await host.shot(`${OUT}/msg_studio_audio.png`);
  check('ao terminar, áudio para', await waitFor(host, `!window.__castdeck.comp.wg.items.get('msg')?.get().playing?.()`, 6000));

  // QR no ar
  await host.ev(`document.querySelector('#mb-qr').click()`);
  await sleep(1200);
  check('QR das mensagens no ar', await host.ev(`window.__castdeck.comp.wg.has('msgqr')`));
  if (OUT) await host.shot(`${OUT}/msg_studio_qr.png`);
  // limpar tela tira tudo
  await host.ev(`document.querySelector('#deck-clear').click()`);
  await sleep(600);
  check('Limpar tela tira mensagem e QR do ar', await host.ev(`!window.__castdeck.comp.wg.has('msg') && !window.__castdeck.comp.wg.has('msgqr')`));

  // badge de não lidas fora da aba
  await host.ev(`document.querySelector('.tab[data-tab=widgets]').click()`);
  await sleep(1600); // o intervalo entre envios é por aparelho; outro aparelho manda
  const r3 = await fetch(`${base}/api/public/msg/${studio.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: box.session, sender: 'thirdsender0003', text: 'Oi!' }) });
  const ok3 = await waitFor(host, `(()=>{const c=document.querySelector('.grp[data-group=interaction] .msg-count');return c&&!c.hidden&&c.textContent==='1'})()`, 6000);
  check('contador de não lidas aparece', ok3, ok3 ? '' : `${r3.status} ` + (await host.ev(`(()=>{const c=document.querySelector('.grp[data-group=interaction] .msg-count');return JSON.stringify({tab:window.__castdeck.S.tab,hidden:c?.hidden,txt:c?.textContent,docHidden:document.hidden})})()`)));
  await host.ev(`document.querySelector('.tab[data-tab=messages]').click()`);
  await sleep(300);
  check('contador zera ao abrir a aba', await host.ev(`document.querySelector('.grp[data-group=interaction] .msg-count').hidden`));

  check('sem erros JS no estúdio', host.errors.length === 0, host.errors.join(' | ').slice(0, 400));
  check('sem erros JS na página pública', pub.errors.length === 0, pub.errors.join(' | ').slice(0, 400));
  await pub.close();
} catch (e) {
  check('execução', false, e.message);
} finally {
  await host.close();
  await fetch(`${base}/api/studios/${studio.id}`, { method: 'DELETE' }).catch(() => {});
}
console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
