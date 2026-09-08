import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPwaBuild } from '../scripts/build-pwa.js';
import { createServer } from '../server/index.js';

const names = ['hit-1', 'hit-2', 'smash-1', 'step-1', 'applause', 'cheer'];

test('recorded sound and license bytes are cached under root and project subpaths', async () => {
  for (const basePath of ['/', '/rally-badminton/']) {
    const build = await createPwaBuild({ basePath });
    let size = 0;
    for (const name of names) {
      const url = `${basePath}src/audio/${name}.wav`;
      assert.ok(build.assets.has(url), `missing offline audio ${url}`);
      const bytes = build.assets.get(url);
      assert.deepEqual(bytes, await readFile(new URL(`../src/audio/${name}.wav`, import.meta.url)));
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
      assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
      size += bytes.length;
      assert.ok(build.inventory.some(asset => asset.url === url));
    }
    assert.ok(size < 650000, `short audio pack stays small: ${size}`);
    assert.ok([...build.assets.keys()].every(url => !url.includes('squeak')), 'removed friction is not shipped or cached');
    const license = build.assets.get(`${basePath}src/audio/LICENSE.txt`);
    assert.ok(license, 'redistributed recordings include their provenance');
    assert.match(license.toString(), /CC0|Creative Commons Zero/i);
    assert.match(license.toString(), /bigsoundbank\.com/i);
    assert.ok([...build.assets.keys()].every(url => !/artifacts|audio-sources|\.env|data\//.test(url)));
  }
});

test('preview server serves real audio with WAV MIME and keeps raw source files private', async t => {
  const app = createServer(); await app.listen(); t.after(() => app.close());
  const response = await fetch(app.url + '/src/audio/hit-1.wav');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /audio\/(?:wav|wave|x-wav)/);
  assert.ok((await response.arrayBuffer()).byteLength > 1000);
  assert.equal((await fetch(app.url + '/src/audio/LICENSE.txt')).status, 200);
  assert.equal((await fetch(app.url + '/artifacts/audio-sources/0537.wav')).status, 404);
});
