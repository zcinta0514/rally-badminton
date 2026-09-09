import * as THREE from 'three';
import { makeAthleteSkin } from './athlete-skin.js';
import { makeRacket } from './racket-visual.js';

// Original vertex-coloured clothing and accessories. The jersey and limbs use
// one continuous skin; grip, facial features and shoes retain precise adapters.
const TAU=Math.PI*2;
const colour=value=>new THREE.Color(value);
const transform=(geometry,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0])=>{
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale));
  geometry.applyMatrix4(matrix);return geometry;
};
function paint(geometry,value) {
  const p=geometry.getAttribute('position'),rgb=[];
  for(let i=0;i<p.count;i++){
    const c=colour(typeof value==='function'?value(p.getX(i),p.getY(i),p.getZ(i)):value);
    rgb.push(c.r,c.g,c.b);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(rgb,3));
  // All parts use the same three attributes, with baked transforms, no groups.
  geometry.deleteAttribute('uv');return geometry;
}
const join=parts=>{
  const merged=new THREE.BufferGeometry(),indices=[],attributes={position:[],normal:[],color:[]};
  let offset=0;
  for(const part of parts){
    for(const name of Object.keys(attributes))attributes[name].push(...part.getAttribute(name).array);
    for(const i of part.index.array)indices.push(i+offset);
    offset+=part.getAttribute('position').count;part.dispose();
  }
  for(const [name,values]of Object.entries(attributes))merged.setAttribute(name,new THREE.Float32BufferAttribute(values,3));
  merged.setIndex(indices);merged.computeBoundingSphere();return merged;
};
function loft(rings,value,sides=16) {
  const points=[],indices=[];
  for(const [y,rx,rz,cx=0,cz=0]of rings)for(let n=0;n<sides;n++){
    const angle=n/sides*TAU;points.push(cx+Math.cos(angle)*rx,y,cz+Math.sin(angle)*rz);
  }
  for(let r=0;r<rings.length-1;r++)for(let n=0;n<sides;n++){
    const a=r*sides+n,c=r*sides+(n+1)%sides,b=a+sides,d=c+sides;
    indices.push(a,b,c,c,b,d);
  }
  for(const [r,top]of [[0,false],[rings.length-1,true]]){
    const [y,,,x=0,z=0]=rings[r],center=points.length/3;points.push(x,y,z);
    for(let n=0;n<sides;n++){
      const a=r*sides+n,b=r*sides+(n+1)%sides;
      indices.push(center,top?b:a,top?a:b);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  g.setIndex(indices);g.computeVertexNormals();return paint(g,value);
}
const ellipsoid=(radii,position,color,rotation=[0,0,0],segments=10)=>
  paint(transform(new THREE.SphereGeometry(1,segments,6),position,radii,rotation),color);
const box=(size,position,color,rotation=[0,0,0])=>paint(transform(new THREE.BoxGeometry(...size),position,[1,1,1],rotation),color);
const finger=(points,radius,color)=>{
  const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return join([paint(new THREE.TubeGeometry(path,8,radius,6,false),color),
    ellipsoid([radius,radius,radius],points.at(-1),color,[0,0,0],6)]);
};

export function makeAthleteModel(root,bones,index) {
  const colors={shirt:index===0?0xf07759:0x86cdbd,skin:index===0?0xd8a27b:0x966947,
    skinShade:index===0?0xbc805e:0x70482f,dark:0x16313d,white:0xf0f0df,
    accent:index===0?0xffd69b:0x36a38e,hair:0x222c2d};
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:0});
  function mesh(parent,geometry,name){
    const item=new THREE.Mesh(geometry,material);item.name=name;item.castShadow=true;item.receiveShadow=true;
    parent.add(item);return item;
  }
  const jerseyColor=(x,y,z)=>{
    if(y>.325)return colors.dark;
    if(y<-.232)return colors.accent;
    if(Math.abs(x)>.16&&y<.23)return colors.dark;
    if(z<-.06&&x>.06&&y<.24&&y>-.20)return colors.accent;
    return colors.shirt;
  };
  const jersey=loft([
    [-.265,.165,.114],[-.23,.169,.115],[-.15,.173,.108],[-.03,.184,.111],
    [.08,.206,.12],[.20,.234,.126],[.28,.247,.125],[.315,.197,.105],
    [.335,.092,.065],[.35,.065,.057],[.36,.061,.054]
  ],jerseyColor,24);
  const torsoGeometry=join([jersey,
    // Flat cloth markings follow the shirt surface, without floating chest boxes.
    box([.037,.045,.003],[-.078,.175,-.121],colors.white),
    box([.024,.12,.003],[-.03,.105,.125],colors.white),
    box([.024,.12,.003],[.03,.105,.125],colors.white)
  ]);
  const skin=makeAthleteSkin(root,material,torsoGeometry,colors);
  const neck=mesh(bones.neck,loft([[-.072,.056,.049],[.02,.048,.044],[.097,.05,.044]],colors.skin,16),'neck');
  const headParts=[loft([
    [-.108,.038,.039,0,-.018],[-.092,.055,.05,0,-.013],[-.065,.067,.063,0,-.01],
    [-.026,.078,.076,0,-.004],[.013,.083,.086],[.055,.08,.083],
    [.095,.072,.074],[.132,.049,.052],[.155,.003,.004]
  ],colors.skin,24)];
  // A tapered nose with its tip facing forward (-z), with a narrow lower jaw.
  const nose=loft([[-.035,.014,.013,0,-.078],[-.017,.017,.024,0,-.094],
    [-.005,.013,.023,0,-.093],[.026,.009,.009,0,-.079]],colors.skin,10);
  headParts.push(nose,box([.037,.003,.003],[0,-.054,-.074],colors.skinShade));
  for(const sign of [-1,1]){
    headParts.push(ellipsoid([.017,.031,.015],[sign*.085,-.003,.006],colors.skin),
      ellipsoid([.006,.017,.008],[sign*.096,-.004,-.004],colors.skinShade),
      ellipsoid([.013,.005,.0035],[sign*.032,.003,-.081],colors.dark),
      box([.029,.005,.004],[sign*.034,.022,-.082],colors.hair,[0,0,sign*.08]));
  }
  // Short hair follows the cranium; a lower back hairline avoids a helmet rim.
  const hair=loft([[.043,.082,.085],[.09,.076,.08],[.133,.056,.062],[.151,.04,.046],[.163,.014,.025,0,.005]],colors.hair,24);
  const hairPosition=hair.getAttribute('position');
  for(let i=0;i<24;i++){
    const front=Math.max(0,-Math.sin(i/24*TAU));
    hairPosition.setY(i,.018+front*.044+Math.cos(i/24*TAU)*.008);
  }
  hair.computeVertexNormals();headParts.push(hair);
  const head=mesh(bones.head,join(headParts),'head');
  const shorts=mesh(bones.pelvis,loft([[-.14,.20,.125],[-.085,.223,.133],[-.005,.202,.123],[.035,.17,.11]],
    (x,y)=>y>.003?colors.dark:0x203f4a,20),'shorts-waist');
  const hems=[],hands={},feet={};
  for(const name of ['left','right']){
    const hem=mesh(bones[`${name}Hip`],loft([[-.20,.106,.115],[-.135,.12,.117],
      [.065,.103,.099],[.115,.103,.094],[.135,.105,.096]],
      (x,y)=>y>.11?colors.accent:Math.abs(x)>.08?colors.dark:0x203f4a,20),`${name}-shorts-leg`);
    hems.push({name,mesh:hem,offset:.13});
    const shoeParts=[
      // The sole and upper have a long toe box and a close-fitting raised heel.
      loft([[-.076,.06,.145,0,-.071],[-.062,.074,.156,0,-.074],[-.045,.073,.155,0,-.074]],colors.accent,20),
      loft([[-.045,.072,.151,0,-.072],[-.019,.072,.146,0,-.071],[.018,.062,.122,0,-.05],
        [.054,.052,.075,0,-.01],[.089,.04,.046,0,.005]],colors.white,20),
      loft([[.032,.039,.042],[.115,.041,.039],[.164,.042,.04]],
        (x,y)=>y>.135?colors.accent:colors.white,16)
    ];
    for(const side of [-1,1])shoeParts.push(box([.003,.018,.075],[side*.065,-.008,-.075],colors.dark,[0,0,side*.16]));
    for(let lace=0;lace<3;lace++)shoeParts.push(box([.061,.006,.01],[0,.036-lace*.008,-.04-lace*.025],colors.dark));
    feet[name]=mesh(bones[`${name}Ankle`],join(shoeParts),`${name}-shoe`);
    const handParts=[ellipsoid([.027,.035,.024],[0,.005,0],colors.skin)];
    if(name==='right'){
      // Four separate fingers curl from the knuckles around the handle. The
      // thumb closes from the opposite side, rather than four flat skin discs.
      handParts.push(loft([[.005,.023,.019,0,.008],[.032,.033,.022,0,.027],
        [.069,.035,.022,0,.034],[.10,.029,.019,0,.028],[.113,.019,.012,0,.018]],colors.skin,16));
      for(let i=0;i<4;i++){
        const y=.036+i*.020;
        handParts.push(finger([[.024,y,.031],[.036,y,.014],[.028,y-.001,-.010],
          [.010,y-.003,-.022],[-.008,y-.004,-.015]],.0085,colors.skin));
      }
      handParts.push(finger([[-.024,.035,.018],[-.029,.053,.001],[-.025,.078,-.017],
        [-.012,.099,-.024],[.002,.103,-.018]],.010,colors.skin));
    } else {
      handParts.push(loft([[.003,.023,.019],[.035,.034,.02,0,.004],[.078,.036,.018,0,.005],
        [.099,.031,.013]],colors.skin,16));
      for(let i=0;i<4;i++){
        const x=-.027+i*.018,size=[.049,.056,.052,.041][i];
        handParts.push(finger([[x,.083,.004],[x,.11,.003],[x,.095+size*.7,-.009],
          [x,.095+size,-.019]],.008,colors.skin));
      }
      handParts.push(finger([[.026,.034,.005],[.046,.052,.005],[.054,.075,-.002],[.051,.091,-.015]],.0105,colors.skin));
    }
    hands[name]=mesh(bones[`${name}Wrist`],join(handParts),`${name}-hand`);
  }
  const racket=makeRacket(colors);root.add(racket);
  return {skin,shorts,hems,hands,feet,head,neck,racket};
}
