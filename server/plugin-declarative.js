// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Motor dos plugins declarativos (nível A): casa gatilhos e executa ações, sem código de terceiro.
import { normalizarPermissoes } from './plugin-manifest.js';

const COOLDOWN_PADRAO = 15; // segundos, por regra+usuário (evita spam no chat)

function interpolar(texto, vars) {
  return String(texto ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, chave) => {
    const valor = chave.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), vars);
    return valor == null ? '' : String(valor);
  });
}

function pegar(lista) {
  if (!Array.isArray(lista)) return [];
  return lista.filter((x) => x && typeof x === 'object');
}

// Regras do manifesto: [{ on: 'chat.regex'|'chat.contem'|'stage.entrou'|'stage.saiu'|'scene.mudou'|'live.iniciou'|'live.encerrou', ... , do: [{type, ...}] }]
// Também aceita o formato antigo { triggers: [...], actions: [...] } (ação única).
export function regrasDo(manifesto) {
  if (Array.isArray(manifesto?.rules)) return pegar(manifesto.rules);
  const gatilhos = pegar(manifesto?.triggers);
  const acoes = pegar(manifesto?.actions);
  if (gatilhos.length && acoes.length) return gatilhos.map((t) => ({ ...t, do: acoes }));
  return [];
}

export class MotorDeclarativo {
  constructor({ executarAcao, log = console.log, agora = () => Date.now() } = {}) {
    this.executarAcao = executarAcao;
    this.log = log;
    this.agora = agora;
    this.cooldowns = new Map(); // `${pluginId}|${regra}|${quem}` -> timestamp
    this.plugins = new Map(); // id -> { manifesto, caps, hosts }
  }

  registrar(manifesto) {
    const { caps, hosts } = normalizarPermissoes(manifesto.permissions);
    this.plugins.set(manifesto.id, { manifesto, caps, hosts, regras: regrasDo(manifesto) });
  }

  remover(id) {
    this.plugins.delete(id);
  }

  ativo(id) {
    return this.plugins.has(id);
  }

  casar(regra, evento) {
    const tipo = regra.on || regra.type;
    switch (tipo) {
      case 'chat':
      case 'chat.contem':
        return evento.tipo === 'chat' && !!regra.texto && String(evento.texto || '').toLowerCase().includes(String(regra.texto).toLowerCase());
      case 'chat.regex': {
        if (evento.tipo !== 'chat' || !regra.padrao) return false;
        try {
          return new RegExp(regra.padrao, regra.flags || 'i').test(String(evento.texto || ''));
        } catch {
          return false;
        }
      }
      case 'chat.comando': {
        if (evento.tipo !== 'chat' || !regra.comando) return false;
        const m = String(evento.texto || '').trim().match(/^[!/](\w+)\b\s*(.*)$/);
        return !!m && m[1].toLowerCase() === String(regra.comando).toLowerCase();
      }
      case 'doacao':
        return evento.tipo === 'chat' && !!evento.doacao;
      case 'stage.entrou':
        return evento.tipo === 'stage' && evento.acao === 'entrou';
      case 'stage.saiu':
        return evento.tipo === 'stage' && evento.acao === 'saiu';
      case 'scene.mudou':
        return evento.tipo === 'scene';
      case 'live.iniciou':
        return evento.tipo === 'live' && evento.acao === 'iniciou';
      case 'live.encerrou':
        return evento.tipo === 'live' && evento.acao === 'encerrou';
      case 'gravacao.salva':
        return evento.tipo === 'gravacao';
      default:
        return false;
    }
  }

  // Retorna a lista de ações executadas (para teste/log)
  async emitir(evento) {
    const executadas = [];
    for (const [id, dados] of this.plugins) {
      for (const regra of dados.regras) {
        let casou = false;
        try {
          casou = this.casar(regra, evento);
        } catch {
          casou = false;
        }
        if (!casou) continue;
        // filtro opcional por permissão no evento (ex.: só chat de rede X)
        if (regra.rede && evento.rede && String(regra.rede).toLowerCase() !== String(evento.rede).toLowerCase()) continue;

        const cooldown = Number.isFinite(regra.cooldownSeg) ? regra.cooldownSeg : COOLDOWN_PADRAO;
        const quem = evento.usuario || evento.texto || '*';
        const chave = `${id}|${regra.on || regra.type}|${quem}`;
        const agora = this.agora();
        const ultimo = this.cooldowns.get(chave) || 0;
        // o primeiro disparo nunca é barrado; o intervalo só vale a partir do segundo
        if (cooldown > 0 && ultimo > 0 && agora - ultimo < cooldown * 1000) continue;
        this.cooldowns.set(chave, agora);

        const vars = {
          usuario: evento.usuario || '',
          texto: evento.texto || '',
          rede: evento.rede || '',
          fonte: evento.fonte || '',
          cena: evento.cena || '',
          titulo: evento.titulo || '',
          args: evento.args || [],
          arg1: (evento.args || [])[0] || '',
          arg2: (evento.args || [])[1] || '',
          agora: new Date(agora).toLocaleTimeString('pt-BR'),
        };
        for (const acao of pegar(regra.do || regra.actions)) {
          const resolvida = { ...acao };
          for (const campo of ['titulo', 'texto', 'mensagem', 'url', 'cor', 'segundos']) {
            if (typeof resolvida[campo] === 'string') resolvida[campo] = interpolar(resolvida[campo], vars);
          }
          try {
            const r = await this.executarAcao({ pluginId: id, caps: dados.caps, hosts: dados.hosts, acao: resolvida, evento });
            executadas.push({ pluginId: id, acao: resolvida.type || resolvida.tipo, ok: r?.ok !== false });
            this.log(`[plugin:${id}] ${resolvida.type || resolvida.tipo} → ${r?.ok === false ? 'falhou' : 'ok'}`);
          } catch (e) {
            this.log(`[plugin:${id}] erro ao executar ${resolvida.type || resolvida.tipo}: ${e.message}`);
          }
        }
      }
    }
    return executadas;
  }
}
