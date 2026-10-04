import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectHandoff, formatHandoff} from '../scripts/project-handoff.js';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rally-handoff-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Handoff Test');
  git('config', 'user.email', 'handoff@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', '/dev/null');
  mkdirSync(join(root, 'docs'));
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(join(root, 'docs/TASK.md'), '任务验收条件');
  writeFileSync(join(root, 'docs/CHECKPOINT.md'), '历史证据');
  writeFileSync(join(root, 'tracked.txt'), 'baseline\n');
  copyFileSync(join(sourceRoot, 'scripts/project-handoff.js'), join(root, 'scripts/project-handoff.js'));
  git('add', '.');
  git('commit', '-m', 'fixture baseline');
  const head = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', head);
  git('tag', 'v0.0.1');
  const data = {
    statusVersion: 1, asOf: '2026-10-02',
    baseline: {branch: 'main', head, originMain: head, releaseTag: 'v0.0.1'},
    activeTask: {title: 'P1-1 运动质量', scope: '修复实际右臂折叠', nextAction: '先复现失败帧', blockedBy: ['整体质量未通过']},
    handoff: {taskId: 'P1-1', taskFile: 'docs/TASK.md', checkpoint: 'docs/CHECKPOINT.md',
      worktree: root, branch: 'main', phase: '进行中', stopReason: '切换对话窗口',
      validation: '历史测试 718/719，未重跑', scopeBoundary: '仅本地候选；不自动部署'},
  };
  const save = () => writeFileSync(join(root, 'docs/PROJECT-STATUS.md'),
    '# 当前状态\n<!-- project-brief\n' + JSON.stringify(data, null, 2) + '\n-->\n');
  const cli = (...args) => spawnSync(process.execPath, [join(root, 'scripts/project-handoff.js'), ...args],
    {cwd: tmpdir(), encoding: 'utf8'});
  save();
  return {root, git, head, data, save, cli};
}

test('handoff gives the next window the actual worktree, unfinished work and honest local-only scope without changing files', t => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'tracked.txt'), 'unfinished change\n');
  writeFileSync(join(f.root, 'new-asset.txt'), 'untracked work\n');
  const indexBefore = readFileSync(join(f.root, '.git/index'));
  const statusBefore = readFileSync(join(f.root, 'docs/PROJECT-STATUS.md'));
  const result = f.cli('--check');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.ok(result.stdout.includes('实际项目目录：' + f.root));
  assert.ok(result.stdout.includes('实际 HEAD：' + f.head));
  assert.ok(result.stdout.includes('origin/main（本地缓存）：' + f.head));
  assert.match(result.stdout, /新 clone 不包含它们/);
  assert.match(result.stdout, /不是备份/);
  assert.match(result.stdout, /未实时核验远端、服务、浏览器缓存或线上部署/);
  assert.match(result.stdout, /历史验证记录（本次没有重跑，不代表当前通过）/);
  assert.match(result.stdout, /下一步：先复现失败帧/);
  assert.match(result.stdout, /授权边界：仅本地候选；不自动部署/);
  assert.ok(result.stdout.includes('docs/PROJECT-STATUS.md → docs/TASK.md → docs/CHECKPOINT.md'));
  for (const text of ['git status --short：', 'tracked.txt', 'git worktree list：']) {
    assert.ok(result.stdout.includes(text));
  }
  assert.deepEqual(readFileSync(join(f.root, '.git/index')), indexBefore);
  assert.deepEqual(readFileSync(join(f.root, 'docs/PROJECT-STATUS.md')), statusBefore);
});

test('missing, malformed and structurally incomplete status cannot pass --check', async t => {
  const cases = [
    ['missing', f => rmSync(join(f.root, 'docs/PROJECT-STATUS.md'))],
    ['missing metadata', f => writeFileSync(join(f.root, 'docs/PROJECT-STATUS.md'), '# No metadata')],
    ['broken JSON', f => writeFileSync(join(f.root, 'docs/PROJECT-STATUS.md'), '<!-- project-brief {broken} -->')],
    ['wrong JSON type', f => writeFileSync(join(f.root, 'docs/PROJECT-STATUS.md'), '<!-- project-brief [] -->')],
    ['missing next action', f => {delete f.data.activeTask.nextAction; f.save();}],
    ['missing scope boundary', f => {delete f.data.handoff.scopeBoundary; f.save();}],
    ['wrong blockedBy type', f => {f.data.activeTask.blockedBy = 'unknown'; f.save();}],
  ];
  for (const [name, mutate] of cases) await t.test(name, t => {
    const f = fixture(t);
    mutate(f);
    const result = f.cli('--check');
    assert.equal(result.status, 1);
    assert.match(result.stdout, /交接信息不完整或不一致/);
    assert.doesNotMatch(result.stdout, /检查通过：/);
    const printable = f.cli();
    assert.equal(printable.status, 0);
    assert.match(printable.stdout, /错误：/);
  });
});

