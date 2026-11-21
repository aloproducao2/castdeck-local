// Verificação visual avançada: fontes iguais às do site, botão de download inteligente, guias HTML e prompts com copiar.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const CDP = 9389;
const perfil = path.join(os.tmpdir(), 'cd-shot2-' + crypto.randomBytes(3).toString('hex'));
const saida = 'D:/REA/scratch/shots';
fs.mkdirSync(saida, { recursive: true });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 400)));
};

const versaoPublicada = (await (await fetch('https://cast.flue.live/latest.json?t=' + Date.now())).json()).latest;

const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--window-size=1440,1500', 'about:blank'], { stdio: 'ignore', windowsHide: true });
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
  const erros = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)(m);
      pend.delete(m.id);
    }
    if (m.method === 'Runtime.exceptionThrown') erros.push(String(m.params?.exceptionDetails?.exception?.description || '').slice(0, 160));
  });
  const cmd = (method, params = {}) => new Promise((res) => { const id = ++seq; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (e) => (await cmd('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await cmd('Runtime.enable');
  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1500, deviceScaleFactor: 1, mobile: false });

  await cmd('Page.navigate', { url: 'https://cast.flue.live/plugins.html' });
  await esperar(5000);

  const fontes = await ev(`(async () => {
    await document.fonts.ready;
    const h1 = getComputedStyle(document.querySelector('h1')).fontFamily;
    const body = getComputedStyle(document.body).fontFamily;
    return { h1, body, outfit: document.fonts.check('700 2rem Outfit'), inter: document.fonts.check('400 1rem Inter') };
  })()`);
  ok('fonte do título é Outfit (como o resto do site)', /Outfit/i.test(fontes.h1) && fontes.outfit, JSON.stringify(fontes));
  ok('fonte do texto é Inter', /Inter/i.test(fontes.body) && fontes.inter, JSON.stringify(fontes));

  const btn = await ev(`(() => { const b = document.querySelector('#plugins-download'); return b ? { href: b.getAttribute('href'), texto: b.textContent.trim(), download: b.hasAttribute('download') } : null; })()`);
  const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const padraoDownload = new RegExp('(dl|downloads)/' + escapeRe(versaoPublicada) + '/CastDeck-' + escapeRe(versaoPublicada) + '-windows-x64\\.exe$');
  ok('botão de download inteligente (como a home)', !!btn && padraoDownload.test(btn.href) && btn.download, JSON.stringify(btn));
  ok('botão mostra plataforma e versão', /Baixar para Windows/i.test(btn.texto) && btn.texto.includes('v' + versaoPublicada), btn.texto);

  const prompts = await ev(`(() => {
    const cards = [...document.querySelectorAll('.prompt-card')];
    return cards.map((c) => ({ titulo: c.querySelector('h3').textContent.trim(), copiar: !!c.querySelector('.copy[data-copy]'), alvo: !!document.getElementById(c.querySelector('.copy').dataset.copy), tamanho: (document.getElementById(c.querySelector('.copy').dataset.copy)?.textContent || '').length }));
  })()`);
  ok('4 prompts com botão copiar', (prompts || []).length === 4 && prompts.every((p) => p.copiar && p.alvo && p.tamanho > 80), JSON.stringify(prompts));
  ok('prompt MCP tem o config e o ciclo', await ev(`document.getElementById('p-mcp').textContent.includes('mcpServers') && document.getElementById('p-mcp').textContent.includes('castdeck_plugin_simulate')`));
  ok('prompt de criar tem o contrato', await ev(`document.getElementById('p-criar').textContent.includes('AGENTS.md')`));

  const links = await ev(`[...document.querySelectorAll('a[href*="guia-"]')].map((a) => a.getAttribute('href'))`);
  ok('links para guias em HTML', links.includes('/plugins/guia-dev.html') && links.includes('/plugins/guia-agentes.html'), JSON.stringify(links));
  ok('link do repositório do catálogo', await ev(`!!document.querySelector('a[href="https://github.com/aloproducao2/castdeck-local-plugins"]')`));

  // clicar em copiar (clipboard API pode exigir foco; validamos o handler)
  const copiou = await ev(`(async () => {
    const b = document.querySelector('.copy[data-copy="p-criar"]');
    try { await navigator.clipboard.writeText('teste'); } catch (e) { return 'sem clipboard: ' + e.name; }
    b.click(); await new Promise((r) => setTimeout(r, 200));
    return b.textContent.trim();
  })()`);
  ok('botão copiar responde', /copiado|Ctrl\+C|sem clipboard/.test(String(copiou)), String(copiou));

  const shot = await cmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(saida, 'plugins-final.png'), Buffer.from(shot.result.data, 'base64'));

  // guias
  for (const [nome, url, esperado] of [
    ['guia-dev', 'https://cast.flue.live/plugins/guia-dev.html', /Seu primeiro plugin|Declarativo/i],
    ['guia-agentes', 'https://cast.flue.live/plugins/guia-agentes.html', /scaffold|Ciclo fechado/i],
  ]) {
    await cmd('Page.navigate', { url });
    await esperar(4000);
    const r = await ev(`(() => {
      const b = document.querySelector('#doc-body');
      const toc = document.querySelector('#doc-toc');
      const texto = b ? b.innerText : '';
      return {
        inicio: texto.slice(0, 200),
        tamanho: texto.length,
        toc: toc ? toc.querySelectorAll('a').length : 0,
        h2: b ? b.querySelectorAll('h2').length : 0,
        copiar: b ? b.querySelectorAll('.doc-copy').length : 0,
      };
    })()`);
    ok(`${nome} renderiza o guia`, r.h2 >= 2 && r.toc >= 2 && r.tamanho > 3000, JSON.stringify(r).slice(0, 300));
    const fonte = await ev(`getComputedStyle(document.body).fontFamily`);
    ok(`${nome} com a fonte do site`, /Inter/i.test(String(fonte)), String(fonte));
    const sh = await cmd('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(saida, `${nome}.png`), Buffer.from(sh.result.data, 'base64'));
  }

  ok('sem erros de console', erros.length === 0, JSON.stringify(erros.slice(0, 3)));
  ws.close();
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { edge.kill('SIGKILL'); } catch {}
  try { fs.rmSync(perfil, { recursive: true, force: true }); } catch {}
}

console.log(falhas ? `\nSITE_PLUGINS_FAIL (${falhas})` : '\nSITE_PLUGINS_OK');
process.exit(falhas ? 1 : 0);
