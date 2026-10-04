#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import {readFileSync, realpathSync, statSync} from 'node:fs';
import {dirname, isAbsolute, join, relative, resolve, sep, win32} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const statusFile = 'docs/PROJECT-STATUS.md';

function git(root, args, optional = false) {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, GIT_OPTIONAL_LOCKS: '0'},
    }).trimEnd();
  } catch (error) {
    if (optional) return '';
    throw new Error('git ' + args.join(' ') + ' 失败：' +
      (error.stderr?.toString().trim() || error.message));
  }
}

function isWithin(root, target) {
  const tail = relative(root, target);
  return tail !== '..' && !tail.startsWith('..' + sep) && !isAbsolute(tail);
}

function checkDocument(root, value, label, errors) {
  if (typeof value !== 'string' || !value.trim()) return;
  if (isAbsolute(value) || win32.isAbsolute(value) || value.includes('\\') ||
      value.split('/').includes('..')) {
    errors.push(label + ' 必须是仓库内相对路径：' + value);
    return;
  }
  const absolute = resolve(root, value);
  try {
    if (!isWithin(root, absolute) || !isWithin(root, realpathSync(absolute))) {
      errors.push(label + ' 指向仓库外部：' + value);
    } else if (!statSync(absolute).isFile()) {
      errors.push(label + ' 不是文件：' + value);
    }
  } catch {
    errors.push(label + ' 文件不存在或无法读取：' + value);
  }
}

function requireString(object, key, prefix, errors) {
  if (typeof object?.[key] !== 'string' || !object[key].trim()) {
    errors.push(prefix + '.' + key + ' 必须是非空字符串');
  }
}

function readStatus(root, errors) {
  try {
    const path = join(root, statusFile);
    if (!isWithin(root, realpathSync(path))) {
      errors.push(statusFile + ' 不得指向仓库外部');
      return {};
    }
    const content = readFileSync(path, 'utf8');
    const block = content.match(/<!--\s*project-brief\s*([\s\S]*?)\s*-->/);
    if (!block) throw new Error('缺少 project-brief JSON 元数据块');
    const data = JSON.parse(block[1]);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('project-brief 必须是 JSON 对象');
    }
    return data;
  } catch (error) {
    errors.push(statusFile + ' 缺失、无法读取或损坏：' + error.message);
    return {};
  }
}

/** Read local files and Git only; never fetch, write, checkout, or start a server. */
export function inspectHandoff(repositoryRoot = scriptRoot) {
  const errors = [];
  const warnings = [];
  let root;
  try { root = realpathSync(repositoryRoot); } catch {
    return {root: resolve(repositoryRoot), data: {}, actual: {}, errors: ['项目目录不存在'], warnings};
  }
  const data = readStatus(root, errors);
  if (data.statusVersion !== 1) errors.push('statusVersion 必须为受支持的版本 1');
  requireString(data, 'asOf', 'project-brief', errors);
  for (const key of ['branch', 'head']) requireString(data.baseline, key, 'baseline', errors);
  for (const key of ['title', 'scope', 'nextAction']) requireString(data.activeTask, key, 'activeTask', errors);
  if (!Array.isArray(data.activeTask?.blockedBy) ||
      data.activeTask.blockedBy.some(value => typeof value !== 'string' || !value.trim())) {
    errors.push('activeTask.blockedBy 必须是字符串数组，无阻塞时使用 []');
  }
  for (const key of ['taskId', 'taskFile', 'checkpoint', 'worktree', 'branch',
    'phase', 'stopReason', 'validation', 'scopeBoundary']) {
    requireString(data.handoff, key, 'handoff', errors);
  }
  const handoff = data.handoff || {};
  checkDocument(root, handoff.taskFile, 'handoff.taskFile', errors);
  checkDocument(root, handoff.checkpoint, 'handoff.checkpoint', errors);
  if (typeof handoff.worktree === 'string' && handoff.worktree.trim()) {
    try {
      if (!isAbsolute(handoff.worktree) || realpathSync(handoff.worktree) !== root) {
        errors.push('handoff.worktree 与本脚本所在项目目录不一致：' + handoff.worktree);
      }
    } catch { errors.push('handoff.worktree 不存在或无法解析：' + handoff.worktree); }
  }

  const actual = {};
  try {
    const gitRoot = realpathSync(git(root, ['rev-parse', '--show-toplevel']));
    if (gitRoot !== root) errors.push('脚本目录不是该 Git 工作树根目录：' + gitRoot);
    actual.branch = git(root, ['branch', '--show-current']) || '(detached HEAD)';
    actual.head = git(root, ['rev-parse', 'HEAD']);
    actual.originMain = git(root, ['rev-parse', '--verify', 'refs/remotes/origin/main'], true);
    actual.releaseTag = git(root, ['describe', '--tags', '--abbrev=0'], true);
    actual.status = git(root, ['status', '--short']);
    actual.worktrees = git(root, ['worktree', 'list']);
    actual.conflicts = git(root, ['diff', '--name-only', '--diff-filter=U', '-z'])
      .split('\0').filter(Boolean);
    if (actual.conflicts.length) {
      errors.push('存在未解决的 Git 冲突：' + actual.conflicts.join('、'));
    }
    if (handoff.branch && handoff.branch !== actual.branch) {
      errors.push('handoff.branch=' + handoff.branch + '，实际分支=' + actual.branch);
    }
    const baselineHead = data.baseline?.head;
    if (typeof baselineHead === 'string' && baselineHead.trim()) {
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(baselineHead)) {
        errors.push('baseline.head 必须是完整 Git 提交哈希');
      } else if (baselineHead.toLowerCase() !== actual.head.toLowerCase()) {
        // A committed status file cannot contain its own resulting commit hash.
        try {
          git(root, ['merge-base', '--is-ancestor', baselineHead, actual.head]);
          warnings.push('基线后新增提交，重新核验本轮影响：' + baselineHead + ' → ' + actual.head);
        } catch {
          errors.push('baseline.head 不是实际 HEAD 的祖先，或本地缺少该提交：' + baselineHead);
        }
      }
    }
    for (const key of ['originMain', 'releaseTag']) {
      if (!data.baseline?.[key] || !actual[key]) {
        warnings.push(key + ' 记录或本地信息不可用，需另行核验');
      } else if (data.baseline[key] !== actual[key]) {
        warnings.push('baseline.' + key + '=' + data.baseline[key] + '，本地=' + actual[key]);
      }
    }
  } catch (error) { errors.push(error.message); }
  return {root, data, actual, errors, warnings};
}

