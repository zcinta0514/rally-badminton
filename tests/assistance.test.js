import test from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../shared/game.js';

const frame = 1 / 120;
const advance = (s, seconds, inputs = [{}, {}]) => {
  for (let t = 0; t < seconds; t += frame) rules.stepMatch(s, inputs, frame);
};
const incoming = (changes = {}) => {
  const s = rules.createMatch();
  s.phase = 'rally'; s.players[0].x = 0; s.players[0].z = 3.8;
  Object.assign(s.shuttle, {x: 0, y: 2.15, z: 3.8, vx: 0, vy: -0.2, vz: 0, active: true, lastHit: 1, ...changes});
  return s;
};

test('shared assistance exports pure prediction and eligibility functions', () => {
  for (const name of ['predictLanding', 'getShotAvailability', 'getInterceptAdvice', 'getShotTarget']) assert.equal(typeof rules[name], 'function', name);
});

test('prediction resolves the first exact net or landing event without mutation', () => {
  assert.equal(typeof rules.predictLanding, 'function');
  for (const changes of [{vx: 1, vz: -7, vy: 5}, {y: 0.8, vz: -15}, {x: 2.4, vx: 3, vz: 2, vy: 1}]) {
    const s = incoming(changes), before = structuredClone(s);
    const result = rules.predictLanding(s);
    assert.deepEqual(s, before);
    assert.ok(result.time > 0);
    advance(s, result.time + 0.02);
    assert.notEqual(s.phase, 'rally');
    assert.ok(Math.hypot(s.shuttle.x - result.x, s.shuttle.z - result.z) < 0.001);
    assert.ok(Math.abs(s.shuttle.y - result.y) < 0.001);
    assert.equal(s.score[result.winner], 1);
  }
  assert.equal(rules.predictLanding(rules.createMatch()), null);
});

test('availability uses turn, court, reach, height, cooldown and stamina boundaries', () => {
  assert.equal(typeof rules.getShotAvailability, 'function');
  const valid = incoming();
  assert.equal(rules.getShotAvailability(valid, 0).canSmash, true);
  for (const edit of [s => {s.shuttle.lastHit = 0;}, s => {s.phase = 'paused';}, s => {s.shuttle.z = -1;}, s => {s.shuttle.x = 2;}, s => {s.shuttle.y = 0.1;}, s => {s.players[0].cooldown = 0.1;}]) {
    const s = incoming(); edit(s);
    const a = rules.getShotAvailability(s, 0);
    assert.equal(a.canHit, false); assert.equal(a.canSmash, false); assert.ok(a.reason);
  }
  const tired = incoming(); tired.players[0].stamina = 17.9;
  assert.equal(rules.getShotAvailability(tired, 0).canSmash, false);
  assert.equal(rules.getShotAvailability(tired, 0).canClear, true);
  const impossible = incoming({y: 1.7, z: 6.3}); impossible.players[0].z = 6;
  assert.equal(rules.getShotAvailability(impossible, 0).canSmash, false);
});

test('future interception never advertises immediate smash while ball is unreachable', () => {
  assert.equal(typeof rules.getInterceptAdvice, 'function');
  const s = incoming({x: 1.8, y: 4.5, z: 1.9, vx: -1, vy: 0.5, vz: 2});
  const before = structuredClone(s), advice = rules.getInterceptAdvice(s, 0);
  assert.equal(advice.canSmash, false); assert.equal(advice.canHit, false);
  assert.equal(advice.status, 'approach'); assert.ok(advice.point.time > 0);
  assert.deepEqual(s, before);
});

test('shot preview equals actual landing and a zero-charge 2.15m smash descends', () => {
  assert.equal(typeof rules.getShotTarget, 'function');
  for (const shot of ['clear', 'drop', 'smash']) for (const aim of [-0.85, 0.85]) {
    const s = incoming({vy: 0});
    const request = {shot, aim, charge: 0};
    const preview = rules.getShotTarget(s, 0, request);
    assert.equal(preview.type, shot);
    if (shot === 'smash') assert.ok(preview.vy < 0, `vy ${preview.vy}`);
    rules.stepMatch(s, [request, {}], frame);
    advance(s, 0.14);
    assert.equal(s.hitId, 1);
    const landing = rules.predictLanding(s);
    assert.equal(landing.event, 'landing'); assert.equal(landing.out, false);
    assert.ok(Math.hypot(preview.x - landing.x, preview.z - landing.z) < 0.05);
  }
});

