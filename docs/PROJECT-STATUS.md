# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-11-08",
  "baseline": {
    "branch": "main",
    "head": "83d3eecc3bac8b366d684fdf5bbe6085e617f490",
    "originMain": "83d3eecc3bac8b366d684fdf5bbe6085e617f490",
    "releaseTag": "v1.15.0"
  },
  "activeTask": {
    "title": "NET-2：所有实际触网的声音、波动与球网互动",
    "scope": "网布/网带碰撞、减速过网或回落、局部波动叠加、声音同步与网络显示",
    "nextAction": "用户在触网预览比较轻重触网声音与波动、擦网两种球路、连续碰撞及暂停换边，再做正常对局和实体手机体验验收。",
    "blockedBy": [
      "用户视听、玩法及实体手机性能尚未验收；本地机器检查不代替这些验收。"
    ],
    "documents": [
      "docs/tasks/NET-2.md"
    ],
    "checkpoint": "docs/NET-2-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "继承最新主线83d3eecc及1.15.0；NET-2仅本地候选，未推送或发布。",
    "localPreview": {
      "task": "NET-2",
      "url": "http://127.0.0.1:3276/src/net-review.html",
      "lanUrl": "http://192.168.1.105:3276/src/net-review.html",
      "worktree": "/Users/xindong/Documents/开拍rally-net-2-contact",
      "verifiedOn": "2026-11-08",
      "buildId": "cc8e6ec8270d80cc",
      "limitations": "布料拟音非球网实录；用户视听、玩法与实体手机性能未验收。"
    }
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
    "baselineHead": "83d3eecc3bac8b366d684fdf5bbe6085e617f490",
    "taskFile": "docs/tasks/NET-2.md",
    "worktree": "/Users/xindong/Documents/开拍rally-net-2-contact",
    "phase": "本地候选已验证，等待用户视听与玩法验收",
    "stopReason": "已完成本轮实现与可执行验证，保留预览供用户检查。",
    "nextAction": "用户在触网预览比较轻重触网声音与波动、擦网两种球路、连续碰撞及暂停换边，再做正常对局和实体手机体验验收。",
    "checkpoint": "docs/NET-2-CHECKPOINT.md",
    "validation": "781/781；构建cc8e6ec8270d80cc，107资源逐一匹配；两侧五场景实跑；最新主线整合后4例及普通比赛入口复验；最终手机尺寸折叠与重播通过。用户验收未完成。",
    "scopeBoundary": "用户已确认所有实际触网，同时调整球碰网后的运动；本地开发预览，不发布。"
  },
  "publication": "本轮球网未推送、未开PR、未合并到main、未部署；继承主线1.15.0，不另定版本。"
}
-->


## 2026-11-08：NET-2 本地候选

以联网核验的最新主线 e96ff90f 建立独立工作目录。原人物任务及未提交成果原样保留。详见任务卡与 NET-2-CHECKPOINT；当前以实际测试/服务证据为准。

2026-11-08 开发期间主线合入 HELL-2（e1b3d2cf，v1.14.0），本任务完整整合该更新，保留新版扑救/人机、界面与发布信息。整合前的检查不能代替整合后结果。

同日主线又合入SMASH-1（a8c4a8f2，v1.15.0），本分支继承最新杀球、关节稳定与正式入口更新。网的代码不替换新人物/杀球模块。

最终纳入83d3eecc的1.15.0发布结果文档；该次整合仅文档变化，运行资源与最终构建不变。
