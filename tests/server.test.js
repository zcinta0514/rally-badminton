import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer } from '../server/index.js';
import { EventEmitter } from 'node:events';
import { Rooms } from '../server/rooms.js';
import { finishMatch, getShotTarget, predictLanding } from '../shared/game.js';

async function client(url, options = {}) {
  const ws = new WebSocket(url.replace('http','ws') + '/ws', options);
  const queue = [];
  const listeners = new Set();
  ws.on('message', raw => { const m=JSON.parse(raw); queue.push(m); for(const fn of listeners) fn(); });
  await new Promise((resolve,reject) => { ws.once('open',resolve); ws.once('error',reject); });
  return {
    ws, send: m => ws.send(JSON.stringify(m)),
    wait(predicate, timeout=3500) {
      return new Promise((resolve,reject) => {
        const poll=()=>{ const i=queue.findIndex(predicate); if(i>=0){clearTimeout(timer);listeners.delete(poll);resolve(queue.splice(i,1)[0]);} };
        const timer=setTimeout(()=>{listeners.delete(poll);reject(new Error('Missing message: '+predicate+'; received '+queue.map(m=>m.type).slice(-12)));},timeout);
        listeners.add(poll); poll();
      });
    }, close: () => ws.close()
  };
}
async function setup(t) {
  const app=createServer({port:0,host:'127.0.0.1'}); await app.listen();
  t.after(()=>app.close()); return app;
}
async function pair(t, app, options = {}) {
  const a=await client(app.url);const b=await client(app.url);
  t.after(()=>{a.close();b.close();});
  a.send({type:'create',name:'甲',role:'swift',target:5,...options});
  const room=await a.wait(m=>m.type==='room');
  b.send({type:'join',code:room.code,name:'乙',role:'power'});
  const bRoom = await b.wait(m=>m.type==='room');
  const initialA = (await a.wait(m=>m.type==='state')).state;
  const initialB = (await b.wait(m=>m.type==='state')).state;
  return {a,b,room,bRoom,initialA,initialB};
}
test('serves health but never repository metadata or source server',async t=>{
  const app=await setup(t);
  assert.equal((await fetch(app.url+'/health')).status,200);
  for(const path of ['/.git/HEAD','/server/index.js','/package.json','/%2e%2e/.git/HEAD']) {
    assert.notEqual((await fetch(app.url+path)).status,200);
  }
});
test('room joins two players and rejects a third',async t=>{
  const app=await setup(t);const {room}=await pair(t,app);const c=await client(app.url);t.after(()=>c.close());
  c.send({type:'join',code:room.code,name:'第三人',role:'balanced'});
  assert.match((await c.wait(m=>m.type==='error')).message,/满|开始/);
});

test('father-son WebSocket room rejects unsupported guests before starting and accepts an updated retry', async t => {
  const app = await setup(t), host = await client(app.url), guest = await client(app.url);
  t.after(() => { host.close(); guest.close(); });
  host.send({ type: 'create', name: '甲', finale: 'father-son' });
  const room = await host.wait(message => message.type === 'room');
  for (const finaleCapability of [undefined, null, false, true, 'none', {}]) {
    guest.send({ type: 'join', code: room.code, name: '乙',
      ...(finaleCapability === undefined ? {} : { finaleCapability }) });
    assert.match((await guest.wait(message => message.type === 'error')).message, /更新游戏/);
  }
  guest.send({ type: 'join', code: room.code, name: '乙', finaleCapability: 'father-son' });
  const joined = await guest.wait(message => message.type === 'room');
  assert.deepEqual(joined.rules, { finale: 'father-son' });
  assert.deepEqual((await host.wait(message => message.type === 'room' && message.players[1])).rules, joined.rules);
  assert.equal((await guest.wait(message => message.type === 'state')).state.phase, 'serve');
});

