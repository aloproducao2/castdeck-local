// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Aba "Plugins" do estúdio: instalar, ativar com consentimento, configurar, testar, editar regras, ver
// atividade e explorar o catálogo. O plugin nunca desenha direto no vídeo: ele PEDE, o app executa.
const T = (s) => (window.CDi18n?.t ? window.CDi18n.t(s) : s);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

const configPendente = (p) => !!p?.configPendente;

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
  ['media.play', T('Tocar uma mídia do estúdio')],
  ['overlay.hide', T('Esconder o aviso')],
];

let seq = 0;
const novoId = (p) => `${p}-${++seq}`;

export function createPlugins({ S, $, toast, modal, confirmDialog, comp, onMedia, medias }) {
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

  // Consentimento: mostra cada permissão com o risco e o "por quê", agrupada por risco.
  async function pedirPermissoes(p) {
    const detalhe = (p.permissoesDetalhe || []).filter((x) => (p.sensiveis || []).includes(x.id));
    const riscoDe = (r) => `<span class="plg-risco ${r}">${T(r === 'alto' ? 'risco alto' : r === 'medio' ? 'risco médio' : 'risco baixo')}</span>`;
    const linhas = detalhe
      .sort((a, b) => ({ alto: 0, medio: 1, baixo: 2 })[a.risco] - ({ alto: 0, medio: 1, baixo: 2 })[b.risco])
      .map((perm) => `<li class="plg-perm-item">${riscoDe(perm.risco)}<div><b>${esc(perm.texto)}</b><div class="hint">${esc(perm.porque || '')}</div></div></li>`)
      .join('');
    const corpo = `<p class="hint">${T('Plugins rodam isolados, mas podem agir no seu estúdio. Ative apenas o que você confia.')}</p>
      ${linhas ? `<ul class="plg-perms plg-consent">${linhas}</ul>` : `<p class="hint">${T('Este plugin não pede permissão sensível.')}</p>`}
      <p class="hint">${T('Você pode revogar tudo desligando o plugin. As ações sensíveis ficam na aba Atividade.')}</p>`;
    const ok = await janela(`${T('Ativar')} “${p.nome}”${p.autor ? ` ${T('de')} ${p.autor}` : ''}?`, corpo, {
      ok: T('Ativar plugin'),
      cancel: T('Agora não'),
      wide: true,
    });
    if (!ok) return false;
    await ativar(p, p.sensiveis || []);
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

  // Test-drive: escolhe o evento, roda de verdade e mostra o que o plugin fez.
  async function testar(p, tipoEscolhido) {
    const tipo = tipoEscolhido || 'chat';
    const texto = tipo === 'chat' ? '!oi' : '';
    try {
      const r = await api(`/plugins/${encodeURIComponent(p.id)}/test`, { method: 'POST', body: { tipo, texto, usuario: 'teste', fonteNome: 'Teste' } });
      const acoes = (r.acoes || []).map((a) => ({ nome: a.acao, ok: a.ok !== false, detalhe: a.detalhe || '' }));
      if (r.ok) {
        toast(T('Plugin respondeu: ') + acoes.map((a) => a.nome).join(', '), 'ok');
        if (comp) comp.setPluginOverlay?.({ titulo: p.nome, texto: T('Teste do plugin funcionando'), cor: '#3ddc97' }, 4);
      } else {
        toast(T('Nada aconteceu: ') + (r.dica || ''), 'err');
      }
      const linhas = acoes.length
        ? acoes.map((a) => `<li><b>${esc(a.nome)}</b>${a.detalhe ? ' — ' + esc(a.detalhe) : ''} ${a.ok ? '' : '⚠'}</li>`).join('')
        : `<li class="hint">${esc(r.dica || T('(nenhuma ação)'))}</li>`;
      janela(
        T('Testar') + ' — ' + p.nome,
        `<p class="hint">${T('O evento abaixo foi disparado de verdade: o plugin executou (ou tentou) estas ações.')}</p>
         <ul class="plg-resultado">${linhas}</ul>
         <div class="plg-row" style="margin-top:6px">
           <button class="btn sm" data-testar="chat" type="button">${T('Testar com mensagem no chat')}</button>
           <button class="btn sm" data-testar="stage" type="button">${T('Testar com entrada no palco')}</button>
         </div>`,
        { wide: true },
      );
      document.querySelectorAll('[data-testar]').forEach((b) => {
        b.onclick = () => {
          document.querySelectorAll('.modal-back').forEach((m) => m.remove());
          testar(p, b.dataset.testar);
        };
      });
    } catch (e) {
      toast(T('Falha no teste: ') + e.message, 'err');
    }
  }

  // Sobre o plugin: tudo o que a pessoa precisa para entender e confiar
  function abrirSobre(p) {
    const detalhe = p.permissoesDetalhe || (p.permissoes || []).map((perm, i) => ({ id: perm, texto: p.permissoesTexto?.[i] || perm, risco: 'baixo', porque: '' }));
    const perms = detalhe
      .map((perm) => `<li class="plg-perm-item"><span class="plg-risco ${esc(perm.risco || 'baixo')}">${T(perm.risco === 'alto' ? 'risco alto' : perm.risco === 'medio' ? 'risco médio' : 'risco baixo')}</span><div><b>${esc(perm.texto)}</b> <code>${esc(perm.id)}</code>${perm.porque ? `<div class="hint">${esc(perm.porque)}</div>` : ''}</div></li>`)
      .join('');
    const eventos = (p.eventos || []).map((e) => `<span class="plg-chip">${esc(T(e === 'chat' ? 'chat' : e === 'stage' ? 'palco' : e === 'live' ? 'transmissão' : e === 'gravacao' ? 'gravação' : e))}</span>`).join('');
    const config = (p.settings || []).length ? `<p>${T('Campos de configuração')}: ${p.settings.map((c) => esc(c.label || c.key)).join(', ')}</p>` : '';
    const faz = p.tier === 'declarative' && (p.listaRegras || []).length
      ? `<p class="hint">${T('Quando acontecer:')} ${p.listaRegras.map((r) => `<span class="plg-chip rule">${esc(r.rotulo)}</span>`).join(' ')}</p>`
      : '';
    janela(
      T('Sobre') + ' — ' + p.nome,
      `<p>${esc(p.descricao || '')}</p>
       <table class="tbl plg-sobre"><tbody>
         <tr><th>${T('Versão')}</th><td>v${esc(p.versao)}</td></tr>
         <tr><th>${T('Autor')}</th><td>${esc(p.autor || '—')}</td></tr>
         <tr><th>${T('Licença')}</th><td>${esc(p.licenca || '—')}</td></tr>
         <tr><th>${T('Tipo')}</th><td>${p.tier === 'code' ? T('com código (processo separado)') : T('declarativo (só regras)')}</td></tr>
         <tr><th>${T('Status')}</th><td>${p.ativo ? T('ativo') : T('desligado')}${p.quarentena ? ' · ' + T('quarentena') : ''}</td></tr>
         <tr><th>${T('Instalado em')}</th><td>${p.instaladoEm ? new Date(p.instaladoEm).toLocaleString('pt-BR') : '—'}</td></tr>
         <tr><th>${T('Regras')}</th><td>${p.tier === 'declarative' ? p.regras : '—'}</td></tr>
         <tr><th>${T('Eventos que escuta')}</th><td>${eventos || '—'}</td></tr>
       </tbody></table>
       ${faz}
       <h4>${T('O que este plugin pode fazer')}</h4>
       <ul class="plg-perms plg-perms-detalhe">${perms || '<li class="hint">' + T('Nenhuma permissão.') + '</li>'}</ul>
       ${config}
       <p class="hint">${T('Plugins rodam em processo separado; ações sensíveis ficam no log de auditoria.')}</p>
       <div class="plg-row" style="margin-top:6px">
         ${p.ativo ? `<button class="btn sm" data-sobre-doctor type="button">🩺 ${T('Diagnóstico')}</button>` : ''}
         ${p.ativo ? `<button class="btn sm" data-sobre-test type="button">${T('Testar')}</button>` : ''}
         <button class="btn sm ghost" data-sobre-log type="button">${T('Log')}</button>
       </div>`,
      { wide: true },
    );
    document.querySelectorAll('[data-sobre-doctor]').forEach((b) => (b.onclick = () => {
      document.querySelectorAll('.modal-back').forEach((m) => m.remove());
      abrirDiagnostico(p);
    }));
    document.querySelectorAll('[data-sobre-test]').forEach((b) => (b.onclick = () => {
      document.querySelectorAll('.modal-back').forEach((m) => m.remove());
      testar(p);
    }));
    document.querySelectorAll('[data-sobre-log]').forEach((b) => (b.onclick = () => {
      document.querySelectorAll('.modal-back').forEach((m) => m.remove());
      abrirLog(p);
    }));
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
        else if (d.method === 'painel' || d.method === 'acao') {
          // botão do painel do plugin → evento "panel" no processo do plugin
          responder(await api(`/plugins/${encodeURIComponent(p.id)}/panel`, { method: 'POST', body: { nome: d.params?.nome, dados: d.params?.dados || {} } }));
        } else if (d.method === 'doctor') {
          responder(await api(`/plugins/${encodeURIComponent(p.id)}/doctor`));
        } else if (d.method === 'test') {
          const resultado = await api('/plugins/' + encodeURIComponent(p.id) + '/test', { method: 'POST', body: { tipo: 'chat', texto: d.params?.texto || '!oi', usuario: 'teste' } });
          responder(resultado);
        } else if (d.method === "log") responder(await fetch(`/api/plugins/${encodeURIComponent(p.id)}/log`).then((x) => x.text()));
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

  // Log com atualização automática (como o "logs" do OBS): acompanhar sem fechar e reabrir.
  function abrirLog(p) {
    const corpo = `<div class="plg-logbar"><label class="plg-check"><input type="checkbox" id="plg-log-auto" checked> ${T('Atualizar sozinho')}</label><button class="btn sm ghost" id="plg-log-refresh" type="button">↻ ${T('Atualizar agora')}</button></div><pre class="plg-log" id="plg-log-pre">${T('Carregando…')}</pre>`;
    janela(T('Log do plugin') + ' — ' + p.nome, corpo, { wide: true });
    const pre = document.getElementById('plg-log-pre');
    if (!pre) return;
    let parar = false;
    const carregar = async () => {
      try {
        const texto = await fetch(`/api/plugins/${encodeURIComponent(p.id)}/log`).then((r) => r.text());
        pre.textContent = texto || T('(sem linhas ainda)');
        pre.scrollTop = pre.scrollHeight;
      } catch (e) {
        pre.textContent = T('Falha ao ler o log: ') + e.message;
      }
    };
    const botao = document.getElementById('plg-log-refresh');
    if (botao) botao.onclick = carregar;
    const auto = document.getElementById('plg-log-auto');
    carregar();
    const relogio = setInterval(() => {
      if (parar || !document.body.contains(pre)) {
        parar = true;
        clearInterval(relogio);
        return;
      }
      if (auto?.checked) carregar();
    }, 2000);
  }

  // Diagnóstico: o mesmo checklist que o servidor monta, com dica em cada linha.
  async function abrirDiagnostico(p) {
    let r;
    try {
      r = await api(`/plugins/${encodeURIComponent(p.id)}/doctor`);
    } catch (e) {
      return toast(T('Falha no diagnóstico: ') + e.message, 'err');
    }
    const linhas = (r.checks || [])
      .map(
        (c) => `<li class="plg-diag-row ${c.ok ? 'ok' : 'bad'}"><span class="plg-diag-ico">${c.ok ? '✓' : '!'}</span>
          <div><b>${esc(c.nome)}</b> <span class="hint">${esc(c.detalhe || '')}</span>${c.ok || !c.dica ? '' : `<div class="plg-diag-dica">${esc(c.dica)}</div>`}</div></li>`,
      )
      .join('');
    const ok = await janela(
      T('Diagnóstico') + ' — ' + p.nome,
      `<p class="hint">${r.ok ? T('Tudo certo com este plugin.') : T('Encontramos pontos para ajustar:')}</p>
       <ul class="plg-diag">${linhas}</ul>`,
      { ok: T('Reiniciar plugin'), cancel: T('Fechar') },
    );
    if (ok) {
      try {
        await api(`/plugins/${encodeURIComponent(p.id)}/restart`, { method: 'POST', body: {} });
        toast(T('Plugin reiniciado'), 'ok');
        await atualizar();
      } catch (e) {
        toast(T('Falha ao reiniciar: ') + e.message, 'err');
      }
    }
  }

  // "Como funcionam os plugins": explicação curta e visual, para ninguém precisar ler documentação.
  function abrirGuia() {
    return janela(
      T('Como funcionam os plugins'),
      `<div class="plg-guia">
        <p class="hint">${T('Um plugin é um complemento que adiciona um recurso ao estúdio. Ele não vira parte do app: roda separado e só faz o que você aprovar.')}</p>
        <ol class="plg-guia-passos">
          <li><b>${T('1. Instale')}</b><span>${T('Pelo catálogo (oficiais, assinados) ou por um arquivo .cdplug / pasta local.')}</span></li>
          <li><b>${T('2. Ative')}</b><span>${T('Aparece um pedido de permissões em português, com o risco de cada uma. Sem aprovar, ele não age.')}</span></li>
          <li><b>${T('3. Configure')}</b><span>${T('O formulário é gerado pelo próprio plugin; quem tem painel abre uma janela só dele (ex.: o cronômetro).')}</span></li>
          <li><b>${T('4. Teste e acompanhe')}</b><span>${T('O botão Testar dispara o evento de verdade, o Log mostra o que ele fez e a Atividade registra tudo.')}</span></li>
        </ol>
        <h4>${T('Dois tipos de plugin')}</h4>
        <table class="tbl plg-sobre"><tbody>
          <tr><th>${T('Declarativo')}</th><td>${T('Só regras (quando alguém escrever !oi, mostre este aviso). Você edita pelo editor de regras, sem programar.')}</td></tr>
          <tr><th>${T('Com código')}</th><td>${T('Um pequeno programa que roda em processo separado, com a API do CastDeck (aviso, chat, mídia, rede autorizada).')}</td></tr>
        </tbody></table>
        <h4>${T('O que garante a segurança')}</h4>
        <ul class="plg-perms">
          <li><b>${T('Permissões explícitas')}</b> — ${T('ler o chat, desenhar no vídeo, acessar um endereço… nada além do aprovado.')}</li>
          <li><b>${T('Processo separado')}</b> — ${T('um erro ou travamento no plugin não derruba o estúdio; abriu 3 vezes, entra em quarentena.')}</li>
          <li><b>${T('Catálogo assinado')}</b> — ${T('os oficiais vêm com assinatura digital e lista de revogação conferida pelo app.')}</li>
          <li><b>${T('Trilha de auditoria')}</b> — ${T('toda ação sensível fica registrada em Atividade.')}</li>
        </ul>
        <p class="hint">${T('Quer criar o seu? A documentação e os guias (inclusive para agentes de IA) estão em cast.flue.live/plugins.')}</p>
      </div>`,
      { wide: true, ok: T('Entendi') },
    );
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
      if (a.type === 'media.play') {
        const lista = (typeof medias === 'function' && medias()) || [];
        if (lista.length)
          return `<label class="plg-field"><span>${T('Mídia')}</span><select data-regra="${i}" data-acao="${j}" data-campo="id">${lista
            .map((m) => `<option value="${esc(m.id)}" ${a.id === m.id ? 'selected' : ''}>${esc(m.nome || m.id)}</option>`)
            .join('')}</select></label>`;
        return `<label class="plg-field"><span>${T('Mídia (id da fonte)')}</span><input data-regra="${i}" data-acao="${j}" data-campo="id" placeholder="media:1" value="${esc(a.id || '')}"></label>`;
      }
      if (a.type === 'sound.play') return `<label class="plg-field"><span>${T('Identificador do som')}</span><input data-regra="${i}" data-acao="${j}" data-campo="id" value="${esc(a.id || '')}"></label>`;
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
    acoes.push(`<button class="btn sm ghost" data-plg-doctor title="${T('Diagnóstico do plugin')}">${T('Diagnóstico')}</button>`);
    acoes.push(`<button class="btn sm ghost" data-plg-about title="${T('Sobre o plugin')}">ℹ</button>`);
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
      <div class="plg-meta">${p.autor ? `<span>${esc(p.autor)}</span>` : ''}${p.tier === 'declarative' ? `<span>${p.regras} ${T('regra(s)')}</span>` : ''}<span>${(p.permissoes || []).length} ${T('permissões')}</span>${p.erro ? `<span class="plg-err">${esc(p.erro)}</span>` : ''}${configPendente(p) ? `<span class="plg-warn">${T('falta configurar')}</span>` : ''}</div>
      ${p.tier === 'declarative' && (p.listaRegras || []).length ? `<div class="plg-chips">${p.listaRegras.slice(0, 4).map((r) => `<span class="plg-chip rule">${esc(r.rotulo)}</span>`).join('')}${p.listaRegras.length > 4 ? `<span class="plg-chip rule">+${p.listaRegras.length - 4}</span>` : ''}</div>` : ''}
      <div class="plg-chips">${(p.permissoes || []).map((perm) => chip(perm, p)).join('')}</div>
      <div class="plg-acts">${acoes.join('')}</div>
    </div>`;
  }

  function abaBotao(id, rotulo, contagem) {
    return `<button class="plg-tab${aba === id ? ' on' : ''}" data-plg-tab="${id}">${rotulo}${contagem !== undefined ? ` <span class="plg-count">${contagem}</span>` : ''}</button>`;
  }

  function renderInstalados() {
    if (!lista.length)
      return `<div class="plg-onboarding">
        <h3>${T('Comece com um plugin pronto (é grátis)')}</h3>
        <ol class="plg-passos">
          <li><b>${T('Instale')}</b> — ${T('um dos oficiais em um clique')}</li>
          <li><b>${T('Ative')}</b> — ${T('e aprove as permissões que aparecem em português')}</li>
          <li><b>${T('Teste')}</b> — ${T('veja o aviso na tela sem precisar de live')}</li>
        </ol>
        <div class="plg-acts">
          <button class="btn primary" data-instalar-oficial="castdeck.timer">＋ ${T('Instalar Cronômetro no ar')}</button>
          <button class="btn" data-instalar-oficial="castdeck.chat-commands">＋ ${T('Instalar Comandos de chat')}</button>
          <button class="btn ghost" data-go-catalogo>${T('Ver catálogo')}</button>
          <button class="btn ghost" data-guia>${T('Como funcionam?')}</button>
        </div>
      </div>`;
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
            ${c.oficial || c.verified ? `<span class="plg-badge ok">${T('oficial')}</span>` : ''}
            ${c.tier === 'code' ? `<span class="plg-badge code">${T('código')}</span>` : `<span class="plg-badge">${T('declarativo')}</span>`}</div>
          <div class="plg-sub">${esc(c.resumo || '')}</div>
          <div class="plg-meta">${c.autor ? `<span>${esc(c.autor)}</span>` : ''}${c.licenca ? `<span>${esc(c.licenca)}</span>` : ''}${c.bytes ? `<span>${(c.bytes / 1024).toFixed(1)} KB</span>` : ''}<span>${c.permissivas || 0} ${T('permissões')}</span>${c.risco ? `<span class="plg-risco ${esc(c.risco)}">${T(c.risco === 'alto' ? 'risco alto' : c.risco === 'medio' ? 'risco médio' : 'risco baixo')}</span>` : ''}</div>
          ${(c.tags || []).length ? `<div class="plg-chips">${c.tags.slice(0, 6).map((t) => `<span class="plg-chip">${esc(t)}</span>`).join('')}</div>` : ''}
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
            <button class="btn sm ghost" id="plg-guide" title="${T('Entenda em 30 segundos como os plugins funcionam')}">? ${T('Como funcionam')}</button>
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
    const guiaBtn = $('#plg-guide', p);
    if (guiaBtn) guiaBtn.onclick = () => abrirGuia();
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
    p.querySelectorAll('[data-instalar-oficial]').forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        b.textContent = T('Instalando…');
        try {
          await api('/plugins/catalog/install', { method: 'POST', body: { id: b.dataset.instalarOficial } });
          toast(T('Plugin instalado do catálogo'), 'ok');
          aba = 'instalados';
          await atualizar();
        } catch (e) {
          toast(T('Falha: ') + e.message, 'err');
          b.disabled = false;
        }
      };
    });
    const goCat = p.querySelector('[data-go-catalogo]');
    if (goCat) goCat.onclick = async () => {
      aba = 'catalogo';
      if (!catalogo) await atualizarCatalogo();
      else render();
    };
    const guiaLink = p.querySelector('[data-guia]');
    if (guiaLink) guiaLink.onclick = () => abrirGuia();

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
      ligar('[data-plg-about]', () => abrirSobre(item));
      ligar('[data-plg-doctor]', () => abrirDiagnostico(item));
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
    if (msg.acao === 'plugin-media') {
      const fonte = msg.payload?.fonte || '';
      if (msg.payload?.play && onMedia) onMedia(fonte);
      return true;
    }
    if (msg.acao === 'plugin-sound') {
      return true; // som do Pad roda na janela do Pad; aviso fica no log do plugin
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
