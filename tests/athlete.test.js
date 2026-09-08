import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { sampleAthletePose, makeAthlete, updateAthlete } from '../src/athlete.js';
import { createMatch, stepMatch, pauseMatch, resumeMatch } from '../shared/game.js';

const player = {x:0,z:3.8,vx:0,vz:0,role:'balanced'};
const ball = {x:.7,y:2.8,z:3.4};
const action = {id:1,type:'smash',stage:'windup',startedAt:1,contactAt:1.2,endsAt:1.8,
  contact:ball,origin:{x:0,z:3.8},jumpHeight:.6,reach:{x:.5,z:-.4},serving:false};

test('high smash has crouch, airborne contact, tucked knees, then landing absorption',()=>{
  const pose = t=>sampleAthletePose({...player,action},0,ball,t);
  const load=pose(1),contact=pose(1.2),landing=pose(1.53),ready=sampleAthletePose(player,0,ball,2);
  assert.ok(load.joints.pelvis.y < ready.joints.pelvis.y);
  assert.ok(contact.jump > .45);
  assert.ok(contact.joints.leftAnkle.y > .25 && contact.joints.rightAnkle.y > .25);
  assert.ok(landing.jump < .05);
  assert.ok(landing.joints.pelvis.y < ready.joints.pelvis.y);
});

test('racket face reaches authoritative contact for either side without moving player root',()=>{
  for(const side of [0,1]) {
    const s=side===0?1:-1;
    const p={...player,z:player.z*s,action:{...action,contact:{x:ball.x*s,y:ball.y,z:ball.z*s}}};
    const pose=sampleAthletePose(p,side,p.action.contact,1.2);
    assert.ok(Math.abs(pose.racketHead.x*s+p.x-p.action.contact.x)<1e-8);
    assert.ok(Math.abs(pose.racketHead.z*s+p.z-p.action.contact.z)<1e-8);
    assert.ok(Math.abs(pose.racketHead.y-p.action.contact.y)<1e-8);
  }
});

test('low far pickup plants an extended front foot, lowers pelvis and reaches ball',()=>{
  const low={x:.6,y:.4,z:2.7};
  const a={...action,type:'drop',jumpHeight:0,contact:low,reach:{x:.6,z:-1.1}};
  const p=sampleAthletePose({...player,action:a},0,low,1.2);
  const ready=sampleAthletePose(player,0,low,1.2);
  assert.ok(p.joints.pelvis.y < ready.joints.pelvis.y-.15);
  assert.ok(Math.abs(p.joints.rightAnkle.z-p.joints.leftAnkle.z)>.65);
  assert.ok(Math.hypot(p.racketHead.x-.6,p.racketHead.y-.4,p.racketHead.z+1.1)<1e-8);
});

test('drop and smash followthrough differ and each player owns its action',()=>{
  const smash=sampleAthletePose({...player,action},0,ball,1.32);
  const drop=sampleAthletePose({...player,action:{...action,type:'drop',jumpHeight:0}},0,ball,1.32);
  const idle=sampleAthletePose(player,0,ball,1.32);
  assert.ok(Math.hypot(smash.racketHead.x-drop.racketHead.x,smash.racketHead.y-drop.racketHead.y,smash.racketHead.z-drop.racketHead.z)>.4);
  assert.equal(idle.actionType,null);
  assert.equal(idle.jump,0);
});

test('sideways footwork uses lateral steps rather than the forward running pose',()=>{
  const side=sampleAthletePose({...player,vx:4},0,ball,.19);
  const forward=sampleAthletePose({...player,vz:-4},0,ball,.19);
  assert.ok(Math.abs(side.joints.rightAnkle.x-side.joints.leftAnkle.x) > Math.abs(forward.joints.rightAnkle.x-forward.joints.leftAnkle.x)+.15);
  assert.ok(Math.abs(forward.joints.rightAnkle.z-forward.joints.leftAnkle.z)>.25);
});

