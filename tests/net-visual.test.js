import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeNetVisual, sampleNetDeflection, updateNetVisual } from '../src/net-visual.js';
import { makeArena } from '../src/arena.js';
import { NET_PHYSICS, resolveNetImpact } from '../shared/net-physics.js';

const event = { id: 1, kind: 'net', x: 0, y: 1.13, z: 0, vx: 1, vy: -2, vz: -12, hitSide: 0, hitId: 2, at: 1 };

test('net impact is bounded, side-aware and does not mutate the collision event', () => {
  const before = structuredClone(event), impact = resolveNetImpact(event);
  assert.equal(impact.version, 1);
  assert.ok(Math.hypot(impact.impulse.x, impact.impulse.y, impact.impulse.z) <= .12);
  assert.ok(impact.rebound.z > 0, 'side 0 rebounds toward positive z');
  const other = resolveNetImpact({ ...event, hitSide: 1, vz: 12 });
  assert.ok(other.rebound.z < 0, 'side 1 rebounds toward negative z');
  assert.ok(sampleNetDeflection(0, 1.15, event, .04) < 0, 'side 0 initially pushes the net away from the hitter');
  assert.ok(sampleNetDeflection(0, 1.15, { ...event, hitSide: 1, vz: 12 }, .04) > 0,
    'side 1 initially pushes the net away from the hitter');
  assert.equal(resolveNetImpact({ ...event, y: .7 }), null, 'a below-mesh fault does not pull the net');
  assert.deepEqual(event, before);
});

test('cloth response stays pinned at posts and creates a localized travelling wave', () => {
  for (const age of [.02, .06, .18, .42, 1.1]) {
    assert.ok(Math.abs(sampleNetDeflection(-NET_PHYSICS.halfWidth, 1.15, event, age)) < 1e-10);
    assert.ok(Math.abs(sampleNetDeflection(NET_PHYSICS.halfWidth, 1.15, event, age)) < 1e-10);
  }
  const centre = Math.abs(sampleNetDeflection(0, 1.15, event, .06));
  assert.ok(centre > .02 && centre <= .11);
  const low = Math.abs(sampleNetDeflection(0, .8, { ...event, y: .8 }, .06));
  const high = Math.abs(sampleNetDeflection(0, 1.43, { ...event, y: 1.43 }, .06));
  assert.ok(low > .02 && high > .02);
  assert.ok(Math.abs(sampleNetDeflection(0, 1.43, { ...event, y: .8 }, .06)) < low * .2);
  assert.ok(Math.abs(sampleNetDeflection(0, .8, { ...event, y: 1.43 }, .06)) < high * .2);
  assert.ok(Math.abs(sampleNetDeflection(0, 1.15, event, 1.1)) < .015, 'the main wave has mostly dissipated');
});

test('visual replay is deterministic, pause-safe and resets exactly at a new rally', () => {
  const net = makeNetVisual(), rest = net.group.children.map(mesh => mesh.geometry.attributes.position.array.slice());
  updateNetVisual(net, event, .07);
  const moving = net.group.children.map(mesh => mesh.geometry.attributes.position.array.slice());
  assert.equal(net.atRest, false);
  updateNetVisual(net, event, .07);
  net.group.children.forEach((mesh, index) => assert.deepEqual(mesh.geometry.attributes.position.array, moving[index]));
  updateNetVisual(net, event, 1.4);
  assert.equal(net.atRest, true);
  net.group.children.forEach((mesh, index) => assert.deepEqual(mesh.geometry.attributes.position.array, rest[index]));
  updateNetVisual(net, null, 0);
  net.group.children.forEach((mesh, index) => assert.deepEqual(mesh.geometry.attributes.position.array, rest[index]));
});

test('high and low contacts use fixed buffers and never exceed the deformation envelope', () => {
  const net = makeNetVisual(), rest = net.group.children.map(mesh => mesh.geometry.attributes.position.array.slice());
  for (const y of [.8, .9, 1.13, 1.5]) {
    updateNetVisual(net, { ...event, y }, .06);
    net.group.children.forEach((mesh, index) => {
      const positions = mesh.geometry.attributes.position;
      assert.equal(positions.array.length, rest[index].length);
      for (let i = 0; i < positions.count; i++) {
        assert.ok(Number.isFinite(positions.getX(i)) && Number.isFinite(positions.getY(i)) && Number.isFinite(positions.getZ(i)));
        assert.ok(Math.abs(positions.getZ(i) - rest[index][i * 3 + 2]) <= .11);
      }
    });
    updateNetVisual(net, { ...event, y }, 1.4);
  }
});

test('high-detail net remains within the mobile draw and geometry budget', () => {
  const net = makeNetVisual();
  assert.ok(net.group.children.length <= 3, 'one draw each for strands, tape and binding');
  const vertexCount = net.group.children.reduce((count, mesh) => count + mesh.geometry.attributes.position.count, 0);
  assert.ok(vertexCount <= 6000, `${vertexCount} vertices in net`);
  assert.ok(net.group.children.every(mesh => !mesh.castShadow));
  const arena = makeArena(new THREE.Scene());
  assert.ok(arena.children.length <= 8, 'static venue detail remains instanced');
  assert.ok(arena.children.every(mesh => mesh.isInstancedMesh && !mesh.castShadow));
  assert.equal(arena.getObjectByName('furniture-contact-shadows').count, 7);
});
