import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeAthlete,updateAthlete} from '../src/athlete.js';

const player={x:0,z:3.8,vx:0,vz:0};
const ball={x:.6,y:2.8,z:3.4};
const action={id:1,type:'smash',stage:'windup',startedAt:1,contactAt:1.2,endsAt:1.8,contact:ball,jumpHeight:.6};

test('one bounded GPU skin carries the jersey and all four continuous limbs',()=>{
  const rig=makeAthlete(new THREE.Scene(),0),skin=rig.skin;
  assert.ok(skin?.isSkinnedMesh);
  const skins=[];rig.root.traverse(o=>{if(o.isSkinnedMesh)skins.push(o);});
  assert.deepEqual(skins,[skin,rig.shorts],'body and continuous shorts have one draw each');
  assert.equal(rig.shorts.skeleton,skin.skeleton,'clothing reuses the body bones');
  assert.equal(rig.skeleton,skin.skeleton,'preview cleanup disposes the active skeleton');
  assert.ok(skin.skeleton.bones.length<=16);
  assert.ok(skin.geometry.getAttribute('position').count<3000);
  const weights=skin.geometry.getAttribute('skinWeight'),indices=skin.geometry.getAttribute('skinIndex');
  for(let i=0;i<weights.count;i++){
    assert.ok(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<1e-6);
    for(let j=0;j<4;j++)assert.ok(indices.array[i*4+j]<skin.skeleton.bones.length);
  }
  for(const limb of skin.userData.limbs){
    const joint=limb.jointRing*limb.sides+limb.offset;
    const triangles=skin.geometry.index.array;
    const touches=(start,end)=>{let found=false;for(let i=0;i<triangles.length;i+=3){const tri=triangles.slice(i,i+3);if(tri.some(v=>v>=joint&&v<joint+limb.sides)&&tri.some(v=>v>=start&&v<end)){found=true;break;}}return found;};
    assert.ok(touches(joint-limb.sides,joint)&&touches(joint+limb.sides,joint+2*limb.sides),'a single elbow/knee ring joins both sides');
  }
});

test('shorts stay joined from waist to both thighs with openings only at the waist and cuffs',()=>{
  const {shorts}=makeAthlete(new THREE.Scene(),0),geometry=shorts.geometry;
  const indices=geometry.index.array,positions=geometry.attributes.position,edges=new Map();
  for(let i=0;i<indices.length;i+=3){
    for(let side=0;side<3;side++){
      const a=indices[i+side],b=indices[i+(side+1)%3];
      const key=a<b?`${a},${b}`:`${b},${a}`;
      edges.set(key,(edges.get(key)??0)+1);
    }
  }
  let waistEdges=0,cuffEdges=0;
  for(const [edge,count] of edges){
    if(count===2)continue;
    assert.equal(count,1,'no edge carries overlapping panels');
    const ys=edge.split(',').map(i=>positions.getY(Number(i)));
    if(ys.every(y=>Math.abs(y-.924)<1e-5))waistEdges++;
    else if(ys.every(y=>Math.abs(y-.648)<1e-5))cuffEdges++;
    else assert.fail('open seam inside the garment');
  }
  assert.equal(waistEdges,32);
  assert.equal(cuffEdges,48);
});

test('bending preserves joint volume, finite surfaces, exact grip and frozen skin transforms',()=>{
  for(const side of [0,1]){
    const scene=new THREE.Scene(),rig=makeAthlete(scene,side),sign=side===0?1:-1;
    const contact={x:ball.x*sign,y:ball.y,z:ball.z*sign};
    updateAthlete(rig,{...player,z:player.z*sign,action:{...action,contact}},side,contact,1.2,1/60,true);
    scene.updateMatrixWorld(true);
    const skin=rig.skin;assert.ok(skin?.isSkinnedMesh);
    const position=skin.geometry.getAttribute('position');
    for(let i=0;i<position.count;i++){
      const p=skin.getVertexPosition(i,new THREE.Vector3());
      assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));
    }
    for(const limb of skin.userData.limbs){
      const ring=limb.offset+limb.jointRing*limb.sides;
      const a=skin.getVertexPosition(ring,new THREE.Vector3()),b=skin.getVertexPosition(ring+limb.sides/2,new THREE.Vector3());
      assert.ok(a.distanceTo(b)>limb.jointRadius*1.85,'bent elbow or knee cannot collapse into a line');
    }
    const grip=rig.racket.localToWorld(new THREE.Vector3(0,.54,0));
    assert.ok(grip.distanceTo(new THREE.Vector3(contact.x,contact.y,contact.z))<1e-7);
    const before=skin.skeleton.bones.map(b=>b.matrixWorld.toArray());
    for(let i=0;i<10;i++)updateAthlete(rig,{...player,z:player.z*sign},side,contact,1.2,1/60,true,true);
    scene.updateMatrixWorld(true);
    assert.deepEqual(skin.skeleton.bones.map(b=>b.matrixWorld.toArray()),before);
  }
});
