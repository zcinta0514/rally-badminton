import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CourtView} from '../src/view.js';
import {makeAthlete} from '../src/athlete.js';
import {createMatch,stepMatch} from '../shared/game.js';

// Exercise the production scene update with only the final GPU draw stubbed.
function makeView(){
 const view=Object.create(CourtView.prototype);view.scene=new THREE.Scene();
 view.players=[makeAthlete(view.scene,0),makeAthlete(view.scene,1)];view.makeShuttle();
 view.netGeometry=new THREE.BufferGeometry();view.netGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,.8,0,0,1.52,0],3));
 view.netAtRest=true;view.cameraSide=0;view.mode='menu';view.elapsed=0;
 view.edgeIndicator={hidden:true};view.updateHints=()=>{};view.renderer={render(){}};
 return view;
}

test('a real final net fault completes the remaining player recovery before freezing the result',()=>{
 const previous=globalThis.document;globalThis.document={querySelector:()=>null};
 try{
  const view=makeView(),state=createMatch({target:5});state.phase='rally';state.service.active=false;state.score=[0,4];
  Object.assign(state.players[0],{x:0,z:3.8});
  Object.assign(state.shuttle,{x:.2,y:1.6,z:3.7,vx:0,vy:-.1,vz:0,active:true,lastHit:1});
  for(let i=0;i<300&&state.phase!=='over';i++){
   stepMatch(state,[i===0?{shot:'smash',charge:.8}:{},{}],1/120);view.render(state,0,1/120);
  }
  assert.equal(state.rallyEnd.kind,'net');assert.equal(state.phase,'over');
  assert.ok(state.players[0].action.endsAt>state.time,'the final stroke still has a recovery to play');
  const before=structuredClone(state);
  for(let i=0;i<200;i++)view.render(state,0,1/120);
  assert.deepEqual(state,before,'rendering cannot advance the final authoritative state');
  assert.equal(view.rallyEnding,false);assert.equal(view.players[0].root.userData.pose.actionType,null,'final stroke must recover instead of holding mid-swing');
  assert.ok(view.players[0].root.userData.pose.jump<.005);
  const pose=structuredClone(view.players[0].root.userData.pose);
  for(let i=0;i<20;i++)view.render(state,0,1/60);
  assert.deepEqual(view.players[0].root.userData.pose,pose,'settled result remains still');
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});

test('production view pauses a visible net ripple and clears it on the next serve without changing rules',()=>{
 const previous=globalThis.document;globalThis.document={querySelector:()=>null};
 try{
  const view=makeView();view.makeCourt();
  const state=createMatch();Object.assign(state,{phase:'point',time:2,
   rallyEnd:{id:1,kind:'net',at:2,x:0,y:1.15,z:0,vx:1,vy:-4,vz:-10,hitSide:0,winner:1,hitId:2,duration:1.4}});
  view.render(state,0,1/60);state.time=2.07;view.render(state,0,.06);
  const positions=view.netGeometry.attributes.position;
  assert.ok(positions.array.some((value,index)=>index%3===2&&Math.abs(value)>.01));
  state.phase='paused';const before=structuredClone(state);view.render(state,0,.02);
  const frozen=positions.array.slice();
  for(let i=0;i<30;i++)view.render(state,0,1/60);
  assert.deepEqual(positions.array,frozen);assert.deepEqual(state,before);
  state.phase='serve';state.rallyEnd=null;view.render(state,0,1/60);
  assert.equal(view.netAtRest,true);
  assert.ok(positions.array.every((value,index)=>index%3!==2||value===0));
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
