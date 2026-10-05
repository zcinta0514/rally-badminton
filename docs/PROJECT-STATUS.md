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
    "title": "AI-1：陪练体力、恢复与三打法检查",
    "scope": "三种陪练共用恢复机制；新增独立陪练选择、九对阵分布与整体QA。候选未上线，力量型高压资源失衡已查证但未调参。",
    "nextAction": "用户查看分布并体验三陪练，确定力量型资源平衡目标；必要调整和玩法验收后再准备发布。",
    "blockedBy": [
      "力量型高手高压资源平衡未通过：代表场景70.6%回合时间低于10%、24.4%零体力；参数未调整。",
      "用户玩法／真机验收尚未记录，测试完赛不代表打法平衡通过。"
    ],
    "documents": [
      "docs/tasks/AI-1.md"
    ],
    "checkpoint": "docs/AI-1-COACH-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "v1.8.0 已发布：main 合并提交 45a5d86，标签 v1.8.0；线上 Pages 0482fefd67cdc881／Vercel 4c377c8c35725c4c，均显示正式版 1.8.0。人物工作区预览仍在 3040，未验收人物实验未合并。"
  },
  "readNext": [
    "docs/tasks/AI-1.md",
    "docs/AI-1-COACH-CHECKPOINT.md"
  ],
  "links": [
    "docs/tasks/AI-1.md",
    "docs/AI-1-COACH-CHECKPOINT.md",
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
    "stopReason": "恢复共享三角色且九对阵入口完成；682项测试、两浏览器18场入口核验、1053场模拟结束；力量型高压资源失衡未调参。",
    "nextAction": "用户查看分布并体验三陪练，确定力量型资源平衡目标；必要调整和玩法验收后再准备发布。",
    "checkpoint": "docs/AI-1-COACH-CHECKPOINT.md",
    "validation": "682/682测试；构建194a0997406c1e75；两浏览器18个入口与资源通过；1053场模拟均结束（一个标准赛案例延长观察）。见AI-1-COACH-QA.json。",
    "scopeBoundary": "用户授权检查三种陪练恢复／体力，并选择独立陪练打法。本轮新增入口与诊断，未授权发布，不预定版本；角色平衡参数未擅改，不能把已发现失衡标为通过。"
  },
  "publication": "v1.8.0 已上线：Pages 0482fefd67cdc881、Vercel 4c377c8c35725c4c，两处均由 main 提交 45a5d86 构建，标签 v1.8.0。"
}
-->
