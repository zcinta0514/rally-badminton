import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../shared/game.js';
import { practiceInputs, localTeam, lineupNames } from '../src/match-lineup.js';
import { describeMatch } from '../src/match-settings.js';

test('settings summaries support every doubles player slot',()=>{
 const state=createMatch({format:'doubles'});
 for(const slot of [0,1,2,3]) assert.match(describeMatch(state,slot,'online'),/双打 2V2.*队友/);
 const ai=createMatch({format:'doubles',teammateDifficulty:'hard',difficulty:'easy'});assert.match(describeMatch(ai,0,'ai'),/队友难度：高手；对手难度：入门/);
});

test('all four local viewpoints resolve scores by team and identity by slot', () => {
  const state=createMatch({format:'doubles'});
  const players=['甲','乙','丙','丁'].map(name=>({name}));
  assert.deepEqual([0,1,2,3].map(slot=>localTeam(state,slot)),[0,1,0,1]);
  assert.deepEqual(lineupNames(state,2,players),{self:'甲 / 丙',other:'乙 / 丁'});
  assert.deepEqual(lineupNames(state,3,players),{self:'乙 / 丁',other:'甲 / 丙'});
});
test('practice sends one fixed human and three independent AI inputs with human-only intent', () => {
  const state=createMatch({format:'doubles'}), human={x:.5,prepare:'clear'}, calls=[];
  const inputs=practiceInputs(state,human,{difficulty:'hard',teammateDifficulty:'easy'},(s,slot,difficulty,intent)=>{
    calls.push({slot,difficulty,intent}); return {slot};
  });
  assert.equal(inputs[0],human); assert.equal(inputs.length,4);
  assert.deepEqual(calls.map(c=>[c.slot,c.difficulty]),[[1,'hard'],[2,'easy'],[3,'hard']]);
  for(const call of calls){assert.equal(call.intent[0],human);assert.equal(call.intent.filter(Boolean).length,1);}
});
test('single practice still generates only one opponent and preserves hell difficulty',()=>{
  const state=createMatch({challenge:'hell'}), calls=[];
  assert.equal(practiceInputs(state,{}, {difficulty:'easy'},(_s,slot,level)=>{calls.push([slot,level]);return {};}).length,2);
  assert.deepEqual(calls,[[1,'hard']]);
});