test('released high smash announces contact before it happens and keeps exact touch metadata', () => {
  const s = incoming({y: 3.05, vy: -1});
  rules.stepMatch(s, [{shot: 'smash', charge: 0.5}, {}], frame);
  assert.equal(s.hitId, 0, 'visible anticipation precedes contact');
  const a = s.players[0].action;
  assert.ok(a && a.stage === 'windup' && a.contactAt > s.time);
  assert.ok(a.jumpHeight > 0);
  while (s.hitId === 0 && s.time < 0.2) rules.stepMatch(s, [{}, {}], frame);
  assert.equal(s.hitId, 1);
  assert.ok(Math.hypot(a.contact.x - s.shuttle.x, a.contact.z - s.shuttle.z) < 0.2);
  assert.ok(a.startedAt < a.contactAt && a.contactAt < a.endsAt);
  assert.equal(s.players[0].action.id, a.id);
  advance(s, 0.6);
  assert.equal(s.players[0].action, null);
});

test('both parity service courts launch diagonally inside the legal singles receiver box', () => {
  assert.equal(typeof rules.getShotTarget, 'function');
  for (const side of [0, 1]) for (const score of [0, 1, 2, 3]) {
    const s = rules.createMatch(); s.server = side; s.score[side] = score;
    // The next serve reset is what normal point progression performs.
    s.phase = 'point'; s.timer = 0;
    rules.stepMatch(s);
    const serverX = s.players[side].x;
    assert.equal(Math.sign(serverX), (side === 0 ? 1 : -1) * (score % 2 ? -1 : 1));
    assert.ok(s.shuttle.y < 1.15);
    for (const aim of [-1, 0, 1]) {
      const target = rules.getShotTarget(s, side, {shot: 'drop', aim});
      assert.ok(target.x * serverX < 0);
      assert.ok(Math.abs(target.z) > 1.98 && Math.abs(target.z) < 6.7);
    }
    assert.ok(rules.getShotTarget(s, side, {shot: 'clear', aim: 1}).x > rules.getShotTarget(s, side, {shot: 'clear', aim: -1}).x, 'world aim direction remains monotonic during service');
    const inputs = [{}, {}]; inputs[side] = {shot: 'smash', aim: 1};
    rules.stepMatch(s, inputs); advance(s, 0.12);
    const landing = rules.predictLanding(s);
    assert.equal(landing.event, 'landing'); assert.equal(landing.out, false);
    assert.ok(landing.x * serverX < 0);
  }
});

const pointFor = (s, side) => {
  s.phase = 'rally';
  Object.assign(s.shuttle, {x: 0, y: 0.01, z: side ? 3 : -3, vx: 0, vy: -2, vz: 0, active: true, lastHit: side});
  rules.stepMatch(s);
};
test('standard21 requires two clear points, caps at thirty, and awards a best-of-three match', () => {
  const s = rules.createMatch({ruleset: 'standard21'});
  assert.equal(s.ruleset, 'standard21'); assert.equal(s.target, 21);
  s.score = [20, 20]; pointFor(s, 0);
  assert.equal(s.phase, 'point'); assert.deepEqual(s.games, [0, 0]);
  pointFor(s, 0); assert.equal(s.phase, 'intermission'); assert.deepEqual(s.games, [1, 0]);
  advance(s, 5.1); assert.equal(s.phase, 'serve'); assert.deepEqual(s.score, [0, 0]);
  s.score = [29, 29]; pointFor(s, 1);
  assert.equal(s.phase, 'intermission'); assert.deepEqual(s.games, [1, 1]);
  advance(s, 5.1); s.score = [10, 9];
  const before = s.sideChange.id; pointFor(s, 0);
  assert.equal(s.sideChange.id, before + 1);
  s.score = [20, 15]; pointFor(s, 0);
  assert.equal(s.phase, 'over'); assert.equal(s.winner, 0); assert.deepEqual(s.games, [2, 1]);
});

