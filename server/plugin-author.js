// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// "Author": APIs para uma IA/agente criar, validar e TESTAR plugins do CastDeck sem abrir a interface.
//
// A ideia é que o agente tenha um ciclo fechado e previsível:
//   scaffold() → escreve os arquivos → validate() → simulate() → install()
// e receba erros estruturados (código + dica) para se autocorrigir.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { MotorDeclarativo, regrasDo } from './plugin-declarative.js';
import { CAPABILITIES, CAPACIDADES_SENSIVEIS, validarManifesto, validarPacote, varrerCodigo } from './plugin-manifest.js';

// Catálogo de eventos/ações que a IA pode usar (fonte única da verdade, também servida em /docs).
export const EVENTOS = {
  'chat': { descricao: 'mensagem do chat de qualquer rede', campos: ['usuario', 'texto', 'rede', 'doacao', 'args'] },
  'chat.comando': { descricao: 'mensagem começando com !comando', campos: ['comando', 'usuario', 'texto', 'args'] },
  'chat.regex': { descricao: 'mensagem que casa com uma expressão regular', campos: ['padrao', 'flags'] },
  'chat.contem': { descricao: 'mensagem que contém um texto', campos: ['texto'] },
  'doacao': { descricao: 'mensagem que veio com doação/superchat', campos: ['usuario', 'texto', 'valor'] },
  'stage.entrou': { descricao: 'uma fonte entrou no palco', campos: ['fonte', 'fonteNome'] },
  'stage.saiu': { descricao: 'uma fonte saiu do palco', campos: ['fonte', 'fonteNome'] },
  'scene.mudou': { descricao: 'layout/cena/solo mudou', campos: ['cena', 'solo', 'take'] },
  'live.iniciou': { descricao: 'transmissão começou', campos: ['studioId'] },
  'live.encerrou': { descricao: 'transmissão terminou', campos: ['studioId'] },
};

export const ACOES = {
  'overlay.show': { descricao: 'mostra um aviso no programa (aparece na transmissão)', campos: { titulo: 'string', texto: 'string', cor: '#hex opcional', segundos: 'número 1..60' }, permissoes: ['overlay:show'] },
  'overlay.hide': { descricao: 'esconde o aviso do plugin', campos: {}, permissoes: ['overlay:show'] },
  'chat.send': { descricao: 'responde no chat do estúdio (quem opera e os convidados veem)', campos: { texto: 'string' }, permissoes: ['chat:send'] },
  'panel.open': { descricao: 'abre o painel próprio do plugin', campos: {}, permissoes: ['panel:open'] },
  'sound.play': { descricao: 'toca um sample do Pad', campos: { id: 'string' }, permissoes: ['control:mixer'] },
  'http.request': { descricao: 'chama um endereço declarado em network:<host>', campos: { url: 'string', method: 'GET|POST', body: 'objeto' }, permissoes: ['network:<host>'] },
};

export function documentacao() {
  return {
    api: 1,
    ciclo: ['scaffold', 'validate', 'simulate', 'install'],
    eventos: EVENTOS,
    acoes: ACOES,
    capacidades: Object.entries(CAPABILITIES).map(([id, texto]) => ({ id, texto, sensivel: CAPACIDADES_SENSIVEIS.has(id) })),
    regras: {
      formato: '{ "on": "<evento>", "cooldownSeg": 15, "do": [ { "type": "<acao>", ...campos } ] }',
      variaveis: ['{{usuario}}', '{{texto}}', '{{arg1}}', '{{arg2}}', '{{rede}}', '{{cena}}', '{{fonte}}', '{{titulo}}'],
    },
    seguranca: [
      'sem .exe/.dll/.node/.bat/.ps1 no pacote',
      'sem child_process/fs/net/http no código — use castdeck.http',
      'sem eval/new Function',
      'rede só nos endereços declarados em permissions (network:<host>)',
      'license SPDX obrigatória e engines.castdeck compatível',
    ],
    templates: '/api/plugins/author/templates',
  };
}

