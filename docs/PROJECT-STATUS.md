# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-10-04",
  "baseline": {
    "branch": "origin/main",
    "head": "45a5d860e7647b23026efaa1690c6da7b731786f",
    "originMain": "45a5d860e7647b23026efaa1690c6da7b731786f",
    "releaseTag": "v1.8.0"
  },
  "activeTask": {
    "title": "RELEASE-FX：正式上线准备",
    "scope": "从正式主线整理体力、声音、观众与局内设置的发布候选，排除未验收人物实验与已取消的灯效；候选只在本地，未推送、未合并、未打标签。",
    "nextAction": "用户自行完成真机（iPhone13/Safari、Pixel8/Chrome）与玩法／视听验收并记录结果；后续任务从 main 的 v1.8.0 基线新建分支。",
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
    "releaseState": "v1.8.0 已发布：main 合并提交 45a5d86，标签 v1.8.0；线上 Pages 0482fefd67cdc881／Vercel 4c377c8c35725c4c，均显示正式版 1.8.0。人物工作区预览仍在 3040，未验收人物实验未合并。"
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
    "phase": "已发布",
    "stopReason": "v1.8.0 已合并、打标签并部署；线上构建号与首页版本已核验，线上开打与设置检查无报错。真机与视听验收待用户自行完成并记录。",
    "nextAction": "用户自行完成真机（iPhone13/Safari、Pixel8/Chrome）与玩法／视听验收并记录结果；后续任务从 main 的 v1.8.0 基线新建分支。",
    "checkpoint": "docs/RELEASE-PREP-CHECKPOINT.md",
    "validation": "发布后核验：CI／Pages 工作流成功，线上 Pages 0482fefd67cdc881、Vercel 4c377c8c35725c4c；Chromium／WebKit 线上开打与设置检查无报错；发布前回归 672/672（Node 24 与 22）。证据见 docs/RELEASE-PREP-CHECKPOINT.md 与 artifacts/release-prep/。",
    "scopeBoundary": "用户授权递增 1.8.0、合并 main、打标签；真机与视听验收由用户自行完成。未验收的人物/V4 实验仍不得合入。"
  },
  "publication": "v1.8.0 已上线：Pages 0482fefd67cdc881、Vercel 4c377c8c35725c4c，两处均由 main 提交 45a5d86 构建，标签 v1.8.0。"
}
-->