test('ordinary WebSocket rooms allow legacy guests without finale capability', async t => {
  const app = await setup(t), { room, bRoom, initialB } = await pair(t, app);
  assert.deepEqual(room.rules, { finale: 'none' });
  assert.deepEqual(bRoom.rules, { finale: 'none' });
  assert.equal(initialB.phase, 'serve');
});
test('server controls identity, vectors, role and score',async t=>{
  const app=await setup(t);const {a,b,initialA}=await pair(t,app);
  a.send({type:'input',x:999,z:0,slot:1,score:[99,0],role:'power',shot:'clear'});
  const sa=await a.wait(m=>m.type==='state'&&m.state.phase==='rally');
  const sb=await b.wait(m=>m.type==='state'&&m.state.phase==='rally');
  assert.deepEqual(sa.state.score,[0,0]);assert.deepEqual(sb.state.score,[0,0]);
  assert.equal(sa.state.players[0].role,'swift');assert.equal(sa.state.players[1].role,'power');
  assert.ok(Math.abs(sa.state.players[0].vx)<=10);
  assert.equal(sa.state.players[1].vx,0);assert.equal(sa.state.players[1].x,initialA.players[1].x);
});
test('pause is shared and positions remain frozen',async t=>{
  const app=await setup(t);const {a,b}=await pair(t,app);
  a.send({type:'pause'});
  const first=await a.wait(m=>m.type==='state'&&m.state.phase==='paused');
  await b.wait(m=>m.type==='state'&&m.state.phase==='paused');
  a.send({type:'input',x:1,z:-1});
  const later=await a.wait(m=>m.type==='state'&&m.state.phase==='paused'&&m.state.pause.remaining<first.state.pause.remaining-0.15);
  assert.equal(later.state.players[0].x,first.state.players[0].x);
  assert.equal(later.state.players[0].z,first.state.players[0].z);
  assert.ok(later.state.pause.remaining<=30);
});
test('bad JSON and invalid inputs do not stop the room server',async t=>{
  const app=await setup(t);const a=await client(app.url);t.after(()=>a.close());
  a.ws.send('{broken'); assert.equal((await a.wait(m=>m.type==='error')).type,'error');
  a.send({type:'create',name:'甲',role:'missing',target:999});
  const room=await a.wait(m=>m.type==='room');assert.equal(room.target,5);assert.equal(room.players[0].role,'balanced');
});

class TestSocket extends EventEmitter {
  readyState = 1;
  messages = [];
  pings = 0;
  autoPong = true;
  send(data) { this.messages.push(JSON.parse(data)); }
  ping() { this.pings++; if (this.autoPong) this.emit('pong'); }
  terminate() { this.readyState = 3; this.emit('close'); }
}

function controlledRoom(t, options = {}) {
  let time = 0;
  const rooms = new Rooms({ now: () => time });
  clearInterval(rooms.timer);
  t.after(() => rooms.close());
  const addClient = () => { const socket = new TestSocket(); rooms.attach(socket); return rooms.clients.get(socket); };
  const a = addClient(), b = addClient();
  rooms.message(a, { type: 'create', target: 5, ...options });
  rooms.message(b, { type: 'join', code: a.room.code });
  return { rooms, a, b, room: a.room, addClient, elapse(ms) { time += ms; }, advance(ms) { time += ms; rooms.tick(); } };
}

test('movement packets cannot replace the aim and charge of a queued shot', t => {
  const f = controlledRoom(t);
  const expected = getShotTarget(f.room.state, 0, { shot: 'clear', aim: 1, charge: 1 });
  f.rooms.message(f.a, { type: 'input', shot: 'clear', aim: 1, charge: 1 });
  f.rooms.message(f.a, { type: 'input', x: 1, z: 0 });
  assert.equal(f.room.inputs[0].aim, 1);
  assert.equal(f.room.inputs[0].charge, 1);
  f.advance(100);
  assert.equal(f.room.state.phase, 'rally');
  const landing = predictLanding(f.room.state);
  assert.ok(Math.abs(landing.x - expected.x) < 1e-8, 'the accepted shot keeps its chosen legal service lane');
  assert.ok(Math.abs(landing.z - expected.z) < 1e-8, 'the accepted shot keeps its original charge');
});

test('queued shot direction includes depth and remains atomic through movement and preparation packets', t => {
  const f = controlledRoom(t);
  const request = {shot: 'clear', aim: 0.7, aimDepth: -0.85, charge: 0.7};
  const expected = getShotTarget(f.room.state, 0, request);
  f.rooms.message(f.a, {type: 'input', ...request});
  f.rooms.message(f.a, {type: 'input', x: 1, z: -1, prepare: 'drop', aim: -1, aimDepth: 1, charge: 0});
  assert.equal(f.room.inputs[0].aimDepth, request.aimDepth);
  assert.equal(f.room.inputs[0].aim, request.aim);
  assert.equal(f.room.inputs[0].charge, request.charge);
  f.advance(100);
  assert.equal(f.room.state.hitId, 1);
  const landing = predictLanding(f.room.state);
  assert.ok(Math.hypot(landing.x - expected.x, landing.z - expected.z) < 1e-8);
});

