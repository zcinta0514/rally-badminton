import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createMatch, stepMatch, aiInput } from '../shared/game.js';

import * as api from '../src/peer-network.js';
const flush = async () => { for (let i=0;i<16;i++) await Promise.resolve(); };
const options = { name:'球友', role:'balanced', playerId:'public-player-id' };

function transportBus({ automatic=true, collisions=0, roomBeforeAccept=false }={}) {
  const peers=[], registry=new Map(), sent=[];
  let guest=0;
  class Connection extends EventEmitter {
    open=false; bufferSize=0; dataChannel={bufferedAmount:0};
    constructor(owner, peer) { super(); this.owner=owner; this.peer=peer; this.closed=false; }
    send(message) { assert.ok(this.open); sent.push({owner:this.owner.id,message:structuredClone(message)});queueMicrotask(()=>{if(!this.other.closed)this.other.emit('data',structuredClone(message));}); }
    close() { if(this.closed)return;this.closed=true;this.open=false;this.emit('close');if(this.other&&!this.other.closed)this.other.close(); }
  }
  class FakePeer extends EventEmitter {
    open=false; destroyed=false; disconnected=false; connections=[];
    constructor(id) { super();this.id=id||'guest-'+(++guest);peers.push(this);if(automatic)queueMicrotask(()=>this.register()); }
    register() { if(this.destroyed)return;if(collisions-->0||registry.has(this.id)){this.emit('error',{type:'unavailable-id'});return;}registry.set(this.id,this);this.open=true;this.emit('open',this.id); }
    connect(id, config) {
      assert.equal(config.serialization,'json');assert.equal(config.reliable,true);
      const a=new Connection(this,id),host=registry.get(id);this.connections.push(a);
      queueMicrotask(()=>{
        if(!host){this.emit('error',{type:'peer-unavailable'});return;}
        const b=new Connection(host,this.id);a.other=b;b.other=a;host.connections.push(b);host.emit('connection',b);
        a.open=b.open=true;
        if(roomBeforeAccept)a.emit('data',{type:'room',code:'ABCDE',slot:1,sessionId:'fake',players:[{},{}]});
        b.emit('open');a.emit('open');
      });
      return a;
    }
    disconnect() { this.disconnected=true;registry.delete(this.id);this.emit('disconnected'); }
    destroy() { if(this.destroyed)return;this.destroyed=true;this.open=false;registry.delete(this.id);for(const c of this.connections)c.close();this.emit('close'); }
  }
  return { peers, sent, peerFactory:(id)=>new FakePeer(id) };
}

test('peer room transport exports a callable entry point', () => {
  assert.equal(typeof api.openPeerRoom, 'function');
});

test('invalid room codes reject before allocating a network peer', async () => {
  const bus=transportBus();
  for (const code of ['', 'ABCD', 'ABCDEF', 'AB0DE', '<img>']) {
    await assert.rejects(api.openPeerRoom({...options,type:'join',code,peerFactory:bus.peerFactory}),/5|五|房间码/);
  }
  assert.equal(bus.peers.length,0);
});

