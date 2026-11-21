import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { makeCupAward, sampleCupLift, frameCupAwardCamera, STAGE_HEIGHT } from '../src/cup-award.js';
import { makeAthlete, applyAthletePose } from '../src/athlete.js';

function canvasMock(t) {
  const texts=[];
  globalThis.document={createElement:()=>({getContext:()=>({fillText(text){texts.push(text);},fillRect(){}})})};
  t.after(()=>{delete globalThis.document;});
  return texts;
}

test('both wrists follow the physical trophy handles throughout its overhead lift', t=>{
  canvasMock(t);
  const scene=new THREE.Scene(), winner=makeAthlete(scene,0), award=makeCupAward({eventId:'crown',name:'林舟'});
  scene.add(award.stage);
  for(const age of [0,.75,1,1.45,1.9,2.2,6]){
    const pose=award.frame(age,false), stage=award.stage;
    applyAthletePose(winner,pose,{x:stage.position.x,z:stage.position.z,side:1});
    winner.root.position.y=STAGE_HEIGHT;winner.root.rotation.y+=stage.rotation.y;
    scene.updateMatrixWorld(true);
    for(const [arm,sign] of [['left',-1],['right',1]]){
      const wrist=winner.bones[arm+'Wrist'].getWorldPosition(new THREE.Vector3());
      const handle=award.cup.localToWorld(new THREE.Vector3(-sign*.215,.041,0));
      assert.ok(wrist.distanceTo(handle)<.05);
      const toVec=j=>new THREE.Vector3(j.x,j.y,j.z);
      assert.ok(toVec(pose.joints[arm+'Shoulder']).distanceTo(toVec(pose.joints[arm+'Wrist']))<=.63);
    }
  }
  assert.ok(sampleCupLift(0).y<sampleCupLift(0).pose.joints.chest.y);
  assert.ok(sampleCupLift(3).y>sampleCupLift(3).pose.joints.head.y+.2);
  assert.equal(sampleCupLift(0,true).y,sampleCupLift(6,true).y);
});

test('actual hall leaves a clear camera ray to champion, trophy and nameplate on short landscape phones',async t=>{
  const texts=canvasMock(t);
  const bytes=await readFile(new URL('../src/models/tournament-hall.glb',import.meta.url));
  const {scene:hall}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  hall.updateMatrixWorld(true);
  const award=makeCupAward({eventId:'bay',name:'江嘉音'});
  assert.ok(texts.includes('江嘉音') && texts.some(text=>text.includes('开拍海湾挑战赛')));
  for(const [width,height] of [[844,390],[667,320],[375,667]]){
    for(const age of [0,1.4,4.8]){
      const cam=new THREE.PerspectiveCamera(35,1,.1,100);
      frameCupAwardCamera(cam,award.stage,width/height,age,false);
      const lift=sampleCupLift(age);
      for(const [x,y,z] of [[0,1.65+STAGE_HEIGHT,-.02],[0,lift.y+.16+STAGE_HEIGHT,-lift.z],
        [-1.29,.05,.735],[1.29,.55,.735]]){
        const target=award.stage.localToWorld(new THREE.Vector3(x,y,z));
        const ndc=target.clone().project(cam);
        assert.ok(Math.abs(ndc.x)<.96&&Math.abs(ndc.y)<.94);
        const ray=new THREE.Raycaster(cam.position,target.clone().sub(cam.position).normalize(),.05,target.distanceTo(cam.position)-.08);
        const hit=ray.intersectObject(hall,true).find(h=>h.object.isMesh);
        assert.equal(hit?.object.name,undefined,'award sightline occluded by '+hit?.object.name);
      }
    }
  }
});
test('repeated award entry, skipping and teardown release the stage and restore hidden match objects', async t=>{
  canvasMock(t);
  const { CourtView }=await import('../src/view.js');
  const view=Object.create(CourtView.prototype);
  view.scene=new THREE.Scene();view.camera=new THREE.PerspectiveCamera();
  view.width=667;view.height=320;
  view.players=[makeAthlete(view.scene,0),makeAthlete(view.scene,1)];
  view.renderer={render(){}};
  view.edgeIndicator={hidden:false};
  view.updateCamera=side=>{view.cameraSide=side;};
  for(const name of ['shuttle','paperBall','trail','groundMarker','impactMarker','bossRing','cannonLine'])view[name]=new THREE.Group();
  view.phantoms=[];
  for(const name of ['landingHint','interceptHint','targetHint','readyHint'])view[name]={group:new THREE.Group()};
  view.paperBall.visible=false;
  for(let i=0;i<2;i++){
    view.beginCupAward({eventId:i?'bay':'crown',name:'叶宁'});
    const stage=view.cupAward.stage;
    let released=false;
    view.cupAward.cup.children[0].geometry.addEventListener('dispose',()=>{released=true;});
    view.renderCupAward(4.2);
    assert.equal(view.cupAward.age,4.2);
    assert.equal(view.players[1].root.visible,false);
    assert.equal(view.players[0].racket.visible,false);
    assert.equal(view.shuttle.visible,false);
    view.endCupAward();view.endCupAward();
    assert.equal(stage.parent,null);
    assert.equal(released,true);
    assert.equal(view.players[0].root.position.y,0);
    assert.equal(view.players[0].racket.visible,true);
    assert.equal(view.players[1].root.visible,true);
    assert.equal(view.paperBall.visible,false);
    assert.equal(view.shuttle.visible,true);
  }
});
