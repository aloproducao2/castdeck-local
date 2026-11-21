// Plugin oficial: Cronômetro no ar (tier "code" — roda em processo separado com a API do CastDeck).
// Contagem regressiva desenhada no vídeo (persistente, atualizada a cada segundo) para intervalo/BRB,
// com atalhos no chat (!timer 5, !timer pausar, !tempo) e controle pelo painel do plugin.
//
// O estado fica em settings ("estado") para o painel conseguir mostrar o tempo andando sem canal extra:
// o painel lê settings.get a cada segundo. Isso sobrevive a reinício do plugin e não escreve no disco a
// cada segundo (só a cada 5s, e a cada mudança de estado).
export default function activate(castdeck) {
  const padrao = castdeck.settings.get();
  let total = Math.max(0, Number(padrao.estado?.total) || 0); // segundos
  let restante = Math.max(0, Number(padrao.estado?.restante) || 0);
  let rodando = !!padrao.estado?.rodando;
  let relogio = null;
  let ultimoSalvo = 0;

  const mmss = (s) => {
    const t = Math.max(0, Math.round(Number(s) || 0));
    const m = Math.floor(t / 60);
    const r = t % 60;
    return m + ':' + String(r).padStart(2, '0');
  };

  const titulo = () => String(castdeck.settings.get().titulo || 'Voltamos em').slice(0, 60);
  const cor = () => {
    const c = String(castdeck.settings.get().cor || '#7c5cff');
    return /^#[0-9a-f]{3,8}$/i.test(c) ? c : '#7c5cff';
  };

  const desenhar = async (texto) => {
    try {
      await castdeck.overlay.show({ titulo: titulo(), texto: texto || mmss(restante), cor: cor(), persistente: true }, 0);
    } catch (e) {
      castdeck.log('falha ao desenhar o cronômetro: ' + e.message);
    }
  };

  const salvarEstado = (forcar = false) => {
    const agora = Date.now();
    if (!forcar && agora - ultimoSalvo < 5000) return;
    ultimoSalvo = agora;
    castdeck.settings
      .save({ estado: { total, restante, rodando, atualizadoEm: agora } })
      .catch((e) => castdeck.log('falha ao salvar estado: ' + e.message));
  };

  const pararRelogio = () => {
    if (relogio) clearInterval(relogio);
    relogio = null;
    rodando = false;
  };

  const finalizar = async () => {
    pararRelogio();
    salvarEstado(true);
    const t = String(castdeck.settings.get().textoFim || 'Voltamos!').slice(0, 80);
    try {
      await castdeck.overlay.show({ titulo: t, texto: '', cor: '#3ddc97', persistente: false }, 8);
    } catch {}
    if (castdeck.settings.get().avisarChat !== false) {
      try {
        await castdeck.chat.send('⏱️ Tempo encerrado: ' + t);
      } catch {}
    }
    castdeck.log('cronômetro encerrado');
  };

  const tique = () => {
    if (!rodando) return;
    restante = Math.max(0, restante - 1);
    desenhar(mmss(restante));
    salvarEstado();
    if (restante <= 0) finalizar();
  };

  const iniciar = async (minutos) => {
    const m = Math.max(0.25, Math.min(180, Number(minutos) || 0));
    total = Math.round(m * 60);
    restante = total;
    pararRelogio();
    rodando = true;
    salvarEstado(true);
    await desenhar(mmss(restante));
    relogio = setInterval(tique, 1000);
    castdeck.log('cronômetro iniciado: ' + mmss(restante));
    return { ok: true, total, restante, rodando };
  };

  const pausar = async () => {
    if (!rodando) return { ok: false, erro: 'não está rodando' };
    pararRelogio();
    salvarEstado(true);
    await desenhar(mmss(restante) + '  ⏸');
    castdeck.log('cronômetro pausado em ' + mmss(restante));
    return { ok: true, restante, rodando };
  };

  const continuar = async () => {
    if (rodando || restante <= 0) return { ok: false, erro: restante <= 0 ? 'defina um tempo primeiro' : 'já está rodando' };
    rodando = true;
    salvarEstado(true);
    relogio = setInterval(tique, 1000);
    await desenhar();
    castdeck.log('cronômetro retomado em ' + mmss(restante));
    return { ok: true, restante, rodando };
  };

  const parar = async (limpar = true) => {
    pararRelogio();
    salvarEstado(true);
    if (limpar !== false) {
      try {
        await castdeck.overlay.hide();
      } catch {}
    }
    castdeck.log('cronômetro parado');
    return { ok: true, restante, rodando };
  };

  // "5" → 5 minutos; "1:30" → 1 min 30 s; "90s" → 90 segundos
  const interpretarTempo = (bruto) => {
    const s = String(bruto || '').trim().toLowerCase();
    if (!s) return 0;
    const m = s.match(/^(\d+):(\d{1,2})$/);
    if (m) return Number(m[1]) + Number(m[2]) / 60;
    const seg = s.match(/^(\d+(?:\.\d+)?)s$/);
    if (seg) return Number(seg[1]) / 60;
    const min = s.match(/^(\d+(?:\.\d+)?)$/);
    return min ? Number(min[1]) : 0;
  };

  // ---------- chat ----------
  castdeck.events.on('chat', async (msg) => {
    const texto = String(msg?.texto || '').trim();
    const m = texto.match(/^!(?:timer|cronometro|cronômetro|tempo)\b\s*(.*)$/i);
    if (!m) return;
    const args = m[1].trim().toLowerCase();
    try {
      if (!args) {
        // sem argumento: mostra o tempo restante (e responde pra quem perguntou)
        const resposta = restante > 0 ? 'Faltam ' + mmss(restante) : 'Nenhum cronômetro ativo.';
        await castdeck.chat.send(resposta);
        if (restante > 0) await desenhar();
        return;
      }
      if (/^(pausar|pause|pausa)$/.test(args)) {
        await pausar();
        return;
      }
      if (/^(continuar|retomar|voltar|play)$/.test(args)) {
        await continuar();
        return;
      }
      if (/^(parar|stop|encerrar|zerar)$/.test(args)) {
        await parar();
        await castdeck.chat.send('Cronômetro parado.');
        return;
      }
      const minutos = interpretarTempo(args);
      if (!minutos) {
        await castdeck.chat.send('Use: !timer 5 (minutos) ou !timer 1:30');
        return;
      }
      await iniciar(minutos);
      await castdeck.chat.send('⏱️ Cronômetro de ' + mmss(Math.round(minutos * 60)) + ' começou!');
    } catch (e) {
      castdeck.log('erro no comando do chat: ' + e.message);
    }
  });

  // ---------- painel ----------
  castdeck.events.on('panel', async ({ nome, dados } = {}) => {
    try {
      switch (String(nome || '')) {
        case 'iniciar':
          await iniciar(dados?.minutos);
          break;
        case 'pausar':
          await pausar();
          break;
        case 'continuar':
          await continuar();
          break;
        case 'parar':
          await parar(true);
          break;
        case 'estado':
        default:
          await desenhar();
          break;
      }
    } catch (e) {
      castdeck.log('erro no painel (' + nome + '): ' + e.message);
    }
  });

  // retoma a contagem se o plugin reiniciar no meio de um cronômetro rodando
  if (rodando && restante > 0) {
    desenhar();
    relogio = setInterval(tique, 1000);
    castdeck.log('cronômetro retomado após reinício: ' + mmss(restante));
  } else {
    rodando = false;
    salvarEstado(true);
  }

  castdeck.log('cronômetro pronto (painel + !timer no chat)');
}
