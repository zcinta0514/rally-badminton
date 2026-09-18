import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmark, simulateMatch } from '../scripts/benchmark-game.js';

test('deterministic AI benchmark completes every supported difficulty', () => {
  const result = benchmark({ seeds: 12 });
  for (const difficulty of ['easy', 'medium', 'hard']) {
    assert.equal(result[difficulty].matches, 12);
    assert.equal(result[difficulty].completed, 12, difficulty);
    assert.equal(result[difficulty].completionRate, 1, difficulty);
    assert.ok(result[difficulty].medianRally >= 1, difficulty);
  }
});

test('the same seed produces the same match summary and no hidden miss flag', () => {
  const first = simulateMatch({ difficulty: 'hard', seed: 77 });
  const second = simulateMatch({ difficulty: 'hard', seed: 77 });
  assert.deepEqual(first, second);
  assert.equal(Object.hasOwn(first, 'miss'), false);
});
