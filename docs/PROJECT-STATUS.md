# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-10-15",
  "baseline": {
    "branch": "main",
    "head": "dcf053230b3612058aac3f09d2cc2713cfcf8ea6",
    "originMain": "dcf053230b3612058aac3f09d2cc2713cfcf8ea6",
    "releaseTag": "v1.9.0"
  },
  "activeTask": {
    "title": "FX-4 地胶配色可选已交付待合并",
    "scope": "四套地胶配色（经典绿／赛事蓝／紫罗兰／玫瑰粉）与比赛屏独立「配色」入口；颜色调浅与入口独立两轮用户验收通过。",
    "nextAction": "推送 feat/FX-4-court-colors 并建立 Draft PR；是否合并 main 与随哪批发布由用户确认。",
    "blockedBy": [
      "手机真机 30 分钟／稳定 60 帧与横屏触控实测未做（用户自理）。",
      "联机对打双机配色视觉未实测；实现为本机偏好，不上传、不影响判定。",
      "玫瑰粉无权威实拍基准，如需终版校准以用户提供的参考为准。"
    ],
    "documents": [
      "docs/tasks/FX-4.md"
    ],
    "checkpoint": "docs/FX-4-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "v1.9.0 已发布：PR#2合并62051d0，标签v1.9.0；Pages 633bc77d0521649d、Vercel bc91ba3fa312a101。FX-4 配色为未合并候选（feat/FX-4-court-colors，基线 dcf0532）。"
  },
  "readNext": [
    "docs/tasks/FX-4.md",
    "docs/FX-4-CHECKPOINT.md"
  ],
  "links": [
    "docs/tasks/FX-4.md",
    "docs/FX-4-CHECKPOINT.md",
    "docs/FX-4-QA.json",
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
    "taskId": "FX-4",
    "branch": "feat/FX-4-court-colors",
    "baselineHead": "dcf053230b3612058aac3f09d2cc2713cfcf8ea6",
    "taskFile": "docs/tasks/FX-4.md",
    "worktree": "/Users/xindong/Documents/开拍rally/.cindy-worktrees/fx-4-court-colors",
    "phase": "待合并",
    "stopReason": "配色与独立入口两轮用户验收通过；任务卡、检查点与 QA 已补，待提交推送与 PR。",
    "nextAction": "推送分支、建立 Draft PR；合并与发布由用户确认。",
    "checkpoint": "docs/FX-4-CHECKPOINT.md",
    "validation": "npm test 709/709（Node v24.21.0）；npm run build PWA a691ee18f5a7129b；四色实机截图与 reload 持久化见 artifacts/fx4/20261015-entry/report.json。",
    "scopeBoundary": "用户已验收配色与入口；未授权合并 main、改版本号或发布。真机验收用户自理。"
  },
  "publication": "v1.9.0 已发布：PR#2合并62051d0，标签v1.9.0；Pages 633bc77d0521649d、Vercel bc91ba3fa312a101。人物实验未合并，原P1预览3040未改；FX-4 配色候选未合并。"
}
-->

正式1.9.0已上线并核验。3053为旧候选，3055为1.9.0本地预览，3040为独立人物任务，3010为FX-4配色候选预览。