test('rendered hierarchical rig keeps racket center on contact for both players',()=>{
  for(const side of [0,1]) {
    const sign=side===0?1:-1,scene=new THREE.Scene(),rig=makeAthlete(scene,side);
    const contact={x:ball.x*sign,y:ball.y,z:ball.z*sign};
    const p={...player,z:player.z*sign,action:{...action,contact}};
    updateAthlete(rig,p,side,contact,1.2,1/60,true);
    scene.updateMatrixWorld(true);
    const face=rig.racket.localToWorld(new THREE.Vector3(0,.54,0));
    assert.ok(face.distanceTo(new THREE.Vector3(contact.x,contact.y,contact.z))<1e-7);
    assert.equal(rig.bones.rightWrist.parent,rig.bones.rightElbow);
    assert.equal(rig.bones.rightElbow.parent,rig.bones.rightShoulder);
    assert.equal(rig.bones.leftAnkle.parent,rig.bones.leftKnee);
  }
});

test('paused articulated rig and racket hold exactly the same pose across frames',()=>{
  const rig=makeAthlete(new THREE.Scene(),0),p={...player,vx:3,action};
  updateAthlete(rig,p,0,ball,1.17,1/60,true);
  const pose=structuredClone(rig.root.userData.pose);
  for(let i=0;i<60;i++)updateAthlete(rig,p,0,ball,1.17,1/60,true,true);
  assert.deepEqual(rig.root.userData.pose,pose);
});

test('real rule actions keep arms and legs within anatomical bone lengths at high and edge contacts',()=>{
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
  for(const type of ['clear','drop','smash'])for(const height of [.4,1.6,3.2])for(const [dx,dz]of [[0,0],[-1.44,0],[1.44,0],[0,-1.44],[0,1.44]])for(const side of [0,1]){
    const state=createMatch(),sign=side===0?1:-1;
    state.phase='rally';Object.assign(state.players[side],{x:0,z:3.8*sign});
    Object.assign(state.shuttle,{x:dx*sign,y:height,z:(3.8+dz)*sign,vx:0,vy:0,vz:0,active:true,lastHit:1-side});
    stepMatch(state,side===0?[{shot:type},{}]:[{}, {shot:type}],1/120);
    for(let i=0;i<25&&state.players[side].action?.stage!=='contact';i++)stepMatch(state,[{},{}],1/120);
    const player=state.players[side];assert.ok(player.action,`${type} ${height} ${dx},${dz} started`);
    const a=player.action;
    for(const time of [a.startedAt,a.contactAt-.025,a.contactAt,a.contactAt+.12,a.contactAt+.27,a.endsAt]){
      const pose=sampleAthletePose(player,side,state.shuttle,time),j=pose.joints;
      for(const limb of ['left','right'])for(const [from,to,expected]of [['Shoulder','Elbow',.32],['Elbow','Wrist',.31],['Hip','Knee',.45],['Knee','Ankle',.43]]){
        const size=distance(j[limb+from],j[limb+to]);
        assert.ok(Math.abs(size-expected)<.012,`${type} h${height} offset${dx},${dz} t${time} ${limb}${from}-${to}=${size}`);
      }
      if(time===a.contactAt)assert.ok(distance(pose.racketHead,{x:(a.contact.x-player.x)*sign,y:a.contact.y,z:(a.contact.z-player.z)*sign})<1e-8);
    }
  }
});

test('gait advances by actual distance rather than reported speed or render frame count',()=>{
  const stationary=makeAthlete(new THREE.Scene(),0);
  for(let i=0;i<60;i++)updateAthlete(stationary,{...player,vx:4},0,ball,i/60,1/60,true);
  assert.equal(stationary.moveCycle,0,'velocity metadata alone cannot make planted feet treadmill');
  const walk=count=>{
    const rig=makeAthlete(new THREE.Scene(),0);
    for(let i=0;i<=count;i++)updateAthlete(rig,{...player,x:i*.8/count,vx:2},0,ball,i*.4/count,.4/count,true);
    return rig.moveCycle;
  };
  assert.ok(walk(80)>.5);
  assert.ok(Math.abs(walk(80)-walk(10))<1e-8,'identical travel has identical gait phase');
});

