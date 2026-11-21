// Navbar idêntica em todas as páginas: mesma lista, seletor de idioma, estrutura e fontes carregadas.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const CDP = 9445;
const perfil = path.join(os.tmpdir(), 'cd-naveq-' + crypto.randomBytes(3).toString('hex'));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 300)));
};
const paginas = ['/', '/plugins.html', '/plugins/', '/plugins/guia-dev.html', '/plugins/guia-agentes.html', '/downloads.html', '/recursos.html', '/documentacao.html', '/changelog.html', '/sobre.html', '/intercom.html', '/api.html'];

const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', 'about:blank'], { stdio: 'ignore', windowsHide: true });
try {
  let alvo = null;
  for (let i = 0; i < 60 && !alvo; i++) {
    await esperar(500);
    try {
      alvo = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.on('open', r), ws.on('error', r)));
  let seq = 0;
  const pend = new Map();
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    }
  });
  const cmd = (method, params = {}) => new Promise((res) => {
    const id = ++seq;
    pend.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async (e) => (await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  let referencia = null;
  for (const rota of paginas) {
    await cmd('Page.navigate', { url: 'https://cast.flue.live' + rota + '?t=' + Date.now() });
    await esperar(2800);
    const r = await ev(`(async () => {
      await document.fonts.ready;
      const nav = document.querySelector('#site-nav');
      if (!nav) return { erro: 'sem nav' };
      const links = [...nav.querySelectorAll('.nav-links a')].map((a) => a.textContent.trim());
      const acoes = [...nav.querySelectorAll('.nav-actions > *')].map((el) => el.id || el.tagName);
      const lang = nav.querySelector('#nav-lang') ? nav.querySelector('#nav-lang').options.length : 0;
      const a = nav.querySelector('.menu a');
      const menu = document.querySelector('#menu');
      return {
        links,
        acoes,
        lang,
        fonte: getComputedStyle(a).fontSize,
        fonteNav: getComputedStyle(nav).fontFamily,
        outfit: document.fonts.check('700 1rem Outfit'),
        inter: document.fonts.check('400 1rem Inter'),
        altura: Math.round(nav.querySelector('.wrap').getBoundingClientRect().height),
        menuDisplay: menu ? getComputedStyle(menu).display : 'sem',
        burger: getComputedStyle(nav.querySelector('.burger')).display,
      };
    })()`);
    if (r.erro) {
      ok(`${rota} tem navbar`, false, JSON.stringify(r));
      continue;
    }
    const assinatura = JSON.stringify({ links: r.links, acoes: r.acoes, lang: r.lang, fonte: r.fonte, altura: r.altura, menuDisplay: r.menuDisplay, burger: r.burger, outfit: r.outfit, inter: r.inter });
    if (!referencia) referencia = { rota, assinatura, r };
    ok(`${rota} navbar igual`, assinatura === referencia.assinatura, `ref ${referencia.rota} → ${referencia.assinatura} | esta → ${assinatura}`);
  }
  if (referencia) console.log('\nreferência:', referencia.rota, JSON.stringify(referencia.r));
  ws.close();
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}
console.log(falhas ? `\nNAV_IGUAL_FAIL (${falhas})` : '\nNAV_IGUAL_OK');
process.exit(falhas ? 1 : 0);
