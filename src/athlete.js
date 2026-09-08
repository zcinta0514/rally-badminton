import * as THREE from 'three';
import { makeAthleteModel } from './athlete-model.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=n=>{n=clamp(n,0,1);return n*n*(3-2*n);};
const v=(x=0,y=0,z=0)=>({x,y,z});
const add=(a,b)=>v(a.x+b.x,a.y+b.y,a.z+b.z);
const sub=(a,b)=>v(a.x-b.x,a.y-b.y,a.z-b.z);
const mul=(a,n)=>v(a.x*n,a.y*n,a.z*n);
const length=a=>Math.hypot(a.x,a.y,a.z);
const unit=a=>mul(a,1/(length(a)||1));
const mix=(a,b,t)=>add(mul(a,1-t),mul(b,t));
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const turn=(p,a)=>v(Math.cos(a)*p.x+Math.sin(a)*p.z,p.y,-Math.sin(a)*p.x+Math.cos(a)*p.z);
const curve=(a,b,da,db,t)=>{
  t=clamp(t,0,1);const t2=t*t,t3=t2*t;
  return add(add(mul(a,2*t3-3*t2+1),mul(b,-2*t3+3*t2)),add(mul(da,t3-2*t2+t),mul(db,t3-t2)));
};

// Analytic two-bone bend: upper/lower arms and thighs/calves keep joint continuity.
function bend(start,end,a,b,pole) {
  const delta=sub(end,start), d=clamp(length(delta),.025,a+b-.001), axis=unit(delta);
  const along=(a*a-b*b+d*d)/(2*d);
  let perpendicular=sub(pole,mul(axis,dot(pole,axis)));
  if(length(perpendicular)<1e-6){
    const fallback=Math.abs(axis.z)<.8?v(0,0,-1):v(1,0,0);
    perpendicular=sub(fallback,mul(axis,dot(fallback,axis)));
  }
  return add(start,add(mul(axis,along),mul(unit(perpendicular),Math.sqrt(Math.max(0,a*a-along*along)))));
}

/** Pure pose sampler. Coordinates are player-local; side 0 faces local -z.
 * All animation time is authoritative match time, including pause and replay. */
