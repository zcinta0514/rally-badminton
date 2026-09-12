/* VERSION, BASE_PATH, CACHE_PREFIX and ASSETS are injected at build/startup. */
const CACHE_NAME = CACHE_PREFIX + VERSION;
const allowedAssets = new Set(ASSETS.map(asset => asset.url));
const CLIENT_CACHE = CACHE_PREFIX + 'clients';
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const isVersion = value => typeof value === 'string' && /^[a-f0-9]{16}$/.test(value);
const isGamePath = pathname => pathname === BASE_PATH || pathname === BASE_PATH + 'index.html';
const clientKey = id => new URL(BASE_PATH + '__rally_client__/' + encodeURIComponent(id), self.location.origin).href;
const versionKey = version => new URL(BASE_PATH + '__rally_version__/' + version, self.location.origin).href;
let activationPending = false, maintenanceRunning = false;

function inScope(client) {
  if (!client?.id || client.type !== 'window') return false;
  try {
    const url = new URL(client.url);
    return url.origin === self.location.origin && url.pathname.startsWith(BASE_PATH);
  } catch { return false; }
}
function gameWindow(client) {
  return inScope(client) && ['top-level', 'auxiliary'].includes(client.frameType) && isGamePath(new URL(client.url).pathname);
}
async function scopedWindows({coordination = false} = {}) {
  return (await self.clients.matchAll({type: 'window', includeUncontrolled: true})).filter(client => {
    if (coordination) return gameWindow(client);
    return inScope(client);
  });
}
async function actualSource(source) {
  if (!inScope(source)) return null;
  const actual = await self.clients.get(source.id);
  return inScope(actual) ? actual : null;
}
async function readClientRecord(id) {
  if (!id || !(await caches.keys()).includes(CLIENT_CACHE)) return null;
  const metadata = await caches.open(CLIENT_CACHE);
  const response = await metadata.match(clientKey(id));
  if (!response) return null;
  const text = await response.text();
  let record;
  try { record = JSON.parse(text); } catch { /* Earlier builds stored a bare version. */ }
  if (isVersion(record?.version) && Number.isFinite(record.seenAt) && record.seenAt >= 0) return record;
  if (!isVersion(text)) return null;
  record = {version: text, seenAt: Date.now()};
  await metadata.put(clientKey(id), new Response(JSON.stringify(record)));
  return record;
}
async function readClientVersion(id) { return (await readClientRecord(id))?.version || null; }
async function knownVersion(version) {
  if (!isVersion(version) || !(await caches.keys()).includes(CACHE_PREFIX + version)) return false;
  const cache = await caches.open(CACHE_PREFIX + version);
  const config = await cache.match(BASE_PATH + 'runtime-config.js');
  if (!config || !await cache.match(BASE_PATH)) return false;
  // Parse only the generated JSON wrapper, never evaluate stored JavaScript.
  const match = (await config.text()).match(/^globalThis\.RALLY_CONFIG=Object\.freeze\((\{[^\n]*\})\);\s*$/);
  try { return !!match && JSON.parse(match[1]).buildId === version; } catch { return false; }
}
async function pinClient(id, version, {navigation = false} = {}) {
  if (!id || !isVersion(version)) return false;
  const existing = await readClientVersion(id);
  if (existing && existing !== version) return false;
  if (!navigation && !await knownVersion(version)) return false;
  await (await caches.open(CLIENT_CACHE)).put(clientKey(id), new Response(JSON.stringify({version, seenAt: Date.now()})));
  return true;
}

async function rememberVersion(version) {
  const metadata = await caches.open(CLIENT_CACHE);
  const response = await metadata.match(versionKey(version));
  try {
    const record = response && JSON.parse(await response.text());
    if (record?.version === version && Number.isFinite(record.createdAt) && record.createdAt >= 0) return record;
  } catch { /* Missing or older metadata receives a fresh conservative grace period. */ }
  const record = {version, createdAt: Date.now()};
  await metadata.put(versionKey(version), new Response(JSON.stringify(record)));
  return record;
}
const maintenanceBlocked = () => activationPending || !!self.registration?.waiting || !!self.registration?.installing;

async function cacheReferences() {
  const windows = await scopedWindows(), records = await Promise.all(windows.map(client => readClientRecord(client.id)));
  return windows.flatMap((client, index) => {
    const pathname = new URL(client.url).pathname;
    // A pinned document removed from the next inventory is still a live user of
    // its old version. Unrelated pages without game pins are irrelevant.
    return records[index] || isGamePath(pathname) || allowedAssets.has(pathname) ? [{client, record: records[index]}] : [];
  });
}

