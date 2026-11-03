// Exploração: tira capturas das telas para planejar o roteiro do tutorial
import { openPage, BASE, DIR, sleep, bsend } from './tut-lib.mjs';
const step = process.argv[2] || 'dash';
const out = (n) => `${DIR}/shot-${n}.png`;
if (step === 'dash') {
  const p = await openPage(BASE + '/');
  await p.waitFor(`!!document.querySelector('#ns-name')`);
  await sleep(1500);
  await p.shot(out('dash'));
}
if (step === 'studio') {
  const s = await (await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Explora' }) })).json();
  const p = await openPage(`${BASE}/studio/${s.id}`, { cam: 'host' });
  await p.waitFor(`!!document.querySelector('#lb-go')`);
  await sleep(2500);
  await p.shot(out('lobby'));
  console.log(await p.ev(`[...document.querySelectorAll('#app input,#app select,#app button')].map(e=>e.id+'|'+(e.textContent||e.placeholder||'').trim().slice(0,30)).join('\\n')`));
  await p.ev(`document.querySelector('#lb-go').click()`);
  await p.waitFor(`!!document.querySelector('#program-canvas')`);
  await sleep(3000);
  await p.shot(out('studio'));
  console.log('STUDIO', s.id);
}
process.exit(0);
