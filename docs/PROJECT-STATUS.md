# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-11-08",
  "baseline": {
    "branch": "main",
    "head": "a8c4a8f25e014d6dad7072daa3568886819dfab9",
    "originMain": "a8c4a8f25e014d6dad7072daa3568886819dfab9",
    "releaseTag": "v1.15.0"
  },
  "activeTask": {
    "title": "NET-2：所有实际触网的声音、波动与球网互动",
    "scope": "网布/网带碰撞、减速过网或回落、局部波动叠加、声音同步与网络显示",
    "nextAction": "完成实际浏览器五组固定来球场景、完整回归与构建；交用户视听和玩法验收",
    "blockedBy": [],
    "documents": [
      "docs/tasks/NET-2.md"
    ],
    "checkpoint": "docs/NET-2-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "继承最新主线a8c4a8f2与1.15.0；NET-2仅本地候选，未推送或发布。"
  },
  "readNext": [
    "docs/tasks/NET-2.md",
    "docs/NET-2-CHECKPOINT.md"
  ],
  "links": [
    "docs/tasks/UI-2.md",
    "docs/UI-2-CHECKPOINT.md",
    "docs/tasks/HELL-2.md",
    "docs/HELL-2-CHECKPOINT.md",
    "docs/tasks/SMASH-1.md",
    "docs/SMASH-1-CHECKPOINT.md"
  ],
  "handoff": {
    "taskId": "NET-2",
    "branch": "feat/NET-2-contact",
    "baselineHead": "a8c4a8f25e014d6dad7072daa3568886819dfab9",
    "taskFile": "docs/tasks/NET-2.md",
    "worktree": "/Users/xindong/Documents/开拍rally-net-2-contact",
    "phase": "整合最新主线SMASH-1，等待最终运行核验",
    "stopReason": "进行中",
    "nextAction": "完成实际浏览器五组固定来球场景、完整回归与构建；交用户视听和玩法验收",
    "checkpoint": "docs/NET-2-CHECKPOINT.md",
    "validation": "整合前766/766通过，旧构建浏览器两侧10场景通过，主入口受新手引导遮挡未完成；整合后须重新验证。",
    "scopeBoundary": "用户已确认所有实际触网，同时调整球碰网后的运动；本地开发预览，不发布。"
  },
  "publication": "本轮球网未推送、未开PR、未合并到main、未部署；继承主线1.15.0，不另定版本。"
}
-->


## 2026-11-08：NET-2 本地候选

以联网核验的最新主线 e96ff90f 建立独立工作目录。原人物任务及未提交成果原样保留。详见任务卡与 NET-2-CHECKPOINT；当前以实际测试/服务证据为准。

2026-11-08 开发期间主线合入 HELL-2（e1b3d2cf，v1.14.0），本任务完整整合该更新，保留新版扑救/人机、界面与发布信息。整合前的检查不能代替整合后结果。

同日主线又合入SMASH-1（a8c4a8f2，v1.15.0），本分支继承最新杀球、关节稳定与正式入口更新。网的代码不替换新人物/杀球模块。