test('pause cancels pending windup cleanly and preserves the one-pause quota across games', () => {
  const s = incoming({y: 3.05});
  rules.stepMatch(s, [{shot: 'smash'}, {}], frame);
  assert.equal(s.players[0].action.stage, 'windup');
  assert.equal(rules.pauseMatch(s, 0), true);
  assert.equal(s.players[0].pendingShot, null);
  assert.equal(s.players[0].action, null, 'cancelled windup must not remain frozen forever');
  rules.resumeMatch(s); advance(s, 2.01);
  assert.equal(s.hitId, 0);
  assert.equal(rules.pauseMatch(s, 0), false);
});

test('only a confirmed opponent hit can be returned in an active rally', () => {
  const s = incoming({lastHit: null});
  assert.equal(rules.getShotAvailability(s, 0).canHit, false);
  rules.stepMatch(s, [{shot: 'clear'}, {}]); advance(s, 0.2);
  assert.equal(s.hitId, 0);
});

test('service contact holds the feet still throughout the windup', () => {
  const s = rules.createMatch();
  rules.stepMatch(s, [{shot: 'drop'}, {}], frame);
  const position = {x: s.players[0].x, z: s.players[0].z};
  for (let i = 0; i < 4; i++) rules.stepMatch(s, [{x: 1, z: 1}, {}], frame);
  assert.equal(s.phase, 'serve');
  assert.deepEqual({x: s.players[0].x, z: s.players[0].z}, position);
});

test('prediction agrees with independently calculated net height and the singles boundary', () => {
  for (const offset of [-0.001, 0.001]) {
    // 0.5 seconds to net; gravity drop is 1.22625 m.
    const s = incoming({x: 0, y: 1.52 + 1.22625 + offset, z: 1, vz: -2, vy: 0});
    const event = rules.predictLanding(s);
    assert.equal(event.event, offset < 0 ? 'net' : 'landing');
    if (offset < 0) { assert.ok(Math.abs(event.time - 0.5) < 1e-9); assert.ok(Math.abs(event.y - (1.52 + offset)) < 1e-9); }
  }
  for (const x of [2.59, 2.59001]) {
    const s = incoming({x, y: 1, vy: 0, z: 3, vx: 0, vz: 0});
    assert.equal(rules.predictLanding(s).out, x > 2.59);
  }
});

test('reachable low and wide shots publish a visible reach vector without extending rules reach', () => {
  const s = incoming({x: 1.25, y: 0.65, z: 3.6, vy: -0.1});
  assert.equal(rules.getShotAvailability(s, 0).canHit, true);
  rules.stepMatch(s, [{shot: 'drop'}, {}], frame);
  const action = s.players[0].action;
  assert.ok(action.reach.x > 0.4);
  assert.equal(action.jumpHeight, 0);
  advance(s, 0.12);
  assert.equal(s.lastShot, 'drop');
  const outside = incoming({x: 1.451, z: 3.8});
  assert.equal(rules.getShotAvailability(outside, 0).canHit, false);
});

test('a fast descending high ball gets anticipation before entering the hit-height window', () => {
  const s = incoming({y: 4.3, z: 4.3, vy: -7, vz: 0});
  s.players[0].z = 4.3;
  assert.equal(rules.getShotAvailability(s, 0).canHit, false);
  rules.stepMatch(s, [{shot: 'smash'}, {}], frame);
  assert.equal(s.hitId, 0);
  assert.equal(s.players[0].action?.stage, 'windup');
  assert.ok(s.players[0].action.contact.y <= 3.25);
  advance(s, 0.16);
  assert.equal(s.hitId, 1); assert.equal(s.lastShot, 'smash'); assert.ok(s.shuttle.vy < 0);
});

