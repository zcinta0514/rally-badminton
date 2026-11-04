import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,getShotTarget,predictLanding,stepMatch} from '../shared/game.js';
import {createPwaBuild} from '../scripts/build-pwa.js';
function setup(side=0,z=1.3,y=1.05){const s=createMatch();s.phase='rally';const sign=side===0?1:-1;Object.assign(s.players[side],{x:0,z:sign*(z+.4)});Object.assign(s.shuttle,{x:0,y,z:sign*z,vx:0,vy:0,vz:0,active:true,lastHit:1-side});return s;}
test('demo preserves neutral/sideways/backward drop and all other shot targets',()=>{
 for(const side of [0,1])for(const shot of ['drop','clear','smash'])for(const aim of [-.7,0,.7])for(const depth of [-1,0,1]){
  if(shot==='drop'&&depth>0)continue;
  const s=setup(side),r={shot,aim,aimDepth:depth,charge:.35};
  assert.deepEqual(getShotTarget(s,side,r,{netDrag:true}),getShotTarget(s,side,r));
 }
});
test('forward drop extends smoothly to rear court, clears net and mirrors both ends',()=>{
 for(const side of [0,1]){const sign=side===0?1:-1,s=setup(side);let previous=0;
  for(const d of [0,.001,.25,.5,.75,1]){const r={shot:'drop',aim:.4*sign,aimDepth:d,charge:.2};const t=getShotTarget(s,side,r,{netDrag:true});
   const depth=-t.aimZ*sign;assert.ok(depth>previous);previous=depth;
   assert.ok(t.netHeight>1.52);const end=predictLanding({...s,shuttle:{...s.shuttle,vx:t.vx,vy:t.vy,vz:t.vz,lastHit:side}});
   assert.equal(end.event,'landing');assert.equal(end.out,false);assert.ok(Math.abs(end.z-t.aimZ)<1e-7);
  }
  assert.equal(previous,6.05);assert.equal(-getShotTarget(s,side,{shot:'drop',aimDepth:1}).aimZ*sign,3);
 }
});
test('rear court, high contacts and serve retain original behavior',()=>{
 for(const s of [setup(0,5.1,2.6),setup(0,1.3,2.4),createMatch()]){const r={shot:'drop',aim:.5,aimDepth:1,charge:.5};assert.deepEqual(getShotTarget(s,0,r,{netDrag:true}),getShotTarget(s,0,r));}
});

test('real match contact uses the same extended solution as aim preview on either side',()=>{
 for(const side of [0,1]){
  const s=setup(side);s.netDragSide=side;
  const request={shot:'drop',aim:side===0?.4:-.4,aimDepth:1,charge:.2};
  const preview=getShotTarget(s,side,request);
  stepMatch(s,side===0?[request,{}]:[{},request]);
  for(let i=0;i<40&&!s.lastShotInfo;i++)stepMatch(s,[{},{}]);
  assert.ok(s.lastShotInfo,'actual contact must occur');
  assert.equal(s.lastShotInfo.side,side);assert.equal(Math.abs(s.lastShotInfo.aimZ),6.05);
  assert.equal(s.lastShotInfo.aimZ,preview.aimZ);assert.equal(s.lastShotInfo.aimX,preview.aimX);
  assert.equal(predictLanding(s).out,false);assert.equal(predictLanding(s).event,'landing');
  for(let i=0;i<240&&s.pointId===0;i++)stepMatch(s,[{},{}]);
  assert.equal(s.pointId,1);assert.equal(s.netDragSide,side);
 }
});
test('match feature option is explicit, side-scoped and survives serialization',()=>{
 for(const value of [null,undefined,false,true,2,'0'])assert.equal(createMatch({netDragSide:value}).netDragSide,undefined);
 for(const side of [0,1]){
  const s=setup(side),request={shot:'drop',aimDepth:1,charge:.2};
  s.netDragSide=1-side;
  assert.equal(Math.abs(getShotTarget(s,side,request).aimZ),3);
  s.netDragSide=side;
  assert.equal(Math.abs(getShotTarget(JSON.parse(JSON.stringify(s)),side,request).aimZ),6.05);
 }
});
test('tap-only real matches remain byte-identical apart from the explicit feature option',()=>{
 const a=setup(),b=structuredClone(a);b.netDragSide=0;
 stepMatch(a,[{shot:'drop',aim:.4,charge:.2},{}]);stepMatch(b,[{shot:'drop',aim:.4,charge:.2},{}]);
 for(let i=0;i<300;i++){stepMatch(a,[{},{}]);stepMatch(b,[{},{}]);}
 const {netDragSide,...rest}=b;assert.deepEqual(rest,a);
});

test('contact lab dependencies resolve inside both root and Pages builds',async()=>{
 for(const basePath of ['/','/rally-badminton/']){
  const build=await createPwaBuild({basePath});
  const entry=new URL(basePath+'src/net-drag-demo.html','https://game.example');
  const html=build.assets.get(entry.pathname).toString();
  for(const match of html.matchAll(/(?:href|src)="([^"#]+)"/g))
   assert.ok(build.assets.has(new URL(match[1],entry).pathname));
  const {imports}=JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]);
  assert.ok(build.assets.has(new URL(imports.three,entry).pathname));
  assert.ok(build.assets.has(new URL(imports['three/addons/']+'loaders/GLTFLoader.js',entry).pathname));
 }
});
