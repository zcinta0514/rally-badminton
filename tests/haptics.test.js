import test from 'node:test';
import assert from 'node:assert/strict';
import { createHaptics, readHapticsEnabled, saveHapticsEnabled, HAPTICS_STORAGE_KEY, HAPTIC_PATTERNS } from '../src/haptics.js';

function fakeNavigator() {
  const calls = [];
  return { calls, vibrate(pattern) { calls.push(pattern); return true; } };
}
function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem(key) { return values.has(key) ? values.get(key) : null; }, setItem(key, value) { values.set(key, String(value)); } };
}

test('haptics default to on and use distinct press, charge, shot and ready patterns', () => {
  const navigator = fakeNavigator();
  const haptics = createHaptics({ navigator, storage: memoryStorage() });
  assert.equal(haptics.supported, true);
  assert.equal(haptics.enabled, true);
  haptics.press('clear');
  haptics.charged();
  haptics.shoot('clear');
  haptics.ready();
  assert.deepEqual(navigator.calls, [HAPTIC_PATTERNS.press, HAPTIC_PATTERNS.charged, HAPTIC_PATTERNS.shot, HAPTIC_PATTERNS.ready]);
  haptics.press('smash');
  haptics.shoot('smash');
  assert.equal(navigator.calls.at(-2), HAPTIC_PATTERNS.charged);
  assert.deepEqual(navigator.calls.at(-1), HAPTIC_PATTERNS.smash);
  assert.ok(HAPTIC_PATTERNS.smash.length >= 2, 'a smash release should feel different from a tap');
});

test('turning haptics off persists, silences every pattern and cancels a running pattern', () => {
  const navigator = fakeNavigator();
  const storage = memoryStorage();
  const haptics = createHaptics({ navigator, storage });
  haptics.setEnabled(false);
  haptics.press('clear'); haptics.shoot('smash'); haptics.ready();
  assert.deepEqual(navigator.calls, [0], 'only the cancel call is sent');
  assert.equal(storage.values.get(HAPTICS_STORAGE_KEY), 'off');
  assert.equal(readHapticsEnabled(storage), false);
  const reloaded = createHaptics({ navigator, storage });
  assert.equal(reloaded.enabled, false);
  reloaded.setEnabled(true);
  reloaded.shoot('clear');
  assert.deepEqual(navigator.calls.at(-1), HAPTIC_PATTERNS.shot);
});

test('devices without the vibration API stay silent without throwing', () => {
  const haptics = createHaptics({ navigator: {}, storage: memoryStorage() });
  assert.equal(haptics.supported, false);
  assert.equal(haptics.press('clear'), false);
  assert.equal(haptics.shoot('smash'), false);
  haptics.setEnabled(false);
  haptics.setEnabled(true);
  assert.equal(haptics.enabled, true);
});

test('denied or broken storage never blocks the preference and defaults to on', () => {
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(readHapticsEnabled(throwing), true);
  assert.doesNotThrow(() => saveHapticsEnabled(false, throwing));
  const navigator = fakeNavigator();
  const haptics = createHaptics({ navigator, storage: throwing });
  assert.equal(haptics.enabled, true);
  assert.doesNotThrow(() => haptics.setEnabled(false));
  assert.equal(haptics.enabled, false);
});
