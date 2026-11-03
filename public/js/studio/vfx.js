// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Efeitos de câmera processados no PC do estúdio (valem para o host e para qualquer convidado):
//  - Fundo: desfocar, trocar por imagem ou por cor (segmentação de pessoa, MediaPipe Selfie Segmenter)
//  - Enquadramento automático: acompanha o rosto com zoom suave (MediaPipe Face Detector)
// Os motores só são carregados quando alguém liga um efeito. Para não pesar:
//  - a segmentação roda a no máx. ~20 quadros/s, divididos entre as câmeras com efeito,
//    e a composição reaproveita a última máscara nos quadros intermediários;
//  - a detecção de rosto roda 5x por segundo e o movimento da "câmera virtual" é suavizado;
//  - o resultado de cada quadro é compartilhado entre o programa, o vertical e o retorno dos convidados.

const BASE = '/vendor/mediapipe';
const FILESET = { wasmLoaderPath: `${BASE}/vision_wasm_internal.js`, wasmBinaryPath: `${BASE}/vision_wasm_internal.wasm` };

export const FX_BACKGROUNDS = [
  { url: '/assets/backgrounds/estudio.jpg', label: 'Estúdio' },
  { url: '/assets/backgrounds/escritorio.jpg', label: 'Escritório' },
  { url: '/assets/backgrounds/sala.jpg', label: 'Sala' },
  { url: '/assets/backgrounds/aurora.jpg', label: 'Aurora' },
  { url: '/assets/backgrounds/waves.jpg', label: 'Ondas' },
];
export const DEFAULT_FX = { bg: 'off', blur: 55, image: FX_BACKGROUNDS[0].url, color: '#141a33', track: false, framing: 'medium' };
const FRAMING = { wide: 0.17, medium: 0.27, close: 0.4 }; // altura do rosto em relação ao quadro

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

export class VideoFx {
  constructor() {
    this.cfg = new Map(); // id -> configuração
    this.st = new Map(); // id -> estado de processamento
    this.seg = null;
    this.face = null;
    this.images = new Map();
    this.status = ''; // '' | 'loading' | 'error'
    this.error = '';
  }

  get(id) {
    return { ...DEFAULT_FX, ...(this.cfg.get(id) || {}) };
  }

  active(id) {
    const c = this.cfg.get(id);
    return !!c && (c.bg !== 'off' || c.track);
  }

  async set(id, patch) {
    const c = { ...this.get(id), ...patch };
    this.cfg.set(id, c);
    if (!this.active(id)) this.st.delete(id);
    if (c.bg !== 'off') await this._loadSeg();
    if (c.track) await this._loadFace();
    return c;
  }

  forget(id) {
    this.cfg.delete(id);
    this.st.delete(id);
  }

  // ---------- carregamento preguiçoso dos motores ----------
  _vision() {
    this._mod ||= import(`${BASE}/vision_bundle.mjs`);
    return this._mod;
  }
  async _create(Cls, model, extra) {
    let last;
    // GPU (WebGL) primeiro; se o aparelho não suportar, cai para CPU (WASM SIMD)
    for (const delegate of ['GPU', 'CPU']) {
      try {
        return await Cls.createFromOptions(FILESET, { baseOptions: { modelAssetPath: `${BASE}/${model}`, delegate }, runningMode: 'IMAGE', ...extra });
      } catch (e) {
        last = e;
      }
    }
    throw last;
  }
  _watch(p) {
    this.pending = (this.pending || 0) + 1;
    this.status = 'loading';
    p.then(
      () => {
        if (--this.pending === 0 && this.status !== 'error') this.status = '';
      },
      (e) => {
        this.pending--;
        this.status = 'error';
        this.error = e?.message || String(e);
      },
    );
    return p;
  }
  _loadSeg() {
    if (!this._segP) {
      this._segP = this._watch(this._vision().then(({ ImageSegmenter }) => this._create(ImageSegmenter, 'selfie_segmenter.tflite', { outputCategoryMask: false, outputConfidenceMasks: true })).then((s) => (this.seg = s)));
      this._segP.catch(() => (this._segP = null));
    }
    return this._segP;
  }
  _loadFace() {
    if (!this._faceP) {
      this._faceP = this._watch(this._vision().then(({ FaceDetector }) => this._create(FaceDetector, 'blaze_face_short_range.tflite', { minDetectionConfidence: 0.5 })).then((f) => (this.face = f)));
      this._faceP.catch(() => (this._faceP = null));
    }
    return this._faceP;
  }

