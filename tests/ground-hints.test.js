import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CourtView } from '../src/view.js';

// No WebGL renderer is needed to inspect the actual Three.js floor geometry.
const makeView = () => {
  const view = Object.create(CourtView.prototype);
  view.scene = new THREE.Scene();
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({
    beginPath() {}, roundRect() {}, fill() {}, fillText() {},
  }) }) };
  try { view.makeHints(); } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
  return view;
};
const setup = (side = 0) => {
  const sign = side === 0 ? 1 : -1;
  return {
    state: { phase: 'rally', pointId: 1, hitId: 4, time: 2,
      shuttle: { active: true, lastHit: 1 - side },
      players: [{ x: .4, z: 3.8 }, { x: -.4, z: -3.8 }] },
    info: {
      landing: { x: .8 * sign, y: 0, z: 4.2 * sign, time: 1.2, event: 'landing', side, out: false },
      intercept: { status: 'approach', canHit: false, canSmash: false, futureCanSmash: true,
        point: { x: .5 * sign, y: 2.4, z: 3.5 * sign, time: .65 } },
      target: { x: -1 * sign, y: 0, z: -5.3 * sign },
      availability: { canHit: false, canSmash: false }, prepare: null,
    },
  };
};
const markers = view => [view.landingHint, view.interceptHint, view.targetHint, view.readyHint].filter(Boolean);
const snapshot = view => markers(view).map(marker => ({
  visible: marker.group.visible,
  position: marker.group.position.toArray(),
  children: marker.group.children.map(mesh => ({
    scale: mesh.scale.toArray(), color: mesh.material.color.getHex(), opacity: mesh.material.opacity,
  })),
}));

test('all guidance is real floor geometry with no floating sprites', () => {
  const view = makeView(), { state, info } = setup();
  view.updateHints(state, info, false, false, 0);
  view.scene.updateMatrixWorld(true);
  let meshes = 0;
  view.scene.traverse(object => {
    assert.notEqual(object.type, 'Sprite', 'landing and contact guidance must not float above court');
    if (!object.isMesh) return;
    meshes++;
    const vertices = object.geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(object.matrixWorld);
      assert.ok(point.y >= .028 && point.y <= .065, `floor guidance height ${point.y}`);
    }
  });
  assert.ok(meshes >= 4);
});

test('cyan landing and amber interception show only opponent arrivals on the local half', () => {
  for (const side of [0, 1]) {
    const view = makeView(), { state, info } = setup(side);
    view.updateHints(state, info, false, false, side);
    assert.equal(view.landingHint.group.visible, true);
    assert.equal(view.interceptHint.group.visible, true);
    assert.equal(view.landingHint.group.position.z, info.landing.z);
    assert.equal(view.interceptHint.group.position.z, info.intercept.point.z);
    state.shuttle.lastHit = side;
    view.updateHints(state, info, false, false, side);
    assert.equal(view.landingHint.group.visible, false, 'own outgoing shot has no cyan landing circle');
    assert.equal(view.interceptHint.group.visible, false);
    state.shuttle.lastHit = 1 - side; info.landing.side = 1 - side;
    view.updateHints(state, info, false, false, side);
    assert.equal(view.landingHint.group.visible, false);
    assert.equal(view.interceptHint.group.visible, false);
  }
});

test('out, net, inactive and completed points clear misleading floor instructions', () => {
  for (const change of [
    ({ info }) => { info.landing.out = true; },
    ({ info }) => { info.landing.event = 'net'; },
    ({ info }) => { info.landing.serviceFault = true; },
    ({ state }) => { state.shuttle.active = false; },
    ({ state }) => { state.shuttle.lastHit = null; },
    ({ state }) => { state.phase = 'point'; },
  ]) {
    const view = makeView(), data = setup();
    view.updateHints(data.state, data.info, false, false, 0);
    change(data);
    view.updateHints(data.state, data.info, false, false, 0);
    assert.equal(view.landingHint.group.visible, false);
    assert.equal(view.interceptHint.group.visible, false);
  }
});

