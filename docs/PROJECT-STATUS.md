# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-11-01",
  "baseline": {
    "branch": "fix/UI-3-menu-hud-align",
    "head": "92fa12b4f12ff64e098559b5fd1a012a74ea841a",
    "originMain": "92fa12b4f12ff64e098559b5fd1a012a74ea841a",
    "releaseTag": "v1.12.0"
  },
  "activeTask": {
    "title": "UI-3：开始比赛下方横线与比赛内顶栏对齐（待用户实测，PR 不合入）",
    "scope": "人机对战入口页「开始比赛」按钮正下方的 1px 分隔线；比赛内顶栏 7 个控件同高、声音图标视觉尺寸归一、竖屏窄屏排布；比赛内品牌文字可读性。只改外观层，不动玩法与人物。",
    "nextAction": "用户在 http://127.0.0.1:3092/ 实测两处观感（按钮下横线是否消失、右上角一排按键与图标是否对齐），确认后再决定合并与发布；需要时单独核议比赛内品牌文字改色。",
    "blockedBy": [],
    "documents": [
      "docs/tasks/UI-3.md"
    ],
    "checkpoint": "docs/UI-3-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "v1.12.0已发布：PR#9合并b0f9f84e，标签v1.12.0；GitHub Releases已补齐v1.4.0–v1.12.0且最新为v1.12.0；Pages构建e3f6043e1405a3a2、Vercel构建a7ae870879cdef42。两处正式版1.12.0、标题、公告、统计默认开启、标志与关键资源实际回读通过。",
    "localPreview": {
      "task": "UI-3",
      "url": "http://127.0.0.1:3092/",
      "worktree": "/Users/xindong/Documents/开拍rally/.cindy-worktrees/ui-3-menu-hud",
      "transport": "本机WebSocket对战，PUBLIC_PEER_MODE=0",
      "verifiedOn": "2026-11-01",
      "limitations": "仅本机127.0.0.1；未合并、未改版本号；实体手机需经局域网地址复核。",
      "buildId": "bebfc7733547254f",
      "pid": 96489,
      "sidebarTab": "UI-3 · 顶栏与开局页修复"
    }
  },
  "readNext": [
    "docs/tasks/UI-3.md",
    "docs/UI-3-CHECKPOINT.md"
  ],
  "links": [
    "docs/tasks/UI-3.md",
    "docs/UI-3-CHECKPOINT.md"
  ],
  "handoff": {
    "taskId": "UI-3",
    "branch": "fix/UI-3-menu-hud-align",
    "baselineHead": "92fa12b4f12ff64e098559b5fd1a012a74ea841a",
    "taskFile": "docs/tasks/UI-3.md",
    "worktree": "/Users/xindong/Documents/开拍rally/.cindy-worktrees/ui-3-menu-hud",
    "phase": "本地实现与实测完成，PR 保持 Draft，等待用户视觉验收",
    "stopReason": "用户要求先开 PR 不合入，实测效果后再决定。",
    "nextAction": "用户在本地预览实测两处观感；通过后再合并、定版本号并发布。",
    "checkpoint": "docs/UI-3-CHECKPOINT.md",
    "validation": "727/727 通过；PWA 构建 fd523038c3b32220 通过；10 种视口比赛内顶栏 7 个控件 top/bottom/height 实测一致且无横向溢出；人机对战入口页安装入口分隔线为透明；图标墨迹高 14.75/15.25/15.25px，中心同为 cy=18.38；未做实体手机验收。",
    "scopeBoundary": "只改外观层；不改版本号、不动其他 worktree 与人物在制目录。",
    "publicationBlocked": "未合并 main、未打标签、未部署；线上仍为 v1.12.0。"
  },
  "publication": "v1.12.0已发布：PR#9合并b0f9f84e，标签v1.12.0；GitHub Releases已补齐v1.4.0–v1.12.0且最新为v1.12.0；Pages构建e3f6043e1405a3a2、Vercel构建a7ae870879cdef42。两处正式版1.12.0、标题、公告、统计默认开启、标志与关键资源实际回读通过。"
}
-->

v1.12.0 仍在线（GitHub Pages + Vercel）。当前分支 `fix/UI-3-menu-hud-align` 按用户要求只开 Draft PR、不合并：「开始比赛」按钮下的 1px 分隔线已去掉，比赛内顶栏控件已改为同高、声音图标视觉尺寸与同排图标一致。等用户实测两处观感后再决定合并与版本号。
