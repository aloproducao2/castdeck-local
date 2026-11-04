import { Peer } from '../rtc.js';

// Controle remoto por celular (QR): comanda a mesa de corte do estúdio sem enviar câmera/microfone.
// Papel 'remote' na sinalização: recebe um resumo do estúdio (remote-state), pode pedir quadros JPEG do PGM
// (remote-frame, só quando alguém liga o vídeo) e manda comandos (remote-cmd) que o host valida e executa.
export function createRemote({ S, comp, mixer, getSig, studioId, getSwitcher, getAuto, getReplay, getLayouts, getScenes, applyEdit, mediaApi, getChat, getMessages, api, $, esc, toast, qrSvg, copyText, modal }) {
  const t = (s) => window.CDi18n?.t(s) ?? s;
  let key = '';
  let remotes = 0;
  let viewers = 0;
  let net = '';
  let showQr = true;
  let lastJson = '';
  let frameTimer = 0;
  let allowVideo = localStorage.getItem('cd.remote.video') !== '0';
  let replaySpeed = 0.5; // velocidade escolhida no celular; vale para o próximo replay e para o que está no ar
  const off = document.createElement('canvas');
  const audioPeers = new Map(); // clientId -> { peer, as }

  const httpPort = () => S.system?.httpPort || Number(location.port) || 3000;
  function bases() {
    const list = [];
    for (const l of S.system?.lan || []) list.push({ id: 'lan:' + l.address, label: `${t('Wi-Fi / rede local')} · ${l.address}`, url: `http://${l.address}:${httpPort()}` });
    if (S.system?.tunnel?.url) list.push({ id: 'net', label: t('Internet (túnel público)'), url: S.system.tunnel.url });
    if (!list.length) list.push({ id: 'local', label: t('Este computador (só teste)'), url: `http://localhost:${httpPort()}` });
    return list;
  }
  function link() {
    const b = bases().find((x) => x.id === net) || bases()[0];
    return `${b.url}/remote/${studioId}${key ? `?k=${key}` : ''}`;
  }

  let diag = '';
  let tunnelBusy = false;
  async function testLinks() {
    const list = bases();
    diag = t('Testando…');
    paint();
    const results = await Promise.all(list.map(async (b) => {
      try {
        const r = await fetch(`${b.url}/remote/${studioId}`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        return `${b.id === 'net' ? 'Internet' : b.label}: ${r.ok ? 'OK' : 'HTTP ' + r.status}`;
      } catch {
        return `${b.id === 'net' ? 'Internet' : b.label}: não respondeu`;
      }
    }));
    diag = results.join(' · ');
    paint();
  }
  async function useTunnel() {
    if (tunnelBusy) return;
    if (S.system?.tunnel?.url) {
      net = 'net';
      lastJson = '';
      paint();
      return;
    }
    tunnelBusy = true;
    diag = t('Criando um link público temporário…');
    paint();
    try {
      let info = await api('/tunnel/start', { method: 'POST' });
      for (let i = 0; i < 20 && !info?.url; i++) {
        await new Promise((r) => setTimeout(r, 800));
        info = await api('/tunnel');
      }
      if (info?.url) {
        S.system.tunnel = info;
        net = 'net';
        diag = t('Link público pronto. Use-o se o celular não alcançar a rede local.');
      } else {
        diag = t('O túnel não ficou pronto. Verifique sua internet ou use a rede local.');
      }
    } catch (e) {
      diag = t('Falha ao criar o túnel: ') + (e.message || e);
    } finally {
      tunnelBusy = false;
      lastJson = '';
      paint();
    }
  }

  // ---- estado que o celular enxerga ----
  // O canal de áudio de câmera/tela é `<id>:audio`; antes o remoto lia o id do vídeo e o fader não fazia nada.
  const audioIdOf = (id) => {
    if (mixer.sources.has(`${id}:audio`)) return `${id}:audio`;
    const byStage = [...mixer.sources.values()].find((a) => a.stageKey === id);
    return byStage?.id || id;
  };
  function audioInfo(id) {
    const list = [...mixer.sources.values()].filter((a) => a.stageKey === id);
    const ch = mixer.sources.get(audioIdOf(id));
    return {
      hasAudio: list.length > 0,
      muted: list.length > 0 && list.every((a) => a.muted),
      audioId: ch?.id || null,
      volume: ch?.volume ?? 1,
      solo: list.some((a) => a.solo),
      sends: Object.fromEntries((mixer.busList?.() || []).map((b) => [b.id, list.some((a) => a.sends?.get(b.id)?.gain.value > 0.01)])),
    };
  }
  function snapshot() {
    const au = getAuto();
    const mediaList = mediaApi ? mediaApi.list() : [];
    const deckSel = mediaApi?.getDeckSel?.();
    const medias = mediaList.map((s) => ({
      id: s.id,
      label: s.label || '',
      isAudio: !!s.camOff,
      paused: !!s.el?.paused,
      currentTime: s.el?.currentTime || 0,
      duration: s.el?.duration || 0,
      onStage: S.stage.includes(s.id),
      volume: mixer.sources.get(s.id)?.volume ?? 1,
      muted: !!mixer.sources.get(s.id)?.muted,
    }));
    return {
      name: S.studio?.name || '',
      allowVideo,
      switcher: !!S.switcher,
      take: S.take || null,
      pvw: S.pvw || null,
      ftb: !!S.ftb,
      layout: S.layout,
      layouts: getLayouts(),
      scenes: (S.brand.quickScenes || []).slice(0, 6).map((sc) => (sc ? { name: sc.name || '' } : null)),
      activeScene: typeof getScenes?.()?.active === 'function' ? getScenes().active() : -1,
      solo: S.solo || null,
      stage: [...S.stage],
      live: !!S.streaming,
      rec: !!S.recording,
      activeBanner: S.activeBanner || null,
      banners: S.banners.map((b) => ({ id: b.id, title: b.title, subtitle: b.subtitle })),
      director: { on: !!au?.on, duck: !!au?.duckOn },
      masterVolume: mixer.master ?? 1,
      masterMuted: !!mixer.masterMuted,
      dim: !!mixer.dim,
      anySolo: !!mixer.anySolo,
      replay: (() => {
        const eng = getReplay?.();
        if (!eng) return null;
        const st = eng.getStats?.() || {};
        const ps = eng.getPlayoutState?.() || {};
        return {
          active: !!st.active,
          duration: st.duration || 0,
          max: st.maxDuration || 45,
          onAir: !!ps.onAir,
          paused: !!ps.paused,
          time: ps.time || 0,
          speed: ps.onAir ? (ps.baseSpeed || ps.speed || replaySpeed) : replaySpeed,
          autoTake: eng.getAutoTake?.() !== false,
        };
      })(),
      buses: (mixer.busList?.() || []).map((b) => ({ id: b.id, mute: !!b.mute, level: b.level ?? 1, deviceId: b.deviceId || '' })),
      items: [...S.sources.values()].map((s) => ({
        id: s.id,
        label: s.label || '',
        kind: s.kind,
        ownerId: s.ownerId,
        micOn: s.micOn,
        camOff: !!s.camOff,
        volume: mixer.sources.get(s.id)?.volume ?? 1,
        ...audioInfo(s.id),
      })),
      medias,
      activeMedia: deckSel || medias.find((m) => !m.paused)?.id || medias[0]?.id || null,
      playlist: { on: !!S.playlist?.on, loop: !!S.playlist?.loop },
      messages: (getMessages?.()?.items?.() || [])
        .filter((m) => m.text || m.audio)
        .slice(0, 8)
        .map((m) => ({ id: m.id, name: m.name || '', text: String(m.text || '').slice(0, 160), audio: !!m.audio, source: m.source || 'public', air: getMessages()?.airId === m.id })),
      chat: (getChat?.() || []).slice(-40).map((m) => ({ id: m.id, from: m.from, name: m.name, role: m.role, text: m.text, ts: m.ts })),
    };
  }
  function sync() {
    const sig = getSig();
    if (!sig || !remotes) return;
    const snap = snapshot();
    const j = JSON.stringify(snap);
    if (j === lastJson) return;
    lastJson = j;
    sig.send({ type: 'remote-state', state: snap });
  }

  // ---- vídeo de prévia (quadros JPEG pequenos do programa) ----
  function frame() {
    const sig = getSig();
    const cv = comp?.canvas;
    if (!sig || !cv || !cv.width || !viewers || !allowVideo) return;
    const w = 480;
    off.width = w;
    off.height = Math.round((w * cv.height) / cv.width);
    off.getContext('2d').drawImage(cv, 0, 0, off.width, off.height);
    sig.send({ type: 'remote-frame', data: off.toDataURL('image/jpeg', 0.55) });
  }
  function setViewers(n) {
    viewers = n;
    clearInterval(frameTimer);
    frameTimer = viewers && allowVideo ? setInterval(frame, 250) : 0;
  }

  // ---- comandos vindos do celular ----
  function run(m) {
    const c = m.cmd || {};
    const sw = getSwitcher();
    const has = (id) => !!id && S.sources.has(id);
    switch (c.op) {
      case 'switcher':
        if (!!S.switcher !== !!c.on) sw?.setMode(!!c.on);
        return;
      case 'pvw':
        if (S.switcher && has(c.id)) sw.setPreview(c.id);
        return;
      case 'cut-to':
        if (!S.switcher) sw?.setMode(true, { silent: true });
        if (has(c.id)) sw.cutTo(c.id);
        return;
      case 'take':
        if (S.switcher) sw.take(c.kind === 'mix' ? 'mix' : 'cut');
        return;
      case 'ftb':
        if (S.switcher && !!S.ftb !== !!c.on) sw.setBlack(!!c.on);
        return;
      case 'mute': {
        const list = [...mixer.sources.values()].filter((a) => a.stageKey === c.id || a.id === c.id);
        for (const a of list) mixer.setMuted(a.id, !!c.on);
        return;
      }
      case 'replay-buffer': {
        const eng = getReplay?.();
        if (!eng) return;
        if (eng.getStats?.().active) eng.stopBuffer?.();
        else eng.startBuffer?.();
        return;
      }
      case 'replay-trigger': {
        const eng = getReplay?.();
        if (!eng) return;
        const secs = Math.max(1, Math.min(60, Number(c.seconds) || 10));
        // Primeiro clique também funciona: liga o buffer, espera o 1º pedaço e tenta recortar
        // algumas vezes. Antes, com o buffer parado, o clique só iniciava e não ia ao ar.
        (async () => {
          if (!eng.getStats?.().active) {
            eng.startBuffer?.();
            await new Promise((r) => setTimeout(r, 1400));
          }
          let clip = await eng.createClip(secs);
          for (let i = 0; i < 3 && !clip?.url; i++) {
            await new Promise((r) => setTimeout(r, 800));
            clip = await eng.createClip(secs);
          }
          if (!clip?.url) return;
          if (eng.getAutoTake?.() === false) {
            // AUTO TAKE desligado: prepara no Preview do console, sem ir ao ar.
            const previewCmd = { action: 'preview-clip', url: clip.url, duration: clip.duration };
            const sent = eng.sendCommand?.(previewCmd);
            if (!sent) {
              window.__castdeck?.openReplayConsole?.();
              setTimeout(() => eng.sendCommand?.(previewCmd), 1400);
            }
            return;
          }
          eng.playoutReplay?.({ url: clip.url, speed: replaySpeed, currentTime: 0, audioRoute: 'pgm', audioVolume: 0.8, wipe: true });
        })();
        return;
      }
      case 'replay-auto-take': getReplay?.()?.setAutoTake?.(!!c.on); return;
      case 'replay-stop': getReplay?.()?.stopPlayout?.(); return;
      case 'replay-pause': getReplay?.()?.pausePlayout?.(); return;
      case 'replay-play': getReplay?.()?.playPlayout?.(); return;
      case 'replay-speed': {
        if (!Number.isFinite(c.speed)) return;
        replaySpeed = Math.max(0.05, Math.min(2, c.speed));
        if (getReplay?.()?.isPlayoutOnAir?.()) getReplay?.().setPlayoutSpeed?.(replaySpeed);
        return;
      }
      case 'mute-all': {
        for (const a of mixer.sources.values()) {
          if (a.stageKey === 'replay:out') continue;
          mixer.setMuted(a.id, !!c.on);
        }
        return;
      }
      case 'audio-solo': {
        const list = [...mixer.sources.values()].filter((a) => a.stageKey === c.id || a.id === c.id);
        for (const a of list) mixer.setSolo(a.id, !!c.on);
        return;
      }
      case 'clear-solo':
        mixer.clearSolo();
        return;
      case 'send': {
        const list = [...mixer.sources.values()].filter((a) => a.stageKey === c.id || a.id === c.id);
        for (const a of list) mixer.setSend(a.id, c.bus, !!c.on);
        return;
      }
      case 'bus-mute':
        mixer.setBusMute(c.bus, !!c.on);
        return;
      case 'bus-level':
        if (Number.isFinite(c.level)) mixer.setBusLevel(c.bus, c.level);
        return;
      case 'master-mute':
        mixer.setMasterMuted(!!c.on);
        return;
      case 'dim':
        mixer.setDim(!!c.on);
        return;
      case 'director': {
        const au = getAuto();
        if (au && au.on !== !!c.on) {
          au.setOn(!!c.on);
          au.paint?.();
        }
        return;
      }
      case 'ducking': {
        const au = getAuto();
        if (au && au.duckOn !== !!c.on) {
          au.setDuck(!!c.on);
          au.paint?.();
        }
        return;
      }
      case 'media-play':
        mediaApi?.play(c.id);
        return;
      case 'media-pause':
        mediaApi?.pause(c.id);
        return;
      case 'media-step':
        mediaApi?.step(c.dir || 1);
        return;
      case 'media-seek':
        mediaApi?.seek(c.id, c.time);
        return;
      case 'media-vol':
        if (c.id && Number.isFinite(c.vol)) mixer.setVolume(c.id, c.vol);
        return;
      case 'master-vol':
        if (Number.isFinite(c.vol)) mixer.setMaster(c.vol);
        return;
      case 'src-vol': {
        // Aceita id do vídeo (guest:cam) ou do canal de áudio (guest:cam:audio).
        if (!c.id || !Number.isFinite(c.vol)) return;
        const list = [...mixer.sources.values()].filter((a) => a.id === c.id || a.stageKey === c.id);
        for (const a of list) mixer.setVolume(a.id, c.vol);
        return;
      }
      default:
        applyEdit(m); // layout, palco, solo, banners, microfone de convidado (mesmo caminho do co-host)
    }
    setTimeout(sync, 40); // sincroniza o novo estado de volta ao celular imediatamente
  }

  // ---- áudio PGM por WebRTC para o celular monitorar ----
  function onRemoteAudio({ from, on }) {
    const existing = audioPeers.get(from);
    if (existing) {
      try { existing.peer.close(); } catch {}
      audioPeers.delete(from);
    }
    if (!on) return;
    const sig = getSig();
    if (!sig) return;
    const peer = new Peer({ id: from, polite: false, signal: (data) => sig.send({ type: 'signal', to: from, data }) });
    const track = mixer.programTrack;
    const ms = new MediaStream();
    const at = peer.pc.addTransceiver(track || 'audio', { direction: 'sendonly', streams: [ms] });
    peer.addEventListener('state', (e) => {
      if (e.detail === 'connected') peer.setMaxBitrate(at.sender, 256_000);
    });
    audioPeers.set(from, { peer, as: at.sender });
  }

  function handleSignal(m) {
    const ap = audioPeers.get(m.from);
    if (ap) {
      ap.peer.handle(m.data);
      return true;
    }
    return false;
  }

  // ---- painel no Diretor ----
  function paintInto(box) {
    const q = (s) => box.querySelector(s);
    const bs = bases();
    if (!bs.some((b) => b.id === net)) net = bs[0].id;
    const url = link();
    const statusText = remotes
      ? `${remotes} ${t('controle(s) conectado(s)')}${viewers ? ` · ${viewers} ${t('com vídeo')}` : ''}`
      : t('Nenhum controle conectado');
    box.innerHTML = `
      <div class="rc-head">
        <span class="rc-head-ico" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="7" y="2.5" width="10" height="19" rx="2.5"></rect><line x1="10.5" y1="18.5" x2="13.5" y2="18.5"></line></svg>
        </span>
        <div class="rc-head-txt">
          <b>${t('Controle remoto no celular')}</b>
          <span class="rc-sub">${t('Mesa de corte completa no celular, sem enviar câmera nem microfone.')}</span>
        </div>
      </div>
      <div class="rc-grid">
        <div class="rc-qr-col">
          <div class="rc-qr-card ${showQr ? '' : 'hide'}">
            <div class="rc-qr ${showQr ? '' : 'hide'}">${showQr ? qrSvg(url) : ''}</div>
            <span class="rc-qr-cap">${t('Aponte a câmera do celular')}</span>
          </div>
        </div>
        <div class="rc-side">
          <label class="rc-field">
            <span class="rc-label">${t('Rede')}</span>
            ${bs.length > 1
              ? `<select class="input sm" data-rc="net">${bs.map((b) => `<option value="${esc(b.id)}" ${b.id === net ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}</select>`
              : `<span class="rc-net-pill">${esc(bs[0].label)}</span>`}
          </label>
          <div class="rc-link">
            <span class="rc-label">${t('Link de acesso')}</span>
            <code class="rc-url" title="${esc(url)}">${esc(url)}</code>
          </div>
          <div class="rc-actions">
            <button class="btn sm primary" data-rc="copy">${t('Copiar link')}</button>
            <button class="btn sm" data-rc="open" title="${t('Abrir o controle neste computador (teste)')}">${t('Abrir no PC')}</button>
            <button class="btn sm ghost" data-rc="qr">${showQr ? t('Ocultar QR') : t('Mostrar QR')}</button>
            <button class="btn sm ghost" data-rc="test">${t('Testar rede')}</button>
          </div>
          <div class="rc-status">
            <span class="rc-dot ${remotes ? 'on' : ''}" aria-hidden="true"></span>
            <span data-rc="count">${statusText}</span>
          </div>
          <div class="rc-diag" data-rc="diag">${esc(diag)}</div>
          <button class="btn sm ghost rc-tunnel" data-rc="tunnel">${S.system?.tunnel?.url ? t('Usar link da Internet') : t('Criar link pela Internet')}</button>
        </div>
      </div>
      <label class="rc-toggle">
        <span><b>${t('Permitir vídeo no controle')}</b><small>${t('Mostra o PGM no celular (gasta rede). Cada controle liga ou desliga o seu.')}</small></span>
        <span class="switch"><input type="checkbox" data-rc="video" ${allowVideo ? 'checked' : ''}><span></span></span>
      </label>
      <p class="rc-help">${t('Se o celular não abrir: confirme que está na mesma rede Wi-Fi, desligue os dados móveis e permita o CastDeck no firewall do Windows.')}</p>`;
    q('[data-rc=net]')?.addEventListener('change', (e) => ((net = e.target.value), paint()));
    q('[data-rc=copy]').onclick = () => copyText?.(url);
    q('[data-rc=qr]').onclick = () => ((showQr = !showQr), paint());
    q('[data-rc=open]').onclick = () => window.open(url.replace(/^https?:\/\/[^/]+/, location.origin), '_blank', 'width=420,height=860');
    q('[data-rc=test]').onclick = testLinks;
    q('[data-rc=tunnel]').onclick = useTunnel;
    q('[data-rc=video]').onchange = (e) => {
      allowVideo = e.target.checked;
      localStorage.setItem('cd.remote.video', allowVideo ? '1' : '0');
      lastJson = '';
      setViewers(viewers);
    };
  }
  // repinta o painel do Diretor e o modal (se estiverem abertos)
  function paint() {
    for (const box of document.querySelectorAll('#remote-box, .rc-modal')) paintInto(box);
  }
  function mountPanel() {
    const dp = $('#dir-panel');
    if (!dp) return;
    let box = $('#remote-box');
    if (!box) {
      box = document.createElement('section');
      box.id = 'remote-box';
      box.className = 'dp-sec dp-remote';
    }
    // O controle remoto é uma seção do acordeão do Diretor.
    const slot = dp.querySelector('#dir-remote-slot');
    if (slot) {
      if (box.parentElement !== slot) slot.appendChild(box);
    } else if (!box.isConnected) {
      const anchor = dp.querySelector('details.dir-acc[data-dsec="help"]') || dp.querySelector(':scope > .dp-help');
      if (anchor) dp.insertBefore(box, anchor);
      else dp.appendChild(box);
    }
    paintInto(box);
  }
  // botão do header: abre o mesmo conteúdo num modal com o QR bem à vista
  function openModal() {
    modal('<div class="rc-modal dp-remote"></div>', { onMount: (card) => paintInto(card.querySelector('.rc-modal')) });
  }

  setInterval(sync, 250);

  return {
    mountPanel,
    openModal,
    link: () => link(),
    run,
    sync,
    onRemoteAudio,
    handleSignal,
    setKey: (k) => ((key = k || key), paint()),
    onCount: (m) => {
      remotes = m.n || 0;
      lastJson = '';
      setViewers(m.viewers || 0);
      paint();
    },
  };
}
