import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, getScoringRules, stepMatch, pauseMatch, resumeMatch } from '../shared/game.js';

const advance = (state, seconds) => {
  for (let t = 0; t < seconds; t += 1 / 60) stepMatch(state, [{}, {}], 1 / 60);
};
function landPoint(state, winner) {
  assert.equal(state.phase, 'serve');
  state.phase = 'rally'; state.service.active = false;
  Object.assign(state.shuttle, { x: 0, y: 0.01, z: winner === 0 ? -3 : 3,
    vx: 0, vy: -1, vz: 0, active: true, lastHit: winner });
  const before = state.pointId;
  stepMatch(state);
  assert.equal(state.pointId, before + 1);
  assert.equal(state.rallyEnd.winner, winner);
  assert.equal(state.server, winner);
}
function nextServe(state) {
  assert.equal(state.phase, 'point');
  assert.equal(state.winner, null);
  assert.equal(state.endReason, null);
  advance(state, 1.5);
  assert.equal(state.phase, 'serve');
  assert.equal(state.service.side, state.server);
  assert.equal(state.service.court, state.score[state.server] % 2 ? 'left' : 'right');
  assert.deepEqual(state.games, [0, 0]);
}

test('scoring configuration normalizes targets exactly as match creation does', () => {
  for (const target of [undefined, null, '11', 6, NaN, Infinity]) {
    assert.deepEqual(getScoringRules({ target }), { target: 5, winBy: 2, cap: 10 });
    assert.equal(createMatch({ target }).target, 5);
  }
  assert.deepEqual(getScoringRules({ ruleset: 'standard21', target: 5 }), { target: 21, winBy: 2, cap: 30 });
});

for (const [target, cap] of [[5, 10], [11, 20], [21, 30]]) for (const winner of [0, 1]) {
  const other = 1 - winner;
  test(`${target}-point quick game: side ${winner} must reach the target and lead by two`, () => {
    const state = createMatch({ target });
    landPoint(state, winner);
    nextServe(state);
    landPoint(state, other);
    assert.deepEqual(state.score, [1, 1]);
    nextServe(state);
    state.score[winner] = target - 2; state.score[other] = target - 3;
    landPoint(state, winner);
    nextServe(state); // A two-point lead below the target does not win.
    landPoint(state, winner);
    assert.equal(state.phase, 'over');
    assert.equal(state.winner, winner);
    assert.equal(state.score[winner], target);
    assert.equal(state.endReason, 'scored');
  });

  test(`${target}-point quick game: side ${winner} wins only after extending a deuce lead`, () => {
    const state = createMatch({ target });
    state.score = [target - 1, target - 1];
    landPoint(state, winner);
    nextServe(state);
    landPoint(state, other);
    nextServe(state);
    assert.deepEqual(state.score, [target, target]);
    landPoint(state, winner);
    nextServe(state);
    landPoint(state, winner);
    assert.equal(state.phase, 'over');
    assert.equal(state.winner, winner);
    assert.equal(state.score[winner], target + 2);
    assert.equal(state.score[other], target);
    assert.equal(state.target, target);
    const final = structuredClone(state);
    advance(state, 3);
    assert.deepEqual(state, final);
  });

  test(`${target}-point quick game: repeated ties reach cap ${cap} for side ${winner}`, () => {
    const state = createMatch({ target });
    state.score = [target - 1, target - 1];
    for (let tied = target - 1; tied < cap - 1; tied++) {
      landPoint(state, winner); nextServe(state);
      landPoint(state, other); nextServe(state);
      assert.deepEqual(state.score, [tied + 1, tied + 1]);
      assert.equal(state.target, target);
    }
    landPoint(state, winner);
    assert.equal(state.phase, 'over');
    assert.equal(state.winner, winner);
    assert.equal(state.endReason, 'scored');
    assert.equal(state.score[winner], cap);
    assert.equal(state.score[other], cap - 1);
    assert.equal(state.pointId, 2 * (cap - target) + 1);
    const final = structuredClone(state);
    advance(state, 3);
    assert.deepEqual(state, final);
  });
}

test('pause and resume preserve a deuce rally and its scoring rules', () => {
  const state = createMatch(); state.score = [4, 4];
  landPoint(state, 0);
  assert.equal(pauseMatch(state, 1), true);
  advance(state, 3);
  assert.deepEqual(state.score, [5, 4]);
  assert.equal(resumeMatch(state), true);
  advance(state, 4);
  assert.equal(state.phase, 'serve');
  landPoint(state, 1); nextServe(state);
  assert.deepEqual(state.score, [5, 5]);
});

test('pause timeout at deuce still interrupts rather than forcing extra play', () => {
  for (const score of [[4, 4], [9, 9], [19, 19], [29, 29], [5, 4]]) {
    const target = score[0] > 19 ? 21 : score[0] > 9 ? 11 : 5;
    const state = createMatch({ target }); state.score = [...score];
    pauseMatch(state, 0); advance(state, 30.1);
    assert.equal(state.phase, 'over');
    assert.equal(state.endReason, 'pause-timeout');
    assert.equal(state.winner, score[0] === score[1] ? null : 0);
    assert.deepEqual(state.score, score);
  }
});
