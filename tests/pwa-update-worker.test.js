import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash, webcrypto } from 'node:crypto';
import { MessageChannel } from 'node:worker_threads';

const template = await readFile(new URL('../scripts/service-worker.js', import.meta.url), 'utf8');
const OLD = '1111111111111111', NEXT = '2222222222222222';
const origin = 'https://rally.example', basePath = '/game/';
const prefix = 'rally-assets-' + encodeURIComponent(basePath) + '-';
const pathKey = value => new URL(typeof value === 'string' ? value : value.url, origin).pathname;

// Browser-owned storage, clients and events are simulated; all coordination,
// integrity checks and version routing execute the production worker template.
function fixture({ version = NEXT, windows = [], stores = new Map(), onList, onSkip, initialNow = 0, registration = {} } = {}) {
  const assets = new Map([
    [basePath, Buffer.from('<html>' + version + '</html>')],
    [basePath + 'runtime-config.js', Buffer.from('globalThis.RALLY_CONFIG=Object.freeze(' + JSON.stringify({buildId: version}) + ');\n')],
    [basePath + 'src/lazy.js', Buffer.from('export default ' + JSON.stringify(version))],
    [basePath + 'src/analytics-frame.html', Buffer.from('<script src="./analytics-frame.js"></script>')],
    [basePath + 'src/analytics-frame.js', Buffer.from('globalThis.frameVersion=' + JSON.stringify(version))],
  ]);
  const inventory = [...assets].map(([url, bytes]) => ({url, hash: createHash('sha256').update(bytes).digest('hex')}));
  const listeners = new Map(), events = [];
  let skipCalls = 0, claimCalls = 0, enumerations = 0, offline = false, now = initialNow, deleteFails = false;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { if (deleteFails) throw Error('storage unavailable'); return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(url, response) { store.set(pathKey(url), response.clone()); },
        async match(url) { return store.get(pathKey(url))?.clone(); },
        async keys() { return [...store.keys()].map(url => new Request(origin + url)); },
        async delete(url) { return store.delete(pathKey(url)); },
      };
    },
  };
  const context = vm.createContext({
    caches, crypto: webcrypto, URL, Response, Uint8Array, console, MessageChannel,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 40)), clearTimeout,
    Request: class extends Request { constructor(url, options) { super(new URL(url, origin), options); } },
    fetch: async request => {
      if (offline) throw Error('offline');
      const bytes = assets.get(pathKey(request));
      return new Response(bytes, {status: bytes ? 200 : 404});
    },
    self: {
      location: {origin},
      registration,
      clients: {
        async matchAll() { onList?.(++enumerations); return [...windows]; },
        async get(id) { return windows.find(client => client.id === id); },
        claim() { claimCalls++; },
      },
      async skipWaiting() { skipCalls++; events.push('skip'); await onSkip?.(); },
      addEventListener(type, fn) { listeners.set(type, fn); },
    },
  });
  vm.runInContext(`const VERSION=${JSON.stringify(version)};const BASE_PATH=${JSON.stringify(basePath)};const CACHE_PREFIX=${JSON.stringify(prefix)};const ASSETS=${JSON.stringify(inventory)};\n${template}`, context);
  async function event(type, extras = {}) {
    let promise;
    listeners.get(type)({waitUntil(value) { promise = value; }, respondWith(value) { promise = value; }, ...extras});
    return await promise;
  }
  async function message(data, source = windows[0]) {
    let reply;
    await event('message', {data, source, ports: [{postMessage(value) { reply = value; }}]});
    return reply;
  }
  return {version, stores, windows, assets, events, event, message,
    calls: () => ({skipCalls, claimCalls}), offline() { offline = true; }, advanceClock(ms) { now += ms; }, failDeletion() { deleteFails = true; }};
}

