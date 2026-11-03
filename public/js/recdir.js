// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Trocar a pasta das gravações (usado na tela inicial e no estúdio).
// Abre o seletor nativo do sistema; se não houver, pede o caminho digitado.
import { api, modal, toast, esc, $ } from './ui.js';

async function save(dir) {
  const s = await api('/settings', { method: 'PUT', body: { recordingsDir: dir } });
  return s.recordingsDir || '';
}

// retorna a nova pasta (string) ou null se cancelado
export async function chooseRecordingsDir(current) {
  let picked = null;
  try {
    const r = await api('/pick-folder', { method: 'POST', body: { start: current, title: 'Escolha a pasta das gravações' } });
    if (!r.dir) return null; // cancelou a janela
    picked = r.dir;
  } catch {
    // sem seletor nativo: digitar o caminho
    picked = await modal(
      `<h3>Pasta das gravações</h3><p class="sub">Digite o caminho completo da pasta. Ela será criada se não existir.</p>
       <label class="field"><span>Pasta</span><input class="input" id="rd-in" value="${esc(current || '')}" placeholder="Ex.: D:\\Gravações ou /home/voce/Vídeos/CastDeck"></label>
       <div class="modal-actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="rd-ok">Usar esta pasta</button></div>`,
      {
        onMount(m, close) {
          const i = $('#rd-in', m);
          i.focus();
          i.onkeydown = (e) => {
            if (e.key === 'Enter' && i.value.trim()) {
              e.preventDefault();
              close(i.value.trim());
            }
          };
        },
      },
    );
    if (!picked) return null;
  }
  try {
    const dir = await save(picked);
    toast('Gravações serão salvas em: ' + dir, 'ok');
    return dir;
  } catch (e) {
    toast(e.message, 'err');
    return null;
  }
}

export async function resetRecordingsDir() {
  await save('');
  toast('Pasta das gravações voltou para a padrão', 'ok');
}
