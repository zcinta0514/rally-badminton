import test from 'node:test';
import assert from 'node:assert/strict';
import { collectArenaSounds, ArenaAudio } from '../src/arena-audio.js';
import { createMatch, stepMatch } from '../shared/game.js';

const state = () => ({ time: 1, hitId: 0, pointId: 0, phase: 'rally', lastShot: 'clear', rally: 0,
  players: [{ x: 0, z: 3, vx: 0, vz: 0, action: null }, { x: 0, z: -3, vx: 0, vz: 0, action: null }] });
const advance = (s, dt = 1 / 60) => { s.time += dt; return s; };
const score = (s, changes = {}) => { advance(s); s.pointId++; s.phase = 'point';
  s.rallyEnd = { id: s.pointId, at: s.time, kind: 'in', winner: 0, hitSide: 0, ...changes }; return s; };

test('contact and score each sound once, with no initial or duplicate snapshot sounds', () => {
  const s = state(), memory = {}; assert.deepEqual(collectArenaSounds(s, memory), []);
  advance(s); s.hitId++; s.lastShot = 'smash';
  assert.deepEqual(collectArenaSounds(s, memory), [{ type: 'hit', shot: 'smash' }]);
  for (let i = 0; i < 8; i++) assert.deepEqual(collectArenaSounds(structuredClone(s), memory), []);
  score(s); assert.deepEqual(collectArenaSounds(s, memory), [{ type: 'score', exciting: true }]);
  assert.deepEqual(collectArenaSounds(s, memory), []);
});

test('faults get ordinary applause; legal smashes and long rallies get cheers', () => {
  for (const [kind, shot, rally, winner, exciting] of [
    ['net', 'smash', 10, 1, false], ['out', 'smash', 10, 1, false], ['serviceFault', 'smash', 10, 1, false],
    ['in', 'smash', 2, 0, true], ['in', 'clear', 8, 0, true], ['in', 'drop', 7, 0, false], ['in', 'smash', 8, 1, false],
  ]) { const s = state(), memory = {}; collectArenaSounds(s, memory); s.lastShot = shot; s.rally = rally;
    score(s, { kind, winner }); assert.deepEqual(collectArenaSounds(s, memory), [{ type: 'score', exciting }]); }
});

test('out-of-order time and IDs never lower dedup memory or replay the latest contact', () => {
  const s = state(), memory = {}; collectArenaSounds(s, memory); const old = structuredClone(s);
  advance(s, .05); s.hitId = 1; s.lastShotInfo = { at: s.time };
  assert.equal(collectArenaSounds(s, memory).length, 1);
  assert.deepEqual(collectArenaSounds(old, memory), []); assert.deepEqual(collectArenaSounds(s, memory), []);
  assert.deepEqual(collectArenaSounds({ ...s, time: s.time + .01, hitId: 0 }, memory), []);
  assert.deepEqual(collectArenaSounds(advance(s, .02), memory), []);
  s.hitId++; advance(s, .02); s.lastShotInfo.at = s.time;
  assert.equal(collectArenaSounds(s, memory).filter(e => e.type === 'hit').length, 1);
});

test('dropped snapshots produce at most the latest fresh event and discard delayed history', () => {
  const s = state(), memory = {}; collectArenaSounds(s, memory);
  advance(s, .15); s.hitId = 3; s.lastShotInfo = { at: s.time - .03 };
  assert.deepEqual(collectArenaSounds(s, memory), [{ type: 'hit', shot: 'clear' }]);
  advance(s, 2); s.hitId = 5; s.lastShotInfo.at = s.time - 1;
  assert.deepEqual(collectArenaSounds(s, memory), []);
  score(s); s.rallyEnd.at = s.time - 1;
  assert.deepEqual(collectArenaSounds(s, memory), []); assert.deepEqual(collectArenaSounds(s, memory), []);
});

test('footsteps follow travel with a cadence limit, not one event per frame', () => {
  const s = state(), memory = {}, times = []; s.players[0].vx = 3; collectArenaSounds(s, memory);
  for (let i = 0; i < 60; i++) { advance(s); s.players[0].x += 3 / 60;
    const events = collectArenaSounds(s, memory); assert.equal(events.some(e => e.type === 'squeak'), false);
    if (events.some(e => e.type === 'foot')) times.push(s.time);
    assert.deepEqual(collectArenaSounds(s, memory), []); }
  assert.ok(times.length >= 3 && times.length <= 4, `one second of running produced ${times.length} steps`);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= .23);
});

