import { COURT, ROLES, createMatch, getShotAvailability, movePlayer, stepMatch } from './game.js';
import { flightApex, horizontalLaunch, verticalLaunch, VERTICAL_DRAG } from './shuttle-flight.js';

// Both net strokes receive exactly this delivery. Values are in metres / seconds.
// The intercept is a calibration point along a continuous flight, not a snap point.
const NET_FEED = { from: [.65, 1.22, -2.25], intercept: [1.38, 1.15, 1.03], time: .85, stance: [1.10, 1.68] };
const DEFENSE_FEED = { from: [.85, 2.96, -4.1], intercept: [1.05, 1.01, 2.55], time: .43, stance: [.86, 3.05] };
const SMASH_FEED = { from: [.62, 1.15, -2.5], intercept: [1.15, 2.80, 2.15], time: 1.52, stance: [.92, 2.58] };
const DRILLS = {
  netFree: { label: '网前自由连练', feed: NET_FEED },
  cross: { label: '勾对角', feed: NET_FEED, depth: 1.02, width: 1.15, length: 1.05 },
  lift: { label: '挑后场', feed: NET_FEED, depth: 5.91, width: 1.48, length: 1.38 },
  defense: { label: '接杀挡网', feed: DEFENSE_FEED, depth: 1.55, width: 1.52, length: 1.35 },
  smash: { label: '定点击杀', feed: SMASH_FEED, depth: 4.86, width: 1.4, length: 1.85 },
  serve: { label: '定点发球', depth: 5.87, width: .85, length: 1.48 },
};
const clamp = (v, lo, hi) => Math.min(Math.max(v,lo),hi);
const bounded = (v, fallback, lo, hi) => Number.isFinite(v) ? clamp(v,lo,hi) : fallback;
const point = b => ({ x:b.x, y:b.y, z:b.z });
const netDrill = drill => ['cross','lift','netFree'].includes(drill);
const xyz = ([x,y,z], sign) => ({ x:x*sign,y,z });

function configure(state, options, initial) {
  const t = state.training, drill = Object.hasOwn(DRILLS, options.drill) ? options.drill : t.drill;
  if (initial || drill !== t.drill) Object.assign(t, { attempts:0, hits:0, feedCount:0, lastResult:null });
  t.drill = drill;
  t.power = bounded(options.power,t.power,.8,1.2);
  t.interval = bounded(options.interval,t.interval,.6,3);
  if (['left','right','alternate'].includes(options.line)) t.line=options.line;
  if (['auto','left','right'].includes(options.targetSide)) t.targetSide=options.targetSide;
  if (drill === 'cross' || drill === 'netFree') t.targetSide='auto';
  for (const player of state.players) Object.assign(player, { action:null, vx:0, vz:0 });
  state.lastShotInfo = null;
  resetDelivery(state,true);
}

export function createTraining(options = {}) {
  const state = createMatch({ humanSlots:[0] });
  state.training = { drill:'cross', power:1, interval:1.5, line:'right', targetSide:'auto' };
  configure(state,options,true);
  return state;
}

export function setTrainingOptions(state,options = {}) {
  configure(state,options,false);
  return state;
}

function resetDelivery(state, reposition) {
  const t=state.training, spec=DRILLS[t.drill], serving=t.drill==='serve';
  const feedLeft=t.line==='left' || (t.line==='alternate' && t.feedCount%2===1);
  t.lane = !serving && feedLeft ? -1 : 1;
  const targetFor=technique=>{
    const spec=DRILLS[technique];
    const side=t.targetSide==='auto' ? (technique==='cross'||serving ? -t.lane : t.lane) : t.targetSide==='left' ? -1 : 1;
    return { x:side*(technique==='cross'?1.91:1.53), z:-spec.depth, width:spec.width, depth:spec.length, technique };
  };
  t.targets=t.drill==='netFree' ? [targetFor('cross'),targetFor('lift')] : null;
  t.target=t.targets?.[0] ?? targetFor(t.drill);
  t.stage='ready'; t.canHit=serving; t.canSmash=false; t.returnShot=null; t.feedAt=null;
  t.nextAt=state.time+(reposition ? .85 : .16);
  t.feedback=serving?'按住高远键蓄力，朝对角拖动，松开发长球':'准备接球';
  state.phase=serving?'serve':'rally'; state.rally=0; state.rallyEnd=null; state.service=null;
  state.netContacts=[];
  state.server=state.serverPlayer=0; state.receiverPlayer=1; state._serveAge=0;
  for (const p of state.players) {
    Object.assign(p, { action:null, pendingShot:null, swing:0, cooldown:0, shotRecovery:null,
      stamina:ROLES[p.role].maxStamina, recoveryWait:0, staminaRate:0, staminaStatus:'idle' });
  }
  state.score=[0,0];
  const [player,coach]=state.players;
  if (serving) {
    const side=Math.sign(t.target.x);
    // Singles uses the server's score parity to select its serving box.
    state.score[0]=side>0?1:0;
    Object.assign(player,{ x:-side*.85, z:3.8, vx:0, vz:0 });
    Object.assign(coach,{ x:side*1.55,z:-4.8 });
    Object.assign(state.shuttle,{ x:player.x, y:1.08, z:player.z-.32 });
    state.service={side:0,active:false,sourceSign:-side,court:side<0?'right':'left',targetBox:{
      minX:side<0?-COURT.halfWidth:0,maxX:side<0?0:COURT.halfWidth,minZ:-COURT.halfLength,maxZ:-1.98
    }};
  } else {
    const feed=spec.feed, source=xyz(feed.from,t.lane);
    if (reposition) Object.assign(player,{x:feed.stance[0]*t.lane,z:feed.stance[1]});
    Object.assign(coach,{x:source.x-.21,z:source.z-.35,vx:0,vz:0});
    Object.assign(state.shuttle,source);
  }
  Object.assign(state.shuttle,{ vx:0,vy:0,vz:0,lastHit:null,lastHitPlayer:null,active:false });
}

