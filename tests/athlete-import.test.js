import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cloneModel } from '../src/model-assets.js';
import { makeAthlete, updateAthlete, applyAthletePose } from '../src/athlete.js';
import { sampleFinalePose } from '../src/finale-pose.js';
import { installAthleteModel, upgradeAthlete } from '../src/athlete-import.js';

const bytes = await readFile(new URL('../src/models/athlete.glb', import.meta.url));
const template = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const model = () => cloneModel(template);
const meshesIn = root => { const meshes = []; root.traverse(object => { if (object.isMesh) meshes.push(object); }); return meshes; };
const vector = point => new THREE.Vector3(point.x, point.y, point.z);
const jointNames = ['pelvis', 'spine', 'chest', 'neck', 'head',
  ...['left', 'right'].flatMap(side => ['Shoulder', 'Elbow', 'Wrist', 'Hip', 'Knee', 'Ankle'].map(joint => side + joint))];

// Establish a translated and turned athlete before asynchronous installation.
// Installing only a fresh origin-centred rig would hide incorrect bind matrices.
function prepared(side = 0) {
  const sign = side === 0 ? 1 : -1, scene = new THREE.Scene(), visual = makeAthlete(scene, side);
  let player;
  for (let frame = 0; frame <= 18; frame++) {
    player = { x: sign * (.6 + frame * .025), z: sign * 3.8, vx: sign * 1.5, vz: 0 };
    updateAthlete(visual, player, side, { x: 0, y: 2, z: 0 }, frame / 60, 1 / 60, true);
  }
  return { scene, visual, player, sign, side };
}

function stroke(player, sign, type = 'smash', height = 2.8) {
  const contact = { x: player.x + sign * .6, y: height, z: player.z - sign * (height < 1 ? 1.1 : .4) };
  return { ...player, action: { id: `${type}:${height}`, type, stage: 'windup',
    startedAt: 1, contactAt: 1.2, endsAt: 1.8, contact, jumpHeight: height > 2.5 ? .6 : 0 } };
}

function anchors(visual) {
  visual.root.updateMatrixWorld(true);
  return {
    root: visual.root.matrixWorld.toArray(),
    joints: Object.fromEntries(jointNames.map(name => [name, visual.bones[name].getWorldPosition(new THREE.Vector3()).toArray()])),
    racket: visual.racket.localToWorld(new THREE.Vector3(0, .54, 0)).toArray(),
  };
}

function assertAnchorsEqual(a, b) {
  for (const key of ['root', 'racket']) a[key].forEach((value, index) => assert.ok(Math.abs(value - b[key][index]) < 1e-7, key));
  for (const name of jointNames) a.joints[name].forEach((value, index) => assert.ok(Math.abs(value - b.joints[name][index]) < 1e-7, name));
}

function surfacePositions(visual) {
  visual.root.updateMatrixWorld(true);
  const values = [], point = new THREE.Vector3();
  for (const mesh of meshesIn(visual.importedModel)) for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
    mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
    values.push(point.x, point.y, point.z);
  }
  return values;
}

function assertHealthySurface(visual, label) {
  visual.root.updateMatrixWorld(true);
  const local = new THREE.Vector3(), point = new THREE.Vector3(), bound = new THREE.Box3();
  const normal = new THREE.Vector4(), transformed = new THREE.Vector4(), weighted = new THREE.Vector4(), boneMatrix = new THREE.Matrix4();
  const rootInverse = visual.root.matrixWorld.clone().invert();
  for (const mesh of meshesIn(visual.importedModel)) {
    const { position, normal: normals, skinIndex, skinWeight } = mesh.geometry.attributes;
    assert.ok(normals?.count === position.count, `${label}: each surface vertex has a normal`);
    for (let i = 0; i < position.count; i++) {
      mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
      local.copy(point).applyMatrix4(rootInverse);
      assert.ok(local.toArray().every(Number.isFinite), `${label}: finite deformed vertex ${i}`);
      assert.ok(Math.abs(local.x) < 2.5 && Math.abs(local.z) < 2.5 && local.y > -.3 && local.y < 4, `${label}: vertex outside athlete envelope ${local.toArray()}`);
      bound.expandByPoint(local);
      assert.ok([normals.getX(i), normals.getY(i), normals.getZ(i)].every(Number.isFinite), `${label}: finite normal`);
      // Sample the weighted normal transform as well as the source attribute.
      // A finite rest mesh alone does not prove that its posed skin is valid.
      if (i % 37 === 0) {
        normal.set(normals.getX(i), normals.getY(i), normals.getZ(i), 0).applyMatrix4(mesh.bindMatrix);
        weighted.set(0, 0, 0, 0);
        for (let slot = 0; slot < 4; slot++) {
          const weight = skinWeight.array[i * 4 + slot];
          if (!weight) continue;
          const index = skinIndex.array[i * 4 + slot];
          boneMatrix.multiplyMatrices(mesh.skeleton.bones[index].matrixWorld, mesh.skeleton.boneInverses[index]);
          weighted.add(transformed.copy(normal).applyMatrix4(boneMatrix).multiplyScalar(weight));
        }
        weighted.applyMatrix4(mesh.bindMatrixInverse);
        assert.ok(weighted.toArray().every(Number.isFinite), `${label}: finite posed normal`);
      }
    }
  }
  const size = bound.getSize(new THREE.Vector3());
  assert.ok(size.x > .15 && size.y > .15 && size.z > .1, `${label}: skin has not collapsed`);
  assert.ok(size.x < 3.5 && size.y < 3.5 && size.z < 3.5, `${label}: bounded body volume`);
  for (const bone of visual.skeleton.bones) assert.ok(bone.matrixWorld.elements.every(Number.isFinite), `${label}: finite bone matrix`);
}

