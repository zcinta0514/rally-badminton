import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Each batch shares one geometry and one material. A thousand seats and their
// occupants cost four draw calls; none of the fixtures adds a shadow pass.
function batch(group,name,geometry,unlit=false) {
  const transforms=[],colors=[];
  const pose=new THREE.Object3D(), axis=new THREE.Vector3(1,0,0);
  function add(x,y,z,w,h,d,color,rx=0,ry=0,rz=0) {
    pose.position.set(x,y,z);pose.scale.set(w,h,d);pose.rotation.set(rx,ry,rz);
    pose.updateMatrix();transforms.push(pose.matrix.clone());colors.push(color);
  }
  function beam(ax,ay,az,bx,by,bz,width,color,depth=width) {
    const delta=new THREE.Vector3(bx-ax,by-ay,bz-az);
    pose.position.set((ax+bx)/2,(ay+by)/2,(az+bz)/2);
    pose.scale.set(delta.length(),width,depth);
    pose.quaternion.setFromUnitVectors(axis,delta.normalize());pose.updateMatrix();
    transforms.push(pose.matrix.clone());colors.push(color);
  }
  function finish() {
    if(!transforms.length){geometry.dispose();return;}
    const material=unlit?new THREE.MeshBasicMaterial({toneMapped:false}):
      new THREE.MeshStandardMaterial({roughness:.79,metalness:.07,vertexColors:geometry.hasAttribute('color')});
    const mesh=new THREE.InstancedMesh(geometry,material,transforms.length);
    mesh.name=name;
    const ink=new THREE.Color();
    transforms.forEach((m,i)=>{mesh.setMatrixAt(i,m);mesh.setColorAt(i,ink.setHex(colors[i]));});
    mesh.computeBoundingSphere();group.add(mesh);
  }
  return {add,beam,finish};
}

// One authored seated pose per bank, with three instanced colour channels.
// The positive Z direction points into the seat back; knees face the court.
function seatedBody() {
  function segment(a,b,shoulder,wrist) {
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),line=end.clone().sub(start);
    const mesh=new THREE.CylinderGeometry(wrist,shoulder,line.length(),5,1,true);
    mesh.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),line.normalize()));
    const mid=start.add(end).multiplyScalar(.5);
    return mesh.translate(mid.x,mid.y,mid.z);
  }
  function joined(parts) {
    const merged=mergeGeometries(parts);
    parts.forEach(p=>p.dispose());return merged;
  }
  const torso=new THREE.LatheGeometry([[.59,.39],[.76,.50],[.94,.675],[.87,.711],[.37,.751]]
    .map(([r,y])=>new THREE.Vector2(r,y)),8).scale(.185,1,.126).rotateX(-.07);
  const shirt=[torso],skin=[],trousers=[];
  const head=new THREE.SphereGeometry(.5,7,5);
  const ink=[],verts=head.getAttribute('position');
  for(let i=0;i<verts.count;i++){
    // A swept hairline extends lower at the back of the head.
    const hair=verts.getY(i)>.19-verts.getZ(i)*.5;
    ink.push(...(hair?[.115,.095,.085]:[1,1,1]));
  }
  head.setAttribute('color',new THREE.Float32BufferAttribute(ink,3));
  skin.push(head.scale(.177,.218,.183).translate(0,.836,-.067));
  for(const side of [-1,1]){
    const elbow=[side*.18,.54,-.105],hand=[side*.098,.462,-.262];
    shirt.push(segment([side*.146,.687,-.045],elbow,.071,.044));
    skin.push(segment(elbow,hand,.044,.035));
    const hip=[side*.077,.416,.01],knee=[side*.096,.399,-.238],ankle=[side*.095,.18,-.262];
    trousers.push(segment(hip,knee,.081,.065),segment(knee,ankle,.065,.042),
      new THREE.BoxGeometry(.10,.058,.155).translate(side*.095,.165,-.295));
  }
  for(const part of skin){
    if(part.hasAttribute('color'))continue;
    const color=new Float32Array(part.getAttribute('position').count*3).fill(1);
    part.setAttribute('color',new THREE.Float32BufferAttribute(color,3));
  }
  return {shirt:joined(shirt),skin:joined(skin),trousers:joined(trousers)};
}

