# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-11-09",
  "baseline": {
    "branch": "main",
    "head": "fec9ff39141b0c95d8d23d58c65abbb054ad5196",
    "originMain": "fec9ff39141b0c95d8d23d58c65abbb054ad5196",
    "releaseTag": "v1.16.0"
  },
  "activeTask": {
    "title": "NET-2：球网反馈已接入并发布",
    "scope": "网布/网带碰撞、减速过网或回落、局部波动叠加、声音同步与网络显示",
    "nextAction": "本轮接入完成；后续依据用户实际游戏反馈调整，实体手机长期性能由用户自行测试。",
    "blockedBy": [],
    "documents": [
      "docs/tasks/NET-2.md"
    ],
    "checkpoint": "docs/NET-2-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "PR #22已合并，v1.16.0已发布；Pages和Vercel资源及真实浏览器均已核验。",
    "localPreview": {
      "task": "NET-2",
      "url": "http://127.0.0.1:3276/src/net-review.html",
      "lanUrl": "http://172.27.68.240:3276/src/net-review.html",
      "worktree": "/Users/xindong/Documents/开拍rally-net-2-contact",
      "verifiedOn": "2026-11-09",
      "buildId": "6e60658b89a2f975",
      "limitations": "布料拟音非球网实录；实体手机长期性能由用户自行测试。"
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
    "branch": "docs/NET-2-release-result",
    "baselineHead": "fec9ff39141b0c95d8d23d58c65abbb054ad5196",
    "taskFile": "docs/tasks/NET-2.md",
    "worktree": "/Users/xindong/Documents/开拍rally-net-2-contact",
    "phase": "1.16.0正式发布已核验，补齐结果文档",
    "stopReason": "功能接入与两处生产核验完成，保留预览及证据。",
    "nextAction": "本轮接入完成；后续依据用户实际游戏反馈调整，实体手机长期性能由用户自行测试。",
    "checkpoint": "docs/NET-2-CHECKPOINT.md",
    "validation": "781/781；PR与main Node22/24构建测试通过；两站14项关键资源一致、各4场景与普通比赛实跑通过；Pages旧缓存自动迁移至256d1cbe0ca280d1，Vercel 6e60658b89a2f975。",
    "scopeBoundary": "用户2026-11-09确认接入，执行本功能PR、合并及自动发布；原人物在制成果保留。"
  },
  "publication": "已合并PR #22，源码fec9ff39，标签及Release v1.16.0；Pages 256d1cbe0ca280d1 / Vercel 6e60658b89a2f975，已实读。"
}
-->


## 2026-11-08：NET-2 本地候选

以联网核验的最新主线 e96ff90f 建立独立工作目录。原人物任务及未提交成果原样保留。详见任务卡与 NET-2-CHECKPOINT；当前以实际测试/服务证据为准。

2026-11-08 开发期间主线合入 HELL-2（e1b3d2cf，v1.14.0），本任务完整整合该更新，保留新版扑救/人机、界面与发布信息。整合前的检查不能代替整合后结果。

同日主线又合入SMASH-1（a8c4a8f2，v1.15.0），本分支继承最新杀球、关节稳定与正式入口更新。网的代码不替换新人物/杀球模块。

最终纳入83d3eecc的1.15.0发布结果文档；该次整合仅文档变化，运行资源与最终构建不变。


2026-11-09用户预览后确认接入，进入1.16.0发布准备；当日fetch核对主线仍为83d3eecc。


2026-11-09 NET-2接入完成并发布1.16.0，生产核验证据见NET-2-CHECKPOINT。发布结果文档单独回写，不改变运行资源。