test('support feet keep the same world contact throughout each planted interval',()=>{
  const scene=new THREE.Scene(),rig=makeAthlete(scene,0);
  let previous={},stablePairs=0;
  for(let i=0;i<=100;i++){
    const pose=updateAthlete(rig,{...player,x:i*.02,vx:2},0,ball,i*.01,.01,true);
    scene.updateMatrixWorld(true);
    for(const foot of ['left','right']){
      const placement=pose.feet?.[foot];assert.ok(placement,'pose exposes actual support placement');
      const world=rig.bones[`${foot}Ankle`].getWorldPosition(new THREE.Vector3());
      const rotation=rig.bones[`${foot}Ankle`].getWorldQuaternion(new THREE.Quaternion());
      if(placement.planted&&previous[foot]?.planted&&placement.id===previous[foot].id){
        assert.ok(world.distanceTo(previous[foot].world)<1e-7,`${foot} support foot slipped`);
        assert.ok(rotation.angleTo(previous[foot].rotation)<1e-7,`${foot} planted shoe rotated with the torso`);stablePairs++;
      }
      previous[foot]={...placement,world,rotation};
    }
  }
  assert.ok(stablePairs>30,'walking includes stable support, not permanently airborne feet');
});

test('a direction change turns progressively and reset removes old stride and foot anchors',()=>{
  const scene=new THREE.Scene(),rig=makeAthlete(scene,0);
  let previousYaw=0;
  for(let i=0;i<=30;i++){
    updateAthlete(rig,{...player,x:i*.035,vx:2.1},0,ball,i/60,1/60,true);
    assert.ok(Math.abs(rig.root.rotation.y-previousYaw)<.3,'turn cannot snap in one frame');
    previousYaw=rig.root.rotation.y;
  }
  assert.ok(rig.root.rotation.y<-.3,'body visibly turns into its travel');
  const resetPlayer={...player,x:-1,z:-3.8,vx:0};
  const pose=updateAthlete(rig,resetPlayer,1,ball,0,1/60,true,false,true);
  assert.equal(rig.moveCycle,0);
  assert.ok(Math.abs(rig.root.rotation.y-Math.PI)<1e-8);
  scene.updateMatrixWorld(true);
  for(const foot of ['left','right'])assert.ok(rig.bones[`${foot}Ankle`].getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(-1,.085,-3.8))<.4);
  const saved=structuredClone(pose);
  for(let i=0;i<30;i++)updateAthlete(rig,resetPlayer,1,ball,0,1/60,true,true);
  assert.deepEqual(rig.root.userData.pose,saved);
});

test('stroke uncoils the shoulders and racket face independently then returns to ready',()=>{
  const poses=[1.03,1.2,1.36,1.8].map(t=>sampleAthletePose({...player,action},0,ball,t));
  const shoulderTwist=p=>p.joints.rightShoulder.z-p.joints.leftShoulder.z;
  assert.ok(Math.abs(shoulderTwist(poses[0])-shoulderTwist(poses[2]))>.15,'shoulders turn through the stroke');
  assert.ok(Math.abs(poses[0].racketRoll-poses[2].racketRoll)>.4,'forearm pronation changes racket face');
  assert.ok(Math.abs(poses[3].chestYaw)<.01,'followthrough recovers to ready');
});

test('turned moving rig still contacts the authoritative shuttle without stretching arms',()=>{
  const scene=new THREE.Scene(),rig=makeAthlete(scene,0);
  for(let i=0;i<=20;i++)updateAthlete(rig,{...player,x:i*.025,vx:1.5},0,ball,i/60,1/60,true);
  const contact={x:1.15,y:2.8,z:3.35};
  const p={...player,x:.5,action:{...action,contact}};
  updateAthlete(rig,p,0,contact,1.2,1/60,true);
  scene.updateMatrixWorld(true);
  assert.ok(rig.racket.localToWorld(new THREE.Vector3(0,.54,0)).distanceTo(new THREE.Vector3(contact.x,contact.y,contact.z))<1e-7);
  const elbow=rig.bones.rightElbow.getWorldPosition(new THREE.Vector3()),wrist=rig.bones.rightWrist.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(elbow.distanceTo(wrist)-.31)<.012);
});

