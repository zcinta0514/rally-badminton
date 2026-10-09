// Actual GLTFLoader contact geometry, seek and source-marker parity.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {GLTFLoader} from '../../../../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {AnimationMixer,LoopOnce,Vector3,Triangle} from '../../../../node_modules/three/build/three.module.js';
import {sampleFlight} from './runtime.mjs';
globalThis.ProgressEvent??=class{constructor(t,o){Object.assign(this,o)}};
const dir=path.resolve(process.argv[2]), flightPath=path.resolve(process.argv[3]);
const reportPath=process.argv[4]||path.join(path.dirname(flightPath),'glb-contact-qa.json');
const data=JSON.parse(fs.readFileSync(flightPath)),extraction=JSON.parse(fs.readFileSync(data.racketExtraction));
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'), assert=(v,m)=>{if(!v)throw Error(m)};
const bytes=fs.readFileSync(path.join(dir,'clear.glb')),fixture=JSON.parse(fs.readFileSync(path.join(dir,'fixture.json')));
assert(sha(bytes)===fixture.glbSHA256,'GLB differs from its source fixture');
if(data.glbSHA256)assert(data.glbSHA256===sha(bytes),'Flight GLB hash mismatch');
assert(fixture.sourceSHA256===data.sourceSHA256,'Flight was built for a different source');
assert(sha(fs.readFileSync(data.source))===data.sourceSHA256,'Source changed after flight creation');
assert(sha(fs.readFileSync(data.racketExtraction))===data.racketExtractionSHA256,'Extraction changed');
const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const unique=name=>{const out=[];model.scene.traverse(o=>{if(o.name===name)out.push(o)});assert(out.length===1,'Expected unique '+name);return out[0]};
const center=unique('Racket_ContactPoint'),normalMarker=unique('Racket_FaceNormal'),root=unique('Racket_GripCenter');
const strings=unique(data.contact.stringMesh);let stringParts=[];strings.traverse(o=>{if(o.isMesh)stringParts.push(o)});
assert(stringParts.length,'Missing actual strings geometry');
assert(model.animations.length===1&&Math.abs(model.animations[0].duration-4)<1e-6,'Expected 4s authoring clock');
const mixer=new AnimationMixer(model.scene),action=mixer.clipAction(model.animations[0]);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
const pose=t=>{action.enabled=true;action.paused=false;mixer.setTime(t);model.scene.updateMatrixWorld(true)};
const nativeToGltf=a=>new Vector3(a[0],a[2],-a[1]);
const localSurface=nativeToGltf(data.contact.localSurfaceNative),rows=[];
let maxMarker=0,maxSurface=0,maxNormal=0,maxExportMarker=0,maxExportSurface=0;
for(const expected of extraction.rows){
  pose(expected.time);
  const actual=center.getWorldPosition(new Vector3()),normal=normalMarker.getWorldPosition(new Vector3()).sub(actual).normalize();
  const surface=localSurface.clone().applyMatrix4(root.matrixWorld);
  const e=actual.distanceTo(new Vector3(...expected.center)),se=surface.distanceTo(new Vector3(...expected.surface));
  const angle=normal.angleTo(new Vector3(...expected.normal));
  maxMarker=Math.max(maxMarker,e);maxSurface=Math.max(maxSurface,se);maxNormal=Math.max(maxNormal,angle);
  if(Math.abs(expected.time*240-Math.round(expected.time*240))<1e-7){maxExportMarker=Math.max(maxExportMarker,e);maxExportSurface=Math.max(maxExportSurface,se)}
  rows.push({time:expected.time,centerErrorM:e,surfaceErrorM:se,normalErrorRad:angle});
}
function stringDistance(p){
 let min=Infinity,closest=null;
 const triangle=new Triangle(),out=new Vector3();
 for(const mesh of stringParts){
  const local=p.clone().applyMatrix4(mesh.matrixWorld.clone().invert()),a=mesh.geometry.attributes.position,idx=mesh.geometry.index;
  const count=idx?idx.count:a.count;
  for(let i=0;i<count;i+=3){
   triangle.a.fromBufferAttribute(a,idx?idx.getX(i):i);triangle.b.fromBufferAttribute(a,idx?idx.getX(i+1):i+1);triangle.c.fromBufferAttribute(a,idx?idx.getX(i+2):i+2);
   triangle.closestPointToPoint(local,out);const world=out.clone().applyMatrix4(mesh.matrixWorld),distance=p.distanceTo(world);
   if(distance<min){min=distance;closest=world.toArray()}
  }
 }
 return {distance:min,closest};
}
const dense=[];let minGap=Infinity;
for(let i=-240;i<=240;i++){
 const t=data.hitTime+i/4800;pose(t);const p=new Vector3(...sampleFlight(data,t).p),near=stringDistance(p),gap=near.distance-data.contact.corkRadius;
 minGap=Math.min(minGap,gap);dense.push({time:t,gapM:gap});
}
pose(data.hitTime);const contact=stringDistance(new Vector3(...sampleFlight(data,data.hitTime).p));
const velocityDt=1/4800;
pose(data.hitTime-velocityDt);const surfaceBefore=localSurface.clone().applyMatrix4(root.matrixWorld);
pose(data.hitTime+velocityDt);const surfaceAfter=localSurface.clone().applyMatrix4(root.matrixWorld);
const glbVelocity=surfaceAfter.sub(surfaceBefore).divideScalar(2*velocityDt);
pose(data.hitTime);const glbCenter=center.getWorldPosition(new Vector3()),glbNormal=normalMarker.getWorldPosition(new Vector3()).sub(glbCenter).normalize();
const incomingVelocity=new Vector3(...data.contact.shuttleIncoming),relative=incomingVelocity.clone().sub(glbVelocity);
const glbOutgoing=incomingVelocity.clone().addScaledVector(glbNormal,-(1+data.contact.restitution)*relative.dot(glbNormal));
const velocityError=glbVelocity.distanceTo(new Vector3(...data.contact.racketVelocity));
const outgoingError=glbOutgoing.distanceTo(new Vector3(...data.contact.shuttleOutgoing));
function integrateOutgoing(velocity){
 const deriv=s=>{const speed=Math.hypot(...s.slice(3)),k=data.physics.quadraticDrag;return [...s.slice(3),-k*speed*s[3],-data.physics.gravity-k*speed*s[4],-k*speed*s[5]]};
 const step=(s,dt)=>{const a=deriv(s),b=deriv(s.map((v,i)=>v+dt*a[i]/2)),c=deriv(s.map((v,i)=>v+dt*b[i]/2)),e=deriv(s.map((v,i)=>v+dt*c[i]));return s.map((v,i)=>v+dt*(a[i]+2*b[i]+2*c[i]+e[i])/6)};
 let state=[...data.contact.corkCenter,...velocity],time=data.hitTime,net=null;
 const floor=data.court.groundY+data.contact.corkRadius;
 for(let i=0;i<480*8;i++){
  const old=state;state=step(state,1/480);time+=1/480;
  if(old[0]<=data.court.netX&&state[0]>=data.court.netX){const u=(data.court.netX-old[0])/(state[0]-old[0]);net={time:time-(1-u)/480,p:old.slice(0,3).map((v,i)=>v+u*(state[i]-v))}}
  if(state[1]<=floor){const u=(old[1]-floor)/(old[1]-state[1]);return {landingTime:time-(1-u)/480,landing:old.slice(0,3).map((v,i)=>v+u*(state[i]-v)),net}}
 }
 throw Error('ActualGLB impact did not produce a landing within8s');
}
const glbFlight=integrateOutgoing(glbOutgoing.toArray()),landingDifference=new Vector3(...glbFlight.landing).distanceTo(new Vector3(...data.metrics.landing));
const glbNetClearance=glbFlight.net ? glbFlight.net.p[1]-data.contact.corkRadius-data.court.groundY-data.court.netHeight : -Infinity;
const netDifference=glbFlight.net&&data.metrics.netSample?new Vector3(...glbFlight.net.p).distanceTo(new Vector3(...data.metrics.netSample.p)):Infinity;
// Seek backwards and across the impact explicitly; never integrate display state.
const seeks=[2.4,.32,data.hitTime+.01,data.hitTime-.01,data.hitTime,0,2.4,data.hitTime];
const seeksFinite=seeks.every(t=>{pose(t);return sampleFlight(data,t).p.every(Number.isFinite)});
const contactGap=contact.distance-data.contact.corkRadius;
const gates={sourceAndGLBHashes:true,export240HzMarkerParity:maxExportMarker<1e-5,export240HzContactPointParity:maxExportSurface<1e-5,
 interpolatedMarkerBound:maxMarker<.0002,interpolatedContactPointBound:maxSurface<.0002,
 actualGLBStringContact:Math.abs(contactGap)<1e-5,noDenseGLBStringPenetration:minGap>=-1e-5,
 actualGLBOutgoingVelocityConsistent:outgoingError<.1,
 actualGLBFlightOverNet:glbNetClearance>0,
 actualGLBLandingInsideSingles:glbFlight.landing[0]>data.court.netX&&glbFlight.landing[0]<data.court.farBaseline-data.contact.corkRadius&&Math.abs(glbFlight.landing[2])+data.contact.corkRadius<data.court.singlesHalfWidth,
 actualGLBFlightMatchesSource:landingDifference<.05&&netDifference<.05,
 seekIndependentAndFinite:seeksFinite,ballisticGates:data.passed};
