// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Aba Widgets: enquetes (votação pelo chat e pelo celular via QR Code) e códigos QR no ar.
import { renderQr, normalizeUrl, qrValid } from './widgets-draw.js';

const POS = [
  ['bl', 'Embaixo à esquerda'],
  ['br', 'Embaixo à direita'],
  ['tl', 'Em cima à esquerda'],
  ['tr', 'Em cima à direita'],
  ['ml', 'Meio à esquerda'],
  ['mr', 'Meio à direita'],
];
const uid = () => Math.random().toString(36).slice(2, 9);
const posOpts = (v) => POS.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');

// "1", "2", "a", "b", "voto 2", "#3" → índice da opção
export function parseVote(text, n) {
  const t = String(text || '').trim().toLowerCase().replace(/[\s.!)]+$/g, '');
  const m = /^(?:voto\s*)?[#!]?([1-9]|[a-f])$/.exec(t);
  if (!m) return -1;
  const idx = /\d/.test(m[1]) ? +m[1] - 1 : m[1].charCodeAt(0) - 97;
  return idx >= 0 && idx < n ? idx : -1;
}

import { confirmDialog } from '../ui.js';

export function createWidgets({ S, comp, $, $$, esc, h, toast, icons, modal, saveStudio, readImage, pickFile, api, studioId, copyText, onAir = () => {} }) {
  const polls = () => (S.brand.polls ||= []);
  const qrs = () => (S.brand.qrs ||= []);
  const decos = () => (S.brand.qrDecos ||= []);
  const voters = new Map(); // pollId -> Set(chave do votante)
  let airQr = null;
  let airPoll = null;
  let saveT;

  // enquetes que estavam abertas numa sessão anterior ficam encerradas
  polls().forEach((p) => {
    if (p.state === 'open') p.state = 'closed';
    delete p.endsAt;
  });

  // tempo limite: encerra sozinha e atualiza a contagem no painel
  setInterval(() => {
    const p = polls().find((x) => x.state === 'open' && x.endsAt);
    if (!p) return;
    const left = Math.max(0, Math.ceil((p.endsAt - Date.now()) / 1000));
    const el = document.querySelector(`.wg-item[data-id="${p.id}"] [data-left]`);
    if (el) el.textContent = fmtLeft(left);
    if (left <= 0) {
      closePoll(p);
      toast('Tempo da enquete esgotado — votação encerrada', 'ok');
      paintPolls();
    }
  }, 500);

  const lazySave = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => saveStudio(), 1500);
  };
  const brandColor = () => comp.brand?.color || S.brand.color || '#7c5cff';
  const total = (p) => p.options.reduce((a, o) => a + (o.votes || 0), 0);

  // ---------------- enquetes ----------------
  const webOn = (p) => p.web !== false;
  function showPoll(p) {
    comp.wg.show(
      'poll',
      'poll',
      () => {
        const x = polls().find((y) => y.id === p.id);
        return x && { ...x, voteUrl: webOn(x) && x.state === 'open' ? voteUrl() : '' };
      },
      p.pos || 'bl',
    );
    airPoll = p.id;
    onAir();
  }
  function hidePoll() {
    comp.wg.hide('poll');
    airPoll = null;
    onAir();
  }
  function startPoll(p) {
    polls().forEach((o) => o !== p && o.state === 'open' && (o.state = 'closed'));
    p.state = 'open';
    if (p.duration > 0) p.endsAt = Date.now() + p.duration * 1000;
    else delete p.endsAt;
    if (!voters.has(p.id)) voters.set(p.id, new Set());
    showPoll(p);
    saveStudio();
    refreshBase(true);
    toast(webOn(p) ? 'Enquete no ar — o público vota pelo QR Code ou digitando o número no chat' : 'Enquete no ar — o público vota digitando o número da opção no chat', 'ok');
  }
  function closePoll(p) {
    p.state = 'closed';
    delete p.endsAt;
    saveStudio();
    onAir();
  }
  function resetPoll(p) {
    p.options.forEach((o) => (o.votes = 0));
    p.state = 'ready';
    delete p.endsAt;
    p.round = (p.round || 0) + 1; // nova rodada: a página de votação libera todo mundo de novo
    voters.delete(p.id);
    if (airPoll === p.id) hidePoll();
    saveStudio();
  }
  function deletePoll(p) {
    if (airPoll === p.id) hidePoll();
    S.brand.polls = polls().filter((x) => x.id !== p.id);
    voters.delete(p.id);
    saveStudio();
    onAir();
  }

  // soma um voto (chat ou celular), um por pessoa
  function addVote(p, key, idx) {
    if (!p || p.state !== 'open' || idx < 0 || idx >= p.options.length) return false;
    let set = voters.get(p.id);
    if (!set) voters.set(p.id, (set = new Set()));
    const k = String(key || '').toLowerCase();
    if (!k || set.has(k)) return false;
    set.add(k);
    p.options[idx].votes = (p.options[idx].votes || 0) + 1;
    return true;
  }

  // chamado por cada mensagem de chat (estúdio ou redes). Retorna true se virou voto.
  function onChatMessage({ key, text }) {
    const p = polls().find((x) => x.state === 'open');
    if (!p) return false;
    const idx = parseVote(text, p.options.length);
    if (idx < 0 || !addVote(p, key, idx)) return false;
    paintPolls();
    lazySave();
    return true;
  }

  // ---------------- votação pelo celular (QR Code → /vote/<estúdio>) ----------------
  let voteBase = '';
  let voteLocalOnly = false; // sem túnel: o link só abre na mesma rede Wi-Fi
  let baseAt = 0;
  let synced = false;
  let syncing = false;
  const voteUrl = () => (voteBase && studioId ? `${voteBase}/vote/${encodeURIComponent(studioId)}` : '');
  async function refreshBase(force) {
    if (!api || (!force && Date.now() - baseAt < 15000)) return;
    baseAt = Date.now();
    try {
      const sys = await api('/system');
      const t = sys.tunnel?.url || '';
      const base = t || sys.lan?.[0]?.url || '';
      const local = !t;
      if (base !== voteBase || local !== voteLocalOnly) {
        voteBase = base;
        voteLocalOnly = local;
        paintPolls();
      }
    } catch {}
  }
  // enquete que o público deve ver na página: a aberta ou a que está no ar (resultado)
  const livePoll = () => polls().find((x) => x.state === 'open' && webOn(x)) || polls().find((x) => x.id === airPoll && webOn(x)) || null;
  setInterval(async () => {
    if (!api || !studioId || syncing) return;
    const p = livePoll();
    if (!p && !synced) return;
    syncing = true;
    if (p) refreshBase();
    try {
      const snap = p && { id: p.id, round: p.round || 0, question: p.question, options: p.options.map((o) => ({ text: o.text, votes: o.votes || 0 })), state: p.state, endsAt: p.endsAt || 0 };
      const r = await api(`/studios/${encodeURIComponent(studioId)}/poll`, { method: 'POST', body: { poll: snap } });
      synced = !!p;
      let n = 0;
      for (const v of r?.votes || []) if (addVote(p, v.key, +v.opt)) n++;
      if (n) {
        paintPolls();
        lazySave();
      }
    } catch {
    } finally {
      syncing = false;
    }
  }, 1000);
  if (polls().length) refreshBase(true);

  async function openVoteLink(p) {
    await refreshBase(true);
    const url = voteUrl();
    await modal(
      `<h3>Votar pelo celular</h3>
       <p class="sub">Enquanto a enquete estiver aberta, o QR Code aparece junto dela no vídeo. Você também pode mandar este link no chat ou nas redes.</p>
       ${voteLocalOnly ? '<div class="status-banner" style="margin-bottom:12px">O túnel público está desligado: este link só funciona para quem está na mesma rede Wi-Fi (e mostra aviso de certificado). Ligue o túnel em Painel → Conexão para o público votar de qualquer lugar.</div>' : ''}
       <div class="qm-preview"><canvas id="vl-cv" width="300" height="300"></canvas></div>
       <div class="list-item card" style="box-shadow:none;padding:10px 14px"><div class="meta" style="min-width:0"><strong>${esc(p.question)}</strong><span style="overflow-wrap:anywhere">${esc(url || 'Link indisponível')}</span></div>
         <button class="btn sm primary" id="vl-copy" ${url ? '' : 'disabled'}>${icons.copy || ''} Copiar</button></div>
       <div class="modal-actions"><button class="btn primary" data-close>Pronto</button></div>`,
      {
        onMount: (m) => {
          if (url) drawQrTo($('#vl-cv', m), { url, useBrand: true }, 290);
          $('#vl-copy', m).onclick = () => copyText?.(url);
        },
      },
    );
  }

  // ---------------- QR ----------------
  function showQr(q) {
    comp.wg.show('qr', 'qr', () => qrs().find((x) => x.id === q.id), q.pos || 'br');
    airQr = q.id;
    onAir();
  }
  function hideQr() {
    comp.wg.hide('qr');
    airQr = null;
    onAir();
  }

  function drawQrTo(cv, item, max) {
    const g = cv.getContext('2d');
    const src = renderQr(item, (u) => comp.image(u), brandColor());
    g.clearRect(0, 0, cv.width, cv.height);
    if (!src) {
      g.strokeStyle = 'rgba(255,255,255,.25)';
      g.setLineDash([6, 6]);
      g.strokeRect(8, 8, cv.width - 16, cv.height - 16);
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.font = '600 13px Inter, sans-serif';
      g.textAlign = 'center';
      g.fillText('Digite um link', cv.width / 2, cv.height / 2);
      return;
    }
    const sc = Math.min(max / src.width, max / src.height);
    g.drawImage(src, (cv.width - src.width * sc) / 2, (cv.height - src.height * sc) / 2, src.width * sc, src.height * sc);
  }

  async function openQrModal(existing) {
    const item = existing ? { ...existing } : { id: uid(), title: '', url: '', showTitle: false, deco: '', color: '#7c5cff', useBrand: !!S.brand.color, pos: 'br' };
    if (!existing && S.brand.logo) item.deco = '';
    const res = await modal(
      `<h3>${existing ? 'Editar código QR' : 'Novo código QR'}</h3>
       <div class="qm-preview"><canvas id="qm-cv" width="320" height="340"></canvas></div>
       <div class="field"><span>Informações</span>
         <input class="input" id="qm-title" maxlength="40" placeholder="Título (ex.: Siga o canal)" value="${esc(item.title)}">
         <input class="input" id="qm-url" maxlength="200" placeholder="https://www.example.com" value="${esc(item.url)}" inputmode="url" autocomplete="off" style="margin-top:8px">
         <div class="hint" id="qm-err" style="min-height:16px;margin-top:4px"></div></div>
       <label class="check qm-sw"><span>Mostrar título abaixo do QR</span><span class="switch"><input type="checkbox" id="qm-show" ${item.showTitle ? 'checked' : ''}><span></span></span></label>
       <div class="field"><span>Decoração (logo no centro)</span><div class="qm-decos" id="qm-decos"></div></div>
       <div class="field"><span>Cor</span>
         <div class="row" style="gap:8px"><input type="color" id="qm-color" class="qm-color" value="${item.color || '#7c5cff'}"><div class="qm-hex"><i>#</i><input class="input" id="qm-hex" maxlength="6" value="${(item.color || '#7c5cff').slice(1)}"></div></div>
         <label class="check qm-sw" style="margin-top:8px"><span>Usar cor da marca</span><span class="switch"><input type="checkbox" id="qm-brand" ${item.useBrand ? 'checked' : ''}><span></span></span></label></div>
       <label class="field"><span>Posição no vídeo</span><select class="input" id="qm-pos">${posOpts(item.pos || 'br')}</select></label>
       <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="qm-ok" ${existing ? 'data-save' : ''} disabled>${existing ? 'Salvar' : 'Criar'}</button></div>`,
      {
        onMount: (m, close) => {
          const cv = $('#qm-cv', m);
          const ok = $('#qm-ok', m);
          const paint = () => {
            const valid = qrValid(item.url);
            ok.disabled = !valid;
            cv.height = item.showTitle && item.title ? 340 : 320;
            drawQrTo(cv, { ...item, url: valid ? item.url : '' }, 300);
          };
          const err = (t) => ($('#qm-err', m).textContent = t);
          const sync = () => {
            item.title = $('#qm-title', m).value.trim();
            item.url = $('#qm-url', m).value.trim();
            item.showTitle = $('#qm-show', m).checked;
            item.useBrand = $('#qm-brand', m).checked;
            item.pos = $('#qm-pos', m).value;
            const u = item.url;
            err(u && !qrValid(u) ? 'Link muito longo ou inválido.' : '');
            paint();
          };
          const paintDecos = () => {
            const box = $('#qm-decos', m);
            const sel = (v) => (item.deco === v ? 'sel' : '');
            box.innerHTML = `
              <button type="button" class="qm-deco ${sel('')}" data-d="" title="Sem decoração">${icons.x}</button>
              ${S.brand.logo ? `<button type="button" class="qm-deco ${sel(S.brand.logo)}" data-d="__brand" title="Logo da marca"><img src="${esc(S.brand.logo)}" alt=""></button>` : ''}
              ${decos().map((d, i) => `<button type="button" class="qm-deco ${sel(d)}" data-d="${i}" title="Imagem"><img src="${esc(d)}" alt=""><i class="qm-del" data-del="${i}" title="Remover imagem">×</i></button>`).join('')}
              <button type="button" class="qm-deco add" id="qm-add" title="Adicionar imagem">${icons.plus}</button>`;
            $$('.qm-deco[data-d]', box).forEach((b) => {
              b.onclick = (e) => {
                const del = e.target.closest('[data-del]');
                if (del) {
                  const i = +del.dataset.del;
                  const [gone] = decos().splice(i, 1);
                  if (item.deco === gone) item.deco = '';
                  saveStudio();
                  paintDecos();
                  return paint();
                }
                const d = b.dataset.d;
                item.deco = d === '' ? '' : d === '__brand' ? S.brand.logo : decos()[+d];
                paintDecos();
                paint();
              };
            });
            $('#qm-add', box).onclick = async () => {
              const f = await pickFile('image/*');
              if (!f) return;
              try {
                const url = await readImage(f, 256, 'image/png');
                decos().push(url);
                item.deco = url;
                saveStudio();
                paintDecos();
                paint();
              } catch (e) {
                toast('Imagem inválida: ' + e.message, 'err');
              }
            };
          };
          const setColor = (hex) => {
            if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
            item.color = hex.toLowerCase();
            item.useBrand = false;
            $('#qm-color', m).value = item.color;
            $('#qm-brand', m).checked = false;
            paint();
          };
          $$('#qm-title,#qm-url,#qm-show,#qm-brand,#qm-pos', m).forEach((el) => {
            el.oninput = sync;
            el.onchange = sync;
          });
          $('#qm-color', m).oninput = (e) => {
            $('#qm-hex', m).value = e.target.value.slice(1);
            setColor(e.target.value);
          };
          $('#qm-hex', m).oninput = (e) => setColor('#' + e.target.value.replace(/[^0-9a-f]/gi, '').slice(0, 6));
          const submit = () => {
            sync();
            if (!ok.disabled) close({ ...item, url: normalizeUrl(item.url) });
          };
          $('#qm-url', m).onkeydown = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          };
          ok.onclick = submit;
          const timer = setInterval(paint, 500); // imagens carregam de forma assíncrona
          const stop = new MutationObserver(() => {
            if (!document.body.contains(m)) {
              clearInterval(timer);
              stop.disconnect();
            }
          });
          stop.observe(document.body, { childList: true });
          paintDecos();
          sync();
          $('#qm-title', m).focus();
        },
      },
    );
    if (!res) return;
    const list = qrs();
    const i = list.findIndex((x) => x.id === res.id);
    if (i >= 0) list[i] = res;
    else list.push(res);
    saveStudio();
    onAir();
    if (airQr === res.id) showQr(res);
    toast(existing ? 'Código QR atualizado' : 'Código QR criado — clique em Mostrar para colocar no ar', 'ok');
    render();
  }

  // ---------------- janela de criar/editar enquete ----------------
  const DURS = [[0, 'Sem limite'], [30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min'], [600, '10 min']];
  async function openPollModal(existing, copy = false) {
    const f = existing
      ? { q: existing.question, opts: existing.options.map((o) => o.text), pos: existing.pos || 'bl', duration: existing.duration || 0, web: webOn(existing) }
      : { q: '', opts: ['', ''], pos: 'bl', duration: 0, web: true };
    const editing = existing && !copy;
    const hasVotes = editing && total(existing) > 0;
    const res = await modal(
      `<h3>${editing ? 'Editar enquete' : copy ? 'Duplicar enquete' : 'Nova enquete'}</h3>
       <p class="sub">O público vota pelo celular (QR Code no vídeo) ou digitando o número da opção no chat do estúdio ou das redes.</p>
       <label class="field"><span>Pergunta</span><textarea class="input" id="pm-q" rows="2" maxlength="140" placeholder="Ex.: Quem vence o jogo de hoje?">${esc(f.q)}</textarea><small class="hint pm-count" id="pm-qc"></small></label>
       <div class="field"><span>Opções <small class="hint">(2 a 6)</small></span><div id="pm-opts" class="pm-opts"></div>
         <button type="button" class="btn sm" id="pm-add" style="margin-top:6px">${icons.plus} Adicionar opção</button></div>
       <div class="field"><span>Tempo de votação</span><div class="pm-durs" id="pm-durs">${DURS.map(([s, l]) => `<button type="button" class="pm-chip ${f.duration === s ? 'on' : ''}" data-s="${s}">${l}</button>`).join('')}</div>
         <small class="hint">Com limite, a enquete encerra sozinha e mostra a contagem regressiva no vídeo.</small></div>
       <label class="field"><span>Posição no vídeo</span><select class="input" id="pm-pos">${posOpts(f.pos)}</select></label>
       <label class="check qm-sw"><span>Votar pelo celular <small class="hint">(mostra um QR Code com página de votação)</small></span><span class="switch"><input type="checkbox" id="pm-web" ${f.web ? 'checked' : ''}><span></span></span></label>
       ${hasVotes ? '<p class="hint" style="color:#f5b942">Esta enquete já tem votos. Opções removidas perdem seus votos; as demais continuam.</p>' : ''}
       <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="pm-ok" ${editing ? 'data-save' : ''} disabled>${editing ? 'Salvar' : 'Criar enquete'}</button></div>`,
      {
        onMount: (m, close) => {
          const ok = $('#pm-ok', m);
          const q = $('#pm-q', m);
          const valid = () => f.q.trim() && f.opts.filter((o) => o.trim()).length >= 2;
          const check = () => {
            f.q = q.value;
            $('#pm-qc', m).textContent = `${f.q.length}/140`;
            ok.disabled = !valid();
            $('#pm-add', m).disabled = f.opts.length >= 6;
          };
          const paintOpts = (focusLast) => {
            const box = $('#pm-opts', m);
            box.innerHTML = f.opts
              .map(
                (o, i) => `<div class="pm-opt"><span class="n">${i + 1}</span><input class="input grow" data-i="${i}" maxlength="60" placeholder="Opção ${i + 1}" value="${esc(o)}"><button type="button" class="btn ghost sm icon" data-rm="${i}" title="Remover opção" ${f.opts.length <= 2 ? 'disabled' : ''}>${icons.trash}</button></div>`,
              )
              .join('');
            $$('input', box).forEach((el) => {
              el.oninput = () => {
                f.opts[+el.dataset.i] = el.value;
                check();
              };
              el.onkeydown = (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const i = +el.dataset.i;
                if (i === f.opts.length - 1 && f.opts.length < 6 && el.value.trim()) {
                  f.opts.push('');
                  paintOpts(true);
                } else if (i < f.opts.length - 1) $(`input[data-i="${i + 1}"]`, box).focus();
                else if (valid()) submit();
              };
            });
            $$('[data-rm]', box).forEach((b) => (b.onclick = () => (f.opts.splice(+b.dataset.rm, 1), paintOpts())));
            if (focusLast) $$('input', box).at(-1)?.focus();
            check();
          };
          const submit = () => valid() && close({ ...f, pos: $('#pm-pos', m).value, web: $('#pm-web', m).checked });
          q.oninput = check;
          q.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              $('#pm-opts input', m)?.focus();
            }
          };
          $('#pm-add', m).onclick = () => {
            if (f.opts.length < 6) f.opts.push('');
            paintOpts(true);
          };
          $$('#pm-durs .pm-chip', m).forEach(
            (b) =>
              (b.onclick = () => {
                f.duration = +b.dataset.s;
                $$('#pm-durs .pm-chip', m).forEach((x) => x.classList.toggle('on', x === b));
              }),
          );
          ok.onclick = submit;
          paintOpts();
          setTimeout(() => q.focus(), 30);
        },
        sticky: true,
      },
    );
    if (!res) return;
    const texts = res.opts.map((o) => o.trim()).filter(Boolean);
    if (editing) {
      const old = existing.options;
      existing.question = res.q.trim();
      // mantém os votos das opções que continuam (pelo texto ou pela posição)
      existing.options = texts.map((text, i) => ({ text, votes: (old.find((o) => o.text === text) || old[i])?.votes || 0 }));
      existing.pos = res.pos;
      existing.duration = res.duration;
      existing.web = res.web;
      if (existing.state === 'open' && res.duration > 0 && !existing.endsAt) existing.endsAt = Date.now() + res.duration * 1000;
      if (existing.state === 'open' && !res.duration) delete existing.endsAt;
      if (airPoll === existing.id) showPoll(existing);
      toast('Enquete atualizada', 'ok');
    } else {
      polls().unshift({ id: uid(), question: res.q.trim(), options: texts.map((text) => ({ text, votes: 0 })), state: 'ready', pos: res.pos, duration: res.duration, web: res.web });
      toast('Enquete criada — clique em “Iniciar enquete” para ir ao ar', 'ok');
    }
    saveStudio();
    onAir();
    render();
  }
  const fmtLeft = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ---------------- painel ----------------
  function pollHtml(p) {
    const t = total(p);
    const onAir = airPoll === p.id;
    const pill = p.state === 'open' ? '<span class="pill live">VOTANDO</span>' : p.state === 'closed' ? '<span class="pill">ENCERRADA</span>' : '';
    const max = Math.max(...p.options.map((o) => o.votes || 0), 0);
    return `<div class="wg-item ${onAir ? 'showing' : ''}" data-id="${p.id}">
      <div class="row" style="gap:6px;align-items:flex-start"><strong class="grow wg-q">${esc(p.question)}</strong>${onAir ? '<span class="pill ok">NO AR</span>' : ''}${pill}</div>
      <div class="wg-opts">${p.options
        .map((o, i) => {
          const pct = t ? Math.round(((o.votes || 0) / t) * 100) : 0;
          return `<div class="wg-opt ${p.state === 'closed' && max && o.votes === max ? 'win' : ''}"><span class="n">${i + 1}</span><span class="tx" title="${esc(o.text)}">${esc(o.text)}</span><div class="bar"><i style="width:${pct}%"></i></div><span class="v">${o.votes || 0} · ${pct}%</span><button class="btn ghost sm icon" data-plus="${i}" title="Somar 1 voto manualmente" aria-label="Somar voto">＋</button></div>`;
        })
        .join('')}</div>
      <div class="hint">${t} ${t === 1 ? 'voto' : 'votos'}${p.state === 'open' ? (p.endsAt ? ` · encerra em <b data-left>${fmtLeft(Math.max(0, Math.ceil((p.endsAt - Date.now()) / 1000)))}</b>` : webOn(p) ? ' · aberta: QR Code ou chat' : ' · aberta: o chat vota digitando o número') : p.duration ? ` · tempo: ${DURS.find((d) => d[0] === p.duration)?.[1] || p.duration + ' s'}` : ''}${webOn(p) && p.state === 'open' && voteLocalOnly ? ' · <span style="color:#f5b942" title="Ligue o túnel público em Painel → Conexão">QR só na mesma rede</span>' : ''}</div>
      <div class="wg-acts">
        ${p.state === 'open' ? '<button class="btn danger sm" data-act="close">■ Encerrar votação</button>' : p.state === 'closed' ? `<button class="btn primary sm" data-act="${onAir ? 'hide' : 'show'}">${onAir ? '✕ Tirar do ar' : '▶ Mostrar resultado'}</button>` : '<button class="btn primary sm" data-act="start">▶ Iniciar enquete</button>'}
        ${p.state === 'open' || (p.state === 'ready' && onAir) ? `<button class="btn sm" data-act="${onAir ? 'hide' : 'show'}">${onAir ? '✕ Tirar do ar' : '▶ Mostrar'}</button>` : ''}
        ${webOn(p) ? '<button class="btn ghost sm" data-act="link" title="QR Code e link da página de votação pelo celular">▦ Link</button>' : ''}
        <button class="btn ghost sm icon" data-act="edit" title="Editar pergunta e opções">✎</button>
        <button class="btn ghost sm icon" data-act="dup" title="Duplicar enquete">⧉</button>
        <button class="btn ghost sm" data-act="reset" title="Zerar votos e voltar ao início">↺ Zerar</button>
        <button class="btn ghost sm icon" data-act="del" title="Excluir enquete">${icons.trash}</button>
      </div></div>`;
  }

  function paintPolls() {
    const box = $('#wg-polls');
    if (!box) return;
    box.innerHTML = polls().length ? polls().map(pollHtml).join('') : '<div class="empty">Nenhuma enquete criada ainda.</div>';
    bindPolls(box);
  }
  function bindPolls(box) {
    $$('.wg-item', box).forEach((el) => {
      const p = polls().find((x) => x.id === el.dataset.id);
      if (!p) return;
      el.onclick = async (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.plus !== undefined) {
          p.options[+b.dataset.plus].votes = (p.options[+b.dataset.plus].votes || 0) + 1;
          lazySave();
          return paintPolls();
        }
        const act = b.dataset.act;
        if (act === 'start') startPoll(p);
        else if (act === 'close') closePoll(p);
        else if (act === 'show') showPoll(p);
        else if (act === 'hide') hidePoll();
        else if (act === 'edit') return openPollModal(p);
        else if (act === 'link') return openVoteLink(p);
        else if (act === 'dup') return openPollModal(p, true);
        else if (act === 'reset') {
          if (total(p) && !(await confirmDialog('Zerar os votos desta enquete?', { ok: 'Zerar', danger: true }))) return;
          resetPoll(p);
        }
        else if (act === 'del') {
          if (!(await confirmDialog('Excluir esta enquete?', { ok: 'Excluir', danger: true }))) return;
          deletePoll(p);
        }
        paintPolls();
      };
    });
  }

  function render() {
    const p = $('#panel-widgets');
    if (!p) return;
    p.innerHTML = `
      <h4>Enquetes</h4>
      <p class="hint" style="margin:0 0 10px">Crie uma pergunta e o público vota pelo celular (QR Code que aparece junto da enquete) ou digitando o número da opção no chat (estúdio ou redes). O resultado aparece ao vivo no vídeo.</p>
      <button class="btn" id="pl-new" style="width:100%">${icons.plus} Nova enquete</button>
      <div id="wg-polls" style="margin-top:10px"></div>
      <h4>Código QR</h4>
      <p class="hint" style="margin:0 0 10px">Mostre um QR Code clicável no vídeo para levar o público ao seu site, loja, grupo ou PIX.</p>
      <button class="btn" id="qr-new" style="width:100%">${icons.plus} Novo código QR</button>
      <div id="wg-qrs" style="margin-top:10px"></div>`;
    paintPolls();
    paintQrs();
    $('#pl-new', p).onclick = () => openPollModal();
    $('#qr-new', p).onclick = () => openQrModal();
  }

  function paintQrs() {
    const box = $('#wg-qrs');
    if (!box) return;
    const list = qrs();
    box.innerHTML = list.length
      ? list
          .map(
            (q) => `<div class="wg-item wg-qr ${airQr === q.id ? 'showing' : ''}" data-id="${q.id}">
        <canvas width="64" height="72" data-thumb="${q.id}"></canvas>
        <div class="grow" style="min-width:0"><strong class="wg-q">${esc(q.title || 'Código QR')}</strong><div class="hint wg-url" title="${esc(q.url)}">${esc(q.url)}</div>
          <div class="wg-acts" style="margin-top:6px"><button class="btn ${airQr === q.id ? 'danger' : 'primary'} sm" data-act="${airQr === q.id ? 'hide' : 'show'}">${airQr === q.id ? '✕ Tirar do ar' : '▶ Mostrar'}</button>
          <button class="btn ghost sm icon" data-act="edit" title="Editar">✎</button><button class="btn ghost sm icon" data-act="del" title="Excluir">${icons.trash}</button></div></div></div>`,
          )
          .join('')
      : '<div class="empty">Nenhum código QR criado ainda.</div>';
    $$('canvas[data-thumb]', box).forEach((cv) => {
      const q = list.find((x) => x.id === cv.dataset.thumb);
      drawQrTo(cv, { ...q, showTitle: false }, 64);
    });
    $$('.wg-item', box).forEach((el) => {
      const q = list.find((x) => x.id === el.dataset.id);
      el.onclick = async (e) => {
        const b = e.target.closest('button');
        if (!b || !q) return;
        const act = b.dataset.act;
        if (act === 'show') showQr(q);
        else if (act === 'hide') hideQr();
        else if (act === 'edit') return openQrModal(q);
        else if (act === 'del') {
          if (!(await confirmDialog('Excluir este código QR?', { ok: 'Excluir', danger: true }))) return;
          if (airQr === q.id) hideQr();
          S.brand.qrs = qrs().filter((x) => x.id !== q.id);
          saveStudio();
          onAir();
        }
        paintQrs();
      };
    });
  }

  // limpa a tela (botão "Limpar" da barra): tira enquete e QR do ar
  function clearAir() {
    if (airPoll) hidePoll();
    if (airQr) hideQr();
    if ($('#wg-polls')) {
      paintPolls();
      paintQrs();
    }
  }

  // itens da seção "Tela" da barra de controle
  function deckItems() {
    const st = { ready: '', open: ' · votando', closed: ' · resultado' };
    return [
      ...polls().map((p) => ({ id: 'poll:' + p.id, label: `📊 ${p.question.slice(0, 40)}${st[p.state] || ''}`, on: airPoll === p.id })),
      ...qrs().map((q) => ({ id: 'qr:' + q.id, label: `▦ QR ${(q.title || q.url.replace(/^https?:\/\//, '')).slice(0, 40)}`, on: airQr === q.id })),
    ];
  }
  function deckToggle(id) {
    const [kind, key] = id.split(':');
    if (kind === 'qr') {
      const q = qrs().find((x) => x.id === key);
      if (!q) return;
      if (airQr === q.id) hideQr();
      else showQr(q);
    } else if (kind === 'poll') {
      const p = polls().find((x) => x.id === key);
      if (!p) return;
      if (airPoll === p.id) hidePoll();
      else if (p.state === 'ready') startPoll(p); // primeira vez: abre a votação
      else showPoll(p);
    }
    if ($('#wg-polls')) {
      paintPolls();
      paintQrs();
    }
  }

  return { render, onChatMessage, clearAir, deckItems, deckToggle };
}
