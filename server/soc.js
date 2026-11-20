// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Descobre o SoC da máquina (Rockchip, Raspberry Pi, Jetson…) e quais dispositivos de aceleração existem.
// Base para escolher o FFmpeg e o encoder de hardware certos em Linux ARM.
import fs from 'node:fs';

const LER = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};
const EXISTE = (p) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

// Nomes amigáveis por modelo Rockchip (o resto aparece como está)
const ROCKCHIP_NOMES = {
  rk3588: 'Rockchip RK3588',
  rk3588s: 'Rockchip RK3588S',
  rk3568: 'Rockchip RK3568',
  rk3566: 'Rockchip RK3566',
  rk3562: 'Rockchip RK3562',
  rk3399: 'Rockchip RK3399',
  rk3328: 'Rockchip RK3328',
  rk3288: 'Rockchip RK3288',
};

const PI_NOMES = {
  bcm2712: 'Raspberry Pi 5',
  bcm2711: 'Raspberry Pi 4',
  bcm2837: 'Raspberry Pi 3',
  bcm2835: 'Raspberry Pi 1/Zero',
};

// `compatible` = /proc/device-tree/compatible (string com NULs), `cpuinfo` = /proc/cpuinfo
export function detectSoc({ compatible = '', cpuinfo = '', devices = {}, arch = process.arch, platform = process.platform, nvidia = false } = {}) {
  const comp = String(compatible || '').toLowerCase();
  const cpu = String(cpuinfo || '');
  const cpuLower = cpu.toLowerCase();
  const out = {
    arch,
    platform,
    family: 'other',
    model: '',
    name: '',
    drivers: {
      mpp: !!devices.mpp,
      rga: !!devices.rga,
      dri: !!devices.dri,
    },
    nvidia: !!nvidia || /nvidia|tegra/.test(comp),
    prefers: [],
    note: '',
  };

  // Rockchip
  const rk = comp.match(/rockchip,(rk\d{4}[a-z]*)/);
  if (rk || devices.mpp || /rockchip/.test(comp)) {
    out.family = 'rockchip';
    out.model = rk ? rk[1] : '';
    out.name = ROCKCHIP_NOMES[out.model] || (out.model ? `Rockchip ${out.model.toUpperCase()}` : 'Rockchip');
    out.prefers = ['h264_rkmpp', 'h264_v4l2m2m', 'libx264'];
    if (!devices.mpp) {
      out.note = 'Driver MPP ausente (/dev/mpp_service): para codificar por hardware use kernel BSP Rockchip ou Armbian com mpp.';
    } else if (!devices.rga) {
      out.note = 'RGA ausente (/dev/rga): a codificação por hardware funciona, só a escala acelerada fica na CPU.';
    }
    return out;
  }

  // Raspberry Pi
  const pi = /raspberrypi,|bcm27\d\d/.test(comp) || /bcm27\d\d/.test(cpuLower) || /raspberry pi/i.test(cpu);
  if (pi) {
    const modelo = (cpuLower.match(/bcm(\d{4})/) || comp.match(/bcm(\d{4})/) || [])[1];
    out.family = 'raspberrypi';
    out.model = modelo ? `bcm${modelo}` : '';
    out.name = PI_NOMES[out.model] || 'Raspberry Pi';
    out.prefers = ['h264_v4l2m2m', 'libx264'];
    out.note = 'No Raspberry Pi o encoder V4L2 M2M tem limites de resolução/fps — 1080p30 é o teto confortável.';
    return out;
  }

  // Jetson (NVENC)
  if (out.nvidia) {
    out.family = 'jetson';
    out.model = 'tegra';
    out.name = 'NVIDIA Jetson';
    out.prefers = ['h264_nvenc', 'libx264'];
    return out;
  }

  // macOS e Windows não usam a lista de SoC ARM do Linux
  if (platform === 'darwin') {
    out.family = 'other';
    out.name = arch === 'arm64' ? 'Mac Apple Silicon' : 'Mac Intel';
    out.prefers = ['h264_videotoolbox', 'libx264'];
    return out;
  }
  if (platform === 'win32') {
    out.family = 'x64';
    out.name = 'PC (Windows)';
    out.prefers = ['h264_nvenc', 'h264_qsv', 'h264_amf', 'libx264'];
    return out;
  }

  if (arch === 'arm64' || arch === 'arm') {
    const aml = comp.match(/(amlogic|allwinner|mediatek|qualcomm),([a-z0-9-]+)/);
    out.family = 'generic-arm';
    out.model = aml ? `${aml[1]},${aml[2]}` : '';
    out.name = aml ? `${aml[1]} ${aml[2]}` : 'ARM genérico';
    out.prefers = ['h264_v4l2m2m', 'libx264'];
    if (aml) out.note = 'SoC sem suporte de hardware no FFmpeg: a live usa a CPU (x264).';
    return out;
  }

  if (platform === 'linux' || platform === 'win32' || platform === 'darwin') {
    out.family = arch === 'x64' ? 'x64' : 'other';
    out.name = arch === 'x64' ? 'PC (x64)' : platform;
    out.prefers = platform === 'darwin' ? ['h264_videotoolbox', 'libx264'] : ['h264_nvenc', 'h264_qsv', 'h264_amf', 'h264_vaapi', 'libx264'];
  }
  return out;
}

// Junta as informações reais do sistema e devolve o resultado de detectSoc.
export function readSoc(env = process.env) {
  // permite simular outra placa em testes/suporte (ex.: CASTDECK_FAKE_SOC=rockchip,rk3588)
  const fake = String(env.CASTDECK_FAKE_SOC || '').trim();
  if (fake) {
    const comMpp = env.CASTDECK_FAKE_MPP !== '0';
    return detectSoc({
      compatible: fake,
      cpuinfo: '',
      devices: { mpp: comMpp, rga: env.CASTDECK_FAKE_RGA === '1', dri: true },
      arch: env.CASTDECK_FAKE_ARCH || 'arm64',
      platform: 'linux',
    });
  }

  const compatible = LER('/proc/device-tree/compatible').replace(/\0/g, ' ');
  const cpuinfo = LER('/proc/cpuinfo');
  const devices = {
    mpp: EXISTE('/dev/mpp_service') || EXISTE('/dev/mpp-service'),
    rga: EXISTE('/dev/rga'),
    dri: EXISTE('/dev/dri/renderD128') || EXISTE('/dev/dri/card0'),
  };
  let nvidia = false;
  try {
    nvidia = EXISTE('/dev/nvhost-ctrl') || EXISTE('/dev/nvhost-ctrl-gpu') || EXISTE('/proc/driver/nvidia/version');
  } catch {}
  return detectSoc({ compatible, cpuinfo, devices, arch: process.arch, platform: process.platform, nvidia });
}

// Texto curto para a interface (ex.: "Rockchip RK3588 · MPP ok · RGA ok")
export function describeSoc(soc) {
  if (!soc) return '';
  const marcas = [];
  marcas.push(soc.drivers?.mpp ? 'MPP ok' : soc.family === 'rockchip' ? 'sem MPP' : '');
  if (soc.family === 'rockchip') marcas.push(soc.drivers?.rga ? 'RGA ok' : 'sem RGA');
  if (soc.family === 'raspberrypi') marcas.push('V4L2 M2M');
  return [soc.name || soc.family, ...marcas.filter(Boolean)].join(' · ');
}
