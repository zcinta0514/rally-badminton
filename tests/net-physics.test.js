import test from 'node:test';
import assert from 'node:assert/strict';
import { NET_PHYSICS, advanceNetCloth, applyNetImpact, createNetCloth, resetNetCloth, resolveNetImpact, sampleNetOffset } from '../shared/net-physics.js';

const event = { kind: 'net', x: -.35, y: 1.2, vx: .8, vy: -3, vz: -11, hitSide: 0 };

test('fixed-step cloth has stable anchors, bounded nodes and deterministic replay', () => {
  const a = createNetCloth(), b = createNetCloth();
  assert.equal(applyNetImpact(a, event), true);
  assert.equal(applyNetImpact(b, event), true);
  advanceNetCloth(a, .47); advanceNetCloth(b, .47);
  assert.deepEqual(a.positions, b.positions);
  for (let node = 0; node < a.count; node++) {
    const offset = node * 3, column = node % (a.columns + 1);
    if (column === 0 || column === a.columns) {
      assert.equal(a.positions[offset], a.rest[offset]);
      assert.equal(a.positions[offset + 1], a.rest[offset + 1]);
      assert.equal(a.positions[offset + 2], 0);
    } else {
      assert.ok(Math.abs(a.positions[offset + 2]) <= .11 + 1e-9);
      assert.ok(Math.abs(a.positions[offset] - a.rest[offset]) <= .025 + 1e-9);
      assert.ok(Math.abs(a.positions[offset + 1] - a.rest[offset + 1]) <= .025 + 1e-9);
    }
  }
  resetNetCloth(a);
  assert.deepEqual(a.positions, a.rest);
  assert.deepEqual(a.previous, a.rest);
});

test('impact payload is bounded and compatible with legacy net events', () => {
  const eventWithImpact = { ...event, netImpact: resolveNetImpact(event) };
  assert.deepEqual(resolveNetImpact(eventWithImpact), eventWithImpact.netImpact);
  const malformed = { ...event, netImpact: { version: 1, impulse: { x: Infinity, y: 0, z: 0 }, rebound: { x: 0, y: 0, z: 0 } } };
  assert.deepEqual(resolveNetImpact(malformed), resolveNetImpact(event));
  assert.equal(resolveNetImpact({ ...event, y: NET_PHYSICS.bottom - NET_PHYSICS.corkRadius - .001 }), null);
});

test('impact creates a visible travelling wave instead of a static local dent', () => {
  const light = createNetCloth(), smash = createNetCloth();
  applyNetImpact(light, { ...event, vz: -5 });
  applyNetImpact(smash, { ...event, vz: -20 });
  advanceNetCloth(light, .06); advanceNetCloth(smash, .06);
  const immediate = Math.abs(sampleNetOffset(light, event.x, event.y, {}).z);
  assert.ok(immediate > .02, 'the contact must be visible immediately');
  advanceNetCloth(light, .22); advanceNetCloth(smash, .06);
  const near = Math.abs(sampleNetOffset(light, .15, 1.2, {}).z);
  const farCloth = createNetCloth();
  applyNetImpact(farCloth, { ...event, vz: -5 });
  advanceNetCloth(farCloth, .32);
  const farther = Math.abs(sampleNetOffset(farCloth, 1.05, 1.2, {}).z);
  assert.ok(near > .01, 'the wave must leave the impact point');
  assert.ok(farther > .005, 'the wave must continue outward');
  const lightStrength = createNetCloth(), smashStrength = createNetCloth();
  applyNetImpact(lightStrength, { ...event, vz: -5 });
  applyNetImpact(smashStrength, { ...event, vz: -20 });
  advanceNetCloth(lightStrength, .1); advanceNetCloth(smashStrength, .1);
  assert.ok(Math.abs(sampleNetOffset(smashStrength, 0, 1.2, {}).z)
    > Math.abs(sampleNetOffset(lightStrength, 0, 1.2, {}).z), 'a smash must move the net more than a light contact');
});
