import test from 'node:test';
import assert from 'node:assert/strict';
import {verticalFlight,verticalLaunch,flightApex,timeToHeight,VERTICAL_DRAG,sampleShuttleFlight} from '../shared/shuttle-flight.js';
import * as game from '../shared/game.js';
import {runReceive} from '../scripts/measure-gameplay-pace.js';

test('vertical drag matches independent numerical integration during rise, fall and superterminal descent',()=>{
 for(const vy of [-22,-2,0,18,35]){
  let y=3,v=vy;const dt=1/100000;
  for(let i=0;i<200000;i++){const a=-9.81-VERTICAL_DRAG*Math.abs(v)*v;y+=v*dt+.5*a*dt*dt;v+=a*dt;}
  const p=verticalFlight(3,vy,2,VERTICAL_DRAG);
  assert.ok(Math.abs(p.y-y)<.001);assert.ok(Math.abs(p.vy-v)<.001);
 }
 assert.ok(Math.abs(verticalFlight(100,0,8,VERTICAL_DRAG).vy+6.7)<1e-8);
});

test('vertical launch, apex and descending contact time agree, including serialized and sliced flights',()=>{
 for(const height of [.3,1.1,3.2])for(const duration of [.8,1.2,2.3]){
  const vy=verticalLaunch(height,0,duration,VERTICAL_DRAG);
  const ball={x:0,y:height,z:4,vx:1,vy,vz:-12,drag:.2,verticalDrag:VERTICAL_DRAG};
  assert.ok(Math.abs(timeToHeight(ball)-duration)<1e-8);
  const top=flightApex(ball);assert.ok(top.y>=height);
  if(vy>0) assert.ok(Math.abs(sampleShuttleFlight(ball,top.time).vy)<1e-8);
  const whole=sampleShuttleFlight(ball,duration);let sliced=JSON.parse(JSON.stringify(ball));
  for(let i=0;i<120;i++)sliced=sampleShuttleFlight(sliced,duration/120);
  for(const key of ['x','y','z','vx','vy','vz'])assert.ok(Math.abs(whole[key]-sliced[key])<1e-8,key);
 }
});

test('returning to midcourt creates a usable drop window; staying deep or reacting late loses it',()=>{
 for(const side of [0,1])for(const frame of [1/30,1/60,1/120]){
  const center=runReceive(game,{side,frame,startZ:3.3});
  const deep=runReceive(game,{side,frame,startZ:5.5});
  const late=runReceive(game,{side,frame,startZ:4.8,reaction:.3});
  assert.ok(center.received);assert.ok(center.contactHeight>.9);
  assert.equal(deep.received,false);assert.equal(late.received,false);
 }
});

test('retreat costs speed while forward approaches preserve each role top speed',()=>{
 for(const role of Object.keys(game.ROLES)){
  const speeds=[];
  for(const z of [-1,1]){const s=game.createMatch({roles:[role,role]});s.players[0].z=3.4;
   for(let i=0;i<60;i++)game.stepMatch(s,[{z},{}],1/120);
   speeds.push(Math.abs(s.players[0].vz));
  }
  assert.ok(Math.abs(speeds[0]-game.ROLES[role].speed)<.02);
  assert.ok(speeds[1]/speeds[0]>.84&&speeds[1]/speeds[0]<.88);
 }
});