test('actual game movement and fast braking never produce shoe friction', () => {
  const s = createMatch(), memory = {}, events = []; collectArenaSounds(s, memory);
  for (let i = 0; i < 16; i++) { stepMatch(s, [{ x: .55, z: 0 }, {}], 1 / 60); events.push(...collectArenaSounds(s, memory)); }
  assert.ok(s.players[0].vx > 2); assert.equal(events.filter(e => e.type === 'squeak').length, 0);
  for (let i = 0; i < 10; i++) { stepMatch(s, [{}, {}], 1 / 60); events.push(...collectArenaSounds(s, memory)); }
  assert.ok(events.every(e => e.type === 'foot'));
});

test('sharp turns and stops never produce shoe friction', () => {
  const s = state(), memory = {}; s.players[0].vx = 3; collectArenaSounds(s, memory);
  const turn = (vx, vz, dt = .05) => { advance(s, dt); Object.assign(s.players[0], { vx, vz });
    s.players[0].x += vx * dt; s.players[0].z += vz * dt; return collectArenaSounds(s, memory).filter(e => e.type === 'squeak'); };
  assert.deepEqual(turn(2.5, 1), []); assert.deepEqual(turn(1.5, 1), []);
  for (let i = 0; i < 7; i++) turn(3, 0);
  assert.deepEqual(turn(2.5, 1), []); turn(1, 0, .1); assert.deepEqual(turn(0, 0), []);
});

test('shoes exclude teleports, airborne motion, score hard stops and pause resumes', () => {
  for (const kind of ['teleport', 'airborne', 'point', 'paused', 'countdown']) {
    const s = state(), memory = {}; s.players[0].vx = 3; collectArenaSounds(s, memory);
    advance(s, .05); s.players[0].vx = 1.6; s.players[0].x += .08;
    if (kind === 'teleport') s.players[0].x += 2;
    if (kind === 'airborne') s.players[0].action = { jumpHeight: .3 };
    if (kind === 'point') score(s);
    if (kind === 'paused' || kind === 'countdown') s.phase = kind;
    assert.equal(collectArenaSounds(s, memory).some(e => ['foot', 'squeak'].includes(e.type)), false, kind);
    s.phase = 'rally'; s.players[0].action = null; advance(s, .05); s.players[0].vx = 0;
    assert.equal(collectArenaSounds(s, memory).some(e => ['foot', 'squeak'].includes(e.type)), false, `${kind} return`);
  }
});

test('paused and countdown snapshots consume IDs without playing them on resume', () => {
  for (const phase of ['paused', 'countdown']) { const s = state(), memory = {}; collectArenaSounds(s, memory);
    advance(s); s.hitId++; score(s); s.phase = phase; assert.deepEqual(collectArenaSounds(s, memory), []);
    s.phase = 'point'; advance(s); assert.deepEqual(collectArenaSounds(s, memory), []); }
});

// Node has no Web Audio implementation. Observe real controller source scheduling,
// envelope strengths and disconnects with a small Web Audio boundary fixture.
function audioFixture({ fetchFailure = false, decodeFailure = false, resumeFailure = false, initialState = 'suspended' } = {}) {
  const sources = [], gains = [], requests = [], contexts = [];
  const param = (value = 0) => ({ value, calls: [], setValueAtTime(v, at) { this.value = v; this.calls.push(['set', v, at]); },
    linearRampToValueAtTime(v, at) { this.value = v; this.calls.push(['linear', v, at]); },
    exponentialRampToValueAtTime(v, at) { this.value = v; this.calls.push(['exponential', v, at]); },
    setTargetAtTime(v, at) { this.value = v; this.calls.push(['target', v, at]); }, cancelScheduledValues() {} });
  const node = () => ({ disconnected: false, connect() {}, disconnect() { this.disconnected = true; } });
  class FakeContext {
    constructor() { this.state = initialState; this.currentTime = 4; this.sampleRate = 8000; this.destination = node(); this.decodes = 0; contexts.push(this); }
    createGain() { const gain = { ...node(), gain: param(1) }; gains.push(gain); return gain; }
    createBufferSource() { const source = { ...node(), playbackRate: param(1), stops: [], starts: [],
      start(...args) { this.starts.push(args); }, stop(at) { this.stops.push(at); } }; sources.push(source); return source; }
    createBuffer(channels, length, rate) { return { duration: length / rate, getChannelData: () => new Float32Array(length) }; }
    createBiquadFilter() { return { ...node(), frequency: param(), Q: param() }; }
    createOscillator() { throw new Error('electronic oscillator must not be used'); }
    async decodeAudioData() { this.decodes++; if (decodeFailure) throw new Error('bad sample'); return { duration: 1.4, sample: true }; }
    async resume() { if (resumeFailure) throw new Error('audio denied'); this.state = 'running'; }
  }
  const fetch = async url => { requests.push(String(url)); if (fetchFailure) throw new Error('offline');
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; };
  const audio = new ArenaAudio({ AudioContext: FakeContext, fetch, random: () => .5 });
  return { audio, sources, gains, requests, contexts };
}

