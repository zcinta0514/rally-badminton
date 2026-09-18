import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT, ROLES, createMatch, stepMatch, aiInput, getShotTarget, getShotAvailability, pauseMatch, resumeMatch, finishMatch } from '../shared/game.js';

const frame = 1 / 60;
const advance = (state, seconds, inputs = [{}, {}]) => {
  for (let t = 0; t < seconds - 1e-8; t += frame) stepMatch(state, inputs, frame);
};
const incoming = (state, changes = {}) => {
  state.phase = 'rally';
  Object.assign(state.shuttle, { x: 0, y: 1.8, z: 3.6, vx: 0, vy: -1, vz: 2, active: true, lastHit: 1, ...changes });
};

test('match creates serializable role, score, court and pause state', () => {
  const state = createMatch({ target: 11, roles: ['swift', 'power'] });
  assert.equal(state.phase, 'serve');
  assert.equal(state.target, 11);
  assert.deepEqual(state.score, [0, 0]);
  assert.equal(state.players[0].role, 'swift');
  assert.ok(state.players[0].z > 0 && state.players[1].z < 0);
  assert.equal(state.players[1].stamina, ROLES.power.maxStamina);
  assert.deepEqual(state.pause.used, [0, 0]);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.equal(COURT.netHeight, 1.52);
});

test('normalizes invalid role/target/input without corrupting state', () => {
  const state = createMatch({ target: -12, roles: ['unknown', null] });
  assert.equal(state.target, 5);
  assert.equal(state.players[0].role, 'balanced');
  stepMatch(state, [{ x: Infinity, z: NaN, shot: 'bad', charge: Infinity }, null], frame);
  for (const player of state.players) assert.ok(Number.isFinite(player.x + player.z + player.stamina));
});

test('roles have distinct movement windows and tactical shot profiles', () => {
  assert.ok(ROLES.swift.speed > ROLES.balanced.speed);
  assert.ok(ROLES.swift.acceleration > ROLES.balanced.acceleration);
  assert.ok(ROLES.swift.reachBonus > ROLES.balanced.reachBonus);
  assert.ok(ROLES.power.speed < ROLES.balanced.speed);
  assert.ok(ROLES.power.maxStamina > ROLES.balanced.maxStamina);
  assert.ok(ROLES.power.shotDepth.clear > ROLES.balanced.shotDepth.clear);
  assert.ok(ROLES.power.shotSpeed.smash > ROLES.balanced.shotSpeed.smash);
  assert.ok(ROLES.swift.shotSpeed.drop > ROLES.balanced.shotSpeed.drop);

  const makeIncoming = role => {
    const state = createMatch({ roles: [role, 'balanced'] });
    incoming(state, { x: 0, y: 2.6, z: 3.8, vx: 0, vy: 0, vz: 0 });
    state.players[0].x = 0; state.players[0].z = 3.8;
    return state;
  };
  const balanced = makeIncoming('balanced');
  const swift = makeIncoming('swift');
  const power = makeIncoming('power');
  const balancedClear = getShotTarget(balanced, 0, { shot: 'clear', charge: 0.6, aim: 0, aimDepth: 0.8 });
  const powerClear = getShotTarget(power, 0, { shot: 'clear', charge: 0.6, aim: 0, aimDepth: 0.8 });
  const balancedSmash = getShotTarget(balanced, 0, { shot: 'smash', charge: 0.6, aim: 0, aimDepth: 0 });
  const swiftSmash = getShotTarget(swift, 0, { shot: 'smash', charge: 0.6, aim: 0, aimDepth: 0 });
  const powerSmash = getShotTarget(power, 0, { shot: 'smash', charge: 0.6, aim: 0, aimDepth: 0 });
  assert.ok(Math.abs(powerClear.aimZ) > Math.abs(balancedClear.aimZ));
  assert.ok(Math.hypot(powerSmash.vx, powerSmash.vz) > Math.hypot(balancedSmash.vx, balancedSmash.vz));
  assert.ok(Math.hypot(swiftSmash.vx, swiftSmash.vz) < Math.hypot(balancedSmash.vx, balancedSmash.vz));

  const edge = role => {
    const state = createMatch({ roles: [role, 'balanced'] });
    incoming(state, { x: 1.5, y: 1.8, z: 3.8, vx: 0, vy: -1, vz: 0 });
    state.players[0].x = 0; state.players[0].z = 3.8;
    return getShotAvailability(state, 0);
  };
  assert.equal(edge('balanced').canHit, false);
  assert.equal(edge('swift').canHit, true);
});

