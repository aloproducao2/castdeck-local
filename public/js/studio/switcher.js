// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Mesa de corte (modo OBS/vMix/ATEM): PRÉVIA | transição | PROGRAMA lado a lado, barra de fontes com miniaturas
// ao vivo (multiview), CORTE seco, AUTO (dissolve), T-bar arrastável e FTB (fade to black).
//
//  - S.take: o que está no ar. null = "Cena" (o palco com o layout atual, como no modo Estúdio);
//    um id de fonte = essa fonte em tela cheia (com marca, GC, letreiro e widgets por cima).
//  - S.pvw: o que está na prévia (mesma convenção). Ao cortar, prévia e programa trocam de lugar, como no vMix.
//  - O palco continua valendo para o áudio: cortar para outra câmera não silencia quem está falando no palco.
//  - Tally: câmeras remotas (celular pelo QR) recebem 'tally' para acender a borda vermelha/verde.
//  - Cores como em qualquer mesa broadcast: vermelho = no ar, verde = prévia.
import { PreviewView } from './compositor.js';
import { icons } from '../ui.js';

const SCENE = '__scene__';
const KEY = 'castdeck.switcher';
const MS_OPTS = [300, 500, 1000];
const BUS_KINDS = new Set(['camera', 'screen', 'media', 'image']);
const THUMB_W = 192;
const THUMB_H = 108;
const THUMB_GAP = 125; // ms entre miniaturas (~8 fps): só para reconhecer a imagem, sem pesar no PC

