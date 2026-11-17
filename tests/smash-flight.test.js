import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch, getShotTarget, stepMatch, predictLanding, ROLES} from '../shared/game.js';
import {sampleShuttleFlight, SHUTTLE_FLIGHT, timeToShuttleZ} from '../shared/shuttle-flight.js';

test('charge continuously increases smash speed while light smashes remain downward',()=>{
 for(const role of Object.keys(ROLES)) for(const side of [0,1]) {
  const s=createMatch({roles:[role,role]});s.phase='rally';const sign=side?-1:1;
  Object.assign(s.players[side],{x:0,z:3.8*sign});
  Object.assign(s.shuttle,{x:0,y:3.2,z:3.8*sign,vy:0,lastHit:1-side,active:true});
  const shots=[0,.25,.5,.75,1].map(charge=>getShotTarget(s,side,{shot:'smash',charge}));
  for(let i=0;i<shots.length;i++) {
   assert.ok(shots[i].vy<0&&shots[i].smashViable);
   if(i) assert.ok(shots[i].duration<shots[i-1].duration);
  }
  assert.ok(shots[4].duration<shots[0].duration*.82);
  assert.ok(Math.hypot(shots[4].vx,shots[4].vz)>Math.hypot(shots[0].vx,shots[0].vz)*1.25);
 }
});

test('extreme net aiming produces the predicted physical net fault, without random misses',()=>{
 for(const side of [0,1]) {
  const s=createMatch();s.phase='rally';s.service=null;const sign=side?-1:1;
  Object.assign(s.players[side],{x:0,z:5*sign});
  Object.assign(s.shuttle,{x:0,y:3.2,z:5*sign,vy:0,lastHit:1-side,active:true});
  const request={shot:'smash',charge:1,aimDepth:-1};
  assert.equal(getShotTarget(s,side,request).quality.reasonCode,'net-risk');
  const inputs=[{},{}];inputs[side]=request;stepMatch(s,inputs,1/120);
  for(let i=0;i<90&&s.phase==='rally';i++)stepMatch(s,[{},{}],1/120);
  assert.equal(s.phase,'point');assert.equal(s.score[1-side],1);
  assert.equal(s.rallyEnd.kind,'net');
 }
});

test('overhead smashes stay fast, downward and close to their straight chord on either team', () => {
  for (const format of ['singles', 'doubles']) for (const side of format === 'singles' ? [0,1] : [0,1,2,3])
    for (const role of Object.keys(ROLES)) for (const charge of [0,.5,1]) {
      const s=createMatch({format}), sign=side%2 ? -1 : 1;
      s.phase='rally'; Object.assign(s.players[side],{x:0,z:sign*3.8,role});
      Object.assign(s.shuttle,{x:0,y:3.2,z:sign*3.8,vy:0,lastHit:1-side%2,active:true});
      const t=getShotTarget(s,side,{shot:'smash',charge});
      const launch={...s.shuttle,...t,y:s.shuttle.y,x:0,z:s.shuttle.z};
      assert.ok(t.duration<.59); assert.ok(t.vy< -2.5); assert.ok(t.smashViable);
      let deviation=0;
      for(let i=0;i<=100;i++) {
        const p=sampleShuttleFlight(launch,t.duration*i/100);
        const fraction=(p.z-launch.z)/(t.z-launch.z);
        deviation=Math.max(deviation,Math.abs(p.y-launch.y*(1-fraction)));
        assert.ok(p.vy<0);
      }
      assert.ok(deviation<.48,`curve ${deviation}`);
      const end=sampleShuttleFlight(launch,t.duration);
      assert.ok(Math.abs(end.z-t.z)<1e-8 && Math.abs(end.y)<1e-8);
      let sliced=launch;
      for(let i=0;i<100;i++) sliced=sampleShuttleFlight(sliced,t.duration/100);
      assert.ok(Math.abs(sliced.z-end.z)<1e-8);
    }
});

test('rear contacts retain clearance on moderate aim but can deliberately risk the net',()=>{
  const s=createMatch();s.phase='rally';
  Object.assign(s.players[0],{x:0,z:5});
  Object.assign(s.shuttle,{x:0,y:3.2,z:5,vy:0,lastHit:1,active:true});
  const rear=getShotTarget(s,0,{shot:'smash',aimDepth:-.5});
  const risky=getShotTarget(s,0,{shot:'smash',aimDepth:-1});
  assert.ok(risky.netHeight<1.55 && !risky.smashViable);
  assert.ok(Math.abs(rear.aimZ)>5);
  s.players[0].z=s.shuttle.z=1.5;
  assert.equal(getShotTarget(s,0,{shot:'smash',aimDepth:-1}).aimZ,-1.8);
  s.players[0].z=s.shuttle.z=5;s.shuttle.y=1.7;
  const low=getShotTarget(s,0,{shot:'smash'});
  assert.ok(!low.smashViable && low.netHeight<1.55 && low.duration<.59);
});

test('real smash contact, serialized prediction and a later clear use their own drag',()=>{
  const s=createMatch();s.phase='rally';
  Object.assign(s.players[0],{x:0,z:3.8});
  Object.assign(s.shuttle,{x:0,y:3.2,z:3.8,vy:0,lastHit:1,active:true});
  stepMatch(s,[{shot:'smash'},{}],1/120);
  while(!s.hitId) stepMatch(s,[{},{}],1/120);
  assert.equal(s.shuttle.drag,SHUTTLE_FLIGHT.smashDrag);
  const landed=predictLanding(JSON.parse(JSON.stringify(s)));
  assert.equal(landed.event,'landing');
  assert.ok(Math.abs(landed.z-s.lastShotInfo.z)<1e-8);
  const clear=getShotTarget(s,1,{shot:'clear'});
  assert.equal(clear.drag,SHUTTLE_FLIGHT.drag);
});


test('ordinary smashes leave a readable defensive window and heavy smashes retain anticipation pressure',()=>{
 for(const role of Object.keys(ROLES)) for(const side of [0,1]) {
  const s=createMatch({roles:[role,role]});s.phase='rally';const sign=side?-1:1;
  Object.assign(s.players[side],{x:0,z:3.8*sign});
  Object.assign(s.shuttle,{x:0,y:3.2,z:3.8*sign,vy:0,lastHit:1-side,active:true});
  const arrival=charge=>{const t=getShotTarget(s,side,{shot:'smash',charge});return timeToShuttleZ({...s.shuttle,vx:t.vx,vz:t.vz,drag:t.drag},-3.55*sign);};
  const ordinary=arrival(.3),heavy=arrival(1);
  assert.ok(ordinary>=.30&&ordinary<=.46,`${role}: ordinary ${ordinary}`);
  assert.ok(heavy>=.23&&heavy<ordinary*.82,`${role}: heavy ${heavy}`);
 }
});
