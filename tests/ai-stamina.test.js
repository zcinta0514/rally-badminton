import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch, aiInput, stepMatch, ROLES, staminaEffects} from '../shared/game.js';

test('exhausted hard AI retains opportunity attacks but prefers cheaper shots for every role', () => {
  for (const role of Object.keys(ROLES)) {
    const smashes = [];
    for (const ratio of [1, 0]) {
      let count = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const s = createMatch({roles: [role, role], seed: Math.imul(seed, 2654435761) >>> 0});
        s.phase = 'rally';
        s.players[0].stamina = ROLES[role].maxStamina * ratio;
        Object.assign(s.shuttle, {x: 0, z: 3.6, y: 3.05, vy: 0, vx: 0, vz: 0, active: true, lastHit: 1});
        aiInput(s, 0, 'hard');
        count += Number(s._ai[0].shot === 'smash');
      }
      smashes.push(count);
    }
    assert.ok(smashes[1] >= 10 && smashes[1] < smashes[0] / 2, `${role}: ${smashes}`);
    assert.equal(staminaEffects({stamina: 0}, ROLES[role]).speedScale, ROLES[role].fatigue.speedFloor);
  }
});

test('a completed point earns bounded role recovery once, without serve-wait farming', () => {
  for (const role of Object.keys(ROLES)) {
    const s = createMatch({roles: [role, role], target: 21});
    s.phase = 'rally'; s.service = null;
    s.players.forEach(p => {p.stamina = 0;});
    Object.assign(s.shuttle, {x: 0, z: -4, y: .001, vx: 0, vy: -1, vz: 0, active: true, lastHit: 0});
    stepMatch(s, [{}, {}], 1/120);
    assert.equal(s.phase, 'point');
    assert.equal(s.players[0].stamina, 0);
    for (let frame = 0; frame < 180 && s.phase === 'point'; frame++) stepMatch(s, [{}, {}], 1/120);
    assert.equal(s.phase, 'serve');
    s.players.forEach(p => assert.equal(p.stamina, ROLES[role].recovery * 2));
    for (let frame = 0; frame < 600; frame++) stepMatch(s, [{}, {}], 1/120);
    s.players.forEach(p => assert.equal(p.stamina, ROLES[role].recovery * 2));
    assert.ok(staminaEffects(s.players[0], ROLES[role]).speedScale < .85);
  }
});

test('earned rest covers standard game breaks and caps at role capacity', () => {
  const s = createMatch({roles: ['swift', 'power'], ruleset: 'standard21'});
  s.phase = 'rally'; s.service = null; s.score[0] = 20;
  s.players[0].stamina = ROLES.swift.maxStamina - 1;
  s.players[1].stamina = 0;
  Object.assign(s.shuttle, {x: 0, z: -4, y: .001, vx: 0, vy: -1, vz: 0, active: true, lastHit: 0});
  stepMatch(s, [{}, {}], 1/120);
  assert.equal(s.phase, 'intermission');
  for (let frame = 0; frame < 500 && s.phase === 'intermission'; frame++) stepMatch(s, [{}, {}], 1/120);
  assert.equal(s.phase, 'serve');
  assert.equal(s.players[0].stamina, ROLES.swift.maxStamina);
  assert.equal(s.players[1].stamina, ROLES.power.recovery * 2);
});
