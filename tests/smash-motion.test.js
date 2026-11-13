import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleSmashMotion } from '../src/smash-motion.js';
import { sampleAthletePose } from '../src/athlete.js';
import { sampleAthletePose as samplePreviousPose } from '../src/preview/smash-baseline.js';
const player={x:0,z:3.8,vx:0,vz:0};
const action={id:1,type:'smash',stage:'windup',startedAt:1,contactAt:1.14,endsAt:1.56,
  contact:{x:.35,y:2.84,z:3.6},jumpHeight:.32};

test('smash hips begin uncoiling while chest is still loading',()=>{
  const early=sampleSmashMotion(action,1+.14*.32),late=sampleSmashMotion(action,1+.14*.43);
  assert.ok(late.hip>early.hip);
  assert.ok(late.chest<early.chest);
});
test('all role recovery durations finish at ready without a hanging jump or twist',()=>{
  for(const duration of [.378,.42,.462]){
    const a={...action,endsAt:action.contactAt+duration};
    const pose=sampleAthletePose({...player,action:a},0,a.contact,a.endsAt);
    assert.equal(pose.jump,0);assert.equal(pose.crouch,0);
    assert.ok(Math.abs(pose.chestYaw)<1e-9);assert.ok(Math.abs(pose.pelvisYaw)<1e-9);
    for(const foot of ['left','right'])assert.ok(Math.abs(pose.joints[foot+'Ankle'].y-.085)<1e-9);
  }
});
test('grounded smash does not slide its feet through the airborne scissor trajectory',()=>{
  const a={...action,jumpHeight:0,contact:{...action.contact,y:2.1}};
  for(let t=1;t<=1.56;t+=1/240){const m=sampleSmashMotion(a,t);
    for(const f of Object.values(m.feet))assert.ok(f.y===0 && f.z===0);
  }
});

test('holding smash with a distant incoming shuttle keeps the rig grounded at the player',async()=>{
  const {createMatch,stepMatch}=await import('../shared/game.js');
  for(const side of [0,1]){
    const state=createMatch(),sign=side===0?1:-1;
    state.phase='rally';state.service.active=false;state.time=1;
    const p=state.players[side];
    Object.assign(p,{x:0,z:3.8*sign,vx:0,vz:0});
    Object.assign(state.shuttle,{x:2.5*sign,y:4.7,z:-4.5*sign,
      vx:-2*sign,vy:2,vz:9*sign,active:true,lastHit:1-side});
    const inputs=[{},{}];
    inputs[side]={prepare:'smash',charge:1};
    let loadedPose;
    for(let frame=0;frame<60;frame++){
      stepMatch(state,inputs,1/60);
      assert.equal(p.action.stage,'prepare');
      const pose=sampleAthletePose(p,side,state.shuttle,state.time);
      const {pelvis,leftAnkle,rightAnkle}=pose.joints;
      assert.ok(Math.hypot(pelvis.x,pelvis.z)<.35,'the rig must stay over its court position');
      assert.equal(pose.jump,0);
      assert.equal(leftAnkle.y,.085);
      assert.equal(rightAnkle.y,.085);
      if(frame===12)loadedPose=pose;
      if(frame>12){
        assert.deepEqual(pose.joints,loadedPose.joints,'the loaded stance must stay steady as the shuttle moves');
        assert.deepEqual(pose.racketHead,loadedPose.racketHead);
      }
    }
    stepMatch(state,[{},{}],1/60);
    assert.equal(p.action,null);
    assert.equal(state.hitId,0);
  }
});
test('smash racket travels through exact mirrored contact with continuous impact velocity',()=>{
  const h=1e-5;
  for(const side of [0,1]){
    const sign=side? -1:1;
    const a={...action,contact:{x:.35*sign,y:2.84,z:3.6*sign}};
    const p={...player,z:3.8*sign,action:a};
    const samples=[-h,0,h].map(dt=>sampleAthletePose(p,side,a.contact,a.contactAt+dt).racketHead);
    assert.ok(Math.hypot(samples[1].x-.35,samples[1].y-2.84,samples[1].z+.2)<1e-8);
    for(const axis of ['x','y','z']){
      const before=(samples[1][axis]-samples[0][axis])/h,after=(samples[2][axis]-samples[1][axis])/h;
      assert.ok(Math.abs(after-before)<.03,axis+' impact velocity must not stop or jump');
    }
  }
});

