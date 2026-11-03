// DSK (downstream keyer) por endereço web: uma página renderizada num navegador Chromium sem janela
// (Edge/Chrome já instalado no PC), com fundo transparente, enviada ao estúdio como quadros PNG com alfa.
// É o mesmo princípio da "Browser Source" do OBS: o canvas do programa não consegue desenhar um <iframe>
// (segurança do navegador), então a página precisa virar pixels fora dele.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const IDLE_MS = 30_000; // sem estúdio conectado por 30 s: fecha as páginas e o navegador (não fica gastando CPU à toa)
const AUDIO_BINDING = '__castdeckDskAudio';

// Windows: p.kill() derruba só o processo principal do Edge; GPU/renderer/crashpad podem sobrar segurando o perfil.
// taskkill /T leva a árvore inteira. Síncrono de propósito: também roda no process.on('exit').
function killTree(p) {
  if (!p || p.exitCode !== null) return;
  try {
    if (IS_WIN && p.pid) spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 5000 });
    else p.kill('SIGKILL');
  } catch {}
}

// Roda dentro da página do DSK: captura o áudio da própria aba (getDisplayMedia com preferCurrentTab, aceito sozinho
// pela flag --auto-accept-this-tab-capture) e manda PCM 48 kHz estéreo int16 em base64 pela binding do CDP.
// Captura da aba pega tudo (inclusive <audio> de outro domínio, que o WebAudio devolveria mudo por CORS).
// --mute-audio não serve: com ele a captura chega em silêncio; o som local é cortado por --disable-audio-output e
// suppressLocalAudioPlayback. Trechos em silêncio não são enviados (o estúdio ressincroniza quando volta).
const AUDIO_JS = `(() => {
  if (window.__cdCap || !navigator.mediaDevices?.getDisplayMedia || typeof window.${AUDIO_BINDING} !== 'function') return 'skip';
  window.__cdCap = 1;
  navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { suppressLocalAudioPlayback: true, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude',
  }).then((s) => {
    for (const t of s.getVideoTracks()) t.stop();
    const a = s.getAudioTracks()[0];
    if (!a) return;
    const c = new AudioContext({ sampleRate: 48000 });
    const src = c.createMediaStreamSource(new MediaStream([a]));
    const sp = c.createScriptProcessor(2048, 2, 2);
    const mute = c.createGain();
    mute.gain.value = 0;
    const send = window.${AUDIO_BINDING};
    sp.onaudioprocess = (e) => {
      const ib = e.inputBuffer;
      const L = ib.getChannelData(0);
      const R = ib.numberOfChannels > 1 ? ib.getChannelData(1) : L;
      const n = L.length;
      const out = new Int16Array(n * 2);
      let pk = 0;
      for (let i = 0; i < n; i++) {
        const l = Math.max(-1, Math.min(1, L[i]));
        const r = Math.max(-1, Math.min(1, R[i]));
        const al = l < 0 ? -l : l;
        const ar = r < 0 ? -r : r;
        if (al > pk) pk = al;
        if (ar > pk) pk = ar;
        out[2 * i] = l * 32767;
        out[2 * i + 1] = r * 32767;
      }
      if (pk < 0.0001) return;
      const u8 = new Uint8Array(out.buffer);
      let bin = '';
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      send(btoa(bin));
    };
    src.connect(sp);
    sp.connect(mute);
    mute.connect(c.destination);
    a.onended = () => (window.__cdCap = 0);
  }).catch((e) => {
    window.__cdCap = 0;
    console.warn('[castdeck dsk] áudio', e && e.message);
  });
  return 'ok';
})()`;
// teclas modificadoras no formato do CDP
const MODS = (m) => (m?.alt ? 1 : 0) | (m?.ctrl ? 2 : 0) | (m?.meta ? 4 : 0) | (m?.shift ? 8 : 0);

// Imagens de overlay: guardadas fora do JSON do estúdio (o banco não pode inchar com base64).
// Só formatos raster; SVG é recusado (pode conter script quando aberto fora de <img>).
const IMG_MAX = 25 * 1024 * 1024;
function imageExt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  return null;
}
function safeAssetName(name, ext) {
  const clean = String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 80);
  return clean && clean.toLowerCase().endsWith('.' + ext) ? clean : `${clean || 'imagem'}.${ext}`;
}
// Deduplicação: screencast de página estática repete o mesmo PNG/JPEG centenas de vezes.
// Comparar o buffer inteiro é memcmp (~GB/s): 1,4 MB a 30 qps é ruído perto do encode/WS.
// (A amostragem de 64 bytes falhava em mudanças pequenas — um contador de 8×8 no canto.)
function sameFrame(a, b) {
  return !!(a && b && a.length === b.length && a.equals(b));
}

