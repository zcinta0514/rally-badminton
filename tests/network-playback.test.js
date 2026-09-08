import test from 'node:test';
import assert from 'node:assert/strict';
import { NetworkPlayback } from '../src/network-playback.js';
import { createMatch, stepMatch, pauseMatch, resumeMatch, finishMatch } from '../shared/game.js';
import { sampleAthletePose } from '../src/athlete.js';
import * as THREE from 'three';
import { CourtView } from '../src/view.js';
import { makeAthlete } from '../src/athlete.js';

const copy = state => structuredClone(state);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-7, `${message || ''}: ${actual} != ${expected}`);
const playback = () => new NetworkPlayback({ bufferMs: 60, minBufferMs: 60, maxBufferMs: 60 });
const receive = (player, state, at, seq, extra = {}) => player.receive(copy(state), at + 100, { serverTime: at, seq, matchId: 1, ...extra });
function liveState() {
  const state = createMatch(); state.phase = 'rally'; state.service.active = false;
  Object.assign(state.shuttle, { x: .2, y: 4, z: 3, vx: .8, vy: 2, vz: -6, active: true, lastHit: 0 });
  state.hitId = 1; state.rally = 1;
  return state;
}

test('20 Hz snapshots produce intermediate body and parabolic shuttle positions without mutating snapshots', () => {
  const player = playback(), first = liveState();
  receive(player, first, 0, 1);
  const last = copy(first); stepMatch(last, [{ x: 1 }, {}], .05); const saved = copy(last);
  receive(player, last, 50, 2);
  const middle = player.sample(185);
  near(middle.time, .025, 'one shared animation time');
  near(middle.players[0].x, (first.players[0].x + last.players[0].x) / 2, 'body interpolation');
  near(middle.shuttle.x, first.shuttle.x + first.shuttle.vx * .025, 'ball x');
  near(middle.shuttle.y, first.shuttle.y + first.shuttle.vy * .025 - 9.81 * .025 ** 2 / 2, 'parabolic ball height');
  assert.ok(player.sample(190).shuttle.z < middle.shuttle.z, 'ball moves between packets');
  assert.deepEqual(last, saved);
  middle.players[0].x = 999;
  assert.notEqual(player.sample(195).players[0].x, 999, 'display mutations cannot corrupt the buffer');
});

test('a real serve switches hit, ball trajectory and contact action on the same display instant', () => {
  const state = createMatch(), frames = [copy(state)];
  for (let frame = 1; frame <= 10; frame++) {
    stepMatch(state, [frame === 1 ? { shot: 'clear', charge: .4 } : {}, {}], 1 / 120);
    if (frame % 6 === 0 || frame === 10) frames.push(copy(state));
  }
  assert.equal(state.hitId, 1);
  const before = frames.find(frame => frame.players[0].action?.stage === 'windup');
  assert.ok(before);
  const after = copy(state), player = playback(), contactAt = after.players[0].action.contactAt;
  receive(player, before, before.time * 1000, 1);
  receive(player, after, after.time * 1000, 2);
  const sampleAt = time => player.sample(time * 1000 + 160);
  const windup = sampleAt(contactAt - .001);
  assert.equal(windup.hitId, 0); assert.equal(windup.phase, 'serve');
  assert.ok(windup.players[0].action, 'upcoming contact action remains visible before impact');
  const contact = sampleAt(contactAt);
  assert.equal(contact.hitId, 1); assert.equal(contact.phase, 'rally');
  for (const axis of ['x', 'y', 'z']) near(contact.shuttle[axis], after.players[0].action.contact[axis], `contact ${axis}`);
  const pose = sampleAthletePose(contact.players[0], 0, contact.shuttle, contact.time);
  near(pose.racketHead.x + contact.players[0].x, contact.shuttle.x, 'racket meets shuttle x');
  near(pose.racketHead.y, contact.shuttle.y, 'racket meets shuttle height');
  near(pose.racketHead.z + contact.players[0].z, contact.shuttle.z, 'racket meets shuttle z');
  assert.ok(sampleAt(contactAt + .001).shuttle.z < contact.shuttle.z, 'new trajectory starts after contact');
});

