import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, stepMatch, aiInput, ROLES, pauseMatch, resumeMatch, predictLanding } from '../shared/game.js';
import { HELL, phantomPositions, hellStatus } from '../shared/hell-mode.js';
import { matchPressure } from '../src/arena-feedback.js';
import { describeMatch } from '../src/match-settings.js';

const dt = 1 / 120;
function point(s, winner) {
  s.phase = 'rally';
  Object.assign(s.shuttle, { x: 0, y: .001, z: winner === 0 ? -3 : 3, vx: 0, vy: -1, vz: 0, active: true, lastHit: winner });
  stepMatch(s, [{}, {}], dt);
}
function tick(s, input = [{}, {}], seconds = .2) {
  for (let t=0;t<seconds-1e-8;t+=dt) stepMatch(s,input,dt);
}

test('hell starts at zero and wins at 2:4 with no deuce; opponent needs 5', () => {
  const human=createMatch({challenge:'hell',ruleset:'standard21'});
  assert.equal(human.ruleset,'quick');assert.deepEqual(human.score,[0,0]);
  human.score=[1,4];point(human,0);
  assert.equal(human.phase,'over');assert.equal(human.winner,0);assert.equal(human.endReason,'scored');
  assert.deepEqual(human.score,[2,4]);assert.equal(human.rallyEnd.grade,'match');
  const boss=createMatch({challenge:'hell'});boss.score=[1,4];point(boss,1);
  assert.equal(boss.phase,'over');assert.equal(boss.winner,1);assert.deepEqual(boss.score,[1,5]);
  const early=createMatch({challenge:'hell'});early.score=[0,1];point(early,1);
  assert.equal(early.phase,'point');assert.equal(early.winner,null);assert.equal(early.server,1);
});

test('normal scoring, court rules and player lineup stay isolated', () => {
  const normal=createMatch();normal.score=[1,4];point(normal,0);
  assert.equal(normal.phase,'point');assert.equal(normal.challenge,undefined);
  assert.equal(phantomPositions(normal).length,0);assert.equal(hellStatus(normal),null);
  assert.deepEqual(matchPressure(normal),[null,'match']);
  const hell=createMatch({challenge:'hell',roles:['swift','balanced']});
  hell.score=[1,4];assert.deepEqual(matchPressure(hell),['match','match']);
  assert.match(describeMatch(hell),/先得2分/);assert.equal(hell.players[0].role,'swift');
});

test('boss stays at full stamina, player consumes stamina and refills once at next serve', () => {
  const s=createMatch({challenge:'hell'});s.phase='rally';s.shuttle.active=false;
  tick(s,[{x:1},{x:1}],1);
  assert.ok(s.players[0].stamina<100);assert.equal(s.players[1].stamina,100);
  assert.equal(s.players[1].staminaStatus,'infinite');
  point(s,1);s.players[0].stamina=10;s.challenge.rescueUses=1;
  tick(s,[{},{}],1.5);
  assert.equal(s.phase,'serve');assert.equal(s.players[0].stamina,100);
  assert.equal(s.challenge.rescueUses,0);assert.equal(s.challenge.active,null);
});

test('a real boss return produces three visual fakes without mutating the authoritative ball', () => {
  const s=createMatch({challenge:'hell'});s.phase='rally';s.service.active=false;
  Object.assign(s.players[1],{x:0,z:-3.8});
  Object.assign(s.shuttle,{x:0,y:1.5,z:-3.8,vx:0,vy:-1,vz:0,active:true,lastHit:0});
  tick(s,[{},{shot:'clear',aim:.6}],.13);
  assert.equal(s.lastShotInfo.skill,'phantom');assert.equal(s.challenge.counts.phantom,1);
  const snapshot=JSON.stringify(s),landing=predictLanding(s),ghosts=phantomPositions(s);
  assert.equal(ghosts.length,3);assert.ok(ghosts.every(p=>p.opacity>0&&p.opacity<1));
  assert.equal(JSON.stringify(s),snapshot);assert.deepEqual(predictLanding(s),landing);
  const fade=s.challenge.active.fadeAt;
  tick(s,[{},{}],fade);
  assert.equal(phantomPositions(s).length,0);assert.equal(s.shuttle.lastHit,1);
});

