// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Modal / visualização de QR Code para controlar o Pad de Efeitos Sonoros pelo celular (/pad-remote/:id).
import { api, copyText, esc, modal, toast } from './ui.js';
import { qrSvg } from './studio/qr.js';

/**
 * Monta a interface de QR Code e seleção de rede para o controle mobile do Pad.
 */
export async function mountPadQrView(box, { studioId = 'local', onInfo = null, showClose = false, onClose = null } = {}) {
  if (!box) return;
  box.dataset.padQr = '1';
  box.classList.add('pad-qr-modal');
  box.classList.remove('rc-switcher-modal');
  delete box.dataset.rcSwitcher;
  box.innerHTML = `<div class="rc-head"><div class="rc-head-txt"><b>🎛️ Pad no Celular (QR Code)</b><span class="rc-sub">Carregando endereço e chave de acesso…</span></div></div>`;

  let info;
  try {
    info = await api(`/pad-remote-link/${encodeURIComponent(studioId || 'local')}`);
  } catch (e) {
    box.innerHTML = `
      <div class="rc-head">
        <div class="rc-head-txt">
          <b>🎛️ Pad no Celular (QR Code)</b>
          <span class="rc-sub">${esc(e.message || 'Não foi possível obter o link do controle remoto.')}</span>
        </div>
      </div>
      <div class="pad-edit-actions">
        <div class="spacer"></div>
        ${showClose ? '<button type="button" class="btn sm ghost" data-pqr="close">Fechar</button>' : '<button type="button" class="btn sm primary" data-close>Entendi</button>'}
      </div>`;
    box.querySelector('[data-pqr="close"]')?.addEventListener('click', () => onClose?.());
    return;
  }

  onInfo?.(info);

  let net = '';
  let diag = '';
  let tunnelBusy = false;

  function bases() {
    const list = [];
    for (const l of info.lan || []) {
      list.push({ id: 'lan:' + l.address, label: `Wi-Fi / rede local · ${l.address}`, url: `http://${l.address}:${info.httpPort}` });
    }
    if (info.tunnel?.url) {
      list.push({ id: 'net', label: 'Internet (túnel público)', url: info.tunnel.url });
    }
    if (!list.length) {
      list.push({ id: 'local', label: 'Este computador (só teste)', url: `http://localhost:${info.httpPort}` });
    }
    return list;
  }

  function linkUrl() {
    const bs = bases();
    if (!bs.some((b) => b.id === net)) net = bs[0].id;
    const b = bs.find((x) => x.id === net) || bs[0];
    return `${b.url}/pad-remote/${encodeURIComponent(info.studioId)}?k=${encodeURIComponent(info.key)}`;
  }

  async function testLinks() {
    const bs = bases();
    diag = 'Testando conectividade…';
    paint();
    const res = await Promise.all(
      bs.map(async (b) => {
        try {
          const r = await fetch(`${b.url}/pad-remote/${encodeURIComponent(info.studioId)}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(4000),
          });
          return `${b.id === 'net' ? 'Internet' : b.label}: ${r.ok ? 'OK' : 'HTTP ' + r.status}`;
        } catch {
          return `${b.id === 'net' ? 'Internet' : b.label}: não respondeu`;
        }
      }),
    );
    diag = res.join(' · ');
    paint();
  }

  async function useTunnel() {
    if (tunnelBusy) return;
    if (info.tunnel?.url) {
      net = 'net';
      paint();
      return;
    }
    tunnelBusy = true;
    diag = 'Criando link público temporário…';
    paint();
    try {
      let t = await api('/tunnel/start', { method: 'POST' });
      for (let i = 0; i < 20 && !t?.url; i++) {
        await new Promise((r) => setTimeout(r, 800));
        t = await api('/tunnel');
      }
      if (t?.url) {
        info.tunnel = { url: t.url, running: true };
        net = 'net';
        diag = 'Link público pronto! Use se o celular não alcançar o Wi-Fi local.';
      } else {
        diag = 'O túnel não ficou pronto. Verifique sua internet ou use o Wi-Fi local.';
      }
    } catch (e) {
      diag = 'Falha ao criar túnel: ' + (e.message || e);
    } finally {
      tunnelBusy = false;
      paint();
    }
  }

  function paint() {
    const bs = bases();
    const url = linkUrl();
    box.innerHTML = `
      <div class="rc-head">
        <span class="rc-head-ico" aria-hidden="true">🎛️</span>
        <div class="rc-head-txt">
          <b>Controle do Pad no Celular</b>
          <span class="rc-sub">Estúdio: <b>${esc(info.studioName)}</b> · Dispare efeitos, ajuste volume (%) e veja o timer ao vivo.</span>
        </div>
      </div>
      <div class="rc-grid">
        <div class="rc-qr-col">
          <div class="rc-qr-card">
            <div class="rc-qr">${qrSvg(url)}</div>
            <span class="rc-qr-cap">Aponte a câmera do celular</span>
          </div>
        </div>
        <div class="rc-side">
          <label class="rc-field">
            <span class="rc-label">Rede</span>
            ${bs.length > 1
              ? `<select class="input sm" data-pqr="net">${bs.map((b) => `<option value="${esc(b.id)}" ${b.id === net ? 'selected' : ''}>${esc(b.label)}</option>`).join('')}</select>`
              : `<span class="rc-net-pill">${esc(bs[0].label)}</span>`}
          </label>
          <div class="rc-link">
            <span class="rc-label">Link do Pad no celular</span>
            <code class="rc-url" title="${esc(url)}">${esc(url)}</code>
          </div>
          <div class="rc-actions">
            <button type="button" class="btn sm primary" data-pqr="copy">Copiar link</button>
            <button type="button" class="btn sm" data-pqr="open" title="Abrir a interface mobile neste computador (teste)">Abrir no PC</button>
            <button type="button" class="btn sm ghost" data-pqr="test">Testar rede</button>
            <button type="button" class="btn sm ghost" data-pqr="tunnel" ${tunnelBusy ? 'disabled' : ''}>${info.tunnel?.url ? 'Usar Internet' : 'Link Internet'}</button>
          </div>
          ${diag ? `<div class="rc-diag">${esc(diag)}</div>` : ''}
          <p class="rc-help">Confirme que o celular está no mesmo Wi-Fi deste computador e com dados móveis desligados.</p>
        </div>
      </div>`;

    box.querySelector('[data-pqr="net"]')?.addEventListener('change', (e) => {
      net = e.target.value;
      paint();
    });
    box.querySelector('[data-pqr="copy"]')?.addEventListener('click', () => copyText(url));
    box.querySelector('[data-pqr="open"]')?.addEventListener('click', () => {
      const localUrl = url.replace(/^https?:\/\/[^/]+/, location.origin);
      const w = window.open(localUrl, 'CastDeckPadRemoteTest', 'width=420,height=840,menubar=no,toolbar=no,location=no,resizable=yes');
      if (!w) toast('Pop-up bloqueado ao abrir janela de teste.', 'info');
    });
    box.querySelector('[data-pqr="test"]')?.addEventListener('click', testLinks);
    box.querySelector('[data-pqr="tunnel"]')?.addEventListener('click', useTunnel);
  }

  paint();
}

/**
 * Abre o QR Code do Pad usando o modal padrão do app (`ui.js`) ou no documento destacado (popout).
 */
export function openPadQrModal({ studioId = 'local', onInfo = null, doc = document } = {}) {
  if (doc && doc !== document && doc.body) {
    return new Promise((resolve) => {
      const back = doc.createElement('div');
      back.className = 'modal-back';
      back.innerHTML = '<div class="modal card" role="dialog" aria-modal="true" aria-label="Pad no Celular (QR Code)"><button type="button" class="modal-x" aria-label="Fechar">✕</button><div class="rc-modal pad-qr-modal dp-remote" data-pad-qr="1"></div></div>';
      const card = back.firstElementChild;
      const close = () => {
        back.remove();
        doc.removeEventListener('keydown', onKey);
        if (!doc.querySelector('.modal-back')) doc.body.classList.remove('modal-open');
        resolve(null);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close();
      };
      doc.addEventListener('keydown', onKey);
      doc.body.classList.add('modal-open');
      back.addEventListener('mousedown', (e) => e.target === back && close());
      card.querySelector('.modal-x')?.addEventListener('click', close);
      doc.body.appendChild(back);
      mountPadQrView(card.querySelector('.rc-modal'), { studioId, onInfo, onClose: close });
    });
  }
  return modal('<div class="rc-modal pad-qr-modal dp-remote" data-pad-qr="1"></div>', {
    onMount: (card) => {
      const target = card.querySelector('.rc-modal');
      mountPadQrView(target, { studioId, onInfo });
    },
  });
}
