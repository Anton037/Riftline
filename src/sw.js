// Riftline service worker – build __RL_VERSION__ (__RL_BUILD__)
// Scope isolates separate deployments on the same GitHub Pages origin.
const PREFIX = `riftline:${encodeURIComponent(self.registration.scope)}:`;
const CACHE = PREFIX + 'v__RL_VERSION_DASHED__-__RL_BUILD__-__RL_ASSETS__';
const FILES = ["index.html","__RL_GAME_FILE__","manifest.webmanifest","audio/physical-bank.wav","textures/terrain-atlas.webp","textures/surface-atlas.webp","textures/vfx-atlas.webp","icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png","favicon-48.png","build-info.json","fonts/baskervville-latin-400-normal.woff2","fonts/instrument-sans-latin-500-normal.woff2","fonts/instrument-sans-latin-600-normal.woff2","fonts/instrument-sans-latin-700-normal.woff2"];
const ASSETS = FILES;
const INSTALLED = new URL('.riftline-installed', self.registration.scope).href;
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const results = await Promise.allSettled(ASSETS.map(f => c.add(new Request(f, { cache: 'reload' }))));
    const failure = results.find((result) => result.status === 'rejected');
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
      if (key === CACHE) continue;
      if (key.startsWith('riftline-v')) {
        await caches.delete(key);
        continue;
      }
      if (!key.startsWith(PREFIX)) continue;
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
    // Serve the atomic installed HTML snapshot from CACHE first so navigation and sub-resources never version-skew.
    const cached = () =>
      caches.open(CACHE).then((c) => c.match('index.html', { ignoreSearch: true }).then((hit) => hit || c.match('./', { ignoreSearch: true })));
    e.respondWith(
      cached().then((hit) => {
        if (hit) return hit;
        const net = fetch(req, { cache: 'no-store' });
        const good = net.then((res) => (res && res.ok ? res : cached().then((h) => h || res)));
        const slow = new Promise((resolve) => setTimeout(resolve, 3000)).then(cached).then((h) => h || good);
        return Promise.race([good, slow]).catch(() => cached());
      }),
    );
    return;
  }
  if (url.pathname.endsWith('/build-info.json')) {
    const stored = () => caches.open(CACHE).then(c => c.match('build-info.json', { ignoreSearch: true }));
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
