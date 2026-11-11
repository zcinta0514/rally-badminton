import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MatchEntrance,applyEntranceCamera } from '../src/match-entrance.js';
import { makeShadowTexture,shuttleShadowSample } from '../src/contact-shadow.js';
import { makeAthlete,applyAthletePose,sampleAthletePose } from '../src/athlete.js';
import { createMatch } from '../shared/game.js';

test('entrance skips reduced motion, active network play and short remaining countdowns',()=>{
  const entry=new MatchEntrance();
  for(const options of [{reducedMotion:true},{fromLobby:false},{online:true,phase:'rally',remaining:3},{online:true,phase:'countdown',remaining:.5}]){
    assert.equal(entry.begin(options),false);assert.equal(entry.progress,1);
  }
  assert.equal(entry.begin({online:true,phase:'countdown',remaining:3}),true);
  entry.advance(.3,{phase:'countdown',remaining:2.7});assert.ok(entry.progress>0);
  entry.advance(.01,{phase:'serve',remaining:0,hidden:true});assert.equal(entry.active,false,'authority wins even on a hidden page');
});

test('hidden pages freeze; reduced motion and cancellation settle immediately',()=>{
  const entry=new MatchEntrance();entry.begin();entry.advance(.1);
  const progress=entry.progress;entry.advance(10,{hidden:true});assert.equal(entry.progress,progress);
  entry.advance(10,{reducedMotion:true});assert.equal(entry.active,false);assert.equal(entry.progress,1);
  entry.begin();for(let i=0;i<120;i++)entry.advance(1/60);
  assert.equal(entry.active,false);assert.equal(entry.progress,1);
  entry.begin();entry.cancel();assert.equal(entry.active,false);
});

test('both camera sides orbit clear of the net and preserve exact start/end projections',()=>{
  const from=new THREE.PerspectiveCamera(44,844/390,.1,100);from.position.set(4,1.8,9.5);from.lookAt(0,.4,0);from.updateMatrixWorld();
  for(const side of [-1,1]){
    const to=new THREE.PerspectiveCamera(35,844/390,.1,100);to.position.set(0,7.3,side*16.4);to.lookAt(0,0,0);to.setViewOffset(844,390,0,-25,844,390);to.updateMatrixWorld();
    const camera=new THREE.PerspectiveCamera();applyEntranceCamera(camera,from,to,0);
    assert.deepEqual(camera.position.toArray(),from.position.toArray());assert.deepEqual(camera.projectionMatrix.elements,from.projectionMatrix.elements);
    for(let i=1;i<100;i++){
      applyEntranceCamera(camera,from,to,i/100);
      assert.ok(Math.hypot(camera.position.x,camera.position.z)>=10);
      assert.ok(camera.position.y>=1.8);assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));
    }
    applyEntranceCamera(camera,from,to,1);
    assert.deepEqual(camera.position.toArray(),to.position.toArray());assert.deepEqual(camera.quaternion.toArray(),to.quaternion.toArray());assert.deepEqual(camera.projectionMatrix.elements,to.projectionMatrix.elements);
  }
});

test('shuttle shadows soften with altitude and project consistently away from the key',()=>{
  let previous=shuttleShadowSample(0);
  for(let h=.1;h<12;h+=.1){const value=shuttleShadowSample(h);
    assert.ok(value.opacity<previous.opacity&&value.opacity>0);assert.ok(value.width>previous.width&&value.depth>previous.depth);
    assert.ok(value.x>0&&value.z<0);previous=value;
  }
  const texture=makeShadowTexture(),{data,width,height}=texture.image;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(x===0||y===0||x===width-1||y===height-1)assert.equal(data[(y*width+x)*4+3],0);
  assert.ok(data[((height/2)*width+width/2)*4+3]>250);texture.dispose();
});

test('foot contact shadows follow posed feet and fade when lifted rather than floating below the body',()=>{
  const scene=new THREE.Scene(),athlete=makeAthlete(scene,0),state=createMatch();
  const pose=sampleAthletePose(state.players[0],0,state.shuttle,0);
  applyAthletePose(athlete,pose,{x:1,z:2,side:0});
  const original=athlete.footShadows[0].material.opacity;
  pose.joints.leftAnkle.y+=.5;pose.joints.leftAnkle.x+=.3;
  applyAthletePose(athlete,pose,{x:1,z:2,side:1});
  assert.ok(athlete.footShadows[0].material.opacity<original*.05);
  assert.equal(athlete.footShadows[0].position.x,-pose.joints.leftAnkle.x);
  assert.equal(athlete.footShadows[0].material.map,athlete.shadow.material.map);
});
