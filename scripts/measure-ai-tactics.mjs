import * as game from '../shared/game.js';
import {receiveFixture} from './measure-gameplay-pace.js';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

export function sampleTactics(level, {serve=false, incoming='smash', opponentDepth=4.8, seeds=96, side=0}={}) {
  const counts={clear:0,drop:0,smash:0}, lines=new Set();
  let legal=0, contacts=0;
  for(let seed=1;seed<=seeds;seed++) {
    if(serve&&side!==0)throw new RangeError('The serve fixture starts on side 0');
    const state=serve ? game.createMatch() : receiveFixture(game,{type:incoming,startZ:incoming==='drop'?2.6:3.55,side}).state;
    state._rng=Math.imul(seed,2654435761)>>>0;
    // The opponent's visible position may change after hitting the incoming ball.
    if(!serve) {state.players[1-side].z=(side===0?-1:1)*opponentDepth;state.hitId=1;}
    const before=state.hitId;
    for(let frame=0;frame<360 && state.phase!=='point';frame++) {
      const inputs=[{},{}];inputs[side]=game.aiInput(state,side,level);
      game.stepMatch(state,inputs,1/120);
      const hit=state.lastShotInfo;
      if(hit?.hitId>before && hit.playerSlot===side) {
        contacts++;counts[hit.type]++;
        lines.add(`${hit.type}:${Math.sign(hit.aimX)}:${Math.round(Math.abs(hit.aimZ))}`);
        const landing=game.predictLanding(state);
        if(landing?.event==='landing'&&!landing.out&&!landing.serviceFault)legal++;
        break;
      }
    }
  }
  return {contacts,legal,counts,lines:lines.size};
}

export function measureTactics() {
  return Object.fromEntries(['easy','medium','hard'].map(level=>[level,{
    serve:sampleTactics(level,{serve:true}),
    smashRear:sampleTactics(level),
    smashFront:sampleTactics(level,{opponentDepth:1.5}),
    dropRear:sampleTactics(level,{incoming:'drop'}),
    dropFront:sampleTactics(level,{incoming:'drop',opponentDepth:1.5}),
  }]));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log(JSON.stringify(measureTactics(),null,2));
