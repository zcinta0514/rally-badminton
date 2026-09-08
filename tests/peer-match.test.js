import test from 'node:test';
import assert from 'node:assert/strict';
import { finishMatch, getShotTarget, predictLanding } from '../shared/game.js';
import { PeerMatch } from '../src/peer-match.js';

function fixture(options = {}) {
  assert.equal(typeof PeerMatch, 'function', 'the browser match coordinator is available');
  let now = 0;
  const messages = [[], []];
  const match = new PeerMatch({ code: 'ABCDE', host: { name: '甲', role: 'swift', playerId: 'host-id' },
    target: 5, ruleset: 'quick', sessionId: 'test-session', now: () => now, seed: () => 7,
    send: (slot, message) => messages[slot].push(message), ...options });
  return { match, messages,
    advance(ms) { now += ms; match.tick(); },
    elapse(ms) { now += ms; },
    states(slot = 0) { return messages[slot].filter(message => message.type === 'state'); },
    last(type, slot = 0) { return messages[slot].findLast(message => message.type === type); },
    join() { match.announce(); return match.join({ name: '乙', role: 'power', playerId: 'guest-id' }); },
  };
}

test('waiting room is silent until announced and starts only after the guest joins', () => {
  const f = fixture();
  assert.deepEqual(f.messages, [[], []]);
  f.match.announce();
  assert.equal(f.messages[0].length, 1);
  assert.deepEqual(f.last('room'), { type: 'room', code: 'ABCDE', slot: 0, token: null, target: 5,
    ruleset: 'quick', rules: { finale: 'none' }, sessionId: 'test-session',
    players: [{ name: '甲', role: 'swift', connected: true, playerId: 'host-id' }, null] });
  assert.equal(f.match.state, null);
  assert.equal(f.join(), true);
  assert.equal(f.last('room', 1).slot, 1);
  assert.equal(f.last('state').state.phase, 'serve');
  assert.deepEqual(f.last('state'), f.last('state', 1));
  assert.deepEqual(f.last('state').state.players.map(player => player.role), ['swift', 'power']);
  assert.equal(f.last('state').sessionId, 'test-session');
  assert.equal(f.last('state').leaderboard, null);
  assert.equal(f.last('state').abandoned, false);
});

test('the room rejects a third player and never reuses a departed guest slot', () => {
  const f = fixture(); f.join();
  assert.throws(() => f.match.join({ name: '丙' }), /满|开始/);
  f.match.disconnect(1);
  assert.throws(() => f.match.join({ name: '丙' }), /满|开始|结束/);
});

test('profiles and settings are bounded and never expose a player credential', () => {
  const secret = 'a'.repeat(64);
  const f = fixture({ host: { name: '\u202e\n   ' + '😄'.repeat(20), role: '__proto__', playerKey: secret },
    target: Infinity, ruleset: 'bad' });
  f.join();
  const room = f.last('room');
  assert.equal(room.players[0].name, '😄'.repeat(16));
  assert.equal(room.players[0].role, 'balanced');
  assert.equal(room.players[0].playerId, null);
  assert.equal(room.target, 5); assert.equal(room.ruleset, 'quick');
  assert.equal(JSON.stringify(f.messages).includes(secret), false);
  const standard = fixture({ target: 5, ruleset: 'standard21' }); standard.join();
  assert.equal(standard.last('room').target, 21);
  assert.equal(standard.last('state').state.ruleset, 'standard21');
});

test('a default session id identifies a room uniquely and is stable in its messages', () => {
  const a = fixture({ sessionId: undefined }), b = fixture({ sessionId: undefined });
  a.join(); b.join();
  assert.equal(typeof a.last('room').sessionId, 'string');
  assert.ok(a.last('room').sessionId.length >= 16);
  assert.notEqual(a.last('room').sessionId, b.last('room').sessionId);
  assert.equal(a.last('room').sessionId, a.last('state').sessionId);
});

