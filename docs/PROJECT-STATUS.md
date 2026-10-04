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
    "nextAction": "在候选预览完成真机与玩法／视听验收；通过后把版本递增到 1.8.0、合并 main、打标签并核验线上构建。",
    "blockedBy": [
      "iPhone13/Safari 与 Pixel8/Chrome 实体机30分钟／稳定60帧验收未完成。",
      "专用真实音效素材仍有缺口，当前只发布已核验录音变体与混音功能。",
      "三打法实战平衡与用户最终玩法／视听确认未记录。",
      "合并 main、打标签与部署待验收通过后确认；Draft PR 暂不合并。"
    ],
    "documents": [
      "docs/tasks/RELEASE-FX.md"
    ],
    "checkpoint": "docs/RELEASE-PREP-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "发布候选已推送到 origin/release/FX-production，Draft PR #1 开放，CI（Node 22/24）通过；正式 main 仍为 d15ff7c／v1.7.1。本机预览 127.0.0.1:3046／同 Wi-Fi 192.168.1.103:3046，人物工作区预览仍在 3040。"
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
    "phase": "待验收",
    "stopReason": "候选提取、排除V4/人物实验、全量回归、两处部署构建、双浏览器与静态托管验收均已完成；分支已推送、Draft PR #1 已开、CI 通过；等用户真机与玩法验收后按 1.8.0 合并。",
    "nextAction": "在候选预览完成真机与玩法／视听验收；通过后把版本递增到 1.8.0、合并 main、打标签并核验线上构建。",
    "checkpoint": "docs/RELEASE-PREP-CHECKPOINT.md",
    "validation": "构建 3812dcf037d98243（根）／cf475e4c6e77d3e7（Pages）；回归 672/672（Node 24 与 22，含远端 CI Node 22/24 通过）；浏览器 16 用例、静态部署 3 用例、服务资源 85 项全过；证据见 docs/RELEASE-PREP-CHECKPOINT.md 与 artifacts/release-prep/。",
    "scopeBoundary": "用户授权：完成可审查候选、推送候选分支并开 Draft PR；版本按 1.8.0 在验收通过后确定；合并 main、打标签与部署仍需验收通过后再执行。"
  },
  "publication": "最新正式 main 与 v1.7.1 为 d15ff7c；发布候选已推送到 origin/release/FX-production，Draft PR #1 未合并，线上仍是 v1.7.1。"
}
-->