test('create resolves only after registration and delivers the authoritative local room', async t => {
  const bus=transportBus({automatic:false}),messages=[];let resolved=false;
  const pending=api.openPeerRoom({...options,type:'create',peerFactory:bus.peerFactory,onMessage:m=>messages.push(m)}).then(s=>(resolved=true,s));
  await flush();assert.equal(resolved,false);assert.equal(messages.length,0);
  bus.peers[0].register();const session=await pending;t.after(()=>session.close());
  assert.equal(session.isHost,true);assert.match(messages[0].code,/^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(messages[0].slot,0);assert.ok(messages[0].sessionId);assert.equal(messages[0].token,null);
});

async function pair(t, bus=transportBus()) {
  const hostMessages=[],guestMessages=[],hostCloses=[],guestCloses=[],statuses=[];
  const host=await api.openPeerRoom({...options,type:'create',code:'ABCDE',peerFactory:bus.peerFactory,onMessage:m=>hostMessages.push(m),onClose:e=>hostCloses.push(e),onStatus:s=>statuses.push(s)});
  t.after(()=>host.close());
  const guest=await api.openPeerRoom({...options,name:'客人',playerId:'public-guest',type:'join',code:hostMessages[0].code,peerFactory:bus.peerFactory,onMessage:m=>guestMessages.push(m),onClose:e=>guestCloses.push(e)});
  t.after(()=>guest.close());await flush();
  return {bus,host,guest,hostMessages,guestMessages,hostCloses,guestCloses,statuses};
}

test('two peers complete version handshake, propagate a real room and exchange ping', async t => {
  const {bus,host,guest,hostMessages,guestMessages}=await pair(t);
  assert.equal(guest.isHost,false);
  assert.equal(guestMessages[0].type,'room');assert.equal(guestMessages[0].slot,1);
  assert.equal(guestMessages[0].sessionId,hostMessages[0].sessionId);
  assert.equal(guestMessages[0].players[1].name,'客人');assert.equal(guestMessages[0].players[1].playerId,'public-guest');
  assert.ok(guestMessages.some(m=>m.type==='state'));
  guest.send({type:'ping',at:42});await flush();assert.ok(guestMessages.some(m=>m.type==='pong'&&m.at===42));
  host.send({type:'ping',at:43});assert.ok(hostMessages.some(m=>m.type==='pong'&&m.at===43));
  assert.ok(bus.sent.some(s=>s.message.type==='rally-hello'&&s.message.version===1));
  assert.equal(JSON.stringify(bus.sent).includes('playerKey'),false);
});

test('room received before protocol acceptance cannot resolve a join', async t => {
  const bus=transportBus({roomBeforeAccept:true});
  const messages=[];
  const host=await api.openPeerRoom({...options,type:'create',code:'ABCDE',peerFactory:bus.peerFactory,onMessage:m=>messages.push(m)});t.after(()=>host.close());
  await assert.rejects(api.openPeerRoom({...options,type:'join',code:messages[0].code,peerFactory:bus.peerFactory}),/协议|握手/);
});

test('second guest is rejected without interrupting the first guest', async t => {
  const {bus,hostMessages,guest,guestMessages,hostCloses}=await pair(t);
  await assert.rejects(api.openPeerRoom({...options,type:'join',code:hostMessages[0].code,peerFactory:bus.peerFactory}),/已满/);
  guest.send({type:'ping',at:77});await flush();assert.ok(guestMessages.some(m=>m.type==='pong'&&m.at===77));assert.equal(hostCloses.length,0);
});

test('unavailable code is reported in Chinese and peer is destroyed', async () => {
  const bus=transportBus();await assert.rejects(api.openPeerRoom({...options,type:'join',code:'ABCDE',peerFactory:bus.peerFactory}),/未找到房间|不存在/);assert.equal(bus.peers[0].destroyed,true);
});

test('room id collisions retry with a fresh five character code and bounded attempts', async t => {
  const bus=transportBus({collisions:2}),messages=[];
  const host=await api.openPeerRoom({...options,type:'create',peerFactory:bus.peerFactory,onMessage:m=>messages.push(m)});t.after(()=>host.close());
  assert.equal(bus.peers.length,3);assert.equal(new Set(bus.peers.map(p=>p.id)).size,3);assert.ok(bus.peers.slice(0,2).every(p=>p.destroyed));
  const blocked=transportBus({collisions:100});await assert.rejects(api.openPeerRoom({...options,type:'create',peerFactory:blocked.peerFactory}),/房间码|繁忙/);
  assert.ok(blocked.peers.length<=5);assert.ok(blocked.peers.every(p=>p.destroyed));
});

test('signaling disconnect preserves an established data channel', async t => {
  const {bus,guest,guestMessages,hostCloses,guestCloses,statuses}=await pair(t);
  bus.peers[0].disconnect();bus.peers[1].disconnect();guest.send({type:'ping',at:99});await flush();
  assert.ok(guestMessages.some(m=>m.type==='pong'&&m.at===99));assert.equal(hostCloses.length,0);assert.equal(guestCloses.length,0);assert.ok(statuses.some(s=>s.includes('配对')));
});

test('actual data channel loss tears down both peers and closes each session exactly once', async t => {
  const {bus,host,guest,hostCloses,guestCloses}=await pair(t);
  bus.peers[1].connections[0].close();await flush();
  assert.equal(hostCloses.length,1);assert.equal(guestCloses.length,1);assert.ok(bus.peers.every(p=>p.destroyed));
  assert.equal(host.send({type:'ping',at:1}),false);assert.equal(guest.send({type:'ping',at:1}),false);
  host.close();guest.close();assert.equal(hostCloses.length,1);assert.equal(guestCloses.length,1);
});

test('local close is silent, remote close is notified and cleanup is idempotent', async t => {
  const {bus,host,guest,hostCloses,guestCloses}=await pair(t);host.close();host.close();await flush();
  assert.equal(hostCloses.length,0);assert.equal(guestCloses.length,1);assert.ok(bus.peers.every(p=>p.destroyed));assert.equal(guest.send({type:'pause'}),false);
});

test('aborting pending registration rejects promptly and cleans up', async () => {
  const bus=transportBus({automatic:false}),controller=new AbortController();
  const pending=api.openPeerRoom({...options,type:'create',peerFactory:bus.peerFactory,signal:controller.signal});await flush();controller.abort();
  await assert.rejects(pending,/取消/);assert.ok(bus.peers.every(p=>p.destroyed));bus.peers[0].register();
});

test('registration timeout rejects with service error and leaves no active peer', async t => {
  t.mock.timers.enable({apis:['setTimeout','setInterval']});
  const bus=transportBus({automatic:false}),pending=api.openPeerRoom({...options,type:'create',peerFactory:bus.peerFactory});
  await flush();t.mock.timers.tick(25000);await assert.rejects(pending,/配对|超时|网络/);assert.ok(bus.peers.every(p=>p.destroyed));
});

test('guest cannot send authority messages, invalid shapes or oversized input', async t => {
  const {guest,bus,guestMessages}=await pair(t);const before=bus.sent.length;
  for(const m of [{type:'state',state:{}},{type:'room'},{type:'input',x:NaN},{type:'input',x:{}},{type:'input',shot:'oops'},null,[],{type:'ping',at:'a'},{type:'input',payload:'x'.repeat(70000)}])assert.equal(guest.send(m),false);
  assert.equal(bus.sent.length,before);
  assert.equal(guest.send({type:'input',x:.5,z:0,playerKey:'private-secret'}),true);await flush();
  assert.equal(JSON.stringify(bus.sent).includes('private-secret'),false);assert.ok(guestMessages.some(m=>m.type==='state'));
});

test('snapshot backpressure drops stale snapshots and hard congestion ends the connection', async t => {
  const {bus,guest,guestCloses}=await pair(t);
  const outbound=bus.peers[1].connections[0];outbound.dataChannel.bufferedAmount=70000;
  assert.equal(guest.send({type:'input',x:1}),false);
  outbound.dataChannel.bufferedAmount=2*1024*1024;
  assert.equal(guest.send({type:'ping',at:12}),false);assert.equal(guestCloses.length,1);
});

test('malformed unsolicited second guest cannot terminate the active match', async t => {
  const {bus,guest,guestMessages,hostCloses}=await pair(t);
  const rogue=bus.peerFactory();t.after(()=>rogue.destroy());await flush();
  const extra=rogue.connect(bus.peers[0].id,{serialization:'json',reliable:true});
  extra.on('open',()=>extra.send({type:'evil',payload:'x'.repeat(8000)}));
  await flush();assert.equal(hostCloses.length,0);
  guest.send({type:'ping',at:444});await flush();assert.ok(guestMessages.some(m=>m.type==='pong'&&m.at===444));
});

test('closed unaccepted connections release their listeners while host continues waiting', async t => {
  const bus=transportBus(),messages=[];
  const host=await api.openPeerRoom({...options,type:'create',peerFactory:bus.peerFactory,onMessage:m=>messages.push(m)});t.after(()=>host.close());
  const rogue=bus.peerFactory();t.after(()=>rogue.destroy());await flush();
  const extra=rogue.connect(bus.peers[0].id,{serialization:'json',reliable:true});await flush();
  extra.close();await flush();
  assert.equal(extra.other.listenerCount('data'),0);assert.equal(extra.other.listenerCount('error'),0);assert.equal(extra.other.listenerCount('open'),0);
});

test('standard match intermission is a valid authoritative game phase', async t => {
  const {bus,guestMessages,guestCloses}=await pair(t);
  const message=structuredClone(guestMessages.find(m=>m.type==='state'));
  message.state.ruleset='standard21';message.state.target=21;message.state.phase='intermission';message.state.games=[1,0];message.state.gameNumber=2;
  bus.peers[0].connections[0].send(message);await flush();
  assert.equal(guestCloses.length,0);assert.equal(guestMessages.at(-1).state.phase,'intermission');
});

test('incomplete state cannot reach the renderer after handshake', async t => {
  const {bus,guestMessages,guestCloses}=await pair(t);
  const message=structuredClone(guestMessages.find(m=>m.type==='state'));delete message.state.games;
  const count=guestMessages.length;bus.peers[0].connections[0].send(message);await flush();
  assert.equal(guestMessages.length,count);assert.equal(guestCloses.length,1);
});

test('unscoped WebRTC negotiation errors do not terminate an already open match channel', async t => {
  const {bus,guest,guestMessages,hostCloses}=await pair(t);
  bus.peers[0].emit('error',{type:'webrtc',message:'Unsolicited connection negotiation failed'});
  assert.equal(hostCloses.length,0);guest.send({type:'ping',at:456});await flush();
  assert.ok(guestMessages.some(m=>m.type==='pong'&&m.at===456));
  bus.peers[0].connections[0].close();assert.equal(hostCloses.length,1);
});

test('complete standard21 simulation snapshots survive validation through shots, scoring and intermissions', async t => {
  let wallTime=0;t.mock.method(performance,'now',()=>wallTime);
  const {bus,guestMessages,guestCloses}=await pair(t);
  const message=structuredClone(guestMessages.find(m=>m.type==='state'));
  const state=createMatch({ruleset:'standard21',seed:76,difficulty:'hard'}),phases=new Set();
  for(let frame=0;frame<90000&&state.phase!=='over';frame++){
    const before=state.phase;
    wallTime=frame*1000/60;
    // Let the server choose real shots; an unattended receiver makes this
    // deterministic match finish instead of depending on two endless AI rallies.
    const inputs=state.phase==='serve'?[aiInput(state,0,'hard'),aiInput(state,1,'hard')]:[{},{}];
    stepMatch(state,inputs,1/60);
    if(frame%30===0||state.phase!==before){
      phases.add(state.phase);message.seq++;message.serverTime=frame*1000/60;
      // Actual PeerJS JSON serialization removes shared object references.
      message.state=JSON.parse(JSON.stringify(state));
      bus.peers[0].connections[0].send(message);await flush();
      assert.equal(guestCloses.length,0,'valid phase '+state.phase+' at '+frame+' must not disconnect');
    }
  }
  assert.equal(state.phase,'over');assert.ok(phases.has('intermission'));assert.ok(phases.has('rally'));assert.ok(state.hitId>20);
});
