import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch, stepMatch, ROLES} from '../shared/game.js';

for (const server of [0, 1]) {
  test('free training keeps server ' + server + ' and restores both roles after every point', () => {
    const state = createMatch({trainingServer: server, roles: ['swift', 'power']});
    for (let point = 0; point < 35; point++) {
      assert.equal(state.serverPlayer, server);
      state.phase = 'rally';
      Object.assign(state.shuttle, {active: true, x: 0, y: .01, z: -4, vy: -2, lastHit: 0});
      for (const player of state.players) player.stamina = 1;
      stepMatch(state, [{}, {}], 1/60);
      assert.equal(state.phase, 'point');
      assert.deepEqual(state.score, [point + 1, 0]);
      while (state.phase === 'point') stepMatch(state, [{}, {}], 1/60);
      assert.equal(state.phase, 'serve');
      for (const player of state.players) assert.equal(player.stamina, ROLES[player.role].maxStamina);
    }
  });
}