test('charged smash eligibility and future advice share the actual shot request', () => {
  const s = incoming(); s.players[0].stamina = 20;
  assert.equal(rules.getShotAvailability(s, 0, {charge: 0}).canSmash, true);
  assert.equal(rules.getShotTarget(s, 0, {shot: 'smash', charge: 1}).type, 'smash');
  assert.equal(rules.getShotAvailability(s, 0, {charge: 1}).canSmash, false);
  const high = incoming({y: 4.3, z: 4.3, vy: -7, vz: 0}); high.players[0].z = 4.3;
  const future = rules.getInterceptAdvice(high, 0, {charge: 0});
  assert.equal(future.status, 'approach'); assert.equal(future.canSmash, false);
  assert.equal(future.futureCanSmash, true);
  high.players[0].stamina = 20;
  assert.equal(rules.getInterceptAdvice(high, 0, {charge: 1}).futureCanSmash, false);
});

test('vertical shot direction moves each shot landing monotonically for either player', () => {
  for (const side of [0, 1]) for (const shot of ['clear', 'drop', 'smash']) {
    const sign = side === 0 ? 1 : -1;
    const s = incoming({y: 3.24, z: sign * 1.7, vy: 0, lastHit: 1 - side});
    s.players[side].x = 0; s.players[side].z = sign * 1.7;
    const depths = [-1, -0.5, 0, 0.5, 1].map(aimDepth => {
      const target = rules.getShotTarget(s, side, {shot, aim: 0.65, aimDepth, charge: 0.4});
      assert.equal(target.type, shot);
      assert.ok(target.z * sign < 0, 'target stays on the opponent half');
      return Math.abs(target.z);
    });
    for (let i = 1; i < depths.length; i++) assert.ok(depths[i] > depths[i - 1], `${shot}: ${depths}`);
    assert.ok(depths.at(-1) - depths[0] >= 2, 'drag must make a visible depth difference');
    assert.equal(depths[2], shot === 'clear' ? 5.45 + 0.4 * 0.55 : shot === 'drop' ? 1.35 + 0.4 * 0.25 : 4.45 + 0.4 * 0.5);
    const omitted = rules.getShotTarget(s, side, {shot, aim: 0.65, charge: 0.4});
    assert.equal(Math.abs(omitted.z), depths[2], 'existing AI defaults remain unchanged');
  }
});

test('dragged two-dimensional previews match the actual contact trajectory and landing', () => {
  for (const side of [0, 1]) for (const shot of ['clear', 'drop', 'smash']) for (const aimDepth of [-1, 0, 1]) {
    const sign = side === 0 ? 1 : -1;
    const s = incoming({y: 3.24, z: sign * 1.7, vy: 0, lastHit: 1 - side});
    s.players[side].x = 0; s.players[side].z = sign * 1.7;
    const request = {shot, aim: aimDepth > 0 ? -0.7 : 0.7, aimDepth, charge: 0.25};
    const expected = rules.getShotTarget(s, side, request);
    if (aimDepth !== 0) {
      const limits = {clear: [3.5, 6.25], drop: [0.7, 3], smash: [1.8, 6.2]}[shot];
      assert.equal(Math.abs(expected.z), limits[aimDepth < 0 ? 0 : 1]);
    }
    const inputs = [{}, {}]; inputs[side] = request;
    rules.stepMatch(s, inputs, frame);
    for (let i = 0; i < 30 && !s.hitId; i++) rules.stepMatch(s, [{}, {}], frame);
    assert.equal(s.hitId, 1); assert.equal(s.lastShot, shot);
    if (shot === 'smash') assert.ok(s.shuttle.vy < 0);
    const landing = rules.predictLanding(s);
    assert.equal(landing.event, 'landing'); assert.equal(landing.out, false);
    assert.ok(Math.hypot(landing.x - expected.x, landing.z - expected.z) < 1e-8);
    advance(s, landing.time + 0.02);
    assert.equal(s.phase, 'point'); assert.equal(s.score[side], 1);
    assert.ok(Math.hypot(s.shuttle.x - expected.x, s.shuttle.z - expected.z) < 1e-8);
  }
});

