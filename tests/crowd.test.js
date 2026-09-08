import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as arenaApi from '../src/arena.js';
import { CourtView } from '../src/view.js';
import { makeAthlete } from '../src/athlete.js';
import { createMatch } from '../shared/game.js';

const frame = 1 / 60;
const makeArena = () => arenaApi.makeArena(new THREE.Scene());
const live = () => Object.assign(createMatch(), { phase: 'rally', time: 5, hitId: 4, rally: 4 });
function point(state, extra = {}) {
  Object.assign(state, { phase: 'point', time: state.time + .1, pointId: state.pointId + 1, lastShot: 'smash' }, extra);
  state.rallyEnd = { id: state.pointId, kind: 'in', winner: 0, hitSide: 0, at: state.time,
    x: 0, y: 0, z: -3, vx: 0, vy: -5, vz: -9, hitId: state.hitId, duration: 1.4 };
  return state;
}
function update(arena, state, count = 1, options) {
  for (let i = 0; i < count; i++) arenaApi.updateArenaCrowd?.(arena, state, frame, options);
}
const snapshot = arena => arena.children.map(mesh => mesh.instanceMatrix.array.slice());
function changed(arena, before) {
  const result = [];
  arena.children.forEach((mesh, batch) => {
    for (let index = 0; index < mesh.count; index++) {
      if (mesh.instanceMatrix.array.slice(index * 16, index * 16 + 16).some((value, i) => value !== before[batch][index * 16 + i])) {
        result.push({ mesh, index });
      }
    }
  });
  return result;
}
function startReaction(arena, state, before) {
  update(arena, state);
  point(state);
  update(arena, state, 18);
  assert.ok(changed(arena, before).length > 0, 'a new exciting point must move spectators');
}

test('a new exciting point moves twelve upper bodies in the existing six batches and restores exact rest matrices', () => {
  const arena = makeArena(), before = snapshot(arena), state = live();
  assert.deepEqual(arena.children.map(mesh => [mesh.name, mesh.count]), [
    ['arena-box:solid', 820], ['arena-box:light', 14], ['arena-head:solid', 172],
    ['arena-limb:solid', 334], ['arena-bag:solid', 4], ['furniture-contact-shadows', 7],
  ]);
  startReaction(arena, state, before);
  const crowd = arena.userData.crowd;
  assert.equal(crowd.people.length, 12);
  const allowed = crowd.people.flatMap(person => person.parts);
  assert.equal(allowed.length, 60);
  assert.ok(changed(arena, before).every(part => allowed.some(candidate => candidate.mesh === part.mesh && candidate.index === part.index)),
    'legs, feet, seats, officials and all other venue instances must remain fixed');
  for (const person of crowd.people) {
    assert.deepEqual(person.parts.map(part => part.kind), ['torso', 'head', 'hair', 'arm', 'arm']);
    const torso = person.parts[0], matrix = new THREE.Matrix4();
    torso.mesh.getMatrixAt(torso.index, matrix);
    const hip = new THREE.Vector3(0, -.5, 0).applyMatrix4(matrix);
    const restHip = new THREE.Vector3(0, -.5, 0).applyMatrix4(torso.rest);
    assert.ok(hip.distanceTo(restHip) < 1e-6, 'the seated torso base must stay anchored');
  }
  for (const { mesh, index } of changed(arena, before)) {
    const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
    mesh.geometry.computeBoundingSphere();
    const partBounds = mesh.geometry.boundingSphere.clone().applyMatrix4(matrix);
    assert.ok(mesh.boundingSphere.center.distanceTo(partBounds.center) + partBounds.radius <= mesh.boundingSphere.radius + 1e-5,
      'animated instances must stay within their batch culling bounds');
  }
  const authoritative = structuredClone(state);
  update(arena, state, 100);
  assert.deepEqual(snapshot(arena), before);
  assert.deepEqual(state, authoritative, 'presentation cannot mutate match state');
  update(arena, state, 90);
  assert.deepEqual(snapshot(arena), before, 'repeated scoring snapshots never replay the reaction');
});

test('first load and older scoring snapshots never start a reaction', () => {
  const arena = makeArena(), before = snapshot(arena), state = point(live(), { pointId: 4 });
  update(arena, state, 40);
  assert.deepEqual(snapshot(arena), before);
  point(state); update(arena, state, 18);
  assert.ok(changed(arena, before).length > 0);
  update(arena, state, 100);
  update(arena, { ...state, pointId: 4, time: state.time + .1, rallyEnd: { ...state.rallyEnd, id: 4 } }, 40);
  assert.deepEqual(snapshot(arena), before);
  update(arena, state, 40);
  assert.deepEqual(snapshot(arena), before, 'returning to the newest known snapshot does not replay');
});

test('an old point-zero snapshot cannot lower the consumed scoring highwater', () => {
  const arena = makeArena(), before = snapshot(arena), state = live(), original = structuredClone(state);
  startReaction(arena, state, before); update(arena, state, 100);
  update(arena, original); update(arena, state, 18);
  assert.equal(changed(arena, before).length, 0, 'the already-consumed point must not replay after an old point-zero snapshot');
  point(state); update(arena, state, 18);
  assert.ok(changed(arena, before).length > 0, 'a genuinely new point still reacts');
});

test('explicit view reset primes a new match when the view is already in match mode', () => {
  const arena = makeArena(), before = snapshot(arena), state = live();
  startReaction(arena, state, before);
  const view = Object.create(CourtView.prototype); view.arena = arena; view.mode = 'match';
  assert.equal(typeof view.resetCrowd, 'function');
  view.resetCrowd();
  assert.deepEqual(snapshot(arena), before);
  const nextMatch = createMatch(); update(arena, nextMatch);
  point(nextMatch); update(arena, nextMatch, 18);
  assert.ok(changed(arena, before).length > 0, 'point one of a new match must react independently of the previous match');
});

