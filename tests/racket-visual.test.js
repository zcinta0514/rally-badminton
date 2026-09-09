import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

async function racketForTest(colors) {
  const module = await import('../src/racket-visual.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof module.makeRacket, 'function', 'the racket visual must export makeRacket');
  return module.makeRacket(colors);
}

function renderables(group) {
  const result = [];
  group.traverse(object => { if (object.isMesh || object.isLine) result.push(object); });
  return result;
}

test('racket keeps the grip origin and the existing .54 m contact centre', async () => {
  const racket = await racketForTest();
  assert.ok(racket.isGroup);
  assert.deepEqual(racket.position.toArray(), [0, 0, 0]);
  assert.deepEqual(racket.scale.toArray(), [1, 1, 1]);
  const bounds = new THREE.Box3().setFromObject(racket), size = bounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(bounds.min.y) < 1e-7, 'the butt rests at the local origin');
  assert.ok(Math.abs(size.y - .68) < .003, `racket length ${size.y}`);
  assert.ok(Math.abs(size.x - .224) < .002, `racket head width ${size.x}`);
  const strings = renderables(racket).find(object => object.isLineSegments);
  assert.ok(strings, 'the face has a visible string bed');
  const face = new THREE.Box3().setFromObject(strings);
  assert.ok(Math.abs(face.getCenter(new THREE.Vector3()).y - .54) < 1e-7);
  assert.ok(Math.abs(face.getCenter(new THREE.Vector3()).x) < 1e-7);
  assert.ok(face.min.y > .40 && face.max.y < .68);
  assert.ok(face.max.z - face.min.z <= .002, 'strings stay close to the contact plane');
  racket.dispose();
});

test('handle fits the existing curled fingers throughout their .03–.11 m grip', async () => {
  const racket = await racketForTest();
  let gripVertices = 0;
  for (const object of renderables(racket)) {
    const positions = object.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      if (y < .03 || y > .11) continue;
      gripVertices++;
      const radius = Math.hypot(positions.getX(i), positions.getZ(i));
      assert.ok(radius >= .011 && radius <= .0155, `grip radius ${radius} at ${y}`);
    }
  }
  assert.ok(gripVertices > 24, 'wrapping detail follows the held section of the handle');
  racket.dispose();
});

test('racket geometry stays finite, texture-free and inside the mobile render budget', async () => {
  const racket = await racketForTest(), objects = renderables(racket);
  let draws = 0, triangles = 0;
  for (const object of objects) {
    draws += Math.max(1, object.geometry.groups.length);
    if (object.isMesh) triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    for (const attribute of Object.values(object.geometry.attributes)) {
      assert.ok([...attribute.array].every(Number.isFinite));
    }
    for (const material of [object.material].flat()) {
      assert.ok(!Object.values(material).some(value => value?.isTexture), 'no external texture dependency');
    }
  }
  assert.ok(draws <= 3, `${draws} racket draws`);
  assert.ok(triangles > 0 && triangles < 2000, `${triangles} racket triangles`);
  const strings = objects.find(object => object.isLineSegments);
  assert.ok(strings.geometry.attributes.position.count >= 60, 'string spacing improves on the old fourteen strands');
  racket.dispose();
});

test('the outer beam faces outward so back-face culling does not hide its silhouette', async () => {
  const racket = await racketForTest(), frame = racket.getObjectByName('racket-frame');
  const positions = frame.geometry.attributes.position, normals = frame.geometry.attributes.normal;
  let outerVertices = 0;
  for (let i = 0; i < positions.count; i++) {
    if (positions.getX(i) < .111 || Math.abs(positions.getY(i) - .54) > .003) continue;
    outerVertices++;
    assert.ok(normals.getX(i) > .8, 'the rightmost outside surface must face right');
  }
  assert.ok(outerVertices > 0);
  racket.dispose();
});

test('each racket uses the supplied athlete palette without changing it', async () => {
  const palette = { dark: 0x112233, white: 0xe8efe1, accent: 0xe74918 };
  const before = { ...palette }, racket = await racketForTest(palette);
  const colors = renderables(racket).filter(object => object.isMesh)
    .flatMap(object => [...object.geometry.attributes.color.array]);
  for (const value of Object.values(palette)) {
    const expected = new THREE.Color(value);
    assert.ok(colors.some((_, i) => i % 3 === 0 &&
      Math.abs(colors[i] - expected.r) < 1e-6 &&
      Math.abs(colors[i + 1] - expected.g) < 1e-6 &&
      Math.abs(colors[i + 2] - expected.b) < 1e-6), `palette color ${value.toString(16)}`);
  }
  assert.deepEqual(palette, before);
  racket.dispose();
});

test('disposing one racket releases its own GPU resources exactly once', async () => {
  const first = await racketForTest(), second = await racketForTest();
  const resources = group => new Set(renderables(group).flatMap(object => [object.geometry, ...[object.material].flat()]));
  const firstResources = resources(first), secondResources = resources(second);
  let disposed = 0, otherDisposed = 0;
  for (const resource of firstResources) {
    assert.ok(!secondResources.has(resource), 'rackets must not share disposable resources');
    resource.addEventListener('dispose', () => disposed++);
  }
  for (const resource of secondResources) resource.addEventListener('dispose', () => otherDisposed++);
  first.dispose(); first.dispose();
  assert.equal(disposed, firstResources.size);
  assert.equal(otherDisposed, 0);
  second.dispose();
  assert.equal(otherDisposed, secondResources.size);
});
