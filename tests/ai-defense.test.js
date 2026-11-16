import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,aiInput,getDifficultyProfile,stepMatch} from '../shared/game.js';
import {measureDefense} from '../scripts/measure-ai-defense.mjs';

test('fixed smash grid separates basic AI and reliable defenders without making every ball reachable',()=>{
 const result=measureDefense();
 assert.ok(result.easy.rate>.15&&result.easy.rate<.35);
 for(const level of ['medium','hard']){
  assert.ok(result[level].rate>.7&&result[level].rate<.9,JSON.stringify(result));
  assert.ok(result[level].returns/result[level].hits>.95);
 }
});

test('hard defensive preparation respects reaction delay and cannot hit a distant ball',()=>{
 const s=createMatch();s.phase='rally';s.lastShot='smash';s.hitId=1;
 Object.assign(s.shuttle,{x:0,y:3.2,z:3.8,vx:0,vy:-8,vz:-30,drag:.035,lastHit:0,active:true});
 assert.equal(aiInput(s,1,'hard').shot,null);
 s.time=getDifficultyProfile('hard').reaction-.001;
 assert.equal(aiInput(s,1,'hard').shot,null);
 s.time+=.002;
 assert.equal(aiInput(s,1,'hard').shot,null);
 assert.equal(s._ai[1].shot,'clear');
 stepMatch(s,[{},aiInput(s,1,'hard')],1/120);
 assert.equal(s.hitId,1);
});

test('three tiers finish matches and hard produces longer contests than basic AI',()=>{
 const counts={};
 for(const level of ['easy','medium','hard']){
  let points=0,rallies=0;
  for(let seed=1;seed<=4;seed++){
   const s=createMatch({target:11,seed:Math.imul(seed,2654435761)>>>0});let previous=0;
   for(let i=0;i<90000&&s.phase!=='over';i++){
    stepMatch(s,[aiInput(s,0,'hard'),aiInput(s,1,level)],1/60);
    if(s.pointId!==previous){points++;rallies+=s.rally;previous=s.pointId;}
   }
   assert.equal(s.phase,'over');
  }
  counts[level]=rallies/points;
 }
 assert.ok(counts.hard>counts.easy,JSON.stringify(counts));
});
