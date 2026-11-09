import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, predictLanding, pauseMatch, getInterceptAdvice } from '../shared/game.js';
import { sampleShuttleFlight, timeToShuttleZ } from '../shared/shuttle-flight.js';
import { NET_PHYSICS, resolveNetImpact, createNetCloth, applyNetImpact, advanceNetCloth, sampleNetOffset } from '../shared/net-physics.js';
import { makeNetVisual, updateNetVisual } from '../src/net-visual.js';
import { collectArenaSounds } from '../src/arena-audio.js';
import { NetworkPlayback } from '../src/network-playback.js';

function launch(y = 1.1, { x = 0, vz = -7, vy = -.5, side = 0 } = {}) {
  const state = createMatch(); state.phase = 'rally'; state.service.active = false;
  state.hitId = 1; state.rally = 1;
  const sign = side === 0 ? 1 : -1;
  Object.assign(state.shuttle, { x, z: sign * .15, y: 2, vx: 0, vy, vz: sign * vz, lastHit: side, active: true });
  const at = timeToShuttleZ(state.shuttle, 0);
  state.shuttle.y = y - vy * at + 9.81 * at * at / 2;
  return state;
}
const step = (s, time = .05) => stepMatch(s, [{}, {}], time);

test('mesh faults share one bounded impulse with sound and deformation on both sides', () => {
  for (const side of [0, 1]) {
    const s = launch(1.1, { side }); const predicted = predictLanding(s);
    step(s);
    assert.equal(s.pointId, 1); assert.equal(s.score[1 - side], 1);
    assert.equal(s.netContacts.length, 1); assert.equal(s.netContacts[0].netImpact.material, 'mesh');
    assert.deepEqual(s.netContacts[0].netImpact, s.rallyEnd.netImpact);
    assert.ok(Math.abs(predicted.time - s.rallyEnd.at) < 1e-8);
    assert.ok(s.rallyEnd.netImpact.rebound.z * (side === 0 ? 1 : -1) > 0);
    for (let i = 0; i < 15; i++) step(s);
    assert.equal(s.netContactId, 1); assert.equal(s.pointId, 1);
  }
});

test('a top-tape graze continues with reduced energy, then scores at the actual floor', () => {
  for (const side of [0, 1]) {
    const s = launch(1.559, { side, vy: -.8 }); const original = structuredClone(s);
    const predicted = predictLanding(s); assert.equal(predicted.event, 'landing');
    step(s);
    assert.equal(s.phase, 'rally'); assert.deepEqual(s.score, [0, 0]);
    const event = s.netContacts[0]; assert.equal(event.netImpact.material, 'tape');
    assert.equal(event.netImpact.crosses, true);
    assert.ok(Math.hypot(...Object.values(event.netImpact.rebound)) < Math.hypot(event.vx, event.vy, event.vz));
    assert.ok(s.shuttle.z * (side === 0 ? 1 : -1) < 0);
    while (!s.rallyEnd) step(s, 1 / 120);
    assert.ok(Math.abs(s.rallyEnd.at - predicted.time) < 1e-7);
    assert.ok(Math.abs(s.rallyEnd.z - predicted.z) < 1e-7);
    assert.equal(s.netContactId, 1);
    // Subdivision cannot change tape outcome or collision time.
    for (let i = 0; i < 6; i++) step(original, 1 / 120);
    assert.ok(Math.abs(original.shuttle.z - sampleShuttleFlight({ ...event,
      vx: event.netImpact.rebound.x, vy: event.netImpact.rebound.y, vz: event.netImpact.rebound.z }, .05 - event.at).z) < 1e-7);
  }
});

test('lower tape contact returns; clear flight, below-mesh and outside posts produce no phantom ripple', () => {
  const tape = launch(1.515); step(tape); assert.equal(tape.rallyEnd.kind, 'net');
  assert.equal(tape.netContacts[0].netImpact.material, 'tape');
  assert.equal(tape.netContacts[0].netImpact.crosses, false);
  for (const s of [launch(1.58), launch(.6), launch(1.1, { x: 3.3 })]) {
    step(s); assert.equal(s.netContacts.length, 0);
  }
  const under = launch(.6); step(under); assert.equal(under.rallyEnd.kind, 'net');
  assert.equal(under.rallyEnd.netImpact, null);
});

