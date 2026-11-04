// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Cenas rápidas (o "Scenes" do YoloBox): até 6 botões que guardam layout + quem está no palco + solo + GC/banner.
//  - Botão vazio: 1 clique salva a cena atual.
//  - Botão com cena: 1 clique (ou F1–F6) aplica. Clique direito / toque longo: salvar por cima, renomear, apagar.
//  - Modo Estúdio: aplica com um dissolve curto. Mesa de corte: se o programa mostra a Cena, aplica com o AUTO da mesa;
//    se está numa fonte em tela cheia, monta a Cena fora do ar e a deixa na PRÉVIA (CORTE/AUTO põe no ar).
// Ficam em S.brand.quickScenes (salvo junto com o estúdio). Convidados mudam de id a cada sessão, então cada item do
// palco guarda também nome e tipo: se o id sumiu, a cena usa a fonte de mesmo nome; se ninguém bate, ela é pulada.

const MAX = 6;
const LONG_MS = 550;

export function createScenes({ S, comp, $, esc, toast, modal, promptDialog, confirmDialog, saveStudio, setStage, setSolo, setLayout, toggleBanner, getSwitcher }) {
  const t = (s) => window.CDi18n?.t(s) ?? s;
  const list = () => (S.brand.quickScenes ||= []);

  function capture(name) {
    return {
      name,
      layout: S.layout,
      solo: S.solo || null,
      banner: S.activeBanner && S.banners.some((b) => b.id === S.activeBanner) ? S.activeBanner : null,
      stage: S.stage.map((id) => {
        const s = S.sources.get(id);
        return { id, label: s?.label || '', kind: s?.kind || '' };
      }),
    };
  }

  // id salvo -> id atual (mesmo id, senão mesma fonte por nome+tipo)
  function resolve(item, used) {
    if (S.sources.has(item.id) && !used.has(item.id)) return item.id;
    for (const s of S.sources.values()) if (!used.has(s.id) && s.label && s.label === item.label && s.kind === item.kind) return s.id;
    return null;
  }

  function apply(i, { cut = false } = {}) {
    const sc = list()[i];
    if (!sc) return;
    const used = new Set();
    const ids = [];
    for (const it of sc.stage || []) {
      const id = resolve(it, used);
      if (id) {
        used.add(id);
        ids.push(id);
      }
    }
    const missing = (sc.stage || []).length - ids.length;
    const soloItem = sc.solo ? (sc.stage || []).find((x) => x.id === sc.solo) : null;
    const sw = getSwitcher();
    const offAir = S.switcher && S.take !== null; // programa numa fonte em tela cheia: a Cena está fora do ar
    // dissolve a partir do quadro atual (o compositor congela o "de" e funde no novo palco)
    if (!offAir && !S.ftb) comp.transition('mix', S.switcher ? S.transMs : 300);
    if (S.layout !== sc.layout) setLayout(sc.layout);
    setStage(ids);
    const soloId = soloItem ? ids[(sc.stage || []).indexOf(soloItem)] || null : null;
    if ((S.solo || null) !== soloId) setSolo(soloId);
    if ((S.activeBanner || null) !== (sc.banner || null)) {
      if (S.activeBanner) toggleBanner(S.activeBanner);
      if (sc.banner && S.banners.some((b) => b.id === sc.banner)) toggleBanner(sc.banner);
    }
    if (offAir) {
      sw?.setPreview(null);
      if (cut) sw?.cutTo(null); // Shift+F1..F6: aplica a cena direto no PGM
      else toast(t('Cena na PRÉVIA: CORTE ou AUTO põe no ar (Shift+F1..F6 corta a cena).'), 'ok');
    }
    if (missing > 0) toast(`${sc.name}: ${missing} ${missing > 1 ? t('fontes não estão no estúdio agora') : t('fonte não está no estúdio agora')}`);
    flash(i);
  }

  async function save(i, ask = true) {
    const cur = list()[i];
    let name = cur?.name || `${t('Cena')} ${i + 1}`;
    if (ask) {
      name = await promptDialog(t('Nome da cena rápida'), name, { ok: t('Salvar'), maxLength: 24 });
      if (name == null) return;
      name = name.trim() || `${t('Cena')} ${i + 1}`;
    }
    const arr = list();
    arr[i] = capture(name);
    for (let k = 0; k < MAX; k++) arr[k] ??= null; // mantém as posições (F1..F6) mesmo com buracos
    saveStudio();
    render();
    flash(i);
    toast(`${t('Cena salva')}: ${name} (F${i + 1})`, 'ok');
  }

  async function menu(i) {
    const sc = list()[i];
    if (!sc) return save(i);
    const act = await new Promise((resolve) =>
      modal(
        `<h3>${esc(sc.name)} <small class="hint">F${i + 1}</small></h3>
        <p class="hint">${t('Guarda o layout, quem está no palco, o solo e o GC/banner.')}</p>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">
          <button class="btn primary" data-a="over">${t('Salvar a cena atual aqui')}</button>
          <button class="btn" data-a="rename">${t('Renomear')}</button>
          <button class="btn danger" data-a="del">${t('Apagar')}</button>
        </div>`,
        {
          onMount: (card, close) =>
            card.querySelectorAll('[data-a]').forEach((b) =>
              b.addEventListener('click', () => {
                close();
                resolve(b.dataset.a);
              }),
            ),
        },
      ).then(() => resolve(null)),
    );
    if (act === 'over') return save(i, false);
    if (act === 'rename') {
      const n = await promptDialog(t('Nome da cena rápida'), sc.name, { ok: t('Salvar'), maxLength: 24 });
      if (n == null) return;
      sc.name = n.trim() || sc.name;
    } else if (act === 'del') {
      if (!(await confirmDialog(`${t('Apagar a cena')} "${sc.name}"?`, { ok: t('Apagar'), danger: true }))) return;
      list()[i] = null;
    } else return;
    saveStudio();
    render();
  }

  function flash(i) {
    const b = $(`#qscenes [data-qs="${i}"]`);
    if (!b) return;
    b.classList.remove('flash');
    void b.offsetWidth;
    b.classList.add('flash');
  }

  // cena "ativa" = a que bate com o palco/layout de agora (acende o botão, como a cena selecionada no YoloBox)
  function activeIndex() {
    const now = capture('');
    const key = (c) => JSON.stringify([c.layout, c.solo, c.banner, c.stage.map((x) => x.id)]);
    const k = key(now);
    return list().findIndex((c) => c && key({ ...c, stage: (c.stage || []).map((x) => ({ id: resolve(x, new Set()) })) }) === k);
  }

  let lastKey = '';
  let collapsed = localStorage.getItem('castdeck.scenes.collapsed') === '1';

  function render(force = true) {
    const box = $('#qscenes');
    if (!box) return;
    const arr = list();
    const act = activeIndex();
    const k = JSON.stringify([arr, act, collapsed]);
    if (!force && k === lastKey) return;
    lastKey = k;
    box.classList.toggle('collapsed', collapsed);
    let html = `<button class="qs-lbl qs-toggle" id="qs-toggle" type="button" aria-expanded="${!collapsed}" title="${collapsed ? t('Expandir barra de cenas (F1–F6)') : t('Recolher barra de cenas (economiza espaço)')}"><span class="qs-chev">${collapsed ? '▸' : '▾'}</span> <span>${t('Cenas')}</span>${collapsed && act >= 0 && arr[act] ? ` <b class="qs-active-tag">F${act + 1}: ${esc(arr[act].name)}</b>` : collapsed ? ` <span class="qs-hint-tag">F1–F6</span>` : ''}</button>`;
    if (!collapsed) {
      for (let i = 0; i < MAX; i++) {
        const sc = arr[i];
        html += sc
          ? `<button class="qs ${i === act ? 'on' : ''}" data-qs="${i}" title="${esc(sc.name)} (F${i + 1}). ${t('Clique direito ou toque longo: salvar por cima, renomear, apagar')}"><b>F${i + 1}</b><span translate="no">${esc(sc.name)}</span></button>`
          : `<button class="qs empty" data-qs="${i}" title="${t('Salvar a cena atual neste botão')} (F${i + 1})"><b>F${i + 1}</b><span>＋ ${t('Salvar')}</span></button>`;
      }
    }
    box.innerHTML = html;
  }

  function mount() {
    const box = $('#qscenes');
    if (!box) return;
    let pressT = 0;
    let longFired = false;
    box.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-qs]');
      if (!b || e.button === 2) return;
      longFired = false;
      clearTimeout(pressT);
      pressT = setTimeout(() => {
        longFired = true;
        menu(+b.dataset.qs);
      }, LONG_MS);
    });
    const cancel = () => clearTimeout(pressT);
    box.addEventListener('pointerup', cancel);
    box.addEventListener('pointerleave', cancel);
    box.addEventListener('pointercancel', cancel);
    box.addEventListener('click', (e) => {
      const toggle = e.target.closest('#qs-toggle');
      if (toggle) {
        collapsed = !collapsed;
        localStorage.setItem('castdeck.scenes.collapsed', collapsed ? '1' : '0');
        render(true);
        return;
      }
      const b = e.target.closest('[data-qs]');
      if (!b || longFired) return;
      const i = +b.dataset.qs;
      if (list()[i]) apply(i);
      else save(i);
    });
    box.addEventListener('contextmenu', (e) => {
      const b = e.target.closest('[data-qs]');
      if (!b) return;
      e.preventDefault();
      clearTimeout(pressT);
      menu(+b.dataset.qs);
    });
    window.addEventListener('keydown', (e) => {
      const m = /^F([1-6])$/.exec(e.key);
      if (!m || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.target?.closest?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('.modal-back')) return;
      const i = +m[1] - 1;
      if (!list()[i]) return;
      e.preventDefault(); // F5 não recarrega a página no meio da live quando há cena nesse botão
      apply(i, { cut: e.shiftKey });
    });
    render();
  }

  return { mount, render: () => render(false), apply, save, capture, active: () => activeIndex() };
}
