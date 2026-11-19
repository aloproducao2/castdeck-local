// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Aba Sorteio (Interatividade): inscrições via QR Code (/raffle/:id) e chat ao vivo,
// exibição do QR no PGM sob comando do operador e roleta animada para escolher o ganhador.

import { renderQr } from './widgets-draw.js';

export function createRaffle({
  S, comp, $, $$, esc, toast, icons, saveStudio, api, studioId, onAir,
}) {
  let panel = null;
  let syncTimer = 0;
  let spinTimer = 0;
  let spinName = '';
  let spinReel = [];
  let spinStart = 0;
  let spinDuration = 3600;
  let winAt = 0;
  let air = false;
  let search = '';
  let raffleBase = '';
  let localOnly = true;
  let baseAt = 0;

  function state() {
    if (!S.brand.raffle || typeof S.brand.raffle !== 'object') {
      S.brand.raffle = {
        id: 'rf-' + Date.now().toString(36),
        round: 1,
        title: 'Sorteio da Live',
        keyword: '#euquero',
        askContact: false,
        contactLabel: '@Instagram ou WhatsApp',
        noRepeat: true,
        pos: 'br',
        status: 'open', // 'open' | 'spinning' | 'winner' | 'closed'
        entries: [],
        winners: [],
        lastWinner: null,
      };
    }
    return S.brand.raffle;
  }

  function raffleUrl() {
    const base = raffleBase || S.system?.tunnel?.url || S.system?.lan?.[0]?.url || location.origin;
    return `${String(base).replace(/\/+$/, '')}/raffle/${encodeURIComponent(studioId)}`;
  }

  async function refreshBase(force = false) {
    if (!api || (!force && Date.now() - baseAt < 15000)) return;
    baseAt = Date.now();
    try {
      const sys = await api('/system');
      if (sys) S.system = sys;
      const t = sys?.tunnel?.url || '';
      const base = t || sys?.lan?.[0]?.url || location.origin;
      const loc = !t;
      if (base !== raffleBase || loc !== localOnly) {
        raffleBase = base;
        localOnly = loc;
        renderPanel();
      }
    } catch {}
  }

  function syncServer() {
    const rf = state();
    if (!air && rf.status !== 'open' && rf.status !== 'spinning' && rf.status !== 'winner') return;
    api(`/studios/${encodeURIComponent(studioId)}/raffle`, {
      method: 'POST',
      body: {
        raffle: {
          id: rf.id,
          round: rf.round,
          title: rf.title,
          keyword: rf.keyword,
          state: rf.status,
          askContact: !!rf.askContact,
          contactLabel: rf.contactLabel,
          count: rf.entries.length,
          spinName,
          winner: rf.lastWinner,
        },
      },
    }).then((res) => {
      if (!Array.isArray(res?.entries) || !res.entries.length) return;
      let added = 0;
      const seen = new Set(rf.entries.map((e) => e.key));
      for (const e of res.entries) {
        if (!e?.key || seen.has(e.key)) continue;
        seen.add(e.key);
        rf.entries.push({
          key: e.key,
          name: e.name,
          contact: e.contact || '',
          ticketNo: e.ticketNo || rf.entries.length + 1,
          source: e.source || 'QR',
          at: e.at || Date.now(),
        });
        added++;
      }
      if (added) {
        saveStudio();
        renderPanel();
      }
    }).catch(() => {});
  }

  function startSync() {
    if (syncTimer) return;
    syncServer();
    syncTimer = setInterval(syncServer, 1300);
  }

  function stopSync() {
    if (!syncTimer) return;
    clearInterval(syncTimer);
    syncTimer = 0;
  }

  function showOnAir() {
    const rf = state();
    refreshBase?.(true);
    comp.wg.show(
      'raffle',
      'raffle',
      () => {
        const cur = state();
        return {
          title: cur.title,
          keyword: cur.keyword,
          state: cur.status,
          showQr: cur.status === 'open',
          raffleUrl: raffleUrl(),
          count: cur.entries.length,
          spinName,
          spinReel,
          spinStart,
          spinDuration,
          winAt,
          winner: cur.lastWinner,
        };
      },
      rf.pos || 'br',
    );
    air = true;
    startSync();
    onAir?.();
    renderPanel();
  }

  function hideFromAir() {
    if (spinTimer) {
      clearTimeout(spinTimer);
      spinTimer = 0;
    }
    spinReel = [];
    spinStart = 0;
    winAt = 0;
    comp.wg.hide('raffle');
    air = false;
    onAir?.();
    renderPanel();
  }

  function clearAir() {
    if (air) hideFromAir();
  }

  function pickRandomIndex(len) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % len;
  }

  function buildSpinReel(pool, winner) {
    const reel = [];
    if (pool.length === 1) {
      const p = pool[0];
      const frames = ['🎲 Embaralhando…', p.name, '✨ Misturando…', `#${p.ticketNo || 1} ${p.name}`];
      for (let i = 0; i < 23; i++) reel.push(frames[i % frames.length]);
      reel.push(winner.name);
      return reel;
    }
    for (let i = 0; i < 31; i++) {
      let cand = pool[pickRandomIndex(pool.length)].name;
      if (reel.length && cand === reel[reel.length - 1]) {
        cand = pool[(pickRandomIndex(pool.length - 1) + pool.findIndex((x) => x.name === cand) + 1) % pool.length].name;
      }
      reel.push(cand);
    }
    if (reel[reel.length - 1] === winner.name) {
      const alt = pool.find((x) => x.name !== winner.name);
      if (alt) reel[reel.length - 1] = alt.name;
    }
    reel.push(winner.name);
    return reel;
  }

  function drawWinner() {
    const rf = state();
    if (rf.status === 'spinning') return;
    const prevKeys = new Set(rf.noRepeat ? rf.winners.map((w) => w.key) : []);
    const pool = rf.entries.filter((e) => !prevKeys.has(e.key));
    if (!pool.length) {
      toast(rf.entries.length ? 'Todos os participantes já foram sorteados.' : 'Nenhum participante inscrito ainda.', 'warn');
      return;
    }
    rf.status = 'spinning';
    rf.lastWinner = null;
    const winner = pool[pickRandomIndex(pool.length)];
    spinDuration = 3600;
    spinReel = buildSpinReel(pool, winner);
    spinStart = performance.now();
    winAt = 0;
    spinName = spinReel[0] || winner.name;
    if (!air) showOnAir();

    const tick = () => {
      const elapsed = performance.now() - spinStart;
      if (elapsed >= spinDuration) {
        spinTimer = 0;
        rf.status = 'winner';
        winAt = performance.now();
        rf.lastWinner = { ...winner };
        if (!rf.winners.some((w) => w.key === winner.key)) rf.winners.push({ ...winner });
        spinName = '';
        saveStudio();
        syncServer();
        renderPanel();
        toast(`🏆 Ganhador: ${winner.name}${winner.ticketNo ? ` (#${winner.ticketNo})` : ''}`, 'ok');
        return;
      }
      const t = Math.max(0, Math.min(1, elapsed / spinDuration));
      const eased = 1 - Math.pow(1 - t, 4);
      const idx = Math.min(spinReel.length - 1, Math.floor(eased * (spinReel.length - 1)));
      spinName = spinReel[idx] || pool[pickRandomIndex(pool.length)].name;
      const delay = Math.round(70 + t * t * 180);
      spinTimer = setTimeout(tick, delay);
    };
    tick();
    syncServer();
    renderPanel();
  }

  function resetEntries() {
    const rf = state();
    if (spinTimer) {
      clearTimeout(spinTimer);
      spinTimer = 0;
    }
    rf.entries = [];
    rf.winners = [];
    rf.lastWinner = null;
    rf.status = 'open';
    rf.round = (rf.round || 1) + 1;
    spinName = '';
    spinReel = [];
    spinStart = 0;
    winAt = 0;
    saveStudio();
    syncServer();
    renderPanel();
  }

  function onChatMessage({ key, author, text }) {
    const rf = state();
    if (rf.status !== 'open') return false;
    const kw = (rf.keyword || '').trim().toLowerCase();
    if (!kw) return false;
    const msg = String(text || '').trim().toLowerCase();
    if (!msg.includes(kw)) return false;
    const cleanKey = 'chat:' + String(key || author || '').toLowerCase().trim();
    if (!cleanKey || rf.entries.some((e) => e.key === cleanKey)) return false;
    rf.entries.push({
      key: cleanKey,
      name: String(author || 'Participante').slice(0, 60),
      contact: '',
      ticketNo: rf.entries.length + 1,
      source: 'Chat',
      at: Date.now(),
    });
    saveStudio();
    renderPanel();
    return true;
  }

  function render(el) {
    panel = el;
    refreshBase(true);
    renderPanel();
  }

  function renderPanel() {
    const p = panel;
    if (!p) return;
    const rf = state();
    const url = raffleUrl();
    const q = search.trim().toLowerCase();
    const shown = q
      ? rf.entries.filter((e) => e.name.toLowerCase().includes(q) || (e.contact || '').toLowerCase().includes(q))
      : rf.entries;

    p.innerHTML = `
      <div class="rf-head">
        <div>
          <h3>🎁 Sorteio ao vivo</h3>
          <p class="hint">QR Code na tela sob seu comando + captura automática do chat.</p>
        </div>
        <span class="rf-count-pill">${rf.entries.length} ${rf.entries.length === 1 ? 'inscrito' : 'inscritos'}</span>
      </div>

      <div class="rf-form card">
        <label>Prêmio / Título</label>
        <input class="input" id="rf-title" value="${esc(rf.title)}" maxlength="120" placeholder="Ex.: Camisa Oficial + Boné">

        <div class="rf-row-2">
          <div>
            <label>Palavra-chave no chat</label>
            <input class="input" id="rf-kw" value="${esc(rf.keyword)}" maxlength="32" placeholder="#euquero (vazio = só QR)">
          </div>
          <div>
            <label>Posição na tela</label>
            <select class="input" id="rf-pos">
              <option value="br" ${rf.pos === 'br' ? 'selected' : ''}>Embaixo à direita</option>
              <option value="bl" ${rf.pos === 'bl' ? 'selected' : ''}>Embaixo à esquerda</option>
              <option value="tr" ${rf.pos === 'tr' ? 'selected' : ''}>Em cima à direita</option>
              <option value="tl" ${rf.pos === 'tl' ? 'selected' : ''}>Em cima à esquerda</option>
              <option value="mc" ${rf.pos === 'mc' ? 'selected' : ''}>Centro da tela</option>
            </select>
          </div>
        </div>

        <label class="check"><input type="checkbox" id="rf-ask-contact" ${rf.askContact ? 'checked' : ''}><span>Pedir contato no QR (@Instagram / WhatsApp)</span></label>
        <label class="check"><input type="checkbox" id="rf-norepeat" ${rf.noRepeat ? 'checked' : ''}><span>Não repetir ganhador anterior</span></label>

        <div class="rf-actions">
          ${air
            ? `<button class="btn danger" id="rf-hide">✕ Tirar da tela</button>`
            : `<button class="btn primary" id="rf-show-qr">📱 Mostrar QR na tela</button>`}
          <button class="btn" id="rf-copy" title="Copiar link de inscrição">Copiar link</button>
        </div>

        <div class="rf-qr-preview">
          <canvas id="rf-qr-cv" width="96" height="96"></canvas>
          <div class="rf-qr-meta">
            <b>Link de inscrição</b>
            <small>${esc(url)}</small>
            ${localOnly ? '<span class="rf-local-warn">Túnel desligado: funciona no Wi-Fi local. Ligue o Túnel em Conexão para a internet.</span>' : '<span class="rf-ok-tag">● Túnel público ativo</span>'}
          </div>
        </div>

        <div class="rf-draw-row">
          <button class="btn primary rf-draw-btn" id="rf-draw" ${rf.status === 'spinning' || !rf.entries.length ? 'disabled' : ''}>
            ${rf.status === 'spinning' ? '🎲 Sorteando…' : rf.lastWinner ? '🎲 Sortear outro' : '🎲 Sortear agora'}
          </button>
          <button class="btn sm" id="rf-toggle-open" title="Abrir/fechar novas inscrições">${rf.status === 'closed' ? '🔓 Reabrir' : '🔒 Pausar entradas'}</button>
        </div>
      </div>

      ${rf.lastWinner ? `
        <div class="rf-winner-card">
          <b>🏆 ÚLTIMO GANHADOR</b>
          <strong>${esc(rf.lastWinner.name)}</strong>
          <small>#${rf.lastWinner.ticketNo || '—'} · via ${esc(rf.lastWinner.source || 'QR')}${rf.lastWinner.contact ? ` · ${esc(rf.lastWinner.contact)}` : ''}</small>
        </div>
      ` : ''}

      <div class="rf-list-box">
        <div class="rf-list-head">
          <input type="search" class="input sm" id="rf-search" value="${esc(search)}" placeholder="Buscar participante…">
          <button class="btn sm ghost" id="rf-clear" ${rf.entries.length ? '' : 'disabled'}>Limpar</button>
        </div>
        <div class="rf-list">
          ${shown.length ? shown.slice().reverse().map((e) => `
            <div class="rf-item">
              <span class="rf-ticket">#${e.ticketNo}</span>
              <div class="rf-item-info">
                <b>${esc(e.name)}</b>
                ${e.contact ? `<small>${esc(e.contact)}</small>` : ''}
              </div>
              <span class="rf-src">${esc(e.source || 'QR')}</span>
              <button class="btn sm icon" data-rf-rm="${esc(e.key)}" title="Remover">✕</button>
            </div>
          `).join('') : `<p class="hint" style="text-align:center;padding:12px 4px">${rf.entries.length ? 'Nenhum resultado.' : 'Nenhum inscrito ainda. Mostre o QR na tela ou peça para comentarem no chat!'}</p>`}
        </div>
      </div>`;

    const qcv = $('#rf-qr-cv', p);
    if (qcv && url) {
      const rendered = renderQr({ url, useBrand: true }, (s) => comp?.image?.(s), S.brand?.color || '#7c5cff');
      if (rendered) {
        const ctx = qcv.getContext('2d');
        ctx.clearRect(0, 0, qcv.width, qcv.height);
        ctx.drawImage(rendered, 0, 0, qcv.width, qcv.height);
      }
    }
    $('#rf-title', p).oninput = (e) => {
      rf.title = e.target.value;
      saveStudio();
    };
    $('#rf-kw', p).oninput = (e) => {
      rf.keyword = e.target.value;
      saveStudio();
    };
    $('#rf-pos', p).onchange = (e) => {
      rf.pos = e.target.value;
      if (air) showOnAir();
      saveStudio();
    };
    $('#rf-ask-contact', p).onchange = (e) => {
      rf.askContact = e.target.checked;
      saveStudio();
      syncServer();
    };
    $('#rf-norepeat', p).onchange = (e) => {
      rf.noRepeat = e.target.checked;
      saveStudio();
    };
    $('#rf-show-qr', p)?.addEventListener('click', () => {
      if (rf.status === 'winner' || rf.status === 'closed') rf.status = 'open';
      showOnAir();
    });
    $('#rf-hide', p)?.addEventListener('click', hideFromAir);
    $('#rf-copy', p).onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast('Link do sorteio copiado!', 'ok');
      } catch {
        toast(url, 'info');
      }
    };
    $('#rf-draw', p).onclick = drawWinner;
    $('#rf-toggle-open', p).onclick = () => {
      rf.status = rf.status === 'closed' ? 'open' : 'closed';
      saveStudio();
      syncServer();
      renderPanel();
    };
    $('#rf-search', p).oninput = (e) => {
      search = e.target.value;
      renderPanel();
    };
    $('#rf-clear', p).onclick = resetEntries;
    $$('[data-rf-rm]', p).forEach((b) => {
      b.onclick = () => {
        rf.entries = rf.entries.filter((x) => x.key !== b.dataset.rfRm);
        saveStudio();
        renderPanel();
      };
    });
  }

  return {
    render,
    showOnAir,
    hideFromAir,
    clearAir,
    drawWinner,
    onChatMessage,
    isActive: () => air,
    destroy: stopSync,
  };
}