test('all arm joints close to the ready pose when the smash action ends',()=>{
  for(const duration of [.378,.42,.462]){
    const a={...action,endsAt:action.contactAt+duration};
    const last=sampleAthletePose({...player,action:a},0,a.contact,a.endsAt);
    const ready=sampleAthletePose(player,0,a.contact,a.endsAt);
    for(const joint of ['rightShoulder','rightElbow','rightWrist','leftElbow','leftWrist']){
      const p=last.joints[joint],q=ready.joints[joint];
      assert.ok(Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)<1e-7,joint+' must not snap at action removal');
    }
  }
});

test('dense smash arm sampling reduces peak joint steps against the previous runtime',()=>{
  const segments=[['rightShoulder','rightElbow'],['rightElbow','rightWrist'],['pelvis','chest']];
  function peak(sample,a){
    let previous,maximum=0;
    for(let i=0;i<=280;i++){
      const j=sample({...player,action:a},0,a.contact,a.startedAt+i/480).joints;
      const directions=segments.map(([from,to])=>{
        const v=[j[to].x-j[from].x,j[to].y-j[from].y,j[to].z-j[from].z],length=Math.hypot(...v);
        return v.map(x=>x/length);
      });
      if(previous)directions.forEach((d,k)=>{
        const dot=d.reduce((sum,x,n)=>sum+x*previous[k][n],0);
        maximum=Math.max(maximum,Math.acos(Math.max(-1,Math.min(1,dot))));
      });
      previous=directions;
    }
    return maximum;
  }
  for(const height of [2.1,2.84,3.2]){
    const a={...action,jumpHeight:Math.max(0,height-2.5),contact:{...action.contact,y:height}};
    assert.ok(peak(sampleAthletePose,a)<peak(samplePreviousPose,a),height+' peak joint change increased');
  }
});

// Exercise the same prepare -> release sequence as the in-game comparison.
// Curve key ordering alone does not prove the transition system displays it.
test('played smash displays elbow lead and hip drive before chest rotation',async()=>{
  const THREE=await import('three');
  const {createMatch,stepMatch}=await import('../shared/game.js');
  const {makeAthlete,updateAthlete}=await import('../src/athlete.js');
  for(const side of [0,1])for(const kind of ['standing','jump']){
    const state=createMatch(),sign=side===0?1:-1;
    state.phase='rally';state.service.active=false;state.time=1;
    Object.assign(state.players[side],{x:0,z:3.8*sign,vx:0,vz:0});
    Object.assign(state.shuttle,{x:.35*sign,y:kind==='jump'?3.7:2.65,z:3.6*sign,vx:0,vy:-.2,vz:0,active:true,lastHit:1-side});
    const rig=makeAthlete(new THREE.Scene(),side),rows=[];
    let previous=updateAthlete(rig,state.players[side],side,state.shuttle,state.time,1/480,true);
    for(let i=0;i<230;i++){
      const inputs=[{},{}];inputs[side]=i===120?{shot:'smash',charge:.35}:i<120?{prepare:'smash'}:{};
      stepMatch(state,inputs,1/480);
      const pose=updateAthlete(rig,state.players[side],side,state.shuttle,state.time,1/480,true);
      if(i===0 || i===120)for(const name of ['rightElbow','rightWrist']){
        const p=pose.joints[name],q=previous.joints[name];
        assert.ok(Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)<.04,name+' must not snap when preparation or release begins');
      }
      previous=pose;
      const a=state.players[side].action;
      if(a&&a.stage!=='prepare'&&state.time<=a.contactAt){
        rows.push({time:state.time,phase:(state.time-a.startedAt)/(a.contactAt-a.startedAt),pose});
      }
    }
    assert.ok(rows.length>20);
    const peak=field=>{
      let best={speed:0,time:0};
      for(let i=1;i<rows.length;i++){
        const speed=(field(rows[i].pose)-field(rows[i-1].pose))*480;
        if(speed>best.speed)best={speed,time:rows[i].time};
      }
      return best;
    };
    const hip=peak(p=>p.pelvisYaw),chest=peak(p=>p.chestYaw);
    assert.ok(chest.time-hip.time>.008,kind+' hip rotation must accelerate before the chest');
    const mid=rows.reduce((a,b)=>Math.abs(a.phase-.5)<Math.abs(b.phase-.5)?a:b).pose;
    const e=mid.joints.rightElbow,w=mid.joints.rightWrist,r=mid.racketHead;
    assert.ok(e.z<w.z-.06 && w.z<r.z-.15,kind+' elbow must lead the grip while the racket trails');
    if(kind==='standing')assert.ok(Math.min(...rows.map(r=>r.pose.chestYaw))>-.7,'a low 55ms contact must use a compact trunk turn');
    if(kind==='jump'){
      const elbow=peak(p=>p.joints.rightShoulder.z-p.joints.rightElbow.z);
      const wrist=peak(p=>p.joints.rightShoulder.z-p.joints.rightWrist.z);
      const head=peak(p=>p.joints.rightShoulder.z-p.racketHead.z);
      assert.ok(elbow.time+.008<wrist.time && wrist.time+.008<head.time,'forward speed must pass from elbow to grip to racket');
      const grounded=rows.filter(r=>r.phase>.2 && r.phase<.4);
      assert.ok(grounded.at(-1).pose.pelvisYaw-grounded[0].pose.pelvisYaw>.3,'hips must unwind before takeoff');
      for(const row of grounded)for(const name of ['leftAnkle','rightAnkle']){
        const a=row.pose.joints[name],b=grounded[0].pose.joints[name];
        assert.ok(Math.abs(a.y-.085)<1e-7 && Math.hypot(a.x-b.x,a.z-b.z)<.005,'support must stay on the floor during initial hip drive');
      }
    }
  }
});

