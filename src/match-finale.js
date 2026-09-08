export const FINALE_DURATION = 3;
export const FINALE_VOICE_AT = 1.05;

/** Presentation only. Admission uses accepted authoritative network packets. */
export class MatchFinale {
  constructor() { this.reset(); }
  reset() {
    this.key=null;this.session=null;this.matchId=0;this.pending=null;
    this.age=null;this.done=false;this.voiceSent=false;
  }
  get blocking() { return !!this.pending&&!this.done; }
  receive(message,{mode,players}={}) {
    if(mode!=='online'||!message?.sessionId||!Number.isInteger(message.matchId))return;
    if(this.session===message.sessionId&&message.matchId<this.matchId)return;
    const key=JSON.stringify([message.sessionId,message.matchId]);
    if(key!==this.key){
      this.reset();this.key=key;this.session=message.sessionId;this.matchId=message.matchId;
    }
    if(this.done)return;
    if(message.abandoned||!players?.[0]?.connected||!players?.[1]?.connected){this.cancel(message.state?.phase==='over'||this.blocking);return;}
    const state=message.state;
    if(this.pending||state?.phase!=='over'||state.endReason!=='scored'||![0,1].includes(state.winner)
      ||!Number.isFinite(message.matchEndedAt))return;
    this.pending={key,winner:state.winner,loser:1-state.winner,
      names:players.map(p=>String(p.name||'球友')),
      startAt:message.matchEndedAt+(Math.max(0,state.rallyEnd?.duration||0)+.05)*1000};
  }
  cancel(consume=this.blocking) { this.done=this.done||consume;this.pending=null;this.age=null;this.voiceSent=false; }
  update({dt=0,serverNow,phase,rallyEnding=false,visible=true}={}) {
    if(!this.blocking)return null;
    if(this.age===null){
      if(phase!=='over'||rallyEnding||!Number.isFinite(serverNow)||serverNow+1e-6<this.pending.startAt)return null;
      this.age=0;
    }else if(visible)this.age+=Number.isFinite(dt)?Math.max(0,dt):0;
    const cue=!this.voiceSent&&this.age>=FINALE_VOICE_AT;
    if(cue)this.voiceSent=true;
    if(this.age>=FINALE_DURATION){this.done=true;return null;}
    return {...this.pending,age:this.age,duration:FINALE_DURATION,
      voice:cue&&visible,bubble:this.age>=FINALE_VOICE_AT&&this.age<2.35};
  }
}
