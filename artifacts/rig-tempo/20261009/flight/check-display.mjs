// Validate the actual display module without editing it: deterministic rewind,
// cork anchoring, 4800Hz skirt/bed separation, opponent hide and net geometry.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
globalThis.ProgressEvent??=class{constructor(t,o){Object.assign(this,o)}};
const flightPath=path.resolve(process.argv[2]),exportDir=path.resolve(process.argv[3]),out=path.resolve(process.argv[4]);
const d=JSON.parse(fs.readFileSync(flightPath)),modulePath=path.resolve('artifacts/rig-tempo/20261009/flight-view.mjs'),runtimePath=path.resolve('artifacts/rig-tempo/20261009/flight/runtime.mjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
// Only resolve browser import aliases to their identical local module bytes.
const original=fs.readFileSync(modulePath,'utf8');
const code=original.replace("'three'",JSON.stringify(pathToFileURL(path.resolve('node_modules/three/build/three.module.js')).href)).replace("'/flight-runtime.mjs'",JSON.stringify(pathToFileURL(runtimePath).href));
const {createFlightView,addReferenceNet}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const scene=new T.Scene(),view=createFlightView(scene,d),shuttle=scene.children[0],skirt=shuttle.children.find(o=>o.geometry?.type==='CylinderGeometry');
assert(shuttle.isGroup&&skirt,'Actual display module did not create the expected cork/skirt group');
const glb=fs.readFileSync(path.join(exportDir,'clear.glb'));
if(d.glbSHA256)assert.equal(sha(glb),d.glbSHA256);
const g=await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.byteLength),'');
const mixer=new T.AnimationMixer(g.scene),action=mixer.clipAction(g.animations[0]);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
const marker=g.scene.getObjectByName('Racket_ContactPoint'),normalMarker=g.scene.getObjectByName('Racket_FaceNormal'),root=g.scene.getObjectByName('Racket_GripCenter');
const rowAt=t=>{view.update(t,true);scene.updateMatrixWorld(true);return {time:t,position:shuttle.position.toArray(),quaternion:shuttle.quaternion.toArray(),visible:shuttle.visible}};
const baseline=[d.hitTime-.02,d.hitTime-1e-6,d.hitTime,d.hitTime+.008,d.hitTime+.024,d.hitTime+.065,d.hitTime+.09].map(rowAt);
let rewindError=0;
for(const row of [...baseline].reverse()){
 const after=rowAt(row.time);rewindError=Math.max(rewindError,...row.position.map((v,i)=>Math.abs(v-after.position[i])),...row.quaternion.map((v,i)=>Math.abs(v-after.quaternion[i])));
}
const old=new T.Quaternion(...rowAt(d.hitTime-1e-6).quaternion),now=new T.Quaternion(...rowAt(d.hitTime+1e-6).quaternion);
const impactOrientationJumpRad=old.angleTo(now);
let minSignedSkirtToPlane=Infinity,maxAngularStep=0,last=null;const rows=[],bedIntersections=[];
const dimensions=d.contact.racketDimensions,bedX=dimensions.head_width/2-dimensions.frame_radial_radius,bedY=dimensions.head_height/2-dimensions.frame_radial_radius,bedCenter=dimensions.head_tip-dimensions.head_height/2;
function intersectsFiniteBed(vertices,mesh,center,normal){
 const inverse=root.matrixWorld.clone().invert(),index=mesh.geometry.index,triCount=index?index.count:vertices.length;
 const inEllipse=(a,b)=>{
  const p=a.clone().applyMatrix4(inverse),q=b.clone().applyMatrix4(inverse);
  const x=p.x/bedX,y=(p.y-bedCenter)/bedY,dx=(q.x-p.x)/bedX,dy=(q.y-p.y)/bedY;
  const length=dx*dx+dy*dy,u=length?T.MathUtils.clamp(-(x*dx+y*dy)/length,0,1):0;
  return (x+u*dx)**2+(y+u*dy)**2<=1;
 };
 for(let i=0;i<triCount;i+=3){
  const triangle=[0,1,2].map(j=>vertices[index?index.getX(i+j):i+j]);
  const signed=triangle.map(p=>p.clone().sub(center).dot(normal));
  for(const offset of [-.00071,0,.00071]){
   const crossings=[];
   for(let edge=0;edge<3;edge++){
    const j=(edge+1)%3,a=signed[edge]-offset,b=signed[j]-offset;
    if(Math.abs(a)<1e-12)crossings.push(triangle[edge]);
    if(a*b<0)crossings.push(triangle[edge].clone().lerp(triangle[j],a/(a-b)));
   }
   if(crossings.length===1&&inEllipse(crossings[0],crossings[0]))return true;
   if(crossings.length>=2&&inEllipse(crossings[0],crossings[1]))return true;
  }
 }
 return false;
}
for(let i=-240;i<=480;i++){
 const time=d.hitTime+i/4800;rowAt(time);mixer.setTime(time);g.scene.updateMatrixWorld(true);
 const center=marker.getWorldPosition(new T.Vector3()),normal=normalMarker.getWorldPosition(new T.Vector3()).sub(center).normalize();
 const a=skirt.geometry.attributes.position;let min=Infinity;const vertices=[];
 for(let j=0;j<a.count;j++){const p=new T.Vector3().fromBufferAttribute(a,j).applyMatrix4(skirt.matrixWorld);vertices.push(p);min=Math.min(min,p.clone().sub(center).dot(normal));}
 const bedCross=intersectsFiniteBed(vertices,skirt,center,normal);if(bedCross)bedIntersections.push(time);
 minSignedSkirtToPlane=Math.min(minSignedSkirtToPlane,min);
 if(last)maxAngularStep=Math.max(maxAngularStep,last.angleTo(shuttle.quaternion));last=shuttle.quaternion.clone();
 rows.push({time,minimumSkirtVertexSignedBedDistanceM:min,finiteStringBedIntersection:bedCross});
}
view.update(d.nextOpponentContactTime+.01,false);const hiddenAfterOpponent=!shuttle.visible;
view.update(d.nextOpponentContactTime+.01,true);const extrapolationShowsShuttle=shuttle.visible;
view.update(d.incoming[0].time-.01,false);const hiddenBeforeFeed=!shuttle.visible;
const netScene=new T.Scene();addReferenceNet(netScene,d.court);const tape=netScene.children.find(o=>o.isMesh);
const tapeTopY=tape.position.y+tape.geometry.parameters.height/2,physicalNetTopY=d.court.groundY+d.court.netHeight;
const gates={seekIndependent:rewindError<1e-12,noInstantFlip:impactOrientationJumpRad<.001,
  skirtDoesNotCrossFiniteBed:bedIntersections.length===0,continuousAngularSampling:maxAngularStep<.03,
  hiddenAfterOpponent,extrapolationShowsShuttle,hiddenBeforeFeed,netTopMatchesPhysics:Math.abs(tapeTopY-physicalNetTopY)<1e-12};
const report={schema:'rally-flight-display-qa-v1',flightSHA256:sha(fs.readFileSync(flightPath)),glbSHA256:sha(glb),
  checkerSHA256:sha(fs.readFileSync(new URL(import.meta.url))),
  displayModuleSHA256:sha(original),runtimeModuleSHA256:sha(fs.readFileSync(runtimePath)),
  samples:rows.length,sampleHz:4800,windowSeconds:[-.05,.1],rewindError,impactOrientationJumpRad,
  minimumSkirtVertexSignedBedDistanceM:minSignedSkirtToPlane,maxAngularStepRad:maxAngularStep,
  tapeTopY,physicalNetTopY,bedIntersections,gates,passed:Object.values(gates).every(Boolean),keyStates:baseline,rows,
  limits:['The8—65ms feather flip is an authored visual response, not measured shuttle rotational dynamics.',
  'Every rendered skirt triangle is intersected with the moving finite stringbed ellipse slab±0.71mm. Crossings of the infinite plane outside the ellipse are not collisions.',
  'No full feather/body aerodynamic or collision certification.']};
fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,keyStates:undefined,rows:undefined},null,2));
assert(report.passed,'球路显示核对未通过，详见 '+out);
