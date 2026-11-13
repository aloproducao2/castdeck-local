// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Atualização dentro do app (desktop): baixa do site oficial o build desta plataforma
// (releases.json publicado pelo "npm run release"), confere o SHA-256 e troca o executável.
//  Windows: um .cmd oculto espera o CastDeck.exe fechar, substitui o arquivo e abre o novo.
//  Linux (binário/AppImage): substitui o arquivo (permitido com ele rodando) e reabre.
//  macOS: sem troca automática (app não assinado) – o painel abre o download no navegador.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

const BASE = 'https://cast.flue.live';

const cmp = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};

// script só com ASCII: os caminhos chegam por variáveis de ambiente (Unicode), nunca dentro do .cmd
const WIN_APPLY = [
  '@echo off',
  // O servidor sai, mas o lançador/tray pode continuar segurando o CastDeck.exe. O script roda
  // fora do Job (WMI); encerra o lançador pelo PID e pelo nome antes de trocar o executável.
  'ping -n 3 127.0.0.1 >nul',
  'if defined CD_LAUNCHER_PID taskkill /f /pid %CD_LAUNCHER_PID% >nul 2>&1',
  'if defined CD_APPNAME taskkill /f /im "%CD_APPNAME%" >nul 2>&1',
  'for /l %%i in (1,1,90) do (',
  '  move /y "%CD_NEW%" "%CD_DST%" >nul 2>&1 && goto ok',
  '  ping -n 2 127.0.0.1 >nul',
  ')',
  'cd /d "%TEMP%" >nul 2>&1',
  'start "" "%CD_NEW%"',
  'goto end',
  ':ok',
  'cd /d "%TEMP%" >nul 2>&1',
  'start "" "%CD_DST%"',
  ':end',
  '(goto) 2>nul & del "%~f0"',
  '',
].join('\r\n');

export class Updater {
  constructor({ dataDir, target, version, packaged }) {
    this.dir = path.join(dataDir, 'update');
    this.target = target;
    this.version = version;
    this.packaged = packaged;
    this.st = { state: 'idle', version: null, got: 0, total: 0, error: null };
    this.file = null;
  }

  // como esta instalação pode se atualizar sozinha (null = só pelo navegador)
  mode() {
    if (!this.packaged) return null;
    if (process.platform === 'win32') return process.env.CASTDECK_EXE ? 'windows' : null;
    if (process.platform === 'linux') return 'linux';
    return null;
  }

  status() {
    return { ...this.st, canInstall: !!this.mode() };
  }

  download() {
    if (this.st.state === 'downloading' || this.st.state === 'ready') return this.status();
    this.st = { state: 'downloading', version: null, got: 0, total: 0, error: null };
    this.run().catch((e) => {
      this.st.state = 'error';
      this.st.error = e.message;
      console.warn('[update] ' + e.message);
    });
    return this.status();
  }

