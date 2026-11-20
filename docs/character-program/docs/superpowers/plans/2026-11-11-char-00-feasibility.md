# CHAR-00 基线与免费动作管线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本计划不要求派出子代理；用户已授权准备，当前进度以 STATUS 为准。

**Goal:** 在不新增付费、不覆盖正式人物的前提下，获得可复现的现状对照和免费动作制作小样，选定 CHAR-01 的制作路线。

**Architecture:** 保留现有比赛状态与人物作为基线，在隔离工作目录中建立离线资产／动作试验。视频关键点只是输入候选；以可编辑的骨骼动作和正常速度观感决定采用识别辅助或关键帧路线。正式运行时改造不属于本阶段。

**Tech Stack:** 现有 Node／Three.js；候选 Blender、MediaPipe、现有免费角色或许可适用的人体基础；PowerShell UTF-8 文档与证据记录。版本在选定后固定，不使用未记录的 latest 作为可复现环境。

---

## Task 1：核实最新基线，建立隔离目录

**Files:** 读取 `rally-dev/AGENTS.md`、`docs/WORKFLOW.md`、`docs/PROJECT-STATUS.md`、`package.json`；更新本工作区 `STATUS.md`。本任务不改游戏源码。

- [x] 在现有仓库运行以下只读命令，保存输出并检查所有未提交／未跟踪文件；确认没有其他任务正在写同一目录。

```powershell
git -C rally-dev status --short --branch
git -C rally-dev branch -avv
git -C rally-dev worktree list
git -C rally-dev remote -v
git -C rally-dev ls-remote --heads origin main
git -C rally-dev ls-remote --tags origin
```

预期：输出可比较的本地／远端状态，不要求它们相等。若有修改先保全，不执行 reset、clean 或覆盖。

- [x] 确认开始实施后 fetch，再用提交图与差异核实最新主线是否包含当前用户验收功能；继承仍未合并的功能时记录依赖，不擅自合并其他任务。

```powershell
git -C rally-dev fetch origin
git -C rally-dev log --oneline --decorate --graph -20 --all
git -C rally-dev log --left-right --oneline HEAD...origin/main
git -C rally-dev diff --stat HEAD origin/main
```

- [x] 基线确定后从该精确提交建立 `codex/char-00-feasibility` 分支和独立 worktree；若同名已有，先检查并接续，不能强制覆盖。默认候选为仓库旁 `rally-char-00`，把实际路径、分支和基线提交写入 STATUS。
- [x] 将此规划快照纳入隔离分支的 `docs/character-program/`，按 README 规则转换唯一计划主位置；建立 `docs/tasks/CHAR-00.md` 指向它，不复制维护两套实时进度。

验收：用户其他功能与原工作目录保留；实施位置、依赖与远端核验时间明确。不能仅凭版本号认定基线。

## Task 2：确认旧资产可恢复性

**Files:** 读取 `docs/CHARACTER-ASSETS.md`、`src/models/LICENSE-Quaternius.txt`、`scripts/prepare-athlete.py`、`src/models/athlete.glb`；在隔离分支创建 `docs/character-program/CHAR-00-INVENTORY.md`。