  image(url) {
    if (!url) return null;
    let img = this.images.get(url);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.src = url;
      this.images.set(url, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  // ---------- por quadro ----------
  // Devolve { img, w, h, focus } para desenhar no lugar do vídeo, ou null (sem efeito / ainda carregando).
  frame(id, el) {
    const c = this.cfg.get(id);
    if (!c || !el || !(c.bg !== 'off' || c.track)) return null;
    const vw = el.videoWidth;
    const vh = el.videoHeight;
    if (!vw || el.readyState < 2) return null;
    const now = performance.now();
    let st = this.st.get(id);
    if (!st) this.st.set(id, (st = { t: -1, segT: 0, faceT: 0, res: null }));
    if (now - st.t < 8 && st.res) return st.res; // mesmo quadro: compartilhado entre as saídas
    const dt = st.t < 0 ? 0 : Math.min(0.2, (now - st.t) / 1000);
    st.t = now;
    let img = el;
    let w = vw;
    let h = vh;
    if (c.bg !== 'off' && this.seg) {
      const out = this._background(st, c, el, vw, vh, now);
      if (out) {
        img = out;
        w = out.width;
        h = out.height;
      }
    }
    const focus = c.track && this.face ? this._follow(st, c, el, vw, vh, now, dt) : null;
    st.res = img === el && !focus ? null : { img, w, h, focus };
    return st.res;
  }

  _segCount() {
    let n = 0;
    for (const c of this.cfg.values()) if (c.bg !== 'off') n++;
    return Math.max(1, n);
  }

  _runSeg(st, el) {
    try {
      this.seg.segment(el, (r) => {
        const m = r.confidenceMasks && r.confidenceMasks[0];
        if (!m) return;
        const mw = m.width;
        const mh = m.height;
        const conf = m.getAsFloat32Array();
        if (!st.mask || st.mask.width !== mw || st.mask.height !== mh) {
          st.mask = mk(mw, mh);
          st.mctx = st.mask.getContext('2d');
          st.mdata = st.mctx.createImageData(mw, mh);
          st.mdata.data.fill(255);
          st.prev = new Float32Array(mw * mh);
        }
        const px = st.mdata.data;
        const prev = st.prev;
        for (let i = 0; i < conf.length; i++) {
          const v = prev[i] * 0.35 + conf[i] * 0.65; // suaviza tremidas entre quadros
          prev[i] = v;
          const a = (v - 0.3) * 2.2; // contraste na borda: recorte firme, sem "halo"
          px[i * 4 + 3] = a <= 0 ? 0 : a >= 1 ? 255 : (a * 255) | 0;
        }
        st.mctx.putImageData(st.mdata, 0, 0);
      });
    } catch (e) {
      console.warn('[fx] segmentação falhou', e);
    }
  }

  _background(st, c, el, vw, vh, now) {
    const fps = clamp(24 / this._segCount(), 8, 20);
    if (now - st.segT >= 1000 / fps) {
      st.segT = now;
      this._runSeg(st, el);
    }
    if (!st.mask) return null;
    const sc = Math.min(1, 960 / vw);
    const w = Math.round(vw * sc);
    const h = Math.round(vh * sc);
    if (!st.out || st.out.width !== w || st.out.height !== h) {
      st.out = mk(w, h);
      st.octx = st.out.getContext('2d');
      st.person = mk(w, h);
      st.pctx = st.person.getContext('2d');
      st.small = null;
      st.bgKey = '';
    }
    const { octx, pctx } = st;
    // pessoa = vídeo recortado pela máscara (ampliada com suavização, o que já arredonda a borda)
    pctx.globalCompositeOperation = 'copy';
    pctx.imageSmoothingQuality = 'high';
    pctx.drawImage(st.mask, 0, 0, w, h);
    pctx.globalCompositeOperation = 'source-in';
    pctx.drawImage(el, 0, 0, w, h);
    // fundo
    octx.globalCompositeOperation = 'copy';
    if (c.bg === 'blur') {
      // Desfoque leve: reduz bastante o quadro e amplia — o próprio downscale já borra,
      // sem usar ctx.filter (que é pesado). Quanto maior o blur, menor a miniatura.
      const div = c.blur > 40 ? 3 : 2;
      const sw = Math.max(2, w >> div);
      const sh = Math.max(2, h >> div);
      if (!st.small || st.small.width !== sw || st.small.height !== sh) {
        st.small = mk(sw, sh);
        st.sctx = st.small.getContext('2d');
      }
      st.sctx.drawImage(el, 0, 0, sw, sh);
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(st.small, 0, 0, w, h);
    } else if (c.bg === 'image') {
      const img = this.image(c.image);
      if (img) {
        const key = `${c.image}|${w}x${h}`;
        if (st.bgKey !== key) {
          // a imagem de fundo é ajustada (cover) uma vez só e reaproveitada
          st.bgImg ||= mk(w, h);
          st.bgImg.width = w;
          st.bgImg.height = h;
          const b = st.bgImg.getContext('2d');
          const s2 = Math.max(w / img.naturalWidth, h / img.naturalHeight);
          const dw = img.naturalWidth * s2;
          const dh = img.naturalHeight * s2;
          b.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
          st.bgKey = key;
        }
        octx.drawImage(st.bgImg, 0, 0);
      } else {
        octx.fillStyle = c.color;
        octx.fillRect(0, 0, w, h);
      }
    } else {
      octx.fillStyle = c.color;
      octx.fillRect(0, 0, w, h);
    }
    octx.globalCompositeOperation = 'source-over';
    octx.drawImage(st.person, 0, 0);
    return st.out;
  }

  _follow(st, c, el, vw, vh, now, dt) {
    if (now - st.faceT >= 180) {
      const dtFace = Math.max(0.001, Math.min(0.5, (now - st.faceT) / 1000));
      st.faceT = now;
      try {
        // detecta direto no vídeo (a entrada pequena mostrou-se menos confiável em alguns navegadores).
        const r = this.face.detect(el);
        let best = null;
        for (const d of r.detections || []) {
          const b = d.boundingBox;
          if (b && (!best || b.width * b.height > best.width * best.height)) best = b;
        }
        if (best) {
          st.seen = now;
          const raw = { x: (best.originX + best.width / 2) / vw, y: (best.originY + best.height / 2) / vh, fh: best.height / vh };
          // mediana de 3 alturas: evita o zoom "respirando" com o tremor da caixa do rosto
          st.fhHist ||= [];
          st.fhHist.push(raw.fh);
          if (st.fhHist.length > 3) st.fhHist.shift();
          const sorted = [...st.fhHist].sort((a, b) => a - b);
          raw.fh = sorted[Math.floor(sorted.length / 2)];
          // One Euro: leve, estável quando parado e rápido quando a pessoa se move.
          const oneEuro = (key, val, minCut, beta) => {
            st.euro ||= {};
            const s = (st.euro[key] ||= { f: val });
            const dx = (val - s.f) / dtFace;
            const cut = minCut + beta * Math.abs(dx);
            const a = 1 / (1 + 1 / (2 * Math.PI * cut) / dtFace);
            s.f += a * (val - s.f);
            return s.f;
          };
          const t = {
            x: oneEuro('x', raw.x, 1.2, 0.02),
            y: oneEuro('y', raw.y, 1.2, 0.02),
            fh: oneEuro('fh', raw.fh, 0.8, 0.01),
          };
          // zona morta curta: não segue cada micro-movimento
          const g = st.goal;
          if (!g || Math.abs(t.x - g.x) > 0.018 || Math.abs(t.y - g.y) > 0.018 || Math.abs(t.fh - g.fh) / g.fh > 0.07) st.goal = t;
        }
      } catch (e) {
        console.warn('[fx] detecção de rosto falhou', e);
      }
    }
    const F = FRAMING[c.framing] || FRAMING.medium;
    let tx = 0.5;
    let ty = 0.5;
    let tz = 1;
    if (st.goal && now - (st.seen || 0) < 3000) {
      tz = clamp(F / st.goal.fh, 1, 2.2);
      tx = st.goal.x;
      ty = st.goal.y + 0.1 / tz; // espaço acima da cabeça: rosto um pouco acima do centro
    }
    const f = (st.focus ||= { x: 0.5, y: 0.5, z: 1 });
    const k = 1 - Math.exp(-dt * 2.6); // movimento suave, como um operador de câmera
    f.x += (tx - f.x) * k;
    f.y += (ty - f.y) * k;
    f.z += (tz - f.z) * k;
    return f;
  }
}
