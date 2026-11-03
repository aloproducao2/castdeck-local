// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Notícias (RSS / Atom / XML) no letreiro: vários feeds cadastrados, atualização periódica e rolagem contínua.
// Os feeds ficam em S.brand.rssFeeds e são salvos junto com a marca do estúdio.
import { $, $$, esc, icons, toast, api } from '../ui.js';

const SEP = '      •      ';
const PRESETS = [
  ['G1', 'https://g1.globo.com/rss/g1/'],
  ['BBC Brasil', 'https://feeds.bbci.co.uk/portuguese/rss.xml'],
  ['UOL', 'https://rss.uol.com.br/feed/noticias.xml'],
];

export function createNews({ S, comp, save, onHeadline }) {
  const cache = new Map(); // feedId -> { items, at, error, title }
  let timer = null;

  const feeds = () => (S.brand.rssFeeds ||= []);
  const uid = () => Math.random().toString(36).slice(2, 9);
  const hostOf = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return u;
    }
  };

  // Monta o texto do letreiro: texto manual (se ligado) + manchetes dos feeds ligados.
  function apply() {
    const manual = S.brand.tickerOn && S.brand.tickerText ? S.brand.tickerText : '';
    const on = feeds().filter((f) => f.on);
    const multi = on.length > 1;
    const news = [];
    for (const f of on) {
      const items = cache.get(f.id)?.items || [];
      for (const it of items.slice(0, f.count || 10)) news.push(multi ? `${f.name} ▸ ${it.title}` : it.title);
    }
    const text = [manual, ...news].filter(Boolean).join(SEP);
    S.tickerOn = !!text;
    const label = !manual && news.length && S.brand.rssLabel !== false ? (on.length === 1 ? on[0].name : 'Notícias') : '';
    comp.setTicker(text || null, { label, speed: S.brand.tickerSpeed || 0.09 });
  }

  async function refresh(f, force = false) {
    const c = cache.get(f.id);
    if (!force && c && Date.now() - c.at < 30_000) return c;
    try {
      const d = await api(`/rss?u=${encodeURIComponent(f.url)}`);
      const entry = { items: d.items || [], at: Date.now(), title: d.title, error: null };
      if (!entry.items.length) entry.error = 'o feed não tem manchetes';
      cache.set(f.id, entry);
    } catch (e) {
      const prev = cache.get(f.id);
      cache.set(f.id, { items: prev?.items || [], at: Date.now(), title: prev?.title, error: e.message });
    }
    return cache.get(f.id);
  }

  // manchete mais recente dos feeds ligados (para o preenchimento automático de GC)
  function latestHeadline() {
    for (const f of feeds()) {
      if (!f.on) continue;
      const it = cache.get(f.id)?.items?.[0];
      if (it?.title) return it.title;
    }
    return '';
  }

  async function refreshAll(force = false) {
    await Promise.all(feeds().filter((f) => f.on).map((f) => refresh(f, force)));
    apply();
    onHeadline?.(latestHeadline());
    if (S.tab === 'journal') paintStatus();
  }

  function schedule() {
    clearInterval(timer);
    timer = setInterval(() => {
      const every = (S.brand.rssRefresh || 10) * 60_000;
      const due = feeds().some((f) => f.on && Date.now() - (cache.get(f.id)?.at || 0) >= every);
      if (due) refreshAll(true);
    }, 30_000);
  }

  const fmtAge = (at) => new Date(at).toLocaleTimeString(window.CD_LOCALE || 'pt-BR', { hour: '2-digit', minute: '2-digit' });
  function statusOf(f) {
    const c = cache.get(f.id);
    if (!c) return f.on ? '<span class="hint">carregando…</span>' : '<span class="hint">desligado</span>';
    if (c.error) return `<span class="hint" style="color:hsl(354 90% 72%)">${esc(c.error)}${c.items.length ? ` — usando ${c.items.length} manchetes antigas` : ''}</span>`;
    return `<span class="hint">${c.items.length} manchetes · atualizado ${fmtAge(c.at)}</span>`;
  }
  function paintStatus() {
    for (const f of feeds()) {
      const el = document.querySelector(`.rss-item[data-id="${f.id}"] .rss-status`);
      if (el) el.innerHTML = statusOf(f);
    }
  }

  function html() {
    const list = feeds();
    return `
    <h4>Notícias RSS no letreiro</h4>
    <p class="hint" style="margin:0 0 10px">Cadastre feeds de notícias (ou a página do site). As manchetes rolam no letreiro inferior; ligue um ou vários.</p>
    <div id="rss-list">${
      list.length
        ? list
            .map(
              (f) => `<div class="rss-item" data-id="${f.id}" style="cursor:default">
        <div class="row" style="gap:6px">
          <input class="input rss-name grow" maxlength="40" value="${esc(f.name)}" title="Nome exibido">
          <label class="switch" title="Mostrar no ar"><input type="checkbox" class="rss-on" ${f.on ? 'checked' : ''}><span></span></label>
          <button class="btn ghost sm icon rss-ref" title="Atualizar agora">↻</button>
          <button class="btn ghost sm icon rss-del" title="Excluir">${icons.trash}</button>
        </div>
        <div class="hint" style="word-break:break-all;margin-top:4px">${esc(f.url)}</div>
        <div class="row" style="gap:8px;margin-top:4px">
          <span class="rss-status grow">${statusOf(f)}</span>
          <select class="input rss-count" style="width:auto;height:30px" title="Manchetes por feed">${[5, 10, 15, 20, 30].map((n) => `<option value="${n}" ${(f.count || 10) === n ? 'selected' : ''}>${n} manchetes</option>`).join('')}</select>
        </div>
      </div>`,
            )
            .join('')
        : '<div class="empty">Nenhum feed cadastrado.</div>'
    }</div>
    <label class="field"><span>Endereço do feed ou do site</span><input class="input" id="rss-url" placeholder="https://site.com/rss.xml" autocomplete="off"></label>
    <div class="row" style="gap:6px;flex-wrap:wrap;margin:-4px 0 8px">${PRESETS.map(([n, u]) => `<button class="btn ghost sm" data-preset="${esc(u)}" data-pname="${esc(n)}">${esc(n)}</button>`).join('')}</div>
    <div class="row" style="gap:8px"><input class="input grow" id="rss-name" maxlength="40" placeholder="Nome (opcional)"><button class="btn primary" id="rss-add">${icons.plus} Adicionar feed</button></div>
    <div class="hint" id="rss-msg" style="min-height:18px;margin-top:6px"></div>
    <div class="mixer-row"><span class="nm">Velocidade</span><input type="range" id="rss-speed" min="3" max="20" value="${Math.round((S.brand.tickerSpeed || 0.09) * 100)}"></div>
    <label class="mixer-row"><span class="nm">Atualizar a cada</span><select class="input" id="rss-every">${[5, 10, 30, 60].map((n) => `<option value="${n}" ${(S.brand.rssRefresh || 10) === n ? 'selected' : ''}>${n} min</option>`).join('')}</select></label>
    <label class="check" style="justify-content:space-between;margin-top:6px"><span>Mostrar selo com o nome da fonte</span><span class="switch"><input type="checkbox" id="rss-label" ${S.brand.rssLabel !== false ? 'checked' : ''}><span></span></span></label>`;
  }

  function bind(p, rerender) {
    const changed = () => {
      save();
      apply();
    };
    $$('.rss-item', p).forEach((row) => {
      const f = feeds().find((x) => x.id === row.dataset.id);
      if (!f) return;
      $('.rss-name', row).onchange = (e) => {
        f.name = e.target.value.trim().slice(0, 40) || hostOf(f.url);
        changed();
      };
      $('.rss-on', row).onchange = async (e) => {
        f.on = e.target.checked;
        if (f.on) await refresh(f, true);
        changed();
        paintStatus();
      };
      $('.rss-count', row).onchange = (e) => {
        f.count = +e.target.value;
        changed();
      };
      $('.rss-ref', row).onclick = async () => {
        $('.rss-status', row).innerHTML = '<span class="hint">atualizando…</span>';
        await refresh(f, true);
        apply();
        paintStatus();
      };
      $('.rss-del', row).onclick = () => {
        S.brand.rssFeeds = feeds().filter((x) => x.id !== f.id);
        cache.delete(f.id);
        changed();
        rerender();
      };
    });
    $$('[data-preset]', p).forEach((b) => (b.onclick = () => {
      $('#rss-url', p).value = b.dataset.preset;
      $('#rss-name', p).value = b.dataset.pname;
    }));
    const msg = (t, err) => {
      const m = $('#rss-msg', p);
      m.textContent = t;
      m.style.color = err ? 'hsl(354 90% 72%)' : '';
    };
    const add = async () => {
      let url = $('#rss-url', p).value.trim();
      if (!url) return $('#rss-url', p).focus();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      if (feeds().some((f) => f.url === url)) return msg('Esse feed já está cadastrado.', true);
      msg('Verificando o feed…');
      $('#rss-add', p).disabled = true;
      try {
        const d = await api(`/rss?u=${encodeURIComponent(url)}`);
        const f = { id: uid(), name: $('#rss-name', p).value.trim() || d.title?.slice(0, 40) || hostOf(url), url: d.url || url, on: true, count: 10 };
        feeds().push(f);
        cache.set(f.id, { items: d.items, at: Date.now(), title: d.title, error: d.items.length ? null : 'o feed não tem manchetes' });
        changed();
        rerender();
        toast(`Feed “${f.name}” adicionado (${d.items.length} manchetes)`, 'ok');
      } catch (e) {
        msg('Não foi possível ler o feed: ' + e.message, true);
        $('#rss-add', p).disabled = false;
      }
    };
    $('#rss-add', p).onclick = add;
    $('#rss-url', p).onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    };
    $('#rss-speed', p).oninput = (e) => {
      S.brand.tickerSpeed = +e.target.value / 100;
      changed();
    };
    $('#rss-every', p).onchange = (e) => {
      S.brand.rssRefresh = +e.target.value;
      save();
    };
    $('#rss-label', p).onchange = (e) => {
      S.brand.rssLabel = e.target.checked;
      changed();
    };
  }

  return { html, bind, apply, refreshAll, schedule, cache, latestHeadline };
}