test('server clamps shot depth and rejects nonfinite or nonnumeric direction values', t => {
  const f = controlledRoom(t);
  for (const [aimDepth, expected] of [[-10, -1], [10, 1], [0.4, 0.4], [NaN, 0], [Infinity, 0], [-Infinity, 0], ['1', 0], [null, 0], [{}, 0], [undefined, 0]]) {
    f.rooms.message(f.a, {type: 'input', prepare: 'drop', aimDepth});
    assert.equal(f.room.inputs[0].aimDepth, expected);
  }
  f.rooms.message(f.a, {type: 'input', shot: 'clear', aimDepth: Infinity});
  assert.equal(f.room.inputs[0].aimDepth, 0);
});

test('both peers receive authoritative shot quality and client quality or timing claims are ignored', t => {
  const f = controlledRoom(t), s = f.room.state;
  s.phase = 'rally';
  Object.assign(s.players[0], {x: 0, z: 3.8, vx: 0, vz: 0, stamina: 22});
  Object.assign(s.shuttle, {x: 1.3, y: 2.8, z: 3.8, vx: 0, vy: -1, vz: 0, active: true, lastHit: 1});
  const request = {shot: 'clear', aim: 0.9, aimDepth: 1, charge: 0.9};
  f.rooms.message(f.a, {type: 'input', ...request, quality: {score: 1, risk: 0}, at: -999,
    contactAt: -999, startedAt: -999, hitId: 9000, hit: true, stamina: 100, player: {x: 1.3, stamina: 100}});
  assert.equal(Object.hasOwn(f.room.inputs[0], 'quality'), false);
  assert.equal(Object.hasOwn(f.room.inputs[0], 'contactAt'), false);
  f.rooms.message(f.a, {type: 'input', x: 0, z: 0, aim: -1, aimDepth: -1, charge: 0});
  f.advance(100);
  assert.equal(s.hitId, 1);
  assert.ok(s.lastShotInfo?.quality.risk > 0.2);
  assert.ok(s.lastShotInfo.at > 0 && s.lastShotInfo.at <= s.time);
  assert.ok(s.lastShotInfo.aimX > 0 && s.lastShotInfo.aimZ < -6);
  f.rooms.broadcast(f.room);
  const first = f.a.socket.messages.filter(m => m.type === 'state').at(-1).state.lastShotInfo;
  const second = f.b.socket.messages.filter(m => m.type === 'state').at(-1).state.lastShotInfo;
  assert.deepEqual(first, second);
  assert.deepEqual(first, s.lastShotInfo);
  assert.deepEqual(s.players[0].action.quality, first.quality);
});

test('rally ending is shared once and client event or winner claims cannot forge it', t => {
  const f = controlledRoom(t), s = f.room.state;
  s.phase = 'rally';
  Object.assign(s.shuttle, {x: 0.2, y: 0.9, z: 0.03, vx: 0.4, vy: -1, vz: -7, active: true, lastHit: 0});
  f.rooms.message(f.a, {type: 'input', rallyEnd: {id: 999, kind: 'out', winner: 0, at: -100}, winner: 0, pointId: 999});
  assert.equal(s.rallyEnd, null);
  f.advance(50);
  assert.equal(s.pointId, 1); assert.deepEqual(s.score, [0, 1]);
  assert.equal(s.rallyEnd?.kind, 'net'); assert.equal(s.rallyEnd.id, 1); assert.equal(s.rallyEnd.winner, 1);
  assert.ok(s.rallyEnd.at > 0 && s.rallyEnd.at <= s.time);
  const first = f.a.socket.messages.filter(m => m.type === 'state').at(-1).state.rallyEnd;
  const second = f.b.socket.messages.filter(m => m.type === 'state').at(-1).state.rallyEnd;
  assert.deepEqual(first, second); assert.deepEqual(first, s.rallyEnd);
  f.rooms.message(f.b, {type: 'input', rallyEnd: {id: 1000, kind: 'in', winner: 0}, score: [99, 0]});
  f.advance(50); assert.equal(s.pointId, 1); assert.deepEqual(s.rallyEnd, first);
});

