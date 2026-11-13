// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Drones e câmeras profissionais (RTMP/SRT) nos bastidores do estúdio.
//
// O servidor (server/ingest.js) recebe a transmissão no MediaMTX embutido e, se preciso, converte para
// H.264/Opus. Aqui o estúdio só "assiste" por WHEP (WebRTC recvonly, tudo em 127.0.0.1): a fonte entra como
// uma câmera comum, com o áudio no mixer (só vai ao ar quando ela está no palco, como as câmeras extras).

const POLL_MS = 750;

export function createIngest(ctx) {
  const { S, studioId, api, $, esc, toast, modal, copyText, qrSvg, addVideoSource, removeSource, mixer, renderAudioPanel } = ctx;
  const LS = 'castdeck.ingest.' + studioId;
  const conns = new Map(); // chave -> { pc, stream, play, busy, retryAt, label }
  let info = null;
  let timer = null;
  let modalEl = null; // modal aberto (para atualizar a lista ao vivo)
  let openKey = null; // entrada com os endereços expandidos
  let qrMode = 'rtmp';

  const sid = (key) => 'ingest:' + key;
  const persist = () => {
    try {
      localStorage.setItem(LS, JSON.stringify([...conns.keys()]));
    } catch {}
  };
  const srcInfo = (key) => info?.sources?.find((s) => s.key === key);
  const fmtRate = (k) => (k >= 1000 ? (k / 1000).toFixed(1) + ' Mbps' : k + ' kbps');

  async function refresh() {
    try {
      info = await api('/ingest');
    } catch {
      info = null;
    }
    return info;
  }

  // ---------- conexão WHEP ----------
  function dropConn(key, { keepSource = true } = {}) {
    const c = conns.get(key);
    if (!c) return;
    try {
      c.pc?.close();
    } catch {}
    c.pc = null;
    c.play = null;
    c.stream = null;
    c.audioTrack = null;
    mixer()?.remove(sid(key) + ':audio');
    // a miniatura fica nos bastidores como "sem sinal": se o drone voltar, a imagem volta sozinha
    if (keepSource && S.sources.has(sid(key))) addVideoSource(sid(key), null, { camOff: true, ingestLive: false });
  }

  const waitIce = (pc, ms) =>
    new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, ms);
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(t);
          res();
        }
      });
    });

  async function connect(key) {
    const c = conns.get(key);
    const si = srcInfo(key);
    if (!c || c.busy || !si?.play || Date.now() < (c.retryAt || 0)) return;
    c.busy = true;
    dropConn(key);
    // tudo acontece em 127.0.0.1: sem STUN/TURN (candidatos de host bastam e conectam na hora)
    const pc = new RTCPeerConnection({ iceServers: [] });
    try {
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      const stream = new MediaStream();
      c.stream = stream;
      // O ontrack de áudio pode chegar depois do setRemoteDescription; não basta ler
      // stream.getAudioTracks()[0] imediatamente, senão a fonte MediaMTX fica sem canal no Mixer.
      const syncAudio = () => {
        if (conns.get(key) !== c || c.stream !== stream) return;
        const at = stream.getAudioTracks()[0];
        if (!at || c.audioTrack === at) return;
        c.audioTrack = at;
        // Toda fonte MediaMTX (RTMP, SRT ou NDI) vai para o retorno padrão do host (monitorBus)
        // para que o operador ouça a entrada no fone antes/junto de colocá-la no palco.
        mixer()?.addStream(sid(key) + ':audio', new MediaStream([at]), { ownerId: 'host', stageKey: sid(key), monitor: true });
        if (S.tab === 'audio') renderAudioPanel?.();
      };
      pc.ontrack = (e) => {
        stream.addTrack(e.track);
        if (e.track.kind === 'audio') {
          e.track.onunmute = () => {
            syncAudio();
            mixer()?.sources?.get(sid(key) + ':audio')?.keepAlive?.play?.().catch(() => {});
            mixer()?.resume?.();
          };
          e.track.onended = () => { c.audioTrack = null; mixer()?.remove(sid(key) + ':audio'); };
          syncAudio();
        }
      };
      await pc.setLocalDescription(await pc.createOffer());
      await waitIce(pc, 700);
      const r = await fetch(`/api/ingest/whep/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription.sdp,
      });
      const body = await r.text();
      if (!r.ok) throw new Error(body || 'HTTP ' + r.status);
      await pc.setRemoteDescription({ type: 'answer', sdp: body });
      if (conns.get(key) !== c) return pc.close(); // removida enquanto conectava
      c.pc = pc;
      c.stream = stream;
      c.play = r.headers.get('X-Ingest-Path') || si.play;
      const live = () => {
        if (c.pc !== pc || c.shown) return;
        c.shown = true;
        addVideoSource(sid(key), stream, { camOff: false, ingestLive: true });
      };
      c.shown = false;
      pc.onconnectionstatechange = () => {
        if (c.pc !== pc) return;
        if (pc.connectionState === 'connected') live();
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          dropConn(key);
          c.retryAt = Date.now() + 1500;
        }
      };
      // ICE que não sai de "checking" (rede/firewall estranhos): desiste e tenta de novo no próximo ciclo
      setTimeout(() => {
        if (c.pc === pc && pc.connectionState !== 'connected') {
          console.warn('[ingest] WebRTC não conectou:', key, pc.connectionState);
          dropConn(key);
          c.retryAt = Date.now() + 2000;
        }
      }, 8000);
      if (pc.connectionState === 'connected') live();
      syncAudio();
      c.retryAt = 0;
    } catch (e) {
      try {
        pc.close();
      } catch {}
      console.warn('[ingest] WHEP', key, e.message);
      c.retryAt = Date.now() + 3000;
    } finally {
      c.busy = false;
    }
  }

  // acompanha o servidor: liga/desliga a imagem conforme o drone transmite (ou a conversão troca de caminho)
  async function tick() {
    if (!conns.size && !modalEl) return stopPoll();
    await refresh();
    for (const [key, c] of conns) {
      const si = srcInfo(key);
      if (!si) {
        // entrada excluída (em outra janela ou no Painel): sai dos bastidores
        removeSource(sid(key));
        continue;
      }
      const s = S.sources.get(sid(key));
      if (s && !s.custom && s.label !== si.name) addVideoSource(sid(key), undefined, { label: si.name });
      if (!si.play) {
        if (c.pc) dropConn(key);
      } else if (!c.pc || c.play !== si.play) connect(key);
    }
    if (modalEl?.isConnected) renderList();
    else modalEl = null;
  }
  function startPoll() {
    if (!timer) timer = setInterval(tick, POLL_MS);
  }
  function stopPoll() {
    clearInterval(timer);
    timer = null;
  }

  // ---------- bastidores ----------
  async function addToStudio(key, { silent = false } = {}) {
    // A fonte pode ter sido criada agora pelo painel NDI e ainda não estar no snapshot de /api/ingest.
    if (!srcInfo(key)) await refresh();
    const si = srcInfo(key);
    if (!si) return false;
    if (!conns.has(key)) conns.set(key, { pc: null, stream: null, play: null, busy: false, retryAt: 0 });
    if (!S.sources.has(sid(key))) addVideoSource(sid(key), null, { kind: 'camera', label: si.name, ownerId: 'host', ingest: true, ingestKey: key, camOff: true, ingestLive: false });
    persist();
    connect(key);
    startPoll();
    if (!silent) toast(`“${si.name}” nos bastidores${si.live ? '' : ' — aguardando o sinal'}`, 'ok');
    return true;
  }

  // chamado por removeSource() do estúdio (lixeira da miniatura, reset da cena…)
  function sourceRemoved(id) {
    if (!id.startsWith('ingest:')) return;
    const key = id.slice(7);
    if (!conns.has(key)) return;
    dropConn(key, { keepSource: false });
    conns.delete(key);
    persist();
  }

  async function restore() {
    let keys = [];
    try {
      keys = JSON.parse(localStorage.getItem(LS) || '[]');
    } catch {}
    if (!Array.isArray(keys) || !keys.length) return;
    await refresh();
    if (!info?.enabled) return;
    for (const k of keys) if (srcInfo(k)) addToStudio(k, { silent: true });
  }

  // ---------- janela de gerenciamento ----------
  function statusPill() {
    if (!info) return '<span class="pill">Servidor indisponível</span>';
    if (!info.enabled) return '<span class="pill">Desligado</span>';
    return {
      on: '<span class="pill ok">● Recebendo</span>',
      starting: '<span class="pill warn">Ligando…</span>',
      error: '<span class="pill err">Erro</span>',
      off: '<span class="pill">Desligado</span>',
    }[info.status] || '';
  }

  function sourceCard(s) {
    const inStudio = conns.has(s.key);
    const meta = s.live
      ? [s.protocol, s.video && (s.converting && s.video !== 'H264' ? `${s.video} → H.264` : s.video), s.audio && s.audio.replace('MPEG-4 Audio', 'AAC'), fmtRate(s.kbps)].filter(Boolean).join(' · ')
      : 'Sem sinal — configure o aparelho com um dos endereços abaixo';
    const open = openKey === s.key;
    const urls = s.urls;
    const qrUrl = qrMode === 'srt' ? urls.srt : urls.rtmp;
    const row = (label, val) => `<div class="ing-url"><span>${label}</span><code>${esc(val)}</code><button class="btn ghost sm icon" data-copy="${esc(val)}" title="Copiar">⧉</button></div>`;
    return `
      <div class="ing-src${s.live ? ' live' : ''}" data-key="${s.key}">
        <div class="ing-src-head">
          <span class="ing-dot" title="${s.live ? 'Ao vivo' : 'Sem sinal'}"></span>
          <div class="ing-src-txt">
            <strong>${esc(s.name)}</strong>
            <small>${esc(meta)}${s.converting ? ' <b class="ing-conv" title="O navegador não toca este formato direto: o CastDeck converte em tempo real">convertendo</b>' : ''}</small>
            ${s.convertError ? `<small class="ing-errtxt">${esc(s.convertError)}</small>` : ''}
          </div>
          <div class="ing-src-acts">
            <button class="btn sm ${inStudio ? 'primary' : ''}" data-act="studio" aria-pressed="${inStudio}" title="${inStudio ? 'Está nos bastidores. Clique para tirar (a entrada continua cadastrada)' : 'Colocar nos bastidores do estúdio'}">${inStudio ? '✓ Nos bastidores' : '＋ Bastidores'}</button>
            <button class="btn ghost sm" data-act="urls" aria-expanded="${open}">${open ? 'Ocultar' : 'Endereços'}</button>
            <button class="btn ghost sm icon" data-act="rename" title="Renomear">✎</button>
            <button class="btn ghost sm icon danger" data-act="del" title="Excluir entrada">🗑</button>
          </div>
        </div>
        ${open ? `
        <div class="ing-urls">
          <div class="ing-urls-list">
            <p class="hint">Drone, celular (Larix, DJI Fly…) ou encoder: cole o endereço completo.</p>
            ${row('RTMP', urls.rtmp)}
            ${row('SRT', urls.srt)}
            <p class="hint">Se o aparelho pede <b>servidor</b> e <b>chave</b> separados (OBS, vMix):</p>
            ${row('Servidor', urls.rtmpServer)}
            ${row('Chave', urls.rtmpKey)}
          </div>
          <div class="ing-qr">
            <div class="ing-qr-code">${qrSvg(qrUrl)}</div>
            <div class="ing-qr-seg"><button class="${qrMode === 'rtmp' ? 'on' : ''}" data-qr="rtmp">RTMP</button><button class="${qrMode === 'srt' ? 'on' : ''}" data-qr="srt">SRT</button></div>
          </div>
        </div>` : ''}
      </div>`;
  }

  // assinatura do que aparece na lista: só redesenha quando algo mudou (não atrapalha cliques nem seleção de texto)
  let lastSig = '';
  function renderList(force = false) {
    const m = modalEl;
    if (!m) return;
    const sig = JSON.stringify([info, openKey, qrMode, [...conns.keys()]]);
    if (!force && sig === lastSig) return;
    lastSig = sig;
    const on = !!info?.enabled;
    $('#ing-status', m).innerHTML = statusPill();
    const tg = $('#ing-toggle', m);
    tg.textContent = on ? 'Desligar entradas' : 'Ligar entradas';
    tg.className = 'btn sm ' + (on ? '' : 'primary');
    tg.disabled = !info?.available;
    const err = $('#ing-error', m);
    err.hidden = !info?.error;
    err.textContent = info?.error || '';
    const body = $('#ing-list', m);
    if (!info) body.innerHTML = '<div class="ing-empty">Não foi possível falar com o servidor do CastDeck.</div>';
    else if (!info.available) body.innerHTML = '<div class="ing-empty">Esta versão não traz o receptor RTMP/SRT (MediaMTX). Ele vem embutido nas versões para Windows, Linux e macOS.</div>';
    else if (!info.sources.length) body.innerHTML = '<div class="ing-empty">Nenhuma entrada ainda. Crie uma para cada drone ou câmera: cada uma tem a própria chave.</div>';
    else body.innerHTML = info.sources.map(sourceCard).join('');
    $('#ing-add', m).disabled = !info?.available;
    const lan = info?.lan || [];
    $('#ing-lan', m).innerHTML = lan.length > 1
      ? `Os endereços usam o IP <code>${esc(lan[0])}</code>. Se o aparelho estiver em outra rede deste PC, troque pelo IP dela: ${lan.slice(1).map((ip) => `<code>${esc(ip)}</code>`).join(', ')}.`
      : lan.length ? `IP deste PC na rede: <code>${esc(lan[0])}</code>.` : 'Nenhuma rede local encontrada: conecte este PC ao mesmo Wi‑Fi/cabo do aparelho.';
  }

  async function askName(title, value = '') {
    return modal(
      `<h3>${esc(title)}</h3>
       <label class="field"><span>Nome</span><input class="input" id="ing-name" maxlength="40" value="${esc(value)}" placeholder="Ex.: Drone, Câmera do palco"></label>
       <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="ing-name-ok" data-save>OK</button></div>`,
      {
        onMount(m, close) {
          const inp = $('#ing-name', m);
          setTimeout(() => inp.focus(), 30);
          const ok = () => close(inp.value.trim() || null);
          $('#ing-name-ok', m).onclick = ok;
          // bloco com if: devolver false no onkeydown cancela a tecla (nada seria digitado)
          inp.onkeydown = (e) => {
            if (e.key === 'Enter') ok();
          };
        },
      },
    );
  }

  async function onListClick(e) {
    const qb = e.target.closest('[data-qr]');
    if (qb) {
      qrMode = qb.dataset.qr;
      return renderList(true);
    }
    const cp = e.target.closest('[data-copy]');
    if (cp) return copyText(cp.dataset.copy);
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const key = b.closest('[data-key]')?.dataset.key;
    const s = srcInfo(key);
    if (!s) return;
    const act = b.dataset.act;
    try {
      if (act === 'urls') openKey = openKey === key ? null : key;
      else if (act === 'studio') {
        // liga/desliga: a entrada nova já entra nos bastidores; quem não quiser a miniatura tira por aqui
        if (conns.has(key)) S.sources.has(sid(key)) ? removeSource(sid(key)) : sourceRemoved(sid(key));
        else addToStudio(key);
      }
      else if (act === 'rename') {
        const name = await askName('Renomear entrada', s.name);
        if (!name) return;
        await api(`/ingest/sources/${key}`, { method: 'PUT', body: { name } });
        const src = S.sources.get(sid(key));
        if (src && !src.custom) addVideoSource(sid(key), undefined, { label: name });
      } else if (act === 'del') {
        const ok = await modal(
          `<h3>Excluir “${esc(s.name)}”?</h3><p class="sub">O aparelho que usa esta chave deixa de conseguir transmitir. Para voltar a usar, será preciso configurar a chave nova.</p>
           <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn danger" id="ing-del-ok">Excluir</button></div>`,
          { onMount: (m, close) => ($('#ing-del-ok', m).onclick = () => close(true)) },
        );
        if (!ok) return;
        await api(`/ingest/sources/${key}`, { method: 'DELETE' });
        removeSource(sid(key));
        if (openKey === key) openKey = null;
      }
    } catch (err) {
      toast(err.message, 'err');
    }
    await refresh();
    renderList(true);
  }

  async function openPanel() {
    await refresh();
    lastSig = '';
    startPoll();
    await modal(
      `<h3>Drones e câmeras (RTMP/SRT)</h3>
       <p class="sub">Receba a imagem de drones, câmeras com transmissão ao vivo, celulares ou encoders <b>da mesma rede</b>. Aceita H.264 e H.265 (HEVC); o que o navegador não toca direto é convertido automaticamente.</p>
       <div class="ing-bar"><span id="ing-status"></span><span class="grow"></span><button class="btn sm" id="ing-toggle"></button></div>
       <div class="ing-error" id="ing-error" hidden></div>
       <div class="ing-list" id="ing-list"></div>
       <div class="ing-foot"><button class="btn sm" id="ing-add">＋ Nova entrada</button></div>
       <p class="hint" id="ing-lan"></p>
       <p class="hint">🛡️ Na primeira vez, o Windows pergunta se o <b>mediamtx</b> pode usar a rede: permita em <b>redes privadas</b>. Portas: RTMP <b>${info?.ports?.rtmp || 1935}</b> e SRT <b>${info?.ports?.srt || 8890}</b> (UDP). Só aparelhos com uma chave cadastrada conseguem transmitir, e nada disso passa pela internet.</p>
       <div class="modal-actions"><button class="btn primary" data-close>Fechar</button></div>`,
      {
        onMount(m) {
          m.classList.add('ing-modal');
          modalEl = m;
          renderList(true);
          $('#ing-list', m).addEventListener('click', onListClick);
          $('#ing-toggle', m).onclick = async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
              info = await api('/ingest/enable', { method: 'POST', body: { on: !info?.enabled } });
              if (!info.enabled) for (const k of conns.keys()) dropConn(k);
            } catch (err) {
              toast(err.message, 'err');
            }
            renderList(true);
          };
          $('#ing-add', m).onclick = async () => {
            const name = await askName('Nova entrada', `Drone ${(info?.sources?.length || 0) + 1}`);
            if (!name) return;
            try {
              if (!info?.enabled) info = await api('/ingest/enable', { method: 'POST', body: { on: true } });
              const s = await api('/ingest/sources', { method: 'POST', body: { name } });
              openKey = s.key; // já mostra os endereços para configurar o aparelho
              await refresh();
              // já vai para os bastidores (aparece "Sem sinal" até o aparelho começar a transmitir)
              addToStudio(s.key, { silent: true });
              toast(`“${s.name}” criada e colocada nos bastidores`, 'ok');
            } catch (err) {
              toast(err.message, 'err');
            }
            await refresh();
            renderList(true);
          };
        },
      },
    );
    modalEl = null;
    if (!conns.size) stopPoll();
  }

  return { openPanel, addToStudio, sourceRemoved, restore, conns, info: () => info };
}