test('medium is the canonical difficulty and normal remains an equivalent alias', () => {
  const medium = createMatch({ difficulty: 'medium', seed: 92 });
  const normal = createMatch({ difficulty: 'normal', seed: 92 });
  assert.equal(medium.difficulty, 'medium');
  assert.equal(normal.difficulty, 'medium');
  assert.deepEqual(medium, normal);
  for (let frame = 0; frame < 60 * 20; frame++) {
    const mediumInputs = [aiInput(medium, 0, 'medium'), aiInput(medium, 1, 'medium')];
    const normalInputs = [aiInput(normal, 0, 'normal'), aiInput(normal, 1, 'normal')];
    assert.deepEqual(mediumInputs, normalInputs);
    stepMatch(medium, mediumInputs);
    stepMatch(normal, normalInputs);
  }
  assert.deepEqual(medium, normal);
});

const observeAIResponse = (difficulty, { seed = 1, opponentX = 1.8, opponentDepth = 3.5 } = {}) => {
  const state = createMatch({ difficulty, seed });
  incoming(state, { y: 2.8, vy: -0.2, vz: 0 });
  state.players[1].x = opponentX;
  state.players[1].z = -opponentDepth;
  for (let tick = 0; tick < 60 && state.phase === 'rally'; tick++) {
    const input = aiInput(state, 0, difficulty);
    stepMatch(state, [input, {}]);
    if (state.hitId > 0) return { shot: state.lastShot, aim: input.aim, inputShot: input.shot };
  }
  return null;
};

test('easy AI favours clear shots and centre lines while medium varies its shots and lines', () => {
  const collect = difficulty => Array.from({ length: 80 }, (_, index) => observeAIResponse(difficulty, { seed: Math.imul(index + 1, 2654435761) >>> 0 })).filter(Boolean);
  const easy = collect('easy'), medium = collect('medium');
  const clears = responses => responses.filter(item => item.shot === 'clear').length / responses.length;
  const averageWidth = responses => responses.reduce((sum, item) => sum + Math.abs(item.aim), 0) / responses.length;
  assert.ok(easy.length > 50 && medium.length > 50);
  assert.ok(clears(easy) > 0.65, `easy clear share ${clears(easy)}`);
  assert.ok(clears(easy) > clears(medium) + 0.2);
  assert.ok(averageWidth(medium) > averageWidth(easy) + 0.15);
  assert.deepEqual([...new Set(medium.map(item => item.shot))].sort(), ['clear', 'drop', 'smash']);
});

test('hard AI attacks the space opposite its opponent and changes depth with opponent position', () => {
  const farOpponent = [], nearOpponent = [], highChances = [];
  for (let index = 1; index <= 80; index++) {
    const options = { seed: Math.imul(index, 2654435761) >>> 0 };
    const far = observeAIResponse('hard', { ...options, opponentDepth: 5.7 });
    const near = observeAIResponse('hard', { ...options, opponentDepth: 1.2 });
    const high = observeAIResponse('hard', { ...options, opponentDepth: 3.5 });
    if (far) farOpponent.push(far);
    if (near) nearOpponent.push(near);
    if (high) highChances.push(high);
  }
  const share = (responses, predicate) => responses.filter(predicate).length / responses.length;
  assert.ok(share(farOpponent, response => response.shot === 'drop') > 0.7);
  assert.ok(share(nearOpponent, response => response.shot === 'clear') > 0.7);
  assert.ok(share(highChances, response => response.shot === 'smash') > 0.55);
  assert.ok(share(highChances, response => response.aim < -0.6) > 0.8);
  assert.equal(highChances.length, 80, 'reachable returns are attempted; physical quality determines mistakes');
  assert.ok(highChances.every(response => response.inputShot === response.shot), 'shots are performed through the common input contract');
});

test('hard AI keeps tactical pressure while varying bounded shot plans', () => {
  const responses = [];
  for (let index = 1; index <= 180; index++) {
    const state = createMatch({difficulty: 'hard', seed: Math.imul(index, 2246822519) >>> 0});
    incoming(state, {y: 2.8, vy: -0.2, vz: 0});
    state.players[1].x = 1.8; state.players[1].z = -3.5;
    for (let tick = 0; tick < 60; tick++) {
      const input = aiInput(state, 0, 'hard');
      stepMatch(state, [input, {}]);
      if (state.hitId > 0) {
        responses.push({shot: state.lastShot, aim: input.aim, aimDepth: input.aimDepth});
        break;
      }
    }
  }
  const buckets = responses.map(response => `${response.shot}:${Math.sign(response.aim)}:${Math.round(response.aimDepth * 4)}`);
  const counts = new Map();
  for (const bucket of buckets) counts.set(bucket, (counts.get(bucket) || 0) + 1);
  assert.ok(new Set(responses.map(response => response.shot)).size >= 3);
  assert.ok(new Set(buckets).size >= 6);
  assert.ok(Math.max(...counts.values()) / buckets.length < 0.55);
});

