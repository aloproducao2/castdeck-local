// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Túnel público para convidados. Provedores sem conta e sem abrir portas no roteador:
//  - cloudflare:   cloudflared (quick tunnel), baixado na primeira vez — PADRÃO
//  - localhostrun: usa o OpenSSH que já vem no Windows (nada para baixar), HTTPS válido (*.lhr.life)
// Em modo "auto" começa pelo Cloudflare e, se falhar ou o link não responder de fora, troca para o outro.
// Só o tráfego de convidados atravessa o túnel; painel, estúdio e ingest continuam restritos ao localhost.
import { spawn } from 'node:child_process';
import dns from 'node:dns/promises';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { NULL_DEVICE } from './platform.js';

export const PROVIDERS = {
  localhostrun: { label: 'localhost.run (SSH)', re: /https:\/\/[a-z0-9-]+\.lhr\.life/i },
  cloudflare: { label: 'Cloudflare', re: /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i },
};
const AUTO_ORDER = ['cloudflare', 'localhostrun'];
const STARTUP_TIMEOUT = 90000;
const HEALTH_EVERY = 45000;
const CF_FAILS_BEFORE_FALLBACK = 2; // falhas seguidas do Cloudflare antes de tentar localhost.run uma vez

export class Tunnel extends EventEmitter {
  constructor(deps, getProvider = () => 'cloudflare') {
    super();
    this.deps = deps;
    this.getProvider = getProvider;
    this.status = 'off'; // off | downloading | starting | on | error
    this.url = null;
    this.error = null;
    this.provider = null; // provedor ativo
    this.proc = null;
    this.wanted = false;
    this.port = 0;
    this.attempts = 0;
    this.idx = 0;
    this.timers = [];
  }

  info() {
    return {
      status: this.status,
      url: this.url,
      error: this.error,
      provider: this.provider,
      providerLabel: this.provider ? PROVIDERS[this.provider].label : null,
      download: this.deps.state.cloudflared,
    };
  }

  set(status, extra = {}) {
    this.status = status;
    Object.assign(this, extra);
    this.emit('change');
  }

  order() {
    const p = this.getProvider();
    // Cloudflare limitou (429) ou falhou seguidas vezes: usa o outro provedor por um tempo, mesmo se Cloudflare foi o escolhido
    if (Date.now() < (this.cfBlockedUntil || 0)) return ['localhostrun', 'cloudflare'];
    return PROVIDERS[p] ? [p] : AUTO_ORDER;
  }

  clearTimers() {
    this.timers.forEach((t) => clearTimeout(t) || clearInterval(t));
    this.timers = [];
  }

  async start(port) {
    if (this.proc || this.status === 'downloading' || this.status === 'starting') return;
    this.wanted = true;
    this.port = port;
    this.error = null;
    const order = this.order();
    const provider = order[this.idx % order.length];
    this.provider = provider;
    let cmd;
    let args;
    try {
      if (provider === 'cloudflare') {
        if (!this.deps.exists('cloudflared')) this.set('downloading');
        cmd = await this.deps.ensure('cloudflared');
        // http2: funciona em redes que bloqueiam UDP/QUIC
        args = ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate', '--protocol', 'http2'];
      } else {
        cmd = 'ssh';
        args = [
          '-T', '-o', 'StrictHostKeyChecking=no', '-o', `UserKnownHostsFile=${NULL_DEVICE}`, 
          '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3',
          '-R', `80:127.0.0.1:${port}`, 'nokey@localhost.run',
        ];
      }
    } catch (e) {
      this.set('error', { error: `Não foi possível preparar ${PROVIDERS[provider].label}: ${e.message}` });
      return this.failover();
    }
    if (!this.wanted) return this.set('off');
    this.set('starting', { url: null });
    const proc = spawn(cmd, args, { windowsHide: true });
    this.proc = proc;
    this.killReason = null;
    this.verifying = false;
    let buf = '';
    let candidate = null;
    // Cloudflare: só testa o link depois que o cloudflared registrou a conexão com a borda (antes disso o link não
    // responde de jeito nenhum). localhost.run já está conectado quando imprime a URL.
    let registered = provider !== 'cloudflare';
    const tryVerify = () => {
      if (candidate && registered && !this.verifying) this.verify(proc, candidate);
    };
    const onData = (d) => {
      // procura a URL antes de aparar o buffer (a saída do QR code pode ser grande)
      const full = buf + d;
      buf = full.slice(-4000);
      if (!registered && /Registered tunnel connection/i.test(full)) {
        registered = true;
        tryVerify();
      }
      if (candidate) return;
      const m = full.match(PROVIDERS[provider].re);
      if (m) {
        candidate = m[0];
        tryVerify();
      }
    };
    proc.stderr.on('data', onData);
    proc.stdout.on('data', onData);
    proc.on('error', (e) => {
      if (this.proc === proc) this.set('error', { error: `${PROVIDERS[provider].label}: ${e.message}` });
    });
    proc.on('close', (code) => {
      if (this.proc !== proc) return;
      this.proc = null;
      this.verifying = false;
      this.clearTimers();
      const wasOn = this.status === 'on';
      if (!this.wanted) return this.set('off', { url: null });
      const last = buf.trim().split(/\r?\n/).filter(Boolean).pop() || '';
      const limited = provider === 'cloudflare' && !wasOn && /\b429\b|too many requests|rate.?limit/i.test(buf);
      if (limited) {
        this.cfBlockedUntil = Date.now() + 10 * 60000;
        this.idx = -1; // failover() avança para localhost.run
        this.attempts = 0;
        this.set('error', { url: null, error: 'O Cloudflare limitou links temporários desta rede (muitos pedidos). Trocando automaticamente para localhost.run…' });
        return this.failover(false);
      }
      // falhas seguidas do Cloudflare (rede/antivírus/proxy bloqueando): tenta o localhost.run antes de insistir
      if (provider === 'cloudflare' && !wasOn) this.cfFails = (this.cfFails || 0) + 1;
      if (provider === 'cloudflare' && !wasOn && this.cfFails >= CF_FAILS_BEFORE_FALLBACK) {
        this.cfFails = 0;
        this.cfBlockedUntil = Date.now() + 5 * 60000;
        this.idx = -1;
        this.set('error', { url: null, error: `${this.killReason || 'O Cloudflare não abriu o link.'} Tentando localhost.run…` });
        return this.failover(false);
      }
      // código null = processo encerrado pelo próprio CastDeck: mostra o motivo real, não a última linha do log
      const why = this.killReason || `${PROVIDERS[provider].label} encerrou (código ${code}). ${last}`;
      this.set('error', { url: null, error: wasOn ? 'Túnel caiu. Reconectando…' : `${why} Tentando de novo…` });
      this.failover(wasOn);
    });
    // se o link não ficar pronto/verificado a tempo, derruba e tenta outro provedor
    this.timers.push(
      setTimeout(() => {
        if (this.proc === proc && this.status !== 'on') {
          this.killReason = registered ? `${PROVIDERS[provider].label} conectou, mas o link não respondeu a tempo.` : `${PROVIDERS[provider].label} não conectou a tempo (rede ou antivírus bloqueando?).`;
          proc.kill();
        }
      }, STARTUP_TIMEOUT),
    );
  }

