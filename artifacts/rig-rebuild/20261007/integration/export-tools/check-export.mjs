// Whole-surface, all-frame GLTFLoader parity. No geometric acceptance is implied.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {GLTFLoader} from '../../../../../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {AnimationMixer,LoopOnce,Vector3,Matrix4} from '../../../../../node_modules/three/build/three.module.js';
globalThis.ProgressEvent??=class{constructor(t,o){Object.assign(this,o)}};
const dir=path.resolve(process.argv[2]||'.'), file=n=>path.join(dir,n), sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const assert=(x,m)=>{if(!x)throw Error(m);};
const f=JSON.parse(fs.readFileSync(file('fixture.json'))),glb=fs.readFileSync(file('clear.glb'));
assert(f.schema==='rally-full-export-v1','Unsupported fixture schema');
assert(f.sampleCount===961&&f.fps===120&&f.sampleStepFrames===.5&&f.frameStart===0&&f.frameEnd===480&&f.durationSeconds===4,'Exact sample coverage contract');
assert(f.rackets.length===8&&f.markers.length>=4&&f.body.vertexCount>0,'Nonempty complete source fixture');
assert(f.glbSHA256===sha(glb),'GLB hash mismatch');
assert(f.sourceSHA256===sha(fs.readFileSync(f.source)),'Source changed since fixture creation');
assert(f.exporterSHA256===sha(fs.readFileSync(new URL('./export.py',import.meta.url))),'Exporter changed since fixture creation');
assert(f.checkerSHA256===sha(fs.readFileSync(fileURLToPath(import.meta.url))),'Checker changed since fixture creation');
assert(f.compression.samples===961&&f.compression.surfaceKeys===961&&f.compression.preservesIndependentHalfFrameCorrectives===true&&f.compression.passed&&f.compression.maxErrorM<2e-6,'Compression gate including independent half-frame corrections');
function floats(info,expected){const b=fs.readFileSync(file(info.file));assert(b.length===expected*4&&info.count===expected&&info.bytes===b.length,'Binary exact length '+info.file);assert(sha(b)===info.sha256,'Binary hash '+info.file);const a=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));for(const x of a)assert(Number.isFinite(x),'Nonfinite '+info.file);return a;}
const bodyBind=floats(f.body.bind,f.body.vertexCount*3),bodyWorld=floats(f.body.world,961*f.body.vertexCount*3);
const staticGeometry=f.rackets.map(x=>floats(x.local,x.vertexCount*3));
const rigidMatrices=floats(f.racketWorldMatrices,961*8*16),markerMatrices=floats(f.markerWorldMatrices,961*f.markers.length*16);
const g=await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');
assert(g.animations.length===1,'Exactly one merged bone+morph clip required');
const clip=g.animations[0];assert(Math.abs(clip.duration-4)<1e-6,'Duration must be 4 seconds');assert(clip.tracks.length>0,'Empty animation');
assert(clip.tracks.some(t=>t.name.includes('morphTargetInfluences')),'Missing morph track');
for(const t of clip.tracks){assert(t.times.length>0&&t.values.length>0,'Empty track '+t.name);for(const v of [...t.times,...t.values])assert(Number.isFinite(v),'Nonfinite track '+t.name);}
const named=n=>{const a=[];g.scene.traverse(o=>{if(o.name===n)a.push(o)});assert(a.length===1,'Unique object required '+n+' count '+a.length);return a[0];};
const descendantMeshes=o=>{const a=[];o.traverse(x=>{if(x.isMesh)a.push(x)});assert(a.length>0,'No geometry '+o.name);return a;};
const meshGroups=[{name:f.body.name,source:bodyBind,vertexCount:f.body.vertexCount,objects:descendantMeshes(named(f.body.name)),body:true},...f.rackets.map((x,i)=>({name:x.name,source:staticGeometry[i],vertexCount:x.vertexCount,objects:descendantMeshes(named(x.name)),racketIndex:i}))];
for(const obj of meshGroups[0].objects)assert(obj.geometry.morphAttributes.position?.length===961&&obj.morphTargetInfluences?.length===961,'Missing full 240 Hz corrective surface coverage');
const seen=new Set(meshGroups.flatMap(x=>x.objects));g.scene.traverse(o=>{if(o.isMesh)assert(seen.has(o),'Unexpected unverified mesh '+o.name)});
for(const x of f.rackets)assert(named(x.name).userData.rally_asset_role==='racket','Lost racket role '+x.name);
const markers=f.markers.map(named),root=named('Racket_GripCenter');let p=root.parent,hasBone=false;while(p){if(p.name===f.requiredBoneParent)hasBone=true;p=p.parent;}assert(hasBone,'Racket no longer attached under hand bone');

