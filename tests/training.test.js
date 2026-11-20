import test from 'node:test';
import assert from 'node:assert/strict';
import { createTraining, setTrainingOptions, stepTraining } from '../shared/training.js';
import { sampleAthletePose } from '../src/athlete.js';

const dt=1/60;
function until(state, predicate, limit=500) {
  for (let i=0;i<limit&&!predicate();i++) stepTraining(state,{},dt);
  assert.ok(predicate(),'timed out waiting for the next training event');
}
function strike(state,shot,options={}) {
  until(state,()=>state.training.canHit);
  stepTraining(state,{shot,charge:.25,...options},dt);
  until(state,()=>state.training.stage==='return');
  const p=state.players[0], time=p.action.contactAt;
  const contact=sampleAthletePose(p,0,state.shuttle,time);
  const follow=sampleAthletePose(p,0,state.shuttle,time+.19);
  const outgoing={...state.shuttle};
  until(state,()=>state.training.stage==='rest');
  return { result:state.training.lastResult, contact, follow, outgoing };
}
test('the same net delivery can be brushed across or lifted deep at identical contact',()=>{
  const cross=createTraining({drill:'cross'}), lift=createTraining({drill:'lift'});
  until(cross,()=>cross.training.canHit);
  until(lift,()=>lift.training.canHit);
  assert.deepEqual(cross.shuttle,lift.shuttle);
  const a=strike(cross,'drop'), b=strike(lift,'clear');
  assert.deepEqual(a.result.contact,b.result.contact);
  assert.equal(a.result.outcome,'hit'); assert.equal(b.result.outcome,'hit');
  assert.ok(a.result.x<0 && a.result.z>-1.8 && a.result.apex<1.85);
  assert.ok(b.result.x>0 && b.result.z<-5.25 && b.result.apex>4);
  for(const [play,state] of [[a,cross],[b,lift]]) {
    const p=state.players[0], target=play.result.contact, head=play.contact.racketHead;
    assert.ok(Math.hypot(head.x+p.x-target.x,head.y-target.y,head.z+p.z-target.z)<1e-7);
  }
  assert.ok(b.follow.racketHead.y-a.follow.racketHead.y>.48);
  assert.ok(a.follow.racketHead.x<b.follow.racketHead.x-.21);
  assert.ok(Math.abs(a.contact.joints.rightAnkle.z-b.contact.joints.rightAnkle.z)>.01);
  const alternate=strike(createTraining({drill:'cross'}),'clear');
  assert.equal(alternate.result.technique,'lift');
  assert.equal(alternate.result.outcome,'wrongStroke');
});

test('fast descending feeds are blocked and overhead feeds are struck down, at every strength',()=>{
  for(const power of [.8,1,1.2])for(const drill of ['defense','smash']) {
    const state=createTraining({drill,power,line:'left'});
    until(state,()=>state.training.canHit);
    assert.ok(state.shuttle.vy<0 && state.shuttle.z>0);
    const play=strike(state,drill==='smash'?'smash':'drop');
    assert.equal(play.result.outcome,'hit');
    assert.ok(play.result.x<0);
    if (drill==='smash') assert.ok(play.result.contact.y>=2 && play.outgoing.vy<0);
    else assert.ok(play.result.contact.y<1.6 && play.outgoing.vy>0);
  }
});

test('serves wait indefinitely, choose a legal diagonal and respond to player charge',()=>{
  const a=createTraining({drill:'serve',targetSide:'right'});
  for(let i=0;i<800;i++)stepTraining(a,{prepare:'clear',charge:1},dt);
  assert.equal(a.training.feedCount,0); assert.equal(a.training.stage,'ready');
  const short=strike(a,'clear',{charge:0});
  assert.equal(short.result.outcome,'offTarget'); assert.ok(short.result.z>-2.6);
  until(a,()=>a.training.stage==='ready');
  setTrainingOptions(a,{targetSide:'left'});
  assert.ok(a.players[0].x>0 && a.training.target.x<0);
  const long=strike(a,'clear',{charge:1});
  assert.equal(long.result.outcome,'hit');
  assert.ok(Math.abs(short.result.z-long.result.z)>3.5);
  assert.equal(a.training.attempts,2); assert.equal(a.training.hits,1);
  // A hidden feed-line preference from another drill must not switch the service court.
  const sameCourt=createTraining({drill:'serve',line:'alternate'});
  const box=sameCourt.training.target;
  strike(sameCourt,'clear',{charge:1});
  until(sameCourt,()=>sameCourt.training.stage==='ready');
  assert.deepEqual(sameCourt.training.target,box);
});

test('actual landing, wrong shots and unreachable or untouched balls cannot score target hits',()=>{
  const s=createTraining({drill:'lift',targetSide:'left'});
  assert.equal(strike(s,'clear').result.outcome,'offTarget');
  until(s,()=>s.training.stage==='feed');
  assert.equal(strike(s,'clear',{aim:-.72}).result.outcome,'hit');
  until(s,()=>s.training.stage==='feed');
  s.players[0].x=-2.35;
  while(s.training.stage==='feed')stepTraining(s,{shot:'clear'},dt);
  assert.equal(s.training.lastResult.outcome,'miss');
  assert.equal(s.training.hits,1);assert.equal(s.training.attempts,3);
  assert.deepEqual(s.score,[0,0]);
});

test('endless feeds alternate lanes and respect interval and feed power',()=>{
  const s=createTraining({line:'alternate',interval:.8,power:1.2});
  for(let i=0;i<12;i++) {
    until(s,()=>s.training.stage==='feed');
    assert.equal(Math.sign(s.training.target.x),i%2?1:-1);
    until(s,()=>s.training.stage==='rest');
    const at=s.time;
    until(s,()=>s.training.stage==='feed');
    assert.ok(Math.abs(s.time-at-.8)<dt*2+.00001);
  }
  assert.equal(s.training.attempts,12);
  assert.equal(s.training.hits,0);
  const light=createTraining({power:.8}),heavy=createTraining({power:1.2});
  until(light,()=>light.training.stage==='feed'); until(heavy,()=>heavy.training.stage==='feed');
  assert.ok(heavy.shuttle.vz>light.shuttle.vz*1.4);
});

test('net free practice scores actual stroke choice on consecutive identical deliveries',()=>{
  const s=createTraining({drill:'netFree',interval:.65});
  assert.deepEqual(s.training.targets.map(t=>t.technique),['cross','lift']);
  assert.ok(s.training.targets[0].z>s.training.targets[1].z+4);
  until(s,()=>s.training.stage==='feed');
  const first={...s.shuttle};
  const cross=strike(s,'drop');
  assert.equal(cross.result.outcome,'hit');
  assert.equal(s.training.target.technique,'cross');
  until(s,()=>s.training.stage==='ready');
  until(s,()=>s.players[1].action?.stage==='windup');
  assert.ok(s.training.nextAt-s.time>.10);
  until(s,()=>s.training.stage==='feed');
  assert.deepEqual(s.shuttle,first);
  const lift=strike(s,'clear');
  assert.equal(lift.result.outcome,'hit');
  assert.equal(s.training.target.technique,'lift');
  assert.deepEqual(cross.result.contact,lift.result.contact);
  assert.equal(s.training.attempts,2);
  assert.equal(s.training.hits,2);
});
