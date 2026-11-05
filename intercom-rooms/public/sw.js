// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Miguel Kallemback / flue.live — CastDeck
const CACHE = 'castdeck-intercom-v3';
const STATIC = [
  '/intercom/',
  '/intercom/index.html',
  '/intercom/css/intercom.css?v=7',
  '/intercom/js/create.js?v=7',
  '/intercom/js/host.js?v=7',
  '/intercom/js/guest.js?v=7',
  '/intercom/js/common.js',
  '/intercom/js/devices.js',
  '/intercom/js/peer.js',
  '/intercom/js/qr.js',
  '/intercom/icon.svg',
  '/intercom/icon-192.png',
  '/intercom/icon-512.png',
  '/intercom/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith('/intercom/')) return;
  if (url.pathname.startsWith('/intercom/api/') || url.pathname === '/intercom/ws') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(async () => (await caches.match(req)) || caches.match('/intercom/') || Response.error())
    );
    return;
  }

  event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  })));
});