test('vertical service aiming remains monotonic and legal in both diagonal service boxes', () => {
  for (const side of [0, 1]) for (const score of [0, 1]) for (const shot of ['clear', 'drop', 'smash']) {
    let previousDepth = 0;
    for (const aimDepth of [-1, 0, 1]) {
      const s = rules.createMatch(); s.server = side; s.score[side] = score;
      s.phase = 'point'; s.timer = 0; rules.stepMatch(s);
      const request = {shot, aim: -1, aimDepth, charge: 0.4};
      const expected = rules.getShotTarget(s, side, request);
      const depth = Math.abs(expected.z);
      assert.ok(depth >= 2.1 && depth <= 6.35);
      assert.ok(depth > previousDepth, `${shot} service depth must increase with drag`); previousDepth = depth;
      assert.ok(expected.x * s.players[side].x < 0);
      const inputs = [{}, {}]; inputs[side] = request;
      rules.stepMatch(s, inputs); advance(s, 0.12);
      const landing = rules.predictLanding(s);
      assert.equal(landing.event, 'landing'); assert.equal(landing.serviceFault, false);
      assert.ok(Math.hypot(landing.x - expected.x, landing.z - expected.z) < 1e-8);
    }
  }
});

test('smash eligibility warns about a shallow impossible attack and preserves its real net collision', () => {
  const s = incoming({y: 2.15, vy: 0});
  assert.equal(rules.getShotAvailability(s, 0, {aimDepth: 1}).canSmash, true);
  const shallow = rules.getShotTarget(s, 0, {shot: 'smash', aimDepth: -1});
  assert.equal(shallow.type, 'smash'); assert.match(shallow.quality.reason, /角度|下网/);
  assert.equal(shallow.quality.reasonCode, 'net-risk');
  assert.equal(rules.getShotAvailability(s, 0, {aimDepth: -1}).canSmash, false);
  assert.ok(shallow.netHeight < rules.COURT.netHeight);
});

test('shared shot depth ignores nonfinite values and clamps numeric extremes', () => {
  const s = incoming();
  const normal = rules.getShotTarget(s, 0, {shot: 'drop'});
  for (const aimDepth of [NaN, Infinity, -Infinity, '1', null, {}]) {
    assert.equal(rules.getShotTarget(s, 0, {shot: 'drop', aimDepth}).z, normal.z);
  }
  for (const aimDepth of [-50, 50]) {
    const actual = rules.getShotTarget(s, 0, {shot: 'drop', aimDepth});
    const bounded = rules.getShotTarget(s, 0, {shot: 'drop', aimDepth: Math.sign(aimDepth)});
    assert.equal(Math.abs(actual.z), aimDepth < 0 ? 0.7 : 3);
    assert.equal(actual.z, bounded.z);
  }
});

test('stable safe returns stay reliable and quality previews are deterministic and pure', () => {
  for (const shot of ['clear', 'drop', 'smash']) {
    const s = incoming({y: 2.8, vy: -0.2}), before = structuredClone(s);
    const request = {shot, aim: 0.35, aimDepth: 0, charge: 0.3};
    const target = rules.getShotTarget(s, 0, request);
    assert.ok(target.quality, 'target describes contact quality');
    assert.ok(target.quality.score >= 0.95);
    assert.ok(target.quality.risk <= 0.05);
    assert.ok(target.netHeight > rules.COURT.netHeight);
    assert.ok(Math.abs(target.x) < rules.COURT.halfWidth && Math.abs(target.z) < rules.COURT.halfLength);
    assert.equal(target.x, target.aimX); assert.equal(target.z, target.aimZ);
    assert.equal(target.quality.reasonCode, 'stable');
    assert.deepEqual(rules.getShotTarget(s, 0, request), target);
    assert.deepEqual(s, before);
  }
});

test('movement, stretch, late low contact, fatigue and powerful line aiming each reduce control', () => {
  const stable = incoming({y: 2.8, vy: -0.2});
  const request = {shot: 'clear', aim: 0.25, charge: 0.2};
  const safe = rules.getShotTarget(stable, 0, request);
  assert.ok(safe.quality);
  for (const [name, edit, input] of [
    ['movement', s => {s.players[0].vx = 4.5;}, request],
    ['stretch', s => {s.players[0].x = -1.4;}, request],
    ['lowContact', s => {s.shuttle.y = 0.5;}, request],
    ['lateContact', s => {s.shuttle.y = 0.7; s.shuttle.vy = -7;}, request],
    ['fatigue', s => {s.players[0].stamina = 8;}, request],
    ['linePower', () => {}, {...request, aim: 1, aimDepth: 1, charge: 1}],
  ]) {
    const s = structuredClone(stable); edit(s);
    const target = rules.getShotTarget(s, 0, input);
    assert.ok(target.quality.score < safe.quality.score - 0.05, name);
    assert.ok(target.quality.factors[name] > 0, name);
    assert.ok(target.quality.reason && target.quality.spread > 0, name);
  }
});

