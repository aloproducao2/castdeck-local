// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Módulo de jornalismo: gerador de GC (lower third) estilo telejornal, com etiqueta (AO VIVO...),
// logo da emissora/matéria e lista de nomes salvos. Os GCs salvos são banners com style 'news'.
import { drawBanner } from './overlays.js';

export const NEWS_TAGS = ['', 'AO VIVO', 'ENTREVISTA', 'REPÓRTER', 'ANALISTA', 'URGENTE', 'PLANTÃO', 'DIRETO DE'];
const POS = [['bl', 'Embaixo à esquerda'], ['bc', 'Embaixo no centro'], ['br', 'Embaixo à direita'], ['tl', 'Em cima à esquerda'], ['tc', 'Em cima no centro'], ['tr', 'Em cima à direita']];
const DUR = [[0, 'Manual'], [5, '5 s'], [8, '8 s'], [10, '10 s'], [15, '15 s'], [30, '30 s']];

// monta o objeto que o compositor desenha a partir de um GC salvo/rascunho
export const newsPayload = (g, brandLogo) => ({
  title: g.title,
  subtitle: g.subtitle,
  style: 'news',
  look: g.look === 'hard' ? 'hard' : 'classic',
  pos: g.pos,
  color: g.color || null,
  tag: g.tag || '',
  logo: g.logoMode === 'brand' ? brandLogo || null : g.logoMode === 'custom' ? g.logo || null : null,
  dur: g.dur,
});

