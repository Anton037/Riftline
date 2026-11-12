// Riftline service worker – build __RL_VERSION__ (__RL_BUILD__)
// Scope isolates separate deployments on the same GitHub Pages origin.
const PREFIX = `riftline:${encodeURIComponent(self.registration.scope)}:`;
const CACHE = PREFIX + 'v__RL_VERSION_DASHED__-__RL_BUILD__-__RL_ASSETS__';
const FILES = ["./","index.html","__RL_GAME_FILE__","manifest.webmanifest","audio/physical-bank.wav","textures/terrain-atlas.webp","textures/surface-atlas.webp","icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png","favicon-48.png","build-info.json","fonts/chakra-petch-latin-600-normal.woff2","fonts/chakra-petch-latin-700-normal.woff2","fonts/barlow-semi-condensed-latin-500-normal.woff2","fonts/barlow-semi-condensed-latin-600-normal.woff2","fonts/barlow-semi-condensed-latin-700-normal.woff2"];
const CORE = ['./', 'index.html', '__RL_GAME_FILE__'];
const INSTALLED = new URL('.riftline-installed', self.registration.scope).href;
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const results = await Promise.allSettled(FILES.map(f => c.add(new Request(f, { cache: 'reload' }))));
    const failure = results.find((result, i) => CORE.includes(FILES[i]) && result.status === 'rejected');
    if (failure) {
      await caches.delete(CACHE);
      throw failure.reason;
    }
    await c.put(INSTALLED, new Response('complete'));
  })());
});
self.addEventListener('activate', (e) => {
  // Keep the previous installed snapshot for old tabs, including offline resource requests.
  // Cleanup is part of activation, not an unowned timer that can disappear with the worker.
  e.waitUntil((async () => {
    const older = [];
    for (const key of await caches.keys()) {
      if (!key.startsWith(PREFIX) || key === CACHE) continue;
      if (await (await caches.open(key)).match(INSTALLED)) older.push(key);
      else await caches.delete(key);
    }
    await Promise.all(older.slice(0, -1).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
async function previousBundle(req) {
  const keys = await caches.keys();
  for (const key of keys.reverse()) {
    // Legacy releases used an origin-wide prefix; match the complete request URL, never just a filename.
    if (key !== CACHE && (key.startsWith(PREFIX) || key.startsWith('riftline-v'))) {
      const hit = await (await caches.open(key)).match(req, { ignoreSearch: true });
      if (hit) return hit;
    }
  }
}
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (req.mode === 'navigate') {
    // 2.8.1: network first, but a slow or hanging network (captive portal, weak signal) falls back to the
    // cached page after 3 s. Keep the installed HTML and bundle together: a newer online
    // response may refer to a bundle that this worker has not installed yet.
    const cached = () => caches.open(CACHE).then(c => c.match('index.html').then((hit) => hit || c.match('./')));
    const net = fetch(req, { cache: 'no-store' });
    // 3.32.0: an error page of the host (a 5xx, a 404) is not the game: the cached page wins over it
    const good = net.then((res) => (res && res.ok ? res : cached().then((hit) => hit || res)));
    const slow = new Promise((resolve) => setTimeout(resolve, 3000)).then(cached).then((hit) => hit || good);
    e.respondWith(Promise.race([good, slow]).catch(() => cached()));
    e.waitUntil(net.catch(() => null));
    return;
  }
  if (url.pathname.endsWith('/build-info.json')) {
    const stored = () => caches.open(CACHE).then(c => c.match('build-info.json'));
    e.respondWith(fetch(req, { cache: 'no-store' }).then((res) => {
      if (res && res.ok) {
        return res;
      }
      // 3.32.0: an error page of the host is not the build info: the stored one answers (as when offline)
      return stored().then((hit) => hit || res);
    }).catch(stored));
    return;
  }
  e.respondWith((async () => {
    try {
      const c = await caches.open(CACHE);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (/\/game-v[^/]+\.js$/.test(url.pathname)) {
        const previous = await previousBundle(req);
        if (previous) return previous;
      }
      const res = await fetch(req);
      // Only the installer writes the snapshot. Never accumulate unrelated fetches here.
      return res;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});
