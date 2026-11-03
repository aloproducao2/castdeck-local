// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
// Gera (e reaproveita) um certificado autoassinado para servir HTTPS na rede local.
// Navegadores só liberam câmera/microfone em contexto seguro (https ou localhost),
// então convidados na LAN precisam do HTTPS.
import fs from 'node:fs/promises';
import path from 'node:path';
import selfsigned from 'selfsigned';

export async function getCertificate(dir, ips) {
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');
  const metaFile = path.join(dir, 'cert.json');
  await fs.mkdir(dir, { recursive: true });

  const wanted = [...new Set(['127.0.0.1', ...ips])].sort();
  try {
    const meta = JSON.parse(await fs.readFile(metaFile, 'utf8'));
    const sameIps = JSON.stringify(meta.ips) === JSON.stringify(wanted);
    const valid = meta.expires > Date.now() + 7 * 864e5;
    if (sameIps && valid) {
      return { key: await fs.readFile(keyFile), cert: await fs.readFile(certFile) };
    }
  } catch {
    /* gerar novo */
  }

  const notBeforeDate = new Date();
  const notAfterDate = new Date(Date.now() + 825 * 864e5);
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'CastDeck Local' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notBeforeDate,
    notAfterDate,
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          ...wanted.map((ip) => ({ type: 7, ip })),
        ],
      },
    ],
  });
  await fs.writeFile(keyFile, pems.private);
  await fs.writeFile(certFile, pems.cert);
  await fs.writeFile(metaFile, JSON.stringify({ ips: wanted, expires: notAfterDate.getTime() }));
  return { key: pems.private, cert: pems.cert };
}
