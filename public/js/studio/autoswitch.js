// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// DIRETOR AUTO (antes "AUTO-VOZ"): corte automático por voz e movimento na mesa de corte (inspirado no "auto switch" do YoloBox).
//
// Quem fala sozinho por um tempo vai para o ar em tela cheia; duas ou mais pessoas falando juntas,
// ou silêncio longo, voltam para a Cena (o palco com o layout). Regras pensadas para não "piscar":
//  - só conta quem está NA CENA (palco): quem está nos bastidores não está com o áudio no ar;
//  - a pessoa precisa falar HOLD_MS seguidos para ganhar o corte (tosse e "uhum" não cortam);
//  - cada corte fica no ar pelo menos MIN_ON_MS (troca rápida demais cansa quem assiste);
//  - corte manual do operador pausa o AUTO-VOZ por PAUSE_MS: a mão do operador sempre manda.
// O nível vem do analisador de cada fonte do mixer, que fica depois do volume/mudo:
// microfone mudo no CastDeck nunca dispara corte.

const KEY = 'castdeck.autovoz';
const TICK_MS = 100; // 10x por segundo basta para voz e não pesa no render
const GAP_MS = 350; // pausa natural entre palavras que ainda conta como fala contínua
const RECENT_MS = 1500; // janela para considerar duas pessoas falando ao mesmo tempo
const PAUSE_MS = 10000; // pausa depois de um corte manual
// Perfis (estilo "diretor de TV"). hold = fala contínua para ganhar o corte; minOn = tempo mínimo de cada corte;
// both = fala acumulada para contar como "falando junto"; quiet = silêncio que muda o plano;
// maxOn = tira a mesma câmera do ar depois disso (0 = nunca); motion: off | boost (quem se mexe corta mais rápido)
// | active (no silêncio / ao cansar, vai para a câmera com mais movimento em vez da Cena).
const PROFILES = {
  podcast: { label: 'Podcast', hint: 'Conversa: corta rápido para quem fala; gestos aceleram o corte; dois falando = Cena', hold: 1200, minOn: 4000, both: 600, quiet: 8000, maxOn: 0, motion: 'boost' },
  show: { label: 'Show', hint: 'Dinâmico: cortes rápidos, varia os planos e busca a câmera com mais movimento', hold: 800, minOn: 2500, both: 500, quiet: 4000, maxOn: 9000, motion: 'active' },
  ritmo: { label: 'Ritmo', hint: 'Dinâmico: alterna layouts (solo, dupla, PiP, destaque, grade), tira do palco quem não fala e traz de volta, e reage a quem começa a falar', hold: 900, minOn: 3000, both: 600, quiet: 6000, maxOn: 0, motion: 'off', ritmo: true },
  igreja: { label: 'Igreja', hint: 'Calmo: fica na Cena (plano aberto) e só corta para falas longas, com cortes lentos', hold: 2500, minOn: 8000, both: 1500, quiet: 6000, maxOn: 0, motion: 'off' },
};
// movimento: miniatura 32x18 em tons de cinza comparada com a anterior (~4x por segundo, custo desprezível)
const MV_W = 32;
const MV_H = 18;
const MV_MS = 250;
const MV_ON = 3.5; // diferença média (0-255) acima da qual a câmera "está se mexendo" (acima do ruído do sensor)
// sensibilidade = limiar de RMS em dBFS (alta = pega voz mais baixa, mas também mais ruído)
const SENS = { low: -36, mid: -44, high: -52 };
// Áudio inteligente (ducking): quanto música/vídeos abaixam quando alguém fala e quanto tempo demoram a voltar
const DUCK_DB = { soft: -8, mid: -14, hard: -22 };
const DUCK_HOLD = { fast: 600, mid: 1400, slow: 2800 };

