# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-10-05",
  "baseline": {
    "branch": "fix/AI-1-low-stamina",
    "head": "974453b7e9670d7357f59496ee8614501f364546",
    "originMain": "db8d45310de38a7afec4a7a9639903ddc50c01c8",
    "releaseTag": "v1.8.0"
  },
  "activeTask": {
    "title": "ENTRY-1 首页分流与模式准备",
    "scope": "继承 AI-1 体力与三陪练候选；实现三个入口、独立配置和双方规则确认后开赛。未发布。",
    "nextAction": "用户查看本地入口、准备页和好友双端开打体验；Safari 真机直连待核验。",
    "blockedBy": [
      "Safari 自动化 WebKit 的 PeerJS 直连握手超时，修改前候选同样复现；WebKit WebSocket 双端流程通过，不能代替 Safari 真机直连验收。",
      "力量型高手高压体力平衡仍未通过；当前导航任务未调整参数。",
      "用户视觉、玩法及真机验收尚未记录。"
    ],
    "documents": [
      "docs/tasks/ENTRY-1.md"
    ],
    "checkpoint": "docs/ENTRY-1-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "v1.8.0 已发布：main 合并提交 45a5d86，标签 v1.8.0；线上 Pages 0482fefd67cdc881／Vercel 4c377c8c35725c4c，均显示正式版 1.8.0。人物工作区预览仍在 3040，未验收人物实验未合并。"
  },
  "readNext": [
    "docs/tasks/ENTRY-1.md",
    "docs/ENTRY-1-CHECKPOINT.md"
  ],
  "links": [
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
    "taskId": "ENTRY-1",
    "branch": "feat/ENTRY-1-navigation",
    "baselineHead": "974453b7e9670d7357f59496ee8614501f364546",
    "taskFile": "docs/tasks/ENTRY-1.md",
    "worktree": "/Users/xindong/Documents/开拍rally/.cindy-worktrees/entry-1-navigation",
    "phase": "待用户验收",
    "stopReason": "入口与开赛确认已实现，候选保留在独立分支；正式线上未改。",
    "nextAction": "用户查看本地入口、准备页和好友双端开打体验；Safari 真机直连待核验。",
    "checkpoint": "docs/ENTRY-1-CHECKPOINT.md",
    "validation": "完整测试 690/690；最终构建与浏览器证据见 ENTRY-1-QA.json。Chromium 直连和 WebKit WebSocket 双端确认／倒数检查，WebKit 直连失败及基线对照明确保留。",
    "scopeBoundary": "仅本地实现和验收。继承 AI-1 三个候选提交；未授权本批上线，游戏版本保持1.8.0；无事件灯光。"
  },
  "publication": "v1.8.0 已上线：Pages 0482fefd67cdc881、Vercel 4c377c8c35725c4c，两处均由 main 提交 45a5d86 构建，标签 v1.8.0。"
}
-->

当前入口候选位于 `feat/ENTRY-1-navigation`，预览端口3051（PeerJS）／3052（WebSocket）。原 P1 目录与3040预览未改。状态与证据不代表已上线。
