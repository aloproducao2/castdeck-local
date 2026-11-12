// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
//
// Multigravação: grava cada fonte em um arquivo separado, usando o MediaStream que já
// existe no estúdio. Não substitui nem altera o botão Gravar / Transmitir: o caminho
// atual do broadcaster continua isolado.
//
// O navegador faz a codificação (MediaRecorder) e envia os bytes por WebSocket local.
// O servidor só escreve os arquivos e o manifesto; não recodifica nada.

const MAX_SELECTED = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const liveVideo = (s) => !!s?.getVideoTracks?.().some((t) => t.readyState === 'live' && t.enabled !== false);
const labelOf = (kind) => ({
  program: 'Programa',
  camera: 'Câmera',
  screen: 'Tela',
  media: 'Mídia',
  browser: 'Navegador',
  ndi: 'NDI',
  ingest: 'Entrada de rede',
  guest: 'Convidado',
}[kind] || 'Fonte');

export function createMultiRecorder({ S, $, $$, esc, toast, modal, api, studioId, getProgramStream, getMixer }) {
  let active = null;
  let opening = false;

  const btn = () => $('#btn-multirec');

  const liveAudio = (t) => !!t && t.readyState === 'live' && t.enabled !== false;
  const defaultAudio = (c) => (c.key === 'program' ? 'program' : 'source');

  function videoStreamFor(c) {
    if (c.key === 'program') {
      const s = getProgramStream?.();
      return liveVideo(s) ? s : null;
    }
    const src = c.source;
    if (!src) return null;
    let stream = src.stream;
    if (!liveVideo(stream) && src.el?.captureStream && src.kind === 'media') {
      try { stream = src.el.captureStream(); } catch { stream = null; }
    }
    return liveVideo(stream) ? stream : null;
  }

  function audioTrackFor(c, mode, base) {
    const mixer = getMixer?.();
    if (mode === 'none') return null;
    if (mode === 'program') return liveAudio(mixer?.programTrack) ? mixer.programTrack : null;
    if (mode === 'hostmic') return S.local?.mic?.getAudioTracks().find(liveAudio) || null;
    if (mode?.startsWith('bus:')) return mixer?.busTrack?.(mode.slice(4))?.readyState === 'live' ? mixer.busTrack(mode.slice(4)) : null;
    // source = áudio que veio junto com a fonte; câmera do host usa o microfone do mixer.
    const embedded = base?.getAudioTracks?.().find(liveAudio);
    if (embedded) return embedded;
    if (c.source?.id === 'host:cam' && S.local?.mic) return S.local.mic.getAudioTracks().find(liveAudio) || null;
    return null;
  }

  function streamFor(c, audioMode) {
    const base = videoStreamFor(c);
    if (!base) return null;
    const tracks = base.getVideoTracks().filter((t) => t.readyState === 'live' && t.enabled !== false);
    if (!tracks.length) return null;
    const audio = audioTrackFor(c, audioMode || defaultAudio(c), base);
    const seen = new Set();
    return new MediaStream([...tracks, ...(audio ? [audio] : [])].filter((t) => (seen.has(t.id) ? false : seen.add(t.id))));
  }

  function audioOptions(c) {
    const mixer = getMixer?.();
    const opts = [];
    if (c.key === 'program') opts.push(['program', 'Programa (Master)']);
    else opts.push(['source', 'Áudio da fonte']);
    if (S.local?.mic?.getAudioTracks().some(liveAudio)) opts.push(['hostmic', 'Microfone do host']);
    if (c.key !== 'program') opts.push(['program', 'Programa (Master)']);
    for (const b of mixer?.busList?.() || []) opts.push([`bus:${b.id}`, `Saída do Bus ${b.id}`]);
    opts.push(['none', 'Sem áudio']);
    return opts;
  }

  function candidates() {
    const out = [];
    if (liveVideo(getProgramStream?.())) out.push({ key: 'program', label: 'Programa', kind: 'program' });
    for (const src of S.sources.values()) {
      if (!src || src.kind === 'image') continue;
      const stream = src.stream;
      const mediaOk = src.kind === 'media' && src.el?.captureStream && (src.el.readyState >= 2 || src.el.videoWidth > 0);
      if (!liveVideo(stream) && !mediaOk) continue;
      out.push({ key: src.id, label: src.label || src.id, kind: src.kind || 'source', source: src });
    }
    return out;
  }

  function renderButton() {
    const b = btn();
    if (!b) return;
    const n = active?.entries.length || 0;
    b.classList.toggle('on', !!active);
    b.setAttribute('aria-pressed', String(!!active));
    const lbl = b.querySelector('.mr-lbl');
    if (lbl) lbl.textContent = active ? `Fontes ${n}` : 'Fontes';
    b.title = active
      ? `Multigravação ativa (${n} fonte${n === 1 ? '' : 's'}). Clique para parar.`
      : 'Multigravação: grave cada fonte em um arquivo separado, sem alterar Gravar/Transmitir';
    b.setAttribute('aria-label', active ? 'Parar multigravação' : 'Multigravação');
  }

  function mimeFor(stream) {
    const hasAudio = stream.getAudioTracks().some((t) => t.readyState === 'live');
    // WebM é o formato comprovado no CEF atual para MediaRecorder; MP4 do MediaRecorder
    // pode gerar apenas o cabeçalho em algumas versões. O caminho atual (FFmpeg) continua MP4.
    const list = hasAudio
      ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
      : ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'];
    return list.find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
  }

  function openWs(sessionId, key) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/multirec?session=${encodeURIComponent(sessionId)}&key=${encodeURIComponent(key)}`);
      ws.binaryType = 'arraybuffer';
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { ws.close(); } catch {}
        reject(new Error('tempo esgotado ao abrir o canal da fonte'));
      }, 5000);
      ws.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ws);
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('não foi possível abrir o canal da fonte'));
      };
    });
  }

  function stopEntry(entry) {
    if (entry.stopping) return entry.done;
    entry.stopping = true;
    try {
      if (entry.rec && entry.rec.state !== 'inactive') entry.rec.stop();
      else entry.resolveDone?.();
    } catch {
      entry.resolveDone?.();
    }
    return entry.done;
  }

  async function start(chosen, opts = {}) {
    const picked = chosen
      .map((c) => {
        const audio = c.audio || defaultAudio(c);
        const stream = streamFor(c, audio);
        const mime = stream ? mimeFor(stream) : '';
        return { ...c, audio, stream, mime, ext: mime.includes('mp4') ? 'mp4' : 'webm' };
      })
      .filter((c) => c.stream && c.mime);
    if (!picked.length) return toast('Nenhuma fonte com vídeo ao vivo para gravar.', 'err');

    let session;
    try {
      session = await api('/multirec/start', {
        method: 'POST',
        body: {
          studioId,
          sources: picked.map((c) => ({ key: c.key, name: c.label, kind: c.kind, ext: c.ext, audio: c.audioLabel || c.audio })),
          convertMp4: !!opts.convertMp4,
          videoKbps: opts.videoKbps || 4000,
        },
      });
    } catch (e) {
      return toast('Não foi possível iniciar a multigravação: ' + e.message, 'err');
    }

    active = { id: session.id, dir: session.dir, startedAt: Date.now(), convertMp4: !!opts.convertMp4, videoKbps: opts.videoKbps || 4000, entries: [] };
    renderButton();
    toast(`Multigravação iniciada (${picked.length} fonte${picked.length === 1 ? '' : 's'}).`, 'ok');

    for (const c of picked) {
      if (!active) break;
      try {
        const stream = c.stream;
        const mime = c.mime;
        if (!mime) throw new Error('MediaRecorder indisponível neste navegador');
        const ws = await openWs(session.id, c.key);
        const rec = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: (opts.videoKbps || 4000) * 1000,
          audioBitsPerSecond: 128_000,
        });
        const entry = {
          key: c.key,
          label: c.label,
          kind: c.kind,
          audio: c.audioLabel || c.audio,
          rec,
          ws,
          stopping: false,
          done: null,
          resolveDone: null,
          chain: Promise.resolve(),
        };
        entry.done = new Promise((resolve) => { entry.resolveDone = resolve; });
        const finish = () => {
          entry.resolveDone?.();
        };
        rec.ondataavailable = (ev) => {
          if (!ev.data?.size) return;
          entry.chain = entry.chain.then(async () => {
            if (ws.readyState !== WebSocket.OPEN) return;
            if (ws.bufferedAmount > 24 * 1024 * 1024) {
              toast(`A fonte “${c.label}” atrasou a escrita; a multigravação dela foi interrompida.`, 'err');
              try { rec.stop(); } catch {}
              try { ws.close(1011, 'backpressure'); } catch {}
              return;
            }
            try { ws.send(await ev.data.arrayBuffer()); } catch {}
          }).catch(finish);
        };
        rec.onerror = (ev) => {
          toast(`Falha ao gravar “${c.label}”: ${ev.error?.message || 'erro no gravador'}`, 'err');
          try { ws.close(1011, 'recorder error'); } catch {}
          finish();
        };
        rec.onstop = () => {
          entry.chain.finally(async () => {
            try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'stop' })); } catch {}
            setTimeout(() => { try { ws.close(); } catch {} }, 120);
            finish();
          });
        };
        ws.onclose = () => { if (!entry.stopping) { try { rec.stop(); } catch {} } };
        stream.getVideoTracks().forEach((t) => t.addEventListener('ended', () => stopEntry(entry), { once: true }));
        rec.start(1000);
        active.entries.push(entry);
        renderButton();
      } catch (e) {
        toast(`Não foi possível gravar “${c.label}”: ${e.message}`, 'err');
      }
      await sleep(150);
    }

    if (!active?.entries.length) {
      active = null;
      renderButton();
      try { await api(`/multirec/${session.id}/stop`, { method: 'POST' }); } catch {}
      toast('A multigravação não iniciou nenhuma fonte.', 'err');
      return;
    }
    // Se alguma fonte falhou depois do POST, o manifesto do servidor ainda terá a sessão;
    // o stop final fecha o que ficou vazio.
  }

  async function stop({ silent = false } = {}) {
    const a = active;
    if (!a) return;
    active = null;
    renderButton();
    await Promise.allSettled(a.entries.map((e) => stopEntry(e)));
    try { await api(`/multirec/${a.id}/stop`, { method: 'POST' }); } catch {}
    if (!silent) {
      toast(`Multigravação salva em ${a.dir}`, 'ok');
      if (a.convertMp4) {
        toast('Conversão para MP4 (H.264/AAC) em andamento…', 'info');
        watchMp4(a.id);
      }
    }
  }

  async function watchMp4(id) {
    for (let i = 0; i < 300; i++) {
      await sleep(2000);
      let st;
      try { st = await api(`/multirec/${id}`); } catch { return; }
      const pending = st.sources.some((x) => ['pending', 'queued', 'converting'].includes(x.mp4Status));
      if (pending) continue;
      const ok = st.sources.filter((x) => x.mp4Status === 'complete').length;
      const err = st.sources.filter((x) => x.mp4Status === 'error').length;
      if (ok) toast(`${ok} arquivo${ok === 1 ? '' : 's'} convertido${ok === 1 ? '' : 's'} para MP4.`, err ? 'warn' : 'ok');
      if (err) toast(`${err} conversão${err === 1 ? '' : 'ões'} para MP4 falhou. O WebM original foi mantido.`, 'err');
      return;
    }
    toast('A conversão para MP4 continua em segundo plano.', 'info');
  }

  function shutdown() {
    const a = active;
    if (!a) return;
    active = null;
    for (const e of a.entries) {
      try { if (e.rec.state !== 'inactive') e.rec.stop(); } catch {}
      try { e.ws.close(); } catch {}
    }
  }

  function openPanel() {
    if (active) return stop();
    if (opening) return;
    const list = candidates();
    if (!list.length) return toast('Nenhuma fonte de vídeo disponível para a multigravação.', 'err');
    opening = true;
    const rows = list.map((c) => {
      const opts = audioOptions(c);
      const audio = defaultAudio(c);
      return `<div class="mr-item" data-kind="${esc(c.kind)}">
      <label class="mr-src">
        <input type="checkbox" data-mr-key="${esc(c.key)}">
        <span class="mr-src-main"><b>${esc(c.label)}</b><small>${esc(c.kind === 'program' ? 'o que está no ar' : labelOf(c.kind))}</small></span>
        <span class="mr-src-off" aria-hidden="true"></span>
      </label>
      <label class="mr-audio-pick"><span>Áudio</span><select class="input mr-audio" data-audio-key="${esc(c.key)}">${opts.map(([value, text]) => `<option value="${esc(value)}" ${value === audio ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select></label>
    </div>`;
    }).join('');
    modal(`<div class="mr-panel">
      <h3>Multigravação</h3>
      <p class="sub">Grave cada fonte em um arquivo separado. A gravação e a transmissão atuais continuam funcionando normalmente.</p>
      <div class="mr-list">${rows}</div>
      <div class="mr-summary">
        <span id="mr-count">0 fontes selecionadas</span>
        <span class="mr-warn" id="mr-warn" hidden></span>
      </div>
      <label class="field mr-bitrate"><span>Bitrate do vídeo</span><select class="input" id="mr-bitrate"><option value="2500">Leve — 2,5 Mbps</option><option value="4000" selected>Equilibrado — 4 Mbps</option><option value="6000">Alta — 6 Mbps</option><option value="8000">Máxima — 8 Mbps</option></select></label>
      <label class="check mr-mp4"><input type="checkbox" id="mr-mp4"> <span>Converter para MP4 (H.264/AAC) depois</span></label>
      <p class="hint">Máximo de ${MAX_SELECTED} fontes por sessão. O programa é opcional. O original fica em WebM; a conversão roda em segundo plano e mantém o original.</p>
      <div class="modal-actions">
        <button class="btn ghost" type="button" data-close>Cancelar</button>
        <button class="btn primary" type="button" id="mr-start" disabled>Iniciar multigravação</button>
      </div>
    </div>`, {
      onMount(m, close) {
        const boxes = $$('input[data-mr-key]', m);
        const startBtn = $('#mr-start', m);
        const count = $('#mr-count', m);
        const warn = $('#mr-warn', m);
        const bitrate = $('#mr-bitrate', m);
        const refresh = () => {
          const selected = boxes.filter((b) => b.checked);
          const program = selected.some((b) => b.dataset.mrKey === 'program');
          count.textContent = `${selected.length} fonte${selected.length === 1 ? '' : 's'} selecionada${selected.length === 1 ? '' : 's'}`;
          const notes = [];
          if (selected.length > 4) notes.push('Acima de 4 fontes pode pesar em PCs sem GPU.');
          if (program && S.recording) notes.push('A gravação atual também está ativa: o programa será salvo duas vezes.');
          const kbps = Number(bitrate?.value) || 4000;
          const perHour = ((kbps + 128) * 3600) / 8 / 1_000_000;
          if (selected.length) notes.push(`≈ ${perHour.toFixed(1)} GB por hora por fonte (${(kbps / 1000).toFixed(1)} Mbps).`);
          warn.hidden = !notes.length;
          warn.textContent = notes.join(' ');
          startBtn.disabled = !selected.length || selected.length > MAX_SELECTED;
          startBtn.textContent = selected.length > MAX_SELECTED ? `Máximo de ${MAX_SELECTED}` : 'Iniciar multigravação';
        };
        boxes.forEach((b) => (b.onchange = refresh));
        bitrate?.addEventListener('change', refresh);
        refresh();
        startBtn.onclick = () => {
          const selected = boxes.filter((b) => b.checked).map((b) => {
            const c = list.find((x) => x.key === b.dataset.mrKey);
            if (!c) return null;
            const sel = [...m.querySelectorAll('select[data-audio-key]')].find((s) => s.dataset.audioKey === b.dataset.mrKey);
            return { ...c, audio: sel?.value || defaultAudio(c), audioLabel: sel?.selectedOptions?.[0]?.textContent || '' };
          }).filter(Boolean);
          const convertMp4 = !!$('#mr-mp4', m)?.checked;
          const videoKbps = Number($('#mr-bitrate', m)?.value) || 4000;
          close();
          opening = false;
          if (selected.length) start(selected, { convertMp4, videoKbps });
        };
      },
    });
    // modal fecha por fora/Esc sem passar pelo botão: libera a trava
    setTimeout(() => { opening = false; }, 100);
  }

  // libera a trava mesmo se o modal for fechado por Esc/backdrop
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') opening = false; });
  window.addEventListener('beforeunload', shutdown);

  return {
    open: openPanel,
    toggle: openPanel,
    stop,
    shutdown,
    isActive: () => !!active,
  };
}
