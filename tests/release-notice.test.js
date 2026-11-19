import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createPwaBuild } from '../scripts/build-pwa.js';
import pkg from '../package.json' with {type:'json'};

function config(build) {
  const context = {};
  vm.runInNewContext(build.assets.get(build.basePath + 'runtime-config.js').toString(), context);
  return context.RALLY_CONFIG;
}

test('player-facing release notice is embedded in root and Pages builds', async () => {
  const root = await createPwaBuild({basePath: '/'});
  const pages = await createPwaBuild({basePath: '/rally-badminton/'});
  assert.equal(JSON.stringify(config(root).releaseHistory),JSON.stringify(config(pages).releaseHistory));
  assert.equal(config(root).releaseNotice.id,pkg.version);
  assert.equal(config(root).releaseHistory[0].version,pkg.version);
  assert.ok(config(root).releaseHistory.length >= 3);
  assert.ok(config(root).releaseNotice.items.length >= 2);
});