  // Só marca "on" depois que o link público responde de fora (evita mostrar link morto).
  async verify(proc, url) {
    this.verifying = true;
    for (let i = 0; i < 25 && this.proc === proc && this.wanted; i++) {
      // DNS do sistema só entra como reserva depois de ~30 s, quando o registro do link já propagou
      if (await this.probe(url, i >= 12)) {
        if (this.proc !== proc) return;
        this.attempts = 0;
        if (this.provider === 'cloudflare') this.cfFails = 0;
        this.set('on', { url, error: null });
        console.log(`[tunnel] link público (${this.provider}): ${url}`);
        this.timers.push(setInterval(() => this.health(proc, url), HEALTH_EVERY));
        return;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (this.proc === proc && this.status !== 'on') {
      this.killReason = `${PROVIDERS[this.provider].label}: o link não ficou acessível.`;
      proc.kill();
    }
    if (this.proc === proc) this.verifying = false;
  }

  // Testa o link SEM depender do DNS deste PC: o link novo ainda não existe no DNS nos primeiros segundos, e o
  // Windows/provedor guardam esse "não existe" por 60 s ou mais (TTL negativo). Antes, o primeiro teste envenenava
  // o cache, todos os seguintes falhavam e o túnel (já conectado) era derrubado aos 60 s com "código null".
  // Aqui conecta direto num IP da borda do provedor (qualquer IP da borda atende qualquer nome) com o nome no SNI.
  async edgeIps(host) {
    const apex = host.split('.').slice(-2).join('.'); // trycloudflare.com / lhr.life: sempre existem no DNS
    const ips = new Set();
    try {
      for (const a of await dns.resolve4(apex)) ips.add(a);
    } catch {}
    try {
      for (const a of await dns.lookup(apex, { all: true, family: 4 })) ips.add(a.address);
    } catch {}
    return [...ips].slice(0, 3);
  }

  probeVia(ip, host) {
    return new Promise((resolve) => {
      const req = https.request(
        { host: ip, servername: host, port: 443, path: '/api/public/ice', method: 'GET', headers: { host, 'ngrok-skip-browser-warning': '1' }, timeout: 8000 },
        (r) => {
          r.resume();
          resolve(r.statusCode >= 200 && r.statusCode < 300);
        },
      );
      req.on('timeout', () => req.destroy());
      req.on('error', () => resolve(false));
      req.end();
    });
  }

  async probe(url, allowSystemDns = true) {
    const host = new URL(url).host;
    const ips = await this.edgeIps(host);
    for (const ip of ips) {
      if (await this.probeVia(ip, host)) return true;
    }
    if (ips.length && !allowSystemDns) return false;
    // reserva: caminho normal pelo DNS do sistema (cedo demais ele guarda o "não existe", por isso só depois)
    try {
      const r = await fetch(`${url}/api/public/ice`, { signal: AbortSignal.timeout(8000), headers: { 'ngrok-skip-browser-warning': '1' } });
      return r.ok;
    } catch {
      return false;
    }
  }

  async health(proc, url) {
    if (this.proc !== proc) return;
    for (let i = 0; i < 3; i++) {
      if (await this.probe(url)) return;
      await new Promise((r) => setTimeout(r, 4000));
    }
    if (this.proc === proc) {
      this.killReason = 'O link parou de responder.';
      proc.kill(); // 'close' dispara a reconexão
    }
  }

  failover(wasOn = false) {
    if (!this.wanted) return;
    // em modo auto, troca de provedor após falha de inicialização
    if (!wasOn && this.order().length > 1) this.idx++;
    if (this.attempts++ < 20) {
      this.timers.push(setTimeout(() => this.wanted && !this.proc && this.start(this.port), Math.min(20000, 2000 * this.attempts)));
    }
  }

  stop() {
    this.wanted = false;
    this.clearTimers();
    const p = this.proc;
    this.proc = null;
    if (p) p.kill();
    this.set('off', { url: null });
  }

  restart() {
    const port = this.port;
    this.stop();
    this.idx = 0;
    this.attempts = 0;
    if (port) setTimeout(() => this.start(port), 300);
  }
}