test('net audio is independent of scoring, consumes paused contacts and rejects stale/duplicate packets', () => {
  const s = launch(1.559), memory = {}; collectArenaSounds(s, memory); step(s);
  let sounds = collectArenaSounds(s, memory); assert.equal(sounds.filter(e => e.type === 'net').length, 1);
  assert.equal(sounds.some(e => e.type === 'score'), false);
  assert.equal(sounds.find(e => e.type === 'net').material, 'tape');
  assert.deepEqual(collectArenaSounds(s, memory), []);
  step(s); assert.deepEqual(collectArenaSounds(s, memory), []);
  const late = launch(), freshMemory = {}; collectArenaSounds(late, freshMemory); step(late);
  late.time += 1; assert.equal(collectArenaSounds(late, freshMemory).some(e => e.type === 'net'), false);
  const paused = launch(1.559), pauseMemory = {}; collectArenaSounds(paused, pauseMemory); step(paused);
  pauseMatch(paused, 0); assert.equal(collectArenaSounds(paused, pauseMemory).some(e => e.type === 'net'), false);
  paused.phase = 'rally'; paused.time += .01;
  assert.equal(collectArenaSounds(paused, pauseMemory).some(e => e.type === 'net'), false);
});

test('overlapping waves keep earlier motion; deterministic late history and rewind rebuild the same geometry', () => {
  const first = { id: 1, kind: 'net', at: 1, hitId: 1, x: -.5, y: 1.2, z: 0, vx: 0, vy: -1, vz: -9, hitSide: 0 };
  const second = { ...first, id: 2, hitId: 2, at: 1.12, x: .6, vz: 7, hitSide: 1 };
  const together = createNetCloth(); applyNetImpact(together, first); advanceNetCloth(together, .12);
  const before = together.positions.slice(); applyNetImpact(together, second);
  assert.deepEqual(together.positions, before, 'the second contact cannot reset the existing cloth');
  assert.equal(together.waves.length, 2);
  const incremental = makeNetVisual(), replay = makeNetVisual();
  updateNetVisual(incremental, [first], 1.10); updateNetVisual(incremental, [first, second], 1.3);
  updateNetVisual(replay, [first, second], 1.3);
  assert.deepEqual(incremental.wires.geometry.attributes.position.array, replay.wires.geometry.attributes.position.array);
  updateNetVisual(replay, [first, second], 1.2); updateNetVisual(replay, [first, second], 1.3);
  assert.deepEqual(incremental.wires.geometry.attributes.position.array, replay.wires.geometry.attributes.position.array);
  const b = sampleNetOffset(together, -.5, 1.2); assert.ok(Math.abs(b.z) > .001);
  assert.ok(resolveNetImpact(first));
});

test('20Hz playback reveals the tape graze and changes ball velocity at its exact timestamp', () => {
  const s = launch(1.559); const before = structuredClone(s); step(s);
  const event = s.netContacts[0]; const after = structuredClone(s);
  const player = new NetworkPlayback({ bufferMs: 60, minBufferMs: 60, maxBufferMs: 60 });
  player.receive(before, 100, { serverTime: 0, seq: 1, matchId: 1 });
  player.receive(after, 150, { serverTime: 50, seq: 2, matchId: 1 });
  const get = time => player.sample(time * 1000 + 160);
  const pre = get(event.at - .001); assert.equal(pre.netContacts.length, 0);
  const at = get(event.at); assert.equal(at.netContacts.length, 1); assert.equal(at.pointId, 0);
  assert.ok(Math.abs(at.shuttle.vz - event.netImpact.rebound.z) < 1e-7);
  const post = get(event.at + .003);
  const expected = sampleShuttleFlight({ ...event, vx: event.netImpact.rebound.x,
    vy: event.netImpact.rebound.y, vz: event.netImpact.rebound.z }, .003);
  assert.ok(Math.abs(post.shuttle.z - expected.z) < 1e-7);
  assert.equal(post.phase, 'rally');
});


test('receiver advice uses the slowed post-tape trajectory before the contact arrives', () => {
  const state = launch(1.559);
  const advice = getInterceptAdvice(state, 1);
  assert.equal(advice.status, 'approach'); assert.ok(advice.point.time > .03);
  let remaining = advice.point.time;
  while (remaining > 1e-8) { const dt = Math.min(1 / 120, remaining); step(state, dt); remaining -= dt; }
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(state.shuttle[axis] - advice.point[axis]) < 1e-7, axis);
});
