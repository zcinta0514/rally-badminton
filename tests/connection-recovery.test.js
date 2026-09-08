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
import { MatchFinale } from '../src/match-finale.js';

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

async function fixture(phase = 'serve', {demoMode=false, peerMode=false, search='', pendingPeer=false, slot=0, finaleMode='none'} = {}) {
  let now = 1000, nextId = 0, frame, controls, view, audio;
  const timers = new Map(), sockets = [], elements = new Map(), peerCalls = [], invites = [];
  let resolvePeer;
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
  const dialogs = ['lan-dialog', 'friends-dialog', 'waiting-dialog', 'pause-dialog', 'result-dialog', 'help-dialog', 'leaderboard-dialog'].map(id=>{
    const dialog=element(id);dialog.hidden=true;return dialog;
  });
  const shots = ['clear', 'drop', 'smash'].map(shot => {
    const button = element(shot); button.dataset.shot = shot; return button;
  });
  const friendModes=['none','father-son'].map(finale=>{
    const button=element(`mode-${finale}`);button.dataset.finale=finale;
    button.closest=selector=>selector==='button'?button:null;
    button.attributes={'aria-pressed':String(finale==='none')};
    button.setAttribute=(name,value)=>{button.attributes[name]=value;};
    return button;
  });
  element('friend-modes').querySelectorAll=selector=>selector==='button'?friendModes:[];
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
    constructor() {
      view = this; this.rallyEnding = false; this.crowdResets = 0; this.finaleClears = 0;
      this.finaleAnchors = [{ x: 170, y: 210 }, { x: 830, y: 260 }];
    }
    setMode(mode) { this.mode = mode; }
    resetCrowd() { this.crowdResets++; }
    clearFinale() { this.finaleClears++; this.finale = null; }
    resize() {}
    setQuality() {}
    getRendererMetrics() { return { pixelRatio: 1, shadows: true, calls: 1 }; }
    render(state, side, dt, info) {
      this.drawn = structuredClone(state); this.side = side; this.dt = dt; this.lastPhase = state.phase;
      this.finale = info?.finale ? structuredClone(info.finale) : null;
    }
  }
  class Input {
    constructor() { controls = this; this.enabled = true; }
    reset() {}
    setEnabled(value) { this.enabled = Boolean(value); }
    sample() { return { x: 0, z: 0, prepare: null, charge: 0 }; }
  }
  const context = vm.createContext({
    ...game, MatchFinale, NetworkPlayback, PerformanceMonitor, formatPerformance, resolveShotAim, toWorldInput,
    normalizePlayerName, getLeaderboardURL, resultRecordText,
    createPeerRecords:()=>({publicId:async()=> 'public123abc',record:()=>({status:'local'}),list:()=>({entries:[],storage:'local'})}),
    openPeerRoom:async options=>{
      const session={send:message=>{session.sent.push(message);return true;},close(){session.closed=true;},sent:[],isHost:options.type==='create'};
      peerCalls.push({options,session});
      if(pendingPeer)await new Promise(resolve=>{resolvePeer=resolve;});
      options.onMessage({type:'room',code:'ABCDE',slot:0,sessionId:'test-session',
        rules:{finale:options.type==='create'?options.finale:finaleMode},
        players:[{name:options.name,playerId:options.playerId,connected:true},null]});
      return session;
    },
    createPlayerProfile: () => createPlayerProfile({ storage: null, crypto: webcrypto }),
    createLeaderboard: options => createLeaderboard({ ...options, fetchImpl: async () => ({ ok: true, json: async () => ({ entries: [], storage: 'persistent' }) }) }),
    console, structuredClone, URL, URLSearchParams, AbortController, document, WebSocket: Socket, CourtView: View, Controls: Input, RALLY_CONFIG:{demoMode,peerMode},
    performance: { now: () => now }, window: Object.assign(new Target(), { devicePixelRatio: 1 }),
    location: { pathname: '/rally-badminton/', href:'http://localhost/rally-badminton/'+search, search, origin: 'http://localhost' }, history: { replaceState() {} },
    navigator:{clipboard:{writeText:async value=>invites.push(value)}},
    ArenaAudio: class {
      constructor() { audio = this; this.context = null; this.unlocks = 0; this.finaleCalls = []; this.stoppedVoices = []; }
      reset() {} update() {} setVisible() {} setEnabled() {}
      stopVoices(group) { this.stoppedVoices.push(group); }
      playFinale(key) { this.finaleCalls.push(key); }
      unlock() { this.unlocks++; this.context = { state: 'running' }; }
    },
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
  const common = { element, click, draw, controls, view, audio, document,
    friendModes,chooseFinale:value=>{const button=friendModes.find(item=>item.dataset.finale===value);if(!button.disabled)element('friend-modes').emit('click',{target:button});},
    get now() { return now; }, get liveState() { return vm.runInContext('state', context); },
    visibleDialogs: () => dialogs.filter(dialog => !dialog.hidden).map(dialog => dialog.id) };
  if(demoMode||peerMode)return Object.assign(common,{sockets,peerCalls,invites,resolvePeer:()=>resolvePeer?.()});
  element('player-name').value = '球友A';
  const creating = click('create-room'); sockets.at(-1).open(); await creating;
  const room = { type: 'room', code: 'ABCDE', slot, token: 'original-token', sessionId: 'test-session',
    rules: { finale: finaleMode },
    players: [{ name: '橙子 ID<007>', playerId: 'player-a', connected: true }, { name: '青柠 ID009', playerId: 'player-b', connected: true }] };
  const state = game.createMatch(); if (phase === 'paused') game.pauseMatch(state, 0);
  let seq = 0;
  const snapshot = (state, metadata = {}) => sockets.at(-1).message({ type: 'state', state, seq: ++seq,
    matchId: 1, serverTime: now, sessionId: room.sessionId, matchEndedAt: null, abandoned: false, ...metadata });
  sockets.at(-1).message(room); snapshot(state); draw();
  function retry() {
    const pending = [...timers].find(([, timer]) => timer.delay === 1200);
    assert.ok(pending, 'disconnect must schedule its actual reconnect callback');
    const [id, timer] = pending; timers.delete(id); now = Math.max(now, timer.at);
    const result = timer.callback(); return { socket: sockets.at(-1), result };
  }
  return Object.assign(common, { retry, snapshot, room, state, socket: () => sockets.at(-1) });
}

test('static page explains LAN room codes without pretending to host a room and still runs AI', async () => {
  const f=await fixture('serve',{demoMode:true,search:'?room=ABCDE'});
  assert.equal(f.element('open-friends').hidden,false);
  assert.equal(f.element('open-leaderboard').hidden,true);
  assert.match(f.element('menu-intro').textContent,/局域网/);
  assert.match(f.element('open-friends').textContent,/1V1 说明/);
  assert.notEqual(f.visibleDialogs().includes('friends-dialog'),true);
  f.click('open-friends');f.click('open-leaderboard');await f.click('create-room');await f.click('join-room');
  assert.deepEqual(f.visibleDialogs(),['lan-dialog']);
  assert.equal(f.sockets.length,0);
  f.click('start-ai');f.draw();
  assert.equal(f.document.body.dataset.screen,'match');
  assert.equal(f.view.drawn.phase,'serve');
  assert.equal(f.element('result-leaderboard').hidden,true);
});

test('later touch and keyboard gestures recover interrupted audio while mute remains respected', async () => {
  const f = await fixture('serve', { demoMode: true });
  f.document.emit('pointerdown'); assert.equal(f.audio.unlocks, 1);
  f.document.emit('pointerdown'); assert.equal(f.audio.unlocks, 1, 'running audio is not resumed on every touch');
  f.audio.context.state = 'interrupted'; f.document.emit('pointerdown');
  assert.equal(f.audio.unlocks, 2, 'the initial one-time unlock must not consume later recovery gestures');
  f.audio.context.state = 'suspended'; f.document.emit('keydown'); assert.equal(f.audio.unlocks, 3);
  f.click('sound'); f.audio.context.state = 'interrupted';
  f.document.emit('pointerdown'); f.document.emit('keydown'); assert.equal(f.audio.unlocks, 3);
});

test('an AI rematch starts a fresh crowd epoch even when the screen mode remains match', async () => {
  const f = await fixture('serve', { demoMode: true });
  f.click('start-ai'); f.draw(); assert.equal(f.view.crowdResets, 1);
  f.click('rematch'); f.draw();
  assert.equal(f.view.mode, 'match'); assert.equal(f.view.drawn.pointId, 0);
  assert.equal(f.view.crowdResets, 2, 'each newly entered match resets consumed crowd point IDs');
});

test('static peer page opens the real five-code room flow without a game server or private player key', async () => {
  const f=await fixture('serve',{demoMode:true,peerMode:true,search:'?room=ABCDE'});
  assert.deepEqual(f.visibleDialogs(),['friends-dialog']);
  assert.equal(f.element('room-code').value,'ABCDE');
  f.element('player-name').value='Phone A';
  await f.click('create-room');
  assert.equal(f.sockets.length,0);
  assert.equal(f.peerCalls.length,1);
  assert.equal(f.peerCalls[0].options.name,'Phone A');
  assert.equal(f.peerCalls[0].options.playerId,'public123abc');
  assert.equal('code' in f.peerCalls[0].options,false,'creating never reuses a code from the join input');
  assert.equal('playerKey' in f.peerCalls[0].options,false);
  assert.deepEqual(f.visibleDialogs(),['waiting-dialog']);
  await f.click('copy-invite');
  assert.equal(f.invites[0],'http://localhost/rally-badminton/?room=ABCDE');
  f.click('leave-waiting');
  assert.equal(f.peerCalls[0].session.closed,true);
});

for(const peerMode of [false,true]){
  const transport=peerMode?'Peer':'WebSocket';
  test(`${transport} creation sends the selected father-son mode, locks choices while connecting and resets to ordinary when reopened`,async()=>{
    const f=await fixture('serve',{peerMode});
    if(!peerMode)f.click('leave-game');
    f.click('open-friends');f.element('player-name').value='Mode owner';f.chooseFinale('father-son');
    assert.equal(f.element('mode-father-son').attributes['aria-pressed'],'true');
    let creating=f.click('create-room');
    assert.ok(f.friendModes.every(button=>button.disabled));
    f.chooseFinale('none');
    if(!peerMode)f.socket().open();
    await creating;
    let request=peerMode?f.peerCalls.at(-1).options:f.socket().sent.find(message=>message.type==='create');
    assert.equal(request.finale,'father-son','a disabled choice cannot change the in-flight create request');
    assert.ok(f.friendModes.every(button=>!button.disabled));
    if(!peerMode)f.socket().message({...f.room,rules:{finale:'father-son'}});
    assert.match(f.element('waiting-mode').textContent,/父子局.*不可跳过/);
    f.click('leave-waiting');f.click('open-friends');
    assert.equal(f.element('mode-none').attributes['aria-pressed'],'true');
    assert.equal(f.element('mode-father-son').attributes['aria-pressed'],'false');
    creating=f.click('create-room');if(!peerMode)f.socket().open();await creating;
    request=peerMode?f.peerCalls.at(-1).options:f.socket().sent.find(message=>message.type==='create');
    assert.equal(request.finale,'none','opening the friend dialog starts at ordinary play');
  });

  for(const hostMode of ['none','father-son']){
    test(`${transport} joining ignores the local mode choice and displays the host's ${hostMode} rule`,async()=>{
      const f=await fixture('serve',{peerMode,finaleMode:hostMode});
      if(!peerMode)f.click('leave-game');
      f.click('open-friends');f.element('player-name').value='Mode guest';f.element('room-code').value='ABCDE';
      f.chooseFinale(hostMode==='none'?'father-son':'none');
      const joining=f.click('join-room');if(!peerMode)f.socket().open();await joining;
      const request=peerMode?f.peerCalls.at(-1).options:f.socket().sent.find(message=>message.type==='join');
      assert.equal('finale' in request,false,'the joiner has no authority to choose room mode');
      assert.equal(request.code,'ABCDE');
      if(!peerMode)f.socket().message({...f.room,rules:{finale:hostMode}});
      assert.match(f.element('waiting-mode').textContent,hostMode==='father-son'?/父子局.*不可跳过/:/普通对局.*无赛后互动/);
      if(!peerMode){
        f.snapshot(game.createMatch());f.draw();
        assert.match(f.element('match-label').textContent,hostMode==='father-son'?/父子局/:/普通对局/);
      }
    });
  }
}

test('cancelling a pending peer room cannot open a late room over a new AI match', async () => {
  const f=await fixture('serve',{demoMode:true,peerMode:true,pendingPeer:true});
  f.element('player-name').value='Phone A';
  const creating=f.click('create-room');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.peerCalls.length,1);
  f.click('start-ai');f.draw();
  assert.equal(f.peerCalls[0].options.signal.aborted,true);
  f.resolvePeer();await creating;
  assert.equal(f.document.body.dataset.screen,'match');
  assert.deepEqual(f.visibleDialogs(),[]);
  assert.equal(f.peerCalls[0].session.closed,true);
});