function batches(group,id) {
  const boxes=(name,unlit)=>batch(group,name,new THREE.BoxGeometry(),unlit);
  const body=seatedBody();
  return {
    structure:boxes(id+'-structure'), roof:boxes(id==='bay'?'bay-canopy':'crown-halo'),
    seats:boxes(id+'-seats'),people:batch(group,id+'-spectators',body.shirt),
    skin:batch(group,id+'-spectator-heads',body.skin), trousers:batch(group,id+'-spectator-legs',body.trousers), lamps:boxes(id+'-lights',true),

  };
}

// Stand rows use a tangent coordinate along the front of the bank and a depth
// measured away from the playing surface. That gives all four banks inward faces.
function stand(b,{side,end,edge,start,stop,rows,bottom=0,step=.63,rise=.32,theme,upper=false}) {
  const c=theme;
  const world=(t,y,d)=>end?[t,y,side*(edge+d)]:[side*(edge+d),y,t];
  const block=(batch,t,y,d,w,h,l,color)=>batch.add(...world(t,y,d),end?w:l,h,end?l:w,color);
  for(let r=0;r<rows;r++){
    const y=bottom+r*rise, depth=r*step, middle=(start+stop)/2;
    block(b.structure,middle,y+.10,depth,stop-start,.20,step+.02,c.deck);
    block(b.structure,middle,y-.03,depth-.5*step+.04,stop-start,.22,.09,c.wall);
    const count=Math.floor((stop-start)/.57),spacing=(stop-start)/count;
    for(let s=0;s<count;s++){
      const t=start+(s+.5)*spacing;
      if(Math.abs(t)<.75 || (s%14===8||s%14===9)) continue; // access aisles
      const n=(s*19+r*37+(side+1)*17+(upper?11:0))%97;
      const seat=c.seats[(s+r*3)%c.seats.length];
      block(b.seats,t,y+.32,depth,.43,.11,.36,seat);
      block(b.seats,t,y+.48,depth+.15,.43,.32,.065,seat);
      if(n>c.occupancy)continue;
      const shirt=c.shirts[n%c.shirts.length];
      const yaw=(end?(side>0?0:Math.PI):side*Math.PI/2)+(n%7-3)*.036;
      const scale=.94+(n%9)*.009;
      const place=(mesh,color)=>mesh.add(...world(t,y,depth),scale,scale,scale,color,0,yaw,0);
      place(b.people,shirt);place(b.skin,c.skin[n%3]);
      place(b.trousers,[0x364453,0x465361,0x45403b,0x3c4450][n%4]);
    }
  }
}

const bayTheme={deck:0xdad6c8,wall:0x718c8b,seats:[0x238884,0x338e9d,0xabcac4],
  shirts:[0x197476,0xb86848,0xcabf91,0xd5d8cb,0x35576a],skin:[0xcc9676,0xb47b57,0xe6b794],occupancy:63};
const crownTheme={deck:0x333644,wall:0x171d2d,seats:[0x443f70,0x59558a,0x302e4b],
  shirts:[0xb39458,0x474968,0x746c8c,0x9a8579,0x526776],skin:[0xd7a181,0xb77c5d,0xe1b698],occupancy:88};

