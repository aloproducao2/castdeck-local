// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Verificação de atualizações: consulta o releases.json do site oficial (o mesmo que o
// "npm run release" publica) e avisa quando existe uma versão mais nova para esta plataforma.
// Automática (ao abrir o painel e a cada 6 h, pode ser desligada) ou manual ("Verificar agora").
import { esc, toast, api } from './ui.js';

const BASE = 'https://cast.flue.live';
const EVERY = 6 * 3600 * 1000;
const K = { auto: 'cd-upd-auto', last: 'cd-upd-last', skip: 'cd-upd-skip' };

const U = { state: 'idle', latest: null, at: 0, current: '', target: '', platform: '', onChange: () => {} };
// atualização dentro do app (estado no servidor local: /api/update/*)
const D = { state: 'idle', got: 0, total: 0, error: null, canInstall: false, timer: 0 };

const isAuto = () => localStorage.getItem(K.auto) !== '0';
const cmp = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(0) + ' MB' : Math.round(b / 1024) + ' KB');
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`;
};

function judge() {
  const newer = U.latest && U.current && U.current !== 'dev' && cmp(U.latest.version, U.current) > 0;
  U.state = newer ? 'available' : 'ok';
}

export async function checkUpdates(manual = false) {
  if (U.state === 'checking') return;
  U.state = 'checking';
  U.onChange();
  try {
    const r = await fetch(`${BASE}/releases.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const rels = (data.releases || []).slice().sort((a, b) => cmp(b.version, a.version));
    let found = null;
    for (const rel of rels) {
      const a = (rel.artifacts || []).find((x) => x.platform === U.target && x.available);
      if (a) { found = { version: rel.version, date: rel.date, notes: rel.notes || [], file: a.file, size: a.size }; break; }
    }
    // plataforma sem build próprio: compara com a versão geral e manda para a página de downloads
    if (!found && rels[0]) found = { version: rels[0].version, date: rels[0].date, notes: rels[0].notes || [], file: '', size: 0 };
    U.latest = found;
    U.at = Date.now();
    localStorage.setItem(K.last, JSON.stringify({ at: U.at, latest: found }));
    judge();
    if (manual) toast(U.state === 'available' ? `Nova versão v${found.version} disponível!` : `Tudo em dia: você já tem a versão mais recente (v${U.current}).`, 'ok');
  } catch {
    U.state = 'error';
    if (manual) toast('Não consegui verificar agora. Confira sua conexão com a internet.', 'err');
  }
  U.onChange();
}

function downloadUrl() {
  const f = U.latest?.file;
  // /dl/ conta o download no site e redireciona para o arquivo
  return f ? `${BASE}/${f.replace(/^downloads\//, 'dl/')}` : `${BASE}/downloads.html`;
}

