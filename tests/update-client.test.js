import test from 'node:test';
import assert from 'node:assert/strict';
import { createUpdateClient, isUpdateSafe } from '../src/update-client.js';

const OLD = '1111111111111111', NEXT = '2222222222222222';
async function until(predicate) {
  const deadline=Date.now()+1500;
  while (!predicate() && Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(predicate(),'expected asynchronous update state before deadline');
}
function emitter(extra = {}) {
  const listeners = new Map();
  return { ...extra, addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, event = {}) { for (const fn of listeners.get(type) || []) fn(event); } };
}
function fixture(t, { safe = true, brokenStorage = false } = {}) {
  const values = new Map(), messages = [], statuses = [];
  let time = 10000, locked = false, reloads = 0, checks = 0, lockTarget;
  const active = { postMessage(message, ports) { messages.push(message); ports?.[0]?.postMessage(message.type === 'VERSION_REQUEST' ? {type:'VERSION',version:OLD} : {type:'CLIENT_VERSION_RESULT',accepted:true,version:OLD}); } };
  const waiting = { postMessage(message, ports) { messages.push(message); ports?.[0]?.postMessage(message.type === 'VERSION_REQUEST' ? {type:'VERSION',version:NEXT} : {type:'ACTIVATION_RESULT',version:NEXT,requestId:message.requestId,status:'deferred'}); } };
  const sw = emitter({controller:active});
  const doc = emitter({hidden:false}); const win = emitter();
  const registration = { active, waiting:null, async update() { checks++; } };
  const storage = {getItem:key=>values.get(key)??null,setItem(key,value){if(brokenStorage)throw new Error('storage denied');values.set(key,value);},removeItem:key=>values.delete(key)};
  const client = createUpdateClient({serviceWorker:sw,document:doc,window:win,storage,version:OLD,
    isSafe:()=>safe,lock:context=>{locked=true;lockTarget=context?.version;},unlock:()=>{locked=false;},reload:()=>{reloads++;},
    now:()=>time,onStatus:status=>statuses.push(status),online:()=>true});
  client.setRegistration(registration); t.after(()=>client.dispose());
  const prepare = async (source = waiting, target = NEXT, transaction = 'test-transaction') => {
    registration.waiting = waiting;
    const result = new Promise(resolve => {
      sw.emit('message',{source,data:{type:'PREPARE_UPDATE',version:target,transaction},ports:[{postMessage:resolve}]});
    });
    return result;
  };
  return {client,sw,doc,win,registration,waiting,active,values,messages,statuses,prepare,
    setSafe:value=>{safe=value;},advance:value=>{time+=value;},locked:()=>locked,lockTarget:()=>lockTarget,reloads:()=>reloads,checks:()=>checks};
}

test('only an idle loaded lobby is safe, including connection and form states', () => {
  const lobby = {ready:true,mode:'menu',visible:true};
  assert.equal(isUpdateSafe(lobby),true);
  for (const change of [{ready:false},{mode:'ai'},{visible:false},{state:{phase:'over'}},{room:{}},{connection:{}},
    {connecting:true},{reconnecting:true},{pendingResult:true},{finale:true},{overlay:true},{editing:true}]) {
    assert.equal(isUpdateSafe({...lobby,...change}),false,JSON.stringify(change));
  }
});

test('checks are throttled, and do not begin a download during a match', async t => {
  const f=fixture(t);
  await f.client.check(); await f.client.check(); assert.equal(f.checks(),1);
  f.advance(65000); f.setSafe(false); await f.client.check(); assert.equal(f.checks(),1);
  f.setSafe(true); await f.client.check(); assert.equal(f.checks(),2);
});

test('a busy window refuses the worker without locking input', async t => {
  const f=fixture(t,{safe:false});
  assert.equal((await f.prepare()).ready,false); assert.equal(f.locked(),false);
});

test('an idle window locks before acknowledging and cancellation restores input', async t => {
  const f=fixture(t);
  assert.deepEqual(await f.prepare(),{ready:true,version:OLD,transaction:'test-transaction'});
  assert.equal(f.locked(),true);
  f.sw.emit('message',{source:f.waiting,data:{type:'CANCEL_UPDATE',version:NEXT,transaction:'test-transaction'}});
  assert.equal(f.locked(),false); assert.equal(f.reloads(),0);
});

test('a controller change alone or first installation never reloads a page', async t => {
  const f=fixture(t); f.sw.emit('controllerchange');
  await new Promise(resolve=>setTimeout(resolve,15)); assert.equal(f.reloads(),0);
});

test('committed update reloads once only after the controlling version is verified', async t => {
  const f=fixture(t); await f.prepare();
  f.sw.emit('message',{source:f.waiting,data:{type:'COMMIT_UPDATE',version:NEXT,transaction:'test-transaction'}});
  f.sw.controller=f.waiting;
  f.sw.emit('controllerchange'); f.sw.emit('controllerchange');
  await until(()=>f.reloads()===1);
  assert.equal(f.reloads(),1); assert.equal(f.values.get('rally.update.reload.'+NEXT),OLD);
});

test('an unchanged controlling version does not cause a reload', async t => {
  const f=fixture(t); await f.prepare();
  f.sw.emit('message',{source:f.waiting,data:{type:'COMMIT_UPDATE',version:NEXT,transaction:'test-transaction'}});
  f.sw.emit('controllerchange'); await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(f.reloads(),0);
});

