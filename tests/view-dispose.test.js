import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CourtView } from '../src/view.js';
import { makeAthlete } from '../src/athlete.js';

test('disposing a rendered court releases each player bone texture before the renderer', () => {
  const scene = new THREE.Scene();
  const athletes = [makeAthlete(scene, 0), makeAthlete(scene, 1)];
  let released = 0, rendererDisposed = false;
  for (const athlete of athletes) {
    athlete.skin.skeleton.computeBoneTexture();
    athlete.skin.skeleton.boneTexture.addEventListener('dispose', () => {
      assert.equal(rendererDisposed, false);
      released++;
    });
  }
  CourtView.prototype.dispose.call({ scene, edgeIndicator: { remove() {} }, renderer: {
    dispose() { rendererDisposed = true; }
  }});
  assert.equal(released, 2);
  assert.ok(athletes.every(athlete => athlete.skin.skeleton.boneTexture === null));
  assert.equal(rendererDisposed, true);
});