- [x] 记录现有 GLB 和脚本 SHA256，不修改原文件。

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath src/models/athlete.glb
Get-FileHash -Algorithm SHA256 -LiteralPath scripts/prepare-athlete.py
```

- [ ] 检查历史源包、便携 Blender、解压素材的路径；按已知目录先找现有副本，缺失时再获取官方免费版本。每个下载保存来源页、版本、许可证、文件散列及校验依据。发现收费条件立即排除，不自动购买。
- [x] 静态解析当前 GLB，记录 mesh／材质／skin／关节／动画／图片／索引数量，区分文件三角形与整个游戏 draw call。沿用现有模型检查代码或工具，新增检查脚本前先写该子任务实现步骤。
- [ ] 检查生成脚本输出路径；只有在隔离目录确认不会覆盖正式源资产后才尝试重生成。输出单独保留，再比较形状、骨架和文件指纹；不把不同 Blender 版本产生的二进制差异直接当成视觉失败。
- [ ] 记录当前角色是否值得继续改造，或是否需要人体基础候选；必须给出肩、髋、体态证据，不能仅凭名称选模型。

验收：至少可解释当前资产的来源、制作依赖和恢复缺口；缺失源文件有明确恢复步骤，不能宣称恢复完成。

## Task 3：形成可比较的现状证据

**Files:** 复用 `src/model-preview.js`、`src/smash-preview.js`；创建 `docs/character-program/CHAR-00-BASELINE.md`。录像放隔离目录下被忽略的 `artifacts/character/CHAR-00/baseline/`，在报告记录散列。

- [x] 按隔离目录的 package.json 运行现有环境检查，依赖缺失时使用锁文件安装，不更新依赖版本；记录运行版本。
- [ ] 运行现有相关测试与构建，记录真实结果。以下命令从隔离仓库根目录执行：

```powershell
node --test tests/athlete.test.js tests/athlete-skin.test.js tests/athlete-import.test.js tests/smash-motion.test.js tests/rescue-motion.test.js tests/finale-pose.test.js tests/model-assets.test.js tests/model-build.test.js
npm run build
```

预期：测试和构建退出 0。失败时记录原始错误，先区分环境、基线与候选修改，不把现有失败隐去。

- [ ] 启动隔离服务，核验实际目录、构建资源和 SW 版本后，录制准备、移动急停、发球、高远、吊球、杀球、扑救及赛后演出；复用现有预览入口 `/?preview=athlete`，不可仅录静态站姿。
- [ ] 采用同一机位与时间尺度记录正常速度和 0.25 倍速；每个缺陷记录动作、时间点、部位、严重度与可能原因，区分观察与推测。
- [ ] 记录桌面手机横屏模拟结果；可用时做 iPhone 13 基线。不具备真机时明确记未测，接续其他任务。

验收：后续候选能够与旧版同条件比较；骨骼不崩与视觉自然分别记录。

## Task 4：筛选一段有效参考，测试免费路线

**Files:** 创建 `docs/character-program/CHAR-00-MOTION-TRIAL.md`；素材、姿态数据与试验 `.blend` 放 `artifacts/character/CHAR-00/trials/`，在文档记录清单和散列。

- [ ] 选择一个有明确来源及使用条件的短片段：固定镜头、全身与脚部可见、持拍手尽量清楚，包含引拍、击球、随挥和恢复。不从多次转场剪辑中假定得到连续运动。
- [ ] 优先选专业且清楚的动作；如果没有符合条件且可用于提取的素材，先使用参考观看制作关键帧，并向用户询问可用授权素材。不要把低质量输入修到“看起来平滑”当成专业动作。
- [ ] 为 MediaPipe 等选定工具建立隔离环境，固定版本和模型文件指纹；测试少量帧再处理全片段，不在游戏运行时加入推理依赖。
- [ ] 记录关键点可见度、遮挡片段、左右误判、深度跳变、支撑脚漂移、关节扭转不可观测和球拍未追踪部分。输出仅称“估计”，不称真值。
- [ ] 在 Blender 测试骨架上重建动作；分别保存识别初稿、修正稿，以及按相同参考制作的关键姿态对照。锁定骨段长度，支撑脚与根运动分别处理，不逐帧强迫所有点完全拟合。
- [ ] 校正髋胸旋转、非持拍臂、肩肘先后、腕和拍面、落地缓冲；不得通过均匀低通平滑消除挥拍峰值。
- [ ] 保存可编辑源文件与骨骼动画导出，检查时间、单位、轴向、根运动与触球标记；此时不覆盖游戏 `athlete.glb`。

验收：至少一个能反复生成的短骨骼动作样片；工具输出可导出并不等于动作质量达标。若依赖、许可或效果不可行，记录失败后按视频参考＋关键帧路线继续，不切换付费服务。

## Task 5：路线决策与 CHAR-01 交接

**Files:** 更新 `DECISIONS.md`、`STATUS.md`；创建 `docs/character-program/CHAR-00-RESULT.md` 及 CHAR-01 的独立任务计划。

- [ ] 用相同角度和速度比较旧版、视频辅助修正、关键帧对照；检查 V02–V04，给出具体优劣而非笼统评分。
- [ ] 汇总首次配置、每秒动作处理／修正耗时和可复现性；记录工具路线选择及其失败边界。
- [ ] 给用户展示一个明确样片及未达标点，只询问会影响方向的取舍；不能要求用户替开发者选择骨架算法。
- [ ] 依据真实结果编写 CHAR-01 的接口、文件、行为测试与逐步实现计划，再推进完整动作链；不提前预设所有代码。
- [ ] 保存任务文档与必要源码的本地提交，显式选择文件；大型素材另建可恢复清单。更新 STATUS 的唯一位置、分支、下一步与授权。当前用户未授权推送、合并或发布时保持本地。

本阶段完成不代表人物上线，不代表 iPhone 13 已通过，不自动启动 CHAR-02。按实际授权接续下一阶段；未获视觉结论时继续修样片或记录待验收。

## 2026-11-11 第一轮执行补充

已完成项按复核证据勾选；其余不提前勾选。具体工具冒烟、61 项人物测试、构建和已有全量测试失败见主目录 CHAR-00-PREPARATION.md。阶段尚未完成，下一步为参考筛选和动作小样。
