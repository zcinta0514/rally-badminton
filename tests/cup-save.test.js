import test from 'node:test';
import assert from 'node:assert/strict';
import {createCup, getCupOpponent, advanceCup} from '../src/cup-draw.js';
import {createMatch, stepMatch} from '../shared/game.js';
import {readCupSave, writeCupSave, CUP_STORAGE_KEY} from '../src/cup-save.js';

test('cup format survives reload and advancement; old draws use five points', () => {
  const data = new Map();
  const storage = {getItem: key => data.get(key), setItem: (key, value) => data.set(key, value)};
  for (const target of [5, 15, 21]) {
    data.clear();
    const draw = createCup('bay', '你', 31, target);
    const opponent = getCupOpponent(draw);
    const match = createMatch({cupOpponent: opponent, target});
    assert.equal(match.target, target);
    assert.equal(match.ruleset, 'quick');
    writeCupSave(storage, null, draw, match);
    const restored = readCupSave(storage);
    assert.equal(restored.match.target, target);
    assert.equal(advanceCup(restored.draw, true).target, target);
  }
  const legacy = createCup('bay', '你', 42);
  delete legacy.target;
  data.set(CUP_STORAGE_KEY, JSON.stringify({revision: 'old', draw: legacy, match: null}));
  assert.deepEqual(readCupSave(storage).draw, {...legacy, target: 5});
  for (const target of [10, 11, 22, null, '15']) {
    assert.throws(() => createCup('bay', '你', 42, target), RangeError);
    data.set(CUP_STORAGE_KEY, JSON.stringify({draw: {...legacy, target}}));
    assert.equal(readCupSave(storage), null);
  }
});

test('cup checkpoints restore a playable match and a stale window cannot undo advancement or withdrawal', () => {
  const data=new Map();
  const storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  const draw=createCup('bay','你',31);
  const rival=getCupOpponent(draw);
  const match=createMatch({humanSlots:[0],roles:['balanced',rival.role],cupOpponent:rival,difficulty:rival.difficulty});
  match.score=[2,1];
  const start=writeCupSave(storage,null,draw,match);
  const restored=readCupSave(storage);
  assert.deepEqual(restored.match.score,[2,1]);
  stepMatch(restored.match,[{},{}],1/60);
  const next=writeCupSave(storage,restored,advanceCup(draw,true),null);
  assert.throws(()=>writeCupSave(storage,start,draw,match),/另一窗口/);
  assert.equal(readCupSave(storage).draw.roundIndex,1);
  writeCupSave(storage,next,null,null);
  assert.throws(()=>writeCupSave(storage,next,draw,match),/另一窗口/);
  assert.equal(readCupSave(storage),null);
});