export function createJournal({ S, h, esc, $, $$, toast, icons, saveStudio, toggleBanner, renderGcBar, readImage, pickFile, news }) {
  const blank = () => ({ id: null, style: 'news', look: 'classic', title: '', subtitle: '', tag: '', logoMode: S.brand.logo ? 'brand' : 'none', logo: null, pos: 'bl', dur: 0, color: null });
  let draft = blank();
  const imgs = new Map();
  const img = (u) => {
    if (!u) return null;
    let i = imgs.get(u);
    if (!i) {
      i = new Image();
      i.onload = () => drawPreview();
      i.src = u;
      imgs.set(u, i);
    }
    return i.complete && i.naturalWidth ? i : null;
  };

  // migra GCs salvos antes da correção (sem style)
  S.banners.forEach((b) => {
    if (b.logoMode !== undefined && b.style !== 'news') b.style = 'news';
  });
  const list = () => S.banners.filter((b) => b.style === 'news');
  const opts = (arr, v) => arr.map(([k, l]) => `<option value="${k}" ${k == v ? 'selected' : ''}>${l}</option>`).join('');

  function drawPreview() {
    const cv = $('#nj-preview');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width;
    const H = cv.height;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2b3350');
    g.addColorStop(1, '#10131f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.38, H * 0.2, 0, 7);
    ctx.fill();
    ctx.fillRect(W * 0.34, H * 0.56, W * 0.32, H * 0.5);
    const d = draft;
    const fake = { ctx, W, H, image: img, banner: { ...newsPayload({ ...d, title: d.title || (d.look === 'hard' ? 'Manchete da notícia' : 'Nome do entrevistado'), subtitle: d.subtitle || (d.look === 'hard' ? 'Linha de apoio com mais detalhes' : 'Cargo ou local') }, S.brand.logo), t0: -1e9 } };
    drawBanner(fake, S.brand.color ? hex(S.brand.color) : [124, 92, 255], performance.now(), 0);
  }
  const hex = (c) => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c || '');
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [124, 92, 255];
  };

  function render() {
    const p = $('#panel-journal');
    if (!p) return;
    const on = S.activeBanner === 'journal:live';
    const items = list();
    p.innerHTML = `
      <h4>Gerador de GC</h4>
      <div class="field"><span>Modelo</span><div class="seg" id="nj-look"><button class="btn sm ${draft.look !== 'hard' ? 'primary' : ''}" data-l="classic">Entrevistado / repórter</button><button class="btn sm ${draft.look === 'hard' ? 'primary' : ''}" data-l="hard">Hard news (manchete)</button></div></div>
      <canvas id="nj-preview" width="640" height="360" style="width:100%;border-radius:12px;border:1px solid var(--line);display:block;margin-bottom:10px"></canvas>
      <label class="field"><span>${draft.look === 'hard' ? 'Manchete' : 'Nome'}</span><input class="input" id="nj-title" maxlength="60" value="${esc(draft.title)}" placeholder="Ex.: Maria Silva"></label>
      <label class="field"><span>${draft.look === 'hard' ? 'Linha de apoio' : 'Cargo / local'}</span><input class="input" id="nj-sub" maxlength="90" value="${esc(draft.subtitle)}" placeholder="Ex.: Repórter - direto de Brasília"></label>
      <div class="row" style="gap:10px">
        <label class="field grow"><span>Etiqueta</span><select class="input" id="nj-tag">${NEWS_TAGS.map((t) => `<option value="${t}" ${t === draft.tag ? 'selected' : ''}>${t || 'Sem etiqueta'}</option>`).join('')}<option value="__c" ${draft.tag && !NEWS_TAGS.includes(draft.tag) ? 'selected' : ''}>Personalizada…</option></select></label>
        <label class="field grow"><span>Posição</span><select class="input" id="nj-pos">${opts(POS, draft.pos)}</select></label>
      </div>
      <label class="field" id="nj-ctag-w" ${draft.tag && !NEWS_TAGS.includes(draft.tag) ? '' : 'hidden'}><span>Texto da etiqueta</span><input class="input" id="nj-ctag" maxlength="18" value="${esc(NEWS_TAGS.includes(draft.tag) ? '' : draft.tag)}"></label>
      <div class="field"><span>Logo no GC</span>
        <div class="seg" id="nj-logomode">
          <button class="btn sm ${draft.logoMode === 'none' ? 'primary' : ''}" data-m="none">Sem logo</button>
          <button class="btn sm ${draft.logoMode === 'brand' ? 'primary' : ''}" data-m="brand" ${S.brand.logo ? '' : 'disabled title="Defina um logo na aba Marca"'}>Logo da marca</button>
          <button class="btn sm ${draft.logoMode === 'custom' ? 'primary' : ''}" data-m="custom">Outro logo…</button>
        </div>
        ${draft.logoMode === 'custom' && draft.logo ? `<img src="${draft.logo}" alt="" style="height:36px;margin-top:6px;background:#fff;border-radius:6px;padding:3px">` : ''}
      </div>
      <div class="row" style="gap:10px">
        <label class="field grow"><span>Tempo no ar</span><select class="input" id="nj-dur">${opts(DUR, draft.dur)}</select></label>
        <label class="field"><span>Cor</span><span class="row" style="gap:6px"><input type="color" id="nj-color" value="${draft.color || S.brand.color || '#7c5cff'}" style="width:40px;height:40px;border:none;background:none;padding:0;cursor:pointer"><label class="check" style="font-size:12px"><input type="checkbox" id="nj-usecolor" ${draft.color ? 'checked' : ''}> própria</label></span></label>
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <button class="btn primary grow" id="nj-air">${on ? '↻ Atualizar no ar' : '▶ Colocar no ar'}</button>
        <button class="btn danger" id="nj-off" ${on ? '' : 'disabled'}>✕ Tirar do ar</button>
      </div>
      <div class="row" style="gap:6px;margin-top:6px">
        <button class="btn grow" id="nj-save">${draft.id ? 'Salvar alterações' : `${icons.plus} Salvar na lista`}</button>
        ${draft.id ? '<button class="btn" id="nj-new">Novo</button>' : ''}
      </div>
      <h4>Lista de GCs <span class="hint" style="text-transform:none;letter-spacing:0">(${items.length}) — clique para mostrar/tirar</span></h4>
      <div id="nj-list">${
        items.length
          ? items
              .map(
                (g) => `<div class="banner-item ${S.activeBanner === g.id ? 'showing' : ''}" data-id="${g.id}">
              <div class="row" style="gap:6px"><strong class="grow">${esc(g.title)}</strong>${g.tag ? `<span class="pill">${esc(g.tag)}</span>` : ''}${S.activeBanner === g.id ? '<span class="pill live">NO AR</span>' : ''}</div>
              ${g.subtitle ? `<span>${esc(g.subtitle)}</span>` : ''}
              <div class="bn-acts"><button class="btn ghost sm icon" data-edit="${g.id}" title="Editar">✎</button><button class="btn ghost sm icon" data-dup="${g.id}" title="Duplicar">⧉</button><button class="btn ghost sm icon" data-del="${g.id}" title="Excluir">${icons.trash}</button></div></div>`,
              )
              .join('')
          : '<div class="empty">Nenhum GC salvo. Preencha acima e clique em Salvar na lista.</div>'
      }</div>`;
    bind(p);
    drawPreview();
  }

  function bind(p) {
    const sync = () => {
      draft.title = $('#nj-title', p).value;
      draft.subtitle = $('#nj-sub', p).value;
      draft.pos = $('#nj-pos', p).value;
      draft.dur = +$('#nj-dur', p).value;
      draft.color = $('#nj-usecolor', p).checked ? $('#nj-color', p).value : null;
      const t = $('#nj-tag', p).value;
      $('#nj-ctag-w', p).hidden = t !== '__c';
      draft.tag = t === '__c' ? $('#nj-ctag', p).value.trim().toUpperCase() : t;
      drawPreview();
    };
    $$('#nj-title,#nj-sub,#nj-pos,#nj-dur,#nj-color,#nj-usecolor,#nj-tag,#nj-ctag', p).forEach((el) => {
      el.oninput = sync;
      el.onchange = sync;
    });
    $$('#nj-look button', p).forEach(
      (b) =>
        (b.onclick = () => {
          sync();
          draft.look = b.dataset.l;
          if (draft.look === 'hard') {
            if (!draft.tag) draft.tag = 'URGENTE';
            if (draft.pos[1] !== undefined && draft.pos[0] === 'b') draft.pos = 'bc';
          }
          render();
        }),
    );
    $$('#nj-logomode button', p).forEach(
      (b) =>
        (b.onclick = async () => {
          sync();
          const m = b.dataset.m;
          if (m === 'custom') {
            const f = await pickFile('image/*');
            if (!f) return;
            try {
              draft.logo = await readImage(f, 400, 'image/png');
              draft.logoMode = 'custom';
            } catch (e) {
              return toast('Imagem inválida: ' + e.message, 'err');
            }
          } else draft.logoMode = m;
          render();
        }),
    );
    const data = () => {
      sync();
      if (!draft.title.trim()) {
        $('#nj-title', p).focus();
        toast('Digite o nome para o GC', 'err');
        return null;
      }
      return { ...draft, title: draft.title.trim(), subtitle: draft.subtitle.trim() };
    };
    $('#nj-air', p).onclick = () => {
      const d = data();
      if (!d) return;
      if (S.activeBanner) toggleBanner(S.activeBanner); // tira o atual antes (evita sobrepor)
      toggleBanner('journal:live', newsPayload(d, S.brand.logo));
      render();
    };
    $('#nj-off', p).onclick = () => {
      if (S.activeBanner) toggleBanner(S.activeBanner);
      render();
    };
    $('#nj-save', p).onclick = () => {
      const d = data();
      if (!d) return;
      const { id, ...rest } = { ...d, style: 'news' };
      if (id) Object.assign(S.banners.find((b) => b.id === id) || {}, rest);
      else {
        const nid = Math.random().toString(36).slice(2, 9);
        S.banners.push({ id: nid, ...rest });
        draft.id = nid;
      }
      saveStudio();
      toast('GC salvo na lista', 'ok');
      render();
      renderGcBar();
    };
    $('#nj-new', p)?.addEventListener('click', () => {
      draft = blank();
      render();
    });
    $$('.banner-item', p).forEach(
      (el) =>
        (el.onclick = (e) => {
          const id = el.dataset.id;
          const b = e.target.closest('button');
          const g = S.banners.find((x) => x.id === id);
          if (!g) return;
          if (b?.dataset.edit) {
            draft = { ...blank(), ...g, id: g.id };
            return render();
          }
          if (b?.dataset.dup) {
            S.banners.splice(S.banners.indexOf(g) + 1, 0, { ...g, id: Math.random().toString(36).slice(2, 9), title: g.title + ' (cópia)' });
            saveStudio();
            return render();
          }
          if (b?.dataset.del) {
            if (S.activeBanner === id) toggleBanner(id);
            S.banners = S.banners.filter((x) => x.id !== id);
            if (draft.id === id) draft = blank();
            saveStudio();
            render();
            return renderGcBar();
          }
          if (S.activeBanner && S.activeBanner !== id) toggleBanner(S.activeBanner);
          toggleBanner(id);
          render();
        }),
    );
  }

  return { render };
}
