const QUEUE_KEY = 'rally.usage.queue.v1';
const DISABLED_KEY = 'rally.usage.disabled.v1';
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_QUEUE = 100;
const EVENTS = {
  ai: { start: 'ai_start', finish: 'ai_finish', interrupt: 'ai_interrupt' },
  online: { start: 'friend_start', finish: 'friend_finish', interrupt: 'friend_interrupt' },
  degraded: { network: 'network_degraded', performance: 'performance_degraded' },
};
const EVENT_NAMES = new Set(Object.values(EVENTS).flatMap(group => Object.values(group)));
const PUBLIC_ID = /^[a-z0-9_-]{8,64}$/i;
const safe = (read, fallback = null) => { try { return read(); } catch { return fallback; } };

function productionPage(location) {
  return safe(() => {
    const url = new URL(location?.href || location);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.searchParams.getAll('preview').includes('athlete')) return null;
    return url.hostname === 'kaipai-rally.vercel.app' && url.pathname === '/' ||
      url.hostname === 'zcinta0514.github.io' && url.pathname === '/rally-badminton/' ? url : null;
  });
}

// 51LA reads top.document.referrer even from its isolated frame. Remove private
// referral paths before loading any vendor code; leave the actual page URL alone.
function protectReferrer(document) {
  return safe(() => {
    const original = document.referrer || '';
    if (!original) return true;
    const origin = safe(() => { const url = new URL(original); return ['http:', 'https:'].includes(url.protocol) ? url.origin : ''; }, '');
    if (original !== origin) safe(() => Object.defineProperty(document, 'referrer', { value: origin, configurable: true }));
    return document.referrer === origin;
  }, false);
}

