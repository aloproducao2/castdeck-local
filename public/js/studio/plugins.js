// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Aba "Plugins" do estúdio: instalar, ativar com consentimento, configurar, testar, editar regras, ver
// atividade e explorar o catálogo. O plugin nunca desenha direto no vídeo: ele PEDE, o app executa.
const T = (s) => (window.CDi18n?.t ? window.CDi18n.t(s) : s);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const api = async (rota, opt = {}) => {
  const r = await fetch('/api' + rota, {
    headers: { 'content-type': 'application/json', ...(opt.headers || {}) },
    ...opt,
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const texto = await r.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {}
  if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`);
  return json;
};

const EVENTOS = [
  ['chat.comando', T('Comando no chat (ex.: !oi)')],
  ['chat.regex', T('Chat que casa com uma expressão')],
  ['chat.contem', T('Chat que contém um texto')],
  ['chat', T('Qualquer mensagem do chat')],
  ['doacao', T('Mensagem com doação')],
  ['stage.entrou', T('Alguém entrou no palco')],
  ['stage.saiu', T('Alguém saiu do palco')],
  ['scene.mudou', T('Cena/layout mudou')],
  ['live.iniciou', T('A live começou')],
  ['live.encerrou', T('A live terminou')],
];

const ACOES = [
  ['overlay.show', T('Mostrar aviso na tela')],
  ['chat.send', T('Responder no chat do estúdio')],
  ['sound.play', T('Tocar um som do Pad')],
  ['overlay.hide', T('Esconder o aviso')],
];

let seq = 0;
const novoId = (p) => `${p}-${++seq}`;

export function createPlugins({ S, $, toast, modal, confirmDialog, comp }) {
  let lista = [];
  let catalogo = null;
  let carregado = false;
  let aba = 'instalados';
  let busca = '';
  let audit = [];
  let abertaRegra = null;

// Janela simples (a API do app recebe HTML + onMount e resolve true/false).
function janela(titulo, corpo, { ok = T('Fechar'), cancel = '', wide = false, onOk } = {}) {
  return modal(
    `<h3>${esc(titulo)}</h3><div class="plg-modal${wide ? ' wide' : ''}">${corpo}</div>
     <div class="modal-actions">${cancel ? `<button class="btn" data-close>${esc(cancel)}</button>` : ''}
     <button class="btn ${cancel ? 'primary' : ''}" data-ok>${esc(ok)}</button></div>`,
    {
      onMount: (el, close) => {
        const botao = el.querySelector('[data-ok]');
        botao.onclick = async () => {
          if (onOk) {
            const r = await onOk(el);
            if (r === false) return;
          }
          close(true);
        };
      },
    },
  );
}


  async function carregar() {
    try {
      const r = await api('/plugins');
      lista = r.lista || [];
      return r;
    } catch (e) {
      toast(T('Não foi possível ler os plugins: ') + e.message, 'err');
      lista = [];
      return { lista: [] };
    }
  }

  async function atualizar() {
    await carregar();
    if (catalogo === null) catalogo = await api('/plugins/catalog').catch((e) => ({ erro: e.message, plugins: [] }));
    if (aba === 'atividade') await carregarAtividade();
    render();
  }

  async function atualizarCatalogo() {
    catalogo = await api('/plugins/catalog?forcar=1').catch((e) => ({ erro: e.message, plugins: [] }));
    await atualizar();
  }

  async function carregarAtividade() {
    try {
      const r = await api('/plugins/audit');
      audit = (r.linhas || [])
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
        .reverse()
        .slice(0, 60);
    } catch {
      audit = [];
    }
  }

  // ---------- ações por plugin ----------
  async function ativar(p, permissoes) {
    await api(`/plugins/${encodeURIComponent(p.id)}/enable`, { method: 'POST', body: { permissoes } });
  }

  async function desativar(p) {
    await api(`/plugins/${encodeURIComponent(p.id)}/disable`, { method: 'POST', body: {} });
  }

  async function pedirPermissoes(p) {
    const sensiveis = p.sensiveis || [];
    const texto = sensiveis.map((perm) => `• ${p.permissoesTexto?.[(p.permissoes || []).indexOf(perm)] || perm}`).join('\n');
    const ok = await confirmDialog(
      `${T('Ativar')} “${p.nome}”${p.autor ? ` ${T('de')} ${p.autor}` : ''}?\n\n` + (sensiveis.length ? `${T('Este plugin quer:')}\n${texto}\n\n` : '') + T('Plugins rodam isolados, mas podem agir no seu estúdio. Ative apenas o que você confia.'),
      { ok: T('Ativar plugin') },
    );
    if (!ok) return false;
    await ativar(p, sensiveis);
    return true;
  }

  async function remover(p) {
    const ok = await confirmDialog(T(`Remover o plugin “${p.nome}”?`) + '\n\n' + T('As configurações dele serão apagadas.'), { ok: T('Remover'), danger: true });
    if (!ok) return;
    await api(`/plugins/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    toast(T('Plugin removido'), 'ok');
  }

  async function instalarArquivo(file) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return toast(T('Arquivo maior que 20 MB'), 'err');
    const buf = await file.arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    toast(T('Instalando plugin…'));
    try {
      await api('/plugins/install', { method: 'POST', body: { zipBase64: btoa(bin), nome: file.name } });
      toast(T('Plugin instalado — aprove as permissões para ativar.'), 'ok');
    } catch (e) {
      toast(T('Falha ao instalar: ') + e.message, 'err');
    }
  }

  // Instala a partir de uma pasta local do disco (webkitdirectory): o navegador envia os arquivos e o app
  // valida como se fosse um .cdplug. Funciona também no app empacotado.
  async function instalarPasta(input) {
    const arquivos = [...(input?.files || [])];
    if (!arquivos.length) return;
    if (arquivos.length > 400) return toast(T("Pasta com arquivos demais (máximo 400)."), "err");
    let total = 0;
    const lista = [];
    for (const f of arquivos) {
      const rel = String(f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name;
      if (!rel || rel.startsWith(".") || rel.includes("node_modules/") || rel.includes("__MACOSX")) continue;
      total += f.size;
      if (total > 20 * 1024 * 1024) return toast(T("A pasta passa de 20 MB (limite de plugin)."), "err");
      const buf = await f.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      lista.push({ nome: rel, conteudoBase64: btoa(bin) });
    }
    if (!lista.some((x) => /(^|\/)plugin\.json$/.test(x.nome))) {
      return toast(T("A pasta escolhida não tem plugin.json na raiz. Escolha a pasta do plugin (com plugin.json dentro)."), "err");
    }
    toast(T("Instalando plugin da pasta…"));
    try {
      const r = await api("/plugins/install", { method: "POST", body: { arquivos: lista } });
      toast(T("Plugin instalado — aprove as permissões para ativar."), "ok");
      aba = "instalados";
      await atualizar();
      return r;
    } catch (e) {
      toast(T("Falha ao instalar a pasta: ") + e.message, "err");
    }
  }

  async function testar(p) {
    try {
      const r = await api(`/plugins/${encodeURIComponent(p.id)}/test`, { method: 'POST', body: { tipo: 'chat', texto: '!oi', usuario: 'teste' } });
      const acoes = (r.acoes || []).map((a) => `• ${a.acao}${a.detalhe ? ` — ${a.detalhe}` : ''}`).join('\n');
      if (r.ok) {
        toast(T('Plugin respondeu: ') + (r.acoes || []).map((a) => a.acao).join(', '), 'ok');
        if (comp) comp.setPluginOverlay?.({ titulo: p.nome, texto: T('Teste do plugin funcionando'), cor: '#3ddc97' }, 4);
      } else {
        toast(T('Nada aconteceu: ') + (r.dica || ''), 'err');
      }
      janela(T('Teste') + ' — ' + p.nome, `<pre class="plg-log">${esc(acoes || T('(nenhuma ação)'))}</pre>`);
    } catch (e) {
      toast(T('Falha no teste: ') + e.message, 'err');
    }
  }

  // ---------- configuração automática (a partir do manifesto) ----------
  async function configurar(p) {
    if ((p.settings || []).length) return configurarFormulario(p);
    if (p.painel?.entry) return abrirPainel(p);
    toast(T('Este plugin não tem configuração.'));
  }

  async function configurarFormulario(p) {
    let dados = { settings: {}, campos: p.settings || [] };
    try {
      dados = await api(`/plugins/${encodeURIComponent(p.id)}/settings`);
    } catch {}
    const campos = dados.campos?.length ? dados.campos : p.settings || [];
    const valor = dados.settings || {};
    const corpo = campos
      .map((c, i) => {
        const v = valor[c.key];
        const id = `cf-${i}`;
        if (c.type === 'checkbox')
          return `<label class="plg-field check"><input type="checkbox" id="${id}" data-key="${esc(c.key)}" ${v ? 'checked' : ''}> <span>${esc(c.label || c.key)}</span></label>`;
        const tipo = c.type === 'number' ? 'number' : c.type === 'secret' ? 'password' : 'text';
        return `<label class="plg-field" for="${id}"><span>${esc(c.label || c.key)}</span><input type="${tipo}" id="${id}" data-key="${esc(c.key)}" value="${esc(v ?? '')}" ${c.required ? 'required' : ''}></label>`;
      })
      .join('');
    const ok = await janela(
      T('Configurar') + ' — ' + p.nome,
      `<div class="plg-form">${corpo || `<p class="hint">${T('Este plugin não declara campos de configuração.')}</p>`}</div>`,
      {
        ok: T('Salvar'),
        cancel: T('Cancelar'),
        onOk: async (el) => {
          const novo = {};
          el.querySelectorAll('.plg-form [data-key]').forEach((campo) => {
            novo[campo.dataset.key] = campo.type === 'checkbox' ? campo.checked : campo.type === 'number' ? Number(campo.value) || 0 : campo.value;
          });
          try {
            await api(`/plugins/${encodeURIComponent(p.id)}/settings`, { method: 'POST', body: novo });
            toast(T('Configuração salva'), 'ok');
          } catch (e) {
            toast(T('Falha ao salvar: ') + e.message, 'err');
            return false;
          }
        },
      },
    );
    if (ok && p.ativo) await testar(p);
  }

  function abrirPainel(p) {
    if (!p.painel?.entry) return;
    const url = `/api/plugins/${encodeURIComponent(p.id)}/ui/${p.painel.entry}`;
    janela(`${p.nome} — ${p.painel.title || T('Painel')}`, `<iframe class="plg-iframe" src="${esc(url)}" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>`, { wide: true });
    const aoReceber = async (ev) => {
      const d = ev.data || {};
      if (d.type !== 'castdeck-plugin' || typeof d.id !== 'number') return;
      const responder = (result, error) => {
        try {
          ev.source?.postMessage({ type: 'castdeck-plugin-resposta', id: d.id, result, error }, '*');
        } catch {}
      };
      try {
        if (d.method === 'settings.get') responder((await api(`/plugins/${encodeURIComponent(p.id)}/settings`)).settings || {});
        else if (d.method === 'settings.save') responder((await api(`/plugins/${encodeURIComponent(p.id)}/settings`, { method: 'POST', body: d.params || {} })).settings || {});
        else if (d.method === 'log') responder(await fetch(`/api/plugins/${encodeURIComponent(p.id)}/log`).then((x) => x.text()));
        else responder(null, T('método não suportado: ') + d.method);
      } catch (e) {
        responder(null, e.message);
      }
    };
    window.addEventListener('message', aoReceber);
    const vivo = () => [...document.querySelectorAll('iframe.plg-iframe')].some((f) => f.getAttribute('src') === url);
    const limpar = setInterval(() => {
      if (!vivo()) {
        window.removeEventListener('message', aoReceber);
        clearInterval(limpar);
      }
    }, 1500);
  }

  function abrirLog(p) {
    fetch(`/api/plugins/${encodeURIComponent(p.id)}/log`)
      .then((r) => r.text())
      .then((texto) => janela(T('Log do plugin') + ' — ' + p.nome, `<pre class="plg-log">${esc(texto || T('(sem linhas ainda)'))}</pre>`))
      .catch((e) => toast(e.message, 'err'));
  }

  // ---------- editor de regras (declarativo) ----------
  async function abrirRegras(p) {
    let regras = [];
    try {
      regras = (await api(`/plugins/${encodeURIComponent(p.id)}/rules`)).regras || [];
    } catch (e) {
      return toast(e.message, 'err');
    }
    abertaRegra = { p, regras: regras.length ? regras : [{ on: 'chat.comando', comando: '', cooldownSeg: 20, do: [{ type: 'overlay.show', titulo: '', texto: '', segundos: 6 }] }] };
    renderRegras();
  }

  function renderRegras() {
    const { p, regras } = abertaRegra;
    const sync = (raiz) => {
      raiz.querySelectorAll('[data-regra]').forEach((el) => {
        const i = Number(el.dataset.regra);
        const acao = el.dataset.acao === undefined ? null : Number(el.dataset.acao);
        const campo = el.dataset.campo;
        const valor = campo === 'cooldownSeg' || campo === 'segundos' ? Number(el.value) || 0 : el.value;
        if (acao === null) regras[i][campo] = valor;
        else regras[i].do[acao][campo] = valor;
      });
    };
    const campoGatilho = (r, i) => {
      if (r.on === 'chat.comando') return `<label class="plg-field"><span>${T('Comando')}</span><input data-regra="${i}" data-campo="comando" value="${esc(r.comando || '')}" placeholder="oi"></label>`;
      if (r.on === 'chat.regex') return `<label class="plg-field"><span>${T('Expressão regular')}</span><input data-regra="${i}" data-campo="padrao" value="${esc(r.padrao || '')}" placeholder="^!(oi|ola)"></label>`;
      if (r.on === 'chat.contem') return `<label class="plg-field"><span>${T('Texto que precisa conter')}</span><input data-regra="${i}" data-campo="texto" value="${esc(r.texto || '')}" placeholder="oi"></label>`;
      return '';
    };
    const camposAcao = (a, i, j) => {
      if (a.type === 'chat.send') return `<label class="plg-field"><span>${T('Resposta')}</span><input data-regra="${i}" data-acao="${j}" data-campo="texto" value="${esc(a.texto || '')}" placeholder="Oi, {{usuario}}!"></label>`;
      if (a.type === 'overlay.show')
        return `<div class="plg-row"><label class="plg-field"><span>${T('Título')}</span><input data-regra="${i}" data-acao="${j}" data-campo="titulo" value="${esc(a.titulo || '')}"></label>
          <label class="plg-field"><span>${T('Texto')}</span><input data-regra="${i}" data-acao="${j}" data-campo="texto" value="${esc(a.texto || '')}" placeholder="{{usuario}} chegou"></label></div>
          <div class="plg-row"><label class="plg-field"><span>${T('Cor')}</span><input type="color" data-regra="${i}" data-acao="${j}" data-campo="cor" value="${esc(a.cor || '#7c5cff')}"></label>
          <label class="plg-field small"><span>${T('Segundos')}</span><input type="number" min="1" max="60" data-regra="${i}" data-acao="${j}" data-campo="segundos" value="${esc(a.segundos || 6)}"></label></div>`;
      if (a.type === 'sound.play' || a.type === 'media.play') return `<label class="plg-field"><span>${T('Identificador (som/mídia)')}</span><input data-regra="${i}" data-acao="${j}" data-campo="id" value="${esc(a.id || '')}"></label>`;
      return '';
    };
    const bloco = (r, i) => `<div class="plg-regra">
      <div class="plg-row">
        <label class="plg-field"><span>${T('Quando')}</span>
          <select data-regra="${i}" data-campo="on">${EVENTOS.map(([v, l]) => `<option value="${v}" ${r.on === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="plg-field small"><span>${T('Espera (s)')}</span><input type="number" min="0" max="3600" data-regra="${i}" data-campo="cooldownSeg" value="${esc(r.cooldownSeg ?? 20)}"></label>
        <button class="btn sm ghost" data-remover-regra="${i}" type="button">${T('Remover regra')}</button>
      </div>
      ${campoGatilho(r, i)}
      <div class="plg-acoes-lista">${(r.do || []).map((a, j) => `<div class="plg-acao">
        <div class="plg-row">
          <label class="plg-field"><span>${T('Ação')}</span>
            <select data-regra="${i}" data-acao="${j}" data-campo="type">${ACOES.map(([v, l]) => `<option value="${v}" ${a.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <button class="btn sm ghost" data-remover-acao="${i}:${j}" type="button">✕</button>
        </div>${camposAcao(a, i, j)}</div>`).join('')}</div>
      <button class="btn sm" data-add-acao="${i}" type="button">＋ ${T('Adicionar ação')}</button>
    </div>`;

    janela(
      T('Regras de') + ' ' + p.nome,
      `<div class="plg-regras" id="plg-regras">${regras.map(bloco).join('')}
        <div class="plg-row" style="margin-top:8px">
          <button class="btn sm" id="plg-add-regra" type="button">＋ ${T('Adicionar regra')}</button>
          <span class="hint">${T('Variáveis: {{usuario}}, {{texto}}, {{arg1}}, {{rede}}, {{cena}}')}</span>
        </div></div>`,
      {
        ok: T('Salvar regras'),
        cancel: T('Cancelar'),
        wide: true,
        onOk: async (el) => {
          sync(el);
          try {
            await api(`/plugins/${encodeURIComponent(p.id)}/rules`, { method: 'POST', body: { regras } });
            toast(T('Regras salvas'), 'ok');
            await atualizar();
            if (p.ativo) await testar(p);
          } catch (e) {
            toast(T('Falha ao salvar regras: ') + e.message, 'err');
            return false;
          }
        },
      },
    ).then(() => {});

    // interações dentro da janela (re-render após mudanças)
    const raiz = document.getElementById('plg-regras');
    if (!raiz) return;
    const rerender = () => {
      sync(raiz);
      const card = raiz.closest('.modal');
      const novoHtml = `<div class="plg-regras" id="plg-regras">${regras.map(bloco).join('')}
        <div class="plg-row" style="margin-top:8px">
          <button class="btn sm" id="plg-add-regra" type="button">＋ ${T('Adicionar regra')}</button>
          <span class="hint">${T('Variáveis: {{usuario}}, {{texto}}, {{arg1}}, {{rede}}, {{cena}}')}</span>
        </div></div>`;
      const holder = card?.querySelector('.plg-modal');
      if (holder) holder.innerHTML = novoHtml;
      ligar();
    };
    const ligar = () => {
      const r2 = document.getElementById('plg-regras');
      if (!r2) return;
      r2.querySelectorAll('select, input').forEach((el) => el.addEventListener('change', () => rerender()));
      r2.querySelectorAll('[data-add-acao]').forEach((b) => (b.onclick = () => {
        sync(r2);
        regras[Number(b.dataset.addAcao)].do.push({ type: 'chat.send', texto: '' });
        rerender();
      }));
      r2.querySelectorAll('[data-remover-acao]').forEach((b) => (b.onclick = () => {
        sync(r2);
        const [i, j] = b.dataset.removerAcao.split(':').map(Number);
        regras[i].do.splice(j, 1);
        if (!regras[i].do.length) regras[i].do.push({ type: 'chat.send', texto: '' });
        rerender();
      }));
      r2.querySelectorAll('[data-remover-regra]').forEach((b) => (b.onclick = () => {
        sync(r2);
        regras.splice(Number(b.dataset.removerRegra), 1);
        if (!regras.length) regras.push({ on: 'chat.comando', comando: '', cooldownSeg: 20, do: [{ type: 'overlay.show', titulo: '', texto: '', segundos: 6 }] });
        rerender();
      }));
      const add = document.getElementById('plg-add-regra');
      if (add) add.onclick = () => {
        sync(r2);
        regras.push({ on: 'chat.comando', comando: '', cooldownSeg: 20, do: [{ type: 'chat.send', texto: '' }] });
        rerender();
      };
    };
    ligar();
  }

  // ---------- render ----------
  const tierSelo = (p) => (p.tier === 'code' ? `<span class="plg-badge code">${T('código')}</span>` : `<span class="plg-badge">${T('declarativo')}</span>`);
  const statusSelo = (p) =>
    p.quarentena ? `<span class="plg-badge err">${T('quarentena')}</span>` : p.ativo ? `<span class="plg-badge ok">${p.rodando ? T('ativo') : T('ativo (sem processo)')}</span>` : `<span class="plg-badge">${T('desligado')}</span>`;

  function chip(perm, p) {
    const i = (p.permissoes || []).indexOf(perm);
    const rotulo = p.permissoesTexto?.[i] || perm;
    const risco = /mexer|controlar|acessar|ler o chat|responder/.test(rotulo);
    return `<span class="plg-chip${risco ? ' risk' : ''}" title="${esc(perm)}">${esc(rotulo)}</span>`;
  }

  function versaoNova(p) {
    const doCat = (catalogo?.plugins || []).find((c) => c.id === p.id);
    if (!doCat) return null;
    const cmp = (a, b) => {
      const pa = String(a).split('.').map(Number);
      const pb = String(b).split('.').map(Number);
      for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
      return 0;
    };
    return cmp(doCat.versao, p.versao) > 0 ? doCat.versao : null;
  }

  function card(p) {
    const nova = versaoNova(p);
    const acoes = [];
    acoes.push(
      p.ativo
        ? `<button class="btn sm ghost" data-plg-off>${T('Desligar')}</button>`
        : `<button class="btn sm primary" data-plg-on>${T(p.sensiveis?.length ? 'Ativar (pede permissões)' : 'Ativar')}</button>`,
    );
    if (p.ativo) acoes.push(`<button class="btn sm" data-plg-test>${T('Testar')}</button>`);
    if ((p.settings || []).length || p.painel?.entry) acoes.push(`<button class="btn sm" data-plg-config>${T('Configurar')}</button>`);
    if (p.tier === 'declarative') acoes.push(`<button class="btn sm" data-plg-rules>${T('Regras')}</button>`);
    if (p.ativo && p.tier === 'code') acoes.push(`<button class="btn sm ghost" data-plg-restart title="${T('Reiniciar o processo')}">↻</button>`);
    acoes.push(`<button class="btn sm ghost" data-plg-log>${T('Log')}</button>`);
    acoes.push(`<button class="btn sm ghost danger" data-plg-del>${T('Remover')}</button>`);
    return `<div class="plg-card" data-id="${esc(p.id)}">
      <div class="plg-head">
        <span class="plg-ico">${p.tier === 'code' ? '⚙️' : '📄'}</span>
        <div class="plg-tit"><strong>${esc(p.nome)}</strong> <code>v${esc(p.versao)}</code></div>
        ${statusSelo(p)} ${tierSelo(p)}
        ${nova ? `<button class="plg-badge upd" data-plg-upd="${esc(p.id)}" title="${T('Atualizar para v') + nova}">↑ v${esc(nova)}</button>` : ''}
      </div>
      <div class="plg-sub">${esc(p.descricao || '')}</div>
      <div class="plg-meta">${p.autor ? `<span>${esc(p.autor)}</span>` : ''}${p.tier === 'declarative' ? `<span>${p.regras} ${T('regra(s)')}</span>` : ''}<span>${(p.permissoes || []).length} ${T('permissões')}</span>${p.erro ? `<span class="plg-err">${esc(p.erro)}</span>` : ''}</div>
      <div class="plg-chips">${(p.permissoes || []).map((perm) => chip(perm, p)).join('')}</div>
      <div class="plg-acts">${acoes.join('')}</div>
    </div>`;
  }

  function abaBotao(id, rotulo, contagem) {
    return `<button class="plg-tab${aba === id ? ' on' : ''}" data-plg-tab="${id}">${rotulo}${contagem !== undefined ? ` <span class="plg-count">${contagem}</span>` : ''}</button>`;
  }

  function renderInstalados() {
    if (!lista.length)
      return `<div class="plg-empty"><b>${T('Nenhum plugin instalado')}</b><p>${T('Os plugins oficiais são gratuitos. Abra o catálogo ou instale um arquivo .cdplug.')}</p>
        <button class="btn primary" data-go-catalogo>${T('Explorar catálogo')}</button></div>`;
    return lista.map(card).join('');
  }

  function renderCatalogo() {
    if (!catalogo) return `<p class="hint">${T('Carregando catálogo…')}</p>`;
    if (catalogo.erro) return `<p class="hint">${esc(catalogo.erro)}</p>`;
    const itens = (catalogo.plugins || []).filter((c) => !busca || (c.nome + ' ' + c.id + ' ' + c.resumo).toLowerCase().includes(busca.toLowerCase()));
    if (!itens.length) return `<p class="hint">${T('Nada encontrado no catálogo.')}</p>`;
    return itens
      .map((c) => {
        const instalado = lista.find((p) => p.id === c.id);
        const acao = !instalado
          ? `<button class="btn sm primary" data-cat-install="${esc(c.id)}">${T('Instalar')}</button>`
          : versaoNova({ ...instalado, id: c.id, versao: instalado.versao }) && String(c.versao) !== instalado.versao
            ? `<button class="btn sm" data-cat-update="${esc(c.id)}">${T('Atualizar para v') + esc(c.versao)}</button>`
            : `<span class="plg-badge ok">${T('instalado')}</span>`;
        return `<div class="plg-card cat">
          <div class="plg-head"><span class="plg-ico">${c.tier === 'code' ? '⚙️' : '📄'}</span>
            <div class="plg-tit"><strong>${esc(c.nome)}</strong> <code>v${esc(c.versao || '')}</code></div>
            ${c.revogado ? `<span class="plg-badge err">${T('revogado')}</span>` : ''}
            ${c.tier === 'code' ? `<span class="plg-badge code">${T('código')}</span>` : `<span class="plg-badge">${T('declarativo')}</span>`}</div>
          <div class="plg-sub">${esc(c.resumo || '')}</div>
          <div class="plg-meta">${c.autor ? `<span>${esc(c.autor)}</span>` : ''}${c.licenca ? `<span>${esc(c.licenca)}</span>` : ''}${c.bytes ? `<span>${(c.bytes / 1024).toFixed(1)} KB</span>` : ''}<span>${c.permissivas || 0} ${T('permissões')}</span></div>
          <div class="plg-acts">${acao}</div>
        </div>`;
      })
      .join('');
  }

  function renderAtividade() {
    if (!audit.length) return `<p class="hint">${T('Nada registrado ainda. As ações dos plugins aparecem aqui.')}</p>`;
    return `<div class="plg-audit">${audit
      .map((a) => {
        const hora = a.em ? new Date(a.em).toLocaleTimeString('pt-BR') : '';
        const alvo = a.id || a.pluginId || '';
        const descricao = a.acao || a.tipo || '';
        return `<div class="plg-audit-row"><span class="plg-audit-hora">${esc(hora)}</span><span class="plg-audit-tipo">${esc(descricao)}</span><span class="plg-audit-id">${esc(alvo)}</span>${a.host ? `<span class="plg-audit-extra">${esc(a.host)}</span>` : ''}${a.titulo ? `<span class="plg-audit-extra">${esc(a.titulo)}</span>` : ''}</div>`;
      })
      .join('')}</div>`;
  }

  function render() {
    const p = $('#panel-plugins');
    if (!p) return;
    if (!carregado) {
      carregado = true;
      atualizar().catch(() => {});
      return;
    }
    const ativos = lista.filter((x) => x.ativo).length;
    const cat = catalogo?.plugins?.length || 0;
    const corpo = aba === 'catalogo' ? renderCatalogo() : aba === 'atividade' ? renderAtividade() : renderInstalados();
    p.innerHTML = `
      <div class="plg-panel">
        <div class="plg-top">
          <div class="plg-tabs">${abaBotao('instalados', T('Instalados'), lista.length)}${abaBotao('catalogo', T('Catálogo'), cat)}${abaBotao('atividade', T('Atividade'))}</div>
          <div class="plg-top-acts">
            <button class="btn sm primary" id="plg-add">＋ ${T("Instalar arquivo")}</button>
            <button class="btn sm" id="plg-add-dir" title="${T("Carregar um plugin local a partir de uma pasta (com plugin.json dentro)")}">📁 ${T("Pasta local…")}</button>
            <button class="btn sm" id="plg-refresh">↻ ${T('Atualizar')}</button>
            <button class="btn sm ghost danger" id="plg-all-off">${T('Desligar todos')}</button>
          </div>
        </div>
        <div class="plg-resumo">${lista.length} ${T('instalado(s)')} · ${ativos} ${T('ativo(s)')} · ${cat} ${T('no catálogo')}${catalogo?.fonte ? ` · ${T('catálogo')}: ${catalogo.fonte}` : ''}</div>
        ${aba === 'catalogo' ? `<input class="plg-busca" id="plg-busca" placeholder="${T('Filtrar catálogo…')}" value="${esc(busca)}">` : ''}
        <div class="plg-lista">${corpo}</div>
        <p class="plg-foot">${T('Plugins rodam em processo separado e só fazem o que você autorizou. Ações sensíveis ficam no log de auditoria.')}</p>
      </div>
      <input type="file" id="plg-file" class="file-input-offscreen" accept=".cdplug,.zip">
      <input type="file" id="plg-dir" class="file-input-offscreen" webkitdirectory directory multiple>`;

    const file = $('#plg-file', p);
    $('#plg-add', p).onclick = () => {
      file.value = '';
      file.click();
    };
    file.onchange = async (e) => {
      const f = [...(e.target.files || [])][0];
      e.target.value = "";
      if (!f) return;
      await instalarArquivo(f);
      await atualizar();
    };
    const dir = $("#plg-dir", p);
    const addDir = $("#plg-add-dir", p);
    if (addDir && dir) {
      addDir.onclick = () => {
        dir.value = "";
        dir.click();
      };
      dir.onchange = async () => {
        await instalarPasta(dir);
        dir.value = "";
      };
    }
    $('#plg-refresh', p).onclick = async () => {
      if (aba === 'catalogo') await atualizarCatalogo();
      else await atualizar();
    };
    $('#plg-all-off', p).onclick = async () => {
      if (!(await confirmDialog(T('Desligar todos os plugins agora?'), { ok: T('Desligar todos'), danger: true }))) return;
      await api('/plugins/disable-all', { method: 'POST', body: {} }).catch((e) => toast(e.message, 'err'));
      toast(T('Todos os plugins desligados'), 'ok');
      await atualizar();
    };
    p.querySelectorAll('[data-plg-tab]').forEach((b) => (b.onclick = async () => {
      aba = b.dataset.plgTab;
      if (aba === 'atividade') await carregarAtividade();
      render();
    }));
    const buscaEl = $('#plg-busca', p);
    if (buscaEl)
      buscaEl.oninput = () => {
        busca = buscaEl.value;
        const pos = buscaEl.selectionStart;
        render();
        const el = $('#plg-busca', p);
        if (el) {
          el.focus();
          el.setSelectionRange(pos, pos);
        }
      };
    const goCat = p.querySelector('[data-go-catalogo]');
    if (goCat) goCat.onclick = async () => {
      aba = 'catalogo';
      if (!catalogo) await atualizarCatalogo();
      else render();
    };

    for (const box of p.querySelectorAll('.plg-card[data-id]')) {
      const item = lista.find((x) => x.id === box.dataset.id);
      if (!item) continue;
      const ligar = (sel, fn) => {
        const el = $(sel, box);
        if (el) el.onclick = fn;
      };
      ligar('[data-plg-on]', async () => {
        try {
          if (item.sensiveis?.length) {
            if (!(await pedirPermissoes(item))) return;
          } else await ativar(item, []);
          toast(T('Plugin ativado'), 'ok');
        } catch (e) {
          toast(T('Não foi possível ativar: ') + e.message, 'err');
        }
        await atualizar();
      });
      ligar('[data-plg-off]', async () => {
        await desativar(item).catch((e) => toast(e.message, 'err'));
        toast(T('Plugin desligado'), 'ok');
        await atualizar();
      });
      ligar('[data-plg-test]', () => testar(item));
      ligar('[data-plg-config]', () => configurar(item));
      ligar('[data-plg-rules]', () => abrirRegras(item).catch((e) => toast(e.message, 'err')));
      ligar('[data-plg-restart]', async () => {
        await api(`/plugins/${encodeURIComponent(item.id)}/restart`, { method: 'POST', body: {} }).catch((e) => toast(e.message, 'err'));
        toast(T('Plugin reiniciado'), 'ok');
        await atualizar();
      });
      ligar('[data-plg-log]', () => abrirLog(item));
      ligar('[data-plg-del]', async () => {
        await remover(item).catch((e) => toast(e.message, 'err'));
        await atualizar();
      });
      ligar('[data-plg-upd]', async (e) => {
        e.stopPropagation();
        try {
          await api('/plugins/catalog/install', { method: 'POST', body: { id: item.id } });
          toast(T('Plugin atualizado'), 'ok');
          await atualizar();
        } catch (err) {
          toast(T('Falha ao atualizar: ') + err.message, 'err');
        }
      });
    }

    for (const b of p.querySelectorAll('[data-cat-install]')) {
      b.onclick = async () => {
        b.disabled = true;
        b.textContent = T('Instalando…');
        try {
          await api('/plugins/catalog/install', { method: 'POST', body: { id: b.dataset.catInstall } });
          toast(T('Plugin instalado do catálogo'), 'ok');
          aba = 'instalados';
          await atualizar();
        } catch (e) {
          toast(T('Falha: ') + e.message, 'err');
          b.disabled = false;
          b.textContent = T('Instalar');
        }
      };
    }
    for (const b of p.querySelectorAll('[data-cat-update]')) {
      b.onclick = async () => {
        b.disabled = true;
        b.textContent = T('Atualizando…');
        try {
          await api('/plugins/catalog/install', { method: 'POST', body: { id: b.dataset.catUpdate } });
          toast(T('Plugin atualizado'), 'ok');
          await atualizarCatalogo();
        } catch (e) {
          toast(T('Falha: ') + e.message, 'err');
          b.disabled = false;
          b.textContent = T('Atualizar');
        }
      };
    }
  }

  // ações vindas do servidor (WS)
  function tratarAcao(msg) {
    if (!msg || msg.type !== 'plugin') return false;
    if (msg.acao === 'plugin-overlay') {
      comp?.setPluginOverlay?.(msg.payload?.spec || {}, msg.payload?.segundos || 6);
      return true;
    }
    if (msg.acao === 'plugin-overlay-hide') {
      comp?.clearPluginOverlay?.();
      return true;
    }
    if (msg.acao === 'plugin-panel') {
      const p = lista.find((x) => x.id === msg.payload?.id);
      if (p) abrirPainel(p);
      return true;
    }
    return false;
  }

  // eventos do estúdio -> servidor (palco, cena)
  let ultimoEstagio = '';
  let ultimaCena = '';
  function publicarEventos() {
    try {
      const estagio = (S.stage || []).join(',');
      if (estagio !== ultimoEstagio) {
        const entraram = (S.stage || []).filter((id) => !ultimoEstagio.split(',').includes(id));
        const sairam = ultimoEstagio.split(',').filter((id) => id && !(S.stage || []).includes(id));
        ultimoEstagio = estagio;
        for (const id of entraram)
          fetch('/api/plugins/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'stage', acao: 'entrou', fonte: id, fonteNome: S.sources.get(id)?.label || id }) }).catch(() => {});
        for (const id of sairam)
          fetch('/api/plugins/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'stage', acao: 'saiu', fonte: id }) }).catch(() => {});
      }
      const cena = `${S.layout || ''}|${S.solo || ''}|${S.take || ''}`;
      if (cena !== ultimaCena) {
        ultimaCena = cena;
        fetch('/api/plugins/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'scene', cena: S.layout || '', solo: S.solo || '', take: S.take || '' }) }).catch(() => {});
      }
    } catch {}
  }

  return { render, atualizar, tratarAcao, publicarEventos, abrirPainel, carregar };
}
