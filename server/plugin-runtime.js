// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Runtime de um plugin de código: sobe o processo filho (o próprio executável do app entra em modo host),
// fala JSON-RPC por stdio, aplica timeouts e reinicia no máximo 3 vezes antes de colocar em quarentena.
import { spawn } from 'node:child_process';
import path from 'node:path';

const TIMEOUT_CHAMADA = 8000;
const MAX_REINICIOS = 3;

export class PluginRuntime {
  constructor({ manifest, dir, dataDir, onAction, onLog }) {
    this.manifest = manifest;
    this.dir = dir;
    this.dataDir = dataDir;
    this.onAction = onAction;
    this.onLog = onLog;
    this.proc = null;
    this.ready = false;
    this.reinicios = 0;
    this.quarentena = false;
    this.pendentes = new Map();
    this.seq = 0;
    this.ultimoErro = null;
  }

  get ativo() {
    return !!this.proc && this.ready && !this.quarentena;
  }

  async iniciar() {
    if (this.proc || this.quarentena) return this.ativo;
    const env = {
      ...process.env,
      CASTDECK_PLUGIN_HOST: this.dir,
      CASTDECK_DATA: this.dataDir,
      ELECTRON_RUN_AS_NODE: '', // nunca: o app não é Electron, mas evita surpresa
    };
    const exe = process.execPath;
    const args = [];
    // Em desenvolvimento (node server/index.js) o execPath é o node; no app empacotado é o próprio CastDeck,
    // que entra em modo host ao ver CASTDECK_PLUGIN_HOST.
    if (/node(\.exe)?$/i.test(path.basename(exe))) args.push(path.join(process.cwd(), 'server', 'index.js'));
    this.proc = spawn(exe, args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    return new Promise((resolve) => {
      let resolvido = false;
      const terminar = (ok) => {
        if (resolvido) return;
        resolvido = true;
        resolve(ok);
      };
      const t = setTimeout(() => {
        this.onLog(`plugin ${this.manifest.id}: não ficou pronto em 8 s`);
        this.parar();
        terminar(false);
      }, TIMEOUT_CHAMADA);

      let buf = '';
      this.proc.stdout.on('data', (chunk) => {
        buf += chunk.toString();
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const linha = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!linha) continue;
          let msg;
          try {
            msg = JSON.parse(linha);
          } catch {
            continue;
          }
          if (msg.type === 'ready') {
            this.ready = true;
            this.reinicios = 0;
            clearTimeout(t);
            terminar(true);
          } else if (msg.type === 'fatal') {
            this.ultimoErro = msg.error;
            this.onLog(`plugin ${this.manifest.id}: ${msg.error}`);
            clearTimeout(t);
            this.parar();
            terminar(false);
          } else if (msg.type === 'log') {
            this.onLog(`[${this.manifest.id}] ${msg.line}`);
          } else if (msg.type === 'call' && msg.id) {
            this.atenderPedido(msg);
          }
        }
      });
      this.proc.stderr.on('data', (d) => this.onLog(`[${this.manifest.id}] ${String(d).slice(0, 600).trim()}`));
      this.proc.on('exit', (code) => {
        this.ready = false;
        this.proc = null;
        for (const p of this.pendentes.values()) {
          clearTimeout(p.t);
          p.reject(new Error('plugin encerrou'));
        }
        this.pendentes.clear();
        if (!this.parando && this.reinicios < MAX_REINICIOS) {
          this.reinicios++;
          this.onLog(`plugin ${this.manifest.id} caiu (código ${code}); reinício ${this.reinicios}/${MAX_REINICIOS}`);
          setTimeout(() => this.iniciar().catch(() => {}), 1200);
        } else if (!this.parando) {
          this.quarentena = true;
          this.onLog(`plugin ${this.manifest.id} em quarentena após ${MAX_REINICIOS} quedas`);
        }
        terminar(false);
      });
    });
  }

  atenderPedido(msg) {
    const responder = (result, error) => {
      try {
        this.proc?.stdin.write(JSON.stringify({ type: 'result', id: msg.id, result, error }) + '\n');
      } catch {}
    };
    Promise.resolve()
      .then(() => this.onAction({ pluginId: this.manifest.id, method: msg.method, params: msg.params || {} }))
      .then((r) => responder(r?.result ?? r ?? null, r?.error))
      .catch((e) => responder(null, e.message));
  }

  enviarEvento(nome, payload) {
    if (!this.ativo) return false;
    try {
      this.proc.stdin.write(JSON.stringify({ type: 'event', name: nome, payload }) + '\n');
      return true;
    } catch {
      return false;
    }
  }

  async chamar(method, params = {}) {
    if (!this.ativo) throw new Error('plugin não está ativo');
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pendentes.delete(id);
        reject(new Error(`tempo esgotado em ${method}`));
      }, TIMEOUT_CHAMADA);
      this.pendentes.set(id, { resolve, reject, t });
      try {
        this.proc.stdin.write(JSON.stringify({ type: 'chamada', id, method, params }) + '\n');
      } catch (e) {
        clearTimeout(t);
        this.pendentes.delete(id);
        reject(e);
      }
    });
  }

  parar() {
    this.parando = true;
    try {
      this.proc?.stdin.write(JSON.stringify({ type: 'shutdown' }) + '\n');
    } catch {}
    try {
      this.proc?.kill('SIGKILL');
    } catch {}
    this.proc = null;
    this.ready = false;
    setTimeout(() => {
      this.parando = false;
    }, 200);
  }

  async reiniciar() {
    this.reinicios = 0;
    this.quarentena = false;
    this.parar();
    await new Promise((r) => setTimeout(r, 300));
    return this.iniciar();
  }
}
