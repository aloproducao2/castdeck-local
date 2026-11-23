// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Efeitos de vídeo avançados via Longpipe (SDK MIT, vendorizado em /vendor/longpipe):
//  - fundo virtual: desfocar, imagem, cor ou nenhum (modelo próprio + estabilidade temporal)
//  - suavização de pele (touch-up) com intensidade
// Roda em WebGPU (ou WebGL2) dentro de um worker, com pesos locais (sem internet). Se o aparelho não
// tiver GPU compatível, a saída continua com o vídeo cru e o estúdio mostra o aviso — nunca tela preta.
//
// O efeito sai como um MediaStream. Em vez de reatribuir o `srcObject` do <video> original (o que
// travava o renderer no estúdio), a fonte passa a usar um <video> NOVO com o stream processado, e o
// original fica guardado para quando o efeito for desligado.

const SDK_URL = '/vendor/longpipe/dist/index.js';
export const LP_WEIGHTS = '/vendor/longpipe/models/v0.0.5/';
// Preset fixo (tier "small") para o app funcionar 100% offline: hospedamos só esse tier (f16 + f32).
export const LP_PRESET = 'small';

export const LP_DEFAULT = {
  engine: 'longpipe',
  bg: 'off', // off | blur | image | color
  blur: 55, // 0..100 (vira strength 0..1)
  image: '',
  color: '#141a33',
  touchup: false,
  touchupStrength: 60, // 0..100
  reframe: false, // enquadramento automático (segue o rosto)
};

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const bgInput = (c) => {
  if (!c || c.bg === 'off') return 'none';
  if (c.bg === 'blur') return { blur: { strength: clamp01((c.blur ?? 55) / 100) } };
  if (c.bg === 'color') return { color: c.color || '#141a33' };
  if (c.bg === 'image') return c.image ? { image: c.image } : 'none';
  return 'none';
};
const touchInput = (c) => (c && c.touchup ? { strength: clamp01((c.touchupStrength ?? 60) / 100) } : false);

// Resolução de saída: no máximo 1280 px no lado maior (o programa compõe em 1280x720).
const outputRes = (raw) => {
  const set = raw?.getVideoTracks?.()[0]?.getSettings?.() || {};
  const vw = set.width || 1280;
  const vh = set.height || 720;
  const sc = Math.min(1, 1280 / Math.max(1, vw, vh));
  return { w: Math.max(2, Math.round(vw * sc)), h: Math.max(2, Math.round(vh * sc)) };
};

let sdkP = null;
const sdk = () => (sdkP ||= import(SDK_URL));

export class LongpipeFx {
  constructor() {
    this.map = new Map(); // id -> { pip, raw, origEl, out, s, comp, cfg, backend }
    this.err = new Map(); // id -> mensagem
  }

  active(id) {
    return this.map.has(id);
  }
  get(id) {
    const e = this.map.get(id);
    return e ? { ...LP_DEFAULT, ...e.cfg } : null;
  }
  out(id) {
    return this.map.get(id)?.out || null;
  }
  backend(id) {
    return this.map.get(id)?.backend || null;
  }
  error(id) {
    return this.err.get(id) || '';
  }
  ids() {
    return [...this.map.keys()];
  }