test('delayed or implausibly future scores are consumed without replaying a full crowd reaction', () => {
  for (const age of [1.1, .66, -.03]) {
    const arena = makeArena(), before = snapshot(arena), state = live(); update(arena, state);
    point(state); state.rallyEnd.at = state.time - age;
    update(arena, state, 18);
    assert.equal(changed(arena, before).length, 0, `score age ${age} is outside the audio freshness window`);
    state.rallyEnd.at = state.time; update(arena, state, 18);
    assert.deepEqual(snapshot(arena), before, 'a consumed stale score cannot replay with a changed timestamp');
    point(state); state.rallyEnd.at = state.time - .64; update(arena, state, 18);
    assert.ok(changed(arena, before).length > 0, 'a fresh subsequent point still reacts');
  }
  for (const gap of [.1, .3]) {
    const arena = makeArena(), before = snapshot(arena), state = live(); update(arena, state);
    const previousTime = state.time; point(state); state.time = previousTime + gap; delete state.rallyEnd.at;
    update(arena, state, 18);
    assert.equal(changed(arena, before).length > 0, gap <= .25, 'legacy scores require a recent consecutive snapshot');
  }
});

test('faults and routine short rallies stay quiet while a legal eight-shot rally can trigger', () => {
  const arena = makeArena(), before = snapshot(arena), state = live(); update(arena, state);
  for (const kind of ['out', 'net', 'serviceFault']) {
    point(state); state.rallyEnd.kind = kind; update(arena, state, 30);
    assert.deepEqual(snapshot(arena), before);
  }
  point(state, { lastShot: 'clear', rally: 7 }); update(arena, state, 30);
  assert.deepEqual(snapshot(arena), before);
  point(state, { lastShot: 'clear', rally: 8 }); update(arena, state, 18);
  assert.ok(changed(arena, before).length > 0);
});

test('background and disabled presentation clear active reactions and never replay hidden scores', () => {
  for (const options of [{ hidden: true }, { enabled: false }]) {
    const arena = makeArena(), before = snapshot(arena), state = live();
    startReaction(arena, state, before);
    update(arena, state, 1, options);
    assert.deepEqual(snapshot(arena), before);
    point(state); update(arena, state, 10, options); update(arena, state, 30);
    assert.deepEqual(snapshot(arena), before);
    point(state); update(arena, state, 18);
    assert.ok(changed(arena, before).length > 0, 'subsequent visible scores still react');
  }
});

test('pause and countdown clear reactions without replaying the consumed point', () => {
  for (const phase of ['paused', 'countdown']) {
    const arena = makeArena(), before = snapshot(arena), state = live();
    startReaction(arena, state, before);
    state.phase = phase; update(arena, state, 40);
    assert.deepEqual(snapshot(arena), before);
    state.phase = 'point'; update(arena, state, 40);
    assert.deepEqual(snapshot(arena), before);
  }
});

test('a final point completes using frame time even when authoritative time is stopped', () => {
  const arena = makeArena(), before = snapshot(arena), state = live(); update(arena, state);
  point(state, { phase: 'over', winner: 0 }); const authoritative = structuredClone(state);
  update(arena, state, 18); assert.ok(changed(arena, before).length > 0);
  update(arena, state, 100);
  assert.deepEqual(snapshot(arena), before); assert.deepEqual(state, authoritative);
});

test('next serve, a fresh match, and an explicit reset immediately restore seated spectators', () => {
  for (const reset of ['serve', 'match', 'explicit']) {
    const arena = makeArena(), before = snapshot(arena), state = live();
    startReaction(arena, state, before);
    if (reset === 'serve') { state.phase = 'serve'; state.rallyEnd = null; update(arena, state); }
    else if (reset === 'match') update(arena, createMatch());
    else arenaApi.resetArenaCrowd(arena);
    assert.deepEqual(snapshot(arena), before);
    if (reset === 'explicit') {
      update(arena, state, 30); assert.deepEqual(snapshot(arena), before, 'reset re-primes without replay');
    }
  }
});

test('production view integrates crowd updates and resets them on menu, visibility and final-point transitions', () => {
  const previous = globalThis.document;
  globalThis.document = { hidden: false, querySelector: () => null };
  try {
    const view = Object.create(CourtView.prototype); view.scene = new THREE.Scene(); view.makeCourt();
    view.players = [makeAthlete(view.scene, 0), makeAthlete(view.scene, 1)]; view.makeShuttle();
    view.cameraSide = 0; view.mode = 'match'; view.elapsed = 0; view.edgeIndicator = { hidden: true };
    view.updateHints = () => {}; view.resize = () => {}; view.renderer = { render() {} };
    const before = snapshot(view.arena), state = live(); state.shuttle.active = false;
    view.render(state, 0, frame); point(state, { phase: 'over' });
    for (let i = 0; i < 18; i++) view.render(state, 0, frame);
    assert.ok(changed(view.arena, before).length > 0);
    globalThis.document.hidden = true; view.render(state, 0, frame);
    assert.deepEqual(snapshot(view.arena), before);
    globalThis.document.hidden = false; point(state, { phase: 'over' });
    for (let i = 0; i < 18; i++) view.render(state, 0, frame);
    assert.ok(changed(view.arena, before).length > 0);
    view.setMode('menu'); assert.deepEqual(snapshot(view.arena), before);
    point(state); for (let i = 0; i < 20; i++) view.render(state, 0, frame);
    assert.deepEqual(snapshot(view.arena), before);
    view.setMode('match'); for (let i = 0; i < 20; i++) view.render(state, 0, frame);
    assert.deepEqual(snapshot(view.arena), before);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