test('resume requires both connected players and broadcasts each readiness change', t => {
  const f = controlledRoom(t);
  f.rooms.message(f.a, { type: 'pause' });
  f.rooms.message(f.a, { type: 'resume' });
  assert.equal(f.room.state.phase, 'paused');
  assert.deepEqual(f.a.socket.messages.filter(m => m.type === 'resumeReady').at(-1), { type: 'resumeReady', ready: [0] });
  f.rooms.message(f.a, { type: 'resume' });
  assert.equal(f.room.state.phase, 'paused');
  f.rooms.message(f.b, { type: 'resume' });
  assert.equal(f.room.state.phase, 'countdown');
  assert.ok(f.b.socket.messages.some(m => m.type === 'resumeReady' && m.ready.length === 2));
});

test('a countdown disconnect preserves the same pause budget and original phase', t => {
  const f = controlledRoom(t);
  f.rooms.message(f.a, { type: 'pause' });
  f.advance(5000);
  const remaining = f.room.state.pause.remaining;
  f.rooms.message(f.a, { type: 'resume' });
  f.rooms.message(f.b, { type: 'resume' });
  assert.equal(f.room.state.phase, 'countdown');
  f.b.socket.terminate();
  assert.equal(f.room.state.phase, 'paused');
  assert.equal(f.room.state.pause.remaining, remaining);
  assert.equal(f.room.state.pause.previousPhase, 'serve');
  assert.deepEqual(f.room.state.pause.used, [1, 0]);
  assert.deepEqual([...f.room.resumeReady], []);
});

test('a suspend during countdown also returns to the existing pause', t => {
  const f = controlledRoom(t);
  f.rooms.message(f.a, { type: 'pause' });
  f.advance(1000);
  const remaining = f.room.state.pause.remaining;
  f.rooms.message(f.a, { type: 'resume' });
  f.rooms.message(f.b, { type: 'resume' });
  f.rooms.message(f.b, { type: 'suspend' });
  assert.equal(f.room.state.phase, 'paused');
  assert.equal(f.room.state.pause.remaining, remaining);
  assert.deepEqual(f.room.state.pause.used, [1, 0]);
});

test('fixed simulation steps follow elapsed monotonic time rather than timer callback count', t => {
  const f = controlledRoom(t);
  f.advance(10);
  assert.equal(f.room.state.time, 0);
  for (let i = 0; i < 99; i++) f.advance(10);
  assert.ok(Math.abs(f.room.state.time - 1) < 1e-8);
});

test('a missing WebSocket pong freezes the match and releases the dead connection', t => {
  const f = controlledRoom(t);
  f.a.socket.autoPong = false;
  f.advance(1001);
  assert.equal(f.a.socket.pings, 1);
  assert.equal(f.room.state.phase, 'serve');
  f.advance(5001);
  assert.equal(f.a.socket.readyState, 3);
  assert.equal(f.room.players[0].connected, false);
  assert.equal(f.room.state.phase, 'paused');
  assert.deepEqual(f.room.state.pause.used, [1, 0]);
  assert.equal(f.room.state.pause.remaining, 30);
});

test('a real WebSocket client that stops answering ping is frozen within the heartbeat window', async t => {
  const app = await setup(t);
  const a = await client(app.url, { autoPong: false }), b = await client(app.url);
  t.after(() => { a.close(); b.close(); });
  a.send({ type: 'create' });
  const room = await a.wait(m => m.type === 'room');
  b.send({ type: 'join', code: room.code });
  await b.wait(m => m.type === 'state');
  const frozen = await b.wait(m => m.type === 'state' && m.state.phase === 'paused', 7500);
  assert.deepEqual(frozen.state.pause.used, [1, 0]);
  assert.ok(frozen.state.pause.remaining > 29);
});