function client(id, {ready = true, prepareReady = ready, version = OLD, silent = false, onProbe, onPrepare} = {}) {
  const messages = [];
  return {id, type: 'window', frameType: 'top-level', url: origin + basePath, messages,
    postMessage(data, ports) {
      messages.push(data);
      if (data.type === 'CHECK_UPDATE_SAFETY' || data.type === 'PREPARE_UPDATE') {
        if (data.type === 'CHECK_UPDATE_SAFETY') onProbe?.(data); else onPrepare?.(data);
        if (!silent) ports[0].postMessage({ready: data.type === 'CHECK_UPDATE_SAFETY' ? ready : prepareReady, version, transaction: data.transaction});
      }
    },
  };
}

async function updateFixture(options = {}) {
  const windows = options.windows || [client('a')];
  const old = fixture({version: OLD, windows});
  await old.event('install');
  const next = fixture({...options, windows, stores: old.stores});
  await next.event('install');
  return {old, next, windows};
}

const request = {type: 'REQUEST_ACTIVATION', version: NEXT, requestId: 'request-1'};

test('all same-scope windows must prepare before a requested activation commits', async () => {
  const {next, windows} = await updateFixture({windows: [client('a'), client('b')]});
  const reply = await next.message(request);
  assert.equal(reply?.status, 'activating');
  assert.equal(reply.version, NEXT);
  assert.deepEqual(next.calls(), {skipCalls: 1, claimCalls: 0});
  for (const window of windows) assert.deepEqual(window.messages.map(x => x.type), ['CHECK_UPDATE_SAFETY', 'PREPARE_UPDATE', 'COMMIT_UPDATE']);
});

test('a busy window makes the read-only probe defer before any window is locked', async () => {
  const {next, windows} = await updateFixture({windows: [client('a'), client('b', {ready: false})]});
  assert.equal((await next.message(request))?.status, 'deferred');
  assert.equal(next.calls().skipCalls, 0);
  assert.ok(next.stores.has(prefix + OLD));
  for (const window of windows) assert.deepEqual(window.messages.map(x => x.type), ['CHECK_UPDATE_SAFETY']);
});

test('a legacy or sleeping client with no reply defers instead of becoming safe after timeout', async () => {
  const {next, windows} = await updateFixture({windows: [client('a'), client('legacy', {silent: true})]});
  assert.equal((await next.message(request))?.status, 'deferred');
  assert.equal(next.calls().skipCalls, 0);
  assert.deepEqual(windows[0].messages.map(x => x.type), ['CHECK_UPDATE_SAFETY']);
});

test('a window appearing during preparation aborts the transaction', async () => {
  const windows = [client('a')];
  const {next} = await updateFixture({windows, onList: count => { if (count === 2) windows.push(client('late')); }});
  assert.equal((await next.message(request))?.status, 'deferred');
  assert.equal(next.calls().skipCalls, 0);
});

test('activation requests outside scope or for another build cannot prepare clients', async () => {
  const {next, windows} = await updateFixture();
  const foreign = {...client('foreign'), url: origin + '/elsewhere/'};
  windows.push(foreign);
  assert.equal((await next.message(request, foreign))?.status, 'deferred');
  assert.equal((await next.message({...request, version: OLD}))?.status, 'deferred');
  assert.equal(windows[0].messages.length, 0);
  assert.equal(next.calls().skipCalls, 0);
});

test('a client cannot declare a nonexistent cache version as its page version', async () => {
  const {next} = await updateFixture();
  const reply = await next.message({type: 'CLIENT_VERSION', version: '9999999999999999'});
  assert.equal(reply?.accepted, false);
  assert.equal(next.stores.has(prefix + '9999999999999999'), false);
});

