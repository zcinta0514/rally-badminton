import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArenaPreferences } from '../src/arena-preferences.js';

test('old arena preferences receive separate music and interface defaults', () => {
  const preferences = normalizeArenaPreferences({ master: .4, courtPalette: 'purple' });
  assert.equal(preferences.music, .25);
  assert.equal(preferences.ui, .45);
  assert.equal(preferences.musicTrack, 'warmup');
  assert.equal(preferences.master, .4);
  assert.equal(preferences.courtPalette, 'purple');
});

test('music and interface levels can be muted separately and only built-in IDs are saved', () => {
  const saved = normalizeArenaPreferences({ music: 0, ui: 2, musicTrack: 'highlights' });
  assert.equal(saved.music, 0);
  assert.equal(saved.ui, 1);
  assert.equal(saved.musicTrack, 'highlights');
  assert.equal(normalizeArenaPreferences({ musicTrack: 'blob:local' }).musicTrack, 'warmup');
});