test('a fast stop absorbs weight and recovers without advancing the distance-driven stride',()=>{
  const rig=makeAthlete(new THREE.Scene(),0);
  let running;
  for(let i=0;i<=30;i++)running=updateAthlete(rig,{...player,z:3.8-i*.05,vz:-3},0,ball,i/60,1/60,true);
  const distancePhase=rig.moveCycle,p={...player,z:2.3};
  const stopped=updateAthlete(rig,p,0,ball,31/60,1/60,true);
  assert.ok(stopped.joints.pelvis.y<running.joints.pelvis.y-.04,'braking absorbs body weight');
  assert.equal(rig.moveCycle,distancePhase);
  let recovered;
  for(let i=32;i<=100;i++)recovered=updateAthlete(rig,p,0,ball,i/60,1/60,true);
  assert.ok(recovered.joints.pelvis.y>stopped.joints.pelvis.y+.06);
  assert.equal(rig.moveCycle,distancePhase);
});

test('a rig first observed in midair settles its foot anchors when the action has ended',()=>{
  const rig=makeAthlete(new THREE.Scene(),0),p={...player,action};
  updateAthlete(rig,p,0,ball,action.contactAt,1/60,true);
  const landed=updateAthlete(rig,player,0,ball,action.endsAt+.1,1/60,true);
  for(const name of ['left','right']){
    assert.ok(Math.abs(landed.joints[`${name}Ankle`].y-.085)<1e-7,'late snapshot cannot leave a shoe hovering');
    assert.equal(landed.feet[name].planted,true);
  }
});

const strokeState=()=>{
  const state=createMatch();state.phase='rally';state.service.active=false;
  Object.assign(state.players[0],{x:0,z:3.8});
  Object.assign(state.shuttle,{x:.3,y:3.1,z:3.6,vy:-.2,vx:0,vz:0,active:true,lastHit:1});
  return state;
};
const poseDistance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
test('real preparation, release and cancellation blend from the displayed pose',()=>{
  for(const shot of ['clear','smash']){
    const state=strokeState(),rig=makeAthlete(new THREE.Scene(),0);
    const draw=()=>updateAthlete(rig,state.players[0],0,state.shuttle,state.time,1/120,true);
    const ready=draw();stepMatch(state,[{prepare:shot},{}],1/60);const entered=draw();
    assert.ok(poseDistance(ready.racketHead,entered.racketHead)<.15,`${shot} preparation snapped`);
    assert.ok(Math.abs(ready.joints.pelvis.y-entered.joints.pelvis.y)<.03);
    for(let i=0;i<10;i++){stepMatch(state,[{prepare:shot},{}],1/60);draw();}
    const held=structuredClone(rig.root.userData.pose);
    stepMatch(state,[{shot},{}],1/120);const released=draw();
    assert.ok(poseDistance(held.racketHead,released.racketHead)<.18,`${shot} release snapped to a different backswing`);
    for(let i=0;i<25&&state.players[0].action?.stage!=='contact';i++){stepMatch(state,[{},{}],1/120);draw();}
    const a=state.players[0].action;assert.equal(a?.stage,'contact');
    const contact=rig.root.userData.pose.racketHead;
    assert.ok(poseDistance(contact,{x:a.contact.x-state.players[0].x,y:a.contact.y,z:a.contact.z-state.players[0].z})<1e-7);
  }
  const state=strokeState(),rig=makeAthlete(new THREE.Scene(),0);
  for(let i=0;i<12;i++){stepMatch(state,[{prepare:'smash'},{}],1/60);updateAthlete(rig,state.players[0],0,state.shuttle,state.time,1/60,true);}
  const held=structuredClone(rig.root.userData.pose);
  stepMatch(state,[{},{}],1/60);const cancelled=updateAthlete(rig,state.players[0],0,state.shuttle,state.time,1/60,true);
  assert.ok(poseDistance(held.racketHead,cancelled.racketHead)<.15,'cancelled preparation snapped down');
});

