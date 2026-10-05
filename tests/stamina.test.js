import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, ROLES, pauseMatch, resumeMatch, RULES_VERSION } from '../shared/game.js';
import { staminaDisplay, placeStaminaMeter } from '../src/stamina-hud.js';
import { NetworkPlayback } from '../src/network-playback.js';

const run = (s, seconds, input = [{}, {}], frame = 1 / 120) => {
  for (let t = 0; t < seconds - 1e-9; t += frame) stepMatch(s, input, Math.min(frame, seconds - t));
};
const rally = role => {
  const s = createMatch({ roles: [role, role] }); s.phase = 'rally';
  s.players.forEach(p => { p.stamina = 30; }); return s;
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, a + ' ≠ ' + b);

test('all roles and both sides freeze regeneration outside rallies, across a new serve', () => {
  for (const role of Object.keys(ROLES)) for (const phase of ['serve', 'point', 'intermission', 'paused', 'countdown', 'over']) {
    const s = rally(role); s.phase = phase; s.timer = 3;
    run(s, .5); s.players.forEach(p => { near(p.stamina, 30); near(p.recoveryWait, 0); });
    if (phase === 'point' || phase === 'intermission') { s.timer = .02; run(s, .1); assert.equal(s.phase, 'serve'); s.players.forEach(p => near(p.stamina, 30)); }
  }
});
test('recovery waits exactly .35 seconds and is independent of render cadence', () => {
  const totals = [];
  for (const frame of [1 / 30, 1 / 60, 1 / 120]) {
    const s = rally('balanced'); run(s, .35, undefined, frame); near(s.players[0].stamina, 30);
    run(s, .65, undefined, frame); near(s.players[0].stamina, 30 + ROLES.balanced.recovery * .65); totals.push(s.players[0].stamina);
  }
  totals.forEach(v => near(v, totals[0]));
});
test('slow movement can recover for every role; .4+ input and full stick against a wall cannot', () => {
  for (const role of Object.keys(ROLES)) {
    const s = rally(role); run(s, 1, [{ x: .25 }, { x: -.25 }]);
    s.players.forEach(p => { assert.ok(p.stamina > 30); assert.equal(p.staminaStatus, 'recovering'); });
    const wall = rally(role); wall.players[0].x = 2.43; run(wall, 1, [{ x: 1 }, {}]);
    near(wall.players[0].stamina, 30); near(wall.players[0].recoveryWait, 0);
    run(wall, .2, [{ x: .4 }, {}]); assert.ok(wall.players[0].stamina <= 30);
  }
});
test('current prepare input interrupts recovery immediately; pause and countdown restart the wait', () => {
  const s = rally('balanced'); run(s, .5); const before = s.players[0].stamina;
  run(s, 1 / 120, [{ prepare: 'clear' }, {}]); near(s.players[0].stamina, before); near(s.players[0].recoveryWait, 0);
  run(s, .3); near(s.players[0].stamina, before);
  pauseMatch(s, 0); resumeMatch(s); run(s, 2); const paused = s.players[0].stamina;
  run(s, .35); near(s.players[0].stamina, paused);
});
test('V4 jump and .24s landing buffer precede the continuous low-effort wait', () => {
  const s = rally('balanced'); s.motionProfile = 'v4';
  s.players[0].action = { id: 1, stage: 'recovery', startedAt: -.1, contactAt: -.1, endsAt: .84, jump: { takeoffAt: 0, landAt: .6, height: .4 } };
  run(s, .84); near(s.players[0].stamina, 30); run(s, .35); near(s.players[0].stamina, 30);
  run(s, .1); near(s.players[0].stamina, 30 + ROLES.balanced.recovery * .1);
});
test('the scoring slice only credits eligible time before exact impact', () => {
  const s = rally('balanced'); s.players.forEach(p => { p.recoveryWait = .35; });
  Object.assign(s.shuttle, { x: 0, y: .001, z: -4, vx: 0, vy: -1, vz: 0, active: true, lastHit: 0 });
  stepMatch(s, [{}, {}], 1 / 120);
  assert.equal(s.phase, 'point'); near(s.players[0].stamina, 30 + ROLES.balanced.recovery * s.rallyEnd.at);
});
test('zero stamina retains movement and serving, with explicit before/after cost anchors', () => {
  const s = createMatch(); s.players[0].stamina = 0; run(s, .1, [{ x: .2 }, {}]);
  assert.ok(s.players[0].vx > 0); stepMatch(s, [{ shot: 'clear' }, {}]); run(s, .2);
  assert.equal(s.hitId, 1); near(s.lastShotInfo.staminaBefore, 0); near(s.lastShotInfo.staminaAfter, 0);
  assert.equal(s.rulesVersion, RULES_VERSION); assert.equal(s.lastShotInfo.serving, true);
});
test('network stamina stays before cost until contact, including contact plus point in one packet', () => {
  const a = rally('balanced'); a.time = 1; a.players[0].stamina = 60;
  const b = structuredClone(a); b.time = 1.1; b.hitId = 1; b.pointId = 1; b.phase = 'point'; b.players[0].stamina = 41;
  b.lastShotInfo = { side: 0, at: 1.05, staminaBefore: 59, staminaAfter: 41 };
  b.players[0].action = { startedAt: 1.01, contactAt: 1.05, endsAt: 1.5, contact: { x: 0, y: 1, z: 3 } };
  b.rallyEnd = { at: 1.08, x: 0, y: 0, z: -3 };
  const p = new NetworkPlayback({ bufferMs: 0, minBufferMs: 0, maxBufferMs: 0 });
  p.receive(a, 1000, { seq: 1, serverTime: 1000, matchId: 1 }); p.receive(b, 1100, { seq: 2, serverTime: 1100, matchId: 1 });
  assert.ok(p.sample(1049).players[0].stamina > 59); near(p.sample(1050).players[0].stamina, 41);
  assert.equal(p.sample(1060).phase, 'rally'); assert.equal(p.sample(1080).phase, 'point');
});
test('HUD normalizes each role and has shape, percent, waiting and net recovery cues', () => {
  const s = rally('power'), p = s.players[0]; p.stamina = 28; p.staminaStatus = 'waiting';
  assert.equal(staminaDisplay(p, 'rally', true).percent, 25);
  p.stamina = 27; assert.match(staminaDisplay(p, 'rally', true).label, /△.*调整/);
  p.staminaStatus = 'recovering'; assert.match(staminaDisplay(p, 'rally', true).label, /恢复中/);
  assert.equal(staminaDisplay(p, 'paused', true).status, 'paused');
});

test('portrait rear-corner stamina stays below the foot anchor and clears fixed shot controls', () => {
  const bounds = { left: 0, top: 0, right: 390, bottom: 844 };
  const anchor = { x: 326, y: 602 };
  assert.deepEqual(placeStaminaMeter(anchor, bounds, true), anchor);
  const controls = [{ left: 246, right: 378, top: 584, bottom: 710 }];
  const placed = placeStaminaMeter(anchor, bounds, true, controls);
  assert.equal(placed.y, anchor.y);
  assert.ok(placed.x + 38 <= controls[0].left - 6);
  assert.ok(placed.x - 38 >= bounds.left);
});
