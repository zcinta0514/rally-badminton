import {createMatch, stepMatch, aiInput, ROLES, RULES_VERSION} from '../shared/game.js';
import {STAMINA_TUNING} from '../shared/stamina.js';

const roles=Object.keys(ROLES),dt=1/60;
const filter=process.argv[2]||'all';
const maxSeconds=Math.min(3600,Math.max(1800,Number(process.argv[3])||1800));
const makeStats=()=>({seconds:0,histogram:Array(100).fill(0),sum:0,zeroSeconds:0,
  recoveringSeconds:0,longestLowSeconds:0,longestZeroSeconds:0,
  shots:{clear:0,drop:0,smash:0},lowShots:{clear:0,drop:0,smash:0},
  bonus:{clear:0,drop:0},bonusShots:{clear:0,drop:0}});
const rows=[],timeouts=[];
const quantile=(histogram,q)=>{
  const target=histogram.reduce((a,b)=>a+b,0)*q;let count=0;
  for(let i=0;i<histogram.length;i++){count+=histogram[i];if(count>=target)return i+.5;}
  return null;
};
function summarize(s){
  const pct=n=>s.seconds?100*n/s.seconds:0;
  return {...s,meanPercent:s.seconds?100*s.sum/s.seconds:0,
    p10Percent:quantile(s.histogram,.1),p50Percent:quantile(s.histogram,.5),p90Percent:quantile(s.histogram,.9),
    zonesPercent:[s.histogram.slice(0,10),s.histogram.slice(10,30),s.histogram.slice(30,60),s.histogram.slice(60)].map(a=>pct(a.reduce((x,y)=>x+y,0))),
    zeroPercent:pct(s.zeroSeconds),recoveringPercent:pct(s.recoveringSeconds)};
}
function runGroup({playerRole,coachRole,difficulty,target=21,ruleset='quick',seeds=12}){
  if(filter!=='all'&&filter!==`${difficulty}:${playerRole}:${coachRole}:${ruleset}:${target}`)return;
  const stats=[makeStats(),makeStats()],durations=[];let completed=0,points=0;
  for(let seed=1;seed<=seeds;seed++){
    const s=createMatch({roles:[playerRole,coachRole],difficulty,target,ruleset,seed:Math.imul(seed+100,2654435761)>>>0});
    const low=[0,0],zero=[0,0],creditedShot=[null,null];
    for(let frame=0;frame<maxSeconds*60&&s.phase!=='over';frame++){
      const input=[aiInput(s,0,difficulty),aiInput(s,1,difficulty)];
      const hit=s.hitId;
      // Keep references to the spent budget even when the next contact closes it.
      const rest=s.players.map(p=>({ref:p.shotRecovery,before:p.shotRecovery?.remaining,ratio:p.stamina/ROLES[p.role].maxStamina}));
      stepMatch(s,input,dt);
      if(s.phase==='rally')for(const [side,p] of s.players.entries()){
        const out=stats[side],ratio=Math.min(1,Math.max(0,p.stamina/ROLES[p.role].maxStamina));
        out.seconds+=dt;out.sum+=ratio*dt;out.histogram[Math.min(99,Math.floor(ratio*100))]+=dt;
        low[side]=ratio<.1?low[side]+dt:0;zero[side]=p.stamina<.001?zero[side]+dt:0;
        out.longestLowSeconds=Math.max(out.longestLowSeconds,low[side]);out.longestZeroSeconds=Math.max(out.longestZeroSeconds,zero[side]);
        if(p.stamina<.001)out.zeroSeconds+=dt;
        if(p.staminaStatus==='recovering')out.recoveringSeconds+=dt;
      }else{low.fill(0);zero.fill(0);}
      rest.forEach((r,side)=>{
        // Below 90% leaves guaranteed headroom; report credited extra recovery,
        // excluding budget consumed while already full (which is not useful gain).
        if(r.ref&&r.ratio<.9){
          const gained=r.before-r.ref.remaining;
          if(gained>1e-9){stats[side].bonus[r.ref.type]+=gained;
            if(creditedShot[side]!==r.ref){stats[side].bonusShots[r.ref.type]++;creditedShot[side]=r.ref;}}
        }
      });
      if(s.hitId!==hit&&!s.lastShotInfo.serving){
        const shot=s.lastShotInfo,out=stats[shot.side];out.shots[shot.type]++;
        if(shot.staminaBefore/ROLES[s.players[shot.side].role].maxStamina<.1)out.lowShots[shot.type]++;
      }
    }
    points+=s.pointId;durations.push(s.time);
    if(s.phase==='over')completed++;
    else timeouts.push({playerRole,coachRole,difficulty,target,ruleset,seed:seed+100,score:s.score,phase:s.phase,hitId:s.hitId});
  }
  rows.push({playerRole,coachRole,difficulty,target,ruleset,seeds,completed,points,
    meanSeconds:durations.reduce((a,b)=>a+b,0)/seeds,maxSeconds:Math.max(...durations),
    player:summarize(stats[0]),coach:summarize(stats[1])});
}
for(const difficulty of ['easy','medium','hard'])for(const playerRole of roles)for(const coachRole of roles){
  for(const target of [5,11,21])runGroup({playerRole,coachRole,difficulty,target});
  runGroup({playerRole,coachRole,difficulty,ruleset:'standard21',seeds:3});
}
console.log(JSON.stringify({rulesVersion:RULES_VERSION,tuning:STAMINA_TUNING,maxSeconds,filter,
  fixture:'Both sides AI-controlled at the selected difficulty; 60Hz end-frame rally samples; seeds 101..112 (standard 101..103); not human play.',
  quantiles:'estimated from 1% histogram buckets',bonusAccounting:'credited budget while below 90% stamina; excludes full-stamina consumption',
  matches:rows.reduce((a,r)=>a+r.seeds,0),completed:rows.reduce((a,r)=>a+r.completed,0),timeouts,rows},null,2));
