import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch, getShotTarget, stepMatch, predictLanding, ROLES} from '../shared/game.js';
import {sampleShuttleFlight, SHUTTLE_FLIGHT} from '../shared/shuttle-flight.js';

test('overhead smashes stay fast, downward and close to their straight chord on either team', () => {
  for (const format of ['singles', 'doubles']) for (const side of format === 'singles' ? [0,1] : [0,1,2,3])
    for (const role of Object.keys(ROLES)) for (const charge of [0,.5,1]) {
      const s=createMatch({format}), sign=side%2 ? -1 : 1;
      s.phase='rally'; Object.assign(s.players[side],{x:0,z:sign*3.8,role});
      Object.assign(s.shuttle,{x:0,y:3.2,z:sign*3.8,vy:0,lastHit:1-side%2,active:true});
      const t=getShotTarget(s,side,{shot:'smash',charge});
      const launch={...s.shuttle,...t,y:s.shuttle.y,x:0,z:s.shuttle.z};
      assert.ok(t.duration<.38); assert.ok(t.vy< -6); assert.ok(t.smashViable);
      let deviation=0;
      for(let i=0;i<=100;i++) {
        const p=sampleShuttleFlight(launch,t.duration*i/100);
        const fraction=(p.z-launch.z)/(t.z-launch.z);
        deviation=Math.max(deviation,Math.abs(p.y-launch.y*(1-fraction)));
        assert.ok(p.vy<0);
      }
      assert.ok(deviation<.32,`curve ${deviation}`);
      const end=sampleShuttleFlight(launch,t.duration);
      assert.ok(Math.abs(end.z-t.z)<1e-8 && Math.abs(end.y)<1e-8);
      let sliced=launch;
      for(let i=0;i<100;i++) sliced=sampleShuttleFlight(sliced,t.duration/100);
      assert.ok(Math.abs(sliced.z-end.z)<1e-8);
    }
});

test('rear contacts cannot select a net drop by asking for a shallow smash',()=>{
  const s=createMatch();s.phase='rally';
  Object.assign(s.players[0],{x:0,z:5});
  Object.assign(s.shuttle,{x:0,y:3.2,z:5,vy:0,lastHit:1,active:true});
  const rear=getShotTarget(s,0,{shot:'smash',aimDepth:-1});
  assert.ok(Math.abs(rear.aimZ)>5);
  s.players[0].z=s.shuttle.z=1.5;
  assert.equal(getShotTarget(s,0,{shot:'smash',aimDepth:-1}).aimZ,-1.8);
  s.players[0].z=s.shuttle.z=5;s.shuttle.y=1.7;
  const low=getShotTarget(s,0,{shot:'smash'});
  assert.ok(!low.smashViable && low.netHeight<1.55 && low.duration<.4);
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
