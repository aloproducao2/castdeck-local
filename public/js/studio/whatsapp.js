// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// WhatsApp local (Baileys): QR de conexão, QR do público (wa.me), inbox, áudio e fila do programa.
// O bridge é experimental; nada é enviado automaticamente e o host sempre aprova o que vai ao ar.
import { $, esc, icons, toast, confirmDialog } from '../ui.js';
import { makeQR } from './qr.js';

const fmtTime = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const kindLabel = { text: 'Texto', image: 'Imagem', audio: 'Áudio', video: 'Vídeo', document: 'Arquivo', sticker: 'Figurinha', unsupported: 'Mídia' };
const PUBLIC_TEXT = 'Mande sua mensagem para o programa';

function drawQr(canvas, text) {
  if (!canvas || !text) return;
  let q;
  try {
    q = makeQR(text, 'M');
  } catch {
    return;
  }
  const quiet = 4;
  const size = q.size + quiet * 2;
  const scale = Math.max(1, Math.floor(280 / size));
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#08080e';
  for (let y = 0; y < q.size; y++) {
    for (let x = 0; x < q.size; x++) {
      if (q.modules[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    }
  }
}

export function createWhatsApp({ S, api, modal, messages }) {
  let open = false;
  let panel = null;
  let busy = false;
  let wa = { status: 'off', qr: null, messages: [], chats: [], account: null, error: null };
  let chatFilter = 'all';
  let search = '';
  let publicOn = false;
  let railView = 'chats';
  let pollFails = 0;
  let typeFilter = 'all';
  const seenInbox = new Set();
  const preview = { audio: null, id: null, name: '', playing: false };
  const fmtAudioTime = (s) => `${Math.floor((Number(s) || 0) / 60)}:${String(Math.floor((Number(s) || 0) % 60)).padStart(2, '0')}`;

  const msgList = () => (wa.messages || []).slice().sort((a, b) => b.at - a.at);
  const chats = () => {
    const map = new Map();
    for (const c of wa.chats || []) map.set(c.id, c);
    for (const m of wa.messages || []) if (!map.has(m.chatId)) map.set(m.chatId, { id: m.chatId, name: m.chatName || m.name, group: m.group, at: m.at });
    return [...map.values()].sort((a, b) => (b.at || 0) - (a.at || 0));
  };
  const waItems = () => messages?.items?.({ source: 'whatsapp' }) || [];
  const panelVisible = () => S.tab === 'whatsapp' || !!window.__castdeck?.floatWins?.has?.('whatsapp');

  function filteredItems() {
    const q = search.toLowerCase();
    return waItems().filter((m) => {
      if (chatFilter !== 'all' && m.sender !== chatFilter) return false;
      if (typeFilter === 'audio' && !m.audio) return false;
      if (typeFilter === 'text' && m.audio) return false;
      return !q || `${m.name || ''} ${m.text || ''}`.toLowerCase().includes(q);
    });
  }

  function listenLabel(m) {
    if (!m.src) return 'Áudio indisponível';
    if (preview.id !== m.id) return '▶ Ouvir';
    return preview.playing ? '⏸ Pausar' : '▶ Retomar';
  }

  function decorateCard(m, el) {
    if (!m.audio) return el;
    const native = el.querySelector('audio.msg-au');
    if (!native) return el;
    native.remove();
    const acts = el.querySelector('.wg-acts');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn sm wa-listen';
    b.dataset.waListen = m.id;
    b.textContent = listenLabel(m);
    b.disabled = !m.src;
    b.title = m.src ? 'Ouvir só no seu computador, sem ir ao ar' : 'Áudio não disponível';
    b.onclick = (e) => {
      e.stopPropagation();
      if (preview.id === m.id) togglePreview();
      else startPreview(m);
    };
    acts?.prepend(b);
    return el;
  }

  function refreshListenButtons() {
    document.querySelectorAll('[data-wa-listen]').forEach((b) => {
      const m = waItems().find((x) => x.id === b.dataset.waListen);
      if (!m) return;
      b.textContent = listenLabel(m);
      b.disabled = !m.src;
    });
  }

  function paintPreviewInto(el) {
    if (!el) return;
    if (!preview.audio || !preview.id) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    if (el.dataset.pvId !== preview.id || !el.querySelector('.wa-preview-card')) {
      el.dataset.pvId = preview.id;
      el.innerHTML = `<div class="wa-preview-card">
        <button class="btn sm icon" data-pv-toggle title="Ouvir/Pausar">${preview.playing ? '⏸' : '▶'}</button>
        <div class="wa-pv-meta"><b>${esc(preview.name || 'Áudio do WhatsApp')}</b><small>Ouvindo só no seu PC · não vai ao ar</small></div>
        <input type="range" class="wa-pv-range" min="0" max="1000" value="0" title="Posição do áudio">
        <span class="wa-pv-time">0:00</span>
        <button class="btn sm ghost icon" data-pv-stop title="Parar">✕</button>
      </div>`;
      el.querySelector('[data-pv-toggle]').onclick = togglePreview;
      el.querySelector('[data-pv-stop]').onclick = () => stopPreview();
      el.querySelector('.wa-pv-range').oninput = (e) => {
        if (!preview.audio || !Number.isFinite(preview.audio.duration)) return;
        preview.audio.currentTime = (Number(e.target.value) / 1000) * preview.audio.duration;
      };
    }
    const audio = preview.audio;
    const t = Number(audio.currentTime) || 0;
    const d = Number(audio.duration);
    const range = el.querySelector('.wa-pv-range');
    const time = el.querySelector('.wa-pv-time');
    const toggle = el.querySelector('[data-pv-toggle]');
    if (range && Number.isFinite(d) && d > 0) range.value = String(Math.round((t / d) * 1000));
    if (time) time.textContent = `${fmtAudioTime(t)}${Number.isFinite(d) && d > 0 ? ' / ' + fmtAudioTime(d) : ''}`;
    if (toggle) toggle.textContent = preview.playing ? '⏸' : '▶';
  }

  function paintPreviewDocks() {
    paintPreviewInto(panel?.querySelector('#wa-preview'));
    paintPreviewInto(document.querySelector('#wa-preview-panel'));
  }

  function startPreview(m) {
    if (!m?.src) return toast('Áudio do WhatsApp indisponível.', 'err');
    if (preview.audio) preview.audio.pause();
    const a = new Audio(m.src);
    a.preload = 'metadata';
    preview.audio = a;
    preview.id = m.id;
    preview.name = m.name || m.chatName || 'Áudio do WhatsApp';
    preview.playing = false;
    a.onplay = () => { preview.playing = true; paintPreviewDocks(); refreshListenButtons(); };
    a.onpause = () => { preview.playing = false; paintPreviewDocks(); refreshListenButtons(); };
    a.onended = () => { preview.playing = false; paintPreviewDocks(); refreshListenButtons(); };
    a.ontimeupdate = () => paintPreviewDocks();
    a.onerror = () => {
      preview.playing = false;
      paintPreviewDocks();
      refreshListenButtons();
      toast('Não foi possível tocar este áudio do WhatsApp.', 'err');
    };
    a.play().catch(() => {
      preview.playing = false;
      paintPreviewDocks();
      refreshListenButtons();
      toast('Toque em ▶ para ouvir este áudio.', 'err');
    });
    paintPreviewDocks();
    refreshListenButtons();
  }

  function togglePreview() {
    if (!preview.audio) return;
    if (preview.audio.paused) preview.audio.play().catch(() => {});
    else preview.audio.pause();
  }

  function stopPreview() {
    if (preview.audio) {
      preview.audio.pause();
      preview.audio = null;
    }
    preview.id = null;
    preview.name = '';
    preview.playing = false;
    document.querySelectorAll('[data-wa-listen]').forEach((b) => {
      const m = waItems().find((x) => x.id === b.dataset.waListen);
      if (m) b.textContent = listenLabel(m);
    });
    paintPreviewDocks();
  }

  function paintFilterButtons() {
    document.querySelectorAll('[data-wa-filter]').forEach((b) => b.classList.toggle('active', b.dataset.waFilter === typeFilter));
  }

  function setTypeFilter(v) {
    typeFilter = v || 'all';
    paintFilterButtons();
    if (open) renderList();
    if (panelVisible()) updatePanelCards();
  }

  const phone = () => String(wa.account?.phone || '').replace(/\D/g, '');
  const publicUrl = () => (phone() ? `https://wa.me/${phone()}?text=${encodeURIComponent(PUBLIC_TEXT)}` : '');

  function statusPill() {
    const labels = { off: 'Desconectado', qr: 'Aguardando QR', connecting: 'Conectando', connected: 'Conectado', error: 'Erro', 'logged-out': 'Sessão encerrada' };
    const kind = wa.status === 'connected' ? 'ok' : wa.status === 'qr' || wa.status === 'connecting' ? 'warn' : wa.status === 'error' ? 'err' : '';
    return `<span class="wa-pill ${kind}"><i></i>${labels[wa.status] || wa.status}</span>`;
  }

  // Todas as mensagens novas entram também na aba Mensagens, com badge WhatsApp. Não vão ao ar.
  function ingestInbox() {
    if (!messages?.external) return;
    for (const m of msgList().slice().reverse()) {
      if (seenInbox.has(m.id)) continue;
      seenInbox.add(m.id);
      if (!m.text && !m.audio && !m.mediaUrl) continue;
      messages.external({
        id: `wa:${m.id}`,
        chatId: m.chatId,
        name: m.name || m.chatName || 'WhatsApp',
        chatName: m.chatName || '',
        text: m.text || '',
        dur: m.dur || 0,
        audio: !!m.audio,
        src: m.mediaUrl || '',
        at: m.at,
        source: 'whatsapp',
      });
    }
  }

  function detach() {
    const fw = window.__castdeck?.floatWins;
    if (!fw) return toast('Recurso de janela separada indisponível.', 'err');
    if (fw.has('whatsapp')) fw.raise('whatsapp');
    else fw.open('whatsapp');
  }

  async function clearReceived() {
    if (!(await confirmDialog('Apagar todas as mensagens recebidas do WhatsApp?\n\nO histórico e os áudios locais serão removidos. A conexão continua.', { ok: 'Limpar mensagens', danger: true }))) return;
    try {
      await api('/whatsapp/messages', { method: 'DELETE' });
      seenInbox.clear();
      stopPreview();
      messages?.clearSource?.('whatsapp');
      await poll();
      toast('Mensagens recebidas do WhatsApp foram apagadas', 'ok');
    } catch (e) {
      toast('WhatsApp: ' + (e.message || e.name), 'err');
    }
  }

  function togglePublicQr() {
    const url = publicUrl();
    if (!url) return toast('Conecte o WhatsApp para gerar o QR do público.', 'err');
    publicOn = !publicOn;
    if (publicOn) messages?.showExternalQr?.(url, PUBLIC_TEXT);
    else messages?.hideQr?.();
    if (open) renderPublic();
    renderPanel();
  }

  function shell() {
    return `<div class="wa-modal">
      <header class="wa-head">
        <span class="wa-ico">${icons.whatsapp}</span>
        <div class="wa-heading">
          <span class="wa-eyebrow">INTERATIVIDADE · BRIDGE LOCAL</span>
          <h3>WhatsApp</h3>
          <p>Receba mensagens no estúdio e escolha o que vai ao ar.</p>
        </div>
        <div class="wa-head-r">${statusPill()}<button type="button" class="wa-icon-btn" id="wa-refresh" title="Atualizar">↻</button></div>
      </header>
      <div class="wa-layout">
        <aside class="wa-rail">
          <div class="wa-rail-tabs">
            <button type="button" data-rail="chats" class="${railView === 'chats' ? 'active' : ''}">Conversas <b id="wa-rail-chat-count"></b></button>
            <button type="button" data-rail="conn" class="${railView === 'conn' ? 'active' : ''}">Conexão</button>
          </div>
          <div class="wa-rail-pane ${railView === 'conn' ? 'active' : ''}" id="wa-pane-conn">
            <div class="wa-account" id="wa-account"></div>
            <div class="wa-qr-wrap" id="wa-qr-wrap"></div>
            <div class="wa-rail-actions" id="wa-rail-actions"></div>
            <div class="wa-public" id="wa-public"></div>
          </div>
          <div class="wa-rail-pane ${railView === 'chats' ? 'active' : ''}" id="wa-pane-chats">
            <div class="wa-rail-title">CONVERSAS</div>
            <div class="wa-chats" id="wa-chats"></div>
          </div>
        </aside>
        <section class="wa-inbox">
          <div class="wa-inbox-head">
            <div><span class="wa-kicker">CAIXA DE ENTRADA</span><b id="wa-count"></b></div>
            <input class="input wa-search" id="wa-search" placeholder="Buscar mensagem ou contato" autocomplete="off">
          </div>
          <div class="wa-filterbar">
            <button type="button" data-wa-filter="all" class="${typeFilter === 'all' ? 'active' : ''}">Todos</button>
            <button type="button" data-wa-filter="text" class="${typeFilter === 'text' ? 'active' : ''}">Texto</button>
            <button type="button" data-wa-filter="audio" class="${typeFilter === 'audio' ? 'active' : ''}">Áudios</button>
          </div>
          <div class="wa-list wa-cards" id="wa-list"></div>
          <div class="wa-preview" id="wa-preview" hidden></div>
        </section>
      </div>
      <footer class="wa-foot">
        <span class="wa-warning">Experimental · WhatsApp Web não oficial · risco de banimento · nada vai ao ar sem aprovação</span>
        <button class="btn sm ghost" id="wa-detach" title="Abrir este painel em uma janela separada, para outro monitor">⧉ Outra janela</button>
        <button class="btn sm danger" id="wa-clear">Limpar recebidas</button>
        <button class="btn" data-close>Fechar</button>
      </footer>
    </div>`;
  }

  function renderAccount() {
    const el = panel?.querySelector('#wa-account');
    if (!el) return;
    const acct = wa.account;
    const showError = (wa.status === 'error' || wa.status === 'logged-out') && wa.error;
    el.innerHTML = `<div class="wa-account-top"><span class="wa-dot ${wa.status === 'connected' ? 'on' : ''}"></span><b>${wa.status === 'connected' ? esc(acct?.name || 'WhatsApp conectado') : wa.status === 'qr' ? 'Leia o QR Code' : 'Bridge local'}</b></div>
      <small>${wa.status === 'connected' ? esc(acct?.phone || 'número conectado') : 'Baileys · sem API oficial'}</small>
      ${showError ? `<p class="wa-error">${esc(wa.error)}</p>` : ''}`;
  }

  function renderQr() {
    const el = panel?.querySelector('#wa-qr-wrap');
    if (!el) return;
    if (wa.status === 'qr' && wa.qr) {
      el.innerHTML = `<div class="wa-qr"><canvas id="wa-qr-cv"></canvas><small>WhatsApp → Aparelhos conectados → Conectar aparelho</small></div>`;
      drawQr(el.querySelector('#wa-qr-cv'), wa.qr);
    } else if (wa.status === 'connected') {
      el.innerHTML = `<div class="wa-connected"><span class="wa-big-dot"></span><b>Conectado</b><small>Mensagens chegando no host</small></div>`;
    } else if (wa.status === 'connecting') {
      el.innerHTML = `<div class="wa-connecting"><span class="wa-spin"></span>Preparando o bridge…</div>`;
    } else {
      el.innerHTML = `<div class="wa-off"><span class="wa-off-ico">${icons.chat}</span><b>WhatsApp desconectado</b><small>Conecte um número de teste. Use somente leitura.</small></div>`;
    }
  }

  function renderActions() {
    const el = panel?.querySelector('#wa-rail-actions');
    if (!el) return;
    if (wa.status === 'connected') {
      el.innerHTML = `<button class="btn sm" id="wa-disconnect">Desconectar</button><button class="btn sm ghost" id="wa-logout">Sair da sessão</button>`;
    } else if (wa.status === 'qr' || wa.status === 'connecting') {
      el.innerHTML = `<button class="btn sm ghost" id="wa-disconnect">Cancelar</button>`;
    } else {
      el.innerHTML = `<button class="btn primary sm" id="wa-connect">Conectar WhatsApp</button>`;
    }
    el.querySelector('#wa-connect')?.addEventListener('click', () => act(() => api('/whatsapp/connect', { method: 'POST' })));
    el.querySelector('#wa-disconnect')?.addEventListener('click', () => act(() => api('/whatsapp/disconnect', { method: 'POST' })));
    el.querySelector('#wa-logout')?.addEventListener('click', async () => {
      if (!(await confirmDialog('Desconectar este WhatsApp e apagar a sessão local?\n\nVocê precisará ler um novo QR Code.', { ok: 'Sair da sessão', danger: true }))) return;
      act(() => api('/whatsapp/logout', { method: 'POST' }));
    });
  }

  function renderPublic() {
    const el = panel?.querySelector('#wa-public');
    if (!el) return;
    const url = publicUrl();
    if (!url) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `<div class="wa-public-card"><span class="wa-kicker">QR DO PÚBLICO</span><canvas id="wa-pub-cv"></canvas><b>Mande sua mensagem</b><small>Aponte a câmera: abre a conversa no WhatsApp conectado.</small><button class="btn sm ${publicOn ? 'danger' : 'primary'}" id="wa-pub-toggle">${publicOn ? 'Tirar QR do ar' : 'Mostrar no programa'}</button></div>`;
    drawQr(el.querySelector('#wa-pub-cv'), url);
    el.querySelector('#wa-pub-toggle').onclick = togglePublicQr;
  }

  function renderChats() {
    const el = panel?.querySelector('#wa-chats');
    if (!el) return;
    const all = waItems();
    const list = chats();
    el.innerHTML = list.length
      ? `<button class="wa-chat ${chatFilter === 'all' ? 'active' : ''}" data-chat="all"><span>Todas</span><b>${all.length}</b></button>` +
        list.map((c) => `<button class="wa-chat ${chatFilter === c.id ? 'active' : ''}" data-chat="${esc(c.id)}"><span>${c.group ? '▣ ' : ''}${esc(c.name || c.id)}</span><b>${all.filter((m) => m.sender === c.id).length}</b></button>`).join('')
      : `<p class="wa-muted">As conversas aparecem quando chegarem mensagens.</p>`;
    for (const b of el.querySelectorAll('[data-chat]')) b.onclick = () => { chatFilter = b.dataset.chat; renderChats(); renderList(); };
  }

  function renderList() {
    const panelEl = panel?.querySelector('#wa-list');
    if (!panelEl) return;
    const list = filteredItems();
    const count = panel?.querySelector('#wa-count');
    if (count) count.textContent = `${list.length} mensagem${list.length === 1 ? '' : 's'}`;
    paintFilterButtons();
    if (!list.length) {
      const empty = typeFilter === 'audio' ? 'Nenhum áudio neste filtro.' : typeFilter === 'text' ? 'Nenhum texto neste filtro.' : 'Nenhuma mensagem aqui.';
      panelEl.innerHTML = `<div class="wa-empty"><span>${icons.inbox}</span><b>${empty}</b><small>${waItems().length ? 'Troque o filtro ou a conversa.' : 'Quando alguém mandar uma mensagem, ela aparece nesta lista.'}</small></div>`;
      paintPreviewDocks();
      return;
    }
    panelEl.replaceChildren(...list.map((m) => decorateCard(m, messages.makeItem(m))));
    paintPreviewDocks();
  }

  function renderRail() {
    if (!panel) return;
    panel.querySelectorAll('[data-rail]').forEach((b) => b.classList.toggle('active', b.dataset.rail === railView));
    panel.querySelector('#wa-pane-chats')?.classList.toggle('active', railView === 'chats');
    panel.querySelector('#wa-pane-conn')?.classList.toggle('active', railView === 'conn');
    const count = panel.querySelector('#wa-rail-chat-count');
    if (count) count.textContent = waItems().length ? String(waItems().length) : '';
  }

  function render() {
    if (!panel) return;
    renderRail();
    renderAccount();
    renderQr();
    renderActions();
    renderPublic();
    renderChats();
    renderList();
    const pillHost = panel.querySelector('.wa-head-r .wa-pill');
    if (pillHost) pillHost.outerHTML = statusPill();
  }

  async function poll() {
    if (busy) return;
    busy = true;
    try {
      const next = await api('/whatsapp/status');
      if (next) {
        pollFails = 0;
        const before = `${wa.messages?.length}|${wa.status}|${wa.qr || ''}|${wa.chats?.length}`;
        const prevStatus = wa.status;
        wa = next;
        if (open && prevStatus !== wa.status) railView = wa.status === 'connected' ? 'chats' : wa.status === 'qr' || wa.status === 'off' ? 'conn' : railView;
        const after = `${wa.messages?.length}|${wa.status}|${wa.qr || ''}|${wa.chats?.length}`;
        const changed = before !== after;
        if (publicOn && !publicUrl()) {
          publicOn = false;
          messages?.hideQr?.();
        }
        ingestInbox();
        if (open && (changed || !panel?.querySelector('#wa-list')?.childElementCount)) render();
        // Não reconstrói o painel a cada 1,8 s: isso engolia cliques e reiniciava a sensação de foco.
        if (panelVisible() && (changed || !document.querySelector('#panel-whatsapp .wa-panel-head'))) renderPanel();
      }
    } catch (e) {
      pollFails += 1;
      // falha passageira no começo não deve aparecer como "Erro": só após 3 tentativas seguidas
      if (pollFails >= 3) {
        wa = { ...wa, status: 'error', error: e.message || 'Bridge indisponível' };
        if (open) render();
        if (panelVisible()) renderPanel();
      } else if (open) {
        render();
      }
    } finally {
      busy = false;
    }
  }

  async function act(fn) {
    try {
      await fn();
      await poll();
    } catch (e) {
      toast('WhatsApp: ' + (e.message || e.name), 'err');
    }
  }

  // ---------- aba lateral Interatividade → WhatsApp ----------
  function updatePanelCards() {
    const p = $('#panel-whatsapp');
    if (!p) return;
    const cards = p.querySelector('#wa-panel-cards');
    if (!cards) return;
    const list = filteredItems();
    const count = p.querySelector('#wa-panel-count');
    if (count) count.textContent = String(list.length);
    const chatsWith = p.querySelector('#wa-panel-chat');
    if (chatsWith && chatsWith.value !== chatFilter) chatsWith.value = chatFilter;
    paintFilterButtons();
    if (!list.length) {
      const empty = typeFilter === 'audio' ? 'Nenhum áudio neste filtro.' : typeFilter === 'text' ? 'Nenhum texto neste filtro.' : 'Nenhuma mensagem ainda.';
      cards.innerHTML = `<div class="wa-empty"><span>${icons.inbox}</span><b>${empty}</b><small>${waItems().length ? 'Troque o filtro, a conversa ou a busca.' : 'As mensagens aparecem aqui quando chegarem.'}</small></div>`;
      paintPreviewDocks();
      return;
    }
    cards.replaceChildren(...list.slice(0, 60).map((m) => decorateCard(m, messages.makeItem(m))));
    paintPreviewDocks();
  }

  function renderPanel() {
    const p = $('#panel-whatsapp');
    if (!p) return;
    // Nunca deixa o painel do WhatsApp aparecer dentro de Mídia/Banners/etc.
    if (!panelVisible()) {
      p.classList.remove('active');
      return;
    }
    const url = publicUrl();
    const isPopout = !!p.closest('.pop-body') || !!p.closest('.fw');
    const oldSearch = p.querySelector('#wa-panel-search');
    const hadSearchFocus = document.activeElement === oldSearch;
    const caret = oldSearch?.selectionStart ?? null;
    const chatList = chats();
    const audioCount = waItems().filter((m) => m.audio).length;
    p.innerHTML = `
      <div class="wa-panel-head">
        <div><span class="wa-kicker">BRIDGE LOCAL · EXPERIMENTAL</span><h4>WhatsApp <span class="wa-head-count">${audioCount ? `🎧 ${audioCount}` : ''}</span></h4><small>${wa.status === 'connected' ? `Conectado${wa.account?.phone ? ` · ${esc(wa.account.phone)}` : ''}` : wa.status === 'qr' ? 'Aguardando leitura do QR' : wa.status === 'connecting' ? 'Conectando…' : wa.status === 'error' ? 'Erro no bridge' : 'Desconectado'}</small></div>
        ${statusPill()}
      </div>
      <div class="wa-panel-actions">
        ${wa.status === 'connected'
          ? `<button class="btn sm" id="wp-disconnect">Desconectar</button>${isPopout ? '' : '<button class="btn sm ghost" id="wp-modal">Abrir caixa de entrada</button>'}`
          : wa.status === 'qr' || wa.status === 'connecting'
            ? '<button class="btn sm ghost" id="wp-disconnect">Cancelar</button>'
            : `<button class="btn sm primary" id="wp-connect">Conectar WhatsApp</button>${isPopout ? '' : '<button class="btn sm ghost" id="wp-modal">Abrir painel</button>'}`}
        ${isPopout ? '' : '<button class="btn sm ghost" id="wp-detach" title="Abrir em outra janela/monitor">⧉ Outra janela</button>'}
        <button class="btn sm ghost" id="wp-clear" title="Apagar mensagens recebidas do WhatsApp">Limpar</button>
      </div>
      ${wa.status === 'qr' && wa.qr ? `<div class="wa-panel-card wa-panel-qr"><canvas id="wa-panel-conn-qr"></canvas><small>WhatsApp → Aparelhos conectados</small></div>` : ''}
      ${url ? `<details class="wa-panel-details" ${publicOn ? 'open' : ''}><summary>QR do público · mostrar no programa</summary><div class="wa-panel-public"><canvas id="wa-panel-pub-qr"></canvas><div class="wa-panel-public-txt"><b>Mande sua mensagem</b><small>O público lê e cai no WhatsApp conectado.</small><button class="btn sm ${publicOn ? 'danger' : 'primary'}" id="wp-public-toggle">${publicOn ? 'Tirar do ar' : 'Mostrar no programa'}</button></div></div></details>` : ''}
      <div class="wa-panel-tools">
        <input class="input" id="wa-panel-search" value="${esc(search)}" placeholder="Buscar mensagem ou contato" autocomplete="off">
        <div class="wa-panel-filters">
          <button type="button" data-wa-filter="all" class="${typeFilter === 'all' ? 'active' : ''}">Todos</button>
          <button type="button" data-wa-filter="text" class="${typeFilter === 'text' ? 'active' : ''}">Texto</button>
          <button type="button" data-wa-filter="audio" class="${typeFilter === 'audio' ? 'active' : ''}">Áudios</button>
        </div>
        <select class="input" id="wa-panel-chat" title="Filtrar por conversa">
          <option value="all">Todas as conversas</option>
          ${chatList.map((c) => `<option value="${esc(c.id)}" ${chatFilter === c.id ? 'selected' : ''}>${c.group ? '▣ ' : ''}${esc(c.name || c.id)}</option>`).join('')}
        </select>
        <button class="btn sm ghost icon" id="wp-refresh" title="Atualizar">↻</button>
      </div>
      <div class="wa-panel-title">MENSAGENS WHATSAPP <b id="wa-panel-count">0</b></div>
      <div class="wa-panel-list wa-panel-cards" id="wa-panel-cards"></div>
      <div class="wa-preview" id="wa-preview-panel" hidden></div>`;
    if (wa.status === 'qr' && wa.qr) drawQr(p.querySelector('#wa-panel-conn-qr'), wa.qr);
    if (url) drawQr(p.querySelector('#wa-panel-pub-qr'), url);
    updatePanelCards();
    p.querySelector('#wa-panel-search')?.addEventListener('input', (e) => {
      search = e.target.value.trim();
      updatePanelCards();
    });
    p.querySelector('#wa-panel-chat')?.addEventListener('change', (e) => {
      chatFilter = e.target.value;
      if (open) renderChats();
      updatePanelCards();
    });
    p.querySelectorAll('[data-wa-filter]').forEach((b) => {
      b.onclick = () => setTypeFilter(b.dataset.waFilter);
    });
    p.querySelector('#wp-connect')?.addEventListener('click', () => act(() => api('/whatsapp/connect', { method: 'POST' })));
    p.querySelector('#wp-disconnect')?.addEventListener('click', () => act(() => api('/whatsapp/disconnect', { method: 'POST' })));
    p.querySelector('#wp-modal')?.addEventListener('click', openPanel);
    p.querySelector('#wp-detach')?.addEventListener('click', detach);
    p.querySelector('#wp-clear')?.addEventListener('click', clearReceived);
    p.querySelector('#wp-public-toggle')?.addEventListener('click', togglePublicQr);
    p.querySelector('#wp-refresh')?.addEventListener('click', poll);
    if (hadSearchFocus) {
      const input = p.querySelector('#wa-panel-search');
      input?.focus();
      if (input && caret != null) input.setSelectionRange(caret, caret);
    }
  }

  function openPanel() {
    if (open) return;
    open = true;
    railView = wa.status === 'connected' ? 'chats' : 'conn';
    modal(shell(), {
      onMount: (m) => {
        panel = m;
        const searchEl = m.querySelector('#wa-search');
        searchEl.oninput = () => { search = searchEl.value.trim(); renderList(); };
        m.querySelectorAll('[data-rail]').forEach((b) => {
          b.onclick = () => {
            railView = b.dataset.rail;
            renderRail();
          };
        });
        m.querySelectorAll('[data-wa-filter]').forEach((b) => {
          b.onclick = () => setTypeFilter(b.dataset.waFilter);
        });
        m.querySelector('#wa-refresh').onclick = poll;
        m.querySelector('#wa-detach')?.addEventListener('click', detach);
        m.querySelector('#wa-clear')?.addEventListener('click', clearReceived);
        render();
        poll();
      },
    })
      .catch(() => {})
      .finally(() => {
        open = false;
        panel = null;
        stopPreview();
      });
  }

  // Os cartões do WhatsApp são os mesmos da aba Mensagens; quando um controle muda o estado,
  // a outra superfície é atualizada (No ar, Tirar do ar, áudio, bloquear, apagar).
  const unsubMessages = messages?.subscribe?.(() => {
    if (preview.id && !waItems().some((m) => m.id === preview.id)) stopPreview();
    if (open && panel) {
      renderChats();
      renderList();
    }
    if (panelVisible()) renderPanel();
  });

  // O poll começa junto com o estúdio: as mensagens entram na aba Mensagens mesmo com a modal fechada.
  const boot = setInterval(poll, 1800);
  poll();
  window.addEventListener('beforeunload', () => {
    clearInterval(boot);
    unsubMessages?.();
  });

  return { open: openPanel, renderPanel, poll, get status() { return wa.status; } };
}
