const CACHE = 'flashcards-v4';
const ASSETS = [
  '/', '/index.html', '/app.js', '/api.js', '/idb.js', '/manifest.json', '/sw.js',
  '/lib/preact.mjs', '/lib/hooks.mjs', '/lib/htm.mjs',
  '/styles.js',
  '/hooks/useQuizSession.js',
  '/components/ChapterSheet.js',
  '/components/ErrorBoundary.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/books') || url.pathname.startsWith('/progress')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('{"error":"offline"}', {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
