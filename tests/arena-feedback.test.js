import test from 'node:test';
import assert from 'node:assert/strict';
import * as feedback from '../src/arena-feedback.js';

const point = (changes = {}) => ({ lastShot: 'smash', rally: 2,
  rallyEnd: { kind: 'in', winner: 0, hitSide: 0 }, ...changes });

test('crowd excitement follows successful attacking landings, not the selected shot alone', () => {
  assert.equal(typeof feedback.isExcitingPoint, 'function');
  assert.equal(feedback.isExcitingPoint(point()), true);
  for (const kind of ['net', 'out', 'serviceFault']) {
    assert.equal(feedback.isExcitingPoint(point({ rallyEnd: { kind, winner: 0, hitSide: 0 } })), false);
  }
  assert.equal(feedback.isExcitingPoint(point({ rallyEnd: { kind: 'in', winner: 1, hitSide: 0 } })), false);
});

test('a long rally includes the serve and requires a valid in-court winning landing', () => {
  assert.equal(typeof feedback.isExcitingPoint, 'function');
  assert.equal(feedback.isExcitingPoint(point({ lastShot: 'clear', rally: 7 })), false);
  assert.equal(feedback.isExcitingPoint(point({ lastShot: 'clear', rally: 8 })), true);
  assert.equal(feedback.isExcitingPoint(point({ lastShot: 'drop', rally: 9 })), true);
  for (const state of [null, {}, point({ rallyEnd: null }), point({ rallyEnd: { kind: 'in' } }),
    point({ rallyEnd: { kind: 'in', winner: 2, hitSide: 2 } })]) {
    assert.equal(feedback.isExcitingPoint(state), false);
  }
});
