import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createMatch, stepMatch, pauseMatch, finishMatch } from '../shared/game.js';
import { PeerMatch } from '../src/peer-match.js';
import { Rooms } from '../server/rooms.js';

function fallingPoint(state, winner = 0) {
  state.phase = 'rally';
  state.service.active = false;
  Object.assign(state.shuttle, { x: 0, y: 0.01, z: winner === 0 ? -3 : 3,
    vx: 0, vy: -1, vz: 0, active: true, lastHit: winner });
}

function landPoint(state, winner = 0) {
  fallingPoint(state, winner);
  stepMatch(state, [{}, {}], 1 / 60);
  assert.equal(state.rallyEnd.kind, 'in');
  assert.equal(state.rallyEnd.winner, winner);
  assert.equal(state.shuttle.y, 0);
}

test('a new match has no ending reason', () => {
  assert.equal(createMatch().endReason, null);
});

test('the final real landing marks a quick match as scored', () => {
  const state = createMatch({ target: 5 });
  for (let point = 0; point < 5; point++) {
    landPoint(state);
    assert.equal(state.pointId, point + 1);
    if (point < 4) {
      assert.equal(state.phase, 'point');
      assert.equal(state.endReason, null);
    }
  }
  assert.equal(state.phase, 'over');
  assert.equal(state.winner, 0);
  assert.deepEqual(state.score, [5, 0]);
  assert.equal(state.endReason, 'scored');
});

test('a standard game and decider change of ends are not whole-match completion', () => {
  const state = createMatch({ ruleset: 'standard21' });
  state.score = [20, 10];
  landPoint(state);
  assert.equal(state.phase, 'intermission');
  assert.deepEqual(state.games, [1, 0]);
  assert.equal(state.endReason, null);
  assert.equal(state.winner, null);

  state.games = [1, 1]; state.gameNumber = 3; state.score = [10, 8];
  landPoint(state);
  assert.equal(state.phase, 'point');
  assert.equal(state.sideChange.reason, '决胜局 11 分换边');
  assert.equal(state.endReason, null);
  assert.equal(state.winner, null);
});

test('standard completion requires the second game win including deuce', () => {
  const state = createMatch({ ruleset: 'standard21' });
  state.games = [1, 0]; state.gameNumber = 2; state.score = [20, 20];
  landPoint(state);
  assert.equal(state.phase, 'point');
  assert.equal(state.endReason, null);
  landPoint(state);
  assert.equal(state.phase, 'over');
  assert.deepEqual(state.games, [2, 0]);
  assert.deepEqual(state.score, [22, 20]);
  assert.equal(state.endReason, 'scored');
});

test('pause timeout identifies an interrupted result even with a leading winner', () => {
  const state = createMatch(); state.score = [4, 1];
  assert.equal(pauseMatch(state, 1), true);
  stepMatch(state, [{}, {}], 31);
  assert.equal(state.phase, 'over');
  assert.equal(state.winner, 0);
  assert.equal(state.endReason, 'pause-timeout');
});

test('finishMatch defaults to interrupted and cannot overwrite the first ending', () => {
  const state = createMatch();
  finishMatch(state, 1, '结束');
  assert.equal(state.endReason, 'interrupted');
  const first = structuredClone(state);
  assert.equal(finishMatch(state, 0, '覆盖', 'scored'), state);
  assert.deepEqual(state, first);

  const scored = createMatch(); scored.score = [4, 0]; landPoint(scored);
  const final = structuredClone(scored);
  finishMatch(scored, null, '离开', 'quit');
  stepMatch(scored, [{}, {}], 10);
  assert.deepEqual(scored, final);
});

class Socket extends EventEmitter {
  readyState = 1;
  messages = [];
  send(data) { this.messages.push(JSON.parse(data)); }
  ping() { this.emit('pong'); }
  terminate() { this.readyState = 3; this.emit('close'); }
}

function peerFixture(t) {
  let now = 1234;
  const messages = [[], []];
  const match = new PeerMatch({ code: 'ABCDE', host: { name: '甲' }, now: () => now,
    seed: () => 7, send: (slot, message) => messages[slot].push(message) });
  t.after(() => match.close());
  match.announce(); match.join({ name: '乙' });
  return { get state() { return match.state; },
    last(type = 'state', slot = 0) { return messages[slot].findLast(message => message.type === type); },
    receive(slot, message) { match.receive(slot, message); },
    broadcast() { match.broadcast(); },
    advance(ms) { now += ms; match.tick(); },
    disconnect(slot) { match.disconnect(slot); },
  };
}

