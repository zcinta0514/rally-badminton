# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-11-09",
  "baseline": {
    "branch": "main",
    "head": "79fa35c326756e95e25cfe8d5c1e38c7fa3872a8",
    "originMain": "79fa35c326756e95e25cfe8d5c1e38c7fa3872a8",
    "releaseTag": "v1.16.0"
  },
  "activeTask": {
    "title": "FLOW-1：完整工作流与跨电脑接续备份",
    "scope": "上传协作规则、开发计划和恢复工具，保存全部有效工作目录及制作源。",
    "nextAction": "完成整包回读和上传核验，按跨电脑指南恢复；人物任务仍保留原有未验收边界。",
    "blockedBy": []
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
    "docs/tasks/FLOW-1.md",
    "docs/FLOW-1-CHECKPOINT.md",
    "docs/CROSS-COMPUTER.md"
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
    "taskId": "FLOW-1",
    "taskFile": "docs/tasks/FLOW-1.md",
    "checkpoint": "docs/FLOW-1-CHECKPOINT.md",
    "worktree": ".",
    "branch": "chore/workflow-portable",
    "phase": "跨电脑工具已建立，完整资源待打包、回读和上传核验",
    "stopReason": "本轮进行中",
    "validation": "检查结果与上传回执见 FLOW-1-CHECKPOINT；未执行的检查不得标为通过。",
    "scopeBoundary": "用户已授权全部工作流及大型制作资源上传；不合并人物实验、不改游戏版本、不部署生产。"
  },
  "publication": "正式版本保持 v1.16.0；本轮使用独立流程分支与专用资料快照 tag。"
}
-->


## 2026-11-08：NET-2 本地候选

以联网核验的最新主线 e96ff90f 建立独立工作目录。原人物任务及未提交成果原样保留。详见任务卡与 NET-2-CHECKPOINT；当前以实际测试/服务证据为准。

2026-11-08 开发期间主线合入 HELL-2（e1b3d2cf，v1.14.0），本任务完整整合该更新，保留新版扑救/人机、界面与发布信息。整合前的检查不能代替整合后结果。

同日主线又合入SMASH-1（a8c4a8f2，v1.15.0），本分支继承最新杀球、关节稳定与正式入口更新。网的代码不替换新人物/杀球模块。

最终纳入83d3eecc的1.15.0发布结果文档；该次整合仅文档变化，运行资源与最终构建不变。


2026-11-09用户预览后确认接入，进入1.16.0发布准备；当日fetch核对主线仍为83d3eecc。


2026-11-09 NET-2接入完成并发布1.16.0，生产核验证据见NET-2-CHECKPOINT。发布结果文档单独回写，不改变运行资源。
