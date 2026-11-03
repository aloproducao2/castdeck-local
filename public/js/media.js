// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Captura de mídia e lobby (pré-entrada) compartilhado entre host e convidado.
import { $, h, esc, icons } from './ui.js';

const PREFS_KEY = 'castdeck.devices';
export const loadPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  } catch {
    return {};
  }
};
export const savePrefs = (p) => localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...p }));

export async function getCamera(deviceId, quality = '720') {
  const sizes = { 1080: [1920, 1080], 720: [1280, 720], 480: [854, 480] };
  const [w, hh] = sizes[quality] || sizes[720];
  const base = { width: { ideal: w }, height: { ideal: hh }, frameRate: { ideal: 30 } };
  // Se o dispositivo salvo sumiu (webcam trocada/plugada em outra porta), tenta o padrão
  // em vez de deixar a câmera preta. Também cai para constraints simples se a resolução falhar.
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: { ...base, deviceId: { exact: deviceId } }, audio: false });
    } catch (first) {
      try {
        return await navigator.mediaDevices.getUserMedia({ video: base, audio: false });
      } catch {
        try {
          return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch {
          throw first;
        }
      }
    }
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: base, audio: false });
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

// Áudio puro: desliga redução de ruído, cancelamento de eco e ganho automático (preferência salva)
export const rawMic = () => !!loadPrefs().rawMic;
export async function getMic(deviceId) {
  const p = !rawMic();
  return navigator.mediaDevices.getUserMedia({
    audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: p, noiseSuppression: p, autoGainControl: p, channelCount: 1 },
    video: false,
  });
}

// Mostrar ou ocultar o cursor do mouse nas capturas (preferência salva; padrão: OCULTO)
export const cursorOn = () => loadPrefs().cursor === 'always';
// Chromium/Edge NÃO implementa a constraint "cursor" em getDisplayMedia (não aparece em
// getSupportedConstraints). Nesse caso o cursor do sistema continua na captura; não há API web
// para removê-lo. A UI usa isto para não prometer algo que o navegador ignora.
export const cursorSupported = () => !!navigator.mediaDevices?.getSupportedConstraints?.().cursor;
export async function setCursor(on, stream) {
  savePrefs({ cursor: on ? 'always' : 'never' });
  if (!cursorSupported()) return false;
  const t = stream?.getVideoTracks()[0];
  if (!t) return true;
  try {
    await t.applyConstraints({ cursor: on ? 'always' : 'never' });
    return true;
  } catch {
    return false; // navegador não permite trocar com a captura ativa: vale na próxima
  }
}

export async function getScreen() {
  const baseVideo = {
    ...(cursorSupported() ? { cursor: cursorOn() ? 'always' : 'never' } : {}),
    frameRate: { ideal: 30, max: 30 },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: baseVideo,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        systemAudio: 'include',
      },
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    });
  } catch (err) {
    if (err.name === 'NotAllowedError') throw err; // usuário cancelou no diálogo nativo
    // Fallback caso o navegador não suporte alguma das propriedades novas
    return await navigator.mediaDevices.getDisplayMedia({
      video: baseVideo,
      audio: true,
      systemAudio: 'include',
    });
  }
}

// Compartilha uma ABA do navegador, com o áudio da aba (o usuário precisa marcar “Compartilhar áudio da aba”).
export async function getTab() {
  return navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser', ...(cursorSupported() ? { cursor: cursorOn() ? 'always' : 'never' } : {}), frameRate: { ideal: 30, max: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    preferCurrentTab: false,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
    systemAudio: 'exclude',
    monitorTypeSurfaces: 'exclude',
  });
}

export async function listDevices() {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cams: all.filter((d) => d.kind === 'videoinput'),
    mics: all.filter((d) => d.kind === 'audioinput'),
    speakers: all.filter((d) => d.kind === 'audiooutput'),
  };
}

// Medidor de nível de áudio simples (RMS) para um MediaStream.
export function levelMeter(stream, onLevel) {
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  let raf;
  const tick = () => {
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(raf);
    ctx.close();
  };
}

/**
 * Tela de pré-entrada (escolha de câmera/mic/nome). Resolve com { camStream, micStream, name, camOn, micOn, prefs }.
 */
