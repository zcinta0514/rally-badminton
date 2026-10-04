#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import {readFileSync, existsSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const statusPath = join(root, 'docs', 'PROJECT-STATUS.md');

function git(args, {allowFailure = false} = {}) {
  try {
    return execFileSync('git', args, {cwd: root, encoding: 'utf8',
      env: {...process.env, GIT_OPTIONAL_LOCKS: '0'}}).trimEnd();
  } catch (error) {
    if (allowFailure) return '';
    const detail = error?.stderr?.toString().trim() || error.message;
    throw new Error('git ' + args.join(' ') + ' 失败：' + detail);
  }
}

function readPackageVersion() {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version || '未知';
  } catch {
    return '未知';
  }
}

function shortHash(value) {
  return value && value.length > 12 ? value.slice(0, 12) + '…' : value || '未知';
}

function parseWorktrees(text) {
  const records = [];
  let current = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) records.push(current);
      current = {path: line.slice('worktree '.length)};
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    } else if (current && line === 'detached') {
      current.branch = 'detached';
    }
  }
  if (current) records.push(current);
  return records;
}

function parseStatusDocument() {
  if (!existsSync(statusPath)) {
    return {data: null, warnings: ['缺少 ' + statusPath]};
  }
  const content = readFileSync(statusPath, 'utf8');
  const match = content.match(/<!--\s*project-brief\s*([\s\S]*?)\s*-->/);
  if (!match) {
    return {data: null, warnings: ['PROJECT-STATUS.md 缺少 project-brief JSON 元数据块']};
  }
  try {
    return {data: JSON.parse(match[1]), warnings: []};
  } catch (error) {
    return {data: null, warnings: ['PROJECT-STATUS.md 的 project-brief JSON 无法解析：' + error.message]};
  }
}

function addBaselineWarnings(warnings, expected, actual) {
  if (!expected) return;
  const checks = [
    ['originMain', expected.originMain, actual.originMain],
    ['releaseTag', expected.releaseTag, actual.releaseTag],
  ];
  for (const [label, recorded, current] of checks) {
    if (recorded && recorded !== current) {
      warnings.push('状态文件 ' + label + '=' + recorded + '，实际=' + current);
    }
  }
  if (expected.head && expected.head !== actual.head) {
    const ancestor = /^[a-f0-9]{40,64}$/i.test(expected.head) &&
      git(['merge-base', expected.head, actual.head], {allowFailure: true}) === expected.head;
    warnings.push(ancestor
      ? '已核验基线后有新提交；核对本轮影响，文档无需记录自身提交哈希'
      : '状态文件基线 head 不是当前 HEAD 的祖先，需重新核对');
  }
}

function printList(label, values) {
  if (!values?.length) {
    console.log('  ' + label + ': 无');
    return;
  }
  for (const value of values) console.log('  ' + label + ': ' + value);
}

const branch = git(['branch', '--show-current']) || 'detached';
const head = git(['rev-parse', 'HEAD']);
const originMain = git(['rev-parse', '--verify', 'refs/remotes/origin/main'], {allowFailure: true}) || '不可用';
const releaseTag = git(['describe', '--tags', '--abbrev=0'], {allowFailure: true}) || '无可达标签';
const porcelain = git(['status', '--short']);
const statusLines = porcelain ? porcelain.split('\n') : [];
const modified = statusLines.filter(line => !line.startsWith('??')).length;
const untracked = statusLines.filter(line => line.startsWith('??')).length;
const conflicted = statusLines.filter(line => /^(DD|AU|UD|UA|DU|AA|UU) /.test(line)).length;
const worktrees = parseWorktrees(git(['worktree', 'list', '--porcelain']));
const statusDoc = parseStatusDocument();
const statusData = statusDoc.data || {};
const actual = {branch, head, originMain, releaseTag};
const warnings = [...statusDoc.warnings];
addBaselineWarnings(warnings, statusData.baseline, actual);
if (statusData.handoff?.branch && statusData.handoff.branch !== branch) {
  warnings.push('交接分支=' + statusData.handoff.branch + '，实际分支=' + branch);
}

const packageVersion = readPackageVersion();
if (packageVersion !== releaseTag.replace(/^v/, '') && releaseTag !== '无可达标签') {
  warnings.push('package.json version=' + packageVersion + '，最新可达标签=' + releaseTag);
}
if (conflicted) warnings.push('存在 ' + conflicted + ' 个冲突文件，禁止直接开始新任务');

console.log('RALLY 项目摘要');
console.log('生成时间：' + new Date().toISOString());
console.log('项目目录：' + root);
console.log('');
console.log('Git 基线');
console.log('  分支：' + branch);
console.log('  HEAD：' + shortHash(head));
console.log('  origin/main（本地缓存）：' + shortHash(originMain));
console.log('  最新可达标签：' + releaseTag);
console.log('  package.json version：' + packageVersion);
console.log('  本命令未联网核验远端，也未检查预览或线上服务。');
console.log('');
console.log('工作区');
console.log('  已修改条目：' + modified);
console.log('  未跟踪条目（目录可能折叠）：' + untracked);
console.log('  冲突：' + conflicted);
for (const worktree of worktrees) {
  console.log('  worktree：' + worktree.path + ' | ' + (worktree.branch || '未知') + ' | ' + shortHash(worktree.head));
}
console.log('');
console.log('当前项目状态');
console.log('  状态文件：' + statusPath);
console.log('  状态日期：' + (statusData.asOf || '未记录'));
console.log('  当前任务：' + (statusData.activeTask?.title || '未记录'));
console.log('  下一步：' + (statusData.activeTask?.nextAction || '未记录'));
console.log('  正式运行时：' + (statusData.runtime?.formalAsset || '未记录'));
console.log('  发布状态：' + (statusData.runtime?.releaseState || '未记录'));
printList('阻塞项', statusData.activeTask?.blockedBy);
printList('下一步读取', statusData.readNext);
if (statusData.handoff) {
  console.log('  接续任务：' + (statusData.handoff.taskId || '未记录'));
  console.log('  任务卡：' + (statusData.handoff.taskFile || '未记录'));
  console.log('  协作流程：docs/WORKFLOW.md');
  console.log('  切窗检查：npm run project:handoff -- --check');
}
console.log('');
console.log('一致性检查');
if (!warnings.length) {
  console.log('  OK：状态文件基线与当前 Git 信息一致');
} else {
  for (const warning of warnings) console.log('  警告：' + warning);
}

if (statusData.links?.length) {
  console.log('');
  console.log('相关文档');
  for (const link of statusData.links) console.log('  ' + link);
}
