// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Traduções do CastDeck Intercom: PT, EN e ES.
// Formato: chave: [português, inglês, espanhol].

const text = {
  'nav.home': ['CastDeck', 'CastDeck', 'CastDeck'],
  'nav.resources': ['Recursos', 'Features', 'Recursos'],
  'nav.download': ['Baixar', 'Download', 'Descargar'],
  'nav.help': ['Ajuda', 'Help', 'Ayuda'],
  'nav.intercom': ['Intercom', 'Intercom', 'Intercom'],
  'common.audioProduction': ['Áudio de produção', 'Production audio', 'Audio de producción'],
  'common.installApp': ['Instalar app', 'Install app', 'Instalar app'],
  'common.language': ['Idioma', 'Language', 'Idioma'],
  'common.copy': ['Copiar', 'Copy', 'Copiar'],
  'common.close': ['Fechar', 'Close', 'Cerrar'],
  'common.cancel': ['Cancelar', 'Cancel', 'Cancelar'],
  'common.loading': ['Carregando…', 'Loading…', 'Cargando…'],
  'common.people': ['pessoas', 'people', 'personas'],
  'common.permanentRoom': ['Sala permanente', 'Permanent room', 'Sala permanente'],
  'common.director': ['Diretor', 'Director', 'Director'],
  'common.guest': ['Convidado', 'Guest', 'Invitado'],
  'common.mediaProduction': ['Sala de produção', 'Production room', 'Sala de producción'],
  'common.mediaAudio': ['Áudio de intercom', 'Intercom audio', 'Audio de intercom'],

  'create.title': ['CastDeck Intercom — salas de produção', 'CastDeck Intercom — production rooms', 'CastDeck Intercom — salas de producción'],
  'create.eyebrow': ['Intercom de produção', 'Production intercom', 'Intercom de producción'],
  'create.heroA': ['Fale com a equipe.', 'Talk to your team.', 'Habla con tu equipo.'],
  'create.heroB': ['Sem instalar nada.', 'Nothing to install.', 'Sin instalar nada.'],
  'create.lead': ['Crie uma sala, envie o link e conecte cinegrafistas e reportagem. PTT, microfone travado e retorno pessoal. Sem login, sem vídeo, sem gravação.', 'Create a room, share the link and connect camera operators and reporters. PTT, locked mic and personal return. No login, no video, no recording.', 'Crea una sala, comparte el enlace y conecta operadores de cámara y reporteros. PTT, micrófono bloqueado y retorno personal. Sin cuenta, sin vídeo, sin grabación.'],
  'create.nameLabel': ['Nome da sala', 'Room name', 'Nombre de la sala'],
  'create.optional': ['(opcional)', '(optional)', '(opcional)'],
  'create.namePlaceholder': ['Ex.: Reportagem — Encontro', 'E.g.: News — Live shot', 'Ej.: Reportaje — En vivo'],
  'create.nameHint': ['Se deixar em branco, geramos um nome automático.', 'Leave it blank and we generate a name.', 'Si lo dejas vacío, generamos un nombre automático.'],
  'create.addressLabel': ['Endereço da sala', 'Room address', 'Dirección de la sala'],
  'create.addressPlaceholder': ['reportagem', 'newsroom', 'reportaje'],
  'create.addressHelp': ['4–24 caracteres: a-z, 0-9 e hífen. Em branco, geramos um código.', '4–24 characters: a-z, 0-9 and hyphen. Blank generates a code.', '4–24 caracteres: a-z, 0-9 y guion. Vacío genera un código.'],
  'create.totalLabel': ['Quantas pessoas no total?', 'How many people in total?', '¿Cuántas personas en total?'],
  'create.people4': ['4 pessoas', '4 people', '4 personas'],
  'create.people8': ['8 pessoas', '8 people', '8 personas'],
  'create.people12': ['12 pessoas', '12 people', '12 personas'],
  'create.people15': ['15 pessoas', '15 people', '15 personas'],
  'create.peopleOption': ['{n} pessoas', '{n} people', '{n} personas'],
  'create.directorIncluded': ['Inclui o diretor. Só áudio.', 'Includes the director. Audio only.', 'Incluye al director. Solo audio.'],
  'create.passwordLabel': ['Senha da sala', 'Room password', 'Contraseña de la sala'],
  'create.passwordPlaceholder': ['Deixe em branco para não usar senha', 'Leave blank for no password', 'Déjalo vacío para no usar contraseña'],
  'create.passwordHint': ['A senha não vai no link; o convidado digita na entrada.', 'The password is not in the link; guests type it when joining.', 'La contraseña no va en el enlace; el invitado la escribe al entrar.'],
  'create.submit': ['Criar sala grátis', 'Create free room', 'Crear sala gratis'],
  'create.submitting': ['Criando…', 'Creating…', 'Creando…'],
  'create.twoLinks': ['Você recebe dois links: um para o diretor e outro para a equipe.', 'You get two links: one for the director and one for the team.', 'Recibes dos enlaces: uno para el director y otro para el equipo.'],
  'create.noAccount': ['Sem conta · sem cartão · sala permanente · use fone', 'No account · no card · permanent room · use headphones', 'Sin cuenta · sin tarjeta · sala permanente · usa auriculares'],
  'create.teamLink': ['Link da equipe', 'Team link', 'Enlace del equipo'],
  'create.hostLink': ['Link do host', 'Host link', 'Enlace del director'],
  'create.openDirector': ['Entrar como diretor', 'Enter as director', 'Entrar como director'],
  'create.testGuest': ['Testar convidado', 'Test as guest', 'Probar como invitado'],
  'create.hostPrivate': ['O link do host é privado. Envie apenas o link da equipe para cinegrafistas e repórteres.', 'The host link is private. Send only the team link to camera operators and reporters.', 'El enlace del director es privado. Envía solo el enlace del equipo a cámaras y reporteros.'],
  'create.permanentNote': ['Sala permanente: os mesmos links podem ser usados de novo. Nenhum áudio é gravado.', 'Permanent room: the same links can be used again. Nothing is recorded.', 'Sala permanente: los mismos enlaces se pueden usar de nuevo. No se graba audio.'],
  'create.another': ['Criar outra sala', 'Create another room', 'Crear otra sala'],
  'create.recentTitle': ['Suas salas', 'Your rooms', 'Tus salas'],
  'create.recentHint': ['Salas criadas neste navegador. O link do host fica salvo apenas aqui; limpar os dados do site remove a lista.', 'Rooms created in this browser. The host link is stored only here; clearing site data removes the list.', 'Salas creadas en este navegador. El enlace del director se guarda solo aquí; borrar los datos del sitio elimina la lista.'],
  'create.openDirectorShort': ['Abrir diretor', 'Open director', 'Abrir director'],
  'create.copyTeam': ['Copiar equipe', 'Copy team link', 'Copiar equipo'],
  'create.forget': ['Remover desta lista', 'Remove from this list', 'Quitar de esta lista'],
  'create.resultRoom': ['Sala', 'Room', 'Sala'],

  'host.title': ['Diretor — CastDeck Intercom', 'Director — CastDeck Intercom', 'Director — CastDeck Intercom'],
  'host.endSession': ['Encerrar sessão', 'End session', 'Terminar sesión'],
  'host.endTitle': ['Encerrar somente esta sessão; os links continuam válidos', 'End only this session; the links stay valid', 'Terminar solo esta sesión; los enlaces siguen válidos'],
  'host.panel': ['Painel do diretor', 'Director panel', 'Panel del director'],
  'host.startEyebrow': ['Intercom de produção', 'Production intercom', 'Intercom de producción'],
  'host.startTitleA': ['Abra a sala', 'Open the room', 'Abre la sala'],
  'host.startTitleB': ['em três passos.', 'in three steps.', 'en tres pasos.'],
  'host.step1': ['Ative o microfone', 'Turn on the microphone', 'Activa el micrófono'],
  'host.step2': ['Copie o link da equipe', 'Copy the team link', 'Copia el enlace del equipo'],
  'host.step3': ['Segure para falar', 'Hold to talk', 'Mantén para hablar'],
  'host.startLead': ['Use fone. O navegador vai pedir permissão de microfone. Você só é ouvido quando segurar o botão de falar.', 'Use headphones. The browser will ask for microphone permission. You are heard only while holding the talk button.', 'Usa auriculares. El navegador pedirá permiso de micrófono. Solo te oyen mientras mantienes el botón de hablar.'],
  'host.startButton': ['Ativar microfone e abrir a sala', 'Turn on microphone and open room', 'Activar micrófono y abrir la sala'],
  'host.startingMic': ['Abrindo microfone…', 'Opening microphone…', 'Abriendo micrófono…'],
  'host.startHint': ['O link do host é privado. O link da equipe aparece depois de entrar.', 'The host link is private. The team link appears after you enter.', 'El enlace del director es privado. El enlace del equipo aparece después de entrar.'],
  'host.chooseAudio': ['Escolher microfone e saída de áudio', 'Choose microphone and audio output', 'Elegir micrófono y salida de audio'],
  'host.myMic': ['Seu microfone', 'Your microphone', 'Tu micrófono'],
  'host.micClosed': ['fechado', 'closed', 'cerrado'],
  'host.micOpen': ['aberto', 'open', 'abierto'],
  'host.pttIdle': ['SEGURE PARA FALAR', 'HOLD TO TALK', 'MANTÉN PARA HABLAR'],
  'host.pttSub': ['fale com todos na sala', 'talk to everyone in the room', 'habla con todos en la sala'],
  'host.pttTalking': ['FALANDO', 'TALKING', 'HABLANDO'],
  'host.pttRelease': ['solte para fechar', 'release to close', 'suelta para cerrar'],
  'host.pttLatched': ['CLIQUE PARA FALAR', 'CLICK TO TALK', 'HAZ CLIC PARA HABLAR'],
  'host.pttLatchedSub': ['microfone aberto', 'microphone open', 'micrófono abierto'],
  'host.latchOff': ['Manter microfone aberto', 'Keep microphone open', 'Mantener micrófono abierto'],
  'host.latchOn': ['MICROFONE ABERTO', 'MICROPHONE OPEN', 'MICRÓFONO ABIERTO'],
  'host.testTone': ['Testar fone', 'Test headphones', 'Probar auriculares'],
  'host.statusClosed': ['Microfone fechado', 'Microphone closed', 'Micrófono cerrado'],
  'host.statusOpen': ['Microfone aberto', 'Microphone open', 'Micrófono abierto'],
  'host.onlyYou': ['Só você na sala', 'Only you in the room', 'Solo tú en la sala'],
  'host.countOne': ['1 pessoa na sala', '1 person in the room', '1 persona en la sala'],
  'host.countMany': ['{n} pessoas na sala', '{n} people in the room', '{n} personas en la sala'],
  'host.peopleTitle': ['Pessoas na sala', 'People in the room', 'Personas en la sala'],
  'host.waitingPeople': ['Aguardando a equipe entrar pelo link.', 'Waiting for the team to join through the link.', 'Esperando que el equipo entre por el enlace.'],
  'host.shareTitle': ['Convide a equipe', 'Invite the team', 'Invita al equipo'],
  'host.shareHint': ['Copie o link e envie para cinegrafistas e repórteres. Eles não precisam criar conta.', 'Copy the link and send it to camera operators and reporters. They do not need an account.', 'Copia el enlace y envíalo a cámaras y reporteros. No necesitan crear cuenta.'],
  'host.copyTeam': ['Copiar link da equipe', 'Copy team link', 'Copiar enlace del equipo'],
  'host.qrShow': ['Mostrar QR Code', 'Show QR Code', 'Mostrar código QR'],
  'host.permanentShareHint': ['Sala permanente. Estes mesmos links continuam válidos nas próximas sessões.', 'Permanent room. These same links stay valid for future sessions.', 'Sala permanente. Estos mismos enlaces siguen válidos en las próximas sesiones.'],
  'host.details': ['Detalhes da sala', 'Room details', 'Detalles de la sala'],
  'host.securityHint': ['Sala permanente. O link do host é privado. Nada é gravado. Use fone para evitar eco.', 'Permanent room. The host link is private. Nothing is recorded. Use headphones to avoid echo.', 'Sala permanente. El enlace del director es privado. No se graba nada. Usa auriculares para evitar eco.'],
  'host.fatalTitle': ['Não foi possível abrir', 'Could not open', 'No se pudo abrir'],
  'host.fatalLink': ['Link inválido.', 'Invalid link.', 'Enlace inválido.'],
  'host.anotherRoom': ['Criar outra sala', 'Create another room', 'Crear otra sala'],
  'host.reopen': ['Abrir esta sala de novo', 'Open this room again', 'Abrir esta sala de nuevo'],
  'host.roomMeta': ['Até {n} pessoas · use fone', 'Up to {n} people · use headphones', 'Hasta {n} personas · usa auriculares'],
  'host.roomInfo': ['Sala {room} · permanente · criada em {date}.', 'Room {room} · permanent · created on {date}.', 'Sala {room} · permanente · creada el {date}.'],
  'host.rowMicOpen': ['microfone aberto', 'microphone open', 'micrófono abierto'],
  'host.rowMicClosed': ['microfone fechado', 'microphone closed', 'micrófono cerrado'],
  'host.rowTalking': ['você está falando', 'you are talking', 'estás hablando'],
  'host.talk': ['Falar', 'Talk', 'Hablar'],
  'host.talkTitle': ['Segure para falar com esta pessoa', 'Hold to talk to this person', 'Mantén para hablar con esta persona'],
  'host.mute': ['Mudo', 'Mute', 'Silenciar'],
  'host.remove': ['Remover', 'Remove', 'Quitar'],
  'host.confirmRemove': ['Remover {name} da sala?', 'Remove {name} from the room?', '¿Quitar a {name} de la sala?'],
  'host.confirmEnd': ['Encerrar a sessão ao vivo? Os links da sala continuam válidos e podem ser usados de novo.', 'End the live session? The room links stay valid and can be used again.', '¿Terminar la sesión en vivo? Los enlaces de la sala siguen válidos y se pueden usar de nuevo.'],
  'host.sessionEnded': ['Sessão encerrada. Os links da sala continuam válidos.', 'Session ended. The room links are still valid.', 'Sesión terminada. Los enlaces de la sala siguen válidos.'],
  'host.roomEnded': ['Sessão encerrada. A sala e os links continuam válidos.', 'Session ended. The room and links are still valid.', 'Sesión terminada. La sala y los enlaces siguen válidos.'],
  'host.hostOffline': ['host desconectado', 'host offline', 'director desconectado'],
  'host.reconnecting': ['reconectando…', 'reconnecting…', 'reconectando…'],
  'host.statusReady': ['pronta para abrir', 'ready to open', 'lista para abrir'],
  'host.statusAlready': ['sala já aberta', 'room already open', 'sala ya abierta'],
  'host.statusUnavailable': ['sala indisponível', 'room unavailable', 'sala no disponible'],
  'host.tryAgain': ['Tentar novamente', 'Try again', 'Intentar de nuevo'],
  'host.leaveError': ['O link não contém uma sala.', 'The link does not contain a room.', 'El enlace no contiene una sala.'],
  'host.noToken': ['Link do host incompleto. Abra pelo link gerado na criação da sala.', 'Incomplete host link. Open the link generated when the room was created.', 'Enlace del director incompleto. Abre el enlace generado al crear la sala.'],
  'host.roomNotFound': ['Sala não encontrada.', 'Room not found.', 'Sala no encontrada.'],
  'host.permDenied': ['Permissão de microfone negada. Libere o microfone no navegador e tente de novo.', 'Microphone permission denied. Allow the microphone in the browser and try again.', 'Permiso de micrófono denegado. Permite el micrófono en el navegador e inténtalo de nuevo.'],
  'host.connectionError': ['Erro na sala.', 'Room error.', 'Error en la sala.'],
  'host.noMic': ['Nenhum microfone disponível.', 'No microphone available.', 'No hay micrófono disponible.'],
  'host.micOpenError': ['Não foi possível abrir o microfone.', 'Could not open the microphone.', 'No se pudo abrir el micrófono.'],
  'host.alreadyOpen': ['Esta sala já está aberta em outro dispositivo. Feche a outra janela para assumir.', 'This room is already open on another device. Close the other window to take over.', 'Esta sala ya está abierta en otro dispositivo. Cierra la otra ventana para asumir.'],
  'host.storageNote': ['Sala permanente. O link do host é privado. Nada é gravado. Use fone para evitar eco.', 'Permanent room. The host link is private. Nothing is recorded. Use headphones to avoid echo.', 'Sala permanente. El enlace del director es privado. No se graba nada. Usa auriculares para evitar eco.'],

  'guest.title': ['Convidado — CastDeck Intercom', 'Guest — CastDeck Intercom', 'Invitado — CastDeck Intercom'],
  'guest.invited': ['Você foi convidado', 'You have been invited', 'Has sido invitado'],
  'guest.nameLabel': ['Seu nome', 'Your name', 'Tu nombre'],
  'guest.namePlaceholder': ['Ex.: Câmera 1 — João', 'E.g.: Camera 1 — John', 'Ej.: Cámara 1 — Juan'],
  'guest.passwordLabel': ['Senha da sala', 'Room password', 'Contraseña de la sala'],
  'guest.joinButton': ['Entrar e ouvir o diretor', 'Join and hear the director', 'Entrar y escuchar al director'],
  'guest.joining': ['Entrando…', 'Joining…', 'Entrando…'],
  'guest.joinHint': ['Use fone. O microfone começa fechado; o navegador vai pedir permissão.', 'Use headphones. The microphone starts closed; the browser will ask for permission.', 'Usa auriculares. El micrófono empieza cerrado; el navegador pedirá permiso.'],
  'guest.joinWaiting': ['Aguardando a sala.', 'Waiting for the room.', 'Esperando la sala.'],
  'guest.chooseAudio': ['Escolher microfone e saída de áudio', 'Choose microphone and audio output', 'Elegir micrófono y salida de audio'],
  'guest.intercom': ['Intercom', 'Intercom', 'Intercom'],
  'guest.yourMic': ['Seu microfone', 'Your microphone', 'Tu micrófono'],
  'guest.micClosed': ['fechado', 'closed', 'cerrado'],
  'guest.micOpen': ['aberto', 'open', 'abierto'],
  'guest.pttIdle': ['SEGURE PARA FALAR', 'HOLD TO TALK', 'MANTÉN PARA HABLAR'],
  'guest.pttSub': ['o diretor está ouvindo', 'the director is listening', 'el director está escuchando'],
  'guest.pttTalking': ['FALANDO', 'TALKING', 'HABLANDO'],
  'guest.pttRelease': ['solte para fechar', 'release to close', 'suelta para cerrar'],
  'guest.pttLatched': ['CLIQUE PARA FALAR', 'CLICK TO TALK', 'HAZ CLIC PARA HABLAR'],
  'guest.pttLatchedSub': ['microfone aberto', 'microphone open', 'micrófono abierto'],
  'guest.latchOff': ['Manter microfone aberto', 'Keep microphone open', 'Mantener micrófono abierto'],
  'guest.latchOn': ['MICROFONE ABERTO', 'MICROPHONE OPEN', 'MICRÓFONO ABIERTO'],
  'guest.listen': ['Ouvir diretor', 'Hear director', 'Escuchar director'],
  'guest.listening': ['Ouvindo diretor', 'Hearing director', 'Escuchando director'],
  'guest.listenSection': ['Escuta', 'Listening', 'Escucha'],
  'guest.listenHint': ['O diretor fala com você. Responda segurando o botão de falar. Use fone.', 'The director talks to you. Answer by holding the talk button. Use headphones.', 'El director habla contigo. Responde manteniendo el botón de hablar. Usa auriculares.'],
  'guest.audioSettings': ['Trocar microfone ou saída de áudio', 'Change microphone or audio output', 'Cambiar micrófono o salida de audio'],
  'guest.volume': ['Volume do diretor', 'Director volume', 'Volumen del director'],
  'guest.allGood': ['Tudo certo?', 'All set?', '¿Todo bien?'],
  'guest.tipHeadphones': ['Use fone.', 'Use headphones.', 'Usa auriculares.'],
  'guest.tipHold': ['Segure o botão para falar.', 'Hold the button to talk.', 'Mantén el botón para hablar.'],
  'guest.tipRelease': ['Solte para fechar o microfone.', 'Release to close the microphone.', 'Suelta para cerrar el micrófono.'],
  'guest.noRecording': ['Nada é gravado.', 'Nothing is recorded.', 'No se graba nada.'],
  'guest.details': ['Detalhes da sala', 'Room details', 'Detalles de la sala'],
  'guest.permanentInfo': ['Sala permanente. O diretor controla a sessão.', 'Permanent room. The director controls the session.', 'Sala permanente. El director controla la sesión.'],
  'guest.androidNote': ['Sala permanente. Se a tela apagar, o Android pode suspender o áudio.', 'Permanent room. If the screen turns off, Android may suspend the audio.', 'Sala permanente. Si la pantalla se apaga, Android puede suspender el audio.'],
  'guest.leave': ['Sair da sala', 'Leave room', 'Salir de la sala'],
  'guest.fatalTitle': ['Sala indisponível', 'Room unavailable', 'Sala no disponible'],
  'guest.fatalLink': ['O link pode ser inválido.', 'The link may be invalid.', 'El enlace puede no ser válido.'],
  'guest.createRoom': ['Criar uma sala', 'Create a room', 'Crear una sala'],
  'guest.waitingHost': ['Aguardando diretor', 'Waiting for director', 'Esperando al director'],
  'guest.connected': ['Conectado', 'Connected', 'Conectado'],
  'guest.connecting': ['Conectando…', 'Connecting…', 'Conectando…'],
  'guest.directorLeft': ['Diretor saiu', 'Director left', 'El director salió'],
  'guest.directorConnected': ['Diretor conectado', 'Director connected', 'Director conectado'],
  'guest.directorTalking': ['Diretor falando', 'Director talking', 'Director hablando'],
  'guest.directorListening': ['Diretor está ouvindo', 'Director is listening', 'El director está escuchando'],
  'guest.directorEntered': ['Diretor entrou', 'Director joined', 'El director entró'],
  'guest.waitingHostState': ['Aguardando o diretor…', 'Waiting for the director…', 'Esperando al director…'],
  'guest.reconnecting': ['Reconectando…', 'Reconnecting…', 'Reconectando…'],
  'guest.statusWaitingYou': ['sala aguardando você', 'room is waiting for you', 'sala esperándote'],
  'guest.statusWaitingDirector': ['sala aguardando o diretor', 'waiting for the director', 'esperando al director'],
  'guest.statusConnected': ['conectado', 'connected', 'conectado'],
  'guest.roomMeta': ['Até {n} pessoas · use fone', 'Up to {n} people · use headphones', 'Hasta {n} personas · usa auriculares'],
  'guest.roomMetaLink': ['Até {n} pessoas · use fone · link permanente', 'Up to {n} people · use headphones · permanent link', 'Hasta {n} personas · usa auriculares · enlace permanente'],
  'guest.joiningError': ['Não foi possível entrar.', 'Could not join.', 'No se pudo entrar.'],
  'guest.permissionError': ['Permissão de microfone negada. Libere o microfone no navegador e tente de novo.', 'Microphone permission denied. Allow the microphone in the browser and try again.', 'Permiso de micrófono denegado. Permite el micrófono en el navegador e inténtalo de nuevo.'],
  'guest.removed': ['O diretor removeu você da sala.', 'The director removed you from the room.', 'El director te quitó de la sala.'],
  'guest.mutedByDirector': ['diretor silenciou você', 'director muted you', 'el director te silenció'],
  'guest.endedTitle': ['Sessão encerrada', 'Session ended', 'Sesión terminada'],
  'guest.endedMessage': ['O diretor encerrou esta sessão. O link continua válido para a próxima.', 'The director ended this session. The link remains valid for the next one.', 'El director terminó esta sesión. El enlace sigue válido para la próxima.'],
  'guest.leftTitle': ['Você saiu', 'You left', 'Has salido'],
  'guest.leftMessage': ['Pode fechar esta página ou abrir o link de novo.', 'You can close this page or open the link again.', 'Puedes cerrar esta página o abrir el enlace de nuevo.'],
  'guest.incompleteLink': ['Link incompleto. Abra pelo link gerado pelo diretor.', 'Incomplete link. Open the link generated by the director.', 'Enlace incompleto. Abre el enlace generado por el director.'],
  'guest.invalidLink': ['Link inválido.', 'Invalid link.', 'Enlace inválido.'],
  'guest.footerNote': ['Áudio de produção · não vai ao programa', 'Production audio · not sent to program', 'Audio de producción · no va al programa'],

  'devices.title': ['Áudio do intercom', 'Intercom audio', 'Audio del intercom'],
  'devices.intro': ['Escolha o microfone e por onde quer ouvir. A mudança vale na hora.', 'Choose the microphone and where you want to listen. Changes apply immediately.', 'Elige el micrófono y por dónde quieres escuchar. El cambio se aplica al instante.'],
  'devices.mic': ['Microfone', 'Microphone', 'Micrófono'],
  'devices.output': ['Saída de áudio', 'Audio output', 'Salida de audio'],
  'devices.screenOn': ['Manter a tela ligada durante a sala', 'Keep the screen on during the room', 'Mantener la pantalla encendida durante la sala'],
  'devices.screenOnNote': ['A tela fica ligada enquanto a sala estiver aberta.', 'The screen stays on while the room is open.', 'La pantalla permanece encendida mientras la sala está abierta.'],
  'devices.screenOffNote': ['A tela pode apagar. No Android, instalar o app ajuda o áudio a continuar.', 'The screen may turn off. On Android, installing the app helps the audio keep running.', 'La pantalla puede apagarse. En Android, instalar la app ayuda a que el audio continúe.'],
  'devices.androidInstall': ['No Android, instale pelo menu do navegador → “Instalar app” ou “Adicionar à tela inicial”. Isso melhora o uso com a tela desligada.', 'On Android, install from the browser menu → “Install app” or “Add to home screen”. This improves screen-off use.', 'En Android, instala desde el menú del navegador → “Instalar app” o “Añadir a la pantalla de inicio”. Mejora el uso con la pantalla apagada.'],
  'devices.refresh': ['Atualizar', 'Refresh', 'Actualizar'],
  'devices.install': ['Instalar app', 'Install app', 'Instalar app'],
  'devices.micChanged': ['Microfone trocado.', 'Microphone changed.', 'Micrófono cambiado.'],
  'devices.outputChanged': ['Saída de áudio trocada.', 'Audio output changed.', 'Salida de audio cambiada.'],
  'devices.micError': ['Não foi possível trocar o microfone.', 'Could not change the microphone.', 'No se pudo cambiar el micrófono.'],
  'devices.outputUnsupported': ['Neste aparelho, o áudio sai pelo fone/Bluetooth definido no sistema. Isso é normal no Android e no iPhone.', 'On this device, audio goes to the headset/Bluetooth selected in the system. This is normal on Android and iPhone.', 'En este dispositivo, el audio va a los auriculares/Bluetooth elegidos en el sistema. Es normal en Android y iPhone.'],
  'devices.activateMicNames': ['Ative o microfone para o navegador liberar os nomes dos dispositivos.', 'Turn on the microphone so the browser can show device names.', 'Activa el micrófono para que el navegador muestre los nombres de los dispositivos.'],
  'devices.systemRoute': ['Para ouvir em outro fone/Bluetooth, troque a saída no sistema. O Intercom segue o áudio do aparelho.', 'To use another headset/Bluetooth, change the output in the system. Intercom follows the device audio.', 'Para usar otros auriculares/Bluetooth, cambia la salida en el sistema. Intercom sigue el audio del dispositivo.'],
  'devices.noDevices': ['Este navegador não permite escolher dispositivos por aqui.', 'This browser does not allow choosing devices here.', 'Este navegador no permite elegir dispositivos aquí.'],
  'devices.listError': ['Não foi possível listar os dispositivos.', 'Could not list devices.', 'No se pudieron listar los dispositivos.'],
  'devices.defaultMic': ['Microfone padrão do aparelho', 'Default device microphone', 'Micrófono predeterminado del dispositivo'],
  'devices.defaultOutput': ['Saída padrão do sistema', 'Default system output', 'Salida predeterminada del sistema'],
  'devices.outputSystem': ['Saída definida pelo sistema', 'Output defined by the system', 'Salida definida por el sistema'],
  'devices.device': ['Dispositivo', 'Device', 'Dispositivo'],

  'error.room-full': ['A sala está cheia.', 'The room is full.', 'La sala está llena.'],
  'error.password': ['Senha incorreta ou ausente.', 'Incorrect or missing password.', 'Contraseña incorrecta o ausente.'],
  'error.bad-token': ['Link inválido.', 'Invalid link.', 'Enlace inválido.'],
  'error.not-found': ['Sala não encontrada.', 'Room not found.', 'Sala no encontrada.'],
  'error.rate': ['Muitas tentativas. Aguarde um minuto.', 'Too many attempts. Wait a minute.', 'Demasiados intentos. Espera un minuto.'],
  'error.room-exists': ['Já existe uma sala com esse nome. Escolha outro ou use o link existente.', 'A room with this name already exists. Choose another name or use the existing link.', 'Ya existe una sala con ese nombre. Elige otro o usa el enlace existente.'],
  'error.bad-role': ['Papel inválido.', 'Invalid role.', 'Rol inválido.'],
  'error.host-busy': ['O host já está conectado nesta sala.', 'The host is already connected to this room.', 'El director ya está conectado en esta sala.'],
  'error.storage': ['Não foi possível salvar a sala permanente.', 'Could not save the permanent room.', 'No se pudo guardar la sala permanente.'],
  'error.bad-room': ['Use 4–24 caracteres: a-z, 0-9 ou hífen. Esse nome é reservado ou inválido.', 'Use 4–24 characters: a-z, 0-9 or hyphen. This name is reserved or invalid.', 'Usa 4–24 caracteres: a-z, 0-9 o guion. Ese nombre está reservado o no es válido.'],
  'error.bad-password': ['A senha precisa ter pelo menos 3 caracteres.', 'The password must be at least 3 characters.', 'La contraseña debe tener al menos 3 caracteres.'],
  'error.network': ['Falha de conexão. Tente novamente.', 'Connection failed. Try again.', 'Falló la conexión. Inténtalo de nuevo.'],
  'error.unknown': ['Não foi possível concluir.', 'Could not complete.', 'No se pudo completar.'],
};

