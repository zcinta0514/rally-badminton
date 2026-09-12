const VERSION = /^[a-f0-9]{16}$/;
const RELOAD_KEY = 'rally.update.reload.';

export function isUpdateSafe(state) {
  return state.ready === true && state.visible === true && state.mode === 'menu' &&
    !state.state && !state.room && !state.connection && !state.connecting && !state.reconnecting &&
    !state.pendingResult && !state.finale && !state.overlay && !state.editing;
}

function request(worker, message, timeout = 6000) {
  if (!worker) return Promise.resolve(null);
  return new Promise(resolve => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = value => {
      if (settled) return; settled = true;
      clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeout);
    channel.port1.onmessage = event => finish(event.data);
    try { worker.postMessage(message, [channel.port2]); } catch { finish(null); }
  });
}

// Browser lifecycle and game state are kept separate. A waiting worker owns the
// transaction; every window must lock before it can replace their controller.
export function createUpdateClient({ serviceWorker, document: doc = globalThis.document,
  window: win = globalThis.window, storage, version, isSafe = () => false,
  lock = () => {}, unlock = () => {}, reload = () => globalThis.location.reload(),
  now = Date.now, online = () => globalThis.navigator.onLine,
  onStatus = () => {} } = {}) {
  let registration = null, transaction = null, lockTimer = null, disposed = false, suspended = false, reconcileOnReturn = false;
  let lastCheck = -Infinity, lastAttempt = -Infinity, lastInteraction = -Infinity;
  let checking = false, requesting = false, reloading = false, verifying = false;
  const listeners = [];
  const status = (state, target = '', reason = '') => { if (!disposed) onStatus({state,version:target,reason}); };
  const listen = (target, type, fn) => { target?.addEventListener(type, fn); listeners.push(() => target?.removeEventListener(type, fn)); };
  const safe = (allowHidden = false) => !disposed && !suspended && (allowHidden || !doc?.hidden) && now() - lastInteraction >= 2000 && isSafe({allowHidden});
  const rememberable = target => {
    try {
      if (!storage || storage.getItem(RELOAD_KEY + target) === version) return false;
      storage.setItem('rally.update.probe', '1'); storage.removeItem('rally.update.probe'); return true;
    } catch { return false; }
  };
  function release() {
    clearTimeout(lockTimer); lockTimer = null;
    if (transaction) unlock(); transaction = null;
  }
  function expireLock() {
    const target=transaction?.version;
    // Activation or its version reply may arrive late. Releasing input must
    // not discard the need to compare this page with the active worker again.
    reconcileOnReturn=true;lastCheck=-Infinity;release();status('deferred',target,'timeout');
  }
  async function bindVersion() {
    if (!disposed && !suspended && VERSION.test(version || '') && serviceWorker?.controller)
      await request(serviceWorker.controller, {type:'CLIENT_VERSION',version}, 2500);
  }
  async function verifyAndReload() {
    if (!transaction?.committed || reloading || verifying || disposed || suspended) return;
    verifying = true;
    const expected = transaction;
    const queriedController = serviceWorker.controller;
    const answer = await request(queriedController, {type:'VERSION_REQUEST'}, 2500);
    verifying = false;
    if (disposed || suspended || transaction !== expected) return;
    if (answer?.type !== 'VERSION' || answer.version !== expected.version) {
      if (serviceWorker.controller !== queriedController) void verifyAndReload();
      return;
    }
    if (!rememberable(expected.version)) { release(); status('deferred', expected.version, 'storage'); return; }
    try { storage.setItem(RELOAD_KEY + expected.version, version); }
    catch { release(); status('deferred', expected.version, 'storage'); return; }
    reloading = true; clearTimeout(lockTimer);
    status('applying', expected.version);
    reload();
  }
  function onMessage(event) {
    const message = event.data;
    if (!message || !VERSION.test(message.version || '') || !message.transaction) return;
    const waiting = registration?.waiting;
    if (message.type === 'CHECK_UPDATE_SAFETY' || message.type === 'PREPARE_UPDATE') {
      const ready = event.source === waiting && VERSION.test(version || '') &&
        !transaction && !reloading && safe(true) && rememberable(message.version);
      if (ready && message.type === 'PREPARE_UPDATE') {
        transaction = {version:message.version,id:message.transaction,worker:event.source,committed:false};
        try { lock({version:message.version}); }
        catch { release(); event.ports?.[0]?.postMessage({ready:false,version,transaction:message.transaction}); return; }
        lockTimer = setTimeout(expireLock, 15000);
        status('applying', message.version);
      }
      event.ports?.[0]?.postMessage({ready,version,transaction:message.transaction});
      return;
    }
    if (!transaction || event.source !== transaction.worker || message.version !== transaction.version || message.transaction !== transaction.id) return;
    if (message.type === 'CANCEL_UPDATE') { release(); status('deferred', message.version, 'busy'); }
    if (message.type === 'COMMIT_UPDATE') {
      transaction.committed = true;
      // controllerchange may arrive before or after this message.
      void verifyAndReload();
    }
  }
  async function tryActivate({force = false} = {}) {
    if (!registration?.waiting || transaction || requesting || reloading || !safe()) return;
    if (!force && now() - lastAttempt < 15000) return;
    lastAttempt = now(); requesting = true;
    const worker = registration.waiting;
    try {
      const answer = await request(worker, {type:'VERSION_REQUEST'}, 2500);
      if (disposed || suspended || worker !== registration.waiting) return;
      if (!VERSION.test(answer?.version || '') || answer.version === version) return;
      status('available', answer.version);
      if (!safe() || !rememberable(answer.version)) { status('deferred', answer.version, 'busy'); return; }
      const requestId = globalThis.crypto.randomUUID();
      const result = await request(worker, {type:'REQUEST_ACTIVATION',version:answer.version,requestId}, 7000);
      if (result?.status !== 'activating' && !transaction) {
        // Another window may own the transaction we just prepared. A rejection
        // of this window's competing request must not release that shared lock.
        status('deferred', answer.version, result?.reason || 'busy');
      }
    } finally { requesting = false; }
  }
  async function check({force = false} = {}) {
    if (!registration || checking || !online() || !safe() || transaction || reloading) return;
    if (!force && now() - lastCheck < 60000) return;
    checking = true; lastCheck = now();
    try {
      // A document restored from the back-forward cache may have missed the
      // activation handshake. Its pinned old assets are valid until it is idle.
      if (reconcileOnReturn && serviceWorker?.controller) {
        const controller=serviceWorker.controller;
        const answer=await request(controller,{type:'VERSION_REQUEST'},2500);
        if (!safe() || transaction || reloading || controller !== serviceWorker.controller) return;
        if (answer?.type==='VERSION' && VERSION.test(answer.version || '')) {
          if (answer.version !== version) {
            if (!rememberable(answer.version)) return;
            transaction={version:answer.version,id:globalThis.crypto.randomUUID(),worker:controller,committed:true};
            try { lock({version:answer.version}); }
            catch { release(); status('deferred',answer.version,'storage'); return; }
            lockTimer=setTimeout(expireLock,15000);
            await verifyAndReload();
            return;
          }
          reconcileOnReturn=false;
        }
      }
      await registration.update();
      if (registration.waiting) await tryActivate({force});
    } catch { status('error', '', 'network'); }
    finally { checking = false; }
  }
  function setRegistration(value) { registration = value; void bindVersion(); }
  listen(serviceWorker, 'message', onMessage);
  listen(serviceWorker, 'controllerchange', () => {
    if (transaction?.committed) { void verifyAndReload(); return; }
    // The browser can finish activation after our input lock has timed out.
    // Keep using the pinned page until it is idle, then catch up safely.
    reconcileOnReturn=true;lastCheck=-Infinity;void bindVersion();void check();
  });
  listen(doc, 'pointerdown', () => { lastInteraction = now(); });
  listen(doc, 'keydown', () => { lastInteraction = now(); });
  listen(doc, 'input', () => { lastInteraction = now(); });
  listen(doc, 'visibilitychange', () => { if (!doc.hidden) { void bindVersion(); void check(); } });
  listen(win, 'online', () => { void check(); });
  const timer = setInterval(() => {
    if (registration?.waiting) void tryActivate(); else void check();
  }, 4000);
  timer.unref?.();
  function dispose() { disposed = true; clearInterval(timer); release(); for (const remove of listeners) remove(); }
  listen(win, 'pagehide', event => {
    if (!event.persisted) { dispose(); return; }
    suspended=true;release();
  });
  listen(win, 'pageshow', event => {
    if (!event.persisted || disposed) return;
    suspended=false;reconcileOnReturn=true;lastCheck=-Infinity;lastAttempt=-Infinity;
    void bindVersion();void check();
  });
  return {setRegistration,check,tryActivate,dispose,get locked(){return Boolean(transaction);}};
}