test('movement is normalized and forged player, score or state fields have no effect', () => {
  const f = fixture(); f.join();
  const initial = structuredClone(f.match.state);
  f.match.receive(0, { type: 'input', x: 999, z: -999, aim: Infinity, aimDepth: -Infinity,
    charge: '1', slot: 1, score: [99, 0], role: 'power', state: { phase: 'over' } });
  f.advance(100);
  assert.deepEqual(f.match.state.score, [0, 0]);
  assert.equal(f.match.state.players[0].role, 'swift');
  assert.equal(f.match.state.players[1].x, initial.players[1].x);
  assert.ok(f.match.state.players[0].x > initial.players[0].x);
  assert.ok(Math.hypot(f.match.state.players[0].vx, f.match.state.players[0].vz) <= 5.2);
  for (const value of Object.values(f.match.inputs[0])) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
});

test('malformed messages and slots cannot operate the match; valid ping echoes only finite time', () => {
  const f = fixture(); f.join();
  const before = structuredClone(f.match.state), count = f.messages.flat().length;
  for (const message of [null, [], 'input', 42, {}, { type: 'unknown' }, { type: 'ping', at: Infinity }]) {
    assert.doesNotThrow(() => f.match.receive(0, message));
  }
  for (const slot of [-1, 2, '0', null, NaN]) f.match.receive(slot, { type: 'pause' });
  assert.deepEqual(f.match.state, before);
  assert.equal(f.messages.flat().length, count);
  f.match.receive(1, { type: 'ping', at: 123 });
  assert.deepEqual(f.last('pong', 1), { type: 'pong', at: 123 });
});

test('stale input is cleared after 250 ms and the player brakes to a stop', () => {
  const f = fixture(); f.join();
  f.match.receive(0, { type: 'input', x: 1 });
  f.advance(100); assert.ok(f.match.state.players[0].vx > 0);
  f.advance(151); f.advance(100);
  assert.equal(f.match.state.players[0].vx, 0);
  const stopped = f.match.state.players[0].x;
  f.advance(100); assert.equal(f.match.state.players[0].x, stopped);
});

test('a queued shot keeps its target and charge through newer movement and preparation packets', () => {
  const f = fixture(); f.join();
  const request = { shot: 'clear', aim: 0.7, aimDepth: -0.85, charge: 0.7 };
  const expected = getShotTarget(f.match.state, 0, request);
  f.match.receive(0, { type: 'input', ...request });
  f.match.receive(0, { type: 'input', x: 1, z: -1, prepare: 'drop', aim: -1, aimDepth: 1, charge: 0 });
  f.advance(100);
  const landing = predictLanding(f.match.state);
  assert.equal(f.match.state.hitId, 1);
  assert.ok(Math.hypot(landing.x - expected.x, landing.z - expected.z) < 1e-8);
  assert.equal(f.match.inputs[0].shot, null);
});

test('shot events are throttled independently of movement and expire with stale inputs', () => {
  const f = fixture(); f.join();
  f.match.receive(0, { type: 'input', shot: 'clear' }); f.advance(20);
  f.match.receive(0, { type: 'input', shot: 'drop', x: -1 });
  assert.equal(f.match.inputs[0].shot, null); assert.equal(f.match.inputs[0].x, -1);
  f.advance(80); f.match.receive(0, { type: 'input', shot: 'drop' });
  assert.equal(f.match.inputs[0].shot, 'drop');
  const stale = fixture(); stale.join();
  stale.match.receive(0, { type: 'input', shot: 'clear' }); stale.advance(251);
  assert.equal(stale.match.state.hitId, 0);
});

test('a scored rally is authoritative and both clients receive the identical score and ending', () => {
  const f = fixture(); f.join();
  f.match.receive(0, { type: 'input', shot: 'clear', charge: 0.5 });
  for (let i = 0; i < 50 && !f.match.state.pointId; i++) f.advance(50);
  assert.equal(f.match.state.pointId, 1);
  assert.deepEqual(f.last('state').state.score, [1, 0]);
  assert.deepEqual(f.last('state'), f.last('state', 1));
});