test('gesture unlock loads local samples once and uses decoded sources without oscillators', async () => {
  const f = audioFixture(); await f.audio.unlock(); await f.audio.unlock(); assert.equal(f.contexts.length, 1);
  assert.equal(f.requests.length, 7); assert.equal(new Set(f.requests).size, 7);
  assert.ok(f.requests.every(url => url.startsWith(new URL('../src/audio/', import.meta.url).href)));
  assert.equal(f.contexts[0].decodes, 7);
  const s = state(); f.audio.update(s); advance(s); s.hitId++; f.audio.update(s);
  assert.equal(f.sources.length, 1); assert.equal(f.sources[0].buffer.sample, true); assert.equal(f.sources[0].starts.length, 1);
});

test('smash, ordinary hit and drop have successively softer envelopes and short samples', async () => {
  const f = audioFixture(); await f.audio.unlock(); f.audio.update(state()); const levels = [], durations = [];
  for (const shot of ['smash', 'clear', 'drop']) { const before = f.gains.length; f.audio.hit(shot);
    levels.push(Math.max(...f.gains.slice(before).flatMap(g => g.gain.calls.map(c => c[1]))));
    const source = f.sources.at(-1); durations.push(source.stops[0] - source.starts[0][0]); }
  assert.ok(levels[0] > levels[1] && levels[1] > levels[2]); assert.ok(durations.every(d => d > 0 && d <= .25));
});

test('visibility, mute, pause, countdown and reset immediately stop and disconnect active voices', async () => {
  for (const action of ['hide', 'hiddenUpdate', 'mute', 'paused', 'countdown', 'reset']) {
    const f = audioFixture(); await f.audio.unlock(); const s = state(); f.audio.update(s);
    s.lastShot = 'smash'; score(s); f.audio.update(s); assert.equal(f.sources.length, 1, action); const playing = f.sources[0];
    if (action === 'hide') f.audio.setVisible(false);
    if (action === 'hiddenUpdate') f.audio.update(s, false);
    if (action === 'mute') f.audio.setEnabled(false);
    if (action === 'reset') f.audio.reset();
    if (action === 'paused' || action === 'countdown') { s.phase = action; f.audio.update(s); }
    assert.ok(playing.stops.includes(f.contexts[0].currentTime), `${action}: immediate stop`);
    assert.equal(playing.disconnected, true, `${action}: disconnect source`);
    assert.ok(f.gains.slice(1).every(g => g.disconnected), `${action}: disconnect envelope`);
    if (['hide', 'hiddenUpdate', 'mute'].includes(action)) assert.equal(f.gains[0].gain.value, 0);
  }
});

test('muted and background snapshots advance memory without stale playback on return', async () => {
  for (const method of ['mute', 'visible', 'visibleWithoutFrames']) {
    const f = audioFixture(); await f.audio.unlock(); const s = state(); f.audio.update(s);
    if (method === 'mute') f.audio.setEnabled(false); else f.audio.setVisible(false);
    advance(s); s.hitId++; if (method !== 'visibleWithoutFrames') f.audio.update(s, method === 'mute');
    if (method === 'mute') f.audio.setEnabled(true); else f.audio.setVisible(true);
    f.audio.update(s); assert.equal(f.sources.length, 0, method);
    advance(s); s.hitId++; f.audio.update(s); assert.equal(f.sources.length, 1, method);
  }
});

