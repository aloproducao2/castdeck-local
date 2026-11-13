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
import { PreviewView, drawFramed } from './compositor.js';
import { icons } from '../ui.js';

const SCENE = '__scene__';
const KEY = 'castdeck.switcher';
const MS_OPTS = [300, 500, 1000];
const BUS_KINDS = new Set(['camera', 'screen', 'media', 'image', 'uvc']);

export function createSwitcher({ S, comp, $, esc, toast, sendControl, onAir, onPreview, toggleStage, addCamera, onMode, openFx, fxActive, toggleCohost, isCohost }) {
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
  let fadeWas = false; // para reabilitar CUT/AUTO quando a transição termina
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
    const bg = S.brand?.background;
    const bgVideo = bg?.type === 'video' ? bg.value : '';
    // mesma ordem dos bastidores (S.bsOrder, a que o usuário arrasta); fontes novas sem posição vão ao fim pela ordem antiga
    const pos = (s) => { const i = (S.bsOrder || []).indexOf(s.id); return i < 0 ? Infinity : i; };
    return [...S.sources.values()].filter((s) => BUS_KINDS.has(s.kind) && s.id !== bgVideo).sort((a, b) => pos(a) - pos(b) || rank(a) - rank(b));
  }
  const label = (id) => {
    if (id) return S.sources.get(id)?.label || 'Fonte';
    const solo = S.solo ? S.sources.get(S.solo)?.label : '';
    return solo ? `Cena (solo: ${solo})` : 'Cena (palco)';
  };
  const programFps = () => Math.max(1, Number(S.system?.presets?.[S.preset]?.fps) || 30);

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
    // A lista de fontes é o backstage agrupado. Não existe uma segunda barra de miniaturas.
    $('#switcher').innerHTML = `
      <div class="sw-bus-head">
        <strong>Fontes</strong>
        <span class="sw-help" title="Atalhos: Shift+número = corte direto · Espaço corta · T dissolve · Shift+F tela cheia">Clique na miniatura = prévia · duplo clique = corte direto · botão direito = ações</span>
        <span class="sw-help-touch">Toque = prévia · toque duplo = corte direto</span>
        <span class="sw-legend"><i class="lg pgm"></i>No ar <i class="lg pvw"></i>Prévia</span>
        <button class="btn sm ghost" id="sw-scene" type="button" title="Cena: prévia do palco/layout; duplo clique corta para a Cena">Cena</button>
        <button class="btn sm ghost icon sw-fs" data-fs="wall" data-label="Tela cheia" title="Mesa inteira em tela cheia (Shift+F)" data-tip="Mesa inteira em tela cheia (Shift+F)" aria-label="Tela cheia">${icons.expand}</button>
      </div>`;
    preview = new PreviewView(comp, $('#sw-pvw-canvas'), { fps: programFps() });
    // e.detail > 0 = clique/ponteiro; teclado mantém o foco para a ativação nativa.
    $('#sw-scene').onclick = () => setPreview(null);
    $('#sw-scene').ondblclick = () => cutTo(null);
    $('#sw-cut').onclick = (e) => { take('cut'); if (e.detail) e.currentTarget.blur(); };
    $('#sw-auto').onclick = (e) => { take('mix'); if (e.detail) e.currentTarget.blur(); };
    $('#sw-ftb').onclick = () => setBlack(!S.ftb);
    $('#sw-ms').onclick = (e) => {
      const b = e.target.closest('[data-ms]');
      if (!b) return;
      S.transMs = +b.dataset.ms;
      save();
      refresh();
    };
    bindTbar();

    window.addEventListener('keydown', onKey);
    setMode(S.switcher, { silent: true });
  }

  function onKey(e) {
    if (!S.switcher || tb.drag || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.repeat) return; // segurar Espaço/Enter/T não pode alternar o PGM repetidamente
    const el = e.target;
    if (el?.closest?.('input, textarea, select, [contenteditable="true"], .modal-back')) return;
    // Deixa botões/links receberem Espaço/Enter nativos (AUTO, cartões, Adicionar câmera).
    // Os cliques de mouse dão blur nesses controles para os atalhos globais continuarem valendo.
    if (el?.closest?.('button, a, [role="button"], [role="link"]')) return;
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
      tb.pos = tb.rest;
      if (S.ftb) setBlack(false);
      onAir(prev);
      if (prev && !silent) {
        toast(`Mesa desligada: "${label(prev)}" saiu do ar; o PGM voltou para a ${label(null)}.`, 'ok');
      }
    } else {
      S.pvw = S.pvw ?? busList().find((s) => s.id !== S.take && s.kind === 'camera')?.id ?? null;
      preview.set({ take: S.pvw });
      if (!silent) toast('Mesa de corte ligada: escolha a prévia e corte com Espaço (ou T para dissolver).', 'ok');
    }
    onMode?.(S.switcher);
    refresh();
    syncTally();
  }

  function setPreview(id) {
    if (id && !S.sources.has(id)) return;
    S.pvw = id;
    preview?.set({ take: id });
    refresh();
    onPreview?.();
    syncTally();
  }

  function setPreviewFps(fps) {
    preview?.setFps(fps);
  }

  // Nenhuma troca nova enquanto qualquer transição (AUTO ou T-bar) estiver em andamento.
  // Antes só o fade manual era bloqueado; um segundo AUTO/CUT reiniciava a mistura e podia
  // devolver o PGM para a Cena.
  const canTake = () => S.switcher && !comp.fade && S.pvw !== S.take && (!S.pvw || S.sources.has(S.pvw));

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
        // Já existe uma transição manual parada no meio: continua dela, sem trocar PGM/prévia de novo.
        if (comp.fade?.manual) {
          tb.started = true;
          comp.setMix(p);
          return;
        }
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
      // Soltou no meio: o T-bar FICA onde o operador deixou, como numa mesa física.
      // A transição manual continua parada nessa posição; o próximo arrasto retoma dali.
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
    refresh();
  }

  function refresh() {
    if (!S.switcher) return;
    const nm = $('#sw-pvw-name');
    if (nm) nm.textContent = label(S.pvw);
    const pn = $('#sw-pgm-name');
    if (pn) pn.textContent = label(S.take);
    for (const b of document.querySelectorAll('#sw-ms [data-ms]')) b.classList.toggle('active', +b.dataset.ms === S.transMs);
    const ready = canTake();
    const cut = $('#sw-cut');
    const auto = $('#sw-auto');
    if (cut) {
      cut.disabled = !ready;
      cut.title = ready ? 'Corte seco: a prévia entra no ar na hora (Espaço ou Enter)' : 'Corte indisponível durante a transição ou sem prévia diferente';
    }
    if (auto) {
      auto.disabled = !ready;
      auto.title = ready ? 'Transição suave (dissolve) da prévia para o ar (T)' : 'AUTO indisponível durante a transição ou sem prévia diferente';
    }
    const scene = $('#sw-scene');
    if (scene) scene.classList.toggle('active', S.pvw === null);
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

  function render() {
    if (!S.switcher) return;
    // canTake() fica false durante toda transição; quando ela termina (AUTO ou T-bar),
    // é preciso atualizar os botões, senão CUT/AUTO continuam desabilitados.
    const fadeNow = !!comp.fade;
    if (fadeNow !== fadeWas) {
      fadeWas = fadeNow;
      refresh();
    }
    preview?.render();
    const now = performance.now();
    // T-bar: segue a mão, o AUTO ou fica parada na ponta
    const prog = comp.mixProgress(now);
    if (tb.anim && prog === null) {
      tb.anim = false;
      tb.pos = tb.rest; // AUTO terminou: a alavanca fica na nova ponta
    }
    const base = tb.anim ? tb.from : tb.rest;
    const pos = tb.drag ? tb.pos : tb.anim ? tb.from + (tb.to - tb.from) * prog : tb.pos;
    const h = $('#sw-tbar-handle');
    if (h) {
      h.style.top = `${pos * 100}%`;
      h.setAttribute('aria-valuenow', String(Math.round(pos * 100)));
      h.setAttribute('aria-valuetext', `${Math.round(pos * 100)}%`);
      const f = $('#sw-tbar-fill');
      const p = Math.abs(pos - base);
      f.style.top = `${Math.min(pos, base) * 100}%`;
      f.style.height = `${p * 100}%`;
    }
    $('.studio')?.classList.toggle('sw-mixing', prog !== null);
  }

  return { mount, setMode, take, cutTo, setPreview, setPreviewFps, sourceGone, refresh, syncTally, guestReset, render, setBlack, toggle: () => setMode(!S.switcher) };
}
