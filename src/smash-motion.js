// Visual-only smash phrasing, sampled from authoritative match time.
// Hip/chest phase offsets borrow the V4 court study; no draft rig is imported.
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
function track(keys,t){
  let i=0;while(i<keys.length-2 && t>keys[i+1][0])i++;
  const slope=j=>(keys[j+1][1]-keys[j][1])/(keys[j+1][0]-keys[j][0]);
  const tangent=j=>{
    if(j===0 || j===keys.length-1)return 0;
    const a=slope(j-1),b=slope(j);
    return a*b<=0?0:2*a*b/(a+b);
  };
  const [a,x]=keys[i],[b,y]=keys[i+1],u=clamp((t-a)/(b-a)),u2=u*u,u3=u2*u;
  return (2*u3-3*u2+1)*x+(u3-2*u2+u)*(b-a)*tangent(i)
    +(-2*u3+3*u2)*y+(u3-u2)*(b-a)*tangent(i+1);
}

export function sampleSmashMotion(action,time){
  const preparing=action.stage==='prepare';
  const elapsed=time-action.contactAt;
  const pre=clamp((time-action.startedAt)/Math.max(.001,action.contactAt-action.startedAt));
  const recovery=Math.max(.001,action.endsAt-action.contactAt);
  // Contact = 1; ready = 2, including faster/slower character recoveries.
  const t=preparing?0:elapsed<=0?pre:1+clamp(elapsed/recovery);
  const load=preparing?ease((time-action.startedAt)/.14):1;
  // A lower, quick contact uses a compact trunk turn; compressing the full
  // overhead rotation into the rules' 55ms windup looks like a torso snap.
  const power=preparing?.65:.55+.45*ease(((action.contact?.y??2.8)-2.15)/.6);
  const hip=load*power*track([[0,-.58],[.2,-.64],[.50,.12],[.82,.38],[1,.40],[1.35,.48],[2,0]],t);
  const chest=load*power*track([[0,-.95],[.43,-1.08],[.62,-.66],[.82,.05],[1,.35],[1.4,.80],[2,0]],t);
  const flight=preparing?0:track([[0,0],[.4,0],[.77,1],[1,1],[1.62,0],[2,0]],t);
  const crouch=load*track([[0,.18],[.20,.20],[.72,.025],[1,0],[1.52,.035],[1.76,.18],[2,0]],t);
  const weight=load*track([[0,1],[1.65,1],[2,0]],t);
  const lift=track([[0,.85],[.38,1],[.7,1],[1.23,0],[2,0]],t);
  const airborne=!preparing && Math.max(action.jumpHeight||0,(action.contact?.y||0)-2.5)>.04;
  const scissor=(airborne?1:0)*track([[0,0],[.4,0],[.65,-.21],[1.42,.22],[1.72,.22],[2,0]],t);
  const stepping=(airborne?1:0)*track([[0,0],[1.72,0],[1.86,.035],[2,0]],t);
  return {hip,chest,flight,crouch,weight,
    // Continuous swivel angles avoid a projected world pole collapsing when
    // an edge contact lines the shoulder-to-racket ray up with that pole.
    elbowSwivel:track([[0,1.36],[.3,2.78],[.6,4.28],[1,5.69],[1.4,8.5],[1.6,8.55],[2,Math.PI*2+Math.atan(.15)]],t)
      +(1-power)*track([[0,4],[.4,2],[.7,0],[2,0]],t),
    wristSwivel:track([[0,.87],[.3,1.68],[.5,3.53],[.8,3.9],[1,3.96],[1.2,3.68],[1.5,2.6],[2,0]],t)
      +(1-power)*track([[0,5],[.4,1],[.7,0],[2,0]],t),
    elbowWeight:track([[0,1],[1.5,1],[2,0]],t),
    lean:load*track([[0,.08],[.45,.18],[1,-.04],[1.4,-.34],[2,0]],t),
    roll:track([[0,-.2],[.5,-.9],[1,.18],[1.38,1.25],[2,0]],t),
    hand:[-.30,.02+.54*lift,-.30+.04*lift],
    feet:{left:{y:stepping,z:scissor},right:{y:stepping*.5,z:-scissor}},
  };
}
