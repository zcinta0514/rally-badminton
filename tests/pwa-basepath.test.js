import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createPwaBuild, exportPwaBuild } from '../scripts/build-pwa.js';

test('project build scopes every resource and hashes the final manifest and runtime bytes', async () => {
  const basePath='/rally-badminton/';
  const build=await createPwaBuild({basePath,demoMode:true});
  assert.equal(build.basePath,basePath);
  assert.ok(build.assets.has(basePath));
  assert.ok([...build.assets.keys()].every(url=>url.startsWith(basePath)));
  const manifest=JSON.parse(build.assets.get(basePath+'manifest.webmanifest'));
  assert.equal(manifest.id,basePath);assert.equal(manifest.scope,basePath);
  assert.equal(manifest.start_url,basePath+'?source=homescreen');
  assert.ok(manifest.icons.every(icon=>icon.src.startsWith(basePath+'icons/')));
  const context=vm.createContext({});vm.runInContext(build.assets.get(basePath+'runtime-config.js').toString(),context);
  assert.equal(context.RALLY_CONFIG.demoMode,true);assert.equal(context.RALLY_CONFIG.wsUrl,'');
  assert.equal(context.RALLY_CONFIG.peerMode,true);
  assert.ok(build.assets.has(basePath+'vendor/peerjs.min.js'));
  for(const asset of build.inventory)assert.equal(asset.hash,createHash('sha256').update(build.assets.get(asset.url)).digest('hex'));
  const html=build.assets.get(basePath).toString();
  for(const match of html.matchAll(/(?:href|src)="([^"#]+)"/g)){
    const url=new URL(match[1],'https://player.example'+basePath);
    assert.ok(build.assets.has(url.pathname),`entry resource stays inside published project: ${url.pathname}`);
  }
  const importMap=JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/s)[1]);
  assert.ok(build.assets.has(new URL(importMap.imports.three,'https://player.example'+basePath).pathname));
});
test('unsafe or ambiguous base paths and demo endpoints are rejected before export', async () => {
  for(const basePath of ['',null,{},'game/','/game','//game/','/../','/a/../b/','/%2e%2e/','/game?x/','/game#x/','/a\\b/','/a b/'])
    await assert.rejects(createPwaBuild({basePath}),/base path/i);
  await assert.rejects(createPwaBuild({demoMode:true,wsUrl:'wss://public.example/ws'}),/demo/i);
  for(const basePath of ['/','/rally-badminton/','/games/rally_1.0/'])assert.equal((await createPwaBuild({basePath})).basePath,basePath);
});
test('static export strips project prefix from disk paths and preserves licenses', async t => {
  const outputDir=await mkdtemp(path.join(tmpdir(),'rally-pages-'));
  t.after(()=>rm(outputDir,{recursive:true,force:true}));
  await writeFile(path.join(outputDir,'stale-feedback.js'),'must not survive');
  const build=await exportPwaBuild({basePath:'/rally-badminton/',demoMode:true,outputDir});
  assert.deepEqual(await readFile(path.join(outputDir,'index.html')),build.assets.get(build.basePath));
  assert.deepEqual(await readFile(path.join(outputDir,'src','entry.js')),build.assets.get(build.basePath+'src/entry.js'));
  assert.deepEqual(await readFile(path.join(outputDir,'sw.js')),build.worker);
  assert.match(await readFile(path.join(outputDir,'vendor','three.LICENSE.txt'),'utf8'),/MIT License/);
  assert.match(await readFile(path.join(outputDir,'vendor','peerjs.LICENSE.txt'),'utf8'),/MIT/);
  assert.match(await readFile(path.join(outputDir,'vendor','peerjs-dependencies.LICENSE.txt'),'utf8'),/webrtc-adapter/);
  assert.equal((await readdir(outputDir)).includes('rally-badminton'),false);
  assert.equal((await readdir(outputDir)).includes('server'),false);
  assert.equal((await readdir(outputDir)).includes('data'),false);
  assert.equal((await readdir(outputDir)).includes('stale-feedback.js'),false);
});
