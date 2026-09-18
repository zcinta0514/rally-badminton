import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/analytics-frame.js', import.meta.url), 'utf8');
const CONFIG = { id: 'Abcd1234Efgh5678', ck: 'ijkl9012Mnop3456' };

function fixture({ topLevel = false } = {}) {
  const scripts = [], messages = [], events = [], initCalls = [], listeners = new Map(), documentListeners = new Map();
  const parent = { postMessage(data, origin) { messages.push({ data, origin }); } };
  const document = {
    createElement(tag) { assert.equal(tag, 'script'); return {}; },
    head: { appendChild(script) { scripts.push(script); } },
    addEventListener(type, fn, capture) { documentListeners.set(type, fn); assert.equal(capture, true); },
  };
  const window = { parent, addEventListener(type, fn) { listeners.set(type, fn); } };
  if (topLevel) window.parent = window;
  const context = vm.createContext({ window, parent: window.parent, document,
    location: new URL('https://kaipai-rally.vercel.app/src/analytics-frame.html'),
    URL, Set, Object, String,
  });
  vm.runInContext(source, context);
  const receive = (data, from = parent, origin = 'https://kaipai-rally.vercel.app') => listeners.get('message')?.({ data, source: from, origin });
  return { scripts, messages, events, initCalls, receive,
    load() {
      context.LA = window.LA = { init(options) { initCalls.push(options); }, track(name) { events.push(name); } };
      scripts[0].onload();
    },
    codeLoaded(id = 'LA_CODELESS') { documentListeners.get('load')?.({ target: { id } }); },
  };
}

test('frame loads the official SDK and initializes it only once after a trusted parent message', () => {
  const f = fixture();
  assert.deepEqual(f.messages.map(item => item.data.type), ['rally-analytics-ready']);
  f.receive({ type: 'rally-analytics-init', ...CONFIG }, {});
  f.receive({ type: 'rally-analytics-init', ...CONFIG }, undefined, 'https://evil.example');
  f.receive({ type: 'rally-analytics-init', id: '<bad>', ck: CONFIG.ck });
  assert.equal(f.scripts.length, 0);
  f.receive({ type: 'rally-analytics-init', ...CONFIG }); f.receive({ type: 'rally-analytics-init', ...CONFIG });
  assert.equal(f.scripts.length, 1);
  assert.equal(f.scripts[0].src, 'https://sdk.51.la/js-sdk-pro.min.js');
  assert.equal(f.scripts[0].id, 'LA_COLLECT');
  assert.equal(f.scripts[0].referrerPolicy, 'no-referrer');
  f.load();
  assert.deepEqual(JSON.parse(JSON.stringify(f.initCalls)), [{ ...CONFIG, autoTrack: true, hashMode: false, screenRecord: false }]);
  assert.deepEqual(f.messages.map(item => item.data.type), ['rally-analytics-ready', 'rally-analytics-pageview-started']);
  f.codeLoaded('other-script'); assert.equal(f.messages.length, 2);
  f.codeLoaded(); f.codeLoaded();
  assert.deepEqual(f.messages.map(item => item.data.type), ['rally-analytics-ready', 'rally-analytics-pageview-started', 'rally-analytics-initialized']);
});

test('frame forwards only fixed events without attributes and acknowledges SDK acceptance', () => {
  const f = fixture(); f.receive({ type: 'rally-analytics-init', ...CONFIG }); f.load(); f.codeLoaded();
  for (const event of ['ai_start', 'friend_start', 'ai_finish', 'friend_finish',
    'ai_interrupt', 'friend_interrupt', 'network_degraded', 'performance_degraded'])
    f.receive({ type: 'rally-analytics-event', event, requestId: event, data: { nickname: 'secret' } });
  f.receive({ type: 'rally-analytics-event', event: 'nickname=secret', requestId: 'bad' });
  f.receive({ type: 'rally-analytics-event', event: 'ai_start', requestId: 'forged' }, {});
  assert.deepEqual(f.events, ['ai_start', 'friend_start', 'ai_finish', 'friend_finish',
    'ai_interrupt', 'friend_interrupt', 'network_degraded', 'performance_degraded']);
  assert.equal(f.messages.filter(item => item.data.type === 'rally-analytics-ack').length, 8);
  assert.doesNotMatch(JSON.stringify(f.messages), /secret|"data":\{"nickname"/);
});

test('script failure reports a fixed error and standalone frame never loads third-party code', () => {
  const f = fixture(); f.receive({ type: 'rally-analytics-init', ...CONFIG }); f.scripts[0].onerror();
  assert.equal(f.messages.at(-1).data.type, 'rally-analytics-error');
  const alone = fixture({ topLevel: true }); alone.receive({ type: 'rally-analytics-init', ...CONFIG });
  assert.equal(alone.scripts.length, 0); assert.equal(alone.messages.length, 0);
});

test('frame HTML has a fixed empty body and no remote required resource', async () => {
  const html = await readFile(new URL('../src/analytics-frame.html', import.meta.url), 'utf8');
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /<body><\/body>/);
  assert.match(html, /src="\.\/analytics-frame\.js"/);
  assert.doesNotMatch(html, /src="https?:|iframe|input|textarea/);
});
