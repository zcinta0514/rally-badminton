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

test('expert learns from replies across points, commits before the opponent hits, and can be wrong-footed', () => {
  const {state} = receiveFixture(game, {type:'clear', startZ:3.25});
  const contact = (side, type, x, z) => {
    state.hitId++;
    state.lastShot = type;
    state.shuttle.lastHit = side;
    state.lastShotInfo = {hitId:state.hitId, playerSlot:side, side, type, x, z, serving:false};
    return game.aiInput(state, 0, 'hard');
  };
  const setup = () => contact(0, 'drop', 1.8, -1);
  assert.equal(setup().x, 0);
  for (let point = 0; point < 6; point++) {
    contact(1, 'clear', 2, 4.5);
    for (let frame=0; frame<10; frame++) game.aiInput(state, 0, 'hard');
    assert.equal(state._scouting[0].lanes.dropRight.length, point + 1);
    state.pointId++;
    assert.ok(setup().x > 0);
  }
  // Follow the learned recovery step before the opponent switches lines.
  const before = state.players[0].x;
  game.stepMatch(state, [game.aiInput(state, 0, 'hard'), {}], .04);
  assert.ok(state.players[0].x > before);
  assert.ok(Math.abs(-2 - state.players[0].x) > Math.abs(-2 - before));
  for (let i=0; i<6; i++) {
    contact(1, 'clear', -2, 4.5);
    setup();
  }
  assert.ok(game.aiInput(state, 0, 'hard').x < 0);
  assert.equal(game.createMatch()._scouting, undefined);
});

test('beginner offers midcourt lifts and intermediate reads both the rear and front court', () => {
  let feeds=0, deepDrops=0, frontDrops=0;
  for (let seed=1; seed<=96; seed++) {
    for (const [level, depth] of [['easy',3], ['medium',5], ['medium',1.6]]) {
      const {state}=receiveFixture(game,{type:'clear'});
      state.players[1].z=-depth;
      state._rng=Math.imul(seed,2654435761)>>>0;
      game.aiInput(state,0,level);
      const plan=state._ai[0];
      if (level==='easy' && plan.shot==='clear' && plan.aimDepth<-.55 && Math.abs(plan.aim)<.15) feeds++;
      if (level==='medium' && plan.shot==='drop') {
        if (depth===5) deepDrops++;
        else frontDrops++;
      }
    }
  }
  assert.ok(feeds>=24 && feeds<=42, String(feeds));
  assert.ok(deepDrops>frontDrops+28, JSON.stringify({deepDrops,frontDrops}));
});

test('late reads of the receiver punish repeated net camping on lifts in hard and hell singles', () => {
  for (const hell of [false, true]) {
    const sample = (habit, rush) => {
      let deep = 0;
      for (let seed = 1; seed <= 64; seed++) {
        const {state} = receiveFixture(game, {type:'clear', side:1, startZ:4.8});
        if (hell) state.challenge = game.createMatch({challenge:'hell'}).challenge;
        state._rng = Math.imul(seed, 2654435761) >>> 0;
        state._netRush = [0, habit];
        game.aiInput(state, 1, 'hard');
        state.players[0].z = rush ? 1.15 : 4.5;
        for (let frame=0; frame<240 && state.phase==='rally' && !state.lastShotInfo; frame++) {
          const input = game.aiInput(state,1,'hard');
          game.stepMatch(state,[{},input],1/120);
        }
        assert.equal(state._netRush[1],Math.min(3,Math.max(0,habit+(rush?1:-1))));
        if (state._ai[1]?.playDeep) {
          const hit = state.lastShotInfo;
          assert.equal(hit?.type,'clear');
          assert.ok(Math.abs(hit.z)>5.5);
          deep++;
        }
      }
      return deep;
    };
    assert.ok(sample(3,true) > sample(0,true)+10);
    assert.equal(sample(3,false),0);
  }
});

test('only easy and medium AI telegraph their planned ordinary smashes before contact', () => {
  for (const level of ['easy','medium','hard']) {
    let smashes = 0;
    for (let seed=1; seed<=160 && smashes<3; seed++) {
      const {state}=receiveFixture(game,{type:'clear',side:1,startZ:4.8});
      state._rng=Math.imul(seed,2654435761)>>>0;
      let warned=false;
      for(let frame=0;frame<240 && state.phase==='rally' && !state.lastShotInfo;frame++) {
        const input=game.aiInput(state,1,level);
        warned ||= state.smashWarning?.hitId===state.hitId;
        game.stepMatch(state,[{},input],1/120);
      }
      if(state.lastShotInfo?.type==='smash'){
        smashes++;
        assert.equal(warned,level!=='hard');
      }
    }
    assert.ok(smashes>0,level);
  }
});

function rushAfterHighServe(hell, habit){
 const counts={high:0,flat:0,drop:0,smash:0,miss:0};
 for(let i=1;i<=96;i++){
  const s=game.createMatch({challenge:hell?'hell':null,seed:Math.imul(i,2654435761)>>>0});
  s._netRush=[0,habit];
  for(let f=0;f<500 && s.hitId<2 && !['point','over'].includes(s.phase);f++){
   const human=s.phase==='serve'?{shot:'clear',charge:.55}: {z:-1,shot:'drop'};
   game.stepMatch(s,[human,game.aiInput(s,1,'hard')],1/120);
  }
  const h=s.lastShotInfo;
  counts[h?.playerSlot!==1?'miss':h.type==='clear'?(h.charge>.5?'flat':'high'):h.type]++;
 }
 return counts;
}

test('both expert opponents vary the first high serve return and learn after one rush', () => {
  for (const hell of [false, true]) {
    const first = rushAfterHighServe(hell, 0);
    const learned = rushAfterHighServe(hell, 1);
    for (const returns of [first, learned]) {
      assert.equal(returns.miss, 0);
      assert.ok(returns.high > 15 && returns.flat > 15 && returns.drop > 0);
    }
    assert.ok(first.smash < 20 && learned.smash < first.smash);
    assert.ok(learned.high + learned.flat > first.high + first.flat);
  }
});
