// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Central "No Ar" (inspirada no YoloBox): botões REC e LIVE independentes, cada um com seu cronômetro,
// selos no programa e uma pílula de saúde que abre o estado de cada destino (horizontal e vertical).
// Saiu do studio.js (que já tem 66 imports, segundo o rea) para não engordar mais o módulo central.
import { $, esc, icons, fmtTime } from '../ui.js';

const STATE = {
  connecting: ['warn', 'Conectando'],
  reconnecting: ['warn', 'Reconectando'],
  live: ['ok', 'No ar'],
  error: ['err', 'Erro'],
  failed: ['err', 'Falhou'],
  stopped: ['', 'Encerrado'],
  idle: ['', 'Aguardando'],
};
const RANK = { ok: 0, warn: 1, err: 2 };

// "0.97x" -> 0.97 (velocidade do encoder: abaixo de 1x o PC não está dando conta do tempo real)
const speedOf = (st) => {
  const n = parseFloat(st?.speed);
  return Number.isFinite(n) ? n : null;
};

export function createOnAir({ S }) {
  let popOpen = false;
  let popHtml = '';

  // saúde de uma saída (H ou V): pior estado entre os destinos + encoder lento
  function health(st) {
    if (!st) return null;
    let lvl = 'ok';
    const why = [];
    for (const o of (st.outputs || []).filter((x) => x.state !== 'stopped')) {
      const cls = STATE[o.state]?.[0] || '';
      if (cls === 'err' || cls === 'warn') {
        if (RANK[cls] > RANK[lvl]) lvl = cls;
        why.push(`${o.name}: ${STATE[o.state][1].toLowerCase()}`);
      }
    }
    const sp = speedOf(st);
    // tolera oscilação curta: só avisa se ficar claramente abaixo do tempo real
    if (sp !== null && sp < 0.93) {
      if (RANK.warn > RANK[lvl]) lvl = 'warn';
      why.push(`encoder lento (${sp.toFixed(2)}x)`);
    }
    return { lvl, why };
  }

  function overall() {
    const parts = [];
    if (S.streaming || S.recording) parts.push(health(S.status));
    if (S.vlive) parts.push(health(S.vstatus));
    const ok = parts.filter(Boolean);
    if (!ok.length) return null;
    const lvl = ok.reduce((a, p) => (RANK[p.lvl] > RANK[a] ? p.lvl : a), 'ok');
    return { lvl, why: ok.flatMap((p) => p.why) };
  }

  function sectionHtml(title, st, startedAt) {
    if (!st) return `<div class="oa-sec"><div class="oa-sec-hd"><strong>${title}</strong><span class="hint">iniciando…</span></div></div>`;
    const outs = (st.outputs || []).filter((o) => o.state !== 'stopped');
    const rows = outs.length
      ? outs
          .map((o) => {
            const [cls, lab] = STATE[o.state] || ['', o.state];
            const ico = o.kind === 'record' ? '⏺' : '📡';
            const sub = o.kind === 'record' ? o.file || '' : o.error || (o.restarts ? `${o.restarts} reconexão(ões)` : '');
            return `<div class="oa-row"><span class="oa-ico">${ico}</span><span class="oa-name"><b translate="no">${esc(o.name)}</b>${sub ? `<small title="${esc(sub)}">${esc(sub)}</small>` : ''}</span><span class="pill ${cls}">${lab}</span></div>`;
          })
          .join('')
      : '<div class="hint">Nenhuma saída ativa.</div>';
    const sp = speedOf(st);
    return `<div class="oa-sec">
      <div class="oa-sec-hd"><strong>${title}</strong>${startedAt ? `<span class="hint">${fmtTime(Date.now() - startedAt)}</span>` : ''}</div>
      <div class="oa-kpis">
        <span><b>${st.fps || 0}</b> fps</span>
        <span><b>${esc(st.bitrate || '—')}</b></span>
        <span class="${sp !== null && sp < 0.93 ? 'bad' : ''}">vel. <b>${sp !== null ? sp.toFixed(2) + 'x' : '—'}</b></span>
        ${st.dropFrames ? `<span class="bad"><b>${st.dropFrames}</b> quadros perdidos</span>` : ''}
      </div>
      ${rows}
    </div>`;
  }

  function popoverHtml() {
    const secs = [];
    if (S.streaming || S.recording) secs.push(sectionHtml('Horizontal 16:9', S.status, (S.streaming || S.recording).startedAt));
    if (S.vlive) secs.push(sectionHtml('Vertical 9:16', S.vstatus, S.vlive.startedAt));
    return `<div class="oa-pop-hd"><strong>Saúde da transmissão</strong><button class="btn sm ghost icon" data-oa-close aria-label="Fechar">✕</button></div>${secs.join('') || '<div class="hint">Nada no ar.</div>'}`;
  }

  function ensurePop() {
    let pop = $('#oa-pop');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'oa-pop';
      pop.className = 'oa-pop';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Saúde da transmissão');
      pop.hidden = true;
      document.body.appendChild(pop);
      pop.addEventListener('click', (e) => {
        if (e.target.closest('[data-oa-close]')) togglePop(false);
      });
      document.addEventListener('pointerdown', (e) => {
        if (popOpen && !pop.contains(e.target) && !e.target.closest('#oa-health')) togglePop(false);
      });
      document.addEventListener('keydown', (e) => {
        if (popOpen && e.key === 'Escape') togglePop(false);
      });
    }
    return pop;
  }

  function placePop() {
    const pop = $('#oa-pop');
    const anchor = $('#oa-health');
    if (!pop || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = Math.min(380, window.innerWidth - 16);
    pop.style.width = w + 'px';
    pop.style.top = Math.round(r.bottom + 8) + 'px';
    pop.style.left = Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))) + 'px';
  }

  function togglePop(force) {
    popOpen = typeof force === 'boolean' ? force : !popOpen;
    const pop = ensurePop();
    pop.hidden = !popOpen;
    $('#oa-health')?.setAttribute('aria-expanded', String(popOpen));
    if (popOpen) {
      popHtml = '';
      updatePop();
      placePop();
    }
  }

  function updatePop() {
    if (!popOpen) return;
    const pop = $('#oa-pop');
    if (!S.streaming && !S.recording && !S.vlive) return togglePop(false);
    const html = popoverHtml();
    // só redesenha se mudou: evita piscar e perder a seleção de texto a cada segundo
    if (html !== popHtml) {
      pop.innerHTML = html;
      popHtml = html;
    }
  }

  function renderButtons() {
    const rec = $('#btn-record');
    const btn = $('#btn-live');
    // os dois botões ficam SEMPRE visíveis: gravar e transmitir são independentes
    if (rec) {
      rec.hidden = false;
      if (S.recording) {
        rec.className = 'btn oa-rec on';
        rec.title = 'Gravando localmente em MP4. Clique para parar só a gravação.';
        // o cronômetro fica fora do .lbl: no celular o rótulo some, mas o tempo continua à vista (como no YoloBox)
        rec.innerHTML = `<span class="oa-dot"></span><span class="lbl">REC</span><span class="oa-t">${fmtTime(Date.now() - S.recording.startedAt)}</span>`;
      } else {
        rec.className = 'btn oa-rec';
        rec.title = 'Gravar o programa localmente em MP4 (independente da transmissão)';
        rec.innerHTML = `<span class="oa-dot"></span><span class="lbl">Gravar</span>`;
      }
      rec.setAttribute('aria-pressed', String(!!S.recording));
    }
    if (btn) {
      btn.hidden = false;
      if (S.streaming) {
        btn.className = 'btn live oa-live on';
        btn.title = 'Ao vivo. Clique para encerrar só a transmissão.';
        btn.innerHTML = `${icons.stop}<span class="lbl">AO VIVO</span><span class="oa-t">${fmtTime(Date.now() - S.streaming.startedAt)}</span>`;
      } else {
        btn.className = 'btn primary oa-live';
        btn.title = 'Transmitir ao vivo para YouTube, Twitch e outros destinos (independente da gravação)';
        btn.innerHTML = `${icons.broadcast}<span class="lbl">Transmitir</span>`;
      }
      btn.setAttribute('aria-pressed', String(!!S.streaming));
    }
  }

  function render() {
    renderButtons();
    const box = $('#live-stats');
    const onair = $('#onair');
    if (!box || !onair) return;

    const h = overall();
    const st = S.status || {};
    const pr = S.system?.presets?.[S.preset] || { fps: 30, videoKbps: 4500 };
    const idleFps = pr.fps || 30;
    const idleMbps = `${((S.bitrate || pr.videoKbps || 4500) / 1000).toFixed(1)} Mbps`;
    const pills = [];
    if (h) {
      const label = h.lvl === 'ok' ? 'SAÚDE: OK' : h.lvl === 'warn' ? 'ATENÇÃO' : 'PROBLEMA';
      const tele = `${st.fps || idleFps} FPS · ${st.bitrate || idleMbps}`;
      const tip = h.why.length ? h.why.join(' · ') : 'Todos os destinos e a gravação estão funcionando';
      pills.push(`<button class="oa-health ${h.lvl}" id="oa-health" type="button" aria-haspopup="dialog" aria-expanded="${popOpen}" title="${esc(tip)} (clique para detalhes)"><i></i><span>${label} · ${esc(tele)}</span></button>`);
    } else {
      pills.push(`<button class="oa-health ok idle" id="oa-health" type="button" title="Motor de vídeo pronto · ${idleFps} FPS · ${idleMbps}"><i></i><span>SAÚDE: OK · ${idleFps} FPS · ${idleMbps}</span></button>`);
    }
    if (S.vlive) pills.push(`<span class="pill live"><span class="dot"></span>VERTICAL ${S.vlive.recordOnly ? 'REC ' : ''}${fmtTime(Date.now() - S.vlive.startedAt)}</span>`);
    const html = pills.join(' ');
    if (box._h !== html) {
      box.innerHTML = html;
      box._h = html;
      const hb = $('#oa-health');
      if (hb && h) hb.onclick = () => togglePop();
    }
    box.classList.toggle('oa-has-health', true);

    const badges = [];
    if (S.streaming) badges.push('<span class="pill live"><span class="dot"></span>AO VIVO</span>');
    if (S.recording) badges.push('<span class="pill err"><span class="dot"></span>REC</span>');
    const bh = badges.join(' ');
    if (onair._h !== bh) {
      onair.innerHTML = bh;
      onair._h = bh;
    }
    updatePop();
    if (popOpen) placePop();
  }

  // Contagem 3-2-1 por cima do programa (só no estúdio, não vai para a saída). Clique ou Esc cancela.
  function countdown(seconds = 3) {
    return new Promise((resolve) => {
      const host = $('#program');
      if (!host || seconds <= 0) return resolve(true);
      const el = document.createElement('div');
      el.className = 'oa-count';
      el.setAttribute('role', 'status');
      el.innerHTML = '<b></b><span>Entrando ao vivo… clique para cancelar</span>';
      host.appendChild(el);
      let n = seconds;
      let timer = 0;
      const done = (ok) => {
        clearTimeout(timer);
        document.removeEventListener('keydown', onKey, true);
        el.remove();
        resolve(ok);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          done(false);
        }
      };
      const tick = () => {
        if (n <= 0) return done(true);
        const b = el.querySelector('b');
        b.textContent = String(n);
        // reinicia a animação de "batida" a cada número
        b.classList.remove('beat');
        void b.offsetWidth;
        b.classList.add('beat');
        n -= 1;
        timer = setTimeout(tick, 1000);
      };
      el.onclick = () => done(false);
      document.addEventListener('keydown', onKey, true);
      tick();
    });
  }

  // Checagem antes de entrar ao vivo (o "pre-flight" do YoloBox). Só informa (✓/⚠): quem decide é o operador.
  //  box: elemento onde desenhar; o: { destIds, record, lastSignal(), hasMic(), api }
  let diskCache = null; // { t, free } — evita perguntar ao servidor a cada clique num checkbox
  async function preflight(box, o) {
    if (!box) return;
    const items = [];
    const ok = (txt) => items.push(['ok', txt]);
    const warn = (txt) => items.push(['warn', txt]);
    // 1) som: alguma fonte de áudio no palco teve sinal nos últimos 10 s
    if (!o.hasMic()) warn('Nenhum microfone no palco');
    else if (performance.now() - o.lastSignal() > 10000) warn('Sem som nos últimos 10 s: confira o microfone');
    else ok('Microfone com sinal');
    // 2) imagem: o palco (ou a fonte que a mesa pôs no ar) tem algo com vídeo
    const ids = S.take ? [S.take] : S.stage;
    if (ids.some((id) => { const s = S.sources.get(id); return s && !s.camOff; })) ok('Imagem no palco');
    else warn('Palco sem imagem (câmera desligada ou palco vazio)');
    // 3) destinos com chave
    const sel = (S.destinations || []).filter((d) => o.destIds.includes(d.id));
    const noKey = sel.filter((d) => !d.hasKey);
    if (!sel.length) warn('Nenhum destino selecionado');
    else if (noKey.length) warn(`Sem chave de transmissão: ${noKey.map((d) => d.name).join(', ')}`);
    else ok(sel.length > 1 ? `${sel.length} destinos com chave` : 'Destino com chave');
    // 4) disco (só se for gravar; o Android não tem a rota e o item some)
    if (o.record) {
      try {
        if (!diskCache || performance.now() - diskCache.t > 15000) diskCache = { t: performance.now(), free: (await o.api('/disk')).free };
        const gb = diskCache.free / 1073741824;
        if (gb < 2) warn(`Pouco espaço para gravar: ${gb.toFixed(1)} GB livres`);
        else ok(`${gb >= 100 ? Math.round(gb) : gb.toFixed(1)} GB livres para a gravação`);
      } catch {}
    }
    const t = (s) => window.CDi18n?.t(s) ?? s;
    const bad = items.filter((x) => x[0] === 'warn').length;
    box.className = `gl-check ${bad ? 'has-warn' : 'all-ok'}`;
    box.innerHTML =
      `<div class="glc-hd">${bad ? `⚠ ${t('Confira antes de entrar')}` : `✓ ${t('Tudo pronto para entrar ao vivo')}`}</div>` +
      `<ul>${items.map(([k, txt]) => `<li class="${k}"><i>${k === 'ok' ? '✓' : '⚠'}</i>${esc(t(txt))}</li>`).join('')}</ul>`;
  }

  window.addEventListener('resize', () => popOpen && placePop());
  return { render, countdown, health, preflight };
}
