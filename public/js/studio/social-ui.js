// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Aba "Redes": agrega chat simultâneo de YouTube, Twitch e outras plataformas,
// com moderação detalhada, rolagem estável sem pular, duplo clique e popout destacável.
import { SSNClient, normalizeMessage, cleanSession, normalizeServer, SSN_DEFAULT_SERVER, renderMessageHtml } from './social.js';
import { platformOf } from './overlays.js';
import { api, confirmDialog } from '../ui.js';

const KEY = 'castdeck.social';
const DEFAULTS = {
  session: '',
  server: SSN_DEFAULT_SERVER,
  followDock: true,
  listenChat: true,
  connected: false,
  auto: false,
  autoSequence: false,
  autoDur: 8,
  dur: 8,
  feedOn: false,
  feedMax: 5,
  feedTtl: 20,
  pos: 'bottom',
  avatars: true,
  hideCommands: true,
  onlyDonations: false,
  slowMode: 0, // 0 = tempo real, 1 = 1s, 2 = 2s, 3 = 3s, 5 = 5s, -1 = só doações
  antiSpam: true,
  autoSuperChat: true,
  superChatDur: 8,
  hidden: [],
  filterTab: 'all',
  searchQuery: '',
  focusMode: false,
  density: 'normal',
  accOpen: { sources: true, config: false, tools: false },
};

const load = () => {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      ...DEFAULTS,
      ...data,
      accOpen: { ...DEFAULTS.accOpen, ...(data.accOpen || {}) },
    };
  } catch {
    return { ...DEFAULTS, accOpen: { ...DEFAULTS.accOpen } };
  }
};