// A single panorama texture is shared by all four outward views. Its lower
// horizon leaves a strip of open water below a pair of hazy, overlapping shores.
function harborPixels(width,height) {
  const data=new Uint8Array(width*height*4);
  const gradient=(a,b)=>Array.from({length:256},(_,j)=>a.map((c,i)=>Math.round(c+(b[i]-c)*j/255)));
  const sea=gradient([94,155,164],[172,200,198]),foreshore=gradient([128,161,159],[148,175,170]),
    headland=gradient([166,186,183],[157,179,184]),sky=gradient([217,227,218],[159,204,219]);
  const sample=(ramp,t)=>ramp[Math.round(255*THREE.MathUtils.clamp(t,0,1))];
  const horizon=.29;
  for(let x=0;x<width;x++){
    const u=x/width;
    const hill=(c,w,h)=>h*Math.exp(-((u-c)**2)/(w*w));
    const far=horizon+hill(.17,.14,.142)+hill(.73,.19,.092)+.006*Math.sin(u*77)+.003*Math.cos(u*139);
    const near=horizon+hill(.55,.10,.062)+hill(.92,.11,.105)-.023+.004*Math.cos(u*100);
    for(let y=0;y<height;y++){
      const v=y/(height-1);
      let rgb;
      if(v<horizon){
        const shine=.038*Math.sin(v*225+Math.sin(u*83)*1.4)+.023*Math.cos(v*143-u*6.3);
        rgb=sample(sea,v/horizon+shine);
      }else if(v<near)rgb=sample(foreshore,(v-horizon)*5);
      else if(v<far)rgb=sample(headland,(v-horizon)*4);
      else rgb=sample(sky,(v-horizon)/.62);
      const i=(y*width+x)*4;data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
    }
  }
  return data;
}
let harborImage;
function harborPanorama(group) {
  const width=512,height=128;
  // Geometry/texture lifetimes belong to each venue; its immutable pixels can
  // be reused for a new court without recalculating the harbour at entry time.
  harborImage ??= harborPixels(width,height);
  const map=new THREE.DataTexture(harborImage,width,height,THREE.RGBAFormat);
  map.colorSpace=THREE.SRGBColorSpace;map.minFilter=THREE.LinearFilter;map.magFilter=THREE.LinearFilter;map.needsUpdate=true;
  const panels=[];
  for(const side of [-1,1]){
    panels.push(new THREE.PlaneGeometry(36,8.5).rotateY(side<0?0:Math.PI).translate(0,4.1,side*19.65),
      new THREE.PlaneGeometry(39.4,8.5).rotateY(-side*Math.PI/2).translate(side*14.5,4.1,0));
  }
  const vista=new THREE.Mesh(mergeGeometries(panels),new THREE.MeshBasicMaterial({map,toneMapped:false}));
  panels.forEach(p=>p.dispose());vista.name='bay-harbor-horizon';group.add(vista);
}

