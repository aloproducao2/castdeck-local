// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Aba "Plugins" do estúdio: instalar do arquivo, ver permissões, ativar/desativar, explorar o catálogo,
// logs e auditoria. O plugin nunca desenha direto no vídeo: ele PEDE, o app executa.
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

export function createPlugins({ S, $, toast, modal, confirmDialog, comp }) {
  let lista = [];
  let catalogo = null;
  let carregado = false;

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

  async function ativar(p, permissoes) {
    await api(`/plugins/${encodeURIComponent(p.id)}/enable`, { method: 'POST', body: { permissoes } });
  }

  async function desativar(p) {
    await api(`/plugins/${encodeURIComponent(p.id)}/disable`, { method: 'POST', body: {} });
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

  // Modal de consentimento: lista em português o que o plugin pode fazer
  async function pedirPermissoes(p) {
    const sensiveis = p.sensiveis || [];
    const texto = sensiveis
      .map((perm) => {
        const rotulo = p.permissoesTexto?.[(p.permissoes || []).indexOf(perm)] || perm;
        return `• ${rotulo}`;
      })
      .join('\n');
    const ok = await confirmDialog(
      `${T('Ativar')} “${p.nome}”${p.autor ? ` ${T('de')} ${p.autor}` : ''}?\n\n` +
        (sensiveis.length ? `${T('Este plugin quer:')}\n${texto}\n\n` : '') +
        T('Plugins rodam isolados, mas podem agir no seu estúdio. Ative apenas o que você confia.'),
      { ok: T('Ativar plugin') },
    );
    if (!ok) return false;
    await ativar(p, sensiveis);
    return true;
  }

  function selo(p) {
    if (p.quarentena) return `<span class="plg-badge err">${T('quarentena')}</span>`;
    if (p.ativo && p.rodando) return `<span class="plg-badge ok">${T('ativo')}</span>`;
    if (p.ativo) return `<span class="plg-badge ok">${T('ativo')}</span>`;
    return `<span class="plg-badge">${T('desligado')}</span>`;
  }

  function card(p) {
    return `<div class="plg-card" data-id="${esc(p.id)}">
      <div class="plg-head">
        <strong>${esc(p.nome)}</strong> <code>v${esc(p.versao)}</code>
        ${selo(p)}
        ${p.tier === 'code' ? '<span class="plg-badge code" title="Plugin com código, em processo isolado">código</span>' : '<span class="plg-badge">declarativo</span>'}
      </div>
      <div class="plg-sub">${esc(p.descricao || '')}</div>
      <div class="plg-meta">
        ${p.autor ? `<span>${esc(p.autor)}</span>` : ''}
        <span>${p.permissivas} ${T('permissões')}</span>
        ${p.erro ? `<span class="plg-err">${esc(p.erro)}</span>` : ''}
      </div>
      <div class="plg-acts">
        ${
          p.ativo
            ? `<button class="btn sm ghost" data-plg-off>${T('Desligar')}</button>`
            : `<button class="btn sm primary" data-plg-on>${T(p.sensiveis?.length ? 'Ativar (pede permissões)' : 'Ativar')}</button>`
        }
        ${p.painel ? `<button class="btn sm" data-plg-panel>${T('Painel')}</button>` : ''}
        <button class="btn sm ghost" data-plg-log>${T('Log')}</button>
        <button class="btn sm ghost" data-plg-del>${T('Remover')}</button>
      </div>
    </div>`;
  }

  function render() {
    const p = $('#panel-plugins');
    if (!p) return;
    // primeira abertura da aba: busca a lista (e o catálogo) antes de desenhar
    if (!carregado) {
      carregado = true;
      atualizar().catch(() => {});
      return;
    }
    const cat = catalogo
      ? catalogo.erro
        ? `<p class="hint">${esc(catalogo.erro)}</p>`
        : (catalogo.plugins || [])
            .map(
              (c) => `<div class="plg-card cat" data-cat="${esc(c.id)}">
                <div class="plg-head"><strong>${esc(c.nome)}</strong> <code>v${esc(c.versao || '')}</code>
                  ${c.instalado ? `<span class="plg-badge ok">${T('instalado')}</span>` : ''}</div>
                <div class="plg-sub">${esc(c.resumo || '')}</div>
                <div class="plg-acts">
                  <button class="btn sm ${c.instalado ? 'ghost' : 'primary'}" data-cat-install ${c.instalado ? 'disabled' : ''}>${T(c.instalado ? 'Já instalado' : 'Instalar')}</button>
                </div>
              </div>`,
            )
            .join('') || `<p class="hint">${T('Catálogo vazio por enquanto.')}</p>`
      : `<p class="hint">${T('Carregando catálogo…')}</p>`;

    p.innerHTML = `
      <div class="plg-top">
        <button class="btn sm primary" id="plg-add">${T('＋ Instalar do arquivo (.cdplug)')}</button>
        <button class="btn sm" id="plg-refresh">${T('Atualizar lista')}</button>
        <button class="btn sm ghost" id="plg-all-off">${T('Desligar todos')}</button>
      </div>
      <input type="file" id="plg-file" class="file-input-offscreen" accept=".cdplug,.zip">
      <h4>${T('Instalados')} <span class="hint">(${lista.length})</span></h4>
      ${lista.length ? lista.map(card).join('') : `<p class="hint">${T('Nenhum plugin instalado. Os plugins oficiais são gratuitos e ficam no repositório castdeck-local-plugins.')}</p>`}
      <h4>${T('Catálogo')} <span class="hint">${catalogo?.geradoEm ? esc(new Date(catalogo.geradoEm).toLocaleDateString('pt-BR')) : ''}</span></h4>
      ${cat}
      <p class="hint" style="margin-top:10px">${T('Plugins rodam em processo separado e só fazem o que você autorizou. Ações sensíveis ficam no log de auditoria.')}</p>`;

    const file = $('#plg-file', p);
    $('#plg-add', p).onclick = () => {
      file.value = '';
      file.click();
    };
    file.onchange = async (e) => {
      const f = [...(e.target.files || [])][0];
      e.target.value = '';
      if (!f) return;
      await instalarArquivo(f);
      await atualizar();
    };
    $('#plg-refresh', p).onclick = () => atualizarCatalogo();
    $('#plg-all-off', p).onclick = async () => {
      if (!(await confirmDialog(T('Desligar todos os plugins agora?'), { ok: T('Desligar todos'), danger: true }))) return;
      await api('/plugins/disable-all', { method: 'POST', body: {} }).catch((e) => toast(e.message, 'err'));
      toast(T('Todos os plugins desligados'), 'ok');
      await atualizar();
    };

    for (const box of p.querySelectorAll('.plg-card[data-id]')) {
      const item = lista.find((x) => x.id === box.dataset.id);
      if (!item) continue;
      const on = $('[data-plg-on]', box);
      if (on)
        on.onclick = async () => {
          try {
            if (item.sensiveis?.length) {
              if (!(await pedirPermissoes(item))) return;
            } else {
              await ativar(item, []);
            }
            toast(T('Plugin ativado'), 'ok');
          } catch (e) {
            toast(T('Não foi possível ativar: ') + e.message, 'err');
          }
          await atualizar();
        };
      const off = $('[data-plg-off]', box);
      if (off)
        off.onclick = async () => {
          await desativar(item).catch((e) => toast(e.message, 'err'));
          toast(T('Plugin desligado'), 'ok');
          await atualizar();
        };
      const del = $('[data-plg-del]', box);
      if (del)
        del.onclick = async () => {
          await remover(item).catch((e) => toast(e.message, 'err'));
          await atualizar();
        };
      const log = $('[data-plg-log]', box);
      if (log)
        log.onclick = async () => {
          const texto = await fetch(`/api/plugins/${encodeURIComponent(item.id)}/log`).then((r) => r.text());
          modal({
            title: T('Log do plugin') + ` — ${item.nome}`,
            body: `<pre class="plg-log">${esc(texto || T('(sem linhas ainda)'))}</pre>`,
            ok: T('Fechar'),
          });
        };
      const panel = $('[data-plg-panel]', box);
      if (panel) panel.onclick = () => abrirPainel(item);
    }

    for (const box of p.querySelectorAll('[data-cat]')) {
      const btn = $('[data-cat-install]', box);
      if (!btn || btn.disabled) continue;
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = T('Instalando…');
        try {
          await api('/plugins/catalog/install', { method: 'POST', body: { id: box.dataset.cat } });
          toast(T('Plugin instalado do catálogo'), 'ok');
          await atualizar();
        } catch (e) {
          toast(T('Falha: ') + e.message, 'err');
          btn.disabled = false;
          btn.textContent = T('Instalar');
        }
      };
    }
  }

  async function atualizar() {
    await carregar();
    if (catalogo === null) catalogo = await api('/plugins/catalog').catch((e) => ({ erro: e.message, plugins: [] }));
    render();
  }

  // recarrega o catálogo ignorando o cache de 24 h (botão "Atualizar lista")
  async function atualizarCatalogo() {
    catalogo = await api('/plugins/catalog?forcar=1').catch((e) => ({ erro: e.message, plugins: [] }));
    await atualizar();
  }

  function abrirPainel(p) {
    if (!p.painel?.entry) return;
    const url = `/api/plugins/${encodeURIComponent(p.id)}/ui/${p.painel.entry}`;
    modal({
      title: `${p.nome} — ${p.painel.title || T('Painel')}`,
      wide: true,
      body: `<iframe class="plg-iframe" src="${esc(url)}" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>`,
      ok: T('Fechar'),
    });
    // ponte do painel: o iframe roda isolado (sem acesso à API) e pede tudo por postMessage
    const aoReceber = async (ev) => {
      const d = ev.data || {};
      if (d.type !== 'castdeck-plugin' || typeof d.id !== 'number') return;
      const responder = (result, error) => {
        try {
          ev.source?.postMessage({ type: 'castdeck-plugin-resposta', id: d.id, result, error }, '*');
        } catch {}
      };
      try {
        if (d.method === 'settings.get') {
          const r = await api(`/plugins/${encodeURIComponent(p.id)}/settings`);
          responder(r.settings || {});
        } else if (d.method === 'settings.save') {
          const r = await api(`/plugins/${encodeURIComponent(p.id)}/settings`, { method: 'POST', body: d.params || {} });
          responder(r.settings || {});
        } else if (d.method === 'log') {
          const texto = await fetch(`/api/plugins/${encodeURIComponent(p.id)}/log`).then((r) => r.text());
          responder(texto);
        } else {
          responder(null, T('método não suportado: ') + d.method);
        }
      } catch (e) {
        responder(null, e.message);
      }
    };
    window.addEventListener('message', aoReceber);
    // limpa o listener quando o iframe do painel sai do DOM (modal fechado)
    const vivo = () => [...document.querySelectorAll('iframe.plg-iframe')].some((f) => f.getAttribute('src') === url);
    const limpar = setInterval(() => {
      if (!vivo()) {
        window.removeEventListener('message', aoReceber);
        clearInterval(limpar);
      }
    }, 1500);
  }

  // ações vindas do servidor (WS): overlay/aviso, painel e som
  function tratarAcao(msg) {
    if (!msg || msg.type !== 'plugin') return false;
    if (msg.acao === 'plugin-overlay') {
      const payload = msg.payload || {};
      comp?.setPluginOverlay?.(payload.spec || {}, payload.segundos || 6);
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

  // Eventos do estúdio -> servidor (palco, cena, live). Plugins declarativos usam para reagir.
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
          fetch('/api/plugins/event', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tipo: 'stage', acao: 'entrou', fonte: id, fonteNome: S.sources.get(id)?.label || id }),
          }).catch(() => {});
        for (const id of sairam)
          fetch('/api/plugins/event', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tipo: 'stage', acao: 'saiu', fonte: id }),
          }).catch(() => {});
      }
      const cena = `${S.layout || ''}|${S.solo || ''}|${S.take || ''}`;
      if (cena !== ultimaCena) {
        ultimaCena = cena;
        fetch('/api/plugins/event', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tipo: 'scene', cena: S.layout || '', solo: S.solo || '', take: S.take || '' }),
        }).catch(() => {});
      }
    } catch {}
  }

  return { render, atualizar, tratarAcao, publicarEventos, abrirPainel, carregar };
}