test('an incoming rally reverses at its real contact instead of cutting a line between snapshots', () => {
  const state = liveState();
  Object.assign(state.players[0], { x: 0, z: 3.8 });
  Object.assign(state.shuttle, { x: .2, y: 1.6, z: 3.7, vx: 0, vy: -.1, vz: .8, lastHit: 1 });
  let before = copy(state);
  for (let frame = 0; frame < 20 && state.hitId === 1; frame++) {
    before = copy(state);
    stepMatch(state, [frame === 0 ? { shot: 'clear', charge: .4 } : {}, {}], 1 / 120);
  }
  assert.equal(state.hitId, 2);
  const at = state.lastShotInfo.at, contact = copy(state.players[0].action.contact);
  stepMatch(state, [{}, {}], .025);
  const player = playback();
  receive(player, before, before.time * 1000, 1); receive(player, state, state.time * 1000, 2);
  const pre = player.sample((at - .001) * 1000 + 160);
  const impact = player.sample(at * 1000 + 160);
  const post = player.sample((at + .001) * 1000 + 160);
  assert.equal(pre.hitId, 1); assert.equal(impact.hitId, 2);
  near(impact.shuttle.z, contact.z);
  assert.ok(pre.shuttle.z < impact.shuttle.z && post.shuttle.z < impact.shuttle.z);
});

test('a real landing reveals the score and the existing tail at impact, never early', () => {
  const state = liveState();
  Object.assign(state.shuttle, { x: 0, y: .03, z: -3, vx: 0, vy: -1, vz: 0 });
  const before = copy(state); stepMatch(state, [{}, {}], .05);
  assert.equal(state.phase, 'point'); const player = playback(), at = state.rallyEnd.at;
  receive(player, before, 0, 1); receive(player, state, 50, 2);
  const pre = player.sample((at - .001) * 1000 + 160);
  assert.equal(pre.phase, 'rally'); assert.deepEqual(pre.score, [0, 0]); assert.equal(pre.rallyEnd, null);
  const impact = player.sample(at * 1000 + 160);
  assert.equal(impact.phase, 'point'); assert.deepEqual(impact.score, state.score);
  assert.deepEqual(impact.rallyEnd, state.rallyEnd); near(impact.time, at);
  near(impact.shuttle.y, 0); assert.equal(impact.shuttle.active, false);
});

test('serve placement after a point is not blended across the court', () => {
  const state = liveState(); Object.assign(state.shuttle, { y: .01, z: -3, vy: -1, vz: 0 });
  stepMatch(state, [{}, {}], .025);
  Object.assign(state.players[0], { x: 2, z: .8 }); state.timer = .03;
  const before = copy(state); stepMatch(state, [{}, {}], .05); assert.equal(state.phase, 'serve');
  const player = playback(); receive(player, before, 0, 1); receive(player, state, 50, 2);
  const pre = player.sample(185); assert.equal(pre.phase, 'point'); near(pre.players[0].x, 2);
  const served = player.sample(210); assert.equal(served.phase, 'serve'); near(served.players[0].x, state.players[0].x);
});

test('pause, resume countdown and interrupted countdown freeze all match-time animation', () => {
  const state = liveState(), player = playback();
  receive(player, state, 0, 1); stepMatch(state, [{ x: 1 }, {}], .05); receive(player, state, 50, 2);
  assert.ok(pauseMatch(state, 0)); receive(player, state, 60, 3);
  const frozen = player.sample(160); assert.equal(frozen.phase, 'paused'); near(frozen.time, state.time);
  stepMatch(state, [{}, {}], .05); receive(player, state, 110, 4);
  const later = player.sample(230); near(later.time, frozen.time); near(later.players[0].x, frozen.players[0].x);
  assert.ok(later.timer < frozen.timer);
  resumeMatch(state); receive(player, state, 120, 5); assert.equal(player.sample(220).phase, 'countdown');
  state.phase = 'paused'; state.timer = state.pause.remaining; receive(player, state, 130, 6);
  assert.equal(player.sample(230).phase, 'paused'); near(player.sample(1000).time, frozen.time);
  resumeMatch(state); stepMatch(state, [{}, {}], 2); receive(player, state, 2130, 7);
  assert.equal(player.sample(2230).phase, 'rally'); near(player.sample(2230).time, state.time);
});

test('disconnect freezes the displayed frame and receiving a recovery snapshot resets stale history', () => {
  const state = liveState(), player = playback(); receive(player, state, 0, 1);
  stepMatch(state, [{}, {}], .05); receive(player, state, 50, 2);
  const frozen = player.freeze(185); assert.deepEqual(player.sample(5000), frozen);
  pauseMatch(state, 0); receive(player, state, 5000, 3);
  assert.equal(player.sample(5100).phase, 'paused'); assert.equal(player.metrics(5100).frozen, false);
  player.reset(); assert.equal(player.sample(5200), null);
});

