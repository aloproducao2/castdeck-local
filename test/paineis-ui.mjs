// Teste de UI das melhorias de layout dos painéis (Ondas A/B/C): rótulos, aria-current,
// accordions recolhidos, Playout mode-aware, estados vazios e gaveta com semântica de diálogo.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4455;
const CDP = 9489;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-paineis-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 300)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const EXE = process.env.CASTDECK_TEST_EXE || '';
const srv = spawn(EXE || process.execPath, EXE ? [] : [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: 'ignore',
  windowsHide: true,
});
const perfil = path.join(os.tmpdir(), 'cd-paineis-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', 'about:blank'], { stdio: 'ignore', windowsHide: true });

try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) {
    await esperar(600);
    try { pronto = (await fetch(BASE + '/')).ok; } catch {}
  }
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Painéis' }) }).then((r) => r.json());
  const sid = est.id || est.studio?.id;
  ok('estúdio criado', !!sid);

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

  const entrar = async () => {
    await ev(`document.querySelector('#lb-go')?.click()`);
    for (let i = 0; i < 40; i++) {
      if (await ev(`!!document.querySelector('#program-canvas')`)) break;
      await esperar(500);
    }
    await esperar(1000);
  };

  await cmd('Emulation.setDeviceMetricsOverride', { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: `${BASE}/studio/${sid}` });
  await esperar(3500);
  await entrar();

  // rótulos de aba
  const rotulos = await ev(`(() => {
    const t = (id) => document.querySelector('.subtabs .tab[data-tab="'+id+'"]')?.textContent.trim() || '';
    return { outputs: t('outputs'), director: t('director'), captions: t('captions'), banners: t('banners') };
  })()`);
  ok('aba Sinais renomeada para OBS/vMix', /OBS\/vMix/.test(rotulos.outputs), rotulos.outputs);
  ok('aba Diretor vira Diretor automático', /Diretor automático/.test(rotulos.director), rotulos.director);
  ok('aba Legendas vira Legenda ao vivo', /Legenda ao vivo/.test(rotulos.captions), rotulos.captions);
  const tl = await ev(`(() => {
    const m = window.__castdeck?.tabLabels || {};
    return { outputs: m.outputs || '', director: m.director || '', total: Object.keys(m).length };
  })()`);
  ok('__castdeck.tabLabels expõe os 24 rótulos (fonte única do popout)', tl.outputs === 'OBS/vMix' && tl.director === 'Diretor automático' && tl.total === 24, JSON.stringify(tl));

  // barra rápida
  const qs = await ev(`document.querySelector('.sq-pill[data-goto-tab=banners]')?.textContent.trim() || ''`);
  ok('barra rápida diz "Grafismo" (sem GC /)', qs === 'Grafismo', qs);

  // grupo de aba única mantém sub-aba + aria-current
  await ev(`document.querySelector('.grp[data-group=director]').click()`);
  await esperar(400);
  const dir = await ev(`(() => {
    const sub = document.querySelector('.subtabs');
    const tab = document.querySelector('.subtabs .tab[data-tab=director]');
    return { subHidden: sub.hidden, tabVisible: !tab.hidden, ariaCurrent: tab.getAttribute('aria-current'), active: tab.classList.contains('active') };
  })()`);
  ok('grupo de aba única mantém a sub-aba visível', dir.subHidden === false && dir.tabVisible === true, JSON.stringify(dir));
  ok('aria-current marca a aba ativa', dir.ariaCurrent === 'true', JSON.stringify(dir));

  // Grafismo: "Limpar tudo" escondido sem nada no ar
  await ev(`document.querySelector('.grp[data-group=content]').click()`);
  await esperar(300);
  await ev(`document.querySelector('.subtabs .tab[data-tab=banners]').click()`);
  await esperar(500);
  const gf = await ev(`(() => {
    const clear = document.querySelector('#gf-air-clear');
    const empty = document.querySelector('#gf-air-list')?.textContent.trim() || '';
    const novo = document.querySelector('.bn-new-acc');
    return { clearHidden: clear.hidden, empty, novoOpen: novo?.open === true };
  })()`);
  ok('Grafismo sem GC: "Limpar tudo" oculto + estado vazio + cadastro aberto', gf.clearHidden === true && /Nada no ar agora/.test(gf.empty) && gf.novoOpen === true, JSON.stringify(gf));

  // Destinos: qualidade em accordion recolhido
  await ev(`document.querySelector('.grp[data-group=setup]').click()`);
  await esperar(300);
  await ev(`document.querySelector('.subtabs .tab[data-tab=output]').click()`);
  await esperar(500);
  const out = await ev(`(() => {
    const acc = document.querySelector('#panel-output .out-acc');
    return { existe: !!acc, aberto: acc?.open === true, resumo: acc?.querySelector('summary')?.textContent.trim() || '' };
  })()`);
  ok('Destinos: "Qualidade de saída" recolhida em accordion', out.existe && out.aberto === false && /Qualidade de saída/.test(out.resumo), JSON.stringify(out));

  // Playout: botão principal mode-aware e largo (o #pl-air só renderiza com mídia na fila;
  // verificamos o template/updater no código, que é determinístico)
  const playoutCode = fs.readFileSync('public/js/studio/studio.js', 'utf8');
  ok('Playout: rótulo mode-aware Solo/PGM presente', ['▶ Solo', '✕ Tirar do solo', '▶ Entrar no PGM', '✕ Tirar do PGM'].every((s) => playoutCode.includes(s)));
  ok('Playout: botão principal largo (grow) e Palco ghost', playoutCode.includes('grow pl-air-btn') && playoutCode.includes('class="btn sm ghost" id="pl-stage"'));

  // Legendas: swatches com nome acessível
  await ev(`document.querySelector('.grp[data-group=captions]').click()`);
  await esperar(300);
  await ev(`document.querySelector('.subtabs .tab[data-tab=captions]').click()`);
  await esperar(500);
  const cc = await ev(`[...document.querySelectorAll('.cc-sw')].slice(0, 3).map((b) => b.getAttribute('aria-label'))`);
  ok('Legendas: swatches têm nome acessível (não hex cru)', cc.length === 3 && cc.every((n) => n && !/^#/.test(n)), JSON.stringify(cc));

  // mobile: gaveta com semântica de diálogo
  await cmd('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cmd('Page.reload');
  await esperar(3500);
  await entrar();
  await ev(`document.querySelector('#btn-panel').click()`);
  await esperar(500);
  const gaveta = await ev(`(() => {
    const s = document.querySelector('#side');
    return { role: s.getAttribute('role'), modal: s.getAttribute('aria-modal'), label: s.getAttribute('aria-label'), aberta: document.querySelector('.studio').classList.contains('panel-open') };
  })()`);
  ok('gaveta mobile vira dialog (role/aria-modal/aria-label)', gaveta.aberta === true && gaveta.role === 'dialog' && gaveta.modal === 'true' && gaveta.label === 'Painel de Controle', JSON.stringify(gaveta));

  const erros = await ev(`window.__dsherr?.length || 0`);
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
console.log(falhas ? `\nPAINEIS_UI_FAIL (${falhas})` : '\nPAINEIS_UI_OK');
process.exit(falhas ? 1 : 0);
