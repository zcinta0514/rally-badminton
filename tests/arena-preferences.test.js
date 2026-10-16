import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_DEFAULTS, ARENA_STORAGE_KEY, normalizeArenaPreferences, readArenaPreferences, saveArenaPreferences } from '../src/arena-preferences.js';

function fixture() {
  const values = new Map();
  return { values, storage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
}

test('the court palette is stored with the rest of the local arena preferences', () => {
  const f = fixture();
  saveArenaPreferences({ ...ARENA_DEFAULTS, courtPalette: 'purple' }, f.storage);
  assert.equal(JSON.parse(f.values.get(ARENA_STORAGE_KEY)).courtPalette, 'purple');
  assert.equal(readArenaPreferences(f.storage).courtPalette, 'purple');
  assert.equal(readArenaPreferences(f.storage).master, ARENA_DEFAULTS.master);
});

test('missing, broken or unknown palette values fall back without losing the mix levels', () => {
  const f = fixture();
  f.storage.setItem(ARENA_STORAGE_KEY, JSON.stringify({ master: .25, courtPalette: 'chartreuse' }));
  const unknown = readArenaPreferences(f.storage);
  assert.equal(unknown.courtPalette, 'green');
  assert.equal(unknown.master, .25);

  f.storage.setItem(ARENA_STORAGE_KEY, JSON.stringify({ master: .5 }));
  assert.equal(readArenaPreferences(f.storage).courtPalette, 'green', 'pre-v1.10 saves without a palette still open on the traditional green');

  f.storage.setItem(ARENA_STORAGE_KEY, '{broken');
  const broken = readArenaPreferences(f.storage);
  assert.equal(broken.courtPalette, 'green');
  assert.equal(broken.master, ARENA_DEFAULTS.master);
});

test('normalizing keeps every volume in 0..1 and only accepts known palette names', () => {
  const normalized = normalizeArenaPreferences({ master: 2, hits: -1, movement: 'loud', courtPalette: 'blue' });
  assert.equal(normalized.master, 1);
  assert.equal(normalized.hits, 0);
  assert.equal(normalized.movement, ARENA_DEFAULTS.movement);
  assert.equal(normalized.courtPalette, 'blue');
  assert.equal(normalizeArenaPreferences(null).courtPalette, 'green');
});