test('token reconnect retains the countdown interruption budget and requires fresh readiness', t => {
  const f = controlledRoom(t);
  const token = f.room.players[1].token;
  f.rooms.message(f.a, { type: 'pause' });
  f.advance(12000);
  f.rooms.message(f.a, { type: 'resume' });
  f.rooms.message(f.b, { type: 'resume' });
  f.b.socket.terminate();
  const remaining = f.room.state.pause.remaining;
  const replacement = f.addClient();
  f.rooms.message(replacement, { type: 'resumeSession', token });
  assert.equal(replacement.slot, 1);
  assert.equal(f.room.state.phase, 'paused');
  assert.equal(f.room.state.pause.remaining, remaining);
  assert.ok(remaining < 19);
  assert.deepEqual(f.room.state.pause.used, [1, 0]);
  f.rooms.message(f.a, { type: 'resume' });
  assert.equal(f.room.state.phase, 'paused');
  f.rooms.message(replacement, { type: 'resume' });
  assert.equal(f.room.state.phase, 'countdown');
  f.advance(3100);
  assert.equal(f.room.state.phase, 'serve');
});

test('real token reconnect restores only its original player without renewing the pause', async t => {
  const app = await setup(t); const { a, b, room, bRoom } = await pair(t, app);
  b.close();
  const paused = await a.wait(m => m.type === 'state' && m.state.phase === 'paused');
  const later = await a.wait(m => m.type === 'state' && m.state.phase === 'paused' && m.state.pause.remaining < paused.state.pause.remaining - 0.15);
  const replacement = await client(app.url); t.after(() => replacement.close());
  replacement.send({ type: 'resumeSession', token: bRoom.token });
  const restored = await replacement.wait(m => m.type === 'room');
  const state = (await replacement.wait(m => m.type === 'state')).state;
  assert.equal(restored.code, room.code); assert.equal(restored.slot, 1);
  assert.deepEqual(state.pause.used, [0, 1]);
  assert.ok(state.pause.remaining <= later.state.pause.remaining);
  assert.equal(state.phase, 'paused');
});

for (const [score, winner] of [[[2, 1], 0], [[1, 2], 1], [[2, 2], null]]) {
  test(`30-second pause timeout settles ${score.join(':')} with winner ${winner}`, t => {
    const f = controlledRoom(t);
    f.room.state.score = score;
    f.rooms.message(f.a, { type: 'pause' });
    f.advance(30001);
    assert.equal(f.room.state.phase, 'over');
    assert.equal(f.room.state.winner, winner);
  });
}

test('a real rematch starts only after both players request it and resets the next match', async t => {
  const app = await setup(t); const { a, b, room } = await pair(t, app);
  const current = app.rooms.rooms.get(room.code);
  current.state.score = [5, 2]; current.state.pause.used = [1, 1];
  finishMatch(current.state, 0, 'test match complete'); app.rooms.broadcast(current);
  a.send({ type: 'rematch' });
  assert.deepEqual((await a.wait(m => m.type === 'rematch')).ready, [0]);
  assert.equal(current.state.phase, 'over');
  b.send({ type: 'rematch' });
  const next = await a.wait(m => m.type === 'state' && m.state.phase === 'serve' && m.state.score[0] === 0);
  assert.deepEqual(next.state.score, [0, 0]);
  assert.deepEqual(next.state.pause.used, [0, 0]);
});

test('expiring a room removes its tokens and detaches its connected clients', t => {
  const f = controlledRoom(t);
  const token = f.room.players[0].token;
  f.rooms.remove(f.room);
  assert.equal(f.a.room, null);
  assert.equal(f.b.room, null);
  assert.equal(f.a.socket.readyState, 3);
  assert.equal(f.rooms.tokens.has(token), false);
  assert.equal(f.rooms.rooms.size, 0);
});

test('rally pause and countdown preserve the shuttle until play resumes', t => {
  const f = controlledRoom(t);
  f.rooms.message(f.a, { type: 'input', shot: 'clear', aim: 0.4, charge: 0.5 });
  f.advance(100);
  assert.equal(f.room.state.phase, 'rally');
  f.rooms.message(f.a, { type: 'pause' });
  const shuttle = structuredClone(f.room.state.shuttle);
  const gameTime = f.room.state.time;
  f.advance(1000);
  f.rooms.message(f.a, { type: 'resume' });
  f.rooms.message(f.b, { type: 'resume' });
  f.advance(1990);
  assert.equal(f.room.state.phase, 'countdown');
  assert.deepEqual(f.room.state.shuttle, shuttle);
  assert.equal(f.room.state.time, gameTime);
  f.advance(30);
  assert.equal(f.room.state.phase, 'rally');
  f.advance(20);
  assert.notEqual(f.room.state.shuttle.z, shuttle.z);
});