function wsFixture(t) {
  let now = 1234;
  const rooms = new Rooms({ now: () => now }); clearInterval(rooms.timer);
  t.after(() => rooms.close());
  const connect = () => { const socket = new Socket(); rooms.attach(socket); return rooms.clients.get(socket); };
  const clients = [connect(), connect()];
  rooms.message(clients[0], { type: 'create', name: '甲' });
  const room = clients[0].room;
  rooms.message(clients[1], { type: 'join', name: '乙', code: room.code });
  return { get state() { return room.state; },
    last(type = 'state', slot = 0) { return clients[slot].socket.messages.findLast(message => message.type === type); },
    receive(slot, message) { rooms.message(clients[slot], message); },
    broadcast() { rooms.broadcast(room); },
    advance(ms) { now += ms; rooms.tick(); },
    disconnect(slot) { clients[slot].socket.terminate(); },
    reconnect(slot) {
      const token = room.players[slot].token;
      clients[slot] = connect(); rooms.message(clients[slot], { type: 'resumeSession', token });
    },
    expire() { rooms.remove(room); },
  };
}

for (const [transport, fixture] of [['Peer', peerFixture], ['WS', wsFixture]]) {
  test(`${transport} shares stable room identity and first ending time through broadcasts and rematches`, t => {
    const f = fixture(t);
    const sessionId = f.last('room').sessionId;
    assert.equal(typeof sessionId, 'string');
    assert.ok(sessionId.length >= 16);
    assert.equal(f.last('room', 1).sessionId, sessionId);
    assert.equal(f.last().sessionId, sessionId);
    assert.equal(f.last().matchEndedAt, null);
    assert.equal(f.last().abandoned, false);
    assert.deepEqual(f.last(), f.last('state', 1));

    f.state.score = [4, 0]; fallingPoint(f.state); f.advance(50);
    const first = f.last();
    assert.equal(first.state.phase, 'over');
    assert.equal(first.state.endReason, 'scored');
    assert.equal(first.matchEndedAt, first.serverTime);
    assert.ok(Number.isFinite(first.matchEndedAt));
    assert.deepEqual(first, f.last('state', 1));
    for (let repeat = 0; repeat < 3; repeat++) {
      f.advance(100); f.broadcast();
      assert.ok(f.last().serverTime > first.serverTime);
      assert.equal(f.last().matchEndedAt, first.matchEndedAt);
      assert.equal(f.last().sessionId, sessionId);
      assert.deepEqual(f.last(), f.last('state', 1));
    }
    if (f.reconnect) {
      f.disconnect(1); f.advance(100); f.reconnect(1);
      assert.equal(f.last('room', 1).sessionId, sessionId);
      assert.equal(f.last('state', 1).matchEndedAt, first.matchEndedAt);
      assert.equal(f.last('state', 1).state.endReason, 'scored');
    }
    f.receive(0, { type: 'rematch' }); f.receive(1, { type: 'rematch' });
    assert.equal(f.last().matchId, first.matchId + 1);
    assert.equal(f.last().matchEndedAt, null);
    assert.equal(f.last().state.endReason, null);
    assert.equal(f.last().sessionId, sessionId);
    assert.equal(f.last().state.phase, 'serve');
    assert.deepEqual(f.last(), f.last('state', 1));
    const another = fixture(t);
    assert.notEqual(another.last('room').sessionId, sessionId);
  });

  test(`${transport} preserves a non-scored pause-limit reason despite a winner`, t => {
    const f = fixture(t); f.state.score = [4, 1]; f.state.pause.used[0] = 1;
    f.receive(0, { type: 'suspend' });
    assert.equal(f.last().state.winner, 0);
    assert.equal(f.last().state.endReason, 'pause-limit');
    assert.equal(f.last().matchEndedAt, f.last().serverTime);
    assert.deepEqual(f.last(), f.last('state', 1));
  });

  test(`${transport} reports a voluntary departure as abandoned and quit`, t => {
    const f = fixture(t); f.state.score = [4, 1];
    f.receive(1, { type: 'leave' });
    assert.equal(f.last().state.winner, null);
    assert.equal(f.last().state.endReason, 'quit');
    assert.equal(f.last().abandoned, true);
    assert.equal(f.last().matchEndedAt, f.last().serverTime);
  });
}

test('Peer disconnection ends with disconnect rather than scored', t => {
  const f = peerFixture(t); f.state.score = [4, 1]; f.disconnect(1);
  assert.equal(f.last().state.endReason, 'disconnect');
  assert.equal(f.last().state.winner, null);
  assert.equal(f.last().abandoned, true);
});

test('WS live reconnection retains session identity and no ending timestamp', t => {
  const f = wsFixture(t), sessionId = f.last().sessionId;
  f.disconnect(1); f.advance(100); f.reconnect(1);
  assert.equal(f.last('room', 1).sessionId, sessionId);
  assert.equal(f.last().state.phase, 'paused');
  assert.equal(f.last().state.endReason, null);
  assert.equal(f.last().matchEndedAt, null);
  assert.deepEqual(f.last(), f.last('state', 1));
});

test('WS room closure labels the abandoned match as disconnect', t => {
  const f = wsFixture(t); f.state.score = [4, 1]; f.expire();
  assert.equal(f.last().state.endReason, 'disconnect');
  assert.equal(f.last().state.winner, null);
  assert.equal(f.last().abandoned, true);
});
