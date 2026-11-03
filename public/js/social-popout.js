// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Controlador da janela popout de moderação de redes sociais
import { normalizeMessage, renderMessageHtml } from './studio/social.js';
import { platformOf } from './studio/overlays.js';

const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let ws = null;
const msgs = [];
const queue = [];
let autoSequence = false;
let autoDur = 8;
let currentFeatured = null;
let filterTab = 'all';
let searchQuery = '';
let slowMode = 0;
let autoSuperChat = true;
let lastMsgAt = 0;
let userScrolledUp = false;
let newCountWhilePaused = 0;
let focusMode = localStorage.getItem('castdeck.popout.focus') === 'true';
let density = localStorage.getItem('castdeck.popout.density') || 'normal';

const feed = $('#pop-feed');
const statusPill = $('#pop-status');
const sourcesHint = $('#pop-sources-hint');
const onairBar = $('#pop-onair');
const onairText = $('#pop-onair-text');
const btnResume = $('#pop-resume');

function setFocusMode(on) {
  focusMode = on;
  localStorage.setItem('castdeck.popout.focus', String(on));
  const tb = $('#pop-toolbar');
  const btn = $('#pop-btn-focus');
  const icon = $('#pop-focus-icon');
  const text = $('#pop-focus-text');
  if (tb) tb.classList.toggle('focus', on);
  if (btn) btn.classList.toggle('primary', on);
  if (icon) icon.textContent = on ? '⚡' : '🔍';
  if (text) text.textContent = on ? 'Foco Ativo' : 'Modo Foco';
}

function setDensity(d) {
  density = d;
  localStorage.setItem('castdeck.popout.density', d);
  const isCompact = d === 'compact';
  if (feed) feed.classList.toggle('compact', isCompact);
  const btn = $('#pop-btn-density');
  const text = $('#pop-density-text');
  if (btn) btn.classList.toggle('primary', isCompact);
  if (text) text.textContent = isCompact ? '𝄜 Compacto' : '☰ Padrão';
}

function syncAutoControls() {
  const chk = $('#pop-auto-seq');
  const sel = $('#pop-auto-dur');
  const wrap = $('#pop-auto-dur-wrap');
  if (chk) chk.checked = !!autoSequence;
  if (sel && autoDur) sel.value = String(autoDur);
  if (wrap) wrap.style.display = autoSequence ? 'flex' : 'none';
}

function connect() {
  statusPill.className = 'pill sm warn';
  statusPill.textContent = 'Conectando…';

  try {
    ws = new WebSocket(`ws://${location.host}/social-stream`);
    ws.onopen = () => {
      statusPill.className = 'pill sm ok';
      statusPill.textContent = 'Ao vivo';
      ws.send(JSON.stringify({ type: 'get-state' }));
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'state') {
          updateSources(data.sources || []);
          if (Array.isArray(data.queue)) {
            queue.splice(0, queue.length, ...data.queue);
          }
          if (typeof data.autoSequence === 'boolean') autoSequence = data.autoSequence;
          if (typeof data.autoDur === 'number') autoDur = data.autoDur;
          syncAutoControls();
          updateFeatured(data.featured);
          updateFilterCounts();
          updateQueueButtons();
        } else if (data.type === 'sources') {
          updateSources(data.sources || []);
        } else if (data.type === 'queue-update') {
          if (Array.isArray(data.queue)) {
            queue.splice(0, queue.length, ...data.queue);
          }
          updateFilterCounts();
          updateQueueButtons();
          if (filterTab === 'queue') renderList();
        } else if (data.type === 'auto-config') {
          if (typeof data.autoSequence === 'boolean') autoSequence = data.autoSequence;
          if (typeof data.autoDur === 'number') autoDur = data.autoDur;
          syncAutoControls();
        } else if (data.type === 'clear-source') {
          deleteMessagesForSource(data.sourceId, data.sourceType);
        } else if (data.type === 'clear-all') {
          clearAllMessages(false);
        } else if (data.type === 'featured') {
          updateFeatured(data.message);
        } else if (data.type === 'chat' && data.message) {
          handleIncomingMessage(data.message);
        }
      } catch {}
    };

    ws.onclose = () => {
      statusPill.className = 'pill sm err';
      statusPill.textContent = 'Desconectado';
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {};
  } catch {}
}

