import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleShuttleFlight, horizontalLaunch, timeToShuttleZ, SHUTTLE_FLIGHT } from '../shared/shuttle-flight.js';
import { createMatch, stepMatch } from '../shared/game.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, String(a) + ' != ' + b);

test('quadratic drag agrees with independent small-step numerical integration', () => {
  const ball = { x: 0, y: 3, z: -5, vx: 4, vy: 6, vz: 35 };
  let p = { ...ball }; const dt = 1e-5;
  for (let i = 0; i < 100000; i++) {
    const speed = Math.hypot(p.vx, p.vz);
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.vx -= .2 * speed * p.vx * dt; p.vz -= .2 * speed * p.vz * dt;
  }
  const exact = sampleShuttleFlight(ball, 1);
  assert.ok(Math.hypot(exact.x - p.x, exact.z - p.z) < .001);
  assert.ok(Math.hypot(exact.vx - p.vx, exact.vz - p.vz) < .001);
});

test('split integration and a single step agree for both court ends', () => {
  for (const sign of [-1, 1]) {
    const ball = { x: .3 * sign, y: 4, z: -5 * sign, vx: sign, vy: 5, vz: 24 * sign };
    const exact = sampleShuttleFlight(ball, 1.4); let sliced = { ...ball };
    for (let i = 0; i < 168; i++) sliced = sampleShuttleFlight(sliced, 1 / 120);
    for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz']) near(sliced[key], exact[key]);
    const zero = sampleShuttleFlight({ ...ball, vx: 0, vz: 0 }, .5);
    near(zero.x, ball.x); near(zero.z, ball.z);
  }
});

test('launch solution, exact net timing and deceleration share the same flight', () => {
  const a = { x: -.7, y: 3, z: 5 }, b = { x: 1.3, z: -5.8 }, duration = 1.6;
  const launch = { ...a, ...horizontalLaunch(a, b, duration), vy: 0 };
  const end = sampleShuttleFlight(launch, duration); near(end.x, b.x); near(end.z, b.z);
  const net = sampleShuttleFlight(launch, timeToShuttleZ(launch, 0)); near(net.z, 0);
  assert.ok(Math.hypot(end.vx, end.vz) < Math.hypot(launch.vx, launch.vz) * .2);
  assert.equal(timeToShuttleZ(launch, 6), -1);
  assert.equal(SHUTTLE_FLIGHT.gravity, 9.81);
});

test('a fast rally hit has one exact contact instant without advancing the outgoing ball early', () => {
  const state = createMatch(); state.phase = 'rally';
  Object.assign(state.players[0], { x: 0, z: 3.8 });
  Object.assign(state.shuttle, { x: .1, y: 3.05, z: 3.8, vx: 0, vy: -.2, vz: 1, lastHit: 1, active: true });
  stepMatch(state, [{ shot: 'smash' }, {}], 1 / 120);
  const at = state.players[0].pendingShot.contactAt;
  while (state.time < at - 1e-8) stepMatch(state, [{}, {}], Math.min(1 / 120, at - state.time));
  assert.equal(state.hitId, 1); near(state.lastShotInfo.at, at);
  for (const axis of ['x', 'y', 'z']) near(state.shuttle[axis], state.lastShotInfo.contact[axis]);
  const ball = { ...state.shuttle }; stepMatch(state, [{}, {}], 1 / 120);
  const expected = sampleShuttleFlight(ball, 1 / 120);
  for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz']) near(state.shuttle[key], expected[key]);
});