function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

function display(value) {
  return typeof value === 'string' && value.trim() ? value : '未记录';
}

export function formatHandoff({root, data, actual, errors, warnings}) {
  const task = data.activeTask || {};
  const handoff = data.handoff || {};
  const lines = [
    'RALLY 新对话接续说明（本地只读快照）',
    '请接续以下任务，先核验文件和 Git，再按下一步执行。',
    '任务：' + display(handoff.taskId) + '｜' + display(task.title),
    '范围：' + display(task.scope),
    '实际项目目录：' + root,
    '实际分支：' + display(actual.branch),
    '实际 HEAD：' + display(actual.head),
    '已核验基线：' + display(data.baseline?.head),
    '基线来源分支（历史记录）：' + display(data.baseline?.branch),
    'origin/main（本地缓存）：' + (actual.originMain || '不可用'),
    '最新可达标签（本地）：' + (actual.releaseTag || '不可用'),
    '本命令未实时核验远端、服务、浏览器缓存或线上部署；需按任务另行核验。',
    '',
    '一行启动指令：',
    'cd ' + shellQuote(root) + ' && npm run project:brief && npm run project:handoff -- --check',
    '最小读取入口：' + statusFile + ' → ' + display(handoff.taskFile) + ' → ' + display(handoff.checkpoint),
    '状态记录日期：' + display(data.asOf),
    '阶段：' + display(handoff.phase),
    '停在此处的原因：' + display(handoff.stopReason),
    '历史验证记录（本次没有重跑，不代表当前通过）：' + display(handoff.validation),
    '下一步：' + display(task.nextAction),
    '授权边界：' + display(handoff.scopeBoundary),
  ];
  const blockedBy = Array.isArray(task.blockedBy) ? task.blockedBy : [];
  if (blockedBy.length) {
    for (const item of blockedBy) lines.push('未完成／阻塞项：' + display(item));
  } else lines.push('未完成／阻塞项：' + (Array.isArray(task.blockedBy) ? '未记录阻塞；不代表任务完成' : '信息缺失'));
  lines.push('', '交接一致性：');
  if (!errors.length) lines.push('检查通过：必要信息与本地目录、分支、提交继承关系一致。此结果不是功能质量验收。');
  else {
    for (const error of errors) lines.push('错误：' + error);
    lines.push('交接信息不完整或不一致：先修正以上问题；不要据此自动开始修改。');
  }
  for (const warning of warnings) lines.push('警告：' + warning);
  if (actual.status) {
    lines.push('警告：存在未提交或未跟踪文件，新 clone 不包含它们。必须接续此目录并保留已有改动；这份交接文本不是备份。');
  } else {
    lines.push('此交接文本不是备份；被忽略的本地资产不在 git status 中，跨目录／设备接续须另行确认文件完整。');
  }
  lines.push('', 'git status --short：', actual.status || '(无改动，或 Git 状态不可用；以以上错误为准)',
    '', 'git worktree list：', actual.worktrees || '(不可用)');
  return lines.join('\n') + '\n';
}

export function runCli(args = process.argv.slice(2), repositoryRoot = scriptRoot) {
  if (args.some(arg => arg !== '--check') || args.length > 1) {
    process.stderr.write('用法：node scripts/project-handoff.js [--check]\n');
    return 2;
  }
  const report = inspectHandoff(repositoryRoot);
  process.stdout.write(formatHandoff(report));
  return args.includes('--check') && report.errors.length ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = runCli();
}
