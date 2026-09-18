import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createPwaBuild } from '../scripts/build-pwa.js';
import { RELEASE_NOTICE } from '../src/release-notes.js';

function config(build) {
  const context = {};
  vm.runInNewContext(build.assets.get(build.basePath + 'runtime-config.js').toString(), context);
  return context.RALLY_CONFIG;
}

test('player-facing release notice is embedded in root and Pages builds', async () => {
  const root = await createPwaBuild({basePath: '/'});
  const pages = await createPwaBuild({basePath: '/rally-badminton/'});
  assert.equal(JSON.stringify(config(root).releaseNotice), JSON.stringify(RELEASE_NOTICE));
  assert.equal(JSON.stringify(config(pages).releaseNotice), JSON.stringify(RELEASE_NOTICE));
  assert.match(config(root).releaseNotice.id, /^2026-09-18-/);
  assert.ok(config(root).releaseNotice.items.length >= 2);
});
