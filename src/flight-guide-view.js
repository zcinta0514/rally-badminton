import * as THREE from 'three';
import {getFlightGuide} from './flight-guide.js';

/** One fixed buffer, no new meshes or GPU allocations during rallies. */
export class FlightGuideView {
 constructor(scene) {
  this.positions=new Float32Array(768*3);this.colors=new Float32Array(768*3);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,3).setUsage(THREE.DynamicDrawUsage));
  this.line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.65,depthWrite:false,toneMapped:false}));
  this.line.name='flight-guide';this.line.frustumCulled=false;this.line.visible=false;scene.add(this.line);
 }
 clear(){this.line.visible=false;this.key=null;this.age=0;}
 update(state,side,info,{freeze=false,reset=false,hidden=false,dt=0}={}) {
  if(reset||this.side!==side)this.clear();this.side=side;
  if(hidden||!['serve','rally','paused','countdown'].includes(state.phase)){this.clear();return;}
  if(freeze)return;
  const guide=getFlightGuide(state,side,info);
  if(!guide){this.clear();return;}
  if(guide.key!==this.key){this.key=guide.key;this.age=0;}
  this.age+=Math.max(0,dt);
  const color=new THREE.Color(guide.kind==='aim'?0xffb5ce:0x8be9ef);
  const points=guide.points,total=points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y,p.z-points[i].z),0);
  let distance=0,count=0;
  const period=.32,dash=.19;
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
     const fade=.95-.7*Math.pow((distance+d)/Math.max(.001,total),2);
     this.colors[k]=color.r*fade;this.colors[k+1]=color.g*fade;this.colors[k+2]=color.b*fade;
    }
    offset=Math.max(end,offset+1e-6);
   }
   distance+=length;
  }
  this.line.geometry.attributes.position.needsUpdate=true;this.line.geometry.attributes.color.needsUpdate=true;
  this.line.geometry.setDrawRange(0,count);this.line.visible=count>0;
  this.line.material.opacity=(guide.kind==='aim'?.8-guide.risk*.18:.65)*Math.min(1,.4+this.age/.08);
  this.line.userData.kind=guide.kind;
 }
}
