import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createPeerRecords } from '../src/peer-records.js';

const STORAGE_KEY = 'rally.peer-results.v1';
const ids = ['a', 'b', 'c', 'd'].map(char => char.repeat(12));
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function match(matchId = 1, first = 0, second = 1, winner = 0, score = [5, 2]) {
  return { sessionId: 'session-1', matchId, selfId: ids[first],
    players: [first, second].map(index => ({ playerId: ids[index], name: `球友${index}` })),
    state: { phase: 'over', ruleset: 'quick', score, winner } };
}

test('public identity hashes the credential identically on HTTPS and insecure LAN browsers', async () => {
  for (const key of ['a'.repeat(64), '0'.repeat(64), '0123456789abcdef'.repeat(4)]) {
    const expected = createHash('sha256').update(`rally.peer-player.v1:${key}`).digest('hex').slice(0, 12);
    for (const crypto of [webcrypto, {}, { subtle: { digest: async () => { throw Error('unavailable'); } } }]) {
      const records = createPeerRecords({ storage: null, crypto });
      assert.equal(await records.publicId(key), expected);
      assert.notEqual(await records.publicId(key), key.slice(0, 12));
    }
  }
  for (const key of ['', null, 'A'.repeat(64), 'a'.repeat(63), {}]) {
    await assert.rejects(createPeerRecords({ storage: null }).publicId(key), /身份/);
  }
});

test('completed device-joined matches persist both players once across reloads and rematches', () => {
  const local = storage(), records = createPeerRecords({ storage: local });
  const first = match(), original = structuredClone(first);
  assert.deepEqual(records.record(first), { status: 'local' });
  assert.deepEqual(first, original);
  assert.deepEqual(records.record(first), { status: 'local' });
  const reloaded = createPeerRecords({ storage: local });
  reloaded.record(first);
  const second = match(2, 0, 1, 1, [2, 5]); second.players[0].name = ' 新名字\u0000 ';
  reloaded.record(second);
  assert.deepEqual(reloaded.list().entries.map(row => [row.matches, row.wins, row.losses, row.points]), [[2, 1, 1, 7], [2, 1, 1, 7]]);
  assert.equal(reloaded.list().entries[0].name, '新名字');
  assert.equal(reloaded.list().storage, 'local');
  assert.equal(JSON.stringify(reloaded.list()).includes('session-1'), false);
  const nextSession = { ...first, sessionId: 'session-2' }; reloaded.record(nextSession);
  assert.equal(reloaded.list().entries[0].matches, 3);
});

test('missing or blocked storage retains session totals and truthfully reports memory-only records', () => {
  for (const local of [null, { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } },
    { getItem() { return null; }, setItem() { throw Error('quota'); } }]) {
    const records = createPeerRecords({ storage: local });
    assert.deepEqual(records.record(match()), { status: 'local-memory' });
    records.record(match());
    assert.equal(records.list().entries[0].matches, 1);
    assert.equal(records.list().storage, 'local-memory');
  }
});

test('an already saved result stays saved when the opponent leaves after the final snapshot', () => {
  const records=createPeerRecords({storage:storage()}), result=match();
  assert.equal(records.record(result).status,'local');
  result.players[1]=null;
  assert.equal(records.record(result).status,'local');
  assert.equal(records.list().entries[0].matches,1);
});

test('unfinished, abandoned, anonymous, self-play, spectator and malformed results are excluded', () => {
  const records = createPeerRecords({ storage: storage() });
  const cases = [
    [input => { input.state.phase = 'rally'; }, 'abandoned'],
    [input => { input.state.winner = null; }, 'abandoned'],
    [input => { input.state.winner = 2; }, 'abandoned'],
    [input => { input.state.abandoned = true; }, 'abandoned'],
    [input => { input.state.quit = true; }, 'abandoned'],
    [input => { input.players[1].playerId = ids[0]; }, 'same_player'],
    [input => { delete input.players[1].playerId; }, 'missing_identity'],
    [input => { input.players[1].playerId = 'a'.repeat(64); }, 'missing_identity'],
    [input => { input.selfId = ids[2]; }, 'missing_identity'],
    [input => { input.state.score = [0, 0]; }, 'invalid_score'],
    [input => { input.state.score = [-1, 2]; }, 'invalid_score'],
    [input => { input.state.score = [Infinity, 2]; }, 'invalid_score'],
    [input => { input.state.score = [1.5, 2]; }, 'invalid_score'],
    [input => { input.state.score = [1, 2, 3]; }, 'invalid_score'],
    [input => { input.state.score = [Number.MAX_SAFE_INTEGER, 2]; }, 'invalid_score'],
    [input => { input.sessionId = ''; }, 'invalid_match'],
    [input => { input.matchId = {}; }, 'invalid_match'],
  ];
  for (const [modify, reason] of cases) {
    const input = match(); modify(input);
    assert.deepEqual(records.record(input), { status: 'excluded', reason });
    assert.deepEqual(records.list().entries, []);
  }
  assert.equal(records.record(null).status, 'excluded');
});

