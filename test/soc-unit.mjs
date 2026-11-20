// Testes do detector de SoC (Rockchip, Raspberry Pi, Jetson, ARM genérico, x64) e do texto de descrição.
import { detectSoc, describeSoc } from '../server/soc.js';

let falhas = 0;
const ok = (nome, cond, info = '') => {
  if (!cond) falhas++;
  console.log((cond ? 'OK   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' :: ' + info));
};

const rk = detectSoc({
  compatible: 'rockchip,rk3588-rock-5b\0rockchip,rk3588\0',
  cpuinfo: 'processor\t: 0\nHardware\t: Rockchip RK3588\n',
  devices: { mpp: true, rga: true, dri: true },
  arch: 'arm64',
  platform: 'linux',
});
ok('RK3588 detectado', rk.family === 'rockchip' && rk.model === 'rk3588', JSON.stringify(rk));
ok('RK3588 nome amigável', rk.name === 'Rockchip RK3588', rk.name);
ok('RK3588 prefere rkmpp', rk.prefers[0] === 'h264_rkmpp', JSON.stringify(rk.prefers));
ok('RK3588 sem aviso quando tem MPP+RGA', rk.note === '', rk.note);

const rkSemMpp = detectSoc({ compatible: 'rockchip,rk3566', devices: { mpp: false, rga: true, dri: true }, arch: 'arm64', platform: 'linux' });
ok('RK3566 sem MPP avisa do driver', rkSemMpp.family === 'rockchip' && /MPP ausente/.test(rkSemMpp.note), rkSemMpp.note);
ok('RK3566 mantém fallback v4l2m2m', rkSemMpp.prefers.includes('h264_v4l2m2m'), JSON.stringify(rkSemMpp.prefers));

const rkSemRga = detectSoc({ compatible: 'rockchip,rk3588s', devices: { mpp: true, rga: false, dri: true }, arch: 'arm64', platform: 'linux' });
ok('sem RGA só avisa da escala', /RGA ausente/.test(rkSemRga.note), rkSemRga.note);

const pi5 = detectSoc({ compatible: 'raspberrypi,5-model-b\0brcm,bcm2712\0', cpuinfo: 'model name\t: ARMv8\n', devices: { dri: true }, arch: 'arm64', platform: 'linux' });
ok('Raspberry Pi 5', pi5.family === 'raspberrypi' && pi5.name === 'Raspberry Pi 5', JSON.stringify(pi5.name));
ok('Pi prefere v4l2m2m', pi5.prefers[0] === 'h264_v4l2m2m', JSON.stringify(pi5.prefers));

const pi4 = detectSoc({ compatible: '', cpuinfo: 'Hardware\t: BCM2711\nRevision\t: c03111\n', arch: 'arm64', platform: 'linux' });
ok('Raspberry Pi 4 pelo cpuinfo', pi4.family === 'raspberrypi' && pi4.name === 'Raspberry Pi 4', JSON.stringify(pi4.name));

const jetson = detectSoc({ compatible: 'nvidia,p3768-0000+p3767-0000\0nvidia,tegra234\0', arch: 'arm64', platform: 'linux' });
ok('Jetson (Tegra)', jetson.family === 'jetson' && jetson.prefers[0] === 'h264_nvenc', JSON.stringify(jetson));

const aml = detectSoc({ compatible: 'amlogic,sm1\0', arch: 'arm64', platform: 'linux' });
ok('Amlogic cai em ARM genérico com aviso', aml.family === 'generic-arm' && /CPU \(x264\)/.test(aml.note), aml.note);

const x64 = detectSoc({ arch: 'x64', platform: 'linux' });
ok('PC x64 Linux', x64.family === 'x64' && x64.prefers.includes('h264_vaapi'), JSON.stringify(x64));

const mac = detectSoc({ arch: 'arm64', platform: 'darwin' });
ok('macOS (Apple Silicon)', mac.family === 'other' && mac.prefers[0] === 'h264_videotoolbox', JSON.stringify(mac));

ok('describeSoc do RK com MPP+RGA', describeSoc(rk) === 'Rockchip RK3588 · MPP ok · RGA ok', describeSoc(rk));
ok('describeSoc do Pi', /Raspberry Pi 5 · V4L2 M2M/.test(describeSoc(pi5)), describeSoc(pi5));

console.log(falhas ? `\nSOC_FAIL (${falhas})` : '\nSOC_OK');
process.exit(falhas ? 1 : 0);
