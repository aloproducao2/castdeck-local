// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Medidores de áudio sempre à vista (estilo YoloBox): o operador vê se cada microfone está chegando sem abrir a aba Áudio.
//  - Mestre: barras L/R finas na lateral do PROGRAMA, verde/amarelo/vermelho, com aviso "CLIP" perto de 0 dBFS.
//  - Miniaturas: botão de microfone em cada card (bastidores do modo Estúdio e barra de fontes da mesa de corte)
//    que enche conforme o nível; clique = mudo/volta NO PROGRAMA (mixer do CastDeck, não mexe no aparelho do convidado).
// Tudo é desenhado no máximo a ~15 fps e só mexe em variáveis CSS/classes: nada de canvas extra.

const GAP_MS = 66; // ~15 fps: suficiente para medidor e leve no Android
const FLOOR = -60; // dBFS no pé da escala
const CLIP_DB = -1; // pico acima disso acende "CLIP"
const CLIP_HOLD = 1500;
const pos = (db) => Math.max(0, Math.min(1, (db - FLOOR) / -FLOOR));

export function createMeters({ S, mixer, $, icons, getTiles }) {
  let lastT = 0;
  let clipUntil = 0;
  let lastSig = 0; // última vez que alguma fonte no ar passou de -50 dBFS (checagem antes de entrar ao vivo)
  const smooth = new Map(); // id -> nível suavizado 0..1 (sobe na hora, desce devagar, como um VU)
  const t = (s) => window.CDi18n?.t(s) ?? s;

  function mount() {
    const pgm = $('#program');
    if (!pgm || $('#pgm-vu')) return;
    pgm.insertAdjacentHTML(
      'afterbegin',
      `<div class="pgm-vu" id="pgm-vu" title="${t('Nível do programa (esquerdo/direito)')}" aria-hidden="true">
        <span>VU</span>
        <div class="pgm-vu-bars"><i class="pgm-vu-l"></i><i class="pgm-vu-r"></i></div>
        <small>dB</small>
        <b>CLIP</b>
      </div>`,
    );
  }

  // todas as fontes de áudio ligadas a um card (câmera + microfone, vídeo com som, tela com áudio)
  const audioOf = (id) => [...mixer.sources.values()].filter((a) => a.stageKey === id);
  // fontes de áudio que estão no ar agora (palco + o que a mesa de corte pôs em tela cheia), sem as mudas
  const onAirAudio = () => {
    const keys = new Set(S.take ? [...S.stage, S.take] : S.stage);
    return [...mixer.sources.values()].filter((a) => keys.has(a.stageKey) && !a.muted);
  };

  function toggleMute(id) {
    const list = audioOf(id);
    if (!list.length) return;
    const mute = !list.every((a) => a.muted);
    for (const a of list) mixer.setMuted(a.id, mute);
    lastT = 0; // redesenha já
  }

  // garante o botão-medidor dentro do card (a barra de fontes da mesa recria o HTML, então confere a cada volta)
  function ensure(host, id) {
    let b = host.querySelector(':scope > .mvu');
    if (b) return b;
    b = document.createElement('button');
    b.type = 'button';
    b.className = 'mvu';
    b.dataset.mvu = id;
    b.innerHTML = `<span class="mvu-fill"></span><span class="mvu-ico"></span>`;
    // o card inteiro também é clicável (prévia, palco, arrastar): o medidor não deixa o clique vazar
    const stop = (e) => e.stopPropagation();
    b.addEventListener('dblclick', stop);
    b.addEventListener('pointerdown', stop);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleMute(id);
    });
    host.append(b);
    return b;
  }

  function paint(b, id) {
    const list = audioOf(id);
    if (!list.length) {
      b.hidden = true;
      return;
    }
    b.hidden = false;
    const muted = list.every((a) => a.muted);
    let pk = -90;
    if (!muted) for (const a of list) pk = Math.max(pk, mixer.levelDb(a.id).peak);
    const now = pos(pk);
    const lv = Math.max(now, (smooth.get(id) || 0) * 0.82);
    smooth.set(id, lv);
    b.style.setProperty('--lv', lv.toFixed(3));
    b.classList.toggle('hot', pk > -6);
    if (b.parentElement) {
      b.parentElement.style.setProperty('--lv', lv.toFixed(3));
      b.parentElement.classList.toggle('vu-hot', pk > -6);
      b.parentElement.classList.toggle('vu-muted', muted);
    }
    if (b._muted !== muted) {
      b._muted = muted;
      b.classList.toggle('muted', muted);
      b.querySelector('.mvu-ico').innerHTML = muted ? icons.micOff : icons.mic;
      const tip = muted ? t('Mudo no programa: clique para voltar o som') : t('Nível do áudio: clique para deixar mudo no programa');
      b.title = tip;
      b.setAttribute('aria-label', tip);
      b.setAttribute('aria-pressed', String(muted));
    }
  }

  function tick() {
    if (document.hidden) return;
    const now = performance.now();
    if (now - lastT < GAP_MS) return;
    lastT = now;
    for (const a of onAirAudio()) if (mixer.levelDb(a.id).peak > -50) lastSig = now;
    // mestre L/R
    const vu = $('#pgm-vu');
    if (vu) {
      if (mixer.ctx?.state === 'suspended') mixer.resume().catch(() => {});
      const [l, r] = mixer.programDb();
      let pkL = l.peak;
      let pkR = r.peak;
      for (const a of onAirAudio()) {
        const d = mixer.levelDb(a.id).peak;
        if (d > -50) lastSig = now;
        if (d > pkL) pkL = d;
        if (d > pkR) pkR = d - 0.8;
      }
      if (pkR <= -85 && pkL > -85) pkR = pkL - 0.8;
      const lvL = Math.max(pos(pkL), (smooth.get('__pgm_l') || 0) * 0.82);
      const lvR = Math.max(pos(pkR), (smooth.get('__pgm_r') || 0) * 0.82);
      smooth.set('__pgm_l', lvL);
      smooth.set('__pgm_r', lvR);
      const barL = vu.querySelector('.pgm-vu-l');
      const barR = vu.querySelector('.pgm-vu-r');
      if (barL) barL.style.setProperty('--v', lvL.toFixed(3));
      if (barR) barR.style.setProperty('--v', lvR.toFixed(3));
      if (Math.max(pkL, pkR) > CLIP_DB) clipUntil = now + CLIP_HOLD;
      vu.classList.toggle('clip', now < clipUntil);
    }

    // bastidores do modo Estúdio (só os visíveis)
    for (const [id, el] of getTiles()) {
      if (el.offsetParent === null) continue;
      const tv = el.querySelector('.tv');
      if (tv) paint(ensure(tv, id), id);
    }
    // barra de fontes da mesa de corte
    if (S.switcher) {
      for (const card of document.querySelectorAll('#sw-bus .sw-card[data-src]')) {
        const id = card.dataset.src;
        const th = card.querySelector('.sw-thumb');
        if (th && id !== '__scene__') paint(ensure(th, id), id);
      }
    }
  }

  return { mount, tick, toggleMute, lastSignal: () => lastSig, hasMic: () => onAirAudio().length > 0 };
}
