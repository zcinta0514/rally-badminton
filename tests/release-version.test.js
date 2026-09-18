import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the displayed product version matches package and lockfile versions', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lockfile = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(packageJson.version, /^\d+\.\d+\.\d+$/);
  assert.equal(lockfile.version, packageJson.version);
  assert.equal(lockfile.packages[''].version, packageJson.version);
  assert.match(index, new RegExp('正式版 ' + packageJson.version.replaceAll('.', '\\.')));
});