test('real pause clearing a windup preserves the displayed jump and resumes with a landing',()=>{
  const state=strokeState(),rig=makeAthlete(new THREE.Scene(),0);
  const draw=freeze=>updateAthlete(rig,state.players[0],0,state.shuttle,state.time,1/120,true,freeze);
  draw(false);stepMatch(state,[{shot:'smash'},{}],1/120);draw(false);
  for(let i=0;i<10;i++){stepMatch(state,[{},{}],1/120);draw(false);}
  const before=structuredClone(rig.root.userData.pose);assert.ok(before.jump>.15);
  assert.equal(pauseMatch(state,0),true);assert.equal(state.players[0].action,null);
  for(let i=0;i<20;i++)assert.deepEqual(draw(true),before,'pause cannot re-sample a cleared action');
  resumeMatch(state);
  for(let i=0;i<220&&state.phase==='countdown';i++){stepMatch(state,[{},{}],1/60);if(state.phase==='countdown')draw(true);}
  const resuming=draw(false);
  assert.ok(poseDistance(resuming.racketHead,before.racketHead)<.15,'resumption must begin from the held pose');
  for(let i=0;i<50;i++){stepMatch(state,[{},{}],1/120);draw(false);}
  const landed=rig.root.userData.pose;
  assert.ok(landed.jump<.01);
  for(const name of ['left','right'])assert.ok(Math.abs(landed.joints[`${name}Ankle`].y-.085)<1e-7);
});

test('a shuttle passing behind the head does not flip the neck across the angle seam',()=>{
  const left=sampleAthletePose(player,0,{x:-.001,y:2,z:4.8},1),right=sampleAthletePose(player,0,{x:.001,y:2,z:4.8},1);
  assert.ok(Math.abs(left.headYaw-right.headYaw)<.02);
});

test('sculpted grip follows the shaft through real strokes without moving the authoritative face',()=>{
  for(const side of [0,1])for(const type of ['clear','drop','smash']){
    const sign=side===0?1:-1,state=strokeState(),scene=new THREE.Scene(),rig=makeAthlete(scene,side);
    Object.assign(state.players[side],{x:0,z:3.8*sign});
    Object.assign(state.shuttle,{x:.3*sign,y:type==='drop'?.65:3.1,z:3.6*sign,lastHit:1-side});
    const draw=()=>{
      updateAthlete(rig,state.players[side],side,state.shuttle,state.time,1/120,true);
      scene.updateMatrixWorld(true);
      assert.ok(rig.hands?.right,'the grip needs its own shaft-aligned visual adapter');
      const grip=rig.racket.localToWorld(new THREE.Vector3(0,.06,0));
      const palm=rig.hands.right.localToWorld(new THREE.Vector3(0,.06,0));
      assert.ok(grip.distanceTo(palm)<1e-7,'the fingers left the handle during pronation');
      assert.ok(rig.hands.right.getWorldQuaternion(new THREE.Quaternion()).angleTo(rig.racket.getWorldQuaternion(new THREE.Quaternion()))<1e-7);
    };
    draw();stepMatch(state,side===0?[{shot:type},{}]:[{}, {shot:type}],1/120);draw();
    for(let i=0;i<30&&state.players[side].action?.stage!=='contact';i++){stepMatch(state,[{},{}],1/120);draw();}
    const action=state.players[side].action;assert.equal(action?.stage,'contact');
    assert.ok(rig.racket.localToWorld(new THREE.Vector3(0,.54,0)).distanceTo(new THREE.Vector3(action.contact.x,action.contact.y,action.contact.z))<1e-7);
    for(let i=0;i<35;i++){stepMatch(state,[{},{}],1/120);draw();}
  }
});

test('real pause freezes every appearance mesh after the rules clear the windup',()=>{
  const state=strokeState(),scene=new THREE.Scene(),rig=makeAthlete(scene,0);
  const draw=freeze=>{updateAthlete(rig,state.players[0],0,state.shuttle,state.time,1/120,true,freeze);scene.updateMatrixWorld(true);};
  draw(false);stepMatch(state,[{shot:'smash'},{}],1/120);draw(false);
  for(let i=0;i<10;i++){stepMatch(state,[{},{}],1/120);draw(false);}
  const matrices=()=>{const all=[];rig.root.traverse(o=>{if(o.isMesh||o.isLine)all.push(o.matrixWorld.toArray());});return all;};
  const before=matrices();assert.ok(before.length>10);
  assert.equal(pauseMatch(state,0),true);assert.equal(state.players[0].action,null);
  for(let i=0;i<20;i++){draw(true);assert.deepEqual(matrices(),before);}
});

