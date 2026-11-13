import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../shared/game.js';
const create = () => game.createMatch({format:'doubles', roles:['swift','power','power','swift']});
test('four players preserve roles and team IDs while singles stays default',()=>{
 const s=create(); assert.equal(s.players.length,4); assert.equal(s.players[2].role,'power');
 assert.deepEqual(s.players.map((_,i)=>game.playerTeam(s,i)),[0,1,0,1]);
 assert.equal(game.createMatch().players.length,2); assert.equal(s.serverPlayer,0); assert.equal(s.receiverPlayer,1);
});
test('only nominated receiver returns serve; teammates cannot double hit',()=>{
 const s=create(); s.phase='rally'; Object.assign(s.shuttle,{active:true,lastHit:0,x:0,y:1,z:-3,vx:0,vy:0,vz:0}); s.service.active=true;
 for (const slot of [1,3]) Object.assign(s.players[slot],{x:0,z:-3});
 assert.equal(game.getShotAvailability(s,1).canHit,true); assert.equal(game.getShotAvailability(s,3).reasonCode,'receiver');
 s.service.active=false; assert.equal(game.getShotAvailability(s,3).canHit,true);
 s.shuttle.lastHit=1; assert.equal(game.getShotAvailability(s,3).reasonCode,'turn');
});
test('doubles has wider playable court and shorter service back line',()=>{
 const s=create(); assert.equal(s.service.targetBox.minZ,-5.94); assert.equal(s.service.targetBox.minX,-3.05);
 s.phase='rally'; Object.assign(s.shuttle,{active:true,lastHit:0,x:2.9,y:.01,z:-4,vx:0,vy:0,vz:0});
 assert.equal(game.predictLanding(s).out,false);
 game.stepMatch(s,[{x:1}],.25); assert.ok(s.players[0].x<=2.89);
});
function scoreFor(state,winner) {
 state.phase='rally'; state.service.active=false;
 Object.assign(state.shuttle,{active:true,lastHit:1-winner,lastHitPlayer:1-winner,x:0,z:winner===0?-4:4,y:.001,vx:0,vy:-1,vz:0});
 game.stepMatch(state,[],.02); assert.equal(state.phase,'point');
 for(let i=0;i<7;i++) game.stepMatch(state,[],.25);
}
for(const team of [0,1]) test(`team ${team} service retains winning server and rotates on regain`,()=>{
 const s=create(); if(team===1) scoreFor(s,1);
 const server=s.serverPlayer; scoreFor(s,team); assert.equal(s.serverPlayer,server);
 scoreFor(s,1-team); scoreFor(s,team); assert.equal(s.serverPlayer,server^2);
 assert.equal(s.servicePositions[s.receiverPlayer],s.score[team]%2);
});
function incoming() {
 const s=create(); s.phase='rally'; s.service.active=false;
 Object.assign(s.shuttle,{active:true,lastHit:1,lastHitPlayer:1,x:0,y:1.3,z:3,vx:0,vy:0,vz:0});
 Object.assign(s.players[0],{x:-.4,z:3}); Object.assign(s.players[2],{x:.4,z:3}); return s;
}
test('simultaneous contacts prefer chronology then distance and alternate exact ties',()=>{
 for (const tie of [0,1]) {
  const s=incoming(); s._contactTie=tie;
  for(const slot of [0,2]) s.players[slot].pendingShot={shot:'clear',aim:0,aimDepth:0,charge:0,remaining:.3,contactAt:.01};
  game.stepMatch(s,[],.02); assert.equal(s.hitId,1); assert.equal(s.shuttle.lastHitPlayer,tie===0?0:2); assert.equal(s.lastShotInfo.side,0);
 }
 const s=incoming(); s.players[0].pendingShot={shot:'clear',remaining:.3,contactAt:.02}; s.players[2].pendingShot={shot:'clear',remaining:.3,contactAt:.01};
 game.stepMatch(s,[],.03); assert.equal(s.shuttle.lastHitPlayer,2);
});
test('teammates block crossing with bounded separation and can slide',()=>{
 const s=incoming(); s.shuttle.y=30; Object.assign(s.players[0],{x:-.35,z:3}); Object.assign(s.players[2],{x:.35,z:3});
 for(let i=0;i<12;i++) game.stepMatch(s,[{x:1},{},{x:-1}],.05);
 assert.ok(s.players[0].x<s.players[2].x); assert.ok(Math.hypot(s.players[0].x-s.players[2].x,s.players[0].z-s.players[2].z)>=.55);
 const before=s.players[0].z; for(let i=0;i<5;i++) game.stepMatch(s,[{x:1,z:1},{},{x:-1}],.05); assert.ok(s.players[0].z>before+.05);
});
test('AI teammate covers reachable human intent and rescues unreachable human',()=>{
 const s=incoming(); s.time=1; s.players[0].x=0; s.players[2].x=1;
 game.aiInput(s,2,'hard',[{prepare:'clear'}]); s.time+=.1;
 const cover=game.aiInput(s,2,'hard',[{prepare:'clear'}]); assert.equal(cover.shot,null); assert.equal(s._doublesAI[0].primary,0);
 s.players[0].x=-2.8;s.players[0].z=6.4; s.players[2].x=0;
 game.aiInput(s,2,'hard',[{prepare:'clear'}]); assert.equal(s._doublesAI[0].primary,2);
});
test('running into stationary teammate does not push them down the court',()=>{
 const s=incoming(); s.shuttle.y=30; Object.assign(s.players[0],{x:-.6,z:3}); Object.assign(s.players[2],{x:0,z:3});
 for(let i=0;i<20;i++) game.stepMatch(s,[{x:1}],.03);
 assert.ok(Math.abs(s.players[2].x)<.02);
});
test('all four slots use stamina, actions and own court movement',()=>{
 const s=create(); s.phase='rally'; s.service.active=false; s.shuttle.active=true; s.shuttle.y=30;s.shuttle.lastHit=0;
 const stamina=s.players.map(p=>p.stamina);
 game.stepMatch(s,Array.from({length:4},()=>({x:1,prepare:'smash'})),.2);
 for(let i=0;i<4;i++) {assert.ok(s.players[i].stamina<stamina[i]);assert.equal(s.players[i].action.stage,'prepare');assert.ok(s.players[i].z*(i%2===0?1:-1)>0);}
});
test('AI coordinated matches finish for every teammate difficulty',()=>{
 for(const difficulty of ['easy','medium','hard']) {
  const s=game.createMatch({format:'doubles',target:5});
  for(let i=0;i<18000&&s.phase!=='over';i++) game.stepMatch(s,s.players.map((_,slot)=>game.aiInput(s,slot,difficulty)),1/60);
  assert.equal(s.phase,'over');assert.ok(s.players.every(p=>Number.isFinite(p.stamina)));
 }
});
test('AI preserves a committed windup when human changes intention',()=>{
 const s=incoming(); s.players[0].x=-2.8;s.players[0].z=6.4;
 game.aiInput(s,2,'hard'); s.players[2].pendingShot={shot:'clear',contactAt:s.time+.04,remaining:.2};
 s.players[0].x=0;s.players[0].z=3;game.aiInput(s,2,'hard',[{prepare:'clear'}]);
 assert.equal(s._doublesAI[0].primary,2);
});
test('body contact at a corner leaves a tangent escape and bounded positions',()=>{
 const s=incoming(); s.shuttle.y=30; Object.assign(s.players[0],{x:2.89,z:6.54});Object.assign(s.players[2],{x:2.29,z:6.54});
 for(let i=0;i<30;i++) game.stepMatch(s,[{x:1,z:1},{},{x:1}],.02);
 assert.ok(s.players[0].x<=2.89&&s.players[0].z<=6.54);assert.ok(s.players[2].x<=2.30);
 const before=s.players[0].z;for(let i=0;i<10;i++) game.stepMatch(s,[{x:-1,z:-1}],.02);
 assert.ok(s.players[0].z<before-.1);
});
test('same-time contact chooses nearer player before tie rotation',()=>{
 const s=incoming(); s.players[0].x=-1;s.players[2].x=.2;
 for(const slot of [0,2]) s.players[slot].pendingShot={shot:'clear',aim:0,aimDepth:0,charge:0,remaining:.3,contactAt:.01};
 game.stepMatch(s,[],.02);assert.equal(s.shuttle.lastHitPlayer,2);
});
test('same-team slots share identical shot geometry and fatigue drift',()=>{
 const s=incoming();s.players[2]={...s.players[0],stamina:8,vx:3};s.players[0]={...s.players[2]};
 const a=game.getShotTarget(s,0,{shot:'clear',aim:.7,aimDepth:.5,charge:1});
 const b=game.getShotTarget(s,2,{shot:'clear',aim:.7,aimDepth:.5,charge:1});
 assert.equal(a.vz,b.vz);assert.equal(a.vx,b.vx);
});
test('AI rescues reachable ball beside idle human instead of yielding until floor',()=>{
 const s=incoming();s.players[0].x=0;s.players[2].x=.65;
 for(let i=0;i<60&&s.hitId===0&&s.phase==='rally';i++) {
  const input=game.aiInput(s,2,'hard',[{}]);game.stepMatch(s,[{},{},input],1/120);
 }
 assert.equal(s.shuttle.lastHitPlayer,2);assert.ok(s.hitId>0);
});
test('each difficulty pays one reaction delay and a reassignment pays only one',()=>{
 for(const difficulty of ['easy','medium','hard']) {
  const s=incoming();s.players[0].x=0;s.players[2].x=.65;
  const delay=game.getDifficultyProfile(difficulty).reaction;
  assert.equal(game.aiInput(s,2,difficulty,[{}]).shot,null);
  s.time=delay-.001;assert.equal(game.aiInput(s,2,difficulty,[{}]).shot,null);
  s.time=delay;assert.ok(game.aiInput(s,2,difficulty,[{}]).shot);
 }
 const s=incoming();s.players[0].x=0;s.players[2].x=.65;
 game.aiInput(s,2,'hard',[{prepare:'clear'}]);s.time=.1;
 assert.equal(game.aiInput(s,2,'hard',[{}]).shot,null);
 s.time=.17;assert.ok(game.aiInput(s,2,'hard',[{}]).shot);
});
test('reachable human actual approach still claims reception without held controls',()=>{
 const s=incoming();s.players[0].x=-1;s.players[0].vx=2;s.players[2].x=.65;
 game.aiInput(s,2,'hard',[{}]);assert.equal(s._doublesAI[0].primary,0);
});
test('partner pause consumes the team quota and preserves team attribution',()=>{
 for(const slot of [2,3]) {
  const s=create();assert.equal(game.pauseMatch(s,slot),true);assert.equal(s.pause.by,slot%2);assert.equal(s.pause.used[slot%2],1);
  game.resumeMatch(s);for(let i=0;i<9;i++)game.stepMatch(s,[],.25);
  assert.equal(game.pauseMatch(s,slot%2),false);
 }
});
