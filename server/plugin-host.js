// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Processo do plugin (nível B). Roda FORA do processo principal, com uma API pequena por JSON-RPC no stdio.
// Nada de fs/rede para o plugin: toda ação privilegiada é pedida ao processo principal, que valida as
// capacidades. Este arquivo NÃO usa top-level await (o bundle CJS do app não suporta).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = process.env.CASTDECK_PLUGIN_HOST;
if (!dir) {
  console.error('[plugin-host] CASTDECK_PLUGIN_HOST ausente');
  process.exit(2);
}

const enviar = (msg) => {
  try {
    process.stdout.write(JSON.stringify(msg) + '\n');
  } catch {}
};
const log = (linha) => enviar({ type: 'log', line: String(linha).slice(0, 2000) });

let manifesto = null;
try {
  manifesto = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
} catch (e) {
  enviar({ type: 'fatal', error: `manifesto ilegível: ${e.message}` });
  process.exit(1);
}

const handlers = new Map(); // nome do evento -> [fn]
const settingsFile = path.join(dir, 'settings.json');
let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) || {};
} catch {}

let chamadaSeq = 0;
const pendentes = new Map();
const SIMULACAO = process.env.CASTDECK_PLUGIN_SIM === '1'; // modo "test drive" usado pelo author de agentes

function pedir(method, params = {}, timeoutMs = 8000) {
  // Em simulação, a ação NÃO é executada: ela é reportada ao harness (que devolve uma resposta vazia).
  // Assim uma IA testa o plugin sem tocar no estúdio de verdade.
  if (SIMULACAO) {
    enviar({ type: 'sim', method, params });
    return Promise.resolve({ ok: true, simulado: true });
  }
  const id = ++chamadaSeq;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      pendentes.delete(id);
      reject(new Error(`tempo esgotado em ${method}`));
    }, timeoutMs);
    pendentes.set(id, { resolve, reject, t });
    enviar({ type: 'call', id, method, params });
  });
}

const api = {
  api: 1,
  plugin: { id: manifesto.id, version: manifesto.version, dataDir: path.join(dir, 'data') },
  log,
  settings: {
    get() {
      return { ...settings };
    },
    async save(patch = {}) {
      settings = { ...settings, ...patch };
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf8');
      } catch (e) {
        log(`falha ao salvar settings: ${e.message}`);
      }
      return { ...settings };
    },
  },
  events: {
    on(nome, fn) {
      if (typeof fn !== 'function') return;
      const lista = handlers.get(nome) || [];
      lista.push(fn);
      handlers.set(nome, lista);
    },
  },
  overlay: {
    show(spec = {}, segundos = 6) {
      return pedir('overlay.show', { spec, segundos });
    },
    hide() {
      return pedir('overlay.hide', {});
    },
  },
  chat: {
    send(texto) {
      return pedir('chat.send', { texto });
    },
  },
  http: {
    get(url, opts = {}) {
      return pedir('http', { url, method: 'GET', ...opts });
    },
    post(url, body, opts = {}) {
      return pedir('http', { url, method: 'POST', body, ...opts });
    },
  },
  sound: {
    play(id) {
      return pedir('sound.play', { id });
    },
  },
  panel: {
    open() {
      return pedir('panel.open', {});
    },
  },
};

process.on('uncaughtException', (e) => {
  enviar({ type: 'fatal', error: `exceção: ${e.message}` });
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  enviar({ type: 'log', line: `promessa rejeitada: ${e?.message || e}` });
});

// recebe eventos e respostas do pai
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf('\n')) >= 0) {
    const linha = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (!linha) continue;
    let msg;
    try {
      msg = JSON.parse(linha);
    } catch {
      continue;
    }
    if (msg.type === 'result' && pendentes.has(msg.id)) {
      const p = pendentes.get(msg.id);
      pendentes.delete(msg.id);
      clearTimeout(p.t);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    } else if (msg.type === 'event') {
      // o app avisa quando a configuração mudou no painel: relê o arquivo antes de avisar o plugin
      if (msg.name === 'settings') {
        try {
          settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) || settings;
        } catch {}
      }
      const lista = handlers.get(msg.name) || [];
      for (const fn of lista) {
        try {
          await fn(msg.payload);
        } catch (e) {
          log(`erro no evento ${msg.name}: ${e.message}`);
        }
      }
    } else if (msg.type === 'shutdown') {
      process.exit(0);
    }
  }
});
process.stdin.on('end', () => process.exit(0));

// ativa o plugin (sem top-level await: roda dentro desta função)
async function iniciar() {
  const entrada = path.join(dir, manifesto.entry || 'src/index.js');
  const mod = await carregarModulo(entrada);
  // aceita `export default function`, `module.exports = function`, `export function activate` e
  // `module.exports = { activate }`
  const activate =
    (typeof mod === 'function' ? mod : null) ||
    (typeof mod?.default === 'function' ? mod.default : null) ||
    (typeof mod?.activate === 'function' ? mod.activate : null) ||
    (typeof mod?.default?.activate === 'function' ? mod.default.activate : null);
  if (!activate) throw new Error('o módulo precisa exportar default (ou activate)');
  await activate(api);
  enviar({ type: 'ready' });
  log(`plugin ${manifesto.id} ${manifesto.version} ativo`);
}

// Carrega o código do plugin. No app empacotado (pkg) o import() dinâmico de um arquivo externo não existe,
// então caímos num carregador CJS mínimo: só `export default`/`export function`/`module.exports`, sem imports.
async function carregarModulo(entrada) {
  try {
    return await import(pathToFileURL(entrada).href + `?v=${Date.now()}`);
  } catch (e) {
    const msg = String(e?.message || e);
    if (!/dynamic import callback|ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING|not supported|Cannot find module/i.test(msg)) throw e;
    return carregarCjs(fs.readFileSync(entrada, 'utf8'), entrada);
  }
}

function carregarCjs(fonte, entrada) {
  if (/\brequire\s*\(|\bimport\s*\(|^\s*import\s+[^(]/m.test(fonte)) {
    throw new Error('plugin não pode importar módulos: use a API do CastDeck (castdeck.http, castdeck.events…)');
  }
  const nomes = [];
  let codigo = fonte
    .replace(/export\s+default\s+/g, 'module.exports = ')
    .replace(/export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/g, (m, asyncPref, nome) => {
      nomes.push(nome);
      return `${asyncPref || ''}function ${nome}`;
    })
    .replace(/export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g, (m, nome) => {
      nomes.push(nome);
      return `const ${nome} =`;
    });
  codigo += '\n;' + nomes.map((n) => `module.exports.${n} = ${n};`).join('\n');
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', '__filename', '__dirname', codigo);
  fn(mod, mod.exports, entrada, path.dirname(entrada));
  return mod.exports;
}

iniciar().catch((e) => {
  enviar({ type: 'fatal', error: `falha ao ativar: ${e.message}` });
  process.exit(1);
});
