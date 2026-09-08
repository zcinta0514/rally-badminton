import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLanAddress } from '../src/lan-entry.js';

test('LAN entry accepts a host, explicit port, HTTPS, and a room invitation', () => {
  assert.equal(normalizeLanAddress(' 192.0.2.10:3000 '), 'http://192.0.2.10:3000/');
  assert.equal(normalizeLanAddress('http://rally.local:3000/?room=ABCDE'), 'http://rally.local:3000/?room=ABCDE');
  assert.equal(normalizeLanAddress('https://rally.local/game/'), 'https://rally.local/game/');
  assert.equal(normalizeLanAddress('localhost:3000'), 'http://localhost:3000/');
  assert.equal(normalizeLanAddress('http://[::1]:3000/'), 'http://[::1]:3000/');
});

test('LAN entry rejects an empty address, room code alone, executable URLs and credentials', () => {
  for (const address of ['', 'ABCDE', 'javascript:alert(1)', 'data:text/html,test', 'ftp://rally.local/', 'http://user:secret@rally.example/', 'http://rally.local/#token', '//rally.local/', '192.0.2.10:99999', 'http://']) {
    assert.throws(() => normalizeLanAddress(address), /地址/);
  }
});
