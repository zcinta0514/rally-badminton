import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cloneModel } from '../src/model-assets.js';
import { TournamentLobby, sampleLobbyPose, sampleLobbyLighting } from '../src/tournament-lobby.js';
import { CourtView } from '../src/view.js';
import { installTournamentArena } from '../src/tournament-arena.js';
import { resolveCourtPalette } from '../src/court-palettes.js';

function renderer(callback = () => {}) {
  return { toneMapping: THREE.NoToneMapping, toneMappingExposure: .77,
    render: callback, setSize() { assert.fail('lobby must share the existing renderer size'); } };
}

const lightingSnapshot = lobby => ({ clock: lobby.lightClock,
  lights: Object.fromEntries(Object.entries(lobby.lights).map(([name, light]) => [name, light.intensity])) });

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

test('original portrait lighting stays spatially fixed, within the phone budget, with one shadow map', () => {
  const lobby = new TournamentLobby({ loadAthlete: false }), shared = renderer();
  const lights = []; lobby.scene.traverse(object => { if (object.isLight) lights.push(object); });
  assert.ok(lights.length <= 6, 'local soft lights remain within the phone budget');
  assert.equal(lights.filter(light => light.castShadow).length, 1);
  assert.ok(lobby.lights.court.isSpotLight && lobby.lights.wall.isSpotLight, 'local sources create real spatial falloff');
  assert.ok(lobby.lights.court.penumbra >= .8 && lobby.lights.wall.penumbra >= .8);
  assert.ok(lobby.lights.athlete.intensity < 85, 'avoid the former blown shirt');
  const positions = lights.map(light => light.position.toArray());
  const first = lightingSnapshot(lobby);
  for (let frame = 0; frame < 90; frame++) lobby.render(shared, 1 / 60, 844, 390);
  const next = lightingSnapshot(lobby);
  for (const light of ['key', 'court', 'athlete', 'rim', 'wall']) {
    assert.ok(next.lights[light] > first.lights[light]);
  }
  assert.deepEqual(lights.map(light => light.position.toArray()), positions, 'no moving light beams');
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

test('home and gameplay share one court, net, and palette before and after installing the tournament model', async t => {
  const context = { fillRect() {}, fillText() {} };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  t.after(() => { delete globalThis.document; });
  const view = Object.create(CourtView.prototype);
  view.scene = new THREE.Scene();
  view.lobby = new TournamentLobby({ loadAthlete: false });
  view.canvas = { dataset: {} };
  view.edgeIndicator = {};
  view.resize = view.prepareTournament = () => {};
  view.mode = 'match';
  view.makeCourt();
  view.setMode('menu');
  assert.equal(view.fallbackCourt.parent.parent, view.lobby.scene);
  assert.equal(view.netVisual.group.parent, view.venue);
  view.setCourtPalette('blue');
  assert.equal(view.courtMaterials.court.color.getHex(), resolveCourtPalette('blue').court);

  const bytes = await readFile(new URL('../src/models/tournament-hall.glb', import.meta.url));
  const model = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  view.preparedTournament = installTournamentArena(model);
  view.installPreparedTournament();
  const court = model.scene.getObjectByName('Court_|_sprung_competition_mat');
  assert.equal(view.fallbackCourt, null);
  assert.equal(court.material.color.getHex(), resolveCourtPalette('blue').court);
  for (const mode of ['menu', 'match', 'menu']) {
    view.setMode(mode);
    const activeScene = mode === 'menu' ? view.lobby.scene : view.scene;
    assert.equal(activeScene.getObjectById(court.id), court);
    assert.equal(activeScene.getObjectById(view.netVisual.group.id), view.netVisual.group);
    assert.equal(view.lobby.athlete.root.parent, view.lobby.scene);
  }
  view.setCourtPalette('purple');
  assert.equal(court.material.color.getHex(), resolveCourtPalette('purple').court);
  view.lobby.dispose();
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

test('the lobby shows only the original athlete, including after a failed first load', async () => {
  const bytes = await readFile(new URL('../src/models/athlete.glb', import.meta.url));
  const template = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  let attempts = 0;
  const lobby = new TournamentLobby({ athleteLoader: async () => {
    if (++attempts === 1) throw new Error('First download interrupted');
    return cloneModel(template);
  } });
  const initial = structuredClone(lobby.athlete.root.userData.pose);
  assert.equal(lobby.athlete.root.visible, false);
  assert.equal(await lobby.athleteReady, false);
  const shared = renderer();
  for (let frame = 0; frame < 102; frame++) {
    lobby.render(shared, .1, 844, 390, { reducedMotion: true });
    assert.equal(lobby.athlete.root.visible, false);
    assert.equal(lobby.athlete.ground.visible, false);
  }
  assert.equal(await lobby.athleteReady, true);
  assert.equal(attempts, 2);
  assert.equal(lobby.athlete.root.visible, true);
  assert.equal(lobby.athlete.ground.visible, true);
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