function updateSources(sources) {
  const active = sources.filter((s) => s.status === 'connected');
  sourcesHint.textContent = `${active.length} rede${active.length === 1 ? '' : 's'} ativa${active.length === 1 ? '' : 's'}`;
}

function updateFeatured(feat) {
  currentFeatured = feat || null;
  if (currentFeatured) {
    onairBar.style.display = 'flex';
    const pf = platformOf(currentFeatured.type);
    const renderedBody = renderMessageHtml(currentFeatured.tokens) || esc(currentFeatured.text || currentFeatured.chatmessage);
    onairText.innerHTML = `<b>${esc(currentFeatured.name || currentFeatured.chatname)}</b> <span class="soc-src sm" style="background:${pf.c};margin-right:6px">${esc(pf.l)}</span> ${renderedBody}`;
  } else {
    onairBar.style.display = 'none';
  }
  updateOnAirCards();
}

function deleteMessagesForSource(sourceId, sourceType) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    const match = (sourceId && m.sourceId === sourceId) ||
                  (!m.sourceId && sourceType && m.type === sourceType);
    if (match) msgs.splice(i, 1);
  }
  if (currentFeatured && ((sourceId && currentFeatured.sourceId === sourceId) || (!currentFeatured.sourceId && sourceType && currentFeatured.type === sourceType))) {
    updateFeatured(null);
  }
  renderList();
}

function clearAllMessages(broadcast = false) {
  msgs.length = 0;
  queue.length = 0;
  newCountWhilePaused = 0;
  btnResume.classList.remove('show');
  updateFeatured(null);
  updateFilterCounts();
  renderList();
  if (broadcast && ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'clear-all' }));
  }
}

function addToQueue(m) {
  if (!m || !m.id) return;
  if (!queue.some((x) => x.id === m.id)) {
    queue.push(m);
    if (queue.length > 200) queue.shift();
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'queue-add', message: m }));
    }
    updateFilterCounts();
    updateQueueButtons();
    if (filterTab === 'queue') renderList();
  }
}

function removeFromQueue(id) {
  const idx = queue.findIndex((x) => x.id === id);
  if (idx !== -1) {
    queue.splice(idx, 1);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'queue-remove', id }));
    }
    updateFilterCounts();
    updateQueueButtons();
    if (filterTab === 'queue') renderList();
  }
}

function toggleQueue(m) {
  if (queue.some((x) => x.id === m.id)) {
    removeFromQueue(m.id);
  } else {
    addToQueue(m);
  }
}

function clearQueue() {
  queue.length = 0;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'queue-clear' }));
  }
  updateFilterCounts();
  updateQueueButtons();
  if (filterTab === 'queue') renderList();
}

function nextSequence() {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'next-sequence' }));
  }
}

function updateQueueButtons() {
  const cards = $$('.soc-msg', feed);
  const queueIds = new Set(queue.map((m) => m.id));
  for (const c of cards) {
    const qBtn = $('[data-act="queue"]', c);
    if (qBtn) {
      const inQ = queueIds.has(c.dataset.id);
      qBtn.classList.toggle('in-queue', inQ);
      qBtn.innerHTML = inQ ? '✓ Na fila' : '+ Fila';
      qBtn.title = inQ ? 'Remover esta mensagem da fila' : 'Adicionar à fila';
    }
  }
}

// Atualiza apenas classes no DOM sem reconstruir o feed nem mexer no scroll
function updateOnAirCards() {
  const cards = $$('.soc-msg', feed);
  for (const card of cards) {
    const id = card.dataset.id;
    const isOn = currentFeatured && (currentFeatured.id === id || (currentFeatured.name === card.dataset.name && currentFeatured.text === card.dataset.text));
    card.classList.toggle('on', !!isOn);
    const btn = $('[data-act="toggle"]', card);
    if (btn) {
      btn.classList.toggle('on', !!isOn);
      btn.innerHTML = isOn ? '⏹ Tirar do ar' : '▶ Colocar no ar';
    }
  }
}

function toggleFeatured(m) {
  const isOn = currentFeatured && (currentFeatured.id === m.id || (currentFeatured.name === m.name && currentFeatured.text === m.text));
  if (isOn) {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'hide' }));
  } else {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'feature', message: m }));
  }
}

