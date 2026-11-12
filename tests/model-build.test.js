import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createPwaBuild, exportPwaBuild } from '../scripts/build-pwa.js';
import { createServer } from '../server/index.js';
import { modelBuildRoot, modelGlb } from './helpers/model-fixture.js';

const addons = ['loaders/GLTFLoader.js','utils/BufferGeometryUtils.js','utils/SkeletonUtils.js'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('both deployment paths package a generated GLB and the closed, same-version Three addon graph', async t => {
  const root = await modelBuildRoot(t);
  for (const basePath of ['/','/rally-badminton/']) {
    const build = await createPwaBuild({root,basePath});
    const modelURL = basePath+'src/models/fixture.glb';
    assert.ok(build.assets.has(modelURL),'GLB must be available offline');
    assert.deepEqual(build.assets.get(modelURL),modelGlb());
    assert.match(build.assets.get(basePath+'src/models/LICENSE.txt').toString(),/CC0/);
    const html = build.assets.get(basePath).toString();
    const imports = JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]).imports;
    assert.equal(imports['three/addons/'],'./vendor/three-addons/');
    const resolver = (specifier, importer) => {
      const mapped = imports[specifier] || (specifier.startsWith('three/addons/') && imports['three/addons/'] + specifier.slice('three/addons/'.length));
      return new URL(mapped || specifier,mapped?'https://game.example'+basePath:importer).pathname;
    };
    for (const addon of addons) {
      const url = resolver('three/addons/'+addon);
      const bytes = build.assets.get(url);
      assert.ok(bytes,addon+' is included');
      assert.deepEqual(bytes,await readFile(path.join(root,'node_modules/three/examples/jsm',addon)));
      for (const match of bytes.toString().matchAll(/^import\s+[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/gm)) {
        const dependency = resolver(match[1],'https://game.example'+url);
        assert.ok(build.assets.has(dependency),url+' resolves '+dependency);
      }
      assert.equal(build.inventory.find(item=>item.url===url).hash,sha(bytes));
    }
    assert.equal([...build.assets.keys()].filter(url=>url.includes('/vendor/three-addons/')).length,3,'do not package all examples');
    assert.equal(build.inventory.find(item=>item.url===modelURL).hash,sha(modelGlb()));
    assert.ok(build.assets.has(basePath+'src/analytics-frame.js'));
    const exported = await exportPwaBuild({root,basePath,outputDir:path.join(root,'exported')});
    assert.deepEqual(await readFile(path.join(root,'exported/src/models/fixture.glb')),exported.assets.get(modelURL));
  }
});

test('changing model or transitive addon bytes changes the complete PWA snapshot', async t => {
  const root = await modelBuildRoot(t);
  const before = await createPwaBuild({root});
  await writeFile(path.join(root,'src/models/fixture.glb'),modelGlb('changed'));
  const modelChanged = await createPwaBuild({root});
  assert.notEqual(modelChanged.version,before.version);
  await appendFile(path.join(root,'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'),'\n// fixture change\n');
  const addonChanged = await createPwaBuild({root});
  assert.notEqual(addonChanged.version,modelChanged.version);
  assert.equal((await createPwaBuild({root})).version,addonChanged.version);
});

test('Node serves a generated GLB with the proper MIME type and complete immutable bytes', async t => {
  const assetRoot = await modelBuildRoot(t);
  const app = createServer({assetRoot}); await app.listen(); t.after(()=>app.close());
  const url = app.url+'/src/models/fixture.glb';
  const response = await fetch(url);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('content-type'),'model/gltf-binary');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),modelGlb());
  await writeFile(path.join(assetRoot,'src/models/fixture.glb'),modelGlb('newer source'));
  assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()),modelGlb(),'running server keeps its original snapshot');
  const head = await fetch(url,{method:'HEAD'});
  assert.equal(Number(head.headers.get('content-length')),modelGlb().length);
  assert.equal((await head.arrayBuffer()).byteLength,0);
});

test('generated GLB and Three addons are returned from the installed worker while offline on both paths', async t => {
  const root = await modelBuildRoot(t);
  for (const basePath of ['/','/rally-badminton/']) {
    const build = await createPwaBuild({root,basePath});
    const stores = new Map(), listeners = new Map(); let offline = false;
    const key = request => new URL(typeof request==='string'?request:request.url,'https://game.example').pathname;
    const context = vm.createContext({URL,Response,Uint8Array,crypto:webcrypto,console,
      Request:class extends Request { constructor(url,options) { super(new URL(url,'https://game.example'),options); } },
      caches:{ keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),open:async name=>{
        if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);
        return {put:async(url,response)=>store.set(key(url),response.clone()),match:async url=>store.get(key(url))?.clone()};
      }},
      fetch:async request=>{if(offline)throw new Error('offline');const bytes=build.assets.get(key(request));return new Response(bytes,{status:bytes?200:404});},
      self:{location:{origin:'https://game.example'},addEventListener:(type,handler)=>listeners.set(type,handler)}
    });
    vm.runInContext(build.worker.toString(),context);
    const event = async(type,extras={})=>{let pending;listeners.get(type)({waitUntil:value=>pending=value,respondWith:value=>pending=value,...extras});return pending;};
    await event('install'); offline=true;
    for (const resource of ['src/models/fixture.glb',...addons.map(file=>'vendor/three-addons/'+file)]) {
      const url=basePath+resource;
      const response=await event('fetch',{request:{method:'GET',url:'https://game.example'+url}});
      assert.ok(response,'worker must own '+url);
      assert.equal(response.status,200,url);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),build.assets.get(url));
    }
  }
});