test('callbacks receive detached room and state messages for each player', () => {
  const seen = [[], []];
  const f = fixture({ send: (slot, message) => {
    seen[slot].push(structuredClone(message));
    if (slot === 0 && message.type === 'state') { message.state.score[0] = 999; message.state.players[0].x = 999; }
    if (slot === 0 && message.type === 'room') message.players[0].name = '破坏';
  } });
  f.join();
  assert.equal(f.match.state.score[0], 0); assert.notEqual(f.match.state.players[0].x, 999);
  assert.equal(seen[1].find(message => message.type === 'room').players[0].name, '甲');
  assert.equal(seen[1].find(message => message.type === 'state').state.score[0], 0);
});

test('pause clears input and requires consent from both players to resume', () => {
  const f = fixture(); f.join();
  f.match.receive(0, { type: 'input', x: 1, shot: 'clear' });
  f.match.receive(1, { type: 'pause' });
  const position = f.match.state.players[0].x;
  f.advance(200);
  assert.equal(f.match.state.phase, 'paused'); assert.equal(f.match.state.players[0].x, position);
  assert.equal(f.match.state.hitId, 0);
  f.match.receive(0, { type: 'resume' }); f.match.receive(0, { type: 'resume' });
  assert.equal(f.match.state.phase, 'paused'); assert.deepEqual(f.last('resumeReady').ready, [0]);
  f.match.receive(1, { type: 'resume' });
  assert.equal(f.match.state.phase, 'countdown');
  for (let i = 0; i < 10; i++) f.advance(200);
  assert.equal(f.match.state.phase, 'serve');
  f.match.receive(1, { type: 'pause' });
  assert.match(f.last('error', 1).message, /用过|不能/);
});

test('suspending during resume keeps the interruption owner and remaining pause budget', () => {
  const f = fixture(); f.join();
  f.match.receive(1, { type: 'suspend' }); f.advance(200);
  const remaining = f.match.state.pause.remaining;
  f.match.receive(0, { type: 'resume' }); f.match.receive(1, { type: 'resume' });
  f.match.receive(0, { type: 'suspend' });
  assert.equal(f.match.state.phase, 'paused'); assert.equal(f.match.state.pause.by, 1);
  assert.equal(f.match.state.pause.remaining, remaining);
  assert.deepEqual(f.match.state.pause.used, [0, 1]);
  assert.deepEqual(f.last('resumeReady').ready, []);
});

test('rematch needs both connected players, resets match state and keeps room identity', () => {
  const f = fixture({ ruleset: 'standard21' }); f.join();
  finishMatch(f.match.state, 0, '完成');
  f.match.receive(0, { type: 'rematch' }); f.match.receive(0, { type: 'rematch' });
  assert.equal(f.match.state.phase, 'over'); assert.deepEqual(f.last('rematch').ready, [0]);
  f.match.receive(1, { type: 'rematch' });
  const state = f.last('state');
  assert.equal(state.matchId, 2); assert.equal(state.state.phase, 'serve');
  assert.equal(state.sessionId, 'test-session'); assert.equal(state.state.target, 21);
  assert.equal(state.abandoned, false);
  assert.deepEqual(state.state.games, [0, 0]); assert.deepEqual(state.state.score, [0, 0]);
});

test('disconnect ends an unfinished match without declaring a winner or accepting further input', () => {
  const f = fixture(); f.join(); f.match.state.score = [4, 0];
  f.match.disconnect(1);
  assert.equal(f.match.state.phase, 'over'); assert.equal(f.match.state.winner, null);
  assert.match(f.match.state.message, /断开|离线|连接/);
  assert.equal(f.last('room').players[1].connected, false);
  assert.equal(f.last('state').leaderboard, null);
  assert.equal(f.last('state').abandoned, true);
  const count = f.messages[1].length;
  f.match.receive(1, { type: 'rematch' }); f.match.receive(0, { type: 'rematch' });
  assert.equal(f.match.state.phase, 'over'); assert.equal(f.messages[1].length, count);
});