const dicts = { pt: {}, en: {}, es: {} };
for (const [key, values] of Object.entries(text)) {
  dicts.pt[key] = values[0];
  dicts.en[key] = values[1];
  dicts.es[key] = values[2];
}

const KEY = 'castdeck.intercom.lang';
const LOCALES = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };
let current = 'pt';

export const languages = Object.keys(dicts);
export const currentLang = () => current;
export const locale = () => LOCALES[current] || 'pt-BR';

export function t(key, vars = {}) {
  const raw = dicts[current]?.[key] ?? dicts.pt[key] ?? key;
  return String(raw).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

export function errorText(err) {
  const code = err?.code;
  if (code && dicts[current]?.[`error.${code}`]) return t(`error.${code}`);
  return err?.message || t('error.unknown');
}

function apply(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}

function syncSelects() {
  for (const sel of document.querySelectorAll('[data-lang-select]')) sel.value = current;
}

export function applyTranslations(root = document) {
  apply(root);
  syncSelects();
}

export function setLang(lang, { silent = false } = {}) {
  if (!dicts[lang]) return;
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch {}
  document.documentElement.lang = LOCALES[lang] || lang;
  applyTranslations();
  if (!silent) window.dispatchEvent(new CustomEvent('intercom:lang', { detail: { lang } }));
}

export function onLangChange(fn) {
  const handler = (e) => fn(e.detail?.lang || current);
  window.addEventListener('intercom:lang', handler);
  return () => window.removeEventListener('intercom:lang', handler);
}

export function initI18n() {
  let saved = '';
  try { saved = localStorage.getItem(KEY) || ''; } catch {}
  const browser = String(navigator.language || 'pt').slice(0, 2).toLowerCase();
  current = dicts[saved] ? saved : (dicts[browser] ? browser : 'pt');
  document.documentElement.lang = LOCALES[current] || current;
  document.addEventListener('change', (e) => {
    const sel = e.target.closest?.('[data-lang-select]');
    if (sel && dicts[sel.value]) setLang(sel.value);
  });
  applyTranslations();
}

window.__intercomT = t;