export class Author {
  constructor({ workspace, appVersion = '0.0.0', dataDir, log = console.log }) {
    this.workspace = workspace;
    this.appVersion = appVersion;
    this.dataDir = dataDir;
    this.log = log;
  }

  async garantirWorkspace() {
    await fsp.mkdir(this.workspace, { recursive: true });
    return this.workspace;
  }

  // Cria o esqueleto de um plugin e devolve os arquivos escritos (o agente lê e edita).
  async scaffold({ id, name = '', tier = 'declarative', descricao = '' } = {}) {
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(String(id || ''))) {
      const e = new Error('id inválido: use minúsculas com ponto (ex.: com.voce.meu-plugin)');
      e.code = 'ID_INVALIDO';
      throw e;
    }
    const destino = path.join(this.workspace, id);
    await this.garantirWorkspace();
    if (fs.existsSync(destino)) {
      const e = new Error('já existe um plugin com este id no workspace');
      e.code = 'JA_EXISTE';
      throw e;
    }
    const comCodigo = tier === 'code';
    const nome = name || id.split('.').pop().replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const manifesto = comCodigo
      ? {
          id,
          name: nome,
          description: descricao || 'Descreva em uma frase o que o plugin faz.',
          version: '1.0.0',
          author: { name: 'autor local (IA/agente)' },
          license: 'MIT',
          engines: { castdeck: `>=${this.appVersion}`, api: 1 },
          tier: 'code',
          entry: 'src/index.js',
          permissions: ['events:chat', 'overlay:show'],
          settings: [{ key: 'exemplo', label: 'Um valor', type: 'text', default: '' }],
        }
      : {
          id,
          name: nome,
          description: descricao || 'Descreva em uma frase o que o plugin faz.',
          version: '1.0.0',
          author: { name: 'autor local (IA/agente)' },
          license: 'MIT',
          engines: { castdeck: `>=${this.appVersion}`, api: 1 },
          tier: 'declarative',
          permissions: ['events:chat', 'chat:send', 'overlay:show'],
          rules: [
            {
              on: 'chat.comando',
              comando: 'oi',
              cooldownSeg: 20,
              do: [
                { type: 'chat.send', texto: 'Oi, {{usuario}}!' },
                { type: 'overlay.show', titulo: 'Oi', texto: '{{usuario}} chegou', segundos: 5 },
              ],
            },
          ],
        };
    await fsp.mkdir(destino, { recursive: true });
    const arquivos = ['plugin.json', 'README.md'];
    await fsp.writeFile(path.join(destino, 'plugin.json'), JSON.stringify(manifesto, null, 2) + '\n', 'utf8');
    await fsp.writeFile(
      path.join(destino, 'README.md'),
      `# ${nome}\n\n${manifesto.description}\n\n- id: \`${id}\`\n- tipo: ${manifesto.tier}\n- permissões: ${manifesto.permissions.join(', ')}\n\nGerado por scaffold; ajuste o plugin.json e, se for código, src/index.js.\n`,
      'utf8',
    );
    if (comCodigo) {
      await fsp.mkdir(path.join(destino, 'src'), { recursive: true });
      await fsp.writeFile(
        path.join(destino, 'src', 'index.js'),
        `// Plugin ${id} — roda em processo separado, com a API do CastDeck.\nexport default function activate(castdeck) {\n  castdeck.events.on('chat', async (m) => {\n    if (!/^!oi\\b/i.test(String(m.texto || ''))) return;\n    castdeck.log('oi de ' + m.usuario);\n    castdeck.overlay.show({ titulo: 'Oi', texto: String(m.usuario || 'alguém') + ' mandou um oi' }, 6);\n  });\n}\n`,
        'utf8',
      );
      arquivos.push('src/index.js');
    }
    return { pasta: destino, arquivos, manifesto };
  }

  caminho(id) {
    const base = path.resolve(this.workspace);
    const alvo = path.resolve(base, String(id || ''));
    if (!alvo.startsWith(base) || alvo === base) {
      const e = new Error('caminho fora do workspace');
      e.code = 'CAMINHO_INVALIDO';
      throw e;
    }
    return alvo;
  }

  // Validação estruturada: cada erro tem código e dica para o agente se corrigir sozinho.
  async validar(id) {
    const pasta = this.caminho(id);
    const erros = [];
    const avisos = [];
    if (!fs.existsSync(path.join(pasta, 'plugin.json'))) {
      return { ok: false, erros: [{ codigo: 'SEM_MANIFESTO', mensagem: 'plugin.json não encontrado', dica: 'crie plugin.json com id, name, version, license, engines e tier' }], avisos };
    }
    let manifesto;
    try {
      manifesto = JSON.parse(fs.readFileSync(path.join(pasta, 'plugin.json'), 'utf8'));
    } catch (e) {
      return { ok: false, erros: [{ codigo: 'JSON_INVALIDO', mensagem: e.message, dica: 'plugin.json precisa ser JSON válido' }], avisos };
    }
    const v = validarManifesto(manifesto, { castdeckVersion: this.appVersion });
    for (const msg of v.erros) {
      const codigo = /id inválido/.test(msg)
        ? 'ID_INVALIDO'
        : /license/.test(msg)
          ? 'SEM_LICENCA'
          : /engines/.test(msg)
            ? 'ENGINES_INCOMPATIVEL'
            : /permiss/.test(msg)
              ? 'PERMISSAO_INVALIDA'
              : /tier/.test(msg)
                ? 'TIER_INVALIDO'
                : /regras|declarativo/.test(msg)
                  ? 'SEM_REGRAS'
                  : 'MANIFESTO_INVALIDO';
      erros.push({ codigo, mensagem: msg });
    }
    avisos.push(...v.avisos);

    // varredura dos arquivos do plugin
    const arquivos = [];
    const andar = (d, base = '') => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (['node_modules', 'data', '.git'].includes(e.name)) continue;
        const full = path.join(d, e.name);
        const rel = base ? `${base}/${e.name}` : e.name;
        if (e.isDirectory()) andar(full, rel);
        else arquivos.push({ rel, texto: /\.(js|mjs|cjs|json)$/i.test(rel) ? fs.readFileSync(full, 'utf8') : '' });
      }
    };
    andar(pasta);
    for (const a of arquivos) {
      if (/\.(exe|dll|node|bat|cmd|ps1|sh|msi)$/i.test(a.rel)) erros.push({ codigo: 'ARQUIVO_PROIBIDO', mensagem: `arquivo proibido: ${a.rel}`, dica: 'plugins não podem distribuir executáveis' });
      if (a.rel.endsWith('.js') || a.rel.endsWith('.mjs')) {
        for (const achado of varrerCodigo(a.texto, a.rel)) erros.push({ codigo: 'CODIGO_BLOQUEADO', mensagem: achado, dica: 'use castdeck.http para rede e a API castdeck.* para o resto' });
      }
    }
    if (manifesto.tier === 'code' && !fs.existsSync(path.join(pasta, manifesto.entry || 'src/index.js'))) {
      erros.push({ codigo: 'SEM_ENTRADA', mensagem: `entry não existe: ${manifesto.entry}`, dica: 'crie o arquivo indicado em "entry"' });
    }
    // pacote (tamanho, um manifesto na raiz)
    try {
      const entradas = arquivos.map((a) => ({ name: a.rel, data: Buffer.from(a.texto || 'x') }));
      const pv = validarPacote(entradas, { castdeckVersion: this.appVersion });
      for (const msg of pv.erros) if (!erros.some((e) => e.mensagem === msg)) erros.push({ codigo: 'PACOTE_INVALIDO', mensagem: msg });
    } catch {}

    return { ok: erros.length === 0, erros, avisos, resumo: { id: manifesto.id, nome: manifesto.name, versao: manifesto.version, tier: manifesto.tier, permissoes: manifesto.permissions || [] } };
  }

  // Test-drive: dispara eventos sintéticos e devolve as AÇÕES que o plugin pediria — sem tocar no estúdio.
  async simular(id, { eventos = [], segundos = 0 } = {}) {
    const pasta = this.caminho(id);
    const manifesto = JSON.parse(fs.readFileSync(path.join(pasta, 'plugin.json'), 'utf8'));
    const listaEventos = Array.isArray(eventos) && eventos.length ? eventos : [{ tipo: 'chat', usuario: 'teste', texto: '!oi', args: [] }];
    const acoes = [];
    const erros = [];
    let saidaLog = '';

    if (manifesto.tier === 'declarative') {
      const motor = new MotorDeclarativo({
        agora: () => Date.now(),
        log: () => {},
        executarAcao: async ({ acao, pluginId }) => {
          acoes.push({ pluginId, acao });
          return { ok: true };
        },
      });
      motor.registrar(manifesto);
      for (const ev of listaEventos) {
        try {
          await motor.emitir(ev);
        } catch (e) {
          erros.push({ codigo: 'ERRO_REGRA', mensagem: e.message });
        }
      }
      return { ok: erros.length === 0 && acoes.length > 0, acoes, erros, log: '', dica: acoes.length ? undefined : 'nenhuma regra casou: confira "on", o texto/comando e o cooldown' };
    }

    // tier code: roda o processo host em modo simulação (sem executar ações de verdade)
    const args = [];
    if (/node(\.exe)?$/i.test(path.basename(process.execPath))) args.push(path.join(process.cwd(), 'server', 'index.js'));
    const proc = spawn(process.execPath, args, {
      env: { ...process.env, CASTDECK_PLUGIN_HOST: pasta, CASTDECK_PLUGIN_SIM: '1', CASTDECK_DATA: this.dataDir },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const terminou = new Promise((resolve) => {
      const t = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        resolve('timeout');
      }, 8000 + segundos * 1000);
      let buf = '';
      proc.stdout.on('data', (chunk) => {
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
          if (msg.type === 'sim') acoes.push({ pluginId: manifesto.id, acao: { type: msg.method, ...(msg.params || {}) } });
          else if (msg.type === 'log') saidaLog += msg.line + '\n';
          else if (msg.type === 'fatal') {
            erros.push({ codigo: 'FALHA_ATIVACAO', mensagem: msg.error, dica: 'o plugin lançou erro ao ativar' });
            clearTimeout(t);
            resolve('fatal');
          } else if (msg.type === 'ready' && !listaEventos.length) {
            clearTimeout(t);
            try {
              proc.kill('SIGKILL');
            } catch {}
            resolve('pronto');
          }
        }
      });
      proc.stderr.on('data', (d) => (saidaLog += String(d)));
      proc.on('exit', () => {
        clearTimeout(t);
        resolve('saiu');
      });
      // manda os eventos depois de ativar
      const enviarEventos = async () => {
        await new Promise((r) => setTimeout(r, 1200));
        for (const ev of listaEventos) {
          const nome = ev.tipo === 'chat' ? 'chat' : ev.tipo;
          try {
            proc.stdin.write(JSON.stringify({ type: 'event', name: nome, payload: ev }) + '\n');
          } catch {}
          await new Promise((r) => setTimeout(r, 250));
        }
        if (segundos) await new Promise((r) => setTimeout(r, segundos * 1000));
        try {
          proc.kill('SIGKILL');
        } catch {}
        resolve('fim');
      };
      enviarEventos();
    });
    const motivo = await terminou;
    return {
      ok: erros.length === 0,
      acoes,
      erros,
      log: saidaLog.slice(-4000),
      motivo,
      dica: acoes.length ? undefined : 'o plugin ativou mas não pediu nenhuma ação nesses eventos: verifique o filtro do evento',
    };
  }
}