test('pause freezes live challenge timing and resumes without spending another skill', () => {
  const s=createMatch({challenge:'hell'});s.phase='rally';
  s.challenge.warning={at:0,hitId:0,aim:.8,aimDepth:.35};
  assert.equal(pauseMatch(s,0),true);const before=JSON.stringify(s.challenge),time=s.time;
  stepMatch(s,[{},{}],2);assert.equal(s.time,time);assert.equal(JSON.stringify(s.challenge),before);
  resumeMatch(s);stepMatch(s,[{},{}],2);assert.equal(s.phase,'rally');assert.equal(s.time,time);
});

test('rescue moves continuously to a reachable legal contact and leaves a recovery opening', () => {
  const s=createMatch({challenge:'hell'});s.phase='rally';s.service.active=false;
  Object.assign(s.players[1],{x:-1.8,z:-3.8});
  Object.assign(s.shuttle,{x:1,y:1.05,z:-3.8,vx:0,vy:-1,vz:0,active:true,lastHit:0});
  let diving=false,maxStep=0;
  for(let frame=0;frame<120&&s.hitId===0;frame++){
    const input=aiInput(s,1,'hard'),before={x:s.players[1].x,z:s.players[1].z};
    diving ||= !!s.challenge.rescue;
    stepMatch(s,[{},input],dt);
    maxStep=Math.max(maxStep,Math.hypot(s.players[1].x-before.x,s.players[1].z-before.z));
  }
  assert.equal(diving,true);assert.equal(s.lastShotInfo.skill,'rescue');
  assert.equal(s.challenge.counts.rescue,1);assert.equal(s.challenge.rescueUses,1);
  assert.ok(maxStep<=HELL.diveSpeed*dt+1e-6,`continuous displacement ${maxStep}`);
  assert.ok(Math.abs(s.lastShotInfo.aimX)<=2.29);assert.ok(predictLanding(s).time>=1.2);
  const dive=s.challenge.rescue;
  tick(s,[{},{}],Math.max(0,dive.at+.45-s.time));
  const position={x:s.players[1].x,z:s.players[1].z};
  tick(s,[{},{x:1,z:1,shot:'smash'}],.05);
  assert.equal(s.players[1].x,position.x);assert.equal(s.players[1].z,position.z);
  assert.ok(s.players[1].cooldown>0);
});

test('rescue cannot catch an out ball or reach an arbitrarily distant ball', () => {
  for(const x of [4, -2.3]){
    const s=createMatch({challenge:'hell'});s.phase='rally';s.service.active=false;
    Object.assign(s.players[1],{x:2.3,z:-1});
    Object.assign(s.shuttle,{x,y:1,z:-5.5,vx:0,vy:-1,vz:0,active:true,lastHit:0});
    for(let i=0;i<60&&s.phase==='rally';i++)stepMatch(s,[{},aiInput(s,1,'hard')],dt);
    assert.equal(s.challenge.counts.rescue,0);
  }
});

test('real complete rallies exercise all three skills, telegraph cannon and allow consecutive active attacks', () => {
  const counts={phantom:0,cannon:0,rescue:0};let consecutive=0,bossReturns=0;
  for(let seed=1;seed<=200;seed++){
    const s=createMatch({challenge:'hell',seed});let previous=0,warning=null,lastAttackPoint=-1,lastAttackHit=-99;
    for(let frame=0;frame<60*150&&s.phase!=='over';frame++){
      const inputs=[aiInput(s,0,'medium'),aiInput(s,1,'hard')];
      if(s.challenge.warning)warning={...s.challenge.warning};
      stepMatch(s,inputs,1/60);
      if(s.hitId!==previous){
        previous=s.hitId;const shot=s.lastShotInfo;
        if(shot.side===1&&!shot.serving)bossReturns++;
        assert.ok(Number.isInteger(s.challenge.rescueUses));
        if(shot.skill){
          counts[shot.skill]++;
          if(shot.skill==='cannon'){
            assert.ok(warning);assert.ok(shot.at-warning.at>=HELL.chargeTime-1e-7);
            assert.equal(shot.aimX,warning.aim*(2.59-.3));
            assert.equal(predictLanding(s).event,'landing');
          }
          if(['phantom','cannon'].includes(shot.skill)){
            if(lastAttackPoint===s.pointId&&s.hitId-lastAttackHit===2)consecutive++;
            lastAttackPoint=s.pointId;lastAttackHit=s.hitId;
          }
        }
      }
    }
    assert.equal(s.phase,'over');assert.ok(s.score[0]===2||s.score[1]===5);
  }
  for(const skill in counts)assert.ok(counts[skill]>0,`${skill} must occur in ordinary complete matches`);
  assert.ok(consecutive>0,'active skills can happen on adjacent boss returns');
  assert.ok(Object.values(counts).reduce((a,b)=>a+b,0)/bossReturns===1,'every non-serve boss return uses a skill');
});