test('movement remains in own court and diagonal input is normalized', () => {
  const direct = createMatch();
  const diagonal = createMatch();
  advance(direct, 0.2, [{ x: 1 }, {}]);
  advance(diagonal, 0.2, [{ x: 1, z: -1 }, {}]);
  assert.ok(Math.abs(Math.hypot(diagonal.players[0].vx, diagonal.players[0].vz) - Math.abs(direct.players[0].vx)) < 0.01);
  advance(diagonal, 5, [{ x: 100, z: -100 }, { x: -100, z: 100 }]);
  for (let side = 0; side < 2; side++) {
    assert.ok(Math.abs(diagonal.players[side].x) <= COURT.halfWidth);
    assert.ok(diagonal.players[side].z * (side ? -1 : 1) > 0);
  }
});

test('continuous running consumes stamina and standing recovers it', () => {
  const state = createMatch();
  advance(state, 0.8, [{ x: 1 }, {}]);
  const tired = state.players[0].stamina;
  assert.ok(tired < ROLES.balanced.maxStamina);
  advance(state, 2);
  assert.ok(state.players[0].stamina > tired);
});

test('only the serving player can begin a rally', () => {
  const state = createMatch();
  stepMatch(state, [{}, { shot: 'clear' }]);
  assert.equal(state.phase, 'serve');
  stepMatch(state, [{ shot: 'clear', aim: -0.4 }, {}]);
  advance(state, 0.1); // A short visible service windup precedes contact.
  assert.equal(state.phase, 'rally');
  assert.equal(state.shuttle.lastHit, 0);
  assert.equal(state.hitId, 1);
  assert.ok(state.shuttle.vz < 0 && state.shuttle.vy > 0);
  assert.ok(state.players[0].swing > 0);
});

test('one side cannot hit the same shuttle repeatedly or hit outside reach', () => {
  const state = createMatch();
  stepMatch(state, [{ shot: 'clear' }, {}]);
  advance(state, 0.2, [{ shot: 'smash' }, {}]);
  assert.equal(state.hitId, 1);
  incoming(state, { x: 2.5, z: 6 });
  stepMatch(state, [{ shot: 'clear' }, {}]);
  assert.equal(state.hitId, 1);
});

test('a buffered shot catches an incoming shuttle entering reach', () => {
  const state = createMatch();
  incoming(state, { z: 2.0, y: 2.4, vz: 3, vy: 0 });
  stepMatch(state, [{ shot: 'drop', aim: 0.5 }, {}]);
  advance(state, 0.3); // Diagonal service stance plus the new anticipation window.
  assert.equal(state.hitId, 1);
  assert.equal(state.lastShot, 'drop');
  assert.equal(state.shuttle.lastHit, 0);
});

test('low shuttle or low stamina smash retains the chosen attack and reports its physical risk', () => {
  const low = createMatch();
  incoming(low, { y: 1.1 });
  stepMatch(low, [{ shot: 'smash' }, {}]);
  advance(low, 0.1);
  assert.equal(low.hitId, 1);
  assert.equal(low.lastShot, 'smash');
  assert.match(low.message, /触点|低|下网/);
  const tired = createMatch();
  tired.players[0].stamina = 0;
  incoming(tired);
  stepMatch(tired, [{ shot: 'smash' }, {}]);
  advance(tired, 0.1);
  assert.equal(tired.hitId, 1);
  assert.equal(tired.lastShot, 'smash');
  assert.match(tired.message, /体力|下网/);
});

test('an unreachable smash expires with actionable feedback', () => {
  const state = createMatch();
  incoming(state, { x: 2.3, z: 6.1, y: 4.8, vx: 0, vz: 0, vy: 0 });
  stepMatch(state, [{ shot: 'smash' }, {}]);
  advance(state, 0.5);
  assert.equal(state.hitId, 0);
  assert.match(state.message, /距离|跑位|够到|未接/);
});

test('a reachable high shuttle produces a faster smash than a clear', () => {
  const a = createMatch();
  const b = createMatch();
  incoming(a, { y: 2.6 });
  incoming(b, { y: 2.6 });
  stepMatch(a, [{ shot: 'smash', charge: 0.8 }, {}]);
  stepMatch(b, [{ shot: 'clear', charge: 0.8 }, {}]);
  advance(a, 0.1);
  advance(b, 0.1);
  assert.equal(a.lastShot, 'smash');
  assert.ok(Math.abs(a.shuttle.vz) > Math.abs(b.shuttle.vz));
  assert.ok(a.players[0].stamina < b.players[0].stamina);
});

test('net contact awards one point to the opponent of last hitter', () => {
  const state = createMatch();
  incoming(state, { z: 0.03, y: 0.9, vz: -7, lastHit: 0 });
  stepMatch(state);
  assert.deepEqual(state.score, [0, 1]);
  assert.equal(state.pointId, 1);
  advance(state, 0.5);
  assert.deepEqual(state.score, [0, 1]);
  assert.match(state.message, /网/);
});

