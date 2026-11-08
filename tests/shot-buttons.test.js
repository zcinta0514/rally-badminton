import test from 'node:test';
import assert from 'node:assert/strict';
import { shotAimVisual, paintShotAim, clearShotAim } from '../src/shot-buttons.js';

const fakeButton = () => ({
  dataset: {},
  style: {
    values: {},
    setProperty(name, value) { this.values[name] = value; },
    removeProperty(name) { delete this.values[name]; },
  },
});

test('the aim visual points the line and nub toward the drag', () => {
  assert.deepEqual(shotAimVisual(0, 0), { x: 0, y: 0, angle: 0, active: false });
  const up = shotAimVisual(0, 1);
  assert.equal(up.x, 0);
  assert.equal(up.y, -18);
  assert.equal(Math.round(up.angle), 180);
  assert.equal(up.active, true);
  const right = shotAimVisual(1, 0);
  assert.equal(right.x, 18);
  assert.equal(right.y, 0);
  assert.equal(Math.round(right.angle), -90);
  const down = shotAimVisual(0, -1);
  assert.equal(down.y, 18);
  assert.equal(Math.round(down.angle), 0);
  assert.equal(shotAimVisual(0.1, 0.05).active, false);
});

test('invalid or extreme values stay inside the key', () => {
  const visual = shotAimVisual(Infinity, -Infinity);
  assert.equal(visual.active, false);
  assert.equal(visual.x, 0);
  assert.equal(visual.y, 0);
  const clamped = shotAimVisual(4, -3);
  assert.equal(clamped.x, 18);
  assert.equal(clamped.y, 18);
});

test('painting and clearing the aim only touches the button surface', () => {
  const button = fakeButton();
  paintShotAim(button, 1, 0);
  assert.equal(button.dataset.aiming, 'true');
  assert.equal(button.style.values['--aim-x'], '18.00px');
  assert.equal(button.style.values['--aim-angle'], '-90.00deg');
  paintShotAim(button, 0, 0);
  assert.equal(button.dataset.aiming, undefined);
  assert.equal(button.style.values['--aim-x'], '0.00px');
  clearShotAim([button]);
  assert.equal(button.style.values['--aim-x'], undefined);
  assert.equal(button.style.values['--aim-angle'], undefined);
});