test('repeated target or unavailable storage cannot enter an automatic reload loop', async t => {
  const f=fixture(t); f.values.set('rally.update.reload.'+NEXT,OLD);
  assert.equal((await f.prepare()).ready,false);
  const denied=fixture(t,{brokenStorage:true}); assert.equal((await denied.prepare()).ready,false);
});

test('an unrelated worker cannot lock or refresh the current page', async t => {
  const f=fixture(t); assert.equal((await f.prepare({})).ready,false);
  assert.equal(f.locked(),false); assert.equal(f.reloads(),0);
});

test('recent interaction delays automatic activation without interrupting the user', async t => {
  const f=fixture(t); f.doc.emit('pointerdown');
  assert.equal((await f.prepare()).ready,false);
  f.advance(2500); assert.equal((await f.prepare()).ready,true);
});

test('a competing activation request cannot release another transaction lock', async t => {
  const f=fixture(t); f.registration.waiting=f.waiting;
  f.waiting.postMessage=(message,ports)=>{
    if(message.type==='VERSION_REQUEST')ports[0].postMessage({type:'VERSION',version:NEXT});
    if(message.type==='REQUEST_ACTIVATION')void f.prepare().then(()=>ports[0].postMessage({type:'ACTIVATION_RESULT',status:'deferred',reason:'coordination-running',version:NEXT,requestId:message.requestId}));
  };
  await f.client.tryActivate({force:true});
  assert.equal(f.locked(),true);
});

test('a responsive background lobby can cooperate but cannot initiate a download', async t => {
  const f=fixture(t); f.doc.hidden=true;
  await f.client.check(); assert.equal(f.checks(),0);
  assert.equal((await f.prepare()).ready,true);
});

test('safety probe never locks input, while prepare passes the target build to the settings snapshot', {timeout:2000}, async t => {
  const f=fixture(t); f.registration.waiting=f.waiting;
  const answer=await new Promise(resolve=>f.sw.emit('message',{source:f.waiting,
    data:{type:'CHECK_UPDATE_SAFETY',version:NEXT,transaction:'probe'},ports:[{postMessage:resolve}]}));
  assert.equal(answer.ready,true);assert.equal(f.locked(),false);
  assert.equal(f.statuses.some(value=>value.state==='applying'),false);
  f.setSafe(false);assert.equal((await f.prepare()).ready,false);
  f.setSafe(true);await f.prepare();assert.equal(f.lockTarget(),NEXT);
});

test('back-forward cache suspends updates and resumes checking and coordination on return', async t => {
  const f=fixture(t);await f.client.check();
  f.win.emit('pagehide',{persisted:true});f.advance(65000);
  await f.client.check({force:true});assert.equal(f.checks(),1);
  assert.equal((await f.prepare()).ready,false);
  f.registration.waiting=null;f.win.emit('pageshow',{persisted:true});
  await until(()=>f.checks()===2);assert.equal(f.checks(),2);
  assert.equal((await f.prepare()).ready,true);
});

test('a restored cached page catches up with an already activated version only when idle', async t => {
  const f=fixture(t);f.win.emit('pagehide',{persisted:true});f.sw.controller=f.waiting;
  f.setSafe(false);f.win.emit('pageshow',{persisted:true});
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(f.reloads(),0);
  f.setSafe(true);await f.client.check({force:true});
  await until(()=>f.reloads()===1);
  assert.equal(f.reloads(),1);assert.equal(f.lockTarget(),NEXT);
  assert.equal(f.values.get('rally.update.reload.'+NEXT),OLD);
});

test('activation after the lock timeout waits for the current match before catching up', async t => {
  const realTimeout=globalThis.setTimeout;
  t.mock.method(globalThis,'setTimeout',(fn,delay,...args)=>realTimeout(fn,delay===15000?20:delay,...args));
  const f=fixture(t);await f.prepare();f.setSafe(false);
  f.sw.emit('message',{source:f.waiting,data:{type:'COMMIT_UPDATE',version:NEXT,transaction:'test-transaction'}});
  await until(()=>!f.locked());
  f.registration.waiting=null;f.sw.controller=f.waiting;f.sw.emit('controllerchange');
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(f.reloads(),0);assert.equal(f.locked(),false);
  f.setSafe(true);await f.client.check({force:true});
  await until(()=>f.reloads()===1);assert.equal(f.lockTarget(),NEXT);
});

test('a lost version reply after controllerchange is retried after the input lock expires', async t => {
  const realTimeout=globalThis.setTimeout;
  t.mock.method(globalThis,'setTimeout',(fn,delay,...args)=>realTimeout(fn,delay===15000?60:delay===2500?10:delay,...args));
  const f=fixture(t);await f.prepare();
  let dropReplies=true,queries=0;
  f.waiting.postMessage=(message,ports)=>{
    if(message.type==='VERSION_REQUEST') { queries++;if(!dropReplies)ports[0].postMessage({type:'VERSION',version:NEXT}); }
    else ports[0]?.postMessage({accepted:true});
  };
  f.registration.waiting=null;f.sw.controller=f.waiting;
  f.sw.emit('message',{source:f.waiting,data:{type:'COMMIT_UPDATE',version:NEXT,transaction:'test-transaction'}});
  f.sw.emit('controllerchange');
  await until(()=>!f.locked());assert.equal(f.reloads(),0);dropReplies=false;
  await f.client.check({force:true});await until(()=>f.reloads()===1);
  assert.ok(queries>=2);
});
