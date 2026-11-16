import * as current from '../shared/game.js';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
export function measureDefense(g=current) {
 const report={};
 for(const level of ['easy','medium','hard']){
  let attempts=0,hits=0,returns=0;
  for(const role of ['balanced','swift','power']) for(const side of [0,1]) for(const x of [-.8,0,.8]) for(const aim of [-.65,0,.65]) for(let seed=1;seed<=12;seed++){
   const s=g.createMatch({roles:[role,role],seed:Math.imul(seed,2654435761)>>>0});s.phase='rally';s.service=null;
   const hitter=1-side,sign=side===0?1:-1;
   Object.assign(s.players[side],{x:x*sign,z:3.55*sign});
   Object.assign(s.players[hitter],{x:0,z:-3.8*sign});
   Object.assign(s.shuttle,{x:0,y:3.2,z:-3.8*sign,vx:0,vy:0,vz:0,lastHit:side,active:true});
   const shot=g.getShotTarget(s,hitter,{shot:'smash',charge:.3,aim:aim*sign});
   Object.assign(s.shuttle,{vx:shot.vx,vy:shot.vy,vz:shot.vz,drag:shot.drag,lastHit:hitter});s.lastShot='smash';s.hitId=1;attempts++;
   for(let i=0;i<90&&s.phase==='rally'&&s.hitId===1;i++) {const inputs=[{},{}];inputs[side]=g.aiInput(s,side,level);g.stepMatch(s,inputs,1/120);}
   if(s.hitId>1){hits++;const landing=g.predictLanding(s);if(landing?.event==='landing'&&!landing.out&&!landing.serviceFault)returns++;}
  }
  report[level]={attempts,hits,returns,rate:returns/attempts};
 }
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const g=process.argv[2]?await import(pathToFileURL(resolve(process.argv[2]))):current;console.log(JSON.stringify(measureDefense(g),null,2));}
