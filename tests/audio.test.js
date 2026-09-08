import test from 'node:test';
import assert from 'node:assert/strict';
import { collectArenaSounds, ArenaAudio } from '../src/arena-audio.js';
const state = () => ({ time: 1, hitId: 0, pointId: 0, phase: 'rally', lastShot: 'clear',
  players: [{ x: 0, z: 3, action: null }, { x: 0, z: -3, action: null }] });

test('court sound events occur once for actual contact and scoring, never on initial load', () => {
  assert.equal(typeof collectArenaSounds, 'function');
  const s = state(), memory = {};
  assert.deepEqual(collectArenaSounds(s, memory), []);
  s.hitId++; s.lastShot = 'smash';
  assert.deepEqual(collectArenaSounds(s, memory), [{ type: 'hit', shot: 'smash' }]);
  assert.deepEqual(collectArenaSounds(s, memory), []);
  s.pointId++; s.phase = 'point';
  assert.deepEqual(collectArenaSounds(s, memory), [{ type: 'score' }]);
  assert.deepEqual(collectArenaSounds(s, memory), []);
});

test('foot sounds use movement distance and do not burst after pause or a reset', () => {
  assert.equal(typeof collectArenaSounds, 'function');
  const s = state(), memory = {}; collectArenaSounds(s, memory);
  s.players[0].x += .7;
  assert.deepEqual(collectArenaSounds(s, memory), [{ type: 'foot', side: 0 }]);
  assert.deepEqual(collectArenaSounds(s, memory), []);
  s.phase = 'paused'; s.players[0].x = -2;
  assert.deepEqual(collectArenaSounds(s, memory), []);
  s.phase = 'rally';
  assert.deepEqual(collectArenaSounds(s, memory), []);
  s.time = 0; s.hitId = 0; s.pointId = 0;
  assert.deepEqual(collectArenaSounds(s, memory), []);
});

test('returning to a paused match does not replay contacts that happened in the background', () => {
  const audio = new ArenaAudio(), s = state(), hits = [];
  audio.hit = shot => hits.push(shot);
  audio.update(s);
  audio.setVisible(false);
  s.hitId = 1; s.lastShot = 'smash'; s.phase = 'paused';
  audio.setVisible(true); audio.update(s);
  assert.deepEqual(hits, []);
});
