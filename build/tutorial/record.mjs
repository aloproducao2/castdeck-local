// Roteiro do tutorial em vídeo da versão desktop do CastDeck.
// Pré-requisitos: servidor de dev em :3200 com pasta de dados limpa (CASTDECK_DATA) e Edge com --remote-debugging-port=9335.
// Uso: node build/tutorial/record.mjs  → frames em build/tmp/tutorial/frames (montar com build/tutorial/make-video.mjs)
import { openPage, BASE, CDP, sleep, bsend, recStart, recFocus, recStop, recPause, rec } from './tut-lib.mjs';

// fecha janelas antigas do servidor do tutorial para começar do zero
for (const t of await (await fetch(`${CDP}/json/list`)).json()) if (t.type === 'page' && (t.url.startsWith(BASE) || t.url.startsWith('edge://'))) await bsend('Target.closeTarget', { targetId: t.id });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
// procura um elemento pelo texto (botões sem id)
const byText = (sel, txt) => `js:[...document.querySelectorAll(${JSON.stringify(sel)})].find(e=>e.textContent.includes(${JSON.stringify(txt)}))`;
// abre o <details> (acordeão do painel) que contém o seletor
async function openSection(p, sel) {
  const sumSel = `js:document.querySelector(${JSON.stringify(sel)})?.closest('details')?.querySelector('summary')`;
  const isClosed = await p.ev(`(()=>{const d=document.querySelector(${JSON.stringify(sel)})?.closest('details');return !!d&&!d.open})()`);
  if (isClosed) {
    if (await p.ev(`!!(${sumSel.slice(3)})`)) {
      await p.moveTo(sumSel, 600);
      await p.ev(`(()=>{const d=document.querySelector(${JSON.stringify(sel)})?.closest('details');if(d){d.open=true;d.dispatchEvent(new Event('toggle'))}})()`);
      await sleep(600);
    }
  }
}
async function group(p, g, tab) {
  await p.click(`.grp[data-group="${g}"]`, { after: 600 });
  if (tab) {
    const sel = `.tab[data-tab="${tab}"]`;
    await p.waitFor(`!document.querySelector(${JSON.stringify(sel)})?.hidden`, 4000).catch(() => {});
    if (await p.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});return !!e && !e.hidden && e.offsetParent !== null})()`)) {
      await p.click(sel, { after: 900 });
    }
  }
}

try {
  // ================= 1. Painel inicial =================
  const p = await openPage(`${BASE}/`, { cam: 'host', left: 0 });
  await p.waitFor(`!!document.querySelector('#ns-name')`);
  await sleep(1200);
  recStart();
  await recFocus(p);
  await p.step('1/7 · Painel inicial');
  await p.cap('Bem-vindo ao CastDeck', 'Seu estúdio de lives 100% no seu computador');
  await sleep(3500);
  await p.cap('Tudo começa no painel: dê um nome e crie o seu estúdio');
  await sleep(1500);
  await p.type('#ns-name', 'Podcast da Semana');
  await sleep(600);
  await p.click('#new-studio button', { after: 300 });
  await p.waitFor(`location.pathname.startsWith('/studio/') && !!document.querySelector('#lb-go')`);
  const studioId = await p.ev('location.pathname.split("/")[2]');
  await recFocus(p); // garante o screencast depois da navegação
  log('estúdio criado:', studioId);

  // ================= 2. Lobby do host =================
  log('2/9: Lobby do host');
  await sleep(1500);
  await p.step('2/7 · Câmera e microfone');
  await p.cap('Antes de entrar, confira sua câmera e seu microfone', 'Escolha os dispositivos e a qualidade de envio');
  await sleep(2500);
  await p.moveTo('#lb-camsel', 900);
  await sleep(900);
  await p.moveTo('#lb-micsel', 900);
  await sleep(900);
  await p.cap('Digite o nome que vai aparecer na tela');
  await p.type('#lb-name', 'Miguel');
  await sleep(700);
  await p.click('#lb-go', { after: 300 });
  await p.waitFor(`!!document.querySelector('#program-canvas')`);
  await sleep(2500);
  await p.cap('Este é o estúdio: o programa no centro, os controles embaixo e os recursos na lateral');
  await sleep(4500);

  // ================= 3. Convidar pessoas =================
  log('3/9: Convidar pessoas');
  await p.step('3/7 · Convidar pessoas');
  await p.cap('Para chamar alguém, clique em Convidar');
  await sleep(1200);
  await p.click('#c-invite', { after: 1200 });
  await p.cap('Envie o link da Internet para quem está longe', 'Na mesma rede Wi-Fi, use o link da rede local');
  await sleep(5000);
  await p.click('.modal-back [data-close]', { after: 600 });
  await p.cap('');

  // convidada entra pela página do link (outra janela, outro "computador")
  const g = await openPage(`${BASE}/join/${studioId}`, { cam: 'guest1', left: 60 });
  await g.waitFor(`!!document.querySelector('#lb-go')`);
  await sleep(800);
  await recFocus(g);
  await g.step('3/7 · Do lado do convidado');
  await g.cap('O convidado abre o link no navegador, sem instalar nada', 'Confere a câmera, digita o nome e entra');
  await sleep(3000);
  await g.type('#lb-name', 'Ana Souza');
  await sleep(500);
  await g.click('#lb-go', { after: 800 });
  await g.cap('Pronto! Ela aguarda nos bastidores até o host chamar');
  await g.waitFor(`window.__guest?.peer?.pc?.connectionState==='connected'`, 30000).catch((e) => log('aviso g1', e.message));
  await sleep(3000);

  // segundo convidado entra em segundo plano (não aparece na gravação)
  const g2 = await openPage(`${BASE}/join/${studioId}`, { cam: 'guest2', left: 120 });
  await g2.waitFor(`!!document.querySelector('#lb-go')`);
  await sleep(1500);
  await g2.ev(`document.querySelector('#lb-name').value='Carlos Lima'`);
  await g2.ev(`document.querySelector('#lb-go').click()`);

  await recFocus(p);
  // ================= 4. Palco e layouts =================
  log('4/9: Palco e layouts');
  await p.step('4/7 · Palco e layouts');
  await p.cap('No estúdio, os convidados aparecem nos bastidores', 'Só vai ao ar quem você colocar no palco');
  const tileBtn = (nm) => `js:[...document.querySelectorAll('#backstage .tile')].find(t=>t.textContent.includes(${JSON.stringify(nm)}))?.querySelector('.stage-btn button')`;
  await p.waitFor(`!!(${tileBtn('Ana').slice(3)})`, 20000).catch((e) => log('aviso espera Ana:', e.message));
  await g2.waitFor(`window.__guest?.peer?.pc?.connectionState==='connected'`, 20000).catch((e) => log('aviso g2', e.message));
  await p.waitFor(`!!(${tileBtn('Carlos').slice(3)})`, 20000).catch((e) => log('aviso espera Carlos:', e.message));
  await sleep(2500);

  // ================= 4. Palco e layouts =================
  await p.cap('Passe o mouse sobre o vídeo e clique em “Pôr no palco”');
  await sleep(1000);
  await p.click(tileBtn('Ana'), { wait: 1200, after: 1800 });
  if (await p.ev(`!!(${tileBtn('Carlos').slice(3)})`)) await p.click(tileBtn('Carlos'), { wait: 1000, after: 1800 });
  log('no palco:', await p.ev(`[...document.querySelectorAll('#backstage .tile')].map(t=>t.textContent.trim().slice(0,30)).join(' | ')`));
  await p.cap('Escolha o layout com um clique');
  await sleep(1200);
  for (const [lay, txt] of [['grid', 'Grade: todos com o mesmo tamanho'], ['leader', 'Destaque: uma pessoa grande e as outras ao lado'], ['solo', 'Solo: só uma pessoa em tela cheia'], ['grid', '']]) {
    if (txt) await p.cap(txt);
    await p.click(`#layouts .layout-btn[data-layout="${lay}"]`, { after: 2600 });
  }

  // ================= 5. Banners e marca =================
  log('5/9: Banners e marca');
  await p.step('5/7 · Banners e identidade visual');
  await p.cap('Em Conteúdo › Banners você cria letreiros (GC) para a tela');
  await group(p, 'content', 'banners');
  await openSection(p, '#bn-new');
  await p.type('#bf-title', 'Ana Souza');
  await p.type('#bf-sub', 'Especialista em marketing digital');
  await p.click('#bn-add', { after: 1200 });
  await p.cap('Clique no banner para colocá-lo no ar', 'Clique de novo para tirar');
  await p.waitFor(`!!document.querySelector('#bn-list .banner-item')`, 5000).catch(() => {});
  if (await p.ev(`!!document.querySelector('#bn-list .banner-item')`)) {
    await p.click('#bn-list .banner-item', { after: 3500 });
    await p.click('#bn-list .banner-item', { after: 1200 });
  }
  await p.cap('Em Marca você escolhe a cor do tema, o fundo, o logo e os overlays');
  await group(p, 'brand', 'brand');
  await sleep(1000);
  await p.click('js:document.querySelectorAll("[data-color]")[3]', { after: 1500 });
  await p.click('js:document.querySelectorAll("[data-bg]")[2]', { after: 2000 });
  await p.click('js:document.querySelectorAll("[data-bg]")[0]', { after: 1500 });

  // ================= 6. Redes Sociais, Chat e Moderação =================
  log('6/9: Redes sociais e moderação');
  await p.step('6/9 · Redes sociais e moderação');
  await p.cap('Em Público › Redes, conecte os chats do YouTube e da Twitch', 'Zero cota: não precisa de chaves pagas nem limites diários');
  await group(p, 'audience', 'social');
  await sleep(1500);
  // Simular inserção de mensagens bonitas de exemplo no chat e na fila para visualização na tela
  await p.ev(`(()=>{
    if (window.__socialUI) {
      window.__socialUI.onMessage({
        id: 'msg-demo-1',
        name: 'Marcos Silva',
        text: 'Sensacional essa nova atualização do CastDeck! Parabéns pelo projeto! 🚀👏',
        tokens: [{t:'text', v:'Sensacional essa nova atualização do CastDeck! Parabéns pelo projeto! 🚀👏'}],
        type: 'youtube',
        color: '#ff4444',
        ts: Date.now()
      });
      window.__socialUI.onMessage({
        id: 'msg-demo-2',
        name: 'Camila Tech',
        text: 'Qual microfone você está usando? O som está cristalino!',
        tokens: [{t:'text', v:'Qual microfone você está usando? O som está cristalino!'}],
        type: 'twitch',
        color: '#9146ff',
        ts: Date.now()
      });
    }
  })()`);
  await sleep(2200);
  // Colocar a mensagem no ar no PGM
  await p.cap('Clique para exibir o comentário na tela do programa');
  if (await p.ev(`!!document.querySelector('.soc-msg .btn-air')`)) {
    await p.click('.soc-msg .btn-air', { after: 3200 });
  }
  // Demonstrar carrossel e moderação externa
  await p.cap('Fila inteligente, carrossel automático no PGM e pop-out para segundo monitor');
  if (await p.ev(`!!document.querySelector('#soc-btn-focus')`)) {
    await p.moveTo('#soc-btn-focus', 1000);
  }
  if (await p.ev(`!!document.querySelector('#soc-btn-popout')`)) {
    await p.moveTo('#soc-btn-popout', 1000);
  }
  await sleep(2000);
  // Tirar a mensagem do ar
  if (await p.ev(`!!document.querySelector('#soc-cur-hide')`)) {
    await p.click('#soc-cur-hide', { after: 1200 });
  } else if (await p.ev(`!!document.querySelector('.soc-msg .btn-air.on')`)) {
    await p.click('.soc-msg .btn-air.on', { after: 1200 });
  }

  // ================= 7. Mesa de Áudio Broadcast =================
  log('7/9: Mesa de áudio');
  await p.step('7/9 · Mesa de áudio profissional');
  await p.cap('Em Áudio você controla faders, mute, ganho e redução de ruído por canal');
  await group(p, 'audio', 'audio');
  await sleep(2200);
  if (await p.ev(`!!document.querySelector('.audio-chan input[type="range"]')`)) {
    await p.moveTo('.audio-chan input[type="range"]', 1000);
  }
  await sleep(2500);

  // ================= 8. Destinos, transmissão e gravação =================
  log('8/9: Transmitir e gravar');
  await p.step('8/9 · Transmitir e gravar');
  await p.cap('Em Configurar › Transmissão, cadastre seus destinos', 'YouTube, Facebook, Twitch ou qualquer servidor RTMP');
  await group(p, 'setup', 'output');
  await sleep(800);
  await p.click('#o-dest-add', { after: 1200 });
  await p.type('#d-name', 'Meu canal');
  await p.type('#d-key', 'xxxx-xxxx-xxxx-xxxx', { delay: 35 });
  await p.cap('Cole a chave de transmissão que o YouTube fornece e salve');
  await sleep(1500);
  await p.click('#d-save', { after: 1500 });
  await p.cap('Na hora de entrar ao vivo, clique em Transmitir');
  await p.click('#btn-live', { after: 1500 });
  await p.cap('Marque os destinos, se quer gravar junto, e confirme', 'Aqui vamos só olhar — a gravação vem a seguir');
  await sleep(4000);
  await p.click('.modal-back [data-close]', { after: 800 });
  await p.cap('Para só gravar no computador, use o botão Gravar');
  await p.click('#btn-record', { after: 1500 });
  await sleep(1500);
  await p.click('#gl-go', { after: 1500 });
  await p.cap('Gravando! O arquivo fica na pasta de gravações do seu PC');
  await sleep(4000);
  // parada da gravação independente com modal confirmDialog
  await p.click('#btn-record', { after: 1500 });
  if (await p.ev(`!!document.querySelector('.modal-back [data-ok]')`)) {
    await p.click('.modal-back [data-ok]', { after: 1500 });
  }

  // ================= 9. Saídas para OBS/vMix =================
  log('9/9: Saídas para OBS e vMix');
  await p.step('9/9 · Saídas para OBS e vMix');
  await p.cap('Em Sinais, cada saída tem um link para usar no OBS ou vMix', 'Programa, versão vertical e cada pessoa separada');
  await group(p, 'outputs', 'outputs');
  await sleep(1500);
  if (await p.ev(`!!document.querySelector('[data-out-copy]')`)) {
    await p.moveTo('[data-out-copy]', 1000);
    await p.click('[data-out-copy]', { after: 2000 });
  }
  await p.cap('Adicione o link como “Fonte de navegador” no OBS ou vMix');
  await sleep(3500);
  await p.step('');
  await p.cap('Pronto! Agora é com você 🎬', 'CastDeck · cast.flue.live');
  await sleep(4500);

  log('Gravação finalizada com sucesso! Parando screencast...');
  const n = await recStop();
  log('frames salvos:', n, 'erros host:', p.errors.length, 'g:', g.errors.length);
  if (p.errors.length) log('amostra erros:', p.errors.slice(0, 5));
  await g.close().catch(() => {});
  await g2.close().catch(() => {});
  log('Tudo concluído!');
  process.exit(0);
} catch (e) {
  process.stderr.write(`FALHA NO ROTEIRO: ${e.stack || e.message}\n`);
  console.error('FALHA NO ROTEIRO:', e);
  if (rec.on) await recStop().catch(() => {});
  process.exit(1);
}