export function sampleAthletePose(player,side,shuttle,time,options={}) {
  const sign=side===0?1:-1, speed=options.speed??Math.hypot(player.vx||0,player.vz||0);
  const run=clamp(speed/4,0,1), vx=(options.velocity?.x??player.vx??0)*sign, vz=(options.velocity?.z??player.vz??0)*sign;
  const heading=options.heading||0;
  const phase=(options.moveCycle??time*10.8), stride=Math.sin(phase), lift=Math.cos(phase);
  const move=unit(v(vx,0,vz));
  const action=player.action && time<=player.action.endsAt ? player.action : null;
  const type=action?.type??null;
  let active=0,jump=0,crouch=0,lunge=0,stroke=0,racketRoll=0;
  let racketHead=turn(v(.47,1.52+stride*.035*run,-.54+stride*.1*run),heading);
  let localContact=null;
  let elapsed=0,pre=0,post=0;
  if(action) {
    elapsed=time-action.contactAt;
    pre=smooth((time-action.startedAt)/Math.max(.001,action.contactAt-action.startedAt));
    post=smooth(elapsed/.2);
    active=elapsed<=0?pre:1-smooth((elapsed-.18)/.24);
    stroke=elapsed<=0?-.52*Math.sin(pre*Math.PI)+.12*pre:(.12+.49*smooth(elapsed/.16))*active;
    racketRoll=elapsed<=0?-.8*Math.sin(pre*Math.PI)+.18*pre:(.18+1.15*post)*active;
    localContact=v((action.contact.x-player.x)*sign,action.contact.y,(action.contact.z-player.z)*sign);
    const low=localContact.y<1.25;
    lunge=(low?.9:.4)*active;
    if(action.stage==='prepare') {
      const ready=smooth((time-action.startedAt)/.14);
      active=.55*ready;crouch=.13*ready;lunge*=ready;
      stroke=-.3*ready;racketRoll=-.45*ready;
      racketHead=mix(racketHead,turn(type==='smash'?v(.38,1.92,.22):v(.53,1.2,-.15),heading),ready);
    } else {
      const windup=turn(type==='smash'?v(.35,1.99,.42):type==='clear'?v(.62,1.62,.26):v(.55,.93,-.18),heading);
      const follow=turn(type==='smash'?v(-.6,.85,-.6):type==='clear'?v(-.22,1.74,-.78):v(.53,1.05,-.86),heading);
      const ready=turn(v(.47,1.52,-.54),heading),duration=Math.max(.001,action.contactAt-action.startedAt);
      // Share tangents across impact and follow-through: the racket passes the
      // authoritative contact instead of easing to a stop on either side of it.
      const contactVelocity=mul(sub(follow,windup),1.4/(duration+.2));
      const recoverVelocity=mul(sub(ready,follow),.5/.22);
      racketHead=elapsed<=0?curve(windup,localContact,v(),mul(contactVelocity,duration),(time-action.startedAt)/duration)
        :elapsed<=.2?curve(localContact,follow,mul(contactVelocity,.2),mul(recoverVelocity,.2),elapsed/.2)
          :curve(follow,ready,mul(recoverVelocity,.22),v(),(elapsed-.2)/.22);
      const jumpHeight=action.serving?0:Math.max(action.jumpHeight||0,clamp(localContact.y-2.5,0,.8));
      if(jumpHeight>.04) {
        const height=jumpHeight;
        jump=elapsed<0?height*smooth((pre-.12)/.88):height*(1-smooth(elapsed/.28));
        crouch=elapsed<0?.17*(1-pre):.17*Math.sin(Math.PI*clamp((elapsed-.22)/.2,0,1));
      } else crouch=(low?.27:.045)*active;
    }
  }
  const reach=localContact?unit(v(localContact.x,0,localContact.z)):v(0,0,-1);
  const reachDistance=localContact?Math.min(1.3,Math.hypot(localContact.x,localContact.z)):0;
  let lean=mul(reach,lunge*reachDistance*.35);
  const transition=options.transition,from=transition?.from,blend=transition?.weight??1;
  if(from){
    racketHead=mix(from.racketHead,racketHead,blend);
    jump=from.jump+(jump-from.jump)*blend;crouch=from.crouch+(crouch-from.crouch)*blend;
    stroke=(from.stroke||0)+(stroke-(from.stroke||0))*blend;
    racketRoll=from.racketRoll+(racketRoll-from.racketRoll)*blend;
    active=from.active+(active-from.active)*blend;
    lean=mix(from.lean||v(),lean,blend);
  }
  const pelvisYaw=heading+stroke*.36+stride*.055*run,chestYaw=heading+stroke-stride*.11*run;
  const rootHeight=.92+jump-crouch-(options.brake||0)-run*.055+Math.abs(stride)*.012*run;
  const pelvis=v(lean.x*.4+stride*.018*run,rootHeight,lean.z*.4);
  // Rotate a fixed-length trunk into the reach, keeping adult shoulder height
  // while preserving the same 1.86m silhouette. High clears use the jump too.
  const trunk=mul(unit(v(lean.x*.6+vx*.013+(options.acceleration?.x||0)*sign*.003,.51,lean.z*.6-.04+vz*.014+(options.acceleration?.z||0)*sign*.003)),.512);
  const chest=add(pelvis,trunk);
  const preliminaryShoulder=add(chest,turn(v(.245,.005,0),chestYaw));
  const reachDelta=sub(racketHead,preliminaryShoulder);
  const armAndRacket=.32+.31+.54-.003;
  const horizontalReach=Math.sqrt(Math.max(.001,armAndRacket**2-reachDelta.y**2));
  const horizontalDistance=Math.hypot(reachDelta.x,reachDelta.z);
  // Move the pelvis with a visible planted lunge / airborne step. Never make
  // the forearm longer in order to keep the racket face on a legal contact.
  let shift=horizontalDistance>horizontalReach
    ?mul(unit(v(reachDelta.x,0,reachDelta.z)),horizontalDistance-horizontalReach):v();
  // A racket passing close to the chest needs a little body clearance. Without
  // this, a 54cm shaft forces the 31cm forearm to fold backwards at the wrist.
  const clearanceAxis=turn(v(1,0,0),chestYaw);
  const relative=sub(reachDelta,shift),across=dot(relative,clearanceAxis);
  const perpendicular=sub(relative,mul(clearanceAxis,across));
  // A one-sided, rounded forehand clearance surface avoids the singularity of
  // radial sphere projection at the shoulder centre. Its parabola encloses
  // the required reach sphere, so the body makes one continuous side step.
  const clearance=.361-length(perpendicular)**2/(2*.361);
  shift=add(shift,mul(clearanceAxis,Math.min(0,across-clearance)));
  pelvis.x+=shift.x;pelvis.y+=shift.y;pelvis.z+=shift.z;
  chest.x+=shift.x;chest.y+=shift.y;chest.z+=shift.z;
  const joints={pelvis,spine:mix(pelvis,chest,.45),chest,neck:add(chest,v(0,.09,0)),head:add(chest,v(0,.26,-.012))};
  const lateral=Math.abs(move.x), stepSize=.39*run;
  for(const [name,s] of [['left',-1],['right',1]]) {
    const swing=stride*s;
    let ankle=add(turn(v(s*(.18+lateral*.13*run),.085+Math.max(0,lift*s)*.14*run,0),heading),mul(move,swing*stepSize));
    if(action && lunge>.02) {
      const front=name==='right'?1:-.4;
      ankle=add(ankle,mul(reach,lunge*reachDistance*front));
    }
    if(jump>0) ankle=add(ankle,v(s*Math.min(.035,jump*.12),jump+Math.min(.13,jump*.4),Math.min(.15,jump*.5)));
    const hip=add(pelvis,turn(v(s*.145,-.045,0),pelvisYaw));
    ankle=add(ankle,mul(shift,jump>0?.85:.25));
    if(options.feet?.[name]&&!action)ankle={...options.feet[name]};
    if(from)ankle=mix(from.joints[`${name}Ankle`],ankle,blend);
    const footDelta=sub(ankle,hip),footHorizontal=Math.hypot(footDelta.x,footDelta.z);
    const legHorizontal=Math.sqrt(Math.max(0,.877**2-footDelta.y**2));
    if(footHorizontal>legHorizontal){ankle.x=hip.x+footDelta.x*legHorizontal/footHorizontal;ankle.z=hip.z+footDelta.z*legHorizontal/footHorizontal;}
    joints[`${name}Hip`]=hip;
    joints[`${name}Ankle`]=ankle;
    joints[`${name}Knee`]=bend(hip,ankle,.45,.43,turn(v(0,.1,-1),heading));
    joints[`${name}Shoulder`]=add(chest,turn(v(s*.245,.005,0),chestYaw));
  }
  const shoulder=joints.rightShoulder;
  // The racket face meets the exact authoritative contact, including side 1.
  const localArm=turn(unit(sub(racketHead,shoulder)),-chestYaw);
  // Transport a relaxed, downward elbow plane with the reach direction. A
  // fixed world pole flips when the swing crosses that pole's own axis.
  const armTurn=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),new THREE.Vector3(localArm.x,localArm.y,localArm.z));
  const elbowPlane=new THREE.Vector3(0,-1,.15).applyQuaternion(armTurn);
  const pole=turn(v(elbowPlane.x,elbowPlane.y,elbowPlane.z),chestYaw);
  // Solve the upper arm and combined forearm/shaft first, then the wrist.
  // The combined length limits wrist flexion while all three lengths stay exact.
  const lowerReach=clamp(length(sub(racketHead,shoulder))+.28,.677,.849);
  joints.rightElbow=bend(shoulder,racketHead,.32,lowerReach,pole);
  joints.rightWrist=bend(joints.rightElbow,racketHead,.31,.54,sub(shoulder,joints.rightElbow));
  const relaxedHand=turn(v(-.32,-.18,-.27-stride*.15*run),chestYaw);
  const supportingHand=turn(v(-.4,.04+active*.18,-.32-active*.13),chestYaw);
  joints.leftWrist=add(chest,mix(relaxedHand,supportingHand,action?smooth(active):0));
  if(from)joints.leftWrist=mix(from.joints.leftWrist,joints.leftWrist,blend);
  const leftDelta=sub(joints.leftWrist,joints.leftShoulder);
  if(length(leftDelta)>.628)joints.leftWrist=add(joints.leftShoulder,mul(unit(leftDelta),.628));
  joints.leftElbow=bend(joints.leftShoulder,joints.leftWrist,.32,.31,turn(v(-.2,-1,.1),chestYaw));
  // Keep the neck in its forward tracking cone when the shuttle passes behind;
  // atan2's +/-PI seam must not flip the head from one shoulder to the other.
  const look=shuttle?Math.atan2(-(shuttle.x-player.x)*sign,Math.max(.25,-(shuttle.z-player.z)*sign)):heading;
  const headYaw=heading+clamp(look-heading,-.45,.45)*(action?.stage==='prepare'?.85:.55);
  return {joints,racketHead,jump,crouch,actionType:type,active,heading,pelvisYaw,chestYaw,headYaw,racketRoll,stroke,lean};
}