test('leaving removes that player and an empty waiting room cannot accept a guest', () => {
  const f = fixture(); f.join();
  f.match.receive(1, { type: 'leave' });
  assert.equal(f.match.state.phase, 'over'); assert.equal(f.match.state.winner, null);
  assert.equal(f.last('room').players[1], null);
  assert.equal(f.last('state').leaderboard, null);
  assert.equal(f.last('state').abandoned, true);
  const waiting = fixture(); waiting.match.announce(); waiting.match.receive(0, { type: 'leave' });
  assert.throws(() => waiting.join(), /房主|关闭|结束/);
});

test('leaving or disconnecting after a completed match preserves its legitimate result', () => {
  for (const exit of [f => f.match.disconnect(1), f => f.match.receive(1, { type: 'leave' })]) {
    const f = fixture(); f.join(); finishMatch(f.match.state, 0, '甲获胜'); exit(f);
    assert.equal(f.match.state.winner, 0); assert.equal(f.match.state.message, '甲获胜');
    assert.equal(f.last('state').abandoned, false);
  }
});

test('a tied pause timeout ends normally instead of being marked abandoned', () => {
  const f = fixture(); f.join();
  f.match.receive(0, { type: 'pause' });
  for (let i = 0; i < 60; i++) f.advance(500);
  assert.equal(f.last('state').state.phase, 'over');
  assert.equal(f.last('state').state.winner, null);
  assert.equal(f.last('state').abandoned, false);
});

test('long host suspension discards elapsed backlog and freezes without moving or scoring', () => {
  const f = fixture(); f.join();
  f.match.receive(0, { type: 'input', shot: 'clear' }); f.advance(100);
  const oldTime = f.match.state.time, oldBall = structuredClone(f.match.state.shuttle);
  f.advance(60 * 60 * 1000);
  assert.equal(f.match.state.phase, 'paused'); assert.equal(f.match.state.time, oldTime);
  assert.deepEqual(f.match.state.shuttle, oldBall); assert.deepEqual(f.match.state.score, [0, 0]);
  assert.equal(f.match.state.pause.remaining, 30);
  f.advance(100); assert.ok(f.match.state.pause.remaining > 29.8);
  assert.ok(f.states().length < 10, 'a resume cannot flood the peer with missed snapshots');
});

test('fixed-step snapshots run at 20 Hz with monotonic sequence and timestamps through pause and rematch', () => {
  const f = fixture(); f.join(); const first = f.last('state');
  for (let i = 0; i < 10; i++) f.advance(5);
  assert.equal(f.states().length, 2); assert.ok(Math.abs(f.last('state').serverTime - 50) < 1e-6);
  f.advance(5); assert.equal(f.states().length, 2);
  f.match.receive(0, { type: 'pause' }); f.advance(50);
  finishMatch(f.match.state, null); f.match.receive(0, { type: 'rematch' }); f.match.receive(1, { type: 'rematch' });
  const frames = f.states();
  assert.equal(first.seq, 1); assert.equal(first.matchId, 1);
  for (let i = 1; i < frames.length; i++) {
    assert.ok(frames[i].seq > frames[i - 1].seq);
    assert.ok(frames[i].serverTime >= frames[i - 1].serverTime);
  }
  assert.equal(frames.at(-1).matchId, 2);
  assert.deepEqual(frames, f.states(1));
});

test('close is idempotent and releases the sender without emitting or accepting further work', () => {
  const f = fixture(); f.join(); const count = f.messages.flat().length;
  f.match.close(); f.match.close(); f.advance(1000); f.match.announce();
  f.match.receive(0, { type: 'ping', at: 1 }); f.match.disconnect(0);
  assert.equal(f.messages.flat().length, count);
  assert.throws(() => f.match.join({}), /关闭|结束/);
});
