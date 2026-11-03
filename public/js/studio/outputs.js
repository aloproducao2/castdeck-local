// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Sinais para OBS / vMix: cada sinal tem um link próprio (/out/<estúdio>?src=...) para usar como
// fonte de navegador. A página de saída recebe do estúdio, por WebRTC, o programa horizontal (pgm),
// o vertical (vpgm) ou uma fonte isolada (câmera de convidado, tela, câmera extra, mídia) com o áudio dela.
// Convidados usam vagas fixas (guest:1, guest:2…) que acompanham o nome: o link continua valendo se ele reconectar.
import { Peer } from '../rtc.js';

export function createOutputs({ S, studioId, getSig, getMixer, getStreams, $, $$, esc, icons, copyText, api, vNeeded = () => false }) {
  const outs = new Map(); // id da página de saída -> { id, src, peer, vs, as, v, a, signal }
  const known = new Set(); // ids de saídas (sinais atrasados nunca viram "convidado fantasma")
  let outKey = '';
  const SLOT_KEY = `castdeck.outslots.${studioId}`;
  let slots = [];
  try {
    slots = JSON.parse(localStorage.getItem(SLOT_KEY) || '[]');
  } catch {}

  // ---------- vagas fixas dos convidados ----------
  function guestSlots() {
    const guests = [...S.guests.values()].filter((g) => !g.removed);
    const map = new Map(); // slot (1..n) -> guest
    const used = new Set();
    // quem já tem vaga pelo nome volta para ela
    for (const g of guests) {
      const i = slots.indexOf(g.name);
      if (i >= 0 && !used.has(i)) {
        used.add(i);
        map.set(i + 1, g);
      }
    }
    let changed = false;
    for (const g of guests) {
      if ([...map.values()].includes(g)) continue;
      // vaga livre: a primeira cujo dono não está no estúdio
      let i = slots.findIndex((n, k) => !used.has(k) && !guests.some((x) => x.name === n));
      if (i < 0) i = slots.length;
      slots[i] = g.name;
      used.add(i);
      map.set(i + 1, g);
      changed = true;
    }
    if (changed) {
      slots = slots.slice(0, 24);
      try {
        localStorage.setItem(SLOT_KEY, JSON.stringify(slots));
      } catch {}
    }
    return map;
  }

  // src do link -> id da fonte de vídeo no estúdio
  function sourceIdOf(src) {
    const m = /^(guest|gscreen):(\d+)$/.exec(src || '');
    if (!m) return src;
    const g = guestSlots().get(Number(m[2]));
    return g ? `${g.id}:${m[1] === 'guest' ? 'cam' : 'screen'}` : null;
  }

  function tracksFor(src) {
    const mixer = getMixer();
    const { programStream, vStream } = getStreams();
    if (src === 'pgm') return { v: programStream?.getVideoTracks()[0] || null, a: mixer.programTrack, ok: true };
    if (src === 'vpgm') return { v: vStream?.getVideoTracks()[0] || null, a: mixer.programTrack, ok: true };
    const id = sourceIdOf(src);
    const s = id && S.sources.get(id);
    if (!s || s.kind === 'image') return { v: null, a: null, ok: false };
    let v = null;
    if (s.kind === 'media') {
      try {
        if (!s._cap || !s._cap.getVideoTracks().some((t) => t.readyState === 'live')) s._cap = s.el.captureStream?.() || null;
      } catch {}
      v = s._cap?.getVideoTracks().find((t) => t.readyState === 'live') || null;
    } else {
      v = s.stream?.getVideoTracks().find((t) => t.readyState === 'live') || null;
    }
    return { v, a: mixer.isoTrack(id), ok: !!v || s.kind === 'media' };
  }

  // ---------- conexões com as páginas de saída ----------
  function add(id, src) {
    remove(id);
    known.add(id);
    const sig = getSig();
    const peer = new Peer({ id, polite: false, signal: (data) => sig.send({ type: 'signal', to: id, data }) });
    const t = tracksFor(src);
    const ms = new MediaStream();
    // contentHint "detail"/"music" faz o codificador priorizar qualidade em vez de movimento (o sinal de
    // OBS/vMix deve ficar nítido, não "suave").
    if (t.v) t.v.contentHint = 'detail';
    if (t.a) t.a.contentHint = 'music';
    const vt = peer.pc.addTransceiver(t.v || 'video', { direction: 'sendonly', streams: [ms] });
    const at = peer.pc.addTransceiver(t.a || 'audio', { direction: 'sendonly', streams: [ms] });
    const o = { id, src, peer, vs: vt.sender, as: at.sender, v: t.v, a: t.a, signal: null };
    peer.addEventListener('state', (e) => {
      if (e.detail !== 'connected') return;
      pinQuality(o);
      o.signal = null; // reenvia o estado do sinal
      sync(o);
    });
    peer.addEventListener('stuck', () => {
      sig.send({ type: 'control', to: id, action: 'reconnect' });
      remove(id);
    });
    outs.set(id, o);
    sync(o);
    refresh();
  }

  function remove(id) {
    const o = outs.get(id);
    if (!o) return;
    o.peer.close();
    outs.delete(id);
    refresh();
  }

  function reset(list = []) {
    for (const id of [...outs.keys()]) remove(id);
    for (const o of list) add(o.id, o.src);
  }

  function sync(o) {
    const t = tracksFor(o.src);
    if (t.v !== o.v) {
      o.v = t.v;
      o.vs.replaceTrack(t.v).catch(() => {});
    }
    if (t.a !== o.a) {
      o.a = t.a;
      o.as.replaceTrack(t.a).catch(() => {});
    }
    if (t.ok !== o.signal) {
      o.signal = t.ok;
      getSig()?.send({ type: 'control', to: o.id, action: 'out-status', data: { signal: t.ok } });
    }
  }

  setInterval(() => {
    for (const o of outs.values()) sync(o);
    S.vOut = [...outs.values()].some((o) => o.src === 'vpgm') || vNeeded(); // mantém o vertical renderizando (OBS/vMix ou projetor)
    refresh();
  }, 1000);

  // ---------- painel "Sinais" ----------
  let net = 'local';
  let lastSig = '';
  const httpPort = () => S.system.httpPort || Number(location.port) || 3000;

  // Qualidade do sinal (bitrate do WebRTC para OBS/vMix). Local usa alto; internet usa moderado.
  const Q_KEY = `castdeck.outquality.${studioId}`;
  const QUALITY = {
    ultra: { label: 'Máxima (rede local)', pgm: 25_000_000, iso: 16_000_000, audio: 320_000, degradation: 'quality' },
    alta: { label: 'Alta', pgm: 16_000_000, iso: 12_000_000, audio: 256_000, degradation: 'quality' },
    media: { label: 'Moderada (internet)', pgm: 6_000_000, iso: 4_000_000, audio: 192_000, degradation: 'balanced' },
  };
  let quality = 'auto';
  try {
    quality = localStorage.getItem(Q_KEY) || 'auto';
  } catch {}

  function resolveQuality() {
    if (quality !== 'auto') return quality;
    if (net.startsWith('lan:')) return 'alta';
    if (net === 'net') return 'media';
    return 'ultra'; // OBS/vMix no mesmo computador: sem limite de rede, prioriza qualidade
  }

  function applyBitrate(o) {
    const q = QUALITY[resolveQuality()] || QUALITY.alta;
    const isPgm = o.src === 'pgm' || o.src === 'vpgm';
    const fps = S.system.presets?.[S.preset]?.fps || 30;
    try {
      o.peer.setMaxBitrate(o.as, q.audio);
    } catch {}
    try {
      const p = o.vs.getParameters();
      if (!p.encodings?.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = isPgm ? q.pgm : q.iso;
      // FPS do sinal acompanha o preset do programa (30/50/60), não um teto fixo de 30.
      p.encodings[0].maxFramerate = isPgm ? fps : Math.max(30, fps);
      p.encodings[0].scaleResolutionDownBy = 1;
      p.encodings[0].priority = 'high';
      p.encodings[0].networkPriority = 'high';
      p.degradationPreference = q.degradation;
      o.vs.setParameters(p).catch(() => {});
    } catch {}
  }

  // O WebRTC inicia o vídeo com bitrate baixo e vai subindo (controle de congestionamento). Para sinal de
  // OBS/vMix isso aparece como "começa ruim e melhora". Reaplica a qualidade em janelas curtas para segurar
  // o alvo desde o início.
  function pinQuality(o, times = 3) {
    applyBitrate(o);
    for (let i = 1; i <= times; i++) setTimeout(() => applyBitrate(o), 500 * i);
  }

  function bases() {
    const list = [{ id: 'local', label: 'Este computador (OBS/vMix aqui)', url: `http://localhost:${httpPort()}`, key: false }];
    for (const l of S.system.lan || []) list.push({ id: 'lan:' + l.address, label: `Outro computador na rede · ${l.address}`, url: `http://${l.address}:${httpPort()}`, key: true });
    if (S.system.tunnel?.url) list.push({ id: 'net', label: 'Internet (túnel público)', url: S.system.tunnel.url, key: true });
    return list;
  }

  function linkFor(src) {
    const b = bases().find((x) => x.id === net) || bases()[0];
    return `${b.url}/out/${studioId}?src=${encodeURIComponent(src)}${b.key && outKey ? `&k=${outKey}` : ''}`;
  }

  // lista de sinais disponíveis agora
  function signals() {
    const p = S.system.presets?.[S.preset] || { width: 1280, height: 720 };
    const vp = Object.values(S.system.presets || {}).find((x) => x.vertical) || { width: 720, height: 1280 };
    const list = [
      { src: 'pgm', label: 'Programa horizontal (PGM)', sub: `16:9 · ${p.width}×${p.height} · com GCs, marca e áudio do programa`, kind: 'pgm' },
      { src: 'vpgm', label: 'Programa vertical', sub: `9:16 · ${vp.width}×${vp.height} · layout do painel Vertical`, kind: 'vpgm' },
    ];
    const slotOf = new Map([...guestSlots()].map(([n, g]) => [g.id, n]));
    for (const s of S.sources.values()) {
      if (s.kind === 'image') continue;
      const gslot = s.ownerId && s.ownerId !== 'host' ? slotOf.get(s.ownerId) : null;
      const src = gslot ? `${s.kind === 'screen' ? 'gscreen' : 'guest'}:${gslot}` : s.id;
      const what = s.kind === 'screen' ? 'Tela' : s.kind === 'media' ? 'Mídia' : s.extraCam ? 'Câmera extra' : s.ownerId === 'host' ? 'Câmera do host' : `Convidado ${gslot || ''}`.trim();
      list.push({ src, label: s.label || s.id, sub: what, kind: s.kind, sid: s.id, gslot });
    }
    return list;
  }

  const counts = () => {
    const c = new Map();
    for (const o of outs.values()) c.set(o.src, (c.get(o.src) || 0) + 1);
    return c;
  };

  function render() {
    const el = $('#panel-outputs');
    if (!el) return;
    const list = signals();
    lastSig = list.map((x) => x.src + x.label).join('|') + net;
    const c = counts();
    const bs = bases();
    el.innerHTML = `
      <div class="out-head">
        <h4>Saídas</h4>
        <p class="hint">Cada saída tem um link próprio, limpo (sem a interface), para usar como fonte de navegador no OBS ou vMix.</p>
      </div>
      ${document.querySelector('#btn-projector') ? `<button class="btn sm out-proj" id="out-projector" title="Programa em tela cheia em outro monitor, TV ou saída HDMI (Shift+P)">${icons.display} <span>Projetor em outra tela / HDMI</span></button>` : ''}
      <label class="field"><span>Onde está o OBS / vMix?</span><select class="input" id="out-net">${bs.map((b) => `<option value="${esc(b.id)}" ${b.id === net ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}</select></label>
      <label class="field"><span>Qualidade do sinal</span><select class="input" id="out-quality">
        <option value="auto" ${quality === 'auto' ? 'selected' : ''}>Automática (local alto · internet moderado)</option>
        ${Object.entries(QUALITY).map(([k, q]) => `<option value="${k}" ${quality === k ? 'selected' : ''}>${esc(q.label)}</option>`).join('')}
      </select></label>
      <p class="hint" id="out-quality-note"></p>
      <details class="out-how">
        <summary>Como adicionar</summary>
        <p><b>OBS:</b> <span>Fontes → + → Navegador. Cole o link, defina largura e altura iguais às do sinal e marque “Controlar áudio pelo OBS”.</span></p>
        <p><b>vMix:</b> <span>Add Input → Web Browser. Cole o link e escolha a resolução. O áudio entra no mixer do vMix.</span></p>
        <p class="hint">Convidados ficam em vagas fixas (Convidado 1, 2…): se a pessoa reconectar com o mesmo nome, o link continua o mesmo.</p>
      </details>
      <div class="out-list">${list
        .map((x) => {
          const n = c.get(x.src) || 0;
          return `<div class="out-row" data-src="${esc(x.src)}">
            <div class="out-thumb ${esc(x.kind)}" ${x.sid ? `data-thumb="${esc(x.sid)}"` : ''}>${x.kind === 'pgm' ? '<i class="out-ar h"></i>' : x.kind === 'vpgm' ? '<i class="out-ar v"></i>' : ''}</div>
            <div class="out-meta"><strong>${esc(x.label)}</strong><span>${esc(x.sub)}</span>
              <span class="out-on ${n ? 'on' : ''}" data-count="${esc(x.src)}">${n ? `● <span>Em uso</span> (${n})` : '<span>Sem conexão</span>'}</span></div>
            <div class="out-act">
              <button class="btn sm" data-out-copy title="Copiar o link desta saída">${icons.copy} <span>Copiar link</span></button>
              <a class="btn sm ghost icon" data-out-open href="${esc(linkFor(x.src))}" target="_blank" rel="noopener" title="Abrir o sinal numa aba (pré-visualização)">↗</a>
            </div>
          </div>`;
        })
        .join('')}</div>
      <p class="hint" style="margin-top:10px">${bs.find((b) => b.id === net)?.key ? 'O link de outro computador leva uma chave secreta: não compartilhe publicamente.' : 'Links “localhost” funcionam só neste computador.'}</p>`;
    $('#out-net', el).onchange = (e) => {
      net = e.target.value;
      if (quality === 'auto') for (const o of outs.values()) applyBitrate(o);
      render();
    };
    const paintQualityNote = () => {
      const q = QUALITY[resolveQuality()];
      const n = $('#out-quality-note', el);
      const fps = S.system.presets?.[S.preset]?.fps || 30;
      if (n) n.textContent = `Ativo agora: ${q.label} — ${Math.round(q.pgm / 1_000_000)} Mbps (programa) · ${Math.round(q.iso / 1_000_000)} Mbps (fontes) · ${fps} fps · áudio ${Math.round(q.audio / 1000)} kbps.`;
    };
    paintQualityNote();
    $('#out-quality', el).onchange = (e) => {
      quality = e.target.value;
      try {
        localStorage.setItem(Q_KEY, quality);
      } catch {}
      paintQualityNote();
      for (const o of outs.values()) applyBitrate(o);
    };
    // reaproveita o botão do monitor do programa (o módulo do projetor vive no studio.js)
    const pj = $('#out-projector', el);
    if (pj) pj.onclick = () => document.querySelector('#btn-projector')?.click();
    $$('[data-out-copy]', el).forEach((b) => (b.onclick = () => copyText(linkFor(b.closest('[data-src]').dataset.src))));
    // miniaturas ao vivo das fontes (reaproveita o vídeo já decodificado)
    $$('[data-thumb]', el).forEach((box) => {
      const s = S.sources.get(box.dataset.thumb);
      const v = s?.kind === 'media' ? null : s?.stream?.getVideoTracks()[0];
      if (!v) return;
      const vid = document.createElement('video');
      vid.muted = true;
      vid.playsInline = true;
      vid.autoplay = true;
      vid.srcObject = new MediaStream([v]);
      box.append(vid);
      vid.play().catch(() => {});
    });
  }

  // atualiza o painel só quando a lista muda; contadores sempre
  function refresh() {
    const el = $('#panel-outputs');
    if (!el || !el.classList.contains('active')) return;
    const sigNow = signals().map((x) => x.src + x.label).join('|') + net;
    if (sigNow !== lastSig) return render();
    const c = counts();
    $$('[data-count]', el).forEach((s) => {
      const n = c.get(s.dataset.count) || 0;
      s.classList.toggle('on', !!n);
      s.innerHTML = n ? `● <span>Em uso</span> (${n})` : '<span>Sem conexão</span>';
    });
  }

  async function open() {
    try {
      S.system = { ...S.system, ...(await api('/system')) }; // IPs da rede e túnel atualizados
    } catch {}
    render();
  }

  return {
    add,
    remove,
    reset,
    open,
    setKey: (k) => (outKey = k || outKey),
    // devolve true se a mensagem de sinalização era de uma página de saída
    handleSignal(m) {
      const o = outs.get(m.from);
      if (o) o.peer.handle(m.data);
      return !!o || known.has(m.from);
    },
  };
}
