import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createServer } from '../server/index.js';

test('public ingress rejects missing/foreign origins and rejects full capacity before WebSocket upgrade', async t => {
  const origin='https://rally-test.example';
  const app=createServer({peerMode:false,allowedOrigins:[origin],allowMissingOrigin:false,maxClients:1,maxRooms:1});
  await app.listen();t.after(()=>app.close());
  const endpoint=app.url.replace('http:','ws:')+'/ws';
  for(const headers of [{},{Origin:'https://untrusted.example'}]){
    const socket=new WebSocket(endpoint,{headers});
    await new Promise(resolve=>socket.once('error',resolve));
    assert.equal(app.rooms.clients.size,0);
  }
  const first=new WebSocket(endpoint,{origin});await once(first,'open');
  t.after(()=>first.terminate());
  const second=new WebSocket(endpoint,{origin});
  second.on('error',()=>{});
  const status=await new Promise(resolve=>{
    second.once('unexpected-response',(_req,res)=>{res.resume();resolve(res.statusCode);second.terminate();});
    second.once('open',()=>{second.terminate();resolve(101);});
  });
  assert.equal(status,503);
  const health=await fetch(app.url+'/health');
  assert.equal(health.headers.get('cache-control'),'no-store');
  assert.deepEqual(await health.json(),{ok:true,rooms:0,clients:1});
});
