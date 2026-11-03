// Inicia o servidor do CastDeck para o tutorial na porta 3200 com pastas isoladas e FFmpeg explícito
process.env.PORT = '3200';
process.env.HTTPS_PORT = '3643';
process.env.CASTDECK_DATA = 'D:/REA/build/tmp/tutorial/data';
process.env.CASTDECK_RECORDINGS = 'D:/REA/build/tmp/tutorial/rec';
process.env.FFMPEG_PATH = 'D:/REA/build/vendor/win-x64/ffmpeg.exe';

await import('../../server/index.js');
