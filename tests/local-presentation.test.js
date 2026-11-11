import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch} from '../shared/game.js';
import {captureMotion,presentLocal} from '../src/local-presentation.js';
test('120/144Hz intermediate frames move without changing 60Hz authoritative state',()=>{
  const state=createMatch();state.phase='rally';const before=captureMotion(state);
  state.time+=1/60;state.players[0].x+=1;state.shuttle.y+=2;
  const authoritative=structuredClone(state);
  for(const t of [0,.25,.5,.75,1]){
    const shown=presentLocal(state,before,t);
    assert.equal(shown.players[0].x,before.players[0].x+t);
    assert.equal(shown.shuttle.y,before.shuttle.y+2*t);
  }
  assert.deepEqual(state,authoritative);
});
test('contacts, scores, pauses and resets snap to authority',()=>{
  for(const key of ['hitId','pointId','phase','time']){
    const state=createMatch();state.phase='rally';const before=captureMotion(state);state.time+=1/60;
    if(key==='phase')state.phase='paused';else if(key==='time')state.time=0;else state[key]++;
    assert.equal(presentLocal(state,before,.5),state);
  }
});
