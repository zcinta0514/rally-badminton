import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../shared/game.js';
import { shotFixture, runReceive, measureMovement } from '../scripts/measure-gameplay-pace.js';

test('high service and rally clears retain height and depth with bounded flight time', () => {
  for (const role of Object.keys(game.ROLES)) for (const serving of [true, false]) {
    const { state, target } = shotFixture(game, { serving, role });
    assert.ok(target.duration >= 1.35 && target.duration <= 1.7, JSON.stringify({ role, serving, duration: target.duration }));
    const apex = state.shuttle.y + Math.max(0, target.vy) ** 2 / (2 * 9.81);
    assert.ok(apex > (serving ? 3.3 : 3.8));
    assert.ok(Math.abs(target.z) > 5.3);
    assert.ok(target.netHeight > game.COURT.netHeight + .25);
    Object.assign(state.shuttle, { vx: target.vx, vy: target.vy, vz: target.vz, active: true, lastHit: 0 });
    if (state.service) state.service.active = serving;
    const expected = game.predictLanding(state);
    assert.equal(expected.event, 'landing');
    assert.equal(expected.out, false);
    assert.equal(!!expected.serviceFault, false);
    state.phase = 'rally';
    for (let tick = 0; tick < 300 && state.phase === 'rally'; tick++) game.stepMatch(state, [{}, {}], 1 / 120);
    assert.ok(Math.abs(state.rallyEnd.z - expected.z) < 1e-7);
    assert.ok(Math.abs(state.rallyEnd.at - expected.time) < 1e-7);
  }
});

test('faster response preserves role top speeds and limits reverse drift', () => {
  for (const role of Object.keys(game.ROLES)) {
    const m = measureMovement(game, role);
    assert.ok(m.fullSpeed < .18);
    assert.ok(m.reverseZero < .15);
    assert.ok(m.reverseFull < .31);
    assert.ok(m.stopDistance < .32);
  }
  assert.deepEqual(Object.values(game.ROLES).map(role => role.speed), [4.6, 5.35, 4.05]);
});

test('a single early release survives the approach to a drop; a late start still loses', () => {
  for (const frame of [1 / 30, 1 / 60, 1 / 120]) for (const side of [0, 1]) {
    const timely = runReceive(game, { frame, side });
    assert.equal(timely.received, true, JSON.stringify(timely));
    assert.ok(timely.quality.risk > .15, 'running and stretching retain control loss');
    const late = runReceive(game, { reaction: .66, pressAt: .9, frame, side });
    assert.equal(late.received, false);
    assert.equal(late.failure, 'not-in-reach');
    assert.equal(late.score[1 - side], 1);
  }
});

test('a positioned defender can buffer one return against an unchanged fast smash', () => {
  for (const frame of [1 / 30, 1 / 60, 1 / 120]) for (const side of [0, 1]) {
    for (const startZ of [3.6, 4.8]) {
      const response = runReceive(game, { type: 'smash', startZ, moving: false, pressAt: 0, frame, side });
      assert.equal(response.received, true, JSON.stringify(response));
      assert.equal(response.player.z, startZ * (side === 0 ? 1 : -1), 'input buffering must not move the defender');
      assert.ok(response.incomingFlight < .62);
    }
    const missed = runReceive(game, { type: 'smash', startZ: 6.3, startX: 2.2, moving: false, pressAt: .24, frame, side });
    assert.equal(missed.received, false);
    assert.equal(missed.failure, 'not-in-reach');
  }
});

test('a last-moment low contact retains control loss and cannot create a strong attack', () => {
  const timely = runReceive(game);
  const scramble = runReceive(game, { reaction: .55, pressAt: .82 });
  assert.equal(scramble.received, true);
  assert.ok(scramble.contactHeight < .35);
  assert.ok(scramble.quality.risk > .65);
  assert.ok(scramble.quality.score < timely.quality.score - .3);
  assert.ok(Math.abs(scramble.returnLanding.z) < Math.abs(timely.returnLanding.z) - 1);
});

test('low-contact tolerance keeps ground, range, half-court and cooldown gates', () => {
  const { state } = shotFixture(game);
  Object.assign(state.shuttle, { y: .24 });
  assert.equal(game.getShotAvailability(state, 0).canHit, true);
  state.shuttle.y = .18;
  assert.equal(game.getShotAvailability(state, 0).canHit, false);
  state.shuttle.y = 1; state.shuttle.x = 1.5;
  assert.equal(game.getShotAvailability(state, 0).reasonCode, 'reach');
  state.shuttle.x = 0; state.shuttle.z = -.1;
  assert.equal(game.getShotAvailability(state, 0).reasonCode, 'half');
  state.shuttle.z = state.players[0].z; state.players[0].cooldown = .1;
  assert.equal(game.getShotAvailability(state, 0).reasonCode, 'cooldown');
});

test('rally movement restarts during follow-through and recovery', () => {
  for (const stage of ['windup', 'followthrough', 'recovery']) {
    const { state } = shotFixture(game);
    const player = state.players[0], origin = player.z;
    player.action = { id: 1, type: 'clear', stage, contactAt: 0, startedAt: 0, endsAt: .5, swingTime: .42 };
    player.cooldown = .3;
    game.stepMatch(state, [{ z: -1 }, {}], 1 / 60);
    assert.ok(player.z < origin);
    assert.ok(player.vz < 0);
  }
});