function handleIncomingMessage(raw) {
  const m = normalizeMessage(raw);
  if (!m || m.clear) return;

  // Throttling / Slow Mode
  const isDonation = !!m.donation;
  if (!isDonation) {
    if (slowMode === -1) return; // apenas doações
    if (slowMode > 0) {
      const now = Date.now();
      if (now - lastMsgAt < slowMode * 1000) return;
      lastMsgAt = now;
    }
  }

  msgs.push(m);
  if (msgs.length > 300) msgs.shift();

  updateFilterCounts();

  if (userScrolledUp) {
    newCountWhilePaused++;
    btnResume.innerHTML = `⬇ <b>${newCountWhilePaused}</b> novas mensagens (clique para voltar ao vivo)`;
    btnResume.classList.add('show');
  } else {
    appendMessage(m);
  }
}

function matchesFilter(m) {
  if (filterTab === 'queue') return queue.some((x) => x.id === m.id);
  if (filterTab === 'donations' && !m.donation) return false;
  if (filterTab === 'youtube' && m.type !== 'youtube') return false;
  if (filterTab === 'twitch' && m.type !== 'twitch') return false;
  const q = searchQuery.toLowerCase().trim();
  if (q) {
    const hitName = m.name?.toLowerCase().includes(q);
    const hitText = m.text?.toLowerCase().includes(q);
    const hitDon = m.donation?.toLowerCase().includes(q);
    if (!hitName && !hitText && !hitDon) return false;
  }
  return true;
}

function appendMessage(m) {
  if (!matchesFilter(m)) return;

  const emptyEl = $('.empty', feed);
  if (emptyEl) emptyEl.remove();

  const el = createMessageEl(m);
  feed.appendChild(el);

  while (feed.children.length > 120) {
    feed.removeChild(feed.firstElementChild);
  }

  feed.scrollTop = feed.scrollHeight;
}

function createMessageEl(m, queuePos = 0) {
  const pf = platformOf(m.type);
  const isOn = currentFeatured && (currentFeatured.id === m.id || (currentFeatured.name === m.name && currentFeatured.text === m.text));
  const isDon = !!m.donation;
  const inQueue = queue.some((x) => x.id === m.id);

  const el = document.createElement('div');
  el.className = `soc-msg ${isOn ? 'on' : ''} ${isDon ? 'superchat' : ''}`;
  el.dataset.id = m.id;
  el.dataset.sourceId = m.sourceId || '';
  el.dataset.type = m.type || '';
  el.dataset.name = m.name;
  el.dataset.text = m.text;
  el.title = "Duplo clique: colocar no ar direto no PGM";

  const body = renderMessageHtml(m.tokens) || esc(m.text || '');

  el.innerHTML = `
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
      <button class="btn-air ${isOn ? 'on' : ''}" data-act="toggle" title="Colocar ou tirar do ar no PGM">
        ${isOn ? '⏹ Tirar do ar' : '▶ Colocar no ar'}
      </button>
      <button class="btn sm ghost btn-q ${inQueue ? 'in-queue' : ''}" data-act="queue" title="${inQueue ? 'Remover da fila' : 'Adicionar à fila'}">
        ${inQueue ? '✓ Na fila' : '+ Fila'}
      </button>
      <span class="soc-dbl-hint">2 cliques = pôr no ar</span>
    </div>
  `;

  // Duplo clique coloca a mensagem no ar no PGM imediatamente!
  el.ondblclick = (e) => {
    if (e.target.closest('[data-act="queue"]')) return;
    e.preventDefault();
    e.stopPropagation();
    toggleFeatured(m);
  };

  $('[data-act="toggle"]', el).onclick = () => {
    toggleFeatured(m);
  };

  $('[data-act="queue"]', el).onclick = () => {
    toggleQueue(m);
  };

  return el;
}

