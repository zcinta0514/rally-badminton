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
 assert.equal(a.points.at(-1).y,0);assert.equal(getFlightGuide(s,0,{}),null);
 assert.equal(JSON.stringify(s),before);
});
test('early held input originates at reachable interception, not opponent ball',()=>{
 const s=incoming(),info={prepare:'drop',aim:.4,charge:.3};
 info.availability=getShotAvailability(s,0,{shot:'drop'});
 info.intercept=getInterceptAdvice(s,0,{shot:'drop'});
 const g=getFlightGuide(s,0,info);assert.equal(g.kind,'aim');
 assert.ok(g.points[0].z>0);
 info.intercept={status:'unreachable'};info.availability={canHit:false};
 assert.equal(getFlightGuide(s,0,info).kind,'incoming');
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