test('navigation pins survive worker restart and preserve an old page opened at commit', async () => {
  const windows = [client('a')];
  const old = fixture({version: OLD, windows}); await old.event('install');
  const next = fixture({windows, stores: old.stores, onSkip: async () => {
    windows.push(client('late'));
    await old.event('fetch', {request: {method: 'GET', mode: 'navigate', url: origin + basePath}, resultingClientId: 'late'});
  }});
  await next.event('install');
  assert.equal((await next.message(request))?.status, 'activating');
  await next.event('activate');
  const restarted = fixture({windows, stores: next.stores}); restarted.offline();
  const response = await restarted.event('fetch', {clientId: 'late', request: {method: 'GET', url: origin + basePath + 'src/lazy.js'}});
  assert.equal(await response.text(), old.assets.get(basePath + 'src/lazy.js').toString());
  assert.ok(next.stores.has(prefix + OLD));
});

test('an old page missing its resource never receives newer bytes', async () => {
  const {old, next} = await updateFixture();
  assert.equal((await old.message({type: 'CLIENT_VERSION', version: OLD}))?.accepted, true);
  next.stores.get(prefix + OLD).delete(basePath + 'src/lazy.js');
  const response = await next.event('fetch', {clientId: 'a', request: {method: 'GET', url: origin + basePath + 'src/lazy.js'}});
  assert.equal(response.status, 503);
});

test('first install never forces activation or claims a network-loaded document', async () => {
  const first = fixture({windows: [client('first', {silent: true})]});
  await first.event('install'); await first.event('activate');
  assert.deepEqual(first.calls(), {skipCalls: 0, claimCalls: 0});
  assert.equal((await first.message({type: 'VERSION_REQUEST'}))?.version, NEXT);
});

test('an unidentified old document receives a recoverable failure instead of new resources', async () => {
  const {next} = await updateFixture();
  const response = await next.event('fetch', {clientId: 'unknown', request: {method: 'GET', url: origin + basePath + 'src/lazy.js'}});
  assert.equal(response.status, 503);
});

test('an already pinned client cannot change the version of its existing document', async () => {
  const {old, next} = await updateFixture();
  assert.equal((await old.message({type: 'CLIENT_VERSION', version: OLD}))?.accepted, true);
  assert.equal((await next.message({type: 'CLIENT_VERSION', version: NEXT}))?.accepted, false);
  const response = await next.event('fetch', {clientId: 'a', request: {method: 'GET', url: origin + basePath + 'src/lazy.js'}});
  assert.equal(await response.text(), old.assets.get(basePath + 'src/lazy.js').toString());
});

test('an old cached asset removed from the next inventory remains available to its pinned client', async () => {
  const {old, next} = await updateFixture();
  const removed = basePath + 'src/removed.js';
  old.stores.get(prefix + OLD).set(removed, new Response('old-only'));
  await old.message({type: 'CLIENT_VERSION', version: OLD});
  const response = await next.event('fetch', {clientId: 'a', request: {method: 'GET', url: origin + removed}});
  assert.equal(await response.text(), 'old-only');
});

test('coordination that outlives the client interaction lock cancels rather than committing late', async () => {
  let current;
  const {next, windows} = await updateFixture({onList: count => { if (count === 3) current.advanceClock(16000); }});
  current = next;
  assert.equal((await next.message(request))?.status, 'deferred');
  assert.equal(next.calls().skipCalls, 0);
  assert.equal(windows[0].messages.at(-1).type, 'CANCEL_UPDATE');
});

test('a same-scope analytics iframe does not veto top-level window coordination', async () => {
  const frame = {...client('analytics', {silent: true}), frameType: 'nested', url: origin + basePath + 'src/analytics-frame.html'};
  const {next} = await updateFixture({windows: [client('a'), frame]});
  assert.equal((await next.message(request))?.status, 'activating');
  assert.equal(frame.messages.length, 0);
});

