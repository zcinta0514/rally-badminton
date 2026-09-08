import { bend } from './athlete.js';

const v=(x=0,y=0,z=0)=>({x,y,z});
const add=(a,b)=>v(a.x+b.x,a.y+b.y,a.z+b.z);
const mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
const turn=(p,a)=>v(Math.cos(a)*p.x+Math.sin(a)*p.z,p.y,-Math.sin(a)*p.x+Math.cos(a)*p.z);

/** One kneel and one bow. The two competitors use the same deterministic clock. */
export function sampleFinalePose(role,age,heading=0) {
  const loser=role==='loser',kneel=loser?ease(age/.65):0;
  const bow=loser?ease((age-.7)/.65)*(1-ease((age-1.65)/.8)):0;
  const hipY=mix(.875,.5025,kneel)-.1925*bow;
  // Once kneeling, knees stay on the court as hips settle toward the heels.
  const hipZ=bow>0?-.16+Math.sqrt(.45**2-(hipY-.082)**2):0;
  const pelvis=v(0,hipY+.045,hipZ),pitch=1.7*bow;
  const chest=add(pelvis,v(0,.512*Math.cos(pitch),-.512*Math.sin(pitch)));
  const joints={pelvis,spine:v(0,mix(pelvis.y,chest.y,.45),mix(pelvis.z,chest.z,.45)),chest,
    neck:add(chest,v(0,.09*Math.cos(pitch),-.09*Math.sin(pitch))),
    head:add(chest,v(0,.26*Math.cos(pitch),-.26*Math.sin(pitch)-.012))};
  for(const [name,s]of [['left',-1],['right',1]]){
    const hip=add(pelvis,v(s*.145,-.045,0)),ankle=v(s*.145,.085,.27*kneel);
    joints[name+'Hip']=hip;joints[name+'Ankle']=ankle;
    joints[name+'Knee']=bend(hip,ankle,.45,.43,v(0,.1,-1));
    const shoulder=add(chest,v(s*.245,.005,0));joints[name+'Shoulder']=shoulder;
    const idle=add(chest,v(s*.34,-.33,-.12));
    const hand=loser?v(mix(idle.x,s*.28,bow),mix(idle.y,.115,bow),mix(idle.z,-.43,bow))
      :name==='left'?add(pelvis,v(-.24,.05,-.08)):idle;
    joints[name+'Wrist']=hand;
    joints[name+'Elbow']=bend(shoulder,hand,.32,.31,v(s*.7,-.5,.25));
  }
  for(const name of Object.keys(joints))joints[name]=turn(joints[name],heading);
  const racketHead=add(joints.rightWrist,turn(v(0,.54,0),heading));
  return {joints,heading,pelvisYaw:heading,chestYaw:heading,headYaw:heading,
    headPitch:loser?-pitch:-.1*ease(age/.6),ankleYaw:heading+Math.PI*kneel,
    racketHead,racketRoll:0,jump:0,actionType:'finale',active:0,crouch:0,stroke:0};
}
