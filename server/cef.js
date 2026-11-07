// BrowserHost CEF local (Windows): sobe o helper CEF shared-texture e entrega
// quadros JPEG pelo WebSocket /cef, no mesmo formato de frame do /dsk.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export class CefBrowserHost {
  constructor({ root }) {
    this.root = root;
    this.sessions = new Map();
    this.clients = new Set();
    this.exe = this.findExe();
  }

  findExe() {
    const candidates = [
      process.env.CASTDECK_CEF,
      process.env.CASTDECK_EXE ? path.join(path.dirname(process.env.CASTDECK_EXE), 'browser-host-cef', 'browser-host-cef.exe') : '',
      path.join(path.dirname(process.execPath), 'browser-host-cef', 'browser-host-cef.exe'),
      path.join(this.root, 'native', 'browser-host-cef', 'bin', 'Release', 'net8.0-windows', 'win-x64', 'browser-host-cef.exe'),
      path.join(this.root, 'resources', 'browser-host-cef', 'browser-host-cef.exe'),
    ].filter(Boolean);
    return candidates.find((p) => existsSync(p)) || '';
  }

  get available() {
    return process.platform === 'win32' && !!this.exe;
  }

  info() {
    return { available: this.available, helper: this.exe ? path.basename(this.exe) : null, platform: process.platform };
  }

  attach(ws) {
    if (!this.available) {
      try { ws.close(1011, 'CEF indisponível'); } catch {}
      return;
    }
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      try {
        const m = JSON.parse(String(data));
        if (m?.type !== 'input' || !m.key || !m.ev) return;
        const s = this.sessions.get(m.key);
        if (s && s.proc.stdin.writable) s.proc.stdin.write(JSON.stringify(m.ev) + '\n');
      } catch {}
    });
    for (const [key, s] of this.sessions) {
      try { ws.send(JSON.stringify({ type: 'status', key, ready: !!s.proc, url: s.url })); } catch {}
    }
  }

  async set(key, { url, width, height, fps = 60, lang = 'pt-BR', adblock = true }) {
    if (!this.available) throw Object.assign(new Error('CEF indisponível neste sistema'), { status: 400 });
    await this.stop(key);
    const w = Math.max(320, Math.min(3840, Number(width) || 1280));
    const h = Math.max(180, Math.min(2160, Number(height) || 720));
    const f = Math.max(5, Math.min(60, Number(fps) || 60));
    const locale = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(String(lang || '')) ? String(lang) : 'pt-BR';
    const block = adblock === false || adblock === 0 || adblock === '0' ? '0' : '1';
    const proc = spawn(this.exe, ['--shared-pipe', String(url), String(w), String(h), String(f), locale, block], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const session = { proc, key, url, width: w, height: h, fps: f, adblock: block === '1', buf: Buffer.alloc(0), ready: false };
    this.sessions.set(key, session);
    proc.stdout.on('data', (chunk) => this.read(session, chunk));
    proc.stderr.on('data', (chunk) => {
      const line = chunk.toString('utf8').trim();
      if (line && !/GetGpuDriverOverlayInfo|external_registry_loader|account_consistency/.test(line)) {
        console.error(`[cef ${key}] ${line.slice(0, 300)}`);
      }
    });
    proc.on('exit', (code) => {
      if (this.sessions.get(key) === session) this.sessions.delete(key);
      this.broadcastText({ type: 'status', key, ready: false, error: code ? `CEF saiu (${code})` : null });
    });
    proc.on('error', (e) => {
      this.sessions.delete(key);
      this.broadcastText({ type: 'status', key, ready: false, error: e.message });
    });
    this.broadcastText({ type: 'status', key, ready: true, url });
    return { key, url, width: w, height: h, fps: f, adblock: block === '1' };
  }

  read(session, chunk) {
    session.buf = session.buf.length ? Buffer.concat([session.buf, chunk]) : chunk;
    while (session.buf.length >= 5) {
      const type = session.buf[0];
      const n = session.buf.readUInt32LE(1);
      if (n <= 0 || n > 8 * 1024 * 1024) { session.buf = Buffer.alloc(0); return; }
      if (session.buf.length < 5 + n) return;
      const payload = session.buf.subarray(5, 5 + n);
      session.buf = session.buf.subarray(5 + n);
      if (type === 1) {
        session.ready = true;
        this.broadcastFrame(session.key, payload);
      } else if (type === 0) {
        this.broadcastAudio(session.key, payload);
      }
    }
  }

  frame(key, jpeg) {
    const k = Buffer.from(key, 'utf8');
    return Buffer.concat([Buffer.from([k.length]), k, jpeg]);
  }

  broadcastFrame(key, jpeg) {
    if (!this.clients.size) return;
    const frame = this.frame(key, jpeg);
    for (const ws of this.clients) {
      if (ws.readyState === 1) { try { ws.send(frame); } catch {} }
    }
  }

  broadcastAudio(key, pcm) {
    if (!this.clients.size) return;
    const k = Buffer.from(key, 'utf8');
    const frame = Buffer.concat([Buffer.from([0, k.length]), k, pcm]);
    for (const ws of this.clients) {
      if (ws.readyState === 1) { try { ws.send(frame); } catch {} }
    }
  }

  broadcastText(obj) {
    const s = JSON.stringify(obj);
    for (const ws of this.clients) {
      if (ws.readyState === 1) { try { ws.send(s); } catch {} }
    }
  }

  async stop(key) {
    const s = this.sessions.get(key);
    if (!s) return;
    this.sessions.delete(key);
    try { s.proc.stdin.end(); } catch {}
    try { s.proc.kill(); } catch {}
  }

  closeAll() {
    for (const key of [...this.sessions.keys()]) this.stop(key);
    for (const ws of this.clients) { try { ws.close(); } catch {} }
    this.clients.clear();
  }
}
