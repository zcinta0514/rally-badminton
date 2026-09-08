import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeNetVisual, sampleNetDeflection, updateNetVisual } from '../src/net-visual.js';
import { makeArena } from '../src/arena.js';

const event = { kind: 'net', x: 0, y: 1.13, vz: -12, hitSide: 0 };

test('net reaction keeps the post attachments fixed and is a bounded deterministic sample', () => {
  const before = structuredClone(event);
  for (let i = 0; i <= 120; i++) {
    const age = i / 100;
    for (const x of [-3.17, 3.17]) assert.ok(Math.abs(sampleNetDeflection(x, 1.15, event, age)) < 1e-10);
    assert.ok(Math.abs(sampleNetDeflection(0, 1.15, event, age)) < .074);
    assert.ok(Math.abs(sampleNetDeflection(0, 1.15, event, age) + sampleNetDeflection(0, 1.15, { ...event, hitSide: 1 }, age)) < 1e-12);
  }
  assert.ok(Math.abs(sampleNetDeflection(0, 1.15, event, .06)) > .02, 'contact remains visible in the net centre');
  assert.ok(Math.abs(sampleNetDeflection(0, 1.15, event, 1.1)) < .001, 'oscillation dissipates');
  assert.equal(sampleNetDeflection(0, 1.15, { ...event, kind: 'out' }, .06), 0);
  assert.equal(sampleNetDeflection(0, 1.15, event, -1), 0);
  assert.equal(sampleNetDeflection(0, 1.15, event, NaN), 0);
  assert.deepEqual(event, before);
});

test('net wire and tape positions freeze at a held ending age and restore exactly for a new rally', () => {
  const net = makeNetVisual(), rest = net.group.children.map(mesh => mesh.geometry.attributes.position.array.slice());
  updateNetVisual(net, event, .07);
  assert.equal(net.atRest, false);
  const moving = net.group.children.map(mesh => mesh.geometry.attributes.position.array.slice());
  for (let i = 0; i < 20; i++) updateNetVisual(net, event, .07);
  net.group.children.forEach((mesh, index) => assert.deepEqual(mesh.geometry.attributes.position.array, moving[index]));
  assert.notDeepEqual(moving[0], rest[0], 'knotted strands deform instead of remaining rigid');
  assert.notDeepEqual(moving[1], rest[1], 'top tape has a small tension response');
  updateNetVisual(net, null, 0);
  assert.equal(net.atRest, true);
  net.group.children.forEach((mesh, index) => assert.deepEqual(mesh.geometry.attributes.position.array, rest[index]));
});

test('net detail and venue shading stay inside a small draw and geometry budget', () => {
  const net = makeNetVisual();
  assert.ok(net.group.children.length <= 3, 'one draw each for strands, tape and binding');
  const vertexCount = net.group.children.reduce((count, mesh) => count + mesh.geometry.attributes.position.count, 0);
  assert.ok(vertexCount <= 2200, `${vertexCount} vertices in net`);
  assert.ok(net.group.children.every(mesh => !mesh.castShadow));
  const arena = makeArena(new THREE.Scene());
  assert.ok(arena.children.length <= 8, 'static venue detail remains instanced');
  assert.ok(arena.children.every(mesh => mesh.isInstancedMesh && !mesh.castShadow));
  assert.equal(arena.getObjectByName('furniture-contact-shadows').count, 7);
});
