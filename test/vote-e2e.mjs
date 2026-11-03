// e2e: servidor temporário → cria estúdio → publica enquete → vota pela API pública → estúdio recebe o voto
import { spawn } from 'node:child_process';
const PORT = 3170;
const base = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, ['server/index.js'], { cwd: 'd:/REA', env: { ...process.env, PORT: String(PORT), HTTPS_PORT: '3571', NO_OPEN: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
try {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(base + '/api/health');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const st = (await j('/api/studios', { method: 'POST', body: { name: 'Teste votação' } })).data;
  const id = st.id;
  let v = await j(`/api/public/vote/${id}`);
  assert(v.status === 200 && v.data.poll === null, 'sem enquete: poll null');
  const poll = { id: 'p1', round: 0, question: 'Quem vence?', options: [{ text: 'A', votes: 2 }, { text: 'B', votes: 0 }], state: 'open', endsAt: 0 };
  let s = await j(`/api/studios/${id}/poll`, { method: 'POST', body: { poll } });
  assert(s.data.votes.length === 0, 'sync inicial sem votos');
  v = await j(`/api/public/vote/${id}?voter=abcdefgh1234`);
  assert(v.data.poll.question === 'Quem vence?' && v.data.poll.voted === null, 'página vê a enquete');
  let r = await j(`/api/public/vote/${id}`, { method: 'POST', body: { pollId: 'p1', round: 0, opt: 1, voter: 'abcdefgh1234' } });
  assert(r.status === 200 && r.data.ok && r.data.voted === 1, 'voto aceito');
  r = await j(`/api/public/vote/${id}`, { method: 'POST', body: { pollId: 'p1', round: 0, opt: 0, voter: 'abcdefgh1234' } });
  assert(r.data.already && r.data.voted === 1, 'voto duplicado bloqueado');
  r = await j(`/api/public/vote/${id}`, { method: 'POST', body: { pollId: 'p1', round: 0, opt: 9, voter: 'zzzzzzzz9999' } });
  assert(r.status === 400, 'opção inválida rejeitada');
  v = await j(`/api/public/vote/${id}?voter=abcdefgh1234`);
  assert(v.data.poll.voted === 1 && v.data.poll.options[1].votes === 1, 'contagem otimista na página');
  s = await j(`/api/studios/${id}/poll`, { method: 'POST', body: { poll } });
  assert(s.data.votes.length === 1 && s.data.votes[0].key === 'web:abcdefgh1234' && s.data.votes[0].opt === 1, 'estúdio recebe o voto');
  v = await j(`/api/public/vote/${id}`);
  assert(v.data.poll.options[1].votes === 1, 'contagem não "volta" após o sync');
  await j(`/api/studios/${id}/poll`, { method: 'POST', body: { poll: { ...poll, round: 1, options: [{ text: 'A', votes: 0 }, { text: 'B', votes: 0 }] } } });
  r = await j(`/api/public/vote/${id}`, { method: 'POST', body: { pollId: 'p1', round: 1, opt: 0, voter: 'abcdefgh1234' } });
  assert(r.data.ok, 'zerar (nova rodada) libera votar de novo');
  await j(`/api/studios/${id}/poll`, { method: 'POST', body: { poll: { ...poll, round: 1, state: 'closed' } } });
  r = await j(`/api/public/vote/${id}`, { method: 'POST', body: { pollId: 'p1', round: 1, opt: 0, voter: 'qqqqqqqq1111' } });
  assert(r.status === 409, 'enquete encerrada não aceita voto');
  const page = await fetch(`${base}/vote/${id}`);
  assert(page.status === 200 && (await page.text()).includes('/js/vote.js'), 'página /vote servida');
  await j(`/api/studios/${id}/poll`, { method: 'POST', body: { poll: null } });
  v = await j(`/api/public/vote/${id}`);
  assert(v.data.poll === null, 'enquete tirada do ar');
  await j(`/api/studios/${id}`, { method: 'DELETE' });
  console.log('\nTUDO OK');
} catch (e) {
  console.error(e.message, '\n', log.slice(-1500));
  process.exitCode = 1;
} finally {
  srv.kill();
}
