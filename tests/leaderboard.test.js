import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from '../server/index.js';
import { finishMatch } from '../shared/game.js';

const keys = ['a', 'b', 'c', 'd'].map(char => char.repeat(64));
class Socket extends EventEmitter {
  readyState = 1;
  messages = [];
  send(raw) { this.messages.push(JSON.parse(raw)); }
  ping() { this.emit('pong'); }
  terminate() { this.readyState = 3; this.emit('close'); }
}
async function setup(t, options = {}) {
  const app = createServer(options);
  await app.listen();
  clearInterval(app.rooms.timer);
  let time = 0;
  app.rooms.now = () => time; app.rooms.lastTick = 0; app.rooms.accumulator = 0;
  t.after(() => app.close());
  const add = () => { const socket = new Socket(); app.rooms.attach(socket); return app.rooms.clients.get(socket); };
  const pair = (first = 0, second = 1, extra = {}) => {
    const a = add(), b = add();
    app.rooms.message(a, {type:'create', name:`球友${first}`, playerKey:keys[first], ...extra});
    app.rooms.message(b, {type:'join', name:`球友${second}`, code:a.room.code, playerKey:keys[second]});
    return {a, b, room:a.room};
  };
  const end = async (room, score = [5, 2], winner = 0) => {
    room.state.score = score; finishMatch(room.state, winner, '本场结束'); app.rooms.broadcast(room);
    await app.leaderboard.flush(); await new Promise(resolve => setImmediate(resolve));
  };
  return {...app, app, add, pair, end, advance(ms) { time += ms; app.rooms.tick(); }};
}
test('leaderboard endpoint is public, uncached, bounded and exposes no private credentials', async t => {
  const f = await setup(t);
  const response = await fetch(f.url + '/api/leaderboard');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).entries, []);
  const {room} = f.pair(); await f.end(room);
  const data = await (await fetch(f.url + '/api/leaderboard')).json();
  assert.equal(data.entries.length, 2);
  assert.equal(data.entries[0].wins, 1);
  assert.equal(data.entries[0].winRate, 1);
  assert.equal(data.entries[0].points, 5);
  assert.ok(data.entries[0].playerId.match(/^[a-f0-9]{12}$/));
  assert.equal(JSON.stringify(data).includes(keys[0]), false);
  assert.equal((await fetch(f.url + '/api/leaderboard', {method:'HEAD'})).headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(await (await fetch(f.url + '/api/leaderboard', {method:'HEAD'})).text(), '');
});
test('room identity is private, stable across matches and client score claims cannot settle a match', async t => {
  const f = await setup(t), {a, b, room} = f.pair();
  const info = b.socket.messages.find(m => m.type === 'room');
  assert.ok(info.players[0].playerId);
  assert.equal(JSON.stringify(info).includes(keys[0]), false);
  assert.equal(JSON.stringify(info).includes(keys[1]), false);
  f.rooms.message(a, {type:'input', score:[99,0], winner:0, phase:'over', playerKey:keys[2]});
  assert.equal(f.app.leaderboard.list().entries.length, 0);
  await f.end(room);
  for (let i = 0; i < 4; i++) { f.rooms.broadcast(room); f.advance(100); }
  f.rooms.message(a, {type:'rematch'}); f.rooms.message(b, {type:'rematch'});
  await f.end(room, [2,5], 1);
  const rows = f.app.leaderboard.list().entries;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(p => [p.matches,p.wins,p.losses,p.points]), [[2,1,1,7],[2,1,1,7]]);
  f.rooms.message(a, {type:'leave'}); f.rooms.remove(room);
  assert.equal(f.app.leaderboard.list().entries[0].matches, 2);
});
test('invalid keys are rejected and missing or duplicate identities do not enter the leaderboard', async t => {
  const f = await setup(t), bad = f.add();
  for (const playerKey of ['short', 'A'.repeat(64), {}, 7, 'a'.repeat(65)]) {
    f.rooms.message(bad, {type:'create', playerKey});
    assert.equal(bad.room, null);
    assert.equal(bad.socket.messages.at(-1).type, 'error');
  }
  const same = f.pair(0, 0); await f.end(same.room);
  assert.deepEqual(same.room.leaderboardResult, {status:'excluded', reason:'same_player'});
  const anonymous = f.pair(0, 1, {playerKey:undefined}); await f.end(anonymous.room);
  assert.equal(anonymous.room.leaderboardResult.reason, 'missing_identity');
  assert.equal(f.app.leaderboard.list().entries.length, 0);
});
test('abandoned matches are excluded while tied pause timeout is counted once as a draw', async t => {
  const f = await setup(t), abandoned = f.pair();
  abandoned.room.state.score = [3, 2]; f.rooms.message(abandoned.a, {type:'leave'});
  assert.equal(f.app.leaderboard.list().entries.length, 0);
  const {a, room} = f.pair(); room.state.score = [2, 2];
  f.rooms.message(a, {type:'pause'}); f.advance(30001);
  await f.app.leaderboard.flush(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(room.state.phase, 'over');
  assert.deepEqual(f.app.leaderboard.list().entries.map(p => [p.matches,p.draws,p.points,p.winRate]), [[1,1,2,0],[1,1,2,0]]);
});
test('rank order is wins then win rate then total points; standard scoring never duplicates the final game', async t => {
  const f = await setup(t);
  const first = f.pair(0, 1); await f.end(first.room, [5, 4], 0);
  const second = f.pair(0, 2); await f.end(second.room, [2, 5], 1);
  let rows = f.app.leaderboard.list().entries;
  assert.deepEqual(rows.map(p => p.name), ['球友2','球友0','球友1']);
  const standard = f.pair(2, 3, {ruleset:'standard21'});
  Object.assign(standard.room.state, {gameScores:[[21,18],[21,19]], gameNumber:2});
  await f.end(standard.room, [21,19], 0);
  rows = f.app.leaderboard.list().entries;
  assert.equal(rows[0].points, 47);
  assert.equal(rows.find(p => p.name === '球友3').points, 37);
  const partial = f.pair(2, 3, {ruleset:'standard21'});
  Object.assign(partial.room.state, {gameScores:[[21,18]], gameNumber:2});
  await f.end(partial.room, [7,9], 1);
  rows = f.app.leaderboard.list().entries;
  assert.equal(rows.find(p => p.name === '球友2').points, 75);
  assert.equal(rows.find(p => p.name === '球友3').points, 64);
});
test('persistent totals survive server reload without storing tokens, and name changes retain identity', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rally-leaderboard-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  const leaderboardPath = path.join(directory, 'data', 'leaderboard.json');
  const f = await setup(t, {leaderboardPath}), {room} = f.pair(0,1,{name:'  最新名字\u0000  '});
  await f.end(room);
  assert.equal(room.leaderboardResult.status, 'saved');
  const saved = await readFile(leaderboardPath, 'utf8');
  assert.equal(saved.includes(keys[0]), false);
  const second = await setup(t, {leaderboardPath});
  assert.deepEqual(second.app.leaderboard.list().entries, f.app.leaderboard.list().entries);
  assert.equal(second.app.leaderboard.list().entries[0].name, '最新名字');
  const again = second.pair(0,1,{name:'换个昵称'}); await second.end(again.room);
  assert.equal(second.app.leaderboard.list().entries[0].name, '换个昵称');
  assert.equal(second.app.leaderboard.list().entries[0].wins, 2);
});
test('failed or corrupt storage is reported while room play and in-memory totals remain available', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'rally-leaderboard-error-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  const blocker = path.join(directory, 'blocked'); await writeFile(blocker, 'file');
  const failures = [];
  const f = await setup(t, {leaderboardPath:path.join(blocker, 'leaderboard.json'), leaderboardOnError:error => failures.push(error)});
  const {a,b,room} = f.pair(); await f.end(room);
  assert.equal(room.leaderboardResult.status, 'error');
  assert.equal(f.app.leaderboard.list().entries[0].wins, 1);
  assert.ok(failures.length);
  f.rooms.message(a, {type:'rematch'}); f.rooms.message(b, {type:'rematch'});
  assert.equal(room.state.phase, 'serve');
  const corrupt = path.join(directory, 'corrupt.json'); await writeFile(corrupt, '{not json');
  const other = await setup(t, {leaderboardPath:corrupt, leaderboardOnError:() => {}});
  const pair = other.pair(); await other.end(pair.room);
  assert.equal(pair.room.leaderboardResult.status, 'error');
  assert.equal(await readFile(corrupt, 'utf8'), '{not json');
});
test('separate websocket hosting exposes leaderboard only to configured browser origins', async t => {
  const f = await setup(t, {allowedOrigins:['https://game.example']});
  const accepted = await fetch(f.url + '/api/leaderboard', {headers:{Origin:'https://game.example'}});
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get('access-control-allow-origin'), 'https://game.example');
  assert.equal(accepted.headers.get('vary'), 'Origin');
  assert.equal((await fetch(f.url + '/api/leaderboard', {headers:{Origin:'https://untrusted.example'}})).status, 403);
});
test('stopping the server never turns an unfinished match into a ranked result', async t => {
  const f = await setup(t), {room} = f.pair();
  room.state.score = [3, 1]; room.state.pause.used = [1, 1];
  f.rooms.close();
  await f.app.leaderboard.flush();
  assert.equal(f.app.leaderboard.list().entries.length, 0);
});
test('three-game totals, same-score order and the public top-50 limit are deterministic', async t => {
  const f = await setup(t), {room} = f.pair(0, 1, {ruleset:'standard21'});
  Object.assign(room.state, {gameScores:[[21,18],[15,21],[22,20]], gameNumber:3});
  await f.end(room, [22,20], 0);
  assert.equal(f.app.leaderboard.list().entries.find(p => p.name === '球友0').points, 58);
  assert.equal(f.app.leaderboard.list().entries.find(p => p.name === '球友1').points, 59);
  for (let index = 1; index <= 27; index++) {
    const players = [index * 2, index * 2 + 1].map(id => ({identity:createHash('sha256').update(String(id)).digest('hex'), name:'同名'}));
    await f.app.leaderboard.recordMatch(players, {phase:'over', ruleset:'quick', score:[5,5], winner:null});
  }
  const rows = f.app.leaderboard.list().entries;
  assert.equal(rows.length, 50);
  assert.equal(rows.at(-1).rank, 50);
  const tied = rows.filter(row => row.name === '同名');
  assert.equal(new Set(tied.map(row => row.playerId)).size, tied.length);
  assert.deepEqual(tied.map(row => row.playerId), tied.map(row => row.playerId).sort());
});
