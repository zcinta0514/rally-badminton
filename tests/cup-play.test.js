import test from 'node:test';
import assert from 'node:assert/strict';
import { Group } from 'three';
import { createMatch, getPlayerRole, aiInput, ROLES, getShotAvailability } from '../shared/game.js';
import { makeAthlete } from '../src/athlete.js';
import { applyCupKit, cupVenueTheme } from '../src/cup-venue.js';

const opponent = { role: 'power', style: '后场重杀', difficulty: 'hard', height: 191, power: 93, speed: 74, control: 82 };

test('cup height, pace, power and precision affect only the named opponent', () => {
  const make = overrides => createMatch({ cupOpponent: { ...opponent, ...overrides }, difficulty: 'hard' });
  const strong = make({}), weaker = make({height: 164, power: 55, speed: 45, control: 48});
  const a = getPlayerRole(strong.players[1]), b = getPlayerRole(weaker.players[1]);
  assert.ok(a.speed > b.speed && a.power > b.power && a.dropControl < b.dropControl);
  assert.ok(strong.players[1].cup.ai.reaction < weaker.players[1].cup.ai.reaction);
  assert.ok(getShotAvailability(strong, 1).reach > getShotAvailability(weaker, 1).reach);
  assert.equal(getPlayerRole(strong.players[0]), ROLES.balanced);
  assert.deepEqual(JSON.parse(JSON.stringify(strong)), strong);
  for (const options of [{format:'doubles'}, {trainingServer:0}, {challenge:'hell'}]) {
    assert.equal(createMatch({cupOpponent:opponent, ...options}).players[1].cup, undefined);
  }
});

test('identical incoming overheads produce different shot mixes for attacking and net specialists', () => {
  function smashes(style) {
    let count = 0;
    for (let i=1; i<=160; i++) {
      const state = createMatch({cupOpponent:{...opponent, style}, seed:Math.imul(i,2246822519) >>> 0, difficulty:'medium'});
      state.phase='rally';
      Object.assign(state.shuttle, {x:0, y:3.2, z:-3.6, vx:0, vy:-.2, vz:0, active:true, lastHit:0});
      state.players[0].x=1.3;
      aiInput(state,1,'medium');
      if (state._ai[1].shot === 'smash') count++;
    }
    return count;
  }
  assert.ok(smashes('后场重杀') > smashes('抢网变速') + 15);
});

test('leaving the cup restores fallback kit colours and opponent stature', () => {
  const athlete = makeAthlete(new Group(), 1);
  const rgb = athlete.skin.geometry.getAttribute('color');
  const original = rgb.array.slice();
  applyCupKit(athlete, cupVenueTheme('bay'), 190);
  assert.notDeepEqual(rgb.array, original);
  assert.ok(athlete.root.scale.y > 1);
  applyCupKit(athlete, cupVenueTheme('crown'), 173);
  applyCupKit(athlete, null);
  assert.equal(athlete.root.scale.y, 1);
  assert.deepEqual(rgb.array, original);
});
