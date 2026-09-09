(() => {
  'use strict';
  const origin = location.origin;
  const allowed = location.protocol === 'https:' && !location.port && (
    location.hostname === 'kaipai-rally.vercel.app' && location.pathname === '/src/analytics-frame.html' ||
    location.hostname === 'zcinta0514.github.io' && location.pathname === '/rally-badminton/src/analytics-frame.html');
  if (!allowed || window.parent === window) return;
  const events = new Set(['ai_start', 'friend_start', 'ai_finish', 'friend_finish']);
  const validId = value => typeof value === 'string' && /^[a-z0-9_-]{8,64}$/i.test(value);
  let started = false, initialized = false;
  const send = (type, extra = {}) => { try { parent.postMessage({ type, ...extra }, origin); } catch {} };

  // autoTrack is isolated to this empty document, which contains no player UI.
  document.addEventListener('load', event => {
    if (started && !initialized && event.target?.id === 'LA_CODELESS' && typeof window.LA?.track === 'function') {
      initialized = true; send('rally-analytics-initialized');
    }
  }, true);
  document.addEventListener('error', event => {
    if (event.target?.id === 'LA_CODELESS') send('rally-analytics-error');
  }, true);
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== origin || !event.data || Array.isArray(event.data)) return;
    const message = event.data;
    if (message.type === 'rally-analytics-init' && !started && validId(message.id) && validId(message.ck)) {
      started = true;
      const script = document.createElement('script');
      script.id = 'LA_COLLECT'; script.charset = 'UTF-8'; script.async = true; script.referrerPolicy = 'no-referrer';
      script.src = 'https://sdk.51.la/js-sdk-pro.min.js';
      script.onload = () => {
        try {
          send('rally-analytics-pageview-started');
          window.LA.init({ id: message.id, ck: message.ck, autoTrack: true, hashMode: false, screenRecord: false });
        }
        catch { send('rally-analytics-error'); }
      };
      script.onerror = () => send('rally-analytics-error');
      document.head.appendChild(script);
    } else if (message.type === 'rally-analytics-event' && initialized && events.has(message.event) &&
      typeof message.requestId === 'string' && /^[a-z0-9_-]{1,64}$/i.test(message.requestId)) {
      try {
        window.LA.track(message.event);
        // This acknowledges SDK acceptance only, not delivery to the provider.
        send('rally-analytics-ack', { requestId: message.requestId });
      } catch { send('rally-analytics-error'); }
    }
  });
  send('rally-analytics-ready');
})();
