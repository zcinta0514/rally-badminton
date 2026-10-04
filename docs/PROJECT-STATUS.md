# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-10-04",
  "baseline": {
    "branch": "origin/main",
    "head": "d15ff7c92d24664c22cdcd21875782da579137c5",
    "originMain": "d15ff7c92d24664c22cdcd21875782da579137c5",
    "releaseTag": "v1.7.1"
  },
  "activeTask": {
    "title": "RELEASE-FX：正式上线准备",
    "scope": "从正式主线整理体力、声音、观众与局内设置的发布候选，排除未验收人物实验与已取消的灯效；候选只在本地，未推送、未合并、未打标签。",
    "nextAction": "合并 main、推送 v1.8.0 标签并核验两处线上构建；真机与玩法／视听验收由用户自行完成。",
    "blockedBy": [
      "iPhone13/Safari 与 Pixel8/Chrome 实体机30分钟／稳定60帧实测由用户自行完成，结果尚未记录。",
      "三打法实战平衡与用户最终玩法／视听确认未记录。",
      "专用真实音效素材仍有缺口，本版只发布已核验录音变体与混音功能。"
    ],
    "documents": [
      "docs/tasks/RELEASE-FX.md"
    ],
    "checkpoint": "docs/RELEASE-PREP-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "版本号 1.8.0 已按用户授权递增（首页、package.json、lockfile 一致），发布内容在 release/FX-production 分支并经 Draft PR #1 审核；合并、打标签与线上核验进行中。本机预览 127.0.0.1:3046／同 Wi-Fi 192.168.1.103:3046，人物工作区预览仍在 3040。"
  },
  "readNext": [
    "docs/tasks/RELEASE-FX.md",
    "docs/RELEASE-PREP-CHECKPOINT.md"
  ],
  "links": [
    "docs/tasks/RELEASE-FX.md",
    "docs/RELEASE-PREP-CHECKPOINT.md",
    "docs/WORKFLOW.md",
    "docs/DEPLOYMENT.md"
  ],
  "handoff": {
    "taskId": "RELEASE-FX",
    "branch": "release/FX-production",
    "baselineHead": "d15ff7c92d24664c22cdcd21875782da579137c5",
    "taskFile": "docs/tasks/RELEASE-FX.md",
    "worktree": "/Users/xindong/Documents/开拍rally/.cindy-worktrees/fx-production",
    "phase": "发布中",
    "stopReason": "用户授权递增 1.8.0、合并 main、打标签并自行完成真机验收；发布内容与验证已完成，正在执行合并与线上核验。",
    "nextAction": "合并 main、推送 v1.8.0 标签并核验两处线上构建；真机与玩法／视听验收由用户自行完成。",
    "checkpoint": "docs/RELEASE-PREP-CHECKPOINT.md",
    "validation": "版本递增后重跑：回归 672/672（Node 24 与 22）；构建 4c377c8c35725c4c（根）／0482fefd67cdc881（Pages）；浏览器 16 用例、静态部署 3 用例、服务资源 85 项全过；证据见 docs/RELEASE-PREP-CHECKPOINT.md 与 artifacts/release-prep/。",
    "scopeBoundary": "用户授权：版本按 1.8.0 递增、合并 main、打标签；真机与视听验收由用户自行完成并记录。"
  },
  "publication": "v1.8.0 发布动作进行中：main 仍为 d15ff7c／v1.7.1，发布分支已就绪，合并后由 Pages 与 Vercel 自动部署。"
}
-->
