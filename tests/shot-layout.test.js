import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOT_LAYOUT_STORAGE_KEY, SHOT_KEYS, normalizeShotLayout, readShotLayout, saveShotLayout, applyShotLayout } from '../src/shot-layout.js';

const fakeStore = (value = null) => {
  const data = new Map();
  if (value !== null) data.set(SHOT_LAYOUT_STORAGE_KEY, typeof value === 'string' ? value : JSON.stringify(value));
  return { getItem: key => data.get(key) ?? null, setItem: (key, next) => data.set(key, next), data };
};
const button = key => ({ dataset: { shot: key }, style: { left: 'old', top: 'old', setProperty(property, value) { this[property] = value; }, removeProperty(property) { this[property] = ''; } } });
const fakeDocument = () => {
  const buttons = SHOT_KEYS.map(button);
  return { body: { dataset: {} }, buttons, querySelectorAll: () => buttons, querySelector: () => null, defaultView: { innerWidth: 800, innerHeight: 400 } };
};

test('the shipped grid is the fallback for empty or malformed layouts', () => {
  assert.deepEqual(normalizeShotLayout(null), { mode: 'default', positions: null });
  assert.deepEqual(normalizeShotLayout({ mode: 'nope' }), { mode: 'default', positions: null });
  assert.deepEqual(normalizeShotLayout({ mode: 'arc' }), { mode: 'arc', positions: null });
});

test('a custom layout keeps three finite positions and rejects partial data', () => {
  const positions = { clear: { x: 0.1, y: 0.8 }, drop: { x: 0.2, y: 0.5 }, smash: { x: 0.3, y: 0.2 } };
  assert.deepEqual(normalizeShotLayout({ mode: 'custom', positions }), { mode: 'custom', positions });
  assert.equal(normalizeShotLayout({ mode: 'custom', positions: { ...positions, drop: { x: 0.2, y: NaN } } }).mode, 'default');
  assert.equal(normalizeShotLayout({ mode: 'custom', positions: { clear: positions.clear, drop: positions.drop } }).mode, 'default');
});

test('custom coordinates are clamped before they reach storage', () => {
  const layout = normalizeShotLayout({ mode: 'custom', positions: {
    clear: { x: -2, y: 3 }, drop: { x: 2, y: -1 }, smash: { x: 0.5, y: 0.5 },
  } });
  assert.deepEqual(layout.positions.clear, { x: 0, y: 1 });
  assert.deepEqual(layout.positions.drop, { x: 1, y: 0 });
});

test('storage round-trips the normalized layout and tolerates bad JSON', () => {
  const store = fakeStore({ mode: 'custom', positions: { clear: { x: 0.1, y: 0.2 }, drop: { x: 0.3, y: 0.4 }, smash: { x: 0.5, y: 0.6 } } });
  assert.equal(readShotLayout(store).mode, 'custom');
  saveShotLayout({ mode: 'arc' }, store);
  assert.equal(JSON.parse(store.data.get(SHOT_LAYOUT_STORAGE_KEY)).mode, 'arc');
  assert.equal(readShotLayout(fakeStore('{bad json')).mode, 'default');
  assert.doesNotThrow(() => saveShotLayout({ mode: 'arc' }, { setItem() { throw new Error('quota'); } }));
});

test('applying a custom layout writes percentage positions and a default layout clears them', () => {
  const doc = fakeDocument();
  applyShotLayout({ mode: 'custom', positions: { clear: { x: 0.5, y: 0.25 }, drop: { x: 0.6, y: 0.5 }, smash: { x: 0.7, y: 0.75 } } }, doc);
  assert.equal(doc.body.dataset.shotLayout, 'custom');
  assert.equal(doc.buttons[0].style.left, '50%');
  assert.equal(doc.buttons[0].style.top, '25%');
  assert.equal(doc.buttons[2].style.left, '70%');
  applyShotLayout({ mode: 'default' }, doc);
  assert.equal(doc.body.dataset.shotLayout, 'default');
  for (const item of doc.buttons) assert.deepEqual({ left: item.style.left, top: item.style.top }, { left: '', top: '' });
});

test('saved sizes are independent, bounded, and optional for legacy positions', () => {
  const positions = { clear: { x: 0.5, y: 0.25 }, drop: { x: 0.6, y: 0.5 }, smash: { x: 0.7, y: 0.75 } };
  const store = fakeStore({ mode: 'custom', positions });
  assert.deepEqual(readShotLayout(store), { mode: 'custom', positions });
  const sizes = { clear: 140, drop: 75 };
  assert.deepEqual(saveShotLayout({ mode: 'custom', positions, sizes: { clear: 170, drop: 50, smash: '85' } }, store), { mode: 'custom', positions, sizes });
  assert.deepEqual(readShotLayout(store).sizes, sizes);
  const doc = fakeDocument();
  applyShotLayout(readShotLayout(store), doc);
  assert.equal(doc.buttons[0].style['--shot-scale'], '1.4');
  assert.equal(doc.buttons[1].style['--shot-scale'], '0.75');
  applyShotLayout({ mode: 'arc' }, doc);
  assert.equal(doc.buttons[0].style['--shot-scale'], '');
});
