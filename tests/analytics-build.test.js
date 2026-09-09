import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createPwaBuild } from '../scripts/build-pwa.js';

const publicConfig = { id: 'TestOnly123456789', ck: 'TestOnly987654321' };
function configOf(build) {
  const context = vm.createContext({});
  vm.runInContext(build.assets.get(build.basePath + 'runtime-config.js').toString(), context);
  return JSON.parse(JSON.stringify(context.RALLY_CONFIG));
}

test('both deployment paths include only public analytics identifiers and local bridge assets', async () => {
  for (const basePath of ['/', '/rally-badminton/']) {
    const build = await createPwaBuild({ basePath, analytics: publicConfig });
    assert.deepEqual(configOf(build).analytics, publicConfig);
    assert.ok(build.assets.has(basePath + 'src/analytics-frame.html'));
    assert.ok(build.assets.has(basePath + 'src/analytics-frame.js'));
    assert.ok(build.inventory.every(asset => asset.url.startsWith(basePath)));
    assert.ok(!build.inventory.some(asset => asset.url.includes('51.la')));
  }
});

test('disabled analytics has an empty ID and changing its destination changes the PWA snapshot', async () => {
  const disabled = await createPwaBuild({ analytics: { id: '', ck: '' } });
  const enabled = await createPwaBuild({ analytics: publicConfig });
  assert.deepEqual(configOf(disabled).analytics, { id: '', ck: '' });
  assert.notEqual(enabled.version, disabled.version);
});

test('malformed analytics configuration and accidentally supplied private keys fail the build', async () => {
  for (const analytics of [null, [], 'secret', { id: 'bad', ck: 'bad' }, { ...publicConfig, apiKey: 'private' }, { id: 1, ck: publicConfig.ck }, { id: '', ck: publicConfig.ck }, { id: publicConfig.id, ck: '' }]) {
    await assert.rejects(createPwaBuild({ analytics }), /analytics/i);
  }
});
