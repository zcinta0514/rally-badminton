import test from 'node:test';
import assert from 'node:assert/strict';
import { createUsageAnalytics } from '../src/analytics.js';

const CONFIG = { id: 'Abcd1234Efgh5678', ck: 'ijkl9012Mnop3456' };
const QUEUE_KEY = 'rally.usage.queue.v1';
const DISABLED_KEY = 'rally.usage.disabled.v1';

function fixture(t, options = {}) {
  const values = options.values || new Map(), frames = [], messages = [], timers = new Map(), listeners = new Map();
  let clock = 1788998400000, timerId = 0;
  const location = options.location || new URL('https://kaipai-rally.vercel.app/?room=ABCDE#secret');
  const navigator = { onLine: true, ...options.navigator };
  const eventTarget = {
    addEventListener(type, listener) { (listeners.get(type) || listeners.set(type, new Set()).get(type)).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
  };
  const emit = (type, event = {}) => { for (const listener of listeners.get(type) || []) listener(event); };
  const storage = options.storage === undefined ? {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
  } : options.storage;
  const document = options.document === undefined ? {
    referrer: 'https://example.com/private?room=FGHIJ#nickname',
    createElement(tag) {
      assert.equal(tag, 'iframe');
      const frame = { attrs: {}, hidden: false, removed: false,
        setAttribute(key, value) { this.attrs[key] = value; },
        remove() { this.removed = true; },
        contentWindow: { postMessage(message, origin) {
          messages.push({ message, origin });
          if (message.type === 'rally-analytics-event' && options.autoAck !== false)
            emit('message', { source: frame.contentWindow, origin: location.origin, data: { type: 'rally-analytics-ack', requestId: message.requestId } });
        } },
      };
      return frame;
    },
    body: { appendChild(frame) { frames.push(frame); } },
  } : options.document;
  const analytics = createUsageAnalytics({ config: CONFIG, location, document, navigator, storage, eventTarget,
    now: () => clock,
    setTimer: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimer: id => timers.delete(id), ...options, location, document, navigator, storage,
  });
  t.after(() => analytics.destroy());
  const receive = (data, source = frames.at(-1)?.contentWindow, origin = location.origin) => emit('message', { source, origin, data });
  return { analytics, document, values, frames, messages, navigator, timers, receive, emit,
    initialize() { analytics.pageView(); receive({ type: 'rally-analytics-ready' }); receive({ type: 'rally-analytics-pageview-started' }); receive({ type: 'rally-analytics-initialized' }); },
    events() { return messages.filter(item => item.message.type === 'rally-analytics-event').map(item => item.message.event); },
    advance(ms) { clock += ms; },
    runTimer(delay) { const next = [...timers].find(([, timer]) => timer.delay === delay); assert.ok(next, `timer ${delay} exists`); timers.delete(next[0]); next[1].callback(); },
  };
}

test('one isolated frame initializes one page view and removes invitation and referrer details', async t => {
  const f = fixture(t);
  assert.equal(f.analytics.configured, true); assert.equal(f.analytics.enabled, true);
  f.initialize(); f.analytics.pageView(); f.receive({ type: 'rally-analytics-ready' });
  assert.equal(f.frames.length, 1);
  const frame = f.frames[0];
  assert.equal(frame.src, 'https://kaipai-rally.vercel.app/src/analytics-frame.html');
  assert.equal(frame.hidden, true); assert.equal(frame.referrerPolicy, 'no-referrer');
  assert.equal(frame.attrs.sandbox, 'allow-scripts allow-same-origin');
  assert.equal(f.document.referrer, 'https://example.com');
  assert.deepEqual(f.messages, [{ message: { type: 'rally-analytics-init', ...CONFIG }, origin: 'https://kaipai-rally.vercel.app' }]);
  assert.doesNotMatch(JSON.stringify(f.messages), /ABCDE|FGHIJ|nickname|secret|"url"|"attributes"/);
});

test('match events count starts, scored completion and fixed interruption events without attributes', async t => {
  const f = fixture(t); f.initialize();
  f.analytics.observeResult({ phase: 'over', endReason: 'scored' });
  f.analytics.startMatch('ai');
  f.analytics.observeResult({ phase: 'intermission', endReason: null });
  f.analytics.observeResult({ phase: 'over', endReason: 'scored', players: [{ name: '秘密昵称' }], room: 'ABCDE' });
  f.analytics.observeResult({ phase: 'over', endReason: 'scored' });
  f.analytics.startMatch('online'); f.analytics.observeResult({ phase: 'over', endReason: 'scored' });
  f.analytics.startMatch('ai'); f.analytics.endMatch(); f.analytics.observeResult({ phase: 'over', endReason: 'scored' });
  f.analytics.startMatch('menu'); await f.analytics.flush();
  assert.deepEqual(f.events(), ['ai_start', 'ai_finish', 'friend_start', 'friend_finish', 'ai_start']);
  assert.doesNotMatch(JSON.stringify(f.messages), /秘密昵称|ABCDE|"players"|"room"|"data"|"timestamp"/);
});

test('interrupted endings emit one fixed interruption event even when there is a winner', async t => {
  const f = fixture(t); f.initialize();
  for (const endReason of ['quit', 'disconnect', 'pause-timeout', 'pause-limit', 'interrupted', null]) {
    f.analytics.startMatch('ai'); f.analytics.observeResult({ phase: 'over', winner: 0, endReason });
  }
  await f.analytics.flush(); assert.deepEqual(f.events(), [
    'ai_start', 'ai_interrupt', 'ai_start', 'ai_interrupt', 'ai_start', 'ai_interrupt',
    'ai_start', 'ai_interrupt', 'ai_start', 'ai_interrupt', 'ai_start', 'ai_interrupt',
  ]);
});

test('explicit exits and quality degradation are bounded to one event per match', async t => {
  const f = fixture(t); f.initialize();
  f.analytics.startMatch('ai');
  assert.equal(f.analytics.markDegraded('performance'), true);
  assert.equal(f.analytics.markDegraded('performance'), false);
  assert.equal(f.analytics.markDegraded('network'), true);
  f.analytics.endMatch('quit');
  f.analytics.startMatch('online');
  f.analytics.endMatch();
  await f.analytics.flush();
  assert.deepEqual(f.events(), ['ai_start', 'performance_degraded', 'network_degraded', 'ai_interrupt', 'friend_start']);
});

test('only exact production HTTPS paths with valid public IDs enable collection', async t => {
  for (const url of ['https://kaipai-rally.vercel.app/', 'https://zcinta0514.github.io/rally-badminton/?room=ABCDE']) {
    const f = fixture(t, { location: new URL(url) }); f.analytics.pageView();
    assert.equal(f.analytics.enabled, true, url);
    assert.equal(f.frames.length, 1);
    assert.ok(f.frames[0].src.endsWith(new URL(url).pathname + 'src/analytics-frame.html'));
  }
  for (const url of ['http://kaipai-rally.vercel.app/', 'http://localhost:3000/',
    'https://kaipai-rally-git-feature.vercel.app/', 'https://zcinta0514.github.io/',
    'https://zcinta0514.github.io/another-game/', 'https://kaipai-rally.vercel.app/private/',
    'https://kaipai-rally.vercel.app/?preview=athlete', 'https://kaipai-rally.vercel.app:8443/',
    'https://kaipai-rally.vercel.app.evil.example/']) {
    const f = fixture(t, { location: new URL(url) }); f.analytics.pageView();
    assert.equal(f.analytics.configured, false, url); assert.equal(f.frames.length, 0, url);
  }
  for (const config of [null, {}, { id: '', ck: '' }, { id: 'short', ck: CONFIG.ck }, { id: CONFIG.id, ck: 'bad?query' }]) {
    const f = fixture(t, { config }); f.analytics.setEnabled(true); f.analytics.pageView();
    assert.equal(f.analytics.configured, false); assert.equal(f.frames.length, 0);
  }
});

test('unmodifiable private referrer prevents the third-party SDK from loading', async t => {
  const f = fixture(t);
  Object.defineProperty(f.document, 'referrer', { value: 'https://example.com/private?room=ABCDE', configurable: false });
  assert.doesNotThrow(() => f.analytics.pageView());
  assert.equal(f.frames.length, 0); assert.equal(f.messages.length, 0);
});

test('messages from other windows and origins cannot initialize or acknowledge events', async t => {
  const f = fixture(t, { autoAck: false }); f.analytics.pageView();
  f.receive({ type: 'rally-analytics-ready' }, {}, 'https://kaipai-rally.vercel.app');
  f.receive({ type: 'rally-analytics-ready' }, f.frames[0].contentWindow, 'https://evil.example');
  assert.equal(f.messages.length, 0);
  f.receive({ type: 'rally-analytics-ready' }); f.receive({ type: 'rally-analytics-initialized' });
  f.analytics.startMatch('ai'); const pending = f.analytics.flush();
  const sent = f.messages.find(item => item.message.type === 'rally-analytics-event').message;
  f.receive({ type: 'rally-analytics-ack', requestId: sent.requestId }, {});
  f.receive({ type: 'rally-analytics-ack', requestId: 'wrong' });
  assert.equal(JSON.parse(f.values.get(QUEUE_KEY)).length, 1);
  f.receive({ type: 'rally-analytics-ack', requestId: sent.requestId }); await pending;
  assert.equal(f.values.has(QUEUE_KEY), false);
});

test('offline events survive reload, stay bounded and expire after seven days', async t => {
  const values = new Map(), first = fixture(t, { values, navigator: { onLine: false } });
  first.analytics.pageView();
  for (let index = 0; index < 120; index++) first.analytics.startMatch('ai');
  assert.equal(first.frames.length, 0); assert.equal(JSON.parse(values.get(QUEUE_KEY)).length, 100);
  first.analytics.destroy();
  const next = fixture(t, { values }); next.initialize(); await next.analytics.flush();
  assert.equal(next.events().length, 100); assert.equal(values.has(QUEUE_KEY), false);
  next.navigator.onLine = false; next.analytics.startMatch('online');
  next.advance(8 * 24 * 60 * 60 * 1000); next.navigator.onLine = true;
  await next.analytics.flush(); assert.equal(next.events().length, 100);
});

test('initialization failure retries only on explicit online or page view, without a PV loop', async t => {
  const f = fixture(t); f.analytics.pageView(); f.analytics.startMatch('ai');
  f.runTimer(15000);
  assert.equal(f.frames[0].removed, true); assert.equal(f.timers.size, 0);
  await f.analytics.flush(); assert.equal(f.frames.length, 1);
  f.emit('online'); assert.equal(f.frames.length, 2);
  f.receive({ type: 'rally-analytics-ready' }); f.receive({ type: 'rally-analytics-initialized' });
  await f.analytics.flush(); assert.deepEqual(f.events(), ['ai_start']);
  f.emit('online'); f.analytics.pageView(); assert.equal(f.frames.length, 2);
});

test('missing SDK acknowledgment retains the event without a repeated initialization loop', async t => {
  const f = fixture(t, { autoAck: false }); f.initialize(); f.analytics.startMatch('ai');
  const pending = f.analytics.flush(); f.runTimer(5000); await pending;
  assert.equal(JSON.parse(f.values.get(QUEUE_KEY)).length, 1);
  assert.equal(f.timers.size, 0); assert.equal(f.frames.length, 1);
});

test('opt-out removes iframe, clears events and respects other tabs and Do Not Track', async t => {
  const f = fixture(t, { autoAck: false }); f.initialize(); f.analytics.startMatch('ai');
  const pending = f.analytics.flush(); f.analytics.setEnabled(false); await pending;
  assert.equal(f.analytics.enabled, false); assert.equal(f.frames[0].removed, true);
  assert.equal(f.values.has(QUEUE_KEY), false); assert.equal(f.values.get(DISABLED_KEY), '1');
  assert.equal(f.timers.size, 0);
  const next = fixture(t, { values: f.values }); next.analytics.pageView(); assert.equal(next.frames.length, 0);
  next.analytics.setEnabled(true); assert.equal(next.frames.length, 1);
  next.values.set(DISABLED_KEY, '1'); next.emit('storage', { key: DISABLED_KEY, newValue: '1' });
  assert.equal(next.frames[0].removed, true); assert.equal(next.analytics.enabled, false);
  for (const doNotTrack of ['1', 'yes']) {
    const dnt = fixture(t, { navigator: { doNotTrack } }); dnt.analytics.setEnabled(true); dnt.analytics.pageView();
    assert.equal(dnt.analytics.enabled, false); assert.equal(dnt.frames.length, 0);
  }
});

test('denied storage and absent document cannot throw into the game', async t => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
  const f = fixture(t, { storage: denied }); f.initialize();
  assert.doesNotThrow(() => { f.analytics.startMatch('ai'); f.analytics.observeResult({ phase: 'over', endReason: 'scored' }); });
  await assert.doesNotReject(f.analytics.flush()); assert.deepEqual(f.events(), ['ai_start', 'ai_finish']);
  const missing = fixture(t, { storage: null, document: null });
  assert.doesNotThrow(() => { missing.analytics.pageView(); missing.analytics.startMatch('ai'); missing.analytics.setEnabled(false); missing.analytics.destroy(); });
  await assert.doesNotReject(missing.analytics.flush());
});

