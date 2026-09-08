import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CourtView } from '../src/view.js';
import { makeAthlete } from '../src/athlete.js';
import { createMatch } from '../shared/game.js';

test('court finale uses actual winner identity, projects both labels, and restores the existing camera and rigs',()=>{
  const view=Object.create(CourtView.prototype);view.scene=new THREE.Scene();
  view.players=[makeAthlete(view.scene,0),makeAthlete(view.scene,1)];view.makeShuttle();
  view.camera=new THREE.PerspectiveCamera();view.width=844;view.height=390;
  view.edgeIndicator={hidden:false};view.renderer={render(){}};
  view.updateCamera=side=>{view.cameraSide=side;};
  const s=createMatch(),before=structuredClone(s),cameraSettings={pitch:28,zoom:1};view.cameraSettings=cameraSettings;
  for(const winner of [0,1]){
    view.renderFinale(s,{winner,loser:1-winner,age:1.4},1);
    const leftLine=new THREE.Vector3(-3.05,.03,4).project(view.camera);
    const rightLine=new THREE.Vector3(3.05,.03,4).project(view.camera);
    assert.ok(Math.abs(leftLine.y-rightLine.y)<1e-9,'court cross-lines must stay horizontal in the finale');
    const loser=view.players[1-winner],victor=view.players[winner];
    assert.ok(loser.root.userData.pose.joints.head.y<.3);
    assert.ok(victor.root.userData.pose.joints.head.y>1.6);
    assert.ok(loser.root.position.x<victor.root.position.x);
    for(const p of view.finaleAnchors)assert.ok(p.x>0&&p.x<844&&p.y>0&&p.y<390);
    assert.equal(view.shuttle.visible,false);assert.equal(loser.racket.visible,false);
    view.clearFinale();assert.ok(view.players.every(p=>p.racket.visible&&p.ground.visible));
    assert.equal(view.cameraSide,null);assert.equal(view.initialized,false);
  }
  assert.deepEqual(s,before);assert.equal(view.cameraSettings,cameraSettings);
});