test('ranking compares wins before win rate before cumulative points and stable public ID', () => {
  const records = createPeerRecords({ storage: storage() });
  records.record(match(1, 0, 1, 0, [5, 4]));
  records.record(match(2, 0, 2, 1, [2, 5]));
  assert.deepEqual(records.list().entries.map(row => row.playerId), [ids[2], ids[0], ids[1]]);
  records.record(match(3, 0, 3, 0, [5, 4]));
  assert.deepEqual(records.list().entries.map(row => row.playerId), [ids[0], ids[2], ids[1], ids[3]]);
  const returned = records.list(); returned.entries[0].wins = 999;
  assert.equal(records.list().entries[0].wins, 2);
});

test('normal tied pause endings persist draws in the win-rate denominator while abandoned ties never count', () => {
  const local = storage(), records = createPeerRecords({ storage: local });
  records.record(match());
  const draw = match(2, 0, 1, null, [2, 2]);
  draw.state.message = '暂停超时 · 平分，本局不计胜负';
  assert.equal(records.record(draw).status, 'local');
  const suspended = match(3, 0, 1, null, [0, 0]);
  suspended.state.message = '暂停次数已用完，本局按当前比分结束';
  assert.equal(records.record(suspended).status, 'local');
  const reloaded = createPeerRecords({ storage: local });
  assert.deepEqual(reloaded.list().entries.map(row => [row.matches, row.wins, row.draws, row.points, row.winRate]),
    [[3, 1, 2, 7, 1 / 3], [3, 0, 2, 4, 0]]);
  for (const state of [draw.state, { ...draw.state, winner: 0 }]) {
    assert.deepEqual(reloaded.record({ ...draw, matchId: 4, state, abandoned: true }), { status: 'excluded', reason: 'abandoned' });
  }
  assert.equal(reloaded.record({ ...draw, matchId: 4, state: { ...draw.state, score: [3, 2] } }).status, 'excluded');
  assert.equal(reloaded.record({ ...draw, matchId: 4, state: { ...draw.state, message: '球友已离开，本局结束' } }).status, 'excluded');
});

test('standard games, partial final games and point-total snapshots count each point only once', () => {
  const records = createPeerRecords({ storage: storage() });
  const standard = match();
  standard.state = { phase: 'over', ruleset: 'standard21', winner: 0, score: [22, 20],
    gameScores: [[21, 18], [15, 21], [22, 20]], gameNumber: 3 };
  records.record(standard);
  assert.deepEqual(records.list().entries.map(row => row.points), [58, 59]);
  const partial = match(2); partial.state = { phase: 'over', ruleset: 'standard21', winner: 1,
    score: [7, 9], gameScores: [[21, 18]], gameNumber: 2 };
  records.record(partial);
  assert.deepEqual(records.list().entries.map(row => row.points), [86, 86]);
  const totals = match(3); totals.state.pointTotals = [42, 38]; records.record(totals);
  assert.deepEqual(records.list().entries.map(row => row.points), [128, 124]);
  for (const state of [
    { ...standard.state, gameScores: new Array(10000).fill([21, 0]) },
    { ...standard.state, gameNumber: 10000 },
    { ...standard.state, gameScores: [[21, -1]] },
    { ...standard.state, pointTotals: [NaN, 2] },
  ]) assert.equal(records.record({ ...standard, matchId: 4, state }).reason, 'invalid_score');
});

test('corrupt and oversized stored data are preserved while new results remain in memory', () => {
  for (const raw of ['not json', 'x'.repeat(600000), JSON.stringify({ version: 1, records: [{ invalid: true }] }),
    JSON.stringify({ version: 1, records: new Array(501).fill(null) })]) {
    const local = storage(); local.setItem(STORAGE_KEY, raw);
    const records = createPeerRecords({ storage: local });
    assert.deepEqual(records.list(), { entries: [], storage: 'local-memory' });
    assert.equal(records.record(match()).status, 'local-memory');
    assert.equal(local.getItem(STORAGE_KEY), raw);
  }
});

test('retention is bounded to recent 500 matches, display to 50 players, and dedupe keys cannot collide', () => {
  const local = storage(), records = createPeerRecords({ storage: local });
  for (let index = 1; index <= 510; index++) {
    const input = match(index);
    input.players[1].playerId = (index + 100).toString(16).padStart(12, '0');
    records.record(input);
  }
  assert.equal(records.list().entries.length, 50);
  assert.equal(records.list().entries[0].matches, 500);
  assert.equal(JSON.parse(local.getItem(STORAGE_KEY)).records.length, 500);
  assert.ok(local.getItem(STORAGE_KEY).length < 500000);
  const reloaded = createPeerRecords({ storage: local });
  assert.deepEqual(reloaded.list(), records.list());
  const collisions = createPeerRecords({ storage: storage() });
  collisions.record({ ...match('b:c'), sessionId: 'a' });
  collisions.record({ ...match('c'), sessionId: 'a:b' });
  assert.equal(collisions.list().entries[0].matches, 2);
});
