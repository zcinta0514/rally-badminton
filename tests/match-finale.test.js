import test from 'node:test';
import assert from 'node:assert/strict';
import { MatchFinale, FINALE_DURATION, FINALE_VOICE_AT } from '../src/match-finale.js';

const packet = (winner=1, matchId=1) => ({sessionId:'friends',matchId,matchEndedAt:1000,
  state:{phase:'over',winner,endReason:'scored',rallyEnd:{duration:1.4}}});
const players = [{name:'橙子 <img>',connected:true},{name:'青柠',connected:true}];
const receive = (f,p=packet(),extra={}) => f.receive(p,{mode:'online',players,finaleMode:'father-son',...extra});
const draw = (f,dt=.05,extra={}) => f.update({dt,serverNow:2450,phase:'over',rallyEnding:false,visible:true,...extra});

test('a named father-son result waits for the last fall, then plays the correct loser once without skipping',()=>{
  const f=new MatchFinale(),p=packet(),before=structuredClone(p);
  receive(f,p);assert.equal(draw(f,.1,{phase:'rally'}),null);
  assert.equal(draw(f,.1,{rallyEnding:true}),null);
  const first=draw(f);assert.equal(first.winner,1);assert.equal(first.loser,0);
  assert.deepEqual(first.names,['橙子 <img>','青柠']);assert.equal(first.age,0);
  let cues=0,frames=0;
  for(let i=0;i<100;i++){receive(f,p);const frame=draw(f);if(frame){frames++;cues+=Number(frame.voice);}}
  assert.equal(cues,1);assert.ok(frames>40);assert.equal(f.blocking,false);
  receive(f,p);assert.equal(draw(f),null);assert.deepEqual(p,before);
  assert.equal(typeof f.skip,'undefined');
});

test('ordinary, missing and invalid room modes never admit a finale, including after a rematch',()=>{
  for(const finaleMode of ['normal',undefined,null,'',true,'FATHER-SON']){
    const f=new MatchFinale();
    receive(f,packet(),{finaleMode});
    assert.equal(f.blocking,false,String(finaleMode));assert.equal(draw(f),null);
    receive(f,packet(0,2),{finaleMode});assert.equal(draw(f),null);
  }
  const f=new MatchFinale();f.receive(packet(),{mode:'online',players});
  assert.equal(draw(f),null,'omitting the setting is ordinary play');
});

test('a new match cannot inherit father-son admission from the previous match',()=>{
  const f=new MatchFinale();receive(f);assert.ok(draw(f));draw(f,FINALE_DURATION);
  receive(f,packet(0,2),{finaleMode:'normal'});assert.equal(draw(f),null);
  receive(f,packet(0,3));assert.ok(draw(f),'a later explicit father-son match can play');
});

test('AI, interrupted, missing identity, tied and disconnected results cannot play',()=>{
  for(const change of [p=>p.state.endReason='pause-timeout',p=>p.state.winner=null,p=>p.abandoned=true,
    p=>p.state.phase='intermission',p=>delete p.matchEndedAt,p=>delete p.sessionId]){
    const f=new MatchFinale(),p=packet();change(p);receive(f,p);assert.equal(draw(f),null);
  }
  for(const extra of [{mode:'ai'},{mode:'menu'},{players:[players[0],null]},
    {players:[players[0],{...players[1],connected:false}]}]){
    const f=new MatchFinale();receive(f,packet(),extra);assert.equal(draw(f),null);
  }
});

test('cancel consumes pending/active results, whereas a new match resets the presentation timeline',()=>{
  const f=new MatchFinale();receive(f);f.cancel();receive(f);assert.equal(draw(f),null);
  receive(f,packet(0,2));const frame=draw(f);assert.equal(frame.loser,1);assert.equal(frame.age,0);
  draw(f);f.cancel();receive(f,packet(0,2));assert.equal(draw(f),null);
  receive(f,packet(1,3));assert.ok(draw(f));f.reset();assert.equal(draw(f),null);
});

test('both clients sample the same timeline and background cannot emit delayed voice',()=>{
  const a=new MatchFinale(),b=new MatchFinale();receive(a);receive(b);draw(a);draw(b);
  for(let i=0;i<15;i++)assert.deepEqual(draw(a),draw(b));
  const hidden=draw(a,FINALE_VOICE_AT,{visible:false});assert.equal(hidden.voice,false);
  assert.equal(draw(a,.01).voice,false,'do not queue a voice missed while hidden');
  const held=a.age;draw(a,100,{visible:false});assert.equal(a.age,held,'background cannot silently skip the presentation timeline');
  draw(a,FINALE_DURATION);assert.equal(a.blocking,false);
});

test('a recovered connection can still earn a normal result later in the same match',()=>{
  const f=new MatchFinale(),p=packet();p.state.phase='paused';p.state.endReason=null;p.matchEndedAt=null;
  receive(f,p);f.cancel();receive(f,p,{players:[players[0],{...players[1],connected:false}]});
  receive(f,packet());assert.ok(draw(f),'pre-result disconnect cannot consume a future scored finale');
});
