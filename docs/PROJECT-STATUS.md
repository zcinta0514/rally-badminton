# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-10-31",
  "baseline": {
    "branch": "ui-2-court-white",
    "head": "7164832c6b2dae212318c8ff2ec53a607cfe5fab",
    "originMain": "7164832c6b2dae212318c8ff2ec53a607cfe5fab",
    "releaseTag": "v1.11.0"
  },
  "activeTask": {
    "title": "UI-2：球馆白 A 全界面接入与本地试玩",
    "scope": "完整游戏UI、文案和按钮反馈；基于最新主线保留全部玩法。",
    "nextAction": "用户验收 R2：操作按键位置须与主线一致、品牌标志未改、文案改为正式游戏口径；未授权发布。",
    "blockedBy": [],
    "documents": [
      "docs/tasks/UI-2.md"
    ],
    "checkpoint": "docs/UI-2-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "v1.11.0已发布：PR#7合并829d005f，标签v1.11.0；Pages b9cf9dd3efba46e4、Vercel a41043ea6cbc4d21。两处正式版、公告、关键资源哈希与发球/移动/配色操作实际核验通过。",
    "localPreview": {
      "task": "UI-2",
      "url": "http://127.0.0.1:3072/",
      "worktree": "/Users/xindong/Documents/开拍rally-ui-2-court-white",
      "transport": "本机WebSocket对战，PUBLIC_PEER_MODE=0",
      "verifiedOn": "2026-10-31",
      "limitations": "仅本机127.0.0.1，房间用WebSocket；R2已恢复原版控件几何与标志，触控仍为浏览器模拟，实体手机和用户视觉手感待验收。",
      "buildId": "e9e402d2400d0053",
      "pid": 75216,
      "sidebarTab": "球馆白 A · 完整游戏"
    }
  },
  "readNext": [
    "docs/tasks/UI-2.md",
    "docs/UI-2-CHECKPOINT.md"
  ],
  "links": [
    "docs/tasks/UI-2.md",
    "docs/UI-2-CHECKPOINT.md"
  ],
  "handoff": {
    "taskId": "UI-2",
    "branch": "ui-2-court-white",
    "baselineHead": "7164832c6b2dae212318c8ff2ec53a607cfe5fab",
    "taskFile": "docs/tasks/UI-2.md",
    "worktree": "/Users/xindong/Documents/开拍rally-ui-2-court-white",
    "phase": "R2 已交付：控件位置锁定、正式文案、标志不变，等待用户验收",
    "stopReason": "按用户两条硬要求完成第二轮接入并交付实际预览，等用户判断。",
    "nextAction": "用户验收 R2：操作按键位置须与主线一致、品牌标志未改、文案改为正式游戏口径；未授权发布。",
    "checkpoint": "docs/UI-2-CHECKPOINT.md",
    "validation": "721/721与构建8a0de075026e01c2通过；与7164832c干净工作树逐元素几何对照，主操作控件0px差异，最大1-2px仅来自字体度量；服务运行时buildId 853a69e0611e95c3，关键文件SHA-256与磁盘一致；标志计算样式与主线一致。实体手机与用户手感未验收。",
    "scopeBoundary": "仅本地实现与试玩；不改版本、不推送、不合并、不上线，不动其他worktree。"
  },
  "publication": "v1.11.0已发布：PR#7合并829d005f，标签v1.11.0；Pages b9cf9dd3efba46e4、Vercel a41043ea6cbc4d21。两处正式版、公告、关键资源哈希与发球/移动/配色操作实际核验通过。"
}
-->

球馆白 A 已完整接入本地候选，可实际游玩。等待用户视觉和点击手感反馈；未推送、合并或发布，线上仍为既有 v1.11.0。
