import { aiInput, playerTeam } from '../shared/game.js';

export function localTeam(state, slot) { return playerTeam(state,slot) ?? slot % 2; }

export function practiceInputs(state, human, settings, decide = aiInput) {
  const intent=[human];
  return state.players.map((_,slot)=>slot===0?human:decide(state,slot,
    state.challenge?'hard':state.format==='doubles'&&slot===2?settings.teammateDifficulty:settings.difficulty,intent));
}

export function lineupNames(state, slot, profiles) {
  const team=localTeam(state,slot);
  if(state.format!=='doubles') return {self:profiles?.[slot]?.name||'你',other:profiles?.[1-slot]?.name||'对手'};
  const name=i=>profiles?.[i]?.name||(i===slot?'你':i%2===team?'AI 队友':`AI ${i===1?'一':'二'}`);
  return {self:[team,team+2].map(name).join(' / '),other:[1-team,3-team].map(name).join(' / ')};
}