export function createSocial({ getComp, toast, h, esc, $, $$, onVote }) {
  const st = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(st));
  const msgs = [];
  const seen = new Set();
  const recentHashes = new Map(); // anti-spam
  const queue = [];
  const superChatQueue = []; // fila prioritária de Super Chats / doações
  const status = { dock: 'idle', chat: 'idle' };
  let clients = [];
  let featuredId = null;
  let currentFeatured = null;
  let featTimer = null;
  let panel = null;
  let listTimer = null;
  let lastChatAt = 0;
  let lastThrottleAt = 0;

  // Controle de rolagem estável (não pula nem se mexe sozinho)
  let isScrollLocked = false;
  let isUserBrowsing = false;
  let unreadWhilePaused = 0;

  // Fontes conectadas no backend (YouTube, Twitch, etc.)
  let activeSources = [];
  let localWs = null;

  const comp = () => getComp();
  const applyOpts = () => comp()?.setSocialOpts({ pos: st.pos, feedOn: st.feedOn, feedMax: st.feedMax, feedTtl: st.feedTtl, avatars: st.avatars });

  // ---------- exibição no PGM ----------
  function showFeatured(m, dur = 0, isAutoSuperChat = false) {
    clearTimeout(featTimer);
    comp()?.showFeatured(m);
    featuredId = m.id;
    currentFeatured = m;

    // Avisa o servidor e as janelas popout conectadas
    if (localWs?.readyState === WebSocket.OPEN) {
      localWs.send(JSON.stringify({ type: 'feature', message: m }));
    }

    if (dur > 0) {
      featTimer = setTimeout(() => {
        hide();
        setTimeout(() => {
          if (isAutoSuperChat && superChatQueue.length) {
            checkSuperChatQueue();
          } else if (st.autoSequence || isAutoSuperChat) {
            next();
          }
        }, 700);
      }, dur * 1000);
    }
    refreshOnAirBanner();
    updateOnAirCards();
    updateQueueButtons();
  }

  function hide() {
    clearTimeout(featTimer);
    comp()?.hideFeatured();
    featuredId = null;
    currentFeatured = null;

    if (localWs?.readyState === WebSocket.OPEN) {
      localWs.send(JSON.stringify({ type: 'hide' }));
    }
    refreshOnAirBanner();
    updateOnAirCards();
  }

  function toggleFeatured(m) {
    if (featuredId === m.id) {
      hide();
    } else {
      showFeatured(m, 0);
    }
  }

  function next(force = false) {
    if (featuredId && !force) return;
    clearTimeout(featTimer);

    if (superChatQueue.length) {
      checkSuperChatQueue();
      return;
    }

    if (!queue.length) {
      if (featuredId && force) hide();
      return;
    }

    const m = queue.shift();
    if (localWs?.readyState === WebSocket.OPEN) {
      localWs.send(JSON.stringify({ type: 'queue-remove', id: m.id }));
    }
    const dur = Math.max(2, st.autoDur || st.dur || 8);
    showFeatured(m, dur);
    updateFilterCounts();
    updateQueueButtons();
    if (st.filterTab === 'queue') refreshList();
  }

  function checkSuperChatQueue() {
    if (featuredId || !superChatQueue.length) return;
    const m = superChatQueue.shift();
    showFeatured(m, Math.max(3, st.superChatDur || 8), true);
  }

  function addToQueue(m, broadcast = true) {
    if (!m || !m.id) return;
    const exists = queue.some((x) => x.id === m.id);
    if (!exists) {
      queue.push(m);
      if (queue.length > 200) queue.shift();
      if (broadcast && localWs?.readyState === WebSocket.OPEN) {
        localWs.send(JSON.stringify({ type: 'queue-add', message: m }));
      }
      updateFilterCounts();
      updateQueueButtons();
      if (st.filterTab === 'queue') refreshList();
      if ((st.autoSequence || st.auto) && !featuredId) next();
    }
  }

  function removeFromQueue(id, broadcast = true) {
    const idx = queue.findIndex((x) => x.id === id);
    if (idx !== -1) {
      queue.splice(idx, 1);
      if (broadcast && localWs?.readyState === WebSocket.OPEN) {
        localWs.send(JSON.stringify({ type: 'queue-remove', id }));
      }
      updateFilterCounts();
      updateQueueButtons();
      if (st.filterTab === 'queue') refreshList();
    }
  }

  function toggleQueue(m) {
    if (queue.some((x) => x.id === m.id)) {
      removeFromQueue(m.id, true);
      toast('Removida da fila');
    } else {
      addToQueue(m, true);
      toast(`Adicionada à fila (${queue.length})`, 'ok');
    }
  }

  function clearQueue(broadcast = true) {
    queue.length = 0;
    if (broadcast && localWs?.readyState === WebSocket.OPEN) {
      localWs.send(JSON.stringify({ type: 'queue-clear' }));
    }
    updateFilterCounts();
    updateQueueButtons();
    if (st.filterTab === 'queue') refreshList();
    toast('Fila de reprodução limpa');
  }

  function updateQueueButtons() {
    if (!panel) return;
    const cards = $$('.soc-msg', panel);
    const queueIds = new Set(queue.map((m) => m.id));
    for (const c of cards) {
      const qBtn = $('[data-act="queue"]', c);
      if (qBtn) {
        const inQ = queueIds.has(c.dataset.id);
        qBtn.classList.toggle('in-queue', inQ);
        qBtn.innerHTML = inQ ? '✓ Na fila' : '+ Fila';
        qBtn.title = inQ ? 'Remover esta mensagem da fila' : 'Adicionar à fila de exibição';
      }
    }
  }

  function clearAll() {
    queue.length = 0;
    superChatQueue.length = 0;
    hide();
    updateFilterCounts();
    updateQueueButtons();
    if (st.filterTab === 'queue') refreshList();
  }

  // Deleta todas as mensagens associadas a uma rede específica (ao desconectar a rede)
  function deleteMessagesForSource(sourceId, sourceType, broadcast = false) {
    if (!sourceId && !sourceType) return;
    let removed = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      const match = (sourceId && m.sourceId === sourceId) ||
                    (!m.sourceId && sourceType && m.type === sourceType);
      if (match) {
        seen.delete(m.id);
        msgs.splice(i, 1);
        removed++;
      }
    }

    for (let i = queue.length - 1; i >= 0; i--) {
      const m = queue[i];
      if ((sourceId && m.sourceId === sourceId) || (!m.sourceId && sourceType && m.type === sourceType)) {
        queue.splice(i, 1);
      }
    }
    for (let i = superChatQueue.length - 1; i >= 0; i--) {
      const m = superChatQueue[i];
      if ((sourceId && m.sourceId === sourceId) || (!m.sourceId && sourceType && m.type === sourceType)) {
        superChatQueue.splice(i, 1);
      }
    }

    if (currentFeatured) {
      if ((sourceId && currentFeatured.sourceId === sourceId) ||
          (!currentFeatured.sourceId && sourceType && currentFeatured.type === sourceType)) {
        hide();
      }
    }

    if (broadcast && localWs?.readyState === WebSocket.OPEN) {
      localWs.send(JSON.stringify({ type: 'clear-source', sourceId, sourceType }));
    }

    refreshList();
    updateFilterCounts();
    updateResumeFloat();
    if (removed > 0) {
      toast(`${removed} mensagem(ns) da rede removida(s)`, 'ok');
    }
  }

  // Limpa todas as mensagens recebidas de todas as redes, histórico e filas
  function clearAllMessages(broadcast = true) {
    msgs.length = 0;
    seen.clear();
    recentHashes.clear();
    queue.length = 0;
    superChatQueue.length = 0;
    unreadWhilePaused = 0;
    hide();
    refreshList();
    updateFilterCounts();
    updateResumeFloat();
    if (broadcast) {
      if (localWs?.readyState === WebSocket.OPEN) {
        localWs.send(JSON.stringify({ type: 'clear-all' }));
      }
      api('/social/clear-all', { method: 'POST' }).catch(() => {});
    }
  }

  // ---------- entrada de mensagens ----------
  function onDock(raw) {
    const m = normalizeMessage(raw);
    if (!m) return;
    if (m.clear) return hide();
    showFeatured(m, 0);
  }

  function onChat(raw) {
    const m = normalizeMessage(raw);
    if (!m || m.clear) return;
    addMessage(m);
  }

  function addMessage(m) {
    if (seen.has(m.id)) return;
    seen.add(m.id);
    if (seen.size > 800) seen.delete(seen.values().next().value);

    // Anti-Spam / Anti-Flood
    if (st.antiSpam && m.text) {
      const hash = `${m.name}:${m.text.toLowerCase().trim()}`;
      const now = Date.now();
      if (recentHashes.has(hash) && now - recentHashes.get(hash) < 12000) return;
      recentHashes.set(hash, now);
      if (recentHashes.size > 200) recentHashes.delete(recentHashes.keys().next().value);
    }

    // Redução de volume (Throttling / Slow Mode)
    const isDonation = !!m.donation;
    if (!isDonation) {
      if (st.slowMode === -1) return; // apenas doações
      if (st.slowMode > 0) {
        const now = Date.now();
        if (now - lastThrottleAt < st.slowMode * 1000) return;
        lastThrottleAt = now;
      }
    }

    lastChatAt = Date.now();
    try {
      onVote?.({ key: `${m.type || 'x'}:${m.name}`, text: m.text });
    } catch {}

    if (st.hideCommands && /^\s*[!/]/.test(m.text) && !m.donation) return;
    if (st.onlyDonations && !m.donation) return;

    msgs.push(m);
    if (msgs.length > 250) msgs.shift();

    if (st.hidden.includes(m.type)) {
      updateFilterCounts();
      return;
    }

    if (st.feedOn) comp()?.pushFeed(m);

    // Auto Super Chat prioritário
    if (st.autoSuperChat && isDonation) {
      if (!featuredId && !superChatQueue.length) {
        showFeatured(m, Math.max(3, st.superChatDur || 8), true);
      } else if (superChatQueue.length < 25) {
        superChatQueue.push(m);
      }
    } else if (st.autoSequence || st.auto) {
      if (!featuredId && !queue.length && !superChatQueue.length) {
        showFeatured(m, Math.max(2, st.autoDur || st.dur || 8));
      } else {
        addToQueue(m, true);
      }
    }

    updateFilterCounts();

    // Controle estrito de rolagem para a lista NÃO se mexer sozinha
    const list = panel ? $('#soc-list', panel) : null;
    if (isScrollLocked || isUserBrowsing) {
      unreadWhilePaused++;
      updateResumeFloat();
      // Não toca na lista enquanto o operador estiver lendo ou pausado!
    } else {
      appendOrRefresh(m);
    }
  }

  // Anexa suavemente ao final da lista sem reconstruir tudo
  function appendOrRefresh(m) {
    if (!panel) return;
    const list = $('#soc-list', panel);
    if (!list) return;

    // Se houver busca ou filtro ativo e a mensagem não se encaixar, ignora
    if (!matchesFilter(m)) return;

    // Remove mensagem de "vazio" se houver
    const emptyEl = $('.empty', list);
    if (emptyEl) emptyEl.remove();

    const el = msgEl(m);
    list.appendChild(el);

    // Limita número de elementos no DOM para manter 60fps
    while (list.children.length > 120) {
      list.removeChild(list.firstElementChild);
    }

    // Acompanha ao vivo no final
    list.scrollTop = list.scrollHeight;
  }

  function matchesFilter(m) {
    if (st.hidden.includes(m.type)) return false;
    if (st.filterTab === 'queue') {
      return queue.some((x) => x.id === m.id);
    }
    if (st.filterTab === 'donations' && !m.donation) return false;
    if (st.filterTab === 'youtube' && m.type !== 'youtube') return false;
    if (st.filterTab === 'twitch' && m.type !== 'twitch') return false;
    const q = (st.searchQuery || '').toLowerCase().trim();
    if (q) {
      const hitName = m.name?.toLowerCase().includes(q);
      const hitText = m.text?.toLowerCase().includes(q);
      const hitDon = m.donation?.toLowerCase().includes(q);
      if (!hitName && !hitText && !hitDon) return false;
    }
    return true;
  }

  function syncAutoInputs() {
    if (!panel) return;
    const chk = $('#soc-auto-seq', panel);
    const sel = $('#soc-auto-dur', panel);
    const wrap = $('#soc-auto-dur-wrap', panel);
    if (chk) chk.checked = !!st.autoSequence;
    if (sel && st.autoDur) sel.value = String(st.autoDur);
    if (wrap) wrap.style.display = st.autoSequence ? 'flex' : 'none';
  }

  // ---------- WebSocket Local & Sincronização Popout ----------
  function connectLocalStream() {
    if (localWs && (localWs.readyState === 0 || localWs.readyState === 1)) return;
    try {
      const ws = new WebSocket(`ws://${location.host}/social-stream`);
      localWs = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'get-state' }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'state') {
            activeSources = msg.sources || [];
            if (Array.isArray(msg.queue)) {
              queue.splice(0, queue.length, ...msg.queue);
            }
            if (typeof msg.autoSequence === 'boolean') st.autoSequence = msg.autoSequence;
            if (typeof msg.autoDur === 'number') st.autoDur = msg.autoDur;
            syncAutoInputs();
            refreshSourcesUI();
            if (msg.featured) {
              comp()?.showFeatured(msg.featured);
              featuredId = msg.featured.id;
              currentFeatured = msg.featured;
            }
            refreshOnAirBanner();
            updateOnAirCards();
            updateQueueButtons();
            updateFilterCounts();
          } else if (msg.type === 'sources') {
            activeSources = msg.sources || [];
            refreshSourcesUI();
          } else if (msg.type === 'queue-update') {
            if (Array.isArray(msg.queue)) {
              queue.splice(0, queue.length, ...msg.queue);
            }
            updateFilterCounts();
            updateQueueButtons();
            if (st.filterTab === 'queue') refreshList();
          } else if (msg.type === 'auto-config') {
            if (typeof msg.autoSequence === 'boolean') st.autoSequence = msg.autoSequence;
            if (typeof msg.autoDur === 'number') st.autoDur = msg.autoDur;
            syncAutoInputs();
            save();
          } else if (msg.type === 'next-sequence') {
            next(true);
          } else if (msg.type === 'clear-source') {
            deleteMessagesForSource(msg.sourceId, msg.sourceType, false);
          } else if (msg.type === 'clear-all') {
            clearAllMessages(false);
          } else if (msg.type === 'chat' && msg.message) {
            const m = normalizeMessage(msg.message);
            if (m) addMessage(m);
          } else if (msg.type === 'featured') {
            if (msg.message) {
              comp()?.showFeatured(msg.message);
              featuredId = msg.message.id;
              currentFeatured = msg.message;
            } else {
              comp()?.hideFeatured();
              featuredId = null;
              currentFeatured = null;
            }
            refreshOnAirBanner();
            updateOnAirCards();
            updateQueueButtons();
          }
        } catch {}
      };
      ws.onclose = () => {
        localWs = null;
        setTimeout(connectLocalStream, 3000);
      };
      ws.onerror = () => {};
    } catch {}
  }

  // ---------- Gerenciamento de Fontes ----------
  async function addSource(type, target) {
    if (!target) return toast('Informe o link ou canal da rede social', 'err');
    try {
      toast('Conectando à rede…', 'ok');
      await api('/social/sources', { method: 'POST', body: { type, target } });
      toast('Rede conectada com sucesso!', 'ok');
      loadSources();
    } catch (e) {
      toast(e.message || 'Erro ao conectar à rede', 'err');
    }
  }

  async function removeSource(id) {
    const s = activeSources.find((x) => x.id === id);
    const sType = s?.type;
    try {
      await api(`/social/sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
      deleteMessagesForSource(id, sType, false);
      toast('Rede desconectada', 'ok');
      loadSources();
    } catch (e) {
      toast(e.message || 'Erro ao remover rede', 'err');
    }
  }

  async function loadSources() {
    try {
      activeSources = await api('/social/sources');
      refreshSourcesUI();
    } catch {}
  }

  function refreshSourcesUI() {
    if (!panel) return;
    const box = $('#soc-active-sources', panel);
    if (!box) return;

    if (!activeSources.length) {
      box.innerHTML = `<div class="hint" style="font-size:12px;padding:6px 0">Nenhuma rede ativa. Adicione abaixo para iniciar a captura.</div>`;
      return;
    }

    box.innerHTML = activeSources.map((s) => {
      const isYt = s.type === 'youtube';
      const isTw = s.type === 'twitch';
      const isLive = s.status === 'connected';
      return `
        <div class="soc-src-item">
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            <span class="src-tag ${isYt ? 'youtube' : isTw ? 'twitch' : ''}">
              ${isYt ? '🔴 YouTube' : isTw ? '🟣 Twitch' : '🌐'}
            </span>
            <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.label || s.target)}</strong>
            <span class="pill sm ${isLive ? 'ok' : s.status === 'connecting' ? 'warn' : 'err'}">${isLive ? 'Ao vivo' : s.status === 'connecting' ? 'Conectando…' : 'Erro'}</span>
          </div>
          <div class="src-meta">
            <span>${s.count || 0} msgs</span>
            <button class="del" data-del-src="${esc(s.id)}" title="Desconectar esta rede">✕</button>
          </div>
        </div>
      `;
    }).join('');

    $$('[data-del-src]', box).forEach((b) => {
      b.onclick = () => removeSource(b.dataset.delSrc);
    });
    updateSummaryBadges();
  }

  function updateSummaryBadges() {
    if (!panel) return;
    const srcBadge = $('#soc-src-badge', panel);
    if (srcBadge) {
      srcBadge.className = `pill sm ${activeSources.length ? 'ok' : ''}`;
      srcBadge.textContent = activeSources.length ? `${activeSources.length} ativa(s)` : '0 ativas';
    }
    const cfgBadge = $('#soc-cfg-badge', panel);
    if (cfgBadge) {
      const spd = st.slowMode === 0 ? '⚡ Tempo real' : st.slowMode === -1 ? '⭐ Só doações' : `⏳ ${st.slowMode}s`;
      const seq = st.autoSequence ? `🔄 ${st.autoDur}s` : 'Manual';
      cfgBadge.textContent = `${spd} · ${seq}`;
    }
  }

  function setFocusMode(on) {
    st.focusMode = on;
    save();
    if (!panel) return;
    const bConn = $('#soc-box-connect', panel);
    const bOpts = $('#soc-box-options', panel);
    if (on && bConn) bConn.hidden = true;
    if (on && bOpts) bOpts.hidden = true;
    updateSummaryBadges();
  }

  function setDensity(density) {
    st.density = density;
    save();
    if (!panel) return;
    const btn = $('#soc-btn-density', panel);
    const text = $('#soc-density-text', panel);
    const list = $('#soc-list', panel);
    const isCompact = density === 'compact';
    if (btn) btn.classList.toggle('active', isCompact);
    if (text) text.textContent = isCompact ? '𝄜 Compacto' : '☰ Padrão';
    if (list) list.classList.toggle('compact', isCompact);
  }

  function refreshOnAirBanner() {
    if (!panel) return;
    const bar = $('#soc-cur-air', panel);
    if (!bar) return;
    if (currentFeatured) {
      bar.style.display = 'flex';
      const pf = platformOf(currentFeatured.type);
      const renderedBody = renderMessageHtml(currentFeatured.tokens) || esc(currentFeatured.text || currentFeatured.chatmessage);
      $('#soc-cur-text', bar).innerHTML = `<b>${esc(currentFeatured.name || currentFeatured.chatname)}</b> <span class="soc-src sm" style="background:${pf.c};margin:0 4px">${esc(pf.l)}</span> ${renderedBody}`;
    } else {
      bar.style.display = 'none';
    }
  }

  // Atualiza apenas as classes visuais dos cards existentes SEM recriar a lista nem mexer no scroll!
  function updateOnAirCards() {
    if (!panel) return;
    const cards = $$('.soc-msg', panel);
    for (const card of cards) {
      const id = card.dataset.id;
      const on = featuredId && id === featuredId;
      card.classList.toggle('on', on);
      const btn = $('[data-act="toggle"]', card);
      if (btn) {
        btn.classList.toggle('on', on);
        btn.innerHTML = on ? '⏹ Tirar do ar' : '▶ Colocar no ar';
      }
    }
  }

  function updateResumeFloat() {
    if (!panel) return;
    const btn = $('#soc-resume-btn', panel);
    const statusPill = $('#soc-scroll-status', panel);
    if (btn) {
      if (unreadWhilePaused > 0) {
        btn.innerHTML = `⬇ <b>${unreadWhilePaused}</b> novas mensagens (clique para voltar ao vivo)`;
        btn.classList.add('show');
      } else {
        btn.classList.remove('show');
      }
    }
    if (statusPill) {
      if (isScrollLocked || isUserBrowsing) {
        statusPill.className = 'status-pill paused';
        statusPill.innerHTML = `⏸ Rolagem pausada ${unreadWhilePaused > 0 ? `(${unreadWhilePaused} novas)` : ''}`;
      } else {
        statusPill.className = 'status-pill live';
        statusPill.innerHTML = `🟢 Ao vivo (acompanhando)`;
      }
    }
  }

  function updateFilterCounts() {
    if (!panel) return;
    const total = msgs.length;
    const qCount = queue.length;
    const donCount = msgs.filter((m) => !!m.donation).length;
    const ytCount = msgs.filter((m) => m.type === 'youtube').length;
    const twCount = msgs.filter((m) => m.type === 'twitch').length;

    const btnAll = $('[data-tab="all"]', panel);
    const btnQ = $('[data-tab="queue"]', panel);
    const btnDon = $('[data-tab="donations"]', panel);
    const btnYt = $('[data-tab="youtube"]', panel);
    const btnTw = $('[data-tab="twitch"]', panel);

    if (btnAll) btnAll.textContent = `Todas (${total})`;
    if (btnQ) btnQ.textContent = `📋 Fila (${qCount})`;
    if (btnDon) btnDon.textContent = `⭐ Super Chats (${donCount})`;
    if (btnYt) btnYt.textContent = `🔴 YouTube (${ytCount})`;
    if (btnTw) btnTw.textContent = `🟣 Twitch (${twCount})`;
  }

  // ---------- Janela Flutuante (Pop-out) ----------
  function openPopout() {
    const w = 560;
    const h = 860;
    const left = Math.max(10, window.screenLeft + window.outerWidth - w - 20);
    const top = Math.max(10, window.screenTop + 40);
    window.open('/social-popout.html', 'CastDeckSocialPopout', `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`);
  }

  // ---------- Renderização dos Cards ----------
  function msgEl(m, queuePos = 0) {
    const pf = platformOf(m.type);
    const on = featuredId === m.id;
    const isDon = !!m.donation;
    const inQueue = queue.some((x) => x.id === m.id);

    const body = renderMessageHtml(m.tokens) || esc(m.text || '');

    const el = h(`<div class="soc-msg ${on ? 'on' : ''} ${isDon ? 'superchat' : ''}" data-id="${esc(m.id)}" data-source-id="${esc(m.sourceId || '')}" data-type="${esc(m.type || '')}" title="Duplo clique: colocar no ar direto no PGM">
      <div class="soc-head">
        <div class="soc-av-box">
          ${m.avatar ? `<img class="soc-av" referrerpolicy="no-referrer" src="${esc(m.avatar)}" onerror="this.style.display='none'">` : `<i class="soc-av ph">${esc((m.name[0] || '?').toUpperCase())}</i>`}
          <span class="soc-av-badge ${m.type === 'youtube' ? 'youtube' : m.type === 'twitch' ? 'twitch' : ''}">
            ${m.type === 'youtube' ? '▶' : m.type === 'twitch' ? 'Tw' : '●'}
          </span>
        </div>
        <b style="${m.color ? `color:${esc(m.color)}` : ''}">${esc(m.name)}</b>
        <span class="soc-src" style="background:${pf.c}">${esc(pf.l)}</span>
        ${queuePos ? `<span class="soc-q-pos">#${queuePos} na fila</span>` : inQueue ? `<span class="soc-q-pos">Na fila</span>` : ''}
        ${m.donation ? `<span class="soc-don">💰 ${esc(m.donation)}</span>` : ''}
        ${m.membership ? `<span class="soc-mem">⭐ ${esc(m.membership)}</span>` : ''}
      </div>
      <p style="margin:7px 0 8px;font-size:13.5px;line-height:1.45;word-break:break-word">${body || '<i class="hint">(sem texto)</i>'}</p>
      <div class="soc-acts">
        <button class="btn-air ${on ? 'on' : ''}" data-act="toggle" title="Colocar ou tirar do ar no PGM">
          ${on ? '⏹ Tirar do ar' : '▶ Colocar no ar'}
        </button>
        <button class="btn sm ghost btn-q ${inQueue ? 'in-queue' : ''}" data-act="queue" title="${inQueue ? 'Remover da fila' : 'Adicionar à fila de exibição'}">
          ${inQueue ? '✓ Na fila' : '+ Fila'}
        </button>
        <button class="btn sm ghost" data-act="del" title="Remover da lista">✕</button>
        <span class="soc-dbl-hint">2 cliques = pôr no ar</span>
      </div>
    </div>`);

    // Duplo clique coloca a mensagem no ar no PGM imediatamente!
    el.ondblclick = (e) => {
      if (e.target.closest('[data-act="del"]') || e.target.closest('[data-act="queue"]')) return;
      e.preventDefault();
      e.stopPropagation();
      toggleFeatured(m);
    };

    el.onclick = (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (!a) return;
      if (a === 'toggle') {
        toggleFeatured(m);
      } else if (a === 'queue') {
        toggleQueue(m);
      } else if (a === 'del') {
        removeFromQueue(m.id, true);
        const idx = msgs.indexOf(m);
        if (idx !== -1) msgs.splice(idx, 1);
        el.remove();
        updateFilterCounts();
      }
    };

    return el;
  }

  // Renderiza toda a lista filtrada apenas quando necessário (filtro, busca, etc.)
  function refreshList() {
    if (!panel) return;
    clearTimeout(listTimer);
    listTimer = setTimeout(() => {
      const list = $('#soc-list', panel);
      if (!list) return;

      let filtered;
      if (st.filterTab === 'queue') {
        filtered = [...queue];
        const q = (st.searchQuery || '').toLowerCase().trim();
        if (q) {
          filtered = filtered.filter((m) => m.name?.toLowerCase().includes(q) || m.text?.toLowerCase().includes(q) || m.donation?.toLowerCase().includes(q));
        }
      } else {
        filtered = msgs.filter(matchesFilter);
      }

      list.replaceChildren();

      // Banner da fila quando na aba Fila
      if (st.filterTab === 'queue') {
        const queueBar = h(`
          <div class="soc-queue-bar">
            <div class="q-info">
              <span>📋</span>
              <span>${queue.length ? `${queue.length} mensagem(ns) na fila de exibição` : 'A fila está vazia'}</span>
            </div>
            <div class="q-actions">
              <button class="btn sm primary" id="soc-q-next" ${queue.length ? '' : 'disabled'} title="Coloca a próxima mensagem da fila no ar">▶ Próxima</button>
              <button class="btn sm ghost err" id="soc-q-clear" ${queue.length ? '' : 'disabled'} title="Esvazia toda a fila de espera">🗑️ Limpar fila</button>
            </div>
          </div>
        `);
        const btnNext = $('#soc-q-next', queueBar);
        const btnClr = $('#soc-q-clear', queueBar);
        if (btnNext) btnNext.onclick = () => next(true);
        if (btnClr) btnClr.onclick = () => clearQueue(true);
        list.append(queueBar);
      }

      if (!filtered.length) {
        if (!msgs.length && !activeSources.length && st.filterTab === 'all' && !st.searchQuery) {
          const emptyBox = h(`
            <div class="soc-empty-box" style="padding:28px 16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;background:var(--bg-2);border-radius:12px;border:1px dashed var(--line);margin:12px 0">
              <span style="font-size:28px;line-height:1">💬</span>
              <strong style="font-size:14px;color:var(--text-0)">Aguardando comentários das redes</strong>
              <p class="hint" style="font-size:12px;margin:0;max-width:280px;line-height:1.4">Conecte sua live do YouTube ou Twitch para receber comentários do público em tempo real e destacar na tela.</p>
              <button class="btn sm primary" id="soc-empty-btn-conn" style="margin-top:4px">+ Conectar YouTube ou Twitch</button>
            </div>
          `);
          const bConn = $('#soc-empty-btn-conn', emptyBox);
          if (bConn) {
            bConn.onclick = () => {
              const box = $('#soc-box-connect', panel);
              if (box) {
                box.hidden = false;
                $('#soc-new-target', box)?.focus();
              }
            };
          }
          list.append(emptyBox);
        } else {
          const emptyMsg = st.filterTab === 'queue'
            ? 'Nenhuma mensagem na fila. Clique em "+ Fila" nos cards para adicionar mensagens à sequência.'
            : 'Nenhuma mensagem para este filtro.';
          list.append(h(`<div class="empty" style="padding:32px 14px;text-align:center;color:var(--text-1)">${emptyMsg}</div>`));
        }
      } else {
        const shown = st.filterTab === 'queue' ? filtered : filtered.slice(-120);
        shown.forEach((m, idx) => {
          list.append(msgEl(m, st.filterTab === 'queue' ? idx + 1 : 0));
        });
      }

      // Se a rolagem não estiver pausada e não for fila, vai para o fim
      if (!isScrollLocked && !isUserBrowsing && st.filterTab !== 'queue') {
        list.scrollTop = list.scrollHeight;
      }

      updateFilterCounts();
    }, 40);
  }

  // ---------- Painel Principal (Foco total nas Mensagens) ----------
  function render(p) {
    panel = p;
    const isFloating = !!p.closest?.('.fw') || !!p.closest?.('.fw-popout-root') || p.classList.contains('fw-panel') || !!window.__castdeck?.floatWins?.has?.('social');
    p.innerHTML = `
      <!-- Barra Superior Compacta: Redes Ativas + Ações -->
      <div class="soc-top-bar">
        <button class="soc-stat-pill ${activeSources.length ? 'online' : ''}" id="soc-btn-toggle-src" title="Clique para ver ou conectar redes">
          <span class="soc-dot"></span>
          <span id="soc-src-badge">${activeSources.length ? `${activeSources.length} ativa(s)` : '+ Conectar rede'}</span>
        </button>
        <div class="soc-top-actions">
          <button class="btn sm ${activeSources.length ? 'ghost' : 'primary'}" id="soc-btn-connect" title="Conectar transmissão do YouTube ou Twitch">
            <span>${activeSources.length ? '+ Rede' : '+ Conectar'}</span>
          </button>
          <button class="btn sm ghost icon" id="soc-btn-options" title="Opções de velocidade, anti-flood, carrossel e limpeza">
            <span>⚙️</span>
          </button>
          <button class="btn sm ghost icon ${st.density === 'compact' ? 'active' : ''}" id="soc-btn-density" title="Alternar densidade padrão ou compacta">
            <span id="soc-density-text">${st.density === 'compact' ? '𝄜' : '☰'}</span>
          </button>
          <button class="btn sm ghost icon soc-popout-btn ${isFloating ? 'active' : ''}" id="soc-btn-popout" title="${isFloating ? 'Devolver painel para a lateral' : 'Destacar este painel em uma janela flutuante com botão de fixar no topo (📌)'}">
            <span>⧉</span>
          </button>
        </div>
      </div>

      <!-- Banner Fixo: No ar no PGM -->
      <div class="soc-cur-air" id="soc-cur-air" style="display:none">
        <div style="min-width:0;flex:1">
          <div class="air-title">● NO AR NO PROGRAMA (PGM)</div>
          <div class="air-content" id="soc-cur-text">...</div>
        </div>
        <button class="btn-hide" id="soc-cur-hide" title="Tirar mensagem do ar imediatamente (Esc)">✕ Tirar</button>
      </div>

      <!-- Gaveta Colapsável: Conectar Redes -->
      <div class="soc-slide-box" id="soc-box-connect" hidden>
        <div class="soc-slide-header">
          <strong>🌐 Redes ao Vivo (Zero Cota)</strong>
          <button class="btn sm ghost icon" id="soc-close-connect" title="Fechar">✕</button>
        </div>
        <div id="soc-active-sources" class="soc-sources-list"></div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">
          <div class="soc-new-row">
            <select class="input sm" id="soc-new-type">
              <option value="youtube">🔴 YouTube</option>
              <option value="twitch">🟣 Twitch</option>
            </select>
            <input class="input sm" id="soc-new-target" placeholder="Link da live ou nome do canal...">
            <button class="btn sm primary" id="soc-new-add">+ Conectar</button>
          </div>
          <span class="hint" style="font-size:11px">Você pode conectar YouTube e Twitch simultaneamente sem gastar cota de API.</span>
        </div>
      </div>

      <!-- Gaveta Colapsável: Opções de Moderação & Ferramentas -->
      <div class="soc-slide-box" id="soc-box-options" hidden>
        <div class="soc-slide-header">
          <strong>⚙️ Opções do Chat & Moderação</strong>
          <span class="hint sm" id="soc-cfg-badge" style="font-size:11px;margin-left:auto;margin-right:8px"></span>
          <button class="btn sm ghost icon" id="soc-close-options" title="Fechar">✕</button>
        </div>
        <label class="field" style="margin:2px 0 6px">
          <span>Velocidade do chat (Slow mode)</span>
          <select class="input sm" id="soc-slow">
            <option value="0" ${st.slowMode === 0 ? 'selected' : ''}>⚡ Todas as mensagens (em tempo real)</option>
            <option value="1" ${st.slowMode === 1 ? 'selected' : ''}>⏳ Máx. 1 msg a cada 1 segundo</option>
            <option value="2" ${st.slowMode === 2 ? 'selected' : ''}>⏳ Máx. 1 msg a cada 2 segundos</option>
            <option value="3" ${st.slowMode === 3 ? 'selected' : ''}>⏳ Máx. 1 msg a cada 3 segundos</option>
            <option value="5" ${st.slowMode === 5 ? 'selected' : ''}>⏳ Máx. 1 msg a cada 5 segundos</option>
            <option value="-1" ${st.slowMode === -1 ? 'selected' : ''}>⭐ Apenas Super Chats & Doações</option>
          </select>
        </label>
        <label class="check" style="justify-content:space-between;margin-top:6px">
          <span>Descartar mensagens repetidas (anti-flood)</span>
          <span class="switch"><input type="checkbox" id="soc-antispam" ${st.antiSpam ? 'checked' : ''}><span></span></span>
        </label>
        <label class="check" style="justify-content:space-between;margin-top:6px">
          <span style="color:#ffd166;font-weight:600">⭐ Exibir Super Chats automaticamente no PGM</span>
          <span class="switch"><input type="checkbox" id="soc-autosc" ${st.autoSuperChat ? 'checked' : ''}><span></span></span>
        </label>
        <label class="check" style="justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid var(--line)">
          <div>
            <span style="color:#c4b5fd;font-weight:700">🔄 Carrossel de mensagens contínuo no PGM</span>
            <div class="hint" style="font-size:11px">Exibe mensagens que chegam e da fila continuamente pelo tempo configurado</div>
          </div>
          <span class="switch"><input type="checkbox" id="soc-auto-seq" ${st.autoSequence ? 'checked' : ''}><span></span></span>
        </label>
        <div id="soc-auto-dur-wrap" style="display:${st.autoSequence ? 'flex' : 'none'};align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding:6px 10px;background:var(--bg-1);border-radius:6px;border:1px solid var(--line)">
          <span style="font-size:12px;font-weight:600">Tempo de tela:</span>
          <div style="display:flex;align-items:center;gap:6px">
            <select class="input sm" id="soc-auto-dur" style="width:125px;font-size:11.5px">
              <option value="3" ${st.autoDur === 3 ? 'selected' : ''}>⏱️ 3 segundos</option>
              <option value="5" ${st.autoDur === 5 ? 'selected' : ''}>⏱️ 5 segundos</option>
              <option value="8" ${st.autoDur === 8 ? 'selected' : ''}>⏱️ 8 segundos</option>
              <option value="10" ${st.autoDur === 10 ? 'selected' : ''}>⏱️ 10 segundos</option>
              <option value="15" ${st.autoDur === 15 ? 'selected' : ''}>⏱️ 15 segundos</option>
              <option value="20" ${st.autoDur === 20 ? 'selected' : ''}>⏱️ 20 segundos</option>
            </select>
            <button class="btn sm primary" id="soc-next-seq" title="Avançar imediatamente para a próxima mensagem da sequência">▶ Próxima</button>
          </div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:8px;border-top:1px solid var(--line)">
          <button class="btn grow sm" id="soc-test" title="Cria uma mensagem de exemplo com Super Chat">Simular mensagem</button>
          <button class="btn grow sm" id="soc-clear" title="Limpa o destaque atual do ar">Limpar do ar</button>
          <button class="btn sm err" id="soc-clear-all" title="Apaga todas as mensagens recebidas do chat">🗑️ Limpar chat</button>
        </div>
      </div>

      <!-- Barra de Filtros e Busca Rápida -->
      <div class="soc-controls-row">
        <div class="soc-search-wrap">
          <svg class="search-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input class="input sm" id="soc-search" placeholder="Filtrar por nome, texto ou doação..." value="${esc(st.searchQuery || '')}">
        </div>
        <button class="btn sm ghost soc-pause-btn" id="soc-lock-scroll" title="Pausar ou seguir rolagem ao vivo">
          ${isScrollLocked ? '▶ Retomar' : '⏸ Pausar'}
        </button>
      </div>

      <div class="soc-filter-bar">
        <button class="soc-chip ${st.filterTab === 'all' ? 'active' : ''}" data-tab="all">Todas</button>
        <button class="soc-chip purple ${st.filterTab === 'queue' ? 'active' : ''}" data-tab="queue">📋 Fila (${queue.length})</button>
        <button class="soc-chip gold ${st.filterTab === 'donations' ? 'active' : ''}" data-tab="donations">⭐ Super Chats</button>
        <button class="soc-chip ${st.filterTab === 'youtube' ? 'active' : ''}" data-tab="youtube">🔴 YouTube</button>
        <button class="soc-chip ${st.filterTab === 'twitch' ? 'active' : ''}" data-tab="twitch">🟣 Twitch</button>
      </div>

      <!-- LISTA DE MENSAGENS (Elemento Dominante) -->
      <div class="soc-list-wrap">
        <div id="soc-list" class="soc-list ${st.density === 'compact' ? 'compact' : ''}"></div>
        <button class="soc-resume-float" id="soc-resume-btn">⬇ Novas mensagens (rolar)</button>
      </div>
    `;

    // Alternar gavetas de Conexão e Opções
    const boxConnect = $('#soc-box-connect', p);
    const boxOptions = $('#soc-box-options', p);

    const toggleConnect = (force) => {
      const show = typeof force === 'boolean' ? force : boxConnect.hidden;
      boxConnect.hidden = !show;
      if (show) {
        boxOptions.hidden = true;
        $('#soc-new-target', boxConnect)?.focus();
      }
    };

    const toggleOptions = (force) => {
      const show = typeof force === 'boolean' ? force : boxOptions.hidden;
      boxOptions.hidden = !show;
      if (show) boxConnect.hidden = true;
    };

    $('#soc-btn-connect', p).onclick = () => toggleConnect();
    $('#soc-btn-toggle-src', p).onclick = () => toggleConnect();
    $('#soc-close-connect', p).onclick = () => toggleConnect(false);

    $('#soc-btn-options', p).onclick = () => toggleOptions();
    $('#soc-close-options', p).onclick = () => toggleOptions(false);

    $('#soc-btn-density', p).onclick = () => {
      const next = st.density === 'compact' ? 'normal' : 'compact';
      setDensity(next);
      toast(next === 'compact' ? 'Visualização compacta ativada' : 'Visualização padrão ativada', 'ok');
    };

    $('#soc-btn-popout', p).onclick = () => {
      if (window.__castdeck?.floatWins) {
        window.__castdeck.floatWins.toggle('social');
      } else {
        openPopout();
      }
    };

    // Fechar destaque no banner
    $('#soc-cur-hide', p).onclick = hide;

    // Conectar nova rede
    $('#soc-new-add', p).onclick = () => {
      const type = $('#soc-new-type', p).value;
      const target = $('#soc-new-target', p).value.trim();
      addSource(type, target);
      $('#soc-new-target', p).value = '';
    };

    // Controle de Slow Mode
    $('#soc-slow', p).onchange = (e) => {
      st.slowMode = parseInt(e.target.value, 10);
      save();
      updateSummaryBadges();
    };

    // Anti-spam
    $('#soc-antispam', p).onchange = (e) => {
      st.antiSpam = e.target.checked;
      save();
    };

    // Auto Super Chat
    $('#soc-autosc', p).onchange = (e) => {
      st.autoSuperChat = e.target.checked;
      save();
    };

    // Auto Sequência (Carrossel Contínuo)
    $('#soc-auto-seq', p).onchange = (e) => {
      st.autoSequence = e.target.checked;
      save();
      const wrap = $('#soc-auto-dur-wrap', p);
      if (wrap) wrap.style.display = st.autoSequence ? 'flex' : 'none';
      if (localWs?.readyState === WebSocket.OPEN) {
        localWs.send(JSON.stringify({ type: 'auto-config', autoSequence: st.autoSequence, autoDur: st.autoDur }));
      }
      updateSummaryBadges();
      if (st.autoSequence && !featuredId) next();
    };

    $('#soc-auto-dur', p).onchange = (e) => {
      st.autoDur = parseInt(e.target.value, 10) || 8;
      save();
      if (localWs?.readyState === WebSocket.OPEN) {
        localWs.send(JSON.stringify({ type: 'auto-config', autoSequence: st.autoSequence, autoDur: st.autoDur }));
      }
      updateSummaryBadges();
    };

    $('#soc-next-seq', p).onclick = () => {
      next(true);
      if (localWs?.readyState === WebSocket.OPEN) {
        localWs.send(JSON.stringify({ type: 'next-sequence' }));
      }
    };

    // Trava de rolagem manual
    $('#soc-lock-scroll', p).onclick = () => {
      isScrollLocked = !isScrollLocked;
      $('#soc-lock-scroll', p).textContent = isScrollLocked ? '▶ Retomar ao vivo' : '⏸ Pausar rolagem';
      if (!isScrollLocked) {
        isUserBrowsing = false;
        unreadWhilePaused = 0;
        updateResumeFloat();
        refreshList();
      } else {
        updateResumeFloat();
      }
    };

    // Botão flutuante para voltar ao vivo
    $('#soc-resume-btn', p).onclick = () => {
      isScrollLocked = false;
      isUserBrowsing = false;
      unreadWhilePaused = 0;
      $('#soc-lock-scroll', p).textContent = '⏸ Pausar rolagem';
      updateResumeFloat();
      refreshList();
      const list = $('#soc-list', panel);
      if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    };

    // Detecção estrita de rolagem do usuário (NUNCA mexe na tela enquanto ele lê ou roda a lista)
    const listEl = $('#soc-list', p);
    if (listEl) {
      listEl.addEventListener('scroll', () => {
        // Se a distância do final for maior que 60px, o usuário rolou para cima e está lendo
        const distFromBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
        if (distFromBottom > 60) {
          isUserBrowsing = true;
          updateResumeFloat();
        } else if (!isScrollLocked) {
          isUserBrowsing = false;
          unreadWhilePaused = 0;
          updateResumeFloat();
        }
      });

      // Detecção de roda do mouse e toque
      listEl.addEventListener('wheel', (e) => {
        if (e.deltaY < 0) {
          // Rolou para cima
          isUserBrowsing = true;
          updateResumeFloat();
        }
      }, { passive: true });
    }

    // Filtro de Abas
    $$('.soc-chip[data-tab]', p).forEach((b) => {
      b.onclick = () => {
        $$('.soc-chip[data-tab]', p).forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        st.filterTab = b.dataset.tab;
        save();
        refreshList();
      };
    });

    // Busca
    $('#soc-search', p).oninput = (e) => {
      st.searchQuery = e.target.value;
      save();
      refreshList();
    };

    $('#soc-clear', p).onclick = clearAll;

    $('#soc-clear-all', p).onclick = async () => {
      if (!msgs.length) {
        toast('Não há mensagens na lista', 'warn');
        return;
      }
      const ok = await confirmDialog('Deseja realmente apagar todas as mensagens da lista de chat?', {
        title: 'Limpar chat',
        ok: 'Limpar tudo',
        cancel: 'Cancelar',
        danger: true,
      });
      if (!ok) return;
      clearAllMessages(true);
      toast('Todas as mensagens foram apagadas', 'ok');
    };

    $('#soc-test', p).onclick = () => {
      const samples = [
        { chatname: 'Carlos Brasil', chatmessage: 'Representando o Brasil! 🇧🇷 🇧🇷 Abraço de SP! 🔥 :brasil:', type: 'youtube', nameColor: '#00d26a' },
        { chatname: 'Alex Gamer', chatmessage: 'Salve dos EUA! 🇺🇸 Transmissão top :D <3', type: 'twitch', membership: 'Inscrito' },
        { chatname: 'Beatriz Lisboa', chatmessage: 'Muito bom acompanhar de Portugal! 🇵🇹 ❤️ Parabéns!', type: 'youtube', hasDonation: '€ 10,00' },
        { chatname: 'Kenji Tokyo', chatmessage: 'Konichiwa! 🇯🇵 🚀 Sucesso na live :)', type: 'twitch', hasDonation: '500 Bits' },
        { chatname: 'Lucas Bits', chatmessage: 'Mandando bits pra apoiar! 🇧🇷 👏 :fire:', type: 'twitch', hasDonation: '200 Bits' },
      ];
      const d = samples[Math.floor(Math.random() * samples.length)];
      addMessage(normalizeMessage({ ...d, id: 'test-' + Date.now() }));
    };

    refreshSourcesUI();
    refreshOnAirBanner();
    refreshList();
    updateSummaryBadges();
  }

  function boot() {
    applyOpts();
    connectLocalStream();
    loadSources();
  }

  return {
    st,
    msgs,
    queue,
    status,
    render,
    boot,
    addMessage,
    showFeatured,
    hide,
    next,
    addToQueue,
    removeFromQueue,
    toggleQueue,
    clearQueue,
    clearAll,
    clearAllMessages,
    deleteMessagesForSource,
    openPopout,
    isFeatured: (id) => featuredId === id,
    stop: () => {},
  };
}