test('pink target appears only while a shot is held and remains on the opponent floor', () => {
  for (const side of [0, 1]) {
    const view = makeView(), { state, info } = setup(side);
    view.updateHints(state, info, false, false, side);
    assert.equal(view.targetHint.group.visible, false);
    info.prepare = 'drop';
    view.updateHints(state, info, false, false, side);
    assert.equal(view.targetHint.group.visible, true);
    assert.equal(view.targetHint.group.position.x, info.target.x);
    assert.equal(view.targetHint.group.position.z, info.target.z);
    info.target = { x: .5, y: 3, z: (side === 0 ? -1 : 1) * 1.3 };
    view.updateHints(state, info, false, false, side);
    assert.equal(view.targetHint.group.position.z, info.target.z);
    assert.ok(view.targetHint.group.position.y < .065, 'target height does not follow ball height');
    info.target.z *= -1;
    view.updateHints(state, info, false, false, side);
    assert.equal(view.targetHint.group.visible, false);
    info.prepare = null;
    view.updateHints(state, info, false, false, side);
    assert.equal(view.targetHint.group.visible, false);
  }
});

test('local foot timing cue uses current eligibility, never a future smash promise', () => {
  const view = makeView(), { state, info } = setup();
  view.updateHints(state, info, false, false, 0);
  assert.ok(view.readyHint, 'player timing floor cue exists');
  assert.equal(view.readyHint.group.visible, false);
  info.availability = { canHit: true, canSmash: false };
  view.updateHints(state, info, false, false, 0);
  assert.equal(view.readyHint.group.visible, true);
  assert.equal(view.readyHint.group.position.x, state.players[0].x);
  assert.equal(view.readyHint.group.position.z, state.players[0].z);
  const normalColor = view.readyHint.circle.material.color.getHex();
  info.availability.canSmash = true;
  view.updateHints(state, info, false, false, 0);
  assert.notEqual(view.readyHint.circle.material.color.getHex(), normalColor);
  info.availability.canHit = false;
  view.updateHints(state, info, false, false, 0);
  assert.equal(view.readyHint.group.visible, false);
});

test('held target marks intention rather than guaranteed landing and grows with control risk', () => {
  const view = makeView(), { state, info } = setup();
  info.prepare = 'clear';
  info.target = { x: 2.85, z: -6.9, aimX: 2.45, aimZ: -6.5, quality: { risk: .65, spread: .7 } };
  view.updateHints(state, info, false, false, 0);
  assert.equal(view.targetHint.group.position.x, 2.45);
  assert.equal(view.targetHint.group.position.z, -6.5);
  assert.ok(view.targetHint.riskRing?.visible, 'risk is shown as floor geometry');
  const wide = view.targetHint.riskRing.scale.x;
  info.target.quality = { risk: .1, spread: .06 };
  view.updateHints(state, info, false, false, 0);
  assert.ok(view.targetHint.riskRing.scale.x < wide - .4);
  info.target.quality = { risk: .95, spread: 2.506 };
  view.updateHints(state, info, false, false, 0);
  assert.ok(view.targetHint.riskRing.scale.x >= 2.506, 'large real control loss is not hidden by a small visual cap');
  info.target.aimX = 2.7;
  view.updateHints(state, info, false, false, 0);
  assert.equal(view.targetHint.group.visible, true, 'a deliberate near-line aim can extend slightly outside');
  state.phase = 'paused'; const before = snapshot(view);
  info.target.quality.spread = 2;
  view.updateHints(state, info, true, false, 0);
  assert.deepEqual(snapshot(view), before);
  info.prepare = null; state.phase = 'rally';
  view.updateHints(state, info, false, false, 0);
  assert.equal(view.targetHint.group.visible, false);
});

test('arrival progress uses a fixed ground radius and brightness rather than a pulsing ring', () => {
  const view = makeView(), { state, info } = setup();
  view.updateHints(state, info, false, false, 0);
  assert.ok(view.landingHint.countdown, 'flight timing is encoded in a ground ring');
  const initial = view.landingHint.countdown.scale.x;
  const opacity = view.landingHint.countdown.material.opacity;
  const firstRange = view.landingHint.countdown.geometry.drawRange.count;
  const position = view.landingHint.group.position.toArray();
  info.landing.time = .18; state.time += 1;
  view.updateHints(state, info, false, false, 0);
  assert.equal(view.landingHint.countdown.scale.x, initial);
  assert.equal(view.landingHint.countdown.material.opacity, opacity);
  assert.ok(view.landingHint.countdown.geometry.drawRange.count < firstRange, 'a short progress arc changes length, not the landmark size');
  assert.deepEqual(view.landingHint.group.position.toArray(), position);
  state.hitId++; info.landing.time = 1.2;
  view.updateHints(state, info, false, false, 0);
  assert.equal(view.landingHint.countdown.scale.x, initial);
});

