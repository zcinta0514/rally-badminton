import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sampleFinalePose } from '../src/finale-pose.js';
import { makeAthlete, applyAthletePose } from '../src/athlete.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
test('kneeling and a single deep bow preserve limb lengths and floor clearance across the whole animation',()=>{
  for(const role of ['winner','loser'])for(let t=0;t<=3;t+=.02){
    const pose=sampleFinalePose(role,t),j=pose.joints;
    for(const p of Object.values(j))assert.ok(Object.values(p).every(Number.isFinite));
    for(const name of ['left','right']){
      for(const [a,b,length] of [['Hip','Knee',.45],['Knee','Ankle',.43],['Shoulder','Elbow',.32],['Elbow','Wrist',.31]])
        assert.ok(Math.abs(distance(j[name+a],j[name+b])-length)<1e-5,`${role} ${t} ${name+a}`);
      assert.ok(j[name+'Knee'].y>=.07,`${role} knee clips floor at ${t}`);
      assert.ok(j[name+'Ankle'].y>=.08);
    }
    assert.ok(j.head.y>=.17,'head cannot penetrate court');
  }
  const standing=sampleFinalePose('loser',0),kneeling=sampleFinalePose('loser',.7),bow=sampleFinalePose('loser',1.4),rise=sampleFinalePose('loser',2.6);
  assert.ok(kneeling.joints.pelvis.y<standing.joints.pelvis.y-.3);
  assert.ok(bow.joints.head.y<kneeling.joints.head.y-.65);
  assert.ok(rise.joints.head.y>bow.joints.head.y+.65);
  assert.ok(sampleFinalePose('winner',1.4).joints.head.y>1.6);
});

test('the real skinned rig accepts the finale and resets head/feet orientation for normal poses',()=>{
  const rig=makeAthlete(new THREE.Scene(),0),pose=sampleFinalePose('loser',1.4,-Math.PI/2);
  applyAthletePose(rig,pose,{x:-.9,z:3.4,side:0,selected:false});
  rig.root.updateMatrixWorld(true);
  assert.ok(rig.skin.skeleton.bones.every(b=>b.matrixWorld.elements.every(Number.isFinite)));
  assert.equal(rig.root.position.x,-.9);assert.ok(rig.bones.head.rotation.x<-.8);
});

test('kneeling shoes keep their forward direction instead of turning backwards',()=>{
  const rig=makeAthlete(new THREE.Scene(),0);
  for(const heading of [-Math.PI/2,Math.PI/2])for(const age of [0,.3,.7,1.4,2.6]){
    const pose=sampleFinalePose('loser',age,heading);
    applyAthletePose(rig,pose,{x:0,z:0});rig.root.updateMatrixWorld(true);
    const forward=new THREE.Vector3(-Math.sin(heading),0,-Math.cos(heading));
    for(const foot of Object.values(rig.feet)){
      const toe=new THREE.Vector3(0,0,-1).transformDirection(foot.matrixWorld);
      assert.ok(toe.dot(forward)>.99,`shoe reverses at age ${age}`);
    }
  }
});