test('spent rescue state clears after recovery and cannot immobilize the next cannon', () => {
  const s=createMatch({challenge:'hell'});s.phase='rally';s.shuttle.active=false;
  const root={x:s.players[1].x,z:s.players[1].z};
  s.challenge.rescue={hit:true,at:-.69,endsAt:.01,from:root,to:root,slideTo:root};
  s.challenge.rescueUses=1;s.challenge.recoverUntil=.01;
  tick(s,[{},{}],.03);assert.equal(s.challenge.rescue,null);assert.equal(s.challenge.rescueUses,1);
  s.challenge.recoverUntil=s.time+1;const before=s.players[1].x;
  tick(s,[{},{x:1}],.2);assert.ok(s.players[1].x>before);
  s.challenge.active={kind:'cannon',hitId:s.hitId};s.shuttle.lastHit=1;
  assert.equal(hellStatus(s).key,'cannon','the incoming cannon takes priority over recovery advice');
});


test('spaced emergency rescues remain available after repeated use and pause preserves the use count', () => {
  const s=createMatch({challenge:'hell'});s.phase='rally';s.service.active=false;
  for(let attempt=0;attempt<6;attempt++){
    s.shuttle.active=false;tick(s,[{},{}],HELL.diveInterval);
    s.challenge.active=null;s.hitId++;
    Object.assign(s.players[1],{x:-1.8,z:-3.8,cooldown:0,pendingShot:null});
    Object.assign(s.shuttle,{x:1,y:1.05,z:-3.8,vx:0,vy:-1,vz:0,active:true,lastHit:0});
    const before=s.hitId;
    for(let frame=0;frame<100&&s.hitId===before&&s.phase==='rally';frame++)stepMatch(s,[{},aiInput(s,1,'hard')],dt);
    assert.equal(s.challenge.rescueUses,attempt+1);
    assert.equal(s.challenge.counts.rescue,attempt+1);
    if(attempt===0){
      pauseMatch(s,0);stepMatch(s,[{},{}],1);assert.equal(s.challenge.rescueUses,1);
      resumeMatch(s);stepMatch(s,[{},{}],2);
    }
  }
});


test('successive high incoming balls can trigger cannon without a phantom in between', () => {
  const s=createMatch({challenge:'hell'});s.phase='rally';s.service.active=false;
  for(let attempt=0;attempt<3;attempt++){
    s.shuttle.active=false;tick(s,[{},{}],.7);
    s.challenge.active=null;s.hitId++;
    Object.assign(s.players[1],{x:0,z:-3.8,cooldown:0,pendingShot:null});
    Object.assign(s.shuttle,{x:0,y:3.5,z:-3.8,vx:0,vy:0,vz:0,active:true,lastHit:0});
    const before=s.hitId;let warned=false;
    for(let frame=0;frame<120&&s.hitId===before&&s.phase==='rally';frame++){
      const input=aiInput(s,1,'hard');warned ||= !!s.challenge.warning;
      stepMatch(s,[{},input],dt);
    }
    assert.equal(warned,true);assert.equal(s.lastShotInfo.skill,'cannon');
    assert.equal(s.challenge.counts.cannon,attempt+1);
  }
});
