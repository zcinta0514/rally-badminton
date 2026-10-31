# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-11-01",
  "baseline": {
    "branch": "main",
    "head": "93d617c6c7a6a327da9b8480e7a65352dfa8d13e",
    "originMain": "93d617c6c7a6a327da9b8480e7a65352dfa8d13e",
    "releaseTag": "v1.12.0"
  },
  "activeTask": {
    "title": "UI-2：1.12.0 已发布，等待实体设备验收",
    "scope": "球场白全界面、主菜单文案、击球触感/视觉反馈、竖屏安全区；已合并并上线。",
    "nextAction": "用户在实体安卓机确认振动强度，在实体 iPhone/Android 复测安装态安全区；新任务另建 worktree。",
    "blockedBy": [],
    "documents": [
      "docs/tasks/UI-2.md"
    ],
    "checkpoint": "docs/UI-2-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "v1.12.0已发布：PR#9合并b0f9f84e，标签v1.12.0；GitHub Releases已补齐v1.4.0–v1.12.0且最新为v1.12.0；Pages构建e3f6043e1405a3a2、Vercel构建a7ae870879cdef42。两处正式版1.12.0、标题、公告、统计默认开启、标志与关键资源实际回读通过。",
    "localPreview": {
      "task": "UI-2",
      "url": "http://127.0.0.1:3072/",
      "worktree": "/Users/xindong/Documents/开拍rally-ui-2-court-white",
      "transport": "本机WebSocket对战，PUBLIC_PEER_MODE=0",
      "verifiedOn": "2026-10-31",
      "limitations": "仅本机127.0.0.1，房间用WebSocket；已合并主线，实体振动强度与安装态安全区待复核。",
      "buildId": "641c33bfc78eca96",
      "pid": 69535,
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
    "phase": "已发布 v1.12.0：PR/CI/Pages/Vercel 已核验，等待实体设备验收",
    "stopReason": "按用户要求完成 PR 合并、标签与部署；线上两处已回读通过。",
    "nextAction": "用户在实体安卓机确认振动强度，在实体 iPhone/Android 复测安装态安全区；新任务另建 worktree。",
    "checkpoint": "docs/UI-2-CHECKPOINT.md",
    "validation": "727/727；根路径a7ae870879cdef42、Pages e3f6043e1405a3a2均上线；PR#9合并b0f9f84e、标签v1.12.0；GitHub Releases已补齐v1.4.0–v1.12.0且最新v1.12.0；两处线上正式版/标题/公告/统计默认开启/标志计算样式回读通过；实体振动与安装态未测。",
    "scopeBoundary": "已按用户授权合并 main、打 v1.12.0 并部署；实体设备验收与后续任务另行授权，不动其他 worktree。"
  },
  "publication": "v1.12.0已发布：PR#9合并b0f9f84e，标签v1.12.0；GitHub Releases已补齐v1.4.0–v1.12.0且最新为v1.12.0；Pages构建e3f6043e1405a3a2、Vercel构建a7ae870879cdef42。两处正式版1.12.0、标题、公告、统计默认开启、标志与关键资源实际回读通过。"
}
-->

v1.12.0 已发布到 GitHub Pages 与 Vercel：球场白界面、主菜单文案、击球触感/视觉反馈与竖屏安全区均已上线。剩余真机验收（安卓振动强度、iPhone/Android 安装态）由用户完成；本地预览 http://127.0.0.1:3072/ 仍在 UI-2 worktree 上运行。
