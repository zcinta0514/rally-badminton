/** Bounded pair separation: cancel only inward motion, preserve tangent sliding. */
export function separateTeammates(state, previous) {
  if (state.format !== 'doubles') return;
  for (const team of [0, 1]) {
    const a=state.players[team], b=state.players[team+2];
    for (let pass=0;pass<12;pass++) {
      const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);
      if(d>=.60-1e-8) break;
      const nx=d>1e-8?dx/d:1,nz=d>1e-8?dz/d:0, correction=.60-d;
      const oldA=previous[team],oldB=previous[team+2];
      const approachA=Math.max(0,(a.x-oldA.x)*nx+(a.z-oldA.z)*nz);
      const approachB=Math.max(0,-(b.x-oldB.x)*nx-(b.z-oldB.z)*nz);
      const total=approachA+approachB;
      const shareA=total>1e-9?approachA/total:.5;
      for(const [p,sign,share] of [[a,-1,shareA],[b,1,1-shareA]]) {
        p.x=Math.max(-2.89,Math.min(2.89,p.x+sign*nx*correction*share));
        const dir=team===0?1:-1;
        p.z=dir*Math.max(.54,Math.min(6.54,dir*(p.z+sign*nz*correction*share)));
        const inward=(p.vx*nx+p.vz*nz)*sign;
        if(inward<0) {p.vx-=inward*sign*nx;p.vz-=inward*sign*nz;}
      }
    }
  }
}
export function contactOrder(state) {
 const slots=state.players.map((_,i)=>i);
 if(state.format!=='doubles') return slots;
 return slots.sort((a,b)=>{
  const pa=state.players[a],pb=state.players[b];
  const ta=pa.pendingShot?.contactAt??Infinity,tb=pb.pendingShot?.contactAt??Infinity;
  if(ta!==tb) return ta-tb;
  const da=Math.hypot(pa.x-state.shuttle.x,pa.z-state.shuttle.z),db=Math.hypot(pb.x-state.shuttle.x,pb.z-state.shuttle.z);
  if(Math.abs(da-db)>1e-8) return da-db;
  return ((a/2|0)-(state._contactTie%2)+2)%2-((b/2|0)-(state._contactTie%2)+2)%2 || a-b;
 });
}
/** Team commitment persists for a flight, but an unreachable primary can be rescued. */
export function doublesAssignment(state,slot,config,inputs,advice) {
 const team=slot%2, dir=team===0?1:-1, p=state.players[slot];
 state._doublesAI ??= [null,null];
 const incoming=state.shuttle.lastHit!==team;
 const members=[team,team+2];
 const plans=members.map(i=>({slot:i,...advice(state,i)}));
 const viable=plan=>['ready','approach'].includes(plan.status);
 const rank=plan=>plan.status==='ready'?0:plan.status==='approach'?(plan.point?.time??10):100;
 let memory=state._doublesAI[team];
 if(!memory||memory.hitId!==state.hitId) {
  const sorted=[...plans].sort((a,b)=>rank(a)-rank(b)||Math.hypot(state.players[a.slot].x-state.shuttle.x,state.players[a.slot].z-state.shuttle.z)-Math.hypot(state.players[b.slot].x-state.shuttle.x,state.players[b.slot].z-state.shuttle.z));
  memory=state._doublesAI[team]={hitId:state.hitId,primary:sorted[0].slot,ready:state.time+config.reaction};
 }
 if(incoming) {
  if(state.service?.active) memory.primary=state.receiverPlayer;
  else {
   const human=plans.find(plan=>{
    const input=inputs?.[plan.slot]; if(!input||!viable(plan)) return false;
    const q=state.players[plan.slot],point=plan.point||state.shuttle;
    return input.prepare||input.shot||((input.x||0)*(point.x-q.x)+(input.z||0)*(point.z-q.z)>.05);
   });
   const committed=state.players[memory.primary].pendingShot?.contactAt!==undefined && viable(plans.find(plan=>plan.slot===memory.primary));
   if(human && !committed) memory.primary=human.slot;
   else if(!viable(plans.find(plan=>plan.slot===memory.primary))) {
    const rescue=plans.find(viable); if(rescue) memory.primary=rescue.slot;
   }
  }
 }
 if(incoming&&memory.primary===slot&&viable(plans.find(plan=>plan.slot===slot))) return state.time<memory.ready?{x:0,z:0,shot:null}:null;
 // Attack: primary at the net and partner behind. Defence: split the width.
 const attacking=!incoming&&['smash','drop'].includes(state.lastShot);
 const hitter=state.shuttle.lastHitPlayer;
 const target=attacking?{x:slot===hitter?state.shuttle.x*.2:-state.shuttle.x*.2,z:dir*(slot===hitter?4.4:1.8)}
  : {x:slot<2?-1.45:1.45,z:dir*(incoming?3.7:3.9)};
 // The cover must leave the primary's approach corridor.
 const primary=state.players[memory.primary];
 if(incoming&&Math.abs(target.x-primary.x)<.8) target.x=primary.x>=0?-1.6:1.6;
 const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz),speed=Math.min(config.pace*.8,d*2.2);
 return {x:d>.07?dx/d*speed:0,z:d>.07?dz/d*speed:0,shot:null,aim:0,aimDepth:0,charge:0};
}
