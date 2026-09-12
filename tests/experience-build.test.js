import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createPwaBuild } from '../scripts/build-pwa.js';

function config(build) {
  const context={};vm.runInNewContext(build.assets.get(build.basePath+'runtime-config.js').toString(),context);
  return context.RALLY_CONFIG;
}

test('actual page build ID equals worker version and all final bytes pass inventory hashes',async()=>{
  const build=await createPwaBuild();
  assert.equal(config(build).buildId,build.version);
  for(const {url,hash} of build.inventory)assert.equal(createHash('sha256').update(build.assets.get(url)).digest('hex'),hash);
});

test('feedback endpoint is explicit public configuration and affects build identity',async()=>{
  const plain=await createPwaBuild(), enabled=await createPwaBuild({feedbackURL:'https://feedback.example/api/feedback'});
  assert.equal(config(plain).feedbackURL,'');
  assert.equal(config(enabled).feedbackURL,'https://feedback.example/api/feedback');
  assert.notEqual(plain.version,enabled.version);
});

test('local feedback endpoint and subpath build keep correct scope',async()=>{
  const build=await createPwaBuild({feedbackURL:'/api/feedback',basePath:'/rally-badminton/'});
  assert.equal(config(build).feedbackURL,'/api/feedback');
  assert.equal(config(build).buildId,build.version);
  for(const {url} of build.inventory)assert.ok(url.startsWith('/rally-badminton/'));
});

test('feedback build configuration rejects insecure remote URLs and embedded secrets',async()=>{
  for(const feedbackURL of ['http://feedback.example/api/feedback','https://user:secret@feedback.example/api/feedback','//feedback.example','https://feedback.example/api?token=secret'])
    await assert.rejects(createPwaBuild({feedbackURL}),/feedback/i);
});