for (const failure of ['error', 'timeout']) test(`a ${failure} after pageview initialization cannot repeat the pageview in this page`, async t => {
  const values = new Map(), f = fixture(t, { values });
  f.analytics.pageView(); f.analytics.startMatch('ai');
  f.receive({ type: 'rally-analytics-ready' }); f.receive({ type: 'rally-analytics-pageview-started' });
  if (failure === 'error') f.receive({ type: 'rally-analytics-error' }); else f.runTimer(15000);
  assert.equal(f.frames[0].removed, true); assert.equal(f.timers.size, 0);
  f.emit('online'); f.analytics.pageView(); f.analytics.setEnabled(true); await f.analytics.flush();
  assert.equal(f.frames.length, 1, 'network recovery and repeated pageView cannot create a second pageview');
  assert.equal(JSON.parse(values.get(QUEUE_KEY)).length, 1);
  f.analytics.destroy();
  const next = fixture(t, { values }); next.initialize(); await next.analytics.flush();
  assert.deepEqual(next.events(), ['ai_start']);
  assert.equal(values.has(QUEUE_KEY), false);
});

test('an SDK error after successful initialization also locks network retries, but explicit opt-in starts a new session', async t => {
  const f = fixture(t); f.initialize();
  f.receive({ type: 'rally-analytics-error' }); f.emit('online'); f.analytics.pageView();
  assert.equal(f.frames.length, 1);
  f.analytics.setEnabled(false); f.analytics.setEnabled(true);
  assert.equal(f.analytics.enabled, true); assert.equal(f.frames.length, 2);
  f.receive({ type: 'rally-analytics-ready' }); f.receive({ type: 'rally-analytics-pageview-started' });
  f.receive({ type: 'rally-analytics-initialized' });
  f.analytics.startMatch('online'); await f.analytics.flush();
  assert.deepEqual(f.events(), ['friend_start']);
});
