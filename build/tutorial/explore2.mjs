// Exploração 2: painéis do estúdio, convite e página do convidado
import { openPage, BASE, DIR, sleep, bsend, CDP } from './tut-lib.mjs';
const out = (n) => `${DIR}/shot-${n}.png`;
// fecha janelas anteriores
for (const t of await (await fetch(`${CDP}/json/list`)).json()) if (t.type === 'page' && t.url.startsWith(BASE)) await bsend('Target.closeTarget', { targetId: t.id });
const s = await (await fetch(BASE + '/api/studios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Explora 2' }) })).json();
const p = await openPage(`${BASE}/studio/${s.id}`, { cam: 'host' });
await p.waitFor(`!!document.querySelector('#lb-go')`);
await sleep(1500);
await p.ev(`document.querySelector('#lb-go').click()`);
await p.waitFor(`!!document.querySelector('#program-canvas')`);
await sleep(2000);
await p.ev(`document.querySelector('#c-invite').click()`);
await sleep(1500);
await p.shot(out('invite'));
await p.ev(`document.querySelector('.modal-back [data-close]')?.click()`);
await sleep(500);
for (const [g, tab] of [['content', 'banners'], ['brand', 'brand'], ['outputs', 'outputs'], ['setup', 'output'], ['audio', 'audio']]) {
  await p.ev(`document.querySelector('.grp[data-group="${g}"]').click()`);
  await sleep(300);
  await p.ev(`document.querySelector('.tab[data-tab="${tab}"]')?.click()`);
  await sleep(1200);
  await p.shot(out('panel-' + tab));
}
// convidado
const g = await openPage(`${BASE}/join/${s.id}`, { cam: 'guest1', left: 900 });
await g.waitFor(`!!document.querySelector('#lb-go')`);
await sleep(2000);
await g.shot(out('guest-lobby'));
await g.ev(`document.querySelector('#lb-name').value='Ana Souza'`);
await g.ev(`document.querySelector('#lb-go').click()`);
await sleep(6000);
await g.shot(out('guest-in'));
await p.send('Page.bringToFront');
await sleep(1500);
await p.shot(out('studio-guest'));
console.log('STUDIO', s.id);
process.exit(0);