test('full power at the boundary can fly out and a late low attacking contact can hit the net', () => {
  const line = incoming({y: 2.8, vy: 0});
  const out = rules.getShotTarget(line, 0, {shot: 'clear', aim: 1, aimDepth: 1, charge: 1});
  assert.ok(Math.abs(out.x) > rules.COURT.halfWidth || Math.abs(out.z) > rules.COURT.halfLength);
  assert.ok(out.aimX < rules.COURT.halfWidth && Math.abs(out.aimZ) < rules.COURT.halfLength);
  Object.assign(line.shuttle, {vx: out.vx, vy: out.vy, vz: out.vz, lastHit: 0});
  const event = rules.predictLanding(line);
  assert.equal(event.out, true);
  advance(line, event.time + 0.02);
  assert.deepEqual(line.score, [0, 1]);
  const low = incoming({y: 0.5, vy: -6});
  const attack = rules.getShotTarget(low, 0, {shot: 'smash', aim: 0, charge: 0.8});
  assert.equal(attack.type, 'smash', 'the chosen risky attack is not silently replaced');
  Object.assign(low.shuttle, {vx: attack.vx, vy: attack.vy, vz: attack.vz, lastHit: 0});
  assert.equal(rules.predictLanding(low).event, 'net');
});

test('quality and physical misses mirror fairly for both court ends', () => {
  const a = incoming({x: 1.2, y: 1.0, z: 3.6, vx: 1, vy: -5, vz: 2});
  Object.assign(a.players[0], {x: 0, z: 3.8, vx: 3.4, vz: -1.4, stamina: 15});
  const b = structuredClone(a);
  b.players[1] = {...a.players[0], x: -a.players[0].x, z: -a.players[0].z, vx: -a.players[0].vx, vz: -a.players[0].vz};
  b.shuttle = {...a.shuttle, x: -a.shuttle.x, z: -a.shuttle.z, vx: -a.shuttle.vx, vz: -a.shuttle.vz, lastHit: 0};
  const first = rules.getShotTarget(a, 0, {shot: 'drop', aim: 0.9, aimDepth: 0.5, charge: 0.8});
  const second = rules.getShotTarget(b, 1, {shot: 'drop', aim: -0.9, aimDepth: 0.5, charge: 0.8});
  assert.ok(first.quality);
  assert.deepEqual(first.quality, second.quality);
  for (const key of ['x', 'z', 'vx', 'vz', 'aimX', 'aimZ']) assert.ok(Math.abs(first[key] + second[key]) < 1e-9, key);
  assert.equal(first.vy, second.vy);
});

