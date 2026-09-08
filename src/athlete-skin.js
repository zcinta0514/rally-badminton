import * as THREE from 'three';

const UP=new THREE.Vector3(0,1,0),DOWN=new THREE.Vector3(0,-1,0);
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};

// Original procedural surfaces. A single draw carries the shirt and four
// uninterrupted limbs; auxiliary bend bones preserve elbow/knee cross-sections.
export function makeAthleteSkin(root,material,jersey,colors) {
  const parts=[],bones=[],limbs=[];
  function bone(name,position){const b=new THREE.Bone();b.name=`skin-${name}`;b.position.set(...position);root.add(b);bones.push(b);return bones.length-1;}
  const body={pelvis:bone('pelvis',[0,.92,0]),spine:bone('spine',[0,1.15,0]),chest:bone('chest',[0,1.43,0])};
  const attributes=(geometry,weights)=>{
    const indices=[],values=[];
    for(let i=0;i<geometry.getAttribute('position').count;i++){
      const [a,b,w]=weights(i);indices.push(a,b,0,0);values.push(1-w,w,0,0);
    }
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(values,4));
    parts.push(geometry);return geometry;
  };
  jersey.translate(0,1.15,0);
  attributes(jersey,i=>{
    const y=jersey.getAttribute('position').getY(i);
    return y<1.15?[body.pelvis,body.spine,smooth((y-.92)/.23)]:[body.spine,body.chest,smooth((y-1.15)/.28)];
  });
  for(const [name,sign]of [['left',-1],['right',1]])for(const kind of ['arm','leg']){
    const arm=kind==='arm',from=`${name}${arm?'Shoulder':'Hip'}`,joint=`${name}${arm?'Elbow':'Knee'}`,to=`${name}${arm?'Wrist':'Ankle'}`;
    const start=[sign*(arm?.245:.145),arm?1.435:.875,0],upper=arm?.32:.45,lower=arm?.31:.43;
    const bendPosition=[start[0],start[1]-upper,0];
    const upperBone=bone(`${name}-${kind}-upper`,start),bendBone=bone(`${name}-${kind}-bend`,bendPosition),lowerBone=bone(`${name}-${kind}-lower`,bendPosition);
    const radius=arm?.044:.054,band=arm?.072:.082;
    const rings=arm?[
      [-.065,.014],[-.05,.043],[-.025,.065],[0,.078],[.045,.078],[.095,.071],[.15,.059],
      [upper-band,.048],[upper-band/2,.045],[upper,radius],[upper+band/2,.044],[upper+band,.046],
      [upper+.15,.042],[upper+lower-.045,.031],[upper+lower,.028]
    ]:[
      [-.025,.069],[0,.093],[.075,.095],[.15,.09],[.25,.074],
      [upper-band,.060],[upper-band/2,.056],[upper,radius],[upper+band/2,.056],[upper+band,.063],
      [upper+.16,.064],[upper+.26,.05],[upper+lower-.035,.037],[upper+lower,.034]
    ];
    const sides=16,positions=[],rgb=[],indices=[];
    for(const [distance,r]of rings)for(let n=0;n<sides;n++){
      const angle=n/sides*Math.PI*2,x=Math.cos(angle)*r,z=Math.sin(angle)*r*(arm?.96:.94);
      positions.push(start[0]+x,start[1]-distance,z);
      const cloth=arm&&distance<.14,color=new THREE.Color(cloth?(distance>.095?colors.accent:colors.shirt):colors.skin);
      // A quiet seam is vertex colour, with no texture download or extra draw.
      if(cloth&&Math.abs(x)>.066)color.set(colors.dark);
      rgb.push(color.r,color.g,color.b);
    }
    for(let r=0;r<rings.length-1;r++)for(let n=0;n<sides;n++){
      const a=r*sides+n,b=r*sides+(n+1)%sides,c=a+sides,d=b+sides;
      indices.push(a,b,c,b,d,c);
    }
    // End caps are inside the shirt/hand/shoe. The elbow and knee have no caps
    // or duplicate rings: both sides literally share the same vertices.
    for(const [r,reverse]of [[0,true],[rings.length-1,false]])for(let n=1;n<sides-1;n++){
      const a=r*sides,b=a+n,c=b+1;indices.push(a,reverse?c:b,reverse?b:c);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    attributes(geometry,i=>{
      const distance=rings[Math.floor(i/sides)][0];
      return distance<=upper?[upperBone,bendBone,smooth((distance-upper+band)/band)]:[bendBone,lowerBone,smooth((distance-upper)/band)];
    });
    limbs.push({from,joint,to,upperBone,bendBone,lowerBone,sides,jointRing:rings.findIndex(([d])=>d===upper),jointRadius:radius,geometry});
  }
  const data={position:[],normal:[],color:[],skinIndex:[],skinWeight:[]},indices=[];
  let offset=0;
  for(const part of parts){
    const limb=limbs.find(l=>l.geometry===part);if(limb)limb.offset=offset;
    for(const key of Object.keys(data))data[key].push(...part.getAttribute(key).array);
    for(const i of part.index.array)indices.push(i+offset);
    offset+=part.getAttribute('position').count;part.dispose();
  }
  const geometry=new THREE.BufferGeometry();
  for(const [key,array]of Object.entries(data))geometry.setAttribute(key,key==='skinIndex'?new THREE.Uint16BufferAttribute(array,4):new THREE.Float32BufferAttribute(array,key==='skinWeight'?4:3));
  geometry.setIndex(indices);geometry.computeBoundingSphere();
  const skin=new THREE.SkinnedMesh(geometry,material);skin.name='athlete-continuous-skin';
  skin.castShadow=true;skin.receiveShadow=true;
  // Two players move their bodies beyond the bind-pose bounds on lunges/jumps.
  // Avoid per-frame CPU vertex skinning merely to recompute a frustum sphere.
  skin.frustumCulled=false;root.add(skin);root.updateMatrixWorld(true);
  skin.bind(new THREE.Skeleton(bones));
  skin.userData.limbs=limbs.map(({geometry,...limb})=>limb);
  const direction=new THREE.Vector3(),turn=new THREE.Quaternion(),trunkRotation=new THREE.Quaternion();
  const point=(b,p)=>b.position.set(p.x,p.y,p.z);
  skin.userData.updatePose=(joints,pose)=>{
    direction.set(joints.chest.x-joints.pelvis.x,joints.chest.y-joints.pelvis.y,joints.chest.z-joints.pelvis.z).normalize();
    trunkRotation.setFromUnitVectors(UP,direction);
    for(const [name,index]of Object.entries(body)){
      const b=bones[index];point(b,joints[name]);
      b.quaternion.identity().slerp(trunkRotation,name==='pelvis'?0:name==='spine'?.5:1);
      const yaw=name==='pelvis'?pose.pelvisYaw:name==='chest'?pose.chestYaw:(pose.pelvisYaw+pose.chestYaw)/2;
      b.quaternion.multiply(turn.setFromAxisAngle(UP,yaw-pose.heading));
    }
    for(const limb of limbs){
      const a=joints[limb.from],b=joints[limb.joint],c=joints[limb.to];
      const upper=bones[limb.upperBone],lower=bones[limb.lowerBone],bend=bones[limb.bendBone];
      point(upper,a);point(lower,b);point(bend,b);
      upper.quaternion.setFromUnitVectors(DOWN,direction.set(b.x-a.x,b.y-a.y,b.z-a.z).normalize());
      lower.quaternion.setFromUnitVectors(DOWN,direction.set(c.x-b.x,c.y-b.y,c.z-b.z).normalize());
      bend.quaternion.copy(upper.quaternion).slerp(lower.quaternion,.5);
    }
  };
  return skin;
}
