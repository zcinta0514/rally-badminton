import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Rooms} from '../server/rooms.js';
import {RULES_VERSION} from '../shared/game.js';

class Socket extends EventEmitter {
  readyState=1;
  messages=[];
  send(raw){this.messages.push(JSON.parse(raw));}
  close(code,reason){this.closed={code,reason};this.terminate();}
  terminate(){this.readyState=3;this.emit('close');}
}
function fixture(t,limits={}){
  const rooms=new Rooms({now:()=>0,...limits});clearInterval(rooms.timer);t.after(()=>rooms.close());
  const attach=()=>{const socket=new Socket();rooms.attach(socket);return socket;};
  const send=(socket,message)=>socket.emit('message',JSON.stringify({rulesVersion:RULES_VERSION,...message}));
  return {rooms,attach,send};
}

test('client capacity rejects overflow without registering handlers and recovers after disconnect',t=>{
  const {rooms,attach}=fixture(t,{maxClients:2});
  const first=attach(),second=attach(),excess=attach();
  assert.equal(rooms.clients.size,2);assert.equal(excess.closed.code,1013);
  assert.match(excess.messages.at(-1).message,/连接暂满/);assert.equal(excess.listenerCount('message'),0);
  assert.equal(first.readyState,1);assert.equal(second.readyState,1);
  first.terminate();const replacement=attach();assert.equal(replacement.readyState,1);assert.equal(rooms.clients.size,2);
});

test('room capacity still permits joins and releases a slot when the waiting host leaves',t=>{
  const {rooms,attach,send}=fixture(t,{maxRooms:1});const host=attach(),guest=attach(),other=attach();
  send(host,{type:'create',readyRequired:true});const code=host.messages.at(-1).code;
  send(other,{type:'create'});assert.match(other.messages.at(-1).message,/房间暂满/);assert.equal(rooms.rooms.size,1);
  send(guest,{type:'join',code});assert.equal(rooms.clients.get(guest).room.code,code);
  send(host,{type:'leave'});assert.equal(rooms.rooms.size,0);
  send(other,{type:'create'});assert.equal(other.messages.at(-1).type,'room');assert.equal(rooms.rooms.size,1);
});

test('server rejects doubles create and join without mutating singles rooms',t=>{
  const {rooms,attach,send}=fixture(t);const host=attach(),guest=attach();
  send(host,{type:'create',format:'doubles'});assert.equal(rooms.rooms.size,0);assert.match(host.messages.at(-1).message,/仅支持单打/);
  send(host,{type:'create',readyRequired:true,format:'singles'});const code=host.messages.at(-1).code;
  send(guest,{type:'join',code,format:'doubles'});assert.equal(rooms.clients.get(guest).room,null);
  assert.equal(rooms.rooms.get(code).players[1],null);assert.match(guest.messages.at(-1).message,/仅支持单打/);
  send(guest,{type:'join',code,format:'singles'});assert.equal(rooms.clients.get(guest).room.code,code);
});

test('capacity defaults preserve existing room limit and reject invalid configuration',t=>{
  const {rooms}=fixture(t);assert.equal(rooms.maxRooms,200);assert.equal(rooms.maxClients,Infinity);
  for(const limits of [{maxClients:0},{maxClients:NaN},{maxClients:1.5},{maxRooms:0},{maxRooms:Infinity}])assert.throws(()=>new Rooms(limits),RangeError);
});