function bayHall(b,center) {
  const {structure:s,roof,lamps}=b;
  const rows=center?5:3, endX=center?9.2:7.8;
  // A pale timber gallery with open ends, glazing above a low masonry plinth
  // and an actual distant waterline beyond the slender structural mullions.
  s.add(0,-.22,0,28,.28,41,0xc3bba4);
  for(const side of [-1,1]){
    stand(b,{side,end:false,edge:5.85,start:-9.9,stop:9.9,rows,theme:bayTheme});
    const x=side*(center?11:9.8);
    s.add(x,.62,0,.24,1.32,29,0xe3d8b7);
    for(let z=-12;z<=12;z+=3){
      s.add(x,3.45,z,.14,5.6,.16,0xd1a573);
      s.beam(x,4.4,z,x-side*1.28,6.25,z,.14,0x907353);
    }
    for(const y of [1.44,3.52,5.8])s.add(x,y,0,.12,.095,27.5,0xe3d5b7);
    for(let z=-12;z<=12;z+=3){
      // Folded gull-wing awnings: the soaring outer edge floats above the glass;
      // the split ridge runs the full length without covering the flight volume.
      roof.beam(side*2.65,7.05,z,x,6.25,z,.24,0xbf9161);
      roof.add(side*(Math.abs(x)+2.65)/2,6.76,z,Math.abs(x)-2.6,.11,2.62,0xe5e0d0,0,0,-side*.10);
      lamps.add(side*4.4,6.72,z,.19,.06,1.55,0xffeed0);
    }
    for(const lane of [3.2,6.4])roof.add(side*lane,6.83-(lane-3.2)*.11,0,.11,.12,26.5,0xc4a077);
    // Glazed gable facing the end-camera is visible behind the match even at
    // close zoom. The near gable is outside the fixed camera envelope.
    const wallZ=side*19.4;
    for(let x2=-endX;x2<=endX;x2+=2.25)s.add(x2,3.2,wallZ-side*.13,.12,6.4,.18,0xbe9a76);
    s.add(0,2.25,wallZ-side*.17,endX*2,.085,.14,0xe3d6bd);
    s.add(0,6.36,wallZ,endX*2+.5,.24,.34,0xb49064);
    if(center) stand(b,{side,end:true,edge:10.65,start:-6.6,stop:6.6,rows:3,theme:bayTheme});
    else {
      for(const sign of [-1,1]) stand(b,{side,end:true,edge:10.85,start:sign<0?-6.9:2.6,
        stop:sign<0?-2.6:6.9,rows:2,theme:bayTheme});
    }
  }
  if(center){
    // Paired glazed monitors crown the centre-court galleries and preserve the
    // open camera corridor all the way along the ridge.
    for(const side of [-1,1]){
      for(let z=-10.5;z<=10.5;z+=3.5)roof.add(side*4.85,7.4,z,2.3,.13,.15,0xbf946e);
      roof.add(side*4.85,7.5,0,1.8,.11,23,0xd9e7de);
    }
  }
}

