import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createPwaBuild } from '../scripts/build-pwa.js';

// Only browser-owned storage/event primitives are simulated. Tests execute the
// generated production worker, its real digest validation and real Responses.
async function fixture({wsUrl='', basePath='/', demoMode=false, stores=new Map()} = {}) {
  const build = await createPwaBuild({wsUrl,basePath,demoMode});
  const listeners = new Map();
  let altered = '', offline = false, skipCalls = 0, claimCalls = 0;
  const key = value => new URL(typeof value === 'string' ? value : value.url, 'https://rally.example').pathname;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {async put(url, response) {store.set(key(url), response.clone());},async match(url) {return store.get(key(url))?.clone();}};
    }
  };
  const context = vm.createContext({
    caches, crypto:webcrypto, URL, Response, Uint8Array, console,
    Request: class extends Request {constructor(url, options) {super(new URL(url, 'https://rally.example'), options);}},
    fetch: async request => {if(offline)throw new Error('offline'); const body=build.assets.get(key(request));return new Response(key(request)===altered?'broken':body,{status:body?200:404});},
    self:{location:{origin:'https://rally.example'},clients:{claim(){claimCalls++;}},skipWaiting(){skipCalls++;},addEventListener(type, fn){listeners.set(type,fn);}}
  });
  vm.runInContext(build.worker.toString(), context);
  async function event(type, extras = {}) {
    let result;
    listeners.get(type)({waitUntil(promise){result=promise;},respondWith(promise){result=promise;},...extras});
    return await result;
  }
  return {build,stores,caches,event,setOffline(value){offline=value;},setAltered(value){altered=value;},calls:()=>({skipCalls,claimCalls})};
}

