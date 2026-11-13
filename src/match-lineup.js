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
  if(!profiles) return {self:'你与队友',other:({easy:'入门',medium:'进阶',hard:'高手'}[state.difficulty]||'人机')+'陪练'};
  const name=i=>profiles?.[i]?.name||(i===slot?'你':i%2===team?'队友':'球友');
  return {self:[team,team+2].map(name).join(' / '),other:[1-team,3-team].map(name).join(' / ')};
}
