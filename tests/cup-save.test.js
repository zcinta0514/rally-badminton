import test from 'node:test';
import assert from 'node:assert/strict';
import {createCup, getCupOpponent, advanceCup} from '../src/cup-draw.js';
import {createMatch, stepMatch} from '../shared/game.js';
import {readCupSave, writeCupSave} from '../src/cup-save.js';

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
