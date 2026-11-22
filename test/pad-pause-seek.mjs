// Teste de UI: Pad no painel interno tem controle de pausa/retomar e seek no "tocando agora"
// (a barra de progresso é clicável/arrastável e responde às setas), além dos controles existentes.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORTA = 4463;
const CDP = 9497;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-padplay-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 320)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const EXE = process.env.CASTDECK_TEST_EXE || '';
const srv = spawn(EXE || process.execPath, EXE ? [] : [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), HTTPS_PORT: String(PORTA + 1), CASTDECK_DATA: DADOS, NO_OPEN: '1', CASTDECK_PLUGIN_CATALOG: 'http://127.0.0.1:9/i.json' },
  stdio: 'ignore',
  windowsHide: true,
});
const perfil = path.join(os.tmpdir(), 'cd-padplay-edge-' + crypto.randomBytes(3).toString('hex'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [`--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--no-first-run', '--headless=new', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });

try {
  let pronto = false;
  for (let i = 0; i < 200 && !pronto; i++) {
    await esperar(600);
    try { pronto = (await fetch(BASE + '/')).ok; } catch {}
  }
  const est = await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Pad Pause' }) }).then((r) => r.json());
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
  const erros = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') erros.push(String(m.params?.exceptionDetails?.exception?.description || '').slice(0, 200));
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

  // abre Áudio → Trilha & Pad, e alterna para a visão do Pad
  await ev(`document.querySelector('.grp[data-group=audio]')?.click()`);
  await esperar(300);
  await ev(`document.querySelector('.subtabs .tab[data-tab=music]')?.click()`);
  await esperar(600);
  await ev(`document.querySelector('[data-music-view="pad"]')?.click()`);
  await esperar(900);

  const ui = await ev(`(() => {
    const pause = document.querySelector('#pad-timer-pause');
    const seek = document.querySelector('#pad-timer-seek');
    return {
      temPause: !!pause,
      pauseTexto: pause?.textContent.trim() || '',
      pauseDisabled: pause?.disabled,
      temSeek: !!seek,
      seekRole: seek?.getAttribute('role'),
      seekTab: seek?.getAttribute('tabindex'),
    };
  })()`);
  ok('botão Pausar existe no "tocando agora"', ui.temPause === true && /Pausar/.test(ui.pauseTexto), JSON.stringify(ui));
  ok('Pausar começa desabilitado (nada tocando)', ui.pauseDisabled === true, JSON.stringify(ui));
  ok('barra do "tocando agora" é um slider focável (seek)', ui.temSeek === true && ui.seekRole === 'slider' && ui.seekTab === '0', JSON.stringify(ui));

  // seek pela barra não deve quebrar quando não há nada tocando (sem sample ativo)
  const seekSemTocar = await ev(`(() => { const s=document.querySelector('#pad-timer-seek'); const r=s.getBoundingClientRect(); s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + r.width/2, clientY: r.top + 2, pointerId: 1 })); s.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); return true; })()`);
  ok('seek na barra sem sample ativo não lança erro', seekSemTocar === true && erros.length === 0, JSON.stringify(erros.slice(0, 3)));

  // teclado: seta direita na barra focada não deve lançar erro
  await ev(`(() => { const s=document.querySelector('#pad-timer-seek'); s.focus(); s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); return true; })()`);
  await esperar(300);
  ok('seek por teclado (setas) sem erro', erros.length === 0, JSON.stringify(erros.slice(0, 3)));

  // ---- funcional: tocar um preset, pausar, retomar e buscar ----
  const tocando = await ev(`(async () => {
    const m = window.__castdeck.music;
    if (!m.padSamples.length) { try { await m.restorePresetPads(); } catch {} }
    const audio = m.padSamples.find((s) => (s.kind || 'audio') === 'audio');
    if (!audio) return { erro: 'sem sample de audio' };
    await m.playPad(audio.id);
    for (let i = 0; i < 80 && !m.getPadSnapshot().nowPlaying; i++) await new Promise((r) => setTimeout(r, 100));
    return { id: audio.id, tocando: !!m.getPadSnapshot().nowPlaying, nome: m.getPadSnapshot().nowPlaying?.name || '' };
  })()`);
  ok('toca um preset do Pad', tocando.tocando === true, JSON.stringify(tocando));

  if (tocando.tocando) {
    await ev(`document.querySelector('#pad-timer-pause')?.click()`);
    await esperar(350);
    const pausado = await ev(`(() => { const m = window.__castdeck.music; const s = m.getPadSnapshot(); return { paused: !!s.nowPlaying?.paused, texto: document.querySelector('#pad-timer-pause')?.textContent.trim() || '' }; })()`);
    ok('pausar deixa o material pausado (e vira Retomar)', pausado.paused === true && /Retomar/.test(pausado.texto), JSON.stringify(pausado));

    await ev(`document.querySelector('#pad-timer-pause')?.click()`);
    await esperar(350);
    const retomado = await ev(`(() => { const m = window.__castdeck.music; const s = m.getPadSnapshot(); return { paused: !!s.nowPlaying?.paused, texto: document.querySelector('#pad-timer-pause')?.textContent.trim() || '' }; })()`);
    ok('retomar volta a tocar (e vira Pausar)', retomado.paused === false && /Pausar/.test(retomado.texto), JSON.stringify(retomado));

    const buscado = await ev(`(() => {
      const m = window.__castdeck.music;
      const s = m.getPadSnapshot();
      const id = s.nowPlaying?.sampleId;
      if (!id || !(s.nowPlaying.duration > 0)) return { erro: 'sem duracao' };
      m.seekPadPct(id, 0.5);
      const s2 = m.getPadSnapshot();
      return { antes: s.nowPlaying.pct, depois: s2.nowPlaying.pct, dur: s.nowPlaying.duration };
    })()`);
    ok('seek move o ponto do material (pct ~0.5)', buscado.depois > 0.3 && buscado.depois < 0.8, JSON.stringify(buscado));

    await ev(`window.__castdeck.music.stopAllPads()`);
    await esperar(300);
  }

  ok('sem erros de console', erros.length === 0, JSON.stringify(erros.slice(0, 3)));
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
console.log(falhas ? `\nPAD_PAUSE_SEEK_FAIL (${falhas})` : '\nPAD_PAUSE_SEEK_OK');
process.exit(falhas ? 1 : 0);
