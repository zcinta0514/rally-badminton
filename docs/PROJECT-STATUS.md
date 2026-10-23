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
    "title": "PACE-1 真实录像校准候选待试玩",
    "scope": "职业与业余录像逐帧取样，校准球的减速和人物移动节奏；工程验证完成，用户手感待确认。",
    "nextAction": "用户试玩3063候选；侧边栏宿主RAF恢复前可用系统浏览器访问同一地址。沿本分支处理反馈，确认前不合并。",
    "blockedBy": [
      "用户玩法与实体手机手感尚未确认。",
      "Cindy侧边栏原生RAF无回调、截图UnknownVizError；当前播放未验过。",
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
      "verifiedOn": "2026-10-23",
      "limitations": "侧边栏已读回当前构建和规则9、无waiting；宿主RAF无回调。独立Chrome操作验证通过，真机手感未测。"
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
    "phase": "工程候选完成，待用户试玩",
    "stopReason": "真实录像取样、实现、721项测试、构建、服务与独立Chrome操作验证已完成；保留用户验收与侧边栏宿主限制。",
    "nextAction": "用户试玩3063候选；侧边栏宿主RAF恢复前可用系统浏览器访问同一地址。沿本分支处理反馈，确认前不合并。",
    "checkpoint": "docs/PACE-1-REAL-REFERENCE.md",
    "validation": "实现6b2724b6，Node24完整721/721；88资源构建41c3a12bbdfe9175；服务资源和sw逐字节一致；WebSocket协议9双客户端通过；Chrome键盘/触屏接球通过。侧边栏RAF未运行，用户手感未验收。",
    "scopeBoundary": "只在此工作区修改、测试、启动独立侧边栏游戏候选及本地提交；用户试玩确认前不合并、不发布、不改发布版本号；不使用子代理。"
  },
  "publication": "v1.10.0 已发布：PR#5合并6aecf9a，标签v1.10.0；Pages 152a297fac2bf852、Vercel 31e7cd941732fbc7。人物实验未合并，原P1预览3040未改。"
}
-->

PACE-1真实录像校准候选已完成工程验证，3063提供当前构建。侧边栏宿主动画帧异常，系统浏览器已验证可操作。待用户试玩；未推送、未合并、未发布。