// A source vertex can be duplicated by UV seams or material primitives. Match EVERY
// exported split, and mark EVERY coincident original vertex as covered. Comparing
// against all coincident candidates also detects any unequal moving seam surfaces.
function correspond(group,obj){
 const a=obj.geometry.attributes.position;assert(a&&a.count>0,'Missing positions '+obj.name);
 const bins=new Map(),key=(x,y,z)=>`${x},${y},${z}`,q=1e-6;
 for(let i=0;i<group.vertexCount;i++){const k=key(Math.round(group.source[i*3]/q),Math.round(group.source[i*3+1]/q),Math.round(group.source[i*3+2]/q));if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i);}
 const map=[];
 for(let i=0;i<a.count;i++){
  const v=[a.getX(i),a.getY(i),a.getZ(i)];assert(v.every(Number.isFinite),'Nonfinite bind');const cell=v.map(x=>Math.round(x/q)),ids=[];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)for(const j of bins.get(key(cell[0]+dx,cell[1]+dy,cell[2]+dz))||[]){let d=0;for(let c=0;c<3;c++)d+=(v[c]-group.source[j*3+c])**2;if(d<1e-12)ids.push(j);}
  assert(ids.length>0,'Unmapped exported vertex '+group.name+' '+i);map.push(ids);for(const j of ids)group.coverage.add(j);
 }
 return {obj,map};
}
for(const group of meshGroups){group.coverage=new Set();group.parts=group.objects.map(o=>correspond(group,o));assert(group.coverage.size===group.vertexCount,'Incomplete original vertex coverage '+group.name);}
const mixer=new AnimationMixer(g.scene),action=mixer.clipAction(clip);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
const v=new Vector3(),delta=new Vector3(),expected=new Vector3(),expectedMatrix=new Matrix4(),actualProbe=new Vector3(),wantedProbe=new Vector3();
const probes=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]];
const rows=[],markerRows=[];let globalMax=0,globalMarkerMax=0;
for(let sample=0;sample<961;sample++){
 const frame=sample/2;mixer.setTime(frame/120);g.scene.updateMatrixWorld(true);
 for(const group of meshGroups){let max=0;
  if(!group.body)expectedMatrix.fromArray(rigidMatrices,(sample*8+group.racketIndex)*16);
  for(const {obj,map}of group.parts){if(obj.skeleton)obj.skeleton.update();const geo=obj.geometry,attr=geo.attributes.position,morphs=geo.morphAttributes.position||[],active=[];
   for(let i=0;i<(obj.morphTargetInfluences?.length||0);i++){const w=obj.morphTargetInfluences[i];assert(Number.isFinite(w),'Nonfinite morph influence');if(w!==0)active.push([morphs[i],w]);}
   for(let i=0;i<attr.count;i++){
    v.fromBufferAttribute(attr,i);const bx=v.x,by=v.y,bz=v.z;
    // Equivalent to THREE.Mesh.getVertexPosition, without scanning 481 zero weights per vertex.
    for(const [m,w]of active){delta.fromBufferAttribute(m,i);if(!geo.morphTargetsRelative)delta.sub(new Vector3(bx,by,bz));v.addScaledVector(delta,w);}
    if(obj.isSkinnedMesh)obj.applyBoneTransform(i,v);v.applyMatrix4(obj.matrixWorld);assert(Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z),'Nonfinite evaluated vertex');
    for(const j of map[i]){
     if(group.body)expected.fromArray(bodyWorld,(sample*group.vertexCount+j)*3);
     else expected.fromArray(group.source,j*3).applyMatrix4(expectedMatrix);
     max=Math.max(max,v.distanceTo(expected));
    }
   }
  }
  rows.push({frame,mesh:group.name,maxErrorM:max,passed:max<1e-5});globalMax=Math.max(globalMax,max);
 }
 for(let mi=0;mi<markers.length;mi++){expectedMatrix.fromArray(markerMatrices,(sample*markers.length+mi)*16);let max=0;
  for(const probe of probes){actualProbe.fromArray(probe).applyMatrix4(markers[mi].matrixWorld);wantedProbe.fromArray(probe).applyMatrix4(expectedMatrix);const d=actualProbe.distanceTo(wantedProbe);assert(Number.isFinite(d),'Nonfinite marker');max=Math.max(max,d);}
  markerRows.push({frame,marker:markers[mi].name,maxErrorM:max,passed:max<1e-5});globalMarkerMax=Math.max(globalMarkerMax,max);
 }
 if(sample%120===0)console.log(JSON.stringify({frame,meshMaxM:globalMax,markerMaxM:globalMarkerMax}));
}
assert(rows.length===961*9&&markerRows.length===961*markers.length,'Output coverage count mismatch');
const passed=rows.every(x=>x.passed)&&markerRows.every(x=>x.passed);
const report={schema:'rally-full-parity-v1',scope:f.scope,source:f.source,sourceSHA256:f.sourceSHA256,exporterSHA256:f.exporterSHA256,checkerSHA256:f.checkerSHA256,glbSHA256:f.glbSHA256,clip:clip.name,clips:1,durationSeconds:clip.duration,samples:961,sampleHz:240,thresholdM:1e-5,compression:f.compression,meshes:meshGroups.map(x=>({name:x.name,sourceVertices:x.vertexCount,coveredSourceVertices:x.coverage.size,exportedVertices:x.objects.reduce((n,o)=>n+o.geometry.attributes.position.count,0),primitiveCount:x.parts.length})),markers:f.markers,boneAttachmentVerified:true,maxErrorM:globalMax,maxMarkerErrorM:globalMarkerMax,rows,markerRows,passed};
fs.writeFileSync(file('export-parity.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed,samples:961,meshes:report.meshes.length,markers:report.markers.length,maxErrorM:globalMax,maxMarkerErrorM:globalMarkerMax}));assert(passed,'Parity failed: inspect export-parity.json');
