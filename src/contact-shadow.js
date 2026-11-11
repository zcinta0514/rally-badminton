import * as THREE from 'three';

/** Linear alpha data, zero at the boundary: no hard disk or square halo. */
export function makeShadowTexture(){
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const r2=((x-(size-1)/2)/((size-1)/2))**2+((y-(size-1)/2)/((size-1)/2))**2;
    const alpha=r2>=1?0:Math.max(0,(Math.exp(-4*r2)-Math.exp(-4))/(1-Math.exp(-4)));
    data.set([255,255,255,Math.round(alpha*255)],(y*size+x)*4);
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.name='soft-contact-alpha';texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;
  return texture;
}
export function makeContactShadow(parent,{texture=makeShadowTexture(),opacity=.3,name='contact-shadow'}={}){
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:texture,color:0x06100c,transparent:true,opacity,depthWrite:false,toneMapped:false}));
  shadow.name=name;shadow.rotation.x=-Math.PI/2;shadow.position.y=.028;parent.add(shadow);return shadow;
}
/** Direction of the fixed match key (-3.5,12,2), not a predicted landing marker. */
export function shuttleShadowSample(height){
  const h=Math.max(0,Number.isFinite(height)?height:0);
  return {x:h*3.5/12,z:-h*2/12,width:.16+h*.055,depth:.13+h*.045,opacity:.42/(1+h*.9)};
}
