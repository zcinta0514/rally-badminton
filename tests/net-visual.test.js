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

test('a net impact follows contact height instead of shaking the same horizontal strip', () => {
  const low = { ...event, y: .9 }, high = { ...event, y: 1.43 }, age = .06;
  const magnitude = (y, impact) => Math.abs(sampleNetDeflection(0, y, impact, age));
  assert.ok(magnitude(.9, low) > magnitude(.9, high) * 3, 'low contacts concentrate the ripple near the lower strands');
  assert.ok(magnitude(1.43, high) > magnitude(1.43, low) * 3, 'high contacts concentrate the ripple near the tape');
  assert.ok(magnitude(1.52, high) > magnitude(1.52, low) * 3, 'tape responds more strongly to a nearby impact');
  assert.equal(sampleNetDeflection(0, 1, { ...event, y: -10 }, age), sampleNetDeflection(0, 1, { ...event, y: .79 }, age));
  assert.equal(sampleNetDeflection(0, 1, { ...event, y: 10 }, age), sampleNetDeflection(0, 1, { ...event, y: 1.52 }, age));
  assert.ok(Number.isFinite(sampleNetDeflection(0, 1, { ...event, y: NaN }, age)));
});

test('high and low contacts share the mobile budget and reset every added binding and stitch', () => {
  const net = makeNetVisual(), rest = net.group.children.map(mesh => mesh.geometry.attributes.position.array.slice());
  const binding = net.binding.geometry.attributes.position;
  assert.ok(Array.from({ length: binding.count }, (_, i) => binding.getY(i)).some(y => y > 1.5), 'side bindings reach the tape in the existing binding draw');
  for (const y of [.8, .9, 1.13, 1.5]) {
    const impact = { ...event, y, vz: -100 };
    updateNetVisual(net, impact, .06);
    net.group.children.forEach((mesh, index) => {
      const positions = mesh.geometry.attributes.position;
      assert.equal(positions.array.length, rest[index].length, 'contacts must not allocate growing geometry');
      for (let i = 0; i < positions.count; i++) {
        assert.equal(positions.getX(i), rest[index][i * 3]);
        assert.equal(positions.getY(i), rest[index][i * 3 + 1]);
        assert.ok(Math.abs(positions.getZ(i) - rest[index][i * 3 + 2]) <= .074);
      }
    });
    updateNetVisual(net, impact, 1.2);
    net.group.children.forEach((mesh, index) => assert.deepEqual(mesh.geometry.attributes.position.array, rest[index]));
  }
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
