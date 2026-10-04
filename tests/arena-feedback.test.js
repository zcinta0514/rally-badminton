import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../shared/game.js';
import { ArenaFeedbackClock, isExcitingPoint, matchPressure, REACTION_SECONDS } from '../src/arena-feedback.js';
import { describeMatch, describeRole } from '../src/match-settings.js';
import { readArenaPreferences, normalizeArenaPreferences, saveArenaPreferences } from '../src/arena-preferences.js';

const excitingPoint = (changes = {}) => ({ lastShot: 'smash', rally: 2,
  rallyEnd: { kind: 'in', winner: 0, hitSide: 0 }, ...changes });

test('crowd excitement follows successful attacking landings, not the selected shot alone', () => {
  assert.equal(typeof isExcitingPoint, 'function');
  assert.equal(isExcitingPoint(excitingPoint()), true);
  for (const kind of ['net', 'out', 'serviceFault']) {
    assert.equal(isExcitingPoint(excitingPoint({ rallyEnd: { kind, winner: 0, hitSide: 0 } })), false);
  }
  assert.equal(isExcitingPoint(excitingPoint({ rallyEnd: { kind: 'in', winner: 1, hitSide: 0 } })), false);
});

test('a long rally includes the serve and requires a valid in-court winning landing', () => {
  assert.equal(typeof isExcitingPoint, 'function');
  assert.equal(isExcitingPoint(excitingPoint({ lastShot: 'clear', rally: 7 })), false);
  assert.equal(isExcitingPoint(excitingPoint({ lastShot: 'clear', rally: 8 })), true);
  assert.equal(isExcitingPoint(excitingPoint({ lastShot: 'drop', rally: 9 })), true);
  for (const state of [null, {}, excitingPoint({ rallyEnd: null }), excitingPoint({ rallyEnd: { kind: 'in' } }),
    excitingPoint({ rallyEnd: { kind: 'in', winner: 2, hitSide: 2 } })]) {
    assert.equal(isExcitingPoint(state), false);
  }
});

const point = (s, grade) => { s.time += .1; s.pointId++; s.phase = grade === 'match' ? 'over' : grade === 'game' ? 'intermission' : 'point';
  s.rallyEnd = { id: s.pointId, at: s.time, winner: 0, grade }; };
test('all four tiers use one clock that finishes at frozen match time and consumes duplicate events', () => {
  for (const grade of Object.keys(REACTION_SECONDS)) {
    const s = createMatch(), clock = new ArenaFeedbackClock(); clock.step(s, 0); point(s, grade);
    const original = structuredClone(s); assert.equal(clock.step(s, .05).reaction.grade, grade);
    for (let i = 0; i < Math.ceil(REACTION_SECONDS[grade] / .05); i++) clock.step(s, .05);
    assert.equal(clock.step(s, .05).reaction, null); assert.deepEqual(s, original);
  }
});
test('next serve, background, pause, old snapshots and explicit rematch reset clear effects without replay', () => {
  for (const method of ['serve', 'paused', 'countdown', 'hidden', 'disabled', 'old', 'rematch']) {
    const s = createMatch(), clock = new ArenaFeedbackClock(); clock.step(s, 0); point(s, 'highlight'); clock.step(s, .05);
    const saved = structuredClone(s), options = {};
    if (['serve', 'paused', 'countdown'].includes(method)) s.phase = method;
    if (method === 'hidden') options.hidden = true; if (method === 'disabled') options.enabled = false;
    if (method === 'old') s.time = 0; if (method === 'rematch') clock.reset();
    assert.equal(clock.step(s, .05, options).reaction, null);
    assert.equal(clock.step(saved, .05).reaction, null);
  }
});
test('game and match points follow deuce and caps in every scoring target', () => {
  for (const target of [5, 11, 21]) {
    const s = createMatch({ target }); s.score = [target - 1, target - 1]; assert.deepEqual(matchPressure(s), [null, null]);
    s.score[0]++; assert.equal(matchPressure(s)[0], 'match');
    s.score = [target === 5 ? 9 : target === 11 ? 19 : 29, target === 5 ? 9 : target === 11 ? 19 : 29];
    assert.deepEqual(matchPressure(s), ['match', 'match']);
  }
  const s = createMatch({ ruleset: 'standard21' }); s.score = [20, 18]; assert.equal(matchPressure(s)[0], 'game'); s.games[0] = 1; assert.equal(matchPressure(s)[0], 'match');
});
test('local audio preferences clamp invalid values, persist and ignore retired light settings', () => {
  assert.equal('lights' in normalizeArenaPreferences({ lights: 'full', hits: .35 }), false);
  assert.equal(normalizeArenaPreferences({ lights: 'full', hits: .35 }).hits, .35);
  const values = new Map(), store = { getItem: k => values.get(k), setItem: (k,v) => values.set(k,v) };
  saveArenaPreferences({ master: 2, crowd: -1, hits: NaN, lights: 'off' }, store); const p = readArenaPreferences(store);
  assert.equal(p.master, 1); assert.equal(p.crowd, 0); assert.equal(p.hits, 1); assert.equal('lights' in p, false);
  values.set('rally.arena.v1', JSON.stringify({master:.25, lights:'full'}));
  const legacy = readArenaPreferences(store); assert.equal(legacy.master,.25); assert.equal('lights' in legacy,false);
  assert.doesNotThrow(() => saveArenaPreferences(p, { setItem() { throw Error(); } }));
});
test('settings show actual authoritative role, rules, AI and assist without changing state', () => {
  const s = createMatch({ roles: ['power', 'swift'], difficulty: 'hard', ruleset: 'standard21' }), before = structuredClone(s);
  assert.match(describeMatch(s), /力量型.*112/); assert.match(describeMatch(s), /三局两胜.*30分封顶/); assert.match(describeMatch(s), /70ms/);
  assert.match(describeMatch(s, 1, 'online'), /好友对打/); assert.doesNotMatch(describeMatch(s, 1, 'online'), /AI/);
  assert.match(describeRole('swift'), /5.35.*88/); assert.deepEqual(s, before);
});
