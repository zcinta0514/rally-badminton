import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleTactics} from '../scripts/measure-ai-tactics.mjs';
import {simulateMatch} from '../scripts/benchmark-game.js';
import * as game from '../shared/game.js';
import {shotFixture,receiveFixture} from '../scripts/measure-gameplay-pace.js';
import {flightApex} from '../shared/shuttle-flight.js';

test('actual serves mix legal short and long deliveries with distinct difficulty profiles',()=>{
  const ratios=[];
  for(const level of ['easy','medium','hard']){
    const result=sampleTactics(level,{serve:true});
    assert.equal(result.contacts,96);assert.equal(result.legal,96);
    ratios.push(result.counts.drop/result.contacts);
  }
  assert.ok(ratios[0]>.1&&ratios[0]<.35);
  assert.ok(ratios[1]>.35&&ratios[1]<.6);
  assert.ok(ratios[2]>.6&&ratios[2]<.85);
});

test('advanced defenders actually block and lift against smashes and drops according to visible court space',()=>{
  for(const side of [0,1])for(const level of ['medium','hard'])for(const incoming of ['smash','drop']){
    const rear=sampleTactics(level,{side,incoming,opponentDepth:4.8});
    const front=sampleTactics(level,{side,incoming,opponentDepth:1.5});
    assert.ok(rear.legal/rear.contacts>.95,JSON.stringify({side,level,incoming,rear}));
    assert.ok(front.legal/front.contacts>.95);
    assert.ok(rear.counts.drop>rear.contacts*.55);
    assert.ok(front.counts.clear>front.contacts*.55);
    assert.ok(rear.counts.clear>0&&front.counts.drop>0,'keep alternatives rather than another fixed response');
    assert.equal(rear.counts.smash+front.counts.smash,0,'no impossible low counter-smashes');
  }
});

test('hard AI uses all shot families and multiple placements in completed matches, counting contacts once',()=>{
  const counts={clear:0,drop:0,smash:0};let plans=0;
  for(let seed=1;seed<=8;seed++){
    const r=simulateMatch({difficulty:'hard',seed});assert.equal(r.phase,'over');
    assert.equal(Object.values(r.shotCounts).reduce((a,b)=>a+b),r.shots);
    for(const type of Object.keys(counts))counts[type]+=r.shotCounts[type];
    plans=Math.max(plans,r.planCount);
  }
  assert.ok(plans>=8,JSON.stringify({plans,counts}));
  for(const type of Object.keys(counts))assert.ok(counts[type]>10,JSON.stringify(counts));
});

test('charged overhead clears gain pace without turning defensive lifts or serves into flat attacks',()=>{
  const {state}=shotFixture(game);
  const soft=game.getShotTarget(state,0,{shot:'clear',charge:0});
  const firm=game.getShotTarget(state,0,{shot:'clear',charge:.8});
  assert.ok(soft.duration-firm.duration>.15&&soft.duration-firm.duration<.3);
  assert.ok(flightApex({...state.shuttle,vy:firm.vy,verticalDrag:firm.verticalDrag}).y>4.3);
  assert.ok(Math.abs(firm.z)>5.5&&firm.netHeight>3);
  state.shuttle.y=.8;
  const lift=game.getShotTarget(state,0,{shot:'clear',charge:.3});
  assert.ok(lift.duration>firm.duration+.2);
});

test('a deep attacking clear punishes a late retreat from the net while a centered receiver still has a contact window',()=>{
  const chase=(startZ,reaction,side,dt)=>{
    const sign=side===0?1:-1;
    const {state}=receiveFixture(game,{type:'clear',startZ,side});
    const shot=game.getShotTarget(state,1-side,{shot:'clear',charge:.8,aimDepth:.7,aim:.7*sign});
    Object.assign(state.shuttle,{vx:shot.vx,vy:shot.vy,vz:shot.vz});
    let reachable=false;
    for(let i=0;i<Math.ceil(3/dt)&&state.phase==='rally';i++){
      reachable ||= game.getShotAvailability(state,side).canHit;
      const dx=1.6*sign-state.players[side].x,dz=6*sign-state.players[side].z,d=Math.hypot(dx,dz);
      const inputs=[{},{}];inputs[side]=state.time>=reaction?{x:dx/d,z:dz/d}:{};
      game.stepMatch(state,inputs,dt);
    }
    return reachable;
  };
  for(const side of [0,1])for(const dt of [1/30,1/60,1/120]){
    assert.ok(chase(1.3,.2,side,dt),'early retreat from net remains possible');
    assert.equal(chase(1.3,.8,side,dt),false,'late retreat from net loses the deep corner');
    assert.ok(chase(3.3,.8,side,dt),'better initial positioning retains a return');
  }
});