const report={schema:'rally-glb-contact-v1',sourceSHA256:data.sourceSHA256,glbSHA256:sha(bytes),
 checkerSHA256:sha(fs.readFileSync(new URL(import.meta.url))),
 flightSHA256:sha(fs.readFileSync(flightPath)),samples:rows.length,thresholdM:1e-5,
 maximumMarkerErrorM:maxMarker,maximumContactPointErrorM:maxSurface,maximumNormalErrorRad:maxNormal,
 maximumExport240HzMarkerErrorM:maxExportMarker,maximumExport240HzContactPointErrorM:maxExportSurface,
 interpolationThresholdM:.0002,
 contact:{time:data.hitTime,actualStringPoint:contact.closest,gapM:contactGap},denseMinimumStringGapM:minGap,
 glbContactVelocityMps:glbVelocity.toArray(),sourceVelocityErrorMps:velocityError,
 glbDerivedOutgoingMps:glbOutgoing.toArray(),sourceOutgoingErrorMps:outgoingError,outgoingVelocityThresholdMps:.1,
 glbDerivedFlight:glbFlight,glbNetClearanceM:glbNetClearance,netPositionDifferenceM:netDifference,
 landingPositionDifferenceM:landingDifference,flightPositionThresholdM:.05,
 denseHz:4800,denseWindowSeconds:.1,rows,dense,gates,passed:Object.values(gates).every(Boolean),
 limits:['ActualGLTFLoader geometry and timed transforms checked; full-body/8-racket source geometry has a separate swept report.',
 'Original240Hz export parity remains10micrometres. Extra subframe480/4800Hz interpolation is independently bounded at0.2mm and reported; this does not replace or relax the original export test.',
 'This is sampled cork geometry and ballistic consistency, not user visual acceptance or measured professional flight.']};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:undefined,dense:undefined},null,2));
assert(report.passed,'实际 GLB 触球核对失败，详见 '+reportPath);