test('point pause restores its remaining point timer instead of granting a new delay', t => {
  const f = controlledRoom(t);
  f.room.state.phase = 'point'; f.room.state.timer = 0.37;
  f.rooms.message(f.a, { type: 'pause' });
  f.advance(1000);
  f.rooms.message(f.a, { type: 'resume' });
  f.rooms.message(f.b, { type: 'resume' });
  f.advance(2000);
  assert.equal(f.room.state.phase, 'point');
  assert.equal(f.room.state.timer, 0.37);
});

test('disconnect cancels existing readiness and a late close cannot affect the replacement socket', t => {
  const f = controlledRoom(t);
  const token = f.room.players[1].token, oldSocket = f.b.socket;
  f.rooms.message(f.a, { type: 'pause' });
  f.rooms.message(f.a, { type: 'resume' });
  oldSocket.terminate();
  const replacement = f.addClient();
  f.rooms.message(replacement, { type: 'resumeSession', token });
  f.rooms.message(replacement, { type: 'resume' });
  assert.equal(f.room.state.phase, 'paused');
  assert.deepEqual([...f.room.resumeReady], [1]);
  oldSocket.emit('close');
  assert.equal(f.room.players[1].socket, replacement.socket);
  assert.equal(f.room.players[1].connected, true);
  f.rooms.message(f.a, { type: 'resume' });
  assert.equal(f.room.state.phase, 'countdown');
});

test('finished rounds cannot resume and one rematch vote cannot start a new match', t => {
  const f = controlledRoom(t);
  finishMatch(f.room.state, null, 'completed');
  f.rooms.message(f.a, { type: 'resume' });
  f.rooms.message(f.b, { type: 'resume' });
  assert.equal(f.room.state.phase, 'over');
  f.rooms.message(f.a, { type: 'rematch' });
  f.rooms.message(f.a, { type: 'rematch' });
  assert.equal(f.room.state.phase, 'over');
  assert.equal(f.room.rematch.size, 1);
});

test('a delayed pause does not consume time from before the pause request', t => {
  const f = controlledRoom(t);
  f.elapse(31010);
  f.rooms.message(f.a, { type: 'pause' });
  f.rooms.tick();
  assert.equal(f.room.state.phase, 'paused');
  assert.equal(f.room.state.pause.remaining, 30);
  assert.ok(Math.abs(f.room.state.time - 31.01) < 1e-8);
});

test('elapsed paused time is charged before beginning a fresh two-second countdown', t => {
  const f = controlledRoom(t);
  f.rooms.message(f.a, { type: 'pause' });
  f.elapse(1510);
  f.rooms.message(f.a, { type: 'resume' });
  f.rooms.message(f.b, { type: 'resume' });
  f.rooms.tick();
  assert.equal(f.room.state.phase, 'countdown');
  assert.equal(f.room.state.timer, 2);
  assert.ok(Math.abs(f.room.state.pause.remaining - 28.49) < 1e-8);
});

test('a waiting invitation cannot start a match while its host is disconnected', t => {
  const f = controlledRoom(t);
  const host = f.addClient(), guest = f.addClient();
  f.rooms.message(host, { type: 'create' });
  const waiting = host.room, token = waiting.players[0].token;
  host.socket.terminate();
  f.rooms.message(guest, { type: 'join', code: waiting.code });
  assert.equal(guest.room, null);
  assert.equal(waiting.state, null);
  assert.match(guest.socket.messages.at(-1).message, /房主.*离线|房主.*连接/);
  const replacement = f.addClient();
  f.rooms.message(replacement, { type: 'resumeSession', token });
  f.rooms.message(guest, { type: 'join', code: waiting.code });
  assert.equal(guest.room, waiting);
  assert.equal(waiting.state.phase, 'serve');
});

