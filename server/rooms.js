import { randomBytes, randomInt } from 'node:crypto';
import { createMatch, stepMatch, pauseMatch, resumeMatch, finishMatch, ROLES } from '../shared/game.js';
import { cleanName, playerIdentity, validPlayerKey } from './leaderboard.js';

const send=(socket,data)=>{if(socket?.readyState===1)socket.send(JSON.stringify(data));};
const clamp=(value,min,max)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):0;
const roleOf=value=>Object.hasOwn(ROLES,value)?value:'balanced';
const rulesetOf=value=>value==='standard21'?'standard21':'quick';
const scoreWinner=s=>s.score[0]===s.score[1]?null:s.score[0]>s.score[1]?0:1;
const STEP_MS=1000/60;
const PING_INTERVAL=1000;
const PONG_TIMEOUT=5000;

export class Rooms {
  rooms=new Map();
  clients=new Map();
  tokens=new Map();
  tickCount=0;
  constructor({now=()=>performance.now(),leaderboard=null}={}){
    this.now=now;this.lastTick=now();this.accumulator=0;this.leaderboard=leaderboard;
    this.timer=setInterval(()=>this.tick(),STEP_MS);this.timer.unref();
  }
  attach(socket){
    const ctx={socket,room:null,slot:null,window:this.now(),count:0,lastPing:this.now(),pingSentAt:null};
    this.clients.set(socket,ctx);
    socket.on('message',raw=>{
      if(this.now()-ctx.window>1000){ctx.window=this.now();ctx.count=0;}
      if(++ctx.count>100){if(ctx.count===101)send(socket,{type:'error',message:'操作过于频繁，请稍后重试'});return;}
      let m;try{m=JSON.parse(raw.toString());}catch{send(socket,{type:'error',message:'无法识别的消息'});return;}
      if(!m||typeof m!=='object'||Array.isArray(m))return;
      try{this.message(ctx,m);}catch(error){console.error('Room error:',error.message);send(socket,{type:'error',message:'本次操作失败，请重新进入房间'});}
    });
    socket.on('pong',()=>{ctx.pingSentAt=null;});
    socket.on('close',()=>{this.disconnect(ctx);this.clients.delete(socket);});
    socket.on('error',()=>{});
  }
  error(ctx,message){send(ctx.socket,{type:'error',message});}
  roomInfo(room){
    room.players.forEach((p,slot)=>{
      if(p)send(p.socket,{type:'room',code:room.code,slot,token:p.token,target:room.target,ruleset:room.ruleset,rules:room.rules,sessionId:room.sessionId,
        players:room.players.map(x=>x?{name:x.name,role:x.role,connected:x.connected,playerId:x.identity?.slice(0,12)||null}:null)});
    });
  }
  broadcast(room){
    if(!room.state)return;
    this.recordResult(room);
    // Tag the simulated instant, excluding the unfinished fixed-step remainder.
    // This clock keeps advancing during pauses while state.time stays frozen.
    const serverTime=this.lastTick-this.accumulator+(room.advancedMs||0);
    if(room.state.phase==='over'&&room.matchEndedAt===null)room.matchEndedAt=serverTime;
    const message={type:'state',state:room.state,seq:++room.snapshotSeq,matchId:room.matchId,leaderboard:room.leaderboardResult||null,
      serverTime,sessionId:room.sessionId,matchEndedAt:room.matchEndedAt,abandoned:room.abandoned};
    for(const p of room.players)if(p)send(p.socket,message);
  }
  broadcastReady(room){for(const p of room.players)if(p)send(p.socket,{type:'resumeReady',ready:[...room.resumeReady].sort()});}
  recordResult(room){
    if(!this.leaderboard||room.state?.phase!=='over'||room.leaderboardMatchId===room.matchId)return;
    room.leaderboardMatchId=room.matchId;
    if(room.abandoned){room.leaderboardResult={status:'excluded',reason:'abandoned'};return;}
    room.leaderboardResult={status:'pending'};
    const matchId=room.matchId;
    // Capture the participants before a leave/rematch can change the room.
    this.leaderboard.recordMatch(room.players.map(p=>p?{identity:p.identity,name:p.name}:null),room.state)
      .then(result=>{if(room.matchId===matchId)room.leaderboardResult=result;})
      .catch(error=>{console.error('Leaderboard result:',error.message);if(room.matchId===matchId)room.leaderboardResult={status:'error'};});
  }
  connect(ctx,room,slot,name,role,key){
    const token=randomBytes(24).toString('hex');
    const p={socket:ctx.socket,name:cleanName(name),role:roleOf(role),connected:true,token,identity:playerIdentity(key)};
    room.players[slot]=p;ctx.room=room;ctx.slot=slot;this.tokens.set(token,{room,slot});room.touched=this.now();
  }
  settle(room){
    this.tick();
    if(!this.rooms.has(room.code))return false;
    // Finish only this room's partial step before switching phases. The next
    // fixed step subtracts this credit, preserving the other rooms' 60 Hz grid.
    const elapsed=this.accumulator-(room.advancedMs||0);
    if(room.state&&elapsed>1e-6){
      stepMatch(room.state,room.inputs,elapsed/1000);
      this.recordResult(room);
      for(const input of room.inputs)input.shot=null;
    }
    room.advancedMs=this.accumulator;
    return true;
  }
  message(ctx,m){
    this.tick();
    if(ctx.socket.readyState!==1)return;
    if(m.type==='ping'){send(ctx.socket,{type:'pong',at:m.at});return;}
    if(['create','join'].includes(m.type)&&m.playerKey!==undefined&&!validPlayerKey(m.playerKey))return this.error(ctx,'玩家凭据无效，请刷新后重新进入');
    if(m.type==='create'){
      if(ctx.room)return this.error(ctx,'请先退出当前房间');
      if(this.rooms.size>=200)return this.error(ctx,'房间暂满，请稍后再试');
      const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code;
      do{code=Array.from({length:5},()=>alphabet[randomInt(alphabet.length)]).join('');}while(this.rooms.has(code));
      const ruleset=rulesetOf(m.ruleset);
      const room={code,ruleset,rules:Object.freeze({finale:m.finale==='father-son'?'father-son':'none'}),
        target:ruleset==='standard21'?21:[5,11,21].includes(m.target)?m.target:5,players:[null,null],state:null,snapshotSeq:0,matchId:1,
        sessionId:randomBytes(16).toString('hex'),matchEndedAt:null,abandoned:false,
        inputs:[{},{}],lastInput:[0,0],lastShot:[-Infinity,-Infinity],rematch:new Set(),resumeReady:new Set(),advancedMs:this.accumulator,touched:this.now()};
      this.rooms.set(code,room);this.connect(ctx,room,0,m.name,m.role,m.playerKey);this.roomInfo(room);return;
    }
    if(m.type==='join'){
      if(ctx.room)return this.error(ctx,'请先退出当前房间');
      const room=this.rooms.get(String(m.code||'').trim().toUpperCase());
      if(!room)return this.error(ctx,'未找到房间，请检查房间码');
      if(room.players[1]||room.state)return this.error(ctx,'房间已满或比赛已开始');
      if(!room.players[0]?.connected)return this.error(ctx,'房主暂时离线，请等待房主重新连接后加入');
      if(room.rules.finale==='father-son'&&m.finaleCapability!=='father-son')return this.error(ctx,'父子局需要双方更新游戏，请联网刷新后重试；普通对局可继续使用');
      this.connect(ctx,room,1,m.name,m.role,m.playerKey);
      room.state=createMatch({ruleset:room.ruleset,target:room.target,roles:room.players.map(p=>p.role),seed:randomInt(1,1000000)});
      room.advancedMs=this.accumulator;
      this.roomInfo(room);this.broadcast(room);return;
    }
    if(m.type==='resumeSession'){
      if(ctx.room)return this.error(ctx,'已经连接房间');
      const saved=this.tokens.get(m.token);
      if(!saved||!this.rooms.has(saved.room.code))return this.error(ctx,'房间恢复时间已过，请重新约战');
      const {room,slot}=saved;
      if(!this.settle(room))return this.error(ctx,'房间恢复时间已过，请重新约战');
      const p=room.players[slot];
      if(!p||p.token!==m.token)return this.error(ctx,'该球员已离开房间');
      if(p.connected)return this.error(ctx,'该球员已经在线');
      p.socket=ctx.socket;p.connected=true;ctx.room=room;ctx.slot=slot;room.touched=this.now();
      this.roomInfo(room);this.broadcastReady(room);this.broadcast(room);return;
    }
    const room=ctx.room,slot=ctx.slot;if(!room)return this.error(ctx,'请先创建或加入房间');
    if(m.type!=='input'&&(!this.settle(room)||ctx.room!==room))return;
    room.touched=this.now();
    if(m.type==='leave'){this.leave(ctx);return;}
    const s=room.state;if(!s)return;
    if(m.type==='input'){
      if(!['serve','rally'].includes(s.phase))return;
      let x=clamp(m.x,-1,1),z=clamp(m.z,-1,1);const length=Math.hypot(x,z);if(length>1){x/=length;z/=length;}
      const existing=room.inputs[slot];
      // A shot is one event: later movement packets must not replace its target or charge.
      let shot=existing.shot||null,aim=shot?existing.aim:clamp(m.aim,-1,1),aimDepth=shot?existing.aimDepth:clamp(m.aimDepth,-1,1),charge=shot?existing.charge:clamp(m.charge,0,1);
      if(!shot&&['clear','drop','smash'].includes(m.shot)&&this.now()-room.lastShot[slot]>=100){
        shot=m.shot;aim=clamp(m.aim,-1,1);aimDepth=clamp(m.aimDepth,-1,1);charge=clamp(m.charge,0,1);room.lastShot[slot]=this.now();
      }
      const prepare=['clear','drop','smash'].includes(m.prepare)?m.prepare:null;
      room.inputs[slot]={x,z,aim,aimDepth,charge,shot,prepare};room.lastInput[slot]=this.now();
    }else if(m.type==='pause'){
      if(!pauseMatch(s,slot))return this.error(ctx,'本局暂停已用过，或当前不能暂停');
      room.resumeReady.clear();this.broadcastReady(room);room.inputs=[{},{}];this.broadcast(room);
    }else if(m.type==='suspend'){
      this.freeze(room,slot);this.broadcast(room);
    }else if(m.type==='resume'){
      if(s.phase!=='paused')return this.error(ctx,'当前不是暂停状态');
      if(room.players.some(p=>!p?.connected))return this.error(ctx,'等待另一位球友重新连接');
      room.resumeReady.add(slot);this.broadcastReady(room);
      if(room.resumeReady.size===2)resumeMatch(s);
      room.inputs=[{},{}];this.broadcast(room);
    }else if(m.type==='rematch'&&s.phase==='over'){
      room.rematch.add(slot);
      for(const p of room.players)if(p)send(p.socket,{type:'rematch',ready:[...room.rematch]});
      if(room.rematch.size===2&&room.players.every(p=>p?.connected)){
        room.matchId++;
        room.matchEndedAt=null;
        room.leaderboardResult=null;room.abandoned=false;
        room.state=createMatch({ruleset:room.ruleset,target:room.target,roles:room.players.map(p=>p.role),seed:randomInt(1,1000000)});
        room.advancedMs=this.accumulator;
        room.inputs=[{},{}];room.lastInput=[0,0];room.lastShot=[-Infinity,-Infinity];
        room.rematch.clear();room.resumeReady.clear();this.broadcastReady(room);this.broadcast(room);
      }
    }
  }
  freeze(room,slot){
    room.resumeReady.clear();this.broadcastReady(room);room.inputs=[{},{}];
    const s=room.state;if(!s||s.phase==='over'||s.phase==='paused')return;
    if(s.phase==='countdown'){
      // This is still the same interruption, with the same owner, budget and resume phase.
      s.phase='paused';s.timer=s.pause.remaining;s.message='比赛暂停 · 等待双方重新准备';
    }else if(!pauseMatch(s,slot)){
      // No fresh budget after a previous interruption; never let reconnect reset it.
      finishMatch(s,scoreWinner(s),'暂停次数已用完，本局按当前比分结束','pause-limit');
    }
  }
  disconnect(ctx){
    if(this.closing){ctx.room=null;ctx.slot=null;return;}
    const room=ctx.room;if(!room)return;const p=room.players[ctx.slot];
    if(!p||p.socket!==ctx.socket)return;
    if(!this.settle(room)||ctx.room!==room)return;
    const slot=ctx.slot;p.connected=false;p.socket=null;room.touched=this.now();
    ctx.room=null;ctx.slot=null;room.rematch.delete(slot);
    this.freeze(room,slot);this.roomInfo(room);this.broadcast(room);
  }
  leave(ctx){
    const room=ctx.room;if(!room)return;const slot=ctx.slot,p=room.players[slot];
    if(room.state?.phase==='over')this.recordResult(room);
    else room.abandoned=true;
    if(p)this.tokens.delete(p.token);
    room.players[slot]=null;ctx.room=null;ctx.slot=null;
    if(room.state&&room.state.phase!=='over')finishMatch(room.state,null,'球友已离开，本局结束','quit');
    this.roomInfo(room);this.broadcast(room);
    // A waiting host leaving invalidates its invitation.
    if(!room.state||room.players.every(p=>!p))this.remove(room);
  }
  remove(room){
    if(room.state?.phase==='over')this.recordResult(room);
    else room.abandoned=true;
    if(room.state&&room.state.phase!=='over')finishMatch(room.state,null,'房间已关闭，本局结束','disconnect');
    this.broadcast(room);
    for(const p of room.players)if(p)this.tokens.delete(p.token);
    this.rooms.delete(room.code);
    for(const ctx of this.clients.values())if(ctx.room===room){
      ctx.room=null;ctx.slot=null;ctx.socket.terminate();
    }
  }
  tick(){
    if(this.ticking)return;
    this.ticking=true;
    try{
    const now=this.now();this.accumulator+=Math.max(0,now-this.lastTick);this.lastTick=now;
    for(const room of this.rooms.values()){
      if(now-room.touched>30*60*1000||room.players.every(p=>!p?.connected)&&now-room.touched>35000){this.remove(room);continue;}
      for(let i=0;i<2;i++)if(now-room.lastInput[i]>250)room.inputs[i]={};
    }
    let snapshotDue=false;
    while(this.accumulator+1e-6>=STEP_MS){
      this.accumulator=Math.max(0,this.accumulator-STEP_MS);this.tickCount++;
      for(const room of this.rooms.values()){
        const elapsed=STEP_MS-(room.advancedMs||0);room.advancedMs=0;
        if(room.state&&elapsed>1e-6){
          stepMatch(room.state,room.inputs,elapsed/1000);
          this.recordResult(room);
          for(let i=0;i<2;i++)room.inputs[i].shot=null;
        }
      }
      if(this.tickCount%3===0)snapshotDue=true;
    }
    // Detect silence after advancing already elapsed time, so a newly frozen
    // room is not charged for time before the interruption was detected.
    for(const ctx of this.clients.values()){
      if(ctx.pingSentAt!==null&&now-ctx.pingSentAt>=PONG_TIMEOUT){
        this.disconnect(ctx);ctx.socket.terminate();this.clients.delete(ctx.socket);continue;
      }
      if(ctx.socket.readyState===1&&ctx.pingSentAt===null&&now-ctx.lastPing>=PING_INTERVAL){
        ctx.lastPing=now;ctx.pingSentAt=now;
        try{ctx.socket.ping();}catch{this.disconnect(ctx);ctx.socket.terminate();this.clients.delete(ctx.socket);}
      }
    }
    if(snapshotDue)for(const room of this.rooms.values())this.broadcast(room);
    }finally{this.ticking=false;}
  }
  close(){this.closing=true;clearInterval(this.timer);for(const socket of this.clients.keys())socket.terminate();this.clients.clear();this.rooms.clear();this.tokens.clear();}
}
