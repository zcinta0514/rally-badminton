# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-10-05",
  "baseline": {
    "branch": "origin/main",
    "head": "db8d45310de38a7afec4a7a9639903ddc50c01c8",
    "originMain": "db8d45310de38a7afec4a7a9639903ddc50c01c8",
    "releaseTag": "v1.8.0"
  },
  "activeTask": {
    "title": "AI-1：低体力陪练进攻与恢复修正",
    "scope": "已实现低体力机会杀球、每分定量恢复与高远球／吊球后的有界调整加成；共同疲劳惩罚保留，候选未上线。",
    "nextAction": "用户实战体验击球后调整恢复、低体力进攻与三打法平衡；验收后再准备发布。",
    "blockedBy": [],
    "documents": [
      "docs/tasks/AI-1.md"
    ],
    "checkpoint": "docs/AI-1-SHOT-RECOVERY-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "v1.8.0 已发布：main 合并提交 45a5d86，标签 v1.8.0；线上 Pages 0482fefd67cdc881／Vercel 4c377c8c35725c4c，均显示正式版 1.8.0。人物工作区预览仍在 3040，未验收人物实验未合并。"
  },
  "readNext": [
    "docs/tasks/AI-1.md",
    "docs/AI-1-SHOT-RECOVERY-CHECKPOINT.md"
  ],
  "links": [
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
    "taskId": "AI-1",
    "branch": "fix/AI-1-low-stamina",
    "baselineHead": "db8d45310de38a7afec4a7a9639903ddc50c01c8",
    "taskFile": "docs/tasks/AI-1.md",
    "worktree": "/Users/xindong/Documents/开拍rally/.cindy-worktrees/ai-1-low-stamina",
    "phase": "待验收",
    "stopReason": "高远球／吊球调整恢复已实现，680项全量测试和两浏览器开打／规则说明通过；待用户实战验收。",
    "nextAction": "用户实战体验击球后调整恢复、低体力进攻与三打法平衡；验收后再准备发布。",
    "checkpoint": "docs/AI-1-SHOT-RECOVERY-CHECKPOINT.md",
    "validation": "680/680测试通过；构建72ed74206743b774；Chromium/WebKit开打、规则说明和服务资源通过；5400固定触点、360场长局均完成。证据 AI-1-SHOT-RECOVERY-QA.json。",
    "scopeBoundary": "用户授权保留疲劳并修正进攻／恢复，并明确选择高远球／吊球击球后休整加成。本地候选不默认发布，版本号不递增，真机与玩法验收用户自理。"
  },
  "publication": "v1.8.0 已上线：Pages 0482fefd67cdc881、Vercel 4c377c8c35725c4c，两处均由 main 提交 45a5d86 构建，标签 v1.8.0。"
}
-->
