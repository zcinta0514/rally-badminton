import test from 'node:test';
import assert from 'node:assert/strict';
import { PeerMatch } from '../src/peer-match.js';
const ready={type:'ready',format:'doubles',target:5,ruleset:'quick',finale:'none'};
function fixture(){let now=0;const messages=[[],[],[],[]];const match=new PeerMatch({format:'doubles',host:{name:'Host'},sessionId:'test-session',now:()=>now,send:(s,m)=>messages[s].push(m)});return {match,messages,advance(ms){now+=ms;match.tick();}};}
function full(f){for(let i=1;i<4;i++)f.match.join({name:`P${i}`});}
test('four real seats consent and lobby changes clear readiness',()=>{const f=fixture();full(f);assert.equal(f.match.players.length,4);assert.equal(f.match.state,null);f.match.receive(0,ready);f.match.receive(1,{type:'lobby',role:'swift'});assert.equal(f.match.startReady.size,0);for(let i=0;i<4;i++)f.match.receive(i,ready);assert.equal(f.match.state.format,'doubles');assert.equal(f.match.state.phase,'countdown');assert.equal(f.match.state.players[1].role,'swift');});
test('disconnect reserves private seat, freezes then aborts without winner after thirty seconds',()=>{const f=fixture();full(f);for(let i=0;i<4;i++)f.match.receive(i,ready);f.match.disconnect(2);const before=structuredClone(f.match.state);f.advance(29000);assert.equal(f.match.state.time,before.time);assert.equal(f.match.state.phase,'paused');assert.throws(()=>f.match.reconnect('test-session','forged'));f.advance(1001);assert.equal(f.match.state.phase,'over');assert.equal(f.match.state.winner,null);assert.equal(f.match.abandoned,true);});
test('own seat token recovers and all four must consent again',()=>{const f=fixture();full(f);f.match.announce();const token=f.messages[2].at(-1).token;assert.ok(token);assert.ok(!JSON.stringify(f.messages[1]).includes(token));for(let i=0;i<4;i++)f.match.receive(i,ready);f.match.disconnect(2);assert.equal(f.match.reconnect('test-session',token),2);for(let i=0;i<3;i++)f.match.receive(i,{type:'resume'});assert.equal(f.match.state.phase,'paused');f.match.receive(3,{type:'resume'});assert.equal(f.match.state.phase,'countdown');});

test('doubles records isolate team wins from singles and reject duplicate identities',async()=>{
 const {createPeerRecords}=await import('../src/peer-records.js');const data=new Map();const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const doubles=createPeerRecords({storage,format:'doubles'}), singles=createPeerRecords({storage});
 const players=['aaaaaaaaaaaa','bbbbbbbbbbbb','cccccccccccc','dddddddddddd'].map(playerId=>({playerId,name:playerId}));
 const input={sessionId:'session',matchId:1,selfId:players[0].playerId,players,state:{format:'doubles',phase:'over',winner:0,score:[5,2]}};
 assert.equal(doubles.record(input).status,'local');assert.equal(singles.record(input).status,'excluded');
 assert.equal(doubles.list().entries.find(p=>p.playerId===players[2].playerId).wins,1);assert.equal(singles.list().entries.length,0);
 assert.equal(createPeerRecords({storage,format:'doubles'}).list().entries.length,4);
 assert.equal(doubles.record({...input,matchId:2,players:[players[0],players[1],players[0],players[3]]}).status,'excluded');
});

test('input ownership, four-way pause/rematch, and terminal abort cannot be bypassed',()=>{
 const f=fixture();full(f);for(let i=0;i<4;i++)f.match.receive(i,ready);f.match.state.phase='rally';
 f.match.receive(3,{type:'input',slot:0,x:1,score:[99,0]});assert.equal(f.match.inputs[3].x,1);assert.equal(f.match.inputs[0].x,undefined);assert.deepEqual(f.match.state.score,[0,0]);
 f.match.receive(3,{type:'pause'});assert.equal(f.match.state.pause.by,1);
 for(let i=0;i<3;i++)f.match.receive(i,{type:'resume'});assert.equal(f.match.state.phase,'paused');f.match.receive(3,{type:'resume'});assert.equal(f.match.state.phase,'countdown');
 f.match.state.phase='over';f.match.state.winner=0;for(let i=0;i<3;i++)f.match.receive(i,{type:'rematch'});assert.equal(f.match.matchId,1);f.match.receive(3,{type:'rematch'});assert.equal(f.match.matchId,2);
 f.match.disconnect(1);f.advance(30001);for(let i of [0,2,3])f.match.receive(i,{type:'rematch'});assert.equal(f.match.matchId,2);assert.equal(f.match.state.winner,null);
});
test('leaving a lobby rotates its private seat credential before another player uses it',()=>{
 const f=fixture();f.match.join({name:'departing'});f.match.announce();const old=f.messages[1].at(-1).token;f.match.receive(1,{type:'leave'});f.match.join({name:'replacement'});f.match.disconnect(1);assert.throws(()=>f.match.reconnect('test-session',old));
});
test('recovery during a resume countdown preserves the original rally phase',()=>{
 const f=fixture();full(f);for(let i=0;i<4;i++)f.match.receive(i,ready);f.match.state.phase='rally';f.match.receive(0,{type:'pause'});for(let i=0;i<4;i++)f.match.receive(i,{type:'resume'});assert.equal(f.match.state.pause.previousPhase,'rally');f.match.disconnect(3);assert.equal(f.match.state.pause.previousPhase,'rally');
});
