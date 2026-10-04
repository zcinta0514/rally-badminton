import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('project brief reports repository and current-status sections without opening a server', () => {
  const result = spawnSync(process.execPath, ['scripts/project-brief.js'], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RALLY 项目摘要/);
  assert.match(result.stdout, /Git 基线/);
  assert.match(result.stdout, /工作区/);
  assert.match(result.stdout, /当前项目状态/);
  assert.match(result.stdout, /当前任务：/);
  assert.match(result.stdout, /一致性检查/);
});
