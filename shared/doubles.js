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
  const priority=team=>(state._contactTieByTeam?.[team]??state._contactTie)%2;
  return ((a/2|0)-priority(a%2)+2)%2-((b/2|0)-priority(b%2)+2)%2 || a-b;
 });
}
const COORDINATION = {
  easy: { hesitationChance: .14, hesitationTime: .20 },
  medium: { hesitationChance: .055, hesitationTime: .13 },
  hard: { hesitationChance: .015, hesitationTime: .08 },
};

const viable = plan => plan.status === 'ready' || plan.status === 'approach';

function receptionPlan(state, slot, inputs, advice) {
  const plan = advice(state, slot), player = state.players[slot], input = inputs?.[slot];
  const point = plan.point || state.shuttle, dx = point.x - player.x, dz = point.z - player.z;
  const swing = Boolean(input && (input.prepare || input.shot || player.pendingShot));
  const approach = Boolean(input && ((input.x || 0) * dx + (input.z || 0) * dz > .05 ||
    player.vx * dx + player.vz * dz > .05));
  return { ...plan, slot, human: input != null, swing, approach, distance: Math.hypot(dx, dz) };
}

function moveTo(player, target, pace) {
  const dx = target.x - player.x, dz = target.z - player.z, distance = Math.hypot(dx, dz);
  const speed = Math.min(pace, distance * 2.2);
  return distance > .07 ? { x: dx / distance * speed, z: dz / distance * speed } : { x: 0, z: 0 };
}

function coverMovement(player, partner, target, approach, direction, pace) {
  const pathX = approach.x - partner.x, pathZ = approach.z - partner.z;
  const pathLength = Math.hypot(pathX, pathZ);
  const relativeX = player.x - partner.x, relativeZ = player.z - partner.z;
  const along = (relativeX * pathX + relativeZ * pathZ) / (pathLength || 1);
  const across = (relativeZ * pathX - relativeX * pathZ) / (pathLength || 1);
  if (pathLength > .35 && along > -.2 && along < pathLength + .45 && Math.abs(across) < .85) {
    // Step out perpendicular to the receiver's approach before taking the open lane.
    const sign = Math.sign(across) || Math.sign(pathX * direction) || Math.sign(relativeX) || Math.sign(target.x);
    target.x = player.x - sign * pathZ / pathLength;
    target.z = player.z + sign * pathX / pathLength;
    if (target.z * direction < .65 || target.z * direction > 6.45 || Math.abs(target.x) > 2.8) {
      target.x = player.x + sign * pathZ / pathLength;
      target.z = player.z - sign * pathX / pathLength;
    }
  }
  return moveTo(player, target, pace * .8);
}

/** Assign one receiver per flight and let the partner cover the open space. */
export function doublesAssignment(state, slot, config, inputs, advice, level) {
  const team = slot % 2, direction = team === 0 ? 1 : -1;
  const otherSlot = slot ^ 2, player = state.players[slot], partner = state.players[otherSlot];
  const incoming = state.shuttle.lastHit === 1 - team;
  state._doublesAI ??= [null, null];
  let memory = state._doublesAI[team];
  if (!memory || memory.hitId !== state.hitId) {
    const left = state.players[team].x < state.players[team+2].x ? team
      : state.players[team].x > state.players[team+2].x ? team + 2 : memory?.left ?? team;
    // Use a per-flight roll without consuming the shot selection RNG.
    let roll = Math.imul(state._rng ^ Math.imul(state.hitId + 1 + team, 0x9e3779b9), 0x85ebca6b);
    roll = (Math.imul(roll ^ (roll >>> 13), 0xc2b2ae35) >>> 0) / 4294967296;
    memory = state._doublesAI[team] = { hitId: state.hitId, primary: null, left, roll,
      lastHesitation: memory?.lastHesitation ?? -Infinity };
  }

  let approach = { x: partner.x + partner.vx * .35, z: partner.z + partner.vz * .35 };
  if (incoming) {
    const plans = [team, team+2].map(member => receptionPlan(state, member, inputs, advice));
    const human = plans.find(plan => plan.human && viable(plan));
    const bots = plans.filter(plan => !plan.human && viable(plan));
    const current = plans.find(plan => plan.slot === memory.primary);
    const committed = current && viable(current) && state.players[current.slot].pendingShot?.contactAt !== undefined;
    const tiePriority = team + 2 * ((state._contactTieByTeam?.[team] ?? state.hitId) % 2);
    const bot = bots.find(plan => plan.slot === memory.primary) ?? bots.sort((a, b) =>
      a.point.time - b.point.time || a.distance - b.distance || (a.slot === tiePriority ? -1 : 1))[0];
    let primary = memory.primary;
    let lateRescue = false;
    if (state.service?.active) {
      primary = state.receiverPlayer;
    } else if (!committed) {
      const timeLeft = human?.landing?.time ?? Infinity;
      const humanInTime = !bot || timeLeft > .25 + config.reaction;
      const approaching = human?.approach && humanInTime;
      const profile = COORDINATION[level];
      if (approaching && bot && !human.swing && !memory.checkedHesitation) {
        memory.checkedHesitation = true;
        if (Math.abs(human.point.x) < .85 && Math.abs(human.point.time - bot.point.time) < .13 &&
            timeLeft > .55 && memory.roll < profile.hesitationChance &&
            state.hitId - memory.lastHesitation > 4) {
          memory.hesitateUntil = state.time + profile.hesitationTime;
          memory.lastHesitation = state.hitId;
        }
      }
      if (human?.swing || (approaching && !(state.time < memory.hesitateUntil))) primary = human.slot;
      else {
        primary = bot?.slot ?? (current && !current.human ? current.slot : null);
        lateRescue = bot?.status === 'ready' &&
          bot.landing?.time < .24 + (current?.human ? config.reaction : 0);
      }
    }
    if (primary !== memory.primary) {
      memory.primary = primary;
      memory.ready = state.time + (lateRescue ? 0 : config.reaction);
    }
    const own = plans.find(plan => plan.slot === slot);
    if (memory.primary === slot && viable(own)) {
      if (state.time >= memory.ready) return null;
      const movement = state.time < memory.hesitateUntil ? moveTo(player, own.point, config.pace * .5) : { x: 0, z: 0 };
      return { ...movement, shot: null };
    }
    const receiver = plans.find(plan => plan.slot === otherSlot && plan.slot === memory.primary);
    if (receiver?.point && (receiver.approach || receiver.swing || !receiver.human)) approach = receiver.point;
  } else {
    memory.primary = state.shuttle.lastHitPlayer;
  }

  // Keep the last split through the center strip. Change sides only when the
  // other player is clearly committed to the opposite half.
  const laneX = incoming && memory.primary === otherSlot ? approach.x : partner.x;
  if ((inputs?.[otherSlot] != null || incoming && memory.primary === otherSlot) && Math.abs(laneX) > .60) {
    memory.left = laneX < 0 ? otherSlot : slot;
  }
  const lane = memory.left === slot ? -1 : 1;
  const attacking = !incoming && ['smash', 'drop'].includes(state.lastShot);
  const front = inputs?.[otherSlot] != null && Math.abs(partner.z - 3.1 * direction) > .55
    ? partner.z * direction > 3.1 : slot !== state.shuttle.lastHitPlayer;
  const target = attacking ? { x: lane * .65, z: direction * (front ? 1.85 : 4.55) }
    : { x: lane * 1.45, z: direction * (incoming ? 3.7 : 3.9) };
  const movement = coverMovement(player, partner, target, approach, direction, config.pace);
  return { ...movement, shot: null, aim: 0, aimDepth: 0, charge: 0 };
}
