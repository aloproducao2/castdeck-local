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
      searchQuery: '',
      accOpen: { ...DEFAULTS.accOpen, ...(data.accOpen || {}) },
    };
  } catch {
    return { ...DEFAULTS, searchQuery: '', accOpen: { ...DEFAULTS.accOpen } };
  }
};

function detectSocialTarget(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/socialstream\.ninja|[?&]session=/i.test(s)) {
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : `https://io.socialstream.ninja/${s.replace(/^\?/, '?')}`);
      const sess = cleanSession(u.searchParams.get('session') || u.searchParams.get('id') || '');
      if (sess) return { type: 'ssn', target: sess };
    } catch {}
    const m = s.match(/[?&](?:session|id)=([A-Za-z0-9_-]+)/i);
    if (m) return { type: 'ssn', target: cleanSession(m[1]) };
    return { type: 'ssn', target: s };
  }
  if (/youtube\.com|youtu\.be/i.test(s)) {
    return { type: 'youtube', target: s };
  }
  if (/twitch\.tv\//i.test(s)) {
    const m = s.match(/twitch\.tv\/([a-zA-Z0-9_]{3,25})/i);
    return { type: 'twitch', target: m ? m[1] : s };
  }
  return null;
}

export function createSocial({ getComp, toast, h, esc, $, $$, onVote }) {
  const st = load();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...st, searchQuery: '' }));
    } catch {}
  };
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

  // Fontes conectadas no backend (YouTube, Twitch) e Social Stream Ninja (SSN)
  let activeSources = [];
  const ssnSources = [];
  let localWs = null;
  const getAllSources = () => [...activeSources, ...ssnSources];

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

    // Remove mensagem de "vazio" / boas-vindas / aviso inteligente se houver
    const emptyEl = $('.empty, .soc-empty-box, .soc-empty-smart', list);
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
  function hydrateHistory(items) {
    if (!Array.isArray(items) || !items.length) return false;
    let added = false;
    for (const rawItem of items) {
      const m = normalizeMessage(rawItem);
      if (!m || m.clear || seen.has(m.id)) continue;
      seen.add(m.id);
      if (seen.size > 800) seen.delete(seen.values().next().value);
      msgs.push(m);
      if (msgs.length > 250) msgs.shift();
      added = true;
    }
    return added;
  }

  function connectLocalStream() {
    if (localWs && (localWs.readyState === 0 || localWs.readyState === 1)) return;
    try {
      const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${wsProto}://${location.host}/social-stream`);
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
            const gotHistory = hydrateHistory(msg.history);
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
            if (gotHistory) refreshList();
          } else if (msg.type === 'sources') {
            activeSources = msg.sources || [];
            refreshSourcesUI();
            if (!msgs.length && getAllSources().length) refreshList();
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
            const sid = msg.message.sourceId;
            if (sid) {
              const src = activeSources.find((x) => x.id === sid);
              if (src) {
                src.count = typeof msg.sourceCount === 'number' ? msg.sourceCount : (src.count || 0) + 1;
                const cntEl = panel ? $(`[data-src-count="${CSS.escape(sid)}"]`, panel) : null;
                if (cntEl) cntEl.textContent = `${src.count} msgs`;
              }
            }
            const m = normalizeMessage(msg.message);
            if (m && !m.clear) addMessage(m);
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
  function parseSsnSession(input) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://io.socialstream.ninja/${raw.replace(/^\?/, '?')}`);
      const s = u.searchParams.get('session') || u.searchParams.get('id');
      if (s) return cleanSession(s);
    } catch {}
    const m = raw.match(/[?&](?:session|id)=([A-Za-z0-9_-]+)/i);
    if (m) return cleanSession(m[1]);
    return cleanSession(raw);
  }

  function addSsnSource(input) {
    const session = parseSsnSession(input);
    if (!session) throw new Error('Sessão do Social Stream Ninja inválida.');
    const id = `ssn:${session}`;
    const existing = ssnSources.find((x) => x.id === id);
    if (existing) return existing;

    const src = {
      id,
      type: 'ssn',
      target: session,
      label: `Social Ninja (${session})`,
      status: 'connecting',
      error: null,
      count: 0,
      chatStatus: 'connecting',
      dockStatus: 'connecting',
      chatClient: null,
      dockClient: null,
    };

    const syncStatus = () => {
      const a = src.chatStatus;
      const b = src.dockStatus;
      if (a === 'online' || b === 'online') {
        src.status = 'connected';
        src.error = null;
      } else if (a === 'error' && b === 'error') {
        src.status = 'error';
        src.error = 'Falha ao conectar ao Social Stream Ninja.';
      } else if (a === 'connecting' || a === 'reconnecting' || b === 'connecting' || b === 'reconnecting') {
        src.status = 'connecting';
      } else {
        src.status = 'idle';
      }
      status.chat = a;
      status.dock = b;
      refreshSourcesUI();
      if (!msgs.length) refreshList();
    };

    src.chatClient = new SSNClient({
      server: st.server || SSN_DEFAULT_SERVER,
      session,
      channel: 4,
      onStatus: (s) => {
        src.chatStatus = s;
        syncStatus();
      },
      onMessage: (raw) => {
        if (!st.listenChat) return;
        const m = normalizeMessage(raw);
        if (!m || m.clear) return;
        m.sourceId = src.id;
        src.count = (src.count || 0) + 1;
        const cntEl = panel ? $(`[data-src-count="${CSS.escape(src.id)}"]`, panel) : null;
        if (cntEl) cntEl.textContent = `${src.count} msgs`;
        addMessage(m);
        if (localWs?.readyState === WebSocket.OPEN) {
          localWs.send(JSON.stringify({ type: 'chat', message: m }));
        }
      },
    });

    src.dockClient = new SSNClient({
      server: st.server || SSN_DEFAULT_SERVER,
      session,
      channel: 2,
      onStatus: (s) => {
        src.dockStatus = s;
        syncStatus();
      },
      onMessage: (raw) => {
        if (!st.followDock) return;
        const m = normalizeMessage(raw);
        if (!m) return;
        if (m.clear) return hide();
        m.sourceId = src.id;
        showFeatured(m, 0);
      },
    });

    ssnSources.push(src);
    src.chatClient.connect();
    src.dockClient.connect();
    refreshSourcesUI();
    return src;
  }

  async function addSource(type, target) {
    if (!target) {
      toast('Informe o link ou canal da rede social', 'err');
      return false;
    }
    const resolvedType = String(type || 'youtube').toLowerCase();
    try {
      toast('Conectando à rede…', 'ok');
      if (resolvedType === 'ssn') {
        addSsnSource(target);
        toast('Rede conectada com sucesso!', 'ok');
        return true;
      }
      await api('/social/sources', { method: 'POST', body: { type: resolvedType, target } });
      toast('Rede conectada com sucesso!', 'ok');
      await loadSources();
      return true;
    } catch (e) {
      toast(e.message || 'Erro ao conectar à rede', 'err');
      refreshSourcesUI();
      return false;
    }
  }

  async function reconnectSource(id) {
    const ssnIdx = ssnSources.findIndex((x) => x.id === id);
    if (ssnIdx !== -1) {
      const s = ssnSources[ssnIdx];
      s.chatClient?.close();
      s.dockClient?.close();
      ssnSources.splice(ssnIdx, 1);
      addSsnSource(s.target);
      toast('Reconectando ao Social Stream Ninja…', 'ok');
      return;
    }
    try {
      toast('Reconectando à rede…', 'ok');
      await api(`/social/sources/${encodeURIComponent(id)}/reconnect`, { method: 'POST' });
      await loadSources();
      refreshList();
    } catch (e) {
      toast(e.message || 'Erro ao reconectar', 'err');
    }
  }

  async function removeSource(id) {
    const ssnIdx = ssnSources.findIndex((x) => x.id === id);
    if (ssnIdx !== -1) {
      const s = ssnSources[ssnIdx];
      s.chatClient?.close();
      s.dockClient?.close();
      ssnSources.splice(ssnIdx, 1);
      deleteMessagesForSource(id, 'ssn', true);
      refreshSourcesUI();
      toast('Rede desconectada', 'ok');
      return;
    }
    const s = activeSources.find((x) => x.id === id);
    const sType = s?.type;
    try {
      await api(`/social/sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
      deleteMessagesForSource(id, sType, false);
      toast('Rede desconectada', 'ok');
      await loadSources();
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
    const allSources = getAllSources();
    if (panel) {
      const box = $('#soc-active-sources', panel);
      if (box) {
        if (!allSources.length) {
          box.innerHTML = `<div class="hint" style="font-size:12px;padding:6px 0">Nenhuma rede ativa. Adicione abaixo para iniciar a captura.</div>`;
        } else {
          box.innerHTML = allSources.map((s) => {
            const isYt = s.type === 'youtube';
            const isTw = s.type === 'twitch';
            const isSsn = s.type === 'ssn';
            const isLive = s.status === 'connected';
            const tagCls = isYt ? 'youtube' : isTw ? 'twitch' : isSsn ? 'ssn' : '';
            const tagTxt = isYt ? '🔴 YouTube' : isTw ? '🟣 Twitch' : isSsn ? '🥷 Social Ninja' : '🌐';
            const pillCls = isLive ? 'ok' : s.status === 'connecting' ? 'warn' : 'err';
            const pillTxt = isLive ? 'Ao vivo' : s.status === 'connecting' ? 'Conectando…' : 'Erro';
            return `
              <div class="soc-src-item" data-src-item="${esc(s.id)}">
                <div class="soc-src-main">
                  <span class="src-tag ${tagCls}">${tagTxt}</span>
                  <div class="soc-src-info">
                    <strong title="${esc(s.label || s.target)}">${esc(s.label || s.target)}</strong>
                    ${s.error ? `<small class="soc-src-err" title="${esc(s.error)}">${esc(s.error)}</small>` : ''}
                  </div>
                  <span class="pill sm ${pillCls}">${pillTxt}</span>
                </div>
                <div class="src-meta">
                  <span data-src-count="${esc(s.id)}">${s.count || 0} msgs</span>
                  ${s.status === 'error' || s.status === 'idle' ? `<button class="reconn" data-reconn-src="${esc(s.id)}" title="Reconectar esta rede">↻</button>` : ''}
                  <button class="del" data-del-src="${esc(s.id)}" title="Desconectar esta rede">✕</button>
                </div>
              </div>
            `;
          }).join('');

          $$('[data-del-src]', box).forEach((b) => {
            b.onclick = () => removeSource(b.dataset.delSrc);
          });
          $$('[data-reconn-src]', box).forEach((b) => {
            b.onclick = () => reconnectSource(b.dataset.reconnSrc);
          });
        }
      }
    }
    updateSummaryBadges();
  }

  function updateSummaryBadges() {
    const allSources = getAllSources();
    const hasAny = allSources.length > 0;
    if (panel) {
      const toggleBtn = $('#soc-btn-toggle-src', panel);
      const srcBadge = $('#soc-src-badge', panel);
      const connBtn = $('#soc-btn-connect', panel);
      if (toggleBtn) toggleBtn.classList.toggle('online', hasAny);
      // O badge é status, não ação: antes ele repetia "+ Conectar rede" ao lado do botão que já faz isso.
      if (srcBadge) srcBadge.textContent = hasAny ? `${allSources.length} ativa(s)` : 'Nenhuma rede';
      if (connBtn) {
        connBtn.className = `btn sm ${hasAny ? 'ghost' : 'primary'}`;
        const sp = $('span', connBtn);
        if (sp) sp.textContent = hasAny ? '+ Rede' : '+ Conectar';
      }
      const cfgBadge = $('#soc-cfg-badge', panel);
      if (cfgBadge) {
        const spd = st.slowMode === 0 ? '⚡ Tempo real' : st.slowMode === -1 ? '⭐ Só doações' : `⏳ ${st.slowMode}s`;
        const seq = st.autoSequence ? `🔄 ${st.autoDur}s` : 'Manual';
        cfgBadge.textContent = `${spd} · ${seq}`;
      }
    }
    document.querySelectorAll('.sq-pill[data-goto-tab="social"], .subtabs .tab[data-tab="social"]').forEach((el) => {
      el.classList.toggle('has-live', hasAny);
    });
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

      const allSources = getAllSources();
      if (!filtered.length) {
        const q = (st.searchQuery || '').trim();
        if (!msgs.length && !allSources.length && st.filterTab === 'all' && !q) {
          const emptyBox = h(`
            <div class="soc-empty-box" style="padding:28px 16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;background:var(--bg-2);border-radius:12px;border:1px dashed var(--line);margin:12px 0">
              <span style="font-size:28px;line-height:1">💬</span>
              <strong style="font-size:14px;color:var(--text-0)">Aguardando comentários das redes</strong>
              <p class="hint" style="font-size:12px;margin:0;max-width:280px;line-height:1.4">Conecte sua live do YouTube, Twitch ou Social Stream Ninja para receber comentários em tempo real e destacar na tela.</p>
              <button class="btn sm primary" id="soc-empty-btn-conn" style="margin-top:4px">+ Conectar YouTube, Twitch ou Ninja</button>
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
        } else if (st.filterTab === 'queue') {
          list.append(h(`<div class="empty" style="padding:32px 14px;text-align:center;color:var(--text-1)">Nenhuma mensagem na fila. Clique em "+ Fila" nos cards para adicionar mensagens à sequência.</div>`));
        } else if (q) {
          const detected = detectSocialTarget(q);
          const smartBox = detected
            ? h(`<div class="soc-empty-smart">
                <strong>🔗 Link detectado na busca</strong>
                <p class="hint">${msgs.length ? `Este campo apenas filtra mensagens já recebidas (${msgs.length} ocultas pelo filtro). Para capturar o chat dessa live, conecte-a como fonte:` : 'Este campo apenas filtra mensagens já recebidas. Para capturar o chat dessa live, conecte-a como fonte:'}</p>
                <div class="soc-empty-acts">
                  <button type="button" class="btn sm primary" id="soc-smart-connect">▶ Conectar esta live</button>
                  <button type="button" class="btn sm ghost" id="soc-smart-clear">✕ Limpar busca</button>
                </div>
              </div>`)
            : h(`<div class="soc-empty-smart">
                <p class="hint">${msgs.length ? `Nenhuma mensagem contém “${esc(q)}” (${msgs.length} no total).` : `Nenhuma mensagem contém “${esc(q)}”.`}</p>
                <div class="soc-empty-acts">
                  <button type="button" class="btn sm ghost" id="soc-smart-clear">✕ Limpar busca</button>
                </div>
              </div>`);
          const bClr = $('#soc-smart-clear', smartBox);
          if (bClr) {
            bClr.onclick = () => {
              st.searchQuery = '';
              const inp = $('#soc-search', panel);
              if (inp) inp.value = '';
              syncSearchUi();
              refreshList();
            };
          }
          const bSmartConn = $('#soc-smart-connect', smartBox);
          if (bSmartConn && detected) {
            bSmartConn.onclick = async () => {
              st.searchQuery = '';
              const inp = $('#soc-search', panel);
              if (inp) inp.value = '';
              syncSearchUi();
              const ok = await addSource(detected.type, detected.target);
              if (ok) {
                const box = $('#soc-box-connect', panel);
                if (box) box.hidden = true;
              }
              refreshList();
            };
          }
          list.append(smartBox);
        } else if (st.filterTab !== 'all' && msgs.length > 0) {
          const tabBox = h(`<div class="soc-empty-smart">
            <p class="hint">Nenhuma mensagem nesta aba (${msgs.length} em Todas).</p>
            <div class="soc-empty-acts">
              <button type="button" class="btn sm primary" id="soc-smart-all">Mostrar todas (${msgs.length})</button>
            </div>
          </div>`);
          $('#soc-smart-all', tabBox).onclick = () => {
            st.filterTab = 'all';
            save();
            $$('.soc-chip[data-tab]', panel).forEach((x) => x.classList.toggle('active', x.dataset.tab === 'all'));
            refreshList();
          };
          list.append(tabBox);
        } else if (allSources.length > 0 && !msgs.length) {
          const errSrc = allSources.find((x) => x.status === 'error');
          const connecting = allSources.every((x) => x.status === 'connecting');
          const waitBox = errSrc
            ? h(`<div class="soc-empty-smart">
                <strong>⚠️ ${esc(errSrc.label || errSrc.type)}</strong>
                <p class="hint">${esc(errSrc.error || 'Não foi possível carregar o chat ao vivo.')}</p>
                <div class="soc-empty-acts">
                  <button type="button" class="btn sm primary" id="soc-smart-reconn">↻ Reconectar</button>
                </div>
              </div>`)
            : h(`<div class="soc-empty-smart">
                <p class="hint">${connecting ? 'Conectando à transmissão ao vivo…' : 'Conectado — aguardando novos comentários no chat ao vivo…'}</p>
              </div>`);
          const bRe = $('#soc-smart-reconn', waitBox);
          if (bRe && errSrc) bRe.onclick = () => reconnectSource(errSrc.id);
          list.append(waitBox);
        } else {
          list.append(h(`<div class="empty" style="padding:32px 14px;text-align:center;color:var(--text-1)">Nenhuma mensagem para este filtro.</div>`));
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

  function syncSearchUi() {
    if (!panel) return;
    const wrap = $('#soc-search-wrap', panel);
    const clr = $('#soc-search-clear', panel);
    const has = !!(st.searchQuery && st.searchQuery.length);
    if (wrap) wrap.classList.toggle('has-query', has);
    if (clr) clr.hidden = !has;
  }

  // ---------- Painel Principal (Foco total nas Mensagens) ----------
  function render(p) {
    panel = p;
    if (!isScrollLocked) isUserBrowsing = false;
    const allCount = getAllSources().length;
    const isFloating = !!p.closest?.('.fw') || !!p.closest?.('.fw-popout-root') || p.classList.contains('fw-panel') || !!window.__castdeck?.floatWins?.has?.('social');
    p.innerHTML = `
      <!-- Barra Superior Compacta: Redes Ativas + Ações -->
      <div class="soc-top-bar">
        <button class="soc-stat-pill ${allCount ? 'online' : ''}" id="soc-btn-toggle-src" title="Clique para ver ou conectar redes">
          <span class="soc-dot"></span>
          <span id="soc-src-badge">${allCount ? `${allCount} ativa(s)` : '+ Conectar rede'}</span>
        </button>
        <div class="soc-top-actions">
          <button class="btn sm ${allCount ? 'ghost' : 'primary'}" id="soc-btn-connect" title="Conectar transmissão do YouTube, Twitch ou Social Stream Ninja">
            <span>${allCount ? '+ Rede' : '+ Conectar'}</span>
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
              <option value="ssn">🥷 Social Ninja</option>
            </select>
            <input class="input sm" id="soc-new-target" placeholder="Link da live do YouTube (ou @canal/live)…">
            <button class="btn sm primary" id="soc-new-add">+ Conectar</button>
          </div>
          <span class="hint" id="soc-new-hint" style="font-size:11px">Conecte YouTube, Twitch ou Social Stream Ninja simultaneamente sem gastar cota de API.</span>
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
        <div class="soc-search-wrap ${st.searchQuery ? 'has-query' : ''}" id="soc-search-wrap">
          <svg class="search-icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input class="input sm" id="soc-search" placeholder="Filtrar por nome, texto ou doação..." value="${esc(st.searchQuery || '')}">
          <button type="button" class="soc-search-clear" id="soc-search-clear" title="Limpar busca" aria-label="Limpar busca" ${st.searchQuery ? '' : 'hidden'}>✕</button>
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

    // Conectar nova rede (com autodetecção de link e suporte a Enter)
    const newTypeSel = $('#soc-new-type', p);
    const newTargetInp = $('#soc-new-target', p);
    const newHintEl = $('#soc-new-hint', p);
    const syncNewTargetHint = () => {
      const v = newTypeSel?.value;
      if (newTargetInp) {
        newTargetInp.placeholder = v === 'twitch'
          ? 'Nome do canal da Twitch ou URL…'
          : v === 'ssn'
            ? 'Sessão do Social Stream Ninja ou URL (?session=)…'
            : 'Link da live do YouTube (ou @canal/live)…';
      }
      if (newHintEl) {
        newHintEl.textContent = v === 'ssn'
          ? 'No Social Stream Ninja, ligue "Send chat messages to API server" para receber o chat e destacar do dock.'
          : 'Conecte YouTube, Twitch ou Social Stream Ninja simultaneamente sem gastar cota de API.';
      }
    };
    if (newTypeSel) newTypeSel.onchange = syncNewTargetHint;
    if (newTargetInp) {
      newTargetInp.oninput = () => {
        const det = detectSocialTarget(newTargetInp.value);
        if (det && newTypeSel && newTypeSel.value !== det.type) {
          newTypeSel.value = det.type;
          syncNewTargetHint();
        }
      };
      newTargetInp.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          $('#soc-new-add', p)?.click();
        }
      };
    }
    $('#soc-new-add', p).onclick = async () => {
      const type = $('#soc-new-type', p).value;
      const target = $('#soc-new-target', p).value.trim();
      const ok = await addSource(type, target);
      if (ok) {
        $('#soc-new-target', p).value = '';
        toggleConnect(false);
        refreshList();
      }
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
        if (listEl.scrollHeight <= listEl.clientHeight + 30) {
          if (!isScrollLocked) {
            isUserBrowsing = false;
            unreadWhilePaused = 0;
            updateResumeFloat();
          }
          return;
        }
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
        if (e.deltaY < 0 && listEl.scrollHeight > listEl.clientHeight + 30) {
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
      syncSearchUi();
      refreshList();
    };
    const clrSearch = $('#soc-search-clear', p);
    if (clrSearch) {
      clrSearch.onclick = () => {
        st.searchQuery = '';
        const inp = $('#soc-search', p);
        if (inp) { inp.value = ''; inp.focus(); }
        syncSearchUi();
        refreshList();
      };
    }

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
    openConnect: () => {
      if (!panel) return;
      const box = $('#soc-box-connect', panel);
      const opt = $('#soc-box-options', panel);
      if (opt) opt.hidden = true;
      if (box) {
        box.hidden = false;
        $('#soc-new-target', box)?.focus();
      }
    },
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
    stop: () => {
      for (const s of ssnSources) {
        try { s.chatClient?.close(); } catch {}
        try { s.dockClient?.close(); } catch {}
      }
    },
  };
}