export function createAutoVoice({ S, comp, mixer, switcher, $, toast, setSolo, openTab, ritmoApi }) {
  let pref = {};
  try {
    pref = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {}
  let on = false; // sempre começa desligado: cortar sozinho precisa ser escolha consciente a cada sessão
  let sens = SENS[pref.sens] ? pref.sens : 'mid';
  let prof = PROFILES[pref.prof] ? pref.prof : 'podcast';
  let duckOn = !!pref.duck; // o ducking é inofensivo, então lembra a escolha entre sessões
  let duckLvl = DUCK_DB[pref.duckLvl] ? pref.duckLvl : 'mid';
  let duckRel = DUCK_HOLD[pref.duckRel] ? pref.duckRel : 'mid';
  let ritmoSpd = ['calm', 'mid', 'fast'].includes(pref.ritmoSpd) ? pref.ritmoSpd : 'mid'; // velocidade das trocas do modo Ritmo
  const motion = new Map(); // camId -> { cv, ctx, prev, score }
  let lastMv = 0;
  let lastTick = 0;
  let lastCut = 0;
  let pausedUntil = 0;
  let expect; // o que o AUTO-VOZ deixou no ar; se mudar sem ele, foi o operador
  let lastVoice = 0; // última vez que alguém falou
  const talk = new Map(); // camId -> { start, last, acc }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ sens, prof, duck: duckOn, duckLvl, duckRel, ritmoSpd }));
    } catch {}
  };
  const t = (s) => window.CDi18n?.t(s) ?? s;

  // modo Estúdio não tem mesa: o Diretor destaca (tela cheia) em vez de cortar
  const curTake = () => (S.switcher ? S.take : S.solo) ?? null;
  function doCut(target) {
    if (S.switcher) switcher.cutTo(target);
    else if (target !== (S.solo ?? null)) setSolo?.(target ?? S.solo); // setSolo alterna: repetir o atual limpa
  }

  const seg = (id, attr, items) =>
    `<div class="dp-seg" id="${id}" role="group">${items.map(([k, lbl, tip]) => `<button data-${attr}="${k}" title="${t(tip)}">${t(lbl)}</button>`).join('')}</div>`;

  function mount() {
    const col = $('#deck-dir');
    if (!col || $('#sw-voice')) return;
    mountPanel();
    col.insertAdjacentHTML(
      'beforeend',
      `<span class="deck-lbl">Diretor Auto-Voz</span><div class="deck-dir-body"><button class="sw-voice" id="sw-voice" aria-pressed="false" title="${t('DIRETOR AUTO: corta sozinho para quem fala, para vídeos/telas com som e (Show) para quem se mexe. No modo normal, destaca em tela cheia quem fala. Um corte manual pausa por 10 s')}"><i class="sw-voice-dot"></i>${t('DIRETOR AUTO')}<small id="sw-voice-st">${t('desligado')}</small></button>
      <button class="btn sm dir-ico" id="sw-duck" aria-pressed="false" title="${t('Áudio inteligente: quando alguém fala, música e vídeos abaixam sozinhos')}">♪↓</button>
      <button class="btn sm icon dir-ico" id="dir-open" title="${t('Painel do Diretor')}">⚙</button></div>`,
    );
    $('#sw-voice').onclick = () => setOn(!on);
    $('#sw-duck').onclick = () => setDuck(!duckOn);
    $('#dir-open').onclick = () => togglePanel();
    paint();
  }

  // Aba Diretor (#panel-director): corte (perfil, sensibilidade) e áudio inteligente
  function mountPanel() {
    const root = $('#panel-director');
    if (!root || $('#dir-panel')) return;
    root.innerHTML = `<div class="dir-panel" id="dir-panel">
        <div class="dp-head"><b>${t('Diretor automático')}</b></div>
        <section class="dp-sec dp-cut">
          <label class="check dp-row"><span><b>${t('Corte inteligente')}</b><small id="dp-mode">&nbsp;</small></span><span class="switch"><input type="checkbox" id="dp-cut"><span></span></span></label>
          <div class="dp-lbl">${t('Perfil')}</div>
          <div class="sw-prof dp-prof" id="sw-prof">${Object.entries(PROFILES).map(([k, p]) => `<button data-prof="${k}" title="${t(p.hint)}">${t(p.label)}</button>`).join('')}</div>
          <div class="dp-lbl">${t('Sensibilidade da voz')}</div>
          <div class="dp-seg" id="sw-sens" role="group">
            <button data-sens="low" title="${t('Só voz forte (ambiente barulhento)')}">${t('Baixa')}</button><button data-sens="mid" title="${t('Média')}">${t('Média')}</button><button data-sens="high" title="${t('Pega voz baixa (ambiente silencioso)')}">${t('Alta')}</button>
          </div>
          <div id="dp-ritmo-row"><div class="dp-lbl">${t('Velocidade do Ritmo')}</div>
          ${seg('dp-ritmo-spd', 'rs', [['calm', 'Calmo', 'Troca de cena a cada ~12-22 s'], ['mid', 'Normal', 'Troca de cena a cada ~7-14 s'], ['fast', 'Agitado', 'Troca de cena a cada ~4-8 s']])}</div>
        </section>
        <section class="dp-sec dp-duck">
          <label class="check dp-row"><span><b>${t('Áudio inteligente')}</b><small>${t('Quem fala abaixa música e vídeos; volta quando termina')}</small></span><span class="switch"><input type="checkbox" id="dp-duck"><span></span></span></label>
          <div class="dp-lbl">${t('Quanto abaixar')}</div>
          ${seg('dp-duck-lvl', 'dl', [['soft', 'Leve −8 dB', 'Música ainda audível'], ['mid', 'Média −14 dB', 'Equilibrado'], ['hard', 'Forte −22 dB', 'Quase some']])}
          <div class="dp-lbl">${t('Demora para voltar')}</div>
          ${seg('dp-duck-rel', 'dr', [['fast', 'Rápida', 'Volta em ~0,6 s'], ['mid', 'Normal', 'Volta em ~1,4 s'], ['slow', 'Lenta', 'Volta em ~2,8 s']])}
          <div class="dp-st" id="dp-duck-st"></div>
        </section>
        <section class="dp-sec dp-help">
          <b>${t('Como funciona')}</b>
          <ul>
            <li>${t('Mesa de corte ligada: o Diretor corta o programa para quem fala (ou vídeo/tela com som).')}</li>
            <li>${t('Modo normal: quem fala fica em tela cheia; silêncio ou conversa volta ao layout.')}</li>
            <li>${t('Perfil Ritmo: alterna layouts, tira do palco quem não fala por um tempo e reage a quem começa a falar. Ao desligar, o palco volta como estava.')}</li>
            <li>${t('Um corte manual seu pausa o Diretor por 10 s.')}</li>
            <li>${t('O áudio inteligente funciona nos dois modos, com o corte ligado ou não.')}</li>
          </ul>
        </section>
      </div>`;
    const p = $('#dir-panel');
    $('#dp-cut').onchange = (e) => setOn(e.target.checked);
    $('#dp-duck').onchange = (e) => setDuck(e.target.checked);
    p.addEventListener('click', (e) => {
      const d = e.target.closest('[data-dl]');
      const r = e.target.closest('[data-dr]');
      if (d) duckLvl = d.dataset.dl;
      else if (r) duckRel = r.dataset.dr;
      else if (e.target.closest('[data-rs]')) ritmoSpd = e.target.closest('[data-rs]').dataset.rs;
      else return;
      save();
      paint();
    });
    $('#sw-prof').onclick = (e) => {
      const b = e.target.closest('[data-prof]');
      if (!b) return;
      prof = b.dataset.prof;
      save();
      paint();
    };
    $('#sw-sens').onclick = (e) => {
      const b = e.target.closest('[data-sens]');
      if (!b) return;
      sens = b.dataset.sens;
      save();
      paint();
    };
  }

  // o ⚙ da barra leva para a aba Diretor do painel lateral (mesmo conteúdo no modo normal e na mesa de corte)
  function togglePanel() {
    openTab?.('director');
    paint();
  }

  function setOn(v) {
    on = !!v;
    if (!on) ritmoStop();
    talk.clear();
    pausedUntil = 0;
    lastCut = 0; // ao ligar, o primeiro corte pode vir assim que alguém falar
    lastVoice = performance.now();
    expect = curTake();
    $('.studio')?.classList.toggle('sw-voice-on', on);
    if (!on) for (const el of document.querySelectorAll('#sw-bus .sw-talk')) el.classList.remove('sw-talk');
    if (on) toast?.(S.switcher ? t('DIRETOR AUTO ligado: quem fala (ou vídeo com som) vai para o ar. Corte manual pausa por 10 s.') : t('DIRETOR AUTO ligado: quem fala fica em tela cheia; silêncio ou conversa volta ao layout normal.'), 'ok');
    paint();
  }

  function setDuck(v) {
    duckOn = !!v;
    save();
    if (duckOn) toast?.(t('Áudio inteligente ligado: música e vídeos abaixam quando alguém fala.'), 'ok');
    paint();
  }

  function paint(state) {
    const b = $('#sw-voice');
    if (!b) return;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('paused', on && state === 'paused');
    const st = $('#sw-voice-st');
    if (st) st.textContent = !on ? t('desligado') : state === 'paused' ? t('pausado') : t('ligado');
    const dk = $('#sw-duck');
    if (dk) {
      dk.classList.toggle('on', duckOn);
      dk.classList.toggle('ducking', duckState);
      dk.setAttribute('aria-pressed', String(duckOn));
    }
    const sg = (sel, attr, val) => {
      for (const x of document.querySelectorAll(`${sel} [data-${attr}]`)) x.classList.toggle('active', x.dataset[attr] === val);
    };
    sg('#sw-sens', 'sens', sens);
    sg('#sw-prof', 'prof', prof);
    sg('#dp-duck-lvl', 'dl', duckLvl);
    sg('#dp-duck-rel', 'dr', duckRel);
    sg('#dp-ritmo-spd', 'rs', ritmoSpd);
    const rr = $('#dp-ritmo-row');
    if (rr) rr.hidden = prof !== 'ritmo';
    const set = (id, v) => { const el = $(id); if (el && el.checked !== v) el.checked = v; };
    set('#dp-cut', on);
    set('#dp-duck', duckOn);
    $('#dp-cut')?.closest('.dp-cut')?.classList.toggle('off', !on);
    $('#dp-duck')?.closest('.dp-duck')?.classList.toggle('off', !duckOn);
    const md = $('#dp-mode');
    if (md) md.textContent = S.switcher ? t('Mesa de corte: corta para quem fala') : t('Modo normal: quem fala vai para tela cheia');
    const ds = $('#dp-duck-st');
    if (ds) ds.textContent = !duckOn ? '' : duckState ? `${t('Reduzindo música e vídeos')} (${DUCK_DB[duckLvl]} dB)` : t('Aguardando fala');
  }

  // ===== Áudio inteligente (ducking): voz no ar abaixa música/vídeos pelo ganho 'pre' do mixer (não mexe no fader) =====
  let duckUntil = 0;
  let duckStreak = 0;
  let duckState = false;
  let duckApplied = 0;
  function setDuckGain(active) {
    const g = active ? 10 ** (DUCK_DB[duckLvl] / 20) : 1;
    const at = mixer.ctx.currentTime;
    for (const src of mixer.sources.values()) {
      if (S.sources.get(src.stageKey)?.kind !== 'media') continue;
      src.pre.gain.cancelScheduledValues(at);
      src.pre.gain.setTargetAtTime(g, at, active ? 0.06 : 0.45); // ataque rápido, volta suave
    }
  }
  function duckTick(now) {
    if (!duckOn) {
      if (duckState) {
        duckState = false;
        setDuckGain(false);
        paint();
      }
      return;
    }
    const stage = new Set(S.stage);
    const thr = SENS[sens];
    let voice = false;
    for (const src of mixer.sources.values()) {
      const s = S.sources.get(src.stageKey);
      if (!s || s.kind === 'media' || s.kind === 'image' || s.kind === 'screen' || src.muted || s.micOn === false || !stage.has(src.stageKey)) continue;
      if (mixer.levelDb(src.id).rms > thr) {
        voice = true;
        break;
      }
    }
    duckStreak = voice ? duckStreak + 1 : 0;
    if (duckStreak >= 2) duckUntil = now + DUCK_HOLD[duckRel]; // 200 ms seguidos: ignora estalos
    const playing = [...S.sources.values()].some((m) => m.kind === 'media' && m.el && !m.el.paused);
    const act = now < duckUntil && playing;
    if (act !== duckState || (act && now - duckApplied > 1000)) {
      const changed = act !== duckState;
      duckState = act;
      duckApplied = now;
      setDuckGain(act);
      if (changed) paint();
    }
  }

  // movimento de cada câmera com imagem: diferença média entre duas miniaturas 32x18 (suavizada)
  function sampleMotion(now) {
    if (now - lastMv < MV_MS) return;
    lastMv = now;
    for (const s of S.sources.values()) {
      if (!s.el?.videoWidth || s.camOff || s.el.readyState < 2 || s.kind === 'image' || (s.el.paused && s.kind === 'media')) {
        motion.delete(s.id);
        continue;
      }
      let m = motion.get(s.id);
      if (!m) {
        const cv = document.createElement('canvas');
        cv.width = MV_W;
        cv.height = MV_H;
        motion.set(s.id, (m = { cv, ctx: cv.getContext('2d', { willReadFrequently: true }), prev: null, score: 0 }));
      }
      m.ctx.drawImage(s.el, 0, 0, MV_W, MV_H);
      const d = m.ctx.getImageData(0, 0, MV_W, MV_H).data;
      const g = new Uint8Array(MV_W * MV_H);
      let diff = 0;
      for (let i = 0, j = 0; j < g.length; i += 4, j++) {
        g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
        if (m.prev) diff += Math.abs(g[j] - m.prev[j]);
      }
      if (m.prev) m.score = m.score * 0.6 + (diff / g.length) * 0.4;
      m.prev = g;
    }
    for (const id of motion.keys()) if (!S.sources.has(id)) motion.delete(id);
  }
  const moving = (id) => (motion.get(id)?.score ?? 0) > MV_ON;

  // nível de voz por câmera da Cena: soma (máximo) de todas as fontes de áudio ligadas a ela
  function levels() {
    const stage = new Set(S.stage);
    const out = new Map();
    for (const src of mixer.sources.values()) {
      const cam = src.stageKey;
      const s = S.sources.get(cam);
      // câmeras, telas compartilhadas e vídeos/áudios tocando contam como "fonte falando" (som no ar)
      if (!s || s.kind === 'image' || !(stage.has(cam) || ritmoPeople.has(cam)) || src.muted || s.micOn === false) continue;
      if (s.kind === 'media' && s.el?.paused) continue;
      const db = mixer.levelDb(src.id).rms;
      out.set(cam, Math.max(out.get(cam) ?? -90, db));
    }
    return out;
  }

  // ===== Modo RITMO: corte dinâmico que varia layouts e tira do palco quem não está falando =====
  // Funciona na mesa de corte (a Cena vira a cena montada) e no modo normal. Ao desligar, restaura palco e layout originais.
  const ritmoPeople = new Set(); // pessoas (câmeras) do palco no início: continuam sendo "escutadas" mesmo fora do palco
  const ritmo = { active: false, base: null, nextBeat: 0, last: '', lastSpeaker: null, absent: new Map(), expStage: '', expLayout: '', fullRun: 0 };
  const skey = (a) => a.join('|');
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const RITMO_SPD = { calm: 1.6, mid: 1, fast: 0.6 };

  function ritmoStart(now) {
    ritmo.base = { stage: [...S.stage], layout: S.layout };
    ritmoPeople.clear();
    for (const id of S.stage) if (S.sources.get(id)?.kind === 'camera') ritmoPeople.add(id);
    Object.assign(ritmo, { active: true, nextBeat: now + 3000, last: '', lastSpeaker: null, fullRun: 0, expStage: skey(S.stage), expLayout: S.layout });
    ritmo.absent.clear();
  }
  function ritmoStop() {
    if (!ritmo.active) return;
    ritmo.active = false;
    ritmoPeople.clear();
    const b = ritmo.base;
    ritmo.base = null;
    if (!b || !ritmoApi) return;
    const ids = b.stage.filter((id) => S.sources.has(id));
    if (skey(S.stage) !== skey(ids)) ritmoApi.setStage(ids);
    if (S.layout !== b.layout) ritmoApi.setLayout(b.layout);
  }

  // escolhe a próxima cena: pesos por tipo, sem repetir a anterior, e quem ficou muito tempo fora volta
  function ritmoPick(now, speaker) {
    const people = [...ritmoPeople].filter((id) => S.sources.has(id));
    const spk = speaker && people.includes(speaker) ? speaker : rnd(people);
    const rest = people.filter((id) => id !== spk);
    const overdue = rest.find((id) => ritmo.absent.has(id) && now - ritmo.absent.get(id) > 35000);
    const second = overdue ?? (rest.includes(ritmo.lastSpeaker) ? ritmo.lastSpeaker : rnd(rest));
    if (!spk) return null;
    const c = [[3, { name: 'foco', ids: [spk], layouts: ['solo'] }]];
    if (rest.length) {
      c.push([3, { name: 'dupla', ids: [spk, second], layouts: ['split', 'leader', 'sidebar'] }]);
      c.push([2, { name: 'pip', ids: [spk, second], layouts: ['pip'] }]);
      c.push([2, { name: 'todos', ids: [spk, ...rest], layouts: rest.length === 1 ? ['split', 'grid'] : ['grid', 'leader', 'sidebar'] }]);
    }
    if (rest.length >= 2) c.push([2, { name: 'destaque', ids: [spk, ...rest], layouts: ['leader', 'sidebar'] }]);
    let pool = c.filter(([, sc]) => !overdue || sc.ids.includes(overdue));
    if (!pool.length) pool = c;
    // de vez em quando alguém sai do palco: depois de 2 cenas com todo mundo, a próxima é obrigatoriamente um recorte
    if (ritmo.fullRun >= 2 && people.length > 1) pool = pool.filter(([, sc]) => sc.ids.length < people.length).length ? pool.filter(([, sc]) => sc.ids.length < people.length) : pool;
    const fresh = pool.filter(([, sc]) => !sc.layouts.every((l) => ritmo.last === sc.name + l));
    if (fresh.length) pool = fresh;
    let r = Math.random() * pool.reduce((a, [w]) => a + w, 0);
    const sc = (pool.find(([w]) => (r -= w) < 0) || pool[0])[1];
    const layouts = sc.layouts.filter((l) => ritmo.last !== sc.name + l);
    return { name: sc.name, ids: sc.ids, layout: rnd(layouts.length ? layouts : sc.layouts) };
  }

  function ritmoCompose(now, sc) {
    if (!sc) return;
    // telas/mídias do palco original continuam (e viram o item principal); por isso com elas só há layouts com destaque
    const extras = ritmo.base.stage.filter((id) => !ritmoPeople.has(id) && S.sources.has(id));
    const layout = extras.length && ['solo', 'grid', 'split'].includes(sc.layout) ? rnd(['sidebar', 'leader']) : sc.layout;
    const ids = [...extras, ...sc.ids.filter((id) => S.sources.has(id))];
    if (skey(ids) !== skey(S.stage)) ritmoApi.setStage(ids);
    if (layout !== S.layout) ritmoApi.setLayout(layout);
    if (S.switcher && S.take !== null) switcher.cutTo(null); // a Cena é o palco montado
    else if (!S.switcher && S.solo) setSolo?.(S.solo);
    for (const id of ritmoPeople) {
      if (S.stage.includes(id)) ritmo.absent.delete(id);
      else if (!ritmo.absent.has(id)) ritmo.absent.set(id, now);
    }
    ritmo.fullRun = [...ritmoPeople].every((id) => S.stage.includes(id)) ? ritmo.fullRun + 1 : 0;
    Object.assign(ritmo, { last: sc.name + layout, expStage: skey(S.stage), expLayout: S.layout });
    expect = curTake();
    lastCut = now;
    ritmo.nextBeat = now + (7000 + Math.random() * 7000) * RITMO_SPD[ritmoSpd];
  }

  function ritmoTick(now, together, solo) {
    if (!ritmoApi) return;
    if (!ritmo.active) ritmoStart(now);
    // o operador mexeu no palco/layout: aceita a nova base e pausa
    if (skey(S.stage) !== ritmo.expStage || S.layout !== ritmo.expLayout) {
      ritmo.base = { stage: [...S.stage], layout: S.layout };
      ritmoPeople.clear();
      for (const id of S.stage) if (S.sources.get(id)?.kind === 'camera') ritmoPeople.add(id);
      Object.assign(ritmo, { expStage: skey(S.stage), expLayout: S.layout });
      pausedUntil = now + PAUSE_MS;
      return;
    }
    if (ritmoPeople.size < 1 || now - lastCut < PROFILES[prof].minOn) return;
    const spk = solo.find((id) => ritmoPeople.has(id));
    const both = together.filter((id) => ritmoPeople.has(id));
    if (both.length >= 2 && !both.slice(0, 2).every((id) => S.stage.includes(id))) {
      return ritmoCompose(now, { name: 'dupla', ids: both.slice(0, 2), layout: rnd(['split', 'leader']) });
    }
    if (spk && spk !== ritmo.lastSpeaker) {
      const sc = ritmoPick(now, spk);
      ritmo.lastSpeaker = spk; // reage a quem começou a falar
      return ritmoCompose(now, sc);
    }
    if (now - lastVoice >= PROFILES[prof].quiet && !ritmo.last.startsWith('todos') && ritmoPeople.size > 1) {
      return ritmoCompose(now, { name: 'todos', ids: [...ritmoPeople], layout: ritmoPeople.size === 2 ? 'split' : 'grid' }); // silêncio: todo mundo
    }
    if (now >= ritmo.nextBeat) ritmoCompose(now, ritmoPick(now, spk ?? (now - lastVoice < 3000 ? ritmo.lastSpeaker : null)));
  }

  function tick() {
    const now = performance.now();
    if (now - lastTick < TICK_MS) return;
    lastTick = now;
    duckTick(now); // o ducking roda mesmo com o corte automático desligado
    if (!on) return;

    // corte feito pelo operador (botão, teclado, T-bar ou fonte que saiu): pausa e respeita
    if (curTake() !== expect) {
      expect = curTake();
      lastCut = now;
      pausedUntil = now + PAUSE_MS;
    }

    const P = PROFILES[prof];
    if (!P.ritmo && ritmo.active) ritmoStop();
    if (P.motion !== 'off') sampleMotion(now);
    else if (motion.size) motion.clear();
    const thr = SENS[sens];
    const lv = levels();
    for (const id of talk.keys()) if (!lv.has(id)) talk.delete(id);
    const speaking = [];
    for (const [id, db] of lv) {
      let st = talk.get(id);
      if (db > thr) {
        if (!st || now - st.last > GAP_MS) st = { start: now, last: now, acc: 0 };
        st.acc += TICK_MS;
        st.last = now;
        talk.set(id, st);
        lastVoice = now;
      }
      if (st && now - st.last <= GAP_MS) speaking.push(id);
    }
    // destaque de quem está falando na barra de fontes (anel verde, como o tally de áudio)
    for (const el of document.querySelectorAll('#sw-bus [data-src]')) el.classList.toggle('sw-talk', speaking.includes(el.dataset.src));

    const paused = now < pausedUntil;
    paint(paused ? 'paused' : 'on');
    if (paused || S.ftb || comp.mixProgress?.(now) != null) return;

    const holdOf = (id) => (P.motion === 'boost' && moving(id) ? P.hold * 0.6 : P.hold); // quem gesticula corta mais rápido
    const together = [...talk].filter(([, st]) => now - st.last <= RECENT_MS && st.acc >= P.both).map(([id]) => id);
    const solo = [...talk].filter(([id, st]) => now - st.last <= GAP_MS && now - st.start >= holdOf(id)).map(([id]) => id);
    if (P.ritmo) return ritmoTick(now, together, solo);
    // câmera com mais movimento (só perfil "active"): plano de corte quando ninguém domina a fala
    const busiest = () => {
      let best = null;
      let top = MV_ON;
      for (const [id, m] of motion) if (m.score > top && S.sources.has(id)) [best, top] = [id, m.score];
      return best;
    };
    let target;
    if (together.length >= 2) target = null; // conversa: todo mundo na Cena
    else if (solo.length === 1) {
      target = solo[0];
      // variedade: cansou do mesmo plano, alivia na Cena (o falante volta depois do tempo mínimo)
      if (P.maxOn && target === curTake() && now - lastCut > P.maxOn) target = null;
    } else if (now - lastVoice >= P.quiet) target = P.motion === 'active' ? busiest() : null; // silêncio: Cena (ou o que mais se mexe)
    else return;
    if (target === curTake() || now - lastCut < P.minOn) return;
    if (target && !(S.switcher ? S.sources.has(target) : S.stage.includes(target))) return;
    doCut(target);
    expect = curTake();
    lastCut = now;
  }

  // trocar de modo (mesa <-> normal) não desliga o Diretor; só evita ler a troca como corte manual
  function onMode() {
    expect = curTake();
    paint();
  }

  return { mount, mountPanel, paint, tick, onMode, setOn, setDuck, get on() { return on; }, get sens() { return sens; }, get duckOn() { return duckOn; }, get ducking() { return duckState; } };
}
