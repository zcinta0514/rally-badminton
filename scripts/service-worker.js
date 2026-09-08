/* VERSION, BASE_PATH, CACHE_PREFIX and ASSETS are injected at build/startup. */
const CACHE_NAME = CACHE_PREFIX + VERSION;
const allowedAssets = new Set(ASSETS.map(asset => asset.url));

async function matchesVersion(response, asset) {
  if (!response?.ok || response.type === 'opaque' || response.redirected) return false;
  const bytes = await response.clone().arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  return hash === asset.hash;
}
async function verifiedDownload(asset) {
  const response = await fetch(new Request(asset.url, {cache:'no-cache',credentials:'same-origin'}));
  if (!await matchesVersion(response, asset)) throw new Error('Game changed during download; retry later');
  return response;
}
async function prepareCache() {
  const existing = (await caches.keys()).includes(CACHE_NAME) ? await caches.open(CACHE_NAME) : null;
  // Verify every resource before touching the destination. Re-registration of
  // identical worker bytes must never delete or invalidate an active cache.
  const responses = await Promise.all(ASSETS.map(async asset => {
    const cached = await existing?.match(asset.url);
    return await matchesVersion(cached, asset) ? cached : verifiedDownload(asset);
  }));
  const cache = existing || await caches.open(CACHE_NAME);
  await Promise.all(ASSETS.map((asset, index) => cache.put(asset.url, responses[index])));
}
self.addEventListener('install', event => {
  event.waitUntil(prepareCache());
  // Deliberately no skipWaiting. All previous tabs must close before an update.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    // No clients.claim: a first-load page also finishes using its original bytes.
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const key = request.mode === 'navigate' && url.pathname === BASE_PATH ? BASE_PATH : url.pathname;
  if (!allowedAssets.has(key)) return; // Never cache health or live game traffic.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(key);
    if (cached) return cached;
    try {
      // Eviction is recoverable only using bytes from this exact version.
      const repaired = await verifiedDownload(ASSETS.find(asset => asset.url === key));
      await cache.put(key, repaired.clone()); return repaired;
    } catch {
      return new Response('游戏缓存不完整。请联网后关闭全部游戏窗口，再重新打开。', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'CACHE_STATUS' || event.data?.type === 'REPAIR_CACHE') {
    event.waitUntil((async () => {
      let error = false;
      if (event.data.type === 'REPAIR_CACHE') { try { await prepareCache(); } catch { error = true; } }
      const cache = await caches.open(CACHE_NAME);
      const complete = (await Promise.all(ASSETS.map(asset => cache.match(asset.url)))).every(Boolean);
      event.ports?.[0]?.postMessage({ type: 'CACHE_STATUS', version: VERSION, complete:complete&&!error });
    })());
  }
});
