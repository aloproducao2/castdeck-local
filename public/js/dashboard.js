// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Painel: estúdios, destinos RTMP, gravações e estado do sistema.
// Organizado em abas (Estúdios · Destinos · Gravações · Configurações). Todas as abas ficam no DOM
// (só a ativa aparece) para os ids continuarem estáveis para os testes e os atalhos de "Primeiros passos".
import { $, $$, esc, icons, toast, confirmDialog, promptDialog, api, copyText, fmtBytes, PLATFORMS, fmtBadge } from './ui.js';
import { chooseRecordingsDir, resetRecordingsDir } from './recdir.js';
import { editDestination, deleteDestination, toggleDestination, showKeyHelp, destCardHtml, bindDestCards, prepareDestination } from './destinations.js';
import { updateBanner, updateRow, bindUpdates, startUpdates } from './updates.js';
import { playRecording, revealRecording, recTitle } from './recplayer.js';
import { makeQR } from './studio/qr.js';

function dashQrSvg(text) {
  try {
    const q = makeQR(text || location.origin, 'M');
    const n = q.size + 8;
    let d = '';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.modules[y][x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  } catch {
    return '';
  }
}

const app = $('#app');
const D = { studios: [], destinations: [], recordings: [], system: null };
const BGS = ['/assets/backgrounds/aurora.jpg', '/assets/backgrounds/waves.jpg'];

// ---------- abas ----------
const TABS = [
  { id: 'estudios', label: 'Estúdios', icon: 'play' },
  { id: 'destinos', label: 'Destinos', icon: 'broadcast' },
  { id: 'gravacoes', label: 'Gravações', icon: 'film' },
  { id: 'config', label: 'Configurações', icon: 'settings' },
];
// links antigos (#conexao, #sistema) caem na aba Configurações
const TAB_ALIAS = { conexao: 'config', sistema: 'config' };
const tabFromHash = () => {
  const h = location.hash.replace('#', '');
  const t = TAB_ALIAS[h] || h;
  return TABS.some((x) => x.id === t) ? t : 'estudios';
};
let curTab = tabFromHash();

function showTab(id, { push = true } = {}) {
  if (id === 'gravacoes' && curTab !== id && D.system) refreshRecordings();
  curTab = id;
  $$('.db-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  $$('.db-panel').forEach((p) => (p.hidden = p.dataset.panel !== id));
  if (push && location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
}
window.addEventListener('hashchange', () => showTab(tabFromHash(), { push: false }));

// ---------- conexão para convidados (túnel) ----------
// O endereço do túnel é usado só por dentro do app (o botão "Convidar" monta o link completo).
// Por isso o painel não mostra o endereço cru nem um botão de copiar: o usuário só espera ficar pronto.
const tunBusy = (t) => ['starting', 'downloading'].includes(t?.status);
const inviteMode = (t) => (t?.status === 'on' && t.url ? 'ready' : tunBusy(t) ? 'wait' : 'local');

let tunWatch = { status: null, since: Date.now() };
// A faixa grande só ocupa a primeira dobra enquanto a espera é curta: passados 30 s de espera passiva
// ela vira um chip discreto (a lista de estúdios ganha a altura de volta) com "Detalhes" para reabrir.
let tunSlim = false;
let tunExpanded = false;
function trackTunnel(t) {
  const st = t.status;
  if (st === tunWatch.status) return;
  if (tunWatch.status && tunWatch.status !== 'on' && st === 'on') toast('Conexão para convidados pronta! Já pode convidar.', 'ok');
  tunWatch = { status: st, since: Date.now() };
  tunSlim = false;
  tunExpanded = false;
}

// chip no topo: estado resumido, sempre visível; clicar leva às configurações de conexão
function tunnelChip(t) {
  const [cls, txt] = {
    ready: ['ok', 'Convidados: pronto'],
    wait: ['warn', 'Convidados: conectando…'],
    local: t.status === 'error' ? ['err', 'Convidados: só rede local'] : ['', 'Convidados: só rede local'],
  }[inviteMode(t)];
  return `<button class="pill ${cls} db-chip" id="tun-chip" title="Conexão para convidados de fora da sua rede">${inviteMode(t) === 'wait' ? '<span class="db-spin"></span>' : '<span class="dot"></span>'}${txt}</button>`;
}

// faixa grande só quando o usuário precisa saber de algo: preparando (esperar) ou erro (tentar de novo)
function tunnelStrip(t) {
  if (t.status === 'error') {
    return `<div class="tun-card err"><span class="tun-ico">!</span><div class="grow"><strong>Não consegui abrir a conexão para convidados</strong><div class="hint">${esc(t.error || '')} Convidados na mesma rede Wi‑Fi continuam podendo entrar.</div></div><button class="btn sm" id="tun-retry">Tentar de novo</button></div>`;
  }
  if (!tunBusy(t)) return '';
  // espera longa e sem pedido de detalhes: chip de uma linha (mesmo conteúdo essencial, 1/4 da altura)
  if (tunSlim && !tunExpanded && tunWatch.since && Date.now() - tunWatch.since >= 30000) {
    return `<div class="tun-slim" role="status"><span class="db-spin" aria-hidden="true"></span><strong>Conectando para receber convidados</strong><span class="hint" id="tun-secs"></span><button class="btn sm ghost" id="tun-expand" type="button">Detalhes</button></div>`;
  }
  const dl = t.download || {};
  let pct = Number(dl.progress) || 0;
  if (pct > 0 && pct <= 1) pct *= 100;
  const phase = t.status === 'downloading' ? `Preparando o componente de conexão${pct ? ' ' + Math.round(pct) + '%' : '…'}` : 'Abrindo a conexão segura e verificando…';
  return `<div class="tun-card wait"><span class="tun-spin"></span><div class="grow">
    <strong>Conectando para receber convidados <span class="hint" id="tun-secs"></span></strong>
    <div class="hint">${phase}</div>
    <div class="tun-bar ${pct ? '' : 'indet'}"><i style="width:${pct || 40}%"></i></div>
    <div class="hint">Aguarde: leva de 10 a 30 s e acontece sozinho. Você não precisa copiar nada: quando ficar pronto, o botão <b>Convidar</b> já monta o link certo. Enquanto isso, já pode abrir o estúdio.</div>
  </div></div>`;
}
setInterval(() => {
  const el = document.getElementById('tun-secs');
  if (el) el.textContent = '· ' + Math.round((Date.now() - tunWatch.since) / 1000) + 's';
  // aos 30 s de espera passiva a faixa encolhe sozinha (só uma vez, para não redesenhar a cada segundo)
  if (!tunSlim && !tunExpanded && tunBusy(D.system?.tunnel) && Date.now() - tunWatch.since >= 30000) {
    tunSlim = true;
    const slot = document.getElementById('tun-slot');
    if (slot) slot.innerHTML = tunnelStrip(D.system.tunnel);
  }
}, 1000);

function inviteBtn(id, t) {
  const m = inviteMode(t);
  if (m === 'wait') return `<button class="btn sm db-invite is-wait" data-invite="${id}" title="Aguardando a conexão para convidados ficar pronta"><span class="db-spin"></span><span>Aguarde…</span></button>`;
  if (m === 'local') return `<button class="btn sm db-invite" data-invite="${id}" title="Copiar link de convite (só funciona na mesma rede Wi‑Fi)">${icons.invite}<span>Convite local</span></button>`;
  return `<button class="btn sm db-invite" data-invite="${id}" title="Copiar link de convite para convidados">${icons.invite}<span>Convidar</span></button>`;
}

function connectionCard() {
  const t = D.system.tunnel || {};
  const turn = D.system.settings?.turn || {};
  const label = {
    on: ['ok', 'Pronto'],
    starting: ['warn', 'Conectando…'],
    downloading: ['warn', `Preparando ${Math.round(Number(t.download?.progress) || 0)}%`],
    off: ['', 'Desligado'],
    error: ['err', 'Erro'],
  }[t.status] || ['', t.status];
  return `<div class="card db-box">
    <div class="db-line">
      <div class="grow">
        <strong>Receber convidados de fora da sua rede</strong>
        <div class="hint">Liga sozinho ao abrir o CastDeck, sem conta e sem abrir portas no roteador. Não é preciso copiar nenhum endereço: o botão <b>Convidar</b> usa esta conexão automaticamente.</div>
      </div>
      <span class="pill ${label[0]}"><span class="dot"></span>${label[1]}</span>
      <label class="switch" title="Ligar/desligar"><input type="checkbox" id="tun-toggle" ${['on', 'starting', 'downloading'].includes(t.status) ? 'checked' : ''}><span></span></label>
    </div>
    ${t.error ? `<div class="hint db-err">${esc(t.error)}</div>` : ''}
    <label class="field db-field"><span>Provedor${t.providerLabel && t.status !== 'off' ? ` · em uso: ${esc(t.providerLabel)}` : ''}</span>
      <select class="input" id="tun-provider">${[['cloudflare', 'Cloudflare (padrão)'], ['auto', 'Automático (Cloudflare + reserva)'], ['localhostrun', 'localhost.run (SSH)']].map(([v, l]) => `<option value="${v}" ${v === (D.system.settings?.tunnelProvider || 'cloudflare') ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </label>
    <details>
      <summary>Servidor TURN próprio (opcional, para redes muito restritas)</summary>
      <p class="hint" style="margin:10px 0">O CastDeck já usa o TURN oficial. Só cadastre um seu se algum convidado continuar sem vídeo (ex.: Metered.ca / Open Relay, ou Cloudflare Calls).</p>
      <div class="db-turn">
        <label class="field"><span>URLs (separe por vírgula)</span><input class="input" id="turn-urls" placeholder="turn:global.relay.metered.ca:443?transport=tcp" value="${esc(turn.urls || '')}"></label>
        <label class="field"><span>Usuário</span><input class="input" id="turn-user" value="${esc(turn.username || '')}"></label>
        <label class="field"><span>Senha</span><input class="input" id="turn-pass" type="password" value="${esc(turn.credential || '')}"></label>
        <button class="btn primary" id="turn-save">Salvar</button>
      </div>
    </details>
  </div>`;
}

function bindConnection() {
  $('#tun-toggle').onchange = async (e) => {
    D.system.tunnel = await api(e.target.checked ? '/tunnel/start' : '/tunnel/stop', { method: 'POST' });
    await api('/settings', { method: 'PUT', body: { autoTunnel: e.target.checked } });
    load();
  };
  $('#tun-provider').onchange = async (e) => {
    await api('/settings', { method: 'PUT', body: { tunnelProvider: e.target.value } });
    D.system.settings = { ...D.system.settings, tunnelProvider: e.target.value };
    if ($('#tun-toggle').checked) D.system.tunnel = await api('/tunnel/restart', { method: 'POST' });
    toast('Provedor alterado', 'ok');
    load();
  };
  $('#turn-save').onclick = async () => {
    await api('/settings', { method: 'PUT', body: { turn: { urls: $('#turn-urls').value, username: $('#turn-user').value, credential: $('#turn-pass').value } } });
    toast('Servidor TURN salvo', 'ok');
  };
}

// ---------- seleção e exclusão em massa de estúdios ----------
function toggleStudioPick(id) {
  if (!id) return;
  if (studioSelected.has(id)) studioSelected.delete(id);
  else studioSelected.add(id);
  safeRender();
}

async function deleteSelectedStudios() {
  const ids = [...studioSelected].filter((id) => D.studios.some((s) => s.id === id));
  if (!ids.length) return;
  const studios = ids.map((id) => D.studios.find((s) => s.id === id)).filter(Boolean);
  const names = studios.map((s) => s.name);
  const shown = names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
  const liveN = ids.filter((id) => D.system.broadcasts.some((b) => b.studioId === id)).length;
  const title = ids.length === 1 ? 'Excluir este estúdio?' : `Excluir ${ids.length} estúdios?`;
  const sub = `${shown}\n\nMarca e banners serão perdidos.${liveN ? `\n\n${liveN} ${liveN === 1 ? 'está ao vivo agora' : 'estão ao vivo agora'}.` : ''}`;
  const okLabel = ids.length === 1 ? 'Excluir' : `Excluir ${ids.length}`;
  if (!(await confirmDialog(`${title}\n\n${sub}`, { ok: okLabel, danger: true }))) return;
  let done = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await api('/studios/' + id, { method: 'DELETE' });
      done++;
    } catch {
      failed++;
    }
  }
  studioSelected.clear();
  studioSelectMode = false;
  toast(failed ? `${done} excluído(s), ${failed} falhou(aram)` : `${done} ${done === 1 ? 'estúdio excluído' : 'estúdios excluídos'}`, failed ? 'err' : 'ok');
  await load();
}

// ---------- atualização periódica ----------
// Um só polling de /system (antes eram dois: 1,5 s e 5 s). Redesenha a página só quando algo visível muda
// de estado; o progresso do túnel atualiza apenas a faixa, sem apagar o que o usuário está digitando.
async function pollSystem() {
  let next = 5000;
  try {
    const busyForm = document.activeElement?.closest?.('#conexao details') || document.querySelector('.modal-back');
    if (D.system && !busyForm) {
      const s = await api('/system');
      const p = D.system;
      const changed =
        s.tunnel.status !== p.tunnel.status ||
        s.tunnel.url !== p.tunnel.url ||
        s.ffmpeg.available !== p.ffmpeg.available ||
        !!s.ffmpeg.installing !== !!p.ffmpeg.installing ||
        s.broadcasts.map((b) => b.studioId).join() !== p.broadcasts.map((b) => b.studioId).join();
      D.system = s;
      if (changed) {
        // transmissão começou/terminou: a lista de gravações muda (arquivo novo, selo "gravando")
        if (s.broadcasts.length !== p.broadcasts.length) D.recordings = await api('/recordings').catch(() => D.recordings);
        safeRender();
      }
      // gravação em andamento ou finalizando: acompanha o tamanho e o selo enquanto a aba está aberta
      else if (curTab === 'gravacoes' && (s.broadcasts.length || D.recordings.some((r) => r.processing))) refreshRecordings();
      else if (tunBusy(s.tunnel)) {
        const slot = $('#tun-slot');
        if (slot) slot.innerHTML = tunnelStrip(s.tunnel);
      }
      if (tunBusy(s.tunnel) || s.ffmpeg.installing) next = 1500;
    }
  } catch { /* servidor reiniciando: tenta de novo */ }
  setTimeout(pollSystem, next);
}

async function load() {
  [D.studios, D.destinations, D.recordings, D.system] = await Promise.all([api('/studios'), api('/destinations'), api('/recordings'), api('/system')]);
  // seleção em massa: descarta ids que não existem mais e sai do modo se sobrar menos de 2 estúdios
  for (const id of [...studioSelected]) if (!D.studios.some((s) => s.id === id)) studioSelected.delete(id);
  if (D.studios.length < 2) {
    studioSelectMode = false;
    studioSelected.clear();
  }
  syncLang();
  safeRender();
}

// idioma: a escolha fica no navegador e também no servidor (launcher do Windows e notificação do Android seguem ela)
window.CD_I18N_ONSET = (l) => api('/settings', { method: 'PUT', body: { lang: l } }).catch(() => {});
function syncLang() {
  const i = window.CDi18n;
  if (!i) return;
  const sv = D.system.settings?.lang;
  if (!i.explicit && sv && sv !== i.lang) i.set(sv, { silent: true });
  else if (sv !== i.lang) window.CD_I18N_ONSET(i.lang);
}

// redesenha preservando o que estava sendo digitado no campo "novo estúdio" / busca e a rolagem
function safeRender() {
  const act = document.activeElement;
  const inp = act && (act.id === 'ns-name' || act.id === 'studio-search') ? act : $('#ns-name');
  // no filtro o estado (`studioQuery`) é a fonte da verdade: se o valor do DOM divergir dele (autofill,
  // botão ✕, limpar filtro), o redesenho não pode "devolver" o texto antigo.
  const keep = inp
    ? { id: inp.id, v: inp.id === 'studio-search' ? studioQuery : inp.value, f: document.activeElement === inp, s: inp.selectionStart }
    : null;
  const y = scrollY;
  render();
  if (keep) {
    const n = $('#' + keep.id);
    if (n) {
      n.value = keep.v;
      if (keep.f) { n.focus(); try { n.setSelectionRange(keep.s, keep.s); } catch {} }
    }
  }
  scrollTo(0, y);
}

// ---------- painéis ----------
let studiosShown = 8; // "Mostrar mais" aumenta
let stepsExpanded = false;
let studioQuery = '';
// A busca só filtra depois de digitação/cola real. Sem isso o navegador preenche o campo sozinho (autofill
// tratando o campo como "login", ex.: "admin") e a lista abre já filtrada e vazia.
let filterTouched = false;
let typedAt = 0; // instante da última tecla/cola no campo de busca
// seleção em massa de estúdios
let studioSelectMode = false;
const studioSelected = new Set();
function studiosPanel(tun, last, steps) {
  const doneN = steps.filter((s) => s.done).length;
  const allDone = doneN === steps.length;
  const nextStep = steps.find((s) => !s.done) || null;
  // Quem já tem estúdio quer continuar a live, não ler a apresentação: hero compacto e checklist
  // resumido no próximo passo. Na primeira visita (sem estúdio) tudo continua aberto.
  const returning = !!last;
  const compactSteps = !stepsExpanded && (allDone || returning);
  const recentRecs = D.recordings.slice(0, 4);
  const qNorm = studioQuery.trim().toLowerCase();
  const revStudios = D.studios.slice().reverse();
  const filteredStudios = qNorm ? revStudios.filter((s) => String(s.name || '').toLowerCase().includes(qNorm)) : revStudios;
  const studioList = qNorm ? filteredStudios : filteredStudios.slice(0, studiosShown);
  return `
    <section class="hero${returning ? ' hero-compact' : ''}">
      <div class="hero-main card">
        <h1>Seu estúdio de live,<br><span class="grad">100% no seu ${D.system.platform === 'android' ? 'celular' : 'PC'}.</span></h1>
        <p>Convidados, cenas com sua marca, banners e transmissão simultânea para várias plataformas, sem nuvem e sem mensalidade.</p>
        ${last ? `<a class="btn primary lg db-continue" href="/studio/${last.id}">${icons.play}<span>Continuar: <b translate="no">${esc(last.name)}</b></span></a>` : ''}
        <form class="hero-create" id="new-studio">
          <input class="input" id="ns-name" placeholder="${last ? 'Ou crie outro estúdio…' : 'Nome do estúdio (ex.: Podcast da Semana)'}" maxlength="80" ${last ? '' : 'autofocus'}>
          <button class="btn ${last ? '' : 'primary'}">${icons.plus}<span>Criar estúdio</span></button>
        </form>
      </div>
      <aside class="card steps ${compactSteps ? 'compact' : ''}">
        ${allDone && !stepsExpanded
          ? `<div class="steps-compact-row">
              <span class="tick done">✓</span>
              <div class="grow"><strong>Tudo pronto para gravar e transmitir</strong><div class="hint">${doneN}/${steps.length} etapas concluídas</div></div>
              <button class="btn sm ghost" id="steps-toggle" type="button">Ver passo a passo</button>
            </div>`
          : returning && !stepsExpanded && nextStep
            ? `<div class="steps-compact-row">
                <span class="tick next">→</span>
                <div class="grow"><strong>${nextStep.title}</strong><div class="hint">${nextStep.hint}</div></div>
                ${nextStep.label ? `<button class="btn sm primary" data-step="${nextStep.act}">${nextStep.label}</button>` : ''}
              </div>
              <div class="steps-compact-foot">
                <span class="hint">${doneN}/${steps.length}</span>
                <button class="btn sm ghost" id="steps-toggle" type="button">Ver passo a passo</button>
              </div>`
          : `<div class="steps-head"><h4>Como começar <span class="hint">${doneN}/${steps.length}</span></h4>${allDone ? '<button class="btn sm ghost" id="steps-toggle" type="button">Recolher</button>' : ''}</div>
            <div class="progress"><i style="width:${(doneN / steps.length) * 100}%"></i></div>
            ${steps
              .map(
                (s) => `<div class="step ${s.done ? 'done' : ''}"><span class="tick">${s.done ? '✓' : ''}</span><div class="grow"><strong>${s.title}</strong><div class="hint">${s.hint}</div></div>${s.done || !s.label ? '' : `<button class="btn sm" data-step="${s.act}">${s.label}</button>`}</div>`,
              )
              .join('')}`}
      </aside>
    </section>
    <section class="section" id="estudios">
      <div class="section-head">
        <h2>Seus estúdios <span class="db-count">${D.studios.length}</span></h2>
        <div class="db-studio-tools">
          ${D.studios.length >= 4 ? `<span class="db-search-wrap ${studioQuery ? 'has-query' : ''}">
            <input class="input db-studio-search" id="studio-search" type="text" role="searchbox" placeholder="Filtrar estúdios…" value="${esc(studioQuery)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="search" data-lpignore="true" data-1p-ignore data-form-type="other" aria-label="Filtrar estúdios"${filterTouched ? '' : ' readonly'}>
            <button type="button" class="db-search-x" id="studio-search-x" title="Limpar filtro" aria-label="Limpar filtro" ${studioQuery ? '' : 'hidden'}>✕</button>
          </span>` : ''}
          ${D.studios.length >= 2 ? `<button class="btn sm ${studioSelectMode ? 'primary' : 'ghost'}" id="studios-select" type="button" aria-pressed="${studioSelectMode}" title="Selecionar estúdios para excluir em massa">${studioSelectMode ? 'Concluir' : 'Selecionar'}</button>` : ''}
        </div>
      </div>
      ${
        studioSelectMode
          ? `<div class="db-select-bar" role="group" aria-label="Seleção de estúdios">
              <span class="hint" id="studios-select-count">${studioSelected.size ? `${studioSelected.size} selecionado(s)` : 'Nenhum estúdio selecionado'}</span>
              <button class="btn sm ghost" id="studios-select-all" type="button">Selecionar todos</button>
              ${studioSelected.size ? '<button class="btn sm ghost" id="studios-select-none" type="button">Limpar seleção</button>' : ''}
              <button class="btn sm live" id="studios-delete-selected" type="button" ${studioSelected.size ? '' : 'disabled'}>Excluir selecionados</button>
            </div>`
          : ''
      }
      ${
        studioList.length
          ? `<div class="grid-cards">${studioList
              .map((s, i) => {
                const live = D.system.broadcasts.some((b) => b.studioId === s.id);
                const picked = studioSelected.has(s.id);
                const thumbStyle = `background-image:linear-gradient(180deg,hsl(230 35% 5%/.25),hsl(230 35% 4%/.75)),url('${BGS[i % BGS.length]}')`;
                return `<article class="studio-card card ${studioSelectMode ? 'is-pickable' : ''} ${picked ? 'is-picked' : ''}" data-studio="${s.id}">
                  ${studioSelectMode ? `<button class="db-pick ${picked ? 'on' : ''}" type="button" data-pick="${s.id}" aria-pressed="${picked}" title="Selecionar este estúdio" aria-label="Selecionar este estúdio">${picked ? '✓' : ''}</button>` : ''}
                  ${
                    studioSelectMode
                      ? `<div class="studio-thumb" style="${thumbStyle}">`
                      : `<a class="studio-thumb" href="/studio/${s.id}" tabindex="-1" style="${thumbStyle}">`
                  }
                    ${live ? '<span class="pill live"><span class="dot"></span>AO VIVO</span>' : '<span class="pill ok"><span class="dot"></span>PRONTO</span>'}
                    <span class="st-ar-badge">16:9</span>
                    <span class="initial">${esc((s.name[0] || '?').toUpperCase())}</span>
                  ${studioSelectMode ? '</div>' : '</a>'}
                  <div class="studio-body">
                    <div class="studio-meta">
                      <h3 translate="no" title="${esc(s.name)}">${esc(s.name)}</h3>
                      <span class="hint">Criado em ${new Date(s.createdAt).toLocaleDateString(window.CD_LOCALE || 'pt-BR')}</span>
                    </div>
                    ${
                      studioSelectMode
                        ? ''
                        : `<div class="db-acts">
                      <a class="btn primary sm db-open" href="/studio/${s.id}">${icons.play}<span>Abrir estúdio</span></a>
                      ${inviteBtn(s.id, tun)}
                      <button class="btn sm db-ico" data-edit="${s.id}" title="Renomear" aria-label="Renomear">${icons.edit}</button>
                      <button class="btn sm db-ico danger" data-del="${s.id}" title="Excluir" aria-label="Excluir">${icons.trash}</button>
                    </div>`
                    }
                  </div>
                </article>`;
              })
              .join('')}</div>${!qNorm && D.studios.length > studiosShown ? `<div class="rec-more"><button class="btn" id="studios-more" type="button">Mostrar mais estúdios (${D.studios.length - studiosShown})</button></div>` : ''}`
          : qNorm
            ? `<div class="empty">Nenhum estúdio corresponde a “${esc(studioQuery)}”. <button type="button" class="btn sm ghost" id="studio-search-clear" style="margin-left:8px">✕ Limpar filtro</button></div>`
            : '<div class="empty">Crie seu primeiro estúdio acima para começar.</div>'
      }
    </section>
    ${
      recentRecs.length
        ? `<section class="section" id="gravacoes-recentes">
            <div class="section-head">
              <h2>Gravações Recentes <span class="db-count">${D.recordings.length}</span></h2>
              <button class="btn sm ghost" type="button" data-goto-tab="gravacoes">Ver todas →</button>
            </div>
            <div class="rec-strip-grid">
              ${recentRecs
                .map(
                  (r, i) => `<article class="rec-strip-card card">
                    <button class="rec-thumb" type="button" data-play="${i}" title="Assistir" aria-label="Assistir ${esc(r.name)}">
                      <video muted preload="none" playsinline data-src="${r.url}?v=${Math.round(r.mtime)}-${r.size}#t=2"></video>
                      <span class="rec-play">${icons.play}</span>
                      <span class="rec-strip-badge">${fmtBytes(r.size)}</span>
                    </button>
                    <div class="rec-strip-body">
                      <strong translate="no" title="${esc(r.name)}">${esc(recTitle(r.name))}</strong>
                      <span class="hint">${new Date(r.mtime).toLocaleDateString(window.CD_LOCALE || 'pt-BR')} · ${fmtBytes(r.size)}</span>
                      <div class="rec-strip-acts">
                        <button class="btn sm primary" type="button" data-play="${i}" title="Assistir">${icons.play}<span>Assistir</span></button>
                        ${D.system.platform === 'android' ? '' : `<button class="btn sm db-ico" type="button" data-reveal="${esc(r.name)}" title="Mostrar na pasta" aria-label="Mostrar na pasta">${icons.folder}</button>`}
                      </div>
                    </div>
                  </article>`,
                )
                .join('')}
            </div>
          </section>`
        : ''
    }`;
}

function destPanel() {
  return `<section class="section" id="destinos">
    <div class="section-head"><h2>Onde transmitir <span class="db-count">${D.destinations.length}</span></h2>
      <div class="db-head-acts"><button class="btn sm" id="key-help">❓ <span>Onde pego a chave?</span></button><button class="btn sm primary" id="add-dest">${icons.plus}<span>Novo destino</span></button></div></div>
    <p class="hint db-lead">YouTube, Facebook, Twitch ou qualquer servidor RTMP. Os ligados aqui já vêm marcados quando você clica em Transmitir no estúdio.</p>
    <div class="db-dest-grid">${
      D.destinations.length
        ? D.destinations.map((d) => destCardHtml(d)).join('')
        : '<div class="empty">Nenhum destino ainda. Adicione YouTube, Facebook, Twitch ou qualquer servidor RTMP.<br><span class="hint">Opcional: se for só gravar, pode pular.</span></div>'
    }</div>
  </section>`;
}

let recShown = 12; // "Mostrar mais" aumenta
function recPanel() {
  const total = D.recordings.reduce((a, r) => a + (r.size || 0), 0);
  const list = D.recordings.slice(0, recShown);
  return `<section class="section" id="gravacoes">
    <div class="section-head"><h2>Gravações <span class="db-count">${D.recordings.length}</span></h2>
      <div class="db-head-acts">${D.recordings.length ? `<span class="hint">${fmtBytes(total)} no total</span>` : ''}<button class="btn sm" id="open-rec2">${icons.folder}<span>Abrir pasta</span></button></div></div>
    <div class="rec-grid">${
      list.length
        ? list
            .map(
              (r, i) => `<article class="rec-card card${r.recording ? ' is-live' : ''}">
              <button class="rec-thumb" data-play="${i}" title="Assistir" aria-label="Assistir ${esc(r.name)}">
                <video muted preload="none" playsinline data-src="${r.url}?v=${Math.round(r.mtime)}-${r.size}#t=2"></video>
                <span class="rec-play">${icons.play}</span>
                ${r.recording ? '<span class="pill live rec-badge"><span class="dot"></span>GRAVANDO</span>' : r.processing ? '<span class="pill warn rec-badge">Finalizando…</span>' : ''}
                ${/_vertical/.test(r.name) ? '<span class="pill rec-badge rec-badge-r">9:16</span>' : ''}
              </button>
              <div class="rec-body">
                <strong translate="no" title="${esc(r.name)}">${esc(recTitle(r.name))}</strong>
                <span class="hint">${new Date(r.mtime).toLocaleString(window.CD_LOCALE || 'pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${fmtBytes(r.size)}</span>
                <div class="rec-acts">
                  <button class="btn sm primary" data-play="${i}">${icons.play}<span>Assistir</span></button>
                  <button class="btn sm db-ico" data-reveal="${esc(r.name)}" title="Mostrar na pasta" aria-label="Mostrar na pasta">${icons.folder}</button>
                  <button class="btn sm db-ico danger" data-delrec="${esc(r.name)}" title="Excluir" aria-label="Excluir">${icons.trash}</button>
                </div>
              </div></article>`,
            )
            .join('')
        : '<div class="empty">As gravações aparecem aqui. Marque "Gravar" ao transmitir no estúdio.</div>'
    }</div>
    ${D.recordings.length > recShown ? `<div class="rec-more"><button class="btn" id="rec-more">Mostrar mais (${D.recordings.length - recShown})</button></div>` : ''}
  </section>`;
}

// miniaturas: só carregam quando o card aparece na tela (a aba Gravações pode ter dezenas de vídeos)
let thumbObs = null;
function lazyThumbs() {
  thumbObs?.disconnect();
  thumbObs = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      const v = e.target;
      thumbObs.unobserve(v);
      v.preload = 'metadata';
      v.src = v.dataset.src;
      v.addEventListener('loadeddata', () => v.classList.add('ok'), { once: true });
    }
  }, { rootMargin: '200px' });
  $$('.rec-thumb video[data-src]').forEach((v) => thumbObs.observe(v));
}

async function deleteRecording(r) {
  if (!(await confirmDialog(`Excluir esta gravação do disco?\n\n${r.name}`, { ok: 'Excluir', danger: true }))) return false;
  try {
    await api('/recordings/' + encodeURIComponent(r.name), { method: 'DELETE' });
  } catch (e) {
    toast(e.message, 'err');
    return false;
  }
  D.recordings = D.recordings.filter((x) => x.name !== r.name);
  safeRender();
  return true;
}

function configPanel(f, hw) {
  return `<section class="section" id="conexao">
      <div class="section-head"><h2>Conexão com convidados</h2></div>
      ${connectionCard()}
    </section>
    <section class="section" id="sistema">
      <div class="section-head"><h2>Sistema</h2></div>
      <div class="card sys">
        <div class="sys-row"><span>Versão do CastDeck</span><span class="pill ok">v${esc(D.system.version || 'dev')}</span></div>
        ${updateRow()}
        <div class="sys-row"><span>Codificador de vídeo</span><span class="pill ${f.available ? 'ok' : 'err'}">${D.system.platform === 'android' ? 'Encoder do aparelho' : f.available ? 'FFmpeg ' + esc(f.version.split('-')[0]) : 'FFmpeg ausente'}</span></div>
        <div class="sys-row"><span>Encoders</span><span class="db-pills">${f.encoders.map((e) => `<span class="pill ${e.hw ? 'ok' : ''}">${esc(e.label)}</span>`).join('') || '—'}</span></div>
        <div class="sys-row"><span>Aceleração por GPU</span><span class="pill ${hw.length ? 'ok' : 'warn'}">${hw.length ? 'Disponível' : 'Só CPU'}</span></div>
        <div class="sys-row"><span>Link na rede local</span><code>${D.system.lan[0] ? esc(D.system.lan[0].url) : 'sem rede'}</code></div>
        <div class="sys-row rec-dir-row"><span>Pasta das gravações</span>
          <div class="rec-dir">
            <code id="rec-dir" title="${esc(D.system.recordingsDir || '')}">${esc(D.system.recordingsDir || '')}</code>
            <div class="rec-dir-acts">
              <button class="btn sm primary" id="pick-rec">${icons.folder}<span>Escolher…</span></button>
              <button class="btn sm" id="open-rec">Abrir</button>
              ${D.system.settings?.recordingsDir ? `<button class="btn sm ghost" id="reset-rec" title="Voltar para ${esc(D.system.recordingsDefault || '')}">Padrão</button>` : ''}
            </div>
          </div>
        </div>
        <div class="sys-row"><span>Abrir o app</span><button class="btn sm" id="open-browser" title="Abre este painel numa aba do seu navegador padrão">${icons.tab}<span>No navegador</span></button></div>
        <div class="sys-row"><span>Ao iniciar</span>
          <select class="input db-select" id="open-mode">
            ${[['app', 'Janela do app'], ['browser', 'Navegador'], ['none', 'Não abrir']].map(([v, l]) => `<option value="${v}" ${(D.system.settings?.openMode || 'app') === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="sys-row"><span>Licença</span><span class="db-legal">© Miguel Kallemback / flue.live · <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener">AGPL-3.0</a>, sem garantia · <a href="https://github.com/aloproducao2/castdeck-local" target="_blank" rel="noopener">código-fonte (GitHub)</a></span></div>
        ${f.available ? '' : `<p class="hint db-err">${esc(f.error)}</p>`}
      </div>
    </section>`;
}

function render() {
  const f = D.system.ffmpeg;
  const hw = f.encoders.filter((e) => e.hw);
  const tun = D.system.tunnel || {};
  trackTunnel(tun);
  const last = D.studios[D.studios.length - 1];
  const steps = [
    { done: D.studios.length > 0, title: 'Criar um estúdio', hint: 'Dê um nome e clique em Criar.', act: 'focus', label: 'Criar' },
    {
      done: tun.status === 'on',
      title: 'Conexão para convidados',
      hint: tun.status === 'on' ? 'Pronta.' : tunBusy(tun) ? 'Conectando sozinho… é só aguardar.' : tun.status === 'error' ? 'Falhou. Veja em Configurações.' : 'Desligada: só convidados da sua rede.',
      act: 'conexao',
      label: tunBusy(tun) ? '' : 'Ver',
    },
    { done: D.destinations.length > 0, title: 'Adicionar onde transmitir', hint: 'YouTube, Twitch, Facebook ou RTMP. Opcional se for só gravar.', act: 'dest', label: 'Adicionar' },
    { done: D.recordings.length > 0 || D.system.broadcasts.length > 0, title: 'Abrir o estúdio e ir ao ar', hint: 'Convide pessoas, monte a cena e clique em Transmitir.', act: 'open', label: 'Abrir' },
  ];
  const badge = { estudios: D.studios.length, destinos: D.destinations.length, gravacoes: D.recordings.length };
  app.innerHTML = `
    <header class="dash-top">
      <div class="brand"><span class="brand-mark">${icons.logo}</span>CastDeck <span class="hint">Local</span></div>
      <nav class="dash-nav db-tabs" role="tablist" aria-label="Seções do painel">
        ${TABS.map((t) => `<a href="#${t.id}" class="db-tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === curTab}">${icons[t.icon]}<span>${t.label}</span>${badge[t.id] ? `<i class="db-badge">${badge[t.id]}</i>` : ''}</a>`).join('')}
      </nav>
      <div class="db-right">
        ${tunnelChip(tun)}
        <span class="pill ok db-turn-pill" title="Servidor TURN pronto para convidados"><span class="dot"></span>TURN: OK</span>
        ${window.CDi18n ? window.CDi18n.selectHTML({ className: 'input db-lang', short: true, id: 'dash-lang' }) : ''}
        ${f.available || D.system.platform === 'android' ? '' : '<span class="pill err"><span class="dot"></span>FFmpeg ausente</span>'}
      </div>
    </header>

    <div id="tun-slot">${tunnelStrip(tun)}</div>
    ${updateBanner()}

    <div class="db-panel" data-panel="estudios">${studiosPanel(tun, last, steps)}</div>
    <div class="db-panel" data-panel="destinos">${destPanel()}</div>
    <div class="db-panel" data-panel="gravacoes">${recPanel()}</div>
    <div class="db-panel" data-panel="config">${configPanel(f, hw)}</div>`;

  showTab(curTab, { push: false });
  $$('.db-tab').forEach((a) => (a.onclick = (e) => { e.preventDefault(); showTab(a.dataset.tab); scrollTo({ top: 0, behavior: 'smooth' }); }));
  $$('[data-goto-tab]').forEach((b) => (b.onclick = () => { showTab(b.dataset.gotoTab); scrollTo({ top: 0, behavior: 'smooth' }); }));
  $('#tun-chip').onclick = () => { showTab('config'); $('#conexao').scrollIntoView({ behavior: 'smooth' }); };
  // "Detalhes" no chip discreto devolve a faixa completa (até a próxima mudança de estado da conexão)
  document.addEventListener('click', (e) => {
    if (!e.target.closest?.('#tun-expand')) return;
    tunExpanded = true;
    tunSlim = false;
    const slot = $('#tun-slot');
    if (slot && D.system) slot.innerHTML = tunnelStrip(D.system.tunnel);
  });

  $$('[data-step]').forEach(
    (b) =>
      (b.onclick = () => {
        const a = b.dataset.step;
        if (a === 'focus') return $('#ns-name').focus();
        if (a === 'conexao') { showTab('config'); return $('#conexao').scrollIntoView({ behavior: 'smooth' }); }
        if (a === 'dest') return editDest();
        if (a === 'open') return last ? (location.href = `/studio/${last.id}`) : $('#ns-name').focus();
      }),
  );
  $$('[data-invite]').forEach((b) => (b.onclick = () => {
    const t = D.system.tunnel || {};
    const m = inviteMode(t);
    // esperando o túnel: não entrega um link que não funciona fora de casa; o botão fica pronto sozinho
    if (m === 'wait') return toast('A conexão para convidados ainda está sendo preparada. Aguarde alguns segundos: o botão Convidar fica pronto sozinho.', 'info');
    if (m === 'ready') return copyText(`${t.url}/join/${b.dataset.invite}`);
    const lan = D.system.lan[0]?.url || location.origin;
    toast(t.status === 'error' ? 'Conexão externa indisponível: copiei o link da rede local (só funciona no mesmo Wi‑Fi).' : 'Conexão externa desligada: copiei o link da rede local (só funciona no mesmo Wi‑Fi).', 'info');
    copyText(`${lan}/join/${b.dataset.invite}`);
  }));
  const tr = $('#tun-retry');
  if (tr) tr.onclick = async () => { tr.disabled = true; D.system.tunnel = await api('/tunnel/restart', { method: 'POST' }).catch(() => D.system.tunnel); safeRender(); };
  $('#new-studio').onsubmit = async (e) => {
    e.preventDefault();
    const s = await api('/studios', { method: 'POST', body: { name: $('#ns-name').value.trim() || 'Meu estúdio' } });
    location.href = `/studio/${s.id}`;
  };
  const openFolder = () => api('/recordings/open-folder', { method: 'POST' });
  $('#open-rec').onclick = openFolder;
  $('#open-rec2').onclick = openFolder;
  $('#pick-rec').onclick = async () => {
    if (await chooseRecordingsDir(D.system.recordingsDir)) load();
  };
  const rr = $('#reset-rec');
  if (rr) rr.onclick = async () => (await resetRecordingsDir(), load());
  $('#open-browser').onclick = async () => {
    const r = await api('/open', { method: 'POST', body: { mode: 'browser' } });
    toast(`Abrindo no navegador: ${r.url}`, 'ok');
  };
  $('#open-mode').onchange = async (e) => {
    D.system.settings = await api('/settings', { method: 'PUT', body: { openMode: e.target.value } });
    toast('Preferência salva', 'ok');
  };
  bindConnection();
  bindUpdates();
  $$('[data-del]').forEach(
    (b) =>
      (b.onclick = async () => {
        if (!(await confirmDialog('Excluir este estúdio?\n\nMarca e banners serão perdidos.', { ok: 'Excluir', danger: true }))) return;
        await api('/studios/' + b.dataset.del, { method: 'DELETE' });
        load();
      }),
  );
  $$('[data-edit]').forEach(
    (b) =>
      (b.onclick = async () => {
        const s = D.studios.find((x) => x.id === b.dataset.edit);
        const name = await promptDialog('Novo nome do estúdio', s.name, { ok: 'Renomear', placeholder: 'Nome do estúdio' });
        if (name?.trim()) {
          await api('/studios/' + s.id, { method: 'PUT', body: { name: name.trim() } });
          load();
        }
      }),
  );
  $('#add-dest').onclick = () => editDest();
  $('#key-help').onclick = () => showKeyHelp();
  // cards de destino (mesmo desenho do estúdio): editar, colar chave, renovar a live conectada e remover
  bindDestCards(document, {
    list: () => D.destinations,
    onEdit: (d) => editDest(d),
    onDelete: async (d) => {
      if (await deleteDestination(d)) load();
    },
    onPrepare: async (d) => {
      try {
        await prepareDestination(d, {});
        toast('Live renovada no destino', 'ok');
        load();
      } catch (e) {
        toast(e.message, 'err');
      }
    },
  });
  $$('[data-delrec]').forEach(
    (b) => (b.onclick = () => deleteRecording(D.recordings.find((r) => r.name === b.dataset.delrec))),
  );
  $$('[data-play]').forEach((b) => (b.onclick = () => playRecording(D.recordings.slice(), Number(b.dataset.play), { onDelete: deleteRecording })));
  $$('[data-reveal]').forEach((b) => (b.onclick = () => revealRecording(b.dataset.reveal)));
  const more = $('#rec-more');
  if (more) more.onclick = () => { recShown += 24; safeRender(); };
  const stTog = $('#steps-toggle');
  if (stTog) stTog.onclick = () => { stepsExpanded = !stepsExpanded; safeRender(); };
  const stSrch = $('#studio-search');
  if (stSrch) {
    // O navegador insiste em tratar este campo como "login" e preenche com o último usuário salvo
    // (ex.: "admin") — inclusive ao clicar no campo. Por isso: (1) o campo nasce `readonly`, então não é
    // alvo de autofill; (2) só aceitamos `input` que veio de tecla/cola real (janela de 2,5 s), e qualquer
    // outro é descartado e o campo volta ao valor de verdade.
    const markTyped = () => {
      filterTouched = true;
      typedAt = Date.now();
      if (stSrch.hasAttribute('readonly')) stSrch.removeAttribute('readonly');
    };
    stSrch.addEventListener('keydown', markTyped);
    stSrch.addEventListener('paste', markTyped);
    stSrch.addEventListener('compositionstart', markTyped);
    stSrch.addEventListener('pointerdown', () => {
      // clique só libera a edição; NÃO conta como digitação (autofill acontece no clique)
      if (stSrch.hasAttribute('readonly')) stSrch.removeAttribute('readonly');
      if (!typedAt && stSrch.value !== studioQuery) stSrch.value = studioQuery;
    });
    stSrch.addEventListener('focus', () => {
      if (!typedAt && stSrch.value !== studioQuery) stSrch.value = studioQuery;
    });
    stSrch.oninput = (e) => {
      const fromTyping = typedAt && Date.now() - typedAt < 2500;
      if (!fromTyping) {
        // veio de autofill (inclusive o disparado ao clicar): descarta e restaura o valor real
        e.target.value = studioQuery;
        return;
      }
      studioQuery = e.target.value;
      safeRender();
    };
    // valor que o navegador tenha colocado antes de qualquer interação
    if (!typedAt && stSrch.value !== studioQuery) stSrch.value = studioQuery;
  }
  const stClr = $('#studio-search-x');
  if (stClr)
    stClr.onclick = () => {
      studioQuery = '';
      filterTouched = true;
      safeRender();
      $('#studio-search')?.focus();
    };
  // ---- seleção em massa ----
  const selToggle = $('#studios-select');
  if (selToggle)
    selToggle.onclick = () => {
      studioSelectMode = !studioSelectMode;
      studioSelected.clear();
      safeRender();
    };
  const selAll = $('#studios-select-all');
  if (selAll)
    selAll.onclick = () => {
      const q = studioQuery.trim().toLowerCase();
      const list = q ? D.studios.filter((s) => String(s.name || '').toLowerCase().includes(q)) : D.studios;
      list.forEach((s) => studioSelected.add(s.id));
      safeRender();
    };
  const selNone = $('#studios-select-none');
  if (selNone) selNone.onclick = () => { studioSelected.clear(); safeRender(); };
  const selDel = $('#studios-delete-selected');
  if (selDel) selDel.onclick = () => deleteSelectedStudios();
  // no modo seleção o card inteiro alterna a marcação (e não abre o estúdio)
  if (studioSelectMode) {
    $$('.studio-card[data-studio]').forEach((card) => {
      card.onclick = (e) => {
        if (e.target.closest('a, button')) return;
        toggleStudioPick(card.dataset.studio);
      };
    });
  }
  $$('[data-pick]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); toggleStudioPick(b.dataset.pick); }));
  const smore = $('#studios-more');
  if (smore) smore.onclick = () => { studiosShown += 16; safeRender(); };
  lazyThumbs();
}

// lista de gravações atualizada (fim de uma transmissão, aba aberta): só redesenha se mudou algo
async function refreshRecordings() {
  const r = await api('/recordings').catch(() => null);
  if (!r) return;
  const key = (l) => l.map((x) => `${x.name}|${x.recording ? '' : x.size}|${x.recording}|${x.processing}`).join();
  if (key(r) === key(D.recordings)) return;
  D.recordings = r;
  if (!document.querySelector('.modal-back')) safeRender();
}

async function editDest(d) {
  if (await editDestination(d)) load();
}

load()
  .then(() => {
    startUpdates(D.system, () => { if (!document.querySelector('.modal-back')) safeRender(); });
    setTimeout(pollSystem, 1500);
  })
  .catch((e) => (app.innerHTML = `<div class="empty">Erro ao carregar: ${esc(e.message)}</div>`));
