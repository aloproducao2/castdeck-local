// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// AudioWorklet da legenda ao vivo: recebe o captionBus (mono, taxa do AudioContext, normalmente 48 kHz),
// reduz para 16 kHz (filtro passa-baixa simples + decimação) e entrega blocos de ~100 ms em PCM int16
// para a página mandar ao servidor (que repassa ao worker de reconhecimento).
class CaptionTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0; // posição fracionária na entrada (permite 44,1 kHz também)
    this.acc = 0;
    this.n = 0;
    this.out = new Int16Array(1600);
    this.k = 0;
    this.on = true;
    this.port.onmessage = (e) => {
      if (typeof e.data?.on === 'boolean') this.on = e.data.on;
    };
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!this.on) return true;
    const len = ch ? ch.length : 128;
    for (let i = 0; i < len; i++) {
      // média das amostras que caem em cada amostra de saída: corta o que passaria de 8 kHz (evita aliasing grosseiro)
      this.acc += ch ? ch[i] : 0;
      this.n++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        let v = this.acc / this.n;
        this.acc = 0;
        this.n = 0;
        v = v > 1 ? 1 : v < -1 ? -1 : v;
        this.out[this.k++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.k === this.out.length) {
          this.port.postMessage(this.out.buffer, [this.out.buffer]);
          this.out = new Int16Array(1600);
          this.k = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('castdeck-caption-tap', CaptionTap);