// Procura um navegador Chromium. CD_BROWSER é o que o CastDeck.exe já usa para abrir a janela do estúdio.
export function findBrowser() {
  const env = process.env.CD_BROWSER;
  if (env && path.isAbsolute(env) && existsSync(env)) return env;
  const list = [];
  if (IS_WIN) {
    const roots = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
    for (const r of roots)
      list.push(
        path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(r, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      );
  } else if (IS_MAC) {
    list.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    );
  } else {
    const dirs = (process.env.PATH || '').split(':').concat(['/usr/bin', '/usr/local/bin', '/snap/bin']);
    for (const b of ['google-chrome', 'google-chrome-stable', 'microsoft-edge', 'microsoft-edge-stable', 'chromium', 'chromium-browser', 'brave-browser'])
      for (const d of dirs) list.push(path.join(d, b));
  }
  return list.find((p) => existsSync(p)) || null;
}

export class DskHost {
  constructor({ dataDir }) {
    this.profile = this.baseProfile = path.join(dataDir, 'dsk-browser');
    this.assetsDir = path.join(dataDir, 'dsk-assets');
    try { mkdirSync(this.assetsDir, { recursive: true }); } catch {}
    this.slots = new Map(); // key -> { key, url, width, height, targetId, sessionId, last, frames, fps, error }
    this.bySession = new Map();
    this.clients = new Set();
    this.proc = null;
    this.ws = null;
    this.starting = null;
    this.lastLaunchError = null;
    this.seq = 0;
    this.pend = new Map();
    this.idleTimer = null;
    this.stopping = false;
    this.fpsTimer = setInterval(() => this.tickFps(), 2000);
    this.fpsTimer.unref?.();
  }

  info() {
    const exe = findBrowser();
    return {
      available: !!exe,
      browser: exe ? path.basename(exe).replace(/\.exe$/i, '') : null,
      running: !!this.ws,
      lastError: this.lastLaunchError || null,
      profile: this.profile,
      slots: [...this.slots.values()].map((s) => this.slotInfo(s)),
    };
  }

  slotInfo(s) {
    return { key: s.key, url: s.url, width: s.width, height: s.height, fps: s.fps || 0, fpsLimit: s.fpsLimit || 30, quality: s.quality || 80, skipped: s.dups || 0, casting: !!s.casting, castError: s.castError || null, audio: this.hasAudio(s), error: s.error || null, ready: !!s.last };
  }

  hasAudio(s) {
    return !!s.audioAt && Date.now() - s.audioAt < 4000;
  }

