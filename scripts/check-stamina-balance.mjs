import * as candidate from '../shared/game.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';

// A fixed contact grid is a reproducible stress comparison, not an empirical
// player miss probability. Classification uses the same exact flight ending
// solver as scored gameplay, never the display risk score.
export function contactSamples(game, role, ratio, shot) {
  const rows = [];
  const heights = {clear:[.95,1.6,2.7],drop:[.9,1.4,2.7],smash:[1.8,2.4,3.1]}[shot];
  for (const side of [0,1]) for (const z of [2,4.5,6]) for (const y of heights)
    for (const speed of [0,1.2,2.2]) for (const offset of [0,.6])
      for (const aim of [-.9,0,.9]) for (const aimDepth of [-.65,0,.85]) for (const charge of [0,.65,1]) {
        const end=side===0?1:-1, state=game.createMatch({roles:[role,role],assist:{side,level:'none'}});
        state.phase='rally'; state.service.active=false;
        Object.assign(state.players[side],{x:0,z:end*z,vx:end*speed,vz:0,stamina:game.ROLES[role].maxStamina*ratio});
        Object.assign(state.shuttle,{x:end*offset,y,z:end*z,vx:0,vy:-3,vz:-end*2,lastHit:1-side,active:true});
        const request={shot,aim:end*aim,aimDepth,charge}, target=game.getShotTarget(state,side,request);
        Object.assign(state.shuttle,{vx:target.vx,vy:target.vy,vz:target.vz,lastHit:side});
        const landing=game.predictLanding(state), error=landing.event==='net'||landing.out||landing.serviceFault;
        rows.push({side,z,y,speed,offset,aim,aimDepth,charge,error:!!error,kind:landing.event==='net'?'net':landing.out?'out':'in'});
      }
  return rows;
}
export function contactStats(game, role, ratio) {
  return Object.fromEntries(['clear','drop','smash'].map(shot=>{
    const samples=contactSamples(game,role,ratio,shot), errors=samples.filter(s=>s.error).length;
    return [shot,{samples:samples.length,errors,rate:errors/samples.length,nets:samples.filter(s=>s.kind==='net').length,outs:samples.filter(s=>s.kind==='out').length}];
  }));
}
function runTenSeconds(game,role,input) {
  const state=game.createMatch({roles:[role,role]});state.phase='rally';state.shuttle.active=false;
  let dir=1;
  for(let i=0;i<1200;i++) {
    if(state.players[0].x>1.6)dir=-1;if(state.players[0].x< -1.6)dir=1;
    game.stepMatch(state,[{x:dir*input},{}],1/120);
  }
  return {remaining:state.players[0].stamina,percent:state.players[0].stamina/game.ROLES[role].maxStamina*100};
}
function actualShotCost(game,role,shot,charge=0,serving=false) {
  const state=game.createMatch({roles:[role,role]});
  if(!serving){state.phase='rally';state.service.active=false;Object.assign(state.players[0],{x:0,z:3.8});Object.assign(state.shuttle,{x:0,z:3.8,y:2.85,vx:0,vy:0,vz:0,active:true,lastHit:1});}
  game.stepMatch(state,[{shot,charge},{}],1/120);
  for(let i=0;i<60&&state.hitId===0;i++)game.stepMatch(state,[{},{}],1/120);
  if(state.hitId!==1)throw Error('controlled contact missing: '+role+'/'+shot);
  return state.lastShotInfo.staminaBefore-state.lastShotInfo.staminaAfter;
}
function matchSamples(game,role) {
  const samples=[];
  for(const difficulty of ['medium','hard'])for(const seed of [1,7,31]){
    const state=game.createMatch({roles:[role,role],target:5,difficulty,seed});let ticks=0,lowTicks=0,minRatio=1,maxRally=0;
    while(state.phase!=='over'&&ticks<60*180){
      game.stepMatch(state,[game.aiInput(state,0,difficulty),game.aiInput(state,1,difficulty)],1/60);ticks++;
      const ratio=Math.min(...state.players.map(p=>p.stamina/game.ROLES[p.role].maxStamina));
      minRatio=Math.min(minRatio,ratio);if(ratio<.25)lowTicks++;maxRally=Math.max(maxRally,state.rally);
    }
    samples.push({difficulty,seed,complete:state.phase==='over',seconds:ticks/60,lowTimeShare:lowTicks/ticks,minPercent:minRatio*100,maxRally});
  }
  return samples;
}
export function measure(game) {
  return Object.fromEntries(Object.keys(game.ROLES).map(role=>[role,{
    tenSecondSprint:runTenSeconds(game,role,1),tenSecondAdjustment:runTenSeconds(game,role,.25),
    actualCosts:{serve:actualShotCost(game,role,'clear',0,true),clear:actualShotCost(game,role,'clear'),drop:actualShotCost(game,role,'drop'),smash:actualShotCost(game,role,'smash'),chargedSmash:actualShotCost(game,role,'smash',1)},
    contacts:Object.fromEntries([1,.2,0].map(ratio=>[ratio,contactStats(game,role,ratio)])),
    simulatedMatches:matchSamples(game,role),
  }]));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const output=process.argv[2]||'artifacts/stamina-balance/comparison.json', baselinePath=process.argv[3];
  const report={asOf:new Date().toISOString(),candidate:measure(candidate),sampleMissRateIsNotPlayerProbability:true};
  if(baselinePath)report.baseline=measure(await import(pathToFileURL(resolve(baselinePath))));
  await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2));
  for(const [role,r] of Object.entries(report.candidate))console.log(JSON.stringify({role,sprintPercent:r.tenSecondSprint.percent,costs:r.actualCosts,contacts:Object.fromEntries(Object.entries(r.contacts).map(([ratio,shots])=>[ratio,Object.fromEntries(Object.entries(shots).map(([shot,s])=>[shot,Math.round(s.rate*1000)/10]))])),matches:r.simulatedMatches.map(m=>({difficulty:m.difficulty,complete:m.complete,minPercent:m.minPercent}))}));
}
