// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Seção "Aceleração de vídeo" nos Ajustes: mostra o SoC, o encoder em uso e instala/remova o FFmpeg
// específico da placa (Rockchip MPP). Tudo local, sem depender de pacote do sistema.
import { $, esc, toast } from '../ui.js';

const fmtMb = (b) => `${Math.round((Number(b) || 0) / 1048576)} MB`;

function encodersTexto(lista) {
  const hw = (lista || []).filter((e) => e.hw);
  if (!hw.length) return 'nenhum encoder de hardware disponível';
  return hw.map((e) => e.label || e.id).join(', ');
}

async function buscar() {
  const r = await fetch('/api/hw', { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function desenhar(box, info) {
  const soc = info.soc || {};
  const ff = info.ffmpeg || {};
  const rk = info.rockchip || {};
  const est = rk.estado || {};
  const driverOk = soc.family === 'rockchip' ? !!soc.drivers?.mpp : true;
  const linhas = [];

  linhas.push(`<div class="st-hw-row"><strong>${esc(soc.label || soc.name || 'Processador')}</strong>
    <span class="hint">${esc([soc.arch, soc.platform].filter(Boolean).join(' · '))}</span></div>`);

  if (soc.family === 'rockchip') {
    linhas.push(`<div class="st-hw-row"><span>Driver de hardware (MPP)</span><span class="${driverOk ? 'ok' : 'warn'}">${driverOk ? 'presente' : 'ausente'}</span></div>`);
    linhas.push(`<div class="st-hw-row"><span>Escala acelerada (RGA)</span><span class="${soc.drivers?.rga ? 'ok' : 'warn'}">${soc.drivers?.rga ? 'presente' : 'ausente'}</span></div>`);
  }

  linhas.push(`<div class="st-hw-row"><span>FFmpeg em uso</span><code class="hint">${esc(ff.version || '—')} · ${esc((ff.path || '').split(/[\\/]/).pop() || '—')}</code></div>`);
  linhas.push(`<div class="st-hw-row"><span>Encoder escolhido</span><strong>${esc(ff.escolhido || 'libx264')}</strong></div>`);
  linhas.push(`<div class="st-hw-row"><span>Disponíveis</span><span class="hint">${esc(encodersTexto(ff.encoders))}</span></div>`);
  if (ff.cacheHit) linhas.push('<div class="hint" style="margin-top:2px">Sondagem veio do cache (boot rápido).</div>');

  if (soc.note) linhas.push(`<p class="hint st-hw-note">${esc(soc.note)}</p>`);

  if (rk.suportado) {
    if (rk.instalado) {
      linhas.push(`<div class="st-hw-row"><span>Aceleração Rockchip</span><span class="ok">instalada${rk.encoderDisponivel ? ' · h264_rkmpp ativo' : ''}</span></div>`);
      linhas.push(`<div class="st-hw-acts"><button class="btn sm ghost" id="st-hw-remove">Remover aceleração</button></div>`);
    } else {
      linhas.push(`<div class="st-hw-acts"><button class="btn sm primary" id="st-hw-install">Instalar aceleração Rockchip (${fmtMb(rk.pacote?.bytes)})</button></div>`);
      linhas.push(`<p class="hint st-hw-note">Baixa o FFmpeg com ${esc(rk.pacote?.nome || 'MPP')} do nosso servidor, confere o SHA-256 e passa a usar <strong>h264_rkmpp</strong> nesta máquina. Licença ${esc(rk.pacote?.licence || 'GPL')}.</p>`);
    }
  } else if (soc.family === 'rockchip') {
    linhas.push('<p class="hint st-hw-note">A aceleração Rockchip só pode ser instalada em Linux ARM64.</p>');
  }

  if (est.instalando) {
    linhas.push(`<div class="st-hw-prog"><i style="width:${Math.max(2, Math.min(100, est.progresso || 0))}%"></i></div>
      <div class="hint">Baixando e verificando… ${Math.round(est.progresso || 0)}%</div>`);
  } else if (est.erro) {
    linhas.push(`<p class="hint st-hw-note err">${esc(est.erro)}</p>`);
  }

  box.innerHTML = linhas.join('');
  box.dataset.estado = `${rk.instalado ? 'instalado' : 'ausente'}:${ff.escolhido || ''}:${JSON.stringify(est)}`;
  return box;
}

export function mountHardwareSection(root) {
  const box = $('#st-hw', root);
  if (!box) return;

  const carregar = async (depois) => {
    try {
      const info = await buscar();
      desenhar(box, info);
      depois?.(info);
    } catch (e) {
      box.innerHTML = `<p class="hint">Não foi possível ler a aceleração de vídeo: ${esc(e.message)}</p>`;
    }
  };

  carregar((info) => {
    const inst = $('#st-hw-install', box);
    if (inst) {
      inst.onclick = async () => {
        inst.disabled = true;
        inst.textContent = 'Baixando…';
        try {
          const r = await fetch('/api/hw/rockchip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
          toast('Aceleração Rockchip instalada — o encoder h264_rkmpp será usado na próxima transmissão.', 'ok');
        } catch (e) {
          toast('Falha ao instalar a aceleração: ' + e.message, 'err');
        }
        await carregar();
      };
    }
    const rem = $('#st-hw-remove', box);
    if (rem) {
      rem.onclick = async () => {
        rem.disabled = true;
        try {
          const r = await fetch('/api/hw/rockchip', { method: 'DELETE' });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          toast('Aceleração Rockchip removida — voltando para o encoder genérico.', 'ok');
        } catch (e) {
          toast('Não foi possível remover: ' + e.message, 'err');
        }
        await carregar();
      };
    }
    // acompanha o progresso do download enquanto a instalação estiver em andamento
    if (info?.rockchip?.estado?.instalando) {
      const t = setInterval(async () => {
        if (!document.body.contains(box)) return clearInterval(t);
        try {
          const i = await buscar();
          desenhar(box, i);
          if (!i.rockchip?.estado?.instalando) {
            clearInterval(t);
            carregar();
          }
        } catch {
          clearInterval(t);
        }
      }, 1200);
    }
  });
}