export function createSwitcher({ S, comp, $, esc, toast, sendControl, onAir, toggleStage, addCamera, onMode, openFx, fxActive, toggleCohost, isCohost }) {
  let pref = {};
  try {
    pref = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {}
  S.switcher = !!pref.on;
  S.transMs = MS_OPTS.includes(pref.ms) ? pref.ms : 500;
  S.take = null;
  S.pvw = null;
  S.ftb = false;
  let preview = null;
  let sceneView = null; // miniatura da "Cena" (palco + layout)
  let busKey = '';
  let thumbT = 0;
  const thumbs = new Map(); // id -> canvas da miniatura
  const tallySent = new Map(); // guestId -> 'pgm' | 'pvw' | ''
  // T-bar: rest = ponta onde a alavanca está parada (0 = em cima, 1 = embaixo). Cada transição leva para a outra ponta.
  const tb = { rest: 1, pos: 1, drag: false, started: false, anim: false, from: 1, to: 0 };
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ on: S.switcher, ms: S.transMs }));
    } catch {}
  };
  const t = (s) => window.CDi18n?.t(s) ?? s;

  // fontes na ordem da barra: suas câmeras primeiro, depois convidados/câmeras remotas, telas e mídias
  function busList() {
    const rank = (s) => (s.kind === 'camera' ? (s.ownerId === 'host' ? 0 : 1) : s.kind === 'screen' ? 2 : 3);
    // mesma ordem dos bastidores (S.bsOrder, a que o usuário arrasta); fontes novas sem posição vão ao fim pela ordem antiga
    const pos = (s) => { const i = (S.bsOrder || []).indexOf(s.id); return i < 0 ? Infinity : i; };
    return [...S.sources.values()].filter((s) => BUS_KINDS.has(s.kind)).sort((a, b) => pos(a) - pos(b) || rank(a) - rank(b));
  }
  const label = (id) => (id ? S.sources.get(id)?.label || 'Fonte' : 'Cena (palco)');

  function mount() {
    // monitor de PRÉVIA, à esquerda do PROGRAMA (mesmo tamanho, como no vMix e no Studio Mode do OBS)
    $('#sw-pvw-box').innerHTML = `
      <div class="sw-pvw" title="Prévia: o que vai entrar no ar no próximo corte">
        <canvas id="sw-pvw-canvas"></canvas>
        <span class="sw-tag pvw">PRÉVIA</span>
        <span class="sw-mon-name" id="sw-pvw-name"></span>
        <button class="mon-fs" data-fs="pvw" title="Tela cheia da prévia" data-tip="Tela cheia da prévia" aria-label="Tela cheia da prévia">${icons.expand}</button>
      </div>`;
    // coluna de transição entre os dois monitores
    $('#sw-tcol').innerHTML = `
      <button class="sw-cut" id="sw-cut" title="Corte seco: a prévia entra no ar na hora (Espaço ou Enter)">CORTE<small>Espaço ␣</small></button>
      <button class="sw-auto" id="sw-auto" title="Transição suave (dissolve) da prévia para o ar (T)">AUTO<small>T</small></button>
      <div class="sw-tbar" id="sw-tbar" title="T-bar: arraste até a outra ponta para fazer a transição na mão" role="slider" aria-label="T-bar" aria-valuemin="0" aria-valuemax="100" tabindex="0">
        <div class="sw-tbar-track"><div class="sw-tbar-fill" id="sw-tbar-fill"></div><div class="sw-tbar-handle" id="sw-tbar-handle"></div></div>
      </div>
      <div class="sw-ms" id="sw-ms" role="group" aria-label="Duração do AUTO">${MS_OPTS.map((ms) => `<button data-ms="${ms}">${ms < 1000 ? String(ms / 1000).replace('.', ',') : '1'}s</button>`).join('')}</div>
      <button class="sw-ftb" id="sw-ftb" title="Fade to black: escurece o programa inteiro (gráficos inclusive). Clique de novo para voltar">FTB</button>`;
    // barra de fontes (multiview)
    $('#switcher').innerHTML = `
      <div class="sw-bus-head">
        <strong>Fontes</strong>
        <span class="sw-help" title="Atalhos: Shift+número = corte direto · Espaço corta · T dissolve · Shift+F tela cheia">Clique = prévia · duplo clique = corte direto</span>
        <span class="sw-help-touch">Toque = prévia · toque duplo = corte direto</span>
        <span class="sw-legend"><i class="lg pgm"></i>No ar <i class="lg pvw"></i>Prévia</span>
        <button class="btn sm ghost icon sw-fs" data-fs="wall" data-label="Tela cheia" title="Mesa inteira em tela cheia (Shift+F)" data-tip="Mesa inteira em tela cheia (Shift+F)" aria-label="Tela cheia">${icons.expand}</button>
        <button class="btn sm ghost" id="sw-bs" aria-pressed="false" title="Mostrar os bastidores completos (ajustes de cada câmera, mudo, efeitos)">Bastidores</button>
      </div>
      <div class="sw-bus" id="sw-bus" role="toolbar" aria-label="Fontes da mesa de corte"></div>`;
    preview = new PreviewView(comp, $('#sw-pvw-canvas'));
    sceneView = new PreviewView(comp, document.createElement('canvas'), { width: THUMB_W * 2, height: THUMB_H * 2, fps: 8 });
    $('#sw-cut').onclick = () => take('cut');
    $('#sw-auto').onclick = () => take('mix');
    $('#sw-ftb').onclick = () => setBlack(!S.ftb);
    $('#sw-ms').onclick = (e) => {
      const b = e.target.closest('[data-ms]');
      if (!b) return;
      S.transMs = +b.dataset.ms;
      save();
      refresh();
    };
    $('#sw-bs').onclick = () => {
      const on = !$('.studio').classList.contains('sw-bs');
      $('.studio').classList.toggle('sw-bs', on);
      $('#sw-bs').setAttribute('aria-pressed', String(on));
    };
    const bus = $('#sw-bus');
    bus.onclick = (e) => {
      if (e.target.closest('#sw-add')) return addCamera?.();
      const tool = e.target.closest('[data-tool]');
      if (tool) {
        e.stopPropagation();
        if (tool.dataset.tool === 'fx') openFx?.(tool.dataset.id);
        else toggleCohost?.(tool.dataset.id);
        return;
      }
      const st = e.target.closest('[data-stage]');
      if (st) {
        // botão "palco" da miniatura: põe/tira da Cena sem mudar a prévia
        e.stopPropagation();
        return toggleStage?.(st.dataset.stage);
      }
      const b = e.target.closest('[data-src]');
      if (b) setPreview(b.dataset.src === SCENE ? null : b.dataset.src);
    };
    bus.ondblclick = (e) => {
      if (e.target.closest('[data-stage], [data-tool], #sw-add')) return;
      const b = e.target.closest('[data-src]');
      if (b) cutTo(b.dataset.src === SCENE ? null : b.dataset.src);
    };
    bindTbar();
    window.addEventListener('keydown', onKey);
    setMode(S.switcher, { silent: true });
  }

  function onKey(e) {
    if (!S.switcher || tb.drag || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    if (el?.closest?.('input, textarea, select, [contenteditable="true"], .modal-back')) return;
    if (document.querySelector('.modal-back')) return;
    const m = /^Digit(\d)$/.exec(e.code) || /^Numpad(\d)$/.exec(e.code);
    if (m) {
      const n = +m[1];
      const id = n === 0 ? null : busList()[n - 1]?.id;
      if (n !== 0 && !id) return;
      e.preventDefault();
      if (e.shiftKey) cutTo(id);
      else setPreview(id);
    } else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      take('cut');
    } else if (e.code === 'KeyT') {
      e.preventDefault();
      take('mix');
    }
  }

  function setMode(on, { silent = false } = {}) {
    S.switcher = !!on;
    save();
    const studio = $('.studio');
    studio?.classList.toggle('sw-on', S.switcher);
    if (!S.switcher) studio?.classList.remove('sw-bs');
    $('#switcher').hidden = !S.switcher;
    $('#sw-pvw-box').hidden = !S.switcher;
    $('#sw-tcol').hidden = !S.switcher;
    $('#btn-switcher')?.setAttribute('aria-pressed', String(S.switcher));
    if (!S.switcher) {
      // de volta ao modo Estúdio: o programa volta a ser o palco, sem dissolve pela metade nem tela preta esquecida
      const prev = S.take;
      S.take = null;
      S.pvw = null;
      comp.take = null;
      comp.endMix();
      tb.drag = tb.started = tb.anim = false;
      if (S.ftb) setBlack(false);
      onAir(prev);
    } else {
      S.pvw = S.pvw ?? busList().find((s) => s.id !== S.take && s.kind === 'camera')?.id ?? null;
      preview.set({ take: S.pvw });
      sceneView.set({ take: null });
      if (!silent) toast('Mesa de corte ligada: escolha a prévia e corte com Espaço (ou T para dissolver).', 'ok');
    }
    onMode?.(S.switcher);
    busKey = '';
    refresh();
    syncTally();
  }

  function setPreview(id) {
    if (id && !S.sources.has(id)) return;
    S.pvw = id;
    preview?.set({ take: id });
    refresh();
    syncTally();
  }

  const canTake = () => S.switcher && !(comp.fade && comp.fade.manual) && S.pvw !== S.take && (!S.pvw || S.sources.has(S.pvw));

  // prévia vai ao ar e o que estava no ar volta para a prévia
  function swap(kind, ms = 0) {
    const next = S.pvw;
    const prev = S.take;
    comp.transition(kind, ms);
    S.take = next;
    comp.take = next;
    S.pvw = prev;
    preview?.set({ take: prev });
    onAir(prev);
    refresh();
    syncTally();
  }

  // corte/dissolve pelos botões ou teclado
  function take(kind = 'cut') {
    if (S.pvw && !S.sources.has(S.pvw)) S.pvw = null;
    if (!canTake()) return;
    const mix = kind === 'mix';
    swap(mix ? 'mix' : 'cut', mix ? S.transMs : 0);
    if (mix) {
      // a T-bar acompanha o AUTO até a outra ponta, como numa mesa física motorizada
      tb.from = tb.rest;
      tb.to = 1 - tb.rest;
      tb.rest = tb.to;
      tb.anim = true;
    }
    const btn = $(mix ? '#sw-auto' : '#sw-cut');
    btn?.classList.remove('flash');
    void btn?.offsetWidth;
    btn?.classList.add('flash');
  }

  function cutTo(id) {
    if (id && !S.sources.has(id)) return;
    if (id === S.take) return;
    S.pvw = id;
    take('cut');
  }

  // ---------- T-bar ----------
  function bindTbar() {
    const bar = $('#sw-tbar');
    const track = bar.querySelector('.sw-tbar-track');
    const posAt = (e) => {
      const r = track.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    };
    const move = (e) => {
      if (!tb.drag) return;
      tb.pos = posAt(e);
      const p = Math.abs(tb.pos - tb.rest);
      if (!tb.started) {
        if (p < 0.03 || !canTake()) return;
        tb.started = true;
        swap('manual');
      }
      comp.setMix(p);
    };
    bar.onpointerdown = (e) => {
      if (!S.switcher || (comp.fade && !comp.fade.manual)) return;
      e.preventDefault();
      bar.setPointerCapture(e.pointerId);
      tb.drag = true;
      tb.started = false;
      tb.anim = false;
      move(e);
    };
    bar.onpointermove = move;
    const up = () => {
      if (!tb.drag) return;
      tb.drag = false;
      if (!tb.started) return (tb.pos = tb.rest);
      tb.started = false;
      const p = comp.fade?.p ?? 1;
      if (p >= 0.97) {
        comp.endMix();
        tb.rest = tb.pos = 1 - tb.rest;
      } else if (p <= 0.08) revert();
      else {
        // soltou no meio: termina sozinho no tempo do AUTO (vMix faz o mesmo com o T-bar do teclado)
        comp.resumeMix(S.transMs);
        tb.from = tb.rest;
        tb.to = 1 - tb.rest;
        tb.rest = tb.to;
        tb.anim = true;
      }
    };
    bar.onpointerup = up;
    bar.onpointercancel = up;
    bar.onkeydown = (e) => {
      // teclado/acessibilidade: setas também levam a T-bar até a outra ponta (= AUTO)
      if (/^Arrow(Up|Down)$/.test(e.key)) {
        e.preventDefault();
        take('mix');
      }
    };
  }

  // T-bar voltou para perto da ponta de partida: desfaz a troca (nada foi ao ar)
  function revert() {
    comp.endMix();
    const back = S.pvw;
    const was = S.take;
    S.take = back;
    comp.take = back;
    comp.snap = true;
    comp.cutSeq++;
    S.pvw = was;
    preview?.set({ take: was });
    tb.pos = tb.rest;
    onAir(was);
    refresh();
    syncTally();
  }

  function setBlack(on) {
    S.ftb = !!on;
    comp.setBlack(S.ftb);
    $('#sw-ftb')?.classList.toggle('on', S.ftb);
    $('.studio')?.classList.toggle('sw-black', S.ftb);
  }

  // fonte removida (convidado saiu, câmera desligada): o programa volta para a Cena
  function sourceGone(id) {
    let changed = false;
    if (S.take === id) {
      S.take = null;
      comp.take = null;
      comp.transition('cut');
      changed = true;
    }
    if (S.pvw === id) {
      S.pvw = null;
      preview?.set({ take: null });
      changed = true;
    }
    if (changed) onAir(id);
    tallySent.delete(id.split(':')[0]);
    thumbs.delete(id);
    refresh();
  }

  function refresh() {
    if (!S.switcher) return;
    const list = busList();
    const bus = $('#sw-bus');
    if (!bus) return;
    const stage = new Set(S.stage);
    const k = JSON.stringify([list.map((s) => [s.id, s.label, s.camOff, s.remoteCam]), S.take, S.pvw, S.stage, S.solo, list.map((s) => [fxActive?.(s.id), isCohost?.(s.ownerId)])]);
    if (k !== busKey) {
      busKey = k;
      // fontes que aparecem na Cena acendem fraco quando a Cena está no ar/na prévia (tally do ATEM)
      const sceneAir = S.take === null;
      const scenePvw = S.pvw === null;
      const kindTag = (s) => (s.kind === 'screen' ? 'tela' : s.kind === 'media' ? 'vídeo' : s.kind === 'image' ? 'imagem' : s.remoteCam ? 'remota' : '');
      const card = (id, n, name, kind, src) => {
        const realId = id === SCENE ? null : id;
        const inScene = src && stage.has(id);
        const cls = [
          realId === S.take ? 'pgm' : '',
          realId === S.pvw ? 'pvw' : '',
          inScene && sceneAir && realId !== S.take ? 'pgm-soft' : '',
          inScene && scenePvw && realId !== S.pvw ? 'pvw-soft' : '',
          id === SCENE ? 'scene' : '',
        ].join(' ');
        const guestCam = src && src.kind === 'camera' && src.ownerId !== 'host' && !src.remoteCam && !src.ingest;
        const tools = src && src.kind === 'camera' && !src.ingest
          ? `<span class="sw-tools">${`<span class="sw-tool ${fxActive?.(id) ? 'on' : ''}" data-tool="fx" data-id="${esc(id)}" title="Efeitos de vídeo: fundo virtual e enquadramento automático">✦</span>`}${guestCam ? `<span class="sw-tool cohost ${isCohost?.(src.ownerId) ? 'on' : ''}" data-tool="cohost" data-id="${esc(src.ownerId)}" title="${isCohost?.(src.ownerId) ? 'Remover co-host' : 'Tornar co-host (pode editar a live)'}">${isCohost?.(src.ownerId) ? '★' : '☆'}</span>` : ''}</span>`
          : '';
        const actions = (src ? `<span class="sw-stg ${inScene ? 'on' : ''}" data-stage="${esc(id)}" title="${inScene ? 'Está no palco: clique para tirar' : 'Pôr no palco'}">${inScene ? 'Tirar do palco' : 'Pôr no palco'}</span>` : '') + tools;
        return `<button class="sw-card ${cls}" data-src="${esc(id)}" title="${esc(name)}${n ? ` (tecla ${n})` : ' (tecla 0)'}">
          <span class="sw-thumb"><canvas width="${THUMB_W}" height="${THUMB_H}"></canvas><b class="sw-num">${n || '0'}</b>${kind ? `<i class="sw-kind">${kind}</i>` : ''}${realId === S.take ? '<em class="sw-live">NO AR</em>' : ''}</span>
          <span class="sw-name">${esc(name)}</span>
          ${actions ? `<span class="sw-actions">${actions}</span>` : ''}
        </button>`;
      };
      bus.innerHTML =
        card(SCENE, 0, 'Cena (palco)', 'layout', null) +
        list.map((s, i) => card(s.id, i < 9 ? i + 1 : '', s.label || 'Fonte', kindTag(s), s)).join('') +
        `<button class="sw-card add" id="sw-add" title="Adicionar câmera: USB/captura deste computador ou celular pelo QR Code"><span class="sw-thumb"><span class="add-ico">＋</span></span><span class="sw-name">Câmera</span></button>`;
      thumbs.clear();
      for (const el of bus.querySelectorAll('[data-src]')) thumbs.set(el.dataset.src, el.querySelector('canvas'));
      thumbT = 0; // desenha as miniaturas novas já no próximo quadro
    }
    const nm = $('#sw-pvw-name');
    if (nm) nm.textContent = label(S.pvw);
    const pn = $('#sw-pgm-name');
    if (pn) pn.textContent = label(S.take);
    for (const b of document.querySelectorAll('#sw-ms [data-ms]')) b.classList.toggle('active', +b.dataset.ms === S.transMs);
  }

  // luz de "no ar"/"prévia" no celular das câmeras remotas (também funciona no modo Estúdio: no palco = no ar)
  function syncTally() {
    for (const g of S.guests.values()) {
      if (!g.cam) continue;
      const id = `${g.id}:cam`;
      const pgm = S.take ? S.take === id : S.stage.includes(id) && (!S.solo || S.solo === id);
      const pvw = S.switcher && !pgm && (S.pvw ? S.pvw === id : S.stage.includes(id));
      const v = pgm ? 'pgm' : pvw ? 'pvw' : '';
      if (tallySent.get(g.id) === v) continue;
      tallySent.set(g.id, v);
      sendControl(g.id, 'tally', { pgm, pvw });
    }
  }
  function guestReset(id) {
    tallySent.delete(id);
  }

  // miniatura: imagem crua da fonte (sem efeitos, que custam caro), cortada para 16:9
  function drawThumb(cv, s) {
    const x = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    x.fillStyle = '#0b0b12';
    x.fillRect(0, 0, W, H);
    const el = s?.el;
    const img = el instanceof HTMLImageElement;
    const vw = img ? el?.naturalWidth : el?.videoWidth;
    const vh = img ? el?.naturalHeight : el?.videoHeight;
    if (el && vw > 0 && (img || el.readyState >= 2) && !s.camOff) {
      const contain = s.kind !== 'camera';
      const sc = contain ? Math.min(W / vw, H / vh) : Math.max(W / vw, H / vh);
      x.drawImage(el, (W - vw * sc) / 2, (H - vh * sc) / 2, vw * sc, vh * sc);
    } else {
      x.fillStyle = '#7d7d92';
      x.font = '600 13px Inter, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(t(s?.camOff ? 'Câmera desligada' : 'Sem sinal'), W / 2, H / 2);
    }
  }

  function render() {
    if (!S.switcher) return;
    preview?.render();
    const now = performance.now();
    // T-bar: segue a mão, o AUTO ou fica parada na ponta
    const prog = comp.mixProgress(now);
    if (tb.anim && prog === null) tb.anim = false;
    const pos = tb.drag ? tb.pos : tb.anim ? tb.from + (tb.to - tb.from) * prog : tb.rest;
    const h = $('#sw-tbar-handle');
    if (h) {
      h.style.top = `${pos * 100}%`;
      const f = $('#sw-tbar-fill');
      const p = tb.drag || tb.anim ? Math.abs(pos - (tb.anim ? tb.from : tb.rest)) : 0;
      f.style.top = `${Math.min(pos, tb.anim ? tb.from : tb.rest) * 100}%`;
      f.style.height = `${p * 100}%`;
    }
    $('.studio')?.classList.toggle('sw-mixing', prog !== null);
    // miniaturas da barra de fontes
    if (now - thumbT < THUMB_GAP) return;
    thumbT = now;
    for (const [id, cv] of thumbs) {
      if (!cv) continue;
      if (id === SCENE) {
        sceneView.lastT = 0; // a miniatura já é limitada por THUMB_GAP
        sceneView.render();
        const x = cv.getContext('2d');
        x.drawImage(sceneView.view.canvas, 0, 0, cv.width, cv.height);
      } else drawThumb(cv, S.sources.get(id));
    }
  }

  return { mount, setMode, take, cutTo, setPreview, sourceGone, refresh, syncTally, guestReset, render, setBlack, toggle: () => setMode(!S.switcher) };
}