test('actual contact publishes the same quality and trajectory as its authoritative contact preview', () => {
  const s = incoming({y: 2.8, x: 1.25, vy: -1});
  s.players[0].stamina = 28;
  const request = {shot: 'clear', aim: 0.85, aimDepth: 0.4, charge: 0.7};
  rules.stepMatch(s, [request, {}], frame);
  assert.equal(s.hitId, 0);
  while (s.hitId === 0 && s.time < 0.3) rules.stepMatch(s, [{}, {}], frame);
  assert.equal(s.hitId, 1);
  const result = s.lastShotInfo;
  assert.ok(result?.quality);
  assert.deepEqual(result.quality, s.players[0].action.quality);
  assert.equal(result.at, s.players[0].action.contactAt);
  assert.equal(result.side, 0); assert.equal(result.hitId, s.hitId);
  const event = rules.predictLanding(s);
  if (event.event === 'landing') assert.ok(Math.hypot(event.x - result.x, event.z - result.z) < 1e-8);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

test('assisted service remains legal even with exhausted players and maximum line power', () => {
  for (const side of [0, 1]) {
    const s = rules.createMatch(); s.server = side; s.phase = 'point'; s.timer = 0; rules.stepMatch(s);
    s.players[side].stamina = 0;
    const shot = rules.getShotTarget(s, side, {shot: 'smash', aim: 1, aimDepth: 1, charge: 1});
    assert.ok(shot.quality); assert.equal(shot.quality.score, 1); assert.equal(shot.quality.risk, 0);
    assert.equal(shot.type, 'clear'); assert.ok(shot.netHeight > rules.COURT.netHeight);
    assert.ok(Math.abs(shot.z) < rules.COURT.halfLength && shot.x * s.players[side].x < 0);
  }
});

test('held preparation and released shot use the same quality model', () => {
  const s = incoming({y: 1.6, vy: -3});
  const request = {aim: 0.8, aimDepth: -0.4, charge: 0.6};
  assert.deepEqual(rules.getShotTarget(s, 0, {...request, prepare: 'smash'}), rules.getShotTarget(s, 0, {...request, shot: 'smash'}));
});

test('risk spread encloses actual control drift including the shortened flight from vertical loss', () => {
  for (const shot of ['clear', 'drop', 'smash']) for (const side of [0, 1]) for (const height of [0.55, 1.2, 2.7]) {
    const end = side ? -1 : 1;
    const s = incoming({x: end * 1.3, y: height, z: end * 3.8, vx: end, vy: -5, vz: 0, lastHit: 1 - side});
    Object.assign(s.players[side], {x: 0, z: end * 3.8, vx: end * 3, vz: -end * 2, stamina: 12});
    const result = rules.getShotTarget(s, side, {shot, aim: end * 0.9, aimDepth: 0.65, charge: 0.85});
    const flightTime = (result.vy + Math.sqrt(result.vy ** 2 + 19.62 * height)) / 9.81;
    const actualX = s.shuttle.x + result.vx * flightTime, actualZ = s.shuttle.z + result.vz * flightTime;
    assert.ok(Math.hypot(actualX - result.x, actualZ - result.z) < 1e-8);
    assert.ok(Math.hypot(actualX - result.aimX, actualZ - result.aimZ) <= result.quality.spread + 1e-8);
  }
});

test('ordinary stable returns remain safe across all roles, court ends and moderate powers', () => {
  for (const role of Object.keys(rules.ROLES)) for (const side of [0, 1]) for (const shot of ['clear', 'drop', 'smash']) {
    for (const aim of [-0.6, 0, 0.6]) for (const charge of [0, 0.35, 0.7]) {
      const end = side ? -1 : 1;
      const s = incoming({y: shot === 'smash' ? 2.8 : 1.5, z: end * 3.8, vy: -0.2, lastHit: 1 - side});
      Object.assign(s.players[side], {x: 0, z: end * 3.8, role, stamina: rules.ROLES[role].maxStamina});
      const result = rules.getShotTarget(s, side, {shot, aim, charge});
      assert.ok(result.netHeight > rules.COURT.netHeight, `${role}/${side}/${shot}/${aim}/${charge}`);
      assert.ok(Math.abs(result.x) < rules.COURT.halfWidth && Math.abs(result.z) < rules.COURT.halfLength);
      assert.equal(result.quality.score, 1);
    }
  }
});

for (const [kind, changes] of [
  ['net', {x: 0.2, y: 0.9, z: 0.03, vx: 1.2, vy: -1.1, vz: -7, lastHit: 0}],
  ['in', {x: 0.2, y: 0.01, z: -3, vx: 1.2, vy: -3, vz: -0.5, lastHit: 0}],
  ['out', {x: 2.8, y: 0.01, z: -3, vx: 1.2, vy: -3, vz: -0.5, lastHit: 0}],
  ['serviceFault', {x: 0.7, y: 0.01, z: -3, vx: 1.2, vy: -3, vz: -0.5, lastHit: 0}],
]) test(`${kind} settlement preserves the exact authoritative impact for its visual ending`, () => {
  const s = incoming(changes); s.time = 12;
  if (kind === 'serviceFault') s.service.active = true;
  const before = structuredClone(s.shuttle), expected = rules.predictLanding(s);
  rules.stepMatch(s);
  const event = s.rallyEnd;
  assert.ok(event, 'settlement must retain an impact event after disabling live flight');
  assert.equal(event.kind, kind); assert.equal(event.id, 1); assert.equal(event.hitId, s.hitId);
  assert.equal(event.hitSide, 0); assert.equal(event.winner, expected.winner);
  assert.equal(event.duration, 1.4);
  assert.ok(Math.abs(event.at - (12 + expected.time)) < 1e-8);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(event[axis] - expected[axis]) < 1e-8, axis);
  assert.equal(event.vx, before.vx); assert.equal(event.vz, before.vz);
  assert.ok(Math.abs(event.vy - (before.vy - 9.81 * expected.time)) < 1e-8);
  assert.equal(s.shuttle.active, false); assert.equal(s.pointId, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(event)), event);
  const saved = structuredClone(event);
  advance(s, 1.3);
  assert.equal(s.phase, 'point', 'the next serve must wait for the 1.4-second ending');
  assert.equal(s.pointId, 1); assert.deepEqual(s.rallyEnd, saved);
  advance(s, 0.2);
  assert.equal(s.phase, 'serve'); assert.equal(s.rallyEnd, null);
});

