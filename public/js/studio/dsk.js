// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// DSK 1 e 2 (downstream keyers): duas camadas fixas por cima do programa, independentes da cena e da mesa de corte
// (como no ATEM/vMix: cortar ou dissolver a câmera não mexe no DSK). Cada camada é um endereço web (renderizado
// pelo servidor num navegador sem janela, com fundo transparente — ver server/dsk.js) ou uma fonte do CastDeck
// (câmera, tela, vídeo, imagem, entrada RTMP), com modo de mesclagem, opacidade, posição e fade próprios.
// A configuração fica salva no estúdio (S.brand.dsk); estar "no ar" não é salvo (abrir o estúdio nunca põe nada no ar).

export const DSK_BLENDS = [
  ['normal', 'Normal (usa a transparência)'],
  ['screen', 'Tela / Screen (preto some)'],
  ['add', 'Adição (clareia)'],
  ['multiply', 'Multiplicação (branco some)'],
  ['overlay', 'Sobrepor (overlay)'],
  ['soft', 'Luz suave'],
  ['luma', 'Luma key (recorta pelo brilho)'],
  ['chroma', 'Chroma key (recorta pela cor)'],
];
const OPS = { normal: 'source-over', screen: 'screen', add: 'lighter', multiply: 'multiply', overlay: 'overlay', soft: 'soft-light', luma: 'source-over', chroma: 'source-over' };
// posições prontas (frações do programa); os cantos mantêm 16:9 num programa 16:9
const POS = {
  full: ['Tela cheia', { x: 0, y: 0, w: 1, h: 1 }],
  lower: ['Terço inferior', { x: 0, y: 2 / 3, w: 1, h: 1 / 3 }],
  upper: ['Faixa superior', { x: 0, y: 0, w: 1, h: 1 / 4 }],
  tl: ['Canto sup. esquerdo', { x: 0.025, y: 0.04, w: 0.3, h: 0.3 }],
  tr: ['Canto sup. direito', { x: 0.675, y: 0.04, w: 0.3, h: 0.3 }],
  bl: ['Canto inf. esquerdo', { x: 0.025, y: 0.66, w: 0.3, h: 0.3 }],
  br: ['Canto inf. direito', { x: 0.675, y: 0.66, w: 0.3, h: 0.3 }],
  custom: ['Personalizada', null],
};
const FADES = [
  [0, 'Corte seco'],
  [300, '0,3 s'],
  [500, '0,5 s'],
  [1000, '1 s'],
  [2000, '2 s'],
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function defCfg() {
  return {
    src: 'url',
    url: '',
    sourceId: '',
    blend: 'normal',
    opacity: 100,
    fadeMs: 500,
    pos: 'full',
    rect: { x: 0, y: 0, w: 1, h: 1 },
    zoom: 1,
    x: 0,
    y: 0,
    // página web: viewport fixo (não reflui quando a área do DSK muda) ou o legado "área do DSK".
    // O desenho usa page.fit para encaixar a captura fixa na área.
    page: { mode: 'fixed', width: 1280, height: 720, fit: 'cover' },
    luma: { lo: 0.1, soft: 0.1, invert: false },
    // mesma escala do filtro de chroma do OBS (similaridade 0,40 / suavidade 0,08 com verde puro)
    chroma: { color: '#00ff00', sim: 0.4, smooth: 0.08 },
    // corte (fração da imagem em cada lado), como o filtro "Cortar" do OBS. fill: amplia o que sobrou para ocupar a
    // área inteira; sem fill, a parte visível fica no mesmo lugar e o cortado vira transparente
    crop: { l: 0, t: 0, r: 0, b: 0, fill: false },
    // página opaca (YouTube, vídeo, site comum): o servidor manda JPEG, ~20x mais leve que PNG a 30 qps em
    // Full HD (PNG de 1,4 MB por quadro travava a prévia e atrasava os cliques). Perde a transparência.
    opaque: false,
    // URL: taxa de captura e qualidade do JPEG (opaco). 30 qps/80 é o equilíbrio para overlays animados.
    fps: 30,
    quality: 80,
    // galeria de imagens do overlay: várias imagens no mesmo DSK, troca manual (deck/config) ou automática.
    // As imagens ficam no servidor (/api/dsk/assets) — o JSON do estúdio guarda só id/nome/URL.
    images: [],
    imgIndex: 0,
    imgAuto: false,
    imgAutoMs: 8000,
    // desligado: a página é fechada no servidor (o navegador sem janela sai quando nenhum DSK usa) e nada é desenhado,
    // então não gasta CPU/GPU/memória. Pôr no ar um DSK desligado liga sozinho.
    power: true,
    // saída vertical 9:16: posição e corte próprios (a mesma imagem, encaixada sem esticar). on: aparece no vertical
    vert: { on: false, pos: 'full', rect: { x: 0, y: 0, w: 1, h: 1 }, zoom: 1, x: 0, y: 0, crop: { l: 0, t: 0, r: 0, b: 0, fill: false } },
  };
}
// corte e área (do horizontal ou do vertical) dentro dos limites
function normGeo(r) {
  // cada lado até 95%, sempre sobrando pelo menos 5% da imagem em cada direção
  const cr = r.crop;
  for (const k of ['l', 't', 'r', 'b']) cr[k] = clamp(+cr[k] || 0, 0, 0.95);
  if (cr.l + cr.r > 0.95) cr.r = 0.95 - cr.l;
  if (cr.t + cr.b > 0.95) cr.b = 0.95 - cr.t;
  cr.fill = !!cr.fill;
  if (!POS[r.pos]) r.pos = 'full';
  if (r.pos !== 'custom') r.rect = { ...POS[r.pos][1] };
  r.rect.w = clamp(+r.rect.w || 1, 0.05, 1);
  r.rect.h = clamp(+r.rect.h || 1, 0.05, 1);
  r.rect.x = clamp(+r.rect.x || 0, 0, 1 - r.rect.w);
  r.rect.y = clamp(+r.rect.y || 0, 0, 1 - r.rect.h);
  r.zoom = clamp(Number.isFinite(+r.zoom) ? +r.zoom : 1, 0.1, 3);
  r.x = clamp(Number.isFinite(+r.x) ? +r.x : 0, -1, 1);
  r.y = clamp(Number.isFinite(+r.y) ? +r.y : 0, -1, 1);
}
function normCfg(c) {
  const d = defCfg();
  c = c && typeof c === 'object' ? c : {};
  const pageMissing = !c.page || typeof c.page !== 'object';
  const r = { ...d, ...c, rect: { ...d.rect, ...(c.rect || {}) }, luma: { ...d.luma, ...(c.luma || {}) }, chroma: { ...d.chroma, ...(c.chroma || {}) }, crop: { ...d.crop, ...(c.crop || {}) } };
  // DSKs antigos sem campo page mantêm o viewport do tamanho da área; novas páginas usam viewport fixo.
  r.page = { ...d.page, ...(pageMissing ? (c.url ? { mode: 'area' } : {}) : c.page) };
  r.page.mode = r.page.mode === 'area' ? 'area' : 'fixed';
  r.page.width = clamp(Math.round(+r.page.width || d.page.width), 320, 3840);
  r.page.height = clamp(Math.round(+r.page.height || d.page.height), 240, 2160);
  r.page.fit = r.page.fit === 'contain' ? 'contain' : 'cover';
  const v = c.vert && typeof c.vert === 'object' ? c.vert : {};
  r.vert = { ...d.vert, ...v, rect: { ...d.vert.rect, ...(v.rect || {}) }, crop: { ...d.vert.crop, ...(v.crop || {}) } };
  r.vert.on = !!r.vert.on;
  normGeo(r);
  normGeo(r.vert);
  r.power = r.power !== false;
  if (!OPS[r.blend]) r.blend = 'normal';
  r.opacity = clamp(Math.round(+r.opacity), 0, 100);
  if (!Number.isFinite(r.opacity)) r.opacity = 100;
  r.fadeMs = clamp(+r.fadeMs || 0, 0, 5000);
  // Galeria: só imagens locais (mesma origem). URL remota pintaria o canvas do programa com CORS
  // e o gravador/stream ficaria sem imagem; data URLs gigantes não cabem no JSON do estúdio.
  const seen = new Set();
  r.images = (Array.isArray(c.images) ? c.images : [])
    .filter((it) => it && typeof it.url === 'string' && /^\/api\/dsk\/assets\/[\w.-]+$/.test(it.url) && !seen.has(it.url) && seen.add(it.url))
    .slice(0, 60)
    .map((it) => ({ id: String(it.id || '').slice(0, 80), name: String(it.name || 'imagem').slice(0, 120), url: it.url }));
  r.imgIndex = r.images.length ? clamp(Math.round(+c.imgIndex || 0), 0, r.images.length - 1) : 0;
  r.imgAuto = !!c.imgAuto;
  r.imgAutoMs = clamp(Math.round(+c.imgAutoMs || 8000), 2000, 120000);
  r.fps = [5, 10, 15, 20, 30, 60].includes(+c.fps) ? +c.fps : 30;
  r.quality = clamp(Math.round(+c.quality || 80), 40, 95);
  if (!['url', 'source', 'images'].includes(r.src)) r.src = 'url';
  return r;
}
// configuração para desenhar no vertical: área/corte do vertical e imagem encaixada (fit), nunca esticada
const vertCfg = (c) => ({ ...c, pos: c.vert.pos, rect: c.vert.rect, crop: c.vert.crop, zoom: c.vert.zoom, x: c.vert.x, y: c.vert.y, fit: true });
const configured = (c) => (c.src === 'url' ? !!c.url : c.src === 'images' ? !!(c.images?.length && c.images[c.imgIndex]) : !!c.sourceId);
const hasCrop = (c) => !!c.crop && (c.crop.l > 0 || c.crop.t > 0 || c.crop.r > 0 || c.crop.b > 0);
// resumo ao lado do título da seção (fechada ela ainda mostra que há corte)
const cropSummary = (c) => {
  if (!hasCrop(c)) return 'sem corte';
  const p = (v) => `${Math.round(v * 1000) / 10}%`;
  return `E ${p(c.crop.l)} · D ${p(c.crop.r)} · C ${p(c.crop.t)} · B ${p(c.crop.b)}${c.crop.fill ? ' · ampliado' : ''}`;
};

// ---------- keyer em WebGL (luma e chroma): no 2D isso seria um getImageData por quadro, lento demais em 1080p ----------
const VS = 'attribute vec2 p;varying vec2 v;void main(){v=(p+1.)*.5;gl_Position=vec4(p,0.,1.);}';
const FS = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform int mode;
uniform float lo,soft,inv,sim,smo;uniform vec3 key;
vec2 cbcr(vec3 c){return vec2(-.168736*c.r-.331264*c.g+.5*c.b,.5*c.r-.418688*c.g-.081312*c.b);}
void main(){vec4 c=texture2D(t,v);float a;vec3 rgb=c.rgb;
if(mode==0){float y=dot(c.rgb,vec3(.2126,.7152,.0722));a=smoothstep(lo,lo+max(soft,.001),y);if(inv>.5)a=1.-a;}
else{float d=distance(cbcr(c.rgb),cbcr(key));a=smoothstep(sim,sim+max(smo,.001),d);
float sp=pow(clamp((d-sim)/.1,0.,1.),1.5);float l=dot(rgb,vec3(.2126,.7152,.0722));rgb=mix(vec3(l),rgb,sp);}
gl_FragColor=vec4(rgb,c.a*a);}`;
class Keyer {
  constructor() {
    this.canvas = document.createElement('canvas');
    // preserveDrawingBuffer: o resultado é desenhado depois, em vários canvas (programa, prévia, retorno do convidado)
    const gl = (this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true, antialias: false }));
    if (!gl) throw new Error('WebGL indisponível');
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const pr = (this.pr = gl.createProgram());
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.u = {};
    for (const n of ['mode', 'lo', 'soft', 'inv', 'sim', 'smo', 'key']) this.u[n] = gl.getUniformLocation(pr, n);
  }
  run(img, w, h, cfg) {
    const { gl, u } = this;
    // vídeo grande é reduzido para no máximo 1920 de largura: o key não precisa de mais e pesa menos na GPU
    const sc = Math.min(1, 1920 / w);
    const cw = Math.max(1, Math.round(w * sc));
    const ch = Math.max(1, Math.round(h * sc));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    gl.viewport(0, 0, cw, ch);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    const luma = cfg.blend === 'luma';
    gl.uniform1i(u.mode, luma ? 0 : 1);
    gl.uniform1f(u.lo, +cfg.luma.lo || 0);
    gl.uniform1f(u.soft, +cfg.luma.soft || 0);
    gl.uniform1f(u.inv, cfg.luma.invert ? 1 : 0);
    gl.uniform1f(u.sim, +cfg.chroma.sim || 0);
    gl.uniform1f(u.smo, +cfg.chroma.smooth || 0);
    const hex = /^#?([0-9a-f]{6})$/i.exec(cfg.chroma.color || '')?.[1] || '00ff00';
    gl.uniform3f(u.key, parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

export function createDsk({ S, comp, mixer, $, $$, esc, toast, modal, api, studioId, saveStudio, onChange }) {
  const N = 2;
  const keyOf = (i) => `${String(studioId).replace(/[^\w.-]/g, '')}-${i + 1}`;
  // chamado a cada quadro pelo compositor: só normaliza quando a lista ainda não está no formato (estudio novo/recarregado)
  const cfgs = () => {
    const d = S.brand.dsk;
    if (Array.isArray(d) && d.length === N && d.every((x) => x && x.rect && x.luma && x.chroma && x.crop && x.vert && x.page?.mode && Number.isFinite(+x.zoom) && Number.isFinite(+x.vert.zoom))) return d;
    const out = Array.isArray(d) ? d : [];
    for (let i = 0; i < N; i++) out[i] = normCfg(out[i]);
    out.length = N;
    S.brand.dsk = out;
    return out;
  };
  cfgs();
  // estado de execução (não vai para o arquivo do estúdio)
  const st = Array.from({ length: N }, () => ({ on: false, lv0: 0, target: 0, t0: 0, ms: 0, bmp: null, seq: 0, blob: null, decoding: false, status: null, sent: null, keyer: null, keyedAt: -1, keyedSeq: -1, keyFail: false, aGain: null, aNext: 0 }));
  const isAndroid = S?.system?.platform === 'android' || /Android|CastDeckAndroid/i.test(navigator.userAgent);
  let urlSupported = !isAndroid; // o servidor do Android não tem o navegador sem janela (CDP/Chrome headless exclusivo do PC)
  let browserName = '';
  let ws = null;
  let wsTimer = null;
  let previewSlot = -1;
  let cfgOpen = null; // re-render da janela de configuração quando chega status
  // Imagens do overlay: decodificadas uma vez e reutilizadas (sem screencast, sem PNG, sem headless).
  const imgCache = new Map();
  function imageFor(url) {
    let img = imgCache.get(url);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.src = url;
      imgCache.set(url, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  }

  // ---------- nível (fade) ----------
  function level(i, now = performance.now()) {
    const s = st[i];
    if (!s.ms) return s.target;
    const p = Math.min(1, (now - s.t0) / s.ms);
    return s.lv0 + (s.target - s.lv0) * p;
  }
  function toggle(i, { cut = false, on } = {}) {
    const c = cfgs()[i];
    const want = on ?? !st[i].on;
    if (want && !configured(c)) return openConfig(i);
    if (want && !c.power) {
      // desligado: liga (reabre a página) e entra no ar; página web aparece quando o primeiro quadro chegar
      S.brand.dsk[i] = normCfg({ ...c, power: true });
      save(i, { resync: true });
      toast(`DSK ${i + 1} ligado`, '');
    }
    const s = st[i];
    const now = performance.now();
    const cur = level(i, now);
    s.on = want;
    s.target = want ? 1 : 0;
    s.lv0 = cur;
    s.t0 = now;
    s.ms = cut ? 0 : c.fadeMs * Math.abs(s.target - cur);
    if (want) pump(i);
    onChange?.({ i, on: want, sourceId: c.src === 'source' ? c.sourceId : null, ms: s.ms });
    renderDeck();
    cfgOpen?.();
  }
  const isOn = (i) => st[i].on;
  // fontes que o DSK está mostrando (ou ainda terminando o fade de saída): não podem ser pausadas
  function uses(id, now = performance.now()) {
    const c = cfgs();
    return c.some((x, i) => x.src === 'source' && x.sourceId === id && (st[i].on || level(i, now) > 0));
  }
  function airIds() {
    const c = cfgs();
    const ids = c.filter((x, i) => x.src === 'source' && x.sourceId && st[i].on).map((x) => x.sourceId);
    // som das páginas web: o canal fica sempre "no palco" e quem abre/fecha é o ganho do próprio DSK (segue o fade;
    // tirar do palco no clique cortaria o som no início do fade de saída)
    for (let i = 0; i < N; i++) ids.push(`dsk:${i + 1}`);
    return ids;
  }

  // ---------- áudio da página web (PCM 48 kHz estéreo int16 vindo do servidor) ----------
  function playPcm(i, bytes) {
    const ctx = mixer?.ctx;
    if (!ctx || bytes.byteLength < 4) return;
    const s = st[i];
    if (!s.aGain) {
      s.aGain = ctx.createGain();
      s.aGain.gain.value = level(i);
      mixer.addNode(`dsk:${i + 1}`, s.aGain, { ownerId: 'host', stageKey: `dsk:${i + 1}`, monitor: true });
    }
    // fora do ar não agenda nada: economiza CPU e não acumula atraso para quando entrar
    if (ctx.state !== 'running' || cfgs()[i].src !== 'url' || level(i) <= 0) {
      s.aNext = 0;
      return;
    }
    const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 1);
    const n = pcm.length >> 1;
    const buf = ctx.createBuffer(2, n, 48000);
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    for (let k = 0; k < n; k++) {
      L[k] = pcm[2 * k] / 32768;
      R[k] = pcm[2 * k + 1] / 32768;
    }
    const now = ctx.currentTime;
    // buffer de 120 ms contra a variação de chegada; atrasou demais ou sobrou demais (silêncio pulado): ressincroniza
    if (!s.aNext || s.aNext < now + 0.02 || s.aNext > now + 0.6) s.aNext = now + 0.12;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(s.aGain);
    src.start(s.aNext);
    s.aNext += buf.duration;
  }

  // ---------- quadros da página web ----------
  const needed = (i) => st[i].on || level(i) > 0 || previewSlot === i;
  function pump(i) {
    const s = st[i];
    if (s.decoding || !s.blob) return;
    const blob = s.blob;
    s.blob = null;
    s.decoding = true;
    createImageBitmap(blob)
      .then((bmp) => {
        s.bmp?.close?.();
        s.bmp = bmp;
        s.seq++;
      })
      .catch(() => {})
      .finally(() => {
        s.decoding = false;
        if (s.blob && needed(i)) pump(i);
      });
  }
  function slotOfKey(k) {
    for (let i = 0; i < N; i++) if (keyOf(i) === k) return i;
    return -1;
  }
  function onWsMessage(ev) {
    if (typeof ev.data === 'string') {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (m.type === 'fps') {
        for (const x of m.slots || []) {
          const i = slotOfKey(x.key);
          if (i >= 0 && st[i].status) Object.assign(st[i].status, { fps: x.fps, audio: !!x.audio });
        }
      } else if (m.type === 'status') {
        const i = slotOfKey(m.key);
        if (i >= 0) st[i].status = m;
      } else if (m.type === 'clear') {
        const i = slotOfKey(m.key);
        if (i >= 0) {
          st[i].status = null;
          st[i].bmp?.close?.();
          st[i].bmp = null;
        }
      }
      renderDeck();
      cfgOpen?.(true);
      return;
    }
    const buf = ev.data;
    const u8 = new Uint8Array(buf);
    // 1º byte 0 = áudio ([0][tamanho][chave][PCM]); senão é quadro ([tamanho][chave][PNG])
    if (u8[0] === 0) {
      const kl = u8[1];
      const i = slotOfKey(new TextDecoder().decode(u8.subarray(2, 2 + kl)));
      if (i >= 0) playPcm(i, u8.slice(2 + kl));
      return;
    }
    const kl = u8[0];
    const i = slotOfKey(new TextDecoder().decode(u8.subarray(1, 1 + kl)));
    if (i < 0) return;
    st[i].blob = new Blob([u8.subarray(1 + kl)], { type: 'image/png' });
    if (needed(i)) pump(i);
  }
  function connect() {
    clearTimeout(wsTimer);
    if (!urlSupported) return;
    try {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/dsk`);
    } catch {
      wsTimer = setTimeout(connect, 2000);
      return;
    }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      // servidor pode ter reiniciado (ou fechado as páginas por ociosidade): reenvia o que está configurado
      for (let i = 0; i < N; i++) st[i].sent = null;
      sync();
    };
    ws.onmessage = onWsMessage;
    ws.onclose = () => {
      ws = null;
      wsTimer = setTimeout(connect, 2000);
    };
    ws.onerror = () => {};
  }
  // carrega/atualiza/fecha as páginas no servidor conforme a configuração (tamanho da página = área do DSK no programa)
  async function sync(i = null, { force = false } = {}) {
    if (!urlSupported) return;
    const c = cfgs();
    for (let k = 0; k < N; k++) {
      if (i !== null && k !== i) continue;
      const x = c[k];
      const pageFixed = x.page?.mode === 'fixed';
      const pageW = pageFixed ? x.page.width : Math.round(x.rect.w * comp.W);
      const pageH = pageFixed ? x.page.height : Math.round(x.rect.h * comp.H);
      const want = x.power && x.src === 'url' && x.url
        ? { url: x.url, width: pageW, height: pageH, jpeg: !!x.opaque, fps: x.fps, quality: x.quality }
        : null;
      const sig = want ? `${want.url}|${want.width}x${want.height}|${want.jpeg}|${want.fps}|${want.quality}` : '';
      if (!force && st[k].sent === sig) continue;
      st[k].sent = sig;
      try {
        if (want) st[k].status = { ...(st[k].status || {}), ...(await api(`/dsk/${keyOf(k)}`, { method: 'PUT', body: { ...want, force } })) };
        else if (st[k].status || force) {
          await api(`/dsk/${keyOf(k)}`, { method: 'DELETE' });
          st[k].status = null;
        }
      } catch (e) {
        st[k].sent = null;
        st[k].status = { ...(st[k].status || {}), error: e.message };
        if (e.status === 404) urlSupported = false;
      }
      renderDeck();
      cfgOpen?.(true);
    }
  }
  async function reload(i) {
    try {
      await api(`/dsk/${keyOf(i)}/reload`, { method: 'POST' });
    } catch (e) {
      // navegador morreu/foi fechado: o ⟳ volta a abrir a página (o servidor tenta perfis alternativos)
      if (e.status !== 404) toast('Não foi possível recarregar: ' + e.message, 'err');
      return sync(i, { force: true });
    }
  }

  // ---------- desenho ----------
  function sourceImage(i, cfg, view) {
    if (cfg.src === 'images') {
      const it = cfg.images?.[cfg.imgIndex];
      const img = it && imageFor(it.url);
      return img ? { img, w: img.naturalWidth, h: img.naturalHeight, seq: 1 } : null;
    }
    if (cfg.src === 'url') {
      const b = st[i].bmp;
      const fixed = cfg.page?.mode === 'fixed';
      return b ? { img: b, w: b.width, h: b.height, stretch: !fixed, fit: fixed ? cfg.page.fit : undefined, seq: st[i].seq } : null;
    }
    const s = view.sources?.get(cfg.sourceId);
    const el = s?.el;
    if (!el || s.camOff) return null;
    const isImg = el instanceof HTMLImageElement;
    const w = isImg ? el.naturalWidth : el.videoWidth;
    const h = isImg ? el.naturalHeight : el.videoHeight;
    if (!(w > 0) || (!isImg && el.readyState < 2)) return null;
    // câmera com fundo virtual/desfoque: usa o quadro processado, igual ao que aparece no palco
    const fx = s.kind === 'camera' && view.vfx ? view.vfx.frame(s.id, el) : null;
    if (fx) return { img: fx.img, w: fx.w, h: fx.h, seq: -1 };
    return { img: el, w, h, seq: isImg ? 1 : -1 };
  }
  function keyed(i, cfg, src, now) {
    const s = st[i];
    if (s.keyFail) return src;
    try {
      s.keyer ||= new Keyer();
    } catch (e) {
      s.keyFail = true;
      console.warn('[dsk] keyer indisponível:', e);
      toast('Luma/chroma key indisponível neste computador (sem WebGL). A camada entra sem recorte.', 'err');
      return src;
    }
    // reaproveita o recorte entre as saídas do mesmo quadro (programa, prévia, retorno do convidado)
    const sig = `${cfg.blend}|${cfg.luma.lo}|${cfg.luma.soft}|${cfg.luma.invert}|${cfg.chroma.color}|${cfg.chroma.sim}|${cfg.chroma.smooth}`;
    const fresh = src.seq >= 0 ? s.keyedSeq === src.seq && s.keySig === sig && s.keyedImg === src.img : now - s.keyedAt < 15 && s.keySig === sig;
    if (!fresh) {
      s.keyer.run(src.img, src.w, src.h, cfg);
      s.keyedAt = now;
      s.keyedSeq = src.seq;
      s.keySig = sig;
      s.keyedImg = src.img;
    }
    // o recorte do key é reduzido (máx. 1920): o corte usa as medidas reais do canvas dele
    return { ...src, img: s.keyer.canvas, iw: s.keyer.canvas.width, ih: s.keyer.canvas.height };
  }
  // área final da camada depois do zoom/pan do DSK (independente do recorte da fonte)
  function layerRect(g, r) {
    const z = clamp(Number.isFinite(+g.zoom) ? +g.zoom : 1, 0.1, 3);
    const px = Number.isFinite(+g.x) ? +g.x : 0;
    const py = Number.isFinite(+g.y) ? +g.y : 0;
    return {
      x: r.x + (r.w * (1 - z)) / 2 + px * (r.w / 2),
      y: r.y + (r.h * (1 - z)) / 2 + py * (r.h / 2),
      w: r.w * z,
      h: r.h * z,
    };
  }
  // onde a parte não cortada da fonte vai parar dentro da área (x,y,w,h) do DSK
  function placeCropped(cfg, src, x, y, w, h) {
    const c = cfg.crop || { l: 0, t: 0, r: 0, b: 0, fill: false };
    // página web estica na área (ela foi aberta no tamanho dela); no vertical (fit) encaixa sem deformar
    const stretch = src.stretch && !cfg.fit;
    const fit = src.fit === 'cover' ? 'cover' : 'contain';
    const fw = 1 - c.l - c.r;
    const fh = 1 - c.t - c.b;
    if (c.fill) {
      // amplia o recorte: página web estica na área; fonte do CastDeck encaixa mantendo a proporção do recorte
      if (stretch) return { c, fw, fh, dx: x, dy: y, dw: w, dh: h };
      const cw = src.w * fw;
      const ch = src.h * fh;
      const sc = Math.min(w / cw, h / ch);
      return { c, fw, fh, dx: x + (w - cw * sc) / 2, dy: y + (h - ch * sc) / 2, dw: cw * sc, dh: ch * sc };
    }
    // sem ampliar: a imagem inteira ficaria onde sempre ficou; só a parte não cortada é desenhada, no mesmo lugar
    let fx = x;
    let fy = y;
    let iw = w;
    let ih = h;
    if (!stretch) {
      const sc = fit === 'cover' ? Math.max(w / src.w, h / src.h) : Math.min(w / src.w, h / src.h);
      iw = src.w * sc;
      ih = src.h * sc;
      fx = x + (w - iw) / 2;
      fy = y + (h - ih) / 2;
    }
    return { c, fw, fh, dx: fx + c.l * iw, dy: fy + c.t * ih, dw: fw * iw, dh: fh * ih };
  }
  function drawSlot(ctx, W, H, view, i, alpha, now, cfgOv = null) {
    const cfg = cfgOv || cfgs()[i];
    let src = sourceImage(i, cfg, view);
    if (!src) return;
    if (cfg.blend === 'luma' || cfg.blend === 'chroma') src = keyed(i, cfg, src, now);
    const r = layerRect(cfg, cfg.rect);
    const g = placeCropped(cfg, src, r.x * W, r.y * H, r.w * W, r.h * H);
    if (g.dw < 0.5 || g.dh < 0.5) return;
    const iw = src.iw ?? src.w;
    const ih = src.ih ?? src.h;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = OPS[cfg.blend] || 'source-over';
    ctx.drawImage(src.img, g.c.l * iw, g.c.t * ih, g.fw * iw, g.fh * ih, g.dx, g.dy, g.dw, g.dh);
    ctx.restore();
  }
  // chamado pelo compositor (programa, prévia da mesa de corte e retorno do convidado), acima do letreiro e abaixo do FTB
  const bus = {
    draw(view, now = performance.now()) {
      if (isAndroid) return;
      for (let i = 0; i < N; i++) {
        const lv = level(i, now);
        // volume do som da página acompanha o fade da imagem (não a opacidade: 50% de opacidade não é meio volume)
        const g = st[i].aGain;
        if (g && Math.abs(g.gain.value - lv) > 0.002) g.gain.value = lv;
        if (lv <= 0.001) continue;
        const cfg = cfgs()[i];
        if (!cfg.power) continue;
        // carrossel de imagens: avança sozinho enquanto a camada está no ar (não salva a cada troca)
        if (cfg.src === 'images' && cfg.imgAuto && (cfg.images?.length || 0) > 1) {
          const t = Date.now();
          if (!st[i].autoAt) st[i].autoAt = t;
          else if (t - st[i].autoAt >= cfg.imgAutoMs) {
            st[i].autoAt = t;
            setImage(i, cfg.imgIndex + 1, { save: false });
          }
        } else if (st[i].autoAt) st[i].autoAt = 0;
        // saída vertical: só os DSKs marcados para ela, com posição/corte próprios
        if (view.vertical && !cfg.vert.on) continue;
        const a = lv * (cfg.opacity / 100);
        if (a <= 0.001) continue;
        drawSlot(view.ctx, view.W, view.H, view, i, a, now, view.vertical ? vertCfg(cfg) : null);
      }
    },
  };
  comp.dsk = bus;

  // Troca a imagem exibida pelo DSK (manual pelo deck/config ou automática). O índice fica no estúdio;
  // a troca automática não salva a cada volta para não gerar um PUT a cada 8 s.
  function setImage(i, index, { save = true } = {}) {
    const c = cfgs()[i];
    if (!c.images?.length) return;
    const n = c.images.length;
    const next = ((Math.round(index) % n) + n) % n;
    S.brand.dsk[i] = normCfg({ ...c, imgIndex: next });
    if (save) saveStudio();
    renderDeck();
    cfgOpen?.(true);
  }

  // ---------- barra de controle (deck) ----------
  function renderDeck() {
    const box = $('#deck-dsk');
    if (!box) return;
    if (isAndroid) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    const c = cfgs();
    const sig = c.map((x, i) => `${configured(x)}|${st[i].on}|${st[i].status?.error || ''}|${x.src}|${x.url}|${x.sourceId}|${x.power}|${x.vert.on}|${x.imgIndex}|${x.images?.length || 0}`).join(';');
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.innerHTML =
      `<span class="deck-lbl">DSK 1 &amp; 2</span><div class="deck-dsk-body">` +
      c
        .map((x, i) => {
          const label = x.src === 'url'
            ? x.url.replace(/^https?:\/\//, '').slice(0, 60)
            : x.src === 'images'
              ? `${x.images?.length || 0} imagem(ns) · ${x.images?.[x.imgIndex]?.name || '—'}`
              : S.sources.get(x.sourceId)?.label || x.sourceId;
          const err = st[i].status?.error;
          const tip = configured(x)
            ? `DSK ${i + 1}: ${label}${err ? ' — ' + err : ''}${x.power ? '' : ' (desligado: não consome recursos)'}${x.vert.on ? ' · também no vertical' : ''}\nClique: ${st[i].on ? 'tirar do ar' : x.power ? 'pôr no ar' : 'ligar e pôr no ar'} (fade) · Shift+clique: corte seco · Botão direito: configurar`
            : `DSK ${i + 1} vazio: clique para configurar (camada fixa por cima do programa)`;
          const imgNav = x.src === 'images' && (x.images?.length || 0) > 1
            ? `<button class="btn sm icon dsk-img" data-img-i="${i}" title="${esc(`Trocar imagem do DSK ${i + 1} (${x.imgIndex + 1}/${x.images.length}) — Shift+clique volta`)}">🖼</button>`
            : '';
          return `<button class="btn sm dsk-btn ${st[i].on ? 'onair' : ''} ${configured(x) ? '' : 'empty'} ${configured(x) && !x.power ? 'off' : ''} ${err && x.power ? 'err' : ''}" id="dsk-btn-${i + 1}" data-i="${i}" title="${esc(tip)}"><span class="dsk-dot"></span>DSK ${i + 1}</button>${imgNav}`;
        })
        .join('') +
      `<button class="btn sm icon dsk-cfg" id="dsk-cfg" title="Configurar DSK 1 e 2">⚙</button></div>`;
    for (const b of $$('.dsk-btn', box)) {
      const i = +b.dataset.i;
      b.onclick = (e) => toggle(i, { cut: e.shiftKey });
      b.oncontextmenu = (e) => {
        e.preventDefault();
        openConfig(i);
      };
    }
    for (const b of $$('.dsk-img', box)) {
      b.onclick = (e) => {
        const i = +b.dataset.imgI;
        const c = cfgs()[i];
        setImage(i, c.imgIndex + (e.shiftKey ? -1 : 1), { save: true });
      };
      b.oncontextmenu = (e) => {
        e.preventDefault();
        openConfig(+b.dataset.imgI);
      };
    }
    $('#dsk-cfg', box).onclick = () => openConfig(st[1].on && !st[0].on ? 1 : 0);
  }

  // ---------- janela de configuração ----------
  function save(i, { resync = false } = {}) {
    S.brand.dsk[i] = normCfg(S.brand.dsk[i]);
    saveStudio();
    if (resync) sync(i);
    renderDeck();
  }
  function sourceOptions(sel) {
    const list = [...S.sources.values()].filter((s) => s.el && !(s.kind === 'media' && s.camOff && String(s.label || '').startsWith('♪')));
    const kinds = { camera: 'Câmera', screen: 'Tela', media: 'Vídeo', image: 'Imagem' };
    if (!list.length) return '<option value="">(nenhuma fonte no estúdio)</option>';
    return (
      `<option value="">Escolha uma fonte…</option>` +
      list.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc((kinds[s.kind] || 'Fonte') + ' · ' + (s.label || s.id))}</option>`).join('')
    );
  }
  async function openConfig(i0 = 0) {
    if (isAndroid) {
      toast('O DSK com páginas web é exclusivo da versão para PC.', 'warn');
      return;
    }
    if (document.querySelector('.dsk-modal')) return;
    let tab = i0;
    let raf = 0;
    let cleanup = () => {};
    await modal(
      `<div class="dsk-modal">
        <h3>DSK — camadas por cima do programa</h3>
        <p class="sub">Ficam acima de tudo (GC, letreiro, logo) e não mudam com cortes ou transições — valem no modo Estúdio e na mesa de corte. Use páginas com fundo transparente (alertas, placares, relógios) ou uma fonte do CastDeck com modo de mesclagem.</p>
        <div class="dsk-tabs" role="tablist">${Array.from({ length: N }, (_, i) => `<button class="btn sm dsk-tab" data-t="${i}" role="tab">DSK ${i + 1}</button>`).join('')}</div>
        <div class="dsk-body"></div>
        <div class="modal-actions"><button class="btn" data-close>Fechar</button></div>
      </div>`,
      {
        sticky: true,
        onMount(m) {
          const body = $('.dsk-body', m);
          const pv = document.createElement('canvas');
          pv.width = 480;
          pv.height = 270;
          pv.className = 'dsk-pv';
          pv.tabIndex = 0; // recebe o teclado no modo interativo
          // a prévia vive num contêiner próprio: é ele que vai para a tela cheia (com a barra de controles por cima)
          const pvWrap = document.createElement('div');
          pvWrap.className = 'dsk-pvwrap';
          pvWrap.innerHTML = `<div class="dsk-fsbar"><span class="dsk-fs-title"></span><button class="btn sm" data-fs-int title="Clique e digite direto na página">🖱 Interagir</button><button class="btn sm" data-fs-exit>✕ Sair da tela cheia</button></div>`;
          pvWrap.prepend(pv);
          let interact = false;
          let pendingRender = false;
          let cropOpen = false; // seção "Cortar" aberta continua aberta quando o formulário é refeito
          // formato editado na janela: 'h' = programa 16:9, 'v' = saída vertical 9:16 (posição e corte próprios)
          let fmt = 'h';
          const G = () => (fmt === 'v' ? cfgs()[tab].vert : cfgs()[tab]);
          const putG = (patch) => {
            const cfg = cfgs()[tab];
            S.brand.dsk[tab] = normCfg(fmt === 'v' ? { ...cfg, vert: { ...cfg.vert, ...patch } } : { ...cfg, ...patch });
          };
          const drawCfg = (cfg) => (fmt === 'v' ? vertCfg(cfg) : cfg);
          const isFs = () => document.fullscreenElement === pvWrap;
          const render = () => {
            // sair do DOM tira da tela cheia: enquanto estiver em tela cheia, só atualiza o que dá e refaz depois
            if (isFs()) {
              pendingRender = true;
              syncTools();
              return;
            }
            previewSlot = tab;
            pump(tab);
            const c = cfgs()[tab];
            const s = st[tab];
            if (c.src !== 'url') interact = false;
            for (const b of $$('.dsk-tab', m)) b.classList.toggle('active', +b.dataset.t === tab);
            const pct = (v) => Math.round(v * 1000) / 10;
            const g = G();
            const posOpts = Object.entries(POS).map(([k, [lbl]]) => `<option value="${k}" ${g.pos === k ? 'selected' : ''}>${lbl}</option>`).join('');
            const sl = (id, lbl, v, min, max, step) =>
              `<label class="field dsk-sl"><span>${lbl} <b data-v="${id}">${v}</b></span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
            body.innerHTML = `
              <div class="dsk-grid">
                <div class="dsk-form">
                  <label class="dsk-power ${c.power ? 'on' : ''}" title="Desligado: a página é fechada e o DSK não gasta CPU, GPU nem memória. Pôr no ar liga de novo.">
                    <input type="checkbox" id="dsk-power" ${c.power ? 'checked' : ''}><span class="dsk-sw"></span>
                    <span><b>${c.power ? 'Ligado' : 'Desligado'}</b><small>${c.power ? (c.src === 'url' ? 'página aberta e pronta para entrar no ar' : 'pronto para entrar no ar') : 'não consome recursos do computador'}</small></span>
                  </label>
                  <div class="dsk-seg">
                    <button class="btn sm ${c.src === 'url' ? 'primary' : ''}" data-src="url" ${urlSupported ? '' : 'disabled title="Só no CastDeck do computador"'}>Endereço web</button>
                    <button class="btn sm ${c.src === 'source' ? 'primary' : ''}" data-src="source">Fonte do CastDeck</button>
                    <button class="btn sm ${c.src === 'images' ? 'primary' : ''}" data-src="images" title="Várias imagens no mesmo overlay, com troca manual ou automática">Imagens</button>
                  </div>
                  ${
                    c.src === 'url'
                      ? `<label class="field"><span>Endereço (URL)</span>
                          <div class="dsk-row"><input class="input" id="dsk-url" placeholder="https://… (página com fundo transparente)" value="${esc(c.url)}" spellcheck="false">
                          <button class="btn sm primary" id="dsk-load">${s.status?.url === c.url && c.url ? 'Aplicar' : 'Carregar'}</button>
                          <button class="btn sm" id="dsk-reload" ${c.url ? '' : 'disabled'} title="Recarregar a página">⟳</button></div></label>
                        <label class="dsk-chk"><input type="checkbox" id="dsk-opaque" ${c.opaque ? 'checked' : ''}> Página opaca (vídeo/YouTube): imagem mais leve, sem transparência</label>
                        <div class="dsk-row2">
                          <label class="field"><span>Página</span><select class="input" id="dsk-page-mode">
                            <option value="fixed" ${c.page.mode === 'fixed' ? 'selected' : ''}>Tamanho fixo (não reflui)</option>
                            <option value="area" ${c.page.mode === 'area' ? 'selected' : ''}>Área do DSK (legado)</option>
                          </select></label>
                          ${c.page.mode === 'fixed'
                            ? `<label class="field"><span>Tamanho fixo</span><select class="input" id="dsk-page-size">
                                ${[[1280, 720], [1920, 1080], [1024, 576]].map(([w, h]) => `<option value="${w}x${h}" ${c.page.width === w && c.page.height === h ? 'selected' : ''}>${w}×${h}</option>`).join('')}
                              </select></label>`
                            : ''}
                        </div>
                        ${c.page.mode === 'fixed'
                          ? `<div class="dsk-row2"><label class="field"><span>Encaixe na área</span><select class="input" id="dsk-page-fit">
                              <option value="cover" ${c.page.fit === 'cover' ? 'selected' : ''}>Preencher (corta bordas)</option>
                              <option value="contain" ${c.page.fit === 'contain' ? 'selected' : ''}>Conter (página inteira)</option>
                            </select></label></div>
                            <p class="hint" style="margin:-2px 0 8px">A página mantém o layout fixo; mudar a área, o zoom ou a posição não a faz refluir.</p>`
                          : `<p class="hint" style="margin:-2px 0 8px">Modo antigo: a página é aberta no tamanho da área e reflui ao redimensionar.</p>`}
                        <div class="dsk-row2">
                          <label class="field"><span>Quadros/s</span><select class="input" id="dsk-fps">${[15, 20, 30, 60].map((v) => `<option value="${v}" ${c.fps === v ? 'selected' : ''}>${v} qps</option>`).join('')}</select></label>
                          ${c.opaque ? `<label class="field"><span>Qualidade JPEG</span><select class="input" id="dsk-quality">${[60, 70, 80, 85, 95].map((v) => `<option value="${v}" ${c.quality === v ? 'selected' : ''}>${v}%</option>`).join('')}</select></label>` : ''}
                        </div>
                        <div class="dsk-status" id="dsk-status"></div>`
                      : c.src === 'images'
                        ? `<div class="dsk-gallery-wrap">
                            <div class="dsk-gallery-head"><span><b>Imagens do overlay</b> · ${c.images.length}</span>
                              <span class="dsk-gallery-actions">
                                <button type="button" class="btn sm" id="dsk-img-prev" ${c.images.length > 1 ? '' : 'disabled'} title="Imagem anterior">‹</button>
                                <button type="button" class="btn sm" id="dsk-img-next" ${c.images.length > 1 ? '' : 'disabled'} title="Próxima imagem">›</button>
                                <button type="button" class="btn sm primary" id="dsk-img-add">＋ Imagens</button>
                              </span>
                            </div>
                            <input type="file" id="dsk-img-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>
                            ${c.images.length
                              ? `<div class="dsk-gallery">${c.images.map((it, k) => `<div class="dsk-thumb ${k === c.imgIndex ? 'active' : ''}" data-img-k="${k}" role="button" tabindex="0" title="${esc(it.name)} — clique para colocar no ar">
                                  <img src="${esc(it.url)}" alt="" loading="lazy">
                                  <span>${esc(it.name)}</span>
                                  <button type="button" class="dsk-thumb-x" data-img-del="${k}" title="Remover esta imagem">✕</button>
                                </div>`).join('')}</div>`
                              : `<div class="dsk-gallery-empty">Nenhuma imagem ainda. Clique em <b>＋ Imagens</b> e escolha PNG, JPEG, WebP ou GIF (até 25 MB cada).</div>`}
                            <div class="dsk-gallery-foot">
                              <label class="dsk-chk"><input type="checkbox" id="dsk-img-auto" ${c.imgAuto ? 'checked' : ''}> Trocar automaticamente no ar</label>
                              <select class="input" id="dsk-img-ms" ${c.imgAuto ? '' : 'disabled'} title="Tempo de cada imagem">
                                ${[3000, 5000, 8000, 10000, 15000, 30000].map((v) => `<option value="${v}" ${c.imgAutoMs === v ? 'selected' : ''}>${v / 1000} s</option>`).join('')}
                              </select>
                            </div>
                            <span class="hint">Clique numa imagem para colocá-la no ar. No deck, o botão <b>🖼</b> troca rápido (Shift+clique volta).</span>
                          </div>`
                        : `<label class="field"><span>Fonte</span><select class="input" id="dsk-source">${sourceOptions(c.sourceId)}</select></label>`
                  }
                  <label class="field"><span>Mesclagem</span><select class="input" id="dsk-blend">${DSK_BLENDS.map(([k, l]) => `<option value="${k}" ${c.blend === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                  ${c.blend === 'luma' ? `<div class="dsk-sub">${sl('dsk-lo', 'Limite', c.luma.lo, 0, 1, 0.01)}${sl('dsk-soft', 'Suavidade', c.luma.soft, 0, 0.5, 0.01)}<label class="dsk-chk"><input type="checkbox" id="dsk-inv" ${c.luma.invert ? 'checked' : ''}> Inverter (recorta o claro)</label></div>` : ''}
                  ${c.blend === 'chroma' ? `<div class="dsk-sub"><label class="field dsk-sl"><span>Cor do fundo</span><input type="color" id="dsk-key" value="${esc(c.chroma.color)}"></label>${sl('dsk-sim', 'Similaridade', c.chroma.sim, 0.01, 1, 0.01)}${sl('dsk-smo', 'Suavidade', c.chroma.smooth, 0, 0.5, 0.01)}</div>` : ''}
                  <div class="dsk-row2">
                    ${sl('dsk-op', 'Opacidade', c.opacity, 0, 100, 1)}
                    <label class="field"><span>Transição</span><select class="input" id="dsk-fade">${FADES.map(([v, l]) => `<option value="${v}" ${+c.fadeMs === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
                  </div>
                  <div class="dsk-geo">
                    <div class="dsk-geo-head"><span>Posição e corte</span>
                      <div class="dsk-seg dsk-fmt" role="tablist">
                        <button class="btn sm ${fmt === 'h' ? 'primary' : ''}" data-fmt="h" role="tab" title="Programa principal (16:9)">▭ Horizontal</button>
                        <button class="btn sm ${fmt === 'v' ? 'primary' : ''}" data-fmt="v" role="tab" title="Saída vertical 9:16 (Reels, Shorts, TikTok)">▯ Vertical${c.vert.on ? ' <i class="dsk-von-dot"></i>' : ''}</button>
                      </div>
                    </div>
                    ${
                      fmt === 'v'
                        ? `<label class="dsk-chk dsk-von"><input type="checkbox" id="dsk-von" ${c.vert.on ? 'checked' : ''}> Mostrar este DSK na saída vertical</label>
                           <div class="dsk-vnote"><span class="hint">Posição e corte do vertical são independentes do horizontal; a imagem entra inteira, sem esticar.</span><button class="btn sm" id="dsk-vcopy" title="Usa a posição e o corte do horizontal como ponto de partida">Copiar do horizontal</button></div>`
                        : ''
                    }
                    <div class="dsk-geo-body ${fmt === 'v' && !c.vert.on ? 'dim' : ''}">
                  <label class="field"><span>Posição${fmt === 'v' ? ' no vertical' : ''}</span><select class="input" id="dsk-pos">${posOpts}</select></label>
                  <div class="dsk-sub dsk-rect">
                    ${sl('dsk-zoom', 'Zoom da camada %', Math.round(g.zoom * 100), 10, 300, 1)}
                    ${sl('dsk-px', 'Pan X %', Math.round(g.x * 100), -100, 100, 1)}
                    ${sl('dsk-py', 'Pan Y %', Math.round(g.y * 100), -100, 100, 1)}
                  </div>
                  ${
                    g.pos === 'custom'
                      ? `<div class="dsk-sub dsk-rect">${sl('dsk-x', 'X %', Math.round(g.rect.x * 100), 0, 95, 1)}${sl('dsk-y', 'Y %', Math.round(g.rect.y * 100), 0, 95, 1)}${sl('dsk-w', 'Largura %', Math.round(g.rect.w * 100), 5, 100, 1)}${sl('dsk-h', 'Altura %', Math.round(g.rect.h * 100), 5, 100, 1)}</div>`
                      : ''
                  }
                  <details class="dsk-crop" id="dsk-crop" ${cropOpen || hasCrop(g) ? 'open' : ''}>
                    <summary><span>✂ Cortar imagem${fmt === 'v' ? ' (vertical)' : ''}</span><b id="dsk-crop-sum">${cropSummary(g)}</b></summary>
                    <div class="dsk-sub">
                      ${sl('dsk-cl', 'Esquerda %', pct(g.crop.l), 0, 95, 0.5)}${sl('dsk-cr', 'Direita %', pct(g.crop.r), 0, 95, 0.5)}
                      ${sl('dsk-ct', 'Cima %', pct(g.crop.t), 0, 95, 0.5)}${sl('dsk-cb', 'Baixo %', pct(g.crop.b), 0, 95, 0.5)}
                      <label class="dsk-chk"><input type="checkbox" id="dsk-cfill" ${g.crop.fill ? 'checked' : ''}> Ampliar o recorte para preencher a área</label>
                      <div class="dsk-crop-foot"><span class="hint">Dica: Alt + arrastar a borda na prévia corta direto (como no OBS).</span><button class="btn sm" id="dsk-creset" ${hasCrop(g) ? '' : 'disabled'}>Zerar</button></div>
                    </div>
                  </details>
                    </div>
                  </div>
                </div>
                <div class="dsk-side">
                  <div class="dsk-pvbox ${fmt === 'v' ? 'vert' : ''}"></div>
                  <div class="dsk-pvtools">
                    <button class="btn sm" id="dsk-interact" ${c.src === 'url' && c.url ? '' : 'disabled'} title="Clique e digite direto na página do DSK (login, aviso de cookies, escolher sala…)">🖱 Interagir com a página</button>
                    <button class="btn sm" id="dsk-fs" title="Prévia em tela cheia (Esc sai)">⛶ Tela cheia</button>
                  </div>
                  <div class="dsk-actions">
                    <button class="btn ${s.on ? 'live' : 'primary'}" id="dsk-air" ${configured(c) ? '' : 'disabled'}>${s.on ? '● No ar — tirar' : '▶ Pôr no ar'}</button>
                    <button class="btn" id="dsk-clear" title="Apaga a configuração deste DSK">Limpar</button>
                  </div>
                  <p class="hint" id="dsk-hint"></p>
                </div>
              </div>`;
            $('.dsk-pvbox', body).append(pvWrap);
            status();
            bind();
            syncTools();
          };
          // estado dos botões da prévia (embaixo dela e na barra da tela cheia)
          const syncTools = () => {
            const c = cfgs()[tab];
            const can = c.src === 'url' && !!c.url;
            pvWrap.classList.toggle('interact', interact);
            pvWrap.classList.toggle('fs', isFs());
            const bi = $('#dsk-interact', body);
            if (bi) {
              bi.disabled = !can;
              bi.classList.toggle('primary', interact);
              bi.textContent = interact ? '🖱 Interagindo — parar' : '🖱 Interagir com a página';
            }
            const fi = $('[data-fs-int]', pvWrap);
            fi.hidden = !can;
            fi.classList.toggle('primary', interact);
            fi.textContent = interact ? '🖱 Interagindo — parar' : '🖱 Interagir';
            $('.dsk-fs-title', pvWrap).textContent = `DSK ${tab + 1}${c.src === 'url' && c.url ? ' · ' + c.url.replace(/^https?:\/\//, '').slice(0, 70) : ''}`;
            const hint = $('#dsk-hint', body);
            if (hint)
              hint.textContent = interact
                ? 'Modo interativo: cliques, rolagem e teclado vão para a página (Ctrl+V cola). Clique em "parar" para voltar.'
                : 'Prévia sobre xadrez = transparente. Shift+clique no botão da barra: corte seco.';
          };
          const setInteract = (v) => {
            interact = !!v && cfgs()[tab].src === 'url' && !!cfgs()[tab].url;
            syncTools();
            if (interact) pv.focus();
          };
          // tamanho da prévia: 480 px na janela; na tela cheia, o maior 16:9 (ou a proporção do programa) que couber
          const sizePv = () => {
            const ar = fmt === 'v' ? 9 / 16 : comp.W / comp.H || 16 / 9;
            if (isFs()) {
              let w = innerWidth;
              let h = innerHeight;
              if (w / h > ar) w = h * ar;
              else h = w / ar;
              const dpr = Math.min(2, devicePixelRatio || 1);
              pv.style.width = Math.floor(w) + 'px';
              pv.style.height = Math.floor(h) + 'px';
              pv.width = Math.round(Math.min(1920, w * dpr));
              pv.height = Math.round(pv.width / ar);
            } else {
              pv.style.width = pv.style.height = '';
              // vertical: 270x480 (a caixa da prévia limita a altura pelo CSS)
              pv.width = fmt === 'v' ? 270 : 480;
              pv.height = Math.round(pv.width / ar);
            }
          };
          const toggleFs = async () => {
            try {
              if (isFs()) await document.exitFullscreen();
              else await pvWrap.requestFullscreen();
            } catch (e) {
              toast('Tela cheia indisponível: ' + e.message, 'err');
            }
          };
          const onFsChange = () => {
            sizePv();
            syncTools();
            if (isFs()) pv.focus();
            else if (pendingRender) {
              pendingRender = false;
              render();
            }
          };
          const onResize = () => isFs() && sizePv();
          // Esc na tela cheia só sai da tela cheia: não pode chegar ao modal (que fecharia a janela inteira)
          const onEscCapture = (e) => {
            if (e.key === 'Escape' && isFs()) e.stopPropagation();
          };
          document.addEventListener('fullscreenchange', onFsChange);
          window.addEventListener('resize', onResize);
          window.addEventListener('keydown', onEscCapture, true);
          $('[data-fs-exit]', pvWrap).onclick = () => document.exitFullscreen().catch(() => {});
          $('[data-fs-int]', pvWrap).onclick = () => setInteract(!interact);
          pv.ondblclick = (e) => !interact && !e.altKey && (e.preventDefault(), toggleFs());

          // ---------- Alt + arrastar a borda: corta como no OBS ----------
          // a conta usa a imagem inteira sem ampliar (com "ampliar" ligado a borda visível mudaria de lugar durante o arraste)
          let cropDrag = null;
          const fullBox = () => {
            const cfg = drawCfg(cfgs()[tab]);
            const src = sourceImage(tab, cfg, comp);
            if (!src) return null;
            const r = layerRect(cfg, cfg.rect);
            const W = pv.width;
            const H = pv.height;
            const g = placeCropped({ ...cfg, crop: { l: 0, t: 0, r: 0, b: 0 } }, src, r.x * W, r.y * H, r.w * W, r.h * H);
            return { x: g.dx, y: g.dy, w: g.dw, h: g.dh };
          };
          const canvasPt = (e) => {
            const b = pv.getBoundingClientRect();
            return { x: ((e.clientX - b.left) / b.width) * pv.width, y: ((e.clientY - b.top) / b.height) * pv.height, k: pv.width / b.width };
          };
          pv.addEventListener('pointerdown', (e) => {
            if (interact || !e.altKey || e.button !== 0) return;
            const cfg = drawCfg(cfgs()[tab]);
            if (cfg.crop.fill) return toast('Desligue "Ampliar o recorte" para cortar arrastando a borda.', '');
            const fb = fullBox();
            if (!fb) return;
            const p = canvasPt(e);
            const c = cfg.crop;
            // bordas visíveis (parte não cortada) e a mais próxima do ponteiro
            const ed = { l: fb.x + c.l * fb.w, r: fb.x + (1 - c.r) * fb.w, t: fb.y + c.t * fb.h, b: fb.y + (1 - c.b) * fb.h };
            const tol = 14 * p.k;
            const near = [
              ['l', Math.abs(p.x - ed.l), p.y >= ed.t - tol && p.y <= ed.b + tol],
              ['r', Math.abs(p.x - ed.r), p.y >= ed.t - tol && p.y <= ed.b + tol],
              ['t', Math.abs(p.y - ed.t), p.x >= ed.l - tol && p.x <= ed.r + tol],
              ['b', Math.abs(p.y - ed.b), p.x >= ed.l - tol && p.x <= ed.r + tol],
            ]
              .filter(([, d, ok]) => ok && d <= tol)
              .sort((a, b) => a[1] - b[1]);
            if (!near.length) return;
            e.preventDefault();
            pv.setPointerCapture?.(e.pointerId);
            cropDrag = { side: near[0][0], fb };
          });
          pv.addEventListener('pointermove', (e) => {
            if (!cropDrag) return;
            const { side, fb } = cropDrag;
            const p = canvasPt(e);
            const fx = (p.x - fb.x) / fb.w;
            const fy = (p.y - fb.y) / fb.h;
            const v = side === 'l' ? fx : side === 'r' ? 1 - fx : side === 't' ? fy : 1 - fy;
            putG({ crop: { ...G().crop, [side]: Math.round(clamp(v, 0, 0.95) * 1000) / 1000 } });
            syncCropUi();
          });
          const endCropDrag = () => {
            if (!cropDrag) return;
            cropDrag = null;
            save(tab);
            syncCropUi();
          };
          pv.addEventListener('pointerup', endCropDrag);
          pv.addEventListener('pointercancel', endCropDrag);
          // cursor de corte com Alt sobre a prévia
          pv.addEventListener('pointermove', (e) => {
            if (!interact) pv.style.cursor = cropDrag || e.altKey ? 'crosshair' : '';
          });
          // sliders, resumo e botão Zerar acompanham o corte (arraste ou valor novo) sem reconstruir o formulário
          const syncCropUi = () => {
            const c = G();
            for (const k of ['l', 't', 'r', 'b']) {
              const el = $('#dsk-c' + k, body);
              const val = Math.round(c.crop[k] * 1000) / 10;
              if (el && +el.value !== val) el.value = val;
              const lb = $(`[data-v="dsk-c${k}"]`, body);
              if (lb) lb.textContent = val;
            }
            const sum = $('#dsk-crop-sum', body);
            if (sum) sum.textContent = cropSummary(c);
            const rs = $('#dsk-creset', body);
            if (rs) rs.disabled = !hasCrop(c);
            // cortou arrastando na prévia: abre a seção para mostrar os valores
            const box = $('#dsk-crop', body);
            if (box && hasCrop(c) && !box.open) box.open = cropOpen = true;
          };

          // ---------- modo interativo: mouse/teclado da prévia → página no navegador sem janela ----------
          // evento aninhado: ele tem type/key próprios (tecla), que não podem colidir com os da mensagem
          const sendIn = (ev) => {
            if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'input', slot: keyOf(tab), ev }));
          };
          const mods = (e) => ({ alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey });
          // ponto da prévia → coordenada da página, pela mesma conta do desenho (vale para horizontal e vertical, com ou
          // sem corte/ampliação): só a parte visível aceita clique
          const toPage = (e) => {
            const ps = st[tab].status;
            if (!ps?.width) return null;
            const cfg = drawCfg(cfgs()[tab]);
            const src = sourceImage(tab, cfg, comp);
            if (!src) return null;
            const p = canvasPt(e);
            const r = layerRect(cfg, cfg.rect);
            const g = placeCropped(cfg, src, r.x * pv.width, r.y * pv.height, r.w * pv.width, r.h * pv.height);
            if (g.dw < 1 || g.dh < 1) return null;
            const fu = (p.x - g.dx) / g.dw;
            const fv = (p.y - g.dy) / g.dh;
            const inside = fu >= 0 && fu <= 1 && fv >= 0 && fv <= 1;
            return { x: (g.c.l + fu * g.fw) * ps.width, y: (g.c.t + fv * g.fh) * ps.height, inside };
          };
          const BTN = ['left', 'middle', 'right'];
          // pointerdown não traz e.detail: conta os cliques (duplo/triplo clique seleciona texto na página)
          let clicks = { n: 0, t: 0, x: 0, y: 0 };
          let down = null;
          pv.addEventListener('pointerdown', (e) => {
            if (!interact) return;
            const p = toPage(e);
            if (!p?.inside) return;
            e.preventDefault();
            pv.focus();
            pv.setPointerCapture?.(e.pointerId);
            const now = performance.now();
            const near = Math.abs(e.clientX - clicks.x) < 6 && Math.abs(e.clientY - clicks.y) < 6;
            clicks = { n: now - clicks.t < 450 && near ? Math.min(3, clicks.n + 1) : 1, t: now, x: e.clientX, y: e.clientY };
            down = BTN[e.button] || 'left';
            sendIn({ kind: 'mouse', type: 'mousePressed', x: p.x, y: p.y, button: down, buttons: e.buttons, clickCount: clicks.n, mods: mods(e) });
          });
          pv.addEventListener('pointerup', (e) => {
            if (!interact || !down) return;
            const p = toPage(e);
            if (p) sendIn({ kind: 'mouse', type: 'mouseReleased', x: p.x, y: p.y, button: down, buttons: e.buttons, clickCount: clicks.n, mods: mods(e) });
            down = null;
          });
          // movimento: no máximo um por quadro (hover de menus e arrastar)
          let moveEv = null;
          let moveRaf = 0;
          pv.addEventListener('pointermove', (e) => {
            if (!interact) return;
            moveEv = e;
            moveRaf ||= requestAnimationFrame(() => {
              moveRaf = 0;
              const ev = moveEv;
              const p = ev && toPage(ev);
              if (!p || (!p.inside && !down)) return;
              sendIn({ kind: 'mouse', type: 'mouseMoved', x: p.x, y: p.y, button: down || 'none', buttons: ev.buttons, mods: mods(ev) });
            });
          });
          pv.addEventListener(
            'wheel',
            (e) => {
              if (!interact) return;
              const p = toPage(e);
              if (!p?.inside) return;
              e.preventDefault();
              const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1;
              sendIn({ kind: 'mouse', type: 'mouseWheel', x: p.x, y: p.y, deltaX: e.deltaX * k, deltaY: e.deltaY * k, mods: mods(e) });
            },
            { passive: false },
          );
          pv.addEventListener('contextmenu', (e) => interact && e.preventDefault());
          // Ctrl+V: o texto vem pelo evento paste (ou pela área de transferência, se o paste não disparar) e entra de uma vez
          let pasteArmed = false;
          pv.addEventListener('paste', (e) => {
            if (!interact) return;
            pasteArmed = false;
            e.preventDefault();
            const t = e.clipboardData?.getData('text');
            if (t) sendIn({ kind: 'text', text: t });
          });
          const onKey = (e) => {
            if (!interact) return;
            if (e.key === 'Escape' && isFs()) return; // Esc sai da tela cheia
            // as teclas são da página: atalhos do estúdio (corte, espaço, Esc do modal) não podem disparar
            e.stopPropagation();
            if (e.key === 'Dead' || e.key === 'Process') return; // acento: a letra já acentuada vem na tecla seguinte
            if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'v') {
              if (e.type === 'keydown') {
                pasteArmed = true;
                setTimeout(() => {
                  if (!pasteArmed) return;
                  pasteArmed = false;
                  navigator.clipboard
                    ?.readText?.()
                    .then((t) => t && sendIn({ kind: 'text', text: t }))
                    .catch(() => {});
                }, 150);
              }
              return; // sem preventDefault: é ele que faz o navegador disparar o paste
            }
            e.preventDefault();
            // AltGr (Ctrl+Alt no Windows) também produz caractere: §, º, ª, /, ?
            const printable = e.key.length === 1 && (!(e.ctrlKey || e.metaKey) || (e.ctrlKey && e.altKey));
            const base = { kind: 'key', key: e.key, code: e.code, keyCode: e.keyCode, location: e.location, repeat: e.repeat, mods: printable ? { shift: e.shiftKey } : mods(e) };
            if (e.type === 'keyup') return sendIn({ ...base, type: 'keyUp' });
            const text = printable ? e.key : e.key === 'Enter' ? '\r' : '';
            sendIn({ ...base, type: text ? 'keyDown' : 'rawKeyDown', text });
          };
          pv.addEventListener('keydown', onKey);
          pv.addEventListener('keyup', onKey);
          cleanup = () => {
            document.removeEventListener('fullscreenchange', onFsChange);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('keydown', onEscCapture, true);
            if (isFs()) document.exitFullscreen().catch(() => {});
          };
          const status = () => {
            const el = $('#dsk-status', body);
            if (!el) return;
            const s = st[tab].status;
            const c = cfgs()[tab];
            el.className = 'dsk-status' + (s?.error ? ' err' : '');
            el.textContent = !urlSupported
              ? 'Páginas web no DSK só funcionam no CastDeck do computador.'
              : s?.error
                ? s.error
                : s?.url && c.url
                  ? `${s.ready ? 'Carregada' : 'Carregando…'} · ${s.width}×${s.height} · ${s.fps || 0} qps${s.audio ? ' · 🔊 com som' : ''}${browserName ? ' · ' + browserName : ''}`
                  : 'A página é aberta num navegador sem janela (Edge/Chrome) com fundo transparente.';
          };
          // re-render leve quando chega status pelo WS (não reconstrói o formulário enquanto o usuário digita)
          cfgOpen = (light) => (light ? status() : m.isConnected && render());
          const set = (patch, opts) => {
            Object.assign(S.brand.dsk[tab], patch);
            save(tab, opts);
          };
          const bind = () => {
            for (const b of $$('[data-src]', body))
              b.onclick = () => {
                const was = cfgs()[tab].src;
                set({ src: b.dataset.src }, { resync: true });
                if (was !== b.dataset.src && st[tab].on) toggle(tab, { on: false, cut: true });
                render();
              };
            const url = $('#dsk-url', body);
            if (url) {
              const apply = () => {
                let v = url.value.trim();
                if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
                url.value = v;
                if (v === cfgs()[tab].url) return sync(tab, { force: true });
                set({ url: v }, { resync: true });
                render();
              };
              // nunca `onkeydown = (e) => cond && acao()`: o false devolvido cancela a tecla e nada é digitado
              url.onkeydown = (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  apply();
                }
              };
              $('#dsk-load', body).onclick = apply;
              $('#dsk-reload', body).onclick = () => reload(tab);
              $('#dsk-opaque', body).onchange = (e) => set({ opaque: e.target.checked }, { resync: true });
              $('#dsk-fps', body).onchange = (e) => set({ fps: +e.target.value }, { resync: true });
              $('#dsk-quality', body)?.addEventListener('change', (e) => set({ quality: +e.target.value }, { resync: true }));
            }
            // ---------- galeria de imagens do overlay ----------
            const imgFile = $('#dsk-img-file', body);
            if (imgFile) {
              const addBtn = $('#dsk-img-add', body);
              addBtn.onclick = () => imgFile.click();
              imgFile.onchange = async () => {
                const files = [...imgFile.files];
                imgFile.value = '';
                if (!files.length) return;
                addBtn.disabled = true;
                addBtn.textContent = 'Enviando…';
                try {
                  const cur = cfgs()[tab];
                  const images = [...cur.images];
                  let firstNew = images.length;
                  for (const f of files) {
                    if (!/^image\/(png|jpeg|webp|gif)$/i.test(f.type)) {
                      toast(`${f.name}: use PNG, JPEG, WebP ou GIF`, 'err');
                      continue;
                    }
                    if (f.size > 25 * 1024 * 1024) {
                      toast(`${f.name}: maior que 25 MB`, 'err');
                      continue;
                    }
                    const r = await fetch(`/api/dsk/assets?name=${encodeURIComponent(f.name)}`, {
                      method: 'POST',
                      headers: { 'Content-Type': f.type },
                      body: f,
                    });
                    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
                    const a = await r.json();
                    images.push({ id: a.id, name: a.name || f.name, url: a.url });
                  }
                  set({ images, imgIndex: firstNew < images.length ? firstNew : cur.imgIndex }, { resync: true });
                  toast(`${images.length} imagem(ns) no overlay`, 'ok');
                } catch (e) {
                  toast('Falha ao enviar imagem: ' + e.message, 'err');
                } finally {
                  addBtn.disabled = false;
                  addBtn.textContent = '＋ Imagens';
                  render();
                }
              };
              for (const it of $$('.dsk-thumb', body)) {
                const k = +it.dataset.imgK;
                const pick = () => setImage(tab, k, { save: true });
                it.onclick = (e) => {
                  if (e.target.closest?.('[data-img-del]')) return;
                  pick();
                };
                it.onkeydown = (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pick();
                  }
                };
                const del = it.querySelector('[data-img-del]');
                if (del) del.onclick = async (e) => {
                  e.stopPropagation();
                  const cur = cfgs()[tab];
                  const img = cur.images[k];
                  if (!img) return;
                  const images = cur.images.filter((_, n) => n !== k);
                  const imgIndex = images.length ? Math.min(cur.imgIndex, images.length - 1) : 0;
                  set({ images, imgIndex }, { resync: true });
                  fetch(`/api/dsk/assets/${encodeURIComponent(img.url.split('/').pop())}`, { method: 'DELETE' }).catch(() => {});
                  render();
                };
              }
              $('#dsk-img-prev', body).onclick = () => setImage(tab, cfgs()[tab].imgIndex - 1, { save: true });
              $('#dsk-img-next', body).onclick = () => setImage(tab, cfgs()[tab].imgIndex + 1, { save: true });
              $('#dsk-img-auto', body).onchange = (e) => { set({ imgAuto: e.target.checked }); render(); };
              $('#dsk-img-ms', body).onchange = (e) => set({ imgAutoMs: +e.target.value });
            }
            const srcSel = $('#dsk-source', body);
            if (srcSel)
              srcSel.onchange = () => {
                const was = cfgs()[tab].sourceId;
                set({ sourceId: srcSel.value });
                if (st[tab].on) onChange?.({ i: tab, on: true, sourceId: srcSel.value, prev: was });
                render();
              };
            $('#dsk-blend', body).onchange = (e) => (set({ blend: e.target.value }), render());
            const num = (id, fn) => {
              const el = $('#' + id, body);
              if (!el) return;
              el.oninput = () => {
                const b = $(`[data-v="${id}"]`, body);
                if (b) b.textContent = el.value;
                fn(+el.value);
              };
            };
            const c = () => cfgs()[tab];
            num('dsk-lo', (v) => set({ luma: { ...c().luma, lo: v } }));
            num('dsk-soft', (v) => set({ luma: { ...c().luma, soft: v } }));
            num('dsk-sim', (v) => set({ chroma: { ...c().chroma, sim: v } }));
            num('dsk-smo', (v) => set({ chroma: { ...c().chroma, smooth: v } }));
            num('dsk-op', (v) => set({ opacity: v }));
            const inv = $('#dsk-inv', body);
            if (inv) inv.onchange = () => set({ luma: { ...c().luma, invert: inv.checked } });
            const key = $('#dsk-key', body);
            if (key) key.oninput = () => set({ chroma: { ...c().chroma, color: key.value } });
            $('#dsk-fade', body).onchange = (e) => set({ fadeMs: +e.target.value });
            const pageMode = $('#dsk-page-mode', body);
            if (pageMode)
              pageMode.onchange = () => {
                set({ page: { ...c().page, mode: pageMode.value } }, { resync: true });
                render();
              };
            const pageSize = $('#dsk-page-size', body);
            if (pageSize)
              pageSize.onchange = () => {
                const [width, height] = pageSize.value.split('x').map(Number);
                set({ page: { ...c().page, width, height } }, { resync: true });
                render();
              };
            const pageFit = $('#dsk-page-fit', body);
            if (pageFit) pageFit.onchange = () => set({ page: { ...c().page, fit: pageFit.value } });
            $('#dsk-pos', body).onchange = (e) => {
              const pos = e.target.value;
              putG({ pos, rect: pos === 'custom' ? { ...G().rect } : { ...POS[pos][1] } });
              // só a área do horizontal muda o tamanho da página aberta no servidor
              save(tab, { resync: fmt === 'h' });
              render();
            };
            // área personalizada: a página web é recarregada no tamanho novo só quando o usuário solta o controle
            for (const k of ['x', 'y', 'w', 'h']) {
              num('dsk-' + k, (v) => putG({ rect: { ...G().rect, [k]: v / 100 } }));
              const el = $('#dsk-' + k, body);
              if (el) el.onchange = () => save(tab, { resync: fmt === 'h' });
            }
            for (const [id, key] of [['dsk-zoom', 'zoom'], ['dsk-px', 'x'], ['dsk-py', 'y']]) {
              num(id, (v) => putG({ [key]: v / 100 }));
              const el = $('#' + id, body);
              if (el) el.onchange = () => save(tab);
            }
            $('#dsk-air', body).onclick = () => (toggle(tab), render());
            $('#dsk-interact', body).onclick = () => setInteract(!interact);
            $('#dsk-fs', body).onclick = toggleFs;
            // corte: os sliders mexem ao vivo; salva quando solta (não grava o estúdio a cada pixel)
            const cropBox = $('#dsk-crop', body);
            cropBox.ontoggle = () => (cropOpen = cropBox.open);
            for (const k of ['l', 't', 'r', 'b']) {
              const el = $('#dsk-c' + k, body);
              el.oninput = () => {
                putG({ crop: { ...G().crop, [k]: +el.value / 100 } });
                syncCropUi();
              };
              el.onchange = () => save(tab);
            }
            $('#dsk-cfill', body).onchange = (e) => {
              putG({ crop: { ...G().crop, fill: e.target.checked } });
              save(tab);
              syncCropUi();
            };
            $('#dsk-creset', body).onclick = () => {
              putG({ crop: { l: 0, t: 0, r: 0, b: 0, fill: G().crop.fill } });
              save(tab);
              syncCropUi();
            };
            // liga/desliga: desligar tira do ar (corte seco) e fecha a página; ligar reabre
            $('#dsk-power', body).onchange = (e) => {
              const on = e.target.checked;
              if (!on && st[tab].on) toggle(tab, { on: false, cut: true });
              if (!on) interact = false;
              S.brand.dsk[tab] = normCfg({ ...c(), power: on });
              save(tab, { resync: true });
              render();
            };
            for (const b of $$('[data-fmt]', body))
              b.onclick = () => {
                if (fmt === b.dataset.fmt) return;
                fmt = b.dataset.fmt;
                interact = false;
                sizePv();
                render();
              };
            const von = $('#dsk-von', body);
            if (von)
              von.onchange = () => {
                S.brand.dsk[tab] = normCfg({ ...c(), vert: { ...c().vert, on: von.checked } });
                save(tab);
                render();
              };
            const vcopy = $('#dsk-vcopy', body);
            if (vcopy)
              vcopy.onclick = () => {
                const h = c();
                S.brand.dsk[tab] = normCfg({ ...h, vert: { ...h.vert, pos: h.pos, rect: { ...h.rect }, zoom: h.zoom, x: h.x, y: h.y, crop: { ...h.crop } } });
                save(tab);
                render();
              };
            $('#dsk-clear', body).onclick = () => {
              if (st[tab].on) toggle(tab, { on: false, cut: true });
              S.brand.dsk[tab] = defCfg();
              save(tab, { resync: true });
              render();
            };
          };
          for (const b of $$('.dsk-tab', m))
            b.onclick = () => {
              tab = +b.dataset.t;
              interact = false;
              render();
            };
          // prévia: só esta camada, nível cheio, sobre xadrez (mostra o que fica transparente)
          const pctx = pv.getContext('2d');
          const loop = () => {
            if (!m.isConnected) return;
            raf = requestAnimationFrame(loop);
            const W = pv.width;
            const H = pv.height;
            const sq = Math.max(15, Math.round(W / 32)); // na tela cheia o xadrez cresce junto (e custa menos)
            for (let y = 0; y < H; y += sq) for (let x = 0; x < W; x += sq) {
              pctx.fillStyle = ((x + y) / sq) % 2 ? '#3a3a46' : '#25252e';
              pctx.fillRect(x, y, sq, sq);
            }
            const cfg = drawCfg(cfgs()[tab]);
            const r = layerRect(cfg, cfg.rect);
            pctx.strokeStyle = 'rgba(255,255,255,.35)';
            pctx.setLineDash([4, 4]);
            pctx.strokeRect(r.x * W + 0.5, r.y * H + 0.5, r.w * W - 1, r.h * H - 1);
            pctx.setLineDash([]);
            // interagindo: página com opacidade cheia, para enxergar bem onde clicar
            const now = performance.now();
            if (!cfg.power) {
              pctx.fillStyle = 'rgba(10,10,16,.6)';
              pctx.fillRect(0, 0, W, H);
              pctx.fillStyle = '#c9c9d6';
              pctx.font = `600 ${Math.round(W / 22)}px Inter, system-ui, sans-serif`;
              pctx.textAlign = 'center';
              pctx.fillText('⏻ DSK desligado', W / 2, H / 2);
              pctx.textAlign = 'start';
              return;
            }
            // cortado e sem ampliar: a imagem inteira aparece bem fraca por baixo (referência do que foi cortado)
            if (hasCrop(cfg) && !cfg.crop.fill && !interact) drawSlot(pctx, W, H, comp, tab, 0.18, now, { ...cfg, crop: { l: 0, t: 0, r: 0, b: 0, fill: false } });
            drawSlot(pctx, W, H, comp, tab, interact ? 1 : cfg.opacity / 100, now, cfg);
          };
          sizePv();
          render();
          loop();
        },
      },
    );
    cleanup();
    cancelAnimationFrame(raf);
    previewSlot = -1;
    cfgOpen = null;
  }

  // ---------- início ----------
  if (!isAndroid) {
    api('/dsk')
      .then((r) => {
        browserName = r?.browser || '';
        if (r && r.available === false) {
          for (let i = 0; i < N; i++) if (cfgs()[i].src === 'url' && cfgs()[i].url) st[i].status = { error: 'Nenhum Edge/Chrome encontrado neste computador para abrir a página.' };
        }
        connect();
      })
      .catch((e) => {
        if (e.status === 404) urlSupported = false;
        else connect();
      });
    // o tamanho do programa (preset) pode mudar: a página acompanha a área do DSK
    setInterval(() => ws?.readyState === 1 && sync(), 3000);
  }

  // configura por código (testes e futuros controles remotos): mesma validação da janela
  function setConfig(i, patch = {}) {
    S.brand.dsk[i] = normCfg({ ...cfgs()[i], ...patch });
    save(i, { resync: true });
    return S.brand.dsk[i];
  }
  const status = (i) => st[i].status;

  return { toggle, isOn, uses, airIds, renderDeck, openConfig, level, bus, setConfig, status };
}