async function collectOldCaches() {
  if (maintenanceRunning || maintenanceBlocked()) return;
  maintenanceRunning = true;
  try {
    const metadata = await caches.open(CLIENT_CACHE), cutoff = Date.now() - RETENTION_MS;
    const references = await cacheReferences(), windows = references.map(item => item.client), livePins = references.map(item => item.record);
    if (livePins.some(record => !record)) return; // Unknown game document may still need any old build.
    const records = [];
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && isVersion(name.slice(CACHE_PREFIX.length))) records.push(await rememberVersion(name.slice(CACHE_PREFIX.length)));
    }
    const keep = new Set([VERSION, ...livePins.map(record => record.version)]);
    // Keep a complete immediate fallback even when it has no live references.
    for (const record of records.filter(record => record.version !== VERSION).sort((a, b) => b.createdAt - a.createdAt)) {
      if (await knownVersion(record.version)) { keep.add(record.version); break; }
    }
    const pins = [];
    for (const key of await metadata.keys()) {
      const pathname = new URL(key.url).pathname, marker = BASE_PATH + '__rally_client__/';
      if (!pathname.startsWith(marker)) continue;
      const id = decodeURIComponent(pathname.slice(marker.length)), record = await readClientRecord(id);
      if (!record) continue;
      pins.push({id, record, key});
      if (record.seenAt >= cutoff) keep.add(record.version);
    }
    for (const record of records) {
      if (record.createdAt >= cutoff || keep.has(record.version)) continue;
      if (maintenanceBlocked() || !sameWindows(windows, (await cacheReferences()).map(item => item.client))) return;
      // Re-read navigation references immediately before deletion. An extremely
      // delayed old navigation beyond this grace period can fail closed (503),
      // but will never receive the current build's bytes under its old identity.
      let referenced = false;
      for (const key of await metadata.keys()) {
        const pathname = new URL(key.url).pathname, marker = BASE_PATH + '__rally_client__/';
        if (!pathname.startsWith(marker)) continue;
        const pin = await readClientRecord(decodeURIComponent(pathname.slice(marker.length)));
        if (pin?.version === record.version && pin.seenAt >= cutoff) { referenced = true; break; }
      }
      if (referenced || maintenanceBlocked()) continue;
      await caches.delete(CACHE_PREFIX + record.version);
      await metadata.delete(versionKey(record.version));
    }
    for (const {id, record, key} of pins) {
      if (record.seenAt >= cutoff || windows.some(client => client.id === id) || maintenanceBlocked()) continue;
      if (await self.clients.get(id)) continue;
      const latest = await readClientRecord(id);
      if (latest && latest.seenAt < cutoff) await metadata.delete(key);
    }
  } catch { /* Storage pressure or unavailable browser APIs must not prevent play. */ }
  finally { maintenanceRunning = false; }
}

function prepareWindow(client, transaction, type = 'PREPARE_UPDATE', timeout = 4000) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true; clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeout);
    channel.port1.onmessage = event => {
      const data = event.data;
      finish(data?.transaction === transaction && data.ready === true && isVersion(data.version) ? data.version : null);
    };
    try { client.postMessage({type, version: VERSION, transaction}, [channel.port2]); }
    catch { finish(null); }
  });
}
function tellWindows(windows, type, transaction) {
  for (const client of windows) {
    try { client.postMessage({type, version: VERSION, transaction}); } catch { /* Closed windows cannot be resumed. */ }
  }
}
const sameWindows = (before, after) => before.length === after.length && before.every(client => after.some(next => next.id === client.id));

