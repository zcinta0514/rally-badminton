# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-11-09",
  "baseline": {
    "branch": "main",
    "head": "83d3eecc3bac8b366d684fdf5bbe6085e617f490",
    "originMain": "83d3eecc3bac8b366d684fdf5bbe6085e617f490",
    "releaseTag": "v1.15.0"
  },
  "activeTask": {
    "title": "NET-2：所有实际触网的声音、波动与球网互动",
    "scope": "网布/网带碰撞、减速过网或回落、局部波动叠加、声音同步与网络显示",
    "nextAction": "推送已验收分支，创建PR并在CI通过后合并，核验Pages与Vercel实际加载1.16.0。",
    "blockedBy": [],
    "documents": [
      "docs/tasks/NET-2.md"
    ],
    "checkpoint": "docs/NET-2-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "NET-2已获用户预览确认，准备1.16.0发布；未合并、未部署。",
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
    "branch": "feat/NET-2-contact",
    "baselineHead": "83d3eecc3bac8b366d684fdf5bbe6085e617f490",
    "taskFile": "docs/tasks/NET-2.md",
    "worktree": "/Users/xindong/Documents/开拍rally-net-2-contact",
    "phase": "最终发布候选通过，待PR与部署",
    "stopReason": "正在执行接入与发布",
    "nextAction": "推送已验收分支，创建PR并在CI通过后合并，核验Pages与Vercel实际加载1.16.0。",
    "checkpoint": "docs/NET-2-CHECKPOINT.md",
    "validation": "最终781/781，root 6e60658b89a2f975 / Pages 256d1cbe0ca280d1；服务108项一致；独立Chromium两侧10场景及普通对局通过；用户预览确认接入。",
    "scopeBoundary": "用户2026-11-09确认接入，执行本功能PR、合并及自动发布；原人物在制成果保留。"
  },
  "publication": "准备1.16.0，未推送、未开PR、未合并或部署。"
}
-->


## 2026-11-08：NET-2 本地候选

以联网核验的最新主线 e96ff90f 建立独立工作目录。原人物任务及未提交成果原样保留。详见任务卡与 NET-2-CHECKPOINT；当前以实际测试/服务证据为准。

2026-11-08 开发期间主线合入 HELL-2（e1b3d2cf，v1.14.0），本任务完整整合该更新，保留新版扑救/人机、界面与发布信息。整合前的检查不能代替整合后结果。

同日主线又合入SMASH-1（a8c4a8f2，v1.15.0），本分支继承最新杀球、关节稳定与正式入口更新。网的代码不替换新人物/杀球模块。

最终纳入83d3eecc的1.15.0发布结果文档；该次整合仅文档变化，运行资源与最终构建不变。


2026-11-09用户预览后确认接入，进入1.16.0发布准备；当日fetch核对主线仍为83d3eecc。