test('packet gaps hold the latest known state and never invent later scores or motion', () => {
  const state = liveState(), player = playback(); receive(player, state, 0, 1);
  stepMatch(state, [{}, {}], .05); receive(player, state, 50, 2);
  const held = player.sample(5000); near(held.time, state.time); assert.deepEqual(held.score, state.score);
  near(held.shuttle.z, state.shuttle.z); assert.ok(player.metrics(5000).underruns >= 1);
});

test('out-of-order snapshots are ignored and rematches reset match time without mixing old points', () => {
  const state = liveState(), player = playback(); state.time = 20; state.pointId = 7;
  receive(player, state, 1000, 5); const stale = copy(state); stale.time = 19;
  assert.equal(receive(player, stale, 900, 4), false); near(player.sample(1100).time, 20);
  receive(player, createMatch(), 1050, 6, { matchId: 2 }); near(player.sample(1150).time, 0);
  assert.equal(player.sample(1150).pointId, 0);
  assert.equal(receive(player, state, 1060, 7, { matchId: 1 }), false, 'old match cannot reappear');
});

test('legacy snapshots still interpolate and time resets flush their old history', () => {
  const state = liveState(), player = playback(); player.receive(copy(state), 100);
  stepMatch(state, [{}, {}], .05); player.receive(copy(state), 150);
  near(player.sample(185).time, .025);
  player.receive(createMatch(), 200); near(player.sample(200).time, 0);
});

test('pause timeout and non-score match termination are displayed immediately', () => {
  const state = liveState(), player = playback(); receive(player, state, 0, 1);
  finishMatch(state, null, 'connection closed'); receive(player, state, 10, 2);
  assert.equal(player.sample(110).phase, 'over'); assert.equal(player.sample(110).winner, null);
});

test('adaptive jitter buffering stays bounded and display time never runs backwards', () => {
  const player = new NetworkPlayback(), state = liveState(); let previous = -Infinity;
  for (let i = 0; i < 80; i++) {
    const at = i * 50, jitter = i % 3 === 0 ? 35 : 0; state.time = i * .05;
    player.receive(copy(state), at + 100 + jitter, { serverTime: at, seq: i, matchId: 1 });
    const display = player.sample(at + 135); assert.ok(display.time >= previous); previous = display.time;
  }
  const stats = player.metrics(4100);
  assert.ok(stats.bufferMs >= 50 && stats.bufferMs <= 140);
  assert.ok(stats.jitterMs > 0); near(stats.intervalMs, 50); near(stats.snapshotHz, 20);
  assert.ok(stats.bufferedSnapshots <= 48, 'buffer size remains bounded');
});

test('a real contact and final net fault in one packet disclose hit and final score separately', () => {
  const state = liveState(); state.score = [0, 4];
  Object.assign(state.players[0], { x: 0, z: .54 });
  Object.assign(state.shuttle, { x: .2, y: .7, z: .2, vx: 0, vy: -.1, vz: 0, lastHit: 1 });
  for (let i = 0; i < 6; i++) stepMatch(state, [i === 0 ? { shot: 'smash', charge: .8 } : {}, {}], 1 / 120);
  const before = copy(state);
  for (let i = 0; i < 6; i++) stepMatch(state, [{}, {}], 1 / 120);
  assert.equal(state.phase, 'over'); assert.equal(state.hitId, before.hitId + 1);
  const player = playback(); receive(player, before, 50, 1); receive(player, state, 100, 2);
  // The finished simulation freezes at collision, even though packet clocks advance.
  const sampleTime = time => 160 + time * 1000;
  const during = player.sample(sampleTime((state.lastShotInfo.at + state.rallyEnd.at) / 2));
  assert.equal(during.hitId, state.hitId); assert.equal(during.phase, 'rally');
  assert.deepEqual(during.score, [0, 4]); assert.equal(during.winner, null); assert.equal(during.rallyEnd, null);
  assert.equal(during.timer, 0, 'the future point timer is not visible during a rally');
  const ended = player.sample(sampleTime(state.rallyEnd.at));
  assert.equal(ended.phase, 'over'); assert.equal(ended.winner, 1); assert.deepEqual(ended.score, [0, 5]);
  assert.deepEqual(ended.rallyEnd, state.rallyEnd);
});