function crownHall(b,center) {
  const {structure:s,roof,lamps}=b;
  const rows=center?5:4,upperRows=center?5:3;
  s.add(0,-.24,0,43,.3,52,0x272a36);
  for(const side of [-1,1]){
    stand(b,{side,end:false,edge:6.0,start:-10.7,stop:10.7,rows,theme:crownTheme});
    stand(b,{side,end:false,edge:9.2,start:-14.1,stop:14.1,rows:upperRows,bottom:3.02,theme:crownTheme,upper:true});
    stand(b,{side,end:true,edge:10.25,start:-8.5,stop:8.5,rows:3,theme:crownTheme});
    // The central camera tunnel replaces the upper end seats in front of both
    // baseline cameras. Corner sections and continuous end ribbons close the bowl.
    for(const sign of [-1,1]){
      stand(b,{side,end:true,edge:14.05,start:sign<0?-10.7:3.7,stop:sign<0?-3.7:10.7,
        rows:upperRows,bottom:3.0,theme:crownTheme,upper:true});
    }
    s.add(side*9.13,2.9,0,.36,.82,28.4,0x292838);
    for(const y of [2.59,3.17])lamps.add(side*8.93,y,0,.065,.045,28.4,0xe8b777);
    for(const sign of [-1,1]){
      s.add(sign*7.1,2.93,side*13.91,7,.78,.26,0x252333);
      lamps.add(sign*7.1,3.19,side*13.76,7,.055,.08,0xe7bb85);
    }
    s.add(side*14.75,4.5,0,.25,9.2,41,0x20212e);
    s.add(0,4.5,side*20.85,30,9.2,.27,0x222330);
    for(let z=-15;z<=15;z+=3.75){
      s.add(side*13.8,5.7,z,.32,7.5,.28,0x343647);
      roof.beam(side*13.8,8.85,z,side*5.55,9.13,z,.19,0x777580);
      roof.beam(side*13.8,7.64,z,side*5.55,9.13,z,.14,0x6d6874);
      roof.add(side*10.3,9.32,z,8.9,.18,3.72,0x343442);
    }
    roof.add(side*6.8,8.67,0,.24,.34,38.8,0x4a4755);
    lamps.add(side*6.65,8.46,0,.14,.08,38.7,0xf8e0c8);
    roof.add(0,8.67,side*19.3,13.7,.34,.25,0x4a4755);
    lamps.add(0,8.46,side*19.27,13.65,.08,.13,0xffdbb6);
    for(let x=-10;x<=10;x+=2){
      s.add(x,5.74,side*20.5,.15,5.3,.13,0x62586a);
      if(center)lamps.add(x,5.05,side*20.39,.055,2.7,.08,0xc9ac74);
    }
    if(center)lamps.add(side*12.78,5.05,0,.12,.09,27.8,0xb3aceb);
  }
}
function suspendedScreen(group,b,center) {
  const screen=new THREE.Group();
  screen.name='crown-score-cube';
  // Suspended above the far sideline so neither baseline camera sees the screen
  // in front of the shuttle or the far player's head.
  const x=-4.65,z=-8.2,h=center?4.88:4.75;
  screen.position.set(x,h,z);group.add(screen);
  const width=center?2.94:2.42, height=width*.49, half=width/2;
  b.roof.add(x,h,z,width+.13,height+.22,width+.13,0x252333);
  for(const y of [h+height/2+.1,h-height/2-.1])b.lamps.add(x,y,z,width+.2,.046,width+.2,0xfbd69b);
  for(const sx of [-1,1])for(const sz of [-1,1]){
    b.roof.beam(x+sx*half,h+height/2,z+sz*half,x+sx*.55,8.6,z+sz*.55,.036,0x777485);
  }
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=352;
  const ctx=canvas.getContext('2d'),map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  const face=new THREE.MeshBasicMaterial({map,toneMapped:false});
  const geometry=new THREE.PlaneGeometry(width,height);
  for(let i=0;i<4;i++){
    const panel=new THREE.Mesh(geometry,face);
    panel.rotation.y=i*Math.PI/2;
    panel.position.set(Math.sin(panel.rotation.y)*(half+.072),0,Math.cos(panel.rotation.y)*(half+.072));
    screen.add(panel);
  }
  let lastNear,lastFar,lastA,lastB;
  function update(score=[0,0],near='你',far='对手') {
    const [a,b]=score;
    if(a===lastA&&b===lastB&&near===lastNear&&far===lastFar)return;
    lastA=a;lastB=b;lastNear=near;lastFar=far;
    ctx.fillStyle='#141622';ctx.fillRect(0,0,768,352);
    ctx.textAlign='center';ctx.fillStyle='#e8ce89';
    ctx.font='bold 48px "Microsoft YaHei", sans-serif';ctx.fillText('开拍冠军杯',384,57);
    ctx.fillStyle='#4b4856';ctx.fillRect(38,79,692,3);ctx.fillRect(383,100,2,205);
    ctx.fillStyle='#f5eddb';ctx.font='bold 146px Arial';ctx.fillText(String(a),192,236);ctx.fillText(String(b),576,236);
    ctx.font='600 43px "Microsoft YaHei", sans-serif';ctx.fillText(near||'你',192,303,317);ctx.fillText(far||'对手',576,303,317);
    map.needsUpdate=true;
  }
  update();
  return update;
}

export function makeCupHall(eventId,centerCourt=false) {
  if(eventId!=='bay'&&eventId!=='crown')throw new TypeError('Unknown cup venue '+eventId);
  const group=new THREE.Group();
  group.name='cup-hall-'+eventId;
  group.userData={venueId:eventId,centerCourt,tierCount:eventId==='bay'?1:2};
  const b=batches(group,eventId);
  let update=()=>{};
  if(eventId==='bay'){bayHall(b,centerCourt);harborPanorama(group);}
  else {
    crownHall(b,centerCourt);
    update=suspendedScreen(group,b,centerCourt);
  }
  for(const batch of Object.values(b))batch.finish();
  return {group,update};
}