test('single short crowd reactions use quieter applause and stop at the next serve', async () => {
  const peaks = [];
  for (const exciting of [false, true]) { const f = audioFixture(); await f.audio.unlock(); const s = state(); f.audio.update(s);
    if (exciting) s.lastShot = 'smash'; score(s); f.audio.update(s); f.audio.update(s);
    assert.equal(f.sources.length, 1, 'one human reaction'); const source = f.sources[0];
    assert.ok(source.stops[0] - source.starts[0][0] <= 1.2); peaks.push(Math.max(...f.gains[1].gain.calls.map(c => c[1])));
    s.phase = 'serve'; advance(s); f.audio.update(s); assert.equal(source.disconnected, true); assert.equal(f.sources.length, 1); }
  assert.ok(peaks[0] < peaks[1]);
});

test('failed sample fetch/decode falls back to contact noise without blocking a match', async () => {
  for (const failure of ['fetchFailure', 'decodeFailure']) { const f = audioFixture({ [failure]: true });
    await assert.doesNotReject(() => f.audio.unlock()); const s = state(); f.audio.update(s); advance(s); s.hitId++;
    assert.doesNotThrow(() => f.audio.update(s)); assert.equal(f.sources.length, 1); assert.equal(f.sources[0].buffer.sample, undefined);
    assert.ok(f.sources[0].stops[0] - f.sources[0].starts[0][0] < .2);
    f.audio.sample('foot', { duration: .1, volume: .07 });
    assert.equal(f.sources.length, 1, 'unavailable footsteps stay silent instead of making hiss');
    score(s); f.audio.update(s); assert.equal(f.sources.length, 1, 'missing crowds do not become synthetic wind'); }
});

test('unavailable contexts and denied resumes settle safely without sources', async () => {
  const absent = new ArenaAudio({ AudioContext: null }); await assert.doesNotReject(async () => absent.unlock());
  const f = audioFixture({ resumeFailure: true }); await assert.doesNotReject(() => f.audio.unlock());
  const s = state(); f.audio.update(s); advance(s); s.hitId++; assert.doesNotThrow(() => f.audio.update(s));
  assert.equal(f.sources.length, 0);
});

test('a phone gesture resumes an interrupted context after returning from the background', async () => {
  const f = audioFixture({ initialState: 'interrupted' }); await f.audio.unlock();
  assert.equal(f.contexts[0].state, 'running');
  const s = state(); f.audio.update(s); advance(s); s.hitId++; f.audio.update(s);
  assert.equal(f.sources.length, 1);
  f.contexts[0].state = 'interrupted'; f.audio.setEnabled(false); await f.audio.unlock();
  assert.equal(f.contexts[0].state, 'interrupted', 'muted gestures cannot resume audio');
  f.contexts[0].state = 'closed'; f.audio.enabled = true; await f.audio.unlock();
  assert.equal(f.contexts[0].state, 'closed', 'closed contexts are not resumed');
});

test('voices are bounded and finished sources release all connected event nodes', async () => {
  const f = audioFixture(); await f.audio.unlock(); f.audio.update(state());
  for (let i = 0; i < 40; i++) f.audio.hit('clear'); assert.ok(f.sources.length >= 12);
  assert.ok(f.sources.filter(s => !s.disconnected).length <= 12);
  for (const source of f.sources) source.onended?.();
  assert.ok(f.sources.every(s => s.disconnected)); assert.ok(f.gains.slice(1).every(g => g.disconnected));
});

test('finale voice is fixed-rate once per key and is never queued after mute or background', async()=>{
  const f=audioFixture();await f.audio.unlock();f.audio.update({...state(),phase:'over'});
  f.audio.playFinale('room:1');f.audio.playFinale('room:1');
  assert.equal(f.sources.length,1);assert.equal(f.sources[0].playbackRate.value,1);
  f.audio.setEnabled(false);f.audio.playFinale('room:2');f.audio.setEnabled(true);f.audio.playFinale('room:2');
  assert.equal(f.sources.length,1);
  f.audio.setVisible(false);f.audio.playFinale('room:3');f.audio.update({...state(),phase:'over'});f.audio.playFinale('room:3');
  assert.equal(f.sources.length,1);
  f.audio.playFinale('room:4');assert.equal(f.sources.length,2);
  f.audio.reset();assert.ok(f.sources.every(source=>source.disconnected));
});
