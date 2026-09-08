import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMatch,stepMatch} from '../shared/game.js';

import * as visual from '../src/shuttle-visual.js';
const end=(kind='net')=>({id:1,kind,at:2,x:.3,y:kind==='net'?1.15:0,z:kind==='net'?0:6.9,
 vx:1,vy:-4,vz:kind==='net'?-8:5,hitSide:0,winner:1,hitId:4,duration:1.4});
test('shuttle body has real court scale and its leading cork meets the flight point',()=>{
 assert.equal(typeof visual.makeShuttleModel,'function');
 const ball=visual.makeShuttleModel(),box=new THREE.Box3().setFromObject(ball),size=box.getSize(new THREE.Vector3());
 assert.ok(size.x>=.058&&size.x<=.070,`feather diameter ${size.x}`);
 assert.ok(size.y>=.073&&size.y<=.092,`full body length ${size.y}`);
 assert.ok(Math.abs(box.max.y)<.002,'the leading point is the model origin');
});
test('individual feather detail has a bounded mobile geometry cost and no downloaded textures',()=>{
 const ball=visual.makeShuttleModel();
 assert.equal(ball.userData.featherCount,16);
 assert.ok(ball.children.length<=4,'feathers must be merged rather than sixteen separately drawn objects');
 let triangles=0;
 ball.traverse(mesh=>{
  if(mesh.isMesh)triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3;
  if(mesh.material)assert.equal(mesh.material.map,null);
 });
 assert.ok(triangles<700,`shuttle triangle budget: ${triangles}`);
 const feathers=ball.getObjectByName('sixteen-separated-feather-vanes');
 assert.ok(feathers.geometry.index.count>0,'feathers have actual surfaces, not only lines');
});
test('net tail visibly loses flight, drops on the hitting side and rests without changing the event',()=>{
 assert.equal(typeof visual.sampleRallyEnd,'function');
 const e=end(),before=structuredClone(e),start=visual.sampleRallyEnd(e,0),fall=visual.sampleRallyEnd(e,.35),rest=visual.sampleRallyEnd(e,1.35);
 assert.ok(Math.abs(start.position.x-e.x)<1e-8&&Math.abs(start.position.z-e.z)<1e-8);
 assert.ok(fall.position.y<start.position.y-.25,'the shuttle cannot hang at the net');
 assert.ok(fall.position.z>0,'net rebound stays on the hitter side');
 assert.ok(rest.grounded&&rest.position.y<.08,'tail finishes on the floor');
 assert.deepEqual(e,before);assert.deepEqual(visual.sampleRallyEnd(e,4),visual.sampleRallyEnd(e,5));
});
test('out landing has a small bounce, tips onto its side, and remains beyond the boundary',()=>{
 assert.equal(typeof visual.sampleRallyEnd,'function');
 const e=end('out'),touch=visual.sampleRallyEnd(e,0),bounce=visual.sampleRallyEnd(e,.08),rest=visual.sampleRallyEnd(e,1.3);
 assert.ok(bounce.position.y>touch.position.y+.012&&bounce.position.y<.15);
 assert.ok(rest.position.z>=e.z,'out animation cannot bring the shuttle back inside');
 assert.ok(Math.abs(rest.axis.y)<.5&&rest.grounded,'resting feather skirt tips sideways');
 assert.ok(Math.hypot(rest.position.x-e.x,rest.position.z-e.z)<.5,'skid is short');
});
test('ending clock freezes with pause, completes a frozen final score, and resets for the next serve',()=>{
 assert.equal(typeof visual.RallyEndPresentation,'function');
 const clock=new visual.RallyEndPresentation(),s={phase:'point',time:2,rallyEnd:end()};
 clock.update(s,.02);s.time+=.2;clock.update(s,.2);s.phase='paused';const frozen=clock.update(s,.1);
 for(let i=0;i<30;i++)assert.deepEqual(clock.update(s,.05),frozen);
 s.phase='countdown';assert.deepEqual(clock.update(s,.2),frozen);
 s.phase='over';for(let i=0;i<40;i++)clock.update(s,.05);
 assert.equal(clock.active,false);assert.ok(clock.sample.grounded);
 const settled=structuredClone(clock.sample);clock.update(s,.1);assert.deepEqual(clock.sample,settled);
 s.phase='serve';s.rallyEnd=null;assert.equal(clock.update(s,.02),null);assert.equal(clock.active,false);
});

