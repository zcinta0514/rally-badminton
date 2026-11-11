// Fixed 60 Hz rules, display-rate motion. Never interpolate across a contact,
// score, pause or match replacement; these are authoritative discontinuities.
export function captureMotion(state) {
  return {time:state.time,phase:state.phase,hitId:state.hitId,pointId:state.pointId,
    players:state.players.map(p=>({...p})),shuttle:{...state.shuttle}};
}
export function presentLocal(state, previous, alpha) {
  if(!previous || !['serve','rally'].includes(state.phase) || previous.phase!==state.phase ||
    previous.hitId!==state.hitId || previous.pointId!==state.pointId ||
    state.time<=previous.time || state.time-previous.time>1/60+.00001) return state;
  const t=Math.max(0,Math.min(1,alpha)),mix=(a,b)=>a+(b-a)*t;
  return {...state,time:mix(previous.time,state.time),
    players:state.players.map((p,i)=>({...p,x:mix(previous.players[i].x,p.x),z:mix(previous.players[i].z,p.z)})),
    shuttle:{...state.shuttle,...Object.fromEntries(['x','y','z'].map(k=>[k,mix(previous.shuttle[k],state.shuttle[k])]))}};
}
