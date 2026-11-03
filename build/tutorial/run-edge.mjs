import { spawn } from 'node:child_process';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const args = [
  '--remote-debugging-port=9335',
  '--user-data-dir=D:\\REA\\build\\tmp\\edge-tut-clean',
  '--lang=pt-BR',
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--no-first-run',
  '--disable-extensions',
  '--window-size=1600,1000',
  '--hide-scrollbars',
  'about:blank',
];

function launch() {
  const child = spawn(edgePath, args, { stdio: 'inherit' });
  child.on('exit', (code) => {
    console.log('Edge finalizado com código:', code, '— relançando em 1s');
    setTimeout(launch, 1000);
  });
}

launch();
setInterval(() => {}, 60000);
