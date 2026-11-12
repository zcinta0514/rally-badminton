import * as THREE from 'three';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {getFlightGuide} from './flight-guide.js';

/** Thin screen-width strokes with a faint backing stay secondary to the shuttle.
 * Both draws share one fixed instance buffer; no GPU allocations during rallies. */
export class FlightGuideView {
 constructor(scene) {
  this.enabled=true;
  this.positions=new Float32Array(768*3);this.colors=new Float32Array(768*3);
  const geometry=new LineSegmentsGeometry().setPositions(this.positions).setColors(this.colors);
  geometry.attributes.instanceStart.data.setUsage(THREE.DynamicDrawUsage);
  geometry.attributes.instanceColorStart.data.setUsage(THREE.DynamicDrawUsage);
  geometry.instanceCount=0;
  this.line=new LineSegments2(geometry,new LineMaterial({vertexColors:true,linewidth:2,worldUnits:false,transparent:true,opacity:.82,depthWrite:false,toneMapped:false}));
  this.outline=new LineSegments2(geometry,new LineMaterial({color:0x14202c,linewidth:2.8,worldUnits:false,transparent:true,opacity:.18,depthWrite:false,toneMapped:false}));
  this.outline.name='flight-guide-outline';this.outline.frustumCulled=false;
  this.outline.renderOrder=4;this.line.renderOrder=5;this.line.add(this.outline);
  this.line.name='flight-guide';this.line.frustumCulled=false;this.line.visible=false;scene.add(this.line);
 }
 clear(){this.line.visible=false;this.key=null;this.age=0;}
 setEnabled(enabled){this.enabled=enabled!==false;if(!this.enabled)this.clear();}
 update(state,side,info,{freeze=false,reset=false,hidden=false,dt=0}={}) {
  if(!this.enabled){this.clear();return;}
  if(reset||this.side!==side)this.clear();this.side=side;
  if(hidden||!['serve','rally','paused','countdown'].includes(state.phase)){this.clear();return;}
  if(freeze)return;
  const guide=getFlightGuide(state,side,info);
  if(!guide){this.clear();return;}
  if(guide.key!==this.key){this.key=guide.key;this.age=0;}
  this.age+=Math.max(0,dt);
  const color=new THREE.Color(guide.kind==='aim'?0xffd2e3:0xb9f2ff);
  const points=guide.points,total=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y,p.z-points[i].z),0);
  let distance=0,count=0;
  const period=.56,dash=.28;
  for(let i=1;i<points.length;i++) {
   const a=points[i-1],b=points[i],length=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
   if(length<1e-8)continue;
   let offset=0;
   while(offset<length-1e-7&&count<766) {
    const phase=(distance+offset+1e-7)%period,on=phase<dash;
    const end=Math.min(length,offset+(on?dash:period)-phase);
    if(on)for(const d of [offset,end]) {
     const t=d/length,k=count++*3;
     this.positions[k]=a.x+(b.x-a.x)*t;this.positions[k+1]=Math.max(.04,a.y+(b.y-a.y)*t);this.positions[k+2]=a.z+(b.z-a.z)*t;
     const fade=.96-.42*Math.pow((distance+d)/Math.max(.001,total),2);
     this.colors[k]=color.r*fade;this.colors[k+1]=color.g*fade;this.colors[k+2]=color.b*fade;
    }
    offset=Math.max(end,offset+1e-6);
   }
   distance+=length;
  }
  this.line.geometry.attributes.instanceStart.data.needsUpdate=true;
  this.line.geometry.attributes.instanceColorStart.data.needsUpdate=true;
  this.line.geometry.instanceCount=count/2;this.line.visible=count>0;
  const appear=Math.min(1,.65+this.age/.12);
  this.line.material.linewidth=guide.kind==='aim'?2:1.65;
  this.outline.material.linewidth=this.line.material.linewidth+.8;
  this.line.material.opacity=(guide.kind==='aim'?.82:.72)*appear;this.outline.material.opacity=.18*appear;
  this.line.userData.kind=guide.kind;
 }
}
