// Áudio PCM do UVC/UAC para o mixer do CastDeck.
// Recebe blocos PCM (Float32 no thread principal) e reamostra linearmente
// para a taxa do AudioContext (normalmente 48 kHz).
class CastDeckUvcAudio extends AudioWorkletProcessor {
  constructor() {
    super();
    this.q = [];
    this.cur = null;
    this.pos = 0;
    this.channels = 1;
    this.rate = 48000;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (!d || !d.samples || !d.samples.length) return;
      this.q.push(d);
      if (this.q.length > 16) this.q.shift();
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    const frames = out[0].length;
    for (let ch = 0; ch < out.length; ch++) out[ch].fill(0);

    if (!this.cur && this.q.length) {
      const c = this.q.shift();
      if (c) {
        this.cur = c;
        this.pos = 0;
        this.channels = Math.max(1, c.channels || 1);
        this.rate = c.rate || sampleRate;
      }
    }
    if (!this.cur) return true;

    const s = this.cur.samples;
    const chs = this.channels;
    const total = s.length / chs;

    for (let k = 0; k < frames; k++) {
      const idx = Math.floor(this.pos);
      if (idx >= total) {
        this.cur = null;
        this.pos = 0;
        break;
      }
      const frac = this.pos - idx;
      for (let c = 0; c < out.length; c++) {
        const cc = Math.min(c, chs - 1);
        const a = s[idx * chs + cc] || 0;
        const b = idx + 1 < total ? s[(idx + 1) * chs + cc] || 0 : a;
        out[c][k] = a + (b - a) * frac;
      }
      this.pos += this.rate / sampleRate;
    }
    return true;
  }
}
registerProcessor('castdeck-uvc-audio', CastDeckUvcAudio);