const JOINT_PARENTS={pelvis:null,spine:'pelvis',chest:'spine',neck:'chest',head:'neck',
  leftHip:'pelvis',leftKnee:'leftHip',leftAnkle:'leftKnee',rightHip:'pelvis',rightKnee:'rightHip',rightAnkle:'rightKnee',
  leftShoulder:'chest',leftElbow:'leftShoulder',leftWrist:'leftElbow',rightShoulder:'chest',rightElbow:'rightShoulder',rightWrist:'rightElbow'};

export function makeAthlete(scene,index) {
  const root=new THREE.Group(); root.rotation.y=index===0?0:Math.PI; scene.add(root);
  const bones={};
  for(const [name,parent] of Object.entries(JOINT_PARENTS)) {
    const bone=new THREE.Bone();bone.name=name;bones[name]=bone;(parent?bones[parent]:root).add(bone);
  }
  const model=makeAthleteModel(root,bones,index);
  const skeleton=model.skin.skeleton;
  function mesh(parent,geometry,material) {const m=new THREE.Mesh(geometry,material);parent.add(m);return m;}
  const ground=new THREE.Group();scene.add(ground);
  function ring(radius,width,color,opacity){const r=mesh(ground,new THREE.RingGeometry(radius-width,radius,40),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));r.rotation.x=-Math.PI/2;r.position.y=.034;return r;}
  const halo=ring(.38,.026,index===0?0xfb785a:0x9cddcc,.55),selected=ring(.46,.035,0xffdf8c,.85);
  const shadow=mesh(ground,new THREE.CircleGeometry(.3,32),new THREE.MeshBasicMaterial({color:0x163c37,transparent:true,opacity:.23,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.028;
  return {root,bones,skeleton,...model,ground,halo,selected,shadow,moveCycle:0,previousSpeed:0,stop:0,index,motion:null};
}

function motionFor(visual,player,side,time,freeze,reset) {
  const sign=side===0?1:-1,position=v(player.x,0,player.z);
  const active=player.action&&time<=player.action.endsAt;
  let m=visual.motion;
  if(!m||reset||m.side!==side||time<m.time||length(sub(position,m.position))>.9){
    m={position,time,side,cycle:0,heading:0,speed:0,velocity:v(),acceleration:v(),brake:0,feet:{},inAction:Boolean(active)};
    for(const [name,s]of [['left',-1],['right',1]])m.feet[name]={world:v(player.x+s*.18*sign,.085,player.z),yaw:0,planted:true,id:0,progress:1};
    visual.motion=m;
  }
  const elapsed=Math.max(0,time-m.time),distance=length(sub(position,m.position));
  if(freeze||elapsed<=0)return m;
  const dt=Math.min(.1,elapsed),velocity=mul(sub(position,m.position),1/elapsed),speed=length(velocity);
  const blend=1-Math.exp(-dt*12);
  const acceleration=mul(sub(velocity,m.velocity),1/Math.max(.001,elapsed));
  m.acceleration=mix(m.acceleration,v(clamp(acceleration.x,-9,9),0,clamp(acceleration.z,-9,9)),blend);
  if(m.speed>1&&speed<.3)m.brake=.1;
  else m.brake*=Math.exp(-dt*12);
  m.speed+=(speed-m.speed)*blend;
  m.velocity=mix(m.velocity,velocity,blend);
  m.cycle+=distance*Math.PI*2/1.18;
  let heading=0;
  if(speed>.12){
    const local=mul(velocity,sign);
    heading=local.z>.1?clamp(-local.x*.18,-.45,.45):clamp(Math.atan2(-local.x,-local.z),-1.12,1.12);
  } else if(active)heading=m.heading;
  m.heading+=(heading-m.heading)*(1-Math.exp(-dt*8));
  const travel=unit(velocity);
  for(const [name,s]of [['left',-1],['right',1]]){
    const foot=m.feet[name],other=m.feet[name==='left'?'right':'left'];
    if(active){foot.planted=false;foot.yaw=m.heading;continue;}
    if(m.inAction){foot.planted=true;foot.progress=1;foot.world.y=.085;foot.yaw=m.heading;foot.id++;}
    const offset=turn(v(s*.18,0,0),m.heading);
    const hip=v(player.x+offset.x*sign,.085,player.z+offset.z*sign);
    const desired=add(hip,mul(travel,speed>.12?Math.min(.34,.17+speed*.04):0));
    if(!foot.planted){
      // Correct an airborne step early when the player reverses or releases the
      // stick. Once the foot approaches the floor its landing stays committed;
      // an existing ground contact is never rotated/slid to follow this target.
      if(foot.progress<.72){
        foot.target=mix(foot.target,desired,1-Math.exp(-dt*14));
        foot.targetYaw+=(m.heading-foot.targetYaw)*(1-Math.exp(-dt*12));
      }
      foot.progress=clamp(foot.progress+dt/(.18/(1+speed*.32)),0,1);
      foot.world=mix(foot.from,foot.target,smooth(foot.progress));
      foot.world.y=.085+Math.sin(foot.progress*Math.PI)*(foot.lift??.135);
      foot.yaw=foot.fromYaw+(foot.targetYaw-foot.fromYaw)*smooth(foot.progress);
      if(foot.progress===1){foot.planted=true;foot.id++;}
    }
    const behind=dot(sub(position,foot.world),travel);
    const displacement=Math.hypot(hip.x-foot.world.x,hip.z-foot.world.z);
    const overreach=displacement>.43;
    const settle=!m.inAction&&speed<=.12&&displacement>.2&&other.planted;
    if(foot.planted&&((speed>.12&&((behind>.12&&other.planted)||overreach))||settle)){
      foot.planted=false;foot.progress=0;foot.from={...foot.world};
      foot.fromYaw=foot.yaw;foot.targetYaw=m.heading;
      foot.target=desired;foot.lift=settle?.05:.135;
    }
  }
  m.inAction=Boolean(active);m.position=position;m.time=time;
  return m;
}

const UP=new THREE.Vector3(0,1,0), temp=new THREE.Vector3(), yawRotation=new THREE.Quaternion();
export function updateAthlete(visual,player,side,shuttle,time,dt,selected,freeze=false,reset=false) {
  const discard=reset||!visual.motion||side!==visual.motion.side||time<visual.motion.time||
    Math.hypot(player.x-visual.motion.position.x,player.z-visual.motion.position.z)>.9;
  if(freeze&&!discard&&visual.root.userData.pose){
    visual.wasFrozen=true;visual.selected.visible=selected;
    return visual.root.userData.pose;
  }
  const action=player.action&&time<=player.action.endsAt?player.action:null;
  const key=action?`${action.id}:${action.stage==='prepare'?'prepare':'stroke'}`:'ready';
  if(discard){visual.poseTransition=null;visual.poseKey=null;visual.wasFrozen=false;}
  const previousPose=discard?null:visual.root.userData.pose;
  if(previousPose&&(key!==visual.poseKey||visual.wasFrozen)){
    const striking=action&&action.stage!=='prepare';
    const canBlend=striking?time<action.contactAt:visual.wasFrozen||time-visual.poseTime<.25;
    visual.poseTransition=canBlend?{from:previousPose,start:time,end:striking?action.contactAt:time+.2}:null;
  }
  visual.wasFrozen=false;visual.poseKey=key;visual.poseTime=time;
  const transition=visual.poseTransition;
  const blend=transition?smooth((time-transition.start)/Math.max(.001,transition.end-transition.start)):1;
  if(blend===1)visual.poseTransition=null;
  // Both body and shuttle use authoritative positions: no separate contact lag.
  visual.root.position.set(player.x,0,player.z);visual.ground.position.set(player.x,0,player.z);
  const motion=motionFor(visual,player,side,time,freeze,reset),sign=side===0?1:-1;
  visual.moveCycle=motion.cycle;visual.previousSpeed=motion.speed;visual.stop=motion.brake;
  const feet={};for(const name of ['left','right']){const f=motion.feet[name].world;feet[name]=v((f.x-player.x)*sign,f.y,(f.z-player.z)*sign);}
  const pose=sampleAthletePose(player,side,shuttle,time,{moveCycle:motion.cycle,brake:player.action?0:motion.brake,
    speed:motion.speed,velocity:motion.velocity,acceleration:motion.acceleration,heading:motion.heading,feet,
    transition:transition&&blend<1?{from:transition.from,weight:blend}:null});
  pose.feet={};
  for(const name of ['left','right']){
    const ankle=pose.joints[`${name}Ankle`],foot=motion.feet[name],world=v(player.x+ankle.x*sign,ankle.y,player.z+ankle.z*sign);
    // Release a support that cannot reach the new hip position. This also clears
    // old anchors after a lunge/jump; an anatomical limit never stretches a leg.
    if(pose.actionType||length(sub(world,foot.world))>1e-6){
      if(!pose.actionType&&foot.planted)foot.id++;
      foot.world=world;
    }
    pose.feet[name]={planted:!pose.actionType&&pose.jump<.005&&foot.planted,id:foot.id};
  }
  if(pose.jump>.005||(transition?.from.jump>.005&&blend<1))motion.inAction=true;
  visual.root.rotation.y=(side===0?0:Math.PI)+pose.heading;
  const joints={};for(const [name,p]of Object.entries(pose.joints))joints[name]=turn(p,-pose.heading);
  for(const [name,parent]of Object.entries(JOINT_PARENTS)){const p=joints[name],q=parent?joints[parent]:v();visual.bones[name].position.set(p.x-q.x,p.y-q.y,p.z-q.z);}
  visual.bones.head.rotation.y=pose.headYaw-pose.heading;
  for(const name of ['left','right'])visual.bones[`${name}Ankle`].rotation.y=(pose.actionType?pose.heading:motion.feet[name].yaw)-pose.heading;
  visual.skin.userData.updatePose(joints,pose);
  visual.shorts.rotation.y=pose.pelvisYaw-pose.heading;
  for(const hem of visual.hems){const thigh=sub(joints[`${hem.name}Knee`],joints[`${hem.name}Hip`]);temp.set(thigh.x,thigh.y,thigh.z).normalize();hem.mesh.position.copy(temp).multiplyScalar(hem.offset);hem.mesh.quaternion.setFromUnitVectors(UP,temp);}
  const wrist=joints.rightWrist,racketHead=turn(pose.racketHead,-pose.heading);visual.racket.position.set(wrist.x,wrist.y,wrist.z);temp.set(racketHead.x-wrist.x,racketHead.y-wrist.y,racketHead.z-wrist.z);visual.racket.quaternion.setFromUnitVectors(UP,temp.normalize());
  visual.racket.quaternion.multiply(yawRotation.setFromAxisAngle(UP,pose.racketRoll));
  // The gripping palm follows pronation with the handle, while the wrist stays
  // on the original analytical joint. No visual offset reaches into physics.
  visual.hands.right.quaternion.copy(visual.racket.quaternion);
  const leftForearm=sub(joints.leftWrist,joints.leftElbow);
  visual.hands.left.quaternion.setFromUnitVectors(UP,temp.set(leftForearm.x,leftForearm.y,leftForearm.z).normalize());
  visual.selected.visible=selected;visual.halo.material.opacity=selected?.75:.36;visual.shadow.scale.setScalar(1-pose.jump*.22);visual.shadow.material.opacity=.23-pose.jump*.12;
  visual.root.userData.pose=pose;
  return pose;
}