  // ---------- imagens de overlay (sem navegador/headless) ----------
  saveAsset(buffer, name) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) {
      throw Object.assign(new Error('Imagem vazia'), { status: 400 });
    }
    if (buffer.length > IMG_MAX) {
      throw Object.assign(new Error('Imagem maior que 25 MB'), { status: 413 });
    }
    const ext = imageExt(buffer);
    if (!ext) throw Object.assign(new Error('Formato não suportado (use PNG, JPEG, WebP ou GIF)'), { status: 415 });
    const id = `${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
    const file = `${id}.${ext}`;
    mkdirSync(this.assetsDir, { recursive: true });
    writeFileSync(path.join(this.assetsDir, file), buffer);
    return { id, name: safeAssetName(name, ext), url: `/api/dsk/assets/${file}`, size: buffer.length };
  }

  removeAsset(file) {
    const base = path.basename(String(file || ''));
    if (!/^[\w-]+\.(png|jpe?g|webp|gif)$/i.test(base)) return false;
    try { unlinkSync(path.join(this.assetsDir, base)); return true; } catch { return false; }
  }

  // ---------- navegador ----------
  async ensureBrowser() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      // o anterior ainda fechando segura o perfil: o Edge novo repassaria tudo para ele e sairia na hora
      if (this.closing) await this.closing;
      this.lastLaunchError = null;
      const base = this.baseProfile;
      const temp = path.join(tmpdir(), `castdeck-dsk-${process.pid}-${Date.now().toString(36)}`);
      // Tentativas: perfil normal 2× (a 2ª depois de limpar órfãos), perfil reserva e, por fim, um perfil
      // descartável no TEMP. Assim uma pasta de perfil corrompida/presa não impede usar uma URL no DSK.
      const profiles = [base, base, `${base}-${process.pid}`, temp];
      let last;
      for (let n = 0; n < profiles.length; n++) {
        this.profile = profiles[n];
        await this.killStale();
        await this.killOrphans();
        try {
          await this.launch();
          this.lastLaunchError = null;
          return;
        } catch (e) {
          last = e;
          this.lastLaunchError = e.message;
          // Sem navegador instalado não adianta tentar outro perfil.
          if (e.status === 501) throw e;
          try { this.closeBrowser(true); } catch {}
          await new Promise((r) => setTimeout(r, n === 0 ? 650 : 800));
        }
      }
      throw last;
    })().finally(() => (this.starting = null));
    return this.starting;
  }

  // Rede de segurança quando o CastDeck foi encerrado à força (Gerenciador de Tarefas, queda, atualização) e nenhum
  // handler de saída rodou: procura Edge com o NOSSO perfil (dsk-browser e reservas dsk-browser-<pid>) e encerra.
  // Só roda quando este processo não tem navegador próprio, então tudo que achar é órfão. Depois apaga as reservas.
  async killOrphans() {
    if (this.proc && this.proc.exitCode === null) return;
    if (IS_WIN) {
      const needle = this.baseProfile.replace(/'/g, "''");
      const ps =
        `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe' OR Name='brave.exe'" | ` +
        `Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${needle}') } | ` +
        `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
      await new Promise((res) => {
        const k = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, stdio: 'ignore' });
        const t = setTimeout(() => (k.kill(), res()), 8000);
        k.on('exit', () => (clearTimeout(t), res()));
        k.on('error', () => (clearTimeout(t), res()));
      });
    } else {
      await new Promise((res) => {
        const k = spawn('pkill', ['-f', `--user-data-dir=${this.baseProfile}`], { stdio: 'ignore' });
        k.on('exit', res);
        k.on('error', res);
      });
    }
    // reservas de execuções anteriores (o pid já não existe ou o dono foi encerrado acima)
    try {
      const dir = path.dirname(this.baseProfile);
      const base = path.basename(this.baseProfile);
      for (const n of readdirSync(dir)) {
        if (n.startsWith(base + '-') && n !== `${base}-${process.pid}`) rmSync(path.join(dir, n), { recursive: true, force: true, maxRetries: 2 });
      }
    } catch {}
    try {
      unlinkSync(path.join(this.baseProfile, 'DevToolsActivePort'));
    } catch {}
  }

  // Navegador órfão de uma execução anterior (servidor encerrado à força, atualização, queda) ainda com este
  // perfil aberto: o Edge é instância única por perfil, então o novo sairia sem abrir nada. Fecha pelo próprio
  // DevTools dele (DevToolsActivePort fica no perfil enquanto ele está vivo).
  async killStale() {
    const file = path.join(this.profile, 'DevToolsActivePort');
    let port;
    let wsPath;
    try {
      [port, wsPath] = readFileSync(file, 'utf8').split(/\r?\n/);
    } catch {
      return;
    }
    if (!port || !wsPath) return;
    await new Promise((resolve) => {
      let ws;
      const done = () => {
        try {
          ws?.terminate();
        } catch {}
        resolve();
      };
      const t = setTimeout(done, 1500);
      try {
        ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`, { perMessageDeflate: false });
      } catch {
        clearTimeout(t);
        return resolve();
      }
      ws.on('error', () => (clearTimeout(t), done()));
      ws.once('open', () => {
        ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
        // dá tempo de o processo sair e soltar o perfil
        setTimeout(() => (clearTimeout(t), done()), 1200);
      });
    });
    try {
      unlinkSync(file);
    } catch {}
  }

  launch() {
    const exe = findBrowser();
    if (!exe) return Promise.reject(Object.assign(new Error('Nenhum navegador Chromium (Edge/Chrome) encontrado neste computador.'), { status: 501 }));
    mkdirSync(this.profile, { recursive: true });
    // Um DevToolsActivePort antigo apontaria para um navegador morto: nunca reutiliza.
    try { unlinkSync(path.join(this.profile, 'DevToolsActivePort')); } catch {}
    const args = [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${this.profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      // áudio: a página toca para dentro (captura da aba → estúdio), nunca nas caixas de som do PC.
      // Não usar --mute-audio: com ele a captura da aba chega em silêncio.
      '--disable-audio-output',
      '--auto-accept-this-tab-capture',
      '--hide-scrollbars',
      '--autoplay-policy=no-user-gesture-required',
      // a página precisa continuar animando mesmo sem janela visível
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      // msEdgeStartupBoost + extensões de componente aumentam o tempo de partida e já fizeram o Edge
      // entregar a janela a outra instância e sair antes do DevTools (erro "fechou ao iniciar").
      '--disable-features=Translate,MediaRouter,msEdgeStartupBoost',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      'about:blank',
    ];
    return new Promise((resolve, reject) => {
      const p = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      this.proc = p;
      let buf = '';
      let done = false;
      const fail = (e) => {
        if (done) return;
        done = true;
        reject(e);
      };
      const t = setTimeout(() => {
        fail(new Error('O navegador do DSK não respondeu a tempo.'));
        try {
          p.kill();
        } catch {}
      }, 15000);
      p.stderr.on('error', () => {});
      p.stderr.on('data', (d) => {
        if (done) return;
        buf += d;
        if (buf.length > 20000) buf = buf.slice(-20000);
        const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
        if (!m) return;
        done = true;
        clearTimeout(t);
        this.connect(m[1]).then(resolve, reject);
      });
      p.on('error', (e) => (clearTimeout(t), fail(e)));
      p.on('exit', () => {
        clearTimeout(t);
        if (done) {
          // No Windows o processo inicial do Edge pode sair e deixar o navegador real (outro processo)
          // dono do perfil/DevTools. Se o WebSocket do CDP está de pé, NÃO é queda do navegador.
          if (this.proc !== p) return;
          if (this.ws?.readyState === WebSocket.OPEN) this.proc = null;
          else this.onBrowserGone();
          return;
        }
        // Sem a linha "DevTools listening" no stderr: usa o DevToolsActivePort que o Chromium grava no perfil.
        // Isso acontece quando o processo inicial sai cedo, mas o navegador real continua vivo.
        const fromPort = (n = 0) => {
          let port;
          let wsPath;
          try {
            [port, wsPath] = readFileSync(path.join(this.profile, 'DevToolsActivePort'), 'utf8').split(/\r?\n/);
          } catch {}
          if (port && wsPath) {
            done = true;
            return this.connect(`ws://127.0.0.1:${port}${wsPath}`).then(
              () => {
                if (p.exitCode !== null && this.proc === p) this.proc = null;
                resolve();
              },
              reject,
            );
          }
          if (n < 6) return setTimeout(() => fromPort(n + 1), 120);
          const d = buf.replace(/\s+/g, ' ').trim().slice(-320);
          fail(Object.assign(new Error(`O navegador do DSK fechou ao iniciar.${d ? ' ' + d : ''}`), { earlyExit: true, detail: d }));
        };
        fromPort();
      });
    });
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
      let opened = false;
      ws.once('open', () => {
        opened = true;
        this.ws = ws;
        resolve();
      });
      // ouvinte permanente: sem ele, o ECONNRESET de quando o navegador fecha/cai vira exceção não tratada e
      // derruba o servidor inteiro (foi o que aconteceu no teste com o caption.ninja)
      ws.on('error', (e) => {
        if (!opened) reject(e);
      });
      ws.on('message', (raw) => this.onCdp(raw));
      ws.on('close', () => {
        if (this.ws !== ws) return;
        this.ws = null;
        // conexão perdida com o processo ainda vivo: encerra para o 'exit' reabrir as páginas.
        // Se o processo inicial já saiu (this.proc null), o dono do navegador estava no filho: reabre direto.
        if (this.stopping) return;
        if (this.proc) {
          try {
            this.proc.kill();
          } catch {}
        } else {
          this.onBrowserGone();
        }
      });
    });
  }

  // navegador caiu (ou foi fechado): reabre as páginas que estavam carregadas
  onBrowserGone() {
    this.proc = null;
    this.ws = null;
    for (const [, r] of this.pend) r.reject(new Error('navegador fechado'));
    this.pend.clear();
    this.bySession.clear();
    const keep = [...this.slots.values()];
    for (const s of keep) {
      s.targetId = s.sessionId = null;
      s.casting = false;
      s.lastAt = 0;
      s.pendingFrame = null;
      clearTimeout(s.frameTimer);
      s.frameTimer = null;
    }
    if (this.stopping || !keep.length) return;
    this.restarts = (this.restarts || 0) + 1;
    if (this.restarts > 5) return; // evita laço infinito se a página derruba o navegador
    setTimeout(() => {
      for (const s of keep) if (this.slots.get(s.key) === s) this.set(s.key, { url: s.url, width: s.width, height: s.height, jpeg: s.jpeg, fps: s.fpsLimit, quality: s.quality }, { force: true }).catch(() => {});
    }, 2000);
  }

  send(method, params = {}, sessionId) {
    if (!this.ws) return Promise.reject(new Error('navegador do DSK fechado'));
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pend.set(id, { resolve, reject });
      // o socket pode estar fechando (navegador caindo): send() lançaria fora da promessa
      try {
        this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      } catch (e) {
        this.pend.delete(id);
        reject(e);
      }
    });
  }

  onCdp(raw) {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.id) {
      const p = this.pend.get(m.id);
      if (!p) return;
      this.pend.delete(m.id);
      return m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
    const s = m.sessionId && this.bySession.get(m.sessionId);
    if (!s) return;
    if (m.method === 'Page.screencastFrame') {
      this.send('Page.screencastFrameAck', { sessionId: m.params.sessionId }, s.sessionId).catch(() => {});
      // o screencast entrega o tamanho REAL da janela headless (não o do override): se não bate, a imagem
      // estica e os cliques do estúdio caem no lugar errado. Corrige a janela pela diferença (poucas tentativas).
      const md = m.params.metadata || {};
      if (md.deviceWidth && Date.now() > (s.fitUntil || 0) && (Math.abs(md.deviceWidth - s.width) > 1 || Math.abs(md.deviceHeight - s.height) > 1)) {
        this.fitWindow(s, md.deviceWidth, md.deviceHeight);
      }
      const next = Buffer.from(m.params.data, 'base64');
      const first = !s.last;
      // página parada (relógio sem segundos, overlay fixo): o Chromium reenvia o mesmo bitmap.
      // Não retransmite: economiza encode/WS/decodificação no estúdio.
      if (!first && sameFrame(next, s.last)) {
        s.dups = (s.dups || 0) + 1;
        return;
      }
      // Limite de fps no servidor, sempre guardando o ÚLTIMO quadro: com everyNthFrame>1 uma página
      // estática podia ter o único quadro descartado e o DSK ficava preto. Aqui o quadro final é
      // enviado mesmo que chegue antes do intervalo (só atrasa, nunca desaparece).
      const min = 1000 / (s.fpsLimit || 30);
      const now = Date.now();
      const wait = s.fpsLimit < 60 && s.lastAt ? Math.max(0, min - (now - s.lastAt)) : 0;
      if (wait > 0) {
        s.pendingFrame = next;
        if (!s.frameTimer) {
          s.frameTimer = setTimeout(() => {
            s.frameTimer = null;
            const p = s.pendingFrame;
            s.pendingFrame = null;
            if (!p || !s.sessionId) return;
            if (s.last && sameFrame(p, s.last)) return;
            s.last = p;
            s.lastAt = Date.now();
            s.frames = (s.frames || 0) + 1;
            this.broadcastFrame(s);
          }, wait);
        }
        return;
      }
      s.last = next;
      s.lastAt = now;
      s.frames = (s.frames || 0) + 1;
      if (first) this.broadcastStatus(s);
      this.broadcastFrame(s);
    } else if (m.method === 'Runtime.bindingCalled') {
      if (m.params?.name === AUDIO_BINDING) this.broadcastAudio(s, m.params.payload);
    } else if (m.method === 'Page.domContentEventFired') {
      // cada documento novo perde a captura de áudio do anterior: religa o quanto antes
      this.startAudio(s);
    } else if (m.method === 'Page.loadEventFired') {
      // reforça o fundo transparente depois de cada carregamento (algumas versões zeram ao navegar) e religa o
      // screencast: navegar/recarregar pode trocar o processo da página e o screencast antigo morre junto
      this.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, s.sessionId).catch(() => {});
      this.startCast(s);
      this.startAudio(s);
    } else if (m.method === 'Inspector.targetCrashed') {
      s.error = 'A página do DSK travou. Use Recarregar.';
      this.broadcastStatus(s);
    }
  }

  // ---------- páginas (uma por DSK) ----------
  async set(key, { url, width, height, jpeg, fps, quality }, { force = false } = {}) {
    url = String(url || '').trim();
    jpeg = !!jpeg;
    if (!/^https?:\/\//i.test(url)) throw Object.assign(new Error('Use um endereço começando com http:// ou https://'), { status: 400 });
    width = Math.max(64, Math.min(3840, Math.round(+width || 1920)));
    height = Math.max(64, Math.min(2160, Math.round(+height || 1080)));
    const fpsLimit = [5, 10, 15, 20, 30, 60].includes(+fps) ? +fps : 30;
    quality = Math.max(40, Math.min(95, Math.round(+quality || 80)));
    clearTimeout(this.idleTimer);
    let s = this.slots.get(key);
    const same = s && s.sessionId && s.url === url && s.width === width && s.height === height;
    if (same && !force && s.jpeg === jpeg && s.fpsLimit === fpsLimit && s.quality === quality) return this.slotInfo(s);
    if (same && !force) {
      // só trocou formato/qualidade/taxa: não precisa recarregar a página
      Object.assign(s, { jpeg, fpsLimit, quality });
      this.startCast(s);
      return this.slotInfo(s);
    }
    if (!s) {
      s = { key };
      this.slots.set(key, s);
    }
    Object.assign(s, { url, width, height, jpeg, fpsLimit, quality, error: null });
    try {
      await this.ensureBrowser();
    } catch (e) {
      s.error = e.message;
      this.broadcastStatus(s);
      throw e;
    }
    if (!s.sessionId) {
      // uma janela (invisível, é headless) por DSK: abas de fundo não pintam e o screencast ficaria parado.
      // width/height só são aceitos junto com newWindow ("Target position can only be set for new windows")
      const { targetId } = await this.send('Target.createTarget', { url: 'about:blank', newWindow: true, width, height });
      const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
      Object.assign(s, { targetId, sessionId, casting: false });
      this.bySession.set(sessionId, s);
      await this.send('Page.enable', {}, sessionId);
      await this.send('Inspector.enable', {}, sessionId).catch(() => {});
      // binding do áudio (vale para os documentos seguintes também) e foco simulado: sem ele a página headless
      // nunca está "em foco" e campos de texto não mostram o cursor nem recebem a digitação enviada pelo estúdio
      await this.send('Runtime.enable', {}, sessionId).catch(() => {});
      await this.send('Runtime.addBinding', { name: AUDIO_BINDING }, sessionId).catch(() => {});
      await this.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId).catch(() => {});
    }
    const sid = s.sessionId;
    s.fitTries = 0;
    await this.fitWindow(s);
    // screenWidth/Height: sem eles screen.* fica 800x600 e o YouTube limita o vídeo a 480p
    await this.send(
      'Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height },
      sid,
    );
    await this.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, sid);
    const nav = await this.send('Page.navigate', { url }, sid);
    if (nav?.errorText) s.error = `Não abriu: ${nav.errorText}`;
    // o screencast liga no loadEventFired; isto cobre páginas que demoram a terminar de carregar
    this.startCast(s);
    this.restarts = 0;
    this.broadcastStatus(s);
    return this.slotInfo(s);
  }

  // ajusta a janela headless para a área visível ficar exatamente width×height. Sem medida (gotW) usa o
  // tamanho pedido; com a medida do quadro soma a diferença (bordas/barras que o Edge desconta da janela)
  async fitWindow(s, gotW, gotH) {
    if (!s.targetId || s.fitting || (gotW && (s.fitTries || 0) >= 4)) return;
    s.fitting = true;
    try {
      const { windowId, bounds } = await this.send('Browser.getWindowForTarget', { targetId: s.targetId });
      let w = s.width;
      let h = s.height;
      if (gotW) {
        s.fitTries = (s.fitTries || 0) + 1;
        w = (bounds.width || s.width) + (s.width - gotW);
        h = (bounds.height || s.height) + (s.height - gotH);
      }
      await this.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal', width: w, height: h } });
      // quadros já em trânsito ainda têm o tamanho antigo: espera antes de medir de novo (senão corrige em dobro)
      s.fitUntil = Date.now() + 800;
      if (gotW) this.startCast(s);
    } catch {
      /* versões sem Browser.setWindowBounds: fica o override */
    } finally {
      s.fitting = false;
    }
  }

  // (re)liga o screencast; logo depois de navegar o Edge pode responder "Not attached to an active page": tenta de novo.
  // As chamadas são serializadas: navegar, redimensionar e trocar fps chamam startCast quase juntas; sem a fila,
  // um stop atrasado podia parar o screencast que a chamada seguinte tinha acabado de ligar (prévia ficava preta).
  startCast(s, tries = 0) {
    const sid = s.sessionId;
    if (!sid || this.slots.get(s.key) !== s) return;
    clearTimeout(s.castTimer);
    const gen = (s.castGen = (s.castGen || 0) + 1);
    // 60 qps é a taxa típica de pintura do Chromium; everyNthFrame reduz o decode/PNG e o WS.
    // everyNthFrame fica 1: o limite de fps é aplicado no servidor guardando o último quadro.
    // (Com >1, uma página que pinta uma única vez — logo, logo estático — não mandava quadro nenhum.)
    const nth = 1;
    const run = async () => {
      if (gen !== s.castGen || s.sessionId !== sid || this.slots.get(s.key) !== s) return;
      try {
        await this.send('Page.stopScreencast', {}, sid).catch(() => {});
        if (gen !== s.castGen || s.sessionId !== sid) return;
        await this.send(
          'Page.startScreencast',
          s.jpeg
            ? { format: 'jpeg', quality: s.quality || 80, maxWidth: s.width, maxHeight: s.height, everyNthFrame: nth }
            : { format: 'png', maxWidth: s.width, maxHeight: s.height, everyNthFrame: nth },
          sid,
        );
        if (gen === s.castGen) {
          s.casting = true;
          s.castError = null;
        }
      } catch (e) {
        s.castError = e.message || String(e);
        if (gen === s.castGen && tries < 20 && s.sessionId === sid) s.castTimer = setTimeout(() => this.startCast(s, tries + 1), 250);
      }
    };
    s.castChain = (s.castChain || Promise.resolve()).then(run, run);
  }

  // a captura precisa de "gesto do usuário": o Runtime.evaluate com userGesture simula um
  startAudio(s) {
    if (!s.sessionId) return;
    this.send('Runtime.evaluate', { expression: AUDIO_JS, userGesture: true, returnByValue: true }, s.sessionId).catch(() => {});
  }

  // mouse/teclado vindos da prévia do estúdio (modo "Interagir com a página"): login, fechar aviso de cookies,
  // escolher sala etc. Só repassa campos conhecidos para o CDP.
  input(slot, m) {
    const s = this.slots.get(String(slot || ''));
    if (!s?.sessionId || !this.ws || !m || typeof m !== 'object') return;
    const sid = s.sessionId;
    const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
    const modifiers = MODS(m.mods);
    if (m.kind === 'mouse') {
      const type = ['mousePressed', 'mouseReleased', 'mouseMoved', 'mouseWheel'].includes(m.type) ? m.type : null;
      if (!type) return;
      const button = ['left', 'middle', 'right', 'none'].includes(m.button) ? m.button : 'none';
      const p = {
        type,
        x: Math.max(0, Math.min(s.width, num(m.x))),
        y: Math.max(0, Math.min(s.height, num(m.y))),
        button,
        buttons: num(m.buttons) | 0,
        clickCount: type === 'mouseMoved' ? 0 : Math.max(0, Math.min(3, num(m.clickCount, 1) | 0)),
        modifiers,
      };
      if (type === 'mouseWheel') {
        p.deltaX = num(m.deltaX);
        p.deltaY = num(m.deltaY);
      }
      this.send('Input.dispatchMouseEvent', p, sid).catch(() => {});
    } else if (m.kind === 'key') {
      const type = ['keyDown', 'rawKeyDown', 'keyUp'].includes(m.type) ? m.type : null;
      if (!type) return;
      const p = { type, modifiers, key: String(m.key || '').slice(0, 32), code: String(m.code || '').slice(0, 32), windowsVirtualKeyCode: num(m.keyCode) | 0, nativeVirtualKeyCode: num(m.keyCode) | 0, location: num(m.location) | 0, autoRepeat: !!m.repeat };
      if (type === 'keyDown' && typeof m.text === 'string' && m.text) p.text = p.unmodifiedText = m.text.slice(0, 4);
      this.send('Input.dispatchKeyEvent', p, sid).catch(() => {});
    } else if (m.kind === 'text') {
      const text = String(m.text || '').slice(0, 20000);
      if (text) this.send('Input.insertText', { text }, sid).catch(() => {});
    }
  }

  async reload(key) {
    const s = this.slots.get(key);
    if (!s) throw Object.assign(new Error('DSK não carregado'), { status: 404 });
    if (!s.sessionId) return this.set(key, s, { force: true });
    s.error = null;
    await this.send('Page.reload', { ignoreCache: true }, s.sessionId);
    return this.slotInfo(s);
  }

  async remove(key) {
    const s = this.slots.get(key);
    if (!s) return;
    this.slots.delete(key);
    clearTimeout(s.castTimer);
    clearTimeout(s.frameTimer);
    s.pendingFrame = null;
    if (s.sessionId) this.bySession.delete(s.sessionId);
    if (s.targetId && this.ws) await this.send('Target.closeTarget', { targetId: s.targetId }).catch(() => {});
    this.broadcastText({ type: 'clear', key });
    if (!this.slots.size) this.closeBrowser();
  }

  closeBrowser(now = false) {
    this.stopping = true;
    const p = this.proc;
    try {
      // Browser.close encerra também os processos filhos (GPU/renderer); o kill é a garantia
      if (!now && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ id: ++this.seq, method: 'Browser.close' }));
    } catch {}
    try {
      this.ws?.close();
    } catch {}
    const kill = () => killTree(p);
    if (now) kill();
    else setTimeout(kill, 1500).unref?.();
    if (p && p.exitCode === null) {
      // promessa "terminou de fechar" (no máx. 4 s): ensureBrowser espera antes de abrir outro com o mesmo perfil
      const closing = new Promise((res) => {
        const t = setTimeout(res, 4000);
        t.unref?.();
        p.once('exit', () => (clearTimeout(t), res()));
      }).then(() => {
        if (this.closing === closing) this.closing = null;
      });
      this.closing = closing;
    }
    this.ws = null;
    this.proc = null;
    this.bySession.clear();
    for (const s of this.slots.values()) {
      s.sessionId = s.targetId = null;
      s.casting = false;
      s.lastAt = 0;
      s.pendingFrame = null;
      clearTimeout(s.frameTimer);
      s.frameTimer = null;
    }
    setTimeout(() => (this.stopping = false), 500).unref?.();
  }

  stop() {
    clearInterval(this.fpsTimer);
    this.slots.clear();
    this.closeBrowser(true);
  }

  tickFps() {
    for (const s of this.slots.values()) {
      s.fps = Math.round(((s.frames || 0) / 2) * 10) / 10;
      s.frames = 0;
    }
    if (this.slots.size && this.clients.size) this.broadcastText({ type: 'fps', slots: [...this.slots.values()].map((s) => ({ key: s.key, fps: s.fps, audio: this.hasAudio(s) })) });
  }

  // ---------- estúdio (WebSocket /dsk) ----------
  handleClient(ws) {
    this.clients.add(ws);
    clearTimeout(this.idleTimer);
    // aba do estúdio fechada no meio de um envio gera ECONNRESET; sem ouvinte derrubaria o servidor
    ws.on('error', () => {});
    // texto = comando do estúdio (por enquanto só mouse/teclado da prévia interativa)
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return;
      }
      // { type: 'input', slot, ev }: o evento vai aninhado porque ele tem os próprios type/key
      if (m?.type === 'input') this.input(m.slot, m.ev);
    });
    for (const s of this.slots.values()) {
      this.broadcastStatus(s, ws);
      if (s.last) this.sendFrame(ws, s);
    }
    ws.on('close', () => {
      this.clients.delete(ws);
      if (this.clients.size) return;
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        if (this.clients.size) return;
        for (const key of [...this.slots.keys()]) this.remove(key);
      }, IDLE_MS);
    });
  }

  sendFrame(ws, s) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 6 * 1024 * 1024) return; // estúdio atrasado: pula o quadro em vez de acumular
    const k = Buffer.from(s.key, 'utf8');
    ws.send(Buffer.concat([Buffer.from([k.length]), k, s.last]), { binary: true });
  }

  broadcastFrame(s) {
    for (const ws of this.clients) this.sendFrame(ws, s);
  }

  // áudio: [0][u8 tamanho][chave][PCM 48 kHz estéreo int16]. O 1º byte 0 distingue do quadro (tamanho da chave ≥ 1)
  broadcastAudio(s, b64) {
    if (!this.clients.size || typeof b64 !== 'string') return;
    const pcm = Buffer.from(b64, 'base64');
    if (!pcm.length) return;
    s.audioAt = Date.now();
    const k = Buffer.from(s.key, 'utf8');
    const msg = Buffer.concat([Buffer.from([0, k.length]), k, pcm]);
    for (const ws of this.clients) if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 2 * 1024 * 1024) ws.send(msg, { binary: true });
  }

  broadcastText(obj, only) {
    const txt = JSON.stringify(obj);
    for (const ws of only ? [only] : this.clients) if (ws.readyState === WebSocket.OPEN) ws.send(txt);
  }

  broadcastStatus(s, only) {
    this.broadcastText({ type: 'status', ...this.slotInfo(s) }, only);
  }
}