test('online entry sends a private random player identity and prevents blank display names before connecting', async () => {
  const f = await fixture();
  const create = f.socket().sent.find(message => message.type === 'create');
  assert.equal(create.name, '球友A');
  assert.match(create.playerKey, /^[a-f0-9]{64}$/);
  assert.equal(f.element('create-room').disabled,false);
  assert.equal(f.element('join-room').disabled,false);
  f.click('leave-game');
  f.element('player-name').value = '   ';
  await f.click('create-room');
  assert.match(f.element('toast').textContent, /昵称/);
  assert.equal(f.element('player-name').focused, true);
  assert.equal(f.document.body.dataset.screen, 'menu');
});

test('legacy WebSocket creation failure restores both room buttons and shows the connection error', async () => {
  const f=await fixture();f.click('leave-game');
  f.element('player-name').value='Again';const creating=f.click('create-room');
  f.socket().emit('error');await creating;
  assert.match(f.element('toast').textContent,/无法连接/);
  assert.equal(f.element('create-room').disabled,false);
  assert.equal(f.element('join-room').disabled,false);
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

function completeScoredMatch(state, winner = 0) {
  state.score = winner === 0 ? [4, 2] : [2, 4];
  state.phase = 'rally'; state.service.active = false;
  Object.assign(state.shuttle, { x: 0, y: 0.01, z: winner === 0 ? -3 : 3,
    vx: 0, vy: -1, vz: 0, active: true, lastHit: winner });
  game.stepMatch(state, [{}, {}], 1 / 60);
  assert.equal(state.phase, 'over');
  assert.equal(state.endReason, 'scored');
  assert.equal(state.rallyEnd.kind, 'in');
  return state;
}

function assertFinaleLocked(f) {
  assert.equal(f.element('result-dialog').hidden, true, 'result controls stay behind their hidden dialog');
  assert.equal(f.controls.enabled, false, 'a finished match cannot accept court inputs');
  const rematches = f.socket().sent.filter(message => message.type === 'rematch').length;
  f.click('rematch');
  assert.equal(f.socket().sent.filter(message => message.type === 'rematch').length, rematches,
    'even a synthetic click on the hidden rematch button cannot bypass the finale');
}

test('ordinary and legacy rooms go directly from the final shuttle fall to results, including rematches',async()=>{
  for(const rules of [{finale:'none'},{},undefined]){
    const f=await fixture();f.room.rules=rules;f.socket().message(f.room);
    completeScoredMatch(f.state);
    f.view.rallyEnding=true;f.snapshot(f.state,{matchEndedAt:f.now});f.draw(1700);
    assert.equal(f.element('match-finale').hidden,true);
    assert.equal(f.element('result-dialog').hidden,true,'wait for the final shuttle fall');
    f.view.rallyEnding=false;f.draw(0);
    assert.deepEqual(f.visibleDialogs(),['result-dialog']);
    assert.equal(f.view.finale,null);assert.equal(f.audio.finaleCalls.length,0);
    f.click('rematch');const second=game.createMatch();f.snapshot(second,{matchId:2});f.draw(100);
    completeScoredMatch(second,1);f.snapshot(second,{matchId:2,matchEndedAt:f.now});f.draw(1700);
    assert.deepEqual(f.visibleDialogs(),['result-dialog']);
    assert.equal(f.view.finale,null);assert.equal(f.audio.finaleCalls.length,0);
  }
});

for (const side of [0, 1]) for (const winner of [0, 1]) {
  test(`father-son online finale maps winner ${winner} and names correctly for viewer ${side}, then unlocks once`, async () => {
    const f = await fixture('serve', { slot: side, finaleMode: 'father-son' });
    completeScoredMatch(f.state, winner);
    const matchEndedAt = f.now;
    const metadata = { matchEndedAt, leaderboard: { status: 'saved' } };
    f.view.rallyEnding = true;
    f.snapshot(f.state, metadata); f.draw(200);
    assert.equal(f.view.drawn.phase, 'over');
    assert.equal(f.view.finale, null);
    assert.equal(f.element('match-finale').hidden, true);
    assertFinaleLocked(f);

    f.view.rallyEnding = false; f.draw(1000);
    assert.equal(f.view.finale, null, 'the server ending time plus the fall duration has not elapsed');
    assertFinaleLocked(f);
    f.view.rallyEnding = true; f.draw(500);
    assert.equal(f.view.finale, null, 'the actual final shuttle animation must also finish');
    assert.equal(f.audio.finaleCalls.length, 0);
    f.view.rallyEnding = false; f.draw(0);

    assert.equal(f.view.side, side);
    assert.equal(f.view.finale.winner, winner);
    assert.equal(f.view.finale.loser, 1 - winner);
    assert.equal(f.view.finale.age, 0);
    assert.equal(f.document.body.dataset.finale, 'true');
    assert.equal(f.element('match-finale').hidden, false);
    assert.equal(f.element('finale-winner').textContent, `${f.room.players[winner].name} 赢了`);
    for (const index of [0, 1]) {
      assert.equal(f.element(`finale-name-${index}`).textContent, f.room.players[index].name);
      assert.equal(f.element(`finale-role-${index}`).textContent, index === winner ? '胜者' : '败者');
      assert.equal(f.element(`finale-player-${index}`).dataset.result, index === winner ? 'winner' : 'loser');
      assert.equal(f.element(`finale-player-${index}`).style.left, `${f.view.finaleAnchors[index].x}px`);
    }
    assertFinaleLocked(f);
    f.draw(1049);
    assert.equal(f.audio.finaleCalls.length, 0);
    assert.equal(f.element('finale-bubble').hidden, true);
    f.draw(2);
    const key = JSON.stringify([f.room.sessionId, 1]);
    assert.deepEqual(f.audio.finaleCalls, [key]);
    assert.equal(f.element('finale-bubble').hidden, false);
    assert.equal(f.element('finale-bubble').style.left, `${f.view.finaleAnchors[1 - winner].x}px`);
    assertFinaleLocked(f);
    f.draw(1948);
    assertFinaleLocked(f);
    assert.equal(f.element('finale-bubble').hidden, true);
    f.draw(2);
    assert.deepEqual(f.visibleDialogs(), ['result-dialog']);
    assert.equal(f.element('match-finale').hidden, true);
    assert.equal(f.document.body.dataset.finale, undefined);
    assert.equal(f.view.finale, null);
    assert.deepEqual(f.audio.finaleCalls, [key]);
    f.click('rematch');
    assert.deepEqual(f.socket().sent.at(-1), { type: 'rematch' });
    for (let repeat = 0; repeat < 3; repeat++) {
      f.snapshot(f.state, metadata); f.draw(1500);
      assert.deepEqual(f.audio.finaleCalls, [key]);
      assert.equal(f.view.finale, null);
      assert.deepEqual(f.visibleDialogs(), ['result-dialog']);
    }
  });
}

test('a new online matchId permits exactly one new finale after a rematch', async () => {
  const f = await fixture('serve', { finaleMode: 'father-son' });
  completeScoredMatch(f.state);
  f.snapshot(f.state, { matchEndedAt: f.now }); f.draw(1700); f.draw(1100); f.draw(2000);
  assert.equal(f.audio.finaleCalls.length, 1);
  assert.deepEqual(f.visibleDialogs(), ['result-dialog']);
  f.click('rematch');
  const second = game.createMatch();
  f.snapshot(second, { matchId: 2 }); f.draw(100);
  assert.deepEqual(f.visibleDialogs(), []);
  assert.equal(f.controls.enabled, true);
  assert.equal(f.view.finale, null);
  completeScoredMatch(second, 1);
  const endedAt = f.now;
  f.snapshot(second, { matchId: 2, matchEndedAt: endedAt }); f.draw(1700);
  assert.equal(f.view.finale.winner, 1);
  assertFinaleLocked(f);
  f.draw(1100); f.draw(2000);
  assert.deepEqual(f.audio.finaleCalls, [JSON.stringify([f.room.sessionId, 1]), JSON.stringify([f.room.sessionId, 2])]);
  f.snapshot(second, { matchId: 2, matchEndedAt: endedAt }); f.draw(5000);
  assert.equal(f.audio.finaleCalls.length, 2);
  assert.deepEqual(f.visibleDialogs(), ['result-dialog']);
});

for (const voiced of [false, true]) {
  test(`disconnect cancels an ${voiced ? 'already voiced' : 'unvoiced'} finale and reconnect never replays it`, async () => {
    const f = await fixture('serve', { finaleMode: 'father-son' });
    completeScoredMatch(f.state);
    const metadata = { matchEndedAt: f.now };
    f.snapshot(f.state, metadata); f.draw(1700);
    assert.ok(f.view.finale);
    if (voiced) f.draw(1100);
    const calls = [...f.audio.finaleCalls], stops = f.audio.stoppedVoices.length, clears = f.view.finaleClears;
    f.socket().close(); f.draw(100);
    assert.equal(f.view.finale, null);
    assert.equal(f.element('match-finale').hidden, true);
    assert.equal(f.audio.stoppedVoices.length, stops + 1);
    assert.equal(f.audio.stoppedVoices.at(-1), 'finale');
    assert.equal(f.view.finaleClears, clears + 1);
    assertRecovery(f);
    const retry = f.retry(); retry.socket.open(); await retry.result;
    retry.socket.message(f.room); f.snapshot(f.state, metadata); f.draw(200);
    assert.deepEqual(f.visibleDialogs(), ['result-dialog']);
    for (let repeat = 0; repeat < 3; repeat++) {
      f.snapshot(f.state, metadata); f.draw(1600);
      assert.equal(f.view.finale, null);
      assert.equal(f.element('match-finale').hidden, true);
      assert.deepEqual(f.audio.finaleCalls, calls);
    }
  });
}

test('interrupted, abandoned and unidentified online endings do not run the finale', async () => {
  const endings = ['interrupted', 'pause-timeout', 'pause-limit', 'quit', 'disconnect'];
  for (const endReason of endings) {
    const f = await fixture('serve', { finaleMode: 'father-son' }); f.state.score = [4, 1];
    game.finishMatch(f.state, 0, '非正常结束', endReason);
    f.snapshot(f.state, { matchEndedAt: f.now }); f.draw(200); f.draw(5000);
    assert.deepEqual(f.visibleDialogs(), ['result-dialog'], endReason);
    assert.equal(f.element('match-finale').hidden, true, endReason);
    assert.equal(f.view.finale, null, endReason);
    assert.equal(f.audio.finaleCalls.length, 0, endReason);
  }
  for (const invalid of [{ abandoned: true }, { sessionId: null }, { matchEndedAt: null }]) {
    const f = await fixture('serve', { finaleMode: 'father-son' }); completeScoredMatch(f.state);
    f.snapshot(f.state, { matchEndedAt: f.now, ...invalid }); f.draw(200); f.draw(5000);
    assert.deepEqual(f.visibleDialogs(), ['result-dialog']);
    assert.equal(f.view.finale, null);
    assert.equal(f.audio.finaleCalls.length, 0);
  }
});

test('a scored AI match goes directly to results without IDs, bow or voice', async () => {
  const f = await fixture('serve', { demoMode: true });
  f.click('start-ai'); f.draw();
  completeScoredMatch(f.liveState, 1); f.draw(200); f.draw(5000);
  assert.equal(f.view.drawn.endReason, 'scored');
  assert.deepEqual(f.visibleDialogs(), ['result-dialog']);
  assert.equal(f.element('match-finale').hidden, true);
  assert.equal(f.view.finale, null);
  assert.equal(f.audio.finaleCalls.length, 0);
});

test('an opponent disconnect stops an already playing finale voice on the still-connected client',async()=>{
  const f=await fixture('serve',{finaleMode:'father-son'});completeScoredMatch(f.state);
  const metadata={matchEndedAt:f.now};f.snapshot(f.state,metadata);f.draw(1700);f.draw(1100);
  assert.equal(f.audio.finaleCalls.length,1);const stopped=f.audio.stoppedVoices.length;
  f.socket().message({...f.room,players:[f.room.players[0],{...f.room.players[1],connected:false}]});
  f.snapshot(f.state,metadata);f.draw(20);
  assert.equal(f.element('match-finale').hidden,true);
  assert.ok(f.audio.stoppedVoices.length>stopped,'remote disconnect must stop the active voice');
  assert.equal(f.audio.stoppedVoices.at(-1),'finale');
});
