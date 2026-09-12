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