test('the supporting hand crosses preparation and recovery thresholds without teleporting',()=>{
  const state=strokeState();Object.assign(state.shuttle,{x:0,y:3.2,z:2.36,vy:0});
  stepMatch(state,[{shot:'clear'},{}],1/120);const p=state.players[0],a=p.action;assert.ok(a);
  let previous;
  for(let time=a.startedAt;time<a.endsAt;time+=.001){
    const pose=sampleAthletePose(p,0,state.shuttle,time);
    const hand=new THREE.Vector3(pose.joints.leftWrist.x-pose.joints.chest.x,pose.joints.leftWrist.y-pose.joints.chest.y,pose.joints.leftWrist.z-pose.joints.chest.z);
    if(previous)assert.ok(hand.distanceTo(previous)<.025,'supporting hand jumped across an activity threshold');
    previous=hand;
  }
});

test('the racket passes through contact with a continuous nonzero swing velocity',()=>{
  const state=strokeState();stepMatch(state,[{shot:'smash'},{}],1/120);
  const p=state.players[0],a=p.action,epsilon=.0001;
  const points=[-epsilon,0,epsilon].map(t=>sampleAthletePose(p,0,state.shuttle,a.contactAt+t).racketHead);
  const velocity=(a,b)=>new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z).divideScalar(epsilon);
  const incoming=velocity(points[0],points[1]),outgoing=velocity(points[1],points[2]);
  assert.ok(incoming.length()>.5&&outgoing.length()>.5,'the swing stopped at the instant of impact');
  assert.ok(incoming.clone().normalize().dot(outgoing.clone().normalize())>.98,'the swing changed direction abruptly at contact');
});

test('real close-body strokes never fold the gripping wrist backwards',()=>{
  for(const type of ['clear','drop','smash'])for(const h of [.4,1.6,3.2])for(const [dx,dz]of [[0,0],[-1.44,0],[1.44,0],[0,-1.44],[0,1.44]]){
    const state=strokeState();Object.assign(state.shuttle,{x:dx,y:h,z:3.8+dz,vy:0});
    stepMatch(state,[{shot:type},{}],1/120);const p=state.players[0],a=p.action;assert.ok(a);
    for(let time=a.startedAt;time<a.endsAt;time+=1/120){
      const pose=sampleAthletePose(p,0,state.shuttle,time),j=pose.joints;
      const forearm=new THREE.Vector3(j.rightWrist.x-j.rightElbow.x,j.rightWrist.y-j.rightElbow.y,j.rightWrist.z-j.rightElbow.z);
      const shaft=new THREE.Vector3(pose.racketHead.x-j.rightWrist.x,pose.racketHead.y-j.rightWrist.y,pose.racketHead.z-j.rightWrist.z);
      assert.ok(forearm.angleTo(shaft)<Math.PI*80/180,`${type} ${h} ${dx},${dz} wrist folded ${forearm.angleTo(shaft)*180/Math.PI} degrees`);
      assert.ok(Math.abs(forearm.length()-.31)<.012);
      assert.ok(Math.abs(shaft.length()-.54)<1e-7);
    }
  }
});

test('a legal close-body rear pickup crosses the shoulder without a body or wrist snap',()=>{
  const state=createMatch();state.phase='rally';state.service.active=false;
  Object.assign(state.players[0],{x:0,z:3.8});
  Object.assign(state.shuttle,{x:.22961005941905388,y:1.2,z:4.354327719506772,
    vx:0,vy:0,vz:0,active:true,lastHit:1});
  const rig=makeAthlete(new THREE.Scene(),0);
  let previous=updateAthlete(rig,state.players[0],0,state.shuttle,state.time,.001,true);
  for(let i=0;i<450;i++){
    stepMatch(state,[i===0?{shot:'drop'}:{},{}],.001);
    const pose=updateAthlete(rig,state.players[0],0,state.shuttle,state.time,.001,true);
    assert.ok(poseDistance(previous.joints.pelvis,pose.joints.pelvis)<.025,
      `body snapped at ${state.time}s`);
    assert.ok(poseDistance(previous.joints.rightWrist,pose.joints.rightWrist)<.04,
      `gripping hand snapped at ${state.time}s`);
    previous=pose;
  }
});

