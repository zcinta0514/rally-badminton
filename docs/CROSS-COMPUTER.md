# 在另一台电脑接着开发

仓库：`https://github.com/zcinta0514/rally-badminton`。

## 1. 继续最新正式代码与工作流

安装 Git、Node.js 22 或 24。工作流尚在独立分支时明确克隆该分支：

```sh
git clone --branch chore/workflow-portable https://github.com/zcinta0514/rally-badminton.git
cd rally-badminton
npm ci
npm run project:brief
npm run project:handoff -- --check
npm test
npm run build
npm start
```

本地默认入口为 `http://localhost:3000/`。服务在启动时固定资源，更新源码后重启，并核验浏览器资源与 Service Worker；本地启动与线上部署分别记录。

`docs/PROJECT-STATUS.md` → 当前任务卡 → 一个相关检查点，是新窗口的最小读取入口。人物制作还须遵循 `docs/DEVELOPMENT-PLAN.md`。工作流、任务和质量门槛均保存在仓库，不依赖某个聊天窗口的记忆。

## 2. 取回人物制作源和所有工作目录

Git clone 不含 ignored 的 `.blend`、原始数据与证据。完整内容保存在同仓库 `workspace-backup-20261109` 的备份 Release；这是资料快照，不是游戏版本。下载需要 GitHub CLI（`gh`），解压需要 `zstd`，恢复程序需要 Python 3.9+。macOS 可用 Homebrew 安装这些工具，Windows 可在 WSL 中恢复，Linux 可用系统包管理器安装。

```sh
gh auth login
gh release download workspace-backup-20261109 --repo zcinta0514/rally-badminton --dir ../rally-backup
python3 scripts/restore-project.py --source ../rally-backup --destination ../rally-restored
```

`--destination` 必须是尚不存在的目录，程序不会覆盖旧项目。每个工作目录恢复为独立 Git clone，绑定其历史分支与 HEAD，保留未提交修改和已删除文件；`origin` 指向同一个 GitHub 仓库。恢复工具先验证每个下载分块和所有源对象，再开始创建项目。

清单 `manifest.json` 的 `worktrees` 列出可选工作目录。只取回原人物制作目录时：

```sh
python3 scripts/restore-project.py --source ../rally-backup --destination ../rally-person --worktree primary
```

选择目录可以减少最终恢复占用；当前解压验证仍需要完整下载和临时对象空间。建议准备至少 160 GB 可用磁盘空间，并根据清单中的实际总量调整。所有文件按内容去重存储，但恢复后各目录文件互相独立，不会因编辑一份而改变另一份。

## 3. 绑定新电脑上的人物任务

```sh
cd ../rally-person/primary
npm ci
npm run project:brief
npm run project:handoff -- --adopt
npm run project:handoff -- --check
```

`--adopt` 只重设 `handoff.worktree` 为 `.`，并绑定当前分支；先校验基线继承、任务卡、检查点与 Git 冲突。它不会更改任务内容、历史验证、失败或授权范围。原任务的远端主线警告是历史分支与后续主线的真实差异；继续改功能前先保留原成果，再正确整合最新主线。

某些早期制作脚本记录过旧电脑的绝对路径（例如 `/tmp/clear-probe`、`/Users/xindong`）。保留原始文件用于审计；运行时按清单中的相对路径找到已恢复源，或使用脚本已有参数重新指定。清单只能恢复备份时实际存在的文件，不能恢复已消失的临时目录。检查点中引用而快照中缺失的外部路径，须先找回或重建，不能声明对应历史流程已复现。

Blender 制作使用对应检查点要求的版本；旧流程同时存在 LBS 与 DQ 验证，不能替换软件后默认等价。专业动作自然度、手机玩法和运行时替换等原有未验收项不会因备份而自动通过。

## 4. 以后换电脑前

1. 停止同目录的其他写入任务，提交并推送该任务源码、文档和检查点。
2. 更新唯一状态入口，运行 `npm run project:handoff -- --check`。
3. 对新源资产创建新的备份目录，保留旧快照：

```sh
python3 scripts/project-backup.py --output ../rally-backup-next
python3 scripts/restore-project.py --source ../rally-backup-next --verify-only
```

4. 将新目录所有附件上传同仓库新的备份 Release，并在任务中记录实际 tag、清单校验和与失败项；上传完成后核对服务端大小／digest。不要把原始数据直接塞进普通 Git 提交。

备份工具不会联网或上传；上传与验证记录必须分别完成。`node_modules`、缓存、构建输出、玩家 `data`、`.env`、凭据及证书不备份，完整排除范围见清单。新电脑重新 `npm ci`，个人部署凭据重新配置。安全相对符号链接可恢复，外部绝对链接只记录为排除项。