async function openDownload() {
  const url = downloadUrl();
  // Android: navegar para fora do app abre o navegador do aparelho (ver MainActivity)
  if (U.platform === 'android') { location.href = url; return; }
  try {
    await api('/open-url', { method: 'POST', body: { url } });
    toast('Abrindo o download no navegador…', 'ok');
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

// ---------- atualização dentro do app ----------
const pct = () => (D.total ? Math.min(100, Math.floor((D.got / D.total) * 100)) : 0);

function applyStatus(s) {
  const before = D.state;
  Object.assign(D, { state: s.state, got: s.got || 0, total: s.total || 0, error: s.error || null, canInstall: !!s.canInstall });
  if (D.state === 'downloading') {
    // só atualiza a barra (não redesenha o painel inteiro a cada passo)
    document.querySelectorAll('.upd-prog').forEach((el) => {
      el.querySelector('i').style.width = pct() + '%';
      el.querySelector('span').textContent = `Baixando… ${pct()}%${D.total ? ` de ${fmtSize(D.total)}` : ''}`;
    });
  }
  if (before !== D.state) {
    if (D.state === 'ready') toast(`Atualização v${s.version} baixada. Clique em "Reiniciar e atualizar".`, 'ok');
    if (D.state === 'error' && before === 'downloading') toast(D.error || 'Falha ao baixar a atualização.', 'err');
    U.onChange();
  }
}

function poll() {
  clearTimeout(D.timer);
  api('/update/status')
    .then((s) => { applyStatus(s); if (D.state === 'downloading') D.timer = setTimeout(poll, 700); })
    .catch(() => { D.timer = setTimeout(poll, 2000); });
}

async function startDownload() {
  try {
    applyStatus(await api('/update/download', { method: 'POST', body: {} }));
    poll();
  } catch (e) {
    toast(e.message || 'Não consegui iniciar o download.', 'err');
  }
}

function restartingOverlay() {
  const el = document.createElement('div');
  el.className = 'upd-overlay';
  el.innerHTML = `<div class="upd-box"><div class="upd-spin"></div><strong>Atualizando para a v${esc(U.latest?.version || '')}…</strong>
    <p>O CastDeck vai fechar e abrir de novo sozinho em alguns segundos. Seus estúdios e configurações são mantidos.</p></div>`;
  document.body.append(el);
  // Linux: a mesma janela volta quando o servidor novo responder (no Windows o lançador reabre a janela)
  let down = false;
  const t0 = Date.now();
  const tick = () => fetch('/api/health', { cache: 'no-store' })
    .then((r) => { if (r.ok && down) location.reload(); else setTimeout(tick, 1000); })
    .catch(() => { down = true; if (Date.now() - t0 < 180000) setTimeout(tick, 1000); });
  setTimeout(tick, 1500);
}

async function install() {
  try {
    const r = await api('/update/install', { method: 'POST', body: {} });
    if (U.platform === 'android') {
      toast(r.permission
        ? 'Permita "Instalar apps desconhecidos" para o CastDeck, volte e toque em "Instalar atualização" de novo.'
        : 'Toque em "Atualizar" na tela do Android para concluir.', 'ok');
      return;
    }
    restartingOverlay();
  } catch (e) {
    toast(e.message || 'Não foi possível instalar a atualização.', 'err');
  }
}

// botões conforme o estado (dentro do app quando dá; senão, download pelo navegador)
function actions(primaryId) {
  if (!D.canInstall) return `<button class="btn sm primary" id="${primaryId}" data-upd="browser">Baixar atualização</button>`;
  if (D.state === 'downloading') return `<div class="upd-prog"><i style="width:${pct()}%"></i><span>Baixando… ${pct()}%</span></div>`;
  if (D.state === 'ready' || D.state === 'installing') {
    const label = U.platform === 'android' ? 'Instalar atualização' : 'Reiniciar e atualizar';
    return `<button class="btn sm primary" id="${primaryId}" data-upd="install">${label}</button>`;
  }
  return `<button class="btn sm primary" id="${primaryId}" data-upd="download">${D.state === 'error' ? 'Tentar de novo' : 'Atualizar agora'}</button>`;
}

const HOWTO = {
  android: 'Abra o APK baixado e toque em Atualizar. Seus estúdios e configurações continuam no aparelho.',
  windows: 'Feche o CastDeck e substitua o CastDeck.exe antigo pelo novo. Seus estúdios e configurações são mantidos.',
  macos: 'Feche o CastDeck, substitua o arquivo antigo pelo novo e rode "codesign --sign -" nele se o macOS bloquear.',
  linux: 'Feche o CastDeck e substitua o arquivo antigo pelo novo (lembre de dar permissão de execução).',
};
const howto = () => {
  if (D.canInstall) {
    if (D.state === 'error' && D.error) return D.error;
    return U.platform === 'android'
      ? 'O CastDeck baixa a atualização e abre a tela de instalação do Android: é só tocar em Atualizar. Seus estúdios continuam no aparelho.'
      : 'O CastDeck baixa a nova versão, reinicia sozinho e mantém seus estúdios e configurações.';
  }
  return HOWTO[U.platform === 'android' ? 'android' : (U.target.split('-')[0] || 'windows')] || HOWTO.windows;
};

// faixa no topo do painel quando há versão nova (some com "Depois" até sair a próxima)
export function updateBanner() {
  if (U.state !== 'available' || localStorage.getItem(K.skip) === U.latest.version) return '';
  const l = U.latest;
  const notes = l.notes.slice(0, 3).map((n) => `<li>${esc(n)}</li>`).join('');
  return `<div class="tun-card ok upd-card"><span class="tun-ico">⬆</span><div class="grow">
      <strong>Nova versão v${esc(l.version)} disponível</strong> <span class="hint">· você está na v${esc(U.current)}${l.size ? ` · ${fmtSize(l.size)}` : ''}</span>
      ${notes ? `<ul class="upd-notes">${notes}</ul>` : ''}<div class="hint">${esc(howto())}</div></div>
    <div class="upd-acts">${actions('upd-get')}<button class="btn sm ghost" id="upd-later">Depois</button></div></div>`;
}

// linha "Atualizações" na seção Sistema
export function updateRow() {
  const pill = {
    idle: ['', '—'],
    checking: ['', 'Verificando…'],
    ok: ['ok', `Em dia${U.at ? ' · verificado ' + ago(U.at) : ''}`],
    available: ['warn', `v${esc(U.latest?.version || '')} disponível`],
    error: ['err', 'Sem conexão com o site'],
  }[U.state];
  return `<div class="sys-row"><span>Atualizações</span><span class="upd-ctl">
      <span class="pill ${pill[0]}">${pill[1]}</span>
      ${U.state === 'available' ? actions('upd-get2') : ''}
      <button class="btn sm" id="upd-check" ${U.state === 'checking' ? 'disabled' : ''}>Verificar agora</button>
      <label class="upd-auto" title="Procura versões novas ao abrir o painel e a cada 6 horas"><input type="checkbox" id="upd-auto" ${isAuto() ? 'checked' : ''}> automática</label>
    </span></div>`;
}

export function bindUpdates() {
  const get = (e) => {
    const kind = e.currentTarget.dataset.upd;
    if (kind === 'download') startDownload();
    else if (kind === 'install') install();
    else openDownload();
  };
  const b1 = document.getElementById('upd-get'); if (b1) b1.onclick = get;
  const b2 = document.getElementById('upd-get2'); if (b2) b2.onclick = get;
  const later = document.getElementById('upd-later');
  if (later) later.onclick = () => { localStorage.setItem(K.skip, U.latest.version); U.onChange(); };
  const chk = document.getElementById('upd-check');
  if (chk) chk.onclick = () => checkUpdates(true);
  const auto = document.getElementById('upd-auto');
  if (auto) auto.onchange = () => {
    localStorage.setItem(K.auto, auto.checked ? '1' : '0');
    toast(auto.checked ? 'Verificação automática ligada' : 'Verificação automática desligada', 'ok');
    if (auto.checked && Date.now() - U.at > EVERY) checkUpdates();
  };
}

// chamado uma vez quando o painel carrega
export function startUpdates(system, onChange) {
  U.current = system?.version || '';
  U.target = system?.updateTarget || '';
  U.platform = system?.platform || '';
  U.onChange = onChange;
  try {
    const last = JSON.parse(localStorage.getItem(K.last) || 'null');
    if (last?.latest) { U.latest = last.latest; U.at = last.at; judge(); }
  } catch { /* cache inválido: ignora */ }
  const tick = () => { if (isAuto() && Date.now() - U.at > EVERY) checkUpdates(); };
  // ao abrir sempre confere (se automática), depois a cada 6 h
  if (isAuto()) checkUpdates();
  setInterval(tick, 30 * 60 * 1000);
  // servidor sabe se esta instalação se atualiza sozinha (versões antigas não têm a rota: fica o navegador)
  api('/update/status').then((s) => { applyStatus(s); if (D.state === 'downloading') poll(); U.onChange(); }).catch(() => {});
}