test('settlement event freezes through pause and countdown without another point or fresh ending', () => {
  const s = incoming({y: 0.9, z: 0.03, vx: 0.4, vy: -1, vz: -7, lastHit: 0});
  rules.stepMatch(s);
  const event = structuredClone(s.rallyEnd), time = s.time, ball = structuredClone(s.shuttle);
  assert.ok(event);
  assert.equal(rules.pauseMatch(s, 1), true);
  advance(s, 3, [{shot: 'clear'}, {shot: 'smash'}]);
  assert.equal(s.time, time); assert.deepEqual(s.rallyEnd, event); assert.deepEqual(s.shuttle, ball);
  assert.equal(s.pointId, 1);
  rules.resumeMatch(s); advance(s, 1.9);
  assert.equal(s.phase, 'countdown'); assert.equal(s.time, time); assert.deepEqual(s.rallyEnd, event);
  advance(s, 0.15);
  assert.equal(s.phase, 'point'); assert.equal(s.pointId, 1); assert.deepEqual(s.rallyEnd, event);
});

test('game and match endings retain their impact while finished match logic remains immutable', () => {
  for (const mode of ['quick', 'intermission', 'standard-final']) {
    const s = rules.createMatch({ruleset: mode === 'quick' ? 'quick' : 'standard21'});
    s.phase = 'rally'; s.score = mode === 'quick' ? [4, 0] : [20, 0];
    if (mode === 'standard-final') s.games = [1, 0];
    Object.assign(s.shuttle, {x: 0, y: 0.01, z: -3, vx: 1, vy: -2, vz: -0.5, active: true, lastHit: 0});
    rules.stepMatch(s);
    assert.ok(s.rallyEnd); assert.equal(s.rallyEnd.kind, 'in'); assert.equal(s.rallyEnd.winner, 0);
    if (mode === 'intermission') {
      assert.equal(s.phase, 'intermission'); const event = structuredClone(s.rallyEnd);
      advance(s, 1.5); assert.deepEqual(s.rallyEnd, event);
      advance(s, 2.6); assert.equal(s.phase, 'serve'); assert.equal(s.rallyEnd, null);
    } else {
      assert.equal(s.phase, 'over'); const before = structuredClone(s);
      advance(s, 2); assert.deepEqual(s, before);
    }
  }
});

test('each new scored rally gets a fresh ending id and a non-scoring finish fabricates none', () => {
  const s = incoming({y: 0.01, z: -3, vy: -3, vz: 0, lastHit: 0});
  rules.stepMatch(s); assert.equal(s.rallyEnd?.id, 1);
  advance(s, 1.6); assert.equal(s.rallyEnd, null);
  s.phase = 'rally'; Object.assign(s.shuttle, {x: 0, y: 0.01, z: 3, vx: 0, vy: -3, vz: 0, active: true, lastHit: 1});
  rules.stepMatch(s); assert.equal(s.rallyEnd.id, 2); assert.equal(s.pointId, 2);
  const other = rules.createMatch(); rules.finishMatch(other, null, '主动退出');
  assert.equal(other.rallyEnd, null);
});
