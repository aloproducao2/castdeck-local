// Plugin oficial: Luz do convidado (tier "code", roda em processo separado com a API do CastDeck).
// Liga/desliga uma tomada inteligente quando alguém entra/sai do palco, aceita !luz no chat e mostra o estado
// na tela. Tudo passa pela API do CastDeck (rede só nos endereços declarados no manifesto).
export default function activate(castdeck) {
  let aceso = false;
  let ultimoAviso = 0;

  const chamar = async (url) => {
    const { token } = castdeck.settings.get();
    const cabecalhos = token ? { authorization: `Bearer ${token}` } : {};
    const r = await castdeck.http.post(url, {}, { headers: cabecalhos });
    if (!r || r.ok === false) return { ok: false, status: r?.result?.status };
    return { ok: true, status: r.result?.status };
  };

  const avisar = async (titulo, texto) => {
    const { aviso, segundos } = castdeck.settings.get();
    if (aviso === false) return;
    const agora = Date.now();
    if (agora - ultimoAviso < 2000) return;
    ultimoAviso = agora;
    try {
      await castdeck.overlay.show({ titulo, texto, cor: aceso ? '#3ddc97' : '#ffb020' }, Number(segundos) || 6);
    } catch {}
  };

  const ligar = async (quem) => {
    const { urlLigar } = castdeck.settings.get();
    if (!urlLigar) {
      castdeck.log('sem urlLigar configurada — abra Configurar e informe o endereço da luz');
      return false;
    }
    const r = await chamar(urlLigar);
    aceso = true;
    castdeck.log(`luz ligada para ${quem || 'convidado'} (${r.status ?? 'sem resposta'})`);
    await avisar('Luz', `${quem || 'Alguém'} entrou — luz acesa`);
    return true;
  };

  const desligar = async (quem) => {
    const { urlDesligar } = castdeck.settings.get();
    if (!urlDesligar) return false;
    const r = await chamar(urlDesligar);
    aceso = false;
    castdeck.log(`luz apagada (${quem || 'saída'}) (${r.status ?? 'sem resposta'})`);
    return true;
  };

  const alternar = async (quem) => {
    if (aceso) {
      const ok = await desligar(quem);
      if (ok) await avisar('Luz', 'Luz apagada');
      return;
    }
    await ligar(quem);
  };

  // Eventos do palco
  castdeck.events.on('stage', async (e) => {
    try {
      if (!e) return;
      if (e.acao === 'entrou') await ligar(e.fonteNome || e.fonte);
      else if (e.acao === 'saiu' && aceso) await desligar(e.fonteNome || e.fonte);
    } catch (err) {
      castdeck.log(`erro no evento de palco: ${err.message}`);
    }
  });

  // Comando !luz no chat (liga/desliga na mão)
  castdeck.events.on('chat', async (m) => {
    try {
      if (!/^!luz\b/i.test(String(m?.texto || ''))) return;
      await alternar(m.usuario || 'chat');
    } catch (err) {
      castdeck.log(`erro no comando !luz: ${err.message}`);
    }
  });

  castdeck.log('luz pronta (palco e comando !luz)');
}