function renderList() {
  let filtered;
  if (filterTab === 'queue') {
    filtered = [...queue];
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      filtered = filtered.filter((m) => m.name?.toLowerCase().includes(q) || m.text?.toLowerCase().includes(q) || m.donation?.toLowerCase().includes(q));
    }
  } else {
    filtered = msgs.filter(matchesFilter);
  }

  feed.innerHTML = '';

  if (filterTab === 'queue') {
    const queueBar = document.createElement('div');
    queueBar.className = 'soc-queue-bar';
    queueBar.innerHTML = `
      <div class="q-info">
        <span>📋</span>
        <span>${queue.length ? `${queue.length} mensagem(ns) na fila de exibição` : 'A fila está vazia'}</span>
      </div>
      <div class="q-actions">
        <button class="btn sm primary" id="pop-q-next" ${queue.length ? '' : 'disabled'} title="Colocar a próxima da fila no ar">▶ Próxima</button>
        <button class="btn sm ghost err" id="pop-q-clear" ${queue.length ? '' : 'disabled'} title="Esvaziar fila">🗑️ Limpar fila</button>
      </div>
    `;
    const btnNext = $('#pop-q-next', queueBar);
    const btnClr = $('#pop-q-clear', queueBar);
    if (btnNext) btnNext.onclick = nextSequence;
    if (btnClr) btnClr.onclick = clearQueue;
    feed.appendChild(queueBar);
  }

  if (!filtered.length) {
    const emptyMsg = filterTab === 'queue'
      ? 'Nenhuma mensagem na fila. Clique em "+ Fila" nos cards para adicionar mensagens à sequência.'
      : 'Nenhuma mensagem para este filtro.';
    feed.innerHTML += `<div class="empty" style="padding:40px 20px;text-align:center;color:var(--text-1)">${emptyMsg}</div>`;
    return;
  }

  const shown = filterTab === 'queue' ? filtered : filtered.slice(-120);
  for (let i = 0; i < shown.length; i++) {
    feed.appendChild(createMessageEl(shown[i], filterTab === 'queue' ? i + 1 : 0));
  }

  if (!userScrolledUp && filterTab !== 'queue') {
    feed.scrollTop = feed.scrollHeight;
  }

  updateFilterCounts();
}

function updateFilterCounts() {
  const total = msgs.length;
  const qCount = queue.length;
  const donCount = msgs.filter((m) => !!m.donation).length;
  const ytCount = msgs.filter((m) => m.type === 'youtube').length;
  const twCount = msgs.filter((m) => m.type === 'twitch').length;

  const btnAll = $('[data-tab="all"]');
  const btnQ = $('[data-tab="queue"]');
  const btnDon = $('[data-tab="donations"]');
  const btnYt = $('[data-tab="youtube"]');
  const btnTw = $('[data-tab="twitch"]');

  if (btnAll) btnAll.textContent = `Todas (${total})`;
  if (btnQ) btnQ.textContent = `📋 Fila (${qCount})`;
  if (btnDon) btnDon.textContent = `⭐ Super Chats (${donCount})`;
  if (btnYt) btnYt.textContent = `🔴 YouTube (${ytCount})`;
  if (btnTw) btnTw.textContent = `🟣 Twitch (${twCount})`;
}

// Detecção de scroll para pausar rolagem
feed.addEventListener('scroll', () => {
  const distFromBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight;
  if (distFromBottom > 60) {
    userScrolledUp = true;
  } else {
    userScrolledUp = false;
    newCountWhilePaused = 0;
    btnResume.classList.remove('show');
  }
});

feed.addEventListener('wheel', (e) => {
  if (e.deltaY < 0) {
    userScrolledUp = true;
  }
}, { passive: true });

btnResume.onclick = () => {
  userScrolledUp = false;
  newCountWhilePaused = 0;
  btnResume.classList.remove('show');
  renderList();
  feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
};

// Ações do cabeçalho
$('#pop-onair-hide').onclick = () => {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'hide' }));
};

$('#pop-clear').onclick = () => {
  if (!msgs.length) return;
  if (!window.confirm('Deseja realmente apagar todas as mensagens da lista de chat?')) return;
  clearAllMessages(true);
};

// Filtro de abas
$$('.soc-chip[data-tab]').forEach((b) => {
  b.onclick = () => {
    $$('.soc-chip[data-tab]').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    filterTab = b.dataset.tab;
    renderList();
  };
});

// Busca em tempo real
$('#pop-search').oninput = (e) => {
  searchQuery = e.target.value;
  renderList();
};

// Redução de volume
$('#pop-slow').onchange = (e) => {
  slowMode = parseInt(e.target.value, 10);
};

// Auto Super Chat
$('#pop-auto-sc').onchange = (e) => {
  autoSuperChat = e.target.checked;
};