test('standard scoring is authoritative in room metadata, initial state and rematches', t => {
  const f = controlledRoom(t, { ruleset: 'standard21', target: 5 });
  assert.equal(f.room.ruleset, 'standard21');
  assert.equal(f.room.target, 21);
  for (const ctx of [f.a, f.b]) {
    const info = ctx.socket.messages.filter(m => m.type === 'room').at(-1);
    assert.equal(info.ruleset, 'standard21');
    assert.equal(info.target, 21);
  }
  assert.equal(f.room.state.ruleset, 'standard21');
  assert.equal(f.room.state.target, 21);
  f.rooms.message(f.b, { type: 'input', ruleset: 'quick', target: 5 });
  assert.equal(f.room.state.ruleset, 'standard21');
  finishMatch(f.room.state, 0, 'completed');
  f.rooms.message(f.a, { type: 'rematch', ruleset: 'quick', target: 5 });
  f.rooms.message(f.b, { type: 'rematch', ruleset: 'quick', target: 5 });
  assert.equal(f.room.state.phase, 'serve');
  assert.equal(f.room.state.ruleset, 'standard21');
  assert.equal(f.room.state.target, 21);
});

test('missing and invalid rule modes use quick scoring and preserve the selected quick target', t => {
  for (const ruleset of [undefined, 'unknown', {}, null]) {
    const f = controlledRoom(t, { ruleset, target: 11 });
    assert.equal(f.room.ruleset, 'quick');
    assert.equal(f.room.state.ruleset, 'quick');
    assert.equal(f.room.target, 11);
    assert.equal(f.room.state.target, 11);
  }
});

test('preparation packets are sanitized without replacing an atomic released shot', t => {
  const f = controlledRoom(t);
  f.rooms.message(f.a, { type: 'input', prepare: 'smash', charge: 2 });
  assert.equal(f.room.inputs[0].prepare, 'smash');
  assert.equal(f.room.inputs[0].charge, 1);
  f.rooms.message(f.a, { type: 'input', prepare: 'invalid', charge: '0.8' });
  assert.equal(f.room.inputs[0].prepare, null);
  assert.equal(f.room.inputs[0].charge, 0);
  f.rooms.message(f.a, { type: 'input', shot: 'clear', aim: 1, charge: 0.8 });
  f.rooms.message(f.a, { type: 'input', prepare: 'drop', aim: -1, charge: 0.1 });
  assert.equal(f.room.inputs[0].shot, 'clear');
  assert.equal(f.room.inputs[0].aim, 1);
  assert.equal(f.room.inputs[0].charge, 0.8);
  assert.equal(f.room.inputs[0].prepare, 'drop');
  f.advance(100);
  assert.equal(f.room.state.hitId, 1);
  assert.equal(f.room.state.lastShot, 'clear');
  f.rooms.message(f.a, { type: 'input', prepare: null, charge: 0 });
  assert.equal(f.room.inputs[0].prepare, null);
  f.rooms.message(f.a, { type: 'input', prepare: 'smash', charge: 1 });
  f.advance(251);
  assert.equal(f.room.inputs[0].prepare, undefined, 'stale preparation expires with stale movement');
});

test('both real WebSocket players receive the host scoring mode and its forced standard target', async t => {
  const app = await setup(t);
  const { room, bRoom, initialA, initialB } = await pair(t, app, { ruleset: 'standard21', target: 11 });
  for (const info of [room, bRoom, initialA, initialB]) {
    assert.equal(info.ruleset, 'standard21');
    assert.equal(info.target, 21);
  }
});

test('a standard-game intermission disconnect freezes its remaining break and restores it after readiness', t => {
  const f = controlledRoom(t, { ruleset: 'standard21' });
  f.room.state.phase = 'intermission'; f.room.state.timer = 3.2;
  const token = f.room.players[1].token;
  f.b.socket.terminate();
  assert.equal(f.room.state.phase, 'paused');
  assert.equal(f.room.state.pause.previousPhase, 'intermission');
  f.advance(1000);
  const replacement = f.addClient();
  f.rooms.message(replacement, { type: 'resumeSession', token });
  f.rooms.message(f.a, { type: 'resume' });
  f.rooms.message(replacement, { type: 'resume' });
  f.advance(2000);
  assert.equal(f.room.state.phase, 'intermission');
  assert.equal(f.room.state.timer, 3.2);
  assert.deepEqual(f.room.state.pause.used, [0, 1]);
});
