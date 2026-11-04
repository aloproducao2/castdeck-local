// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Envia o programa (canvas + mixer) ao servidor local via WebSocket, que entrega ao FFmpeg.

const MIME_CANDIDATES = [
  'video/webm;codecs=h264,opus', // codificação por hardware no Chromium, menor uso de CPU
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];
// Acima disso o navegador estaria guardando vídeo demais em memória. Pausa o MediaRecorder
// e retoma quando o WebSocket drenar; o servidor também pausa a leitura do socket.
const MAX_WS_BUFFER = 24 * 1024 * 1024;
const RESUME_WS_BUFFER = 8 * 1024 * 1024;

export function pickMime() {
  return MIME_CANDIDATES.find((m) => window.MediaRecorder?.isTypeSupported(m)) || '';
}

export class Broadcaster extends EventTarget {
  constructor() {
    super();
    this.ws = null;
    this.recorder = null;
    this.active = false;
    this._resumeT = null;
  }

  on(type, fn) {
    this.addEventListener(type, (e) => fn(e.detail));
    return this;
  }
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  start({ studioId, stream, destinationIds, record, preset, presetInfo, encoder, vertical, videoKbps }) {
    return new Promise((resolve, reject) => {
      const mime = pickMime();
      if (!mime) return reject(new Error('Este navegador não suporta MediaRecorder com WebM.'));
      const ws = new WebSocket(`ws://${location.host}/ingest`);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let started = false;

      const targetKbps = videoKbps || presetInfo?.videoKbps;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'start', studioId, destinationIds, record, preset, encoder, mime, vertical: !!vertical, videoKbps: targetKbps }));
      ws.onerror = () => !started && reject(new Error('Não foi possível conectar ao servidor local de transmissão.'));
      ws.onclose = () => {
        this.stopRecorder();
        if (this.active) {
          this.active = false;
          this.emit('ended', this.lastStatus);
        }
      };
      ws.onmessage = (e) => {
        let msg;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        if (msg.type === 'started') {
          started = true;
          this.active = true;
          this.lastStatus = msg;
          this.startRecorder(stream, mime, presetInfo, targetKbps);
          resolve(msg);
        } else if (msg.type === 'status') {
          this.lastStatus = msg;
          this.emit('status', msg);
        } else if (msg.type === 'error') {
          if (!started) reject(new Error(msg.message));
          else this.emit('error', msg.message);
        } else if (msg.type === 'ended') {
          this.lastStatus = msg;
        }
      };
    });
  }

  startRecorder(stream, mimeType, presetInfo, targetKbps) {
    // bitrate alto: é só o "transporte" local até o FFmpeg, que recodifica no bitrate final
    const kbps = targetKbps || presetInfo?.videoKbps || 4500;
    const vbps = Math.max(10_000_000, kbps * 1000 * 1.5);
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: vbps, audioBitsPerSecond: 192_000 });
    this.recorder = rec;
    rec.ondataavailable = (e) => {
      if (!e.data.size || this.ws?.readyState !== 1) return;
      if (this.ws.bufferedAmount > MAX_WS_BUFFER) this._pauseRecorder();
      this.ws.send(e.data); // Blobs são enviados em ordem
    };
    rec.onstop = () => {
      if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'stop' }));
    };
    rec.onerror = (e) => this.emit('error', 'MediaRecorder: ' + (e.error?.message || 'erro'));
    rec.start(200);
  }

  _pauseRecorder() {
    const rec = this.recorder;
    if (!rec || rec.state !== 'recording' || this._resumeT) return;
    try {
      rec.pause();
    } catch {
      return;
    }
    this.emit('error', 'Servidor local não está acompanhando; pausando o envio para não travar.');
    const tick = () => {
      this._resumeT = null;
      if (!this.recorder || this.recorder.state === 'inactive') return;
      if ((this.ws?.bufferedAmount || 0) <= RESUME_WS_BUFFER) {
        try {
          this.recorder.resume();
        } catch {}
        return;
      }
      this._resumeT = setTimeout(tick, 250);
    };
    this._resumeT = setTimeout(tick, 250);
  }

  stopRecorder() {
    clearTimeout(this._resumeT);
    this._resumeT = null;
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        if (this.recorder.state === 'paused') this.recorder.resume();
      } catch {}
      try {
        this.recorder.stop();
      } catch {}
    }
  }

  startRecord() {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'start-record' }));
    }
  }

  stopRecord() {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'stop-record' }));
    }
  }

  startDestinations(destinationIds) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'start-destinations', destinationIds }));
    }
  }

  stopDestinations() {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ type: 'stop-destinations' }));
    }
  }

  stop() {
    if (this.recorder && this.recorder.state !== 'inactive') this.stopRecorder();
    else if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'stop' }));
  }
}