/** Rough, optional usage counts. SDK code runs only inside a content-free frame. */
export function createUsageAnalytics(options = {}) {
  const config = options.config === undefined ? safe(() => globalThis.RALLY_CONFIG?.analytics) : options.config;
  const page = productionPage(options.location === undefined ? safe(() => globalThis.location) : options.location);
  const id = typeof config?.id === 'string' ? config.id : '', ck = typeof config?.ck === 'string' ? config.ck : '';
  const configured = PUBLIC_ID.test(id) && PUBLIC_ID.test(ck) && !!page;
  const document = options.document === undefined ? safe(() => globalThis.document) : options.document;
  const navigator = options.navigator === undefined ? safe(() => globalThis.navigator) : options.navigator;
  const storage = options.storage === undefined ? safe(() => globalThis.localStorage) : options.storage;
  const eventTarget = options.eventTarget === undefined ? safe(() => globalThis.window) : options.eventTarget;
  const now = options.now || Date.now, setTimer = options.setTimer || globalThis.setTimeout, clearTimer = options.clearTimer || globalThis.clearTimeout;
  const read = key => safe(() => storage?.getItem(key));
  const timestamp = () => Math.floor(now() / 1000);
  const dnt = ['1', 'yes'].includes(String(navigator?.doNotTrack || navigator?.msDoNotTrack || '').toLowerCase());
  let optedOut = read(DISABLED_KEY) === '1', destroyed = false, viewed = false, match = null;
  let queue = [], frame = null, initialized = false, initSent = false, initTimer = null, pending = null, running = null, sequence = 0, blocked = false;
  let pageviewStarted = false, failedAfterPageview = false;
  const enabled = () => configured && !dnt && !optedOut && !destroyed;

  function persist() { safe(() => queue.length ? storage?.setItem(QUEUE_KEY, JSON.stringify(queue)) : storage?.removeItem(QUEUE_KEY)); }
  function prune() {
    const current = timestamp();
    queue = queue.filter(item => item.timestamp >= current - MAX_AGE_SECONDS && item.timestamp <= current + 60).slice(-MAX_QUEUE);
  }
  function stopInitTimer() { if (initTimer !== null) safe(() => clearTimer(initTimer)); initTimer = null; }
  function removeFrame(failed = false) {
    // LA.init already emits a page view. An event-SDK failure must not turn
    // network recovery into another LA.init and count the same page again.
    if (failed && pageviewStarted) failedAfterPageview = true;
    stopInitTimer(); initialized = false; initSent = false;
    if (pending) pending.finish(false);
    safe(() => frame?.remove()); frame = null;
  }
  function createFrame() {
    if (!enabled() || !viewed || frame || failedAfterPageview || navigator?.onLine === false || !protectReferrer(document)) return;
    safe(() => {
      frame = document.createElement('iframe');
      frame.hidden = true; frame.tabIndex = -1; frame.title = '开拍 RALLY 使用统计'; frame.referrerPolicy = 'no-referrer';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin'); frame.setAttribute('aria-hidden', 'true');
      frame.src = new URL('src/analytics-frame.html', page.origin + page.pathname).href;
      initSent = false; initialized = false; blocked = false;
      initTimer = setTimer(() => removeFrame(true), 15000);
      (document.body || document.documentElement).appendChild(frame);
    });
  }
  function sendEvent(event) {
    return new Promise(resolve => {
      const requestId = String(++sequence);
      let timer = null;
      const finish = accepted => {
        if (pending?.requestId !== requestId) return;
        safe(() => clearTimer(timer)); pending = null; resolve(accepted);
      };
      pending = { requestId, finish };
      timer = setTimer(() => finish(false), 5000);
      try { frame.contentWindow.postMessage({ type: 'rally-analytics-event', event, requestId }, page.origin); }
      catch { finish(false); }
    });
  }
  async function transmit() {
    prune(); persist();
    while (enabled() && initialized && !blocked && navigator?.onLine !== false && queue.length) {
      const item = queue[0], accepted = await sendEvent(item.event);
      if (!accepted) { blocked = true; return; }
      const index = queue.indexOf(item);
      if (index >= 0) queue.splice(index, 1);
      persist();
    }
  }
  function flush() {
    if (running) return running;
    if (!enabled() || !initialized || blocked || !queue.length) return Promise.resolve();
    running = transmit().catch(() => {}).finally(() => { running = null; });
    return running;
  }
  function enqueue(event) {
    if (!enabled()) return false;
    queue.push({ site: id, event, timestamp: timestamp() }); prune(); persist(); void flush();
    return true;
  }
  function onMessage(event) {
    if (!enabled() || !frame || event.source !== frame.contentWindow || event.origin !== page.origin || !event.data || Array.isArray(event.data)) return;
    const message = event.data;
    if (message.type === 'rally-analytics-ready' && !initSent) {
      initSent = true;
      try { frame.contentWindow.postMessage({ type: 'rally-analytics-init', id, ck }, page.origin); } catch { removeFrame(true); }
    } else if (message.type === 'rally-analytics-pageview-started' && initSent) {
      pageviewStarted = true;
    } else if (message.type === 'rally-analytics-initialized' && initSent && !initialized) {
      initialized = true; pageviewStarted = true; stopInitTimer(); void flush();
    } else if (message.type === 'rally-analytics-ack' && initialized && message.requestId === pending?.requestId) pending.finish(true);
    else if (message.type === 'rally-analytics-error') removeFrame(true);
  }
  function onOnline() { blocked = false; createFrame(); void flush(); }
  function clearPending() { removeFrame(); queue = []; match = null; persist(); }
  function newOptInSession() { pageviewStarted = false; failedAfterPageview = false; blocked = false; }
  function onStorage(event) {
    if (event.key !== DISABLED_KEY && event.key !== null) return;
    const wasOptedOut = optedOut;
    optedOut = read(DISABLED_KEY) === '1';
    if (wasOptedOut && !optedOut) newOptInSession();
    if (!enabled()) clearPending(); else { createFrame(); void flush(); }
  }
  if (enabled()) {
    const stored = safe(() => JSON.parse(read(QUEUE_KEY)));
    if (Array.isArray(stored)) queue = stored.slice(-MAX_QUEUE)
      .filter(item => item?.site === id && EVENT_NAMES.has(item.event) && Number.isFinite(item.timestamp))
      .map(item => ({ site: id, event: item.event, timestamp: item.timestamp }));
    prune(); persist();
  } else if (dnt || optedOut) persist();
  for (const [type, listener] of [['online', onOnline], ['storage', onStorage], ['message', onMessage]]) safe(() => eventTarget?.addEventListener(type, listener));

  return {
    get configured() { return configured; },
    get enabled() { return enabled(); },
    pageView() { viewed = true; createFrame(); },
    startMatch(mode) {
      match = null;
      const events = EVENTS[mode];
      if (events?.start && enqueue(events.start)) match = { mode, finished: false, degraded: new Set() };
    },
    observeResult(state) {
      if (!match || match.finished || state?.phase !== 'over') return;
      match.finished = true;
      enqueue(state.endReason === 'scored' ? EVENTS[match.mode].finish : EVENTS[match.mode].interrupt);
    },
    endMatch(reason = '') {
      if (match && !match.finished && reason) enqueue(EVENTS[match.mode].interrupt);
      match = null;
    },
    markDegraded(kind) {
      const event = EVENTS.degraded?.[kind];
      if (!match || match.finished || !event || match.degraded.has(kind)) return false;
      match.degraded.add(kind);
      return enqueue(event);
    },
    setEnabled(value) {
      const wasOptedOut = optedOut;
      optedOut = value !== true;
      if (wasOptedOut && !optedOut) newOptInSession();
      safe(() => optedOut ? storage?.setItem(DISABLED_KEY, '1') : storage?.removeItem(DISABLED_KEY));
      if (!enabled()) clearPending(); else { createFrame(); void flush(); }
    },
    flush,
    destroy() {
      destroyed = true; removeFrame(); match = null;
      for (const [type, listener] of [['online', onOnline], ['storage', onStorage], ['message', onMessage]]) safe(() => eventTarget?.removeEventListener(type, listener));
    },
  };
}
