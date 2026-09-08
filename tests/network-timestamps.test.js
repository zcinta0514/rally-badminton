import test from 'node:test';
import assert from 'node:assert/strict';
import { Rooms } from '../server/rooms.js';
import { finishMatch } from '../shared/game.js';

test('room snapshots share monotonic timestamps and sequences, including pause and rematch', t => {
  let now = 0; const rooms = new Rooms({ now: () => now }); clearInterval(rooms.timer); t.after(() => rooms.close());
  const client = () => { const messages = []; return { socket: { readyState: 1, send: raw => messages.push(JSON.parse(raw)) }, room: null, messages }; };
  const a = client(), b = client();
  rooms.message(a, { type: 'create' }); rooms.message(b, { type: 'join', code: a.room.code });
  const states = client => client.messages.filter(message => message.type === 'state');
  const first = states(a).at(-1); assert.ok(Number.isFinite(first.serverTime)); assert.equal(first.seq, 1); assert.equal(first.matchId, 1);
  assert.deepEqual(states(b).at(-1), first, 'both players receive exactly the same frame metadata');
  now = 55; rooms.tick(); const later = states(a).at(-1);
  assert.equal(later.seq, first.seq + 1); assert.ok(Math.abs(later.serverTime - 50) < 1e-6, 'timestamp identifies simulated frame, not send jitter');
  rooms.message(a, { type: 'pause' }); const paused = states(a).at(-1);
  assert.ok(paused.serverTime >= later.serverTime); assert.ok(paused.seq > later.seq);
  now = 105; rooms.tick(); const waiting = states(a).at(-1);
  assert.equal(waiting.state.time, paused.state.time); assert.ok(waiting.serverTime > paused.serverTime);
  finishMatch(a.room.state, null); rooms.message(a, { type: 'rematch' }); rooms.message(b, { type: 'rematch' });
  const rematch = states(a).at(-1); assert.equal(rematch.matchId, 2); assert.ok(rematch.seq > waiting.seq); assert.equal(rematch.state.time, 0);
});