test('a sub-slice net collision never presents a score before its recorded contact', () => {
  const state = liveState(); state.score = [0, 4];
  Object.assign(state.players[0], { x: 0, z: .54 });
  Object.assign(state.shuttle, { x: .2, y: .7, z: .1, vx: 0, vy: -.1, vz: 0, lastHit: 1 });
  for (let i = 0; i < 6; i++) stepMatch(state, [i === 0 ? { shot: 'smash', charge: .8 } : {}, {}], 1 / 120);
  const before = copy(state);
  for (let i = 0; i < 6; i++) stepMatch(state, [{}, {}], 1 / 120);
  assert.ok(state.rallyEnd.at < state.lastShotInfo.at, 'physics can record a within-slice collision just before the slice contact time');
  const player = playback(); receive(player, before, 50, 1); receive(player, state, 100, 2);
  const between = (state.rallyEnd.at + state.lastShotInfo.at) / 2;
  const display = player.sample(160 + between * 1000);
  assert.equal(display.hitId, before.hitId); assert.equal(display.pointId, before.pointId); assert.equal(display.phase, 'rally');
});

test('a gap hiding multiple contacts freezes the entire prior frame instead of advancing an unsupported action', () => {
  const state = liveState(), player = playback(); receive(player, state, 0, 1);
  const later = copy(state); later.time = .5; later.hitId += 2;
  receive(player, later, 500, 2);
  const held = player.sample(400); near(held.time, state.time); near(held.shuttle.z, state.shuttle.z);
});

function sceneView() {
  const view = Object.create(CourtView.prototype); view.scene = new THREE.Scene();
  view.players = [makeAthlete(view.scene, 0), makeAthlete(view.scene, 1)]; view.makeShuttle();
  view.netGeometry = new THREE.BufferGeometry();
  view.netGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, .8, 0, 0, 1.52, 0], 3));
  view.netAtRest = true; view.cameraSide = 0; view.mode = 'menu'; view.elapsed = 0;
  view.edgeIndicator = { hidden: true }; view.updateHints = () => {}; view.renderer = { render() {} };
  return view;
}
function withView(run) {
  const previous = globalThis.document; globalThis.document = { querySelector: () => null };
  try { run(sceneView()); } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
}

test('the real view freezes a whole displayed frame on pause and countdown, including racket and shuttle', () => withView(view => {
  const state = liveState(), player = playback(); receive(player, state, 0, 1);
  stepMatch(state, [{ x: 1 }, {}], .05); receive(player, state, 50, 2);
  const shown = player.sample(175); view.render(shown, 0, 1 / 60);
  const pose = copy(view.players[0].root.userData.pose);
  stepMatch(state, [{ x: 1 }, {}], .025); pauseMatch(state, 0); receive(player, state, 75, 3);
  const paused = player.sample(180); view.render(paused, 0, 1 / 60);
  assert.equal(paused.phase, 'paused'); near(paused.time, shown.time);
  for (const axis of ['x', 'y', 'z']) near(view.shuttle.position[axis], shown.shuttle[axis], `frozen ball ${axis}`);
  near(view.players[0].root.position.x, paused.players[0].x, 'rendered root agrees with the displayed snapshot');
  assert.deepEqual(view.players[0].root.userData.pose, pose, 'existing full-pose freeze is retained');
  stepMatch(state, [{}, {}], .05); receive(player, state, 125, 4);
  const waiting = player.sample(230); assert.ok(waiting.pause.remaining < paused.pause.remaining); near(waiting.time, shown.time);
  resumeMatch(state); receive(player, state, 130, 5); const countdown = player.sample(230);
  assert.equal(countdown.phase, 'countdown'); assert.deepEqual(countdown.shuttle, shown.shuttle); near(countdown.time, shown.time);
  stepMatch(state, [{}, {}], 2); receive(player, state, 2130, 6);
  near(player.sample(2230).time, state.time, 'resuming rebases to the server');
}));

test('scoring immediately before pause never combines the preceding ball with a new score tail', () => withView(view => {
  const state = liveState(); Object.assign(state.shuttle, { x: 0, y: .03, z: -3, vx: 0, vy: -1, vz: 0 });
  const player = playback(); receive(player, state, 0, 1); view.render(player.sample(100), 0, 1 / 60);
  stepMatch(state, [{ x: 1 }, {}], .05); assert.equal(state.phase, 'point'); pauseMatch(state, 0);
  receive(player, state, 50, 2); const paused = player.sample(150); view.render(paused, 0, 1 / 60);
  assert.equal(paused.pointId, state.pointId); assert.deepEqual(paused.rallyEnd, state.rallyEnd);
  assert.deepEqual(paused.shuttle, state.shuttle); near(paused.time, state.time);
  near(view.players[0].root.position.x, paused.players[0].x, 'new scored frame resets the frozen body anchor');
}));
