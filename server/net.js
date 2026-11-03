// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Escolha dos endereços IPv4 da LAN mostrados no convite e no QR da câmera remota.
//
// O celular só alcança este PC pelo endereço da rede local de verdade. Adaptadores
// virtuais (WSL, Hyper-V, Docker, VPN/Tailscale) e faixas que não são LAN (100.64/10
// da operadora/Tailscale, IP público, 169.254) não podem aparecer primeiro — antes o
// QR às vezes saía com 100.70.x.x e o celular não conseguia abrir.
import os from 'node:os';

const VIRTUAL = /vethernet|wsl|hyper-v|virtualbox|vmware|vbox|docker|default switch|loopback/i;
// VPN/túnel privado (10.x, 172.x) não é a LAN do celular: não pode virar QR da câmera.
const TUNNEL = /tailscale|zerotier|wireguard|openvpn|nordlynx|hamachi|radmin|warp|cloudflare|anyconnect|globalprotect|forticlient|pulse secure|\bvpn\b|\btun\d*\b|\btap\d*\b/i;
const PHYSICAL = /wi-?fi|wlan|wireless|ethernet|\beth\d*\b|\ben\d+\b|\blan\b/i;

// 0 = 192.168, 1 = 10, 2 = 172.16–31; -1 = não é uma LAN RFC1918.
export function privateRank(address = '') {
  if (/^192\.168\./.test(address)) return 0;
  if (/^10\./.test(address)) return 1;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 2;
  return -1;
}

export function rankLan(entries = []) {
  return entries
    .filter((e) => e && typeof e.address === 'string' && privateRank(e.address) >= 0 && !TUNNEL.test(e.name || ''))
    .sort((a, b) => {
      const va = VIRTUAL.test(a.name || '') ? 1 : 0;
      const vb = VIRTUAL.test(b.name || '') ? 1 : 0;
      if (va !== vb) return va - vb;
      // Wi-Fi/Ethernet de verdade antes de uma interface sem nome conhecido.
      const pa = PHYSICAL.test(a.name || '') ? 0 : 1;
      const pb = PHYSICAL.test(b.name || '') ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const ra = privateRank(a.address);
      const rb = privateRank(b.address);
      if (ra !== rb) return ra - rb;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

export function lanIps() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/^169\.254\./.test(a.address)) continue;
      out.push({ name, address: a.address });
    }
  }
  return rankLan(out);
}
