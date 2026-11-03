// Painel inicial em abas: abas, ações dos cards sem texto espremido, sem rolagem lateral e convite que espera o túnel.
// Precisa do Edge com CDP em :9333 e de um servidor de teste. BASE=http://localhost:3100 node test/dash-e2e.mjs
// SHOTS=<pasta> salva capturas de tela em 3 larguras.
import fs from 'node:fs';
const CDP = 'http://127.0.0.1:9333';
const base = process.env.BASE || 'http://localhost:3100';
const SHOTS = process.env.SHOTS || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const v = await (await fetch(`${CDP}/json/version`)).json();
const bws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let bid = 0; const bp = new Map();
bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bp.has(m.id)) { bp.get(m.id)(m); bp.delete(m.id); } };
const bsend = (method, params = {}) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });

async function open(url, width, height) {
  const { result } = await bsend('Target.createTarget', { url: 'about:blank' });
  const ws = new WebSocket(`ws://127.0.0.1:9333/devtools/page/${result.targetId}`);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  const shot = async (name) => { if (!SHOTS) return; const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(r.result.data, 'base64')); };
  await send('Page.navigate', { url });
  return { ev, shot, errors, close: () => bsend('Target.closeTarget', { targetId: result.targetId }) };
}
const waitFor = async (p, expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await p.ev(expr)) return true; } catch {} await sleep(250); } return false; };
let fails = 0;
const check = (n, ok, extra = '') => { console.log(ok ? 'OK   ' : 'FALHA', n, ok ? '' : extra); if (!ok) fails++; };

const created = await (await fetch(base + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Painel E2E com um nome bem comprido para testar' }) })).json();

// texto espremido: botão cujo conteúdo é mais largo que ele (só conta os visíveis)
const SQUEEZE = `[...document.querySelectorAll('.db-panel:not([hidden]) .btn, .dash-top .btn, .db-tab')].filter(b=>b.offsetParent&&b.scrollWidth>b.clientWidth+1).map(b=>b.textContent.trim().slice(0,30))`;
const HSCROLL = `document.documentElement.scrollWidth - document.documentElement.clientWidth`;

for (const [w, h] of [[1366, 900], [900, 1100], [390, 900]]) {
  const p = await open(base + '/?lang=pt#estudios', w, h);
  check(`${w}px: painel carrega`, await waitFor(p, `!!document.querySelector('.db-tabs') && !!document.querySelector('.studio-card')`));
  await sleep(600);
  check(`${w}px: 4 abas`, await p.ev(`document.querySelectorAll('.db-tab').length===4`));
  check(`${w}px: sem rolagem lateral`, (await p.ev(HSCROLL)) <= 1, 'excesso ' + (await p.ev(HSCROLL)) + 'px');
  const sq = await p.ev(SQUEEZE);
  check(`${w}px: nenhum botão com texto espremido (Estúdios)`, sq.length === 0, JSON.stringify(sq));
  await p.shot(`dash_${w}_estudios`);
  for (const tab of ['destinos', 'gravacoes', 'config']) {
    await p.ev(`document.querySelector('.db-tab[data-tab="${tab}"]').click()`);
    await sleep(350);
    const vis = await p.ev(`[...document.querySelectorAll('.db-panel')].filter(x=>!x.hidden).map(x=>x.dataset.panel).join()`);
    check(`${w}px: aba ${tab} mostra só o painel dela`, vis === tab, vis);
    check(`${w}px: aba ${tab} sem rolagem lateral`, (await p.ev(HSCROLL)) <= 1, 'excesso ' + (await p.ev(HSCROLL)) + 'px');
    const sq2 = await p.ev(SQUEEZE);
    check(`${w}px: aba ${tab} sem texto espremido`, sq2.length === 0, JSON.stringify(sq2));
    await p.shot(`dash_${w}_${tab}`);
  }
  check(`${w}px: aba guardada no endereço`, await p.ev(`location.hash==='#config'`));
  check(`${w}px: sem erros de JS`, p.errors.length === 0, p.errors.join(' | '));
  await p.close();
}

// avisos do túnel: o painel não mostra o endereço cru para copiar; o convite espera o túnel ficar pronto
const p = await open(base + '/?lang=pt#config', 1280, 900);
await waitFor(p, `!!document.querySelector('#conexao')`);
check('sem botão de copiar o endereço do túnel', await p.ev(`!document.querySelector('#tun-copy') && !document.querySelector('#conexao [data-copy]')`));
const tunUrl = (await (await fetch(base + '/api/system')).json()).tunnel?.url || '';
check('endereço do túnel não aparece na tela', !tunUrl || !(await p.ev(`document.body.innerText.includes(${JSON.stringify(tunUrl)})`)));
check('chip de estado da conexão no topo', await p.ev(`!!document.querySelector('#tun-chip')`));
// simula túnel "conectando": o convite não copia link e mostra o aviso de espera
const r = await p.ev(`(async()=>{const m=await import('/js/ui.js');let copied=null;
  const orig=navigator.clipboard&&navigator.clipboard.writeText; try{navigator.clipboard.writeText=async(t)=>{copied=t}}catch{}
  document.querySelector('.db-tab[data-tab="estudios"]').click();
  const b=document.querySelector('[data-invite]'); return {mode:b.className, label:b.textContent.trim()};})()`);
check('botão de convite presente', !!r.label, JSON.stringify(r));
console.log('     convite:', r.label, '| túnel:', (await (await fetch(base + '/api/system')).json()).tunnel?.status);
await p.close();
await fetch(base + '/api/studios/' + created.id, { method: 'DELETE' }).catch(() => {});

console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
process.exit(fails ? 1 : 0);
