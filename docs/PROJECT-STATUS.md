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
    "title": "UI-2：界面与击球反馈 1.12.0 发布准备",
    "scope": "球场白全界面、主菜单文案、击球触感/视觉反馈、竖屏安全区；保留全部玩法与标志。",
    "nextAction": "创建 PR，CI 通过后合并 main、打 v1.12.0，核验 Pages/Vercel 并回填发布检查点。",
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
      "buildId": "121ef2eca07996f3",
      "pid": 39907,
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
    "phase": "发布准备：本地核验完成，标志核对一致，PR 待创建",
    "stopReason": "用户要求合并本轮改动；本地测试、构建、几何与标志核对已完成，等待 PR/CI/合并/部署。",
    "nextAction": "创建 PR，CI 通过后合并 main、打 v1.12.0，核验 Pages/Vercel 并回填发布检查点。",
    "checkpoint": "docs/UI-2-CHECKPOINT.md",
    "validation": "727/727与根路径a7ae870879cdef42、Pages e3f6043e1405a3a2构建通过；标志与origin/main逐项一致；首页主控件7视口0px；触感、竖屏安全区与51LA默认开启已核验；实体振动/安装态未测。",
    "scopeBoundary": "仅本地实现与试玩；不改版本、不推送、不合并、不上线，不动其他worktree。"
  },
  "publication": "v1.11.0已发布：PR#7合并829d005f，标签v1.11.0；Pages b9cf9dd3efba46e4、Vercel a41043ea6cbc4d21。两处正式版、公告、关键资源哈希与发球/移动/配色操作实际核验通过。"
}
-->

球馆白 A 已完整接入本地候选，可实际游玩。等待用户视觉和点击手感反馈；未推送、合并或发布，线上仍为既有 v1.11.0。
