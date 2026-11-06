// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Trilha sonora: playlist de áudios ambiente, independente do Playout.
// O arquivo fica no IndexedDB; o áudio entra no mixer como fonte fixa de programa.
import { $, esc, icons, toast } from '../ui.js';

const DB_NAME = 'castdeck-music';
const STORE = 'tracks';
const CHANNEL = 'music:ambient';
const MAX_FILE = 300 * 1024 * 1024;
const MAX_TRACKS = 100;
const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|webm)$/i;
const MODES = [
  ['one', 'Repetir faixa', 'repeatOne'],
  ['list', 'Repetir lista', 'repeat'],
  ['once', 'Tocar uma vez', 'play'],
];

function isAudio(file) {
  return /^audio\//i.test(file?.type || '') || AUDIO_EXT.test(file?.name || '');
}

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAll() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const values = store.getAll();
    const keys = store.getAllKeys();
    tx.oncomplete = () => resolve(keys.result.map((key, i) => ({ key, rec: values.result[i] })));
    tx.onerror = () => reject(tx.error);
  });
}

async function dbPut(key, rec) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDel(key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function fmtDur(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function cleanName(name) {
  return String(name || 'Áudio').replace(/\.[^.]+$/, '').slice(0, 90);
}

export function createMusic({ studioId, mixer, onChange } = {}) {
  const prefix = `${studioId}|`;
  const ls = (name) => `castdeck.music.${name}.${studioId}`;
  const tracks = [];
  let panel = null;
  let currentId = '';
  let mode = ['one', 'list', 'once'].includes(localStorage.getItem(ls('mode'))) ? localStorage.getItem(ls('mode')) : 'list';
  let volume = (() => {
    const raw = localStorage.getItem(ls('volume'));
    const v = raw == null || raw === '' ? NaN : Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.4;
  })();
  let muted = false;
  let restored = false;
  let seeking = false;

  const audio = document.createElement('audio');
  audio.preload = 'auto';
  audio.crossOrigin = 'anonymous';
  audio.playsInline = true;
  audio.style.display = 'none';
  document.body.append(audio);

  try {
    mixer?.addElement?.(CHANNEL, audio, { ownerId: 'host', stageKey: 'music', monitor: true });
    mixer?.setRoute?.(CHANNEL, { program: true, monitor: true });
    mixer?.setVolume?.(CHANNEL, volume, { save: false });
    mixer?.setMuted?.(CHANNEL, false, { save: false });
  } catch (e) {
    console.warn('[trilha] mixer:', e);
  }

  const track = (id = currentId) => tracks.find((t) => t.id === id) || null;
  const idx = (id = currentId) => tracks.findIndex((t) => t.id === id);
  const playing = () => !audio.paused && !audio.ended;
  const notify = () => {
    try { onChange?.(); } catch {}
  };
  const persist = () => {
    try {
      localStorage.setItem(ls('mode'), mode);
      localStorage.setItem(ls('volume'), String(volume));
      if (currentId) localStorage.setItem(ls('current'), currentId);
      else localStorage.removeItem(ls('current'));
    } catch {}
  };

  function seekTo(raw) {
    const t = track();
    const dur = Number(audio.duration) || t?.duration || 0;
    if (!t || !(dur > 0)) return;
    const next = Math.max(0, Math.min(1, Number(raw) / 1000)) * dur;
    try {
      audio.currentTime = next;
    } catch {}
    paintTime();
  }

  function paintTime() {
    if (!panel) return;
    const t = track();
    const dur = Number(audio.duration) || t?.duration || 0;
    const pos = Number(audio.currentTime) || 0;
    const pct = dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : 0;
    const bar = panel.querySelector('#music-bar');
    if (bar) bar.style.width = `${pct * 100}%`;
    const seek = panel.querySelector('#music-seek');
    if (seek) {
      seek.disabled = !t || !(dur > 0);
      if (!seeking) seek.value = String(Math.round(pct * 1000));
      seek.setAttribute('aria-valuetext', `${fmtDur(pos)} de ${fmtDur(dur)}`);
    }
    const time = panel.querySelector('#music-time');
    if (time) time.textContent = `${fmtDur(pos)} / ${fmtDur(dur)}`;
    panel.querySelectorAll('[data-track]').forEach((row) => {
      const on = row.dataset.track === currentId;
      row.classList.toggle('active', on);
      const t = track(row.dataset.track);
      const meta = row.querySelector('small');
      if (t && meta) meta.textContent = `${tracks.indexOf(t) + 1} · ${fmtDur(t.duration)}`;
      const b = row.querySelector('[data-play-track]');
      if (b) b.innerHTML = on && playing() ? icons.pause : icons.play;
    });
  }

  function paint() {
    if (!panel) return;
    const t = track();
    const playingNow = playing();
    const name = panel.querySelector('#music-now-name');
    if (name) name.textContent = t ? t.name : 'Nenhuma faixa selecionada';
    const sub = panel.querySelector('#music-status');
    if (sub) {
      sub.textContent = playingNow ? `Tocando · ${MODES.find(([id]) => id === mode)?.[1] || ''}` : t ? 'Pausado' : 'Sem faixas';
      sub.classList.toggle('on', playingNow);
    }
    const play = panel.querySelector('#music-play');
    if (play) {
      play.innerHTML = `${playingNow ? icons.pause : icons.play}<span>${playingNow ? 'Pausar' : 'Tocar'}</span>`;
      play.setAttribute('aria-label', playingNow ? 'Pausar trilha sonora' : 'Tocar trilha sonora');
    }
    const vol = panel.querySelector('#music-vol');
    if (vol && document.activeElement !== vol) vol.value = String(Math.round(volume * 100));
    const volVal = panel.querySelector('#music-vol-val');
    if (volVal) volVal.textContent = `${Math.round(volume * 100)}%`;
    const mute = panel.querySelector('#music-mute');
    if (mute) {
      mute.classList.toggle('on', muted);
      mute.innerHTML = muted ? icons.volumeOff : icons.volume;
      mute.setAttribute('aria-pressed', String(muted));
      mute.title = muted ? 'Reativar o som da trilha' : 'Silenciar a trilha';
    }
    panel.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    panel.querySelectorAll('[data-track]').forEach((row) => row.classList.toggle('active', row.dataset.track === currentId));
    paintTime();
  }

  function select(id, { autoplay = false } = {}) {
    const t = track(id);
    if (!t) return;
    const changed = currentId !== id;
    currentId = id;
    if (changed || audio.dataset.trackId !== id) {
      audio.pause();
      audio.src = t.url;
      audio.dataset.trackId = id;
      audio.load();
    }
    persist();
    paint();
    if (autoplay) play();
  }

  async function play(id = '') {
    if (id && id !== currentId) select(id);
    const t = track();
    if (!t) {
      toast('Adicione uma faixa de áudio para tocar a trilha.', 'info');
      return;
    }
    if (audio.dataset.trackId !== t.id || !audio.getAttribute('src')) {
      audio.src = t.url;
      audio.dataset.trackId = t.id;
    }
    try {
      await mixer?.resume?.();
      await audio.play();
      paint();
      notify();
    } catch (e) {
      toast(`Não foi possível tocar a trilha: ${e.message}`, 'err');
    }
  }

  function pause() {
    audio.pause();
    paint();
    notify();
  }

  function toggle() {
    if (playing()) pause();
    else play();
  }

  function step(delta, { autoplay = true } = {}) {
    if (!tracks.length) return;
    let i = idx();
    if (i < 0) i = 0;
    i = (i + delta + tracks.length) % tracks.length;
    select(tracks[i].id, { autoplay });
  }

  function setMode(next) {
    if (!MODES.some(([id]) => id === next)) return;
    mode = next;
    persist();
    paint();
    notify();
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, Number(v) || 0));
    mixer?.setVolume?.(CHANNEL, volume, { save: false });
    persist();
    paint();
    notify();
  }

  function setMuted(next = !muted) {
    muted = !!next;
    mixer?.setMuted?.(CHANNEL, muted, { save: false });
    paint();
    notify();
  }

  // O fader do canal no Mixer é a mesma fonte de verdade do volume da trilha.
  function syncFromMixer() {
    const s = mixer?.sources?.get(CHANNEL);
    if (!s) return;
    volume = Math.max(0, Math.min(1, Number(s.volume)));
    muted = !!s.muted;
    persist();
    paint();
  }

  async function addFiles(files) {
    const list = [...(files || [])];
    let added = 0;
    for (const file of list) {
      if (!isAudio(file)) {
        toast(`${file?.name || 'Arquivo'}: use um arquivo de áudio.`, 'err');
        continue;
      }
      if (tracks.length >= MAX_TRACKS) {
        toast(`Limite de ${MAX_TRACKS} faixas na trilha.`, 'err');
        break;
      }
      if (file.size > MAX_FILE) {
        toast(`${file.name}: maior que 300 MB.`, 'err');
        continue;
      }
      const id = `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      try {
        await dbPut(prefix + id, { name: file.name, file, size: file.size, addedAt: Date.now() });
      } catch (e) {
        toast(`Não foi possível guardar ${file.name}: ${e.message}`, 'err');
        continue;
      }
      const t = { id, name: cleanName(file.name), file, url: URL.createObjectURL(file), duration: 0, addedAt: Date.now() };
      tracks.push(t);
      probe(t);
      if (!currentId) select(id);
      added++;
    }
    if (added) {
      persist();
      if (panel) render(panel);
      toast(`${added} faixa${added === 1 ? '' : 's'} na trilha sonora.`, 'ok');
      notify();
    }
  }

  function probe(t) {
    const a = new Audio();
    a.preload = 'metadata';
    a.src = t.url;
    a.onloadedmetadata = () => {
      t.duration = Number.isFinite(a.duration) ? a.duration : 0;
      try { a.removeAttribute('src'); } catch {}
      paint();
    };
    a.onerror = () => {
      try { a.removeAttribute('src'); } catch {}
    };
  }

  async function remove(id) {
    const i = idx(id);
    if (i < 0) return;
    const [t] = tracks.splice(i, 1);
    const wasPlaying = currentId === id && playing();
    if (currentId === id) {
      audio.pause();
      audio.removeAttribute('src');
      audio.dataset.trackId = '';
      audio.load();
      currentId = '';
    }
    try { URL.revokeObjectURL(t.url); } catch {}
    await dbDel(prefix + id).catch(() => {});
    if (!currentId && tracks.length) {
      const next = tracks[Math.min(i, tracks.length - 1)];
      select(next.id, { autoplay: wasPlaying });
    } else {
      persist();
      paint();
    }
    if (panel) render(panel);
    notify();
  }

  function render(el) {
    panel = el;
    if (!panel) return;
    const t = track();
    const playingNow = playing();
    const list = tracks.length
      ? tracks
          .map(
            (x, i) => `<div class="music-track ${x.id === currentId ? 'active' : ''}" data-track="${esc(x.id)}">
              <button class="music-track-play" data-play-track="${esc(x.id)}" title="${x.id === currentId && playingNow ? 'Pausar' : 'Tocar'}">${x.id === currentId && playingNow ? icons.pause : icons.play}</button>
              <div class="music-track-info"><strong>${esc(x.name)}</strong><small>${i + 1} · ${fmtDur(x.duration)}</small></div>
              <button class="btn sm ghost icon music-track-del" data-del-track="${esc(x.id)}" title="Remover ${esc(x.name)}">${icons.trash}</button>
            </div>`,
          )
          .join('')
      : '<div class="music-empty">Nenhuma faixa ainda. Adicione MP3, WAV, OGG, M4A ou FLAC.</div>';

    panel.innerHTML = `
      <div class="music-head">
        <div><b>${icons.music} Trilha sonora</b><small>Áudio ambiente da live</small></div>
        <span class="music-status ${playingNow ? 'on' : ''}" id="music-status">${playingNow ? `Tocando · ${MODES.find(([id]) => id === mode)?.[1] || ''}` : t ? 'Pausado' : 'Sem faixas'}</span>
      </div>
      <p class="hint music-hint">Toca em paralelo ao Playout. O áudio entra no programa, na gravação e no retorno dos convidados.</p>

      <div class="music-now card">
        <div class="music-now-row"><strong id="music-now-name">${t ? esc(t.name) : 'Nenhuma faixa selecionada'}</strong><span id="music-time">${fmtDur(audio.currentTime)} / ${fmtDur(audio.duration || t?.duration || 0)}</span></div>
        <div class="music-bar" title="Clique ou arraste para avançar/voltar">
          <i id="music-bar"></i>
          <input id="music-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Posição da faixa" title="Clique ou arraste para avançar/voltar">
        </div>
      </div>

      <div class="music-transport">
        <button class="btn sm icon" id="music-prev" title="Faixa anterior" aria-label="Faixa anterior">${icons.prev}</button>
        <button class="btn primary music-play" id="music-play" aria-label="${playingNow ? 'Pausar trilha sonora' : 'Tocar trilha sonora'}">${playingNow ? icons.pause : icons.play}<span>${playingNow ? 'Pausar' : 'Tocar'}</span></button>
        <button class="btn sm icon" id="music-next" title="Próxima faixa" aria-label="Próxima faixa">${icons.next}</button>
        <button class="btn sm icon music-mute" id="music-mute" aria-pressed="${muted}" title="${muted ? 'Reativar o som da trilha' : 'Silenciar a trilha'}">${muted ? icons.volumeOff : icons.volume}</button>
      </div>

      <div class="music-volume">
        <span>Volume</span>
        <input id="music-vol" type="range" min="0" max="100" step="1" value="${Math.round(volume * 100)}" aria-label="Volume da trilha sonora">
        <b id="music-vol-val">${Math.round(volume * 100)}%</b>
      </div>

      <div class="music-modes" role="group" aria-label="Modo de repetição da trilha">
        ${MODES.map(([id, label, icon]) => `<button class="music-mode ${mode === id ? 'on' : ''}" data-mode="${id}" title="${label}">${icons[icon]}<span>${label}</span></button>`).join('')}
      </div>

      <div class="m-section-head"><h4>Faixas</h4><span class="hint">${tracks.length}/${MAX_TRACKS}</span></div>
      <div class="music-list" id="music-list">${list}</div>
      <div class="music-add-row">
        <button class="btn primary" id="music-add">${icons.plus} Adicionar áudios</button>
        <span class="hint">Ficam salvos neste dispositivo para a próxima sessão.</span>
      </div>
      <input type="file" id="music-file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.opus" multiple hidden>
    `;

    $("#music-add", panel)?.addEventListener("click", () => $("#music-file", panel)?.click());
    $("#music-file", panel)?.addEventListener("change", (e) => {
      addFiles(e.target.files);
      e.target.value = "";
    });
    $("#music-play", panel)?.addEventListener("click", toggle);
    $("#music-prev", panel)?.addEventListener("click", () => step(-1));
    $("#music-next", panel)?.addEventListener("click", () => step(1));
    $("#music-mute", panel)?.addEventListener("click", () => setMuted());
    $("#music-vol", panel)?.addEventListener("input", (e) => setVolume(Number(e.target.value) / 100));
    panel.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
    panel.querySelectorAll("[data-play-track]").forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.playTrack;
          if (id === currentId) toggle();
          else select(id, { autoplay: true });
        }),
    );
    panel.querySelectorAll("[data-del-track]").forEach((b) => (b.onclick = () => remove(b.dataset.delTrack)));
    const seek = $("#music-seek", panel);
    seek?.addEventListener("pointerdown", () => { seeking = true; });
    seek?.addEventListener("input", (e) => {
      seeking = true;
      seekTo(e.target.value);
    });
    const endSeek = () => {
      if (!seeking) return;
      seeking = false;
      paintTime();
    };
    seek?.addEventListener("pointerup", endSeek);
    seek?.addEventListener("pointercancel", endSeek);
    seek?.addEventListener("change", endSeek);
    seek?.addEventListener("blur", endSeek);
    panel.ondragover = (e) => {
      if ([...(e.dataTransfer?.types || [])].includes("Files")) {
        e.preventDefault();
        panel.classList.add("music-drop");
      }
    };
    panel.ondragleave = () => panel.classList.remove("music-drop");
    panel.ondrop = (e) => {
      e.preventDefault();
      panel.classList.remove("music-drop");
      addFiles(e.dataTransfer?.files);
    };
    paint();
  }

  async function restore() {
    if (restored) return;
    try {
      const rows = (await dbAll()).filter(({ key }) => String(key).startsWith(prefix));
      rows.sort((a, b) => (a.rec?.addedAt || 0) - (b.rec?.addedAt || 0));
      for (const { key, rec } of rows) {
        if (!rec?.file) continue;
        const id = String(key).slice(prefix.length);
        const t = { id, name: cleanName(rec.name), file: rec.file, url: URL.createObjectURL(rec.file), duration: 0, addedAt: rec.addedAt || 0 };
        tracks.push(t);
        probe(t);
      }
      if (tracks.length) {
        const saved = localStorage.getItem(ls("current"));
        currentId = tracks.some((t) => t.id === saved) ? saved : tracks[0].id;
        select(currentId, { autoplay: false });
      }
      restored = true;
      if (panel) render(panel);
    } catch (e) {
      console.warn("[trilha] restore:", e);
    }
  }

  audio.addEventListener("timeupdate", paintTime);
  audio.addEventListener("durationchange", paintTime);
  audio.addEventListener("play", () => {
    paint();
    notify();
  });
  audio.addEventListener("pause", () => {
    paint();
    notify();
  });
  audio.addEventListener("ended", () => {
    if (mode === "one") {
      try {
        audio.currentTime = 0;
      } catch {}
      audio.play().catch(() => {});
    } else if (mode === "list") {
      step(1);
    } else {
      try {
        audio.currentTime = 0;
      } catch {}
      paint();
      notify();
    }
  });
  audio.addEventListener("error", () => {
    if (currentId) toast(`Não foi possível abrir ${track()?.name || "a faixa"}.`, "err");
  });

  const api = {
    render,
    restore,
    addFiles,
    remove,
    play,
    pause,
    toggle,
    step,
    setMode,
    setVolume,
    setMuted,
    syncFromMixer,
    get tracks() { return tracks.map(({ id, name, duration }) => ({ id, name, duration })); },
    get currentId() { return currentId; },
    get mode() { return mode; },
    get volume() { return volume; },
    get muted() { return muted; },
    get restored() { return restored; },
    get audio() { return audio; },
    pauseAll: pause,
  };
  return api;
}
