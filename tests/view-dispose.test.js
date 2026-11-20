import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CourtView } from '../src/view.js';
import { makeAthlete } from '../src/athlete.js';

test('disposing a rendered court releases each player bone texture before the renderer', () => {
  const scene = new THREE.Scene();
  const athletes = [makeAthlete(scene, 0), makeAthlete(scene, 1)];
  const lobbyScene = new THREE.Scene();
  const venue = new THREE.Group();
  lobbyScene.add(venue);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
  venue.add(floor);
  let floorReleased = 0;
  floor.geometry.addEventListener('dispose', () => { floorReleased++; });
  let released = 0, rendererDisposed = false;
  for (const athlete of athletes) {
    athlete.skin.skeleton.computeBoneTexture();
    athlete.skin.skeleton.boneTexture.addEventListener('dispose', () => {
      assert.equal(rendererDisposed, false);
      released++;
    });
  }
  CourtView.prototype.dispose.call({ scene, venue, lobby: {
    dispose() { assert.equal(lobbyScene.children.length, 0); },
  }, edgeIndicator: { remove() {} }, renderer: {
    dispose() { rendererDisposed = true; }
  }});
  assert.equal(released, 2);
  assert.equal(floorReleased, 1);
  assert.ok(athletes.every(athlete => athlete.skin.skeleton.boneTexture === null));
  assert.equal(rendererDisposed, true);
});