test('an automatic interception change moves continuously without delaying explicit shot aiming', () => {
  const view = makeView(), { state, info } = setup();
  view.updateHints(state, info, false, false, 0);
  const initial = view.interceptHint.group.position.clone();
  info.intercept.point = { x: -1.4, y: 2.2, z: 6.0, time: .8 };
  info.prepare = 'clear'; info.target = { x: 2, z: -6 };
  state.time += 1 / 60;
  view.updateHints(state, info, false, false, 0);
  const firstStep = view.interceptHint.group.position.distanceTo(initial);
  assert.ok(firstStep > 0 && firstStep <= .22, `automatic marker jumped ${firstStep} metres in one frame`);
  assert.equal(view.targetHint.group.position.x, 2, 'finger aiming has no smoothing lag');
  assert.equal(view.targetHint.group.position.z, -6);
  for (let i = 0; i < 60; i++) {
    state.time += 1 / 60; view.updateHints(state, info, false, false, 0);
  }
  assert.ok(Math.hypot(view.interceptHint.group.position.x + 1.4, view.interceptHint.group.position.z - 6) < .05);
  info.intercept.point.x = 1.7; info.intercept.point.z = 1.4; state.hitId++;
  view.updateHints(state, info, false, false, 0);
  assert.equal(view.interceptHint.group.position.x, 1.7, 'a new opponent shot starts a fresh marker');
  assert.equal(view.interceptHint.group.position.z, 1.4);
});

test('interception smoothing follows display time between network snapshots and freezes on pause', () => {
  const view = makeView(), { state, info } = setup();
  view.elapsed = 1;
  view.updateHints(state, info, false, false, 0);
  info.intercept.point.z = 6;
  view.elapsed += 1 / 60;
  view.updateHints(state, info, false, false, 0);
  const first = view.interceptHint.group.position.z;
  view.elapsed += 1 / 60;
  view.updateHints(state, info, false, false, 0);
  assert.ok(view.interceptHint.group.position.z > first, 'presentation advances even if snapshot time is unchanged');
  const before = snapshot(view);
  state.phase = 'paused'; view.elapsed += 1;
  view.updateHints(state, info, true, false, 0);
  assert.deepEqual(snapshot(view), before);
});

test('pause freezes positions, eligibility and timing even if the caller mutates old info', () => {
  const view = makeView(), { state, info } = setup();
  info.prepare = 'smash'; info.availability = { canHit: true, canSmash: true };
  view.updateHints(state, info, false, false, 0);
  const before = snapshot(view);
  state.phase = 'paused'; state.players[0].x = 2;
  info.landing.x = -2; info.landing.time = .01;
  info.target.z = -1; info.availability.canHit = false;
  for (let i = 0; i < 20; i++) view.updateHints(state, info, true, false, 0);
  assert.deepEqual(snapshot(view), before);
  state.phase = 'countdown'; view.updateHints(state, {}, true, false, 0);
  assert.deepEqual(snapshot(view), before);
  state.phase = 'point'; view.updateHints(state, {}, false, true, 0);
  assert.ok(markers(view).every(marker => !marker.group.visible));
});

test('a fresh match or side during pause never reuses another rally markers', () => {
  const view = makeView(), { state, info } = setup();
  info.prepare = 'clear';
  view.updateHints(state, info, false, false, 0);
  state.phase = 'paused';
  view.updateHints(state, {}, true, true, 0);
  assert.ok(markers(view).every(marker => !marker.group.visible));
  state.phase = 'rally'; view.updateHints(state, info, false, false, 0);
  state.phase = 'paused'; view.updateHints(state, info, true, false, 1);
  assert.ok(markers(view).every(marker => !marker.group.visible));
});
