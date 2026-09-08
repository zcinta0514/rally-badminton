import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as game from '../shared/game.js';
import { NetworkPlayback } from '../src/network-playback.js';
import { PerformanceMonitor, formatPerformance } from '../src/performance.js';
import { resolveShotAim, toWorldInput } from '../src/play-input.js';
import { createPlayerProfile, normalizePlayerName } from '../src/player-profile.js';
import { createLeaderboard, getLeaderboardURL, resultRecordText } from '../src/leaderboard.js';

const source = (await readFile(new URL('../src/main.js', import.meta.url), 'utf8'))
  .replace(/\r\n/g, '\n').replace(/^import .*;\n/gm, '');

// Execute the full production main loop and its event handlers. Only browser,
// transport, input hardware and GPU/audio boundaries are simulated; match rules,
// playback, UI decisions and the reconnect timer callbacks remain production code.
class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, options = {}) {
    const list = this.listeners.get(type) || [];
    list.push({ fn, once: options.once }); this.listeners.set(type, list);
  }
  emit(type, event = {}) {
    let result;
    for (const listener of [...(this.listeners.get(type) || [])]) {
      if (listener.once) this.listeners.set(type, this.listeners.get(type).filter(item => item !== listener));
      result = listener.fn(event);
    }
    return result;
  }
}