  async run() {
    const r = await fetch(`${BASE}/releases.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Site indisponível (HTTP ' + r.status + ')');
    const rels = ((await r.json()).releases || []).slice().sort((a, b) => cmp(b.version, a.version));
    let rel = null, art = null;
    for (const x of rels) {
      const a = (x.artifacts || []).find((y) => y.platform === this.target && y.available);
      if (a) { rel = x; art = a; break; }
    }
    if (!art) throw new Error('Não há atualização automática para este sistema.');
    if (this.version !== 'dev' && cmp(rel.version, this.version) <= 0) throw new Error('Você já está na versão mais recente.');
    if (!/^downloads\/[\w.\-/]+$/.test(art.file)) throw new Error('Arquivo de atualização inválido.');

    // Nunca apaga this.dir com rmdir: no Windows o antivírus, o Explorer ou o CWD herdado
    // pode segurar a pasta (EBUSY) e abortar o download mesmo sem precisar removê-la.
    await fsp.mkdir(this.dir, { recursive: true });
    for (const name of await fsp.readdir(this.dir).catch(() => [])) {
      await fsp.rm(path.join(this.dir, name), { recursive: true, force: true, maxRetries: 4, retryDelay: 150 }).catch(() => {});
    }
    const base = path.basename(art.file);
    let out = path.join(this.dir, base);
    if (fs.existsSync(out)) {
      const ext = path.extname(base);
      out = path.join(this.dir, `${path.basename(base, ext)}-${Date.now()}${ext}`);
    }
    const part = `${out}.${Date.now()}.part`;
    Object.assign(this.st, { version: rel.version, total: art.size || 0 });
    console.log(`[update] baixando v${rel.version} (${art.file})`);

    // /dl/ conta o download no site e redireciona para o arquivo
    const res = await fetch(`${BASE}/${art.file.replace(/^downloads\//, 'dl/')}`, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error('Falha no download (HTTP ' + res.status + ')');
    if (!this.st.total) this.st.total = Number(res.headers.get('content-length')) || 0;
    const hash = crypto.createHash('sha256');
    const ws = fs.createWriteStream(part);
    try {
      for await (const chunk of res.body) {
        hash.update(chunk);
        this.st.got += chunk.length;
        if (!ws.write(chunk)) await once(ws, 'drain');
      }
      await new Promise((ok, ko) => ws.end((e) => (e ? ko(e) : ok())));
    } catch (e) {
      await new Promise((ok) => {
        if (ws.closed || ws.destroyed) return ok();
        ws.once('close', ok);
        ws.destroy();
      });
      await fsp.rm(part, { force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
      throw new Error('Download interrompido: ' + e.message);
    }
    if (art.sha256 && hash.digest('hex') !== art.sha256) {
      await fsp.rm(part, { force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
      throw new Error('O arquivo baixado está corrompido (SHA-256 não confere). Tente de novo.');
    }
    await fsp.rename(part, out);
    if (process.platform !== 'win32') await fsp.chmod(out, 0o755);
    this.file = out;
    this.st.state = 'ready';
    console.log(`[update] v${rel.version} pronta para instalar`);
  }

  // troca o executável e agenda a reabertura; quem chama encerra o servidor em seguida
  async install() {
    const mode = this.mode();
    if (!mode) throw new Error('Esta instalação não se atualiza sozinha: baixe pelo site.');
    if (this.st.state !== 'ready' || !this.file) throw new Error('A atualização ainda não foi baixada.');

    if (mode === 'windows') {
      const script = path.join(this.dir, 'aplicar.cmd');
      // valores gravados no próprio script: o processo criado pelo WMI não herda o ambiente deste.
      // CD_LAUNCHER_PID/CD_APPNAME permitem encerrar o lançador (tray) que ainda segura o .exe.
      const head =
        `@echo off\r\n` +
        `set "CD_NEW=${this.file}"\r\n` +
        `set "CD_DST=${process.env.CASTDECK_EXE}"\r\n` +
        `set "CD_LAUNCHER_PID=${process.env.CASTDECK_LAUNCHER === '1' ? process.ppid : ''}"\r\n` +
        `set "CD_APPNAME=${path.basename(process.env.CASTDECK_EXE || '')}"\r\n`;
      await fsp.writeFile(script, head + WIN_APPLY, 'ascii');
      // O lançador põe o servidor num Job que encerra a árvore inteira quando ele fecha; um filho comum (mesmo
      // detached) morreria junto e a troca do exe nunca aconteceria. Criado pelo WMI, o script fica fora do Job.
      const q = (s) => String(s).replace(/'/g, "''");
      const safeCwd = os.tmpdir();
      const ps =
        `$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0}; ` +
        `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='cmd.exe /d /c "${q(script)}"'; CurrentDirectory='${q(safeCwd)}'; ProcessStartupInformation=$si}; ` +
        `exit [int]$r.ReturnValue`;
      const viaWmi = await new Promise((res) => {
        const k = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, stdio: 'ignore' });
        const t = setTimeout(() => (k.kill(), res(false)), 15000);
        k.on('exit', (code) => (clearTimeout(t), res(code === 0)));
        k.on('error', () => (clearTimeout(t), res(false)));
      });
      if (!viaWmi) {
        // sem WMI (política da empresa etc.): jeito antigo, funciona quando não há Job (servidor pelo terminal)
        const p = spawn('cmd.exe', ['/d', '/c', script], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          cwd: safeCwd,
          env: { ...process.env, CD_NEW: this.file, CD_DST: process.env.CASTDECK_EXE },
        });
        p.unref();
      }
    } else {
      const dst = process.env.APPIMAGE || process.execPath;
      const tmp = dst + '.novo';
      try {
        await fsp.copyFile(this.file, tmp);
        await fsp.chmod(tmp, 0o755);
        await fsp.rename(tmp, dst); // o processo em execução continua com o arquivo antigo (inode)
      } catch (e) {
        await fsp.rm(tmp, { force: true }).catch(() => {});
        throw new Error('Sem permissão para substituir ' + dst + ': ' + e.message);
      }
      // reabre depois que este processo liberar as portas; a janela aberta recarrega sozinha
      const p = spawn('/bin/sh', ['-c', 'sleep 3; exec "$CD_DST"'], {
        detached: true,
        stdio: 'ignore',
        cwd: os.homedir(),
        env: { ...process.env, CD_DST: dst, NO_OPEN: '1' },
      });
      p.unref();
      fsp.rm(this.dir, { recursive: true, force: true }).catch(() => {});
    }
    this.st.state = 'installing';
    console.log(`[update] instalando v${this.st.version} e reiniciando`);
  }
}
