import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShotAim, toWorldInput } from '../src/play-input.js';
import { COURT_CAMERA } from '../src/court-layout.js';

test('a tap preserves selected lane, but deliberate drag back to centre selects centre', () => {
  assert.equal(resolveShotAim({ aim: 0, aimExplicit: false }, -1), -1);
  assert.equal(resolveShotAim({ aim: 0, aimExplicit: true }, -1), 0);
  assert.equal(resolveShotAim({ aim: .45, aimExplicit: true }, -1), .45);
});

test('both players see rightward joystick travel on the camera right axis', () => {
  for (const side of [0, 1]) {
    const yaw = COURT_CAMERA.yaw + side * Math.PI;
    const input = toWorldInput({ x: 1, z: 0, prepare: 'smash', charge: .7 }, side, -1);
    assert.ok(Math.abs(Math.cos(yaw) * input.x - Math.sin(yaw) * input.z - 1) < 1e-10);
    assert.equal(input.prepare, 'smash');
    assert.equal(input.charge, .7);
    assert.equal(input.aim, side === 0 ? -1 : 1);
  }
});

test('vertical shot aim stays player-relative while lateral aim mirrors for the guest',()=>{
  for(const side of [0,1])for(const aimDepth of [-1,0,1]){
    const input=toWorldInput({x:0,z:0,aim:.6,aimDepth,shot:'drop',charge:.4},side);
    assert.equal(input.aimDepth,aimDepth);
    assert.equal(input.aim,side===0?.6:-.6);
    assert.equal(input.charge,.4);
  }
});
