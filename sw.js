// ASMaP Service Worker (Oguaa SHTS): lets the app open offline and be added to the Home Screen.
// IMPORTANT: it never stores or serves database (API) responses, so staff always see live data.
const CACHE = 'asmap-v2';
const OFFLINE_URLS = ['/', '/index.html', '/portal.html'];

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(cache) { return cache.addAll(OFFLINE_URLS).catch(function() {}); }));
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  // Removes the old cache (asmap-v1), which also held stale database responses
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  // Leave everything except same-site page files alone: Supabase calls, SMS, payments, writes
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(function(res) {
      if (res.status === 200) { var copy = res.clone(); caches.open(CACHE).then(function(c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function() {
      return caches.match(e.request).then(function(hit) { return hit || caches.match('/index.html'); });
    })
  );
});
