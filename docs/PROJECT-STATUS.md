# RALLY 项目当前状态

<!-- project-brief
{
  "statusVersion": 1,
  "asOf": "2026-11-08",
  "baseline": {
    "branch": "main",
    "head": "e1b3d2cf39e1e081edcbba65f89311ccea915ca6",
    "originMain": "e1b3d2cf39e1e081edcbba65f89311ccea915ca6",
    "releaseTag": "v1.14.0"
  },
  "activeTask": {
    "title": "SMASH-1：杀球动作通过检查，准备合并",
    "scope": "保留R3肘领先与髋胸错峰，修复远触点肘腕翻转、引拍停顿及离地脚部补偿突变；修正手臂误绑定头部造成的腕部尖刺。",
    "nextAction": "提交PR并核对CI，按用户授权合并main，验证Pages/Vercel生产资源与实际页面。",
    "blockedBy": [],
    "documents": [
      "docs/tasks/SMASH-1.md"
    ],
    "checkpoint": "docs/SMASH-1-CHECKPOINT.md"
  },
  "runtime": {
    "formalAsset": "src/models/athlete.glb",
    "releaseState": "1.15.0发布准备；用户已授权检查通过后合并。",
    "localPreview": {
      "task": "SMASH-1",
      "url": "http://127.0.0.1:3257/?preview=smash&revision=release-1.15.0",
      "worktree": "/Users/xindong/Documents/开拍rally-smash-motion",
      "verifiedOn": "2026-11-08",
      "buildId": "218fbb52f2f88429",
      "limitations": "正式人物、最终构建、原速和侧面慢放均已核验；无实体手机或完整表面碰撞审计。"
    }
  },
  "readNext": [
    "docs/tasks/SMASH-1.md",
    "docs/SMASH-1-CHECKPOINT.md"
  ],
  "links": [
    "docs/tasks/UI-2.md",
    "docs/UI-2-CHECKPOINT.md",
    "docs/tasks/HELL-2.md",
    "docs/HELL-2-CHECKPOINT.md"
  ],
  "handoff": {
    "taskId": "SMASH-1",
    "branch": "feat/SMASH-1-natural-motion",
    "baselineHead": "e1b3d2cf39e1e081edcbba65f89311ccea915ca6",
    "taskFile": "docs/tasks/SMASH-1.md",
    "worktree": "/Users/xindong/Documents/开拍rally-smash-motion",
    "phase": "最终验证通过，提交合并",
    "stopReason": "进行中；等待PR检查与主线发布核验。",
    "nextAction": "提交PR并核对CI，按用户授权合并main，验证Pages/Vercel生产资源与实际页面。",
    "checkpoint": "docs/SMASH-1-CHECKPOINT.md",
    "validation": "767/767完整测试，构建218fbb52f2f88429；9180组非杀球姿态及过渡与最新e1b3d2cf相同；11项服务资源一致，正式人物ready，原速/侧面慢放已检查，最新扑救与蒙皮回归通过。",
    "scopeBoundary": "用户2026-11-08授权继续优化杀球、检查关节，测试通过后合并main；已核实main会自动发布。"
  },
  "publication": "本地整合提交f90fc240继承main e1b3d2cf（v1.14.0）；1.15.0发布准备，尚未推送/合并。"
}
-->
