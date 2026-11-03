// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Redução de ruído por canal (RNNoise compilado em WebAssembly), rodando num AudioWorklet.
// Mono, quadros de 480 amostras a 48 kHz (latência fixa de 10 ms).
// "amount" (0..1) mistura o sinal limpo com o original DENTRO do mesmo quadro: não há defasagem
// entre os dois (seria um filtro pente se a mistura fosse feita fora, com atrasos diferentes).
const FRAME = 480;

class DenoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions || {};
    this.amount = o.amount ?? 1;
    this.prevAmount = this.amount;
    this.active = o.active !== false;
    let ex = null;
    const inst = new WebAssembly.Instance(new WebAssembly.Module(o.wasm), {
      a: {
        // emscripten_resize_heap
        a: (req) => {
          try {
            const mem = ex.c;
            const need = (req >>> 0) - mem.buffer.byteLength;
            if (need > 0) mem.grow(Math.ceil(need / 65536));
            return 1;
          } catch {
            return 0;
          }
        },
        // emscripten_memcpy_big
        b: (dest, src, num) => new Uint8Array(ex.c.buffer).copyWithin(dest, src, src + num),
      },
    });
    ex = inst.exports;
    ex.d(); // construtores
    this.ex = ex;
    this.state = ex.f(0); // rnnoise_create(modelo padrão)
    this.ptr = ex.g(FRAME * 4); // malloc
    this.inBuf = new Float32Array(FRAME);
    this.outBuf = new Float32Array(FRAME);
    this.pos = 0;
    this.vad = 0;
    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (typeof d.amount === 'number') this.amount = Math.max(0, Math.min(1, d.amount));
      if (typeof d.active === 'boolean') this.active = d.active;
    };
  }

  frame() {
    const { ex, inBuf, outBuf } = this;
    const a0 = this.active ? this.prevAmount : 0;
    const a1 = this.active ? this.amount : 0;
    this.prevAmount = this.active ? this.amount : 0;
    if (a0 === 0 && a1 === 0) {
      outBuf.set(inBuf); // desligado: só o atraso fixo (troca sem estalo)
      return;
    }
    const heap = new Float32Array(ex.c.buffer);
    const base = this.ptr >> 2;
    for (let i = 0; i < FRAME; i++) heap[base + i] = inBuf[i] * 32768;
    this.vad = ex.j(this.state, this.ptr, this.ptr); // rnnoise_process_frame(estado, saída, entrada)
    for (let i = 0; i < FRAME; i++) {
      const a = a0 + ((a1 - a0) * i) / FRAME; // rampa: mudanças de intensidade sem estalos
      outBuf[i] = (heap[base + i] / 32768) * a + inBuf[i] * (1 - a);
    }
  }

  process(inputs, outputs) {
    const inp = inputs[0] && inputs[0][0];
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const n = out.length;
    for (let i = 0; i < n; i++) {
      this.inBuf[this.pos] = inp ? inp[i] : 0;
      out[i] = this.outBuf[this.pos];
      if (++this.pos === FRAME) {
        this.frame();
        this.pos = 0;
      }
    }
    return true;
  }
}

registerProcessor('castdeck-denoise', DenoiseProcessor);