test('an authoritative rising net collision turns continuously instead of flipping its feather axis',()=>{
 const state=createMatch();state.phase='rally';
 Object.assign(state.shuttle,{x:0,y:.8,z:.02,vx:0,vy:1/.18+9.81*.02,vz:-1,active:true,lastHit:0});
 stepMatch(state,[{},{}],.025);
 assert.equal(state.rallyEnd.kind,'net');assert.ok(state.rallyEnd.vy>0);
 let previous=null;
 for(let i=80;i<=140;i++){
  const {axis}=visual.sampleRallyEnd(state.rallyEnd,i/1000);
  assert.ok(Math.abs(Math.hypot(axis.x,axis.y,axis.z)-1)<1e-8,'every orientation must remain a unit direction');
  if(previous)assert.ok(axis.x*previous.x+axis.y*previous.y+axis.z*previous.z>.99,'rising contact cannot snap through an opposite axis in one millisecond');
  previous=axis;
 }
});

test('both net sides and all floor outcomes stay finite, bounded and deterministic at clamped ages',()=>{
 for(const kind of ['net','in','out','serviceFault'])for(const side of [0,1]){
  const e={...end(kind),hitSide:side,vx:side? -12:12,vz:side? 18:-18,
   y:kind==='net'?1.52:0,z:kind==='net'?0:side?3:-3};
  const before=structuredClone(e);
  assert.deepEqual(visual.sampleRallyEnd(e,-2),visual.sampleRallyEnd(e,0));
  assert.deepEqual(visual.sampleRallyEnd(e,10),visual.sampleRallyEnd(e,e.duration));
  for(let i=0;i<=140;i++){
   const sample=visual.sampleRallyEnd(e,i/100),p=sample.position;
   assert.ok([...Object.values(p),...Object.values(sample.axis),sample.markOpacity,sample.roll].every(Number.isFinite));
   assert.ok(p.y>=0&&p.y<=Math.max(.15,e.y));
   assert.ok(Math.hypot(p.x-e.x,p.z-e.z)<.5,'ending cannot become another long flight');
   assert.ok(Math.abs(Math.hypot(sample.axis.x,sample.axis.y,sample.axis.z)-1)<1e-8);
   assert.ok(sample.markOpacity>=0&&sample.markOpacity<=.6);
   if(kind==='net')assert.ok(p.z*(side===0?1:-1)>=0,'net tail must stay on the hitting side');
  }
  assert.ok(visual.sampleRallyEnd(e,e.duration).grounded);
  if(kind!=='net')assert.deepEqual(visual.sampleRallyEnd(e,.4).impact,{x:e.x,z:e.z});
  assert.deepEqual(e,before);
 }
});

test('late network snapshots adopt impact age and later copies cannot restart the same ending',()=>{
 const clock=new visual.RallyEndPresentation(),event=end(),s={phase:'point',time:event.at+.7,rallyEnd:event};
 clock.update(s,.016);assert.ok(Math.abs(clock.age-.7)<1e-8);
 clock.update({...s,rallyEnd:structuredClone(event)},.1);assert.ok(Math.abs(clock.age-.8)<1e-8);
 clock.update({...s,time:event.at+.85},.01);assert.ok(Math.abs(clock.age-.85)<1e-8);
 const paused={...s,phase:'paused',time:event.at+.85},frozen=clock.update(paused,.1);
 assert.deepEqual(clock.update(paused,5),frozen);
 assert.deepEqual(clock.update({...paused,phase:'countdown'},2),frozen);
 clock.update({...paused,phase:'point'},.05);assert.ok(Math.abs(clock.age-.9)<1e-8);
 const finished=new visual.RallyEndPresentation();
 finished.update({...s,phase:'intermission',time:event.at+3},.1);
 assert.equal(finished.active,false);assert.equal(finished.age,event.duration);
});

test('new rallies, match resets and nonphysical finishes cannot inherit an old visual ending',()=>{
 const clock=new visual.RallyEndPresentation(),event=end(),s={phase:'over',time:event.at,rallyEnd:event};
 clock.update(s,.1);clock.update(s,2);assert.equal(clock.active,false);
 assert.equal(clock.update({...s,phase:'serve',time:0,rallyEnd:null},.01),null);
 clock.update({...s,phase:'point'},.01);assert.equal(clock.active,true);assert.equal(clock.age,0);
 const next={...event,id:2,hitId:9,at:4};
 clock.update({phase:'point',time:4.1,rallyEnd:next},.01);
 assert.equal(clock.event.id,2);assert.ok(Math.abs(clock.age-.1)<1e-8);
 clock.clear();clock.update(s,.01);assert.equal(clock.age,0);
 assert.equal(clock.update({phase:'over',time:0,rallyEnd:null},.01),null);assert.equal(clock.active,false);
});
