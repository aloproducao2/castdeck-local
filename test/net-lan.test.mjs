// Testa a escolha do IPv4 da LAN (QR da câmera/convidado) sem depender das interfaces reais.
import assert from 'node:assert/strict';
import { rankLan, privateRank, lanIps } from '../server/net.js';

const entries = [
  { name: 'Tailscale', address: '100.70.46.107' }, // CGNAT/Tailscale: não é alcançável pelo celular comum
  { name: 'vEthernet (WSL (Hyper-V firewall))', address: '172.21.32.1' },
  { name: 'Docker', address: '172.17.0.1' },
  { name: 'Ethernet 2', address: '10.0.0.25' },
  { name: 'Wi-Fi', address: '192.168.7.8' },
  { name: 'VPN corporativa', address: '10.8.0.2' },
  { name: 'Adaptador público', address: '8.8.8.8' },
  { name: 'APIPA', address: '169.254.10.20' },
];

const ranked = rankLan(entries);
const addrs = ranked.map((e) => e.address);
assert.deepEqual(addrs, ['192.168.7.8', '10.0.0.25', '172.21.32.1', '172.17.0.1'], addrs);
assert.equal(privateRank('192.168.1.2'), 0);
assert.equal(privateRank('10.1.2.3'), 1);
assert.equal(privateRank('172.31.1.2'), 2);
assert.equal(privateRank('100.70.46.107'), -1, 'CGNAT/Tailscale não é LAN');
assert.equal(privateRank('172.32.0.1'), -1, 'fora de 172.16–31');
assert.equal(privateRank('8.8.8.8'), -1, 'IP público não é LAN');
assert.deepEqual(rankLan([{ name: 'Tailscale', address: '100.70.46.107' }]), []);
assert.deepEqual(rankLan([]), []);

const real = lanIps();
for (const i of real) assert.ok(privateRank(i.address) >= 0, `lanIps não deve retornar ${i.address}`);
console.log('OK', addrs, 'reais:', real);