test('offline worker serves full local app, vendor and query navigation from its own consistent version', async () => {
  const f=await fixture(); await f.event('install'); await f.event('activate'); f.setOffline(true);
  for(const [asset, expected] of f.build.assets) {
    const response=await f.event('fetch',{request:{method:'GET',mode:asset==='/'?'navigate':'cors',url:'https://rally.example'+asset+(asset==='/'?'?room=ABCDE':'')}});
    assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected);
  }
  assert.equal(await f.event('fetch',{request:{method:'GET',url:'https://rally.example/health'}}),undefined);
  assert.equal(await f.event('fetch',{request:{method:'GET',url:'https://other.example/src/main.js'}}),undefined);
  assert.deepEqual(f.calls(),{skipCalls:0,claimCalls:0});
});
test('a corrupted resource rejects installation and preserves the previous complete version', async () => {
  const f=await fixture();await f.caches.open(f.build.cachePrefix+'previous');f.setAltered('/vendor/three.core.js');
  await assert.rejects(f.event('install'),/changed during download/);
  assert.equal(f.stores.has(f.build.cachePrefix+'previous'),true);
  assert.equal(f.stores.has(f.build.cachePrefix+f.build.version),false);
});
test('new installation and activation preserve old resources for in-flight navigations', async () => {
  const f=await fixture();await f.caches.open(f.build.cachePrefix+'previous');await f.caches.open('other-application');
  await f.event('install');
  assert.equal(f.stores.has(f.build.cachePrefix+'previous'),true);
  assert.deepEqual(f.calls(),{skipCalls:0,claimCalls:0});
  await f.event('activate');
  assert.equal(f.stores.has(f.build.cachePrefix+'previous'),true);
  assert.equal(f.stores.has('other-application'),true);
});
test('missing cache entries cannot be replaced by newer network code and status reports incomplete', async () => {
  const f=await fixture();await f.event('install');
  f.stores.get(f.build.cachePrefix+f.build.version).delete('/src/main.js');
  f.setAltered('/src/main.js');
  const response=await f.event('fetch',{request:{method:'GET',url:'https://rally.example/src/main.js'}});
  assert.equal(response.status,503);
  let status;await f.event('message',{data:{type:'CACHE_STATUS'},ports:[{postMessage(value){status=value;}}]});
  assert.equal(status.complete,false);
});
test('same-version reinstall can reuse its complete active cache even offline', async () => {
  const f=await fixture();await f.event('install');f.setOffline(true);await f.event('install');
  assert.equal(f.stores.get(f.build.cachePrefix+f.build.version).size,f.build.assets.size);
});
test('same-version failed reinstall preserves every previously cached entry', async () => {
  const f=await fixture();await f.event('install');
  const store=f.stores.get(f.build.cachePrefix+f.build.version);store.delete('/src/main.js');f.setOffline(true);
  await assert.rejects(f.event('install'),/offline/);
  assert.equal(f.stores.get(f.build.cachePrefix+f.build.version).size,f.build.assets.size-1);
});
test('repair recovers evicted resources only when network bytes match this exact version', async () => {
  const f=await fixture();await f.event('install');
  const store=f.stores.get(f.build.cachePrefix+f.build.version);store.delete('/src/main.js');
  let status;await f.event('message',{data:{type:'REPAIR_CACHE'},ports:[{postMessage(value){status=value;}}]});
  assert.equal(status.complete,true);assert.equal(store.size,f.build.assets.size);
  store.delete('/src/main.js');f.setAltered('/src/main.js');
  await f.event('message',{data:{type:'REPAIR_CACHE'},ports:[{postMessage(value){status=value;}}]});
  assert.equal(status.complete,false);assert.equal(store.size,f.build.assets.size-1);
});
test('build version is deterministic and binds runtime endpoint configuration', async () => {
  const a=await createPwaBuild(),b=await createPwaBuild(),c=await createPwaBuild({wsUrl:'wss://rally.example/ws'});
  assert.equal(a.version,b.version);assert.notEqual(a.version,c.version);
  assert.equal(a.inventory.length,a.assets.size);
  assert.ok(a.inventory.every(asset=>asset.hash.length===64));
});
test('old and new versions serve their own runtime bytes while new worker waits', async () => {
  const old=await fixture();await old.event('install');
  const next=await fixture({wsUrl:'wss://rally.example/ws',stores:old.stores});await next.event('install');
  assert.notEqual(old.build.version,next.build.version);
  old.setOffline(true);next.setOffline(true);
  const request={method:'GET',url:'https://rally.example/runtime-config.js'};
  assert.equal(await (await old.event('fetch',{request})).text(),old.build.assets.get('/runtime-config.js').toString());
  assert.equal(await (await next.event('fetch',{request})).text(),next.build.assets.get('/runtime-config.js').toString());
  assert.equal([...old.stores.keys()].filter(key=>/[-][a-f0-9]{16}$/.test(key)).length,2);assert.deepEqual(next.calls(),{skipCalls:0,claimCalls:0});
});
test('project worker serves offline query navigation and never deletes another project or root cache', async () => {
  const root=await fixture();await root.event('install');
  const first=await fixture({basePath:'/first/',demoMode:true,stores:root.stores});await first.event('install');
  const oldFirstKeys=new Set(first.stores.keys());
  const next=await fixture({basePath:'/first/',stores:first.stores});await next.event('install');
  const second=await fixture({basePath:'/second/',stores:first.stores});await second.event('install');
  const oldCount=next.stores.size;await next.event('activate');
  assert.equal(next.stores.size,oldCount,'activation retains old resources while late clients may still depend on them');
  assert.ok([...next.stores.keys()].some(key=>oldFirstKeys.has(key)),'the root app remains cached');
  for(const f of [root,next,second]){
    f.setOffline(true);
    const response=await f.event('fetch',{request:{method:'GET',mode:'navigate',url:'https://rally.example'+f.build.basePath+'?source=homescreen'}});
    assert.equal(response.status,200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),f.build.assets.get(f.build.basePath));
  }
  assert.equal(await next.event('fetch',{request:{method:'GET',mode:'navigate',url:'https://rally.example/'}}),undefined);
  assert.equal(await next.event('fetch',{request:{method:'GET',url:'https://rally.example/api/leaderboard'}}),undefined);
});
