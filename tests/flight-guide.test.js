import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch, getInterceptAdvice, getShotAvailability, getShotTarget} from '../shared/game.js';
import {getFlightGuide} from '../src/flight-guide.js';
import {FlightGuideView} from '../src/flight-guide-view.js';
import * as THREE from 'three';

const incoming = (side=0) => {
 const s=createMatch();s.phase='rally';const sign=side===0?1:-1;
 Object.assign(s.shuttle,{x:0,y:2,z:sign*2,vx:0,vy:0,vz:sign*3,active:true,lastHit:1-side});
 return s;
};
test('incoming prediction follows flight for either receiver, never own outgoing ball',()=>{
 for(const side of [0,1]){
  const s=incoming(side),g=getFlightGuide(s,side,{});
  assert.equal(g.kind,'incoming');assert.ok(g.points.length>8);
  assert.ok(g.points.at(-1).y<g.points[0].y);
  s.shuttle.lastHit=side;assert.equal(getFlightGuide(s,side,{}),null);
 }
});
test('held serve responds to aim and release, without mutating authority',()=>{
 const s=createMatch(),before=JSON.stringify(s);
 const a=getFlightGuide(s,0,{prepare:'clear',aim:-.7,charge:.2});
 const b=getFlightGuide(s,0,{prepare:'clear',aim:.7,charge:.8});
 assert.equal(a.kind,'aim');assert.ok(a.points.at(-1).x<b.points.at(-1).x);
 assert.ok(a.points.at(-1).y>0,'short intention does not draw a promised landing');assert.equal(getFlightGuide(s,0,{}),null);
 assert.equal(JSON.stringify(s),before);
});
test('early held input keeps incoming guide until contact is available',()=>{
 const s=incoming(),info={prepare:'drop',aim:.4,charge:.3};
 info.availability=getShotAvailability(s,0,{shot:'drop'});
 info.intercept=getInterceptAdvice(s,0,{shot:'drop'});
 const g=getFlightGuide(s,0,info);assert.equal(g.kind,'incoming');
 assert.ok(g.points[0].z>0);
 info.intercept={status:'unreachable'};info.availability={canHit:false};
 assert.equal(getFlightGuide(s,0,info).kind,'incoming');
 s.players[0].x=s.shuttle.x;s.players[0].z=s.shuttle.z;
 delete info.availability;
 assert.equal(getFlightGuide(s,0,info).kind,'aim');
});

test('disabled guides remain hidden through updates and pause, then can be restored',()=>{
 const v=new FlightGuideView(new THREE.Scene()),s=createMatch();
 v.update(s,0,{prepare:'clear'});assert.equal(v.line.visible,true);
 v.setEnabled(false);assert.equal(v.line.visible,false);
 v.update(s,0,{prepare:'clear'});assert.equal(v.line.visible,false);
 v.update(s,0,{prepare:'clear'},{freeze:true});assert.equal(v.line.visible,false);
 v.setEnabled(true);v.update(s,0,{prepare:'clear'});assert.equal(v.line.visible,true);
});
test('point end and phantom ambiguity suppress guides',()=>{
 const s=incoming();s.phase='point';assert.equal(getFlightGuide(s,0,{}),null);
 s.phase='rally';s.challenge={active:{kind:'phantom',hitId:s.hitId,at:s.time,fadeAt:1}};
 assert.equal(getFlightGuide(s,0,{}),null);
});
test('renderer freezes during pause, clears on reset/release and reuses GPU buffers',()=>{
 const v=new FlightGuideView(new THREE.Scene()),s=createMatch();
 v.update(s,0,{prepare:'clear'},{dt:.016});assert.equal(v.line.visible,true);
 const geometry=v.line.geometry,snapshot=[...v.positions];
 s.phase='paused';v.update(s,0,{}, {freeze:true});assert.deepEqual([...v.positions],snapshot);
 v.update(s,1,{}, {freeze:true});assert.equal(v.line.visible,false);
 s.phase='serve';v.update(s,0,{prepare:'drop'},{dt:.016});assert.equal(v.line.geometry,geometry);
 v.update(s,0,{});assert.equal(v.line.visible,false);
 v.update(s,0,{prepare:'clear'},{hidden:true});assert.equal(v.line.visible,false);
});

test('rapid direction, shot and receiver changes never accumulate or bridge old paths',()=>{
 const scene=new THREE.Scene(),v=new FlightGuideView(scene),geometry=v.line.geometry;
 const positions=geometry.attributes.instanceStart.data;
 let previousCount=0,shortened=false;
 for(let i=0;i<240;i++){
  const side=i%2,s=i%5===0?createMatch():incoming(side);
  if(s.phase==='serve')s.server=side;
  s.pointId=Math.floor(i/24);s.hitId=i;
  const info=i%4===0?{}:{prepare:['clear','drop','smash'][i%3],aim:(i%7-3)/3,aimDepth:(i%5-2)/2,charge:(i%11)/10};
  v.update(s,side,info,{reset:i%24===0,dt:.016});
  assert.equal(v.line.geometry,geometry);assert.equal(geometry.attributes.instanceStart.data,positions);
  assert.equal(scene.children.filter(o=>o.name==='flight-guide').length,1);
  assert.equal(v.line.children.length,1,'one backing, never a second trajectory');
  const g=getFlightGuide(s,side,info);
  if(!g){assert.equal(v.line.visible,false);continue;}
  const count=geometry.instanceCount;
  assert.ok(Number.isInteger(count)&&count>0&&count<=v.positions.length/6);
  if(count<previousCount)shortened=true;
  previousCount=count;
  const bounds=['x','y','z'].map(k=>[Math.min(...g.points.map(p=>k==='y'?Math.max(.04,p[k]):p[k])),Math.max(...g.points.map(p=>k==='y'?Math.max(.04,p[k]):p[k]))]);
  for(let n=0;n<count;n++){
   const k=n*6;
   assert.ok(Math.hypot(v.positions[k+3]-v.positions[k],v.positions[k+4]-v.positions[k+1],v.positions[k+5]-v.positions[k+2])<=.281,'no stray connector between dashes');
   for(let j=0;j<6;j++){
    const value=v.positions[k+j],[min,max]=bounds[j%3];
    assert.ok(Number.isFinite(value)&&value>=min-1e-5&&value<=max+1e-5,'only the current guide is drawn');
   }
  }
  if(i%9===0){s.phase='point';v.update(s,side,{});assert.equal(v.line.visible,false);}
 }
 assert.ok(shortened,'exercise replacing a longer path with a shorter one');
 v.clear();assert.equal(v.line.visible,false);
});
