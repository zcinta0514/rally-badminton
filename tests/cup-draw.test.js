import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCup, advanceCup, getCupOpponent, roundLabel, isValidCup, CUP_EVENTS } from '../src/cup-draw.js';

for (const { id, size } of CUP_EVENTS) {
  test(id + ' draw survives serialization and both result paths at every round', () => {
    let cup = createCup(id, '球友', 4986);
    assert.equal(cup.players[0].name, '球友');
    assert.equal(cup.players.length, size);
    assert.equal(new Set(cup.players.map(p => p.name)).size, size);
    assert.equal(new Set(cup.players.slice(1).map(p => p.style)).size, 5);
    assert.equal(new Set(cup.players.slice(1).map(p => p.country)).size, 6);
    for (let remaining = size; remaining >= 2; remaining /= 2) {
      assert.ok(isValidCup(cup));
      assert.equal(cup.rounds.at(-1).length, remaining / 2);
      const reload = JSON.parse(JSON.stringify(cup));
      const opponent = getCupOpponent(cup);
      assert.deepEqual(opponent, getCupOpponent(reload));
      const loss = advanceCup(cup, false);
      assert.equal(loss.status, 'eliminated');
      assert.ok(isValidCup(loss));
      assert.equal(getCupOpponent(loss), null);
      assert.equal(advanceCup(loss, true), loss);
      const win = advanceCup(cup, true);
      assert.deepEqual(win, advanceCup(reload, true));
      assert.deepEqual(cup, reload);
      cup = win;
    }
    assert.equal(cup.rounds.length, Math.log2(size));
    assert.equal(cup.status, 'champion');
    assert.equal(cup.rounds.at(-1)[0].winner, 0);
    assert.ok(isValidCup(cup));
  });
}

test('draws vary by seed; simulations favor stronger players while retaining occasional upsets', () => {
  const lineups = new Set();
  const average = Array(6).fill(0);
  let upsets = 0;
  for (let seed = 0; seed < 100; seed++) {
    let cup = createCup('crown', '球友', seed);
    lineups.add(getCupOpponent(cup).name);
    while (cup.status === 'active') {
      average[cup.roundIndex] += getCupOpponent(cup).rating / 100;
      const previous = cup;
      cup = advanceCup(cup, true);
      for (const { a, b, winner } of cup.rounds[previous.roundIndex]) {
        if (a !== 0 && b !== 0 && cup.players[winner].rating + 5 < Math.max(cup.players[a].rating, cup.players[b].rating)) upsets++;
      }
    }
  }
  assert.ok(lineups.size > 50);
  assert.ok(average.every((v, i) => !i || v > average[i - 1]));
  assert.ok(upsets > 0);
});

test('damaged saves reject duplicated participants, broken progression, invalid profiles and false champions', () => {
  const cup = advanceCup(createCup('bay', '球友', 1234), true);
  for (const corrupt of [
    c => { c.rounds[0][0].a = c.rounds[0][0].b; },
    c => { c.rounds[1][0].a = 999; },
    c => { c.players[2].speed = NaN; },
    c => { c.status = 'champion'; },
    c => { c.roundIndex += 1; },
  ]) {
    const copy = structuredClone(cup);
    corrupt(copy);
    assert.equal(isValidCup(copy), false);
  }
  assert.equal(isValidCup(null), false);
  assert.equal(roundLabel(4), '半决赛');
  assert.equal(roundLabel(2), '决赛');
});