test('ready stance keeps both elbows below the shoulders and the racket above the gripping hand',()=>{
  const pose=sampleAthletePose(player,0,ball,0),j=pose.joints;
  assert.ok(j.rightElbow.y<j.rightShoulder.y-.12);
  assert.ok(j.leftElbow.y<j.leftShoulder.y-.12);
  assert.ok(j.rightWrist.z<j.rightElbow.z-.1,'the forearm reaches forward from the elbow');
  assert.ok(pose.racketHead.y>j.rightWrist.y+.08,'the racket is held up, not dangling from the wrist');
});

test('a real shortened windup still reaches the exact contact without a next-frame jump',()=>{
  const state=strokeState();
  Object.assign(state.shuttle,{x:Math.cos(Math.PI*7/8)*.6,y:2,z:3.8+Math.sin(Math.PI*7/8)*.6,vy:0});
  stepMatch(state,[{shot:'smash'},{}],1/120);
  for(let i=0;i<30&&state.players[0].action?.stage!=='contact';i++)stepMatch(state,[{},{}],1/120);
  const p=state.players[0],a=p.action;
  assert.ok(a.contactAt-a.startedAt<.025,'fixture reaches the short contact window');
  const pose=sampleAthletePose(p,0,state.shuttle,a.contactAt);
  assert.ok(poseDistance(pose.racketHead,{x:a.contact.x-p.x,y:a.contact.y,z:a.contact.z-p.z})<1e-8);
  const next=sampleAthletePose(p,0,state.shuttle,a.contactAt+.001);
  assert.ok(poseDistance(pose.racketHead,next.racketHead)<.03);
  assert.ok(poseDistance(pose.joints.pelvis,next.joints.pelvis)<.03);
});

test('high cross-body recovery transports its elbow plane without reversing the bend',()=>{
  const state=strokeState();Object.assign(state.shuttle,{x:-.6,y:3.2,z:3.8,vy:0});
  stepMatch(state,[{shot:'drop'},{}],1/120);
  for(let i=0;i<30&&state.players[0].action?.stage!=='contact';i++)stepMatch(state,[{},{}],1/120);
  const p=state.players[0],a=p.action;let previous;
  for(let t=a.contactAt;t<a.endsAt;t+=.001){
    const pose=sampleAthletePose(p,0,state.shuttle,t);
    if(previous){
      assert.ok(poseDistance(previous.joints.rightElbow,pose.joints.rightElbow)<.04);
      assert.ok(poseDistance(previous.joints.rightWrist,pose.joints.rightWrist)<.06);
    }
    previous=pose;
  }
});

test('an airborne recovery step redirects after a reversal and a stop settles into a usable stance',()=>{
  const rig=makeAthlete(new THREE.Scene(),0);let time=0,x=0,changed=false;
  updateAthlete(rig,player,0,ball,time,1/120,true);
  for(let i=0;i<36;i++){time+=1/120;x+=.025;updateAthlete(rig,{...player,x,vx:3},0,ball,time,1/120,true);}
  for(let i=0;i<36;i++){
    const before=Object.fromEntries(Object.entries(rig.motion.feet).map(([name,f])=>[name,{id:f.id,progress:f.progress,target:f.target&&{...f.target}}]));
    time+=1/120;x-=.025;updateAthlete(rig,{...player,x,vx:-3},0,ball,time,1/120,true);
    for(const [name,f]of Object.entries(rig.motion.feet)){
      const old=before[name];
      if(old.target&&old.id===f.id&&old.progress>0&&f.progress>old.progress&&f.target.x<old.target.x-.0001)changed=true;
    }
  }
  assert.ok(changed,'a foot already in flight adapts before committing to its old landing direction');
  for(let i=0;i<240;i++){time+=1/120;updateAthlete(rig,{...player,x},0,ball,time,1/120,true);}
  for(const [name,sign]of [['left',-1],['right',1]]){
    const foot=rig.motion.feet[name];
    assert.ok(foot.planted);
    assert.ok(Math.hypot(foot.world.x-x-sign*.18,foot.world.z-player.z)<.23,'stopping cannot leave the next stroke in a twisted overextended stance');
  }
});
