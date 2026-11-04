// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Ajuda de áudio/eco compartilhada pelo lobby (host/convidado) e pelo painel de áudio.
// É só orientação: não altera microfone, AEC, mixer nem preferências.
import { modal } from './ui.js';

export function openEchoHelp() {
  return modal(
    `<h3>Como evitar eco</h3>
     <p class="sub">Eco acontece quando o áudio que sai pela caixa de som volta pelo microfone. O app tenta ajudar, mas a acústica e o navegador mandam mais que qualquer botão.</p>

     <div class="echo-help-grid">
       <div class="echo-help-card echo-help-best">
         <b>1. Fone de ouvido (melhor)</b>
         <p>O fone impede o som de chegar ao microfone. É a solução mais confiável para host e convidados.</p>
       </div>
       <div class="echo-help-card">
         <b>2. Se estiver usando caixa</b>
         <p>Ative <b>“Estou usando caixa de som”</b> no painel de áudio, abaixe o volume e afaste o microfone da caixa. Evite ligar <b>“Ouvir programa”</b>.</p>
       </div>
       <div class="echo-help-card">
         <b>3. AEC não é garantia</b>
         <p>O cancelamento de eco do navegador pode reduzir o problema, mas falha com volume alto, Bluetooth, atraso ou double-talk. O modo caixa força AEC, mas não promete silêncio absoluto.</p>
       </div>
       <div class="echo-help-card">
         <b>4. Teste com o convidado</b>
         <p>Use <b>Testar alto-falante</b> e peça ao convidado para confirmar se ouve a própria voz atrasada. Se ouvir, o eco pode estar no host ou no convidado.</p>
       </div>
     </div>

     <div class="echo-help-note">
       <b>Mix-minus não é AEC:</b> o convidado não ouve a própria voz no retorno do CastDeck. Isso evita uma parte do eco,
       mas não impede o microfone do host de captar a caixa de som.
     </div>

     <div class="echo-help-note">
       <b>Áudio puro / música:</b> desliga AEC/NS/AGC. Com caixa de som, isso pode piorar o eco; use fone.
     </div>

     <p class="hint">Se o eco continuar, o caminho mais seguro é fone com cabo/USB. O modo caixa e o AEC são ajuda, não substituto de uma boa acústica.</p>
     <div class="modal-actions"><button class="btn primary" data-close>Entendi</button></div>`,
    { onMount: (m, close) => m.querySelector('[data-close]')?.addEventListener('click', close) },
  );
}
