import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createMatch, stepMatch, aiInput, pauseMatch, resumeMatch } from '../shared/game.js';
import { HELL } from '../shared/hell-mode.js';
import { sampleAthletePose, makeAthlete, updateAthlete } from '../src/athlete.js';

const dt=1/240,dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function incoming(direction=1) {
  const s=createMatch({challenge:'hell'});s.phase='rally';s.service.active=false;
  Object.assign(s.players[1],{x:-1.8*direction,z:-3.8});
  Object.assign(s.shuttle,{x:direction,y:1.05,z:-3.8,vx:0,vy:-1,vz:0,active:true,lastHit:0});
  return s;
}

test('a real dive keeps a bounded root trajectory through contact, landing and get-up',()=>{
  for(const direction of [-1,1]){
    const s=incoming(direction);let dive,previous=null,hit=false;const stages=new Set();
    const visual=makeAthlete(new THREE.Scene(),1);
    for(let frame=0;frame<240;frame++){
      const old={...s.players[1]};stepMatch(s,[{},aiInput(s,1,'hard')],dt);
      if(s.challenge.rescue)dive=s.challenge.rescue;
      const p=s.players[1],motion=s.challenge.rescue;
      const pose=updateAthlete(visual,p,1,s.shuttle,s.time,dt,false,false,false,motion);
      if(!motion)continue;
      stages.add(pose.rescueStage);
      assert.ok(Math.hypot(p.x-old.x,p.z-old.z)<=HELL.diveSpeed*dt+1e-6);
      for(const joint of Object.values(pose.joints))assert.ok(Object.values(joint).every(Number.isFinite));
      for(const side of ['left','right']){
        for(const [a,b,length]of [['Shoulder','Elbow',.32],['Elbow','Wrist',.31],['Hip','Knee',.45],['Knee','Ankle',.43]])
          assert.ok(Math.abs(dist(pose.joints[side+a],pose.joints[side+b])-length)<.002,`${side} ${a} ${b}`);
      }
      if(previous){
        for(const name of Object.keys(pose.joints)){
          const a=previous[name],b=pose.joints[name];
          assert.ok(dist(a,b)<.18,`no per-frame joint snap: ${name}`);
        }
      }
      previous=pose.joints;
      if(!hit&&s.lastShotInfo?.skill==='rescue'){
        hit=true;visual.root.updateMatrixWorld(true);
        const head=visual.racket.localToWorld(new THREE.Vector3(0,.54,0));
        assert.ok(head.distanceTo(new THREE.Vector3(...Object.values(motion.contact)))<1e-7,'racket meets the authoritative ball');
        assert.equal(s.challenge.recoverUntil,motion.endsAt);
      }
      if(s.time<motion.endsAt)assert.equal(s.challenge.rescueUses,1,'no second dive before standing');
    }
    assert.ok(hit);assert.deepEqual([...stages],['push','flight','land','brace','rise']);
    assert.ok(dive.hitAt<dive.endsAt);assert.equal(s.challenge.rescue,null);
  }
});

test('dive visual and physics clocks freeze on pause and return to the regular stance',()=>{
  const s=incoming();while(!s.challenge.rescue)stepMatch(s,[{},aiInput(s,1,'hard')],dt);
  for(let i=0;i<65;i++)stepMatch(s,[{},aiInput(s,1,'hard')],dt);
  const visual=makeAthlete(new THREE.Scene(),1);
  const before=updateAthlete(visual,s.players[1],1,s.shuttle,s.time,dt,false,false,false,s.challenge.rescue);
  const snapshot=structuredClone(before),motion=structuredClone(s.challenge.rescue);
  pauseMatch(s,0);stepMatch(s,[{},{}],2);
  updateAthlete(visual,s.players[1],1,s.shuttle,s.time,dt,false,true,false,s.challenge.rescue);
  assert.deepEqual(visual.root.userData.pose,snapshot);assert.deepEqual(s.challenge.rescue,motion);
  resumeMatch(s);stepMatch(s,[{},{}],2);
  for(let i=0;i<240;i++)stepMatch(s,[{},aiInput(s,1,'hard')],dt);
  const final=sampleAthletePose(s.players[1],1,s.shuttle,s.time,{rescue:s.challenge.rescue});
  assert.notEqual(final.actionType,'rescue');assert.ok(final.joints.pelvis.y>.65);
});

test('nearby low returns keep ordinary footwork instead of triggering a dive',()=>{
  const s=incoming();s.players[1].x=.4;
  for(let i=0;i<120;i++)stepMatch(s,[{},aiInput(s,1,'hard')],dt);
  assert.equal(s.challenge.rescueUses,0);assert.equal(s.challenge.counts.rescue,0);
});

test('distant balls with running time use footwork and a recent dive cannot repeat',()=>{
  const runnable=incoming();runnable.shuttle.y=2.5;
  for(let i=0;i<120;i++)stepMatch(runnable,[{},aiInput(runnable,1,'hard')],dt);
  assert.equal(runnable.challenge.rescueUses,0,'distance alone must not trigger a dive');
  assert.ok(runnable.hitId>0,'ordinary footwork still returns the ball');
  const recent=incoming();recent.challenge.nextDiveAt=HELL.diveInterval;
  for(let i=0;i<120&&recent.phase==='rally';i++)stepMatch(recent,[{},aiInput(recent,1,'hard')],dt);
  assert.equal(recent.challenge.rescueUses,0,'four-second spacing also applies to hard balls');
});

test('the production GLB surface stays above the court through either dive and rise',async()=>{
  const {readFile}=await import('node:fs/promises');
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {installAthleteModel}=await import('../src/athlete-import.js');
  const bytes=await readFile(new URL('../src/models/athlete.glb',import.meta.url));
  for(const direction of [-1,1]){
    const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const visual=makeAthlete(new THREE.Scene(),1);installAthleteModel(visual,model);
    const s=incoming(direction),point=new THREE.Vector3();
    let minimum=Infinity,lowest=null;
    for(let frame=0;frame<180;frame++){
      stepMatch(s,[{},aiInput(s,1,'hard')],dt);
      updateAthlete(visual,s.players[1],1,s.shuttle,s.time,dt,false,false,false,s.challenge.rescue);
      visual.root.updateMatrixWorld(true);
      if(frame%4)continue;
      visual.importedModel.traverse(mesh=>{
        if(!mesh.isSkinnedMesh)return;
        for(let i=0;i<mesh.geometry.attributes.position.count;i++){
          mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);
          assert.ok([point.x,point.y,point.z].every(Number.isFinite));
          if(point.y<minimum){minimum=point.y;lowest={time:s.time,point:point.toArray(),bones:Array.from({length:4},(_,k)=>[mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getComponent(i,k)]?.name,mesh.geometry.attributes.skinWeight.getComponent(i,k)])};}
        }
      });
    }
    assert.ok(minimum>=0,`direction ${direction}: surface floor clearance ${minimum}: ${JSON.stringify(lowest)}`);
  }
});
