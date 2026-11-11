import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cloneModel } from '../src/model-assets.js';
import { TournamentLobby, sampleLobbyPose, sampleLobbyLighting } from '../src/tournament-lobby.js';
import { resolveCourtPalette } from '../src/court-palettes.js';

function renderer(callback = () => {}) {
  return { toneMapping: THREE.NoToneMapping, toneMappingExposure: .77,
    render: callback, setSize() { assert.fail('lobby must share the existing renderer size'); } };
}

const lightingSnapshot = lobby => ({ clock: lobby.lightClock,
  lights: Object.fromEntries(Object.entries(lobby.lights).map(([name, light]) => [name, light.intensity])),
  fixtures: ['fixture', 'fixtureSide', 'fixtureBack'].map(name => lobby.materials[name].emissiveIntensity) });

test('lighting enters from a readable level once, then varies by less than 1.5% at a slow rate', () => {
  const out = {}, first = sampleLobbyLighting(0);
  assert.ok(first.main >= .84 && first.main <= .90, 'first frame is already lit');
  let previous = first.main;
  for (let frame = 1; frame <= 60; frame++) {
    assert.equal(sampleLobbyLighting(frame / 60, out), out, 'sampler reuses its output');
    assert.ok(out.main >= previous, 'entrance ramps smoothly without pulsing');
    assert.ok(out.main - previous < .006, 'no sudden frame-to-frame brightness step');
    previous = out.main;
  }
  assert.ok(out.main >= .999, 'entrance settles in about one second');
  const past = {};
  for (let frame = 0; frame <= 12_000; frame++) {
    sampleLobbyLighting(2 + frame / 60, out);
    for (const channel of ['main', 'side', 'back']) {
      assert.ok(out[channel] >= .985 && out[channel] <= 1.015, `${channel} stays within the settled light budget`);
      if (past[channel] !== undefined) assert.ok(Math.abs(out[channel] - past[channel]) < .00006, `${channel} changes slowly`);
      past[channel] = out[channel];
    }
  }
  assert.notEqual(sampleLobbyLighting(9).main, sampleLobbyLighting(19).main);
});

test('lighting remains spatially fixed, uses one shadow map, and keeps strip emitters in sync', () => {
  const lobby = new TournamentLobby({ loadAthlete: false }), shared = renderer();
  const lights = []; lobby.scene.traverse(object => { if (object.isLight) lights.push(object); });
  assert.ok(lights.length <= 6, 'local soft lights remain within the phone budget');
  assert.equal(lights.filter(light => light.castShadow).length, 1);
  assert.ok(lobby.lights.court.isSpotLight && lobby.lights.wall.isSpotLight, 'local sources create real spatial falloff');
  assert.ok(lobby.lights.court.penumbra >= .8 && lobby.lights.wall.penumbra >= .8);
  assert.ok(lobby.lights.athlete.intensity < 85, 'avoid the former blown shirt');
  const positions = lights.map(light => light.position.toArray());
  const emitterVersions = ['fixture', 'fixtureSide', 'fixtureBack'].map(name => lobby.materials[name].version);
  const first = lightingSnapshot(lobby);
  for (let frame = 0; frame < 90; frame++) lobby.render(shared, 1 / 60, 844, 390);
  const next = lightingSnapshot(lobby);
  for (const [light, index] of [['court', 0], ['rim', 1], ['wall', 2]]) {
    assert.ok(Math.abs(next.lights[light] / first.lights[light] - next.fixtures[index] / first.fixtures[index]) < 1e-10);
  }
  assert.deepEqual(lights.map(light => light.position.toArray()), positions, 'no moving light beams');
  assert.deepEqual(['fixture', 'fixtureSide', 'fixtureBack'].map(name => lobby.materials[name].version), emitterVersions,
    'brightness updates do not recompile materials');
  lobby.dispose();
});

test('hidden and reduced-motion frames freeze lighting; bounded steps resume without restarting the entrance', () => {
  const lobby = new TournamentLobby({ loadAthlete: false }), shared = renderer();
  lobby.render(shared, .1, 844, 390);
  let snapshot = lightingSnapshot(lobby);
  for (const dt of [0, -1, NaN, Infinity]) {
    lobby.render(shared, dt, 844, 390);
    assert.deepEqual(lightingSnapshot(lobby), snapshot);
  }
  lobby.render(shared, 100, 844, 390);
  assert.ok(Math.abs(lobby.lightClock - snapshot.clock - .1) < 1e-10, 'tab wake cannot jump the lighting clock');
  for (let frame = 0; frame < 60; frame++) lobby.render(shared, 1 / 60, 844, 390);
  snapshot = lightingSnapshot(lobby);
  for (let frame = 0; frame < 30; frame++) {
    lobby.render(shared, 0, 844, 390);
    lobby.render(shared, .05, 844, 390, { reducedMotion: true });
    assert.deepEqual(lightingSnapshot(lobby), snapshot);
  }
  lobby.render(shared, .05, 844, 390);
  assert.ok(lobby.lightClock > snapshot.clock);
  assert.ok(lobby.lights.court.intensity / snapshot.lights.court > .999, 'menu return continues the settled state');
  lobby.dispose();
});

test('reduced-motion startup uses settled lighting immediately and never plays the entrance later', () => {
  const lobby = new TournamentLobby({ loadAthlete: false }), shared = renderer();
  lobby.render(shared, 1 / 60, 844, 390, { reducedMotion: true });
  const snapshot = lightingSnapshot(lobby);
  assert.ok(lobby.lightClock >= 1, 'skip the entrance for reduced motion');
  for (let i = 0; i < 5; i++) {
    lobby.render(shared, .1, 844, 390, { reducedMotion: true });
    assert.deepEqual(lightingSnapshot(lobby), snapshot);
  }
  lobby.render(shared, .1, 844, 390);
  assert.ok(lobby.lights.court.intensity / snapshot.lights.court > .999);
  lobby.dispose();
});

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
  assert.ok(lobby.materials.metal.metalness > court.material.metalness, 'coated steel remains distinct from rubber');
  assert.ok(court.material.bumpMap && court.material.bumpScale > 0 && court.material.bumpScale < .01);
  assert.equal(court.material.bumpMap.colorSpace, THREE.NoColorSpace, 'surface data is linear');
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