function action(state,slot,type,technique,contact,lead,stage='windup') {
  const p=state.players[slot], contactAt=state.time+lead;
  p.action={ id:++p.actionId, type, technique, stage, startedAt:state.time, contactAt,
    endsAt:contactAt+.45, swingTime:.45, contact:point(contact), origin:{x:p.x,z:p.z},
    serving:technique==='serve', jumpHeight:type==='smash'?clamp(contact.y-2.35,0,.6):0,
    across:-Math.sign(contact.x || 1) };
  return p.action;
}

function launchFeed(state,type,start,end,duration,drag,verticalDrag) {
  const slot=1, technique='feed', charge=0;
  const b=state.shuttle;
  Object.assign(b,start,horizontalLaunch(start,end,duration,drag),{
    vy:verticalLaunch(start.y,end.y,duration,verticalDrag), drag,verticalDrag,
    active:true,lastHit:slot,lastHitPlayer:slot
  });
  const p=state.players[slot];
  if (!p.action || p.action.technique!==technique) action(state,slot,type,technique,start,0);
  Object.assign(p.action,{ stage:'contact', contact:point(start), contactAt:state.time, endsAt:state.time+.45 });
  p.lastShot=type; state.lastShot=type; state.rally++; state.phase='rally';
  state.lastShotInfo={ hitId:++state.hitId, side:slot, playerSlot:slot, at:state.time, type, requested:type,
    technique, serving:technique==='serve', charge, contact:point(start), x:end.x,z:end.z, aimX:end.x,aimZ:end.z,
    outgoing:{vx:b.vx,vy:b.vy,vz:b.vz,drag,verticalDrag}, quality:{risk:0,reason:'专项击球'} };
}

function feedBall(state) {
  const t=state.training, spec=DRILLS[t.drill].feed, fast=t.drill==='defense', type=fast?'smash':'clear';
  launchFeed(state,type,xyz(spec.from,t.lane),xyz(spec.intercept,t.lane),spec.time/t.power,
    fast?.047:.17,fast?0:VERTICAL_DRAG);
  t.stage='feed'; t.feedAt=state.time; t.feedCount++; t.feedback=fast?'迎球挡网':t.drill==='smash'?'等球降至头顶前方':'上网迎球';
}

const LABELS={ cross:'勾对角',lift:'挑后场',defense:'接杀挡网',smash:'杀球',drop:'吊球',clear:'高远球',serve:'发球' };

function strokeTechnique(drill,type,contact,aimX,serving) {
  if (serving) return 'serve';
  if (type==='smash') return 'smash';
  if (type==='clear') return netDrill(drill) && contact.y<2.0 ? 'lift' : 'clear';
  if (drill==='defense') return 'defense';
  return netDrill(drill) && contact.x*aimX<0 && Math.abs(aimX)>=.45 ? 'cross' : 'drop';
}

function recordReturn(state) {
  const t=state.training, shot=state.lastShotInfo;
  const technique=strokeTechnique(t.drill,shot.type,shot.contact,shot.aimX,shot.serving);
  const label=shot.serving ? (shot.requested!==shot.type?'杀球键转高远长发':shot.type==='drop'?'吊球短发':'高远长发') : LABELS[technique];
  const launch={...shot.contact,...shot.outgoing};
  t.returnShot={ technique, label, type:shot.type, requested:shot.requested, contact:shot.contact, charge:shot.charge,
    apex:flightApex(launch).y, downward:launch.vy<0 };
  if (shot.serving) t.feedCount++;
  const chosen=t.targets?.find(target=>target.technique===technique);
  if (chosen) t.target=chosen;
  t.stage='return'; t.canHit=false; t.canSmash=false; t.feedback=label;
}