export function lobby({ mount, title, subtitle, askName = true, defaultName = '', cta = 'Entrar no estúdio', models = false }) {
  return new Promise(async (resolve) => {
    const prefs = loadPrefs();
    const el = h(`
      <div class="lobby">
        <div class="lobby-card card">
          <div class="lobby-preview">
            <div class="lb-prev-head">
              <span class="lb-ar-tag">16:9 Camera Preview</span>
              <span class="pill ok lb-hd-tag"><span class="dot"></span>HD</span>
            </div>
            <video autoplay playsinline muted></video>
            <div class="cam-off" hidden>${icons.camOff.replace('<svg', '<svg width="48" height="48"')}</div>
            <div class="cam-loading" id="lb-loading" role="status" aria-live="polite" hidden><div class="spin"></div><b id="lb-load-title">Carregando câmeras…</b><span id="lb-load-hint"></span></div>
            <div class="lb-vu" aria-hidden="true" title="Nível do microfone (dB)">
              <span>VU</span>
              <div class="lb-vu-bars"><i id="lb-vu-l"></i><i id="lb-vu-r"></i></div>
              <small>dB</small>
            </div>
            <div class="lobby-ctrls">
              <button class="round-btn" id="lb-mic" type="button" title="Microfone">${icons.mic}</button>
              <button class="round-btn" id="lb-cam" type="button" title="Câmera">${icons.cam}</button>
            </div>
          </div>
          <div class="lobby-form">
            <h2 translate="no">${esc(title)}</h2>
            <div class="sub">${esc(subtitle)}</div>
            ${window.CDi18n ? `<label class="field"><span>Idioma</span>${window.CDi18n.selectHTML({ className: 'input', id: 'lb-lang' })}</label>` : ''}
            ${askName ? `<label class="field"><span>Seu nome</span><input class="input" id="lb-name" maxlength="40" placeholder="Como você aparecerá na tela" value="${esc(prefs.name || defaultName)}"></label>` : ''}
            <label class="field"><span>Câmera</span><select class="input" id="lb-camsel"></select></label>
            <label class="field"><span>Microfone</span><select class="input" id="lb-micsel"></select></label>
            <div class="meter" style="margin:-4px 0 8px"><i id="lb-level"></i></div>
            <label class="switch-row" style="display:flex;gap:8px;align-items:center;margin:0 0 12px;font-size:13px"><input type="checkbox" id="lb-raw" ${prefs.rawMic ? 'checked' : ''}> Áudio puro (sem redução de ruído e sem cancelamento de eco)</label>
            <label class="field"><span>Qualidade da câmera</span>
              <select class="input" id="lb-quality"><option value="720">HD 720p</option><option value="1080">Full HD 1080p</option><option value="480">SD 480p (economia)</option></select>
            </label>
            ${models ? `<details class="lb-models" id="lb-models" style="margin:0 0 10px"><summary style="cursor:pointer;font-size:12.5px;color:var(--text-2)">Modelos de IA — liberar espaço</summary><div id="lb-models-list" class="hint" style="margin-top:8px">Carregando…</div></details>` : ''}
            <div style="flex:1"></div>
            <button class="btn primary lb-cta" id="lb-go" style="height:46px;font-size:15px">${esc(cta)} →</button>
            <div class="hint" id="lb-err" style="margin-top:10px;color:hsl(354 90% 72%)"></div>
          </div>
        </div>
      </div>`);
    mount.replaceChildren(el);

    // gerenciador de modelos de IA (só no lobby do host): mostra tamanho e apaga para liberar espaço
    if (models) {
      const box = $('#lb-models-list', el);
      const fmt = (n) => (!n ? '0 MB' : n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : `${(n / 1048576).toFixed(0)} MB`);
      const paint = async () => {
        try {
          const j = await (await fetch('/api/caption/models', { cache: 'no-store' })).json();
          const list = j.models || [];
          box.innerHTML = list
            .map(
              (m) => `<div class="lb-model" data-id="${esc(m.id)}" style="display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid var(--line)">
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.label)}</span>
                <b style="font-size:11.5px;color:var(--text-2)">${m.ready ? fmt(m.size) : 'não baixado'}</b>
                ${m.ready ? `<button class="btn sm" data-del="${esc(m.id)}" title="Apagar este modelo do disco">Apagar</button>` : ''}
              </div>`,
            )
            .join('');
        } catch (e) {
          box.textContent = 'Não foi possível listar os modelos: ' + e.message;
        }
      };
      box.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-del]');
        if (!b) return;
        const id = b.dataset.del;
        const row = b.closest('.lb-model');
        const name = row?.querySelector('span')?.textContent || id;
        if (!confirm(`Apagar o modelo "${name}"? Ele será baixado de novo quando você ligar a legenda.`)) return;
        b.disabled = true;
        try {
          const r = await fetch('/api/caption/models/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || 'falha ao apagar');
          await paint();
        } catch (e) {
          box.textContent = e.message;
        }
      });
      paint();
    }

    const video = $('video', el);
    const camSel = $('#lb-camsel', el);
    const micSel = $('#lb-micsel', el);
    const qSel = $('#lb-quality', el);
    const err = $('#lb-err', el);
    qSel.value = prefs.quality || '720';
    let camStream = null;
    let micStream = null;
    let camOn = prefs.camOn !== false;
    let micOn = prefs.micOn !== false;
    let stopMeter = () => {};

    // Feedback de carregamento: spinner + dicas que mudam com o tempo (a permissão do navegador costuma ser o motivo da espera)
    const goBtn = $('#lb-go', el);
    const goLabel = goBtn.textContent;
    let loadTimers = [];
    const loading = (on, title = 'Carregando câmeras…', allowGo = false) => {
      loadTimers.forEach(clearTimeout);
      loadTimers = [];
      $('#lb-loading', el).hidden = !on;
      goBtn.disabled = on && !allowGo;
      goBtn.textContent = on && !allowGo ? 'Aguarde…' : goLabel;
      if (!on) return;
      $('#lb-load-title', el).textContent = title;
      const hint = (t) => ($('#lb-load-hint', el).textContent = t);
      hint('Isso leva só alguns segundos.');
      loadTimers.push(setTimeout(() => hint('Se o navegador perguntar, toque em “Permitir” para usar câmera e microfone.'), 2500));
      loadTimers.push(setTimeout(() => hint('Está demorando… feche outros apps que usam a câmera (Zoom, Meet, Teams).'), 9000));
    };

    const fillDevices = async () => {
      const { cams, mics } = await listDevices();
      camSel.innerHTML = cams.map((d, i) => `<option value="${d.deviceId}">${esc(d.label || 'Câmera ' + (i + 1))}</option>`).join('') || '<option value="">Nenhuma câmera</option>';
      micSel.innerHTML = mics.map((d, i) => `<option value="${d.deviceId}">${esc(d.label || 'Microfone ' + (i + 1))}</option>`).join('') || '<option value="">Nenhum microfone</option>';
      if (prefs.camId && cams.some((c) => c.deviceId === prefs.camId)) camSel.value = prefs.camId;
      if (prefs.micId && mics.some((c) => c.deviceId === prefs.micId)) micSel.value = prefs.micId;
    };

    // Mostra a câmera no <video> de forma garantida: força play() (o autoplay falha de vez em quando) e
    // vigia o primeiro quadro; se a prévia ficar preta, reinicia a câmera sozinho (o que antes exigia trocar de item e voltar).
    let camRetries = 0;
    let camWatch = null;
    const showCam = (stream) => {
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      video.play?.().catch(() => {});
      clearTimeout(camWatch);
      const check = () => {
        if (!camStream || camStream !== stream) return;
        if (document.hidden) return void (camWatch = setTimeout(check, 2500)); // aba em segundo plano n\u00e3o renderiza v\u00eddeo
        const t = stream.getVideoTracks()[0];
        const dead = !t || t.readyState === 'ended';
        const black = video.readyState < 2 || !video.videoWidth;
        if (!dead && !black) return;
        if (camRetries++ < 3) {
          console.warn('[lobby] prévia sem imagem; reiniciando a câmera (' + camRetries + ')');
          startCam('Reconectando a câmera…');
        } else {
          err.textContent = 'A câmera não enviou imagem. Escolha outra câmera na lista ou recarregue a página.';
        }
      };
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        clearTimeout(camWatch);
        check(); // a câmera caiu: não espera o prazo
      });
      camWatch = setTimeout(check, 1800);
    };
    const startCam = async (title = 'Trocando de câmera…') => {
      camStream?.getTracks().forEach((t) => t.stop());
      camStream = null;
      loading(true, typeof title === 'string' ? title : 'Trocando de câmera…');
      try {
        camStream = await getCamera(camSel.value || undefined, qSel.value);
        showCam(camStream);
        err.textContent = '';
      } catch (e) {
        err.textContent = 'Câmera indisponível: ' + e.message;
      }
      loading(false);
      paint();
    };
    const setVu = (v) => {
      const lv = micOn ? Math.min(1, v) : 0;
      $('#lb-level', el).style.width = lv * 100 + '%';
      $('#lb-vu-l', el)?.style.setProperty('--v', lv.toFixed(3));
      $('#lb-vu-r', el)?.style.setProperty('--v', (lv * 0.92).toFixed(3));
    };
    const startMic = async () => {
      stopMeter();
      micStream?.getTracks().forEach((t) => t.stop());
      micStream = null;
      try {
        micStream = await getMic(micSel.value || undefined);
        stopMeter = levelMeter(micStream, setVu);
      } catch (e) {
        err.textContent = 'Microfone indisponível: ' + e.message;
      }
      paint();
    };
    const paint = () => {
      $('#lb-cam', el).classList.toggle('off', !camOn);
      $('#lb-cam', el).innerHTML = camOn ? icons.cam : icons.camOff;
      $('#lb-mic', el).classList.toggle('off', !micOn);
      $('#lb-mic', el).innerHTML = micOn ? icons.mic : icons.micOff;
      $('.cam-off', el).hidden = camOn && !!camStream;
      video.style.visibility = camOn ? 'visible' : 'hidden';
    };

    // Handlers ativos desde já: o host pode entrar sem esperar a câmera carregar.
    let entered = false;
    camSel.onchange = () => ((camRetries = 0), startCam());
    qSel.onchange = () => ((camRetries = 0), startCam());
    micSel.onchange = startMic;
    $('#lb-raw', el).onchange = (e) => {
      savePrefs({ rawMic: e.target.checked });
      startMic();
    };
    $('#lb-cam', el).onclick = () => {
      camOn = !camOn;
      paint();
    };
    $('#lb-mic', el).onclick = () => {
      micOn = !micOn;
      if (!micOn) setVu(0);
      paint();
    };
    $('#lb-go', el).onclick = () => {
      const name = askName ? $('#lb-name', el).value.trim() : defaultName;
      if (askName && !name) {
        $('#lb-name', el).focus();
        err.textContent = 'Informe seu nome.';
        return;
      }
      entered = true;
      stopMeter();
      goBtn.disabled = true;
      goBtn.textContent = 'Entrando\u2026';
      const p = { name, camId: camSel.value, micId: micSel.value, quality: qSel.value, camOn, micOn };
      savePrefs(p);
      resolve({ camStream, micStream, name, camOn, micOn, prefs: p, media: mediaPromise });
    };

    // Pede câmera/microfone aqui no lobby (é aqui que a permissão aparece), mas NÃO bloqueia o botão Entrar.
    // A promessa `media` entrega os tracks depois, para quem entrar antes de a câmera abrir.
    const mediaPromise = (async () => {
      loading(true, 'Carregando câmeras…', true);
      const ideal = (id) => (id ? { deviceId: { ideal: id } } : {});
      const sz = { 1080: [1920, 1080], 720: [1280, 720], 480: [854, 480] }[qSel.value] || [1280, 720];
      const pAudio = !rawMic();
      const videoC = { ...ideal(prefs.camId), width: { ideal: sz[0] }, height: { ideal: sz[1] }, frameRate: { ideal: 30 } };
      const audioC = { ...ideal(prefs.micId), echoCancellation: pAudio, noiseSuppression: pAudio, autoGainControl: pAudio, channelCount: 1 };
      let first = null;
      try {
        first = await navigator.mediaDevices.getUserMedia({ video: videoC, audio: audioC });
      } catch {
        const parts = await Promise.allSettled([navigator.mediaDevices.getUserMedia({ video: videoC }), navigator.mediaDevices.getUserMedia({ audio: audioC })]);
        first = new MediaStream(parts.flatMap((p) => (p.status === 'fulfilled' ? p.value.getTracks() : [])));
        const denied = parts.find((p) => p.status === 'rejected');
        if (denied && !first.getTracks().length) err.textContent = 'Permita o acesso à câmera e ao microfone: ' + denied.reason.message;
      }
      if (first.getVideoTracks().length) {
        camStream = new MediaStream(first.getVideoTracks());
        showCam(camStream);
        err.textContent = '';
      }
      if (first.getAudioTracks().length) {
        micStream = new MediaStream(first.getAudioTracks());
        stopMeter = levelMeter(micStream, setVu);
      }
      loading(false);
      if (!camStream && !err.textContent) err.textContent = 'Nenhuma câmera disponível.';
      paint();
      await fillDevices().catch(() => {});
      const curCam = camStream?.getVideoTracks()[0]?.getSettings().deviceId;
      const curMic = micStream?.getAudioTracks()[0]?.getSettings().deviceId;
      if (curCam && [...camSel.options].some((o) => o.value === curCam)) camSel.value = curCam;
      if (curMic && [...micSel.options].some((o) => o.value === curMic)) micSel.value = curMic;
      return { camStream, micStream };
    })();
  });
}