test('branch, missing HEAD and wrong worktree are rejected instead of continuing from an unrelated task', async t => {
  const cases = [
    ['actual branch changed', f => f.git('switch', '-c', 'other-task'), /实际分支=other-task/],
    ['handoff branch stale', f => {f.data.handoff.branch = 'old-task'; f.save();}, /handoff.branch=old-task/],
    ['missing baseline commit', f => {f.data.baseline.head = '1'.repeat(40); f.save();}, /不是实际 HEAD 的祖先/],
    ['different directory', f => {f.data.handoff.worktree = tmpdir(); f.save();}, /项目目录不一致/],
  ];
  for (const [name, mutate, expected] of cases) await t.test(name, t => {
    const f = fixture(t);
    mutate(f);
    const result = f.cli('--check');
    assert.equal(result.status, 1);
    assert.match(result.stdout, expected);
  });
});

test('a committed status document may retain its verified ancestor without a self-referencing HEAD loop', t => {
  const f = fixture(t);
  f.git('add', 'docs/PROJECT-STATUS.md');
  f.git('commit', '-m', 'record handoff');
  const report = inspectHandoff(f.root);
  assert.deepEqual(report.errors, []);
  assert.match(formatHandoff(report), /基线后新增提交，重新核验本轮影响/);
  assert.equal(f.cli('--check').status, 0);
});

test('a new task branch can retain main as its verified source after updating handoff', t => {
  const f = fixture(t);
  f.git('switch', '-c', 'fix/P1-1A-elbow');
  f.data.handoff.branch = 'fix/P1-1A-elbow';
  f.save();
  const result = f.cli('--check');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /实际分支：fix\/P1-1A-elbow/);
  assert.match(result.stdout, /基线来源分支（历史记录）：main/);
});

test('a baseline on a divergent branch is rejected even when its commit exists locally', t => {
  const f = fixture(t);
  f.git('switch', '-c', 'divergent');
  writeFileSync(join(f.root, 'tracked.txt'), 'divergent\n');
  f.git('commit', '-am', 'divergent work');
  f.data.baseline.head = f.git('rev-parse', 'HEAD');
  f.git('switch', 'main');
  f.save();
  assert.equal(f.cli('--check').status, 1);
  assert.match(formatHandoff(inspectHandoff(f.root)), /不是实际 HEAD 的祖先/);
});

test('missing task documents, absolute paths and symlinks escaping the repository cannot pass', async t => {
  const cases = [
    ['missing task', f => {f.data.handoff.taskFile = 'docs/missing.md';}],
    ['missing checkpoint', f => {f.data.handoff.checkpoint = 'docs/missing.md';}],
    ['absolute path', f => {f.data.handoff.taskFile = join(f.root, 'docs/TASK.md');}],
    ['parent escape', f => {f.data.handoff.checkpoint = '../outside.md';}],
    ['symlink escape', f => {symlinkSync(join(sourceRoot, 'package.json'), join(f.root, 'docs/outside.md')); f.data.handoff.taskFile = 'docs/outside.md';}],
  ];
  for (const [name, mutate] of cases) await t.test(name, t => {
    const f = fixture(t);
    mutate(f);
    f.save();
    assert.equal(f.cli('--check').status, 1);
  });
});

test('equivalent symlink worktree paths resolve to the same repository', t => {
  const f = fixture(t);
  const link = join(f.root, 'same-worktree');
  symlinkSync(f.root, link);
  f.data.handoff.worktree = link;
  f.save();
  assert.deepEqual(inspectHandoff(link).errors, []);
});

test('unresolved merge conflicts fail the handoff even when dirty files normally pass', t => {
  const f = fixture(t);
  f.git('switch', '-c', 'conflicting');
  writeFileSync(join(f.root, 'tracked.txt'), 'their change\n');
  f.git('commit', '-am', 'theirs');
  f.git('switch', 'main');
  writeFileSync(join(f.root, 'tracked.txt'), 'our change\n');
  f.git('commit', '-am', 'ours');
  assert.throws(() => f.git('merge', 'conflicting'));
  const result = f.cli('--check');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /存在未解决的 Git 冲突：tracked.txt/);
});

test('unavailable or changed cached origin and tags are warnings, not false claims of remote verification', t => {
  const f = fixture(t);
  f.git('update-ref', '-d', 'refs/remotes/origin/main');
  f.git('tag', '-d', 'v0.0.1');
  const report = inspectHandoff(f.root);
  assert.deepEqual(report.errors, []);
  assert.equal(report.warnings.length, 2);
  assert.equal(f.cli('--check').status, 0);
  f.data.baseline.releaseTag = 'v999.0.0';
  f.git('tag', 'v0.0.2');
  f.save();
  assert.match(formatHandoff(inspectHandoff(f.root)), /baseline.releaseTag=v999.0.0，本地=v0.0.2/);
});