test('wide smash contacts preserve every limb and never flip a joint in one dense sample',()=>{
  const segments=[['leftShoulder','leftElbow',.32],['leftElbow','leftWrist',.31],
    ['rightShoulder','rightElbow',.32],['rightElbow','rightWrist',.31],
    ['leftHip','leftKnee',.45],['leftKnee','leftAnkle',.43],
    ['rightHip','rightKnee',.45],['rightKnee','rightAnkle',.43],['pelvis','chest',.512]];
  const delta=(a,b)=>[a.x-b.x,a.y-b.y,a.z-b.z];
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  for(const side of [0,1])for(const height of [1.6,2.1,2.84,3.2])
    for(const [x,z]of [[.35,-.2],[0,0],[-1.44,0],[1.44,0],[0,-1.44],[0,1.44]])
      for(const recovery of [.378,.42,.462]){
        const sign=side===0?1:-1,duration=height>2.7?.14:.055;
        const a={...action,contactAt:1+duration,endsAt:1+duration+recovery,
          contact:{x:x*sign,y:height,z:(3.8+z)*sign},jumpHeight:Math.max(0,(height-2.35)*.65)};
        const p={...player,z:3.8*sign,action:a};let previous;
        for(let i=0;i<=Math.ceil((duration+recovery)*480);i++){
          const pose=sampleAthletePose(p,side,a.contact,Math.min(a.endsAt,1+i/480)),j=pose.joints;
          const directions=segments.map(([from,to,size])=>{
            const v=delta(j[to],j[from]),length=Math.hypot(...v);
            assert.ok(Number.isFinite(length)&&Math.abs(length-size)<1e-7,to+' bone length');
            return v.map(x=>x/length);
          });
          const forearm=delta(j.rightWrist,j.rightElbow),shaft=delta(pose.racketHead,j.rightWrist);
          assert.ok(Math.abs(Math.hypot(...shaft)-.54)<1e-7);
          assert.ok(dot(forearm,shaft)/.31/.54>Math.cos(80*Math.PI/180),'wrist must not fold backwards');
          if(previous)directions.forEach((d,k)=>{
            // A no-flip regression bound, not a professional motion-quality gate.
            assert.ok(dot(d,previous[k])>Math.cos(25*Math.PI/180),segments[k][1]+' flipped at '+height+' '+x+','+z);
          });
          previous=directions;
        }
      }
});
