// Extract the actual CPU-streamed Three.js geometry BETWEEN the 240 Hz export knots.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,LoopOnce,Vector3} from 'three';
import {prepare} from './morph-stream.mjs';
globalThis.ProgressEvent??=class{constructor(t,o){Object.assign(this,o);}};
const dir=path.resolve(process.argv[2]), out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const fixture=JSON.parse(fs.readFileSync(path.join(dir,'fixture.json'))),bytes=fs.readFileSync(path.join(dir,'clear.glb'));
assert.equal(sha(bytes),fixture.glbSHA256);assert.equal(sha(fs.readFileSync(fixture.source)),fixture.sourceSHA256);
const g=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const raw=fs.readFileSync(path.join(dir,fixture.body.bind.file));const bind=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const n=fixture.body.vertexCount,bins=new Map(),q=1e-6,key=(x,y,z)=>`${x},${y},${z}`;
for(let i=0;i<n;i++){const k=key(...Array.from(bind.subarray(i*3,i*3+3),v=>Math.round(v/q)));if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i);}
const parts=[],covered=new Set();
g.scene.getObjectByName(fixture.body.name).traverse(obj=>{if(!obj.isMesh)return;const a=obj.geometry.attributes.position,map=[];for(let i=0;i<a.count;i++){
  const v=[a.getX(i),a.getY(i),a.getZ(i)],c=v.map(x=>Math.round(x/q)),ids=[];
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const j of bins.get(key(c[0]+x,c[1]+y,c[2]+z))??[]){if(v.reduce((d,x,k)=>d+(x-bind[j*3+k])**2,0)<1e-12)ids.push(j);}
  assert.ok(ids.length,`Unmapped vertex ${i}`);map.push(ids);ids.forEach(x=>covered.add(x));
}parts.push({obj,map});});
assert.equal(covered.size,n);
assert.equal(fixture.rackets.length,8);assert.equal(new Set(fixture.rackets.map(x=>x.name)).size,8);
const racketRoles=[];g.scene.traverse(o=>{if(o.userData.rally_asset_role==='racket')racketRoles.push(o.name);});
assert.deepEqual(racketRoles.sort(),fixture.rackets.map(x=>x.name).sort());
const rackets=fixture.rackets.map(x=>g.scene.getObjectByName(x.name));assert.ok(rackets.every(Boolean));
const stream=prepare(g),mixer=new AnimationMixer(g.scene),action=mixer.clipAction(stream.clip);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
const v=new Vector3(),body=new Float32Array(n*3),matrices=new Float32Array(8*16);
const bodyFile=path.join(out,'body-world-480.f32'),racketFile=path.join(out,'racket-world-480.f32'),b=fs.openSync(bodyFile,'w'),r=fs.openSync(racketFile,'w');
let maximumExportSplitGapM=0;const splitRows=[];
try{for(let i=0;i<=1920;i++){
  const t=i/480;mixer.setTime(t);stream.update(t);g.scene.updateMatrixWorld(true);
  const written=new Uint8Array(n);let splitGap=0;
  for(const {obj,map} of parts){obj.skeleton?.update();for(let j=0;j<map.length;j++){obj.getVertexPosition(j,v).applyMatrix4(obj.matrixWorld);assert.ok(Number.isFinite(v.x+v.y+v.z));for(const id of map[j]){
    if(written[id])splitGap=Math.max(splitGap,Math.hypot(v.x-body[id*3],v.y-body[id*3+1],v.z-body[id*3+2]));
    else {body.set([v.x,v.y,v.z],id*3);written[id]=1;}
  }}}
  maximumExportSplitGapM=Math.max(maximumExportSplitGapM,splitGap);splitRows.push({time:t,maximumSplitGapM:splitGap});
  rackets.forEach((o,j)=>matrices.set(o.matrixWorld.elements,j*16));fs.writeSync(b,body);fs.writeSync(r,matrices);
  if(i%240===0)console.log(JSON.stringify({sample:i,time:t}));
}}finally{fs.closeSync(b);fs.closeSync(r);}
fs.writeFileSync(path.join(out,'runtime-fixture.json'),JSON.stringify({schema:'rally-runtime-dense-v1',samplerSHA256:sha(fs.readFileSync(new URL(import.meta.url))),sampleHz:480,samples:1921,source:fixture.source,sourceSHA256:fixture.sourceSHA256,glbSHA256:fixture.glbSHA256,bodyVertices:n,bodyFile:path.resolve(bodyFile),bodySHA256:sha(fs.readFileSync(bodyFile)),racketFile:path.resolve(racketFile),racketSHA256:sha(fs.readFileSync(racketFile)),rackets:fixture.rackets.map(x=>({...x,localFile:path.join(dir,x.local.file)})),maximumExportSplitGapM,splitComparisonPassed:maximumExportSplitGapM<1e-5,splitRows,moduleSHA256:sha(fs.readFileSync(new URL('./morph-stream.mjs',import.meta.url)))},null,2));
assert.ok(maximumExportSplitGapM<1e-5,'Actual exported UV/material splits exceed the original seam threshold');