  // Liga o efeito numa fonte (s = objeto da fonte do estúdio; comp = compositor).
  // Troca `s.el` por um <video> novo com o stream processado. Devolve o elemento de saída.
  async enable(id, s, comp, cfg = {}, origEl = null) {
    await this.disable(id);
    const raw = s?.stream || s?.el?.srcObject;
    if (!raw || !(raw instanceof MediaStream) || !raw.getVideoTracks().length) {
      throw new Error('fonte sem câmera/vídeo ao vivo (o modo Longpipe precisa de um MediaStream)');
    }
    const mod = await sdk();
    const conf = { ...LP_DEFAULT, ...cfg, engine: 'longpipe' };
    const pip = new mod.EffectsPipeline(raw, {
      preset: LP_PRESET,
      adaptive: false,
      audio: 'drop',
      outputResolution: outputRes(raw),
      background: bgInput(conf),
      touchup: touchInput(conf),
      reframe: conf.reframe ? { auto: true } : false,
      weightsBaseUrl: LP_WEIGHTS,
      onError: (e) => {
        this.err.set(id, `${e?.type || 'erro'}: ${e?.message || ''}`.slice(0, 160));
        console.warn('[longpipe]', id, e?.type, e?.message);
      },
      onTrackChanged: () => {
        try {
          const e2 = this.map.get(id);
          if (e2?.out) e2.out.srcObject = pip.stream;
        } catch {}
      },
    });
    const anterior = this.map.get(id);
    const originalEl = origEl || anterior?.origEl || s?.el || null;
    const out = document.createElement('video');
    out.muted = true;
    out.playsInline = true;
    out.autoplay = true;
    out.srcObject = pip.stream;
    this.map.set(id, { pip, raw, origEl: originalEl, out, s, comp, cfg: conf, backend: null });
    // troca o elemento da fonte (o compositor, as miniaturas e a prévia passam a usar o processado)
    if (s) s.el = out;
    if (comp?.sources?.has?.(id)) comp.upsertSource(id, { ...comp.sources.get(id), el: out });
    out.play().catch(() => {});
    pip.ready
      .then((info) => {
        const e = this.map.get(id);
        if (!e || e.pip !== pip) return;
        e.backend = info?.backend || 'none';
        if (info?.backend === 'none') this.err.set(id, 'este aparelho não tem WebGPU/WebGL2 para os efeitos avançados');
      })
      .catch((e) => {
        const e2 = this.map.get(id);
        if (!e2 || e2.pip !== pip) return;
        this.err.set(id, e?.message || String(e));
        this.disable(id); // devolve o vídeo cru
      });
    return out;
  }

  // Atualiza em runtime (sem re-init): fundo e touch-up.
  async update(id, patch = {}) {
    const e = this.map.get(id);
    if (!e) return;
    Object.assign(e.cfg, patch);
    if ('bg' in patch || 'blur' in patch || 'image' in patch || 'color' in patch) {
      try {
        await e.pip.setBackground(bgInput(e.cfg));
        this.err.delete(id);
      } catch (err) {
        this.err.set(id, err?.message || String(err));
      }
    }
    if ('touchup' in patch || 'touchupStrength' in patch) {
      try {
        await e.pip.setTouchup(touchInput(e.cfg));
        this.err.delete(id);
      } catch (err) {
        this.err.set(id, err?.message || String(err));
      }
    }
    if ('reframe' in patch) {
      try {
        await e.pip.setReframe(e.cfg.reframe ? { auto: true } : null);
        this.err.delete(id);
      } catch (err) {
        this.err.set(id, err?.message || String(err));
      }
    }
  }

  // Desliga, destrói o pipeline e devolve o <video> original à fonte.
  disable(id) {
    const e = this.map.get(id);
    if (!e) return;
    this.map.delete(id);
    try { e.pip.destroy(); } catch {}
    try { e.out.srcObject = null; } catch {}
    try { if (e.s) e.s.el = e.origEl; } catch {}
    try {
      if (e.comp?.sources?.has?.(id)) e.comp.upsertSource(id, { ...e.comp.sources.get(id), el: e.origEl });
    } catch {}
    this.err.delete(id);
  }

  forget(id) {
    this.disable(id);
  }

  // Troca de câmera: o stream mudou; recria o pipeline em cima do novo stream.
  async rebind(id, s, comp) {
    const e = this.map.get(id);
    if (!e) return;
    const conf = this.get(id);
    const origEl = e.origEl;
    this.disable(id);
    return this.enable(id, s, comp, conf, origEl);
  }

  // Diagnóstico (usado pelos testes e pelo painel de dispositivos).
  stats(id) {
    const e = this.map.get(id);
    if (!e?.pip?.getStats) return Promise.resolve(null);
    return e.pip.getStats().catch(() => null);
  }
}
