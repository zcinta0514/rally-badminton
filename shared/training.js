import { COURT, createMatch, integrateShuttle, movePlayer } from './game.js';
import { flightApex, horizontalLaunch, horizontalTimeFraction, sampleShuttleFlight, verticalLaunch, VERTICAL_DRAG } from './shuttle-flight.js';

// Both net strokes receive exactly this delivery. Values are in metres / seconds.
// The intercept is a calibration point along a continuous flight, not a snap point.
const NET_FEED = { from: [.65, 1.22, -2.25], intercept: [1.38, 1.15, 1.03], time: .85, stance: [1.10, 1.68] };
const DEFENSE_FEED = { from: [.85, 2.96, -4.1], intercept: [1.05, 1.01, 2.55], time: .43, stance: [.86, 3.05] };
const SMASH_FEED = { from: [.62, 1.15, -2.5], intercept: [1.15, 2.64, 4.15], time: 1.52, stance: [.92, 4.63] };
const DRILLS = {
  netFree: { label: '网前自由连练', feed: NET_FEED },
  cross: { label: '勾对角', key: 'drop', feed: NET_FEED, depth: 1.02, width: 1.15, length: 1.05 },
  lift: { label: '挑后场', key: 'clear', feed: NET_FEED, depth: 5.91, width: 1.48, length: 1.38 },
  defense: { label: '接杀挡网', key: 'drop', feed: DEFENSE_FEED, depth: 1.55, width: 1.52, length: 1.35 },
  smash: { label: '定点击杀', key: 'smash', feed: SMASH_FEED, depth: 4.52, width: 1.4, length: 1.65 },
  serve: { label: '定点发球', key: 'clear', depth: 5.87, width: 1.45, length: 1.48 },
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
  t.stage='ready'; t.canHit=serving; t.pending=null; t.returnShot=null; t.feedAt=null;
  t.nextAt=state.time+(reposition ? .85 : .16);
  t.feedback=serving?'按住发球键蓄力，松开发球':'准备接球';
  state.phase=serving?'serve':'rally'; state.rally=0; state.rallyEnd=null; state.service=null;
  state.netContacts=[];
  const [player,coach]=state.players;
  if (serving) {
    const side=Math.sign(t.target.x);
    Object.assign(player,{ x:-side*.91, z:2.68, vx:0, vz:0 });
    Object.assign(coach,{ x:side*1.55,z:-4.8 });
    Object.assign(state.shuttle,{ x:player.x+.24, y:1.06, z:player.z-.42 });
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

function launch(state,slot,type,technique,start,end,duration,drag,verticalDrag,charge=0) {
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
  launch(state,1,type,'feed',xyz(spec.from,t.lane),xyz(spec.intercept,t.lane),spec.time/t.power,
    fast?.047:.17,fast?0:VERTICAL_DRAG);
  t.stage='feed'; t.feedAt=state.time; t.feedCount++; t.feedback=fast?'迎球挡网':t.drill==='smash'?'等球降至头顶前方':'上网迎球';
}

function techniqueFor(drill,button) {
  if (netDrill(drill)) return button==='drop'?'cross':button==='clear'?'lift':null;
  return DRILLS[drill].key===button?drill:null;
}

function reachable(state,b) {
  const {drill}=state.training, p=state.players[0];
  if (drill==='serve') return state.phase==='serve';
  const [low,high,reach]=drill==='smash'?[2,3.13,1.17]:drill==='defense'?[.32,1.76,1.15]:[.35,1.69,1.16];
  return b.z>.12 && b.y>=low && b.y<=high && b.vy<0 && Math.hypot(b.x-p.x,b.z-p.z)<=reach;
}

// Solve the minimum ballistic flight time to clear the physical net at the
// intended crossing. Time fraction accounts for horizontal deceleration.
function clearanceTime(start,end,drag,margin) {
  const f=horizontalTimeFraction(Math.hypot(end.x-start.x,end.z-start.z),start.z/(start.z-end.z),drag);
  return Math.sqrt(Math.max(0,2*(COURT.netHeight+margin-start.y*(1-f))/(9.81*f*(1-f))));
}

function playReturn(state,request) {
  const t=state.training, tech=request.technique, start=point(state.shuttle), p=state.players[0];
  const charge=request.charge, aim=request.aim, depth=request.aimDepth;
  const normalX=tech==='cross'?-Math.sign(start.x || t.lane)*1.91:tech==='serve'?-Math.sign(p.x)*1.53:t.lane*1.53;
  const naturalX=aim===0?normalX:2.12*aim;
  const low=tech==='cross'||tech==='defense';
  const timing=tech==='serve'?0:clamp((tech==='smash'?2.64:tech==='defense'?1.01:1.15)-start.y,-.65,.9);
  // A stretched, late contact tends to open the racket face. Power controls
  // length, while a lateral drag can send the shuttle to either sideline.
  const stretch=Math.max(0,Math.hypot(start.x-p.x,start.z-p.z)-.85);
  const x=naturalX+Math.sign(start.x || 1)*(.32*timing+.45*stretch);
  let length=DRILLS[tech].depth;
  if (tech==='serve') length=2.35+3.87*charge+depth*.55;
  else if (tech==='lift') length=5.68+charge*.83+depth*1.3-timing*.83;
  else if (tech==='smash') length+=charge*.70+depth*1.25+timing*.61;
  else length+=charge*.64+depth*.76+timing*.75;
  const end={x,y:0,z:-Math.max(.25,length)}, drag=tech==='smash'?.047:.18;
  const verticalDrag=tech==='lift'?VERTICAL_DRAG:0;
  let duration=tech==='lift'?1.74+.23*charge:tech==='serve'?.92+.69*charge:tech==='smash'?.39-.055*charge:.62;
  if (verticalDrag===0) duration=Math.max(duration,clearanceTime(start,end,drag,low?.10:.14));
  launch(state,0,request.shot,tech,start,end,duration,drag,verticalDrag,charge);
  if (tech==='serve') { state.service.active=true; t.feedCount++; }
  if (t.targets) t.target=t.targets.find(target=>target.technique===tech);
  t.stage='return'; t.canHit=false; t.pending=null;
  t.returnShot={ technique:tech, contact:start, charge, apex:flightApex(state.shuttle).y };
  t.feedback=({cross:'切拍勾对角',lift:'托起挑后场',defense:'挡杀回网前',smash:'高点下压',serve:'蓄力发球'})[tech];
}

function finishBall(state,winner,reason,impact) {
  const t=state.training, shot=t.returnShot, target=t.target;
  const inside=Math.abs(impact.x-target.x)<=target.width/2 && Math.abs(impact.z-target.z)<=target.depth/2;
  const outcome=!shot?'miss':impact.kind==='net'?'net':impact.kind!=='in'||impact.z>=0?'out':
    t.drill!=='netFree' && shot.technique!==t.drill?'wrongStroke':inside?'hit':'offTarget';
  t.lastResult={ technique:null, charge:0, contact:null, apex:null, ...shot, outcome, x:impact.x,z:impact.z };
  t.attempts++; if (outcome==='hit') t.hits++;
  const feedback={ miss:'未接到来球',net:'回球挂网',out:'落在有效场区外',wrongStroke:'本球练习'+DRILLS[t.drill].label,
    hit:'命中目标区',offTarget:'偏离目标区' };
  t.feedback=(shot?DRILLS[shot.technique].label+' · ':'')+feedback[outcome];
  t.canHit=false; t.stage='rest'; t.pending=null; t.nextAt=state.time+t.interval;
  state.shuttle.active=false; state.pointId++;
  state.rallyEnd={id:state.pointId,...impact,winner,duration:t.interval,grade:'point'};
}

function handleStroke(state,input) {
  const t=state.training, ball=state.shuttle, player=state.players[0];
  const serving=t.drill==='serve' && t.stage==='ready';
  if (!serving && t.stage!=='feed') return;
  t.canHit=reachable(state,ball);
  if (input.shot) {
    const technique=techniqueFor(t.drill,input.shot);
    if (!technique) { t.feedback='本项请使用'+DRILLS[t.drill].label; return; }
    t.pending={technique,shot:input.shot,charge:bounded(input.charge,0,0,1),aim:bounded(input.aim,0,-1,1),
      aimDepth:bounded(input.aimDepth,0,-1,1),expires:state.time+.21};
  }
  const pending=t.pending;
  if (!pending) {
    const held=techniqueFor(t.drill,input.prepare);
    if (held) {
      if (player.action?.stage!=='prepare' || player.action.technique!==held) {
        action(state,0,input.prepare,held,ball,.12,'prepare');
      }
      player.action.endsAt=state.time+.45;
    } else if (player.action?.stage==='prepare') player.action=null;
    return;
  }
  if (pending.contactAt!==undefined) {
    if (state.time+1e-8>=pending.contactAt) {
      if (t.canHit) playReturn(state,pending);
      else { t.feedback='击球点超出拍面范围'; t.pending=null; player.action=null; }
    }
    return;
  }
  if (state.time>pending.expires) {t.pending=null;player.action=null;t.feedback='出拍过早或离球太远';return;}
  const lead=t.drill==='smash'?.095:t.drill==='defense'?.045:.065;
  const next=serving?ball:sampleShuttleFlight(ball,lead);
  if (reachable(state,next)) {
    pending.contactAt=state.time+lead;
    action(state,0,pending.shot,pending.technique,next,lead);
  }
}

// Called by the same fixed rules clock as a local match. The player can move
// through ball recovery. Only resetting a drill places them at its start mark.
export function stepTraining(state,input={},dt=1/60) {
  const t=state.training;
  if (!(dt>0) || !['serve','rally'].includes(state.phase)) return state;
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
  } else if (state.shuttle.active) integrateShuttle(state,dt,finishBall);
  handleStroke(state,input);
  state.message=t.feedback;
  return state;
}
