import test from 'node:test';
import assert from 'node:assert/strict';
import { getLeaderboardURL, resultRecordText, createLeaderboard } from '../src/leaderboard.js';

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.textContent = ''; this.hidden = false; this.dataset = {}; }
  append(...elements) { this.children.push(...elements); }
  replaceChildren(...elements) { this.children = elements; }
  setAttribute(name, value) { this[name] = value; }
}
function fixture(fetchImpl) {
  const ids = new Map(['leaderboard-rows', 'leaderboard-status', 'leaderboard-retry', 'leaderboard-table', 'leaderboard-storage'].map(id => [id, new Element()]));
  const document = { getElementById: id => ids.get(id), createElement: tag => new Element(tag) };
  return { ids, board: createLeaderboard({ document, getURL: () => 'https://play.test/api/leaderboard', fetchImpl }) };
}
const entry = { rank: 1, playerId: 'a1b2c3d4e5f6', name: '<img onerror=alert(1)>', matches: 4, wins: 3, losses: 1, draws: 0, points: 18, winRate: .75 };

test('the board follows the configured match-server origin for both LAN and split HTTPS hosting', () => {
  assert.equal(getLeaderboardURL('ws://192.0.2.10:3000/ws'), 'http://192.0.2.10:3000/api/leaderboard');
  assert.equal(getLeaderboardURL('wss://matches.example.com/ws'), 'https://matches.example.com/api/leaderboard');
  assert.throws(() => getLeaderboardURL('https://site.test/ws'));
});

test('result text distinguishes server-confirmed persistence, pending, errors and excluded games', () => {
  assert.match(resultRecordText(null), /等待/);
  assert.match(resultRecordText({ status: 'pending' }), /保存中/);
  assert.match(resultRecordText({ status: 'saved' }), /已计入排行榜/);
  assert.match(resultRecordText({ status: 'memory' }), /临时/);
  assert.match(resultRecordText({ status: 'error' }), /失败/);
  assert.match(resultRecordText({ status: 'excluded', reason: 'same_player' }), /同一玩家/);
  assert.match(resultRecordText({ status: 'excluded', reason: 'abandoned' }), /中断/);
});

test('a successful ranking renders literal player names, win rate and cumulative points with no HTML interpolation', async () => {
  let options;
  const f = fixture(async (url, init) => { options = init; return { ok: true, json: async () => ({ entries: [entry], storage: 'persistent' }) }; });
  await f.board.load({ selfId: entry.playerId });
  const row = f.ids.get('leaderboard-rows').children[0];
  assert.equal(row.dataset.self, 'true');
  assert.equal(row.children[1].children[0].textContent, entry.name);
  assert.equal(row.children[3].textContent, '75%');
  assert.equal(row.children[4].textContent, '18');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.equal(f.ids.get('leaderboard-table').hidden, false);
});

test('empty, unavailable and failed states keep retry available without retaining stale rows', async () => {
  let response = { entries: [], storage: 'persistent' };
  const f = fixture(async () => { if (response instanceof Error) throw response; return { ok: true, json: async () => response }; });
  await f.board.load(); assert.match(f.ids.get('leaderboard-status').textContent, /暂无/);
  response = { entries: [], storage: 'unavailable' };
  await f.board.load(); assert.match(f.ids.get('leaderboard-status').textContent, /不可用/);
  response = Error('network');
  await f.board.load(); assert.match(f.ids.get('leaderboard-status').textContent, /无法连接/);
  assert.equal(f.ids.get('leaderboard-retry').hidden, false);
  assert.equal(f.ids.get('leaderboard-rows').children.length, 0);
});

test('a closed or superseded leaderboard ignores late responses', async () => {
  let resolve;
  const f = fixture(() => new Promise(done => { resolve = done; }));
  const loading = f.board.load(); f.board.cancel();
  resolve({ ok: true, json: async () => ({ entries: [entry], storage: 'persistent' }) });
  await loading;
  assert.equal(f.ids.get('leaderboard-rows').children.length, 0);
});

test('peer result and ranking copy disclose local scope, retention and memory-only storage', async () => {
  assert.match(resultRecordText({ status: 'local' }), /本机好友战绩/);
  assert.match(resultRecordText({ status: 'local-memory' }), /关闭.*丢失/);
  for (const storage of ['local', 'local-memory']) {
    const f = fixture(async () => ({ ok: true, json: async () => ({ entries: [entry], storage }) }));
    await f.board.load({ selfId: entry.playerId });
    assert.match(f.ids.get('leaderboard-status').textContent, /本机好友战绩/);
    assert.match(f.ids.get('leaderboard-storage').textContent, /仅保存本机参加的对局，与服务器榜单独立/);
    assert.match(f.ids.get('leaderboard-storage').textContent, /500/);
    if (storage === 'local-memory') assert.match(f.ids.get('leaderboard-storage').textContent, /关闭.*丢失/);
  }
  const empty = fixture(async () => ({ ok: true, json: async () => ({ entries: [], storage: 'local' }) }));
  await empty.board.load();
  assert.match(empty.ids.get('leaderboard-status').textContent, /本机好友战绩.*暂无/);
});
