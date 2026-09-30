/* Z Find — service worker (installable site).
   Network first, always: visitors get the live site; the cached copy of the
   page and its static files is used only when the network is unavailable.
   Never caches the database, the estimation API or other sites. */
'use strict';

const CACHE = 'zfind-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/brand/zfind-icon-192.png', '/brand/zfind-icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const cacheable = request.mode === 'navigate' || /^\/(brand|vendor|geo|market-data)\//.test(url.pathname) || url.pathname === '/manifest.webmanifest';
  if (!cacheable) return;
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request.mode === 'navigate' ? '/' : request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request.mode === 'navigate' ? '/' : request).then(hit => hit || Response.error()))
  );
});