// Auto Sequência (Carrossel no PGM)
$('#pop-auto-seq').onchange = (e) => {
  autoSequence = e.target.checked;
  syncAutoControls();
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'auto-config', autoSequence, autoDur }));
  }
};

$('#pop-auto-dur').onchange = (e) => {
  autoDur = parseInt(e.target.value, 10) || 8;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'auto-config', autoSequence, autoDur }));
  }
};

$('#pop-next-seq').onclick = nextSequence;

// Modo Foco e Densidade na Moderação Externa
$('#pop-btn-focus').onclick = () => {
  setFocusMode(!focusMode);
};

$('#pop-btn-density').onclick = () => {
  setDensity(density === 'compact' ? 'normal' : 'compact');
};

// Botão de fixar no topo (Always on Top via Picture-in-Picture nativo)
const pinBtn = $('#pop-pin');
let pipWin = null;
if (pinBtn) {
  const updatePinUi = (on) => {
    pinBtn.classList.toggle('active', on);
    pinBtn.setAttribute('aria-pressed', String(on));
    const lbl = $('#pop-pin-lbl');
    if (lbl) lbl.textContent = on ? 'Fixado no topo 📌' : 'Fixar no topo';
  };

  pinBtn.onclick = async () => {
    if (pipWin) {
      pipWin.close();
      pipWin = null;
      updatePinUi(false);
      return;
    }
    if ('documentPictureInPicture' in window) {
      try {
        pipWin = await window.documentPictureInPicture.requestWindow({
          width: Math.min(window.outerWidth || 560, 800),
          height: Math.min(window.outerHeight || 800, 900),
        });
        [...document.styleSheets].forEach((sheet) => {
          try {
            if (sheet.href) {
              const link = document.createElement('link');
              link.rel = 'stylesheet';
              link.href = sheet.href;
              pipWin.document.head.appendChild(link);
            } else if (sheet.cssRules) {
              const style = document.createElement('style');
              [...sheet.cssRules].forEach((r) => (style.textContent += r.cssText));
              pipWin.document.head.appendChild(style);
            }
          } catch {}
        });
        const content = document.createDocumentFragment();
        const main = $('#pop-feed');
        const toolbar = $('#pop-toolbar');
        const onair = $('#pop-onair');

        const ph = document.createElement('div');
        ph.id = 'pip-soc-ph';
        ph.style.cssText = 'padding:40px;text-align:center;color:var(--text-1);display:flex;flex-direction:column;align-items:center;gap:12px;margin:auto;';
        ph.innerHTML = '<div><b>Central de moderação fixada no topo</b><div style="font-size:12px;color:var(--text-2);margin-top:4px">A janela está suspensa sobre os outros aplicativos (Picture-in-Picture).</div></div><button class="btn sm ghost" id="btn-return-pip" style="gap:6px"><span>↩</span> Trazer de volta</button>';
        
        main.parentNode.insertBefore(ph, main);
        if (onair) pipWin.document.body.appendChild(onair);
        if (toolbar) pipWin.document.body.appendChild(toolbar);
        if (main) pipWin.document.body.appendChild(main);
        pipWin.document.body.style.cssText = 'margin:0;padding:0;background:var(--bg-0,#0a0a12);color:var(--text-0,#fff);font-family:Inter,system-ui,sans-serif;height:100vh;overflow:hidden;display:flex;flex-direction:column;';

        updatePinUi(true);

        const returnFromPip = () => {
          if (!pipWin) return;
          if (onair) ph.parentNode.insertBefore(onair, ph);
          if (toolbar) ph.parentNode.insertBefore(toolbar, ph);
          if (main) ph.parentNode.insertBefore(main, ph);
          ph.remove();
          pipWin = null;
          updatePinUi(false);
        };

        pipWin.addEventListener('pagehide', returnFromPip);
        $('#btn-return-pip')?.addEventListener('click', () => pipWin?.close());
      } catch (err) {
        console.warn('PiP não disponível ou cancelado:', err);
        updatePinUi(!pinBtn.classList.contains('active'));
      }
    } else {
      updatePinUi(!pinBtn.classList.contains('active'));
    }
  };
}

// Atalho Esc para tirar do ar
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && currentFeatured) {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'hide' }));
  }
});

setFocusMode(focusMode);
setDensity(density);
connect();
