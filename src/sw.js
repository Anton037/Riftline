// Riftline service worker – build __RL_VERSION__ (__RL_BUILD__)
// Scope isolates separate deployments on the same GitHub Pages origin.
const SCOPE = self.registration.scope;
const HOME = new URL('index.html', SCOPE).href;
const PREFIX = `riftline:${encodeURIComponent(SCOPE)}:`;
const CACHE = PREFIX + 'v__RL_VERSION_DASHED__-__RL_BUILD__-__RL_ASSETS__';
const FILES = ["index.html","__RL_GAME_FILE__","manifest.webmanifest","audio/physical-bank.wav","textures/terrain-atlas.webp","textures/surface-atlas.webp","textures/vfx-atlas.webp","icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png","favicon-48.png","build-info.json","fonts/baskervville-latin-400-normal.woff2","fonts/instrument-sans-latin-500-normal.woff2","fonts/instrument-sans-latin-600-normal.woff2","fonts/instrument-sans-latin-700-normal.woff2"];
const INFO = new URL('build-info.json', SCOPE).href;
const INSTALLED = new URL('.riftline-installed', SCOPE).href;
const pageUrl = (url) => url.split(/[?#]/, 1)[0];
const isGamePage = (url) => pageUrl(url) === SCOPE || pageUrl(url) === HOME;
const unavailable = () => new Response('Riftline is unavailable offline.', { status: 503 });
const asNavigationResponse = (res) => res.redirected
  ? new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers })
  : res;
async function precache(cache, file) {
  const req = new Request(new URL(file, SCOPE), { cache: 'reload' });
  if (file !== 'index.html') return cache.add(req);
  const res = await fetch(req);
  if (!res.ok) throw new Error(`Could not cache ${file} (HTTP ${res.status})`);
  await cache.put(req, asNavigationResponse(res));
}
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try {
      const results = await Promise.allSettled(FILES.map(f => precache(c, f)));
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
      const info = await (await c.match(INFO)).json();
      const html = await (await c.match(HOME)).text();
      if (info.version !== '__RL_VERSION__' || info.build !== '__RL_BUILD__' || info.assets !== '__RL_ASSETS__' ||
          !html.includes('src="__RL_GAME_FILE__"')) {
        throw new Error('The deployment returned a mix of releases');
      }
      await c.put(INSTALLED, new Response('complete'));
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});
self.addEventListener('activate', (e) => {
  // Keep the previous installed snapshot for old tabs, including offline resource requests.
  // Cleanup is part of activation, not an unowned timer that can disappear with the worker.
  e.waitUntil((async () => {
    const older = [];
    for (const key of await caches.keys()) {
      if (key === CACHE) continue;
      // Old origin-wide cache names cannot identify which deployment owns them.
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
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting' && e.source?.url && isGamePage(e.source.url)) e.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.href.startsWith(SCOPE)) return;
  if (req.mode === 'navigate') {
    if (!isGamePage(url.href)) return;
    // Only game navigation uses the installed HTML. Other URLs keep their own response.
    e.respondWith((async () => {
      const hit = await (await caches.open(CACHE)).match(HOME);
      return hit ? asNavigationResponse(hit) : fetch(req, { cache: 'no-store' });
    })().catch(unavailable));
    return;
  }
  if (pageUrl(url.href) === INFO) {
    e.respondWith((async () => {
      const res = await fetch(req, { cache: 'no-store' }).catch(() => null);
      if (res?.ok) return res;
      return await (await caches.open(CACHE)).match(INFO) || res || unavailable();
    })().catch(unavailable));
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
