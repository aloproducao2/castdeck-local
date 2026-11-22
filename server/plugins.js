// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Gerenciador de plugins: instala/atualiza/ativa, guarda consentimentos, executa ações e mantém auditoria.
// Tudo fica em DATA/plugins — fora do executável, sobrevive a updates.
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { readZip } from './zip.js';
import { PluginRuntime } from './plugin-runtime.js';
import { MotorDeclarativo } from './plugin-declarative.js';
import { CatalogClient } from './plugin-catalog.js';
import {
  API_VERSION,
  CAPABILITIES,
  CAPACIDADES_SENSIVEIS,
  descreverPermissoes,
  descreverPermissoesDetalhado,
  hostPermitido,
  normalizarPermissoes,
  validarManifesto,
  validarPacote,
  vence,
} from './plugin-manifest.js';

const MAX_LOG = 200 * 1024;

export class PluginManager extends EventEmitter {
  constructor({ dataDir, appVersion, catalogUrl = '', logger = console, acoesCliente = null }) {
    super();
    this.dir = path.join(dataDir, 'plugins');
    this.stateFile = path.join(this.dir, 'state.json');
    this.auditFile = path.join(this.dir, 'audit.log');
    this.appVersion = appVersion;
    this.catalogUrl = catalogUrl;
    this.log = logger;
    this.acoesCliente = acoesCliente; // fn({studioId, type, payload}) -> envia ao estúdio
    this.state = { plugins: {}, revoked: {} };
    this.runtimes = new Map(); // id -> PluginRuntime
    this.catalogoClient = new CatalogClient({
      url: this.catalogUrl,
      cacheFile: path.join(this.dir, 'catalog.json'),
      log: (l) => this.log.log(l),
    });
    this.declarativos = new MotorDeclarativo({
      executarAcao: (ctx) => this.executarAcao(ctx),
      log: (l) => this.log.log(l),
    });
    this.prontos = false;
  }

  async carregar() {
    await fsp.mkdir(this.dir, { recursive: true });
    try {
      const lido = JSON.parse(await fsp.readFile(this.stateFile, 'utf8'));
      this.state = { plugins: lido.plugins || {}, revoked: lido.revoked || {} };
    } catch {}
    this.prontos = true;
    // ativa o que estava ativo
    for (const [id, st] of Object.entries(this.state.plugins)) {
      if (!st?.enabled) continue;
      try {
        await this.ativar(id, { silencioso: true });
      } catch (e) {
        this.log.warn(`[plugins] ${id} não ativou: ${e.message}`);
      }
    }
    return this;
  }

  async salvar() {
    await fsp.mkdir(this.dir, { recursive: true });
    await fsp.writeFile(this.stateFile, JSON.stringify(this.state, null, 2), 'utf8');
  }

  auditar(evento) {
    const linha = JSON.stringify({ em: new Date().toISOString(), ...evento });
    fs.appendFile(this.auditFile, linha + '\n', () => {});
    this.emit('audit', evento);
  }

  pasta(id) {
    return path.join(this.dir, id);
  }

  manifestoDe(id) {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.pasta(id), 'plugin.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  // Lista para a UI: instalados + estado
  listar() {
    const out = [];
    for (const [id, st] of Object.entries(this.state.plugins)) {
      const m = this.manifestoDe(id);
      if (!m) continue;
      const rt = this.runtimes.get(id);
      out.push({
        id,
        nome: m.name,
        versao: m.version,
        autor: m.author?.name || '',
        licenca: m.license,
        tier: m.tier,
        descricao: m.description || '',
        instaladoEm: st.installedAt || null,
        ativo: !!st.enabled,
        rodando: !!rt?.ativo,
        quarentena: !!rt?.quarentena,
        erro: st.lastError || rt?.ultimoErro || null,
        permissivas: (m.permissions || []).length,
        permissoes: m.permissions || [],
        permissoesTexto: descreverPermissoes(m.permissions),
        permissoesDetalhe: descreverPermissoesDetalhado(m.permissions),
        eventos: Array.isArray(m.events)
          ? m.events.slice(0, 12)
          : m.tier === 'declarative'
            ? [...new Set((m.rules || []).map((r) => String(r.on || '').split('.')[0]).filter(Boolean))]
            : [],
        tags: Array.isArray(m.tags) ? m.tags.slice(0, 8).map((t) => String(t).slice(0, 24)) : [],
        // "como usar" e "como testar" declarados no manifesto (aparecem no card/Sobre e no Testar)
        uso: Array.isArray(m.usage) ? m.usage.slice(0, 6).map((u) => String(u).slice(0, 160)) : [],
        exemplos: Array.isArray(m.examples) ? m.examples.slice(0, 6) : [],
        teste: m.test && typeof m.test === "object" ? { tipo: m.test.tipo === "stage" ? "stage" : "chat", texto: String(m.test.texto || "").slice(0, 200) } : null,
        sensiveis: (m.permissions || []).filter((p) => CAPACIDADES_SENSIVEIS.has(p) || String(p).startsWith('network:')),
        concedidas: st.grants || [],
        painel: (m.panels || [])[0] || null,
        overlay: (m.overlays || [])[0] || null,
        settings: m.settings || [],
        regras: m.tier === 'declarative' ? (m.rules || []).length : 0,
        listaRegras: (m.rules || []).map((r) => ({
          rotulo:
            r.on === 'chat.comando'
              ? '!' + (r.comando || '?')
              : r.on === 'chat.regex'
                ? '/' + (r.padrao || '?') + '/'
                : r.on === 'chat.contem'
                  ? '"' + (r.texto || '?') + '"'
                  : r.on,
        })),
        configPendente: (() => {
          const obrigatorios = (m.settings || []).filter((c) => c.required).map((c) => c.key);
          if (!obrigatorios.length) return false;
          let salvo = {};
          try {
            salvo = JSON.parse(fs.readFileSync(path.join(this.pasta(id), 'settings.json'), 'utf8')) || {};
          } catch {}
          return obrigatorios.some((k) => !salvo[k]);
        })(),
        pronto: rt?.ativo || m.tier === 'declarative',
      });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome));
  }

