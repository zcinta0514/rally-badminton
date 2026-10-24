# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-10-24",
  "baseline": {
    "branch": "main",
    "head": "01fed373cea2ff89e0776e3cf5d34b1c7f77f16a",
    "originMain": "01fed373cea2ff89e0776e3cf5d34b1c7f77f16a",
    "releaseTag": "v1.10.0"
  },
  "activeTask": {
    "title": "PACE-1 前后同条件对比完成，待用户试玩",
    "scope": "职业与业余录像逐帧取样，校准球的减速和人物移动节奏；工程验证完成，用户手感待确认。",
    "nextAction": "用户先看3064左右同步对比，再到3063试玩；按反馈继续此分支，确认前不合并。",
    "blockedBy": [
      "用户玩法与实体手机手感尚未确认。",
      "WebRTC真双机与公网延迟未实测；两端需同规则9候选。"
    ],
    "documents": [
      "docs/tasks/PACE-1.md",
      "docs/PACE-1-REAL-QA.json"
    ],
    "checkpoint": "docs/PACE-1-REAL-REFERENCE.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "v1.10.0 已发布：PR#5合并6aecf9a，标签v1.10.0；Pages 152a297fac2bf852、Vercel 31e7cd941732fbc7；线上两处显示正式版 1.10.0 且更新公告实际弹出。",
    "localPreview": {
      "task": "PACE-1",
      "url": "http://127.0.0.1:3063/",
      "worktree": "/Users/xindong/Documents/开拍rally/.cindy-worktrees/vibrant-thompson",
      "pid": 84539,
      "buildId": "41c3a12bbdfe9175",
      "sidebarTab": "PACE-1 玩法测试",
      "verifiedOn": "2026-10-24",
      "limitations": "侧边栏已恢复并实测发球与移动；任务未在主窗口展开时预览可能保持1×1，选中本任务再focus即可恢复。真机手感待确认。"
    },
    "comparisonPreview": {
      "url": "http://127.0.0.1:3064/",
      "pid": 8405,
      "baseline": "01fed373",
      "candidate": "6b2724b6",
      "scope": "相同站位／输入／人物／镜头的真实共享规则重放；不代表旧版整套UI录像；五场景验证通过。",
      "evidence": "artifacts/pace-compare/RESULT.md",
      "sidebarTab": "修复前后同步对比"
    }
  },
  "readNext": [
    "docs/tasks/PACE-1.md",
    "docs/PACE-1-REAL-REFERENCE.md"
  ],
  "links": [
    "docs/tasks/PACE-1.md",
    "docs/PACE-1-REAL-QA.json",
    "docs/PACE-1-REAL-REFERENCE.md",
    "docs/PACE-1-CHECKPOINT.md",
    "docs/tasks/FX-4.md",
    "docs/FX-4-CHECKPOINT.md",
    "docs/FX-4-QA.json",
    "docs/RELEASE-1.10.0-CHECKPOINT.md",
    "docs/RELEASE-1.10.0-QA.json",
    "docs/RELEASE-1.9.0-QA.json",
    "docs/tasks/R-1.9.0.md",
    "docs/RELEASE-1.9.0-CHECKPOINT.md",
    "docs/tasks/BAL-1.md",
    "docs/BAL-1-CHECKPOINT.md",
    "docs/BAL-1-QA.json",
    "docs/tasks/ENTRY-1.md",
    "docs/ENTRY-1-CHECKPOINT.md",
    "docs/ENTRY-1-QA.json",
    "docs/AI-1-COACH-CHECKPOINT.md",
    "docs/tasks/AI-1.md",
    "docs/AI-1-SHOT-RECOVERY-CHECKPOINT.md",
    "docs/AI-1-FIX-CHECKPOINT.md",
    "docs/AI-1-STAMINA-CHECKPOINT.md",
    "docs/tasks/RELEASE-FX.md",
    "docs/RELEASE-PREP-CHECKPOINT.md",
    "docs/WORKFLOW.md",
    "docs/DEPLOYMENT.md"
  ],
  "handoff": {
    "taskId": "PACE-1",
    "branch": "cindy/vibrant-thompson",
    "baselineHead": "01fed373cea2ff89e0776e3cf5d34b1c7f77f16a",
    "taskFile": "docs/tasks/PACE-1.md",
    "worktree": "/Users/xindong/Documents/开拍rally/.cindy-worktrees/vibrant-thompson",
    "phase": "同条件对比与侧边栏实测完成，待用户试玩",
    "stopReason": "新增3064同步对比工具，五场景及79项相关测试通过；3063侧边栏发球／移动／减速实测通过，已清观察钩子。",
    "nextAction": "用户先看3064左右同步对比，再到3063试玩；按反馈继续此分支，确认前不合并。",
    "checkpoint": "docs/PACE-1-REAL-REFERENCE.md",
    "validation": "实现6b2724b6；此前721全量及构建41c3a12bbdfe9175通过；本轮79定向项通过。3064五场景、播放／暂停与截图通过；3063同hitId水平球速13.5487→6.9537m/s，W前进z3.8→2.75875，console无错。用户手感未验收。",
    "scopeBoundary": "只在此工作区修改、测试、启动独立侧边栏游戏候选及本地提交；用户试玩确认前不合并、不发布、不改发布版本号；不使用子代理。"
  },
  "publication": "v1.10.0 已发布：PR#5合并6aecf9a，标签v1.10.0；Pages 152a297fac2bf852、Vercel 31e7cd941732fbc7。人物实验未合并，原P1预览3040未改。"
}
-->

PACE-1同条件前后对比已完成。3064左右同步重放、3063可玩候选均已实际核对；侧边栏已恢复，等待用户玩法与真手机验收。未合并、未发布。
