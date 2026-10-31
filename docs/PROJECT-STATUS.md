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
    "nextAction": "用户在同一台手机上复测竖屏 PWA（黑条/顶部遮挡）与新主菜单；确认后再谈上线。",
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
      "limitations": "仅本机127.0.0.1，房间用WebSocket；R3主菜单与竖屏安全区已接入，安全区为Chrome模拟，实体手机待复核。",
      "buildId": "fe39c907dce8ba5c",
      "pid": 11550,
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
    "phase": "R3 已交付：主流游戏式主菜单与竖屏 PWA 安全区修复，等待真机复核",
    "stopReason": "按用户反馈完成第三轮接入并交付预览，竖屏安全区需实体机确认。",
    "nextAction": "用户在同一台手机上复测竖屏 PWA（黑条/顶部遮挡）与新主菜单；确认后再谈上线。",
    "checkpoint": "docs/UI-2-CHECKPOINT.md",
    "validation": "721/721与构建a82b45a5011e6ca0通过；首页主控件7种视口0px差异；服务运行时buildId fe39c907dce8ba5c，关键文件SHA-256一致；竖屏安全区47/34为Chrome模拟通过，实体机未验。",
    "scopeBoundary": "仅本地实现与试玩；不改版本、不推送、不合并、不上线，不动其他worktree。"
  },
  "publication": "v1.11.0已发布：PR#7合并829d005f，标签v1.11.0；Pages b9cf9dd3efba46e4、Vercel a41043ea6cbc4d21。两处正式版、公告、关键资源哈希与发球/移动/配色操作实际核验通过。"
}
-->

球馆白 A 已完整接入本地候选，可实际游玩。等待用户视觉和点击手感反馈；未推送、合并或发布，线上仍为既有 v1.11.0。
