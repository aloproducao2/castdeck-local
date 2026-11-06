// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Recursos do host: câmeras extras (UVC/USB/capturadoras) com áudio próprio, salvamento automático da sessão
// (restaurada ao abrir) e limpeza (disco + reset da cena).
//
// Sessão = o que não fica na marca/banners: câmeras extras, palco, solo, nomes, mídias/imagens (os arquivos
// ficam no IndexedDB deste navegador), volumes e playlist. É salva a cada mudança (verificação a cada 3 s) e ao fechar.

const DB_NAME = 'castdeck-media';
const STORE = 'files';

function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const idbPut = (key, val) => tx('readwrite', (s) => s.put(val, key));
const idbDel = (key) => tx('readwrite', (s) => s.delete(key));
async function idbEntries() {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const out = [];
    const c = db.transaction(STORE).objectStore(STORE).openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (!cur) return resolve(out);
      out.push([cur.key, cur.value]);
      cur.continue();
    };
    c.onerror = () => reject(c.error);
  });
}

import { confirmDialog } from '../ui.js';

export function createExtras(ctx) {
  const { S, studioId, api, $, $$, esc, toast, modal, fmtBytes, listDevices, getCamera, getMic } = ctx;
  const cams = new Map(); // id -> { id, label, videoId, audioId, quality, stream, mic }
  let ready = false; // só salva depois de restaurar (senão salvaria uma sessão vazia por cima)
  let last = '';
  const key = (id) => `${studioId}|${id}`;

  // ---------------- câmeras extras ----------------
  const nextId = () => {
    let n = 2;
    while (S.sources.has(`host:cam${n}`)) n++;
    return `host:cam${n}`;
  };

  async function openCam(cfg, prev) {
    const stream = prev?.stream || (await getCamera(cfg.videoId, cfg.quality));
    let mic = null;
    if (cfg.audioId) mic = await getMic(cfg.audioId).catch(() => null);
    return { stream, mic };
  }

  function attach(cfg, stream, mic) {
    const id = cfg.id;
    const old = cams.get(id);
    if (old && old.stream !== stream) old.stream?.getTracks().forEach((t) => t.stop());
    if (old?.mic && old.mic !== mic) old.mic.getTracks().forEach((t) => t.stop());
    const c = { ...cfg, stream, mic };
    cams.set(id, c);
    ctx.addVideoSource(id, stream, { kind: 'camera', label: cfg.label, ownerId: 'host', camOff: false, extraCam: true });
    ctx.mixer().remove(id + ':audio');
    if (mic) ctx.mixer().addStream(id + ':audio', mic, { ownerId: 'host', stageKey: id, monitor: false });
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (cams.get(id)?.stream === stream) toast(`“${cfg.label}” foi desconectada. Reconecte e use ⚙ para escolher de novo.`, 'err');
    });
    if (S.tab === 'audio') ctx.renderAudioPanel?.();
    return c;
  }

  async function addCam(cfg, { silent = false } = {}) {
    cfg = { quality: '720', ...cfg, id: cfg.id || nextId() };
    const { stream, mic } = await openCam(cfg);
    attach(cfg, stream, mic);
    if (!silent) toast(`Câmera “${cfg.label}” adicionada aos bastidores`, 'ok');
    return cfg.id;
  }

  async function updateCam(id, patch = {}) {
    const cur = cams.get(id);
    if (!cur) throw new Error('Câmera extra não encontrada');
    const videoId = patch.videoId !== undefined ? patch.videoId : cur.videoId;
    const audioId = patch.audioId !== undefined ? patch.audioId : cur.audioId;
    const quality = patch.quality !== undefined ? patch.quality : cur.quality;
    let stream = cur.stream;
    if (videoId !== cur.videoId || quality !== cur.quality) stream = await getCamera(videoId, quality);
    let mic = cur.mic;
    if (audioId !== cur.audioId) {
      mic = audioId ? await getMic(audioId).catch(() => null) : null;
      if (audioId && !mic) toast('Não foi possível abrir o áudio escolhido', 'err');
    }
    const cfg = { ...cur, videoId, audioId, quality, label: patch.label || cur.label };
    attach(cfg, stream, mic);
    save();
    return cfg;
  }

  function removeCam(id) {
    const c = cams.get(id);
    if (!c) return;
    c.stream?.getTracks().forEach((t) => t.stop());
    c.mic?.getTracks().forEach((t) => t.stop());
    cams.delete(id);
    ctx.removeSource(id);
    if (S.tab === 'audio') ctx.renderAudioPanel?.();
  }

  // Modal com prévia ao vivo: escolher câmera, qualidade, áudio e nome
  async function camDialog(id) {
    const cur = id ? cams.get(id) : null;
    let { cams: vids, mics } = await listDevices();
    const used = new Set([...cams.values()].map((c) => c.videoId));
    const firstFree = vids.find((d) => !used.has(d.deviceId))?.deviceId || vids[0]?.deviceId || '';
    let preview = null;
    const stopPreview = () => {
      if (preview && preview !== cur?.stream) preview.getTracks().forEach((t) => t.stop());
      preview = null;
    };
    const res = await modal(
      `<h3>${cur ? 'Câmera extra' : 'Adicionar câmera'}</h3>
       <p class="sub">Webcam USB/UVC, placa de captura ou câmera virtual. Cada câmera pode ter o próprio áudio (que só vai ao ar quando ela está no palco).</p>
       <div class="cam-prev"><video id="cd-v" muted playsinline autoplay></video><span class="hint" id="cd-msg">Carregando prévia…</span></div>
       <label class="field"><span>Câmera</span><select class="input" id="cd-cam">${vids.map((d, i) => `<option value="${d.deviceId}" ${d.deviceId === (cur?.videoId || firstFree) ? 'selected' : ''}>${esc(d.label || 'Câmera ' + (i + 1))}${used.has(d.deviceId) && d.deviceId !== cur?.videoId ? ' (já em uso)' : ''}</option>`).join('')}</select></label>
       <div class="row" style="gap:10px;flex-wrap:wrap">
         <label class="field grow" style="min-width:140px"><span>Qualidade</span><select class="input" id="cd-q">${[['720', 'HD 720p'], ['1080', 'Full HD 1080p'], ['480', 'SD 480p']].map(([v, l]) => `<option value="${v}" ${v === (cur?.quality || '720') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
         <label class="field grow" style="min-width:180px"><span>Áudio desta câmera</span><select class="input" id="cd-mic"><option value="">Sem áudio</option>${mics.map((d, i) => `<option value="${d.deviceId}" ${d.deviceId === cur?.audioId ? 'selected' : ''}>${esc(d.label || 'Microfone ' + (i + 1))}</option>`).join('')}</select></label>
       </div>
       <label class="field"><span>Nome na tela</span><input class="input" id="cd-name" maxlength="40" value="${esc(cur?.label || '')}" placeholder="Ex.: Câmera 2, Plano aberto"></label>
       <div class="modal-actions">${cur ? '<button class="btn danger" id="cd-del">Remover câmera</button><span class="grow"></span>' : ''}<button class="btn" data-close>Cancelar</button><button class="btn primary" id="cd-ok" ${cur ? 'data-save' : ''}>${cur ? 'Aplicar' : 'Adicionar'}</button></div>`,
      {
        onMount(m, close) {
          const v = $('#cd-v', m);
          const msg = $('#cd-msg', m);
          const sel = $('#cd-cam', m);
          const q = $('#cd-q', m);
          const name = $('#cd-name', m);
          const label = () => sel.selectedOptions[0]?.textContent.replace(' (já em uso)', '') || 'Câmera';
          if (!name.value) name.placeholder = label();
          const load = async () => {
            msg.textContent = 'Carregando prévia…';
            msg.hidden = false;
            stopPreview();
            try {
              preview = cur && sel.value === cur.videoId && q.value === cur.quality ? cur.stream : await getCamera(sel.value, q.value);
              v.srcObject = preview;
              const s = preview.getVideoTracks()[0]?.getSettings() || {};
              msg.textContent = s.width ? `${s.width}×${s.height}` : '';
              msg.hidden = !s.width;
            } catch (e) {
              msg.textContent = 'Não foi possível abrir esta câmera: ' + e.message;
            }
          };
          sel.onchange = () => {
            if (!name.value) name.placeholder = label();
            load();
          };
          q.onchange = load;
          load();
          $('#cd-ok', m).onclick = () => {
            if (!preview) return toast('Escolha uma câmera que funcione', 'err');
            const out = { videoId: sel.value, quality: q.value, audioId: $('#cd-mic', m).value, label: name.value.trim() || label(), stream: preview };
            preview = null; // a prévia vira a câmera (não reabre o dispositivo)
            close(out);
          };
          const del = $('#cd-del', m);
          if (del) del.onclick = () => close({ remove: true });
        },
      },
    );
    stopPreview();
    if (!res) return;
    if (res.remove) return removeCam(id);
    const cfg = { id: id || nextId(), label: res.label, videoId: res.videoId, audioId: res.audioId, quality: res.quality };
    try {
      const mic = res.audioId ? (cur && res.audioId === cur.audioId && cur.mic ? cur.mic : await getMic(res.audioId).catch(() => null)) : null;
      if (res.audioId && !mic) toast('Não foi possível abrir o áudio escolhido', 'err');
      attach(cfg, res.stream, mic);
      if (!id) toast(`Câmera “${cfg.label}” adicionada — coloque no palco quando quiser`, 'ok');
    } catch (e) {
      toast('Falha ao abrir a câmera: ' + e.message, 'err');
    }
  }

  // ---------------- mídias guardadas no navegador ----------------
  function mediaAdded(s, file) {
    if (!file || !ready) return;
    idbPut(key(s.id), { file, studioId, at: Date.now() }).catch((e) => toast('Não foi possível guardar a mídia para a próxima sessão: ' + e.message, 'err'));
  }
  function sourceRemoved(id) {
    if (/^media:/.test(id)) idbDel(key(id)).catch(() => {});
  }

  // ---------------- salvar / restaurar ----------------
  function snapshot() {
    const mine = (id) => /^(host:|media:)/.test(id);
    const names = {};
    const media = [];
    for (const s of S.sources.values()) {
      if (mine(s.id) && s.custom) names[s.id] = s.custom;
      if (s.kind === 'media' || s.kind === 'image')
        media.push({ id: s.id, kind: s.kind, loop: !!s.el.loop, vol: ctx.mixer().sources.get(s.id)?.volume ?? 1, recordingName: s.recordingName || '' });
    }
    return {
      v: 1,
      cams: [...cams.values()].map(({ id, label, videoId, audioId, quality }) => ({ id, label, videoId, audioId, quality })),
      stage: S.stage.filter(mine),
      solo: S.solo && mine(S.solo) ? S.solo : null,
      names,
      media,
      playlist: { ...S.playlist },
    };
  }

  function save(force = false) {
    if (!ready) return;
    const snap = snapshot();
    const json = JSON.stringify(snap);
    if (!force && json === last) return;
    last = json;
    S.studio.session = snap;
    return api(`/studios/${studioId}`, { method: 'PUT', body: { session: snap } }).catch(() => {});
  }

  function saveOnExit() {
    if (!ready) return;
    const json = JSON.stringify(snapshot());
    if (json === last) return;
    last = json;
    try {
      fetch(`/api/studios/${studioId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: JSON.parse(json) }), keepalive: true });
    } catch {}
  }

  async function restore() {
    const ses = S.studio.session;
    const camCount = Array.isArray(ses?.cams) ? ses.cams.length : 0;
    const mediaCount = Array.isArray(ses?.media) ? ses.media.length : 0;
    const total = camCount + mediaCount;
    let done = 0;
    let restored = 0;
    const progress = (label) => ctx.onRestoreProgress?.({ done, total, label });
    if (total) progress('Preparando câmeras e mídias…');
    try {
      if (ses?.v === 1) {
        // 1) câmeras extras
        for (const c of ses.cams || []) {
          progress(`Reabrindo câmeras (${Math.min(done + 1, total)}/${total})…`);
          try {
            await addCam(c, { silent: true });
            restored++;
          } catch (e) {
            toast(`Câmera “${c.label}” não encontrada (${e.name === 'OverconstrainedError' ? 'desconectada?' : e.message})`, 'err');
          }
          done++;
        }
        // 2) mídias e imagens (arquivos no IndexedDB)
        progress('Lendo mídias salvas…');
        const recs = new Map((await idbEntries().catch(() => [])).filter(([k]) => String(k).startsWith(studioId + '|')).map(([k, v]) => [String(k).slice(studioId.length + 1), v]));
        const keep = new Set();
        for (const m of ses.media || []) {
          progress(`Carregando mídias (${Math.min(done + 1, total)}/${total})…`);
          const rec = recs.get(m.id);
          if (!rec?.file) {
            done++;
            continue;
          }
          keep.add(m.id);
          const s = ctx.addMediaFile(rec.file, { id: m.id, silent: true, recordingName: m.recordingName || '' });
          if (s?.kind === 'media') {
            s.el.loop = !!m.loop;
            if (m.vol != null) ctx.mixer().setVolume(m.id, m.vol);
          }
          restored++;
          done++;
        }
        for (const k of recs.keys()) if (!keep.has(k)) idbDel(key(k)).catch(() => {});
        // 3) nomes, palco, solo e playlist
        progress('Organizando palco e playlist…');
        for (const [id, name] of Object.entries(ses.names || {})) ctx.applyName(id, name);
        const bgVideoId = S.brand?.background?.type === 'video' ? S.brand.background.value : '';
        const stage = (ses.stage || []).filter((id) => S.sources.has(id) && id !== bgVideoId);
        if (stage.length) ctx.setStage(stage);
        if (ses.solo && S.sources.has(ses.solo)) ctx.setSolo(ses.solo);
        if (ses.playlist) Object.assign(S.playlist, ses.playlist);
      }
    } finally {
      ready = true;
      last = JSON.stringify(snapshot());
    }
    if (restored) toast('Sessão anterior restaurada (câmeras, mídias e palco)', 'ok');
    if (S.tab === 'media') ctx.renderMediaPanel();
    return restored;
  }

  setInterval(() => save(), 3000);
  window.addEventListener('pagehide', saveOnExit);
  window.addEventListener('beforeunload', saveOnExit);

  // ---------------- limpeza ----------------
  async function resetScene({ ask = true } = {}) {
    if (ask && !(await confirmDialog('Limpar o estúdio?\n\nTira do ar o GC, remove câmeras extras, mídias, imagens e o compartilhamento de tela, e deixa só a sua câmera no palco. Convidados continuam conectados.', { ok: 'Limpar', danger: true }))) return false;
    if (S.activeBanner) ctx.toggleBanner(S.activeBanner);
    for (const id of [...cams.keys()]) removeCam(id);
    if (S.sources.has('host:screen')) ctx.stopScreen();
    for (const s of [...S.sources.values()]) if (s.kind === 'media' || s.kind === 'image') ctx.removeSource(s.id);
    ctx.setSolo(null);
    ctx.setStage(['host:cam']);
    S.playlist.on = false;
    save(true);
    if (S.tab === 'media') ctx.renderMediaPanel();
    toast('Estúdio limpo', 'ok');
    return true;
  }

  async function savedMediaInfo() {
    const all = await idbEntries().catch(() => []);
    const mine = all.filter(([k]) => String(k).startsWith(studioId + '|'));
    const size = (l) => l.reduce((a, [, v]) => a + (v?.file?.size || 0), 0);
    return { all, mine, bytesAll: size(all), bytesMine: size(mine), bytesOthers: size(all) - size(mine), nOthers: all.length - mine.length };
  }

  async function openCleanup() {
    const render = async (m) => {
      const body = $('#cl-body', m);
      body.innerHTML = '<div class="hint">Calculando espaço…</div>';
      let st;
      try {
        st = await api('/storage');
      } catch (e) {
        body.innerHTML = `<div class="hint">Falha: ${esc(e.message)}</div>`;
        return;
      }
      const sm = await savedMediaInfo();
      const r = st.recordings;
      body.innerHTML = `
        <div class="cl-card">
          <div class="cl-head"><strong>Gravações</strong><span class="cl-size">${fmtBytes(r.bytes)}</span></div>
          <div class="hint">${r.count} arquivo(s) em <code title="${esc(r.dir)}">${esc(r.dir)}</code></div>
          <div class="cl-acts">
            <button class="btn sm" data-rec="90" ${r.n90 ? '' : 'disabled'}>+ de 90 dias (${r.n90} · ${fmtBytes(r.older90)})</button>
            <button class="btn sm" data-rec="30" ${r.n30 ? '' : 'disabled'}>+ de 30 dias (${r.n30} · ${fmtBytes(r.older30)})</button>
            <button class="btn sm" data-rec="7" ${r.n7 ? '' : 'disabled'}>+ de 7 dias (${r.n7} · ${fmtBytes(r.older7)})</button>
            <button class="btn sm danger" data-rec="all" ${r.count ? '' : 'disabled'}>Apagar todas</button>
            <button class="btn sm ghost" id="cl-open">Abrir pasta</button>
          </div>
        </div>
        <div class="cl-card">
          <div class="cl-head"><strong>Mídias convertidas (cache)</strong><span class="cl-size">${fmtBytes(st.cache.bytes)}</span></div>
          <div class="hint">Cópias criadas quando um vídeo tinha áudio/vídeo que o navegador não toca. São recriadas se precisar.</div>
          <div class="cl-acts"><button class="btn sm" id="cl-cache" ${st.cache.count ? '' : 'disabled'}>Limpar cache (${st.cache.count})</button></div>
        </div>
        <div class="cl-card">
          <div class="cl-head"><strong>Mídias salvas da sessão</strong><span class="cl-size">${fmtBytes(sm.bytesAll)}</span></div>
          <div class="hint">Vídeos e imagens guardados neste navegador para reabrir o estúdio como estava. Este estúdio: ${fmtBytes(sm.bytesMine)} · outros estúdios: ${fmtBytes(sm.bytesOthers)}.</div>
          <div class="cl-acts"><button class="btn sm" id="cl-others" ${sm.nOthers ? '' : 'disabled'}>Apagar de outros estúdios (${sm.nOthers})</button></div>
        </div>
        <div class="cl-card">
          <div class="cl-head"><strong>Cena</strong></div>
          <div class="hint">Volta ao começo: sem GC, sem câmeras extras, mídias, imagens ou tela compartilhada; só a sua câmera no palco.</div>
          <div class="cl-acts"><button class="btn sm danger" id="cl-scene">Limpar estúdio (reset da cena)</button></div>
        </div>`;
      const clean = async (body, what) => {
        try {
          const out = await api('/storage/clean', { method: 'POST', body });
          toast(`${what}: ${out.removed} arquivo(s), ${fmtBytes(out.freed)} liberados${out.skipped ? ` · ${out.skipped} em uso mantido(s)` : ''}`, 'ok');
        } catch (e) {
          toast('Falha na limpeza: ' + e.message, 'err');
        }
        render(m);
      };
      $$('[data-rec]', body).forEach(
        (b) =>
          (b.onclick = async () => {
            const v = b.dataset.rec;
            const msg = v === 'all' ? 'Apagar TODAS as gravações?\n\nNão dá para desfazer.' : `Apagar as gravações com mais de ${v} dias?\n\nNão dá para desfazer.`;
            if (await confirmDialog(msg, { ok: 'Apagar', danger: true })) clean({ recordings: v === 'all' ? 'all' : Number(v) }, 'Gravações');
          }),
      );
      $('#cl-open', body).onclick = () => api('/recordings/open-folder', { method: 'POST' }).catch(() => {});
      $('#cl-cache', body).onclick = () => clean({ cache: true }, 'Cache');
      $('#cl-others', body).onclick = async () => {
        if (!(await confirmDialog('Apagar as mídias salvas de outros estúdios?\n\nEles abrirão sem esses vídeos/imagens.', { ok: 'Apagar', danger: true }))) return;
        for (const [k] of sm.all) if (!String(k).startsWith(studioId + '|')) await idbDel(k).catch(() => {});
        toast('Mídias de outros estúdios apagadas', 'ok');
        render(m);
      };
      $('#cl-scene', body).onclick = async () => {
        if (await resetScene()) render(m);
      };
    };
    await modal(
      `<h3>Limpeza e armazenamento</h3>
       <p class="sub">Libere espaço em disco e limpe a cena. Arquivos sendo gravados agora nunca são apagados.</p>
       <div id="cl-body" class="cl-body"></div>
       <div class="modal-actions"><button class="btn primary" data-close>Fechar</button></div>`,
      { onMount: (m) => render(m) },
    );
  }

  return { cams, addCam, updateCam, removeCam, camDialog, restore, save, mediaAdded, sourceRemoved, resetScene, openCleanup, snapshot };
}
