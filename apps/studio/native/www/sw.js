// Service worker mínimo — existe sobretudo para satisfazer o critério de
// "instalável" do Chrome/Android (prompt automático de "Adicionar ao ecrã
// principal"). Estratégia "network-first": tenta sempre a versão mais
// recente da rede; só usa a cópia em cache se estiver mesmo offline.
// Isto evita o problema mais comum de service workers — servir conteúdo
// desatualizado depois de uma atualização.
const CACHE_NAME = 'z-studio-shell-v2';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch(() => {}) // não bloqueia a instalação se algum ficheiro falhar
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return; // nunca cachear POST/PUT etc.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // guarda uma cópia fresca em cache para uso offline futuro
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request)) // offline — cai para a cópia em cache
  );
});