test('a cached iframe navigation pins its scripts across worker activation and restart', async () => {
  const {old, next, windows} = await updateFixture();
  windows.push({...client('analytics', {silent: true}), frameType: 'nested', url: origin + basePath + 'src/analytics-frame.html'});
  await old.event('fetch', {resultingClientId: 'analytics', request: {method: 'GET', mode: 'navigate', url: origin + basePath + 'src/analytics-frame.html'}});
  const restarted = fixture({stores: next.stores, windows}); restarted.offline();
  const response = await restarted.event('fetch', {clientId: 'analytics', request: {method: 'GET', url: origin + basePath + 'src/analytics-frame.js'}});
  assert.equal(response.status, 200);
  assert.equal(await response.text(), old.assets.get(basePath + 'src/analytics-frame.js').toString());
});

const DAY = 86400000, ANCIENT = '0000000000000000';
async function gcFixture({windows = [client('a', {version: NEXT})], registration = {}} = {}) {
  const ancient = fixture({version: ANCIENT, windows}); await ancient.event('install');
  const old = fixture({version: OLD, windows, stores: ancient.stores, initialNow: DAY}); await old.event('install');
  const next = fixture({version: NEXT, windows, stores: old.stores, initialNow: 2 * DAY, registration}); await next.event('install');
  next.advanceClock(8 * DAY);
  return {ancient, old, next, windows};
}

test('maintenance retires an expired unreferenced cache but retains current and newest previous builds', async () => {
  const {next} = await gcFixture();
  await next.message({type: 'CLIENT_VERSION', version: NEXT});
  assert.equal(next.stores.has(prefix + ANCIENT), false);
  assert.equal(next.stores.has(prefix + OLD), true);
  assert.equal(next.stores.has(prefix + NEXT), true);
});

test('maintenance retains an ancient build used by a live nested iframe', async () => {
  const {ancient, next, windows} = await gcFixture();
  windows.push({...client('analytics', {silent: true, version: ANCIENT}), frameType: 'nested', url: origin + basePath + 'src/analytics-frame.html'});
  await ancient.event('fetch', {resultingClientId: 'analytics', request: {method: 'GET', mode: 'navigate', url: origin + basePath + 'src/analytics-frame.html'}});
  await next.message({type: 'CLIENT_VERSION', version: NEXT});
  assert.equal(next.stores.has(prefix + ANCIENT), true);
});

test('a recently pinned navigation protects an ancient build before its client becomes enumerable', async () => {
  const {ancient, next} = await gcFixture();
  ancient.advanceClock(10 * DAY);
  await ancient.event('fetch', {resultingClientId: 'still-loading', request: {method: 'GET', mode: 'navigate', url: origin + basePath}});
  await next.message({type: 'CLIENT_VERSION', version: NEXT});
  assert.equal(next.stores.has(prefix + ANCIENT), true);
});

test('an unknown live client makes maintenance defer all asset deletion', async () => {
  const {next, windows} = await gcFixture();
  windows.push(client('unknown', {silent: true}));
  await next.message({type: 'CLIENT_VERSION', version: NEXT});
  assert.equal(next.stores.has(prefix + ANCIENT), true);
});

test('maintenance does not run while another worker is waiting or installing', async () => {
  for (const registration of [{waiting: {}}, {installing: {}}]) {
    const {next} = await gcFixture({registration});
    await next.message({type: 'CLIENT_VERSION', version: NEXT});
    assert.equal(next.stores.has(prefix + ANCIENT), true);
  }
});

test('maintenance removes expired closed-client metadata along with an unreferenced version', async () => {
  const {ancient, next} = await gcFixture();
  await ancient.event('fetch', {resultingClientId: 'closed', request: {method: 'GET', mode: 'navigate', url: origin + basePath}});
  await next.message({type: 'CLIENT_VERSION', version: NEXT});
  const metadata = next.stores.get(prefix + 'clients');
  assert.equal(metadata.has(basePath + '__rally_client__/closed'), false);
  assert.equal(next.stores.has(prefix + ANCIENT), false);
});

