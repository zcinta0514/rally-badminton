import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cloneModel } from '../src/model-assets.js';
import { TournamentLobby, sampleLobbyPose } from '../src/tournament-lobby.js';
import { resolveCourtPalette } from '../src/court-palettes.js';

function renderer(callback = () => {}) {
  return { toneMapping: THREE.NoToneMapping, toneMappingExposure: .77,
    render: callback, setSize() { assert.fail('lobby must share the existing renderer size'); } };
}

test('waiting pose keeps both feet planted and the racket down through a breathing cycle', () => {
  const first = sampleLobbyPose(0);
  for (const time of [.5, 1.5, 3, 5, 8]) {
    const pose = sampleLobbyPose(time);
    assert.deepEqual(pose.joints.leftAnkle, first.joints.leftAnkle);
    assert.deepEqual(pose.joints.rightAnkle, first.joints.rightAnkle);
    assert.ok(pose.racketHead.y < .55 && pose.racketHead.y > .15);
    assert.equal(pose.jump, 0);
    assert.ok(Math.abs(pose.joints.head.y - first.joints.head.y) < .012);
  }
  assert.notEqual(sampleLobbyPose(1).joints.chest.y, first.joints.chest.y);
});

test('lobby has a regulation court, closed roof, distinct materials and an isolated palette', () => {
  const lobby = new TournamentLobby({ loadAthlete: false });
  const court = lobby.scene.getObjectByName('lobby-playing-surface');
  assert.equal(court.geometry.parameters.width, 6.1);
  assert.equal(court.geometry.parameters.depth, 13.4);
  assert.ok(court.material.roughness >= .95);
  assert.ok(lobby.scene.getObjectByName('lobby-roof'));
  assert.ok(lobby.materials.metal.metalness > .5);
  assert.ok(lobby.materials.wood.roughness < court.material.roughness);
  const wood = lobby.materials.wood.color.getHex();
  lobby.setCourtPalette('blue');
  assert.equal(court.material.color.getHex(), resolveCourtPalette('blue').court);
  assert.equal(lobby.materials.wood.color.getHex(), wood);
  lobby.setCourtPalette('invalid');
  assert.equal(lobby.courtPalette, 'green');
  lobby.dispose();
});

test('shared renderer settings restore on success and error; paused and reduced-motion frames freeze', () => {
  const lobby = new TournamentLobby({ loadAthlete: false });
  const shared = renderer();
  lobby.render(shared, .08, 844, 390);
  assert.equal(shared.toneMapping, THREE.NoToneMapping);
  assert.equal(shared.toneMappingExposure, .77);
  const camera = lobby.camera.position.clone();
  const pose = structuredClone(lobby.athlete.root.userData.pose);
  lobby.render(shared, 0, 844, 390);
  assert.deepEqual(lobby.camera.position, camera);
  assert.deepEqual(lobby.athlete.root.userData.pose, pose);
  lobby.render(shared, .08, 844, 390, { reducedMotion: true });
  const reducedCamera = lobby.camera.position.clone();
  const reducedPose = structuredClone(lobby.athlete.root.userData.pose);
  lobby.render(shared, .08, 844, 390, { reducedMotion: true });
  assert.deepEqual(lobby.camera.position, reducedCamera);
  assert.deepEqual(lobby.athlete.root.userData.pose, reducedPose);
  shared.render = () => { throw new Error('lost context'); };
  assert.throws(() => lobby.render(shared, .08, 844, 390), /lost context/);
  assert.equal(shared.toneMapping, THREE.NoToneMapping);
  assert.equal(shared.toneMappingExposure, .77);
  lobby.dispose();
});

test('athlete stays inside the camera at phone landscape, desktop and portrait sizes', () => {
  const lobby = new TournamentLobby({ loadAthlete: false });
  for (const [width, height] of [[844, 390], [667, 375], [1440, 900], [390, 844]]) {
    lobby.render(renderer(), 0, width, height, { reducedMotion: true });
    for (const y of [.01, 1.88]) {
      const p = new THREE.Vector3(lobby.athlete.root.position.x, y, lobby.athlete.root.position.z).project(lobby.camera);
      assert.ok(p.x > -.95 && p.x < .95 && p.y > -.95 && p.y < .95, `${width}x${height}: ${p.toArray()}`);
      if (width > height) assert.ok(p.x > .2, 'foreground athlete remains right of menu');
    }
  }
  lobby.dispose();
});

test('dispose releases shared resources once and marks pending athlete loads as canceled', async () => {
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const lobby = new TournamentLobby({ athleteLoader: () => pending });
  const owned = new Set();
  lobby.scene.traverse(object => {
    if (object.geometry) owned.add(object.geometry);
    if (object.skeleton) owned.add(object.skeleton);
    for (const material of object.material ? [].concat(object.material) : []) {
      owned.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) owned.add(value);
    }
  });
  const counts = new Map();
  for (const resource of owned) {
    const original = resource.dispose.bind(resource);
    resource.dispose = () => { counts.set(resource, (counts.get(resource) || 0) + 1); original(); };
  }
  lobby.dispose(); lobby.dispose();
  assert.equal(lobby.athlete.disposed, true);
  for (const resource of owned) assert.equal(counts.get(resource), 1, resource.name || resource.type);
  const lateScene = new THREE.Scene();
  const lateMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  lateScene.add(lateMesh);
  let lateDisposals = 0;
  lateMesh.geometry.addEventListener('dispose', () => { lateDisposals++; });
  resolve({ scene: lateScene });
  assert.equal(await lobby.athleteReady, false);
  assert.equal(lateDisposals, 1);
  assert.equal(lobby.scene.children.length, 0);
  lobby.render(renderer(() => assert.fail('disposed scene rendered')), .1, 844, 390);
});

test('the real asynchronously installed athlete keeps the lobby pose and ivory kit without recoloring its cached template', async () => {
  const bytes = await readFile(new URL('../src/models/athlete.glb', import.meta.url));
  const template = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const lobby = new TournamentLobby({ athleteLoader: async () => cloneModel(template) });
  const initial = structuredClone(lobby.athlete.root.userData.pose);
  assert.equal(await lobby.athleteReady, true);
  assert.deepEqual(lobby.athlete.root.userData.pose, initial);
  let shirt = null, original = null;
  lobby.athlete.importedModel.traverse(mesh => { if (mesh.material?.name === 'rally-shirt') shirt = mesh.material; });
  template.scene.traverse(mesh => { if (mesh.material?.name === 'rally-shirt') original = mesh.material; });
  assert.ok(shirt && original);
  assert.equal(shirt.color.getHex(), 0xe9e6d9);
  assert.notEqual(shirt, original);
  assert.notEqual(original.color.getHex(), shirt.color.getHex());
  assert.equal(lobby.athlete.root.position.x, 4.25);
  assert.equal(lobby.athlete.root.position.z, 5.1);
  lobby.dispose();
});