test('the real athlete GLB fits the phone asset budget and contains the complete untextured semantic rig', () => {
  assert.ok(bytes.length < 400_000, `${bytes.length} bytes, budget is 400 KB`);
  const meshes = meshesIn(template.scene);
  assert.ok(meshes.length > 0 && meshes.length <= 5);
  let triangles = 0;
  for (const mesh of meshes) {
    assert.ok(mesh.isSkinnedMesh);
    assert.equal(mesh.skeleton.bones.length, 18);
    assert.equal(new Set(mesh.skeleton.bones.map(bone => bone.name)).size, 18);
    for (const name of [...jointNames, 'spineLow']) assert.ok(mesh.skeleton.bones.some(bone => bone.name === name), name);
    triangles += (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3;
    for (const material of [].concat(mesh.material)) assert.ok(!Object.values(material).some(value => value?.isTexture));
  }
  assert.ok(triangles > 0 && triangles < 10_000, `${triangles} triangles`);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(json.textures?.length || 0, 0);
  assert.equal(json.images?.length || 0, 0);
});

test('installation preserves both players semantic joints, world root and exact racket contact', () => {
  for (const side of [0, 1]) {
    const original = prepared(side), imported = prepared(side);
    const player = stroke(imported.player, imported.sign);
    for (const fixture of [original, imported]) updateAthlete(fixture.visual, player, side, player.action.contact, 1.2, 1 / 60, true);
    const before = anchors(imported.visual), pose = structuredClone(imported.visual.root.userData.pose);
    assert.ok(Math.abs(imported.visual.root.rotation.y - (side === 0 ? 0 : Math.PI)) > .1, 'install after the player has already turned');
    installAthleteModel(imported.visual, model());
    assertAnchorsEqual(anchors(imported.visual), before);
    assert.deepEqual(imported.visual.root.userData.pose, pose);
    assert.ok(new THREE.Vector3(...anchors(imported.visual).racket).distanceTo(vector(player.action.contact)) < 1e-7);
    for (const time of [1.28, 1.42, 1.8]) {
      for (const fixture of [original, imported]) updateAthlete(fixture.visual, player, side, player.action.contact, time, 1 / 60, true);
      assertAnchorsEqual(anchors(imported.visual), anchors(original.visual));
    }
  }
});

test('the imported skin stays finite and bounded through running, smashes, lunges and both finale roles', () => {
  for (const side of [0, 1]) {
    const fixture = prepared(side), { visual, sign } = fixture;
    installAthleteModel(visual, model());
    for (let frame = 0; frame <= 24; frame++) {
      const player = { ...fixture.player, x: fixture.player.x + sign * frame * .025, z: fixture.player.z - sign * frame * .012 };
      updateAthlete(visual, player, side, { x: 0, y: 2, z: 0 }, .4 + frame / 60, 1 / 60, false);
      if (frame % 6 === 0) assertHealthySurface(visual, `side ${side} run ${frame}`);
    }
    for (const [type, height] of [['smash', 3.1], ['clear', 2.4], ['drop', .4]]) {
      const player = stroke(fixture.player, sign, type, height);
      for (const time of [1, 1.12, 1.2, 1.36, 1.55, 1.8]) {
        updateAthlete(visual, player, side, player.action.contact, time, 1 / 60, false, false, time === 1);
        assertHealthySurface(visual, `side ${side} ${type} ${time}`);
      }
    }
    for (const role of ['winner', 'loser']) for (const age of [0, .35, .7, 1.4, 2.1, 2.6, 3]) {
      applyAthletePose(visual, sampleFinalePose(role, age, side === 0 ? -.8 : .8), { x: fixture.player.x, z: fixture.player.z, side });
      assertHealthySurface(visual, `side ${side} finale ${role} ${age}`);
    }
  }
});

test('an upgrade applies the existing paused pose before any following animation frame', async () => {
  for (const side of [0, 1]) {
    const { visual, player: initial, sign } = prepared(side), player = stroke(initial, sign);
    updateAthlete(visual, player, side, player.action.contact, 1.2, 1 / 60, false);
    const pose = structuredClone(visual.root.userData.pose);
    assert.equal(await upgradeAthlete(visual, { loader: async () => model() }), true);
    const immediate = surfacePositions(visual);
    assert.ok(immediate.length > 0);
    // Force the same pose as an oracle, without advancing either match or gait.
    applyAthletePose(visual, pose, { x: player.x, z: player.z, side });
    const reapplied = surfacePositions(visual);
    assert.equal(immediate.length, reapplied.length);
    immediate.forEach((value, index) => assert.ok(Math.abs(value - reapplied[index]) < 1e-7, 'new skin must already have the current pose'));
    const frozen = surfacePositions(visual);
    updateAthlete(visual, player, side, player.action.contact, 1.2, 1, false, true);
    assert.deepEqual(surfacePositions(visual), frozen);
    assertHealthySurface(visual, `side ${side} paused install`);
  }
});

test('a loader failure retains the usable old skin and permits a later successful upgrade', async () => {
  const { visual } = prepared(), oldSkin = visual.skin, before = anchors(visual);
  let disposed = 0;
  oldSkin.geometry.addEventListener('dispose', () => disposed++);
  assert.equal(await upgradeAthlete(visual, { loader: async () => { throw new Error('offline'); } }), false);
  assert.equal(visual.skin, oldSkin);
  assert.equal(oldSkin.parent, visual.root);
  assert.equal(disposed, 0);
  assertAnchorsEqual(anchors(visual), before);
  assert.equal(await upgradeAthlete(visual, { loader: async () => model() }), true);
  assert.notEqual(visual.skin, oldSkin);
});

test('a disposed athlete rejects a late load and releases the uninstalled clone', async () => {
  const { visual } = prepared(), oldSkin = visual.skin, loaded = model(), resources = new Set();
  loaded.scene.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    for (const material of object.material ? [].concat(object.material) : []) resources.add(material);
    if (object.skeleton) { object.skeleton.computeBoneTexture(); resources.add(object.skeleton.boneTexture); }
  });
  const released = new Set();
  for (const resource of resources) resource.addEventListener('dispose', () => released.add(resource));
  let finish;
  const pending = upgradeAthlete(visual, { loader: () => new Promise(resolve => { finish = resolve; }) });
  visual.disposed = true;
  finish(loaded);
  assert.equal(await pending, false);
  assert.equal(visual.skin, oldSkin);
  assert.equal(visual.importedModel, undefined);
  assert.equal(released.size, resources.size, 'every independently owned late resource is released');
  let attempted = false;
  assert.equal(await upgradeAthlete(visual, { loader: async () => { attempted = true; return model(); } }), false);
  assert.equal(attempted, false);
});

test('two installed outfits and skin poses remain independent of each other and the cached template', () => {
  const a = prepared(0).visual, b = prepared(1).visual;
  installAthleteModel(a, model()); installAthleteModel(b, model());
  const shirt = visual => meshesIn(visual.importedModel).find(mesh => mesh.material.name === 'rally-shirt');
  const left = shirt(a), right = shirt(b), source = meshesIn(template.scene).find(mesh => mesh.material.name === 'rally-shirt');
  assert.ok(left && right && source);
  assert.notEqual(left.material.color.getHex(), right.material.color.getHex(), 'players retain their distinct team colours');
  const otherColour = right.material.color.getHex(), sourceColour = source.material.color.getHex(), otherSurface = surfacePositions(b);
  left.material.color.setHex(0x1122ff);
  assert.equal(right.material.color.getHex(), otherColour);
  assert.equal(source.material.color.getHex(), sourceColour);
  applyAthletePose(a, sampleFinalePose('loser', 1.4), { x: 1, z: 3.8 });
  assert.deepEqual(surfacePositions(b), otherSurface);
  assert.notEqual(a.skeleton, b.skeleton);
});
