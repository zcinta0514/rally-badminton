import test from 'node:test';
import assert from 'node:assert/strict';
import {PeerMatch} from '../src/peer-match.js';
import {Rooms} from '../server/rooms.js';
import {RULES_VERSION} from '../shared/game.js';

for(const transport of ['peer','websocket'])test(`${transport}: rules are acknowledged by both players before a shared countdown`,t=>{
  let clock=0;const messages=[[],[]];let state,ready,send,join,advance;
  const acknowledgement={type:'ready',target:11,ruleset:'quick',finale:'father-son'};
  if(transport==='peer'){
    const match=new PeerMatch({readyRequired:true,host:{name:'A',role:'swift'},target:11,finale:'father-son',now:()=>clock,send:(slot,m)=>messages[slot].push(m)});
    t.after(()=>match.close());match.announce();state=()=>match.state;ready=()=>match.startReady;
    send=(slot,m)=>match.receive(slot,m);join=()=>match.join({name:'B',role:'power'});advance=()=>match.tick();
  }else{
    const rooms=new Rooms({now:()=>clock});t.after(()=>rooms.close());
    const clients=[0,1].map(slot=>({socket:{readyState:1,send:raw=>messages[slot].push(JSON.parse(raw))},room:null,slot:null}));
    rooms.message(clients[0],{type:'create',readyRequired:true,rulesVersion:RULES_VERSION,name:'A',role:'swift',target:11,finale:'father-son'});
    const room=clients[0].room;state=()=>room.state;ready=()=>room.startReady;
    send=(slot,m)=>rooms.message(clients[slot],m);join=()=>rooms.message(clients[1],{type:'join',code:room.code,rulesVersion:RULES_VERSION,name:'B',role:'power',finaleCapability:'father-son'});advance=()=>rooms.tick();
  }
  send(0,acknowledgement);assert.equal(ready().size,0,'no preparation before partner arrives');join();
  assert.equal(state(),null,'joining alone does not start a match');
  send(0,{...acknowledgement,finale:'none'});assert.equal(ready().size,0,'normal consent cannot accept father-son');
  send(1,{...acknowledgement,target:5});assert.equal(ready().size,0,'guest cannot change room score');
  send(0,acknowledgement);assert.equal(ready().size,1);assert.equal(state(),null);
  send(0,acknowledgement);assert.equal(ready().size,1,'duplicate preparation cannot replace partner');
  send(1,acknowledgement);assert.equal(state().phase,'countdown');assert.equal(state().timer,3);
  assert.deepEqual(state().players.map(p=>p.role),['swift','power']);
  const first=state();send(0,acknowledgement);assert.equal(state(),first);
  send(0,{type:'input',shot:'clear'});assert.equal(state().hitId,0);
  for(let i=0;i<29;i++){clock+=100;advance();}
  assert.equal(state().phase,'countdown');assert.equal(state().hitId,0);
  clock+=150;advance();assert.equal(state().phase,'serve');assert.equal(state().hitId,0);
  const frames=messages.map(list=>list.filter(m=>m.type==='state'));
  assert.deepEqual(frames[0].at(-1).state,frames[1].at(-1).state);
});

test('departure before start clears peer consent and cannot launch with a missing guest',()=>{
  const match=new PeerMatch({readyRequired:true,host:{name:'A'},send(){}});
  match.join({name:'B'});const ack={type:'ready',target:5,ruleset:'quick',finale:'none'};
  match.receive(0,ack);match.disconnect(1);assert.equal(match.startReady.size,0);
  match.receive(0,ack);assert.equal(match.state,null);match.close();
});

test('WebSocket joining UI cannot silently accept a room without the readiness gate',t=>{
  const rooms=new Rooms({now:()=>0});t.after(()=>rooms.close());const messages=[];
  const ctx=()=>({socket:{readyState:1,send:raw=>messages.push(JSON.parse(raw))},room:null,slot:null});const host=ctx(),guest=ctx();
  rooms.message(host,{type:'create',rulesVersion:RULES_VERSION,readyRequired:false,name:'A'});
  rooms.message(guest,{type:'join',rulesVersion:RULES_VERSION,readyRequired:true,name:'B',code:host.room.code});
  assert.equal(guest.room,null);assert.equal(host.room.state,null);assert.equal(host.room.players[1],null);
  assert.match(messages.at(-1).message,/双方规则确认/);
});
