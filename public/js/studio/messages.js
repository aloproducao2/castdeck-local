// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Aba Interação → Mensagens: o público escaneia um QR Code no vídeo e manda um texto curto ou um áudio pelo
// celular (página /msg/<estúdio>). Mesmo esquema da votação (widgets.js): o estúdio publica a "caixa" no
// servidor a cada 1,5 s e leva as mensagens novas. Nada vai ao ar sozinho (a não ser com "automático"):
// o host vê a lista chegando e escolhe o que mostrar. Áudios tocam no programa pelo mixer.
import { renderQr } from './widgets-draw.js';

const POS = [
  ['bl', 'Embaixo à esquerda'],
  ['br', 'Embaixo à direita'],
  ['tl', 'Em cima à esquerda'],
  ['tr', 'Em cima à direita'],
  ['ml', 'Meio à esquerda'],
  ['mr', 'Meio à direita'],
];
const DURS = [[0, 'Manual'], [8, '8 s'], [12, '12 s'], [20, '20 s'], [30, '30 s']];
const FILTERS = [['all', 'Todas'], ['new', 'Não exibidas'], ['text', 'Texto'], ['audio', 'Áudio']];
const MAX_LIST = 200;
const uid = () => Math.random().toString(36).slice(2, 10);
const posOpts = (v) => POS.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
const hhmm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const fmtDur = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.round(s || 0) % 60).padStart(2, '0')}`;

// data URL → blob: URL (não guarda strings enormes no DOM nem na memória da lista)
function dataToBlobUrl(d) {
  const i = d.indexOf(',');
  const mime = d.slice(5, i).split(';')[0] || 'audio/webm';
  const bin = atob(d.slice(i + 1));
  const u8 = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
  return URL.createObjectURL(new Blob([u8], { type: mime }));
}

import { confirmDialog } from '../ui.js';

export function createMessages({ S, comp, $, $$, esc, toast, icons, modal, saveStudio, api, studioId, copyText, getMixer, onAir = () => {}, onUnread = () => {} }) {
  const cfg = () => (S.brand.msgBox ||= { title: 'Mande sua mensagem', audio: true, auto: false, pos: 'bl', qrPos: 'br', dur: 12 });
  const list = []; // mais nova primeiro
  const blocked = new Set(); // aparelhos bloqueados nesta sessão
  const listeners = new Set(); // outras abas (WhatsApp) que mostram os mesmos cartões
  let emitT = 0;
  function emit() {
    clearTimeout(emitT);
    emitT = setTimeout(() => {
      for (const fn of listeners) {
        try {
          fn();
        } catch {}
      }
    }, 25);
  }
  const session = uid(); // a página do público usa para saber se a caixa mudou
  let open = false; // recebendo mensagens
  let airQr = false;
  let airMsg = null; // id da mensagem no ar
  let unread = 0;
  let filter = 'all';
  let hideT = 0;
  let player = null; // { id, el, stop }
  let synced = false;
  let syncing = false;
  let base = '';
  let localOnly = false;
  let baseAt = 0;

  const brandColor = () => comp.brand?.color || S.brand.color || '#7c5cff';
  const msgUrl = () => (base && studioId ? `${base}/msg/${encodeURIComponent(studioId)}` : '');

  async function refreshBase(force) {
    if (!api || (!force && Date.now() - baseAt < 15000)) return;
    baseAt = Date.now();
    try {
      const sys = await api('/system');
      const t = sys.tunnel?.url || '';
      const b = t || sys.lan?.[0]?.url || '';
      if (b !== base || !t !== localOnly) {
        base = b;
        localOnly = !t;
        paintWarn();
      }
    } catch {}
  }

  // ---------------- sincronização com o servidor ----------------
  setInterval(async () => {
    if (!api || !studioId || syncing) return;
    const active = open || airQr; // QR no ar com recebimento pausado: a página mostra "pausado"
    if (!active && !synced) return;
    syncing = true;
    if (active) refreshBase();
    try {
      const box = active ? { session, open, title: cfg().title, audio: cfg().audio !== false } : null;
      const r = await api(`/studios/${encodeURIComponent(studioId)}/msgs`, { method: 'POST', body: { box } });
      synced = active;
      if (r?.msgs?.length) receive(r.msgs);
    } catch {
    } finally {
      syncing = false;
    }
  }, 1500);

  function receive(msgs) {
    const fresh = [];
    for (const raw of msgs) {
      if (blocked.has(raw.sender) || list.some((x) => x.id === raw.id)) continue;
      const m = { id: raw.id, sender: raw.sender, name: raw.name || '', text: raw.text || '', dur: raw.dur || 0, at: raw.at || Date.now(), audio: false, src: '', shown: false, read: false };
      if (raw.audio) {
        try {
          m.src = dataToBlobUrl(raw.audio);
          m.audio = true;
        } catch {
          if (!m.text) continue;
        }
      }
      list.unshift(m);
      fresh.push(m);
    }
    if (!fresh.length) return;
    // limite da lista: descarta as mais antigas (menos a que está no ar)
    while (list.length > MAX_LIST) {
      const i = list.findLastIndex((x) => x.id !== airMsg);
      const [gone] = list.splice(i, 1);
      if (gone?.src) URL.revokeObjectURL(gone.src);
    }
    const viewing = S.tab === 'messages' && !document.hidden && $('#mb-list');
    if (viewing) fresh.forEach((m) => (m.read = true));
    else {
      unread += fresh.length;
      onUnread(unread);
    }
    const last = fresh[fresh.length - 1];
    toast(fresh.length > 1 ? `💬 ${fresh.length} mensagens novas do público` : `💬 ${last.audio ? 'Áudio' : 'Mensagem'} de ${last.name || 'Espectador'}`);
    if (cfg().auto && !airMsg) showMsg(fresh[fresh.length - 1]);
    if ($('#mb-list')) {
      // novas entram no topo sem redesenhar a lista (não interrompe um áudio que o host está ouvindo)
      const box = $('#mb-list');
      if (!box.querySelector('.msg-item')) paintList();
      else for (const m of fresh) if (matches(m)) box.prepend(itemEl(m, true));
      paintCount();
    }
    emit();
  }

  function markRead() {
    if (!unread && !list.some((m) => !m.read)) return;
    list.forEach((m) => (m.read = true));
    unread = 0;
    onUnread(0);
  }
  // janela minimizada/escondida com a aba aberta: ao voltar, o que chegou conta como lido
  document.addEventListener('visibilitychange', () => !document.hidden && S.tab === 'messages' && $('#mb-list') && markRead());

  // ---------------- no ar ----------------
  function stopPlayer() {
    if (!player) return;
    try {
      player.el.pause();
    } catch {}
    player.stop?.();
    player = null;
  }

  function showMsg(m) {
    if (!m) return;
    clearTimeout(hideT);
    stopPlayer();
    const prev = airMsg;
    airMsg = m.id;
    m.shown = true;
    m.read = true;
    const data = {
      id: m.id,
      name: m.name,
      text: m.text,
      audio: m.audio,
      dur: m.dur,
      playing: () => !!player && player.id === m.id && !player.el.paused,
      progress: () => {
        if (!player || player.id !== m.id) return 0;
        const d = Number.isFinite(player.el.duration) && player.el.duration > 0 ? player.el.duration : m.dur || 1;
        return player.el.currentTime / d;
      },
    };
    comp.wg.show('msg', 'msg', () => data, cfg().pos || 'bl');
    const dur = cfg().dur || 0;
    if (m.audio && m.src) {
      const el = new Audio();
      el.src = m.src;
      const mixer = getMixer?.();
      let stop = null;
      try {
        stop = mixer ? mixer.playOnProgram(el) : null;
      } catch {}
      player = { id: m.id, el, stop };
      el.onended = () => {
        if (player?.el !== el) return;
        stopPlayer();
        // terminou de tocar: sai do ar sozinho (a não ser no modo manual)
        if (dur > 0) hideT = setTimeout(() => airMsg === m.id && hideMsg(), 2000);
        refreshItem(m.id);
      };
      el.play().catch(() => toast('Não foi possível tocar o áudio', 'err'));
    } else if (dur > 0) hideT = setTimeout(() => airMsg === m.id && hideMsg(), dur * 1000);
    onAir();
    if (prev) refreshItem(prev);
    refreshItem(m.id);
    emit();
  }

  function hideMsg() {
    clearTimeout(hideT);
    stopPlayer();
    const prev = airMsg;
    comp.wg.hide('msg');
    airMsg = null;
    onAir();
    if (prev) refreshItem(prev);
    emit();
  }

  function showQr() {
    if (!open) {
      open = true;
      toast('Recebimento de mensagens aberto', 'ok');
    }
    refreshBase(true);
    comp.wg.show('msgqr', 'msgqr', () => ({ url: msgUrl(), title: cfg().title, audio: cfg().audio !== false }), cfg().qrPos || 'br');
    airQr = true;
    onAir();
    paintHead();
  }
  function hideQr() {
    comp.wg.hide('msgqr');
    airQr = false;
    onAir();
    paintHead();
  }

  // QR externo (WhatsApp): o público lê e cai direto na conversa do número conectado.
  function showExternalQr(url, title = 'Mande sua mensagem') {
    const u = String(url || '').trim();
    if (!u) return;
    comp.wg.show('msgqr', 'msgqr', () => ({ url: u, title, audio: true }), cfg().qrPos || 'br');
    airQr = true;
    onAir();
    paintHead();
  }

  function setOpen(on) {
    open = on;
    if (on) refreshBase(true);
    toast(on ? 'Recebendo mensagens — mostre o QR Code ou mande o link para o público' : 'Recebimento pausado', on ? 'ok' : undefined);
    paintHead();
  }

  async function openLink() {
    await refreshBase(true);
    const url = msgUrl();
    await modal(
      `<h3>Mensagens pelo celular</h3>
       <p class="sub">O público abre este link (ou escaneia o QR Code) e manda um texto curto ou um áudio. Você também pode colar o link no chat das redes.</p>
       ${localOnly ? '<div class="status-banner" style="margin-bottom:12px">O túnel público está desligado: este link só funciona para quem está na mesma rede Wi-Fi (e mostra aviso de certificado). Ligue o túnel em Painel → Conexão para receber de qualquer lugar.</div>' : ''}
       <div class="qm-preview"><canvas id="ml-cv" width="300" height="300"></canvas></div>
       <div class="list-item card" style="box-shadow:none;padding:10px 14px"><div class="meta" style="min-width:0"><strong>${esc(cfg().title)}</strong><span style="overflow-wrap:anywhere">${esc(url || 'Link indisponível')}</span></div>
         <button class="btn sm primary" id="ml-copy" ${url ? '' : 'disabled'}>${icons.copy || ''} Copiar</button></div>
       <div class="modal-actions"><button class="btn primary" data-close>Pronto</button></div>`,
      {
        onMount: (m) => {
          const cv = $('#ml-cv', m);
          const src = url ? renderQr({ url, useBrand: true }, (u) => comp.image(u), brandColor()) : null;
          if (src) cv.getContext('2d').drawImage(src, 5, 5, 290, (290 * src.height) / src.width);
          $('#ml-copy', m).onclick = () => copyText?.(url);
        },
      },
    );
  }

  // ---------------- painel ----------------
  const matches = (m) => filter === 'all' || (filter === 'new' && !m.shown) || (filter === 'text' && !m.audio) || (filter === 'audio' && m.audio);

  function itemEl(m, fresh = false) {
    const on = airMsg === m.id;
    const el = document.createElement('div');
    el.className = `wg-item msg-item ${on ? 'showing' : ''} ${fresh ? 'fresh' : ''}`;
    el.dataset.id = m.id;
    const initial = (m.name || '?').trim().charAt(0).toUpperCase() || '?';
    el.innerHTML = `
      <div class="msg-row">
        <span class="msg-av" aria-hidden="true">${esc(initial)}</span>
        <div class="msg-main">
          <div class="msg-top"><strong class="msg-name" translate="no">${esc(m.name || 'Espectador')}</strong>${m.source === 'whatsapp' ? '<span class="pill wa-src">WhatsApp</span>' : ''}<span class="hint">${hhmm(m.at)}</span>
            ${on ? '<span class="pill ok">NO AR</span>' : m.shown ? '<span class="pill">EXIBIDA</span>' : ''}${m.audio ? `<span class="pill">🎤 ${fmtDur(m.dur)}</span>` : ''}</div>
          ${m.text ? `<p class="msg-tx" translate="no">${esc(m.text)}</p>` : ''}
          ${m.audio ? `<audio class="msg-au" controls preload="metadata" src="${m.src}" title="Ouvir só para você (não vai ao ar)"></audio>` : ''}
        </div>
      </div>
      <div class="wg-acts">
        <button class="btn sm ${on ? 'danger' : 'primary'}" data-act="${on ? 'hide' : 'show'}">${on ? '✕ Tirar do ar' : m.audio ? '▶ Mostrar e tocar' : '▶ Mostrar no ar'}</button>
        ${on && m.audio ? '<button class="btn sm" data-act="replay" title="Tocar o áudio de novo no programa">↺ Tocar de novo</button>' : ''}
        <span class="grow"></span>
        <button class="btn ghost sm icon" data-act="block" title="${m.source === 'whatsapp' ? 'Bloquear esta conversa no WhatsApp' : 'Bloquear este aparelho (até fechar o estúdio)'}">🚫</button>
        <button class="btn ghost sm icon" data-act="del" title="Apagar mensagem">${icons.trash}</button>
      </div>`;
    el.onclick = async (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'show' || act === 'replay') showMsg(m);
      else if (act === 'hide') hideMsg();
      else if (act === 'del') removeMsg(m);
      else if (act === 'block') {
        const wa = m.source === 'whatsapp';
        if (!(await confirmDialog(wa ? 'Bloquear esta conversa do WhatsApp?\n\nAs mensagens desta conversa somem da lista nesta sessão.' : 'Bloquear este aparelho?\n\nAs mensagens dele somem da lista e as próximas serão ignoradas.', { ok: 'Bloquear', danger: true }))) return;
        blocked.add(m.sender);
        for (const x of list.filter((y) => y.sender === m.sender)) removeMsg(x, false);
        paintList();
        toast(wa ? 'Conversa bloqueada nesta sessão' : 'Aparelho bloqueado', 'ok');
      }
    };
    return el;
  }

  function removeMsg(m, repaint = true) {
    if (airMsg === m.id) hideMsg();
    const i = list.indexOf(m);
    if (i >= 0) list.splice(i, 1);
    if (m.src) URL.revokeObjectURL(m.src);
    if (repaint) {
      for (const el of $$(`.msg-item[data-id="${m.id}"]`)) el.remove();
      if (!list.some(matches)) paintList();
      paintCount();
    }
    emit();
  }

  function refreshItem(id) {
    const m = list.find((x) => x.id === id);
    if (!m) return;
    for (const old of $$(`.msg-item[data-id="${id}"]`)) old.replaceWith(itemEl(m));
  }

  function paintCount() {
    const c = $('#mb-count');
    if (c) c.textContent = list.length ? `(${list.length})` : '';
  }

  function paintList() {
    const box = $('#mb-list');
    if (!box) return;
    const items = list.filter(matches);
    box.replaceChildren(...items.map((m) => itemEl(m)));
    if (!items.length)
      box.innerHTML = `<div class="empty">${list.length ? 'Nenhuma mensagem neste filtro.' : open ? 'Aguardando mensagens… mostre o QR Code no ar ou mande o link.' : 'Abra o recebimento para o público começar a mandar mensagens.'}</div>`;
    paintCount();
  }

  function paintWarn() {
    const w = $('#mb-warn');
    if (w) w.innerHTML = localOnly && (open || airQr) ? '<p class="hint" style="color:#f5b942;margin:8px 0 0">Túnel público desligado: o QR só funciona na mesma rede Wi-Fi. Ligue em Painel → Conexão.</p>' : '';
  }

  function paintHead() {
    const st = $('#mb-status');
    if (!st) return;
    st.classList.toggle('on', open);
    st.innerHTML = `<span class="dot"></span><div class="grow"><b>${open ? 'Recebendo mensagens' : 'Recebimento fechado'}</b><div class="hint">${open ? 'O público já pode mandar pelo QR Code ou pelo link.' : 'Ninguém consegue mandar mensagens agora.'}</div></div>
      <button class="btn sm ${open ? 'danger' : 'primary'}" id="mb-open">${open ? '■ Pausar' : '▶ Abrir'}</button>`;
    $('#mb-open', st).onclick = () => setOpen(!open);
    const q = $('#mb-qr');
    if (q) {
      q.className = `btn sm ${airQr ? 'danger' : 'primary'}`;
      q.textContent = airQr ? '✕ Tirar QR do ar' : '▦ Mostrar QR no ar';
    }
    paintWarn();
    if (!list.length) paintList();
  }

  function render() {
    const p = $('#panel-messages');
    if (!p) return;
    const c = cfg();
    p.innerHTML = `
      <h4>Recebimento</h4>
      <p class="hint" style="margin:0 0 10px">O público escaneia o QR Code e manda um texto curto (até 200 caracteres)${c.audio !== false ? ' ou um áudio de até 30 s' : ''}. As mensagens chegam na lista abaixo e você escolhe o que vai ao ar.</p>
      <div class="msg-status" id="mb-status"></div>
      <div class="field"><label for="mb-title">Chamada (aparece no QR do vídeo e na página)</label><input class="input" id="mb-title" maxlength="80" value="${esc(c.title || '')}" placeholder="Ex.: Mande sua pergunta para o programa"></div>
      <label class="check qm-sw"><span>Aceitar áudio <small class="hint">(até 30 s)</small></span><span class="switch"><input type="checkbox" id="mb-audio" ${c.audio !== false ? 'checked' : ''}><span></span></span></label>
      <label class="check qm-sw"><span>Mostrar no ar automaticamente <small class="hint">(cada mensagem nova, sem moderação)</small></span><span class="switch"><input type="checkbox" id="mb-auto" ${c.auto ? 'checked' : ''}><span></span></span></label>
      <div class="wg-acts" style="margin-top:0"><button class="btn sm primary" id="mb-qr"></button><button class="btn sm ghost" id="mb-link" title="Link e QR Code para mandar no chat">▦ Link</button></div>
      <div id="mb-warn"></div>
      <h4>Aparência no vídeo</h4>
      <div class="row" style="gap:10px">
        <div class="field grow"><label for="mb-pos">Mensagem</label><select class="input" id="mb-pos">${posOpts(c.pos || 'bl')}</select></div>
        <div class="field grow"><label for="mb-qrpos">QR Code</label><select class="input" id="mb-qrpos">${posOpts(c.qrPos || 'br')}</select></div>
      </div>
      <div class="field"><label>Tempo da mensagem no ar</label><div class="pm-durs" id="mb-durs">${DURS.map(([s, l]) => `<button type="button" class="pm-chip ${(c.dur ?? 12) === s ? 'on' : ''}" data-s="${s}">${l}</button>`).join('')}</div>
        <small class="hint">Áudios ficam no ar enquanto tocam e saem 2 s depois (exceto no modo Manual).</small></div>
      <h4>Mensagens <span class="hint" id="mb-count"></span></h4>
      <div class="msg-tools"><div class="seg" id="mb-filter">${FILTERS.map(([v, l]) => `<button data-v="${v}" class="${filter === v ? 'active' : ''}">${l}</button>`).join('')}</div>
        <button class="btn ghost sm" id="mb-clear" title="Apagar todas as mensagens da lista">Limpar</button></div>
      <div id="mb-list"></div>`;
    paintHead();
    paintList();
    markRead();
    const title = $('#mb-title', p);
    let saveT;
    title.oninput = () => {
      cfg().title = title.value.trim() || 'Mande sua mensagem';
      clearTimeout(saveT);
      saveT = setTimeout(saveStudio, 800);
    };
    $('#mb-audio', p).onchange = (e) => {
      cfg().audio = e.target.checked;
      saveStudio();
    };
    $('#mb-auto', p).onchange = (e) => {
      cfg().auto = e.target.checked;
      saveStudio();
      if (e.target.checked) toast('Cada mensagem nova vai direto para o ar (quando não houver outra no ar)');
    };
    $('#mb-qr', p).onclick = () => (airQr ? hideQr() : showQr());
    $('#mb-link', p).onclick = openLink;
    $('#mb-pos', p).onchange = (e) => {
      cfg().pos = e.target.value;
      saveStudio();
      const m = list.find((x) => x.id === airMsg);
      if (m) comp.wg.show('msg', 'msg', comp.wg.items.get('msg')?.get || (() => null), cfg().pos);
    };
    $('#mb-qrpos', p).onchange = (e) => {
      cfg().qrPos = e.target.value;
      saveStudio();
      if (airQr) showQr();
    };
    $$('#mb-durs .pm-chip', p).forEach(
      (b) =>
        (b.onclick = () => {
          cfg().dur = +b.dataset.s;
          saveStudio();
          $$('#mb-durs .pm-chip', p).forEach((x) => x.classList.toggle('on', x === b));
        }),
    );
    $$('#mb-filter button', p).forEach(
      (b) =>
        (b.onclick = () => {
          filter = b.dataset.v;
          $$('#mb-filter button', p).forEach((x) => x.classList.toggle('active', x === b));
          paintList();
        }),
    );
    $('#mb-clear', p).onclick = async () => {
      if (!list.length || !(await confirmDialog('Apagar todas as mensagens da lista?', { ok: 'Apagar', danger: true }))) return;
      if (airMsg) hideMsg();
      for (const m of list.splice(0)) if (m.src) URL.revokeObjectURL(m.src);
      paintList();
    };
  }

  // limpa a tela (botão "Limpar" da barra): tira mensagem e QR do ar
  function clearAir() {
    if (airMsg) hideMsg();
    if (airQr) hideQr();
  }

  // Entrada de outra fonte de interatividade (WhatsApp): entra na mesma lista/fila e usa o mesmo overlay.
  // Não passa pelo polling da caixa pública nem dispara áudio.
  function external(raw) {
    const id = String(raw?.id || '').slice(0, 140);
    if (!id) return '';
    if (list.some((x) => x.id === id)) return id;
    const m = {
      id,
      sender: String(raw.chatId || raw.sender || 'whatsapp').slice(0, 100),
      name: String(raw.name || raw.chatName || 'WhatsApp').slice(0, 80),
      text: String(raw.text || '').slice(0, 1000),
      dur: Math.max(0, Math.min(600, Number(raw.dur) || 0)),
      at: Number(raw.at) || Date.now(),
      audio: !!raw.audio,
      src: String(raw.src || ''),
      source: String(raw.source || 'whatsapp'),
      shown: false,
      read: true,
      external: true,
    };
    list.unshift(m);
    while (list.length > MAX_LIST) {
      const i = list.findLastIndex((x) => x.id !== airMsg);
      if (i < 0) break;
      const [gone] = list.splice(i, 1);
      if (gone?.src) URL.revokeObjectURL(gone.src);
    }
    if ($('#mb-list')) {
      paintList();
      paintCount();
    }
    emit();
    return id;
  }

  // Itens/cartões compartilhados com a aba WhatsApp. A mesma instância mantém os controles
  // (No ar, Tirar do ar, repetir áudio, bloquear e apagar) idênticos aos da aba Mensagens.
  function items({ source } = {}) {
    return source ? list.filter((m) => m.source === source) : list.slice();
  }

  function makeItem(m) {
    return itemEl(m);
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function showExternal(id) {
    const m = list.find((x) => x.id === id);
    if (m) showMsg(m);
  }

  function toggleExternal(id) {
    const m = list.find((x) => x.id === id);
    if (!m) return false;
    if (airMsg === id) hideMsg();
    else showMsg(m);
    return true;
  }

  // Remove da fila/lista todas as entradas de uma fonte externa (ex.: limpar recebidas do WhatsApp).
  function clearSource(source) {
    let n = 0;
    for (const m of [...list]) {
      if (m.source !== source) continue;
      if (airMsg === m.id) hideMsg();
      const i = list.indexOf(m);
      if (i >= 0) list.splice(i, 1);
      if (m.src) URL.revokeObjectURL(m.src);
      n++;
    }
    if (n) {
      paintList();
      paintCount();
      emit();
    }
    return n;
  }

  return { render, clearAir, markRead, external, showExternal, toggleExternal, showExternalQr, hideQr, clearSource, items, makeItem, subscribe, get unread() { return unread; }, get airId() { return airMsg; } };
}
