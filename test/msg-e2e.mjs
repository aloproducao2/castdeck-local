// e2e: servidor temporário → cria estúdio → abre a caixa de mensagens → público manda texto e áudio
// pela API pública → estúdio recebe na sincronização (mesmo esquema do vote-e2e)
import { spawn } from 'node:child_process';
const PORT = 3172;
const base = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, ['server/index.js'], { cwd: 'd:/REA', env: { ...process.env, PORT: String(PORT), HTTPS_PORT: '3573', NO_OPEN: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
srv.stdout.on('data', (d) => (log += d));
srv.stderr.on('data', (d) => (log += d));
const j = async (path, opts = {}) => {
  const r = await fetch(base + path, { ...opts, headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};
const assert = (c, m) => {
  if (!c) throw new Error('FALHOU: ' + m);
  console.log('ok -', m);
};
// áudio falso (só precisa ser base64 válido e do tamanho mínimo)
const fakeAudio = 'data:audio/webm;codecs=opus;base64,' + Buffer.alloc(3000, 7).toString('base64');
try {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(base + '/api/health');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const st = (await j('/api/studios', { method: 'POST', body: { name: 'Teste mensagens' } })).data;
  const id = st.id;
  let v = await j(`/api/public/msg/${id}`);
  assert(v.status === 200 && v.data.box === null && v.data.studio.name === 'Teste mensagens', 'sem caixa: box null');
  const box = { session: 'sess1', open: true, title: 'Mande sua pergunta', audio: true };
  let s = await j(`/api/studios/${id}/msgs`, { method: 'POST', body: { box } });
  assert(Array.isArray(s.data.msgs) && s.data.msgs.length === 0, 'sync inicial sem mensagens');
  v = await j(`/api/public/msg/${id}`);
  assert(v.data.box.open && v.data.box.title === 'Mande sua pergunta' && v.data.box.audio && v.data.box.maxSec === 30, 'página vê a caixa aberta');
  let r = await j(`/api/public/msg/${id}`, { method: 'POST', body: { session: 'sess1', sender: 'abcdefgh1234', name: 'Ana', text: '  Olá\u0000 programa!  ' } });
  assert(r.status === 200 && r.data.ok, 'texto aceito');
  r = await j(`/api/public/msg/${id}`, { method: 'POST', body: { session: 'sess1', sender: 'abcdefgh1234', text: 'outra' } });
  assert(r.status === 429 && r.data.wait > 0, 'intervalo entre envios do mesmo aparelho');
  r = await j(`/api/public/msg/${id}`, { method: 'POST', body: { session: 'sess1', sender: 'zzzzzzzz9999', name: 'Bia', audio: fakeAudio, dur: 4.2 } });
  assert(r.status === 200 && r.data.ok, 'áudio aceito');
  r = await j(`/api/public/msg/${id}`, { method: 'POST', body: { session: 'sess1', sender: 'yyyyyyyy8888', audio: 'data:text/html;base64,PGgxPg==' } });
  assert(r.status === 400, 'áudio inválido rejeitado');
  r = await j(`/api/public/msg/${id}`, { method: 'POST', body: { session: 'sess1', sender: 'xxxxxxxx7777', text: '   ' } });
  assert(r.status === 400, 'mensagem vazia rejeitada');
  r = await j(`/api/public/msg/${id}`, { method: 'POST', body: { session: 'outra', sender: 'wwwwwwww6666', text: 'oi' } });
  assert(r.status === 409, 'sessão errada rejeitada');
  r = await j(`/api/public/msg/${id}`, { method: 'POST', body: { session: 'sess1', sender: 'vvvvvvvv5555', text: 'x'.repeat(500) } });
  assert(r.status === 200, 'texto longo aceito (cortado)');
  s = await j(`/api/studios/${id}/msgs`, { method: 'POST', body: { box } });
  const got = s.data.msgs;
  assert(got.length === 3, 'estúdio recebe 3 mensagens');
  assert(got[0].name === 'Ana' && got[0].text === 'Olá programa!' && !got[0].audio, 'texto limpo (sem controle/espaços)');
  assert(got[1].audio === fakeAudio && got[1].dur === 4.2, 'áudio entregue ao estúdio');
  assert(got[2].text.length === 200, 'texto cortado em 200 caracteres');
  s = await j(`/api/studios/${id}/msgs`, { method: 'POST', body: { box } });
  assert(s.data.msgs.length === 0, 'fila esvaziada após a entrega');
  // sem áudio
  await j(`/api/studios/${id}/msgs`, { method: 'POST', body: { box: { ...box, audio: false } } });
  r = await j(`/api/public/msg/${id}`, { method: 'POST', body: { session: 'sess1', sender: 'uuuuuuuu4444', audio: fakeAudio } });
  assert(r.status === 400, 'áudio recusado quando desligado');
  // pausado
  await j(`/api/studios/${id}/msgs`, { method: 'POST', body: { box: { ...box, open: false } } });
  v = await j(`/api/public/msg/${id}`);
  assert(v.data.box && v.data.box.open === false, 'página vê a caixa pausada');
  r = await j(`/api/public/msg/${id}`, { method: 'POST', body: { session: 'sess1', sender: 'tttttttt3333', text: 'oi' } });
  assert(r.status === 409, 'caixa pausada não aceita mensagem');
  const page = await fetch(`${base}/msg/${id}`);
  assert(page.status === 200 && (await page.text()).includes('/js/msg.js'), 'página /msg servida');
  await j(`/api/studios/${id}/msgs`, { method: 'POST', body: { box: null } });
  v = await j(`/api/public/msg/${id}`);
  assert(v.data.box === null, 'caixa fechada');
  await j(`/api/studios/${id}`, { method: 'DELETE' });
  console.log('\nTUDO OK');
} catch (e) {
  console.error(e.message, '\n', log.slice(-1500));
  process.exitCode = 1;
} finally {
  srv.kill();
}