test('in-court landing wins the rally; out landing loses it; score pause resets serve', () => {
  const inside = createMatch();
  incoming(inside, { x: 0, z: -3, y: 0.01, vy: -3, vz: 0, lastHit: 0 });
  stepMatch(inside);
  assert.deepEqual(inside.score, [1, 0]);
  assert.equal(inside.server, 0);
  advance(inside, 1.3);
  assert.equal(inside.phase, 'point');
  advance(inside, 0.2);
  assert.equal(inside.phase, 'serve');
  assert.equal(inside.shuttle.active, false);
  const outside = createMatch();
  incoming(outside, { x: 3, z: -3, y: 0.01, vy: -3, vz: 0, lastHit: 0 });
  stepMatch(outside);
  assert.deepEqual(outside.score, [0, 1]);
});

test('target is immediate race-to scoring and finished state remains frozen', () => {
  const state = createMatch({ target: 5 });
  state.score = [4, 4];
  incoming(state, { z: -3, y: 0.01, vy: -3, vz: 0, lastHit: 0 });
  stepMatch(state);
  assert.equal(state.phase, 'over');
  assert.equal(state.winner, 0);
  const before = structuredClone(state);
  advance(state, 2, [{ x: 1, shot: 'clear' }, {}]);
  assert.deepEqual(state, before);
});

test('pause freezes court, deducts quota, resumes through countdown', () => {
  const state = createMatch();
  stepMatch(state, [{ shot: 'clear' }, {}]);
  advance(state, 0.1);
  assert.equal(pauseMatch(state, 0), true);
  const before = structuredClone(state.shuttle);
  advance(state, 3, [{ x: 1, shot: 'clear' }, {}]);
  assert.deepEqual(state.shuttle, before);
  assert.ok(Math.abs(state.pause.remaining - 27) < 0.01);
  assert.deepEqual(state.pause.used, [1, 0]);
  assert.equal(resumeMatch(state), true);
  assert.equal(state.phase, 'countdown');
  advance(state, 0.5);
  assert.deepEqual(state.shuttle, before);
  advance(state, 3);
  assert.equal(state.phase, 'rally');
  assert.equal(pauseMatch(state, 0), false);
  assert.equal(pauseMatch(state, 1), true);
});

test('pause timeout chooses score leader and ties end without a winner', () => {
  for (const [score, winner] of [[[2, 3], 1], [[3, 2], 0], [[2, 2], null]]) {
    const state = createMatch();
    state.score = score;
    pauseMatch(state, 0);
    advance(state, 30.1);
    assert.equal(state.phase, 'over');
    assert.equal(state.winner, winner);
    assert.match(state.message, /暂停超时/);
  }
});

test('explicit finish supports no-winner outcome', () => {
  const state = createMatch();
  finishMatch(state, null, '比赛已结束');
  assert.equal(state.phase, 'over');
  assert.equal(state.shuttle.active, false);
  assert.equal(state.winner, null);
  assert.equal(state.message, '比赛已结束');
  assert.equal(pauseMatch(state, 0), false);
});

test('all AI difficulties play complete matches through the shared input interface', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const state = createMatch({ difficulty, seed: 834 });
    let maximumRally = 0;
    for (let i = 0; i < 60 * 240 && state.phase !== 'over'; i++) {
      const inputs = [aiInput(state, 0, difficulty), aiInput(state, 1, difficulty)];
      for (const input of inputs) assert.ok(Math.hypot(input.x, input.z) <= 1.001);
      stepMatch(state, inputs, frame);
      maximumRally = Math.max(maximumRally, state.rally);
    }
    assert.equal(state.phase, 'over', difficulty);
    assert.ok(maximumRally >= 3, `${difficulty}: needs real returns, got ${maximumRally}`);
    assert.ok(state.hitId > state.pointId * 1.5, `${difficulty}: too few returns`);
    assert.ok(state.score.includes(5));
  }
});

test('AI decisions do not randomly abandon an otherwise reachable return', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) for (let seed = 1; seed <= 40; seed++) {
    const s = createMatch({seed, difficulty}); incoming(s, {y: 2.8, vy: -0.2, vz: 0});
    aiInput(s, 0, difficulty);
    assert.equal(Object.hasOwn(s._ai[0], 'miss'), false, 'quality and positioning determine mistakes');
    s.time = s._ai[0].ready + 0.01;
    s.shuttle.y = 1.7; s.shuttle.vy = -1;
    s.players[0].x = s.shuttle.x; s.players[0].z = s.shuttle.z;
    assert.ok(aiInput(s, 0, difficulty).shot, `${difficulty}/${seed} attempts the return`);
  }
});
