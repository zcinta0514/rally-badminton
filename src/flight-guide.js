import {getShotTarget, getShotAvailability, predictLanding, liveFlightPoint} from '../shared/game.js';
import {horizontalLaunch, sampleShuttleFlight, SHUTTLE_FLIGHT} from '../shared/shuttle-flight.js';

const validPoint = p => p && ['x','y','z'].every(k=>Number.isFinite(p[k]));
const sample = (fn,duration) => Array.from({length:65},(_,i)=>fn(duration*i/64));

/** Only preview an outgoing intention when contact is currently available. */
export function getFlightGuide(state,side,info={}) {
 if(!state || ![0,1].includes(side) || !['serve','rally'].includes(state.phase))return null;
 const ball=state.shuttle,serving=state.phase==='serve'&&state.server===side;
 const incoming=state.phase==='rally'&&ball.active&&ball.lastHit===1-side;
 const fx=state.challenge?.active;
 if(fx?.kind==='phantom'&&fx.hitId===state.hitId&&state.time-fx.at<fx.fadeAt)return null;
 if(info.prepare&&['clear','drop','smash'].includes(info.prepare)&&(serving||incoming)) {
  const request={shot:info.prepare,aim:(info.aim||0)*(side===0?1:-1),aimDepth:info.aimDepth||0,charge:info.charge||0};
  const availability=info.availability||getShotAvailability(state,side,request);
  const contact=availability.canHit?ball:null;
  if(validPoint(contact)) {
   const target=getShotTarget(state,side,request),duration=target.duration;
   // Use the chosen shot's timing but aim at intention, not hidden drift.
   const velocity=horizontalLaunch(contact,{x:target.aimX,z:target.aimZ},duration);
   const launch={...contact,...velocity,vy:(SHUTTLE_FLIGHT.gravity*duration*duration/2-contact.y)/duration};
   if(Number.isFinite(duration)&&duration>0) {
    const points=sample(t=>sampleShuttleFlight(launch,t),Math.min(.35,duration*.45));
    return {kind:'aim',points,risk:target.quality.risk,key:`${state.pointId}:${state.hitId}:${side}:aim`};
   }
  }
 }
 if(!incoming||!validPoint(ball))return null;
 const landing=info.landing||predictLanding(state);
 if(!landing||landing.time<=0)return null;
 const duration=Math.min(.65,landing.time);
 const points=sample(t=>liveFlightPoint(ball,t),duration);
 return {kind:'incoming',points,risk:0,key:`${state.pointId}:${state.hitId}:${side}:incoming`};
}