async function fixture(phase = 'serve', {demoMode=false, search=''} = {}) {
  let now = 1000, nextId = 0, frame, controls, view;
  const timers = new Map(), sockets = [], elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const target = Object.assign(new Target(), {
        id, hidden: false, disabled: false, textContent: '', value: '', dataset: {}, style: {},
        classList: { toggle() {} }, setAttribute() {}, querySelectorAll() { return []; },
        children: [], append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; }, focus() { this.focused = true; },
      });
      elements.set(id, target);
    }
    return elements.get(id);
  };
  const dialogs = ['friends-dialog', 'waiting-dialog', 'pause-dialog', 'result-dialog', 'help-dialog', 'leaderboard-dialog'].map(id=>{
    const dialog=element(id);dialog.hidden=true;return dialog;
  });
  const shots = ['clear', 'drop', 'smash'].map(shot => {
    const button = element(shot); button.dataset.shot = shot; return button;
  });
  const document = Object.assign(new Target(), {
    hidden: false, body: { dataset: { screen: 'menu' } }, getElementById: element,
    createElement: tag => element(`generated-${tag}-${++nextId}`),
    querySelector: selector => selector === '[data-shot="smash"]' ? element('smash') : null,
    querySelectorAll: selector => selector === '.dialog' ? dialogs : selector === '.player-dot'
      ? [element('dot-0'), element('dot-1')] : selector === '[data-shot]' ? shots : [],
  });
  class Socket extends Target {
    static OPEN = 1;
    constructor() { super(); this.readyState = 0; this.sent = []; sockets.push(this); }
    open() { this.readyState = 1; this.emit('open'); }
    send(value) { this.sent.push(JSON.parse(value)); }
    message(value) { this.emit('message', { data: JSON.stringify(value) }); }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.emit('close'); }
  }
  class View {
    constructor() { view = this; this.rallyEnding = false; }
    setMode(mode) { this.mode = mode; }
    resize() {}
    setQuality() {}
    getRendererMetrics() { return { pixelRatio: 1, shadows: true, calls: 1 }; }
    render(state, side, dt) { this.drawn = structuredClone(state); this.dt = dt; this.lastPhase = state.phase; }
  }
  class Input {
    constructor() { controls = this; this.enabled = true; }
    reset() {}
    setEnabled(value) { this.enabled = Boolean(value); }
    sample() { return { x: 0, z: 0, prepare: null, charge: 0 }; }
  }
  const context = vm.createContext({
    ...game, NetworkPlayback, PerformanceMonitor, formatPerformance, resolveShotAim, toWorldInput,
    normalizePlayerName, getLeaderboardURL, resultRecordText,
    createPlayerProfile: () => createPlayerProfile({ storage: null, crypto: webcrypto }),
    createLeaderboard: options => createLeaderboard({ ...options, fetchImpl: async () => ({ ok: true, json: async () => ({ entries: [], storage: 'persistent' }) }) }),
    console, structuredClone, URLSearchParams, document, WebSocket: Socket, CourtView: View, Controls: Input, RALLY_CONFIG:{demoMode},
    performance: { now: () => now }, window: Object.assign(new Target(), { devicePixelRatio: 1 }),
    location: { pathname: '/', search, origin: 'http://localhost' }, history: { replaceState() {} },
    ArenaAudio: class { reset() {} unlock() {} update() {} setVisible() {} },
    initPWA: () => ({ setMatchActive() {} }), getWebSocketURL: () => 'ws://localhost/ws',
    bindCameraSettings() {}, ResizeObserver: class { observe() {} },
    requestAnimationFrame(callback) { frame = callback; },
    setTimeout(callback, delay) { timers.set(++nextId, { callback, delay, at: now + delay }); return nextId; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(source, context, { filename: 'src/main.js' });
  assert.equal(typeof frame, 'function', 'the real application must initialize its render loop');
  const click = id => { const target = element(id); if (!target.disabled) return target.emit('click', { target }); };
  const draw = (elapsed = 20) => { now += elapsed; frame(now); };
  if(demoMode)return {element,click,draw,controls,view,document,sockets,visibleDialogs:()=>dialogs.filter(dialog=>!dialog.hidden).map(dialog=>dialog.id)};
  element('player-name').value = '球友A';
  const creating = click('create-room'); sockets.at(-1).open(); await creating;
  const room = { type: 'room', code: 'ABCDE', slot: 0, token: 'original-token',
    players: [{ name: 'A', connected: true }, { name: 'B', connected: true }] };
  const state = game.createMatch(); if (phase === 'paused') game.pauseMatch(state, 0);
  let seq = 0;
  const snapshot = (state, metadata = {}) => sockets.at(-1).message({ type: 'state', state, seq: ++seq, matchId: 1, serverTime: now, ...metadata });
  sockets.at(-1).message(room); snapshot(state); draw();
  function retry() {
    const pending = [...timers].find(([, timer]) => timer.delay === 1200);
    assert.ok(pending, 'disconnect must schedule its actual reconnect callback');
    const [id, timer] = pending; timers.delete(id); now = Math.max(now, timer.at);
    const result = timer.callback(); return { socket: sockets.at(-1), result };
  }
  return { element, click, draw, retry, snapshot, room, state, controls, view, document,
    socket: () => sockets.at(-1), visibleDialogs: () => dialogs.filter(dialog => !dialog.hidden).map(dialog => dialog.id) };
}

test('static demo hides network entry points, ignores room invitations and still runs the AI match', async () => {
  const f=await fixture('serve',{demoMode:true,search:'?room=ABCDE'});
  assert.equal(f.element('open-friends').hidden,true);
  assert.equal(f.element('open-leaderboard').hidden,true);
  assert.match(f.element('menu-intro').textContent,/人机试玩/);
  assert.match(f.element('start-ai').textContent,/免费人机试玩/);
  assert.notEqual(f.visibleDialogs().includes('friends-dialog'),true);
  f.click('open-friends');f.click('open-leaderboard');await f.click('create-room');await f.click('join-room');
  assert.equal(f.sockets.length,0);
  f.click('start-ai');f.draw();
  assert.equal(f.document.body.dataset.screen,'match');
  assert.equal(f.view.drawn.phase,'serve');
  assert.equal(f.element('result-leaderboard').hidden,true);
});

test('online entry sends a private random player identity and prevents blank display names before connecting', async () => {
  const f = await fixture();
  const create = f.socket().sent.find(message => message.type === 'create');
  assert.equal(create.name, '球友A');
  assert.match(create.playerKey, /^[a-f0-9]{64}$/);
  f.click('leave-game');
  f.element('player-name').value = '   ';
  await f.click('create-room');
  assert.match(f.element('toast').textContent, /昵称/);
  assert.equal(f.element('player-name').focused, true);
  assert.equal(f.document.body.dataset.screen, 'menu');
});

test('online results wait for server persistence and closing the leaderboard returns to the result without a dialog loop', async () => {
  const f = await fixture();
  f.state.score = [5, 3]; game.finishMatch(f.state, 0, '比赛结束');
  f.snapshot(f.state, { leaderboard: { status: 'pending' } }); f.draw(200);
  assert.deepEqual(f.visibleDialogs(), ['result-dialog']);
  assert.match(f.element('result-record').textContent, /保存中/);
  f.snapshot(f.state, { leaderboard: { status: 'saved' } }); f.draw(100);
  assert.match(f.element('result-record').textContent, /已计入排行榜/);
  assert.equal(f.element('result-leaderboard').hidden, false);
  f.click('result-leaderboard'); f.draw(100);
  assert.deepEqual(f.visibleDialogs(), ['leaderboard-dialog']);
  f.click('close-leaderboard'); f.draw(100); f.draw(100);
  assert.deepEqual(f.visibleDialogs(), ['result-dialog']);
  f.click('rematch');
  assert.deepEqual(f.socket().sent.at(-1), { type: 'rematch' });
  f.click('result-leaderboard');
  f.snapshot(game.createMatch(), { matchId: 2 }); f.draw(100);
  assert.deepEqual(f.visibleDialogs(), []);
  assert.equal(f.controls.enabled, true);
});

function assertRecovery(f) {
  assert.deepEqual(f.visibleDialogs(), ['pause-dialog']);
  assert.equal(f.element('dialog-backdrop').hidden, false);
  assert.equal(f.element('pause-title').textContent, '连接中断。');
  assert.equal(f.element('resume').disabled, true);
  assert.equal(f.controls.enabled, false);
  assert.equal(f.view.dt, 0, 'a disconnected cosmetic tail must not advance');
}

test('sustained disconnect keeps a local exit available and permits offline AI with its normal pause title', async () => {
  const f = await fixture(); const frozen = structuredClone(f.view.drawn);
  f.socket().close(); f.draw(); assertRecovery(f);
  for (let attempt = 0; attempt < 2; attempt++) {
    const retry = f.retry(); retry.socket.emit('error'); retry.socket.close(); await retry.result;
    f.draw(); assertRecovery(f); assert.deepEqual(f.view.drawn, frozen);
  }
  f.click('pause'); assertRecovery(f);
  f.click('leave-game'); f.draw();
  assert.equal(f.document.body.dataset.screen, 'menu');
  assert.deepEqual(f.visibleDialogs(), []);
  f.click('start-ai'); f.draw();
  assert.equal(f.controls.enabled, true);
  assert.equal(f.element('connection').textContent, '本地练习');
  const offlineSocket = f.socket(); await f.retry().result;
  assert.equal(f.socket(), offlineSocket, 'a queued old retry must not reconnect after leaving for AI');
  f.click('pause'); f.draw();
  assert.deepEqual(f.visibleDialogs(), ['pause-dialog']);
  assert.equal(f.element('pause-title').textContent, '休息一下。');
  assert.equal(f.element('resume').disabled, false);
});

test('an expired recovery token cannot re-enable controls or hide the local exit on subsequent frames', async () => {
  const f = await fixture(); f.socket().close();
  const retry = f.retry(); retry.socket.open(); await retry.result;
  assert.deepEqual(retry.socket.sent.at(-1), { type: 'resumeSession', token: 'original-token' });
  retry.socket.message({ type: 'error', message: '房间恢复时间已过，请重新约战' });
  for (let i = 0; i < 3; i++) { f.draw(100); assertRecovery(f); }
  assert.match(f.element('pause-description').textContent, /房间恢复时间已过/);
  assert.equal(retry.socket.sent.some(message => message.type === 'input'), false);
  f.click('pause'); assertRecovery(f);
  assert.equal(retry.socket.sent.some(message => message.type === 'pause'), false);
  f.click('leave-game'); f.draw();
  assert.equal(f.document.body.dataset.screen, 'menu');
  assert.deepEqual(f.visibleDialogs(), []);
});

for (const phase of ['serve', 'paused']) {
  test(`successful recovery restores the existing ${phase} phase UI after the disconnect panel`, async () => {
    const f = await fixture(phase); f.socket().close(); f.draw(); assertRecovery(f);
    const retry = f.retry(); retry.socket.open(); await retry.result;
    retry.socket.message(f.room); f.snapshot(f.state); f.draw();
    assert.equal(f.view.drawn.phase, phase);
    assert.equal(f.view.dt > 0, true);
    if (phase === 'paused') {
      assert.deepEqual(f.visibleDialogs(), ['pause-dialog']);
      assert.equal(f.element('pause-title').textContent, '休息一下。');
      assert.equal(f.element('resume').disabled, false);
      assert.equal(f.controls.enabled, false);
      f.click('resume'); assert.deepEqual(retry.socket.sent.at(-1), { type: 'resume' });
    } else {
      assert.deepEqual(f.visibleDialogs(), []);
      assert.equal(f.controls.enabled, true);
    }
  });
}