test('maintenance retains a live pinned iframe whose URL was removed from the current inventory', async () => {
  const {ancient, next, windows} = await gcFixture();
  const frame = {...client('removed-frame', {silent: true, version: ANCIENT}), frameType: 'nested', url: origin + basePath + 'src/removed-frame.html'};
  windows.push(frame);
  await ancient.message({type: 'CLIENT_VERSION', version: ANCIENT}, frame);
  await next.message({type: 'CLIENT_VERSION', version: NEXT});
  assert.equal(next.stores.has(prefix + ANCIENT), true);
});

test('legacy text pins migrate to dated records with a fresh retention grace period', async () => {
  const {next} = await gcFixture();
  const metadata = next.stores.get(prefix + 'clients'), key = basePath + '__rally_client__/legacy-closed';
  metadata.set(key, new Response(ANCIENT));
  await next.message({type: 'CLIENT_VERSION', version: NEXT});
  const record = JSON.parse(await metadata.get(key).text());
  assert.equal(record.version, ANCIENT);
  assert.equal(record.seenAt, 10 * DAY);
  assert.equal(next.stores.has(prefix + ANCIENT), true);
});

test('maintenance storage failures leave the page binding successful and old resources intact', async () => {
  const {next} = await gcFixture(); next.failDeletion();
  assert.equal((await next.message({type: 'CLIENT_VERSION', version: NEXT}))?.accepted, true);
  assert.equal(next.stores.has(prefix + ANCIENT), true);
});

test('a window becoming busy after the probe cancels the real preparation in every window', async () => {
  const {next, windows} = await updateFixture({windows: [client('a'), client('became-busy', {ready: true, prepareReady: false})]});
  assert.equal((await next.message(request))?.status, 'deferred');
  assert.equal(next.calls().skipCalls, 0);
  for (const window of windows) assert.deepEqual(window.messages.map(x => x.type), ['CHECK_UPDATE_SAFETY', 'PREPARE_UPDATE', 'CANCEL_UPDATE']);
});

test('repeated attempts with a legacy window never prepare or lock a responsive menu', async () => {
  const {next, windows} = await updateFixture({windows: [client('a'), client('legacy', {silent: true})]});
  await next.message(request);
  await next.message({...request, requestId: 'request-2'});
  assert.deepEqual(windows[0].messages.map(x => x.type), ['CHECK_UPDATE_SAFETY', 'CHECK_UPDATE_SAFETY']);
  assert.equal(next.calls().skipCalls, 0);
});

test('the static index.html entry uses the root document cache and pins subsequent modules', async () => {
  const window = {...client('index-entry', {version: NEXT}), url: origin + basePath + 'index.html?room=ABCDE'};
  const current = fixture({windows: [window]}); await current.event('install'); current.offline();
  const document = await current.event('fetch', {resultingClientId: window.id, request: {method: 'GET', mode: 'navigate', url: window.url}});
  assert.equal(document?.status, 200);
  assert.equal(await document.text(), current.assets.get(basePath).toString());
  const module = await current.event('fetch', {clientId: window.id, request: {method: 'GET', url: origin + basePath + 'src/lazy.js'}});
  assert.equal(module.status, 200);
});

test('an index.html game window participates in update coordination', async () => {
  const window = {...client('index-entry'), url: origin + basePath + 'index.html?room=ABCDE'};
  const {next} = await updateFixture({windows: [window]});
  assert.equal((await next.message(request, window))?.status, 'activating');
  assert.deepEqual(window.messages.map(x => x.type), ['CHECK_UPDATE_SAFETY', 'PREPARE_UPDATE', 'COMMIT_UPDATE']);
});

test('an unpinned index.html game document prevents cache retirement until identified', async () => {
  const {next, windows} = await gcFixture();
  windows.push({...client('index-entry', {silent: true}), url: origin + basePath + 'index.html'});
  await next.message({type: 'CLIENT_VERSION', version: NEXT});
  assert.equal(next.stores.has(prefix + ANCIENT), true);
});