async function requestActivation(event) {
  const requestId = event.data?.requestId;
  const reply = (status, reason) => event.ports?.[0]?.postMessage({type: 'ACTIVATION_RESULT', version: VERSION, requestId, status, ...(reason ? {reason} : {})});
  if (event.data?.version !== VERSION || typeof requestId !== 'string' || requestId.length > 128 || !gameWindow(await actualSource(event.source))) {
    reply('deferred', 'invalid-request'); return;
  }
  if (activationPending) { reply('deferred', 'coordination-running'); return; }
  activationPending = true;
  const transaction = VERSION + '-' + crypto.randomUUID();
  const deadline = Date.now() + 7000;
  let windows = [], committed = false, preparing = false;
  try {
    windows = await scopedWindows({coordination: true});
    if (!windows.some(client => client.id === event.source.id)) throw Error('requester-closed');
    // Detect busy/legacy windows without repeatedly locking responsive menus.
    const probes = await Promise.all(windows.map(client => prepareWindow(client, transaction, 'CHECK_UPDATE_SAFETY', 1500)));
    if (probes.some(version => !version)) throw Error('window-busy-or-unavailable');
    if (!sameWindows(windows, await scopedWindows({coordination: true}))) throw Error('windows-changed');
    if (Date.now() >= deadline) throw Error('coordination-expired');
    preparing = true;
    const versions = await Promise.all(windows.map(client => prepareWindow(client, transaction)));
    if (versions.some(version => !version)) throw Error('window-busy-or-unavailable');
    if (!sameWindows(windows, await scopedWindows({coordination: true}))) throw Error('windows-changed');
    const pinned = await Promise.all(windows.map((client, index) => pinClient(client.id, versions[index])));
    if (pinned.some(value => !value)) throw Error('unknown-page-version');
    if (!sameWindows(windows, await scopedWindows({coordination: true}))) throw Error('windows-changed');
    // A slow storage operation must not commit after clients release their lock.
    if (Date.now() >= deadline) throw Error('coordination-expired');
    // A window can still be created after this check. Navigation pins and retained
    // version caches protect that window instead of assuming enumeration is a lock.
    tellWindows(windows, 'COMMIT_UPDATE', transaction);
    await self.skipWaiting(); committed = true;
    reply('activating');
  } catch (error) {
    if (preparing) tellWindows(windows, 'CANCEL_UPDATE', transaction);
    reply('deferred', error?.message || 'coordination-failed');
  } finally {
    if (!committed) activationPending = false;
  }
}

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
  try { await rememberVersion(VERSION); } catch { /* Metadata failure never invalidates a complete asset cache. */ }
}
self.addEventListener('install', event => {
  event.waitUntil(prepareCache());
  // Installation itself never skips waiting. Only a prepared update may do so.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Retain recent resources for in-flight navigation. Maintenance later retires
    // expired unreferenced builds, without running during activation coordination.
    // No clients.claim: a first-load page also finishes using its original bytes.
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const key = request.mode === 'navigate' && isGamePath(url.pathname) ? BASE_PATH : url.pathname;
  const localResource = ['src/', 'shared/', 'vendor/', 'icons/'].some(directory => key.startsWith(BASE_PATH + directory));
  if (!allowedAssets.has(key) && !localResource) return; // Never cache health or live game traffic.
  event.respondWith((async () => {
    const navigation = request.mode === 'navigate' && allowedAssets.has(key);
    if (navigation && event.resultingClientId) {
      // Persist before releasing HTML so even a different worker can serve its
      // later imports after activation or worker process termination.
      try {
        if (!await pinClient(event.resultingClientId, VERSION, {navigation: true})) return cacheFailure();
      } catch { return cacheFailure(); }
    }
    let version = VERSION;
    if (!navigation && event.clientId) {
      version = await readClientVersion(event.clientId);
      if (!version) return cacheFailure(); // Unknown document: never guess new bytes.
    }
    const name = CACHE_PREFIX + version;
    if (!(await caches.keys()).includes(name)) return cacheFailure();
    const cache = await caches.open(name);
    const cached = await cache.match(key);
    if (cached) return cached;
    if (version !== VERSION) return cacheFailure();
    const asset = ASSETS.find(asset => asset.url === key);
    if (!asset) return fetch(request);
    try {
      // Eviction is recoverable only using bytes from this exact version.
      const repaired = await verifiedDownload(asset);
      await cache.put(key, repaired.clone()); return repaired;
    } catch {
      return cacheFailure();
    }
  })());
});

function cacheFailure() {
  return new Response('游戏缓存不完整。请联网后关闭全部游戏窗口，再重新打开。', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
}

self.addEventListener('message', event => {
  if (event.data?.type === 'VERSION_REQUEST') {
    event.ports?.[0]?.postMessage({type: 'VERSION', version: VERSION});
  }
  if (event.data?.type === 'REQUEST_ACTIVATION') event.waitUntil(requestActivation(event));
  if (event.data?.type === 'CLIENT_VERSION') {
    event.waitUntil((async () => {
      let accepted = false;
      try {
        const source = await actualSource(event.source);
        if (source) accepted = await pinClient(source.id, event.data.version);
      } catch { /* Storage failure must defer activation and version routing. */ }
      event.ports?.[0]?.postMessage({type: 'CLIENT_VERSION_RESULT', accepted, version: event.data.version});
      if (accepted) await collectOldCaches();
    })());
  }
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