// Local matches own the entire live stroke: input normalization, buffering,
// preparation, sub-frame contact, physical launch, stamina and net collision.
function advanceLive(state,input,dt) {
  const t=state.training, hitId=state.hitId, player=state.players[0];
  const listen=t.stage==='feed' || (t.drill==='serve' && t.stage==='ready');
  const frameInput=listen ? input : {x:input.x,z:input.z};
  stepMatch(state,[frameInput,{}],dt);
  if (state.hitId!==hitId && state.lastShotInfo?.side===0) recordReturn(state);
  if (player.action) {
    const a=player.action, serving=a.serving;
    const aimX=player.pendingShot?.aim ?? input.aim ?? 0;
    a.technique=t.stage==='return' ? t.returnShot.technique : strokeTechnique(t.drill,a.type,a.contact,aimX,serving);
    a.across=-Math.sign(a.contact.x||1);
  }
  if (state.phase==='point') {
    finishBall(state,state.rallyEnd);
  } else if (listen && t.stage!=='return') {
    const availability=getShotAvailability(state,0,input);
    t.canHit=availability.canHit; t.canSmash=availability.canSmash;
  }
}
function finishBall(state,impact) {
  const t=state.training, shot=t.returnShot, target=t.target;
  const inside=Math.abs(impact.x-target.x)<=target.width/2 && Math.abs(impact.z-target.z)<=target.depth/2;
  const correct=shot && shot.requested===shot.type && (t.drill==='netFree'
    ? ['cross','lift'].includes(shot.technique) : shot.technique===t.drill)
    && (t.drill!=='smash' || shot.downward);
  const outcome=!shot?'miss':impact.kind==='net'?'net':impact.kind!=='in'||impact.z>=0?'out':
    !correct?'wrongStroke':inside?'hit':'offTarget';
  t.lastResult={ technique:null, charge:0, contact:null, apex:null, ...shot, outcome, x:impact.x,z:impact.z };
  t.attempts++; if (outcome==='hit') t.hits++;
  const feedback={ miss:'未接到来球',net:'回球挂网',out:'落在有效场区外',wrongStroke:'本球练习'+DRILLS[t.drill].label,
    hit:'命中目标区',offTarget:'偏离目标区' };
  t.feedback=(shot?shot.label+' · ':'')+feedback[outcome];
  t.canHit=false; t.canSmash=false; t.stage='rest'; t.nextAt=state.time+t.interval;
  // Match scoring has delivered the physical impact. The training loop owns
  // the next repetition and counts drill hits instead of competition points.
  state.phase='rally'; state.score=[0,0]; state.timer=0;
  state.rallyEnd={...impact,duration:t.interval};
}

// Called by the same fixed rules clock as a local match. The player can move
// through ball recovery. Only resetting a drill places them at its start mark.
export function stepTraining(state,input={},dt=1/60) {
  const t=state.training;
  if (!(dt>0) || !['serve','rally'].includes(state.phase)) return state;
  if (t.stage==='feed' || t.stage==='return' || (t.drill==='serve' && t.stage==='ready')) {
    advanceLive(state,input,dt);
    state.message=t.feedback;
    return state;
  }
  state.time+=dt;
  const x=bounded(input.x,0,-1,1), z=bounded(input.z,0,-1,1), n=Math.max(1,Math.hypot(x,z));
  if (t.drill!=='serve') movePlayer(state.players[0],{x:x/n,z:z/n},0,dt,state);
  for (const p of state.players) {
    if (!p.action || p.action.stage==='prepare') continue;
    if (state.time>p.action.endsAt) p.action=null;
    else if (p.action.stage==='contact' && state.time-p.action.contactAt>.04) p.action.stage='followthrough';
  }
  if (t.stage==='rest') {
    const nextLane=t.line==='alternate'?-t.lane:t.lane;
    const feed=DRILLS[t.drill].feed;
    if (feed && nextLane!==t.lane) {
      const coach=state.players[1];
      movePlayer(coach,{x:clamp((feed.from[0]*nextLane-.21-coach.x)*2,-1,1),z:0},1,dt,state);
    }
    if (state.time>=t.nextAt-(feed ? .16 : 0)) resetDelivery(state,false);
  }
  if (t.stage==='ready' && t.drill!=='serve') {
    if (state.time>=t.nextAt) feedBall(state);
    else if (t.nextAt-state.time<.16 && !state.players[1].action) {
      action(state,1,t.drill==='defense'?'smash':'clear','feed',state.shuttle,t.nextAt-state.time);
    }
  }
  state.message=t.feedback;
  return state;
}
