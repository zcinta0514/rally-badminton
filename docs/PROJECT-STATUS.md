# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-10-05",
  "baseline": {
    "branch": "feat/ENTRY-1-navigation",
    "head": "7cf2f17cc9aa04cbe3968542c3742d465407d10a",
    "originMain": "db8d45310de38a7afec4a7a9639903ddc50c01c8",
    "releaseTag": "v1.8.0"
  },
  "activeTask": {
    "title": "BAL-1 三陪练体力平衡与首页密度",
    "scope": "继承完整入口候选，调整三打法资源取舍、改善高远吊球调整收益并收紧首页布局；保留疲劳惩罚。",
    "nextAction": "用户查看3053候选：首页布局和三陪练实战手感；确认后再准备本批发布。",
    "blockedBy": [
      "用户首页视觉与三打法实战平衡尚未确认；1053场模拟完赛不代表真人验收。",
      "Safari直连既有自动化握手失败仍保留；本轮未重测直连。"
    ],
    "documents": [
      "docs/tasks/BAL-1.md"
    ],
    "checkpoint": "docs/BAL-1-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "v1.8.0 已发布：main 合并提交 45a5d86，标签 v1.8.0；线上 Pages 0482fefd67cdc881／Vercel 4c377c8c35725c4c，均显示正式版 1.8.0。人物工作区预览仍在 3040，未验收人物实验未合并。"
  },
  "readNext": [
    "docs/tasks/BAL-1.md",
    "docs/BAL-1-CHECKPOINT.md"
  ],
  "links": [
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
    "taskId": "BAL-1",
    "branch": "fix/BAL-1-coach-home",
    "baselineHead": "7cf2f17cc9aa04cbe3968542c3742d465407d10a",
    "taskFile": "docs/tasks/BAL-1.md",
    "worktree": "/Users/xindong/Documents/开拍rally/.cindy-worktrees/bal-1-coach-home",
    "phase": "待用户验收",
    "stopReason": "资源平衡与首页收紧候选已实现并核验，独立分支保留；未上线。",
    "nextAction": "用户查看3053候选：首页布局和三陪练实战手感；确认后再准备本批发布。",
    "checkpoint": "docs/BAL-1-CHECKPOINT.md",
    "validation": "691/691测试；1053/1053模拟完成，0超时；Chromium/WebKit四尺寸与三陪练开打通过；最终构建e34b00e5eb76cfeb，85资源逐字节一致。",
    "scopeBoundary": "本地候选，不上线，不递增游戏版本；疲劳惩罚、低体力杀球机会、双方确认开赛保持。Safari真机直连及用户玩法／视觉待验收。"
  },
  "publication": "v1.8.0 已上线：Pages 0482fefd67cdc881、Vercel 4c377c8c35725c4c，两处均由 main 提交 45a5d86 构建，标签 v1.8.0。"
}
-->

BAL-1候选预览3053；3051为上一入口候选，3040为独立人物任务。生产站点未改。