  // Instala a partir de um .cdplug (zip) ou de uma pasta (plugins oficiais/dev)
  async instalar({ zipBuffer = null, pastaOrigem = null, substituir = true, instaladoPor = 'manual' }) {
    let entradas;
    let origemHash = '';
    if (zipBuffer) {
      entradas = readZip(zipBuffer);
      origemHash = crypto.createHash('sha256').update(zipBuffer).digest('hex');
      const checagem = validarPacote(entradas, { castdeckVersion: this.appVersion });
      if (!checagem.ok) throw new Error(checagem.erros.join('; '));
    } else if (pastaOrigem) {
      entradas = await this.lerPasta(pastaOrigem);
      origemHash = crypto.createHash('sha256').update(JSON.stringify(entradas.map((e) => e.name))).digest('hex');
    } else {
      throw new Error('envie um arquivo .cdplug ou uma pasta');
    }
    const manifestoBruto = entradas.find((e) => /(^|\/)plugin\.json$/.test(e.name));
    if (!manifestoBruto) throw new Error('pacote sem plugin.json');
    let manifesto;
    try {
      manifesto = JSON.parse(manifestoBruto.data.toString('utf8'));
    } catch (e) {
      throw new Error(`plugin.json inválido: ${e.message}`);
    }
    if (this.revogado(manifesto.id, manifesto.version)) throw new Error('esta versão foi revogada pelo catálogo');
    const v = validarManifesto(manifesto, { castdeckVersion: this.appVersion });
    if (!v.ok) throw new Error(v.erros.join('; '));
    const id = manifesto.id;
    if (this.state.plugins[id]?.revoked) throw new Error('esta versão foi revogada pelo catálogo');
    const destino = this.pasta(id);
    const jaTem = !!this.state.plugins[id];
    if (jaTem && !substituir) throw new Error('plugin já instalado');

    // grava em pasta temporária e troca no final (instalação atômica)
    const tmp = destino + '.novo';
    await fsp.rm(tmp, { recursive: true, force: true });
    await fsp.mkdir(tmp, { recursive: true });
    for (const e of entradas) {
      const rel = e.name.replace(/^\.?\//, '');
      const alvo = path.join(tmp, rel);
      if (!alvo.startsWith(tmp)) continue; // zip-slip
      await fsp.mkdir(path.dirname(alvo), { recursive: true });
      await fsp.writeFile(alvo, e.data);
    }
    // preserva settings/data do plugin já instalado
    if (jaTem) {
      for (const sub of ['settings.json', 'data']) {
        const antigo = path.join(destino, sub);
        const novo = path.join(tmp, sub);
        if (fs.existsSync(antigo) && !fs.existsSync(novo)) {
          await fsp.cp(antigo, novo, { recursive: true }).catch(() => {});
        }
      }
    }
    if (this.runtimes.has(id)) this.pararPlugin(id);
    await fsp.rm(destino, { recursive: true, force: true });
    await fsp.rename(tmp, destino);
    await fsp.writeFile(path.join(destino, 'package.hash'), origemHash, 'utf8').catch(() => {});

    this.state.plugins[id] = {
      ...(this.state.plugins[id] || {}),
      version: manifesto.version,
      enabled: this.state.plugins[id]?.enabled ?? false,
      installedAt: new Date().toISOString(),
      instaladoPor,
      originHash: origemHash,
      lastError: null,
    };
    await this.salvar();
    this.auditar({ tipo: 'instalar', id, versao: manifesto.version, hash: origemHash, por: instaladoPor });
    this.log.log(`[plugins] ${id} ${manifesto.version} instalado`);
    return { id, versao: manifesto.version, manifesto, atualizado: jaTem };
  }

  // Instala a partir de uma lista de arquivos enviada pelo navegador (pasta local escolhida com
  // <input webkitdirectory>): [{ nome: 'plugin.json', conteudoBase64 }]. Mesmo caminho de validação do .cdplug.
  async instalarArquivos(arquivos, { instaladoPor = 'pasta-local' } = {}) {
    if (!Array.isArray(arquivos) || !arquivos.length) throw new Error('nenhum arquivo enviado');
    const entradas = [];
    let total = 0;
    for (const a of arquivos) {
      const nome = String(a.nome || a.name || '')
        .replace(/\\/g, '/')
        .replace(/^\.?\//, '');
      if (!nome || nome.includes('..') || nome.startsWith('/')) throw new Error('caminho inválido: ' + nome);
      const dados = Buffer.from(String(a.conteudoBase64 || a.base64 || ''), 'base64');
      total += dados.length;
      if (total > 20 * 1024 * 1024) throw new Error('pasta maior que 20 MB');
      entradas.push({ name: nome, data: dados });
    }
    const checagem = validarPacote(entradas, { castdeckVersion: this.appVersion });
    if (!checagem.ok) throw new Error(checagem.erros.join('; '));
    const manifesto = JSON.parse(entradas.find((e) => /(^|\/)plugin\.json$/.test(e.name)).data.toString('utf8'));
    const v = validarManifesto(manifesto, { castdeckVersion: this.appVersion });
    if (!v.ok) throw new Error(v.erros.join('; '));
    if (this.revogado(manifesto.id, manifesto.version)) throw new Error('esta versão foi revogada pelo catálogo');

    const destino = this.pasta(manifesto.id);
    const jaTem = !!this.state.plugins[manifesto.id];
    const tmp = destino + '.novo';
    await fsp.rm(tmp, { recursive: true, force: true });
    await fsp.mkdir(tmp, { recursive: true });
    for (const e of entradas) {
      const alvo = path.join(tmp, e.name);
      if (!alvo.startsWith(tmp)) continue;
      await fsp.mkdir(path.dirname(alvo), { recursive: true });
      await fsp.writeFile(alvo, e.data);
    }
    if (jaTem) {
      for (const sub of ['settings.json', 'data']) {
        const antigo = path.join(destino, sub);
        const novo = path.join(tmp, sub);
        if (fs.existsSync(antigo) && !fs.existsSync(novo)) await fsp.cp(antigo, novo, { recursive: true }).catch(() => {});
      }
    }
    if (this.runtimes.has(manifesto.id)) this.pararPlugin(manifesto.id);
    await fsp.rm(destino, { recursive: true, force: true });
    await fsp.rename(tmp, destino);
    const hash = crypto.createHash('sha256').update(JSON.stringify(entradas.map((e) => [e.name, e.data.length]))).digest('hex');
    await fsp.writeFile(path.join(destino, 'package.hash'), hash, 'utf8').catch(() => {});
    this.state.plugins[manifesto.id] = {
      ...(this.state.plugins[manifesto.id] || {}),
      version: manifesto.version,
      enabled: this.state.plugins[manifesto.id]?.enabled ?? false,
      installedAt: new Date().toISOString(),
      instaladoPor,
      originHash: hash,
      lastError: null,
    };
    await this.salvar();
    this.auditar({ tipo: 'instalar', id: manifesto.id, versao: manifesto.version, por: instaladoPor });
    this.log.log(`[plugins] ${manifesto.id} ${manifesto.version} instalado (${instaladoPor})`);
    return { id: manifesto.id, versao: manifesto.version, manifesto, atualizado: jaTem };
  }

  async lerPasta(origem) {
    const out = [];
    async function andar(dir, base = '') {
      for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
        if (['node_modules', 'data', '.git'].includes(e.name)) continue;
        const full = path.join(dir, e.name);
        const rel = base ? `${base}/${e.name}` : e.name;
        if (e.isDirectory()) await andar(full, rel);
        else out.push({ name: rel, data: await fsp.readFile(full) });
      }
    }
    await andar(origem);
    const checagem = validarPacote(out, { castdeckVersion: this.appVersion });
    if (!checagem.ok) throw new Error(checagem.erros.join('; '));
    return out;
  }

  async remover(id) {
    if (!this.state.plugins[id]) throw new Error('plugin não encontrado');
    this.pararPlugin(id);
    this.declarativos.remover(id);
    await fsp.rm(this.pasta(id), { recursive: true, force: true });
    delete this.state.plugins[id];
    await this.salvar();
    this.auditar({ tipo: 'remover', id });
    this.emit('mudou');
    return true;
  }

  async conceder(id, permissoes) {
    const m = this.manifestoDe(id);
    if (!m) throw new Error('plugin não encontrado');
    const pedidas = new Set(m.permissions || []);
    const lista = (permissoes || []).filter((p) => pedidas.has(p));
    const faltando = [...pedidas].filter((p) => !lista.includes(p) && (CAPACIDADES_SENSIVEIS.has(p) || String(p).startsWith('network:')));
    this.state.plugins[id] = { ...(this.state.plugins[id] || {}), grants: lista, lastError: null };
    await this.salvar();
    this.auditar({ tipo: 'consentimento', id, permissoes: lista });
    return { faltando };
  }

  efetivas(id) {
    const m = this.manifestoDe(id);
    if (!m) return { caps: new Set(), hosts: [] };
    const concedidas = this.state.plugins[id]?.grants || [];
    const declaradas = (m.permissions || []).filter((p) => !CAPACIDADES_SENSIVEIS.has(p) && !String(p).startsWith('network:'));
    return normalizarPermissoes([...new Set([...declaradas, ...concedidas])]);
  }

  async ativar(id, { silencioso = false } = {}) {
    if (!this.state.plugins[id]) throw new Error('plugin não encontrado');
    const m = this.manifestoDe(id);
    if (!m) throw new Error('manifesto não encontrado');
    if (this.revogado(id, m.version)) throw new Error('esta versão foi revogada pelo catálogo; atualize o plugin');
    const sensiveis = (m.permissions || []).filter((p) => CAPACIDADES_SENSIVEIS.has(p) || String(p).startsWith('network:'));
    const concedidas = this.state.plugins[id]?.grants || [];
    const faltando = sensiveis.filter((p) => !concedidas.includes(p));
    if (faltando.length) throw new Error(`permissões não aprovadas: ${descreverPermissoes(faltando).join(', ')}`);

    this.pararPlugin(id);
    if (m.tier === 'declarative') {
      this.declarativos.registrar(m);
    } else {
      const rt = new PluginRuntime({
        manifest: m,
        dir: this.pasta(id),
        dataDir: path.join(this.pasta(id), 'data'),
        onAction: (ctx) => this.executarAcao({ ...ctx, caps: this.efetivas(id).caps, hosts: this.efetivas(id).hosts }),
        onLog: (l) => this.escreverLog(id, l),
      });
      this.runtimes.set(id, rt);
      const ok = await rt.iniciar();
      if (!ok) {
        this.state.plugins[id].enabled = false;
        this.state.plugins[id].lastError = rt.ultimoErro || 'não iniciou';
        await this.salvar();
        throw new Error(rt.ultimoErro || 'o plugin não iniciou');
      }
    }
    this.state.plugins[id].enabled = true;
    this.state.plugins[id].lastError = null;
    await this.salvar();
    this.auditar({ tipo: 'ativar', id, versao: m.version });
    if (!silencioso) this.emit('mudou');
    return true;
  }

  async desativar(id) {
    this.pararPlugin(id);
    this.declarativos.remover(id);
    if (this.state.plugins[id]) {
      this.state.plugins[id].enabled = false;
      await this.salvar();
    }
    this.auditar({ tipo: 'desativar', id });
    this.emit('mudou');
    return true;
  }

  async desativarTodos() {
    for (const id of Object.keys(this.state.plugins)) await this.desativar(id);
    return true;
  }

  pararPlugin(id) {
    const rt = this.runtimes.get(id);
    if (rt) {
      rt.parar();
      this.runtimes.delete(id);
    }
    this.declarativos.remover(id);
  }

  escreverLog(id, linha) {
    const arquivo = path.join(this.pasta(id), 'log.txt');
    const texto = `${new Date().toISOString()} ${linha}\n`;
    fs.appendFile(arquivo, texto, () => {
      try {
        const st = fs.statSync(arquivo);
        if (st.size > MAX_LOG) fs.writeFileSync(arquivo, texto, 'utf8');
      } catch {}
    });
    this.emit('log', { id, linha });
  }

  lerLog(id) {
    try {
      const t = fs.readFileSync(path.join(this.pasta(id), 'log.txt'), 'utf8');
      return t.split('\n').slice(-300).join('\n');
    } catch {
      return '';
    }
  }

  // ---------- eventos ----------
  async emitirEvento(nome, payload = {}) {
    let executadas = [];
    try {
      executadas = await this.declarativos.emitir({ tipo: nome, ...payload });
    } catch (e) {
      this.log.warn(`[plugins] evento ${nome}: ${e.message}`);
    }
    for (const [id, rt] of this.runtimes) {
      if (!rt.ativo) continue;
      const caps = this.efetivas(id).caps;
      const querChat = nome === 'chat' && caps.has('events:chat');
      const querStage = (nome === 'stage' || nome === 'scene' || nome === 'live') && caps.has('events:stage');
      const querGrav = nome === 'gravacao' && caps.has('events:recording');
      if (querChat || querStage || querGrav) rt.enviarEvento(nome, payload);
    }
    return executadas;
  }

  // executa uma ação pedida por plugin declarativo (ou pelo processo filho)
  async executarAcao({ pluginId, caps, hosts, acao = {}, method = '', params = {} }) {
    const tipo = acao.type || acao.tipo || method;
    const tem = (cap) => !!caps?.has(cap);
    const negar = (msg) => ({ ok: false, error: msg });
    switch (tipo) {
      case 'overlay.show':
      case 'overlay:show': {
        if (!tem('overlay:show')) return negar('sem permissão overlay:show');
        const spec = acao.spec ||
          params.spec || {
            titulo: acao.titulo || '',
            texto: acao.texto || '',
            cor: acao.cor || '',
          };
        const segundos = Number(acao.segundos ?? params.segundos ?? 6) || 6;
        this.acoesCliente?.({ type: 'plugin-overlay', payload: { id: pluginId, spec, segundos } });
        this.auditar({ tipo: 'acao', id: pluginId, acao: 'overlay.show', titulo: String(spec.titulo || '').slice(0, 80) });
        return { ok: true };
      }
      case 'overlay.hide':
      case 'overlay:hide':
        if (!tem('overlay:show')) return negar('sem permissão overlay:show');
        this.acoesCliente?.({ type: 'plugin-overlay-hide', payload: { id: pluginId } });
        return { ok: true };
      case 'chat.send':
      case 'chat:send': {
        if (!tem('chat:send')) return negar('sem permissão chat:send');
        const texto = String(acao.texto ?? params.texto ?? '').slice(0, 400);
        if (!texto) return negar('texto vazio');
        // Resposta no chat: publica no chat do estúdio (operador e convidados veem). Responder direto na rede
        // (YouTube/Twitch) exige integração de escrita, que ainda não existe nesta versão — o log avisa.
        this.emit('chat-local', { pluginId, texto });
        this.auditar({ tipo: 'acao', id: pluginId, acao: 'chat.send' });
        this.log.log(`[plugin:${pluginId}] chat.send (estúdio): ${texto.slice(0, 120)}`);
        return { ok: true, enviado: texto, destino: 'estudio' };
      }
      case 'panel.open':
      case 'panel:open':
        this.acoesCliente?.({ type: 'plugin-panel', payload: { id: pluginId } });
        return { ok: true };
      case 'http':
      case 'http.request':
      case 'http:request': {
        if (!tem('network')) return negar('sem permissão de rede');
        const url = String(acao.url ?? params.url ?? '');
        if (!hostPermitido(url, hosts)) return negar(`endereço não permitido: ${url}`);
        const metodo = String(acao.method ?? params.method ?? 'GET').toUpperCase();
        try {
          const r = await fetch(url, {
            method: metodo,
            headers: { 'content-type': 'application/json', ...(acao.headers || params.headers || {}) },
            body: metodo === 'GET' || metodo === 'HEAD' ? undefined : JSON.stringify(acao.body ?? params.body ?? {}),
            signal: AbortSignal.timeout(6000),
          });
          const texto = await r.text();
          let json = null;
          try {
            json = JSON.parse(texto);
          } catch {}
          this.auditar({ tipo: 'acao', id: pluginId, acao: 'http', host: new URL(url).host, status: r.status });
          return { ok: r.ok, result: { status: r.status, json, text: json ? undefined : texto.slice(0, 4000) } };
        } catch (e) {
          return negar(`falha na requisição: ${e.message}`);
        }
      }
      case 'media.play':
      case 'media:play':
      case 'media.stop':
      case 'media:stop': {
        if (!tem('control:playout')) return negar('sem permissão control:playout');
        const idFonte = String(acao.id ?? acao.fonte ?? params.id ?? params.fonte ?? '');
        if (!idFonte) return negar('informe a mídia (id da fonte, ex.: media:3)');
        const tocar = !String(tipo).includes('stop');
        this.acoesCliente?.({ type: 'plugin-media', payload: { id: pluginId, fonte: idFonte, play: tocar } });
        this.auditar({ tipo: 'acao', id: pluginId, acao: tocar ? 'media.play' : 'media.stop', fonte: idFonte });
        return { ok: true };
      }
      case 'sound.play':
      case 'sound:play':
        this.acoesCliente?.({ type: 'plugin-sound', payload: { id: pluginId, sample: String(acao.id ?? params.id ?? '') } });
        return { ok: true };
      default:
        return negar(`ação desconhecida: ${tipo}`);
    }
  }

  // ---------- catálogo ----------
  async catalogo({ forcar = false } = {}) {
    const { indice, fonte, aviso } = await this.catalogoClient.obter({ forcar });
    if (!indice) return { plugins: [], origem: this.catalogUrl, erro: aviso || 'catálogo indisponível', fonte: 'nenhuma' };
    this.state.revoked = indice.revoked || {};
    await this.salvar();
    const instalados = new Set(Object.keys(this.state.plugins));
    const plugins = (indice.plugins || []).map((p) => {
      const v = (p.versions || []).find((x) => x.version === p.latest) || (p.versions || [])[0] || {};
      const perms = v.permissions || p.permissions || [];
      const detalhe = descreverPermissoesDetalhado(perms);
      const risco = detalhe.some((d) => d.risco === 'alto') ? 'alto' : detalhe.some((d) => d.risco === 'medio') ? 'medio' : 'baixo';
      return {
        id: p.id,
        nome: p.name,
        versao: p.latest || v.version,
        autor: p.author || '',
        resumo: p.summary || p.description || '',
        tier: p.tier || 'code',
        licenca: p.license || '',
        permissivas: perms.length,
        permissoes: perms,
        permissoesDetalhe: detalhe,
        risco,
        tags: Array.isArray(p.tags) ? p.tags : Array.isArray(p.keywords) ? p.keywords : [],
        oficial: p.official !== false && /^castdeck\./.test(p.id || ''),
        instalado: instalados.has(p.id),
        revogado: this.catalogoClient.revogado(indice, p.id, p.latest),
        arquivo: v.file || '',
        sha256: v.sha256 || '',
        bytes: v.size || 0,
      };
    });
    return { origem: this.catalogUrl, fonte, aviso, geradoEm: indice.generatedAt || null, plugins };
  }

  // Resolve o pacote do catálogo para instalar (o index.js baixa, confere o sha256 e chama instalar)
  async catalogoPacote(id) {
    const { indice, fonte, aviso } = await this.catalogoClient.obter();
    if (!indice) throw new Error(aviso || 'catálogo indisponível');
    const alvo = this.catalogoClient.resolver(indice, id);
    if (!alvo) throw new Error('plugin não encontrado no catálogo');
    if (this.catalogoClient.revogado(indice, id, alvo.versao.version)) throw new Error('esta versão foi revogada pelo catálogo');
    return { ...alvo, fonte };
  }

  // Test-drive: dispara um evento sintético NESTE plugin (executa de verdade para o usuário ver) e devolve
  // o que aconteceu. Serve para o botão "Testar" da aba Plugins.
  async testar(id, { tipo, usuario = 'teste', texto, fonteNome = 'Teste' } = {}) {
    const manifesto = this.manifestoDe(id);
    const exemplo = manifesto?.test && typeof manifesto.test === "object" ? manifesto.test : null;
    tipo = tipo || (exemplo?.tipo === "stage" ? "stage" : "chat");
    texto = texto || String(exemplo?.texto || "!oi");
    if (!this.state.plugins[id]) throw new Error('plugin não encontrado');
    const m = this.manifestoDe(id);
    if (!m) throw new Error('manifesto não encontrado');
    const efetivas = this.efetivas(id);
    const executadas = [];
    const evento =
      tipo === 'stage'
        ? { tipo: 'stage', acao: 'entrou', fonte: 'teste', fonteNome }
        : { tipo: 'chat', usuario, texto, rede: 'teste', args: String(texto).trim().split(/\s+/).slice(1) };
    if (m.tier === 'declarative') {
      const motor = new MotorDeclarativo({
        agora: () => Date.now(),
        log: () => {},
        executarAcao: async ({ acao }) => {
          const r = await this.executarAcao({ pluginId: id, caps: efetivas.caps, hosts: efetivas.hosts, acao });
          executadas.push({ acao: acao.type || acao.tipo, ok: r?.ok !== false, detalhe: acao.titulo || acao.texto || '' });
          return r;
        },
      });
      motor.registrar({ ...m, rules: (m.rules || []).map((r) => ({ ...r, cooldownSeg: 0 })) });
      await motor.emitir(evento);
    } else {
      const rt = this.runtimes.get(id);
      if (!rt?.ativo) throw new Error('o plugin não está rodando; ative para testar');
      // envia o evento e espera um instante para capturar as ações pedidas pelo plugin
      const capturadas = [];
      const onAction = (ctx) => {
        capturadas.push({ acao: ctx.method, ok: true });
        return { ok: true };
      };
      const original = rt.onAction;
      rt.onAction = async (ctx) => {
        const r = await this.executarAcao({ pluginId: id, caps: efetivas.caps, hosts: efetivas.hosts, method: ctx.method, params: ctx.params });
        capturadas.push({ acao: ctx.method, ok: r?.ok !== false });
        return r;
      };
      try {
        rt.enviarEvento(tipo === 'stage' ? 'stage' : 'chat', evento);
        // espera a primeira ação do plugin (até 3 s) e mais um instante para as demais
        const inicio = Date.now();
        while (Date.now() - inicio < 3000 && capturadas.length === 0) await new Promise((r) => setTimeout(r, 120));
        await new Promise((r) => setTimeout(r, 400));
      } finally {
        rt.onAction = original;
      }
      executadas.push(...capturadas);
    }
    this.auditar({ tipo: 'teste', id, acoes: executadas.length });
    return { ok: executadas.length > 0, acoes: executadas, evento: tipo, dica: executadas.length ? undefined : 'o plugin não reagiu a este evento; confira as regras/configuração' };
  }

  // Diagnóstico: checklist para a pessoa saber exatamente o que está errado e o que fazer.
  // Mesma ideia do "problemas do plugin" do OBS, mas com dicas em português.
  diagnosticar(id) {
    const m = this.manifestoDe(id);
    const st = this.state.plugins[id];
    if (!m || !st) return { ok: false, erro: 'plugin não instalado', checks: [] };
    const rt = this.runtimes.get(id);
    const checks = [];
    const add = (nome, ok, detalhe, dica) => checks.push({ nome, ok: !!ok, detalhe: detalhe || '', dica: dica || '' });

    add('manifesto', true, `${m.id} v${m.version} · ${m.tier === 'code' ? 'com código' : 'declarativo'}`);
    const compativel = vence(this.appVersion, m.engines?.castdeck || '*');
    add('compatível com este CastDeck', compativel, `app ${this.appVersion} · plugin pede ${m.engines?.castdeck || '*'}`, 'atualize o app ou o plugin');

    const perms = m.permissions || [];
    const concedidas = st.grants || [];
    const faltando = perms.filter((p) => (CAPACIDADES_SENSIVEIS.has(p) || String(p).startsWith("network:")) && !concedidas.includes(p));
    add('permissões aprovadas', faltando.length === 0, faltando.length ? `falta aprovar: ${faltando.join(', ')}` : `${perms.length} aprovada(s) (as demais são implícitas)`, 'clique em Ativar e aprove o pedido');

    const obrigatorios = (m.settings || []).filter((c) => c.required).map((c) => c.key);
    let salvo = {};
    try {
      salvo = JSON.parse(fs.readFileSync(path.join(this.pasta(id), 'settings.json'), 'utf8')) || {};
    } catch {}
    add(
      'configuração',
      !obrigatorios.some((k) => !salvo[k]),
      obrigatorios.length ? obrigatorios.map((k) => `${k}: ${salvo[k] ? 'ok' : 'vazio'}`).join(' · ') : 'nenhum campo obrigatório',
      'abra Configurar e preencha os campos em falta',
    );

    if (m.tier === 'code') {
      add('processo do plugin', !!rt?.ativo, rt?.ativo ? 'rodando em processo separado' : st.enabled ? 'não iniciou' : 'desligado', st.enabled ? 'veja o Log e clique em Reiniciar' : 'clique em Ativar');
      add('sem quarentena', !rt?.quarentena, rt?.quarentena ? String(rt.ultimoErro || 'falhas repetidas') : 'ok', 'corrija o erro mostrado no log e reinicie');
    } else {
      add('motor de regras', (m.rules || []).length > 0, `${(m.rules || []).length} regra(s)`, 'crie uma regra no editor de regras');
    }
    add('canal com o estúdio', !!this.acoesCliente, this.acoesCliente ? 'ok' : 'sem canal', 'reabra a janela do estúdio');
    add('último erro', !st.lastError, st.lastError ? String(st.lastError) : 'nenhum', 'veja o Log do plugin');

    return {
      ok: checks.every((c) => c.ok),
      id,
      nome: m.name,
      tier: m.tier,
      versao: m.version,
      checks,
      eventos: Array.isArray(m.events) ? m.events : m.tier === 'declarative' ? [...new Set((m.rules || []).map((r) => String(r.on || '').split('.')[0]))] : [],
    };
  }

  // Ação disparada por um botão do painel do plugin (ex.: iniciar o cronômetro, testar a luz).
  // O plugin recebe como evento "panel" na API: castdeck.events.on('panel', ({ nome, dados }) => ...).
  painelAcao(id, nome, dados = {}) {
    if (!this.state.plugins[id]) throw new Error('plugin não encontrado');
    const rt = this.runtimes.get(id);
    if (!rt?.ativo) throw new Error('o plugin não está ativo; ative para usar o painel');
    const ok = rt.enviarEvento('panel', { nome: String(nome || 'acao').slice(0, 60), dados: dados && typeof dados === 'object' ? dados : {} });
    if (!ok) throw new Error('não foi possível falar com o plugin');
    this.auditar({ tipo: 'painel', id, acao: String(nome || 'acao').slice(0, 60) });
    return { ok: true };
  }

  // Editor de regras dos plugins declarativos (a UI mostra formulário; aqui valida e grava)
  regrasDe(id) {
    const m = this.manifestoDe(id);
    if (!m) throw new Error('plugin não encontrado');
    if (m.tier !== 'declarative') throw new Error('este plugin não usa regras declarativas');
    return { regras: m.rules || [], permissoes: m.permissions || [] };
  }

  async salvarRegras(id, regras) {
    const pasta = this.pasta(id);
    const arquivo = path.join(pasta, 'plugin.json');
    const m = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    if (m.tier !== 'declarative') throw new Error('este plugin não usa regras declarativas');
    if (!Array.isArray(regras)) throw new Error('regras inválidas');
    const eventoValidos = new Set([
      'chat', 'chat.comando', 'chat.regex', 'chat.contem', 'doacao', 'stage.entrou', 'stage.saiu', 'scene.mudou', 'live.iniciou', 'live.encerrou', 'gravacao.salva',
    ]);
    const acaoValidas = new Set(['overlay.show', 'overlay.hide', 'chat.send', 'media.play', 'sound.play', 'panel.open', 'http.request']);
    const limpas = [];
    for (const [i, r] of regras.entries()) {
      if (!r || typeof r !== 'object') throw new Error('regra ' + (i + 1) + ' inválida');
      const on = String(r.on || '').trim();
      if (!eventoValidos.has(on)) throw new Error('regra ' + (i + 1) + ': evento inválido (' + on + ')');
      const doList = Array.isArray(r.do) ? r.do : [];
      if (!doList.length) throw new Error('regra ' + (i + 1) + ': adicione ao menos uma ação');
      const acoes = [];
      for (const a of doList) {
        const type = String(a.type || '').trim();
        if (!acaoValidas.has(type)) throw new Error('regra ' + (i + 1) + ': ação inválida (' + type + ')');
        const limpa = { type };
        if (type === 'chat.send') {
          limpa.texto = String(a.texto || '').slice(0, 400);
          if (!limpa.texto) throw new Error('regra ' + (i + 1) + ': texto da resposta vazio');
        } else if (type === 'overlay.show') {
          limpa.titulo = String(a.titulo || '').slice(0, 80);
          limpa.texto = String(a.texto || '').slice(0, 240);
          if (/^#[0-9a-f]{3,8}$/i.test(String(a.cor || ''))) limpa.cor = String(a.cor);
          limpa.segundos = Math.max(1, Math.min(60, Number(a.segundos) || 6));
        } else if (type === 'media.play') {
          limpa.id = String(a.id || '').slice(0, 120);
        } else if (type === 'sound.play') {
          limpa.id = String(a.id || '').slice(0, 120);
        } else if (type === 'http.request') {
          limpa.url = String(a.url || '').slice(0, 500);
          limpa.method = /^post$/i.test(String(a.method || '')) ? 'POST' : 'GET';
        }
        acoes.push(limpa);
      }
      const regra = { on, do: acoes };
      if (r.comando) regra.comando = String(r.comando).replace(/^!/, '').slice(0, 40);
      if (r.padrao) regra.padrao = String(r.padrao).slice(0, 200);
      if (r.texto) regra.texto = String(r.texto).slice(0, 120);
      if (on === 'chat.regex' && !regra.padrao) throw new Error('regra ' + (i + 1) + ': regex vazia');
      if (on === 'chat.comando' && !regra.comando) throw new Error('regra ' + (i + 1) + ': comando vazio');
      if (on === 'chat.contem' && !regra.texto) throw new Error('regra ' + (i + 1) + ': texto do gatilho vazio');
      const cd = Number(r.cooldownSeg);
      if (Number.isFinite(cd) && cd >= 0) regra.cooldownSeg = Math.min(3600, Math.round(cd));
      limpas.push(regra);
    }
    const atualizado = { ...m, rules: limpas, version: m.version };
    const v = validarManifesto(atualizado, { castdeckVersion: this.appVersion });
    if (!v.ok) throw new Error(v.erros.join('; '));
    fs.writeFileSync(arquivo, JSON.stringify(atualizado, null, 2) + '\n', 'utf8');
    this.auditar({ tipo: 'regras', id, total: limpas.length });
    // recarrega o plugin declarativo para valer na hora
    if (this.state.plugins[id]?.enabled) {
      this.declarativos.registrar(atualizado);
    }
    this.emit('mudou');
    return { ok: true, regras: limpas };
  }

  revogado(id, versao = '') {
    const lista = this.state.revoked || {};
    const arr = Array.isArray(lista) ? lista : Object.values(lista);
    return arr.some((r) => (typeof r === 'string' ? r === id : r?.id === id && (!r.version || r.version === versao)));
  }

  info() {
    return {
      api: API_VERSION,
      total: Object.keys(this.state.plugins).length,
      ativos: this.listar().filter((p) => p.ativo).length,
      capacidades: CAPABILITIES,
      sensiveis: [...CAPACIDADES_SENSIVEIS],
    };
  }
}
