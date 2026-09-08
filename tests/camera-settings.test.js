import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMERA_DEFAULTS, normalizeCameraSettings, readCameraSettings, saveCameraSettings } from '../src/camera-settings.js';
import { fitCourtViewport, projectCourtPoint } from '../src/court-layout.js';
import * as THREE from 'three';
import { CourtView } from '../src/view.js';

test('camera settings reject invalid storage and clamp the usable ranges', () => {
  assert.deepEqual(normalizeCameraSettings({ pitchDegrees: -5, zoom: 8, yaw: 30 }), { pitchDegrees: 18, zoom: 1.12 });
  for (const value of [null, [], 'wrong', { pitchDegrees: NaN, zoom: Infinity }]) {
    assert.deepEqual(normalizeCameraSettings(value), CAMERA_DEFAULTS);
  }
  assert.deepEqual(readCameraSettings({ getItem() { return 'broken json'; } }), CAMERA_DEFAULTS);
  assert.deepEqual(readCameraSettings({ getItem() { throw new Error('blocked'); } }), CAMERA_DEFAULTS);
});

test('the actual view updates its level projection immediately when a saved pitch or zoom changes', () => {
  const view = { width: 844, height: 390, mode: 'match', camera: new THREE.PerspectiveCamera(45, 1, .1, 100), updateCamera: CourtView.prototype.updateCamera };
  for (const side of [0, 1]) {
    view.cameraSide = side;
    CourtView.prototype.setCameraSettings.call(view, { pitchDegrees: 38, zoom: 1.08 });
    assert.ok(Math.abs(view.layout.pitch - 38 * Math.PI / 180) < 1e-9);
    for (const x of [-3.05, 3.05]) for (const z of [-6.7, 6.7]) {
      const point = new THREE.Vector3(x, 0, z).project(view.camera);
      const expected = projectCourtPoint({ x, y: 0, z }, view.layout);
      assert.ok(Math.abs((point.x * .5 + .5) * view.width - expected.x) < 1e-8);
      assert.ok(Math.abs((.5 - point.y * .5) * view.height - expected.y) < 1e-8);
    }
  }
});

test('render quality accepts only bounded finite pixel ratios and exposes measured renderer counters', () => {
  let ratio = 1.6;
  const view = {
    renderer: { setPixelRatio(value) { ratio = value; }, getPixelRatio() { return ratio; }, shadowMap: { enabled: true }, info: { render: { calls: 99, triangles: 1234 }, memory: { geometries: 12, textures: 4 } } },
    scene: new THREE.Scene(), getRendererMetrics: CourtView.prototype.getRendererMetrics,
  };
  CourtView.prototype.setQuality.call(view, { pixelRatio: .9, shadows: false });
  assert.deepEqual(view.getRendererMetrics(), { pixelRatio: .9, shadows: false, calls: 99, triangles: 1234, geometries: 12, textures: 4 });
  CourtView.prototype.setQuality.call(view, { pixelRatio: NaN });
  assert.equal(ratio, .9);
  CourtView.prototype.setQuality.call(view, { pixelRatio: 5, shadows: true });
  assert.equal(ratio, 1.6);
  assert.equal(view.renderer.shadowMap.enabled, true);
});

test('local camera preferences survive a reload and storage denial stays usable', () => {
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: (key) => values.get(key) };
  saveCameraSettings({ pitchDegrees: 36, zoom: .91 }, storage);
  assert.deepEqual(readCameraSettings(storage), { pitchDegrees: 36, zoom: .91 });
  assert.doesNotThrow(() => saveCameraSettings(CAMERA_DEFAULTS, { setItem() { throw new Error('private'); } }));
});

test('pitch and zoom change the projection while both sides remain level and the full court remains on screen', () => {
  for (const [width, height] of [[667,320], [844,390], [1280,720], [390,844]]) {
    for (const side of [0, 1]) for (const pitchDegrees of [18, 24, 40]) for (const zoom of [.85, 1, 1.12]) {
      const fit = fitCourtViewport(width, height, side, { camera: { pitchDegrees, zoom } });
      assert.ok(Math.abs(fit.pitch - pitchDegrees * Math.PI / 180) < 1e-9);
      for (const z of [-6.7, 0, 6.7]) {
        const left = projectCourtPoint({ x: -3.05, y: 0, z }, fit);
        const right = projectCourtPoint({ x: 3.05, y: 0, z }, fit);
        assert.ok(Math.abs(left.y - right.y) < 1e-8);
        assert.ok(Math.abs((left.x + right.x) / 2 - width / 2) < 1e-8);
        for (const point of [left, right]) {
          assert.ok(point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height, JSON.stringify({ width, height, pitchDegrees, zoom, point }));
        }
      }
    }
    const wide = fitCourtViewport(width, height, 0, { camera: { pitchDegrees: 24, zoom: .85 } });
    const close = fitCourtViewport(width, height, 0, { camera: { pitchDegrees: 24, zoom: 1.12 } });
    assert.ok(close.scale > wide.scale * 1.1, 'distance control visibly changes the scene scale');
  }
});
