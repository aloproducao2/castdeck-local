// Verificação final: app baixa e instala o Cronômetro do catálogo PÚBLICO (assinado) e usa o painel.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORTA = 4401;
const BASE = `http://127.0.0.1:${PORTA}`;
const DADOS = path.join(os.tmpdir(), 'cd-pubcat-' + crypto.randomBytes(4).toString('hex'));
let falhas = 0;
const ok = (n, c, i = '') => {
  if (!c) falhas++;
  console.log((c ? 'OK   ' : 'FALHA') + ' ' + n + (c ? '' : ' :: ' + String(i).slice(0, 400)));
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn(process.execPath, [path.join(process.cwd(), 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORTA), CASTDECK_DATA: DADOS, NO_OPEN: '1' },
  stdio: 'ignore',
  windowsHide: true,
});
const api = async (rota, opt = {}) => {
  const r = await fetch(BASE + '/api' + rota, { method: opt.method || 'GET', headers: { 'content-type': 'application/json' }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {}
  return { status: r.status, json: j, texto: t };
};
try {
  let pronto = false;
  for (let i = 0; i < 160 && !pronto; i++) {
    await esperar(600);
    try {
      pronto = (await api('/plugins')).status === 200;
    } catch {}
  }
  ok('servidor no ar', pronto);
  const cat = await api('/plugins/catalog');
  const timer = (cat.json?.plugins || []).find((p) => p.id === 'castdeck.timer');
  ok('catálogo público oferece o cronômetro', !!timer, JSON.stringify((cat.json?.plugins || []).map((p) => p.id)));
  ok('catálogo marca como oficial e com tags', timer?.oficial === true && (timer?.tags || []).includes('tempo'), JSON.stringify({ oficial: timer?.oficial, tags: timer?.tags, risco: timer?.risco }));
  const inst = await api('/plugins/catalog/install', { method: 'POST', body: { id: 'castdeck.timer' } });
  ok('instala o cronômetro do catálogo (assinatura + sha256)', inst.status === 200 && inst.json?.id === 'castdeck.timer', inst.texto);
  const atv = await api('/plugins/castdeck.timer/enable', { method: 'POST', body: { permissoes: ['events:chat', 'overlay:show', 'chat:send', 'storage:own'] } });
  ok('ativa o cronômetro', atv.status === 200, atv.texto);
  await esperar(900);
  const dr = await api('/plugins/castdeck.timer/doctor');
  ok('diagnóstico ok', dr.json?.ok === true, dr.texto.slice(0, 300));
  const pn = await api('/plugins/castdeck.timer/panel', { method: 'POST', body: { nome: 'iniciar', dados: { minutos: 1 } } });
  ok('painel inicia o cronômetro', pn.status === 200 && pn.json?.ok === true, pn.texto);
  await esperar(1200);
  const cfg = await api('/plugins/castdeck.timer/settings');
  ok('cronômetro contando (estado salvo)', cfg.json?.settings?.estado?.rodando === true && Number(cfg.json?.settings?.estado?.restante) > 0, cfg.texto.slice(0, 300));
  const list = await api('/plugins');
  const info = (list.json?.lista || []).find((p) => p.id === 'castdeck.timer');
  ok('card com permissoesDetalhe/eventos', (info?.permissoesDetalhe || []).length === 4 && (info?.eventos || []).includes('chat'), JSON.stringify({ perm: info?.permissoesDetalhe?.length, eventos: info?.eventos }));
} catch (e) {
  falhas++;
  console.log('FALHA exceção:', e.message);
} finally {
  try { srv.kill('SIGKILL'); } catch {}
  try { fs.rmSync(DADOS, { recursive: true, force: true }); } catch {}
}
console.log(falhas ? `\nPUBLIC_CATALOG_FAIL (${falhas})` : '\nPUBLIC_CATALOG_OK');
process.exit(falhas ? 1 : 0);
