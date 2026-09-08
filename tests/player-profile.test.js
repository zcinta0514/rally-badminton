import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createPlayerProfile, normalizePlayerName } from '../src/player-profile.js';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('an anonymous identity uses 256 random bits and survives another page load without secure-context UUID APIs', () => {
  const local = storage();
  const first = createPlayerProfile({ storage: local, crypto: { getRandomValues: bytes => webcrypto.getRandomValues(bytes) } });
  assert.match(first.playerKey, /^[a-f0-9]{64}$/);
  assert.equal(first.name, '');
  assert.equal(first.saveName('  球友 7  '), '球友 7');
  const second = createPlayerProfile({ storage: local, crypto: webcrypto });
  assert.equal(second.playerKey, first.playerKey);
  assert.equal(second.name, '球友 7');
  assert.equal(second.persistent, true);
});

test('blocked storage retains an identity for this page only and reports it honestly', () => {
  const profile = createPlayerProfile({ storage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } }, crypto: webcrypto });
  const key = profile.playerKey;
  profile.saveName('访客');
  assert.equal(profile.playerKey, key);
  assert.equal(profile.name, '访客');
  assert.equal(profile.persistent, false);
});

test('invalid persisted credentials are replaced and absence of secure randomness never falls back to Math.random', () => {
  const local = storage(); local.setItem('rally.player.v1', JSON.stringify({ name: '旧称呼', playerKey: 'not-a-secret' }));
  const profile = createPlayerProfile({ storage: local, crypto: webcrypto });
  assert.match(profile.playerKey, /^[a-f0-9]{64}$/);
  assert.equal(profile.name, '旧称呼');
  assert.throws(() => createPlayerProfile({ storage: storage(), crypto: {} }), /随机/);
});

test('player names reject blank input, remove control characters, and limit displayed length', () => {
  assert.equal(normalizePlayerName(' \t\n '), '');
  assert.equal(normalizePlayerName('  A\u0000B  '), 'AB');
  assert.equal(normalizePlayerName('羽'.repeat(30)), '羽'.repeat(16));
});
